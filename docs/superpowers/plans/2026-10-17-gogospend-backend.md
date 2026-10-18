# GoGoSpend Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved Thai/English personal money tracker with Auth0, exact THB accounting on PostgreSQL, recoverable mobile sync, reviewed imports, and verifiable privacy operations.

**Architecture:** Retain NestJS/Node 24 and Expo. Introduce an isolated `/v1` application using Auth0 access tokens plus application-session bindings, `pg`/Drizzle on Neon, and private R2 objects. A separate worker role uses the same Node image; PostgreSQL owns commands, revisions and leased jobs.

**Tech Stack:** npm workspaces; TypeScript; NestJS 12/Express 5; Expo 58/React Native 0.88; Auth0 Universal Login; PostgreSQL 17 baseline; `pg`, Drizzle; SQLCipher/SecureStore; R2; Railway Singapore.

**Spec:** [Approved backend architecture](../../design/backend-architecture-2026-10-17.md). Read that document and this index before any stage. Approval was supplied on 17 October 2026 for the design and this planning task; execution has not started.

## Global Constraints

- Scope is personal tracking, Thai + English, iOS + Android, THB only, `Asia/Bangkok` reporting. No payments, bank connections, shared wallets, credit accounting, multi-currency, recurring bills, AI advice or automatic cashback/autolog writes.
- Node `>=24`; declared Expo `~58.0.12`, React Native `0.88.0`, NestJS `^12.0.1`, Express `^5.1.0`. These are repository declarations, not newly installed versions. Pin reviewed compatible dependency versions during execution; do not adopt an upstream `@rc` example automatically.
- Money is `bigint` satang in PostgreSQL and decimal integer strings in JSON. Positive transaction/budget maximum: `99,999,999,999` satang; opening balance may be zero. Transfers are one row with two distinct owned THB wallets. Opening and transfers are excluded from income/expense/budgets; negative tracked balances are valid.
- Every business mutation uses a command UUID and the account lock before checking current account/session state. Preserve compact idempotency receipts while the account exists; no private DTO copies in receipts. Revisions are allocated under that lock, never inferred from a global sequence.
- No financial client SQL, Data API or shared GoGoCash identity. `(issuer, sub)` maps to an internal UUID. Never link accounts by email. JWT + active binding + ownership are required for private data.
- Keep existing dirty extraction work and Mongo data. No stash/reset/clean, data conversion, credential reuse or automatic old/new database fallback. No changes under `vendor/`.
- Design approval is not source implementation, provider mutation, paid subscription, credential, commit, push, PR, deployment or production migration authority. A later explicit execution instruction opens local implementation only within its stated scope.
- Each task follows harness green → meaningful behavioral RED → minimum implementation → GREEN → diff/security review. A missing module, import error or unavailable database is not the intended RED. Add only the compile-safe seam needed to exercise the behavior before capturing RED. Preserve current coverage gates; no suppression to obtain green.
- Each task ends with a reviewable local diff. Commit only when separately authorized, stage exact task hunks rather than whole paths (F1–F3 edit manifests that already carry unrelated extraction changes, so path-level staging would sweep those in), and retain RED/GREEN receipts. No automatic commits from this plan.
- `@gogospend/contracts` is consumed as source (`main: ./src/index.ts`); the built API (`swc src` → `node dist/main`) loads its runtime exports through Node's built-in type stripping. Runtime code added there uses erasable TypeScript only (no `enum`, `namespace`, constructor parameter properties or decorators), explicit `.ts` import extensions as in the current `index.ts`, and no Node-only or React Native-only imports. F1 proves the built API loads these exports; P6b's image ships `packages/contracts/src` (or adds a reviewed contracts build step) and proves the same inside the container.
- API access-token lifetime target 5 minutes; rotating refresh/binding idle 7 days, absolute 30 days; one-use reauthentication challenges/proofs at most 5 minutes. Tenant/native proof remains required.
- Upload cap 12 MiB; accepted images JPEG/PNG/WebP, maximum 20 MP. At most 5,000 import candidates, 500 confirmed rows/transaction, 3 worker attempts and initially one CPU parser. Signed grants 5 minutes; staging/raw/export/snapshot objects at most 24 hours; unconfirmed preview 7 days; change/transaction-undo window 30 days.
- Target deletion of active server data within 24 hours; recoverable production copies expire within 7 days. PITR target RPO ≤1 hour/RTO ≤4 hours; daily-backup fallback RPO ≤24 hours. These need measured evidence. An offline device copy is not remotely guaranteed erased.
- Planning cost: about US$75/month under the approved illustration, US$100 operating envelope, not a cap or purchase authority. Recheck selected Auth0 entitlement, actual usage and excluded costs before purchase.

