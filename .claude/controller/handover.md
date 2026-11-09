# Controller handover (9 Nov 2026, morning Bangkok)

Durable folder: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/` (protocol.md, briefs/, reviews/, scratch/, followups.md, ledger_union.py, wait_ci.sh, watch_prs.sh, backlog/). Never use /private/tmp for anything kept; macOS cleared it once (late Oct). Only the heavy lock lives there: `/private/tmp/claude-501/jotbun-heavy.lock`.

Integration branch `claude/p1a-vault-core` (worktree `.claude/worktrees/p1a-vault-core`), head 5dbd7be (controller state after #358).

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
  - On DONE: open its PR, then the Opus review. 1B-T9 (receipt attachments, which also creates downloads.ts) is planned after it.
- **#354 1D-T9 fix round (Haiku), worktree p1-1d-t9:**
  - The merge now conflicts on `featureFlags.ts` and its test (#358). The controller resolved both, keeping both areas, in `scratch/1d-t9-merge/` (SHA256SUMS; `node --test` passes 11 of 11). The fixer copies them in Step 1.3.
  - Fix round DONE: merge 36adb96 (5dbd7be), fix ddc9317, and the controller's receipt correction 03da870. Every count matched: unit 882, render 90 files and 1694 tests, 45 of 45 mutants.
  - Pushed to #354 (MERGEABLE) and the PR body updated.
  - Confirming Opus review under way, writing `reviews/1D-T9-confirm.md`. Merge on its approval and green CI with `merge_task_pr.sh 354 03da870 1D-T9`.
- **1C-T6 (Haiku), worktree p1-1c-t6:** base files are byte-identical at 5dbd7be (20 of 20). Expected: app 33, unit 887, render 90 files and 1660 tests.
- **1D-T6 (Haiku), worktree p1-1d-t6:** orig files are byte-identical at 5dbd7be (13 of 13). Expected: app 33, unit 892, render 92 files and 1661 tests, web 4782, iOS 5748.
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
R84 (P4-T10 fixtures), R85 (two API test-only fixes), R86 (token sid must match the provider's session; sign out on a failed finish), R87 (receipts in docs/implementation/receipts/<task-id>.md), R88 (upload-intake deadline reason), R89 (+ extension: parser regex and readDateStyles DoS in frozen apps/api), R90 (API tests may add the legacy session header), R91 (two API database test races, test-only: command order and export downloads; R-B migration waits on the owner), R94 (1D-T9: a refused edit keeps a choice only with a usable current record; the broader C16 reading goes to the owner at E2), R93 (1D-T6: posthogOptions sets `rageClickConfig: { enabled: false }`, beyond the plan's options, because the iOS SDK sends $rageclick itself outside before_send and before consent, and repeated keypad taps reveal amounts), R92 (the vault serves sync snapshots in PostgreSQL jsonb key order, shortest key first then bytewise, nested too, via `jsonbOrder` in src/vault/reads/sync.ts; the parity normalizer stays byte-exact; 1B reads of jsonb-backed values use it too).

## Merge routine
Merge each PR when its CI on the current head is green; close its issue by hand (backlog-map.json); remove worktree and branch (local and remote). Open PRs that conflict only in docs/implementation/premium-progress.md: merge the head and run ledger_union.py (keeps both sides), except 1C (hand-merge: one `## 1C:` heading) and P4 (one `## P4` heading). New tasks write receipts under R87, which avoids those conflicts.

## Owner decisions waiting
0. R-B (apps/api migration 0020_receipt_copy_once.sql, prepared in scratch/fix-api-db-flakes/files/): gogospend_reserve_receipt_copy (migration 0017) checks "receipt exists" and "copy in flight" in two statements, so two requests can each reserve a copy (one wasted copy, deleted at the next sweep). The fix is a new migration replacing the function with one combined check; it needs the API's migration step wherever the API runs. Until then attachments.integration.spec.ts "two records retaining one image ... one copy" stays a rare known flake.
1. Sign-in lockout: no per-email lockout, only per code (about 1,440 guesses a day against one address at Task 2's 5 codes per 15 min). Needed before 1C-T2 sends real mail.
2. Q1 (QR decoder package) gates P3-T12.
