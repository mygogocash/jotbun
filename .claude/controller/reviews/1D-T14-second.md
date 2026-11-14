# 1D-T14 second review (Claude Sonnet 5.5): the account events, from 1C's credential provider

Reviewed: `948391f7` on `p1/1d-t14-account-events` (PR #467, base `claude/p1a-vault-core`), range `origin/claude/p1a-vault-core...948391f7`, with the plan's Task 14, its Global Constraints, R125 and followups line 770. The worktree was never touched (`status` clean and HEAD `948391f7` before and after). I did not read the other reviews of this task. My evidence is in `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t14-second/` (a `git archive` scratch tree on a link farm from `p4-t17`; my probes are in `probes/`, never in a worktree).

## Result in short

No blocker and no major. Every privacy focus item holds in the shipped code, on the Node stand-in and on the real `AnalyticsUpkeep`. Three minor findings, each an unheld invariant (the code is right today; a regression would not be caught by the shipped tests), and two nits. Both gaps were found with my own mutants and are killed by my own probes, which are ready to adopt.

## CI (R100)

PR #467 head is `948391f7`. All nine jobs of run 43519225529 were QUEUED when I read them (`gh pr checks 467`, and the status rollup): there is no CI result to report. CI must still show:

- `Typecheck, unit, API, build`: `typecheck:app`, `test:app`, `test:unit` (the Hermes guard and the two provider-building unit files ran green here, 26 of 26), `test:api`, the build.
- `Render (every file but the per-section suites)`: the new `signOutEvents.render.test.tsx` and the screens' and routes' suites (the 11 focused files ran green here, below); plus the three per-section render jobs.
- `Exports (web and iOS bundles)`: `credentialProvider.ts` gains a runtime import of `../analytics/events.ts`. Nothing outside `apps/app` imports the provider (`git grep` over `apps/edge`, `apps/api`, `packages`, `scripts`: none), and the emitters are already imported at runtime by 22 non-test app modules, so no new package or entry is added.
- `Edge`, `SQL integration and ops` and `Release image`: this diff touches no edge, api or contracts file; they are part of the gate only. No database or workers suite ran here (Docker is stopped).

## What I ran (all in my scratch tree, logs beside it)

- The two focused files: `credentialProvider.test.ts` 47 of 47, `signOutEvents.render.test.tsx` 3 of 3.
- 10 of the planner's 12 mutants (M1, M2, M4, M5, M6, M8, M9, M10, M11, M12), through the planner's `mutants.py` on my tree: all killed, every failing case an `AssertionError`, files restored by sha256, failing counts as the brief expects (3, 9, 3, 1, 1, 1, 1, 1, 1, 2). Not rerun: M3 and M7.
- The brief's 11 focused render files under the heavy lock (`RootLayout`, `SettingsScreen`, `useAuthGuardSession`, `SignInScreen`, `PrivacyScreen`, `privacyServices`, `signOutEvents`, and the four routes tests): `Test Files  11 passed (11)`, `Tests  158 passed (158)`, 0 stderr, Unhandled or act lines.
- `tsc --noEmit` on the scratch archive without my probes: exit 0. Node's runner and vitest strip types, so this is the only check of the `SignOutOptions` plumbing.
- The 8 committed files are byte-identical with the kit's `real/` copies, the kit's `SHA256SUMS` still shows 41 OK, and `git diff --check` over the range is clean.
- My own probes: 14 Node cases (`probes/zzReview.test.ts`, `probes/zzReview2.test.ts`) and 6 real-component render cases (`probes/zzReview.render.test.tsx`), all green on the shipped code. Two of my first drafts were wrong and I fixed them before relying on them: R4's setup (the recorder pre-installs an account the follower must replace) and PX's loop count (the epoch reservation fires when the new epoch reaches 33, so the first draft never parked the flow); PX now asserts that the save is parked.
- My own mutants, MX1 and MX2 (below).

## Findings

### Blockers

None.

### Majors

None.

### Minor

**m1. The sign-in event's place before `await reservation` is unheld.** `credentialProvider.ts:249-251`. The brief (P3) and the receipt say the event comes before `await reservation`, "so nothing else can run between the session change and the event". No shipped case and no planner mutant pins that: M6 moves the event the other way, before the dispatch.

- Mutant MX2 (the two `track*` lines moved after `await reservation;`) survives all 47 Node cases and all 3 render cases.
- Probe PX kills it. The epoch store's save is gated at the reservation that the 33rd epoch triggers (`EPOCH_BLOCK / 2`), B is active and parked on `await reservation`, `signOut()` runs, the gate is released, then C signs in. Shipped code: B's `signed_up` and `signed_out` go out in B's session, and only C's `signed_up` follows C's `identify`. MX2: `[signed_out B] reset reset identify [signed_up (B's, stale)] [signed_up C]`, so B's sign-up leaves with C's yes (`MX2-probes.log`).
- Reach today: none, the order is right. The window is one SecureStore write at one sign-in in 32. A regression would send a `signed_up {method}` for the wrong person, no personal data.
- Suggested pin (carry, not a blocker): PX as a case in `credentialProvider.test.ts`, and an M13 in `mutants.py`.

**m2. The `active` guard is pinned only for `locked` and `reauth_required`.** `credentialProvider.ts:468`. M5 drops the whole guard and is killed; a partial weakening is not.

- Mutant MX1 (`snapshot.state === 'active'` also admits `authenticating` and `bootstrap_pending`) survives 47 of 47 and 3 of 3.
- Probe PC kills it: a sign-out while the server has accepted a sign-in and the record save is parked (`bootstrap_pending`) tracks `signed_out {}` (no method, `account()` is null there). The follower has seen no session, so its `setAccount(null)` is a plain one and keeps what is held; C's yes then sends `[signed_out, signed_up]` where `[signed_up]` is expected (`MX1-probes.log`).
- Reach today: none from the UI (Settings and Privacy are signed-in screens). Suggested pin: PC as a case, and an M14.

**m3. The Node stand-in is the only cover for four of the paths the brief names.** The stand-in `followSessions` matches `AnalyticsUpkeep.tsx:29-63` line for line except for where the account name comes from (the provider's snapshot, where the app reads `GET /v1/me`). The shipped render file runs the real `AnalyticsUpkeep` for three cases only: Settings' plain Sign out, Settings' sign out everywhere and Privacy's Done. The account switch (P3, M6), `locked` and `reauth_required` (P4, M5) and the never-named account (M4's second case) run on the stand-in only.

- I ran each of those through the real component and the real Settings screen (`probes/zzReview.render.test.tsx`): R1 an account switch beside the active session (trail `reset, reset, identify, signed_up, screen`, no event before the reset), R2 Sign out from a locked session, R3 from `reauth_required`, R4 from an account the follower never named (its `/v1/me` read fails). All pass, and each sends nothing for the ended account and only B's own `signed_up` with B's yes. So the stand-in is faithful today.
- Nothing keeps the copy and the component aligned. A change to `accountFollower` would leave the Node cases green. Suggested: add R1 to R4 (about 60 lines) to `signOutEvents.render.test.tsx`, or hoist `accountFollower` into a pure module that the component and the Node file both import (1D-T15's `AnalyticsUpkeep` round, which followups already carries for 1D-T7's pins).

### Nits

- **n1.** `SettingsScreen.tsx:234`: the comment reads "Signed out everywhere: no signed_out ..." above a line that both sign-outs run. Say "After a sign out everywhere".
- **n2.** R125's option is opt-out: a future sign-out path beside a deletion or a global logout that forgets `{ event: false }` sends the event. See the notes below.

## The focus items, one by one

**What reaches analytics (privacy).**

- The diff hands the emitters two values only, `request.method` and `provider.account()?.method` (`credentialProvider.ts:249-250`, `:468`), both from `apple | google | email`. `cleanEvent` (`catalog.ts:196`) keeps a `method` only when it passes the enum rule; the common properties are the six in `COMMON_RULES` plus `origin: 'app'`. `held` is filled only from `cleanEvent`'s result (`controller.ts:305`), so a held event carries no more than a sent one.
- Probe PA: an email sign-in held under `consent: 'unasked'` and sent on `answer('yes')`, an Apple switch beside it, a Google sign-in, two sign-outs, with `setConsentedTelemetrySink` recording every cleaned event whatever the consent. Searched for: both addresses, the Apple subject and relay address, the Google subject and address, and each account's token, session id and account id. None appears in `JSON.stringify({ sent, sink })`. Every cleaned event's keys are exactly `method`; every captured event's keys are `method` and `origin`.
- Out of this task and unchanged: `identify` carries the server's HMAC analytics id, not a raw id.

**The sign-in event (P2, P3).**

- `created` is `session.created` from the port (`betterAuthPort.ts:186`, `createdOf` is strictly `=== true`); `signUp` never decides. M2 (9 failing) and M3 are killed; the returning-Apple case holds.
- Place: right after `dispatch({ type: 'bootstrapped' ... })`. The notification chain is synchronous (`dispatch` then `notify`, `session.ts:51-53`, then `AnalyticsUpkeep`'s listener, whose `follow()` runs to its first await; its null path `setAccount(null, { signedOut: true })` has no await at all, `controller.ts:211-231`). So the previous account is dropped before the event is tracked, and nothing is ever captured under it: PA, PD, PX, and the real component in R1; M6 is killed.
- No event for a refused, cancelled, wrong-code, unavailable or failed-write sign-in (PL), for a superseded one (PC, PD), for a joined one beyond the first (PK), or for a fresh sign-in and a launch's hydrate (PH). A sign-in again from `reauth_required` as the same account sends one `signed_in` after the drop (PG).

**The sign-out event (P4, followups line 770).**

- Tracked first, from an active session only. The guard reads the live snapshot, and `endSession()` dispatches `signed_out` before its first await, so a second tap finds `signed_out`: PB (three concurrent calls, one `signed_out`). M1 and M4 are killed, and the followups' pin (the stand-in passes `{ signedOut: true }`, as the component does) is kept.
- Locked (a token read finds the session gone), `reauth_required` (the vault ended it), locked at launch with the cookie gone (PE), and an account never named (R4): nothing is sent or held that the next account's yes would send; on the stand-in (shipped case 5, M5) and on the real component (R2, R3, R4). A `signed_out` held before the answer is dropped at the session change (PI). A sign-out mid sign-in sends nothing and the cancelled sign-in sends nothing (PC); A's sign-out beside B's in-flight sign-in sends one `signed_out` for A and nothing for B (PD).
- The ordering against PostHog's own `reset()` rests on the SDK. Read in the installed source, not run: `@posthog/core` 1.62.0 `wrap()` (`posthog-core-stateless.ts:477`) runs `capture` at once once initialised and otherwise after `_initPromise` in call order, so `capture` and `reset` keep their order; `capture` reads `getDistinctId()` inside that call (`posthog-core.ts:428`); and `reset` keeps the event queue (`:169`). So the pre-reset `signed_out` is bound to the signing-out person's id and still flushes. Hosted and device behaviour stays SKIPPED (Q5).

**R125 (P10).**

- Callers: the only non-test callers of `signOut` are `SettingsScreen.tsx:235` and `PrivacyScreen.tsx:438`, both through `signOutOfThisDevice` (`SettingsParts.tsx:63`), which `accountServices.ts:27` and `privacyServices.ts:61` wire directly; the two routes pass those services unwrapped. No other caller exists (grep over `src` and `app`, tests excluded), and the only places that take no option are the catalogue's fakes, by design.
- `{ event: false }` from Settings' sign out everywhere (render case 2, M9, M12), from its Try again (my R6: the first answer is lost, the resend answers `signed_out`; no `signed_out`, and B's yes sends only its own `signed_up`), and from Privacy's Done (render case 3, M11, M12). Settings' plain Sign out still sends (render case 1, M10).
- The edge the brief accepts is real and harmless: if the diary erase fails after a sign out everywhere, the later "Sign out to try again" tap is a plain sign-out and sends `signed_out` under the person's own id, as R125's last sentence says.

**The stand-in follower (P5).** See m3. The new render file covers the real component only where it needs to for R125; the Node stand-in is faithful today on every path I ran through the real one.

**Also checked, no finding.** A throwing analytics layer neither fails a sign-in nor blocks a sign-out (`probes/zzReview2.test.ts`; `bus.ts` catches around `analytics.track`, and the emitters are called outside any `try` in the provider, so this rests on `bus.ts`). No plan clause is missed: the five plan cases are present under their names, the three plan mutants are killed, `passkey_created` stays unsent, and the receipt's counts match the implementer's logs.

## Notes for later tasks

- **1D-T15 (device run):** confirm in PostHog's live events that a `signed_out` lands under the person's analytics id and not an anonymous one. My argument is from the SDK source above, not from a device.
- **1D-T13 and 1D-T15:** `reset()` keeps the SDK's event queue, so events captured just before a deletion's step 6 can still flush after it; Q15's daily retry for 7 days is what covers that. Between an accepted deletion and Done the phone can still capture screen events under the deleted person's id (the receipt already says so).
- **1D-T15's `AnalyticsUpkeep` round:** hoist `accountFollower` to a pure module, or add R1 to R4 to the render file (m3).
- **Any new sign-out path** (a deletion that completes from another phone, a passkey flow, a forced sign-out) must decide `event` on purpose: the option defaults to sending.
- **Test pins to adopt** (m1, m2): `probes/zzReview.test.ts` holds PX and PC, and `mx.py` has MX1 and MX2 ready as M13 and M14.

VERDICT: Approved
