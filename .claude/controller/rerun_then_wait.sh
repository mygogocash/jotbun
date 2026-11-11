#!/bin/bash
# Wait for a PR's checks to finish; if any failed or were cancelled, rerun that run's failed jobs once, then wait again
# and print each check's result. For jobs lost to a known cause (a runner going offline, a known flake), never for a real
# test failure: read ci_failures.sh first.
# Usage: rerun_then_wait.sh <pr> <run-id>
set -u
pr=$1 run=$2
C=/Users/kunanonjarat/Developer/jotbun/.claude/controller
bash "$C/wait_ci.sh" "$pr" >/dev/null
bad=$(gh pr view "$pr" --repo mygogocash/jotbun --json statusCheckRollup --jq '[.statusCheckRollup[] | select((.conclusion // "") | test("FAILURE|CANCELLED|TIMED_OUT|STARTUP_FAILURE"))] | length')
if [ "${bad:-0}" -gt 0 ]; then
  echo "rerunning $bad failed or cancelled job(s) of run $run"
  gh run rerun "$run" --failed --repo mygogocash/jotbun
  sleep 30
  bash "$C/wait_ci.sh" "$pr"
else
  gh pr view "$pr" --repo mygogocash/jotbun --json number,mergeable,statusCheckRollup --jq '"#\(.number) \(.mergeable)", (.statusCheckRollup[] | "\(.name): \(.conclusion // .status)")'
fi
