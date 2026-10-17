# Auth0 native proof (F5)

**Status: SKIPPED.** These need the approved non-production Auth0 tenant, native app, API and connections (E1), plus the confirmed iOS bundle identifier and callback domain on development builds and devices (E2):
- the native SDK and its config plugin;
- iOS and Android development builds;
- PKCE callback and logout;
- nonce injection;
- refresh rotation;
- cold start;
- device-protected credential storage.

None of these were available. F5 is not complete, and the F4 challenge/proof contract stays provisional until the native bootstrap spike runs.

## What exists locally

- **Session state machine** (`apps/app/src/auth/sessionMachine.ts`):
  - States: `signed_out`, `hydrating`, `authenticating`, `bootstrap_pending`, `active`, `locked` and `reauth_required`.
  - The installation-local epoch moves exactly when the identity (account or binding) changes, and on every sign-out (even one that interrupts a sign-in). It never moves on a token refresh, a lock or a server-ended session.
  - The epoch is persisted (`sessionStore.ts`, reserved 64 at a time), so it never goes backwards across launches.
  - Hydrating and authenticating carry no account, so a previous account's data is never shown. Only a signed-out session hydrates; hydrate on an active session is refused and changes nothing.
  - `reauth_required` and `locked` keep the identity and the epoch. The shared seam exposes the binding only while `active`.
- **Credential provider** (`credentialProvider.ts`):
  - **Tokens:** reads and forced refreshes are serialized (one SDK call however many callers). A read never hands out a token from before a refresh, and a read during a refresh waits for it.
  - **Denial or outage:** a denied refresh locks the session and keeps the binding (drafts survive). Auth0 being unreachable is not a denial: nothing locks, and v1 requests fail as `network`. A lock lifts through `hydrate()` or a refresh once the credentials work again, with the same epoch.
  - **Sign-in:**
    - The order is Universal Login, then a `bootstrap` challenge, then a fresh login (`max_age=0`) whose ID token carries the challenge nonce, then `/v1/auth/bootstrap`.
    - The challenge and bootstrap carry the new login's own access token. That login stays pending and is stored (binding first, then the SDK credentials) only after the server accepts it. If storing fails, the previous binding goes back and the new binding is revoked.
    - From an existing session (an account switch, or after a lock or a server-ended session), sign-in runs beside it. A cancelled or failed attempt leaves that session, its epoch and its credentials as they were.
    - `REAUTH_REQUIRED` from bootstrap is its own outcome.
  - **Serialized flows:** hydrate, sign-in and sign-out run one at a time. A second sign-in joins the first. A sign-out wins at once over a running sign-in or hydration: a late bootstrap result is not stored, and its binding is revoked.
  - **Sign-out:**
    - Moves the epoch at once.
    - Lets a running store write or forced refresh finish.
    - Revokes the session's and the stored binding with the SDK's own token, also from `locked`.
    - Then clears the SDK and the stored binding. If the binding store can't be cleared, the session is still signed out and the error is reported.
  - **Server-ended sessions:** the transport reports `SESSION_REQUIRED` or `REAUTH_REQUIRED` (bound routes) and `ACCOUNT_UNAVAILABLE`, with the epoch the request was sent under.
    - The first two move the session to `reauth_required`; the account and its drafts stay.
    - `ACCOUNT_UNAVAILABLE` signs out locally.
    - A report from an earlier epoch is ignored.
- **Binding store** (`sessionStore.ts`): SecureStore, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Only an exact `{accountId, binding}` with the server's 43-character binding is read or written.
- **Purpose proofs** (`reauthentication.ts`): export, link, global logout and deletion. Each is a challenge for the purpose and command, then a fresh login (`max_age=0`) with the nonce, then `/v1/auth/proofs`. The login is never stored, so the session's own credentials are untouched. `bootstrap` is refused.
- **Transport** (`api/client.ts`):
  - A 401 `UNAUTHENTICATED` allows one resend of the same body and Idempotency-Key. It uses the token another request already renewed, or one serialized refresh, and never runs after the epoch moved.
  - 426 and other refusals (`REAUTH_REQUIRED`, `ACCOUNT_UNAVAILABLE`) never trigger a refresh. A refused purpose proof (`proof: true`) is not a server-ended session.
  - Token-only routes (challenge, bootstrap, proof) send no binding. A request can carry its own credentials (a pending sign-in, or a binding being revoked); those are never refreshed or reported.
  - Every request already carries `X-GoGoSpend-Client`, and a response that arrives after the epoch moved is dropped.
- **Adapters:**
  - `auth0Client.ts` (native) and `auth0Client.web.ts` are interchangeable platform modules with the same exports (`createAuth0Port`, `AuthCancelled`, `AuthUnavailable`). Shared types live in `auth0Port.ts`.
  - The native adapter maps the SDK's shape (`webAuth.authorize`, `credentialsManager.*`, forced refresh) onto the port:
    - cancellations become `AuthCancelled`;
    - network or timeout failures become `AuthUnavailable`;
    - anything else is a denial.
  - The web adapter, or a native build without an SDK, reports real sign-in unsupported.
  - No SDK is installed yet. `EXPO_PUBLIC_AUTH0_*` stay empty, so the app stays signed out.
  - An installed provider replaces the legacy session seam (`installCredentialProvider`, which unsubscribes a replaced provider). The legacy seam's callers keep working until they move.

## Procedure (once E1/E2 are approved)

1. Confirm the iOS bundle identifier, keep the intended Android identifier, and select the owned callback domain. Create or confirm the tenant's native application, API audience and connections. Record which credentials go where. Never put an M2M secret in the app.
2. Install the reviewed SDK version and its config plugin, and set `EXPO_PUBLIC_AUTH0_*`. Install the provider at the root:
   - `createCredentialProvider` with `createAuth0Port(sdk, audience)`;
   - `createSecureBindingStore` and `createSecureEpochStore` (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`);
   - `createAuthApi`.

   Call `hydrate()` at launch and on return to the foreground (it lifts a lock once the credentials work).
3. When wiring, check these against the installed SDK version:
   - **`max_age=0`:** the native SDK bridge may drop a typed `maxAge` of 0. The port therefore sends a fresh login's `max_age` and `prompt=login` as explicit `additionalParameters`, not as the typed field. Confirm the authorize URL carries both, exactly once, for the bootstrap login and for a purpose proof. Then confirm the ID token's `auth_time` is fresh.
   - **Error classification:** the Credentials Manager's error codes and messages for offline, timeout, `invalid_grant` and missing credentials. The adapter treats only network or timeout failures as unreachable.
   - **Pending credentials:** `webAuth.authorize` must not store credentials by itself, so a cancelled, refused or purpose-proof login never replaces the session's.
4. Run `npm run ios -w gogospend-app` and `npm run android -w gogospend-app` against the tenant. Prove:
   - the PKCE callback and logout;
   - the state and nonce in the ID token, and server challenge verification;
   - refresh rotation;
   - cold start into the same internal account;
   - credentials kept in device-protected storage;
   - offline launch and offline token reads staying signed in.
5. Run the first-bootstrap flow exactly as F4's spike settles it, and re-measure its prompts and cancellation on a production-shaped build.
6. Record platform, build and SDK versions, target metadata, results and redacted screenshots here. No tokens in screenshots or logs.

## Results

| Build | Check | Result |
| --- | --- | --- |
| iOS development build | all of the above | SKIPPED (no tenant or SDK approval) |
| Android development build | all of the above | SKIPPED (no tenant or SDK approval) |
