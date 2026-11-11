#!/bin/bash
# Writes the kit's checksum lists (run after the last stage):
# - SHA256SUMS: the kit (real/, stubs/, orig/, diffs/, receipt/, probes/, tools/);
# - SHA256SUMS.logs: the planner's logs/ (*.log files are gitignored, so they stay out of SHA256SUMS);
# - SHA256SUMS.orig-in-wt, .red-in-wt, .real-in-wt and .receipt-in-wt: what the fixer's worktree holds at each step, paths relative to it.
set -eu
K=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t14-fix-planner
cd "$K"
ADD=apps/app/src/wallet/add
SECTIONS=apps/app/src/dev/catalogue/wallet/addSections.tsx
TESTS="$ADD/addFlow.test.ts $ADD/AmountStep.render.test.tsx $ADD/amountStepNative.test.ts"
PLAIN="$ADD/WalletKeypad.tsx $ADD/QuickChips.tsx $SECTIONS"
STUBBED="$ADD/addFlow.ts $ADD/AmountStep.tsx $ADD/TypeSwitchHeader.tsx"
ORIG="$ADD/addFlow.ts $ADD/addFlow.test.ts $ADD/AmountStep.tsx $ADD/AmountStep.render.test.tsx $ADD/TypeSwitchHeader.tsx $ADD/WalletKeypad.tsx $ADD/QuickChips.tsx $ADD/copy.ts $SECTIONS apps/app/src/dev/catalogue/wallet/index.ts docs/implementation/receipts/P2-T14.md"

find real stubs orig diffs receipt probes tools -type f | LC_ALL=C sort | xargs shasum -a 256 > SHA256SUMS
find logs -type f | LC_ALL=C sort | xargs shasum -a 256 > SHA256SUMS.logs
(cd orig && shasum -a 256 $ORIG) > SHA256SUMS.orig-in-wt
(cd real && shasum -a 256 $TESTS $PLAIN $STUBBED) > SHA256SUMS.real-in-wt
{ (cd real && shasum -a 256 $TESTS $PLAIN); (cd stubs && shasum -a 256 $STUBBED); } > SHA256SUMS.red-in-wt
(cd real && shasum -a 256 docs/implementation/receipts/P2-T14.md) > SHA256SUMS.receipt-in-wt
wc -l SHA256SUMS SHA256SUMS.logs SHA256SUMS.orig-in-wt SHA256SUMS.red-in-wt SHA256SUMS.real-in-wt SHA256SUMS.receipt-in-wt
