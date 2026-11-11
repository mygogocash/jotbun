#!/bin/sh
# Puts the proof copy (or a worktree) at one of this task's stages.
#   stage.sh <tree> base   the files as they are at the start (orig/), nothing of this task's
#   stage.sh <tree> red    the tests, the copy and the typed stubs; route, sections and index.ts as at the start
#   stage.sh <tree> green  every file in its final form (real/)
set -eu
PL=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t20-planner
T=$1
A=apps/app
NEW="$A/src/wallet/wallets/walletsList.ts $A/src/wallet/wallets/walletsList.test.ts $A/src/wallet/wallets/copy.ts $A/src/wallet/wallets/WalletsListScreen.tsx $A/src/wallet/wallets/ReorderTray.tsx $A/src/wallet/wallets/WalletsList.render.test.tsx $A/src/dev/catalogue/wallet/walletListSections.tsx"
SHARED="$A/app/spend/wallets.tsx $A/src/dev/catalogue/wallet/index.ts $A/src/screens/redesign/planning/PlanningRoutes.render.test.tsx"
case "$2" in
  base)
    for f in $NEW; do rm -f "$T/$f"; done
    rmdir "$T/$A/src/wallet/wallets" 2>/dev/null || true
    for f in $SHARED; do cp "$PL/orig/$f" "$T/$f"; done
    ;;
  red)
    mkdir -p "$T/$A/src/wallet/wallets"
    for f in walletsList.test.ts copy.ts WalletsList.render.test.tsx; do cp "$PL/real/$A/src/wallet/wallets/$f" "$T/$A/src/wallet/wallets/$f"; done
    for f in walletsList.ts WalletsListScreen.tsx ReorderTray.tsx; do cp "$PL/stubs/$A/src/wallet/wallets/$f" "$T/$A/src/wallet/wallets/$f"; done
    cp "$PL/real/$A/src/screens/redesign/planning/PlanningRoutes.render.test.tsx" "$T/$A/src/screens/redesign/planning/PlanningRoutes.render.test.tsx"
    cp "$PL/orig/$A/app/spend/wallets.tsx" "$T/$A/app/spend/wallets.tsx"
    cp "$PL/orig/$A/src/dev/catalogue/wallet/index.ts" "$T/$A/src/dev/catalogue/wallet/index.ts"
    rm -f "$T/$A/src/dev/catalogue/wallet/walletListSections.tsx"
    ;;
  green)
    mkdir -p "$T/$A/src/wallet/wallets"
    for f in $NEW $SHARED; do cp "$PL/real/$f" "$T/$f"; done
    ;;
  *) echo "usage: stage.sh <tree> base|red|green" >&2; exit 2 ;;
esac
