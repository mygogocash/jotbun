# Lessons that save time (Jotbun build, Nov 2026)

## Keep agents from redoing work

- **Check overlap before every dispatch.** Run `git diff --stat <brief base> origin/claude/p1a-vault-core -- <the task's files>`.
  - Empty: dispatch, and tell the implementer the head moved but none of its files did, so every count stands.
  - Not empty: send the brief back to its planner (SendMessage resumes it with full context) to rebase its proof and counts. Dispatching anyway makes Haiku either undo the other task's lines or stop on a wrong "Expected" count. Example: 1B-T5 after 1D-T10 changed 5 of its 13 shared files.
- **Plan the next task on top of an unmerged one.** When two tasks share hot files (vault routes, `user-vault.ts`, `protocol.ts`, `package.json`, the lockfile, `_layout.tsx`), plan the second on top of the first's `real/` files or patch. Its brief says "starts only after <first> merges" and checks for that in Step 0. This avoids a second proof round. Examples: P2-T2 before 1D-T6 (lockfile); 1B-T5 before 1B-T6 (vault shared files).
- **Lockfile changes are serialised.** Never run two tasks that change `package-lock.json` in parallel. Regenerate a lockfile on top of the other task's lockfile; never hand-merge one.
- **Give implementers the planner's verified files.** These are `real/`, `stubs/`, `orig/` or `base/`, `diffs/` and `SHA256SUMS` under `scratch/<id>-planner/`. Haiku then copies and verifies instead of re-deriving, and the review checks the committed files are byte-identical to the planner's.
- **Resume, don't respawn.** A finished planner or reviewer keeps its context. Use SendMessage to ask it for a rebase, a follow-up brief, or a ruling-driven change. A reviewer that found test gaps is the cheapest writer of the follow-up brief.
- **Fix small doc errors yourself.** A stale receipt line found at review can be fixed by the controller in a one-line commit before merge, or in a housekeeping commit to the integration branch after merge. A housekeeping commit doesn't restart CI.

## CI and flakes

- **Counts drift when the base moves.** A merge that adds test files moves suite totals. A merge that adds modules re-exported from a package the app imports moves export module counts. For example, #351's three contract modules made `export:web` 4772 instead of the brief's 4769. Before dispatching on a newer head, tell the implementer which totals will shift and by how much. Check every merge since the brief's base for new test files in the suites the gate runs. A full render suite counts every `*.render.test.tsx`, even a task in another lane's. Never write "every count stands" without checking. When an implementer stops on a count, diff the brief's base against its head for the files that feed that count before re-planning.

- **R-B flake.** `attachments.integration.spec.ts` "two records retaining one image at once keep one receipt, made by one copy" (expected 1 write, got 2) is a known race in frozen `apps/api` (migration 0017's two-statement check; owner decision R-B pending). Rerun the failed job once: `gh run rerun <run> --failed`.
- **Render timeouts under load.** Load from several agents running app suites makes render tests time out at 5 s (for example `HistoryReturn` at 14.7 s). Rule it a load flake when the failing file doesn't import the task's files: rerun the file alone, then the full suite once. Briefs should tell implementers to do this before reporting BLOCKED. `HistoryReturn.render.test.tsx` is the usual one (P2-T19 and P2-T2 both hit it on 8 Nov). Running more than about three agents with app suites at once pushes the load average past 40 and makes this happen.
- **`watch_prs.sh` records `<pr>:<head>` in `watch_prs.seen`.** A rerun on the same head is never reported again, so after `gh run rerun`, wait with `C/wait_ci.sh <pr>` (background Bash) instead.
- **Logs only once the whole run has finished.** `gh run view --log-failed` refuses while any job of the run is still going. `ci_failures.sh` uses `gh api --allow-escape-sequences repos/.../actions/jobs/<id>/logs` and strips ANSI.
- **CI tests the merge with the base.** GitHub runs PR checks on `refs/pull/N/merge`, so a branch does not need re-merging locally after the integration head moves, unless there are conflicts. Check that with `git merge-tree --write-tree --name-only HEAD origin/claude/p1a-vault-core`.

## Parity and data

- **NestJS stores JSON in PostgreSQL `jsonb`, which reorders object keys.** They come out shortest first by UTF-8 bytes, then bytewise. The vault must serve such values through `jsonbOrder` (`apps/edge/src/vault/reads/sync.ts`, ruling R92) for byte-exact parity. This applies to the full-resync snapshot and import `issues` in 1B. Vitest's failure diff sorts keys, so a key-order failure prints two identical-looking objects. When the test compares `JSON.stringify`, suspect key order first.
- **Ids are lowercase UUIDs.** JS string order, SQLite text order and PostgreSQL uuid order agree for them.

## Takeover and sessions

- **After a machine move, GitHub is the state, not the local folder.** On 9 Nov a Super Engineering session read this machine's day-old `.claude/controller` (gh auth had failed), restarted three agents and redid merged work. Fetch first, read the handover from `origin/claude/p1a-vault-core`, and prove the old controller is dead by GitHub activity. Move a stale local folder aside, then `git archive` the committed state into place.
- **Measure, don't hand-adjust, totals after a moved base.** On 9 Nov the earlier controller's adjusted 1D-T6 totals were off by 2 (unit) and 1 (web, iOS). One baseline run at the head (unit, app, full render, web and iOS exports), plus each brief's delta, gave four agents exact Expected lines; none stopped on a count.
- **Kits lose gitignored files in the commit.** `*.log` is ignored, so the 1B-T6 kit arrived without its 8 proof logs, and its SHA256SUMS failed on another machine. `sync_state.sh` now force-adds each kit it is given. For an older kit, check the sums with the log lines removed.
- **Prove a brief's grep checks on the real head.** 1B-T6's "no PostgreSQL code in the bundle" counted the word `node-postgres`, and #352 then added a doc comment that says it (R95). Check for driver markers (`pg-protocol`, `pg-pool`, `drizzle-orm/node-postgres`, ...), not prose words that comments can carry.
- **Orca's Agent tool has no `effort`.** Pass `model` only; effort comes from the session or from `.claude/agents/*.md` frontmatter, which loads at session start.

- **Is the old controller really dead?** Check whether its transcript and its `subagents/agent-*.jsonl` files are still being written; live agents write every few seconds. Do not go by `ps`: an app chat session does not show as `claude --session-id <its id>`, and other jotbun terminal sessions are unrelated.
- **`sc chat stop <thread_id>` only cancels the current turn.** Find a chat's thread id with `sc chat list --worktree <path> --json`.
- **Background agents die with their session.** Restart each from its saved prompt (`inflight_agents.py`) with the resume template, and record the takeover in `handover.md`.
- **A "waiting on its own background work" notice is not a finish.** The agent is still alive. Stop a planner that has delivered its brief but keeps an expired watch (`TaskStop`).

## Merging

- **Merge commits only, at the reviewed head.** Use `--match-head-commit`, as `merge_task_pr.sh` does. Never squash.
- **Close issues by hand.** PRs into `claude/p1a-vault-core` (not the default branch) do not close their issues, so close each one after merge. The task-to-issue map is `docs/implementation/backlog-map.json` under `tasks`.
- **Approved with minors: merge first, follow up after.** Record the minors in `followups.md` under the task that should carry them, or open a small follow-up task. Example: the parser-regex test follow-up for six surviving mutants.
- **Never merge into `main`**: that is the owner's call. Never delete `claude/premium-ai-edge`: the main checkout has it checked out with another session's uncommitted work.
