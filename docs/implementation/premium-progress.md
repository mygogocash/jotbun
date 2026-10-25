# Premium, AI and edge progress

Receipts for the [premium, AI and edge plan](../superpowers/plans/2026-10-24-jotbun-premium-ai-edge.md). The owner asked for it on 24 October 2026; the decisions (D12–D22) and their reasons are in the plan's §1.

**Where things stand:**
- **Built and verified locally:**
  - the backend on Cloudflare in `apps/edge`: every v1 route, AI and the GoGoCash catalogue on the TanStack Start Worker, the API's job, security and deletion workers as Workers of their own, and import parsing in a Cloudflare Container built from the API's release image;
  - migration 0019;
  - the shared contracts;
  - the app's premium layer: haptics, Tell Bun, Ask Bun, the daily note, the cashback card and the Thai everyday categories;
  - eight catalogue sections for the companion area, checked in the browser in Thai, light and dark.
  - the Mobbin research (plan §7, through the Mobbin connector) and its changes: Ask Bun's "can get things wrong" line, follow-up questions and settings link; the consent sheet's check-before-saving line; the slip beside Tell Bun's draft; "How cashback works". Mobbin holds no Thai apps, so Thai specifics rest on the plan's §2 findings.
- **SKIPPED:**
  - hosted Cloudflare resources: wrangler is signed in to a GoGoCash account, but deploying waits for the owner to ask (handover rule), and no hosted PostgreSQL exists yet;
  - the parser container on Cloudflare (its image builds and passes the release smoke locally; its entry is proven end to end in Node);
  - live Claude calls (no API key on this machine);
  - real-device haptics;
  - E2 screenshot approval of the companion area (the sections exist; the owner's approval does not).

## E: the edge backend (`apps/edge`)

- **Stack:**
  - TanStack Start 1.169.4 with the Cloudflare Vite plugin 1.65.0 and Vite 8.3.5;
  - wrangler 4.152.0;
  - Hyperdrive with `pg` 8.23.1;
  - R2, Queues, Cron Triggers and a Container across four Worker configs (`wrangler.jsonc`, `wrangler.jobs.jsonc`, `wrangler.security.jsonc`, `wrangler.deletion.jsonc`), built together through the plugin's auxiliary Workers.
- **Install:** its own lockfile. Installed in the root workspace, wrangler's `miniflare` hoisted `sharp` and moved the API's pinned Linux bindings (`lockfile-bindings.test.mjs` failed), so the root workspaces are now listed explicitly and the edge installs alone.
- **Reuse:** the API's domain modules are imported unchanged. `api-seams.ts` swaps `@nestjs/*` for no-op stand-ins at build time; oxc compiles the legacy decorators. `container.ts` wires the object graph as the Nest modules do.
- **Database:** a request-scoped pool facade (AsyncLocalStorage) gives each request its own pool, closed before the response leaves, because Workers cannot share sockets across requests.
- **Readiness:** `/ready` is evaluated per request. The API's HealthService shares an in-flight promise across requests, which a Worker must not do.
- **Background roles (D21):** `src/server/jobs/roles.ts` runs the API's job, security and deletion workers per Cron Trigger or queue wake-up, each Worker with only its own logins and secrets. Routes that queue work wake their role after the response (`waitUntil`).
- **Import parsing (D22):** `apps/api/src/imports/parse-worker.ts` (new) claims `import_parse` only and exits when idle. It is in the release graph and the release smoke, and the jobs Worker starts it in the release image as a Container.
- **Runtime gaps found in workerd:** Workers do not implement `redirect: "error"`, which the Auth0 Management client uses. Sign-in bootstrap and every maintenance call would have failed on Cloudflare. `src/server/http/fetch.ts` emulates it as the Fetch standard defines it; `test/workerd-roles.db.test.ts` fails without it (sabotage-checked). The API's `*.client.ts` Auth0 clients are let through TanStack Start's client-file rule by exact path.
- **Storage:** `src/server/storage/r2-object-store.ts` implements the API's `ObjectStore` on the R2 binding, interoperable with the S3 adapter (the digest is `sha256` custom metadata).

| Suite | Result |
| --- | --- |
| `test/route-coverage.test.ts` | Every NestJS v1 route is ported; none is forwarded (4 checks + edge-only shadowing). Mutation-checked: a dropped forward, a changed access class and a POST status falling back to 201 are each caught; a PATCH without `status` is not a mutation (PATCH defaults to 200). |
| `test/dispatch.db.test.ts` | 25 passing: envelope, pipeline order (426 → 401 → session → policy), commands, replay and mismatch, stale If-Match, RLS, the money journey, bodies, gates, forwarder. Sabotage checks: removing the client-version check fails 2 tests. Removing the guard's policy check failed nothing at first, because the executor re-checks inside the transaction. A test now pins that the guard answers before body validation, and that sabotage fails it. |
| `test/parity.db.test.ts` | The built NestJS v1 server and the edge run one 49-step session on one database. Every status, key header and normalized body is identical, across 200, 201, 204, 400, 401, 403, 404, 409 and 422. Sabotage: answering policy acceptance with 200 instead of 204 is caught at step 4. |
| `test/parity-auth.db.test.ts` | 37 steps, identical on both: challenges, ID-token bootstrap (Auth0 Management fake), proofs, linking, global logout, deletion and its receipt, signed provider events (applied, duplicate, too large, malformed). Each phase has its own account, because sign-in steps are limited to 10 per identity a minute. Sabotage: a receipt answering 403 instead of 404 is caught at two steps. |
| `test/parity-files.db.test.ts` | 44 steps, identical on both: snapshot requests and status, export proofs and requests, uploads (types, names, empty, replay), status and preview, review, freeze and confirm validation, receipt retain, replace and remove. |
| `test/jobs.db.test.ts` | 7 passing, each role run as its Worker runs it: a snapshot built and served chunk by chunk with matching digests; an export streamed with its length and a UTF-8 byte-order mark, and a tampered file refused; the sweep with no error line; a provider revocation after global logout; a deletion purged with its receipt `completed`; an upload parsed by the container's entry, then reviewed, frozen and confirmed into the diary. |
| `test/workerd-roles.db.test.ts` | 4 passing in `wrangler dev` (workerd): sign-in through the Auth0 profile check; the jobs, security and deletion Workers' Cron runs, the jobs Worker sharing R2 with the HTTP Worker. |
| `test/workerd.db.test.ts` | The built Worker in `wrangler dev` (workerd). `/live`, `/ready` through Hyperdrive (503 without readiness receipts, as the API), the trust page, a signed-in money session, RLS isolation, an unserved route 404: 6 passing. |
| `test/ai.db.test.ts` | 17 passing with a scripted model:<br>• consent and the notice version;<br>• preferences under RLS;<br>• grounded drafts with `claude-opus-5-5`, `fallbacks: "default"` and `server-side-fallback-2026-07-01`, and no account id, binding, subject or balance in the request;<br>• invented amounts dropped;<br>• rules fallback on refusal, error or an empty answer;<br>• no AI configured;<br>• the daily limit (429, count stays at the limit);<br>• slips;<br>• the note grounded or replaced by facts;<br>• Ask Bun's tool loop, ungrounded answers and bad tool input;<br>• figures worded in the question's language ("อาหาร 1–29 ต.ค. 2569"), not as tool input. Sabotage: restoring the old `expense 2026-10-01…` labels fails it. |
| Unit (`npm run test:edge`) | 114 passing: request parsing (the 8 KiB raw body too), route matching, the Workers fetch, the R2 store contract on Miniflare's R2 (the API's contract cases; sabotage: dropping the precondition fails both never-overwrite cases), the sentence parser (Thai number words, "ห้าง" is not five, "5km" is not 5,000), grounding, draft sanitizing, plain facts, figure labels (Buddhist-era years in Thai), the cashback catalogue. |

Migration 0019 (`ai_preferences`, `ai_usage`, owner RLS, cascade on account deletion) passes the API's own `migrations.integration.spec.ts`: RLS on every table, Drizzle matches the SQL, repeatable. The full API suites still pass: 945 unit (the parse worker's spec added 3) and 694 PostgreSQL. The release image builds with the parse worker in its release graph, and its smoke passes: every process, the parse worker included, loads the contracts and fails closed at its first database connection.

## A: the app's premium layer

- **A1 Haptics:**
  - The engine has new verbs: light, rigid, warning, and a three-beat celebrate.
  - Twelve new moments in `motion.haptic`.
  - A Haptics setting (On, Subtle, Off) that `playHaptic` applies everywhere.
  - Wired into Keypad, TypeSwitch, the chips, DateChip, TabBar, UndoBar, FilterChips, Quick add (success online, a light tap when kept on the phone, error), delete and restore, the budget 80% and 100% crossing (session memory, once per level and month) and the good-week celebration (once per ISO week).
  - The sign-out erase forgets the setting.
- **A2 Thai and SEA ease:**
  - The "Thai everyday" pack (family support, merit making, delivery, phone and internet, pets, lottery; money from family) as ordinary custom categories, skipping any the person already has in either language.
  - Thai dates already showed Buddhist-era years, so no setting was needed.
  - Simple mode was not built: Dynamic Type up to AX5 (R8) already enlarges every screen.
