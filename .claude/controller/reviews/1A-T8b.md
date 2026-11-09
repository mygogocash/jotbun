# Review: 1A-T8b "Sync changes and retention alarms: retention"

- Reviewer: Opus, read-only. Commit `4ada8f8` on `p1/1a-t8b-retention` (worktree `.claude/worktrees/p1a-t8b`), range `origin/claude/p1a-vault-core...4ada8f8`, base `8f04a3b`. The integration head is now `f33cdf0`, one PR later, touching only `scripts/ops/readiness-receipts.test.mjs`; 8b merges onto it cleanly.
- Spec: plan `docs/superpowers/plans/2026-10-25-jotbun-p1a-vault-core.md` `### Task 8` (line 714) and its halves note (R7), Global Constraints (Exactness, Retention, Time, Logging); spec §6.2 and §6.12; ledger rulings R5, R6, R7, R21, R57; API `gogospend_purge_entities`, `gogospend_retention_purge_account`, `gogospend_drop_receipt_digests` and the latest `gogospend_prune_account` (`apps/api/drizzle/0015_privacy.sql` lines 606, 716, 758, 879), `gogospend_retention_candidates` (`0010_sync.sql` line 172), `apps/api/src/privacy/retention.integration.spec.ts`; brief `.claude/controller/briefs/1A-T8b.md`; controller rulings P1, P2 and the failed-job ruling (8 November).
- Scratch: `.claude/controller/scratch/1a-t8b-review/` (`tree/` is `git archive 4ada8f8`; `combo-b4/` and `combo-t7/` are merge-tree results; `repo/` is a private `--shared` clone used only for the merges; `logs/`, `scripts/`, `mutants/`, `extra-mutants/`, `pins/`). Every workers run held the heavy lock. The worktree is untouched (clean, HEAD `4ada8f8`).

## Verdict

VERDICT: Approved. There are no blockers and no majors. The code does exactly what the controller ruled. Three minors and seven nits follow. Two of the minors are test gaps on correct code, each with a verified one-test fix. The third is a missing index outside this task's allowed files.

## Findings

### Minor 1. Two guards survive mutation: the inclusive prune cutoff (P2) and `max()` on the purge's retention line

My extra mutants against the two focused files (`scripts/extra_mutants.py`, `logs/extra-mutants.out`):

- **X1 survives.** It changes the prune cut to a strict `<` (`retention.ts:195`). P2 says "inclusive in all three jobs", but only the purge (M8) and the digest drop are pinned. My mutant X2 makes the digest drop strict, and the earliest-job case kills it at `t0 + 35 days`. A strict prune at its own due time cuts nothing and re-arms the alarm at the same instant. In production that is one extra wake. Under a fixed test clock, the prune never runs.
- **X3 survives.** It replaces `max(pruned_through, CAST(? AS INTEGER))` with the bare value (`retention.ts:163`). This guard matters on a path this task adds. When the purge fails, the prune still runs (the failed-job ruling) and moves the line past the record's deletion. The retried purge then has `old` below the line, and without `max()` it moves the line backwards. A cursor between the two lines would then be served a delta with pruned changes missing, and no 410.

Neither mutant is equivalent, and the receipt says every new guard was mutated. I verified two fixes in `test/workers/zz-review-fixes.test.ts` (`logs/pins.out`). Both pass on the real code; the first kills X1 and the second kills X3:

1. In `removes a superseded change that sat below the retention line`, set the second clock to `t0 + 61 * DAY` (the armed time) instead of `t0 + 62 * DAY`.
2. A failing-step variant: delete the lunch, rename the wallet, add the purge trigger and run the alarm at `t0 + 31d`. The prune moves the line past the deletion. Then drop the trigger, run the alarm again, and assert that `pruned_through` did not go down.

### Minor 2. Every committing call now does a full table scan of `transactions`, because the vault lacks the API's `transactions_deleted_idx`

`nextDue` (`retention.ts:76`) runs `min(deleted_at) ... WHERE deleted_at IS NOT NULL` after every committing call (`armAlarm`) and in every alarm. The API serves this query with `transactions_deleted_idx ON transactions (deleted_at) WHERE deleted_at IS NOT NULL` (`0015_privacy.sql:136`). The vault migrations have no such index (`0000_vault_core.sql:149-157`), and neither does 1B-T4 or 1A-T7. They also lack `entity_changes_entity_idx` (`0015:134`), so each `purgeEntities` group makes two full scans of `entity_changes` (`retention.ts:126-135`).

