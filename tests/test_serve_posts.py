"""serve.py's POST surface against a tmp app dir on an ephemeral loopback port: Content-Type / client
header / Origin rejections, the push-logs seq rule, the upload budget and free-disk floor, and HTTP/1.1
keep-alive (including after an error)."""
import http.client
import json
import re
import socket
import threading

import pytest

from conftest import assert_tmp

import serve

PUSH = {'v': 1, 'pushedAt': '2026-10-26T15:00:00Z', 'seq': 5, 'ls': {'dj-bw-log': '[]'}}
JSON_HDRS = {'Content-Type': 'application/json'}
CLIENT = {'X-Train-Client': '1'}


def start(app_dir, origins=None):
    app_dir = assert_tmp(app_dir)
    (app_dir / 'index.html').write_text('<!doctype html><title>t</title>', encoding='utf-8')
    if origins is not None:
        (app_dir / 'private').mkdir(exist_ok=True)
        (app_dir / 'private' / 'server.json').write_text(json.dumps({'allowedOrigins': origins}), encoding='utf-8')
    srv = serve.make_server(str(app_dir), 0)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    srv.port = srv.server_address[1]
    return srv


@pytest.fixture
def server(tmp_path):
    srv = start(tmp_path)
    yield srv
    srv.shutdown()
    srv.server_close()


@pytest.fixture
def server_with_origins(tmp_path):
    srv = start(tmp_path, ['https://phone.example:8444'])
    yield srv
    srv.shutdown()
    srv.server_close()


def post(srv, path, body=b'', headers=None):
    c = http.client.HTTPConnection('127.0.0.1', srv.port, timeout=10)
    c.request('POST', path, body=body, headers=headers or {})
    r = c.getresponse()
    data = r.read()
    c.close()
    try:
        return r.status, json.loads(data or b'null')
    except ValueError:
        return r.status, data


def push(srv, payload=PUSH, headers=JSON_HDRS):
    return post(srv, '/push-logs', json.dumps(payload).encode(), headers)


# ---------- Content-Type / X-Train-Client / Origin ----------

def test_push_logs_accepts_json_alone_like_sendbeacon(server):
    assert push(server)[0] == 200


@pytest.mark.parametrize('ctype', [None, 'text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x'])
def test_push_logs_refuses_a_non_json_content_type(server, ctype):
    status, body = push(server, headers={'Content-Type': ctype} if ctype else {})
    assert status == 403 and body['reason'] == 'content-type'


def test_request_fill_needs_the_client_header(server):
    status, body = post(server, '/request-fill', b'{}', JSON_HDRS)
    assert status == 403 and body['reason'] == 'client-header'
    status, body = post(server, '/request-fill', b'{}', {**JSON_HDRS, 'X-Train-Client': '0'})
    assert status == 403
    # with the header it gets past the guard (here: no snapshot pushed yet -> 400 stale-snapshot)
    status, body = post(server, '/request-fill', b'{}', {**JSON_HDRS, **CLIENT})
    assert status == 400 and body['state'] == 'stale-snapshot'


@pytest.mark.parametrize('path', ['/upload-food?date=2026-10-26&id=f-1', '/upload-video?name=a.mp4'])
def test_uploads_need_a_media_type_and_the_client_header(server, path):
    assert post(server, path, b'x' * 10, {'Content-Type': 'image/jpeg'})[1]['reason'] == 'client-header'
    assert post(server, path, b'x' * 10, {'Content-Type': 'text/plain', **CLIENT})[1]['reason'] == 'content-type'
    for ctype in ('image/jpeg', 'video/quicktime', 'application/octet-stream'):
        assert post(server, path, b'x' * 10, {'Content-Type': ctype, **CLIENT})[0] == 200, ctype


def test_same_host_origin_only_without_server_json(server):
    host = '127.0.0.1:%d' % server.port
    assert push(server, headers={**JSON_HDRS, 'Origin': 'http://' + host})[0] == 200
    status, body = push(server, headers={**JSON_HDRS, 'Origin': 'https://evil.example'})
    assert status == 403 and body['reason'] == 'origin'
    assert push(server, headers={**JSON_HDRS, 'Origin': 'null'})[0] == 403


def test_origin_allowlist_from_private_server_json(server_with_origins):
    srv = server_with_origins
    assert push(srv, headers={**JSON_HDRS, 'Origin': 'https://phone.example:8444'})[0] == 200
    # the file replaces same-host: only listed origins
    assert push(srv, headers={**JSON_HDRS, 'Origin': 'http://127.0.0.1:%d' % srv.port})[0] == 403
    assert push(srv, headers={**JSON_HDRS, 'Origin': 'https://phone.example'})[0] == 403
    assert push(srv)[0] == 200, 'no Origin header (curl, the PC) is not an origin check'


