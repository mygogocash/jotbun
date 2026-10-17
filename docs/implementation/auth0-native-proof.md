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
  - The installation-local epoch moves exactly when the identity (account or binding) changes, never on a token refresh.
  - Hydrating and authenticating carry no account, so a previous account's data is never shown.
- **Credential provider** (`credentialProvider.ts`):
  - Token reads and forced refreshes are serialized: one SDK call however many callers.
  - A failed refresh locks the session and keeps the binding (drafts survive). A cancelled sign-in keeps everything stored.
  - Sign-in is Universal Login, then a `bootstrap` challenge, then an ID token carrying the challenge nonce, then `/v1/auth/bootstrap`, then the binding saved in the binding store.
  - Sign-out revokes the device's binding, clears the SDK and the stored binding, and moves the epoch.
- **Purpose proofs** (`reauthentication.ts`): export, link, global logout and deletion. Each is a challenge for the purpose and command, then a fresh login (`max_age=0`) with the nonce, then `/v1/auth/proofs`.
- **Transport** (`api/client.ts`):
  - A 401 `UNAUTHENTICATED` allows one serialized refresh and one resend of the same body and Idempotency-Key.
  - 426 and other refusals (`REAUTH_REQUIRED`, `ACCOUNT_UNAVAILABLE`) never trigger a refresh.
  - Token-only routes (challenge, bootstrap, proof) send no binding.
  - Every request already carries `X-GoGoSpend-Client`, and a response that arrives after the epoch moved is dropped.
- **Adapters:**
  - `auth0Client.ts` maps the native SDK's shape (`webAuth.authorize`, `credentialsManager.*`, forced refresh) onto the port. Cancellations become `AuthCancelled`.
  - `auth0Client.web.ts` reports real sign-in unsupported.
  - No SDK is installed yet. `EXPO_PUBLIC_AUTH0_*` stay empty, so the app stays signed out. An installed provider replaces the legacy session seam (`installCredentialProvider`), whose callers keep working until they move.

## Procedure (once E1/E2 are approved)

1. Confirm the iOS bundle identifier, keep the intended Android identifier, and select the owned callback domain. Create or confirm the tenant's native application, API audience and connections. Record which credentials go where. Never put an M2M secret in the app.
2. Install the reviewed SDK version and its config plugin, set `EXPO_PUBLIC_AUTH0_*`, and install the provider at the root (`createCredentialProvider` with `createAuth0Port`, a SecureStore binding store, and `createAuthApi`).
3. Run `npm run ios -w gogospend-app` and `npm run android -w gogospend-app` against the tenant. Prove:
   - the PKCE callback and logout;
   - the state and nonce in the ID token, and server challenge verification;
   - refresh rotation;
   - cold start into the same internal account;
   - credentials kept in device-protected storage.
4. Run the first-bootstrap flow exactly as F4's spike settles it, and re-measure its prompts and cancellation on a production-shaped build.
5. Record platform, build and SDK versions, target metadata, results and redacted screenshots here. No tokens in screenshots or logs.

## Results

| Build | Check | Result |
| --- | --- | --- |
| iOS development build | all of the above | SKIPPED (no tenant or SDK approval) |
| Android development build | all of the above | SKIPPED (no tenant or SDK approval) |
