#!/bin/bash
# git diff --check over the round's changes, without a repository: each changed file against its orig/, the new
# receipt against nothing. No output and exit 0 means no whitespace error.
set -u
PL=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix-planner
. "$PL/tools/files.sh"
cd "$PL"
# The folder above the kit is the ceiling, so git never climbs into the main checkout.
TOP=$(dirname "$PL")
status=0
for f in $ORIG; do out=$(GIT_CEILING_DIRECTORIES="$TOP" /usr/bin/git diff --no-index --check "orig/$f" "real/$f"); [ -n "$out" ] && { echo "$out"; status=1; }; done
out=$(GIT_CEILING_DIRECTORIES="$TOP" /usr/bin/git diff --no-index --check /dev/null real/docs/implementation/receipts/P2-T21-fix.md); [ -n "$out" ] && { echo "$out"; status=1; }
exit $status
