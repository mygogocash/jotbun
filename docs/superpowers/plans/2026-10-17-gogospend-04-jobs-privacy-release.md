# GoGoSpend Jobs, Privacy and Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver bounded private file processing, explicit import confirmation, export/deletion, proven recovery and a reviewable release package.

**Architecture:** PostgreSQL leases/fencing and registered object publication coordinate a separate worker process with private R2. Financial import writes occur only through the common command executor after user confirmation. Deletion persists independent erasure authority before destructive work and continues after identity removal.

**Tech Stack:** Existing Node image and parser libraries after review; PostgreSQL, R2 S3 SDK/presigner, Auth0 maintenance client, encrypted backup tooling, Docker/Railway configuration.

**Spec:** [Approved architecture](../../design/backend-architecture-2026-10-17.md), [master/interfaces](2026-10-17-gogospend-backend.md), [money](2026-10-17-gogospend-02-money.md), [sync](2026-10-17-gogospend-03-offline-sync.md).

## Global Constraints

- All master constraints apply. Execute P1 after M4. P1's local gate (local PostgreSQL plus the deterministic object-store failure adapter) unblocks S1; its hosted R2 gate is required before P2a exposes uploads and before beta. P2a needs P1 and M1; P2b needs P2a; P2c needs P2b and M3; P3 needs P2c. P4/P5 need S1 and F6a. P6a needs P5 and P2c; P6b needs every other gate. Never enable imports because parsers alone passed.
- Upload 12 MiB, supported images JPEG/PNG/WebP ≤20 MP, at most 5,000 candidates/500 confirmed rows per command. Raw/quarantine/export/snapshot TTL ≤24 hours, preview 7 days, grants 5 minutes, 3 attempts and one initial CPU parser.
- API runtime never receives recovery decryption/control credentials. No public bucket alias, permanent file URL, raw upload in Mongo, guessed date/direction or automatic spending persistence.
- Active-server deletion target 24 hours; recovery copies 7 days; PITR target RPO ≤1 hour/RTO ≤4 hours and independent daily backup fallback RPO ≤24 hours. Prove them; provider failures do not become silent completion.

## Review Focus

1. Worker loses a lease after its external PUT started: P1/P5 late-output sweep.
2. A spreadsheet formula/zip bomb or image overwhelms parser resources: P2a/P2b controlled rejection.
3. An overlapping confirm batch retries after some rows committed: P3 durable row-level progress.
4. Identity is already deleted when later cleanup fails: P5 durable independent authority.
5. A valid old backup restores an erased account or loses attachment references: P6a restore rehearsal.

### Pinned regression assertions

Arrange these fixture values in each task's named test files; they do not stand in for real storage/provider/restore proof.

| Task | Test name | Core assertion |
| --- | --- | --- |
| P1 | `late_cancelled_output_is_not_published` | `expect(publishedKeys).not.toContain(lateKey); expect(keysAfterSweep).not.toContain(lateKey)` |
| P2a | `oversized_stream_is_rejected_before_buffering` | `expect(response.status).toBe(413); expect(bytesBufferedBeyondCap).toBe(0)` |
| P2b | `parsing_has_no_financial_side_effect` | `expect(transactionCountAfterParse).toBe(transactionCountBeforeUpload)` |
| P2c | `foreign_attachment_grant_is_denied` | `expect(foreignGrantResponse.status).toBe(404)` |
| P3 | `second_batch_uses_same_frozen_selection` | `expect(first.selection_id).toBe(second.selection_id); expect(new Set(committedRowIds).size).toBe(5000)` |
| P4 | `untrusted_csv_text_cannot_start_formula` | `expect(escapedCell).toBe("'=SUM(A1:A2)")` |
| P5 | `failed_erasure_marker_blocks_destructive_cleanup` | `expect(destructiveCalls).toBe(0); expect(cleanupComplete).toBe(false)` |
| P6a | `restore_reapplies_external_erasure_registry` | `expect(erasedOwnerRows).toEqual([]); expect(missingRetainedObjects).toEqual([])` |
| P6b | `paused_writes_gate_rejects_business_mutation` | `expect(response.status).toBe(503); expect(response.body.code).toBe('WRITES_PAUSED')` |

### Task P1: Generalize durable jobs and implement private object publication

