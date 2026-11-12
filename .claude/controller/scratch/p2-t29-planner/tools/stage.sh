#!/bin/sh
# Puts the worktree (or proof copy) at one of this task's stages.
#   stage.sh <tree> base   the files as they are at the start (orig/), nothing of this task's
#   stage.sh <tree> red    the tests, copy and typed stubs; shared files as at start
#   stage.sh <tree> green  every file in its final form (real/)
set -eu
PL=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t29-planner
T=$1
A=apps/app

NEW="$A/src/screens/redesign/planning/categoryCommands.ts $A/src/wallet/categories/WalletCategoriesScreen.tsx $A/src/wallet/categories/CategoryTray.tsx $A/src/wallet/categories/ThaiPackTray.tsx $A/src/wallet/categories/copy.ts $A/src/wallet/categories/WalletCategories.render.test.tsx $A/src/dev/catalogue/wallet/categorySections.tsx"
SHARED="$A/src/screens/redesign/planning/CategoriesScreen.tsx $A/app/spend/categories.tsx $A/src/dev/catalogue/wallet/index.ts"

case "$2" in
  base)
    for f in $NEW; do rm -f "$T/$f"; done
    rmdir "$T/$A/src/wallet/categories" 2>/dev/null || true
    for f in $SHARED; do cp "$PL/orig/$f" "$T/$f"; done
    ;;
  red)
    mkdir -p "$T/$A/src/wallet/categories" "$T/$A/src/dev/catalogue/wallet" "$T/$A/src/screens/redesign/planning"
    for f in copy.ts WalletCategories.render.test.tsx; do cp "$PL/real/$A/src/wallet/categories/$f" "$T/$A/src/wallet/categories/$f"; done
    for f in WalletCategoriesScreen.tsx CategoryTray.tsx ThaiPackTray.tsx; do cp "$PL/stubs/$A/src/wallet/categories/$f" "$T/$A/src/wallet/categories/$f"; done
    cp "$PL/stubs/$A/src/dev/catalogue/wallet/categorySections.tsx" "$T/$A/src/dev/catalogue/wallet/categorySections.tsx"
    rm -f "$T/$A/src/screens/redesign/planning/categoryCommands.ts"
    for f in $SHARED; do cp "$PL/orig/$f" "$T/$f"; done
    ;;
  green)
    mkdir -p "$T/$A/src/wallet/categories" "$T/$A/src/dev/catalogue/wallet" "$T/$A/src/screens/redesign/planning" "$T/$A/app/spend"
    for f in $NEW $SHARED; do cp "$PL/real/$f" "$T/$f"; done
    ;;
  *) echo "usage: stage.sh <tree> base|red|green" >&2; exit 2 ;;
esac
