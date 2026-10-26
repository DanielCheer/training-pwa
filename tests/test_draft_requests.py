"""draft-food.py's Ollama request bodies: every chat names keep_alive '2m', the warm-up names '5m', and a
run that asked the model ends with an explicit unload (keep_alive 0) - so the 27B model's ~20 GB is
freed right after the last meal instead of idling for the server default.

Never talks to a real Ollama: DRAFT_HOST points at a fake server on an ephemeral loopback port, and the
app dir is a tmp fixture."""
import json

import pytest

from conftest import load_script, fake_ollama, REPO


@pytest.fixture
def ollama():
    srv = fake_ollama()
    yield srv
    srv.shutdown()


@pytest.fixture
def draft(tmp_path, ollama, monkeypatch):
    """A fresh draft-food module bound to tmp_path as its app dir and the fake Ollama as its host."""
    (tmp_path / 'app').mkdir()
    (tmp_path / 'app' / 'config.js').write_text((REPO / 'app' / 'config.js').read_text(encoding='utf-8'), encoding='utf-8')
    (tmp_path / 'private').mkdir()
    (tmp_path / 'private' / 'food-defaults.md').write_text('Milk is 2%.', encoding='utf-8')
    monkeypatch.setenv('DRAFT_HOST', ollama.url)
    monkeypatch.setenv('DRAFT_MODEL', 'test-model')
    return load_script('draft-food.py', [str(tmp_path), '--trigger=manual'])


def push(app_dir, entries, date='2026-10-26'):
    (app_dir / 'device-logs.json').write_text(json.dumps(
        {'v': 1, 'pushedAt': '2026-10-26T15:00:00Z', 'seq': 1, 'ls': {'dj-foodlog-' + date: json.dumps(entries)}}), encoding='utf-8')


def test_chat_request_names_keep_alive_2m(draft, ollama):
    obj, reason, _ = draft.ask_model('prompt')
    assert reason is None and obj['kcal'] == 500
    body = ollama.bodies('/api/chat')[-1]
    assert body['keep_alive'] == '2m'
    assert body['model'] == 'test-model' and body['stream'] is False


def test_warm_request_names_keep_alive_5m(draft, ollama):
    assert draft.warm_model() is True
    body = ollama.bodies('/api/generate')[-1]
    assert body == {'model': 'test-model', 'prompt': '', 'stream': False, 'keep_alive': '5m'}


def test_unload_body_is_keep_alive_zero(draft):
    assert draft.unload_body() == {'model': 'test-model', 'keep_alive': 0}


def test_a_run_ends_with_an_explicit_unload(draft, ollama, tmp_path):
    push(tmp_path, [{'id': 'f-1', 'n': 'chicken rice bowl', 'pending': True, 'at': '2026-10-26T14:00:00Z'},
                    {'id': 'f-2', 'n': 'protein shake', 'pending': True, 'at': '2026-10-26T14:30:00Z'}])
    assert draft.main() == 0
    paths = [p for p, _ in ollama.log]
    assert paths.count('/api/chat') == 2
    last_path, last_body = ollama.log[-1]
    assert last_path == '/api/generate' and last_body == {'model': 'test-model', 'keep_alive': 0}, 'the unload comes after the last meal'
    assert all(b['keep_alive'] == '2m' for b in ollama.bodies('/api/chat'))
    state = json.loads((tmp_path / 'draft-state.json').read_text(encoding='utf-8'))
    assert state['lastResult'] == 'drafted' and set(state['drafts']) == {'f-1', 'f-2'}


def test_a_warm_only_run_keeps_the_model_for_the_photo(draft, ollama, tmp_path):
    push(tmp_path, [{'id': 'f-3', 'n': '', 'pending': True, 'photoQueued': True}])
    assert draft.main() == 0
    assert '/api/chat' not in [p for p, _ in ollama.log]
    assert {'model': 'test-model', 'keep_alive': 0} not in ollama.bodies('/api/generate'), 'no unload right after a warm-up'
    assert ollama.bodies('/api/generate')[-1]['keep_alive'] == '5m'


def test_an_empty_run_never_touches_the_model(draft, ollama, tmp_path):
    push(tmp_path, [{'id': 'f-4', 'n': 'eggs', 'kcal': 216, 'p': 19, 'c': 1, 'f': 15}])
    assert draft.main() == 0
    assert ollama.log == []
