#!/usr/bin/env python3
# DJ Training - instant DRAFT estimates for pending meals, from a LOCAL model on the RTX 3070.
#
# The FINAL count is still autofill-food.py (headless Claude, nightly 04:30 + "Count now"). This worker
# only gives DJ a number to look at within a minute of logging a meal. A draft is NEVER a count:
#   - it lives in draft-state.json (written only here) and on the phone as entry.draft;
#   - it never clears `pending`, never enters counted totals / verdict / Sheet / CSV macro columns;
#   - autofill-food.py never sees it (the final stays unanchored, so draft-vs-final is an honest metric).
#
# Trigger: serve.py spawns this after a /push-logs snapshot that holds a pending meal needing a draft
# (food_common.draft_work). If a run is already going, serve.py touches draft.poke instead; the running
# worker re-scans before it exits. No timers, no polling on the PC side.
#
# Model: Ollama instance on 127.0.0.1:11435 that server-watchdog.py runs pinned to the 3070 (never the
# 3090). Bake-off 2026-10-18 (78 real meals vs Claude): ~11% median kcal error on text, 17-22% on photos
# (runs HIGH on photos), protein within 2-4 g; outliers where it answered a flat 1000 when unsure - hence
# the itemised answer + `unsure` flag + consistency checks below. A failed check is a SKIP with a reason
# the app shows ("draft: unsure"), never a number.
#
# Usage: draft-food.py [APP_DIR] [--trigger=push|manual]
# Env overrides (tests/tuning): DRAFT_HOST, DRAFT_MODEL. Pause with a draft.off file (the watchdog then
# also stops (re)starting the 3070 Ollama instance, giving its RAM back).

import base64, io, json, os, sys, time, urllib.request, urllib.error
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from food_common import (MACROS, now_iso, atomic_write, read_json, RunLock, load_nutrients, valid_num,
                         pending_food_entries, draft_inputs, draft_work)

ARGS     = [a for a in sys.argv[1:] if not a.startswith('--')]
FLAGS    = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--') and '=' in a)
APP_DIR  = ARGS[0] if ARGS else os.path.dirname(os.path.abspath(__file__))
TRIGGER  = FLAGS.get('trigger', 'push')
DEVICE   = os.path.join(APP_DIR, 'device-logs.json')
PREV     = os.path.join(APP_DIR, 'device-logs.prev.json')
SHARED   = os.path.join(APP_DIR, 'shared-log.json')
INDEX    = os.path.join(APP_DIR, 'index.html')
DEFAULTS = os.path.join(APP_DIR, 'food-defaults.md')
STATE    = os.path.join(APP_DIR, 'draft-state.json')
LOG      = os.path.join(APP_DIR, 'draft.log')
LOCK     = os.path.join(APP_DIR, 'draft.lock')
POKE     = os.path.join(APP_DIR, 'draft.poke')
OFF      = os.path.join(APP_DIR, 'draft.off')

DRAFT_HOST        = os.environ.get('DRAFT_HOST', 'http://127.0.0.1:11435')
DRAFT_MODEL       = os.environ.get('DRAFT_MODEL', 'qwen3.8-27b-local')
DRAFT_MAX_SIDE    = 896     # px; a 1600 px photo is ~12k vision tokens and overflows the context
DRAFT_NUM_CTX     = 8192
DRAFT_NUM_PREDICT = 900
DRAFT_HTTP_TIMEOUT_S = 300  # covers a cold 17 GB load (Ollama's own load timeout is 5 min)
ITEMS_TOL   = (50, 0.10)    # sum of items may differ from the total by max(50 kcal, 10%)
ATWATER_TOL = 0.25          # 4p+4c+9f may differ from kcal by 25% (fibre, alcohol, rounding)
PRUNE_DAYS  = 14
LOCK_STALE_S = DRAFT_HTTP_TIMEOUT_S + 120   # refreshed after every meal, so a long batch never looks stale
TRANSIENT = {'ollama-down', 'timeout', 'http-error'}
OK_RESULTS = ('drafted', 'empty', 'nothing-ready', 'nothing-usable')   # mirrors DRAFT_OK in index.html
T0 = time.time()


def log(msg):
    try:
        with open(LOG, 'a', encoding='utf-8') as f:
            f.write(now_iso() + ' [' + TRIGGER + '] ' + msg + '\n')
    except OSError:
        pass


LOCKER = RunLock(LOCK, LOCK_STALE_S, TRIGGER, log)


