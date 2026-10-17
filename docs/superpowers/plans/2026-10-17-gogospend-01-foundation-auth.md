# GoGoSpend Foundation and Auth0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove one isolated PostgreSQL account and a native Auth0 session before financial feature delivery.

**Architecture:** Add a v1 root beside the legacy Mongo application. Auth0 verifies identity; PostgreSQL owns principal mappings, policy state, session bindings and revocation. Prove native callbacks and server-bound OIDC challenges on authorized non-production resources.

**Tech Stack:** Existing Node/Nest/Expo/npm; `pg`/Drizzle; `jose`; `react-native-auth0`; Jest/Supertest/Node test and real PostgreSQL integration.

**Spec:** [Approved architecture](../../design/backend-architecture-2026-10-17.md), [master plan and shared interfaces](2026-10-17-gogospend-backend.md).

## Global Constraints

- All master constraints apply. Auth0 is the only v1 issuer; no Firebase/backend-JWT/email fallback. No provider resources, credentials or paid entitlement without E1.
- JWT 5 minutes; refresh/binding idle 7 days and absolute 30 days; proof challenge 5 minutes. Binding is not independently an API credential. No token in SQLite/logs/URLs.
- Read account/session state on every private request; lifecycle writes use the common account lock. First bootstrap needs principal serialization before an account exists.
- Native development builds are required; web remains a fictional demo/signed-out preview. Implementing browser Auth0 login is a separate scope decision.

## Review Focus

1. Refresh changes a token string but not the account: F5 transport test.
2. Concurrent first bootstrap creates two accounts: F4 SQL race test.
3. A forged or replayed proof creates a binding: F4 nonce/purpose/subject tests.
4. Delayed provider revocation destroys a new grant: F6a pending-generation test.
5. An SDK build is mistaken for a working social/deletion flow: F4 spike plus F5/F6a–F6c real evidence gates.
6. The two-step bootstrap needs a second interactive login that users abandon: F4 native spike before the proof contract is final.

### Pinned regression assertions

These are fixture assertions for each task's RED/GREEN test, not checks run while writing this plan. Arrange the named fixture variables inside the task's specified test files; no additional production helper is implied.

| Task | Test name | Core assertion |
| --- | --- | --- |
| F1 | `parses_satang_without_float_conversion` | `expect(parseMinor('6500', {allowZero:false,allowNegative:false})).toBe(6500n)` |
| F2 | `pool_reuse_does_not_inherit_owner` | `expect(rowsForOtherOwner).toEqual([])` |
| F3 | `id_token_is_not_api_authorization` | `expect(response.status).toBe(401)` |
| F4 | `concurrent_bootstrap_has_one_account` | `expect(new Set(results.map(r => r.account_id)).size).toBe(1)` |
| F5 | `return_to_a_does_not_accept_old_a_response` | `expect(appliedResponses).not.toContain(firstAResponse); expect(stateAfterLateResponse).toEqual(stateBeforeLateResponse)` |
| F6a | `logout_invalidates_existing_binding_before_provider_cleanup` | `expect(oldBindingResponse.status).toBe(401)` |
| F6b | `duplicate_security_event_is_applied_once` | `expect(outcomes).toEqual(['applied', 'duplicate'])` |
| F6c | `linking_two_populated_accounts_conflicts` | `expect(linkResponse.status).toBe(409)` |

F5's assertion must fail for an implementation that increments the epoch but still applies the late response: deliver `firstAResponse` after the A → B → A sequence and compare the whole session/view state before and after it.

### Task F1: Publish v1 contracts and establish a trustworthy baseline

**Files:** Modify `packages/contracts/src/index.ts`, root `package.json`, `apps/app/package.json`; create `packages/contracts/src/v1/{common,auth,errors,validation}.ts`, `apps/api/src/v1/contracts.spec.ts`, `apps/app/scripts/test-unit.mjs`, `apps/app/src/api/v1Contracts.test.ts`, `docs/implementation/backend-progress.md`.

