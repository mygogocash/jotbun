# Brief alarm-hardening: Harden the vault alarm after 1B-T11 (the prune order, failure reports, bounded due scans and rearm's rejections)

You are the implementer (Haiku) for the follow-up task alarm-hardening. You fix and pin what 1B-T11's review (`reviews/1B-T11.md`: m1, m2, m4, n1, n2, n3, n4, n5, n9) found on the vault alarm:

- `pruneSnapshots` runs last, so a snapshot that an import purge makes stale is released in the same alarm (m1, R37);
- a held one-run guard is reported as a failed delete (n1);
- a `setAlarm` or `deleteAlarm` the storage refuses is caught, logged and forgotten (n2);
- the two due-time reads that run after every write stop reading every receipt and every import record the vault ever had (m4);
- `jobs.ts` no longer reads its imports while it loads (n5).

The other findings are pins of code that is right today (m2, n3, n4).

The planner wrote every file below and proved it on **`cb9913c`** (`origin/claude/p1a-vault-core` when the proof ran; nothing under `apps/edge`, `apps/api` or `packages` has changed since 1B-T11 merged at `c8929f2`), in a scratch copy made with `git archive`:

- RED on a typed stub;
- GREEN on the code;
- 28 mutants, 28 killed;
- the fast local gate (R100);
- the files whose code this task touches (AFFECTED);
- the before-and-after cost that m4 asks for.

Do exactly what this brief says.

Read first, in this order:

1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. Its opening notes apply:
   - **R100**: the whole workers suite is CI's; the local gate is the "Fast local gate".
   - Durable files live under `/Users/kunanonjarat/Developer/jotbun/.claude/controller/`, never `/private/tmp` (only the heavy lock is there).
   - **R87**: your receipt is its own file, `docs/implementation/receipts/alarm-hardening.md`. You do not edit `docs/implementation/premium-progress.md`.
2. The review this task carries: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/1B-T11.md`, "Findings" (m1, m2, m4, n1 to n5, n9) and "Notes for later tasks". Also `followups.md` (grep `alarm-hardening`).
3. The plan task the alarm comes from: `docs/superpowers/plans/2026-10-25-jotbun-p1b-vault-files.md`, `### Task 1B-T11` (line 961). Line 1002 states R37's rule: "After every alarm, each `schedule.due_at` is later than the vault clock".
4. 1B-T11's brief, `briefs/1B-T11.md`: rulings P1 to P19. Every one stays except where a ruling below says otherwise. R104 is in `handover.md`, "Rulings this session".

## Paths and rules used below

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/alarm-hardening` (branch `fix/alarm-hardening`, made by the orchestrator from `origin/claude/p1a-vault-core`). Work only here.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/alarm-hardening`, your scratch folder. Create it with `mkdir -p`. Logs, mutant logs and the commit message go only there.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/alarm-hardening-planner`, the planner's folder. Read it and `cp` from it; never write into it. It holds:
  - `real/`: the verified final copy of every file this task creates or changes, 10 files, at their paths under `apps/edge`;
  - `stubs/`: the RED's one stub, `src/vault/migrations/0004_alarm_bounds.sql` (the checks table only: no triggers, no backfill, no import index);
  - `orig/`: the 9 existing files as the base has them (`cb9913c`);
  - `diffs/`: one unified diff per changed existing file (`orig` to `real`), named after its path with `/` as `_`. Appendix A quotes all but the test file's;
  - `mutants.py`: the mutant runner;
  - the run scripts (`run-focused.sh`, `run-red-green.sh`, `run-mutants.sh`, `run-gate.sh`, `run-measure.sh`, `run-n5-whatif.sh`) and `explore/` (the scratch-only measurement files);
  - `SHA256SUMS` (Appendix D), covering all of the above and the proof outputs that are not logs;
  - the planner's logs in `proof/` and `logs/`, with their own `SHA256SUMS.logs`. `*.log` files are gitignored, so they may be missing on another machine: never check `SHA256SUMS.logs` as a gate, only `SHA256SUMS`.
  - If PL is missing, or a line of `PL/SHA256SUMS` does not answer `OK`, stop: BLOCKED.
- **Copy files with `cp` only.** Never `git apply` or `patch` PL's diffs. PL sits inside the main checkout's repository, and `git apply` run there takes the patch's paths against that repository. The diffs are for reading.
- Every shell call starts in a fresh directory, so type full paths. Below, WT, S and PL stand for the full paths above: type them out.
  - Git: `/usr/bin/git -C WT <command>`, one git command per call.
  - The shell is zsh. `status` is read-only there, so keep an exit code in `rc` (`cmd; rc=$?`).
  - To loop over files, use `bash -c '... while read -r f ...'` as the steps below do.
- **The heavy lock** wraps every workers run and the mutant runner:
  - before: `until mkdir /private/tmp/claude-501/jotbun-heavy.lock 2>/dev/null; do sleep 20; done`;
  - after, after a failure too: `rmdir /private/tmp/claude-501/jotbun-heavy.lock` (`cmd; rc=$?; rmdir ...`).
  - Never remove a lock you did not take; other agents share it.
  - If you run a step in the background, give it a time limit long enough to wait for the lock as well (an hour), and keep your turn open until it ends. A run stopped by its limit while it holds the lock leaves the lock behind.
- **FOCUSED** (from `WT/apps/edge`, always under the lock): `cd WT/apps/edge && npx vitest run --config vitest.workers.config.ts --reporter=verbose test/workers/files-alarm.test.ts test/workers/vault-schema.test.ts`.
  - `files-alarm.test.ts` is 1B-T11's file: this task adds 12 cases and changes 2.
  - `vault-schema.test.ts` pins the vault's table list, which gains `attachment_checks`.
- **AFFECTED** (from `WT/apps/edge`, under the lock): `cd WT/apps/edge && npx vitest run --config vitest.workers.config.ts --reporter=verbose test/workers/attachments.test.ts test/workers/imports-review.test.ts test/workers/imports-parse.test.ts test/workers/snapshots.test.ts test/workers/retention.test.ts test/workers/live.test.ts test/workers/currency-migration.test.ts test/workers/sync.test.ts test/workers/files-erase.test.ts`.
  - **R100 allows this run for a named reason, and this is it.** This task adds a migration with triggers on `attachments` and `transaction_attachments`, which every receipt write and every record purge fires. It also rewrites the two due-time reads those files pin, and reorders the alarm's prunes.
  - These are the files that run the alarm, or write receipts, holders, import records or migrations. They took about 11 seconds here.
- **R100: do not run `npm run test:edge:workers`.** CI runs the whole workers suite on the pull request; record it as "CI" in the receipt. Docker is stopped and stays stopped: `npm run test:edge:db` is recorded **SKIPPED** (CI's `edge` job runs it).
- **Load.** The machine is shared. FOCUSED took about 4 seconds here, AFFECTED about 11 and the mutant runner about 2 minutes. If a run fails on a timeout in a file this task does not change, rerun that file alone once and record both runs; a second failure is BLOCKED with the output.
- If a result differs from an "Expected" line, stop and report BLOCKED with the output. Do not change tests or code to make them pass.

## Readiness (the planner checked it)

- **Starts after 1B-T11: merged** (#387, `c8929f2`, issue #115 closed). Its review is Approved, and this task is its follow-up (`followups.md`, 1B-T11, "alarm-hardening").
- **The proof's base is `cb9913c`.**
  - Since `c8929f2`, nothing under `apps/edge`, `apps/api` or `packages` has changed. In between came #391 (`apps/app/src/wallet/looks/` only), receipts and controller state.
  - The root and `apps/edge` lockfiles are byte for byte the base's.
- **No new package, no lockfile change, no cloud resource, no owner decision, no account setting.** The one schema change is an additive migration (0004) of one bookkeeping table, four triggers and one partial index (P6, P7).
- **CI is stopped for billing** (handover, "Owner decisions waiting", OPEN since 10 Nov). That blocks merging, not this work: the pull request waits for CI like every other.
- **The other open work:** see "How this task meets the other open work" below.

## Scope

| File (under `apps/edge`) | Change |
| --- | --- |
| `src/vault/files/jobs.ts` | **1B-T11's.** `FILE_PRUNES` and `PRUNE_DUE_TIMES` list `pruneSnapshots` and `snapshotsDueAt` last (m1). Each entry is an arrow that calls its function when it runs (n5). A held one-run guard logs `file_run_held` and returns `['delete_objects']` (n1). |
| `src/vault/user-vault.ts` | **shared.** `rearm` keeps the promise of its `setAlarm` or `deleteAlarm`. A `.catch` logs `vault_alarm_unset` and sets `alarmAt` to null if it still names that alarm (n2). Nothing else changes. |
| `src/vault/files/attachments.ts` | **1B-T9's.** `attachmentsDueAt` reads the safety net only among `attachment_checks`, from that table first; the stamp term reads through `attachments_released_idx`. `pruneAttachments` empties `attachment_checks` in its first block (m4). |
| `src/vault/files/previews.ts` | **1B-T10's.** `LIVE_IMPORT_HEADS` (new constant). `importsDueAt` reads the live import heads through `entity_heads_imports_idx`, from them first (`CROSS JOIN`, m4). |
| `src/vault/migrations/0004_alarm_bounds.sql` | **new.** The `attachment_checks` table, its four triggers, the backfill of receipts that already have no holder, and `entity_heads_imports_idx` (m4). |
| `src/vault/migrations/index.ts` | **shared.** The `0004_alarm_bounds` journal entry: idx 4, `when` 1761696000000 (0003's plus 86,400,000). |
| `src/vault/schema.ts` | **shared.** `attachmentChecks` (Drizzle), and its entry in `vaultSchema`, so `VAULT_CORE_TABLES` lists it. |
| `src/cloudflare-workers.d.ts` | **shared.** `SqlStorageCursor` gains `readonly rowsRead: number` (the storage's own count, which the m4 case reads; P8). |
| `test/workers/files-alarm.test.ts` | **1B-T11's.** 12 new cases and 2 changed (the R37 case's seed, m1; the one-run case's `secondFailed`, n1): 35 cases. |
| `test/workers/vault-schema.test.ts` | **shared.** `'attachment_checks'` added to the table list (line 17). |
| `docs/implementation/receipts/alarm-hardening.md` | **new.** Your receipt (R87). |

Not in this task:
- 1B-T11's m3 and n6 (`snapshotsDueAt`'s stale term, `pruneSnapshots`' tombstone guard): fix-download-aborts'.
- `snapshots.ts` at all.
- n7 (1C-T11), n8 (1B-T12) and n10 (1B-T13).
- `recordsDue`, the alarm's purge read (P12).
- 1A's `nextDue` (P12).
- Any file of fix-download-aborts or 1B-T12.
- Anything under `apps/api`, `packages/contracts` or `vendor/`, and no new package.

**Size: M.** Four source files change, with one migration and the shared schema lines, plus one workers file with 12 new cases. It stays one commit.

## Interfaces (as `real/` has them)

No exported name is added or removed, and every signature stays. What changes:

```ts
// src/vault/files/jobs.ts
export const FILE_PRUNES: readonly FilePrune[]   // [uploads, exports, attachments, imports, snapshots]: each `(c) => pruneX(c)` (m1, n5)
export async function runFileJobs(v: UserVault, options?: FileJobOptions): Promise<FileJob[]>
//   another run in progress: logs file_run_held, returns ['delete_objects'] (n1); an erased vault: [] as before

