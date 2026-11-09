#!/bin/bash
# Writes SHA256SUMS (the kit: real/, stubs/, orig/, diffs/, tools/) and
# SHA256SUMS.logs (logs/, which the state commits leave out), paths relative
# to the planner's folder.
set -eu
K=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t11-planner
cd "$K"
find real stubs orig diffs tools -type f | LC_ALL=C sort | while read -r f; do shasum -a 256 "$f"; done > SHA256SUMS
find logs -type f | LC_ALL=C sort | while read -r f; do shasum -a 256 "$f"; done > SHA256SUMS.logs
wc -l SHA256SUMS SHA256SUMS.logs
