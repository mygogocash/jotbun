#!/bin/sh
# Puts the proof copy (or a worktree) at one of this task's stages.
#   stage.sh <tree> base   the files as they are at the start (orig/), nothing of this task's
#   stage.sh <tree> red    the tests, the copy and the typed stubs; HomeScreen.tsx and entryHelpers.ts as at the start
#   stage.sh <tree> green  every file in its final form (real/)
set -eu
PL=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t23-planner
T=$1
A=apps/app
NEW="$A/src/screens/redesign/homeData.ts $A/src/screens/redesign/homeData.render.test.tsx $A/src/spend/v1/redesign/availableBalances.ts $A/src/wallet/home/copy.ts $A/src/wallet/home/homeWallets.ts $A/src/wallet/home/homeWallets.test.ts $A/src/wallet/home/budgetCardWords.ts $A/src/wallet/home/budgetCardWords.test.ts"
CHANGED="$A/src/screens/redesign/HomeScreen.tsx $A/src/screens/redesign/entry/entryHelpers.ts"
case "$2" in
  base)
    for f in $NEW; do rm -f "$T/$f"; done
    rmdir "$T/$A/src/wallet/home" 2>/dev/null || true
    for f in $CHANGED; do cp "$PL/orig/$f" "$T/$f"; done
    ;;
  red)
    mkdir -p "$T/$A/src/wallet/home"
    for f in homeWallets.test.ts budgetCardWords.test.ts copy.ts; do cp "$PL/real/$A/src/wallet/home/$f" "$T/$A/src/wallet/home/$f"; done
    for f in homeWallets.ts budgetCardWords.ts; do cp "$PL/stubs/$A/src/wallet/home/$f" "$T/$A/src/wallet/home/$f"; done
    cp "$PL/real/$A/src/screens/redesign/homeData.render.test.tsx" "$T/$A/src/screens/redesign/homeData.render.test.tsx"
    cp "$PL/stubs/$A/src/screens/redesign/homeData.ts" "$T/$A/src/screens/redesign/homeData.ts"
    rm -f "$T/$A/src/spend/v1/redesign/availableBalances.ts"
    for f in $CHANGED; do cp "$PL/orig/$f" "$T/$f"; done
    ;;
  green)
    mkdir -p "$T/$A/src/wallet/home"
    for f in $NEW $CHANGED; do cp "$PL/real/$f" "$T/$f"; done
    ;;
  *) echo "usage: stage.sh <tree> base|red|green" >&2; exit 2 ;;
esac
