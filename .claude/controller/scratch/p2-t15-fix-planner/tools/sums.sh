#!/bin/sh
# Writes the fix kit's checksums:
#   SHA256SUMS                the kit (real/, stubs/, orig/, diffs/, tools/); check from the kit folder
#   SHA256SUMS.logs           everything in logs/ (gitignored, so the state commits leave it out)
#   SHA256SUMS.orig-in-wt     the seven files this round changes, as fd41909c has them; check from WT
#   SHA256SUMS.red-in-wt      the four files RED writes (the two tests and the copy from real/, the stub); check from WT
#   SHA256SUMS.real-in-wt     the nine files of the round's final form; check from WT
# work/ (the proof copy, with node_modules) is not summed.
set -eu
FP=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t15-fix-planner
A=apps/app/src
CHANGED="$A/wallet/add/ConfirmStep.tsx $A/wallet/add/TransferStep.tsx $A/wallet/add/PickSteps.tsx $A/wallet/add/copy.ts $A/wallet/add/AddSteps.render.test.tsx $A/dev/catalogue/wallet/addSections.tsx docs/implementation/receipts/P2-T15.md"
NEW="$A/wallet/add/addStepsNative.test.ts $A/dev/catalogue/wallet/addStepsSection.tsx"
cd "$FP"
find real stubs orig diffs tools -type f | LC_ALL=C sort | xargs shasum -a 256 > SHA256SUMS
find logs -type f | LC_ALL=C sort | xargs shasum -a 256 > SHA256SUMS.logs
(cd orig && shasum -a 256 $CHANGED) > SHA256SUMS.orig-in-wt
{
  (cd real && shasum -a 256 $A/wallet/add/AddSteps.render.test.tsx $A/wallet/add/addStepsNative.test.ts $A/wallet/add/copy.ts)
  (cd stubs && shasum -a 256 $A/wallet/add/TransferStep.tsx)
} > SHA256SUMS.red-in-wt
(cd real && shasum -a 256 $CHANGED $NEW) > SHA256SUMS.real-in-wt
wc -l SHA256SUMS SHA256SUMS.logs SHA256SUMS.orig-in-wt SHA256SUMS.red-in-wt SHA256SUMS.real-in-wt
