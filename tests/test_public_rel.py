"""serve.py's GET allowlist (public_rel) and the private data overlay. The allowlist is what keeps
device-logs.json (it embeds the Sheet credential), logs, sources and private/ off the network; the
overlay is all-or-nothing, so a real install can never be handed a demo data file."""
import http.client
import threading

import pytest

from conftest import assert_tmp

import serve

ALLOWED = ['/', '/index.html', '/?v=1', '/index.html#x', '/sw.js', '/manifest.json', '/styles.css',
           '/shared-log.json', '/server-synced.json', '/autofill-state.json', '/draft-state.json', '/upload',
           '/app/main.js', '/data/profile.js', '/icons/icon-192.png',
           '/food-photos/2026-10-26-f-1.jpg', '/videos/clip.mp4', '/videos/my%20clip.mp4']

REFUSED = [
    # the device-logs mirror, however it is spelled
    '/device-logs.json', '/./device-logs.json', '/a/../device-logs.json', '/app/../device-logs.json',
    '/%64evice-logs.json', '/device%2Dlogs.json', '/device-logs.json%00', '/app\\..\\device-logs.json',
    '/..\\device-logs.json', '/app%5C..%5Cdevice-logs.json', '//device-logs.json/../device-logs.json',
    '/device-logs.prev.json',
    # dotfiles and dot-dirs
    '/.git/config', '/.gitignore', '/app/.secret.js', '/food-photos/.up-123.tmp', '/videos/.up-1.tmp',
    # folder listings
    '/app/', '/app', '/data/', '/icons/', '/food-photos/', '/videos/', '/private/', '/harness/',
    # sources and logs
    '/serve.py', '/food_common.py', '/draft-food.py', '/autofill-food.py', '/server-watchdog.py',
    '/serve-access.log', '/draft.log', '/server-watchdog.log', '/autofill.lock',
    # nested paths and the private overlay itself
    '/app/sub/x.js', '/food-photos/a/b.jpg', '/private/data/profile.js', '/private/server.json',
    '/harness/harness.js', '/tests/conftest.py', '/README.md', '/../index.html/../device-logs.json',
]


@pytest.mark.parametrize('path', ALLOWED)
def test_allowlisted_paths_are_servable(path):
    assert serve.public_rel(path) is not None, path


@pytest.mark.parametrize('path', REFUSED)
def test_everything_else_is_refused(path):
    assert serve.public_rel(path) is None, path


def test_normalised_paths_resolve_to_the_file_they_name():
    assert serve.public_rel('/app/./main.js') == 'app/main.js'
    assert serve.public_rel('/x/../index.html') == 'index.html'
    assert serve.public_rel('/') == ''


# ---------- served over HTTP: 404s and the all-or-nothing overlay ----------

def serve_dir(app_dir):
    srv = serve.make_server(str(assert_tmp(app_dir)), 0)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def get(srv, path):
    c = http.client.HTTPConnection('127.0.0.1', srv.server_address[1], timeout=5)
    c.request('GET', path)
    r = c.getresponse()
    body = r.read()
    c.close()
    return r.status, body


@pytest.fixture
def app(tmp_path):
    for rel, text in {'index.html': '<title>app</title>', 'device-logs.json': '{"secret": 1}', 'serve-access.log': 'log',
                      'data/profile.js': 'const DEMO=1;', 'data/seed.js': 'const SEED={};', 'manifest.json': '{"name":"demo"}',
                      'app/main.js': '/* main */', 'icons/icon-192.png': 'png'}.items():
        f = tmp_path / rel
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(text, encoding='utf-8')
    return tmp_path


def test_refused_paths_are_404_over_http(app):
    srv = serve_dir(app)
    try:
        for path in ['/device-logs.json', '/./device-logs.json', '/a/../device-logs.json', '/%64evice-logs.json',
                     '/serve-access.log', '/app/', '/serve.py']:
            status, body = get(srv, path)
            assert status == 404 and b'secret' not in body, path
        assert get(srv, '/app/main.js') == (200, b'/* main */')
    finally:
        srv.shutdown(); srv.server_close()


def test_no_overlay_serves_the_demo_data(app):
    srv = serve_dir(app)
    try:
        assert get(srv, '/data/profile.js') == (200, b'const DEMO=1;')
        assert get(srv, '/manifest.json') == (200, b'{"name":"demo"}')
    finally:
        srv.shutdown(); srv.server_close()


def test_overlay_is_all_or_nothing(app):
    (app / 'private' / 'data').mkdir(parents=True)
    (app / 'private' / 'data' / 'profile.js').write_text('const REAL=1;', encoding='utf-8')
    srv = serve_dir(app)
    try:
        assert get(srv, '/data/profile.js') == (200, b'const REAL=1;')
        # present in the demo, missing from the overlay -> 404, never the demo copy
        assert get(srv, '/data/seed.js')[0] == 404
        assert get(srv, '/manifest.json')[0] == 404
        # the overlay folder itself is never reachable directly
        assert get(srv, '/private/data/profile.js')[0] == 404
        # engine files are not overlayable
        assert get(srv, '/app/main.js') == (200, b'/* main */')
    finally:
        srv.shutdown(); srv.server_close()


def test_overlay_never_answers_304_for_the_other_copy(app):
    """An If-Modified-Since from a demo-era fetch must not confirm a cached copy of the other file."""
    (app / 'private' / 'data').mkdir(parents=True)
    (app / 'private' / 'data' / 'profile.js').write_text('const REAL=1;', encoding='utf-8')
    srv = serve_dir(app)
    try:
        c = http.client.HTTPConnection('127.0.0.1', srv.server_address[1], timeout=5)
        c.request('GET', '/data/profile.js', headers={'If-Modified-Since': 'Fri, 01 Jan 2100 00:00:00 GMT'})
        r = c.getresponse()
        assert r.status == 200 and r.read() == b'const REAL=1;'
        c.close()
    finally:
        srv.shutdown(); srv.server_close()
