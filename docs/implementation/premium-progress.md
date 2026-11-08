# Premium, AI and edge progress

Receipts for the [premium, AI and edge plan](../superpowers/plans/2026-10-24-jotbun-premium-ai-edge.md). The owner asked for it on 24 October 2026; the decisions (D12–D22) and their reasons are in the plan's §1.

**Where things stand:**
- **Built and verified locally:**
  - the backend on Cloudflare in `apps/edge`: every v1 route, AI and the GoGoCash catalogue on the TanStack Start Worker, the API's job, security and deletion workers as Workers of their own, and import parsing in a Cloudflare Container built from the API's release image;
  - migration 0019;
  - the shared contracts;
  - the app's premium layer: haptics, Tell Bun, Ask Bun, the daily note, the cashback card and the Thai everyday categories;
  - eight catalogue sections for the companion area, checked in the browser in Thai, light and dark.
  - the companion area on iOS (28 October): a development build on the iPhone 17 simulator (iOS 27.0, Xcode 27.1) drew all eight sections in Thai, and Home in dark; turned Bun's help on through the consent sheet; read “ข้าวมันไก่ 50” into a ฿50 food draft on the phone; and opened the system photo picker from Scan a slip, which needs no photo permission. It also found the keyboard problem under “Not done”.
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

## 1B: files and background work on the vault

Phase 1B moves the files, imports, exports, snapshots, receipts and the AI companion's state into each person's UserVault, as the spec's §6.2 and §6.3 describe (`docs/superpowers/specs/2026-10-25-jotbun-bun-wallet-cloudflare-design.md`). Task 2 adds the file tables, the object keys, the prefix purge and the durable erase that deletion relies on.
## P2: Bun Wallet core

Phase 2 is the phone's Bun Wallet. Task 3 is the draft-copy rule and the two stores: device settings, forgotten at sign-out, and account-kept looks, erased only with the account (R64).

### P2 Task 3: draft copy and wallet stores