- **A3 AI companion:**
  - The consent sheet.
  - Tell Bun in Quick add: typed sentences work offline through the shared rules; slips need AI help.
  - Ask Bun (`/spend/ask`), with the figures each answer used.
  - Settings controls with today's uses left.
- **A4 Daily love:**
  - Bun's daily note on Home, kept 2 hours per day and language so visits spend no new AI use.
  - The good-week celebration.
  - "Often logged" chips in Tell Bun (Mobbin: Lifesum): an entry repeated at least twice in the last 60 days is one tap from a draft dated today, worked out on the phone with no AI use.
  - Rotating reminder wording waits for an owner decision (see below).
- **A5 GoGoCash bridge:**
  - A count of the month's purchases at cashback shops, never a baht figure (the rule the legacy screen already wrote down).
  - Shown after 7 logged days, asked once, "No thanks" remembered.
  - "Why am I seeing this?", and Open GoGoCash with no data attached.

Gate after these changes (24 October 2026): `typecheck:app` and `typecheck:routes` pass; `test:app` 28, `test:unit` 682 and `test:render` 1,583 passing (83 files, the catalogue's 525 included); `export:web` builds; `catalogs.test.ts` passes. The edge gate on the same tree: `typecheck:edge`, 93 unit, `build:edge`, 49 PostgreSQL, and the 7 CI script tests. Every new string is in English and Thai; Vietnamese falls back to English, as decided.

## 1A: the UserVault core

Phase 1A moves each person's ledger into one SQLite Durable Object, the UserVault, as the spec's §6.2 describes (`docs/superpowers/specs/2026-10-25-jotbun-bun-wallet-cloudflare-design.md`; the phase plan is `docs/superpowers/plans/2026-10-25-jotbun-p1a-vault-core.md`). Task 1 builds the Workers-runtime test harness, the core schema and the vault's Worker. Later tasks add the HTTP front door and the command protocol.

### Task 1: Workers-runtime harness and a vault that migrates on wake

- **Status:** built and verified locally on `claude/p1a-vault-core`. Not pushed. The independent review is the controller's, after this receipt.
- **Files:**
  - Harness: `apps/edge/vitest.workers.config.ts` runs `test/workers/**` in workerd through `@cloudflare/vitest-plugin` 1.4.7, which pins wrangler 4.152.0. `apps/edge/vitest.config.ts` excludes that folder. Scripts: `test:workers` in `apps/edge` and `test:edge:workers` at the root.
  - Vault: `apps/edge/src/vault/user-vault.ts` (the class; it migrates inside `blockConcurrencyWhile` on every wake), `schema.ts` (the Drizzle schema and `VAULT_CORE_TABLES`), `migrations/0000_vault_core.sql` (handwritten SQL) and `migrations/index.ts` (the one-entry journal).
  - Worker: `apps/edge/wrangler.vault.jsonc` (`jotbun-vault`, the `VAULT` binding, the `CONFIG` KV namespace), `apps/edge/src/roles/vault.ts` (answers `GET /live` only), and the auxiliary Worker entry in `apps/edge/vite.config.ts`.
  - Types: `apps/edge/src/cloudflare-workers.d.ts` declares the Durable Object, SQL and KV names the vault uses. `apps/edge/tsconfig.json` loads the plugin's `cloudflare:test` types and includes the new config.
  - Test: `apps/edge/test/workers/vault-schema.test.ts`, 5 tests.
  - Dependency: `@cloudflare/vitest-plugin` 1.4.7, exact, in `apps/edge/package.json`. The lockfile gains 35 lines (the plugin, its own `zod` 4.6.5 and `cjs-module-lexer`) and no other change. One wrangler (4.152.0) and one `workerd-linux-64` entry.
- **RED to GREEN:**
  - RED, first run (no `src/vault/schema.ts`): the file failed to load, `Cannot find module '../../src/vault/schema'`. 0 tests ran.
  - RED, second run (an empty `src/vault/schema.ts` placeholder, so each test reaches its own failure): 5 failed, 0 passed. Four failed on `src/roles/vault.ts does not export a UserVault Durable Object`, three as thrown errors and the foreign-key test as an assertion, since it received that error where it expected `/FOREIGN KEY/`. The schema test failed on `Object.values(vaultSchema)` being undefined.
  - GREEN: 5 passed, 0 failed.
- **Mutation check (brief Step 7):** checksums recorded, originals backed up outside the repo, each mutant applied in place, the focused test run, the file restored and its checksum compared.
  - Drop the entity-head forward trigger: 1 failed (the last test: `[]` resolved where the test expected a rejection), 4 passed. As the brief expects.
  - Raise the journal `when`, as the brief words it: 5 passed, so not caught. Within one run the migrator compares the stored `when` with the journal written in that same run, so a constant change is invisible.
  - Migration re-runs on every wake (a `when` that changes per wake, which is the failure the brief means): the second test fails (`does not migrate again after it sleeps`), because the re-run rolls back. Caught.
  - Restored checksums match the recorded ones: `0000_vault_core.sql` 5b21f92c, `index.ts` ae544442, `user-vault.ts` c9bc495b.
  - A trailing breakpoint, left by one of my edits, rolled back every test. It was found, reverted, and is not counted as a mutant.
- **Gate** (repo root, after `npm run db:v1:up` and `npm run build -w gogospend-api`):
  - `typecheck:edge`: passes.
  - `test:edge`: 115 passed (7 files), the same as the baseline.
  - `test:edge:workers`: 5 passed.
  - `build:edge`: passes. `apps/edge/dist/jotbun_vault/wrangler.json` exists with the `VAULT` class binding, the migration tag and the `CONFIG` namespace. The bundle has no PostgreSQL or `@api` imports.
  - `test:edge:db`: 62 passed (8 files), the same as the baseline.
- **Deviations:**
  - The test imports `expect` and `it` from `vitest`. The brief's text uses them as globals, which this config does not enable, and the edge's other tests import them.
  - `tsconfig.json` `types` gained `@cloudflare/vitest-plugin/types`, the entry that declares `cloudflare:test`. Those declarations name some Workers globals this project does not declare, and `skipLibCheck` hides them.
  - `cloudflare:workers` types `env` as `Cloudflare.Env`, with `VAULT` and `CONFIG`, rather than `Record<string, unknown>`, because the test reads `env.VAULT` without a cast. `Cloudflare.Env` still extends `Record<string, unknown>`, so the HTTP Worker's existing casts are unaffected. The HTTP Worker has no `VAULT` binding until Phase 1B.
  - SQL rows are typed `Record<string, any>`. The brief's test compares row fields with `>` and `===`, which do not typecheck against `SqlStorageValue`.
  - `wrangler.vault.jsonc` adds `observability`, as the jobs and security configs do. The brief does not list it.
  - Schema decisions the brief leaves open:
    - The category type match and the sublimit-must-be-expense rule are triggers, so the generated `category_type` columns are gone.
    - The sublimit sum is checked after each row change (AFTER triggers), not at commit as PostgreSQL does. Task 3 must order budget writes so that no intermediate state exceeds the overall limit.
    - The entity-head guard keeps PostgreSQL's checks for the current revision and for a new entity starting at version 1 and active, as triggers.
    - Date columns are TEXT with `date(x) IS x` checks. `IS` is used because a CHECK passes on NULL.
    - Timestamps have no column default; command rows bind them from the clock.
    - `consents` keeps PostgreSQL's kind list and the rule that analytics is version 0. `account_state.not_before` is an epoch-second INTEGER with default 0. Both are read from the brief's descriptions.
    - The snapshot tables from 0010 are not ported, since the brief's core table list leaves them out. The `INCLUDE` clause on the groups index is dropped, because SQLite has none.
  - Migrator finding: a migration file that ends in `--> statement-breakpoint` makes the Durable Object's SQL API roll back the whole migration. The migrator's catch hides the original error behind `DrizzleError: Rollback`, so the failing statement was found by running the same chunks through Node's SQLite. Its first real finding was that SQLite rejects a `BEFORE INSERT OR UPDATE` trigger, because a trigger takes one event.
- **SKIPPED (hosted):** no Cloudflare resource was created, and `jotbun-vault` was not deployed. The KV namespace id is a local placeholder, as the Hyperdrive ids in `wrangler.jsonc` are.
- **Notes for Task 2 and later:**
  - No test covers `GET /live` in this task. Task 2's HTTP suite is the first to reach the Worker.
  - `VaultEnv` covers the Durable Object's env only. The Worker's env is `Cloudflare.Env`.
  - Task 3 must order the budget writes (see above).
  - `VAULT_CORE_TABLES` is derived from `vaultSchema`, so a new table goes into the Drizzle schema and the SQL together.
  - The migrator applies a journal entry only when its `when` is later than the stored one, so a later migration needs a later `when`.
  - Amounts and revisions are read back as `CAST(... AS TEXT)`, per §4, because the SQL API returns INTEGER as a JavaScript number.

**Fix round 1.** The task review's three findings are fixed, test first. Every table is now `STRICT` (controller ruling R16): SQLite refuses a NULL primary key and reports the column as NOT NULL, and it refuses a value of the wrong type, such as `'abc'` in an INTEGER column. The drift test accepts a primary key as not-null only when `table_info` reports NOT NULL, or when it is an INTEGER primary key, which can never be NULL but which `table_info` reports as nullable. A category's `type` and `builtin_key` are frozen by triggers on the category itself (R17), so a category in use cannot change type. A receipt's digest pair is nullable as one unit (R18, ported from the API's `0015`): both columns may be dropped 30 days after the receipt, and the receipt stays. A partial index on `committed_at` finds the receipts that still hold a digest. RED: 4 of 8 tests failed (the drift test, the NULL-key test, the immutability test and the digest test). GREEN: all 8 pass, the five existing tests included. Mutants: dropping STRICT from `wallets` fails the NULL-key test, and dropping the type trigger fails the immutability test at its first assertion. Both were restored, and the checksums match. The edge gate passes: typecheck, unit 121 of 121, workers 29 of 29, build, and database 62 of 62.

