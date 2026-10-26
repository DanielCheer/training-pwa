# Agent contracts

The phone and the PC never share memory. They exchange four files and three endpoints, and every agent that
touches them (the PC scripts, or a Claude session working for the owner) follows the rules below. The rules
exist because each one was broken once.

Shared ground rules:

- **Atomic writes only.** Write a temp file in the same folder, flush, `os.replace` it over the target, then
  read it back. A phone must never fetch a half-written file. `food_common.atomic_write` does this.
- **Errors never become data.** A failed or uncertain estimate is a skip with a reason, never a zero or a
  guess. Unreadable input files abort the run without touching anything.
- **Dates are local days.** Food entries use the *food day* (it rolls at `FOOD_DAY_ROLL_HOUR`, 4 AM, so a
  meal eaten at 01:00 belongs to the previous day). Workout entries use the calendar day.
- **The phone owns its data.** Agents add entries or patch specific ones by id. They never rewrite the
  phone's state wholesale, and they cannot delete what is already on the phone.

## 1. Device push: `POST /push-logs` → `device-logs.json`

The phone snapshots every `dj-` localStorage key and posts it after any change (4 s debounce), on load, on
foreground and right after End Workout; a backgrounded app flushes a pending push with `sendBeacon`.

```json
{"v": 2, "pushedAt": "2026-10-26T15:00:00.000Z", "seq": 412, "day": "thu", "sec": "main",
 "phase": 1, "done": {"thumain0": true}, "ls": {"dj-workout-log": "[…]", "dj-foodlog-2026-10-26": "[…]"}}
```

- `ls` maps each key to its raw string (JSON, except a few plain values).
- `seq` is a persisted counter. The server refuses a snapshot whose `seq` is lower than the stored one with
  `409 {"state": "stale-seq", "seq": N}`; the app adopts `N` and retries once. An equal `seq` (a retry) is
  accepted. `v` became 2 in v122, when `tueMode` was dropped.
- `serve.py` keeps the previous snapshot as `device-logs.prev.json`. **Neither file is ever served**: the
  snapshot contains `dj-sheet-url`, which is a credential for the owner's Google Sheet.

Reading it:

- Everything is as of `pushedAt`. If it predates the question meaningfully, ask the owner to open the app
  once rather than exporting a hole.
- Tolerate a read during a replace (retry once); if the file is unparseable, use `.prev.json` and say so.

## 2. Inbox: `shared-log.json` → the phone

Agents write `{"v": 1, "entries": [ … ]}`. The app fetches it network-only on load and on foreground
(60 s cooldown) and merges each entry whose `id` it has not imported yet. Imported ids are recorded in
`dj-shared-imported-ids`, so an entry the owner deleted on the phone never comes back.

Writing rules:

1. Read the current file first. If it is unparseable, stop and report it; never regenerate it.
2. Append only (the one in-place exception is your own not-yet-imported entry), atomic write, verify.
3. Prune entries older than about 14 days on each write.
4. `id` is unique per logical event: `c-<UTC timestamp>-<slug>` for chat-sourced entries, `u-…` for updates.
5. A `date` is `YYYY-MM-DD`; an entry without a valid date is ignored.
6. An unknown `type` is skipped and **not** marked imported, so a newer app version can apply it later.

Entry types:

| `type` | Shape | Effect |
|---|---|---|
| *(none)* | `{id, date, n, kcal, p, c, f, sugar?, fiber?, satf?, photo?}` | a new counted meal on that food day |
| `workout` | `{id, date, day, exercise, weight, sets, reps, note?, unit?, ld?, plates?}` | a logged set (one entry per set); `unit`, `ld` and `plates` are type-checked before they are kept |
| `workout-update` | `{id, date, target, weight?, reps?, unit?, ld?, note?, plates?, exercise?}` | patches the set whose `id === target` |
| `cardio` | `{id, date, activity, min}` | a cardio entry |
| `weigh` | `{id, date, w}` | a weigh-in (one per day; an existing one wins) |
| `food-update` | `{id, date, target, kcal?, p?, c?, f?, n?, photo?, sugar?, fiber?, satf?}` | patches a meal in place; carrying **all four** of kcal/p/c/f also clears `pending` |
| `food-move` | `{id, date, from, target}` | moves a meal whole from food day `from` to `date` |

Retry semantics: an update or move whose target is not on the phone yet is **not** marked imported, so it
is retried on every sync. A move also waits while the meal's photo is still queued for upload. A move is
idempotent once the meal is at its destination; any later `food-update` for that meal must use the
destination date and come after the move in the file. `photo` must match `food-photos/<safe name>`.

## 3. Meal counting: `autofill-food.py`

Runs nightly at 04:30 (after the 4 AM food-day roll) and when the owner taps **Count now**
(`POST /request-fill` → `202 started`, `409 running`, `429 rate-limited` with `retryIn`, or
`400 stale-snapshot` when the phone's last push is older than 120 s, meaning the push before the button
failed). One lock (`autofill.lock`, with a `staleAfter` time) keeps the two paths from overlapping.

