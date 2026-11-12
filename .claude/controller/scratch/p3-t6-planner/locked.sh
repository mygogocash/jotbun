#!/bin/zsh
# Runs one command under the shared heavy lock, and always gives the lock back.
# Usage: locked.sh <log file> <directory> <command...>
# Prints "locked" when it holds the lock, then "exit <n>; unlocked" when done.
# The command's own exit code is this script's exit code.
log=$1
dir=$2
shift 2
until mkdir /private/tmp/claude-501/jotbun-heavy.lock 2>/dev/null; do sleep 20; done
# This run holds the lock now: give it back even if the run is interrupted.
trap 'rmdir /private/tmp/claude-501/jotbun-heavy.lock 2>/dev/null; exit 130' INT TERM HUP
print locked
cd "$dir" && "$@" > "$log" 2>&1
rc=$?
rmdir /private/tmp/claude-501/jotbun-heavy.lock
print "exit $rc; unlocked"
exit $rc
