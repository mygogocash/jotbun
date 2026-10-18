# Auth0 native bootstrap spike

F4's first step ([foundation plan](../superpowers/plans/2026-10-17-gogospend-01-foundation-auth.md), Task F4). It decides whether the two-step first sign-in is acceptable before the challenge/proof contract is final.

## Status — 17 October 2026: BLOCKED, contract provisional

Not run. It needs:

- **E1:** an approved non-production Auth0 tenant, native application, API (audience) and Google/Apple/email connections, plus a secure place for the read-profile client credentials.
- **E2:** the iOS bundle identifier and the callback/logout domain.

F4's server work proceeded locally with synthetic tokens. Until the spike passes or the founder decides on the result, the challenge/proof contract below is **provisional**, and F4 is not complete.

## Flow under test (as built in F4)

1. Universal Login (Authorization Code + PKCE) → API access token for the GoGoSpend audience.
2. `POST /v1/auth/challenges` with that access token, `{request_id, purpose: "bootstrap", command_id}` → `{challenge_id, nonce, expires_at}` (5 minutes).
3. A second authorization with `nonce=<nonce>` and `max_age=0` → an ID token whose `nonce` matches and whose `auth_time` is after the challenge.
4. `POST /v1/auth/bootstrap` with the access token and `{challenge_id, id_token}` → `{account_id, binding, session_generation}`. The ID token is accepted only here, never as a Bearer credential.

## What to record (no tokens, nonces or bindings in this file)

For one iOS and one Android development build, per connection (Google, Apple, email/password):

- How many interactive prompts and iOS consent sheets appear in steps 1–3, and whether Google/Apple ask again or complete silently under `max_age=0`.
- Elapsed time per step, and the total.
- Behaviour when cancelling at each step: what the app sees, and whether a retry recovers.
- Whether `auth_time` and `nonce` arrive as expected, and whether the profile check (`email_verified`, `blocked`, connection) matches the connection.
- SDK and build versions, tenant region, and plan entitlement used.

## Decision rule

If the second interactive login is acceptable on both platforms, record PASS and freeze the contract.

If it is not, return a decision to the founder before changing the proof rules. One option is a public pre-login challenge, rate-limited per trusted network bucket and bound to a principal only at completion, so one authorization yields both the access token and the nonce-bound ID token.
