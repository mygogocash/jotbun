---
name: jotbun-controller
description: Run, continue or take over the Jotbun v1 build controller. Use it to pick the next ready tasks, brief them with Opus planners, build them with Haiku implementers, review them, open and merge task PRs into claude/p1a-vault-core, triage red CI, and recover after a controller session dies. Triggers: "continue the build", "keep going, merge as they pass", "take over the controller", "resume the subagent controller", "what's ready next", a screenshot of a controller tab, or any PR into claude/p1a-vault-core.
---

# Jotbun build controller

One session (the controller) runs the build. It dispatches agents, one worktree per task, and merges their PRs when CI is green and an independent review approves.

- **Planners, and first reviews of M and L tasks:** Opus, effort xhigh.
- **Confirming reviews, and reviews of S tasks:** Sonnet. This is the owner's change of 9 Nov, to speed up; `make_prompt.py --size S` picks it.
- **Implementers and fixers:** Haiku, effort max.
- **Every Agent call** sets `model` and `effort` explicitly. Orca's Agent tool has no `effort`, so there pass `model` only; agents then run at the session's effort.

The owner has authorised this to keep moving without pausing between tasks:
- push task branches;
- open PRs into `claude/p1a-vault-core`;
- merge them on green CI;
- close their issues;
- remove their worktrees and branches.

Merging anything into `main` stays the owner's call.

## State to read first (all durable, under `C = /Users/kunanonjarat/Developer/jotbun/.claude/controller`)

- `C/handover.md`: integration head, open PRs, agents in flight (with ids), held tasks, rulings this session (R83 onward), owner decisions waiting. **Keep it current after every dispatch and merge**; it is how the next controller recovers.
- `C/followups.md`: notes from approved reviews, keyed by the task that must carry them. Grep it for a task id before writing that task's planner prompt.
- `C/protocol.md`: the binding rules every agent reads first.
- `C/briefs/`, `C/reviews/`, `C/scratch/<task>/`: agent outputs. Never keep anything under `/private/tmp`; macOS clears it. The only exception is the heavy lock, `/private/tmp/claude-501/jotbun-heavy.lock`.
- `C/held.txt`: tasks held for an owner answer that GitHub does not label.

## On a new machine

The skill and `C/` are committed in the repo; the scratch proof trees are not, apart from the one a ready brief needs. Scripts and briefs use absolute paths under `/Users/kunanonjarat/Developer/jotbun`. If the clone lives elsewhere, run `grep -rl /Users/kunanonjarat/Developer/jotbun .claude/` and fix the paths. The main checkout must have the integration branch, or this commit's files, for `.claude/controller` to exist. Then read `C/handover.md`, starting with its migration section.

## Speed rules (owner's ask, 9 Nov: "find the way to speed up development")

- **R100: CI is the gate for whole suites.** Agents run only the fast local gate in `protocol.md`. No briefs, prompts or receipts carry whole-suite totals any more, so there is no count drift and no load flake from full runs. Read CI before merging.
- **Lighter fix rounds.** A fix that applies the first reviewer's own verified patch or probes byte for byte (checked against that kit's SHA256SUMS) is merged on green CI without a confirming review. A fix that writes new logic still gets one.
- **Concurrency.** R100 cuts each agent's tokens a lot, so run up to about 6 agents at once, across lanes that share no hot file.

## Fast paths (use these instead of hand-written checks and prompts)

- **Where things stand:** `bash scripts/status.sh [minutes]` shows, in one call:
  - the head;
  - each open PR's checks, GitHub's mergeable state and a local merge test;
  - the worktrees and their changes;
  - the heavy lock;
  - recently written scratch folders (live agents);
  - the load.
- **Does a brief's base hold:** `bash scripts/check_kit.sh <kit> [--rebase-out <dir>]`. It checks the kit's sums (skipping lost `*.log` lines), its `SHA256SUMS.base`, and its `orig/` or `base/` files at the head. It dry-runs per-file diffs for the files that changed. `--rebase-out` writes patched copies, with SHA256SUMS, for the implementer to copy.
- **Whole-suite counts:** rarely needed under R100. When a question needs them, `bash scripts/baseline.sh <worktree> app|edge|all [--exports]` measures them; never hand-adjust.
- **Dispatch:** `python3 -I scripts/make_prompt.py <implementer|fixer|reviewer|confirm|planner> <TASK> --wt --branch --head [--accepted] [--pr --sha] [--lock] [--installed] [--notes <file>]`.
  - It writes the assignment file from the role templates and prints a one-line Agent prompt and its model.
  - Write only the task's own notes (what moved, totals, rulings, review focus) in `--notes`.

## After a usage-limit cutoff (agents fail with HTTP 429)

Their work is saved, but their background jobs and Monitors die.
1. Run `status.sh` to check that the heavy lock is free, and kill any orphaned test processes.
2. Send each agent `SendMessage` with "resume", what moved on the head since, and "rerun any check you did not see finish". This continues it with its context; a new Agent would start from nothing.
3. Re-arm the `watch_prs.sh` Monitor.