**Files:** Create `apps/api/drizzle/NNNN_jobs_storage.sql`, `apps/api/src/jobs/{jobs.module,worker,handler-registry}.ts`, `apps/api/src/storage/{storage.module,object-store,s3-object-store,object-publication.service}.ts`, `apps/api/src/database/leased-account-read.ts`, `apps/api/src/database/leased-account-read.integration.spec.ts`, `apps/api/src/worker.ts`, `apps/api/src/jobs/job.repository.integration.spec.ts`, `apps/api/src/storage/{object-publication.integration,s3-object-store.contract}.spec.ts`; modify F6a's `apps/api/src/jobs/{job.repository,job-types}.ts` and security-job adapter, database schema, API package build/start scripts (adding `test:storage-contract`) and v1 root.

**Interfaces:** Use F6a's `JobLease` (master definition) unchanged. Extend F6a's `JobRepository` to `claim/heartbeat/complete/fail/cancelAccount`; every transition requires the lease token. `ObjectStore.putStream/head/get/delete/list` operate on scoped server-generated keys and never return a public URL. `ObjectPublicationService.reserveKey(tx, lease, purpose)`, `publishIfCurrent(tx, lease, objectMetadata)` and `sweep(accountId, beforeDeadline)` fence the external write. `lifecycleGeneration` is separate from Auth0 session generation.

`LeasedAccountRead.withSnapshot<T>(lease: JobLease, purpose:'sync_snapshot'|'export', fn:(read:LeasedReadTx)=>Promise<T>):Promise<T>` opens one REPEATABLE READ transaction. `LeasedReadTx` exposes only typed high-water/entity/export-row streams through restricted fixed-search-path routines, not a generic `query` or client `SessionContext`. These routines derive owner from the stored job and validate job type, lease token/expiry, lifecycle generation and active account. Queue/security/parser roles have no financial SELECT/BYPASSRLS; the separate leased-read role gets only these routine grants. Deletion and recovery have separately scoped maintenance credentials.

- [ ] Reuse the durable `jobs` table/intent introduced by F6a; add generic leases/attempts/deadlines and publication registry without creating a competing queue. Adapt auth cleanup to the same fenced worker protocol. Add RED tests for double claim, crashed worker, expired lease completion, three failed attempts and cancellation. Failed terminal cleanup stays visible/alerted and can be explicitly requeued; no false success.
- [ ] Implement `FOR UPDATE SKIP LOCKED`, fresh fencing tokens, 10-second heartbeat/30-second lease and bounded task deadlines. Worker runs as a separate process role in the same image with CPU parser concurrency one. Missing handlers/config fail visibly. App lifecycle transitions cancel leases under the common account lock.
- [ ] Implement private R2 scopes and registry-before-PUT. Keys include owner/job/lease and cannot overwrite published keys. Recheck lease/status/lifecycle generation before publication; cancelled late output is deleted. Register every inflight key/deadline and perform an owner/orphan sweep after the final publisher deadline. Never assume a database rollback undoes an object PUT.
- [ ] Run `npm run test:db -w gogospend-api -- --runTestsByPath src/jobs/job.repository.integration.spec.ts src/storage/object-publication.integration.spec.ts src/database/leased-account-read.integration.spec.ts`. Assert missing/foreign/expired lease cannot read, purpose mismatch denies, valid stream contains only the stored owner's allowed fields, and direct financial SELECT still fails. Run `npm run test -w gogospend-api -- --runTestsByPath src/storage/s3-object-store.contract.spec.ts`; in the normal suite this spec always uses the deterministic failure adapter and ignores R2 configuration. Kill a worker during PUT and during completion against the failure adapter; verify stale completion denial and post-deadline cleanup. Passing these, with the three integration specs above, is P1's **local gate** and unblocks S1.
- [ ] **Hosted gate** (E1-authorized private R2 test scope): run `STORAGE_CONTRACT_TARGET=r2-test npm run test:storage-contract -w gogospend-api`. The script refuses to start without the authorized test-scope configuration and refuses bucket names outside that scope. Verify private access, ownership, expiry and denial for backup/control buckets, and repeat the worker-kill test against real R2. Record provider evidence without logging object keys/URLs/contents; until then record the check SKIPPED. P1 is not complete from the failure adapter alone: the hosted gate must pass before P2a exposes uploads and before beta.

