"""How good are the live local drafts? Draft vs the final number, from the phone snapshot.

Population: food entries in device-logs.json that are no longer pending AND carry entry.draft.
Reported with its N, the excluded counts, median abs % error, bias, protein error, split by draft src.
Limitation: a final DJ typed by hand looks the same as a Claude final (there is no marker today).

Usage: python harness/draft-calibration.py
"""
import json, os, statistics as st, sys

APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, APP)
from food_common import read_json

snap = read_json(os.path.join(APP, 'device-logs.json')) or {}
rows, pending_with_draft, final_no_draft = [], 0, 0
for k, v in (snap.get('ls') or {}).items():
    if not k.startswith('dj-foodlog-'):
        continue
    for e in json.loads(v):
        d = e.get('draft') if isinstance(e, dict) else None
        if e.get('pending'):
            pending_with_draft += bool(d); continue
        if not d:
            final_no_draft += 1; continue
        if not e.get('kcal'):
            continue
        rows.append({'src': d.get('src') or '?', 'k': e['kcal'], 'dk': d['kcal'], 'p': e.get('p', 0), 'dp': d.get('p', 0)})

print('snapshot %s | scored N=%d | excluded: %d final without a draft, %d still pending' % (
    snap.get('pushedAt'), len(rows), final_no_draft, pending_with_draft))
for src in sorted({r['src'] for r in rows}) + ['ALL']:
    rs = [r for r in rows if src == 'ALL' or r['src'] == src]
    if not rs:
        continue
    ape = [abs(r['dk'] - r['k']) / r['k'] * 100 for r in rs]
    bias = [(r['dk'] - r['k']) / r['k'] * 100 for r in rs]
    print('%-6s N=%-3d median err %3.0f%% | bias %+4.0f%% | within 15%%: %d/%d | protein median abs err %.0fg' % (
        src, len(rs), st.median(ape), st.mean(bias), sum(a <= 15 for a in ape), len(rs),
        st.median([abs(r['dp'] - r['p']) for r in rs])))
