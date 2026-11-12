#!/bin/sh
# Puts the proof copy (or a worktree) at one of this task's stages.
#   stage.sh <tree> base   the files as they are at the start (orig/), nothing of this task's
#   stage.sh <tree> red    the test, the copy and the typed stubs; addSections.tsx and WalletsList.render.test.tsx as at the start
#   stage.sh <tree> green  every file in its final form (real/)
set -eu
PL=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t15-planner
T=$1
A=apps/app/src
NEW="$A/wallet/add/TransferStep.tsx $A/wallet/add/ConfirmStep.tsx $A/wallet/add/PickSteps.tsx $A/wallet/add/AddSteps.render.test.tsx"
SHARED="$A/wallet/add/copy.ts $A/dev/catalogue/wallet/addSections.tsx $A/wallet/wallets/WalletsList.render.test.tsx"
case "$2" in
  base)
    for f in $NEW; do rm -f "$T/$f"; done
    for f in $SHARED; do cp "$PL/orig/$f" "$T/$f"; done
    ;;
  red)
    cp "$PL/real/$A/wallet/add/AddSteps.render.test.tsx" "$T/$A/wallet/add/AddSteps.render.test.tsx"
    cp "$PL/real/$A/wallet/add/copy.ts" "$T/$A/wallet/add/copy.ts"
    for f in TransferStep.tsx ConfirmStep.tsx PickSteps.tsx; do cp "$PL/stubs/$A/wallet/add/$f" "$T/$A/wallet/add/$f"; done
    cp "$PL/orig/$A/dev/catalogue/wallet/addSections.tsx" "$T/$A/dev/catalogue/wallet/addSections.tsx"
    cp "$PL/orig/$A/wallet/wallets/WalletsList.render.test.tsx" "$T/$A/wallet/wallets/WalletsList.render.test.tsx"
    ;;
  green)
    for f in $NEW $SHARED; do cp "$PL/real/$f" "$T/$f"; done
    ;;
  *) echo "usage: stage.sh <tree> base|red|green" >&2; exit 2 ;;
esac