// src/vault/user-vault.ts
rearm(c: FileContext, delayMs: number = CALL_ALARM_DELAY_MS): void
//   a refused setAlarm/deleteAlarm: logs vault_alarm_unset; alarmAt = null if it still names that alarm (n2)

// src/vault/files/attachments.ts (meaning unchanged, ruling R37; P6)
export function attachmentsDueAt(c: FileContext): number | null
export function pruneAttachments(c: FileContext): void    // also empties attachment_checks in its first block

// src/vault/files/previews.ts (meaning unchanged, ruling R37; P7)
export function importsDueAt(c: FileContext): number | null

// src/vault/schema.ts
export const attachmentChecks   // sqliteTable('attachment_checks', { attachmentId: text('attachment_id').primaryKey().notNull() })
```

```sql
-- src/vault/migrations/0004_alarm_bounds.sql (Appendix B)
CREATE TABLE attachment_checks (attachment_id TEXT PRIMARY KEY NOT NULL) STRICT;
-- triggers: attachments_checked_insert, attachments_checked_update (OF id, status), when the receipt is retained;
--           transaction_attachments_checked_delete, transaction_attachments_checked_update (OF attachment_id): the old receipt
-- backfill: the retained receipts that no record holds
CREATE INDEX entity_heads_imports_idx ON entity_heads (entity, entity_id)
  WHERE entity IN ('import_selection', 'import_review') AND state <> 'purged';