# ---------- prompt + model ----------

def build_prompt(defaults, nutrients, date, entry, has_photo):
    # Deliberately SHORT on the output side: the 27B generates only ~2-3 tokens/s split across the
    # 3070 + CPU, so every output token is latency DJ waits through. Items carry name+kcal only (enough
    # for the sum check); nutrients (sugar/fiber/satf) are left to the final count.
    keys = list(MACROS)
    desc = (entry.get('n') or '').strip()
    what = ('DJ typed: %s\n' % json.dumps(desc, ensure_ascii=False) if desc else 'DJ typed nothing.\n') + \
           ('The photo shows the meal - use it to judge HOW MUCH.\n' if has_photo else 'There is no photo.\n')
    return (
        "You estimate nutrition for ONE meal DJ ate (food day %s).\n\n"
        "## DJ's standing defaults (authoritative - apply them exactly)\n%s\n\n"
        "## The meal\n%s\n"
        "## How to answer\n"
        "- List every food/drink as its own item with an amount you can see or that DJ stated, then add them up.\n"
        "- Judge portions from the plate, cup and hand sizes in the photo. Count only what is listed or clearly eaten.\n"
        "- If you cannot tell what the food is or roughly how much there is, set \"unsure\": true. "
        "Never output a round placeholder number instead of an estimate.\n"
        "- \"basis\": at most 8 words on how you sized it.\n"
        "- Reply with ONLY this JSON object, numbers in kcal and grams:\n"
        "{\"items\":[{\"name\":\"...\",\"kcal\":0}],%s,\"unsure\":false,\"basis\":\"...\"}\n"
        % (date, defaults, what, ','.join('"%s":0' % k for k in keys))
    )


def encode_photo(path):
    from PIL import Image   # only photo meals need Pillow
    im = Image.open(path)
    im = im.convert('RGB')
    im.thumbnail((DRAFT_MAX_SIDE, DRAFT_MAX_SIDE))
    buf = io.BytesIO()
    im.save(buf, 'JPEG', quality=85)
    return base64.b64encode(buf.getvalue()).decode(), im.size


def _post(path, body, timeout):
    req = urllib.request.Request(DRAFT_HOST + path, json.dumps(body).encode(), {'Content-Type': 'application/json'})
    return json.load(urllib.request.urlopen(req, timeout=timeout))


def parse_answer(txt):
    """The model's JSON object (it may wrap it in prose/fences). None if there is none."""
    txt = (txt or '').strip()
    for cand in (txt, txt[txt.find('{'):txt.rfind('}') + 1] if '{' in txt else ''):
        try:
            obj = json.loads(cand)
            if isinstance(obj, dict):
                return obj
        except ValueError:
            pass
    return None


def ask_model(prompt, img_b64=None):
    """-> (obj, reason, ms). reason is a skip reason when obj is None."""
    msg = {'role': 'user', 'content': prompt}
    if img_b64:
        msg['images'] = [img_b64]
    body = {'model': DRAFT_MODEL, 'messages': [msg], 'stream': False, 'think': False,
            'options': {'temperature': 0, 'num_ctx': DRAFT_NUM_CTX, 'num_predict': DRAFT_NUM_PREDICT}}
    t = time.time()
    try:
        r = _post('/api/chat', body, DRAFT_HTTP_TIMEOUT_S)
    except urllib.error.HTTPError as ex:
        return None, 'http-error', {'total': round((time.time() - t) * 1000)}
    except urllib.error.URLError as ex:
        refused = isinstance(ex.reason, ConnectionRefusedError) or 'refused' in str(ex.reason).lower()
        return None, 'ollama-down' if refused else 'http-error', {'total': round((time.time() - t) * 1000)}
    except (TimeoutError, OSError):
        return None, 'timeout', {'total': round((time.time() - t) * 1000)}
    ms = {'total': round((time.time() - t) * 1000), 'load': round((r.get('load_duration') or 0) / 1e6),
          'eval': round((r.get('eval_duration') or 0) / 1e6), 'tokens': r.get('eval_count')}
    obj = parse_answer((r.get('message') or {}).get('content'))
    return (obj, None if obj is not None else 'parse-error', ms)


