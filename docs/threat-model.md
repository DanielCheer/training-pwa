# Threat model

A single-user app: one owner, one phone, one PC. The goal is that nothing reachable from outside the
owner's private network can read their data, change it, or use the PC's resources, and that the public
repository and demo carry none of it.

## Assets

| Asset | Where it lives |
|---|---|
| Training and food history, body measurements, meal photos | the phone's localStorage and IndexedDB; mirrored to `device-logs.json` and `food-photos/` on the PC |
| The Google Sheet web-app URL (a bearer credential: anyone holding it can append rows) | `dj-sheet-url` in localStorage, and therefore inside `device-logs.json` |
| The PC's disk, GPU and the owner's Claude usage | the agents |
| The cleanliness of the public repository | git history |

## Trust boundaries

```
phone browser ──HTTPS (tailnet only)──> Tailscale Serve ──> serve.py on 127.0.0.1
                                                              │
                     device-logs.json, shared-log.json  <─────┤
                                                              ├──> autofill-food.py ──> claude -p (Anthropic)
                                                              └──> draft-food.py   ──> Ollama on 127.0.0.1
public demo: static files on GitHub Pages, no server, different origin
```

## Threats and mitigations

**1. Reaching the server from outside.** `serve.py` binds `127.0.0.1` only (there is no option to bind
anything else) and is published to the owner's devices through Tailscale Serve, not Funnel. Membership in
the tailnet is the authentication; the app itself has no login. The model server also binds `127.0.0.1`.

**2. Reading files the app doesn't need.** GET and HEAD go through an allowlist (`public_rel`): a fixed
set of files plus one level of `icons/`, `app/`, `data/`, `food-photos/` and `videos/`. It is checked on
the URL-decoded, normalized path, so `/./x`, `/a/../x`, encoded dots and backslashes can't route around
it; dotfiles are refused and no directory is ever listed. `device-logs.json` (which embeds the Sheet URL),
logs, sources, tests and `private/` are all 404. `tests/test_public_rel.py` covers the bypass spellings.

**3. Another website making the phone post to the server (CSRF).** The phone's browser can reach the
tailnet URL, so a malicious page could try. Every POST needs an exact `Content-Type` and the custom header
`X-Train-Client: 1`; an `Origin`, when sent, must be on the allowlist in `private/server.json` (or match
the Host when there is none). A cross-origin page can't send a custom header or `application/json` without
a CORS preflight, and the server never answers one. `/push-logs` accepts JSON without the header (for
`sendBeacon`) and is still covered by the JSON content type and the Origin check.

**4. Exhausting the PC.** Body caps per route (2 MB push, 15 MB photo, 2 GB video); a 4 GB per-day upload
budget and a 10 GB free-disk floor, past which uploads get `507`; uploads never overwrite an existing file.
"Count now" is rate-limited (60 s) and shares a lock with the nightly run, so one tap can't start parallel
paid model calls. Refused POSTs close the connection after a short lingering read so the client still
gets the error.

**5. Corrupting the data.** Writes are atomic (temp file, fsync, replace, verify). A push older than the
stored snapshot is refused (`409 stale-seq`), so a second device or a reset phone can't overwrite newer
history. Inbox entries are merged by id, field by field, with type checks; unknown entry types are skipped;
photo paths must match `food-photos/<safe name>`. Agents append to the inbox and never rewrite it.

**6. Prompt injection into the meal estimator.** Meal text and photos go into a headless Claude call.
The call can only use `Read`, `WebSearch` and `WebFetch` (`Bash`, `Edit`, `Write` and `NotebookEdit` are
disallowed), it runs with no saved session, and it never writes files: Python parses its answer, accepts
only numbers in range plus an optional name string, and does every write. Residual risk, accepted: an
instruction hidden in a photo (a menu, a label) could in principle make the model `Read` a local file and
put its contents into a `WebFetch` URL. The inputs come from the owner's own camera and typing, which keeps
the likelihood low; restricting `Read` to the photo folder would remove it, and is on the roadmap.

**7. Escaping into the page (XSS).** Text the owner types or the inbox supplies is escaped (`escHtml`,
`escAttr`) before it reaches `innerHTML`. Profile strings in `data/profile.js` may contain inline HTML by
design; they are the owner's own file. The app uses inline `onclick` handlers, so a strict
Content-Security-Policy is not possible today (a known gap).

**8. Leaking secrets and personal data into the repository.** No secrets are in the code: the Sheet URL is
entered on the phone, the Origin allowlist and the estimator defaults live in `private/`. The private
overlay is gitignored, `tools/precommit-pii.sh` blocks personal files and pattern matches on every commit,
and `tools/audit-public.sh` checks the tracked tree against an expected list and greps all of history.

**9. The public demo.** It is the same code with `SERVER = null`: it never fetches the inbox, pushes, or
uploads, and its data is a fictional persona seeded into the visitor's own browser. It is served from a
different origin than the owner's install, so the two can never share storage.

## Out of scope

- A compromised phone, PC or tailnet device, or a compromised Tailscale, Google or Anthropic account. With
  any of those the attacker already has the data.
- Physical access to an unlocked phone. localStorage and the PC's state files are not encrypted at rest.
- Multiple users. There are no accounts, roles or per-user data; the design assumes exactly one owner.
- Availability guarantees. If the PC is off, the app keeps working offline and syncs later.
