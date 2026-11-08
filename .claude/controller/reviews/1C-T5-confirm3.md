# Confirming review 1C-T5, review round 3

Reviewer: Opus, read-only, fresh to this code. Reviewed: branch `p1/1c-t5-app-auth`, range `75b3625...cfd1cc4` (WIP `50cda23`, merge `c20f88d`, task commit `7bc2fe1`, round 2 `8deea1d`, round 3 `cfd1cc4`), focused on `8deea1d..cfd1cc4`. Checked against plan `docs/superpowers/plans/2026-10-25-jotbun-p1c-better-auth.md` `### Task 5` (line 611), spec §6.4 (sign-in; D37), ruling R86, the first review `reviews/1C-T5.md`, the round-2 confirming review `reviews/1C-T5-confirm.md`, the brief `briefs/1C-T5-round3.md` and the implementer's logs in `scratch/1c-t5-impl3/`. After `git fetch`: the integration head is `2f8a034`, which already contains #334 (1C-T1).

Scratch: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1c-t5-confirm3/`
- `tree/` = `git archive cfd1cc4`; `tree-red/` = `8deea1d` with the round's fake and three test files from `cfd1cc4` laid over it; `tree-mutants/` = `cfd1cc4` for the mutant runs; `merged-2f8a034/` = the `git merge-tree` result (tree `f7806c5`, ledger conflict left in place), with its own `@gogospend/contracts` link.
- `tools/confirm3Probe.test.ts` (25 probes: P1 to P5, S1 to S5, X1 to X9, C1, C2, D1 to D4), `tools/confirm3Probe.red.test.ts` (the same probes against `tree-red`), `tools/extraMutants.py`.
- Logs: `probe-cfd1cc4.log`, `probe-8deea1d.log`, `red-8deea1d.log`, `green-cfd1cc4.log`, `mutants.log`, `extra-mutants.log`, `gate-*.log`, `merged-*.log`, `lock-base.json` / `lock-head.json`.

## R86, rule by rule

| Rule | Verdict | Evidence |
|---|---|---|
| (a) `finish()` throws after the accept: sign out, then rethrow | **done, for every sign-in path** | `betterAuthPort.ts` 193 to 214: `accepted()` wraps `finish()` in `emailSignIn` and `socialSignIn`, so email, Apple, Google and both fresh sign-ins go through it. Probes: P3 (switch from `active`), P4 (from `locked`), X2 (Apple), X3 (the session read throws), X4 (a 401 answer reads `failed`, an empty answer `unavailable`; the cookie is gone in both), X5 (fresh sign-in: `unavailable`, cookie gone, locks at the next read, record kept). The Expo client clears the stored cookie in its fetch plugin's `init`, before the sign-out request is sent (`@better-auth/expo` 1.6.33 `dist/client.js` line 410), so an offline sign-out still drops it. |
| (b) no token whose `sid` differs from the session the provider holds for the read | **done** | `credentialProvider.ts` 341 to 356 (`binding` captured with the epoch; a mismatch or unreadable token answers null), 435 to 442 (`requestCredentials` reads through it, then checks the epoch), 307 to 308 (`logoutVault` only with the session's own token). Probes P1, P2, P5, X1, X6 to X9, D3. An audit wrapper on every probe's provider checked every non-null token and credential pair: zero violations. |
| no new error kind | **holds** | The transport's existing refusal (`client.ts` 337): `signed_out`, status 0, `SESSION_REQUIRED`, nothing sent (P5). |
| a mismatch never locks; a real `null` still does | **holds** | P2, X7, D2 (18 unreadable shapes, state stays `active`); N13 and N14 killed. |
| `refreshAfterUnauthorized` unchanged | **holds** | No change in the diff. Consequence shown by X7: from `locked`, a refresh inside a switch window unlocks the first account on the second account's cookie, but no token goes out under it, and it locks again once a failed sign-in drops the cookie. |
| the fake mints `sub` and `sid` | **matches the real server** | `fakeAuthServer.ts` 60 to 65 and 165. 1C-T1 on the head: `apps/edge/src/auth/claims.ts` (`sid: session.session.id`), wired as `definePayload` in `create-auth.ts` line 107; Better Auth 1.6.33 `plugins/jwt/sign.mjs` lines 53 and 59 sign that payload plus `sub = user.id`. The app stores `get-session`'s `session.id` (`betterAuthClient.ts`, `session()`), the same row id, so a healthy session always matches. |

## The three properties

1. **One session's token with another session's id: ruled out.** Every hand-out compares the token's `sid` with the binding captured at the start of the read. Bindings only change with the epoch (`sessionMachine.ts` `next()`), the read cache is keyed by epoch, and both consumers of a raw token (the transport, `client.ts` 333 to 335, and the live channel, `liveChannel.ts` line 185) re-check their own epoch or generation. X9: a read deduplicated under A never serves B. X1: reads that start under A and are answered after the accept get A's own token (or are deduplicated onto it), never B's. X8: a 401 for an A request that arrives after the accept is not resent with B's token (`signed_out`, one request on the wire).
2. **A's queued command into B's vault: ruled out** in every interleaving I could build, including after a relaunch (C1: zero requests sent, against one sent with B's token on `8deea1d`).
3. **The app active on an account whose cookie belongs to another: one path is left** (minor 1). A failed session read no longer gets there (P3, P4, X5), but a process death between the accept and the record save still does, and it survives relaunches. It is safe for data, because of (b).

## Normal use

- S1: one account, 30-second tokens (under the port's 60-second reuse margin, so every read asks the server), 25 rounds of concurrent `getAccessToken`, `requestCredentials` and `refreshAfterUnauthorized`: never null, never locked.
- S2: after a forced refresh, the next read is ready and is a new JWT.
- S3: a relaunch of a healthy session hydrates `active`, and the first read is ready, with or without a cached JWT.
- S4: a fresh sign-in into the same account is ready right after it resolves, with the new `sid`.
- S5: a steady sign-out tells the vault once, with the session's own token and id.
- No new unbounded wait. `accepted()` awaits one sign-out call on the failure path. Sign-in, hydrate and fresh sign-in are queued behind it; token reads and sign-out are not.
- Full render suite on `cfd1cc4`: 83 files, 1592 tests passed (the round's first full run).

## `sessionOf`

- Correct on every shape I tried (D1, D2): base64url payloads of length 0, 2 and 3 mod 4, with `-` and `_`; standard padded base64; multi-byte UTF-8; extra and nested claims; a duplicate `sid` key (the last one wins, as in `JSON.parse`). A missing, null, numeric, array or upper-case `sid`, a `__proto__` key, an array, `null`, a string or a number as the payload, invalid base64, a truncated or trailing-garbage payload, no dots, or an empty segment: all null, never a lock.
- Globals: it uses `atob`, `TextDecoder` and `Uint8Array.from`, exactly as `expiry()` (`betterAuthPort.ts` 92 to 104) and `idTokenSubject()` (`nativeSignIn.ts` 14 to 15) already do from the task commit. `TextDecoder` is present on the device: Expo 58's native `fetch`, which the app installs as the global fetch, decodes every response with it (`expo/src/winter/fetch/FetchResponse.ts` line 428). See nit 3 for `atob`.

## Findings

### Blocker

None.

### Major

None.

### Minor

**1. A process death between the server accepting a sign-in from an existing session and the record save leaves the provider `active` on the old account with the new session's cookie, across relaunches. The receipt says that state can no longer be reached.**

- **Probe C1 (account switch).**
  - Setup: A is signed in. The server accepts B, and the port reads B's session. The process dies before `sessions.save`. A new port and provider are built over the same cookie and record store.
  - Result on `cfd1cc4`: `{"state":"active","account":"A","reads":[null,null,null],"refresh":true,"afterRefresh":null,"stateAfterHydrate":"active"}`. A v1 request is refused before sending (`signed_out 0 SESSION_REQUIRED`, 0 sent). A sign-out recovers (`signed_out`, cookie gone, the vault is not told).
  - On `8deea1d` the same probe gave B's JWT under A, sent one request with it, and told the vault with B's token. So R86 turned a D37 breach into a stuck state.
- **Probe C2 (fresh sign-in, process death after `signOutDevice(old)`).** The same result: `active`, every read null.
- **Why it persists.**
  - `hydrateFlow` trusts any cookie (`credentialProvider.ts` 199 to 204).
  - A mismatch never locks.
  - `refreshAfterUnauthorized` answers true but changes nothing from `active`.
  - So every launch opens A's diary. The first flush reads `signed_out`, and `spendDiary.ts` 175 to 177 locks the diary with "Sign in again to send the entries saved on this device", which offers no action. That lasts until the person signs out or signs in again.
- **How likely.** The window is one `get-session` round trip plus one SecureStore write (for a fresh sign-in, plus the `signOutDevice` call). A network that hangs at that moment, followed by a force-quit, is the realistic way in. Account switches and fresh sign-ins are both rare, and no screen can complete either one before Tasks 7 and 9.
- **The receipt.** The Task 8 note ends: "the one known way into that state, a failed session read, is closed by R86". That is not accurate.
- **Why minor, not major.** Properties (1) and (2) and D37 hold: nothing leaves the phone. The person sees a "Sign in again" banner, and a sign-in or a sign-out recovers.
- **Fix (the controller decides).**
  - (i) Correct the Task 8 note, and give Task 8 the case: an `active` session whose reads are never ready needs a way to sign in again.
  - Or (ii) a small code change, which amends R86's "never locks" for this one case: when no sign-in or fresh sign-in is running, a token naming another session can only be a stray cookie from an interrupted sign-in. Drop that cookie (`port.signOut()`) and dispatch `auth_denied`. The next refresh then gets a 401, so the session stays `locked` and the session-ended screen takes over.

### Nit

1. **Receipt wording, outcomes.**
   - The Task 8 note says a failed session read "answers `unavailable`". A 4xx answer to the session read answers `failed` (`AuthRefused('REFUSED')`, X4). Outages and empty answers do give `unavailable`.
   - The Task 6 note says "treat `unavailable` from a fresh sign-in as 'sign in again'". `unavailable` also comes from an outage before the server accepted, and then the old session is untouched. Better: after `unavailable`, read the snapshot; `locked` (at the next token read) means sign in again.
2. **Test gaps. The code is right in each case (D1, X3, X4).**
   - E5 and E6: dropping the `-`→`+` or `_`→`/` mapping in `sessionOf` survives 6 runs of 6 files each. The fake's tokens, and 1C-T1's real ones, never contain `-` or `_`: in base64 of ASCII, only `>`, `?` or `~` at a byte position ≡ 2 mod 3 produces one, and neither payload has those characters. D1 shows the mapping works; no test pins it.
   - E13 (only an outage after the accept signs out) and E14 (the sign-out in `accepted()` not awaited) survive.
   - E1 (comparing `sid` with the binding when the read resolves, not when it began) survives. That one is equivalent for today's callers, which all re-check the epoch.
   - E7 (decoding Latin-1 instead of UTF-8) is equivalent: the `sid` is ASCII.
   - E11 (Apple and Google keep a failed session) is killed: 1 failure. E15 (`requestCredentials` reads the port directly) is killed: 5 failures.
3. **`atob` on the device is not verifiable here.** The Hermes runtime arrives at pod install, and nothing in `node_modules` declares or polyfills `atob`.
   - The round adds no new reliance: `expiry()` and `idTokenSubject()` need it already.
   - The failure mode differs, though. Without `atob`, `sessionOf` makes every read null, with no lock and no error (D4: `{"v":null}`, state `active`). `expiry()` merely stops caching.
   - Task 12's device run will show it at the first v1 request. Name it in that checklist.
4. **What normal use can see during the window.**
   - During a fresh sign-in (a re-check before a sensitive action), a sync flush that runs in the window reads `signed_out`. `spendDiary` then locks the diary with "Sign in again ..." until the epoch moves at `bootstrapped` and the diary reopens. Before R86, that flush went out with the new session's token for the same account.
   - This is what R86 intends ("as while signing in"), and it is brief. Tasks 6 and 8 should know a flicker is possible.

## Tests, RED, mutants and gate (reproduced)

- **RED** (`tree-red`): 98 tests, 89 passed, 9 failed, all nine on `AssertionError` with the brief's names. The tenth new test (`requestCredentials never pairs the old session's token, read before a fresh sign-in, ...`) passes there, as declared.
- **GREEN** (`tree`, the same six files): 98 passed.
- **Mutants:** `briefs/1C-T5-round3-mutants.py` on `tree-mutants` (`MUTANT_BACKUP` in my scratch): exit 0, **28 of 28 killed**, every count equal to the brief's and the receipt's:
  - M1 4, M2 1, M3 2, M4 7, M5 3, M6 2, M9 1, M10 1, M11 1, M12 2, M13 1;
  - N1 3, N2 1, N3 3, N4 1, N5 1, N6 3, N7 3, N8 1, N9 1;
  - R14 1, R15 1;
  - N10 3, N11 5, N12 1, N13 5, N14 2, N15 1.
  - All five files restored OK.
  - My extra mutants are in nit 2.
