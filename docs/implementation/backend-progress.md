# Backend implementation progress

Receipts for the [backend implementation plan](../superpowers/plans/2026-10-17-gogospend-backend.md). Each task records its RED, GREEN and full-gate results. A required FAIL or SKIPPED blocks that task's milestone.

## Execution decisions — 17 October 2026

- **E0 starting code:** option (a). Baseline commit `2b5ee60` on `feat/standalone-client-local` holds the 94 previously uncommitted extraction files, `package-lock.json`, the spec and the plans. Work continues on branch `claude/gogospend-backend-plan-review-3c7544` (a worktree fast-forwarded to `2b5ee60`).
- **E4 scope:** commit each finished task locally on that branch. No push, PR or merge.
- **Run scope:** F1–F3, then check in. No provider resource, credential or paid service is used.

## Environment

macOS (Darwin 27), Node 26.10.0, npm 11.19.1, TypeScript 6.0.3, Docker 29.8.2. Dependencies installed with `npm ci` from the committed lockfile.

## Baseline before F1

All existing verification commands passed on `2b5ee60` with no source changes:

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run typecheck:app` | PASS |
| `npm run test:api` | PASS — 16 suites, 122 tests |
| `npm run test:app` | PASS — 6 tests |
| `npm run test:render -w gogospend-app` | PASS — 1 file |
| `npm run test:dev` | PASS — 2 tests |
| `npm run build -w gogospend-api` | PASS |
| `npm run export:web -w gogospend-app -- --max-workers 2` | PASS |
| `git diff --check` | PASS |

## F1 — v1 contracts and test baseline

- **Seam:** `packages/contracts/src/v1/{common,auth,errors,validation}.ts` with compile-safe stubs; `apps/app/scripts/test-unit.mjs` dispatcher (`npm run test:unit`), proven green on the 6 existing pure tests and failing closed for a missing path.
- **RED:** `npm run test -w gogospend-api -- --runTestsByPath src/v1/contracts.spec.ts` → 64 failed, 5 passed of 69; the pinned `parses_satang_without_float_conversion` failed with expected `6500n`, received `0n`. `npm run test:unit -w gogospend-app -- src/api/v1Contracts.test.ts` → 5 of 5 failed on `AssertionError`. No import or module errors.
- **GREEN:** the same commands → 69 of 69 and 5 of 5.
- **Runtime load:** after `npm run build -w gogospend-api`, `node -e "require('@gogospend/contracts').parseMinor"` from `apps/api` returns a function and parses `'6500'`. `erasableSyntaxOnly` is on in `packages/contracts/tsconfig.json`; an `enum` probe fails typecheck with TS1294.
- **Full gate:** typecheck PASS, typecheck:app PASS, test:api PASS (17 suites, 191 tests), test:app PASS (11), test:unit PASS (11), test:render PASS (3 tests), test:dev PASS, build PASS, export:web PASS, `git diff --check` PASS.
- **Consumers:** v1 names are new exports beside the legacy `spend.ts` exports; no existing import changed. Legacy exports stay until M5/P6b.
- **Independent review:** no blockers. Fixed: sparse arrays produced invalid canonical JSON (now rejected by an index loop); `compareVersions` silently ordered malformed versions, which could let a mistyped minimum pass every client (now throws `TypeError`); payload numbers must be safe integers, so distinct large JSON numbers can no longer share a digest; `bangkokDate` throws outside years 0001–9999; `test-unit.mjs` no longer follows symlinks; `ApiProblem.code` is `string` as in the master plan so clients tolerate unknown codes. The command-ID test was rewritten to claim only what normalization guarantees (keeping two commands apart is M1's receipt key). Tests for these were added with the fixes; the reviewer confirmed each bug with a probe, and a separate RED run was not captured. After fixes: contracts spec 75 of 75, test:unit 11 of 11, both typechecks PASS.
- **Decision recorded:** `isUuid` accepts lower-case canonical UUIDs only, so one ID has one spelling in receipts and keys; app ID generation must stay lower-case.

Observed, not changed (pre-existing):

- Node prints `MODULE_TYPELESS_PACKAGE_JSON` when the API loads `packages/contracts/src/*.ts`, because the package has no `"type"` field and is reparsed as ESM. Adding `"type": "module"` needs checking against Jest/SWC and Metro first; left for P6b's container proof.
- `swc src -d dist` also compiles `*.spec.ts` files into `apps/api/dist`. Harmless locally; P6b's image build should exclude them.

## F2 — PostgreSQL migrations, role isolation and v1 startup

- **Dependencies (reviewed, exact pins):** `pg` 8.23.1 and `@types/pg` 8.23.1; `drizzle-orm` 0.45.3 rather than 0.45.4, which was 9 days old. The lockfile added only the `pg` family and `drizzle-orm`; none has an install script, and no advisory hits a new package. The 28 production advisories (9 moderate, 19 high) are the pre-existing ones.
- **Deviation from the plan, for review:** `drizzle-kit` and `apps/api/drizzle.config.ts` were not added. `drizzle-kit` 0.31.11 brings `esbuild`'s install script and the deprecated `@esbuild-kit/esm-loader`, and it cannot generate this project's migrations (roles, RLS, `SECURITY DEFINER` routines). Migrations are reviewed hand-written SQL applied by `drizzle-orm`'s migrator. `readJournal` checks numbering, file/journal parity and strictly increasing `when`, and `verifyAppliedMigrations` refuses an applied file that was edited; Drizzle checks neither. `schema.ts` mirrors the SQL, and a test fails on drift.
- **Local database:** `compose.postgres.yml` pins `postgres:17.11-bookworm@sha256:3645570c…` to `127.0.0.1:55432` with volume `gogospend-postgres-v1-local-data`, managed by `scripts/dev-v1.mjs` (`npm run db:v1:up`, `npm run dev:v1`). The launcher refuses a container or volume under those names that it did not create, and never references the Mongo container/volume.
- **Seam then RED:** the seam migration had the tables, roles and a `NULL`-returning resolver, but no RLS and broad grants. `npm run test:db -w gogospend-api` → 11 failed, 17 passed of 28, all failures assertions on isolation behaviour. The pinned `pool_reuse_does_not_inherit_owner` received 3 leaked rows. A first RED run also exposed Nest calling `process.exit(1)` on a configuration error; `createV1App` now uses `abortOnError: false` so startup errors reject.
- **GREEN:** `npm run test:db -w gogospend-api -- --runTestsByPath src/database/owner-transaction.integration.spec.ts src/database/migrations.integration.spec.ts` → 26 of 26. Covered:
  - fresh and repeat migration, and refusal of an edited applied migration;
  - missing or wrong owner context sees nothing, and pool reuse inherits no owner;
  - a forged cross-owner insert or update changes nothing;
  - jobs/security/bootstrap roles cannot read rows;
  - the bootstrap routine resolves only through `SECURITY DEFINER` with a fixed search path, and a decoy schema is ignored;
  - `lockAccount` serializes a second locker;
  - rollback works, a handle is unusable after its transaction, and transaction-control/context statements (including comment-prefixed and multi-statement forms) are refused.
- **Launcher:** `node --test scripts/dev-v1.test.mjs` (in `npm run test:dev`) → 5 of 5. A conflicting container or volume leaves everything untouched, no command references Mongo or deletes anything, and the dev login password goes over stdin only. Manual `npm run dev:v1`:
  - migrations applied and the API listened on `127.0.0.1:8091`;
  - an unregistered route returned 404;
  - the password was absent from process arguments;
  - SIGTERM stopped the API;
  - the dev login has neither superuser nor `BYPASSRLS`.
- **Full gate:** typecheck PASS, typecheck:app PASS, test:api PASS (20 suites, 225 tests), test:db PASS (3 suites, 28 tests), test:app PASS, test:unit PASS (11), test:render PASS, test:dev PASS (7), build PASS, export:web PASS, `git diff --check` PASS. A crashed early RED run had left 4 test databases and logins in the local container; they were dropped, and normal runs leave none.
- **Independent review:** 1 blocker, 5 should-fix, 4 nits, each probed. For every fix, a test was added and shown failing first (12 integration, 1 unit and 1 launcher test failed); all pass after the fixes:
  - **Blocker:** `lockAccount` joined `accounts` in the locking statement, so a request that waited behind a deletion/logout got the old status and generation with the new revision. It now locks, then reads the account in a second statement. The test commits `deleting` while the request waits.
  - A connection dropped mid-transaction crashed the process (no `error` listener while checked out). One is now attached, and the connection is destroyed.
  - The statement filter could be bypassed (`;COMMIT`, nested comments, parameterized or `DO`-block `set_config`). Two additions, in the same round trips:
    - Before COMMIT, `gogospend_assert_owner_tx(token, account)` checks the transaction token, owner and role.
    - After COMMIT, a connection that kept a session-level owner or role is destroyed. The test proves this by backend PID: the poisoned connection was reused before the fix and is replaced after.
    - Documented as a guard against mistakes in trusted code, not a sandbox.
  - Concurrent `CREATE ROLE` from two databases raced; duplicates are now tolerated and the role's attributes re-checked.
  - A journal entry older than the newest applied migration but never applied was skipped silently; it is now refused.
  - The API refuses to start on a superuser, `BYPASSRLS` or table-owner-member login. The launcher forces `NOSUPERUSER NOBYPASSRLS` and sends only a SCRAM verifier, so no log can contain the password.
  - Nits fixed: `TEMPORARY` revoked from `PUBLIC` (a temp table could shadow the lock row), and default `EXECUTE` on new functions revoked from `PUBLIC`.
- **Interface note for F3/F4:** binding lookup needs `auth_sessions`, which the migration table assigns to F4. F3 therefore defines a session-resolver port that fails closed; F4 supplies the SQL implementation.
- **Not run against Neon:** no hosted database was used (E1).

## F3 — Auth0 access tokens, route classification, rate limits, safe logging

- **Dependency:** `jose` pinned at 6.2.12 (published 5 September 2026; no dependencies or install scripts). It was already in the tree at that version through `firebase-admin` → `jwks-rsa`; pinning it hoisted the same version, adding no new version.
- **Built:**
  - **Token verification:** `Auth0TokenVerifier` checks RS256 signatures against the pinned issuer's JWKS, plus issuer, audience, allowed client (`azp`/`client_id`), subject and expiry, with 30 s clock tolerance. ID tokens (client audience or `nonce`) and opaque tokens are rejected. At most one JWKS refetch per 30 s for unknown key IDs. A JWKS timeout, network failure or bad response is `unavailable` (503), never a bad token.
  - **Access classes:** `public`, `token_only`, `bound_session`, `current_policy` and `recent_proof`. They are declared with `@Access`, checked at startup (`assertRoutesClassified`) and enforced by one global `V1AccessGuard` in this order: classification → client version (426) → token → rate limit → binding/policy.
  - **Rate limits:** PostgreSQL buckets (`0002_rate_limits`) store HMAC keys only; rows expire within the hour, and the table is reachable only through two `SECURITY DEFINER` routines. Budgets are reads 120 and writes 60 per binding, and challenge/bootstrap 10 per principal and 30 per network address. `TRUST_PROXY_HOPS` defaults to 0.
  - **Logging and errors:** request IDs are server-generated. Logs are JSON lines with request ID, method, route template, status and latency only. Every error, including body-parser errors, is an `ApiProblem`, and a 500 never carries detail.
- **Plan clarification:** `ApplicationSessionGuard.resolve` uses a `SessionResolver` port, and current-policy routes use a `PolicyGate` port. Until F4 provides the SQL implementations, F3's defaults deny, so every bound route fails closed.
- **Contract change:** added `INTERNAL_ERROR` (500) and `SERVICE_UNAVAILABLE` (503) to `API_ERROR_CODES`.
- **RED against seams:** a decode-only verifier, allow-all guards, a full-URL logger and a non-problem filter. The four unit specs had 58 of 65 failing, and the rate-limit integration spec 4 of 6, all on assertions with no module errors. The RED also exposed a real bug in `routeManifest`: a trailing slash on `@Get()` routes, now fixed.
- **GREEN:** `npm run test -w gogospend-api -- --runTestsByPath src/auth/auth0-token-verifier.spec.ts src/auth/route-policy.spec.ts src/auth/request-context.spec.ts src/common/client-version.guard.spec.ts` → 65 of 65. `npm run test:db -w gogospend-api -- --runTestsByPath src/common/shared-rate-limit.integration.spec.ts` → 6 of 6.
  - The pinned `id_token_is_not_api_authorization` returns HTTP 401 through the real verifier and a synthetic loopback issuer.
  - Two API replicas share one budget.
  - A synthetic secret in the query, headers, cookie, path or body never appears in captured logs.
  - The trusted-proxy tests (a spoofed `X-Forwarded-For` is ignored at 0 hops; the proxy-appended address is used at 1 hop) were added after the code, so they had no separate RED.
- **Independent review:** no blocker; every bound, current-policy and recent-proof route needs a verified token and a resolved session. Fixed, with tests that failed first (18 unit and 1 integration, all on assertions, after adding compile-safe seams for `RequireScopes` and `networkSubject`):
  - **Random bindings bypassed rate limits.** A valid token plus a new invented binding per request got 401, never 429, and caused one session query each. Bound routes are now charged to a per-principal budget (360/min) *before* the session lookup; read/write budgets are keyed by the server's binding ID after the lookup, so invented bindings create no buckets.
  - `TRUST_PROXY_HOPS` must be set explicitly when `NODE_ENV=production` (unset behind Railway, every user would have shared one sign-in budget).
  - IPv6 clients are bucketed by /64; IPv4-mapped addresses as IPv4.
  - **Token lifetime is bounded:** 15 minutes maximum (`exp − iat`, and `maxTokenAge`); a future-dated `iat` is rejected. Client-credentials tokens are rejected, and `client_id` is used only when `azp` is absent.
  - **Route scopes:** `@RequireScopes(...)` is enforced by the global guard (403 when missing). No v1 route declares scopes yet.
  - **Nits fixed:**
    - A non-JWKS response now counts as unavailable (503).
    - After a key-source failure, the verifier answers `unavailable` for 5 seconds without refetching; 20 requests during an outage cause at most 2 fetches.
    - A failing policy store is 503, not 500; HTTP errors without a specific code keep their 4xx status.
    - The route manifest includes inherited handlers.
    - The `.env.example` rate-limit key is blank, so a copied example cannot start with a known key.
    - `0002` revokes routine `EXECUTE` from `PUBLIC` explicitly.
  - **Coverage added:** an integration spec runs the real `AuthModule` wiring (synthetic issuer, real verifier, PostgreSQL rate limiter, fail-closed session default), and startup refusal is tested for each missing or weak setting.
- **Full gate:** typecheck PASS, typecheck:app PASS, test:api PASS (25 suites, 316 tests), test:db PASS (5 suites, 56 tests), test:app PASS, test:unit PASS (11), test:render PASS, test:dev PASS (7), build PASS, export:web PASS, `git diff --check` PASS. No test databases left behind.
- **Manual `npm run dev:v1`:** started with placeholder Auth0 settings, so token-protected routes fail closed.
  - The migration guard first refused to run because `0001` had changed (F2 review fixes) after an earlier local smoke run applied it to the local `gogospend_v1`. That database was confirmed empty (0 accounts, 0 identities) and recreated; no other database was touched.
  - Afterwards, unmatched routes and malformed JSON returned `ApiProblem` bodies with server-generated request IDs, and a secret query value was absent from the logs.
  - The review fixes changed `0002`, so the still-empty local database was recreated once more (0 accounts, 0 identities) and re-checked with the same result.
  - Until the migrations are committed and frozen, editing one means recreating the local dev database. That is the edited-migration guard working as intended.
- **Not proven here:** no Auth0 tenant, native client or real token was used (E1/E2). This proves cryptographic validation and route rules against a synthetic issuer only, not tenant or native behaviour.

## F4 — identity bootstrap, session bindings, proofs and policies (local server work; F4 not complete)

- **Status:** the server side is built and tested locally with a synthetic issuer and Management API. F4 is **not complete**: its native bootstrap spike is BLOCKED on E1 (non-production Auth0 tenant, native client, connections, read-profile credentials) and E2 (iOS identifiers, callback domain). The challenge/proof contract is **provisional** until the spike passes or the founder decides. See [auth0-bootstrap-spike.md](auth0-bootstrap-spike.md).
- **Migration `0003_sessions_policies`:**
  - **Tables:** `auth_sessions` (binding digest only), `reauth_challenges` (nonce digest only), `blocked_principals`, `policy_versions` and `consents`. Provider principals are stored only as `sha256(issuer ‖ 0x00 ‖ subject)`.
  - **Routines:** four `SECURITY DEFINER` routines with `search_path = pg_catalog` and schema-qualified names, all revoked from `PUBLIC`:
    - `gogospend_issue_challenge` and `gogospend_bootstrap`: issue a challenge, then serialize on the principal, consume the challenge, create the account once, take the common account lock, re-read the account and issue the session;
    - `gogospend_prove_challenge`: completes a non-bootstrap challenge;
    - `gogospend_resolve_session`: checks the binding on every private request.
  - **App access:** `gogospend_app` gets only `resolve_session`, published `policy_versions`, its own `consents`, and its own proven challenges (to consume them).
- **Server:**
  - `POST /v1/auth/challenges`, `/v1/auth/bootstrap` and `/v1/auth/proofs` are `token_only` and send `Cache-Control: no-store`; `GET /v1/me` needs a bound session.
  - `GET /v1/policies` is public; `POST /v1/me/policy-acceptances` and `PUT /v1/me/privacy-preferences` need a bound session.
  - `authorizePurpose(tx, ctx, proofId, commandId, purpose)` consumes a fresh proof (≤5 minutes, newer than `reauth_after`) inside the command's owner transaction. A `purpose` argument was added to the planned signature.
  - The SQL session resolver and policy gate replace F3's fail-closed defaults.
  - The access-token and ID-token verifiers now share one JWKS cache and outage back-off (`Auth0KeySource`).
- **Lost bootstrap response:** a retry with the same challenge returns `409 CHALLENGE_USED` (recoverable: request a new challenge). The undisclosed binding expires unused after 5 minutes. A proof can be completed once (a second attempt is `CHALLENGE_USED`) and consumed once (a second attempt is `REAUTH_REQUIRED`).
- **Policy semantics:**
  - For each kind, the latest published *required* version must be accepted; non-required versions never block. Future-dated versions are invisible and cannot be accepted.
  - With nothing required published, current-policy routes return 503 (`errors.policy_unpublished`) rather than an acceptance prompt.
  - Reads, export (`recent_proof`) and the acceptance endpoint itself stay reachable while acceptance is pending.
  - Analytics is off by default.
- **Contract changes:**
  - New problem codes: `PROOF_INVALID`, `CHALLENGE_USED`, `REAUTH_REQUIRED`, `ACCOUNT_UNAVAILABLE` and `POLICY_ACCEPTANCE_REQUIRED`.
  - New types: `BootstrapRequest`, `ProofRequest` and `ProofResult`, plus `v1/policies.ts` (`POLICY_KINDS`, `PolicyVersionDto`, `PolicyAcceptanceRequest`, `PrivacyPreferences`, `MeDto`).
  - F3's `PolicyGate` now returns `accepted | pending | unpublished`.
- **Deviation:** no `accounts/account-identities.repository.ts`, since principal resolution happens inside the SQL routines. Policies live in their own `PoliciesModule`.
- **RED against seams:** a decode-only proof verifier, a trust-all profile client, routine stubs and an always-accepted policy gate.
  - Unit specs: 25 of 38 failed. Integration specs: 27 of 38 failed. All on assertions, with no module errors.
  - The pinned `concurrent_bootstrap_has_one_account` received 2 accounts.
- **GREEN:** `npm run test -w gogospend-api -- --runTestsByPath src/auth/oidc-proof-verifier.spec.ts src/auth/auth0-profile.client.spec.ts src/auth/auth-bootstrap.service.spec.ts` → 38 of 38. `npm run test:db -w gogospend-api -- --runTestsByPath src/auth/auth-bootstrap.integration.spec.ts src/policies/policy.integration.spec.ts` → 38 of 38, stable over 3 repeated runs.
- **Test correction:** a deleted account's open challenges are removed with it (foreign-key cascade), so the stale-challenge attempt is `PROOF_INVALID`. The test now also asserts that a new challenge is refused (`ACCOUNT_UNAVAILABLE`) and that no account is recreated.
- **End to end (HTTP, synthetic issuer and Management API):** challenge → bootstrap → `GET /v1/me` returns the account UUID, `active`, no pending policies and analytics off. An ID token used as Bearer is 401; a bootstrap retry is 409. No access token, ID token, binding, nonce or subject appeared in captured logs.
- **Independent review:** no blocker. It confirmed one account per concurrent first sign-in, refusal of replayed or cross-principal challenges, no ID/access-token confusion, and database permissions. Fixed, with tests that failed first (5 unit and 8 integration failures, all on assertions; the deadlock test failed by actually deadlocking):
  - **A non-required policy update locked out new users.** Terms v1 required plus v2 non-required left new users unable to ever satisfy v1, whose text is never served. A required version is now satisfied by accepting it or any later version, and the version presented is the latest published one, the same text `GET /v1/policies` serves.
  - **The block check ran before the account lock.** A hold written under the lock while a bootstrap waited still let it issue a session. The check now runs under the lock.
  - **Profile lookups before the challenge was checked.** Invented challenge IDs each cost an Auth0 Management API lookup. A read-only pre-check (`gogospend_check_challenge`: open / used / invalid) now runs first. A spent challenge still returns the recoverable 409, so lost-response recovery is unchanged.
  - **Lock-order deadlock.** Bootstrap locked the challenge before the account, opposite to deletion. Bootstrap now takes an existing account's lock first and re-reads the identity after waiting. The test races a deletion and asserts a refusal with no deadlock.
  - **Nits fixed:**
    - Every v1 response is `Cache-Control: no-store` by default.
    - Database connection failures map to 503, not 500.
    - Published policies are cached for 60 seconds, so public reads cannot drive database load.
    - The app role lost all direct access to challenge rows; proofs are consumed only through `gogospend_consume_proof`.
    - Consents have a foreign key to the policy version.
    - Management tokens are fetched single-flight.
    - Writes stay `unpublished` until a required terms version **and** a privacy policy are published. This rule is a founder decision recorded in `PolicyService`.
  - Race tests were stable over 4 repeated runs.
- **Full gate:** typecheck PASS, typecheck:app PASS, test:api PASS (28 suites, 360 tests), test:db PASS (7 suites, 101 tests), test:app PASS, test:unit PASS, test:render PASS, test:dev PASS, build PASS, export:web PASS, `git diff --check` PASS. No test databases left behind.
- **Manual `npm run dev:v1`:** migrations including `0003` applied. `GET /v1/policies` returned `[]` (nothing published, nothing invented) with `no-store`, and a challenge request without a token returned 401.
- **Local dev:** without `AUTH0_PROFILE_LINK_CLIENT_ID/SECRET`, bootstrap returns 503 by design.

## F6a — global logout, session revocation and the shared job queue (local server work; F6a not complete)

- **Status:** built and tested locally against a synthetic issuer and a loopback Management API fake. F6a is **not complete**: the tenant/native proof (two-device refresh and logout, primary Apple token revocation through Auth0's managed deletion path, plan/API entitlement) is **SKIPPED** until E1/E2, and so is its independent review of that evidence. No native security-state adapter exists yet (F5 builds the native client), so that adapter change is deferred to F5.
- **Plan housekeeping:** migration numbers now follow integration order: F6a `0004`, M1 `0005_commands`, M2 `0006_wallets_categories`, M3 `0007_transactions`, M4 `0008_budgets`; F6b, P and S take the next free number (`NNNN_…`).
- **Migration `0004_jobs_security`:**
  - **`jobs`:** the one durable queue that P1 extends. Worker role only (`gogospend_jobs`: SELECT, INSERT and column-limited UPDATE); the app role has no access. No foreign key to accounts, so cleanup jobs can outlive a deleted account. `last_error` is constrained to short identifiers.
  - **`blocked_principals.pending_job_id`:** a revocation hold names the one job that may lift it (after review; first written as `pending_generation`).
  - **Routines** (`SECURITY DEFINER`, `search_path = pg_catalog`, revoked from `PUBLIC`):
    - `gogospend_global_logout` (app): takes the account lock itself, bumps `session_generation`, sets `reauth_after` to the next whole second (matching `auth_time` resolution), revokes every binding, puts a `revocation_pending` hold naming its job on every alias (an existing deleted/disabled block is kept) and queues `auth0_revoke_grants` (20 attempts; no provider subjects in the payload).
    - `gogospend_session_is_active` and `gogospend_revoke_session` (app): the under-lock binding check and per-device sign-out.
    - `gogospend_revocation_job_is_current`, `gogospend_revocation_subjects` and `gogospend_finish_revocation` (security): need the current, unexpired lease token; finishing lifts only the holds naming that job, under the account lock and job row lock, and marks the job succeeded.
- **Server:**
  - `JobLease` (master contract) plus `JobRepository`: enqueue (idempotent by id), claim with `FOR UPDATE SKIP LOCKED` and a fresh fencing token per attempt, complete, and fail. Every transition needs the lease token. Retryable failures back off 30 s × 2^attempt (max 1 hour); after max attempts, and for a lease that expires on its last attempt, the job fails visibly. Each lease carries an `AbortSignal` that fires 5 seconds before the database lease expires. Deviation: `JobLease` gained `maxAttempts`, and `accountId` is nullable.
  - `assertActiveSession(tx, ctx, state)`: under the account lock, re-checks account status, session generation and the binding itself. Commands (M1) call it after `lockAccount`.
  - `POST /v1/me/logout` (bound session, 204) and `POST /v1/me/global-logout` (recent proof; Idempotency-Key = the proof's command id; 202 `{generation, provider_cleanup: "pending"}`). A retry after a lost response is 401 `SESSION_REQUIRED`, which the app treats as signed out. New contract types: `GlobalLogoutRequest` and `GlobalLogoutResult`.
  - `ManagementApi` is now shared by the read-profile and maintenance clients (separate credentials, single-flight tokens, 5-second timeouts, no redirects, optional caller abort signal).
  - `Auth0MaintenanceClient`: revokes a user's `refresh_token` and `rotating_refresh_token` device credentials per native client (re-listing until empty, at most 20 rounds) and deletes users. Outcomes are `done`, `retryable` or `permanent` with a short code, never identifiers. `maintenanceGatewayFromEnv` reads only `AUTH0_MAINTENANCE_CLIENT_ID/SECRET` and refuses the profile client's id. Deviation: `revokeGrants` takes a list of client ids instead of one.
  - `processRevocationJob` / `runSecurityJobsOnce`: a lost lease does nothing; a superseded job completes without calling Auth0; otherwise it revokes each alias's grants and lifts the hold. Provider outages keep the hold (no stale-authority fallback).
  - Worker entry `npm run worker:security -w gogospend-api` (`--once` for recovery) with `apps/api/.env.worker.example`. It logs counts only.
  - Runbook: [docs/operations/auth0-runbook.md](../operations/auth0-runbook.md) (scopes, hold semantics, stuck-job query and requeue, tenant-proof checklist).
- **RED against seams** (routine stubs, an empty job repository and a do-nothing maintenance client): unit 10 of 10 failed; database 16 of 32 failed. All on assertions, with no module errors. The pinned `logout_invalidates_existing_binding_before_provider_cleanup` received 200 for the old binding.
- **GREEN:** `npm run test -w gogospend-api -- --runTestsByPath src/auth/auth0-management.client.spec.ts src/auth/auth0-profile.client.spec.ts` → 21 of 21. `npm run test:db -w gogospend-api -- --runTestsByPath src/jobs/job.repository.integration.spec.ts src/accounts/session-revocation.integration.spec.ts src/database/migrations.integration.spec.ts` → 32 of 32. The job and revocation specs were stable over 3 repeated runs (18 of 18 each).
- **Test corrections:** each revocation test now clears the queue first, so one test's pending cleanup cannot be counted by another. The global-logout response is 202, not the 201 first written, because provider cleanup is still pending.
- **Full gate:** typecheck PASS, typecheck:app PASS, test:api PASS (29 suites, 370 tests), test:db PASS (9 suites, 119 tests), test:app PASS, test:unit PASS, test:render PASS (3), test:dev PASS, build PASS, export:web PASS, `git diff --check` PASS. No test databases left behind.
- **Tenant/native proof:** SKIPPED (E1/E2 not authorized). Checklist in the runbook.
- **Independent review** (after commit `27aa551`): one major finding, six minor and two nits. The reviewer confirmed old bindings, refresh grants and proofs cannot regain access, fencing and SKIP LOCKED are correct, lock order holds, and nothing leaks. Fixed in a follow-up commit, with 10 tests that failed first on assertions; two further tests (a bootstrap waiting behind the logout lock, and the role matrix for the routines) passed at once and stay as coverage:
  - **Major — a forged job could lift a hold.** Any `gogospend_jobs` login could read the queue and insert an `auth0_revoke_grants` job with empty client ids; finishing it deleted the hold with no Auth0 call. Now:
    - holds name their job (`pending_job_id`), and only that job can lift them;
    - RLS gives security kinds to `gogospend_security` only, so a generic jobs login sees and creates none;
    - the payload no longer stores subjects; the worker reads them per lease through `gogospend_revocation_subjects`.
  - **One lease clock per batch.** A slow first job let later jobs' leases expire unused. The worker now claims one job at a time; a lease that runs out mid-job is failed as retryable `lease_expired`.
  - **A 2-hour outage failed cleanup for good.** Revocation jobs now get 20 attempts (about 15 hours), and the worker logs an alert line for every terminal failure.
  - **Work on an expired lease.** The state, subjects and finish routines now refuse expired leases, and the maintenance client re-checks the abort signal before every call.
  - **Consent writes after logout.** `PolicyService.accept` and `setPrivacy` now take the account lock and call `assertActiveSession`. The policy spec now uses real session rows.
  - **Clients without sessions kept their grants.** The worker revokes for `AUTH0_ALLOWED_CLIENT_IDS` (now required in the worker environment) plus any client that held a session.
  - **`reauth_after` rounding.** It now rounds up to the next whole second, so no login from the logout second counts. Tests that sign in again wait for that boundary.
  - **Worker login.** The worker refuses to start unless its login is in `gogospend_jobs` and `gogospend_security` only.
  - Not changed: `gogospend_global_logout` still relies on its caller (`SessionRevocationService`) to consume the proof in the same transaction.
  - **RED → GREEN:** `session-revocation.integration.spec.ts` went from 10 of 21 failing to 21 of 21. Full gate after the fixes: typecheck PASS, typecheck:app PASS, test:api PASS (390), test:db PASS (163), test:app PASS, test:unit PASS, test:render PASS (3), test:dev PASS, build PASS, export:web PASS, `git diff --check` PASS; no test databases left. The fix suites (revocation, jobs, policies, migrations) pass 55 of 55, and the revocation spec was stable over 2 more runs. `job.repository.integration.spec.ts` now gives its second worker the security role too, because security jobs are invisible to a generic login.

## M1 — common command transaction and revision protocol

- **Migration `0005_commands`** (owner RLS on all four tables):
  - `command_receipts`, keyed by (account, command id): kind, schema version, a salted request digest, entity, id and version, outcome, state and revision. No amounts, notes, names or DTOs.
  - `entity_changes`: the committed change log, one group per command under one revision, ordered by ordinal. Snapshots are the only entity data in it.
  - `entity_heads`: each entity's latest version and state, so later commands and status lookups see deleted or purged entities without reconstructing data.
  - `audit_events`: command kind, session id, client id and up to 8 short codes. The app can insert but not read it.
  - **App access:** append-only. `entity_heads` can be updated only on version, state and revision.
- **Server:**
  - `CommandExecutor.run(ctx, input, mutate)` follows the planned order: account lock → `assertActiveSession` → current-policy re-check (unless the kind is exempt) → receipt replay or `409 IDEMPOTENCY_MISMATCH` → schema check (`422 COMMAND_SCHEMA_UNSUPPORTED`, nothing reserved) → mutation → change group, receipt and audit row → one commit.
  - `ChangeWriter.append` validates each snapshot against its entity's registered DTO validator, enforces the 1 MiB group budget (`413 COMMAND_TOO_LARGE`), allocates the revision under the lock, and refuses any head that does not move forward or that leaves `purged`.
  - `CommandRegistry`: domain modules register entities and command kinds with outcome, accepted schema versions and policy class.
  - `commandHeaders` reads `Idempotency-Key`, `X-GoGoSpend-Command-Schema` (missing or malformed becomes 0, which no command accepts) and `If-Match: "n"`.
  - `requireLiveEntity` returns `404 NOT_FOUND`, `409 ENTITY_DELETED` or `410 ENTITY_PURGED`.
  - `POST /v1/commands/status` (bound session; 1–100 lower-case UUIDs) returns `unknown` or the original acknowledgement with the entity's current state. Another account's ids look unknown.
  - `PolicyService.stateIn(tx)` and `assertPolicyAccepted` are shared by the guard and the executor.
  - New contract types: `EntityChange`, `CommittedChangeGroup`, `CommandStatus*`, `MAX_CHANGE_GROUP_BYTES` and `MAX_COMMAND_STATUS_IDS`.
- **Deviations:**
  - `MutationResult` gained an optional `audit` (short codes) for M2's opening-balance corrections.
  - The registry is an extra file, `command-registry.ts`.
  - `entity_heads` is an extra table beyond the planned command/change/audit tables; it backs status and `ENTITY_*` without reading domain tables.
  - The receipt digest was first an unkeyed sha256; after review it is an HMAC under `COMMAND_DIGEST_KEY` with a stored key id (see below). Receipts outlive purged payloads, so P5 should also drop digests after the outbox lifetime.
- **Fixture domain:** `testing/command-fixtures.ts` creates `fixture_purchases` in the disposable test database only, with the same owner RLS shape as real tables. It also provides `startV1App` for HTTP specs.
- **RED against seams** (an executor that only ran the mutation, empty receipts, a change writer returning `0` and a permissive entity check): 24 of 46 database tests failed on behaviour, with no module errors. The pinned `same_command_executes_once_after_lost_response` received 2 executions. One seam failure hung `afterAll` and left a test database; the commit-order test now releases its barrier in `finally`, and the leftover database was dropped.
- **GREEN:** `npm run test:db -w gogospend-api -- --runTestsByPath src/commands/command-executor.integration.spec.ts src/commands/command-status.integration.spec.ts src/database/migrations.integration.spec.ts` → 46 of 46. Executor spec stable over 3 repeated runs (19 of 19). `src/commands/command-protocol.spec.ts` → 20 of 20; it covers header, digest and registry rules and was written against the real helpers (not RED first).
- **Concurrency proofs** (real connections and barriers):
  - five concurrent same-key requests run the mutation once;
  - a command that waited behind a deletion committed first gets `403 ACCOUNT_UNAVAILABLE` with no mutation;
  - a second command blocks until the first commits, and revisions follow commit order.
- **Full gate:** typecheck PASS, typecheck:app PASS, test:api PASS (30 suites, 390 tests), test:db PASS (11 suites, 151 tests), test:app PASS, test:unit PASS, test:render PASS (3), test:dev PASS, build PASS, export:web PASS, `git diff --check` PASS. No test databases left behind.
- **Independent review** (after commit `981c740`): no blockers, two major findings, four minor, five nits and six test gaps. The reviewer confirmed transaction order, rollback, revision allocation, same-key concurrency, canonicalization, schema-version semantics, RLS/grants and status redaction. Fixed with `command-hardening.integration.spec.ts`: 12 of 17 tests (and 2 of 22 unit tests) failed first on assertions; the other 5 passed at once and stay as coverage (the same key for another kind, the exempt-policy path, the exact 1 MiB boundary, app grants, and a command waiting behind a global logout):
  - **Major — the target entity was not bound.** A key reused for another entity id given only in the route would have replayed the first entity's acknowledgement. Every command payload must now name its primary entity as `id` (services copy a route's `:id` into it), so the digest covers it, and the executor refuses an acknowledgement for any other entity.
  - **Major — the digest was a guessing oracle.** The salt sat in the same row, and the reviewer recovered an amount from a receipt in 29 ms. Receipts now carry `HMAC-SHA256(COMMAND_DIGEST_KEY)` and a `digest_key_id`. `COMMAND_DIGEST_PREVIOUS_KEYS` keeps rotated keys verifying replays for the outbox lifetime; once a key is dropped, its receipts no longer match. `COMMAND_DIGEST_KEY` is required: v1 startup fails without it, and `dev:v1` generates one unless it is set.
  - **Database guards:** triggers allow change, receipt, audit and head rows only at the account's current revision, so a stray row cannot occupy the next revision and wedge the account. New heads start at version 1 and active; heads only move forward and never leave `purged`.
  - **ChangeWriter** validates the parsed JSON it stores (a `toJSON` cannot show the validator one thing and store another), and requires each snapshot's `id` (and `version`, when present) to match its change. Sync must serialize groups with the same `changeGroupBytes` serializer (note for S1).
  - **Status:** the lookup waits (`FOR SHARE`) for a command already holding the account lock. The contract now says `unknown` means "not committed at lookup time"; the only safe action is to resend the same command id.
  - **Nits fixed:**
    - owner transactions are explicitly `READ COMMITTED`, and replay holds under a `REPEATABLE READ` login default;
    - nested owner transactions are refused (AsyncLocalStorage);
    - `committed_at` uses `clock_timestamp()`.
  - **Not changed:**
    - NUL characters in snapshot strings: domain validators (M2/M3) reject control characters with 422;
    - status keeps the plan's `CommandStatus` shape, with no `current_version`.
  - **Full gate after the fixes:** typecheck PASS, typecheck:app PASS, test:api PASS (392), test:db PASS (180), test:app PASS, test:unit PASS, test:render PASS (3), test:dev PASS, build PASS, export:web PASS, `git diff --check` PASS. No test databases left behind.

## M2 — wallets, opening balances and stable categories

- **Migration `0006_wallets_categories`:**
  - `wallets` and `categories` keyed by (account, id) with owner RLS.
  - **Database checks:**
    - names and labels are trimmed, 1–80 characters, with no control characters;
    - opening balances are 0 to 99,999,999,999 satang;
    - tracking starts on or after 1970-01-01;
    - currency is THB only;
    - built-in keys match their type, and each key appears at most once per account.
  - `UNIQUE (account_id, id, type)` is the target for M3's foreign key, so an expense can only point at an expense category.
  - **App access:** no DELETE grant. A category's type and built-in key, and a wallet's currency, are not updatable at all.
- **Contracts:**
  - `v1/wallets.ts`: `WalletSnapshot`, `WalletDto` (with `balance_minor`), create/update requests, `WALLET_CORRECTION_REASONS` and `isWalletSnapshot`.
  - `v1/categories.ts`: `CategoryDto`, create/update requests, `CATEGORY_TYPES`, `CATEGORY_COLORS` (the existing pastel palette), `BUILTIN_CATEGORIES` and `isCategorySnapshot`. The built-ins use the app's existing keys and hues (food, travel, household, bills, shopping, fun; salary, bonus, side job, gift); cashback is a separate ledger and is left out.
  - `normalizeName` (NFC, trimmed, 1–80 code points, no control characters) and `validateTrackingStart` (Gregorian, 1970 to today in Bangkok).
  - `ApiProblem.current` carries the current record on `VERSION_CONFLICT`.
- **Endpoints:** every write is an M1 command, and edits need `If-Match`.
  - Wallets: `GET /v1/wallets`, `GET /v1/wallets/:id`, `POST /v1/wallets`, `PATCH /v1/wallets/:id`, `POST /v1/wallets/:id/archive` and `/unarchive`.
  - Categories: `GET /v1/categories`, `POST /v1/categories/builtins`, `POST /v1/categories`, `PATCH /v1/categories/:id`, `POST /v1/categories/:id/archive` and `/unarchive`.
  - Another account's ids, and malformed ids, are 404.
- **Rules:**
  - A stale version is `409 VERSION_CONFLICT` with the current record.
  - A zero opening balance is not income.
  - Archiving a wallet needs a zero derived balance (`walletBalances`; M3 adds records).
  - Archived entities stay readable and cannot be edited until unarchived.
  - A built-in can be relabelled and reverted to its localized name; a custom category always has a label.
  - Opening or tracking-start corrections may carry `correction_reason`, recorded as an audit code. M3 makes it required once records exist.
- **Built-in seeding:** the command id and the ten category ids are derived from the account id (`derivedUuid`, a v8 UUID). Repeats, and two devices seeding at once, replay one command and create one set. The client's schema header is not used, because the server writes the payload.
- **Deviations:**
  - Service methods take `(ctx, CommandHeaders, id, body)` rather than a prebuilt `CommandInput`. Each service validates and normalizes the body and copies the route id into the payload, as M1's target-id rule needs.
  - Wallets have no type or colour yet: the plan's `WalletDto` has neither, and wallet screen visuals are not approved.
  - Seeding is an explicit `POST /v1/categories/builtins` after policy acceptance, not a bootstrap side effect, because bootstrap has no binding and usually precedes acceptance.
  - The pinned `renaming_category_preserves_historical_reference` moves to M3, which adds history.
  - No OpenAPI document exists for v1 yet. Responses are checked against the shared snapshot validators in tests.
- **RED against seams** (services returning empty lists and fake acknowledgements; real controllers, migration and contracts): 43 of 47 wallet and category tests failed on behaviour, with no module errors.
- **GREEN:** `npm run test:db -w gogospend-api -- --runTestsByPath src/wallets/wallets.integration.spec.ts src/categories/categories.integration.spec.ts src/database/migrations.integration.spec.ts` → 61 of 61. `src/v1/contracts.spec.ts` → 79 of 79, including new name, date, snapshot and built-in tests written against the real validators.
- **Full gate:** typecheck PASS, typecheck:app PASS, test:api PASS (396), test:db PASS (227), test:app PASS, test:unit PASS, test:render PASS (3), test:dev PASS, build PASS, export:web PASS, `git diff --check` PASS. No test databases left behind.

## M3 — expense, income and transfer records with edit, delete and restore

- **Migration `0007_transactions`:**
  - One row per logical record (a transfer is never two rows), keyed by (account, id) with owner RLS.
  - **Database checks:**
    - amounts are 1 to 99,999,999,999 satang;
    - dates are 1970 or later;
    - notes are at most 500 characters and merchants at most 120 (one line);
    - entry and transfer columns are exclusive, and a transfer needs two different wallets.
  - Composite foreign keys go to the owner's wallets, and from (category, generated `category_type`) to categories, so an expense can only use an expense category.
  - Partial indexes cover active rows per wallet side and `(account, occurred_on, id)` for M4 history.
  - **App access:** no DELETE grant; the type cannot be updated.
- **Contracts (`v1/transactions.ts`):**
  - `TransactionDto` is a union of `EntryDto` (`wallet_id`, `category_id`) and `TransferDto` (`source_wallet_id`, `destination_wallet_id`), with `deleted_at` and `version`.
  - `CreateTransactionRequest` is discriminated on `type`; there is also `UpdateTransactionRequest`.
  - Helpers: `normalizeNote` (multi-line, `\r\n` → `\n`), `normalizeMerchant` (one line), `isTransactionSnapshot`, and `RESTORE_WINDOW_DAYS = 30`.
- **Endpoints:** `GET /v1/transactions/:id`, `POST /v1/transactions`, `PATCH /v1/transactions/:id`, `DELETE /v1/transactions/:id` and `POST /v1/transactions/:id/restore`. The last three need `If-Match`.
  - Another branch's fields are `UNKNOWN_FIELD`, as are `owner_id` and `account_id`.
  - A stale edit is `409 VERSION_CONFLICT` with the current record. Editing a deleted record is `409 ENTITY_DELETED`; a purged one is `410 ENTITY_PURGED`.
  - Restoring after 30 days is `409 ENTITY_DELETED` (`errors.restore_expired`).
- **Reference rules** (checked under the account lock):
  - wallets and categories must belong to the owner (otherwise 422 on the field, with no existence leak);
  - newly referenced wallets and categories must not be archived;
  - a restore re-checks every reference;
  - the category type must match;
  - the date must be no earlier than every referenced wallet's tracking start and no later than today in Bangkok.
- **Balances:** `BalanceQuery.forWallets` derives each balance in SQL numeric from the opening balance plus active records, returned as exact strings; balances may be negative. Wallets now use it.
- **Wallet rules once records exist:**
  - changing the opening balance or tracking start needs a `correction_reason`, which is recorded as an audit code;
  - tracking cannot start after an existing active record;
  - archiving needs a zero balance with records included.
- **Pinned tests:**
  - `golden_transfer_reconciles_both_wallets` checks cash `235000`, daily `1870000` and total `2105000`, and matches an independent SQL recomputation;
  - `renaming_category_preserves_historical_reference` (moved from M2) reads the record back by id; M4 repeats it through history.
- **Other proofs:**
  - two identical 6,500 coffees with different ids and keys both remain;
  - editing, deleting and restoring the golden transfer moves both wallets together and keeps the total;
  - a refused transfer edit changes neither wallet and leaves no receipt or revision;
  - of two edits from the same version, exactly one wins and the account revision moves by exactly one;
  - a balance of `99,999,999,999 × 90,101` (above `Number.MAX_SAFE_INTEGER`) is returned as an exact string.
- **Deviations:**
  - One `POST /v1/transactions` takes a union on `type` instead of a separate transfer endpoint; the plan's `transfer(ctx, …)` is the transfer branch of `create`.
  - The type of a record cannot be edited; changing it means deleting and recreating.
  - Deleting is allowed even when a referenced wallet is now archived, which can make an archived wallet's balance non-zero. Archive only checks the balance when it happens.
  - Unchanged references to a since-archived wallet or category do not block edits; only newly referenced ones must be active.
- **RED against seams** (a do-nothing service and opening-only balances; real controller, migration and contracts): 34 of 49 failed on behaviour, with no module errors. The passes were the migration suite and the database-level guards.
- **GREEN:** `npm run test:db -w gogospend-api -- --runTestsByPath src/transactions/transactions.integration.spec.ts src/transactions/reconciliation.integration.spec.ts src/wallets/wallets.integration.spec.ts` → 67 of 67. Both transaction specs were stable over 2 more runs (35 of 35). `src/v1/contracts.spec.ts` → 81 of 81.
- **Full gate:** typecheck PASS, typecheck:app PASS, test:api PASS (398), test:db PASS (262), test:app PASS, test:unit PASS, test:render PASS (3), test:dev PASS, build PASS, export:web PASS, `git diff --check` PASS. No test databases left behind.

## M4 — budgets, complete filtered history and month summary

- **Migration `0008_budgets`:**
  - `monthly_budgets`: one per (account, month), holding the derived entity id, the overall limit and a version.
  - `budget_category_limits`: positive sublimits. Each references `(category, 'expense')` by composite foreign key, so only an owned expense category can carry a sublimit, and the (account, month, category) key rules out duplicates.
  - A deferred constraint trigger on both tables refuses, at commit, sublimits that add up to more than the overall limit, whichever side changed.
  - Owner RLS. The app may delete sublimits (a budget is replaced as a whole) but never a month's budget row.
- **Contracts:**
  - `v1/budgets.ts`: `BudgetDto`, `SetMonthlyBudgetRequest`, `parseMonth` and `isBudgetSnapshot`.
  - `v1/history.ts`: `HistoryFilter`, `Totals`, `FilteredTotals` and `HistoryPage`, with a default limit of 50 and a maximum of 200.
  - `v1/summary.ts`: `MonthSummary`, `CategoryTotal` and `BudgetUsage`.
- **Endpoints:**
  - `GET /v1/budgets/:month` and `PUT /v1/budgets/:month`. PUT replaces the whole month's budget in one M1 command: without `If-Match` it creates, and a second create is `409` with the current budget; with the current version it replaces. The budget id is derived from (account, month).
  - `GET /v1/history?from&through[&wallet_id&category_id&type&query&sort&limit&cursor]`.
  - `GET /v1/summary?month=YYYY-MM`.
- **Budget rules:**
  - Overall and category limits are positive and within the cap.
  - Duplicate categories, sublimits summing above the overall limit (from either side), income categories, other accounts' categories and newly added archived categories are refused with 422 on `category_limits`.
  - A limit on a category that was renamed or archived after it was set stays, and re-setting it is allowed.
  - Uncapped categories still count toward the overall budget. Transfers and opening balances never consume a budget.
- **History:**
  - Keyset paging on (occurred_on, id), in the requested order.
  - The opaque cursor carries the last row, the first page's account revision and a digest of the filter and order; a malformed cursor, or one from another filter or order, is 422.
  - `refresh_suggested` is set when the account changed since the first page.
  - Rows, totals over the whole filter (`count`, `income_minor`, `expense_minor`, `balance_minor` = income − expense, and `by_wallet` net with transfers on both sides) and `as_of_revision` all come from one `REPEATABLE READ READ ONLY` owner transaction. This is a new `snapshot` option on `withOwnerTransaction`.
  - Filters: wallet (either side of a transfer), category, type, case-insensitive note/merchant text (with `%` and `_` escaped), and inclusive dates. Deleted records are left out.
- **Summary:**
  - Totals for the Bangkok calendar month, per-category totals (renamed and archived categories keep their ids) and budget usage.
  - Budget usage has `spent_minor` (all expenses), `remaining_minor` (may be negative) and per-category spent and remaining.
  - All values are decimal strings computed in numeric or BigInt; no percentages are sent.
- **Pinned and boundary tests:**
  - `all_451_records_are_pageable`: 451 records on three tied dates give 451 unique ids in 10 pages of 50 (and 200/200/51 ascending), in exact key order.
  - The golden month totals: income `2800000`, expense `1245000`, net `1555000`, cash `-168200`, daily `1723200`. Budget usage: spent `1245000`, remaining `-245000`, food `18200` of `50000`.
  - Month and year boundaries.
  - History totals agree exactly with the sum of all pages' rows, for every filter.
- **Query plans** (1,000,000 synthetic records, 50 accounts × 20,000, in a throwaway database since dropped):
  - first and keyset history pages: index-only backward scan of `transactions_history_idx`, about 0.2 ms;
  - wallet-filtered history: a BitmapOr over the three wallet-side indexes, then a top-N sort, about 2 ms for 6,679 matching rows;
  - month totals: the history index, about 0.1 ms;
  - wallet balance: `transactions_wallet_idx`, about 0.7 ms.
  - A planned `(account, type, occurred_on)` index was never chosen, so it was removed, as the plan requires.
- **Deviations:**
  - `GET /v1/summary` has its own `summary.controller.ts`.
  - History and summary controllers live in `BudgetsModule`.
  - `BudgetService` methods take `(ctx, CommandHeaders, month, body)`.
  - Budget create and replace are two command kinds (`budget.create`, `budget.replace`) so each has a fixed outcome.
  - A month's budget cannot be deleted; setting it again replaces it.
- **RED against seams** (empty history and summary, fake budget acknowledgements; real controllers, migration and contracts): 37 of 52 failed on behaviour, with no module errors.
- **Test correction:** one budget test used an overall limit of 2 with the default 50,000 food sublimit. That is a validation error, which correctly comes before the conflict check, so the test now uses 2,000,000.
- **GREEN:** `npm run test:db -w gogospend-api -- --runTestsByPath src/budgets/budgets.integration.spec.ts src/history/history.integration.spec.ts src/summary/summary.integration.spec.ts src/database/migrations.integration.spec.ts` → 52 of 52. The three M4 specs were stable over 2 more runs (38 of 38). `src/v1/contracts.spec.ts` → 83 of 83.
- **Full gate:** typecheck PASS, typecheck:app PASS, test:api PASS (400), test:db PASS (300), test:app PASS, test:unit PASS, test:render PASS (3), test:dev PASS, build PASS, export:web PASS, `git diff --check` PASS. No test databases left behind.

## Review fixes for M2 and M3

- **M2 review** (commit `12c1a8f`): one major finding, three minor and four nits; no blockers. The reviewer confirmed RLS, ownership, money and date handling, idempotency normalization and archive rules.
- **M3 review** (commit `ea1be96`): one major finding, three minor and six nits; no blockers. The reviewer confirmed balances (no double counting; exact numeric), composite references, lock order, restore rules and receipt privacy.
- **Fixed, with tests that failed first** (`src/transactions/money-hardening.integration.spec.ts`: 9 of 15 failed; `src/v1/contracts.spec.ts`: 3 of 85 failed; all on assertions). The other 6 hardening tests passed at once and stay as coverage: equivalent retries replay, receipts and audit hold no note or merchant, delete needs `If-Match` and is 404 for another account, a failure after the row is written rolls everything back, a three-way edit/delete/edit race commits exactly one with one receipt and one revision, and records read back over HTTP match SQL.
  - **M2 major — built-in seeding broke after key rotation, reordering or a new built-in.** `POST /v1/categories/builtins` is now an idempotent ensure that returns the category list. It inserts only the missing built-ins, as one command whose id is derived from the missing keys, and writes nothing when none are missing. It no longer depends on an old receipt or digest key, and a built-in added later is seeded on the next call.
  - **M3 major — delete, correct, restore skipped the wallet setup rules.** `BalanceQuery.firstRecordOn` now counts records deleted within the 30-day restore window, so a correction still needs a reason and tracking cannot start after a restorable record.
  - **Category snapshots** accept any stored `#RRGGBB`; the palette is enforced only on input, so a palette change cannot strand existing categories.
  - **Text hygiene:** names, notes and merchants refuse lone surrogates and bidirectional controls. Names must contain something visible; an invisible note or merchant becomes null.
  - **`correction_reason`** is refused unless the opening balance or tracking start changes.
  - **Replays report the current state:** a replayed acknowledgement reports the entity's current state (for example `deleted`), as status lookups already did.
  - **Restore** checks the version before the deleted state, so a stale restore is `409 VERSION_CONFLICT` with the current record. The 30-day window is computed in SQL.
  - **Moving a record** to a wallet that starts later reports `DATE_BEFORE_TRACKING_START` on the wallet field when only the wallet changed.
  - **Purged ids:** a record id whose record was purged is `410 ENTITY_PURGED` instead of a 500.
  - **`DateStyle`:** owner transactions pin `DateStyle` to `ISO, YMD`, and date reads use `to_char(..., 'YYYY-MM-DD')`.
  - **Midnight flake:** "tomorrow" in tests is computed 36 hours ahead.
- **Not changed** (recorded here):
  - Derived built-in ids use no per-account secret. They reveal nothing beyond an internal account id, which is itself not public.
  - No `categories.repository.ts`: the queries live in the service.
  - A PATCH that sets current values still bumps the version.
  - Editing the amount of a record on an archived wallet, like deleting one, can make that wallet's balance non-zero.
  - Change-log snapshots contain notes and merchants by design; P5 must purge them.
- **Full gate:** typecheck PASS, typecheck:app PASS, test:api PASS (402), test:db PASS (315), test:app PASS, test:unit PASS, test:render PASS (3), test:dev PASS, build PASS, export:web PASS, `git diff --check` PASS. No test databases left behind.

## Review fixes for M4, and a local dev check

- **M4 review** (commit `b3ec54f`): two major findings, two minor, five nits; no blockers. The reviewer confirmed keyset paging in both orders, cursor binding, the refresh signal, text-search escaping, totals agreeing with rows, the snapshot transaction's integrity checks, summary month bounds and arithmetic, budget validation, and that no string-built SQL fragment is injectable.
- **Fixed, with tests that failed first** (`src/budgets/m4-hardening.integration.spec.ts`: 7 of 9 failed on assertions). The other two (history and summary use the snapshot option, at REPEATABLE READ and read-only; usage keeps a sublimit whose category was later archived) passed at once and stay as coverage.
  - **Major — deleting an account with a budget sublimit failed** (23503): the category foreign key was checked before the cascade reached the sublimits. `budget_category_limits.account_id` now cascades directly from `accounts`. The sublimit trigger no longer fires on DELETE, so a deletion routine run by another role (such as the jobs worker) is not refused at commit.
  - **Major — write skew past the sublimit backstop:** a concurrent parent lowering and child insert could both commit. The trigger now locks the month's budget row (`FOR NO KEY UPDATE`) before summing, so the later committer waits and sees the earlier one's commit. This was proven over 5 rounds with two real transactions released together: exactly one fails and sublimits never exceed the overall limit. API writes were already serialized by the account lock; this protects any other write path.
  - **A forged or garbled cursor date** (for example `2026-02-30`) is now a 422 on `cursor`, not a 500.
  - **Replacing a month that has no budget** is `404 NOT_FOUND`, and a stale replace still carries `current`. The earlier M4 test expected 409 here and was updated.
  - **Nits:**
    - `category_limits: null` is refused;
    - `/v1/summary` refuses unknown query parameters;
    - a history date before 1970 is `INVALID_DATE`;
    - the `by_wallet` contract now says it is the net of the matching records only.
  - **Not changed:** the Drizzle definitions describe columns only (the drift test compares columns and nullability); keys and foreign keys live in the reviewed SQL.
- **Local dev database:** `dev:v1` had applied the first version of `0008` to the local `gogospend_v1`. I confirmed every table held 0 rows, dropped and recreated it, and applied all 8 migrations.
- **Manual `npm run dev:v1`:** before the database was recreated, migrations `0004`–`0008` applied on start. `GET /v1/policies` returned `[]` with `no-store`. `GET /v1/wallets`, `/v1/history`, `/v1/summary` and `/v1/budgets/:month` returned 401 without a token, and logs showed only method, route and status.
- **Full gate after the fixes:** typecheck PASS, typecheck:app PASS, test:api PASS (402), test:db PASS (324), test:app PASS, test:unit PASS, test:render PASS (3), test:dev PASS, build PASS, export:web PASS, `git diff --check` PASS. No test databases left behind.

## M5 — first online app journey on the v1 API (local work; M5 not complete)

- **Status:** the app's money screens now run on the v1 API in local tests. M5 is **not complete**:
  - SKIPPED until E1/E2 and F5: native builds proving real authorized writes and restart; Thai/English layout, screen reader, focus and reduced motion on devices.
  - SKIPPED (E2 visual review): the visual review of the new states — loading, empty account and first wallet, errors, upgrade required, terms required, signed out, unconfirmed save, conflict, deleted and undo.
  - F5 (native Auth0 and its credential provider) is not built. The v1 transport takes a credentials port shaped on F5's interface; until F5 exists it reads the existing session seam, so an unconfigured install stays signed out.
- **Money** (`src/spend/v1/money.ts`):
  - `formatMinor(value, locale)` gives `฿1,234.56` / `-฿1,234.56` in both Thai and English, through BigInt only, exact beyond `Number.MAX_SAFE_INTEGER`, and refuses non-canonical input.
  - `parseAmountInput(text, locale)` accepts an optional `฿`, correctly grouped thousands, up to two decimals and Thai digits (Thai locale). It refuses anything ambiguous (`1,5`, `.5`, `007`, signs, exponents, inner spaces) with a typed problem: `empty`, `invalid`, `too_precise` or `too_large`.
  - `minorToInputText` gives exact edit-field text.
- **Transport** (`createV1Transport` in `src/api/client.ts`):
  - Every request sends the access token, `X-GoGoSpend-Session` and `X-GoGoSpend-Client`; every command adds `Idempotency-Key`, `X-GoGoSpend-Command-Schema: 1` and `If-Match` when versioned.
  - A command whose response is lost is resent byte-identical with the same key, up to twice.
  - A response that arrives after the session epoch changed is dropped (`session_changed`).
  - Problems map to typed outcomes: `upgrade_required` (426, never a sign-out), `policy_required`, `conflict` (with `current`), `deleted`, `purged`, `invalid` (with fields), `rate_limited` (with retry-after), and so on.
  - Signed-out, unbound and web (no native client version) requests fail before any network call.
  - Only https or loopback http base URLs are accepted.
  - The legacy `/spend` client is untouched and is used only by the legacy screens.
- **Resources** (`src/spend/v1/resources.ts`, `SpendV1Resources`):
  - Methods: wallets, createWallet, categories, ensureBuiltinCategories, createTransaction, createTransfer, transaction, update/delete/restoreTransaction, history, summary, budget (404 → null) and commandStatus.
  - Every response is checked against the exact shared DTO shape, so number money or unknown fields are refused, never coerced.
- **View models** (`viewModels.ts`): category names (custom label, or the translated built-in name), exact wallet totals, signed record rows with spoken labels ("Expense ฿65.00"), month ranges, and Bangkok dates.
- **Screens** (`src/screens/v1/`), using the existing theme tokens and copy system:
  - **Home:** total and wallet balances, this month's money in and out, the latest entries, Add and See all. An empty account gets an explicit first-wallet form (name, opening balance — "not income" — and tracking start); nothing is created by default.
  - **Add:** expense, income or transfer with owned wallet and category chips. It is saved as one immutable command, and success is shown only after the acknowledgement. An unconfirmed save freezes the entry and resends the same command. A definite refusal (422) shows field problems, and the corrected entry gets a new key. An upgrade requirement blocks saving and keeps the draft. Offline saving stays off.
  - **Transactions:** month navigation, type filter, keyset "Load more", and month totals. Edits carry the version the user saw; a conflict offers "Reload" or "Apply my change" (a new command at the server's version), never a silent overwrite. Delete hides the entry after the acknowledgement, with Undo.
- **Routes:** `/spend` → Home, `/spend/all` → Transactions, new `/spend/add` → Add. The unconverted legacy screens are reachable only with `EXPO_PUBLIC_LEGACY_SPEND=1`, never as a runtime fallback. `EXPO_PUBLIC_V1_API_URL` defaults to `http://localhost:8091`.
- **Session seam:** `SpendSession` gained an optional `binding` and an installation-local epoch. The epoch moves on sign-out, account switch or a new binding, never on a token refresh.
- **Copy:** 61 new English/Thai catalog entries. The Thai copy is a first draft for the founder's or a translator's pass on money screens. Vietnamese falls back to English for these strings.
- **Deviations:**
  - The v1 wiring lives in a new `src/api/sharedV1.ts`. `sharedClient.ts` stays the legacy client, so legacy screens and their tests do not load native modules.
  - Screens take resources from `SpendV1Context`.
  - `/spend/add` is a new route.
  - Home has a minimal first-wallet form because the journey needs a wallet. Wallet list and settings screens still wait for approved visuals; their ports are in `SpendV1Resources`.
- **RED → GREEN** (assertion-level RED against seams, no module errors):
  - `money.test.ts`: 0 of 6 passing, then 6 of 6, including the pinned `large_minor_amount_is_formatted_exactly` (`parseAmountInput('999999999.99','en') === '99999999999'`).
  - `resources.test.ts`: 0 of 9, then 9 of 9.
  - Render tests (Home, Add, Transactions): 0 of 24, then 24 of 24.
  - `viewModels.test.ts` (5 tests) was written against the real functions (not RED first).
- **App adapter against the real API** (`apps/api/src/v1/app-adapter.integration.spec.ts`, 2 tests): the app's own transport, resources, money and view models drive the golden journey against the real v1 server on a disposable database. It covers wallets, records and a transfer replayed as the same command; the exact balances `฿2,350.00`, `฿18,700.00` and total `฿21,050.00`; month totals; history rows; a versioned edit; a stale-edit conflict carrying `current`; delete and undo; command status; and a build below the minimum version getting `upgrade_required` (426), not a sign-out.
- **Full gate:** typecheck PASS, typecheck:app PASS, test:api PASS (402), test:db PASS (326), test:app PASS (11), test:unit PASS (31), test:render PASS (27), test:dev PASS, build PASS, export:web PASS, `git diff --check` PASS. No test databases left behind.

## Review fixes for M5

- **M5 review** (commit `83f3b10`): three major findings, eight minor, five nits; no blockers. The reviewer confirmed:
  - money exactness (34 probed inputs, BigInt only);
  - byte-identical command retries and success shown only after the acknowledgement;
  - epoch drops, and 426 never treated as a sign-out;
  - strict DTO validation, with no `/spend` fallback and no name-based wallets;
  - full English/Thai copy coverage.
- **Fixed, with tests that failed first:** `src/screens/v1/M5Hardening.render.test.tsx` (9 of 11 failed) and `src/spend/v1/resources.test.ts` (4 of 13 failed), all on assertions. The two render tests that passed at once stay as coverage: a lost response resolves by replay, and a failed reload after an acknowledged edit is a load problem. The fake port now keeps receipts by key (replays), refuses an existing record id under a new key with a 409, and can commit a write and then lose or garble its response.
  - **Major — a save that may have committed was reported as failed** and its key freed (the duplicate-expense risk):
    - a 5xx gateway page is now `unavailable`;
    - a garbled acknowledgement (`invalid_response`) is unconfirmed, keeping its key and retrying the same command;
    - a session change after sending blocks resending under another identity;
    - a create refused because its own record id already exists counts as saved.
  - **Major — a read after an acknowledgement could make the save look unconfirmed.** Reading back is now a separate load whose failure is a load problem. Edits, deletes and undo reload the list instead of a separate entity read.
  - **Major — one shared key slot, and unconfirmed edits were editable.** Command keys are now kept per action (`create`, `edit:<id>`, `delete:<id>`, `restore:<id>`). An unconfirmed edit freezes its fields, with "Try again" only and no Cancel. An unconfirmed delete keeps its key while other entries are edited.
  - **Conflicts:** the server's current record is validated (`isTransactionSnapshot`, same id) and its values are shown ("It now reads ฿13,000.00 (Rent and water).") before "Apply my change". An unusable one reloads instead of looping.
  - **Already deleted:** deleting an entry another device already deleted shows "This entry was already deleted." and reloads.
  - **Pagination:** edits, deletes and undo reload as many entries as were on screen (up to 200), so "Load more" pages no longer vanish. "Load more" has a busy state, drops superseded results and clears its notice on success.
  - **Transport:**
    - a command retry stops with `session_changed` once the epoch moves, with a short backoff between retries;
    - acknowledgements must name the request's command and entity;
    - `FORBIDDEN` is `signed_out` and `RESYNC_REQUIRED` is `unavailable` (no longer "check the highlighted fields").
  - **Locale:** the root layout follows the device locale (Thai, English or Vietnamese) instead of hard-coded English, and syncs the Thai font. The first-wallet form parses Thai digits. A Thai render test covers both.
  - **Accessibility:** labelled rows set `accessible`, so VoiceOver/TalkBack read the label ("Bills, Expense ฿12,268.00") rather than the children.
  - **Copy and edges:**
    - day headers show formatted dates;
    - "Sign in again to save." no longer promises a draft survives the sign-out redirect;
    - policy and sign-out states no longer disable Save;
    - only an upgrade or a session change does;
    - `/spend/import` redirects to `/spend` unless `EXPO_PUBLIC_LEGACY_SPEND=1`.
  - **Test updates:** two original Transactions tests now expect the list reload (not a separate entity read) and the conflict message with current values. Two transport tests now reply with acknowledgements that match their own command.
- **Not changed (recorded):**
  - Tying frozen drafts to the session epoch at the screen level waits for F5's session machine; the transport already refuses to resend across an epoch change.
  - A device keyboard whose decimal key is "," (for example Vietnamese) could type "1,500" meaning 1.5. Money is parsed in the Thai/English convention, and this remains a device-review item.
  - `EXPO_PUBLIC_V1_API_URL` defaults to local development and must be set for real builds; plain http to anything but loopback is refused.
- **Full gate after the fixes:** typecheck PASS, typecheck:app PASS, test:api PASS (402), test:db PASS (326), test:app PASS (11), test:unit PASS (35), test:render PASS (38), test:dev PASS, build PASS, export:web PASS, `git diff --check` PASS. No test databases left behind.

## P1: generic job runtime and private object publication

- **Migration `0009_jobs_storage`:**
  - `jobs` takes any identifier kind (security kinds stay visible to `gogospend_security` only), a `cancelled` state, `max_runtime_seconds` (10 s–24 h, default 900) and `attempt_started_at`. A lease cannot be extended past `attempt_started_at + max_runtime_seconds`.
  - `object_publications`: every key is registered (`reserved`) before its PUT, with the publisher's final deadline. Only the worker role can see it.
  - New group role `gogospend_leased_read` with no table grants. It reads only through `gogospend_leased_read_open`, `gogospend_leased_high_water` and `gogospend_leased_entities`. Each call checks the job, its current unexpired lease, purpose = job kind (`sync_snapshot` or `export`), the job's lifecycle generation and an active account.
  - App routines (owner transaction, under the common account lock): `gogospend_enqueue_account_job` (own account, user-startable kinds only) and `gogospend_cancel_account_jobs` (never security cleanup).
  - Worker routine `gogospend_lock_current_job`: takes the account lock and the job row, then checks that the lease, account and generation still hold.
- **Job runtime** (`src/jobs`):
  - `JobRepository` gains `heartbeat`/`extend`, `isHeld`, `cancelAccount`, `requeue` (failed jobs only, with a fresh attempt budget) and `backlog` (counts and oldest age, no payloads). `complete` can run inside a caller's transaction.
  - Lease budgets count only elapsed local time against the database-granted duration, so worker/database clock skew cannot stretch a lease.
  - `HandlerRegistry` refuses security kinds and duplicates.
  - `JobWorker` runs one job at a time. Heartbeats default to every 10 s on a 30 s lease and keep `lease.signal`/`deadline` in step. A handler that throws becomes a retryable `handler_error` (or `handler_timeout`). One that returns still holding its lease fails terminally as `handler_incomplete`. It claims only registered kinds.
- **Storage** (`src/storage`):
  - `ObjectStore` adapters accept only server-shaped keys (no `..`, leading `/`, spaces or uppercase purpose) and never offer a URL or presign.
  - `MemoryObjectStore` is the deterministic failure adapter (`failNext`: error before acting, or crash after the PUT landed).
  - `S3ObjectStore` uses SigV4 with no new dependency. It matches AWS's published GET-object signature vector. PUTs are conditional (`If-None-Match: *`, 412 → `exists`), and the body hash is both the signed payload hash and `x-amz-meta-sha256`, which `get` verifies. Errors carry only a code.
  - `objectStoreFromEnv`: production needs `R2_*` with an https origin and a bucket outside `gogospend-test-*`. `OBJECT_STORE=memory` is local only.
  - `ObjectPublicationService`: `reserveKey` (committed before the PUT); `finishWithObjects` (HEAD-verifies, then one READ COMMITTED transaction: lock and recheck, publish, complete); `sweep` (registry-first deletion of reservations past their deadline and expired objects, batched with SKIP LOCKED, then an orphan pass over the store).
- **Leased reads** (`LeasedAccountRead.withSnapshot`): one `REPEATABLE READ READ ONLY` transaction on the leased-read login. Denials surface as `LeasedReadDenied`. Publication rechecks under lock, because a lease cancelled after the snapshot began still reads inside it.
- **Worker process:** `npm run worker:jobs -w gogospend-api` (`src/worker.ts`). It uses two logins, checked at startup by `assertLoginRoles`: `DATABASE_URL` must be in exactly `gogospend_jobs`, and `LEASED_READ_DATABASE_URL` in exactly `gogospend_leased_read`. It runs a periodic sweep and logs counts only for failed jobs and for kinds no handler runs. The new `.env.jobs-worker.example` lists its settings. The security worker's login check now uses the same helper, so it also refuses a leased-read membership.
- **Storage contract script:** `npm run test:storage-contract -w gogospend-api` sets `STORAGE_CONTRACT_SCRIPT=1`. With `STORAGE_CONTRACT_TARGET=r2-test` it adds real R2 as a third contract target. It refuses to start without the `R2_TEST_*` settings, without an https endpoint, or with a bucket outside `gogospend-test-*`. Without the target, it and the normal suite run the failure adapter and a loopback fake S3 and never read R2 settings. Checked locally: with the target set and no settings, it fails before any test.
- **Deviations:**
  - The worker is a plain Node process like the security worker, so no `jobs.module.ts` was needed.
  - `storage.module.ts` waits for S1, the first API route that reads stored objects.
  - The security worker keeps its own loop. It already uses the same fenced lease protocol and table, and security kinds cannot run in the generic worker by design.
  - `dev:v1` does not start the job worker yet, because no generic handler exists before S1.
- **RED → GREEN** (assertion-level RED against seams, no module errors):
  - `s3-object-store.contract.spec.ts`: 22 failed of 25, then 25 passed.
  - DB specs (`job.repository`, `object-publication`, `leased-account-read`, `migrations`): 27 failed of 43, then 43 passed. The existing lease tests failed too until claims set `attempt_started_at`.
  - Worker wiring: `object-store-config.spec.ts` 4 failed of 4, then 4 passed; the login-role test failed 1 of 16, then 16 passed.
  - Pinned `late_cancelled_output_is_not_published`: the account's jobs are cancelled while the PUT is in flight; completion returns false, nothing is published and the sweep deletes the object.
- **Hosted gate:** SKIPPED. Real R2 (private access, ownership, expiry, denial for backup/control buckets, worker kill against R2) needs the E1-authorized test scope. P1 is not complete for P2a uploads or beta until it passes.
- **Full gate:** typecheck PASS, typecheck:app PASS, test:api PASS (431), test:db PASS (347), test:app PASS (11), test:unit PASS (35), test:render PASS (38), test:dev PASS (7), build PASS, export:web PASS, `git diff --check` PASS. No test databases left behind.

## S1: ordered deltas and consistent snapshots (server)

- **Contract** (`packages/contracts/src/v1/sync.ts`):
  - `SyncChangesPage`, the `SnapshotDto` union (`pending | ready | failed | expired`), `SnapshotChunk` and `SnapshotChunkGrant`.
  - Limits: 200 default / 1,000 maximum groups, a 2 MiB page, 30-day retention, a 24-hour snapshot TTL and 5-minute grants.
  - Strict validators `isEntityChange`, `isCommittedChangeGroup`, `isSnapshotChunk` and `isSnapshotChunkGrant`. Entities are checked against the per-entity DTO map `SYNC_ENTITY_VALIDATORS`, so the app can reuse them in S2–S3.
- **Migration `0010_sync`:**
  - `account_sync_state.pruned_through`.
  - `snapshot_manifests` and `snapshot_chunks`: owner-read RLS, internal object keys, expiry within 25 h of creation.
  - App routines `gogospend_request_snapshot` (account lock; idempotent per derived id; reuses a snapshot from the last hour or an open build) and `gogospend_snapshot_job_status`.
  - Worker routines `gogospend_record_snapshot` (only a current `sync_snapshot` lease, and only objects that lease published with the same size and digest) and `gogospend_prune_changes` (cutoff at least a day old, under each account lock).
- **Deltas** (`GET /v1/sync/changes`, `SyncQuery.after`):
  - Whole groups in revision order from one REPEATABLE READ snapshot, at most `limit` groups and 2 MiB. One group always fits, since M1 caps a group at 1 MiB.
  - The cursor is opaque and account-bound, naming the last fully included group revision. An empty page returns the request's own position.
  - Malformed, foreign-account and future cursors get 422. A position below `pruned_through` (including no cursor after a prune) gets `410 RESYNC_REQUIRED`.
  - Each served change is re-validated against its entity's DTO.
- **Retention** (`SyncRetention`, worker maintenance): deletes superseded changes more than 30 days old and keeps every entity's head change. Snapshots are built from heads, so a resync still has every latest state. It also drops manifests a week after expiry.
- **Snapshots:**
  - **Request:** `POST /v1/sync/snapshots` returns 202, takes a UUID `Idempotency-Key`, and has an empty body.
  - **Status:** `GET /v1/sync/snapshots/:id` returns a ready snapshot with `high_water`, a delta `cursor` and per-chunk grants. The grants are HMAC tokens keyed by HKDF from `COMMAND_DIGEST_KEY` and bound to the account; they name no key. Responses carry no object key.
  - **Chunks:** `GET /v1/sync/snapshot-chunks/:grant` requires the bound session and an unexpired manifest under RLS. The body's SHA-256 must match before it is served; any failure is 404.
  - **Builder:** `SnapshotBuilder` (the worker's `sync_snapshot` handler) reads high-water and every head through `LeasedAccountRead.withSnapshot` (one REPEATABLE READ view) and validates each entity. It streams roughly 1 MiB JSON chunks, each registered before its PUT. In one transaction it publishes the chunks (24 h), records the manifest and completes the job, re-checking lease, account and generation. Deadline, cancellation or deletion leaves no manifest and no published chunk; the sweep removes the rest.
- **API wiring:** `SyncModule` and `StorageModule` (`OBJECT_STORE`) in the v1 root. The API now needs `R2_*`, or `OBJECT_STORE=memory` outside production; `.env.example` and test settings are updated. `dev:v1` uses the memory store and runs no worker, so snapshots stay pending locally while deltas work. The worker's maintenance loop applies retention.
- **RED → GREEN** (assertion-level RED against seams, no module errors):
  - RED: 19 failed and 14 passed of 33 across `sync-query`, `snapshot-builder`, `sync-api` and `migrations`. The staggered-commit test then held its lock after an early failure, so it now releases in `finally`; the leftover test database and logins were dropped.
  - GREEN: 33 of 33.
  - Fixed on the way: revision lists ordered by the `::text` alias sorted "10" before "9". They now order by the bigint column.
  - Pinned `pagination_never_splits_a_command_group`: a 500-change command is served whole as a one-group page, and the cursor decodes to that group's revision.
  - Barrier receipts:
    - A read taken while command A holds the account lock mid-write (B queued behind it) sees only revision 1. Resuming from its cursor returns A (2) then B (3), with nothing skipped.
    - Five 600 KiB groups page within 2 MiB with no gaps.
    - During a multi-chunk build, two creates and a delete commit after chunk 0. Every chunk still reports high-water 7, the concurrent delete is absent, and deltas after the cursor return exactly revisions 8–10. Snapshot plus deltas equals `entity_heads` (each entity once, at its latest version).
    - A lifecycle change mid-build publishes nothing, and the sweep empties the prefix. An abort mid-build leaves the status `pending` with no manifest.
  - Startup specs that set an explicit environment (`v1-startup`, `auth-bootstrap`, `session-revocation`) now include `OBJECT_STORE=memory`.
  - Sync validator unit tests (2 tests in `contracts.spec.ts`) were written against the real validators, not RED first.
- **Recorded, not changed here:**
  - A purged entity's earlier changes keep their snapshots until the 30-day retention, and a snapshot taken before a purge keeps it for up to 24 h. P5's purge must scrub prior change snapshots and delete affected manifests and chunks.
  - Known P1 review findings, being fixed next, also affect snapshots: a leased read is denied when the lease it saw at its start expires, even though heartbeats extended it, so builds over about 20–30 s fail. That must be fixed before S2 relies on snapshots.
- **Hosted check:** SKIPPED. Private grants, expiry and streamed checksums against real R2 and Neon need the E1-authorized scope. S1 is not reported complete for beta until it passes.
- **Full gate:** typecheck PASS, typecheck:app PASS, test:api PASS (433), test:db PASS (366), test:app PASS (11), test:unit PASS (35), test:render PASS (38), test:dev PASS (7), build PASS, export:web PASS, `git diff --check` PASS. No test databases left behind.

## Review fixes for P1

- **P1 review** (commit `4d39532`): no blockers, two majors, ten minors and some nits. The reviewer ran its probes against PostgreSQL 17 on an extracted copy of the commit. It verified as correct:
  - SigV4 against several AWS vectors;
  - lock ordering among publish, cancel, logout, revocation, claim and extend;
  - heartbeat bounds and fencing of reclaimed or cancelled leases;
  - SECURITY DEFINER hygiene;
  - that the leased-read role has routine-only access.
- **Fixed, with tests that failed first:**
  - New `src/jobs/job-hardening.integration.spec.ts`.
  - Additions to `leased-account-read`, `object-publication` and `s3-object-store.contract`.
  - New unit `job.repository.spec.ts`.
  - RED: 14 of 31 DB tests and 2 of 28 unit tests failed on assertions, then 1 of 12 for the registry checks below.
  - **Major — a long snapshot was denied once the lease it started with expired.** Inside REPEATABLE READ, heartbeats are invisible. The leased routines now require that the token matches, that the lease was unexpired when the reading transaction began (`now()`), and that the attempt's fixed runtime bound (`attempt_started_at + max_runtime_seconds`) has not passed. A 2 s lease kept alive by heartbeats now reads 2.5 s in. Moving the attempt start back an hour denies the read.
  - **Major — the worker login could mint jobs and leases.**
    - `gogospend_jobs` can no longer INSERT `sync_snapshot` or `export` jobs (separate SELECT/UPDATE/INSERT policies). Those come only from the app routines.
    - A new trigger, `gogospend_guard_job_transition`, enforces the job protocol for every non-superuser login and routine:
      - inserts start queued;
      - a new lease token only by a claim, which counts the attempt and sets `attempt_started_at = now()` itself;
      - the same lease only forward, unexpired, within the runtime bound;
      - no revival of succeeded, superseded or cancelled jobs;
      - `failed → queued` only as a requeue with attempts reset to 0.
    - Forged tokens, revivals, a moved runtime start and over-long leases all fail with 42501.
  - **Login checks** (`assertLoginRoles`, now also used by the API's `assertLeastPrivilegeLogin` and the security worker): the login's memberships, direct or through other roles and inheriting or not, must equal exactly the expected set. CREATEROLE is refused. A `WITH INHERIT FALSE` grant of `gogospend_app`, `pg_read_all_data` or CREATEROLE are each refused.
  - **Locks:**
    - `gogospend_enqueue_account_job` takes the account lock; a test shows it waits for a held lock.
    - `gogospend_lock_current_job` checks the lease before locking, so a stale token never takes the account lock (checked with a 200 ms `lock_timeout`).
  - **Expired leases:** `complete` and `fail` refuse an expired lease that nobody reclaimed. Heartbeats never shorten a lease.
  - **Publication:**
    - Purposes are limited to `sync_snapshot` and `export`, and must equal the job's kind.
    - The new `deleting` state is retried until the storage delete succeeds; only then is a row `deleted`.
    - `deleted` rows are purged after 30 days.
    - The sweep uses the database clock unless a cutoff is passed (tests and operators).
    - New CHECKs: the key must name its own purpose, account, job and lease, and a published object expires within 7 days.
  - **S3 client:**
    - It never follows redirects (`redirect: 'manual'`). The fake now has a redirect route and a second origin, which receives nothing.
    - 5xx responses report `unavailable` without provider text.
    - `get` enforces the size limit (`too_large`), error bodies are released, and list pagination follows continuation tokens. The fake pages 2 keys at a time with a token containing `+ / = &`.
  - **Worker loop:**
    - A transient heartbeat error keeps the last granted budget instead of aborting.
    - Losing the lease (cancelled) aborts the handler.
    - Stopping the worker aborts the running handler and requeues it (`worker_stopped`).
    - Idle polling uses `timers/promises` sleep, so listeners no longer pile up.
    - `heartbeatMs` must leave the lease safety margin (29 s on a 30 s lease is refused).
    - Maintenance sweeps no longer overlap.
  - **Migration:** `0009` backfills `attempt_started_at` for leases held during the migration. Checked by applying 0001–0008 to a scratch database, holding a leased job, then applying 0009. The scratch database was dropped.
  - **Leased reads:**
    - Only the routine's own "leased read denied" error maps to `LeasedReadDenied`.
    - A key position needs both its entity and its id.
    - An account in `deleting` status is denied even at the same generation.
- **Tests added for coverage (passed at once):**
  - the app's own locked cancel racing a publisher that waits on the account lock (completion refused, object stays reserved);
  - cancel mid-handler aborts the handler's signal.
  - `failNext('delete')` is now used.
- **Test updates:**
  - Specs that queued `sync_snapshot`/`export` jobs through the worker login now use `queueAccountJob`, which simulates the app routine.
  - The S3 redirect test first failed on the fake's route order. After the fix to the fake, it was checked to fail with redirects followed, then restored.
  - The P1 receipts' "43" DB tests should read 44.
- **Not changed (recorded):**
  - `reserveKey` and `requeue` do not check that the account is active. Publication and leased reads re-check under lock.
  - The cancel routine's security-kind list is in SQL; P5 must add its own kinds.
  - Failed-job alerts repeat every sweep.
  - Worker startup logs the error message.
  - Each sweep lists every object of a purpose. It is fine at current scale; revisit with P2a volumes.
  - `publishIfCurrent` stays public for the plan's interface; `finishWithObjects` is the transactional path.
- **Full gate after the fixes:** typecheck PASS, typecheck:app PASS, test:api PASS (436), test:db PASS (384), test:app PASS (11), test:unit PASS (35), test:render PASS (38), test:dev PASS (7), build PASS, export:web PASS, `git diff --check` PASS. No test databases left behind.

## Review fixes for S1

- **S1 review** (commit `ae40498`): no blockers; two majors, seven minors and some nits. The reviewer confirmed:
  - delta ordering and the staggered-commit test;
  - paging that never splits a group;
  - retention and 410 correctness;
  - snapshot recording, fencing and expiry;
  - the grant construction;
  - definer-routine hygiene and fail-fast storage configuration.
- **Correction to the S1 receipt:** the original "same view" barrier test did not prove isolation. With six entities and 500-entity pages, every entity was read before the concurrent writes landed; the reviewer showed it also passed under READ COMMITTED. The new test below does prove it.
- **Fixed, with tests that failed first.** RED: 14 of 48 DB tests (`sync-query`, `snapshot-builder`, `sync-api`, `job.repository`) and 2 of 5 unit tests failed, all on assertions.
  - **Major — snapshot isolation is now tested.** The new test reads one entity per page with fixed ids. Between page 0 and page 1 it commits a late create (`ffffffff-…`) and a delete. The snapshot at high-water 4 still has neither. The earlier test now also commits between 2-entity pages. Checked by temporarily switching `LeasedAccountRead` to READ COMMITTED: both tests fail. The file was then restored.
  - **Major — delta pages read about their budget.** `ChangeWriter` stores each group's serialized size on its ordinal-0 row (`entity_changes.group_bytes`, new partial index `(account_id, revision) INCLUDE (group_bytes, committed_at) WHERE ordinal = 0`). `SyncQuery` chooses groups by size before reading any change. Twenty 600 KiB groups with `limit=1000` now fetch at most 2× the page budget (query spy); before, it fetched every group. The exact size check is kept.
  - **Retention** is now `gogospend_retention_candidates`, `gogospend_prune_account` and `gogospend_prune_expired_manifests`:
    - **Short transactions:** one transaction per account, visited in order. An account whose lock is held is skipped (`SKIP LOCKED`) rather than waited for: a run finished while a user write held the lock, and the next run pruned it.
    - **Every due account:** candidates are found through the primary key, the DELETE is bounded above the old retention line, and each run pages until every due account is done (3 accounts with a batch of 2).
    - **Database clock:** the cutoff is `now() - 30 days` in SQL, so no caller or worker clock can shorten it; changes 29 days old stay.
    - **CHECK:** `pruned_through <= revision`.
  - **A head missing its change row** now raises in `gogospend_leased_entities` (left join), failing the build instead of dropping the entity.
  - **One registry for entity types:** a parity test asserts `SYNC_ENTITY_VALIDATORS` covers exactly the API registry's entities (`CommandRegistry.entityNames()`).
  - **Cursor generation:** cursors carry the lifecycle generation. A cursor ahead of the account (a restore) or from an earlier generation gets `410 RESYNC_REQUIRED`, not 422. Manifests and chunks are served only at the account's current generation (status `expired`, grant refused), and reuse needs the same generation.
  - **Snapshot jobs only through their own routine:** the generic app enqueue routine now allows only `export`. Snapshots go only through `gogospend_request_snapshot`, with its single open build, reuse and limits.
  - **No read transaction during uploads:** the builder cuts chunks in memory inside the read transaction (at most 64 MiB, `MAX_SNAPSHOT_BYTES`), closes the transaction, then uploads. During every PUT, `pg_stat_activity` showed no open transaction for the leased-read login.
  - **Nits fixed:**
    - Grants verify against keys derived from the current and previous `COMMAND_DIGEST_KEY`s, so a rotation does not break live grants (unit test).
    - `gogospend_record_snapshot` requires the objects' `delete_after` to equal the manifest expiry and the high-water to sit between `pruned_through` and the revision.
    - `POST /v1/sync/snapshots` answers 200 when it returns a ready snapshot and 202 otherwise.
    - New indexes on `snapshot_manifests(expires_at)` and `snapshot_chunks(account_id)`.
    - The worker's sweep, retention and backlog report each run even if another fails.
    - `OBJECT_STORE=memory` needs `NODE_ENV` development or test.
- **Coverage tests (passed at once):**
  - an end-to-end recovery: prune, a stale cursor gets 410, a snapshot, then deltas from its cursor;
  - chunks near their target size;
  - grants capped at manifest expiry.
- **Not changed (recorded):**
  - **Validators must accept old data:** a stored change that fails today's validator still stops that account's deltas and snapshots. Future DTO changes must keep every stored shape valid, by versioning or by accepting both. This is now a rule for M-series DTO edits.
  - **Cursor tag:** it stays an unkeyed hash of the internal account id. The client already holds its cursors, and the id is never exposed.
  - **Snapshot reuse:** a request reused from a ready snapshot isn't recorded under its idempotency key. A retry with the same key after the one-hour window gets a fresh snapshot, which is harmless.
  - **Wide groups:** paging over heads of 500-wide groups costs about 6× more. Revisit if wide imports (P3) make it matter.
- **Full gate after the fixes:** typecheck PASS, typecheck:app PASS, test:api PASS (437), test:db PASS (397), test:app PASS (11), test:unit PASS (35), test:render PASS (38), test:dev PASS (7), build PASS, export:web PASS, `git diff --check` PASS. No test databases or logins left behind.

## S2: encrypted per-account local storage (local work)

- **Dependencies and config:**
  - `expo-sqlite ~58.0.13` and `expo-file-system ~58.0.9` are added to the app, at the SDK's pinned versions; npm left install scripts unapproved, as before.
  - `app.json` adds `["expo-sqlite", { "useSQLCipher": true }]` and `android.allowBackup: false`. `expo config --type introspect` shows `expo.sqlite.useSQLCipher=true` and `android:allowBackup="false"` in the generated manifest.
- **Ports** (`apps/app/src/storage/types.ts`): `SqlDatabase` (exec, run, all, an exclusive `transaction`, close), `DiaryFiles` (keyed open, exists, delete), `KeyStore`, `OutboxCommand`, `PendingEntry`, and the errors `DiaryLocked`, `DiaryKeyRejected`, `StaleEpochError` and `DiarySchemaTooNew`.
- **Test adapter** (`storage/testing/nodeSqlite.ts`): Node's built-in SQLite on temporary files, so the tests run the device's SQL, STRICT constraints and transactions. Keying is simulated (a file refuses any key but its own), and fault injection can fail any statement halfway through.
- **Schema** (`migrations.ts`, version 1 via `PRAGMA user_version`): `diary_meta` (owner, cursor, applied revision), `confirmed_entities` (tombstones kept, purged rows keep no snapshot), `confirmed_wallet_totals`, `pending_entries` and `outbox`, kept apart. Amounts stay exact integer strings. Each migration and its version bump run in one transaction, and a diary from a newer version is refused.
- **`AccountDatabase.open`:**
  - **One diary per account:** a separate file per account (`diary-<account>.db`) with its own key.
  - **Locked, never replaced:** a missing key (file present) or a rejected key gives `DiaryLocked`, never an empty replacement. Recovery is an explicit `discard`.
  - **Owner check:** a diary recorded for another account is refused.
  - **Epoch binding:** stores are bound to the session epoch (F5's `getV1SessionSnapshot().epoch`) at open.
- **`DiaryStore`** (`diaryRepository.ts`):
  - `savePending`: the draft and its outbox command in one transaction. The command must be this account's unsent create of exactly that entry.
  - `applyChangeGroups`: whole groups, versions forward only, tombstones kept and purged data dropped. It recomputes wallet totals with BigInt by the server's balance rule and stores the cursor and applied revision, all in one transaction. Out-of-order or already-applied groups and invalid changes are refused before anything is written.
  - `replaceConfirmed`: swaps the confirmed state, totals and cursor at a high-water mark and never touches drafts or the outbox.
  - `readOutbox` and `readState`.
  - `lock`: closes the store and keeps the data.
  - `eraseAfterConfirmation`: deletes the file and key.
  - The epoch is checked before every operation and again just before each commit, so an old session's write fails and a write racing a switch rolls back.
- **Key store** (`keyStore.ts`): a random 256-bit key per account in SecureStore (`gogospend.diary.v1.<account>`, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`). A malformed stored value is an error.
- **Device side:**
  - `database.ts` uses SQLCipher. It refuses without `cipher_version`, keys with a raw hex key, checks the key with a first read, and sets `temp_store = MEMORY`.
  - `database.web.ts` refuses: web keeps no diary.
  - `deviceDiary.ts` wires it all together.
  - `native-storage-proof.ts` is the device harness, and `docs/implementation/sqlcipher-device-proof.md` gives its procedure.
- **RED → GREEN** (`npm run test:unit -w gogospend-app -- src/storage/accountDatabase.test.ts src/storage/diaryRepository.test.ts src/storage/keyStore.test.ts`):
  - RED: 21 of 21 failed against seams, with no module errors.
  - GREEN: 21 of 21.
  - One test's fault pattern was narrowed to the cursor write before GREEN, so the injected failure lands after the records are applied (the "halfway" case).
  - One locked-store test used two different drafts. It now uses one, and lock checks now run before validation.
  - Pinned `failed_snapshot_swap_preserves_cursor_and_outbox`: the second confirmed insert of a replacement fails, and the cursor, outbox and whole state equal what they were before.
  - Also covered:
    - a draft and its command persist both or neither;
    - deltas plus a cursor write that fails halfway roll back to the previous state;
    - overlapping entity ids in two accounts stay separate;
    - missing and rejected keys lock;
    - migration rollback;
    - a newer schema is refused;
    - a write from A → B → A's old store is refused, and one racing an epoch move is rolled back;
    - erase is per account;
    - no column looks like a token, binding or secret.
- **Native and device checks: SKIPPED.** Encryption at rest, restart after a process kill, migration rollback, key invalidation, backup exclusion and sign-out/account switch all need iOS and Android development builds. iOS backup exclusion still needs a native step (no Expo API sets `NSURLIsExcludedFromBackupKey`). Until then a backup can hold the encrypted file but never its key, so a restore opens locked.
- **Deviations:**
  - The native adapter is `database.ts`, not `database.native.ts`, so `tsc` resolves the extensionless import. Metro still picks `database.web.ts` on web.
  - `types.ts` and the `testing/` helpers are extra files.
  - Nothing in the app uses the diary yet. S3/S4 wire the outbox and the **Saved on device** state, including the save error when a local commit fails.
- **Full gate:** typecheck PASS, typecheck:app PASS, test:api PASS (437), test:db PASS (397), test:app PASS (11), test:unit PASS (56), test:render PASS (38), test:dev PASS (7), build PASS, export:web PASS, `git diff --check` PASS. No test databases left behind.

## Review fixes for S2

- **S2 review** (commit `0f298ae`): one blocker, five majors, ten minors and some nits. The reviewer compiled the SQLCipher 4.17.0 that expo-sqlite bundles, with its iOS build flags, to prove the blocker. It confirmed as correct:
  - `PRAGMA cipher_version` may run before `PRAGMA key`, and `openDatabaseAsync` does not read the file before keying;
  - the raw-hex key cannot inject SQL;
  - temp files stay in memory and side files are deleted;
  - the data rules match the server (versions only move forward, purged rows keep no data, totals follow `BalanceQuery` exactly);
  - per-account isolation, transactional migrations and the introspected config.
- **Fixed, with tests that failed first.** RED: 22 of 34 storage tests and 1 of 3 key-store tests failed, all on assertions with no module errors. GREEN: 35 of 35 plus the key-store tests.
  - **Blocker — on a device every transaction ran on a second, unkeyed connection.** `withExclusiveTransactionAsync` opens a new connection that never receives `PRAGMA key`. The first migration would have written a plaintext database, and every later write would fail.
    - **Fix:** the new `serialDatabase.ts` puts every statement, read unit and transaction through the one keyed connection, one at a time. It issues `BEGIN IMMEDIATE`, COMMIT and ROLLBACK itself and reports the original error if the ROLLBACK fails. A transaction handle is dead once its transaction ends.
    - The device adapter and the test adapter now share this wrapper, so the Node tests exercise the device's transaction logic. Its own tests cover statement order, non-interleaving, a failed COMMIT, a failed ROLLBACK and escaped handles.
  - **Major — concurrent opens could overwrite the key and lose saved drafts.** `AccountDatabase` serializes opens per account and shares one store. A store from an earlier epoch is closed on reopen. `KeyStore.create` refuses when a key exists.
  - **Major — an old session's store could erase the account.** Erase is now checked against the epoch, and a stale store is reported as stale before it is reported as locked.
  - **Major — discard deleted the file before the key, and could not be retried on a device.** Discard now closes the live store, deletes the key first (the data is unreadable at once) and then the file. A missing file counts as deleted. The test adapter now refuses to delete an open file, as the device does.
  - **Major — reads could mix states or leak across sessions.** Each read runs as one unit and is checked against the epoch again afterwards. A read racing a write sees one consistent state.
  - **Major — the atomicity test passed a wrong implementation.** New helper `everyStatementFails` fails each statement in turn (BEGIN and COMMIT included) for `savePending`, `applyChangeGroups` and `replaceConfirmed`, and checks state and outbox are unchanged every time. The reviewer's mutant, which commits the cursor in its own transaction, now fails it. Checked by temporarily applying the mutant, then restoring.
  - **Minor fixes:**
    - Only "not a database" means a rejected key.
    - Key-store failures map to `key_unavailable` (transient; never offer discard). A malformed key maps to `key_rejected`.
    - `applyChangeGroups(groups, cursor, previousCursor)` is a compare-and-set on the cursor, so a page fetched before the cursor moved is refused (`CursorMoved`) and never written back. This adds a third parameter to the plan's interface.
    - A retried identical save is a no-op, and a different body under the same ids is refused.
    - Drafts must be a valid create: allowed fields only, normalized note and merchant, a real date on or after the wallet's tracking start, synced unarchived wallets (two different ones for a transfer) and a matching category. A field set to `undefined` is treated as absent.
    - The owner is checked before any migration.
    - An epoch move during open leaves no store or connection.
    - Web refuses before any key is read.
    - The proof harness gains a 2,000-group write to kill mid-transaction and restores or removes its dummy key.
  - **Docs:**
    - The device proof doc explains the single keyed connection.
    - It records the Android 12+ device-transfer gap: an explicit extraction rule is still needed, plus a device check.
    - It corrects the iOS key claim. A this-device-only keychain item is restored to the same device, where the diary opens normally; only a restore to another device opens locked. The S2 receipt's "a restore opens locked" was too broad.
- **Not changed (recorded):**
  - `replaceConfirmed` may move the applied revision backwards. That is needed after a server restore (a 410 for a cursor ahead of the account).
  - Totals rescan the confirmed records on each write. Fine at diary scale.
  - The no-credentials test checks column names only.
- **Native and device checks: still SKIPPED.**
- **Full gate after the fixes:** typecheck PASS, typecheck:app PASS, test:api PASS (437), test:db PASS (397), test:app PASS (11), test:unit PASS (70), test:render PASS (38), test:dev PASS (7), build PASS, export:web PASS, `git diff --check` PASS. No test databases left behind.

## S3: outbox, retry discipline and reconciliation (local work)

- **Outbox states** (`storage/types.ts`, S2 schema version 1 edited in place since it is undeployed):
  - The plan's `unsent`, `sending`, `uncertain`, `needs_review` and `paused_upgrade`, plus `acknowledged` with its committed revision, kept until the confirmed state holds the record.
  - **CHECK:** a command that was ever in flight keeps its first transmission time.
  - **New store operations:**
    - `beginTransmission`: unsent, uncertain or paused → sending. It freezes the command: first transmission time set once, id and body never change.
    - `setCommandState`: compare-and-set; only an acknowledgement carries a revision.
    - `resolveCommands`: removes the command and its draft together.
    - `editPending` / `removePending`: only for drafts never transmitted; edits are re-validated against synced references.
- **Verdicts** (`sync/outbox.ts`):
  - **Maybe committed** (network, 5xx, garbled response): `uncertain`. It counts as a failure, and its status is checked before any resend.
  - **Refused** (validation, conflict, missing, deleted or purged reference, unsupported schema, idempotency mismatch, too large): `needs_review`, never retried, draft kept.
  - **Not processed** (429, 426, auth, policy): the command returns to its previous state and stays frozen.
  - **Session change mid-response:** stays `sending` for the next session to recover.
  - **Age:** drafts older than 30 days need review.
- **Retry policy** (`retryPolicy.ts`):
  - Backoff starts at 1 s and doubles to a 60 s cap, with jitter keeping half to all of each delay. A 503's Retry-After wins when longer.
  - A 429's Retry-After is pacing, honoured even by a manual retry, and never counts as a failure.
  - Five consecutive failures pause the engine until foreground or a manual retry.
- **Engine** (`syncEngine.ts`): one flush per account at a time; concurrent calls share it. Each flush:
  1. recovers `sending` → `uncertain` after a crash;
  2. checks the status of uncertain commands in batches of 100, so known ones are acknowledged without a resend;
  3. pulls deltas so references are current;
  4. moves stale drafts, or drafts with archived or deleted wallets or categories, to needs-review;
  5. sends in order, at most two at a time, with one token refresh per failed request and the same key and body;
  6. reconciles.

  A 426 pauses every unsent command (`paused_upgrade`, ids and bodies unchanged) and stops sending until the app is updated; uncertain ones stay uncertain. Outcomes report "n of m" progress, uncertain and needs-review counts, and the next attempt time.
- **Reconciliation** (`reconcile.ts`):
  - It pulls every delta page from the stored cursor, and retries from the new cursor if one moved underneath (`CursorMoved`).
  - On `RESYNC_REQUIRED` it requests a snapshot, polls it (bounded), downloads and checks every chunk, swaps it in and then pulls deltas. A snapshot not ready in time leaves the diary as it was (`resync_pending`).
  - Commands resolve only when the confirmed state holds their record in any state, or has passed the revision they were acknowledged at. A deleted or purged record drops its draft, never re-inserting it, and confirmed state never comes from an acknowledgement.
  - `pendingAdjustmentMinor` gives S4 the exact total of unconfirmed pending expenses.
- **Scheduler** (`scheduler.ts`):
  - Syncs at launch, on foreground, after a write and on a manual retry.
  - Runs at most one foreground timer, every 60 s or at the backoff or Retry-After time.
  - Sets no timer while paused, after a 426 or after an auth stop.
  - Background and stop clear the timer, and a stopped scheduler ignores late results.
- **Server side** (`resources.ts`, `client.ts`, contracts):
  - `createSyncResources` sends a command as itself: its own Idempotency-Key, its own `X-GoGoSpend-Command-Schema` and its exact body.
  - It also covers command status, deltas, snapshot request and status, and chunk download. Chunks are checked against the grant's byte size and SHA-256 (via a new transport text mode) before parsing.
  - New contract validators: `isSyncChangesPage` (whole valid groups, increasing revisions) and `isSnapshotDto`.
  - `sharedV1.ts` exposes `getSharedSyncRemote` (SHA-256 via expo-crypto), and `sync/deviceSync.ts` builds the engine and scheduler for an open diary.
- **Tests:** a fake server (`sync/testing/fakeServer.ts`) keeps receipts by command id, gives one revision per commit, serves cursor pages, enforces 410 retention, serves snapshots and a 60-per-minute write limit, and supports scripted failures including lost responses. The bench runs a real S2 diary on `node:sqlite`.
- **RED → GREEN** (`npm run test:unit -w gogospend-app -- src/sync/outbox.test.ts src/sync/syncEngine.test.ts src/sync/reconcile.test.ts src/spend/v1/resources.test.ts`):
  - RED: 32 new tests failed against seams with no module errors (22 outbox/engine/policy/scheduler, 7 reconcile, 3 resources). The existing resources tests kept passing.
  - One test change before GREEN: the five-failure test used queued failure scripts that outlived their flushes, so the fake server gained an offline switch.
  - GREEN: all pass.
  - Pinned `purged_ack_does_not_resurrect_original_draft`: an acknowledged draft purged on the server before this device pulled leaves no active confirmed record, no draft, no outbox entry, and a pending adjustment of `'0'`.
  - **Covered cases:**
    - airplane mode: uncertain and frozen; the backoff gate holds; status is checked before the same command is resent; one record;
    - a timeout after commit resolves through status with no resend;
    - an app killed after commit but before the local acknowledgement recovers at launch;
    - a late response after a session change is dropped, and the next session resolves it;
    - an expired token is refreshed once and the same command resent; a second refusal stops with the draft kept and frozen;
    - account denial;
    - 429 pacing without counting toward the pause, and a 5xx counted as uncertain;
    - five failures pause until foreground;
    - 409/422 and an unsupported schema need review while others still go;
    - 426;
    - a 200-draft backlog at 60 per minute takes at least 180 s of simulated time, never pauses, never has more than two requests in flight, and creates exactly 200 records;
    - concurrent flushes share one run;
    - archived references and 30-day-old drafts need review without data loss.
- **SKIPPED:**
  - **Network-cut check:** the real API/SQL fixture with a cut immediately after commit, then a restart (one server record and receipt, no lost draft, correct balance). Per your instruction, recorded only; the fake-server tests above cover the same sequence.
  - **Device checks.**
- **Deviations:**
  - The extra `acknowledged` state.
  - `applyChangeGroups` takes the previous cursor (from S2's fixes).
  - Sync endpoints live in `createSyncResources`, so the screens' `SpendV1Resources` and its fake are unchanged.
  - `sync/scheduler.ts`, `sync/deviceSync.ts` and the test helpers are extra files.
  - F5 has no token refresh yet, so the device wiring refuses refreshes: a rejected token stops the flush and keeps drafts.
- **Full gate:** typecheck PASS, typecheck:app PASS, test:api PASS (437), test:db PASS (397), test:app PASS (11), test:unit PASS (102), test:render PASS (38), test:dev PASS (7), build PASS, export:web PASS, `git diff --check` PASS. No test databases left behind.

## S4: pending/conflict UX, local reminders (local work)

- **Displayed totals** (`spend/v1/pendingTotals.ts`): `deriveDisplayedTotals(confirmed, pending)` keeps the confirmed totals exactly as the server sent them. Drafts on the device become a separate adjustment: income adds, expenses subtract, and a transfer moves money between its wallets. The estimate is the exact BigInt sum. Pinned `pending_expense_is_distinct_from_confirmed_total`: confirmed expense stays `'10000'` and the pending adjustment is `'6500'`.
- **Device diary for the screens** (`spend/v1/spendDiary.ts`, `SpendDiaryContext.tsx`, `DeviceDiaryProvider.tsx`):
  - **Opening:** it opens the diary of the account the server names (`GET /v1/me`), so a new identity with the same email never inherits a queue. Any session change closes the previous account's diary first.
  - **Saving:** drafts save on the device before anything is sent; `saveDraft` rejects when nothing was saved.
  - **Sync triggers:** it syncs at launch, on foreground (AppState), after each save and on manual retry, and stops in the background.
  - **Locking:**
    - A remote sign-in refusal locks the diary and keeps its drafts.
    - A missing or rejected key locks it with that reason.
    - Signed out means no diary.
  - **Platform:** iOS and Android only; the web keeps none.
- **Banner** (`sync/SyncStatus.tsx`): a polite status announcement (`role="status"`, `aria-live="polite"`), in words rather than colour alone. It covers:
  - "Saved on device · Waiting to sync (n)";
  - "Syncing n of m" while the server paces a backlog;
  - entries being checked before a resend;
  - entries needing review;
  - update required;
  - sign in again;
  - a locked key (recover or discard);
  - an unreachable server with Retry, and paused after repeated failures.
- **Screens:**
  - **Add:** with a ready diary, saves on the device and only then returns home. A failed local commit shows "Couldn't save this entry on the device. Nothing was saved." and never claims it was saved. Without a diary (web, not yet open) it uses the online save as before.
  - **Home:** shows the banner and "Waiting to sync: money out/in …" lines apart from the confirmed totals. Acknowledged commands are excluded, so they are never counted twice.
  - **Copy:** 17 new English/Thai entries (Vietnamese falls back to English).
- **Local reminders** (`notifications/reminders.ts`, plus `localReminders.ts` for devices via expo-notifications and `localReminders.web.ts`):
  - One device-local daily reminder with a fixed id, so a new time or locale replaces it, never duplicates.
  - Permission is asked at most once. A denial is a settled "off" state with no retry loop.
  - The web reports reminders unsupported, and there is no push backend.
  - Added `expo-notifications ~58.1.4`, the SDK's pinned version.
- **RED → GREEN:**
  - Unit tests (`pendingTotals`, `localReminders`, `spendDiary`): 12 of 12 failed, then 12 of 12 passed.
  - Render tests (`SyncStatus`, `OfflineSave`): 9 of 10 failed; the "no banner" case already held. Then 10 of 10 passed.
  - **Test fixes before GREEN:**
    - The account-switch controller test now runs offline, so A's draft stays pending.
    - One controller test used a fixed date for drafts but the real clock for the engine, which made the draft look 30 days old; it now uses one clock.
    - The banner test needed the same `expo-crypto` mock as the other render tests.
- **SKIPPED:**
  - **E2 visual approval** of the new banner and pending lines.
  - **Native journeys:** airplane mode, restart, two devices and account switch.
  - **OS checks:** notification permission and delivery on devices.
  - **320 px visual checks** in Thai and English.
  - **Not built yet:** a settings screen for reminders and a review screen for needs-review entries, which both wait for approved visuals. The services and states exist.
- **Deviations:**
  - The device reminder adapter is `localReminders.ts` (not `.native.ts`), for `tsc` resolution.
  - `reminders.ts`, `spendDiary.ts`, `SpendDiaryContext.tsx`, `DeviceDiaryProvider.tsx` and `testing/fakeDiary.ts` are extra files.
  - The diary provider wraps the spend routes in `app/spend/_layout.tsx` (not on the legacy path).
- **Full gate:** typecheck PASS, typecheck:app PASS, test:api PASS (437), test:db PASS (397), test:app PASS (11), test:unit PASS (114), test:render PASS (48), test:dev PASS (7), build PASS, export:web PASS, `git diff --check` PASS. No test databases left behind.

## Review fixes for S3

- **S3 review** (commit `857912b`): one blocker, five majors, nine minors and two nits. The reviewer found that ten mutants survived the original suite. It confirmed:
  - no new id or rewritten body after a transmission begins;
  - crash and session recovery;
  - single-request verdicts that match the real server's guard and executor order;
  - the backoff math;
  - reconcile and snapshot paging;
  - request shapes that match the API.
- **Fixed, with tests that failed first.** New `src/sync/engineHardening.test.ts`: 13 of 47 sync tests failed on assertions, then all passed.
  - **Blocker — an edit made while a flush ran was lost.** The engine sent its stale in-memory copy. `beginTransmission` now returns the frozen row from its own transaction, and that row is what gets sent. A draft removed before its turn is skipped. Test: draft #3 is edited to 999 while #1 and #2 are in flight, and the server commits 999.
  - **Major — committed commands could get stuck.**
    - Any command not in flight whose record the confirmed state holds now resolves, whatever its local state (unsent, needs-review, paused).
    - Outbox sends make exactly one attempt, with no hidden transport resend (new `resendLost: false`).
    - On a create, 409 conflict or idempotency mismatch and 410 deleted/purged mean "this id is already used" and become `uncertain`, not needs-review.
  - **Major — one worker's success erased the other's backoff.** The retry decision is now made once per run: any failure in the run sets the backoff, and only a run without failures resets it. The second worker's success no longer lets an immediate retry through.
  - **Major — errors escaped `flush()`.** Each worker catches its errors, the run uses `Promise.allSettled`, and `DiaryLocked`, `CursorMoved` and unexpected errors map to outcomes. The scheduler catches a failing flush and re-arms its timer, so nothing goes unhandled.
  - **Major — a server restore could delete drafts.** Resolution is now by presence only. An acknowledged command missing from the confirmed state after the state has passed its revision becomes `uncertain`, so its status is checked and the same command resent.
  - **Major — weak tests.** New tests cover:
    - 426 on a send;
    - pending adjustment ignoring income (the bench gains an income category);
    - a mismatched chunk refused with the diary unchanged;
    - a paced uncertain command keeping its mark;
    - background clearing the foreground flag;
    - exactly two requests in flight;
    - stale uncertain commands reviewed, not resent;
    - a known status acknowledging even when the next pull fails;
    - a status answer for another record refused.

    Three re-applied mutants now fail the suite: sending the stale copy, a success resetting the backoff, and one request in flight.
  - **Minor fixes:**
    - The fake server now limits writes like the real guard: before the receipt lookup, replays charged, fixed one-minute windows. The backlog bound becomes at least 120 s, with exactly two in flight.
    - A save during a running flush gets exactly one follow-up run. Concurrent calls serialize; the "share one run" test was updated to match.
    - `launch()` counts as foreground, so a timer is armed.
    - References are read once per flush.
    - Expired chunk grants are renewed with one status call.
    - A resync still pending after the sends is reported.
    - Status answers are cross-checked against the command and its record.
    - A 410 without a problem body, or a 422 on the cursor, triggers a resync.
    - `unsupported_platform` stops as signed-out everywhere.
- **Not changed (recorded):**
  - The device wiring creates one engine per opened store, and closing a store stops its scheduler. A stale engine's in-flight request can at most leave a `sending` row, which the next session's engine turns uncertain and checks.
  - `pendingAdjustmentMinor` stays an expense total. `deriveDisplayedTotals` (S4) is the full model.
  - The transport still parses chunk JSON once before text mode returns it.
- **Full gate after the fixes:** typecheck PASS, typecheck:app PASS, test:api PASS (437), test:db PASS (397), test:app PASS (11), test:unit PASS (132), test:render PASS (48), test:dev PASS (7), build PASS, export:web PASS, `git diff --check` PASS. No test databases left behind.

## F5: native session (local work)

- **Session state machine** (`apps/app/src/auth/sessionMachine.ts`):
  - States: `signed_out`, `hydrating`, `authenticating`, `bootstrap_pending`, `active`, `locked` and `reauth_required`.
  - The epoch moves exactly when the account or binding changes (sign-in, switch, new binding, sign-out), never on a token refresh. A lock keeps the identity and the epoch.
  - While hydrating or authenticating there is no account, so nothing from a previous account can show.
  - An event that makes no sense in the current state changes nothing.
- **Credential provider** (`credentialProvider.ts`): serialized token reads and forced refreshes (one SDK call however many callers). A failed refresh locks and keeps the binding, and a cancelled sign-in restores the stored state.
  - **Sign-in** follows F4's provisional contract:
    1. Universal Login;
    2. a `bootstrap` challenge;
    3. an ID token carrying the challenge nonce;
    4. `/v1/auth/bootstrap`;
    5. the binding saved.
  - **Sign-out** revokes the device's binding, clears the SDK and the stored binding, and moves the epoch.
- **Purpose proofs** (`reauthentication.ts`): a challenge for the purpose and command, a fresh login (`max_age=0`) with the nonce, then `/v1/auth/proofs`. Cancelling gives no proof.
- **Transport** (`api/client.ts`):
  - **401 handling:** a 401 `UNAUTHENTICATED` allows one serialized refresh, through the new `refreshAfterUnauthorized` credential hook, and one resend of the same body and key. A second 401 signs out. 426, `REAUTH_REQUIRED` and `ACCOUNT_UNAVAILABLE` are never refreshed.
  - **Token-only routes:** a new `tokenOnly` option for challenge, bootstrap and proof sends no binding.
  - **Auth API:** `createAuthApi` (`authApi.ts`) covers those routes with strict response validators; the ID token goes only in request bodies.
- **Adapters:** `auth0Client.ts` maps the native SDK's shape onto the port: PKCE Universal Login, the Credentials Manager, forced refresh, and cancellations as `AuthCancelled`. `auth0Client.web.ts` reports real sign-in unsupported. The session seam (`session.ts`) accepts an installed provider: the shared transport takes its token, binding, epoch and refresh, and the auth guard counts `active`, `locked` and `reauth_required` as signed in. The legacy seam stays until callers move. `EXPO_PUBLIC_AUTH0_DOMAIN`, `_CLIENT_ID` and `_AUDIENCE` are public settings, empty by default, so the app stays signed out.
- **RED → GREEN** (`npm run test:unit -w gogospend-app -- src/auth/sessionMachine.test.ts src/api/sessionEpoch.test.ts`):
  - RED: 10 of 14 failed against seams. Four held already: a token renewed mid-request keeps its response, a session change drops a response, a 426 is never refreshed, and the web port is unsupported.
  - GREEN: 14 of 14.
  - Two tests were added after the code, for coverage: the SDK mapping, and an installed provider driving the shared seam.
  - **Covered:**
    - epoch rules, including A → sign-out → B and a new binding on the same account;
    - hydration without a flash;
    - one SDK call for concurrent token reads and refreshes;
    - a refresh failure locking without erasing;
    - the bootstrap order and nonce;
    - cancel keeping the stored binding;
    - sign-out;
    - purpose proofs;
    - one refresh and one identical resend per 401;
    - A → B → A responses dropped;
    - token-only routes.
- **SKIPPED** (`docs/implementation/auth0-native-proof.md`):
  - **Needs E1** (tenant, native application, API, connections): the native SDK install and its config plugin, and iOS/Android development builds.
  - **Needs E2** (bundle identifier, callback domain): PKCE callback and logout, nonce injection, refresh rotation, cold start, device-protected storage.
  - **Waits for approved visuals:** Universal Login UX states and Thai/English prompts.
  - F5 stays incomplete, and F4's contract stays provisional.
- **Deviations:**
  - The native adapter is `createAuth0Port` over a structural SDK type in `auth0Client.ts`, because no SDK is installed.
  - `AuthSessionProvider.tsx` is replaced by `installCredentialProvider`, since nothing can be installed before E1.
  - `authApi.ts` is an extra file.
- **Full gate:** typecheck PASS, typecheck:app PASS, test:api PASS (437), test:db PASS (397), test:app PASS (16), test:unit PASS (148), test:render PASS (48), test:dev PASS (7), build PASS, export:web PASS, `git diff --check` PASS. No test databases left behind.

## Review fixes for S4

- **S4 review** (commit `e3a9ee2`): two blockers, seven majors, minors and nits. The reviewer confirmed the pending/confirmed split in `deriveDisplayedTotals`, the local-first save order and the reminder service's single fixed id.
- **Fixed, with tests that failed first.** RED: 21 of 46 unit tests, 5 of 6 resolver tests and 14 of 22 render tests failed, on assertions or on the bug's own error; then all passed. Eleven mutants that undo a fix each fail the suite (`s4fix-mutants.log`).
  - **Blocker — offline launch made device saves impossible.** `GET /v1/me` failing left no diary, and Add and Home needed the server.
    - A new resolver (`spend/v1/diarySession.ts`) remembers the account the server verified for a binding (`knownAccount.ts`, SecureStore, this device only; only a SHA-256 of the binding is stored).
    - Offline, it reopens that account's diary. A refusal recalls nothing, and a new binding (a new identity, even with the same email) inherits nothing.
    - A recalled account is verified again on the next refresh.
    - The diary view now carries its synced, open wallets and categories. Add uses them when the diary is ready, so it works offline, and keeps the lists it first showed.
    - Offline, Home still shows the banner, waiting money, the drafts and Add.
  - **Blocker — the first entry after creating the first wallet couldn't be saved.** The diary had not pulled the new wallet yet.
    - `assertDraft` now throws `DraftReferenceUnavailable` for an unknown wallet or category.
    - `saveDraft` then pulls once and tries again.
    - Creating the first wallet online asks the diary to sync.
  - **Major — a token refresh tore the diary down mid-flush.** A notification for the same account and epoch is now a no-op, and the resolver no longer calls `/v1/me` again for the same identity.
  - **Major — the diary's session epoch was never checked.** `AccountDatabase.open(accountId, expectedEpoch)` refuses to open under another identity's epoch. The engine flushes as the session the store was opened for, not the store's account plus the installation epoch.
  - **Major — a superseded session change overwrote a newer "ready".** Generation is checked after closing. A superseded open of another account's store is closed (the leak).
  - **Major — Home double-counted or dropped money.**
    - Confirmed money reloads in place (no loading flash) when a waiting command resolves.
    - Uncertain entries show as "Checking with Jotbun", apart from waiting money.
    - Needs-review entries are left out of both and counted in the banner.
  - **Major — an unconfirmed online save could be re-queued on the device with a new command id.** Try again now stays online with the same key until the outcome is known. Device saves use one command id per form, so a repeat is a no-op.
  - **Major — no foreground timer at launch.** Already fixed by the S3 review (`launch()` counts as foreground); a test now pins it. A background launch clears the timer.
  - **Major — plan items not done.** Now done:
    - Undo of an unsent draft and discard of a needs-review draft, from a "Saved on this device" list on Home (`discardReviewed` in the store).
    - A locked diary's "Start over", only after confirming.
    - `eraseForSignOut()` erases only this account's diary. The sign-out screen that calls it waits for the settings page's visual approval.
    - The banner explains terms to accept (`policy_required`) and a newer diary (`schema_too_new`).
    - iOS hears status changes through `AccessibilityInfo.announceForAccessibility`.
  - **Minors:**
    - Outcomes now come from the scheduler, including a flush that failed outright.
    - Device saves explain a locked diary or a reference not yet on the device.
    - An older `/v1/me` answer is ignored, and nothing reopens after unmount.
    - One `AccountDatabase` is shared across remounts.
    - Live "n of m" progress comes from the engine (`onProgress`).
    - `foreground()` retries a diary whose key store was unavailable.
    - Reminders:
      - provisional iOS delivery counts as granted, and iOS asks for alerts and sounds;
      - Android posts on its own `daily-reminder` channel;
      - `refresh()` re-schedules only after a time zone or language change, at launch and on foreground (`useReminderUpkeep`).
  - **Nits:**
    - "Checking 1 entry … sending it again" is singular.
    - `useDiaryView` subscribes with a stable callback.
    - The S4 lockfile also resolved `expo-notifications` 58.1.5 and moved `expo-application` to 58.1.2.
- **Copy:** 21 new en/th keys, and `spendV1SyncKeyLocked` was reworded (it now explains why the diary is unreadable; the action is "Start over").
- **Branding** (commit `d1b1d60`, between S4 and these fixes): the display name and user-facing copy are now Jotbun, with the store icons in `docs/brand/`. The slug, scheme, package ids, headers and database roles are unchanged.
- **SKIPPED:**
  - On devices: the offline-launch, airplane-mode, account-switch and remount journeys; VoiceOver and TalkBack announcements; the notification channel and provisional delivery.
  - The sign-out confirmation UI waits for visual approval.
- **Full gate:** typecheck PASS, typecheck:app PASS, test:api PASS (437), test:db PASS (397), test:app PASS (16), test:unit PASS (173), test:render PASS (60), test:dev PASS (7), build PASS, export:web PASS, `git diff --check` PASS. No test databases left behind.

## F6b: verified provider security events and reset reconciliation (local work; F6b not complete)

- **Status:** built and tested locally against the synthetic issuer and the loopback Management API fake. F6b is **not complete**: the tenant proof (the Post Change Password Action's real delivery delay, the reconciliation bound on the selected plan, whether Auth0 itself revokes refresh tokens on a password change) and its independent review of that evidence are **SKIPPED** until E1. Recovery must not be enabled for users before then.
- **Migration `0011_auth_events`:**
  - `accounts.credentials_changed_at`: the newest provider credential change applied. An older or repeated event changes nothing.
  - `auth_event_receipts`: one row per verified event id or reconciled change. It stores the principal as a digest only, the time, the outcome (`applied`, `superseded`, `no_account`) and the cleanup job. No role can read it directly.
  - `security_reconcile_checks`: when each principal was last checked against Auth0.
  - **Routines** (`SECURITY DEFINER`, `search_path = pg_catalog`, revoked from `PUBLIC`):
    - `gogospend_apply_credential_change` (internal, granted to no role). It records the receipt first, so a concurrent duplicate waits and then sees `duplicate`; an id reused for different content returns `conflict`. Under the account lock, a change newer than the last one ends every live session signed in before it (auth time rounded up to the next whole second) and moves `reauth_after` past it. Only when it ended a session does it hold every alias and queue F6a's `auth0_revoke_grants` job, with the same hold, retry and supersede rules as global logout. Times more than 5 minutes ahead are refused.
    - `gogospend_record_security_event` (`gogospend_bootstrap`, the API's pre-account role).
    - `gogospend_schedule_security_reconcile`, `gogospend_reconcile_candidates` and `gogospend_reconcile_identity` (`gogospend_security`; the last two need the current, unexpired lease of an `auth0_security_reconcile` pass).
  - The job RLS policies now treat `auth0_security_reconcile` as a security kind: a generic `gogospend_jobs` login neither sees, claims nor creates it.
- **Server:**
  - `POST /v1/auth/provider-events` (public; the signed envelope is its only authentication). Answers 200 `{result: "applied"|"duplicate"}`. A missing secret configuration gives 404.
  - `auth0-event-verifier.ts` checks, in order:
    1. the size (8 KiB);
    2. the HMAC-SHA256 over `<t>.<raw body>` with any configured secret and any listed `v1`, compared in constant time;
    3. the 5-minute replay window;
    4. the exact envelope keys, a known type (`password_changed`, `user_blocked`) and the id and subject shapes;
    5. the issuer (`AUTH0_ISSUER`);
    6. the event time: at most 60 s ahead and 7 days old.
  - Refusals reuse the existing codes: 401 `UNAUTHENTICATED`, 422 `VALIDATION_FAILED`, 413 `COMMAND_TOO_LARGE` and 409 `IDEMPOTENCY_MISMATCH`. Nothing from an unauthenticated body is echoed or logged.
  - `jsonBody` keeps the raw request bytes for signature checks.
  - `SecurityEventService.handleSecurityEvent(signedEnvelope)` is the plan's interface. Superseded and unknown-principal events also answer `applied`, since the provider has nothing to retry.
  - **Reconciliation of lost events:**
    - The security worker queues one `auth0_security_reconcile` pass at most every `SECURITY_RECONCILE_INTERVAL_SECONDS` (default 300).
    - The pass reads `last_password_reset` (new `credentialState`, which asks for that one field only; needs `read:users` on the maintenance client) for the least recently checked identities that still have a live session (`SECURITY_RECONCILE_BATCH`, default 200).
    - It applies any newer change exactly as an event would. The receipt id is derived from the principal and the change time, so a change found again is a duplicate.
    - A change older than every live session ends nothing.
    - A provider outage retries the pass with backoff and never guesses.
  - **Docs:** the runbook gains the envelope, its answers, the effect and the Action script, rotation, the reconciliation bound (`ceil(signed-in identities / batch) × interval` plus one pass) and the tenant-proof checklist. Settings were added to `.env.example` and `.env.worker.example`, and the master plan's migration table now records `0010_sync` (S1) and `0011_auth_events` (F6b).
- **RED against seams** (the verifier parsed without checking; the service and routines were stubs; the reconcile read returned nothing):
  - unit: 6 of 8 failed;
  - database: 14 of 15 failed, all on behaviour. One failed with a `TypeError` because the stub scheduler queued no pass to claim.
- **GREEN:** `npm run test -w gogospend-api -- --runTestsByPath src/auth/auth0-events.spec.ts src/auth/auth0-management.client.spec.ts` gives 19 of 19, and `npm run test:db -w gogospend-api -- --runTestsByPath src/auth/auth0-events.integration.spec.ts` gives 15 of 15.
- **Covered:**
  - forged, re-serialized, stale and other-issuer events;
  - a duplicate, and concurrent duplicates applied once;
  - an id reused for other content;
  - an older event after a newer one;
  - an unknown principal;
  - a block;
  - a change after every live session;
  - a future time refused by the database;
  - the refresh-grant replay refused (`REAUTH_REQUIRED`);
  - cleanup lifting the hold;
  - a lost change found by reconciliation, applied once;
  - a provider outage;
  - the scheduling interval;
  - the role and lease matrix.

  Eight mutants that remove a guard (supersede, dedupe, the pre-change cutoff, no-hold-when-nothing-ended, the database future check, the candidate lease, the signature and the replay window) each fail the suite (`f6b-mutants.log`).
- **Deviations:**
  - `auth0-events.service.ts` is an extra file, holding `handleSecurityEvent`.
  - A change only holds and queues provider cleanup when it ended a session; otherwise `reauth_after` alone keeps an old grant from binding.
  - `user_blocked` has no Auth0 trigger; it is for operator tooling.
  - Reconciliation covers password changes only. A blocked Auth0 user cannot refresh, so their sessions end within one access-token lifetime anyway.
- **Full gate:** typecheck PASS, typecheck:app PASS, test:api PASS (446), test:db PASS (412), test:app PASS (16), test:unit PASS (173), test:render PASS (60), test:dev PASS (7), build PASS, export:web PASS, `git diff --check` PASS. No test databases left behind.

## F6c: explicit account linking (local work; F6c not complete)

- **Status:** built and tested locally against the synthetic issuer and stand-ins for Auth0. F6c is **not complete**:
  - the tenant proof is SKIPPED until E1/E2 (linking an Apple login into an email login on test identities, and the linked Apple token revoked through Auth0's managed deletion);
  - so is the joint F6a–F6c auth/security review of that evidence.

  Linking must not be offered to users before then.
- **Migration `0012_account_linking`** (routines only, no tables; the plan expected none, and the master plan table and note are updated):
  - `gogospend_link_secondary_is_valid`: the other identity's fresh login. It needs an unconsumed, unexpired `link` challenge of this account for the same command, client and nonce, signed in at most 5 minutes ago and not before the challenge or `reauth_after`.
  - `gogospend_account_is_populated`: any committed entity or command receipt.
  - `gogospend_link_precheck`: read-only. Returns `linkable`, `already_linked`, `conflict`, `unavailable`, `proof_invalid` or `secondary_invalid`.
  - `gogospend_link_identity`: under the account lock, then the other identity's principal lock (the one bootstrap takes, so its first sign-in cannot race), consumes the secondary challenge and links:
    - an unknown identity is added as an alias;
    - an identity whose own account is empty has that account folded in: its aliases move over and the empty account is deleted;
    - an identity whose account holds data is a `conflict`.

    It then calls `gogospend_global_logout`: every binding ends, every alias is held, and refresh-grant revocation is queued.
  - Only `gogospend_app` can call these, and only inside an owner transaction.
- **Server:**
  - `POST /v1/me/identities` (recent proof; Idempotency-Key = the command id of both `link` challenges) answers 202 `{generation, provider_cleanup: "pending"}`.
  - `AccountLinkingService.link` runs in four steps:
    1. verify the other identity's ID token (`OidcProofVerifier.verifyLinkedIdentity`: the full challenge-proof checks for whatever subject signed in);
    2. the read-only precheck;
    3. the Auth0 link, only when the precheck says `linkable`;
    4. one transaction: `assertActiveSession`, `authorizePurpose(… 'link')`, then the link routine.
  - Linking the same identity as the signed-in one is a 422.
  - Auth0 down gives 503 and Auth0 refusing gives 409. Neither changes anything, and the same proofs still work.
  - `Auth0ProfileClient.link(primary, secondary)` (new `Auth0LinkGateway`, with `update:users` on the profile/link client). It is idempotent: it reads the primary's identities first, then `POST /api/v2/users/{primary}/identities`. 5xx or 429 means unavailable; other refusals are `LinkRefusedError`.
  - New contract types `LinkIdentityRequest` and `LinkIdentityResult`, and the problem code `ACCOUNT_LINK_CONFLICT`.
  - The runbook gains the flow, the failure cases and the tenant-proof steps.
- **RED against seams** (a precheck that always said `linkable`, a link routine that changed nothing, and a no-op Auth0 link): 10 of 10 database tests and 2 of 13 profile-client tests failed. One of the database failures was the test's own `populate` helper tripping the revision guard; it was fixed to advance the revision first.
- **GREEN:**
  - `npm run test -w gogospend-api -- --runTestsByPath src/auth/auth0-profile.client.spec.ts` gives 13 of 13.
  - `npm run test:db -w gogospend-api -- --runTestsByPath src/accounts/account-linking.integration.spec.ts` gives 14 of 14.
  - Implementing it surfaced one defect: a malformed linked-identity token threw from `decodeJwt` instead of being refused. It is now a 401.
- **Covered:**
  - a new method resolving to the same account;
  - an empty account folded in;
  - a populated account refused before Auth0 is asked;
  - data written during the Auth0 call refused under the lock;
  - stale, foreign, other-command and malformed proofs;
  - a used proof;
  - the same identity;
  - Auth0 outage and refusal;
  - an interrupted link with no second account;
  - an already-linked identity;
  - a held or deleted secondary;
  - the route over HTTP.
- **Mutants:** seven of eight guard mutants fail the suite (`f6c-mutants.log`). The eighth, dropping `authorizePurpose`, is equivalent in practice: a successful link moves the generation and `reauth_after`, so the same proof can never be replayed. The consumption stays as the plan's purpose-bound proof rule.
- **Deviations:**
  - `Auth0LinkGateway` is a separate interface implemented by the profile client, so read-only fakes are unchanged.
  - Auth0 is linked before the database transaction. Its failure modes are covered above; unlinking is not offered.
  - Linking signs every device out (global logout), so both identities sign in again once cleanup clears.
- **Full gate:** typecheck PASS, typecheck:app PASS, test:api PASS (448), test:db PASS (426), test:app PASS (16), test:unit PASS (173), test:render PASS (60), test:dev PASS (7), build PASS, export:web PASS, `git diff --check` PASS. One `gogospend_test_*` database seen afterwards belonged to a parallel worktree's running suite.

## Review fixes for F6b

- **F6b review** (commit `efa96b2`): no blockers, two majors, six minors and some nits; 12 mutants survived. The reviewer confirmed:
  - the HMAC envelope and its rotation and replay window;
  - raw-body fidelity;
  - receipt-first dedupe under concurrency;
  - no deadlocks across event, renewal and worker;
  - hold handover;
  - the privileges of every new routine;
  - that a generic jobs login and a forged lease are refused.
- **Fixed, with tests that failed first.** RED: 7 of 27 database tests and 1 of 8 unit tests failed, all on behaviour; then all passed. The other new tests pin behaviour the surviving mutants changed. All 14 re-applied mutants now fail the suite (`f6bfix-mutants.log`), including the four that first survived the new tests until those were sharpened.
  - **Major — a change that arrived before the account existed was lost.** A login from before the change could still create the account and bind.
    - The apply routine now takes the principal lock bootstrap takes.
    - Bootstrap (re-created in `0011`, otherwise unchanged) refuses a login from before the newest recorded change for the principal, including a `no_account` one. It refuses before creating anything, so no stray account is left.
    - A new account starts with that change as its watermark.
  - **Major — one bad provider time stalled reconciliation for everyone.**
    - Times are now checked in TypeScript (`usableChangeTime`): a real instant, not before 2000, at most 60 s ahead.
    - The database answers `invalid_time` instead of raising.
    - A permanent refusal for one identity is skipped and marked checked; only an outage fails the pass.
  - **Minor — old refresh grants survived when no session ended.** Every verified event now revokes grants behind a hold. A reconciled change ends nothing only when it is more than a day older than every live session.
  - **Minor — the database and verifier disagreed on the future limit.** The database now allows 90 s (60 s skew plus processing). The routine stays with `gogospend_bootstrap`; a dedicated role was not added (recorded).
  - **Minor — reconcile fairness.** Candidates are ordered by last check, or, never checked, by when their earliest live session began, so new sign-ins cannot starve older ones. The runbook's bound and its note on sharing the rate limit are updated.
  - **Minor — the sample Action.**
    - The issuer and URL now come from Action secrets.
    - Delivery is retried on 5xx or network errors and refusals are logged.
    - The id is a hash, so long user ids cannot truncate it.
  - **Nits:**
    - The events route has its own 8 KiB parser, which keeps the raw bytes; the general 2 MiB parser no longer keeps raw bodies.
    - An event for a disabled (or any non-active) account now applies, so re-enabling it revives nothing.
    - `reconcile:` event ids are reserved.
    - `ReconcileOutcome` includes `conflict`, `no_account` and `invalid_time`.
    - Receipt retention is handed to P5, noted in the runbook.
  - **Not changed (recorded):** the Action's `occurred_at` can be a few seconds after the real change, so a login in that window must sign in again. It is documented.
- **Full gate:** typecheck PASS, typecheck:app PASS, test:api PASS (448), test:db PASS (438), test:app PASS (16), test:unit PASS (173), test:render PASS (60), test:dev PASS (7), build PASS, export:web PASS, `git diff --check` PASS. The one `gogospend_test_*` database seen belonged to a parallel worktree's running suite.

## P4: private asynchronous export (local work)

- **Migration `0013_exports`** (numbered `0011` in its branch; renumbered at integration after F6b `0011` and F6c `0012`):
  - `exports`: one row per request. Its id is also the export job's id and the `export` entity's id. The owner's command writes the period and lifecycle generation. Only `gogospend_record_export` adds the file columns, once: object key, size, digest, row count, the revision it was read at and an expiry within 25 h of `ready_at`. CHECKs require the file columns all set or all null, and the key must be this export's own `export/<account>/<export>/…` publication.
  - **App access:** owner-read RLS, INSERT of the request columns only, no UPDATE or DELETE. `gogospend_export_job_status` gives the owner's export job state.
  - `gogospend_leased_export_rows` (leased-read role only) validates the lease through P1's `gogospend_leased_account(…, 'export')`. It takes the account and period from the stored job, which no worker login can change, and returns active records dated within the period in `(occurred_on, id)` order, with wallet and category names. Amounts are text. No account, identity, receipt or deleted rows.
  - `gogospend_record_export` (jobs role) needs a current `export` lease, an active account at the job's generation, and the object this lease published with the same size, digest and expiry.
- **Contract** (`packages/contracts/src/v1/privacy.ts`):
  - `ExportFilter` (`Pick<HistoryFilter,'from'|'through'>`), `ExportRequest`, `ExportRequestSnapshot`, the `ExportDto` union (`pending | ready | failed | expired`) and `ExportGrant`.
  - `EXPORT_CSV_COLUMNS`, `EXPORT_CSV_BOM`, `EXPORT_TTL_HOURS = 24`, `EXPORT_GRANT_MINUTES = 5`, `EXPORT_DOWNLOAD_PATH` and `exportFileName`.
  - Strict validators. `SYNC_ENTITY_VALIDATORS` gains `export`.
- **Request** (`POST /v1/exports`, `recent_proof`, 202): `ExportService.request(ctx, proofId, CommandInput<ExportFilter>)` runs through M1's `CommandExecutor` as the policy-exempt kind `export.request` (outcome `accepted`). Under the account lock, after the session re-check and receipt replay, the mutation:
  1. consumes a fresh `export` proof bound to the command id (`authorizePurpose`);
  2. queues the job through P1's `gogospend_enqueue_account_job` (3 attempts, 900 s per attempt);
  3. inserts the `exports` row;
  4. commits an `export` entity change (`{id, from, through}`).

  The export id is derived from (account, command id). The period is validated by `parseHistoryRequest`, so its date rules are exactly history's.
- **Status, grant and download** (`bound_session`, so no policy acceptance is needed):
  - `GET /v1/exports/:id`.
  - `GET /v1/exports/:id/grant` returns `{url, expires_at}`.
  - `GET /v1/export-files/:grant` returns `text/csv`, `Content-Disposition: attachment`, `no-store`. The body must match the recorded size and SHA-256.
  - Only the caller's own export is served, at the account's current lifecycle generation and while the account is active. Unknown, foreign, unready and expired exports are all the same 404.
  - Grants reuse S1's opaque account-bound HMAC construction (`SnapshotGrants`) under keys from `CommandDigester.deriveKeys('gogospend.export-grant.v1')`, so an export grant never verifies as a snapshot grant. They last five minutes and never outlive the file.
- **Worker** (`ExportHandler.run(lease)`, registered as `export` in `jobs/handlers.ts`):
  - It reads the high-water revision and every record page in one `LeasedAccountRead.withSnapshot(lease, 'export')` REPEATABLE READ view (new `LeasedReadTx.exportRows`).
  - It builds the CSV in bounded memory (`CsvWriter`: 64 KiB blocks, 64 MiB cap; larger fails terminally as `export_too_large`) and closes the view before the upload.
  - If the lease is no longer held it stops. Otherwise it reserves the key, PUTs, and in one `finishWithObjects` transaction publishes the file with a 24-hour expiry, records it and completes the job.
  - The worker's maintenance loop logs a count-only alert (`exportCleanupOverdue`) for export objects whose deletion is over an hour late or whose storage delete failed. P1's sweep deletes the file at its deadline.
- **CSV** (`csv-writer.ts`): RFC 4180, CRLF and a UTF-8 byte order mark. Every cell goes through a typed encoder:
  - `csvText` (notes, merchants, wallet and category names): a leading `=`, `+`, `-` or `@` (ASCII or full-width), tab, CR or LF gets a `'` prefix, including after leading whitespace, no-break or ideographic spaces, zero-width characters or a BOM. The cell is then quoted when it holds a comma, quote or line break.
  - `csvNumber` (exact `amount_minor` and the BigInt-free `amount` in baht): canonical numbers only, never prefixed.
  - `csvLiteral`: ids, dates and enum values in a safe charset only.
  - Columns: id, date, type, both amounts, `THB`, wallet id and name, category id, name and built-in key, source and destination wallet ids and names, merchant, note and version.
- **Client** (`apps/app/src/spend/v1/privacy.ts`):
  - `createPrivacyResources`: requests as the proof's command (Idempotency-Key = proof command id, schema 1), and validates status and grant DTOs exactly.
  - A download must match the ready export's size and SHA-256. The byte order mark is restored if text decoding dropped it.
  - The journey: `requestExport` (cancelled reauth requests nothing), `retryExportRequest` (an unknown outcome keeps the exact key, body and proof; `REAUTH_REQUIRED` asks for a new proof instead of signing out), `pollExport` (bounded) and `downloadExport` (a fresh grant each time; expired asks for nothing).
- **RED → GREEN** (assertion-level RED against compile-safe seams: stub writer, service, handler, leased read and client; real migration and contract; no module errors):
  - `npm run test -w gogospend-api -- --runTestsByPath src/exports/csv-writer.spec.ts`: 31 of 32 failed, then 32 of 32. The one that held at RED: ordinary text stays unchanged.
  - `npm run test:db -w gogospend-api -- --runTestsByPath src/exports/export.integration.spec.ts`: 15 of 15 failed, then 15 of 15. On the first RED run 10 failures came from helper throws (`expectOk`, an empty claim); those helpers now assert with `expect`, and the recorded RED is 15 assertion failures.
  - `npm run test:unit -w gogospend-app -- src/spend/v1/privacy.test.ts`: 8 of 9 failed (`ERR_ASSERTION`), then 9 of 9. Cancelled reauth already requested nothing.
  - The export, sync-API and migration DB specs were stable over 2 more runs (34 of 34 each).
  - Pinned `untrusted_csv_text_cannot_start_formula`: `csvText('=SUM(A1:A2)')` is `'=SUM(A1:A2)`.
- **Integration proofs** (`export.integration.spec.ts`, real v1 app, worker and memory store):
  - **Proofs:** a missing proof, a `global_logout` proof, a proof for another command, and a proof with `auth_time` 6 minutes old each get 401 `REAUTH_REQUIRED` and queue nothing. A valid proof is consumed once.
  - **Replay:** the same key and body returns the identical acknowledgement with one job and one row. A changed period is 409 `IDEMPOTENCY_MISMATCH`. A missing schema header is 422 before the proof is used, and the same key then succeeds.
  - **Policy:** an account that has not accepted the required terms gets 403 on a wallet write but can still export (a header-only CSV). With no binding the request is 401.
  - **Fields and period:** every entry and transfer field appears. Records on both edge dates are present; the day before, the day after and a deleted record are not. Hostile notes, merchant, wallet and category names are neutralized, and `99999999999` and `999999999.99` are exact.
  - **Reconciliation:** rows equal `GET /v1/history` for the same period record by record, and income and expense sums equal its summary.
  - **Nothing extra:** no account id, subject, binding, issuer, `receipt` or `attachment` text.
  - **Concurrent edit:** an edit, a delete and a create commit between leased pages. The file still shows the request-time state (`as_of_revision` before them), and a later export shows the edits.
  - **Deletion race:** an account set to `deleting` with a new generation after the upload publishes nothing, and the sweep removes the object. A cancel mid-read publishes nothing and reports `failed`.
  - **After ready:** an account that is `disabled` or `deleting`, or a new lifecycle generation, gets no grant or file (HTTP 401/403, service null, status `expired`).
  - **Cross-owner:** another account's status, grant and file are the same 404 body as an unknown id. A snapshot lease, a forged token and a wrong purpose cannot read export rows, and the leased-read login still cannot SELECT `transactions` or `exports`.
  - **Expiry and cleanup:** a grant is valid until 5 minutes and refused after. The file expires 24 h after `ready_at` (equal to the publication's `delete_after`) and the sweep deletes it.
  - **Failed cleanup:** a failed storage delete stays `deleting` and is counted overdue until the next sweep deletes it.
  - **Logs:** captured API logs and console output contain no note text, amount, grant, object key or digest.
- **Deviations, for review:**
  - **Export requests are synced.** M1's executor needs a change for the command's entity, and S1's parity test requires `SYNC_ENTITY_VALIDATORS` to cover every registered entity. So an `export` entity with its period only rides in deltas and snapshots. The app diary stores it and ignores it in totals. A client built before this change would refuse such groups; none has shipped.
  - **The grant `url` is a relative API path,** not a presigned storage URL: P1's `ObjectStore` never presigns. Downloading still needs the owner's bound session.
  - **Grants reuse `SnapshotGrants` (index 0)** rather than a new grant class.
  - **The ready DTO adds** `as_of_revision`, `row_count`, `bytes`, `sha256` and `expires_at` beyond the plan's interface, so the client can verify the file. The CSV starts with a UTF-8 BOM so spreadsheets read Thai.
  - **Category names:** a built-in category is named by its stable key (`food`); the server does not localize.
  - **File layout:** status, grant and file lookups live in `export.service.ts` (no repository file). `exportCleanupOverdue` lives in `export-handler.ts`, and `worker.ts` gained its alert step.
  - **Journal test:** `migrations.spec.ts` now compares the journal with the `.sql` files on disk and pins only `0001`–`0010` by name, so renumbering at merge needs no edit there.
  - **No per-account cap on open exports.** Each needs a fresh re-login proof, and requests share the write budget.
- **SKIPPED:**
  - **Hosted:** real private R2 delivery, grant, expiry and lifecycle evidence, and the synthetic real-scope export (P1's hosted gate, E1).
  - **E2 UX:** the settings/privacy screen; copy for queued, ready, expired, failed and reauthentication; save/share on devices; Thai and English review. No UI or locale strings were added.
- **For P5 (recorded, not changed):**
  - `exports` rows (period, size, digest, row count) stay after the file is deleted. The `export` change-log snapshots carry periods. P5's retention should purge or age out both, and its account purge removes them by cascade.
  - `gogospend_cancel_account_jobs` already cancels export jobs. `object_publications` rows outlive the account, so the sweep still deletes export files after erasure.
  - S1's row in the master migration table still reads "next free" although S1 took `0010`.
- **Full gate:** typecheck PASS, typecheck:app PASS, test:api PASS (35 suites, 469 tests), test:db PASS (29 suites, 412 tests), test:app PASS (16), test:unit PASS (182), test:render PASS (60), test:dev PASS (7), build PASS, export:web PASS, `git diff --check` PASS. The built API loads the new contract exports and `dist/exports/*`. My runs left no test databases; one other `gogospend_test_*` database existed, from concurrent runs.

## Integration: P4 merged

- **Merged:** P4 (built in its own worktree as `d8f191c`).
- **Migration:** renumbered from `0011_exports` to `0013_exports`, after F6b (`0011`) and F6c (`0012`). Journal and plan table are updated.
- **Journal test:** now checks the journal against the `.sql` files on disk, with the integrated prefix `0001`–`0013` pinned by name.
- **Full gate on the merged tree:** typecheck PASS, typecheck:app PASS, test:api PASS (480), test:db PASS (453), test:app PASS (16), test:unit PASS (182), test:render PASS (60), test:dev PASS (7), build PASS, export:web PASS, `git diff --check` PASS. The two `gogospend_test_*` databases seen belonged to parallel worktrees' running suites.

## Review fixes for F6c

- **F6c review** (commit `c0abc3f`): no blockers, four majors, five minors, nits; 14 mutants survived the commit's spec.
  - The reviewer confirmed that both fresh logins are enforced and that proofs can't be swapped or reused.
  - It also confirmed that the empty-account fold and cascades behave, that refusals roll back, that the route is classified and validated, and that nothing leaks.
- **Redesign, not a patch.** Linking at Auth0 before the database decided (majors 1 and 2) can't be made safe in place. The order is now reversed:
  - One transaction decides everything: both proofs, the alias, the fold, global logout, and queuing an `auth0_link_identities` job.
  - The security worker then merges the Auth0 users with the profile/link application.
  - Nothing irreversible happens at Auth0 before the commit. Until the merge runs, either login reaches the account through its alias, so an interrupted request leaves either nothing or a working link.
  - **Test-first deviation:** the routine and its tests were rewritten together. Because of that, there is no separate RED run against the old code for this round. The reviewer's probes (PA–PN) showed each defect on the old code, and every guard below is proven by a mutant that fails the new suite.
- **Fixed:**
  - **Major 1 — irreversible Auth0 link before the database decided.** Now database first, with the Auth0 merge as a fenced security job. It retries on outages (including 401, 429 and 5xx), fails visibly on 403 (`provider_forbidden`) or a refusal (`provider_rejected`), and is superseded when the identities are no longer both aliases. Merge jobs are a security kind: the job RLS policies are recreated in `0012`, `gogospend_link_job_subjects` reads the subjects per lease, and the payload holds digests only.
  - **Major 2 — the stated recovery could not happen.** There is no longer a pre-commit Auth0 step to recover from, and the runbook is updated.
  - **Major 3 — the other identity skipped sign-in checks.** It must now pass what its own sign-in would. Auth0 must report it unblocked with a verified email (403 `ACCOUNT_UNAVAILABLE`, `errors.email_unverified`). An Auth0 outage gives 503 with `retry_after_seconds`.
  - **Major 4 — its login was not checked against its own `reauth_after`.** It must now also postdate its own account's `reauth_after` and every credential change recorded for its principal, including F6b `no_account` watermarks.
  - **Minor — Auth0 error mapping.** 401, 429 and 5xx mean unavailable, 403 means forbidden, anything else is refused. The "already linked" check compares `user_id` as a string.
  - **Minor — revocation after a merge.** Listing grants of a user Auth0 no longer has (404) now counts as done, so cleanup after a merge cannot strand holds. This path is not covered by a test: the fake lists nothing rather than answering 404. It is a tenant-proof item.
  - **Minor — "holds data" was too strict.** Untouched built-in categories (seeded by opening Add) are not data, so an otherwise-empty account folds. Command receipts alone no longer count.
  - **Minor — validation.**
    - An empty secondary token is a 422.
    - A bad secondary token is `PROOF_INVALID`, like `/auth/proofs`.
    - 503s carry `retry_after_seconds`.
  - **Nits:**
    - The link routine consumes the primary proof itself, and checks that the caller's identity is an alias of the account.
    - Linking now needs the current terms (it is not a privacy operation).
    - The precheck routine is gone, since nothing happens before the transaction.
- **Not changed (recorded):**
  - The `connection_id` for the `auth0` provider with several database connections, and the merged user's refresh-token behaviour, are tenant-proof items in the runbook.
  - Lock order (account, then the other principal, then the other account) is unchanged. A cycle with bootstrap needs the other identity to already be an alias and to sign in at that instant.
- **Tests:**
  - `account-linking.integration.spec.ts` passes 18 of 18. It newly covers:
    - DB-first ordering;
    - the merge job: outage, refusal, missing scope, supersede, role isolation;
    - unverified, blocked and unavailable profiles;
    - the other account's `reauth_after`;
    - the principal watermark;
    - the current-terms requirement;
    - the built-in fold;
    - data written while the link waits on the other account's lock;
    - the nonce and client binding.
  - The profile and management client specs pass 24 of 24.
  - Seventeen guard mutants each fail the suite (`f6cfix-mutants.log`), including the four the reviewer's probes could not catch.
- **Full gate:** typecheck PASS, typecheck:app PASS, test:api PASS (480), test:db PASS (457), test:app PASS (16), test:unit PASS (182), test:render PASS (60), test:dev PASS (7), build PASS, export:web PASS, `git diff --check` PASS. The one `gogospend_test_*` database seen belonged to a parallel worktree's running suite.
- **Integration note:** P5 (running in parallel on `60ba012`) sees the old `0012`. If its migration recreates the job policies, they must keep all three security kinds when merged.

## Review fixes for F5

- **F5 review** (commit `f627fad`): five majors, four minors and some nits. The reviewer's probes (`f5.probe.test.ts`) showed:
  - a failed account switch leaving B's SDK credentials beside A's binding;
  - server-ended sessions never leaving `active`;
  - offline token reads locking the session;
  - sign-in racing hydrate and sign-out.

  Six mutants survived the F5 suite.
- **Fixed, with tests that failed first.**
  - RED: 36 of 46 tests in `sessionMachine.test.ts` and `sessionEpoch.test.ts` failed, all on assertions (`f5fix-red-unit.log`). They ran against compile-safe seams: new port and request options typed but unused, stub stores. Ten held already: the four earlier transport tests, hydration, serialized token reads, the token-only, 401-after-change and lost-command mutant checks, and the pinned test.
  - GREEN: 46 of 46.
  - The probes became tests on a shared fake device (`auth/testing/fakeDevice.ts`). It is the native SDK's shape behind the real adapter, so a login that is stored too early shows up as SDK credentials.
  - **Major — the bootstrap login was not fresh.**
    - The nonce login now asks for `max_age=0`. The old test that pinned "no max age" now pins 0.
    - `REAUTH_REQUIRED` from bootstrap is its own outcome (`SignInOutcome` `reauth_required`), not `failed`.
  - **Major — server-ended sessions never reached the provider.**
    - After its one allowed refresh, the transport reports 401 `SESSION_REQUIRED` and `REAUTH_REQUIRED` on bound routes, and 403 `ACCOUNT_UNAVAILABLE`, through `V1Credentials.sessionEnded`. Each report carries the epoch the request was sent under.
    - The seam (`v1SessionCredentials`, used by `sharedV1.ts`) forwards it to the provider. The provider ignores any report that isn't for the current epoch.
    - `SESSION_REQUIRED` and `REAUTH_REQUIRED` move the session to `reauth_required`, which is now reachable. The account and its drafts stay.
    - `ACCOUNT_UNAVAILABLE` signs out locally.
    - A stale `SESSION_REQUIRED` for A that arrives after a switch to B is dropped by the transport, and the provider would ignore it anyway.
    - Not reported: requests with their own credentials, token-only routes, and a refused purpose proof (new `proof: true` option).
  - **Major — interactive logins overwrote the stored SDK credentials.**
    - The port's `authorize()` now returns the new credentials without storing them (`PendingCredentials`). The challenge and bootstrap carry that login's own token (new transport option `credentials`).
    - The login is stored only after the server accepted it: the binding first, then `saveCredentials`. If the SDK save fails, the previous binding goes back (or the store is cleared) and the new binding is revoked.
    - `authorizeWithNonce` never stores anything, so a purpose proof can't replace the active session's credentials.
    - A sign-in from an existing session (a switch, or after a lock or a server-ended session) runs beside it: `bootstrapped` is accepted from `active`, `locked` and `reauth_required`. A cancelled or failed switch leaves the same snapshot, the same epoch and A's credentials. A cold start resumes A with A's token.
  - **Major — sign-in, sign-out and hydrate raced.**
    - They now run one at a time through a queue. A second sign-in joins the first. A sign-in during hydrate waits for it, so the binding store and the session agree.
    - A sign-out wins at once. It moves the epoch even from `bootstrap_pending` (`signed_out` always starts a new epoch unless already signed out), and supersedes the running and queued flows.
    - A superseded flow checks after every await and stores nothing. A bootstrap result that arrives too late is revoked with its own login.
    - Refused transitions have no side effects. A sign-in that can't start does nothing. Hydrate while `active` or `reauth_required` reads nothing and moves nothing.
  - **Major — a network error was treated as a denial.**
    - The adapter now throws `AuthUnavailable` for network or timeout failures, and returns null or false only for denials (no credentials, `invalid_grant`, unknown errors).
    - The provider never locks on `AuthUnavailable`. The transport turns a credential read or refresh that rejects into a `network` outcome, so the S4 diary resolver recalls the known account instead of closing the diary (new test through the real resolver).
    - A lock lifts through `hydrate()` (from `locked` it tries a forced refresh) or `refreshAfterUnauthorized()` once the credentials work, with the same epoch (`token_refreshed` now moves `locked` to `active`).
  - **Minor — sign-out.**
    - Revokes the session's binding and the stored binding with the SDK's own token, also from `locked`, where the seam shows no binding.
    - Waits for a running commit or forced refresh before clearing the SDK.
    - Revokes before clearing.
    - Dispatches `signed_out` first, so the session ends even if `bindings.clear()` throws. The error is then reported.
  - **Minor — refresh per expired token.**
    - After a 401, the transport first re-reads the token. If another request already renewed it, the request is resent with the new token and no second refresh (PROBE-7).
    - The provider never hands out a read that started before a refresh (a token generation), and a read during a refresh waits for it (PROBE-8).
  - **Minor — `maxAge` 0 may be dropped by the native bridge.** A fresh login sends `max_age` and `prompt=login` as explicit `additionalParameters`, not as the typed `maxAge`. `auth0-native-proof.md` says to verify this (exactly once on the authorize URL) when the SDK is wired.
  - **Minor — plan deviations.**
    - `sessionStore.ts` adds the SecureStore binding store (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`, exact `{accountId, binding}`, malformed reads as nothing). It also adds the epoch store.
    - The epoch is persisted, 64 at a time, topped up halfway, so a launch starts above anything an earlier launch handed out (70 identity changes, then a new launch).
    - `auth0Client.ts` and `auth0Client.web.ts` now export the same names (`createAuth0Port(sdk | null, audience)`, `AuthCancelled`, `AuthUnavailable`). Shared types are in `auth0Port.ts`. A native build without an SDK is unsupported, like the web.
  - **Nits:**
    - Hydrate while `active` no longer moves the epoch.
    - `installCredentialProvider` unsubscribes the replaced provider.
    - The `deviceSync.ts` comment now describes the per-token refresh and the server-ended reports.
    - The bootstrap binding validator accepts exactly the server's 43-character base64url (`SESSION_BINDING`).
    - `reauthenticate` refuses `bootstrap` at runtime before any call.
    - `reauth_required` keeps the identity and the epoch, as the docs said.
  - **Pinned test** `return_to_a_does_not_accept_old_a_response` now drives the real provider, seam and transport. A request goes out as A, the user switches to B and back to A with the very same binding, and then A's first response arrives. That response is never applied, and the whole session, seam and view state is equal before and after it. It passed at once, because the transport's final epoch check already held.
- **Mutants:** 52 applied one at a time and restored (`f5fix-mutate.py`, `f5fix-mutants.log`). All 52 are killed, including the reviewer's six survivors:
  - the epoch ignoring binding changes;
  - the binding sent on token-only routes (now tested from a bound session);
  - the epoch checks around the refresh;
  - sign-out clearing the SDK before revoking;
  - the seam exposing the binding while locked;
  - the network-retry epoch check.

  The first pass left five survivors:
  - three were redundant epoch checks around the refresh, each followed by another check after one more await. They are now collapsed into one check after the re-read and one after the refresh.
  - two needed tests: a read during a refresh, and the rollback when the new login can't be stored.

  Three tests were added for these: those two, and a session change during the first token read sending nothing. Each fails with its mutant applied. Final count: 49 of 49.
- **Test update outside F5:** `spend/v1/resources.test.ts` "a sign-out during a command retry stops resending" changed the epoch on the second snapshot read. The transport now checks the epoch right after reading the token, so a request never goes out with one identity's binding and another's token. The fake now signs out once the first attempt reached the server. The test still fails with the retry check removed (M8).
- **Not changed (recorded):**
  - **`REAUTH_REQUIRED` on a proof-carrying command** (`proof: true`) refuses the proof, not the session. F4's `authorizePurpose` uses that code for a stale or missing proof. No app command carries a proof yet.
  - **A successful switch** does not revoke the previous account's binding. It is replaced locally and expires after 7 idle days; revoking it amounts to signing A out, which is a product decision.
  - **A bootstrap response the transport dropped** (the epoch moved) can't be revoked, because its binding is never seen. Without the user's token it is unusable, and it expires after 7 idle days. A late result the provider does see is revoked.
  - **Unknown SDK errors** count as denials: they lock, and the lock lifts later. Only network or timeout failures count as unreachable. The real codes are checked when the SDK is wired.
  - **An unreadable binding store** at hydrate starts signed out (nothing erased). An unreadable epoch store starts at 0.
  - **`ACCOUNT_UNAVAILABLE`** signs out without revoking, because the server already refuses that binding.
  - **The root wiring** (call `hydrate()` at launch and on foreground) waits for the SDK (E1). It is in the proof procedure.
  - **`AuthSessionProvider.tsx`** stays replaced by `installCredentialProvider`, as recorded for F5.
- **SKIPPED** (needs E1/E2; see `auth0-native-proof.md`):
  - the SDK install;
  - `max_age`/`prompt` on the real authorize URL;
  - the SDK's error codes;
  - SecureStore accessibility on devices;
  - offline launch and offline token reads on iOS and Android builds;
  - every tenant check.
- **Full gate:** typecheck PASS, typecheck:app PASS, test:api PASS (437), test:db PASS (397), test:app PASS (28), test:unit PASS (206), test:render PASS (60), test:dev PASS (7), build PASS, export:web PASS, `git diff --check` PASS. This run left no test databases behind; one older `gogospend_test_*` database from another process was left alone.

## Integration: F5 review fixes merged

- **Merged:** the F5 review fixes, built in their own worktree as `9b7084f` on `bd94d1c`.
- **Conflicts:** only these receipts.
- **Full gate on the merged tree:** typecheck PASS, typecheck:app PASS, test:api PASS (480), test:db PASS (457), test:app PASS (28), test:unit PASS (215), test:render PASS (60), test:dev PASS (7), build PASS, export:web PASS, `git diff --check` PASS.

## P2a: bounded private upload quarantine (local work)

- **Migration `0014_import_intake`** (numbered `0011` in its branch; renumbered at integration):
  - `import_uploads`: one row per upload attempt, keyed by the import's job id (derived from the account and the `Idempotency-Key`). It holds no file content. The same row is the upload record, the import job's record and the quota ledger. Owner-read RLS; the app writes it only through routines. The file name (a display label, never part of a key) is cleared when an upload is refused, fails or expires.
  - App routines (owner transaction, common account lock):
    - `gogospend_begin_import_upload`: marks the account's stale `receiving` rows failed, replays a known id, applies the quotas, records the attempt (10-minute receive deadline);
    - `gogospend_reserve_import_part`: registers each part's key in P1's `object_publications` before its PUT;
    - `gogospend_finish_import_upload`: re-checks deadline, account and generation, matches the parts to their reservations, re-checks the 24-hour quotas, then publishes the parts for 24 hours, accepts the upload and queues one `import_parse` job (the import's own id) plus one `import_expire` job due at expiry;
    - `gogospend_abort_import_upload` / `gogospend_discard_import_parts`: end an upload as rejected or failed, move its parts to `deleting`, and mark them `deleted` once the storage deletes succeed;
    - `gogospend_import_job_status`.
  - Worker routine `gogospend_expire_import`, run inside P1's fenced completion transaction.
  - `jobs_worker_insert` now also refuses `import_parse` and `import_expire`, so the worker login cannot mint a job that reads a quarantined file.
- **Contract** (`packages/contracts/src/v1/imports.ts`): limits, formats, content types and extensions, `ImportJobDto`/`UploadAccepted`, statuses (`queued | parsing | parsed | failed | cancelled | expired`), `parseImportFileName`, `importFormatForContentType`, `importFormatForExtension`, `isImportJobDto`, and message keys for each limit and for HEIC. New problem codes: `INVALID_FILE_NAME`, `UPLOAD_EMPTY`, `UPLOAD_TOO_LARGE`, `UPLOAD_UNSUPPORTED_TYPE`, `UPLOAD_TYPE_MISMATCH`, `UPLOAD_INCOMPLETE`, `UPLOAD_LIMIT_REACHED`, `UPLOAD_IN_PROGRESS`, `UPLOAD_FAILED`.
- **API** (`src/imports`):
  - `POST /v1/imports` (`current_policy`) takes the raw body: `Content-Type`, a percent-encoded `X-GoGoSpend-File-Name`, an `Idempotency-Key` and an optional `Content-Length`. It returns 202 `UploadAccepted`.
  - `GET /v1/imports/:id` (`bound_session`) returns the caller's own accepted import. Another account's id, an unknown id, a malformed id and a refused upload all get the same 404.
  - **Disabled by default:** `IMPORT_UPLOADS_ENABLED` (off unless `1`/`true`; any other value stops startup). While off, the upload route answers 404 without reading the body.
  - `UploadIntake.accept(ctx, stream, metadata)`:
    - name, type, extension and declared length are refused before any byte is read; at most 8 intakes run per process (503 otherwise);
    - `begin` applies the quotas and idempotency under the account lock;
    - the body is read chunk by chunk. The first 64 bytes are sniffed before anything is written. The 12 MiB cap, and any declared length, is enforced before a chunk is kept. CSV is checked for binary bytes throughout;
    - every 1 MiB part is registered, then PUT and HEAD-verified. At most one part is held in memory, so neither the intake nor the S3 adapter (which buffers a body to hash it) ever holds a whole upload;
    - `finish` accepts under the account lock, after re-checking session, account and policy;
    - any refusal or failure records its outcome and deletes what was written at once; the sweep is the backstop. Leaving the request early never destroys the socket: the controller discards the unread rest so the error still reaches the client.
  - Sniffing: JPEG, PNG, WebP, XLSX (ZIP local header) and CSV (text with no C0 controls besides TAB/LF/CR, in any single-byte or UTF-8 encoding) are accepted. HEIC/HEIF (ISO-BMFF brands) answer 415 with the HEIC message key. AVIF and other `ftyp` files, legacy XLS, PDF, GIF, TIFF and UTF-16 text answer 415. Anything else that differs from the declared type (an empty ZIP, an executable, RIFF audio, CSV with a NUL) answers 422 `UPLOAD_TYPE_MISMATCH`.
  - File names: NFC, 1–128 characters, a final extension, no `/ \ : * ? " < > |`, no control, bidi or zero-width characters, no leading dot and no surrounding spaces. The extension must match the declared type.
  - **Quotas** (sliding windows on the database clock, decided under the account lock):
    - 5 attempts (accepted or refused) per 15 minutes, checked at begin;
    - 50 MiB of accepted bytes per 24 hours, checked at begin with the declared length, and again at finish with the real size;
    - 10 parse jobs per 24 hours, checked at begin counting uploads still receiving, and again at finish.
    - A refusal is 429 `UPLOAD_LIMIT_REACHED` with `retry_after_seconds` (the exact time room returns) and a message key naming the limit. A limited attempt records nothing.
  - **Replay:** the same key with the same name and type returns the original acceptance without reading the body; other content under the key is 409 `IDEMPOTENCY_MISMATCH`; a key still streaming is 409 `UPLOAD_IN_PROGRESS`; a refused key repeats its refusal; a failed key is 409 `UPLOAD_FAILED` (start again with a new key).
- **Parse job choice:** no `import_parse` handler is registered until P2b. The generic worker claims only registered kinds, so those jobs stay queued and the worker's backlog report names them ("… queued with no handler in this worker"). The expiry job cancels them at 24 hours. Nothing is parsed, and no transaction is written.
- **Expiry and sweeping:**
  - The worker's `import_expire` handler (`import-expiry.ts`, registered in `buildHandlers`) runs `gogospend_expire_import` through `finishWithObjects` with no objects (account lock, current lease, active account at the job's generation), in the same transaction as its completion. It cancels a parse job still queued or running, marks an unparsed import `expired` (clearing its name and digest), and makes its parts due. It then sweeps the account. Not due yet: it fails retryably and changes nothing.
  - P1's sweep now also lists `import_quarantine/` for orphans (`QUARANTINE_PURPOSES`; `reserveKey` stays lease-only). Published parts carry a 24-hour registry deadline, so the sweep deletes them even if the expiry job never runs. A crashed API's reservations are deleted 15 minutes after the upload's deadline.
- **Fixtures:** `src/imports/fixtures/synthetic-uploads.ts` holds synthetic magic-byte bodies and made-up CSV rows (HEIC/HEIF/AVIF, PDF, GIF, legacy XLS, executable, RIFF audio, UTF-16, CSV with NUL, an empty ZIP), path-like and disguised names, and a metered stream for oversized bodies. The legacy `spend/fixtures` samples are unchanged and read only: the HTTP spec uploads one into quarantine.
- **RED → GREEN** (assertion-level RED against compile-safe seams, no module errors). The seams: an intake that read the whole stream into memory and returned a made-up acceptance; a repository that did nothing; a migration with the table and two routine signatures returning nothing useful; an expiry handler that only completed its job; permissive contract helpers.
  - Unit: `npm run test -w gogospend-api -- --runTestsByPath src/imports/upload-intake.spec.ts`. RED: 73 of 73 failed on assertions. GREEN: 73 of 73.
  - Database and HTTP: `npm run test:db -w gogospend-api -- --runTestsByPath src/imports/upload-intake.integration.spec.ts`. RED: 23 of 25 failed on assertions. Two passed at once: the controller's undecodable-name check and the Drizzle drift check. GREEN: 25 of 25, stable over 3 runs.
  - Before the recorded RED run, the HTTP helper got a 15 s reply bound (a seam that waited for a held-back body hung the suite) and the quota seed got explicit parameter types. That first run's `afterAll` timed out and left one test database and its 8 logins. I identified them as mine (the RED-seam routine stub) and dropped them.
  - GREEN also corrected two retry bounds in the quota tests. Seeded uploads are accepted a minute after they are created, so room returns at 23 h 01 min and 22 h 01 min.
  - Pinned `oversized_stream_is_rejected_before_buffering`: a chunked 12 MiB + 1 body gets 413 `UPLOAD_TOO_LARGE`, and the store received at most the cap (`bytesBufferedBeyondCap` = 0). Nothing is left in quarantine or live in the registry, no job is queued, and the row is `rejected`/`too_large`. The unit version also shows the intake stopped pulling at the first chunk past the cap and closed the source.
  - **Concurrency proofs:**
    - 8 concurrent uploads from one account give exactly 5 × 202 and 3 × 429 (uploads message key, Retry-After ≤ 15 min), with 5 rows and 5 parse jobs;
    - with 50 MiB − 3 KiB already accepted, two concurrent chunked 2 KiB uploads give exactly one 202 and one 429 (bytes; retry 23 h 01 min), leaving one part in quarantine;
    - ten parse jobs today give 429 (parse jobs; retry 22 h 01 min).
  - **Other proofs:**
    - a client that disconnects mid-stream leaves the row `failed`/`upload_incomplete` and nothing in quarantine;
    - a session revoked mid-stream gives 401, with nothing kept (`failed`/`session_ended`);
    - an API that died between a PUT and finishing: its part survives the sweep until its deadline and is then deleted, and the row turns `failed`/`deadline_passed`;
    - expiry at 24 hours (aged rows) deletes the parts, cancels the parse job and shows `expired`;
    - the app login cannot write `import_uploads` or read `object_publications`, and the worker login can neither mint import jobs nor read `import_uploads`;
    - the transaction count is unchanged by every accepted or refused upload.
- **Deviations:**
  - One `import_uploads` table instead of separate uploads, import-jobs and quota-counter tables. Quotas are exact sliding windows counted from these rows under the account lock, not bucketed counters. Rows must outlive 24 hours for the daily windows; P5 owns their retention.
  - Raw-body upload with header metadata, not multipart, so the body streams with no parser dependency (and no new dependency).
  - Quarantine is up to 12 one-MiB parts rather than one object, so no adapter ever buffers a whole upload.
  - Quarantine keys are registered by app routines, with the attempt's intake token in the lease-token slot, not by `reserveKey`. `QUARANTINE_PURPOSES` is new.
  - Extra files: `import-expiry.ts` (keeps Nest out of the worker) and the fixtures module.
  - The contract adds a `parsed` status for P2b's preview.
  - Limit copy is message keys plus `retry_after_seconds`. The Thai/English text lands with P3's import UI after visual approval.
  - `src/database/migrations.spec.ts` lists this migration's tag (every migration extends that list). Renumber it at merge along with the file, the journal and the master-plan table.
  - The parse job's 120 s runtime and 3 attempts are set now, for P2b.
- **SKIPPED:**
  - One real bounded R2 quarantine upload and its expiry cleanup, on synthetic data. This needs P1's hosted gate (E1 test scope). Uploads stay disabled until both pass.
  - The client upload flow and copy (P3).
  - `dev:v1` was not run from this branch: it would migrate `gogospend_v1` with this migration.
- **Notes for P2b, P2c and P3:**
  - P2b registers the `import_parse` handler. It reads the parts in order from `object_publications` (`job_id` = the import id, purpose `import_quarantine`, `published`), verifies each part's and the whole file's SHA-256 against the registry and `import_uploads`, and must not rely on the raw file after `expires_at`.
  - The expiry job leaves an import whose parse job succeeded as is (no status change) and still deletes its raw parts.
  - The worker login can read every quarantine object (P1's design), so parser isolation stays P2b's child-process boundary.
- **Full gate:** typecheck PASS, typecheck:app PASS, test:api PASS (510), test:db PASS (422), test:app PASS (16), test:unit PASS (173), test:render PASS (60), test:dev PASS (7), build PASS, export:web PASS, `git diff --check` PASS. No test databases or logins left behind.

## Integration: P2a merged

- **Merged:** P2a (built in its own worktree as `307f2a4` on `bd94d1c`).
- **Migration:** renumbered from `0011_import_intake` to `0014_import_intake`.
- **Security fix while merging:** its recreated `jobs_worker_insert` policy was written against an older base. It now excludes all three security kinds (`auth0_revoke_grants`, `auth0_security_reconcile`, `auth0_link_identities`) as well as the app-only kinds. Otherwise a generic jobs login could have created reconcile or link jobs. F6c's role test covers this.
- **Shared registration points combined:** the handler registry (export and `import_expire`), the module list, the contracts index, `schema.ts` (`importUploads`), the journal and the plan table.
- **Full gate on the merged tree:** typecheck PASS, typecheck:app PASS, test:api PASS (553), test:db PASS (482), test:app PASS, test:unit PASS, test:render PASS (60), test:dev PASS (7), build PASS, export:web PASS, `git diff --check` PASS.
- **Leftover databases:** two `gogospend_test_*` databases belonged to the running P6a worktree. A third is from an exited process of unknown origin; it was left alone.

## P6a: backup, recovery inventory and restore safety (local work; P6a not complete)

- **Status:** built and tested locally against fakes and the loopback Docker PostgreSQL 17. P6a is **not complete**: every hosted part (Neon PITR/branches/snapshots, R2 recovery, attachment and control scopes, managed key configuration, measured RPO/RTO) is **SKIPPED** until E1, and P6a also depends on P5 (the real erasure registry) and P2c (real attachment tables), neither built yet. A failed or SKIPPED restore rehearsal blocks beta (P6b).
- **Base:** this worktree was created at `c009c7e` (main) and fast-forwarded to `c0abc3f` before any change.
- **Files** (`scripts/ops/`, no migration, no new dependency):
  - `backup.mjs`: `runDailyBackup` takes one backup set (encrypted logical dump, then the encrypted accepted-attachment copy, then a MAC'd manifest); any failure discards the whole set. `localRecoveryStore` accepts only an owner-only (0700) directory outside the repository, writes 0600 parts through exclusive temp files, verifies each part's size and SHA-256 on read, and prunes sets at their 7-day expiry. `localDockerDump` runs `pg_dump` inside the local container over its socket: no secret in any argument, stderr discarded. CLI: `--target local … --key-fd N`; `--target hosted` exits 3 (SKIPPED).
  - `recovery-crypto.mjs`: the recovery key lives in a private field (JSON, inspection and strings show only its id). It is read from an inherited descriptor; an ordinary file is refused. Streams are 64 KiB AES-256-GCM records with a per-file HKDF key, counter-and-final-flag nonces and the header as AAD, so each record is verified before its plaintext is released and truncation, reordering or appending fails.
  - `recovery-inventory.mjs`: `RecoveryInventory.enumerate()` lists database history, branches, manual snapshots, logical and object backups and restore-created copies from pluggable sources. It refuses a copy with no expiry, more than 7 days of retention, an expiry more than 7 days away, a copy still listed past its expiry, or a non-production copy that is not synthetic. A failing source fails the inventory. `report()` lists the four hosted sources as SKIPPED (`complete: false`). `canClearMarker` needs a complete inventory and the expiry of the last copy taken at or before the marker. `localRestoreLedger` records each restore-created database (≤7 days; default 24 h).
  - `restore-rehearsal.mjs`: `restoreRehearsal(input)` → `RestoreReceipt`, in the order in `docs/operations/restore.md`. Nothing is read or created before the target, ledger, recovery-key custody and erasure registry pass. It never switches traffic (`serving_switch: "not_performed"`) and always drops the target it created. CLI: `--target local-isolated-synthetic`; `--target isolated-synthetic` exits 3 (SKIPPED).
  - `erasure-markers.mjs`: the marker contract P5 must satisfy (below), `planErasure` and an in-memory registry.
  - `local-postgres.mjs`: the Docker restore adapter (creates and drops only databases it named; generic erasure by `account_id` discovery; reapplies 0001's `REVOKE TEMPORARY … FROM PUBLIC`, which a per-database dump does not carry) and the end-to-end rehearsal.
  - `ops-safety.mjs`: `OpsError` (fixed code and message; details keep only short identifiers, counts and dates), the filtered log, and CLI parsing that refuses unknown or secret-shaped arguments without echoing them.
  - Root scripts `test:ops` and `ops:rehearsal:local`; runbook `docs/operations/restore.md`.
- **Marker contract for P5:** `{marker_id, account_id, subject_lookups, lookup_key_id, recorded_at}` and nothing else. Each lookup is `deriveSubjectLookup(key, issuer, subject)` = HMAC-SHA256 over `gogospend-erasure-subject-v1\0<issuer>\0<subject>`, base64url. The registry is an `ErasureMarkerSource` `{independent: true, location, listMarkers(), lookupKey()}`. `listMarkers` throws rather than return `[]` when it cannot read, and `lookupKey` returns a `SubjectLookupKey`. A restore erases each marker's account and any account holding a listed alias created no later than the marker; a later sign-up with the same subject is kept.
- **RED** (compile-safe stubs that copied plaintext, skipped every check and returned a success receipt; `p6a-red.log`): `node --test scripts/ops/recovery-inventory.test.mjs scripts/ops/restore-safety.test.mjs` → 56 failed, 2 passed of 58, all on assertions. The two passing are positive paths the stubs met (exactly 7 days accepted; `latest` picks the newest). One failure surfaced as the stub's unhandled leaky dump rejection, which is the redaction behaviour under test. No module or import errors.
- **GREEN:** the same command → 58 of 58. Added afterwards, not RED-first: a record-boundary truncation, header-only and appended-data case in the stream test, and a direct test of the error-detail/log filter. Now 59 of 59 (`npm run test:ops`).
- **Covered:**
  - refused before any read or create: serving, unlabelled-serving, `gogospend_v1`, production, non-isolated, unclaimed-isolation, non-disposable-name, non-loopback and hosted targets; a missing, dependent or unreadable registry; missing registry key custody; markers from another lookup key; a marker with extra fields; missing recovery-key custody; no ledger;
  - refused before create: a different recovery key, a missing backup, an expired backup and a manifest edited to extend its expiry;
  - tampered and truncated ciphertext (target dropped); erasure that leaves rows; a missing retained attachment;
  - owner-only, plaintext-free backup files; shared and in-repository stores; retention over 7 days; non-synthetic non-production backups; plaintext key files;
  - redaction: synthetic connection strings, access keys and baht/satang values injected into dump, attachment, registry, inventory and restore failures, the local dump's stderr, a target label and CLI arguments appear in no error, log or receipt;
  - the API's three env examples and `apps/api/src` contain no recovery credential name and never import `scripts/ops`.
- **Mutants:** 25 of 26 guard-removing mutants fail the suite (`p6a-mutants.log`). The survivor drops the secret-shaped-flag pattern; it is equivalent in practice because the allow-list already refuses every unknown flag.
- **Local end-to-end rehearsal** (`npm run ops:rehearsal:local`, PASS): a migrated synthetic source with three accounts was backed up (190 KiB dump, 3 attachment objects, 62 ms). Markers were recorded for one account by id, one by a linked alias only and one never backed up, then two accounts were deleted in the source. `gogospend_v1` was refused as a serving target before any connection. Restoring the pre-deletion backup into a fresh private database gave `erased_owner_rows: []` across every `account_id` table, `missing_retained_objects: []`, markers 2 applied / 1 not present, both erased aliases in `blocked_principals`, the kept account byte-identical with its 3 transactions, and `TEMPORARY` revoked from PUBLIC (restore 70 ms, erasure 24 ms, validation 8 ms). A one-byte ciphertext change was refused with `BACKUP_INTEGRITY` and left no database. Every database it created and its temporary recovery directory were removed; `gogospend_v1` and roles were not touched.
- **Deviations:**
  - Four helper files beyond the planned five (`ops-safety`, `recovery-crypto`, `erasure-markers`, `local-postgres`).
  - Encryption uses `node:crypto` (AES-256-GCM, HKDF) instead of an external tool such as age, so no dependency or binary was added.
  - `rehearsal_attachment_refs` stands in for P2c's tables; P2c supplies the real reference query, and a schema with attachment tables but no query is refused.
  - The restore erases accounts itself (delete accounts, cascade, plus direct deletes from `account_id` tables that do not follow `accounts`). P5 should provide its own reapply routine, which must also re-queue provider cleanup for a marker whose deletion was still in progress.
  - Hosted adapters are placeholders that refuse with `HOSTED_ADAPTER_NOT_AUTHORIZED`.
- **Findings for later tasks:**
  - A per-database logical dump carries no roles, role attributes, `CONNECT` grants or database-level ACL/settings. The local adapter reapplies 0001's database hardening; a real serving switch (P6b/E3) must also restore the serving logins' grants and recheck roles.
  - A restore can block only aliases present in the restored copy, because markers hold keyed lookups rather than principal digests. An alias absent from an older backup is not re-blocked; its provider identity is already deleted by then.
  - `auth_event_receipts` keeps its principal digest with `account_id` set to NULL; P5 decides whether erasure purges it.
  - Markers are not signed. Someone able to delete a marker in the control scope could let a restore resurrect that account, so P5's registry should be append-only (object lock or versioning).
- **SKIPPED (E1 not authorized):**
  - hosted PITR restore with measured RPO ≤ 1 h / RTO ≤ 4 h, and the daily-backup fallback RPO ≤ 24 h;
  - seven-day PITR configuration;
  - Neon dump through managed configuration;
  - the R2 recovery scope and its 7-day lifecycle rule, and the R2 accepted-attachment copy (also needs P2c);
  - the hosted erasure registry (also needs P5);
  - the hosted inventory sources (`neon-history`, `neon-branches`, `neon-snapshots`, `r2-recovery-objects`);
  - `--target isolated-synthetic`.
- **Full gate:** typecheck PASS, typecheck:app PASS, test:api PASS (448), test:db PASS (426), test:app PASS (16), test:unit PASS (173), test:render PASS (60), test:dev PASS (7), test:ops PASS (59), build PASS, export:web PASS, `git diff --check` PASS. No rehearsal or restore database was left behind. One `gogospend_test_*` database seen afterwards was created before this gate's database suite started and belongs to another worktree's run.

## Integration: P6a (local part) merged

- **Merged:** P6a's local part (built in its own worktree as `f9cb77f` on `c0abc3f`).
- **Changes:** no migration. Root scripts gain `test:ops` (59 tests) and `ops:rehearsal:local`.
- **Full gate on the merged tree:** typecheck PASS, typecheck:app PASS, test:api PASS (553), test:db PASS (482), test:app PASS (28), test:unit PASS (215), test:dev PASS (7), test:ops PASS (59), test:render PASS (60), build PASS, export:web PASS, `git diff --check` PASS.
- **Leftover database:** one `gogospend_test_*` database belongs to an exited process of unknown origin and was left alone.
- **Open for P5:**
  - satisfy the erasure-marker contract in `scripts/ops/erasure-markers.mjs`: keyed subject lookups, an append-only registry, and `listMarkers` that throws rather than returning empty;
  - supply a reapply routine that re-queues provider cleanup;
  - decide whether to purge `auth_event_receipts` digests on erasure.
- **Open for P2c:** supply the real attachment-reference query that replaces `rehearsal_attachment_refs`.

## Review fixes for P4

- **P4 review** (`d8f191c` as merged in `60ba012`): no blockers, one major, five minors, nits; nine mutants survived.
  - The reviewer confirmed the proof and replay rules, ownership 404s, grant forgery and cross-route refusal, and session handling after a global logout.
  - It also confirmed snapshot consistency, paging, exact amounts, the cancellation/deletion/lifecycle paths, the routines' privileges, sync parity with export entities, and the app client's checks.
- **Fixed, with tests that failed first.** RED: 4 of 22 database tests and 1 of 34 CSV tests failed on assertions; then all passed. The other new tests pin guards whose mutants survived. All 12 mutants re-applied now fail the suite (`p4fix-mutants.log`), including the three `gogospend_record_export` guards, which needed a genuinely published object to isolate.
  - **Major — downloads loaded the whole file into API memory.**
    - The object store gains `getStream` (memory: 64 KiB chunks; S3: the response body as it arrives).
    - The download streams with the recorded length, checks size and SHA-256 as it streams (a mismatch aborts the response; the client checks too), and never calls `get`.
    - At most four export downloads run at once per process; more get 503 with `retry_after_seconds`.
  - **Minor — a too-large export failed without a reason, and alerted operators forever.**
    - `ExportDto`'s failed state now carries `reason: "too_large" | "error"`. `gogospend_export_job_status` exposes only user-actionable codes. The app client passes the reason through.
    - The worker's failed-job alert counts only failures from the last 24 hours, and not user-caused codes (`USER_FAILURE_CODES`: `export_too_large`).
  - **Minor — one account could hold up the shared queue.** At most `EXPORT_MAX_OPEN` (2) exports per account are queued or running; a third request gets 429 with a retry time (checked under the account lock through `gogospend_open_export_jobs`).
  - **Minor — untested guards.** New tests cover:
    - the `exports` table's own RLS (read directly in another owner's transaction);
    - `file()` refusing an expired file while its grant and object remain;
    - the record routine refusing another object, a re-claimed lease and an inactive account;
    - a lone CR being quoted.
  - **Nit — formula look-alikes.** The formula guard now strips every default-ignorable code point (soft hyphen, U+034F, U+180E, U+3164, zero-width characters) and also checks the NFKC form, so small-form `﹦﹢﹣﹫` are neutralized. `\rtext` is pinned.
- **Not changed (recorded):**
  - **API rollback below P4 is not supported** once any account has requested an export: export entities in the change log would fail a pre-P4 API's sync validators. P6b's rollback rules must state that the rollback floor is the P4 release.
  - The worker still holds an export's CSV parts plus the store's buffered upload (bounded by the 64 MiB cap).
  - Export grants reuse S1's five-minute grant (`EXPORT_GRANT_MINUTES` has the same value).
  - `exportCleanupOverdue` can over-count while two sweeps race.
  - The app role can read the spent lease token inside `object_key`.
  - A global logout leaves queued exports running, as the plan intends.
- **Full gate:** typecheck PASS, typecheck:app PASS, test:api PASS (555), test:db PASS (489), test:app PASS (28), test:unit PASS (215), test:dev PASS (7), test:ops PASS (59), test:render PASS (60), build PASS, export:web PASS, `git diff --check` PASS. The two `gogospend_test_*` databases seen belonged to parallel worktrees' running suites.

## P5: retention and resumable account erasure (local work; P5 not complete)

- **Status:** built and tested locally (synthetic issuer, scripted Auth0 maintenance gateway and the loopback Management API fake, local PostgreSQL, memory object store). P5 is **not complete**: the hosted proofs (primary Apple revocation through Auth0's managed deletion, active-server deletion within 24 hours, real R2 deletion, the independent registry store and its key custody) are SKIPPED until E1/E2, and so is the E2 privacy screen. No production data was deleted.
- **Migration `NNNN_privacy`** (the next free number at integration; see the master-plan table):
  - `deletion_requests`: one per erased account, no foreign key (it outlives the account). It holds the initiating device's binding digest, principal digest and client (its lost-response receipt) and when each stage finished: marker → provider → objects → purge (CHECKs keep the order). Routines only. The initiator columns are null for an erasure re-queued after a restore.
  - `erasure_registry.erasure_markers` in its own schema, usable only by the new group role `gogospend_erasure_registry` (INSERT and SELECT: append-only). Each row is exactly P6a's marker contract (`marker_id`, `account_id`, keyed `subject_lookups`, `lookup_key_id`, `recorded_at`).
  - `account_deletion` is a security job kind. The jobs RLS policies are recreated with every security kind (`auth0_link_identities` included, per the integration note) and with the app-only kinds (`sync_snapshot`, `export`, `import_parse`, `import_expire`) refused to the worker's INSERT. P1's `gogospend_cancel_account_jobs` is replaced so it never cancels security kinds, including this one.
  - `command_receipts.request_digest`/`digest_key_id` are nullable (dropped together).
  - New indexes for purges by entity, deleted records, export age, finished jobs and reconcile-check age.
- **Routines:**
  - `gogospend_request_deletion` (app; owner transaction, under the account lock). It sets the account to `deleting`, moves the session and lifecycle generations and `reauth_after`, revokes every binding, holds every alias as `deleted` (replacing a pending global-logout hold, whose revocation job then completes as superseded), cancels every open account job, and records the request and its job (20 attempts).
  - `gogospend_deletion_receipt` (bootstrap).
  - Lease-checked worker routines (security): `gogospend_deletion_progress`, `_identities`, `_client_ids`, `_mark`, `_objects` and `_purge`, plus `gogospend_deletion_backlog`.
  - `gogospend_purge_entities` (internal): a purged tombstone in a new change group, earlier change rows of those entities deleted, `pruned_through` moved over them, and snapshots built before dropped (their objects become due).
  - Retention (jobs): `gogospend_retention_purge_candidates`/`_account`, `gogospend_drop_receipt_digests`, `gogospend_prune_security_records`, `gogospend_prune_finished_jobs` and `gogospend_prune_deletion_requests`.
  - `gogospend_reapply_erasure` (granted to no role; for P6a's restore operator).
  - S1's `gogospend_prune_account` is replaced: a change that was an entity's head when an earlier pass moved the retention line, and was superseded later, was never removed. It now is, once its successor is past the cutoff.
- **API:** `PrivacyModule`:
  - `POST /v1/me/deletion` (`recent_proof`; Idempotency-Key = the `deletion` proof's command id; 202 `{request_id, status: "accepted"}`). `DeletionService.request(ctx, proofId, commandId)` takes the lock, re-checks the session, consumes the proof and calls the routine in one transaction.
  - `POST /v1/auth/deletion-receipt` (`token_only`; the old binding header and `{command_id}`) answers only the initiating device: `accepted` or `completed`, otherwise 404.
  - New contract types and validators in `v1/privacy.ts`.
- **Deletion worker** (`npm run worker:deletion`, `privacy/deletion-worker.ts`):
  - A security registry (`HandlerRegistry({ security: true })`, new) runs `DeletionHandler.run(lease)` through P1's `JobWorker` with heartbeats.
  - Logins: `DATABASE_URL` in `gogospend_jobs` + `gogospend_security`; the registry login and lookup key are read from an inherited descriptor (`--registry-fd`), never an environment variable, so the API and worker environments carry no registry credential name (P6a's rule; checked with its scanner's pattern).
  - Stages, each idempotent and recorded:
    1. the registry marker, on every run before anything destructive;
    2. per alias: revoke grants, delete the user and confirm it is gone (new `confirmDeleted` on `Auth0MaintenanceClient`, behind a new `IdentityErasureGateway` interface);
    3. objects: published ones deleted now; reservations of cancelled publishers waited for until their final deadline (new `JobRepository.defer`), then swept with orphans;
    4. registered erasure steps;
    5. the purge, which also completes the job.
  - Every alias stays blocked until one hour past provider verification; a later sign-in with the same login is a new, empty account.
  - The worker logs open, over-20-hour and failed deletions (counts only).
- **Retention** (`RetentionHandler`, run by the job worker's maintenance pass in place of the direct `SyncRetention` call):
  - deleted records 30 days after deletion (row, earlier payloads, older snapshots; the head becomes `purged`);
  - export requests 30 days after the request;
  - S1's change log and manifests;
  - receipt digests after the 30-day outbox lifetime (a replay is then 409, never re-run; status still answers);
  - provider-event receipts and reconcile checks after 30 days, expired challenges, and lapsed `deleted` holds;
  - finished jobs after 30 days (failed ones stay);
  - completed deletion requests 30 days after their purge.
- **Extension point:** `privacy/privacy-steps.ts`, the one place P2a–P3 register `retention` and `erasure` steps (`defaultPrivacySteps`), with the contract written at its top and in [retention.md](../operations/retention.md):
  - owned tables cascade from `accounts`, or are listed in `ERASURE_HANDLED_TABLES` (a test fails otherwise);
  - objects go through P1's publication registry (purpose in `PUBLICATION_PURPOSES`);
  - synced records are purged with `gogospend_purge_entities`.
- **Mobile** (`apps/app/src/spend/v1/deletion.ts`, logic only):
  - `requestAccountDeletion`, `submitDeletionRequest` and `confirmDeletionRequest` give `cancelled`, `reauth_required`, `unconfirmed` (resend the same request), `accepted` (response or receipt) or `denied` (refused with no receipt).
  - `settleDeviceCopy` erases the device copy only after `accepted`, locks it (keeping drafts) after `denied`, and otherwise leaves it.
  - An ordinary auth or network error never erases or implies deletion.
- **Integration notes folded in** (coordinator, while working): the registry follows P6a's marker contract and `listMarkers()` throws rather than returning `[]`; the reapply routine is given to P6a, with the recommendation in [deletion.md](../operations/deletion.md) to use it instead of deleting rows directly, which would lose in-progress provider cleanup; erasure **does** purge `auth_event_receipts` and reconcile checks of the erased principals.
- **RED against compile-safe seams** (SQL routine bodies stubbed, S1's prune left unreplaced, a do-nothing `DeletionHandler.run`, `confirmDeleted` always done, a client journey that always answers `unconfirmed`; real tables, contracts and tests; no module errors):
  - `npm run test:db -w gogospend-api -- --runTestsByPath src/privacy/deletion.integration.spec.ts src/privacy/retention.integration.spec.ts src/storage/deletion-publication.integration.spec.ts`: 23 of 33 failed, all on assertions. The 10 that held pin structure that the seams did not stub: registry isolation for four role sets, the append-only registry, the account-table catalog, a generic login not seeing deletion jobs, a wrong proof requesting nothing, the restore window, and a failing retention step reported.
  - `npm run test -w gogospend-api -- --runTestsByPath src/auth/auth0-management.client.spec.ts src/privacy/privacy-steps.spec.ts`: 1 of 18 failed (`confirmDeleted`). `privacy-steps.spec.ts` (steps, security registry, lookup-key derivation against P6a's formula, descriptor settings) was written against the real code.
  - `npm run test:unit -w gogospend-app -- src/spend/v1/deletion.test.ts`: 5 of 6 failed (`ERR_ASSERTION`).
  - One RED test first failed with a `TypeError` (a missing job row); it now asserts the row first. Stage assertions were tightened from `not.toBeNull()` to `toBeInstanceOf(Date)` after one test passed against the seams because the request row was missing.
- **GREEN:** the same commands give 33 of 33 (47 of 47 with `migrations.integration.spec.ts`), 18 of 18 (27 of 27 with `migrations.spec.ts`) and 6 of 6.
  - Pinned `failed_erasure_marker_blocks_destructive_cleanup`: with the registry failing, `destructiveCalls` is 0 and `cleanupComplete` is false. The job is queued as `registry_unavailable`, and finishes once the registry is back.
  - Also pinned: `purged_transactions_are_not_resurrected_by_receipts`.
  - **Covered** (deletion):
    - every binding dead at once, including a second device;
    - aliases held, publishers cancelled, the cleanup intent recorded, and nothing destroyed at request time;
    - a lost acceptance: the identical resend is 401 and only the initiating device's receipt confirms it, then reports `completed`;
    - a save waiting behind the deletion on the lock writes nothing;
    - an export queued before the deletion is cancelled;
    - the full erasure: a P6a-shaped keyed marker with no raw subject; revoke → delete → confirm per alias; the published file deleted now; no row left in any table with an `account_id` except the deletion's own bookkeeping; event receipts and reconcile checks gone; the hold kept for an hour;
    - crashes after the registry write, during provider deletion (and with the user still present), and after identity removal (a stale challenge's bootstrap is refused and no account is re-created; the retry makes no provider call; after the hold lapses the same login gets a new, empty account);
    - a provider outage stays pending, fails visibly after its attempts, shows in the backlog as failed and overdue, and resumes after the runbook's requeue;
    - registered erasure steps run before the purge, and a failing one stops it;
    - restore reapply.
  - **Covered** (publication): a worker lease cannot publish after the deletion; a late PUT (worker crashed mid-PUT) makes the job defer to the publisher's deadline, with no purge before it, and is then swept; an object written after the final sweep is removed by the next global sweep; a failing storage delete keeps the deletion pending.
  - **Covered** (retention): undo within 30 days, with records counting again; tombstones in deltas, older cursors getting 410 and earlier snapshots dropped; export purge; a held account lock skipped then purged; dropped digests; security records, jobs, holds and requests aging out; the S1 fix.
- **Mutants:** 12 of 12 killed, each applied to a copy-restored file and run against its spec (`p5-mutants.log` in the session scratchpad):
  - registry failure ignored;
  - provider deletion not confirmed;
  - objects marked swept without waiting;
  - holds lifted at purge;
  - request not cancelling publishers;
  - receipt answering any binding;
  - purge keeping earlier payloads;
  - purge not moving `pruned_through`;
  - a digest-less receipt replaying;
  - S1's old prune;
  - the device erasing on an unknown outcome;
  - a refusal counted as accepted.
- **Deviations, for review:**
  - **Not an M1 command.** The deletion request is a lifecycle transition like global logout (nothing is synced for an account that is going away), and its lost response is answered by the extra receipt route.
  - **Registry contract.** `ErasureRegistry.record` takes `{issuer, subject}` aliases (the registry holds the lookup key) and returns the stored marker; there is `listMarkers()` instead of a `has()`.
  - **Separate deletion worker.** It runs in its own process rather than inside the security worker.
  - **Purge groups.** Purge change groups carry a derived command id and no receipt or audit row.
  - **Export requests** are purged (not only aged out).
  - **Blocked principals lapse:** a deleted principal's hold lapses an hour after verification instead of lasting forever.
  - **Rate budget.** The receipt route shares the token-only per-principal and per-address budget.
- **SKIPPED:**
  - **Hosted** (E1/E2): the checklist in [deletion.md](../operations/deletion.md).
  - **E2:** the privacy screen and its copy (no UI or locale strings added).
  - **Later tasks:** the P2a–P3 retention and erasure steps (registration point only).
  - **Local dev:** a manual `npm run dev:v1` run. The local `gogospend_v1` database was not touched and will apply the privacy migration on its next start.
- **Risks:**
  - Until the registry is placed outside the main database, a main-database restore can roll markers back; P6a must refuse such a placement (`independent: true`).
  - At integration, P2a's `import_uploads` must cascade from `accounts` or be listed in `ERASURE_HANDLED_TABLES`, and its quarantine purpose must be in `PUBLICATION_PURPOSES` for the erasure sweep to list it.
  - A deferral uses one of the job's 20 attempts.
  - A very large account is purged in one transaction.
- **Full gate:** typecheck PASS, typecheck:app PASS, test:api PASS (37 suites, 487 tests), test:db PASS (34 suites, 486 tests), test:app PASS (16), test:unit PASS (188), test:render PASS (60), test:dev PASS (7), build PASS (the built API loads `dist/privacy/*` and the new contract exports; the deletion worker refuses to start without `--registry-fd`), export:web PASS, `git diff --check` PASS. The first seam run, whose migration failed, left three empty test databases (no handle to drop them); they were dropped. The two other `gogospend_test_*` databases seen afterwards were not from these runs and were left alone.

## Integration: P5 merged

- **Merged:** P5's local part (built in its own worktree as `d972fde` on `60ba012`).
- **Migration:** renumbered from `0014_privacy` to `0015_privacy`, after P2a's `0014_import_intake`.
- **Checks made while merging:**
  - Its recreated job policies keep every security kind (`auth0_revoke_grants`, `auth0_security_reconcile`, `auth0_link_identities`, `account_deletion`) and the app-only kinds, including P2a's `import_parse`/`import_expire`.
  - It does not replace any routine P2a defines.
  - Its deletion objects stage selects the account's publications without a purpose filter, so P2a's `import_quarantine` parts are deleted too.
  - `import_uploads` cascades from `accounts`, so the table-coverage test passes.
- **`SECURITY_JOB_KINDS` now lists all four security kinds.**
- **Full gate on the merged tree:** typecheck PASS, typecheck:app PASS, test:api PASS (562), test:db PASS (522), test:app PASS (28), test:unit PASS (221), test:dev PASS (7), test:ops PASS (59), test:render PASS (60), build PASS, export:web PASS, `git diff --check` PASS. The two `gogospend_test_*` databases seen belonged to parallel worktrees' running suites.
- **Open:**
  - Register a retention step for `import_uploads` (file names on parsed imports) in `defaultPrivacySteps()` when the P2a fixes land.
  - P2b and P2c register their purge steps the same way.
