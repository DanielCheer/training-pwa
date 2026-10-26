# DJ Training - app server.
# Replaces `python -m http.server 8000`: allowlisted static serving on loopback, plus POST /push-logs so the phone can drop its
# localStorage snapshot (device-logs.json) where Claude can read it, plus
# GET /upload + POST /upload-video so DJ can send big files (form-check /
# exercise videos) from the phone straight to disk - built after Taildrop
# failed twice on flaky wifi; this rides the same tailnet HTTPS the app uses.
# Also POST /upload-food -> food-photos/ so meal pics ride with the food log.
# Also POST /request-fill -> runs autofill-food.py now (the in-app "Count now" button).
# Every POST must carry the right Content-Type and the X-Train-Client header (push-logs: JSON alone, for
# sendBeacon), and an Origin, when sent, must be allowed (private/server.json, else same-host): a page on
# another origin can't make a browser send either without a CORS preflight, which this server never grants.
# Run: python serve.py [--port N] [--dir APP_DIR]   (defaults: 8000, this file's folder; loopback only)
# Private overlay: when <dir>/private/data/ exists, the OVERLAYABLE paths are served from <dir>/private/
# instead of the committed demo copies - all-or-nothing, a file missing there is a 404 (never the demo).

import json, os, re, shutil, subprocess, sys, tempfile, threading, time
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

def set_app_dir(app_dir):
    """Every on-disk path the server touches derives from the one app dir (set once, at startup)."""
    global APP_DIR, PRIVATE_DIR, DEVICE, PREV, UPLOAD_DIR, FOOD_DIR, AUTOFILL, FILL_LOCK
    global DRAFTER, DRAFT_STATE, DRAFT_LOCK, DRAFT_POKE, DRAFT_OFF, DRAFT_LOG, ALLOWED_ORIGINS
    APP_DIR     = os.path.abspath(app_dir)
    PRIVATE_DIR = os.path.join(APP_DIR, 'private')               # gitignored: the owner's real data overlay
    DEVICE      = os.path.join(APP_DIR, 'device-logs.json')
    PREV        = os.path.join(APP_DIR, 'device-logs.prev.json')
    UPLOAD_DIR  = os.path.join(APP_DIR, 'videos')
    FOOD_DIR    = os.path.join(APP_DIR, 'food-photos')
    AUTOFILL    = os.path.join(APP_DIR, 'autofill-food.py')
    FILL_LOCK   = os.path.join(APP_DIR, 'autofill.lock')   # written by autofill-food.py (carries staleAfter)
    DRAFTER     = os.path.join(APP_DIR, 'draft-food.py')    # v119: local-model draft for each new pending meal
    DRAFT_STATE = os.path.join(APP_DIR, 'draft-state.json')
    DRAFT_LOCK  = os.path.join(APP_DIR, 'draft.lock')
    DRAFT_POKE  = os.path.join(APP_DIR, 'draft.poke')
    DRAFT_OFF   = os.path.join(APP_DIR, 'draft.off')
    DRAFT_LOG   = os.path.join(APP_DIR, 'draft.log')
    ALLOWED_ORIGINS = load_allowed_origins(os.path.join(PRIVATE_DIR, 'server.json'))

def load_allowed_origins(path):
    """The Origins a browser POST may come from, from private/server.json {"allowedOrigins": [...]}: the
    public URL(s) the app is opened at (e.g. the Tailscale HTTPS name), which a reverse proxy hides from
    the Host header. None (no file) = same-host only. A malformed file stops the server: guessing would
    either lock the phone out or open the door."""
    try:
        with open(path, 'r', encoding='utf-8') as f:
            cfg = json.load(f)
    except FileNotFoundError:
        return None
    origins = cfg.get('allowedOrigins') if isinstance(cfg, dict) else None
    if not isinstance(origins, list) or not all(isinstance(o, str) and re.match(r'^https?://[^/\s]+$', o) for o in origins):
        raise SystemExit('serve.py: %s needs {"allowedOrigins": ["https://host[:port]", ...]}' % path)
    return frozenset(origins)

