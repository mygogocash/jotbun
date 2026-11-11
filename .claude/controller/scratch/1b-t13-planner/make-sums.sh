#!/bin/bash
# Planner files: SHA256SUMS over the kit's inputs (real, stubs, orig, diffs, smoke, the lists and the scripts) and
# every non-log proof output (proof/, the mutant backups included); SHA256SUMS.logs over every *.log (gitignored, so
# kept out of SHA256SUMS). Not summed: base/ (`git archive b8095b99`), red/ and tree/ (scratch working copies), and
# the brief's own drafting files (assemble-brief.py, brief-*.md, brief-values.json), which feed briefs/1B-T13.md.
P=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1b-t13-planner
cd "$P" || exit 2
{ find real stubs orig diffs smoke -type f; printf '%s\n' files.txt base-check.sha256 base-absent.txt check-targets.py locked.sh mutants.py run-red.sh run-green.sh run-all.sh run-devmjs.sh make-sums.sh; find proof -type f ! -name '*.log'; } | LC_ALL=C sort | while read -r f; do shasum -a 256 "$f"; done > SHA256SUMS
{ find proof logs -type f -name '*.log'; } | LC_ALL=C sort | while read -r f; do shasum -a 256 "$f"; done > SHA256SUMS.logs
echo "SHA256SUMS: $(wc -l < SHA256SUMS | tr -d ' ') lines; SHA256SUMS.logs: $(wc -l < SHA256SUMS.logs | tr -d ' ') lines"
shasum -a 256 -c SHA256SUMS | grep -v ': OK$' ; echo "check done"
