#!/bin/bash
# Puts a tree (the planner's proof copy, or the fixer's worktree) at one of the fix round's stages.
#   stage.sh <tree> base    2411001e's files (orig/), and no P2-T21-fix.md
#   stage.sh <tree> red     the two render suites as they end (real/); the code as 2411001e has it (orig/)
#   stage.sh <tree> green   every file in its final form (real/), the two receipts included
set -eu
PL=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix-planner
T=$1
. "$PL/tools/files.sh"
put() { mkdir -p "$T/$(dirname "$2")"; cp "$PL/$1/$2" "$T/$2"; }
case "$2" in
  base)
    for f in $ORIG; do put orig "$f"; done
    rm -f "$T/docs/implementation/receipts/P2-T21-fix.md"
    ;;
  red)
    for f in $TESTS; do put real "$f"; done
    for f in $CODE docs/implementation/receipts/P2-T21.md; do put orig "$f"; done
    rm -f "$T/docs/implementation/receipts/P2-T21-fix.md"
    ;;
  green)
    for f in $CODE $TESTS $RECEIPTS; do put real "$f"; done
    ;;
  *) echo "usage: stage.sh <tree> base|red|green" >&2; exit 2 ;;
esac
