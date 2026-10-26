# Phase 1B: files and background work on the UserVault Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve every v1 files, imports, exports, resync, AI and bridge route from the UserVault, with files in one private R2 bucket, statement parsing on a Queue and a stateless Container, snapshots and exports on Workflows, proven by the parity files session against NestJS, and then fold the vault into the HTTP Worker (C1).

**Architecture:** The 1A front door gains Worker-run routes. Uploads, downloads, the AI routes, the bridge and the two receipt-copy routes run in the Worker and call the caller's vault in steps, through step-only vault ids that have no route of their own. Every other route stays one vault call. The vault registers each R2 key before anyone writes it (create-only), publishes it after, deletes it at its deadline on its alarm, and deletes it once more a day later before forgetting it. Snapshot builds and exports run on Workflows whose steps call vault RPC methods; the vault reads synchronously and writes R2 itself. Uploads stream to R2 quarantine; a Queue message wakes a consumer that sends the file to the stateless parser Container and records the validated preview in the vault.

**Tech Stack:** Cloudflare Workers, SQLite Durable Objects, R2, Queues, Workflows and Containers (the Durable Object container API); Drizzle ORM 0.45.3 (`drizzle-orm/durable-sqlite`); jose 6.2.12; `@cloudflare/vitest-plugin` 1.4.7; wrangler 4.152.0; the API image (Node 26.9, sharp and libvips) for the parser. No new package.

