# Changelog

Release notes for each `sw.js` VERSION.

## v122

App:
- A full phone storage now fails loud: every write goes through `lsSet()`, which shows a persistent banner naming what was not saved instead of throwing out of the middle of a save (or, in five places, swallowing it).
- End Workout empties the trained day's note slots only after the notes archive has saved, so a full store can no longer lose them. The archive stays capped at 500 notes, and trimming it shows a warning with the count.
- The Monday rotation resolves per date in `dayObj()`: program data is never written at runtime, and a past Monday reads back as its own week's variant. One `progWeekOf()` measures to the day's noon, so a DST change can't shift a week boundary by an hour.
- The workout and food logs are parsed once per render (memoized, invalidated on write).
- Faint `--dim` text clears 3:1 on both card backgrounds (#536F7E).
- Removed dead code: the Tuesday full/short toggle (the device push payload is now `v: 2`, without `tueMode`), the `alts` target branch and one unused diagram figure. A harness check now proves every diagram key resolves.

## v121

App:
- Updates land in one launch. Right after launch the app reloads onto a new version by itself. Later, or with unsaved text, it shows a "New version ready - Reload" toast. Offline, any in-scope page opens the cached app, and other cache misses get a 503 instead of a network error.
- Home hero: a countdown before the season, then "in-season - week N" or "holding at <phase> until <goal>". It never shows "0 days to tip-off".
- Goal bars are derived. Bodyweight comes from the latest weigh-in; lean mass and body fat come from the last scan. Each bar names its source.
- Fuel sample day: the Total row and a "vs your targets" line are computed from the item rows, and the prose names bands from `DAY_TARGETS`.
- Meals, weigh-ins and bar bases are edited in inline forms instead of `prompt()`. Invalid input keeps the old value and shows an error, and a pending meal only counts once all four macros parse.
- Accessibility: pinch-zoom allowed, every field labelled, done-circles are real checkboxes, icon buttons are named, and faint text meets 3:1 contrast on cards.
- The diagram animation loop runs only while a diagram is open.
- Phase date labels use calendar days, so a DST change no longer ends a phase a day early.

Server and PC agents:
- POSTs need the right Content-Type plus `X-Train-Client: 1` (push-logs: JSON alone, for sendBeacon). An `Origin`, when sent, must be in `private/server.json` (same-host without it).
- `/push-logs` refuses a snapshot older than the stored one (409 `stale-seq`). The app adopts the server's seq and retries once.
- Uploads have a 4 GB/day budget and a 10 GB free-disk floor (507).
- HTTP/1.1 keep-alive, with a lingering close after a refused POST.
- Local drafts free the model's memory: `keep_alive` is 2m per meal and 5m per warm-up, the model is unloaded explicitly after a run, and the watchdog backstop is 1m (was 30m).

Tooling: a pytest suite (allowlist, POST hardening, food_common, draft requests, shell consistency), requirements files, and GitHub Actions running the harness (UTC + Toronto) and pytest.

## v120

- index.html split into `styles.css`, `app/*.js` and `data/*.js` (no build step); a private data overlay keeps the owner's program and profile out of the repo, and a fictional demo persona ships instead.
- The harness runs the split files in order in one vm context and still proves zero behavior change against the v119 single-file baseline.

Earlier history (v1 to v119) is being rewritten from the private log into feature-level notes.