def test_malformed_server_json_stops_the_server(tmp_path):
    (tmp_path / 'private').mkdir()
    (tmp_path / 'private' / 'server.json').write_text('{"allowedOrigins": "https://x"}', encoding='utf-8')
    with pytest.raises(SystemExit):
        serve.set_app_dir(str(tmp_path))


def test_unknown_post_route_is_404(server):
    assert post(server, '/push-logs-x', b'{}', {**JSON_HDRS, **CLIENT})[0] == 404


# ---------- push-logs seq rule ----------

def test_an_older_seq_is_refused_with_the_stored_seq(server, tmp_path):
    assert push(server, {**PUSH, 'seq': 40})[0] == 200
    status, body = push(server, {**PUSH, 'seq': 3, 'ls': {'dj-bw-log': '["older"]'}})
    assert status == 409 and body == {'ok': False, 'state': 'stale-seq', 'seq': 40}
    stored = json.loads((tmp_path / 'device-logs.json').read_text(encoding='utf-8'))
    assert stored['seq'] == 40 and stored['ls'] == PUSH['ls'], 'the newer snapshot is untouched'


def test_equal_and_newer_seqs_are_accepted(server, tmp_path):
    assert push(server, {**PUSH, 'seq': 40})[0] == 200
    assert push(server, {**PUSH, 'seq': 40})[0] == 200, 'the same push retried'
    assert push(server, {**PUSH, 'seq': 41})[0] == 200
    assert json.loads((tmp_path / 'device-logs.json').read_text(encoding='utf-8'))['seq'] == 41


@pytest.mark.parametrize('seq', [None, '7', -1, 1.5, True])
def test_a_missing_or_malformed_seq_is_a_400(server, seq):
    payload = {k: v for k, v in PUSH.items() if k != 'seq'}
    if seq is not None:
        payload['seq'] = seq
    assert push(server, payload)[0] == 400


# ---------- upload caps: per request (413), per day + free-disk floor (507) ----------

UP = {'Content-Type': 'image/jpeg', **CLIENT}


def test_per_request_cap_is_413(server, monkeypatch):
    monkeypatch.setattr(serve, 'MAX_FOOD', 10)
    assert post(server, '/upload-food?date=2026-10-26&id=f-1', b'x' * 11, UP)[0] == 413


def test_day_budget_refuses_with_507_and_counts_in_private(server, tmp_path, monkeypatch):
    monkeypatch.setattr(serve, 'UPLOAD_DAY_BUDGET', 25)
    assert post(server, '/upload-food?date=2026-10-26&id=f-1', b'x' * 10, UP)[0] == 200
    assert post(server, '/upload-video?name=a.mp4', b'x' * 10, {**UP, 'Content-Type': 'video/mp4'})[0] == 200
    status, body = post(server, '/upload-food?date=2026-10-26&id=f-2', b'x' * 10, UP)
    assert status == 507 and body['state'] == 'day-budget'
    budget = json.loads((tmp_path / 'private' / 'upload-budget.json').read_text(encoding='utf-8'))
    assert budget['bytes'] == 20 and len(budget['date']) == 10
    assert not (tmp_path / 'food-photos' / '2026-10-26-f-2.jpg').exists()


def test_budget_resets_on_a_new_day(server, tmp_path, monkeypatch):
    monkeypatch.setattr(serve, 'UPLOAD_DAY_BUDGET', 25)
    (tmp_path / 'private').mkdir(exist_ok=True)
    (tmp_path / 'private' / 'upload-budget.json').write_text(json.dumps({'date': '2000-01-01', 'bytes': 25}), encoding='utf-8')
    assert post(server, '/upload-food?date=2026-10-26&id=f-1', b'x' * 10, UP)[0] == 200


def test_free_disk_floor_refuses_with_507(server, monkeypatch):
    class Usage:
        free = serve.DISK_FLOOR + 5
    monkeypatch.setattr(serve.shutil, 'disk_usage', lambda p: Usage)
    status, body = post(server, '/upload-video?name=a.mp4', b'x' * 10, {**UP, 'Content-Type': 'video/mp4'})
    assert status == 507 and body['state'] == 'disk-floor'
    assert post(server, '/upload-video?name=b.mp4', b'x' * 5, {**UP, 'Content-Type': 'video/mp4'})[0] == 200


def test_an_upload_that_fails_gives_its_bytes_back(server, tmp_path, monkeypatch):
    monkeypatch.setattr(serve, 'UPLOAD_DAY_BUDGET', 100)
    # announce 50 bytes, send 10, hang up: the server gets a short body -> 400, refund
    s = socket.create_connection(('127.0.0.1', server.port), timeout=10)
    s.sendall(b'POST /upload-food?date=2026-10-26&id=f-9 HTTP/1.1\r\nHost: x\r\nContent-Type: image/jpeg\r\n'
              b'X-Train-Client: 1\r\nContent-Length: 50\r\n\r\n' + b'x' * 10)
    s.shutdown(socket.SHUT_WR)
    assert b' 400 ' in s.recv(4096).split(b'\r\n', 1)[0] + b' '
    s.close()
    budget = json.loads((tmp_path / 'private' / 'upload-budget.json').read_text(encoding='utf-8'))
    assert budget['bytes'] == 0


