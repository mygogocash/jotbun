#!/bin/bash
# Create a task worktree and branch from the current integration head.
# Usage: new_task_worktree.sh <worktree-name> <branch>
#   e.g. new_task_worktree.sh p1-1b-t6 p1/1b-t6-exports
# Use the names the brief's WT line gives.
set -eu
name=$1; branch=$2
P=/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1a-vault-core
W=/Users/kunanonjarat/Developer/jotbun/.claude/worktrees
/usr/bin/git -C "$P" fetch -q origin
/usr/bin/git -C "$P" worktree add -q -b "$branch" "$W/$name" origin/claude/p1a-vault-core
echo "created $W/$name on $branch at $(/usr/bin/git -C "$W/$name" log --oneline -1 | cat)"
