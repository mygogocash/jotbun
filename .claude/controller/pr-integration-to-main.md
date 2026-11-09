## Summary
- This brings the phase 1 integration branch, `claude/p1a-vault-core`, into `main`. It is 435 commits, with **49 plan tasks** closed across ten plans.
- Every task reached the branch through its own pull request. Each one was planned (Opus), built test-first (Haiku), and passed CI and an independent Opus review, with confirming reviews after any fix round. Each task's receipt is in `docs/implementation/receipts/`.
- **Phase 1A, the UserVault core, is complete** (1A-T1 to 1A-T10). Its closing receipt, `receipts/1A-T10.md`, covers 29 routes served, 27 deferred and 6 retired, and the items still open.
- **Phase 1B, files and background work on the vault.** Done: T1 to T6, T9 and T10, covering uploads and the parse pipeline, exports on ExportWorkflow, receipt attachments, and import review and confirmation. Next: T7 (AI routes), T8 (snapshots, being planned), and T11 to T13.
- **Phase 1C, Better Auth.** Done: T1, T5 (the app's provider port), T6 (fresh sign-in for deletion, export and sign out everywhere, and D37), and T8 (the sign-in screens as drafts for E2). T8's screens sit behind an area that is off until approved.
- **Phase 1D, pokes and PostHog.** Done:
  - T1 to T6: PostHog on the phone, gated by consent, with no key set, so nothing is sent;
  - T9: the conflict choice, behind an unapproved area;
  - T10: pokes over hibernating WebSockets.
- **Phase 2, Bun Wallet core.** Done: T1 to T9 and T19, covering the packages and gesture root, the test harness, motion and wallet commands. T10 (money text and private mode) is in review as #370.
- **Other phases:** P3-T1, P4-T1, P4-T10, P5-T1, P5-T3, P5-T4, P6A-T1 and P6B-T0.
- **Safe to merge as it stands:**
  - Every redesign area that has not passed E2 stays off unless named, so today's screens are unchanged.
  - Nothing is deployed, and no hosted resource is created.
  - The PostHog client stays null until a key is set (Q5).
- **Merges cleanly into `main`.** A trial merge has no conflicts with `main`'s README and v0.1.0 commits. It also contains everything in #70 (`claude/premium-ai-edge`); #70's only commit not in this branch is its own merge commit, so this PR supersedes it.
- **Merging is the owner's call**, as is closing #70.

## Not in this pull request (owner decisions and follow-ups)
- **Owner decisions waiting** (`.claude/controller/handover.md`):
  - R-B, the API's receipt-copy migration;
  - the per-email sign-in lockout, which 1C-T2 waits on;
  - Q1, the QR decoder package, which P3-T12 waits on;
  - crash reports before consent, before a PostHog key is ever set;
  - deletion retries with an expired token (Tasks 8 and 11);
  - E2's extra "Confirm it's you" tap for Apple and Google;
  - whether to run the whole-1A-range review.
- **Follow-up tasks** (`.claude/controller/followups.md`):
  - `fix-download-aborts`, before 1B-T13 (R97). It also carries the edge test gaps the reviews of 1B-T9 and 1B-T10 found.
  - Smaller carry-ins, each keyed to the task that will make it.
- **SKIPPED everywhere:** device and simulator checks, E2 screenshots, and hosted checks (Workflows, R2, CPU limits). Each receipt records them.

## Test plan
- [x] Every task PR passed CI ("Typecheck, unit, render, build, export", "SQL integration and ops", "Release image and smoke") and an independent review before merging into the integration branch.
- [x] A trial merge into `main` has no conflicts.
- [ ] CI on this pull request is green.
- [ ] Owner review.

<details><summary>The 49 closed plan tasks</summary>

- **1A (11):** T1, T2, T3, T4, T5, T6, T7, T8a, T8b, T9, T10
- **1B (8):** T1, T2, T3, T4, T5, T6, T9, T10
- **1C (4):** T1, T5, T6, T8
- **1D (8):** T1, T2, T3, T4, T5, T6, T9, T10
- **P2 (10):** T1, T2, T3, T4, T5, T6, T7, T8, T9, T19
- **P3 (1):** T1
- **P4 (2):** T1, T10
- **P5 (3):** T1, T3, T4
- **P6A (1):** T1
- **P6B (1):** T0

</details>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
