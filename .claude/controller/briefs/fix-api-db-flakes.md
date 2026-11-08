# Brief: fix three flaky API database tests (implementer: Haiku)

Read `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md` first; it is binding, including R87 (the receipt goes in its own file). This is maintenance with no plan task: this brief is the spec. Where the protocol says "the plan", read "this brief".

| Name | Path |
| --- | --- |
| Worktree (`$WT`) | `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-api-db-flakes`, branch `fix/api-db-flakes`, cut from `origin/claude/p1a-vault-core` (planned at `d50680c`) |
| Your scratch folder (`$S`) | `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-api-db-flakes-impl/` |
| The planner's folder (`$P`, read only) | `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-api-db-flakes/` |
| The planner's verified files (`$F`, read only) | `$P/files/` (the changed files at their repo paths, and `SHA256SUMS`) |

- Work only in `$WT`. Never touch the main checkout or `.claude/worktrees/p1a-vault-core`.
- **Docker stays stopped.** Do not start Docker, Colima or any PostgreSQL, and do not run `npm run test:db`, `test:ops` or `test:edge:db`. CI's "SQL integration and ops" job runs the database suite.
- Nothing you need to keep goes under `/private/tmp`.
- Shell variables do not survive between Bash calls: write full paths in every command, or set the variables again at the start of each call.

**Size:** S. Two test files, one new migration and its journal entry, plus the receipt.

**`apps/api` is frozen: every change below needs the controller's ruling.** The orchestrator's message to you says which of R-A, R-B and R-C were ruled in.
- Apply only those.
- If the message names no ruling, stop: `STATUS: BLOCKED`, "no ruling for R-A, R-B, R-C".
- R-B is two files that go together (the migration and its journal entry): both or neither.

| Ruling | Flake | Change | Kind |
| --- | --- | --- | --- |
| R-A | command-executor "commit order is revision order" | `apps/api/src/commands/command-executor.integration.spec.ts` | test only |
| R-B | attachments "two records retaining one image at once keep one receipt, made by one copy" | new `apps/api/drizzle/0020_receipt_copy_once.sql`, one entry in `apps/api/drizzle/meta/_journal.json` | **production** (a migration) |
| R-C | export "at most four export downloads run at once in a process" | `apps/api/src/exports/export.integration.spec.ts` | test only |

## Diagnosis (read once)

### R-A: the test assumes an order nobody controls (not a production bug)

CI job 128703314342: `order` was `['second-mutating', 'first', 'second']`, expected `['first', 'second-mutating', 'second']` (line 243). `blocked` was `[]`.

- `'first'` is pushed by a `.then` on the first command's promise. That promise settles only when Node reads the first connection's reply to `SELECT gogospend_assert_owner_tx(...); COMMIT; SELECT current_setting(...)` (`DatabaseService.withOwnerTransaction`).
- PostgreSQL releases the account row lock inside that COMMIT, before the trailing SELECT runs and before the reply leaves. The second backend wakes at that moment, on its own connection.
- The second then needs about five round trips (account, session, two policy reads, receipt) before its `during` runs. On a loaded runner the first backend can be descheduled after waking the waiter, and its reply reaches Node later than those five round trips. Nothing in the code orders the two connections' replies.
- What the code does guarantee still held: the second waited while the first held the lock (`blocked` was `[]`), and it could only take the lock after the first committed.
- **Fix (test only):** drop the client-side `'first'` marker. Inside the second's `during`, read `account_sync_state.revision` through its own transaction. A fresh statement under the lock (READ COMMITTED) sees the first's commit, so it must read `'1'`. Keep `blocked` (now the revisions read while the first held the lock: `[]`), the committed revisions `['1', '2']` and the `entity_changes` order.

### R-B: a real race in production SQL (minor: a wasted copy)

The rerun of run 42471566135 (job 128705722586): `writes.count()` was 2, expected 1 (line 736). Both retains answered 200.

