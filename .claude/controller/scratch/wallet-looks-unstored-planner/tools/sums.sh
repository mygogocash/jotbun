#!/bin/bash
# Writes the kit's checksums.
#   SHA256SUMS       every file in the planner's folder but the *.log files, the
#                    proof tree work/ and the SHA256SUMS* files (paths under PL);
#   SHA256SUMS.logs  the *.log files (gitignored, so state commits leave them out);
#   SHA256SUMS.base  the two files as the head has them   } paths relative to the
#   SHA256SUMS.red   the RED state (final test, head's provider) } worktree, for
#   SHA256SUMS.real  the two final files                   } `shasum -a 256 -c` from WT.
set -eu
K=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/wallet-looks-unstored-planner
PROVIDER=apps/app/src/wallet/looks/WalletLooksProvider.tsx
TEST=apps/app/src/wallet/looks/WalletLooks.render.test.tsx
cd "$K"
(cd orig && shasum -a 256 "$TEST" "$PROVIDER") > SHA256SUMS.base
{ (cd real && shasum -a 256 "$TEST"); (cd stubs && shasum -a 256 "$PROVIDER"); } > SHA256SUMS.red
(cd real && shasum -a 256 "$TEST" "$PROVIDER") > SHA256SUMS.real
find . -type f -not -path './work/*' -not -name '*.log' -not -name 'SHA256SUMS*' | sed 's|^\./||' | LC_ALL=C sort | while read -r f; do shasum -a 256 "$f"; done > SHA256SUMS
find . -type f -not -path './work/*' -name '*.log' | sed 's|^\./||' | LC_ALL=C sort | while read -r f; do shasum -a 256 "$f"; done > SHA256SUMS.logs
wc -l SHA256SUMS SHA256SUMS.logs SHA256SUMS.base SHA256SUMS.red SHA256SUMS.real
