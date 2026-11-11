#!/bin/sh
# Writes the planner folder's checksums. SHA256SUMS: every file in real/,
# stubs/, orig/, diffs/, tools/, merge/ and logs/ that is not a .log (the
# .log files are gitignored, so the state commits leave them out).
# SHA256SUMS.logs: every .log file in logs/ and merge/. The proof trees in
# work/ are in neither. Check with: cd <planner folder> && shasum -a 256 -c SHA256SUMS
set -eu
cd /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t23-planner
find real stubs orig diffs tools merge logs -type f ! -name '*.log' | LC_ALL=C sort | xargs shasum -a 256 > SHA256SUMS
find logs merge -type f -name '*.log' | LC_ALL=C sort | xargs shasum -a 256 > SHA256SUMS.logs
wc -l SHA256SUMS SHA256SUMS.logs