### Task 2: The vault-backed front door

- **Status:** built and verified locally on `claude/p1a-vault-core`, on top of Task 1 (bb46fa8). Not pushed. The independent review is the controller's, after this receipt.
- **Files:**
  - Worker, `apps/edge/src/v1/`: `protocol.ts` (the call and reply types, plain data only), `routes.ts` (the vault route table: 5 ported, 24 pending, 28 deferred and 6 retired, which is all 63 declared routes), `match.ts` (`matchRoute`, moved from the PostgreSQL route table), `env.ts`, `tokens.ts` (the verifier), `config.ts` (`config:v1`, its fail-closed rules and the client minimums), `handler.ts` (`handleVaultV1`, the pipeline) and `log.ts` (one failure line with the class name only; not in the brief).
  - Vault, `apps/edge/src/vault/`: `context.ts` (`VaultContext`), `session.ts` (`ensureAccount`, `assertSession`, `revokeSession`), `policies.ts`, `rate-limits.ts` (`RateBuckets`), `replies.ts` (`okReply`, `toProblemReply`) and `routes.ts` (`VAULT_HANDLERS` for the five ported routes).
  - Task 1 files, changed as the brief allows: `src/vault/user-vault.ts` (adds `call`), `src/roles/vault.ts` (routes `/v1/*` to `handleVaultV1`, with the env) and `src/cloudflare-workers.d.ts` (R12: typed `DurableObjectStub` RPC methods and `KVNamespace.delete`).
  - PostgreSQL edge: `src/server/app/routes.ts` imports `matchRoute` from `src/v1/match` and re-exports it. The function body is unchanged; this is the brief's one change in that file.
  - Tests: `test/workers/front-door.test.ts` (17), `test/workers/config.test.ts` (4), `test/workers/support/v1-client.ts` (the test client), `test/rate-limits.test.ts` (1) and `test/vault-route-coverage.test.ts` (5).
- **RED to GREEN:**
  - RED, workers (`npm run test:edge:workers -- test/workers/front-door.test.ts test/workers/config.test.ts`): 2 files failed, 19 failed, 0 passed. Each failure is `Error: not implemented`, thrown by the RED stubs (`handleVaultV1`, `readEdgeConfig`, `createTokenVerifier`), so no case passed by accident. The stubs throw rather than answer 404, because a 404 stub would have let "a client-sent request id is ignored" pass vacuously.
  - RED, Node (`npm run test:edge -- test/rate-limits.test.ts test/vault-route-coverage.test.ts`): 2 files failed, 4 failed and 2 passed of 6. The two passing cases loop over the still-empty `VAULT_V1_ROUTES`, so they pass vacuously until the table is filled. The case that pins the five ported routes was added before this run, so an empty table cannot pass unnoticed.
  - GREEN, workers: 19 passed, 0 failed. GREEN, Node: 6 passed, 0 failed.
  - The 16 front-door cases in the first RED run were the eight ported cases, the six the brief names, and two UUID cases (a non-UUID subject is 401 UNAUTHENTICATED, a non-UUID session id is 401 SESSION_REQUIRED), which §6.4 requires.
  - Added after GREEN, each run once it was written: `an invented session id still spends the person's budget` (the mutation check, below) and `client minimums missing from both config and env answer 503 with a retry, never 426` (R13). Both pass on the final code.
- **Mutation check (brief Step 6):** the SHA-256 of each target was recorded before its mutant (`shasum -a 256`), the backup was kept outside the repo, the mutant was applied in place, the focused file was run, and the file was restored from the backup and its checksum compared. All three restored checksums match.
  - `src/vault/session.ts` (79889013): the owner comparison in `ensureAccount` skipped. 1 failed (`a call naming another person is refused by the vault, which writes nothing`), 16 passed. Caught.
  - `src/v1/config.ts` (f0f95602): an unreadable `config:v1` opens the gates. 1 failed (`an unreadable or malformed config pauses every gate scope, with a retry`), 2 passed. Caught.
  - `src/vault/user-vault.ts` (8d1b3bd1): the principal charge moved after `assertSession`. 1 failed (`an invented session id still spends the person's budget`: the valid call got 200 instead of 429), 16 passed. Caught by the new test only, as the brief predicts for the ported tests.
- **Gate** (repo root, after `npm run db:v1:up` and `npm run build -w gogospend-api`):
  - `typecheck:edge`: passes, 0 errors.
  - `test:edge`: 121 passed (9 files). The baseline was 115 in 7 files, plus the 6 Node cases in the 2 new files.
  - `test:edge:workers`: 26 passed (3 files): `vault-schema` 5, `front-door` 17, `config` 4.
  - `build:edge`: passes. `dist/jotbun_vault/` holds the `VAULT` class binding and the `CONFIG` namespace, and its bundle imports no PostgreSQL driver (no `pg`, no `drizzle-orm/node-postgres`). It does include the API's pure modules through the seams, as the brief intends.
  - `test:edge:db`: 62 passed (8 files), the baseline.
- **Deviations:**
  1. `EdgeConfig.clientVersions` is typed `Pick<ClientVersionGuard, 'check'>`, not `ClientVersionGuard`. The fail-closed guard (R13: 503 for every non-public call when minimums are missing) is not a `ClientVersionGuard`, and the API class needs minimums to construct.
  2. The invented-session test uses signed-out session ids, not random ones. The brief's premise does not hold under its own rules. A session id the vault has never seen is accepted (`signing out ends this session only` expects 200 for a fresh random sid), so random sids never fail `assertSession` and the principal ordering would be unobservable. The signed-out ids are inserted into `revoked_sessions`, so the vault refuses each call after charging the principal. The test keeps the brief's name.
  3. The ported access cases name `/v1/me`, not `/v1/wallets`, which is pending until Task 3. Their assertions are unchanged.
  4. The brief says "the five AI routes". The route table declares six: `ai-preferences` GET and PUT, `ai/parse`, `ai/slip`, `ai/note` and `ai/ask`. All six are in the deferred list, so the coverage test holds.
  5. Failure logging goes through `logFailure` (`src/v1/log.ts`), which calls `console.error` with the failure's class name. The API's `writeLog` writes to `process.stdout`, which the Worker lacks. `roles/vault.ts` sets the API's log sink to `console.log`, so the shared `errorResponse` logging works too.
  6. The key-source classifier mirrors `Auth0KeySource.isUnavailable` but has no 5-second back-off, because jose's remote key set has its own cooldown. A key-source outage still answers 503 with a 5-second retry, as the API does.
  7. A misconfigured token verifier (a missing `AUTH_ISSUER`, `AUTH_AUDIENCE` or `AUTH_JWKS_URL`, or a non-https JWKS URL outside a local or test environment) answers 503 with a 30-second retry, never 500.
  8. `GET /v1/policies` is answered in the Worker from the latest version of each kind, sorted by kind, as the brief says. The vault receives the full version list, because the required-version rule also needs earlier required versions.
  9. `src/v1/log.ts` is a file the brief does not list.
- **SKIPPED (hosted):** nothing deployed. No cloud resource was created, and `jotbun-vault` has no deployment. The KV id is the local placeholder from Task 1.
- **Notes for Task 3 and later:**
  - A handler runs after the vault's checks and returns `okReply(call.route, body)`. The status comes from `VAULT_V1_ROUTES`, so no handler repeats it. A route moves from `VAULT_PENDING_ROUTES` into `VAULT_V1_ROUTES` with its `vault` id and a handler in `VAULT_HANDLERS`, and the coverage test then checks it.
  - `VaultContext.registry` is an empty `CommandRegistry` (R4). Task 3 swaps in its registry where `UserVault.built()` creates it. The digester is built there too, so a missing `COMMAND_DIGEST_KEY` fails every vault call.
  - `RateBuckets` charges the principal by account and the session budgets by session id. Read or write follows the route's method, so GET is a read.
  - Rate windows read `UserVault#clock`, so a test that makes many calls in a row must freeze it, as the invented-session test does.
  - `handleVaultV1` reads `config:v1` on every request, with no cache.
  - The test client copies the harness's `UserClient` and `CommandOptions`, and sends the command headers the same way the harness does.