## The loop

1. **What's next:** `python3 -I scripts/ready_tasks.py --inflight <ids briefed, building or in review>` (comma-separated). Start critical-path (deepest) tasks first, one per lane per shared hot file. Use `--files` to see overlap.
2. **Brief:** Opus planner, with the template in `references/prompts.md`. Include the followups for that task, the in-flight work it shares files with, and, if it shares hot files with an unmerged task, "build on top of <X>'s real/ files and start only after <X> merges".
3. **Before dispatching an implementer:** check that the brief's base still holds with `bash scripts/check_kit.sh <kit>` (or `git -C <integration worktree> diff --stat <brief base> origin/claude/p1a-vault-core -- <task files>`).
   - If any of the task's files changed, send the brief back to its planner to rebase.
   - Then accept or rule on its planner calls (P1, P2, ...).
   - Create the worktree with `scripts/new_task_worktree.sh <wt> <branch>`, using the names from the brief's WT line.
   - Dispatch the implementer.
4. **Implementer DONE:** write `C/pr-<id>.md` in the house style: Summary bullets, Test plan checklist, "Closes #N once merged (closed by hand ...)", and the Claude Code footer. Then run `scripts/open_task_pr.sh <worktree> "<title>" C/pr-<id>.md` and dispatch the Opus reviewer.
5. **Implementer BLOCKED:** read the exact blocker. For a known flake (`references/lessons.md`), rule it and SendMessage the same agent to continue. For a real question the plan cannot answer, ask the owner. If a task fails review three fix rounds running, tell the owner and suggest escalating it.
6. **Review "Needs fixes":** write the fix brief (model: `C/briefs/1A-T9-fix.md`), give it a ruling number when it changes behaviour, dispatch Haiku, push, update the PR body, then run a confirming Opus review.
7. **Merge** when CI is green on the reviewed head and the review approves: `scripts/merge_task_pr.sh <pr> <reviewed-sha> [task-id]`.
   - Record the review's minors in `followups.md`.
   - If the receipt has stale lines, fix them in a housekeeping commit on the integration branch.
   - Then open the task's small PR into main with `bash scripts/promote_pr.sh <task-id> <pr>`. This is the owner's ask of 9 Nov: one reviewable PR per task, merged by the owner in order. Never merge into main yourself.
   - It stacks the PR (GitHub stacked PRs, `gh stack link`) on the newest open promotion PR, so each diff shows one task. The owner merges bottom-up, or up to any PR at once with `gh stack merge <pr>`.
8. **Keep GitHub current.** After each merge or dispatch, update `handover.md`. Then run `scripts/sync_state.sh "Sync the controller state" <kits of ready, unbuilt briefs>`. It pushes the live state to the integration branch, so a move to another machine or a dead session loses nothing.
9. **CI watching:**
   - Keep a Monitor running on `C/watch_prs.sh`; it re-arms every 30 minutes.
   - After a `gh run rerun <run> --failed`, wait with `C/wait_ci.sh <pr>` in background Bash instead.
   - On red CI, run `scripts/ci_failures.sh <pr>` to get the failing step and test lines.

## Taking over from a dead controller

1. **Prove it is dead.** Its transcript and `subagents/*.jsonl` files have stopped being written. Do not go by `ps`. If it is alive, ask the owner before acting: two controllers will collide in the same worktrees.
2. **List what it had running:** `python3 -I scripts/inflight_agents.py <its session .jsonl>`. This saves each unfinished agent's prompt to `C/scratch/takeover/`.
3. **Kill leftovers.** Kill its orphaned `watch_prs.sh` and stray test processes, and check the heavy lock.
4. **Restart each agent** with the "Resuming a cut-off agent" template, pointing at the saved prompt, the old transcript (`scripts/tail_transcript.py`) and its scratch folder. Add what changed since: merges, CI results, rulings.
5. **Record the takeover** in `handover.md`.

## References

- `references/prompts.md`: planner, implementer, reviewer, fix-round and resume templates.
- `references/lessons.md`: what saved or cost time: rebase-before-dispatch, planning on top of unmerged work, lockfile serialisation, the known flakes, jsonb key order (R92), merge and issue rules, session pitfalls.
- `scripts/`:
  - `status.sh`, `check_kit.sh`, `baseline.sh` and `make_prompt.py` (the fast paths above)
  - `promote_pr.sh` (one PR into main per merged task)
  - `ready_tasks.py`
  - `new_task_worktree.sh`
  - `open_task_pr.sh`
  - `merge_task_pr.sh`
  - `sync_state.sh`
  - `ci_failures.sh`
  - `inflight_agents.py`
  - `tail_transcript.py`
- Also in `C/`:
  - `wait_ci.sh`
  - `watch_prs.sh`
  - `ledger_union.py`, for old-style `premium-progress.md` conflicts; new receipts go in `docs/implementation/receipts/<id>.md` under R87.