**Done:** after the local gate, S1 can build bounded private snapshots against the object-store contract; after the hosted gate, later tasks can rely on recoverable fenced jobs and real private storage.

### Task P2a: Replace raw-buffer uploads with bounded private quarantine

**Files:** Create `apps/api/drizzle/NNNN_import_intake.sql`, `packages/contracts/src/v1/imports.ts`, `apps/api/src/imports/{imports.module,imports.controller,upload-intake,import.repository}.ts`, `apps/api/src/imports/upload-intake.spec.ts`, `apps/api/src/imports/upload-intake.integration.spec.ts`; retain old fixtures as read-only reference and add synthetic malicious/oversized fixtures under `apps/api/src/imports/fixtures/`; extend schema/root/exports.

**Interfaces:** `UploadIntake.accept(ctx, stream, metadata): Promise<UploadAccepted>` streams into private quarantine under a server-generated key, records the upload and import job, and enqueues one parse job through P1. It never buffers a whole upload in memory and never writes a transaction.

- [ ] Add RED tests rejecting streamed 12 MiB+1, false MIME/extension (magic-byte sniffing), HEIC and other unsupported formats, and path-like names. Verify rejection happens before unbounded buffering and leaves no quarantine object, published attachment or transaction.
- [ ] Implement private quarantine streaming with server keys and per-account quotas: at most 5 uploads/15 minutes, 50 MiB/day accepted bytes and 10 parse jobs/day, with explicit retry/limit copy. Register every quarantine key with P1's publication registry so a cancelled or failed upload is swept.
- [ ] Implement quarantine/raw expiry at 24 hours through P1 jobs. Run `npm run test -w gogospend-api -- --runTestsByPath src/imports/upload-intake.spec.ts` and `npm run test:db -w gogospend-api -- --runTestsByPath src/imports/upload-intake.integration.spec.ts`: quotas hold under concurrent uploads, foreign job IDs are denied without existence leaks, and expired quarantine objects are removed.
- [ ] After P1's hosted gate, verify one real bounded R2 quarantine upload and its expiry cleanup on synthetic data. Keep the upload route disabled until then.

**Done:** uploads land only in private, quota-bounded, expiring quarantine; nothing has been parsed or saved.

### Task P2b: Parse quarantined files into a reviewable preview in a bounded child process

**Files:** Create `apps/api/drizzle/NNNN_import_candidates.sql`, `apps/api/src/imports/{parse-handler,parser-runner,preview-query}.ts`, `apps/api/src/imports/parsers/{amount,date,csv,xlsx,image,receipt}.ts`, `apps/api/src/imports/parser-runner.spec.ts`, `apps/api/src/imports/import-preview.integration.spec.ts`; add synthetic malicious/unknown-field fixtures under `apps/api/src/imports/fixtures/`; extend `packages/contracts/src/v1/imports.ts`, P1's handler registry and schema.

**Interfaces:** `ParseHandler.run(lease): Promise<void>` writes review candidates only. `ImportPreview = {job_id,status,candidates,issues,duplicate_advice,review_revision,expires_at}`; each candidate has stable source-row identity and nullable unknown fields, never guessed committed values. No parser can call the transaction repository.

- [ ] Audit/remediate parser dependencies before any parser runs on uploaded content. Add RED tests rejecting >20 MP images, malformed/decompression-heavy ZIPs, macros/formulas/external references, multiple nonempty worksheets and files over each content limit below. Verify no candidate, published attachment or transaction is written.
- [ ] Validate ZIP expanded bytes ≤50 MiB, entries ≤1,000, candidate rows ≤5,000, columns ≤100 and cell text ≤10,000 characters; reject multiple nonempty worksheets explicitly for this release rather than silently omitting sheets. CSV enforces bounded row/cell memory. These are reviewable execution limits, not claims that arbitrary XLSX files will import.
- [ ] Port useful Spendee/MoneyLover/Meowjot and Thai date concepts into exact string parsers; never `Math.round(Number(amount)*100)`. Reject ambiguous/excess precision/over-cap values. Missing date/direction/wallet remains review-required. Decode/re-encode accepted images with metadata stripped. Run CPU/native parsing in a killable child with no arbitrary network access, an explicit minimal environment excluding DB/R2/Auth0/recovery credentials and no unrelated inherited file descriptors, 30-second parse deadline and reviewed 512 MiB container budget; bound parent job deadline to 120 seconds. Test credential-shaped fixture variables are absent in the child. Scrubbed environment is not claimed to be a complete exploit sandbox; parser exposure still requires the dependency/security gate. Pin OCR model assets/checksums at build time; no implicit runtime download.
- [ ] Implement/prove unattached sanitized image expiry at 24 hours and unconfirmed candidate expiry at 7 days. Run `npm run test -w gogospend-api -- --runTestsByPath src/imports/parser-runner.spec.ts` and `npm run test:db -w gogospend-api -- --runTestsByPath src/imports/import-preview.integration.spec.ts`. Assert no financial write, advisory duplicate behavior, Buddhist/Gregorian leap cases, parser kill/cleanup and exact row totals. An unmet CPU/memory target fails visibly; do not guess fallback fields.