- **Status:** built and verified locally on this worktree, on `60e2026`. Not pushed. The independent review is the controller's, after this receipt.
- **Files:**
  - Copy: `apps/app/src/wallet/copy/draftText.ts` (`draftText`, `tableT`), `useDraftCopy.ts` (locale from `useActiveLocale`), `common/copy.ts` (`COMMON_COPY`, data only). Twelve lines: close, back, next, save, undo, later, done, tryAgain, amountHidden, baht, satang, minus.
  - Stores: `apps/app/src/wallet/store/walletStore.ts` (`deviceStore`, `accountStore`) and `deviceWalletStore.ts` (AsyncStorage 2.2.0, `installStoreBackend`, `eraseDeviceSettings`, `eraseAccountKept`).
  - Diary: `spendDiary.ts` adds `DiaryView.accountId` (the open diary's account; null while opening, locked, signed out, or on the web). `fakeDiary.ts` defaults it to `00000000-0000-4000-8000-0000000000aa`. `DeviceDiaryProvider.tsx` awaits `eraseDeviceSettings().catch(() => undefined)` inside `eraseWithDiary`. `PrivacyScreen.tsx` reads `view.accountId` before `settleDeviceCopy` and, when the answer is `'erased'` and the id is not null, awaits `eraseAccountKept(accountId).catch(() => undefined)`.
  - The required field also lands on the no-diary view in `SpendDiaryContext.tsx` and on the full `DiaryView` literals in `homeModel.test.ts`, `settingsModel.test.ts` and `SyncStatus.render.test.tsx` (`accountId: null`).
  - Tests: `draftText.test.ts` (4), `walletStore.test.ts` (3), the new case in `spendDiary.test.ts`, the new case in `DeviceDiaryProvider.render.test.tsx` (its AsyncStorage mock already had `getAllKeys`; it gained `multiRemove`), and the new case in `PrivacyScreen.render.test.tsx`.
- **RED to GREEN:**
  - RED, Node (`npm run test:unit -w gogospend-app -- src/wallet/copy/draftText.test.ts src/wallet/store/walletStore.test.ts src/spend/v1/spendDiary.test.ts`): `tests 26, pass 23, fail 3`. `the view names the open diary's account, and nobody without one` failed (`accountId` was `undefined`, expected `0a000000-0000-4000-8000-00000000000a`). `draftText.test.ts` failed to load (`Cannot find module .../wallet/common/copy.ts`). `walletStore.test.ts` failed to load (`Cannot find module .../wallet/store/walletStore.ts`). The 23 passes are the existing diary tests.
  - RED, render (`npm run test:render -w gogospend-app -- src/spend/v1/DeviceDiaryProvider.render.test.tsx src/screens/redesign/account/PrivacyScreen.render.test.tsx`): `Test Files 2 failed`, `Tests 1 failed | 3 passed (4)`. The sign-out case failed because `jotbun.wallet.private-mode` was still present. `PrivacyScreen.render.test.tsx` failed to load (`Failed to resolve import "@mobile/wallet/store/deviceWalletStore"`), so its existing cases did not run.
  - GREEN, Node: `tests 31, pass 31, fail 0` (diary 24, draft copy 4, stores 3).
  - GREEN, render: `Test Files 2 passed`, `Tests 26 passed` (DeviceDiaryProvider 4, PrivacyScreen 22).
- **Mutation check:** originals copied to `/tmp/p2-t3-mutants`, sha256 recorded, each mutant applied in place, the focused test run, the file restored with `cp`, and the checksum compared. Both restored checksums match.
  - `walletStore.ts` (`493b69b921f326ed6cb09d98834f0ac29a3abf3ce7429c86d626e283624f5934`): the device erase dropped its prefix filter and removed every key. `npm run test:unit -w gogospend-app -- src/wallet/store/walletStore.test.ts` gave `1 failed, 2 passed`. The failing case was `the device erase removes every jotbun.wallet. key and nothing else` (`null !== 'warm'` on `jotbun.account.a1.looks`). The account-erase case still passed.
  - `DeviceDiaryProvider.tsx` (`cc612c31a1ab472c00aae226b243fceec704b4e06feb6ee3002853d3de352fb3`): `eraseWithDiary` also awaited `eraseAccountKept(accountId)`. `npm run test:render -w gogospend-app -- src/spend/v1/DeviceDiaryProvider.render.test.tsx` gave `1 failed | 3 passed (4)`. The failing case was `the sign-out erase forgets the wallet's device settings and keeps the account's looks` (expected `'warm'`, received `undefined`).
- **Gate** (worktree root, the tests the brief names; not the edge database suite):
  - Node, the same three files: `tests 31, pass 31, fail 0`.
  - Render, both files whole: `Test Files 2 passed`, `Tests 26 passed (26)`.
  - `npm run typecheck -w gogospend-app` (`tsc --noEmit`) passed. That run is not part of the brief's gate. It is how the new `DiaryView` field was checked against the rest of the app.
- **Not applicable:** nothing here is ported from `apps/api`. No PostgreSQL role, grant, row-level security, pool, isolation level or lock wait is in this task.
- **Deviations:**
  1. `DiaryView.accountId` is required, so four literals the brief does not name now include it: the no-diary view, and three test fixtures, each `null`.
  2. `draftText` repeats the one-pass replace instead of importing `formatCopyValues`. That module loads the `@mobile` catalogs, which `node --test` does not resolve. The replace is the same expression: one pass, unknown tokens left in place.
  3. The store test also keeps `jotbun.account.a10.looks` when `a1` is erased, and the copy test checks that a value of `{amount}` is not filled again. The sign-out test removes `jotbun.wallet.lock` as well as `private-mode`. The deletion test leaves `jotbun.wallet.private-mode`. Each pins a rule the brief states.
- **SKIPPED (hosted):** none. No cloud resource was touched.
- **Notes for later tasks:**
  - An area adds `src/wallet/<area>/copy.ts` with `export const COPY = { '<area>.<name>': { th, en } } as const satisfies DraftTable` and `import type { DraftTable }`. Keys stay unique. A screen that needs several areas calls `useDraftCopy({ ...COMMON_COPY, ...HOME_COPY })`. `draftText.test.ts` already exempts `card.kindTransit` in `LATIN_LINES`.
  - `useDraftCopy` depends on the table object. Build a merged table outside the render, or memoize it.
  - Device settings (private mode and its tip, the lock, setup answers, over-budget marks, confetti marks) use `walletDeviceStore()` and leave at sign-out. Looks, category icons and wallet order use `walletAccountStore(accountId)` with `useDiaryView().accountId`. When that id is null, store nothing and show the derived looks. Do not call `walletAccountStore` with an empty string: the prefix would be `jotbun.account.` and an erase would match every account.
  - The fake diary's default id stays even if a test sets `phase: 'locked'`. Pass `accountId: null` when the fixture means nobody.
  - A confirmed deletion while the diary is locked, opening, or absent does not erase account-kept looks, because the view's id is null. `Done` on `erase_failed` retries the diary erase only. The brief said not to change the rest of the deletion flow.
  - No analytics emitter was added (R25).
Phase 2 is the Bun Wallet on the device. Task 4 reads the days already logged in the open diary. The streak counts every distinct logged day up to today; a skipped day pauses it and never lowers it (R59, W11).

### P2 Task 4: logged days

- **Status:** built and verified locally on `p2/t4-logged-days`, on top of `60e2026`. Not pushed. The independent review is the controller's, after this receipt.
- **Files:**
  - `apps/app/src/storage/diaryRepository.ts`: `DiaryStore.loggedDays()`, one read through the store's `read` helper. The query binds nothing. `UNION` makes the dates distinct and `ORDER BY day` sorts them ascending. One side is live confirmed transactions (`entity = 'transaction' AND state = 'active'`); the other is every draft (`pending_entries`).
  - `apps/app/src/spend/v1/spendDiary.ts`: `SpendDiary.loggedDays()`. The open store's dates, or null while no diary is open.
  - `apps/app/src/spend/v1/testing/fakeDiary.ts`: `createFakeDiary(view, { loggedDays })`. While the view's phase is `ready`, `loggedDays()` answers the seeded dates merged with the view's pending dates, ascending. Otherwise null.
  - `apps/app/src/spend/v1/redesign/loggedDays.ts`: `streakCount` and `loggedOn`. Pure.
  - Tests: `diaryRepository.test.ts`, `spendDiary.test.ts`, `loggedDays.test.ts`.
- **RED to GREEN:**
  - RED (`npm run test:unit -w gogospend-app -- src/storage/diaryRepository.test.ts src/spend/v1/spendDiary.test.ts src/spend/v1/redesign/loggedDays.test.ts`): `tests 42`, `pass 39`, `fail 3`. `loggedDays.test.ts` failed to load (`Cannot find module .../loggedDays.ts`), so its three cases did not run. `store.loggedDays is not a function`. `diary.loggedDays is not a function`.
  - GREEN, the same command: `tests 44`, `pass 44`, `fail 0`.
- **Mutation check:** `shasum -a 256` recorded first, originals kept in `/tmp/p2-t4-mutation` (outside the repo). Each mutant was applied in place, the focused file was run, the file was restored, and the checksum was compared. Both restored checksums match.
  - `loggedDays.ts` (`2cf83fc4…025a7`): count only the consecutive run that ends today (a restart on a skip). `loggedDays.test.ts`: `tests 3`, `fail 1`, `pass 2`. The streak test failed at `2 !== 4` (20, 21, skip 22, 23, 24, asked on the 24th). The future-day case still passed, because the run that ends on the 24th is one day. Caught (R59).
  - `diaryRepository.ts` (`33c50f30…bde5f`): the drafts side of the `UNION` removed. `diaryRepository.test.ts`: `tests 17`, `fail 1`, `pass 16`. The logged-days test expected `['2026-10-20', '2026-10-23']` and got `['2026-10-20', '2026-10-20']`. The draft date is gone, and the two live rows on one day are no longer collapsed, because `UNION` was what made them distinct. Caught.
- **Gate** (repo root, once, after both files were restored): `npm run test:unit -w gogospend-app`. Exit 0. `tests 693`, `pass 693`, `fail 0`, `suites 7`. The edge database suite was not run.
- **Ported in full:** not a port. There is no PostgreSQL source for this read. The query, the diary method and the streak model are the brief's, written here.
- **Ported in part:** none.
- **Not applicable:** PostgreSQL roles and grants, row-level security, connection pools, isolation levels and lock waits. The diary read is one statement on the device database, through the store's `read` helper, with no bound parameters (R57: this query has no id list).
- **Deviations:**
  1. A `json_extract` that returns NULL is dropped, so the result is `string[]`. The brief's SQL can yield NULL. No row in the tests does.
  2. `streakCount` skips a string that is not a real `YYYY-MM-DD` (`dayNumber` in `shared.ts`). The interface says distinct valid dates. The named tests use only real dates.
  3. The fake diary returns the merged dates sorted ascending, the same order the store returns.
  4. The spend-diary test, whose name is the brief's, also syncs two live records on `2026-10-20` and a deleted one on `2026-10-21`, then saves a draft on `2026-10-23`. A method that listed only drafts, or every snapshot, would fail it. Signed out, the result is null.
- **SKIPPED (hosted):** none. No cloud resource was touched. `accountId` was not added; that belongs to the other task on these files.
- **Notes for later tasks:**
  - P2-T22 calls `diary.loggedDays()` and `streakCount(days, today)`. Null (no open diary, including the web) means the streak tile is left out. The count is the person's, across every wallet.
  - P2-T36's `isLoggedToday` is true when `loggedDays()` holds today, confirmed or draft.
  - Render tests pass a seed as `createFakeDiary(view, { loggedDays })`. Pending dates on the current view are merged in while `phase` is `ready`.
  - The query binds nothing. Do not add one `?` per id here.
## 1D: live pokes, the pending choice and PostHog

Phase 1D adds live pokes, the pending conflict choice and PostHog to the vault core. The design is `docs/superpowers/specs/2026-10-25-jotbun-bun-wallet-cloudflare-design.md` (PostHog is its §7). Task 3 builds the server analytics as a stand-alone module; the Worker wiring is 1D-T11 and T13.

### 1D Task 3: Server analytics as a module

- **Status:** built and verified on worktree `worktree-agent-aee5036b9ab6bfc29` (branch `worktree-agent-aee5036b9ab6bfc29`), from base `68ec183`. Not pushed. The independent review is the controller's, after this receipt.
- **Files:**
  - Module: `apps/edge/src/analytics/server-analytics.ts`. `analyticsIdFor` is the lowercase hex HMAC-SHA256 of the user id under `ANALYTICS_ID_KEY` (WebCrypto, both read as UTF-8). `createServerAnalytics` returns `null` without `POSTHOG_PROJECT_TOKEN`, and otherwise sends through PostHog EU with the brief's client options. It also holds the allow-listed server events, the anonymous `$exception` and `account_deleted` counts, and `deletePostHogPerson` (persons `bulk_delete` on `eu.posthog.com`).
  - Test: `apps/edge/test/server-analytics.test.ts` (Node), 14 tests.
  - Dependency: `apps/edge/package.json` (`"posthog-node": "5.56.2"`, exact, one line) and `apps/edge/package-lock.json`.
- **Version and lockfile:**
  - `posthog-node` 5.56.2, published 16 October 2026. The brief's rule is the newest stable release published at least 7 days before the install day (25 October), so 18 October at the latest. The brief's parenthetical names 5.57.1 (23 October), which that rule excludes.
  - Installed with `npm install --prefix apps/edge --save-exact --before=2026-10-18T00:00:00.000Z posthog-node@5.56.2`. The cutoff holds the transitive packages to the same rule. Without it, npm resolves `@posthog/core` to 1.60.1, published 23 October.
  - Lockfile: three packages added (`posthog-node@5.56.2`, `@posthog/core@1.59.1` published 14 October, `@posthog/types@1.416.0` published 13 October), none changed or removed. 40 lines added, none removed. Size 151,486 to 152,878 bytes (+1,392 bytes). `npm ls --prefix apps/edge wrangler` shows one wrangler, 4.152.0.
  - Dependency gate:
    - Licences: MIT for all three.
    - Install scripts: none in any of the three.
    - Peers: `rxjs` and `@opentelemetry/api` are optional and not installed. Engines are `^20.20.0 || >=22.22.0`; the edge requires `>=24`.
    - Provenance: `posthog-node` 5.56.2 has an SLSA provenance attestation. `npm audit signatures` in `apps/edge` verifies 201 packages' registry signatures and 109 attestations.
    - Advisories: `npm audit --omit=dev --json` reports 0 before and after this change. The full `npm audit --json` reports 6 findings (3 moderate, 3 high) in `wrangler`, `miniflare`, `undici`, `zod`, `@cloudflare/vite-plugin` and `@cloudflare/vitest-plugin`. All are dev-only and not introduced here: none names a new package, and no existing version changed. Not remediated, since the wrangler pin (4.152.0) is the brief's.
- **RED:** `npm run test:edge -- test/server-analytics.test.ts` against typed stubs, where each routine returned a wrong typed value: 14 failed, 0 passed. All 14 are assertion failures (for example `expected '' to be '6445f…'`, `promise resolved "'queued'" instead of rejecting`, `expected [] to have a length of 1`). No module failed to load.
- **GREEN:** the same command, 14 passed, 0 failed.
- **Mutation check:** the checksums of `server-analytics.ts` (`939b6a4e…d5039`) and the test file (`1e10f58f…2872`) were recorded, and a copy of the module was kept outside the repo. Each mutant was applied in place, the focused file was run, and the module was restored from the copy and its checksum compared.
  - M1, the record's properties passed through unfiltered: 2 failed (the allow-list test and the value test).
  - M2, one distinct id reused for every failure: 1 failed (the failure test).
  - M3, a 202 with `deletion_errors` accepted: 1 failed (the refusal test).
  - M4, "nothing to delete" decided on the project token instead of the analytics key: 5 failed (the deletion tests).
  - M5 (added for the identity rule), the analytics-id guard weakened to an empty-string check: 1 failed (the identity test).
  - M6 (added for the category rule), a category outside the built-in keys sent raw: 1 failed (the value test).
  - Every restored module matches the recorded checksum. The test file was not edited after the RED run.
- **Gate** (repo root):
  - `typecheck:edge`: passes.
  - `test:edge`: 135 passed (10 files), 14 of them new.
  - `test:edge:workers`: 128 passed (5 files).
  - `build:edge`: passes. No entry imports the module yet, so the Worker bundles do not contain PostHog code.
  - `test:edge:db`: 62 passed (8 files), with the local PostgreSQL container up.
  - `node --test scripts/ci/lockfile-bindings.test.mjs`: 2 passed.
  - `npm run build -w gogospend-api`: passes.
  - Workerd check of the module: `build:edge` does not bundle it, so esbuild 0.28.2 (from `apps/edge/node_modules`) bundled `src/analytics/server-analytics.ts` with the `workerd`, `worker` and `browser` conditions. It resolves `posthog-node`'s edge entry, and the output contains both the EU host and the app host. Nothing was written into the repo.
- **Deviations:**
  - Version: the brief's parenthetical names 5.57.1 as the newest release on 25 October, but its own 7-day rule excludes it. The rule gives 5.56.2, which is pinned.
  - Install command: the `--before` flag is not in the brief's command. It is there to hold the transitive packages to the same cutoff.
  - The brief's Step 5 says `build:edge` proves that `posthog-node` bundles. It cannot do that until T11 or T13 imports the module, so the workerd check above stands in for it.
  - The real-client test stubs `globalThis.fetch`. The installed source confirms first that the SDK's `fetch` method calls the global `fetch` at call time (`posthog-node/dist/client.mjs`), so no fallback was needed.
  - The brief leaves these open. Each is tested:
    - `capture` drops an analytics id that is not 64 lowercase hex, so a raw user id or an email cannot become a distinct id.
    - `category_key` outside `BUILTIN_CATEGORIES` is sent as `custom`, as §7 and the global constraints require. An unknown `kind`, or a `reason_code` that fails its pattern, is dropped, and the event is still sent.
    - `captureAnonymous` sends only `account_deleted`.
    - A 202 with no `deletion_errors` array counts as a failure. The project id is URI-encoded.
    - Deletion is decided by the analytics key alone; the project token is not needed (M4 guards this).
  - `defaultPort` is the PostHog client itself, as the brief says. Its `captureImmediate` cannot reject: `_sendPreparedEvent` in the SDK catches every error, so `waitUntil(client.captureImmediate(message))` cannot reject either.
  - The "never rotates" rule is in the module's comments. `apps/edge/README.md` is not among this task's files, so the README note belongs beside the secret when T11 or T13 documents it.
  - Heading: the controller's instruction names `## 1D: live pokes, the pending choice and PostHog`; the global constraints name `... PostHog and the proof`. This section uses the controller's heading. The two should be aligned at merge.
  - Docker: Docker Desktop had quit between two gate runs. It was started with `open -a Docker`, and the database commands ran with `DOCKER_CONTEXT=desktop-linux`, because the active context had changed to `colima`, which is not running. No global Docker setting was changed.
- **SKIPPED (hosted; no PostHog project or keys yet, D33):**
  - A capture that reaches `eu.i.posthog.com`: SKIPPED. The test answers the request with a stub.
  - `POST eu.posthog.com/api/projects/{id}/persons/bulk_delete` against PostHog: SKIPPED. The 202 contract is the brief's, exercised through a stub.
  - A real `ANALYTICS_ID_KEY`: unset in every environment, so nothing is sent and deletion answers `nothing_to_delete` (Q5).
- **Notes for the integrator:**
  - `posthog-node` logs its own send failures with `console.error(err)`, so an SDK error message can reach the Worker's logs. The logging rule (`failureName` only) cannot be enforced inside the SDK. T11 or T13 may want to wrap the port.
  - Analytics ids that are not 64 lowercase hex are dropped by design. Tests that pass fake ids to `capture` must use 64 lowercase hex characters.
  - `@posthog/core` and `@posthog/types` are transitive. A later update of `posthog-node` would resolve them without this cutoff, so the gate applies again then.
Phase 1D lets a change saved on one phone reach the person's other phones at once, with the sync fallbacks kept (`docs/superpowers/plans/2026-10-25-jotbun-p1d-pokes-posthog.md`, spec §6.5). Task 5 is the phone side: a socket that listens for `{ revision }` pokes, the live flush, screens that refresh when the revision moves, and development builds on the LAN. The vault side, `GET /v1/sync/live`, is 1D-T10, so the channel is tested against a fake socket.

### 1D Task 5: The app's live channel

- **Status:** built and verified locally on `worktree-agent-ad762b72c686aec52`, on top of `68ec183`. Not pushed. The independent review is the controller's, after this receipt.
- **Files:**
  - `apps/app/src/sync/liveChannel.ts` (new): the pure channel with `liveUrl`, `parsePoke`, `revisionGrew`, `createLiveChannel`, `LIVE_CLOSE` and the timing constants. Test: `apps/app/src/sync/liveChannel.test.ts` (16 tests, on a fake socket and manual timers).
  - `apps/app/src/sync/types.ts`: `FlushTrigger` gains `'live'`. `retryPolicy.ts`: `gate` lifts a failure pause for `'live'`, never the server's pacing. `syncEngine.ts`: a queued follow-up runs with the strongest trigger asked for (manual, foreground and live over write, over timer and launch). `scheduler.ts`: `live()`, and `channel?` started on launch and foreground and stopped on background and stop. `deviceSync.ts`: builds the channel with React Native's `WebSocket(url, undefined, { headers })`, `store.appliedRevision()`, `scheduler.live()`, the platform timers and `Math.random`.
  - `apps/app/src/storage/diaryRepository.ts`: `appliedRevision()`, one `diary_meta` read, `'0'` before any change.
  - `apps/app/src/spend/v1/spendDiary.ts`: `DiaryView.appliedRevision` (`'0'` when no diary is open), read with the pending list. `SpendDiaryContext.tsx` and `testing/fakeDiary.ts` take the default. Three existing fixtures (`settingsModel.test.ts`, `homeModel.test.ts`, `SyncStatus.render.test.tsx`) gain the field.
  - `apps/app/src/api/client.ts`: `allowLanHttp`, which accepts `http://` to a private IPv4 literal (10/8, 172.16/12, 192.168/16) only when set. `apps/app/src/api/sharedV1.ts`: `allowLanHttp: __DEV__`, and `getSharedLiveTarget()`, whose token read uses `v1SessionCredentials`.
  - `apps/app/src/screens/redesign/useRefreshOnRevision.ts` (new): refreshes when the revision grows and never on the first value. `HomeScreen.tsx` uses it with `loaded.refresh`, and `HistoryScreen.tsx` with `loadRef.current(true)`.
  - Test helper: `apps/app/src/sync/testing/harness.ts` takes an optional remote in `newEngine`, so a test can hold one run open.
  - Tests: `syncEngine.test.ts` (the brief's three, plus the strongest-trigger test and the scheduler wiring test), `diaryRepository.test.ts` (one), `client.test.ts` (one), `HomeScreen.render.test.tsx` and `HistoryScreen.render.test.tsx` (one each).
- **RED to GREEN:**
  - RED, unit (`npm run test:unit -w gogospend-app -- src/sync/liveChannel.test.ts src/sync/syncEngine.test.ts src/storage/diaryRepository.test.ts`, with typed stubs in place): `tests 56, pass 35, fail 21`. All 21 are assertion failures: 16 channel tests, three engine tests (live pause, joined poke, strongest trigger), the scheduler wiring test and the repository test. The characterization `twenty pokes during a flush run one follow-up` passes before the change, as the brief says.
  - RED, app (`npm run test:app`): `tests 29, pass 28, fail 1` (the LAN test).
  - RED, render (`npm run test:render -w gogospend-app -- src/screens/redesign/HistoryScreen.render.test.tsx src/screens/redesign/HomeScreen.render.test.tsx`): `tests 77, fail 4`. The two new refresh tests fail on assertions (`expected ... to have a length of 2 but got 1`). Two existing paging tests (Home's `today's total is exact even when today's records take more than one page` and History's `pages through every entry with Load more`) timed out at 5 s on this machine, on code paths this change does not touch. Both pass at GREEN.
  - GREEN: unit focused `56 of 56`, app `29 of 29`, render focused `77 of 77`.
- **Mutation check:** the five production files were backed up outside the repository and their `shasum -a 256` recorded. Each mutant was applied in place, the focused tests were run, and the file was restored from its backup and its checksum compared.
  - M1, the gate ignores `'live'` (`retryPolicy.ts`): 3 failed (the live pause test, the joined-poke test, the strongest-trigger test).
  - M2, a follow-up keeps the first caller's trigger (`syncEngine.ts`): 2 failed (the joined-poke and strongest-trigger tests).
  - M3, reconnect after 4401 (`liveChannel.ts`): 1 failed (the ended-session test).
  - M4, the token cached across reconnects (`liveChannel.ts`): 1 failed (`each reconnect reads the token again`).
  - M5, `172.32.0.1` accepted (`client.ts`): 1 failed (the LAN test).
  - M6, History reloads on every view update (`HistoryScreen.tsx`): 7 failed, including `a change pulled from another phone refreshes the list in place`.
  - M7, extra, for the current-socket rule: the close handler without its current-socket check (`liveChannel.ts`): 3 failed (`a late close from a replaced socket changes nothing`, `stop closes the socket...`, `start replaces an open socket...`).
  - Every restored file matched its recorded checksum. Two edits came after the check, and the gate ran again after them: the `flushNow` default of `'timer'` (restored after review; behaviour-neutral, because the gate treats an absent trigger as a timer) and the import position in `HistoryScreen.tsx`.
- **Gate (final, after the last edit):**
  - `npm run typecheck:app`: 0 errors.
  - `npm run test:unit`: `tests 711, pass 711`.
  - `npm run test:app`: `tests 29, pass 29`.
  - `npm run test:render -w gogospend-app`: 83 files, `tests 1589, pass 1589`. An earlier full run failed one test, `an unconfirmed first wallet stays frozen with its key when the retry is refused before processing` (Home, a one-second `findByLabelText` under load). The re-run passed. That path renders no diary, so the view's revision stays `'0'` and the new hook does nothing there.
  - `npm run export:web -w gogospend-app -- --max-workers 2`: exported `dist` (git-ignored).
  - `git diff --check`: pass. `node --test scripts/ci/lockfile-bindings.test.mjs`: `2 of 2`. No package or lockfile change.
  - SKIPPED: none in this task. The device, hosted and two-phone checks belong to 1D-T10 and the proof.
- **Deviations from the brief:**
  - `start()` replaces an open socket and closes it with 1000, so each foreground call reconnects. The replaced socket's late 4409 is ignored, as the brief requires.
  - A token read that rejects (the credentials cannot be read) reconnects after the backoff. The brief does not say what happens there.
  - The scheduler's `live()` does not check foreground. The channel only runs from launch or foreground until background, so it never runs in the background.
  - Tests beyond the brief: the scheduler wiring, the strongest-trigger order, the current-socket checks for `onmessage`, `onerror` and a late open, the 64-character poke boundary, a stop during a token read, the pong keep-alive, `start()` replacing a socket, and the token-failure backoff.
  - `deviceSync.ts` reads the global `WebSocket` when it connects, not when the module loads.
- **Risks, for the controller:**
  1. **The session binding is not sent on the socket.** Every other private v1 request sends `X-GoGoSpend-Session` (the transport adds it from the session's binding, and the 2026-10-17 backend plan's native request rule names it). The brief's socket headers are `Authorization` and `X-GoGoSpend-Client` only, and `LiveTarget` has no binding. If 1D-T10's vault requires the binding on `/v1/sync/live`, the socket is refused on a real device. The fix is a `binding` on `LiveTarget`, which changes the brief's interface, so it was not made here. This needs a decision before 1D-T10.
  2. The channel is proven against a fake socket only. The real round trip waits for 1D-T10 and the two-phone proof.
  3. When a diary opens after a screen has mounted, the applied revision moves from `'0'` to its value, so Home and History reload once more.
  4. Timing: two paging tests timed out at 5 s in the RED run, and one first-wallet test failed once in a full run under load. All passed on re-run. This change does not alter those paths.
### 1D Task 4: Pending choices kept in the diary

- **Status:** built and verified locally on `worktree-agent-a667751bc0a738fc0`, from `68ec183`. Not pushed. The independent review is the controller's, after this receipt.
- **What it does:** an online edit of a record refused with `VERSION_CONFLICT` (C16, record edits only) is kept in the encrypted diary as a pending choice, one row per record. It is never sent by itself, and no outbox kind is added. This task is storage and model only: no screen is routed, and `ChoicePanel` (1D-T9) reads the view.
- **Files:**
  - Storage: `apps/app/src/storage/migrations.ts` (migration 3, `pending_choices`, appended), `types.ts` (`PendingChoice`), `diaryRepository.ts` (`keepChoice`, `readChoices`, `dropChoice`).
  - Model: `apps/app/src/spend/v1/redesign/pendingChoice.ts` (`draftFromChoice`, `choiceAgainst`, `choiceSettled`, `resendForChoice`).
  - Diary view: `apps/app/src/spend/v1/spendDiary.ts` (`DiaryView.pendingChoices`, `keepChoice`, `dropChoice`; `refresh` reads the choices beside the outbox).
  - `DiaryView` values and the fake diary, given `pendingChoices: []` and the two new methods: `spend/v1/SpendDiaryContext.tsx`, `spend/v1/testing/fakeDiary.ts`, `spend/v1/redesign/homeModel.test.ts`, `spend/v1/redesign/account/settingsModel.test.ts`, `sync/SyncStatus.render.test.tsx`.
  - Tests: `storage/diaryRepository.test.ts` (6 new), `spend/v1/redesign/pendingChoice.test.ts` (new, 4), `spend/v1/spendDiary.test.ts` (1), `sync/syncEngine.test.ts` (1).
- **RED:** stubs first (no-op store methods, wrong but typed model results, a view that never reads choices). `npm run test:unit -w gogospend-app -- src/storage/diaryRepository.test.ts src/spend/v1/redesign/pendingChoice.test.ts src/spend/v1/spendDiary.test.ts src/sync/syncEngine.test.ts`: 68 tests, 57 passed, 11 failed. All 11 failed on assertions (`ERR_ASSERTION`), none on a missing module.
- **GREEN:** the same command: 68 passed, 0 failed. A mutation survivor (below) then added one test: 69 passed.
- **Mutation check:** checksums of the five implementation files recorded first. Each mutant was applied in place, the four focused files were run, the file was restored from a backup outside the repo, and the checksums were compared again (all five match).
  - Insert without `ON CONFLICT` (brief): 1 failed (`a pending choice is kept, replaced per record and dropped`).
  - Skip the server id check (brief): 1 failed (`a choice for a mismatched record, or one that is not a valid choice, is refused`).
  - `resendForChoice` keeps `original.version` (brief): 1 failed (`use yours resends the same changes on the server's current version`).
  - Read side skips validation (extra): survived the first run. Added `a stored choice that no longer validates is left out of the list and not deleted`; the mutant now fails 1 test.
  - No oldest-first sort (extra): 1 failed (`a pending choice is kept, replaced per record and dropped`).
- **Gate:**
  - `npm run typecheck:app`: passes.
  - `npm run test:unit`: 700 passed, 0 failed.
  - `npm run test:app`: 28 passed, 0 failed.
  - `npm run test:render -w gogospend-app` (beyond the controller's list): 83 files and 1587 tests passed on the final run (383 s). Earlier runs were timing-sensitive under machine load: one full run had 3 tests time out at the 5 s limit (two History and one catalogue render test), and one History file failed alone once, then passed 6 of 6 on re-run and on the base commit.
  - `git diff --check`: clean.
  - `npm run export:web`: not run; the controller's gate for this task does not include it.
- **Deviations:**
  - The five view files listed above changed, though the brief did not name them: the typecheck requires `pendingChoices` on every `DiaryView` value, and `SpendDiary` gained two methods.
  - `keepChoice` also checks the value types of `changes` (amount, date, record ids, text), and `readChoices` applies the same check to stored rows. The brief named only the key checks.
  - `choiceAgainst` throws a TypeError for a fresh record that is another record, as `rebaseEdit` does.
- **SKIPPED:** none. No hosted, native or device check applies to this task.
- **Notes for 1D-T9 and later:**
  - `readChoices()` leaves an invalid row in place, never deleted, so a later `keepChoice` for that record replaces it.
  - Migration 3 is fixed by the brief. Any other diary migration merged on this branch must take number 4, because `migrateDiary` requires contiguous numbers.
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

### Task 6: budgets

- **Status:** built and verified locally on `agent-aac244f4d094b532a`, on top of `60e2026`. Not pushed. The independent review is the controller's, after this receipt.
- **Files:**
  - Budgets: `apps/edge/src/vault/domain/budgets.ts`. It ports `BudgetService`: `getBudget`, `putBudget`, and `readBudget` (the read `SummaryQuery` uses; a missing month is `undefined`, and `getBudget` turns that into 404). A put reads command headers before the body (R41, If-Match `optional`). Inside the command it deletes the month's limits, writes the overall, then inserts the limits, so the Task 1 triggers can check each step. Amounts are bound with `CAST(? AS INTEGER)` and read with `CAST(... AS TEXT)`.
  - Protocol: `apps/edge/src/vault/commands/registry.ts` registers the `budget` entity (`isBudgetSnapshot`) and `budget.create` / `budget.replace` after categories, with the API's outcomes, schema version 1 and policy `current`.
  - Routes: `apps/edge/src/vault/routes.ts` (two handlers) and `apps/edge/src/v1/routes.ts` (the two budget routes move from `VAULT_PENDING_ROUTES` into `VAULT_V1_ROUTES`, with the access, gates and status of the PostgreSQL table). The table is now 21 ported, 8 pending, 28 deferred and 6 retired, which is all 63 declared routes.
  - Tests: `apps/edge/test/workers/budgets.test.ts` (20 cases, already on disk for the RED). `apps/edge/test/vault-route-coverage.test.ts` pins the two budget routes. No schema change.
- **RED to GREEN:**
  - RED, recorded before this implementation and not re-run, because the tests were not edited: `npm run test:edge:workers -- test/workers/budgets.test.ts` gave 19 failed and 1 passed (20). The pass was "another account's budget is NOT_FOUND", which is 404 for any unknown route until the route exists. The coverage pin failed as intended.
  - GREEN: the same command gave `Test Files 1 passed (1)` and `Tests 20 passed (20)`.
- **Mutation check:** `shasum -a 256` was recorded, and a copy of each file was kept outside the repo, before either mutant. Each mutant was applied in place, the focused file was run, and the file was restored. Both restores matched the original checksum.
  - M1, `budget_limits_within_overall_insert` dropped from `0000_vault_core.sql`: `Tests 2 failed | 18 passed (20)`. Both database-backstop cases resolved instead of rejecting. The direct insert of a sublimit above the overall no longer threw, and the one-call parent-then-child insert no longer threw.
  - M2, the service no longer refuses an income category (`category.type !== 'expense'` removed, trigger left in place): `Tests 1 failed | 19 passed (20)`. "sublimits need owned, active expense categories" failed: the put became a 500 (`vault_call_failed`) and `fields` was missing, where the case expects `category_limits`.
  - Restored checksums (sha256, first 8 hex): `budgets.ts` fa8e0f30, `0000_vault_core.sql` d0329a4d (unchanged by the task), `registry.ts` 0e1308bc, `vault/routes.ts` 8b563247, `v1/routes.ts` e14a8960, `budgets.test.ts` 9ffc7bc0, `vault-route-coverage.test.ts` 706a339c.
- **Gate** (repo root). The command is `npm run typecheck:edge && npm run test:edge && npm run test:edge:workers && npm run build:edge && npm run test:edge:db`.
  - An earlier full run, while sibling worktrees were busy, timed out `sync.test.ts` "defaults to 200 groups a page and refuses more than 1,000" at 5000ms (5099ms, then 5023ms). Alone, that case passed in 1.91s with this registry and in 3.36s against the previous registry, so the timeout was load, not the budget port.
  - The recorded run then passed typecheck, `test:edge` 121 (9 files), `test:edge:workers` 182 (8 files) and `build:edge`. `dist/jotbun_vault/index.js` has no `pg` or `drizzle-orm/node-postgres` import. `test:edge:db` in that same command gave `Tests 2 failed | 60 passed (62)`: the two parity sessions timed out at 30000ms. Postgres on 127.0.0.1:55432 was up and `gogospend-postgres-v1-local` was healthy, so it was not restarted.
  - Rerun of `npm run test:edge:db` once, as the contention rule allows: `Tests 62 passed (62)` (8 files).
- **Ported in full:** the HTTP cases from `budgets.integration.spec.ts` and `m4-hardening.integration.spec.ts`: create and replace, version conflict, two creates at once, minor range, duplicate and over-sum sublimits, owned active expense categories, a limit kept across rename and archive, month shape, unknown field, a missing month on replace, `category_limits` not a list, and another account's 404.
- **Ported in part:**
  - "refuses, at commit, sublimits that add up to more than the overall limit, from either side" and the income insert. PostgreSQL reports `23514` / `23503` at commit. The vault asserts the Task 1 trigger messages (`exceed the overall budget`, `expense category`) on a direct `sqlExec`.
  - "a parent lowering and a child insert committing together". Two transactions and a barrier cannot be ported: one vault call is one `transactionSync`. The case runs both orders in one call and checks the rollback leaves overall `1000` and limits `600`.
  - "a replacement lowers the overall limit under the old sublimits when the new ones fit, and reads them back in category order" and "its change is served by the sync feed as the persisted budget" are in the workers file. The first is the immediate-trigger order. The second is the registered `budget` snapshot on `GET /v1/sync/changes`.
- **Not applicable** (PostgreSQL roles and grants, row-level security, connection pools, isolation levels or lock waits):
  - "deleting an account removes its budgets and sublimits" and "a deletion routine run by a worker role that cannot read budgets still succeeds". Account deletion is 1B. The vault has no roles or grants.
  - "history and summary read from one REPEATABLE READ, READ ONLY snapshot". The vault has no isolation level. A call is one transaction.
  - "another account's budget is NOT_FOUND" holds by addressing: the other account is another vault. There is no row-level security to port.
  - The history cursor, the history dates, and "budget usage keeps a sublimit whose category was archived later" wait for Task 7, which owns those routes. The workers file says so.
- **Deviations:**
  1. The API updates the overall and then deletes limits, because its check is a deferred constraint. SQLite runs the Task 1 triggers immediately, so that order refuses a legal replacement whose new overall is under the old sublimits. The put deletes limits, writes the overall, then inserts limits.
  2. Category checks call `categoryById` once per limit (at most `MAX_BUDGET_CATEGORY_LIMITS`, 100). The API uses `= ANY($1::uuid[])`. No query binds one `?` per id (R57). `archived` is compared as `=== 1`.
  3. `readBudget` is exported. The brief names `getBudget` and `putBudget`. The API exports `readBudget` for the summary, and Task 7 needs a read that does not 404.
  4. `buildVaultRegistry` places `budget` directly after `category`. `buildContainer` constructs transactions between them. Task 5 is not in this worktree, so its block is not here yet.
- **SKIPPED (hosted):** none. No cloud resource was touched.
- **Notes for Task 5 and Task 7:**
  - Task 5: insert the transaction block in `buildVaultRegistry()` before the budget block, so the order stays wallets, categories, transactions, budgets.
  - `readBudget(c, month)` takes `YYYY-MM` and returns `undefined` when the month is unset. The row's month is `YYYY-MM-01`. Do not use `getBudget` for the summary; that 404s.
  - `categoryById` still returns `archived` as 0 or 1. A limit already on the budget may name an archived expense category; a new reference may not.
  - The registry now names the entity `budget`. Sync serves it. Task 8b's registry parity check has to cover `budget` as well as `category` and `transaction`.
- **Integration (27 Oct):** merged with Task 5 (PR #81). The registry is wallet, category, transaction, budget, in `buildContainer`'s order. The route table is now 26 ported, 3 pending (Task 7's history and summary), 28 deferred and 6 retired. On the merged tree: `typecheck:edge` passes, `test:edge` 130 passed (10 files), `test:edge:workers` 233 passed (11 files; Task 5's 213 plus these 20).

## 1B: files and background work on the vault

Phase 1B moves files and background work onto each person's vault (spec `docs/superpowers/specs/2026-10-25-jotbun-bun-wallet-cloudflare-design.md`, §8 phase 1, second part). The owner approved the `apps/api` edit that this task needs (Q1, 25 October 2026; spec §6.1, which keeps `apps/api` read-only apart from that exception). Task 1 makes the statement parser a stateless HTTP process in the API image: bytes in, a parse outcome out. Task 2 adds the file tables, the object keys, the prefix purge and the durable erase that deletion relies on.

### 1B Task 1: The stateless parse server

- **Status:** built and verified locally on `worktree-agent-a55db11c49db5b66f`, reset to `68ec183` before the work. Not pushed. The independent review is the controller's, after this receipt. The parser runs with no database and no secrets: only its input bytes reach it (C1).
- **Files:**
  - `apps/api/src/imports/parse-outcome.ts` (new): the pure parts moved out of `parse-handler.ts`, unchanged: `toPreviewRecord`, `sanitizedImageHeader` with its PNG, JPEG and WebP readers, and `magicFormat`, which is now exported. It also holds the types `CandidateRecord`, `PreviewRecord`, `SanitizedImage` and `PreviewOutcome`, and `previewFromOutcome`, which maps a parser run's outcome to a preview, a retry or an abort, with the codes the worker used. It imports nothing from `node:child_process`, `node:fs` or `node:net`; `ParserRunOutcome` is a type-only import.
  - `apps/api/src/imports/parse-handler.ts` (changed): imports the moved parts, re-exports `CandidateRecord`, `PreviewRecord`, `toPreviewRecord` and `sanitizedImageHeader` so existing imports keep working, and `run` calls `previewFromOutcome(source.format, outcome, this.memoryBudgetKb, bangkokDate(new Date()))`. `recordFor` is gone. A diff against `68ec183` shows only the moved and changed lines.
  - `apps/api/src/imports/parse-server.ts` (new): `startParseServer`, the routes `GET /health` and `POST /parse`, and the process entry (`node dist/imports/parse-server.js`, `PARSE_SERVER_PORT`, default 8080; `SHUTDOWN_TIMEOUT_SECONDS`; SIGTERM closes the server).
  - `apps/api/src/imports/parse-server.spec.ts` (new): 9 cases, Jest, Node.
  - `apps/api/release-graph.json` (changed): `imports/parse-server` added to `entries`.
- **RED to GREEN:**
  - RED (`npm run test:api -- parse-server`, with `parse-server.ts` answering 501 to every request): `Tests: 9 failed, 9 total`. Each case failed on an assertion (for example `Expected: 200, Received: 501`, or `toHaveBeenCalledTimes(1)`, `Received 0`), none on a missing module.
  - Behaviour of the moved code, checked before the server was written: `npm run test:api -- parser-runner parse-worker v1-isolation` gave `Tests: 239 passed, 239 total`, the same count as the untouched base.
  - GREEN (`npm run test:api -- parse-server`): `Tests: 9 passed, 9 total`.
- **Mutation check (brief Step 5):** `shasum -a 256` recorded for `parse-server.ts` (`d63edf95…`) and `parse-outcome.ts` (`b25d6c79…`). The originals were backed up outside the repository, each mutant was applied in place, the focused file was run, and the file was restored from its backup. The checksum matched after every restore.
  1. Size cap removed (`readBody(req, Number.POSITIVE_INFINITY)`): 1 failed, 8 passed. `refuses a body over 12 MiB with 413 before parsing`.
  2. One-at-a-time guard removed (`busy` no longer checked): 1 failed, 8 passed. `runs one parse at a time`. It fails by the 5 s test timeout rather than by an assertion: the second request waits behind the held first parse instead of being refused, and the cleanup hook then times out too.
  3. Startup verdict ignored (`options.runner ?? parsing.parse?.runner ?? null`): 1 failed, 8 passed. `answers health once the sandbox holds, and 503 when it does not`, at the down server's 503 expectation (it received 200).
  4. `spawn_failed` mapped to a rejected preview: 1 failed, 8 passed. `a child that cannot start asks to be retried`.
  5. Today header ignored (the server's UTC date used): 1 failed, 8 passed. `uses the request's today`, at the second request the spec adds. On this machine's clock of 25 October, the brief's single request (header `2026-10-25`, row `2026-10-26`) still passes under this mutant, so the added request with header `2026-10-27` is what catches it.
  - The mutant runs invoked Jest directly from `apps/api` with the package script's flags plus `--forceExit`, because mutant 2 leaves connections open and Jest would wait on them. The flag changes no pass or fail result.
- **Gate** (repo root):
  - `npm run build -w gogospend-api`: passes, 293 files compiled.
  - `node apps/api/scripts/release-graph.mjs check`: no problems; 149 files, 9 direct packages, 123 packages in the closure.
  - `npm run typecheck`: exit 0.
  - `npm run test:api` (the full API unit suite), run 1: `Test Suites: 1 failed, 43 passed, 44 total`; `Tests: 1 failed, 953 passed, 954 total`. The failure is `parser-runner.spec.ts`, `the parser child: XLSX › rejects an entry whose header understates its size`, which exceeded Jest's default 5000 ms timeout in a real child parse. The file passed in the three-suite run above (239 tests). Jest also reported that a worker failed to exit gracefully. The new spec passed in this run.
  - `npm run test:api` (the full API unit suite), run 2: `Test Suites: 44 passed, 44 total`; `Tests: 954 passed, 954 total`, exit 0. The XLSX case passed in this run, so run 1's timeout was intermittent under load. The brief forbids weakening a test, and `parser-runner.spec.ts` is outside this task's files, so its timeout is unchanged. The controller may want to look at it.
  - `npm run test:db -w gogospend-api -- import-preview`: run 1 gave `Tests: 1 failed, 42 passed, 43 total`. The failure is one wall-clock budget, `expect(elapsed).toBeLessThan(2_000)`, in the duplicate-advice case for 5,000 identical rows, which received 2055 ms. The timed request is a database read, and nothing on its path changed. Run 2, in the foreground, gave `Tests: 43 passed, 43 total`, exit 0. Run 1 started straight after the local database came up.
  - Edge gate, the brief's five commands in order, each exit recorded: `typecheck:edge` exit 0; `test:edge` 9 files, 121 passed; `test:edge:workers` 5 files, 128 passed; `build:edge` exit 0; `test:edge:db` 8 files, 62 passed. `npm run db:v1:up` ran before the database suite, and `npm run build -w gogospend-api` ran before the gate.
  - Built `dist` entry, no Docker (`PARSE_SERVER_PORT=18080 node apps/api/dist/imports/parse-server.js`): `GET /health` 200 `{"status":"ok"}`; an unknown route 404; a bad format 400; a CSV POST parsed to one candidate (`amount_minor` "100"); SIGTERM logged "parse server: stopping (SIGTERM)" and the process exited 0 (checked in the foreground with `wait`).
  - Docker proof (brief Step 6, local Docker): `docker build -f apps/api/Dockerfile -t jotbun-parser-local .` exit 0. `docker run -d --rm -p 8080:8080 jotbun-parser-local node dist/imports/parse-server.js` (the brief's command, detached) logged `parse server: listening`; `GET /health` answered `{"status":"ok"}`; a CSV POST to `/parse` parsed to one candidate (`amount_minor` "100"); `docker stop` exited 0 and the container was removed.
- **Deviations from the brief:**
  1. `parse-server.ts` also answers a `500` with `{"error":"internal"}` when a request fails unexpectedly, and logs `parse server: request failed (<class>)`. The brief names no reply for that case.
  2. Logging is one count line per child run (`parse server: ran <n>`), plus the startup check's fixed alert line, which the process entry prints. Nothing else is logged.
  3. Past the cap the server stops buffering, answers 413 at once, and keeps none of the rest of the body.
  4. The spec adds a second request to the date case (see mutant 5).
  5. The real-child JPEG case is never skipped. `parser-runner.spec.ts` has no skip guard around its real-child image cases either, so "skipped exactly when" holds trivially.
  6. The server starts listening even when the sandbox check fails, so `/health` answers 503, as the brief requires. The startup check runs before the port opens.
- **SKIPPED (hosted):** Nothing deployed, and no cloud resource was created. The Docker proof ran on local Docker only.
- **Notes for 1B-T5 (the Queue consumer):**
  - `not_started` means no child ran: the consumer spends no attempt on it.
  - `retry` with `parser_unavailable` or `parser_sandbox_unsupported` means a child could not run; the consumer spends an attempt.
  - A `parsed` reply carries the record, plus the image as base64 when one was sanitized.

### 1B Task 2: The files schema, object keys, the prefix purge and a durable erase

- **Status:** built and verified locally on `worktree-agent-a78d807d216fc00fa`, from `68ec183`. Not pushed. The independent review is the controller's, after this receipt.
- **Files:**
  - Schema: `apps/edge/src/vault/migrations/0001_vault_files.sql` (every table STRICT; 15 new tables; the release trigger; the import progress guard; the purge index on `entity_changes`). `migrations/index.ts` gains journal entry `idx` 1 (`when` 1761436800000, `m0001`). `schema.ts` gains 15 Drizzle tables, and `VAULT_CORE_TABLES` now lists 29. `0000_vault_core.sql` is unchanged.
  - Keys and purge: `apps/edge/src/vault/files/keys.ts` (`VAULT_OBJECT_PURPOSES`, `vaultObjectKey`, `vaultPrefix`, `VaultBucket`) and `files/purge.ts` (`purgeVaultObjects`).
  - Erase: `src/vault/user-vault.ts` (`erased`, `erase()`, the `erased` guard at the top of `call()`); `src/vault/session.ts` (`ensureAccount` refuses a `deleted` marker with 403 `ACCOUNT_UNAVAILABLE` before the owner comparison, and writes nothing).
  - Worker and types: `apps/edge/wrangler.vault.jsonc` (`r2_buckets`: `OBJECTS` on `jotbun-private-objects`, the bucket `wrangler.jsonc` already binds); `src/cloudflare-workers.d.ts` (the shim additions the brief lists).
  - Tests: `test/workers/vault-schema.test.ts` (the 29-table list, migration counts of 2, and the receipt trigger case); `test/workers/files-erase.test.ts` (new, 6 cases).
- **RED to GREEN:**
  - RED, `npm run test:edge:workers -- test/workers/vault-schema.test.ts test/workers/files-erase.test.ts`, before any table, key or erase code: `Test Files 2 failed (2)`, `Tests 8 failed | 6 passed (14)`. Seven of the eight failures are assertions: the erase case still found a consent row, the sleep case got `200` where `403` was expected, the purge cases got `0` where `5` and `1001` were expected, the key case got `''`, and the table list and the migration count (`1` where `2`) failed. The receipt trigger case failed with a thrown `no such table: vault_objects` while seeding, because the table did not yet exist. That is a thrown error, not an assertion. The six passing cases are the existing drift, foreign-key, command-log, null-key, category and digest tests.
  - GREEN, same command: `Tests 14 passed (14)`, after the migration, the schema, the keys and purge, `erase()` and the guard were written.
  - Added after GREEN: `an erased instance refuses every call, even when its marker is missing`. It passed on its first run, because the guard was already in place. It kills M5 below. It covers the one case the marker cannot: an erase that fails after `deleteAll()` and before the marker is written, in the same instance.
  - Full suites in the gate: `test:edge` 121 passed (9 files); `test:edge:workers` 135 passed (6 files).
- **Mutation check** (brief Step 6, plus three extras): `shasum -a 256` recorded for the five files mutated; originals backed up outside the repo; each mutant applied in place; the two focused files run; each file restored and compared. `shasum -c` reports all five OK after restore.
  - M1, purge deletes only the first page: `purgeVaultObjects pages through more than one listing` failed; 14 of 15 passed.
  - M2, purge lists `${purpose}/` without the vault id: `deletes every object ... nothing of another vault` failed; 14 of 15 passed.
  - M3, the release trigger on `transaction_attachments` never fires (`WHEN 0`): the receipt trigger case failed (`retained` where `released` was expected); 14 of 15 passed.
  - M4, `erase()` writes no marker: `erase empties the vault ...` and `an erased vault stays erased after it sleeps` failed (an empty `account_state`, and `200` where `403`); 13 of 15 passed.
  - M5 (extra), the `erased` guard removed from `call()`: `an erased instance refuses every call ...` failed (`200` where `403`); 14 of 15 passed.
  - M6 (extra), `ensureAccount` no longer refuses a `deleted` marker: the sleep case failed (`500` where `403`); 14 of 15 passed.
  - M7 (extra), `vaultObjectKey` accepts any vault id: `vault object keys pass the store's key rule ...` failed (no throw); 14 of 15 passed.
- **Gate:** `npm run typecheck:edge && npm run test:edge && npm run test:edge:workers && npm run build:edge && npm run test:edge:db`, from the worktree root, exit 0. Typecheck passes; `test:edge` 121 passed (9 files); `test:edge:workers` 135 passed (6 files); `build:edge` passes; `test:edge:db` 62 passed (8 files), with Docker up through the script's own `db-up` step.
- **Deviations and calls** (for the reviewer):
  - `source_row_id` in `import_candidates`, `import_selection_rows` and `import_row_progress` uses the API's pattern `^(row:[1-9][0-9]{0,7}|image:1)$`, written as `GLOB`, a length check and a digit-only check. The brief's bare `GLOB 'row:[1-9]*'` would accept `row:1x`.
  - Key-shape CHECKs on the columns that hold keys, ported from the API's `starts_with` checks: `vault_objects` (the purpose is the key's first segment), `snapshot_chunks` (`sync_snapshot/`), `import_parts` (`import_quarantine/`), `import_previews.image_key` (`import_image/`), `attachments` (`receipt/…/image.<ext>`, matching the content type), and `exports` (the `export/` prefix, with the export id in the vault id's place, by position: the vault id is 64 characters).
  - Indexes beyond the brief's two (`vault_objects_due_idx`, `entity_changes_purged_idx`): the API's maintenance indexes on the same tables (`exports_requested_idx`, `import_uploads_receiving_idx`, `import_uploads_accepted_expiry_idx`, `import_previews_due_idx`, `import_selections_job_idx`, `import_selections_expiry_idx`, `attachments_released_idx`, `transaction_attachments_attachment_idx`).
  - Dropped, as the brief says: the timestamp-window CHECKs (`receive_deadline`, the `expires_at` windows, `expires_at > ready_at`). Control-character checks are dropped too, as in `0000`.
  - The `sha256` columns hold 64 lowercase hex characters (checked with `GLOB`), where the API used `bytea` with `octet_length(...) = 32`.
  - `vaultPrefix` validates the purpose and the vault id as well (the brief named only `vaultObjectKey`). `purgeVaultObjects` deletes only the listed keys that start with the prefix.
  - The Drizzle table for `exports` is exported as `exportsTable`. The SQL table is `exports`.
  - The shim additions are all in `cloudflare-workers.d.ts`. `idFromString`, `getByName`, `state.id`, the cursor members and `databaseSize` are typed for later tasks and unused here.
- **SKIPPED:** deployed R2 (lifecycle rules, the binding on Cloudflare). Miniflare simulates `OBJECTS` locally; no cloud resource was touched.
- **Concerns for the integrator:**
  - `erase()` is not one atomic step. It runs `deleteAll()`, then the migrations, then the marker insert. If the marker insert fails after `deleteAll()`, nothing in storage records the erase, and a later call could create the account again. The in-memory `erased` flag covers only the instance that failed. 1C's deletion should block sign-in in D1 first (§6.12, step 1) and retry `erase()` until the marker reads back. The alternative is one `transactionSync` that deletes the rows and writes the marker, which needs no re-migration. That choice is the controller's.
  - The purge loops until a listing comes back empty, with no iteration cap. A bucket that kept listing the same keys would never end. 1C's Workflow step should bound its own time.

### 1B Task 3: the files front door

- **Status:** built and verified locally on this worktree, from `9924cca` (the files schema on the integration head). Not pushed. The independent review is the controller's, after this receipt.
- **Files:**
  - New, `apps/edge/src/v1/`: `fresh-sign-in.ts` (`FRESH_SIGN_IN_SECONDS`, `assertFreshSignIn`), `worker-routes.ts` (`VaultSession`, `WorkerContext`, `vaultSession`, `workerSessionFor`, `WORKER_HANDLERS`) and `bridge.ts` (the `bridge.catalogue` handler and its per-isolate catalogue cache).
  - Protocol: `protocol.ts` (`authTime` on `VaultClaims`, `VaultAccess`, required `VaultCall.charge`, `WorkerRouteId`). `routes.ts` adds `VAULT_STEP_ROUTES` and `stepRouteOf`, extends `VaultRoute` with `recent_proof`, `worker` and `body`, and moves `GET /v1/bridge/gogocash/catalogue` out of `VAULT_DEFERRED_ROUTES` into `VAULT_V1_ROUTES` as a public Worker route. `vaultStatusOf` uses the step's status, or 200, when the id is not an HTTP route.
  - Front door: `handler.ts` runs a Worker route after the gates (a public one with no token, any other after the client version and the token), sets `charge` from the method on a vault route, and accepts `waitUntil` and `fetchCatalogue` on its deps. `tokens.ts` checks `auth_time`. `config.ts` keeps `uploads` unexposed unless `IMPORT_UPLOADS_ENABLED` is `1` or `true`, on the open path and the fail-closed path. `env.ts` gains `OBJECTS`, `IMPORT_UPLOADS_ENABLED`, `GOGOCASH_BRIDGE_ENABLED` and `GOGOCASH_CATALOGUE_URL`. `wrangler.vault.jsonc` sets the two flags to `"false"`.
  - Vault: `user-vault.ts` `call()` resolves `vaultRouteOf(id) ?? stepRouteOf(id)` and skips both budgets when `charge` is `'step'`. `recent_proof` is policy-exempt, like `bound_session`.
  - Tests: `test/workers/files-front-door.test.ts` (7), `test/workers/config.test.ts` (the uploads case; 6 in the file), `test/vault-route-coverage.test.ts` (the worker-or-vault check; the pin lists the bridge), `test/workers/support/v1-client.ts` (`authTime`, `startV1` options) and `test/workers/front-door.test.ts` (`charge: 'write'` on the hand-built call).
- **RED to GREEN:**
  - RED, workers (`npm run test:edge:workers -- test/workers/files-front-door.test.ts test/workers/config.test.ts`), with the stubs in place (empty step table, `stepRouteOf` returning undefined, `assertFreshSignIn` never throwing, `workerSessionFor` passing `config.policies` unfiltered, bridge handler answering 501): `Test Files 2 failed (2)`, `Tests 8 failed | 5 passed (13)`. All 7 new front-door cases failed on assertions: 501 where 404 and 200 were expected, no throw from `assertFreshSignIn`, 200 where a future `auth_time` must be 401, 500 where the step id must be 200, 429 on call 121 of one session, and terms v2 still present in the session's policies. The new config case failed (`isExposed('uploads')` was true). The 5 passes are the existing config cases.
  - RED, Node (`npm run test:edge -- test/vault-route-coverage.test.ts`): `Tests 6 passed (6)`. The new structural checks passed on the stub, because the stub had already moved the bridge route and registered a handler. They do not exercise the 501 body.
  - GREEN, same workers command: `Tests 13 passed (13)`. GREEN, Node: `Tests 6 passed (6)`.
- **Mutation check:** `shasum -a 256` recorded before any mutant, originals kept in `/tmp/1b-t3-mutation` (outside the repo). Each mutant was applied in place, `files-front-door.test.ts` was run, and the file was restored. `shasum -c` reported OK after every restore. Final checksums match the recorded ones: `worker-routes.ts` `92e8ca0c…24df`, `tokens.ts` `1ad212b7…f77b`, `user-vault.ts` `6033f280…217d`.
  - Charge every call (`vaultSession` sends the route's charge on every call, never `'step'`): `Tests 1 failed | 6 passed (7)`. "only the first vault call of a request is charged" got 429 on A's 121st call. Caught.
  - Pass `config.policies` unfiltered: `Tests 1 failed | 6 passed (7)`. The live-policies case still saw terms v2. Caught.
  - Accept a future `auth_time` (no upper bound): `Tests 1 failed | 6 passed (7)`. The future token got 200 where 401 was expected. Caught.
  - Drop the step fallback in `call()`: `Tests 1 failed | 6 passed (7)`. The step-only case got 500 `INTERNAL_ERROR`. Caught.
- **Gate** (`npm run typecheck:edge && npm run test:edge && npm run test:edge:workers && npm run build:edge && npm run test:edge:db`, from the worktree root, after `npm run build -w gogospend-api`; the database script runs its own `db-up`):
  - `typecheck:edge`: passes.
  - `test:edge`: 122 passed (9 files). The baseline at this head was 121; the new coverage case is the extra one. The node catalogue tests logged `cashback_catalogue_rejected` and `cashback_catalogue_unavailable` and passed.
  - `test:edge:workers`: the chained run hit `Tests 1 failed | 176 passed (177)`. `sync.test.ts` "defaults to 200 groups a page and refuses more than 1,000" timed out at 5000ms. That file alone then passed, `Tests 12 passed (12)` in 2.20s of tests. A full workers rerun passed, `Tests 177 passed (177)` in 9 files. The timeout was parallel load, not an assertion. The 177 include the 7 new front-door cases and the new config case.
  - `build:edge`: passes. `dist/jotbun_vault/` was produced with the rest of the edge build.
  - `test:edge:db`: 62 passed (8 files). `gogospend-postgres-v1-local` was already healthy and port 55432 was reachable, so it was not restarted.
- **Ported in full:** the public catalogue through the front door (404 `NOT_FOUND` with `cache-control: no-store` while the bridge is off; the built-in brands, every link on `https://gogocash.co`, when the live fetch rejects; the v1 headers and a HEAD with no body). `CashbackCatalogueSource` is reused, not copied. `auth_time` is optional and, when present, an integer from 0 through now plus 30 seconds. `assertFreshSignIn` is the 300-second window with that same tolerance. A request's first vault call carries the route's charge and every later call is `'step'`. Uploads stay unexposed unless the release flag is `1` or `true`.
- **Ported in part:** none. No route calls `assertFreshSignIn` yet. The export task applies it after its receipt lookup.
- **Not applicable:** this task ports no PostgreSQL suite. There is no role, grant, row-level security, pool, isolation or lock-wait case to move. The edge's existing catalogue tests stay on the node runner.
- **Deviations:**
  1. `startV1`'s `env` override is a `Proxy` over the Workers `env`. A copied object would drop the `VAULT` and `CONFIG` bindings.
  2. The future-`auth_time` test reads the epoch second early in that second, so `now + 31` cannot fall back inside the 30-second tolerance if the second rolls over while the request runs.
  3. `fetchCatalogue` reaches the cache through `bindCatalogueFetch`, called immediately before the handler. `WorkerContext` stays as specified. The handler reads the source before its first await, so two requests cannot swap fetches.
  4. A `body: 'stream'` route still calls `readJsonBody`, as the dispatcher does. A non-JSON body stays unread and is the stream. A JSON body is parsed, and there is no stream.
  5. The coverage pin now lists `GET /v1/bridge/gogocash/catalogue`, and the test name says so. The table would otherwise fail its own "nothing else" check.
- **SKIPPED (hosted):** nothing deployed, and no cloud resource was created. The two new vars are local wrangler settings.
- **Notes for later tasks:**
  - A Worker route is one `VAULT_V1_ROUTES` entry with `worker` and a `WORKER_HANDLERS` function, and no `vault` id. `GET /v1/policies` still has neither.
  - A step-only id goes in `VAULT_STEP_ROUTES` and `VAULT_HANDLERS`, and not in `VAULT_V1_ROUTES`. `call()` resolves it. `vaultStatusOf` returns the step's status, or 200.
  - `vaultSession` charges on the first call only. `workerSessionFor` uses `livePolicies` and a charge from the method (`GET` is `'read'`).
  - `assertFreshSignIn(claims, nowSeconds)` throws 401 `REAUTH_REQUIRED` outside `[now - 300, now + 30]`. Nothing calls it until the export command.
  - `claims.authTime` is set only when the token's `auth_time` is an integer in range. The test client sets it through `TokenOptions.authTime`.
  - `IMPORT_UPLOADS_ENABLED` must be `1` or `true` before an uploads route is exposed. `wrangler.vault.jsonc` leaves it `"false"`.
  - `deps.fetchCatalogue` and `deps.waitUntil` are on `handleVaultV1`. The catalogue cache is one source per combination of the flag, the URL and the fetch function.
  - `recent_proof` is a vault access and skips the policy check. No route uses it yet.
  - `OBJECTS` is on `V1Env`. The binding was already in `wrangler.vault.jsonc`.
- **Integration (27 Oct):** merged after Tasks 5 and 6 of 1A (PRs #81, #80); only the receipts conflicted. On the merged tree: `typecheck:edge` passes, `test:edge` 130 passed (10 files), `test:edge:workers` 240 passed (12 files).

## 1D: live pokes, the pending choice and PostHog

Phase 1D adds live pokes, the pending choice, PostHog and the two-phone proof (plan 1D, in the controller's brief). Task 2 puts PostHog's proxy on the HTTP Worker.

### 1D Task 2: The PostHog proxy on the Worker

- **Status:** built and verified locally on `worktree-agent-aecc9854530b3e914`, reset to `68ec183` first. Committed locally, not pushed. The independent review is the controller's, after this receipt. The independent review is the controller's, after this receipt.
- **Files:**
  - `apps/edge/src/analytics/posthog-proxy.ts`: the constants, `isPostHogProxyPath` and `proxyPostHog`. It forwards GET, HEAD and POST under `/ingest/` to `eu.i.posthog.com`, and `/static/` and `/array/` to `eu-assets.i.posthog.com`, keeping the query. It sends no cookie, authorization, host, content-length, connection, forwarded, x-real-ip, true-client-ip, x-forwarded-*, cf-* or x-gogospend-* header, and no other client-address header (see deviations). It uses `redirect: 'manual'` and removes `set-cookie` from PostHog's answer. A body over 5 MiB (`POSTHOG_PROXY_BODY_LIMIT_BYTES`) is 413: refused by its declared length before any byte is read, or by a byte counter that cancels the stream past the limit. Other methods are 405 with `allow`. A body that cannot be read is 400. A failed fetch logs `posthog_proxy_failed` through `logFailure` (`src/v1/log.ts`, the class name only) and answers 502 with no body.
  - `apps/edge/src/server.ts`: the default export's `fetch` answers `/ingest/*` with `proxyPostHog` before TanStack Start. Every other request goes to `handler.fetch` with its arguments, as before.
  - Test: `apps/edge/test/posthog-proxy.test.ts`, 9 Node tests: the six in the brief, a body that cannot be read, the other client-address headers, and the HTTP Worker dispatch (it imports the real `src/server.ts` and spies on TanStack's `fetch`).
- **RED to GREEN:**
  - Typed stub first: `proxyPostHog` answers 404, `isPostHogProxyPath` returns false, and the constants are final.
  - RED, against the stub: `npm run test:edge -- test/posthog-proxy.test.ts`: 7 failed, 0 passed. All seven failures are assertions (`expected 404 to be 413`, `... 405`, `... 400`, `... 502`, `expected [] to have a length of 1`, `expected [] to deeply equal ...`). None is a missing module.
  - GREEN: the module, then the dispatch. The same command: 7 passed. After that the dispatch and other-headers tests were added and the body test was made finite (see deviations): 9 passed, 0 failed. `npm run typecheck:edge` passes.
- **Mutation check (brief Step 6):** `shasum` of `posthog-proxy.ts`, `server.ts` and `posthog-proxy.test.ts` recorded; originals backed up in the scratchpad, outside the repo. Each mutant was applied in place, the focused file run, the file restored from its backup, and its checksum compared (OK after each).
  - M1, stop stripping `x-forwarded-*` (x-forwarded-for forwarded): 2 failed, the batch test as the brief expects, and the other-headers test.
  - M2, take the target host from the request's `host` header: 1 failed, the host test.
  - M3, drop the body limit (both the declared-length and the counting check): 1 failed, the 413 test.
  - M4, `server.ts` back to `fetch: handler.fetch`: 1 failed, the dispatch test (`/ingest/*` reached TanStack Start). This is the RED for the dispatch test, which was added after GREEN.
  - M5, forward `x-client-ip`: 1 failed, the other-headers test. This is the RED for that test, which was added after GREEN.
  - M6, keep `set-cookie` in the answer: 1 failed, the batch test.
  - M7, `redirect: 'follow'`: 1 failed, the batch test.
  - No survivors.
- **Gate** (worktree root: `npm run typecheck:edge && npm run test:edge && npm run test:edge:workers && npm run build:edge && npm run test:edge:db`): passes, exit 0.
  - `typecheck:edge`: passes.
  - `test:edge`: 130 passed (10 files). It was 121 (9 files) before this task, and the 9 new tests are the difference.
  - `test:edge:workers`: 128 passed (5 files). This task adds no workers test.
  - `build:edge`: passes. The HTTP Worker (`dist/server/index.js`, with the `/ingest` dispatch) and the four background Workers build.
  - `test:edge:db`: 62 passed (8 files). The script starts `db:v1:up` itself.
  - `node --test scripts/ci/lockfile-bindings.test.mjs`: 2 passed. No lockfile changed.
- **Deviations:**
  - The stripped headers go beyond the brief's list. The brief's list is kept, and `x-client-ip`, `x-cluster-client-ip`, `x-originating-ip`, `x-remote-ip`, `x-remote-addr` and `fastly-client-ip` are stripped too, so that "every client IP header" (spec §7) holds. They are tested.
  - Tests beyond the brief: the unreadable body (400), the other client-address headers, and the dispatch. The brief's six tests keep their names and assertions.
  - The streamed-body test was made finite after GREEN. An endless stream would grow memory without bound under mutant M3. It is now 64 MiB in 1 MiB chunks, and it asserts that the proxy cancels it within two chunks past the limit, the same claim as before.
  - A path that is not proxied (for example `/ingest` alone) answers 404 when `proxyPostHog` is called directly. The brief does not say.
  - The default `fetch` is a wrapper, `(input, init) => fetch(input, init)`, because the Workers runtime refuses an unbound call to the global `fetch` (the note in `src/server/http/fetch.ts`).
  - The body is typed `Uint8Array<ArrayBuffer>`. TypeScript 6 types a plain `Uint8Array` as `ArrayBufferLike`, which `BodyInit` rejects.
  - The heading is the controller's, `## 1D: live pokes, the pending choice and PostHog`. The global constraints add "and the proof" to it.
  - The dispatch forwards the handler's own argument tuple (`Parameters<typeof handler.fetch>`), not the bare `fetch` property. Non-ingest requests get the same arguments as before.
- **SKIPPED (hosted):**
  - No request reaches PostHog EU. No project or keys exist (Q5), so `POSTHOG_PROJECT_TOKEN`, `ANALYTICS_ID_KEY` and `EXPO_PUBLIC_POSTHOG_KEY` are unset. The upstream was exercised against a fake `fetch` only.
  - `/ingest/*` on a deployed or `wrangler dev` Worker: not run. No hosted resource was touched.
- **Notes for Task 3 and later:**
  - This proxy only forwards. The server events (1D-T3) use `posthog-node` and do not go through it.
  - The route lives on the HTTP Worker (`src/server.ts`). The vault Worker does not serve `/ingest/*`.
  - The `/v1/sync/live` upgrade bypass (1D-T12) belongs in the same dispatch in `src/server.ts`.
  - The body and its `content-encoding` pass through unchanged, as PostHog's guide does. Only the fake `fetch` has answered so far, so a compressed upstream answer has not been run.

## Not done, or follow-ups

- **Sheets and the iOS keyboard (found on the simulator, 28 October):** `ui/Sheet.tsx` does not move for the keyboard. Tell Bun's field takes focus as its sheet opens, so the keyboard covers whatever sits low in the sheet: the draft after Read it, and, when the sheet is short (Bun's help on, nothing read yet), the whole sheet, leaving a dimmed screen and a keyboard. The browser catalogue and the render tests have no on-screen keyboard, so neither shows it. Proposed fix: lift the sheet by the keyboard's height in `Sheet` (a `KeyboardAvoidingView` with `padding` on iOS), and close the keyboard when Tell Bun shows a draft.
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
| Easier for Thai and SEA users | Thai catalog for every string; Buddhist-era dates; the Thai everyday pack; the Thai sentence parser (Thai number words); bank slips; AI figures worded in Thai; the `000` key; Dynamic Type to AX5. | Done in code; the owner's screenshot approval (E2) is pending. Contact sheets sent 24 October; checked on the iOS simulator 28 October. |
| Premium haptic feedback | One vocabulary of moments (`motion.haptic`), an On/Subtle/Off setting, 22 screens and components calling `playHaptic`. | Done in code; not yet felt on a real device. |
| AI that people love and use daily | Tell Bun (sentences and slips), Ask Bun (grounded figures, follow-ups), Bun's daily note, "often logged" chips; `claude-opus-5-5` with fallbacks; consent, daily limits and grounding on the server. | Done in code with a scripted model; live calls wait for an Anthropic key. |
| Trust, and a bridge to GoGoCash | The cashback card: a count, never a guessed amount; asked once; "Why am I seeing this?" and "How cashback works"; matching on the phone, nothing sent; Open GoGoCash with no diary data. | Done. A hosted GoGoCash catalogue URL is still to come. |

## P2: Bun Wallet core

Phase P2 builds the Bun Wallet area on the app. Task 7 replaces the Thai everyday list with C3's nine and keeps the routed Categories screen on today's seven until that screen is allowed to switch.

### P2 Task 7: Thai everyday pack

- **Status:** built and verified locally on `p2/t7-thai-pack`, on top of `60e2026`. Not pushed. The independent review is the controller's, after this receipt.
- **Files:**
  - `apps/app/src/spend/v1/redesign/planning/thaiPack.ts`: C3's nine (`THAI_EVERYDAY_PACK`), today's seven (`PACK_BEFORE_C3`), matching over the Thai name, the English name and every alias, `packCommands`'s `only` filter, `packKeyOf` and `analyticsCategoryKey`.
  - `apps/app/src/spend/v1/redesign/planning/thaiPack.test.ts`: the brief's cases. The hue and uniqueness test stays. The existing skip assertion now expects C3's missing keys.
  - `apps/app/src/screens/redesign/planning/CategoriesScreen.tsx`: both calls pass `PACK_BEFORE_C3`, so the routed screen still offers today's seven.
- **RED to GREEN:**
  - RED, `npm run test:unit -w gogospend-app -- src/spend/v1/redesign/planning/thaiPack.test.ts`: 1 failed, 0 passed. The file failed to load: `The requested module './thaiPack.ts' does not provide an export named 'PACK_BEFORE_C3'`.
  - GREEN, the same command: 9 passed, 0 failed.
- **Mutation check:** `thaiPack.ts` was copied to `/tmp/p2-t7-thaiPack.ts` before either mutant. sha256 `9769b5501eeb286b7a9306dc352e28d3722ee2991931a1b16ed2c5ea0622ad22`. Each mutant was applied in place, the focused file was run, and the file was restored with `cp`. The checksum matched after both restores.
  - Aliases dropped from `foldedNames` (Thai and English only): 1 failed, 8 passed. `a person who added the earlier pack gets no second delivery or top-up category` failed, as the brief expects.
  - `packKeyOf` ignores the category type: 1 failed, 8 passed. The second assertion failed: expected `null`, actual `'pets'`.
- **Gate** (worktree root, after the file was restored). The edge database suite was not run.
  - `npm run test:unit -w gogospend-app -- src/spend/v1/redesign/planning/thaiPack.test.ts`: 9 passed, 0 failed.
  - `npm run test:render -w gogospend-app -- src/screens/redesign/planning/CategoriesScreen.render.test.tsx src/dev/catalogue/CatalogueScreen.render.test.tsx`: 2 files passed, 318 tests passed. The routed screen still adds today's six missing categories when Pets is already there (`สั่งอาหารเดลิเวอรี่`, `ค่าโทรศัพท์และเน็ต`, and the other four).
  - `npm run typecheck -w gogospend-app`: passes. The brief does not name it. The render runner does not typecheck, so it was run once on the restored code.
- **English names, drafts for E2-C.** C3's English, not yet shown by the routed screen: Family support, Merit making, Delivery, Motorbike taxi and rail, Mobile top-up, Convenience store, Lottery, Pets, From family. The screen still shows today's seven, including Food delivery and Phone and internet.
- **Ported in full:** not a port. The items stay ordinary custom categories (D18), named in the person's language.
- **Not applicable:** PostgreSQL roles, grants, row-level security, connection pools, isolation levels and lock waits. This task does not query the vault.
- **Deviations:**
  1. The existing skip test expected `family_out`, `delivery`, `phone`, `lottery`, `family_in`. It now expects `family_out`, `delivery`, `motorbike_rail`, `topup`, `seven`, `lottery`, `family_in`, because `missingPackItems` defaults to C3. The inputs are unchanged: folded `ทำบุญ`, folded `PETS`, `From family` typed as an expense, and a null label.
- **SKIPPED (hosted):** nothing deployed. No cloud resource was created.
- **Notes for later tasks:**
  - P2-T38 switches the two `CategoriesScreen` calls from `PACK_BEFORE_C3` to `THAI_EVERYDAY_PACK`.
  - R23: analytics names and the consent gate stay with 1D. This task exports `analyticsCategoryKey` and the pack keys. `apps/app/src/analytics` was not edited. The key is the built-in key, else the pack key, else `custom` (R61). No category (a transfer) is `null`.
  - The spec's C3 line says a pack category is tagged with a `pack_key`. This task recognises one by its folded name. Nothing is stored. 1D can take its allow-list from `THAI_EVERYDAY_PACK.map((item) => item.key)`.
  - R81: wallet types were not touched. No `ewallet`.
  - `packKeyOf` and `missingPackItems` share `foldedNames`, so an alias matches both. The named `packKeyOf` test uses the primary Thai name, with spaces. Dropping aliases fails the earlier-pack test.

### P2 Task 1: Bun Wallet palette, materials, type roles and WalletText

- **Status:** built and verified locally on `p2/t1-palette`, merged with `origin/claude/p1a-vault-core` at `bdf6b12`. Not pushed. The independent review is the controller's, after this receipt.
- **History:** an earlier session wrote the code and the plan's tests and left them uncommitted, with no RED and no receipt. They were committed unchanged as `b702b12`, then merged (`5486508`). This session added the tests below, took the RED against placeholders, ran the mutation check and the gate. The code is unchanged apart from comments on `WalletColors`.
- **Files:**
  - `apps/app/src/theme/walletPalette.ts`: `WalletColors` (the plan's table, each token with its use as a comment), `walletLight`, `walletDark`, `getWalletColors`; the five materials (`WalletMaterial`, `WALLET_MATERIALS`, `MaterialPaint`, `materialPaint`); the calendar ramp (`CalendarStep`, `CALENDAR_STEP_LIMITS_BAHT`, `calendarPaint`); `tileTint`; `WALLET_TEXT_PAIRS` (19) and `WALLET_GRAPHIC_PAIRS` (7).
  - `apps/app/src/theme/walletType.ts`: `WalletTextRole`, `WALLET_TYPE`, `amountMaxScale`, `walletLineHeight`.
  - `apps/app/src/wallet/WalletText.tsx`: `WalletText` and `WalletTone`.
  - `apps/app/src/theme/ThemeProvider.tsx` (shared): the context value and `ThemePreferenceOverride` gain `wallet: WalletColors`; `useWalletColors()`.
  - Tests: `walletPalette.test.ts` (5), `walletType.test.ts` (3), `WalletText.render.test.tsx` (4).
- **Contrast, measured** (`contrast.ts`, WCAG 2.x): W24's light bar `#8B76DA` on white 3.68:1 (the board's `#DCD3F7` is 1.43:1); dark bar `#6E5FB8` on `#1A1920` 3.32:1; the dashed line `#8A879A` on white 3.49:1 (the board's `#B9B5C8` is 2.00:1) and `#6E6B7A` on `#1A1920` 3.36:1; W23's dark peach text 6.56:1. The lowest text pair is light `under` on `ground`, 4.55:1; the lowest material stop is dark silk's `#6A5AC2`, 4.91:1; the lowest calendar day number is dark step 3, 4.74:1.
- **RED to GREEN:**
  - RED, against placeholders with the real types and wrong values (every `#RRGGBB` in `walletPalette.ts` set to `#000000`; `walletType.ts` with size 10, scale 1, `amountMaxScale` 99 and `walletLineHeight` 0; `WalletText` in DM Sans with no colour, size or scale), swapped in with `cp`; `tsc` passed with them in place.
    - Node (`npm run test:unit -w gogospend-app -- src/theme/walletPalette.test.ts src/theme/walletType.test.ts`): `tests 8, pass 0, fail 8`, every failure an `AssertionError`.
    - Render (`npm run test:render -w gogospend-app -- src/wallet/WalletText.render.test.tsx`): `Tests 4 failed (4)`.
    - Restored with `cp`; sha256 before and after match.
  - GREEN, the same commands: Node `tests 8, pass 8, fail 0`; render `Tests 4 passed (4)`.
- **Mutation check:** 18 mutants, each applied from a backup with `sed`, the focused Node and render files run, the file restored with `cp`; the four files' sha256 match before and after. All killed:
  - From the plan: `barPast` back to `#DCD3F7` (the pairs test); dark `quietText` `#E9E6F2` (the material test: silk's `#6A5AC2` falls to 4.43:1); body `maxScale` 3.571 (the AX5 test); DM Sans for English (the WalletText test).
  - Added: the edge on every dark material; the border on step 1; the dark day-number guard at step 4; Latin leading 1.5; Thai leading in every locale; the override keeping the parent's `wallet`; the provider's own `wallet` always light; `Math.min` to `Math.max`; `getWalletColors` always light; the dark tint at 28%; the dark tint over white; light titanium in ink; no `maxFontSizeMultiplier`; the tone ignored.
- **Tests beyond the plan's.** Eight of the mutants above passed the plan's tests alone (the edge, the border, Latin leading, Thai leading everywhere, the dark tint at 28%, the provider always light, no `maxFontSizeMultiplier`, the tone ignored). Added for them: no edge except dark titanium; the calendar borders; the leading table, and font size and leading per locale in the render test; the dark tile tint `#41332D`; and three render tests (role and tone; `maxFontSizeMultiplier` per role, through a recording mock of `@mobile/theme/AppText`, since react-native-web drops the prop; the provider's own palette from a stored dark theme). Also pinned, as the plan states them: the dark calendar ramp and `CALENDAR_STEP_LIMITS_BAHT` (W22), `amountMaxScale` reaching its limit (W30), `isDark`, `getWalletColors`, and the pair counts (19 and 7).
- **Gate** (worktree root):
  - `npm run typecheck:app`: exit 0, no errors.
  - `npm run typecheck:routes -w gogospend-app`: exit 0, no errors.
  - `npm run test:app`: `tests 29`, `pass 29`, `fail 0`.
  - `npm run test:unit`: `tests 742`, `pass 742`, `fail 0`.
  - `npm run test:render -w gogospend-app`: `Test Files 84 passed (84)`, `Tests 1593 passed (1593)`.
  - `npm run export:web -w gogospend-app -- --max-workers 2`: exit 0 (`Exported: dist`).
  - `git diff --check` before the commit, and `git diff --check origin/claude/p1a-vault-core...HEAD` after it: no output.
- **§5.3's fixes:** the readable insight bars are these tokens, held by the pairs test (P2-T31 draws them). The saved check is P2-T17's: this palette has no success green, and `under` and `over` say budget state only. 44 pt targets are each control's task and P2-T37's sweep; `WalletText` is not a control.
- **Deviations:**
  1. `WalletText` takes `Omit<TextProps, 'role'> & { role?: WalletTextRole; tone?: WalletTone }`, not `TextProps & {...}`. React Native 0.88's `TextProps.role` is the ARIA `Role` union, which shares no member with `WalletTextRole`, so `role="h1"` would not compile. Wallet text that needs an ARIA role uses `accessibilityRole` (a heading: `accessibilityRole="header"`).
  2. The plan's dark silk `quietText` mutant changes every dark material's quiet text, because one branch paints all five; silk still fails it.
  3. The RED came after the code (written by the earlier session), against placeholders.
- **SKIPPED:** none. The task adds no screen, catalogue section or native module, so there is no device, simulator or E2 check.
- **Notes for later tasks:**
  - `tileTint` carries the mode's `ink` only: light `quiet` falls to 4.04:1 on the `#4E93D9` tint (P2-T11's `WalletCategoryIcon`).
  - Dark `barPast` is 2.98:1 on `sheet` (`#24222B`): insight bars sit on `card`, never in a tray (P2-T31).
  - Calendar fills 1 to 3 differ from the card by less than 3:1 (light 1.19, 1.55, 2.48; dark 1.25, 1.90, 3.32). The plan tests the day numbers only, which carry 4.74:1 or more (W22, E2-C).
  - `src/ui/dynamicType.test.ts` scans `src/screens/redesign`, `src/ui` and `src/mascot`, not `src/wallet`. `WalletText`'s cap is held by its own render test; a raw `Text` or `TextInput` in `src/wallet` needs its own `maxFontSizeMultiplier` until a sweep covers the folder (P2-T37).
  - `amountMaxScale` is for `WalletAmount` (P2-T10); `materialPaint` for `MaterialFill` (P2-T11); `calendarPaint`, `CALENDAR_STEP_LIMITS_BAHT`, `barPast`, `barNow` and `guideLine` for P2-T31.
  - Merging: P2-T3 (PR #79) and P2-T4 (PR #78) were cut from `60e2026` and add their own `## P2: Bun Wallet core` heading earlier in this file; this receipt sits under the existing heading at the end. Keep both sides.

## P4: Slips and statements

Phase P4 reads Thai bank slips into slip drafts, imports bank statements and sends pushes. Task 1 adds the shared wire contract: the slip, draft, slip account, bank album, push and device shapes, and the salted slip reference both the phone and the Worker use.

### P4 Task 1: Slip and push contracts, and the shared slip reference

- **Status:** built and verified locally on `p4/t1-slip-contracts`, on top of `bdf6b12`, the integration commit the branch was cut from. The integration head is now `75b3625`. It changed no file under `packages/contracts` or `apps/api` since `bdf6b12`, so it was not merged here; the orchestrator merges it when it opens the PR. Not pushed. The independent review is the controller's.
- **Files:**
  - `packages/contracts/src/v1/slips.ts` and `push.ts` (new): the slip, draft, slip account, bank album, push and device shapes, `normalizeSlipRef`, `slipRefHash`, `accountLast4`, and the parsers.
  - `packages/contracts/src/v1/sync.ts`: the import and the `slip_inbox` entry in `SYNC_ENTITY_VALIDATORS` (three lines).
  - `packages/contracts/src/index.ts`: four export statements after the AI type block (47 lines added, nothing changed).
  - `apps/edge/test/slip-contracts.test.ts` (new, Node): 11 tests.
  - `apps/api/src/sync/sync-api.integration.spec.ts`: the parity assertion leaves out `slip_inbox` (ruling R83); the test keeps its name.
  - `docs/implementation/premium-progress.md`: this section.
- **RED to GREEN:**
  - RED, `npm run test:edge -- test/slip-contracts.test.ts`: 11 failed, 0 passed, against typed stubs. Seven failed on an assertion against a stub (a validator answered `false`, a helper answered `null` or `''`); four failed on the stub parsers' `VALIDATION_FAILED` ("Not built yet."). `npm run typecheck:edge` passed against the stubs.
  - GREEN, the same command: 11 passed, 0 failed.
- **Mutation check:** ten mutants, one at a time. Each was an exact single-match replacement in the worktree file, run against the focused file, then restored from a copy taken before the first mutant; the restored file's sha256 matched after every restore. Each was killed:
  1. Zero byte dropped from `slipRefHash`: 1 failed (the salted-hash case).
  2. Repeated hash let through: 1 failed (the batch case).
  3. `album` slip allowed in a live batch: 1 failed (the batch case).
  4. Extra key accepted by `hasExactly`: 2 failed (the inbox-snapshot case and the every-DTO-validator case).
  5. Salt length unchecked: 1 failed (the salted-hash case).
  6. Reference upper-cased before the ASCII check: 1 failed (the reference case, `ß`).
  7. Image size limit off by one: 1 failed (the batch case).
  8. Any string accepted as a push month: 1 failed (the push-data case).
  9. `slip_inbox` dropped from `SYNC_ENTITY_VALIDATORS`: 1 failed (the inbox case).
  10. Three digits accepted as the last four: 1 failed (the last-four case).

  Survivors: none. Mutants 1 to 4 are the plan's Step 5; 5 to 10 are the brief's additions.
- **Gate** (worktree root; each command's exit status and counts):
  - `npm run test:edge -- test/slip-contracts.test.ts`: 11 passed.
  - `npm run typecheck` (contracts, then API): passed.
  - `npm run typecheck:edge`: passed.
  - `npm run typecheck:app`: passed.
  - `npm run test:edge`: 155 passed in 12 files. The 144 in the other 11 files are the baseline, measured by running those 11 files as an explicit list with the contract edits in place. The baseline was not recorded before the first edit, and no clean checkout at `bdf6b12` was built.
  - `npm run test:api`: run 1 had one failure out of 955 tests, in `src/imports/upload-intake.spec.ts`: "a body that keeps trickling is ended at the absolute receive deadline" (it reported `upload_stalled` where the test expects `upload_timeout`, a race between two timers while the machine's load average was about 11). Run 2: 44 of 44 suites and 955 of 955 tests passed. The spec alone passed 96 of 96 in three runs, and it does not reference `SYNC_ENTITY_VALIDATORS` or the slip contracts.
  - `npm run build -w gogospend-api`: passed (293 files compiled).
  - `node apps/api/scripts/release-graph.mjs check`: passed, no problems.
  - Contracts load under Node type stripping (`node --no-warnings --input-type=module -e`, importing `./packages/contracts/src/index.ts`): printed `contracts load`.
  - `npm run test:unit -w gogospend-app -- src/storage/diaryRepository.test.ts`: 24 passed.
  - App suites: `npm run test:unit -w gogospend-app`: 734 passed; `npm run test:app -w gogospend-app`: 29 passed; `npm run test:render -w gogospend-app`: 83 files and 1589 tests passed. They ran after the last change to the contract files, which has not changed since (sha256 checked).
  - `npm run test:edge:workers`, under the shared heavy lock (released after the run): 12 files, 240 tests passed.
  - `npm run build:edge`: passed.
  - `npm run export:web -w gogospend-app`: not run; no route, config or app entry changed.
  - `git diff --check` on the staged content, before the commit: passed. The three-dot check against `origin/claude/p1a-vault-core` runs after the commit and is in the final report.
- **SKIPPED:** `npm run test:db -w gogospend-api -- sync-api.integration` (the parity assertion, with the database) and `npm run test:edge:db`. Docker is not running on this machine (no colima socket), and both scripts start their database containers themselves, which were not started. CI's database job runs both, so the parity assertion is first exercised there. Nothing deployed; no cloud resource.
- **Deviations:**
  1. Three tests beyond the plan's list: account mappings and slip refs, push data, and each DTO field's shape.
  2. `isPushData` checks `ref` per kind: null for `slips_ready`, a UUID for `statement_parsed` and `export_ready`, `YYYY-MM` for `month_recap_ready`.
  3. `normalizeSlipRef` checks printable ASCII before upper-casing, so `ß` cannot become `SS`.
  4. `isSlipDraftsPage` takes `next_cursor` as null or base64url (1 to 512 characters), the app's keyset cursor rule.
  5. The API parity assertion leaves out `slip_inbox` (ruling R83). It is the only change under `apps/api`.
  6. The integration head was not merged into this branch, per the controller's instruction (see Status).
- **Risks and notes for the integrator:**
  - A simulated merge (`git merge-tree`) of `75b3625` into this branch's parent `bdf6b12` is clean. If the head has edited `docs/implementation/premium-progress.md`, the receipt section may conflict there; keep both sides, as the protocol says.
  - The parity assertion has not run locally. Its first real run is CI's database job.
  - The upload-intake trickle test failed once under load and passed on re-run. If it fails in CI, it is that timing test, not this change.
- **Notes for later tasks:**
  - The hash vector: salt bytes 1 to 32 and `004:016297184012BPP06418` give `029e46f70cbfa751f030c1d33b671859ad9519c17eecd52e6a0539775443df5a` (P4-T3's Workers case, P4-T12's phone case).
  - P4-T3 registers the `slip_inbox` entity in the vault registry; until then the vault never writes one.
  - P5-T3 adds `trip` and `settings` to the API parity assertion's left-out list.
  - The vault-side port of `snapshots validate exactly the entities the API registers` (deferred to 1A-T8b) must leave out entities the vault does not register yet.
  - P4-T6's `retry_after_seconds` is a whole number of seconds; P4-T7's draft cursors are base64url.

## P5: Travel and currencies

Phase P5 lets a person keep records in any currency against a home currency they pick ([plan](../superpowers/plans/2026-10-25-jotbun-p5-travel.md)).

### P5 Task 4: The vault migration: a rebuilt wallets table, currency columns, trips and settings

- **Status:** built and verified locally on `p5/t4-vault-migration`, on top of `800680d`. Not pushed. The independent review is the controller's, after this receipt. The integration head has since moved to `8f04a3b` (1D-T1 and the iOS keyboard fix); it is not merged here, and no file under `apps/edge` differs between `800680d` and `8f04a3b`.
- **Path proven:** deferred foreign keys (`PRAGMA defer_foreign_keys = ON` before the swap, `OFF` after the rename), inside the migrator's `transactionSync`, in workerd. The legacy-rename fallback was not needed and is not written. Triggers and views naming `wallets` before the migration: none (in `0000` and `0001`); after it: `wallets_currency_immutable` only. The primary key index is `sqlite_autoindex_wallets_1` before and after (the planner's observation; the suite checks that `PRAGMA index_list(wallets)` is unchanged).
- **Files:**
  - `apps/edge/src/vault/migrations/0002_currencies_trips.sql` (new; the plan's `NNNN`): B18's wallets rebuild with any ISO-shaped currency and the three looks; `wallets_currency_immutable` (Q7); `categories.icon` and `pack_key` (never on a built-in); eight `transactions` columns by ADD COLUMN, the home-amount backfill and `transactions_trip_idx`; `trips` with `trips_dates_idx`; `settings`. All new tables STRICT; `0000` and `0001` unchanged.
  - `apps/edge/src/vault/migrations/index.ts`: journal entry `idx` 2, `when` 1761523200000, tag `0002_currencies_trips`, key `m0002`.
  - `apps/edge/src/vault/schema.ts`: the new columns on `categories`, `wallets` and `transactions`; tables `trips` and `settings`; `VAULT_CORE_TABLES` now lists 31.
  - `apps/edge/test/workers/support/migrations.ts` (new): `migrateBefore(state, suffix)`.
  - `apps/edge/test/workers/currency-migration.test.ts` (new): the plan's six cases and four more (36 rule rows, the trip indexes, the previous release's writes, a failed then retried upgrade).
  - `apps/edge/test/workers/vault-schema.test.ts`: the 31-table list, the journal order checks, the migration counts from the journal's length.
- **RED to GREEN:**
  - Typed seams first: the journal entry and a stub migration (`SELECT 1;`), and the Drizzle columns and tables.
  - RED, `npm run test:edge:workers -- test/workers/currency-migration.test.ts test/workers/vault-schema.test.ts`: 12 failed, 12 passed, each failure an AssertionError. The first failing assertion of each, shortened: rebuilt wallets `[ { …(10) }, { …(10) } ]` against `[ { …(13) }, { …(13) } ]`; referencing tables `[ 'id', 'name', 'currency', …(6) ]` against `…(9)`; older records `currency: undefined` against `'THB'`; wallet currency got `CHECK constraint failed` where `/wallet currency is immutable/` was expected; new columns got `table transactions has no column name` where `/CHECK/` was expected; triggers and views `undefined` against `{ type, tbl_name }`; phase 5 writes `[ [ …(2) ], …(35) ]` against the same shape; trip indexes `[]` against two index rows; previous release's writes `id: undefined` against `type: 'expense'`; failed upgrade `promise resolved "undefined" instead of rejecting`; core tables `[ 'account_state', …(28) ]` against `…(30)`; Drizzle drift `[ [ 'archived', true ], …(10) ]` against `…(8)`.
  - GREEN, the first case alone (`Tests 1 passed | 9 skipped (10)`), then the same command: 24 passed, 0 failed. The whole Workers suite: 14 files, 258 passed. Re-confirmed after the mutation loop: the unmutated focused files 24 of 24 before it, and the Workers suite 14 files, 258 passed, after it.
- **Mutation check** (the brief's Step 5 list, Appendix H, applied one at a time with the Edit tool, since the planner's `mutants.mjs` was lost; see Deviations): 31 of 31 killed; survivors: none.
  - The plan's three: the copy without `archived` killed (2 of 24: cases 1 and 10); no immutability trigger killed (2 of 24: cases 4 and 6); no backfill killed (1 of 24: case 3).
  - The rest: M4 and M5 killed (10 of 24 each: all ten currency cases); M6 and M7 by case 4; M8 to M13 by case 5; M14 and M15 by case 8; M16 to M25 and M29 by case 7; M26 and M27 by cases 3 and 9; M28 by case 3; M30 by the Drizzle drift case; M31 by cases 3, 6 and 10. All killed, as the brief lists.
- **Gate** (worktree root):
  - `npm run typecheck:edge`: passed (exit 0).
  - `npm run test:edge`: passed, 12 files, 156 tests.
  - `npm run test:edge:workers`, under the heavy lock (taken and released): passed, 14 files, 258 tests.
  - `npm run build:edge`: passed; `grep -c wallets_currency_immutable apps/edge/dist/jotbun_vault/index.js` prints 1.
  - `git diff --check`: clean before the commit.
- **Calls made for this task (the plan is silent; for the reviewer):**
  1. The number `0002` and `when` 1761523200000 (one day after `0001`).
  2. The trigger and view case compares the rows other than `wallets_currency_immutable`, which this migration adds and whose SQL names `wallets`.
  3. The two plan cases that would pass without a migration first assert that the rebuild ran.
  4. "A real date" is `date(x) IS x`, with no 1970 floor.
  5. `wallets.currency` has no default (the plan's step 2 replaces the column; every writer names it).
  6. `trips.version` and `settings.version` default to 1 with `>= 1`; `settings.entity_id` is NOT NULL; `trip_id` has no shape check and no foreign key (X4).
  7. `schema.ts` declares no defaults; the constraints live in the SQL.
  8. `vault-schema.test.ts` reads the migration count from the journal and checks the journal's order.
- **Deviations:**
  1. The planner's scratch folder (`mutants.mjs`, `SHA256SUMS`, the verified copies and the brief file) was cleared by macOS during an interruption. The worktree was verified by content against the brief's code blocks, not by checksum, as the controller directed. The checksum checks made before the interruption had passed.
  2. The mutation step ran with the Edit tool, not `mutants.mjs`. Each mutant was applied to the brief's text, run on the two focused files with Vitest's JSON reporter under the heavy lock (taken and released around each run), restored with Edit, and confirmed with `git diff` against a baseline taken before the first mutant. The three mutated files were also compared with backups, because the SQL file and the test helper are untracked and `git diff` cannot show them. An earlier script run had logged 31 killed before the interruption was reported; the controller asked for this re-run.
  3. No other deviation from the brief.
- **SKIPPED:** `test:edge:db`: Docker is stopped on this machine (`docker info` failed), and the suite starts PostgreSQL through `scripts/dev-v1.mjs db-up`; CI runs it. `typecheck`, `test:api`, `test:db` and the app gates: no contracts, API or app file changed. Nothing deployed; no network beyond `npm ci` and `git fetch`.
- **Notes for the integrator:**
  - Renumbering: if another vault migration merges first, rename the file to the next number, give its journal entry the next `idx`, the key `mNNNN` and a `when` later than every earlier entry (never equal: the migrator skips an entry whose `when` is not later than the last applied one, forever, on every upgraded vault), and update the comment in `schema.ts` that names the file. `vault-schema.test.ts` checks the order; `currency-migration.test.ts` finds the migration by its `_currencies_trips` suffix.
  - If a migration numbered before this one adds a trigger or view whose SQL names `wallets`, this migration must drop it in step 1 and create it again after step 4; "the triggers and views naming wallets are the same after the rebuild" fails until it does. A new table referencing `wallets` (P4's `slip_accounts`) needs nothing: "every table that references wallets keeps its rows" reads the references from `PRAGMA foreign_key_list` and checks it.
  - Any test that pins the migration count must read `VAULT_MIGRATIONS.journal.entries.length`, and any table list must add `settings` and `trips`.
  - Records the previous release writes after this migration have a null `home_amount_minor`; phase 5 reads must use `coalesce(home_amount_minor, amount_minor)` and `CAST(... AS TEXT)`. Nothing reads the new columns yet.
  - An upgrade that fails leaves the vault in its older shape; the object resets and the next wake retries. A vault whose upgrade keeps failing refuses calls until a fixed release ships. The planner's upgrade of 90,100 records took 576 ms in local workerd, inside `blockConcurrencyWhile`.
