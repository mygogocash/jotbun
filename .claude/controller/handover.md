# Controller handover (9 Nov 2026, 22:15 Bangkok)

Durable folder: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/` (protocol.md, briefs/, reviews/, scratch/, followups.md, ledger_union.py, wait_ci.sh, watch_prs.sh, backlog/). Never use /private/tmp for anything kept; macOS cleared it once (late Oct). Only the heavy lock lives there: `/private/tmp/claude-501/jotbun-heavy.lock`.

Integration branch `claude/p1a-vault-core` (worktree `.claude/worktrees/p1a-vault-core`), head 0bd5659 (controller state after 1D-T8's dispatch). Nothing outside `.claude/` changed since 606e131. No PR is open into the integration branch; only #70 into main.

## Fixers dispatched, 11 Nov 08:15 Bangkok (Cursor Auto controlling; owner: "continue")

- **#396 fix-download-aborts:** the fixer runs on Antigravity `claude-sonnet-5-5-high`, T3 task `fix-download-aborts-fixer-20261111a`, in WT fix-download-aborts. Its assignment is `scratch/dispatch/fix-download-aborts-fixer.prompt.md`, with notes on the moved head.
- **#395 P2-T12:** the fixer runs on Antigravity `claude-sonnet-5-5-high`, T3 task `p2-t12-fixer-20261111a`, in WT p2-t12. Its assignment is `scratch/dispatch/P2-T12-fixer.prompt.md`.
- Both merge the head first (dry merges were clean). Totals may differ from the briefs; their own files' Expected lines must hold.
- **Do not dispatch these again.** After DONE: push, update the PR body, and run an Opus-High confirming review (#395's fix writes new logic, so it gets one; #396's is test-only from its planner's kit). Then merge on green local CI and promote (owner: "if CI pass merge it"; the merge script cleans up the worktree and branches).

## Routing moved to Antigravity, 11 Nov 07:50 Bangkok (owner: Antigravity's credits are unused, "maximize it")

- Every delegated role now runs on Antigravity, and Claude Code's limit is for the controller only. This replaces the 10 Nov routing below. `make_prompt.py` prints the targets:
  - planners, first reviews and confirming reviews: `claude-opus-5-5-high`;
  - implementers and fixers: `claude-sonnet-5-5-high`;
  - the second review of money-path or privacy PRs: `gemini-4-argon-high`, a different model family;
  - scouting: `gemini-3.8-flash-high`.
- `--claude-code` runs a role on Claude Code if Antigravity is down or out of credit. `--claude-limited` is gone.

## Merged 11 Nov 07:45 Bangkok (owner: "if CI pass merge it")

- On green local CI and approved reviews, at their exact heads (each head is the reviewed commit plus receipt corrections; #392's is the reviewer's own COMBO patch):
  - #392 tray-hardening at 99ce506, merged as 37a0d2f; promotion #399. c-n1 goes to P2-T16 (followups.md). **P2-T16 is off held.txt.**
  - #394 1B-T12 at d853122, merged; issue #116 closed; promotion #400.
  - #397 download-pins at ac61350, merged as 7b336d8; promotion #401.
  - #398 alarm-hardening at 3707c29, merged as 8e9b982; promotion #402. Download-pins' kit mutant V3 no longer applies after #398: rerun it with A1's text (followups.md).
- The round-two tray brief (`briefs/tray-hardening-fix2.md`) is no longer needed; its c-n1 is P2-T16's.
- Still open: #395 (P2-T12) and #396 (fix-download-aborts), each with a READY fix brief and no fixer yet. Next by the plan: dispatch P2-T14, then P2-T20 once P2-T14 merges.

## CI runs on this Mac now, 11 Nov 06:05 Bangkok (owner's approval)

- GitHub-hosted runners still refuse every job (billing). The workflow's nine jobs now run on the runner the repo variable `CI_RUNNER` names (2945a783 on the integration branch). It is set to `jotbun-local`: two self-hosted Linux arm64 runners in Colima, each with its own Docker daemon on a private socket.
- **Manage them:** `bash .claude/controller/local-ci/runners.sh up|down|status`. Colima must be running (`colima start --cpu 10 --memory 32 --disk 100`). To go back to GitHub's runners, delete the variable: `gh variable delete CI_RUNNER --repo mygogocash/jotbun`.
- **A PR picks the change up on its next run:** a push, or close and reopen, because pull-request runs read the workflow from the merge with the base. A `gh run rerun` of an old run still targets ubuntu-24.04 and is refused.
- **The owner approved starting Docker for CI.** Agents' local gates still skip database suites; CI runs them on these runners.
- **The first run, #392 at 99ce506, passed all nine jobs** (23:05 to 23:38 UTC, 33 minutes with two runners). #392 is not merged: the plan above still has a fixer bring it to the fix2 kit.
- #394, #397 and #398 were reopened at 06:40 for local runs. #395 and #396 run on their fixers' pushes.

## Cursor Auto stepped back, 11 Nov 05:57 Bangkok: two things it left for this controller

- **#392 has a commit the round-two planner does not know about: 99ce506** (pushed 10 Nov about 14:40). It is the confirming review's validated COMBO guard (`if (!shown && !showing.current) closed.current?.()`, the `showing` ref restored), the HIDE-END case and c-n2's receipt lines.
  - RED: 1 failed | 26 passed on fc78376's code. GREEN: 27 of 27. `tsc` exit 0, `test:app` 34, `test:unit` 970.
  - Its five guard mutants G1 to G5 are killed, and 35 of the planner's 37 that still apply are killed (`scratch/tray-hardening-fix2/`).
  - c-n1 is not in it. Either keep 99ce506 and narrow the round-two brief (`wf_41e3ff21-3b6`) to c-n1, or revert it with a new commit.
  - Its CI run 42777094800 was refused for billing.
- **The model routing below** is the owner's rule for new dispatches, so the #395 and #396 fixers go to Antigravity Argon. The owner has not yet answered whether money-path and privacy PRs need their approval to merge into the integration branch.
- This thread no longer watches #392 to #398.

## Model routing changed, 10 Nov 14:40 Bangkok (owner's ask: "maximize AI resources")

- The skill's new "Model routing" section and `make_prompt.py` (which now prints a `delegate_task` target) apply to every dispatch from now on:
  - planners stay on Claude Code Opus xhigh;
  - builds, fixes, reviews and confirming reviews move to Antigravity Gemini 4 Argon (High);
  - money-path and privacy PRs also get a second review on Antigravity Claude Opus 5.5 (Medium), and the owner approves their merge;
  - scouting and CI triage go to Antigravity Gemini 3.8 Flash (High);
  - Fable 5.2 is an advisor only, about once a day.
- The sources are `/Users/kunanonjarat/ai-agent-workflow.md` and gogocash's `knowledge/practice/model-routing.md`.
- Agents already running (#392 to #398) keep their models. The routing starts with the next dispatch, e.g. #396's test-only fixer and its confirming review.
- `make_prompt.py --size` is gone; `second` and `--claude-limited` are new.

## Takeover in T3 Code (9 Nov, 22:05 Bangkok): READ THIS FIRST

The Orca controller (session 121af0e6) hit its 5-hour usage limit at 22:04; the limit resets at 01:50 on 10 Nov. Its agents died with it, and its background jobs were killed. **Do not let that Orca session continue when its limit resets**, including through its "Continue automatically when limits reset" option: two controllers would collide in the same worktrees.

New controller: a T3 Code thread (Claude Code session 22c24cd3). Its own checkout, `/Users/kunanonjarat/.t3/worktrees/jotbun/t3-d9c08cd1-928de148f4930c37`, is main at afcf884; the controller works on the main checkout's `.claude/controller` and the task worktrees by absolute path.
- **Dispatch:** T3's `delegate_task`, which pins model and effort (Opus xhigh, Haiku max, Sonnet xhigh), with `ultracode: false` for every child (SKILL.md).
- **Cleanup at takeover:**
  - 1D-T8's killed mutant runner had left mutant P8 in `PrivacyScreen.tsx`. The controller copied the kit's `real/` file back (checksum verified).
  - The heavy lock, held since 21:53 by 1B-T8's killed final proof, was removed; no test process was alive.
  - `inflight_agents.py` now lists agents that failed on a usage limit; it had missed the P4-T12 and P4-T13 planners.
- **Resumed at about 22:15**, with resume notes in `scratch/takeover/*.resume.md`. The T3 task ids end with the uuid shown.
  - **1D-T8: merged as 30fb26b (#372, at 22:50).** Issue #139 is closed, and the worktree and branches are removed.
    - The Opus review (`reviews/1D-T8.md`) approved with one minor and five nits. They are in followups.md under the analytics-consent-hardening task, which must land before `analytics` is approved, plus P2-T18's swap.
    - CI on 2ff0b8d: render 108 files and 1865 cases, `test:unit` 927, `test:app` 34, `export:web` 4794.
    - **CI has no iOS export and no `typecheck:routes`** (review n5). The controller ran the iOS export on 2ff0b8d before the merge (exit 0, 5760 modules); receipt corrected in 8979ad6.
    - protocol.md now says so, and the ci-parallel-jobs planner was told to add both steps. Until that merges, run the iOS export (baseline.sh's command) before merging any task that changes routes, the app entry or native code.
    - **Promotion PR #373** (`promote/1d-t8`, base main) is the first of the stack; the next promotion stacks on it. The owner merges into main.
    - The P2-T11 planner was told 1D-T8's files are now on the head.
  - **App baseline at 30fb26b** (CI): render 108 files and 1865 cases, `test:unit` 927, `test:app` 34, web 4794, iOS 5760.
- **P2-T13: brief READY at 712574d** (L, depth 18): the tray, main button, text link and lock cover.
  - Files: 9 new. Shared: `dev/catalogue/wallet/index.ts` (one spread; its sections are in its own `traySections.tsx`, to stay clear of P2-T11's `kitSections.tsx`), a comment in `theme/motion.ts`, and one extended case in `useWalletMotion.render.test.tsx`.
  - P1 to P19 are accepted. P5 keeps the two animation systems one per surface. P6 pins P2-T9's m-2 (drop it from followups.md once merged; m-1 stays). In P17, P10 is equivalent (Pressable reports `disabled` itself).
  - The planner proved it also laid over P2-T11's final files, so it works in either merge order. Kit `scratch/p2-t13-planner/`: check_kit at ee12d43 gives 27 OK, and the 3 `orig/` files are identical. 98 of 99 mutants are killed and one is equivalent.
  - The implementer (Haiku max, 094336d2) was dispatched at about 06:20 in a pre-installed p2-t13 from ee12d43. No iOS export is needed.
  - For E2-A, see P19 (button sizes, the title's alignment, the backdrop without a fade).
  - **DONE at 2f0e40e; PR #383 opened at 06:35 (issue #159).**
    - RED: Node 4 of 4, render 16 of 16. GREEN: 4 and 22, neighbours 42. 98 of 99 mutants killed, with P10 equivalent; the output matches the planner's.
    - A server restart cut off the first mutation run at R31. The implementer restored `Tray.tsx` from `real/` and reran all 99.
    - The controller checked the 11 files against the kit and the clean merge with the head.
    - **The review runs as a workflow** (run wf_74d1e17e-476): two Opus lenses (closing, the lock, the exit and motion; names, focus, buttons, the test traps, shared edits and CI), a skeptic for each blocker or major, and a synthesizer writing `reviews/P2-T13.md`.
    - On approval and green CI: `merge_task_pr.sh 383 2f0e40e P2-T13`, then `promote_pr.sh P2-T13 383`. No iOS export is needed.
    - #382 (P2-T11) and #383 share no file. Whichever merges second, CI tests the merge ref; read the PR through the API first (lessons.md: a stale merge ref).
  - **1B-T8: brief READY at 0bd5659** (L, 16 files under apps/edge). P1 to P17 are accepted, with P4 recorded as R101.
    - Kit `scratch/1b-t8-planner/`: check_kit at db19056 gives 47 OK, and the 13 `orig/` files are identical.
    - The planner's proof: RED 38 of 53 failing, GREEN 52 plus 1 todo, 62 of 62 mutants. In the ten-times memory case, `peakHeldBytes` was at most 20,644,143 against a bound of 20,644,976.
    - For CI: workers +1 file, +37 passed and -2 todo; `test:edge` +0.
    - The implementer (Haiku max, a4857037) was dispatched about 22:34 in a pre-installed p1-1b-t8 from db19056. Its workers runs hold the heavy lock.
    - **DONE at f416f24; PR #374 opened at 22:53 (issue #112).** RED 38 of 53, GREEN 52 plus 1 todo, 62 of 62 mutants, `test:edge` 15 files and 176 tests, and `build:edge` with no driver markers. In the ten-times case, `peakHeldBytes` was 20,644,119 against a bound of 20,644,976.
    - The controller checked the 16 files against the kit and the clean merge with the head.
    - **Merged as 1c14dd1 (#374, at 23:18).** Issue #112 is closed, and the worktree and branches are removed.
      - The Opus review approved with three minors and two nits; all seven focus items hold, including R101's retry ending `failed` on real repeated throws.
      - m-1 (a resync can stall for a day after a stale snapshot is pruned) goes to 1B-T11, before pruning goes on the alarm.
      - m-2 (the memory proof's spy can be bypassed with a spread), m-3, n-1 and n-2 go to fix-download-aborts, with the reviewer's ready cases in `scratch/1b-t8-review/`.
      - Also from the review: 1B-T12 must expect a deleted snapshot's 404 against the API's `expired` (or 1B-T11's fix changes it); the 64 MiB snapshot cap is not proven against 128 MB (a hosted check).
    - **Edge baseline now (CI):** workers 28 files, 675 passed and 1 todo; `test:edge` 15 files and 176 tests.
    - **Promotion PR #380** is stacked on #378 (stack #379: #373, #378, #380).
- **Server lane, dispatched at 23:20 from 1c14dd1 (Opus xhigh, in parallel; no shared file in their listings):**
  - **1B-T7: brief READY at 712574d** (M), the AI routes. New: `vault/ai.ts`, `v1/ai/service.ts`, `v1/ai/routes.ts`, `test/workers/ai.test.ts`. It also edits nine shared files, including three minimal `handler.ts` edits, none on a `headOf` line.
    - P1 to P18 are accepted. P2: a signed-out session with a malformed body gets 422 where the PostgreSQL edge gave 401; the token is still verified first, and these routes are edge-only. P5: every step rechecks the session, the policy and that the account is active.
    - The vault bundle grows to about 1,645 kB (gzip 377 kB), mostly the Anthropic SDK, by the plan's design.
    - Kit `scratch/1b-t7-planner/`: check_kit at d340ffe gives 44 OK, and the 9 `orig/` files are identical. The planner's proof: 99 of 99 mutants. For CI: workers +1 file and +38 tests.
    - The implementer (Haiku max, 603c183d) was dispatched at 06:38 in a pre-installed p1-1b-t7 from d340ffe, under the heavy lock for workers runs.
    - **DONE at 6223843 (synced to e469d8b); PR #385 opened at 06:56 (issue #111).**
      - RED and GREEN 38 of 38, and 99 of 99 mutants in four batches. `test:edge` 15 files and 176 tests. `build:edge` gives 1,645.04 kB with every driver marker at 0.
      - The controller checked the 13 files against the kit and the clean merge with the head. It is the first task PR in the nine-job CI.
    - **The review runs as a workflow** (run wf_529f455b-229): two Opus lenses (the AI service's order, sessions, fallbacks and privacy; the edge wiring, shared files, bundle and CI), a skeptic for each blocker or major, and a synthesizer writing `reviews/1B-T7.md`.
    - **Merged as 365ec2e (#385, at 07:58).** Issue #111 is closed, and the worktree and branches are removed.
      - The review workflow approved: no blocker or major, five minors and nine nits (followups.md).
        - m-1, the `budget_status` guard for months before 1970, goes to 1B-T13.
        - m-2, the `ai.consume` session pin, goes to fix-download-aborts.
        - m-3 to m-5 go to the test-only ai-service-pins follow-up.
      - CI: nine jobs on 6223843 into c764cf2, with workers 29 files and 713 passed. Only P2-T11's app files merged after that base.
      - **Promotion PR #388** is stacked on #386; stack #379 now holds seven PRs.
  - **fix-download-aborts: not yet planned.** It is held until a review workflow finishes, to keep about six local agents (the thermal lesson). Plan it on top of `scratch/1b-t7-planner/real/src/v1/handler.ts`, carrying the full list in followups.md (R97, plus the review cases from 1B-T6, 1B-T8, 1B-T9 and 1B-T10).
  - **1B-T11: brief READY at 712574d** (M), files on the vault alarm.
    - Files: new `jobs.ts`, migration `0003_alarm_indexes.sql` and `files-alarm.test.ts` (23 cases). Shared: `user-vault.ts`, `retention.ts`, `executor.ts`, `migrations/index.ts`, and 1B-T8's `snapshots.ts` and `snapshots.test.ts`.
    - P1 to P19 are accepted, with P2 recorded as R104 (a one-minute floor for writes). P1 fixes 1B-T8's m-1 (a stale snapshot keeps its row and reads `expired`), with a residual accepted.
    - Kit `scratch/1b-t11-planner/`: check_kit at 55b5781 gives 29 OK, and the 6 `orig/` files are identical. The planner's proof: RED 25 of 72, GREEN 72, 32 of 32 mutants; the AFFECTED 14 workers files gave 414 passed and 1 todo.
    - The implementer (Haiku max, 2bc80cea) was dispatched at 07:08 in a pre-installed p1-1b-t11 from 55b5781, under the heavy lock.
    - **DONE at a9a7d27; PR #387 opened at 07:20 (issue #115).**
      - RED 25 of 72, GREEN 72, 32 of 32 mutants. AFFECTED: 14 files, 414 passed and 1 todo. `test:edge` 176. `build:edge` gives 722 kB with every driver marker at 0.
      - The controller checked the 9 files against the kit and the clean merge with the head.
    - **The review runs as a workflow** (run wf_1b001b01-c31): two Opus lenses (the alarm rules, R104 and the rearm wiring; the snapshot fix, the migration, shared files and CI), a skeptic for each blocker or major, and a synthesizer writing `reviews/1B-T11.md`.
    - **1B-T7 merged first.** At about 07:59 #387's branch was updated through the update-branch API (`expected_head_sha` = the reviewed a9a7d27).
      - The new head 2f46822 is "Merge branch 'claude/p1a-vault-core' into p1/1b-t11-files-alarm". The task's files are unchanged, and the PR's diff is the same 10 files (+1110, -98).
      - A fresh nine-job run tests 1B-T11 together with 1B-T7.
    - **Merged as c8929f2 (#387, at 08:14).** Issue #115 is closed, and the worktree and branches are removed.
      - The review workflow approved: no blocker or major, four minors and ten nits.
      - CI was green alone (29 files and 698 passed) and together with 1B-T7 (30 files and 736 passed).
      - The findings (followups.md):
        - m1, m2 and m4 plus nits go to the new **alarm-hardening** follow-up, not yet dispatched;
        - m3 and n6 go to fix-download-aborts;
        - n8 (the 30-day expired window) goes to 1B-T12;
        - n10 to 1B-T13, and n7 to 1C-T11.
      - **Promotion PR #390** is stacked on #389; stack #379 now holds nine PRs.
    - **Edge baseline now (CI):** workers 30 files, 736 passed and 1 todo; `test:edge` 15 files and 176 tests.
    - fix-download-aborts is then planned on top of 1B-T7 and 1B-T11 once both merge (followups.md).
  - **fix-download-aborts** is planned next, on top of 1B-T7's `real/` `handler.ts`. It must land before 1B-T13; its list in followups.md now includes 1B-T8's review cases.
  - **ci-parallel-jobs: brief READY at 857b9f2** (M), with the controller's amendment (the iOS export and `typecheck:routes` in CI).
    - Nine parallel jobs; the expected median wall time is about 4.4 minutes, against 10.4.
    - Shared files: `backend.yml`, `backend-workflow.test.mjs`, `docs/implementation/handover.md` (two Full gate lines), `apps/app/package.json` (the `export:ios` script) and `README.md` (the CI paragraph).
    - P1 to P14 are accepted. Kit `scratch/ci-parallel-jobs-planner/`: 46 OK, and the 5 base files are identical at 857b9f2.
    - The implementer (Haiku max, a5529d6c) was dispatched at 23:08 in a pre-installed ci-parallel from 857b9f2.
    - **DONE at 46b30a0; PR #377 opened at 23:14 (no task issue).**
      - The workflow test: RED 4 of 9 passing, GREEN 9 of 9. All 19 mutants failed as expected.
      - `SPLIT OK`: parts 162, 196 and 218 of 576. `test:unit` 927, and `typecheck:routes` passed.
      - The controller checked the 5 shared files against the kit and the clean merge with the head.
    - **The review runs as a workflow** (run wf_1346c5d6-527): two Opus lenses (the split and the test's pins; the workflow and CI evidence), a skeptic for each blocker or major, and a synthesizer writing `reviews/ci-parallel-jobs.md`.
    - #377's own CI is the first nine-job run, including the iOS export's first Linux build. Its measured times go in the receipt's "After, measured" line.
    - **The review approved** (`reviews/ci-parallel-jobs.md`, two-lens workflow, resumed after the stop): no blocker or major, three minors and seven nits (followups.md; m2 and m3 go to P6C-T7). The render split is whole, every old step still runs once, and the iOS export passes on Linux.
    - **Before merging (review m1):** #377's only CI run was on the old base 4850463. Once the owner answers, close and reopen #377 for a fresh nine-job run on the current base and check its totals. Only then run `merge_task_pr.sh 377 46b30a0` (no task id). Each extra run costs about 33 billable minutes, which is why it waits for the answer.
    - **The owner answered on 10 Nov at 06:2x: "keep the nine-job CI, merge".**
      - The controller closed and reopened #377 at 06:24, but that run (42720201154, green, 256 s wall) checked out the stale merge commit `c56e0e4` (into 4850463), so it proved nothing new (lessons.md).
      - An API read then rebuilt the merge ref as 97f299c (base b272f0c, which holds P4-T13, 1B-T8 and P4-T12). The PR was reopened again at 06:32, for run 42721236288.
      - Run 42721236288 checked out `97f299c` = `46b30a0` into `b272f0c`, and its nine jobs were green in 288 s wall.
      - The render job had 107 files and 1291 tests, and the sections jobs 162, 196 and 218 of 576, for the full 1867. The exports built web 4806 and iOS 5772. Workers had 28 files.
    - **Merged as e469d8b (#377, at 06:39).** No task issue; the worktree and branches are removed.
      - **Promotion PR #384** (`promote/ci-parallel-jobs`) is on top of stack #379: #373 → #378 → #380 → #381 → #384.
      - The receipt's "After, measured" line, with nits n1 and n6, is in 9ed39fa.
      - protocol.md now states the nine-job layout (the iOS export is CI's again), and followups.md drops 1A-T10's minor 1 from P6C-T7 and closes 1D-T8's n5.
    - **From now on every PR's CI runs the nine jobs** (about 4.75 minutes, about 33 billable minutes). The controller no longer runs the iOS export by hand.
    - **Its merge waits on the owner's Actions-minutes answer** (Owner decisions waiting).
    - After the merge: P6C-T7 no longer carries 1A-T10's minor 1, briefs that say "CI's database job runs `test:edge:db`" now mean the `edge` job, and the protocol's iOS-export correction can be lifted.
  - **P4-T12: brief READY on 606e131's code** (M; 18 new files in `src/slips/` and ten placeholder routes under `app/spend/slips/`).
    - Shared files: `sharedV1.ts`, `DeviceDiaryProvider.tsx` and its test, and one line in `bunSettingsErase.render.test.tsx`. P1 to P15 are accepted, with P2 recorded as R102.
    - Kit `scratch/p4-t12-planner/`: check_kit at c1637ec gives 51 OK, SHA256SUMS.base 4 OK, and the 4 `orig/` files identical.
    - The planner's proof: 64 of 64 mutants. For CI: `test:unit` +11, web +12 modules, render +1 file and +2 cases.
    - The implementer (Haiku max, 30b6286d) was dispatched about 22:46 in a pre-installed p4-t12 from c1637ec. Its notes allow exactly 1D-T8's shift if #372 merges before its sync.
    - **DONE at 8b9e16e; PR #376 opened at 22:57 (issue #220).** RED: Node 11 of 11, render 3 of 10; GREEN 11 and 10; 64 of 64 mutants. `test:unit` 933, `export:web` 4803, `typecheck:routes` passed.
    - Its sync did not pick up 1D-T8; CI tests the merge ref. The controller checked the 21 files against the kit and the clean merge with the head.
    - **iOS export (the controller, CI has none):** exit 0, 5769 modules on 8b9e16e.
    - **The review runs as a workflow** (ultracode; run wf_b4bc3a66-c98).
      - Three Opus xhigh lenses: the contract, privacy, and integration (which includes a scratch merge with 1D-T8).
      - An Opus skeptic tries to refute each blocker or major.
      - A synthesizer writes `reviews/P4-T12.md` with the verdict.
    - **Merged as 712574d (#376, at 23:27).** Issue #220 is closed, and the worktree and branches are removed.
      - The review workflow approved: no lens raised a blocker or major, with six minors and eleven nits.
      - CI on the merge ref: `test:unit` 938, render 109 files and 1867 cases, web 4806. The synthesizer's scratch merge with a915f95 (P4-T13) was clean.
      - The minors go to P4-T14 (followups.md). Two of them are privacy rules for the first hasher: m1, a salt fetch in flight during the sign-out erase writes the salt back; m2, the hasher must belong to the open diary's account.
    - **Promotion PR #381** (`promote/p4-t12`, based on `promote/1b-t8`). Stack #379 is now #373 → #378 → #380 → #381.
- **App baseline at 712574d** (CI on #376's merge ref plus P4-T13): `test:unit` 956 (927 + 18 + 11), render 109 files and 1867 cases, web 4806; iOS not measured at the head (computed 5772: 5760 with 1D-T8 plus P4-T12's 12 modules).

## New model routing (the owner's rule of 10 Nov, in SKILL.md since about 14:36): READ THIS FIRST
`SKILL.md`, `scripts/make_prompt.py` and `references/prompts.md` were rewritten at 14:36 to 14:37 by the owner (the edit names the owner's setup). The rule: route each task to the cheapest model that does it well.
- **Planners:** `claudeAgent` Opus xhigh (unchanged).
- **Implementers, fixers, first reviews and confirming reviews:** T3's `antigravity` provider, `gemini-4-argon-high`.
- **Money-path or privacy PRs** (wallet, cashback, points, payments, auth, private mode, privacy migrations):
  - a second review on `antigravity` `claude-opus-5-5-medium` (`make_prompt.py second`);
  - **ask the owner, with a recommendation, before merging**, even on green CI.
- **While T3 is down, Antigravity is unreachable.** Builds, fixes and reviews wait for the reconnection rather than spending Claude quota.
  - Already running on Claude before the change, and allowed to finish: the reviews of #397 and #398.
  - Planners run on Claude in workflows: tray-hardening fix2 (wf_41e3ff21-3b6). **1C-T9's planner (wf_313426aa-c35) reported BLOCKED at 14:50:** the plan (p1c :1052) starts it after the owner's E2 approval of 1C-T8's screenshots, and none is recorded. 1C-T9 is now HELD in held.txt (Owner decisions waiting).
- **Waiting on T3, for Argon:**
  - the fixers of P2-T12, fix-download-aborts and tray-hardening (round two), once their briefs are READY;
  - P2-T14's and P2-T20's implementers, after #392 merges;
  - 1C-T9's implementer, after its brief.
- **The open PRs under the new merge rule:**
  - **Wallet, so ask the owner before merging:** #392 (tray-hardening) and #395 (P2-T12). Each also needs the Opus second review.
  - **#398 (alarm-hardening):** its migration 0004 changes how receipt retention is scheduled. Treat it as privacy-adjacent and ask the owner.
  - **The rest merge on green CI and approval as before:** #394 (1B-T12, parity tests), #396 (fix-download-aborts) and #397 (download-pins).
- **Verify before relying:** re-check each review finding against the code before ruling on it.

## T3's MCP server lost its authorization, 10 Nov 14:39: READ THIS FIRST
- `t3_thread_send` failed: "MCP server t3-code rejected the Authorization header in its config (update it, then run /mcp to reconnect)". **Only the owner can reconnect it** (`/mcp`).
- **Until then, these T3 tools are unavailable:**
  - `delegate_task` and `t3_thread_send`;
  - `link_pull_request` and `watch_pull_request`, so PR updates may not wake the controller.
- **Threads T3 already runs may finish on their own:** the P2-T12 fix-brief planner (e328d240, run 4) and the fix-download-aborts fix-brief planner (46ff8a6d, run 3). Their notices may still arrive; if not, read their briefs from `briefs/` and their kits from `scratch/`.
- **New agents go through Claude Code's Workflow tool,** which sets `model` and `effort` per agent: Opus xhigh plans and first-reviews M and L tasks; Haiku max implements; Sonnet xhigh reviews S tasks and confirming rounds. Each prompt must name every file, since a fresh agent has no thread context.
- Check PRs yourself with `gh pr checks` and `status.sh`.

## Fourth usage-limit stop, 10 Nov about 09:50 to 13:50 (RESUMED at 13:50)
- The previous account (sub5) hit its 5-hour limit; the session continues on another account.
- **Failed at the stop:**
  - the review workflows of #395 (P2-T12), #396 (fix-download-aborts) and #397 (download-pins);
  - #392's fix-round confirmation;
  - the 1B-T12 planner's fix-brief run (run 3).

  alarm-hardening's implementer finished first (DONE at 14844b9).
- **At 13:50:** the heavy lock was free, no jotbun test process was alive, and there had been no thermal sleep since 06:05.
- **Resumed at 13:50.** Finished agents replay from cache.
  - Review workflows:
    - P2-T12: run wf_0cba99e1-318, task wlxc90ll5. The stack lens and ST1's skeptic are done; the frames lens and the synthesizer rerun.
    - fix-download-aborts: run wf_49c67ce8-b3f, task wvpaxxksg. The fix lens is done (3 findings, none serious).
    - download-pins: run wf_e153ae48-9d5, task wqohgoiyi. Everything reruns.
    - #392's confirmation: run wf_4739381a-1ab, task wneoycf3d. Everything reruns.
  - **The 1B-T12 planner** was restarted by T3 at the reset (run 4, a `limit-resume` task) and steered with the cutoff note.
- **P2-T12's stack lens found a MAJOR, ST1, and its skeptic confirmed it.**
  - The bug: on iOS with VoiceOver, double-tapping a card behind the front one opens the card in front. Each card's 200 pt accessibility frame is activated at its midpoint, which the next card covers.
  - The web suite cannot see it. A fix round is expected once the synthesizer writes the verdict: likely `onAccessibilityTap`, so activation calls `onOpen` directly.

## Third usage-limit stop, 10 Nov about 08:23 (RESUMED at 08:27)
- The previous account hit its 5-hour limit (it resets at 12:00). The session continues on another account.
- Failed at the stop:
  - all five planners: tray-hardening 351b244a, P2-T14 deda1216, P2-T12 e328d240, fix-download-aborts 46ff8a6d and 1B-T12 373c38a4;
  - the wallet-looks-unstored review workflow (run wf_c0db7db8-830).
- At 08:26 the heavy lock was free and no test process was alive. The last thermal sleep was at 06:05.
- At 08:27 each planner was steered on its own thread (run 2) with the cutoff note: background runs are dead, rerun unfinished checks, restore mutated files from `real/`, the lock is free, and the head moved only in controller files. **Do not respawn them.**
- The review workflow was resumed from run wf_c0db7db8-830 (task wskvqzln0).
- #391's CI is green on 8c997d8 (nine jobs); its merge waits only on the review.

## T3 server restart, 10 Nov about 07:21 (RESUMED at 07:22)
- The restart cancelled the three running review workflows. They were resumed from their runs, and finished agents replay from cache:
  - P2-T13: run wf_74d1e17e-476, task w29wpu2c7;
  - 1B-T7: run wf_529f455b-229, task w9t0fclqe;
  - 1B-T11: run wf_1b001b01-c31, task wfyqetxeu.
- At 07:22 the heavy lock was free and no test process was alive. No delegated thread was running.
- **If they are cancelled again, resume the same runs.** Each run's `journal.jsonl` is under the session's `subagents/workflows/<run>/`.

## Second usage-limit stop, 10 Nov about 07:00 (RESUMED at 07:05)
**Resumed at 07:05,** after the owner reset the credit early. Do not resume these again:
- the P2-T11 review (task wmhduu9mn), the P2-T13 review (w3202gbyx) and the 1B-T7 review (wms605bju), each from its saved run;
- the 1B-T11 planner, steered on run 5 with the cutoff note.

The list below is kept for the record.
- **Review workflows** (they do not restart themselves). Resume each with `Workflow({scriptPath, resumeFromRunId})`: agents that finished replay from cache.
  - **P2-T11 (#382):** run wf_4e503333-e15, script `review-p2-t11-wf_4e503333-e15.js`. Both lenses are done (data: 5 findings; build: 4; no blocker or major), so only the synthesizer reruns.
  - **P2-T13 (#383):** run wf_74d1e17e-476, script `review-p2-t13-wf_74d1e17e-476.js`. The behaviour lens is done (6 findings, no blocker or major); the surface lens and the synthesizer rerun.
  - **1B-T7 (#385):** run wf_529f455b-229, script `review-1b-t7-wf_529f455b-229.js`. All three agents rerun.
  - The scripts are under `~/.claude/projects/-Users-kunanonjarat--t3-worktrees-jotbun-t3-d9c08cd1-928de148f4930c37/22c24cd3-aa0d-449a-b3ad-bdc2f5954699/workflows/scripts/`.
- **The 1B-T11 planner** (thread 6407a432) failed again. T3 restarts it at the reset, as it did at 03:10; then steer it with the cutoff note (background runs are dead, rerun unfinished checks, restore mutated files from `real/`).
- **CI is green on all three PRs:**
  - #382: render 111 files and 1894 tests, with the whole `CatalogueScreen` file passing (301 tests, R103's record).
  - #383: render 110 files and 1891 tests.
  - #385, the first task PR in the nine-job layout (checkout `6223843` into `c764cf2`): workers 29 files and 713 passed plus 1 todo, exactly +1 file and +38 tests.

  Each merge waits only on its review.

## Usage-limit stop, 9 Nov 23:28 to 10 Nov 03:10
- The controller's own session and every agent hit the 5-hour limit at about 23:28: the P2-T11 implementer, the P2-T13, 1B-T7 and 1B-T11 planners, and the ci-parallel-jobs review workflow.
- At 03:10, T3 restarted each delegated thread itself, on the same thread with its context (run 2, task ids starting `limit-resume`). **Do not respawn them.** The controller steered each with the cutoff note: background runs are dead, rerun any check not seen to finish, restore any mutated file from `real/`, the lock is free, and P4-T12 merged as 712574d, sharing no file with them.
- The ci-parallel-jobs review workflow does not restart itself; it was resumed with `resumeFromRunId` wf_1346c5d6-527 (task wrhzd95p0). All three of its agents run again.
- Checks at 03:11: the heavy lock was free; no test process was alive; the load came from macOS indexing; and the Orca controller's transcript had not been written since 22:04 on 9 Nov (it did not resume at 01:50).
  - **P4-T13: brief READY at 0bd5659** (S, 7 new files in `src/slips/`, none shared; no package or lockfile change).
    - P1 to P18 are accepted. The Q1 and Q2 adapters wait on the owner (P18).
    - Kit `scratch/p4-t13-planner/`: check_kit at d579f94 gives 31 OK, SHA256SUMS.base 2 OK, and both `base/` files identical.
    - The planner's proof: 84 of 84 mutants. For CI: `test:unit` +18, everything else +0.
    - The implementer (Haiku max, c5f063e0) was dispatched about 22:44 in a pre-installed p4-t13 from d579f94.
    - **Merged as a915f95 (#375, at 23:16).** Issue #221 is closed, and the worktree and branches are removed.
    - The Sonnet review approved with two minors (pin the type and base64 guards byte for byte; pin NFC before the album's cut) and four nits, all in followups.md under P4-T14 and P4-T18.
    - CI on 9d38cbd: `test:unit` 945 on the merge ref, everything else unchanged. No iOS export was needed.
    - **Promotion PR #378** (`promote/p4-t13`, based on `promote/1d-t8`) is stacked on #373 with `gh stack` (stack #379), so native stacks work. The owner merges the stack bottom-up.
  - The old P2-T10 planner (a0363fb1, "waiting on its own background work") is obsolete: P2-T10 merged as #370.
- **P2-T11: brief READY at 30fb26b** (L, depth 18). Wallet looks, Bun faces, materials, category icons and the wallet card. Shared files: `categoryIcons.tsx`, `walletHarness.tsx` and its test, and `kitSections.tsx`.
  - P1 to P16 are accepted. P3 is the provider's one-queue rule: a change never drops another, and an unreadable name is never written over.
  - For the owner at E2-A: the food and gift glyphs keep today's drawings (P4); private mode masks amounts in place (P7); and the board calls in P9.
  - It folds in P2-T8's m-1 (harness cases H6 and H7, mutants HA2 to HA4) and m-2's harness sentence.
  - Kit `scratch/p2-t11-planner/`: check_kit at 6e51a3d gives 41 OK, and the 4 `orig/` files are identical. The planner's proof: 119 of 119 mutants.
  - The implementer (Haiku max, 3b2e8ff2) was dispatched at 23:24 in a pre-installed p2-t11 from 6e51a3d. No iOS export is needed (no route, entry or native change).
  - **DONE at 31d9d59 (base e7fad50); PR #382 opened at 06:29 (issue #157).**
    - RED: Node 10 of 10, render 19 of 27. GREEN: 14 and 27. 119 of 119 mutants. `test:unit` 955, `test:app` 34.
    - It was BLOCKED once, on the whole-file `CatalogueScreen` run, by the Mac's thermal sleeps. Under ruling R103 that run went to CI, on the per-case evidence (298 and 300 of 301, then 4 of 4 targeted).
    - The controller checked the 18 files against the kit and the clean merge with the head.
    - **The review runs as a workflow** (run wf_4e503333-e15): two Opus lenses (the data rules and card words; the drawings, harness, catalogue and CI), a skeptic for each blocker or major, and a synthesizer writing `reviews/P2-T11.md`.
    - **CI on #382 is R103's record** for the whole `CatalogueScreen` file.
    - **Merged as 5a33820 (#382, at 07:15).** Issue #157 is closed, and the worktree and branches are removed.
      - The review workflow approved: no blocker or major, two minors and seven nits.
      - CI tested `31d9d59` into `d2bdb17`: render 111 files and 1894 tests, and the whole `CatalogueScreen` file 301 of 301 (R103's record).
      - The base moved only by #377 (CI files and one script line) before the merge, so its green run stood.
    - **m1 becomes the follow-up task wallet-looks-unstored:** a change that was never stored drops from view at the next stored change, which breaks brief P3.
      - P2-T20, P2-T21 and P2-T29 are HELD in held.txt until it lands. Its ready cases are D1, D2 and D8b.
      - The other minors and nits are in followups.md (P2-T12, P2-T21, P2-T22, P2-T29, P2-T35, E2-A).
    - **Promotion PR #386** is stacked on #384; stack #379 now holds six PRs.
    - **P2-T13 (#383) merges second.** Its merge ref stayed stale, so at 07:25 the controller updated its branch with the base through GitHub's update-branch API (`expected_head_sha` = the reviewed 2f0e40e).
      - The new head 9b3196d is "Merge branch 'claude/p1a-vault-core' into p2/t13-tray". The task's files are unchanged from 2f0e40e, and the PR's diff is the same 12 files (+1246, -4).
      - A fresh nine-job run on a true merge with P2-T11 is under way.
      - **Merged as 08e0566 (#383, at 08:01).** Issue #159 is closed, and the worktree and branches are removed.
        - The review workflow approved: no blocker or major, six minors and five nits.
        - CI run 42728251106 was on a true merge with P2-T11: render 112 files and 1918 tests, `test:unit` 970, web 4807, iOS 5773.
      - **The tray-hardening follow-up** (P2-T13's m1 guard, m2, m3's reset, m4, n1, n3; ready probes) must land before P2-T16, which is HELD in held.txt.
        - P2-T33 inherits a plan gap: an open tray's lock cover hides LockedScreen.
        - Everything is in followups.md.
      - **Promotion PR #389** is stacked on #388; stack #379 now holds eight PRs.
      - A new lesson: only `CatalogueScreen` and `screenReader` open every catalogue section, so the large-text suite does not pick up new sections.
- **wallet-looks-unstored: brief READY** (S): P2-T11's review m1.
  - Files: the shared `WalletLooksProvider.tsx` and `WalletLooks.render.test.tsx`, and the receipt. The fix keeps unstored changes per account in a ref, laid over each read.
  - P1 to P13 are accepted. P4: never folded into a write, so an unreadable name is never written over. P6: D8 is not taken, since it fails only on the store's call order.
  - Kit `scratch/wallet-looks-unstored-planner/`: check_kit at 6db889a gives 46 OK, SHA256SUMS.base 2 OK, and the 2 `orig/` files are identical. The planner's proof: 37 of 37 mutants; for CI, +4 render cases.
  - The implementer (Haiku max, 7b8c794a) was dispatched at 08:11 in a pre-installed wallet-looks-unstored from 6db889a.
  - **DONE at 8c997d8 (base 9a24180); PR #391 opened at 08:20 (no task issue).** RED 4 of 13, GREEN 13 of 13, neighbours 38 of 38, 37 of 37 mutants, `test:unit` 970. The controller checked the 2 files against the kit and the clean merge with the head.
  - **The review runs as a small Sonnet workflow** (run wf_c0db7db8-830): one reviewer, a skeptic for any blocker or major, and a synthesizer writing `reviews/wallet-looks-unstored.md`.
  - On approval and green CI: `merge_task_pr.sh 391 8c997d8` (no task id), then `promote_pr.sh wallet-looks-unstored 391`. **Then take P2-T20, P2-T21 and P2-T29 off held.txt.**
  - **Merged as 76b329c (#391, at 08:56). No task issue; the worktree and branches are removed.**
    - The Sonnet workflow approved, resumed after the third stop: no blocker or major, one minor and five nits.
    - All five of P2-T11's P3 rules hold, checked against 5,450 random schedules and a differential with the head's provider.
    - CI run 42735086363 tested 8c997d8 merged into 7508e44, which already held 1B-T11. Only `.claude/` changed after that, so the green run stood through the billing stop.
    - **P2-T20, P2-T21 and P2-T29 are off held.txt.**
    - The findings are in followups.md:
      - m1 (PE, PE2 and PF; mutant OM1) and n2 go to the test-only **wallet-looks-pins** follow-up;
      - n3 goes to P2-T20 and P2-T21;
      - n4 to P2-T20;
      - n5 to P2-T18, P2-T20, P2-T21, P2-T29 and P5-T19;
      - n1 (PX) to P5-T19.
    - **Promotion PR #393** is stacked on #390; stack #379 now holds ten PRs. Its CI cannot start until the billing is fixed.
- **The wallet lane: three planners dispatched at 08:04 from 3091b41 (Opus xhigh, no shared files):**
  - **tray-hardening** (351b244a; WT tray-hardening on fix/tray-hardening): P2-T13's review m1 guard, m2, m3 reset, m4, m5, m6, n1, n3, with ready probes. m5 and m6 were moved here from P2-T14 because they edit the same tray test files. It unblocks P2-T16.
    - **Brief READY at 6db889a (rehearsed on b5aa2a7)** (S): `Tray.tsx`, `Tray.render.test.tsx`, `trayGesture.test.ts` and the receipt; no shared file.
      - P1 to P16 are accepted.
      - P3: m2's guard reads a ref of `shown`, not `visible`. With `visible`, a reopen and close before the late end would call `onClosed` twice (mutant H3).
      - P4: `shown` is not held until `onDismiss`.
      - P5: P-J stays with P2-T33.
      - P11: the catalogue case no longer needs the tray's sections last. The P2-T14 and P2-T12 planners were told at 08:43; each of their tasks starts after tray-hardening merges.
      - Kit `scratch/tray-hardening-planner/`: check_kit at 58be2e2 gives 37 OK, SHA256SUMS.base 3 OK, and the 3 `orig/` files are identical.
      - The planner's proof: RED 5 of 22, GREEN 22 of 22 and 4 of 4, 34 of 34 mutants. For CI: render +6 cases.
    - The implementer (Haiku max, af5c01aa) was dispatched at 08:43 in a pre-installed tray-hardening from 58be2e2.
    - **DONE at 784667b (base ecc00b7); PR #392 opened at 08:50 (no task issue).**
      - RED 5 of 22, GREEN 22 of 22 and 4 of 4, catalogue `bw-` 18. 34 of 34 mutants, with output identical to the planner's. `test:unit` 970, `test:app` 34.
      - The controller checked the 3 files against the kit's `SHA256SUMS.real` and the clean merge with the head.
    - **The review runs as a small Sonnet workflow** (run wf_fa4458e5-3d3, task woa7ka514): one reviewer, a skeptic for any blocker or major, and a synthesizer writing `reviews/tray-hardening.md`.
    - On approval and green CI: `merge_task_pr.sh 392 784667b` (no task id), then `promote_pr.sh tray-hardening 392`. **Then take P2-T16 off held.txt.**
    - **CI run 42738781210 (08:52) never started: GitHub billing** (Owner decisions waiting, first item). Once the owner fixes it, run `gh run rerun 42738781210 --repo mygogocash/jotbun` and check the nine jobs (render +6 cases).
    - **The review approved at 09:25** (`reviews/tray-hardening.md`): no blocker or major, two minors and three nits. The reviewer reran 22 of 22 four times and 11 of the 34 mutants.
    - **The controller folded m-1, m-2, n-1 and n-2 into a fix round on #392**, since CI cannot run before billing is fixed anyway. A separate follow-up PR would cost another CI run later.
      - m-1 is a real but rare bug: a batched iOS end plus reopen calls `onClosed` while the tray is open. The fix is one line: read `shown`, not the ref.
      - The others are test pins for surviving mutants X1, D2 and X4.
      - n-3 goes to P2-T16 and P2-T20 (followups.md).
    - **The tray-hardening planner** (thread 351b244a, run 3, from 09:25) writes `briefs/tray-hardening-fix.md`, with kit `scratch/tray-hardening-fix-planner/`, proven on 784667b merged with the head.
    - **Fix brief READY at 10:01** (`briefs/tray-hardening-fix.md`; kit `scratch/tray-hardening-fix-planner/`, its sums 0 not OK, SHA256SUMS.base 3 OK on 784667b).
      - Files: `Tray.tsx`, `Tray.render.test.tsx` (+4 cases, 26 for CI) and the receipt.
      - F1 to F10 are accepted.
        - F1: `if (!shown) closed.current?.()`, and the `showing` ref goes.
        - F2: the Modal seam ends a held dismissal as `Modal.js` does.
        - F3: m-1's case queues both updates in one `act`. The two-task form flaked once in about 110 loaded runs, and on correct code.
      - RED 1 of 26 (m-1), GREEN 26, 40 of 40 mutants, proven on 784667b merged with d1111f8.
    - **The fixer (Haiku max, 9c6f9ed4) was dispatched at 10:01** in the tray-hardening worktree; it merges the head into the branch first (Step 1.2).
    - After DONE: push `fix/tray-hardening`, update #392's body (+4 cases, the fix round), and run a confirming Sonnet review. Then merge at the new head on green CI.
    - **Fix round DONE: merge 33edab1 (the head at 6a727dc into the branch), then fix commit fc78376**, pushed at 10:11; #392's body is updated.
      - RED 1 of 26 (m-1), GREEN 26 of 26 and 4 of 4, catalogue 18. 40 of 40 mutants, with output byte-identical to the planner's. `test:unit` 970, `test:app` 34.
      - The controller checked both files against the fix kit's `real/` and the clean merge with the head.
    - **The confirming Sonnet review runs as a workflow** (run wf_4739381a-1ab, task wv1qqqe83), writing `reviews/tray-hardening-confirm.md`.
    - **The confirming review approved at 14:38** (`reviews/tray-hardening-confirm.md`; resumed after the fourth stop as task wneoycf3d).
      - m-1 is fixed: all 19 first-review probes pass, and the one-`act` case fails on 784667b.
      - The Modal seam is faithful, X1, D2 and X4 are killed, and 10 of 40 mutants rerun and killed.
    - **c-m1 (minor):** F1 opens a mirrored window. An earlier end rendered in the same commit as the next hide still says closed, so a later hide's end says it again.
      - In the reviewer's model of 141 length-8 sequences: 44 deviations on 784667b, 22 on fc78376, and 0 with the validated guard `!shown && !showing.current` (the ref restored).
      - **Folded into a second fix round on #392**, with c-n1 (one iOS case for the fresh `onClosed`, mutant M3) and c-n2 (four stale receipt lines). P2-T16 builds `whenClosed` on this guard.
      - **The request to the old planner thread (351b244a) was never delivered:** T3's MCP server rejected this session's authorization at 14:39. The second round's brief is written instead by a fresh Opus xhigh planner in a Claude Code workflow (run wf_41e3ff21-3b6, task wkxjum826), from `scratch/dispatch/tray-hardening-fix2-planner.prompt.md`. Output: `briefs/tray-hardening-fix2.md`, with kit `scratch/tray-hardening-fix2-planner/`.
    - **The second-round brief is written** (`briefs/tray-hardening-fix2.md`; kit `scratch/tray-hardening-fix2-planner/`, its sums OK).
      - G1 and G2: the guard `!shown && !showing.current`, with the ref restored; 0 of 141 deviations in the model.
      - HIDE-END and the c-n1 case are added; receipt lines 3, 4, 29 and 53 are fixed; 45 of 45 mutants; CI render 26 to 28.
    - **But its planner reported BLOCKED at 15:17: #392's branch had moved to 99ce506.**
      - 99ce506 was pushed at 14:41 by an agent with the trailer `Co-Authored-By: Cursor`, matching thread 351b244a's run 4. So the `t3_thread_send` that returned an auth error was in fact delivered, and that thread committed and pushed although it was a planner.
      - 99ce506's `Tray.tsx` has exactly the kit's guard (comments differ). It adds HIDE-END and edits the receipt, but has no c-n1 case and no proof.
      - **The controller's ruling: keep 99ce506 (no force push).** The fixer brings all three files to the kit's `real/` (see `scratch/dispatch/tray-hardening-fix2-notes.md`), reruns the c-n1 RED under M3, GREEN, the 45 mutants and the gate, and commits on top.
      - **When T3 is back, read thread 351b244a first** and cancel it if it is still running, so there are never two writers on the branch.
    - Then: the fixer (Argon under the new routing), push, update #392's body, a confirming review (Argon), the Opus second review (wallet), and the owner's yes before the merge.
    - **Rule:** a third failing round means telling the owner. This round answers an approval's minor, not a failed review.
    - **On approval and green CI:** `merge_task_pr.sh 392 fc78376` (no task id), then `promote_pr.sh tray-hardening 392`. Then:
      - take P2-T16 off held.txt;
      - dispatch P2-T14;
      - fix the receipt's stale Status and Base lines in a one-line commit if the confirming review lists them.

      The push's CI run 42747590350 was refused for billing (0 steps run). After the fix, rerun that one: `gh run rerun 42747590350 --repo mygogocash/jotbun`.
    - **Then:**
      1. dispatch a Haiku fixer on `fix/tray-hardening`;
      2. push the new head and update #392's body;
      3. run a confirming Sonnet review;
      4. merge at the new head on green CI.

      The rerun command above then no longer applies; the push starts a fresh run.
    - P2-T14 (held) tolerates the changed tray files: its Step 0.2 records a hash difference and goes on. P2-T20's planner was told to check tray-hardening by content.
    - New lesson: `git apply` run inside `scratch/` can silently apply nothing.
  - **P2-T14** (deda1216; WT p2-t14 on p2/t14-add-flow), the add flow, keypad and amount step, depth 17. It plans against today's `Tray` props, without editing `Tray.tsx`.
    - **Brief READY at 09:09 (L), proven on b5aa2a7 with tray-hardening's three files laid over.**
      - New: 9 files under `src/wallet/add/` and `dev/catalogue/wallet/addSections.tsx`. Shared:
        - `index.ts`: import and spread right after the tray's; it merges cleanly with P2-T12's in either order;
        - `draftText.test.ts`: `add.chip` joins `LATIN_LINES`.
      - P1 to P17 are accepted.
        - P3: `AmountFooter` goes in the tray's pinned footer; `AddStep` gains `transfer`; `confirmRows` takes `tc`.
        - P9: the typed amount is never masked.
        - P10: at AX5 the amount scrolls (no tray slot under the header).
      - Kit `scratch/p2-t14-planner/`: check_kit at dbfde7d gives 29 OK, and the 2 `orig/` files are identical. RED 6 of 6 Node and 12 of 12 render; 92 of 92 mutants.
    - **HELD until tray-hardening (#392) merges.** Its Step 0.2 checks tray-hardening's own lines, since its spread after the tray's fails the head's `ids.slice(-4)` case.
      - When #392 merges: check_kit, create WT p2-t14 (install), and dispatch the implementer with P1 to P17 accepted.
      - If #391's 13 `WalletLooks` cases are counted, N is 53 (its P15).
  - **P2-T12** (e328d240; WT p2-t12 on p2/t12-card-stack), the card stack and frames, depth 15. It takes P2-T11's K5 and decides P2-T9's spring overshoot.
    - **Brief READY at 08:55 (M), proven on b5aa2a7's app tree:**
      - New: `CardStack.tsx`, `cardFrames.tsx`, `CardStack.render.test.tsx` (12 cases), `cardStackNative.test.ts` (1) and `stackSections.tsx`. Shared: one import and one spread in `dev/catalogue/wallet/index.ts`, placed between the kit's sections and the tray's (plan order).
      - It passes with tray-hardening's files laid over (34 of 34) and with #391's (43 of 43), so it waits on nothing in flight. 59 of 59 mutants.
      - No drop is played on a new wallet: the drop and its overshoot go to P2-T21. The derived-look flash is the caller's (P2-T23, P2-T24).
    - Its completion notice never reached the controller; the result was read from the thread. At 08:58 the controller told it that #391 merged (run 3, to confirm the proof on the new head).
    - **Run 3 rebuilt the proof on 76b329c** (after #391): the same RED messages, 59 of 59 mutants with the same lines in all three runs, and the focused files at 59.
      - P1 to P18 are accepted. P3: the spread sits before the tray's, so the task waits on nothing. P11: the drop goes to P2-T21. P12: K5 is in the stack's test file.
      - Kit `scratch/p2-t12-planner/`: check_kit at a58ea2a gives 17 OK, and the 2 `orig/` files are identical.
    - The implementer (Haiku max, 5fcc0b84) was dispatched at 09:07 in a pre-installed p2-t12 from a58ea2a.
    - **DONE at 90b5079 (base dbfde7d); PR #395 opened at 09:17 (issue #158).**
      - RED 13 of 13, GREEN 12 of 12 and 1 of 1, neighbours 47, catalogue `bw-` 22.
      - 59 of 59 mutants, with output byte-identical to the planner's.
      - The controller checked the 6 files against the kit's `real/` and the clean merge with the head.
    - **The review runs as a two-lens Opus workflow** (run wf_0cba99e1-318, task wy3myeu97). The lenses run one after the other, to keep about six agents: the stack and the press; then the frames, the catalogue merges, the tests and CI. A skeptic checks each blocker or major, and a synthesizer writes `reviews/P2-T12.md`.
    - On approval and green CI: `merge_task_pr.sh 395 90b5079 P2-T12`, then `promote_pr.sh P2-T12 395`.
    - **The review says Needs fixes (14:27; `reviews/P2-T12.md`):** one major, four minors and four nits. Everything else holds: the shape, the press, P10's frames, the `index.ts` merges in either order with tray-hardening, P2-T14 and P2-T20, and 15 of 59 mutants rerun and killed.
      - **M1 (ST1):** under VoiceOver a double tap on a back card opens the card in front. **The controller verified it against the code at 14:50** (the new verify-before-relying rule): `WalletCard.tsx:162` is a plain Pressable with no `onAccessibilityTap`, and `CardStack.tsx`'s `stackFrame` puts each 200 pt card at `top: 54 × index`, under the next card. The fix is `onAccessibilityTap={onPress}` on `WalletCard`'s Pressable, with a Node pin. **The controller granted leave to edit `WalletCard.tsx`** (P2-T11's file); no task in flight edits it.
      - **The fix round also takes m3, m4, n2, n3 and n4:** pins for the surviving mutants L1, L10, MF7, L3, L4, MF9, MF6 and MF4, and `frames.delete(view)` in `forget()`.
      - m1 and n1 go to P2-T24, and m2 to P2-T17 (followups.md).
    - **The P2-T12 planner** (thread e328d240, run 4, from 14:27) writes `briefs/P2-T12-fix.md`, with kit `scratch/p2-t12-fix-planner/`. Then:
      1. a Haiku fixer on `p2/t12-card-stack`;
      2. push, and update #395's body;
      3. a confirming review: Opus, since the first round was M and found a major;
      4. merge at the new head on green CI.
    - **Fix brief READY** (found on disk at 15:18; its T3 notice never arrived): `briefs/P2-T12-fix.md`, kit `scratch/p2-t12-fix-planner/` (26 OK; `SHA256SUMS.orig-in-wt` 6 OK on 90b5079).
      - F1 to F9 are accepted.
        - F1: `onAccessibilityTap={onPress}`.
        - F3: n2 needs two lines.
        - F4: 3 new cases (12 to 15).
        - F6: 73 of 73 mutants.
        - F9: VoiceOver on a real iPhone stays SKIPPED, a device check.
      - **The fixer waits on T3** (Argon under the new routing); WT p2-t12 on `p2/t12-card-stack`.
      - Then: a confirming review (Argon), the Opus second review (wallet), and the owner's yes.
    - CI run 42741688287 never started (billing, 0 steps run). Once the owner fixes it: `gh run rerun 42741688287 --repo mygogocash/jotbun`.
  - Each task's catalogue sections go in a list file of its own, with one spread in `dev/catalogue/wallet/index.ts` at its own anchor (not in `kitSections.tsx`).
- **P2-T20** (4be9ff30; WT p2-t20 on p2/t20-wallets-list), the wallets list, the archived list and reorder, depth 14 (the deepest ready task). The planner (Opus xhigh) was dispatched at 09:09, when P2-T14's planner finished.
  - It carries #391's `setOrder` caller notes (n3, n4, n5), P2-T19's double-send note and the host-tray rules.
  - It plans `ReorderTray` on tray-hardening's `real/` files, and its `index.ts` spread after P2-T14's, proven to merge in either order or stacked on P2-T14.
  - `app/spend/wallets.tsx` is a route, so its gate has `typecheck:routes`; CI runs the exports.
  - **Brief READY at 10:05 (L), proven on dbfde7d with tray-hardening's and P2-T14's files laid over.**
    - New: 6 files under `src/wallet/wallets/` and `walletListSections.tsx`. The route `app/spend/wallets.tsx` changes.
    - Shared:
      - `index.ts`: its spread goes after P2-T14's, so its diff applies only once P2-T14 has merged;
      - `PlanningRoutes.render.test.tsx`: it mocks the new screen, since the route now loads `expo-crypto`.
    - P1 to P18 are accepted.
      - P4: one order, `frontFirst`. Each press calls `setOrder` once with a new array, and nothing seeds it from an effect.
      - P6: unarchive goes through P2-T19's hook with a ref guard.
      - P9: two `as Href` casts stay until P2-T21 and P2-T22 add their routes.
      - P5: จัดเรียง is hidden with no account open.
    - Kit `scratch/p2-t20-planner/`: 38 OK; its `index.ts` diff applies on P2-T14's `real/`. RED 4 of 4 Node and 13 of 16 render; 84 of 84 mutants. The gate includes `typecheck:routes` and `export:web`.
  - **HELD until tray-hardening (#392) and P2-T14 merge** (Step 0 checks both by content). When both have merged: check_kit, create WT p2-t20, and dispatch the implementer with P1 to P18 accepted.
- **The server lane: two planners dispatched at 08:15 from c8929f2 (Opus xhigh):**
  - **fix-download-aborts** (46ff8a6d; WT fix-download-aborts on fix/download-aborts): R97's `waitUntil` fix for every vault download, with a `wrangler dev` proof, plus every review pin followups.md gives it. It may split the test-only pins into `briefs/download-pins.md`. It must land before 1B-T13.
    - **READY at 09:39 as two briefs that share no file** (they can run in parallel and merge in either order; together: 12 workers files, 392 passed and 1 todo):
      - **A, `briefs/fix-download-aborts.md` (M).**
        - Files: new `src/v1/files/slots.ts` (`untilReturned`) and `test/workers/download-aborts.test.ts` (5 cases); shared `downloads.ts`, `receipts.ts`, `uploads.ts` and `handler.ts` (awaited `headOf` returns).
        - The `wrangler dev` proof: on the base, export, snapshot-chunk and receipt downloads each answer 503 after four aborted GETs; with the fix each is served whole (3 of 3).
        - Retains and uploads do not leak locally (wrangler runs a handler on after its client leaves). Their wrappers rest on Cloudflare's documented cancellation (P3, P4).
        - P1 to P11 are accepted, **P4 included**: the upload's place takes the wrapper too. Kit `scratch/fix-download-aborts-planner/`: check_kit at d1111f8 gives 31 OK, and the 4 `orig/` files are identical. 9 of 9 mutants.
        - The implementer (Haiku max, c5d323ab) was dispatched at 09:39 in a pre-installed (`install-edge`) fix-download-aborts from d1111f8, under the heavy lock.
        - **DONE at d0cc479 (base e7b61d7); PR #396 opened at 09:49 (no task issue).** RED 5 of 5, GREEN 5 of 5, 9 of 9 mutants; AFFECTED 11 files, 335 passed and 1 todo; `test:edge` 176; `build:edge` with every driver marker at 0. The `wrangler dev` proof on its tree: export, chunk and receipt served whole after four aborted GETs; retain 200 after four aborted; upload 202 after sixteen aborted. The controller checked the 6 files against the kit's `real/` (edge-relative paths) and the clean merge with the head.
        - **The review runs as a two-lens Opus workflow** (run wf_49c67ce8-b3f, task wp4pexu50), lenses one after the other: the fix and its proof; the tests, shared files and CI. On approval and green CI: `merge_task_pr.sh 396 d0cc479` (no task id), then `promote_pr.sh fix-download-aborts 396`. CI run 42745408105 never started (billing, 0 steps run); rerun it once the owner fixes billing.
        - **The review approved at 14:33** (`reviews/fix-download-aborts.md`): no blocker or major, one minor and seven nits.
          - The `wrangler dev` proof reproduces on the commit, Cloudflare's docs are quoted correctly, and 9 of 9 mutants are killed.
          - #394, #396, #397 and #398 change disjoint files; the merged runs pass.
        - **The controller folded m1, n2, n3 and n4 into a test-only fix round on #396:** probes PB, PA and PC kill R14, R11 and R13, and the slot cases' `take()` moves inside the `try`.
          - The fix-download-aborts planner (thread 46ff8a6d, run 3, from 14:33) writes `briefs/fix-download-aborts-fix.md`, with kit `scratch/fix-download-aborts-fix-planner/`.
          - n1 is a hosted check; n5 and n6 go to 1B-T13; n7 (#398's receipt lines) is in followups.md.
        - **Fix brief READY** (found on disk at 15:18): `briefs/fix-download-aborts-fix.md`, kit `scratch/fix-download-aborts-fix-planner/` (9 OK; its `orig/` test file equals the branch at d0cc479).
          - P1 to P7 are accepted.
            - P1: PC becomes a line in each download case.
            - P2: PB is made deterministic.
            - P4: the case takes its own slots inside the `try`.
            - P5: 7 cases; CI's delta becomes workers +1 file and +7 passed.
            - P6: 14 of 14 mutants.
          - **The fixer waits on T3** (Argon); then a confirming review (Argon). #396 is not money or privacy, so it merges on green CI.
      - **B, `briefs/download-pins.md` (L, test-only).**
        - It edits `test/workers/exports.test.ts`, `attachments.test.ts`, `snapshots.test.ts`, `imports-review.test.ts` and `ai.test.ts`, with every review pin from the followups entry (the table in brief A).
        - Kit `scratch/download-pins-planner/`: check_kit at d1111f8 gives 20 OK, and the 5 `orig/` files are identical. GREEN 242 of 242, 20 of 20 mutants.
        - **Waits for a free slot.** Suggested WT download-pins on fix/download-pins. Read its planner calls before dispatch.
        - It pins `attachmentsDueAt`'s guards, which alarm-hardening's m4 rewrites: whichever merges second keeps both.
        - P1 to P11 are accepted. **The implementer (Haiku max, e43773f5) was dispatched at 10:05** in a pre-installed (`install-edge`) download-pins on fix/download-pins from 6a727dc, under the heavy lock. Its RED and mutation runs mutate source files: after a cut-off run, restore them with `git checkout`.
        - **DONE at 3894e58 (base 402c1df); PR #397 opened at 10:16 (no task issue).**
          - RED: the 17 review mutants together fail exactly 20 cases. GREEN 242 of 242. 20 of 20 mutants.
          - `test:edge` 176; `build:edge` with every driver marker at 0. No source file changed.
          - The controller checked the 5 files against the kit's `real/` and the clean merge with the head.
        - **The review runs as a two-lens Opus workflow** (run wf_e153ae48-9d5, task wrj8alejz), lenses one after the other:
          - do the pins pin what the reviews asked;
          - robustness, and the merges with #396 and with alarm-hardening's `real/` files.
        - On approval and green CI: `merge_task_pr.sh 397 3894e58` (no task id), then `promote_pr.sh download-pins 397`. CI run 42748341937 never started (billing, 0 steps run); rerun it once the owner fixes billing.
        - **The review approved at 15:04** (`reviews/download-pins.md`): no blocker or major, one minor and three nits.
          - Every home-table row has its case, each failing under its review's mutant; RED gives exactly the 20.
          - The merges with #396 and #398 are clean (247, 165 and 247 passed).
          - The controller fixed n3 (receipt, **ac61350**, now #397's head). m1, n1 and n2 are in followups.md.
        - **Merge on green CI** (not money or privacy; the usual rule): `merge_task_pr.sh 397 ac61350`, then `promote_pr.sh download-pins 397`. Expect workers +0 files and +19 passed.
  - **1B-T12** (373c38a4; WT p1-1b-t12 on p1/1b-t12-files-parity), the files parity session against NestJS.
    - Docker stays stopped: CI's edge job runs `test:edge:db`. The planner reports BLOCKED if it truly needs a local PostgreSQL.
    - It decides n8 (the vault's 404 against NestJS's 30-day `expired`).
    - **Brief READY at 08:58 (S; proven on c8929f2's edge tree). It changes no vault code**: with background work off, the vault already gives the 40 answers the planner traced through the API's code.
      - Files: new `test/support/files-session.ts` and `test/vault-parity-files.db.test.ts`; modified `test/parity-files.db.test.ts` and the shared `test/support/vault-worker.ts`; the receipt.
      - P1 to P11 are accepted.
        - P1: the vault half is proven by local smokes in workerd. The NestJS comparison itself runs only in CI's `edge` job (`test:edge:db`).
        - P3: n8 is listed, not changed (optional follow-up in followups.md).
        - P4: a third case pins B13's config.
      - Kit `scratch/1b-t12-planner/`: check_kit at cb9913c gives 58 OK, and the 2 `orig/` files are identical. The planner's proof: 12 of 12 mutants.
      - Its completion notice never reached the controller either; the result was read from the thread.
    - The implementer (Haiku max, 86c3bab3) was dispatched at 09:00 in a pre-installed (`install-edge`) p1-1b-t12 from cb9913c, under the heavy lock for workerd runs.
    - **DONE at ef37c41 (base a58ea2a); PR #394 opened at 09:12 (issue #116).**
      - RED: 2 of 4, with steps 3, 5, 15 and 17 listed and B13 failing on `workflows`. GREEN: 4 of 4 in three runs.
      - The money smoke gives 49 statuses. 12 of 12 mutants. `test:edge` 15 files and 176 tests. `build:edge` with every PostgreSQL marker at 0.
      - The controller checked the 4 files against the kit's `real/` and the clean merge with the head.
    - **The real NestJS comparison runs only in CI's `edge` job (`test:edge:db`),** which waits on the billing fix. Do not merge before that job is green, even with an approving review.
    - CI run 42741146172 never started (billing: every job has GitHub's annotation, with 0 steps run). Once the owner fixes it: `gh run rerun 42741146172 --repo mygogocash/jotbun`.
    - **The review runs as a Sonnet workflow** (run wf_0443a275-2f4, task wfw8gewvt), with two lenses one after the other:
      - A re-derives NestJS's 40 answers from `apps/api`, without trusting Appendix B;
      - B covers the tests and the harness.

      A skeptic checks each blocker or major, and a synthesizer writes `reviews/1B-T12.md`.
    - On approval and a green CI: `merge_task_pr.sh 394 ef37c41 1B-T12`, then `promote_pr.sh 1B-T12 394`.
    - **The review approved at 10:11** (`reviews/1B-T12.md`): no blocker or major, one minor and eight nits. Lens A re-derived all 40 NestJS answers; they hash identically to `expected-nest.json`. One link is unobserved: that NestJS answers what its code reads as. That is CI's `edge` job.
    - **The controller folded m1, n4, n5 and n6 into a fix round on #394,** since CI cannot run before billing is fixed:
      - m1: six sanity assertions, so a comparison cannot pass when both sides fail alike (probe V1);
      - n4: the R92 message;
      - n5: pin the default background `'on'`;
      - n6: `persistTo` is no longer leaked.

      The 1B-T12 planner (thread 373c38a4, run 3, from 10:11) writes `briefs/1B-T12-fix.md`, with kit `scratch/1b-t12-fix-planner/`. The other nits are in followups.md (1B-T13; snapshot-parity-window).
    - The merge then waits for the fix round's confirming review and a green `edge` job, at the fix round's head (not ef37c41).
    - **Fix brief READY at 14:00** (`briefs/1B-T12-fix.md`; kit `scratch/1b-t12-fix-planner/`, 64 OK, and its 4 `orig/` files equal the branch at ef37c41). It is test-only.
      - m1 and n4 go in `vault-parity-files.db.test.ts`; n5 is a new case in `vault-parity.db.test.ts` (CI count 3); n6 is in `vault-worker.ts`. The receipt's P3 is corrected.
      - F1 to F6 are accepted. F1: `nestRun[i]?.status`.
      - Proven through a scratch-only harness that replays NestJS's answers:
        - RED on ef37c41: V1 passes 3 of 3, and O1 fails nothing;
        - GREEN: V1 fails with `expected 404 to be 202`, and O1 fails the new case;
        - 19 of 19 mutants.
    - **The fixer (Haiku max, 45781f76) was dispatched at 14:00** in the p1-1b-t12 worktree, under the heavy lock (`test:edge` included).
    - After DONE: push, update #394's body, and run a confirming Sonnet review. Then merge at the new head once the `edge` job is green.
    - **Fix round DONE: merge 68fcbc8, then fix commit 317cf3a**, pushed at 14:16; #394's body is updated.
      - RED on ef37c41: V1 and O1 survive, and the n6 probe leaks a store. GREEN; 19 of 19 mutants; `test:edge` 176 under the lock.
      - The three test files match the fix kit's `real/`. The receipt differs only by its merge line and Deviations bullet.
    - **The confirming Sonnet review runs as a workflow** (run wf_765ee63d-ccc, task w4x5ksd33), writing `reviews/1B-T12-confirm.md`.
    - **The confirming review approved at 14:42** (`reviews/1B-T12-confirm.md`): all five fixes hold, V1 and O1 are killed, and there is no minor; six nits.
      - The controller fixed the receipt's stale Files line in **d853122** (docs only), now #394's head.
      - **Merge once the `edge` job is green:** `merge_task_pr.sh 394 d853122 1B-T12`, then `promote_pr.sh 1B-T12 394`. Expect `test:edge:db` to list vault-parity-files 3, parity-files 1 and vault-parity 3.
      - **The merge order (confirm-n6):** read the `edge` job of whichever of #394, #396 and #398 merges last, on a head that holds all three.
      - The real NestJS comparison is still unobserved until that job runs.
    - **On approval and a green `edge` job:** `merge_task_pr.sh 394 317cf3a 1B-T12`, then `promote_pr.sh 1B-T12 394`. The push's CI run 42774078632 was refused for billing (0 steps run); rerun that one after the fix.
  - **alarm-hardening** (a37bdb47; WT alarm-hardening on fix/alarm-hardening), 1B-T11's m1, m2, m4 and nits n1 to n5 and n9. The planner (Opus xhigh) was dispatched at 08:58, when #391's review freed a slot.
    - It edits `jobs.ts`, `user-vault.ts` and `files-alarm.test.ts`, and for m4 `attachments.ts` (`attachmentsDueAt`) and `previews.ts` (`importsDueAt`).
    - fix-download-aborts pins those two functions' guards in its own test files. The planner was told to keep the guards exactly and to name the lines it changes, so the two merges can be ordered.
    - **Brief READY at 10:07 (M), proven on cb9913c's edge tree.**
      - Files: `jobs.ts`, `user-vault.ts`, `attachments.ts` and `previews.ts`; new migration `0004_alarm_bounds.sql`, with `migrations/index.ts` and `schema.ts`; `cloudflare-workers.d.ts` (`rowsRead`); `files-alarm.test.ts` and `vault-schema.test.ts`; the receipt.
      - P1 to P14 are accepted, with **P6 recorded as R105** (`attachment_checks`, filled by four triggers).
        - P1: `pruneSnapshots` runs last.
        - P4: a held guard reports `delete_objects`.
        - P5: `rearm`'s `.catch` clears `alarmAt` only if it still names that alarm.
        - P7: `entity_heads_imports_idx`.
        - P10: the prune list calls its functions at run time.
      - At the review's sizes, `reschedule`'s per-write block goes from 1.7 ms to 0.04 ms (rows read 10,001 to 2, and 6,006 to 6).
      - Kit `scratch/alarm-hardening-planner/`: check_kit at 402c1df gives 45 OK, and the 9 `orig/` files are identical. RED 9 of 49, GREEN 49, 28 of 28 mutants. The vault bundle grows by 5.53 kB.
      - Lines changed against download-pins' pins: `attachments.ts` 346, 354, 365 and 369 (DU-1's guard at 370 untouched); `previews.ts` after 328, and 333, 344-345 and 347 (188 untouched). DU-1 and DU-2 pass on its code.
    - **The implementer (Haiku max, 949cad13) was dispatched at 10:07** in a pre-installed (`install-edge`) alarm-hardening on fix/alarm-hardening from 402c1df, under the heavy lock.
    - Housekeeping later: its P11 correction of 1B-T11's P14 (n9; `receipts/1B-T11.md:82`). This task's receipt carries it; a one-line note in 1B-T11's receipt is optional.
    - **DONE at 14844b9 (base 06fdd97); PR #398 opened at 13:51 (no task issue).**
      - RED 9 of 49 (on a table-only 0004 stub), GREEN 49 of 49, 28 of 28 mutants with verdicts matching the planner's.
      - AFFECTED: 9 files, 261 passed and 1 todo. `test:edge` 176. The vault bundle is 1,676.57 kB.
      - The controller checked the 10 files against the kit's `real/` (edge-relative paths) and the clean merge with the head.
    - **The review runs as a two-lens Opus workflow** (run wf_3bcd2a1e-88c, task w64paq5ys), lenses one after the other:
      - the alarm rules and 0004's schema change (R105);
      - the tests, and the merges with #397, #396 and #394.
    - On approval and green CI: `merge_task_pr.sh 398 14844b9` (no task id), then `promote_pr.sh alarm-hardening 398`. CI run 42771332803 never started (billing, 0 steps run); rerun it once the owner fixes billing.
    - **The review approved at 15:01** (`reviews/alarm-hardening.md`): no blocker or major, one minor and six nits.
      - 0004's triggers cover every event the vault's statements make, and the backfill is right on an upgraded vault.
      - The merges with #397, #396 and #394 are clean, and 1B-T12's session answers the same with 0004 applied.
      - The controller fixed n1 and n2 (R105 and R104), n5 (receipt, **3707c29**, now #398's head) and n6 (this file).
      - m1, n3 and n4 are test-only: the alarm-pins follow-up, or a fix round once T3 is back (followups.md).
    - **Merge, under the new rule** (privacy-adjacent: receipt retention): when CI is green, ask the owner with a recommendation, then `merge_task_pr.sh 398 3707c29`. The money and privacy second review (Opus on Antigravity) also applies.

## PR #371: the integration branch into main. The owner merged it on 9 Nov, 21:30 Bangkok, as afcf884
- It was merged with a merge commit, so history is kept. The controller then fast-forwarded claude/p1a-vault-core to afcf884, which adds main's README and CHANGELOG, so the two branches were level.
- **From now on (owner's ask, 9 Nov): one small PR into main per merged task**, not one big integration PR.
  - Right after `merge_task_pr.sh`, run `bash scripts/promote_pr.sh <task-id> <pr>`. It pushes `promote/<task>` at the task's merge commit and opens the PR into main, with the task's summary, review and CI.
  - The owner merges them in order. Never merge into main as the controller.
  - `.claude/**` is marked `linguist-generated` (f4cb34b), so controller files collapse in those diffs.
  - **Stacked (owner's ask, "maximize github stack"):** each promotion PR is based on the newest open one and linked with `gh stack link` (github/gh-stack v0.3.0 is installed), so its diff is one task. The owner merges bottom-up, or with `gh stack merge <pr>`, an atomic merge up to that PR.
  - If the repo turns out not to support native stacks, the chained bases still form a manual stack and the script warns.
  - Repo settings were left as they are (`delete_branch_on_merge` is false). The controller deletes merged branches itself.
- **#70** (claude/jotbun-redesign-plan) is superseded and still open. Closing it is the owner's call.
- **The main checkout's uncommitted reminder edits** need no commit. They are #359's work, apart from the `previewDay` TODO stub that #359 filled in.

## Takeover on the owner's machine (9 Nov, from 08:40 Bangkok): READ THIS FIRST

New controller: session 121af0e6, in the Orca app (Claude Code 2.1.319; transcripts under `~/Library/Application Support/orca/claude-profiles/c0f6e42a-811f-4ea2-9daa-9fb9378005cf/home/projects/-Users-kunanonjarat-Developer-jotbun/`). The owner calls the old controller "the session from Super Engineering" (the app behind `~/.superconductor`).

- **The old controller is dead.** Nothing has reached GitHub since 20:19 on 8 Nov: 5dbd7be, and #356 at 020aa84. On this machine, Super Engineering session 66ebaff3 ("continue what you left", 06:36 today) saw only this machine's stale 8 Nov 17:10 state, because gh auth had failed. It restarted three agents (the 1C-T5 round-3 check, the 1A-T8b follow-up brief and the parser-regex brief). All three were stopped at 06:41, and their work had already merged elsewhere, so none of it is used.
- **Local state was replaced from GitHub.** This machine's old `.claude/controller` (the 17:10 state plus 9.8 GB of scratch) is now `.claude/controller-stale-20261108-1710`. The committed state from 5dbd7be was extracted in its place, with `.claude/skills`. Delete the stale folder when nothing more is wanted from it.
- **Worktrees.** The worktrees of eight merged tasks are removed with their local branches: fix-flaky-tests, p1-1b-t4, p1-1c-t1, p1-1c-t5, p2-t5, p4-t10, p5-t4 and p6a-t1. `agent-a4e4cbbb8ea6b2a9c` is not a controller task and holds 11 uncommitted edits, so it is left for the owner.
- **Harness: no effort setting.** Orca's Agent tool takes `model` but has no `effort` parameter, so agents run at the session's effort. Opus still plans and reviews and Haiku still implements. To restore per-agent effort, add `.claude/agents/*.md` definitions with `effort:` in the frontmatter; they load at session start.
- **sync_state.sh drops `*.log` files** (they are gitignored). The 1B-T6 kit lost its 8 proof logs (`proof/*.log`); every other line of its SHA256SUMS verifies (49 OK). Tell 1B-T6's implementer to check the sums without those lines.
- **App-suite baseline at 5dbd7be**, measured in p1-1c-t6 before dispatch (`scratch/baseline-5dbd7be/summary.txt`): test:app 32, test:unit 880, render 89 files and 1649 tests, web 4775 modules, iOS 5563 modules. The old controller's adjusted 1D-T6 totals were low by 2 (unit) and by 1 (web, iOS).
- **Task deltas** (from the briefs, P2-T2's receipt and 1D-T9's corrected receipt):

  | Task | app | unit | render files | render tests | web | iOS |
  | --- | --- | --- | --- | --- | --- | --- |
  | 1D-T9 and its fix | 0 | +2 | +1 | +45 | | |
  | 1C-T6 | +1 | +7 | +1 | +11 | | |
  | 1D-T6 | +1 | +12 | +3 | +12 | +7 | +185 |

  Whichever of these merges second gets the first one's tests on top.

In flight (this controller; dispatched 09:05 to 09:10, prompts in `scratch/dispatch/` and in this session's transcript):
- **#356 1B-T5:** merged 38361b1 (09:2x). The confirming review approved (`reviews/1B-T5-confirm.md`; two nits are in followups.md). Issue #109 is closed and the worktree and branches are removed.
- **1B-T6 (Haiku), worktree p1-1b-t6, branch p1/1b-t6-exports, base 38361b1.** Prompt in `scratch/dispatch/1B-T6.prompt.md`. Its amendments:
  - Check the kit's sums without the 8 missing `proof/*.log` lines: 49 OK.
  - #352 changed `test/vault-route-coverage.test.ts` and `test/workers/sync.test.ts`. The controller's pre-applied copies (planner diffs plus #352's lines) are in `scratch/1b-t6-rebased/`, with SHA256SUMS.
  - Gate: test:edge 15 files and 176 tests; workers 25 files, 521 passed and 3 todo.
  - It BLOCKED at Step 6.4 on the `node-postgres` count (1, from #352's comment). Ruled R95 and resumed with SendMessage. Everything before that passed: 176 / 521 + 3 todo, 27 of 27 mutants.
  - DONE at 34798c8. PR #362 is open (issue #110) and the Opus review is under way (`reviews/1B-T6.md`).
- **Planners dispatched (Opus, ~09:55):**
  - **P2-T8**, the wallet test harness (depth 20, the deepest ready task): brief READY, P1 to P12 accepted.
    - The implementer was dispatched about 15:45 in p2-t8 from cc859ad (generated prompt).
    - Expected: app 33, unit 894, render 94 files and 1712 tests, web 4785.
  - **1B-T9**, receipt attachments (depth 15): planned on top of 1B-T6's 34798c8, and starts after #362 merges. `briefs/1B-T9.md`, kit `scratch/1b-t9-planner/`, WT p1-1b-t9 on p1/1b-t9-receipt-attachments. It also answers whether the vault has the API's R-B copy race.
  - **1A-T10**, CI, docs and the phase 1A receipt: `briefs/1A-T10.md`, kit `scratch/1a-t10-planner/`, WT p1-1a-t10 on p1/1a-t10-ci-docs.

  Prompts are in `scratch/dispatch/`. Planners keep `*.log` out of the SHA256SUMS the implementer checks.
- **Usage-limit cutoff, 9 Nov about 10:15 to 13:30.** Every agent failed with a 429 and was resumed with SendMessage at 15:15, from its saved context.
- **1B-T6: merged de738f9 (#362, about 17:45) under R97.** The confirming review (`reviews/1B-T6-confirm.md`) found the fix round correct, re-proved under `wrangler dev`, and raised MA-1, now a follow-up task. Issue #110 is closed and the worktree and branches are removed. The receipt was corrected in housekeeping commit 2e65476.
- **1B-T9: merged 5b7609e (#366, about 19:30).** The review approved; its minors m-1 to m-3 are folded into fix-download-aborts with ready probes. Issue #113 is closed and the worktree and branches are removed. **Edge baseline now:** test:edge 15 files and 176 tests; workers 26 files, 576 passed and 3 todo.
- **Planners dispatched about 19:35 (Opus, generated prompts):**
  - **P2-T9** (motion, depth 19): WT p2-t9 on p2/t9-motion.
  - **P2-T10** (money text and private mode, depth 19): WT p2-t10 on p2/t10-money-text.
  - **1B-T10** (import review, depth 14): WT p1-1b-t10 on p1/1b-t10-import-review.

  P2-T9 and P2-T10 share no files with each other or with 1C-T8. 1B-T8 and 1B-T7 share 4 route files with 1B-T10, so they follow it in order. fix-download-aborts is still to plan, before 1B-T13.
- **Second usage-limit cutoff, about 18:00 to 18:40.** The P2-T8 reviewer and the 1C-T8 planner were resumed with SendMessage at 18:45. The lock was free and no processes were left.
- **#362 history:** review Needs fixes (`reviews/1B-T6.md`, M-1: a HEAD on the download route keeps a download slot for good).
  - R96, as amended: `headOf` reads the dropped body to its end.
  - The fix round (Haiku) was dispatched about 16:20 in p1-1b-t6 at 34798c8, with a generated prompt.
    - Brief: `briefs/1B-T6-fix.md`; kit: `scratch/1b-t6-fix-planner/` (12 OK at 34798c8).
    - Expected: RED 1 failed of 36; GREEN 36 of 36; 4 of 4 mutants; test:edge 15 files and 176 tests; workers 25 files, 524 passed and 3 todo.
  - Fix round DONE at 2cf8315: RED 1 of 36, GREEN 36 of 36, 4 of 4 mutants, workers 524 + 3 todo. Pushed to #362 and the PR body updated.
  - The confirming Opus review is under way, writing `reviews/1B-T6-confirm.md`. Merge on its approval and green CI with `merge_task_pr.sh 362 2cf8315 1B-T6`, then dispatch 1B-T9 (amend its Step 0.4 to `pipeTo(`).
  - The fixer's zsh `status=$?` aborted a lock release; make_prompt's lock text now says to use `rc`.
- **1A-T10: merged 4407025 (#363, about 16:40).** The review approved with 2 minors and 7 nits; issue #104 is closed and the worktree and branches are removed. Phase 1A's tasks are all merged.
  - The receipt's open items were completed in housekeeping commit 9cc31cb.
  - Minor 1 (workflow `if`/`continue-on-error`) is carried to P6C-T7.
  - Waiting on the owner: whether to run the plan's whole-1A-range review (P11). Epic #83 stays open until 1D-T15's phase proof.
  - P11: the plan's whole-1A-range review is the controller's to schedule after 1A-T10's own review.
  - Closing epic #83 is the owner's call.
- **Third usage-limit cutoff, about 19:45.** The owner's credit reset at 19:50. 1C-T8's implementer and the 1B-T10 planner were resumed; the P2-T9 and P2-T10 planners had stayed alive.
- **1B-T10: merged 2ffd195 (#369, about 23:45).** The review approved; m-1 and m-2 are folded into fix-download-aborts. Issue #114 is closed and the worktree and branches are removed.
  - **Edge baseline now:** test:edge 15 files and 176 tests; workers 27 files, 638 passed and 3 todo.
  - The 1B-T8 planner was told its base has merged.
- **1B-T10 history:** brief READY (L; P1 to P19 accepted). The implementer (Haiku) was dispatched about 21:50 in p1-1b-t10 from 9d48ba3.
  - Expected: test:edge 15 files and 176 tests; workers 27 files, 638 passed and 3 todo.
  - P2 widens `confirmPrepare`'s answer with `refused`, for the API's 503.
  - P19 extends 1A-T8a's and 1B-T5's pinned lists additively.
  - 1B-T8 and 1B-T7 follow in this lane, after its `// 1B-T10` entries.
- **P2-T10: merged 51be132 (#370, about 00:05).** The review approved. m1 (a failed read shows hidden amounts) and m2 go to the private-mode-hardening follow-up, before the wallet area's E2 approval. Issue #156 is closed and the worktree and branches are removed.
  - **App baseline now**, measured by P2-T10's reviewer on its merge with 5c7a380, which holds 1C-T8 and P2-T9: app 34, unit 922, render 106 files and 1842 tests.
  - Web is not measured on the combined head. 1C-T8 and P2-T10 each added 3 modules to 4785, so measure it with `scripts/baseline.sh` before the next app dispatch.
- **P2-T10 history:** brief READY (M; P1 to P16 accepted). The implementer (Haiku) was dispatched about 21:40 in p2-t10 from bf7bc20.
  - Expected: app 34, unit 907, render 97 files and 1741 tests, web 4788.
  - E2-A notes (P9): the hidden eye has no filled state; the tip uses toast colours, not the board's #3A57E8; P2-T9's 150 ms fade is not wired yet.
- **P2-T9: merged 860990f (#368, about 22:00).** The review approved; m-1 and m-2 go to the next wallet/motion task. Issue #155 is closed and the worktree and branches are removed.
  - **App baseline now** (CI on #368's merge ref): test:app 34, test:unit 905, render 97 files and 1735 tests, web 4785.
  - #367 (1C-T8) touches none of P2-T9's files.
- **P2-T9 history:** brief READY (M; P1 to P14 accepted); the implementer (Haiku) was dispatched about 20:15 in p2-t9 from f9d32b4.
  - Expected: app 34, unit 905, render 97 files and 1735 tests, web 4785.
  - E2-D note: fades keep Reanimated's default curve, while the board says ease-out and the plan names durations only.
- **1C-T8: merged 6fbe9a8 (#367, about 23:20)** after the fix round R98 and R99. The confirming review approved; its m1 is carried to 1C-T9. Issue #125 is closed and the worktree and branches are removed.
  - **App baseline, computed** (4aa6cf1's counts plus P2-T9's): app 34, unit 916, render 104 files and 1824 tests, web 4788.
- **1D-T8: brief READY** (M, 18 files; P1 to P13 accepted). The implementer (Haiku) was dispatched about 01:05 in a pre-installed p1-1d-t8 from ba916cb, with the R100 fast gate.
  - It adds `pendingNo()` to 1D-T1's controller, because the plan's caption had no source.
  - **E2 note:** "stopped on this phone" shows briefly while a no is being sent.
  - Privacy's transport gains the analytics-off header. The receipt and import transports are left for P4.
  - Deltas for CI: unit +5, render +2 files and +23 cases, web +3.
- **#367 history:** review Needs fixes (`reviews/1C-T8.md`; CI green on 5e8b70e).
  - M1: the session-ended screen strands an email-only account. R98 offers an email code to another address under "Use another way".
  - R99: no navigation to 1C-T9's unbuilt route; the in-place reminder step stays.
  - The round also covers m1 (seven guard tests), m3 (copy slips) and the receipt's E2 owner questions (m2, m4).
  - The fix brief is READY (`briefs/1C-T8-fix.md`, kit `scratch/1c-t8-fix-planner/`, 51 OK at 5e8b70e). The fixer (Haiku) was dispatched about 22:15 in p1-1c-t8.
    - Expected: app 34, unit 912, render 102 files and 1812 tests, web 4788; 15 of 15 mutants.
    - Fix round DONE at 4aa6cf1, with every count matching. Pushed to #367 and the PR body updated.
    - The confirming Opus review is under way. Merge on its approval and green CI with `merge_task_pr.sh 367 4aa6cf1 1C-T8`. Then 1D-T8 can be planned in this lane.
- **1C-T8: brief READY** (L, 31 files; P1 to P16 accepted). The implementer (Haiku) was dispatched about 20:35 in p1-1c-t8 from 1ddc7f7, with a generated prompt.
  - Expected: app 34, unit 911, render 102 files and 1802 tests, web 4788. E2 screenshots are SKIPPED, with 22 catalogue deep links listed.
  - The brief's "For the controller": 1C-T5's leftover-cookie recovery needs a `credentialProvider.ts` change that amends R86; the "Sign in again" flicker comes from the sync outcome. Both are for a later 1C task.
  - 1D-T8 follows it in the same lane (registry.tsx, featureFlags.ts).
- **1B-T8 planner (Opus), dispatched about 23:00.** It is planned on top of 1B-T10's dcdb773 (#369) and starts after #369 merges.
  - Brief `briefs/1B-T8.md`, kit `scratch/1b-t8-planner/`, WT p1-1b-t8 on p1/1b-t8-snapshots.
  - It carries the R96, R92, R95 and R97 notes, and the vault-active checks at read and publish.
- **P4-T12 (slip core) and P4-T13 (photos) planners (Opus), dispatched about 00:40 under R100.**
  - WT p4-t12 on p4/t12-slip-core; WT p4-t13 on p4/t13-photos.
  - P4-T12 carries 1D-T6's m4 (the analytics-off header on slip transports).
- **ci-parallel-jobs planner (Opus), dispatched about 00:55** at the owner's go-ahead: halve PR CI time by splitting jobs and sharding render, with no suite dropped.
  - It also takes 1A-T10's minor 1 (no `if:` or `continue-on-error:`), which was assigned to P6C-T7.
  - WT ci-parallel on chore/ci-parallel-jobs.
- **Owner's speed approvals (9 Nov):**
  - Sonnet for confirming and S-task reviews (`make_prompt.py --size S`).
  - `new_task_worktree.sh ... install|install-edge` pre-installs, so dispatch with `--installed`. A clone cache was dropped, because npm ci already takes about 15 s.
  - Faster CI, as above.
- **Held:**
  - 1B-T7 (AI routes) follows 1B-T8 in the server lane (the same route files).
  - fix-download-aborts follows 1B-T8 (downloads.ts). 1C-T2 and P3-T12 are still held on owner answers.
- **#354 1D-T9: merged 687e764 (about 10:00).** The confirming review approved (`reviews/1D-T9-confirm.md`; nits n1 to n4 are in followups.md for the m5 task). Issue #140 is closed and the worktree and branches are removed. The receipt's n5 was fixed in housekeeping commit 8a1f587.
  - **App baseline at 687e764**, measured by the confirming reviewer on the same tree: test:app 32, test:unit 882, render 90 files and 1694 tests, export:web 4778 modules. iOS was not measured: 5563 at 5dbd7be, plus 1D-T9's modules.
- **#354 history (fix round, Haiku, worktree p1-1d-t9):**
  - The merge now conflicts on `featureFlags.ts` and its test (#358). The controller resolved both, keeping both areas, in `scratch/1d-t9-merge/` (SHA256SUMS; `node --test` passes 11 of 11). The fixer copies them in Step 1.3.
  - Fix round DONE: merge 36adb96 (5dbd7be), fix ddc9317, and the controller's receipt correction 03da870. Every count matched: unit 882, render 90 files and 1694 tests, 45 of 45 mutants.
  - Pushed to #354 (MERGEABLE) and the PR body updated.
  - Confirming Opus review under way, writing `reviews/1D-T9-confirm.md`. Merge on its approval and green CI with `merge_task_pr.sh 354 03da870 1D-T9`.
- **1C-T6: merged f544c28 (#364, about 17:10).** The review approved: m1 is carried to 1C-T7, and an owner question is below. Issue #123 is closed and the worktree and branches are removed.
  - **App baseline now:** test:app 34, test:unit 901, render 94 files and 1717 tests (the reviewer and CI on the merged tree); web 4785.
- **P2-T8: merged 1502e65 (#365, about 19:00).** The review approved: m-1 is carried to P2-T11, m-2 to P2-T35. Issue #154 is closed and the worktree and branches are removed.
  - **App baseline now** (CI on #365's merge ref): test:app 34, test:unit 901, render 95 files and 1723 tests, web 4785 modules.
- **1B-T9: brief READY** (size L; kit `scratch/1b-t9-planner/`, with SHA256SUMS and SHA256SUMS.logs). It starts only after #362 merges with R96's fix round; its Step 0 checks that `headOf` cancels the body.
  - Expected: workers = the head's own count plus 1 file and 52 cases; Node +0.
  - R-B does not reach the vault (one transaction).
  - Planner calls to rule on at dispatch: P1 (the copy's 3-minute deadline is checked before publish), P3 (copy slot before prepare, as the API does), P11 (imports `attachments.service`, +33 kB, no driver).
- **1C-T6 history (Haiku), worktree p1-1c-t6:** base files are byte-identical at 5dbd7be (20 of 20). Expected: app 33, unit 887, render 90 files and 1660 tests.
- **1D-T6: merged 9a4a2f1 (#361, about 10:25).** The review approved with minors m1 to m4 (`reviews/1D-T6.md`; all in followups.md, and m1 is an owner question, below). Issue #137 is closed and the worktree and branches are removed.
  - **Baseline measured at cecf3a5** (app code as at 9a4a2f1) with `scripts/baseline.sh`; summary in `scratch/baseline-cecf3a5/`:
    - test:app 33, test:unit 894, render 93 files and 1706 tests;
    - web 4785 modules, iOS 5751 modules;
    - test:edge 14 files and 174 tests; workers 24 files, 488 passed and 3 todo.

    These match the earlier computed values exactly.
  - **1C-T6 will conflict with it** in `api/client.ts` and `client.test.ts`, additively; keep both sides.
- **Shared file:** 1C-T6 and 1D-T6 both edit `api/client.ts` and its test, in different places. Whichever merges second merges the other first.
- **State push held:** no `sync_state.sh` push until the three implementers have passed their sync steps, because their prompts pin the head at 5dbd7be.

## Migration to another machine (8 Nov, about 21:20 Bangkok)

The owner moved to another machine. Every agent below ran on the old machine and dies with it; restart each from its brief or review (skill `.claude/skills/jotbun-controller`, "Taking over"). Nothing of value is only local: every task commit is pushed, and this folder (without the 25 GB scratch trees) is committed in the repo. Scratch kept: only `scratch/1d-t6-planner/` (final, orig, stubs, tools, registry, lockfiles, SHA256SUMS), because 1D-T6's ready brief needs it. Paths in these files are absolute (`/Users/kunanonjarat/Developer/jotbun`); if the repo lives elsewhere, `grep -rl /Users/kunanonjarat/Developer/jotbun .claude/` and fix them.

Integration head when this was written: a88fc84 (#357), after #355 (daf8a63) and #352 (e893255).

Open PRs and what each needs:
- #354 1D-T9: fix round dispatched (briefs/1D-T9-fix.md, proven: 45 of 45 mutants, full render 1664). If its commit is not on the PR, rerun the brief from the worktree (branch p1/1d-t9-conflict-choice). Then push, and a confirming review against reviews/1D-T9.md. Merge on green.
- #356 1B-T5: fix round pushed (merge be2f8f8, fix 020aa84: rejected photo keeps its issue, 13 tests, 11 of 11 mutants, workers 488 + 3 todo); confirming review by the original reviewer (aca49a5e) under way; CI running. Merge on green + approval, then dispatch 1B-T6.
- #358 P2-T2 merged 7273ee9 (issue #148 closed). Review note: iOS/Android builds made before it no longer launch (Gesture Handler's native module); the next device check needs `expo run:ios` or `expo run:android`. #354 will conflict on featureFlags.ts and its test: keep both (`'companion' | 'conflict' | 'wallet'`, both comments, both tests).
- 1D-T6 dispatched (Haiku) in worktree p1-1d-t6, branch p1/1d-t6-posthog-phone, base 7273ee9; adjusted totals: unit 890, render 92 files 1661, web 4781, iOS 5747 modules. If no commit is on that branch, rerun the brief.
- #359 reminder wording merged 4702c20 (the owner's uncommitted main-checkout work; the main checkout on claude/premium-ai-edge still shows those edits uncommitted on the old machine; they are now in claude/p1a-vault-core). The `previewDay` rule (TODO(owner)) is "the next reminder the person gets"; the owner may change it.

1B-T6 brief READY (briefs/1B-T6.md, kit scratch/1b-t6-planner/; built on 52632f2 + 1B-T5; dispatch only after #356 merges; Step 0 falls back to Appendix A for sync.test.ts and vault-route-coverage.test.ts, which #352 changed; planner calls P1-P14 accepted, including P2: the API export service's two names restated in exports.ts with a Node pin test, since it imports pg). 1C-T6 brief READY (briefs/1C-T6.md, kit scratch/1c-t6-planner/; P1-P17 accepted); Haiku implementer dispatched in worktree p1-1c-t6, branch p1/1c-t6-fresh-sign-in, base 4702c20. If no commit is on that branch, rerun the brief. 1C-T6 and 1D-T6 both edit api/client.ts in different places; whichever merges second rebases. After 1B-T6's brief: 1B-T9 (receipt attachments, also creates downloads.ts). Next ready tasks: `python3 -I .claude/skills/jotbun-controller/scripts/ready_tasks.py --inflight <ids>`.

## Takeover, 8 Nov 18:50
The controller session d32ab8e7 (chat "Resume Subagent Controller Merges") died at 18:41:46 with 9 agents in flight. New controller: session 2c0f7a73 (same superconductor profile, transcripts in `~/.superconductor/profiles/claude/926dc4b0-.../projects/-Users-kunanonjarat-Developer-jotbun/2c0f7a73-.../subagents/`). Each agent was restarted with its original prompt (saved in `scratch/takeover/<name>.prompt.md`), its predecessor's transcript (`tail_transcript.py` reads one) and its scratch folder:
- reviews: #350 parser regex (a3b125e5), #351 P5-T3 (abd2b493), #352 1A-T9 (a036e534; CI's parity test failed on steps 44/45, likely JSON key order, logs in scratch/takeover/), #353 1D-T10 (ab4449b0; its SQL job hit the R-B attachments flake, rerun it)
- briefs: 1B-T5 (rebased on 3ab4d0a, done 20:05; implementer a00dcda0 on Haiku in worktree p1-1b-t5, branch p1/1b-t5-uploads, base 52632f2, P1-P17 accepted), 1D-T9 (done 19:10; implementer af4bbd11 on Haiku in worktree p1-1d-t9, branch p1/1d-t9-conflict-choice, base 84ee167, P1-P13 accepted), P2-T19 (done 19:15; implementer ac8ad975 on Haiku in worktree p2-t19, branch p2/t19-wallet-commands, base 84ee167, C1-C8 accepted), P2-T2 (done 19:40; implementer aaa4e502 on Haiku in worktree p2-t2, branch p2/t2-packages, base 3ab4d0a; __DEV__ define and extra tests accepted; lands BEFORE 1D-T6), 1D-T6 (brief READY 20:55 on 3ab4d0a + P2-T2's patch; dispatch only after P2-T2 merges; R93 accepted)
To stop a chat session in the app: `sc chat stop <thread_id>` cancels its turn only; `sc chat list --worktree <path> --json` lists thread ids.

## Merged 8 Nov
#337 1D-T1, #330 keyboard fix, #338 test:ops date fix, #335 P2-T6, #331 P5-T1, #339 1A-T7, #344 1A-T8b, #336 P3-T1, #334 1C-T1, #343 P5-T4, #345 P4-T10, #342 flaky-test fix (R85, R88), #333 P2-T5, #341 1B-T4, #346 1A-T8b follow-up, #340 P6A-T1, #348 1B-T4 follow-up, #347 1C-T5, #349 API DB flakes. Issues closed, worktrees and branches removed.

## Open PRs (updated 19:05)
- #350 fix-parser-regex merged 52632f2 (worktree and branch removed; no task issue). Its review's six surviving mutants (X1-X4, X9, X10) go in a test-only follow-up under R89: brief being written by the reviewer (a3b125e5) at briefs/fix-parser-regex-followup.md, worktree fix-parser-regex-tests, branch fix/parser-regex-tests.
- #352 1A-T9 merged e893255 (issue #103 closed, worktree and branch removed); receipt housekeeping ad1fe18. Integration head ad1fe18.
- #357 parser-regex test follow-up (worktree fix-parser-regex-tests, no task issue): opened at b47bc6b; test-only, spec byte-identical to #350's reviewer's verified copy, so controller-checked instead of a second review; merge on green CI.
- New planners: 1B-T6 (aa86ac2f; built on top of 1B-T5's real/, starts after 1B-T5 merges; 1B-T9 is planned after it, both create downloads.ts), 1C-T6 (ad1c215e).
- P2-T19 and P2-T2 implementers hit the HistoryReturn load flake; told to rerun the full suite once (followups.md).
- Skill: .claude/skills/jotbun-controller/ (SKILL.md, references/, scripts/) holds the loop, templates, lessons and helper scripts.
- #356 1B-T5 (worktree p1-1b-t5, issue #109): opened 21:00 at d232654; review aca49a5e (reviews/1B-T5.md).
- #355 P2-T19 (worktree p2-t19, issue #165): opened 20:50 at 3a26545; review ab303690 (reviews/P2-T19.md).
- #354 1D-T9: review Needs fixes (M1: the old ConflictPanel flashes, live, while dropChoice is awaited; m1 missed choice when the diary is not ready; m3 five untested behaviours; m6 receipt arithmetic). R94 (narrow reading kept). Fix brief being written by the reviewer ab1a40dd (briefs/1D-T9-fix.md); CI green on 7f25a65.
- #352 1A-T9: R92 fix round done (6a4faf3) plus a receipt status correction (1df7551), pushed; PR body updated; CI running on 1df7551; confirming review a78301f7 (reviews/1A-T9-confirm.md).
- #353 1D-T10 merged 3ab4d0a (issue #141 closed, worktree and branch removed; minors in followups.md).
- #351 P5-T3 merged 84ee167 (issue #236 closed, worktree and branch removed; minors in followups.md).

## In flight
- Briefs: fix-parser-regex (R89, extended to readDateStyles), fix-api-db-flakes (3 API DB concurrency flakes, CI logs only), 1B-T5 (critical path), 1A-T9, 1D-T10, P5-T3, 1D-T9, P2-T19.
- Held: P2-T2 and 1D-T6 wait for #347 (lockfile, _layout). P3-T12 waits on owner Q1. 1C-T2 waits on the owner's lockout answer, and its brief must first pin 1C-T1's six untested security options (followups.md).

## Rulings this session
R104 (10 Nov, 1B-T11's P2): a write never arms the vault alarm sooner than a minute ahead (`CALL_ALARM_DELAY_MS`, 60,000 ms), and never postpones an alarm already set sooner. The alarm's own rearm is exact, or a minute out after a failed job (P3).
  - Why: workerd refuses `setAlarm` at or before 0, which every release asks for (`delete_after = 0`), and in the Workers tests an alarm due at once fires itself, racing about 40 existing cases.
  - A person never sees the minute, and a burst of writes becomes one alarm. Because a write can only move the alarm earlier, a stream of writes cannot starve the jobs.
  - Later vault tasks that reason about alarm timing must expect it.
  - **One exception (alarm-hardening's review, n2):** after a refused `setAlarm`, `rearm`'s catch sets `alarmAt` to null. The next write then skips the keep rule once, and an idle vault can be left with no alarm until its next call. Only a storage failure causes this, and the base was worse.

R105 (10 Nov, alarm-hardening's P6): the vault's `attachment_checks` table (migration 0004) lists every retained receipt that may have no holder, and `attachmentsDueAt` reads its safety net from that table alone.
- Four triggers fill the table, on every SQL statement: a receipt inserted before any record holds it, a receipt set back to retained, a last holder deleted, and a last holder moved.
- `pruneAttachments`' full pass over every retained receipt stays, once per alarm, and empties the table in the same block. A statement that bypassed the triggers is still found at the next alarm.
- A migration that rebuilds `attachments` or its holders' table must recreate the four triggers.
- **Not covered (alarm-hardening's review, n1):** `INSERT OR REPLACE`, `REPLACE INTO` and `UPDATE OR REPLACE` on `transaction_attachments` remove a holder without firing a delete trigger (`recursive_triggers` is 0). B20 and 0004 both miss such a receipt until the next full pass. No vault statement uses these forms today; do not add one without a trigger for it.
- `importsDueAt` reads the partial index `entity_heads_imports_idx`, whose terms its WHERE names literally (`LIVE_IMPORT_HEADS`).

R103 (10 Nov, P2-T11's gate): when a local whole-file run cannot finish because the machine sleeps (`pmset -g log`: "Dark Wake Thermal Emergency"), and every case has a passing run, the whole-file run goes to CI under R100.
  - "Every case has a passing run" means the failures are timeouts across recorded sleeps, and a targeted rerun of the failing cases passes.
  - The receipt records each run, the targeted rerun and the sleep times.
  - First used for `CatalogueScreen.render.test.tsx` (301 cases): runs of 298 and 300, then 4 of 4 targeted.
R102 (9 Nov, P4-T12's P2; binds P4-T6): the phone sends a slip batch as the UTF-8 bytes of its JSON, typed `application/octet-stream`, as the import upload sends its file.
  - P4-T6's handler reads at most 8 MiB of `w.stream`, accepts `application/octet-stream`, and parses the text with the contract's `parseSlipBatchRequest`.
  - A body typed `application/json` cannot work: the dispatcher's `readRouteBody` parses it (`readJsonBody`, capped at 2 MiB, 413 `COMMAND_TOO_LARGE` above that), and a stream route is then left with no stream. P4-T13's batches are up to 8 MiB.
  - P4-T6's planner decides what a JSON-typed body answers.
R101 (9 Nov, 1B-T8's P4): a snapshot build whose view was read below the purge watermark throws instead of answering the plan's `skipped`. SnapshotWorkflow's step then retries with a fresh read after the purge, as the API retries `snapshot_not_recorded`. A skip would leave the snapshot `pending` with its Workflow complete, so clients poll it until they give up and it stays stuck until `pruneSnapshots` fails it a day later. The other two refusals stay `skipped`: a snapshot no longer pending, and a vault no longer active. 1B-T12's parity session should expect the throw.
R100 (9 Nov, the owner's ask to speed up): CI is the gate for whole suites. That covers the full render suite, the full workers suite, export:web (unless routes or the entry change), the iOS export, the database suites and test:ops.
  - Agents run only the fast local gate in `protocol.md`, and no whole-suite totals appear in briefs, prompts or receipts. Reviewers read CI instead of re-running suites.
  - The running planners of 1B-T8 and 1D-T8 were told to adopt it.
  - Fix rounds that apply the first reviewer's verified patch byte for byte merge on green CI without a confirming review.
  - Up to about 6 agents.
R98 (9 Nov, 1C-T8 review M1, amends 1C-T8's P6): on the session-ended screen, whenever the main button is the email code to the account's own address, "Use another way" also offers an email code to another address. This keeps "every failure offers another way" on email-only builds, and reaches keep-or-erase for another account.
R99 (9 Nov, 1C-T8 review, P4): nothing navigates to `/onboarding/reminder` before 1C-T9 adds it. OnboardingScreen keeps today's in-place reminder step until then, so there is no cast and no unmatched route with the signin or all area on. 1C-T9 adds the route, the `from=onboarding` handling and the switch in one change.
R97 (9 Nov, 1B-T6 confirming review MA-1): in workerd, a GET whose client goes away mid-download keeps its download slot, because the cancel never reaches the stream behind FixedLengthStream. This is a follow-up task, not a blocker for #362, since the vault routes are not live before 1B-T13.
  - The follow-up, "fix-download-aborts", applies the proven fix to every vault download (exports now, receipts from 1B-T9, snapshots from 1B-T8): each `serve*File` hands `w.waitUntil` a promise that its `release` settles. Prove it under `wrangler dev` (four aborted GETs, then a GET answers 200), before 1B-T13.
  - Same leak, retiring code: the PostgreSQL edge's routes.ts:341-346 and 429-437.
R96 (9 Nov, 1B-T6 review M-1, amended the same day): `headOf` in src/v1/handler.ts reads the response body it drops to its end, with `pipeTo` into a discarding WritableStream and errors swallowed, before answering the HEAD. A HEAD on any HEAD-able route then releases what that body holds.
  - The first wording, "cancels the body", fails in workerd. The request ends before the cancel reaches the stream behind FixedLengthStream, so the slot is never returned (proved under `wrangler dev`; the test runtime hides it). The case checks that each HEAD reads the whole file.
  - handler.ts joins 1B-T6's fix round. The fix covers 1B-T8's and 1B-T9's downloads.
  - **1B-T9's brief still checks for `cancel(` (Step 0.4 and P13).** At its dispatch, amend Step 0.4 to `grep -c 'pipeTo('` printing 1.
R95 (9 Nov, 1B-T6: the build check "no PostgreSQL code in the vault bundle" counts driver markers, not the word `node-postgres`, because #352's `jsonbOrder` doc comment names node-postgres in prose; the bundle keeps that one comment line, and every driver marker counts 0),
R84 (P4-T10 fixtures), R85 (two API test-only fixes), R86 (token sid must match the provider's session; sign out on a failed finish), R87 (receipts in docs/implementation/receipts/<task-id>.md), R88 (upload-intake deadline reason), R89 (+ extension: parser regex and readDateStyles DoS in frozen apps/api), R90 (API tests may add the legacy session header), R91 (two API database test races, test-only: command order and export downloads; R-B migration waits on the owner), R94 (1D-T9: a refused edit keeps a choice only with a usable current record; the broader C16 reading goes to the owner at E2), R93 (1D-T6: posthogOptions sets `rageClickConfig: { enabled: false }`, beyond the plan's options, because the iOS SDK sends $rageclick itself outside before_send and before consent, and repeated keypad taps reveal amounts), R92 (the vault serves sync snapshots in PostgreSQL jsonb key order, shortest key first then bytewise, nested too, via `jsonbOrder` in src/vault/reads/sync.ts; the parity normalizer stays byte-exact; 1B reads of jsonb-backed values use it too).

## Merge routine
Merge each PR when its CI on the current head is green; close its issue by hand (backlog-map.json); remove worktree and branch (local and remote). Open PRs that conflict only in docs/implementation/premium-progress.md: merge the head and run ledger_union.py (keeps both sides), except 1C (hand-merge: one `## 1C:` heading) and P4 (one `## P4` heading). New tasks write receipts under R87, which avoids those conflicts.

## Owner decisions waiting
- **OPEN (10 Nov, 14:50): 1C-T9 waits on E2 for 1C-T8** (plan p1c :1052).
  - Approve the 23 sign-in catalogue sections (the deep links in `receipts/1C-T8.md`), and answer:
    - P5: keep the extra "Confirm it's you" tap before Apple's and Google's sheets (item 6 below);
    - m2: the session-ended "account unavailable" variant's wording and main button;
    - m4: keep or drop the terms box on today's sign-in screen.

    Any changes land first, as a 1C-T8 follow-up.
  - **Why it waits:** 1C-T9 moves all 99 draft Thai lines into `en.json` and `th.json`, 71 of which you have never seen, and adds `'signin'` to `APPROVED`, which turns the area on by default.
  - **An option, for speed (a plan change, so the owner decides):** split 1C-T9.
    - Now: `getSharedPolicyClient`, `onPolicyRequired`, the five routes, the session-ended guards and the TermsGate wiring, all behind the `'signin'` area left off, with the drafts kept.
    - After E2: the copy move and `APPROVED`.
  - The controller recommends the split only if E2 will take more than a day.
- **OPEN (10 Nov, 08:52): GitHub Actions stopped for billing.** Every job of #392's run 42738781210 failed without starting. Each carries GitHub's annotation: "The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings".
  - The last green run was #391's at 08:20 (42735086363). The Free plan's 2,000 minutes a month are used up: about 1,400 by 6 Nov, then about 11 nine-job runs at about 33 billable minutes each since #377 merged.
  - **Effect:** no PR can get CI, so nothing new can merge. #391 can still merge on its review, because its run was green before the stop. Planners, implementers and reviews go on, and PRs are opened, but they wait for CI.
  - **Owner's options:**
    - add a payment method or raise the Actions spending limit for the account that owns the repo;
    - or cut CI cost first. Each merged task runs CI twice today: the task PR, and its promotion PR into main on the same tree. P11's cheaper layouts are another way: fold `image` into `exports`, or split the section suites two ways.
    - Otherwise CI waits for the minutes to reset at the next billing date.
  - **After the fix:** rerun each refused run (`gh run rerun <run> --repo mygogocash/jotbun`) and merge as each goes green. Refused so far: 42747590350 (#392 at fc78376; its older 42738781210 on 784667b no longer matters), 42774078632 (#394 at 317cf3a; its older 42741146172 on ef37c41 no longer matters), 42741688287 (#395), 42745408105 (#396), 42748341937 (#397) and 42771332803 (#398).
- **ANSWERED (10 Nov, 06:2x): keep the nine-job CI, merge.** Below is the question as it was asked. The owner accepted about 33 billable minutes a run.
- **(was) Actions minutes before ci-parallel-jobs merges.** The repo is private on the Free plan, which includes 2,000 Actions minutes a month.
  - Usage: 80 pull-request runs have happened since 1 Nov, about 1,400 billable minutes at today's roughly 18 per run, and each merged task now adds a promotion PR run. The controller cannot read the actual usage: GitHub's timing API reports 0, and the billing endpoint needs `admin:org`.
  - The parallel layout costs about 31 billable minutes a run (P11). If the minutes run out with no payment method, Actions stop, and every merge stops with them.
  - **Measured on #377's own run (42652925056, all nine green):**
    - wall time 285 s (4.75 minutes), against 10 to 12 minutes before (#372's longest job was 12 min 14 s);
    - job times 158 to 283 s, plus 58 s for `image`; about 1,730 s of runner time, or about 33 billable minutes once each job is rounded up, against about 24 for #372's three-job run;
    - the render total adds up (1289 + 162 + 196 + 218 = 1865);
    - the iOS export passed on Linux (5760 modules).
  - Owner: check the org's billing page, and confirm the trade-off before the controller merges ci-parallel-jobs. Cheaper variants are in P11: fold `image` into `exports`, or split the section suites two ways.
0. R-B (apps/api migration 0020_receipt_copy_once.sql, prepared in scratch/fix-api-db-flakes/files/): gogospend_reserve_receipt_copy (migration 0017) checks "receipt exists" and "copy in flight" in two statements, so two requests can each reserve a copy (one wasted copy, deleted at the next sweep). The fix is a new migration replacing the function with one combined check; it needs the API's migration step wherever the API runs. Until then attachments.integration.spec.ts "two records retaining one image ... one copy" stays a rare known flake.
1. Sign-in lockout: no per-email lockout, only per code (about 1,440 guesses a day against one address at Task 2's 5 codes per 15 min). Needed before 1C-T2 sends real mail.
2. Q1 (QR decoder package) gates P3-T12.
4. Deletion retry with an expired token (1C-T6 review, for Tasks 8 and 11): an unconfirmed deletion stays unconfirmed on every Try again once its token is over 10 minutes old (401). The plan requires reusing those credentials, so the person must leave and start over, and if the first request had landed, the new attempt says "Nothing was deleted". Decide whether a retry may use a fresh sign-in's new credentials.
6. E2, from 1C-T8's P5: the new "Confirm it's you" sheet opens for every sign-in method, so Apple and Google take one more tap before their own sheet. Keep that, or skip the sheet for Apple and Google?
5. Whether to run the plan's whole-1A-range review (1A-T10's P11). It is an expensive Opus pass; every 1A task had its own review, but the reviews of Tasks 1 to 6 and 8a were lost with /private/tmp.
3. Before Q5's PostHog key is set (1D-T6 review m1): with crash reports on before consent (Q4's default), the native SDK sends native crash reports unscrubbed (outside `before_send`), and a feature-flags request at every launch carrying the stored analytics id. Native requests also carry no `$geoip_disable` (Q6). Nothing is sent today, because there is no key. Decide, with counsel, whether crash reports before consent stay on, or whether the native SDK must start only after a yes.
