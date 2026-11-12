#!/bin/zsh
# Applies each diffs/<file>.diff to orig/<file> with patch -F0 (as check_kit.sh does) and compares the result
# with real/<file>. Run from anywhere: tools/applycheck.sh. Prints one line per file and a total.
set -u
kit=${0:A:h:h}
check=$kit/applycheck
rm -rf "$check"
mkdir -p "$check"
ok=0
bad=0
for file in $(grep '^M ' "$kit/files.txt" | cut -c3-); do
  diff_file="$kit/diffs/${file//\//_}.diff"
  mkdir -p "$check/${file:h}"
  if patch -s -F0 -o "$check/$file" "$kit/orig/$file" < "$diff_file" > /dev/null 2>&1 && cmp -s "$check/$file" "$kit/real/$file"; then
    echo "OK $file"
    ok=$((ok + 1))
  else
    echo "FAILED $file"
    bad=$((bad + 1))
  fi
done
rm -rf "$check"
echo "$ok applied and match real/; $bad failed"
[ "$bad" = 0 ]
