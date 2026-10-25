# Phase 1A: UserVault core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve every v1 account, policy, money, history, summary and sync-changes route from a per-person SQLite Durable Object (the UserVault), answering exactly as the NestJS v1 API does, proven by the parity money session in the real Workers runtime.

**Architecture:** A Worker in `apps/edge` keeps the HTTP front door: the route table, body limits, gates read from KV, the client-version check and JWT verification. It forwards each authenticated call over RPC to the caller's UserVault, addressed by the token's `sub`. The vault runs the API's command protocol synchronously inside `ctx.storage.transactionSync`, on a Drizzle schema it migrates on wake. The NestJS API on PostgreSQL stays read-only as the reference the parity session compares against.

**Tech Stack:** Cloudflare Workers and SQLite Durable Objects; Drizzle ORM 0.45.3 (`drizzle-orm/durable-sqlite`); jose 6.2.12; Workers KV; Vite 8 with `@cloudflare/vite-plugin` 1.65.0 (existing); Vitest 4.1 with `@cloudflare/vitest-plugin`; wrangler 4.152.0.

**Spec:** [docs/superpowers/specs/2026-10-25-jotbun-bun-wallet-cloudflare-design.md](../specs/2026-10-25-jotbun-bun-wallet-cloudflare-design.md). This plan implements §8 phase 1, first part, using §3 (C1, C2, C12), §4, §6.1 to §6.3, §6.5, §6.6, §6.11 and §6.14.

**Phase 1 plans.** Phase 1 is four plans; each ends green on its own and starts from the previous one:
- **1A (this plan):** the vault core. Account, policies, wallets, categories, transactions, budgets, history, summary, sync changes and retention alarms; the parity money session in workerd; Workers-runtime tests in CI.
- **1B:** files and background work on the vault. Receipts in R2, resync snapshots in R2, statement imports through the stateless parser, the export and deletion Workflows, the AI routes on vault reads; the parity files session. The PostgreSQL Workers retire, and the vault Worker folds into the HTTP Worker (C1).
- **1C:** Better Auth on D1 (C14, C17, D37, sessions as devices) and the app's sign-in port. Better Auth's JWKS feeds the token verifier built here.
- **1D:** live pokes, the C16 pending choice, PostHog wiring and consent, and the phase 1 proof on two phones.

**Calls made in this plan** (the builder's, not the owner's; listed so a reviewer can check them):
- **P1. The vault runs as its own Worker until 1B.** `jotbun-vault` is built like the existing background Workers (`wrangler.vault.jsonc`, an auxiliary Worker in `vite.config.ts`). The HTTP Worker keeps its PostgreSQL routes, so `test/workerd.db.test.ts` and `test/workerd-roles.db.test.ts` keep passing until 1B replaces what they test. 1B moves the class and the `/v1` handler into the HTTP Worker, which is C1's end state.
- **P2. Published policies, gates and client minimums live in one KV key, `config:v1`.** Policies are small, read on every request and change rarely, so they belong with remote config (§6.3 KV) and not in a D1 table. The Worker passes the policies into each vault call, as §6.2 requires for anything that needs I/O.
- **P3. Until 1C, any issuer the Worker is configured with can sign tokens.** The verifier takes `AUTH_ISSUER`, `AUTH_AUDIENCE` and `AUTH_JWKS_URL`. Tests and the parity session use the API's synthetic JWKS fixture. 1C points the same settings at Better Auth's `/api/auth/jwks` and sets `advanced.database.generateId: "uuid"`, so that `sub` and `sid` are UUIDs (confirmed in the Better Auth 1.6 docs).
- **P4. Rate budgets are counted in the vault's memory.** Every request for a person already reaches that person's vault, so its counters see all of their traffic. Budgets and the refusal are the API's (`RATE_BUDGETS` and `429 RATE_LIMITED` in `apps/api/src/common/shared-rate-limit.ts`). Eviction resets the counters, which only happens after the vault has been idle.
- **P5. Migrations are handwritten SQL with a handwritten Drizzle journal.** `drizzle-kit` is not an approved package, and reviewers read plain SQL more easily. A test keeps the Drizzle schema and the migrated tables in step.

## Global Constraints

- **Owner approvals:** the spec approves `drizzle-orm`, `jose` (both already in `apps/edge`) and `@cloudflare/vitest-pool-workers`. Cloudflare has renamed that package to **`@cloudflare/vitest-plugin`**, and the old name is deprecated with no further updates. The owner approved the new name on 25 October 2026. No other new package, and no lockfile regeneration with Linux bindings.
- **Version pin:** install the exact `@cloudflare/vitest-plugin` version whose `wrangler` dependency equals the edge's pinned `wrangler` (4.152.0 today, which is plugin 1.4.7). The lockfile must carry one wrangler.
- **No cloud resources.** Everything runs on local `wrangler dev`, Miniflare and the local PostgreSQL container. Hosted checks are recorded **SKIPPED**.
- **Process for every task** (handover §4): a behavioural RED with counts, then GREEN, a mutation check, the full gate, a receipt in `docs/implementation/premium-progress.md` under a new heading "## 1A: the UserVault core", a local commit ending with the attribution trailer, and an independent read-only review of the commit. Do not push. Never run a bare `git stash`. Make no changes under `vendor/`.
- **The edge gate** (run from the repo root; the database suites need `npm run db:v1:up` and `npm run build -w gogospend-api` first):
  ```bash
  npm run typecheck:edge && npm run test:edge && npm run test:edge:workers && npm run build:edge && npm run test:edge:db
  ```