## Review Focus

1. A same-account token refresh changes its string while a response is in flight; accept it, but reject a late response after account switch/logout. Owned by F5 and S3.
2. Two first sign-ins race before any account-lock row exists; create exactly one identity/account and never bootstrap a deleted principal. Owned by F4/F6a.
3. A request passes its guard, then waits behind deletion/global logout; it must write nothing after acquiring the lock. Owned by M1 and P5.
4. A transmitted command has an unknown outcome during full resync; preserve it and never resurrect a deleted record from its draft. Owned by S1/S3.
5. A worker writes an object after its lease/account was cancelled; clean it after the deadline and prove recovery never restores an erased user. Owned by P1/P5/P6a.

## Verified starting point and migration seams

Inspected 17 October 2026: root `/Users/kunanonjarat/Developer/gogospend`, branch `feat/standalone-client-local`, HEAD `c009c7e`, remote `https://github.com/mygogocash/gogospend.git`. There are substantial existing dirty/untracked extraction edits: 55 paths, including `apps/app/src/auth/session.ts`, `apps/app/src/api/client.ts`, `apps/app/app/{_layout,login}.tsx`, `scripts/dev.mjs`, `package-lock.json`, the approved spec and this plan set. HEAD `c009c7e` contains none of the untracked ones, so a branch or worktree cut from it cannot run these plans (see E0). No applicable instruction files were found in the named repository/ancestor paths; the founder-supplied mandate applies. No `.github` workflows or Docker deployment files were found. No runtime test was run for this planning change.

| Existing source | Verified issue / planned treatment |
| --- | --- |
| `apps/api/src/app.module.ts`, `spend/spend.module.ts` | Global Mongoose/Firebase/legal/product wiring. Add a separate v1 root, then switch explicitly; retain legacy source/data until retirement review. |
| `apps/api/src/auth/firebase-auth.guard.ts` | Multiple issuers, Mongo/email resolution and caches. Do not port fallback authorization to Auth0. |
| `apps/api/src/main.ts`, `auth/rate-limit.guard.ts` | Full URL logging and old forwarded-header assumptions. Replace on the v1 path before callbacks or file endpoints. |
| `apps/api/src/spend/spend.service.ts` | JS-number money, one-wallet transfer model, implicit wallet creation and `.limit(200)`. New SQL domain contracts replace these behaviors. |
| `apps/api/src/spend/spend-import.service.ts` | Mongo raw buffers and automatic persistence after parsing; no lease fencing. Reuse tested parser concepts only; require explicit confirmation. |
| `apps/api/src/spend/spend-internal.controller.ts` | Shared-key raw export/purge. New privacy endpoints/jobs replace it; never expose it as v1 user access. |
| `packages/contracts/src/spend.ts` | Legacy number/source/HEIC/Mongo assumptions and obsolete R2 comment. Add explicit v1 exports first, then retire legacy exports only after caller review. |
| `apps/app/src/auth/session.ts`, `api/client.ts`, `spend/spendResource.ts` | Memory session, token-string identity comparison and legacy routes/numeric types. Use stable session epoch and a separate typed v1 resource adapter. |
| `apps/app/app.json` | Android package present; iOS bundle identifier and Auth0/SQLCipher plugins absent. Confirm identifiers before registering callbacks. |
| `scripts/dev.mjs` | Owns persistent loopback Mongo startup. Add a separate v1 launcher; never delete/migrate its volume. |

