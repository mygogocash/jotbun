#!/bin/bash
# Writes the fix kit's sums, paths relative to the kit unless named "-in-wt":
#   SHA256SUMS       the kit: real/, orig/, ready/, diffs/, tools/ (no *.log)
#   SHA256SUMS.logs  logs/ and probes/, which the state commits leave out
#   SHA256SUMS.orig-in-wt, .red-in-wt, .real-in-wt: the worktree's files at
#   90b5079, after the tests are copied (RED), and after the code (GREEN),
#   with paths relative to the worktree, for `cd WT && shasum -a 256 -c <file>`.
set -eu
K=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t12-fix-planner
cd "$K"
find real orig ready diffs tools -type f ! -name '*.log' | LC_ALL=C sort | while read -r f; do shasum -a 256 "$f"; done > SHA256SUMS
find logs probes -type f | LC_ALL=C sort | while read -r f; do shasum -a 256 "$f"; done > SHA256SUMS.logs
C=apps/app/src/wallet/card
( cd orig && find . -type f | sed 's|^\./||' | LC_ALL=C sort | while read -r f; do shasum -a 256 "$f"; done ) > SHA256SUMS.orig-in-wt
{ ( cd real && for f in $C/CardStack.render.test.tsx $C/cardNativeProps.test.ts $C/cardStackNative.test.ts; do shasum -a 256 "$f"; done )
  ( cd orig && for f in $C/WalletCard.tsx $C/cardFrames.tsx; do shasum -a 256 "$f"; done ); } > SHA256SUMS.red-in-wt
( cd real && find . -type f | sed 's|^\./||' | LC_ALL=C sort | while read -r f; do shasum -a 256 "$f"; done ) > SHA256SUMS.real-in-wt
wc -l SHA256SUMS SHA256SUMS.logs SHA256SUMS.orig-in-wt SHA256SUMS.red-in-wt SHA256SUMS.real-in-wt
