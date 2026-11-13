#!/bin/zsh
# Checks the kit's diffs against orig/ and real/, outside any git repository:
# 1. every diffs/*.diff applies to a copy of orig/ and rebuilds real/ byte for byte;
# 2. no changed or new file has a whitespace error (git diff --check, M and A lines of files.txt).
# Usage: applycheck.sh   (prints one line per check, then "applycheck: ok" or "applycheck: FAILED")
kit=${0:A:h}
work=$kit/checks/apply
export GIT_CEILING_DIRECTORIES=$kit/checks
rm -rf "$work" && mkdir -p "$work" && cp -R "$kit/orig/." "$work/" || exit 1
failed=0
for d in "$kit"/diffs/*.diff; do
  (cd "$work" && /usr/bin/git apply -p1 "$d") || { print "does not apply: ${d:t}"; failed=1; }
done
while read -r kind atred file; do
  [[ -z "$kind" || "$kind" == \#* ]] && continue
  if [[ "$kind" == M ]]; then
    cmp -s "$work/$file" "$kit/real/$file" && print "rebuilt: $file" || { print "NOT rebuilt: $file"; failed=1; }
    problems=$(cd "$kit" && /usr/bin/git diff --no-index --check "orig/$file" "real/$file")
  else
    problems=$(cd "$kit" && /usr/bin/git diff --no-index --check /dev/null "real/$file")
  fi
  [[ -n "$problems" ]] && { print "whitespace: $file"; print -r -- "$problems"; failed=1; }
done < "$kit/files.txt"
(( failed )) && { print "applycheck: FAILED"; exit 1; }
print "applycheck: ok"
