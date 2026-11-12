#!/bin/bash
# Writes the kit's checksums:
#   SHA256SUMS            the files the brief copies, prints or runs: real/, orig/, diffs/, tools/ (check from the kit)
#   SHA256SUMS.logs       everything in logs/ (gitignored, so the state commits leave it out)
#   SHA256SUMS.orig-in-wt the four files as 81f66c0e has them, paths relative to the worktree
#   SHA256SUMS.red-in-wt  the three files RED leaves: the suite from real/, the two code files as 81f66c0e has them
#   SHA256SUMS.real-in-wt the round's five files in their final form
# work/ (the proof copy, with node_modules) and drafts/ (the planner's working notes and earlier runs) are not summed.
set -eu
PL=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix-planner
. "$PL/tools/files.sh"
cd "$PL"
find real orig diffs tools -type f | LC_ALL=C sort | tr '\n' '\0' | xargs -0 shasum -a 256 > SHA256SUMS
find logs -type f | LC_ALL=C sort | tr '\n' '\0' | xargs -0 shasum -a 256 > SHA256SUMS.logs
inwt() { (cd "$PL/$1" && shasum -a 256 "${@:2}"); }
inwt orig $ORIG > SHA256SUMS.orig-in-wt
{ inwt real $TESTS; inwt orig $CODE; } > SHA256SUMS.red-in-wt
inwt real $CODE $TESTS $RECEIPTS > SHA256SUMS.real-in-wt
wc -l SHA256SUMS SHA256SUMS.logs SHA256SUMS.orig-in-wt SHA256SUMS.red-in-wt SHA256SUMS.real-in-wt
