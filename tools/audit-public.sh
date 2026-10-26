#!/bin/bash
# Public-tree audit. Run before the repository goes public, and any time after:  bash tools/audit-public.sh
#   1. every tracked file matches the expected list below, and nothing on the forbidden list is tracked;
#   2. every file the app and its docs need is tracked;
#   3. no line of any commit on any ref (diffs AND messages: git log --all -p) matches the private PII
#      patterns (private/pii-patterns.txt, gitignored, so the list itself is never published);
#   4. every author and committer email is a GitHub noreply address.
# Exit 0 = clean. A missing pattern list is a failure: this audit must never pass by default.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 2
PATTERNS=private/pii-patterns.txt
fail=0
bad() { echo "FAIL: $*"; fail=1; }

# 1. Expected list: the shell, the PC scripts, tests, docs. A new kind of file has to be added here on purpose.
EXPECTED='^(\.gitattributes|\.gitignore|\.github/workflows/(ci|pages)\.yml|CHANGELOG\.md|LICENSE|README\.md'
EXPECTED+='|index\.html|styles\.css|sw\.js|manifest\.json|app/[a-z]+\.js|data/(profile|program|overrides|seed)\.js'
EXPECTED+='|icons/[a-z0-9-]+\.png|docs/[a-z-]+\.md|docs/img/[a-z-]+\.png'
EXPECTED+='|harness/harness\.js|harness/draft-calibration\.py|harness/baseline/demo\.json|harness/sections/[0-9]{2}-[a-z0-9-]+\.js'
EXPECTED+='|tests/(conftest|test_[a-z_]+)\.py|tools/(precommit-pii|audit-public)\.sh'
EXPECTED+='|(serve|server-watchdog|autofill-food|draft-food|food_common)\.py|apps-script\.gs|pytest\.ini|requirements(-dev)?\.txt)$'
FORBIDDEN='(^|/)private/|device-logs|shared-log\.json|server-synced\.json|autofill-state|draft-state|food-photos/|videos/|exports/'
FORBIDDEN+='|\.log$|\.lock$|food-defaults|index\.orig\.html|(^|/)\.env|\.db$|\.key$|\.pem$|server\.json$|upload-budget'
files=$(git ls-files)
unexpected=$(echo "$files" | grep -vE "$EXPECTED" || true)
[ -n "$unexpected" ] && bad "tracked files not on the expected list:"$'\n'"$unexpected"
forbidden=$(echo "$files" | grep -E "$FORBIDDEN" || true)
[ -n "$forbidden" ] && bad "forbidden files are tracked:"$'\n'"$forbidden"

# 2. Required files.
for f in README.md LICENSE CHANGELOG.md index.html styles.css sw.js manifest.json data/profile.js data/program.js \
         data/overrides.js data/seed.js serve.py harness/harness.js docs/data-contract.md docs/threat-model.md; do
  echo "$files" | grep -qx "$f" || bad "required file not tracked: $f"
done
echo "tree: $(echo "$files" | grep -c .) tracked files checked"

# 3. PII patterns over every commit of every ref, diffs and messages.
if [ ! -s "$PATTERNS" ]; then
  bad "$PATTERNS missing or empty: cannot check history"
else
  hits=$(git log --all -p --format='commit %H%n%an <%ae>%n%B' | grep -niE -f "$PATTERNS" || true)
  if [ -n "$hits" ]; then
    bad "personal-data patterns in git history ($(echo "$hits" | wc -l) lines):"
    echo "$hits" | cut -c1-160 | head -40
  fi
  echo "history: $(git rev-list --all | wc -l) commits on $(git for-each-ref --format=x refs/heads refs/remotes refs/tags | wc -l) refs scanned"
fi

# 4. Identities.
ids=$(git log --all --format='%ae%n%ce' | sort -u)
nonnoreply=$(echo "$ids" | grep -vE '@users\.noreply\.github\.com$' || true)
[ -n "$nonnoreply" ] && bad "author/committer emails that are not GitHub noreply:"$'\n'"$nonnoreply"

[ $fail -eq 0 ] && echo "AUDIT: clean" || echo "AUDIT: FAILED"
exit $fail
