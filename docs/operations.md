# Operations

How the owner's install runs day to day. The public demo needs none of this: it is static files.

Paths below are relative to the app folder (`<app>`), the checkout that `serve.py` lives in. Every
script derives its paths from its own location, so the folder can live anywhere.

## Layout of a real install

```
<app>/                      the git checkout (code + demo data)
<app>/private/              gitignored: the owner's overlay and config
    data/profile.js program.js overrides.js seed.js
    manifest.json
    food-defaults.md        shorthand → numbers for the meal estimator (required by autofill)
    server.json             {"allowedOrigins": ["https://<machine>.<your-tailnet-domain>:<port>"]}
    harness/                private harness sections + the single-file baseline
<app>/device-logs.json      runtime state written by the scripts (all gitignored)
<app>/shared-log.json  server-synced.json  autofill-state.json  draft-state.json
<app>/food-photos/  videos/  exports/
<app>/*.log  *.lock  *.off  draft.poke
```

## The server

```bash
python serve.py                    # 127.0.0.1:8000, serving this folder
python serve.py --port 8003 --dir /path/to/a/copy
```

`serve.py` only ever binds `127.0.0.1`. The phone reaches it through **Tailscale Serve**, which terminates
HTTPS on the tailnet name and proxies to the loopback port, for example:

```bash
tailscale serve --bg --https=<port> http://127.0.0.1:8000
```

The app must be opened over http(s) for the service worker and install to work; `file://` renders but
can't install or work offline. On the phone: open the tailnet URL, then Share → Add to Home Screen (iOS)
or the install prompt (Android).

`serve-access.log` gets one line per request (trimmed to its newest half past 400 KB), which is how you
answer "did the phone fetch the new `sw.js`?".

## The watchdog

`server-watchdog.py` keeps the services up. Run it once to check, or in a loop:

```bash
python server-watchdog.py          # one check, then exit
pythonw server-watchdog.py --loop  # every 5 minutes, forever
```

On Windows a small launcher in the user's Startup folder starts the loop at login, so the server comes
back after a reboot with no admin rights. It exists because the server once died on a reboot and the
phone-to-PC sync froze silently for days.

It supervises a list of services (`SERVICES`):

- `serve.py` on its port.
- A **separate Ollama instance** on `127.0.0.1:11435` for the local drafts, started with environment
  variables that pin it to one configured GPU (and disable Vulkan, which would otherwise expose other
  cards), below-normal priority and a short `OLLAMA_KEEP_ALIVE` backstop. After every start the watchdog
  reads the instance's log and requires exactly one `inference compute` device with the configured name;
  anything else is logged as `FAULT gpu-placement` and the instance is killed (fails closed). The owner's
  own Ollama on the default port is never touched.

`server-watchdog.log` gets a line for every fault or restart and one `ok` heartbeat per day, so a quiet log
still proves the watchdog is alive.

## Scheduled meal count

`autofill-food.py` runs from a scheduled task daily at 04:30, after the 4 AM food-day roll:

- Windows Task Scheduler: action `pythonw <app>\autofill-food.py`, "run only when user is logged on",
  "run as soon as possible after a missed start". The Claude CLI must be on that user's PATH and signed in.
- `AUTOFILL_MODEL` picks the model; `AUTOFILL_DIR` (or the first argument) overrides the app folder.

Pause it with an `autofill.off` file in `<app>`. To stop it entirely, disable or unregister the task.

## Pausing things

| File in `<app>` | Effect |
|---|---|
| `autofill.off` | the meal count exits immediately (nightly and Count now) |
| `draft.off` | no drafts are spawned, and the watchdog stops (re)starting the model server, freeing its memory |

## Logs and state

| File | Written by | Contents |
|---|---|---|
| `serve-access.log` | serve.py | one line per request |
| `server-watchdog.log` | watchdog | faults, restarts, daily heartbeat |
| `ollama-3070.log` | the model server | its own log, rotated at 5 MB (the watchdog reads it for the GPU check) |
| `autofill.log`, `autofill-state.json` | autofill-food.py | one line per counted meal and errors with the call's cost; the status strip's state |
| `draft.log`, `draft-state.json` | draft-food.py | one line per draft or skip with timing; the drafts themselves |

## Deploying a change

1. Make the change in a working copy, never in the live folder.
2. Run `node harness/harness.js` (with and without the overlay: `--demo`) and `python -m pytest -q`.
3. Bump `VERSION` in `sw.js` for any shell change and add a `CHANGELOG.md` entry; without a new version,
   phones keep serving the old cached shell.
4. In the live folder: `git pull`. Restart `serve.py` only if `serve.py` or `food_common.py` changed (stop
   it; the watchdog restarts it within 5 minutes, or run the watchdog once).
5. Open the app on the phone. It picks up the new version on the next launch (or shows the reload toast).
   Check `serve-access.log` for `GET /sw.js` and a `POST /push-logs 200`.

## Testing the agents against a scratch copy

```bash
python autofill-food.py /path/to/scratch --trigger=request   # with a seeded device-logs.json + shared-log.json
python draft-food.py /path/to/scratch --trigger=manual
```

Never point a test at the live folder: the scripts write `shared-log.json`, which the phone imports.
