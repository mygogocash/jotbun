#!/bin/bash
# Planner files: SHA256SUMS over the kit's inputs (real, stubs, orig, diffs, merge, the lists and the scripts) and
# every non-log proof output (proof/); SHA256SUMS.logs over every *.log (gitignored, so kept out of SHA256SUMS).
# Not summed: base/, red/ and tree/ (scratch working copies).
P=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p3-t4-planner
cd "$P" || exit 2
{ find real stubs orig diffs merge -type f; printf '%s\n' files.txt base-check.sha256 base-absent.txt locked.sh mutants.py run-red.sh run-green.sh run-all.sh make-sums.sh; find proof -type f ! -name '*.log'; } | LC_ALL=C sort | while read -r f; do shasum -a 256 "$f"; done > SHA256SUMS
{ find proof -type f -name '*.log'; } | LC_ALL=C sort | while read -r f; do shasum -a 256 "$f"; done > SHA256SUMS.logs
echo "SHA256SUMS: $(wc -l < SHA256SUMS | tr -d ' ') lines; SHA256SUMS.logs: $(wc -l < SHA256SUMS.logs | tr -d ' ') lines"
shasum -a 256 -c SHA256SUMS | grep -v ': OK$' ; echo "check done"
