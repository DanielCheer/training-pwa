"""food_common.py — the rules the server and both meal estimators share."""
import json
import os
import time

import pytest

from conftest import REPO

import food_common as fc


# ---------- atomic_write / read_json ----------

def test_atomic_write_replaces_whole_and_leaves_no_temp(tmp_path):
    p = tmp_path / 'state.json'
    p.write_text('{"old": true}', encoding='utf-8')
    assert fc.atomic_write(str(p), {'new': 'ü'}, prefix='.t-') is True
    assert json.loads(p.read_text(encoding='utf-8')) == {'new': 'ü'}
    assert [f.name for f in tmp_path.iterdir()] == ['state.json'], 'no .tmp left behind'


def test_atomic_write_reports_failure_instead_of_raising(tmp_path):
    assert fc.atomic_write(str(tmp_path / 'missing-dir' / 'x.json'), {}) is False
    # unserialisable data: the original file survives and no temp file is left
    p = tmp_path / 'keep.json'
    p.write_text('{"keep": 1}', encoding='utf-8')
    assert fc.atomic_write(str(p), {'bad': object()}) is False
    assert json.loads(p.read_text(encoding='utf-8')) == {'keep': 1}
    assert sorted(f.name for f in tmp_path.iterdir()) == ['keep.json']


def test_read_json_returns_none_for_missing_or_broken(tmp_path):
    assert fc.read_json(str(tmp_path / 'nope.json'), retries=0) is None
    (tmp_path / 'bad.json').write_text('{', encoding='utf-8')
    assert fc.read_json(str(tmp_path / 'bad.json'), retries=0) is None


# ---------- RunLock / lock_live ----------

def test_runlock_is_single_instance_and_carries_stale_after(tmp_path):
    path = str(tmp_path / 'x.lock')
    a, b = fc.RunLock(path, 60, 'push'), fc.RunLock(path, 60, 'manual')
    assert a.acquire() is True
    assert b.acquire() is False, 'a fresh lock is respected'
    lk = json.loads(open(path, encoding='utf-8').read())
    assert lk['pid'] == os.getpid() and lk['trigger'] == 'push' and lk['staleAfter'] > time.time() + 50
    assert fc.lock_live(path) is True
    a.release()
    assert not os.path.exists(path) and fc.lock_live(path) is False


def test_runlock_takes_over_a_stale_lock(tmp_path):
    path = str(tmp_path / 'x.lock')
    logged = []
    fc.RunLock(path, 60, 'crashed').acquire()
    old = time.time() - 3600
    os.utime(path, (old, old))   # the crashed run stopped refreshing an hour ago
    lock = fc.RunLock(path, 60, 'push', log=logged.append)
    assert lock.acquire() is True
    assert json.loads(open(path, encoding='utf-8').read())['trigger'] == 'push'
    assert logged == ['WARN: removed stale lock']


def test_refresh_moves_stale_after_forward(tmp_path):
    path = str(tmp_path / 'x.lock')
    lock = fc.RunLock(path, 60, 'push')
    lock.acquire()
    first = json.loads(open(path, encoding='utf-8').read())['staleAfter']
    time.sleep(0.01)
    lock.refresh()
    assert json.loads(open(path, encoding='utf-8').read())['staleAfter'] > first


@pytest.mark.parametrize('content,live', [
    ({'staleAfter': time.time() + 600}, True),
    ({'staleAfter': time.time() - 1}, False),
    ({'staleAfter': 'soon'}, False),
    ({}, False),
    ([], False),
    (None, False),
])
def test_lock_live(tmp_path, content, live):
    path = tmp_path / 'x.lock'
    if content is not None:
        path.write_text(json.dumps(content), encoding='utf-8')
    assert fc.lock_live(str(path)) is live


# ---------- the phone snapshot: pending meals and draft work ----------

def ls_of(by_date):
    return {'dj-foodlog-' + d: json.dumps(v) for d, v in by_date.items()}


def test_pending_food_entries_across_days_ignores_junk():
    ls = ls_of({'2026-10-25': [{'id': 'a', 'pending': True}, {'id': 'b', 'kcal': 1}],
                '2026-10-26': [{'id': 'c', 'pending': True}, {'pending': True}, {'id': 'd', 'pending': 'yes'}, 'junk']})
    ls['dj-foodlog-2026-10-27'] = '{not json'
    ls['dj-bw-log'] = '[{"pending": true, "id": "x"}]'          # not a food log key
    ls['dj-foodlog-2026-10-28'] = json.dumps({'id': 'e', 'pending': True})   # not a list
    got = sorted((d, e['id']) for d, e in fc.pending_food_entries(ls))
    assert got == [('2026-10-25', 'a'), ('2026-10-26', 'c')]
    assert fc.pending_food_entries(None) == []


