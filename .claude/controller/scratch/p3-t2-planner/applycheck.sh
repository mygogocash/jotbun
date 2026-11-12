#!/bin/zsh
# Makes diffs/ with git (full blob ids, so `git apply --3way` can find each preimage in any clone
# that holds the head), then proves each diff applies with --3way to the head's files and gives
# real/. Usage: applycheck.sh <out dir>. Its repos live in <out dir>, each a fresh git repository
# of the head's 13 modified files only; GIT_CEILING_DIRECTORIES keeps git from reaching the main
# checkout around the scratch folder.
PL=${0:A:h}
out=$1
export GIT_CEILING_DIRECTORIES=$out
files=($(grep '^M ' $PL/files.txt | cut -c3-))
fresh() {
  rm -rf "$1" && mkdir -p "$1"
  for f in $files; do mkdir -p "$1/${f:h}" && cp "$PL/base/$f" "$1/$f"; done
  (cd "$1" && /usr/bin/git init -q && /usr/bin/git add -A && /usr/bin/git -c user.name=planner -c user.email=planner@invalid commit -qm head) || exit 1
}
# 1. The diffs, made by git from the head's blobs.
fresh "$out/make"
rm -rf "$PL/diffs" && mkdir -p "$PL/diffs"
for f in $files; do
  cp "$PL/real/$f" "$out/make/$f"
  (cd "$out/make" && /usr/bin/git diff --full-index -- "$f") > "$PL/diffs/${f//\//_}.diff"
done
# 2. Each applies with --3way to a fresh copy of the head, and the result is real/.
fresh "$out/check"
cd "$out/check" || exit 1
rc=0
for d in $PL/diffs/*.diff; do
  /usr/bin/git apply --3way "$d" 2> "$out/${d:t}.err" || { print "FAILED ${d:t}"; rc=1; }
  grep -q 'Falling back' "$out/${d:t}.err" && { print "NO 3-WAY ${d:t}"; rc=1; }
done
for f in $files; do cmp -s "$out/check/$f" "$PL/real/$f" || { print "DIFFERS $f"; rc=1; }; done
print "applied $(ls $PL/diffs/*.diff | wc -l | tr -d ' ') diffs with --3way; rc $rc"
exit $rc