Probe (`test/workers/zz-review-perf.test.ts`, `logs/perf2.log`), on a vault with 60,000 transactions (6,000 deleted) and 30,011 changes:

| Measure | Cost per call |
| --- | --- |
| `nextDue`, without the index | 2.91 ms |
| of which the `min(deleted_at)` scan | 2.80 ms |
| `reschedule` block | 3.0 ms |
| the two `count(*)` in `hasSupersededChange` | 0.025 ms |
| `nextDue`, with the API's partial index | 0.02 ms |

At typical sizes the cost is small, but it lands on every write. This task's brief forbids a migration, so this is not a fix for 8b. The controller should schedule a migration in a later task (1B-T11 touches retention next) that adds the API's two indexes.

### Minor 3. After the merge, two other test files keep the race that R6 forbids

R6 moved the retention tests to `t0 = Date.now()` because "a past-due real alarm would fire on its own and race the test". 8b arms an alarm after every commit, so any test that backdates `deleted_at` past 30 days by SQL and then commits now arms a past-due alarm. That alarm fires in real time during or after the test and purges the backdated record.

- On the integration head: `transactions.test.ts`, `restore fails after 30 days ...`. The brief noted this case.
- After 1A-T7 merges, two more cases in `history.test.ts` (T7 head `6c3452f`): `just inside 30 days is listed and restorable; just outside is neither, before any purge` and `exactly 30 days after its deletion ...`. Their final restore commit arms the alarm at about now - 60 s and at `at - 1 ms`.

None of these cases reads the purged record afterwards. They passed 3 out of 3 repeated runs on `tree/` (transactions plus retention) and on `combo-t7/` (history plus retention plus transactions), and in the full suites. So this does not fail today, but it is non-deterministic. The money-journey follow-up below touches `history.test.ts`; it should either note this or clear the alarm at the end of those cases.

### Nit 1. A committing call during a failing job skips the one-minute floor

`call()` runs `armAlarm(committed)` with no failed list (`user-vault.ts:119`). Probe (`zz-review-probe.test.ts`, failing prune): right after the alarm floored at `now + 60 s`, a rename re-armed the alarm 24 hours in the past (`armedMinusNowMs: -86400000`). The alarm then fires at once, fails again and floors again. That is one extra failing run per committing call, so it does not spin.

### Nit 2. Running the purge before the prune lets a superseded change outlive 30 days

`RETENTION_JOBS` follows the API order. In one alarm, the purge moves the line to the purged record's last change. The prune then finds no group above the line that is 30 days old, so another entity's superseded change below the new line waits until the next group ages. The simulation saw it outlive its 30 days by up to 4.4 days. The API never removes such a row unless the entity changes again, so P3 makes the vault strictly better. Running the prune first would remove the lag; this is optional.

### Nit 3. `hasSupersededChange` depends on an invariant that nothing enforces

The count check (`retention.ts:58-60`) assumes each head has exactly one change row of its own. No trigger enforces this:

- The test-only `seedDeleted` writes heads without change rows. This is harmless in that case.
- `purgeEntities` deletes every earlier change of every id in the list (`retention.ts:135`), including an id whose head is already `purged`. That removes the tombstone's own row without writing a new one. This matches the API (`0015:627`) and cannot happen for transactions. A 1B caller that passes an already-purged id would leave the count one short, which can hide a real superseded change.

The receipt's note for 1B covers the invariant. It could add: "pass only ids whose head is not purged".

### Nit 4. Two of P6's claims are not pinned by any test

Mutant X5 adds an audit row to the purge group, and X6 makes the purge command id random. Both survive. Neither has a behavioural effect today. A one-line assertion that `audit_events` and `command_receipts` counts do not change across the alarm, in `purged_transactions_are_not_resurrected_by_receipts`, would pin "no receipt and no audit row".

### Nit 5. 1B-T11 handover: `rearm` must keep the floor

The 1B plan's `rearm(c)` (`p1b` plan line 988) takes no list of failed jobs. The receipt says 1B-T11 "replaces `armAlarm` with `rearm` and `alarmAt`", but it does not say that the one-minute floor after a failed job (`RETENTION_RETRY_MS`) must survive. The case `a failing step ...` (M7) will catch its loss, so this is a wording nit.

### Nit 6. Alarm cadence

