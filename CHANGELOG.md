# Changelog

Release notes for each `sw.js` VERSION.

## v120

- index.html split into `styles.css`, `app/*.js` and `data/*.js` (no build step); a private data overlay keeps the owner's program and profile out of the repo, and a fictional demo persona ships instead.
- The harness runs the split files in order in one vm context and still proves zero behavior change against the v119 single-file baseline.

Earlier history (v1 to v119) is being rewritten from the private log into feature-level notes.
