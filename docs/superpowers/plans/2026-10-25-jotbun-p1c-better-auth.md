# Phase 1C: Better Auth on D1 and the app's sign-in port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Auth0 with Better Auth on D1 (email code, Apple and Google by native ID token, passkeys on the server, short JWTs at `/api/auth/jwks`), make sessions into devices the person can sign out, port the app's sign-in onto `@better-auth/expo`, and erase an account for real through a `DeletionWorkflow`, with every vault call checked against Better Auth's keys, the vault's revocations and an erasure registry kept outside the sign-in database.

**Architecture:** Better Auth runs inside the Worker at `/api/auth/*`, on the `AUTH_DB` D1 database with its built-in D1 dialect, and issues EdDSA JWTs whose `sub` names the vault, `sid` the session and `auth_time` the sign-in. A small Better Auth plugin of ours lists devices and signs them out, telling the vault first, so a revoked device's unexpired JWT is refused at once. The erasure registry lives in its own D1 database, `ERASURE_DB`, so restoring `AUTH_DB` from a backup cannot bring a deleted account back. The app keeps its session machine, outbox and transport; only the credential provider changes, onto a Better Auth port whose cookie lives in SecureStore. Deletion is a Cloudflare Workflow of the steps in §6.12, using 1B's vault erase primitive.

**Tech Stack:** Better Auth 1.6.33 (`better-auth`, `@better-auth/expo`, `@better-auth/passkey`); Cloudflare Workers, D1, Workflows and Email Service (`send_email` binding); Resend's HTTP API through `fetch` as the second email provider (no package); jose 6.2.12 (existing); Vite 8 with `@cloudflare/vite-plugin` 1.65.0 (existing); Vitest 4.1 with `@cloudflare/vitest-plugin` 1.4.7 (from 1A-T1); wrangler 4.152.0. App: Expo SDK 58, `expo-secure-store` ~58.0.2 (existing), Node's test runner and Vitest render tests (existing).

**Spec:** [docs/superpowers/specs/2026-10-25-jotbun-bun-wallet-cloudflare-design.md](../specs/2026-10-25-jotbun-bun-wallet-cloudflare-design.md). This plan implements §8 phase 1 "Better Auth on D1, and the app's sign-in port", and deletion on Workflows, using §3 (C14, C15, C17, D23, D30, D33, D37), §4, §6.3, §6.4, §6.11 and §6.12. It builds on [plan 1A](2026-10-25-jotbun-p1a-vault-core.md) as merged, and on plan 1B. It applies the controller's rulings R42 to R57 on the first review (`review-1c.md`).

**Phase 1 plans:** 1A the vault core (executing); 1B files, exports, the vault erase primitive and the C1 fold; **1C (this plan)** Better Auth, sessions as devices, the app's sign-in port and account deletion; 1D live pokes, the pending choice, PostHog and the phase 1 proof.

**What 1C uses from 1A and 1B** (1B's plan is written through 1B-T4; the later ids follow the review's mapping):
- 1A as merged: `handleVaultV1` and its private `verifierFor` (a WeakMap cache, 503 on a configuration error); `createTokenVerifier` with `clockTolerance` 30 and `maxTokenAge` 930; `MAX_TOKEN_LIFETIME_SECONDS` (900, `src/v1/protocol.ts`); `CLOCK_TOLERANCE_SECONDS` (30, `@api/auth/auth0-token-verifier`); `ensureAccount`, `assertSession`, `revokeSession` (`src/vault/session.ts`); `account_state.not_before` (epoch seconds) and `revoked_sessions (session_id, revoked_at, expires_at)` with ISO text times; every vault table `STRICT`.
- 1B-T2: `UserVault#erase()` (durable: it leaves a `deleted` marker row, B22), `purgeVaultObjects(bucket: VaultBucket, vaultId: string)`, `VaultBucket`, and `ensureAccount` refusing a `deleted` vault with 403.
- 1B-T3: Worker routes (`VaultRoute.worker?: WorkerRouteId`, `WORKER_HANDLERS`, `WorkerContext`, `workerSessionFor`), `VaultAccess` with `recent_proof`, `claims.authTime` read from `auth_time`, and `assertFreshSignIn(claims, nowSeconds)` with `FRESH_SIGN_IN_SECONDS` (300) in `src/v1/fresh-sign-in.ts`.
- 1B-T4: `createOnce(workflow, id, params)` and the shim types `Workflow` and `WorkflowInstance`.
- 1B-T6: the `WorkflowEntrypoint` shim; the export routes keep `proof_id` in their body (B8).
- 1B-T13: the C1 fold: `src/vault-worker.ts` (the HTTP Worker re-exports its classes), `test/c1-shape.test.ts` (its workflow list), `test/route-coverage.test.ts` (its `VAULT_DEFERRED_ROUTES` check, which 1B leaves holding exactly the two deletion routes, B16), and `readyResponseOf` in `src/v1/ready.ts`.

## Shared files

Other plans' tasks edit these too. Every 1C edit to them is additive; the controller resolves order at merge. Tasks 2, 3 and 4 all edit `src/auth/create-auth.ts`: merge them in that order, each rebased on the one before (M19).