- **Fix round 1 (review findings):** two Important findings, each fixed test first. (1) A token's `iat` was unchecked against the clock, so a token issued up to 30 days ahead, or with `iat` after `exp`, was accepted for that long. jose now gets the API's 30-second `clockTolerance` and a `maxTokenAge` of 930 seconds, `exp <= iat` is refused, and any claim jose rejects is 401 UNAUTHENTICATED. (2) A policy version with a future `published_at` was listed and accepted. A `published_at` that is not an ISO date-time makes the config malformed (every gate paused, policies null), and the Worker drops versions not yet in force (`livePolicies`) once per request, before both the public list and the vault call. RED: 4 of 25 cases failed in `front-door.test.ts` and `config.test.ts`. GREEN: 25 passed. Mutants: dropping `maxTokenAge` fails the future-iat case, and passing unfiltered policies to the vault fails the pending assertion of the scheduled case. Both were restored with matching checksums. Gate: workers 33 passed (vault-schema 8, front-door 20, config 5); the other suites are unchanged.

### Task 3: The command protocol, proven with wallets

- **Status:** built and verified locally on `worktree-agent-a0780a971e76f8022`, on top of Task 2 (`c25ea2c`). Not pushed. The independent review is the controller's, after this receipt.
- **Files:**
  - Protocol, `apps/edge/src/vault/commands/`: `registry.ts` (`buildVaultRegistry`), `executor.ts` (`runCommand`, `commandInput`, `VaultMutation`), `change-log.ts` (`appendChanges`), `receipts.ts` (`findReceipt`, `insertReceipt`, `lookupStatuses`) and `entity-state.ts` (`entityHead`, `requireLiveEntity`, `expectVersion`).
  - Wallets and reads: `apps/edge/src/vault/domain/wallets.ts` (list, get, create, update, archive and unarchive, ported from `WalletsService` and `WalletsRepository`) and `apps/edge/src/vault/reads/balances.ts` (`walletBalances` and `firstRecordOn`, the earliest record that still counts for the correction rule).
  - Changed: `src/vault/routes.ts` (six wallet handlers and `commands.status`); `src/v1/routes.ts` (seven routes move from pending into `VAULT_V1_ROUTES`, leaving 12 ported, 17 pending, 28 deferred and 6 retired, which is all 63 declared routes); `src/vault/user-vault.ts` (the registry is built once per instance by `buildVaultRegistry()`); `test/vault-route-coverage.test.ts` (the Task 3 pin); `test/workers/support/v1-client.ts` (adds `signedHeaders`); `test/workers/front-door.test.ts` (a stale comment only).
  - Tests: `test/workers/commands.test.ts` (59), `test/workers/wallets.test.ts` (36), and `test/workers/support/command-fixtures.ts`, a fixture domain in the vault's own SQLite, shaped like the API's `command-fixtures.ts` without row-level security.
  - Reused, not forked: `changeGroupBytes`, `commandHeaders`, `CommandRegistry`, `CommandDigester`, `ProblemException`, `routeId` and `stateProblem` (from `@api/commands/versioned-entity`), `MAX_CHANGE_GROUP_BYTES`, and the contracts' wallet parsers and DTO types.
- **RED to GREEN:**
  - RED, workers (`npm run test:edge:workers -- test/workers/commands.test.ts test/workers/wallets.test.ts`, with the new modules stubbed to throw): `Test Files 2 failed (2)`, `Tests 90 failed (90)`. Per file: `commands.test.ts` 58 of 58, `wallets.test.ts` 32 of 32. The wallet cases failed with `expected 404 to be 201` and similar, because the routes were not yet in the table. The command cases failed with `runCommand is not implemented yet`, or with 404 from the same route gap.
  - RED, Node (`npm test --prefix apps/edge -- test/vault-route-coverage.test.ts`): `Tests 1 failed | 4 passed (5)`. The failing case pins the twelve Task 3 routes.
  - Before GREEN, several refusal assertions were tightened from `not.toBe('ok')` to the exact refusal message, so a stub could not pass them.
  - GREEN, workers: `Tests 90 passed (90)` once the protocol and the wallet domain were written.
  - During GREEN, two expectations were corrected, neither weakened. The empty change group now asserts the API's refusal `acknowledged an entity version its change group does not contain`, because the API checks the acknowledgement before the group size. The nested-transaction case was removed (see Deviations).
  - After GREEN, one case was added: `a balance is the opening balance plus live income and transfers ...` in `wallets.test.ts`. No Task 3 path writes a transaction, so `walletBalances`' transfer and deleted-row branches and `firstRecordOn` would otherwise run untested. It passed on its first run, and it stays test-only until Task 5 writes transactions. At that point: `wallets.test.ts` 33 of 33 (36 after fix round 1).
  - GREEN, Node: `vault-route-coverage` 5 of 5.
  - Pre-review fix (R41, the command headers before the body): test first. RED: `npm run test:edge:workers -- test/workers/wallets.test.ts` gave `Tests 2 failed | 33 passed (35)`. The new PATCH case (an unknown field and no If-Match) and the new POST case (an unknown field and no Idempotency-Key) each got `UNKNOWN_FIELD` where `VALIDATION_FAILED` on `if_match` or `idempotency_key` was expected. GREEN: each wallet command calls `commandInput`, which runs `commandHeaders`, before the route id and the body, then calls `runCommand(c, { ...command, payload }, ...)`. The two worker files gave `Tests 93 passed (93)`, and the full gate passed again (below).
  - Fix round 1 (review, test first): the wallet list failed for any account with more than 100 wallets. `walletBalances` bound one parameter per wallet id, and Durable Object SQLite refuses more than 100 bound parameters, so `GET /v1/wallets` answered 500 at 101 wallets, and that failure is permanent. Under R57, `walletBalances` and `lookupStatuses` bind their id list as one JSON parameter (`IN (SELECT value FROM json_each(?))` with `JSON.stringify(ids)`). RED: `npm run test:edge:workers -- test/workers/commands.test.ts test/workers/wallets.test.ts` gave `Tests 2 failed | 93 passed (95)`: the new 101-wallet list case (`expected 500 to be 200`), and the head-moves-forward case, which reached the target check (`acknowledged an entity other than its target`) and not the head guard. The new 100-id status case passed before the change, as a boundary guard. GREEN: the same two files gave `Tests 95 passed (95)`. Mutant: one `?` per id put back in `walletBalances` gave `Tests 1 failed | 35 passed (36)`, the 101-wallet case with `expected 500 to be 200`; the file was restored and its checksum (`f61388ea…e49`) matched. The head-moves-forward case now calls `runCommand` directly with a mutation that writes nothing, because a second fixture insert would hit the table's primary key first, so the head guard in `appendChanges` refuses the group. Also: `IfMatchRule` is `Parameters<typeof commandHeaders>[1]`, `CreateOptions.during` is removed, the `runCommand` comment no longer says that a nested block is refused, the dispatch case has the brief's name, and the transaction references say Task 5. Gate: typecheck passes; test:edge 121 (9 files); test:edge:workers 124 (5 files); build:edge passes; test:edge:db 62 (8 files).
- **Mutation check (brief Step 6):** `shasum -a 256` of `src/vault/commands/executor.ts` and `src/vault/commands/change-log.ts` was recorded, the originals were backed up outside the repo, each mutant was applied in place, the focused files were run, and each file was restored and its checksum compared (OK after every restore). These runs predate the R41 fix and fix round 1. Fix round 1 changed `executor.ts` (a comment and the `IfMatchRule` type), so its checksum is now `3684315a…c827c4`; `change-log.ts` did not change.
  - Digest comparison on replay dropped (`executor.ts`): 5 failed, 86 passed (of 91). The IDEMPOTENCY_MISMATCH cases, including the named HTTP case "a resent command replays its acknowledgement; the same key with other content is 409". Caught.
  - Schema-version check moved after `mutate()` (`executor.ts`): 2 failed, 89 passed. Both are fixture cases that count mutation executions ("schema version 0 / 3 ... reserves nothing"). The named HTTP case "an unsupported command schema is 422 before anything is written" still passes, because the call's transaction rolls back the write the mutant made. Only the execution count sees it.
  - In-block policy re-check removed (`executor.ts`): 1 failed, 90 passed. The fixture case "writes need the current required policies, checked under the lock" fails. The named HTTP case "writes wait for the current terms" still passes, because `UserVault#call` already runs `assertPolicyAccepted` for `current_policy` routes (Task 2). The brief's expectation holds only at the `runCommand` level.
  - `appendChanges` does not advance `sync_state.revision` (`change-log.ts`): 47 failed, 44 passed. Includes the named "twenty writes at once commit in one order with contiguous revisions".
- **Gate** (repo root, `npm run typecheck:edge && npm run test:edge && npm run test:edge:workers && npm run build:edge && npm run test:edge:db`, exit 0):
  - `typecheck:edge`: passes.
  - `test:edge`: 121 passed (9 files), the Task 2 baseline.
  - `test:edge:workers`: 124 passed (5 files): `vault-schema` 8, `front-door` 17, `config` 4, `commands` 59, `wallets` 36 (122 before fix round 1; 120 before the R41 fix). The Task 2 receipt's "vault-schema 5" predates Task 1's fix round, which added three cases.
  - `build:edge`: passes. The vault bundle's JavaScript imports no PostgreSQL driver. Its source map names two API modules with `import type { Pool } from 'pg'`, which is erased; both were already in Task 2's bundle.
  - `test:edge:db`: 62 passed (8 files), the baseline.
