#!/bin/zsh
# Proves the diffs rebuild real/ from orig/ byte for byte, with no whitespace error: orig/ is copied into a
# check folder beside the kit's files (no repository anywhere), every diff is applied there with git apply
# (GIT_CEILING_DIRECTORIES is the check folder's parent, so git never climbs into the main checkout), each
# result is compared with real/, and the folder is removed. Prints one line per file and a last line
# "applycheck: <n> of 8 equal".
kit=${0:A:h}
check="$kit/applycheck"
rm -rf "$check" && mkdir -p "$check" || exit 1
files=($(grep '^M ' "$kit/files.txt" | awk '{print $3}'))
for file in $files; do mkdir -p "$check/${file:h}" && cp "$kit/orig/$file" "$check/$file"; done
equal=0
for file in $files; do
  name=${file//\//_}
  (cd "$check" && GIT_CEILING_DIRECTORIES="$kit" /usr/bin/git apply -p1 --whitespace=error-all "$kit/diffs/$name.diff") || { print "apply FAILED: $file"; continue; }
  if cmp -s "$check/$file" "$kit/real/$file"; then print "equal to real/: $file"; equal=$((equal + 1)); else print "DIFFERS from real/: $file"; fi
done
rm -rf "$check"
print "applycheck: $equal of ${#files} equal"
