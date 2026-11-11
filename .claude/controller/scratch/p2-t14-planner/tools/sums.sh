#!/bin/bash
# Writes SHA256SUMS (real/, stubs/, orig/, base/, diffs/, tools/) and
# SHA256SUMS.logs (everything under logs/, kept apart because *.log files are
# gitignored and lost in state commits), each line `<sha256>  <path>`.
set -eu
K=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t14-planner
cd "$K"
find real stubs orig base diffs tools -type f | LC_ALL=C sort | while read -r rel; do shasum -a 256 "$rel"; done > SHA256SUMS
find logs -type f | LC_ALL=C sort | while read -r rel; do shasum -a 256 "$rel"; done > SHA256SUMS.logs
echo "SHA256SUMS: $(wc -l < SHA256SUMS | tr -d ' ') files; SHA256SUMS.logs: $(wc -l < SHA256SUMS.logs | tr -d ' ') files"
shasum -a 256 -c SHA256SUMS > /dev/null && shasum -a 256 -c SHA256SUMS.logs > /dev/null && echo "both verify"
