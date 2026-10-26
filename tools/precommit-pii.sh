#!/bin/bash
# Refuse a commit that stages personal data. Run before every commit:  bash tools/precommit-pii.sh
# The identifier patterns live in private/pii-patterns.txt (gitignored, one regex per line) so the
# list itself is never published. Missing list = refuse: the check must never silently pass.
set -e
cd "$(git rev-parse --show-toplevel)"
PATTERNS=private/pii-patterns.txt
[ -s "$PATTERNS" ] || { echo "REFUSED: $PATTERNS missing or empty"; exit 1; }
staged=$(git diff --cached --name-only)
bad_paths=$(echo "$staged" | grep -E '^(private/|food-photos/|videos/|exports/)|device-logs|shared-log\.json|\.log$|food-defaults\.md$|index\.orig\.html$' || true)
[ -n "$bad_paths" ] && { echo "REFUSED: personal files staged:"; echo "$bad_paths"; exit 1; }
hits=$(git diff --cached -U0 | grep '^+' | grep -niE -f "$PATTERNS" || true)
[ -n "$hits" ] && { echo "REFUSED: personal data in staged lines:"; echo "$hits" | cut -c1-200; exit 1; }
echo "PII check: clean ($(echo "$staged" | grep -c .) files)"