**Spec:** [docs/superpowers/specs/2026-10-25-jotbun-bun-wallet-cloudflare-design.md](../specs/2026-10-25-jotbun-bun-wallet-cloudflare-design.md). This plan implements §8 phase 1, second part: §3 (C1, C2, C12), §4 (files, gates, logging), §6.1 to §6.3, §6.6 (the files session), §6.7 (routes only, today's behaviour), §6.9, §6.12 (export; statement import; the erase primitive for deletion) and §6.14. It builds on the 1A plan, [2026-10-25-jotbun-p1a-vault-core.md](2026-10-25-jotbun-p1a-vault-core.md), and on 1A as merged.

**1A as built** (this plan relies on these facts):
- `UserVault#call(call)` runs its checks and the handler inside one `ctx.storage.transactionSync`. `runCommand` runs inside that block and never opens a nested one (1A ruling R21).
- `commandInput(call, kind, payload, ifMatch: IfMatchRule)`, with `IfMatchRule = 'required' | 'forbidden' | 'optional'`, in `src/vault/commands/executor.ts`. `expectVersion`, `entityHead` and `requireLiveEntity` are synchronous.
- `handleVaultV1` sends the vault `livePolicies(config.policies, now)` (1A ruling R20). Tokens are verified with `clockTolerance` 30 and `maxTokenAge` 930.
- Every vault table is `STRICT` (1A ruling R16). `okReply(route, body)` takes its status from `vaultStatusOf(route)`.

**Shared files** (other plans' tasks edit these too; keep 1B's edits additive):
- 1A's Worker side: `apps/edge/src/v1/protocol.ts`, `routes.ts`, `handler.ts`, `tokens.ts`, `config.ts`, `env.ts` (1C edits `tokens.ts` and `env.ts`; 1D edits `handler.ts` for `/v1/sync/live`).
- 1A's vault side: `apps/edge/src/vault/user-vault.ts`, `session.ts`, `routes.ts`, `context.ts`, `replies.ts`, `schema.ts`, `migrations/index.ts`, `commands/registry.ts`, `commands/executor.ts`, `retention.ts`, `domain/transactions.ts`, `reads/history.ts`, `reads/deleted-history.ts` (1D edits `user-vault.ts` for sockets).
- Runtime and build: `apps/edge/src/cloudflare-workers.d.ts`, `src/roles/vault.ts` (becomes `src/vault-worker.ts` in 1B-T13), `src/server.ts`, `src/routes/v1/$.ts`, `src/routes/live.ts`, `src/routes/ready.ts`, `wrangler.vault.jsonc`, `wrangler.jsonc`, `vite.config.ts`, `vitest.workers.config.ts`, `scripts/dev.mjs`, and the `deploy` script and description in `apps/edge/package.json` (1B-T13; no dependency or lockfile change).
- Tests and docs: `apps/edge/test/workers/support/v1-client.ts`, `test/workers/vault-schema.test.ts`, `test/vault-route-coverage.test.ts`, `test/route-coverage.test.ts`, `test/request.test.ts`, `test/support/vault-worker.ts`, `test/support/edge-harness.ts`, `docs/implementation/premium-progress.md`, `apps/edge/README.md`.
- `apps/api/release-graph.json` and `apps/api/src/imports/parse-handler.ts` (1B-T1 only).
- Inside 1B, parallel tasks all add to `src/v1/protocol.ts`, `src/v1/routes.ts` (`VAULT_STEP_ROUTES` included), `src/vault/routes.ts`, `src/vault/commands/registry.ts`, `src/vault/files/work.ts`, `src/v1/files/downloads.ts` and `test/workers/support/files.ts`. Each task's edits there are additions only.

**Phase 1 plans.** 1A is the vault core. **1B (this plan)** adds files and background work; it does not build sign-in or the deletion route and Workflow. 1C brings Better Auth on D1, issues the `auth_time` claim 1B reads, and builds deletion on 1B's erase primitive. 1D adds live pokes, the pending choice, PostHog and the phase 1 proof.

## Owner answers (25 October 2026)

The owner accepted every proposed default. Each task these decide names its answer under its heading.

1. **Q1. 1B may edit `apps/api` for the stateless parser: yes.** Five files: new `parse-outcome.ts`, `parse-server.ts` and `parse-server.spec.ts`, the pure parts moved out of `parse-handler.ts`, and one `release-graph.json` entry. The edit is additive and keeps the API's behaviour, and the API's own tests run in 1B-T1. Decides 1B-T1 (and 1B-T5 through it).
2. **Q2. The files parity session leaves its two Auth0 proof steps uncompared: yes.** They run against NestJS only, as §6.6 excepts sign-in, so 40 of the session's 42 steps are compared, and the vault run asserts that the retired routes answer 404. Decides 1B-T12.
3. **Q3. The `ai` gate arrives in phase 3, with AI Gateway, not in 1B.** The API's `GATE_SCOPES` has no `ai`, so writing `ai` into `config:v1` today would make `readEdgeConfig` fail closed and pause every gate. Decides 1B-T7.
4. **Q4. "Ten times the 5 MB-a-year ledger" means a vault whose SQLite file is at least 50,000,000 bytes** (`ctx.storage.sql.databaseSize`). Decides 1B-T8.

**Calls made in this plan** (the builder's, not the owner's; listed so a reviewer can check them):
- **B1. R2 keys are purpose first, then the vault id:** `<purpose>/<vaultId>/<id>/<attempt token>/<name>`, with the API's five purposes `sync_snapshot`, `export`, `import_quarantine`, `import_image` and `receipt`, and `vaultId = ctx.id.toString()`. R2 lifecycle rules match key prefixes only (R2 docs, `wrangler r2 bucket lifecycle add <BUCKET> [NAME] [PREFIX] --expire-days`), and the edge's `assertObjectKey` requires a lowercase purpose first. This deviates from boundaries' "keys prefixed by the vault id": the vault id is the second segment, and the erase helper purges one prefix per purpose.
- **B2. Receipt re-encoding stays in the parser Container** (libvips through sharp in the sandboxed image child), not Cloudflare Images. It is reviewed code with the 20-megapixel and metadata rules and its own tests (`re-encodes a %s with every metadata marker removed`), and it needs no new binding, service or bill.
- **B3. The stateless parser is a new process in the API image** (`apps/api/src/imports/parse-server.ts`), with the pure checks moved from `parse-handler.ts` into `parse-outcome.ts` (Q1). The container gets no secrets, no bindings and `enableInternet: false`. The file arrives in the request body and the validated preview goes back in the response.
- **B4. The vault is its own object registry** (`vault_objects`), in place of the API's `object_publications`. A key is registered before its PUT, published after it, and deleted by the vault alarm at its deadline. Every background attempt writes under a fresh attempt token, so a retried step never meets its own create-only key.
- **B5. Snapshot builds and exports run on Workflows whose steps call vault RPC methods.** The vault reads synchronously and writes R2 itself, so file bytes never cross RPC or Workflow step state (step results are limited to 1 MiB, Workflows docs). `UserVault#call` is synchronous, so the Worker starts pending work after the reply (`waitUntil`) and the vault alarm retries a start that did not happen. Snapshot and export expiry are vault-alarm jobs, as §6.2 lists for snapshots.
- **B6. The parse queue is consumed in the same Worker** (C1), one message at a time (`max_batch_size: 1`, `max_concurrency: 1`), as today's single parser runs. Parse attempts are counted in the vault (3), not by the queue. An import still `queued` an hour after its message was last sent or seen by the consumer is sent again (1B-T5); `parseSource` makes a duplicate harmless.
- **B7. Fresh sign-in is `claims.authTime`** (the JWT `auth_time`, epoch seconds), at most 300 seconds old: the API's proof window (`p_auth_time + interval '5 minutes'` in `0003_sessions_policies.sql`), with the API's 30-second `CLOCK_TOLERANCE_SECONDS`. The rule's code is Worker-side (`src/v1/fresh-sign-in.ts`), but it runs in the vault: the export command applies it after its receipt lookup, where the API calls `authorizePurpose`, so a resent export still replays. Boundaries say "in the Worker"; this placement keeps the API's replay behaviour. A refusal is the API's `401 REAUTH_REQUIRED`.
- **B8. `proof_id` stays a required UUID in the export body** (C2: contracts do not change in phase 1) and is otherwise unused.
- **B9. Worker-run routes call the vault in steps.** Step-only ids live in `VAULT_STEP_ROUTES` (status 200 unless given) and `UserVault#call` resolves `vaultRouteOf(id) ?? stepRouteOf(id)`. `VaultCall.charge` is required: `'read'` or `'write'` (from the route's HTTP method) on the first call of a request, and `'step'` on every later one, so a request spends one rate charge however many steps it makes, and a call that forgets its charge is a type error.
- **B10. The AI routes keep today's switch** (Q3): `AI_ENABLED` with `ANTHROPIC_API_KEY`, and `503 AI_PAUSED` when AI is unavailable.
- **B11. Workflows and the parse consumer reach a vault with `idFromString(vaultId)`**, so Workflow params and queue messages carry the vault id, never the user id.
- **B12. The files parity session runs its two Auth0 proof steps against NestJS only** (Q2). The vault run signs its token with a fresh `auth_time` instead, and the test asserts that those retired routes answer 404.
- **B13. The parity harness runs the vault Worker from a copy of the built config without Workflows, queue consumers or Containers**, so background work does not advance during the session, as the PostgreSQL parity ran with no job runner.
- **B14. The memory proof** (Q4) seeds a vault whose SQLite file is at least 50,000,000 bytes. Its snapshot read must iterate the cursor (the test fails on `toArray`), and the bytes the build holds at once may not exceed what it stores plus one chunk. The ten-times export is proven the same way. The deployed 128 MB isolate limit is not enforced locally, so the deployed check stays SKIPPED; the risk is named in 1B-T8.
- **B15. C1 keeps a plain vault module.** `src/roles/vault.ts` becomes `src/vault-worker.ts`. The HTTP Worker re-exports its classes and queue handler, and the Workers-runtime tests load it through the vitest plugin's `main` option, so tests never load TanStack Start's entry. `/ready` stays and answers from settings and KV, because its PostgreSQL checks retire.
- **B16. 1C's two deletion routes** (`POST /v1/me/deletion`, `POST /v1/auth/deletion-receipt`) stay in `VAULT_DEFERRED_ROUTES`; 1B ends with exactly those two deferred.
- **B17. `IMPORT_UPLOADS_ENABLED` keeps marking the `uploads` scope unexposed** (404 before authentication) in `readEdgeConfig`, as the API's `RELEASE_FLAGS` do, on the fail-closed path too.
- **B18. The PostgreSQL edge tests retire at C1 with their code**, each case mapped to its vault test, to 1C, or to "retired by §6.4" in 1B-T13's table.
- **B19. Per-vault tombstones replace §6.12's daily Cron orphan sweep.** This is a deviation from §6.12, which the owner may overturn. A key the vault deleted or forgot becomes a tombstone row, and the vault deletes that key once more a day later before dropping the row. That catches a PUT that landed after its key was given up, which the API's orphan pass caught; `receipt/` has no lifecycle rule as a backstop. 1C's deletion step 8 still sweeps an erased vault's prefixes.
- **B20. Receipt release is a trigger on `transaction_attachments`.** SQLite runs an `ON DELETE CASCADE` as a trigger program whose delete fires the child table's triggers (SQLite docs, "ON DELETE and ON UPDATE Actions"), so 1A's purge of a record releases its receipt with no change to 1A's purge code. The trigger only marks the receipt released and its object due; `pruneAttachments` stamps `released_at` from the vault clock, because a trigger cannot read `UserVault#clock`.
- **B21. An export holds one extra copy at most, so the vault caps it at 32 MiB** (`VAULT_EXPORT_MAX_BYTES`, half the API's `MAX_EXPORT_BYTES`). It is written through `putConcatenated`, which concatenates once, hashes and puts, so the peak is about twice the CSV (64 MiB) inside the 128 MB isolate. 32 MiB is about 130,000 records, some 35 years at ten a day; a larger export fails visibly as `too_large`. The Worker sets `limits.cpu_ms` to 120,000 (1B-T6).
- **B22. `erase` is durable.** After `deleteAll()` the vault re-runs its migrations and writes one marker row, `account_state` with status `deleted` and an empty `account_id` (no personal data). `ensureAccount` refuses a `deleted` vault with `403 ACCOUNT_UNAVAILABLE`, so a vault woken after eviction never recreates the account. 1C relies on this.

## Global Constraints

- **Owner approvals:** no new package and no lockfile change. 1B uses only what 1A installed (`drizzle-orm`, `jose`, `@cloudflare/vitest-plugin` 1.4.7) and the API's existing packages.
- **No cloud resources.** Everything runs on Miniflare, local `wrangler dev`, the local PostgreSQL container (for the NestJS reference) and, if present, local Docker. Hosted checks, R2 lifecycle rules, CPU limits (enforced only when deployed) and a container run on Cloudflare are recorded **SKIPPED**.
- **Process for every task** (handover §4): a behavioural RED with counts, GREEN, a mutation check, the full gate, a receipt in `docs/implementation/premium-progress.md` under a new heading "## 1B: files and background work on the vault", a local commit ending with the attribution trailer, and an independent read-only review of the commit. Do not push. Never run a bare `git stash`. Make no changes under `vendor/`.
- **Behavioural REDs:** before each RED, create typed stubs for every new module, function and method the tests import, returning wrong but typed values (`[]`, `null`, `{ outcome: 'skipped' }`, a 501 reply). Each RED then fails on assertions, never on a missing module (handover §4 step 2).
- **The edge gate** (from the repo root; the database suites need `npm run db:v1:up` and `npm run build -w gogospend-api` first):
  ```bash
  npm run typecheck:edge && npm run test:edge && npm run test:edge:workers && npm run build:edge && npm run test:edge:db
  ```
  1B-T1 adds the API gate: `npm run typecheck && npm run test:api && npm run test:db -w gogospend-api -- import-preview`.
- **Reference code is read-only:** `apps/api` (except 1B-T1's five files), `packages/contracts`, and the PostgreSQL edge under `apps/edge/src/server` and `apps/edge/src/roles` (except `src/roles/vault.ts`, which is 1A's, and what 1B-T13 retires). Pure modules there are reused by import, never copied: `@api/storage/object-store` (`assertObjectKey`, `ObjectStoreError`), `@api/sync/snapshot-grants`, `@api/exports/csv-writer`, `exportRowCells` from `@api/exports/export-handler`, `@api/imports/upload-intake`, the confirmation parsers in `@api/imports/confirmation.service`, `src/server/storage/r2-object-store.ts`, `src/server/http/files.ts`, `src/server/bridge/catalogue.ts`, and the AI modules `src/server/ai/drafts.ts`, `fact-text.ts`, `grounding.ts`, `model.ts` and `prompts.ts`.
- **Identity (§6.2):** a route reaches only `env.VAULT.idFromName(claims.accountId)`. Background code reaches `env.VAULT.idFromString(vaultId)` with the vault id that vault gave it (B11). No route reads a vault or user id from the request.
- **Commands (§6.2):** every mutation keeps 1A's seven steps inside `call()`'s one transaction. Background methods open their own short `transactionSync` blocks. R2 calls, Workflow starts and queue sends happen outside every block. No block is ever nested (1A ruling R21): each prune function opens its own short blocks and is never called inside another block, and one that purges entities calls 1A-T8b's purge routine outside its own blocks, the way 1A's retention jobs call it.
- **Schema (1A ruling R16):** every `CREATE TABLE` in `0001_vault_files.sql` ends with `STRICT`, and every column type is `INTEGER`, `TEXT` or `BLOB`.
- **R2 (§4, §6.3):** one private bucket bound as `OBJECTS` (`jotbun-private-objects`). Keys follow B1 and pass `assertObjectKey`. Every write is create-only (`onlyIf: If-None-Match: *`, through `R2ObjectStore.putStream` or `putConcatenated`) and registered in `vault_objects` first. Slip images never reach R2, KV, logs or queue messages.
- **Lifetimes and limits (§4):** uploads at most 12 MiB (`IMPORT_UPLOAD_MAX_BYTES`), CSV, XLSX, JPEG, PNG and WebP; raw uploads 24 hours; sanitized import images 24 hours (`IMPORT_IMAGE_TTL_HOURS`); previews 7 days (`IMPORT_PREVIEW_TTL_DAYS`); at most 5,000 parsed rows, confirmed in batches of 500; snapshots 24 hours (`SNAPSHOT_TTL_HOURS`); export files 24 hours (`EXPORT_TTL_HOURS`); download grants 5 minutes, never past the file's expiry; retained receipts until released. A snapshot over 64 MiB (`MAX_SNAPSHOT_BYTES`) or an export over 32 MiB (`VAULT_EXPORT_MAX_BYTES`, B21) fails visibly as too large.
- **RPC (Workers RPC docs):** arguments and results are plain structured-clone values (no class instances), well under the 32 MiB message limit. Workflow step results stay small (`{ outcome }`).
- **Background work checks before it publishes:** every background vault method publishes nothing and gives its skipped answer (`{ outcome: 'skipped' }`, `{ kind: 'skip' }` or `{ recorded: false }`) when the vault is erased, has no `account_state`, is not `active`, or its job is no longer in the state it expects.
- **Gates (§4, C12):** routes keep the API's gates (`jobs` for snapshot and export requests, `uploads` and `imports` for uploads, `imports` for review, `imports` and `writes` for confirmation and retain, `writes` for remove). As in the API, where every worker claim needs `jobs` open: the parse consumer holds every parse while `jobs` or `imports` is paused and image parses while `ocr` is paused, and `startPendingWork` starts nothing while `jobs` is paused. Work already running carries on.
- **Logging:** `failureName(error)` only (1A's `logFailure`); never `error.message`, a body, a key, a grant or an amount.
- **Exactness:** amounts, sums, sizes and revisions leave SQLite as `CAST(... AS TEXT)`, as in 1A. Large reads iterate the cursor and never call `toArray()`.
- **SQL parameters (ruling R57):** Durable Object SQLite binds at most 100 parameters per statement (confirmed in this repo's workerd). A list of ids or keys of unbounded size binds as one JSON parameter, `WHERE x IN (SELECT value FROM json_each(?))` with `JSON.stringify(ids)`, never one `?` per id. This covers object key lists, chunk lists, attachment and import row ids, and prune batches. Bulk inserts run one statement per row inside the block, or select from `json_each`, never a multi-row `VALUES` list. Set-based statements (a subquery instead of a list read back into code) are preferred where they fit.
- **Time:** the vault's clock (`UserVault#clock`) for every timestamp, ISO 8601 UTC with milliseconds; epoch milliseconds for `vault_objects.delete_after` and `schedule.due_at`.

## Review Focus

The five failure modes most likely to bite a person that the ported suites do not exercise. Each has its test in the owning task.

1. **Background work that outlives its vault or job.** A snapshot, export or parse that finishes after the vault stopped being active, or after its import expired, publishes nothing, and what it wrote is deleted at its deadline (1B-T5 `a parse that finishes after the import expired records nothing`, 1B-T6 `an export that finishes after the vault stopped being active publishes nothing`, 1B-T8 `a build that finishes after the vault stopped being active publishes nothing`).
2. **A step retried after its PUT but before its record.** The retry writes under a new attempt token and completes; the first attempt's objects are deleted at their deadline (1B-T8 `a build retried after its chunks were stored completes, and the first attempt's chunks are deleted at their deadline`).
3. **Work requested just before the vault sleeps.** A start that never happened is made by the vault alarm after the vault wakes (1B-T11 `work requested before the vault slept is started by its alarm after it wakes`).
4. **A parse whose consumer stopped part-way.** It is retried, and after the third attempt the import reads `failed`, never `parsing` forever (1B-T5 `a parse that keeps failing is retried and fails after three attempts`).
5. **A receipt grant used by another device, or after sign-out.** A grant is bound to the session that asked: another device of the same person gets 404, and the asking device is refused once it signs out (1B-T9 `a receipt grant is bound to the session that asked`).

---

## File structure

```
apps/api/src/imports/
  parse-outcome.ts                pure: toPreviewRecord, sanitizedImageHeader, magicFormat, previewFromOutcome
  parse-server.ts                 the stateless parse process (node:http): GET /health, POST /parse
  parse-server.spec.ts
apps/edge/
  wrangler.vault.jsonc            + OBJECTS, SNAPSHOT_WORKFLOW, EXPORT_WORKFLOW, PARSE_QUEUE, PARSER, limits.cpu_ms
  src/v1/
    fresh-sign-in.ts              FRESH_SIGN_IN_SECONDS, assertFreshSignIn
    worker-routes.ts              WorkerContext, VaultSession, vaultSession, workerSessionFor, WORKER_HANDLERS
    bridge.ts                     the cashback catalogue (public Worker route)
    ready.ts                      readyResponseOf (1B-T13)
    files/uploads.ts              vaultIntakeRepository, the upload Worker route
    files/downloads.ts            EXPORT_SLOTS, RECEIPT_SLOTS, serveExportFile, serveSnapshotChunk, serveReceiptFile
    files/receipts.ts             retain, replace and confirm-with-receipt orchestration (copy slots)
    ai/service.ts, ai/routes.ts   the AI routes on vault steps
  src/vault/files/
    keys.ts                       VAULT_OBJECT_PURPOSES, vaultObjectKey, vaultPrefix, VaultBucket
    purge.ts                      purgeVaultObjects (for 1C)
    context.ts                    FileContext, touch
    objects.ts                    the registry, tombstones, putConcatenated, objectsDueAt
    grants.ts                     vaultGrants, receiptGrantScope
    work.ts                       BuildOutcome, WORK_STARTERS, createOnce, startDueAt, startPendingWork
    intake.ts, parse.ts           uploads and the parse pipeline; pruneUploads, uploadsDueAt
    exports.ts                    exports; pruneExports, exportsDueAt
    snapshots.ts                  snapshots; pruneSnapshots, snapshotsDueAt
    attachments.ts                receipts; pruneAttachments, attachmentsDueAt
    previews.ts, confirmation.ts  review and confirmation; pruneImports, importsDueAt
    jobs.ts                       fileJobsDue, runFileJobs (the alarm's file jobs)
  src/vault/ai.ts                 AI preferences, uses, facts and tools on vault SQL
  src/vault/migrations/0001_vault_files.sql
  src/background/
    vault-stub.ts                 vaultById
    snapshot-workflow.ts, export-workflow.ts
    statement-parser.ts           StatementParser (Durable Object with the parser container)
    parse-consumer.ts             handleParseBatch, containerParser
  test/workers/                   files-erase, files-front-door, files-objects, imports-intake, imports-parse, exports,
                                  ai, snapshots, attachments, imports-review, files-alarm (.test.ts)
  test/workers/support/files.ts   upload, seeding, fake-parser and ten-times-ledger helpers
  test/support/files-session.ts   the parity files STEPS, shared by both files parity tests
  test/vault-parity-files.db.test.ts, test/c1-worker.db.test.ts, test/c1-shape.test.ts
```

**Parallel lanes** (for the controller): 1B-T1 and 1B-T2 now (1A-T2 is merged); 1B-T3 after 1B-T2; then 1B-T4; 1B-T7 after 1B-T3 once 1A-T7 is merged. After 1B-T4: 1B-T5 once 1B-T1 is done, 1B-T6 once 1A-T5 and 1A-T8b are merged, 1B-T9 once 1A-T7 and 1A-T8b are merged, then 1B-T8 after 1B-T6 (1A-T8a is done). Then 1B-T10, then 1B-T11 alongside 1B-T12, then 1B-T13.

---

### Task 1B-T1: The stateless parse server in the API image

**Starts after:** base

**Owner answer 1:** yes (25 October 2026); this task edits `apps/api`.

**Files:**
- Create: `apps/api/src/imports/parse-outcome.ts`, `apps/api/src/imports/parse-server.ts`
- Modify: `apps/api/src/imports/parse-handler.ts` (move the pure parts out; re-export them; `ParseHandler` calls `previewFromOutcome`), `apps/api/release-graph.json` (add the entry `imports/parse-server`)
- Test: `apps/api/src/imports/parse-server.spec.ts`

**Interfaces:**
- Produces, in `parse-outcome.ts` (pure: no `node:child_process`, `node:fs` or `node:net` import; `ParserRunOutcome` is a type-only import):
  - `CandidateRecord`, `PreviewRecord`, `toPreviewRecord(result: ParseSuccess, today?: string): PreviewRecord` and `sanitizedImageHeader(bytes: Buffer, format: ImageFormat): { width: number; height: number } | null`, moved unchanged; `parse-handler.ts` re-exports them so existing imports keep working.
  - `magicFormat(image: Buffer): ImageFormat | null`, moved and now exported.
  - `type SanitizedImage = { bytes: Buffer; format: ImageFormat }`.
  - `previewFromOutcome(format: ParseFormat, outcome: ParserRunOutcome, memoryBudgetKb: number, today: string): { kind: 'record'; record: PreviewRecord; image: SanitizedImage | null } | { kind: 'retry'; code: 'parser_unavailable' | 'parser_sandbox_unsupported' } | { kind: 'aborted' }`. It is `ParseHandler.recordFor` plus the `aborted`, `spawn_failed` and `sandbox_unsupported` branches of `ParseHandler.run`, with the same codes; `today` goes to `toPreviewRecord`. `ParseHandler` passes `bangkokDate(new Date())`, as before.
- Produces, in `parse-server.ts`:
  - `PARSE_FORMAT_HEADER = 'x-jotbun-format'`, `PARSE_TODAY_HEADER = 'x-jotbun-today'`.
  - `type ParseServiceReply = { kind: 'parsed'; record: PreviewRecord; image: { format: ImageFormat; width: number; height: number; base64: string } | null } | { kind: 'retry'; code: 'parser_unavailable' | 'parser_sandbox_unsupported' | 'not_started' }`. `not_started` means no child ran: another parse was running, or the server's startup check found no sandbox (the API's worker never claims a parse it cannot sandbox). The consumer spends no attempt on it (1B-T5). The other two codes come from `previewFromOutcome` for a child that ran, and spend the attempt, as in the API.
  - `startParseServer(options: { port: number; host?: string; runner?: ParserRunnerPort; memoryBudgetKb?: number; startup?: () => Promise<ImportParsingStartup> }): Promise<{ port: number; close(): Promise<void> }>`. Defaults: host `0.0.0.0`, `startup = importParsingStartup`, `memoryBudgetKb = PARSER_CHILD_MEMORY_MIB * 1024`; the runner is `startup().parse.runner` unless one is given.
  - As a process (`node dist/imports/parse-server.js`): port `PARSE_SERVER_PORT` (default 8080); SIGTERM closes the server.

- [ ] **Step 1: Stub, then write the failing tests.** First move the pure parts into `parse-outcome.ts` and add a `parse-server.ts` whose `startParseServer` answers every request 501 with no body. Then write `parse-server.spec.ts` (Jest, Node), starting the server on port 0 with a fake runner unless the case says otherwise:
  - `answers health once the sandbox holds, and 503 when it does not`: with `startup` returning `{ parse: { runner }, alert: null }`, `GET /health` is 200 `{ status: 'ok' }`; with `{ parse: null, alert: '…' }` it is 503, `POST /parse` answers 200 `{ kind: 'retry', code: 'not_started' }`, and the runner is never called.
  - `returns the validated preview of a parsed statement`:

```ts
const row = { source_row_id: 'row:2', occurred_on: '2026-10-20', type: 'expense', amount_minor: '6000', wallet_label: 'Cash', category_label: 'food', merchant: 'ข้าวมันไก่', note: null, issues: [] }
runner.run = async () => ({ kind: 'result', result: { ok: true, layout: 'generic', rows: [row], file_issues: [], image: null, usage: { max_rss_kb: 1000, cpu_ms: 5 } } })
const reply = await post('csv', '2026-10-25', Buffer.from('date,amount\n2026-10-20,-60\n'))
expect(reply).toEqual({ kind: 'parsed', image: null, record: { preview: { status: 'ready', layout: 'generic', issues: [], image: null }, candidates: [{ ...row, ordinal: 1, review_required: false }] } })
```
  - `uses the request's today: a row dated after it is flagged`: the same row dated `2026-10-26` with today `2026-10-25` gives `occurred_on: null` and the issue `{ field: 'occurred_on', code: 'date_out_of_range' }`.
  - `a timeout, a crash or a memory overrun is a rejected preview with its reason, never a retry`: outcomes `timeout`, `crashed` and `memory_limit` give `record.preview` equal to `{ status: 'rejected', layout: null, issues: ['parse_timeout'] | ['parse_failed'] | ['parse_resource_limit'], image: null }` with no candidates.
  - `a child that cannot start asks to be retried`: outcome `spawn_failed` gives `{ kind: 'retry', code: 'parser_unavailable' }`.
  - `refuses a body over 12 MiB with 413 before parsing`: a body of `IMPORT_UPLOAD_MAX_BYTES + 1` bytes is 413 and the runner is never called.
  - `runs one parse at a time; a second request at once is told it has not started`: the first parse waits on a deferred; a second request answers `{ kind: 'retry', code: 'not_started' }`; after the first resolves, a third request parses.
  - `an unknown format or a missing today header is 400`.
  - `re-encodes a real JPEG and returns it without metadata`: with the real runner (`parsingRunner()` from `fixtures/parsing-runner`) and `imageWithMetadata('jpeg', 64, 48)`, the reply image's bytes give `sanitizedImageHeader(bytes, 'jpeg')` equal to `{ width: 64, height: 48 }` and contain none of `IMAGE_MARKERS`. It is skipped exactly when `parser-runner.spec.ts` skips its real-child cases.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:api -- parse-server`. Expected: 9 failing on status or body (the stub answers 501). Record the counts.
- [ ] **Step 3: Write the server.** It reads at most `IMPORT_UPLOAD_MAX_BYTES` of the body (it stops reading and answers 413 past it), requires a known format and a `YYYY-MM-DD` today header (else 400), and aborts the parse when the request closes (`aborted` sends nothing). It logs counts only (`parse server: ran <n>`), never content, names or error text. `ParseHandler.run` calls `previewFromOutcome(source.format, outcome, this.memoryBudgetKb, bangkokDate(new Date()))` and acts on `aborted` and `retry` exactly as before.
- [ ] **Step 4: Run them and see them pass.** Run: `npm run test:api -- parse-server parser-runner parse-worker`, then `npm run typecheck`, then `npm run test:db -w gogospend-api -- import-preview` (the moved code, unchanged behaviour). Expected: all pass; `src/v1/v1-isolation.spec.ts` (in `npm run test:api`) accepts the new release entry.
- [ ] **Step 5: Mutation check.**
  - Remove the size cap: the 413 case fails.
  - Remove the one-at-a-time guard: the not-started case fails.
  - Run the parse when the startup check failed: the health case fails (the runner is called).
  - Map `spawn_failed` to a rejected preview: the retry case fails.
  - Ignore the today header: the date case fails.
- [ ] **Step 6: Optional Docker proof.** If `docker info` succeeds: `docker build -f apps/api/Dockerfile -t jotbun-parser-local .`, then `docker run --rm -p 8080:8080 jotbun-parser-local node dist/imports/parse-server.js`, and `curl -s localhost:8080/health` prints `{"status":"ok"}`. Otherwise record SKIPPED.
- [ ] **Step 7: Gate, receipt, commit.** Run the API gate and the edge gate. Commit: `git commit -m "Add the stateless statement parse server to the API image"`.

---

### Task 1B-T2: The files schema, object keys, the prefix purge and a durable erase

**Starts after:** 1A-T2

**Files:**
- Create: `apps/edge/src/vault/migrations/0001_vault_files.sql`, `src/vault/files/keys.ts`, `src/vault/files/purge.ts`
- Modify: `src/vault/migrations/index.ts`, `src/vault/schema.ts`, `src/vault/user-vault.ts` (`erase`, the `erased` guard in `call()`), `src/vault/session.ts` (`ensureAccount`), `wrangler.vault.jsonc` (`"r2_buckets": [{ "binding": "OBJECTS", "bucket_name": "jotbun-private-objects" }]`), `src/cloudflare-workers.d.ts`, `test/workers/vault-schema.test.ts`
- Test: `test/workers/files-erase.test.ts`

**Interfaces:**
- Consumes: `UserVault`, `vaultSchema`, `VAULT_MIGRATIONS`, `VAULT_CORE_TABLES`, `ensureAccount` (1A); `R2BucketLike` (`src/server/storage/r2-object-store.ts`); `assertObjectKey`, `ObjectStoreError` (`@api/storage/object-store`).
- Produces:
  - `VAULT_OBJECT_PURPOSES = ['sync_snapshot', 'export', 'import_quarantine', 'import_image', 'receipt'] as const` and `type VaultObjectPurpose`.
  - `vaultObjectKey(purpose: VaultObjectPurpose, vaultId: string, ...names: string[]): string`: `vaultId` must match `/^[0-9a-f]{64}$/` and the result must pass `assertObjectKey`, else `ObjectStoreError('invalid_key')`.
  - `vaultPrefix(purpose: VaultObjectPurpose, vaultId: string): string` (`${purpose}/${vaultId}/`).
  - `type VaultBucket = Omit<R2BucketLike, 'delete'> & { delete(keys: string | string[]): Promise<void> }` (the binding deletes up to 1,000 keys per call).
  - `purgeVaultObjects(bucket: VaultBucket, vaultId: string): Promise<number>`: for each purpose, list `vaultPrefix` pages of 1,000 and delete them until a listing is empty; returns how many were deleted. Idempotent. 1C's deletion Workflow calls it.
  - `UserVault#erased: boolean` and `UserVault#erase(): Promise<void>` (B22): sets `erased`; `ctx.storage.deleteAlarm()`; `ctx.storage.deleteAll()` (atomic on SQLite, Durable Objects storage docs); then, inside `ctx.blockConcurrencyWhile`, re-runs `migrate(this.db, VAULT_MIGRATIONS)` and inserts `account_state (id, account_id, status, not_before, created_at)` = `(1, '', 'deleted', 0, <vault clock>)`. Calling it again on an erased vault does the same.
  - `ensureAccount`: an `account_state` row with status `deleted` throws `ProblemException(403, 'ACCOUNT_UNAVAILABLE')` before the owner comparison and writes nothing.
  - `UserVault#call`: when `erased` is set, it answers `{ ok: false, status: 403, code: 'ACCOUNT_UNAVAILABLE', problem: {} }` before anything else.
  - `VaultEnv` gains `OBJECTS?: VaultBucket`.
  - Shim additions: `DurableObjectStorage.deleteAll(): Promise<void>`; `SqlStorage.databaseSize: number`; `SqlStorageCursor<T>` gains `next()`, `raw()` and `[Symbol.iterator]()`; `DurableObjectStateLike.id: DurableObjectId`; `DurableObjectNamespace.idFromString(id: string)` and `getByName(name: string)`; `Cloudflare.Env.OBJECTS: VaultBucket`.
  - Note for 1C: after `erase`, the vault holds only the marker row; once evicted it wakes, finds its migrations applied, and refuses every call with 403. The R2 objects go with `purgeVaultObjects`.

- [ ] **Step 1: Stub, then write the failing tests.** First add `keys.ts` and `purge.ts` with typed stubs (`vaultObjectKey` returns `''`, `purgeVaultObjects` resolves 0) and an `erase()` that resolves without doing anything. Then:
  - In `vault-schema.test.ts`, the first test's literal becomes the list below, and both migration counts become 2. The column-for-column test then covers the new tables.

```ts
expect(VAULT_CORE_TABLES).toEqual(['account_state', 'ai_preferences', 'ai_usage', 'attachments', 'audit_events', 'budget_category_limits', 'categories', 'command_receipts', 'consents', 'entity_changes', 'entity_heads', 'exports', 'import_candidates', 'import_parts', 'import_previews', 'import_row_progress', 'import_selection_rows', 'import_selections', 'import_uploads', 'monthly_budgets', 'revoked_sessions', 'schedule', 'snapshot_chunks', 'snapshots', 'sync_state', 'transaction_attachments', 'transactions', 'vault_objects', 'wallets'])
```
  - Add to `vault-schema.test.ts` (seed rows are plain inserts; `releasedId` names an `attachments` row with status `released`):

```ts
it('a record can hold only a retained receipt, and letting go of the last holder releases it and makes its object due', async () => {
  const stub = vault()
  // seed a wallet, a category, one transaction, a retained attachments row and its vault_objects row (published, delete_after NULL)
  await expect(sql(stub, "INSERT INTO transaction_attachments (transaction_id, attachment_id, attached_at) VALUES (?, ?, 'x')", tx, releasedId)).rejects.toThrow(/retained receipt/)
  await sql(stub, "INSERT INTO transaction_attachments (transaction_id, attachment_id, attached_at) VALUES (?, ?, 'x')", tx, retainedId)
  await sql(stub, 'DELETE FROM transactions WHERE id = ?', tx)
  expect(await sql(stub, 'SELECT status, released_at FROM attachments WHERE id = ?', retainedId)).toEqual([{ status: 'released', released_at: null }])
  expect(await sql(stub, 'SELECT delete_after FROM vault_objects WHERE key = ?', key)).toEqual([{ delete_after: 0 }])
})
```
  - In `files-erase.test.ts`:
    - `erase empties the vault, cancels its alarm and leaves only the deleted marker`: seed a `consents` row, a wallet row and `setAlarm(Date.now() + 60_000)`; after `await stub.erase()`, every user table is empty except `account_state`, which is `[{ account_id: '', status: 'deleted' }]`; `getAlarm()` is null; `erased` is true.
    - `an erased vault stays erased after it sleeps`: `member(client, user)`; `vaultOf(user).erase()`; `evictAllDurableObjects()`; `GET /v1/me` is 403 `ACCOUNT_UNAVAILABLE`; `account_state` is still only the marker; a second `erase()` resolves.
    - `purgeVaultObjects deletes every object under the vault's prefixes and nothing of another vault`: one object per purpose for vaults A and B; purging A returns 5; A has none left and B still has 5.
    - `purgeVaultObjects pages through more than one listing`: 1,001 objects under `receipt/<A>/` are all deleted; it returns 1001.
    - `vault object keys pass the store's key rule and refuse a vault id that is not 64 hex characters`: `vaultObjectKey('receipt', 'f'.repeat(64), id, token, 'image.jpg')` equals `` `receipt/${'f'.repeat(64)}/${id}/${token}/image.jpg` ``; `vaultObjectKey('receipt', 'nope', 'x')` throws `ObjectStoreError`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/vault-schema.test.ts test/workers/files-erase.test.ts`. Expected: the table-list, migration-count and trigger cases and the five erase cases fail on assertions. Record the counts.
- [ ] **Step 3: Write `0001_vault_files.sql`.** Port the API tables named below without `account_id` and `lifecycle_generation`, with 1A's porting rules. Every table ends with `STRICT`. CHECKs that compare two timestamps (`<= created_at + interval …`) are dropped and asserted by the owning task's tests. Separate statements with `--> statement-breakpoint`.
  - `vault_objects` (replaces `object_publications`): `key TEXT PRIMARY KEY`, `purpose TEXT NOT NULL` (one of the five), `status TEXT NOT NULL CHECK (status IN ('reserved', 'published', 'tombstone'))`, `delete_after INTEGER` (epoch ms, `>= 0`), `bytes INTEGER`, `sha256 TEXT` (64 lowercase hex), `created_at INTEGER NOT NULL` (epoch ms). CHECKs: `substr(key, 1, length(purpose) + 1) = purpose || '/'`; `status <> 'published' OR (bytes IS NOT NULL AND sha256 IS NOT NULL)`; `delete_after IS NOT NULL OR (status = 'published' AND purpose = 'receipt')`. Index `vault_objects_due_idx ON vault_objects (delete_after) WHERE delete_after IS NOT NULL`.
  - `snapshots` (from 0010's `snapshot_manifests`, plus the job state): `id TEXT PRIMARY KEY`, `status TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'failed'))`, `high_water INTEGER`, `chunk_count INTEGER CHECK (chunk_count BETWEEN 1 AND 10000)`, `created_at TEXT NOT NULL`, `started_at TEXT`, `ready_at TEXT`, `expires_at TEXT`; `(status = 'ready') = (high_water IS NOT NULL AND chunk_count IS NOT NULL AND ready_at IS NOT NULL AND expires_at IS NOT NULL)`.
  - `snapshot_chunks` (0010): `snapshot_id TEXT NOT NULL REFERENCES snapshots (id) ON DELETE CASCADE`, `chunk_index INTEGER NOT NULL CHECK (chunk_index BETWEEN 0 AND 9999)`, `object_key TEXT NOT NULL UNIQUE`, `bytes INTEGER NOT NULL CHECK (bytes >= 0)`, `sha256 TEXT NOT NULL`, `PRIMARY KEY (snapshot_id, chunk_index)`.
  - `exports` (0013): `export_id` becomes `id TEXT PRIMARY KEY`; add `status TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'failed'))`, `failure TEXT CHECK (failure IN ('too_large', 'error'))` with `(status = 'failed') = (failure IS NOT NULL)`, and `started_at TEXT`; keep "the file columns are set together, once" and add `(status = 'ready') = (ready_at IS NOT NULL)`; `sha256 TEXT`.
  - `import_uploads` (0014): `sha256 TEXT`; add `parse_state TEXT CHECK (parse_state IN ('queued', 'parsing', 'parsed', 'failed', 'cancelled'))` with `(status IN ('accepted', 'expired')) = (parse_state IS NOT NULL)`, `parse_attempts INTEGER NOT NULL DEFAULT 0 CHECK (parse_attempts BETWEEN 0 AND 3)`, `parse_failure TEXT`, `enqueued_at TEXT` and `enqueued_attempts INTEGER` (when the parse message was last sent or seen, and the attempts then; 1B-T5).
  - `import_parts` (new; the parts the API kept in `object_publications`): `job_id TEXT NOT NULL REFERENCES import_uploads (job_id) ON DELETE CASCADE`, `part_index INTEGER NOT NULL CHECK (part_index BETWEEN 0 AND 11)`, `object_key TEXT NOT NULL UNIQUE`, `bytes INTEGER`, `sha256 TEXT`, `PRIMARY KEY (job_id, part_index)`.
  - `import_previews` (0016, plus 0017's `image_attachment_id TEXT UNIQUE` with `(image_attachment_id IS NULL) = (image_key IS NULL)`; no trigger, the vault sets the id): `issues TEXT NOT NULL DEFAULT '[]'` with `json_valid(issues) AND json_type(issues) = 'array'`; `image_key` starts with `import_image/`.
  - `import_candidates` (0016): `source_row_id` is `'image:1'` or `GLOB 'row:[1-9]*'`; `issues TEXT` as a JSON array; `review_required INTEGER` (0 or 1); `PRIMARY KEY (job_id, source_row_id)`, `UNIQUE (job_id, ordinal)`.
  - `import_selections`, `import_selection_rows`, `import_row_progress` (0018): `import_selection_rows.wallet_id REFERENCES wallets (id)` and `category_id REFERENCES categories (id)`, with a `BEFORE INSERT` trigger refusing a category whose `type` differs from the row's (as 1A did for transactions); `import_row_progress.transaction_id TEXT UNIQUE REFERENCES transactions (id) ON DELETE SET NULL`. Port the structural checks of 0018's progress guard (same import, the selection matches the preview's `review_revision`, the preview is `ready`, the new transaction's type, amount, date, wallet, category, note and merchant equal the frozen row's) as a `BEFORE INSERT` trigger; the expiry check stays in code.
  - `attachments` (0017): `id TEXT PRIMARY KEY`, `source_job_id TEXT NOT NULL UNIQUE`, `status` (`retained` or `released`), `object_key TEXT NOT NULL UNIQUE` with `object_key GLOB 'receipt/*/*/*/image.*'` and the extension matching `content_type`, `content_type`, `bytes` (1 to 12582912), `sha256 TEXT`, `width`, `height` (`width * height <= 20000000`), `retained_at TEXT NOT NULL`, `released_at TEXT` with `released_at IS NULL OR status = 'released'` (B20).
  - `transaction_attachments` (0017): `transaction_id TEXT PRIMARY KEY REFERENCES transactions (id) ON DELETE CASCADE`, `attachment_id TEXT NOT NULL REFERENCES attachments (id)`, `attached_at TEXT NOT NULL`, index on `attachment_id`. Triggers:
    - `BEFORE INSERT` and `BEFORE UPDATE OF attachment_id`: `RAISE(ABORT, 'a record can hold only a retained receipt')` unless the attachment's status is `retained`.
    - `AFTER DELETE`, and `AFTER UPDATE OF attachment_id` when it changed: when no other row holds the old attachment, `UPDATE attachments SET status = 'released' WHERE id = <old> AND status = 'retained'` and `UPDATE vault_objects SET delete_after = 0 WHERE key = (SELECT object_key FROM attachments WHERE id = <old>)`.
  - `ai_preferences` (0019): one row `id INTEGER PRIMARY KEY CHECK (id = 1)`, `companion` and `cashback_tips` as 0 or 1, `notice_version INTEGER CHECK (notice_version >= 1)`, `updated_at TEXT NOT NULL`, `CHECK (companion = 0 OR notice_version IS NOT NULL)`.
  - `ai_usage` (0019): `day TEXT NOT NULL CHECK (date(day) IS day)`, `feature` (`parse`, `slip`, `note`, `ask`), `uses INTEGER NOT NULL DEFAULT 0 CHECK (uses BETWEEN 0 AND 1000)`, `PRIMARY KEY (day, feature)`.
  - On 1A's table: `CREATE INDEX entity_changes_purged_idx ON entity_changes (revision) WHERE state = 'purged'` (1B-T8 reads the purge watermark through it).
  - `migrations/index.ts`: `import files from './0001_vault_files.sql?raw'`; journal entry `idx` 1, `tag` `0001_vault_files`, `when` `1761436800000`, `breakpoints` true; key `m0001`.
- [ ] **Step 4: Write the Drizzle tables, the keys, the purge and the durable erase.** Add one `sqliteTable` per new table to `vaultSchema`, declaring each primary key column `notNull()` as 1A's schema does (STRICT makes SQLite report them so).
- [ ] **Step 5: Run them and see them pass.** Same command. Expected: all pass, and every 1A test still passes. Then `npm run build:edge`.
- [ ] **Step 6: Mutation check.**
  - Purge only the first page: the 1,001-object case fails.
  - List `${purpose}/` without the vault id: the other-vault case fails.
  - Drop the release trigger: the trigger case fails.
  - Skip the marker row in `erase`: the slept-vault case fails (the account is recreated and `/v1/me` answers 200).
- [ ] **Step 7: Gate, receipt, commit.** Commit: `git commit -m "Add the vault's files schema, its object keys, the prefix purge and a durable erase"`.

---

### Task 1B-T3: The files front door: step-only calls, Worker routes, streamed bodies, auth_time and the bridge

**Starts after:** 1A-T2, 1B-T2

**Files:**
- Create: `apps/edge/src/v1/fresh-sign-in.ts`, `src/v1/worker-routes.ts`, `src/v1/bridge.ts`
- Modify: `src/v1/protocol.ts`, `src/v1/routes.ts` (the step table; the bridge route leaves `VAULT_DEFERRED_ROUTES`), `src/v1/tokens.ts`, `src/v1/config.ts`, `src/v1/handler.ts`, `src/v1/env.ts` (`IMPORT_UPLOADS_ENABLED`, `GOGOCASH_BRIDGE_ENABLED`, `GOGOCASH_CATALOGUE_URL`, `OBJECTS`), `src/vault/user-vault.ts` (`call()`), `wrangler.vault.jsonc` (vars `"IMPORT_UPLOADS_ENABLED": "false"`, `"GOGOCASH_BRIDGE_ENABLED": "false"`), `test/workers/support/v1-client.ts`, `test/workers/front-door.test.ts` (`charge` on its hand-built calls), `test/vault-route-coverage.test.ts`
- Test: `test/workers/files-front-door.test.ts`, `test/workers/config.test.ts`

**Interfaces:**
- Consumes: `handleVaultV1`, `VaultCall`, `VaultReply`, `VaultClaims`, `VAULT_V1_ROUTES`, `vaultRouteOf`, `vaultStatusOf`, `readEdgeConfig`, `livePolicies`, `createTokenVerifier`, `toProblemReply`, `logFailure` and the client helpers (1A-T2); `CashbackCatalogueSource` (`src/server/bridge/catalogue.ts`); `flag` (`src/server/env.ts`); `BASE_HEADERS`, `jsonResponse`, `problemResponse`, `errorResponse` (`src/server/http/problem.ts`); `readJsonBody` (`src/server/http/request.ts`).
- Produces:
  ```ts
  // src/v1/protocol.ts (additions)
  export type VaultClaims = { accountId: string; sessionId: string; issuedAt: number; clientId: string; authTime?: number }
  export type VaultAccess = 'bound_session' | 'current_policy' | 'recent_proof'
  // VaultCall.access becomes VaultAccess. VaultCall gains `charge: 'read' | 'write' | 'step'` (required):
  // 'read' or 'write' charges the principal budget and that one; 'step' is a later step of the same request, not charged.
  export type WorkerRouteId = 'bridge.catalogue'   // later tasks add their ids
  // src/v1/routes.ts (additions)
  export const VAULT_STEP_ROUTES: Partial<Record<VaultRouteId, { status?: number }>>   // step-only ids; empty here
  export function stepRouteOf(id: VaultRouteId): { status?: number } | undefined
  // vaultStatusOf(id): the route's status, else the step's `status ?? 200`, else it throws as today
  ```
  - `VaultRoute` gains `access: … | 'recent_proof'`, `worker?: WorkerRouteId` and `body?: 'json' | 'stream'` (default `json`). Every task that adds a step id adds it to `VAULT_STEP_ROUTES` and to `VAULT_HANDLERS`.
  - `FRESH_SIGN_IN_SECONDS = 300` and `assertFreshSignIn(claims: Pick<VaultClaims, 'authTime'>, nowSeconds: number): void`, which throws `ProblemException(401, 'REAUTH_REQUIRED')` unless `nowSeconds - 300 <= authTime <= nowSeconds + CLOCK_TOLERANCE_SECONDS` (`@api/auth/auth0-token-verifier`, 30).
  ```ts
  // src/v1/worker-routes.ts
  export type VaultSession = {
    readonly vaultId: string
    readonly stub: DurableObjectStub<UserVault>
    readonly policies: PublishedPolicies   // the live list (1A ruling R20)
    call(route: VaultRouteId, input?: { params?: Record<string, string>; query?: Record<string, unknown>; headers?: Record<string, string | undefined>; body?: unknown }): Promise<VaultReply>
  }
  export type WorkerContext = {
    env: V1Env
    request: Request
    claims: VaultClaims | null          // null on public routes
    policies: PublishedPolicies         // the live list
    gates: FeatureGates
    params: Record<string, string>
    query: Record<string, unknown>
    headers: Record<string, string | undefined>   // every request header, lowercase
    body: unknown                        // parsed JSON; undefined when none was sent
    stream?: AsyncIterable<Uint8Array>   // the unread body, on `body: 'stream'` routes
    vault: VaultSession | null           // null on public routes
    waitUntil(promise: Promise<unknown>): void
  }
  export type WorkerHandler = (w: WorkerContext) => Promise<Response | VaultReply>
  export const WORKER_HANDLERS: Partial<Record<WorkerRouteId, WorkerHandler>>
  export function vaultSession(env: V1Env, claims: VaultClaims, policies: PublishedPolicies, access: VaultAccess, charge: 'read' | 'write'): VaultSession
  export function workerSessionFor(env: V1Env, claims: VaultClaims, config: EdgeConfig, route: VaultRoute, now: Date): VaultSession
  ```
  - `vaultSession(...).call` sends `access` on every call, the route's `charge` on the first call, and `'step'` on every later one. `workerSessionFor` builds it with `livePolicies(config.policies, now)` and `charge` from the route's method (`GET` is `'read'`, anything else `'write'`).
  - `handleVaultV1` sets `charge` on every vault-route call the same way, and its `deps` gains `waitUntil?: (promise: Promise<unknown>) => void` (default: `waitUntil` from `cloudflare:workers`) and `fetchCatalogue?: typeof fetch`.
  - `UserVault#call`: the route is `vaultRouteOf(call.route) ?? stepRouteOf(call.route)` with a handler, else 500 as today. It charges `principal` and `call.charge` unless `charge` is `'step'`, in 1A's order (account, principal, session, read or write, policy). `recent_proof` is checked like `bound_session` (policy-exempt, as the API's access class says). 1A's tests that build a `VaultCall` by hand (`front-door.test.ts`) gain `charge: 'write'`, since the field is required.
  - Test client: `TokenOptions` gains `authTime?: number` (it sets the `auth_time` claim, absent unless given); `startV1(config?, options?: { env?: Partial<V1Env>; fetchCatalogue?: typeof fetch })`.

- [ ] **Step 1: Stub, then write the failing tests.** First add the new types and tables with typed stubs: an empty `VAULT_STEP_ROUTES`, `stepRouteOf` returning undefined, `assertFreshSignIn` that never throws, `workerSessionFor` that passes `config.policies` unfiltered, and a bridge handler answering 501.
  - `files-front-door.test.ts`:
    - `the bridge catalogue is public and 404 while the bridge is off`: with `env: { GOGOCASH_BRIDGE_ENABLED: 'false' }`, `GET /v1/bridge/gogocash/catalogue` without any token or client header is 404 `NOT_FOUND` with `cache-control: no-store`.
    - `the bridge serves the built-in brands through the front door, with the v1 headers`: with `GOGOCASH_BRIDGE_ENABLED: 'true'`, `GOGOCASH_CATALOGUE_URL: 'https://catalogue.test/brands.json'` and a `fetchCatalogue` that rejects, the answer is 200, every brand link starts with `https://gogocash.co`, and `x-request-id` is a UUID. A HEAD request gets the same status and headers and no body.
    - `assertFreshSignIn accepts a sign-in up to 300 seconds old and refuses older, missing or future ones`:

```ts
const now = 1_000_000
expect(() => assertFreshSignIn({ authTime: now - 300 }, now)).not.toThrow()
expect(() => assertFreshSignIn({ authTime: now + 30 }, now)).not.toThrow()
for (const authTime of [now - 301, now + 31, undefined]) {
  try { assertFreshSignIn({ authTime }, now); expect.unreachable() } catch (e) { expect((e as ProblemException).getStatus()).toBe(401); expect((e as ProblemException).code).toBe('REAUTH_REQUIRED') }
}
```
    - `a token's auth_time is optional, and one in the future is 401 UNAUTHENTICATED`: `GET /v1/me` with `authTime: now - 10` is 200, without it is 200, and with `authTime: now + 31` is 401 `UNAUTHENTICATED`.
    - `a step-only id answers 200 from the vault`: with a test entry added for the case and removed afterwards (`'test.step' as VaultRouteId` in `VAULT_STEP_ROUTES` and a `VAULT_HANDLERS` handler returning `okReply(call.route, { ok: 1 })`), `vaultSession(...).call('test.step')` answers `{ ok: true, status: 200, body: { ok: 1 } }`.
    - `only the first vault call of a request is charged`: two users, A and B, with both vaults' clocks pinned to `2026-10-25T00:00:10.000Z`. 121 `me.get` calls through one `vaultSession` for A never get 429. 121 separate `vaultSession`s for B (same claims) get 429 `RATE_LIMITED` on the 121st (the `read` budget, 120 per session per minute).
    - `a Worker route's vault calls see only the live policies`: the config holds `TEST_POLICIES` plus terms v2 (required) published tomorrow; for a member who accepted terms v1, `workerSessionFor(env, claims, config, { method: 'POST', path: '/v1/x', access: 'current_policy', worker: 'bridge.catalogue' }, new Date())` holds no terms v2 in `policies`, and its `me.get` call answers 200. The unfiltered list would be refused for policy.
  - `config.test.ts`: `uploads stay unexposed unless IMPORT_UPLOADS_ENABLED is 1 or true, on the fail-closed path too`: with an absent config, `gates.isExposed('uploads')` is false for `undefined`, `'false'` and `'yes'`, and true for `'1'` and `'true'`; with a KV that throws, it is false without the flag and true with `'true'` (while `assertOpen('uploads')` still throws 503).
  - `vault-route-coverage.test.ts`: a route in `VAULT_V1_ROUTES` has exactly one of `vault` (with a `VAULT_HANDLERS` entry) or `worker` (with a `WORKER_HANDLERS` entry), except `GET /v1/policies`, which has neither; every id in `VAULT_STEP_ROUTES` has a `VAULT_HANDLERS` entry and no `VAULT_V1_ROUTES` entry; `recent_proof` routes keep that access; and `expect(VAULT_DEFERRED_ROUTES).not.toContain('GET /v1/bridge/gogocash/catalogue')`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/files-front-door.test.ts test/workers/config.test.ts` and `npm run test:edge -- test/vault-route-coverage.test.ts`. Expected: the new cases fail on assertions. Record the counts.
- [ ] **Step 3: Implement.**
  - `handleVaultV1` keeps 1A's order for every route. A `worker` route reads its JSON body with `readJsonBody` (it ignores non-JSON content types, as the edge's dispatcher does) and, on `body: 'stream'` routes, leaves `request.body` unread as `stream`; then gates. A `public` route without `worker` is still the policy list; a `public` Worker route runs now, with `claims` and `vault` null (no client-version or token check, as the dispatcher skips them for public routes). Any other Worker route runs after the client version and the token, with `workerSessionFor(env, claims, config, route, new Date())`.
  - A handler's `VaultReply` is converted as 1A converts vault replies. A `Response` gets `BASE_HEADERS` and `x-request-id`; HEAD drops its body. A handler that throws is answered by `errorResponse`, as 1A's handler does.
  - `tokens.ts`: `auth_time`, when present, must be an integer `>= 0` and `<= now + 30`, else 401 `UNAUTHENTICATED`; it becomes `claims.authTime`.
  - `config.ts`: `readEdgeConfig` builds `FeatureGates` with `unexposed: ['uploads']` unless `flag(env.IMPORT_UPLOADS_ENABLED)`, on both paths; its `env` parameter narrows to `Partial<Pick<V1Env, 'MIN_CLIENT_VERSION_IOS' | 'MIN_CLIENT_VERSION_ANDROID' | 'IMPORT_UPLOADS_ENABLED'>>`.
  - `bridge.ts`: the `bridge.catalogue` handler answers `{ ok: true, status: 200, body: await source.get() }`. `source` is a `CashbackCatalogueSource` kept per isolate, one per combination of `GOGOCASH_BRIDGE_ENABLED`, `GOGOCASH_CATALOGUE_URL` and `fetchCatalogue`, so its one-hour cache works.
- [ ] **Step 4: Run them and see them pass.** Expected: all pass, and every 1A test still passes.
- [ ] **Step 5: Mutation check.**
  - Charge every call: the first-call case fails.
  - Pass `config.policies` unfiltered: the live-policies case fails.
  - Accept a future `auth_time`: the 401 case fails.
  - Drop the step fallback in `call()`: the step-only case fails (500).
- [ ] **Step 6: Gate, receipt, commit.** Commit: `git commit -m "Run Worker routes in front of the vault: step-only calls, streamed bodies, auth_time and the cashback catalogue"`.

---

### Task 1B-T4: The vault's object registry with tombstones, grants and pending-work starts

**Starts after:** 1B-T3

**Files:**
- Create: `apps/edge/src/vault/files/context.ts`, `src/vault/files/objects.ts`, `src/vault/files/grants.ts`, `src/vault/files/work.ts`, `src/background/vault-stub.ts`, `src/v1/files/downloads.ts` (the download slots; 1B-T6, T8 and T9 add their serve functions), `test/workers/support/files.ts` (`TINY_JPEG`; 1B-T5, T8, T9 and T10 add their helpers)
- Modify: `src/vault/context.ts` (`VaultContext` gains `vaultId: string`, set by `call()` from `ctx.id.toString()`, and `touched?: boolean`), `src/vault/user-vault.ts`, `src/v1/routes.ts` (`starts?: true`), `src/v1/handler.ts`, `src/v1/config.ts` (`readGates`), `src/cloudflare-workers.d.ts` (`Workflow`, `WorkflowInstance`, `Queue`), `test/workers/support/v1-client.ts`
- Test: `test/workers/files-objects.test.ts`

**Interfaces:**
- Consumes: `VaultContext` and its `digester` (1A), `vaultObjectKey`, `VaultBucket` (1B-T2), `vaultSession` (1B-T3), `SnapshotGrants` (`@api/sync/snapshot-grants`), `ObjectStoreError` (`@api/storage/object-store`), `ATTACHMENT_GRANT_MINUTES` (contracts).
- Produces:
  ```ts
  // src/vault/files/context.ts (a VaultContext is also a FileContext)
  export type FileContext = { sql: SqlStorage; storage: DurableObjectStorage; now: Date; vaultId: string; touched?: boolean }
  export function touch(c: FileContext): void   // every 1B function that writes a row calls it
  // src/vault/files/objects.ts
  export const RESERVATION_GRACE_MS = 15 * 60_000
  export const TOMBSTONE_MS = 86_400_000
  export const DELETE_RETRY_MS = 60_000
  export function reserveObject(c: FileContext, key: string, purpose: VaultObjectPurpose, graceMs?: number): void
  export function publishObject(c: FileContext, key: string, file: { bytes: number; sha256: string }, deleteAfter: number | null): void
  export function releaseObject(c: FileContext, key: string): void                 // due now (delete_after = 0)
  export function tombstoneObjects(c: FileContext, keys: readonly string[]): void  // already deleted from R2: due again in TOMBSTONE_MS
  export function dueObjectKeys(c: FileContext, limit?: number): { key: string; status: 'reserved' | 'published' | 'tombstone' }[]
  export function objectsDueAt(c: FileContext): number | null                     // the smallest delete_after
  export function deleteDueObjects(v: { context(): FileContext; bucket: VaultBucket }, maxBatches?: number): Promise<number>
  export function putConcatenated(bucket: VaultBucket, key: string, parts: Uint8Array[], totalBytes: number, contentType: string): Promise<{ bytes: number; sha256: string }>
  // src/vault/files/grants.ts
  export type GrantPurpose = 'snapshot' | 'export' | 'attachment'
  export function vaultGrants(c: Pick<VaultContext, 'digester'>, purpose: GrantPurpose): SnapshotGrants
  export function receiptGrantScope(claims: VaultClaims): string   // `${accountId}\u0000${sessionId}`
  // src/vault/files/work.ts
  export type BuildOutcome = { outcome: 'ready' | 'skipped' | 'too_large' | 'failed' }   // writeExport and buildSnapshot answer this
  export type StartResult = 'started' | 'unbound'
  export type WorkStarter = { kind: 'snapshot' | 'export' | 'parse'; unstarted(c: FileContext): readonly string[]; dueAt(c: FileContext): number | null; start(env: VaultEnv, vaultId: string, id: string): Promise<StartResult>; markStarted(c: FileContext, id: string): void }
  export const START_RETRY_MS = 60_000
  export const WORK_STARTERS: WorkStarter[]   // empty here; 1B-T5, T6 and T8 each add one
  export function createOnce<P>(workflow: Workflow<P>, id: string, params: P): Promise<void>
  export function startDueAt(c: FileContext, lastStartAttemptMs: number | null, starters?: readonly WorkStarter[]): number | null
  export type PendingWorkHost = { env: VaultEnv; erased: boolean; context(): FileContext; active(c: FileContext): boolean; gates(): Promise<FeatureGates> }
  export function startPendingWork(v: PendingWorkHost, starters?: readonly WorkStarter[]): Promise<{ started: number; failed: number; held: boolean }>
  // src/background/vault-stub.ts
  export function vaultById(env: { VAULT: DurableObjectNamespace<UserVault> }, vaultId: string): DurableObjectStub<UserVault>   // env.VAULT.get(env.VAULT.idFromString(vaultId))
  // src/v1/files/downloads.ts
  export const EXPORT_SLOTS = new DownloadSlots(4)       // the API's EXPORT_DOWNLOADS_PER_PROCESS, per isolate
  export const RECEIPT_SLOTS = new DownloadSlots(8, 2)   // DEFAULT_ATTACHMENT_LIMITS downloadsPerProcess and downloadsPerAccount
  // src/v1/config.ts
  export function readGates(kv: KVNamespace): Promise<FeatureGates>   // readEdgeConfig's gates, failing closed the same way
  ```
  - `deleteDueObjects` (B19): due `reserved` and `published` keys are deleted from R2 in batches of up to 1,000 and become tombstones (`status 'tombstone'`, `delete_after` now plus `TOMBSTONE_MS`); due tombstones are deleted from R2 once more and their rows dropped. A failed R2 delete keeps its rows' status and moves their `delete_after` to now plus `DELETE_RETRY_MS` (logged with `logFailure`), so the alarm retries a minute later instead of firing again at once. It stops when nothing is due, or after `maxBatches` (default 10).
  - `tombstoneObjects` is how a writer forgets keys it deleted itself (the upload intake's `discarded`, 1B-T5): the rows become tombstones at once, so a PUT still in flight is deleted a day later.
  - Every key list binds as one JSON parameter (ruling R57), in `tombstoneObjects` and in each batch's row update.
  - `putConcatenated` (B21): one `Buffer.concat(parts, totalBytes)` (a single part is used as it is), then `parts.length = 0`, then the SHA-256, then `bucket.put(key, data, { onlyIf: new Headers({ 'if-none-match': '*' }), sha256, customMetadata: { sha256 }, httpMetadata: { contentType } })`. A null answer is `ObjectStoreError('exists')` and any throw `ObjectStoreError('unavailable')`, the rules of `R2ObjectStore.putStream` without its extra copies.
  - `startDueAt`: the later of the earliest `dueAt` of the starters and `lastStartAttemptMs + START_RETRY_MS`; null when no starter has work. A starter's `dueAt` is the time its oldest unstarted item becomes worth a retry.
  - `startPendingWork`: nothing for an erased or inactive vault; `{ started: 0, failed: 0, held: true }` while `jobs` is paused (`gates()`); otherwise, for each starter and unstarted id, `start`, and on `started` a short block that runs `markStarted`. A throw counts as failed and is logged with `logFailure`.
  - `UserVault` gains `get vaultId(): string` (`ctx.id.toString()`), `get bucket(): VaultBucket`, `fileContext(): FileContext` (the clock read once), `isActive(c: FileContext): boolean` (an `account_state` row with status `active`), `lastStartAttemptMs: number | null` (memory only, set by every `startPendingWork` run) and `startPendingWork()`, whose host's `gates` is `() => readGates(this.env.CONFIG)`. `VaultEnv` gains `CONFIG?: KVNamespace`.
  - Key grants: `vaultGrants` derives `gogospend.snapshot-grant.v1`, `gogospend.export-grant.v1` and `gogospend.attachment-grant.v1` with `c.digester.deriveKeys`, as the edge's `buildContainer` did; attachment grants last `ATTACHMENT_GRANT_MINUTES`.
  - `createOnce`: `create({ id, params })`; when that throws, `get(id)` resolving means the instance exists (Workflows docs: `create` throws for a used id); otherwise the first error is rethrown.
  - `handleVaultV1`'s `deps` gains `startWork?: (stub: DurableObjectStub<UserVault>) => Promise<unknown>` (default `stub.startPendingWork()`); a route with `starts: true` that answers 2xx runs `deps.waitUntil(deps.startWork(stub))`. `startsWork(route: VaultRoute, status: number): boolean` is exported for the test.
  - Test client: `startV1` options gain `startWork?: 'auto' | 'manual'` (manual does nothing); `V1Client.settle(): Promise<void>` awaits every promise handed to `waitUntil`.

- [ ] **Step 1: Stub, then write the failing tests.** First add every module above with typed stubs (`dueObjectKeys` returns `[]`, `objectsDueAt` and `startDueAt` return null, `deleteDueObjects` and `startPendingWork` resolve zero counts, `putConcatenated` resolves `{ bytes: 0, sha256: '' }`, `startsWork` returns false). Then, in `files-objects.test.ts` (registry functions run inside `runInDurableObject` with `now` set per call):
  - `a reserved key is due at its grace deadline, a published one at its expiry, and a held receipt never until released`: at `t0`, reserve `k1` (export) and `k2` (receipt); publish `k2` with `deleteAfter` null, and reserve then publish `k3` (export) with `t0 + 24 h`. `dueObjectKeys` at `t0 + 15 min - 1` is empty, at `t0 + 15 min` names `k1`, at `t0 + 24 h` names `k1` and `k3`; after `releaseObject(k2)`, `k2` is due at once.
  - `a key written after it was forgotten is still deleted` (B19, ruling R29), in two halves:
    - Forgotten by its writer: `tombstoneObjects([k])` leaves a `tombstone` row due at now plus 86,400,000. Then put `k` into R2 (a late PUT). A day later `deleteDueObjects` removes it from R2 and drops the row.
    - Given up at its deadline: reserve `k2`. Past its grace, `deleteDueObjects` removes it from R2 and leaves a tombstone due a day later. A late PUT of `k2` is removed by the next day's run.
  - `publishing a key that was never reserved throws and writes nothing`.
  - `a failed R2 delete keeps the rows and retries them a minute later`: with a bucket whose `delete` throws, the due rows keep their status, their `delete_after` becomes now plus 60,000, and it resolves 0.
  - `registry functions take more key lists than SQLite has parameters` (ruling R57): `tombstoneObjects` with 1,001 keys marks all 1,001; `deleteDueObjects` with 1,001 due keys deletes them in two R2 batches and tombstones every row.
  - `putConcatenated stores one create-only object with its SHA-256 and refuses an existing key`: two parts give an object equal to their concatenation, whose `customMetadata.sha256` is its hex digest; `parts` is already empty when `put` runs (the test's bucket records its length); a second call with the same key throws `ObjectStoreError` with code `exists`.
  - `grants are per purpose, and a receipt grant is bound to its session`: a snapshot grant does not verify as an export grant; an attachment grant issued for `receiptGrantScope(a)` does not verify for claims with another `sessionId`.
  - `a route marked starts hands its vault to startWork only after a 2xx`: `startsWork({ …, starts: true }, 202)` is true; with 409, or without `starts`, it is false.
  - `startPendingWork starts each item once and marks it, counts an existing instance as started, and leaves an unbound kind for later`: with fake starters (one starts, one is unbound, one throws), `started` is 1 and `failed` is 1; only the started item is marked, so a second run tries the other two again.
  - `startPendingWork starts nothing while jobs is paused` (C12): with gates `{ paused: ['jobs'] }`, it answers `held: true` and no starter's `start` runs; once the gate opens, the next run starts the item.
  - `createOnce treats an existing instance as created and rethrows otherwise`, with a fake `Workflow`.
  - `TINY_JPEG is a valid 1×1 baseline JPEG`: `TINY_JPEG` (JFIF APP0, DQT, SOF0, DHT, SOS, EOI; no other APPn) gives `sanitizedImageHeader(Buffer.from(TINY_JPEG), 'jpeg')` equal to `{ width: 1, height: 1 }`, imported from `@api/imports/parse-handler` (which exports it today and re-exports it after 1B-T1).
  - `startPendingWork does nothing in an erased vault or one that is not active`.
  - `startDueAt is the later of the starters' earliest and the last attempt plus a minute`, and `after deleteDueObjects at objectsDueAt, the next objectsDueAt is later or null`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/files-objects.test.ts`. Expected: every case fails on assertions. Record the counts.
- [ ] **Step 3: Implement.** Registry functions run plain SQL and call `touch`; the caller chooses the transaction (a command's block, or a short `transactionSync` of its own).
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.**
  - Drop tombstones (forget rows at once): the late-PUT case fails.
  - Leave a failed delete due: the retry-a-minute-later case fails.
  - Bind one `?` per key: the 1,001-key case fails (too many SQL variables).
  - Ignore the `jobs` gate: the paused case fails.
  - Empty `parts` only after `put` in `putConcatenated`: the empty-parts assertion fails (the test's bucket sees the parts still held).
  - Mark an unbound item as started: the starter case fails.
- [ ] **Step 6: Gate, receipt, commit.** Commit: `git commit -m "Give the vault its own object registry with tombstones, per-purpose grants and pending-work starts"`.

---

### Task 1B-T5: Statement uploads and the parse pipeline (Queue, consumer, parser Container)

**Starts after:** 1B-T1, 1B-T4

**Files:**
- Create: `apps/edge/src/vault/files/intake.ts`, `src/vault/files/parse.ts`, `src/v1/files/uploads.ts`, `src/background/statement-parser.ts`, `src/background/parse-consumer.ts`
- Modify: `test/workers/support/files.ts` (the upload and parse helpers), `src/v1/protocol.ts`, `src/v1/routes.ts` (two routes, six step ids), `src/v1/worker-routes.ts`, `src/v1/env.ts` (`PARSER`), `src/vault/routes.ts`, `src/vault/user-vault.ts` (the background methods; `VaultEnv` gains `PARSE_QUEUE`), `src/vault/files/work.ts` (the parse starter), `src/roles/vault.ts` (export `StatementParser`; the default export gains `queue: (batch, env) => handleParseBatch(batch, env)`), `wrangler.vault.jsonc`, `src/cloudflare-workers.d.ts` (`MessageBatch`, `Message`, `ExecutionContext`; `ContainerLike.getTcpPort(port)` returning `{ fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> }`), `test/workers/support/v1-client.ts` (`UserClient.request(method, path, init?: { body?: BodyInit; headers?: Record<string, string> })`, which adds the token and client headers)
- Test: `test/workers/imports-intake.test.ts`, `test/workers/imports-parse.test.ts`

**Interfaces:**
- Consumes: `vaultSession`, `WORKER_HANDLERS`, `VAULT_STEP_ROUTES` (1B-T3); `reserveObject`, `publishObject`, `releaseObject`, `tombstoneObjects`, `touch`, `WORK_STARTERS`, `START_RETRY_MS`, `readGates`, `vaultById` (1B-T4); `vaultObjectKey` (1B-T2); `UploadIntake` (`@api/imports/upload-intake`) and `ImportIntakeRepository`, `BeginInput`, `BeginResult`, `FinishInput`, `FinishResult`, `IntakeOutcomeCode` (`@api/imports/import.repository`); `toPreviewRecord`, `sanitizedImageHeader`, `magicFormat`, `previewFromOutcome`, `CandidateRecord`, `PreviewRecord` (`@api/imports/parse-outcome`) and the type `ParseServiceReply` (`@api/imports/parse-server`), from 1B-T1; `R2ObjectStore`.
- Produces:
  - Routes (from `VAULT_DEFERRED_ROUTES`): `POST /v1/imports` (`current_policy`, `worker: 'import.upload'`, `body: 'stream'`, gates `['uploads', 'imports']`, status 202, `starts: true`) and `GET /v1/imports/:id` (`bound_session`, `vault: 'imports.status'`).
  - `VaultRouteId` gains `'imports.status'` and the step-only ids `'imports.begin' | 'imports.reservePart' | 'imports.finish' | 'imports.abort' | 'imports.discarded' | 'imports.bytesRetry'`, which go into `VAULT_STEP_ROUTES`. `WorkerRouteId` gains `'import.upload'`.
  - `vaultIntakeRepository(session: VaultSession): ImportIntakeRepository`. Each method makes one step call. An `ok` reply's body is the result; a problem reply is thrown as `new ProblemException(reply.status, reply.code, reply.problem)`. Bodies and replies (structured clone keeps any `Date` in them):
    - `begin`: body `BeginInput`, reply `BeginResult`.
    - `reservePart`: body `{ job_id, intake_token, index }`, reply `{ key: string | null }`.
    - `finish`: body `FinishInput`, reply `FinishResult`.
    - `abort`: body `{ job_id, intake_token, status, code }`, reply `{ keys: string[] }`.
    - `discarded`: body `{ job_id, intake_token, keys }`, reply `{}`.
    - `bytesRetry`: body `{ need }`, reply `{ seconds: number }`.
  - `sessionContextOf(claims: VaultClaims): SessionContext` (`{ accountId, subject: accountId, clientId, bindingId: sessionId, sessionGeneration: 0 }`).
  - In `intake.ts`, ports of the 0014 routines:
    - `beginUpload(c: VaultContext, input: BeginInput): BeginResult`, with `gogospend_import_quota` and `gogospend_fail_stale_import_uploads`.
    - `reserveUploadPart(c, jobId: string, intakeToken: string, index: number): string | null`. The key is `vaultObjectKey('import_quarantine', c.vaultId, jobId, intakeToken, 'part-' + String(index).padStart(4, '0'))`, reserved until the receive deadline plus `RESERVATION_GRACE_MS`.
    - `finishUpload(c, input: FinishInput): FinishResult`: the parts are published with `delete_after` at acceptance plus 24 hours, in one set-based statement over the job's `import_parts` rows, and `parse_state` becomes `queued`.
    - `abortUpload(c, jobId, intakeToken, status, code): string[]` returns the unpublished part keys and makes them due now, so the alarm deletes any the intake could not.
    - `discardUploadParts(c, jobId, intakeToken, keys): void` tombstones the keys the intake deleted (`tombstoneObjects`, one JSON parameter).
    - `uploadBytesRetry(c, need): number` and `uploadStatus(c, jobId): ImportJobDto | null`. The status is `expired` when the upload expired, else `parse_state`, as `importStatus` maps job states.
    - `pruneUploads(c: FileContext): void` ports `gogospend_fail_stale_import_uploads`, the raw file's 24-hour expiry, and the drop of finished upload rows 30 days after they ended (never one still receiving or inside the quota window). `uploadsDueAt(c: FileContext): number | null` is the earliest time one of those rules applies, computed from the same constants (ruling R37).
  - In `parse.ts` (background, `FileContext`):
    ```ts
    export const PARSE_MAX_ATTEMPTS = 3
    export const PARSE_RESEND_MS = 3_600_000
    export const MIN_RAW_LIFETIME_MS = 5 * 60_000
    export type ParseSource =
      | { kind: 'parse'; attempt: number; format: ParseFormat; bytes: number; sha256: string; today: string; parts: { key: string; bytes: number; sha256: string }[] }
      | { kind: 'held' } | { kind: 'skip' }
    export type ParsedPreview = { record: PreviewRecord; image: { key: string; bytes: number; sha256: string; width: number; height: number } | null }
    export function parseSource(c: FileContext, jobId: string, held: readonly ParseFormat[]): ParseSource
    export function reserveImageKey(c: FileContext, jobId: string, format: ImageFormat): string | null
    export function recordPreview(c: FileContext, jobId: string, parsed: ParsedPreview): { recorded: boolean }
    export function retryParse(c: FileContext, jobId: string, spent: boolean): void
    export function failParse(c: FileContext, jobId: string, code: string): void
    ```
    - `parseSource` decides in this order:
      1. A job that is not an accepted upload with `parse_state` `queued` or `parsing` gives `skip`.
      2. With less than `MIN_RAW_LIFETIME_MS` before the raw file expires, the job becomes `failed` (`import_unavailable`) and the answer is `skip`, even for a held format (the API's "does not park a raw file past its expiry").
      3. A format in `held` gives `held` and spends no attempt.
      4. A job with 3 attempts becomes `failed` (`import_unavailable`) and gives `skip`.
      5. Otherwise it sets `parsing`, adds an attempt and answers `parse` with `today = bangkokDate(now)`.
      `held` and `parse` both set `enqueued_at` to now and `enqueued_attempts` to the job's attempts, so a message the consumer keeps seeing keeps its import fresh (ruling R32).
    - `reserveImageKey` works only while `parsing`: `vaultObjectKey('import_image', c.vaultId, jobId, crypto.randomUUID(), 'image.' + ext)`.
    - `recordPreview` ports `gogospend_record_import_preview`, only while `parsing` and before the raw file expires. It writes the preview (`review_revision` 1, `expires_at` now plus 7 days, `image_attachment_id` a new UUID when there is an image) and its candidates, one INSERT per candidate (ruling R57). It publishes the image with `delete_after` now plus 24 hours and sets `parsed`. Otherwise it answers `{ recorded: false }` and writes nothing.
    - `retryParse` sets `parsing` back to `queued` and refreshes `enqueued_at`; with `spent` false it also gives the attempt back, because the parse never ran. `failParse` sets `failed` with the code and releases the job's unpublished image keys.
  - `UserVault` background methods, each answering its skipped value when the vault is erased or not active: `parseSource(jobId, held)`, `reserveImageKey(jobId, format)`, `recordPreview(jobId, parsed)`, `retryParse(jobId, spent)`, `failParse(jobId, code)`.
  - The parse starter (ruling R32):
    - One condition serves both `unstarted` and `dueAt`: an accepted upload with `parse_state` `queued` whose `enqueued_at` is null or more than `PARSE_RESEND_MS` old. A stale `enqueued_at` is a message no consumer has seen for an hour, as when the queue discarded it after `max_retries` (gate holds use the retries up). `dueAt` is the earliest of `accepted_at + START_RETRY_MS` over unsent uploads and `enqueued_at + PARSE_RESEND_MS` over sent ones.
    - `start` sends `{ vault, job }` to `env.PARSE_QUEUE` (`unbound` without it); `markStarted` sets `enqueued_at` and `enqueued_attempts` (the attempts are kept for diagnosis; no rule reads them).
    - A message sent twice is harmless: the consumer runs one message at a time, and `parseSource` skips a job that is no longer `queued` or `parsing`.
    - `VaultEnv` gains `PARSE_QUEUE?: Queue<ParseMessage>`.
  ```ts
  // src/background/parse-consumer.ts
  export type ParseMessage = { vault: string; job: string }
  export type ParserPort = { parse(input: { format: ParseFormat; today: string; bytes: Uint8Array }): Promise<ParseServiceReply> }
  export const PARSE_RETRY_SECONDS = 30
  export function containerParser(binding: DurableObjectNamespace<StatementParser>): ParserPort   // getByName(PARSER_NAME).parse(input)
  export function handleParseBatch(batch: MessageBatch<ParseMessage>, env: V1Env, deps?: { parser?: ParserPort; gates?: (env: V1Env) => Promise<FeatureGates> }): Promise<void>
  // src/background/statement-parser.ts
  export const PARSER_NAME = 'statement-parser'
  export const PARSER_PORT = 8080
  export const PARSER_ENTRYPOINT = ['node', 'dist/imports/parse-server.js']
  export class StatementParser extends DurableObject { parse(input: { format: ParseFormat; today: string; bytes: Uint8Array }): Promise<ParseServiceReply> }
  ```
  - `wrangler.vault.jsonc` additions:
    ```jsonc
    "queues": {
      "producers": [{ "binding": "PARSE_QUEUE", "queue": "jotbun-statement-parse" }],
      "consumers": [{ "queue": "jotbun-statement-parse", "max_batch_size": 1, "max_concurrency": 1, "max_retries": 100, "retry_delay": 30 }]
    },
    "containers": [{ "class_name": "StatementParser", "image": "../api/Dockerfile", "image_build_context": "../..", "instance_type": "basic", "max_instances": 1 }],
    // durable_objects.bindings += { "name": "PARSER", "class_name": "StatementParser" }
    // migrations += { "tag": "v2-statement-parser", "new_sqlite_classes": ["StatementParser"] }
    "dev": { "enable_containers": false }
    ```
    `max_retries` is the Queues maximum (100, Queues limits), because gate holds retry without spending a parse attempt; the vault counts real attempts (B6) and re-sends a discarded message (R32). `max_concurrency` 1 is inside the documented 1 to 250. A consumer's 15-minute wall-clock limit covers a container start (60 s) plus a parse (120 s). The Workers-runtime tests run with containers disabled (the vitest plugin forces `enableContainers: false`), so `ctx.container` is undefined there.

- [ ] **Step 1: Stub, then write the helpers.** First add typed stubs for every new module: the upload handler answers 501, `uploadStatus` returns null, `parseSource` returns `{ kind: 'skip' }`, `recordPreview` returns `{ recorded: false }`, `uploadsDueAt` returns null, and `handleParseBatch` acknowledges every message. Then write `test/workers/support/files.ts`:
  - `upload(client, user, body, opts?: { type?: string; name?: string; key?: string })`: POST `/v1/imports` through `UserClient.request`, with `content-type` default `text/csv`, `x-gogospend-file-name` `encodeURIComponent(name ?? 'statement.csv')`, `idempotency-key` and `content-length`.
  - `parseBatch(user, jobId, attempts = 1)`: one message through `createMessageBatch('jotbun-statement-parse', …)`.
  - `fakeParser(replies)`, and `parsedCsv(rows: ParsedRow[]): ParseServiceReply` (through `toPreviewRecord`). Image cases use 1B-T4's `TINY_JPEG`.
- [ ] **Step 2: Write the failing tests.**
  - `imports-intake.test.ts`: port every `it` in `apps/api/src/imports/upload-intake.integration.spec.ts` (32) by name and assertion, through `upload` or the vault methods, under 1A's not-applicable rule (cases about PostgreSQL roles, row-level security, pools or lock waits get one receipt line each). `upload-intake.spec.ts` (37) tests `UploadIntake` itself, which is reused unchanged; it keeps running in the API. Use `startV1(…, { env: { IMPORT_UPLOADS_ENABLED: 'true' }, startWork: 'manual' })`. Add:
    - `an upload streams into 1 MiB quarantine parts under the vault's prefix, each published for 24 hours`: a 2.5 MiB CSV (`csvRows` from `@api/imports/fixtures/synthetic-parse`) is 202. R2 under `import_quarantine/<vaultId>/<jobId>/` holds three parts whose sizes add up to the body, and their `vault_objects` rows are `published` with `delete_after` at the acceptance time plus 86,400,000.
    - `uploads are 404 before authentication while IMPORT_UPLOADS_ENABLED is off`.
    - `an accepted upload's parse message carries only the vault and job ids, and is sent once`: `startPendingWork` with `{ ...env, PARSE_QUEUE: capture }` sends exactly `[{ vault: vaultId, job: jobId }]` and sets `enqueued_at`; a second run sends nothing.
    - `a queued import whose message stopped arriving is sent again an hour later, and one whose message keeps arriving is not` (ruling R32): the message is sent at `t`; at `t + 60 min` `startPendingWork` sends it again. For a second import, `parseSource` answers `held` at `t + 50 min`, and nothing is re-sent at `t + 60 min`.
    - `after pruneUploads at uploadsDueAt, the next uploadsDueAt is later or null`, over a receiving upload past its deadline, an accepted one past its raw expiry and a finished one 30 days old.
  - `imports-parse.test.ts`: call `handleParseBatch` with a fake parser, then read acks and retries with `getQueueResult(batch, createExecutionContext())`.
    - Port these cases of `apps/api/src/imports/import-preview.integration.spec.ts` by name and assertion (1B-T10 takes the other 21; the receipt lists both):
      - `parsing_has_no_financial_side_effect`
      - `a workbook with a formula is rejected as a whole: no candidate, image or transaction`
      - `a valid workbook parses through the same path`
      - the `it.each` of child outcomes (deadline, crash, invalid output, output over its cap, over the memory budget)
      - `a quarantined part that does not match its registered digest is never parsed`
      - `a part whose registered digest disagrees with the stored object is never parsed`
      - `a raw file past its 24-hour expiry is not read, even if its parse job is still queued`
      - `a parse job cancelled while its child runs (expiry, deletion, maintenance) records nothing`
      - `a lease lost after the image PUT publishes nothing; the sweep deletes the object` (the job stops being `parsing` after the image PUT; `recordPreview` answers `{ recorded: false }`, and the alarm deletes the reserved key at its deadline)
      - `publishes a metadata-free re-encoding for 24 hours and a review-only candidate`
      - `a worker started on a runtime without network permission leaves import_parse queued, without spending an attempt` (a `not_started` reply)
      - the `it.each` `%s fails the job retryably and records no preview` (`parser_sandbox_unsupported` and `parser_unavailable`, each spending its attempt)
      - `a child stopped past its memory budget gives a rejected preview, never a retry`
      - `an image whose own header disagrees with what the child said is never published`
      - `releases a claimed image job (no attempt spent, nothing read or recorded) and still parses a spreadsheet`
      - `parses the same job after the gate reopens, as its first attempt`
      - `does not park a raw file past its expiry: it still fails visibly`
      The child-outcome cases use a fake parser that answers what the parse server answers for that outcome (`previewFromOutcome`), because the Workers runtime has no container; the outcomes themselves are 1B-T1's server tests and the API's parser tests.
    - Add:
      - `a parsed CSV becomes a ready preview with its candidates, and the import reads parsed`.
      - `a parsed receipt image is stored under the vault's import_image prefix for 24 hours and gets an attachment id`: the fake parser returns `TINY_JPEG`. R2 has one object under `import_image/<vaultId>/<jobId>/`, its row is `published` with `delete_after` now plus 24 hours, and `import_previews.image_attachment_id` is a UUID.
      - `an image whose bytes are not the format it claims is a rejected preview, and nothing is stored`: PNG bytes labelled `jpeg` give status `rejected` with issues `['parse_failed']` and no object under `import_image/`.
      - `a parse that keeps failing is retried and fails after three attempts` (Review Focus 4): with replies `{ kind: 'retry', code: 'parser_unavailable' }`, the first two deliveries are retried with `delaySeconds: 30` and the import reads `queued`; the third is acknowledged and the import reads `failed`.
      - `a parse that has not started spends no attempt`: a `not_started` reply retries the message after 30 seconds and leaves `parse_attempts` at 0.
      - `a parse that finishes after the import expired records nothing` (Review Focus 1): move the vault clock past `expires_at` between `parseSource` and `recordPreview`. `recordPreview` answers `{ recorded: false }`, no preview row exists, and the image key is in `dueObjectKeys` once its grace has passed.
      - `while ocr is paused an image parse is held without spending an attempt, and a CSV still parses`: with KV gates `{ paused: ['ocr'], retry_after_seconds: 120 }`, the image message is retried with `delaySeconds: 120` and `parse_attempts` stays 0.
      - `while jobs or imports is paused every parse is held without spending an attempt` (ruling R31): with `{ paused: ['jobs'] }`, and again with `{ paused: ['imports'] }`, a CSV message is retried with the gates' delay and `parse_attempts` stays 0; once the gate opens, the next delivery parses as attempt 1.
      - `a missing quarantine part fails the import as quarantine_missing`.
      - `the Worker's queue handler sends a message through the container parser, which asks to retry while no container runs`: `await worker.queue(batch, env, ctx)` (the default export of `src/roles/vault.ts`) gives `retryMessages` with `delaySeconds: 30`, and the import has `parse_attempts` 1 and reads `queued`.
- [ ] **Step 3: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/imports-intake.test.ts test/workers/imports-parse.test.ts`. Expected: failures on status codes and stored state, none on a missing module. Record the counts.
- [ ] **Step 4: Implement the intake.**
  - The `import.upload` handler: an isolate holds at most 16 uploads at once (`MAX_UPLOADS_PER_ISOLATE`; more answer 503 `SERVICE_UNAVAILABLE` with `retry_after_seconds` 5); an image content type needs the `ocr` gate open. Then `new UploadIntake(vaultIntakeRepository(w.vault), new R2ObjectStore(env.OBJECTS)).accept(sessionContextOf(w.claims), w.stream ?? emptyBody(), { idempotencyKey, fileName, contentType, declaredBytes })` answers 202. `fileNameFrom` and `contentLength` port the two helpers of the same name in `src/server/app/routes.ts`.
  - The intake functions port the 0014 routines with 1A's porting rules; every quota, limit and outcome code is the API's.
- [ ] **Step 5: Implement the pipeline.**
  - `handleParseBatch`, per message, reads the gates (`deps.gates ?? ((env) => readGates(env.CONFIG))`). `held` is every format while `jobs` or `imports` is paused, and the image formats while `ocr` is paused (C12; in the API every worker claim needs `jobs` open). Then:
    1. `parseSource(job, held)`: `held` retries the message with `delaySeconds = gates.retryAfterSeconds`; `skip` acknowledges it.
    2. Read the parts with `R2ObjectStore.get` and check each part's and the whole file's size and SHA-256 (a port of `ParseHandler.readQuarantine`). A missing part fails the import `quarantine_missing`, a wrong one `quarantine_corrupt`, and both acknowledge; a store error retries.
    3. `parser.parse({ format, today, bytes })`. A `not_started` reply calls `retryParse(job, false)` and retries the message after 30 seconds. A `parser_unavailable` or `parser_sandbox_unsupported` reply on the third attempt fails the import with that code and acknowledges; earlier, it calls `retryParse(job, true)` and retries after 30 seconds.
    4. A `parsed` reply with an image is checked again: present exactly for image formats, `magicFormat` equal to the format, `sanitizedImageHeader` equal to the claimed size, at most 12 MiB. Otherwise the record becomes the rejected preview `{ status: 'rejected', layout: null, issues: ['parse_failed'], image: null }` with no candidates.
    5. Store the image under `reserveImageKey` (null acknowledges), with `R2ObjectStore.putStream` and its content type; then `recordPreview`; acknowledge.
    6. Anything thrown: best-effort `retryParse(job, true)`, retry the message after 30 seconds, and log `parse_consumer_failed` with `failureName`.
  - `StatementParser.parse` runs one parse at a time (a promise chain). Without `ctx.container` it answers `{ kind: 'retry', code: 'parser_unavailable' }`. Otherwise:
    - It starts the container if it is not running, with `{ entrypoint: PARSER_ENTRYPOINT, env: { NODE_ENV: 'production', TZ: 'UTC', PARSE_SERVER_PORT: '8080' }, enableInternet: false }`.
    - It waits for any HTTP answer from `GET http://parser/health` on `getTcpPort(8080)` (every 200 ms, up to 60 s; a 503 is an answer, and the parse reply then says `not_started`), and calls `setInactivityTimeout(300_000)`.
    - It posts the bytes to `http://parser/parse` with `x-jotbun-format` and `x-jotbun-today` under `AbortSignal.timeout(120_000)`.
    - A failed start, no answer, a non-200, bad JSON or a timeout answers `{ kind: 'retry', code: 'parser_unavailable' }`. (Container API: `start`, `getTcpPort(port).fetch`, `setInactivityTimeout`, from the Cloudflare Containers docs.)
- [ ] **Step 6: Run them and see them pass.**
- [ ] **Step 7: Mutation check.**
  - Count attempts with `message.attempts` instead of the vault: the ocr-held case fails.
  - Hold only on `imports` and `ocr`: the jobs-paused case fails.
  - Spend an attempt on `not_started`: the not-started case fails.
  - Re-send only when `enqueued_at` is null: the stopped-arriving case fails.
  - Skip the consumer's image check: the mislabelled-image case fails.
  - Publish quarantine parts with no expiry: the 24-hour part case fails.
- [ ] **Step 8: Optional Docker proof.** If `docker info` succeeds, run the built vault Worker in `wrangler dev` from a scratch copy of its config with `dev.enable_containers` true, upload the CSV from `jobs.db.test.ts`'s parser case, and see `GET /v1/imports/:id` read `parsed`. Otherwise record SKIPPED.
- [ ] **Step 9: Gate, receipt, commit.** Commit: `git commit -m "Take statement uploads into R2 quarantine and parse them through a queue and the stateless parser"`.

---

### Task 1B-T6: Exports on ExportWorkflow

**Starts after:** 1A-T5, 1A-T8b, 1B-T4

**Files:**
- Create: `apps/edge/src/vault/files/exports.ts`, `src/background/export-workflow.ts`
- Modify: `src/v1/protocol.ts`, `src/v1/routes.ts`, `src/v1/worker-routes.ts`, `src/v1/files/downloads.ts` (`serveExportFile`), `src/vault/routes.ts`, `src/vault/commands/registry.ts`, `src/vault/retention.ts` (if 1A-T8b did not, export the port of `gogospend_purge_entities` taking a `FileContext`: plain SQL, no registry), `src/vault/user-vault.ts` (`VaultEnv` gains `EXPORT_WORKFLOW`), `src/vault/files/work.ts` (the export starter), `src/roles/vault.ts` (export `ExportWorkflow`), `wrangler.vault.jsonc` (the Workflow and `limits.cpu_ms`), `src/cloudflare-workers.d.ts` (`WorkflowEntrypoint`, `WorkflowEvent`, `WorkflowStep` in `cloudflare:workers`)
- Test: `test/workers/exports.test.ts`

**Interfaces:**
- Consumes: `runCommand` and `commandInput` with the If-Match rule `'forbidden'` (1A-T3); the transactions table and names (1A-T4, 1A-T5); 1A-T8b's purge routine; `assertFreshSignIn` (1B-T3); the registry, `vaultGrants('export')`, `createOnce`, `BuildOutcome`, `vaultById`, `EXPORT_SLOTS`, `putConcatenated`, `START_RETRY_MS` (1B-T4); `CsvWriter`, `CsvTooLarge` (`@api/exports/csv-writer`); `exportRowCells` (`@api/exports/export-handler`); `parseExportFilter`, `EXPORT_REQUEST_KIND` (`@api/exports/export.service`); `DownloadSlots`, `verifiedChunks`, `bodyStream`, `fileResponse` (`src/server/http/files.ts`).
- Produces:
  - Routes: `POST /v1/exports` (`recent_proof`, `vault: 'exports.request'`, gates `['jobs']`, status 202, `starts: true`), `GET /v1/exports/:id` (`bound_session`, `vault: 'exports.status'`), `GET /v1/exports/:id/grant` (`bound_session`, `vault: 'exports.grant'`), `GET /v1/export-files/:grant` (`bound_session`, `worker: 'export.file.download'`).
  - The step-only id `'exports.file'` goes into `VAULT_STEP_ROUTES` (ruling R27); `WorkerRouteId` gains `'export.file.download'`.
  - The registry gains the `export` entity (`validate: isExportRequestSnapshot`) and `export.request` (entity `export`, outcome `accepted`, `schemaVersions: [1]`, policy `exempt`), right after the budget entries and before any attachment entries, as `buildContainer` constructs `ExportService` after `BudgetService` and before `AttachmentService`.
  - `VAULT_EXPORT_MAX_BYTES = 32 * 1024 * 1024` (B21).
  - In `exports.ts`: `requestExport(c: VaultContext, call: VaultCall): CommandAck`, `exportStatus(c, id): ExportDto | null`, `exportGrant(c, id): ExportGrant | null`, `exportFile(c, grant): { key: string; bytes: number; sha256: string; fileName: string } | null`, `failExport(c: FileContext, id): void`, `pruneExports(c: FileContext): void`, `exportsDueAt(c: FileContext): number | null`, and
    ```ts
    export function writeExport(c: FileContext, deps: { bucket: VaultBucket; active(c: FileContext): boolean }, id: string, options?: { maxBytes?: number }): Promise<BuildOutcome & { peakHeldBytes?: number }>
    ```
  - `UserVault#writeExport(id: string): Promise<BuildOutcome>` and `UserVault#failExport(id: string): void`.
  ```ts
  // src/background/export-workflow.ts
  export type ExportParams = { vault: string; export: string }
  export const EXPORT_STEP = { retries: { limit: 2, delay: '10 seconds', backoff: 'exponential' }, timeout: '15 minutes' } as const
  export class ExportWorkflow extends WorkflowEntrypoint<V1Env, ExportParams> { run(event: WorkflowEvent<ExportParams>, step: WorkflowStep): Promise<BuildOutcome> }
  ```
  `EXPORT_STEP` gives three attempts and 900 seconds each, the API's `EXPORT_MAX_ATTEMPTS` and `EXPORT_MAX_RUNTIME_SECONDS`.
  - `wrangler.vault.jsonc`:
    - `"workflows": [{ "name": "jotbun-export", "binding": "EXPORT_WORKFLOW", "class_name": "ExportWorkflow", "default_retention": { "success_retention": "1 day", "error_retention": "7 days" } }]` (the installed wrangler schema has `default_retention`).
    - `"limits": { "cpu_ms": 120000 }` (ruling R30). The largest invocations are the ten-times export and snapshot build of 1B-T8, expected to take a few seconds of CPU; 1B-T8 measures them and the receipt records the numbers. 120 seconds leaves wide room and still bounds runaway work, below the 300,000 the old jobs Worker set. 1B-T13 carries it into `wrangler.jsonc`.
  - `downloads.ts` gains `serveExportFile(w: WorkerContext): Promise<Response | VaultReply>`.
  - The export starter: unstarted = `pending` rows without `started_at`; `start` is `createOnce(env.EXPORT_WORKFLOW, id, { vault: vaultId, export: id })` (`unbound` without the binding); `markStarted` sets `started_at`; `dueAt` is the oldest unstarted row's `created_at` plus `START_RETRY_MS`.

- [ ] **Step 1: Stub, then write the failing tests** in `exports.test.ts`. First add typed stubs (`requestExport` acknowledges without writing a row, `writeExport` resolves `{ outcome: 'skipped' }`, `exportStatus` returns null, `pruneExports` does nothing, `exportsDueAt` returns null). Tokens carry `authTime: now` unless a case says otherwise. Compute an export's id first with `derivedUuid(user.sub, 'export-request', key)` and open `introspectWorkflowInstance(env.EXPORT_WORKFLOW, id)` before the request.
  - Port every `it` in `apps/api/src/exports/export.integration.spec.ts` (22) under the not-applicable rule, with these adaptations: a fresh export proof becomes a token whose `auth_time` is at most 300 seconds old; `401 REAUTH_REQUIRED` stays the refusal; the job becomes the `exports` row and its Workflow; "the sweep deletes it" becomes the registry's due time, run with `deleteDueObjects`. Pass `options.maxBytes` where the API case passes a byte limit.
  - Port `writes a requested export, streamed back with its length, and never serves a tampered file` from `test/jobs.db.test.ts` (the UTF-8 byte-order mark, `ข้าวมันไก่`, `60.00`, and 404 after the stored object is swapped).
  - Add:
    - `an export needs a sign-in from the last five minutes, and a resent export still replays`: `authTime: now - 301` is 401 `REAUTH_REQUIRED`; a fresh one is 202; the same key and body again with `authTime: now - 400` is 202 with the same body.
    - `an export runs on ExportWorkflow and is ready to download`: the instance reaches `complete`; the status is `ready` with `row_count` 1; the grant downloads 200 with `content-type: text/csv; charset=utf-8`.
    - `a text cell that starts like a formula is written as text`: a record whose merchant is `=SUM(A1)` exports that cell as `'=SUM(A1)` (`csvText`, §4).
    - `an export that finishes after the vault stopped being active publishes nothing` (Review Focus 1): `writeExport` with a bucket whose `put` sets `account_state.status` to `deleting` before storing answers `skipped`; the export stays `pending`, and its key is `reserved` and due when its grace has passed.
    - `a write retried after its file was stored but before it was recorded completes`: the first `writeExport` uses a bucket that throws after its `put`; the second succeeds. The first key stays `reserved` and is deleted by `deleteDueObjects` after its grace, while the published file stays.
    - `an export is stored with one put of one buffer, and nothing is left behind`: with a recording bucket, `writeExport` makes exactly one `put`, whose body is one `Uint8Array` of the stored size, and `peakHeldBytes` is at most twice that size.
    - `pruneExports purges an export 30 days after its request and fails one left pending for a day` (ruling R33): at `created_at + 24 h` a `pending` row becomes `failed` (`error`); at `created_at + 30 days` the row is gone and its entity's head reads `purged`.
    - `pruneExports purges more exports at once than SQLite has parameters` (ruling R57): 101 exports, seeded as rows with their heads and requested 31 days ago, are all deleted in one run, and every head reads `purged`.
    - `after pruneExports at exportsDueAt, the next exportsDueAt is later or null`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/exports.test.ts`. Expected: failures on status codes, rows and stored objects. Record the counts.
- [ ] **Step 3: Implement the request side.**
  - `requestExport` ports the controller and `ExportService.request`: `assertKnownFields(body, ['proof_id', 'from', 'through'])`; `proof_id` must be a UUID (422 `VALIDATION_FAILED` on `proof_id`) and is otherwise unused (B8); `parseExportFilter`; the id is `derivedUuid(accountId, 'export-request', commandId)`; the command is `commandInput(call, EXPORT_REQUEST_KIND, { id, from, through }, 'forbidden')`, the payload `ExportService.request` passes.
  - Inside `runCommand`'s mutation, in this order: at least `EXPORT_MAX_OPEN` (2) pending exports is 429 `RATE_LIMITED` with `retryAfterSeconds: 60`; `assertFreshSignIn(c.claims, Math.floor(c.now.getTime() / 1000))` (B7); insert the `pending` row; the change is `{ entity: 'export', id, version: 1, state: 'active', snapshot: { id, from, through } }`.
  - `exportStatus` ports `ExportService.statusIn`: `pending`; `failed` with `reason` `too_large` or `error`; `ready` while `expires_at` is ahead, with `as_of_revision`, `row_count`, `bytes`, `sha256` and `expires_at`; `expired` after.
  - `exportGrant` and `exportFile` port `grant` and `file` (five minutes, never past the file's expiry, index 0, `exportFileName({ from, through })`).
- [ ] **Step 4: Implement the background side.**
  - `writeExport` ports `ExportHandler.run`. A row that is not `pending`, or an inactive vault, answers `skipped`.
    - In one synchronous pass, `sync_state.revision` is the high water, and the SQLite port of `gogospend_leased_export_rows` (live transactions in the period, ordered by `occurred_on, id`, with wallet and category names) feeds `new CsvWriter(EXPORT_CSV_COLUMNS, { maxBytes: options.maxBytes ?? VAULT_EXPORT_MAX_BYTES })` row by row through `exportRowCells`, iterating the cursor. `CsvTooLarge` marks the row `failed` (`too_large`).
    - Then the key `vaultObjectKey('export', c.vaultId, id, crypto.randomUUID(), 'export.csv')` is reserved, and the body from `finish()` is stored with `putConcatenated(bucket, key, body.parts, body.bytes, 'text/csv; charset=utf-8')`, so the vault holds the parts and one copy at most (ruling R30). `peakHeldBytes` counts the parts plus that copy. `finish()` returns a copy of the writer's parts array (`csv-writer.ts:118`), so the writer lives only inside a helper that returns `finish()`; once it returns, `body.parts` holds the only references, and emptying it in `putConcatenated` lets the parts go.
    - In one block, only if the row is still `pending` and the vault active, the row becomes `ready` (`expires_at` now plus 24 hours) and the key is published with that expiry. Otherwise the answer is `skipped`.
  - `ExportWorkflow.run`: `step.do('write the export file', EXPORT_STEP, () => vaultById(this.env, p.vault).writeExport(p.export))`. When that throws after its retries, `step.do('record the failure', () => vaultById(this.env, p.vault).failExport(p.export))`, and the result is `{ outcome: 'failed' }`.
  - `pruneExports`: a `pending` row older than 24 hours becomes `failed` (`error`); a row requested more than 30 days ago is deleted and its entity purged with 1A-T8b's purge routine, the ids bound as one JSON parameter (ruling R57). `exportsDueAt` is the earliest of those two deadlines over the rows that remain.
  - `serveExportFile` ports the edge's `GET /v1/export-files/:grant` handler: the `exports.file` step, then `EXPORT_SLOTS.take()`, `getStream`, the size and digest checks, `verifiedChunks` and `fileResponse` with `content-disposition`.
- [ ] **Step 5: Run them and see them pass.**
- [ ] **Step 6: Mutation check.**
  - Remove `assertFreshSignIn`: the five-minute case fails.
  - Check freshness before the receipt lookup: the replay half of that case fails.
  - Write under a fixed key without the attempt token: the retried-write case fails on `exists`.
  - Publish without rechecking the vault: the Review Focus case fails.
  - Drop the 30-day purge from `pruneExports`: the prune case fails.
  - Bind one `?` per export id in `pruneExports`: the 101-export case fails (too many SQL variables).
- [ ] **Step 7: Gate, receipt, commit.** Commit: `git commit -m "Run exports on ExportWorkflow, written by the vault into R2 behind five-minute grants"`.

---

### Task 1B-T7: The AI routes on vault reads

**Starts after:** 1A-T7, 1B-T3

**Owner answer 3:** the `ai` gate arrives in phase 3 (25 October 2026); this task adds no gate.

**Files:**
- Create: `apps/edge/src/vault/ai.ts`, `src/v1/ai/service.ts`, `src/v1/ai/routes.ts`
- Modify: `src/v1/protocol.ts`, `src/v1/routes.ts` (six Worker routes, six step ids), `src/v1/worker-routes.ts`, `src/v1/handler.ts` (`deps.send?: SendMessage | null`), `src/v1/env.ts` (`AI_ENABLED`, `AI_MODEL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`), `src/vault/routes.ts`, `wrangler.vault.jsonc` (var `"AI_ENABLED": "false"`), `test/workers/support/v1-client.ts` (`startV1` option `send`)
- Test: `test/workers/ai.test.ts`

**Interfaces:**
- Consumes: the wallet and category lists (1A-T3, 1A-T4) and `summary` (1A-T7); `vaultSession`, `WORKER_HANDLERS`, `VAULT_STEP_ROUTES` (1B-T3); from `src/server/ai`: `draftFromRules`, `sanitizeDrafts` (`drafts.ts`), `factsText`, `figuresText` and the label helpers (`fact-text.ts`), `AllowedNumbers`, `formatBaht`, `isGrounded` (`grounding.ts`), `ModelUnavailable`, `finishedJson`, `finishedText`, `requestBase`, `anthropicSender`, `DEFAULT_AI_MODEL`, `SendMessage` (`model.ts`), the prompts and schemas (`prompts.ts`), `ASK_TOOLS` and `ToolInputError` (`tools.ts`, imported for those two names only).
- Produces:
  - Routes (from `VAULT_DEFERRED_ROUTES`), all Worker routes with their old access, gates and status: `GET /v1/me/ai-preferences` and `PUT /v1/me/ai-preferences` (`bound_session`), `POST /v1/ai/parse` (`current_policy`, 200), `POST /v1/ai/slip` (`current_policy`, 200), `GET /v1/ai/note` (`bound_session`), `POST /v1/ai/ask` (`current_policy`, 200). `WorkerRouteId` gains `'ai.preferences.get' | 'ai.preferences.put' | 'ai.parse' | 'ai.slip' | 'ai.note' | 'ai.ask'`.
  - The step-only ids `'ai.preferences' | 'ai.setPreferences' | 'ai.context' | 'ai.consume' | 'ai.facts' | 'ai.tool'` go into `VAULT_STEP_ROUTES`, handled by these functions of `src/vault/ai.ts`:
    ```ts
    export function aiPreferences(c: VaultContext): Omit<AiPreferencesDto, 'available'>
    export function setAiPreferences(c: VaultContext, update: AiPreferencesUpdate): Omit<AiPreferencesDto, 'available'>
    export function aiContext(c: VaultContext): { consent: boolean; wallets: WalletDto[]; categories: CategoryDto[] }
    export function consumeAi(c: VaultContext, feature: AiFeature): void
    export function aiDayFacts(c: VaultContext, date: string): BunFact[]
    export type Allowance = { satang: string[]; counts: number[]; dates: string[] }
    export function aiTool(c: VaultContext, name: string, input: Record<string, unknown>, locale: AiLocale): { result: unknown; figures: AiFigure[]; allow: Allowance } | { error: string }
    ```
  - `class VaultAiService { constructor(deps: { send: SendMessage | null; model: string; now?: () => Date }); preferences(s: VaultSession); setPreferences(s: VaultSession, update: AiPreferencesUpdate); parse(s, request: AiParseRequest); slip(s, request: AiSlipRequest); note(s, date: string, locale: AiLocale); ask(s, request: AiAskRequest) }`. `send` comes from `deps.send` when given, else from the env as the edge's container does (`flag(AI_ENABLED) && ANTHROPIC_API_KEY ? anthropicSender(key, ANTHROPIC_BASE_URL) : null`).
  - No gate is added (owner answer 3): `GATE_SCOPES` and `readEdgeConfig` are unchanged, and the AI routes keep today's `AI_ENABLED` switch (B10).

- [ ] **Step 1: Stub, then write the failing tests** in `ai.test.ts`. First add typed stubs: the six Worker handlers answer 501, and the vault functions return empty values (`aiDayFacts` returns `[]`, `aiTool` returns `{ error: 'stub' }`). Port every `it` in `apps/edge/test/ai.db.test.ts` (17) by name and assertion, with `fakeModel` from `test/support/fake-model.ts` passed as `startV1`'s `send`. `preferences are the account’s own (RLS)` becomes `preferences are the person's own`: a second person's vault never shows them. Add:
  - `a slip read stores nothing: no object, no upload and no row but today's use`: after `POST /v1/ai/slip` with a scripted reply, R2 has nothing under any of the vault's prefixes, `import_uploads` is empty, and `ai_usage` holds exactly `{ feature: 'slip', uses: 1 }`.
  - `a tool's allowance reaches the grounding check`: an Ask Bun answer quoting the `spending_total` figure is returned with `source: 'ai'`, and one quoting a number no tool read becomes the plain figures (`source: 'facts'`).
  (One charge per request, however many steps, is proven in 1B-T3 through `vaultSession`; the AI routes use it unchanged.)
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/ai.test.ts`. Record the counts.
- [ ] **Step 3: Implement.** `VaultAiService` keeps `AiService`'s order and refusals exactly. Every step call carries the route's access, so a `current_policy` route is checked before any model call; `ai.consume` runs before the model, so a failing call still costs a use. `aiDayFacts` ports `dayFacts` and `aiTool` ports `runTool` onto vault SQL (sums as `CAST(... AS TEXT)`), recording every `addSatang`, `addCount` and `addDate` call in `allow`; the service replays `allow` into its own `AllowedNumbers`. A `ToolInputError` comes back as `{ error }` and is sent to the model as an `is_error` tool result. `available` is added by the service.
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.**
  - Consume after the model call: the ported daily-limit case fails.
  - Drop `allow` from the tool reply: the allowance case fails.
- [ ] **Step 6: Gate, receipt, commit.** Commit: `git commit -m "Serve the AI routes from vault reads, with consent and daily uses in the vault"`.

---

### Task 1B-T8: Resync snapshots on SnapshotWorkflow, and the ten-times memory proof

**Starts after:** 1A-T8a, 1A-T8b, 1B-T6

**Owner answer 4:** a vault whose SQLite file is at least 50,000,000 bytes (25 October 2026).

**Files:**
- Create: `apps/edge/src/vault/files/snapshots.ts`, `src/background/snapshot-workflow.ts`
- Modify: `src/v1/protocol.ts`, `src/v1/routes.ts`, `src/v1/worker-routes.ts`, `src/v1/files/downloads.ts` (`serveSnapshotChunk`), `src/vault/routes.ts`, `src/vault/user-vault.ts` (`VaultEnv` gains `SNAPSHOT_WORKFLOW`), `src/vault/files/work.ts` (the snapshot starter), `src/roles/vault.ts` (export `SnapshotWorkflow`), `wrangler.vault.jsonc`, `test/workers/support/files.ts` (`seedLedger`)
- Test: `test/workers/snapshots.test.ts`

**Interfaces:**
- Consumes: the change log, `entity_heads`, `sync_state` and `syncChanges` (1A-T3, 1A-T8a); the purge routine and alarm (1A-T8b); the registry, `vaultGrants('snapshot')`, `createOnce`, `BuildOutcome`, `vaultById`, `putConcatenated`, `START_RETRY_MS` (1B-T4); `writeExport` and `VAULT_EXPORT_MAX_BYTES` (1B-T6, for the export half of the proof); `encodeSyncCursor` (`@api/sync/sync-cursor`); `isEntityChange`, `SYNC_ENTITY_VALIDATORS`, `SNAPSHOT_SCHEMA_VERSION`, `SNAPSHOT_TTL_HOURS` (contracts); `MAX_SNAPSHOT_BYTES` (`@api/sync/snapshot-builder`).
- Produces:
  - Routes: `POST /v1/sync/snapshots` (`bound_session`, `vault: 'snapshots.request'`, gates `['jobs']`, route status 201 as the old route's default, `starts: true`; the vault reply sets 200 or 202), `GET /v1/sync/snapshots/:id` (`bound_session`, `vault: 'snapshots.status'`), `GET /v1/sync/snapshot-chunks/:grant` (`bound_session`, `worker: 'snapshot.chunk.download'`).
  - The step-only id `'snapshots.chunk'` goes into `VAULT_STEP_ROUTES` (ruling R27); `WorkerRouteId` gains `'snapshot.chunk.download'`.
  - In `snapshots.ts`:
    ```ts
    export const SNAPSHOT_CHUNK_BYTES = 1024 * 1024
    export function requestSnapshot(c: VaultContext, call: VaultCall): VaultReply
    export function snapshotStatus(c: VaultContext, id: string): SnapshotDto | null
    export function snapshotChunk(c: VaultContext, grant: string): { key: string; bytes: number; sha256: string } | null
    export function purgeWatermark(c: FileContext): number   // max(revision) of purged changes, else 0
    export function buildSnapshot(c: FileContext, deps: { bucket: VaultBucket; active(c: FileContext): boolean }, id: string, options?: { chunkBytes?: number; maxBytes?: number }): Promise<BuildOutcome & { peakHeldBytes?: number }>
    export function failSnapshot(c: FileContext, id: string): void
    export function pruneSnapshots(c: FileContext): void
    export function snapshotsDueAt(c: FileContext): number | null
    ```
  - `UserVault#buildSnapshot(id: string)` and `UserVault#failSnapshot(id: string)`.
  ```ts
  // src/background/snapshot-workflow.ts
  export type SnapshotParams = { vault: string; snapshot: string }
  export const SNAPSHOT_STEP = { retries: { limit: 2, delay: '10 seconds', backoff: 'exponential' }, timeout: '10 minutes' } as const
  export class SnapshotWorkflow extends WorkflowEntrypoint<V1Env, SnapshotParams> { run(event: WorkflowEvent<SnapshotParams>, step: WorkflowStep): Promise<BuildOutcome> }
  ```
  `SNAPSHOT_STEP` gives three attempts and 600 seconds each, the API's snapshot job (`max_attempts` 3, `max_runtime_seconds` 600).
  - `wrangler.vault.jsonc`: `{ "name": "jotbun-snapshot", "binding": "SNAPSHOT_WORKFLOW", "class_name": "SnapshotWorkflow", "default_retention": { "success_retention": "1 day", "error_retention": "7 days" } }` in `workflows`.
  - `downloads.ts` gains `serveSnapshotChunk(w: WorkerContext): Promise<Response | VaultReply>`.
  - The snapshot starter mirrors the export starter (`SNAPSHOT_WORKFLOW`, params `{ vault, snapshot }`, `dueAt` from the oldest unstarted `pending` row).
  - `seedLedger(user, targetBytes: number): Promise<{ records: number }>` in `test/workers/support/files.ts` (below).

- [ ] **Step 1: Stub, then write the failing tests** in `snapshots.test.ts`. First add typed stubs (`requestSnapshot` answers 202 with a `pending` DTO and writes nothing, `buildSnapshot` resolves `{ outcome: 'skipped' }`, `snapshotStatus` returns null, `snapshotsDueAt` returns null). Open `introspectWorkflowInstance(env.SNAPSHOT_WORKFLOW, derivedUuid(user.sub, 'snapshot-request', key))` before a request that should build.
  - Port every `it` in `apps/api/src/sync/snapshot-builder.integration.spec.ts` (14) under the not-applicable rule, with these adaptations: a lease becomes the `snapshots` row and its Workflow; `closes the read transaction before uploading chunks` becomes `reads every row before the first R2 call`, asserted with a bucket that records when its first `put` happens; `the worker runs snapshot jobs through the registered handler` becomes `SnapshotWorkflow runs the build`.
  - Port from `apps/api/src/privacy/retention.integration.spec.ts`:
    - the snapshot half of `tombstones reach delta readers, older cursors resync, and snapshots built before the purge are dropped`: after 1A-T8b's purge alarm, a snapshot built before the purge reads `expired`, and its chunk keys are due once `pruneSnapshots` ran;
    - `a snapshot read before a purge is never recorded afterwards, so it cannot serve the purged data`: a purge between the read and the record makes `buildSnapshot` answer `skipped`; a new build is recorded.
  - Port `builds a requested snapshot, whose chunks the edge then serves` from `test/jobs.db.test.ts`.
  - Add:
    - `a snapshot runs on SnapshotWorkflow, and its cursor continues with /v1/sync/changes`: the instance reaches `complete`; `GET /v1/sync/changes?cursor=<status.cursor>` is 200 with no groups; after one more wallet, the next page holds exactly that wallet's group.
    - `a snapshot that became ready in the last hour is reused, judged by ready_at`: a snapshot created 2 hours ago that became ready 30 minutes ago answers a new request with its own id (200); one that became ready 61 minutes ago does not.
    - `a build retried after its chunks were stored completes, and the first attempt's chunks are deleted at their deadline` (Review Focus 2): the first `buildSnapshot` uses a bucket that throws after its last `put`; the second answers `ready`. The first attempt's keys are `reserved`, due after `RESERVATION_GRACE_MS`, and gone from R2 after `deleteDueObjects`, while the published chunks stay.
    - `a build that finishes after the vault stopped being active publishes nothing` (Review Focus 1): with a bucket whose `put` sets `account_state.status` to `deleting`, the answer is `skipped` and no `snapshot_chunks` row exists.
    - `a build cut into more chunks than SQLite has parameters records them all` (ruling R57): 150 records with `chunkBytes: 256` give a `ready` snapshot with 150 or more chunk rows, all published.
    - `a chunk is served with its exact bytes and digest, and a tampered chunk is 404`.
    - `after pruneSnapshots at snapshotsDueAt, the next snapshotsDueAt is later or null`.
    - `ten times the yearly ledger builds and exports inside the memory budget` (B14, rulings R30 and R38; test timeout 300 s):
      - Seed with `seedLedger(user, 50_000_000)`: one wallet and one category, then transactions with their heads and change rows (a valid `isTransactionSnapshot` DTO with a Thai note and merchant), 1,000 per `transactionSync`, bumping `sync_state.revision` per record as the triggers require, until `ctx.storage.sql.databaseSize >= 50_000_000`.
      - Build inside `runInDurableObject`, calling `buildSnapshot` with a context whose `sql` wraps the real one: cursors of the entity read (the statement that reads `entity_heads`) throw on `toArray()` and count the rows they yield.
      - The build answers `ready`, and the entity read yielded `SELECT count(*) FROM entity_heads` rows.
      - Reading every chunk back from R2 gives exactly that many entities, each id once, and every chunk is at most `SNAPSHOT_CHUNK_BYTES` plus the longest entity line.
      - `peakHeldBytes <= storedBytes + SNAPSHOT_CHUNK_BYTES + longestLine`, where `storedBytes` is the total size of the chunks read back.
      - `writeExport` over the whole period answers `ready`, with one `put` of one buffer, a CSV under `VAULT_EXPORT_MAX_BYTES`, and `peakHeldBytes` at most twice the CSV.
      - The receipt records the database size, the record count, the stored bytes and the wall time of each build measured around its RPC (an upper bound on its CPU, for `limits.cpu_ms`).
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/snapshots.test.ts`. Expected: failures on statuses, rows and stored objects. Record the counts.
- [ ] **Step 3: Implement the request side.**
  - `requestSnapshot` ports the old route and `gogospend_request_snapshot`: `assertKnownFields(body ?? {}, [])`; the Idempotency-Key must be a UUID (422 `VALIDATION_FAILED` on `idempotency-key`); the id is `derivedUuid(accountId, 'snapshot-request', key)`.
  - A row with that id answers itself. Else a `ready` snapshot whose `ready_at` is within the last hour and that expires more than 23 hours from now is reused; else a `pending` one; else a new `pending` row. The reply is the status DTO with 200 when `ready`, else 202.
  - `snapshotStatus` ports `SnapshotRepository.status`. `ready` (unexpired, and `high_water >= purgeWatermark(c)`) carries `schema_version`, `high_water`, `cursor: encodeSyncCursor(c.claims.accountId, high_water)` (the default generation, as 1A-T8a's cursors), `expires_at` and chunk grants (five minutes, never past `expires_at`). A ready snapshot past its expiry or below the purge watermark is `expired`; `pending` and `failed` read as stored; no row is null.
- [ ] **Step 4: Implement the build.**
  - `buildSnapshot` ports `SnapshotBuilder.build`. A row that is not `pending`, or an inactive vault, answers `skipped`.
  - In one synchronous pass it iterates (never `toArray`) `SELECT h.entity, h.entity_id, h.version, h.state, c.snapshot FROM entity_heads h LEFT JOIN entity_changes c ON c.revision = h.revision AND c.entity = h.entity AND c.entity_id = h.entity_id ORDER BY h.entity, h.entity_id`, with `sync_state.revision` as the high water.
    - Each change is validated with `isEntityChange`; a head without its change row, unless purged, fails the build.
    - Each entity line is encoded to UTF-8 once, as it is read, and appended to the open chunk's parts, with the API's chunk header and separators as parts too. A chunk closes at `chunkBytes`. More than `maxBytes` in all marks the row `failed` and answers `too_large`.
    - The build holds only encoded parts, so `peakHeldBytes` is the stored total, plus the one chunk `putConcatenated` joins at upload.
  - Then it reserves every chunk key (`vaultObjectKey('sync_snapshot', c.vaultId, id, token, 'chunk-' + String(index).padStart(4, '0') + '.json')`, one token per attempt) and stores each chunk with `putConcatenated(bucket, key, chunk.parts, chunk.bytes, 'application/json')`, which empties that chunk's parts before its `put`.
  - In one block, only if the row is still `pending`, the vault active and `max(pruned_through, purgeWatermark(c)) <= high_water <= revision` (the API's `gogospend_record_snapshot` after 0015): it records the chunk rows and publishes their keys, one statement per chunk (ruling R57), and marks the row `ready` with `ready_at` now and `expires_at` now plus 24 hours. Otherwise `skipped`.
  - `SnapshotWorkflow.run` mirrors `ExportWorkflow.run` (`'build the snapshot'`, `SNAPSHOT_STEP`, then `'record the failure'` with `failSnapshot`).
  - `pruneSnapshots`: a `pending` row older than 24 hours becomes `failed`; a ready snapshot below the purge watermark releases its chunk keys (a subquery over `snapshot_chunks`, no id list) and is deleted; a ready snapshot a week past its expiry is deleted (chunks cascade; their objects already went at expiry). `snapshotsDueAt` is the earliest of those deadlines (now, for a snapshot below the watermark).
  - `serveSnapshotChunk` ports the edge's `GET /v1/sync/snapshot-chunks/:grant` handler: the `snapshots.chunk` step, `get`, the size and SHA-256 check, then `fileResponse` with `application/json`.
- [ ] **Step 5: Run them and see them pass.**
- [ ] **Step 6: Mutation check.**
  - Read the entity rows with `toArray()`: the ten-times case fails at the cursor spy.
  - Join each chunk into one string before encoding and keep the string: `peakHeldBytes` exceeds the bound and the ten-times case fails.
  - Compare `created_at` for reuse: the `ready_at` case fails.
  - Drop the purge watermark from the record check: the ported purge case fails.
  - Reuse one key set for every attempt: the retried-build case fails on `exists`.
- [ ] **Step 7: Named risk (SKIPPED).** The deployed isolate's 128 MB limit is not enforced in workerd, and `peakHeldBytes` is the build's own count of what it holds, so a copy the runtime makes inside `put` or `crypto.subtle.digest` is not seen. The proof bounds what the code keeps alive; the deployed check (a ten-times vault on Cloudflare, watching for an isolate reset) stays SKIPPED until a hosted environment exists, and the receipt says so.
- [ ] **Step 8: Gate, receipt, commit.** Commit: `git commit -m "Build resync snapshots on SnapshotWorkflow from one synchronous read, proven at ten times the yearly ledger"`.

---

### Task 1B-T9: Receipt attachments

**Starts after:** 1A-T7, 1A-T8b, 1B-T4

**Files:**
- Create: `apps/edge/src/vault/files/attachments.ts`, `src/v1/files/receipts.ts`
- Modify: `src/v1/protocol.ts`, `src/v1/routes.ts`, `src/v1/worker-routes.ts`, `src/v1/files/downloads.ts` (`serveReceiptFile`), `src/vault/routes.ts`, `src/vault/commands/registry.ts`, the vault's record reads (the SQLite port of the API's `RECORD_COLUMNS` in `src/vault/domain/transactions.ts`, and `src/vault/reads/history.ts` and `deleted-history.ts` if they keep their own column lists), `test/workers/support/files.ts` (`seedImportImage`)
- Test: `test/workers/attachments.test.ts`

**Interfaces:**
- Consumes: `runCommand`, `commandInput` with the If-Match rule `'required'`, and the synchronous `requireLiveEntity` and `expectVersion` (1A-T3); `transactionRow`, `getTransaction` (1A-T5); the history reads (1A-T7); the purge alarm (1A-T8b); `vaultSession` (1B-T3); the registry, `vaultGrants('attachment')`, `receiptGrantScope`, `reserveObject`, `publishObject`, `releaseObject`, `RECEIPT_SLOTS` (1B-T4); `commandHeaders` (`@api/commands/command-headers`, in the Worker routes); `ATTACHMENT_RETAIN_KIND`, `ATTACHMENT_REPLACE_KIND`, `ATTACHMENT_REMOVE_KIND` (`@api/attachments/attachments.service`); `DEFAULT_ATTACHMENT_LIMITS` (`@api/attachments/attachment-limits`); `ATTACHMENT_DOWNLOAD_PATH`, `ATTACHMENT_MESSAGE_KEYS`, `RECEIPT_RETENTION_CONSENT` (contracts); `R2ObjectStore.copy` and `head`.
- Produces:
  - Routes: `POST /v1/transactions/:id/attachment` (`current_policy`, `worker: 'attachment.retain'`, gates `['imports', 'writes']`, status 200), `PUT /v1/transactions/:id/attachment` (`current_policy`, `worker: 'attachment.replace'`, gates `['imports', 'writes']`, status 200), `DELETE /v1/transactions/:id/attachment` (`current_policy`, `vault: 'attachments.remove'`, gates `['writes']`, status 200), `GET /v1/attachments/:id/grant` (`bound_session`, `vault: 'attachments.grant'`), `GET /v1/attachment-files/:grant` (`bound_session`, `worker: 'attachment.file.download'`).
  - `VaultRouteId` gains the routes `'attachments.remove' | 'attachments.grant'` and the step-only ids `'attachments.prepare' | 'attachments.release' | 'attachments.retain' | 'attachments.replace' | 'attachments.file'`, which go into `VAULT_STEP_ROUTES`. `WorkerRouteId` gains `'attachment.retain' | 'attachment.replace' | 'attachment.file.download'`.
  - The registry gains the three attachment commands (entity `transaction`, outcome `updated`, `schemaVersions: [1]`, policy `current`), after the export entries (after the budget entries while 1B-T6 is not merged), as `buildContainer` constructs `AttachmentService` after `ExportService`.
  - In `attachments.ts`:
    ```ts
    export const RECEIPT_COPY_GRACE_MS = 180_000
    export type PreparedCopy = { kind: 'none' } | { kind: 'wait' } | { kind: 'copy'; source_key: string; key: string; content_type: AttachmentContentType; bytes: number; sha256: string }
    export function prepareReceipt(c: VaultContext, input: { attachment_id: string; command_id: string; record?: { id: string; expected_version: number | undefined; needs: 'none' | 'other' } }): PreparedCopy
    export function releaseReceiptCopy(c: VaultContext, key: string): void
    export function retainReceipt(c: VaultContext, call: VaultCall): CommandAck
    export function replaceReceipt(c: VaultContext, call: VaultCall): CommandAck
    export function removeReceipt(c: VaultContext, call: VaultCall): CommandAck
    export function receiptGrant(c: VaultContext, id: string): AttachmentGrant | null
    export function receiptFile(c: VaultContext, grant: string): { key: string; bytes: number; sha256: string; contentType: AttachmentContentType; fileName: string } | null
    export function pruneAttachments(c: FileContext): void
    export function attachmentsDueAt(c: FileContext): number | null
    ```
    `retainReceipt` and `replaceReceipt` read `call.body` as `{ attachment_id, consent, prepared: { key, bytes, sha256 } | null }`; only the Worker builds that body.
  - `pruneAttachments` stamps `released_at` from the vault clock on every released receipt that has none (the B20 trigger releases without a time), releases a retained receipt no record holds (the safety net) and makes its object due, and drops a released receipt's row 30 days after `released_at`. `attachmentsDueAt` is now while a receipt waits for its stamp or has lost its holders, else the earliest `released_at` plus 30 days.
  - In `receipts.ts`: `retainRoute(w)`, `replaceRoute(w)` and `COPY_SLOTS` (4 copies per isolate, the API's `copiesPerProcess`). `downloads.ts` gains `serveReceiptFile(w)`, using 1B-T4's `RECEIPT_SLOTS`.
  - Record DTOs carry `attachment_id` while the record holds a receipt, as the API's `toDto` does.
  - `seedImportImage(user, opts?: { expiresInMs?: number }): Promise<{ jobId: string; attachmentId: string; key: string }>` writes an accepted `import_uploads` row and a `ready` preview with `image_attachment_id`, stores `TINY_JPEG` at its `import_image` key and registers it `published` for 24 hours.

- [ ] **Step 1: Stub, then write the failing tests** in `attachments.test.ts`. First add typed stubs (the two Worker routes answer 501, `prepareReceipt` returns `{ kind: 'none' }`, `receiptGrant` returns null, `pruneAttachments` does nothing, `attachmentsDueAt` returns null). Port every `it` in `apps/api/src/attachments/attachments.integration.spec.ts` (45) by name and assertion under the not-applicable rule (the per-process cases use the isolate's slots), seeding images with `seedImportImage`. Add:
  - `a receipt grant is bound to the session that asked` (Review Focus 5): a grant issued to session A downloads 200 for A; the same grant from session B of the same person is 404 `NOT_FOUND`; after A signs out, A's download is 401 `SESSION_REQUIRED`.
  - `a retained receipt shows as attachment_id wherever the record is read`: after a retain, `GET /v1/transactions/:id`, `GET /v1/history` and the change snapshot in `GET /v1/sync/changes` carry it; after the record is deleted, `GET /v1/history/deleted` carries it.
  - `purging a deleted record releases its receipt, stamps the release from the vault clock, and deletes its object`: delete the record, move the vault clock 31 days, run the alarm (1A-T8b's purge), then `pruneAttachments` and `deleteDueObjects`. The attachment is `released` with `released_at` equal to the vault clock, and R2 no longer has the key. The test asserts R2's absence rather than `delete_after`, so it still holds once 1B-T11 runs those jobs inside the alarm.
  - `a copy that is never published is due three minutes after its reservation`.
  - `copying is bounded: four in flight and a hundred a day per vault, each answered with when to retry`: the fifth concurrent reservation and the 101st in 24 hours are 429 `RATE_LIMITED` with `retry_after_seconds` at least 1.
  - `after pruneAttachments at attachmentsDueAt, the next attachmentsDueAt is later or null`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/attachments.test.ts`. Record the counts.
- [ ] **Step 3: Implement the vault side.**
  - `prepareReceipt` ports `AttachmentService.needsCopy` and `gogospend_reserve_receipt_copy`:
    - `none` for a resent command, an existing receipt, or a record the command would refuse.
    - The source is the `ready` preview whose `image_attachment_id` is the id, with its image `published` and more than 2 minutes before `delete_after`.
    - `wait` while a copy for the same id is reserved and unexpired.
    - 429 `RATE_LIMITED` at 4 receipt copies in flight or 100 reserved in the last 24 hours, with the seconds until the oldest leaves (SQL aggregates, no id lists).
    - Otherwise reserve `vaultObjectKey('receipt', c.vaultId, attachmentId, crypto.randomUUID(), 'image.' + ext)` for `RECEIPT_COPY_GRACE_MS` and answer `copy`.
  - The three commands port `AttachmentService.retain`, `replace` and `remove` on `transaction_attachments`, each read through `commandInput(call, kind, payload, 'required')`: the record's 404, 410 `ENTITY_PURGED`, 409 `ENTITY_DELETED` and version rules; the consent and attachment checks; audit metadata `{ consent }` and `{ previous: 'released' | 'shared' }`. Their `ready` step ports `gogospend_retain_attachment`:
    - an existing `retained` receipt is ready (and a copy made for nothing is released);
    - `released` is 422 with `ATTACHMENT_MESSAGE_KEYS.removed`;
    - a copy whose bytes and SHA-256 equal the import image's registered ones becomes a `retained` attachment (size from the preview), and its key is published with no expiry;
    - anything else is 422 `expired`, or 404 when the preview is not this vault's.
  - `receiptGrant` and `receiptFile` port `grant`, `file` and `held`, with `receiptGrantScope(c.claims)` as the MAC context.
  - Add `attachment_id` to the record reads: `(SELECT ta.attachment_id FROM transaction_attachments ta WHERE ta.transaction_id = transactions.id) AS attachment_id`, omitted from the DTO when null.
  - Any list of keys or attachment ids binds as one JSON parameter (ruling R57).
- [ ] **Step 4: Implement the Worker side.**
  - `retainRoute` and `replaceRoute` port `AttachmentService.withReceipt` and `prepare`: `commandHeaders(headers, 'required')`, `routeId(params.id)` and `assertKnownFields(body, ['attachment_id', 'consent'])`. For a supported schema they call `attachments.prepare` (the request's first, charged step) and poll every 75 ms while it answers `wait`, up to `copyDeadlineMs` (60 s); after that the answer is 503 `SERVICE_UNAVAILABLE` with `retry_after_seconds` 5.
  - For `copy`: take a `COPY_SLOTS` slot (503 with 5 seconds when none is free), then `copy(source_key, key)` and `head(key)` under one 60-second `AbortSignal`; a failure releases the copy and answers 503 with 5 seconds. Then the command step with `prepared` set to what `head` reported, and in every case `attachments.release` for an unused copy afterwards.
  - `serveReceiptFile` ports the edge's `GET /v1/attachment-files/:grant` handler: the `attachments.file` step, `RECEIPT_SLOTS.take(claims.accountId)`, `getStream`, the size and digest check, `verifiedChunks(…, true)`, the first chunk read within `downloadIdleMs` (30 s) before any header, and `bodyStream` with `downloadTotalMs` (300 s). A failure before the first byte is 503 with 5 seconds.
- [ ] **Step 5: Run them and see them pass.**
- [ ] **Step 6: Mutation check.**
  - Scope receipt grants by account only: the session-bound case fails.
  - Publish a copy without comparing its digest: the ported `does not match` case fails.
  - Drop `attachment_id` from the history read: the everywhere-read case fails.
  - Stamp `released_at` in the trigger with SQLite's clock: the purge case fails on `released_at`.
- [ ] **Step 7: Gate, receipt, commit.** Commit: `git commit -m "Keep receipt photos in R2 as commands on the record, behind session-bound grants"`.

---

### Task 1B-T10: Import previews, review and confirmation

**Starts after:** 1B-T5, 1B-T9

**Files:**
- Create: `apps/edge/src/vault/files/previews.ts`, `src/vault/files/confirmation.ts`
- Modify: `src/v1/protocol.ts`, `src/v1/routes.ts`, `src/v1/worker-routes.ts`, `src/v1/files/receipts.ts` (`confirmRoute`), `src/vault/routes.ts`, `src/vault/commands/registry.ts`, `src/vault/retention.ts` (1B-T6's purge export, if 1B-T6 is not merged), `test/workers/support/files.ts` (`seedPreview`)
- Test: `test/workers/imports-review.test.ts`

**Interfaces:**
- Consumes: `runCommand` and `commandInput` (1A-T3); the transaction write path and `categoryById` (1A-T4, 1A-T5); 1A-T8b's purge routine; `uploadStatus` and the parse pipeline (1B-T5); `prepareReceipt`, `releaseReceiptCopy`, the copy flow and the attachment rows (1B-T9); `parsePatchBody`, `parseFreezeBody`, `parseConfirmBody`, `PATCH_KIND`, `FREEZE_KIND`, `CONFIRM_KIND`, `REVIEW_ENTITY`, `SELECTION_ENTITY` (`@api/imports/confirmation.service`); `parseImportPreviewPaging`, `isImportReviewSnapshot`, `isImportSelectionSnapshot` (contracts).
- Produces:
  - Routes: `GET /v1/imports/:id/preview` (`bound_session`, `vault: 'imports.preview'`), `PATCH /v1/imports/:id/rows` (`current_policy`, `vault: 'imports.patchRows'`, gates `['imports']`, status 200), `POST /v1/imports/:id/selections` (`current_policy`, `vault: 'imports.freeze'`, gates `['imports']`, status 201), `POST /v1/imports/:id/confirmations` (`current_policy`, `worker: 'import.confirm'`, gates `['imports', 'writes']`, status 200), `GET /v1/imports/:id/selections/:selectionId` (`bound_session`, `vault: 'imports.progress'`).
  - `VaultRouteId` gains the routes `'imports.preview' | 'imports.patchRows' | 'imports.freeze' | 'imports.progress'` and the step-only ids `'imports.confirmPrepare' | 'imports.confirm'`, which go into `VAULT_STEP_ROUTES`. `WorkerRouteId` gains `'import.confirm'`.
  - The registry gains the `import_review` and `import_selection` entities and the three commands with the API's outcome, schema versions and policy, after the attachment commands, as `buildContainer` constructs `ConfirmationService` after `AttachmentService`.
  - `previewOf(c: VaultContext, jobId: string, paging: ImportPreviewPaging): ImportPreviewDto | null` (a port of `PreviewQuery`, with `attachable_until` from the image's `delete_after` less 2 minutes), `pruneImports(c: FileContext): void` and `importsDueAt(c: FileContext): number | null`.
  - In `confirmation.ts`: `patchImportRows(c, call): PatchImportRowsResult`, `freezeImportSelection(c, call): CommandAck`, `confirmPrepare(c, call): PreparedCopy`, `confirmImportBatch(c, call): ConfirmImportBatchResult` and `selectionProgress(c, jobId, selectionId): ImportSelectionProgress | null`, ports of `ConfirmationService` and the 0018 routines.
  - Row ids in a patch, a selection and a confirmation batch bind as one JSON parameter; confirmed rows are written one statement per row inside the batch's one command (ruling R57).
  - `confirmRoute(w)`: without `receipt`, one `imports.confirm` step; with one, `imports.confirmPrepare`, the copy flow of 1B-T9, then `imports.confirm` with `prepared`, then the release of an unused copy.
  - `seedPreview(user, candidates: CandidateRecord[], opts?: { image?: boolean }): Promise<string>` returns the job id of an accepted, parsed upload whose preview holds those candidates.

- [ ] **Step 1: Stub, then write the failing tests** in `imports-review.test.ts`. First add typed stubs (`previewOf` and `selectionProgress` return null, the commands acknowledge without writing, `pruneImports` does nothing, `importsDueAt` returns null).
  - Port every `it` in `apps/api/src/imports/import-confirmation.integration.spec.ts` (30) by name and assertion under the not-applicable rule.
  - Port these 21 cases of `apps/api/src/imports/import-preview.integration.spec.ts` (1B-T5 took the other 17):
    - `serves exact candidates, issues and totals to the owner, with a 7-day expiry and revision 1`
    - `5,000 rows parse with exact totals (no float arithmetic anywhere)`
    - `before parsing there is no preview yet: queued, nothing to review`
    - `is owner-only: another account and an unknown id get the same 404`
    - `names matching records and same-file twins, and keeps every row`
    - the five paging cases: `no parameters is exactly the whole preview, with no page key`; `pages only candidates: summary and issues stay whole-file, advice follows the page rows, pages rejoin the whole`; `defaults the missing parameter, and a page past the end is empty`; `refuses malformed paging as a validation error, and keeps owner-only 404s`; `a preview that is not ready is served as before, whatever the paging`
    - the duplicate-advice cases `5,000 identical rows against 5,000 identical records, with statistics older than the import: answered in time, five matches each`, `5,000 distinct rows with statistics older than the import are answered in time` and `names exactly what the self-join named, row for row`, with the API's time bounds
    - `queues one expiry job at the preview expiry, and it deletes the candidates when due` (as `importsDueAt` and `pruneImports`)
    - `an account disabled at the due time: its job ends superseded, the route says expired at once, retention deletes the candidates` (a vault that is not active)
    - `leaves a preview inside its 7 days alone`
    - `pruning its succeeded parse job does not turn it into an expired upload; its rows, preview and totals go 30 days after its raw expiry`
    - not applicable, one receipt line each: `stays linear whatever join the planner picks (hash and merge joins disabled)` (PostgreSQL planner settings), `an account at a newer lifecycle generation: retention expires the preview and makes its image due` (a vault has no lifecycle generations; deletion erases it whole), `only the fenced routines write previews; logins read nothing they should not` (PostgreSQL roles)
    - covered by 1B-T2's column-for-column test: `Drizzle definitions match the migrated preview tables`
  - Port `parses an upload the edge accepted, which the edge then reviews and confirms` from `test/jobs.db.test.ts`, parsing with `handleParseBatch` and `fakeParser(parsedCsv(rows))` (the two rows of that test).
  - Add:
    - `a confirmation batch of 500 rows commits as one command under one revision`: 500 confirmed rows give 500 transactions, each with its `import_row_progress` row, all under one `committed_revision`; a resent batch replays the same acknowledgement and writes nothing.
    - `a selection naming 1,000 rows freezes` (ruling R57): `POST /v1/imports/:id/selections` naming 1,000 of 1,200 rows is 201, and its progress counts 1,000.
    - `a confirmation with a receipt copies the import image once and attaches it to the image row's record`: one `receipt/<vaultId>/<attachmentId>/` object, and the record created for `image:1` carries `attachment_id`.
    - `a preview expires after 7 days: its candidates go, it reads expired, and an unattached image is due`: `pruneImports` at created plus 7 days.
    - `after pruneImports at importsDueAt, the next importsDueAt is later or null`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/imports-review.test.ts`. Record the counts.
- [ ] **Step 3: Implement** the ports with 1A's porting rules. A confirmed row becomes a transaction through the same insert path as `transactions.create`, inside the batch's one `runCommand`, with the id the API derives for an import row and its `import_row_progress` row (the 1B-T2 guard trigger checks it). `pruneImports` ports `gogospend_expire_due_import_previews` and `gogospend_prune_import_selections`, and purges `import_review` and `import_selection` entities 30 days after their last change with 1A-T8b's purge routine (`gogospend_import_records_due`). `importsDueAt` is the earliest of those deadlines.
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.**
  - Skip the frozen-revision check: the ported stale-selection case fails.
  - Write each confirmed row in its own command: the one-revision case fails.
  - Bind one `?` per row id: the 500-row batch and the 1,000-row selection fail (too many SQL variables).
- [ ] **Step 6: Gate, receipt, commit.** Commit: `git commit -m "Review and confirm statement imports in the vault, in batches of 500"`.

---

### Task 1B-T11: Files on the vault alarm

**Starts after:** 1A-T8b, 1B-T5, 1B-T6, 1B-T8, 1B-T9, 1B-T10

**Files:**
- Create: `apps/edge/src/vault/files/jobs.ts`
- Modify: `src/vault/retention.ts` (`reschedule`), `src/vault/user-vault.ts` (`alarm()`, `alarmAt`, `rearm`, `fileJobOptions`), `src/vault/commands/executor.ts` (`runCommand` calls `touch(c)` when it commits)
- Test: `test/workers/files-alarm.test.ts`

**Interfaces:**
- Consumes: `nextDue`, `runDue`, `reschedule`, `UserVault#alarm` (1A-T8b); `touch`, `deleteDueObjects`, `objectsDueAt`, `startPendingWork`, `startDueAt`, `WORK_STARTERS` (1B-T4); `pruneUploads` and `uploadsDueAt` (1B-T5), `pruneExports` and `exportsDueAt` (1B-T6), `pruneSnapshots` and `snapshotsDueAt` (1B-T8), `pruneAttachments` and `attachmentsDueAt` (1B-T9), `pruneImports` and `importsDueAt` (1B-T10).
- Produces:
  ```ts
  // src/vault/files/jobs.ts
  export type FileJob = 'start_work' | 'delete_objects' | 'prune_files'
  export type FilePrune = (c: FileContext) => void
  export const FILE_PRUNES: readonly FilePrune[]   // pruneUploads, pruneExports, pruneSnapshots, pruneAttachments, pruneImports
  export type FileJobOptions = { maxBatches?: number; prunes?: readonly FilePrune[] }
  export function fileJobsDue(c: FileContext, lastStartAttemptMs: number | null): Map<FileJob, number>
  export function runFileJobs(v: UserVault, options?: FileJobOptions): Promise<void>
  // src/vault/retention.ts (1A-T8b's, widened)
  export function reschedule(c: FileContext, lastStartAttemptMs: number | null): number | null
  ```
  - `UserVault#fileJobOptions: FileJobOptions` is empty by default; tests set it, as they set `clock`, and `alarm()` passes it to `runFileJobs`.
  - `fileJobsDue`: `start_work` at `startDueAt(c, lastStartAttemptMs)`, `delete_objects` at `objectsDueAt(c)`, and `prune_files` at the earliest of the five `<x>DueAt(c)`. A job with nothing to do is absent. No deadline is derived here; each comes from its owning task's function and constants (ruling R37).
  - `reschedule(c, lastStartAttemptMs)` upserts the `schedule` rows of 1A's `nextDue(c)` and of `fileJobsDue`, deletes the rows of jobs with nothing to do, and returns the earliest due time or null. 1A's call sites pass `this.lastStartAttemptMs`.
  - `UserVault` keeps `alarmAt: number | null` in memory, because the synchronous `call()` cannot await `getAlarm()`. It is read with `await ctx.storage.getAlarm()` inside the constructor's `blockConcurrencyWhile`, updated whenever the vault sets or deletes its alarm, and set to null when `alarm()` starts, because the runtime deletes an alarm once it fires.
  - `rearm(c)` computes `due = reschedule(c, this.lastStartAttemptMs)`; when `due !== this.alarmAt`, it calls `void ctx.storage.setAlarm(due)` or `void ctx.storage.deleteAlarm()` outside every transaction block, and sets `alarmAt = due`. `erase()` (1B-T2) sets `alarmAt` to null, and an erased vault never rearms.
  - `call()` rearms after its block when the context was touched (`runCommand` touches on commit, which keeps 1A-T8b's "after each call that committed a command"). Every background method rearms the same way, and `alarm()` always rearms.
  - `UserVault#alarm()`: first `this.alarmAt = null` (the fired alarm no longer exists, so a due time equal to the old one must still be set again); then `runDue(c)` (1A-T8b), `await runFileJobs(this, this.fileJobOptions)`, and `rearm` with a fresh context.
  - `runFileJobs` runs each prune of `options.prunes ?? FILE_PRUNES` one after another with one clock reading, each in its own `try`/`catch`: a throw is logged with `logFailure('file_prune_failed', error)` and the next prune still runs (each opens its own blocks, so none is nested). Then `deleteDueObjects(this, options.maxBatches ?? 10)`, then `startPendingWork()` when `start_work` is due (it sets `lastStartAttemptMs`). A failure in the async parts is logged with `logFailure` and never thrown, so the platform does not retry the alarm in a loop, and `rearm` always runs.
  - When `deleteDueObjects` stops at its batch cap with keys still due, `delete_objects` stays due now. Because `alarm()` cleared `alarmAt`, `rearm` sets the alarm again and it fires at once. Each run removes up to `maxBatches` × 1,000 keys, so that is progress, not a loop.

- [ ] **Step 1: Stub, then write the failing tests** in `files-alarm.test.ts`. First add typed stubs (`fileJobsDue` returns an empty map, `FILE_PRUNES` is empty, `runFileJobs` resolves at once, `fileJobOptions` is `{}`, and `reschedule` takes the new parameter and ignores it). Drive time with `vault.clock` and fire alarms with `runDurableObjectAlarm`, as 1A-T8b's tests do.
  - `a key whose writer never published it is deleted by the alarm at its deadline`.
  - `an export file is deleted by the alarm when it expires, and its status reads expired`.
  - `work requested before the vault slept is started by its alarm after it wakes` (Review Focus 3): request an export with `startWork: 'manual'`; `getAlarm()` is the request time plus 60,000; `evictAllDurableObjects()`; move the clock 61 seconds; run the alarm. The `ExportWorkflow` instance reaches `complete` and the export reads `ready`.
  - `a failed start is retried a minute later, not in a loop`: with a starter that throws, the alarm at `t` leaves `getAlarm()` at `t + 60_000`.
  - `a capped run leaves the alarm set, and the next alarm clears the rest`: with `fileJobOptions = { maxBatches: 1 }` and 1,001 reserved keys past their grace (rows only; R2 deletes of absent keys succeed), the first alarm tombstones 1,000 keys and `getAlarm()` is not null (at or before the vault clock). The second alarm tombstones the last key, and `getAlarm()` is then the tombstones' time a day later.
  - `a prune that throws is logged, the others still run, and the alarm is set again`: with `fileJobOptions = { prunes: [() => { throw new Error('boom') }, ...FILE_PRUNES] }` and an export left `pending` for a day, after the alarm the export reads `failed` (`error`) and `getAlarm()` is that export's 30-day purge time, not null.
  - `the alarm follows the earliest of the core and file jobs`: with a deleted record (purge at +30 days) and a ready export (expiry at +24 hours), `getAlarm()` is +24 hours; after that alarm, it is +30 days.
  - `after any alarm, every scheduled time is later than now` (ruling R37): a vault holding one of each kind of due work (a reserved key past its grace, an expired export, a pending snapshot never started, a released receipt, an expired preview, a finished upload 30 days old, a deleted record past 30 days), with far fewer than 10,000 keys due. Fire the alarm at each `getAlarm()` in turn until it is null, at most 50 times. After every alarm, each `schedule.due_at` is later than the vault clock, and `getAlarm()` equals the smallest of them.
  - Port from `apps/api/src/privacy/retention.integration.spec.ts`, through the alarm: `export requests are purged 30 days after the request; the receipt stays compact` and `drops finished upload rows 30 days after they ended, never one still receiving or within the quota window`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/files-alarm.test.ts`. Record the counts.
- [ ] **Step 3: Implement `fileJobsDue`, `runFileJobs`, the widened `reschedule`, `alarmAt` and `rearm`** exactly as the Interfaces block says.
- [ ] **Step 4: Run them and see them pass**, then every Workers-runtime test (`npm run test:edge:workers`): 1A's alarm tests must still pass.
- [ ] **Step 5: Mutation check.**
  - Ignore `lastStartAttemptMs`: the retry-a-minute-later case fails.
  - Leave `fileJobsDue` out of `reschedule`: the slept-vault case fails on `getAlarm()`.
  - Time `prune_files` from a fixed daily period instead of the five `<x>DueAt` functions: the every-time-later case fails.
  - Skip updating `alarmAt` after `setAlarm`: the earliest-job case fails (the alarm is not moved back).
  - Keep `alarmAt` when `alarm()` starts: the capped-run case fails (no alarm is set after the first run).
  - Let a prune's error escape `runFileJobs`: the throwing-prune case fails.
- [ ] **Step 6: Gate, receipt, commit.** Commit: `git commit -m "Run file expiry, object deletion and work retries on the vault's alarm"`.

---

### Task 1B-T12: The vault Worker answers the parity files session like NestJS

**Starts after:** 1A-T9, 1B-T5, 1B-T6, 1B-T8, 1B-T9, 1B-T10

**Owner answer 2:** yes (25 October 2026); the two Auth0 proof steps run against NestJS only, so 40 of the 42 steps are compared.

**Files:**
- Create: `apps/edge/test/support/files-session.ts`, `test/vault-parity-files.db.test.ts`
- Modify: `test/parity-files.db.test.ts` (imports the shared session, with no behaviour change), `test/support/vault-worker.ts`

**Interfaces:**
- Consumes: `startEdge`, `startNest`, `normalizer`, `seenOf`, `trace`, `BASE` (existing); `startVaultWorker` (1A-T9).
- Produces:
  ```ts
  // test/support/files-session.ts
  export type FilesUser = {
    headers(): Promise<Record<string, string>>    // client header and authorization; for NestJS also the session binding header
    proofToken?(nonce: string): Promise<string>   // NestJS only: the Auth0 ID token the proof step sends
  }
  export type FileStep = { name: string; signIn?: true; build(st: FilesState): Promise<Request>; after?(st: FilesState, body: unknown): void }
  export const STEPS: FileStep[]   // the 42 steps of test/parity-files.db.test.ts, moved verbatim; signIn on 'export: challenge' and 'export: proof'
  export function runFilesSession(send: Send, who: FilesUser, mode: 'nest' | 'vault'): Promise<(Seen | null)[]>
  ```
  - The steps never import the issuer: each request's headers come from `who.headers()`, and the proof step's ID token from `who.proofToken`. The test builds each `FilesUser` from `edge.issuer`. NestJS's comes from `edge.member()`, with its access token and `x-gogospend-session` binding, as the old session did. The vault's is a fresh `{ sub, sid }` that has accepted terms v1 on the vault Worker (as 1A-T9's vault user does); each of its tokens carries `sid` and `auth_time` now.
  - In `vault` mode the two sign-in steps are not sent (their entry is null), and `st.proofId` is a fresh UUID (B8, B12).
  - `startVaultWorker(o: { issuer; policies; vars?: Record<string, string>; background?: 'on' | 'off' })`. With `background: 'off'` it writes `wrangler.parity.json` next to the built config, a copy without `workflows`, `queues.consumers` and `containers` (B13), and starts `wrangler dev` with that file. `vars` are passed as `--var`.

- [ ] **Step 1: Refactor the shared session.** Move the steps to `test/support/files-session.ts`. Run: `npm run test:edge:db -- test/parity-files.db.test.ts`. Expected: PASS, unchanged (a refactor, not a RED).
- [ ] **Step 2: Stub the background option.** `startVaultWorker` accepts `background` and, for now, copies the built config unchanged. The RED below is then a list of differences, never a startup failure.
- [ ] **Step 3: Write the failing test** `test/vault-parity-files.db.test.ts`:

```ts
beforeAll(async () => {
  const settings = { IMPORT_UPLOADS_ENABLED: 'true' }
  edge = await startEdge(settings)   // the database and the JWKS issuer; no PostgreSQL edge route runs here
  nest = await startNest(edge, settings)
  const policies = await (await nest.send(new Request(`${BASE}/v1/policies`))).json()
  vault = await startVaultWorker({ issuer: edge.issuer, policies, vars: settings, background: 'off' })
}, 120_000)

it('the vault Worker stores, queues and serves files exactly like the NestJS v1 API', async () => {
  const nestRun = await runFilesSession(nest.send, await nestUser(edge), 'nest')
  const vaultRun = await runFilesSession(vault.send, await vaultUser(vault, edge.issuer), 'vault')
  const a = normalizer(new Set(), ['nonce']), b = normalizer(new Set(), ['nonce'])
  const differences = STEPS.flatMap((step, i) => {
    if (step.signIn) return []
    const n = { ...nestRun[i]!, body: a(nestRun[i]!.body) }, v = { ...vaultRun[i]!, body: b(vaultRun[i]!.body) }
    return JSON.stringify(n) === JSON.stringify(v) ? [] : [{ step: `${i + 1}. ${step.name}`, nest: n, vault: v }]
  })
  expect(differences).toEqual([])
  expect(STEPS.length).toBe(42)
  expect(STEPS.filter((s) => s.signIn).map((s) => s.name)).toEqual(['export: challenge', 'export: proof'])
})

it('the retired proof routes answer 404 on the vault Worker', async () => {
  for (const path of ['/v1/auth/challenges', '/v1/auth/proofs']) {
    const res = await vault.send(new Request(`${BASE}${path}`, { method: 'POST', headers: await vaultHeaders(edge.issuer), body: '{}' }))
    expect([res.status, (await res.json()).code]).toEqual([404, 'NOT_FOUND'])
  }
})
```
  `nestUser` and `vaultUser` build the two `FilesUser`s described above. `vaultHeaders(issuer)` signs a token for a fresh `{ sub, sid }` and adds `x-gogospend-client: ios/1.0.0` and `content-type: application/json`. `startEdge` no longer gets `{ store }`: no PostgreSQL edge route runs in this test, so its object store is never used, and 1B-T13 drops the option.
  - The comparison skips the two `signIn` steps, so 40 steps are compared (owner answer 2).
- [ ] **Step 4: Run it and see it fail.** Run: `npm run build:edge && npm run test:edge:db -- test/vault-parity-files.db.test.ts`. Expected: listed differences, at least `snapshot status` and `export status`, because the unchanged copy lets background work advance on the vault run. Record the list.
- [ ] **Step 5: Make it pass.** Implement `background: 'off'`, then fix every other listed difference in the vault, never in the session or the normalizer. The two sign-in steps are the only ones not compared (B12).
- [ ] **Step 6: Run it and see it pass.** Expected: no differences, 42 steps (40 compared). Run 1A's `test/vault-parity.db.test.ts` too: still 49 steps, no differences.
- [ ] **Step 7: Mutation check.**
  - Answer a new snapshot request with 201: the `snapshot` step is listed.
  - Report a queued import as `parsing`: the `import status` step is listed.
- [ ] **Step 8: Gate, receipt, commit.** Commit: `git commit -m "Prove the vault Worker answers the v1 files session exactly like the NestJS API"`.

---

### Task 1B-T13: C1: the vault moves into the HTTP Worker, and the PostgreSQL edge retires

**Starts after:** 1A-T10, 1B-T7, 1B-T11, 1B-T12

**Files:**
- Create: `apps/edge/src/v1/ready.ts` (`live()`, moved from `src/server/app/health.ts`, and `readyResponseOf(env)`), `test/c1-worker.db.test.ts`, `test/c1-shape.test.ts`
- Rename: `src/roles/vault.ts` to `src/vault-worker.ts` (it exports `UserVault`, `SnapshotWorkflow`, `ExportWorkflow`, `StatementParser`, and a default `{ fetch, queue }`).
- Modify:
  - `src/server.ts`: re-export the four classes; `export default { fetch: handler.fetch, queue: vaultWorker.queue }`, as TanStack Start's server-entry guide allows for Durable Objects and queues.
  - `src/routes/v1/$.ts` (every method calls `handleVaultV1(request, env as unknown as V1Env)`), `src/routes/live.ts` (imports `live` from `src/v1/ready.ts`), `src/routes/ready.ts` (answers `readyResponseOf(env)`, B15).
  - `wrangler.jsonc`; `vite.config.ts` (no `auxiliaryWorkers`); `vitest.workers.config.ts` (`cloudflareTest({ main: './src/vault-worker.ts', wrangler: { configPath: './wrangler.jsonc' }, … })`).
  - `apps/edge/package.json`: only the `deploy` script (`npm run build && wrangler deploy`) and the description (no Hyperdrive); no dependency or lockfile change.
  - `scripts/dev.mjs`: drop steps 1 and 2 (the PostgreSQL container and its logins), the Hyperdrive connection strings, `LEGACY_V1_ORIGIN` and `ERASURE_REGISTRY_LOOKUP_KEY`; it still writes `.dev.vars` and runs `vite dev`.
  - `src/server/env.ts` (drop `HYPERDRIVE`, `DATABASE_URL`, `LEGACY_V1_ORIGIN` and the three wake queues), `src/cloudflare-workers.d.ts`.
  - `test/request.test.ts`: imports `matchRoute` from `src/v1/match` and runs its route cases on `VAULT_V1_ROUTES`; its request-helper cases are unchanged.
  - `test/support/vault-worker.ts` (the built config becomes `dist/server/wrangler.json`); `test/support/edge-harness.ts` (keeps what the NestJS reference needs: the database, the JWKS issuer, `fx`, `member()` and `testSettings`; drops the PostgreSQL edge client and `startEdge`'s `build` option); `test/route-coverage.test.ts` (rewritten).
  - `apps/edge/README.md`, `docs/implementation/premium-progress.md`.
- Delete:
  - `wrangler.vault.jsonc`, `wrangler.jobs.jsonc`, `wrangler.security.jsonc`, `wrangler.deletion.jsonc`; `src/roles/common.ts`, `jobs.ts`, `security.ts`, `deletion.ts`, `parser.ts`.
  - `src/server/worker.ts`, `src/server/app/container.ts`, `dispatch.ts`, `routes.ts`, `health.ts`, `src/server/db/`, `src/server/jobs/`, `src/server/ai/service.ts`, `facts.ts` and `tools.ts` (after moving `ASK_TOOLS` and `ToolInputError` into `src/v1/ai/tools.ts`).
  - The tests in the mapping table below, and `test/vault-route-coverage.test.ts` (merged into `route-coverage.test.ts`) (B18).
- Test: `test/c1-worker.db.test.ts`, `test/c1-shape.test.ts`, `test/route-coverage.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `wrangler.jsonc` (name `jotbun-edge`, main `src/server.ts`) holds every binding the vault Worker had: `VAULT` and `PARSER` Durable Objects with migrations `[{ "tag": "v1-user-vault", "new_sqlite_classes": ["UserVault"] }, { "tag": "v2-statement-parser", "new_sqlite_classes": ["StatementParser"] }]` (nothing is deployed, so the classes start fresh in this script); `CONFIG` (KV); `OBJECTS` (R2); both Workflows; the parse queue producer and consumer; the container; `dev.enable_containers: false`; `limits.cpu_ms` 120000 (1B-T6); and the vars. It has no `hyperdrive` and no `JOBS`, `SECURITY_JOBS` or `DELETION_JOBS` producers.
  - `live()` answers 200 `{ status: 'live' }` with `cache-control: no-store`. `readyResponseOf(env)` answers 200 `{ status: 'ready' }` when `AUTH_ISSUER`, `AUTH_AUDIENCE`, `AUTH_JWKS_URL` and `COMMAND_DIGEST_KEY` are set and reading `config:v1` from `CONFIG` does not throw; otherwise 503 `SERVICE_UNAVAILABLE` with message key `errors.not_ready` and `retry_after_seconds` 30.
  - `VAULT_EDGE_ONLY_ROUTES: readonly string[]` in `src/v1/routes.ts`: the seven AI and bridge keys.
  - **Where each deleted PostgreSQL test case goes** (ruling R39; "same name" means ported by name and assertion):

    | Deleted case | Goes to |
    | --- | --- |
    | `dispatch.db`: `every response is no-store with its own request id and helmet-style headers`; `a client-sent request id is ignored`; `an unknown route is 404 NOT_FOUND as an ApiProblem when nothing is forwarded`; `no client header is 426 before any token check`; `an outdated client is 426`; `no bearer token is 401 UNAUTHENTICATED`; `a token from an unpublished key is 401`; `privacy preferences are saved and read back` | 1A-T2 `front-door.test.ts`, same names |
    | `dispatch.db`: `a valid token without a session binding is 401 SESSION_REQUIRED` | 1A-T2 `a token without a session id is 401 SESSION_REQUIRED` |
    | `dispatch.db`: `signing out ends this binding only` | 1A-T2 `signing out ends this session only` |
    | `dispatch.db`: `another principal’s binding does not resolve` | retired by §6.4 (Auth0 session bindings); the isolation it guarded is 1A-T2 `a call naming another person is refused by the vault, which writes nothing` |
    | `dispatch.db`: `writes wait for the current terms; accepting them opens writes`; `the policy check runs in the guard, before the body is validated`; `creates a wallet whose balance starts at its opening balance`; `a resent command replays its acknowledgement; the same key with other content is 409`; `an unsupported command schema is 422 before anything is written`; `a stale If-Match is 409 VERSION_CONFLICT with the current wallet`; `validation problems name the field`; `malformed JSON is 400 VALIDATION_FAILED; a JSON primitive is refused as strict JSON`; `a body over 2 MB is 413 COMMAND_TOO_LARGE`; `a paused writes gate answers 503 WRITES_PAUSED with Retry-After before authentication; reads stay open` | 1A-T3, same names |
    | `dispatch.db`: `another account’s wallet looks like it does not exist (RLS)` | 1A-T9 `isolates people in the runtime too: one person cannot read another person’s wallet` |
    | `dispatch.db`: `seeds built-ins, records spending, and reads it back through history, summary, budgets, status and sync` | 1A-T7 (turned on in 1A-T8a), same name |
    | `dispatch.db`: `forwards a route the edge does not serve, with its method, path, query and body`; `an unreachable origin is 503 SERVICE_UNAVAILABLE, never a hang` | retired with `LEGACY_V1_ORIGIN` (B18): one Worker serves every v1 route, and an unknown route is 1A-T2's 404 |
    | `ai.db`: all 17 cases | 1B-T7 `ai.test.ts`, same names (`preferences are the account’s own (RLS)` becomes `preferences are the person's own`) |
    | `jobs.db`: `builds a requested snapshot, whose chunks the edge then serves` | 1B-T8, same name |
    | `jobs.db`: `writes a requested export, streamed back with its length, and never serves a tampered file` | 1B-T6, same name |
    | `jobs.db`: `parses an upload the edge accepted, which the edge then reviews and confirms` | 1B-T10, same name |
    | `jobs.db`: `sweeps and reports without an error line` | retired: the sweeps are the vault alarm's file jobs, proven by 1B-T11 `after any alarm, every scheduled time is later than now` |
    | `jobs.db`: `revokes the provider sessions after a global logout`; `workerd-roles.db`: `the security Worker revokes provider sessions after a global logout` | retired by §6.4 (Auth0 provider sessions); signing out everywhere is 1C's |
    | `jobs.db`: `erases a requested account, and the initiating device reads its receipt`; `refuses a lookup key that is not 32 bytes`; `workerd-roles.db`: `the deletion Worker erases an account, with its R2 objects` | 1C: the deletion Workflow and its receipt, built on 1B-T2's `erase` and `purgeVaultObjects` |
    | `workerd-roles.db`: `signs a new member in through the Auth0 profile check` | retired by §6.4; Better Auth sign-in is 1C's |
    | `workerd-roles.db`: `the jobs Worker builds a snapshot into the R2 bucket the HTTP Worker serves it from` | 1B-T8 `a snapshot runs on SnapshotWorkflow, and its cursor continues with /v1/sync/changes` and the chunk case; one Worker holds both from this task on |
    | `workerd.db`: `answers /live without the database`; `serves the trust page with TanStack Start`; `a route the edge does not serve is 404 without a legacy origin` | `c1-worker.db.test.ts` |
    | `workerd.db`: `/ready reaches PostgreSQL through Hyperdrive and holds without readiness receipts` | `c1-worker.db.test.ts` (`/ready` 200 with its settings, 503 without); the PostgreSQL half retires with Hyperdrive |
    | `workerd.db`: `runs a signed-in money session against PostgreSQL` | 1A-T9 `vault-parity.db.test.ts`, run on the HTTP Worker from this task on |
    | `workerd.db`: `isolates accounts in the runtime too` | 1A-T9 `isolates people in the runtime too: one person cannot read another person’s wallet` |
    | `parity.db`: `runs one scripted session on each and compares every response` | 1A-T9 `vault-parity.db.test.ts` (49 steps) |
    | `parity-files.db`: `runs one scripted session on each and compares every response` | 1B-T12 `vault-parity-files.db.test.ts` (42 steps) |
    | `parity-auth.db`: `runs one scripted session on each and compares every response` | retired by §6.4 (Auth0 sign-in and linking); its sign-out and deletion steps are 1C's |

    Cases that go to 1C have no vault test yet. Their code (the deletion and security Workers) retires here, and 1C's plan carries them (its labels `1B:erase` and `1B:C1`). Every other row's target must pass before its file is deleted.

- [ ] **Step 1: Stub, then write the failing tests.** First add `VAULT_EDGE_ONLY_ROUTES` to `src/v1/routes.ts` as an empty array (a typed stub), so the coverage test fails on its assertions, never on a missing export.
  - `test/c1-worker.db.test.ts` (the RED, on `dist/server/wrangler.json`):
    - `beforeAll` seeds `config:v1` (the test policies) into a temp folder with `npx wrangler kv key put config:v1 '<json>' --namespace-id 00000000000000000000000000000000 --local --persist-to <tmp>`, 1A-T1's `CONFIG` id, which the new `wrangler.jsonc` keeps (the old build has no `kv_namespaces`, so `--binding` fails). It starts that build on the same folder with `startDevWorker` and the settings `/ready` needs (`AUTH_ISSUER`, `AUTH_AUDIENCE`, `AUTH_JWKS_URL`, `COMMAND_DIGEST_KEY`, the client minimums). A second Worker starts without `AUTH_ISSUER` and `COMMAND_DIGEST_KEY`. Both pass an unreachable `HYPERDRIVE` local connection string, so the old build still starts and the RED fails on behaviour; Step 4 removes it with the binding.
    - `answers /live with no-store`: 200 `{ status: 'live' }`, `cache-control: no-store`.
    - `/ready is 200 with its settings and KV`: the first Worker answers 200 `{ status: 'ready' }`.
    - `/ready is 503 without its settings`: the second Worker answers 503 with `{ code: 'SERVICE_UNAVAILABLE', message_key: 'errors.not_ready', retry_after_seconds: 30 }`.
    - `serves the trust page with TanStack Start`: `/` is 200, and its HTML contains `คำสัญญาของเรา` and `No diary data is ever sent to GoGoCash`.
    - `serves /v1 from the vault: the policy list comes from KV`: `GET /v1/policies` is 200 and equals the seeded live list.
    - `an unknown /v1 route is 404`: `GET /v1/reports/<uuid>` with a client header is 404 `NOT_FOUND`.
  - `test/c1-shape.test.ts` (Node; read `wrangler.jsonc` with whole-line `//` comments removed, and keep its comments on their own lines):

```ts
it('one Worker hosts the vault, its Workflows, its queue consumer and its container', () => {
  const config = readJsonc('wrangler.jsonc')
  expect(config.hyperdrive).toBeUndefined()
  expect(config.limits.cpu_ms).toBe(120000)
  expect(config.durable_objects.bindings.map((b: { name: string }) => b.name).sort()).toEqual(['PARSER', 'VAULT'])
  expect(config.workflows.map((w: { binding: string }) => w.binding).sort()).toEqual(['EXPORT_WORKFLOW', 'SNAPSHOT_WORKFLOW'])
  expect(config.queues.producers.map((p: { binding: string }) => p.binding)).toEqual(['PARSE_QUEUE'])
  expect(config.queues.consumers.map((c: { queue: string }) => c.queue)).toEqual(['jotbun-statement-parse'])
  expect([config.r2_buckets[0].binding, config.kv_namespaces[0].binding]).toEqual(['OBJECTS', 'CONFIG'])
  for (const gone of ['wrangler.vault.jsonc', 'wrangler.jobs.jsonc', 'wrangler.security.jsonc', 'wrangler.deletion.jsonc']) expect(existsSync(gone)).toBe(false)
  expect(readFileSync('vite.config.ts', 'utf8')).not.toMatch(/auxiliaryWorkers/)
  const server = readFileSync('src/server.ts', 'utf8')
  expect(server).toMatch(/export \{[^}]*UserVault[^}]*\}/)
  expect(server).toMatch(/queue: vaultWorker\.queue/)
})
```
  - `test/route-coverage.test.ts`: keep `nestRoutes()`. Every NestJS route is in exactly one of `VAULT_V1_ROUTES` (same access, gates and `vaultStatus`), `VAULT_DEFERRED_ROUTES` or `VAULT_RETIRED_ROUTES`; `VAULT_DEFERRED_ROUTES` equals `['POST /v1/auth/deletion-receipt', 'POST /v1/me/deletion']` (B16); the retired set is 1A's six; `VAULT_EDGE_ONLY_ROUTES` are served and never shadow a NestJS route; every served route has its vault or Worker handler; every step id has a vault handler and no route.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run build:edge && npm run test:edge:db -- test/c1-worker.db.test.ts`, then `npm run test:edge -- test/c1-shape.test.ts test/route-coverage.test.ts`. Expected: in `c1-worker`, the `/ready` 200 case and the policy-list case fail (the old build checks PostgreSQL and serves `/v1` from it), while `/live`, the 503 case, the trust page and the 404 case pass already and guard the move (4 passed, 2 failed); the shape and coverage tests fail on assertions. Record the counts.
- [ ] **Step 3: Move and retire.** Run each mapping-table target first and see it pass, then make the changes, renames, merges and deletions listed above.
- [ ] **Step 4: Run them and see them pass.** Remove the unreachable `HYPERDRIVE` string from `c1-worker.db.test.ts`, rebuild and run it again. Then run the vault parity tests on the HTTP Worker: `npm run build:edge && npm run test:edge:db -- test/vault-parity.db.test.ts test/vault-parity-files.db.test.ts`. Expected: 49 and 42 steps, no differences.
- [ ] **Step 5: Mutation check.**
  - Leave the `hyperdrive` block in `wrangler.jsonc`: the shape test fails.
  - Drop the `queue` export from `src/server.ts`: the shape test fails.
  - Make `/ready` skip the `COMMAND_DIGEST_KEY` check: the 503 case in `c1-worker` fails.
- [ ] **Step 6: Docs.** `apps/edge/README.md`: "The Workers" becomes one Worker (`jotbun-edge`: TanStack Start pages, `/v1` on the UserVault, the two Workflows, the parse queue and the parser container; secrets `COMMAND_DIGEST_KEY` and, for AI, `ANTHROPIC_API_KEY`). Add the R2 lifecycle rules the owner configures on `jotbun-private-objects`: `sync_snapshot/`, `export/`, `import_quarantine/` and `import_image/` expire after 1 day; `receipt/` has no rule, and the vault's tombstones (B19) catch late writes there. Update the Tests table.
- [ ] **Step 7: Gate, receipt, commit, review.** Run the edge gate. Write the closing 1B receipt in `premium-progress.md`: the routes now served by the vault; what 1C still owes (the two deferred routes, Better Auth's `auth_time`, the deletion Workflow on `UserVault#erase` and `purgeVaultObjects`, the final sweep of an erased vault's prefixes); the mapping table's outcome; the not-applicable list collected from 1B-T5 to 1B-T11; the mutants; the owner answers used; and the SKIPPED items (Docker container runs, R2 lifecycle rules, the deployed memory limit and CPU limit, hosted CI). Commit: `git commit -m "Fold the vault into the HTTP Worker and retire the PostgreSQL edge Workers"`. Then run the independent read-only review of the whole 1B range (handover §4 step 8) and fix its findings test-first.

---

## Self-review notes (for the executor)

- **Rulings applied** (review of 25 October):
  - R27 (step-only calls): 1B-T3 (`VAULT_STEP_ROUTES`, `stepRouteOf`, a required `VaultCall.charge` that is `'step'` after the first call, the step-only and first-call tests); step ids in 1B-T5, T6 (`exports.file`), T7, T8 (`snapshots.chunk`), T9 and T10.
  - R28 (live policies): 1B-T3 `workerSessionFor` and its future-dated test.
  - R29 (tombstones, no Cron listing): B19; 1B-T4 `tombstoneObjects`, `deleteDueObjects` and the late-PUT test; 1C's final sweep stays.
  - R30 (export memory and CPU): B21; 1B-T4 `putConcatenated`; 1B-T6 (`VAULT_EXPORT_MAX_BYTES`, `limits.cpu_ms` with its expected CPU); 1B-T8 (the ten-times export).
  - R31 (`jobs` gate): Global Constraints; 1B-T4 (`startPendingWork` reads `readGates`); 1B-T5 (the consumer holds).
  - R32 (discarded messages): 1B-T2 (`enqueued_at`, `enqueued_attempts`); 1B-T5 (one time-only condition for the resend rule and `dueAt`, and its test).
  - R33 (`pruneExports`): 1B-T6 starts after 1A-T8b and tests `pruneExports` on its own.
  - R34 (owner questions): answered 25 October 2026 with every default; the Owner answers section, and the decided line under 1B-T1, T7, T8 and T12.
  - R35 (behavioural REDs): Global Constraints; Step 1 of every task stubs first.
  - R36 (STRICT): Global Constraints; 1B-T2 Step 3.
  - R37 (deadlines): `objectsDueAt` and `startDueAt` (1B-T4), `uploadsDueAt` (T5), `exportsDueAt` (T6), `snapshotsDueAt` (T8), `attachmentsDueAt` (T9), `importsDueAt` (T10), each with its later-or-null test; 1B-T11's `reschedule(c, lastStartAttemptMs)`, `alarmAt` and the every-time-later test.
  - R38 (memory proof): 1B-T8 (cursor spy, peak against stored bytes plus one chunk, the named SKIPPED risk).
  - R39 (C1 tests): 1B-T13's mapping table and `c1-worker.db.test.ts` as its RED.
  - R57 (100 SQL parameters): Global Constraints; 1B-T4 (1,001 keys), T5 (candidates, parts), T6 (purge ids), T8 (150 chunks), T9, T10 (500-row batch, 1,000-row selection), T11 (prune batches through the owning functions).
  - Minor findings: `VaultEnv` gains `CONFIG` (T4), `PARSE_QUEUE` (T5), `EXPORT_WORKFLOW` (T6) and `SNAPSHOT_WORKFLOW` (T8); snapshot reuse compares `ready_at` (T8); `released_at` comes from the vault clock (T2 trigger, T9 prune); formula case (T6); the T13 file list; a durable `erase` (B22, T2); `previewFromOutcome` takes `today` (T1); a `not_started` reply spends no attempt (T1, T5); repository bodies (T5); the import-preview split, 17 and 21 (T5, T10); the T3 test details; the lane note; `FilesUser` and a behavioural RED (T12); the Dockerfile line dropped (T1); no CI files in the Shared files.
  - Re-review fixes: `alarm()` clears `alarmAt` first and each prune runs in its own `try`/`catch`, with the capped-run and throwing-prune cases (T11); the files session counts 42 steps, 40 compared (T12, T13); `charge` gains `'step'` (T3); the `putConcatenated` mutant that leaves `parts` filled, and the note that `finish()` returns a copy of its parts array (T4, T6); the 101-export case (T6); the `VAULT_EDGE_ONLY_ROUTES` stub (T13); 1A-T8 split into 8a (sync) and 8b (retention) in T6, T8, T9, T10 and T11.
- **Spec coverage for 1B:**
  - §6.2 full resync (synchronous read, chunked R2 objects with 24-hour expiry, proven at ten times the yearly ledger): 1B-T8. Snapshot expiry on the vault alarm: 1B-T11.
  - §6.3 R2 (one private bucket, purpose prefixes with the vault id, slip images never stored): 1B-T2, T5, T7 and T9; lifecycle rules documented in 1B-T13 and SKIPPED.
  - §6.9 statement import (stream to quarantine, a queue message wakes the parser, the Container returns normalised rows, the consumer writes the vault, review, confirmation in batches of 500, the stateless Container): 1B-T1, T5 and T10. Receipt re-encoding: B2.
  - §6.12 export on `ExportWorkflow` behind a five-minute grant: 1B-T6. Deletion: the erase primitive, durable across eviction, and the prefix purge (1B-T2) for 1C. The orphan sweep becomes per-vault tombstones (B19, a deviation the owner may overturn).
  - §6.6 the files session (42 steps, 40 compared): 1B-T12. The dispatch suite's file-free cases are 1A's; the AI suite is 1B-T7.
  - §6.7 routes on vault reads with today's behaviour: 1B-T7 (B10 keeps phase 3's parts out).
  - §4 gates and kill switches: the route gates (1B-T3 to T10), the `jobs`, `imports` and `ocr` holds in background work (1B-T4, T5), the release flag (1B-T3).
  - C1: 1B-T13. C2: no contract change (B8). C12: 1B-T3, T4 and T5.
- **Type consistency, checked:** `FileContext` (T4) is what every prune and due function takes; `BuildOutcome` (T4) is what `writeExport` and `buildSnapshot` answer, with `peakHeldBytes` added by both; `ParseServiceReply`'s codes are the same in T1 and T5; every step id named in a task is in that task's `VAULT_STEP_ROUTES` line.
- **Not in 1B, on purpose:** Better Auth and the `auth_time` it issues (1C); the deletion route, Workflow and final sweep (1C); live pokes (1D); the `ai` gate unless Q3 says otherwise, AI Gateway and Haiku-first routing (phase 3); slips, drafts and devices (phases 3 and 4); currency fields and the export's currency columns (phase 5); the push queue (phase 4, plan P4).