set_app_dir(os.path.dirname(os.path.abspath(__file__)))
MAX_BODY   = 2 * 1024 * 1024           # push-logs: full localStorage dump is ~100-200 KB worst case
MAX_VIDEO  = 2 * 1024 * 1024 * 1024    # uploads: phone videos, be generous
MAX_FOOD   = 15 * 1024 * 1024          # food photos: client downscales to ~1600px JPEG before upload
LOCK       = threading.Lock()
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import food_common   # the same "does this meal need a draft" rule draft-food.py uses
FILL_MIN_GAP   = 60    # s between button-triggered runs
ACCESS_LOG_MAX = 400_000  # bytes; serve-access.log is trimmed to its newest half past this
FRESH_PUSH_S   = 120   # the phone pushes right before /request-fill; an older snapshot means that push failed
CLIENT_HEADER  = 'X-Train-Client'   # the app's fetches (and the upload page) send "X-Train-Client: 1"
UPLOAD_TYPES   = ('image/', 'video/', 'application/octet-stream')
# route -> (accepted Content-Types: exact, or a prefix ending in "/"; whether X-Train-Client is required).
# /push-logs takes JSON alone: the app's background flush uses navigator.sendBeacon, which can't set headers,
# and a cross-origin page can't send application/json without a preflight anyway.
POST_RULES = {'/push-logs':    (('application/json',), False),
              '/request-fill': (('application/json',), True),
              '/upload-food':  (UPLOAD_TYPES, True),
              '/upload-video': (UPLOAD_TYPES, True)}

def content_type_ok(header, accepted):
    mt = (header or '').split(';', 1)[0].strip().lower()
    return bool(mt) and any(mt.startswith(a) if a.endswith('/') else mt == a for a in accepted)
_fill_last = 0.0

UPLOAD_PAGE = b"""<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Send files to the PC</title><style>
body{background:#060A0F;color:#E9F5F2;font-family:-apple-system,system-ui,sans-serif;padding:24px 16px;max-width:520px;margin:0 auto}
h1{font-size:20px;margin-bottom:4px}p{color:#5E8490;font-size:13px;line-height:1.5;margin-bottom:16px}
input[type=file]{display:none}
label{display:block;text-align:center;background:#00E5D0;color:#00110F;font-weight:800;padding:14px;border-radius:12px;font-size:15px;margin-bottom:14px}
.f{background:#0D1720;border:1px solid #1B3040;border-radius:10px;padding:10px 12px;margin-bottom:8px;font-size:13px}
.bar{height:5px;background:#2A4454;border-radius:3px;margin-top:7px}.fill{height:100%;background:#00E5D0;border-radius:3px;width:0%}
.done{color:#3DF08C;font-weight:700}.err{color:#FF4757;font-weight:700}</style></head><body>
<h1>Send files to the PC</h1>
<p>Pick the videos - they upload <b>one at a time</b>, straight to the machine that serves this app over your own tailnet, and <b>auto-retry</b> if your wifi hiccups. Keep this page open until every file says saved.</p>
<label for="pick">Choose files</label>
<input id="pick" type="file" multiple>
<div id="list"></div>
<script>
/* Sequential queue: exactly one upload in flight at a time (parallel uploads over flaky wifi
   were stalling and looking "frozen"), with auto-retry + backoff on network drops/timeouts. */
var listEl=document.getElementById('list'),queue=[],active=false;
document.getElementById('pick').addEventListener('change',function(e){
 for(var i=0;i<e.target.files.length;i++){
  var f=e.target.files[i];
  var row=document.createElement('div');row.className='f';
  row.innerHTML='<div>'+f.name+' ('+(f.size/1048576).toFixed(1)+' MB) <span class="st">queued</span></div><div class="bar"><div class="fill"></div></div>';
  listEl.appendChild(row);
  queue.push({file:f,row:row,tries:0,done:false});
 }
 e.target.value='';
 pump();
});
function pump(){
 if(active)return;
 var job=null;
 for(var i=0;i<queue.length;i++){if(!queue[i].done){job=queue[i];break;}}
 if(!job)return;
 active=true;send(job);
}
function send(job){
 var st=job.row.querySelector('.st'),fill=job.row.querySelector('.fill');
 st.textContent=job.tries?'uploading (retry '+job.tries+')':'uploading';st.className='st';
 var xhr=new XMLHttpRequest();
 xhr.open('POST','/upload-video?name='+encodeURIComponent(job.file.name));
 xhr.setRequestHeader('X-Train-Client','1');
 xhr.setRequestHeader('Content-Type',/^(image|video)\//.test(job.file.type)?job.file.type:'application/octet-stream');
 xhr.timeout=1200000;
 xhr.upload.onprogress=function(ev){if(ev.lengthComputable)fill.style.width=(ev.loaded/ev.total*100).toFixed(0)+'%';};
 xhr.onload=function(){
  if(xhr.status===200){st.textContent='saved';st.className='st done';fill.style.width='100%';job.done=true;active=false;pump();}
  else fail(job,'HTTP '+xhr.status);
 };
 xhr.onerror=function(){fail(job,'network');};
 xhr.ontimeout=function(){fail(job,'timeout');};
 xhr.send(job.file);
}
function fail(job,why){
 job.tries++;
 var st=job.row.querySelector('.st'),fill=job.row.querySelector('.fill');
 fill.style.width='0%';
 if(job.tries<4){
  st.textContent='dropped ('+why+') - retrying in '+job.tries+'s';st.className='st';
  active=false;setTimeout(pump,job.tries*1000);
 }else{
  st.textContent='FAILED ('+why+') - pick this file again to retry';st.className='st err';
  job.done=true;active=false;pump();
 }
}
</script></body></html>"""

