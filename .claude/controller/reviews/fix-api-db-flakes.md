# Review fix-api-db-flakes: two API database test races

Reviewer: Opus, read-only. Reviewed: commit `4f6a7c6` on `fix/api-db-flakes` (worktree `.claude/worktrees/fix-api-db-flakes`), PR #349. Range: `origin/claude/p1a-vault-core...HEAD`. After `git fetch`, the integration head is `020c391`, and it is `4f6a7c6`'s only parent, so the branch needs no merge on top. Between the brief's planned base `d50680c` and `020c391`, nothing under `apps/api` changed.

Sources:
- the brief `.claude/controller/briefs/fix-api-db-flakes.md`;
- the planner's models in `scratch/fix-api-db-flakes/sim/` and the files in `files/`;
- the implementer's logs in `scratch/fix-api-db-flakes-impl/`;
- the PR body `.claude/controller/pr-api-db-flakes.md`;
- the protocol, including R87. R91 is cited in the receipt and the PR. Its text is not in `handover.md` (the ruling list there ends at R90), so I took its scope from the orchestrator: R-A and R-C only, with R-B waiting on the owner.

Scratch: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-api-db-flakes-review/`
- `probes/review-commit-order.sim.spec.ts`: R-A. The real `DatabaseService.withOwnerTransaction` over a fake connection. Inside COMMIT it makes the commit visible and frees the lock, and it replies after a random delay. Round trips are random. 120 schedules with the lock, 60 without, and one deterministic case for the blind spot (nit 3).
- `probes/review-export-cap.sim.spec.ts`: R-C. The real `ExportsController.file()` running the spec's new test body line for line, over 400 random schedules of lookup and open delays. One delay of 50 to 150 ms rotates over the first five lookups and opens; the rest are 0 to 8 ms. It also runs two cap mutants.
- `probes-run.log`: the planner's two models plus my two probes, on a `git archive 4f6a7c6` copy with `node_modules` symlinked.
- `ci-logs/`: the three cited CI jobs and PR #349's SQL job, with escape codes stripped.

## What I ran

| Check | Result |
| --- | --- |
| `git diff --name-only origin/claude/p1a-vault-core...HEAD` | 3 files: the two `*.integration.spec.ts` and `docs/implementation/receipts/fix-api-db-flakes.md`. No production file changed. |
| R-B absent | no `apps/api/drizzle/0020_*` (last is `0019_ai_companion.sql`); `_journal.json` SHA-256 `10486fec…` = the brief's "before" |
| Spec checksums | `command-executor.integration.spec.ts` `370f0498…` and `export.integration.spec.ts` `c97bf6a1…` = the brief's "after"; base versions `6be4454f…`, `33fbd0c6…` = "before" |
| `git diff --check origin/claude/p1a-vault-core...HEAD` | clean (exit 0) |
| Added lines non-ASCII | none |
| `tsc --noEmit` in `apps/api` (copy of `4f6a7c6` plus my probes) | exit 0, no output |
| Planner's models plus my probes (`probes-run.log`) | `Test Suites: 4 passed`, `Tests: 14 passed` (8 planner, 6 reviewer) |
| Implementer's logs | match the receipt: red 8 passed; green 8 passed in each of 5 runs; `test:api` 45 suites, 981 tests; build 295 files; release graph `problems: []`; typecheck clean |
| PR #349 CI, SQL job 128714637097 (merge ref `91b39da` = `4f6a7c6` into `020c391`) | **pass**. `PASS src/exports/export.integration.spec.ts (11.608 s)`, `PASS src/commands/command-executor.integration.spec.ts`, `41 passed` suites, `694 passed` tests. This was the first real run of both specs. The "Typecheck, unit, render, build, export" job was still pending when I reviewed. |
| Cited job IDs | 128703314342 = run 42471566135 attempt 1; 128705722586 = the same run, attempt 2 (the rerun); 128694248812 = run 42468718123. All three are "SQL integration and ops" and all failed. |

The database suite was not run locally: Docker is stopped.

## R-A: "commit order is revision order"

**The diagnosis is right.** In job 128703314342 (log lines 2095 to 2120), line 242 `expect(blocked).toEqual([])` passed and line 243 failed with `["second-mutating", "first", "second"]`. Here is what the code shows:
- `withOwnerTransaction` sends `SELECT gogospend_assert_owner_tx(...); COMMIT; SELECT current_setting(...)` as one simple-protocol batch. node-pg settles that batch only on ReadyForQuery, after the trailing SELECT.
- PostgreSQL frees the transaction's locks inside COMMIT, and the backend sends its buffered output only at ReadyForQuery.
- The second wakes inside the first's COMMIT. Before its `during` it needs about five more round trips on its own connection: `lockAccount`'s second statement, the session check, the policy reads and `receipts.find`.
- Nothing orders the first's reply against those round trips. `blocked = []` shows that the lock held during the hold.

**Does `seen == ['1']` prove what the old test meant?** Yes, and more directly.
- `ChangeWriter.append` (`change-writer.ts:39`) bumps `account_sync_state.revision` inside the first's transaction.
- The second's `SELECT … FOR UPDATE` (`owner-transaction.ts`, `lockAccount`) waits on the first's transaction. Under READ COMMITTED, every later statement takes a new snapshot, and that snapshot includes the first's commit. `lockAccount`'s own comment relies on the same rule.
- The read in `during` is such a later statement, through the same `OwnerTx`. The app role has `SELECT` and the owner policy on `account_sync_state` (`0001_identity.sql:113`, `:121`). So it reads `'1'` exactly when the first had committed before the second's mutation ran.
- The old `'first'` marker was a client-side stand-in for "the first committed", and its timing was not controlled. The new read checks the database state itself.
- The remaining checks are unchanged: `blocked` (now `seen` captured at 150 ms) `[]`, revisions `['1','2']` and the `entity_changes` order. Together they still prove that the second waited, then wrote on top of the first's commit, in revision order.

**Can it still fail with a correct lock?**
- Statically, no. `seen` can only be filled after the first commits, and that happens after `releaseFirst()`, which runs after `blocked` is captured. `entered` resolves only after the first's `lockAccount`, so the first holds the lock before the second starts. The starting revision is `0`, as the unchanged `['1','2']` already assumed.
- Probe: 120 random schedules with the lock, including a first reply up to 60 ms late. The new assertions held every time, and the old order assertion failed in some of them.
- CI's SQL run on PR #349 passed this spec once against PostgreSQL 17.

**Can it pass with the lock broken?**
- If the second mutates during the hold, it reads `'0'`. Then `blocked` is `['0']` and `seen` is `['0']`, so the test fails. That was true in every no-lock probe schedule where the second mutated during the hold.
- `FOR SHARE` behaves the same as no lock here. REPEATABLE READ would make the second's `FOR UPDATE` raise a serialization error, which also fails the test.
- The one way through is nit 3: the second is stalled until after the hold and the first's commit. The old test passes in that schedule too.

## R-C: "at most four export downloads run at once in a process"

**The diagnosis is right.** Job 128694248812:
- The test timed out at 30 s (log lines 1918 to 1945), then `afterAll` hit its own 30 s timeout.
- The only `/v1/export-files/:grant` line after this test's grant (`/v1/exports/:id/grant` 200, captured 09:50:43.443, line 1479) is `503`, `latency_ms: 410`, captured 09:50:43.949 (line 1480). So that request reached the server at or before 43.539.
- The fifth was sent at least 300 ms after the grant response. The batch before the grant line was captured at 43.316, so the fifth went out at about 43.6 or later. Capture times are only approximate, because lines arrive in batches.
- The proof that does not depend on timestamps is the hang itself. If the fifth had been the one refused, `await fetchFile(extra)` would have returned, `release()` would have run, and four download `200` lines would follow. There are none.
- So the refused request was a held download that was slow to reach its slot check. The fifth took the last slot, and the old patch gated every `getStream` call, the fifth's included. `await fetchFile(extra)` therefore waited on a gate that only opens after it returns. `finally` never ran, the gated responses kept the server open, and `v1.close()` hung.

**How "four held" is detected, against the controller:**
- `exports.controller.ts:81` runs the slot check, then `:82` `downloading += 1`, then `:91` `this.store.getStream(...)`, with no `await` in between.
- The patched `getStream` increments `opened` and calls `fourHeld()` synchronously, before its first `await`. So `opened` equals slots taken, unless another `getStream` caller runs in this process during the test.
- The only callers are `exports.controller.ts:91` and `attachments.controller.ts:120`. This test downloads no attachments, and Jest runs a file's tests one at a time. So `allHeld` means `downloading == 4`.

**Is the deadlock gone in every schedule?**
- The fifth is sent only after `opened` reaches 4, so its `getStream`, if the cap ever let it in, is call 5 or later. It is never gated and comes back at once. No path awaits a gated response before `release()`.
- If a held download ends before four are open (refused, 401 or 404), its `.then` throws, the race rejects, and `finally` opens the gate. If a held download rejects, the race rejects with that error.
- The derived promises that reject after the race has settled (on the success path, once `release()` lets the four end) have handlers attached by `Promise.race`, so no unhandled rejection is raised. The probes ran this pattern about 500 times under Node's default `--unhandled-rejections=throw`.
- Probe: 400 random schedules, with one slow lookup or open (50 to 150 ms) rotating over the first five. Every one gave the same outcome: `{ extra: 503, all: [200,200,200,200], after: 200, left: 0 }`. None hung.

**Does it still prove the cap?**
- A cap of 3 (one slot leaked) fails at once with `a held download ended early: 503` (50 of 50).
- A cap of 5 (a slot freed early) makes the fifth come back `200` at once (50 of 50).
- No cap at all is the same as the cap-of-5 case. A controller that never calls `getStream` lets the held downloads finish ungated, and the race fails with `ended early: 200`. The test cannot pass vacuously.
- The fifth's `503 SERVICE_UNAVAILABLE`, the four `200`s and the follow-up `200` are asserted as before.

**`afterAll`:** every path that settles goes through `finally` (`release()`, store restored), so the gated responses finish and `v1.close()` can complete. The one remaining case is an outside stall (nit 4).

## Receipt, commit, PR

- **Receipt** (`docs/implementation/receipts/fix-api-db-flakes.md`):
  - It is its own file under R87 in the house style, cites R91, and leaves `premium-progress.md` alone.
  - Its controller line numbers (82, 91) are right. Its `test:api` and build numbers match the logs.
  - It says plainly that the RED/GREEN models do not run the spec files, and that "no test was observed failing on the old code".
  - It sets R-B apart as "Proposed, waiting on the owner … Not applied", with a correct account of 0017: one advisory lock, then two separate `IF EXISTS` reads with the source lookup between them, and `gogospend_retain_attachment` not taking the lock. The 44 and 63 ms retains are in job 128705722586 at lines 556 and 557. It points to the proposed files in `scratch/fix-api-db-flakes/files/`, which exist.
  - One wording slip: nit 1.
- **Commit:** a plain imperative summary, no type prefix, a body that matches the change, and `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>` as protocol step 8 requires. It says R-B is not in the commit.
- **PR #349 body:** accurate. It says "test files only" and puts R-B as "not in this PR".

## Findings

### Blocker

None.

### Major

None.

### Minor

None.

### Nit

1. **The receipt calls the 503 a "grant line".** Receipt line 15, cause 2: "CI logged one grant line for this test: a `503` with `latency_ms` 410". That line is the download route, `/v1/export-files/:grant` (job 128694248812, log line 1480). The grant itself (`/v1/exports/:id/grant`, line 1479) was a `200`, and the timing argument depends on it. Suggest "one download (`/v1/export-files/:grant`) line".
2. **The R-A comment is ambiguous.** `command-executor.integration.spec.ts:246`: "(CI job 128703314342 saw the second mutate first)". In CI the second mutated before the first's *reply* arrived, not before the first committed. The test itself now proves the second came after the commit. Suggest "saw the second mutate before the first's reply arrived".
3. **The hold check depends on timing, as it did before this change.** Not introduced here, and outside R91's scope.
   - `blocked` only shows that the second did not mutate within 150 ms. If the second only reaches its mutation after the hold and after the first's commit, a broken lock passes both the old and the new test.
   - Evidence: the deterministic probe "shared blind spot" (no lock, second connects after 400 ms) gives `{ newOk: true, oldOk: true }`. In my first probe run, under CPU load from parallel suites, 1 of 60 random no-lock schedules also slipped through this way.
   - A future change could make the waiting a positive check: during the hold, see that the second's backend is waiting on a lock (`pg_stat_activity.wait_event_type = 'Lock'`, or an ungranted `pg_locks` row).
4. **R-C's race has no deadline of its own.**
   - If a held download stalls before its slot check for longer than the 30 s test timeout, Jest abandons the test without running `finally`. That would be an outside stall, such as a stuck database or JWKS, not a schedule the test creates. The gate would then stay shut, and `afterAll` would hang as it did in CI.
   - A timer in the race that rejects (so `finally` releases the gate) would close this. Optional.
5. **Bookkeeping for the record.**
   - The commit summary ("Stop two API database tests from assuming an order they don't control") is not the brief's no-R-B line ("Fix two flaky database tests: commit order and export downloads"). The receipt's Deviations mention only the heading.
   - R91 is not written down in `handover.md`, so I could not check whether it set this wording.
   - The commit message meets protocol step 8 either way. The controller should add R91 to `handover.md`'s ruling list.

VERDICT: Approved
