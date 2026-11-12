#!/bin/zsh
# Writes the kit's checksums, from the kit's folder:
#   SHA256SUMS       every kit input, script and proof file that is not a .log
#   SHA256SUMS.logs  the .log files (they are gitignored, so state commits drop them)
# tree/ and checks/ are scratch copies and are left out; there is no nested repository.
kit=${0:A:h}
cd "$kit" || exit 1
inputs=(files.txt base-check.sha256 base-absent.txt place.sh applycheck.sh mutants.py locked.sh linkfarm.py make-sums.sh)
find orig real stubs diffs proof -type f ! -name '*.log' ! -name '.DS_Store' | LC_ALL=C sort > .sums-files
shasum -a 256 "${inputs[@]}" $(cat .sums-files) > SHA256SUMS
find proof -type f -name '*.log' | LC_ALL=C sort > .sums-logs
shasum -a 256 $(cat .sums-logs) > SHA256SUMS.logs
rm -f .sums-files .sums-logs
print "SHA256SUMS: $(wc -l < SHA256SUMS | tr -d ' ') lines; SHA256SUMS.logs: $(wc -l < SHA256SUMS.logs | tr -d ' ') lines"