1. Read `device-logs.json` (falling back to `.prev.json`) and collect every `pending` meal across all dates.
   Skip meals whose photo is still queued (`waiting-photo`) or missing on disk (`photo-missing`), and meals
   that already have a full `food-update` waiting in the inbox.
2. Send all of them in **one** headless call: `claude -p` with `Read,WebSearch,WebFetch` allowed and
   `Bash,Edit,Write,NotebookEdit` disallowed, plus the owner's food-defaults file (shorthand → numbers),
   which lives in `private/` and is required (missing → `config-error`). Nutrient keys come from
   `NUTRIENTS` in `app/config.js`, never a hand-kept copy.
3. The model returns a JSON array, one object per id, or `{id, skip: true, reason}`. Python validates every
   number and does all file I/O: valid answers become `food-update` entries; anything else stays pending
   with its reason.
4. Write `autofill-state.json` (served network-only to the status strip):
   `{v: 2, lastRun, startedBy, lastResult, filled[], skipped[{id, reason}], pending, snapshotAt, durationS, error}`.

An empty run never calls the model. `autofill.off` in the app folder pauses it.

## 4. Drafts: `draft-food.py` → `draft-state.json`

A draft is a quick, local, approximate number shown while a meal waits for the nightly count. **A draft is
never a count.**

- **Trigger.** After each successful push, `serve.py` checks `food_common.draft_work()` and spawns the worker
  when a pending meal needs a draft (or a photo is still queued, to warm the model). If one is already
  running it touches `draft.poke`, and the worker re-scans before it exits. No timers, no polling.
- **Model.** A separate Ollama instance on `127.0.0.1:11435`, one meal per request, photo downscaled to at
  most 896 px. Each request names its own `keep_alive` (2 min per meal), and the model is unloaded
  explicitly after the batch so its memory goes back right away.
- **Answer contract.** `{items: [{name, kcal}], kcal, p, c, f, unsure, basis}`. `unsure`, items that don't
  add up to the total (beyond max(50 kcal, 10 %)), or macros that don't match the calories by Atwater
  (beyond 25 %) become a skip (`estimator-unsure`, `inconsistent`, `invalid-numbers`, `parse-error`). No
  clamping, no correction factor. Transient failures (`ollama-down`, `timeout`, `http-error`) retry on the
  next push; other skips wait until the meal's text or photo changes.
- **State.** `{v: 1, lastRun, startedBy, lastResult, error, model, durationS, snapshotAt,
  drafts: {<id>: {date, of: {n, photo}, kcal, p, c, f, src, basis, at, model}}, skipped: [{id, reason, of, transient, at}]}`.
  `of` records the inputs; if the meal's name or photo changes, the draft is stale.
- **On the phone.** `applyDrafts()` copies a newer draft onto the meal as `entry.draft`. It never clears
  `pending` and never enters the counted totals, the day verdict, the Sheet or the CSV's macro columns.
  When the final count lands, the draft stays on the entry ("draft was ≈N"), so draft-vs-final accuracy can
  be measured.
- **Agent rules.** Never copy draft numbers into a `food-update`, never write drafts to the inbox, and never
  include `entry.draft` in the counting prompt, so the final estimate stays independent.

`draft.off` pauses it (the watchdog then also stops starting the model server).

## 5. Uploads

- `POST /upload-food?date=YYYY-MM-DD&id=<meal id>` (image body): saves `food-photos/<date>-<id>.jpg`,
  no-clobber, 15 MB cap, returns `{ok, saved: "food-photos/…"}`. The app queues photos in IndexedDB and
  uploads them when it can, so capture works offline.
- `POST /upload-video` (the `/upload` page): large files to `videos/`, served back with range support.
- All uploads share a per-day byte budget and a free-disk floor; past either the server answers `507`.

## 6. Google Sheet sync (optional)

End Workout and Review meals POST every not-yet-synced set and counted meal to the owner's Apps Script web
app (`apps-script.gs`), which files them into "Workouts" and "Food" tabs and **dedups by entry id** at the
Sheet, so the phone and a server-side export can both send rows without duplicates.
`server-synced.json` (`{v: 1, workoutIds: [], foodIds: []}`) tells the phone which ids a server-side export
already sent; it is hygiene, the Sheet's dedup is the guarantee. Pending meals and drafts are never sent.

## 7. POST hardening (every endpoint)

Every POST needs the right `Content-Type` and the header `X-Train-Client: 1` (`/push-logs` accepts JSON
alone, because `sendBeacon` can't set headers). An `Origin`, when present, must be in
`private/server.json` `{"allowedOrigins": [...]}` (same host when that file is absent). A cross-site page
can't send any of these without a CORS preflight, which the server never grants. See `docs/threat-model.md`.
