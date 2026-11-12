#!/bin/sh
# Puts the proof copy (or a worktree) at one of this fix round's stages.
#   stage.sh <tree> base   fd41909c's files (orig/); nothing of this round's
#   stage.sh <tree> red    the two tests and the copy (real/), and the TransferStep stub; every other file as at fd41909c
#   stage.sh <tree> green  every file in its final form (real/)
set -eu
FP=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t15-fix-planner
T=$1
A=apps/app/src
NEW="$A/wallet/add/addStepsNative.test.ts $A/dev/catalogue/wallet/addStepsSection.tsx"
CHANGED="$A/wallet/add/ConfirmStep.tsx $A/wallet/add/TransferStep.tsx $A/wallet/add/PickSteps.tsx $A/wallet/add/copy.ts $A/wallet/add/AddSteps.render.test.tsx $A/dev/catalogue/wallet/addSections.tsx docs/implementation/receipts/P2-T15.md"
case "$2" in
  base)
    for f in $NEW; do rm -f "$T/$f"; done
    for f in $CHANGED; do cp "$FP/orig/$f" "$T/$f"; done
    ;;
  red)
    for f in $CHANGED; do cp "$FP/orig/$f" "$T/$f"; done
    rm -f "$T/$A/dev/catalogue/wallet/addStepsSection.tsx"
    for f in $A/wallet/add/AddSteps.render.test.tsx $A/wallet/add/addStepsNative.test.ts $A/wallet/add/copy.ts; do cp "$FP/real/$f" "$T/$f"; done
    cp "$FP/stubs/$A/wallet/add/TransferStep.tsx" "$T/$A/wallet/add/TransferStep.tsx"
    ;;
  green)
    for f in $NEW $CHANGED; do cp "$FP/real/$f" "$T/$f"; done
    ;;
  *) echo "usage: stage.sh <tree> base|red|green" >&2; exit 2 ;;
esac
