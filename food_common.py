#!/usr/bin/env python3
# DJ Training - helpers shared by the two meal estimators and the server:
#   autofill-food.py  (the FINAL count: headless Claude, nightly 04:30 + "Count now")
#   draft-food.py     (the instant DRAFT: local Qwen on the RTX 3070, after every phone push)
#   serve.py          (decides when to wake draft-food.py - needs the same "does a meal need a draft" rule)
# One copy of each rule lives here so the three can't drift apart.

import json, os, re, time, tempfile
from datetime import datetime, timezone

MACROS = ('kcal', 'p', 'c', 'f')


def now_iso():
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def atomic_write(path, data, prefix='.food-'):
    """tmp + fsync + os.replace. Returns False (never raises) so callers can report write-error."""
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), prefix=prefix, suffix='.tmp')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
            f.flush(); os.fsync(f.fileno())
    except Exception:
        try: os.unlink(tmp)
        except OSError: pass
        return False
    for i in range(4):   # Windows: os.replace fails while a reader holds the dest open
        try:
            os.replace(tmp, path); return True
        except PermissionError:
            if i == 3:
                try: os.unlink(tmp)
                except OSError: pass
                return False
            time.sleep(0.05)


def read_json(path, retries=1):
    for i in range(retries + 1):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (OSError, ValueError):
            if i < retries:
                time.sleep(0.2)
    return None


class RunLock:
    """Single-instance lock file holding {pid,startedAt,trigger,staleAfter}. serve.py reads staleAfter
    to answer "already running" without its own copy of the timeout. A lock older than stale_s
    (crashed run) is taken over. refresh() is the heartbeat for long runs."""

    def __init__(self, path, stale_s, trigger, log=None):
        self.path, self.stale_s, self.trigger, self.log = path, stale_s, trigger, log

    def _write(self, f):
        json.dump({'pid': os.getpid(), 'startedAt': now_iso(), 'trigger': self.trigger,
                   'staleAfter': time.time() + self.stale_s}, f)

    def acquire(self):
        for _ in range(2):
            try:
                fd = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                with os.fdopen(fd, 'w') as f:
                    self._write(f)
                return True
            except FileExistsError:
                try:
                    if time.time() - os.path.getmtime(self.path) < self.stale_s:
                        return False
                    os.unlink(self.path)
                    if self.log:
                        self.log('WARN: removed stale lock')
                except OSError:
                    return False
        return False

    def refresh(self):
        try:
            with open(self.path, 'w') as f:
                self._write(f)
        except OSError:
            pass

    def release(self):
        try: os.unlink(self.path)
        except OSError: pass


def lock_live(path):
    """True while a RunLock file exists and its staleAfter is in the future."""
    lk = read_json(path, retries=0)
    return isinstance(lk, dict) and isinstance(lk.get('staleAfter'), (int, float)) and lk['staleAfter'] > time.time()


def config_path(app_dir):
    """The engine config script that declares NUTRIENTS (the app's single source for nutrient keys)."""
    return os.path.join(app_dir, 'app', 'config.js')


def defaults_path(app_dir):
    """The owner's estimator defaults (personal: portion habits, recipes) - private/, never committed."""
    return os.path.join(app_dir, 'private', 'food-defaults.md')


def load_defaults(app_dir):
    """The defaults text, or None when the file is missing or empty (callers fail loud on None)."""
    try:
        with open(defaults_path(app_dir), 'r', encoding='utf-8') as f:
            text = f.read().strip()
    except OSError:
        return None
    return text or None


def load_nutrients(config_file):
    """Nutrient keys come from app/config.js's NUTRIENTS config - never a hand-kept copy."""
    try:
        with open(config_file, 'r', encoding='utf-8') as f:
            src = f.read()
    except OSError:
        return None
    m = re.search(r'const NUTRIENTS=\[(.*?)\];', src, re.DOTALL)
    keys = re.findall(r"\bk:'(\w+)'", m.group(1)) if m else []
    return keys or None


def valid_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and v == v and 0 <= v < 20000


def pending_food_entries(ls):
    """Every pending meal in a phone snapshot's localStorage map, all dates: [(date, entry)]."""
    out = []
    for k, v in (ls or {}).items():
        if not k.startswith('dj-foodlog-'):
            continue
        date = k[len('dj-foodlog-'):]
        try:
            entries = json.loads(v)
        except (ValueError, TypeError):
            continue
        if not isinstance(entries, list):
            continue
        for e in entries:
            if isinstance(e, dict) and e.get('pending') is True and isinstance(e.get('id'), str):
                out.append((date, e))
    return out


def draft_inputs(entry):
    """What a draft is computed FROM. A draft (or a skip) is stale once these change."""
    return {'n': entry.get('n') or '', 'photo': entry.get('photo') or ''}


def same_inputs(entry, rec):
    """rec = a draft or a skip record carrying `of`. Mirrors sameDraftInputs() in index.html."""
    of = rec.get('of') if isinstance(rec, dict) else None
    return isinstance(of, dict) and draft_inputs(entry) == {'n': of.get('n') or '', 'photo': of.get('photo') or ''}


def draft_work(ls, state):
    """Split pending meals into (ready, waiting) for the draft worker.
    ready   = pending, photo uploaded (or text-only), and no current draft / non-transient skip for
              the same inputs (on the phone entry or in draft-state.json).
    waiting = photo still queued on the phone (it can't be drafted until /upload-food lands)."""
    state = state if isinstance(state, dict) else {}
    drafts = state.get('drafts') if isinstance(state.get('drafts'), dict) else {}
    skips = {s.get('id'): s for s in (state.get('skipped') or []) if isinstance(s, dict)}
    ready, waiting = [], []
    for date, e in pending_food_entries(ls):
        if e.get('photoQueued') and not e.get('photo'):
            waiting.append((date, e)); continue
        if not (e.get('n') or e.get('photo')):
            continue   # nothing to estimate from
        if same_inputs(e, e.get('draft')) or same_inputs(e, drafts.get(e['id'])):
            continue
        sk = skips.get(e['id'])
        if sk and not sk.get('transient') and same_inputs(e, sk):
            continue
        ready.append((date, e))
    return ready, waiting
