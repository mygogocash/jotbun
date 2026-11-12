#!/bin/bash
# Writes diffs/: one diff per file the round changes (orig/ to real/) and one for the new receipt (nothing to real/),
# each with repo paths (a/<path>, b/<path>) and full blob ids, plus p2-t16-fix.patch, the whole round. Then proves
# the patch turns orig/ into real/ byte for byte in a check folder with no repository (logs/applycheck.log), and
# removes the folder. No git repository is made anywhere in the kit. GIT_CEILING_DIRECTORIES names the folder above
# the one git runs in, so git never climbs into the main checkout (which would make `git apply` skip every path).
set -eu
PL=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix-planner
. "$PL/tools/files.sh"
cd "$PL"
rm -rf diffs && mkdir diffs
TOP=$(dirname "$PL")
for f in $ORIG; do
  GIT_CEILING_DIRECTORIES="$TOP" /usr/bin/git diff --no-index --full-index "orig/$f" "real/$f" \
    | sed -e "s#a/orig/$f#a/$f#g" -e "s#b/real/$f#b/$f#g" > "diffs/$(echo "$f" | tr / _).diff" || true
done
new=docs/implementation/receipts/P2-T16-fix.md
GIT_CEILING_DIRECTORIES="$TOP" /usr/bin/git diff --no-index --full-index /dev/null "real/$new" \
  | sed -e "s#b/real/$new#b/$new#g" -e "s#a/real/$new#a/$new#g" > "diffs/$(echo "$new" | tr / _).diff" || true
cat diffs/*.diff > diffs/p2-t16-fix.patch
# The apply check.
C=$PL/applycheck
rm -rf "$C" && mkdir -p "$C"
for f in $ORIG; do mkdir -p "$C/$(dirname "$f")"; cp "orig/$f" "$C/$f"; done
{
  echo "patch: diffs/p2-t16-fix.patch ($(grep -c '^diff --git' diffs/p2-t16-fix.patch) files)"
  (cd "$C" && GIT_CEILING_DIRECTORIES="$PL" /usr/bin/git apply -p1 --verbose "$PL/diffs/p2-t16-fix.patch" 2>&1); echo "git apply exit $?"
  for f in $CODE $TESTS $RECEIPTS; do cmp "$C/$f" "real/$f" && echo "same as real/: $f"; done
} > logs/applycheck.log 2>&1
rm -rf "$C"
cat logs/applycheck.log
ls diffs