**Interfaces:** Publish master `Minor`, `Revision`, `ApiIdentity`, `SessionContext`, `CommandInput`, `CommandAck`, `ApiProblem`. `parseMinor(value: unknown, options: {allowZero: boolean; allowNegative: boolean; max?: bigint}): bigint`; `validateOccurredOn(value: unknown, trackingStart: string, todayBangkok: string): string`; `normalizeCommand(kind: string, schemaVersion: number, payload: unknown): CanonicalCommand`, where `CanonicalCommand = {kind:string; schemaVersion:number; canonicalJson:string}` has sorted validated serialization and excludes auth/request metadata. HTTP schemas preserve integer strings and reject unknown fields. All runtime code follows the master contracts constraint (erasable TypeScript only, explicit `.ts` imports).

- [ ] Record exact dirty paths, installed/runtime versions and fresh existing verification commands from the master; document unrelated failures without overwriting them. Review dependency metadata/scripts before installation; update only intended manifest/lockfile entries.
- [ ] Add compile-safe contract exports and the pure mobile test dispatcher, establish a green runner, then add behavioral tests: `'6500'` parses to `6500n`; `1.5`, `'1e3'`, `'01'`, `'NaN'`, whitespace-only, excess precision and `100000000000` reject; negative totals are permitted only by the total validator; invalid leap/future/pre-tracking dates reject. Normalization makes reordered equivalent payloads equal but does not collapse two command IDs, and the same payload under two schema versions normalizes differently.
- [ ] Run `npm run test -w gogospend-api -- --runTestsByPath src/v1/contracts.spec.ts` and `npm run test:unit -w gogospend-app -- src/api/v1Contracts.test.ts`; capture assertion-level RED, then implement exact validators/error codes and obtain GREEN.
- [ ] Extend the same tests with totals above JS safe-integer range and Thai/Bangkok midnight cases; no `Number` round-trip in arithmetic. Run `npm run typecheck` and `npm run typecheck:app`.
- [ ] Prove runtime loading: run `npm run build -w gogospend-api`, then from `apps/api` run `node -e "const c = require('@gogospend/contracts'); if (typeof c.parseMinor !== 'function') process.exit(1)"` with the same Node version and flags the API start script uses. Enable `erasableSyntaxOnly` in `packages/contracts/tsconfig.json` so non-erasable syntax fails typecheck.
- [ ] Review exports against all existing consumers; leave legacy contracts available until M5/P6b retirement. Record receipts and a focused diff; commit only with E4.

**Done:** server/mobile share strict v1 types; tests execute through known scripts. No API behavior or provider has been switched.

### Task F2: Add PostgreSQL migrations, role isolation and v1 startup

**Files:** Modify `apps/api/package.json`, `apps/api/.env.example`, root `package.json`; create `apps/api/drizzle.config.ts`, `apps/api/drizzle/0001_identity.sql`, `apps/api/jest.integration.cjs`, `apps/api/src/database/{database.module,database.service,owner-transaction,schema}.ts`, `apps/api/src/database/{owner-transaction,migrations}.integration.spec.ts`, `apps/api/src/testing/postgres-harness.ts`, `apps/api/src/v1/{v1-app.module,main}.ts`, `scripts/{dev-v1,dev-v1.test}.mjs`, `compose.postgres.yml`.

**Interfaces:** `DatabaseService.withOwnerTransaction` / `OwnerTx` from master; `lockAccount(tx: OwnerTx, accountId: string): Promise<AccountState>` locks `account_sync_state` then reads `AccountState = {status:'active'|'disabled'|'deleting'; sessionGeneration:number; lifecycleGeneration:number; reauthAfter:string|null; revision:Revision}`. Bootstrap repository uses a restricted fixed-search-path function for principal resolution; it has no generic bypass of RLS.

