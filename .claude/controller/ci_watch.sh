#!/bin/bash
# Wake the controller when any of the given PRs finishes its CI run: all checks completed, pass or fail.
# Reports each PR's head once (state kept in scratch/ci_watch.seen), so re-arming after an event does not
# fire again for the same head. Exits after the first new report, or after <cap-minutes>.
# Usage: ci_watch.sh <cap-minutes> <pr> [<pr> ...]
set -u
cap=$1; shift
C=/Users/kunanonjarat/Developer/jotbun/.claude/controller
seen=$C/scratch/ci_watch.seen
touch "$seen"
start=$(date +%s)
while :; do
  for pr in "$@"; do
    out=$(timeout 60 gh pr view "$pr" --repo mygogocash/jotbun --json headRefOid,statusCheckRollup \
      --jq '"\(.headRefOid[0:8]) \([.statusCheckRollup[] | select(.status != "COMPLETED")] | length) \([.statusCheckRollup[]] | length) \([.statusCheckRollup[] | select((.conclusion // "") | test("FAILURE|CANCELLED|TIMED_OUT|STARTUP_FAILURE"))] | length)"' 2>/dev/null) || continue
    read -r head pending total bad <<<"$out"
    [ -n "${head:-}" ] && [ "${total:-0}" -gt 0 ] && [ "$pending" = 0 ] || continue
    grep -qx "$pr $head" "$seen" && continue
    echo "$pr $head" >> "$seen"
    echo "CI #$pr at $head: $((total - bad)) of $total passed, $bad failed or cancelled"
    exit 0
  done
  if [ $(( ($(date +%s) - start) / 60 )) -ge "$cap" ]; then echo "CAP: ${cap} min, no CI finished"; exit 0; fi
  sleep 60
done
