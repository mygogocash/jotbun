#!/bin/sh
# Writes the planner folder's checksums: SHA256SUMS for the files the brief
# copies, applies or runs (real/, stubs/, orig/, diffs/, tools/), and
# SHA256SUMS.logs for everything in logs/ (gitignored, so the state commits
# leave it out). Check with: cd <planner folder> && shasum -a 256 -c SHA256SUMS
set -eu
cd /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-planner
find real stubs orig diffs tools -type f | LC_ALL=C sort | tr '\n' '\0' | xargs -0 shasum -a 256 > SHA256SUMS
find logs -type f | LC_ALL=C sort | tr '\n' '\0' | xargs -0 shasum -a 256 > SHA256SUMS.logs
wc -l SHA256SUMS SHA256SUMS.logs
