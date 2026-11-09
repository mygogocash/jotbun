#!/bin/bash
# Open one small pull request into main for one merged task, for the owner to review and merge.
# Usage: bash promote_pr.sh <task-id> <task-pr-number>
#   Run it right after merge_task_pr.sh. The branch promote/<task-id> points at the task's merge commit on the
#   integration branch, so the PR holds that task's commits, plus any controller-state commits since the last
#   promotion (GitHub collapses .claude/ as generated). Promotions are meant to be merged in the order opened;
#   a later one merged first simply carries the earlier ones too. Merging into main stays the owner's call.
set -eu
task=$1; pr=$2
repo=mygogocash/jotbun
root=/Users/kunanonjarat/Developer/jotbun
G() { /usr/bin/git -C "$root" "$@"; }
merge=$(gh pr view "$pr" --repo $repo --json mergeCommit,state --jq 'select(.state=="MERGED") | .mergeCommit.oid')
[ -n "$merge" ] || { echo "#$pr is not merged"; exit 1; }
G fetch -q origin
G merge-base --is-ancestor "$merge" origin/claude/p1a-vault-core || { echo "$merge is not on the integration branch"; exit 1; }
n=$(G rev-list --count origin/main.."$merge")
[ "$n" -gt 0 ] || { echo "nothing to promote: #$pr ($merge) is already in main"; exit 0; }
br="promote/$(echo "$task" | tr 'A-Z' 'a-z')"
G push -q origin "$merge:refs/heads/$br"
title=$(gh pr view "$pr" --repo $repo --json title --jq .title)
summary=$(gh pr view "$pr" --repo $repo --json body --jq .body | awk '/^## Summary/{f=1;next} /^## /{f=0} f')
review=$(ls "$root/.claude/controller/reviews/$task"*.md 2>/dev/null | sed "s|$root/||" | tr '\n' ' ')
body=$(mktemp "$root/.claude/controller/scratch/.promote.XXXX"); trap 'rm -f "$body"' EXIT
cat > "$body" <<EOF
## Summary
Promotes **$task** into main: the change reviewed and merged into the integration branch in #$pr.
$summary

## Already done
- [x] Independent Opus review approved (${review:-see #$pr}), with any fix round confirmed.
- [x] CI green on #$pr; the task's issue was closed when it merged into the integration branch.

## Test plan
- [ ] CI on this pull request is green.
- [ ] Owner review. $n commits: the task's, plus controller-state commits under \`.claude/\` (collapsed as generated).

Merge promotion pull requests in the order they were opened.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
gh pr create --repo $repo --base main --head "$br" --title "$task: $title" --body-file "$body"