**Done:** upload/parse produces a reviewable preview and cannot silently save money records.

### Task P2c: Retain receipt attachments with versioned ownership

**Files:** Create `apps/api/drizzle/NNNN_attachments.sql`, `packages/contracts/src/v1/attachments.ts`, `apps/api/src/attachments/{attachments.module,attachments.controller,attachments.service}.ts`, `apps/api/src/attachments/attachments.integration.spec.ts`; extend schema/root/exports.

**Interfaces:** `AttachmentService.retain/replace/remove(ctx, CommandInput<AttachmentCommand>):Promise<CommandAck>` uses M1, explicit consent and expected transaction version. `AttachmentCommand = {transaction_id:string; attachment_id?:string}` names only owned, sanitized published images from P2b. `NNNN_attachments.sql` adds `attachments` plus `transaction_attachments` with composite owner FKs and one current receipt per transaction. `GET /v1/attachments/:id/grant` authorizes a current retained association and issues a five-minute grant; quarantine/unattached preview objects never receive accepted-receipt grants.

- [ ] Add RED SQL tests: cross-owner association/grant denied with `404` and no existence leak; replace/remove is versioned against the transaction's current version; replaced/unreferenced objects are queued for deletion; a soft-deleted transaction's receipt survives its 30-day undo window but normal grant is denied until restore; shared references prevent premature object deletion.
- [ ] Implement explicit accepted-receipt retention and the grant endpoint through P1's object store. Explicit receipt removal has no binary undo and the client copy must disclose that. Run `npm run test:db -w gogospend-api -- --runTestsByPath src/attachments/attachments.integration.spec.ts`.
- [ ] After P1's hosted gate, verify one real bounded R2 upload/retain/grant/cleanup on synthetic data before exposure.

**Done:** only owned, sanitized, currently retained receipts receive five-minute grants; replacement, removal and retention are versioned and disclosed.

### Task P3: Implement resumable import confirmation and client review

**Files:** Create `apps/api/drizzle/NNNN_import_confirmation.sql` (frozen selections and per-row progress with unique `(job_id, source_row_id)` and resulting transaction ID), `apps/api/src/imports/{confirmation.service,confirmation.controller}.ts`, `apps/api/src/imports/import-confirmation.integration.spec.ts`, `apps/app/src/spend/v1/{imports,importReview}.ts`, `apps/app/src/spend/v1/importReview.test.ts`, `apps/app/src/screens/v1/ImportReviewScreen.tsx` and its render test; modify import route and locale messages after the new journey's visual approval, contract exports and v1 root.

**Interfaces:** `freezeSelection(ctx, CommandInput<{job_id:string; review_revision:string; selected_row_ids:readonly string[]; mapping:ImportMapping}>):Promise<CommandAck>` freezes the full chosen set (≤5,000 rows), normalized stored fields and mappings and returns a selection entity ID. Preview corrections are saved first through versioned `PATCH /v1/imports/:id/rows` batches ≤500; freezing verifies their common current review revision. `ConfirmImportBatch = {selection_id:string; frozen_revision:string; batch_row_ids:readonly string[]}` selects ≤500 rows from that frozen set. `ConfirmationService.confirm(ctx, CommandInput<ConfirmImportBatch>):Promise<{ack:CommandAck; selection_id:string; frozen_revision:string; committed:string[]; remaining:string[]; conflicted:string[]}>`. Source rows retain unique `(job_id,source_row_id)`, resulting transaction ID and durable progress. A batch cannot change mappings/fields or introduce rows outside the frozen selection.

