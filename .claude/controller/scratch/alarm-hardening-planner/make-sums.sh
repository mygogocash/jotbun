#!/bin/bash
# Planner files: SHA256SUMS over the inputs (real, stubs, orig, diffs, explore, mutants.py, the run scripts) and the
# non-log proof outputs; SHA256SUMS.logs over every *.log (gitignored, so kept out of SHA256SUMS).
P=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/alarm-hardening-planner
cd "$P" || exit 2
{ find real stubs orig diffs explore -type f; echo mutants.py; ls run-*.sh make-sums.sh; find proof -maxdepth 1 -type f \( -name '*.out' -o -name '*.sha256' \); } | LC_ALL=C sort | while read -r f; do shasum -a 256 "$f"; done > SHA256SUMS
{ find proof logs -type f -name '*.log'; } | LC_ALL=C sort | while read -r f; do shasum -a 256 "$f"; done > SHA256SUMS.logs
echo "SHA256SUMS: $(wc -l < SHA256SUMS | tr -d ' ') lines; SHA256SUMS.logs: $(wc -l < SHA256SUMS.logs | tr -d ' ') lines"
shasum -a 256 -c SHA256SUMS | grep -v ': OK$' ; echo "check done"
