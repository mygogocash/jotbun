# alarm-hardening: Harden the vault alarm after 1B-T11

- **Status:** built and verified locally on `fix/alarm-hardening` (`.claude/worktrees/alarm-hardening`), from `06fdd97`. The worktree was made at `402c1df`; Step 0.1 fast-forwarded it to `06fdd97`, which changes only `.claude/controller/` files (`followups.md`, `handover.md` and the planner's kit), so no file under `apps/`, `packages/` or `apps/api` moved. Not pushed. Under ruling R87 this receipt is its own file; `premium-progress.md` is not edited. Under ruling R100 the whole workers suite is CI's (`test:edge:workers`), and so is the database suite (`test:edge:db`, SKIPPED here: Docker is stopped). The independent review is the controller's, after this receipt.
- **Carries:** 1B-T11's review (`reviews/1B-T11.md`): m1, m2, m4, n1, n2, n3, n4, n5 and n9. m3 and n6 are fix-download-aborts'; n7, n8 and n10 are later tasks'.
- **Files:**
  - 1B-T11's: `src/vault/files/jobs.ts` (`FILE_PRUNES` and `PRUNE_DUE_TIMES` in the new order, each entry an arrow; a held one-run guard logs `file_run_held` and returns `['delete_objects']`); `test/workers/files-alarm.test.ts` (12 new cases and 2 changed: 35 in all).
  - Shared: `src/vault/user-vault.ts` (`rearm` keeps the promise of its `setAlarm` or `deleteAlarm`); `src/vault/schema.ts` (`attachmentChecks`, in `vaultSchema`); `src/vault/migrations/index.ts` (the `0004_alarm_bounds` journal entry: idx 4, `when` 1761696000000); `src/cloudflare-workers.d.ts` (`SqlStorageCursor.rowsRead`); `test/workers/vault-schema.test.ts` (`'attachment_checks'` in the table list).
  - 1B-T9's: `src/vault/files/attachments.ts` (`attachmentsDueAt` reads the safety net among `attachment_checks`, from that table first; the stamp term reads through `attachments_released_idx`, which 0001 creates; `pruneAttachments` empties `attachment_checks` in its first block).
  - 1B-T10's: `src/vault/files/previews.ts` (`LIVE_IMPORT_HEADS`; `importsDueAt` reads the live import heads first, with `CROSS JOIN`).
  - New: `src/vault/migrations/0004_alarm_bounds.sql` (the `attachment_checks` table, its four triggers, the backfill, and `entity_heads_imports_idx`); `docs/implementation/receipts/alarm-hardening.md`.
  - No new package, no lockfile change, no cloud resource, no account setting. The one schema change is the additive migration 0004 (P6, P7).
- **The cost (m4, the planner's figures, P9; not re-measured here):** at 30,000 records (3,000 deleted), 5,000 held receipts and 3,000 purged import records, `attachmentsDueAt` goes from 0.705 ms (10,001 rows read) to 0.005 ms (2 rows), `importsDueAt` from 0.64 ms (6,006 rows) to 0.01 ms (6 rows), `fileJobsDue` from 1.5 ms to 0.035 ms, and `reschedule`'s block from 1.7 ms to 0.04 ms. At 20,000 held receipts and 30,000 purged import records, `reschedule`'s block goes from 13.55 ms to 0.365 ms (0.3 ms of it is 1A's `nextDue`, unchanged).
- **RED to GREEN** (FOCUSED: `files-alarm.test.ts` and `vault-schema.test.ts`, in `apps/edge`, under the heavy lock; the RED has 0004 as the table only and the four source files at their base):
  - RED: `Test Files  1 failed | 1 passed (2)`, `Tests  9 failed | 40 passed (49)`, vitest exit 1. All 9 failures are `AssertionError`s (9 such lines; no `TypeError`, `ReferenceError` or `no such table`). The nine, in the brief's order, with vitest's message:
    1. `after any alarm, every scheduled time is later than now` (the R37 case; m1, P2): `prune_files: expected <t0> to be greater than <t0>`.
    2. `only one file run at a time: a second run while the first waits on R2 deletes nothing` (n1): vitest abbreviates the object diff as `expected { firstFailed: [], …(3) }`; the field that differs is `secondFailed`, received `[]`, where the brief expects `['delete_objects']`.
    3. `an import purge in the same alarm releases a ready snapshot it makes stale, so no job is left due at the vault clock` (m1): `expected [ { chunk_index: +0 } ] to deeply equal []`.
    4. `an alarm that finds another file run in progress reports its delete as failed, so it comes back a minute later` (n1, PG): `expected { held: false, after: <t> } to deeply equal { held: true, after: <t + 60,000> }`.
    5. `a setAlarm the storage refuses is logged and forgotten, so the next rearm sets the alarm again` (n2): `expected { asked: [ <t> ], …(3) } to deeply equal { asked: [ <t> ], …(3) }`.
    6. `a refusal that lands after a later rearm leaves that alarm alone, and a refused deleteAlarm is logged` (n2): `expected [] to have a length of 2 but got +0`.
    7. `the due-time reads after a write read as many rows with a hundred held receipts and purged import records as with none` (m4, P8): `expected { receipts: 201, imports: 206 } to deeply equal { receipts: 2, imports: 6 }`.
    8. `a receipt left with no holder is due at once however it lost its holder, and the prune that releases it empties the checks` (m4): the checks are `[]` (vitest prints the pair as `expected [ <t>, [] ] to deeply equal [ <t>, …(1) ]`).
    9. `a vault upgraded from 0003 starts its checks with the receipts that already have no holder` (m4): `expected { checks: [], due: <t> } to deeply equal { …(2) }`.
  - The 5 new cases that pass at RED pin code that is right today (P3): PA, PH, PE, PF, and `importsDueAt counts the live import records only`. All 14 `vault-schema.test.ts` cases pass at RED.
  - GREEN: `Test Files  2 passed (2)`, `Tests  49 passed (49)`, vitest exit 0; no `Unhandled`, `uncaught` or `Errors` line. The 12 event lines are `file_delete_failed` 1 (PA), `file_prune_failed` 2, `file_run_held` 2 (PG and the one-run case), `object_delete_failed` 1, `vault_alarm_unset` 4 (the two n2 cases' 3 and PH's 1), `vault_retention_purge_failed` 1 and `work_start_failed` 1: the base's 5 and 7 new.
- **Cases:**
  - Changed, in `files on the vault alarm (the plan)` and `the controller's notes`: `after any alarm, every scheduled time is later than now` (the seed holds a ready snapshot and a due import record; the snapshot's `high_water` is one past the seed's revision, P2) and `only one file run at a time: a second run while the first waits on R2 deletes nothing` (`secondFailed: ['delete_objects']`, changed-form comment).
  - New, `alarm-hardening: the 1B-T11 review's findings` (12):
    1. `an import purge in the same alarm releases a ready snapshot it makes stale, so no job is left due at the vault clock` (m1)
    2. `a delete whose own block throws is reported to the alarm, which comes back a minute later, not at once` (m2, PA)
    3. `an alarm that finds another file run in progress reports its delete as failed, so it comes back a minute later` (n1, PG)
    4. `a setAlarm the storage refuses is logged and forgotten, so the next rearm sets the alarm again` (n2)
    5. `a refusal that lands after a later rearm leaves that alarm alone, and a refused deleteAlarm is logged` (n2)
    6. `a schedule write that fails after a call committed is logged, and the call still answers its success` (n3, PH)
    7. `a background write that makes work due at once still waits the write floor (R104 through background())` (n4, PE)
    8. `a start through rearming() that makes work due at once still waits the write floor (R104 through rearming())` (n4, PF)
    9. `the due-time reads after a write read as many rows with a hundred held receipts and purged import records as with none` (m4, P8)
    10. `a receipt left with no holder is due at once however it lost its holder, and the prune that releases it empties the checks` (m4, P6)
    11. `a vault upgraded from 0003 starts its checks with the receipts that already have no holder` (m4, the backfill)
    12. `importsDueAt counts the live import records only: a purged one is skipped, a live selection counts` (m4, P7)
  - `vault-schema.test.ts`: `a new vault has every core table, migrated once` now lists `attachment_checks` (one line changed).
- **Mutation check:** 28 mutants, 28 killed, no survivor. `mutants.py --check` printed `28 mutants, 49 cases; old text found exactly once and every required case exists: True`. The runner printed `restored=True` for all 28 and no `SURVIVED`, `NOT APPLIED` or `REQUIRED BUT PASSED`. Its verdicts and failing case names match the planner's `proof/mutants.out` line for line. Afterwards `shasum -a 256 -c` printed OK for each of the six mutated files, and the ten-file check against the kit printed OK for all ten. Each line gives the mutant, its change, and its failing count (all KILLED, restored):
  - **J1** `jobs.ts`, `pruneSnapshots` back before `pruneAttachments` and `pruneImports` (m1): 2 failed.
  - **J2** `jobs.ts`, a held guard reports success again (n1): 2 failed.
  - **J3** `jobs.ts`, a held guard is not logged (n1): 1 failed.
  - **J4** `jobs.ts`, a delete's throw is logged, not reported (m2): 1 failed.
  - **U1** `user-vault.ts`, the settled alarm call left unhandled (n2): 2 failed.
  - **U2** `user-vault.ts`, a refused alarm is logged but `alarmAt` keeps it (n2): 1 failed.
  - **U3** `user-vault.ts`, a refused alarm clears `alarmAt` even after a later rearm (n2): 1 failed.
  - **U4** `user-vault.ts`, a refused alarm is not logged (n2): 2 failed.
  - **U5** `user-vault.ts`, `rearm` throws instead of logging (n3): 1 failed.
  - **U6** `user-vault.ts`, `background()` rearms with no write floor (n4): 1 failed.
  - **U7** `user-vault.ts`, `rearming()` rearms with no write floor (n4): 1 failed.
  - **A1** `attachments.ts`, no safety net (the 1B-T9 review's X5): 2 failed.
  - **A2** `attachments.ts`, the safety net reads every retained receipt again (m4): 1 failed.
  - **A3** `attachments.ts`, `JOIN` instead of `CROSS JOIN` (m4): 1 failed.
  - **A4** `attachments.ts`, the prune keeps the checks (m4): 2 failed.
  - **A5** `attachments.ts`, no stamp term (m4): 1 failed.
  - **P1** `previews.ts`, `JOIN` instead of `CROSS JOIN` (m4): 1 failed.
  - **P2** `previews.ts`, no purged-state term (m4): 3 failed.
  - **P3** `previews.ts`, no selections (m4): 2 failed.
  - **P4** `previews.ts`, the entity names in the other order (m4): 1 failed.
  - **M1** to **M4** `0004`, each trigger missing (insert, set back to retained, holder deleted, holder moved): 1 failed each.
  - **M5** `0004`, no backfill (m4): 1 failed.
  - **M6** `0004`, no import index (m4): 1 failed.
  - **M7** `0004`, the import index keeps the purged heads (m4): 1 failed.
  - **S1** `schema.ts`, `attachment_checks` missing from `vaultSchema` (`vault-schema.test.ts`): 1 failed.
  - n5 is a what-if, not a mutant (P10). The planner's run of it (`proof/whatif-n5-real.log`, `proof/whatif-n5-base-jobs.log`) was not repeated here.
- **Gate** (R100's fast local gate):
  - `npm run typecheck:edge`: exit 0 (with the RED stubs, with the GREEN code, and again after the mutants).
  - FOCUSED, once more after the mutants (under the lock): `Test Files  2 passed (2)`, `Tests  49 passed (49)`, the same 12 event lines.
  - `npm run test:edge`: exit 0; `Test Files  15 passed (15)`, `Tests  176 passed (176)`, no failed case. The planner's run printed the same totals.
  - `npm run build:edge`: exit 0. `dist/jotbun_vault/index.js` is 1,676.57 kB (1,676,577 bytes); the planner measured its base at 1,671.04 kB (the base was not rebuilt here).
  - AFFECTED (under the lock; the nine files the brief names, run for the reason it gives: the migration's triggers fire on every receipt write and every record purge, and the alarm's reads and prunes changed): exit 0; `Test Files  9 passed (9)`, `Tests  261 passed | 1 todo (262)`, no failed case. The log holds two `uncaught exception` lines (an `Error: unavailable` inside the workflow binding, and a duplicate workflow instance) and one `RPC result was not disposed` warning, all from `snapshots.test.ts`'s workflow cases, which this change does not touch. The planner's run on this code printed the same totals, the same warning and the same two lines (the instance IDs differ). 1B-T11's receipt records the same kind of line from 1B-T8's cases.
  - `git diff --check`: no output.
- **CI and SKIPPED:**
  - `npm run test:edge:workers` (the whole workers suite): CI, under R100.
  - `npm run test:edge:db`: SKIPPED; Docker is stopped. The brief names CI's `edge` job as the one that runs it.
  - `export:web` and the iOS export: CI; no route, config or app entry changed.
  - The full render suite: CI; no `apps/app` file changed.
  - `typecheck:routes`: not run; no route changed.
  - `test:ops`: CI; not run here.
  - `typecheck:app`, `test:app` and `test:unit`: not run; no `apps/app` or `apps/api` file changed.
  - Hosted checks: nothing deployed; no alarm, bucket or lifecycle rule was created.
- **Deviations and calls:** the controller accepted the planner's calls P1 to P14 as written. One line each:
  - P1, `pruneSnapshots` runs last. `FILE_PRUNES` is uploads, exports, attachments, imports, snapshots; only `pruneSnapshots` moved, and `PRUNE_DUE_TIMES` follows it. Pinned by the m1 case and the R37 case.
  - P2, the R37 seed: `seedDueWork` writes the ready snapshot with `high_water` one past the seed's revision (the planner's `naive-r37-seed-on-base.log`). The seed's comment names what would break it.
  - P3, m2, n3 and n4 are pins of code that is right today; PA, PH, PE and PF pass at RED by design.
  - P4, a held one-run guard returns `['delete_objects']` and logs `file_run_held` through `logFailure` (n1).
  - P5, one `.catch` on the settled `setAlarm` or `deleteAlarm` (n2): it logs `vault_alarm_unset`, and clears `alarmAt` only while it still equals the `at` it asked for.
  - P6 (**ruling R105**): `attachment_checks`, filled by four triggers and emptied by `pruneAttachments`' full pass, is where `attachmentsDueAt` reads its safety net. A migration that rebuilds `attachments` or `transaction_attachments` must recreate those four triggers.
  - P7, `entity_heads_imports_idx` and `LIVE_IMPORT_HEADS`: the WHERE matches the index's term for term, in the same order, and `CROSS JOIN` makes the heads the outer loop.
  - P8, `SqlStorageCursor.rowsRead` is declared in `cloudflare-workers.d.ts`; the m4 rows case reads the storage's own count.
  - P9, the before-and-after cost: the table's figures are the planner's (`proof/measure-before.log`, `proof/measure-after.log`); they were not re-measured here.
  - P10, n5: every `FILE_PRUNES` and `PRUNE_DUE_TIMES` entry is an arrow that calls its function when it runs, with a comment on the cycle. The cycle stays. The R4 what-if is the planner's, not repeated here.
  - P11, n9: the P14 bound holds for import reviews only (see the correction below).
  - P12, left as they are, with the reason: `recordsDue` (alarm-only, once or twice per alarm), `snapshotsDueAt`'s scan (fix-download-aborts'), 1A's `nextDue`, and the other alarm rules of 1B-T11's brief.
  - P13, the RED's stub is 0004 as the table only, and the four source files are at their base.
  - P14, hosted checks are SKIPPED; the whole workers suite is CI's; `test:edge:db` is SKIPPED.
  - Not a planner call: the one-run case's RED message is vitest's abbreviated object diff (RED, item 2). The sync was a fast-forward, `402c1df` to `06fdd97`, which brought the planner kit into the branch; the kit's `SHA256SUMS` then checked 45 OK.
- **Correction to 1B-T11's P14 (n9):** "at most a few thousand import records can fall due at once" (`receipts/1B-T11.md:82`) holds for import reviews, whose records the parse quota (10 a day) bounds. Import selections are bounded only by the write budget (60 writes a minute). `pruneImports`' uncapped loop still ends, because each pass purges what it read. 1B-T11's receipt is not edited here; the controller may note the correction there.
- **For the reviewer first:**
  - 0004's four triggers, the backfill, and `pruneAttachments` emptying the table in the same block as its full pass (P6's invariant).
  - `LIVE_IMPORT_HEADS` against `entity_heads_imports_idx`'s WHERE.
  - The n2 catch's `alarmAt === at` guard.
  - The R37 seed's comment.
- **Notes for later tasks:**
  - fix-download-aborts: the `attachments.ts` and `previews.ts` lines this task changed (the brief's "How this task meets the other open work"), and the 1B-T9 review's X5 text, which is now A1's text.
  - 1B-T13: 0004's table and index are empty in a vault without receipt changes since its last alarm, or without imports.
  - Any task that writes `attachments` or `transaction_attachments`: 0004's triggers list the receipt in `attachment_checks`, and the next `pruneAttachments` empties it (R105).
  - Later: `recordsDue` could read `LIVE_IMPORT_HEADS` too (alarm-only today); 1A's `nextDue` counts every change and head after every write.
