# Review: 1A-T9 fix round (R92), confirming review

- Reviewer: Opus, confirming reviewer, 8 Nov 2026. Read-only; every probe ran in a scratch copy.
- Range: `p1/1a-t9-parity`, commits after `6ed0ed6`:
  - `755ea04`: merges the integration head `84ee167` (#351);
  - `6a4faf3`: the fix;
  - `1df7551`: the controller's receipt status correction.
- After `git fetch`, `origin/claude/p1a-vault-core` is `52632f2`.
- Spec: ruling R92, the brief `.claude/controller/briefs/1A-T9-fix.md`, and the first review `reviews/1A-T9.md` (its blocker and minor 1).
- Probe: `.claude/controller/scratch/1a-t9-confirm/`.
  - `repo/` is `git archive 1df7551`. Its root and `apps/edge` `node_modules` are shadow directories that symlink into the worktree's entries. The workspace links (`@gogospend/contracts`, `gogospend-api`, `gogospend-app`) are relative, so they resolve inside the probe.
  - I took the heavy lock once per run and released it each time. The lock is free now, and no workerd or wrangler process is left over.

**VERDICT: Approved.** The fix is the reviewed patch byte for byte, and it applies R92 exactly. Every mutant dies again on my runs. The gate matches the receipt. CI's database job on `1df7551` (merged with `52632f2`) now passes `vault-parity.db.test.ts`. There are no blockers or majors; the minor findings concern stale lines in the receipt.

---

## 1. The fix matches the brief and R92 (check 1)

### What was applied

- **The merge adds nothing of its own.** `git diff 84ee167 755ea04` equals `git diff c2d6d9d 6ed0ed6` (the task), and `git diff 6ed0ed6 755ea04` equals `git diff c2d6d9d 84ee167` (#351). Both comparisons are byte-identical.
- **The fix is the reviewed patch.** I applied `scratch/1a-t9-review/jsonb-order-fix.patch` to `755ea04`'s `sync.ts` and `sync.test.ts` in scratch. Both files `cmp` equal to `6a4faf3`.
- **The summary edit is the brief's Step 3 text exactly**, and `toHaveLength(3)` is kept.
- **Scope.** `6a4faf3` touches exactly the four named files. `1df7551` changes only the receipt's Status paragraph. `money-session.ts`, `parity.ts`, the normalizer and both `*.db.test.ts` files are unchanged since `6ed0ed6`.

### The jsonbOrder rule

`jsonbOrder` (`apps/edge/src/vault/reads/sync.ts:114-119`) implements R92's rule as written:

- byte length first (`Buffer.byteLength`, UTF-8);
- then `Buffer.compare`, which is PostgreSQL's `lengthCompareJsonbStringValue`: length, then memcmp;
- recursion into nested objects;
- arrays mapped in order;
- `null` and primitives returned unchanged.

### Every snapshot the vault serves

- **Which snapshots.** The vault registry defines four entities: `wallet`, `category`, `transaction` and `budget` (`commands/registry.ts:41-48`).
- **Their keys.** The only nested object is `budget.category_limits[]` (`packages/contracts/src/v1/budgets.ts`). No snapshot has a map-typed field. Every key is a fixed snake_case identifier. The later shapes are the same:
  - transactions' optional `attachment_id` (P2c);
  - the P5 `trip` and `settings` snapshots that #351 added to `SYNC_ENTITY_VALIDATORS` (`trips.ts:23-35`, `settings.ts:12`).
- **No integer-like key exists.** The implementer is right. I checked all of `packages/contracts/src/v1/{wallets,categories,transactions,budgets,trips,settings}.ts`.
- **Orders from the probe.** `scratch/1a-t9-confirm/jsonb-probe.mjs` runs `jsonbOrder` on each DTO's insertion-order keys:
  - It prints exactly the NestJS column that the first review measured on real PostgreSQL, for wallet, category, entry, transfer, budget and `category_limits`.
  - With `attachment_id`, the entry ends `...occurred_on, amount_minor, attachment_id`.
  - `isDeepStrictEqual(jsonbOrder(x), x)` holds: values are untouched.
  - The JS caveat is reproduced: `{a, "10"}` serializes as `{"10":2,"a":1}`. Snapshots cannot reach it.
- **Strings, null and numbers** pass through as `JSON.parse` produced them. jsonb does not change a string on the way back. `version` is an integer.

### Ordering runs before validation and cannot change what it sees

`changeOf` (line 95) orders the snapshot first. The id and version checks and `definition.validate(snapshot)` (line 103) then run on the ordered object. That cannot change the outcome:

- Every validator compares `Object.keys(x).sort().join(',')`, and the budget's limits are checked the same way, so key order is irrelevant. Field checks read values by name.
- `Object.fromEntries` creates the same own data properties that `JSON.parse` created. This holds even for a `__proto__` key, which no DTO has.
- The page budget check (`Buffer.byteLength(JSON.stringify(group))`, line 78) and the stored `group_bytes` do not depend on key order.

## 2. Other jsonb-sourced values on the 1A routes (check 2)

**Answer: none.** No other value the vault serves for the 1A routes comes from a jsonb column in NestJS. The session does not pass today only because some path goes unexercised.

### NestJS's jsonb columns

| Column | Where | Reaches a 1A route? |
|---|---|---|
| `jobs.payload` | `schema.ts:123` | No (internal) |
| `entity_changes.snapshot` | `schema.ts:304` | Yes: sync, now fixed |
| `audit_events.metadata` | `schema.ts:333` | No: never selected by any route in `apps/api/src` |
| import `issues` | `schema.ts:456,487` | No: 1B |

`gogospend_leased_entities(...).snapshot` (`0009_jobs_storage.sql:318`) is a function result rather than a column. It is the 1B full-snapshot path.

`grep` finds no `json_build_object`, `json_agg`, `to_json` or `row_to_json` in any NestJS read path.

### The 1A routes, one by one

- **Summary.** `summary-query.ts` and `vault/reads/summary.ts` hold the same SQL. Category totals and budget usage come from aggregates and tables, and the objects are built in JS.
- **`by_wallet`.** Both sides use `ORDER BY x.wallet` (`history/totals.ts:29`, `vault/reads/history.ts:73`), comparing uuid with text, which is the same order for lowercase ids. Its keys are UUIDs, which contain hyphens, so they are never integer-like.
- **History and deleted history.** Rows from `transactions`, with DTOs built in JS.
- **Budgets.** `GET`/`PUT /v1/budgets/:month` reads `budget_category_limits` rows `ORDER BY category_id` on both sides (`budgets.service.ts:35`, `domain/budgets.ts:50`). Writes sort with the same `localeCompare` (`:90`, `:104`). `isUuid` requires lowercase. Inside a snapshot, the array keeps that order, and the element keys (`category_id`, `limit_minor`, both 11 bytes) are already in jsonb order.
- **Command status and idempotent replay.** These read `command_receipts`, which has no jsonb column (`0005_commands.sql:12-28`). Privacy preferences have none either.
- **Retention purge groups.** Both sides `ORDER BY entity_id` (`0015_privacy.sql:616`, `vault/retention.ts:115`), and the snapshot is `null`.

### Paths the session does not exercise, for 1B and later

1. **The full-resync snapshot (1B-T8).**
   - NestJS builds the chunk files from `gogospend_leased_entities`, through `leased-account-read.ts:132`, so each snapshot arrives in jsonb order.
   - The vault's builder must pass each entity snapshot through `jsonbOrder`, or reuse `changeOf`.
   - The receipt's 1B note covers this.
2. **Import `issues` (1B import ports).** These are jsonb arrays of `{code, source_row_id, field}`, which come back as `code, field, source_row_id`. The receipt's note covers this.
3. **Exports (1B-T6) need nothing.** They read the same leased snapshot (`export-handler.ts:87`) but render CSV, so key order does not apply.
4. **Covered automatically:** `attachment_id` (P2c) and the P5 `trip`/`settings` snapshots all pass through `changeOf`. Category PATCH and archive serve the same DTO through the same path.
5. **A budget with two or more limits** is not in the session. Array order is deterministic and identical on both sides (see Budgets above), so this is not a gap in key order.

## 3. The new cases and the golden-month case (check 3)

### Re-running the mutants

I re-ran all five mutants in the scratch copy with the workers pool, each under the heavy lock. Each file was restored from a saved copy, and `cmp` matches the files at `1df7551`. Logs are `mutant-<n>.log`, with a summary in `mutants-summary.log`.

| Mutant | Result (focused file) | Killed by |
|---|---|---|
| Baseline (both files) | 22 passed, 3 todo | n/a |
| M1 `changeOf` without `jsonbOrder` | `sync.test.ts` 1 failed, 14 passed, 3 todo | route case |
| M2 no recursion | 1 failed, 14 passed, 3 todo | pure case |
| M3 bytewise only | 2 failed, 13 passed, 3 todo | both cases |
| M4 `t.category_id DESC` | `summary.test.ts` 1 failed, 6 passed | golden month |
| M5 `t.type DESC` | 1 failed, 6 passed | golden month |
| Extra: arrays returned unmapped | 1 failed | pure case (`[{d, ccc}]`) |
| Extra: `a.length - b.length` (UTF-16 length) | survives | equivalent: every served key is ASCII |
| Extra: `ORDER BY t.type` (tie-break dropped) | survives | see nit 3 |

### What the cases pin

- **The route case** asserts the served `Object.keys` of every entity kind, including `budget.category_limits[0]`. The expected arrays are PostgreSQL's measured orders (section 1). They parse `res.text()`, so the served bytes are read, not a re-serialized copy.
- **The pure case** pins three things: the length rule (at the top level and in the `{d, ccc}` array element), nested ordering, array order, and `null`/primitive passthrough.
- **M2 and the receipt.** The route case still passes under M2, because `category_limits` elements are already in jsonb order. The receipt's M2 note says so correctly.

### The golden-month expected order matches both ORDER BYs

- **NestJS** sorts `ORDER BY t.type, t.category_id` (`summary-query.ts:23`):
  - `type` is `text`, and `'expense' < 'income'` in every collation.
  - `category_id` is `uuid` (`0007_transactions.sql`), and PostgreSQL compares uuids as 16 bytes with memcmp. That is the lexicographic order of the lowercase hex text.
- **The vault** sorts the same way in SQLite on `TEXT` columns. They have no `COLLATE`, so the comparison is BINARY (`0000_vault_core.sql`).
- **The test's ids.** `builtinId` is `derivedUuid`, which emits lowercase hex (`apps/api/src/commands/derived-id.ts:13-14`), and JS `<` on ASCII is byte order. So the test's `.sort(...)` gives the order both databases give.
- **Kills are deterministic.** The user's `sub` is random, so whether food or bills comes first varies between runs, and the sort absorbs that. M4 always reverses the two expense rows, and M5 always moves salary first, so both kills are deterministic.

## 4. Gate (check 4)

Local runs are on `1df7551`, in the scratch copy.

| Command | Result |
|---|---|
| `npm run typecheck:edge` | exit 0 (`gate-typecheck-edge.log`) |
| `npm run test:edge` | 14 files, 172 passed (`gate-test-edge.log`) |
| `npm run test:edge:workers` (under the lock) | 21 files, 373 passed, 3 todo (376) (`gate-test-edge-workers.log`) |
| `npm run build:edge` | exit 0. The `jotbun_vault` bundle contains the comparator (`gate-build-edge.log`) |
| `git diff --check origin/claude/p1a-vault-core...1df7551` | clean |
| `test:edge:db` | not run locally (Docker stays stopped); CI ran it (below) |

**CI:** run 42479752243 on PR #352. GitHub tests the merge commit `e389d3b` ("Merge 1df7551 into 52632f2"), so its counts include #350 and #353.

- **SQL integration and ops: success** (`ci-sql-job.log`).
  - `test:db`: 694 passed.
  - `test:ops`: 107 passed.
  - `test:edge`: 14 files, 174 passed.
  - `test:edge:workers`: 22 files, 394 passed, 3 todo.
  - `build:edge`: passed.
  - **`test:edge:db`: 9 files, 64 passed.** This includes `vault-parity.db.test.ts (2 tests)`, with "the vault Worker answers the money session exactly like the NestJS v1 API" passing, and `parity.db.test.ts` passing. On `6ed0ed6` it was 63 passed and 1 failed.
- **Release image and smoke: success.**
- **Typecheck, unit, render, build, export: still running** when I finished (at `test:render`). This round changes nothing it covers except `apps/edge`, which that job does not build. On `6ed0ed6` it passed.

The changes from `84ee167` to `52632f2` touch none of the fix's files (`git diff --stat` over `src/vault/reads` and the two test files is empty).

## 5. Findings

### Blocker

None.

### Major

None.

### Minor

1. **Two lines in the receipt are stale after this round** (`docs/implementation/receipts/1A-T9.md`).
   - **The Status line (`1df7551`) still says "Not pushed."** The branch is PR #352, and CI has run twice. The fix round's SKIPPED line can also now cite CI's pass: run 42479752243, `test:edge:db` 64 passed, `vault-parity.db.test.ts` 2 of 2.
   - **"Notes for the integrator" (line 32) still says "The `category_id` tie-break in `summary.ts:43` is still unpinned (1A-T7 review)."** This round pinned it; M4 and M5 are killed, as the fix-round section itself says. The two statements now contradict each other.
   - Suggested fix: a one-paragraph controller correction at merge, like `1df7551`. Neither affects code.

### Nit

1. **The two new cases are vault-only, but nothing says so.**
   - They sit in `describe('GET /v1/sync/changes, ported from sync-api.integration.spec.ts')`.
   - The file header (`sync.test.ts:1-9`) still counts only the ported cases (13 + 5).
   - The first review offered a fix (say so in the header); the brief did not ask for it.
2. **The integer-like-key caveat is only in the receipt.**
   - It is not in `jsonbOrder`'s doc comment, so a 1B caller reusing the helper for import `issues` or snapshot chunks will not see it where they call it.
   - It cannot occur for any current or planned shape (section 1).
3. **Dropping the tie-break survives, as an equivalent mutant.**
   - Changing `ORDER BY t.type, t.category_id` to `ORDER BY t.type` still passes (`extra-no-id-tiebreak.log`). SQLite's `GROUP BY t.category_id, t.type` already emits groups in id order, and its sorter keeps that order within a type.
   - The test pins the observable order, which is what parity needs, and the SQL keeps the API's explicit tie-break.
   - Recorded only so nobody reads the pass as proof that the clause is load-bearing in SQLite.
4. **In the pure case, the top-level keys sort the same bytewise as length-first** (`a, aa, ab, bb, list`). So M3 is caught there only by the nested `{ccc, d}` element (`mutant-3.log`). It is still caught, and the route case catches it too. A top-level pair such as `{ b, aa }` would make the length rule visible at the top level.
5. **The jobs leave orphan processes.** CI's SQL job still ends with "Terminate orphan process" lines (`ci-sql-job.log:3261`). This predates the task, as the first review's nit 3 says.

## 6. Receipt accuracy (check 5)

Checked against the logs in `scratch/1a-t9-fix/` and against CI run 42476668840 (`gh run view`). Everything is accurate except the two stale lines in minor 1.

- **The CI result** of run 42476668840 on `6ed0ed6` is accurate:
  - the job steps: `test:edge:db` the only failure;
  - the counts: 694, 107, 163, and 371 + 3 todo.
- **Cause, fix and files** are accurate.
- **The mutant counts** match `mutant-1..5.log` and my own re-runs. The M2 explanation is right.
- **The gate counts** match `gate-*.log` and my runs.
- **The 1B note and the integer-like caveat** are accurate.
- **The controller's Status correction is accurate** on the merges and on the first CI result:
  - `6ed0ed6` merged `c2d6d9d`;
  - `755ea04` merged `84ee167`;
  - the first CI run differed only in key order, at steps 44 and 45;
  - the first reviewer's PostgreSQL 16 pass is real (`scratch/1a-t9-review/run-fix.log`: 3 files, 4 tests passed).

  The exception is "Not pushed." (minor 1).

VERDICT: Approved
