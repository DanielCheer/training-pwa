#!/usr/bin/env python3
# DJ Training - meal-log macro autofill.
#
# Runs once a day at 04:30 (Task Scheduler "DJ Food Autofill", just after FOOD_DAY_ROLL_HOUR in
# index.html) and on demand when DJ taps "Count now" in the app (serve.py POST /request-fill
# spawns this script with --trigger=request). Both paths share one lock (autofill.lock).
#
# Finds every meal DJ logged in the app that is still `pending:true` (text-only, photo, or both,
# across ALL dates), sends them to headless Claude in ONE call together with food-defaults.md, and
# writes each estimate back to shared-log.json as a `food-update` (the phone patches the entry in
# place and clears `pending` on its next sync). Python does ALL file I/O; the model only reads
# photos / looks up restaurant nutrition and returns a JSON array.
#
# Fail-loud contract: an estimator error never becomes data. Entries the model skips or returns
# junk for stay pending, and the reason lands in autofill-state.json (`skipped`), which the app
# shows next to the row. Zero Claude cost on empty runs.
#
# Usage: autofill-food.py [APP_DIR] [--trigger=task|request]
# AUTOFILL_DIR env overrides the app dir (tests); AUTOFILL_MODEL env picks the model (usage knob).
# Pause with an `autofill.off` file in the app dir.

import json, os, re, sys, time, subprocess, shutil
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from food_common import (MACROS, now_iso, atomic_write as _atomic_write, read_json, RunLock,
                         load_nutrients as _load_nutrients, valid_num, pending_food_entries,
                         config_path, defaults_path, load_defaults)

ARGS       = [a for a in sys.argv[1:] if not a.startswith('--')]
FLAGS      = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--') and '=' in a)
APP_DIR    = (ARGS[0] if ARGS else os.environ.get('AUTOFILL_DIR')) or os.path.dirname(os.path.abspath(__file__))
TRIGGER    = FLAGS.get('trigger', 'task')
DEVICE     = os.path.join(APP_DIR, 'device-logs.json')
PREV       = os.path.join(APP_DIR, 'device-logs.prev.json')
SHARED     = os.path.join(APP_DIR, 'shared-log.json')
CONFIG     = config_path(APP_DIR)        # app/config.js: NUTRIENTS
LOG        = os.path.join(APP_DIR, 'autofill.log')
STATE      = os.path.join(APP_DIR, 'autofill-state.json')
LOCK       = os.path.join(APP_DIR, 'autofill.lock')
OFF        = os.path.join(APP_DIR, 'autofill.off')
PRUNE_DAYS = 14
CLAUDE_TIMEOUT = 600
LOCK_STALE_S   = CLAUDE_TIMEOUT + 120   # serve.py reads this file's mtime with the same rule
STALE_SNAPSHOT_H = 24
T0 = time.time()


def log(msg):
    try:
        with open(LOG, 'a', encoding='utf-8') as f:
            f.write(now_iso() + ' [' + TRIGGER + '] ' + msg + '\n')
    except OSError:
        pass


def atomic_write(path, data):
    return _atomic_write(path, data, prefix='.autofill-')


def write_state(result, filled=(), skipped=(), pending=0, snapshot_at=None, error=None):
    """autofill-state.json v2 - read by the app's status strip (sw.js serves it network-only)."""
    atomic_write(STATE, {
        'v': 2, 'lastRun': now_iso(), 'startedBy': TRIGGER, 'lastResult': result,
        'filled': list(filled), 'skipped': list(skipped), 'pending': pending,
        'snapshotAt': snapshot_at, 'durationS': round(time.time() - T0), 'error': error,
    })


LOCKER = RunLock(LOCK, LOCK_STALE_S, TRIGGER, log)


def load_nutrients():
    return _load_nutrients(CONFIG)


def find_claude():
    c = shutil.which('claude')
    if c:
        return c
    guess = os.path.join(os.environ.get('APPDATA', ''), 'npm', 'claude.cmd')
    return guess if os.path.isfile(guess) else None


def build_prompt(defaults, nutrients, items):
    lines = []
    for i, (date, e, full) in enumerate(items, 1):
        lines.append('%d. id: %s | food day: %s | logged at: %s\n   description: %s\n   photo: %s'
                     % (i, e['id'], date, e.get('at') or 'unknown',
                        json.dumps(e.get('n', ''), ensure_ascii=False), full or 'none'))
    keys = list(MACROS) + nutrients
    example = '{' + ','.join('"%s":%s' % (k, v) for k, v in zip(['id'] + keys, ['"f-123"', 930, 70, 52, 50] + [5] * len(nutrients))) + ',"n":"optional cleaned-up name"}'
    return (
        "You are the automated nutrition estimator for DJ's training log. Estimate every meal below.\n\n"
        "## DJ's standing defaults (authoritative - apply them exactly)\n" + defaults + "\n\n"
        "## Meals\n" + "\n".join(lines) + "\n\n"
        "## Rules\n"
        "- The description says WHAT the food is; the photo (when present - open it with the Read tool) says HOW MUCH. "
        "Text-only meals: estimate from the description + the defaults above.\n"
        "- When a restaurant, chain or packaged brand is named, use WebSearch/WebFetch to find its real published "
        "nutrition before estimating. If you estimate instead, put the basis in the name as \"[est.: ...]\".\n"
        "- Estimate: " + ', '.join(keys) + " (kcal, then grams).\n"
        "- \"n\" is optional: return it only to replace DJ's shorthand with a clear name (e.g. expanding \"gom\").\n"
        "- If an item cannot be estimated at all, return {\"id\":\"...\",\"skip\":true,\"reason\":\"short reason\"} - never guess zeros.\n"
        "- Output ONLY a raw JSON array, one object per id listed, no markdown fences, no prose:\n"
        "  [" + example + "]\n"
    )


