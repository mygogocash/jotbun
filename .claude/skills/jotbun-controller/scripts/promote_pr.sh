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
cd "$root"   # gh stack takes its repository from the current directory
G() { /usr/bin/git -C "$root" "$@"; }
merge=$(gh pr view "$pr" --repo $repo --json mergeCommit,state --jq 'select(.state=="MERGED") | .mergeCommit.oid')
[ -n "$merge" ] || { echo "#$pr is not merged"; exit 1; }
G fetch -q origin
G merge-base --is-ancestor "$merge" origin/claude/p1a-vault-core || { echo "$merge is not on the integration branch"; exit 1; }
n=$(G rev-list --count origin/main.."$merge")
[ "$n" -gt 0 ] || { echo "nothing to promote: #$pr ($merge) is already in main"; exit 0; }
br="promote/$(echo "$task" | tr 'A-Z' 'a-z')"
G push -q origin "$merge:refs/heads/$br"
# Stack it (GitHub stacked PRs, gh-stack): base it on the newest open promotion PR, so its diff shows this task alone.
open_prs=$(gh pr list --repo $repo --state open --limit 100 --json number,headRefName,createdAt \
  --jq '[.[] | select(.headRefName | startswith("promote/"))] | sort_by(.createdAt) | .[] | "\(.number) \(.headRefName)"')
base=main; below=""
if [ -n "$open_prs" ]; then base=$(echo "$open_prs" | tail -1 | cut -d' ' -f2); below=$(echo "$open_prs" | cut -d' ' -f1 | tr '\n' ' '); fi
title=$(gh pr view "$pr" --repo $repo --json title --jq .title)
title=${title#"$task: "}   # task PR titles already start with "<task>: " (#400 and #403 were doubled)
summary=$(gh pr view "$pr" --repo $repo --json body --jq .body | awk '/^## Summary/{f=1;next} /^## /{f=0} f')
review=$(ls "$root/.claude/controller/reviews/$task"*.md 2>/dev/null | sed "s|$root/||" | tr '\n' ' ')
body=$(mktemp "$root/.claude/controller/scratch/.promote.XXXX"); trap 'rm -f "$body"' EXIT
cat > "$body" <<EOF
## Summary
Promotes **$task** into main: the change reviewed and merged into the integration branch in #$pr.
$summary

## Already done
- [x] Independent review approved (${review:-see #$pr}), with any fix round confirmed.
- [x] CI green on #$pr; the task's issue was closed when it merged into the integration branch.

## Test plan
- [ ] CI on this pull request is green.
- [ ] Owner review. $n commits: the task's, plus controller-state commits under \`.claude/\` (collapsed as generated).

Part of the promotion stack (GitHub stacked PRs): based on \`$base\`, so this diff holds this task alone. Merge the stack bottom-up, or up to this PR at once with \`gh stack merge <this PR's number>\`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
url=$(gh pr create --repo $repo --base "$base" --head "$br" --title "$task: $title" --body-file "$body")
echo "$url (base $base)"
new=${url##*/}
# Link the open promotion PRs, bottom to top, into one stack; the chained bases already make a manual stack if this fails.
# gh stack link needs at least two PRs: the first open promotion PR has nothing to stack on yet.
if [ -z "$below" ]; then echo "the only open promotion PR: nothing to stack yet (the next promotion stacks on it)"
elif out=$(gh stack link --base main $below $new 2>&1); then echo "$out" | tail -3
else echo "$out" | tail -3; echo "warning: gh stack link failed; the PR's base still chains it on $base (a manual stack)"; fi