def test_draft_work_splits_ready_and_waiting():
    entries = [
        {'id': 'text', 'n': 'rice bowl', 'pending': True},
        {'id': 'queued', 'n': '', 'pending': True, 'photoQueued': True},
        {'id': 'uploaded', 'n': '', 'pending': True, 'photoQueued': True, 'photo': 'food-photos/x.jpg'},
        {'id': 'empty', 'n': '', 'pending': True},
        {'id': 'drafted-on-phone', 'n': 'eggs', 'pending': True, 'draft': {'of': {'n': 'eggs', 'photo': ''}}},
        {'id': 'renamed', 'n': 'eggs x3', 'pending': True, 'draft': {'of': {'n': 'eggs', 'photo': ''}}},
        {'id': 'drafted-on-pc', 'n': 'pho', 'pending': True},
        {'id': 'skipped', 'n': 'mystery', 'pending': True},
        {'id': 'skipped-transient', 'n': 'soup', 'pending': True},
        {'id': 'counted', 'n': 'toast', 'kcal': 80},
    ]
    state = {'drafts': {'drafted-on-pc': {'of': {'n': 'pho', 'photo': ''}}},
             'skipped': [{'id': 'skipped', 'of': {'n': 'mystery', 'photo': ''}, 'transient': False},
                         {'id': 'skipped-transient', 'of': {'n': 'soup', 'photo': ''}, 'transient': True}]}
    ready, waiting = fc.draft_work(ls_of({'2026-10-26': entries}), state)
    assert sorted(e['id'] for _, e in ready) == ['renamed', 'skipped-transient', 'text', 'uploaded']
    assert [e['id'] for _, e in waiting] == ['queued']
    # a malformed state is treated as empty, never as "everything is drafted"
    ready2, _ = fc.draft_work(ls_of({'2026-10-26': entries}), 'garbage')
    assert {'drafted-on-pc', 'skipped'} <= {e['id'] for _, e in ready2}


def test_same_inputs_mirrors_the_app_rule():
    e = {'n': 'eggs', 'photo': 'food-photos/a.jpg'}
    assert fc.same_inputs(e, {'of': {'n': 'eggs', 'photo': 'food-photos/a.jpg'}})
    assert not fc.same_inputs(e, {'of': {'n': 'eggs', 'photo': ''}})
    assert not fc.same_inputs(e, {'of': None}) and not fc.same_inputs(e, None)


@pytest.mark.parametrize('v,ok', [(0, True), (19999.5, True), (20000, False), (-1, False), (True, False),
                                  (float('nan'), False), ('5', False), (None, False)])
def test_valid_num(v, ok):
    assert fc.valid_num(v) is ok


# ---------- NUTRIENTS come from app/config.js ----------

def test_load_nutrients_reads_the_real_config():
    keys = fc.load_nutrients(fc.config_path(str(REPO)))
    src = (REPO / 'app' / 'config.js').read_text(encoding='utf-8')
    block = src[src.index('const NUTRIENTS=['):]
    block = block[:block.index('];')]
    assert keys and all("k:'%s'" % k in block for k in keys)
    assert len(keys) == block.count("{k:'"), 'every NUTRIENTS entry is picked up'


def test_load_nutrients_parses_a_given_config(tmp_path):
    cfg = tmp_path / 'config.js'
    cfg.write_text("const X=1;\nconst NUTRIENTS=[\n {k:'zinc',label:'Zinc'},\n {k:'iron',label:'Iron'}\n];\n", encoding='utf-8')
    assert fc.load_nutrients(str(cfg)) == ['zinc', 'iron']
    cfg.write_text('const OTHER=[];', encoding='utf-8')
    assert fc.load_nutrients(str(cfg)) is None, 'no NUTRIENTS -> None (callers fail loud)'
    assert fc.load_nutrients(str(tmp_path / 'missing.js')) is None


def test_defaults_live_in_private(tmp_path):
    assert fc.load_defaults(str(tmp_path)) is None
    (tmp_path / 'private').mkdir()
    (tmp_path / 'private' / 'food-defaults.md').write_text('  \n', encoding='utf-8')
    assert fc.load_defaults(str(tmp_path)) is None, 'empty counts as missing'
    (tmp_path / 'private' / 'food-defaults.md').write_text('Milk is 2%.\n', encoding='utf-8')
    assert fc.load_defaults(str(tmp_path)) == 'Milk is 2%.'
