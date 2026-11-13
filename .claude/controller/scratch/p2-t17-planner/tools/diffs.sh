#!/bin/bash
# Writes diffs/: one diff per shared file this task changes (orig/ to real/), named <path with / as _>.diff, with repo
# paths (a/<path>, b/<path>) and full blob ids so `git apply --3way` can merge them; and p2-t17.patch, the whole task
# (the shared diffs and the eight new files from nothing), for reading. Then proves the patch turns orig/ into real/
# byte for byte in a check folder with no repository (logs/applycheck.log), and removes the folder. No git repository
# is made anywhere in the kit. GIT_CEILING_DIRECTORIES names the folder above the one git runs in, so git never climbs
# into the main checkout (inside a repository, `git apply` would skip every path).
set -eu
PL=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t17-planner
. "$PL/tools/files.sh"
cd "$PL"
rm -rf diffs && mkdir -p diffs/new
TOP=$(dirname "$PL")
for f in $SHARED; do
  GIT_CEILING_DIRECTORIES="$TOP" /usr/bin/git diff --no-index --full-index "orig/$f" "real/$f" \
    | sed -e "s#a/orig/$f#a/$f#g" -e "s#b/real/$f#b/$f#g" > "diffs/$(echo "$f" | tr / _).diff" || true
done
for f in $NEW; do
  GIT_CEILING_DIRECTORIES="$TOP" /usr/bin/git diff --no-index --full-index /dev/null "real/$f" \
    | sed -e "s#b/real/$f#b/$f#g" -e "s#a/real/$f#a/$f#g" > "diffs/new/$(echo "$f" | tr / _).diff" || true
done
cat diffs/*.diff diffs/new/*.diff > diffs/p2-t17.patch
rm -rf diffs/new
C=$PL/applycheck
rm -rf "$C" && mkdir -p "$C"
for f in $SHARED; do mkdir -p "$C/$(dirname "$f")"; cp "orig/$f" "$C/$f"; done
{
  echo "patch: diffs/p2-t17.patch ($(grep -c '^diff --git' diffs/p2-t17.patch) files)"
  (cd "$C" && GIT_CEILING_DIRECTORIES="$PL" /usr/bin/git apply -p1 --verbose "$PL/diffs/p2-t17.patch" 2>&1); echo "git apply exit $?"
  for f in $NEW $SHARED; do cmp "$C/$f" "real/$f" && echo "same as real/: $f"; done
} > logs/applycheck.log 2>&1
rm -rf "$C"
cat logs/applycheck.log
ls diffs
