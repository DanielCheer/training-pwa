# Changelog

Release notes for each `sw.js` VERSION.

## v125
App:
- Text boxes are 16px, so tapping one on iPhone no longer zooms the page in and leaves it scrolling sideways.

## v124
App:
- A picked food photo shows on its meal row right away, before it finishes processing.
- Meal History shows each meal's photo thumbnail (tap to enlarge) instead of a camera icon.

## v123

App:
- Double-tap no longer zooms the page (`touch-action: manipulation`); pinch-zoom still works.

## v122

App:
- A full phone storage now fails loud: every write goes through `lsSet()`, which shows a persistent banner naming what was not saved instead of throwing out of the middle of a save (or, in five places, swallowing it).
- End Workout empties the trained day's note slots only after the notes archive has saved, so a full store can no longer lose them. The archive stays capped at 500 notes, and trimming it shows a warning with the count.
- The Monday rotation resolves per date in `dayObj()`: program data is never written at runtime, and a past Monday reads back as its own week's variant. One `progWeekOf()` measures to the day's noon, so a DST change can't shift a week boundary by an hour.
- The workout and food logs are parsed once per render (memoized, invalidated on write).
- Faint `--dim` text clears 3:1 on both card backgrounds (#536F7E).
- Without a companion server (the static demo), a pending meal no longer claims it is "drafting…" or waiting for the auto-fill; it says it counts once its numbers are typed in.
- The Home hero's words around the season date come from `PROFILE.seasonWords` instead of being hardcoded.
- The demo persona has the gym-session picker (its four lifting days).
- Removed dead code: the Tuesday full/short toggle (the device push payload is now `v: 2`, without `tueMode`), the `alts` target branch and one unused diagram figure. A harness check now proves every diagram key resolves.

Tooling: `tools/audit-public.sh` (tracked files vs an expected list, the private PII patterns over every commit and message, noreply identities); harness sections for diagram keys, the Monday rotation, storage-full, the log memo, the notes archive and the session picker; a pytest check that every app URL is relative (the Pages demo runs from a subpath).

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

Tooling: a pytest suite (allowlist, POST hardening, food_common, draft requests, shell consistency), requirements files, and GitHub Actions running the harness (in UTC and in a daylight-saving time zone) and pytest.

## v120

- index.html split into `styles.css`, `app/*.js` and `data/*.js` (no build step); a private data overlay keeps the owner's program and profile out of the repo, and a fictional demo persona ships instead.
- The harness runs the split files in order in one vm context and still proves zero behavior change against the v119 single-file baseline.

## Before v120: the single-file app

Up to v119 the whole app was one `index.html`. These notes summarize what it gained, by version range.

### v114 to v119: capture now, count once a day
- v114: a gym-session picker on today's tab. A session is picked per date (not tied to a weekday), the next
  one in the rotation is suggested from the last pick, and history resolves against the session actually run.
- v116: the meal log. Text, a photo, or both are saved instantly as a **pending** meal, offline-safe (photos
  wait in IndexedDB until the upload succeeds). Pending meals are excluded from every total. `autofill-food.py`
  counts all pending meals in one headless Claude call nightly, or on "Count now", and answers through the inbox.
  The food day now rolls at 4 AM. A status strip shows the phone-to-PC sync age and the last count's result.
- v117: the photo button offers the photo library, not just the camera.
- v118: `food-move` re-dates a meal whole; the photo picker takes several photos (one meal each).
- v119: local drafts. A local model writes an approximate estimate within about a minute; the app shows it
  apart from the counted totals and keeps it after the final count so its accuracy can be measured. The inbox
  merge now skips unknown entry types instead of importing them as meals.

### v99 to v113: programs that change without rewriting history
- v99: dated base epochs. A new weekly schedule goes live from a date; every earlier date still resolves
  against the old week, so logged notes keep their exercise names. The Why tab is per epoch too.
- v100 and v101: seeded targets stay visible after the Build phase as working-weight references, and a
  goal-gated phase hold keeps an open-ended goal in the Build phase instead of ramping into a taper.
  The timeline marker stays inside the held phase.
- v105: the harness's Fuel-tab checks derive from `DAY_TARGETS` instead of fixed numbers.
- v106: bodyweight exercises carry one signed load: negative is machine assistance, positive is added
  weight, so assisted-to-weighted progress is one continuous number.
- v107: new prep blocks are appended, never inserted, so existing slot indices (and the notes keyed to
  them) can't shift.
- v108: coaching cues match the program's progression rule everywhere they render.
- v112: targets come from the log. The next target is derived from the last session's top set (repeat the
  weight, or add the increment once the rep cap is reached); seeds are only the fallback.
- v102 to v113 also added a series of one-day overrides on the new epoch, each with its own harness section.

### v80 to v98: dated overrides at scale
- One-day and partial overrides became routine: a whole day swapped for another block, a rest day, a prep
  block queued onto another day. Each reuses existing exercise lists by reference, empties sections that must
  not leak through the merge, and keeps the weekday identity so sets log under the right slot.
- v86: a "last session" line (top set) under each exercise's target.
- v87 and v89: End Workout exports the notes into the CSV, archives them on the phone, then clears the
  trained day's note boxes. The trained day is derived from today's logged sets, not the tab being viewed.
- v88: a Prep section, spread across the week instead of stacked on one day.
- v94: a combined either-or exercise split into two, each with its own target.

### v60 to v79: read-time schedule and per-set targets
- v60: `WEEK_OVERRIDES` and the read-time `dayObj()` resolver (dated changes that expire by themselves), plus a
  sweep that derived phase dates, week caps and Fuel targets from config, with fail-loud config checks.
- v61 and v69: the inbox gained weigh-ins and `workout-update` (correct a logged set by id).
- v63: checkmarks persist per day, so a reload or a backgrounded app keeps them.
- v64 and v76: notes on the Stretch tab; warm-ups became loggable sections.
- v66: daily targets drive the Log bars, the day verdict and the Fuel tab from one config object.
- v67: an audit batch: ten correctness fixes (midnight day roll, local dates, delete-by-id, weigh-in dedup,
  note-date resolution, override sanity checks, escaping) and UX work (lightbox, restore day and section,
  audible timer, plate persistence, scroll restore).
- v72: per-exercise weight targets in the Build phase, ramped weekly, with units derived from load types.
- v73: one local day boundary for food and workouts (it had been UTC).
- v78: Cardio and sauna got their own section tab.

### v1 to v59: the foundations
- A single-file, dependency-free PWA with an offline service worker, installable to the home screen.
- An animated diagram library: every exercise is two stick-figure keyframes, tweened like a real rep, with an
  end-pose ghost, a bar-path trace and a slow-motion toggle; a front/back muscle map per day.
- Phases with per-phase prescriptions, a Why tab, and a Fuel tab.
- Structured per-set logging with CSV export, a bodyweight log, a timestamp-based rest timer, and a food log
  with progress bars against daily targets.
- An optional Google Sheet sync through an Apps Script web app that dedups by entry id.
- The companion server: `serve.py` (replacing `python -m http.server`) with the device push, and the
  shared-log inbox, first for meals and then for sets.
- v44: load types (barbell total with a plate picker, per-hand dumbbells, box height, bodyweight), meal
  photos, and in-place `food-update` patches.
- v53: optional quality nutrients (sugar, fiber, saturated fat), estimate-only and never shown as zero.
- A correction backstop that flags set notes that read like a units mistake.
