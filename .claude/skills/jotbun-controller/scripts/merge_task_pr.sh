#!/bin/bash
# Merge a reviewed task PR at its reviewed head, close its task issue by hand, and remove its worktree and branches.
# Usage: merge_task_pr.sh <pr-number> <reviewed-sha-prefix> [task-id]
#   task-id (e.g. 1B-T5) is looked up in docs/implementation/backlog-map.json to close its issue;
#   omit it for a PR with no task issue (a fix or follow-up).
# Refuses unless the PR head still starts with the reviewed SHA and every check passed.
set -eu
pr=$1; sha=$2; task=${3:-}
repo=mygogocash/jotbun
root=/Users/kunanonjarat/Developer/jotbun
head=$(gh pr view "$pr" --repo $repo --json headRefOid --jq .headRefOid)
branch=$(gh pr view "$pr" --repo $repo --json headRefName --jq .headRefName)
case "$head" in "$sha"*) ;; *) echo "head $head is not the reviewed $sha; not merging"; exit 1;; esac
bad=$(gh pr checks "$pr" --repo $repo --json bucket,name --jq '.[] | select(.bucket != "pass") | "\(.name): \(.bucket)"')
[ -z "$bad" ] || { echo "checks not all green:"; echo "$bad"; exit 1; }
case "$branch" in main|claude/p1a-vault-core|claude/premium-ai-edge|claude/jotbun-redesign-plan) echo "refusing protected branch $branch"; exit 1;; esac
gh pr merge "$pr" --repo $repo --merge --match-head-commit "$head"
merged=$(gh pr view "$pr" --repo $repo --json mergeCommit --jq '.mergeCommit.oid[:7]')
echo "merged #$pr as $merged"
if [ -n "$task" ]; then
  issue=$(python3 -I -c "import json,sys; print(json.load(open(sys.argv[1]))['tasks'][sys.argv[2]])" "$root/.claude/worktrees/p1a-vault-core/docs/implementation/backlog-map.json" "$task")
  gh issue close "$issue" --repo $repo --comment "Done in #$pr (merged into claude/p1a-vault-core as $merged). Closed by hand because the base is not the default branch."
fi
wt=$(/usr/bin/git -C "$root" worktree list --porcelain | awk -v b="refs/heads/$branch" '/^worktree /{w=$2} $0=="branch "b{print w}')
if [ -n "$wt" ]; then
  [ -z "$(/usr/bin/git -C "$wt" status --short)" ] || { echo "worktree $wt is dirty; left in place"; exit 1; }
  /usr/bin/git -C "$root" worktree remove "$wt" && echo "removed $wt"
fi
/usr/bin/git -C "$root" branch -D "$branch" 2>/dev/null || true
/usr/bin/git -C "$root" push -q origin --delete "$branch" 2>/dev/null && echo "deleted origin/$branch" || true
