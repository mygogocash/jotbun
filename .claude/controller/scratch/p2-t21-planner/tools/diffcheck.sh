#!/bin/bash
# git diff --check over this task's changes, without a repository: each new
# file against nothing, each shared file against its orig/. No output and exit
# 0 means no whitespace error.
set -u
PL=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-planner
. "$PL/tools/files.sh"
cd "$PL"
status=0
for f in $NEW; do out=$(GIT_CEILING_DIRECTORIES="$PL" /usr/bin/git diff --no-index --check /dev/null "real/$f"); [ -n "$out" ] && { echo "$out"; status=1; }; done
for f in $SHARED; do out=$(GIT_CEILING_DIRECTORIES="$PL" /usr/bin/git diff --no-index --check "orig/$f" "real/$f"); [ -n "$out" ] && { echo "$out"; status=1; }; done
exit $status
