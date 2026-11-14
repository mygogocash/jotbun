#!/bin/bash
# Writes the kit's checksums:
#   SHA256SUMS             HEAD.txt and the files the brief copies, prints or runs: real/, orig/, diffs/, tools/
#   SHA256SUMS.logs        everything in logs/ (gitignored, so the state commits leave it out)
#   SHA256SUMS.base-in-wt  the 17 unchanged files the round relies on, as 52110318 has them (from tree/, the archive)
#   SHA256SUMS.orig-in-wt  the five files as 52110318 has them
#   SHA256SUMS.red-in-wt   the five files RED leaves: the two render files from real/, the three code files from orig/
#   SHA256SUMS.real-in-wt  the round's seven files in their final form
# Paths in the four *-in-wt lists are relative to the worktree. tree/ (the proof copy) is not summed.
set -eu
PL=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix-planner
. "$PL/tools/files.sh"
cd "$PL"
find HEAD.txt real orig diffs tools -type f ! -path '*/__pycache__/*' | LC_ALL=C sort | tr '\n' '\0' | xargs -0 shasum -a 256 > SHA256SUMS
find logs -type f | LC_ALL=C sort | tr '\n' '\0' | xargs -0 shasum -a 256 > SHA256SUMS.logs
inwt() { (cd "$PL/$1" && shasum -a 256 "${@:2}"); }
inwt tree $RELIED > SHA256SUMS.base-in-wt
inwt orig $ORIG > SHA256SUMS.orig-in-wt
{ inwt real $TESTS; inwt orig $CODE; } > SHA256SUMS.red-in-wt
inwt real $CODE $TESTS $RECEIPTS > SHA256SUMS.real-in-wt
wc -l SHA256SUMS SHA256SUMS.logs SHA256SUMS.base-in-wt SHA256SUMS.orig-in-wt SHA256SUMS.red-in-wt SHA256SUMS.real-in-wt