- **Not applicable** (PostgreSQL roles and grants, row-level security, connection pools, isolation levels or lock waits):
  - `command-executor.integration.spec.ts`: "commit order is revision order" (two commands queued on the PostgreSQL account lock). `twenty writes at once ...` covers the property. "a mutation that passed the guard loses to a deletion committed first" is ported in sequential form: "an account marked for deletion refuses a command at the re-check and writes nothing".
  - `command-hardening.integration.spec.ts`: "the app can neither read audit rows nor rewrite receipts and changes" (grants to `gogospend_app`); "a status lookup waits for an in-flight command and then reports it" (a FOR SHARE lock wait); "replay holds even when the login defaults to REPEATABLE READ" (isolation level); "a nested owner transaction inside a mutation is refused" (a PostgreSQL connection guard; workerd nests `transactionSync` as a savepoint, and `runCommand` never nests, per R21). "a command waiting behind a global logout writes nothing" is ported in sequential form: "a command after a global logout writes nothing".
  - `wallets.integration.spec.ts`: "the database refuses a wallet row forged for another account, and any delete" (row-level security and grants).
  - `command-status.integration.spec.ts`: none.
  - Counts: the brief's counts for three specs are off. The executor spec has 18 `it` blocks (brief 17), the status spec 10 (brief 9) and the wallets spec 19 (brief 15). Across the four specs, 58 blocks are ported (two of them in sequential form) and 6 are not applicable, out of 64.
  - The ten named dispatch cases are all ported, and so are the five extra cases the brief adds: no config in KV, the vault sleeping, twenty writes at once, the same command sent twice, and the Thai name at 80 and 81.
- **Deviations:**
  1. `commandInput` takes a fourth argument, the If-Match rule (`'required' | 'forbidden' | 'optional'`). The API's `commandHeaders` needs it, and the brief's three-argument form cannot say whether If-Match is required, forbidden or optional.
  2. `runCommand` computes the target check and the digest before `assertSession`. Both are pure, so no state is read before the re-check.
  3. `entityHead`, `requireLiveEntity` and `expectVersion` are synchronous, because a vault call has no owner transaction to await. The API's are async.
  4. The status lookup takes no lock. Each Durable Object call runs to completion before the next one starts.
  5. `fixture_purchase` is a test-only table, created by the test support in the vault's SQLite. No production module knows it.
- **SKIPPED (hosted):** nothing deployed, and no cloud resource was created.
- **Notes for Task 4 and later:**
  - Register categories, transactions and budgets in `buildVaultRegistry()` in the API's construction order. The wallet block is the pattern.
  - `walletBalances` already reads `transactions`. Task 5 fills that table.
  - `runCommand` runs inside the call-level transaction. Do not nest a transaction inside it.
  - `commandInput` needs its If-Match rule as the fourth argument. Call it before the body is parsed, with an `undefined` payload, and set the payload afterwards: `runCommand(c, { ...command, payload }, ...)`, as `wallets.ts` does (R41). A payload-first call reads the body before the headers.
  - The Task 2 access cases in `front-door.test.ts` still name `/v1/me`. They could name `/v1/wallets` now. I left them, since they test the pipeline.

### Task 8a: Sync changes

- **Status:** built and verified locally on `worktree-agent-a8fd1a21889e4557d`, on top of Task 3 (`f6d1f95`). Not pushed. Task 8 is split (ruling R7): this is 8a, the delta feed. Retention, the vault alarm and the money journey are 8b and are not in this commit. The independent review is the controller's, after this receipt.
- **Files:**
  - Reader: `apps/edge/src/vault/reads/sync.ts`, `syncChanges`, a port of `SyncQuery`. It serves whole groups only, reads each candidate group's stored size before it reads any change, applies the 1 MiB group limit (`MAX_CHANGE_GROUP_BYTES`) and the 2 MiB page budget (`SYNC_PAGE_BYTES`), and returns `next_cursor` and `has_more`. A position below `sync_state.pruned_through` is `410 RESYNC_REQUIRED`. Every change is re-checked against its entity's DTO before it is served.
  - Route: `apps/edge/src/v1/routes.ts` moves `GET /v1/sync/changes` from `VAULT_PENDING_ROUTES` into `VAULT_V1_ROUTES`, with the old route's access (`bound_session`), gates (none) and status (200). `apps/edge/src/vault/routes.ts` adds its handler. The table now holds 13 ported, 16 pending, 28 deferred and 6 retired routes, which is all 63.
  - Tests: `apps/edge/test/workers/sync.test.ts` (12 cases, one for each name ported in full or in part, listed below), `apps/edge/test/vault-route-coverage.test.ts` (the pin lists the 13 ported routes), and `apps/edge/test/workers/support/command-fixtures.ts`, which adds `syncRegistry()` and an optional registry argument to `fixtureRegistry` (the one-argument form is unchanged).
  - Reused, not forked: `parseSyncRequest` (`@api/sync/sync-query`), `decodeSyncPosition` and `encodeSyncCursor` (`@api/sync/sync-cursor`), `MAX_CHANGE_GROUP_BYTES`, `SYNC_PAGE_BYTES` and `ProblemException`.
- **RED to GREEN:**
  - RED, with `syncChanges` as a typed stub that returns an empty page: `npm run test:edge:workers -- test/workers/sync.test.ts` gave `Tests 10 failed | 2 passed (12)`. All ten failures are assertions on the stub's empty page (for example `expected [] to have a length of 200`). The two that pass test code the stub does not reach: the cursor binding (pure code) and the CHECK that the retention line never passes the revision (schema).
  - GREEN, first run: `Tests 1 failed | 11 passed (12)`. The failing case was the 201-group paging, whose second page began at `'100'` instead of `'201'`. The cause was the unqualified `ORDER BY revision` in the candidate query, which sorted by the TEXT alias, so revisions sorted as strings. Fixed by qualifying each revision column (`c.revision`), as the API's SQL does. A temporary test that failed on the paging values located it and was deleted.
  - GREEN, after the fix: the same command gave `Tests 12 passed (12)`.
- **Mutation check:** the SHA-256 of `src/vault/reads/sync.ts` (GREEN) was recorded and a copy kept outside the repo. Each mutant was applied in place, the file was run, and the file was restored from the copy. Its checksum matched after every restore, and the final file is `d7de9ffe817074dad960b59e4baa105bf732ae11ccaff40a03dfb28bd47f240c`.
  - M1, no `pruned_through` check: `Tests 4 failed | 8 passed`. The four failures are the 410 cases: the malformed, foreign and future cursor case, the 30-day case, the route's `serves whole...` case and the client-behind-retention case. Caught.
  - M2, the page's change rows cut at 100, so the 500-change group is served short: `Tests 2 failed | 10 passed` (`pagination_never_splits_a_command_group` and the 200-group case). Caught by the whole-groups case, as the brief expects.
  - M3, the ORDER BY on the TEXT alias (the first GREEN bug, reintroduced): `Tests 1 failed | 11 passed` (the 200-group case). Caught.
  - M4, no planned page budget (every candidate group's rows read): `Tests 1 failed | 11 passed` (`a page reads about its byte budget`). Caught.
- **Gate** (repo root, `npm run typecheck:edge && npm run test:edge && npm run test:edge:workers && npm run build:edge && npm run test:edge:db`, after `npm run db:v1:up` and `npm run build -w gogospend-api`):
  - `typecheck:edge`: passes.
  - `test:edge`: 121 passed (9 files), the Task 3 baseline.
  - `test:edge:workers`: 140 passed (6 files), up from 128 in the merged Task 3 gate. `sync.test.ts` is 12 of them.
  - `build:edge`: passes. `dist/jotbun_vault/index.js` imports no PostgreSQL module (no `pg`, `DatabaseService` or `OwnerTx`) and bundles `src/vault/reads/sync.ts`.
  - `test:edge:db`: 62 passed (8 files), the baseline.
- **Ported in full** (9): sync-query: `pagination_never_splits_a_command_group`, `pages whole groups in revision order within the 2 MiB budget, with no gaps`, `defaults to 200 groups a page and refuses more than 1,000`, `rejects malformed, foreign and future cursors, and needs a resync below retention`, `refuses to serve a stored change that no longer matches its entity DTO`, `a cursor is bound to its account and names a revision, nothing else`, `a page reads about its byte budget, not every group the limit allows`, `the retention line can never pass the account revision`. Sync-api: `serves whole, valid change groups and refuses bad parameters`.
- **Ported in part** (3):
  - sync-query, `30-day retention drops superseded changes, keeps every head, and expires older cursors`: the 410 for a cursor below the line, and the groups above it, are ported. The prune run, the removal of superseded changes and the check that every head stays are 8b's (`retention.ts`).
  - sync-query, `a cursor from an earlier lifecycle generation needs a resync`: the vault has no lifecycle generation until 1B, so the cursor's generation is checked against the constant 0.
  - sync-api, `a client behind retention recovers: 410, then a snapshot, then deltas from its cursor`: the 410 and the deltas from the cursor are ported. The snapshot step is 1B's.
- **Not applicable** (3; PostgreSQL roles, row-level security, pools and lock waits, and a vault holds one account, with no account lock):
  - sync-query, `a read during staggered commits never skips a group committed later at a lower revision`: the test holds the account lock mid-command and reads between two commits. A vault call runs to completion inside one synchronous `transactionSync`, so no read can land between two commits.
  - sync-query, `retention skips an account whose lock is held instead of waiting for it`: a lock wait on `account_sync_state`. The vault has no such lock. Its prune run is 8b's.
  - sync-query, `retention covers every due account in one run, beyond its batch size`: a batch across accounts. A vault holds one account. Its own prune run is 8b's.
- **Deferred to 8b** (1): sync-api, `snapshots validate exactly the entities the API registers`. The check compares the vault's registry with `SYNC_ENTITY_VALIDATORS`. It needs the category, transaction and budget entities, which are not merged (Tasks 4 to 6, the brief's 8b label), and the export and import entities, which are 1B's.
- **Deferred to 1B** (2): sync-api, `requests, builds, and downloads a snapshot through short-lived grants, then continues with deltas` and `asking again while a snapshot is ready answers 200 with it`. The snapshot routes are in `VAULT_DEFERRED_ROUTES`.
- **Deviations:**
  1. Four cases use the fixture domain (`pagination_never_splits_a_command_group`, `pages whole groups in revision order within the 2 MiB budget, with no gaps`, `defaults to 200 groups a page and refuses more than 1,000`, and `a page reads about its byte budget`). They call `syncChanges` inside the call's transaction through `inVault`, not through the route. The route's registry holds only the wallet entity, so a fixture group would fail the route's DTO check. Those four therefore skip `UserVault#call`'s account, principal, session and read-budget checks. The route cases cover those checks.
  2. The lifecycle generation is the constant 0, because the vault has no lifecycle column until 1B. A cursor from another generation gets 410.
  3. The 410 case raises `sync_state.pruned_through` directly, through `sqlExec` (`runInDurableObject`), as the brief asks.
  4. `PAGE_OVERHEAD_BYTES` (1024) and the change re-check in `changeOf` are copies of `SyncQuery`'s private members. They need an `OwnerTx` to be reused, so they must stay equal to `apps/api/src/sync/sync-query.ts`.
  5. The Node pin in `vault-route-coverage.test.ts` changed in the same edit as the route move, so it has no RED run of its own.
