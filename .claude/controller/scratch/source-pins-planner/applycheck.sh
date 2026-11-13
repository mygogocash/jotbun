#!/bin/zsh
# Rebuilds real/ from orig/ through diffs/ in a fresh folder (checks/apply), with no git repository
# (GIT_CEILING_DIRECTORIES stops git above that folder, so git apply works like patch there),
# whitespace errors fatal, then compares each result with real/ byte for byte.
kit=${0:A:h}
check=$kit/checks/apply
rm -rf $kit/checks
mkdir -p $check
export GIT_CEILING_DIRECTORIES=$kit/checks
cp -R $kit/orig/. $check/
for d in $kit/diffs/*.diff; do
  /usr/bin/git -C $check apply --whitespace=error-all $d || { print "APPLY FAILED ${d:t}"; exit 1; }
  print "applied ${d:t}"
done
n=0
for p in apps/edge/test/workers/transaction-source.test.ts apps/app/src/storage/diaryRepository.test.ts; do
  if cmp -s $check/$p $kit/real/$p; then print "same as real/: $p"; n=$((n + 1)); else print "DIFFERS: $p"; exit 1; fi
done
print "applycheck: $n of 2 rebuilt byte for byte"
