#!/bin/sh
set -eu
cd /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t29-planner
find real stubs orig diffs tools -type f | LC_ALL=C sort | xargs shasum -a 256 > SHA256SUMS
find logs -type f | LC_ALL=C sort | xargs shasum -a 256 > SHA256SUMS.logs
wc -l SHA256SUMS SHA256SUMS.logs