- [ ] Add RED real-SQL tests: foreign job/row rejected; no save after parse/freeze alone; a 5,000-row frozen selection succeeds but a 501-row confirmation batch rejects; second/later batches use the same selection; changed frozen revision/out-of-set rows conflict; overlapping retries acknowledge committed rows and continue untouched rows. Kill after commit/before response and retry the original key/body. Source-row uniqueness cannot lose untouched work.
- [ ] Implement full-selection freeze as its own idempotent non-financial command, then per-batch row progress in the same M1 account-locked transaction as resulting financial rows. Revalidate account/session/policy/references and frozen selection under lock. Use M3 money validation; no auto upsert or similarity uniqueness. Retained receipt associations are linked atomically through P2c ownership/version rules when creating confirmed rows. Changed preview requires a new selection/revision and cannot rewrite committed rows. Keep raw candidate fields out of compact receipts and sync progress payloads.
- [ ] Implement upload → parsing → review → freeze full selection → confirm batches → progress/result in a new v1 client adapter. Require explicit row/category/wallet/direction/date review. Preserve review on network failure and show committed/remaining/conflicted counts; parsing succeeded never means transactions saved. A proven pre-commit `COMMAND_TOO_LARGE`/request-size rejection permits smaller batches with new command IDs; an unknown outcome must resolve the original key/body before repartitioning. Test large-note batches, later batches and overlapping retries; retain drafts until known outcome.
- [ ] Run `npm run test:db -w gogospend-api -- --runTestsByPath src/imports/import-confirmation.integration.spec.ts`, `npm run test:unit -w gogospend-app -- src/spend/v1/importReview.test.ts` and render tests. Confirm a 5,000-row synthetic import in explicit ≤500-row batches, with one forced interruption and restart, and reconcile exact wallet/category totals.
- [ ] Present and approve changed import/review/progress UI; verify Thai/English, accessibility and genuine duplicates. Enable the import flag only after dependency, worker, storage and confirmation gates all pass.

**Done:** an interrupted import resumes without double spending entries or lost unconfirmed rows.

### Task P4: Implement private asynchronous export

**Files:** Create `apps/api/drizzle/NNNN_exports.sql`, `packages/contracts/src/v1/privacy.ts`, `apps/api/src/exports/{exports.module,exports.controller,export.service,export-handler,csv-writer}.ts`, `apps/api/src/exports/export.integration.spec.ts`, `apps/api/src/exports/csv-writer.spec.ts`, `apps/app/src/spend/v1/privacy.ts`; extend P1 handler registry, schema and settings/privacy UX after E2.

**Interfaces:** `ExportService.request(ctx, proofId, CommandInput<ExportFilter>): Promise<CommandAck>` queues one owned job; `ExportFilter = Pick<HistoryFilter,'from'|'through'>` includes every transaction type in the selected period. `ExportHandler.run(lease): Promise<void>` creates one consistent read snapshot, exact CSV and private publication. `grant(ctx, exportId): Promise<{url:string; expires_at:string}>` checks current account/job ownership and five-minute expiry; output expires at 24 hours.

- [ ] Add RED assertions for purpose-bound fresh proof, replayed request, cross-owner job/grant, concurrent-edit snapshot consistency and deletion race. All income/expense/transfer fields and selected dates must be present; no receipt binaries or raw identity columns.
- [ ] Implement shared history filter semantics, exact minor-unit/currency columns and source/destination transfer fields. Use P1's leased-read `export` capability for one consistent database view and bounded streaming; no unrestricted worker financial SELECT. Neutralize formula-leading untrusted text including leading whitespace/tab/newline cases while preserving valid numeric minor-unit columns. Quote commas/newlines correctly.
- [ ] Use P1 publication/grants; cancellation after global account deletion cannot publish/download. Deny access at expiry and schedule cleanup at its deadline, with failed cleanup alerted; lifecycle rules are defense in depth, not the only TTL mechanism. No permanent public URL and no claimed user download from job completion alone.
- [ ] Run `npm run test -w gogospend-api -- --runTestsByPath src/exports/csv-writer.spec.ts` and `npm run test:db -w gogospend-api -- --runTestsByPath src/exports/export.integration.spec.ts`; verify a private real-scope synthetic export/grant/expiry and exact fixture reconciliation. Export stays accessible without a newly required terms acceptance, but still needs valid session/recent proof.
- [ ] Review user copy for queued/ready/expired/failed and reauthentication; review runtime logs to ensure no CSV contents, signed URL or financial totals escape. Record actual delivery/expiry evidence without asserting download success.