```

## Planner rulings (the calls this brief makes, with the reason for each)

- **P1. `pruneSnapshots` runs last, against the plan's listed order (m1).**
  - The plan's Interfaces list `FILE_PRUNES` as uploads, exports, snapshots, attachments, imports. `pruneImports` purges import records through `purgeEntities`, which raises `PURGE_WATERMARK` after `pruneSnapshots` has run. A ready snapshot then turns stale with its chunk rows, `snapshotsDueAt` answers now, and the alarm fires again at once. That breaks R37's rule (plan line 1002), and R37 wins.
  - The new order is uploads, exports, attachments, imports, snapshots. Only `pruneSnapshots` moves; the rest keep their relative order. `PRUNE_DUE_TIMES` follows it (its order changes nothing, since it takes the minimum).
  - Nothing else in the alarm purges after the prunes: `runDue` runs before them, `deleteDueObjects` and the starters purge nothing, and `pruneSnapshots`' own writes feed no other prune.
  - Pinned by the dedicated case and the R37 case (J1).
- **P2. The R37 case's seed, and why its ready snapshot is read one revision ahead.**
  - The controller asked for a ready snapshot and a due import record in the R37 case. That case also seeds a record deleted 31 days before `t0`, which `runDue` purges at `t0` before any prune runs.
  - A snapshot read at the seed's revision therefore goes stale in that purge. In either order `pruneSnapshots` then releases it in the same alarm, so that seed passes on the base and pins nothing (`PL/proof/naive-r37-seed-on-base.log`).
  - So `seedDueWork` writes the snapshot with `high_water` one past the seed's revision. That is the revision `runDue`'s one purge group takes at `t0`, as if the snapshot was built just after that purge. Only the import purge later in the same alarm makes it stale. On the base the case fails, with `prune_files: expected <t0> to be greater than <t0>`.
  - The comment in the seed says what would break it: another purge before `pruneSnapshots` in either order, such as a second purge group or an export past its 30 days.
  - The review's own probe is also a case of its own (`an import purge in the same alarm ...`). It builds a real snapshot with `buildSnapshot` and seeds one import record, so it needs no such offset.
- **P3. m2, n3 and n4 are pins of code that is right today.** These cases pass at RED, by design. Each kills one of the alarm lens's surviving mutants:
  - PA (m2) kills R1 (here J4);
  - PH (n3) kills R11 (U5);
  - PE and PF (n4) kill R2 and R3 (U6, U7).

  They are the lens's probes, ported into `files-alarm.test.ts`'s helpers. PE requests its export with `requestExport` before moving the vault clock, and PF names its key with `vaultObjectKey`.
- **P4. A held one-run guard returns `['delete_objects']` and logs `file_run_held` (n1).**
  - Any non-empty answer brings the alarm back `RETENTION_RETRY_MS` later. `delete_objects` is the job the run in progress holds: P6's guard exists for `deleteDueObjects`.
  - The log line makes a stuck run visible. It can happen only if a run outlives its alarm handler, for example when R2 hangs past the wall-clock limit.
  - It is logged like every other failed file job, with `logFailure` and an `Error` (the log carries its class name only).
  - The one-run case changes to `secondFailed: ['delete_objects']`, with a changed-form comment.
  - Pinned by PG and the one-run case (J2, J3).
- **P5. One `.catch` on the settled `setAlarm` or `deleteAlarm` (n2).**
  - It logs `vault_alarm_unset`, the event `rearm`'s synchronous catch already uses. Then, only if `alarmAt` still equals the `at` it asked for, it sets `alarmAt` to null.
  - Why null: after a refusal the stored alarm is unknown, and null makes the next `rearm` call `setAlarm` again. A refused `deleteAlarm` leaves at most an alarm that fires, finds nothing due and is gone.
  - Why only while it still names that alarm: a refusal can land after a later `rearm` set another alarm, which must stay (U3).
  - The cases make the storage refuse with `vi.spyOn(state.storage, 'setAlarm')`. The planner checked that `state.storage` is the vault's own `ctx.storage` (`PL/explore/zz-planner-spy.test.ts`, `logs/explore-spy.log`). workerd's own refusal, `setAlarm(<= 0)`, cannot happen any more, because of the write floor (R104).
  - On the base, the refused promise was dropped with no log, and `alarmAt` kept the refused time.
  - Pinned by the two n2 cases (U1 to U4).
- **P6. m4, receipts: the safety net reads only `attachment_checks`, which four triggers fill.**
  - **The cost.** `attachmentsDueAt`'s safety net, "a retained receipt no record holds", is an anti-join. Its usual answer, none, needs a look at every retained receipt and its holder: 2 rows read per receipt, 10,001 rows and 0.705 ms at the review's 5,000 receipts.
  - **Exact and bounded.** An exact answer that does not grow with the receipts needs state kept on the events that can change it.
    - A retained receipt can be left with no holder only by four events:
      - it is inserted before any record holds it;
      - it is set back to retained;
      - its last holder is deleted;
      - its last holder is moved to another receipt.
    - 0004's four triggers write each such receipt into `attachment_checks`, unconditionally on a holder's delete or move.
    - `attachmentsDueAt` checks the safety net only among those rows, reading `attachment_checks` first. With a plain `JOIN` the planner scans `attachments` first, and the read costs as much as before (A3: 0.6 ms).
    - `pruneAttachments` keeps its pass over every retained receipt, which is the safety net proper and runs once per alarm. It empties the table in the same block, so the invariant holds: after that block no receipt is retained with no holder, and every later event that could leave one is listed.
    - The backfill lists the receipts an upgraded vault already has with no holder.
    - After the change: 2 rows and 0.005 ms, at 5,000 receipts or at 20,000.
  - **Why triggers may keep a safety net's state.**
    - These triggers are not B20's release triggers. They are separate, and fire on every SQL statement, the 1B-T9 review's DU-2 included: it drops only B20's trigger before it deletes the holder.
    - A statement that went around these triggers too is still found by the next alarm's full pass. That is the same degraded case as the 1B-T9 review's X5 (the safety net not scheduled), behind two layers instead of one.
    - The table is part of the schema, so `schema.ts` defines it and `vault-schema.test.ts` lists it.
  - **The alternatives measured** (`PL/logs/m4-measure-1.log` to `-3.log`, at the review's sizes):
    - an index on status alone: 0.66 ms (the review);
    - the OR split in two, with no new index: 0.63 ms;
    - a covering partial index on retained ids: 0.555 ms, since the per-receipt holder probe dominates;
    - a count comparison: 0.225 ms, but still linear, and inexact once a held receipt is released by hand;
    - the safety net left out on the write path only: this changes what `fileJobsDue` means depending on its caller.
  - Pinned by the receipts case, the upgrade case and the rows case (A1 to A5, M1 to M5).
- **P7. m4, imports: a partial index on the live import heads, which `importsDueAt` reads first.**
  - **The cost.** The record term walked every import record the vault ever had, purged ones included, since purged heads are never deleted. Since 0003's `entity_changes_entity_idx`, the planner walks them through the change log (`SEARCH g USING INDEX entity_changes_entity_idx (entity=?)`).
  - **The fix.** `entity_heads_imports_idx` holds only the two import entities' heads that are not purged.
    - SQLite uses a partial index only when the query's WHERE contains the index's terms, and a bound parameter does not match the index's literals. So `importsDueAt`'s WHERE names the two entities literally, through `LIVE_IMPORT_HEADS`, which interpolates the API's `SELECTION_ENTITY` and `REVIEW_ENTITY`. The WHERE matches the index's term for term, in the same order (P4 in the mutants is the order swapped).
    - `CROSS JOIN` makes the heads the outer loop. Without it, the planner keeps walking the changes even with the index (measured: 0.62 ms).
  - **Why not an index over every live head** (with no entity term): it would hold almost all of a vault's heads. The 1B-T11 review's n10 found that 0003's indexes already cost about 3% of the ten-times vault's records. The narrow index is empty in a vault with no imports.
  - Pinned by the rows case and the imports case (P1 to P4, M6, M7). P2 also fails the R37 case: without the state term, a purged record's purge change counts as a due record, and the alarm loops.
- **P8. The m4 pins read the storage's own `rowsRead`, not plan text or timings.**
  - `SqlStorageCursor.rowsRead` is Cloudflare's count of the rows a statement read. The rows case compares a vault with 100 held receipts and 100 purged import records against an empty one: on the base `{ receipts: 201, imports: 206 }` against `{ receipts: 2, imports: 6 }`, and equal after the change.
  - It is behavioural and deterministic, and it fails for every index and join-order mutant (A2, A3, A4, P1, P2, P3, P4, M6, M7). Plan strings would tie the test to SQLite's wording, and timings flake.
  - `src/cloudflare-workers.d.ts` is the edge's hand-written Workers types, which declare "only what the vault and its tests use", so `rowsRead` is declared there.
- **P9. The before-and-after cost (m4)**, the functions themselves, with `PL/explore/zz-planner-measure.test.ts`:
  - The same file ran on the base (every changed file at `orig/`, no 0004) and on `real/` (`PL/run-measure.sh`, `proof/measure-before.log` and `proof/measure-after.log`).
  - Each figure is the median of 5 runs of 200 calls. After the seed, `pruneAttachments` ran once, as an alarm would.
  - Rows read are the storage's own count.

  | At 30,000 records (3,000 deleted) | 5,000 held receipts and 3,000 purged import records (the review's sizes): before | after | 20,000 held receipts and 30,000 purged import records: before | after |
  | --- | --- | --- | --- | --- |
  | `attachmentsDueAt` | 0.705 ms, 10,001 rows | 0.005 ms, 2 rows | 4.08 ms, 40,001 rows | 0.005 ms, 2 rows |
  | `importsDueAt` | 0.64 ms, 6,006 rows | 0.01 ms, 6 rows | 8.635 ms, 60,006 rows | 0.01 ms, 6 rows |
  | `fileJobsDue` (all file due times) | 1.5 ms | 0.035 ms | 12.815 ms | 0.03 ms |
  | `nextDue` (1A's, unchanged) | 0.015 ms | 0.015 ms | 0.33 ms | 0.3 ms |
  | `reschedule`'s block (after every write) | 1.7 ms | 0.04 ms | 13.55 ms | 0.365 ms |

  The review measured 0.72 ms, 0.64 ms, 1.39 ms and 1.52 ms for the first four "before" figures; this run agrees. 0003 saves about 1.2 ms per write at these sizes, and `fileJobsDue` now costs 0.035 ms, so the comparison the review made no longer holds.
- **P10. n5: every `FILE_PRUNES` and `PRUNE_DUE_TIMES` entry calls its function when it runs, with a comment saying why.**
  - The comment explains the cycle (`retention.ts` → `jobs.ts` → `exports.ts` and `previews.ts` → `retention.ts`), that the base worked only because the ten names are hoisted function declarations, and that Vite drops the bundler's circular-dependency warnings, so the build check was vacuous.
  - The cycle stays. Breaking it means moving `purgeEntities` out of `retention.ts`, which edits two more files for no behaviour.
  - This is a what-if, not a mutant: at runtime today the code is equivalent. The what-if is the review's R4, which turns `pruneExports` into a `const` function expression (`PL/run-n5-whatif.sh`):
    - with this `jobs.ts`, all 35 cases pass and only the 2 deliberate `file_prune_failed` lines appear (`proof/whatif-n5-real.log`);
    - with the base's `jobs.ts`, 23 `file_prune_failed` lines appear and 7 cases fail (`proof/whatif-n5-base-jobs.log`).
- **P11. n9: 1B-T11's P14 bound holds for import reviews, not selections.**
  - The parse quota (10 a day) bounds `import_review` records. `import_selection` records are bounded only by the write budget (60 a minute). `pruneImports`' uncapped loop still ends, because each pass purges what it read.
  - The correction lives in this task's receipt.
  - 1B-T11's receipt (`receipts/1B-T11.md:82`) and brief are another task's record, so neither is edited. The controller may note the correction there.
- **P12. Left as they are, with the reason:**
  - **`recordsDue`** (`pruneImports`' purge read) still walks every head of one import entity. It runs once or twice per alarm, not per write. It could use `LIVE_IMPORT_HEADS` later.
  - **`snapshotsDueAt`'s scan** of `snapshots`: that file is fix-download-aborts', and the table stays small (failed rows come only from failed builds).
  - **1A's `nextDue`**: its `hasSupersededChange` counts every change and head, 0.3 ms at 60,000. That is 1A's code, a note for later.
  - **The other alarm rules of 1B-T11's brief** (P2 to P9, R104's floor and keep rule) are unchanged, and their cases still pass.
- **P13. The RED's stub: 0004 as the table only, and the four source files at their base.**
  - The tests read `attachment_checks`, the `0004_alarm_bounds` journal entry and `rowsRead`. Those are compile-safe seams, so a missing table is not counted as a RED. With the table present and nothing filling it, every RED failure is an `AssertionError`.
  - `index.ts`, `schema.ts`, `cloudflare-workers.d.ts` and both test files are `real/` from Step 1.
- **P14. Hosted checks are SKIPPED.** Nothing is deployed. The whole workers suite is CI's (R100), and `test:edge:db` is SKIPPED (Docker is stopped). AFFECTED runs locally for the reason given above.

## How this task meets the other open work

- **fix-download-aborts** (planner in flight: `src/v1/files/*`, `src/v1/handler.ts`, and test pins in the download, snapshot, import, attachment and preview test files). This task edits none of those test files.
  - **`attachments.ts` (base line numbers):**
    - line 346, `pruneAttachments`' doc comment (1 line becomes 4);
    - one new line after 354 (`DELETE FROM attachment_checks`);
    - line 365, `attachmentsDueAt`'s one-line doc (becomes 7);
    - line 369, the `waiting` line (becomes 2).
  - **Unchanged in `attachments.ts`:**
    - line 370, `oldest`, which holds DU-1's guard `AND ${OBJECT_GONE}`, byte for byte;
    - lines 334 and 336 (`UNHELD`, `OBJECT_GONE`).
  - **`previews.ts` (base line numbers):**
    - a new 7-line block after line 328 (`LIVE_IMPORT_HEADS`);
    - line 333 (doc comment);
    - lines 344 and 345 (`JOIN` becomes `CROSS JOIN`; the WHERE becomes `${LIVE_IMPORT_HEADS}`);
    - line 347 (the `REVIEW_ENTITY` binding goes).
  - **Unchanged in `previews.ts`:** line 188, the preview's accepted-upload guard.
  - **DU-1 and DU-2 still hold.** The 1B-T9 review's own probes pass on this task's code: `PL/proof/du-probes-on-real.log`, run from a copy of `scratch/1b-t9-review/tree/apps/edge/test/workers/zz-review-probes.test.ts` (kept as `PL/explore/zz-review-probes-1b-t9.test.ts`), with `-t "DU-"`, 2 passed. DU-2 drops B20's trigger before it deletes the holder; `transaction_attachments_checked_delete` still lists the receipt, so `attachmentsDueAt` answers now. This task's receipts case does the same.
  - **The 1B-T9 review's X5 no longer applies as text** (`OR (${UNHELD})` is gone); its equivalent on the new text is this brief's A1. In whichever order the two tasks merge, a mutant run after both have merged must use A1's text for X5. X4 (DU-1's `AND ${OBJECT_GONE}`) applies unchanged either way.
- **1B-T12** (parity session files and `apps/edge/test/support/`): no overlap.
- **Later vault migrations:** this task takes 0004. Step 0.5 stops if another task took it first.

## Step 0: Sync, install, and check the base

1. `/usr/bin/git -C WT fetch origin claude/p1a-vault-core`, then `/usr/bin/git -C WT merge --no-edit origin/claude/p1a-vault-core`. Expected: "Already up to date" or a fast-forward. Record the head: `/usr/bin/git -C WT log --oneline -1`.
2. If `WT/node_modules` is missing: `cd WT && npm ci --ignore-scripts --no-audit --no-fund`, then `cd WT && npm run install:edge`.
3. `mkdir -p S`.
4. PL's files: `cd PL && shasum -a 256 -c SHA256SUMS > S/pl-sums.out 2>&1; rc=$?; echo $rc` then `grep -v ': OK$' S/pl-sums.out`. Expected: exit 0, and no line printed.
5. The base: `bash -c 'cd PL/orig && find . -type f | sort | while read -r f; do cmp -s "$f" "WT/apps/edge/$f" && echo "OK $f" || echo "DIFF $f"; done'`. Expected: 9 lines, all `OK`:
   - `src/cloudflare-workers.d.ts`;
   - `src/vault/files/attachments.ts`, `src/vault/files/jobs.ts`, `src/vault/files/previews.ts`;
   - `src/vault/migrations/index.ts`, `src/vault/schema.ts`, `src/vault/user-vault.ts`;
   - `test/workers/files-alarm.test.ts`, `test/workers/vault-schema.test.ts`.

   Also `ls WT/apps/edge/src/vault/migrations/`. Expected: `0000_vault_core.sql`, `0001_vault_files.sql`, `0002_currencies_trips.sql`, `0003_alarm_indexes.sql` and `index.ts` (no `0004_*`). A `DIFF` line or an existing `0004_*` file: stop, BLOCKED, with the output (a later merge moved a file this task changes).

## Step 1: The RED's files

Copy (each `mkdir -p` its folder first if needed):
- `PL/real/test/workers/files-alarm.test.ts` → `WT/apps/edge/test/workers/files-alarm.test.ts`
- `PL/real/test/workers/vault-schema.test.ts` → `WT/apps/edge/test/workers/vault-schema.test.ts`
- `PL/real/src/cloudflare-workers.d.ts` → `WT/apps/edge/src/cloudflare-workers.d.ts`
- `PL/real/src/vault/schema.ts` → `WT/apps/edge/src/vault/schema.ts`
- `PL/real/src/vault/migrations/index.ts` → `WT/apps/edge/src/vault/migrations/index.ts`
- `PL/stubs/src/vault/migrations/0004_alarm_bounds.sql` → `WT/apps/edge/src/vault/migrations/0004_alarm_bounds.sql` (the **stub**)

Then `shasum -a 256` the six copies. Each must equal its `real/...` line in `PL/SHA256SUMS`, and the SQL file its `stubs/...` line. `jobs.ts`, `user-vault.ts`, `attachments.ts` and `previews.ts` stay at their base.

## Step 2: Typecheck the RED

`cd WT && npm run typecheck:edge > S/red-typecheck.log 2>&1; rc=$?; echo $rc`. Expected: exit 0.

## Step 3: RED

FOCUSED, under the lock, into `S/red.log`. Expected:
- vitest exit 1, `Test Files  1 failed | 1 passed (2)`, `Tests  9 failed | 40 passed (49)`;
- every failure an `AssertionError` (9 `AssertionError` lines; no `TypeError`, `ReferenceError` or `no such table`).

The nine failures, each with its message:
1. `files on the vault alarm (the plan) > after any alarm, every scheduled time is later than now`: `prune_files: expected <t0> to be greater than <t0>` (m1, P2).
2. `the controller's notes > only one file run at a time: a second run while the first waits on R2 deletes nothing`: `secondFailed` is `[]` (n1).
3. `alarm-hardening: the 1B-T11 review's findings > an import purge in the same alarm releases a ready snapshot it makes stale, so no job is left due at the vault clock`: `expected [ { chunk_index: +0 } ] to deeply equal []` (m1).
4. `... > an alarm that finds another file run in progress reports its delete as failed, so it comes back a minute later`: `{ held: false, after: <t> }` against `{ held: true, after: <t + 60,000> }` (n1).
5. `... > a setAlarm the storage refuses is logged and forgotten, so the next rearm sets the alarm again` (n2).
6. `... > a refusal that lands after a later rearm leaves that alarm alone, and a refused deleteAlarm is logged`: `expected [] to have a length of 2 but got +0` (n2).
7. `... > the due-time reads after a write read as many rows with a hundred held receipts and purged import records as with none`: `expected { receipts: 201, imports: 206 } to deeply equal { receipts: 2, imports: 6 }` (m4).
8. `... > a receipt left with no holder is due at once however it lost its holder, and the prune that releases it empties the checks`: the checks are `[]` (m4).
9. `... > a vault upgraded from 0003 starts its checks with the receipts that already have no holder`: `{ checks: [], due: <t> }` (m4).

Also expected:
- The other 5 new cases pass at RED by design (P3): PA, PH, PE, PF, and `importsDueAt counts the live import records only ...` (it pins the filter the base already has).
- All 14 `vault-schema.test.ts` cases pass.
- The event lines, which you count with `grep -o '"event":"[a-z_]*"' S/red.log | sort | uniq -c`:
  - `file_prune_failed` 2, `object_delete_failed` 1, `work_start_failed` 1, `vault_retention_purge_failed` 1 (the base's);
  - `file_delete_failed` 1 (PA) and `vault_alarm_unset` 1 (PH).

## Step 4: GREEN

1. Copy from `PL/real` into `WT/apps/edge`: `src/vault/files/jobs.ts`, `src/vault/user-vault.ts`, `src/vault/files/attachments.ts`, `src/vault/files/previews.ts`, and `src/vault/migrations/0004_alarm_bounds.sql` (the real one, over the stub).
2. `bash -c 'cd PL/real && find . -type f | sort | while read -r f; do cmp -s "$f" "WT/apps/edge/$f" && echo "OK $f" || echo "DIFF $f"; done'`. Expected: 10 lines, all `OK`.
3. `cd WT && npm run typecheck:edge > S/green-typecheck.log 2>&1; rc=$?; echo $rc`. Expected: exit 0.
4. FOCUSED, under the lock, into `S/green.log`. Expected:
   - vitest exit 0, `Test Files  2 passed (2)`, `Tests  49 passed (49)`;
   - no `Unhandled`, `uncaught` or `Errors` line;
   - the event lines: `file_prune_failed` 2, `object_delete_failed` 1, `work_start_failed` 1, `vault_retention_purge_failed` 1, `file_delete_failed` 1, `file_run_held` 2 (PG and the one-run case) and `vault_alarm_unset` 4 (the two n2 cases' 3 and PH's 1). That is 12 lines, the base's 5 and 7 new.
5. `/usr/bin/git -C WT status --short`. Expected: the nine changed files (` M`) and `?? apps/edge/src/vault/migrations/0004_alarm_bounds.sql`, nothing else.

## Step 5: Mutation check

1. `python3 -I PL/mutants.py --check WT/apps/edge`. Expected: `28 mutants, 49 cases; old text found exactly once and every required case exists: True`.
2. `bash -c 'cd WT/apps/edge && shasum -a 256 src/vault/files/jobs.ts src/vault/user-vault.ts src/vault/files/attachments.ts src/vault/files/previews.ts src/vault/migrations/0004_alarm_bounds.sql src/vault/schema.ts' > S/mutant-files.sha256`.
3. Under the lock (the run takes about 2 minutes): `python3 -I PL/mutants.py WT/apps/edge S > S/mutants.out 2>&1; rc=$?`, then release the lock. Expected:
   - exit 0;
   - 28 lines ending `restored=True`, each `KILLED`;
   - no `SURVIVED`, `NOT APPLIED` or `REQUIRED BUT PASSED`.

   Each mutant, with its change and its failing count (FOCUSED's `files-alarm.test.ts`, except S1). The cases that kill each one are in `PL/proof/mutants.out`.
   - **J1** `jobs.ts`, `pruneSnapshots` back in third place (m1): 2 failed (the R37 case, the m1 case).
   - **J2** `jobs.ts`, a held guard reports success (n1): 2 failed (PG, the one-run case).
   - **J3** `jobs.ts`, a held guard is not logged (n1): 1 failed (PG).
   - **J4** `jobs.ts`, a delete's throw is logged, not reported (m2; the lens's R1): 1 failed (PA).
   - **U1** `user-vault.ts`, the settled alarm call left unhandled (n2): 2 failed (both n2 cases).
   - **U2** `user-vault.ts`, a refusal keeps `alarmAt` (n2): 1 failed.
   - **U3** `user-vault.ts`, a refusal clears `alarmAt` even after a later rearm (n2): 1 failed.
   - **U4** `user-vault.ts`, a refusal not logged (n2): 2 failed.
   - **U5** `user-vault.ts`, `rearm` throws instead of logging (n3; the lens's R11): 1 failed (PH).
   - **U6** `user-vault.ts`, `background()` with no write floor (n4; R2): 1 failed (PE).
   - **U7** `user-vault.ts`, `rearming()` with no write floor (n4; R3): 1 failed (PF).
   - **A1** `attachments.ts`, no safety net (the 1B-T9 review's X5): 2 failed (the receipts case, the upgrade case).
   - **A2** `attachments.ts`, the safety net reads every retained receipt again: 1 failed (the rows case).
   - **A3** `attachments.ts`, `JOIN` instead of `CROSS JOIN`: 1 failed (the rows case).
   - **A4** `attachments.ts`, the prune keeps the checks: 2 failed (the receipts case, the rows case).
   - **A5** `attachments.ts`, no stamp term: 1 failed (the receipts case).
   - **P1** `previews.ts`, `JOIN` instead of `CROSS JOIN`: 1 failed (the rows case).
   - **P2** `previews.ts`, no purged-state term: 3 failed (the R37 case, the imports case, the rows case).
   - **P3** `previews.ts`, no selections: 2 failed (the imports case, the rows case).
   - **P4** `previews.ts`, the entity names in the other order: 1 failed (the rows case).
   - **M1** to **M4** `0004`, each trigger missing (insert, set back to retained, holder deleted, holder moved): 1 failed each (the receipts case).
   - **M5** `0004`, no backfill: 1 failed (the upgrade case).
   - **M6** `0004`, no import index: 1 failed (the rows case).
   - **M7** `0004`, the import index keeps purged heads: 1 failed (the rows case).
   - **S1** `schema.ts`, `attachment_checks` missing from `vaultSchema`: 1 failed in `vault-schema.test.ts` (`a new vault has every core table, migrated once`).

   Compare with `PL/proof/mutants.out`: the same labels, verdicts and failing cases.
4. `shasum -a 256 -c S/mutant-files.sha256`. Expected: 6 `OK`. Then repeat Step 4.2 (10 `OK`) and Step 4.5.

## Step 6: The gate (R100's fast local gate)

From WT, each with its log in S:
1. `npm run typecheck:edge`: exit 0.
2. FOCUSED once more, under the lock: `Tests  49 passed (49)`, the same 12 event lines.
3. `npm run test:edge`: exit 0, no failed test. Record the line vitest prints, but do not compare it with any number.
4. `npm run build:edge`: exit 0. `dist/jotbun_vault/index.js` grows by about 5.5 kB over the base's: 1,671.04 kB to 1,676.57 kB at the planner's base `cb9913c` (0004's SQL is bundled as text). Record yours.
5. AFFECTED, under the lock: vitest exit 0, `Test Files  9 passed (9)`, and no failed case.
6. `/usr/bin/git -C WT diff --check`: no output.
7. Not run here, and why (put this in the receipt):
   - `npm run test:edge:workers` (the whole workers suite): CI, under R100;
   - `npm run test:edge:db`: SKIPPED, Docker is stopped; CI's `edge` job runs it;
   - `export:web` and the iOS export: no route or app entry changed;
   - `apps/app` and `apps/api` suites: no file there changed (CI's other jobs run them).

## Step 7: Receipt and commit

1. Write `docs/implementation/receipts/alarm-hardening.md` from Appendix C, with your own numbers where they differ. List every case by name, and every mutant.
2. Add exactly these files:

   `/usr/bin/git -C WT add apps/edge/src/vault/files/jobs.ts apps/edge/src/vault/user-vault.ts apps/edge/src/vault/files/attachments.ts apps/edge/src/vault/files/previews.ts apps/edge/src/vault/migrations/0004_alarm_bounds.sql apps/edge/src/vault/migrations/index.ts apps/edge/src/vault/schema.ts apps/edge/src/cloudflare-workers.d.ts apps/edge/test/workers/files-alarm.test.ts apps/edge/test/workers/vault-schema.test.ts docs/implementation/receipts/alarm-hardening.md`

   Then `/usr/bin/git -C WT status --short`. Expected: those 11 staged, nothing else.
3. Write the message to `S/commit-message.txt`:
   ```
   Harden the vault alarm and keep its due-time reads bounded

   Run pruneSnapshots after the prunes that purge, so a snapshot a purge in
   the same alarm makes stale is released in that alarm (R37). Report a held
   one-run guard as a failed delete, and log and forget an alarm the storage
   refuses, so the alarm comes back a minute later instead of at once. Bound
   the due-time reads that run after every write: the receipt safety net
   reads only the receipts whose holders changed (attachment_checks, kept by
   triggers), and the import read only the live import records
   (entity_heads_imports_idx). Pin the delete report, the write floor through
   background() and rearming(), and rearm's catch.

   Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
   ```
4. `/usr/bin/git -C WT commit -F S/commit-message.txt`. Then:
   - `/usr/bin/git -C WT log --oneline -1`;
   - `/usr/bin/git -C WT show --stat HEAD`: 11 files;
   - `/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD`: no output.

The summary line is: **Harden the vault alarm and keep its due-time reads bounded**.

## Your final message

As the protocol says:
- `STATUS: DONE` (or `STATUS: BLOCKED` with the exact blocker) on the first line;
- the commit SHA and branch; the files changed;
- RED (9 failed, 40 passed) and GREEN (49 passed);
- mutants (28 killed);
- each gate command with its result;
- SKIPPED items;
- deviations: P1's order, the R37 seed's one-revision offset (P2), the new table (P6), and the `rowsRead` declaration (P8).

What the reviewer should look at first:
- 0004's four triggers, the backfill, and `pruneAttachments` emptying the table in the same block as its full pass (P6's invariant);
- `LIVE_IMPORT_HEADS` against `entity_heads_imports_idx`'s WHERE;
- the n2 catch's `alarmAt === at` guard;
- the R37 seed's comment.

---

## Appendix A: the source diffs (`orig` to `real`; the test file's diff is `PL/diffs/test_workers_files-alarm.test.ts.diff`)

### `src/vault/files/jobs.ts`

```diff
@@ -24,11 +24,34 @@ export const FILE_JOBS: readonly FileJob[] = ['prune_files', 'delete_objects', '
 /** One prune: it opens its own short blocks, so it is never called inside another (R21). */
 export type FilePrune = (c: FileContext) => void

