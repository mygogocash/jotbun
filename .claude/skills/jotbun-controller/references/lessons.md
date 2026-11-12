# Lessons that save time (Jotbun build, Nov 2026)

## Keep agents from redoing work

- **Only two suites open every catalogue section.** `CatalogueScreen.render.test.tsx` and `screenReader.render.test.tsx` go through every section; the large-text suite opens six named sections. A brief that says "the large-text suite picks up the new sections" is wrong (P2-T13's review n5), so a new section's AX5 look is an E2 capture by hand. Tell planners when a task adds sections.
- **Check overlap before every dispatch.** Run `git diff --stat <brief base> origin/claude/p1a-vault-core -- <the task's files>`.
  - Empty: dispatch, and tell the implementer the head moved but none of its files did, so every count stands.
  - Not empty: send the brief back to its planner (SendMessage resumes it with full context) to rebase its proof and counts. Dispatching anyway makes Haiku either undo the other task's lines or stop on a wrong "Expected" count. Example: 1B-T5 after 1D-T10 changed 5 of its 13 shared files.
- **Plan the next task on top of an unmerged one.** When two tasks share hot files (vault routes, `user-vault.ts`, `protocol.ts`, `package.json`, the lockfile, `_layout.tsx`), plan the second on top of the first's `real/` files or patch. Its brief says "starts only after <first> merges" and checks for that in Step 0. This avoids a second proof round. Examples: P2-T2 before 1D-T6 (lockfile); 1B-T5 before 1B-T6 (vault shared files).
- **Lockfile changes are serialised.** Never run two tasks that change `package-lock.json` in parallel. Regenerate a lockfile on top of the other task's lockfile; never hand-merge one.
- **Give implementers the planner's verified files.** These are `real/`, `stubs/`, `orig/` or `base/`, `diffs/` and `SHA256SUMS` under `scratch/<id>-planner/`. Haiku then copies and verifies instead of re-deriving, and the review checks the committed files are byte-identical to the planner's.
- **Resume, don't respawn.** A finished planner or reviewer keeps its context. Use SendMessage to ask it for a rebase, a follow-up brief, or a ruling-driven change. A reviewer that found test gaps is the cheapest writer of the follow-up brief.
- **Fix small doc errors yourself.** A stale receipt line found at review can be fixed by the controller in a one-line commit before merge, or in a housekeeping commit to the integration branch after merge. A housekeeping commit doesn't restart CI.
- **An MCP error from `t3_thread_send` does not prove the message was not delivered.** On 10 Nov the call returned "rejected the Authorization header", yet thread 351b244a received the note. It committed and pushed 99ce506 to #392's branch while another planner briefed the same round.
  - Before re-dispatching work whose send errored, check the thread (`t3_thread_read`) or the worktree and branch.
  - And a planner thread can act beyond its role (this one ran with the trailer `Co-Authored-By: Cursor`). Check PR branch heads against the handover before every fix round and merge.
- **T3 completion notices can go missing.** On 10 Nov the P2-T12 and 1B-T12 planners finished (READY) and no notice reached the controller. A `t3_thread_send` that answers `delivery: started`, not `steered`, means the child's last run had already ended. Read its final message with `t3_thread_read` (a high `afterPosition` near `itemCount`), and check the other children's `recentRuns` the same way.
- **Under `wrangler dev`, an empty upload never creates an import row.** A probe that needs a refused upload must send bytes the intake reads and refuses, such as a CSV whose bytes are a PNG header (1B-T12's planner).
- **`npm run test:edge` needs the heavy lock too.** Its default config excludes `test/workers/**`, but `r2-object-store.test.ts` starts Miniflare (workerd). Agents read "workers runs only" and ran it unlocked (alarm-hardening's implementer; 1B-T12's first-round planner). Say so in every edge task's notes.
- **`ready_tasks.py` can show an owner-gated task as ready.** `backlog.py`'s `OWNER_WAIT` (`scripts/backlog/backlog.py:62`) matches "owner's approval" but not "owner's E2 approval".
  - 1C-T9 (p1c :1052) and a P6C task (p6c :812, Steps 2 to 7) slip through.
  - Before dispatching a planner, read its task's "Starts after:" line for an owner gate, and put such a task in `held.txt`.
  - 1C-T9's planner caught this on 10 Nov and reported BLOCKED.
- **A fix round's kit is based on the PR branch, not the integration head.** `check_kit.sh` compares `orig/` and the diffs with `origin/claude/p1a-vault-core`, so on a fix kit it reports every file as differing. Check a fix kit instead with its own `SHA256SUMS` from the kit folder, and its `SHA256SUMS.base` from the PR's worktree at the reviewed head (tray-hardening's fix round, 10 Nov).
- **`git apply` inside `scratch/` can silently do nothing.** `scratch/` sits inside the main checkout's working tree. A `git apply` run from a kit folder takes the patch's paths as the main checkout's, skips them as outside the current folder, and exits 0 with nothing changed. Set `GIT_CEILING_DIRECTORIES` to the kit folder (or apply with `patch -p1`), and check the result against the kit's sums. The tray-hardening planner found this on 10 Nov.

## CI and flakes

- **R100: let CI run the whole suites.** Before 9 Nov, each task ran the full render, workers and export suites four times: planner, implementer, reviewer and CI. That repetition burned most of the tokens (three usage-limit cutoffs in one day), caused every load flake, and produced the count-drift stops. CI was green first time on all 15 task PRs that day.
  - Local work is now the fast gate: typecheck, focused RED and GREEN, mutants, and the fast suites.
  - Reviewers read CI.
  - No whole-suite totals in briefs.

- **Counts drift when the base moves.** A merge that adds test files moves suite totals. A merge that adds modules re-exported from a package the app imports moves export module counts. For example, #351's three contract modules made `export:web` 4772 instead of the brief's 4769. Before dispatching on a newer head, tell the implementer which totals will shift and by how much. Check every merge since the brief's base for new test files in the suites the gate runs. A full render suite counts every `*.render.test.tsx`, even a task in another lane's. Never write "every count stands" without checking. When an implementer stops on a count, diff the brief's base against its head for the files that feed that count before re-planning.

- **Metro's printed module count on a warm cache.** A web export that ends in well under a second can print a short count, such as 4604 for 4788, while its bundles are byte-identical. Seen on P2-T10's gate, 9 Nov. Rule it a flake when a re-run prints the expected count and the bundle hashes match. Briefs that need an exact count can pass `--clear`.
- **R-B flake.** `attachments.integration.spec.ts` "two records retaining one image at once keep one receipt, made by one copy" (expected 1 write, got 2) is a known race in frozen `apps/api` (migration 0017's two-statement check; owner decision R-B pending). Rerun the failed job once: `gh run rerun <run> --failed`.
- **The retry_after edge.** The same file's case "copying is bounded › serializes reservations: five at once from one account reserve exactly four" can fail `expect(limited.retry_after).toBeLessThanOrEqual(180)` with 181. It was seen on #396's SQL job, 11 Nov, run 42992817954, and passed on a rerun. It is frozen `apps/api`, so rule it a flake for any PR that does not touch `apps/api`, and rerun the failed job once.
- **Claude Code's 5-hour limit stops everything on it, the controller included (12 Nov, 01:15 to 03:10).**
  - **What happened:** with about six Opus xhigh agents running at once plus the controller, the window ran out about three hours after it started.
  - Every Claude Code thread paused with "Claude usage limit reached ... resets 3:10am", and the controller's own session ended.
  - At the reset, T3 resumed every paused thread at once. That included threads that had already finished (a confirming review whose PR had merged, a DONE builder), and those reruns spend the new window on nothing.
  - **On waking:**
    1. List the threads.
    2. Stop each resumed thread that has no work left, with `t3_thread_interrupt` and `stop: true`.
    3. Check CI and merge whatever went green while you were down.
  - **Routing when the Opus budget is the limit:**
    - Keep Opus for first reviews, confirming reviews and the money and privacy planners.
    - Plan UI tasks on Gemini 3.8 Flash, with the checklist in `scratch/dispatch/flash-ui-planner-checklist-20261112.md`, then give each brief an Opus brief review before any build. That costs less Opus than an Opus plan, and catches the gaps the 11 Nov Flash UI plans had.
    - Builders go to Flash or Haiku, and second reviews to Flash.
- **Candidate flake, the shared write budget (12 Nov).** `shared-rate-limit.integration.spec.ts`, "two API replicas share one write budget per binding" (Expected false, Received true).
  - It failed on #408's SQL job (run 43043193178, head `31c5c5ed`, 14:59 UTC), while the Mac was under heavy load.
  - That head changes nothing in `apps/api` over its base, so the controller reran it once.
  - The rerun passed: 9 of 9 at `31c5c5ed` (checked 12 Nov, 06:30).
  - If it fails again on a head that doesn't touch the rate limiter, record it as a known flake beside R-B.
- **Candidate flake, hermesc SIGSEGV in the iOS export (12 Nov).** "Exports (web and iOS bundles)" failed on #416 at `f6a2b681`: `hermesc -emit-binary ... exited with signal: SIGSEGV` (run 43094481395, 03:37 Bangkok, Mac under thermal load).
  - The same job had passed at `4eb15b3e`, and the only change between them was the catalogue's `index.ts`. One `gh run rerun --failed` (`C/rerun_then_wait.sh`) passed.
  - If it happens again on a head whose bundle input is unchanged, record it as a known flake (memory pressure in the Colima VM, which runs two runners and dind).
- **Routes tests load the real wallet screens (12 Nov, #412 and #411).** `app/spend/deleted.tsx` and `app/spend/recap/[month].tsx` import `WalletDeletedScreen` and `WalletRecapScreen` directly. Once a fix round gave those screens an import that cannot load in vitest (`react-native-safe-area-context`, the router's internals), `SpendRoutes` and `InsightsRoutes` failed to load ("SyntaxError: Unexpected token 'typeof'"), and R100's fast gate never ran them.
  - #412 went red in CI; the controller caught #411 before the push by running all four routes tests.
  - The fix is a stub for the screen, the way the file stubs its other screens (the routes tests check only the routes' rules).
  - make_prompt's RULES now put the four routes tests in the fast gate whenever a screen a route imports changes. In zsh, name each file: an unquoted `$VAR` holding several paths is not split, and vitest then runs none of them.
- **The Mac sleeps after one minute idle, which takes the local CI and the agents down (11 to 12 Nov, 23:08 to 00:31).**
  - **Signs:**
    - both runners are `offline` on GitHub while their containers say `Up`;
    - jobs end `Canceled` or `Abandoned`, and a failed job's log says "The operation was canceled";
    - Antigravity turns fail with "sent nothing for 15 minutes".
  - **Check:** `pmset -g log | grep -E 'Entering Sleep|DarkWake' | tail`.
  - **Fix:**
    1. Hold the machine awake with `nohup caffeinate -i -s -t 28800 &`, and write its pid to `scratch/caffeinate.pid`. It works on AC power only, and the display still sleeps.
    2. Recreate a hung runner: `docker rm -f jotbun-runner-N jotbun-runner-N-dind`, then `runners.sh up 2`.
    3. Rerun the lost jobs with `rerun_then_wait.sh <pr> <run>`.
    4. Send each failed agent thread "resume".
  - **Caution:** don't treat a cancel caused by sleep as a test failure.
- **Gemini 3.8 Flash plans well-specified logic, not UI screens (11 Nov evidence).**
  - P3-T4 (an edge transport, plan-exact) passed both reviews clean.
  - The two UI screens' Flash plans went to their Opus first reviews with real gaps: P2-T25 with 2 majors (a private-mode leak, a call added on a false premise), P2-T32 with 8 (reduced motion, share failure, an off switch, mock catalogue sections, an early-stopping reader, the wallet kit and dark-mode contrast, English copy, tests off the plan's list).
  - Flash *builds* copied their kits faithfully every time; the gaps came from the plans.
  - **Rule:** plan UI-heavy tasks with Opus (`--claude-code`). When a Flash plan exists for a UI task, have an Opus brief review check it against the plan's test list, the boards and the wallet kit before any build.
- **A Flash brief's prose can drift from its own kit; the kit's `real/` is the truth** (P3-T4's review, n6, 11 Nov).
  - Its "Interfaces" block described another API (an object-shaped `CallFailure`, `AiTrace.record()`), while `real/` and the commit followed the plan.
  - Its opening named Sonnet as the implementer.
  - When checking a Flash plan, compare the brief's interface claims with `real/`. Builders copy `real/`, so a stale prose block only misleads a reviewer.
- **Check that the planner proved its brief's own RED steps, typecheck included.**
  - On 11 Nov, P3-T4's Flash planner ran RED with `vitest` only, in a tree that had the old `env.ts`. The brief's Step 1.3 ("typecheck rc 0" at RED) was never run, and the builder stopped BLOCKED: the stub needed `env.ts`'s new type.
  - Before accepting a plan, check its `run-red.sh` (or proof script) against the brief's RED steps: the same files copied, and every command with an Expected line actually run.
  - A RED timeout (`Test timed out in 5000ms`) is not an assertion. Rule it by case name, or ask for fake timers.
- **Check a plan's RED failure types before accepting it, from any planner.**
  - The command: `grep -c -E 'TestingLibraryElementError|TypeError|Cannot find|Not implemented' <kit>/logs/*red*.log`, which must be 0, with every failure an `AssertionError`.
  - On 11 Nov, a Gemini 3.8 Flash planner's P2-T25 RED was 7 lookup errors out of 8. It went back to its planner with P14(d)'s rule ("every lookup asserts: named, found, shown"), and the Flash notes now state the rule.
  - Flash plans also run thin on mutants (8 or 9 where Opus wrote 28 to 121). Ask for one mutant per guard.
- **`check_kit.sh` once gave a wrong rebased copy (fixed 11 Nov).**
  - What happened: its `patch` used the default fuzz of 2. P2-T12 had added a line inside the context of P2-T14's `index.ts` hunk, so patch put the add spread before the tray's instead of after it, and still said it applied cleanly. The implementer's brief-mandated `git apply --3way` disagreed, and it stopped (BLOCKED), as the notes asked.
  - The fix: the script now patches with `-F0`. When the context has moved, it falls back to a 3-way `git merge-file` of the head (ours) and the kit's `real/` file (theirs) over the kit's base. That is what `git apply --3way` does.
  - Still read any rebased copy before quoting its sha256 in notes. Compare it with the planner's own merge proofs (`logs/merge/`, `merge/`) when they exist.
- **Fixed in the script on 11 Nov:** `sync_state.sh` now leaves `*/merge/*conflict*` out of its `diff --check`, after P2-T25's kit hit the same wall. Older note:
- **A kit with a conflict-demo file stops `sync_state.sh`.** P2-T33's `merge/index.t33-t14-conflict.ts` holds conflict markers on purpose, so the script's `git diff --cached --check` fails after staging and leaves the integration worktree staged. Check that the demo file is the only failure (`git diff --cached --check | cut -d: -f1 | sort -u`), then commit and push by hand with the script's message. Done once on 11 Nov (`43f438f0`); later syncs don't restage it.
- **After a reboot, the local runners crash-loop.** `colima start` restarts the runner containers, but their registration token has expired: the logs show `404` from `runner-registration`, and GitHub shows both runners offline. Run `runners.sh down`, then `runners.sh up`; the image registers with `--replace`, so the old names are reused. Starting Colima also restarts other containers that have restart policies, such as Supabase's `tbh-local`.
- **Render timeouts under load.** Load from several agents running app suites makes render tests time out at 5 s (for example `HistoryReturn` at 14.7 s). Rule it a load flake when the failing file doesn't import the task's files: rerun the file alone, then the full suite once. Briefs should tell implementers to do this before reporting BLOCKED. `HistoryReturn.render.test.tsx` is the usual one (P2-T19 and P2-T2 both hit it on 8 Nov). Running more than about three agents with app suites at once pushes the load average past 40 and makes this happen.
- **`watch_prs.sh` records `<pr>:<head>` in `watch_prs.seen`.** A rerun on the same head is never reported again, so after `gh run rerun`, wait with `C/wait_ci.sh <pr>` (background Bash) instead.
- **Logs only once the whole run has finished.** `gh run view --log-failed` refuses while any job of the run is still going. `ci_failures.sh` uses `gh api --allow-escape-sequences repos/.../actions/jobs/<id>/logs` and strips ANSI.
- **CI tests the merge with the base.** GitHub runs PR checks on `refs/pull/N/merge`, so a branch does not need re-merging locally after the integration head moves, unless there are conflicts. Check that with `git merge-tree --write-tree --name-only HEAD origin/claude/p1a-vault-core`.
- **But that merge ref can be stale.** GitHub rebuilds `refs/pull/N/merge` lazily.
  - On 10 Nov, closing and reopening #377 to retest it on a newer base ran on the old merge commit (`c56e0e4 Merge 46b30a0 into 4850463`), and the reopened run proved nothing new.
  - Read the PR through the API first: `gh api repos/mygogocash/jotbun/pulls/<n>`, and check that `merge_commit_sha` and `base.sha` are fresh. That read makes GitHub recompute them. Then close and reopen.
  - Before trusting the run, confirm the base in a job log: `HEAD is now at <sha> Merge <head> into <base>`.
  - The same applies to any PR whose old green run predates merges into its base.
  - **When even an API read leaves the ref stale** (#383 on 10 Nov: still `Merge 2f0e40e into d49ba4c` after P2-T11 merged), update the PR branch instead:
    - `gh api -X PUT repos/mygogocash/jotbun/pulls/<n>/update-branch -f expected_head_sha=<the reviewed full SHA>`. GitHub merges the base into the branch, which gives a new head and a fresh run on a true merge.
    - Then confirm that `git diff <reviewed> <new head> -- <the task's files>` is empty, and that the PR's diff against the base lists the same files with the same counts.
    - Merge with `merge_task_pr.sh <n> <new head>`. `expected_head_sha` refuses to act if the branch moved since the review.

## Parity and data

- **NestJS stores JSON in PostgreSQL `jsonb`, which reorders object keys.** They come out shortest first by UTF-8 bytes, then bytewise. The vault must serve such values through `jsonbOrder` (`apps/edge/src/vault/reads/sync.ts`, ruling R92) for byte-exact parity. This applies to the full-resync snapshot and import `issues` in 1B. Vitest's failure diff sorts keys, so a key-order failure prints two identical-looking objects. When the test compares `JSON.stringify`, suspect key order first.
- **Ids are lowercase UUIDs.** JS string order, SQLite text order and PostgreSQL uuid order agree for them.

## Takeover and sessions

- **After a machine move, GitHub is the state, not the local folder.** On 9 Nov a Super Engineering session read this machine's day-old `.claude/controller` (gh auth had failed), restarted three agents and redid merged work. Fetch first, read the handover from `origin/claude/p1a-vault-core`, and prove the old controller is dead by GitHub activity. Move a stale local folder aside, then `git archive` the committed state into place.
- **Measure, don't hand-adjust, totals after a moved base.** On 9 Nov the earlier controller's adjusted 1D-T6 totals were off by 2 (unit) and 1 (web, iOS). One baseline run at the head (unit, app, full render, web and iOS exports), plus each brief's delta, gave four agents exact Expected lines; none stopped on a count.
- **A kit can hold a nested git repository (P3-T2, 12 Nov).** The planner's `proof/applycheck/make` had its own `.git`, so `git add -f` committed it as a gitlink with no `.gitmodules`. The 13 files under it vanished from the kit, and a gitlink without `.gitmodules` can trip the checkout's submodule steps.
  - Its SHA256SUMS also covered 125 files inside the nested `.git` folders. Git never tracks those, so they can never verify elsewhere.
  - `sync_state.sh` now strips nested `.git` folders from kit copies. It and `check_kit.sh` skip `/.git/` lines when they verify.
  - Fixed on the integration branch by storing the tree as plain files.
- **Kits lose gitignored files in the commit.** `*.log` is ignored, so the 1B-T6 kit arrived without its 8 proof logs, and its SHA256SUMS failed on another machine. `sync_state.sh` now force-adds each kit it is given. For an older kit, check the sums with the log lines removed.
- **Prove a brief's grep checks on the real head.** 1B-T6's "no PostgreSQL code in the bundle" counted the word `node-postgres`, and #352 then added a doc comment that says it (R95). Check for driver markers (`pg-protocol`, `pg-pool`, `drizzle-orm/node-postgres`, ...), not prose words that comments can carry.
- **zsh's `status` is read-only.** An agent's `cmd; status=$?; rmdir <lock>` aborts before the rmdir and leaves the heavy lock held. Agents keep exit codes in `rc`; make_prompt's lock text says so.
- **Cancelling a dropped body does not release what it holds in workerd** (R96). The request ends before the cancel reaches a stream behind `FixedLengthStream`. Read the body to its end instead. Prove slot and stream fixes under `wrangler dev`: the vitest workers runtime keeps the request alive and hides the leak.
- **Orca's Agent tool has no `effort`.** Pass `model` only; effort comes from the session or from `.claude/agents/*.md` frontmatter, which loads at session start.

- **Is the old controller really dead?** Check whether its transcript and its `subagents/agent-*.jsonl` files are still being written; live agents write every few seconds. Do not go by `ps`: an app chat session does not show as `claude --session-id <its id>`, and other jotbun terminal sessions are unrelated.
- **`sc chat stop <thread_id>` only cancels the current turn.** Find a chat's thread id with `sc chat list --worktree <path> --json`.
- **Background agents die with their session.** Restart each from its saved prompt (`inflight_agents.py`) with the resume template, and record the takeover in `handover.md`.
- **A "waiting on its own background work" notice is not a finish.** The agent is still alive. Stop a planner that has delivered its brief but keeps an expired watch (`TaskStop`).
- **A killed mutant runner can leave its mutant in place.** Runners restore each file in a `finally` block, which a hard kill skips.
  - On 9 Nov the cutoff killed 1D-T8's runner at mutant P8, and `PrivacyScreen.tsx` kept the mutant.
  - Before resuming an agent that was mid-mutation, check the worktree against the kit (`cd <wt> && shasum -a 256 -c <kit>/SHA256SUMS.real`). Copy back from `real/` any file that differs.
  - A planner's proof tree heals itself when its run script copies `real/` over the tree first, as 1B-T8's `run-final.sh` does.
- **A failure on a usage limit is a cutoff, not a finish.** Its last notice is `failed` with "error type rate_limit, HTTP 429". `inflight_agents.py` now lists such agents; before the 9 Nov fix it missed the P4-T12 and P4-T13 planners.
- **A killed run can leave the heavy lock held.** Once `ps` shows no test process, `rmdir` it at takeover.
- **Claude Code's weekly limit stops every Claude thread for days (12 Nov, 03:24 until 14 Nov 03:00).** The notice reads "You've hit your weekly limit · resets <date>"; T3 marks each thread `failed` and snoozes it until the reset, and it will resume their paused turns then, as it did at the 5-hour reset.
  - Move nearly finished work to Antigravity with the resume template (one `<task>-resume-<date>.md` per agent: the assignment, `tail_transcript.py` on the old jsonl, its scratch kit, what it was doing).
  - `t3_thread_interrupt stop:true` on such a thread returns `no_active_run`, so archive the old thread (`t3_thread_organize archive`), and at the reset check that none resumed. A resumed duplicate would overwrite the new agent's brief.
  - Find an old agent's jsonl by grepping `~/.claude/projects/-Users-kunanonjarat-Developer-jotbun/*.jsonl` for a line from its last message.
  - Money and privacy PRs still wait for their Opus review (owner's 10 Nov routing); Gemini plans, builds and gives the first look meanwhile.
- **When agents look stalled, check for thermal sleep first.** On 10 Nov, from 03:11 to 06:05, the owner's Mac slept about 15 minutes in every 20 (`pmset -g log`: "Entering Sleep state due to 'Dark Wake Thermal Emergency'"), with the display off and five or six agents running.
  - Everything slowed down: a two-lens review took about 3 hours, and a six-minute whole-file render run never finished cleanly (R103).
  - `pmset -g log | grep -i thermal` shows it at once.
  - While it happens, run at most about four local agents, start no new heavy one, and tell the owner: open the lid and give it airflow, and keep Spotlight off `.claude/worktrees`.

## Merging

- **Merge commits only, at the reviewed head.** Use `--match-head-commit`, as `merge_task_pr.sh` does. Never squash.
- **Close issues by hand.** PRs into `claude/p1a-vault-core` (not the default branch) do not close their issues, so close each one after merge. The task-to-issue map is `docs/implementation/backlog-map.json` under `tasks`.
- **Approved with minors: merge first, follow up after.** Record the minors in `followups.md` under the task that should carry them, or open a small follow-up task. Example: the parser-regex test follow-up for six surviving mutants.
- **Never merge into `main`**: that is the owner's call. Never delete `claude/premium-ai-edge`: the main checkout has it checked out with another session's uncommitted work.