Each receipt's digest is its own due time, and each deletion and each change group are too. A vault therefore wakes about once per committing call, 30 days later, and `setAlarm` runs after every committing call even when the time is unchanged. 1B-T11's `alarmAt` removes the redundant `setAlarm`. Coalescing due times (for example rounding up to the hour) would cut the wakes, if cost ever matters. The plan's "due time comes from the data" makes the current behaviour correct.

### Nit 7. The receipt's gate line for `git diff --check` states no result

The line reads: "the committed range is checked after the commit". I ran `git diff --check origin/claude/p1a-vault-core...4ada8f8` and it is clean.

R87 also took effect today: any fix round, and the money-journey follow-up, writes its receipt to `docs/implementation/receipts/1A-T8b*.md`, not `premium-progress.md`.

## The controller's rulings: done exactly

- **P1, prune due time.** `nextDue` uses the API's `gogospend_retention_candidates` rule, only while something is superseded: the oldest group above the line (`ordinal = 0 AND revision > pruned_through`) plus 30 days (`retention.ts:77-79`). M4 (the literal rule) is killed by the S1 case at `t0 + 61d`.
- **P2, inclusive 30 days.**
  - All three jobs compare with `<=`: purge `:174`, prune `:195`, digests `:214`.
  - `runDue` runs a job when `at <= now` (`:242`).
  - Restore accepts `deleted_at >= cutoff` (`domain/transactions.ts:310`), so the two overlap only at the exact millisecond, and whichever call runs first wins.
  - Purge and digests are pinned (M8, X2). The prune is not (minor 1).
- **Failed job.**
  - Each job runs in its own `try`/`catch` and `transactionSync` (`:218-250`) and is logged as `vault_retention_<job>_failed` with `failureName` only. Probes show `{"event":"vault_retention_prune_changes_failed","failure":"Error"}`, with no message.
  - The other jobs run. The case covers a failing purge, and my probes cover a failing prune (digests still drop) and a failing digest drop (purge and prune still run).
  - A failed job rolls back whole: the line and the revision are unchanged.
  - The alarm is set to `max(due, now + 60 s)` (`:263`), and `runDue` returns the failed jobs. M6 and M7 are killed.

## The receipt's deviations beyond the rulings

- **P3, prune every non-head change at or below the cut.** Safe, and a strict superset of the API. A differential against a literal SQLite port of the latest `gogospend_prune_account` ran at 234 alarm states over 3 seeds. The vault always kept a subset of the API's rows with the same `pruned_through`. Every extra deletion was at or below the old line (entities untouched since the last pass), which no delta reader can see, and their cursors already resync. Cost: one `NOT EXISTS` probe on `entity_heads`' primary key per row at or below the cut.
- **P5, commit detection by revision.** Correct. Every committed command goes through `appendChanges`, which needs at least one change and bumps the revision (`change-log.ts:20,28`). A replay, a refusal or a read moves nothing. A throw rolls back the block before `committed` is returned (`user-vault.ts:98-120`). E2 is equivalent, as claimed. 1B-T11's `touch` replaces this, and 1B-T4's `FileContext` already carries `touched`.
- **P6, purge command id `derivedUuid(accountId, 'retention-purge', revision)`, no receipt, no audit row, `RetentionContext`.**
  - Correct: a deterministic v8 UUID like the API's md5 id, in its own namespace. The purge group passes the route's validation (tombstone case, simulation).
  - `RetentionContext = Pick<VaultContext, 'sql' | 'storage' | 'now'>` is satisfied by 1B-T4's `FileContext` (`{ sql, storage, now, vaultId, touched? }`).
  - `group_bytes` uses the API's `changeGroupBytes`, the exact bytes sync serves, where the API used a larger jsonb estimate.
  - The API's snapshot drop is not needed here: 1B-T8 derives its watermark from `entity_changes_purged_idx`, and the purge's `purged` rows are head rows that the prune never deletes.
  - Unpinned: nit 4.
- **P7, `t0 = Date.now()`.** No test depends on the time of day, the date or a month boundary.
  - I ran three copies of `retention.test.ts` with `t0` fixed at Bangkok midnight on 31 January (`2027-01-31T16:59:59.999Z`), at UTC month end (`2027-02-28T23:59:59.999Z`), and at Bangkok midnight into the leap day (`2028-02-28T17:00:00.000Z`). All 39 cases passed (`logs/boundary.log`).
  - The only calendar inputs are `occurred_on: '2026-10-20'` and `tracking_start: '2026-10-01'`. They are checked only against "not in the future, in Bangkok" and "from 1970" (`contracts validation.ts:123-152`), which always holds for `t0 >= 2026-11-08`.
  - Every expected alarm value is `t0 + n days` computed from `toISOString` instants at millisecond precision, so the comparisons are exact.
  - Every alarm a test arms is in the real future. The erased-vault case sets `t0 + 1 day` itself.
