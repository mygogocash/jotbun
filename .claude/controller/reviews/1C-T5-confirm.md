# Confirming review 1C-T5, review round 2

Reviewer: Opus, read-only, fresh to this code. Reviewed: branch `p1/1c-t5-app-auth`, range `75b3625...8deea1d` (WIP `50cda23`, merge `c20f88d`, task commit `7bc2fe1`, fix round `8deea1d`), focused on `7bc2fe1..8deea1d`. Checked against plan `docs/superpowers/plans/2026-10-25-jotbun-p1c-better-auth.md` `### Task 5` (line 611), its Global Constraints and Review Focus, spec §6.4 (D37), the first review `reviews/1C-T5.md`, the brief `briefs/1C-T5-round2.md` and the implementer's logs in `scratch/1c-t5-impl2/`. After `git fetch`: integration head `f33cdf0`, #334 (`p1/1c-t1-better-auth`) head `511ef91`.

Scratch: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1c-t5-confirm/`
- `tree/` = `git archive 8deea1d`; `tree-red/` = `7bc2fe1` with the round's tests and fake laid over it; `tree-mutants/` = `8deea1d` for the mutant run; `merged-f33cdf0/` = the `git merge-tree` result of `f33cdf0` + `8deea1d` (tree `f08bf4c`), with `node_modules` linked so `@gogospend/contracts` resolves to the merged tree's own package.
- `tools/confirmProbe.test.ts` (probes P1 to P10), `tools/t1HandlerProbe.test.ts` (Better Auth's client through 1C-T1's real `handleAuthRequest`, bundled to `t1-handler/handler.mjs`), `tools/lockdiff.py`.
- Logs: `probe-8deea1d.log`, `probe-7bc2fe1.log`, `red-7bc2fe1.log`, `mutants.log`, `t1-handler-probe.log`, `gate-*.log`, `merged-*.log`.

## The round's five items

| Item | Verdict | Evidence |
|---|---|---|
| Major 1, token cache across a session change | **fixed as specified** | `betterAuthPort.ts` lines 171 to 175 (`generation`, `forgetToken`), 191, 198, 217 (moved on email, Apple/Google and sign-out), 262/274 and 278/287 (`asked === generation`). The four new port tests and the new provider test fail on `7bc2fe1` and pass on `8deea1d`. My probes P6 to P9 pass: after a burst of sign-in, sign-out, sign-in with a read and a refresh in flight, the next quiet read is cached again (one `token` call for two reads); a read that left before a sign-in never overwrites the one cached after it; Apple moves the counter like Google; a refused or unreachable sign-in does not move it, and the cached token stays. No new await, so nothing can wait forever. The counter is local and only ever increases, and no invariant ties it to the provider's `generation`, `tokenGeneration` or epoch, so nothing can drift. Every exit from `signOut()` moves it (`try`/`catch` around the call). A sign-in moves it only after the server accepted, which is when the cookie changes. But see major 1 below: the cache was never the only way a token reaches the wrong session. |
| Major 2, 204 from the two sign-out routes | **fixed, and only for those two** | `mapNoContent` (line 153) is used only by `signOutDevice` and `signOutEverywhere` (lines 296, 302); `link`, `unlink`, `devices` and `signOutOtherDevices` keep `mapSensitive`. P10 drives Better Auth's own client: 204 is success; 401 -> `SIGNED_OUT`, 403 `REAUTH_REQUIRED` -> `REAUTH_REQUIRED`, 400/404/415 -> `REFUSED`, 503 JSON, 502 empty, 500 HTML and a thrown fetch -> `AuthUnavailable`, on both routes. The fake answers `{ data: null, error: null }` (`fakeAuthServer.ts` lines 50, 209, 221). |
| Minor 1, `freshFlow`'s save under `committing` and the check after it | **fixed** | The new provider test passes on `7bc2fe1` (it pins existing behaviour, as declared) and kills R14 and R15 (1 failure each, reproduced). |
| Minor 3, `{}` on the body-less POSTs | **fixed, and 1C-T1 accepts it** | `jotbunAccountClient.ts` lines 15 to 17. `t1HandlerProbe`: through 1C-T1's real `handleAuthRequest` (`apps/edge/src/auth/handler.ts` at `511ef91`), all three POSTs arrive as `application/json` with `{"id":...}`, `{}`, `{}`; no 415 (the handler's JSON branch reads `{}` with `readRawJsonBody`, and `parseJson` accepts it); a 204 from the inner handler comes back as 204 with no body (line 77 forwards `answer.body`), and the port reads it as success. A `text/plain` body is still 415, which the port reads as `REFUSED`. |
| Minor 5, receipt | **accurate, with two wording nits** (nits 1 and 2) | See "Receipt" below. |

What "the fake now matches 1C-T1's real server for those routes" means today: 1C-T1 has no `/jotbun/*` routes at all (`grep` over `apps/edge/src/auth` at `511ef91`); they are Task 4's, which the plan answers with 204. So the fake matches the plan's Task 4, and 1C-T1's handler passes such a 204 through unchanged (probe above).

## Findings

### Blocker

None.

### Major

**1. A token for the new session still reaches requests made under the old one: during a sign-in that runs beside an existing session, and permanently when the sign-in's `get-session` step fails.** This was already true at `7bc2fe1`, and the round neither caused it nor claimed to fix it. It is the case the brief asked me to rule out ("pair one session's token with another session's id"), and the first review's major 1 covered only the opposite direction.

- **Cause.** The phone's cookie changes when the server accepts the sign-in: `signInWithCode`/`signInWithIdToken` resolve after the Expo client has stored the new cookie. The provider changes identity only at `bootstrapped`, after `finish()`'s `GET /get-session` (`betterAuthPort.ts` lines 177 to 199) and `sessions.save` (`credentialProvider.ts` lines 201 to 225). From then on every `token()` names the new session. Nothing compares a token with the provider's session: `getAccessToken` (lines 318 to 336) and `requestCredentials` (lines 409 to 416) check only state and epoch, and the transport checks only the epoch (`client.ts` lines 327, 333, 334). The vault picks the vault by the JWT's `sub` and the session by its `sid` (spec §6.4).
- **In the window (P1, P2, P5, all failing at `8deea1d` and at `7bc2fe1`).** Account A is active and signs in as B. Until `bootstrapped`, the snapshot is A (`active`, A's binding, A's epoch).
  - P1: `requestCredentials()` returns `{ accessToken: <B's JWT>, sessionId: <A's session> }`.
  - P2: `getAccessToken()` returns B's JWT, and the epoch has not moved.
  - P5, through the real transport: a `POST /v1/...` begun under A's epoch is sent with `Authorization: Bearer <B's JWT>`, and it resolves `{ ok: true }` to A's caller. `stillCurrent()` passes because the epoch has not moved yet. A's command lands in B's vault.
  - The window lasts one `get-session` round trip plus one SecureStore write. Only a sign-in from `active` opens it: from `locked` or `reauth_required`, `getAccessToken` answers null. A fresh sign-in opens the same window within one account (the new session's JWT paired with the old session's id).
- **When `get-session` fails after the server accepted (P3, P4, both failing at `8deea1d` and at `7bc2fe1`).** `finish()` throws `AuthUnavailable` after `forgetToken()`. `signInFlow`'s catch (lines 228 to 231) dispatches nothing for a sign-in from an existing session, so the provider keeps A while the cookie is B's.
  - P3, from `active`: the outcome is `unavailable`, the state stays A `active`, and `requestCredentials()` pairs B's JWT with A's session id from then on.
  - After a relaunch, `hydrateFlow` finds a record and a cookie (lines 182 to 188), so A is `active` again on B's cookie.
  - P4 is the D37 path. A is `locked` (session deleted elsewhere), the person signs in as B, `get-session` answers 503 once, and the next `hydrate()` runs `refreshAfterUnauthorized` -> `token_refreshed`, so A is `active` with B's JWT.
  - From `reauth_required` a relaunch does the same.
  - A's outbox then flushes into B's vault. That breaks D37 ("If a different account signs in, they are never replayed", spec §6.4) and the Review Focus 5 test Task 6 will write (`another account never sees them`).
  - Native sign-in (`socialSignIn`) shares `finish()`, so Apple and Google are affected the same way.
- **Why major although latent.** No screen can complete a sign-in today: email is `not_configured` until Task 9 and native sign-in is null until Task 7. The first review rated the opposite direction major under the same conditions. P3 and P4 need only one dropped request at the wrong moment, and they persist across launches.
- **Suggested fix** (the controller decides; part b departs from the plan's "`getAccessToken` ... exactly as today"):
  - (a) Port, closes P3 and P4: in `emailSignIn` and `socialSignIn`, if `finish()` throws, `await signOut()` before rethrowing. The Expo client drops the new cookie even offline. The old session's cookie is already gone, so the next read is a 401, then `auth_denied`, then `locked`, which is the truth.
  - (b) Provider or transport, closes P1, P2 and P5: hand out a token only when its unverified `sid` equals the binding the read is stamped with (the transport already holds `before.binding`, and the comment at `client.ts` line 343 says the vault reads `sid`). Or hold token reads while a sign-in from `active`, or a fresh sign-in, runs between the port call and `bootstrapped`.
  - Either way, the fake should mint `sid` (nit 3), and P1, P3, P4 and P5 become tests.

### Minor

None from this round's changes.

### Nit

1. **Receipt, "16 rolldown bindings drop `dev`"** (the Packages bullet): the 16 are 15 `@rolldown/binding-*` entries and `fsevents` (`tools/lockdiff.py`). The other lockfile claims check out exactly: 24 added, 0 removed, only `node_modules/zod` 3.25.76 -> 4.6.7, no new install scripts, `workspaces` `["apps/*","packages/*"]` -> `["apps/api","apps/app","packages/*"]`, 36 `dev` -> `devOptional` (vitest, vite, happy-dom, chai, rolldown and friends), zod declarers exactly `better-auth`, both `@better-auth/core`, `@better-auth/expo` (`^4.3.6`), `better-call` (peer `^4.0.0`) and `@expo/cli` (`^3.25.76`, own nested 3.25.76), and only 1.6.33 / 1.4.0 / 1.3.1. The base lockfile equals `f33cdf0`'s byte for byte.
2. **Receipt, deviation 7 and the Task 6 note, wording.**
   - Deviation 7: "The other device and link calls still read a `null` answer with no error as `AuthUnavailable`" is true of the port. Through `betterAuthClient.ts`, though, `devices()` and `signOutOtherDevices()` never pass `null` data: an empty answer becomes `{ devices: [] }` (`deviceList`) and `{ signed_out: 0 }` (`signedOutOf`). Only `link` and `unlink` can reach that branch.
   - Task 6 note: "the next token read asks the server" overstates it. A read made after the port's `forgetToken()` but before `bootstrapped` caches the new session's token, so the next read may reuse it without asking. That token still names the new session and its `auth_time`, so the note's point holds.
3. **The fake's JWT has no `sid`** (`fakeAuthServer.ts` line 63), so no test can tell two sessions of one account apart by their tokens. The fresh-sign-in test falls back on counting `token` calls. Minting `sid` (the cookie's session id) would let the fix for major 1 be tested directly.
4. Carried from the first review and left out of this round's scope, unchanged: minor 2's code (the receipt now has the Task 4 note), minor 4 (now a Task 7 note in the receipt, no guard), and nits 1 to 4. Nit 4 is still open: the receipt's Task 12 line does not say that the local `authUrl` default (8091) is not the auth Worker (8092).

## Tests, RED, mutants and gate (reproduced)

- **RED** (`tree-red`, `7bc2fe1` + the round's tests and fake): 88 tests, 80 passed, 8 failed, the eight names the receipt lists. Seven fail on `AssertionError`. `the device calls use the jotbun routes, ...` fails on the port's `AuthUnavailable`, which is behavioural, as the receipt says. The save-race test passes there, as declared.
- **GREEN** (`tree`): the six files run 88 tests, 88 passed.
- **Mutants:** `briefs/1C-T5-round2-mutants.py` on `tree-mutants` (backup in my scratch): exit 0, **22 of 22 killed**, with every failure count equal to the brief's. M1 1, M2 1, M3 2, M4 3, M5 3, M6 2, M9 1, M10 1, M11 1, M12 2, M13 1; N1 3, N2 1, N3 3, N4 1, N5 1, N6 3, N7 3, N8 1, N9 1; R14 1, R15 1. All five files restored OK. Retiring M7 and M8 is sound, because N3 and N4 mutate the same lines.
- **Gate on `8deea1d`:**
  - `typecheck:app` passes.
  - `test:app`: 31 passed.
  - `test:unit`: 774 passed.
  - Focused render (`RootLayout`, `SignInScreen`): 2 files, 23 passed.
  - These match the implementer's `gate-*.log`.
- **Proven copy:** `shasum -c scratch/1c-t5-round2/SHA256SUMS`: 7/7 OK.
- **Merged with `f33cdf0`** (tree `f08bf4c`): `typecheck:app` passes, `test:unit` 823 passed (815 + 8), focused render 23 passed, `test:app` 31 passed. A first run that linked the worktree's `node_modules` whole failed `deletionCode.test.ts`, because `@gogospend/contracts` pointed at the worktree's older package. That was my setup, not the merge; it passes with the merged tree's own package linked.
- Not run, as instructed: the full render suite. `export:web` and the iOS export were not run either; no route, config, entry or import changed.

## Commit and hygiene

- `8deea1d`: parent `7bc2fe1`, 7 files (the brief's seven). The summary line is imperative with no prefix and matches the brief verbatim. The trailer is `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`, as the protocol says.
- `git diff --check` is clean for `75b3625...8deea1d`, for `7bc2fe1 8deea1d` and for `origin/claude/p1a-vault-core...8deea1d`.
- `credentialProvider.ts`, `sessionStore.ts`, `betterAuthClient.ts` and `_layout.tsx` are untouched by the round, as the brief required.

## Merge checks

- **Onto `origin/claude/p1a-vault-core` (`f33cdf0`):** `git merge-tree` gives one conflict, only in `docs/implementation/premium-progress.md`, the same hunk as in round 1. The head (since `8f04a3b`) renamed `## 1D: live pokes, the pending choice and PostHog` to `## 1D: live pokes, the pending choice, PostHog and the proof`, and T5 inserted its 1C block just above the old name. Resolution: take T5's side and change its last line to the head's new 1D heading. A plain "keep both" would leave the old and new 1D headings together. `f33cdf0` differs from `8f04a3b` only in `scripts/ops/readiness-receipts.test.mjs`. Nothing in the head since `75b3625` touches `apps/app/src/auth` or `apps/app/src/api`.
- **Together with #334 (`511ef91`):** `git merge-tree 511ef91 8deea1d` (base `75b3625`) also conflicts only in the ledger, at the same hunk. The code merges cleanly: T1 changes only `apps/edge` and the ledger. After resolution the file has two `## 1C: Better Auth and the sign-in port` headings: T5's above the first 1D section (ledger line ~409) and T1's after `## Fix: sheets rise above the iOS keyboard` (~967), before `## Not done, or follow-ups`. T1's own receipt asks for one heading ("1C-T5 ... adds `### 1C Task 5` under this same heading. Keep one heading.").
  - **How to combine them:** keep one `## 1C:` heading at T1's place. In the conflict hunk, keep only the head's `## 1D: ..., PostHog and the proof` heading, so T5's `## 1C` heading and intro go. Move T5's whole `### 1C Task 5` block (from its heading through its last note, `P2-T2: ...`) under T1's heading, after T1's `### 1C Task 1` block, so the tasks run in order.
  - Fold the two intro paragraphs into one: T1's sentence (plan and spec §8 citation, Task 1 runs Better Auth in the HTTP Worker), then T5's ("Task 5 moves the app's sign-in onto a Better Auth port over `@better-auth/expo`, with the session cookie in SecureStore. It starts from the base and is tested against an in-memory fake server; the real server is first exercised in Task 12.").
  - T1's "Keep one heading" note can then stay as a record, or be marked done.
  - If T5 lands first, #334's merge will not conflict on this, because T1's insertion is a separate hunk. It would silently leave two headings, so the fold must be done by hand in either order.

## What the port expects from the server (updates to the first review's table)

| Port expectation | Server | Status |
|---|---|---|
| `POST /jotbun/devices/sign-out` and `/jotbun/sign-out-everywhere` answer 204, no body | plan Task 4: 204; T1 has no such routes yet; T1's handler forwards a 204 body-less | **match** (was mismatch) |
| Body-less POSTs send `{}` as `application/json` | T1 `handleAuthRequest` accepts it (JSON branch, `parseJson` reads `{}`); non-JSON still 415 | **match** (was risk) |
| A JWT's `sid` names the session the provider holds | not checked anywhere in the app | **gap** (major 1) |
| Local `authUrl` default 8091 vs T1 Worker 8092 | unchanged | set `EXPO_PUBLIC_AUTH_URL` (carried nit 4) |

VERDICT: Needs fixes