- [ ] Review/pin the SQL dependencies and PostgreSQL 17 image digest. Implement a guarded loopback-only local launcher using a new named volume/port, separate from `gogospend-mongo-local-data`; fail on an unexpected existing resource instead of replacing it. No production URL may be accepted by the test harness. Introduce the integration script/config from the master and prove connection/rollback setup green.
- [ ] Add SQL behavioral tests: missing/wrong owner context sees no private row; sequential requests on a reused pool connection cannot inherit owner; forged cross-owner FK fails; app role is neither owner/superuser/BYPASSRLS; queue/security/bootstrap roles cannot directly read financial rows; migration replay is stable. P1 later introduces a separate narrowly leased snapshot/export read capability, not a general worker SELECT grant. Capture RED with a reachable synthetic database.
- [ ] Implement `0001_identity.sql` for `accounts`, `account_identities` and `account_sync_state`, plus the database roles and the restricted bootstrap routine. Do not create tables owned by later tasks: F3 adds `rate_limit_buckets` and F4 adds sessions, challenges, consents, policy versions and blocked principals. Unique `(issuer, subject)` maps aliases to one UUID. Bootstrap-before-owner rows are accessed only through restricted routines; no broad public-table policy. Owner tables use explicit predicates, composite FKs and RLS. Use parameterized queries and transaction-local context, a bounded pool and verified TLS for remote endpoints.
- [ ] Run `npm run test:db -w gogospend-api -- --runTestsByPath src/database/owner-transaction.integration.spec.ts src/database/migrations.integration.spec.ts`; require PASS for fresh migration, repeat migration, owner isolation and cleanup. Run `node --test scripts/dev-v1.test.mjs` to prove conflicting resources leave the existing Mongo volume untouched.
- [ ] Add `npm run dev:v1` through the new launcher and explicit v1 entry point; do not register old `/spend` routes or cron jobs in it. Use synthetic fixtures only. Review SQL grants and startup configuration, record results and leave old launcher/source intact.

**Done:** local isolated v1 process starts without Mongo; real SQL proves ownership. Runtime schema changes are still not run against Neon.

### Task F3: Verify Auth0 access tokens and classify every route

**Files:** Create `apps/api/drizzle/0002_rate_limits.sql`, `apps/api/src/auth/{auth.module,auth0-token-verifier,auth0-access-token.guard,auth-route.decorator,application-session.guard,route-policy,request-context}.ts`, `apps/api/src/auth/{auth0-token-verifier,route-policy,request-context}.spec.ts`, `apps/api/src/testing/jwks-server.ts`, `apps/api/src/common/{safe-request-logger,api-problem.filter,shared-rate-limit,client-version.guard}.ts`, `apps/api/src/common/client-version.guard.spec.ts`, `apps/api/src/common/shared-rate-limit.integration.spec.ts`; modify `apps/api/src/v1/{main,v1-app.module}.ts`, `apps/api/src/database/schema.ts`, `apps/api/.env.example` and `apps/api/package.json`.

**Interfaces:** `TokenVerifier.verifyApiAccessToken(token: string): Promise<ApiIdentity>`; `RouteAccess = 'public'|'token_only'|'bound_session'|'current_policy'|'recent_proof'`; `ApplicationSessionGuard.resolve(identity: ApiIdentity, binding: string): Promise<SessionContext>`. `ClientVersionGuard` parses the master `X-GoGoSpend-Client` header on every non-public route and returns `426 CLIENT_UPGRADE_REQUIRED` below `MIN_CLIENT_VERSION_IOS`/`MIN_CLIENT_VERSION_ANDROID`. An unclassified `/v1` route is rejected by the route-manifest test.

