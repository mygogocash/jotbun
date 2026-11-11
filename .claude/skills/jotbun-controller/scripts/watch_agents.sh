#!/bin/bash
# Wake the controller at the next agent event, so it never polls threads by hand (launched T3 threads don't wake it).
# Run it as background Bash, then t3_background_wait on its task id; it exits with one line saying what happened:
#   COMMIT <wt>: <sha subject>   a builder committed (its own commit, not a sync of the integration head): DONE
#   IDLE <wt>: N min since <log> its scratch logs went quiet for <idle-minutes>: possibly BLOCKED, read its thread
#   VERDICT <review>: <line>     a review file got its verdict line (template: last line `VERDICT: ...`)
#   FILE <path>                  a file exists, e.g. a planner's brief. A kit's SHA256SUMS can come before the brief (a
#                                Flash planner wrote it mid-run, 11 Nov), so check the planner's thread has finished first
#   CAP: N min                   nothing happened before <cap-minutes>; re-arm
# Usage: bash watch_agents.sh unused <idle-minutes> <cap-minutes> [<worktree>:<scratch-folder>] [verdict:<file>] [file:<path>] ...
#   e.g. bash watch_agents.sh unused 15 120 p2-t14:p2-t14 verdict:$C/reviews/P2-T14.md file:$C/scratch/p3-t4-planner/SHA256SUMS
# Re-arm it without the entry that fired. Planner and reviewer threads are single runs; builders end a run at every
# background job, so t3_thread_wait on a builder returns long before it is done (11 Nov).
set -u
base=$1; idle_max=$2; cap=$3; shift 3
W=/Users/kunanonjarat/Developer/jotbun/.claude/worktrees
S=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch
start=$(date +%s)
while :; do
  now=$(date +%s)
  for pair in "$@"; do
    # verdict:<review file>: fire once the reviewer has written its VERDICT line.
    # file:<path>: fire once the file exists (a planner's kit SHA256SUMS is written last, after its proofs).
    case "$pair" in file:*)
      f=${pair#file:}
      if [ -f "$f" ]; then echo "FILE $f"; exit 0; fi
      continue;;
    esac
    case "$pair" in verdict:*)
      f=${pair#verdict:}
      # The exact last line the template asks for, or the older "## Verdict" / "**Verdict:**" forms reviewers also use.
      if [ -f "$f" ] && grep -q -E '^VERDICT:|^## Verdict|^- \*\*Verdict:\*\*' "$f"; then echo "VERDICT $(basename "$f"): $(grep -E '^VERDICT:|^- \*\*Verdict:\*\*' "$f" | tail -1 | cut -c1-80)"; exit 0; fi
      continue;;
    esac
    wt=${pair%%:*}; sc=${pair##*:}
    # Only the builder's own commits: syncing the integration head (a fast-forward) adds none.
    n=$(/usr/bin/git -C "$W/$wt" rev-list --count "origin/claude/p1a-vault-core..HEAD" 2>/dev/null || echo 0)
    if [ "$n" -gt 0 ]; then echo "COMMIT $wt: $(/usr/bin/git -C "$W/$wt" log --oneline -1 | cat)"; exit 0; fi
    last=$(ls -t "$S/$sc" 2>/dev/null | head -1)
    [ -n "$last" ] || continue
    m=$(stat -f %m "$S/$sc/$last"); idle=$(( (now - m) / 60 ))
    if [ "$idle" -ge "$idle_max" ]; then echo "IDLE $wt: ${idle} min since $last"; exit 0; fi
  done
  if [ $(( (now - start) / 60 )) -ge "$cap" ]; then echo "CAP: ${cap} min, nothing to report"; exit 0; fi
  sleep 60
done
