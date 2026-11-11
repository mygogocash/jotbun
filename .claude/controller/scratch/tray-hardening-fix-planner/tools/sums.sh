#!/bin/bash
# Writes the kit's checksums.
#   SHA256SUMS.base  the three tray files as 784667b has them           } paths relative to the
#   SHA256SUMS.red   the RED state (the final test file, 784667b's code) } worktree, for
#   SHA256SUMS.real  the final state                                     } `shasum -a 256 -c` from WT.
#   SHA256SUMS       every file in the planner's folder but the *.log files, the
#                    proof tree work/ and the SHA256SUMS* files (paths under PL);
#   SHA256SUMS.logs  the *.log files (gitignored, so state commits leave them out).
# `bash sums.sh worktree` writes only the first three (the rehearsal needs them).
set -eu
K=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/tray-hardening-fix-planner
TRAY=apps/app/src/wallet/tray/Tray.tsx
RENDER=apps/app/src/wallet/tray/Tray.render.test.tsx
NODE=apps/app/src/wallet/tray/trayGesture.test.ts
cd "$K"
(cd orig && shasum -a 256 "$TRAY" "$RENDER" "$NODE") > SHA256SUMS.base
{ (cd orig && shasum -a 256 "$TRAY"); (cd real && shasum -a 256 "$RENDER"); (cd orig && shasum -a 256 "$NODE"); } > SHA256SUMS.red
{ (cd real && shasum -a 256 "$TRAY" "$RENDER"); (cd orig && shasum -a 256 "$NODE"); } > SHA256SUMS.real
if [ "${1:-}" = worktree ]; then wc -l SHA256SUMS.base SHA256SUMS.red SHA256SUMS.real; exit 0; fi
find . -type f -not -path './work/*' -not -name '*.log' -not -name 'SHA256SUMS*' | sed 's|^\./||' | LC_ALL=C sort | while read -r f; do shasum -a 256 "$f"; done > SHA256SUMS
find . -type f -not -path './work/*' -name '*.log' | sed 's|^\./||' | LC_ALL=C sort | while read -r f; do shasum -a 256 "$f"; done > SHA256SUMS.logs
wc -l SHA256SUMS SHA256SUMS.logs SHA256SUMS.base SHA256SUMS.red SHA256SUMS.real