- [ ] Review/pin a direct `jose` dependency; reuse Nest guards and existing validation/error handling patterns. Build a synthetic RS256 issuer/JWKS fixture; prove a correct audience token succeeds before adding rejection assertions.
- [ ] Add RED tests rejecting wrong issuer/audience/client, ID/opaque tokens, `none`/HS256, expired/not-yet-valid and malformed tokens; unknown-key fetch retries are bounded; missing key material fails closed. Assert private routes cannot be reached through public/token-only classification.
- [ ] Implement pinned-issuer JWKS validation, standard claims/scopes/authorized-client checks and application binding lookup. Use PostgreSQL buckets: private reads 120/minute per binding, business writes 60/minute; challenge/bootstrap 10/minute per verified principal and 30/minute per trusted network bucket. Hash network bucket keys with `RATE_LIMIT_KEY`, expire rows within 24 hours and never retain raw IPs there. Configure trusted Railway proxy handling explicitly; untrusted forwarded headers cannot spoof keys. Log route templates/request IDs/status/latency only, never full query strings, auth headers, body or signed URLs.
- [ ] Add client-version RED tests: missing, malformed and below-minimum headers on a private route return `426 CLIENT_UPGRADE_REQUIRED` with an `ApiProblem` body; at-minimum and newer versions pass; public health/policy routes ignore the header; missing minimum configuration fails startup rather than allowing every version. Then implement `ClientVersionGuard` and `0002_rate_limits.sql`.
- [ ] Run `npm run test -w gogospend-api -- --runTestsByPath src/auth/auth0-token-verifier.spec.ts src/auth/route-policy.spec.ts src/auth/request-context.spec.ts src/common/client-version.guard.spec.ts` and `npm run test:db -w gogospend-api -- --runTestsByPath src/common/shared-rate-limit.integration.spec.ts`. Assert a synthetic secret in query/header/body never appears in captured logs, and two API replicas share one limit.
- [ ] Review manifest exceptions: public health/published policy; token-only challenge/bootstrap/completion; bound reads; current-policy writes/uploads; recent-proof export/link/logout/deletion. Policy absence is never implicit acceptance. Do not register inherited Firebase or shared-key internal endpoints in v1.

**Done:** auth fixtures exercise real cryptographic validation and route rules; they are not an Auth0 tenant/native proof.

### Task F4: Implement identity bootstrap, session bindings and policy acknowledgement

**Files:** Create `apps/api/drizzle/0003_sessions_policies.sql`, `apps/api/src/auth/{auth.controller,auth-bootstrap.service,auth0-profile.client,oidc-proof-verifier,reauthentication.service,session.repository}.ts`, `apps/api/src/accounts/{account-identities.repository,account-lifecycle.service}.ts`, `apps/api/src/policies/{policy.controller,policy.service}.ts`, `apps/api/src/auth/{oidc-proof-verifier,auth-bootstrap.service,auth0-profile.client}.spec.ts`, `apps/api/src/auth/auth-bootstrap.integration.spec.ts`, `apps/api/src/policies/policy.integration.spec.ts`, `docs/implementation/auth0-bootstrap-spike.md`; modify `apps/api/.env.example`, F1 auth contracts and `apps/api/src/database/schema.ts`. `0003_sessions_policies.sql` adds `auth_sessions`, `reauth_challenges`, `consents`, policy versions and `blocked_principals`.

**Interfaces:** `issueChallenge(identity: ApiIdentity, input: {requestId: string; purpose: string; commandId: string}): Promise<{challenge_id: string; nonce: string; expires_at: string}>`; `OidcProofVerifier.verifyChallenge(identity, challenge, idToken): Promise<VerifiedOidcProof>`; `bootstrap(identity, proof): Promise<{account_id: string; binding: string; session_generation: number}>`. `Auth0ProfileGateway.getTrustedProfile(identity): Promise<{subject:string; emailVerified:boolean; connection:string; blocked:boolean}>` is implemented now with a read-profile-only API client. `authorizePurpose(tx, ctx, proofId, commandId): Promise<void>` consumes a proof atomically with its business/lifecycle command.

