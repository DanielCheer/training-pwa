#!/usr/bin/env python
"""Watchdog for the DJ training app server (serve.py on 127.0.0.1:8000).

WHY THIS EXISTS: serve.py does NOT survive a PC reboot, and there was no auto-start and no health
monitor. On ~2026-07-30 the server died on a reboot and the phone->Claude sync SILENTLY froze for
8 days (device-logs.json stuck at the last push) before anyone noticed. This is the root-cause fix
(cf. the "any subsystem that can die silently gets a freshness monitor on day one" rule).

A Startup-folder launcher (dj-training-server-watchdog.vbs) runs this at login with `--loop`, so it
auto-starts after every reboot with NO admin rights needed. In --loop mode it checks the port every
INTERVAL (5 min) forever and, if the server is down, restarts it detached. Self-healing beats alerting —
the failure fixes itself within one interval (and instantly at login) instead of waiting for someone to
notice. Every FAULT is logged to server-watchdog.log, plus one "ok" heartbeat per day so a healthy
log still proves the watchdog is alive without spamming.

v119: it supervises a LIST of services (SERVICES below). The second one is the Ollama instance that
draft-food.py uses for instant meal drafts. It is pinned to the RTX 3070 - DJ's 3090 is reserved for
his own work and must never be touched - via its env, and that pinning is VERIFIED after every start
from the instance's own log: exactly one `inference compute` device, and it must be the 3070.
Anything else = FAULT gpu-placement, the instance is killed, and it is not retried until the next
check (fails closed, loudly). Its env sets OLLAMA_KEEP_ALIVE=1m, overriding DJ's user-level 0. It is only a backstop: draft-food.py
sends its own keep_alive with every request (2m per meal, 5m for a warm-up ahead of a queued photo)
and unloads the model explicitly after its last meal, so the ~20 GB the 27B model holds goes back
within seconds instead of sitting idle for 30 min (it was blocking DJ's AI-studio renders). A request
without its own keep_alive gets 1m. DJ's normal Ollama on :11434 is never referenced.
A draft.off file pauses it (not started, no FAULT).

Usage:
  python server-watchdog.py           one check, then exit (safe for manual/ad-hoc runs)
  pythonw server-watchdog.py --loop   run forever, check every INTERVAL (how Startup launches it)
"""
import socket, subprocess, os, re, sys, time
from datetime import datetime

APP      = os.path.dirname(os.path.abspath(__file__))
LOG      = os.path.join(APP, 'server-watchdog.log')
INTERVAL = 300   # seconds between checks in --loop mode (5 min; the draft path is interactive)
CREATE_NO_WINDOW = 0x08000000
DETACHED_PROCESS = 0x00000008
BELOW_NORMAL_PRIORITY_CLASS = 0x00004000   # inherited by Ollama's llama-server child: DJ's games/work win
SERVICE_LOG_MAX = 5 * 1024 * 1024
GPU_CHECK_S = 15
# Resolve pythonw.exe (no console window) whether we were launched via python or pythonw.
PYW = sys.executable if sys.executable.lower().endswith('pythonw.exe') \
      else os.path.join(os.path.dirname(sys.executable), 'pythonw.exe')
if not os.path.exists(PYW):
    PYW = sys.executable  # fall back to whatever launched us
OLLAMA_EXE = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Programs', 'Ollama', 'ollama.exe')

SERVICES = [
    {'name': 'serve.py', 'port': 8000, 'cmd': [PYW, 'serve.py']},
    {'name': 'ollama-3070', 'port': 11435, 'cmd': [OLLAMA_EXE, 'serve'],
     'env': {'CUDA_DEVICE_ORDER': 'PCI_BUS_ID', 'CUDA_VISIBLE_DEVICES': '0',
             'OLLAMA_VULKAN': '0', 'GGML_VK_VISIBLE_DEVICES': '-1',   # without these Ollama still sees the 3090 via Vulkan
             'OLLAMA_HOST': '127.0.0.1:11435', 'OLLAMA_KEEP_ALIVE': '1m',   # backstop only; draft-food.py sets keep_alive per request + unloads
             'OLLAMA_MAX_LOADED_MODELS': '1', 'OLLAMA_NUM_PARALLEL': '1'},
     'log': 'ollama-3070.log', 'off_file': 'draft.off', 'gpu_name': 'NVIDIA GeForce RTX 3070',
     'priority': BELOW_NORMAL_PRIORITY_CLASS},
]


