# 1D-T7 second review: the phase 1 app events (privacy path)

Reviewer: Claude Sonnet 5.5, independent second read, written before reading any other review of this task.
Reviewed: `78f91ca5` on `p1/1d-t7-app-events` (PR #444, base `claude/p1a-vault-core`), range `origin/claude/p1a-vault-core...78f91ca5`: 37 files, 1049 insertions, 31 deletions. The brief is `briefs/1D-T7.md` (P1 to P20), the spec is plan 1D Task 7 with its Global Constraints.
Read-only: nothing edited, committed or pushed in any worktree (the worktree is clean, the planner's folder checks `OK` against its `SHA256SUMS`). Every probe ran in `scratch/1d-t7-second/tree`, a `git archive` of `78f91ca5` with the root `node_modules` symlinked and `apps/app/node_modules` a local directory of links.

## Summary

- **The privacy boundary holds.** No T7 event can carry an amount, note, name, merchant or typed text; the allow-list is the boundary and every T7 property is a closed enum, a boolean, a bounded integer, or a pattern-limited code. Consent holds end to end through the real bus and controller (probes below).
- **One major:** the carry of events tracked before the install (P13, point 2) does not work for a signed-out launch, which is the case it exists for (onboarding's first step). Its test bypasses the call that breaks it. It fails closed (an event is lost, none is sent early). A one-line fix is validated below.
- **One minor** (the record `kind` is not pinned for income or transfer at four call sites: four of my mutants survive) and four nits.
- CI on PR #444 is green (9 of 9 jobs).

## CI on PR #444 (R100)

`gh pr checks 444`: all 9 jobs `pass` at head `78f91ca5` (`mergeable: MERGEABLE`, no failing check). Counts from the job logs:

- Typecheck, unit, API, build: `typecheck`, `typecheck:app`, `typecheck:routes`, `test:api`; `test:app` 36 of 36; `test:unit` 1083 of 1083 (the Hermes guards); `test:dev` 7 of 7; the API build, `release-graph.mjs check`, the parser sandbox check and `git diff --check`.
- Render (every file but the per-section suites): 129 files, 1646 tests passed. The three per-section shards: 190 + 230 + 248 = 668 passed (each shard skips the others' ids), 2 files each.
- Exports (web and iOS bundles): pass. Edge Worker, SQL integration and ops, Release image and smoke: pass (this PR touches none of them).

## What I ran (scratch tree only)

- Focused reruns, equal to the implementer's logs in `scratch/1d-t7/`: the six Node files 70 of 70; the twelve render files `Tests  405 passed (405)`, 0 `stderr`; the four routes tests 17 of 17. No load flake.
- 13 of the planner's 65 mutants, through its own `mutants.py --only` against my tree: B1, B3, B6, A1, C4, S1, E2, QA6, QA7, RA5, DD2, O3 all `killed (assertion)`; QE (the plan's equivalent) survives as the plan says; every file restored (sha256 equal).
- 9 mutants of my own (`scratch/1d-t7-second/mymut.py`, results in `mymutants.out`): K5 to K9 killed, K1 to K4 survive (finding m1).
- Probes: A to D (finding M1) and three screen-level consent probes (below). Files: `tree/apps/app/src/analytics/probe-early-drop.test.ts`, `probe-launch.render.test.tsx`, `tree/apps/app/src/screens/redesign/probe-consent.render.test.tsx`.
- Not run: database suites (Docker stopped; CI's SQL job passed), whole suites and `export:web` (CI; no route or config change), native and hosted checks (SKIPPED by the plan, Q5: no PostHog project).

## The controller's focus list

### What each event carries

- Each T7 event passes a closed rule of `catalog.ts`: `kind`, `source`, `category_key`, `step`, `budget` are enums; `has_photo` and `offline` booleans; `seconds_to_save` an integer 0 to 3600; `reason_code` `^[A-Z][A-Z0-9_]{0,63}$`. The common properties are the same kind of rule (`home_currency` `^[A-Z]{3}$`, the constant `THB` at install).
- **No property can still hold typed text.**
  - A category name the person typed becomes `custom` (`analyticsCategoryKey`, `thaiPack.ts:82`). The one exception is a name that matches a Thai pack name after folding, which becomes one of nine fixed pack keys (decided, Q18).
  - A wallet name or opening balance never enters an event: `wallet_added` carries no properties (`HomeScreen.tsx`, `trackWalletAdded({})`).
  - `reason_code` is the only 64-character channel. Its sources are `V1Error.code`, which `client.ts:410` limits to the same regex (else `HTTP_<status>`), and fixed client strings (`NETWORK_ERROR`, `TIMEOUT`, `LOCAL_ERROR`, `CURSOR_MOVED`, `RESYNC_REQUIRED`, `CAMERA_DENIED`, `PHOTOS_DENIED`). Never `error.message`: my mutant K7 (reason = message) is killed by the engine test.
  - A permission event is sent for `outcome === 'deny'` only (`systemPermissionTelemetry.ts`); the prompt context, the reprompt flag and the Open Settings method never leave. `'deny'` is the literal the real caller passes (`spendMediaPermissionTelemetry.ts:43`).
  - The new `onDisplay` stores only `screenPattern(segments)`; my mutant K6 (the raw path) is killed.
  - QE survives for the right reason: the bus drops `amount_minor` and `note` when the Quick add save hands them over.
- The bus's early buffer keeps `cleaned` events (my K5, raw properties in the buffer, is killed) and `consentedSink` has no production caller.

### When an event goes out

- **Consent (nothing before yes).** Through the real bus and controller at Quick add (probe file `probe-consent.render.test.tsx`, 3 of 3 pass):
  - answer `no`: a save sends zero captures (status `no`);
  - answer `unasked`: `record_started` and `record_saved` are held, then sent in that order after `answer('yes')`, with no amount in the JSON;
  - `no` then `yes`: the held events are gone for good.
- **The early buffer (P13).** In memory only, cleaned, capped at `HELD_LIMIT` with the oldest out, handed over once; the bus tests and mutants B3, B6, A1, K5 hold those facts. **Whether those events then survive in the controller is finding M1.**
- **The screen on display at the yes (P13).** Works: probe D shows `screen:/spend/onboarding` sent when the answer turns yes. It is sent only on entering yes (`enterYes`'s `entering`), so a refresh while yes sends nothing; mutant C4 (a screen before yes) is killed.
- **The epoch move (line 111, P14).** Behaves as the brief says. `AnalyticsUpkeep.tsx:44-47` clears the account first, so held events for the old account drop; with yes every T7 event is captured at once, so none is lost; after the move the controller enters yes again and the screen is sent again. Note the interplay with M1: events tracked while signed out *after* the first `setAccount(null)` are kept (probe C); only events held before it are lost.

### The bus guard (P12)

- It wraps `analytics.track` only (`bus.ts:49-54`). `finish` runs inside the `try` of both `save()` (device) and `sendOnline`, and the scheduler calls `onOutcome` unguarded before `arm` (`scheduler.ts:69-70`), so without the guard a throwing client would turn an acknowledged save into "could not be saved" and skip the timer. B1 is killed.
- **It hides nothing the person should see.** A failed analytics call has no user-facing meaning and no other consumer; what is lost is developer visibility (nit n1).
- Argument evaluation (`recordEventOf`, `categoryKeyOf`) runs before the guard. I found no throwing input: `diaryView.categories` is always an array (`spendDiary.ts:98`), `packKeyOf` handles a null label, `Date.now() - track.openedAt` is plain arithmetic.

### Once each

- `finish` is the only sender of `record_saved`. An unconfirmed send followed by "Try again" under the same key sends one event (the new cases for the record screen, History, Recently deleted, Home and Budget all use `loseResponse` then "Try again" and assert one). A create "met again" sends one (Home, Budget's `sameBudget`, Quick add's `ownCreateMatches`); a conflict sends none; the device path's later outbox send sends nothing.
- Restore against Undo: decided by `deleted?.id === target.id`; the record screen and History tests hold both.
- Sync: `syncEvents` counts on entering the failure set. The scheduler can hand the same outcome object to two `run()` callers (`flushNow`'s one follow-up); the "entering" rule dedups it. `reportingSyncEvents` is per diary, and the diary reopens only on a real identity change (`spendDiary.ts` `sessionChanged`), so a persisting outage is counted once per launch and once per epoch move (P14, by design). `rate_limited` then `waiting` counts again, which is the plan's literal rule.
- Onboarding: the effect depends on `[step]`, and the test shows "Turn on" redrawing the reminder step does not recount.

### `SyncOutcome.reason` optional (P10) and the engine's other callers

- Production creates an outcome in two places only: the engine's `summarize` and the scheduler's fallback for a flush that threw (`scheduler.ts:66`). `engine.flush` has one production caller (`deviceSync.ts:55`, through the scheduler), so every outcome passes `reportingSyncEvents`.
- Gated outcomes (`waiting` or `paused` from the retry gate) carry `reason: null`. They cannot be the first outcome of a diary (a fresh engine's first flush is allowed), so `LOCAL_ERROR` appears only for the scheduler's fallback, as P10 says.
- `reason` never feeds retry logic: `retry` is decided before `summarize` (`syncEngine.ts:265-270`). E2 is killed.

## Findings

### Blockers

None.

### Major

**M1. The carry of events tracked before the install (P13, point 2) loses them on a signed-out launch, and its test bypasses the call that breaks it.**

*Claimed:* the brief's P13 and the receipt ("Carried", second bullet): what is tracked before the controller installs is kept, handed to the new controller at install, and "held until the answer like any other". Its purpose is 1D-T6's review m3 (`followups.md` 177 to 180): "on native with a key, events tracked before the controller installs are dropped (onboarding events)".

*What happens:*

1. `appAnalytics.ts:61` hands the early events to `created.track`; the status is `loading`, so they go to `held`.
2. `AnalyticsUpkeep` (rendered before the Stack, `_layout.tsx:47-49`) then runs `follow()`. On a launch with no session it takes `binding === null` (`AnalyticsUpkeep.tsx:37-41`) and calls `analytics.setAccount(null)`.
3. In the controller `accountId` is `undefined` until the app has said who is signed in, and `keepHeld = (accountId === undefined || accountId === null) && id !== null` (`controller.ts:208`) is false for `id === null`, so `held.length = 0` (`controller.ts:215`).

The early events are cleared before the person reaches sign-in. Events tracked after that first `setAccount(null)` are kept across the sign-in (probe C), so the loss is exactly what was held before the first `follow()`: onboarding's first step (`coffee`) on a first launch, the event the carry exists for. Onboarding comes before sign-in (the plan's own wording is "the onboarding and the sign-in that led here", and with the `signin` area the story ends at sign-in, `OnboardingScreen.tsx:82`), so a first launch is the main case, not an edge. It is not a regression (the event was lost before T7 too), but it is a requirement the task says it carried and does not deliver.

*Evidence (scratch tree):*

- Probe B (controller only): `track(onboarding_step_viewed)`, `setAccount(null)`, `setAccount(A)` with the server on yes gives captured `[]`. Probe A (the same with `setAccount(A)` directly) captures the event.
- Probe D (the real `AnalyticsUpkeep` and `installAppAnalytics`, a mocked PostHog client, `Platform.OS = 'ios'`, a key set): the step is tracked before mount, no session, then a sign-in with the server on yes. The client saw `reset, reset, identify, screen:/spend/onboarding` and no `onboarding_step_viewed`. The screen on display (P13, point 1) is sent: that half works.
- Why the committed test passes: `appAnalytics.render.test.tsx:62` calls `analytics.setAccount(ACCOUNT)` straight after the install and skips the `setAccount(null)` that `AnalyticsUpkeep` makes first. Mutant A1 (dropping the hand-over) is killed because the test needs the hand-over; nothing requires the event to outlive the next `setAccount`.

*Fix, validated in the scratch tree:* `controller.ts:208` becomes `const keepHeld = accountId === undefined || accountId === null;`. Nothing is tied to an account while the app has not said who is signed in, so the first answer, even "nobody", should keep what is held; a move from an account (`A` to `null`, `A` to `B`) still drops. With that line, probes B and D pass and all 36 existing `controller.test.ts` cases pass (none pins the `undefined` to `null` drop; "held events are dropped when another account signs in, and on no" still holds). It exposes nothing: those events are held and sent only after a yes, like every event tracked while signed out.

*Add:* (1) a `controller.test.ts` case "events held before the first `setAccount(null)` survive it and are sent after a sign-in and a yes; an account to `null` still drops them"; (2) a render case through the real `AnalyticsUpkeep` signed out (probe D is a ready-made one). If the controller defers the controller change, the receipt's "Carried" line and the `appAnalytics.ts` comment must say that the first onboarding step is still lost on a signed-out launch.

### Minor

**m1. The `kind` of the new record events is not pinned for income or transfer at four call sites.** Every fixture in the new cases is an expense, so a constant passes. My mutants, whole files run, all pass:

- K1 `entrySave.ts:108` `kind: fields.type` to `'expense'`: `QuickAddScreen.render.test.tsx` 85 of 85.
- K2 `HistoryScreen.tsx:353` `kind: record.type` to `'expense'` (feeds `undo_used` at `:381`): 35 of 35.
- K3 `deletedData.ts:137` `kind: row.type` to `'expense'`: 18 of 18.
- K4 `recordActions.ts:473-474` `loaded.record.type` to `'expense'` (both undo and Restore): 63 of 63.

`kind` is a three-value enum, so this is a data-quality gap, not a privacy one. Add an income save and a transfer save in Quick add (the file already has `choose('Move')` and `choose('Income')`), an income or transfer row in History's delete and undo and in Recently deleted, and a record-screen Restore of an income. I did not mutate the record screen's edit and delete call sites; they go through `recordEventOf`, whose transfer case `recordProps.test.ts` pins.

### Nits

- **n1. The guard leaves no trace.** `bus.ts:51` swallows every error from `track`, including a bug in the controller; a test would only see a missing event. The logging rule allows an error's name only and the app has no `failureName` helper, so an optional dev-only note of `error.name` would keep visibility without a message.
- **n2. `reportingSyncEvents` runs analytics before `report(outcome)`** (`deviceSync.ts:33-39`). The diary's `onOutcome` is what locks the diary on a `signed_out` outcome (`spendDiary.ts:173-178`), and the scheduler arms its timer after `onOutcome`. With P12's guard nothing in the loop can throw today, but an auth-relevant hand-over should not sit behind analytics code: call `report(outcome)` first, or in a `finally`.
- **n3. The record screen skips the event when the record is not loaded.** `recordActions.ts:472-475` reads the kind from `loaded.record` and sends nothing unless `loaded.state === 'ready'` (an error read after the delete, say). History keeps `kind` on its `deleted` state (P7), which has no such hole; the record screen's `deleted` could do the same.
- **n4. `offline` reads as "not yet synced".** P5 and the plan count "no outcome yet" as not synced, and `rate_limited` or `paused` are not `synced` either, so a save in the first seconds after a launch, or during pacing, is `offline: true` on a working network. This matches the plan and the pinned test; flag it for whoever builds the dashboard.

## Notes for later tasks

- **1D-T15 (two-phone and device run):** add "first launch signed out: the first onboarding step reaches PostHog after sign-in and a yes" (it fails today). Keep P14's checks (the screen sent again after a fresh sign-in, held events for the same account dropped, a reopened diary counting a persisting failure once more).
- **P2-T35 (new setup):** its steps before sign-in use the same held-events path; any event tracked before the first `setAccount(null)` is lost until M1 is fixed.
- **P2-T28, P2-T30:** when History's and Budget's calls move into `historyData.ts` and `budgetCommands.ts`, keep `kind` on `deleted` and add the income and transfer cases of m1.
- **P2-T16, P2-T17:** the tray host's saves reach `record_saved` through `finish` (`kind: fields.type`), so m1's Quick add cases cover it only once a tray test saves a non-expense.
- **P3 (`ai_enabled`):** as the receipt says; both setters (`AiCompanionProvider.tsx:63`, `aiConsent.ts:38`) use `getAnalytics()?.`, so a value set before the install is a no-op.
- `takeEarlyEvents()` is for the app's install only; any other entry point that installs a controller outside tests must drain it too.

VERDICT: Needs fixes