**Done:** owned recently authenticated export is asynchronous, private, exact and temporary.

### Task P5: Implement retention and resumable account erasure

**Files:** Create `apps/api/drizzle/NNNN_privacy.sql`, `apps/api/src/privacy/{privacy.module,deletion.controller,deletion.service,deletion-handler,erasure-registry,retention-handler}.ts`, `apps/api/src/privacy/{deletion,retention}.integration.spec.ts`, `apps/api/src/storage/deletion-publication.integration.spec.ts`, `docs/operations/{deletion,retention}.md`; extend F6a's maintenance client, F4's blocked principals, P1 handlers and mobile privacy states.

**Interfaces:** `DeletionService.request(ctx, proofId, commandId): Promise<{request_id:string; status:'accepted'}>` commits deleting status, revoked bindings, cancelled publishers and cleanup intent under the common lock. `ErasureRegistry.record(accountId, providerSubjectKeys): Promise<MarkerReceipt>` writes opaque/keyed markers to an independent maintenance-only control scope. `DeletionHandler.run(lease)` advances idempotent provider/object/database stages and requires no later user login.

- [ ] Add RED tests for request/save/import/export/publication races and lost acceptance response. Missing registry write must stop destructive cleanup. Invalid ordinary auth/network errors never cause device draft erasure or imply completed deletion. Minimal receipts cannot resurrect 30-day-purged transactions.
- [ ] Implement transaction deletion retention: stop counting immediately, undo within 30 days, then purge private row/change payloads and obsolete attachments, retaining only compact command outcomes. Schedule raw/preview/export/snapshot retention and remove all eligible private payload copies. Tombstone retention and expired-cursor full resync remain consistent.
- [ ] Implement account erasure ordering: accept fresh confirmed proof; lock/deny every linked principal; persist durable cleanup and independent marker; revoke supported Auth0 grants/device credentials; perform verified managed Apple/identity deletion; continue bounded publisher quiescence/orphan sweep and private DB/object/audit purge. Keep blocked principal mappings until provider cleanup is verified and stale JWTs cannot bootstrap. Retries after any crash cannot re-create identity/data.
- [ ] Run `npm run test:db -w gogospend-api -- --runTestsByPath src/privacy/deletion.integration.spec.ts src/privacy/retention.integration.spec.ts src/storage/deletion-publication.integration.spec.ts`. Kill during PUT, after registry write, during provider delete and after identity removal. Prove late keys are swept after their deadlines, worker leases cannot publish, and a provider outage remains pending/alerted rather than complete.
- [ ] In an E1-authorized synthetic tenant/storage target, prove primary Apple revocation (and linked-identity revocation once F6c has shipped) and active-server deletion within the 24-hour target. Confirm the initiating device's explicit discard/accepted state; other denied devices lock/preserve drafts. Publish exact retention/offline-copy wording after E2 approval; authenticated polling is not assumed after identity deletion.

**Done:** erasure is resumable, blocks stale identity/bootstrap, and has independent restoration authority; no production-data deletion has run.

### Task P6a: Prove backup, recovery inventory and restore

**Files:** Create `scripts/ops/{backup,restore-rehearsal,recovery-inventory}.mjs`, `scripts/ops/{recovery-inventory,restore-safety}.test.mjs`, `docs/operations/restore.md`.

**Interfaces:** `RecoveryInventory.enumerate(): Promise<RecoverableCopy[]>` records database history/branches/manual snapshots/object backups/restore-created copies and expiry. `restoreRehearsal(input): Promise<RestoreReceipt>` refuses a serving/production target, restores privately, reapplies independent erasure markers and validates attachment references before any serving switch.

