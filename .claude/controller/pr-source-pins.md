## Summary
- **source-pins: test pins that the vault's write paths keep a record's `source`.** This is a follow-up of P3-T2's reviews (followups line 637, m1 from both reviews), which P3-T13 left out of its app task (its ruling P9).
  - **`apps/edge/test/workers/transaction-source.test.ts`** (P3-T2's file) gains a block of two cases:
    - a restore keeps the source, in the record and in the sync feed (the first review's R4: `transactions.ts:334`);
    - a receipt's retain, replace and remove each keep a typed record's source, and each command still answers 200 (R5: `attachments.ts:222`). H9 holds: a typed record with a receipt stays `typed`.
  - **`apps/app/src/storage/diaryRepository.test.ts`** gains three lines inside P3-T2's outbox case: a transfer twin of the unknown-source refusal (P3-T2's n1, kills R9). The file keeps 25 tests.
- **No production change and no finding:** the code is right on every path. The reviewers' surviving mutants R4, R5 and R9 are the RED, applied at once.
- **The import confirmation waits for P4-T11 (ruling P3):**
  - a confirmation never writes an existing record, and 1B-T10's case already pins the guard (`taken`);
  - pinning today's NULL source would pin the very line P4-T11 must change;
  - the second review's probe is ready for P4-T11 (the receipt says where).
- **The controller accepted the planner's calls P1 to P10.**
  - Planned on Claude Opus, built on Claude Haiku 5.5.
  - The controller checked the commit: both `real/` files are byte-identical.
  - The receipt is its own file under R87: `docs/implementation/receipts/source-pins.md`.
  - No source, package, lockfile or route change.

## Test plan
- [x] RED: the reviewers' R4, R5 and R9 applied at once. Exactly the three new cases fail, each on an assertion (Workers 2, unit 1). Both typechecks pass on the mutated tree.
- [x] GREEN: Workers 11 (under the heavy lock), unit 25.
- [x] 3 of 3 mutants killed, one at a time. The output is identical to the planner's.
- [x] The gate:
  - `typecheck:edge` and `typecheck:app`;
  - `test:edge` 214;
  - `test:app`;
  - `test:unit` 1109;
  - `git diff --check`.

  No `build:edge`, since no source file changes.
- [ ] CI on this pull request is green: the nine jobs. Note: GitHub Actions is queued org-wide (see the controller's handover).
- [ ] Independent review (Opus).
- [ ] SKIPPED: `test:edge:db` locally (Docker stopped; CI runs it).

No issue: a follow-up task the backlog does not list.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