-/** The five prunes, in their tasks' order: uploads (1B-T5), exports (1B-T6), snapshots (1B-T8), receipts (1B-T9), imports (1B-T10). */
-export const FILE_PRUNES: readonly FilePrune[] = [pruneUploads, pruneExports, pruneSnapshots, pruneAttachments, pruneImports]
+// Each entry below calls its function when it runs, never while this module loads. retention.ts imports this
+// module, which imports exports.ts and previews.ts, which import retention.ts; in that cycle this module can run
+// first (it does in the vault bundle), so an entry that read one of their exports at load time would hold
+// undefined, or throw, unless that export happened to be a hoisted function declaration (the 1B-T11 review's
+// n5). The build would not say so either: Vite drops the bundler's circular-dependency warnings.
+
+/**
+ * The five prunes: uploads (1B-T5), exports (1B-T6), receipts (1B-T9), imports (1B-T10), then snapshots (1B-T8)
+ * last. pruneExports and pruneImports purge records, which raises the purge watermark, so a ready snapshot that
+ * a purge in this run makes stale has its chunks released in this run too, and snapshotsDueAt is not left at
+ * now (the 1B-T11 review's m1; ruling R37).
+ */
+export const FILE_PRUNES: readonly FilePrune[] = [
+  (c) => pruneUploads(c),
+  (c) => pruneExports(c),
+  (c) => pruneAttachments(c),
+  (c) => pruneImports(c),
+  (c) => pruneSnapshots(c),
+]

 /** The due time of each prune, in the same order. */