- [ ] Native bootstrap spike (needs E1 tenant/native client and E2 identifiers; run as early as those allow, ideally during F1–F3). Throwaway code, kept out of the task diff. On one iOS and one Android development build, run the spec's flow end to end: Universal Login → access token → request challenge → authorize again with the challenge nonce and `max_age=0` → nonce-bound ID token. Record in `docs/implementation/auth0-bootstrap-spike.md` the number of interactive prompts, iOS consent sheets, Google/Apple re-prompt behaviour, cancellation at each step and elapsed time; no tokens in the record. If the second interactive login is unacceptable, return a design decision to the founder before implementing the proof endpoint. One option to present: a public pre-login challenge, rate-limited per trusted network bucket and bound to a principal only at completion, so one authorization yields both the access token and the nonce-bound ID token. Do not change the spec's proof rules without that decision. Until the spike passes or the decision is made, the remaining F4 server work may proceed, but the challenge/proof contract is provisional and F4 is not complete.
- [ ] Add RED tests for forged/replayed/expired/wrong-purpose/nonce/subject/client proof, stale or missing `auth_time`, missing binding, generation mismatch and DB outage. ID tokens are accepted only as the dedicated proof input, never the API Bearer. Initial challenge needs only verified identity and rate budget, returns no financial data.
- [ ] Add real SQL race tests: two valid first bootstraps for the same unknown principal produce one account/identity/sync row. Serialize unknown principals using a transaction-scoped advisory lock plus unique constraint, then use the normal account lock. Recheck blocked principals, account status and revocation-pending state after serialization. A deleted principal cannot recreate an account with an old JWT.
- [ ] Implement 32-byte random opaque bindings with server digest, purpose/nonce binding, 5-minute challenge expiry and 7-day idle/30-day absolute binding limits. Introduce the scoped profile gateway and E1-authorized read-profile credential configuration before its first native use; it never receives the maintenance client's deletion/revocation secrets. Verify subject/blocked/email state through the provider, not the posted DTO; outage fails bootstrap closed. A duplicate bootstrap request must not store/replay the raw binding or ID token in a receipt: atomically consume the challenge; if the one-time response is lost, use a fresh challenge and revoke/expire the undisclosed binding. This retry returns a recoverable challenge-used result, never fabricated credentials.
- [ ] Implement versioned policy acknowledgements and optional analytics off by default. Missing configuration denies writes; unpublished policy text cannot be invented. Export/deletion/policy review stay accessible when a newer required version is unaccepted. Run `npm run test:db -w gogospend-api -- --runTestsByPath src/auth/auth-bootstrap.integration.spec.ts src/policies/policy.integration.spec.ts` and the two new auth unit specs.
- [ ] Verify route classification and lifetime checks; record recovery for lost bootstrap response and proof replay. Produce a local authenticated `/v1/me` fixture with account UUID and no private token output. Do not mint an imitation Auth0 token for real client login.

**Done:** cryptographic proof plus SQL creates exactly one owned account/session, policy requirements are explicit, and the native spike has passed or its design decision is recorded.

### Task F5: Prove native Auth0 and replace the client session seam

**Files:** Modify `apps/app/app.json`, `apps/app/app/{_layout,login}.tsx`, `apps/app/src/auth/{session,useAuthGuardSession}.ts`, `apps/app/src/api/{client,sharedClient}.ts`, `apps/app/src/config/env.ts`, `apps/app/.env.example`, locale messages; create `apps/app/src/auth/{auth0Client.native,auth0Client.web,credentialProvider,sessionMachine,reauthentication}.ts`, `apps/app/src/auth/AuthSessionProvider.tsx`, `apps/app/src/auth/sessionMachine.test.ts`, `apps/app/src/api/sessionEpoch.test.ts`, `docs/implementation/auth0-native-proof.md`.

**Interfaces:** `CredentialProvider.getAccessToken(): Promise<string|null>` serializes SDK refresh; `getSessionSnapshot(): SessionSnapshot`, where `SessionSnapshot = {accountId:string|null; binding:string|null; epoch:number; state:SessionState}` and `SessionState = 'signed_out'|'hydrating'|'authenticating'|'bootstrap_pending'|'active'|'locked'|'reauth_required'`. `epoch` is an installation-local monotonically increasing counter, independent of server `session_generation`; increment on account switch, logout and binding replacement, never on token refresh. Every async callback captures it. Auth0 native/web modules expose the same adapter methods; web reports unsupported real auth and retains demo/signed-out preview. The shared transport adds the master `X-GoGoSpend-Client: <ios|android>/<semver>` header to every non-public request from the native app version, and surfaces `426 CLIENT_UPGRADE_REQUIRED` as a distinct `upgrade_required` outcome rather than an auth failure.