- **Gate on `cfd1cc4`:**
  - `typecheck:app` passes.
  - `test:app`: 32 passed.
  - `test:unit`: 784 passed.
  - Full `test:render`: 83 files, 1592 tests passed.
  - `git diff --check` is clean for `75b3625...cfd1cc4`, `8deea1d cfd1cc4` and `origin/claude/p1a-vault-core...cfd1cc4`.
- **Proven copy:** `shasum -c scratch/1c-t5-round3/SHA256SUMS` against `cfd1cc4`: 7/7 OK. The removed lines are exactly G1 to G8's and R1/R2's Find text.
- **My probes:** 25 of 25 pass on `cfd1cc4`. On `8deea1d`, 12 fail: P1 to P5, X2 to X5, X7, X8 and D3.
- **Implementer's logs:** they match the counts above. `scratch/1c-t5-impl3/gate-test-render-full.log` was started after the commit and has no summary; the receipt does not claim it.

## Receipt (`## 1C:` section)

- **Accurate:**
  - D1 (status names `8deea1d` and round 3).
  - D2 (against `75b3625`'s lockfile: 24 added, 0 removed, 36 `dev`→`devOptional`, and the 16 that drop `dev` are exactly 15 `@rolldown/binding-*` packages and `node_modules/fsevents`).
  - D3 (the round 3 bullet: names, RED 98/89/9, GREEN 98, 28 mutants with counts, gate 32/784/23).
  - D4 (deviation 7: through `betterAuthClient.ts` only `link` and `unlink` can give `null` data).
  - D5 (deviation 9).
  - D6 (the Task 6 note's cache wording), apart from nit 1.
  - D7 (1D-T5 live channel).
  - D8:
    - Task 12: `env.ts` defaults `authUrl` to `v1ApiUrl` = 8091; `scripts/dev-v1.mjs` uses 8091 and `apps/edge` serves on 8092.
    - The first review's nits 1 to 3: both `@better-auth/core` copies are 1.6.33 and both `@better-auth/utils` copies are 0.4.2; the Expo client imports only `@better-auth/core/utils/json`; `sessionEnded` sets `reason` after `dispatch` (lines 382 to 386), while `auth_denied` sets it inside `dispatch` (line 166).
- **Not accurate:** the end of the new Task 8 note (minor 1), and the outcome wording (nit 1).
- The Task 4 and Task 7 notes are unchanged and still hold.

## Commit and hygiene

- `cfd1cc4`:
  - Parent `8deea1d`, author `kunanon-ui`, 7 files, the brief's seven.
  - The message is byte-identical to the brief's three `-m` parts. The summary line is 62 characters, imperative, with no prefix.
  - The trailer is `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`, as the protocol says.
- No exported type or signature changed: only two JSDoc wordings on `CredentialProvider`. `sessionOf` and `accepted` are module-private.
- The worktree is clean at `cfd1cc4`.

## Merge onto `origin/claude/p1a-vault-core` (`2f8a034`, #334 already merged)

- **`git merge-tree --write-tree`** (merge base `75b3625`): one conflict, only in `docs/implementation/premium-progress.md`. The head's app changes since `75b3625` touch no file under `src/auth`, `src/api` or `app/`, and not the lockfile.
- **The merged tree** (ledger markers left in):
  - `typecheck:app` passes.
  - `test:app`: 32 passed.
  - `test:unit`: 851 passed.
  - Focused render (`RootLayout`, `SignInScreen`): 23 passed.
  - Full render, first run: 86 files, 1609 of 1610 passed. One timing flake: `src/screens/v1/TransactionsScreen.render.test.tsx` › `a conflicting edit offers reload ...` took 4050 ms under load and could not find the row. That file passes 7/7 on three runs by itself, neither side touches `src/screens/v1` or that screen's code, and a second full run passed 86 files, 1610 tests (`merged-render-full.log`, `merged-transactions-*.log`, `merged-render-full-2.log`).
- **Resolving the ledger.** The head renamed the first 1D heading, and #334 already added `## 1C: Better Auth and the sign-in port` (head line 1027, after `## Fix: sheets rise above the iOS keyboard`). Its last note says "1C-T5 ... adds `### 1C Task 5` under this same heading. Keep one heading."
  1. In the conflict hunk (merged lines 456 to 524), keep only the head's side: `## 1D: live pokes, the pending choice, PostHog and the proof`. T5's `## 1C:` heading, its intro and its old-named `## 1D: live pokes, the pending choice and PostHog` heading all go. The head has no blank line before that heading; adding one is harmless.
  2. Move T5's whole `### 1C Task 5: The app's Better Auth port, replacing Auth0` block, from its heading through its last note (`Left open from the first review, as notes (R86): ...`), under the head's `## 1C:` heading. Put it after T1's `### 1C Task 1` block (after its "Keep one heading." note) and before `## Not done, or follow-ups`.
  3. Fold the intros into T1's paragraph by appending T5's two sentences: "Task 5 moves the app's sign-in onto a Better Auth port over `@better-auth/expo`, with the session cookie in SecureStore. It starts from the base and is tested against an in-memory fake server; the real server is first exercised in Task 12." T1's "Keep one heading" note can stay as a record.
  4. Check: exactly one `## 1C:` heading, with `### 1C Task 1` then `### 1C Task 5` under it. The two `## 1D: ..., PostHog and the proof` headings (head lines 456 and 892) predate this task, so leave them as they are.

VERDICT: Approved