- Two copies mean two `reserved` outcomes from `gogospend_reserve_receipt_copy` (0017). The memory store's `copy` never calls `putStream`, so nothing was counted twice.
- The log shows both retains finishing at 44 and 63 ms. Neither request waited a 75 ms `WAIT_POLL_MS` poll, so neither ever got `pending`: the second request's first reservation already came back `reserved`.
- The function reads "the receipt exists" (the `attachments` row) and "a copy is in flight" (a `reserved` row) in **two statements**, with the source lookup between them. A VOLATILE PL/pgSQL function takes a fresh snapshot for each statement (PostgreSQL docs, "Function Volatility Categories": "VOLATILE functions obtain a fresh snapshot at the start of each query they execute").
- The command that turns a reservation into the receipt (`gogospend_retain_attachment`, inside the M1 command) publishes the reservation and inserts the `attachments` row in one transaction. It does not take the receipt-copy advisory lock, so it can commit while another request's reserve is running.
- The interleaving: request B's first read sees no receipt; request A's command commits; B's second read sees no reservation still `reserved`; B reserves and copies a second time. B's command then finds A's receipt, marks B's copy due, and answers 200.
- **Impact:** one extra server-side copy, due at once and swept. No wrong data, and one receipt is kept. But "one image is copied once however many requests ask for it at once" (the service's own contract) does not hold, while the API still serves users.
- **Fix (production, minimal):** a new migration replaces only this function, with both reads in **one statement** (one snapshot). A's commit is then seen whole (`existing`) or not at all (`pending`), never half. Outcome precedence and everything else are unchanged. `CREATE OR REPLACE` keeps the owner and grants, and 0017 cannot be edited (`verifyAppliedMigrations` refuses an edited applied file). The test is right and stays as it is.

### R-C: the test deadlocks itself when one download is slow (not a production bug, not plain slowness)

Job 128694248812: the test hit the 30 s timeout, then `afterAll` hit its own 30 s timeout.

- The test starts four gated downloads, sleeps a fixed 300 ms, then awaits a fifth, which it expects to be refused. It opens the gate only after the fifth returns.
- A download takes its slot only after the guards and the export lookup (`ExportsController.file`, the slot counter, then `getStream`).
- The log has exactly one `/v1/export-files/:grant` line for this test: `503`, `latency_ms: 410`, logged at 43.949 s. The grant had finished at 43.443 s, so that request started at about 43.539 s, before the fifth could have been sent (43.743 s or later). So the refused one was a held download that took 410 ms to reach the slot check. The fifth had taken its slot and was itself held by the gate.
- `await fetchFile(extra)` then waited for a body that waits for `release()`, which runs only after it: a deadlock. The `finally` never ran, the gated responses kept their connections open, and `v1.close()` in `afterAll` hung too.
- A longer timeout would change nothing. The slot cap in production is right.
- **Fix (test only):**
  - Wait until four files are open (`getStream` runs only after a slot is taken) instead of 300 ms.
  - Gate only those four, so a fifth that the limit wrongly lets in comes back at once and fails the test instead of hanging it.
  - If a held download ends first (refused, say), fail at once.

## Files

All four "after" checksums are in `$F/SHA256SUMS`, which also covers the planner's patch, simulations and mutants. `$P/fix-api-db-flakes.patch` holds all four changes; it applies to `d50680c` with `git apply`.

| File | Ruling | sha256 before (`d50680c`) | sha256 after |
| --- | --- | --- | --- |
| `apps/api/src/commands/command-executor.integration.spec.ts` | R-A | `6be4454f275e3f10be45da0946541c69af20e0a2bb12fe51107d1378352f330d` | `370f04982dd78870726840779a20f6541799cbab41a5a50ebb7caa0b6d5f435f` |
| `apps/api/drizzle/0020_receipt_copy_once.sql` (new) | R-B | absent | `21651f8e7556bc93137e03d9ee0f0e1aea4afd8622939f0c1fb97192e79484cc` |
| `apps/api/drizzle/meta/_journal.json` | R-B | `10486fecd9aa23a373c19356482bf9d8f8138f41d09e864e6b5399443a85d155` | `79fffcf1b86bbabe435bd23b15dc78bff18e14f52cd73de24fd8e570a041e693` |
| `apps/api/src/exports/export.integration.spec.ts` | R-C | `33fbd0c6953ee026444eda8cb7f96ebc28f179dc7e588bc2b746078038db0024` | `c97bf6a18c6d2db0806e1aee9c12fa97b9e41185307ea2f5353324c5d5f1cceb` |
| `docs/implementation/receipts/fix-api-db-flakes.md` (new) | | absent | yours (Step 7) |

Copy the files from `$F`; do not retype them. What each one changes:

- **R-A,** one hunk in `commit order is revision order`:
  - `order` and the two `.then` markers become `seen`.
  - The second's `during` takes `tx` and pushes `SELECT revision::text FROM account_sync_state WHERE account_id = $1` (its own transaction).
  - `blocked = [...seen]`.
  - The `expect(order)…` line becomes `expect(seen).toEqual(['1'])`, under a four-line comment.
  - The revision and `entity_changes` checks are unchanged.
- **R-B:**
  - `0020_receipt_copy_once.sql` is 0017's `gogospend_reserve_receipt_copy`, byte for byte, except:
    - `CREATE OR REPLACE`;
    - two new variables, `v_existing` and `v_pending`;
    - one `SELECT EXISTS (…attachments…), EXISTS (…reserved…) INTO v_existing, v_pending` in place of the first `IF EXISTS`;
    - `IF v_existing` and `IF v_pending` in place of the two `IF EXISTS` tests;
    - a header comment.
  - `_journal.json` gains `{ "idx": 19, "version": "7", "when": 1792195220000, "tag": "0020_receipt_copy_once", "breakpoints": true }` after 0019.
- **R-C,** one hunk:
  - `opened`, `fourHeld` and `allHeld` are added, and the `getStream` patch gates only the first four opened.
  - `await Promise.race([allHeld, …held that end early throw…])` replaces the 300 ms sleep.
  - The rest is unchanged.

Scratch-only helpers in `$P` (never copy them into `$WT`):
- `$P/sim/commit-order.sim.spec.ts` (R-A model): the real `DatabaseService.withOwnerTransaction` over a fake connection that releases the lock inside COMMIT and replies after.
- `$P/sim/export-cap.sim.spec.ts` (R-C model): the real `ExportsController.file()` with a fake service and store.
- `$P/sim/reserve-snapshot.sim.spec.ts` (R-B model): reads the reserve function from the migration text and, for every point A's commit could land, works out what B gets.
- `$P/mutants/0020-two-statements.sql`: 0017's two-statement reads under 0020's name. `$P/mutants/_journal.without-0020.json`: the journal before R-B.

## Steps

### Step 0: Sync and install

1. `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-api-db-flakes`
2. `/usr/bin/git fetch origin claude/p1a-vault-core`, then `/usr/bin/git merge --no-edit origin/claude/p1a-vault-core` (conflicts: protocol step 1).
3. If `node_modules` is missing at the worktree root: `npm ci --ignore-scripts --no-audit --no-fund`. Edge is not needed.
4. `mkdir -p /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-api-db-flakes-impl`
5. `cd /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-api-db-flakes/files && shasum -a 256 -c SHA256SUMS`: every line `OK`.

### Step 1: Check the files are as planned

From `$WT`:
- `shasum -a 256` the three existing files: each must equal the "before" column.
- `ls apps/api/drizzle/`: the last file must be `0019_ai_companion.sql`, with no `0020_*`.

If a check fails:
- **The head moved:** run `/usr/bin/git apply --check /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-api-db-flakes/fix-api-db-flakes.patch`. If it applies, use `git apply` in Step 3 (for the ruled-in files only, with `--include=<path>`), and say so in the receipt.
- **Someone else added `0020_*`:** stop. `STATUS: BLOCKED`, with the file name. R-B must then be renumbered.
- **Anything else:** stop. `STATUS: BLOCKED`, with the file and its checksum.

### Step 2: RED (scratch copy of the code before the change)

1. `mkdir -p $S/red && /usr/bin/git -C $WT archive HEAD | tar -x -C $S/red`
2. For each of `.`, `apps/api`, `apps/app` that has `node_modules` in `$WT`: `ln -s $WT/<dir>/node_modules $S/red/<dir>/node_modules`.
3. `mkdir -p $S/red/apps/api/src/__sim__ && cp $P/sim/*.sim.spec.ts $S/red/apps/api/src/__sim__/`
4. **R-B RED,** the old function under the new name:
   - `cp $P/mutants/0020-two-statements.sql $S/red/apps/api/drizzle/0020_receipt_copy_once.sql`
   - From `$S/red/apps/api`: `NODE_OPTIONS=--experimental-vm-modules npx jest --no-watchman src/__sim__/reserve-snapshot.sim.spec.ts`
   - Expect `Tests: 1 failed, 1 passed, 2 total`. The failure is "0020: the two reads are one statement…". The 0017 case passes: a commit between the reads gives `reserved`, which is CI's second copy.
5. **R-A and R-C, CI's failures reproduced:** from `$S/red/apps/api`, `NODE_OPTIONS=--experimental-vm-modules npx jest --no-watchman src/__sim__/commit-order.sim.spec.ts src/__sim__/export-cap.sim.spec.ts`. Expect `Tests: 8 passed, 8 total`. These cases pass because they assert the failure itself:
   - commit-order "the first's reply late": the old markers give CI's order, `['second-mutating', 'first', 'second']`;
   - export-cap "before the fix, one held lookup takes 410 ms": the fifth never returns while the gate is shut (`HANG`), and the slow held download is the one refused (`503`), as CI logged.

### Step 3: GREEN (the change in the worktree)

For each ruled-in item, from `$WT`:
- R-A: `cp $F/apps/api/src/commands/command-executor.integration.spec.ts apps/api/src/commands/`
- R-B: `cp $F/apps/api/drizzle/0020_receipt_copy_once.sql apps/api/drizzle/` and `cp $F/apps/api/drizzle/meta/_journal.json apps/api/drizzle/meta/`
- R-C: `cp $F/apps/api/src/exports/export.integration.spec.ts apps/api/src/exports/`

Then:
- `shasum -a 256` each copied file: it must equal the "after" column.
- `/usr/bin/git status --short`: only the ruled-in paths.

### Step 4: GREEN proofs (scratch copy with the change)

1. Make `$S/green` exactly as Step 2.1 to 2.3 made `$S/red`, from `$WT` with your change in place. Use `git archive HEAD` after Step 8, or `cp` the changed files over a fresh archive now.
2. From `$S/green/apps/api`: `NODE_OPTIONS=--experimental-vm-modules npx jest --no-watchman src/__sim__`, five times. Expect `Test Suites: 3 passed, 3 total`, `Tests: 10 passed, 10 total` each time. If R-B was not ruled in, the reserve model's 0020 case fails on the missing file: expect `1 failed, 9 passed`, and say so.
3. What the 10 show:
   - **R-A:** the new assertions (`blocked` `[]`, `seen` `['1']`, revisions `['1','2']`) hold whether the first's reply comes in time or late.
   - **R-C:** with the new waiting, the same 410 ms lookup gives `503` for the fifth and four `200`s.
   - **R-B:** with 0020, B gets only `existing` or `pending`, wherever A's commit lands.
4. The changed integration specs themselves need PostgreSQL. Here they are only typechecked (Step 6). CI runs them.

### Step 5: Mutation check (in `$S/green` only)

| Mutant | How | Expect |
| --- | --- | --- |
| R-B back to two reads | `cp $P/mutants/0020-two-statements.sql $S/green/apps/api/drizzle/0020_receipt_copy_once.sql`, run the reserve model | `1 failed, 1 passed`, the 0020 case: killed |
| R-B journal entry missing | `cp $P/mutants/_journal.without-0020.json $S/green/apps/api/drizzle/meta/_journal.json`, run `src/database/migrations.spec.ts` | `1 failed, 8 passed`, "Migration files and journal entries do not match": killed |
| R-A: no account lock | built into the model ("mutant, no lock") | the second mutates during the hold and reads `'0'`: the new assertions catch it |
| R-C: cap lets a fifth in | built into the model ("a cap that lets a fifth in") | the fifth comes back `200` at once, so the test fails fast instead of hanging |
| R-C: a held download refused | built into the model | it rejects with "a held download ended early: 503" instead of hanging |

- Restore each mutated file from `$F` and run the three sims once more: `10 passed`.
- `diff -r -q $S/green/apps/api/drizzle $WT/apps/api/drizzle` prints nothing.
- No survivor is expected. If one survives, stop and report it.
- The R-A and R-C integration tests cannot be mutated here (they need PostgreSQL). Record that in the receipt.

### Step 6: Gate (from `$WT`)

1. `npm run typecheck`: passes. It typechecks both changed integration specs, because `apps/api/tsconfig.json` includes all of `src`.
2. `npm run test:api`: the planner measured `45` suites and `981` tests on `d50680c` plus the change.
   - In `$WT` all must pass.
   - In a scratch copy with linked `node_modules`, `parse-server.spec.ts` and `parser-runner.spec.ts` fail (22 tests) before and after: that is the copy's layout, not this change.
   - `migrations.spec.ts` checks the journal against the SQL files.
3. `npm run build -w gogospend-api`: passes.
4. `node apps/api/scripts/release-graph.mjs check`: passes.
5. `/usr/bin/git diff --check` before the commit; `/usr/bin/git diff --check origin/claude/p1a-vault-core...HEAD` after it: clean.
6. SKIPPED, with the reason in the receipt:
   - `npm run test:db`, `test:ops`, `test:edge:db`: Docker is stopped and must stay stopped (owner instruction); CI's SQL job runs them.
   - Not run because nothing they load changed: app, render, unit, export and edge suites.

### Step 7: Receipt (R87)

Write `docs/implementation/receipts/fix-api-db-flakes.md`. Do not edit `premium-progress.md`. Fill in each `<…>` from your runs, and drop the bullets of any item that was not ruled in.

```markdown
# fix-api-db-flakes: three flaky API database tests

- **Status:** built and verified locally on `fix/api-db-flakes` (`.claude/worktrees/fix-api-db-flakes`), from `<head>`. Not pushed. Maintenance for the frozen NestJS API under the controller's rulings <R-A, R-B, R-C>; no plan task.
- **Files:**
  - `apps/api/src/commands/command-executor.integration.spec.ts` (R-A, test only);
  - `apps/api/drizzle/0020_receipt_copy_once.sql` and its `apps/api/drizzle/meta/_journal.json` entry (R-B, production);
  - `apps/api/src/exports/export.integration.spec.ts` (R-C, test only).
- **Cause, "commit order is revision order" (CI job 128703314342):**
  - The test pushed `'first'` when the first command's caller heard back. PostgreSQL wakes the waiting command inside the first's COMMIT, before that reply leaves on the first's connection. On a busy runner the second's mutation ran first.
  - The guarantee itself held. The test now checks it in the database: the second waited during the hold, then read revision `1` (the first's commit) under the lock.
  - Not a production bug.
- **Cause, "two records retaining one image at once …" (job 128705722586):**
  - `gogospend_reserve_receipt_copy` (0017) read "the receipt exists" and "a copy is in flight" in two statements, each with its own snapshot (VOLATILE PL/pgSQL).
  - The retain command, which publishes the reservation and inserts the receipt together, does not take the copy lock. It committed between the reads, so a second copy was reserved and made. Neither request waited a poll (44 and 63 ms).
  - A production race: one wasted, swept copy, and the "copied once" contract broken.
  - 0020 replaces the function with both reads in one statement. The test is unchanged.
- **Cause, "at most four export downloads …" (job 128694248812):**
  - One held download took 410 ms to reach the slot check (its 503 is the only download line CI logged). The fifth, sent after the test's fixed 300 ms, took the slot and was itself held by the gate. The test awaited it before opening the gate: a deadlock, then `afterAll` hung on the open connections.
  - The test now waits until four files are open and gates only those four.
  - Not a production bug, and not slowness: a longer timeout would still hang.
- **RED to GREEN** (scratch copies; the planner's models in `.claude/controller/scratch/fix-api-db-flakes/sim/`):
  - RED, the reserve model with 0017's two reads under 0020's name: `1 failed, 1 passed`. The R-A and R-C models reproduce CI's order and the hang: `8 passed` (they assert the failure).
  - GREEN, all three models: `10 passed` in each of 5 runs.
- **Mutation check:** <n> mutants, all killed:
  - 0020 back to two reads: the reserve model fails;
  - the journal entry removed: `migrations.spec.ts` fails;
  - no account lock: the R-A model's new assertions fail;
  - a cap that lets a fifth in: the R-C model fails fast, without hanging;
  - a held download refused early: the R-C model fails fast.
  - The two integration tests themselves need PostgreSQL and were not mutated here.
- **Gate:**
  - `typecheck` passes;
  - `test:api` `<suites>` suites, `<tests>` tests passed;
  - `build -w gogospend-api` and `release-graph.mjs check` pass;
  - `git diff --check` clean.
- **Deviations:** none. <or: the patch was applied with `git apply` because …; or: R-x was not ruled in.>
- **SKIPPED:** `test:db`, `test:ops`, `test:edge:db` (Docker is stopped by the owner's instruction; CI's SQL job runs them, and it is the first run of the two changed integration tests and of migration 0020 against PostgreSQL 17). Nothing hosted.
- **Notes for the integrator:**
  - 0020 is a production migration for the frozen API. It replaces one function (owner and grants kept) and needs the API's migration step (`db:migrate`, `DATABASE_DIRECT_URL`) wherever the API runs.
  - No code depends on it, so code and migration can ship in either order.
  - The next API migration, if any, is 0021.
```

### Step 8: Commit

1. `/usr/bin/git add` the ruled-in paths and `docs/implementation/receipts/fix-api-db-flakes.md`.
2. Write the message to `$S/commit-message.txt`.
3. `/usr/bin/git commit -F /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-api-db-flakes-impl/commit-message.txt`

With all three ruled in:

```
Fix three flaky database tests and a receipt copy race

commit order is revision order: the test pushed "first" when the first
command's caller heard back, but PostgreSQL wakes the waiting command inside
COMMIT, before that reply leaves. The test now reads, under the lock, the
revision the first committed.

Receipt copies: gogospend_reserve_receipt_copy read "the receipt exists"
and "a copy is in flight" in two statements (two snapshots), so a retain
committing between them let a second copy be reserved and made. Migration
0020 reads both in one statement.

Export downloads: a held download slower than the fixed 300 ms let the
fifth take its slot, and the test waited on its own gate. It now waits
until four files are open and gates only those four.

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
```

Without R-B:
- summary line: `Fix two flaky database tests: commit order and export downloads`;
- drop the receipt-copies paragraph.

## Your final message

As the protocol says, plus:
- which rulings you applied;
- the RED and GREEN model counts and the five-run GREEN line;
- the mutant results;
- the `test:api` suites and tests.

Reviewer, look first at:
- 0020 against 0017's function: `diff <(sed -n '/^CREATE FUNCTION gogospend_reserve_receipt_copy/,/^\$\$;/p' apps/api/drizzle/0017_attachments.sql) <(sed -n '/^CREATE OR REPLACE FUNCTION/,/^\$\$;/p' apps/api/drizzle/0020_receipt_copy_once.sql)`. Only the two reads, the two variables, `OR REPLACE` and one comment should differ. This SQL has not run against PostgreSQL before CI.
- R-C: `opened` is counted when `getStream` is called, which is after the controller takes the slot (`exports.controller.ts`, `downloading += 1` comes before `getStream`).