- [ ] Before callback registration, confirm iOS bundle identifier, retain the intended Android identifier and select the owned callback domain. Apply E1/E2 for exact non-production Auth0 API/native app/connections/entitlements and secure credential destinations. Pin/review SDK and dev-client configuration; never include an M2M secret in the app.
- [ ] Add RED state/transport tests: valid token renewal during an in-flight request preserves the response; logout/account switch rejects it; A → B → A never accepts A's first response after returning to A; hydration never flashes previous private data; one 401 permits one serialized refresh only; retry preserves body/command key; a 426 never triggers refresh or sign-out. Cancel/outage/auth denial locks or pauses and preserves drafts. Run `npm run test:unit -w gogospend-app -- src/auth/sessionMachine.test.ts src/api/sessionEpoch.test.ts`.
- [ ] Implement SDK Credentials Manager, SecureStore binding and stable session epoch; retain the old public session seam until callers move. Replace token-string comparison. Add approved-style Universal Login entry, Thai/English prompts, verification/recovery and cancel states; present new UX states for founder review before final UI acceptance.
- [ ] Run `npm run ios -w gogospend-app` and `npm run android -w gogospend-app` against the authorized non-production tenant. Prove PKCE callback/logout, state/nonce injection, ID-token access and server challenge verification, refresh rotation, cold start and device-protected persistence. Implement the first-bootstrap flow exactly as settled by F4's spike or the founder's resulting decision, and re-measure its prompts and cancellation UX on the production-shaped build; if friction is worse than the spike recorded, return a concrete design decision rather than weakening proof.
- [ ] Record platform/build/SDK versions, target metadata, result and redacted screenshots in the proof document; no token screenshots/logs. Run app unit/render/typecheck and web export. A simulator build alone does not satisfy social/provider/device-storage behavior; record missing evidence as SKIPPED and keep the milestone blocked.

**Done:** supported native login reaches the same internal account across restart; same-account token refresh is not misclassified as a switch.

### Task F6a: Prove global logout and provider revocation on the shared job primitive

**Files:** Create `apps/api/drizzle/0004_jobs_security.sql`, `apps/api/src/auth/{auth0-management.client,security-job.repository}.ts`, `apps/api/src/jobs/{job.repository,job-types}.ts`, `apps/api/src/accounts/session-revocation.service.ts`, `apps/api/.env.worker.example`, `apps/api/src/accounts/session-revocation.integration.spec.ts`, `docs/operations/auth0-runbook.md`; modify `apps/api/src/database/schema.ts`, the auth controller/contracts and the native security state adapter.

**Interfaces:** Define the master `JobLease` in `apps/api/src/jobs/job-types.ts` and a minimal `JobRepository` (enqueue, claim with a fresh fencing token, complete, fail; every transition requires the lease token) that P1 later extends without changing `JobLease`'s fields. `IdentityMaintenanceGateway.revokeGrants(subject, clientId)` and `deleteUser(subject)` use the distinct worker-only maintenance client; typed outcomes contain retryability and no raw tokens. `SessionRevocationService.revokeAll(ctx, proofId, commandId): Promise<{generation: number; provider_cleanup: 'pending'}>` creates a durable security job under the account lock; F6a does not depend on the later general worker entry point.

