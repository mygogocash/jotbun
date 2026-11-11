#!/bin/bash
# 1B-T12 fix kit: SHA256SUMS over the inputs (real, orig, diffs, twin, smoke, the scripts) and the non-log proof
# outputs (*.json, *.out, the saved copies); SHA256SUMS.logs over every *.log (gitignored, so kept out of SHA256SUMS).
K=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1b-t12-fix-planner
cd "$K" || exit 2
{ find real orig diffs twin smoke -type f; printf '%s\n' mutants.py run-twin.sh run-smoke.sh make-sums.sh; find proof -type f ! -name '*.log'; } | LC_ALL=C sort | while read -r f; do shasum -a 256 "$f"; done > SHA256SUMS
{ find proof logs -type f -name '*.log'; } | LC_ALL=C sort | while read -r f; do shasum -a 256 "$f"; done > SHA256SUMS.logs
echo "SHA256SUMS: $(wc -l < SHA256SUMS | tr -d ' ') lines; SHA256SUMS.logs: $(wc -l < SHA256SUMS.logs | tr -d ' ') lines"
shasum -a 256 -c SHA256SUMS | grep -v ': OK$' ; echo "check done"
