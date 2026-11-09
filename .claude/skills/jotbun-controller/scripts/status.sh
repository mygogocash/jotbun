#!/bin/bash
# The controller's whole picture in one call: integration head, open PRs (checks, GitHub's
# mergeable, and a local merge test against the head), task worktrees, the heavy lock,
# scratch folders written recently (live agents), and the machine's load.
# Usage: bash status.sh [minutes=30]
set -u
ROOT=/Users/kunanonjarat/Developer/jotbun
C=$ROOT/.claude/controller
REPO=mygogocash/jotbun
mins=${1:-30}
G() { /usr/bin/git -C "$ROOT" "$@"; }

G fetch -q origin 2>/dev/null || echo "(git fetch failed: gh auth?)"
H=origin/claude/p1a-vault-core
echo "head $(G rev-parse --short $H)  $(G log -1 --format='%cr: %s' $H | cut -c1-90)"

echo "== open PRs into claude/p1a-vault-core"
gh pr list --repo $REPO --base claude/p1a-vault-core --state open \
  --json number,headRefOid,headRefName,mergeable,statusCheckRollup \
  --jq '.[] | [.number, .headRefOid, .headRefName, .mergeable, ([.statusCheckRollup[] | (.conclusion // .status)] | join(" "))] | @tsv' 2>/dev/null |
while IFS=$'\t' read -r n sha br mg checks; do
  if G merge-tree --write-tree --name-only "$sha" $H >/dev/null 2>&1; then lm=clean; else lm=CONFLICT; fi
  sum=$(printf '%s\n' $checks | sort | uniq -c | awk '{printf "%s%s:%s", (NR>1?" ":""), $2, $1}')
  printf '#%s %s %-34s github:%s local-merge:%s checks[%s]\n' "$n" "${sha:0:7}" "$br" "$mg" "$lm" "${sum:-none}"
done

echo "== task worktrees"
G worktree list --porcelain | awk '/^worktree /{w=$2} /^branch /{sub("refs/heads/","",$2); print w"\t"$2}' |
while IFS=$'\t' read -r w b; do
  case "$w" in */.claude/worktrees/*) ;; *) continue;; esac
  t=$(/usr/bin/git -C "$w" status --porcelain --untracked-files=no | wc -l | tr -d ' ')
  u=$(/usr/bin/git -C "$w" status --porcelain | grep -c '^??')
  printf '%-28s %-36s %s tracked-changes:%s untracked:%s\n' "${w##*/}" "$b" "$(/usr/bin/git -C "$w" rev-parse --short HEAD)" "$t" "$u"
done

L=/private/tmp/claude-501/jotbun-heavy.lock
if [ -d $L ]; then echo "== heavy lock HELD for $(( ($(date +%s) - $(stat -f %m $L)) / 60 )) min"; else echo "== heavy lock free"; fi

echo "== scratch folders written in the last $mins min"
now=$(date +%s)
for d in "$C"/scratch/*/; do
  n=$(ls -t "$d" 2>/dev/null | head -1); [ -n "$n" ] || continue
  m=$(stat -f %m "$d$n"); age=$(( (now - m) / 60 ))
  [ $age -le "$mins" ] && printf '  %-28s %3s min ago  (%s)\n' "$(basename "$d")" "$age" "$n"
done
echo "load $(uptime | sed 's/.*load averages*: //')"
