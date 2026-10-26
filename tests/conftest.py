"""Shared test helpers. Every test runs against a tmp app dir (never the checkout's own runtime files,
never a live install) and every server binds 127.0.0.1 on an ephemeral port."""
import importlib.util
import json
import os
import sys
import tempfile
import threading
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))
TMP_ROOT = Path(tempfile.gettempdir()).resolve()


def assert_tmp(path):
    """Guard: a test may only point the app code at a directory under the system temp root."""
    p = Path(path).resolve()
    assert TMP_ROOT in p.parents, 'tests must use a tmp app dir, got %s' % p
    return p


def load_script(filename, argv):
    """Import a hyphenated script (draft-food.py ...) as a fresh module with the given argv[1:].
    argv[0] (the app dir) must be a tmp dir."""
    assert_tmp(argv[0])
    spec = importlib.util.spec_from_file_location(filename.replace('-', '_').replace('.py', '') + '_under_test',
                                                  REPO / filename)
    mod = importlib.util.module_from_spec(spec)
    old = sys.argv
    sys.argv = [str(REPO / filename)] + list(argv)
    try:
        spec.loader.exec_module(mod)
    finally:
        sys.argv = old
    return mod


GOOD_ANSWER = {'items': [{'name': 'bowl', 'kcal': 500}], 'kcal': 500, 'p': 30, 'c': 50, 'f': 20,
               'unsure': False, 'basis': 'one bowl'}


def fake_ollama():
    """A stand-in Ollama on 127.0.0.1:<ephemeral>. Records every POST as (path, json body) in .log."""
    log = []

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _send(self, obj):
            b = json.dumps(obj).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(b)))
            self.end_headers()
            self.wfile.write(b)

        def do_GET(self):
            self._send({'models': []} if self.path == '/api/ps' else {})

        def do_POST(self):
            n = int(self.headers.get('Content-Length') or 0)
            body = json.loads(self.rfile.read(n) or b'{}')
            log.append((self.path, body))
            if self.path == '/api/chat':
                self._send({'message': {'content': json.dumps(GOOD_ANSWER)}, 'eval_count': 10})
            else:
                self._send({'done': True})

    srv = ThreadingHTTPServer(('127.0.0.1', 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    srv.url = 'http://127.0.0.1:%d' % srv.server_address[1]
    srv.log = log
    srv.bodies = lambda path: [b for p, b in log if p == path]
    return srv