- **P8, registry check in part.** Left out:
  - the equality of the registered names with `SYNC_ENTITY_VALIDATORS` minus `slip_inbox` (the API's assertion). The vault does not register `export`, `import_review` or `import_selection` yet.
  - Safe. `appendChanges` refuses an unregistered entity (`change-log.ts:72-89`), and the sync read validates against the registry. Nothing of those entities can be stored or served unvalidated.
  - The vault check is stricter in two ways: the exact four names (no extras) and identity with each `SYNC_ENTITY_VALIDATORS` function.
  - An `it.todo` tracks the rest.
- **The test that ages a record by SQL only.** `age()` (`retention.test.ts:82-86`) is the API's `age()` exactly (`retention.integration.spec.ts:55-60`): the entity's `committed_at` and the transaction's `deleted_at`. With the clock moved instead, the receipt's digest would drop at the same alarm and the replay would be 409, so this is the right port. `runDurableObjectAlarm` runs the alarm that is already armed (`t0 + 30d`) regardless of its time. That is fine, because the case is about what the purge leaves, not when it runs.

## Probes: what was checked, with evidence

- **A purged record never comes back.**
  - The tests cover the replay (201 with the original ack and `entity_state: 'purged'`, nothing written), a new create (410), restore (410), patch (410), GET (404), status (known, purged) and a second purge (no change).
  - My simulation (`zz-review-probe.test.ts`, 3 seeds, 70 random steps each over about 140 days, then a 200-day drain): a client syncing every few days replays every group into its own heads. It never got a 410, never saw a purged entity come back, and its heads equalled `entity_heads` after every step and every alarm. After the drain, every deleted record is `purged`, and restore and create of each answer 410.
- **The same rows as the API's SQL.**
  - Before each of the 234 alarms, I ran literal SQLite ports of the API's purge (`retention_purge_account`, transactions half, plus `purge_entities`) and prune, then the vault's, each in a rolled-back block, using the accepted inclusive cutoff. The purge was identical: transaction rows, heads, revision, line, and change rows apart from command id and group bytes. The prune is covered under P3 above.
  - The digest drop is the API's `UPDATE` with `digest_key_id` nulled together, satisfying the CHECK pair. The API's 10,000-row cap is dropped, which is fine for one vault.
- **The alarm.**
  - It always re-arms to the earliest row in `schedule` (`reschedule`, `:92-100`). Other jobs' rows are kept.
  - After every one of the 234 alarms, the next alarm was null or strictly later than that alarm's time. Nothing due remained: no deleted record 30 days old, no digest 30 days old. Nothing early was gone: every record deleted less than 30 days before was still there.
  - It is set in the past only when work is overdue, and that work then runs at once. One example is the catch-up when a change is superseded after a long quiet spell (seen once in the simulation, seed 99). Others are a purge backlog above 100,000 records and nit 1. It never loops.
- **Sleep and erase.** An alarm after eviction purges (the plan's case). After `erase()`, the awake instance refuses calls with 403 and arms nothing. After eviction, `ensureAccount` and `assertSession` refuse (403); `nextDue` is empty for any status but `active`, so `alarm()` clears `schedule` and deletes the alarm. The plan's case and my probe show both.
- **Transaction boundary.**
  - In `call()`, `armAlarm` runs after the `transactionSync` block returns (`user-vault.ts:98-120`). It opens its own short block for `reschedule` and calls `setAlarm` or `deleteAlarm` with `void` outside every block. There is no nested block (R21).
  - The only removed lines are the two the brief names (B.1 item 3): `return this.ctx.storage.transactionSync(() => {` and `return handler(c, call)`.
  - `alarm()` is three statements (guard, `runDue`, arm), leaving room for 1B-T11 between the last two.
- **Exactness and binding.** Revisions are read as `CAST(... AS TEXT)` and bound as `CAST(? AS INTEGER)`. `retention.ts` reads no amounts, and test amounts are strings. Every value is bound, and id lists bind as one JSON parameter (R57; M15 kills one `?` per id). Logs carry the class name only.

## Combined trees

- **With 1B-T4** (`d04a4f3`, merged onto `f33cdf0` + `4ada8f8`):
  - `user-vault.ts` and `v1-client.ts` auto-merge.
  - The only conflict is `premium-progress.md`, and it is 1B-T4's own receipt against the integration head (1D's heading): `merge-tree integ b4` conflicts with 8b absent. Keep both sides.
  - The merged `call()` carries 1B-T4's `vaultId` in the context literal and 8b's revision check and arming. `alarm()` sits after `erase()`, and 1B-T4's methods sit after `built()`.
  - `tsc --noEmit` passes. Focused `retention` + `files-objects` + `sync`: 3 files, 46 passed, 3 todo. Full workers: 15 files, 282 passed, 3 todo (`logs/combo-b4-*.log`).
- **With 1A-T7** (`6c3452f`): a clean merge (`ae5c4ee`), and `tsc` passes. With the money journey turned on (see below): `history` + `retention` + `transactions` gave 80 passed in each of 3 runs, and the full workers suite 16 files, 305 passed, 3 todo.

## Tests, mutants, gate, receipt, commit

- **Cases.** 13 retention cases: the plan's 5 by name, 3 in changed form, the plan's 3 alarm cases with their assertions, and 2 new. Each rule has a case, except the gaps in minor 1 and nit 4. The sync file's 30-day case is the API's case in full (`sync-query.integration.spec.ts:180-200`, on wallets), and the lifecycle rename and the registry part are correct.
- **Counts.** 26 passed and 3 todo in the two focused files.
- **The 16 mutants and 3 equivalents.** I re-ran them on the scratch copy with the planner's runner. Every one gave its expected set, the files were restored byte for byte, and `logs/mutants.out` is identical to the implementer's. The equivalence arguments hold:
  - E1: only the `deleted` marker is left, so `nextDue` is empty.
  - E2: only a commit changes due data.
  - E3: after a commit a digest is always due, and the fired alarm is already gone.
- **RED.** The implementer's `red.log` shows 12 failed, 14 passed and 3 todo: 10 `expected false to be true` and 2 `expected null`, as claimed.
- **Gate on the scratch copy.**
  - `tsc` exit 0.
  - `test:edge`: 12 files, 156 passed.
  - Workers: 310 passed with my 48 probe and boundary cases, so 262 plus 3 todo, as the receipt says.
  - `build:edge` passes. The `jotbun_vault` bundle has `vault_retention_` and no `pg`, `node-postgres`, `DatabaseService` or `OwnerTx`.
  - `diff --check` is clean.
  - `test:edge:db` is SKIPPED: Docker is stopped.
- **Files.** All five code and test files match the planner's SHA256SUMS.
- **Receipt.** Accurate, including the plan-wording note: the 1B plan line 1130 says "1A-T7 (turned on in 1A-T8a)", while the 1A plan's halves note (line 716) gives the flip to 8b. Deviations 1, 2 and 4 are marked as accepted by the controller (8 November), which matches the rulings.
- **Commit.** Summary line "Run retention on the UserVault's alarm" (imperative, no prefix), a short body, a blank line and `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`, as the protocol asks.

## Follow-up 1A-T8b needs once 1A-T7 merges (the money journey)

1. In `apps/edge/test/workers/history.test.ts`, `describe('the money journey')` (line 441 on T7's `6c3452f`), change `it.todo('seeds built-ins, records spending, and reads it back through history, summary, budgets, status and sync', async () => {` to `it(`. Reword the comment above it (lines 439-440, "1A-T8b turns it on ...") into the past tense. No code is needed: on integration + 8b + T7 the journey passes, 3 of 3 runs plus the full suite.
2. Prove it with a mutant: drop `'budgets.put'` from `VAULT_HANDLERS`, or make `syncChanges` return no groups. Restore afterwards.
3. Gate deltas on the merged head: workers +1 passed and -1 todo. Typecheck, build and `diff --check` as usual.
4. Under R87, the receipt goes to `docs/implementation/receipts/1A-T8b-followup.md`, not under 8b's section in `premium-progress.md`. The brief predates R87.
5. While in that file, handle minor 3 for T7's two restore-window cases: note the race, or clear the alarm at the end of each case.
6. For the orchestrator: fix the 1B plan line 1130 wording ("turned on in 1A-T8b").
