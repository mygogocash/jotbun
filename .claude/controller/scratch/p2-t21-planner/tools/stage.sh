#!/bin/bash
# Puts a tree (the planner's copy, or a worktree) at one of P2-T21's stages.
#   stage.sh <tree> base   the files as they are at the start (orig/), nothing of this task's
#   stage.sh <tree> red    the tests, the copy and the router stand-in as they end; typed stubs for the four parts and the two routes; the shared code as it starts
#   stage.sh <tree> green  every file in its final form (real/)
set -eu
PL=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-planner
T=$1
. "$PL/tools/files.sh"
put() { mkdir -p "$T/$(dirname "$2")"; cp "$PL/$1/$2" "$T/$2"; }
case "$2" in
  base)
    for f in $NEW; do rm -f "$T/$f"; done
    rmdir "$T/$A/app/spend/wallet/[id]" "$T/$A/app/spend/wallet" 2>/dev/null || true
    for f in $SHARED; do put orig "$f"; done
    ;;
  red)
    for f in $RED_REAL; do put real "$f"; done
    for f in $RED_STUB; do put stubs "$f"; done
    for f in $RED_ORIG; do put orig "$f"; done
    ;;
  green)
    for f in $NEW $SHARED; do put real "$f"; done
    ;;
  *) echo "usage: stage.sh <tree> base|red|green" >&2; exit 2 ;;
esac
