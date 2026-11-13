#!/bin/bash
# Puts a tree (the planner's proof copy, or the worktree) at one of this task's stages:
#   stage.sh <tree> base   the head as it is: none of the new files, every shared file as orig/ has it
#   stage.sh <tree> red    the two test files and the copy table (real/), the three typed stubs (stubs/); the
#                          catalogue's files and the shared files as at the head (no savedSections.tsx, savedScreens.tsx)
#   stage.sh <tree> green  every file in its final form (real/)
set -eu
PL=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t17-planner
. "$PL/tools/files.sh"
T=$1
mkdir -p "$T/$S/wallet/saved"
case "$2" in
  base)
    for f in $NEW; do rm -f "$T/$f"; done
    rmdir "$T/$S/wallet/saved" 2>/dev/null || true
    for f in $SHARED; do cp "$PL/orig/$f" "$T/$f"; done
    ;;
  red)
    for f in $NEW; do rm -f "$T/$f"; done
    for f in $RED_REAL; do cp "$PL/real/$f" "$T/$f"; done
    for f in $STUBBED; do cp "$PL/stubs/$f" "$T/$f"; done
    for f in $SHARED; do cp "$PL/orig/$f" "$T/$f"; done
    ;;
  green)
    for f in $NEW $SHARED; do cp "$PL/real/$f" "$T/$f"; done
    ;;
  *) echo "usage: stage.sh <tree> base|red|green" >&2; exit 2 ;;
esac
