# Design decisions

Short records of the choices that shape the code, with the reason and the cost of each. D1 to D8 come from
the plan that turned a single-file personal app into this repository; the rest predate it.

## D1. Personal data lives in a private overlay, all or nothing

**Context.** The app was built for one person, and the program, targets and history are that person's.
The repository has to be public without any of it.

**Decision.** `index.html` always loads `data/profile.js`, `data/program.js`, `data/overrides.js` and
`data/seed.js`. The repository commits a fictional demo persona ("Alex"). A real install keeps its own
copies in the gitignored `private/data/` (plus `private/manifest.json`), and `serve.py` serves those paths
from `private/` whenever `private/data/` exists. A file missing from the overlay is a **404**, never the demo
copy. The harness applies the same rule.

**Why all or nothing.** A per-file fallback would quietly serve the demo's seed to a real phone, which
writes the demo's history into real storage. A 404 is loud and harmless.

**Cost.** Two copies of the data files to keep shape-compatible; `docs/data-contract.md` and the startup
contract guard keep them honest.

## D2. The demo is the public checkout itself

**Decision.** No build step and no demo flag. Server features are gated by `SERVER` in `data/profile.js`
(`null` in the demo) and an http(s) origin (`HAS_SERVER`). The GitHub Pages demo publishes the same files.

**Why.** A demo that is a different build is a demo that drifts. Pages runs on a different origin from the
owner's install, so their `localStorage` can never mix.

## D3. Keep the `dj-` localStorage namespace

**Decision.** Every key stays `dj-…` for every profile; branding comes from `PROFILE`.

**Why.** The prefix is a contract with the PC side: the device push mirrors every `dj-` key and the Python
scripts read them by name. Renaming would mean a migration on the phone and in every script for no user
benefit. New code builds keys from `LS_NS`.

## D4. The harness runs the real files, in order, in one context

**Decision.** `harness/harness.js` reads the `<script>` tags from `index.html` and runs each file with
`vm.runInContext` in one shared context, the way a browser does, instead of concatenating them.

**Why.** A concatenation hides the one hazard a multi-file split introduces: a top-level call that reaches
a function declared in a later file. In one shared context that becomes a `ReferenceError` and a failed
run. Public sections assert behaviour derived from the loaded data (so they pass on the demo and on the
overlay); the owner's private sections add dated checks and a byte-diff against the last single-file
version.

## D5. One Sheets path

**Decision.** The phone posts to an Apps Script web app (`apps-script.gs`) that dedups by entry id. A
server-side sync script that had never run, and whose load step was destructive, was deleted.

**Why.** Two sync paths means one of them rots. The Sheet is the only place both writers converge, so the
dedup lives there.

## D6. Change the live install by swapping directories

**Decision.** Work happens in a separate checkout; the live folder only changes by `git pull` (or, for the
first migration, by renaming the old folder away and moving the new one in).

**Why.** The owner uses the app daily. A rename is a rollback that takes seconds.

## D7. No commit ever contains personal data

**Decision.** `tools/precommit-pii.sh` runs before every commit. It refuses staged files under `private/`,
media, logs and runtime state, and any added line matching a pattern list that itself lives in `private/`
(so the list of things to hide is never published). `tools/audit-public.sh` re-checks the whole tree and
every commit in history before the repository goes public.

**Why.** A personal-data leak in git history is permanent once pushed publicly. The check has to run every
time, not when someone remembers.

## D8. Base weeks are a list of dated epochs

**Context.** The owner's weekly schedule changed mid-year. Editing the base week would have re-labelled
every logged note from before the change.

**Decision.** `BASE_EPOCHS = [{from, days, why, sessionPicker?}, …]`, ascending, the first with `from: ''`.
`dayObj(day, date)` and the note resolver pick the epoch in effect on that date. The demo has one epoch.

**Why.** History stays correct by construction: a past date always resolves through the week that was live
then, with no migration and no rewrite of logged data.

## No framework, no bundler, no dependencies

**Decision.** Plain HTML, CSS and JavaScript as classic scripts; Python standard library on the server.
The only development dependency is pytest.

**Why.** The app has to open in a gym basement with no signal, and still open in three years. There is
nothing to install, nothing to upgrade and no build output to keep in sync with source. The cost is real:
no type checker, no module system and inline `onclick` handlers (which rules out a strict CSP). The
harness, the startup contract guard and `cfgFail` banners are how it stays safe without types.

## Dated overrides are never pruned

**Decision.** `WEEK_OVERRIDES` blocks expire by themselves (inclusive `from`/`to`) and stay in the data
forever.

**Why.** A logged set or note is keyed by weekday, section and position, plus its date. Its exercise name is
resolved through whatever override was active that day. Deleting an expired block would silently re-label
those notes as whatever the base week had in that slot. The data is small; correctness of history is not
negotiable.

## Errors never become data

**Decision.** Meal estimates fail closed. A model error, a timeout, an "unsure" answer or numbers that don't
add up leave the meal `pending` with a reason the app shows. Only the nightly Claude run counts a meal; the
local model's draft is displayed apart and never enters a total.

**Why.** A daily total is only useful if every number in it is real. An error that turns into a plausible
value makes the totals look fine while being wrong, and nobody would notice. A pending meal is honest; a
made-up number is not. Keeping the draft out of the count also keeps draft-vs-final accuracy measurable.

## Derive, don't duplicate

**Decision.** Anything that depends on the program reads it from the data: phase from the cumulative
`PHW`, the Build phase from `PHASES`, units from `LOAD_TYPES`, nutrient keys (in Python too) from
`app/config.js`, target bands in prose from `DAY_TARGETS`.

**Why.** The program changes often. A hardcoded copy of a config value looks right until the next change,
then silently disagrees with it.
