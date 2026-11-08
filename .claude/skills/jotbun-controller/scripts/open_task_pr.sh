#!/bin/bash
# Push a finished task branch and open its PR into the integration branch.
# Usage: open_task_pr.sh <worktree-path> <title> <body-file>
# Refuses a dirty worktree, and stops if the branch conflicts with origin/claude/p1a-vault-core.
set -eu
wt=$1; title=$2; body=$3
cd "$wt"
[ -z "$(/usr/bin/git status --short)" ] || { echo "dirty worktree: $wt"; exit 1; }
branch=$(/usr/bin/git rev-parse --abbrev-ref HEAD)
/usr/bin/git fetch -q origin claude/p1a-vault-core
if ! tree=$(/usr/bin/git merge-tree --write-tree --name-only HEAD origin/claude/p1a-vault-core); then
  echo "conflicts with the integration head:"; echo "$tree" | sed -n '2,40p'; exit 1
fi
/usr/bin/git push -q -u origin "$branch" 2>&1 | grep -v '^remote:' || true
gh pr create --repo mygogocash/jotbun --base claude/p1a-vault-core --head "$branch" --title "$title" --body-file "$body"