# GET/HEAD allowlist: exactly what the PWA (and DJ's own pages) load. Everything else in APP_DIR -
# the device-logs mirror (embeds dj-sheet-url, the Apps Script credential), logs, exports, sources,
# harness/, .claude/ - is a 404, and no directory is ever listed. Checked on the decoded, normalized
# path, so /./x, /a/../x and %2D spellings can't route around it (they did around the old prefix blocklist).
PUBLIC_FILES = {'', 'index.html', 'sw.js', 'manifest.json', 'shared-log.json', 'server-synced.json',
                'autofill-state.json', 'draft-state.json', 'upload', 'styles.css'}
PUBLIC_DIRS  = ('icons/', 'food-photos/', 'videos/', 'app/', 'data/')   # one file deep, never the folder itself
# Served from PRIVATE_DIR instead of the committed demo copies whenever PRIVATE_DIR/data/ exists. All or
# nothing: an overlayable file missing from the overlay is a 404, never a fallback to the demo file -
# a silent per-file fallback could seed demo content into a real install.
OVERLAYABLE  = {'data/profile.js', 'data/program.js', 'data/overrides.js', 'data/seed.js', 'manifest.json'}

def overlay_active():
    return os.path.isdir(os.path.join(PRIVATE_DIR, 'data'))

def public_rel(raw_path):
    """The allowlisted APP_DIR-relative path a request names, or None if it isn't servable."""
    import posixpath
    from urllib.parse import unquote
    p = unquote(raw_path.split('?', 1)[0].split('#', 1)[0])
    if '\\' in p or '\x00' in p:
        return None
    rel = posixpath.normpath('/' + p).lstrip('/')
    rel = '' if rel == '.' else rel
    if rel in PUBLIC_FILES:
        return rel
    for d in PUBLIC_DIRS:
        name = rel[len(d):]
        if rel.startswith(d) and name and '/' not in name and not name.startswith('.'):
            return rel
    return None

