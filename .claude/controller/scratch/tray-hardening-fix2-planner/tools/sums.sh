#!/bin/bash
# Writes the kit's checksums.
#   SHA256SUMS.base   the three files as fc78376 has them                      } paths relative to the
#   SHA256SUMS.red    Step 3's first RED: the final test file, fc78376's rest   } worktree, for
#   SHA256SUMS.redm3  Step 3's second RED: red-m3's Tray.tsx, the final test    } `shasum -a 256 -c`
#                     file, fc78376's receipt                                   } from WT.
#   SHA256SUMS.green  after Step 4: the final Tray.tsx and test file, fc78376's receipt
#   SHA256SUMS.real   after Step 7: the three final files
#   SHA256SUMS        every file in the planner's folder but the *.log files, the proof
#                     tree work/, a rehearsal left behind and the SHA256SUMS* files (paths under PL);
#   SHA256SUMS.logs   the *.log files (gitignored, so state commits leave them out).
# `bash sums.sh worktree` writes only the five worktree sums (the rehearsal needs them).
set -eu
K=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/tray-hardening-fix2-planner
TRAY=apps/app/src/wallet/tray/Tray.tsx
TEST=apps/app/src/wallet/tray/Tray.render.test.tsx
RECEIPT=docs/implementation/receipts/tray-hardening.md
cd "$K"
(cd orig && shasum -a 256 "$TRAY" "$TEST" "$RECEIPT") > SHA256SUMS.base
{ (cd orig && shasum -a 256 "$TRAY"); (cd real && shasum -a 256 "$TEST"); (cd orig && shasum -a 256 "$RECEIPT"); } > SHA256SUMS.red
{ (cd red-m3 && shasum -a 256 "$TRAY"); (cd real && shasum -a 256 "$TEST"); (cd orig && shasum -a 256 "$RECEIPT"); } > SHA256SUMS.redm3
{ (cd real && shasum -a 256 "$TRAY" "$TEST"); (cd orig && shasum -a 256 "$RECEIPT"); } > SHA256SUMS.green
(cd real && shasum -a 256 "$TRAY" "$TEST" "$RECEIPT") > SHA256SUMS.real
if [ "${1:-}" = worktree ]; then wc -l SHA256SUMS.base SHA256SUMS.red SHA256SUMS.redm3 SHA256SUMS.green SHA256SUMS.real; exit 0; fi
find . -type f -not -path './work/*' -not -path './rehearsal/*' -not -name '*.log' -not -name 'SHA256SUMS*' | sed 's|^\./||' | LC_ALL=C sort | while read -r f; do shasum -a 256 "$f"; done > SHA256SUMS
find . -type f -not -path './work/*' -not -path './rehearsal/*' -name '*.log' | sed 's|^\./||' | LC_ALL=C sort | while read -r f; do shasum -a 256 "$f"; done > SHA256SUMS.logs
wc -l SHA256SUMS SHA256SUMS.logs SHA256SUMS.base SHA256SUMS.red SHA256SUMS.redm3 SHA256SUMS.green SHA256SUMS.real