- **Reference code is read-only:** `apps/api`, `packages/contracts` and the PostgreSQL edge modules under `apps/edge/src/server` and `apps/edge/src/roles`. Contracts do not change in 1A (C2: today's v1, baht only).
- **Reuse, do not fork, the pure API modules** through the edge's existing seams (`api-seams.ts`): `@api/commands/command-digest`, `command-headers`, `command-registry` and `derived-id`; `@api/common/api-problem.filter` (`ProblemException`), `feature-gates`, `client-version.guard` and `shared-rate-limit` (`RATE_BUDGETS` only); `@api/history/cursor`; `@api/sync/sync-cursor`; and the contracts parsers. Nothing under `src/vault` or `src/v1` imports `pg`, `drizzle-orm/node-postgres`, `DatabaseService` or `OwnerTx`. Type-only imports of the API's receipt and DTO types are fine.
- **Identity (§6.2):** the vault is `env.VAULT.idFromName(claims.accountId)`, opened with `{ locationHint: 'apac' }`. `accountId` is the verified token's `sub`. No route reads a user or vault id from the request.
- **Tokens (§6.4):** JWTs are verified with jose against a JWKS. Algorithms are `EdDSA` and `RS256` only. A token lives at most 900 seconds (`exp - iat`). `sub` and `sid` must be UUIDs.
- **Commands (§6.2):** each mutation is one `ctx.storage.transactionSync` block with no `await` inside, doing in order:
  1. check the account state, the token's `not_before` and the session id;
  2. read or reserve the receipt;
  3. validate references and versions;
  4. write;
  5. allocate the next revision;
  6. write the change and audit rows;
  7. complete the receipt.
- **Money (§4):**
  - A record is at most 99,999,999,999 minor units.
  - Minor amounts are decimal strings on the wire.
  - Balances are derived, never stored.
  - A transfer is one row.
  - Keyset pagination returns 50 rows by default and 200 at most.
- **Exactness:** an amount, sum, balance or revision never passes through a JavaScript `number` on its way out of SQLite. Read each one as `CAST(... AS TEXT)`, because the Durable Object SQL API returns `INTEGER` as a JS number and loses precision above 2^53.
- **Retention (§6.2):**
  - Deleted records stay soft-deleted for 30 days, then a vault alarm purges them.
  - Changes are kept 30 days; a cursor older than that gets `410 RESYNC_REQUIRED`.
  - Receipt digests drop after 30 days, while the receipts themselves stay.
- **Gates (§4, C12):** every mutating route carries its gate (`writes` for 1A routes). A paused gate answers 503 before authentication. An unreadable or malformed `config:v1` pauses every gate scope (fail closed). An absent `config:v1` leaves gates open and policies unpublished.
- **Logging:** log `failureName(error)` only. Never `error.message`, a request body or a token.
- **Time:** timestamps are ISO 8601 UTC with milliseconds (`Date#toISOString()`), taken once per call from the vault's clock (`UserVault#clock`, overridable in tests).
- **Porting SQL from PostgreSQL to SQLite:**
  - `$n` parameters become positional `?`.
  - Drop `FOR UPDATE` and `FOR SHARE`, because the transaction is the lock.
  - Rewrite `DISTINCT ON` as `GROUP BY` with `max()`, or as a window function.
  - Rewrite `jsonb_array_elements … WITH ORDINALITY` as a synchronous JS loop.
  - Rewrite `= ANY($1::uuid[])` as `IN (?, …)` sized to the array.
  - Bind `now()` as a parameter from the call's clock.
  - Booleans are stored as `0`/`1` and mapped back to booleans in DTOs.
  - `date` and `timestamptz` become `TEXT`, and `bytea` becomes `BLOB`.
  - Map a constraint failure to the same `ProblemException` the API raises for the PostgreSQL constraint it replaces.

## Review Focus

The five failure modes most likely to bite a real person, which the ported API suites do not exercise. Each has its test in the task that owns the code.

1. **The vault sleeps between two writes.** A command resent after eviction must replay its original acknowledgement, and the next command must take the next revision (Task 3, `after the vault sleeps, a resent command replays…`).
2. **Two phones write at the same moment.** Concurrent writes must commit in one order with contiguous revisions, and one command id sent twice at once must commit once (Task 3, `twenty writes at once…` and `the same command sent twice at once…`).
3. **Amounts at the top of the range.** A balance above `Number.MAX_SAFE_INTEGER` must stay an exact decimal string (Task 5, ported from the reconciliation suite and checked against the SQLite read path).
4. **Thai names at the length limit.** Length counts code points as the API does, not UTF-8 bytes. A name of 80 Thai code points is accepted, and 81 is refused on `name` (Task 3).
5. **KV config missing or broken in a fresh environment.** Gated routes answer 503 and reads keep working when `config:v1` cannot be read. Writes wait on unpublished policies when it is absent (Task 2 for the reader, Task 3 at the HTTP level).

---

## File structure

```
apps/edge/
  wrangler.vault.jsonc                 the jotbun-vault Worker: VAULT (SQLite DO), CONFIG (KV)
  vitest.workers.config.ts             Workers-runtime tests (cloudflareTest, wrangler.vault.jsonc)
  src/roles/vault.ts                   Worker entry: exports UserVault; /live, /v1/* -> handleVaultV1
  src/v1/                              the Worker side (no SQL)
    env.ts                             V1Env bindings and settings
    protocol.ts                        VaultClaims, VaultCall, VaultReply, VaultRouteId
    match.ts                           matchRoute (moved from src/server/app/routes.ts)
    routes.ts                          VAULT_V1_ROUTES, VAULT_DEFERRED_ROUTES, VAULT_RETIRED_ROUTES
    tokens.ts                          TokenVerifier (jose, JWKS)
    config.ts                          readEdgeConfig from KV config:v1 (C12)
    handler.ts                         handleVaultV1: the access pipeline, then the vault RPC
  src/vault/                           everything that runs inside the Durable Object
    user-vault.ts                      class UserVault: migrate on wake, call(), alarm()
    schema.ts                          Drizzle sqlite-core tables
    migrations/0000_vault_core.sql     the core tables and guard triggers
    migrations/index.ts                Drizzle journal + ?raw SQL (VAULT_MIGRATIONS)
    context.ts                         VaultContext, built once per call
    replies.ts                         ok(), toProblemReply(error)
    session.ts                         ensureAccount, assertSession, revokeSession
    rate-limits.ts                     RateBuckets (P4)
    policies.ts                        pending, accept, privacy, describeMe
    commands/registry.ts               buildVaultRegistry()
    commands/executor.ts               runCommand (the seven steps)
    commands/change-log.ts             appendChanges
    commands/receipts.ts               findReceipt, insertReceipt, lookupStatuses
    commands/entity-state.ts           entityHead, requireLiveEntity, expectVersion
    domain/wallets.ts, categories.ts, transactions.ts, budgets.ts
    reads/balances.ts, history.ts, deleted-history.ts, summary.ts, sync.ts
    retention.ts                       purge, change pruning, digest drop; schedule + alarm
    routes.ts                          VAULT_HANDLERS: VaultRouteId -> handler
  test/workers/                        run in workerd (npm run test:workers)
    support/v1-client.ts               keys, verifier, startV1, member, vaultOf
    vault-schema.test.ts, front-door.test.ts, config.test.ts, commands.test.ts,
    wallets.test.ts, categories.test.ts, transactions.test.ts, money-hardening.test.ts,
    golden-diary.test.ts, budgets.test.ts, history.test.ts, summary.test.ts,
    sync.test.ts, retention.test.ts
  test/rate-limits.test.ts             RateBuckets in Node
  test/vault-route-coverage.test.ts    every v1 route served, deferred to 1B or retired
  test/support/money-session.ts        the parity money STEPS, shared by both parity tests
  test/support/vault-worker.ts         the built jotbun-vault in wrangler dev, KV seeded
  test/vault-parity.db.test.ts         NestJS (PostgreSQL) vs the vault Worker (workerd)
Modified: apps/edge/package.json, package-lock.json, vite.config.ts, vitest.config.ts,
  tsconfig.json, src/cloudflare-workers.d.ts, src/server/app/routes.ts (import matchRoute),
  test/parity.db.test.ts (imports the shared session), test/support/wrangler-dev.ts
  (hyperdrive optional), README.md; package.json (root script); .github/workflows/backend.yml;
  scripts/ci/backend-workflow.test.mjs
```

---

### Task 1: Workers-runtime harness and a vault that migrates on wake

**Files:**
- Modify: `apps/edge/package.json`: add `@cloudflare/vitest-plugin` (exact) to devDependencies, and the script `"test:workers": "vitest run --config vitest.workers.config.ts"`.
- Modify: `apps/edge/package-lock.json` (by npm), `package.json` (root script `"test:edge:workers": "npm run test:workers --prefix apps/edge"`).
- Create: `apps/edge/wrangler.vault.jsonc`, `apps/edge/src/roles/vault.ts`, `apps/edge/vitest.workers.config.ts`
- Create: `apps/edge/src/vault/schema.ts`, `src/vault/migrations/0000_vault_core.sql`, `src/vault/migrations/index.ts`, `src/vault/user-vault.ts`
- Modify: `apps/edge/vite.config.ts` (add `{ configPath: './wrangler.vault.jsonc' }` to `auxiliaryWorkers`), `apps/edge/vitest.config.ts` (exclude `test/workers/**`), `apps/edge/tsconfig.json` (include the new config), `apps/edge/src/cloudflare-workers.d.ts`
- Test: `apps/edge/test/workers/vault-schema.test.ts`

**Interfaces:**
- Produces:
  - `class UserVault extends DurableObject<VaultEnv>`, with `readonly db: VaultDb` and `clock: () => Date`. Its constructor runs `migrate(this.db, VAULT_MIGRATIONS)` inside `ctx.blockConcurrencyWhile`.
  - `type VaultDb = DrizzleSqliteDODatabase<typeof vaultSchema>` and `vaultSchema` (one table object per core table).
  - `VAULT_MIGRATIONS: { journal: { entries: { idx: number; when: number; tag: string; breakpoints: boolean }[] }; migrations: Record<string, string> }`, keyed `m0000`.
  - `VAULT_CORE_TABLES: readonly string[]`, the sorted table names.
  - `type VaultEnv = { COMMAND_DIGEST_KEY?: string; COMMAND_DIGEST_PREVIOUS_KEYS?: string; JOTBUN_ENV?: string }`.
  - The Worker `jotbun-vault`, whose default export answers `GET /live` with 200 and anything else with 404 until Task 2.

- [ ] **Step 1: Install the package.** The owner approved `@cloudflare/vitest-plugin` in place of `@cloudflare/vitest-pool-workers` on 25 October 2026.
  ```bash
  npm view @cloudflare/vitest-plugin@1.4.7 dependencies.wrangler   # must print 4.152.0
  npm install --prefix apps/edge --save-dev --save-exact @cloudflare/vitest-plugin@1.4.7
  npm ls --prefix apps/edge wrangler                                # one wrangler, 4.152.0
  grep -c '"node_modules/@cloudflare/workerd-linux-64"' apps/edge/package-lock.json   # 1 or more
  ```

- [ ] **Step 2: Write the harness.**
  - `wrangler.vault.jsonc`:
    - `name` is `jotbun-vault`, `main` is `src/roles/vault.ts`;
    - `compatibility_date` is `2026-10-01` and `compatibility_flags` is `["nodejs_compat"]`;
    - `durable_objects.bindings` is `[{ "name": "VAULT", "class_name": "UserVault" }]`;
    - `migrations` is `[{ "tag": "v1-user-vault", "new_sqlite_classes": ["UserVault"] }]`;
    - `kv_namespaces` is `[{ "binding": "CONFIG", "id": "00000000000000000000000000000000" }]`;
    - `vars` is `{ "JOTBUN_ENV": "local" }`.
  - `vitest.workers.config.ts`: merge `apiSeamsConfig` with `apiSeams()`. Add `cloudflareTest({ wrangler: { configPath: './wrangler.vault.jsonc' }, miniflare: { bindings: { JOTBUN_ENV: 'test', COMMAND_DIGEST_KEY: 'synthetic-command-digest-key-0123456789abcdef' } } })`, and set `include: ['test/workers/**/*.test.ts']`. Check the option names against the installed package's `WorkersPoolOptions` type.
  - `src/cloudflare-workers.d.ts`: extend the shim with only what the vault uses. Do not add `@cloudflare/workers-types`, which clashes with the DOM lib. That means:
    - `DurableObjectStateLike.storage` with `sql.exec`, `transactionSync`, `getAlarm`, `setAlarm` and `deleteAlarm`;
    - `blockConcurrencyWhile`;
    - the global `DurableObjectStorage`, `SqlStorage`, `SqlStorageCursor` and `SqlStorageValue` names that Drizzle's types reference;
    - `KVNamespace` (`get(key, 'json' | 'text')` and `put`);
    - `DurableObjectNamespace<T>` (`idFromName` and `get(id, { locationHint })`).

- [ ] **Step 3: Write the failing tests** in `test/workers/vault-schema.test.ts`:

```ts
import { env } from 'cloudflare:workers'
import { evictAllDurableObjects, runInDurableObject } from 'cloudflare:test'
import { getTableConfig } from 'drizzle-orm/sqlite-core'

import { VAULT_CORE_TABLES, vaultSchema } from '../../src/vault/schema'

const vault = (name = crypto.randomUUID()) => env.VAULT.get(env.VAULT.idFromName(name))
const sql = (stub: DurableObjectStub, query: string, ...args: unknown[]) =>
  runInDurableObject(stub, (_v, state) => state.storage.sql.exec(query, ...args).toArray())
const USER_TABLES = "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name <> '__drizzle_migrations' ORDER BY name"

it('a new vault has every core table, migrated once', async () => {
  const stub = vault()
  expect((await sql(stub, USER_TABLES)).map((r) => r.name)).toEqual([...VAULT_CORE_TABLES])
  expect(VAULT_CORE_TABLES).toEqual(['account_state', 'audit_events', 'budget_category_limits', 'categories', 'command_receipts', 'consents', 'entity_changes', 'entity_heads', 'monthly_budgets', 'revoked_sessions', 'schedule', 'sync_state', 'transactions', 'wallets'])
  expect((await sql(stub, 'SELECT count(*) AS n FROM __drizzle_migrations'))[0].n).toBe(1)
})

it('a vault keeps its rows and does not migrate again after it sleeps', async () => {
  const name = crypto.randomUUID()
  await sql(vault(name), "INSERT INTO consents (kind, version, granted, updated_at) VALUES ('analytics', 0, 1, '2026-10-25T00:00:00.000Z')")
  await evictAllDurableObjects()
  expect(await sql(vault(name), 'SELECT kind, granted FROM consents')).toEqual([{ kind: 'analytics', granted: 1 }])
  expect((await sql(vault(name), 'SELECT count(*) AS n FROM __drizzle_migrations'))[0].n).toBe(1)
})

it('the Drizzle schema matches the migrated tables column for column', async () => {
  const stub = vault()
  for (const table of Object.values(vaultSchema)) {
    const config = getTableConfig(table)
    const pragma = await sql(stub, `PRAGMA table_info(${config.name})`)
    expect(config.columns.map((c) => [c.name, c.notNull]).sort()).toEqual(pragma.map((p) => [p.name, p.notnull === 1 || p.pk > 0]).sort())
  }
})

it('foreign keys hold: a transaction naming an unknown wallet is refused', async () => {
  await expect(sql(vault(), "INSERT INTO transactions (id, type, amount_minor, occurred_on, wallet_id, category_id, version, created_at, updated_at) VALUES (?, 'expense', 100, '2026-10-20', ?, ?, 1, 'x', 'x')", crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID())).rejects.toThrow(/FOREIGN KEY/)
})

it('command log rows must use the current revision, and entity heads only move forward', async () => {
  const stub = vault()
  await sql(stub, 'INSERT INTO sync_state (id, revision, pruned_through) VALUES (1, 1, 0)')
  await expect(sql(stub, "INSERT INTO entity_changes (revision, ordinal, command_id, entity, entity_id, version, state, snapshot, committed_at) VALUES (2, 0, ?, 'wallet', ?, 1, 'active', '{}', 'x')", crypto.randomUUID(), crypto.randomUUID())).rejects.toThrow(/current revision/)
  const id = crypto.randomUUID()
  await sql(stub, "INSERT INTO entity_heads (entity, entity_id, version, state, revision) VALUES ('wallet', ?, 1, 'active', 1)", id)
  await expect(sql(stub, "UPDATE entity_heads SET version = 1 WHERE entity_id = ?", id)).rejects.toThrow(/move forward/)
})
```

- [ ] **Step 4: Run it and see it fail.**
  Run: `npm run test:edge:workers -- test/workers/vault-schema.test.ts`
  Expected: 5 failing tests (the `VAULT` binding has no class, and `schema` does not exist). Record the counts.

- [ ] **Step 5: Write the schema, the migration and the vault.**
  - `0000_vault_core.sql` ports the API tables from `apps/api/drizzle/0005`, `0006`, `0007`, `0008` and `0010` without `account_id`, using the porting rules above. Then:
    - `char_length` becomes `length`, and `btrim` becomes `trim`.
    - The colour check becomes `GLOB '#[0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F]'`.
    - Drop the regex control-character checks, since the contracts validate those.
  - New tables:
    - `account_state`: a single row (`id INTEGER PRIMARY KEY CHECK (id = 1)`), with `account_id`, `status` (active, deleting or deleted), `not_before` (epoch seconds) and `created_at`;
    - `sync_state`: a single row, with `revision` and `pruned_through`;
    - `revoked_sessions`: `session_id` as the primary key, `revoked_at` and `expires_at`;
    - `consents`: `kind`, `version`, `granted` and `updated_at`, with primary key `(kind, version)`;
    - `schedule`: `job` as the primary key, and `due_at` (epoch ms).
  - The category type match and the budget sublimit check become triggers:
    - `transactions.category_id` references `categories(id)`, and a `BEFORE INSERT/UPDATE` trigger refuses a category whose `type` differs from the transaction's;
    - a `budget_category_limits` row must name an `expense` category;
    - limits never sum above `monthly_budgets.overall_limit_minor`, checked after a limit insert or update and after an overall update.
  - Port the two guard triggers from `0005_commands.sql` (current revision, and entity heads forward-only) as `BEFORE` triggers using `RAISE(ABORT, 'command log rows must use the current revision')` and `RAISE(ABORT, 'entity heads only move forward and never leave purged')`.
  - `migrations/index.ts`: `import core from './0000_vault_core.sql?raw'`, plus a journal with one entry: `idx` 0, `tag` `0000_vault_core`, `when` `1761350400000`, and `breakpoints` true. Separate statements with `--> statement-breakpoint`.

- [ ] **Step 6: Run it and see it pass.** Run the same command. Expected: 5 passed. Then run `npm run build:edge && ls apps/edge/dist/jotbun_vault/wrangler.json`, which should print the path.

- [ ] **Step 7: Mutation check.**
  - Drop the entity-head trigger: the last test fails.
  - Raise the journal's `when` in a copy and re-run after eviction: the second test fails (the migration would run twice).
  - Restore both and verify the checksums.

- [ ] **Step 8: Gate, receipt, commit.** Run the edge gate. Write the receipt. Commit: `git commit -m "Add the UserVault Durable Object with its core schema, migrated on wake"`.

---

### Task 2: The vault-backed front door: tokens, KV config, sessions, account and policies

**Files:**
- Create: `src/v1/env.ts`, `src/v1/protocol.ts`, `src/v1/match.ts`, `src/v1/routes.ts`, `src/v1/tokens.ts`, `src/v1/config.ts`, `src/v1/handler.ts`
- Create: `src/vault/context.ts`, `src/vault/replies.ts`, `src/vault/session.ts`, `src/vault/rate-limits.ts`, `src/vault/policies.ts`, `src/vault/routes.ts`
- Modify: `src/vault/user-vault.ts` (add `call`), `src/roles/vault.ts` (route `/v1/*` to `handleVaultV1`), `src/server/app/routes.ts` (import `matchRoute` from `../../v1/match`, with no behaviour change)
- Create: `test/workers/support/v1-client.ts`
- Test: `test/workers/front-door.test.ts`, `test/workers/config.test.ts`, `test/rate-limits.test.ts`, `test/vault-route-coverage.test.ts`

**Interfaces:**
- Consumes: `UserVault`, `VaultDb` (Task 1).
- Produces:
  ```ts
  // src/v1/protocol.ts
  export type VaultClaims = { accountId: string; sessionId: string; issuedAt: number; clientId: string }
  export type PublishedPolicies = PolicyVersionDto[] | null
  export type VaultRouteId =
    | 'me.get' | 'me.logout' | 'me.privacy' | 'policies.accept' | 'commands.status'
    | 'wallets.list' | 'wallets.get' | 'wallets.create' | 'wallets.update' | 'wallets.archive' | 'wallets.unarchive'
    | 'categories.list' | 'categories.builtins' | 'categories.create' | 'categories.update' | 'categories.archive' | 'categories.unarchive'
    | 'transactions.get' | 'transactions.create' | 'transactions.update' | 'transactions.delete' | 'transactions.restore'
    | 'budgets.get' | 'budgets.put' | 'history.list' | 'history.deleted' | 'summary.get' | 'sync.changes'
  export type VaultCall = {
    route: VaultRouteId
    access: 'bound_session' | 'current_policy'
    claims: VaultClaims
    policies: PublishedPolicies
    params: Record<string, string>
    query: Record<string, unknown>
    /** Only idempotency-key, x-gogospend-command-schema and if-match, lowercase. */
    headers: Record<string, string | undefined>
    body: unknown
  }
  export type VaultReply =
    | { ok: true; status: number; body?: unknown; headers?: Record<string, string> }
    | { ok: false; status: number; code: ApiErrorCode; problem: ProblemOptions }
  ```
  - `matchRoute<R extends { method: string; path: string }>(routes: readonly R[], method: string, pathname: string): { route: R; params: Record<string, string> } | null`.
  - `type VaultRoute = { method: Method; path: string; access: 'public' | 'bound_session' | 'current_policy'; vault?: VaultRouteId; gates?: readonly GateScope[]; status?: number }`.
  - `vaultStatus(r: VaultRoute): number`, which follows the rule of `defaultStatus`: `r.status ?? (r.method === 'POST' ? 201 : 200)`.
  - `VAULT_V1_ROUTES: readonly VaultRoute[]`.
  - `VAULT_PENDING_ROUTES`, `VAULT_DEFERRED_ROUTES` and `VAULT_RETIRED_ROUTES`, each a `readonly string[]` of `"METHOD /path"`. Pending holds the 1A routes that a later task of this plan ports. Each task moves its routes from pending to `VAULT_V1_ROUTES`, and pending is empty by Task 9.
  - `type VaultHandler = (c: VaultContext, call: VaultCall) => VaultReply` and `VAULT_HANDLERS: Partial<Record<VaultRouteId, VaultHandler>>`.
  - `type TokenVerifier = { verify(authorization: string | undefined, clientId: string): Promise<VaultClaims> }`.
  - `createTokenVerifier(o: { issuer: string; audience: string; keys: JWTVerifyGetKey; maxLifetimeSeconds?: number }): TokenVerifier`, and `tokenVerifierFromEnv(env: V1Env): TokenVerifier` (which uses `createRemoteJWKSet`).
  - `EDGE_CONFIG_KEY = 'config:v1'`, `type EdgeConfigJson`, `type EdgeConfig = { gates: FeatureGates; policies: PublishedPolicies; clientVersions: ClientVersionGuard }`, and `readEdgeConfig(kv: KVNamespace, env: V1Env): Promise<EdgeConfig>`.
  - `handleVaultV1(request: Request, env: V1Env, deps?: { verifier?: TokenVerifier; config?: (env: V1Env) => Promise<EdgeConfig> }): Promise<Response>`.
  - `UserVault#call(call: VaultCall): VaultReply` (synchronous; every error becomes a problem reply).
  - `type VaultContext = { db: VaultDb; sql: SqlStorage; storage: DurableObjectStorage; registry: CommandRegistry; digester: CommandDigester; claims: VaultClaims; policies: PublishedPolicies; now: Date }`.
  - `ensureAccount(c: VaultContext): void`, `assertSession(c: VaultContext): void` and `revokeSession(c: VaultContext): void`.
  - `class RateBuckets { constructor(now: () => number); charge(budget: 'principal' | 'read' | 'write', key: string): void }`.
  - In `policies.ts`: `pendingPolicies(c)`, `assertPolicyAccepted(c)`, `acceptPolicy(c, kind: unknown, version: unknown)`, `privacyOf(c)`, `setPrivacy(c, analytics: unknown)` and `describeMe(c): MeDto`.
  - `test/workers/support/v1-client.ts`:
    - `newUser(): TestUser`, where `TestUser = { sub: string; sid: string }`;
    - `startV1(config?: EdgeConfigJson | 'absent' | 'malformed'): Promise<V1Client>`, where `V1Client = { as(user, opts?: { iat?: number; exp?: number; client?: string; omitSid?: boolean }): UserClient; raw(request: Request): Promise<Response> }`. The default config is `{ policies: TEST_POLICIES }`, with no gate paused;
    - `member(client, user?): Promise<TestUser>`;
    - `vaultOf(user): DurableObjectStub`;
    - `TEST_POLICIES` (terms v1 required and privacy v1, as `publishPolicies()` in `test/support/edge-harness.ts`).

    `UserClient` and `CommandOptions` have the same shapes as in `test/support/edge-harness.ts`. Keys come from jose `generateKeyPair('EdDSA')`, and the verifier from `createLocalJWKSet`.

- [ ] **Step 1: Write the failing tests.**
  - In `test/workers/front-door.test.ts`, port these cases from `test/dispatch.db.test.ts` by name, with their assertions:
    - `every response is no-store with its own request id and helmet-style headers`
    - `a client-sent request id is ignored`
    - `an unknown route is 404 NOT_FOUND as an ApiProblem when nothing is forwarded`
    - `no client header is 426 before any token check`
    - `an outdated client is 426`
    - `no bearer token is 401 UNAUTHENTICATED`
    - `a token from an unpublished key is 401`
    - `privacy preferences are saved and read back`
  - Add these new cases:

```ts
it('a token without a session id is 401 SESSION_REQUIRED', async () => {
  const res = await client.as(newUser(), { omitSid: true }).get('/v1/me')
  expect(res.status).toBe(401)
  expect((await res.json()).code).toBe('SESSION_REQUIRED')
})

it('a token living longer than 15 minutes is 401 UNAUTHENTICATED', async () => {
  const now = Math.floor(Date.now() / 1000)
  const res = await client.as(newUser(), { iat: now, exp: now + 901 }).get('/v1/me')
  expect(res.status).toBe(401)
  expect((await res.json()).code).toBe('UNAUTHENTICATED')
})

it('signing out ends this session only', async () => {
  const user = newUser()
  const other = { ...user, sid: crypto.randomUUID() }
  expect((await client.as(user).post('/v1/me/logout')).status).toBe(204)
  expect((await (await client.as(user).get('/v1/me')).json()).code).toBe('SESSION_REQUIRED')
  expect((await client.as(other).get('/v1/me')).status).toBe(200)
})

it('a token issued before not_before is 401, and an account being deleted is 403 ACCOUNT_UNAVAILABLE', async () => {
  const user = newUser()
  await client.as(user).get('/v1/me')
  await runInDurableObject(vaultOf(user), (_v, s) => s.storage.sql.exec('UPDATE account_state SET not_before = ?', Math.floor(Date.now() / 1000) + 60))
  expect((await (await client.as(user).get('/v1/me')).json()).code).toBe('SESSION_REQUIRED')
  await runInDurableObject(vaultOf(user), (_v, s) => s.storage.sql.exec("UPDATE account_state SET not_before = 0, status = 'deleting'"))
  const res = await client.as(user).get('/v1/me')
  expect(res.status).toBe(403)
  expect((await res.json()).code).toBe('ACCOUNT_UNAVAILABLE')
})

it('a call naming another person is refused by the vault, which writes nothing', async () => {
  const owner = newUser()
  await client.as(owner).get('/v1/me')
  const reply = await runInDurableObject(vaultOf(owner), (v: UserVault) =>
    v.call({ route: 'me.privacy', access: 'bound_session', claims: { accountId: crypto.randomUUID(), sessionId: crypto.randomUUID(), issuedAt: Math.floor(Date.now() / 1000), clientId: 'ios/1.0.0' }, policies: TEST_POLICIES, params: {}, query: {}, headers: {}, body: { analytics: true } }))
  expect(reply).toMatchObject({ ok: false, status: 500, code: 'INTERNAL_ERROR' })
  expect(await runInDurableObject(vaultOf(owner), (_v, s) => s.storage.sql.exec('SELECT count(*) AS n FROM consents').one().n)).toBe(0)
})

it('/v1/me shows the pending terms until they are accepted', async () => {
  const user = newUser()
  expect(await (await client.as(user).get('/v1/me')).json()).toMatchObject({ account_id: user.sub, status: 'active', pending_policies: [{ kind: 'terms', version: 1 }] })
  expect((await client.as(user).post('/v1/me/policy-acceptances', { kind: 'terms', version: 1 })).status).toBe(204)
  expect((await (await client.as(user).get('/v1/me')).json()).pending_policies).toEqual([])
})
```
  - In `test/workers/config.test.ts`:

```ts
it('an unreadable or malformed config pauses every gate scope, with a retry', async () => {
  for (const kv of [{ get: async () => { throw new Error('kv down') } }, { get: async () => ({ gates: 'nope' }) }]) {
    const config = await readEdgeConfig(kv as unknown as KVNamespace, {} as V1Env)
    for (const scope of GATE_SCOPES) expect(() => config.gates.assertOpen(scope)).toThrow(ProblemException)
    expect(config.policies).toBeNull()
  }
})

it('an absent config leaves gates open and policies unpublished', async () => {
  const config = await readEdgeConfig({ get: async () => null } as unknown as KVNamespace, { MIN_CLIENT_VERSION_IOS: '1.0.0', MIN_CLIENT_VERSION_ANDROID: '1.0.0' } as V1Env)
  expect(() => config.gates.assertOpen('writes')).not.toThrow()
  expect(config.policies).toBeNull()
})

it('GET /v1/policies answers the published policies from KV', async () => {
  const res = await (await startV1()).raw(new Request('http://vault.test/v1/policies'))
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual(TEST_POLICIES)
})
```
  - In `test/rate-limits.test.ts` (Node):

```ts
it('the 361st request from one person in a minute is 429 RATE_LIMITED with a retry, and the next window opens', () => {
  let now = 1_000_000
  const buckets = new RateBuckets(() => now)
  for (let i = 0; i < 360; i++) buckets.charge('principal', 'a')
  try { buckets.charge('principal', 'a'); expect.unreachable() } catch (e) {
    expect(e).toBeInstanceOf(ProblemException)
    expect((e as ProblemException).getStatus()).toBe(429)
    expect((e as ProblemException).problem.retryAfterSeconds).toBeGreaterThan(0)
  }
  now += 60_000
  expect(() => buckets.charge('principal', 'a')).not.toThrow()
})
```
  - In `test/vault-route-coverage.test.ts` (Node): every `"METHOD path"` of `V1_ROUTES` and `EDGE_ONLY_ROUTES` (`src/server/app/routes.ts`) appears in exactly one of four places:
    - in `VAULT_V1_ROUTES`, with the same `access` (`token_only` never appears there) and `gates`, and with `vaultStatus` equal to the old route's `defaultStatus`. A route with a `vault` id has a handler in `VAULT_HANDLERS`;
    - in `VAULT_PENDING_ROUTES`;
    - in `VAULT_DEFERRED_ROUTES`;
    - in `VAULT_RETIRED_ROUTES`.

    Also assert the retired set exactly:

```ts
expect([...VAULT_RETIRED_ROUTES].sort()).toEqual(['POST /v1/auth/bootstrap', 'POST /v1/auth/challenges', 'POST /v1/auth/proofs', 'POST /v1/auth/provider-events', 'POST /v1/me/global-logout', 'POST /v1/me/identities'])
```
    (§6.4 retires these; `/v1/auth/deletion-receipt` and `/v1/me/deletion` are deferred to 1B.)

- [ ] **Step 2: Run them and see them fail.**
  Run: `npm run test:edge:workers -- test/workers/front-door.test.ts test/workers/config.test.ts` and `npm run test:edge -- test/rate-limits.test.ts test/vault-route-coverage.test.ts`.
  Expected: every new case fails on its assertions (routes 404 or missing exports). Record the counts.

- [ ] **Step 3: Implement the Worker side.**
  - `handleVaultV1` runs the API's pipeline order from `src/server/app/dispatch.ts`:
    1. request id;
    2. route match (404);
    3. JSON body (400 and 413, 2 MiB, using `readJsonBody`);
    4. gates (503, or 404 when unexposed);
    5. public `GET /v1/policies`, answered in the Worker with the latest version per kind (an empty list when unpublished);
    6. client version (426);
    7. token (401);
    8. `env.VAULT.get(env.VAULT.idFromName(claims.accountId), { locationHint: 'apac' }).call(...)`.

    Convert a reply with `jsonResponse` or `problemResponse` from `src/server/http/problem.ts`. HEAD drops the body. `claims.clientId` is the validated `x-gogospend-client` value.
  - `tokens.ts`:
    - Read the bearer with the API's `MAX_TOKEN_LENGTH` (`@api/auth/auth0-token-verifier`).
    - Call `jwtVerify(token, keys, { issuer, audience, algorithms: ['EdDSA', 'RS256'], requiredClaims: ['sub', 'iat', 'exp'] })`.
    - `exp - iat > 900`, or a non-UUID `sub`, is 401 `UNAUTHENTICATED`. A missing or non-UUID `sid` is 401 `SESSION_REQUIRED`.
    - A JWKS outage gives the same problem `Auth0TokenVerifier` gives for one.
  - `config.ts`: apply the C12 rules from the Global Constraints. Fail closed with `retryAfterSeconds: 30`. Client minimums come from `client_versions` in KV, or else from `MIN_CLIENT_VERSION_IOS` and `MIN_CLIENT_VERSION_ANDROID`.

- [ ] **Step 4: Implement the vault side.**
  - `UserVault#call` builds a `VaultContext` and then runs, in order:
    1. `ensureAccount`, which creates `account_state` and `sync_state` on the first call. If the stored `account_id` differs from `claims.accountId`, it throws, logs `vault_owner_mismatch` and writes nothing.
    2. Charge `principal`.
    3. `assertSession`, applying the session rules from the tests above.
    4. Charge `read` (GET) or `write`, keyed by `sessionId`.
    5. `assertPolicyAccepted` when the access class is `current_policy`.
    6. The handler from `VAULT_HANDLERS`.
  - `toProblemReply` maps `ProblemException`, `ContractValidationError` (422, as in `errorResponse`) and anything else (500 `INTERNAL_ERROR`, logging the class name only).
  - `policies.ts` ports `PolicyService.pending`, `stateIn`, `accept`, `privacy` and `setPrivacy` (`apps/api/src/policies/policy.service.ts`) onto `consents` and `call.policies`. Statuses come from `V1_ROUTES`: acceptances 204, logout 204.

- [ ] **Step 5: Run them and see them pass.** Run the same commands. Expected: all pass.

- [ ] **Step 6: Mutation check.**
  - Skip the owner comparison in `ensureAccount`: `a call naming another person…` fails.
  - Make `readEdgeConfig` return open gates on a KV error: the first config test fails.
  - Move the principal charge after `assertSession`: no ported test catches this ordering. Add `an invented session id still spends the person's budget`: 360 calls with random `sid`s, then a valid call gets 429.

- [ ] **Step 7: Gate, receipt, commit.** Commit: `git commit -m "Route v1 account and policy calls to the caller's UserVault through a verified token"`.

---

### Task 3: The command protocol, proven with wallets

**Files:**
- Create: `src/vault/commands/registry.ts`, `src/vault/commands/executor.ts`, `src/vault/commands/change-log.ts`, `src/vault/commands/receipts.ts`, `src/vault/commands/entity-state.ts`, `src/vault/domain/wallets.ts`, `src/vault/reads/balances.ts`
- Modify: `src/vault/routes.ts`, `src/v1/routes.ts` (wallet routes and `POST /v1/commands/status`), `src/vault/user-vault.ts` (build the registry once per instance)
- Test: `test/workers/commands.test.ts`, `test/workers/wallets.test.ts`

**Interfaces:**
- Consumes: `VaultContext`, `assertSession`, `assertPolicyAccepted` and the client helpers (Task 2).
- Produces:
  - `buildVaultRegistry(): CommandRegistry`. Every 1A entity and command has the same `kind`, `entity`, `outcome`, `schemaVersions` and `policy` as the API services define in their constructors (`wallets.service.ts`, `categories.service.ts`, `transactions.service.ts` and `budgets.service.ts`), defined in the order `buildContainer` constructs them.
  - `type VaultMutation = { entityId: string; version: number; changes: readonly EntityChange[]; audit?: AuditMetadata }`.
  - `runCommand<P>(c: VaultContext, input: CommandInput<P>, mutate: () => VaultMutation): CommandAck`.
  - `appendChanges(c: VaultContext, commandId: string, changes: readonly EntityChange[]): Revision`.
  - `findReceipt(c, commandId): StoredReceipt | null`, `insertReceipt(c, receipt: NewReceipt): void` and `lookupStatuses(c, ids: readonly string[]): CommandStatus[]`. The types are imported from `@api/commands/command-receipts.repository`.
  - `entityHead(c, entity, id): EntityHead | null`, `requireLiveEntity(c, entity, id): EntityHead`, and `expectVersion<T extends { version: number }>(row: T | undefined, expected: number | undefined, current: (row: T) => unknown): T`.
  - `commandInput(call: VaultCall, kind: string, payload: unknown): CommandInput<unknown>`, which reads the headers with `@api/commands/command-headers`.
  - `walletBalances(c: VaultContext, ids?: readonly string[]): Map<string, string>`. This is the opening balance plus incomes, minus expenses, plus or minus transfers, over live rows, as `apps/api/src/transactions/balance-query.ts` computes it.

- [ ] **Step 1: Write the failing tests.**
  - `commands.test.ts`: port every `it` in `apps/api/src/commands/command-executor.integration.spec.ts` (17), `command-hardening.integration.spec.ts` (17) and `command-status.integration.spec.ts` (9), by name and assertion, through the HTTP client or `runInDurableObject`. A case that tests PostgreSQL roles, row-level security, connection pools or lock waits gets one line in the receipt as not applicable, with the reason; port every other case.
  - Port these from `test/dispatch.db.test.ts`:
    - `creates a wallet whose balance starts at its opening balance`
    - `a resent command replays its acknowledgement; the same key with other content is 409`
    - `an unsupported command schema is 422 before anything is written`
    - `a stale If-Match is 409 VERSION_CONFLICT with the current wallet`
    - `validation problems name the field`
    - `writes wait for the current terms; accepting them opens writes`
    - `the policy check runs in the guard, before the body is validated`
    - `a paused writes gate answers 503 WRITES_PAUSED with Retry-After before authentication; reads stay open` (using `startV1({ gates: { paused: ['writes'], retry_after_seconds: 120 }, policies: TEST_POLICIES })`)
    - `malformed JSON is 400 VALIDATION_FAILED; a JSON primitive is refused as strict JSON`
    - `a body over 2 MB is 413 COMMAND_TOO_LARGE`
  - Add:

```ts
it('with no config in KV, writes wait for published policies (503) while reads work', async () => {
  const bare = await startV1('absent')
  const user = newUser()
  const res = await bare.as(user).post('/v1/wallets', { id: crypto.randomUUID(), name: 'Cash', opening_minor: '0', tracking_start: '2026-10-01' })
  expect(res.status).toBe(503)
  expect(await res.json()).toMatchObject({ code: 'SERVICE_UNAVAILABLE', message_key: 'errors.policy_unpublished' })
  expect((await bare.as(user).get('/v1/wallets')).status).toBe(200)
})
```

```ts
it('after the vault sleeps, a resent command replays its acknowledgement and the next one takes the next revision', async () => {
  const user = await member(client)
  const key = crypto.randomUUID()
  const body = { id: crypto.randomUUID(), name: 'Cash', opening_minor: '100000', tracking_start: '2026-10-01' }
  const first = await (await client.as(user).post('/v1/wallets', body, { key })).json()
  await evictAllDurableObjects()
  expect(await (await client.as(user).post('/v1/wallets', body, { key })).json()).toEqual(first)
  const next = await (await client.as(user).post('/v1/wallets', { ...body, id: crypto.randomUUID() })).json()
  expect(BigInt(next.committed_revision)).toBe(BigInt(first.committed_revision) + 1n)
})

it('twenty writes at once commit in one order with contiguous revisions', async () => {
  const user = await member(client)
  const acks = await Promise.all(Array.from({ length: 20 }, () =>
    client.as(user).post('/v1/wallets', { id: crypto.randomUUID(), name: 'W', opening_minor: '0', tracking_start: '2026-10-01' }).then((r) => r.json())))
  const revisions = acks.map((a) => Number(a.committed_revision)).sort((a, b) => a - b)
  expect(revisions).toEqual(revisions.map((_, i) => revisions[0] + i))
})

it('the same command sent twice at once is committed once', async () => {
  const user = await member(client)
  const key = crypto.randomUUID()
  const body = { id: crypto.randomUUID(), name: 'Cash', opening_minor: '0', tracking_start: '2026-10-01' }
  const [a, b] = await Promise.all([0, 1].map(() => client.as(user).post('/v1/wallets', body, { key }).then((r) => r.json())))
  expect(a).toEqual(b)
  expect(await runInDurableObject(vaultOf(user), (_v, s) => s.storage.sql.exec('SELECT count(*) AS n FROM command_receipts WHERE command_id = ?', key).one().n)).toBe(1)
})
```
  - `wallets.test.ts`: port every `it` in `apps/api/src/wallets/wallets.integration.spec.ts` (15), under the same not-applicable rule. Add:

```ts
it('a wallet name counts Thai code points as the API does: 80 accepted, 81 refused on name', async () => {
  const user = await member(client)
  const name80 = 'ก่'.repeat(40)
  expect((await client.as(user).post('/v1/wallets', { id: crypto.randomUUID(), name: name80, opening_minor: '0', tracking_start: '2026-10-01' })).status).toBe(201)
  const res = await client.as(user).post('/v1/wallets', { id: crypto.randomUUID(), name: `${name80}ก`, opening_minor: '0', tracking_start: '2026-10-01' })
  expect(res.status).toBe(422)
  expect((await res.json()).fields).toHaveProperty('name')
})
```

- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/commands.test.ts test/workers/wallets.test.ts`. Expected: failures on assertions (wallet routes answer 404). Record the counts.

- [ ] **Step 3: Implement the protocol.**
  - `runCommand` ports `CommandExecutor.run` (`apps/api/src/commands/command-executor.ts`): it computes the UUID target check and the digest before the transaction, then runs the seven steps inside one `c.storage.transactionSync(() => …)` with no `await`.
  - Inside the block, `assertSession(c)` and (for `policy: 'current'`) `assertPolicyAccepted(c)` run again.
  - `appendChanges` ports `ChangeWriter.append`, reusing `changeGroupBytes` from `@api/sync/change-writer` and its validation: 1 to 10,000 changes, and 413 `COMMAND_TOO_LARGE` over `MAX_CHANGE_GROUP_BYTES`.
  - It bumps `sync_state.revision`, then inserts one `entity_changes` row per change, with `group_bytes` on ordinal 0. Then it upserts `entity_heads` with `ON CONFLICT (entity, entity_id) DO UPDATE … WHERE version < excluded.version AND state <> 'purged'`, and checks that every head moved.
  - The audit row writes `session_id = claims.sessionId` and `client_id = claims.clientId`.

- [ ] **Step 4: Implement wallets.** Port `WalletsService` and `WalletsRepository` (`apps/api/src/wallets/`) for list, get, create, update (rename and opening balance), archive and unarchive. Use their validation, version rules, snapshots and DTOs, with balances from `walletBalances`.

- [ ] **Step 5: Run them and see them pass.** Expected: all ported and new cases pass.

- [ ] **Step 6: Mutation check.**
  - Drop the digest comparison on replay: the 409 mismatch case fails.
  - Run the schema-version check after `mutate`: the case `422 before anything is written` fails.
  - Remove the policy recheck inside the block: `writes wait for the current terms` fails.
  - Make `appendChanges` reuse the current revision: the contiguous-revisions test fails.

- [ ] **Step 7: Gate, receipt, commit.** Commit: `git commit -m "Run the v1 command protocol inside the UserVault, proven with wallets"`.

---

### Task 4: Categories

**Files:**
- Create: `src/vault/domain/categories.ts`
- Modify: `src/vault/routes.ts`, `src/v1/routes.ts`, `src/vault/commands/registry.ts`
- Test: `test/workers/categories.test.ts`

**Interfaces:**
- Consumes: `runCommand`, `requireLiveEntity`, `expectVersion` and `commandInput` (Task 3).
- Produces:
  - `listCategories(c): CategoryDto[]`, `seedBuiltins(c): CategoryDto[]`, and `createCategory`, `updateCategory`, `archiveCategory`, `unarchiveCategory(c, call): CommandAck`.
  - `categoryById(c, id): CategoryRow | undefined`, used by Tasks 5 and 6 to check references.

- [ ] **Step 1: Write the failing tests.** Port every `it` in `apps/api/src/categories/categories.integration.spec.ts` (10), under the not-applicable rule. Add:

```ts
it('built-in ids and their seed command are derived exactly as the API derives them', async () => {
  const user = await member(client)
  const seeded = await (await client.as(user).post('/v1/categories/builtins')).json()
  expect(seeded.map((c: { builtin_key: string }) => c.builtin_key)).toEqual(BUILTIN_CATEGORIES.map((b) => b.key))
  for (const c of seeded) expect(c.id).toBe(derivedUuid(user.sub, 'builtin-category', c.builtin_key))
  const status = await (await client.as(user).post('/v1/commands/status', { command_ids: [derivedUuid(user.sub, 'seed-builtin-categories', ...BUILTIN_CATEGORIES.map((b) => b.key))] })).json()
  expect(status.statuses[0].state).toBe('known')
})
```

- [ ] **Step 2: Run it and see it fail.** Run: `npm run test:edge:workers -- test/workers/categories.test.ts`. Expected: failures (404). Record the counts.
- [ ] **Step 3: Implement** `categories.ts`, porting `CategoriesService` (`apps/api/src/categories/categories.service.ts`), including the seed's retry-on-race loop as a single synchronous pass. Inside one vault call there is no race, so a second seed finds every key present and replays.
- [ ] **Step 4: Run it and see it pass.**
- [ ] **Step 5: Mutation check.**
  - Change the derivation label `'builtin-category'`: the new test fails.
  - Allow `label` and `builtin_key` both null: the ported validation case fails.
- [ ] **Step 6: Gate, receipt, commit.** Commit: `git commit -m "Add categories and built-in seeding to the UserVault"`.

---

### Task 5: Transactions, balances and the golden diary

**Files:**
- Create: `src/vault/domain/transactions.ts`
- Modify: `src/vault/reads/balances.ts`, `src/vault/routes.ts`, `src/v1/routes.ts`, `src/vault/commands/registry.ts`
- Test: `test/workers/transactions.test.ts`, `test/workers/money-hardening.test.ts`, `test/workers/golden-diary.test.ts`

**Interfaces:**
- Consumes: wallets (Task 3), `categoryById` (Task 4) and the command helpers (Task 3).
- Produces:
  - `getTransaction(c, id): TransactionDto`, and `createTransaction`, `updateTransaction`, `deleteTransaction`, `restoreTransaction(c, call): CommandAck`.
  - `transactionRow(c, id): TransactionRow | undefined`, used by Task 8's purge.

- [ ] **Step 1: Write the failing tests.**
  - Port every `it` in `apps/api/src/transactions/transactions.integration.spec.ts` (17) and `money-hardening.integration.spec.ts` (15) into their files, under the not-applicable rule.
  - Port `reconciliation.integration.spec.ts` (5) into `golden-diary.test.ts`, importing `GOLDEN_START`, `GOLDEN_WALLETS`, `GOLDEN_RECORDS`, `GOLDEN_BALANCES` and `GOLDEN_TOTALS` from `@api/transactions/fixtures/golden-diary`. The golden case must end with:

```ts
expect(Object.fromEntries(wallets.map((w: { name: string; balance_minor: string }) => [w.name, w.balance_minor]))).toEqual({ Cash: GOLDEN_BALANCES.cash, 'Daily account': GOLDEN_BALANCES.daily })
```
  - In `a balance above Number.MAX_SAFE_INTEGER stays an exact decimal string`, write rows straight into the vault's `transactions` table with `runInDurableObject` wherever the API case writes through SQL. Assert that the balance equals the `BigInt` sum written as a string, and is greater than `'9007199254740991'` when compared as a `BigInt`.

- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/transactions.test.ts test/workers/money-hardening.test.ts test/workers/golden-diary.test.ts`. Record the counts.
- [ ] **Step 3: Implement.**
  - Port `TransactionsService` and `TransactionsRepository` (`apps/api/src/transactions/`): expense, income and transfer (one row); edit with `If-Match`; soft delete (`deleted_at`, head state `deleted`, outcome `deleted`); restore. Use the API's version, entity-state and validation rules.
  - Extend `walletBalances` with transfers on both sides. Read every sum as `CAST(SUM(...) AS TEXT)`.
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.**
  - Read `amount_minor` without `CAST`: the exactness case fails.
  - Count a transfer only on its source: the golden case fails.
  - Let a deleted record count toward balances: the ported delete case fails.
- [ ] **Step 6: Gate, receipt, commit.** Commit: `git commit -m "Add transactions and derived balances to the UserVault; the golden diary reconciles"`.

---

### Task 6: Budgets

**Files:**
- Create: `src/vault/domain/budgets.ts`
- Modify: `src/vault/routes.ts`, `src/v1/routes.ts`, `src/vault/commands/registry.ts`
- Test: `test/workers/budgets.test.ts`

**Interfaces:**
- Consumes: `categoryById` (Task 4) and the command helpers (Task 3).
- Produces: `getBudget(c, month: string): BudgetDto` and `putBudget(c, call): CommandAck`.

- [ ] **Step 1: Write the failing tests.** Port every `it` in `apps/api/src/budgets/budgets.integration.spec.ts` (8) and `m4-hardening.integration.spec.ts` (9), under the not-applicable rule. Wherever an API case proves the database trigger refuses limits above the overall, prove the same with a direct `runInDurableObject` insert that must throw.
- [ ] **Step 2: Run them and see them fail.** Record the counts.
- [ ] **Step 3: Implement** a port of `BudgetService` (`apps/api/src/budgets/budgets.service.ts`). A put runs in this order: delete the month's limits, write the overall, insert the limits. The Task 1 triggers check each step.
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.**
  - Drop the sublimit trigger: the direct-insert case fails.
  - Accept an income category as a limit: the ported validation case fails.
- [ ] **Step 6: Gate, receipt, commit.** Commit: `git commit -m "Add monthly budgets to the UserVault"`.

---

### Task 7: History, deleted history and summary

**Files:**
- Create: `src/vault/reads/history.ts`, `src/vault/reads/deleted-history.ts`, `src/vault/reads/summary.ts`
- Modify: `src/vault/routes.ts`, `src/v1/routes.ts`
- Test: `test/workers/history.test.ts`, `test/workers/summary.test.ts`

**Interfaces:**
- Consumes: transactions and balances (Task 5), budgets (Task 6).
- Produces: `history(c, query: unknown): HistoryPage`, `deletedHistory(c, query: unknown): DeletedHistoryPage` and `summary(c, query: unknown): SummaryDto`. The request parsers come from `@api/history/history-query`, `deleted-history-query` and `summary-query` where those exports are pure. Cursors come from `@api/history/cursor`.

- [ ] **Step 1: Write the failing tests.**
  - Port every `it` in `apps/api/src/history/history.integration.spec.ts` (6) and `deleted-history.integration.spec.ts` (7) into `history.test.ts`.
  - Port `apps/api/src/summary/summary.integration.spec.ts` (5) into `summary.test.ts`.
  - Add the money journey from `test/dispatch.db.test.ts` (`seeds built-ins, records spending, and reads it back through history, summary, budgets, status and sync`), with its sync assertions kept for Task 8. Mark it `it.todo` here and turn it on in Task 8.
- [ ] **Step 2: Run them and see them fail.** Record the counts.
- [ ] **Step 3: Implement** ports of `HistoryQuery`, `DeletedHistoryQuery` and `SummaryQuery` (with `history/totals.ts`). Keyset order is `(occurred_on, id)` as in `transactions_history_idx`, with 50 rows by default and 200 at most. Compute month bounds in JS.
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.**
  - Use `limit + 0` instead of the API's look-ahead row: the ported paging case fails.
  - Include deleted rows in the summary: a ported summary case fails.
- [ ] **Step 6: Gate, receipt, commit.** Commit: `git commit -m "Serve history, deleted history and the monthly summary from the UserVault"`.

---

### Task 8: Sync changes and retention alarms

**Files:**
- Create: `src/vault/reads/sync.ts`, `src/vault/retention.ts`
- Modify: `src/vault/user-vault.ts` (`alarm()`; reschedule after each call that committed a command), `src/vault/routes.ts`, `src/v1/routes.ts`, `test/workers/support/v1-client.ts` (add `createLunch(client, user): Promise<string>`, which creates a wallet, seeds built-ins and records one `food` expense, returning its id)
- Test: `test/workers/sync.test.ts`, `test/workers/retention.test.ts`

**Interfaces:**
- Consumes: the change log (Task 3), transactions (Task 5).
- Produces:
  - `syncChanges(c, query: unknown): SyncChangesPage`, using `@api/sync/sync-cursor` and `parseSyncRequest`. A cursor below `sync_state.pruned_through` is `410 RESYNC_REQUIRED`.
  - `type RetentionJob = 'purge' | 'prune_changes' | 'drop_digests'`.
  - `nextDue(c): Map<RetentionJob, number>`. Each job's due time comes from the data: the earliest live `deleted_at` + 30 days; the earliest superseded change + 30 days; the earliest receipt still holding a digest + 30 days.
  - `reschedule(c): number | null`, which upserts `schedule` and returns the earliest due time, or null.
  - `runDue(c): void`.
  - `UserVault#alarm(): Promise<void>`, which runs due jobs, then sets the alarm to `reschedule`, or deletes it when null.

- [ ] **Step 1: Write the failing tests.**
  - Port every `it` in `apps/api/src/sync/sync-query.integration.spec.ts` (13) and `sync-api.integration.spec.ts` (5) into `sync.test.ts`, and turn on the Task 7 money journey.
  - Port from `apps/api/src/privacy/retention.integration.spec.ts`:
    - `purged_transactions_are_not_resurrected_by_receipts`
    - `a deleted record stops counting at once and can be undone within 30 days; nothing is purged early`
    - `tombstones reach delta readers, older cursors resync` (the snapshot half goes to 1B)
    - `drops receipt digests after the outbox lifetime: a replay is refused and never re-run; status still answers`
    - `removes a superseded change that sat below the retention line (S1 change log)`
  - Drive time by setting `vault.clock` through `runInDurableObject`, and fire alarms with `runDurableObjectAlarm`. Add:

```ts
const DAY = 86_400_000
const t0 = Date.parse('2026-10-25T00:00:00.000Z')
const setClock = (user: TestUser, at: number) => runInDurableObject(vaultOf(user), (v: UserVault) => { v.clock = () => new Date(at) })
const headState = (user: TestUser, id: string) => runInDurableObject(vaultOf(user), (_v, s) => s.storage.sql.exec('SELECT state FROM entity_heads WHERE entity_id = ?', id).one().state)

it('a deleted record is purged by the alarm 30 days later, and the alarm follows the earliest job', async () => {
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
  const user = await member(client)
  await setClock(user, t0)
  await createLunch(client, user)
  await setClock(user, t0 + 31 * DAY)
  await runDurableObjectAlarm(vaultOf(user))                // drops the receipt digests, the only due job
  expect(await runInDurableObject(vaultOf(user), (_v, s) => s.storage.getAlarm())).toBeNull()
})
```
- [ ] **Step 2: Run them and see them fail.** Record the counts.
- [ ] **Step 3: Implement.**
  - `syncChanges` ports `SyncQuery` (`apps/api/src/sync/sync-query.ts`): whole groups only, the 1 MiB group budget, and `next_cursor`.
  - `retention.ts` ports `gogospend_purge_entities` and the latest `gogospend_prune_account` (`apps/api/drizzle/0015_privacy.sql`), plus the receipt-digest drop.
  - Each purge or prune is its own `transactionSync` block. It writes a `purged` change group under the next revision with no receipt, as the API does. It never purges early, and it skips the vault when `account_state.status` is not `active`.
  - After each committing call and each alarm, call `void this.ctx.storage.setAlarm(due)` or `deleteAlarm()`, outside the transaction block.
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.**
  - Purge at 29 days: `nothing is purged early` fails.
  - Leave `pruned_through` unchanged: the resync case fails.
  - Always set the alarm to the purge time: the earliest-job case fails.
- [ ] **Step 6: Gate, receipt, commit.** Commit: `git commit -m "Serve sync changes from the UserVault and run retention on its alarm"`.

---

### Task 9: The vault Worker in workerd answers the parity money session like NestJS

**Files:**
- Create: `test/support/money-session.ts`, `test/support/vault-worker.ts`, `test/vault-parity.db.test.ts`
- Modify: `test/parity.db.test.ts` (import `STEPS`, `SHARED`, `shared` and `runSession` from `./support/money-session`, with no behaviour change), `test/support/wrangler-dev.ts` (`hyperdrive` becomes optional)

**Interfaces:**
- Consumes: the built `dist/jotbun_vault/wrangler.json` (Task 1) and every route (Tasks 2 to 8).
- Produces:
  - `money-session.ts` exports `SHARED`, `shared`, `STEPS: Step[]` and `runSession(send: Send, user: { binding: string }, token: () => Promise<string>): Promise<Seen[]>`. These are moved verbatim from `test/parity.db.test.ts`.
  - `startVaultWorker(o: { issuer: JwksFixture; policies: unknown }): Promise<DevWorker & { send: Send }>`. Its `send` forwards a request's method, path, query, headers and body to the dev Worker, as `startNest`'s `send` does. It seeds KV with `npx wrangler kv key put --local --persist-to <tmp> -c dist/jotbun_vault/wrangler.json --binding CONFIG config:v1 '<json>'`, then calls `startDevWorker` with:
    - `AUTH_ISSUER: issuer.issuer`, `AUTH_AUDIENCE: TEST_AUDIENCE` and `AUTH_JWKS_URL: `${issuer.issuer}.well-known/jwks.json``;
    - `COMMAND_DIGEST_KEY`, `MIN_CLIENT_VERSION_IOS: '1.0.0'`, `MIN_CLIENT_VERSION_ANDROID: '1.0.0'` and `JOTBUN_ENV: 'test'`.

- [ ] **Step 1: Refactor the shared session.** Move the session to `test/support/money-session.ts`. Run: `npm run test:edge:db -- test/parity.db.test.ts`. Expected: PASS, unchanged (this is a refactor, not a RED).
- [ ] **Step 2: Write the failing test** `test/vault-parity.db.test.ts`:

```ts
beforeAll(async () => {
  edge = await startEdge()                      // PostgreSQL + the synthetic JWKS issuer
  nest = await startNest(edge)                  // the reference
  const policies = await (await nest.send(new Request(`${BASE}/v1/policies`))).json()
  vault = await startVaultWorker({ issuer: edge.issuer, policies })
}, 120_000)

it('the vault Worker answers the money session exactly like the NestJS v1 API', async () => {
  const nestUser = await edge.fx.signUp()
  const vaultUser = { sub: randomUUID(), sid: randomUUID(), binding: 'unused' }
  const vaultToken = () => {
    const now = Math.floor(Date.now() / 1000)
    return edge.issuer.sign({ iss: edge.issuer.issuer, aud: TEST_AUDIENCE, sub: vaultUser.sub, sid: vaultUser.sid, iat: now, exp: now + 300 })
  }
  const nestRun = await runSession(nest.send, nestUser, () => edge.issuer.accessToken({ sub: nestUser.who.subject }))
  const vaultRun = await runSession(vault.send, vaultUser, vaultToken)
  const a = normalizer(shared), b = normalizer(shared)
  const differences = STEPS.flatMap((step, i) => {
    const n = { ...nestRun[i], body: a(nestRun[i].body) }, v = { ...vaultRun[i], body: b(vaultRun[i].body) }
    return JSON.stringify(n) === JSON.stringify(v) ? [] : [{ step: `${i + 1}. ${step.name}`, nest: n, vault: v }]
  })
  expect(differences).toEqual([])
  expect(STEPS.length).toBe(49)
})

it('isolates people in the runtime too: one person cannot read another person’s wallet', async () => {
  const headers = async (sub: string, sid: string) => {
    const now = Math.floor(Date.now() / 1000)
    return { 'x-gogospend-client': 'ios/1.0.0', authorization: `Bearer ${await edge.issuer.sign({ iss: edge.issuer.issuer, aud: TEST_AUDIENCE, sub, sid, iat: now, exp: now + 300 })}` }
  }
  const [a, b] = [randomUUID(), randomUUID()]
  await vault.send(new Request(`${BASE}/v1/me/policy-acceptances`, { method: 'POST', headers: { ...(await headers(a, randomUUID())), 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'terms', version: 1 }) }))
  const wallet = randomUUID()
  const created = await vault.send(new Request(`${BASE}/v1/wallets`, { method: 'POST', headers: { ...(await headers(a, randomUUID())), 'content-type': 'application/json', 'idempotency-key': randomUUID(), 'x-gogospend-command-schema': '1' }, body: JSON.stringify({ id: wallet, name: 'Cash', opening_minor: '0', tracking_start: '2026-10-01' }) }))
  expect(created.status).toBe(201)
  const peek = await vault.send(new Request(`${BASE}/v1/wallets/${wallet}`, { headers: await headers(b, randomUUID()) }))
  expect(peek.status).toBe(404)
  expect((await peek.json()).code).toBe('NOT_FOUND')
})
```
  - In `test/vault-route-coverage.test.ts`, add `expect(VAULT_PENDING_ROUTES).toEqual([])`.
- [ ] **Step 3: Run it and see it fail.** Run: `npm run build:edge && npm run test:edge:db -- test/vault-parity.db.test.ts`. Expected: listed differences, or a startup failure before the KV seeding exists. Record which.
- [ ] **Step 4: Make it pass.** Fix each listed difference in the vault, never in the session or the normalizer. A difference that comes from sign-in (§6.6 "apart from sign-in") is the only kind that may be accepted, and only with the owner's yes recorded in the receipt. None is expected: the money session's sign-in-adjacent steps (`me with pending terms`, `sign out`, `after sign out`) have vault equivalents from Task 2.
- [ ] **Step 5: Run it and see it pass.** Expected: no differences, 49 steps.
- [ ] **Step 6: Mutation check.**
  - Change one status in `VAULT_V1_ROUTES` (wallet create 201 to 200): the parity test lists that step.
  - Drop `x-content-type-options` from the vault replies: the envelope case in Task 2 fails.
- [ ] **Step 7: Gate, receipt, commit.** Commit: `git commit -m "Prove the UserVault Worker answers the v1 money session exactly like the NestJS API"`.

---

### Task 10: CI, docs and the phase 1A receipt

**Files:**
- Modify: `.github/workflows/backend.yml` (in the edge steps, after `npm run test:edge`, add `- run: npm run test:edge:workers`), `scripts/ci/backend-workflow.test.mjs` (expect the new step)
- Modify: `apps/edge/README.md`:
  - add a `jotbun-vault` row to "The Workers": `wrangler.vault.jsonc`, the account, policy, money and sync routes on the UserVault, no logins, and the secret `COMMAND_DIGEST_KEY`;
  - add rows for `test:edge:workers` and `vault-parity` to "Tests";
  - add a line that `AUTH_ISSUER`, `AUTH_AUDIENCE` and `AUTH_JWKS_URL` point at the issuer (Better Auth from 1C).
- Modify: `docs/implementation/premium-progress.md` (the closing 1A receipt: what is served by the vault, what is deferred to 1B, the not-applicable list collected from Tasks 3 to 8, mutants, and SKIPPED hosted checks)
- Test: `scripts/ci/backend-workflow.test.mjs`

- [ ] **Step 1: Write the failing test.** In `scripts/ci/backend-workflow.test.mjs`, assert that the edge steps run in this order: `install:edge`, `typecheck:edge`, `test:edge`, `test:edge:workers`, `build:edge`, `test:edge:db`.
- [ ] **Step 2: Run it and see it fail.** Run: `npm run test:ops`. Expected: the new assertion fails.
- [ ] **Step 3: Add the CI step and the docs.**
- [ ] **Step 4: Run it and see it pass.** Run `npm run test:ops`, then the edge gate. The workflow itself has not run on GitHub; record it as SKIPPED (no push without the owner).
- [ ] **Step 5: Receipt, commit, review.** Commit: `git commit -m "Run the Workers-runtime tests in CI and record the phase 1A receipts"`. Then run the independent read-only review of the whole 1A range (handover §4 step 8), and fix its findings test-first.

---

## Self-review notes (for the executor)

- **Spec coverage for 1A:**
  - §6.2 identity, schema, migrations, commands, reads, deletes and retention, and alarms: Tasks 1 to 8. Full resync goes to 1B.
  - §6.5: the protocol is unchanged and the vault is the account lock (Task 3). Pokes go to 1D.
  - §6.6 phase 1 acceptance: the money session (Task 9) and the dispatch suite cases (Tasks 2 and 3). The files session goes to 1B.
  - §6.11: names come from tokens, and rate limits are in place (Task 2).
  - §6.14: Workers-runtime tests with eviction (Tasks 1, 3 and 8) and CI (Task 10).
  - C12: Task 2.
- **Not in 1A, on purpose:** Better Auth and sessions as devices (1C); R2, Workflows, Queues and the parser (1B); PostHog (1D); every new column for currency, trips or slips (phases 3 to 5, per C2).