class Handler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.0"

    def _blocked(self):
        return public_rel(self.path) is None

    def translate_path(self, path):
        # The allowlist already ran (do_GET/do_HEAD); this only re-roots the overlayable paths.
        rel = public_rel(path)
        if rel in OVERLAYABLE and overlay_active():
            return os.path.join(PRIVATE_DIR, *rel.split('/'))
        return super().translate_path(path)

    def do_GET(self):
        if self._blocked():
            self.send_error(404); return
        p = self.path.split('?')[0]
        if p == '/upload':
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(UPLOAD_PAGE)))
            self.end_headers()
            self.wfile.write(UPLOAD_PAGE)
            return
        if p.startswith('/videos/'):
            self._serve_video(p); return
        if public_rel(self.path) in OVERLAYABLE:
            # The file behind an overlayable path depends on whether the overlay is on, so the
            # stdlib's mtime-based 304 can confirm a cached copy of the OTHER file (seen: a demo
            # profile.js revalidated as current after the overlay came back). Always send it fresh.
            del self.headers['If-Modified-Since']
        super().do_GET()

    # One line per request in serve-access.log (the stock handler logs to stderr, which is DEVNULL
    # under the watchdog, so "did the phone actually fetch the new sw.js?" was unanswerable).
    # Trimmed to the newest half once it passes ACCESS_LOG_MAX so it can't grow without bound.
    def log_message(self, fmt, *args):
        try:
            line = '%s %s %s\n' % (time.strftime('%Y-%m-%dT%H:%M:%S'), self.client_address[0], fmt % args)
            path = os.path.join(APP_DIR, 'serve-access.log')
            if os.path.exists(path) and os.path.getsize(path) > ACCESS_LOG_MAX:
                with open(path, 'r', encoding='utf-8', errors='replace') as f:
                    keep = f.readlines()[-ACCESS_LOG_MAX // 200:]
                with open(path, 'w', encoding='utf-8') as f:
                    f.writelines(keep)
            with open(path, 'a', encoding='utf-8') as f:
                f.write(line)
        except Exception:
            pass  # logging must never break a response

    def end_headers(self):
        # Force the browser to REVALIDATE the shell so a bumped sw.js VERSION is actually detected.
        # SimpleHTTPRequestHandler sends no Cache-Control → browsers hold a stale sw.js/index.html and
        # never notice a deploy (the "closed it 20 times, still old" symptom). no-cache = store but
        # revalidate; offline still works (the SW serves from its own VERSION cache). Videos/photos/
        # JSON aren't matched. (Note: serve.py must be launched with a valid stderr — see the serving
        # memory; bare pythonw crashes the handler on the per-request log, unrelated to this header.)
        try:
            p = self.path.split('?')[0]
            # app/*.js, data/*.js (and styles.css) are shell too: a heuristically-cached data/program.js
            # would pair a new index.html with an old program (or demo data with the private overlay).
            if (p == '/' or p.endswith('.html') or p.endswith('sw.js') or p.endswith('manifest.json')
                    or p.startswith('/app/') or p.startswith('/data/') or p.endswith('.css')):
                self.send_header('Cache-Control', 'no-cache, must-revalidate')
        except Exception:
            pass
        super().end_headers()

    # iOS Safari refuses to play video without byte-range (206) support, which the
    # stdlib handler doesn't implement - so /videos/ gets its own range-aware server.
    def _serve_video(self, p):
        from urllib.parse import unquote
        name = os.path.basename(unquote(p))
        full = os.path.join(UPLOAD_DIR, name)
        if not os.path.isfile(full):
            self.send_error(404); return
        size = os.path.getsize(full)
        rng = self.headers.get('Range')
        start, end = 0, size - 1
        status = 200
        if rng:
            m = re.match(r'bytes=(\d*)-(\d*)$', rng.strip())
            if m and (m.group(1) or m.group(2)):
                if m.group(1):
                    start = int(m.group(1))
                    if m.group(2):
                        end = min(int(m.group(2)), size - 1)
                else:  # suffix range: last N bytes
                    start = max(0, size - int(m.group(2)))
                if start > end or start >= size:
                    self.send_response(416)
                    self.send_header('Content-Range', f'bytes */{size}')
                    self.end_headers(); return
                status = 206
        length = end - start + 1
        self.send_response(status)
        self.send_header('Content-Type', 'video/mp4')
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Content-Length', str(length))
        if status == 206:
            self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.end_headers()
        with open(full, 'rb') as f:
            f.seek(start)
            remaining = length
            while remaining > 0:
                chunk = f.read(min(1024 * 256, remaining))
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
                    return  # player closed the connection mid-stream - normal for video scrubbing
                remaining -= len(chunk)

    def do_HEAD(self):
        if self._blocked():
            self.send_error(404); return
        super().do_HEAD()

    def _upload_video(self):
        from urllib.parse import urlparse, parse_qs, unquote
        q = parse_qs(urlparse(self.path).query)
        raw = unquote(q.get('name', ['video'])[0])
        name = re.sub(r'[^A-Za-z0-9._ -]', '_', os.path.basename(raw)) or 'video'
        try:
            n = int(self.headers.get('Content-Length', ''))
        except ValueError:
            self.send_error(411); return
        if n <= 0 or n > MAX_VIDEO:
            self.send_error(413); return
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=UPLOAD_DIR, prefix='.up-', suffix='.tmp')
        got = 0
        try:
            with os.fdopen(fd, 'wb') as f:
                while got < n:
                    chunk = self.rfile.read(min(1024 * 1024, n - got))
                    if not chunk:
                        break
                    f.write(chunk); got += len(chunk)
                f.flush(); os.fsync(f.fileno())
            if got != n:
                os.unlink(tmp); self.send_error(400); return
            dest = os.path.join(UPLOAD_DIR, name)
            base, ext = os.path.splitext(name)
            i = 1
            while os.path.exists(dest):  # never clobber an earlier upload
                dest = os.path.join(UPLOAD_DIR, f"{base}-{i}{ext}"); i += 1
            os.replace(tmp, dest)
        except Exception:
            try: os.unlink(tmp)
            except OSError: pass
            self.send_error(500); return
        resp = json.dumps({"ok": True, "saved": os.path.basename(dest), "bytes": got}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(resp)))
        self.end_headers()
        self.wfile.write(resp)

    def _upload_food(self):
        from urllib.parse import urlparse, parse_qs
        q = parse_qs(urlparse(self.path).query)
        date = q.get('date', [''])[0] or ''
        fid  = q.get('id', [''])[0] or ''
        if not re.match(r'^\d{4}-\d{2}-\d{2}$', date):
            self.send_error(400); return
        fid = re.sub(r'[^A-Za-z0-9-]', '', fid) or 'meal'
        try:
            n = int(self.headers.get('Content-Length', ''))
        except ValueError:
            self.send_error(411); return
        if n <= 0 or n > MAX_FOOD:
            self.send_error(413); return
        os.makedirs(FOOD_DIR, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=FOOD_DIR, prefix='.up-', suffix='.tmp')
        got = 0
        try:
            with os.fdopen(fd, 'wb') as f:
                while got < n:
                    chunk = self.rfile.read(min(1024 * 1024, n - got))
                    if not chunk:
                        break
                    f.write(chunk); got += len(chunk)
                f.flush(); os.fsync(f.fileno())
            if got != n:
                os.unlink(tmp); self.send_error(400); return
            name = f"{date}-{fid}.jpg"          # client always re-encodes to JPEG
            dest = os.path.join(FOOD_DIR, name)
            base, ext = os.path.splitext(name)
            i = 1
            while os.path.exists(dest):         # never clobber an earlier photo
                dest = os.path.join(FOOD_DIR, f"{base}-{i}{ext}"); i += 1
            os.replace(tmp, dest)
        except Exception:
            try: os.unlink(tmp)
            except OSError: pass
            self.send_error(500); return
        resp = json.dumps({"ok": True, "saved": "food-photos/" + os.path.basename(dest), "bytes": got}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(resp)))
        self.end_headers()
        self.wfile.write(resp)

    def _json(self, code, obj, close=False):
        resp = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(resp)))
        if close:   # the request body was never read: this connection can't carry another request
            self.send_header('Connection', 'close')
        self.end_headers()
        self.wfile.write(resp)

    def _post_refusal(self, route):
        """Why this POST is refused (a short reason), or None. See POST_RULES / ALLOWED_ORIGINS."""
        accepted, need_header = POST_RULES[route]
        origin = self.headers.get('Origin')
        if origin is not None:
            if ALLOWED_ORIGINS is not None:
                if origin not in ALLOWED_ORIGINS:
                    return 'origin'
            elif origin not in ('http://%s' % self.headers.get('Host', ''), 'https://%s' % self.headers.get('Host', '')):
                return 'origin'
        if not content_type_ok(self.headers.get('Content-Type'), accepted):
            return 'content-type'
        if need_header and self.headers.get(CLIENT_HEADER) != '1':
            return 'client-header'
        return None

    def _request_fill(self):
        """Start autofill-food.py now (detached). 202 started / 409 running / 429 too soon /
        400 stale snapshot. The app then polls autofill-state.json for the result."""
        global _fill_last
        with LOCK:
            try:
                with open(FILL_LOCK, 'r', encoding='utf-8') as f:
                    if time.time() < float(json.load(f).get('staleAfter', 0)):
                        self._json(409, {'ok': False, 'state': 'running'}); return
            except (OSError, ValueError, TypeError, AttributeError):
                pass  # no lock (or unreadable) - autofill's own lock is the real guard
            wait = FILL_MIN_GAP - (time.time() - _fill_last)
            if wait > 0:
                self._json(429, {'ok': False, 'state': 'rate-limited', 'retryIn': round(wait)}); return
            try:
                age = time.time() - os.path.getmtime(DEVICE)
            except OSError:
                age = None
            if age is None or age > FRESH_PUSH_S:
                self._json(400, {'ok': False, 'state': 'stale-snapshot', 'ageS': None if age is None else round(age)}); return
            subprocess.Popen([sys.executable, AUTOFILL, APP_DIR, '--trigger=request'], cwd=APP_DIR,
                             stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                             creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0) | getattr(subprocess, 'DETACHED_PROCESS', 0))
            _fill_last = time.time()
        self._json(202, {'ok': True, 'state': 'started'})

    def _maybe_spawn_draft(self, ls):
        """After a phone push: wake draft-food.py if a pending meal needs a draft (or a queued photo
        means one soon - the worker warms the model). A run in flight gets draft.poke instead, so a
        meal logged mid-run is picked up before it exits. Never blocks or fails the push itself."""
        try:
            if os.path.exists(DRAFT_OFF) or not os.path.exists(DRAFTER):
                return
            ready, waiting = food_common.draft_work(ls, food_common.read_json(DRAFT_STATE, retries=0))
            if not ready and not waiting:
                return
            if food_common.lock_live(DRAFT_LOCK):
                open(DRAFT_POKE, 'a').close(); return
            subprocess.Popen([sys.executable, DRAFTER, APP_DIR, '--trigger=push'], cwd=APP_DIR,
                             stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                             creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0) | getattr(subprocess, 'DETACHED_PROCESS', 0))
        except Exception as ex:   # loud in the draft log, but the push already succeeded
            try:
                with open(DRAFT_LOG, 'a', encoding='utf-8') as f:
                    f.write('%s [serve] ERROR: draft spawn failed: %r\n' % (food_common.now_iso(), ex))
            except OSError:
                pass

    def do_POST(self):
        route = self.path.split('?')[0]
        if route not in POST_RULES:
            self.send_error(404); return
        why = self._post_refusal(route)
        if why:
            self._json(403, {'ok': False, 'state': 'forbidden', 'reason': why}, close=True); return
        if route == '/upload-video':
            self._upload_video(); return
        if route == '/upload-food':
            self._upload_food(); return
        if route == '/request-fill':
            self._request_fill(); return
        try:
            n = int(self.headers.get('Content-Length', ''))
        except ValueError:
            self.send_error(411); return
        if n <= 0 or n > MAX_BODY:
            self.send_error(413); return
        body = self.rfile.read(n)
        try:
            data = json.loads(body)
            if not isinstance(data, dict) or 'pushedAt' not in data or 'ls' not in data:
                raise ValueError
        except Exception:
            self.send_error(400); return
        with LOCK:
            if os.path.exists(DEVICE):
                shutil.copyfile(DEVICE, PREV)  # junk-POST insurance
            fd, tmp = tempfile.mkstemp(dir=APP_DIR, prefix='.device-logs-', suffix='.tmp')
            with os.fdopen(fd, 'wb') as f:
                f.write(body); f.flush(); os.fsync(f.fileno())
            for i in range(4):  # Windows: os.replace fails if a reader holds the dest open
                try:
                    os.replace(tmp, DEVICE); break
                except PermissionError:
                    if i == 3:
                        os.unlink(tmp); self.send_error(503); return
                    time.sleep(0.05)
        resp = json.dumps({"ok": True, "bytes": n}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(resp)))
        self.end_headers()
        self.wfile.write(resp)
        self._maybe_spawn_draft(data.get('ls') or {})

def make_server(app_dir=None, port=8000):
    """The app server for app_dir on 127.0.0.1:port. Loopback only, always: Tailscale Serve proxies
    to it, so binding every interface would only expose the unauthenticated app to the LAN."""
    if app_dir is not None:
        set_app_dir(app_dir)
    return ThreadingHTTPServer(('127.0.0.1', port), partial(Handler, directory=APP_DIR))

if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser(description='Serve the training app (loopback only).')
    ap.add_argument('--port', type=int, default=8000)
    ap.add_argument('--dir', default=None, help="app dir to serve (default: this file's folder)")
    a = ap.parse_args()
    srv = make_server(a.dir, a.port)
    print(f"serving {APP_DIR} on 127.0.0.1:{a.port} (static allowlist + POST /push-logs + /upload)"
          f"{' · private overlay ON' if overlay_active() else ' · demo data'}")
    srv.serve_forever()