- **SKIPPED (hosted):** nothing deployed, and no cloud resource was created.
- **Notes for 8b and later:**
  - `pruned_through` moves only when 8b's `retention.ts` prunes. Until then the 410 path runs only when a test sets the line directly.
  - Tasks 4 to 6 register categories, transactions and budgets in `buildVaultRegistry()`. The registry-parity case can then be completed once the 1B entities are also registered.
  - 1B adds the lifecycle generation. Replace the constant `GENERATION` in `reads/sync.ts`, and complete the lifecycle case.

### Task 4: Categories

- **Status:** built and verified locally on `worktree-agent-a1bb3b037cc6147fe`, on top of Task 3 (`f6d1f95`). Not pushed. The independent review is the controller's, after this receipt.
- **Files:**
  - Categories: `apps/edge/src/vault/domain/categories.ts`. It ports `CategoriesService`: `listCategories`, `seedBuiltins`, `createCategory`, `updateCategory`, `archiveCategory` and `unarchiveCategory`. It also exports `categoryById`, which Tasks 5 and 6 use to check references.
  - Schema: `apps/edge/src/vault/migrations/0000_vault_core.sql` gains three triggers on `categories` (R22), beside the Task 1 immutability triggers: `categories_id_immutable` (`BEFORE UPDATE OF id`), `categories_replace_guard` (`BEFORE INSERT`, which also refuses a built-in key another category holds, from the pre-review fix) and `categories_never_deleted` (`BEFORE DELETE`). No column changed, so the Drizzle schema did not change, and the drift test passes.
  - Protocol: `apps/edge/src/vault/commands/registry.ts` registers the `category` entity and five commands after the wallet block, with the API's kinds, outcomes, schema version 1 and policy `current`.
  - Routes: `apps/edge/src/vault/routes.ts` (six handlers) and `apps/edge/src/v1/routes.ts` (six routes move from `VAULT_PENDING_ROUTES` into `VAULT_V1_ROUTES`, with the access, gates and status of the PostgreSQL table). The table now has 18 ported, 11 pending, 28 deferred and 6 retired routes, which is all 63 declared routes.
  - Tests: `apps/edge/test/workers/categories.test.ts` (17 cases: the API spec's 10 `it` blocks, its `it.each` of 5 rows, the brief's derivation test, and a 409 for an id already in use). `apps/edge/test/workers/vault-schema.test.ts` gains three trigger tests, one `CHECK` test and, from the pre-review fix, one replace case (13 in all). `apps/edge/test/vault-route-coverage.test.ts` now pins the six category routes.
- **RED to GREEN:**
  - Typed stubs first: `domain/categories.ts` exported every function, each throwing `categories: not implemented yet`, and the tests were written against them.
  - RED: `npm run test:edge:workers -- test/workers/categories.test.ts test/workers/vault-schema.test.ts` gave `Test Files 2 failed (2)` and `Tests 20 failed | 8 passed (28)`. The 17 category cases failed on the missing routes (404 `NOT_FOUND`). Three of the 11 schema cases failed, the three new trigger tests, each "promise resolved instead of rejecting". The eight existing schema tests passed.
  - RED, Node: `npm test --prefix apps/edge -- test/vault-route-coverage.test.ts` gave `Tests 1 failed | 4 passed (5)`. The pin expected the six category routes.
  - GREEN: the workers suite gave `Tests 148 passed (148)` in six files: categories 17, vault-schema 11, wallets 36, commands 59, front-door 20 and config 5. Route coverage gave 5 of 5. The Node suite gave 121, as before.
  - Added after that GREEN, for the storage half of the brief's both-null rule: `a category has a label or a built-in key` in `vault-schema.test.ts`. Before the case existed, the database-level mutant (the `CHECK (label IS NOT NULL OR builtin_key IS NOT NULL)` on `categories` removed, with the service rule kept) passed all 28 focused cases. With the case in place, the focused run gave `Tests 29 passed (29)`. With the mutant, it gave `Tests 1 failed | 28 passed (29)`, and the failure was the new case (`promise resolved "[]" instead of rejecting`). The workers suite is 149 with it.
