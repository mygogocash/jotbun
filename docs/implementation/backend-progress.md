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
