#!/bin/zsh
# Writes diffs/: one diff per modified file (orig/ to real/), named <path with / as _>.diff, with repo paths
# (a/<path>, b/<path>) and full blob ids, so `git apply --3way` in a worktree can find each base blob.
# No repository is made; GIT_CEILING_DIRECTORIES keeps git from climbing into the main checkout.
kit=${0:A:h}
cd "$kit" || exit 1
rm -rf diffs && mkdir diffs
grep '^M ' files.txt | awk '{print $3}' | while read -r file; do
  name=${file//\//_}
  GIT_CEILING_DIRECTORIES="${kit:h}" /usr/bin/git diff --no-index --full-index "orig/$file" "real/$file" \
    | sed -e "s#a/orig/$file#a/$file#g" -e "s#b/real/$file#b/$file#g" > "diffs/$name.diff"
  print "diff: diffs/$name.diff ($(grep -c '^[-+][^-+]' "diffs/$name.diff") changed lines)"
done