- [ ] Add RED SQL tests that global logout invalidates both devices immediately, refresh cannot restore an old binding, and new bootstrap stays blocked while provider cleanup is pending. A delayed old job cannot revoke a new generation. An early-guard request waiting on the lock loses to revocation. Run `npm run test:db -w gogospend-api -- --runTestsByPath src/accounts/session-revocation.integration.spec.ts`.
- [ ] Implement `0004_jobs_security.sql` with the shared `jobs` table and security-job intent, plus the minimal lease/fencing repository above; the security adapter delegates to it, not another queue. Implement bounded idempotent retries and supported per-user/client grant/device revocation on the selected plan. Do not assume Enterprise APIs. Provider outage leaves a visible retryable hold; no stale-authority fallback. Management clients are process/scope restricted and never log subjects/tokens.
- [ ] On authorized test identities, prove two-device refresh/logout and primary Apple token revocation through Auth0's managed deletion path. Record exact plan/API entitlement and operator evidence. All user-disable/delete operations must update app state first; arbitrary dashboard changes are not promised instant app revocation. Independent auth/security review must pass before F6a is complete.

**Done:** global logout and provider revocation have deterministic failure tests and controlled tenant/native proof; the shared job primitive exists for M1 and P1.

### Task F6b: Ingest provider security events and prove password-reset recovery

**Files:** Create `apps/api/drizzle/0005_auth_events.sql`, `apps/api/src/auth/{auth0-events.controller,auth0-event-verifier}.ts`, `apps/api/src/auth/auth0-events.spec.ts`, `apps/api/src/auth/auth0-events.integration.spec.ts`; modify `apps/api/src/database/schema.ts`, F6a's security-job adapter and `docs/operations/auth0-runbook.md`.

**Interfaces:** `handleSecurityEvent(signedEnvelope): Promise<'applied'|'duplicate'>` verifies source/replay/time bounds and records each verified event in the `0005_auth_events.sql` receipts for deduplication and reconciliation. Follow-up revocation runs through F6a's jobs.

- [ ] Add RED tests for forged, duplicate, out-of-order and lost password-reset events and provider outage: signature/source/time-bound rejection in the unit spec; deduplication, ordering and reconciliation against real SQL in the integration spec.
- [ ] Implement authenticated event ingestion plus reconciliation. Run `npm run test -w gogospend-api -- --runTestsByPath src/auth/auth0-events.spec.ts` and `npm run test:db -w gogospend-api -- --runTestsByPath src/auth/auth0-events.integration.spec.ts`.
- [ ] Prove the tenant's actual post-change-password delivery/recovery path and documented propagation bound on authorized test identities before enabling recovery. If loss cannot be reconciled on the selected plan, stop that release path for a design decision; do not claim JWT expiry alone stops a refreshable compromised session. Independent auth/security review must pass before F6b is complete.

**Done:** reset recovery is proven within a documented bound or explicitly blocked pending a design decision; duplicate and forged events change nothing.

### Task F6c: Implement explicit account linking

**Files:** Create `apps/api/src/accounts/account-linking.service.ts`, `apps/api/src/accounts/account-linking.integration.spec.ts`; modify F4's `auth0-profile.client.ts` to add authorized linking scopes, the auth controller/contracts and `docs/operations/auth0-runbook.md`.

**Interfaces:** Extend F4's `Auth0ProfileGateway` with `link(primary, secondaryProof)` using the separately authorized profile/link client scopes. Linking uses existing `account_identities` aliases and F6a jobs; no migration is planned (see the master migration rule if one proves necessary).

- [ ] Add RED SQL tests: linking requires fresh proof of both identities; two populated accounts return `409`; aliases resolve to the stable primary UUID/subject; existing bindings are invalidated; an interrupted cleanup recovers without a second account.
- [ ] Implement explicit linking with those rules and run `npm run test:db -w gogospend-api -- --runTestsByPath src/accounts/account-linking.integration.spec.ts`.
- [ ] On authorized test identities, prove linking and linked-identity Apple token revocation; record evidence. Independent auth/security review across F6a–F6c must pass before auth readiness is claimed.

**Done:** linking is explicit, proof-bound and recoverable. F6c may run any time after F6b and ships before beta unless the founder explicitly defers linking. Across F6a–F6c, no unproven Auth0 session feature is sold as working.
