#!/bin/bash
# Fetch the log of every failed CI job on a PR's current head, strip ANSI, save it, and print the failure lines.
# Usage: ci_failures.sh <pr-number>
# Logs land in /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/ci/<pr>-<job>.log
# Note: a job's log is only available once its whole run has finished.
set -u
pr=$1
repo=mygogocash/jotbun
out=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/ci
mkdir -p "$out"
gh pr checks "$pr" --repo "$repo" --json name,bucket,link --jq '.[] | "\(.bucket)\t\(.link)\t\(.name)"' |
while IFS=$'\t' read -r bucket link name; do
  echo "== $name: $bucket"
  [ "$bucket" = fail ] || continue
  job=${link##*/}
  log="$out/$pr-$job.log"
  if ! gh api --allow-escape-sequences "repos/$repo/actions/jobs/$job/logs" 2>/dev/null | sed 's/\x1b\[[0-9;]*m//g' > "$log" || [ ! -s "$log" ]; then
    echo "   log not available yet (the run may still be in progress)"; continue
  fi
  echo "   log: $log"
  gh api "repos/$repo/actions/jobs/$job" --jq '.steps[] | select(.conclusion=="failure") | "   failed step: \(.name)"'
  grep -nE ' FAIL | × |✕|●.*›|Test Files .*failed|Tests .*failed|AssertionError|Error: Test timed out|Expected: |Received: |##\[error\]' "$log" | grep -v '##\[error\]Process completed' | head -40 | cut -c1-260
done
