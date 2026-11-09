#!/bin/bash
# Create a task worktree and branch from the current integration head.
# Usage: new_task_worktree.sh <worktree-name> <branch> [install|install-edge]
#   e.g. new_task_worktree.sh p1-1b-t6 p1/1b-t6-exports install-edge
#   install:      npm ci at the root (app, API and package tasks), so the agent starts with node_modules ready
#   install-edge: the same, plus `npm run install:edge` (edge tasks)
#   With either, dispatch with make_prompt's --installed. npm ci takes about 15 s here with a warm npm cache.
# Use the names the brief's WT line gives.
set -eu
name=$1; branch=$2; inst=${3:-}
P=/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1a-vault-core
W=/Users/kunanonjarat/Developer/jotbun/.claude/worktrees
/usr/bin/git -C "$P" fetch -q origin
/usr/bin/git -C "$P" worktree add -q -b "$branch" "$W/$name" origin/claude/p1a-vault-core
echo "created $W/$name on $branch at $(/usr/bin/git -C "$W/$name" log --oneline -1 | cat)"
if [ "$inst" = install ] || [ "$inst" = install-edge ]; then
  (cd "$W/$name" && npm ci --ignore-scripts --no-audit --no-fund >/dev/null 2>&1) && echo "npm ci: ok" || { echo "npm ci failed; the agent must install"; exit 1; }
  if [ "$inst" = install-edge ]; then
    (cd "$W/$name" && npm run install:edge >/dev/null 2>&1) && echo "install:edge: ok" || { echo "install:edge failed; the agent must install"; exit 1; }
  fi
  [ -z "$(/usr/bin/git -C "$W/$name" status --short)" ] || { echo "warning: the install left changes in the worktree"; /usr/bin/git -C "$W/$name" status --short | head -5; }
fi