- `apps/edge/package.json`, `apps/edge/package-lock.json` (Task 1 adds Better Auth; Task 2 changes `build` and adds `build:local`).
- `apps/app/package.json`, root `package-lock.json` (Task 5 adds Better Auth; Task 7 adds native sign-in).
- `apps/edge/wrangler.jsonc` (Task 1: `AUTH_DB`, `ERASURE_DB`, `EMAIL`, vars), `apps/edge/wrangler.vault.jsonc` (Task 10a: `AUTH_DB`, `ERASURE_DB`, the auth vars), and whichever of the two declares `EXPORT_WORKFLOW` after 1B-T13 (Task 11: `DELETION_WORKFLOW`).
- `apps/edge/vitest.workers.config.ts` (Task 1: the D1 test databases, their migrations and test vars). If 1B-T13 makes it load a config that already binds `AUTH_DB` and `ERASURE_DB`, keep one declaration at that merge.
- `apps/edge/src/server.ts` (Task 1: `/api/auth/*`; when merging with 1B-T13's version keep its `queue` handler and re-exports, K3), `apps/edge/src/vault-worker.ts` (Task 11: exports `DeletionWorkflow`), `apps/edge/src/cloudflare-workers.d.ts` (D1 and email types).
- `apps/edge/src/v1/handler.ts`, `env.ts`, `routes.ts`, `protocol.ts`, `ready.ts`, `src/vault/user-vault.ts`, `session.ts` (Tasks 10a, 10b and 11).
- `apps/edge/test/c1-shape.test.ts`, `test/route-coverage.test.ts`, `test/vault-route-coverage.test.ts` (Task 11).
- `apps/edge/scripts/dev.mjs`, `apps/edge/README.md` (Task 12).
- `apps/app/src/api/client.ts` (Tasks 5 and 6), `apps/app/src/messages/en.json`, `th.json`, `apps/app/src/i18n/catalogs.test.ts`, `apps/app/src/config/featureFlags.ts` (Tasks 8 and 9).
- 1D builds on these 1C files: `apps/edge/src/deletion/hooks.ts`, `workflow.ts` and `test/workers/deletion.test.ts` (Task 11; 1D-T13 fills the hook), the RPCs in `src/vault/user-vault.ts` (Task 10a; 1D-T12 closes sockets), and `apps/app/src/auth/credentialProvider.ts` with its test (Task 5; 1D-T14 sends the account events, reading `created`).
- `docs/implementation/premium-progress.md` (every task's receipt).

## Calls made in this plan

The builder's, not the owner's, unless marked as a controller ruling. Doc sources are the Better Auth 1.6.23 docs (context7 `/better-auth/better-auth/v1.6.23`) unless named; the reviewer checked behaviour against the published 1.6.33 build.

- **K1. Pin Better Auth 1.6.33** for all three packages: the newest 1.6 patch (published 14 September 2026), the line the docs were checked against.
- **K2. D1 migrations are handwritten SQL**, proven equal to Better Auth's own migrator: a test runs `getMigrations(auth.options)` (`better-auth/db/migration`, concepts/database.mdx "Programmatic Migrations") on an empty reference D1 and compares every table, column, index and foreign key with ours. The Better Auth CLI is not an approved package, and §9 leaves schema generation to the builder.
- **K3. `/api/auth/*` is intercepted in `src/server.ts`** before TanStack Start, so the generated `routeTree.gen.ts` does not change. 1B-T13's `server.ts` keeps its `queue` handler and re-exports at that merge.
- **K4. JWTs:** EdDSA with Ed25519 (the plugin default, plugins/jwt.mdx), lifetime `10m`, payload exactly `sub`, `sid`, `auth_time` plus `iat`, `exp`, `iss`, `aud`. The plugin's default payload is the whole user object (plugins/jwt.mdx), so `definePayload` narrows it. The `set-auth-jwt` header is off; devices read tokens from `/api/auth/token`.
- **K5. `auth_time` is the session's `createdAt`** in epoch seconds. A fresh sign-in is 1B-T3's rule (`assertFreshSignIn`, `FRESH_SIGN_IN_SECONDS` 300), which matches today's five-minute proofs; Better Auth 1.6 measures `freshAge` from `createdAt` too (blogs/1-6.mdx), and `session.freshAge` is 300 so its own guards agree.
- **K6. Devices are served by a small plugin of ours, `jotbun-account`** (`createAuthEndpoint` and `sessionMiddleware`, concepts/plugins.mdx): list (ids, never tokens), sign out one, sign out the others, sign out everywhere. Each handler tells the vault first and deletes the D1 sessions second. Better Auth's own `/list-sessions`, `/revoke-session`, `/revoke-sessions` and `/revoke-other-sessions` go into `disabledPaths`.
- **K7. The vault's verifier reads Better Auth's keys in process:** 1A's private `verifierFor` builds a verifier over the JWKS endpoint called through `auth.handler` whenever `AUTH_DB` is bound, cached in its WeakMap, re-reading the keys at most once every 30 seconds for an unknown key id (R50).
- **K8. One gate before every vault call:** right after the token check, every route that is not public (vault routes and 1B's Worker routes alike) reads `account_status` from `AUTH_DB` and the erasure registry from `ERASURE_DB` in parallel; the two deletion routes skip it (R49, R56).
- **K9. Sign-in rate limits:** Better Auth's limiter with D1 storage, keyed by `cf-connecting-ip` (concepts/rate-limit.mdx), plus our own cap of **5 codes per address per 15 minutes** in a `before` hook. Thai mobile networks put many people behind one address (carrier-grade NAT), so the per-network limits are loose (10 code requests a minute) and the per-address cap does the real work (M14).
- **K10. The second email provider is Resend behind a switch** (default pending owner Q4): `EMAIL_SECONDARY` = `off` (the default), `fallback` or `only`, and it stays off until `RESEND_API_KEY` exists.
- **K11. The sign-in code email is bilingual, Thai first**, because no language is known before sign-in. The deletion email uses the request's `Accept-Language` (read once, stored with the request; Thai unless it asks for English), because v1 request bodies cannot change (R46).
- **K12. The local code log is compiled out by Vite mode** (`import.meta.env.MODE !== 'production'`, and `JOTBUN_ENV` local or test at run time); `npm run build` fails if its marker survives in `dist/`; `npm run build:local` builds the variant `wrangler dev` runs for the proof.
- **K13. The app's session "binding" becomes the Better Auth session id**, and the transport stops sending `X-GoGoSpend-Session`. Every new session, including every fresh sign-in, moves the epoch, exactly as a new binding does today.
- **K14. A fresh sign-in makes a new session with the account's own method**, then signs the old one out; the email is fixed to the account's own address, and an Apple or Google token is checked against the account's linked provider ids before anything is sent. Apple and Google run with `disableImplicitSignUp: true` (concepts/oauth.mdx); only the sign-in screen sends `requestSignUp: true`.
- **K15. Apple sign-in is iOS only in phase 1** (default pending owner Q7): Android has no native Apple sheet, and an Apple account can always sign in on Android with an email code to its address (C14).
- **K16. C15 on today's first run** (default pending owner Q7): the story stays, its first screen gains the board's "มีบัญชีแล้ว เข้าสู่ระบบ" link straight to sign-in, the story ends at sign-in, and today's reminder question moves to right after sign-in (R55), so the order is welcome, sign-in, then the budget question and setup. `bw-welcome` replaces the story in phase 2.
- **K17. Deletion's records:** `account_status` rows have no foreign key to Better Auth's `user`. The deletion route marks `deleting` at once; step 5 writes the registry entry to `ERASURE_DB` first, then deletes Better Auth's rows and sets `deleted` in one `AUTH_DB` batch; step 8 runs one hour later. The Workflow's parameters carry only the request id; steps read the user id from `deletion_requests`, which forgets it at the final sweep (M11).
- **K18. The deletion email address** sits in `deletion_requests` only until step 7 sends it, then it is nulled; no step returns it.
- **K19. A social sign-in refused by C14 answers `403 { code: 'ACCOUNT_EXISTS', methods }`.** Better Auth refuses it as 401 `{ code: 'OAUTH_LINK_ERROR', message: 'account not linked' }` (M13); our handler rewrites that one answer and, when the provider verified the email, names the existing account's methods so the screen can say which to use (R54, C14).
- **K20. Sessions last 30 days from last use** (`expiresIn` 30 days, `updateAge` 1 day); a session unused that long ends and D37 keeps the phone's unsent records.
- **K21. The erasure registry lives in `ERASURE_DB`** (controller ruling R56; the owner may overturn it), created with the `apac` hint like `AUTH_DB`. Sign-in also checks it, so even a restored `AUTH_DB` cannot sign a deleted account in.
- **K22. Linking needs a fresh sign-in, and unlinking stays on** (controller ruling R43; the owner may overturn it): `/link-social` is refused with 403 `REAUTH_REQUIRED` unless the session is at most 300 seconds old, and `/unlink-account` keeps Better Auth's fresh-session guard and refusal of the last remaining account, so a wrongly linked method can be removed.
- **K23. A sign-in answer says whether it created the account** (for 1D-T14's `signed_up`). Better Auth's answers do not: `/sign-in/email-otp` answers `{ token, user }` even when its first code registers the address (plugins/email-otp.mdx), and `/sign-in/social` with an ID token answers `{ redirect, token, url, user }`, dropping its internal `isRegister` (checked in the published 1.6.33 build). A `user.create.after` database hook cannot carry it either: `auth.handler` wraps each request in `runWithAdapter`, which queues that hook until the handler has built its answer (`dist/auth/base.mjs`, `@better-auth/core` `queueAfterTransactionHook`). So `handleAuthRequest` adds `created`: true when the answer's `user.createdAt` is at or after the moment the request arrived. The app's port carries it as `ServerSession.created`, and the provider as `SignInResult.created`.

## Owner questions

The controller asks the owner. Each gated task carries its default, marked "default pending owner Qn"; nothing below blocks Tasks 1 to 6, 8 or 10a.

- **Q1. `@react-native-google-signin/google-signin` 16.1.5.** Its docs list Expo 52.0.40 to 57 and React Native 0.76 to 0.87; the app is on Expo 58 and React Native 0.88. Default: approved, gated on the development-build check, with the Google button hidden until that check passes. `expo-apple-authentication` (Expo's own module, 58.0.2) is covered by §4.
- **Q2. `expo-network`.** Default: not installed; `@better-auth/expo` 1.6.33 lists it as an optional peer and the client treats it as optional.
- **Q3. Passkeys in the app** need a native passkey package and a domain. Default: the server side ships (Task 1); the app's passkey offer waits until after phase 1.
- **Q4. The second email provider.** Default: Resend, behind the switch, off until keys exist (Task 2).
- **Q5. Apple token revocation on deletion.** Default: yes, as a `DeletionWorkflow` step before the beta, keeping Apple's `authorizationCode` at sign-in (Task 13).
- **Q6. The D33 items for phone checks:** the bundle id and URL scheme, the Google client ids, a Workers Paid account with a verified Email Service domain, an Expo/EAS project, and `AUTH_DB` and `ERASURE_DB` created with the `apac` hint. Default: every check that needs them is SKIPPED until they exist.
- **Q7. K15 and K16.** Default: as planned.

## Global Constraints

- **Packages (§4):** exact pins `better-auth` 1.6.33, `@better-auth/expo` 1.6.33 and `@better-auth/passkey` 1.6.33 in `apps/edge`; `better-auth` 1.6.33 and `@better-auth/expo` 1.6.33 in `apps/app`; native sign-in per Q1. Resend is called with `fetch`, no package. No other package, and no lockfile regeneration with Linux bindings.
- **No cloud resources.** The `EMAIL` binding never sets `remote: true`. Local and test builds log sign-in codes instead of sending them. Apple, Google, Resend, the real Email Service and every phone check are recorded **SKIPPED** until the D33 accounts exist and the owner says so.
- **Process for every task** (handover §4): a behavioural RED with counts, GREEN, a mutation check, the full gate, a receipt in `docs/implementation/premium-progress.md` under a new heading "## 1C: Better Auth and the sign-in port", a local commit ending with the attribution trailer, and an independent read-only review of the commit. Do not push. Never run a bare `git stash`. Make no changes under `vendor/`.
- **Behavioural REDs (R52):** before each RED, write typed stubs for every module, function and migration the task lists under Produces: functions return wrong but typed values (`null`, `[]`, a 501 reply), and migration files exist with no statements. Each RED then fails on assertions, never on a missing module (handover §4 step 2).
- **One expected value per test (M16):** a test asserts one exact status and code. Where this plan names a Better Auth status the published build may answer differently (marked "Better Auth's"), pin the value the first RED run shows and record it in the receipt.
- **SQL id lists (R57):** a list of ids of unbounded size binds as one JSON parameter, `IN (SELECT value FROM json_each(?))`, never one `?` per id, in vault SQL (Durable Object SQLite allows at most 100 bound parameters per query) and in D1 SQL alike.
- **Better Auth's times (M7):** Better Auth stores its `Date` columns in D1 as ISO 8601 text, so SQL that compares them binds `new Date().toISOString()`. Our own D1 tables keep epoch milliseconds (`INTEGER`); JWT claims and `not_before` are epoch seconds. Ids are checked with `isUuid` from contracts.
- **The edge gate** is 1A's, unchanged (Task 2 puts the local-log check inside `npm run build`):
  ```bash
  npm run typecheck:edge && npm run test:edge && npm run test:edge:workers && npm run build:edge && npm run test:edge:db
  ```
- **The app gate:**
  ```bash
  npm run typecheck:app && npm run test:unit && npm run test:render -w gogospend-app && npm run export:web -w gogospend-app -- --max-workers 2
  ```
- **Copy and screens (handover §3, E2):** new or changed screens and copy are built unrouted, in a folder listed in `AWAITING_E2` (`apps/app/src/i18n/catalogs.test.ts`), with their Thai drafts keyed by the English in that folder's `draftCopy.ts`, never in `en.json` or `th.json`. Words a board already shows are copied verbatim; every other string is marked `// DRAFT`. Simulator screenshots of every new state go to the owner; screens are routed and strings moved into the catalogs only after approval (Task 9). Thai first, no emojis, the voice rules of §5.1.
- **Identity (§6.2, §6.4):** user ids and session ids are UUIDs (`advanced.database.generateId: "uuid"`, concepts/database.mdx "UUIDs"). The vault is always `env.VAULT.idFromName(sub)` with `{ locationHint: 'apac' }`. No route reads a user, session or vault id from the request body or query.
- **Tokens and revocation:** EdDSA, at most 600 seconds, claims as in K4. The vault refuses a token issued before `not_before` or whose `sid` is revoked (1A). Every `revoked_sessions.expires_at` is `new Date(now + REVOCATION_KEEP_SECONDS * 1000).toISOString()`, where `REVOCATION_KEEP_SECONDS` = `MAX_TOKEN_LIFETIME_SECONDS` + `CLOCK_TOLERANCE_SECONDS` = 930 (R44); `not_before` is `Math.ceil(nowMs / 1000)` with nothing added.
- **Linking (C14, K22):** implicit linking off, no trusted providers, explicit linking only from a session at most 300 seconds old; unlinking keeps Better Auth's guards.
- **Erasure (C17, K21):** the registry in `ERASURE_DB` holds `HMAC-SHA256(ERASURE_KEY, "jotbun-erasure-v1\0" + userId)` in base64url, kept 60 days. It never holds an email, a name or a raw id.
- **Logging:** `failureName(error)` only. Never a code, a token, a cookie, an email or a request body, except the local code log in local builds (K12).
- **Privacy defaults:** `telemetry: { enabled: false }` (reference/telemetry.mdx), `session.cookieCache.enabled: false` (concepts/session-management.mdx: a cookie cache keeps revoked sessions alive until it expires), and `advanced.backgroundTasks` left unset, so every send is awaited (R47).

## Review Focus

The five inputs most likely to bite a real person that the spec implies but no ported test exercises. Each has its test in the task that owns the code.

1. **The same email typed differently** (capitals, spaces around it): it always reaches the one account that owns the address (Task 1, `an address typed with capitals and spaces reaches the same account`).
2. **Codes abused:** three wrong tries use a code up, an expired code is refused, and one address flooded from many networks gets at most 5 codes in 15 minutes (Task 1 for attempts and expiry; Task 2, `one address gets at most five codes in fifteen minutes, from any network`).
3. **Offline at the moment the token runs out:** the phone never locks, never signs out and never erases (Task 5, `offline is not a denial: the session stays active; a deleted session locks, and the lock lifts once a token works again`).
4. **A fresh sign-in that picks another Apple ID or Google account:** nothing is created, switched or lost (Task 3, `without requestSignUp an unknown Google account creates nothing`; Task 5, `a fresh sign-in by Google checks the token's subject against the linked account first; another subject is OTHER_ACCOUNT and nothing is sent`).
5. **A phone signed out elsewhere whose token is still valid:** the vault refuses it at once, it cannot delete the account, and the phone keeps its unsent records and sends them only to the same account (Task 10a, `signing out one device stops its unexpired JWT at the vault at once`; Task 11, `a device whose session was signed out cannot delete the account`; Task 6, `after a session ended, the same account sends the unsent records once; another account never sees them`).

---

## File structure

```
apps/edge/
  migrations/auth/
    0001_better_auth.sql           Better Auth's tables: user, session, account, verification, jwks, passkey, rateLimit
    0002_jotbun_auth.sql           account_status, email_code_sends
    0003_deletion.sql              deletion_requests (Task 11)
  migrations/erasure/
    0001_erasure_registry.sql      erasure_registry, in ERASURE_DB (R56)
  scripts/check-dist.mjs           fails `npm run build` if the local code log survives in dist/ (Task 2)
  scripts/auth-proof.mjs           the 1C proof against wrangler dev (Task 12)
  src/auth/                        Better Auth itself; no cloudflare:workers import, so tests build it with any env
    env.ts                         AuthEnv
    config.ts                      constants, AuthConfigError, parseList
    create-auth.ts                 createAuth(env, deps): the betterAuth instance
    instance.ts                    authFor(env): one instance per env object, for both Workers
    claims.ts                      jwtPayload (definePayload)
    handler.ts                     handleAuthRequest: the body cap, no-store, the ACCOUNT_EXISTS answer
    rate-limits.ts                 RATE_LIMIT_RULES
    code-limit.ts                  addressHash, codeSendsInWindow, recordCodeSend (Task 2)
    mailer.ts                      Mailer, transports, the switch, Resend, mailerFromEnv (Tasks 1, 2, 11)
    email-copy.ts                  DRAFT sign-in code and deletion emails (Tasks 2, 11)
    social.ts                      socialProvidersFromEnv, ProviderHooks (Task 3)
    erasure.ts                     subjectHash, isErased (Task 4)
    account-plugin.ts              the jotbun-account plugin: devices, sign-out everywhere (Task 4)
    account-status.ts              readAccountStatus (Task 4)
    vault-control.ts               VaultSessionControl, unwiredVaultControl, vaultSessionControl (Tasks 4, 10a)
    apple-tokens.ts                the Apple code exchange and revocation (Task 13)
  src/server/auth.ts               HTTP Worker glue: handleAuth(request), isAuthPath
  src/v1/auth-keys.ts              betterAuthJwks, betterAuthKeys: Better Auth's JWKS, in process (Task 10a)
  src/v1/auth-verifier.ts          verifierFor (moved from handler.ts), betterAuthVerifierFromEnv (Task 10a)
  src/v1/account-gate.ts           accountGate (Task 10a)
  src/vault/account-control.ts     REVOCATION_KEEP_SECONDS, revokeSessionIds, raiseNotBefore, accountRowFor (Task 10a; Task 11 adds the deleting update)
  src/deletion/                    request.ts, receipt.ts, steps.ts, hooks.ts, workflow.ts (Task 11)
  test/workers/auth/               schema, email-code, jwt, mailer, social, devices, account-status tests
    support/auth-harness.ts        testAuth(): a Better Auth on the test D1s with a capturing mailer
    support/id-tokens.ts           fake Apple and Google ID tokens and the test provider hooks (Task 3)
    support/apply-auth-migrations.ts
  test/workers/auth-vault.test.ts  Task 10a (support/auth-vault.ts: startAuthV1); test/workers/ready.test.ts Task 10b
  test/workers/deletion.test.ts    Task 11 (support/deletion.ts: deletionClient, deletionInstance, personWithData); test/workers/apple-revocation.test.ts Task 13
  test/check-dist.test.ts          Task 2 (Node)
apps/app/
  app.config.js                    reads app.json and adds the native sign-in plugins (Task 7)
  app/login/email.tsx, app/session-ended.tsx, app/settings/devices.tsx, app/onboarding/reminder.tsx   (Task 9)
apps/app/src/
  auth/betterAuthPort.ts           BetterAuthPort, BetterAuthClientLike, errors, createBetterAuthPort
  auth/betterAuthClient.ts         createAppAuthPort(): the real client (iOS and Android); .web.ts: unsupported
  auth/jotbunAccountClient.ts      the client plugin for the jotbun-account routes
  auth/nativeSignIn.ts             NativeSignIn, NO_NATIVE_SIGN_IN, idTokenSubject (Task 5); createNativeSignIn (Task 7)
  auth/nativeModules.ts            the two native modules behind appNativeSignIn() (Task 7; .web.ts has none)
  auth/appAuth.ts                  installAppAuth(): the provider the app installs at start
  auth/credentialProvider.ts       rewritten on the port
  auth/sessionStore.ts             SessionRecordStore (replaces the binding store)
  auth/sessionEnded.ts             the D37 model (Task 6)
  auth/globalLogout.ts             rewired onto the port (Task 6)
  auth/testing/fakeAuthServer.ts   an in-memory Better Auth for tests
  screens/redesign/signin/         draft screens awaiting E2 (Task 8), routed in Task 9
Deleted: apps/app/src/auth/auth0Client.ts, auth0Client.web.ts, auth0Port.ts, authApi.ts, testing/fakeDevice.ts (Task 5);
  reauthentication.ts (Task 6)
```

**Lanes** (for the controller): Tasks 1 and 5 now (1A-T1 is merged; Task 5 needs only `base`). Tasks 2, 3 and 4 after Task 1, merged in that order. Task 6 after Task 5; Task 8 after Tasks 5 and 6; Task 7 after Task 5. Task 9 after the owner approves Task 8's screenshots. Task 10a after Task 4, 1A-T2 and 1B-T3; Task 10b after Task 10a and 1B-T13. Task 11 after Tasks 2 and 10a and 1B-T2, 1B-T4, 1B-T6 and 1B-T13. Task 12 after Tasks 3, 6, 9, 10b and 11. Task 13 after Tasks 7 and 11.

---

### Task 1: Better Auth on D1: its tables, email-code sign-in and the JWT

**Starts after:** 1A-T1 (its Workers test harness, `vitest.workers.config.ts` and `@cloudflare/vitest-plugin`).

**Files:**
- Modify: `apps/edge/package.json` (dependencies, exact: `better-auth` 1.6.33, `@better-auth/passkey` 1.6.33, `@better-auth/expo` 1.6.33), `apps/edge/package-lock.json` (by npm)
- Create: `apps/edge/migrations/auth/0001_better_auth.sql`, `apps/edge/migrations/auth/0002_jotbun_auth.sql`, `apps/edge/migrations/erasure/0001_erasure_registry.sql`
- Create: `apps/edge/src/auth/env.ts`, `config.ts`, `claims.ts`, `rate-limits.ts`, `mailer.ts`, `create-auth.ts`, `instance.ts`, `handler.ts`; `apps/edge/src/server/auth.ts`
- Modify: `apps/edge/src/server.ts`, `apps/edge/wrangler.jsonc`, `apps/edge/vitest.workers.config.ts`, `apps/edge/src/cloudflare-workers.d.ts`
- Create: `apps/edge/test/workers/auth/support/auth-harness.ts`, `apps/edge/test/workers/auth/support/apply-auth-migrations.ts`
- Test: `apps/edge/test/workers/auth/schema.test.ts`, `email-code.test.ts`, `jwt.test.ts`

**Interfaces:**
- Consumes: 1A-T1's `vitest.workers.config.ts` (it keeps `wrangler.vault.jsonc` as its Worker and gains the bindings below); `readRawJsonBody` and `BodyError` (`src/server/http/request.ts`); `failureName` (`@api/common/safe-request-logger`, as 1A logs).
- Produces:
  ```ts
  // src/auth/env.ts
  export type AuthEnv = {
    AUTH_DB: D1Database
    ERASURE_DB?: D1Database          // its own database (R56); read from Task 4 on
    EMAIL?: EmailBinding
    JOTBUN_ENV?: string
    AUTH_BASE_URL?: string           // Better Auth's baseURL, e.g. http://localhost:8092
    AUTH_ISSUER?: string             // JWT iss; 1A's verifier reads the same setting
    AUTH_AUDIENCE?: string           // JWT aud; 1A's verifier reads the same setting
    AUTH_TRUSTED_ORIGINS?: string    // comma list; "gogospend://" in wrangler.jsonc, the Expo dev origins only in .dev.vars (M4)
    BETTER_AUTH_SECRET?: string      // secret, at least 32 characters
    ERASURE_KEY?: string             // secret, at least 32 characters (Tasks 4, 10a, 11)
    EMAIL_FROM?: string; EMAIL_SECONDARY?: string; RESEND_API_KEY?: string     // Task 2
    APPLE_BUNDLE_ID?: string; APPLE_CLIENT_SECRET?: string                       // Tasks 3, 13
    GOOGLE_CLIENT_IDS?: string; GOOGLE_CLIENT_SECRET?: string                    // Task 3
    PASSKEY_RP_ID?: string; PASSKEY_ORIGINS?: string
  }
  // src/auth/config.ts
  export const AUTH_BASE_PATH = '/api/auth'
  export const CODE_DIGITS = 6, CODE_TTL_SECONDS = 600, CODE_ATTEMPTS = 3
  export const JWT_LIFETIME = '10m', JWT_LIFETIME_SECONDS = 600
  export const SESSION_EXPIRES_SECONDS = 30 * 86_400, SESSION_UPDATE_AGE_SECONDS = 86_400
  export const AUTH_BODY_MAX_BYTES = 65_536
  export const DISABLED_EMAIL_OTP_PATHS = ['/forget-password/email-otp', '/email-otp/check-verification-otp', '/email-otp/verify-email', '/email-otp/request-password-reset', '/email-otp/reset-password', '/email-otp/request-email-change', '/email-otp/change-email'] as const
  export class AuthConfigError extends Error {}   // name 'AuthConfigError'; the message names the missing setting only
  export function parseList(value: string | undefined): string[]   // split on ',', trim, drop empty entries
  // src/auth/claims.ts
  export type JotbunJwtClaims = { sid: string; auth_time: number }
  export function jwtPayload(session: { session: { id: string; createdAt: Date | string | number } }): JotbunJwtClaims
  // src/auth/mailer.ts (Task 2 completes it)
  export type SignInCode = { to: string; code: string; expiresAt: Date }
  export interface Mailer { sendSignInCode(message: SignInCode): Promise<void> }
  export class MailerUnavailable extends Error {}
  export function mailerFromEnv(env: AuthEnv): Mailer   // Task 1: rejects every send with MailerUnavailable
  // src/auth/rate-limits.ts
  export const RATE_LIMIT_RULES: Record<string, { window: number; max: number }>
  // src/auth/create-auth.ts
  export type AuthDeps = { mailer: Mailer; vault?: VaultSessionControl; providerHooks?: ProviderHooks }   // vault: Task 4; providerHooks: Task 3
  export function createAuth(env: AuthEnv, deps: AuthDeps)   // builds `options satisfies BetterAuthOptions` (M17), returns betterAuth(options)
  export type JotbunAuth = ReturnType<typeof createAuth>
  // src/auth/instance.ts: no cloudflare:workers import, so the vault Worker can use it too (Task 10a)
  export function authFor(env: AuthEnv): JotbunAuth   // one instance per env object (WeakMap); deps = { mailer: mailerFromEnv(env) } (Task 4 adds the vault, Task 10a the real one)
  // src/auth/handler.ts
  export function handleAuthRequest(auth: JotbunAuth, request: Request): Promise<Response>
  export const SIGN_IN_ANSWER_PATHS: readonly string[]   // `${AUTH_BASE_PATH}/sign-in/email-otp` and `${AUTH_BASE_PATH}/sign-in/social`
  /** True only when `answer.user.createdAt` parses and is at or after `receivedAtMs`: this request created the account (K23). */
  export function createdDuring(answer: unknown, receivedAtMs: number): boolean
  // src/server/auth.ts: the HTTP Worker's glue, the only auth module that imports cloudflare:workers
  export function isAuthPath(pathname: string): boolean           // '/api/auth' or '/api/auth/...'
  export function handleAuth(request: Request): Promise<Response>  // authFor(env); 503 { code: 'SERVICE_UNAVAILABLE' } on AuthConfigError
  // test/workers/auth/support/auth-harness.ts
  export const TEST_AUTH = { baseUrl: 'http://auth.test', issuer: 'http://auth.test', audience: 'jotbun-v1' } as const
  export type SignedIn = { email: string; cookie: string; userId: string; sessionId: string; created: boolean }   // created: the sign-in answer's (K23)
  export type TestAuth = {
    auth: JotbunAuth
    mailer: { sent: SignInCode[]; lastCode(email: string): string }   // lastCode trims and lower-cases its argument (M6)
    request(path: string, init?: { method?: string; body?: unknown; rawBody?: string; cookie?: string; ip?: string }): Promise<Response>
    requestCode(email: string, ip?: string): Promise<Response>
    signInByEmail(email: string): Promise<SignedIn>
    token(cookie: string): Promise<string>        // GET /api/auth/token → body.token
  }
  export function testAuth(deps?: Partial<AuthDeps>, env?: Partial<AuthEnv>): TestAuth
  ```
  `TestAuth.request` sends `origin: http://auth.test`, `content-type: application/json`, a `cf-connecting-ip` from the documentation range (random unless `ip` is given) and the cookie when given, through `handleAuthRequest`. `signInByEmail` requests a code, reads it from the capturing mailer, posts `/api/auth/sign-in/email-otp`, keeps the `better-auth.session_token` pair from `set-cookie` and `created` from the answer's JSON, and reads both ids from `GET /api/auth/get-session`.

- [ ] **Step 1: Install the packages.**
  ```bash
  npm view better-auth@1.6.33 version && npm view @better-auth/passkey@1.6.33 version && npm view @better-auth/expo@1.6.33 version
  npm install --prefix apps/edge --save-exact better-auth@1.6.33 @better-auth/passkey@1.6.33 @better-auth/expo@1.6.33
  npm ls --prefix apps/edge jose wrangler     # one jose (6.2.12), one wrangler (4.152.0)
  ```
  Record in the receipt any install script a new package brings (none is expected).

- [ ] **Step 2: Write the bindings, the harness and the typed stubs.**
  - `wrangler.jsonc` adds:
    - `d1_databases`: `{ "binding": "AUTH_DB", "database_name": "jotbun-auth", "database_id": "00000000-0000-0000-0000-000000000000", "migrations_dir": "migrations/auth" }` and `{ "binding": "ERASURE_DB", "database_name": "jotbun-erasure", "database_id": "00000000-0000-0000-0000-000000000001", "migrations_dir": "migrations/erasure" }` (local placeholder ids, as the Hyperdrive id is; a comment says the owner creates both with the `apac` location hint, default pending owner Q6);
    - `send_email: [{ "name": "EMAIL" }]`, with a comment that `remote` stays unset (it would reach the real service from `wrangler dev`);
    - vars `AUTH_BASE_URL` and `AUTH_ISSUER` (`"http://localhost:8092"`), `AUTH_AUDIENCE` (`"jotbun-v1"`), `AUTH_TRUSTED_ORIGINS` (`"gogospend://"`);
    - a comment naming the secrets `BETTER_AUTH_SECRET` and `ERASURE_KEY` (`wrangler secret put`; locally in `.dev.vars`, Task 12).
  - `vitest.workers.config.ts`: give `cloudflareTest` an async function, as in the Cloudflare docs (workers/testing/vitest-integration/configuration.mdx), that reads `readD1Migrations('./migrations/auth')` and `readD1Migrations('./migrations/erasure')`. Add `miniflare.d1Databases: ['AUTH_DB', 'AUTH_DB_REFERENCE', 'ERASURE_DB']`, the bindings `TEST_AUTH_MIGRATIONS` and `TEST_ERASURE_MIGRATIONS`, and the test vars `AUTH_BASE_URL` and `AUTH_ISSUER` (`http://auth.test`), `AUTH_AUDIENCE` (`jotbun-v1`), `AUTH_TRUSTED_ORIGINS` (`gogospend://`), `BETTER_AUTH_SECRET` (`synthetic-better-auth-secret-0123456789abcdef`), `ERASURE_KEY` (`synthetic-erasure-key-0123456789abcdef0123`). `setupFiles: ['test/workers/auth/support/apply-auth-migrations.ts']` calls `applyD1Migrations` (`cloudflare:test`) for both databases. Check each option name against the installed `@cloudflare/vitest-plugin` types; if `readD1Migrations` is exported only from `@cloudflare/vitest-plugin/config`, import it from there.
  - `cloudflare-workers.d.ts`: add only what 1C uses: `D1Database` (`prepare`, `batch`, `exec`), `D1PreparedStatement` (`bind`, `first`, `all`, `run`), `D1Result` (with `meta.changes`), and `EmailBinding` with `send(message: { to: string; from: string; subject: string; html: string; text: string }): Promise<{ messageId: string }>` (the Email Service Workers API). Add `AUTH_DB`, `AUTH_DB_REFERENCE`, `ERASURE_DB`, `TEST_AUTH_MIGRATIONS` and `TEST_ERASURE_MIGRATIONS` to `Cloudflare.Env`. If `tsc` says `D1Database` does not satisfy Better Auth's `database` option, add exactly the members it names.
  - Typed stubs (R52): every module above with wrong but typed bodies (`createAuth` returns `betterAuth({ database: env.AUTH_DB, secret, baseURL })` with no plugins; `jwtPayload` returns `{ sid: '', auth_time: 0 }`; `handleAuthRequest` answers 501), and the three migration files with no statements.

- [ ] **Step 3: Write the failing tests.**

  `schema.test.ts`:
```ts
const BETTER_AUTH_TABLES = ['account', 'jwks', 'passkey', 'rateLimit', 'session', 'user', 'verification']
const rows = async (db: D1Database, sql: string, ...args: unknown[]) => (await db.prepare(sql).bind(...args).all()).results
const tables = async (db: D1Database) => (await rows(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name <> 'd1_migrations' ORDER BY name")).map((r) => r.name)
const columns = async (db: D1Database, table: string) => (await rows(db, `PRAGMA table_info("${table}")`)).map((c) => [c.name, String(c.type).toLowerCase(), c.notnull, c.pk]).sort()
const indexes = async (db: D1Database, table: string) => (await rows(db, "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND name NOT LIKE 'sqlite\\_autoindex%' ESCAPE '\\' ORDER BY name", table)).map((r) => r.name)
const foreignKeys = async (db: D1Database, table: string) => (await rows(db, `PRAGMA foreign_key_list("${table}")`)).map((k) => [k.table, k.from, k.to, k.on_delete]).sort()

it('Better Auth finds nothing to create or add on the migrated AUTH_DB', async () => {
  const { toBeCreated, toBeAdded } = await getMigrations(testAuth().auth.options)
  expect([toBeCreated, toBeAdded]).toEqual([[], []])
})

it('our Better Auth tables equal what its own migrator creates: columns, indexes and foreign keys', async () => {
  await (await getMigrations(testAuth({}, { AUTH_DB: env.AUTH_DB_REFERENCE }).auth.options)).runMigrations()
  expect(await tables(env.AUTH_DB_REFERENCE)).toEqual(BETTER_AUTH_TABLES)
  for (const table of BETTER_AUTH_TABLES) {
    expect(await columns(env.AUTH_DB, table)).toEqual(await columns(env.AUTH_DB_REFERENCE, table))
    expect(await indexes(env.AUTH_DB, table)).toEqual(await indexes(env.AUTH_DB_REFERENCE, table))
    expect(await foreignKeys(env.AUTH_DB, table)).toEqual(await foreignKeys(env.AUTH_DB_REFERENCE, table))
  }
})

it('AUTH_DB holds Better Auth and our account tables; the erasure registry is alone in ERASURE_DB', async () => {
  expect(await tables(env.AUTH_DB)).toEqual([...BETTER_AUTH_TABLES, 'account_status', 'email_code_sends'].sort())
  expect(await tables(env.ERASURE_DB)).toEqual(['erasure_registry'])
})

it('account_status accepts only active, deleting and deleted', async () => {
  await expect(env.AUTH_DB.prepare("INSERT INTO account_status (user_id, status, updated_at) VALUES (?, 'paused', 0)").bind(crypto.randomUUID()).run()).rejects.toThrow(/CHECK/)
})
```

  `email-code.test.ts` (every case uses a fresh address `${crypto.randomUUID()}@example.test`; `UUID` is `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/`; statuses marked Better Auth's follow the M16 rule):
  - `the first code signs a person up with a UUID user id`: `userId` and `sessionId` match `UUID`.
  - `the next code signs into the same user with a new session`: a second `signInByEmail` gives the same `userId` and another `sessionId`.
  - `the first code's answer says it created the account; the next code's answer does not` (K23): the first `signInByEmail(email).created` is `true`, the second is `false`.
  - `an answer without a readable creation time never says created`: `createdDuring({ user: { createdAt: 'soon' } }, 0)` is `false`.
  - `a code is six digits`: `mailer.lastCode(email)` matches `/^\d{6}$/`.
  - `a code expires after ten minutes`: `expiresAt - Date.now()` is between 590 000 and 600 000; after `vi.useFakeTimers({ toFake: ['Date'] })` and `vi.setSystemTime(Date.now() + 601_000)`, the right code answers 400 `OTP_EXPIRED` (Better Auth's) and no session exists for the address. If fake time does not reach Better Auth in workerd, move the `verification` row's `expiresAt` into the past (ISO text, selected with `instr(identifier, ?) > 0` on the address) and say so in the receipt.
  - `three wrong codes use a code up`: three wrong codes each answer 400 `INVALID_OTP` (Better Auth's); the right code then answers 403 `TOO_MANY_ATTEMPTS` (Better Auth's); `SELECT count(*) AS n FROM session s JOIN "user" u ON u.id = s.userId WHERE u.email = ?` is 0.
  - `an address typed with capitals and spaces reaches the same account` (Review Focus 1): `signInByEmail(' Kan.' + id + '@Example.TEST ')` and then `signInByEmail('kan.' + id + '@example.test')` give one `userId`, and `user.email` is stored lower-case and trimmed.
  - `only sign-in codes are sent, for a known address and an unknown one`: `POST /api/auth/email-otp/send-verification-otp` with `type: 'email-verification'` answers 400 `{ code: 'UNSUPPORTED_CODE_TYPE' }` both for an address that has an account and for one that does not, and `mailer.sent` stays empty (R47).
  - `the password, verification and change-email code routes are off`: each path in `DISABLED_EMAIL_OTP_PATHS`, posted with a JSON body, answers 404.
  - `the eleventh code request from one network in a minute is 429`: ten requests from `203.0.113.7` across three addresses (4, 4 and 2) answer 200; the eleventh answers 429; a request from `203.0.113.8` answers 200 (M14).
  - `a body over 64 KiB is refused before Better Auth reads it`: `POST /api/auth/sign-in/email-otp` with a 70,000-byte JSON body answers 413 `{ code: 'PAYLOAD_TOO_LARGE' }` (M3).

  `jwt.test.ts`:
```ts
it('a signed-in device gets a ten-minute EdDSA JWT naming only the user, the session and the sign-in time', async () => {
  const t = testAuth()
  const me = await t.signInByEmail(`${crypto.randomUUID()}@example.test`)
  const token = await t.token(me.cookie)
  const jwks = await (await t.request('/api/auth/jwks')).json()
  const { payload, protectedHeader } = await jwtVerify(token, createLocalJWKSet(jwks), { issuer: TEST_AUTH.issuer, audience: TEST_AUTH.audience })
  expect(protectedHeader.alg).toBe('EdDSA')
  expect(Object.keys(payload).sort()).toEqual(['aud', 'auth_time', 'exp', 'iat', 'iss', 'sid', 'sub'])
  expect([payload.sub, payload.sid]).toEqual([me.userId, me.sessionId])
  expect(payload.exp! - payload.iat!).toBeLessThanOrEqual(600)
  expect(Math.abs((payload.auth_time as number) - Math.floor(Date.now() / 1000))).toBeLessThanOrEqual(5)
})
```
  - `a renewed token keeps the sign-in time`: after `vi.setSystemTime(Date.now() + 240_000)` a new token has a larger `iat` and the same `auth_time`.
  - `without a session /token is 401`: `GET /api/auth/token` with no cookie answers 401.
  - `auth answers are no-store`: `GET /api/auth/jwks` carries `cache-control: no-store`.
  - `an unknown auth path is 404`: `GET /api/auth/nothing-here` answers 404.
  - `passkeys are mounted on D1`: `GET /api/auth/passkey/list-user-passkeys` with a cookie answers 200 `[]` (default pending owner Q3: the server side ships, the app offer waits).
  - `Better Auth refuses to start without its secret`: `createAuth({ ...env, BETTER_AUTH_SECRET: undefined }, deps)` throws `AuthConfigError`.

- [ ] **Step 4: Run them and see them fail.**
  Run: `npm run test:edge:workers -- test/workers/auth/`
  Expected: every case fails on its assertions against the stubs. Record the counts.

- [ ] **Step 5: Write the migrations.**
  - `0001_better_auth.sql` creates exactly the tables, columns, types, NOT NULL flags, keys, foreign keys and indexes Better Auth 1.6.33's migrator creates on D1 for this configuration (the core tables, `jwks`, `passkey`, `rateLimit`), with quoted identifiers (`"user"`, `"emailVerified"`). To write it, run the reference half of the second schema test once and copy `SELECT sql FROM sqlite_master` from `AUTH_DB_REFERENCE`; from then on the test keeps the two equal.
  - `0002_jotbun_auth.sql`:
    ```sql
    CREATE TABLE account_status (user_id TEXT PRIMARY KEY NOT NULL, status TEXT NOT NULL CHECK (status IN ('active', 'deleting', 'deleted')), updated_at INTEGER NOT NULL);
    CREATE TABLE email_code_sends (address_hash TEXT NOT NULL, sent_at INTEGER NOT NULL);
    CREATE INDEX email_code_sends_address_idx ON email_code_sends (address_hash, sent_at);
    ```
    No row in `account_status` means active; only deletion writes rows (K17).
  - `migrations/erasure/0001_erasure_registry.sql`: `CREATE TABLE erasure_registry (subject_hash TEXT PRIMARY KEY NOT NULL, recorded_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);`

- [ ] **Step 6: Implement `createAuth`, the handler and the glue.** `createAuth` throws `AuthConfigError` unless `AUTH_BASE_URL`, `AUTH_ISSUER`, `AUTH_AUDIENCE` and a `BETTER_AUTH_SECRET` of at least 32 characters are set, then returns `betterAuth(options)`, where `options satisfies BetterAuthOptions` (`import type { BetterAuthOptions } from 'better-auth'`) holds:
  - `database: env.AUTH_DB` (the built-in D1 dialect, concepts/database.mdx "Cloudflare D1"), `baseURL: env.AUTH_BASE_URL`, `basePath: AUTH_BASE_PATH`, `secret: env.BETTER_AUTH_SECRET`, `trustedOrigins: parseList(env.AUTH_TRUSTED_ORIGINS)`, `telemetry: { enabled: false }`, `disabledPaths: [...DISABLED_EMAIL_OTP_PATHS]` (Task 4 adds the session routes);
  - `advanced: { database: { generateId: 'uuid' }, ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } }`, with `backgroundTasks` left unset;
  - `session: { expiresIn: SESSION_EXPIRES_SECONDS, updateAge: SESSION_UPDATE_AGE_SECONDS, freshAge: 300, cookieCache: { enabled: false } }` (300 is 1B-T3's `FRESH_SIGN_IN_SECONDS`; Task 10a imports it once 1B-T3 is merged);
  - `rateLimit: { enabled: true, storage: 'database', window: 60, max: 100, customRules: RATE_LIMIT_RULES }`, where `RATE_LIMIT_RULES` holds `'/email-otp/send-verification-otp': { window: 60, max: 10 }`, `'/sign-in/email-otp': { window: 60, max: 10 }`, `'/sign-in/social': { window: 60, max: 10 }` and `'/token': { window: 60, max: 60 }`;
  - `hooks.before` (`createAuthMiddleware` and `APIError` from `better-auth/api`): for `/email-otp/send-verification-otp` and `/sign-in/email-otp`, return `{ context: { ...ctx, body: { ...ctx.body, email: String(ctx.body.email).trim().toLowerCase() } } }` (concepts/hooks.mdx "Modify Request Context"); for `/email-otp/send-verification-otp` with `ctx.body.type !== 'sign-in'`, throw `new APIError('BAD_REQUEST', { code: 'UNSUPPORTED_CODE_TYPE', message: 'UNSUPPORTED_CODE_TYPE' })` before anything is looked up (R47);
  - plugins, in this order:
    - `emailOTP({ otpLength: CODE_DIGITS, expiresIn: CODE_TTL_SECONDS, allowedAttempts: CODE_ATTEMPTS, storeOTP: 'hashed', disableSignUp: false, sendVerificationOTP })` from `better-auth/plugins`, where `sendVerificationOTP({ email, otp, type })` calls `deps.mailer.sendSignInCode({ to: email, code: otp, expiresAt: new Date(Date.now() + CODE_TTL_SECONDS * 1000) })` for `'sign-in'` and throws the same `UNSUPPORTED_CODE_TYPE` error for any other type;
    - `jwt({ jwks: { keyPairConfig: { alg: 'EdDSA', crv: 'Ed25519' } }, jwt: { issuer: env.AUTH_ISSUER, audience: env.AUTH_AUDIENCE, expirationTime: JWT_LIFETIME, definePayload: jwtPayload }, disableSettingJwtHeader: true })`;
    - `expo()` from `@better-auth/expo`;
    - `passkey({ rpID: env.PASSKEY_RP_ID ?? 'localhost', rpName: 'Jotbun', origin })` from `@better-auth/passkey`, with `origin` = `parseList(env.PASSKEY_ORIGINS)`, or `env.AUTH_BASE_URL` when that list is empty (check the option name in the installed types).
  - `jwtPayload` returns `{ sid: session.session.id, auth_time: Math.floor(new Date(session.session.createdAt).getTime() / 1000) }`. The JWT plugin passes `definePayload` Better Auth's session object `{ session, user }` (plugins/jwt.mdx: `getSubject(session)` reads `session.user`). If the installed type has no `session`, stop and report; never fall back to user fields.
  - `handleAuthRequest`: a `POST`, `PUT` or `PATCH` with a body that is not JSON answers 415 `{ code: 'UNSUPPORTED_MEDIA_TYPE' }`; a JSON body is read with `readRawJsonBody(request, AUTH_BODY_MAX_BYTES)` (`BodyError` `too_large` answers 413 `{ code: 'PAYLOAD_TOO_LARGE' }`, `invalid` answers 400 `{ code: 'VALIDATION_FAILED' }`), and Better Auth receives a new `Request` with the same URL, method and headers and those bytes. Its answer gets `cache-control: no-store` when it has none.
  - The `created` flag (K23): `handleAuthRequest` reads `receivedAtMs = Date.now()` before anything else. When Better Auth answers a path in `SIGN_IN_ANSWER_PATHS` with 200 and a JSON object, the answer is rebuilt with the same status, the same headers less `content-length` (every `set-cookie` kept: `new Headers(answer.headers)` copies each one), and the body `{ ...body, created: createdDuring(body, receivedAtMs) }`. `createdDuring` is true only when `body.user.createdAt` is a string or number that `new Date(value).getTime()` reads and that time is at or after `receivedAtMs`: Better Auth sets `createdAt` when it inserts the user, after this request arrived, while an existing account's time is from an earlier request.
  - `instance.ts` keeps one instance per `env` object; `src/server/auth.ts`'s `handleAuth` uses it, answers through `handleAuthRequest`, and on `AuthConfigError` answers 503 `{ code: 'SERVICE_UNAVAILABLE' }` after logging `failureName(error)`.
  - `src/server.ts`: `fetch(request, ...rest)` returns `handleAuth(request)` when `isAuthPath(new URL(request.url).pathname)`, and otherwise passes `request` and the rest of its arguments to TanStack Start's `handler.fetch` unchanged.

- [ ] **Step 7: Run them and see them pass.** Run the same command. Expected: all pass. Then `npm run build:edge && grep -c '"AUTH_DB"' apps/edge/dist/server/wrangler.json` prints 1 or more.

- [ ] **Step 8: Mutation check.**
  - Remove `definePayload`: the key-set assertion fails (the user object's fields appear).
  - Remove the email-normalising hook: `an address typed with capitals and spaces…` fails.
  - Drop the type refusal from the hook: `only sign-in codes are sent…` fails for the unknown address (Better Auth answers 200 without sending, I3).
  - Delete the session index from `0001`: the index comparison fails.
  - Raise `AUTH_BODY_MAX_BYTES` to 1 MiB: the 413 case fails.
  - Flip the comparison in `createdDuring` to "before `receivedAtMs`": the created case fails.

- [ ] **Step 9: Gate, receipt, commit.** Run the edge gate. Write the receipt. Commit: `git commit -m "Run Better Auth on D1 in the HTTP Worker: its tables, email-code sign-in and ten-minute EdDSA JWTs"`.

---

### Task 2: Sign-in email delivery (D30), the local code log and the per-address cap

**Starts after:** 1C-T1. Its second provider is Resend, default pending owner Q4 (behind the switch, off until keys exist).

**Files:**
- Modify: `apps/edge/src/auth/mailer.ts`, `apps/edge/src/auth/create-auth.ts` (record each send; the per-address cap), `apps/edge/package.json` (`build`, `build:local`), `apps/edge/wrangler.jsonc` (vars `EMAIL_FROM: ""`, `EMAIL_SECONDARY: "off"`; a comment naming the secret `RESEND_API_KEY`)
- Create: `apps/edge/src/auth/email-copy.ts`, `apps/edge/src/auth/code-limit.ts`, `apps/edge/scripts/check-dist.mjs`
- Test: `apps/edge/test/workers/auth/mailer.test.ts`, `apps/edge/test/check-dist.test.ts`

**Interfaces:**
- Consumes: `Mailer`, `SignInCode`, `MailerUnavailable`, `AuthEnv`, `createAuth`, `testAuth` (Task 1).
- Produces:
  ```ts
  // src/auth/mailer.ts
  export type EmailMessage = { to: string; subject: string; text: string; html: string; idempotencyKey?: string }
  export interface EmailTransport { send(message: EmailMessage): Promise<void> }
  export function cloudflareTransport(binding: EmailBinding, from: string): EmailTransport   // binding.send({ to, from, subject, html, text })
  export function resendTransport(o: { apiKey: string; from: string; fetchImpl?: typeof fetch }): EmailTransport
  export type SecondaryMode = 'off' | 'fallback' | 'only'
  export function parseSecondaryMode(value: string | undefined): SecondaryMode               // anything else is 'off'
  export function secondaryTransportFromEnv(env: AuthEnv): EmailTransport | null            // Resend when RESEND_API_KEY and EMAIL_FROM are set, else null
  export function switchedTransport(primary: EmailTransport | null, secondary: EmailTransport | null, mode: SecondaryMode): EmailTransport
  export const LOCAL_CODE_LOG_EVENT = 'jotbun-local-sign-in-code'
  export const LOCAL_BUILD: boolean                                                           // import.meta.env.MODE !== 'production'
  export function localCodeLog(write: (line: string) => void): Mailer                        // JSON.stringify({ event: LOCAL_CODE_LOG_EVENT, to, code })
  export function transportMailer(transport: EmailTransport): Mailer                         // renders signInCodeEmail, then sends
  export function mailerFromEnv(env: AuthEnv): Mailer
  // src/auth/email-copy.ts
  export function signInCodeEmail(message: SignInCode): EmailMessage
  // src/auth/code-limit.ts
  export const CODE_SENDS_PER_ADDRESS = 5, CODE_SEND_WINDOW_MS = 15 * 60_000
  export function addressHash(secret: string, email: string): Promise<string>    // base64url HMAC-SHA256(secret, "jotbun-code-sends-v1\0" + email), WebCrypto
  export function codeSendsInWindow(db: D1Database, hash: string, nowMs: number): Promise<number>
  export function recordCodeSend(db: D1Database, hash: string, nowMs: number): Promise<void>   // also deletes rows older than one day
  ```
- `resendTransport` posts `https://api.resend.com/emails` with `Authorization: Bearer <apiKey>`, `content-type: application/json` and the body `{ from, to: [to], subject, html, text }`, plus an `Idempotency-Key` header when the message has one (Resend docs: api-reference/emails/send-email; the idempotency-keys guide). A 2xx resolves; anything else, or a thrown fetch, rejects with `MailerUnavailable`.
- `mailerFromEnv`, in order: `LOCAL_BUILD` and `JOTBUN_ENV` local or test → `localCodeLog(console.log)`; else `EMAIL` bound and `EMAIL_FROM` set → `transportMailer(switchedTransport(cloudflareTransport(env.EMAIL, env.EMAIL_FROM), secondaryTransportFromEnv(env), parseSecondaryMode(env.EMAIL_SECONDARY)))`; else a mailer that rejects with `MailerUnavailable`.
- `switchedTransport`: `off` sends through the primary only; `fallback` sends through the primary and, when that throws, once through the secondary; `only` sends through the secondary only. A transport the mode needs but does not have rejects with `MailerUnavailable`.

- [ ] **Step 1: Stub, then write the failing tests.** First the typed stubs (R52): `email-copy.ts` returns empty strings, `code-limit.ts` returns 0 and does nothing, `resendTransport` resolves without sending, `check-dist.mjs` exits 0. Then:
  `mailer.test.ts`:
  - `local and test builds write the code to the log and send nothing`: with `console.log` spied, `mailerFromEnv({ ...env, JOTBUN_ENV: 'local', EMAIL: fakeBinding }).sendSignInCode(message)` writes one line whose JSON equals `{ event: 'jotbun-local-sign-in-code', to: message.to, code: message.code }`, and `fakeBinding.send` is not called.
  - `outside local builds the code goes through the Email Service and never to the log`: with `JOTBUN_ENV: 'production'` and `EMAIL_FROM: 'Jotbun <no-reply@jotbun.test>'`, `fakeBinding.send` is called once with `to`, that `from`, the subject `รหัสเข้าสู่ระบบ Jotbun ของคุณ`, `text` and `html`, and no `console.log` line contains the code.
  - `with no email configured outside local builds, a code request is 503`: `testAuth({ mailer: mailerFromEnv({ ...env, JOTBUN_ENV: 'staging' }) }).requestCode(email)` answers 503.
  - `fallback sends through the secondary once when the primary fails`: with a primary that throws and a recording secondary, `switchedTransport(primary, secondary, 'fallback').send(m)` resolves and the secondary was called once.
  - `off never calls the secondary`: the same pair with `'off'` rejects, and the secondary was not called.
  - `only never calls the primary`: with `'only'`, the primary was not called.
  - `fallback with no secondary rejects with MailerUnavailable`.
  - `an unknown switch value reads as off`: `parseSecondaryMode('sometimes')` is `'off'`.
  - `Resend is off until its key exists` (default pending owner Q4): `secondaryTransportFromEnv({ ...env, RESEND_API_KEY: undefined })` is null; with a key and `EMAIL_FROM` it is a transport.
  - `the Resend transport posts the documented request`: with a recording `fetchImpl`, one call to `https://api.resend.com/emails`, method `POST`, `authorization: Bearer test-key`, and a JSON body equal to `{ from, to: [to], subject, html, text }`; with `idempotencyKey: 'k'` the request carries `idempotency-key: k`; a 500 answer rejects with `MailerUnavailable`.
  - `the code email is Thai first, then English, with the code and the Bangkok expiry`: `signInCodeEmail({ to, code: '482913', expiresAt: new Date('2026-10-25T13:52:00Z') })` has the subject `รหัสเข้าสู่ระบบ Jotbun ของคุณ`; `text` contains `482913`, `ใช้ได้ 10 นาที` and `20:52`; the Thai block comes before the English one; `text` contains no `<`.
  - `one address gets at most five codes in fifteen minutes, from any network` (Review Focus 2): five `requestCode(email)` calls from five random networks answer 200; the sixth answers 429 `{ code: 'CODE_LIMIT' }`; another address answers 200; after `vi.setSystemTime(Date.now() + 15 * 60_000 + 1)` the first address answers 200 again; `SELECT count(*) AS n FROM email_code_sends WHERE address_hash = ?` with the raw address is 0.

  `check-dist.test.ts` (Node): a temporary directory with one `.js` file holding `jotbun-local-sign-in-code` makes `node scripts/check-dist.mjs <dir>` exit 1; without the marker it exits 0; a missing directory exits 1.

- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/auth/mailer.test.ts` and `npm run test:edge -- test/check-dist.test.ts`. Expected: failures on assertions. Record the counts.

- [ ] **Step 3: Implement.**
  - `email-copy.ts`: the Thai lines are board `ox-email-code`'s, verbatim: the subject "รหัสเข้าสู่ระบบ Jotbun ของคุณ"; "รหัสเข้าสู่ระบบของคุณ"; "ใส่รหัสนี้ในแอป Jotbun เพื่อเข้าสู่ระบบด้วยอีเมล"; the code; "ใช้ได้ 10 นาที ถึง {time} น."; "ถ้าคุณไม่ได้ขอรหัสนี้ ไม่ต้องทำอะไร บัญชีของคุณยังปลอดภัย"; "อย่าบอกรหัสนี้กับใคร Jotbun จะไม่ขอรหัสทางโทรศัพท์ แชท หรืออีเมล"; and the footer "คุณได้รับอีเมลนี้เพราะมีการขอเข้าสู่ระบบ Jotbun ด้วยอีเมลนี้ · Jotbun สมุดจดรายจ่ายที่เป็นส่วนตัว". The English block is marked `// DRAFT`. `{time}` comes from `Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })`. `html` holds the same text in plain paragraphs.
  - `createAuth`: in `sendVerificationOTP`, a `MailerUnavailable` becomes `new APIError('SERVICE_UNAVAILABLE', { code: 'EMAIL_UNAVAILABLE', message: 'EMAIL_UNAVAILABLE' })`, and a successful send calls `recordCodeSend(env.AUTH_DB, await addressHash(env.BETTER_AUTH_SECRET!, email), Date.now())`. In `hooks.before`, after the email is normalised on `/email-otp/send-verification-otp`, it throws `new APIError('TOO_MANY_REQUESTS', { code: 'CODE_LIMIT', message: 'CODE_LIMIT' })` when `codeSendsInWindow(...)` is `CODE_SENDS_PER_ADDRESS` or more. The local log is recorded too, so the cap holds in local builds.
  - `scripts/check-dist.mjs [dir]`: the default directory is `fileURLToPath(new URL('../dist/', import.meta.url))`, so it works from any working directory (M5). It exits 1 if the directory is missing or any `.js` or `.mjs` file under it contains `jotbun-local-sign-in-code`; otherwise it prints `local code log absent from <n> files` and exits 0.
  - `package.json`: `"build": "vite build && node scripts/check-dist.mjs"` and `"build:local": "vite build --mode local"`.

- [ ] **Step 4: Run them and see them pass.** Then `npm run build:edge` must print `local code log absent from …`. If the marker survives because the bundler kept the dead branch, set `build.minify: true` for the Worker's Vite environment in `vite.config.ts` and say so in the receipt.

- [ ] **Step 5: Mutation check.**
  - Make `LOCAL_BUILD` always true: `npm run build:edge` fails on the marker.
  - Let `fallback` skip the secondary: its case fails.
  - Key the cap by network instead of address: the five-codes case fails.
  - Drop the `Idempotency-Key` header: the Resend case fails.

- [ ] **Step 6: Gate, receipt, commit.** Commit: `git commit -m "Send sign-in codes through Cloudflare Email Service with Resend behind a switch, log them only in local builds, and cap codes per address"`.

---

### Task 3: Apple and Google by native ID token, and the linking rules (C14)

**Starts after:** 1C-T1 (merge after 1C-T2, M19).

**Files:**
- Create: `apps/edge/src/auth/social.ts`, `apps/edge/test/workers/auth/support/id-tokens.ts`
- Modify: `apps/edge/src/auth/create-auth.ts` (social providers, account linking, the link hook), `apps/edge/src/auth/handler.ts` (the `ACCOUNT_EXISTS` answer), `apps/edge/wrangler.jsonc` (vars `APPLE_BUNDLE_ID: ""`, `GOOGLE_CLIENT_IDS: ""`; a comment naming the secrets `APPLE_CLIENT_SECRET` and `GOOGLE_CLIENT_SECRET`), `apps/edge/vitest.workers.config.ts` (test vars `APPLE_BUNDLE_ID: 'app.jotbun.test'`, `GOOGLE_CLIENT_IDS: 'web.apps.googleusercontent.test,ios.apps.googleusercontent.test'`)
- Test: `apps/edge/test/workers/auth/social.test.ts`

**Interfaces:**
- Consumes: `createAuth`, `AuthDeps`, `testAuth`, `SignedIn`, `parseList` (Task 1).
- Produces:
  ```ts
  // src/auth/social.ts
  export type SocialProvider = 'apple' | 'google'
  export type SignInMethod = 'apple' | 'google' | 'email'
  export type ProviderUser = { id: string; email: string; emailVerified: boolean; name: string }
  export type ProviderHooks = {
    verifyIdToken(provider: SocialProvider, token: string, nonce?: string): Promise<boolean>
    getUserInfo(provider: SocialProvider, token: { idToken?: string }): Promise<{ user: ProviderUser; data: Record<string, unknown> }>
  }
  export function socialProvidersFromEnv(env: AuthEnv, hooks?: ProviderHooks): Record<string, unknown>
  export const ACCOUNT_EXISTS = 'ACCOUNT_EXISTS'
  export function methodsForEmail(db: D1Database, email: string): Promise<SignInMethod[]>   // 'apple' then 'google' when linked, then always 'email'
  // test/workers/auth/support/id-tokens.ts
  export function fakeIdToken(o: { provider: SocialProvider; sub: string; email: string; emailVerified?: boolean }): string
  export const TEST_PROVIDER_HOOKS: ProviderHooks   // accepts a fakeIdToken only for its own provider
  export function signInSocial(t: TestAuth, provider: SocialProvider, token: string, o?: { requestSignUp?: boolean }): Promise<{ res: Response; signedIn?: SignedIn }>
  ```
- `socialProvidersFromEnv`:
  - `apple`, only when `APPLE_BUNDLE_ID` is set: `{ clientId: env.APPLE_BUNDLE_ID, appBundleIdentifier: env.APPLE_BUNDLE_ID, clientSecret: env.APPLE_CLIENT_SECRET ?? '', disableImplicitSignUp: true }`. A native iOS ID token needs the bundle id as the client id (authentication/apple.mdx). Better Auth accepts Apple's nonce raw or as its SHA-256 (M13).
  - `google`, only when `GOOGLE_CLIENT_IDS` is set: `{ clientId: parseList(env.GOOGLE_CLIENT_IDS), clientSecret: env.GOOGLE_CLIENT_SECRET ?? '', disableImplicitSignUp: true }`. An array accepts tokens issued to the web and iOS clients (concepts/oauth.mdx "clientId").
  - `hooks` become each provider's `verifyIdToken` and `getUserInfo` (concepts/oauth.mdx) only when `env.JOTBUN_ENV === 'test'`.
- `createAuth`: `socialProviders: socialProvidersFromEnv(env, deps.providerHooks)`; `account: { accountLinking: { enabled: true, disableImplicitLinking: true, trustedProviders: [], allowDifferentEmails: true } }` (concepts/users-accounts.mdx; `allowDifferentEmails` lets a person link an Apple ID that uses a relay address, explicitly). `/unlink-account` stays enabled with Better Auth's own guards: a fresh session (`freshAge` 300) and the refusal to unlink the last remaining account (`allowUnlinkingAll` unset) (K22, R43).
- The link hook (R43): in `hooks.before`, for `/link-social`, `const found = await getSessionFromCtx(ctx)` (`better-auth/api`, concepts/plugins.mdx); when there is a session older than 300 seconds (`Math.floor(Date.now() / 1000) - Math.floor(new Date(found.session.createdAt).getTime() / 1000) > 300`), throw `new APIError('FORBIDDEN', { code: 'REAUTH_REQUIRED', message: 'REAUTH_REQUIRED' })`. Without a session, Better Auth's own 401 stands.
- `handleAuthRequest` (K19, R54, M13): an answer to `POST /api/auth/sign-in/social` with status 401 and JSON `code` `OAUTH_LINK_ERROR` becomes `403 { code: 'ACCOUNT_EXISTS', methods }`. `methods` comes from the request's `idToken.token`, read from the bytes the body cap kept: its payload is decoded without a signature check (Better Auth verified this token in this request before refusing it). When the payload's `email_verified` is `true` or `'true'`, `methods = await methodsForEmail(env.AUTH_DB, payload.email)` (`SELECT DISTINCT a.providerId FROM account a JOIN "user" u ON u.id = a.userId WHERE lower(u.email) = lower(?)`); otherwise `['email']`. Nothing else is rewritten.

- [ ] **Step 1: Stub, then write the failing tests** in `social.test.ts`, with `testAuth({ providerHooks: TEST_PROVIDER_HOOKS })`. First the typed stubs (R52): `socialProvidersFromEnv` returns `{}`, `methodsForEmail` returns `[]`. Then:
  - `a new Apple ID signs up when asked, with a UUID user`: with `requestSignUp: true` the answer is 200 with a session, a UUID `userId` and `created` true (K23).
  - `the same Apple ID then signs into that user`: the same token without `requestSignUp` signs into the same `userId`, and `created` is false.
  - `without requestSignUp an unknown Google account creates nothing` (Review Focus 4): the answer is the status Better Auth gives (Better Auth's) and `SELECT count(*) AS n FROM "user" WHERE email = ?` is 0.
  - `a Google sign-in whose email belongs to an email-code account is refused, naming the email code`: after `signInByEmail(email)`, a verified Google token for the same email with `requestSignUp: true` answers 403 `{ code: 'ACCOUNT_EXISTS', methods: ['email'] }`, and the user's `account` rows are unchanged (C14).
  - `a Google sign-in whose verified email belongs to an Apple account names Apple`: after an Apple sign-up for `email`, a verified Google token for it answers 403 `{ code: 'ACCOUNT_EXISTS', methods: ['apple', 'email'] }` (R54).
  - `an unverified provider email reveals no linked method`: the same refusal with `emailVerified: false` answers 403 `{ code: 'ACCOUNT_EXISTS', methods: ['email'] }`.
  - `an email code to an Apple account's address signs into that account` (C14): an Apple sign-up for `email`, then `signInByEmail(email)`, give one `userId`.
  - `a fresh session links Google, and that Google account then signs into the same user`: `POST /api/auth/link-social` with `{ provider: 'google', idToken: { token } }` from a session under 300 seconds old answers 200; a Google sign-in with that token returns the same `userId`.
  - `linking from a session older than five minutes is 403 and adds no account row` (R43): after `vi.setSystemTime(Date.now() + 301_000)`, the same call answers 403 `{ code: 'REAUTH_REQUIRED' }` and the user's `account` row count is unchanged.
  - `linking a Google account that belongs to another person is refused, and neither account changes`: Better Auth's status, and both users' `account` rows are unchanged.
  - `a fresh session unlinks Google when Apple remains`: with Apple and Google linked, `POST /api/auth/unlink-account` with `{ providerId: 'google' }` answers 200 and the Google row is gone (R43).
  - `unlinking from a session older than five minutes is refused`: Better Auth's fresh-session status, and the row stays.
  - `the last remaining linked account cannot be unlinked`: with only Apple linked, Better Auth's refusal, and the row stays.
  - `the provider hooks are honoured only in tests`: `socialProvidersFromEnv({ ...env, JOTBUN_ENV: 'production' }, TEST_PROVIDER_HOOKS)` gives an `apple` entry without `verifyIdToken`.
  - `with no Apple or Google client ids, those providers are absent`: `socialProvidersFromEnv({ ...env, APPLE_BUNDLE_ID: '', GOOGLE_CLIENT_IDS: '' })` is `{}`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/auth/social.test.ts`. Record the counts.
- [ ] **Step 3: Implement** `social.ts`, the `createAuth` options and hook, and the `handleAuthRequest` rewrite as above.
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.**
  - Set `disableImplicitLinking: false`: the email-code `ACCOUNT_EXISTS` case fails (the Google account links silently).
  - Drop `disableImplicitSignUp` from Google: `…creates nothing` fails.
  - Remove the link hook: the five-minutes linking case fails.
  - Skip the `email_verified` check: the unverified case fails.
- [ ] **Step 6: Gate, receipt, commit.** Commit: `git commit -m "Sign in with Apple and Google by native ID token, refuse silent linking with the methods to use, and link only from a fresh sign-in"`.

---

### Task 4: Sessions are devices, sign-out everywhere, and account status at sign-in

**Starts after:** 1C-T1 (merge after 1C-T3, M19).

**Files:**
- Create: `apps/edge/src/auth/account-plugin.ts`, `apps/edge/src/auth/account-status.ts`, `apps/edge/src/auth/erasure.ts`, `apps/edge/src/auth/vault-control.ts`
- Modify: `apps/edge/src/auth/create-auth.ts` (the plugin, `disabledPaths`, `databaseHooks`, the `ERASURE_DB` and `ERASURE_KEY` checks), `apps/edge/src/auth/instance.ts` (`deps.vault = unwiredVaultControl`)
- Test: `apps/edge/test/workers/auth/devices.test.ts`, `apps/edge/test/workers/auth/account-status.test.ts`

**Interfaces:**
- Consumes: `createAuth`, `AuthDeps`, `testAuth`, `JWT_LIFETIME_SECONDS` (Task 1); `isUuid` (contracts).
- Produces:
  ```ts
  // src/auth/vault-control.ts
  export type VaultSessionControl = {
    /** The vault refuses these sessions' tokens (it keeps each for REVOCATION_KEEP_SECONDS from its own clock). */
    revokeSessions(userId: string, sessionIds: readonly string[]): Promise<void>
    /** The vault refuses every token issued before `notBefore` (epoch seconds) and revokes these sessions, in one transaction (R44). */
    signOutEverywhere(userId: string, sessionIds: readonly string[], notBefore: number): Promise<void>
  }
  export class VaultNotWired extends Error {}
  export const unwiredVaultControl: VaultSessionControl   // both methods reject with VaultNotWired; Task 10a wires the real one
  // src/auth/account-status.ts
  export type AccountStatus = 'active' | 'deleting' | 'deleted'
  export function readAccountStatus(db: D1Database, userId: string): Promise<AccountStatus>   // no row → 'active'
  // src/auth/erasure.ts
  export function subjectHash(key: string, userId: string): Promise<string>   // base64url HMAC-SHA256(key, "jotbun-erasure-v1\0" + userId), WebCrypto
  export function isErased(db: D1Database, key: string, userId: string, nowMs: number): Promise<boolean>   // a registry row with expires_at > nowMs
  // src/auth/account-plugin.ts
  export type DeviceDto = { id: string; current: boolean; signed_in_at: string; last_active_at: string; user_agent: string | null }
  export function jotbunAccount(deps: { db: D1Database; vault: VaultSessionControl; now?: () => number }): BetterAuthPlugin   // id 'jotbun-account'; `satisfies BetterAuthPlugin`
  ```
- Endpoints, each `createAuthEndpoint(path, { method, use: [sessionMiddleware] }, handler)` from `better-auth/api`:
  - `GET /jotbun/devices` → 200 `{ devices: DeviceDto[] }`: `SELECT id, createdAt, updatedAt, userAgent FROM session WHERE userId = ?1 AND expiresAt > ?2 ORDER BY updatedAt DESC`, with `?2` the ISO time now (M7); `current` marks the caller's session.
  - `POST /jotbun/devices/sign-out` with `{ id }` → 204; 400 `{ code: 'USE_SIGN_OUT' }` for the caller's own session; 404 `{ code: 'NOT_FOUND' }` when `id` is not a UUID (`isUuid`) or no live session of this user has it.
  - `POST /jotbun/devices/sign-out-others` → 200 `{ signed_out: number }`.
  - `POST /jotbun/sign-out-everywhere` → 204; 403 `{ code: 'REAUTH_REQUIRED' }` when the caller's session is older than 300 seconds.
  - Each handler works out the target ids, calls the vault (`revokeSessions(userId, ids)`, or for sign-out everywhere `signOutEverywhere(userId, every session id of the user, Math.ceil(nowMs / 1000))`), and deletes the D1 rows only after that resolves, with `DELETE FROM session WHERE userId = ?1 AND id IN (SELECT value FROM json_each(?2))` (R57; sign-out everywhere deletes every session of the user). A vault failure answers 503 `{ code: 'SERVICE_UNAVAILABLE' }` and deletes nothing. With `cookieCache` off a deleted session is gone at once.
- `createAuth` from here on also throws `AuthConfigError` unless `ERASURE_DB` is bound and `ERASURE_KEY` has at least 32 characters. It adds `jotbunAccount({ db: env.AUTH_DB, vault: deps.vault ?? unwiredVaultControl })`, adds `/list-sessions`, `/revoke-session`, `/revoke-sessions` and `/revoke-other-sessions` to `disabledPaths`, and adds `databaseHooks.session.create.before(session)` (concepts/database.mdx "Database Hooks"), which throws `new APIError('FORBIDDEN', { code: 'ACCOUNT_UNAVAILABLE', message: 'ACCOUNT_UNAVAILABLE' })` when `readAccountStatus(env.AUTH_DB, session.userId)` is not `'active'` or `isErased(env.ERASURE_DB, env.ERASURE_KEY, session.userId, Date.now())` is true (K21: a restored `AUTH_DB` cannot sign a deleted account in).

- [ ] **Step 1: Stub, then write the failing tests**, with a `recordingVault()` fake that records each call and can be told to throw. First the typed stubs (R52): the plugin's handlers answer 501, `readAccountStatus` resolves `'active'`, `isErased` resolves false.
  `devices.test.ts`:
  - `Account lists this person's devices and marks this one`: two email sign-ins for one address and one for another; `GET /api/auth/jotbun/devices` with the second cookie lists exactly the first address's two session ids, with `current` true only for the second.
  - `the device list never carries a session token`: `JSON.stringify(body)` contains neither session token (each cookie value up to its first `.`).
  - `signing out another device tells the vault first, then removes it`: the fake vault, when called, asserts the target session row still exists; it records `['revokeSessions', userId, [first.sessionId]]`; afterwards `GET /api/auth/token` with the first cookie answers 401.
  - `this device cannot sign itself out here`: its own id → 400 `USE_SIGN_OUT`, and the vault was not called.
  - `another person's device is not found`: the other address's session id → 404 `NOT_FOUND`.
  - `signing out the other devices leaves this one working`: three sessions; `sign-out-others` from the third answers `{ signed_out: 2 }`; the third cookie still gets a token; the vault got both ids in one call.
  - `sign out everywhere needs a sign-in from the last five minutes`: after `vi.setSystemTime(Date.now() + 301_000)` the answer is 403 `REAUTH_REQUIRED`, the vault was not called, and every session still works.
  - `sign out everywhere revokes every session and raises not_before in one vault call`: the vault records `['signOutEverywhere', userId, <every session id, sorted>, Math.ceil(t / 1000)]` for the call time `t`; every cookie then gets 401 from `/token` (R44).
  - `when the vault cannot be reached, nothing is signed out`: the fake throws; the answer is 503 and both sessions still work.
  - `Better Auth's own session routes are off`: `GET /api/auth/list-sessions` with a cookie answers 404.
  `account-status.test.ts`:
  - `a person whose account is being deleted cannot sign in`: after a sign-up and `INSERT INTO account_status (user_id, status, updated_at) VALUES (?, 'deleting', ?)`, a new email-code sign-in answers 403 `{ code: 'ACCOUNT_UNAVAILABLE' }`, and the user's session count is unchanged.
  - `an account marked deleted cannot sign in`: `'deleted'` → 403 `ACCOUNT_UNAVAILABLE`.
  - `an active account, or one with no status row, signs in`: 200 for both.
  - `an erased account cannot sign in even if its sign-in rows come back`: with `erasure_registry` in `ERASURE_DB` holding `subjectHash(ERASURE_KEY, userId)` and a future `expires_at`, an email-code sign-in for that user answers 403 `ACCOUNT_UNAVAILABLE` (K21).
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/auth/devices.test.ts test/workers/auth/account-status.test.ts`. Record the counts.
- [ ] **Step 3: Implement** the plugin, the status and erasure readers, the vault seam and the `createAuth` additions as above. If an `APIError` thrown in the session hook does not reach the answer as 403, return `false` from the hook and map that refusal to 403 `ACCOUNT_UNAVAILABLE` in `handleAuthRequest`; say which in the receipt.
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.**
  - Delete the D1 rows before calling the vault: the "vault first" case fails.
  - Skip the freshness check: the five-minutes case fails.
  - Pass only the caller's session id to `signOutEverywhere`: the one-vault-call case fails.
  - Skip `isErased` in the session hook: the erased case fails.
- [ ] **Step 6: Gate, receipt, commit.** Commit: `git commit -m "Treat sessions as devices: sign them out through the vault first, sign out everywhere after a fresh sign-in, and refuse sign-in to deleted or erased accounts"`.

---

### Task 5: The app's Better Auth port, replacing Auth0 (tested against a fake server)

**Starts after:** base. `expo-network` stays out, default pending owner Q2 (the client treats it as optional).

**Files:**
- Modify: `apps/app/package.json` (dependencies, exact: `better-auth` 1.6.33, `@better-auth/expo` 1.6.33), root `package-lock.json` (by npm)
- Delete: `apps/app/src/auth/auth0Client.ts`, `auth0Client.web.ts`, `auth0Port.ts`, `authApi.ts`, `testing/fakeDevice.ts`
- Create: `apps/app/src/auth/betterAuthPort.ts`, `betterAuthClient.ts`, `betterAuthClient.web.ts`, `jotbunAccountClient.ts`, `nativeSignIn.ts`, `appAuth.ts`, `testing/fakeAuthServer.ts`
- Modify: `apps/app/src/auth/credentialProvider.ts` (rewritten on the port), `sessionStore.ts`, `session.ts` (comments only), `apps/app/src/auth/reauthentication.ts` (keeps only `export type Proof = { proofId: string; commandId: string; expiresAt: string }` until Task 6 deletes it), `apps/app/src/api/client.ts` (no `X-GoGoSpend-Session` header), `apps/app/src/config/env.ts` and `apps/app/.env.example` (the auth URL; the Auth0 settings go), `apps/app/src/screens/redesign/account/SignInScreen.tsx` (code only: `signInThroughSession` passes the method), `apps/app/src/spend/v1/redesign/account/onboardingModel.ts` (type only: `SignInAttempt` becomes `SignInOutcome | 'reauth_required'`; `afterSignInAttempt`'s default keeps each new outcome on screen as today's calm failure until Task 9), `apps/app/app/_layout.tsx` (calls `installAppAuth()` once)
- Test: `apps/app/src/auth/betterAuthPort.test.ts`, `apps/app/src/auth/credentialProvider.test.ts` (new; the provider cases move here), `apps/app/src/auth/sessionMachine.test.ts` (keeps its reducer tests only), `apps/app/src/api/sessionEpoch.test.ts` (ported off `fakeDevice`, `createAuthApi` and `AuthUnavailable` onto `fakeAuthServer`, M8), `apps/app/src/api/client.test.ts` (header expectations)

**Interfaces:**
- Consumes: today's `sessionMachine.ts` (unchanged: states, events, epoch rules), `session.ts` (`installCredentialProvider`, `v1SessionCredentials`), the v1 transport, `SecureStorePort`.
- Produces:
  ```ts
  // src/auth/nativeSignIn.ts
  export type NativeIdToken = { token: string; nonce?: string; accessToken?: string; authorizationCode?: string }   // authorizationCode: Apple only (Task 13)
  export type NativeSignIn = { apple: (() => Promise<NativeIdToken>) | null; google: (() => Promise<NativeIdToken>) | null }
  export const NO_NATIVE_SIGN_IN: NativeSignIn = { apple: null, google: null }   // until Task 7
  export function idTokenSubject(token: string): string | null   // the unverified `sub`, only for the fresh-sign-in pre-check
  // src/auth/betterAuthPort.ts
  export type SignInMethod = 'apple' | 'google' | 'email'
  export type SignInRequest = { method: 'apple' | 'google'; signUp: boolean } | { method: 'email'; email: string; code: string }
  /** created: this sign-in created the account (the server's `created`, K23). 1D-T14 reads it inside `signIn` to send `signed_up` rather than `signed_in`. */
  export type ServerSession = { accountId: string; sessionId: string; email: string; method: SignInMethod; created: boolean }
  export type DeviceDto = { id: string; current: boolean; signed_in_at: string; last_active_at: string; user_agent: string | null }
  export class AuthCancelled extends Error {}     // name 'AuthCancelled'
  export class AuthUnavailable extends Error {}   // name 'AuthUnavailable'
  export type RefusalCode = 'ACCOUNT_EXISTS' | 'ACCOUNT_UNAVAILABLE' | 'WRONG_CODE' | 'CODE_LIMIT' | 'RATE_LIMITED' | 'OTHER_ACCOUNT' | 'REAUTH_REQUIRED' | 'SIGNED_OUT' | 'REFUSED'
  /** Fields declared and assigned in the constructor, never TypeScript parameter properties: app unit tests run on Node's type stripping (R53). */
  export class AuthRefused extends Error {
    readonly code: RefusalCode
    readonly methods: readonly SignInMethod[]   // ACCOUNT_EXISTS only: the methods the server named (R54)
    constructor(code: RefusalCode, methods?: readonly SignInMethod[])   // name 'AuthRefused'; methods default []
  }
  export type ClientResult<T> = { data: T | null; error: { status: number; code?: string; message?: string; methods?: SignInMethod[] } | null }
  export type SignInAnswer = { created: boolean }
  export function createdOf(answer: unknown): boolean   // true only for an object whose `created` is exactly true; no casts
  /** The Better Auth client calls the port needs; betterAuthClient.ts maps each onto the real client without casts. */
  export type BetterAuthClientLike = {
    sendSignInCode(email: string): Promise<ClientResult<unknown>>                                  // emailOtp.sendVerificationOtp({ email, type: 'sign-in' })
    signInWithCode(email: string, code: string): Promise<ClientResult<SignInAnswer>>               // signIn.emailOtp({ email, otp: code })
    signInWithIdToken(provider: 'apple' | 'google', idToken: NativeIdToken, requestSignUp: boolean): Promise<ClientResult<SignInAnswer>>   // signIn.social(...)
    session(): Promise<ClientResult<{ user: { id: string; email: string }; session: { id: string } } | null>>   // getSession()
    token(): Promise<ClientResult<{ token: string }>>                                              // token(), jwtClient
    linkedAccounts(): Promise<ClientResult<{ providerId: string; accountId: string }[]>>           // listAccounts()
    link(provider: 'apple' | 'google', idToken: NativeIdToken): Promise<ClientResult<unknown>>     // linkSocial({ provider, idToken })
    unlink(provider: 'apple' | 'google'): Promise<ClientResult<unknown>>                           // unlinkAccount({ providerId })
    signOut(): Promise<ClientResult<unknown>>
    devices(): Promise<ClientResult<{ devices: DeviceDto[] }>>                                     // GET /jotbun/devices
    signOutDevice(id: string): Promise<ClientResult<unknown>>                                      // POST /jotbun/devices/sign-out
    signOutOtherDevices(): Promise<ClientResult<{ signed_out: number }>>                           // POST /jotbun/devices/sign-out-others
    signOutEverywhere(): Promise<ClientResult<unknown>>                                            // POST /jotbun/sign-out-everywhere
    hasStoredSession(): boolean                                                                     // getCookie() is non-empty
  }
  export interface BetterAuthPort {
    readonly supported: boolean
    readonly methods: readonly SignInMethod[]   // 'email' when supported; 'apple' and 'google' only when their native sign-in exists
    sendEmailCode(email: string): Promise<void>
    signIn(request: SignInRequest): Promise<ServerSession>
    /** The signed-in account's own method again; never creates, switches or signs into another account. */
    freshSignIn(request: SignInRequest, current: { accountId: string; email: string }): Promise<ServerSession>
    accessToken(): Promise<string | null>   // null: no session, or the server refused it
    refresh(): Promise<boolean>
    hasSession(): Promise<boolean>          // local only: a stored cookie
    signOut(): Promise<void>
    devices(): Promise<DeviceDto[]>
    signOutDevice(id: string): Promise<void>
    signOutOtherDevices(): Promise<number>
    signOutEverywhere(): Promise<void>
    /** Each needs a sign-in from the last five minutes: the screen runs the fresh sign-in first (R43). */
    linkMethod(method: 'apple' | 'google'): Promise<void>
    unlinkMethod(method: 'apple' | 'google'): Promise<void>
    linkedMethods(): Promise<SignInMethod[]>   // 'apple' and 'google' when linkedAccounts() has them, then always 'email'
  }
  export function createBetterAuthPort(deps: { client: BetterAuthClientLike; native: NativeSignIn; now?: () => number }): BetterAuthPort
  export function unsupportedBetterAuthPort(message: string): BetterAuthPort   // supported false, methods [], reads null or false, actions reject
  // src/auth/betterAuthClient.ts (iOS, Android) and betterAuthClient.web.ts (unsupportedBetterAuthPort)
  export function createAppAuthPort(): BetterAuthPort
  // src/auth/sessionStore.ts
  export type StoredSession = { accountId: string; sessionId: string; email: string; method: SignInMethod }
  export interface SessionRecordStore { load(): Promise<StoredSession | null>; save(value: StoredSession): Promise<void>; clear(): Promise<void> }
  export function createSecureSessionStore(secure: SecureStorePort, thisDeviceOnly: number): SessionRecordStore
  // createSecureEpochStore is unchanged
  // src/auth/credentialProvider.ts
  export type SignInOutcome = 'active' | 'cancelled' | 'failed' | 'unavailable' | 'not_configured' | 'account_exists' | 'account_unavailable' | 'wrong_code' | 'rate_limited'
  export type SignInResult = { outcome: SignInOutcome; methods: readonly SignInMethod[]; created: boolean }   // methods only with account_exists; created only with active (K23)
  export type FreshOutcome = 'fresh' | 'cancelled' | 'failed' | 'unavailable' | 'not_configured' | 'other_account' | 'wrong_code' | 'rate_limited'
  export type CodeOutcome = 'sent' | 'rate_limited' | 'unavailable' | 'failed' | 'not_configured'
  export type RequestCredentials = { accessToken: string; sessionId: string }
  export interface CredentialProvider {
    getAccessToken(): Promise<string | null>
    refreshAfterUnauthorized(): Promise<boolean>
    sessionEnded(event: SessionEnded): void
    getSessionSnapshot(): SessionSnapshot
    subscribe(listener: () => void): () => void
    hydrate(): Promise<void>
    sendEmailCode(email: string): Promise<CodeOutcome>
    signIn(request: SignInRequest): Promise<SignInResult>
    freshSignIn(request: SignInRequest): Promise<FreshOutcome>
    account(): StoredSession | null
    methods(): readonly SignInMethod[]
    port(): BetterAuthPort
    /** One token and the session id, read together for a request that must resend with the same credentials; null unless active. */
    requestCredentials(): Promise<RequestCredentials | null>
    /** Why the session ended, while it is 'locked' or 'reauth_required'; null otherwise. */
    endedReason(): 'signed_out_elsewhere' | 'account_unavailable' | null
    signOut(): Promise<void>
  }
  export type CredentialDeps = { port: BetterAuthPort; sessions: SessionRecordStore; epochs?: EpochStore; logoutVault?: (credentials: RequestCredentials) => Promise<void> }
  export function createCredentialProvider(deps: CredentialDeps): CredentialProvider
  // src/auth/appAuth.ts
  export function installAppAuth(): CredentialProvider   // once: createAppAuthPort(), the secure stores, logoutVault over the shared transport; installs it and starts hydrate()
  // src/auth/testing/fakeAuthServer.ts
  export function createFakeAuthServer(): FakeAuthServer
  export type FakeAuthServer = {
    client: BetterAuthClientLike
    native(identities: { apple?: { sub: string; email: string }; google?: { sub: string; email: string } }): NativeSignIn
    state: { offline: boolean; fail5xx: boolean; codeLimit: boolean; cancelNative: boolean; tokenTtlSeconds: number; existsWith: SignInMethod[] | null }
    codeFor(email: string): string
    deleteSession(sessionId: string): void
    calls: string[]                    // e.g. 'token', 'signInWithCode:kan@example.test', 'signOutDevice:<id>'
  }
  // a sign-in answers created: true the first time an address or subject signs in, false after (K23)
  ```
- Port rules (`createBetterAuthPort`):
  - A client call that throws, or answers status 0 or 500 and above, is `AuthUnavailable`. Status 429 is `AuthRefused('CODE_LIMIT')` when the error code is `CODE_LIMIT`, otherwise `AuthRefused('RATE_LIMITED')`.
  - `signInWithCode`: 403 `ACCOUNT_UNAVAILABLE` → that refusal; any other 4xx → `WRONG_CODE` (a wrong, expired or used-up code reads the same to the person).
  - `signInWithIdToken`: 403 `ACCOUNT_EXISTS` → `AuthRefused('ACCOUNT_EXISTS', error.methods ?? ['email'])`; 403 `ACCOUNT_UNAVAILABLE` → that refusal; any other 4xx → `REFUSED`. A method whose native sign-in is null → `AuthRefused('REFUSED')` without calling anything.
  - After any successful sign-in call, `session()` gives the `ServerSession` (`accountId` = `user.id`, `sessionId` = `session.id`), and `created` is the sign-in answer's `created` (K23).
  - `freshSignIn(request, current)`: an email request whose address (trimmed, lower-case) is not `current.email` → `AuthRefused('OTHER_ACCOUNT')`, nothing sent. Apple or Google: get the native token, then `linkedAccounts()`; unless an entry with that `providerId` has `accountId === idTokenSubject(token.token)`, → `AuthRefused('OTHER_ACCOUNT')` and the sign-in is never called. Then `signInWithIdToken(method, token, false)`. If the new session's `user.id` still differs from `current.accountId`, `signOut()` and `AuthRefused('OTHER_ACCOUNT')`.
  - `accessToken()` reuses the cached JWT while its unverified `exp` is more than 60 seconds away, otherwise calls `token()`; 401 or 403 → `null`; unreachable → `AuthUnavailable`. `refresh()` always calls `token()`: a token → `true`, 401 or 403 → `false`.
  - `linkMethod` and `unlinkMethod` (native token first for linking), the device calls and `signOutEverywhere` map 403 `REAUTH_REQUIRED` → `AuthRefused('REAUTH_REQUIRED')`, 401 → `AuthRefused('SIGNED_OUT')`, any other 4xx → `AuthRefused('REFUSED')`. `signOut()` ignores the server's answer and clears the cached JWT.
- Provider rules (`createCredentialProvider`), keeping today's serialisation, superseding and epoch rules (every new session moves the epoch, K13):
  - `hydrate`: no record → `hydrate_empty`; a record and `port.hasSession()` → `hydrated(accountId, sessionId)`; a record without a cookie → `locked`.
  - `signIn(request)`: `port.signIn` first; superseded by a sign-out → `port.signOut()` and `cancelled`; then `sessions.save(record)`; then `bootstrapped({ accountId, binding: sessionId })`, and the result is `{ outcome: 'active', methods: [], created: session.created }`. Every other outcome has `created: false`. If the save fails, `port.signOut()`, clear the record and end `signed_out` with `failed`. Errors map to outcomes: `AuthCancelled` → `cancelled`, `AuthUnavailable` → `unavailable`, refusals → `account_exists` (with the refusal's `methods`), `account_unavailable`, `wrong_code`, `rate_limited` (for `RATE_LIMITED` and `CODE_LIMIT`), anything else → `failed`. With `port.supported` false, or a method not in `port.methods`, → `not_configured` without calling the port.
  - `freshSignIn(request)`: only from `active`. `port.freshSignIn(request, account)`, then `port.signOutDevice(oldSessionId)` (best effort), save the new record, `bootstrapped`. `OTHER_ACCOUNT` → `other_account`, nothing stored or changed.
  - `signOut()`: read the token with `port.accessToken()`; when there is one, `logoutVault({ accessToken, sessionId })` (POST `/v1/me/logout` with the request's own credentials, best effort); then `port.signOut()`; then clear the record. A sign-out still wins over a running sign-in.
  - `sessionEnded`: `SESSION_REQUIRED` and `REAUTH_REQUIRED` dispatch `reauth_required` with `endedReason` `signed_out_elsewhere`, as today. `ACCOUNT_UNAVAILABLE` now also dispatches `reauth_required`, keeping the account and its record, with `endedReason` `account_unavailable`, so the session-ended screen can count and offer to erase that account's unsent records (D37; today it signed out here). A refusal that locks (`auth_denied`) reads as `signed_out_elsewhere`. `endedReason` clears on `bootstrapped` and on `signed_out`. Stale reports change nothing, as today.
  - `getAccessToken` and `refreshAfterUnauthorized` behave exactly as today, over `port.accessToken()` and `port.refresh()`.
- `createSecureSessionStore` keeps `jotbun.v1.session` (`keychainAccessible: thisDeviceOnly`), refuses anything but UUID ids, a non-empty email of at most 320 characters and a known method, and deletes the old `gogospend.v1.session-binding` item on its first `load`.
- `betterAuthClient.ts` builds `createAuthClient({ baseURL: getMobileEnv().authUrl, plugins: [expoClient({ scheme: 'gogospend', storagePrefix: 'jotbun', storage }), emailOTPClient(), jwtClient(), jotbunAccountClient()] })` (`better-auth/client`, `better-auth/client/plugins`, `@better-auth/expo/client`; integrations/expo.mdx). `storage` wraps `SecureStore.getItem` and `SecureStore.setItem` with `keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY` (match the installed `expoClient` storage type). Every `BetterAuthClientLike` method is mapped onto the client in an object literal with no casts, so `tsc` checks each call; an error answer's `methods` field is passed through, and a sign-in answer's data becomes `{ created: createdOf(data) }` (Better Auth's client types do not know the field K23 adds). `jotbunAccountClient` is a `BetterAuthClientPlugin` (id `jotbun-account`) whose `getActions($fetch)` calls the four `/jotbun/...` routes (concepts/plugins.mdx "Get actions"). `getMobileEnv().authUrl` is `EXPO_PUBLIC_AUTH_URL`, defaulting to `v1ApiUrl` (after 1B-T13 one Worker serves both).

- [ ] **Step 1: Install the packages** (approved by §4):
  ```bash
  npm install -w gogospend-app --save-exact better-auth@1.6.33 @better-auth/expo@1.6.33
  npm ls -w gogospend-app better-auth @better-auth/expo
  ```
  `expo-network` stays out (default pending owner Q2).

- [ ] **Step 2: Stub, then write the failing tests.** First the typed stubs (R52): `createBetterAuthPort` returns a port whose calls resolve wrong typed values (`null`, `[]`, a session with empty ids), `createCredentialProvider` returns `signed_out` snapshots and `{ outcome: 'failed', methods: [], created: false }`, `createFakeAuthServer` returns a client whose calls answer `{ data: null, error: { status: 501 } }`. Then:
  `betterAuthPort.test.ts`, each with `createFakeAuthServer()`:
  - `email: a code is asked for sign-in only`: `calls` holds `sendSignInCode:<address>` and nothing for any other type.
  - `the right code signs in and names the account and the session`
  - `the first code for an address says it created the account; the next code does not` (K23): `created` is `true`, then `false`.
  - `createdOf reads only a created that is exactly true`: `createdOf({ created: 'yes' })` is `false`.
  - `a wrong code is WRONG_CODE, and nothing is stored`
  - `the server's cap is CODE_LIMIT`
  - `offline, a timeout or a 5xx is AuthUnavailable, never a refusal`
  - `a cancelled Apple sheet is AuthCancelled and the server is never called`
  - `the sign-in screen asks to sign up; a fresh sign-in never does`: `signIn({ method: 'google', signUp: true })` records `requestSignUp` true; `freshSignIn` records false.
  - `ACCOUNT_EXISTS carries the methods the server named`: with `state.existsWith = ['apple', 'email']`, the refusal's `code` is `ACCOUNT_EXISTS` and its `methods` are `['apple', 'email']` (R54).
  - `AuthRefused keeps its code and methods as fields`: `new AuthRefused('REFUSED')` has `code` `REFUSED` and `methods` `[]` (R53; the file loads under Node's type stripping).
  - `a fresh sign-in by email uses only the account's own address`
  - `a fresh sign-in by Google checks the token's subject against the linked account first; another subject is OTHER_ACCOUNT and nothing is sent` (Review Focus 4): `calls` holds no `signInWithIdToken` entry.
  - `a fresh sign-in that still lands in another account signs that session out and is OTHER_ACCOUNT`
  - `the JWT is reused until a minute before it expires, then renewed`
  - `refresh always renews`
  - `a session the server deleted reads as no token, not as an outage`
  - `linking from a stale sign-in is REAUTH_REQUIRED`: the fake answers 403 `REAUTH_REQUIRED` to `link`.
  - `unlinking calls unlink with the provider`
  - `the device calls use the jotbun routes, and REAUTH_REQUIRED and SIGNED_OUT stay apart`
  - `linked methods are Apple and Google when the account has them, then always email`
  - `the web build reports sign-in unsupported`: `unsupportedBetterAuthPort('x')` has `supported` false, `methods` `[]`, and `accessToken()` resolves null.

  `credentialProvider.test.ts` (the provider cases of today's `sessionMachine.test.ts`, ported where they still apply; its reducer tests stay):
  - `sign-in by email code stores the session only after the server signed in, then moves the epoch`
  - `a cancelled, refused or unreachable sign-in changes nothing stored and returns to where it was`
  - `an ACCOUNT_EXISTS sign-in returns the methods to use`: the result is `{ outcome: 'account_exists', methods: ['apple', 'email'], created: false }`.
  - `a sign-in result says whether it created the account` (K23, for 1D-T14): a first email sign-in gives `created: true`, the next one `created: false`.
  - `hydration: a stored session with its cookie is active; without the cookie it is locked; nothing stored is signed out`
  - `token reads and refreshes are serialized: one token call each, however many callers`
  - `a token read after a refresh never returns the pre-refresh token`
  - `offline is not a denial: the session stays active; a deleted session locks, and the lock lifts once a token works again` (Review Focus 3)
  - `sign-out tells the vault first with the session's own token, then Better Auth, then clears the record and moves the epoch`: the recorded order is `logoutVault`, `signOut`, `clear`.
  - `sign-out during a sign-in wins: the late session is signed out at the server and never stored`
  - `the server ending the session keeps the account and says why`: `SESSION_REQUIRED` and `REAUTH_REQUIRED` read `signed_out_elsewhere`, `ACCOUNT_UNAVAILABLE` reads `account_unavailable`, and stale reports change nothing.
  - `requestCredentials reads one token and the session id together, and is null unless active`
  - `a fresh sign-in into the same account swaps the session, signs the old one out and moves the epoch`
  - `an OTHER_ACCOUNT fresh sign-in changes nothing`
  - `if the new session cannot be stored, it is signed out at the server and the device ends signed out`
  - `a method this build cannot offer is not_configured and calls nothing`
  - `the installation epoch never goes backwards across launches`
  - `the secure session store keeps the record on this device only, refuses malformed values, and removes the old Auth0 binding item`
  - `an installed provider drives the shared session seam: the token, the session id as the binding, and the epoch`

  Transport: in `client.test.ts` and the ported `sessionEpoch.test.ts`, every assertion that expected `X-GoGoSpend-Session` now expects it absent, and a request with no session id is still refused before sending (`signed_out`, status 0). Every other `sessionEpoch.test.ts` case keeps its name and assertions, driven through `fakeAuthServer` and `createCredentialProvider` instead of `fakeDevice` (M8).

- [ ] **Step 3: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/auth/betterAuthPort.test.ts src/auth/credentialProvider.test.ts src/api/client.test.ts src/api/sessionEpoch.test.ts`. Expected: failures on assertions against the stubs. Record the counts.

- [ ] **Step 4: Implement** the port, the fake server, the provider, the stores, the clients, `installAppAuth`, the transport change and `env.ts`. `SignInScreen`'s `signInThroughSession(method)` returns `(await provider.signIn({ method, signUp: true })).outcome` for Apple and Google and `not_configured` for email until Task 9 routes the code screen; nothing on the screen changes. Delete the five Auth0 files, cut `reauthentication.ts` down to the `Proof` type, and remove the `reauthenticate` and auth API cases from `sessionMachine.test.ts` (they test deleted code). Afterwards `grep -rln "auth0Port\|auth0Client\|authApi\|fakeDevice" apps/app/src` prints nothing.

- [ ] **Step 5: Run them and see them pass.** Then the app gate.

- [ ] **Step 6: Prove the native bundle resolves without `expo-network` (M20).** Run `npx expo export --platform ios --output-dir <a temporary directory>` from `apps/app` (Metro on this machine, no cloud). Expected: it finishes, so Metro resolves `better-auth` and `@better-auth/expo/client` and treats their `import("expo-network")` as optional. If it fails on `expo-network`, stop and report (owner question Q2).

- [ ] **Step 7: Mutation check.**
  - Map a 5xx to `WRONG_CODE`: the offline case fails.
  - Skip the subject pre-check: the Google fresh case fails.
  - Call `port.signOut()` before `logoutVault`: the sign-out order case fails.
  - Store the record before `port.signIn` resolves: the first provider case fails.
  - Drop `methods` from the `ACCOUNT_EXISTS` refusal: its case fails.
  - Answer `created: true` for every sign-in: the next-code case fails.

- [ ] **Step 8: Gate, receipt, commit.** Commit: `git commit -m "Replace the app's Auth0 sign-in with a Better Auth port on @better-auth/expo and SecureStore"`.

---

### Task 6: D37, and fresh sign-in for deletion, export and sign-out everywhere (app clients, no new screens)

**Starts after:** 1C-T5.

**Files:**
- Create: `apps/app/src/auth/sessionEnded.ts`
- Delete: `apps/app/src/auth/reauthentication.ts`
- Modify: `apps/app/src/auth/globalLogout.ts`, `apps/app/src/spend/v1/deletion.ts`, `apps/app/src/spend/v1/privacy.ts`, `apps/app/src/api/client.ts` (`acceptLanguage` option), `apps/app/src/auth/useAuthGuardSession.ts` (adds `ended`), every other importer of `Proof` (M8): `apps/app/src/screens/redesign/account/SettingsScreen.tsx`, `SettingsParts.tsx`, `PrivacyScreen.tsx`, `PrivacyParts.tsx` and `apps/app/src/dev/catalogue/account/settingsSections.tsx`, and the two service files that hold `reauthenticate` today, `accountServices.ts` and `privacyServices.ts` (types and wiring only; no copy changes)
- Test: `apps/app/src/auth/sessionEnded.test.ts`, `apps/app/src/auth/globalLogout.test.ts` (rewritten), `apps/app/src/spend/v1/deletion.test.ts` (rewritten), `apps/app/src/spend/v1/privacy.test.ts` (the request cases rewritten), `apps/app/src/spend/v1/sessionResume.test.ts` (new), `apps/app/src/api/client.test.ts` (the language header)

**Interfaces:**
- Consumes: `CredentialProvider` (with `requestCredentials()` and `endedReason()`), `RequestCredentials`, `FreshOutcome`, `StoredSession`, `BetterAuthPort`, `AuthRefused`, `AuthUnavailable` (Task 5); `bench()` (`apps/app/src/sync/testing/harness.ts`); `AccountDatabase#discard`.
- Produces:
  ```ts
  // src/auth/sessionEnded.ts
  export type EndedKind = 'signed_out_elsewhere' | 'account_unavailable'
  export type SessionEndedView = { kind: EndedKind; accountId: string; method: SignInMethod | null; unsent: number }
  export function sessionEndedView(snapshot: SessionSnapshot, record: StoredSession | null, reason: EndedKind | null, unsent: number): SessionEndedView | null   // non-null only in 'locked' or 'reauth_required' with a record
  export type AfterEndedSignIn = { kind: 'resumed' } | { kind: 'other_account'; previousAccountId: string; unsent: number }
  export function afterEndedSignIn(previous: SessionEndedView, signedInAccountId: string): AfterEndedSignIn
  export type OtherAccountChoice = { kind: 'keep' } | { kind: 'erase'; confirmed: boolean }
  export function mayEraseOtherAccount(choice: OtherAccountChoice): boolean   // true only for { kind: 'erase', confirmed: true }
  // src/auth/useAuthGuardSession.ts
  export function useAuthGuardSession(): { isAuthed: boolean; ready: boolean; ended: boolean }   // ended: 'locked' or 'reauth_required'
  // src/api/client.ts: V1RequestOptions gains `acceptLanguage?: 'th' | 'en'`, sent as Accept-Language
  // src/auth/globalLogout.ts (the states keep their names; the request carries no proof any more)
  export type GlobalLogoutResources = { signOutEverywhere(): Promise<void> }
  export type PendingGlobalLogout = { readonly kind: 'sign_out_everywhere' }
  export function requestGlobalLogout(deps: { resources: GlobalLogoutResources; freshSignIn: () => Promise<FreshOutcome> }): Promise<GlobalLogoutState>
  export function submitGlobalLogout(request: PendingGlobalLogout, deps: { resources: GlobalLogoutResources }): Promise<GlobalLogoutState>
  // src/spend/v1/deletion.ts
  export type DeletionResources = {
    /** POST /v1/me/deletion with today's body { proof_id } (R46), the command id as Idempotency-Key, the request's own credentials and Accept-Language. */
    requestDeletion(input: { commandId: string; proofId: string; language: 'th' | 'en' }, credentials: RequestCredentials): Promise<DeletionAccepted>
    deletionReceipt(commandId: string, accessToken: string): Promise<DeletionReceipt>   // POST DELETION_RECEIPT_PATH, tokenOnly, own credentials
  }
  export type PendingDeletionRequest = { commandId: string; proofId: string; language: 'th' | 'en'; credentials: RequestCredentials }
  export function createDeletionResources(transport: V1Transport): DeletionResources
  export function requestAccountDeletion(deps: { resources: DeletionResources; freshSignIn: () => Promise<FreshOutcome>; credentials: () => Promise<RequestCredentials | null>; newId: () => string; language: 'th' | 'en' }): Promise<DeletionState>
  // submitDeletionRequest, confirmDeletionRequest, mayEraseDeviceData and settleDeviceCopy keep their names and rules
  // src/spend/v1/privacy.ts (export)
  export type PrivacyResources = { requestExport(filter: ExportFilter, request: { commandId: string; proofId: string }, credentials: RequestCredentials): Promise<CommandAck>; /* exportStatus, exportGrant, downloadExport unchanged */ }
  export type PendingExportRequest = { filter: ExportFilter; commandId: string; proofId: string; credentials: RequestCredentials }
  export function requestExport(filter: ExportFilter, deps: { resources: PrivacyResources; freshSignIn: () => Promise<FreshOutcome>; credentials: () => Promise<RequestCredentials | null>; newId: () => string; sleep?: (ms: number) => Promise<void>; pollMs?: number; maxPolls?: number }): Promise<ExportState>
  // retryExportRequest, pollExport and downloadExport keep their names and rules
  ```
- Rules:
  - `submitGlobalLogout`: resolved → `signed_out`; `AuthRefused('REAUTH_REQUIRED')` → `reauth_required`; `AuthRefused('SIGNED_OUT')` → `signed_out` (an earlier send landed and this session is gone); `AuthUnavailable` or `AuthRefused('RATE_LIMITED')` → `unconfirmed` with the same request; any other refusal → `refused` with its code. `requestGlobalLogout`: `freshSignIn()` `'fresh'` → submit; `'cancelled'` → `cancelled`; anything else → `refused` with `code: 'FRESH_SIGN_IN_FAILED'` (nothing was sent).
  - Deletion and export share one shape: `freshSignIn()` first (`'cancelled'` → `cancelled`; any other non-`'fresh'` outcome → deletion `denied` and export `reauth_required`, both with nothing sent); then `credentials()` reads the new session's token and id once; the request goes with those own credentials, its command id as the `Idempotency-Key`, and today's v1 body unchanged (R46, C2): deletion `{ proof_id }`, export `{ proof_id, from, through }`, where `proof_id` is a fresh random UUID that the server records but no longer verifies (freshness comes from `auth_time`). Deletion also sends `Accept-Language` with the app's language. A resend after a lost answer, and deletion's receipt, use the same credentials, command id and `proof_id`. `REAUTH_REQUIRED` → `reauth_required`. Every other rule of today's `deletion.ts` and `privacy.ts` holds: only `accepted` lets the device erase its copy; a ready export is never "downloaded".
  - `SettingsScreen` and Privacy keep their states and words; their services carry `freshSignIn` from the installed provider, `null` while the account's method has no fresh sign-in on this build (email until Task 9, Apple and Google until Task 7), which keeps today's disabled reason on screen. `reauthentication.ts` goes once nothing imports `Proof`.

- [ ] **Step 1: Stub, then write the failing tests.** First the typed stubs (R52): `sessionEnded.ts` returns null, `false` and `{ kind: 'resumed' }`; the rewired clients resolve `{ state: 'cancelled' }`. Then:
  `sessionResume.test.ts` (with `bench()`):
```ts
it('after a session ended, the same account sends the unsent records once; another account never sees them', async () => {
  const b = await bench()
  const queued = await b.save()
  b.server.scriptSends({ kind: 'problem', outcome: 'signed_out', status: 401, code: 'SESSION_REQUIRED' })
  expect((await b.flush('foreground')).status).toBe('signed_out')
  expect(b.server.receipts.has(queued.commandId)).toBe(false)
  // the same account signs in again: a new session moves the epoch, the diary reopens, the outbox sends
  b.session.epoch += 1
  const again = await b.database.open(ACCOUNT_A, b.session.epoch)
  await b.newEngine(again).flush({ accountId: ACCOUNT_A, epoch: b.session.epoch }, 'launch')
  expect(b.server.sent.filter((s) => s.commandId === queued.commandId)).toHaveLength(2)   // the refused try and the one that landed
  expect(b.server.receipts.has(queued.commandId)).toBe(true)
  // another account signs in: its own diary opens; account A's file stays until an explicit erase
  b.session.epoch += 1
  const other = await b.database.open(ACCOUNT_B, b.session.epoch)
  await b.newEngine(other).flush({ accountId: ACCOUNT_B, epoch: b.session.epoch }, 'launch')
  expect(b.server.sent.filter((s) => s.commandId === queued.commandId)).toHaveLength(2)
  expect(b.files.names()).toContain(`diary-${ACCOUNT_A}.db`)
})
```
  (`ACCOUNT_B` comes from `storage/testing/diaryFixtures.ts` if it is there, otherwise `'0b000000-0000-4000-8000-00000000000b'` in the test.)
  `sessionEnded.test.ts`:
  - `a locked or server-ended session shows the session-ended view with the unsent count and the account's method`
  - `active and signed-out sessions show no session-ended view`
  - `signing in again to the same account resumes`
  - `another account with unsent records asks keep or erase`
  - `erasing another account's records needs the explicit confirmation`
  - `keep never erases`
  `globalLogout.test.ts` (rewritten from today's cases, same names where they apply): `accepted: one fresh sign-in, then one sign-out-everywhere call; every session is now gone`, `the person cancels the fresh sign-in: nothing is sent`, `a fresh sign-in that fails sends nothing`, `a lost answer resent meets SIGNED_OUT because the first one landed: that is signed out`, `Jotbun cannot be reached: still signed in here, and Try again resends with no new sign-in`, `a stale sign-in is reauth_required and changes nothing`, `any other refusal changes nothing and says which`.
  `deletion.test.ts` (rewritten):
  - `a fresh sign-in, then today's body with a random proof id, the command id as the key, the new session's own token and the app's language`: the recorded request has body `{ proof_id }` with a UUID, `idempotency-key` the command id, `authorization` the new token and `accept-language` `th`.
  - `cancelling the fresh sign-in requests nothing`
  - `REAUTH_REQUIRED requests nothing more`
  - `a lost answer asks for the receipt with the same token`: found is `accepted`; not found keeps it `unconfirmed`.
  - `a resend after a lost answer repeats the same key, proof id and token`
  - `only a confirmed acceptance lets the device erase its copy; a refusal locks it and keeps the drafts`
  `privacy.test.ts` (the request cases rewritten; the polling and download cases kept): `a fresh sign-in, then today's export body with a random proof id and the new session's own token`, `cancelling the fresh sign-in requests nothing`, `a stale sign-in is reauth_required`, `a lost answer resends the same request with the same token, key and proof id`.
  `client.test.ts`: `acceptLanguage sends Accept-Language and nothing else changes`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/auth/sessionEnded.test.ts src/auth/globalLogout.test.ts src/spend/v1/deletion.test.ts src/spend/v1/privacy.test.ts src/spend/v1/sessionResume.test.ts src/api/client.test.ts`. Record the counts. (`sessionResume` may pass at once, because today's outbox already pauses on `signed_out`; record that as the D37 behaviour 1C keeps, and its mutation proves it is held.)
- [ ] **Step 3: Implement** the model, the guard's `ended`, the transport option, the rewired clients and the services as above.
- [ ] **Step 4: Run them and see them pass.** Then the app gate.
- [ ] **Step 5: Mutation check.**
  - Make the outbox treat `signed_out` as `needs_review` (in `verdictFor`): `sessionResume` fails (the record would not resend).
  - Let `mayEraseOtherAccount` accept an unconfirmed erase: its case fails.
  - Send the receipt with the session's current token instead of the request's own: the lost-answer case fails.
  - Draw a new `proof_id` on a resend: the resend case fails.
- [ ] **Step 6: Gate, receipt, commit.** Commit: `git commit -m "Keep a signed-out phone's unsent records for the same account, and take deletion, export and sign-out everywhere through a fresh sign-in"`.

---

### Task 7: Native Apple and Google sign-in

**Starts after:** 1C-T5. The Apple half starts at once (`expo-apple-authentication` is Expo's own module, covered by §4). The Google half is default pending owner Q1: approved, gated on the development-build check, with the Google button hidden until that check passes. Apple on iOS only is default pending owner Q7 (K15).

**Files:**
- Modify: `apps/app/package.json`, root `package-lock.json`
- Create: `apps/app/app.config.js`
- Modify: `apps/app/src/auth/nativeSignIn.ts` (`createNativeSignIn`), `apps/app/src/config/env.ts`, `apps/app/.env.example`, `apps/app/src/auth/betterAuthClient.ts` (passes `appNativeSignIn()`)
- Create: `apps/app/src/auth/nativeModules.ts` (imports the two modules; `appNativeSignIn()`), `apps/app/src/auth/nativeModules.web.ts` (`NO_NATIVE_SIGN_IN`)
- Test: `apps/app/src/auth/nativeSignIn.test.ts`

**Interfaces:**
- Consumes: `NativeSignIn`, `NativeIdToken`, `AuthCancelled`, `AuthRefused` (Task 5).
- Produces:
  ```ts
  export type AppleModuleLike = { isAvailableAsync(): Promise<boolean>; signInAsync(o: { requestedScopes: number[]; nonce: string }): Promise<{ identityToken: string | null; authorizationCode: string | null }>; EMAIL_SCOPE: number }
  export type GoogleModuleLike = { configure(o: { webClientId: string; iosClientId?: string }): void; hasPlayServices(): Promise<boolean>; signIn(): Promise<{ type: 'success'; data: { idToken: string | null } } | { type: 'cancelled' }> }
  export function createNativeSignIn(o: { platform: 'ios' | 'android' | 'web'; apple: AppleModuleLike | null; google: GoogleModuleLike | null; googleWebClientId: string; googleIosClientId: string; randomNonce: () => string }): NativeSignIn
  export function appNativeSignIn(): NativeSignIn   // nativeModules.ts; NO_NATIVE_SIGN_IN on the web
  ```
- Rules: Apple only on iOS; its function first checks `isAvailableAsync()` and answers `AuthRefused('REFUSED')` when it is false, so the port's `methods` stay synchronous. It asks only for the email scope, passes one fresh `randomNonce()` (`Crypto.randomUUID()`) to Apple and returns it as the token's `nonce` (Better Auth accepts it raw or as its SHA-256, M13), and returns Apple's `authorizationCode` for Task 13. An `ERR_REQUEST_CANCELED` code is `AuthCancelled`; a null `identityToken` is `AuthRefused('REFUSED')`. Google only when `googleWebClientId` is set (the owner sets it after the development-build check, Q1): `configure` once with both client ids, `hasPlayServices()` first (Android), a `cancelled` response is `AuthCancelled`, a null `idToken` is `AuthRefused('REFUSED')` (react-native-google-signin docs: `configure`, `isSuccessResponse`). `env.ts` adds `googleWebClientId` and `googleIosClientId` from `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` and `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`.
- `app.config.js` (M18): Expo reads `app.json` first and hands it to `app.config.js` as `{ config }`; the file returns `{ ...config, ios: { ...config.ios, usesAppleSignIn: true }, plugins: [...config.plugins, 'expo-apple-authentication', ...google] }`, where `google` is `[['@react-native-google-signin/google-signin', { iosUrlScheme }]]` only when `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME` is set. `app.json` itself does not change.

- [ ] **Step 1: Install.** The Apple module now; the Google package under Q1's default:
  ```bash
  npx expo install expo-apple-authentication            # the SDK 58 line (58.0.2 when this plan was written)
  npm install -w gogospend-app --save-exact @react-native-google-signin/google-signin@16.1.5
  ```
  Record in the receipt that the Google package's docs list Expo 52.0.40 to 57 and React Native 0.76 to 0.87, while the app is on Expo 58 and React Native 0.88; the development build in Step 6 is the proof.
- [ ] **Step 2: Stub, then write the failing tests** in `nativeSignIn.test.ts` (typed stub first: `createNativeSignIn` returns `NO_NATIVE_SIGN_IN`): `Apple is offered on iOS only`, `a device without Apple sign-in answers a refusal`, `Apple sends one fresh nonce both to Apple and with the token`, `Apple's authorization code comes back with the token`, `a cancelled Apple sheet is AuthCancelled`, `Google is offered only when its client ids are configured`, `a cancelled Google sign-in is AuthCancelled`, `a Google success gives the ID token`, `a Google answer without an ID token is a refusal`.
- [ ] **Step 3: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/auth/nativeSignIn.test.ts`. Record the counts.
- [ ] **Step 4: Implement** `createNativeSignIn`, `nativeModules.ts`, `app.config.js` and the env settings.
- [ ] **Step 5: Run them and see them pass.** Then the app gate and `npx expo config --type public` from `apps/app`, which must list both plugins when the Google variable is set and only the Apple one when it is not.
- [ ] **Step 6: Device check (SKIPPED until D33, default pending owner Q6):** a development build on a real iPhone signs in with Apple and Google against local `wrangler dev`, and an Android phone signs in with Google. Until the bundle id, the Google client ids and an EAS project exist, record SKIPPED; if the Google build fails, leave `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` unset so the button stays hidden (Q1).
- [ ] **Step 7: Mutation check.** Offer Apple on Android: the iOS-only case fails. Reuse one nonce for every sign-in: the fresh-nonce case fails.
- [ ] **Step 8: Gate, receipt, commit.** Commit: `git commit -m "Add native Apple and Google sign-in to the Better Auth port"`.

---

### Task 8: The sign-in, devices, session-ended and reminder screens as drafts, with screenshots for E2

**Starts after:** 1C-T5, 1C-T6. The welcome link and the reminder order are default pending owner Q7 (K16); there is no passkey offer, default pending owner Q3.

**Files:**
- Create in `apps/app/src/screens/redesign/signin/`: `draftCopy.ts`, `EmailCodeScreen.tsx`, `AccountExistsScreen.tsx`, `SessionEndedScreen.tsx`, `OtherAccountRecords.tsx`, `DevicesScreen.tsx`, `ConfirmItsYouSheet.tsx`, `useFreshSignIn.tsx`, `WelcomeSignInLink.tsx`, `ReminderQuestionScreen.tsx`, and a render test beside each screen
- Create: `apps/app/src/dev/catalogue/account/signinSections.tsx`; modify `apps/app/src/dev/catalogue/registry.tsx`
- Modify: `apps/app/src/config/featureFlags.ts` (new area `'signin'`, not in `APPROVED`), `apps/app/src/spend/v1/redesign/account/onboardingModel.ts` (`afterStory`, `afterSignInAttempt`'s `from`), `apps/app/src/screens/redesign/account/OnboardingScreen.tsx` (with `'signin'` on: the welcome link on the first story step, and the story ends at sign-in), `apps/app/src/i18n/catalogs.test.ts` (`AWAITING_E2 = new Set(['signin'])`, plus the drafts check below)

**Interfaces:**
- Consumes: `CredentialProvider`, `SignInResult`, `FreshOutcome`, `CodeOutcome`, `DeviceDto`, `BetterAuthPort` (Task 5); `sessionEndedView`, `afterEndedSignIn`, `mayEraseOtherAccount`, `useAuthGuardSession` (Task 6); today's reminder question pieces (`OnboardingParts`: `ReminderPreview`, `PrimingOutcome`; `FIRST_REMINDER`, `primingAnswer`); the kit (`PillButton`, `BunText`, `Card`, `StageHeader`, `a11y`).
- Produces:
  ```ts
  // draftCopy.ts
  export const DRAFT_TH: Readonly<Record<string, string>>   // English key → Thai; board lines verbatim, the rest marked // DRAFT
  export function useSigninCopy(): (english: string, values?: CopyValues) => string   // Thai from DRAFT_TH when the locale is th, else English; fills {placeholders}
  // onboardingModel.ts (used only while the 'signin' area is on)
  export function afterStory(signedIn: boolean): '/login?from=onboarding' | '/onboarding/reminder'
  // afterSignInAttempt(attempt, from?: 'onboarding'): an active sign-in from onboarding goes to '/onboarding/reminder', else '/spend'
  // screens (each takes its services as props; the catalogue passes fakes)
  export function EmailCodeScreen(p: { provider: Pick<CredentialProvider, 'sendEmailCode' | 'signIn' | 'freshSignIn'>; mode: 'sign_in' | 'fresh'; fixedEmail?: string; onDone(outcome: SignInResult | FreshOutcome): void; onBack(): void }): JSX.Element
  export function AccountExistsScreen(p: { methods: readonly SignInMethod[]; onMethod(method: SignInMethod): void; onBack(): void }): JSX.Element
  export function SessionEndedScreen(p: { view: SessionEndedView; unsentRows: readonly { title: string; at: string; amount: string }[]; provider: Pick<CredentialProvider, 'signIn' | 'methods'>; eraseAccount(accountId: string): Promise<void>; onResumed(): void }): JSX.Element
  export function DevicesScreen(p: { port: Pick<BetterAuthPort, 'devices' | 'signOutDevice' | 'signOutOtherDevices' | 'linkMethod' | 'unlinkMethod' | 'linkedMethods' | 'methods'>; freshSignIn: () => Promise<FreshOutcome>; account: StoredSession }): JSX.Element
  export function ReminderQuestionScreen(p: { reminders?: OnboardingReminders; onDone(): void }): JSX.Element   // today's reminder question, moved after sign-in (R55)
  export function useFreshSignIn(provider: CredentialProvider): { freshSignIn(): Promise<FreshOutcome>; sheet: ReactNode }   // Apple or Google: the native sheet; email: ConfirmItsYouSheet with the code step
  ```
- Copy: lines boards already show come verbatim from `sa-email-code`, `sa-signin`, `es-session-ended`, `sa-account`, `sa-signout-tray`, `bw-welcome` and `st-delete` (for example "ใส่รหัส 6 หลักที่ส่งไปที่", "รหัสใช้ได้ 10 นาที ไม่เห็นอีเมล ลองดูในสแปม", "ส่งรหัสใหม่ใน", "เปลี่ยนอีเมล", "เข้าสู่ระบบหรือสร้างบัญชี", "เครื่องนี้ออกจากระบบแล้ว อาจเพราะไม่ได้ใช้นาน", "หรือมีการออกจากระบบจากอีกเครื่อง", "ยังไม่ได้ส่ง จะส่งให้เองหลังเข้าสู่ระบบ", "บันทึกที่ส่งแล้วอยู่ในบัญชีของคุณครบ", "ใช้วิธีอื่น", "วิธีเข้าสู่ระบบ", "ออกจากระบบทุกเครื่อง", "มีบัญชีแล้ว เข้าสู่ระบบ"). The reminder question keeps its approved words (it moves, it does not change). Everything else (the account-exists screen and each method's line, the keep-or-erase choice, the devices list rows, signing out another device, linking and removing a method, the account-unavailable variant, every error line) is `// DRAFT`. No string goes into `en.json` or `th.json` in this task.
- Behaviour each screen must keep: the code field is one `TextInput` with `textContentType="oneTimeCode"`, `autoComplete="one-time-code"` and a number pad; six digits start exactly one sign-in; resend waits 60 seconds; the address shows masked (first letter, `•••`, the domain). The account-exists screen names each method it is given, in order, as an action (C14, R54). Session ended lists the unsent records from the open diary, names the account's own method on the main button, and after a sign-in into another account with unsent records shows the keep-or-erase choice, where erasing needs the explicit confirmation. Devices marks this device and never offers to sign it out there (that is Sign out in Settings); linking or removing a method runs `freshSignIn` first (R43) and never offers to remove the last linked one. With the `'signin'` area on, the onboarding order is the story, then sign-in, then the reminder question, then Quick add (R55, C15). Every failure says the records are safe and offers another way, as §5.2 requires.

- [ ] **Step 1: Stub, then write the failing render tests.** First the typed stubs (R52): every screen renders an empty `View`, `useSigninCopy` returns the English, `afterStory` returns `'/onboarding/reminder'`. Then:
  - `EmailCodeScreen.render.test.tsx`: `six digits start exactly one sign-in`, `a wrong code says so and clears the field`, `resend waits sixty seconds`, `the address is masked`, `in fresh mode the address is fixed and freshSignIn is called`.
  - `AccountExistsScreen.render.test.tsx`: `it names Apple first when the account uses Apple`, `it always offers the email code`, `choosing a method reports it once`.
  - `SessionEndedScreen.render.test.tsx`: `it lists the unsent records and names the account's method`, `another account with unsent records asks keep or erase`, `erase needs the confirmation, then discards that account's diary once`, `keep discards nothing`.
  - `DevicesScreen.render.test.tsx`: `this device is marked and cannot be signed out here`, `signing out another device asks first, then calls signOutDevice once and removes the row`, `signing out the other devices calls once`, `linking Google runs the fresh sign-in first, then linkMethod once`, `removing a method runs the fresh sign-in first`, `the last linked method has no remove action`.
  - `ReminderQuestionScreen.render.test.tsx`: `Turn on asks the reminder service once for 20:00, then goes on`, `Not now asks nothing and goes on`.
  - `OnboardingScreen.render.test.tsx` (new cases, with `'signin'` on): `the first story step offers the sign-in link`, `the story ends at sign-in with from=onboarding`, `with 'signin' off the order is today's`.
  - `catalogs.test.ts`: `every literal the signin folder passes to its copy hook has a Thai draft` (the screens name the hook's function `sc`, and the test reads `sc('…')` literals with the pattern `CALL` uses for `tc`).
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:render -w gogospend-app -- src/screens/redesign/signin src/screens/redesign/account/OnboardingScreen.render.test.tsx` and `npm run test:unit -w gogospend-app -- src/i18n/catalogs.test.ts`. Record the counts.
- [ ] **Step 3: Implement** the screens, the drafts, the model functions, the flag, the welcome link and the catalogue sections (each screen's states: address, code, wrong code, resend countdown, rate limited, account exists with Apple and with email only, session ended with three unsent records, account unavailable, keep or erase, erase confirmation, devices with three devices, linked and unlinked methods, confirm with Apple, Google and email, and the reminder question after sign-in).
- [ ] **Step 4: Run them and see them pass.** Then the app gate.
- [ ] **Step 5: Screenshots for the owner (E2).** In the simulator, open `gogospend://dev/catalogue?section=<id>&theme=<light|dark>&locale=<th|en>&tour=3000` for every section above; capture light and dark, Thai and English, at 320 pt and at the default width; list the files in the receipt and hand them to the owner. If no simulator build can run here, record SKIPPED and give the owner the catalogue sections to open. Nothing is routed until the owner approves.
- [ ] **Step 6: Mutation check.** Let five digits start a sign-in: its case fails. Let erase run without the confirmation: its case fails. Link without the fresh sign-in: its case fails.
- [ ] **Step 7: Gate, receipt, commit.** Commit: `git commit -m "Draft the sign-in code, account-exists, session-ended, devices and reminder screens for the owner's review"`.

---

### Task 9: Route the approved screens and move their copy into the catalogs

**Starts after:** 1C-T8, and the owner's E2 approval of its screenshots (with any changes the owner asks for, applied first).

**Files:**
- Create: `apps/app/app/login/email.tsx`, `apps/app/app/login/account-exists.tsx`, `apps/app/app/session-ended.tsx`, `apps/app/app/settings/devices.tsx`, `apps/app/app/onboarding/reminder.tsx`
- Modify: `apps/app/src/messages/en.json`, `apps/app/src/messages/th.json`, `apps/app/src/i18n/catalogs.test.ts` (`AWAITING_E2` empty again), `apps/app/src/config/featureFlags.ts` (`'signin'` joins `APPROVED`), the `signin/` screens (`useSigninCopy` becomes `useCopy`), `SignInScreen.tsx` (email opens `/login/email`; an `account_exists` result opens `/login/account-exists` with its methods; an active sign-in follows `afterSignInAttempt`), `SettingsScreen.tsx` and `PrivacyScreen.tsx` (render `useFreshSignIn`'s sheet; their services' `freshSignIn` is no longer null for email accounts), and the two layout guards (M9): `apps/app/app/spend/_layout.tsx` (`SpendLayout`) and `apps/app/app/settings/_layout.tsx`, which send an `ended` session to `/session-ended`
- Delete: `apps/app/src/screens/redesign/signin/draftCopy.ts`
- Test: `apps/app/src/screens/redesign/account/AccountRoutes.render.test.tsx` (extended)

**Interfaces:**
- Consumes: everything Task 8 produces, as approved.
- Produces: the routes `/login/email`, `/login/account-exists`, `/session-ended`, `/settings/devices`, `/onboarding/reminder`; no new code interfaces.

- [ ] **Step 1: Write the failing tests** in `AccountRoutes.render.test.tsx`: `the email button opens the code screen`, `an account_exists sign-in opens the account-exists screen naming its methods`, `a locked or server-ended session sends the diary routes to /session-ended`, `a locked session sends the settings routes to /session-ended`, `Settings links to devices`, `a first sign-in from onboarding goes to the reminder question, then Quick add`; `catalogs.test.ts` already fails while any `signin/` literal is missing from `en.json`.
- [ ] **Step 2: Run them and see them fail.** Record the counts.
- [ ] **Step 3: Move every approved `DRAFT_TH` entry** into the catalogs under a new `redesign…` key named like the existing ones (for example `redesignContinueWithEmail`; add a number when the name is taken), with the English as the value in `en.json` and the approved Thai under the same key in `th.json`. Then switch the screens to `useCopy`, delete `draftCopy.ts`, empty `AWAITING_E2`, approve the area, and add the routes and both guards.
- [ ] **Step 4: Run them and see them pass.** Then the app gate.
- [ ] **Step 5: Mutation check.** Leave one approved string out of `th.json`: `th.json translates every key in en.json` fails. Drop the guard from `settings/_layout.tsx`: its case fails.
- [ ] **Step 6: Gate, receipt, commit.** Commit: `git commit -m "Route the approved sign-in, session-ended, devices and reminder screens and add their copy to the catalogs"`.

---

### Task 10a: The vault trusts Better Auth: its keys, the account gate and the revocation RPCs

**Starts after:** 1C-T4, 1A-T2, 1B-T3 (R51).

**Files:**
- Create: `apps/edge/src/v1/auth-keys.ts`, `apps/edge/src/v1/auth-verifier.ts`, `apps/edge/src/v1/account-gate.ts`, `apps/edge/src/vault/account-control.ts`, `apps/edge/test/workers/support/auth-vault.ts`
- Modify: `apps/edge/src/v1/handler.ts` (imports `verifierFor` from `auth-verifier.ts`; runs the gate), `src/v1/routes.ts` (`VaultRoute.skipsAccountGate?: true`), `src/v1/env.ts`, `src/vault/user-vault.ts` (the two RPCs), `src/vault/session.ts` (`revokeSession` keeps 930 seconds, R44), `src/auth/env.ts` (`VAULT?`), `src/auth/vault-control.ts` (`vaultSessionControl`), `src/auth/instance.ts` (uses it when `VAULT` is bound), `apps/edge/wrangler.vault.jsonc`, `test/vault-route-coverage.test.ts`
- Test: `apps/edge/test/workers/auth-vault.test.ts`

**Interfaces:**
- Consumes: `handleVaultV1`, `createTokenVerifier`, `tokenVerifierFromEnv`, `TokenVerifier`, `VaultClaims`, `MAX_TOKEN_LIFETIME_SECONDS`, `ensureAccount`, `assertSession`, `revokeSession`, `VaultOwnerMismatch`, `logFailure`, `startV1`, `vaultOf`, `TEST_POLICIES` (1A); `CLOCK_TOLERANCE_SECONDS` (`@api/auth/auth0-token-verifier`); `ConfigurationError` (`@api/common/configuration-error`); 1B-T3's Worker-route dispatch, `WORKER_HANDLERS`, `WorkerRouteId`, `claims.authTime`; `UserVault#erased` and `erase()` (1B-T2); `authFor`, `AuthEnv`, `AUTH_BASE_PATH`, `testAuth`, `TEST_AUTH` (Task 1); `VaultSessionControl`, `readAccountStatus`, `isErased`, `subjectHash` (Task 4).
- Produces:
  ```ts
  // src/v1/auth-keys.ts
  export const KEYS_MAX_AGE_MS = 5 * 60_000, UNKNOWN_KID_COOLDOWN_MS = 30_000
  export type JwksSource = () => Promise<JSONWebKeySet>   // jose's type
  export function betterAuthJwks(env: AuthEnv): JwksSource   // GET `${env.AUTH_BASE_URL}${AUTH_BASE_PATH}/jwks` through authFor(env).handler, in process
  export function betterAuthKeys(source: JwksSource, now?: () => number): JWTVerifyGetKey
  // src/v1/auth-verifier.ts (1D-T12 imports verifierFor from here)
  export function betterAuthVerifierFromEnv(env: V1Env & AuthEnv): TokenVerifier   // throws ConfigurationError unless AUTH_ISSUER, AUTH_AUDIENCE and AUTH_BASE_URL are set
  export function verifierFor(env: V1Env): TokenVerifier   // moved from handler.ts: one per env object (WeakMap); Better Auth's when AUTH_DB is bound, else 1A's tokenVerifierFromEnv; a configuration error is 503 SERVICE_UNAVAILABLE (retryAfterSeconds 30)
  // src/v1/account-gate.ts
  export function accountGate(env: V1Env, claims: VaultClaims, nowMs?: number): Promise<void>
  // src/vault/account-control.ts
  export const REVOCATION_KEEP_SECONDS = MAX_TOKEN_LIFETIME_SECONDS + CLOCK_TOLERANCE_SECONDS   // 930 (R44)
  export function revocationExpiresAt(now: Date): string   // new Date(now.getTime() + REVOCATION_KEEP_SECONDS * 1000).toISOString()
  export function revokeSessionIds(sql: SqlStorage, sessionIds: readonly string[], now: Date): void
  export function raiseNotBefore(sql: SqlStorage, notBefore: number): void
  export function accountRowFor(sql: SqlStorage, accountId: string): { status: string; not_before: number } | null   // null: no row; another owner's row throws VaultOwnerMismatch
  // src/vault/user-vault.ts (Durable Object RPC methods)
  revokeSessions(accountId: string, sessionIds: readonly string[]): void
  signOutEverywhere(accountId: string, sessionIds: readonly string[], notBefore: number): void
  // src/auth/vault-control.ts
  export function vaultSessionControl(env: { VAULT: DurableObjectNamespace<UserVault> }): VaultSessionControl   // a type-only import of UserVault
  // src/v1/env.ts
  export type V1Env = { /* 1A and 1B fields unchanged */ } & Partial<AuthEnv>
  export function hasAuthDb(env: V1Env): env is V1Env & AuthEnv   // AUTH_DB bound; keeps the env object, so the caches still hit
  // test/workers/support/auth-vault.ts
  export type AuthV1 = { get(path: string, token: string, o?: { client?: string }): Promise<Response>; post(path: string, token: string, body?: unknown, o?: { key?: string; client?: string; headers?: Record<string, string> }): Promise<Response> }
  export function startAuthV1(config?: EdgeConfigJson): Promise<AuthV1>   // writes config:v1 as startV1 does; sends through handleVaultV1(request, env) with no injected verifier, client 'ios/1.0.0'
  ```
- `betterAuthKeys` keeps the key set it last read. It reads again when that set is `KEYS_MAX_AGE_MS` old, and, for a token whose `kid` the set does not hold, at most once per `UNKNOWN_KID_COOLDOWN_MS` (R50); otherwise jose's `createLocalJWKSet` answers from the set it has, so a token signed by an unknown key is 401 (`JWKSNoMatchingKey`). A source that throws or answers something that is not a key set throws `new errors.JWKSInvalid()`, which 1A's `isKeySourceFailure` already answers with 503.
- `accountGate` (K8, R49, R56) does nothing when `AUTH_DB` is not bound. Otherwise it reads `readAccountStatus(env.AUTH_DB, claims.accountId)` and `isErased(env.ERASURE_DB, env.ERASURE_KEY, claims.accountId, nowMs)` with `Promise.all`; a status other than `active`, or an erased account, throws `ProblemException(403, 'ACCOUNT_UNAVAILABLE')`. `ERASURE_DB` or `ERASURE_KEY` missing throws `ProblemException(503, 'SERVICE_UNAVAILABLE', { retryAfterSeconds: 30 })`; a D1 read that fails throws `ProblemException(503, 'SERVICE_UNAVAILABLE', { retryAfterSeconds: 5 })` after `logFailure('account_gate_unavailable', error)`.
- `handleVaultV1` runs `await accountGate(env, claims)` once, right after `verifier.verify(...)` and before both the vault call and 1B-T3's Worker-route dispatch, for every route without `skipsAccountGate` (only Task 11's two deletion routes set it). Public routes never reach it.
- The RPCs (R44, C17): each runs in one `ctx.storage.transactionSync`. An erased vault (`this.erased`) or a row whose status is `deleted` does nothing. `accountRowFor` refuses another owner. `revokeSessions` writes `revokeSessionIds`; `signOutEverywhere` writes `revokeSessionIds` and, when the account row exists, `raiseNotBefore(sql, notBefore)`. Neither ever inserts `account_state`: a vault that was never used keeps no account row, and the revoked ids still refuse those sessions when it is first used (`ensureAccount` then `assertSession`). Every id must pass `isUuid` and `notBefore` must be a whole number of seconds, else they throw before writing.
- The SQL (R57):
  ```sql
  -- revokeSessionIds: ?1 revoked_at (ISO now), ?2 expires_at (revocationExpiresAt), ?3 JSON.stringify(sessionIds)
  INSERT INTO revoked_sessions (session_id, revoked_at, expires_at)
  SELECT value, ?1, ?2 FROM json_each(?3) WHERE true
  ON CONFLICT (session_id) DO UPDATE SET expires_at = max(expires_at, excluded.expires_at);
  -- raiseNotBefore
  UPDATE account_state SET not_before = max(not_before, ?1) WHERE id = 1;
  ```
  (`WHERE true` is SQLite's documented way to let an `INSERT … SELECT` take an upsert clause. ISO texts from `toISOString()` compare in time order.)
- 1A's `revokeSession(c)` (`POST /v1/me/logout`) becomes `revokeSessionIds(c.sql, [c.claims.sessionId], c.now)`, so its row is kept 930 seconds from the vault's clock, not the token's `iat` plus 900 (R44).
- `instance.ts`: `authFor(env)` passes `vault: env.VAULT ? vaultSessionControl({ VAULT: env.VAULT }) : unwiredVaultControl`. `vaultSessionControl` calls `env.VAULT.get(env.VAULT.idFromName(userId), { locationHint: 'apac' })` and awaits the RPC.
- `wrangler.vault.jsonc` gains the same `d1_databases` entries as `wrangler.jsonc` (`AUTH_DB` and `ERASURE_DB`), the vars `AUTH_BASE_URL`, `AUTH_ISSUER` (`"http://localhost:8092"`), `AUTH_AUDIENCE` (`"jotbun-v1"`) and `AUTH_TRUSTED_ORIGINS` (`"gogospend://"`), and a comment naming the secrets `BETTER_AUTH_SECRET` and `ERASURE_KEY`, which must equal the HTTP Worker's. If the vitest plugin reports a binding declared twice (there and in `vitest.workers.config.ts`), drop it from the test config's list.

- [ ] **Step 1: Stub, then write the failing tests.** First the typed stubs (R52): `betterAuthKeys` returns a key function that always throws `JWKSNoMatchingKey`, `accountGate` resolves, the RPCs return without writing, `vaultSessionControl` returns `unwiredVaultControl`, and `verifierFor` keeps 1A's behaviour. Then, in `auth-vault.test.ts`, with `const t = testAuth({ vault: vaultSessionControl(env) })` (R51) and `startAuthV1()`:
  - `a Better Auth token reaches the person's own vault`: after `t.signInByEmail(email)`, `GET /v1/me` with `t.token(me.cookie)` answers 200, and `vaultOf({ sub: me.userId, sid: me.sessionId })` holds `account_state.account_id` equal to `me.userId`.
  - `the vault Worker's own entry verifies Better Auth tokens` (R50): `SELF.fetch('http://vault.test/v1/me', { headers: { authorization: 'Bearer ' + token, 'x-gogospend-client': 'ios/1.0.0' } })` answers 200.
  - `a token signed by a key Better Auth never published is 401`: a token with Better Auth's claims signed by a fresh EdDSA key answers 401 `UNAUTHENTICATED`.
  - `an unknown key id reads the keys again at most once in thirty seconds`: with a counting source and a fake clock, `betterAuthKeys` reads once for a known key; two unknown `kid`s 10 seconds apart add one read; a third 31 seconds later adds another.
  - `the key set is read again after five minutes`: one read, then a call 300 001 ms later makes the second.
  - `a key source that fails is 503, not 401`: a verifier over a throwing source answers 503 `SERVICE_UNAVAILABLE` for a well-formed token.
  - `missing Better Auth settings are 503`: `handleVaultV1(request, { ...env, AUTH_ISSUER: undefined })` answers 503 `SERVICE_UNAVAILABLE`.
  - `signing out one device stops its unexpired JWT at the vault at once` (Review Focus 5): sessions A and B for one address; A's token answers 200 on `/v1/me`; B signs A out with `POST /api/auth/jotbun/devices/sign-out`; A's same token then answers 401 `SESSION_REQUIRED`.
  - `sign out everywhere refuses even a token issued inside the clock tolerance` (R44): a token for A minted with the clock 20 seconds ahead (`vi.setSystemTime(Date.now() + 20_000)`, `t.token`, then the clock restored); after sign out everywhere from A, that token answers 401 `SESSION_REQUIRED` (its `iat` passes `not_before`, its session id does not).
  - `a revocation is kept 930 seconds from the vault's clock`: with the vault's `clock` pinned to `2026-10-25T00:00:00.000Z`, after `revokeSessions`, the row's `expires_at` is `2026-10-25T00:15:30.000Z`; after `POST /v1/me/logout`, the same holds for 1A's row.
  - `revocations take more ids than SQLite has parameters` (R57): `revokeSessions(userId, 150 ids)` leaves 150 rows.
  - `the revocation RPCs never create an account row` (C17): on a vault never used, `revokeSessions` and `signOutEverywhere` leave `account_state` empty and the revoked rows present; a later first call with a revoked session's token answers 401 `SESSION_REQUIRED`.
  - `an erased vault ignores revocations`: after `erase()`, `revokeSessions` resolves and the vault holds only the `deleted` marker row.
  - `another owner's vault refuses a revocation`: `vaultOf(A).revokeSessions(B.userId, ids)` on A's used vault rejects and writes nothing.
  - `a deleting account's valid token is refused before its vault is touched`: with `account_status` `deleting` for the user, `GET /v1/me` answers 403 `ACCOUNT_UNAVAILABLE`, and that vault's `account_state` is empty.
  - `an erased account's valid token is refused, and its vault is not re-created` (R56): with `erasure_registry` holding `subjectHash(ERASURE_KEY, userId)` and a future `expires_at`, 403 `ACCOUNT_UNAVAILABLE`, and `account_state` is empty.
  - `the gate covers Worker routes too` (R49): a temporary route `{ method: 'GET', path: '/v1/test/gated', access: 'bound_session', worker: 'test.gated' }` (pushed onto `VAULT_V1_ROUTES` with a `WORKER_HANDLERS` entry for the case and removed afterwards, as 1B-T3's step-only test does) answers 403 `ACCOUNT_UNAVAILABLE` for a deleting account, and its handler never ran.
  - `when AUTH_DB cannot be read, no vault is called`: with an `AUTH_DB` whose `prepare` throws, `GET /v1/me` answers 503 `SERVICE_UNAVAILABLE`.
  `vault-route-coverage.test.ts`: `no route skips the account gate yet` (`VAULT_V1_ROUTES.filter((r) => r.skipsAccountGate)` is empty; Task 11 changes it to the two deletion routes).
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/auth-vault.test.ts` and `npm run test:edge -- test/vault-route-coverage.test.ts`. Record the counts.
- [ ] **Step 3: Implement** the keys, the verifier move, the gate, the account control, the RPCs, the `revokeSession` change, `vaultSessionControl`, `authFor`'s vault and the bindings. If a 1A test pinned the old `expires_at`, update it in this commit.
- [ ] **Step 4: Run them and see them pass.** Every 1A and 1B test still passes (their injected verifiers bypass `verifierFor`; their accounts have no status row and no registry entry).
- [ ] **Step 5: Mutation check.**
  - Run the gate only for vault routes: the Worker-route case fails.
  - Make `signOutEverywhere` raise `not_before` only: the clock-tolerance case fails.
  - Keep 1A's `iat + 900`: the 930-second case fails for `/v1/me/logout`.
  - Bind one `?` per id: the 150-id case fails (too many SQL variables).
  - Read the keys again on every unknown `kid`: the cooldown case fails.
  - Insert `account_state` when it is missing: the never-used case fails.
- [ ] **Step 6: Gate, receipt, commit.** Commit: `git commit -m "Verify Better Auth tokens in the vault, gate every call on account status and the erasure registry, and revoke sessions through vault RPCs"`.

---

### Task 10b: The one Worker after the fold: `/ready` and the entry points

**Starts after:** 1C-T10a, 1B-T13 (R51).

**Files:**
- Modify: `apps/edge/src/v1/ready.ts` (`readyResponseOf`), `apps/edge/src/server.ts` (keeps 1B-T13's `queue` handler and re-exports beside Task 1's `/api/auth/*` check, K3), `apps/edge/wrangler.jsonc` (drops any `AUTH_JWKS_URL` var 1B-T13 carried over), `apps/edge/test/c1-worker.db.test.ts` (its settings)
- Test: `apps/edge/test/workers/ready.test.ts`

**Interfaces:**
- Consumes: `readyResponseOf`, `src/vault-worker.ts`, `src/routes/v1/$.ts`, `startDevWorker` (1B-T13); `verifierFor`, `hasAuthDb`, `vaultSessionControl`, `auth-vault.test.ts` (Task 10a); `AuthConfigError`, `authFor` (Task 1).
- Produces: `readyResponseOf(env)` answers 200 `{ status: 'ready' }` when `AUTH_ISSUER`, `AUTH_AUDIENCE`, `AUTH_BASE_URL` and `COMMAND_DIGEST_KEY` are set, `BETTER_AUTH_SECRET` and `ERASURE_KEY` have at least 32 characters, `AUTH_DB` and `ERASURE_DB` are bound, and reading `config:v1` does not throw; otherwise 503 as 1B-T13 answers it. `AUTH_JWKS_URL` is no longer read (R50).
- Entry points: the HTTP Worker's `/v1` route (`src/routes/v1/$.ts`) and `src/vault-worker.ts` both call `handleVaultV1(request, env)` with no injected verifier, so `verifierFor` builds Better Auth's; `authFor` gets the real `vaultSessionControl` there because `VAULT` is bound in the one Worker.

- [ ] **Step 1: Stub, then write the failing tests.** `readyResponseOf` keeps 1B-T13's checks as the stub. `ready.test.ts`:
  - `/ready no longer needs a JWKS URL`: `readyResponseOf({ ...env, AUTH_JWKS_URL: undefined })` answers 200.
  - `/ready needs Better Auth's secret`: without `BETTER_AUTH_SECRET` it answers 503 `SERVICE_UNAVAILABLE`.
  - `/ready needs the erasure registry`: without `ERASURE_DB` it answers 503 `SERVICE_UNAVAILABLE`.
  In `c1-worker.db.test.ts`, the first Worker's settings swap `AUTH_JWKS_URL` for `AUTH_BASE_URL`, `BETTER_AUTH_SECRET` and `ERASURE_KEY` (synthetic values of 32 or more characters), so its `/ready` 200 case fails until Step 3.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/ready.test.ts` and `npm run build:edge && npm run test:edge:db -- test/c1-worker.db.test.ts`. Record the counts.
- [ ] **Step 3: Implement** `readyResponseOf` and the `wrangler.jsonc` clean-up, and resolve `src/server.ts` so it keeps both the auth interception and 1B-T13's `queue` and re-exports.
- [ ] **Step 4: Run them and see them pass.** Then run Task 10a's `auth-vault.test.ts` again: after the fold `SELF` is `src/vault-worker.ts`, so its entry-point case now proves the one Worker (R50).
- [ ] **Step 5: Mutation check.** Leave the `AUTH_JWKS_URL` requirement in `readyResponseOf`: the first case fails. Drop the `ERASURE_DB` check: the third fails.
- [ ] **Step 6: Gate, receipt, commit.** Commit: `git commit -m "Make the one Worker ready on Better Auth's settings and verify its tokens at every entry point"`.

---

### Task 11: Account deletion on `DeletionWorkflow` (§6.12), and its receipt

**Starts after:** 1C-T2, 1C-T10a, 1B-T2, 1B-T4, 1B-T6, 1B-T13 (R48).

**Files:**
- Create: `apps/edge/migrations/auth/0003_deletion.sql`; `apps/edge/src/deletion/request.ts`, `receipt.ts`, `steps.ts`, `hooks.ts`, `workflow.ts`; `apps/edge/test/workers/support/deletion.ts`
- Modify: `apps/edge/src/v1/protocol.ts` (`VaultAccess` gains `'token_only'`; `WorkerRouteId` gains `'deletion.request' | 'deletion.receipt'`), `src/v1/routes.ts` (the two routes; `VAULT_DEFERRED_ROUTES` becomes empty), `src/v1/worker-routes.ts` (their `WORKER_HANDLERS`), `src/v1/handler.ts` (`token_only`), `src/v1/env.ts` (`DELETION_WORKFLOW?: Workflow<DeletionParams>`), `src/vault/user-vault.ts` (`markDeleting`), `src/vault/account-control.ts`, `src/auth/mailer.ts` and `src/auth/email-copy.ts` (the deletion email), `scripts/check-dist.mjs` (a second marker), `test/workers/auth/support/auth-harness.ts` (the capturing mailer records notices), `src/vault-worker.ts` and `src/server.ts` (export `DeletionWorkflow`), `wrangler.jsonc` (the Workflow), `test/c1-shape.test.ts`, `test/route-coverage.test.ts`, `test/workers/auth/schema.test.ts` (`deletion_requests`)
- Test: `apps/edge/test/workers/deletion.test.ts`

**Interfaces:**
- Consumes: `WorkerHandler`, `WorkerContext`, `WORKER_HANDLERS`, `assertFreshSignIn` (1B-T3); `createOnce` and the shim types `Workflow`, `WorkflowInstance` (1B-T4); `WorkflowEntrypoint`, `WorkflowEvent`, `WorkflowStep` (1B-T6's shim); `erase()`, `purgeVaultObjects`, `VaultBucket` (1B-T2); `src/vault-worker.ts`, `c1-shape.test.ts`, `route-coverage.test.ts` (1B-T13); `derivedUuid` (`@api/commands/derived-id`); `assertKnownFields`, `ContractValidationError`, `isUuid` (contracts); `readAccountStatus`, `isErased`, `subjectHash` (Task 4); `accountGate`, `accountRowFor`, `startAuthV1`, `vaultSessionControl` (Task 10a); `mailerFromEnv`, `transportMailer`, `localCodeLog`, `addressHash`, `EmailMessage` (Task 2); `testAuth`, `SignedIn` (Task 1).
- Produces:
  ```sql
  -- migrations/auth/0003_deletion.sql
  CREATE TABLE deletion_requests (
    request_id TEXT PRIMARY KEY NOT NULL,       -- derivedUuid(userId, 'deletion-request', commandId)
    user_id TEXT,                               -- forgotten by the final sweep (M11)
    session_id TEXT,                            -- the requesting session: only it reads the receipt
    client_id TEXT NOT NULL,                    -- the requesting client header, checked by the receipt (M21)
    proof_id TEXT NOT NULL,                     -- recorded, never verified (R46)
    email TEXT,                                 -- forgotten once the deletion email is sent (K18)
    locale TEXT NOT NULL CHECK (locale IN ('th', 'en')),
    status TEXT NOT NULL CHECK (status IN ('accepted', 'completed')),
    requested_at INTEGER NOT NULL,
    completed_at INTEGER,
    CHECK ((status = 'completed') = (completed_at IS NOT NULL)),
    CHECK (status = 'accepted' OR (user_id IS NULL AND session_id IS NULL AND email IS NULL))
  );
  CREATE UNIQUE INDEX deletion_requests_open_idx ON deletion_requests (user_id) WHERE status = 'accepted';
  CREATE INDEX deletion_requests_requested_idx ON deletion_requests (requested_at);
  ```
  ```ts
  // src/deletion/request.ts
  export function deletionRequestId(userId: string, commandId: string): string   // derivedUuid(userId, 'deletion-request', commandId)
  export function deletionLocale(acceptLanguage: string | undefined): 'th' | 'en'   // 'en' only when the first language tag starts with "en"
  export const handleDeletionRequest: WorkerHandler   // 'deletion.request'
  // src/deletion/receipt.ts
  export const handleDeletionReceipt: WorkerHandler   // 'deletion.receipt'
  // src/deletion/hooks.ts (1D-T13 fills it)
  export type DeletionHooks = { deleteAnalyticsPerson(env: DeletionEnv, userId: string): Promise<unknown> }
  export const deletionHooks: DeletionHooks   // a no-op until 1D-T13 (M10)
  // src/deletion/steps.ts (each returns nothing or a count, never an id or an address: M11)
  export type DeletionSubject = { requestId: string; userId: string }
  export function deletionSubject(db: D1Database, requestId: string): Promise<DeletionSubject | null>   // null once the final sweep forgot the user
  export function markAccountDeleting(env: DeletionEnv, s: DeletionSubject, nowMs?: number): Promise<void>
  export function markVaultDeleting(env: DeletionEnv, s: DeletionSubject): Promise<void>
  export function purgeObjects(env: DeletionEnv, s: DeletionSubject): Promise<number>
  export function eraseVault(env: DeletionEnv, s: DeletionSubject): Promise<void>
  export function deleteSignInRecords(env: DeletionEnv, s: DeletionSubject, nowMs?: number): Promise<void>
  export function sendDeletionEmail(env: DeletionEnv, s: DeletionSubject, mailer?: Mailer): Promise<void>
  export function finalSweep(env: DeletionEnv, s: DeletionSubject, nowMs?: number): Promise<number>
  // src/deletion/workflow.ts
  export type DeletionParams = { requestId: string }   // nothing else (M11)
  export type DeletionEnv = V1Env & AuthEnv & { VAULT: DurableObjectNamespace<UserVault>; OBJECTS: VaultBucket; ERASURE_DB: D1Database; ERASURE_KEY: string }
  export const DELETION_STEPS = ['mark-account-deleting', 'mark-vault-deleting', 'purge-objects', 'erase-vault', 'delete-sign-in-records', 'delete-analytics-person', 'send-deletion-email', 'final-sweep'] as const
  export const STEP_CONFIG = { retries: { limit: 10, delay: '30 seconds', backoff: 'exponential' }, timeout: '10 minutes' } as const
  export const FINAL_SWEEP_DELAY = '1 hour'   // after every publisher's deadline: grants last 5 minutes, upload reservations 15 (M12)
  export const ERASURE_KEEP_MS = 60 * 86_400_000
  export function runDeletion(env: DeletionEnv, requestId: string, step: WorkflowStep): Promise<void>
  export class DeletionWorkflow extends WorkflowEntrypoint<DeletionEnv, DeletionParams> { run(event: WorkflowEvent<DeletionParams>, step: WorkflowStep): Promise<void> }   // runDeletion(this.env, event.payload.requestId, step)
  // src/vault/user-vault.ts (RPC)
  markDeleting(accountId: string): Promise<void>
  // src/auth/mailer.ts
  export type DeletionNotice = { to: string; locale: 'th' | 'en'; reference: string }   // reference: the request id
  // Mailer gains sendDeletionNotice(notice: DeletionNotice): Promise<void>
  export const LOCAL_DELETION_LOG_EVENT = 'jotbun-local-deletion-email'   // the local log writes { event, reference, locale }, never the address
  // src/auth/email-copy.ts
  export function deletionEmail(notice: DeletionNotice): EmailMessage   // idempotencyKey: notice.reference
  // test/workers/auth/support/auth-harness.ts: TestAuth.mailer gains notices: DeletionNotice[]
  // test/workers/support/deletion.ts (1D-T13 reuses these)
  export type DeletionClient = {
    request(me: SignedIn, o?: { commandId?: string; proofId?: string; token?: string; language?: string; body?: unknown }): Promise<Response>
    receipt(me: SignedIn, commandId: string, o?: { token?: string; client?: string }): Promise<Response>
  }
  export function deletionClient(t: TestAuth, v1: AuthV1): DeletionClient   // a fresh token per call unless o.token is given
  export function deletionInstance(userId: string, commandId: string): Promise<WorkflowInstanceIntrospector>   // introspectWorkflowInstance(env.DELETION_WORKFLOW, deletionRequestId(userId, commandId))
  export function personWithData(t: TestAuth, v1: AuthV1): Promise<{ me: SignedIn; email: string }>   // signs up, accepts terms, creates a wallet, and puts one R2 object under the vault's export prefix
  ```
- Routes (R48), each registered through 1B-T3's Worker-route mechanism:
  ```ts
  { method: 'POST', path: '/v1/me/deletion', access: 'recent_proof', worker: 'deletion.request', status: 202, skipsAccountGate: true }
  { method: 'POST', path: '/v1/auth/deletion-receipt', access: 'token_only', worker: 'deletion.receipt', status: 200, skipsAccountGate: true }
  ```
  These match the API's access classes and statuses (`deletion.controller.ts`). A `token_only` route runs the client-version check and the token, never the gate, and its handler gets `vault: null`. Both skip the gate: a replay must answer after the account is `deleting`, and the receipt after its session is gone.
- `handleDeletionRequest`, in this order (R45, R42, R46):
  1. The `idempotency-key` header must be a UUID, else `ContractValidationError('VALIDATION_FAILED', 'Idempotency-Key must be a UUID.', 'idempotency_key')`. The body passes `assertKnownFields(body, ['proof_id'])` and `proof_id` must be a UUID, else the same error on `proof_id` (422, as 1A answers it). `proof_id` is recorded, never checked against anything.
  2. Replay: `SELECT status FROM deletion_requests WHERE request_id = ?` for `deletionRequestId(claims.accountId, commandId)`. Found: when its status is `accepted`, start the Workflow again with `createOnce` (an instance that exists counts as started); answer 202 `{ request_id, status: 'accepted' }`. No freshness or session check runs for a replay.
  3. `assertFreshSignIn(claims, Math.floor(Date.now() / 1000))` (1B-T3; 401 `REAUTH_REQUIRED`).
  4. `readAccountStatus` not `active`, or `isErased`, read in parallel: 403 `ACCOUNT_UNAVAILABLE`.
  5. One `AUTH_DB.batch` of two statements, so the request is recorded only for a live session (R42) and the account is `deleting` from the same moment (K17):
     ```sql
     -- ?1 request_id, ?2 user_id, ?3 session_id, ?4 client_id, ?5 proof_id, ?6 locale, ?7 now (ms), ?8 now (ISO)
     INSERT INTO deletion_requests (request_id, user_id, session_id, client_id, proof_id, email, locale, status, requested_at)
     SELECT ?1, ?2, ?3, ?4, ?5, (SELECT email FROM "user" WHERE id = ?2), ?6, 'accepted', ?7
     WHERE EXISTS (SELECT 1 FROM session WHERE id = ?3 AND userId = ?2 AND expiresAt > ?8);
     -- ?1 request_id, ?2 user_id, ?3 now (ms)
     INSERT INTO account_status (user_id, status, updated_at)
     SELECT ?2, 'deleting', ?3 WHERE EXISTS (SELECT 1 FROM deletion_requests WHERE request_id = ?1)
     ON CONFLICT (user_id) DO UPDATE SET status = 'deleting', updated_at = excluded.updated_at;
     ```
     The first result's `meta.changes` of 0 answers 401 `SESSION_REQUIRED` (the session was signed out or has expired). A batch refused by `deletion_requests_open_idx` (another request opened in between) answers 403 `ACCOUNT_UNAVAILABLE`.
  6. `createOnce(env.DELETION_WORKFLOW, requestId, { requestId })`. If it throws, answer 503 `SERVICE_UNAVAILABLE` with `retryAfterSeconds: 5`: the request is kept, and the app's resend (same key) replays and starts it.
  7. 202 `{ request_id, status: 'accepted' }`. The locale is `deletionLocale(w.headers['accept-language'])` (K11). A missing `AUTH_DB`, `ERASURE_DB`, `ERASURE_KEY` or `DELETION_WORKFLOW` answers 503.
- `handleDeletionReceipt`: `assertKnownFields(body, ['command_id'])` with a UUID `command_id` (else 422 on `command_id`); `SELECT request_id, status FROM deletion_requests WHERE request_id = ?1 AND session_id = ?2 AND client_id = ?3` for `deletionRequestId(claims.accountId, command_id)`, the token's `sid` and its client header; found → 200 `{ request_id, status }` with `cache-control: no-store`; otherwise 404 `NOT_FOUND`.
- `runDeletion` reads `deletionSubject(env.AUTH_DB, requestId)` once, outside any step (a read, so a replay of `run` repeats it harmlessly, and it never enters Workflow state); `null` returns at once. Then, in order, each `step.do(name, STEP_CONFIG, …)` with the names in `DELETION_STEPS`, and `step.sleep('wait-for-publishers', FINAL_SWEEP_DELAY)` before `final-sweep`:
  1. `markAccountDeleting`: the same upsert to `deleting` as the request (idempotent).
  2. `markVaultDeleting`: `env.VAULT.get(env.VAULT.idFromName(userId), { locationHint: 'apac' }).markDeleting(userId)`.
  3. `purgeObjects`: `purgeVaultObjects(env.OBJECTS, env.VAULT.idFromName(userId).toString())`.
  4. `eraseVault`: that vault's `erase()`.
  5. `deleteSignInRecords`: first the registry in `ERASURE_DB`, `INSERT INTO erasure_registry (subject_hash, recorded_at, expires_at) VALUES (?1, ?2, ?3) ON CONFLICT (subject_hash) DO UPDATE SET expires_at = max(expires_at, excluded.expires_at)` with `subjectHash(ERASURE_KEY, userId)` and `now + ERASURE_KEEP_MS`; only after it resolves, one `AUTH_DB.batch`: `DELETE FROM session WHERE userId = ?1`, `DELETE FROM account WHERE userId = ?1`, `DELETE FROM passkey WHERE userId = ?1`, `DELETE FROM verification WHERE identifier = ?1` with `'sign-in-otp-' + email` (Better Auth 1.6.33's identifier, `toOTPIdentifier`), `DELETE FROM email_code_sends WHERE address_hash = ?1` with `addressHash(BETTER_AUTH_SECRET, email)`, `DELETE FROM "user" WHERE id = ?1`, and the upsert of `account_status` to `deleted`. `email` is the request row's (K17, K21).
  6. `delete-analytics-person`: `deletionHooks.deleteAnalyticsPerson(env, userId)` (a no-op here; 1D-T13).
  7. `sendDeletionEmail`: when the row still has `email`, `mailer.sendDeletionNotice({ to: email, locale, reference: requestId })` (default `mailerFromEnv(env)`; Resend gets `Idempotency-Key: <requestId>`), then `UPDATE deletion_requests SET email = NULL WHERE request_id = ?` (K18).
  8. `finalSweep`, one hour later (M12): `purgeVaultObjects` again (an object a publisher wrote late), `erase()` again (idempotent, 1B-T2), then `UPDATE deletion_requests SET status = 'completed', completed_at = ?2, user_id = NULL, session_id = NULL, email = NULL WHERE request_id = ?1`, then `DELETE FROM deletion_requests WHERE status = 'completed' AND requested_at < ?` (now less `ERASURE_KEEP_MS`) and, in `ERASURE_DB`, `DELETE FROM erasure_registry WHERE expires_at <= ?` (now) (M11).
  A step that exhausts its retries (about eight and a half hours, inside the 24-hour target) leaves the instance `errored`, the request `accepted` and the account `deleting`; the receipt records the outcome for the owner to act on.
- `markDeleting` (RPC): in one `transactionSync`, an erased vault, a vault with no account row (nothing to protect; it creates none, C17) or a `deleted` row does nothing; `accountRowFor` refuses another owner; otherwise `UPDATE account_state SET status = 'deleting' WHERE id = 1`. Then `await this.ctx.storage.deleteAlarm()`. 1A's `assertSession` then refuses every call with 403.
- The deletion email (`deletionEmail`): Thai or English by `locale`, saying the account and its records are deleted and that backups age out within 30 days (§6.12 step 7). Both languages are `// DRAFT`, listed in the receipt for the owner's review before the beta (no board shows them). `transportMailer` renders it; `localCodeLog` writes `JSON.stringify({ event: LOCAL_DELETION_LOG_EVENT, reference, locale })`. `check-dist.mjs` fails on `jotbun-local-deletion-email` too.
- `wrangler.jsonc` gains `{ "name": "jotbun-deletion", "binding": "DELETION_WORKFLOW", "class_name": "DeletionWorkflow", "default_retention": { "success_retention": "1 day", "error_retention": "30 days" } }` in `workflows`.

- [ ] **Step 1: Stub, then write the failing tests.** First the typed stubs (R52): the migration file with no statements, both handlers answering 501, every step function resolving without doing anything (counts 0), `runDeletion` resolving at once, `markDeleting` resolving, `deletionEmail` returning empty strings, and the two routes registered. Then, in `deletion.test.ts` (`const t = testAuth({ vault: vaultSessionControl(env) })`, `const v1 = await startAuthV1()`, `const d = deletionClient(t, v1)`; every Workflow case opens `deletionInstance` before its request and applies `disableSleeps()` and `disableRetryDelays()` unless it says otherwise):
  - `a fresh sign-in deletes the account, and every step runs`: `personWithData`, then a request answers 202; the instance reaches `complete`; `account_status` is `deleted`; no `user`, `session`, `account` or `verification` row names the person; `GET /v1/me` with a token minted before the deletion answers 403 `ACCOUNT_UNAVAILABLE`; the vault holds only the `deleted` marker; no R2 object is left under its prefixes; `ERASURE_DB` holds `subjectHash(ERASURE_KEY, userId)`; the request row is `completed` with `user_id`, `session_id` and `email` null.
  - `the request answers 202 with its request id, and the account is deleting at once`: with `mockStepError({ name: 'mark-account-deleting' }, new Error('held'))` on every attempt, the body is `{ request_id: deletionRequestId(userId, key), status: 'accepted' }` and `account_status` is `deleting`.
  - `a sign-in older than five minutes is 401 REAUTH_REQUIRED, and nothing is recorded`: after `vi.setSystemTime(Date.now() + 301_000)` and a new token from the same session, 401 `REAUTH_REQUIRED`; no request row; no status row.
  - `a resent request replays 202, even 400 seconds later` (R45): the first request's token, key and body sent again after `vi.setSystemTime(Date.now() + 400_000)` answer 202 with the same body; one request row; one instance.
  - `a device whose session was signed out cannot delete the account` (R42, Review Focus 5): sessions A and B; B signs A out (`POST /api/auth/jotbun/devices/sign-out`); A's still-valid fresh token then asks for deletion: 401 `SESSION_REQUIRED`; no request row; no status row.
  - `a request whose Workflow could not start answers 503, and the resend starts it`: through `handleVaultV1(request, { ...env, DELETION_WORKFLOW: flaky })`, where `flaky.create` throws once, the first send answers 503 `SERVICE_UNAVAILABLE` and the resend answers 202, with `create` called twice.
  - `another request while one is open is refused`: after a first 202 (held as above), a new key answers 403 `ACCOUNT_UNAVAILABLE`.
  - `the body keeps today's contract: a proof id that is not a UUID is 422`: `{ proof_id: 'nope' }` answers 422 `VALIDATION_FAILED` on `proof_id`.
  - `the body keeps today's contract: no new fields`: `{ proof_id, locale: 'en' }` answers 422 `VALIDATION_FAILED`.
  - `the key must be a UUID`: `idempotency-key: nope` answers 422 `VALIDATION_FAILED` on `idempotency_key`.
  - `the receipt answers the requesting device with its own token and client`: held as above, `receipt(me, key)` answers 200 `{ request_id, status: 'accepted' }` with `cache-control: no-store`.
  - `the receipt is 404 for the same account's other device`: session B of the same person answers 404 `NOT_FOUND`.
  - `the receipt is 404 for another client header` (M21): the same token with `client: 'android/1.0.0'` answers 404 `NOT_FOUND`.
  - `the receipt still answers after the session is gone`: with sleeps left on (the one-hour sleep holds the final sweep back), after `waitForStepResult({ name: 'send-deletion-email' })`, the original token's receipt answers 200.
  - `the receipt is token only`: without a client header 426 `CLIENT_UPGRADE_REQUIRED`.
  - `the deletion email goes once, in the request's language, and its address is forgotten`: with `language: 'en-US,en;q=0.9'` and `console.log` spied, exactly one line parses to `{ event: 'jotbun-local-deletion-email', reference: requestId, locale: 'en' }`; no log line contains the email or the user id; after `send-deletion-email` the row's `email` is null.
  - `the deletion email is Thai unless the request asks for English`: `deletionLocale(undefined)`, `deletionLocale('th-TH')` and `deletionLocale('fr')` are all `'th'`.
  - `no step result holds the user id or the email` (M11): for each name in `DELETION_STEPS`, `JSON.stringify(await instance.waitForStepResult({ name }) ?? null)` contains neither.
  - `the steps run in the spec's order, and the final sweep waits one hour` (M12): `runDeletion(env, requestId, recordingStep)`, with a fake `WorkflowStep` that records each `do` name and runs it and records each `sleep` with its duration, records the first seven `DELETION_STEPS`, then `['sleep', 'wait-for-publishers', '1 hour']`, then `final-sweep`.
  - `the final sweep removes an object written late and forgets the person`: with the request row as step 7 leaves it and one object put under the vault's `export/` prefix, `finalSweep` deletes it and leaves the row `completed` with `user_id`, `session_id` and `email` null; a completed row requested 61 days ago and an expired registry row are gone.
  - `when the registry cannot be written, the sign-in records stay` (K21): `deleteSignInRecords` with an `ERASURE_DB` whose `prepare` throws rejects, and the person's `user` and `session` rows remain.
  - `a restored sign-in database still cannot sign the erased person in` (K21): after a completed deletion, re-insert the old `user` row with its id and email (as a backup restore would); `requestCode(email)` and a sign-in with that code answer 403 `ACCOUNT_UNAVAILABLE`.
  - `marking a never-used vault deleting creates nothing` (C17): `markDeleting(userId)` on a fresh vault leaves `account_state` empty.
  - `marking a vault deleting refuses its calls and cancels its alarm`: on a used vault with an alarm set, after `markDeleting`, `GET /v1/me` through 1A's `startV1` client answers 403 `ACCOUNT_UNAVAILABLE` and `getAlarm()` is null.
  Pinned tests: `c1-shape.test.ts`'s workflow list becomes `['DELETION_WORKFLOW', 'EXPORT_WORKFLOW', 'SNAPSHOT_WORKFLOW']` and its `src/server.ts` check also matches `DeletionWorkflow`; `route-coverage.test.ts` expects `VAULT_DEFERRED_ROUTES` to equal `[]`; the coverage case of Task 10a expects exactly the two deletion routes to skip the gate; `schema.test.ts` expects `deletion_requests` among `AUTH_DB`'s tables (R48).
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/deletion.test.ts test/workers/auth/schema.test.ts` and `npm run test:edge -- test/c1-shape.test.ts test/route-coverage.test.ts`. Record the counts.
- [ ] **Step 3: Write `0003_deletion.sql`** as above, and add `deletion_requests` to the schema test's list.
- [ ] **Step 4: Implement** the handlers, the routes, `token_only`, the steps, the Workflow, `markDeleting`, the email, the second dist marker and the bindings and exports.
- [ ] **Step 5: Run them and see them pass.** Then `npm run build:edge` (both markers absent from `dist/`).
- [ ] **Step 6: Mutation check.**
  - Drop the session `EXISTS` from the batch: the signed-out-device case fails.
  - Check freshness before the replay lookup: the 400-second case fails.
  - Write the registry after the `AUTH_DB` batch: the registry case fails (the records are gone).
  - Return the subject from a step: the step-result case fails.
  - Skip nulling the email: the email case fails.
  - Leave out the client in the receipt's query: the other-client case fails.
- [ ] **Step 7: Gate, receipt, commit.** Commit: `git commit -m "Delete accounts on DeletionWorkflow: a live, fresh session asks, the vault and its files are erased, the sign-in records go after the erasure registry, and the device can read its receipt"`.

---

### Task 12: The 1C proof against the local Worker, and the docs

**Starts after:** 1C-T3, 1C-T6, 1C-T9, 1C-T10b, 1C-T11. The phone checks are SKIPPED, default pending owner Q6.

**Files:**
- Create: `apps/edge/scripts/auth-proof.mjs`
- Modify: `apps/edge/scripts/dev.mjs` (the auth settings and the local D1 migrations), `apps/edge/README.md`, `docs/implementation/premium-progress.md` (the closing 1C receipt)

**Interfaces:**
- Consumes: `scripts/dev.mjs` as 1B-T13 leaves it (it writes `.dev.vars`, then runs `vite dev` on `http://127.0.0.1:8092`); the local code log and `LOCAL_DELETION_LOG_EVENT` (Tasks 2 and 11); every route of Tasks 1 to 11. 1D-T12's `scripts/local-auth.mjs` may later import the proof's helpers.
- Produces:
  - `dev.mjs` writes these into `.dev.vars` besides 1B-T13's: `JOTBUN_ENV="local"`, `AUTH_BASE_URL` and `AUTH_ISSUER` (`"http://127.0.0.1:8092"`), `AUTH_AUDIENCE` (`"jotbun-v1"`), `AUTH_TRUSTED_ORIGINS` (`"gogospend://,exp://**"`: the Expo development origins live only here, M4), `BETTER_AUTH_SECRET` and `ERASURE_KEY`, and it keeps writing a `COMMAND_DIGEST_KEY` of at least 32 characters, without which `/v1/me` answers 503 (R53). It reads an existing `.dev.vars` first and keeps its `BETTER_AUTH_SECRET` and `ERASURE_KEY`: Better Auth encrypts its signing keys with the secret, and the local D1 keeps them between runs. New values are `randomBytes(32).toString('base64url')`. Before `vite dev` it runs `npx wrangler d1 migrations apply jotbun-auth --local` and `npx wrangler d1 migrations apply jotbun-erasure --local` (local state only, never `--remote`).
  - `auth-proof.mjs` (run from `apps/edge` with `node scripts/auth-proof.mjs`): spawns `node scripts/dev.mjs`, waits for `GET http://127.0.0.1:8092/live` to answer 200 (at most 120 seconds), reads the sign-in codes and deletion references from the child's output lines, runs the checks below with `origin: http://127.0.0.1:8092` on every request, prints one line per check (`PASS <name>`, `FAIL <name>: <status> <code>` or `SKIPPED <name>: <reason>`), stops the child, and exits 1 on any FAIL. It never prints a code, a token or a cookie.
- Checks, in order:
  1. `an email code signs a new person up`: a code request answers 200; the sign-in with the logged code answers 200 with `created: true` (K23).
  2. `the session's JWT opens the person's vault`: `GET /api/auth/token`, then `GET /v1/me` with `x-gogospend-client: ios/1.0.0`, answers 200.
  3. `a second code signs into the same person`: 200 with `created: false` and the same user id from `GET /api/auth/get-session`.
  4. `the devices list shows both, and signing one out stops its JWT at once`: the list from the first session holds two devices; signing the second out answers 204; the second session's token then answers 401 `SESSION_REQUIRED` on `/v1/me`.
  5. `sign out everywhere stops every JWT`: from the first session (still fresh) 204; its token then answers 401 `SESSION_REQUIRED`.
  6. `a fresh sign-in deletes the account, and the device reads its receipt`: a new sign-in and token; `POST /v1/me/deletion` with `{ proof_id: <random UUID> }`, an `Idempotency-Key` and `Accept-Language: en` answers 202; the receipt answers 200 `accepted`; within 120 seconds the output holds one `jotbun-local-deletion-email` line with this request id and `locale: 'en'`; the pre-deletion token then answers 403 `ACCOUNT_UNAVAILABLE` on `/v1/me`.
  7. `the same address can open a new account afterwards`: a new code sign-in answers 200 with `created: true` and a different user id.
  SKIPPED: `Apple and Google sign-in on a phone` (D33, default pending owner Q6), `real email through Email Service and Resend` (Q4, Q6), `the final sweep one hour later` (Task 11's tests prove it), `the app on a phone against this Worker` (Q6).

- [ ] **Step 1: Write `auth-proof.mjs` and the `dev.mjs` changes.**
- [ ] **Step 2: Run the proof.** Run: `node scripts/auth-proof.mjs` from `apps/edge`. Expected: checks 1 to 7 PASS and the four SKIPPED lines. Copy the output into the receipt.
- [ ] **Step 3: Mutation check.** Make the device sign-out skip its vault call (Task 4's handler), run the proof: check 4 fails. Revert.
- [ ] **Step 4: Docs.** `apps/edge/README.md` gains an "Accounts" section: Better Auth at `/api/auth/*` on `AUTH_DB`, the erasure registry in `ERASURE_DB` (both created by the owner with the `apac` hint, Q6), the secrets `BETTER_AUTH_SECRET`, `ERASURE_KEY`, `RESEND_API_KEY` and `APPLE_CLIENT_SECRET`, the vars of Tasks 1 to 3, the local code log (local and test builds only, K12), the deletion Workflow and its one-hour sweep, and how to run the proof. The Tests table gains the 1C test files.
- [ ] **Step 5: Gate, receipt, commit.** Run the edge gate and the app gate. Write the closing 1C receipt: the rulings applied (R42 to R57), the calls K1 to K23, the owner defaults used (Q1 to Q7), every SKIPPED item, the mutants, and any Better Auth status pinned under M16. Commit: `git commit -m "Prove Better Auth sign-in, devices, sign-out everywhere and deletion against the local Worker"`.

---

### Task 13: Apple token revocation on deletion (default pending owner Q5)

**Starts after:** 1C-T7, 1C-T11. Default pending owner Q5: yes, before the beta, keeping Apple's `authorizationCode` at sign-in.

**Files:**
- Create: `apps/edge/src/auth/apple-tokens.ts`, `apps/edge/test/workers/apple-revocation.test.ts`
- Modify: `apps/edge/src/auth/account-plugin.ts` (the code route), `src/auth/create-auth.ts` (`AuthDeps.appleFetch?: typeof fetch`, passed to the plugin), `src/deletion/steps.ts`, `src/deletion/workflow.ts`, `test/workers/deletion.test.ts` (the order case), `apps/app/src/auth/betterAuthPort.ts`, `apps/app/src/auth/betterAuthClient.ts`, `apps/app/src/auth/jotbunAccountClient.ts`, `apps/app/src/auth/testing/fakeAuthServer.ts`, `apps/app/src/auth/betterAuthPort.test.ts`

**Interfaces:**
- Consumes: `jotbunAccount`, `AuthDeps` (Tasks 1, 4); `TEST_PROVIDER_HOOKS`, `signInSocial` (Task 3); `NativeIdToken.authorizationCode`, `BetterAuthClientLike`, `createFakeAuthServer` (Task 5); Apple's `authorizationCode` from `createNativeSignIn` (Task 7); `runDeletion`, `DELETION_STEPS`, `STEP_CONFIG`, `DeletionSubject`, `deletionInstance` (Task 11).
- Produces:
  ```ts
  // src/auth/apple-tokens.ts
  export const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token'
  export const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke'
  export class AppleRefused extends Error {}       // Apple answered 4xx
  export class AppleUnavailable extends Error {}   // unreachable, or 5xx
  export function exchangeAppleCode(o: { clientId: string; clientSecret: string; code: string; fetchImpl?: typeof fetch }): Promise<string>   // the refresh_token
  export function revokeAppleToken(o: { clientId: string; clientSecret: string; refreshToken: string; fetchImpl?: typeof fetch }): Promise<void>
  // src/auth/account-plugin.ts: POST /jotbun/apple/authorization-code { code } → 204
  // src/deletion/steps.ts
  export function revokeAppleSignIn(env: DeletionEnv, s: DeletionSubject, fetchImpl?: typeof fetch): Promise<void>
  // src/deletion/workflow.ts: DELETION_STEPS gains 'revoke-apple-token' between 'erase-vault' and 'delete-sign-in-records'
  // apps/app: BetterAuthClientLike gains appleAuthorizationCode(code: string): Promise<ClientResult<unknown>>   // POST /jotbun/apple/authorization-code
  ```
- Apple's REST API (developer.apple.com, Sign in with Apple REST API: "Generate and validate tokens" and "Revoke tokens"): both calls post `application/x-www-form-urlencoded`. The exchange sends `client_id`, `client_secret`, `code` and `grant_type=authorization_code` and reads `refresh_token` from the JSON answer; the revocation sends `client_id`, `client_secret`, `token` and `token_type_hint=refresh_token` and expects 200. `client_id` is `APPLE_BUNDLE_ID`; `client_secret` is `APPLE_CLIENT_SECRET`, the signed JWT the owner generates (D33, SKIPPED until it exists).
- The route (`sessionMiddleware`): 404 `NOT_FOUND` unless the caller has an `account` row with `providerId = 'apple'`; 503 without `APPLE_BUNDLE_ID` or `APPLE_CLIENT_SECRET`; `AppleRefused` → 400 `{ code: 'APPLE_CODE_REFUSED' }`; `AppleUnavailable` → 503; success → `UPDATE account SET refreshToken = ?1, updatedAt = ?2 WHERE userId = ?3 AND providerId = 'apple'` (ISO `updatedAt`, M7), then 204. The token is never logged or returned.
- The deletion step reads `SELECT refreshToken FROM account WHERE userId = ? AND providerId = 'apple'` and, when there is one and the Apple settings exist, calls `revokeAppleToken`; it runs before `delete-sign-in-records`, which deletes that row. In `runDeletion` it sits inside `try`/`catch`: once its retries are spent, the failure logs `apple_token_revocation_failed` (the event name only) and the deletion goes on, because the account must still be erased (Cloudflare Workflows docs, sleeping-and-retrying, "Catch Workflow errors"). If 1D-T13 has landed, its `retry-analytics-person` entry stays, and every test that lists `DELETION_STEPS` is updated in this commit.
- The app: after a successful `signIn` or `freshSignIn` by Apple whose `NativeIdToken` carries `authorizationCode`, the port calls `client.appleAuthorizationCode(code)` once, without awaiting its outcome for the sign-in's result; a failure is logged with `failureName` and ignored. Apple's codes are single-use and short-lived, so it is sent at once. The fake server records `appleAuthorizationCode:<code>` and answers 204, or 503 while `state.appleCodeFails` is true.

- [ ] **Step 1: Stub, then write the failing tests.** First the typed stubs (R52): both Apple functions reject with `AppleUnavailable`, the route answers 501, `revokeAppleSignIn` resolves without calling anything. Then:
  `apple-revocation.test.ts`, with `testAuth({ providerHooks: TEST_PROVIDER_HOOKS, appleFetch: recorder }, { APPLE_CLIENT_SECRET: 'test-apple-client-secret' })`:
  - `an Apple sign-in's authorization code is exchanged and kept on its Apple account`: with the recorder answering 200 `{ refresh_token: 'r-1', access_token: 'a-1', token_type: 'bearer', expires_in: 3600 }`, the route answers 204, the Apple row's `refreshToken` is `r-1`, and the recorder saw one form post to `APPLE_TOKEN_URL` whose fields are exactly `client_id`, `client_secret`, `code` and `grant_type`.
  - `a person without an Apple account cannot store a code`: an email-only person gets 404 `NOT_FOUND`.
  - `Apple refusing the code is 400 and keeps nothing`: the recorder answers 400 `{ error: 'invalid_grant' }`; the route answers 400 `APPLE_CODE_REFUSED`; `refreshToken` stays null.
  - `deletion revokes the Apple token while its account row still exists`: `revokeAppleSignIn(env, subject, recorder)`; the recorder, when called, finds the row; it saw one form post to `APPLE_REVOKE_URL` with `token=r-1` and `token_type_hint=refresh_token`.
  - `a lasting Apple failure still finishes the deletion`: with `mockStepError({ name: 'revoke-apple-token' }, new Error('apple down'))` on every attempt, `disableRetryDelays()` and `disableSleeps()`, the instance reaches `complete`, one log line holds `apple_token_revocation_failed`, and the request row is `completed`.
  - `without the Apple settings the step calls nothing`: with no `APPLE_CLIENT_SECRET`, the recorder is never called.
  `deletion.test.ts`: the order case lists `revoke-apple-token` after `erase-vault`.
  `betterAuthPort.test.ts`: `an Apple sign-in sends its authorization code once` (`calls` holds `appleAuthorizationCode:c-1` once) and `a failed code send does not fail the sign-in` (with `state.appleCodeFails`, the sign-in still resolves its session).
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/apple-revocation.test.ts test/workers/deletion.test.ts` and `npm run test:unit -w gogospend-app -- src/auth/betterAuthPort.test.ts`. Record the counts.
- [ ] **Step 3: Implement** the Apple calls, the route, the step and its place in `runDeletion`, and the app's send.
- [ ] **Step 4: Run them and see them pass.** Then both gates.
- [ ] **Step 5: Mutation check.**
  - Run the revocation after `delete-sign-in-records`: the row-still-exists case fails.
  - Let a revocation failure end the Workflow: the lasting-failure case fails.
  - Await the code send and rethrow its failure: the app's failed-send case fails.
- [ ] **Step 6: Device check (SKIPPED until D33):** with the owner's Apple key, an Apple sign-in on a development build stores a refresh token, and a deletion revokes it (Apple ID settings no longer list Jotbun).
- [ ] **Step 7: Gate, receipt, commit.** Commit: `git commit -m "Keep Apple's refresh token at sign-in and revoke it when the account is deleted"`.

---

## Self-review notes (for the executor)

- **Rulings applied** (review of 25 October, `review-1c.md`):
  - R42 (live session before deletion): Task 11's batch `EXISTS`, the signed-out-device test and its mutant.
  - R43 (fresh linking, unlinking on): K22; Task 3 (the link hook, the unlink and last-account tests); Task 5 (`linkMethod`, `unlinkMethod`, `REAUTH_REQUIRED`); Task 8 (each preceded by the fresh sign-in).
  - R44 (revocation): Task 4 (`signOutEverywhere` gets every session id); Task 10a (`REVOCATION_KEEP_SECONDS`, `revokeSessionIds`, both RPCs, 1A's `revokeSession` fixed, the clock-tolerance and 930-second tests); Global Constraints.
  - R45 (replay first): Task 11's order, `createOnce` only while `accepted`, the 400-second test.
  - R46 (bodies unchanged): Task 6 (`{ proof_id }` and `{ proof_id, from, through }`, `Accept-Language`); Task 11 (recorded, not verified; locale from the header).
  - R47 (email-otp surface): Task 1 (the type refusal before lookup, `DISABLED_EMAIL_OTP_PATHS`, the known and unknown address test, `backgroundTasks` unset).
  - R48 (1B-T13's end state): Task 11 (both exports, `c1-shape` and `route-coverage`, Worker routes with `token_only`, `VaultBucket` and `purgeVaultObjects` with the vault id, `createOnce` and the shims, `deletion_requests` in the schema test).
  - R49 (the gate): Task 10a (after the token, vault and Worker routes alike, the Worker-route test); Task 11 (only the two deletion routes skip it).
  - R50 (the verifier): Task 10a (`verifierFor` in `src/v1/auth-verifier.ts`, cached, 503 on settings, the 30-second cooldown, the `SELF` test); Task 10b (`/ready`, `src/vault-worker.ts`).
  - R51 (split): Tasks 10a and 10b; their tests use `testAuth({ vault: vaultSessionControl(env) })`.
  - R52 (behavioural REDs): Global Constraints, and Step 1 of every task with code.
  - R53: Task 5 (`AuthRefused` fields); Task 12 (`COMMAND_DIGEST_KEY`).
  - R54 (methods named): K19; Task 3 (`methodsForEmail`); Task 5 (`AuthRefused.methods`, `SignInResult.methods`); Task 8 (the account-exists screen).
  - R55 (reminder after sign-in): K16; Task 8 (`ReminderQuestionScreen`, `afterStory`); Task 9 (`/onboarding/reminder`).
  - R56 (`ERASURE_DB`): K21; Tasks 1, 4, 10a and 11.
  - R57 (JSON id lists): Global Constraints; Task 4 (the device delete); Task 10a (`revokeSessionIds` and its 150-id test).
  - Minor findings: M3, M6, M15 and M17 in Task 1; M4 in Task 1 and Task 12; M5 in Task 2; M7 in Global Constraints and Tasks 4, 11 and 13; M8 and M20 in Tasks 5 and 6; M9 in Task 9; M10, M11, M12 and M21 in Task 11; M13 in K19 and Tasks 3 and 7; M14 in K9; M16 in Global Constraints; M18 in Task 7; M19 in Shared files.
  - The controller's cross-plan request for 1D-T14: K23; Task 1 (`createdDuring` in `handleAuthRequest`); Task 3 (the social cases); Task 5 (`ServerSession.created`, `SignInResult.created`).
- **Names other plans use:** 1D-T12 imports `verifierFor` from `src/v1/auth-verifier.ts`, and calls the RPCs as Task 10a defines them: `revokeSessions(accountId, sessionIds)` and `signOutEverywhere(accountId, sessionIds, notBefore)` (the vault computes `expires_at` itself, R44), plus Task 11's `markDeleting(accountId)`. 1D-T13 fills `deletionHooks.deleteAnalyticsPerson(env, userId)` and reuses `DELETION_STEPS`, `STEP_CONFIG`, `DeletionEnv`, `runDeletion` and `test/workers/support/deletion.ts`. 1D-T14 reads `ServerSession.created` (or `SignInResult.created`).
- **Not in 1C:** the app's passkey offer (Q3); Apple sign-in on Android (Q7); real email delivery and every phone check (Q4, Q6); the PostHog person deletion (1D-T13); live sockets (1D); the break-glass support tool (§6.11, before the beta).
- **Risks:**
  - `created` compares Better Auth's `createdAt` with the request's arrival. Two sign-ups racing for one new Apple or Google account could both say `created`; it feeds analytics only.
  - The `ACCOUNT_EXISTS` rewrite depends on Better Auth's 401 `OAUTH_LINK_ERROR` answer; Task 3's tests pin it, so an upgrade that changes it fails there first.
  - Before 1B-T13 the HTTP Worker has no `VAULT` binding, so its device sign-out answers 503 (`unwiredVaultControl`); nothing is deployed before Task 10b.
  - The test config and the Worker configs declare `AUTH_DB` and `ERASURE_DB` more than once until 1B-T13 merges them; keep one declaration then.
  - A deletion step that exhausts its retries leaves the account `deleting` and the request `accepted`; the owner acts from the Workflow's error.
  - Task 13 and 1D-T13 both edit `DELETION_STEPS`; whichever lands second keeps both entries.
