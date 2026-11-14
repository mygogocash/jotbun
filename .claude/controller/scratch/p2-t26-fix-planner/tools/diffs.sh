#!/bin/bash
# Writes diffs/: one diff per file the round changes (orig/ to real/) and one per new file (nothing to real/), each
# with repo paths (a/<path>, b/<path>) and full blob ids, plus p2-t26-fix.patch, the whole round. Then proves the
# patch turns orig/ into real/ byte for byte in a check folder beside the kit's files, with no repository
# (logs/applycheck.log), and removes the folder. GIT_CEILING_DIRECTORIES names the check folder's parent, so git
# never climbs into the main checkout (where `git apply` would skip every path). The last line counts the files
# equal to real/: all seven must be, so a missing real/ file fails the check.
set -eu
PL=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix-planner
. "$PL/tools/files.sh"
cd "$PL"
rm -rf diffs && mkdir diffs
TOP=$(dirname "$PL")
for f in $ORIG; do
  GIT_CEILING_DIRECTORIES="$TOP" /usr/bin/git diff --no-index --full-index "orig/$f" "real/$f" \
    | sed -e "s#a/orig/$f#a/$f#g" -e "s#b/real/$f#b/$f#g" > "diffs/$(echo "$f" | tr / _).diff" || true
done
for f in $NEW; do
  GIT_CEILING_DIRECTORIES="$TOP" /usr/bin/git diff --no-index --full-index /dev/null "real/$f" \
    | sed -e "s#b/real/$f#b/$f#g" -e "s#a/real/$f#a/$f#g" > "diffs/$(echo "$f" | tr / _).diff" || true
done
cat diffs/*.diff > diffs/p2-t26-fix.patch
C=$PL/applycheck
rm -rf "$C" && mkdir -p "$C"
for f in $ORIG; do mkdir -p "$C/$(dirname "$f")"; cp "orig/$f" "$C/$f"; done
{
  echo "patch: diffs/p2-t26-fix.patch ($(grep -c '^diff --git' diffs/p2-t26-fix.patch) files)"
  (cd "$C" && GIT_CEILING_DIRECTORIES="$PL" /usr/bin/git apply -p1 --verbose "$PL/diffs/p2-t26-fix.patch" 2>&1); echo "git apply exit $?"
  same=0
  for f in $CODE $TESTS $RECEIPTS; do
    if [ -f "real/$f" ] && [ -f "$C/$f" ] && cmp -s "$C/$f" "real/$f"; then echo "same as real/: $f"; same=$((same + 1)); else echo "NOT the same as real/: $f"; fi
  done
  echo "$same of 7 files the same as real/"
} > logs/applycheck.log 2>&1
rm -rf "$C"
cat logs/applycheck.log
ls diffs
