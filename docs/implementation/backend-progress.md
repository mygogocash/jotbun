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