def validate_draft(obj, nutrients):
    """Pure. -> (vals, None) or (None, reason). Errors never become data: no clamping, no scaling."""
    if not isinstance(obj, dict):
        return None, 'parse-error'
    if obj.get('unsure') is True:
        return None, 'estimator-unsure'
    if not all(valid_num(obj.get(k)) for k in MACROS) or obj['kcal'] <= 0:
        return None, 'invalid-numbers'
    k, p, c, f = (float(obj[x]) for x in MACROS)
    items = obj.get('items')
    if not isinstance(items, list) or not items or not all(isinstance(i, dict) and valid_num(i.get('kcal')) for i in items):
        return None, 'inconsistent'
    if abs(sum(float(i['kcal']) for i in items) - k) > max(ITEMS_TOL[0], ITEMS_TOL[1] * k):
        return None, 'inconsistent'
    if abs(4 * p + 4 * c + 9 * f - k) > ATWATER_TOL * k:
        return None, 'inconsistent'
    vals = {x: round(float(obj[x]), 1) for x in MACROS}
    for x in nutrients:
        if valid_num(obj.get(x)):
            vals[x] = round(float(obj[x]), 1)
    return vals, None


def warm_model():
    """Load the model ahead of a queued photo so the draft is fast when the upload lands."""
    try:
        if json.load(urllib.request.urlopen(DRAFT_HOST + '/api/ps', timeout=10)).get('models'):
            return True
        _post('/api/generate', {'model': DRAFT_MODEL, 'prompt': '', 'stream': False}, DRAFT_HTTP_TIMEOUT_S)
        return True
    except Exception as ex:
        log('warm failed: %r' % ex)
        return False


# ---------- state ----------

def load_state():
    st = read_json(STATE, retries=1)
    if not isinstance(st, dict) or st.get('v') != 1:
        st = {'v': 1, 'drafts': {}, 'skipped': []}
    st.setdefault('drafts', {}); st.setdefault('skipped', [])
    return st


def save_state(st, result, error=None, snapshot_at=None, warmed=False):
    st.update({'v': 1, 'lastRun': now_iso(), 'startedBy': TRIGGER, 'lastResult': result, 'error': error,
               'host': DRAFT_HOST, 'model': DRAFT_MODEL, 'durationS': round(time.time() - T0),
               'snapshotAt': snapshot_at, 'warmed': warmed})
    if not atomic_write(STATE, st, prefix='.draft-'):
        log('ERROR: failed to write draft-state.json')
        return False
    return True


def prune(st, ls_pending_ids):
    cutoff = (datetime.now(timezone.utc) - timedelta(days=PRUNE_DAYS)).strftime('%Y-%m-%dT%H:%M:%SZ')
    st['drafts'] = {i: d for i, d in st['drafts'].items()
                    if i in ls_pending_ids and isinstance(d, dict) and str(d.get('at', '')) >= cutoff}
    st['skipped'] = [s for s in st['skipped'] if isinstance(s, dict) and s.get('id') in ls_pending_ids
                     and str(s.get('at', '')) >= cutoff]


def set_skip(st, entry, reason):
    st['skipped'] = [s for s in st['skipped'] if s.get('id') != entry['id']]
    st['skipped'].append({'id': entry['id'], 'reason': reason, 'of': draft_inputs(entry),
                          'transient': reason in TRANSIENT, 'at': now_iso()})


# ---------- main ----------

def load_snapshot():
    dev = read_json(DEVICE)
    if not isinstance(dev, dict) or 'ls' not in dev:
        dev = read_json(PREV)
    return dev if isinstance(dev, dict) and 'ls' in dev else None