- **Mutation check (brief Step 5):** `shasum -a 256` was recorded for the six changed source and test files before any mutant. Each mutant was applied in place to a file backed up outside the repo, the two focused files were run, and the file was restored and its checksum compared. Every restore matched. Focused run: `categories.test.ts` and `vault-schema.test.ts`, 28 cases for M1 to M6, which ran before the `CHECK` case was added, and 29 cases for M7.
  - M1, derivation label `builtin-category` changed to `builtin-categories`: 3 failed, 25 passed (the two derived-id cases and the rename case).
  - M2, the service-level refusal removed from `updateCategory` (the brief's "allow label and builtin_key both null", at the service): 1 failed, 27 passed. "a custom label cannot be removed" got 500 where 422 is expected. The database `CHECK` refused the row, and its error is not a problem, so the API's 422 depends on the service rule.
  - M3, `categories_replace_guard` dropped (the brief's required check): 1 failed, 27 passed. "INSERT OR REPLACE cannot flip a category in use ..." resolved where it should reject. The test stops at its first failing assertion, so the identical-row `ON CONFLICT DO NOTHING` insert after it was not reached in this run. That insert passes in GREEN, where the whole test passes.
  - M4, `categories_id_immutable` dropped: 1 failed, 27 passed.
  - M5, `categories_never_deleted` dropped: 2 failed, 26 passed (the schema delete case and the categories archive case).
  - M6, the id check before the create insert removed: 1 failed, 27 passed. The duplicate-id case got 500 where 409 is expected. The guard raises before `ON CONFLICT DO NOTHING` resolves a conflict, so the check is needed.
  - M7, the database-level both-null rule removed (the `CHECK` on `categories`, with the service rule kept): before the `CHECK` case existed, 0 failed, 28 passed, so it was not caught. With the case: 1 failed, 28 passed (29), and the failure is the new case. Restored, and the checksum matched.
  - Restored checksums (sha256, first 8 hex): `categories.ts` b104f647, `0000_vault_core.sql` 1d47c70d, `registry.ts` 9bd6bdd8, `vault/routes.ts` ea31eafd, `v1/routes.ts` 0af92331, `categories.test.ts` 10b6a537, `vault-schema.test.ts` a4d3b379 (the final file, with the `CHECK` case).
- **Gate** (repo root, `npm run typecheck:edge && npm run test:edge && npm run test:edge:workers && npm run build:edge && npm run test:edge:db`, after `npm run db:v1:up` and `npm run build -w gogospend-api`, exit 0):
  - `typecheck:edge`: passes.
  - `test:edge`: 121 passed (9 files), the baseline.
  - `test:edge:workers`: 150 passed (6 files), after the pre-review fix (149 before it).
  - `build:edge`: passes. The `jotbun_vault` bundle has no PostgreSQL import.
  - `test:edge:db`: 62 passed (8 files), the baseline.
- **Not applicable** (PostgreSQL roles and grants, row-level security, connection pools, isolation levels or lock waits):
  - `categories.integration.spec.ts`, the database halves of "the type can never change, through the API or the database" and "archiving keeps the category ... never deleted". Each expects PostgreSQL's permission error (SQLSTATE 42501) for a raw `UPDATE` or `DELETE`. The vault has no roles or grants. Its refusals are the triggers, tested in `categories.test.ts` and `vault-schema.test.ts`, so the cases are ported in changed form, not dropped.
  - Row-level security on `categories`. The vault holds one account per Durable Object and has no `account_id` column. "another account's category is NOT_FOUND" is ported and holds by addressing: another account's category lives in another vault.
  - Lock waits: `lockAccount` and the `FOR UPDATE` row read in the API's `locked`. The vault's transaction is the lock. Each call runs to completion in one `transactionSync`, so no wait can occur and none is tested. The "two devices at once" seed case is ported and sends two concurrent requests, which the Durable Object serializes.
  - The API's `SeedRaced` retry loop (three attempts) is not ported. A second seed inside one call finds every key present, so one pass is complete, as the brief says.
  - Connection pools: none. A vault call makes no database connection.
- **Deviations:**
  1. `createCategory` checks the id before its insert and answers `409 VERSION_CONFLICT` with the current category, as the API does from its insert. Without the check, the guard's `RAISE` would answer 500 for an id already used with another type (mutant M6).
  2. `categoryById` returns the stored row, `CategoryRow`, where `archived` is 0 or 1, as the brief names it. Responses use `asCategory`, which gives the DTO with a boolean `archived`.
  3. The Task 3 route pin is now the Task 4 pin: the six category routes were added to the expected list and the test was renamed. No assertion was relaxed.
  4. The API spec has 10 `it` blocks and one `it.each` of 5 rows. All 15 cases are ported, and two are added (the brief's derivation test and the 409 case), for 17.
  5. `requireLiveEntity` is not called, although the brief lists it. The API's `locked` reads the row and checks its version only, and nothing deletes a category, so no head can be `deleted` or `purged`.
- **SKIPPED (hosted):** none. No cloud resource was touched.
- **Open, for the controller.** The guard is R22's plus the R76 clause (see the pre-review fix below). Still open:
  - Not probed, but it follows from the guard's condition: a REPLACE that keeps the type and built-in key passes, so it can change `label`, `color`, `archived` or `version` with no change record. Closing it means comparing the other columns too.
  - No code path in the vault issues either insert.
- **Notes for Task 5 and later:**
  - `categoryById(c, id)` returns the stored row, with `archived` as 0 or 1. Map it with `asCategory` for a DTO, or compare `archived === 1`.
  - Register transactions and budgets after categories in `buildVaultRegistry()`, in the API's construction order.
  - Task 8a: the registry now names the entity `category`. The API's `CommandRegistry.entityNames()` comment says the sync DTO map must cover exactly the registered entities, so Task 8a must cover `category`.

**Pre-review fix (R76).** The controller ruled that `categories_replace_guard` also refuses an insert whose built-in key another category already holds. Without that clause, `INSERT OR REPLACE` with such a key deleted the other category silently, because `recursive_triggers` is off and `categories_never_deleted` therefore did not fire. The clause is `OR EXISTS (SELECT 1 FROM categories c WHERE c.builtin_key = NEW.builtin_key AND c.id <> NEW.id)`. Test first: `a replace that reuses another category's built-in key is refused, and the other category survives` (`vault-schema.test.ts`), placed before the same-id replace case. Before the clause, `npm run test:edge:workers -- test/workers/categories.test.ts test/workers/vault-schema.test.ts` gave `Test Files 1 failed | 1 passed (2)` and `Tests 1 failed | 29 passed (30)`. The failure was the new case, `promise resolved "[]" instead of rejecting`, because the replace had removed the other category. After the clause, the same command gave `Test Files 2 passed (2)` and `Tests 30 passed (30)`. The full edge gate then passed (see the gate bullets above). Custom categories (a NULL built-in key), the identical seeding rows and the same-id replace are unaffected, as the existing cases show. Checksums (sha256, first 8 hex): `0000_vault_core.sql` d0329a4d, `vault-schema.test.ts` ff0b345b. One behaviour change: a plain `INSERT ... ON CONFLICT DO NOTHING` whose built-in key another category holds now aborts, where it was skipped before. The seed path checks the present keys first, so it cannot reach that case. The other open item (a REPLACE that keeps type and built-in key but changes other columns) is not part of this ruling and stays open.

### Task 5: transactions, balances and the golden diary

- **Status:** built and verified locally on `agent-ad129ba8cab52fe16`, on top of `60e2026`. Not pushed. The independent review is the controller's, after this receipt.
- **Files:**
  - Transactions: `apps/edge/src/vault/domain/transactions.ts`. It ports `TransactionsService` and `TransactionsRepository`: `getTransaction`, `createTransaction`, `updateTransaction`, `deleteTransaction` and `restoreTransaction`. It also exports `transactionRow` (Task 8's purge) and `toDto`. One row per expense, income or transfer. Edit needs `If-Match`. Soft delete sets `deleted_at`, the head state `deleted` and the outcome `deleted`. Restore is inside 30 days. A purged id (no row, head state `purged`) cannot be reused (`410 ENTITY_PURGED`). Amounts are parsed with `parseMinor` and stored and read as text (`CAST(? AS INTEGER)` in, `CAST(amount_minor AS TEXT)` out). They never pass through a JavaScript number.
  - Balances: `apps/edge/src/vault/reads/balances.ts` was not rewritten. Task 3 already reads `CAST(opening + sum AS TEXT)`, counts a transfer on both sides, excludes `deleted_at`, and binds an id list as one JSON parameter (`WHERE w.id IN (SELECT value FROM json_each(?))`, R57). Its sha256 is `f61388eae9c1362e56c5fd072198daa9b41c71884d626bb6b517979de5848e49`.
  - Protocol: `apps/edge/src/vault/commands/registry.ts` registers the `transaction` entity (`isTransactionSnapshot`, schema version 1, policy `current`) and four commands (`create`/`created`, `update`/`updated`, `delete`/`deleted`, `restore`/`restored`) after categories.
  - Routes: `apps/edge/src/vault/routes.ts` (five handlers) and `apps/edge/src/v1/routes.ts` (five routes move from `VAULT_PENDING_ROUTES` into `VAULT_V1_ROUTES`, with the access, gates and status of the PostgreSQL table). GET is `bound_session` and 200. POST create is `current_policy` with write gates and the default 201. PATCH, DELETE and restore are `current_policy` writes and 200. The table now has 24 ported, 5 pending (budgets, history, summary), 28 deferred and 6 retired routes, which is all 63 declared routes.
  - Tests: `apps/edge/test/workers/transactions.test.ts` (the API spec's 17 `it` blocks, its three `it.each` blocks, and one delta-feed case). `apps/edge/test/workers/money-hardening.test.ts` (15). `apps/edge/test/workers/golden-diary.test.ts` (5), with fixtures in `apps/edge/test/workers/support/money-fixtures.ts`. `apps/edge/test/vault-route-coverage.test.ts` now pins the five transaction routes. `apps/edge/test/workers/sync.test.ts` gives the 201-group paging case a 20s timeout (deviation 7).
- **RED to GREEN:**
  - RED, before the domain existed: `npm run test:edge:workers -- test/workers/transactions.test.ts test/workers/money-hardening.test.ts test/workers/golden-diary.test.ts` gave `Test Files 3 failed` and `Tests 47 failed | 4 passed (51)`. The failures are 404 `NOT_FOUND` (expected 201): the routes were not ported. The four that passed are the golden exactness case (`walletBalances` already returns an exact string, including the 90,100-row insert) and money-hardening's three already-built builtin cases (seed again after deleting receipts, add only missing builtins, a correction reason when nothing was corrected).
  - RED, Node: `npm test --prefix apps/edge -- test/vault-route-coverage.test.ts` gave `Tests 1 failed | 4 passed (5)`. The pin expected the 24 routes; the table still had 19.
  - GREEN, after the domain, routes and registry: the same workers command gave `Tests 51 passed (51)`. `npx tsc --noEmit` in `apps/edge` reported no errors. One type fix after the first green run was behaviour-preserving: `updateTransaction` builds a `Set` of the row's own reference fields, because `Array.includes` rejects the wider field union.
- **Mutation check:** the SHA-256 of `src/vault/reads/balances.ts` (GREEN, unchanged from Task 3) was `f61388eae9c1362e56c5fd072198daa9b41c71884d626bb6b517979de5848e49`, and a copy was kept outside the repo. Each mutant was applied in place, the named file was run, and the file was restored from the copy. Its checksum matched after every restore, and the final file is the same hash.
  - M1, the outer `CAST(... AS TEXT)` removed, so the balance comes back as a JavaScript number: `golden-diary.test.ts` gave `Tests 5 failed | 0 passed`. The exactness case expected `'9010099999909899'` and received the number `9010099999909900`. The other four failed because the balances were numbers, not strings.
  - M2, the destination side of a transfer removed: `golden-diary.test.ts` gave `Tests 4 failed | 1 passed`. Exactness passed (incomes only). The golden case had Daily account at `'1720000'` instead of `'1870000'` (the 150000 transfer credit was missing).
  - M3, all three `AND t.deleted_at IS NULL` filters removed: `transactions.test.ts` gave `Tests 1 failed | 30 passed`. The delete case expected balance `'100000'` and received `'93500'` (the deleted 6500 still counted).
- **Gate** (repo root, `npm run typecheck:edge && npm run test:edge && npm run test:edge:workers && npm run build:edge && npm run test:edge:db`, exit 0, after the sync timeout in deviation 7):
  - `typecheck:edge`: passes.
  - `test:edge`: 121 passed (9 files), the baseline.
  - `test:edge:workers`: 213 passed (10 files). The three new files are 51 of them.
  - `build:edge`: passes.
  - `test:edge:db`: 62 passed (8 files), the baseline. The container `gogospend-postgres-v1-local` was already healthy; it was not restarted.
  - An earlier run of the same gate, before the timeout, stopped at `test:edge:workers` (`Tests 1 failed | 212 passed (213)`). `sync.test.ts` "defaults to 200 groups a page and refuses more than 1,000" exceeded 5000ms (5129ms, then 5072ms on a rerun of the workers suite). Alone, that file passed 12 of 12 in 5.39s. `build:edge` and `test:edge:db` did not run on that attempt.
- **Ported in full:** the 17 `it` blocks and three `it.each` blocks of `transactions.integration.spec.ts` (the workers file is 31 vitest cases once the extra delta-feed `it` is counted), all 15 of `money-hardening.integration.spec.ts`, and all 5 of `reconciliation.integration.spec.ts`. The golden case ends with `expect(Object.fromEntries(wallets.map(...))).toEqual({ Cash: GOLDEN_BALANCES.cash, 'Daily account': GOLDEN_BALANCES.daily })`.
- **Ported in changed form:**
  - `transactions.integration.spec.ts`, the database-guards case. The vault has no roles, so the cross-account foreign key (23503) and the hard `DELETE` / column-grant `UPDATE` (42501) are not applicable. The category-type half is the vault trigger, and the case asserts that a raw insert or update whose category has the other type is rejected (`/category of its own type/`) and that the row count stays 1. Another account's record is `NOT_FOUND` by addressing: it lives in another vault.
  - `money-hardening.integration.spec.ts`, the DateStyle case. There is no connection DateStyle. Dates are `TEXT` `YYYY-MM-DD`, and the case reads `tracking_start`, `min(occurred_on)` and the HTTP `occurred_on` and asserts that shape.
  - The injected `fail_on_4242` failure. The API uses a PL/pgSQL function. The vault uses a SQLite `AFTER UPDATE` trigger that `RAISE`s `ABORT` when `NEW.amount_minor = 4242`, inside the call's `transactionSync`, which rolls back the row, the receipt and the revision (`500 INTERNAL_ERROR`). The test drops the trigger in `finally`.
- **Not applicable** (PostgreSQL roles and grants, row-level security, connection pools, isolation levels or lock waits, and a vault holds one account):
  - The 42501 hard-delete and column-grant halves, and the cross-account foreign key, as above. The vault has no roles or grants and no `account_id`.
  - `FOR UPDATE` and lock waits. The vault's transaction is the lock. Each call runs to completion in one `transactionSync`. The concurrent `Promise.all` cases are ported, and the Durable Object serializes them.
  - Connection pools: none. A vault call makes no database connection.
- **Deviations:**
  1. `commandInput` takes the If-Match rule as a fourth argument (`'required' | 'forbidden' | 'optional'`, R40). Vault commands check those headers before the body (R41): `commandInput`, then the route id, then the body. Same order as wallets.
  2. `walletBalances` was left as Task 3 wrote it. The three mutants above were applied to that file and each was caught, so the brief's Step 5 holds without a rewrite. The exactness case therefore passed on RED.
  3. An id list of unbounded size is one JSON parameter, `JSON.stringify(ids)` into `json_each(?)` (R57). Durable Object SQLite allows at most 100 parameters per query.
  4. The golden case also asserts `GOLDEN_RECORDS.length`, the wallet names against `GOLDEN_WALLETS`, `tracking_start` against `GOLDEN_START`, and income and expense against `GOLDEN_TOTALS`, so those imports are live. The required ending assertion is present verbatim.
  5. `transactions.test.ts` adds one delta-feed case the API spec does not have. It reads the sync page, keeps `entity === 'transaction'`, and expects entity versions `[1, 'active']` and `[2, 'active']` with `isTransactionSnapshot` on the snapshots. It does not pin an account revision.
  6. The Node pin in `vault-route-coverage.test.ts` changed in the same edit as the route move. Its RED run is the one recorded above. No assertion was relaxed.
  7. `sync.test.ts`, "defaults to 200 groups a page and refuses more than 1,000", now has a 20s timeout. The case creates 201 vaults sequentially and fits under 5s alone. Beside the 90,100-row exactness insert it crossed 5s by about 100ms. The row count and the assertions are unchanged. The workers config's default timeout is unchanged.
- **SKIPPED (hosted):** nothing deployed, and no cloud resource was created.
- **Notes for Task 6 and later:**
  - `transactionRow(c, id)` returns the stored row, or `undefined`. `getTransaction` on a missing row, including a purged id, is 404. `410 ENTITY_PURGED` is only on create reuse and on `locked()` mutations.
  - `categoryById` still returns `archived` as 0 or 1. A newly referenced archived category, a missing one, and a type mismatch are `stateProblem` (`422 VALIDATION_FAILED`). `DATE_BEFORE_TRACKING_START` is a `ContractValidationError`. Blame the wallet field only when the date is unchanged and that wallet is newly referenced; otherwise blame `occurred_on`.
  - Register budgets after transactions in `buildVaultRegistry()`.
  - There is no `attachment_id` column in 1A. `toDto` omits it, and omits null refs of the other type.
  - Sums must stay `CAST(... AS TEXT)`. SQLite's sum of integers is exact until the Durable Object SQL API returns it; without the cast it becomes a JavaScript number and loses precision above 2^53.

## Not done, or follow-ups

- **Rotating reminder wording (owner decision):** a repeating daily notification cannot change its text, so rotation needs "every day" to become seven weekly reminders, one wording per weekday. The reminders milestone (S4) chose one daily reminder on purpose, and its tests pin it. Cancelling all eight known ids first would still leave one reminder a day, so the change is safe to make if wanted.
- **E2 screenshots** of the companion area. Its eight catalogue sections are in (`src/dev/catalogue/companion`): Ask Bun off and answering, Tell Bun reading a Thai sentence, Bun's note on Home, the cashback card asking and on, the Settings controls and the Thai pack. The area is on by default at the owner's request; `EXPO_PUBLIC_REDESIGN=-companion` switches it off.
- **Hosted proofs, when the owner asks for a deployment:**
  - a hosted PostgreSQL and its least-privilege logins;
  - six Hyperdrive configs with caching off;
  - R2, three queues and the parser container;
  - each Worker's secrets (apps/edge/README.md);
  - an Anthropic key (with an AI Gateway if wanted);
  - a GoGoCash catalogue URL.

  Wrangler on this machine is already signed in to a GoGoCash account.

## Goal coverage (24 October 2026)

What the owner asked for, and where each part stands. Commits on `claude/premium-ai-edge`: `b22c41c` (backend, premium, AI and bridge), `56558fd` (bounded request bodies), `5ad3463` (Mobbin research), and the commit with this section.

| Asked for | Evidence | State |
| --- | --- | --- |
| Frontend on Expo | `apps/app`: Expo ~58.0.12, expo-router ~58.0.21, React Native 0.88. The app was already Expo (D12), so the redesign was kept. | Done. App gate green: typecheck, unit, render, routes, web export. |
| Backend on TanStack with Cloudflare | `apps/edge`: TanStack Start 1.169.4 on Workers (Vite plugin 1.65.0, wrangler 4.152.0). Every v1 route, three background Workers, the parser container, R2, Queues, Hyperdrive. | Built and proven locally: parity with NestJS on three sessions, workerd runs of all four Workers. Not deployed (owner: not yet). |
| UX research from Mobbin | Plan §7: nine searches with linked references, and what was taken from each. | Done. Mobbin holds no Thai apps. |
| Easier for Thai and SEA users | Thai catalog for every string; Buddhist-era dates; the Thai everyday pack; the Thai sentence parser (Thai number words); bank slips; AI figures worded in Thai; the `000` key; Dynamic Type to AX5. | Done in code; the owner's screenshot approval (E2) is pending. Contact sheets sent 24 October. |
| Premium haptic feedback | One vocabulary of moments (`motion.haptic`), an On/Subtle/Off setting, 22 screens and components calling `playHaptic`. | Done in code; not yet felt on a real device. |
| AI that people love and use daily | Tell Bun (sentences and slips), Ask Bun (grounded figures, follow-ups), Bun's daily note, "often logged" chips; `claude-opus-5-5` with fallbacks; consent, daily limits and grounding on the server. | Done in code with a scripted model; live calls wait for an Anthropic key. |
| Trust, and a bridge to GoGoCash | The cashback card: a count, never a guessed amount; asked once; "Why am I seeing this?" and "How cashback works"; matching on the phone, nothing sent; Open GoGoCash with no diary data. | Done. A hosted GoGoCash catalogue URL is still to come. |
