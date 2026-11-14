#!/bin/bash
# git diff --check over the round's changes, without a repository: each changed file against its orig/, each new
# file against nothing. No output and exit 0 means no whitespace error.
set -u
PL=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix-planner
. "$PL/tools/files.sh"
cd "$PL"
TOP=$(dirname "$PL")
status=0
for f in $ORIG; do out=$(GIT_CEILING_DIRECTORIES="$TOP" /usr/bin/git diff --no-index --check "orig/$f" "real/$f"); [ -n "$out" ] && { echo "$out"; status=1; }; done
for f in $NEW; do out=$(GIT_CEILING_DIRECTORIES="$TOP" /usr/bin/git diff --no-index --check /dev/null "real/$f"); [ -n "$out" ] && { echo "$out"; status=1; }; done
exit $status
