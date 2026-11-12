#!/bin/sh
# Puts the proof copy (or a worktree) at one of this task's stages.
#   stage.sh <tree> base   the two existing files as at the start (orig/), none of this task's new files
#   stage.sh <tree> red    the tests in their final form (real/), the code as typed stubs (stubs/)
#   stage.sh <tree> green  every file in its final form (real/)
set -eu
PL=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p3-t5-planner
T=$1
A=apps/app/src
TESTS="$A/analytics/events.test.ts $A/spend/v1/ai/draftReview.test.ts $A/spend/v1/ai/useDraftReview.render.test.tsx $A/dev/draftTally.test.ts"
CODE="$A/analytics/events.ts $A/spend/v1/ai/draftReview.ts $A/spend/v1/ai/useDraftReview.ts $A/dev/draftTally.ts"
NEW="$A/spend/v1/ai/draftReview.ts $A/spend/v1/ai/useDraftReview.ts $A/dev/draftTally.ts $A/spend/v1/ai/draftReview.test.ts $A/spend/v1/ai/useDraftReview.render.test.tsx $A/dev/draftTally.test.ts"
case "$2" in
  base)
    for f in $NEW; do rm -f "$T/$f"; done
    cp "$PL/orig/$A/analytics/events.ts" "$T/$A/analytics/events.ts"
    cp "$PL/orig/$A/analytics/events.test.ts" "$T/$A/analytics/events.test.ts"
    ;;
  red)
    for f in $TESTS; do cp "$PL/real/$f" "$T/$f"; done
    for f in $CODE; do cp "$PL/stubs/$f" "$T/$f"; done
    ;;
  green)
    for f in $TESTS $CODE; do cp "$PL/real/$f" "$T/$f"; done
    ;;
  *) echo "usage: stage.sh <tree> base|red|green" >&2; exit 2 ;;
esac