# ---------- HTTP/1.1 keep-alive ----------

def raw(srv, data, reads=2):
    """Send raw bytes on ONE socket and collect every response until the server closes or `reads` arrive."""
    s = socket.create_connection(('127.0.0.1', srv.port), timeout=5)
    s.sendall(data)
    buf = b''
    try:
        while buf.count(b'HTTP/1.') < reads:
            chunk = s.recv(65536)
            if not chunk:
                break
            buf += chunk
        s.settimeout(0.5)
        while True:   # anything after that (there should be nothing)
            chunk = s.recv(65536)
            if not chunk:
                break
            buf += chunk
    except socket.timeout:
        pass
    s.close()
    return buf


def statuses(buf):
    return [int(m) for m in re.findall(rb'HTTP/1\.[01] (\d{3}) ', buf)]   # a body has no trailing CRLF: match anywhere


def test_two_requests_share_one_socket(server):
    c = http.client.HTTPConnection('127.0.0.1', server.port, timeout=5)
    c.request('GET', '/')
    r1 = c.getresponse(); r1.read()
    sock = c.sock
    assert r1.status == 200 and r1.version == 11 and not r1.will_close and r1.getheader('Content-Length')
    c.request('GET', '/index.html')
    r2 = c.getresponse(); r2.read()
    assert r2.status == 200 and c.sock is sock, 'the second request reused the first socket'
    c.close()


def test_an_error_then_another_request(server):
    c = http.client.HTTPConnection('127.0.0.1', server.port, timeout=5)
    c.request('GET', '/device-logs.json')
    r = c.getresponse(); r.read()
    assert r.status == 404 and r.getheader('Content-Length')
    c.request('GET', '/index.html')   # works whether or not the 404 kept the socket
    r = c.getresponse()
    assert r.status == 200 and b'<title>t</title>' in r.read()
    c.close()


def test_pipelined_after_a_body_the_server_read(server):
    body = json.dumps(PUSH).encode()
    buf = raw(server, b'POST /push-logs HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: %d\r\n\r\n' % len(body)
              + body + b'GET /index.html HTTP/1.1\r\nHost: x\r\n\r\n')
    assert statuses(buf) == [200, 200]


def test_pipelined_after_an_unused_request_fill_body(server):
    buf = raw(server, b'POST /request-fill HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nX-Train-Client: 1\r\n'
                      b'Content-Length: 2\r\n\r\n{}GET /index.html HTTP/1.1\r\nHost: x\r\n\r\n')
    assert statuses(buf) == [400, 200], 'the drained {} body was not parsed as the next request'


def test_a_refused_post_closes_instead_of_parsing_its_body(server):
    junk = b'GET /device-logs.json HTTP/1.1\r\nHost: x\r\n\r\n'   # a "request" smuggled in the unread body
    buf = raw(server, b'POST /request-fill HTTP/1.1\r\nHost: x\r\nContent-Type: text/plain\r\nContent-Length: %d\r\n\r\n' % len(junk)
              + junk, reads=2)
    assert statuses(buf) == [403] and b'Connection: close' in buf


def test_video_ranges_keep_the_connection_in_sync(server, tmp_path):
    (tmp_path / 'videos').mkdir()
    (tmp_path / 'videos' / 'clip.mp4').write_bytes(b'0123456789')
    buf = raw(server, b'GET /videos/clip.mp4 HTTP/1.1\r\nHost: x\r\nRange: bytes=2-5\r\n\r\n'
                      b'GET /videos/clip.mp4 HTTP/1.1\r\nHost: x\r\nRange: bytes=50-\r\n\r\n'
                      b'GET /index.html HTTP/1.1\r\nHost: x\r\n\r\n', reads=3)
    assert statuses(buf) == [206, 416, 200]
    assert b'Content-Range: bytes 2-5/10' in buf and b'\r\n\r\n2345HTTP/1.1 416' in buf


# ---------- /request-fill reads autofill's RunLock through food_common.lock_live ----------

@pytest.mark.parametrize('stale_after,expect', [(+600, 409), (-600, 400), (None, 400)])
def test_request_fill_respects_a_live_autofill_lock(server, tmp_path, stale_after, expect):
    import time
    if stale_after is not None:
        (tmp_path / 'autofill.lock').write_text(json.dumps({'pid': 1, 'staleAfter': time.time() + stale_after}), encoding='utf-8')
    status, body = post(server, '/request-fill', b'{}', {**JSON_HDRS, **CLIENT})
    assert status == expect
    if expect == 409:
        assert body['state'] == 'running'
    else:
        assert body['state'] == 'stale-snapshot', 'a stale or missing lock does not block (no snapshot pushed -> 400)'
