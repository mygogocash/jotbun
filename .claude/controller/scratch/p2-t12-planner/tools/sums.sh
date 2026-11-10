#!/bin/bash
# Writes SHA256SUMS (the kit: real/, stubs/, orig/, diffs/, tools/; no *.log)
# and SHA256SUMS.logs (logs/ and probes/, which the state commits leave out),
# paths relative to the planner's folder.
set -eu
K=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t12-planner
cd "$K"
find real stubs orig diffs tools -type f ! -name '*.log' | LC_ALL=C sort | while read -r f; do shasum -a 256 "$f"; done > SHA256SUMS
find logs probes -type f | LC_ALL=C sort | while read -r f; do shasum -a 256 "$f"; done > SHA256SUMS.logs
wc -l SHA256SUMS SHA256SUMS.logs
