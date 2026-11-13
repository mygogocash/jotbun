# source-pins review: Source preservation pins on the vault's write paths (P3-T2 follow-up)

- **PR:** #462 (`fix/source-pins` into `claude/p1a-vault-core`), head `a5d93d8a`, one commit on `a0aa42e3`. Range `origin/claude/p1a-vault-core...a5d93d8a`. The base has since moved to `2213bf2f` (6 commits); GitHub's compare `a0aa42e3...2213bf2f` lists 220 changed files, every one under `.claude/`, so nothing this PR runs or relies on has moved. GitHub reports the PR `MERGEABLE`.
- **Reviewer:** Claude Opus 5.5, read-only. Probes and mutants ran in a `git archive` copy of `a5d93d8a` at `.claude/controller/scratch/source-pins-review/tree` (its `.claude/` dropped). `node_modules` at the root and in `apps/edge`, `apps/app` and `apps/api` are symlinked from the worktree, which is clean at the same commit. My runner is `scratch/source-pins-review/rmutants.py` (it imports the planner's mutant texts unchanged), and the logs are in `runs/`. Every workers run and every mutant run, the unit ones included, went through the planner's `locked.sh`. After the runs, `diff -rq` of the copy's `apps/` and `packages/` against the worktree is clean, and nothing was written into the planner's folder.
- **Spec read:** followups.md lines 635 to 644 (P3-T2's entry: line 637 m1, line 642 n1); `reviews/P3-T2.md` (m1, n1, section 2, mutants R4, R5 and R9); `reviews/P3-T2-second.md` (m1 with X1, X3 and X5, focus 2's table, note 3); the P3 plan's H9 (line 30), Global Constraints and Task P3-T2 (lines 156 to 204); the P4 plan's P4-T7 Step 4 (line 528) and Task P4-T11 (lines 628 to 659); the brief and its rulings P1 to P10; the planner's kit; the implementer's logs (`scratch/source-pins/`); the receipt.
- **Summary:** no blocker, no major. The diff is the planner's kit byte for byte: both test files equal `real/`, both parents equal `orig/`, and the brief's two SHA-256 sums match. The two new cases and the twin do what m1 and n1 ask. Each fails, on an assertion, under exactly its own mutant (R4, R5, R9; I reran all three). The step mutants S1 to S3 each fail the receipt case at the step they break. P3's argument for leaving the import confirmation to P4-T11 holds in the code and in the plan. One minor: the pins hold a source that is present, but not the absence of one (my V5 to V7 survive every file that drives those paths). No nits.

## CI on #462 (R100)

Run 43431051393 on head `a5d93d8a`. Every job has been queued since 13:08:18Z on 13 November; I last read it at about 17:01Z, still all queued. The base's latest controller commit (`2213bf2f`) says CI is still blocked (the org-wide Actions block of `768dee1a`).

| Job | State |
| --- | --- |
| Typecheck, unit, API, build | queued, not started |
| Edge Worker (types, unit, workerd, build, PostgreSQL container) | queued, not started |
| Exports (web and iOS bundles) | queued, not started |
| Render (every file but the per-section suites) | queued, not started |
| Render, per-section suites (3n, 3n+1, every other test) | queued, not started (all three) |
| SQL integration and ops | queued, not started |
| Release image and smoke | queued, not started |

There are no counts yet. As the controller's note says, this review rests on the local evidence. CI stays the gate for the whole suites (R100), so merge only once all nine jobs pass.

## What I ran (13 November, 20:16 to 20:29 Bangkok)

| What | Result |
| --- | --- |
| GREEN in the copy: `transaction-source.test.ts` (workers), `diaryRepository.test.ts` (unit) | 11 passed (11); tests 25, pass 25, fail 0 |
| `tsc --noEmit` in the copy's `apps/edge` and `apps/app` (the edge's tsconfig includes `test`, the app's `src`) | both rc=0, no output |
| The planner's mutants, 7 rerun: R4, R5, R9, S1, S2, S3, and T1 (the text of `proof/taken-probe.py`) | 7 of 7 killed as the kit records |
| My mutants V1 to V4 (each with an expected case) | 4 of 4 killed, each by its one case |
| My probes V5 to V7 (stamp a source where none was) over the workers files that drive each path | all three survive (m1) |
| Kit `SHA256SUMS`; `SHA256SUMS.base` against the commit; `real/` and `orig/` against the commit and its parent | 24 of 24 OK; the four relied-on code files OK and the two test files changed as intended; identical |
| `git diff --check origin/claude/p1a-vault-core...a5d93d8a` | clean |
| Not run | the whole suites (R100: CI), the database suites (Docker stopped). No load flake was seen. |

The probe runs named three, eight and five workers files; none was the whole workers suite.

## Findings

### Blocker

None.

### Major

None.

### Minor

**m1. The new pins hold a source that is there, but not the absence of one. A restore, edit or receipt command that stamps a source onto a record made without one passes every case on those paths.**

Evidence: each mutant was applied alone in the copy, the named files ran under the lock, and the file was written back with its SHA-256 checked.

| Mutant | Statement | Files run | Result |
| --- | --- | --- | --- |
| V5 | the receipt commands' bump becomes `UPDATE transactions SET version = version + 1, source = COALESCE(source, 'photo'), updated_at = ? WHERE id = ?` (`attachments.ts:222`) | `transaction-source`, `attachments`, `download-aborts` | survives: 3 files, 79 passed (`runs/V5.log`) |
| V6 | the restore becomes `SET deleted_at = NULL, source = COALESCE(source, 'typed'), version = version + 1, ...` (`transactions.ts:334`) | `transaction-source`, `transactions`, `history`, `golden-diary`, `money-hardening`, `server-events`, `retention`, `attachments` | survives: 8 files, 199 passed (`runs/V6.log`) |
| V7 | the edit's `writeRow` becomes `... note = ?, merchant = ?, source = COALESCE(source, 'typed'), version = version + 1, ...` (`transactions.ts:204-206`) | `transaction-source`, `transactions`, `history`, `golden-diary`, `money-hardening` | survives: 5 files, 98 passed (`runs/V7.log`) |

Why they survive: the new cases start from a record that has a source (`tell_bun`, `typed`). They see a source cleared (R4, R5) or overwritten (my V3, killed), but never one added. P3-T2's `a record made without a source, or with null, reads without the key` (`transaction-source.test.ts:76`) looks only after the create. The suites that drive these commands on records without a source read them with `toMatchObject`, `expect.objectContaining` or `isTransactionSnapshot`, and each of those accepts an added `source` key (`attachments.test.ts:382-386` and `:1488`, `transactions.test.ts:198`).

Why it matters: H9 says "`source` is set once, at create", B2 says older records stay NULL, and the receipt case's own name says the commands leave the source "as it was". "A record that gains a receipt becomes `photo`", applied only where no source was set (a backfill of the records made before P3, say), is the slip H9 warns about. The code is right today (these are mutants, not bugs), and P3-T2's reviews named only the clearing mutants, all killed here. So this lies outside the brief as written, which is why it is a minor.

Fix (one case, test-only): take a record made without a source; edit it, delete and restore it, then keep, replace and remove a receipt on it. After each step, expect `'source' in record` to be false, and the same in every sync snapshot. That one case kills V5, V6 and V7. No later plan task edits `transaction-source.test.ts` (P4-T7's Step 4 keeps it unchanged; P4-T11 tests in its own file), so the fix needs a home: a follow-up commit on this PR, or a small follow-up of its own as this one was. That is the controller's call.

### Nit

None.

## Focus answers, with evidence

1. **Each case fails on its own mutant, and only by an assertion.**
   - My reruns (`runs/R4.log`, `R5.log`, `R9.log`): R4 fails only the restore case, at `transaction-source.test.ts:234` (the record lacks `source`). R5 fails only the receipt case, at `:257` (`undefined` instead of `typed` at each step). R9 fails only the outbox case, at `diaryRepository.test.ts:133`, the twin: `AssertionError [ERR_ASSERTION]: Missing expected rejection (TypeError)`. Each run has 1 failed, the rest passed, and no other error kind.
   - These match the implementer's `mutants.out` and `red.out`. In RED, R4, R5 and R9 applied at once fail exactly the three pins, and both typechecks pass on that tree.
   - The step mutants S1 to S3 each fail only the receipt case, and the case's diff starts at the broken step: S1 at `retain` (all three rows differ), S2 at `replace` (two rows), S3 at `remove` (one row). So the per-command comparison (P5) points at the failing command, as intended.
2. **The restore case checks the record and the sync feed at the restored version.**
   - Line 234 reads the record (`deleted_at: null, version: 3, source: 'tell_bun'`), and line 235 reads the feed's three snapshots (create, delete, restore).
   - The feed stores each snapshot as JSON at write time (`change-log.ts:23-43`) and serves it as stored, so line 235 is an independent check. My V1 (the restore's snapshot drops `source` while the row keeps it) passes line 234 and fails line 235.
   - My V4 (the delete's snapshot drops `source`) also fails only this case, at line 235. P3-T2's first case checks the delete only through Recently deleted, a table read, so this case is the first to pin the delete's feed snapshot.
3. **The receipt case uses a typed record and checks each command.**
   - Each step records status 200, the version (2, 3, 4), the receipt held (first, second, none) and the source. The feed's four snapshots are checked after.
   - My V2 (`nextVersion`'s snapshot drops `source` while the row keeps it) passes the per-step reads and fails the feed check at line 262. My V3 (a retain stamps `photo` on the typed record, H9's hazard) fails at line 257, with `photo` at every step.
   - `seedImportImage` gives each call its own job, attachment id and key, published for a day (`support/files.ts:409-437`), well past `prepareReceipt`'s two-minute margin, and two copies stay inside the vault's copy limits.
   - Not covered: a record without a source (m1).
4. **P3, the import confirmation waiting for P4-T11: the argument is right.**
   - In the code: `confirmIn`'s only write to `transactions` is the `INSERT ... SELECT` at `confirmation.ts:473`, for the rows in `saving`. `saving` drops every derived id that has an entity head (`taken`, lines 467-468), and a purged record keeps its head. The insert has no conflict clause, so without `taken` it would throw rather than overwrite. The planner's T1, which I reran, fails 1B-T10's case at `imports-review.test.ts:486` with `expected [ 500, 'INTERNAL_ERROR' ] to deeply equal [ 200, undefined ]`. The image row's receipt is linked by an insert into `transaction_attachments` and a re-read (lines 506-508), with no version bump. So no statement in a confirmation can reach an existing record's `source`.
   - In the plan: P4-T11's Files list names `confirmation.ts` (it "writes `source: 'statement'`") but neither `transaction-source.test.ts` nor `imports-review.test.ts`. Its tests live in `import-label-maps.test.ts`, and its Step 4 keeps 1B-T10's suites unchanged. Its case `confirmed statement rows carry source statement` and its mutant "drop `source`" pin the new value. A NULL pin landed now would have to be rewritten by a task that may not touch either file.
   - The second review's note 3 ("land the pinning test from m1 first, so the change shows") is met by P4-T11's own RED: its new case fails until the insert names `statement`. Followups line 640 already says "P4-T11 owns `statement` there."
   - One caveat belongs to P4-T11 (Notes): `confirmIn` also confirms an image import.
5. **n1 inside the existing case.**
   - `cameraMove` (line 132) is the case's `siri` transfer (line 127, `type: 'transfer'`) with a fresh id and `source: 'camera'`, so only its source is wrong. `assertDraft` checks the source (`diaryRepository.ts:151-156`) before it looks up the wallets (line 157).
   - The case's closing checks (three pending entries, `photo`, `null`, `siri`; three outbox rows) also show that the refused transfer wrote nothing.
   - Every unit run reads tests 25 (my GREEN, and the implementer's `green-unit.log` and `gate-unit-focused.log`), so P3-T13's focused counts do not move.

**The write paths, all of them.** I listed every write to `transactions` at this head: a case-insensitive grep of `UPDATE`, `INSERT`, `REPLACE` and `DELETE`, plus ORM calls (there are none). The list is exactly P3-T2's reviews' list, with nothing added since:
- create (`transactions.ts:181`, the only statement that names `source`);
- edit (`:204`), delete (`:310`) and restore (`:334`);
- the receipt commands (`attachments.ts:222`);
- the confirmation (`confirmation.ts:473`, insert only);
- purge (`retention.ts:181`, delete).

With this PR, every one of them that must keep a present source has a case: edit and delete through P3-T2's first case, restore and the receipt commands here. (`0002_currencies_trips.sql:82` is a one-time migration update, written before `source` existed.)

## The receipt (`docs/implementation/receipts/source-pins.md`)

- It is its own file under R87, with the `# source-pins: ...` heading, and `premium-progress.md` is not edited.
- Every figure matches the implementer's logs: RED and the mutants as above; GREEN 11 of 11 and 25 of 25; `test:edge` 214 passed; `test:app` (37) and `test:unit` (1109) fail 0; both typechecks rc=0; kit sums 24 OK.
- The skipped installs follow the controller's dispatch note: "Skip any install step that finds `node_modules` ready, and say so in the receipt."
- The corrections to `receipts/P3-T2.md` (followups line 644) check out:
  - that receipt says 998 tests and 266 ms (lines 53-54), where `scratch/p3-t2/gate-test-unit.log` says 1012 and `gate-build-edge.log` says 248 ms;
  - it says `source?: TransactionSource | null` (line 26), where `resources.ts:72` and `:74` have no `| null`;
  - it says 8 cases (line 30), where the file had 9.
- The carries hold: `events.ts:6` still has the inline type import, and no open PR edits `events.ts` (checked #456, #460, #461 and #463).
- The commit message and trailer are the brief's Step 8, naming Claude Haiku 5.5, as the controller says the task was built.

## Mutants

| Id | What | Must fail | Result |
| --- | --- | --- | --- |
| R4 (planner's) | restore sets `source = NULL` | the restore case | killed, at line 234 |
| R5 (planner's) | the receipt commands' bump sets `source = NULL` | the receipt case | killed, at line 257 |
| R9 (planner's) | the outbox checks the source only when not a transfer | the outbox case | killed, at line 133 |
| S1, S2, S3 (planner's) | only retain, replace or remove clears it | the receipt case | each killed; the diff starts at its step |
| T1 (planner's probe) | `confirmIn` without `taken` | 1B-T10's case | killed, at `imports-review.test.ts:486` |
| V1 | the restore's snapshot drops `source`; the row keeps it | the restore case | killed, at line 235 only |
| V2 | `nextVersion`'s snapshot drops `source`; the row keeps it | the receipt case | killed, at line 262 only |
| V3 | a retain stamps `photo` | the receipt case | killed, at line 257 |
| V4 | the delete's snapshot drops `source`; the row keeps it | the restore case | killed, at line 235; P3-T2's cases all pass |
| V5, V6, V7 | the receipt commands, the restore or the edit fill a missing source | (probes) | all survive (m1) |

Every killed run failed exactly one case, on an `AssertionError`, and every mutated file was written back with its SHA-256 checked.

## Notes for later tasks

- **P4-T11 (its planner):** `confirmIn` also confirms an image import's one candidate (`IMPORT_IMAGE_ROW_ID`, `image:1`, a receipt photo; `confirmation.ts:497`). The plan's "each record is written through `createTransactionRow(c, input, { source: 'statement', slipRefId: null })`" would mark that record `statement`. Neither the P4 plan nor the spec names an image import's source, and H9 gives `photo` the meaning "Bun read the record from a photo". Decide it explicitly when planning P4-T11, and ask the owner if needed. This receipt's note ("every confirmed record carries `statement`") stretches the second review's probe, which confirms three CSV rows only (`scratch/p3-t2-second/probes/zz-second-imports.test.ts:1735`).
- **m1, if it is not fixed here:** no planned task edits `transaction-source.test.ts`, so record it in followups.md with V5 to V7 and the one-case fix above. The vault tasks that rewrite these statements are P4-T7 (`createTransactionRow`) and P5 (`transactions.ts`); their reviewers should check that no statement other than the create names `source` (H9).
- **CI:** all nine jobs on #462 are queued behind the org-wide block. Merge only once they pass.

VERDICT: Approved