def one_pass(st, defaults, nutrients):
    """Draft everything ready in the current snapshot. Returns (result, error, snapshot_at, warmed)."""
    dev = load_snapshot()
    if not dev:
        return 'device-error', 'device-logs unreadable', None, False
    ls, snapshot_at = dev.get('ls') or {}, dev.get('pushedAt')
    pend = pending_food_entries(ls)
    prune(st, {e['id'] for _, e in pend})

    shared = read_json(SHARED) or {}
    final = {x.get('target') for x in shared.get('entries', [])
             if isinstance(x, dict) and x.get('type') == 'food-update' and all(k in x for k in MACROS)}

    if TRIGGER == 'manual':   # a manual run retries non-transient skips too
        st['skipped'] = [s for s in st['skipped'] if s.get('transient')]
    ready, waiting = draft_work(ls, st)
    ready = [(d, e) for d, e in ready if e['id'] not in final]   # Claude already answered; phone not synced yet
    warmed = False
    if not ready:
        if waiting:
            warmed = warm_model()
            return 'nothing-ready', None, snapshot_at, warmed
        return 'empty', None, snapshot_at, False

    ready.sort(key=lambda de: str(de[1].get('at') or ''), reverse=True)   # the meal DJ is looking at first
    drafted = 0
    for date, e in ready:
        LOCKER.refresh()
        img, size, photo = None, None, e.get('photo') or ''
        if photo:
            full = os.path.join(APP_DIR, photo.replace('/', os.sep))
            if not os.path.isfile(full):
                set_skip(st, e, 'photo-missing'); save_state(st, 'running', snapshot_at=snapshot_at); continue
            try:
                img, size = encode_photo(full)
            except Exception as ex:
                log('ERROR: photo decode %s: %r' % (photo, ex))
                set_skip(st, e, 'photo-unreadable'); save_state(st, 'running', snapshot_at=snapshot_at); continue
        obj, reason, ms = ask_model(build_prompt(defaults, nutrients, date, e, bool(img)), img)
        vals = None
        if obj is not None:
            vals, reason = validate_draft(obj, nutrients)
        if vals is None:
            set_skip(st, e, reason)
            log('skip %s %s -> %s (%.1fs)%s' % (e['id'], json.dumps(e.get('n') or '', ensure_ascii=False), reason,
                ms.get('total', 0) / 1000, ' answer=' + json.dumps(obj, ensure_ascii=False)[:300] if obj else ''))
            if reason in TRANSIENT:
                save_state(st, reason, error='local model %s at %s' % (reason, DRAFT_HOST), snapshot_at=snapshot_at)
                return reason, 'local model %s at %s' % (reason, DRAFT_HOST), snapshot_at, False
            save_state(st, 'running', snapshot_at=snapshot_at)
            continue
        src = 'both' if (img and (e.get('n') or '').strip()) else ('photo' if img else 'text')
        st['drafts'][e['id']] = dict(vals, date=date, of=draft_inputs(e), src=src, model=DRAFT_MODEL, at=now_iso(),
                                     basis=str(obj.get('basis') or '')[:120], ms=ms)
        st['skipped'] = [s for s in st['skipped'] if s.get('id') != e['id']]
        drafted += 1
        log('drafted %s %s src=%s -> %g/%g/%g/%g (%.1fs, load %.1fs%s)' % (
            e['id'], json.dumps(e.get('n') or '', ensure_ascii=False), src, vals['kcal'], vals['p'], vals['c'], vals['f'],
            ms['total'] / 1000, ms.get('load', 0) / 1000, ', sent %dx%d' % size if size else ''))
        save_state(st, 'running', snapshot_at=snapshot_at)   # progressive: a crash loses nothing
    return ('drafted' if drafted else 'nothing-usable'), None, snapshot_at, warmed


def main():
    if os.path.exists(OFF):
        return 0
    nutrients = load_nutrients(INDEX)
    st = load_state()
    if not nutrients:
        log('ERROR: NUTRIENTS config not found in index.html')
        save_state(st, 'config-error', error='NUTRIENTS not found in index.html'); return 1
    try:
        with open(DEFAULTS, 'r', encoding='utf-8') as f:
            defaults = f.read().strip()
    except OSError:
        defaults = ''
    if not defaults:
        log('ERROR: food-defaults.md missing/empty')
        save_state(st, 'config-error', error='food-defaults.md missing'); return 1
    while True:
        try: os.unlink(POKE)
        except OSError: pass
        result, err, snap, warmed = one_pass(st, defaults, nutrients)
        # a run with nothing to do writes nothing - unless it clears an earlier error off the status strip
        if result != 'empty' or err or st.get('lastResult') not in OK_RESULTS:
            save_state(st, result, error=err, snapshot_at=snap, warmed=warmed)
        if err or not os.path.exists(POKE):
            return 1 if err else 0
        log('poke: rescanning')


if __name__ == '__main__':
    if not LOCKER.acquire():
        try:
            open(POKE, 'a').close()   # a run is in flight: ask it to re-scan before it exits
        except OSError:
            pass
        sys.exit(0)
    try:
        sys.exit(main())
    except Exception as ex:   # never let a crash go unlogged
        log('FATAL: %r' % ex)
        try: save_state(load_state(), 'crash', error=repr(ex)[:200])
        except Exception: pass
        sys.exit(1)
    finally:
        LOCKER.release()
