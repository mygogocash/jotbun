# Controller handover (9 Nov 2026, 22:15 Bangkok)

Durable folder: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/` (protocol.md, briefs/, reviews/, scratch/, followups.md, ledger_union.py, wait_ci.sh, watch_prs.sh, backlog/). Never use /private/tmp for anything kept; macOS cleared it once (late Oct). Only the heavy lock lives there: `/private/tmp/claude-501/jotbun-heavy.lock`.

Integration branch `claude/p1a-vault-core` (worktree `.claude/worktrees/p1a-vault-core`), head 0bd5659 (controller state after 1D-T8's dispatch). Nothing outside `.claude/` changed since 606e131. No PR is open into the integration branch; only #70 into main.

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
- **P2-T13 planner** (Opus xhigh, f362a7c3), dispatched at 22:51 at b4a0811 (depth 18; the tray, main button, text link and lock cover). WT p2-t13 on p2/t13-tray.
  - It carries P2-T9's note on a Sheet inside a tray (two animation systems) and P2-T9's m-2 if it touches `motion/`.
  - It is planned in parallel with P2-T11. Any shared edit (`walletHarness.tsx`, wallet sections in `registry.tsx`) must sit at an anchor of its own and apply in either merge order.
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
  - **1B-T7 planner** (fa58dddd), the AI routes: WT p1-1b-t7 on p1/1b-t7-ai-routes. It keeps its `handler.ts` edits minimal, for fix-download-aborts.
  - **1B-T11 planner** (6407a432), files on the vault alarm: WT p1-1b-t11 on p1/1b-t11-files-alarm. It carries 1B-T8's m-1 and the alarm notes from 1B-T4, 1B-T5, 1B-T6, 1B-T9 and 1B-T10.
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
    - Merge it with `merge_task_pr.sh 377 46b30a0` (no task id) **only after the owner's Actions-minutes answer**. Then run `promote_pr.sh ci-parallel-jobs 377`.
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
    - On approval and green CI: `merge_task_pr.sh 376 8b9e16e P4-T12`, then `promote_pr.sh P4-T12 376`.
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
- **P2-T11 planner** (Opus xhigh, df615dc8), dispatched about 22:16 at 331c2b2 as the sixth agent: the deepest ready task (depth 18). WT p2-t11 on p2/t11-wallet-looks. It carries P2-T8's m-1 (the harness's E2, E3 and X2) and P2-T10's balance-sign note. P2-T13 (depth 18, tray and lock cover, no shared files) follows in the wallet lane.

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
- **NEW (9 Nov, 23:10): Actions minutes before ci-parallel-jobs merges.** The repo is private on the Free plan, which includes 2,000 Actions minutes a month.
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