-const PRUNE_DUE_TIMES: readonly ((c: FileContext) => number | null)[] = [uploadsDueAt, exportsDueAt, snapshotsDueAt, attachmentsDueAt, importsDueAt]
+const PRUNE_DUE_TIMES: readonly ((c: FileContext) => number | null)[] = [
+  (c) => uploadsDueAt(c),
+  (c) => exportsDueAt(c),
+  (c) => attachmentsDueAt(c),
+  (c) => importsDueAt(c),
+  (c) => snapshotsDueAt(c),
+]

@@ -70,12 +93,18 @@ const running = new WeakSet<UserVault>()
  * One run at a time per vault: a run that finds another in progress returns at
- * once, so deleteDueObjects never overlaps itself (the 1B-T4 follow-up). Each
- * job's failure is logged and returned, never thrown, so the alarm comes back
- * a minute later and the platform never retries it in a loop.
+ * once, so deleteDueObjects never overlaps itself (the 1B-T4 follow-up), and
+ * reports delete_objects as failed, since the run in progress holds the delete:
+ * the alarm then comes back a minute later, not at once (the 1B-T11 review's
+ * n1). Each job's failure is logged and returned, never thrown, so the alarm
+ * comes back a minute later and the platform never retries it in a loop.
  */
 export async function runFileJobs(v: UserVault, options: FileJobOptions = {}): Promise<FileJob[]> {
-  if (v.erased || running.has(v)) return []
+  if (v.erased) return []
+  if (running.has(v)) {
+    logFailure('file_run_held', new Error('another file run is in progress'))
+    return ['delete_objects']
+  }
   running.add(v)
```

### `src/vault/user-vault.ts`

```diff
@@ -159,6 +159,10 @@ export class UserVault extends DurableObject<VaultEnv> {
    * RETENTION_RETRY_MS after a failed job. An erased vault never rearms. A
    * failure is logged, never thrown: the caller's work has already committed.
+   * So is a setAlarm or deleteAlarm that the storage refuses after this call
+   * returns, and alarmAt then forgets the alarm it meant (unless a later rearm
+   * has already replaced it), so the next rearm sets it again (the 1B-T11
+   * review's n2).
    */
@@ -168,9 +172,12 @@ export class UserVault extends DurableObject<VaultEnv> {
       if (at === this.alarmAt) return
-      if (at === null) void this.ctx.storage.deleteAlarm()
-      else void this.ctx.storage.setAlarm(at)
+      const settled = at === null ? this.ctx.storage.deleteAlarm() : this.ctx.storage.setAlarm(at)
       this.alarmAt = at
+      void settled.catch((error: unknown) => {
+        logFailure('vault_alarm_unset', error)
+        if (this.alarmAt === at) this.alarmAt = null
+      })
     } catch (error) {
```

### `src/vault/files/attachments.ts`

```diff
@@ -343,7 +343,10 @@ (pruneAttachments' doc comment)
- * past it (ruling R37). Set-based statements, no id lists (ruling R57).
+ * past it (ruling R37). Set-based statements, no id lists (ruling R57). The
+ * safety net reads every retained receipt here, so the receipts waiting in
+ * attachment_checks have all been checked, and the table is emptied in the
+ * same block (alarm-hardening).
@@ -352,6 +355,7 @@ export function pruneAttachments(c: FileContext): void {
     const stamped = c.sql.exec("UPDATE attachments SET released_at = ? WHERE status = 'released' AND released_at IS NULL RETURNING id", c.now.toISOString()).toArray()
+    c.sql.exec('DELETE FROM attachment_checks').toArray()
     if (unheld.length + due.length + stamped.length > 0) touch(c)
@@ -362,11 +366,18 @@
-/** When pruneAttachments next has work: now while a receipt waits for its stamp or has lost its holders, else the earliest release whose object is gone plus 30 days; null when none (ruling R37). */
+/**
+ * When pruneAttachments next has work: now while a receipt waits for its stamp or has lost its holders, else the
+ * earliest release whose object is gone plus 30 days; null when none (ruling R37). It runs after every write
+ * (1B-T11's rearm), so it reads no receipt it need not (alarm-hardening): the stamp through attachments_released_idx,
+ * and the safety net only among attachment_checks, the receipts whose holders changed since pruneAttachments last
+ * checked them all (0004's triggers keep it), read from that table first.
+ */
 export function attachmentsDueAt(c: FileContext): number | null {
   const { waiting, oldest } = c.sql
     .exec<{ waiting: number; oldest: string | null }>(
-      `SELECT EXISTS (SELECT 1 FROM attachments WHERE (status = 'released' AND released_at IS NULL) OR (${UNHELD})) AS waiting,
+      `SELECT EXISTS (SELECT 1 FROM attachments WHERE status = 'released' AND released_at IS NULL)
+           OR EXISTS (SELECT 1 FROM attachment_checks k CROSS JOIN attachments ON attachments.id = k.attachment_id WHERE ${UNHELD}) AS waiting,
               (SELECT min(released_at) FROM attachments WHERE status = 'released' AND released_at IS NOT NULL AND ${OBJECT_GONE}) AS oldest`,
```

### `src/vault/files/previews.ts`

```diff
@@ -326,11 +326,20 @@ export function pruneImports(c: FileContext): void {
+/**
+ * The import records that are not purged: the WHERE of 0004's entity_heads_imports_idx, term for term, so the
+ * planner can read that index. A purged head stays for good, so without it importsDueAt would walk every import
+ * record the vault ever had, after every write (alarm-hardening).
+ */
+const LIVE_IMPORT_HEADS = `h.entity IN ('${SELECTION_ENTITY}', '${REVIEW_ENTITY}') AND h.state <> 'purged'`
+
 /**
  ...
- * expires; null when none will (ruling R37).
+ * expires; null when none will (ruling R37). The records are read from their
+ * live heads first (CROSS JOIN fixes that order; otherwise the planner walks
+ * every change of the two entities through entity_changes_entity_idx).
  */
@@ -341,10 +350,9 @@ export function importsDueAt(c: FileContext): number | null {
                  FROM entity_heads h
-                 JOIN entity_changes g ON g.revision = h.revision AND g.entity = h.entity AND g.entity_id = h.entity_id
-                WHERE h.entity IN (?1, ?2) AND h.state <> 'purged') AS record`,
+                 CROSS JOIN entity_changes g ON g.revision = h.revision AND g.entity = h.entity AND g.entity_id = h.entity_id
+                WHERE ${LIVE_IMPORT_HEADS}) AS record`,
       SELECTION_ENTITY,
-      REVIEW_ENTITY,
     )
```

### `src/vault/migrations/index.ts`, `src/vault/schema.ts`, `src/cloudflare-workers.d.ts`, `test/workers/vault-schema.test.ts`

```diff
+import alarmBounds from './0004_alarm_bounds.sql?raw'
+      { idx: 4, when: 1761696000000, tag: '0004_alarm_bounds', breakpoints: true },
-  migrations: { m0000: core, m0001: files, m0002: currenciesTrips, m0003: alarmIndexes },
+  migrations: { m0000: core, m0001: files, m0002: currenciesTrips, m0003: alarmIndexes, m0004: alarmBounds },

+/** The receipts whose holders changed since pruneAttachments last checked every receipt (0004, alarm-hardening): kept by triggers, emptied by pruneAttachments. */
+export const attachmentChecks = sqliteTable('attachment_checks', {
+  attachmentId: text('attachment_id').primaryKey().notNull(),
+})
   (in vaultSchema, after aiUsage:)
+  attachmentChecks,

   (SqlStorageCursor, after [Symbol.iterator]:)
+  // The rows the statement has read so far, the storage's own count (a test reads it to show a read stays bounded).
+  readonly rowsRead: number

   (vault-schema.test.ts line 17, the table list:)
-  ... 'ai_usage', 'attachments', ...
+  ... 'ai_usage', 'attachment_checks', 'attachments', ...
```

### `test/workers/files-alarm.test.ts` (what changes; the whole diff is in PL)

- **Header comment:** one more sentence (alarm-hardening's cases).
- **Imports:** `drizzle`, `migrate`, `attachmentsDueAt`, `pruneAttachments`, `FileContext`, `importsDueAt`, `VAULT_MIGRATIONS`, `HOUR`, `migrateBefore`, `builtinId`.
- **New helpers:**
  - `both`, `logged`, `settle`, `isoOf` and `FILE_SHA`;
  - after `seedDueWork`: `seedReceipts`, `aroundTrigger` and `seedImportRecords`.
- **Changed:**
  - `after any alarm, every scheduled time is later than now`: its comment, and one assertion more (the seeded review is purged);
  - `seedDueWork`: the import review record and the ready snapshot with its chunk and key (P2); it returns `{ snapshot, review }`;
  - `only one file run at a time: ...`: a changed-form comment, and `secondFailed: ['delete_objects']`.
- **New `describe("alarm-hardening: the 1B-T11 review's findings")`** (12 cases):
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

## Appendix B: `0004_alarm_bounds.sql`

### The real file (`PL/real/src/vault/migrations/0004_alarm_bounds.sql`)

```sql
-- Bounds for the alarm's due-time reads (alarm-hardening, the 1B-T11 review's m4). attachmentsDueAt and
-- importsDueAt run after every write that touches the vault (1B-T11's rearm), so neither may read every row its
-- table has ever held. 0000 to 0003 are never edited.
--
-- The receipts whose holders changed since pruneAttachments last checked every receipt. A retained receipt can be
-- left with no holder only by one of the four events below: it is inserted, or set back to retained, before any
-- record holds it; or its last holder is deleted, or moved to another receipt (B20's triggers release it then,
-- unless a statement went around them). So attachmentsDueAt's safety net, a retained receipt no record holds, reads
-- only the receipts listed here. pruneAttachments still checks every retained receipt and empties this table in the
-- same block. No foreign key: a listed receipt that has gone is skipped by the join and dropped at the next prune.
CREATE TABLE attachment_checks (
  attachment_id TEXT PRIMARY KEY NOT NULL
) STRICT;
--> statement-breakpoint
CREATE TRIGGER attachments_checked_insert AFTER INSERT ON attachments
  WHEN NEW.status = 'retained'
BEGIN
  INSERT OR IGNORE INTO attachment_checks (attachment_id) VALUES (NEW.id);
END;
--> statement-breakpoint
CREATE TRIGGER attachments_checked_update AFTER UPDATE OF id, status ON attachments
  WHEN NEW.status = 'retained'
BEGIN
  INSERT OR IGNORE INTO attachment_checks (attachment_id) VALUES (NEW.id);
END;
--> statement-breakpoint
CREATE TRIGGER transaction_attachments_checked_delete AFTER DELETE ON transaction_attachments
BEGIN
  INSERT OR IGNORE INTO attachment_checks (attachment_id) VALUES (OLD.attachment_id);
END;
--> statement-breakpoint
CREATE TRIGGER transaction_attachments_checked_update AFTER UPDATE OF attachment_id ON transaction_attachments
  WHEN OLD.attachment_id IS NOT NEW.attachment_id
BEGIN
  INSERT OR IGNORE INTO attachment_checks (attachment_id) VALUES (OLD.attachment_id);
END;
--> statement-breakpoint
-- A vault upgraded from 0003 starts with the receipts that already have no holder.
INSERT INTO attachment_checks (attachment_id)
  SELECT id FROM attachments
   WHERE status = 'retained' AND NOT EXISTS (SELECT 1 FROM transaction_attachments ta WHERE ta.attachment_id = attachments.id);
--> statement-breakpoint
-- The import records that are not purged. A purged head stays for good, so without this index importsDueAt would
-- walk every import record the vault ever had. Its WHERE is importsDueAt's (previews.ts, LIVE_IMPORT_HEADS), term
-- for term, so the planner can use it: the entity names are the API's REVIEW_ENTITY and SELECTION_ENTITY.
CREATE INDEX entity_heads_imports_idx ON entity_heads (entity, entity_id)
  WHERE entity IN ('import_selection', 'import_review') AND state <> 'purged';
```

### The RED's stub (`PL/stubs/src/vault/migrations/0004_alarm_bounds.sql`)

```sql
-- The RED's stub of 0004 (alarm-hardening): the checks table only, so the tests can read it. No triggers, no
-- backfill and no import index: nothing fills the table, and the due-time reads still read every row.
CREATE TABLE attachment_checks (
  attachment_id TEXT PRIMARY KEY NOT NULL
) STRICT;
```

## Appendix C: the receipt template

```markdown
# alarm-hardening: Harden the vault alarm after 1B-T11

- **Status:** built and verified locally on `fix/alarm-hardening` (`.claude/worktrees/alarm-hardening`), from `<head>`. Not pushed. Under ruling R87 this receipt is its own file; `premium-progress.md` is not edited. Under ruling R100 the whole workers suite is CI's (`test:edge:workers`), and so is the database suite (`test:edge:db`, SKIPPED here: Docker is stopped). The independent review is the controller's, after this receipt.
- **Carries:** 1B-T11's review (`reviews/1B-T11.md`): m1, m2, m4, n1, n2, n3, n4, n5 and n9. m3 and n6 are fix-download-aborts'.
- **Files:** (the Scope table: what each file gains, marked new, shared, 1B-T9's, 1B-T10's or 1B-T11's.)
- **What changed:**
  - m1: `pruneSnapshots` runs last (P1).
  - n1: a held one-run guard logs `file_run_held` and reports `delete_objects` (P4).
  - n2: rearm's `.catch` (P5).
  - n5: `FILE_PRUNES` and `PRUNE_DUE_TIMES` entries call their functions when they run (P10).
  - m4: `attachment_checks` with its four triggers and backfill, `attachmentsDueAt` reading it first, `pruneAttachments` emptying it (P6); `entity_heads_imports_idx` and `LIVE_IMPORT_HEADS` with `CROSS JOIN` (P7).
  - m2, n3, n4: pins only (P3).
- **The cost (m4, the planner's figures, P9):** at 30,000 records (3,000 deleted), 5,000 held receipts and 3,000 purged import records, `attachmentsDueAt` 0.705 ms (10,001 rows read) to 0.005 ms (2 rows), `importsDueAt` 0.64 ms (6,006) to 0.01 ms (6), `fileJobsDue` 1.5 ms to 0.035 ms, and `reschedule`'s block 1.7 ms to 0.04 ms. At 20,000 held receipts and 30,000 purged import records, `reschedule` goes from 13.55 ms to 0.365 ms (0.3 ms of it 1A's `nextDue`, unchanged).
- **RED to GREEN** (FOCUSED: `files-alarm.test.ts` and `vault-schema.test.ts`, under the heavy lock): RED, with 0004 as the table only and the four source files at their base: `Tests 9 failed | 40 passed (49)`, all 9 `AssertionError`s (list them). GREEN: `Tests 49 passed (49)`, the 12 event lines (list them), no `Unhandled` or uncaught line. The 5 new cases that pass at RED pin code that is right today (P3).
- **Cases:** (the 12 new and the 2 changed, by name, as Appendix A lists them.)
- **Mutation check:** 28 mutants, 28 killed (one line each, as Step 5 lists them, with your failing counts). n5 is a what-if, not a mutant (P10).
- **Gate:** typecheck:edge, FOCUSED, test:edge, build:edge (the vault bundle's size, before and after), AFFECTED (and the reason R100 allows it), `git diff --check`; each with its result.
- **CI and SKIPPED:** the whole workers suite (CI); test:edge:db (SKIPPED, Docker stopped; CI's `edge` job); the exports (no route or entry change); hosted checks (nothing deployed).
- **Correction to 1B-T11's P14 (n9):** "at most a few thousand import records can fall due at once" holds for import reviews, whose records the parse quota (10 a day) bounds. Import selections are bounded only by the write budget (60 writes a minute). `pruneImports`' uncapped loop still ends, because each pass purges what it read.
- **Notes for later tasks:**
  - fix-download-aborts: the `attachments.ts` and `previews.ts` lines this task changed, and the 1B-T9 review's X5 text, which is now A1's (the brief's "How this task meets the other open work").
  - 1B-T13: 0004's table and index are empty in a vault without receipt changes since its last alarm, or without imports.
  - Any task that writes `attachments` or `transaction_attachments`: 0004's triggers list the receipt in `attachment_checks`, and the next `pruneAttachments` empties it.
  - Later: `recordsDue` could read `LIVE_IMPORT_HEADS` too (alarm-only today), and 1A's `nextDue` counts every change and head after every write.
```

## Appendix D: the planner's files and their checksums

`PL/SHA256SUMS` (check it with `cd PL && shasum -a 256 -c SHA256SUMS`):

```
033e9faef49a713eef6aaf873dfaa8f9d7e66cf4972385a37255325be7abc2e8  diffs/src_cloudflare-workers.d.ts.diff
d5c7aa5553f0f5ad15951e8b34088ddacd99b7b695594714411f5b5a5879aaee  diffs/src_vault_files_attachments.ts.diff
11acce687f78b1ec5375ef458011b4fda0ba2ddbbc1772f92606050bce79a7ee  diffs/src_vault_files_jobs.ts.diff
c759dfa885c92d482ce9c5b75813081ea6eaeb4cb592a82a25a8d4da910d660c  diffs/src_vault_files_previews.ts.diff
c0fd12dd244c576d880c41459b2e01d5daa717890d60776c2f73880bbd82609d  diffs/src_vault_migrations_index.ts.diff
af957ebaec7348daaa574a1c0967b45d6c6ce693b8c43e6408a96a867ebd377b  diffs/src_vault_schema.ts.diff
f8b1ff9e19eab17884814a50a47362c94d59eb97802213bea9ea480da1cd5442  diffs/src_vault_user-vault.ts.diff
5829e5f4d82d76b9e62b8d286836d2d9ad36c6acd16a608723fe0b5e00a90760  diffs/test_workers_files-alarm.test.ts.diff
24c31e4e27d3ae9a453de99edbd331ef9fc49525bd0371d5b43331cfc3625ba9  diffs/test_workers_vault-schema.test.ts.diff
2cadacae9c3efa4300a6fbae0115dbf0ca923d0356d253d82d410763619f3774  explore/zz-planner-m4.test.ts
699a649c1b895de9b9357de7943f411c8d01aba93caabba4ed05c806089fa479  explore/zz-planner-measure.test.ts
bc7898347002836feefdcbe1e66be80905c7380ee5209f3a143e5d6ebb0e1bd5  explore/zz-planner-rows.test.ts
82b141f3e8c2d61ab5cb1ed4046852458f9c209e70612676c5c3171105b121ef  explore/zz-planner-spy.test.ts
19b8edecc117c752d424c93197ed43399f2cda26491f647ada020c258ae5341a  explore/zz-review-probes-1b-t9.test.ts
88eada9b6299bc126168579a0c7dcf81c76d19ddb6a4e3d8cc50234ba0a1282a  make-sums.sh
4e55a2bc53a4a56a6ce94211e93888a8a5387113e8541a73e6375c3f273d3ae9  mutants.py
76ffc6712b987848cc3f450565fb8403bce7fb304330da17d422984ef91192d8  orig/src/cloudflare-workers.d.ts
7e3223dc2a9e33ab029e0677812a2476d90049176c20b4dc09fbd9dfa7effeed  orig/src/vault/files/attachments.ts
cf7c7b3c56687551f025127ff606fee846648845bfc970e5a3adb34a6ab4d567  orig/src/vault/files/jobs.ts
f44baaaf99a6c547fd4415256ee18ce08d3d49401ced6804bcd6716874f1e0fd  orig/src/vault/files/previews.ts
54d89747a1c90174e89db3f56aea7d1fd2c4ef74e35d1cec26751a59c1d420f7  orig/src/vault/migrations/index.ts
aa8ac3bcdc03f1ee21e6f2aded2347260c486f66eef7e24c63f3f5e358f85b43  orig/src/vault/schema.ts
58372d0a69fe97ea107eb2ae84deeec4e67ba26bc4596564f1d6f10d3879924b  orig/src/vault/user-vault.ts
f67c2c90a2ef24b4424665a50c83792390c1624a352567fbc0c3c68ee64efbce  orig/test/workers/files-alarm.test.ts
526e320a9b5c8824c56b8ce9449d7568b45f676a0765429098da957075654872  orig/test/workers/vault-schema.test.ts
93e3c8599375035f1248b069c5b720f37b5f0488bef3268607ad8c583a4ab869  proof/mutant-files.sha256
7d925a5204080fe177d3195b76478cea4d7157e64c397c357a5e6f3846f126c7  proof/mutants-check.out
3a75dfead4331848964e4dfbfb4a97f6b3de7abeca534cb86cefcae6ef37c0d7  proof/mutants.out
fb3195593e2e0b9ebd57d58b7d55ebd8b88ad3a6addafe45eb92a4ffc47d96a6  real/src/cloudflare-workers.d.ts
bdf28fbc6737d4d43206b81b61119d52d59c3d0e671797ec676e349dfba683d1  real/src/vault/files/attachments.ts
c74149845f881cb287fa550de76b90353942ceed7f36abe53ad2c9d910437432  real/src/vault/files/jobs.ts
7442c3e879da93b89b8276323e7eac895ddc13b43145e56c5f847e0e21d6413c  real/src/vault/files/previews.ts
d09df66d920111dca682fe9895ef03bfbdbd2f0ca32124f8479552592a9f02e4  real/src/vault/migrations/0004_alarm_bounds.sql
3035a21795a0e7304928fda878f71e985c1034d0dfba41d451ea9861f5ae11cf  real/src/vault/migrations/index.ts
a68853d59a4d54b618b5db56b9745dc5bcc369a836baebce69d78ea5fd098e06  real/src/vault/schema.ts
dada8635f19b56476b44d2020993ff5a77647c41406a25868072804eff15650a  real/src/vault/user-vault.ts
9f10500ef09d646d74870e567de8b84b1d2bc0274bc873e50dbc5aab76c268c0  real/test/workers/files-alarm.test.ts
82cba3b2905ef38cf595b41f0bb8241bd8e34d28fcd618ab61854cac2c51b122  real/test/workers/vault-schema.test.ts
293ce04f7703c30a425c7b54e41bb3e1adad10503ef048fe192bb65fb908eb93  run-focused.sh
2e3b91e77ca9869356dd6685d829843a28a4681574e1fa93fe5fa3558510daa3  run-gate.sh
37f07e46388c2863c4bf38bd7d8514d35fd4af7658b1885ad168f53b8e1c8ae6  run-measure.sh
3836131d8556e089f01dac1bbec80efc857e4f6c15a75690f41a3ff5c6698761  run-mutants.sh
6814b9db2ddd799a5183d89c913f9268a6e178ecc9fa45c53994687b81bb637c  run-n5-whatif.sh
3a7fc76986ac1256261fcf5aff0e112d130cb7eab8bb01b60b75cc9b5883129d  run-red-green.sh
e3a83df41404ada53a86f9284afa015a553be5fef84bfdb4fd0ddf29efde6c84  stubs/src/vault/migrations/0004_alarm_bounds.sql
```

The planner's proof logs (gitignored; listed in `PL/SHA256SUMS.logs`) are in `PL/proof/`:
- `red.log`, `green.log`, `red-typecheck.log`, `green-typecheck.log`;
- `mutant-logs/` (28);
- `gate-typecheck.log`, `gate-test-edge.log`, `gate-build-edge.log`, `base-build-edge.log`, `gate-affected.log`;
- `measure-before.log`, `measure-after.log`;
- `whatif-n5-real.log`, `whatif-n5-base-jobs.log`;
- `naive-r37-seed-on-base.log`;
- `du-probes-on-real.log` (the 1B-T9 review's DU-1 and DU-2 on this task's code).

The explorations are in `PL/logs/`.