def is_up(port):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(1.5)
    try:
        s.connect(('127.0.0.1', port))
        return True
    except OSError:
        return False
    finally:
        s.close()


def last_log_date():
    try:
        with open(LOG, encoding='utf-8') as f:
            lines = f.readlines()
        return lines[-1][:10] if lines else ''
    except OSError:
        return ''


def log(msg):
    try:
        with open(LOG, 'a', encoding='utf-8') as f:
            f.write("%s %s\n" % (datetime.now().isoformat(timespec='seconds'), msg))
    except OSError:
        pass


def gpu_devices(log_path, offset):
    """`inference compute` lines the instance wrote after `offset` (one per device it will use)."""
    try:
        with open(log_path, 'rb') as f:
            f.seek(offset)
            txt = f.read().decode('utf-8', 'replace')
    except OSError:
        return []
    return re.findall(r'msg="inference compute".*', txt)


def start(svc):
    """Start one service detached; for a GPU service, prove it sees only the intended card."""
    if not os.path.exists(svc['cmd'][0]):
        log("DOWN - %s: executable missing (%s)" % (svc['name'], svc['cmd'][0])); return
    out, offset = subprocess.DEVNULL, 0
    if svc.get('log'):
        lp = os.path.join(APP, svc['log'])
        if os.path.exists(lp) and os.path.getsize(lp) > SERVICE_LOG_MAX:
            os.replace(lp, lp + '.prev')
        out = open(lp, 'ab')
        offset = out.tell()
    try:
        proc = subprocess.Popen(
            svc['cmd'], cwd=APP, env={**os.environ, **svc.get('env', {})},
            creationflags=CREATE_NO_WINDOW | DETACHED_PROCESS | svc.get('priority', 0),
            stdin=subprocess.DEVNULL, stdout=out, stderr=out)
    finally:
        if out is not subprocess.DEVNULL:
            out.close()
    if svc.get('gpu_name'):
        devs = []
        for _ in range(GPU_CHECK_S * 2):
            time.sleep(0.5)
            devs = gpu_devices(os.path.join(APP, svc['log']), offset)
            if devs:
                time.sleep(1.0)   # let every device line land before judging
                devs = gpu_devices(os.path.join(APP, svc['log']), offset)
                break
        ok = len(devs) == 1 and ('description="%s"' % svc['gpu_name']) in devs[0]
        if not ok:
            proc.kill()
            log("FAULT gpu-placement - %s saw %d device(s), expected only %s; killed it: %s"
                % (svc['name'], len(devs), svc['gpu_name'], ' | '.join(d[-160:] for d in devs) or 'no device line'))
            return
    time.sleep(1.0)
    log("DOWN - restarted %s; now %s" % (svc['name'], "UP" if is_up(svc['port']) else "STILL DOWN (see its log)"))


def check():
    """One health check per service: restart if down, one daily heartbeat when all is well."""
    up = []
    for svc in SERVICES:
        if svc.get('off_file') and os.path.exists(os.path.join(APP, svc['off_file'])):
            continue   # deliberately paused
        if is_up(svc['port']):
            up.append('%s :%d' % (svc['name'], svc['port'])); continue
        try:
            start(svc)
        except Exception as e:  # noqa: BLE001 - watchdog must never crash silently
            log("DOWN - %s restart FAILED: %r" % (svc['name'], e))
    if up and last_log_date() != datetime.now().strftime('%Y-%m-%d'):
        log("ok - listening: %s (daily heartbeat)" % ', '.join(up))


def main():
    if '--loop' in sys.argv:
        log("watchdog loop started (pid %d, every %d min, services: %s)" % (os.getpid(), INTERVAL // 60, ", ".join(x["name"] for x in SERVICES)))
        while True:
            try:
                check()
            except Exception as e:  # noqa: BLE001 - the loop must never die on a transient error
                log("watchdog check error: %r" % (e,))
            time.sleep(INTERVAL)
    else:
        check()


if __name__ == '__main__':
    main()
