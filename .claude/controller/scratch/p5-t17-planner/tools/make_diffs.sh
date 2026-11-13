#!/bin/zsh
# One unified diff per modified file, orig/ to real/, named <path with / as _>.diff.
#   tools/make_diffs.sh <kit>
set -eu
kit="$1"
mkdir -p "$kit/diffs"
grep '^M ' "$kit/files.txt" | cut -c3- | while read -r file; do
  name="${file//\//_}.diff"
  diff -u --label "a/$file" --label "b/$file" "$kit/orig/$file" "$kit/real/$file" > "$kit/diffs/$name" || true
  echo "diffs/$name $(grep -c '^[-+][^-+]' "$kit/diffs/$name") changed lines"
done
