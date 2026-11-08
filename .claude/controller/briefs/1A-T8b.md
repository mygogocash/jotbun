# Brief 1A-T8b: retention on the UserVault's alarm

You are the implementer for plan 1A, Task 8, second half (ruling R7). You add `retention.ts` (purge, change-log prune, receipt-digest drop, the schedule and the alarm), `UserVault#alarm()`, the re-arm after each committing call, `createLunch`, `retention.test.ts`, and the prune half of the sync retention case. The planner wrote every file below and proved it in a scratch copy of the integration head `8f04a3b`: RED on typed stubs, GREEN on the code, 16 mutants killed, 3 equivalent mutants explained, and the full edge gate. Do exactly what this brief says.

Read first, in this order:

1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`.
2. The plan task: `docs/superpowers/plans/2026-10-25-jotbun-p1a-vault-core.md`, `### Task 8` (lines 714 to 793, with its "Halves (R7)" note on line 716), and "Global Constraints" (lines 26 to 71: Exactness, Retention, Time, Logging).
3. The spec, `docs/superpowers/specs/2026-10-25-jotbun-bun-wallet-cloudflare-design.md`: §6.2 UserVault (lines 328 to 386, "Deletes and retention" and "Alarms") and §6.12 Background work (lines 627 to 660, deletion step 2).
4. The 1A ledger rulings, read only, at `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1a-vault-core/.superpowers/sdd/2026-10-25-jotbun-p1a-vault-core/progress.md`: R5 (line 31), R6 (line 32), R7 (line 39), R21 (line 83), R57 (line 142).
5. The Task 8a receipt in `docs/implementation/premium-progress.md` (`### Task 8a: Sync changes`, line 233), whose "Notes for 8b" this task closes.

## Paths and rules used below

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1a-t8b` (branch `p1/1a-t8b-retention`, made by the orchestrator from `origin/claude/p1a-vault-core`). Work only here.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1a-t8b`, your scratch folder. Create it with `mkdir -p`. Keep backups and logs only there. Never keep anything under `/private/tmp` (macOS clears it).
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1a-t8b-planner`, the planner's folder. It holds verified copies of every file (`real/`, `stubs/`), the mutant runner `mutants.py`, and `SHA256SUMS`. Read it and `cp` from it; never write into it. Every file is also quoted in full in the appendices; if PL is missing, use the quoted text.
- Every shell call starts in a fresh directory, so type full paths. Git: `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1a-t8b <command>`, one git command per call. npm: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1a-t8b && npm run <script>`. Below, WT, S and PL stand for those full paths: type the full path.
- **The heavy lock** wraps every `npm run test:edge:workers`, every focused workers run (`npx vitest run --config vitest.workers.config.ts ...`), the mutant runner, and `npm run test:edge:db`. Take it with `until mkdir /private/tmp/claude-501/jotbun-heavy.lock 2>/dev/null; do sleep 20; done` and release it with `rmdir /private/tmp/claude-501/jotbun-heavy.lock`, after a failure too. If your shell refuses the `sleep` loop, retry the bare `mkdir` until it succeeds. Never remove a lock you did not take.
- The focused workers command, used below as **FOCUSED** (run from `WT/apps/edge`, under the lock):
  `cd WT/apps/edge && npx vitest run --config vitest.workers.config.ts --reporter=verbose test/workers/retention.test.ts test/workers/sync.test.ts`
- Edit with the Edit tool, using the exact strings quoted here, or `cp` the verified copies as each step says.
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests or code to make them pass unless a step says what to do.

## Scope

In this task (plan Task 8, "Halves (R7)": "1A-T8b is the rest: `retention.ts`, `retention.test.ts`, `createLunch`, the alarm, and turning on Task 7's money journey once Task 7 has merged"):

| File | Change |
| --- | --- |
| `apps/edge/src/vault/retention.ts` | **new.** `RetentionJob`, `nextDue`, `reschedule`, `runDue`, `purgeEntities`, `purgeExpiredRecords`, `pruneChanges`, `dropReceiptDigests`, `armAlarm`, `committedRevision` and the constants. |
| `apps/edge/src/vault/user-vault.ts` | **shared** (1B-T4 edits it in parallel; 1B-T11 and 1D later). Three additive edits at named places: one import line, the `alarm()` method right after `erase()`, and the commit check inside `call()`. |
| `apps/edge/test/workers/support/v1-client.ts` | **shared** (1B-T4 edits it in parallel). `createLunch` appended at the end of the file. |
| `apps/edge/test/workers/sync.test.ts` | 8a's file, no parallel editor. The prune half of the 30-day case, the API's name for the lifecycle case, the registry case (in part) and three `it.todo` lines for 1B. |
| `apps/edge/test/workers/retention.test.ts` | **new.** 13 cases. |
| `docs/implementation/premium-progress.md` | **shared** (every task). Your receipt section, inserted before `### Task 4: Categories`. |

Not in this task:

- **Task 7's money journey.** 1A-T7 is not merged. Its file `apps/edge/test/workers/history.test.ts` does not exist on the integration head. Do not create or touch it, even if 1A-T7 has merged by the time you sync. The orchestrator runs it as a follow-up (see "Follow-up" at the end).
- No route, no `src/vault/routes.ts` or `src/v1/routes.ts` edit (8b adds no HTTP route), no migration, no `schema.ts`, no registry or executor change, no new package.

## Planner rulings (the calls this brief makes, with the reason for each)

