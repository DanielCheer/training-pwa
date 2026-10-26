# Data contract

The app is one engine (`index.html` + `app/*.js`) plus a set of data scripts (`data/*.js`) that describe
**who** it is for and **what** they train. The engine never hardcodes a person or a routine: it reads the
globals below. The repo ships a fictional demo profile ("Alex"); a real install swaps in its own copies.

## Load order

Classic `<script>` tags, in this order (top-level `const`/`let` are shared across them, but a top-level
statement can only use what an earlier or the same script already declared):

1. `app/config.js` — engine constants shared by every profile (load types, sections, nutrients, `cfgFail`,
   food-day roll hour, sync/draft timings, inbox contract, `LS_NS`).
2. `data/profile.js` — the person.
3. `data/program.js` — the program.
4. `data/overrides.js` — dated one-off schedule changes.
5. `data/seed.js` — first-open localStorage seed.
6. The engine.

The engine starts with a guard (`DATA_CONTRACT` in `index.html`) that checks every required global below
exists; a missing one shows the config banner naming it and stops the engine.

## Private overlay (how a real install supplies its data)

Personal data never lives in the repo. It sits in the gitignored `private/` folder:

```
private/data/profile.js  program.js  overrides.js  seed.js
private/manifest.json
```

`serve.py` serves the overlayable paths (`data/*.js`, `manifest.json`) from `private/` whenever
`private/data/` exists — **all or nothing**: a file missing from the overlay is a 404, never the demo
copy (a silent per-file fallback could seed demo content into a real install). The harness applies the
same rule (`node harness/harness.js`, or `--private DIR`, or `--demo` to ignore the overlay).

## `data/profile.js`

| Global | Shape | Used for |
|---|---|---|
| `GOAL` | `{bw, bfPct}` | goal text in the phase descriptions (`GOAL_STR` is derived from it here) and the Goal card's targets (lean-mass goal = `bw × (1 − bfPct/100)`) |
| `STACK` | `[[icon, name, text], …]` | Fuel tab: supplement stack |
| `APT` | `[[heading, text], …]` | Fuel tab: weekly protocol card (title = `PROFILE.aptTitle`) |
| `DAY_TARGETS` | `{kcal:[lo,hi], p:[lo,hi], c:[lo,hi], f:[lo,hi]}` | Log bars, day verdict, Fuel targets |
| `TEE` | number | Fuel tab surplus = `DAY_TARGETS.kcal − TEE` |
| `FOODS` | `[[name, kcal, p, c, f, sugar?, fiber?, satFat?], …]` | Food picker (one default serving each) |
| `PROFILE` | object, below | branding + the personal Home/Fuel/Log cards |
| `SERVER` | `{push, inbox, autofill, drafts, photos}` or `null` | which companion-server features exist |

`PROFILE` fields (strings may contain inline HTML; they are the owner's own text):
`name`, `title` (page title + Home heading), `shortName` (home-screen label), `eyebrow`, `tz` (named in the
Meal History roll-over line), `mealPlaceholder`, `goal:{title, bfNote?, note}`,
`scan:{date, bw, bfPct, lean, rows:[[label, value, [flagText, 'lo'|'ok'|'hi']?]], note}`, `aptTitle`, `mealTiming`,
`sampleDay:{title, intro, items:[{n,d,kcal,p,c,f}], note}`, `shakes:{title, paras:[…], warn}`,
`cardioRules`.

The Goal card's bars are derived, never typed in: bodyweight from the latest `dj-bw-log` weigh-in (the scan's
`bw` until there is one), lean mass and body fat from the scan's numbers, all measured against `GOAL`
(`goal.bfNote` is appended to the body-fat goal). The demo keeps the scan numbers in one `SCAN` constant
that both `scan` and its first rows read, so the card and the bars can't disagree.

The Fuel tab's sample day computes its Total row and a "vs your targets" line from the item rows; its `intro`
and `note` may name a band with `{kcal}`, `{p}`, `{c}` or `{f}`, filled from `DAY_TARGETS` (never type the
numbers into the prose: they go stale the day the targets move).

`SERVER=null` is a static checkout (the public demo): no phone→PC push, no shared-log inbox, no
auto-fill, no drafts, no photo upload; the Log tab's status strip says so. Network paths additionally need
an http(s) origin (`HAS_SERVER`). The service worker registers on any http(s) origin regardless, so the
demo works offline.

## `data/program.js`

| Global | Shape | Notes |
|---|---|---|
| `START`, `SEASON` | `Date` | block start; the date the block builds toward (countdown, "Realistic by") |
| `fmtMD`, `SEASON_STR` | function, string | date formatting used by the phase/why text |
| `PHASES` | `[{n, d, c, bg, bd, t, heavy?}]` | `d` is filled by the date generator (keep it) |
| `PHW` | `[weeks per phase]` | same length as `PHASES` (cfgFail otherwise) |
| `TOTAL_WEEKS`, `BUILD_PHASE`, `BUILD_START`, `HOLD_AT_PHASE`, `HOLD_END_WEEK` | derived | keep the derivation lines as in the demo; `HOLD_AT_PHASE` = a phase index to hold at, or `null` |
| `LD_BY_NAME` | `{exerciseName: loadType}` | load types from `LOAD_TYPES` in `app/config.js` |
| `TARGETS` | `{exerciseName: {t0, inc?, hold?}}` | Build-phase 🎯 seeds; `hold` = never ramp (a string is the reason shown); every key needs a load type |
| `MON_VARIANTS` | `[[exercise…], …]` | Monday's main block rotates weekly through these (`DAYS` Monday) |
| `TUE_MAIN_FULL/SHORT`, `TUE_CORE_FULL/SHORT` | exercise lists | the Tuesday full/short toggle |
| `DAYS` | 7 day objects, keys `mon`…`sun` | the first base week |
| `BASE_EPOCHS` | `[{from, days, why, sessionPicker?}]` | ascending; the first has `from:''`; history resolves through the epoch of its own date |
| `GYM_SESSIONS`, `GYM_SESSIONS_LEGACY` | `[{id, lbl, focus, …, secs}]` | flexible-session picker (epochs with `sessionPicker`); legacy ids stay resolvable forever |

Day object: `{k, l, time, focus, map:[muscle keys], fin?, note, secs:{warm, power, main, core, prep?, str}}`.
Every day needs `secs.power` (may be empty). Exercise: `{n, d?, v?, rx:[1 or PHASES.length entries],
t:[tags], y:why, c:cue}`; `d` is a diagram key from the engine's diagram library.

## `data/overrides.js`

`WEEK_OVERRIDES=[{from:'YYYY-MM-DD', to:'YYYY-MM-DD', why, days:{weekdayKey: partialDayObject}}]` —
merged over the base day at read time (`{...base, ...override, secs:{...base.secs, ...override.secs}}`),
inclusive range, expires by itself. **Never delete expired blocks**: logged notes and sets resolve their
exercise names through the override that was active on their date.

## `data/seed.js`

`SEED` = `null` (a real install — its history is already in localStorage) or `{localStorageKey: value}`.
On first open the engine writes each key that is still empty (objects are JSON-encoded) and sets the
marker `dj-seeded`, so it never runs twice or overwrites data.

## localStorage namespace

All keys start with `dj-` (`LS_NS`). It is a contract with the companion server (the device-logs push
mirrors every `dj-` key; `food_common.py` reads them), so it stays `dj-` for every profile.