- [ ] Add RED local safety tests: refuse non-isolated/serving restore target, missing registry/key custody, expired/missing backup and an inventory copy whose retention exceeds 7 days. Redaction tests inject synthetic credentials/financial values into backup/restore failures and assert they are absent from logs.
- [ ] Implement daily streaming encrypted logical backup plus accepted-attachment copy with isolated 7-day retention; keep plaintext out of ordinary files/stdout/process arguments. API has neither recovery-key nor recovery-control credentials. Inventory every recoverable production copy and enforce expiry; non-production uses synthetic data. Configure eligible seven-day PITR only under exact resource authority.
- [ ] Run `node --test scripts/ops/recovery-inventory.test.mjs scripts/ops/restore-safety.test.mjs`. In an authorized isolated target, execute `node scripts/ops/restore-rehearsal.mjs --target isolated-synthetic` using managed configuration, not secret CLI values. Restore a pre-deletion backup; reapply external markers; prove deleted principal/financial rows absent and retained attachments available. Measure actual PITR RPO ≤1 hour/RTO ≤4 hours and daily fallback RPO ≤24 hours; store redacted receipts. Failure blocks beta readiness.

**Done:** a measured restore rehearsal proves erased users stay erased and retained attachments remain available; recovery receipts are recorded for P6b's readiness check.

### Task P6b: Package the controlled beta/release

**Files:** Create `scripts/ops/performance-smoke.mjs`, `apps/api/src/health/{health.controller,health.service}.ts`, `apps/api/src/common/{operational-metrics,feature-gates}.ts`, `apps/api/src/common/operational-safety.spec.ts`, `apps/api/Dockerfile`, `.dockerignore`, `.github/workflows/backend.yml`, `docs/operations/{release,rollback,incident}.md`, `docs/implementation/beta-receipts.md`; modify launcher/docs/manifests and v1 default entry only after prior gates.

**Interfaces:** `/live` checks process only; `/ready` uses bounded dependency checks and fails while any mandatory receipt, including P6a's restore receipt, is missing or failed. Feature gates independently pause `writes`, `imports`, `ocr`, `uploads`, `jobs`; a paused gate returns `503` with an `ApiProblem` code such as `WRITES_PAUSED` and `retry_after_seconds`.

- [ ] Add RED tests: redaction tests inject synthetic credentials/financial values into API/worker failures and assert they are absent from logs; a failed mandatory receipt blocks readiness; each feature gate pauses only its own scope. Run `npm run test -w gogospend-api -- --runTestsByPath src/common/operational-safety.spec.ts`.
- [ ] Implement separate API/worker image commands, graceful shutdown and bounded timeouts. The image ships `packages/contracts/src` (or a reviewed contracts build step) under the master contracts constraint; inside the built image, prove the API and worker processes load `@gogospend/contracts` runtime exports. Audit dependencies/config and remove legacy `/spend`/internal shared-key/Salt Edge/cashback/autolog routes from the release dependency graph; preserve source/Mongo evidence unless separately authorized for removal. Update local docs to the new default only when the v1 journey passes. No startup migration and no automatic Mongo fallback.
- [ ] Run all master verification commands plus SQL integration, native device journeys and `docker build -f apps/api/Dockerfile -t gogospend-local .`. Validate the workflow by review/local command parity; actual hosted CI is required after an authorized push/PR, not claimed from YAML alone. Load the authorized staging target through `node scripts/ops/performance-smoke.mjs --target staging-synthetic`: mixed 20 requests/second across at least 20 synthetic accounts from named Thailand locations, warm p95 reads <800 ms and writes <1,200 ms; record environment/data/latency, no benchmark claims without results.
- [ ] Prepare E3/E4 review package: compatible migration order; command-schema and minimum-client-version compatibility (both the new API and the rollback API accept every command schema current clients emit, and any minimum-version raise is an explicit, dated decision); exact target/revision/commands, secrets-by-name/role, preflight backup+restore receipt, alert owner/destination, staged enablement, success/failure signal and rollback. Alert on queue age >5 minutes, backup age >26 hours, cleanup failure and 50/80/100% of US$100 envelope; retain redacted operational logs 7 days. Billing alerts are not caps. Production deployment/secret writes/PR/merge remain gated until expressly authorized; if released, verify actual deployed revision and health/native smoke before signoff.

**Done:** a measured recovery/native/security/performance package supports a controlled release decision. Local green, hosted CI, deployed commit and production readiness are reported separately.
