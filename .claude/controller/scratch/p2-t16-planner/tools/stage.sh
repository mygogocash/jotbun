#!/bin/sh
# Puts the proof copy (or a worktree) at one of this task's stages.
#   stage.sh <tree> base   the files as they are at the start (orig/), nothing of this task's
#   stage.sh <tree> red    the test, the copy, the two pinned neighbours and the typed stub;
#                          addSections.tsx and WalletsList.render.test.tsx as at the start, no addHostSection.tsx
#   stage.sh <tree> green  every file in its final form (real/)
set -eu
PL=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-planner
T=$1
A=apps/app/src
NEW="$A/wallet/add/AddTrayHost.tsx $A/wallet/add/AddTray.render.test.tsx $A/dev/catalogue/wallet/addHostSection.tsx"
SHARED="$A/wallet/add/copy.ts $A/dev/catalogue/wallet/addSections.tsx $A/wallet/wallets/WalletsList.render.test.tsx $A/wallet/add/AddSteps.render.test.tsx $A/wallet/tray/Tray.render.test.tsx"
case "$2" in
  base)
    for f in $NEW; do rm -f "$T/$f"; done
    for f in $SHARED; do cp "$PL/orig/$f" "$T/$f"; done
    ;;
  red)
    for f in wallet/add/AddTray.render.test.tsx wallet/add/copy.ts wallet/add/AddSteps.render.test.tsx wallet/tray/Tray.render.test.tsx; do cp "$PL/real/$A/$f" "$T/$A/$f"; done
    cp "$PL/stubs/$A/wallet/add/AddTrayHost.tsx" "$T/$A/wallet/add/AddTrayHost.tsx"
    cp "$PL/orig/$A/dev/catalogue/wallet/addSections.tsx" "$T/$A/dev/catalogue/wallet/addSections.tsx"
    cp "$PL/orig/$A/wallet/wallets/WalletsList.render.test.tsx" "$T/$A/wallet/wallets/WalletsList.render.test.tsx"
    rm -f "$T/$A/dev/catalogue/wallet/addHostSection.tsx"
    ;;
  green)
    for f in $NEW $SHARED; do cp "$PL/real/$f" "$T/$f"; done
    ;;
  *) echo "usage: stage.sh <tree> base|red|green" >&2; exit 2 ;;
esac
