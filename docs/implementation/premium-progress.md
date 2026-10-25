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