- **P1. Due times.** The plan: "Each job's due time comes from the data: the earliest live `deleted_at` + 30 days; the earliest superseded change + 30 days; the earliest receipt still holding a digest + 30 days." Purge and digests follow it word for word. For the prune, `nextDue` uses this rule: **while some change is superseded, the oldest change group above the retention line + 30 days** (the API's own `gogospend_retention_candidates` rule, `apps/api/drizzle/0010_sync.sql` line 172, limited to vaults with something to prune). Why not the literal wording:
  - The literal reading loops. A change superseded after the retention line already passed it (common: a wallet created 40 days ago and renamed today) has a "+ 30 days" time in the past. The API's prune cannot remove it until a group above the line is 30 days old, so the alarm would fire at once, do nothing, and re-arm in the past forever. The case `removes a superseded change that sat below the retention line` pins the right time (`t0 + 61 days`) and kills the literal rule (mutant M4).
  - The exact "earliest moment a superseded change can go" needs a scan of the whole change log after every committing call: 13.6 ms at 20,000 changes in workerd, growing linearly. This rule costs two counts and one indexed range: 1.0 ms with nothing superseded and 2.6 ms with something superseded, at 20,000 changes.
  - It never loops: each prune moves the line past every group at least 30 days old, so the next due time is later than now (ruling R37 for 1B-T11).
- **P2. Inclusive 30 days.** All three jobs act on rows whose time is `<= now - 30 days`. The API's SQL is strict (`<`). Inclusive makes a job run at its own due time; strict would leave it due at that instant and re-fire the alarm. A record deleted at D is purged at exactly D + 30 days (the case `the alarm follows the earliest job, and each record waits its own 30 days`, mutant M8). `restoreTransaction` (Task 5) still accepts a restore at that same millisecond if it runs first.
- **P3. The prune deletes every non-head change at or below the cut.** The latest `gogospend_prune_account` (`apps/api/drizzle/0015_privacy.sql` line 879) visits only entities changed since its last pass, a PostgreSQL index shortcut. One vault does it in one statement, which also removes a change superseded below a line that a purge moved (where the shortcut would keep it).
- **P4. A failed job.** Each due job runs in its own `try`/`catch`: a throw is logged with `logFailure('vault_retention_<job>_failed', error)` and the other jobs still run (the API's "a failing step is reported and does not stop the others"). `runDue` returns the jobs that failed (the plan says `runDue(c): void`; callers that ignore the result, like 1B-T11's, are unaffected), and `alarm()` then arms no sooner than now + 60 s (`RETENTION_RETRY_MS`), so a failing job is never retried in a loop.
- **P5. "After each call that committed a command".** `call()` reads the revision before and after the handler, inside its block (`committedRevision`). Only a committed change group moves it. After the block it calls `armAlarm(c)`, which opens its own short block for `schedule` and then calls `void storage.setAlarm(due)` or `void storage.deleteAlarm()` outside every block (plan Step 3; R21, no nested block). 1B-T11 later replaces the revision check with its `touched` flag.
- **P6. The purge group.** `purgeEntities(c, entity, ids)` ports `gogospend_purge_entities` in plain SQL with no registry (what 1B-T6, T9 and T10 need). Its command id is `derivedUuid(accountId, 'retention-purge', revision)`, the deterministic equivalent of the API's `md5('gogospend.purge:' || account || ':' || revision)`. It writes no receipt and no audit row, as the API does. It takes a `RetentionContext` (`Pick<VaultContext, 'sql' | 'storage' | 'now'>`), which 1B's `FileContext` satisfies.
- **P7. Time in tests.** The plan's three alarm cases are kept with their names and assertions, but each test takes `const t0 = Date.now()` (R6), so every alarm a test sets is about 30 days in the real future and never fires on its own. `purged_transactions_are_not_resurrected_by_receipts` ages only the record by SQL, as the API's `age()` does, so its receipt keeps its digest and the replay still proves the request.
- **P8. Registry check.** sync-api's `snapshots validate exactly the entities the API registers` is ported in part: the vault's four entities, each with exactly its `SYNC_ENTITY_VALIDATORS` function. The full equality waits for 1B (export, import_review, import_selection) and phase 4 (`slip_inbox`, added to the contracts at `8f04a3b`).

## How the alarm meets 1B-T2's erase and 1B-T11's file jobs

- **1B-T2 (merged):** `erase()` sets `erased`, deletes the alarm and the storage, and writes the `deleted` marker. `alarm()` returns at once when `erased`. After the vault sleeps, the marker's status is not `active`, so `nextDue` is empty, `runDue` does nothing and `armAlarm` deletes the alarm. `call()` refuses an erased vault before any arming. The case `an erased vault runs no retention and keeps no alarm, awake or after it sleeps` proves both.
- **1B-T11 (later):** its plan widens `reschedule(c, lastStartAttemptMs)`, adds `alarmAt`, `rearm(c)` and `fileJobOptions`, and makes `alarm()` "first `this.alarmAt = null`; then `runDue(c)` (1A-T8b), `await runFileJobs(...)`, and `rearm`". 8b's `alarm()` is three statements (guard, `runDue`, arm), so 1B-T11 inserts its file jobs between the last two. `reschedule` writes and deletes only the three retention rows of `schedule` and returns the earliest of the whole table, so rows other jobs write later are kept and respected.
- **1B-T4 (in parallel):** it adds imports after the last import (`import type { VaultBucket } from './files/keys'`), a field after `erased = false`, `vaultId: this.vaultId,` inside `call()`'s context literal, and methods at the end of the class. 8b's edits sit elsewhere. The planner merged both versions of `user-vault.ts` and `v1-client.ts` with `git merge-file` against 1B-T4's current working copies: no conflict. 1B-T4 makes `VaultContext.vaultId` required; 8b builds no `VaultContext` itself (`alarm()` builds a `RetentionContext`), so nothing breaks.

---

## Step 1: Sync, install and check the base

1. `/usr/bin/git -C WT fetch origin claude/p1a-vault-core`, then `/usr/bin/git -C WT merge --no-edit origin/claude/p1a-vault-core`. Expected: "Already up to date." or a fast clean merge.
2. `/usr/bin/git -C WT rev-parse --short HEAD`. Record it. The planner's counts are at `8f04a3b`.
3. Install, since the worktree is new: `cd WT && npm ci --ignore-scripts --no-audit --no-fund`, then `cd WT && npm run install:edge`.
4. Base checksums: `shasum -a 256 WT/apps/edge/src/vault/user-vault.ts WT/apps/edge/test/workers/support/v1-client.ts WT/apps/edge/test/workers/sync.test.ts`. Compare with the three `base-8f04a3b/` lines of `PL/SHA256SUMS`:
   ```
   6033f2807b179e99368b06cb7821b94e7c67d3aa7519dcb3e16a69db5a05217d  user-vault.ts
   2d6797419eff6174391a62f0953e5dbeea87b85f6689fa5c532feace99bd56cb  v1-client.ts
   79709dbbd5cb6d7c6b2fdb866dd9c6dd6b2d204e84a1c7c8739475cfd2402455  sync.test.ts
   ```
   - All three equal: in Step 2 you `cp` the verified copies of these three files.
   - Any one differs (another task merged first): for that file, apply the Edits in Appendix B instead of `cp`. Each `old_string` must match exactly once. If one does not, stop: BLOCKED, with the file's diff against `8f04a3b`.
5. `test -e WT/apps/edge/src/vault/retention.ts && echo EXISTS`. Expected: no output.

## Step 2: Write the tests, the test client and the typed stubs

1. `mkdir -p S` and `mkdir -p WT/apps/edge/test/workers`.
2. Copy (or Edit, per Step 1.4):
   - `cp PL/stubs/src/vault/retention.ts WT/apps/edge/src/vault/retention.ts` (the typed stubs, Appendix A.2).
   - `cp PL/real/test/workers/retention.test.ts WT/apps/edge/test/workers/retention.test.ts` (Appendix A.3).
   - `cp PL/real/src/vault/user-vault.ts WT/apps/edge/src/vault/user-vault.ts` (or Appendix B.1).
   - `cp PL/real/test/workers/support/v1-client.ts WT/apps/edge/test/workers/support/v1-client.ts` (or Appendix B.2).
   - `cp PL/real/test/workers/sync.test.ts WT/apps/edge/test/workers/sync.test.ts` (or Appendix B.3).
3. Checksums: `shasum -a 256` each copied file. Expected, from `PL/SHA256SUMS` (only for files you copied):
   ```
   ca2e0859c11a895956f3677c2aa013623345d32b8f9e1e03e689086bebef7286  stubs/src/vault/retention.ts
   a71e355ee9aac0f1f151286ad7c4e4eca13c1477bd81f74e734df18b621c5ea0  real/test/workers/retention.test.ts
   13ee77ed4dd14bec8745563bcdbf7879513e484dc341785b5c5d7de3d54171d7  real/src/vault/user-vault.ts
   9b9e8235fbebc025203215c1a5fa95fcff9f8605861a534429355f33e18ebe8e  real/test/workers/support/v1-client.ts
   0a2ea5c9c8dfa3df9369857315119200328c54727245fab87f9929585d545d60  real/test/workers/sync.test.ts
   ```
4. `cd WT && npm run typecheck:edge`. Expected: exit 0. (The stubs carry the final signatures, and `user-vault.ts` already calls them.)

## Step 3: RED

Under the lock, run FOCUSED, then release the lock. Expected, exactly:

- `Test Files  2 failed (2)` and `Tests  12 failed | 14 passed | 3 todo (29)`.
- Every failure is an assertion: 10 are `AssertionError: expected false to be true` (the alarm never set, so `runDurableObjectAlarm` answers false, or `prune` answers false) and 2 are `AssertionError: expected null to be <a number>` (`getAlarm()`).
- The 14 passes: the 12 existing sync cases (11 of 8a's, plus the registry case, which checks the already-correct registry); and 2 retention cases that hold on inert stubs by design, `with nothing left to do, the alarm is cleared` and `an erased vault runs no retention and keeps no alarm, awake or after it sleeps`. The one failing sync case is `30-day retention drops superseded changes, keeps every head, and expires older cursors`.

Record the counts. Save the output to `S/red.log`.

## Step 4: GREEN

1. `cp PL/real/src/vault/retention.ts WT/apps/edge/src/vault/retention.ts` (Appendix A.1). `shasum -a 256` it. Expected: `be59fcdfedcee3b5a7b69a51a89306177ed7af8c865c49dad5b13471091fc487`.
2. `cd WT && npm run typecheck:edge`. Expected: exit 0.
3. Under the lock, FOCUSED. Expected: `Test Files  2 passed (2)`, `Tests  26 passed | 3 todo (29)`.

## Step 5: Mutation check

The planner's runner applies each mutant to its file, runs FOCUSED, restores the file byte for byte (backup in S), and compares the failing tests with the expected set. Run it once, under the lock:

```
until mkdir /private/tmp/claude-501/jotbun-heavy.lock 2>/dev/null; do sleep 20; done
python3 -I PL/mutants.py WT/apps/edge S > S/mutants.out 2>&1; echo exit=$?
rmdir /private/tmp/claude-501/jotbun-heavy.lock
```

(Type the full paths for PL, WT and S.) Expected: `exit=0`, and every line of `S/mutants.out` says `as expected | restored ok`. Then `/usr/bin/git -C WT status --short` and `shasum -a 256` on `retention.ts` and `user-vault.ts`: they match Step 2 and Step 4.

The mutants and what kills them (plan Step 5's three are M1 to M3):

| Mutant | Change | Expected to fail |
| --- | --- | --- |
| M1 (plan) | purge at 29 days (`PURGE_AFTER_MS`) | `nothing is purged early`, the plan's first alarm case, the earliest-job case |
| M2 (plan) | the purge leaves `pruned_through` unchanged | `tombstones reach delta readers, older cursors resync` |
| M3 (plan) | the alarm is always the purge time | 5 cases, among them the earliest-job case (the plan's first alarm case cannot catch it: there all three jobs fall due at `t0 + 30 days`) |
| M4 | the literal prune rule (P1) | `removes a superseded change that sat below the retention line` |
| M5 | no active-account check | `leaves an account being erased to its erasure` |
| M6 | no per-job `try`/`catch` | `a failing step is reported and does not stop the others` |
| M7 | no one-minute floor after a failure | the same |
| M8 | strict `<` in the purge (P2) | the earliest-job case |
| M9 | no arming after a committing call | 11 cases |
| M10 | purge cutoff 29 days, due time unchanged | the earliest-job case (the dinner, deleted 29 days earlier, would go) |
| M11 | the prune also deletes heads | the S1 case and sync's 30-day case |
| M12 | the digest drop ignores the cutoff | `drops receipt digests after the outbox lifetime` |
| M13 | the prune cut ignores the retention line | `tombstones ...` and sync's 30-day case |
| M14 | one purge group per alarm | the 1,001-record case |
| M15 | one `?` per id (breaks R57) | the 1,001-record case |
| M16 | the prune due without anything superseded | `a failing step ...` and the earliest-job case |

Equivalent mutants (the runner expects all 26 to pass):

- **E1**, no `if (this.erased) return` in `alarm()`: an erased vault holds only its `deleted` marker, so `nextDue` is empty and `armAlarm` deletes the alarm either way. The guard is defence in depth, as 1B-T11 asks ("an erased vault never rearms").
- **E2**, arm after every call, not only committing ones: a due time depends only on `transactions.deleted_at`, the change log, the heads, `sync_state` and the receipts, and only a committed command writes those. Re-arming after a read recomputes the same time.
- **E3**, never call `deleteAlarm`: `reschedule` can only return null inside `alarm()` (every commit leaves a receipt digest due), and by then the runtime (and `runDurableObjectAlarm`) has already removed the alarm that fired. 1B-T11's `alarmAt` makes the call matter.

## Step 6: Gate

Run from WT, in order; record each result. The expected counts are at `8f04a3b`. If your head is newer, record what you see and say why it differs.

1. `cd WT && npm run typecheck:edge`. Expected: exit 0.
2. `cd WT && npm run test:edge`. Expected: `Test Files  12 passed (12)`, `Tests  156 passed (156)` (unchanged by this task).
3. Under the lock: `cd WT && npm run test:edge:workers`, then release. Expected: `Test Files  14 passed (14)`, `Tests  262 passed | 3 todo (265)`. Before this task: 13 files, 248 passed. The 14 new are 13 retention cases and the registry case.
4. `cd WT && npm run build:edge`. Expected: passes. Then `grep -c "vault_retention_" WT/apps/edge/dist/jotbun_vault/index.js` prints 1 or more, and `grep -cE "from ['\"]pg['\"]|node-postgres|DatabaseService|OwnerTx" WT/apps/edge/dist/jotbun_vault/index.js` prints 0.
5. `test:edge:db`: first `docker info >/dev/null 2>&1 && echo up || echo down`. At planning time Docker was stopped on this machine. If `down`, record `test:edge:db` as **SKIPPED (Docker is not running; CI runs it)** and do not start Docker. If `up`, run `cd WT && npm run build -w gogospend-api`, then under the lock `cd WT && npm run test:edge:db`, and record the counts (the last receipts say 8 files, 62 passed). This task changes no PostgreSQL code.
6. `/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD` after the commit (or `/usr/bin/git -C WT diff --check` before it). Expected: no output.

Note for the reviewer, already checked by the planner: `transactions.test.ts`, `restore fails after 30 days ...` backdates a deletion by SQL and then commits, so that vault's alarm lands in the past and fires during the test. It purges only the backdated record, which the test no longer reads. Three repeated runs passed.

## Step 7: Receipt

Edit `WT/docs/implementation/premium-progress.md`. Insert the section below **immediately before the line `### Task 4: Categories`** (it occurs once; 8a's section is just above it), with one blank line before and after. Change nothing else. Replace every `<...>` with what you saw; if a number differs from the planner's, write yours and say why under Deviations.

````markdown
### Task 8b: Retention on the vault's alarm

- **Status:** built and verified locally on `p1/1a-t8b-retention` (`.claude/worktrees/p1a-t8b`), from `<head sha>`. Not pushed. Task 8 is split (ruling R7): 8a served sync changes; this is the rest, except Task 7's money journey (below). The independent review is the controller's, after this receipt.
- **Files:**
  - `apps/edge/src/vault/retention.ts` (new): `nextDue`, `reschedule`, `runDue` and `armAlarm` (the schedule and the alarm), and the three jobs. `purgeExpiredRecords` and `purgeEntities` port `gogospend_retention_purge_account` (its transactions half) and `gogospend_purge_entities`. `pruneChanges` ports the latest `gogospend_prune_account`. `dropReceiptDigests` ports `gogospend_drop_receipt_digests`. `committedRevision` lets a call see that it committed. Revisions are read as `CAST(... AS TEXT)` and bound as `CAST(? AS INTEGER)`. Id lists bind as one JSON parameter (R57). Each job is its own `transactionSync` block.
  - `apps/edge/src/vault/user-vault.ts` (shared): one import; `alarm()`, placed right after `erase()`; and in `call()`, the revision is read before and after the handler, and a call that committed arms the alarm after its block.
  - `apps/edge/test/workers/support/v1-client.ts` (shared): `createLunch(client, user): Promise<string>`, appended at the end of the file.
  - Tests: `apps/edge/test/workers/retention.test.ts` (new, 13 cases). `apps/edge/test/workers/sync.test.ts`: the prune half of the 30-day case, the API's name for the lifecycle case, the registry case in part, and three `it.todo` lines for 1B.
- **RED to GREEN:**
  - Typed stubs first: `retention.ts` exported every name with its final signature and did nothing, and `user-vault.ts` already called them.
  - RED, `npx vitest run --config vitest.workers.config.ts test/workers/retention.test.ts test/workers/sync.test.ts`: `<Tests 12 failed | 14 passed | 3 todo (29)>`. All 12 are assertions: 10 `expected false to be true` (no alarm was set, or the prune did nothing) and 2 `expected null to be <time>`. Two retention cases pass on inert stubs by design (the cleared alarm, the erased vault). The registry case passes at once: the registry was already right.
  - GREEN: `<Tests 26 passed | 3 todo (29)>`.
- **Mutation check:** `<16>` mutants, each applied to its file, run against the two focused files and restored byte for byte (the planner's runner, `mutants.py`). Every one failed exactly the expected tests:
  - the plan's three: M1, purge at 29 days (3 cases, `nothing is purged early` among them); M2, the purge leaves `pruned_through` unchanged (`tombstones reach delta readers, older cursors resync`); M3, the alarm always at the purge time (5 cases, the earliest-job case among them; the plan's first alarm case cannot catch it, because all three jobs fall due together there);
  - M4, the literal prune rule; M5, no active-account check; M6, no per-job `try`/`catch`; M7, no one-minute floor after a failure; M8, a strict `<` in the purge; M9, no arming after a commit (11 cases); M10, a 29-day purge cutoff with the due time unchanged; M11, the prune deletes heads; M12, the digest drop ignores its cutoff; M13, the prune cut ignores the retention line; M14, one purge group per alarm; M15, one `?` per id; M16, the prune due with nothing superseded.
  - Equivalent, all 26 pass: E1, no `erased` guard in `alarm()` (an erased vault holds only its marker, so retention is inert either way); E2, arming after every call (only a commit changes a due time); E3, never calling `deleteAlarm` (a null schedule only happens inside `alarm()`, after the runtime removed the alarm that fired).
- **Gate** (worktree root):
  - `typecheck:edge`: exit 0.
  - `test:edge`: `<156>` passed (`<12>` files).
  - `test:edge:workers`: `<262>` passed and 3 todo (`<14>` files); 248 before this task.
  - `build:edge`: passes; the `jotbun_vault` bundle has the retention code and no PostgreSQL import.
  - `test:edge:db`: `<result, or SKIPPED: Docker is not running>`.
  - `git diff --check origin/claude/p1a-vault-core...HEAD`: clean.
- **Ported** from `apps/api/src/privacy/retention.integration.spec.ts` (14 cases):
  - In full (the plan's list): `purged_transactions_are_not_resurrected_by_receipts`; `a deleted record stops counting at once and can be undone within 30 days; nothing is purged early`; `drops receipt digests after the outbox lifetime: a replay is refused and never re-run; status still answers`; `removes a superseded change that sat below the retention line (S1 change log)`.
  - In part: `tombstones reach delta readers, older cursors resync` (its snapshot half is 1B-T8's).
  - In changed form: `leaves an account being erased to its erasure: no purge group is written for it` (the status is set to `deleting` directly; the alarm is also cleared, §6.12 step 2); `a failing step is reported and does not stop the others` (a trigger makes the purge fail; the alarm also comes back a minute later); `every prune works in bounded batches` (as `purges more records than SQLite has parameters, at most 1,000 to a change group`: 1,001 records, two groups of 1,000 and 1).
  - 1B's: `export requests are purged 30 days after the request; the receipt stays compact` and `drops finished upload rows 30 days after they ended ...` (1B-T11), and `a snapshot read before a purge is never recorded afterwards ...` (1B-T8).
  - Not applicable: `skips an account while a user write holds its lock ...` (a vault call runs to completion; there is no lock to wait on); `ages out provider-event receipts, reconcile checks, expired challenges, finished jobs, lapsed holds and completed deletion requests` (none of those tables is in a vault; D1's are 1C's); `the erasure purge and the account foreign key use indexes ...` (PostgreSQL's planner).
  - The plan's three alarm cases, with their names and assertions, each with `t0 = Date.now()` (R6). New: `the alarm follows the earliest job, and each record waits its own 30 days`, `an erased vault runs no retention and keeps no alarm, awake or after it sleeps`.
  - `sync.test.ts`: `30-day retention drops superseded changes, keeps every head, and expires older cursors` is now ported in full, and the lifecycle case has the API's name. `snapshots validate exactly the entities the API registers` is ported in part (the vault's four entities each use exactly their `SYNC_ENTITY_VALIDATORS` function); the full set waits for 1B and phase 4 (`slip_inbox`).
- **Deviations:**
  1. The prune is due, while some change is superseded, 30 days after the oldest change group above the retention line (the API's `gogospend_retention_candidates` rule). The plan says "the earliest superseded change + 30 days". Taken literally, that time is already past for a change superseded after the line passed it, and the alarm would loop (mutant M4). The exact earliest time needs a scan of the whole change log on every commit (13.6 ms at 20,000 changes); this rule costs 1.0 to 2.6 ms there, and the next due time is always later than the prune.
  2. "30 days old" is inclusive (`<=`) in all three jobs, where the API is strict, so a job runs at its own due time. A record deleted at D is purged at D + 30 days exactly.
  3. The prune deletes every non-head change at or below the cut. The API's prune visits only entities changed since its last pass, an index shortcut. This also covers a change superseded below a line that a purge moved.
  4. `runDue` returns the jobs that failed (the plan says `void`). `alarm()` uses that to arm no sooner than a minute later. A failed job is logged as `vault_retention_<job>_failed`, and the other jobs still run.
  5. The purge's command id is `derivedUuid(accountId, 'retention-purge', revision)`, the deterministic stand-in for the API's md5 id. The purge writes no receipt and no audit row, as the API does.
  6. `purgeEntities` takes a `RetentionContext` (`Pick<VaultContext, 'sql' | 'storage' | 'now'>`), so 1B's `FileContext` can call it (1B-T6, T9, T10).
  7. `call()` knows it committed by comparing the revision before and after the handler. 1B-T11 replaces that with its `touched` flag.
  8. `purged_transactions_are_not_resurrected_by_receipts` ages only the record by SQL, as the API's `age()` does: with the vault clock moved instead, its receipt digest would drop at the same moment and the replay would be 409.
- **SKIPPED:** nothing hosted; no Cloudflare resource was touched. `<test:edge:db, if skipped, with the reason>`.
- **Not in this commit:** Task 7's money journey (plan Task 8 Step 1, ruling R5). 1A-T7 adds it to `test/workers/history.test.ts` as `it.todo`, and that file is not on the integration head yet. It is a separate follow-up once 1A-T7 merges.
- **Notes for 1B and later:**
  - The alarm runs `runDue(c)`, then `armAlarm(c, failed)`. 1B-T11 adds its file jobs between the two and replaces `armAlarm` with `rearm` and `alarmAt`. `reschedule` keeps rows of other jobs in `schedule` and returns the earliest of the whole table.
  - `purgeEntities(c, entity, ids)` takes at most 1,000 ids and must run inside the caller's block. It moves `pruned_through` over the purged entities' earlier changes.
  - `hasSupersededChange` relies on each head keeping exactly one change row of its own. Anything that writes a head must write its change row too, as `appendChanges` and `purgeEntities` do.
  - Retention skips a vault whose `account_state.status` is not `active`, and clears its alarm.
````

## Step 8: Commit

1. `/usr/bin/git -C WT add apps/edge/src/vault/retention.ts apps/edge/src/vault/user-vault.ts apps/edge/test/workers/retention.test.ts apps/edge/test/workers/sync.test.ts apps/edge/test/workers/support/v1-client.ts docs/implementation/premium-progress.md`
2. `/usr/bin/git -C WT status --short`. Expected: only those six paths, staged.
3. Commit with this message (summary line, body, blank line, trailer):

```
Run retention on the UserVault's alarm

Deleted records are purged 30 days after deletion, superseded changes are
pruned 30 days on, and receipt digests drop after the outbox lifetime. The
vault keeps the due jobs in its schedule, sets its alarm to the earliest, and
re-arms after every call that commits. Task 8b of plan 1A; Task 7's money
journey follows once Task 7 merges.

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
```

Use `/usr/bin/git -C WT commit -F S/commit-message.txt` after writing the message to `S/commit-message.txt` with the Write tool.

## Your final message

As the protocol says: `STATUS: DONE` or `STATUS: BLOCKED` first; the commit SHA and branch; the files; RED and GREEN counts; the mutants (16 killed, 3 equivalent); each gate command with its counts; SKIPPED items; deviations (the eight above, and any of your own).

## Follow-up for the orchestrator (not this task): Task 7's money journey

Once 1A-T7 is merged into `claude/p1a-vault-core`: in `apps/edge/test/workers/history.test.ts`, in `describe('the money journey')`, change `it.todo('seeds built-ins, records spending, and reads it back through history, summary, budgets, status and sync', async () => {` to `it('seeds built-ins, ...', async () => {`. 1A-T7's worktree already has the full body, ported from `test/dispatch.db.test.ts` lines 197 to 241 with its sync assertions. That is one word, R5's "Task 8 flips it to it in that same file". It needs no new code: every route it calls exists once 1A-T7 is in. Its proof is a mutant (for example, drop the `'budgets.put'` handler, or have `syncChanges` return no groups) that makes the journey fail, with a receipt line under this task's section. Size S.

---

## Appendix A.1: `apps/edge/src/vault/retention.ts` (sha256 `be59fcdf...c487`)

```ts
// Retention on the vault's alarm (§6.2 "Deletes and retention" and "Alarms"),
// ported from apps/api/drizzle/0015_privacy.sql: gogospend_retention_purge_account
// and gogospend_purge_entities (deleted records 30 days after deletion),
// gogospend_prune_account (superseded changes 30 days on) and
// gogospend_drop_receipt_digests (request digests after the 30-day outbox
// lifetime; the receipts stay). Each job's due time comes from the data, the
// vault keeps the due jobs in `schedule`, and the alarm is set to the earliest.
// Every job is its own transactionSync block, opened here, so none of these
// functions may run inside another block (R21). Revisions stay text: they are
// read as CAST(... AS TEXT) and bound as CAST(? AS INTEGER). Id lists bind as one
// JSON parameter (R57).
import { RESTORE_WINDOW_DAYS, SYNC_RETENTION_DAYS } from '@gogospend/contracts'
import type { EntityChange } from '@gogospend/contracts'

import { derivedUuid } from '@api/commands/derived-id'
import { changeGroupBytes } from '@api/sync/change-writer'

import { logFailure } from '../v1/log'
import type { VaultContext } from './context'

/** What the retention jobs read and write. A VaultContext is one, and so is 1B's FileContext. */
export type RetentionContext = Pick<VaultContext, 'sql' | 'storage' | 'now'>

export type RetentionJob = 'purge' | 'prune_changes' | 'drop_digests'

/** The jobs in the order the alarm runs them, the API's order (records.purge, sync.change_log, commands.receipt_digests). */
export const RETENTION_JOBS: readonly RetentionJob[] = ['purge', 'prune_changes', 'drop_digests']

const DAY_MS = 86_400_000
/** A deleted record is purged once its restore window has passed. */
export const PURGE_AFTER_MS = RESTORE_WINDOW_DAYS * DAY_MS
/** A superseded change is kept this long; older cursors resync. */
export const CHANGE_RETENTION_MS = SYNC_RETENTION_DAYS * DAY_MS
/** The API's 30-day outbox lifetime: a receipt's request digest is dropped after it. */
export const RECEIPT_DIGEST_MS = 30 * DAY_MS
/** At most this many records go into one purge change group (the API's batch). */
export const PURGE_BATCH = 1_000
/** At most this many purge groups per alarm; anything left stays due, so the next alarm continues. */
export const MAX_PURGE_PASSES = 100
/** After a job fails, the alarm comes back no sooner than this, so a failing job is never retried in a loop. */
export const RETENTION_RETRY_MS = 60_000

const isoAgo = (c: RetentionContext, ms: number): string => new Date(c.now.getTime() - ms).toISOString()

/** The earliest timestamp a query returns (`at`), plus `ms`, or undefined when there is none. */
function dueAfter(c: RetentionContext, ms: number, query: string): number | undefined {
  const at = c.sql.exec<{ at: string | null }>(query).toArray()[0]?.at
  const time = at ? Date.parse(at) : Number.NaN
  return Number.isFinite(time) ? time + ms : undefined
}

/** Only an active account keeps retention: one being deleted is left to its erasure, and an erased vault holds nothing. */
function accountIsActive(c: RetentionContext): boolean {
  return c.sql.exec<{ status: string }>('SELECT status FROM account_state WHERE id = 1').toArray()[0]?.status === 'active'
}

/** True when some change is superseded: every head keeps exactly one change row (its own), so any extra row is a superseded one. */
function hasSupersededChange(c: RetentionContext): boolean {
  return c.sql.exec<{ n: number }>('SELECT (SELECT count(*) FROM entity_changes) - (SELECT count(*) FROM entity_heads) AS n').one().n > 0
}

/**
 * When each job next has something to do, in epoch milliseconds (an absent job
 * has nothing to do):
 * - purge: the earliest live deleted_at, plus 30 days;
 * - prune_changes: while some change is superseded, the oldest change group
 *   above the retention line, plus 30 days (the API's
 *   gogospend_retention_candidates rule). Each prune moves the line past every
 *   group that old, so the next due time is always later than the prune;
 * - drop_digests: the earliest receipt still holding a digest, plus 30 days.
 * An account that is not active has nothing due.
 */
export function nextDue(c: RetentionContext): Map<RetentionJob, number> {
  const due = new Map<RetentionJob, number>()
  if (!accountIsActive(c)) return due
  const purge = dueAfter(c, PURGE_AFTER_MS, 'SELECT min(deleted_at) AS at FROM transactions WHERE deleted_at IS NOT NULL')
  const prune = hasSupersededChange(c)
    ? dueAfter(c, CHANGE_RETENTION_MS, 'SELECT min(g.committed_at) AS at FROM entity_changes g, sync_state s WHERE s.id = 1 AND g.ordinal = 0 AND g.revision > s.pruned_through')
    : undefined
  const digests = dueAfter(c, RECEIPT_DIGEST_MS, 'SELECT min(committed_at) AS at FROM command_receipts WHERE request_digest IS NOT NULL')
  if (purge !== undefined) due.set('purge', purge)
  if (prune !== undefined) due.set('prune_changes', prune)
  if (digests !== undefined) due.set('drop_digests', digests)
  return due
}

/**
 * Writes the due jobs into `schedule` (and removes the retention jobs with
 * nothing to do), then returns the earliest scheduled time, or null. Plain SQL:
 * the caller holds the block.
 */
export function reschedule(c: RetentionContext): number | null {
  const due = nextDue(c)
  for (const job of RETENTION_JOBS) {
    const at = due.get(job)
    if (at === undefined) c.sql.exec('DELETE FROM schedule WHERE job = ?', job).toArray()
    else c.sql.exec('INSERT INTO schedule (job, due_at) VALUES (?, ?) ON CONFLICT (job) DO UPDATE SET due_at = excluded.due_at', job, at).toArray()
  }
  return c.sql.exec<{ at: number | null }>('SELECT min(due_at) AS at FROM schedule').toArray()[0]?.at ?? null
}

/**
 * Replaces entities' data with `purged` tombstones (gogospend_purge_entities).
 * The caller holds the block and has already deleted the domain rows. In one
 * new change group, with no receipt, each live or deleted head becomes purged at
 * the next version. Every earlier change of those entities is deleted, and the
 * retention line moves over them, so an older cursor resyncs. Plain SQL, no
 * registry, at most PURGE_BATCH ids. Returns the group's revision, or null when
 * nothing was left to purge.
 */
export function purgeEntities(c: RetentionContext, entity: string, ids: readonly string[]): string | null {
  if (ids.length === 0) return null
  const list = JSON.stringify(ids)
  const heads = c.sql
    .exec<{ entity_id: string; version: number }>(
      "SELECT entity_id, version FROM entity_heads WHERE entity = ? AND entity_id IN (SELECT value FROM json_each(?)) AND state <> 'purged' ORDER BY entity_id",
      entity,
      list,
    )
    .toArray()
  if (heads.length === 0) return null
  c.sql.exec('UPDATE sync_state SET revision = revision + 1 WHERE id = 1').toArray()
  const { revision } = c.sql.exec<{ revision: string }>('SELECT CAST(revision AS TEXT) AS revision FROM sync_state WHERE id = 1').one()
  const { account_id: accountId } = c.sql.exec<{ account_id: string }>('SELECT account_id FROM account_state WHERE id = 1').one()
  const commandId = derivedUuid(accountId, 'retention-purge', revision)
  const old =
    c.sql
      .exec<{ old: string | null }>(
        'SELECT CAST(max(revision) AS TEXT) AS old FROM entity_changes WHERE entity = ? AND entity_id IN (SELECT value FROM json_each(?)) AND revision < CAST(? AS INTEGER)',
        entity,
        list,
        revision,
      )
      .toArray()[0]?.old ?? '0'
  c.sql.exec('DELETE FROM entity_changes WHERE entity = ? AND entity_id IN (SELECT value FROM json_each(?)) AND revision < CAST(? AS INTEGER)', entity, list, revision).toArray()
  const changes: EntityChange[] = heads.map((head) => ({ entity, id: head.entity_id, version: head.version + 1, state: 'purged', snapshot: null }))
  const groupBytes = changeGroupBytes(commandId, changes)
  const committedAt = c.now.toISOString()
  changes.forEach((change, ordinal) => {
    c.sql
      .exec(
        `INSERT INTO entity_changes (revision, ordinal, command_id, entity, entity_id, version, state, snapshot, committed_at, group_bytes)
         VALUES (CAST(? AS INTEGER), ?, ?, ?, ?, ?, 'purged', NULL, ?, ?)`,
        revision,
        ordinal,
        commandId,
        change.entity,
        change.id,
        change.version,
        committedAt,
        ordinal === 0 ? groupBytes : null,
      )
      .toArray()
  })
  c.sql
    .exec(
      "UPDATE entity_heads SET version = version + 1, state = 'purged', revision = CAST(? AS INTEGER) WHERE entity = ? AND entity_id IN (SELECT value FROM json_each(?)) AND state <> 'purged'",
      revision,
      entity,
      list,
    )
    .toArray()
  c.sql.exec('UPDATE sync_state SET pruned_through = max(pruned_through, CAST(? AS INTEGER)) WHERE id = 1', old).toArray()
  return revision
}

/**
 * Up to PURGE_BATCH records deleted at least 30 days ago, oldest first: their
 * rows are deleted and their entities purged as one group (the API's
 * gogospend_retention_purge_account, transactions half). Returns how many.
 */
export function purgeExpiredRecords(c: RetentionContext): number {
  const ids = c.sql
    .exec<{ id: string }>('SELECT id FROM transactions WHERE deleted_at IS NOT NULL AND deleted_at <= ? ORDER BY deleted_at, id LIMIT ?', isoAgo(c, PURGE_AFTER_MS), PURGE_BATCH)
    .toArray()
    .map((row) => row.id)
  if (ids.length === 0) return 0
  c.sql.exec('DELETE FROM transactions WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify(ids)).toArray()
  purgeEntities(c, 'transaction', ids)
  return ids.length
}

/**
 * The change-log prune (the latest gogospend_prune_account): the cut is the last
 * change group above the retention line committed at least 30 days ago. Every
 * change at or below the cut that is not its entity's head is deleted, and the
 * line moves to the cut. True when the line moved. The API visits only the
 * entities changed since its last pass, a PostgreSQL index shortcut. One vault
 * deletes them all in one statement, which also removes a change superseded
 * below a line that a purge moved.
 */
export function pruneChanges(c: RetentionContext): boolean {
  const cut = c.sql
    .exec<{ cut: string | null }>(
      'SELECT CAST(max(g.revision) AS TEXT) AS cut FROM entity_changes g, sync_state s WHERE s.id = 1 AND g.ordinal = 0 AND g.revision > s.pruned_through AND g.committed_at <= ?',
      isoAgo(c, CHANGE_RETENTION_MS),
    )
    .toArray()[0]?.cut
  if (!cut) return false
  c.sql
    .exec(
      `DELETE FROM entity_changes WHERE revision <= CAST(? AS INTEGER)
         AND NOT EXISTS (SELECT 1 FROM entity_heads h WHERE h.entity = entity_changes.entity AND h.entity_id = entity_changes.entity_id AND h.revision = entity_changes.revision)`,
      cut,
    )
    .toArray()
  c.sql.exec('UPDATE sync_state SET pruned_through = CAST(? AS INTEGER) WHERE id = 1', cut).toArray()
  return true
}

/** Drops the request digest of every receipt committed at least 30 days ago (gogospend_drop_receipt_digests). The receipt stays. Returns how many. */
export function dropReceiptDigests(c: RetentionContext): number {
  return c.sql
    .exec('UPDATE command_receipts SET request_digest = NULL, digest_key_id = NULL WHERE request_digest IS NOT NULL AND committed_at <= ? RETURNING command_id', isoAgo(c, RECEIPT_DIGEST_MS))
    .toArray().length
}

const RUNNERS: Record<RetentionJob, (c: RetentionContext) => void> = {
  purge: (c) => {
    for (let pass = 0; pass < MAX_PURGE_PASSES; pass += 1) {
      if (c.storage.transactionSync(() => purgeExpiredRecords(c)) < PURGE_BATCH) return
    }
  },
  prune_changes: (c) => {
    c.storage.transactionSync(() => pruneChanges(c))
  },
  drop_digests: (c) => {
    c.storage.transactionSync(() => dropReceiptDigests(c))
  },
}

/**
 * Runs every job that is due at the context's time, in RETENTION_JOBS order,
 * each in its own block. A job that throws is rolled back and logged, and the
 * others still run. Returns the jobs that failed.
 */
export function runDue(c: RetentionContext): RetentionJob[] {
  const due = nextDue(c)
  const failed: RetentionJob[] = []
  for (const job of RETENTION_JOBS) {
    const at = due.get(job)
    if (at === undefined || at > c.now.getTime()) continue
    try {
      RUNNERS[job](c)
    } catch (error) {
      logFailure(`vault_retention_${job}_failed`, error)
      failed.push(job)
    }
  }
  return failed
}

/**
 * Sets the vault's alarm to the earliest scheduled job, or deletes it when none
 * is left. Opens its own block for `schedule`, then calls setAlarm or
 * deleteAlarm outside it. After a failed job the alarm is a minute out at the
 * earliest. A failure here is logged, never thrown: the caller's command has
 * already committed. Returns the time set, or null.
 */
export function armAlarm(c: RetentionContext, failed: readonly RetentionJob[] = []): number | null {
  try {
    const due = c.storage.transactionSync(() => reschedule(c))
    const at = due === null ? null : failed.length > 0 ? Math.max(due, c.now.getTime() + RETENTION_RETRY_MS) : due
    if (at === null) void c.storage.deleteAlarm()
    else void c.storage.setAlarm(at)
    return at
  } catch (error) {
    logFailure('vault_alarm_unset', error)
    return null
  }
}

/** The account's revision as text, so a call can tell whether it committed a change group. */
export function committedRevision(c: RetentionContext): string {
  return c.sql.exec<{ revision: string }>('SELECT CAST(revision AS TEXT) AS revision FROM sync_state WHERE id = 1').toArray()[0]?.revision ?? '0'
}
```

## Appendix A.2: the typed stubs, `apps/edge/src/vault/retention.ts` for RED (sha256 `ca2e0859...7286`)

```ts
// Typed stubs for 1A-T8b's RED run (protocol step 3). Every export has its final
// signature and does nothing. Step 5 replaces this file with the real one.
import type { VaultContext } from './context'

export type RetentionContext = Pick<VaultContext, 'sql' | 'storage' | 'now'>
export type RetentionJob = 'purge' | 'prune_changes' | 'drop_digests'
export const RETENTION_JOBS: readonly RetentionJob[] = ['purge', 'prune_changes', 'drop_digests']
export const PURGE_AFTER_MS = 30 * 86_400_000
export const CHANGE_RETENTION_MS = 30 * 86_400_000
export const RECEIPT_DIGEST_MS = 30 * 86_400_000
export const PURGE_BATCH = 1_000
export const MAX_PURGE_PASSES = 100
export const RETENTION_RETRY_MS = 60_000

export function nextDue(_c: RetentionContext): Map<RetentionJob, number> {
  return new Map()
}
export function reschedule(_c: RetentionContext): number | null {
  return null
}
export function purgeEntities(_c: RetentionContext, _entity: string, _ids: readonly string[]): string | null {
  return null
}
export function purgeExpiredRecords(_c: RetentionContext): number {
  return 0
}
export function pruneChanges(_c: RetentionContext): boolean {
  return false
}
export function dropReceiptDigests(_c: RetentionContext): number {
  return 0
}
export function runDue(_c: RetentionContext): RetentionJob[] {
  return []
}
export function armAlarm(_c: RetentionContext, _failed: readonly RetentionJob[] = []): number | null {
  return null
}
export function committedRevision(_c: RetentionContext): string {
  return '0'
}
```

(The stub's own comment says "Step 5"; in this brief that is Step 4, GREEN. The text is kept as verified.)

## Appendix A.3: `apps/edge/test/workers/retention.test.ts` (sha256 `a71e355e...5ea0`)

```ts
// Retention on the vault's alarm (1A-T8b, §6.2): a deleted record is purged 30
// days after its deletion, a superseded change is pruned 30 days on, and a
// receipt's request digest is dropped after the 30-day outbox lifetime. Ported by
// name from apps/api/src/privacy/retention.integration.spec.ts (14 cases): the
// five the plan lists, and three in changed form ('leaves an account being erased
// to its erasure', 'a failing step is reported and does not stop the others', and
// 'every prune works in bounded batches' as the 1,001-record case). Three are
// 1B's (exports, uploads, snapshots). Three do not apply: a lock wait, the
// security tables (D1's, in 1C) and PostgreSQL's planner. The receipt lists them.
// Time is the vault's clock (UserVault#clock), set through runInDurableObject.
// Alarms run through runDurableObjectAlarm, never by waiting. Each test takes
// t0 from Date.now() (R6), so every alarm it sets is about 30 days in the real
// future and never fires on its own.
import { randomUUID } from 'node:crypto'

import { evictAllDurableObjects, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'

import type { CommandAck, SyncChangesPage } from '@gogospend/contracts'

import type { UserVault } from '../../src/vault/user-vault'
import { sqlExec, sqlRows } from './support/command-fixtures'
import { builtinId, moneyFixtures } from './support/money-fixtures'
import { createLunch, member, startV1, vaultOf } from './support/v1-client'
import type { TestUser, V1Client } from './support/v1-client'

let client: V1Client
let money: ReturnType<typeof moneyFixtures>

beforeEach(async () => {
  client = await startV1()
  money = moneyFixtures(client)
})

const DAY = 86_400_000
const NOTE = 'secret lunch with a private person'

const setClock = (user: TestUser, at: number) =>
  runInDurableObject(vaultOf(user), (v: UserVault) => {
    v.clock = () => new Date(at)
  })
const headState = (user: TestUser, id: string) => runInDurableObject(vaultOf(user), (_v, s) => s.storage.sql.exec('SELECT state FROM entity_heads WHERE entity_id = ?', id).one().state)
const alarmOf = (user: TestUser) => runInDurableObject(vaultOf(user), (_v, s) => s.storage.getAlarm())

type Head = { version: number; state: string; revision: string }
type Change = { revision: string; version: number; state: string; snapshot: string | null }

const headOf = async (user: TestUser, id: string): Promise<Head> =>
  (await sqlRows<Head>(user, 'SELECT version, state, CAST(revision AS TEXT) AS revision FROM entity_heads WHERE entity_id = ?', id))[0]
const changesOf = (user: TestUser, id: string) =>
  sqlRows<Change>(user, 'SELECT CAST(revision AS TEXT) AS revision, version, state, snapshot FROM entity_changes WHERE entity_id = ? ORDER BY revision', id)
const syncState = async (user: TestUser) =>
  (await sqlRows<{ revision: string; pruned_through: string }>(user, 'SELECT CAST(revision AS TEXT) AS revision, CAST(pruned_through AS TEXT) AS pruned_through FROM sync_state WHERE id = 1'))[0]
const count = async (user: TestUser, query: string, ...args: unknown[]) => (await sqlRows<{ n: number }>(user, query, ...args))[0].n
const leaked = (user: TestUser) => count(user, 'SELECT count(*) AS n FROM entity_changes WHERE snapshot LIKE ?', `%${NOTE}%`)

type Diary = { user: TestUser; cash: string }

/** A member whose vault clock reads `at`, with the built-in categories (revision 1) and a Cash wallet opening at 0 (revision 2). */
async function diary(at: number): Promise<Diary> {
  const user = await member(client)
  await setClock(user, at)
  expect((await client.as(user).post('/v1/categories/builtins')).status).toBe(200)
  const cash = await money.wallet(user, { name: 'Cash', opening_minor: '0', tracking_start: '2026-10-01' })
  return { user, cash }
}

/** POST /v1/transactions with a fixed key and body, so it can be replayed. */
async function create(d: Diary, overrides: Record<string, unknown> = {}) {
  const body = { id: randomUUID(), type: 'expense', amount_minor: '6500', occurred_on: '2026-10-20', wallet_id: d.cash, category_id: builtinId(d.user, 'food'), note: NOTE, ...overrides }
  const key = randomUUID()
  const res = await client.as(d.user).post('/v1/transactions', body, { key })
  expect(res.status).toBe(201)
  return { body, key, ack: (await res.json()) as CommandAck }
}

async function remove(user: TestUser, id: string, version = 1): Promise<void> {
  expect((await client.as(user).del(`/v1/transactions/${id}`, { ifMatch: version })).status).toBe(200)
}

/** Moves a record's history and its deletion `days` before `now` (the API's age). */
async function age(user: TestUser, id: string, now: number, days: number): Promise<void> {
  const at = new Date(now - days * DAY).toISOString()
  await sqlExec(user, "UPDATE entity_changes SET committed_at = ? WHERE entity = 'transaction' AND entity_id = ?", at, id)
  await sqlExec(user, 'UPDATE transactions SET deleted_at = ? WHERE id = ? AND deleted_at IS NOT NULL', at, id)
}

/**
 * `n` deleted records written straight into the vault, deleted at `at`, each head
 * at version 2 and deleted, under one new revision (the HTTP route would spend
 * the write budget long before 1,001 records).
 */
async function seedDeleted(user: TestUser, lunch: string, n: number, at: number): Promise<string[]> {
  const ids = Array.from({ length: n }, () => randomUUID())
  const deletedAt = new Date(at).toISOString()
  await runInDurableObject(vaultOf(user), (_v, s) =>
    s.storage.transactionSync(() => {
      const { wallet_id: wallet, category_id: category } = s.storage.sql.exec('SELECT wallet_id, category_id FROM transactions WHERE id = ?', lunch).one()
      s.storage.sql.exec('UPDATE sync_state SET revision = revision + 1 WHERE id = 1')
      for (const id of ids) {
        s.storage.sql.exec(
          "INSERT INTO transactions (id, type, amount_minor, occurred_on, wallet_id, category_id, version, deleted_at, created_at, updated_at) VALUES (?, 'expense', 100, '2026-10-20', ?, ?, 2, ?, ?, ?)",
          id,
          wallet,
          category,
          deletedAt,
          deletedAt,
          deletedAt,
        )
        s.storage.sql.exec("INSERT INTO entity_heads (entity, entity_id, version, state, revision) VALUES ('transaction', ?, 1, 'active', (SELECT revision FROM sync_state WHERE id = 1))", id)
        s.storage.sql.exec("UPDATE entity_heads SET version = 2, state = 'deleted' WHERE entity = 'transaction' AND entity_id = ?", id)
      }
    }),
  )
  return ids
}

/** The cursor after every group, following next_cursor as a client does. */
async function latestCursor(user: TestUser): Promise<string> {
  let cursor: string | undefined
  for (;;) {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}&limit=1000` : '?limit=1000'
    const page = (await (await client.as(user).get(`/v1/sync/changes${query}`)).json()) as SyncChangesPage
    cursor = page.next_cursor
    if (!page.has_more) return cursor
  }
}

describe('deleted records, ported from retention.integration.spec.ts', () => {
  it('purged_transactions_are_not_resurrected_by_receipts', async () => {
    const t0 = Date.now()
    const d = await diary(t0)
    const record = await create(d)
    await remove(d.user, record.body.id)
    // Only the record ages, as in the API: its receipt keeps its digest, so the replay below still proves the request.
    await age(d.user, record.body.id, t0, 31)
    expect(await runDurableObjectAlarm(vaultOf(d.user))).toBe(true)

    // The private row and every earlier change payload are gone; the head is a purged tombstone.
    expect(await sqlRows(d.user, 'SELECT 1 FROM transactions WHERE id = ?', record.body.id)).toEqual([])
    expect(await headOf(d.user, record.body.id)).toMatchObject({ version: 3, state: 'purged' })
    expect(await changesOf(d.user, record.body.id)).toEqual([expect.objectContaining({ version: 3, state: 'purged', snapshot: null })])
    expect(await leaked(d.user)).toBe(0)

    // The compact receipt answers a replay with the original outcome and the current (purged) state, and writes nothing.
    const replay = await client.as(d.user).post('/v1/transactions', record.body, { key: record.key })
    expect(replay.status).toBe(201)
    expect(await replay.json()).toEqual({ ...record.ack, entity_state: 'purged' })
    expect(await sqlRows(d.user, 'SELECT 1 FROM transactions WHERE id = ?', record.body.id)).toEqual([])
    // A new command for the same id cannot bring it back either.
    expect((await client.as(d.user).post('/v1/transactions', record.body)).status).toBe(410)
    expect((await client.as(d.user).post(`/v1/transactions/${record.body.id}/restore`, {}, { ifMatch: 2 })).status).toBe(410)
    expect((await client.as(d.user).patch(`/v1/transactions/${record.body.id}`, { amount_minor: '1' }, { ifMatch: 2 })).status).toBe(410)
    expect((await client.as(d.user).get(`/v1/transactions/${record.body.id}`)).status).toBe(404)
    const status = (await (await client.as(d.user).post('/v1/commands/status', { command_ids: [record.key] })).json()) as { statuses: unknown[] }
    expect(status.statuses[0]).toEqual({ command_id: record.key, state: 'known', ack: { ...record.ack, entity_state: 'purged' } })
    // Purging again changes nothing.
    const head = await headOf(d.user, record.body.id)
    expect(await runDurableObjectAlarm(vaultOf(d.user))).toBe(true)
    expect(await headOf(d.user, record.body.id)).toEqual(head)
  })

  it('a deleted record stops counting at once and can be undone within 30 days; nothing is purged early', async () => {
    const t0 = Date.now()
    const d = await diary(t0)
    const kept = await create(d, { amount_minor: '1000' })
    const undone = await create(d, { amount_minor: '2000' })
    await remove(d.user, undone.body.id)
    expect((await money.balances(d.user))[d.cash]).toBe('-1000')
    await setClock(d.user, t0 + 29 * DAY)
    expect(await runDurableObjectAlarm(vaultOf(d.user))).toBe(true)
    expect(await headState(d.user, undone.body.id)).toBe('deleted')
    expect((await client.as(d.user).post(`/v1/transactions/${undone.body.id}/restore`, {}, { ifMatch: 2 })).status).toBe(200)
    expect((await money.balances(d.user))[d.cash]).toBe('-3000')
    expect(await headState(d.user, kept.body.id)).toBe('active')
  })

  it('tombstones reach delta readers, older cursors resync', async () => {
    // The snapshot half (snapshots built before the purge are dropped) is 1B's (1B-T8).
    const t0 = Date.now()
    const d = await diary(t0)
    const beforeRecord = await latestCursor(d.user)
    const record = await create(d)
    await remove(d.user, record.body.id)
    const afterDelete = await latestCursor(d.user)
    const deletedAt = (await syncState(d.user)).revision
    await setClock(d.user, t0 + 31 * DAY)
    expect(await runDurableObjectAlarm(vaultOf(d.user))).toBe(true)

    // A reader that had seen the deletion gets the tombstone as one more group.
    const next = await client.as(d.user).get(`/v1/sync/changes?cursor=${encodeURIComponent(afterDelete)}`)
    expect(next.status).toBe(200)
    const groups = ((await next.json()) as SyncChangesPage).groups
    expect(groups.flatMap((group) => group.changes)).toEqual([{ entity: 'transaction', id: record.body.id, version: 3, state: 'purged', snapshot: null }])
    // A reader from before the record's changes resyncs: they no longer exist.
    const stale = await client.as(d.user).get(`/v1/sync/changes?cursor=${encodeURIComponent(beforeRecord)}`)
    expect(stale.status).toBe(410)
    expect(((await stale.json()) as { code?: string }).code).toBe('RESYNC_REQUIRED')
    expect(BigInt((await syncState(d.user)).pruned_through)).toBeGreaterThanOrEqual(BigInt(deletedAt))
    // A new snapshot reads the head's own change: a tombstone without data.
    const head = await headOf(d.user, record.body.id)
    expect(await sqlRows(d.user, 'SELECT snapshot FROM entity_changes WHERE entity_id = ? AND revision = CAST(? AS INTEGER)', record.body.id, head.revision)).toEqual([{ snapshot: null }])
  })

  it('leaves an account being erased to its erasure: no purge group is written for it', async () => {
    // Ported in changed form: the status is set directly, as 1C's DeletionWorkflow will set it. The vault
    // skips every job, and the alarm is cleared (§6.12, deletion step 2: "refuses writes and cancels alarms").
    const t0 = Date.now()
    const user = await member(client)
    await setClock(user, t0)
    const lunch = await createLunch(client, user)
    await client.as(user).del(`/v1/transactions/${lunch}`, { ifMatch: 1 })
    await sqlExec(user, "UPDATE account_state SET status = 'deleting' WHERE id = 1")
    const revision = (await syncState(user)).revision
    await setClock(user, t0 + 31 * DAY)
    expect(await runDurableObjectAlarm(vaultOf(user))).toBe(true)
    expect(await headState(user, lunch)).toBe('deleted')
    expect((await syncState(user)).revision).toBe(revision)
    expect(await count(user, 'SELECT count(*) AS n FROM command_receipts WHERE request_digest IS NULL')).toBe(0)
    expect(await alarmOf(user)).toBeNull()
  })
})

describe('other retention, ported from retention.integration.spec.ts', () => {
  it('drops receipt digests after the outbox lifetime: a replay is refused and never re-run; status still answers', async () => {
    const t0 = Date.now()
    const d = await diary(t0)
    const old = await create(d)
    await setClock(d.user, t0 + 2 * DAY)
    const fresh = await create(d)
    await setClock(d.user, t0 + 31 * DAY)
    expect(await runDurableObjectAlarm(vaultOf(d.user))).toBe(true)
    const digests = await sqlRows<{ command_id: string; dropped: number }>(
      d.user,
      'SELECT command_id, request_digest IS NULL AS dropped FROM command_receipts WHERE command_id IN (SELECT value FROM json_each(?))',
      JSON.stringify([old.key, fresh.key]),
    )
    expect(Object.fromEntries(digests.map((row) => [row.command_id, row.dropped]))).toEqual({ [old.key]: 1, [fresh.key]: 0 })
    const replay = await client.as(d.user).post('/v1/transactions', old.body, { key: old.key })
    expect(replay.status).toBe(409)
    expect(((await replay.json()) as { code?: string }).code).toBe('IDEMPOTENCY_MISMATCH')
    expect(await count(d.user, 'SELECT count(*) AS n FROM transactions')).toBe(2)
    const status = (await (await client.as(d.user).post('/v1/commands/status', { command_ids: [old.key] })).json()) as { statuses: unknown[] }
    expect(status.statuses[0]).toEqual({ command_id: old.key, state: 'known', ack: old.ack })
    // The fresh receipt still replays.
    expect(await (await client.as(d.user).post('/v1/transactions', fresh.body, { key: fresh.key })).json()).toEqual(fresh.ack)
  })

  it('removes a superseded change that sat below the retention line (S1 change log)', async () => {
    const t0 = Date.now()
    const d = await diary(t0)
    const record = await create(d)
    // Renaming the wallet supersedes its first change, so the prune is due and moves the line past the record's create.
    expect((await client.as(d.user).patch(`/v1/wallets/${d.cash}`, { name: 'Cash 2' }, { ifMatch: 1 })).status).toBe(200)
    await setClock(d.user, t0 + 31 * DAY)
    expect(await runDurableObjectAlarm(vaultOf(d.user))).toBe(true)
    // The create is the head, so it survived and the retention line moved past it.
    expect(BigInt((await syncState(d.user)).pruned_through)).toBeGreaterThanOrEqual(BigInt((await headOf(d.user, record.body.id)).revision))
    expect(await changesOf(d.user, record.body.id)).toHaveLength(1)
    expect((await client.as(d.user).patch(`/v1/transactions/${record.body.id}`, { note: 'edited' }, { ifMatch: 1 })).status).toBe(200)
    // The create is now superseded below the line. It can go 30 days after the edit, and the alarm waits for that, not for a time already past.
    expect(await alarmOf(d.user)).toBe(t0 + 61 * DAY)
    await setClock(d.user, t0 + 62 * DAY)
    expect(await runDurableObjectAlarm(vaultOf(d.user))).toBe(true)
    expect((await changesOf(d.user, record.body.id)).map((change) => change.version)).toEqual([2])
    expect(await leaked(d.user)).toBe(0)
  })

  it('a failing step is reported and does not stop the others', async () => {
    // Ported in changed form: a trigger makes the purge fail. The failure is logged, the prune and the digest drop
    // still run, and the alarm comes back a minute later, so a failing job is never retried in a loop.
    const t0 = Date.now()
    const user = await member(client)
    await setClock(user, t0)
    const lunch = await createLunch(client, user)
    await client.as(user).del(`/v1/transactions/${lunch}`, { ifMatch: 1 })
    await sqlExec(user, "CREATE TRIGGER fail_purge BEFORE DELETE ON transactions BEGIN SELECT RAISE(ABORT, 'synthetic purge failure'); END")
    try {
      await setClock(user, t0 + 31 * DAY)
      expect(await runDurableObjectAlarm(vaultOf(user))).toBe(true)
      expect(await headState(user, lunch)).toBe('deleted')
      expect(await count(user, 'SELECT count(*) AS n FROM command_receipts WHERE request_digest IS NOT NULL')).toBe(0)
      expect(await alarmOf(user)).toBe(t0 + 31 * DAY + 60_000)
    } finally {
      await sqlExec(user, 'DROP TRIGGER fail_purge')
    }
    expect(await runDurableObjectAlarm(vaultOf(user))).toBe(true)
    expect(await headState(user, lunch)).toBe('purged')
    expect(await alarmOf(user)).toBeNull()
  })
})

describe('the retention alarm', () => {
  it('a deleted record is purged by the alarm 30 days later, and the alarm follows the earliest job', async () => {
    const t0 = Date.now()
    const user = await member(client)
    await setClock(user, t0)
    const lunch = await createLunch(client, user)
    await client.as(user).del(`/v1/transactions/${lunch}`, { ifMatch: 1 })
    expect(await runInDurableObject(vaultOf(user), (_v, s) => s.storage.getAlarm())).toBe(t0 + 30 * DAY)
    await setClock(user, t0 + 31 * DAY)
    expect(await runDurableObjectAlarm(vaultOf(user))).toBe(true)
    expect(await headState(user, lunch)).toBe('purged')
  })

  it('an alarm that fires after the vault slept still purges', async () => {
    const t0 = Date.now()
    const user = await member(client)
    await setClock(user, t0)
    const lunch = await createLunch(client, user)
    await client.as(user).del(`/v1/transactions/${lunch}`, { ifMatch: 1 })
    await evictAllDurableObjects()
    await setClock(user, t0 + 31 * DAY)
    expect(await runDurableObjectAlarm(vaultOf(user))).toBe(true)
    expect(await headState(user, lunch)).toBe('purged')
  })

  it('with nothing left to do, the alarm is cleared', async () => {
    const t0 = Date.now()
    const user = await member(client)
    await setClock(user, t0)
    await createLunch(client, user)
    await setClock(user, t0 + 31 * DAY)
    await runDurableObjectAlarm(vaultOf(user)) // drops the receipt digests, the only due job
    expect(await runInDurableObject(vaultOf(user), (_v, s) => s.storage.getAlarm())).toBeNull()
  })

  it('the alarm follows the earliest job, and each record waits its own 30 days', async () => {
    const t0 = Date.now()
    const user = await member(client)
    await setClock(user, t0)
    const lunch = await createLunch(client, user) // its receipts' digests are due at t0 + 30 days
    await setClock(user, t0 + 5 * DAY)
    await client.as(user).del(`/v1/transactions/${lunch}`, { ifMatch: 1 }) // the lunch is due at t0 + 35 days
    await setClock(user, t0 + 6 * DAY)
    const dinner = await createLunch(client, user)
    await client.as(user).del(`/v1/transactions/${dinner}`, { ifMatch: 1 }) // the dinner is due at t0 + 36 days
    expect(await alarmOf(user)).toBe(t0 + 30 * DAY)
    await setClock(user, t0 + 31 * DAY)
    expect(await runDurableObjectAlarm(vaultOf(user))).toBe(true)
    expect(await headState(user, lunch)).toBe('deleted')
    expect(await alarmOf(user)).toBe(t0 + 35 * DAY)
    // Exactly 30 days after its deletion the lunch goes; the dinner, deleted a day later, stays.
    await setClock(user, t0 + 35 * DAY)
    expect(await runDurableObjectAlarm(vaultOf(user))).toBe(true)
    expect(await headState(user, lunch)).toBe('purged')
    expect(await headState(user, dinner)).toBe('deleted')
    expect(await alarmOf(user)).toBe(t0 + 36 * DAY)
    await setClock(user, t0 + 36 * DAY)
    expect(await runDurableObjectAlarm(vaultOf(user))).toBe(true)
    expect(await headState(user, dinner)).toBe('purged')
    expect(await alarmOf(user)).toBeNull()
  })

  it('purges more records than SQLite has parameters, at most 1,000 to a change group', async () => {
    // The vault's 'every prune works in bounded batches': each group holds at most 1,000 records, and the id lists bind as one JSON parameter (R57).
    const t0 = Date.now()
    const user = await member(client)
    await setClock(user, t0)
    const lunch = await createLunch(client, user)
    await seedDeleted(user, lunch, 1_001, t0)
    await setClock(user, t0 + 31 * DAY)
    expect(await runDurableObjectAlarm(vaultOf(user))).toBe(true)
    expect(await count(user, "SELECT count(*) AS n FROM entity_heads WHERE entity = 'transaction' AND state = 'purged'")).toBe(1_001)
    expect(await count(user, 'SELECT count(*) AS n FROM transactions WHERE deleted_at IS NOT NULL')).toBe(0)
    const groups = await sqlRows<{ n: number }>(user, "SELECT count(*) AS n FROM entity_changes WHERE state = 'purged' GROUP BY revision ORDER BY revision")
    expect(groups.map((group) => group.n)).toEqual([1_000, 1])
  })

  it('an erased vault runs no retention and keeps no alarm, awake or after it sleeps', async () => {
    const t0 = Date.now()
    const user = await member(client)
    await setClock(user, t0)
    const lunch = await createLunch(client, user)
    await client.as(user).del(`/v1/transactions/${lunch}`, { ifMatch: 1 })
    await vaultOf(user).erase()
    expect(await alarmOf(user)).toBeNull()
    for (const asleep of [false, true]) {
      if (asleep) await evictAllDurableObjects()
      await setClock(user, t0 + 31 * DAY)
      await runInDurableObject(vaultOf(user), (_v, s) => s.storage.setAlarm(t0 + DAY))
      expect(await runDurableObjectAlarm(vaultOf(user))).toBe(true)
      expect(await alarmOf(user)).toBeNull()
      expect(await sqlRows(user, 'SELECT job FROM schedule')).toEqual([])
      expect(await sqlRows(user, 'SELECT account_id, status FROM account_state')).toEqual([{ account_id: '', status: 'deleted' }])
    }
  })
})
```

## Appendix B: Edits for the three existing files (use only when Step 1.4 found a different base)

### B.1 `apps/edge/src/vault/user-vault.ts` (three places)

1. The import, right after the `./replies` import (1B-T4 adds its imports after the last import, `./files/keys`, so these do not touch):
   - old_string: `import { toProblemReply } from './replies'\n` (that line alone)
   - new_string:
     ```ts
     import { toProblemReply } from './replies'
     import { armAlarm, committedRevision, runDue } from './retention'
     ```
2. `alarm()`, right after `erase()` and before `call()`'s doc comment (1B-T4 adds its methods at the end of the class, after `built()`):
   - old_string:
     ```ts
       /**
        * One call from the Worker, under the vault's checks in this order: the
     ```
   - new_string:
     ```ts
       /**
        * The vault's alarm (§6.2 "Alarms", 1A-T8b): runs the retention jobs that are
        * due, then sets the alarm to the earliest job left, or deletes it. A failed job
        * brings the alarm back a minute later, never in a loop. An erased vault does
        * nothing: erase() already cancelled the alarm.
        */
       async alarm(): Promise<void> {
         if (this.erased) return
         const c = { sql: this.ctx.storage.sql, storage: this.ctx.storage, now: this.clock() }
         armAlarm(c, runDue(c))
       }

       /**
        * One call from the Worker, under the vault's checks in this order: the
     ```
3. Inside `call()`, two edits (1B-T4 adds `vaultId: this.vaultId,` inside the context literal between them; neither edit touches it):
   - old_string: `      return this.ctx.storage.transactionSync(() => {`
   - new_string: `      const { reply, committed } = this.ctx.storage.transactionSync(() => {`
   - and old_string:
     ```ts
             return handler(c, call)
           })
     ```
   - new_string:
     ```ts
             const before = committedRevision(c)
             const result = handler(c, call)
             return { reply: result, committed: committedRevision(c) === before ? undefined : c }
           })
           // A call that committed a command moves the alarm, outside the block (1A-T8b).
           if (committed) armAlarm(committed)
           return reply
     ```

### B.2 `apps/edge/test/workers/support/v1-client.ts`

Append at the very end of the file (after `vaultOf`), with one blank line before it:

```ts
/**
 * One recorded lunch, for the retention tests (1A-T8b): a wallet, the built-in
 * categories, and one `food` expense of 6500 on 2026-10-20. Returns its id.
 */
export async function createLunch(client: V1Client, user: TestUser): Promise<string> {
  const wallet = crypto.randomUUID()
  const created = await client.as(user).post('/v1/wallets', { id: wallet, name: 'Cash', opening_minor: '0', tracking_start: '2026-10-01' })
  if (created.status !== 201) throw new Error(`creating the wallet answered ${created.status}`)
  const seeded = await client.as(user).post('/v1/categories/builtins')
  if (seeded.status !== 200) throw new Error(`seeding the built-in categories answered ${seeded.status}`)
  const food = ((await seeded.json()) as { id: string; builtin_key: string | null }[]).find((category) => category.builtin_key === 'food')
  if (!food) throw new Error('the built-in categories have no food')
  const lunch = crypto.randomUUID()
  const recorded = await client.as(user).post('/v1/transactions', { id: lunch, type: 'expense', amount_minor: '6500', occurred_on: '2026-10-20', wallet_id: wallet, category_id: food.id })
  if (recorded.status !== 201) throw new Error(`recording the lunch answered ${recorded.status}`)
  return lunch
}
```

### B.3 `apps/edge/test/workers/sync.test.ts` (seven edits)

1. The header: replace the first nine lines (from `// Sync changes in the vault, ported by name from` through `// cases (1B). The receipt gives each case's reason.`) with:
   ```ts
   // Sync changes in the vault, ported by name from
   // apps/api/src/sync/sync-query.integration.spec.ts (13 cases) and
   // sync-api.integration.spec.ts (5 cases). Ported in full: 10, the 30-day
   // retention case with 8b's prune run. In part: 3, each with its missing half in
   // 1B (the lifecycle generation, the snapshot step, the export and import
   // entities of the registry check). Not applicable: 3, two lock waits and the
   // batch across accounts (a vault call runs to completion, and one vault holds
   // one account). Deferred to 1B: the two snapshot cases. The receipts give each
   // case's reason.
   ```
2. old `import { SYNC_PAGE_BYTES, isCommittedChangeGroup } from '@gogospend/contracts'` → new `import { SYNC_ENTITY_VALIDATORS, SYNC_PAGE_BYTES, isCommittedChangeGroup } from '@gogospend/contracts'`.
3. old:
   ```ts
   import { syncChanges } from '../../src/vault/reads/sync'
   import { FIXTURE_ENTITY, fixtureCommands, inVault, purchase, sqlExec, syncRegistry } from './support/command-fixtures'
   ```
   new:
   ```ts
   import { buildVaultRegistry } from '../../src/vault/commands/registry'
   import { syncChanges } from '../../src/vault/reads/sync'
   import { pruneChanges } from '../../src/vault/retention'
   import { FIXTURE_ENTITY, fixtureCommands, inVault, purchase, sqlExec, sqlRows, syncRegistry } from './support/command-fixtures'
   ```
4. After the line `const wallet = (name: string) => ({ id: randomUUID(), name, opening_minor: '0', tracking_start: '2026-01-01' })`, add:
   ```ts
   const DAY = 86_400_000

   /** One change-log prune in its own block, at `at` (epoch ms), as the vault's alarm runs it (1A-T8b's retention.ts). */
   const prune = (user: TestUser, at: number) =>
     runInDurableObject(vaultOf(user), (_vault, state) => state.storage.transactionSync(() => pruneChanges({ sql: state.storage.sql, storage: state.storage, now: new Date(at) })))
   ```
5. Replace the whole case `it('30-day retention drops superseded changes, keeps every head, and expires older cursors', ...)` (its two "Partly ported" comment lines and its `sqlExec(user, 'UPDATE sync_state SET pruned_through = 3 WHERE id = 1')` go) with:
   ```ts
     it('30-day retention drops superseded changes, keeps every head, and expires older cursors', async () => {
       const user = await member(client)
       const id = await createWallet(user, 'Cash')
       expect((await client.as(user).patch(`/v1/wallets/${id}`, { name: 'Cash 2' }, { ifMatch: 1 })).status).toBe(200)
       await createWallet(user, 'Bank')
       await createWallet(user, 'Savings')
       const now = Date.now()
       await sqlExec(user, 'UPDATE entity_changes SET committed_at = ? WHERE revision <= 3', new Date(now - 31 * DAY).toISOString())
       expect(await prune(user, now)).toBe(true)
       const rows = await sqlRows<{ revision: string }>(user, 'SELECT CAST(revision AS TEXT) AS revision FROM entity_changes ORDER BY revision')
       // Cash's create (revision 1) was superseded by its rename; every head stays.
       expect(rows.map((row) => row.revision)).toEqual(['2', '3', '4'])
       expect((await sqlRows<{ p: string }>(user, 'SELECT CAST(pruned_through AS TEXT) AS p FROM sync_state WHERE id = 1'))[0].p).toBe('3')
       expect(await problemOf(user, `?cursor=${encodeSyncCursor(user.sub, '2')}`)).toMatchObject({ status: 410, code: 'RESYNC_REQUIRED' })
       expect((await pageFrom(user, `?cursor=${encodeSyncCursor(user.sub, '3')}`)).groups.map((g) => g.revision)).toEqual(['4'])
       // Changes inside the 30 days stay, whatever the caller's clock says.
       await sqlExec(user, 'UPDATE entity_changes SET committed_at = ? WHERE revision = 4', new Date(now - 29 * DAY).toISOString())
       expect(await prune(user, now)).toBe(false)
       expect((await pageFrom(user, `?cursor=${encodeSyncCursor(user.sub, '3')}`)).groups.map((g) => g.revision)).toEqual(['4'])
     })
   ```
6. old `  it('a cursor from another lifecycle generation needs a resync', async () => {` → new `  it('a cursor from an earlier lifecycle generation needs a resync', async () => {` (the API's name; the body is unchanged).
7. Right after the line `describe('GET /v1/sync/changes, ported from sync-api.integration.spec.ts', () => {`, add:
   ```ts
     it('snapshots validate exactly the entities the API registers', () => {
       // Partly ported: 1B registers export, import_review and import_selection, and phase 4 slip_inbox. Until then,
       // every entity the vault registers is checked by exactly its sync validator.
       const registry = buildVaultRegistry()
       expect(registry.entityNames().sort()).toEqual(['budget', 'category', 'transaction', 'wallet'])
       for (const name of registry.entityNames()) expect(registry.entity(name)?.validate).toBe(SYNC_ENTITY_VALIDATORS[name])
     })

     it.todo('snapshots validate exactly the entities the API registers: every key of SYNC_ENTITY_VALIDATORS, once 1B and phase 4 register theirs')
     it.todo('requests, builds, and downloads a snapshot through short-lived grants, then continues with deltas (1B-T8)')
     it.todo('asking again while a snapshot is ready answers 200 with it (1B-T8)')

   ```

After B.3, `shasum -a 256` should print `0a2ea5c9...5d60` when the base was `79709dbb...2455`. On another base, the checksum will differ; check instead that `git diff` shows only these seven changes.