def run_claude(prompt):
    """One headless call. Returns (text, error). Read-only + web lookups; no shell/edit tools."""
    claude = find_claude()
    if not claude:
        return None, 'claude CLI not found'
    cmd = ['cmd', '/c', claude, '-p',
           '--tools', 'Read,WebSearch,WebFetch',
           '--allowedTools', 'Read,WebSearch,WebFetch',
           '--disallowedTools', 'Bash,Edit,Write,NotebookEdit',
           '--no-session-persistence', '--output-format', 'json']
    if os.environ.get('AUTOFILL_MODEL'):
        cmd += ['--model', os.environ['AUTOFILL_MODEL']]
    try:
        proc = subprocess.run(cmd, input=prompt, capture_output=True, text=True, encoding='utf-8',
                              cwd=APP_DIR, timeout=CLAUDE_TIMEOUT,
                              creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    except subprocess.TimeoutExpired:
        return None, 'claude timed out after %ds' % CLAUDE_TIMEOUT
    try:
        env = json.loads(proc.stdout or '')
    except ValueError:
        return None, 'claude output not JSON (rc=%s): %s' % (proc.returncode, ((proc.stdout or '') + (proc.stderr or ''))[:200].replace('\n', ' '))
    if isinstance(env, list):   # newer CLIs emit the whole event list; the answer is the `result` event
        env = next((x for x in reversed(env) if isinstance(x, dict) and x.get('type') == 'result'), None)
    if not isinstance(env, dict):
        return None, 'claude JSON had no result event (rc=%s)' % proc.returncode
    denials = env.get('permission_denials') or []
    if denials:
        log('WARN: permission denials: %s' % json.dumps(denials)[:400])
    if env.get('is_error'):
        return None, 'claude error: %s' % str(env.get('result'))[:200]
    log('claude ok: %ss, cost $%s' % (round((env.get('duration_ms') or 0) / 1000), env.get('total_cost_usd')))
    return env.get('result') or '', None


def main():
    if os.path.exists(OFF):
        return 0  # paused; silent

    nutrients = load_nutrients()
    if not nutrients:
        log('ERROR: NUTRIENTS config not found in ' + CONFIG)
        write_state('config-error', error='NUTRIENTS not found in app/config.js'); return 1
    defaults = load_defaults(APP_DIR)
    if not defaults:
        log('ERROR: estimator defaults missing/empty: ' + defaults_path(APP_DIR))
        write_state('config-error', error='private/food-defaults.md missing'); return 1

    dev = read_json(DEVICE)
    if not isinstance(dev, dict) or 'ls' not in dev:
        dev = read_json(PREV)
    if not isinstance(dev, dict) or 'ls' not in dev:
        log('ERROR: device-logs unreadable'); write_state('device-error', error='device-logs unreadable'); return 1
    ls = dev.get('ls') or {}
    snapshot_at = dev.get('pushedAt')
    try:
        age_h = (time.time() - datetime.fromisoformat(str(snapshot_at).replace('Z', '+00:00')).timestamp()) / 3600
        if age_h > STALE_SNAPSHOT_H:
            log('WARN: phone snapshot is %.0fh old (pushedAt %s) - phone not syncing?' % (age_h, snapshot_at))
    except ValueError:
        log('WARN: snapshot has no valid pushedAt')

    pending = pending_food_entries(ls)   # every pending meal, all dates

    shared = read_json(SHARED)
    if not isinstance(shared, dict) or not isinstance(shared.get('entries'), list):
        log('ERROR: shared-log unreadable - aborting, touched nothing')
        write_state('shared-error', pending=len(pending), snapshot_at=snapshot_at, error='shared-log unreadable'); return 1
    # an id already answered (phone hasn't re-pushed yet) is not re-estimated
    done = {x.get('target') for x in shared['entries']
            if isinstance(x, dict) and x.get('type') == 'food-update' and all(k in x for k in MACROS)}
    pending = [(d, e) for (d, e) in pending if e['id'] not in done]
    if not pending:
        write_state('empty', snapshot_at=snapshot_at); return 0

    items, skipped = [], []
    for (date, e) in pending:
        photo = e.get('photo')
        if e.get('photoQueued') and not photo:
            skipped.append({'id': e['id'], 'reason': 'waiting-photo'}); continue
        full = None
        if photo:
            full = os.path.join(APP_DIR, photo.replace('/', os.sep))
            if not os.path.isfile(full):
                log('skip (photo missing): %s %s' % (e['id'], photo))
                skipped.append({'id': e['id'], 'reason': 'photo-missing'}); continue
        items.append((date, e, full))
    if not items:
        write_state('nothing-ready', skipped=skipped, pending=len(pending), snapshot_at=snapshot_at); return 0

    by_date = {e['id']: date for (date, e, _) in items}
    by_desc = {e['id']: e.get('n', '') for (_, e, _) in items}

    text, err = run_claude(build_prompt(defaults, nutrients, items))
    if err:
        log('ERROR: ' + err)
        write_state('estimator-error', skipped=skipped, pending=len(pending), snapshot_at=snapshot_at, error=err); return 1
    mm = re.search(r'\[.*\]', text, re.DOTALL)
    try:
        results = json.loads(mm.group(0)) if mm else None
    except ValueError:
        results = None
    if not isinstance(results, list):
        log('ERROR: no JSON array in result: ' + text[:200].replace('\n', ' '))
        write_state('parse-error', skipped=skipped, pending=len(pending), snapshot_at=snapshot_at, error='estimator returned no JSON array'); return 1

    updates, answered = [], set()
    for r in results:
        if not isinstance(r, dict) or r.get('id') not in by_date:
            continue
        rid = r['id']; answered.add(rid)
        if r.get('skip') is True:
            skipped.append({'id': rid, 'reason': 'estimator-skip: ' + str(r.get('reason') or '')[:120]}); continue
        if not all(valid_num(r.get(k)) for k in MACROS):
            skipped.append({'id': rid, 'reason': 'invalid-numbers'}); continue
        vals = {k: round(float(r[k]), 1) for k in MACROS}
        for k in nutrients:
            if valid_num(r.get(k)):
                vals[k] = round(float(r[k]), 1)
        if isinstance(r.get('n'), str) and 0 < len(r['n'].strip()) <= 200:
            vals['n'] = r['n'].strip()
        updates.append((rid, by_date[rid], vals))
    for rid in by_date:
        if rid not in answered:
            skipped.append({'id': rid, 'reason': 'estimator-omitted'})

    if not updates:
        log('WARN: nothing usable from claude for %d item(s)' % len(items))
        write_state('nothing-usable', skipped=skipped, pending=len(pending), snapshot_at=snapshot_at); return 1

    # re-read shared-log to narrow the race with an interactive Claude writing the same file
    shared = read_json(SHARED)
    if not isinstance(shared, dict) or not isinstance(shared.get('entries'), list):
        log('ERROR: shared-log unreadable at write time')
        write_state('shared-error', skipped=skipped, pending=len(pending), snapshot_at=snapshot_at, error='shared-log unreadable at write time'); return 1
    now_done = {x.get('target') for x in shared['entries']
                if isinstance(x, dict) and x.get('type') == 'food-update' and all(k in x for k in MACROS)}
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    new_ids, filled = [], []
    for i, (rid, date, vals) in enumerate(updates):
        if rid in now_done:
            continue
        ent = {'id': 'u-%s-auto-%d' % (stamp, i), 'type': 'food-update', 'date': date, 'target': rid}
        ent.update(vals)
        shared['entries'].append(ent)
        new_ids.append(ent['id']); filled.append(rid)
        log('filled %s %s -> "%s" %gkcal %gp %gc %gf' % (rid, json.dumps(by_desc.get(rid, ''), ensure_ascii=False),
            vals.get('n', ''), vals['kcal'], vals['p'], vals['c'], vals['f']))
    if not filled:
        write_state('already-filled', skipped=skipped, snapshot_at=snapshot_at); return 0

    cutoff = (datetime.now(timezone.utc) - timedelta(days=PRUNE_DAYS)).strftime('%Y-%m-%d')
    shared['entries'] = [x for x in shared['entries']
                         if not (isinstance(x, dict) and isinstance(x.get('date'), str) and x['date'] < cutoff)]

    if not atomic_write(SHARED, shared):
        log('ERROR: failed to write shared-log')
        write_state('write-error', skipped=skipped, pending=len(pending), snapshot_at=snapshot_at, error='shared-log write failed'); return 1
    # verify-after-write: the shared-log has a known concurrent-writer race
    check = read_json(SHARED) or {}
    have = {x.get('id') for x in check.get('entries', []) if isinstance(x, dict)}
    lost = [i for i in new_ids if i not in have]
    if lost:
        log('ERROR: %d food-update(s) vanished after write: %s' % (len(lost), lost))
        write_state('write-lost', skipped=skipped, pending=len(pending), snapshot_at=snapshot_at, error='%d updates lost after write' % len(lost)); return 1
    write_state('filled', filled=filled, skipped=skipped, pending=len(pending) - len(filled), snapshot_at=snapshot_at)
    return 0


if __name__ == '__main__':
    if not LOCKER.acquire():
        sys.exit(0)  # another run (nightly or button) is in flight; it writes the state
    try:
        sys.exit(main())
    except Exception as ex:  # never let a crash go unlogged
        log('FATAL: %r' % ex); write_state('crash', error=repr(ex)[:200]); sys.exit(1)
    finally:
        LOCKER.release()