All `Create` paths in the stage plans are proposed new files. All `Modify` paths above were verified present in the main checkout's working tree (several are untracked). Each migration is created by the first task whose tests need its tables; never create a table for a later task, and never edit a migration owned by an earlier task. The migration list below is authoritative.

## Stage order and observable milestones

| Stage / plan | Tasks | Dependency / completion signal |
| --- | --- | --- |
| [1. Foundation and Auth0](2026-10-17-gogospend-01-foundation-auth.md) | F1–F5, F6a–F6c | Local schema/RLS and native session proof; one internal account, no legacy issuer fallback. F6c (account linking) depends only on F6b and is not a prerequisite of any M/S/P task. |
| [2. Money and online client](2026-10-17-gogospend-02-money.md) | M1–M5 | Depends on F1–F4 plus F6a's local schema/job primitive; hosted/native acceptance needs F5, F6a and F6b. Wallet → expense → transfer reconciles exactly. |
| [3. Offline and sync](2026-10-17-gogospend-03-offline-sync.md) | S1–S4 | S1 depends on M1–M4 and P1's local gate. S3/S4 also depend on M5, whose v1 resource adapter and screens they extend. P1's hosted R2 gate must pass before S1's storage contract is reported complete and before beta, not before S1 starts. Uncertain writes and stale cursors reconcile without duplicate or lost drafts. |
| [4. Jobs, privacy and release](2026-10-17-gogospend-04-jobs-privacy-release.md) | P1, P2a–P2c, P3–P5, P6a–P6b | P1 after M4; its local gate unblocks S1 and its hosted R2 gate blocks upload exposure and beta. P2a needs P1 and M1; P2b needs P2a; P2c needs P2b and M3; P3 needs P2c. P4/P5 follow S1 and F6a. P6a needs P5 and P2c; P6b needs every other gate. No beta until all privacy/restore gates pass. |

Recommended order: F1 → F2 → F3 → F4 → F5 → F6a → F6b → M1 → M2 → M3 → M4 → M5 → P1 → S1 → S2 → S3 → S4 → P2a → P2b → P2c → P3 → P4 → P5 → P6a → P6b. F6c may run at any point after F6b; it ships before beta unless the founder explicitly defers linking, because the approved spec includes it. M4 provides the summary contract consumed by the first Home/Add journey in M5.

Run F4's native bootstrap spike (its first step) as soon as E1/E2 allow, ideally while F1–F3 are in progress: its result can change F4's challenge/proof contract, so F4 cannot be marked complete before the spike passes or the founder makes the resulting design decision.

Local F6a schema/job code may complete while its hosted proof is pending so dependent SQL work can proceed, but do not claim auth readiness or enable linking/recovery until the F6a–F6c real gates pass. P1 follows the same split: its local gate (local PostgreSQL plus the deterministic object-store failure adapter) unblocks S1, and its hosted R2 gate is required before P2a exposes uploads and before beta. No imports are enabled in the first signed-in financial slice.

Migration integration is serial:

| Migration | Task | Contents |
| --- | --- | --- |
| `0001_identity` | F2 | `accounts`, `account_identities`, `account_sync_state`, database roles, restricted bootstrap routine |
| `0002_rate_limits` | F3 | `rate_limit_buckets` |
| `0003_sessions_policies` | F4 | `auth_sessions`, `reauth_challenges`, `consents`, policy versions, `blocked_principals` |
| `0004_jobs_security` | F6a | shared `jobs` table, security-job intent |
| `0005_commands` | M1 | commands, change groups, audit, receipts |
| `0006_wallets_categories` | M2 | wallets, categories |
| `0007_transactions` | M3 | transactions |
| `0008_budgets` | M4 | budgets, category sublimit trigger |
| `0009_jobs_storage` | P1 | generic leases/attempts/deadlines, publication registry, leased-read routines |
| `0010_sync` | S1 | snapshot manifests, cursor support, retention |
| `0011_auth_events` | F6b | verified provider-event receipts and reset reconciliation state |
| `0012_account_linking` | F6c | linking routines only (proof checks, alias move, empty-account fold); no tables |
| `0013_exports` | P4 | `exports` (request period; private file record and 24-hour expiry), leased export-row read, export record and status routines |
| `0014_import_intake` | P2a | `import_uploads` (upload record, import job id and sliding-window quota ledger in one row per attempt, at most 2 streaming per account), quarantine/expiry/maintenance routines, worker insert policy for import kinds |
| `0015_privacy` | P5 | `deletion_requests` (stage receipts; outlives the account), the maintenance-only `erasure_registry.erasure_markers` schema and role, the `account_deletion` security job kind, deletion and restore-reapply routines, retention routines (record purge with `purged` tombstones, receipt digests, security records, finished jobs), nullable receipt digests; numbered `0014` in its branch, renumbered `0015` at integration after P2a |
| `0016_import_candidates` | P2b | `import_previews` (one per parsed import: ready/rejected/expired, file issue codes, exact totals, sanitized image key, review revision, 7-day expiry), `import_candidates` (stable source-row id, nullable fields, row issues), fenced parse-source/record/preview-expiry routines |
| `0017_attachments` | P2c | `attachments` (retained receipt copies: own `receipt` key, type, size, digest, dimensions; retained or released), `transaction_attachments` (one current receipt per record; composite owner keys to the record and the receipt; shared receipts allowed), `import_previews.image_attachment_id` (the opaque id a retain names), the `receipt` publication purpose (published with no expiry while held), copy-reservation/retain routines, a release-when-unheld trigger, the `attachments.obsolete` retention and `attachments.objects` erasure routines |
| `0018_import_confirmation` | P3 | `import_selections` (one per freeze: preview, frozen review revision, row count, the preview's expiry), `import_selection_rows` (the frozen normalized fields with the owned wallet/category each label maps to; expense/income only), `import_row_progress` (unique `(job_id, source_row_id)`, resulting transaction id, command id; insert-only, guarded so a row is exactly its frozen row of a current selection), correction/freeze routines on P2b's candidates, selection retention routine; no `jobs` policy change |

F1, F5, M5, S2–S4 and P6a/P6b add no migration; F6c needed routines (no tables) and took `0012`. Numbers follow the order tasks are actually integrated: F6b was deferred with its hosted proof, so M1–M4 took `0005`–`0008` and P1 took `0009` (17 October 2026). Every later migration, including F6b's and any F6c needs, takes the next free number when it is integrated and updates this table in the same diff. Generate/review the matching Drizzle metadata in this order; parallel feature writers must not independently rewrite the migration journal.

## Shared interfaces and wire decisions

F1 publishes common TypeScript types in `packages/contracts/src/v1/common.ts`; domain DTOs are added by their owning tasks. Naming here is authoritative across stage plans.

```ts
type AccountId = string; // UUID, internal only
type Minor = string; // canonical signed integer for totals; positive for transaction amounts
type Revision = string; // nonnegative bigint decimal
type ApiIdentity = { issuer: string; subject: string; clientId: string; scopes: readonly string[] };
type SessionContext = { accountId: AccountId; subject: string; clientId: string; bindingId: string; sessionGeneration: number };
type CommandInput<P> = { commandId: string; kind: string; schemaVersion: number; payload: P; expectedVersion?: number };
type CommandOutcome = 'created' | 'updated' | 'deleted' | 'restored' | 'archived' | 'unarchived' | 'accepted'; // 'accepted' = queued asynchronous work, e.g. export request
type CommandAck = { command_id: string; entity_id: string; version: number; committed_revision: Revision; outcome: CommandOutcome; entity_state: 'active' | 'deleted' | 'purged' }; // version = entity version after this command
type ApiProblem = { code: string; request_id: string; message_key: string; fields?: Record<string, string>; retry_after_seconds?: number };
// Server-only (apps/api/src/jobs/job-types.ts), defined by F6a and extended by P1 without changing these fields:
type JobLease = { jobId: string; accountId: string; lifecycleGeneration: number; leaseToken: string; attempt: number; deadline: string; signal: AbortSignal };
```

`CommandOutcome` gains a value only through a contract change in the task that needs it.

- HTTP DTOs and the wire types published under `packages/contracts/src/v1` (including `CommandAck` and `CommittedChangeGroup`) are snake_case, and services may return them directly to controllers. Server-internal ports, repositories and request context (`CommandInput`, `SessionContext`, `JobLease`, `MutationResult`) are camelCase. Each POST/PATCH/DELETE business mutation requires UUID `Idempotency-Key`; entity create includes a client UUID `id`. Versioned update/delete/restore additionally uses `If-Match: "7"` syntax. Auth challenge/proof completion uses a request UUID plus the one-use challenge rule, never a receipt containing an ID token.
- Native private requests use `Authorization: Bearer <API access token>` plus `X-GoGoSpend-Session: <opaque binding>`. Public health/policy and token-only challenge/bootstrap exceptions are explicitly classified in F3/F4. Never put either value in a URL or ordinary logs.
- Client and command compatibility: every non-public native request sends `X-GoGoSpend-Client: <ios|android>/<semver>`; F3 rejects a version below the configured platform minimum with `426 CLIENT_UPGRADE_REQUIRED`, while public health/policy routes stay reachable. Every business mutation also sends `X-GoGoSpend-Command-Schema: <integer>`, stored with the immutable outbox command and included in its canonical digest. The server accepts every command schema emitted by any client at or above the minimum version, and keeps accepting it for at least 30 days (the outbox lifetime) after that client drops below the minimum. A replay of an already-committed command returns its original acknowledgement even if its schema is no longer accepted; an unsupported schema with no receipt returns `422 COMMAND_SCHEMA_UNSUPPORTED` without reserving one. Clients treat `426` as a pause that preserves drafts and `422 COMMAND_SCHEMA_UNSUPPORTED` as **Needs review**, never as data loss. Raising a minimum version or dropping a schema is a release decision recorded in P6b's package; rollback is blocked if the previous API cannot accept every schema current clients emit.
- A compact acknowledgement is followed by an owned current-entity query or sync; it is not a saved private snapshot. `POST /v1/commands/status` accepts at most 100 command UUIDs and returns `unknown` or the compact acknowledgement/current entity state without reconstructing purged data.
- Transaction DTO is a discriminated union: expense/income has `wallet_id`, `category_id`; transfer has `source_wallet_id`, `destination_wallet_id`, no category. All have positive `amount_minor`, Gregorian `occurred_on`, optional normalized note/merchant, and stable version. No implicit wallet/category upsert.
- `DatabaseService.withOwnerTransaction<T>(ctx: SessionContext, fn: (tx: OwnerTx) => Promise<T>): Promise<T>` owns BEGIN/COMMIT/ROLLBACK and transaction-local owner context. `OwnerTx` wraps a pinned `pg.PoolClient`; it is never returned to a caller after completion.
- `CommandExecutor.run<P>(ctx: SessionContext, input: CommandInput<P>, mutate: (tx: OwnerTx) => Promise<MutationResult>): Promise<CommandAck>`, where `MutationResult = {entityId: string; version: number; changes: readonly EntityChange[]}`. `EntityChange = {entity: string; id: string; version: number; state: 'active'|'deleted'|'purged'; snapshot: unknown|null}` is validated against its entity's persisted DTO before persistence. Every business write uses this executor; lifecycle transitions use the same database account lock.
- One command commits one `CommittedChangeGroup = {revision:Revision; command_id:string; changes:readonly EntityChange[]}`. Allocate one strictly increasing account revision for that whole group; the acknowledgement carries it. Sync pages and SQLite application never split a group. Set a 1 MiB serialized group and 2 MiB complete page budget; reject an oversized command before commit with `COMMAND_TOO_LARGE` and smaller-batch guidance. Page row limits count groups, not sibling changes. Derived wallet/summary totals are recomputed from the applied records, not independent financial counters. Use a 2 MiB v1 JSON request cap with stricter route-specific limits; uploads keep their streaming 12 MiB cap.
- `VerifiedOidcProof` is an internal validated value produced only by `OidcProofVerifier.verifyChallenge`; clients cannot construct it. Auth/provider/job interfaces are defined in F3/F6a–F6c and P1. Keep these server ports out of the mobile bundle.
- F6a defines `JobLease` (above) and the minimal `jobs` table and lease/fencing repository in `apps/api/src/jobs/{job-types,job.repository}.ts`. P1 later extends the repository with heartbeats, attempts, deadlines and publication without changing `JobLease`'s fields. There is one PostgreSQL queue, not one queue per subsystem. Session generation revokes login bindings; lifecycle generation invalidates object publishers on account deletion. They are separate counters.

## Verification commands and evidence rules

Existing commands, to run during implementation and record fresh results: `npm run typecheck`, `npm run typecheck:app`, `npm run test:api`, `npm run test:app`, `npm run test:render -w gogospend-app`, `npm run test:dev`, `npm run build -w gogospend-api`, `npm run export:web -w gogospend-app -- --max-workers 2`, `git diff --check`. Once F1/F2 add them, the full gate also runs `npm run test:unit -w gogospend-app` and `npm run test:db -w gogospend-api` with no path arguments (every pure app test and every integration spec). The old verification document is historical; its earlier 28 advisories and test counts are not a current result.

F1 introduces `npm run test:unit -w gogospend-app -- <relative-test-path>` through `apps/app/scripts/test-unit.mjs`, which discovers pure `src/**/*.test.ts` files and accepts explicit paths; retain existing API/render commands. F2 introduces `npm run test:db -w gogospend-api -- --runTestsByPath <src/path.integration.spec.ts>` using `apps/api/jest.integration.cjs`, the current SWC/ESM settings and a disposable guarded local database. Normal API unit tests exclude `*.integration.spec.ts`; the required full gate runs both suites. Missing DB setup is a failure, not skipped green. P1 introduces `npm run test:storage-contract -w gogospend-api`, the only command that may run the object-store contract against real R2; the normal API suite runs that contract against the deterministic failure adapter and never reads R2 configuration. These scripts do not exist yet.

Each task lists a focused command and PASS assertions. First run the same command to capture the intended behavioral RED, then GREEN. New native/storage/hosted/restore checks require actual evidence in addition to deterministic unit fixtures. Report every required check PASS, FAIL or SKIPPED with its command/target and reason; a required FAIL/SKIPPED blocks that milestone. Do not run existing legacy bank/provider tests against live accounts.

Dependency gate: inspect direct/transitive changes, install scripts, provenance, license, stable versions and advisories before installing approved libraries. Planned additions: API `pg`, `drizzle-orm`, `jose`, R2 S3 client/presigner; development `drizzle-kit`, `@types/pg`; app `react-native-auth0`, `expo-sqlite`, `expo-dev-client`, `expo-notifications`. Use the existing validation/test libraries. Run `npm audit --omit=dev --json` and full `npm audit --json`; triage/remediate reachable findings before parser exposure. Native install scripts need source review; the old `--ignore-scripts` web recipe is not native-build proof.

## Authority, secrets and rollout gates

| Gate | Owner / required authority | Work that may proceed independently |
| --- | --- | --- |
| E0: local execution | Founder explicitly starts the chosen stage/execution method; preserve/integrate dirty source deliberately. **Starting-code decision, required before F1:** the 55 dirty/untracked extraction paths, `package-lock.json`, the approved spec and these plans exist only in the main checkout's working tree, not in HEAD `c009c7e`. Choose one: (a) authorize a single baseline commit of exactly that content on `feat/standalone-client-local` (an E4 scope limited to that commit), after which worktrees and parallel writers may start from it; or (b) run every task serially in the main checkout with no worktrees or parallel source writers, staging task hunks only. Until one is chosen, no task starts. | Planning and document review are already authorized. No new branch/worktree is created in this planning turn. |
| E1: hosted feasibility | Exact non-production Auth0 tenant/native client/API/social connections/plan; Neon project/roles; R2 scopes; Railway target as needed. Named owner approves resource mutation, costs and credential destinations before each dependent operation. | Local synthetic SQL, signed JWT fixtures, ports and build preparation. No fallback provider/project if access fails. |
| E2: product/device | Confirm iOS identifier/callback domain and Apple/Google account configuration; approve remaining visual states and actual policy text. Native builds/devices and platform account access must be available. | Build adapters, reviewable UX drafts and automated state tests. No silent identifier, policy or auth-contract substitution. |
| E3: release | Fresh security/native/privacy/restore/performance evidence plus exact production secret/resource/deployment authority | Produce a concrete release/rollback package; never deploy from architecture approval alone. |
| E4: Git delivery | Explicit exact commit/push/PR/merge scope; use normal hooks and CI once authorized | Local diff/review and patch preparation. No automatic GitHub mutations. |

Secret names proposed for future configuration: API `DATABASE_URL`, migration-only `DATABASE_DIRECT_URL`, `AUTH0_ISSUER`, `AUTH0_AUDIENCE`, `AUTH0_ALLOWED_CLIENT_IDS`; API profile/link `AUTH0_PROFILE_LINK_CLIENT_ID`/`AUTH0_PROFILE_LINK_CLIENT_SECRET` (read-profile initially, exact linking scopes added only with E1); separate maintenance-only `AUTH0_MAINTENANCE_CLIENT_ID`/`AUTH0_MAINTENANCE_CLIENT_SECRET` for grant revocation/deletion; event verification `AUTH0_EVENTS_SECRET`, short-lived rate-bucket hashing `RATE_LIMIT_KEY`; R2 scope-specific endpoint/bucket/access-key identifiers/secrets; recovery-only encryption-key reference and erasure-registry key reference. Mobile public config `EXPO_PUBLIC_AUTH0_DOMAIN`, `EXPO_PUBLIC_AUTH0_CLIENT_ID`, `EXPO_PUBLIC_AUTH0_AUDIENCE`, `EXPO_PUBLIC_API_URL` contains no secret. Non-secret API configuration: `MIN_CLIENT_VERSION_IOS`, `MIN_CLIENT_VERSION_ANDROID`, and the test-only `STORAGE_CONTRACT_TARGET` read solely by `test:storage-contract`. Store bindings/SQLCipher keys only through protected native storage. Distinct roles/processes receive only their required subset. Configure real values only through the approved secure workflow; placeholder examples only in source/docs.

Use a new synthetic non-production database. Existing local Mongo and any GoGoCash users/data remain untouched. No dual writes. Run v1 in an additive process during development; before beta, unregister legacy `/spend`, internal purge/bank callbacks and their credentials from the standalone release graph. Rollback uses a compatible previous API against the same PostgreSQL data, preserves new financial writes, and pauses unsafe new writes; it never points at old Mongo as a shortcut. A real data migration needs a separate preservation/mapping/reconciliation plan.

## Acceptance coverage and handoff

| Approved area | Owning tasks / proof |
| --- | --- |
| Standalone auth, policies, account ownership, route/rate controls, client-version gate | F1–F5, F6a–F6c; actual native/tenant proof before auth readiness |
| Exact money, transfers, opening balances, editing/undo, budgets/history | M1–M5; SQL reconciliation and adversarial ownership/concurrency |
| Local persistence, pending totals, retries/resync/account switching | S1–S4; native storage plus crash/network/device evidence |
| Safe parsing, explicit confirmation, attachments and jobs | P1, P2a–P2c, P3; bounded resources, worker fencing and real private storage proof |
| Export/deletion/retention/erasure markers | P4/P5; races and provider/object partial-failure proof |
| Recovery | P6a; measured restore rehearsal and erasure-registry reapplication |
| Health, alerts, cost, CI, command/client compatibility, controlled rollout | P6b; measured load and a reviewed release package |
| Approved UI style, Thai/English and accessibility | M5/S4/P3–P5; page-specific approval where still outstanding, visual/device evidence |

For execution, recommend **subagent-driven tasks with independent review** because the security, money, sync and deletion interfaces have costly failure modes. Keep one writer per subsystem and integration in the main task. Parallelize only work whose published interfaces and prerequisites already pass, using the dependency column above rather than the recommended order. Use isolated worktrees for parallel source writers only after E0 option (a) puts the starting code in Git; under option (b) run tasks serially in the main checkout. Review the plan before implementation. No elapsed-time estimate is promised before the Auth0/native feasibility result.

## Planning verification receipt — 17 October 2026

- Self-review covered each approved specification section against the task coverage table; shared names, migration order, stage dependencies and task-level regression assertions were checked.
- Two independent document reviewers found material gaps in the first draft. The final revision resolves profile-client ordering/privileges, local versus server epoch, leased worker reads, atomic change-group pagination, import selection versus batches, receipt attachment ownership and summary-before-client ordering. Both focused re-reviews reported PASS with no remaining material gap in their reviewed areas.
- Document validation checks the five plan headers/sections, 21 unique task IDs, per-task files/interfaces/checkboxes/completion criteria, local Markdown links, code fences, placeholders and whitespace. It also compares pre-existing file hashes: only the architecture approval/status record may differ; application and existing extraction files must remain unchanged.
- `git diff --check` is the tracked whitespace gate; the new untracked plans receive separate document validation. Application tests, native builds, SQL/provider integration, load and restore are **SKIPPED for this documentation-only change**, not reported green. Execution receipts will be recorded in the proposed progress/beta documents by their owning tasks.
- No source implementation, dependency installation, branch/worktree, provider/secret/subscription change, commit, push, PR or deployment occurred while creating this plan.
- Revision after plan review, 17 October 2026: added the E0 starting-code decision; made F6a the owner of `JobLease`; gave F3, F4, F6b, P2a–P2c and P3 their own migrations and renumbered the list to `0001`–`0017`; completed the stage dependency column (S3/S4 on M5, P2a on P1, P3 on P2c); split P1 into local and hosted gates; strengthened F5's stale-response assertion; added a native bootstrap spike before F4; added client-version and command-schema compatibility (F3, M1, F5, M5, S3, P6b); stated the contracts runtime-loading constraint; split F6 into F6a–F6c, P2 into P2a–P2c and P6 into P6a–P6b (26 task IDs); renamed `CommandAck.initial_version` to `version` and typed `outcome`; clarified the snake_case/camelCase rule; named the income wallet in M3's golden fixture; added the full-gate suites, the storage-contract switch and outbox pacing under the write limit. Re-checked for this revision: 26 unique task IDs, each with one Files, Interfaces and Done entry and at least two checkboxes; every stage-plan migration file matches the table above one-to-one; local Markdown links resolve; code fences balance; no placeholders or trailing whitespace. No application file was touched. No application test, build, dependency, commit or provider change was run for this revision.

Sources rechecked for plan mechanics: [Auth0 Expo/native configuration](https://auth0.com/docs/quickstart/native/react-native-expo), [Drizzle/node-postgres and SQL migration setup](https://orm.drizzle.team/docs/get-started/postgresql-new), [Expo SQLCipher](https://docs.expo.dev/versions/latest/sdk/sqlite/#sqlcipher), [Neon PostgreSQL 17 support](https://neon.com/blog/postgres-17). Full provider/price/privacy evidence remains in the approved spec. Reconfirm the chosen database major at provisioning; do not change an existing project's major automatically.
