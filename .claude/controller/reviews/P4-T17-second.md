# P4-T17 second review (privacy and the lock): PR #466, commit 7cdb3d9f

Reviewer: Claude Sonnet 5.5, the independent second look. I did not open any other review of this task. Read-only: every probe ran in a scratch copy of 7cdb3d9f (`git archive`, a `node_modules` linkfarm onto the worktree's install with the workspace links re-pointed at the copy). The worktree is clean at 7cdb3d9f and I never ran git in the main checkout.

Scratch folder: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p4-t17-second/` (the copy is `tree/`; logs and probe files are named below).

## Result

No blocker and no major. Four minors and four nits. None is a defect against the plan's text: m1 is a narrow race that the sign-out order makes reachable, m2 is a guard that no shipped case holds, m3 is a consent-surface decision for the owner, m4 is a convention that nothing pins. CI has not run (all nine jobs on PR #466 read `pending`, head `7cdb3d9f9fbffaa1369d977401e83d293ed48148`, `MERGEABLE`), so the verdict rests on local evidence. What CI must still show is at the end.

## What I ran

| Check | Result |
| --- | --- |
| Range `origin/claude/p1a-vault-core...7cdb3d9f` | one commit on `aad380d2`; the integration head `ab9902a6` is only a controller-state commit past it, so nothing drifted. 10 files, exactly the ones the task names; `git diff --check` clean; commit message and trailer as the protocol says |
| The 94 planner mutants against my copy (`mutants.py --check`) | `94 mutants, 0 that do not apply`: the 9 code files are the proven code |
| Focused Node, `pushRegistration.test.ts` and `pushRouting.test.ts` | 13 of 13 pass (`node-green.log`) |
| Focused render, `PushHost.render.test.tsx` and `RootLayout.render.test.tsx`, under the heavy lock | 2 files, 21 of 21 pass, no stderr, unhandled-rejection or act line (`render-green.log`) |
| `typecheck:routes` on the copy (src and app, my probe files included) | exit 0 |
| Misspelt push links, my probe (`/spend/imports`, `/settings/privacies`, `/spend/recaps/[month]`) | `typecheck:routes` exit 2, three TS2820 at `pushRouting.ts:20, 22, 25`; file restored, sha equal (`typecheck-routes-misspelt.log`) |
| 12 of the planner's mutants | 10 killed on `AssertionError`, H33 and M2 survive as equivalent; all restored, sha equal (table below) |
| My own mutants (4) and probes (7 render, 3 Node) | below |
| Not re-run (R100, the implementer's logs and CI cover them) | `typecheck:app` 0, `test:app` 37 of 37, `test:unit` 1122 of 1122 with the Hermes guards, the six-file routes render gate 38 of 38, `export:web` OK (`scratch/p4-t17/gate-*.log`); full render suite, iOS export, database and edge suites, `test:ops` are CI's |

## Findings

### Blocker

None.

### Major

None.

### Minor

**m1. The sign-out erase can be undone by a registration still in flight, so the push record stays behind.**

- The production order is erase first, end the session second: `SettingsScreen.tsx:223` (`diary.eraseForSignOut()`, which ends in `eraseDeviceSettings()`), then `:234` (`services.signOut()`). A registration whose PUT is still in flight answers between the two. The transport's epoch guard (`client.ts:414`, `session_changed`) does not fire because the epoch has not moved yet, so `registerPushIfNeeded` writes the record (`pushRegistration.ts:144`) after the erase.
- Probe G2 (`tree/apps/app/src/slips/push/PushRealTransportProbe.render.test.tsx`, the real `createV1Transport` with a held `fetch`, the real order: erase, answer 204, end the session). After all three, `jotbun.wallet.push-device` holds `{"token":"ExponentPushToken[cccc...]","platform":"ios","language":"th","slipNotices":true,"session":"f09c84b1...36a84","at":1794602397566}` (`probe-transport.log`). Probe G3 (session ends first): no record, so the guard protects that order. Probe G (a fake client, `probe-lock.log`) shows the same.
- Effect: an Expo push token and the SHA-256 of a dead session id remain in AsyncStorage after sign-out, until the next registration overwrites them or the next sign-out erases them. The next session's hash differs, so the next run registers again: no wrong behaviour, and the binding itself never leaks. The brief's P7 says the sign-out erase removes the record; this is the one path where it does not. The window is a PUT's duration after sign-in or launch, so it needs a very quick sign-out (a wrong account, signed out at once).
- Fix: none belongs inside this task without touching sign-out. A host-side session re-check does not help, because the session is unchanged when the record is written. Options for the sign-out owner: drain the host's chain before the erase, or erase the device settings once more after `signOut()`. Accept and record it, or carry it.

**m2. The "one registration at a time, in order" chain is not held by any shipped case.**

- `PushHost.tsx:88` chains each run on the last. My own mutant OM1 (`runs.current = register(binding, language).catch(() => undefined)`, no chaining) survives `PushHost.render.test.tsx` (13 passed). My probe F (`registerDevice` held, a second session arriving meanwhile) kills it: `tokensWhileHeld` is 2 instead of 1 (`mutant-logs/OM1-PushLockProbe.render.test.tsx.log`). The brief's P7 and P13 present the chain as a guarantee ("two changes never race").
- Effect if it regressed: two PUTs race and the last writer's record can name the older session; it self-heals at the next run because the hash differs.
- Fix: add probe F as a case in `PushHost.render.test.tsx` (about 20 lines, in `PushLockProbe.render.test.tsx`, the case named PROBE F).

**m3. (A decision, not a defect.) iOS provisional status and Android 12 and below read as granted, so the phone can register before the person sees any push prompt.**

- `permissionOf` (`pushRegistration.ts:39-42`) counts `ios.status === 3` as granted, as `reminders.ts:52-55` does. The reminders ask iOS with `allowProvisional: true` (`notificationsPort.ts:53`), which iOS grants without a prompt, so a person who only turned on daily reminders already reads as granted. Android 12 and below has no runtime notification permission and reports granted unless the person switched the app's notifications off (platform behaviour as I read it; not run).
- Once D33 gives a project id, such a phone registers at the next launch with slip notices on by default. Under P4-T5 only `slips_ready` honours the switch; `statement_parsed`, `export_ready` and `month_recap_ready` go to every live device (the recap is due on the 1st at 09:00, S9). P4-T21 asks "when undetermined" (plan line 1096), so for these phones it never asks.
- The request side holds the line: `requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: false, allowSound: true } })` (`pushRegistration.ts:57`), pinned by G30 and the port case. The plan says only "reads the permission, a denied one sends nothing", and the brief's P5 chose "as the reminders read it" knowingly, so this is within the spec.
- The question for the owner and P4-T21: should a quiet reminders authorization count as the person's yes to server pushes? If not, the push port alone can read provisional as `undetermined`, and P4-T21's `ask()` (no provisional) then prompts. Decide before D33 turns registration on.

**m4. "The app's only handler" is a convention, not a pinned fact.**

- `setNotificationHandler` appears once in `apps/app/src` and `app`, at `PushHost.tsx:110`; no test fails if another module calls it. SDK 58 replaces the earlier handler on each call (`NotificationsHandler.js:62-74`), and the reminders work (P2-T36) is in flight in another session and touches `src/notifications/*`. A second call silently brings back banner, list and sound for reminders and pushes, undoing R126.
- Fix: one Node source case, as the layout case reads `_layout.tsx`: no `.ts` or `.tsx` under `src` or `app` other than `slips/push/PushHost.tsx` contains `setNotificationHandler(`.

### Nit

- **n1. No shipped case runs the real `LockGate` over the host.** The render test supplies the cover as a `LockCoverContext` value; the composition is pinned by two source cases (the `_layout.tsx` placement, `lockModel.test.ts` for `WalletRoot`). My probes A to E run the real gate with `fakeLocalAuth` and AppState events and all pass (below). `PushLockProbe.render.test.tsx` can be adopted as it stands (five cases).
- **n2. `pushProjectId` takes only a lowercase RFC 4122 UUID** (`isUuid`, `packages/contracts/src/v1/validation.ts:234`). EAS writes lowercase v4, so nothing breaks, but an id pasted in capitals is `no_project` forever and silently.
- **n3. A failing registration leaves no trace anywhere** (no log by rule, no count-only event; 1D has no push event). After D33 a 4xx on every phone would be invisible. For P6C, not this task.
- **n4. The route effect's two calls are the only unguarded ones in the host** (`PushHost.tsx:127-128`). `router.push` cannot throw there with expo-router 58.0.21 (it enqueues; `unboundRouter` throws only before the first render, `global-state/router.js:320-346`). `clearLastNotificationResponse()` throws `UnavailabilityError` if the native method is missing (`NotificationsEmitter.js:127-131`). A throw would reach the root error boundary, unlike every other failure in the host. Theoretical with the pinned 58.1.5; a `try/catch` around the pair would match the file's style.

## The controller's focus list

**The session (P6).** The record `jotbun.wallet.push-device` is `{ token, platform, language, slipNotices, session, at }`, with `session` the 64-hex SHA-256 of the binding. The binding lives only in memory (the host's `last` and `register`'s argument). Probes:
- Real `createSlipResources` over a recording transport: one `PUT /v1/devices`, options keys `body` and `validate` only, body keys exactly `language, platform, push_token, slip_notices`, `parseDeviceRegistration` accepts it, the body and the record hold no binding, the record holds the hash (`pushProbe.test.ts`, `probe-node.log`).
- Real `createV1Transport` with a held `fetch` (the G2 file): the wire body is the same four fields, and the headers are `Accept`, `Authorization`, `Content-Type`, `X-GoGoSpend-Client` (plus `X-GoGoSpend-Analytics: off` when analytics is not allowed, `client.ts:363`). No binding or hash on the wire.
- The four source files contain no `console`, analytics or logging call (grep: only a comment). The shipped privacy case spies five console methods and a recorded analytics bus across a refused and a successful registration, three taps and all four presentations. Mutants G20, G25, H11 and H27 (body carries the session, record keeps the binding, host keeps the binding, a log names the route) are killed.

**Registration (P5).** The order is as written in `pushRegistration.ts:133-148`: no project (`no_project`), signed out (`not_allowed`, nothing read), the permission read through `getPermissionsAsync` and never `request` (G3 and G34), the token, the compare, the PUT, then the record. The record is written only after the PUT answers (G17 killed; a refused PUT leaves none). It goes again on a changed token, platform, language, switch or session, or at a week (`nowMs - at < PUSH_RENEW_MS`, the boundary pinned at RENEW-1 and RENEW).
- A failed PUT answers `failed`, keeps no record and is not retried in the session: the next launch, session change, language change, or P4-T21's own call sends again.
- A token fetch that throws answers `failed`, nothing sent, same retry.
- Two runs at once: the host chain serialises them (probe F: `tokensWhileHeld` 1, two PUTs, the final record names session b), though no shipped case holds it (m2). Two direct `registerPushIfNeeded` calls overlapping both send (probe: `["registered","registered"]`, two sends). The PUT is an upsert on `session_id`, so it is harmless, but P4-T21 should not call the function beside a host run without the chain.

**The lock and the tap (P7).** `<PushHost />` is the first child inside `<WalletRoot>` (`_layout.tsx:47-49`), and `WalletRoot` puts its children inside `LockGate` while the `wallet` area is on (`WalletRoot.tsx:22-27`); with the area off there is no gate and `hidden` is always false. `hidden = !setting.ready || view.locked || view.covered` (`LockGate.tsx:350`), and the reducer covers on every `inactive` and locks and covers on `background` (`lockModel.ts:62-77`). Probes with the real gate (`PushLockProbe.render.test.tsx`, `probe-lock.log`), all passing:
- A, cold start with the lock on and a waiting response: nothing routes while the prompt is cancelled (checked twice, `cleared` 0), one route and one clear after a new opening unlocks, and a later lock and unlock cycle does not repeat it.
- B, a warm tap while the app is away, a cancelled prompt, then success: no route until the unlock, one route, one clear. The app is already `locked, covered` from the `background` event when the tap lands, so the order of the tap and `active` does not matter.
- C, a tap while only `inactive` (covered, not locked): waits, then goes once at `active`.
- D, lock off: a warm tap goes at once; a cold-start response goes after the setting is read.
- E, a local reminder tapped beside a waiting push: opens nothing, and does not clear or replace the push.
- Mutants H1 (route under the lock), H25 (a routed tap goes again), L3 (host above the gate) are killed.

A route cannot show behind the lock or go twice. The shipped test only fakes the cover (n1), but the real gate agrees. Neither expo-router (58.0.21) nor expo-notifications (58.1.5) routes a notification URL by itself (no `data.url` handling in `expo-router/build`), and no other app code adds a handler, a listener or a token call (grep). `router.push` at a cold start: expo-router binds its imperative router in a layout effect and queues actions (`routingQueueContext.js:134`, `RoutingQueueDrainer.js`), so a tap before the navigator mounts is queued, not thrown. It stays a device check (P15).

**The routes (P8, n11).** The four paths exist as routes with their own area guards and redirects (`app/spend/slips/review.tsx` still P4-T12's redirect, `app/spend/import.tsx`, `app/settings/privacy.tsx`, `app/spend/recap/[month].tsx`, which re-checks the month with its own regex). They are typed: my misspell probe fails `typecheck:routes` with TS2820 three times. No `PushData` value steers elsewhere: 17 hostile shapes in my probe (a trailing newline, path traversal, Arabic-Indic digits, month `2026-00` and `2026-9`, array `ref` and `kind`, `slips_ready` with `ref: "null"` or `undefined`, a traversal id, an uppercase id with a newline, a `__proto__` key, inherited fields, an extra key, a JSON string, an array, a number) all answer null, and the only outputs are the four literals (probe); the shipped case adds month `2026-13`. n11 is carried: `pushRouting.test.ts` asserts the literal pathnames and the recap object; the `run=manual` half is P4-T18's.

**The foreground handler (R126, P3 (a)).** Confirmed: a local reminder is hidden while the app is open, and the push kinds show as the plan says. Exactly what changed:
- Today (base): no `setNotificationHandler` in the app. expo-notifications 58.1.5 installs its own handler at load, answering `shouldShowBanner`, `shouldShowList`, `shouldPlaySound` and `shouldSetBadge` all true for every foreground notification (`NotificationsHandler.js:23-30, 96-101`). A weekly local reminder that fires with the app open shows as a banner, lands in the list and plays the sound (no badge, since it sets none).
- After: `PushHost` sets the only handler (`PushHost.tsx:110`) and `presentation` decides (`:47-50`). Not `PushData`, which is every local reminder (its content has no `data`): all four false, so no banner, **not in the list either**, no sound, no badge. `slips_ready`: list only. `statement_parsed`, `export_ready`, `month_recap_ready`: banner and list. None sets a sound or a badge. Pinned for all four kinds and for `undefined`, `{}` and a malformed `slips_ready`; H2, H3, H4, H5, H6 killed (I ran H3).
- Unchanged: delivery while the app is in the background or closed (the OS presents; a push's `sound: 'default'` still sounds then), reminder scheduling, a reminder tap (opens the app, routes nowhere), and the web (no foreground handling).
- Two small windows: until the host's effect resolves the module import the module default applies; and the handler must answer within 3 seconds or native presents in full (`NotificationsHandler.js:36, 40-41`); `presentation` is synchronous, so it answers at once.
- The owner can reverse it with one line (`presentation`'s non-push branch). If the intent is "no banner, but keep it in the list", that branch is `LIST_ONLY`, which is what mutant H3 tests.

**The permission (P3 (b), P10).** Alerts and sounds only: the exact request object is pinned in two cases and G30 is killed; no `allowProvisional`. The read side counts provisional as granted (m3). `useNotificationPermission()` answers `undetermined` until the phone replies, reads again at each `active`, `ask()` is the only request in the task (a failed request counts as `denied`), `openSettings()` is best effort, and off the phone it answers `denied` and asks nothing (N1 to N13 by the planner). For P4-T21: `ask()` does not trigger a registration, so call the host's path after a grant (P16), and see m3.

**The config (P3 (c)).** Only the iOS entitlement `aps-environment: development` changes. I read the installed plugin: `withNotificationsIOS.js` defaults `mode` to `development` and `enableRemoteNotifications` to true, which sets that one entitlement if absent; the empty `sounds` list makes the Xcode step a no-op; no `UIBackgroundModes` unless `enableBackgroundRemoteNotifications`. `withNotificationsAndroid.js` with no icon, large icon, colour or default channel adds nothing (it only removes metadata and icon files that are not there; this project has no `android/`). The planner's introspection (`p4-t17-planner/logs/gate/config-introspect.json`) shows `ios.entitlements` as `{"aps-environment":"development"}` and an Android block with no notification entry. Two practical consequences, already in the brief: a local iOS build under a team without the Push capability will not sign once prebuild adds the entitlement; Android keeps its default small icon and channel until `icon`, `color` and `defaultChannel` are set.

## Mutants

Sampled 12 of the 94 (planner's runner, my copy, each under the heavy lock; every failing case an `AssertionError`; every file restored, sha256 equal):

| Mutant | What it breaks | Result |
| --- | --- | --- |
| G3 | registering asks for the permission | killed, 2 failing |
| G17 | the record is kept before the server answers | killed, 1 |
| G20 | the body carries the session | killed, 1 |
| G25 | the record keeps the binding itself | killed, 1 |
| G30 | the request asks for the badge | killed, 1 |
| H1 | a tap routes under the lock (the plan's) | killed, 2 |
| H3 | a local reminder shows in the list | killed, 1 |
| H25 | a routed tap goes again | killed, 1 |
| L3 | the host above the lock gate | killed, 1 |
| H27 | a log line names the route | killed, 1 |
| H33 | no opening response taken as one | survives, 13 of 13: equivalent |
| M2 | expo-constants loaded again each run | survives, 13 of 13: equivalent |

Both equivalences hold. H33: with `opened === null`, `take(null)` throws a TypeError at its destructure, but only after `setNotificationHandler` and `addNotificationResponseReceivedListener` have run and with nothing after it in that `.then`; the `.catch(() => undefined)` swallows it, so nothing observable differs. M2: runs are serialised, so no two `import('expo-constants')` overlap (the hazard P9 describes), and Metro answers the one module either way.

My own mutants (`own_mutants.py`, logs in `mutant-logs/`):
- **OM1** no chaining of registrations: **survives** the shipped render file (13 passed), killed by my probe F (m2).
- **OM2** the route effect ignores `hidden` in its dependencies: killed (2 failing: the tap-waits case and the privacy case).
- **OM3** the last session is module-wide, so a language change with the same session no longer registers: killed (3 failing).
- **OM5** a failed registration keeps a record: killed (1 failing).

## Probes (all in the scratch folder)

| Probe | File | Result |
| --- | --- | --- |
| A to E, the real `LockGate` under the host | `tree/apps/app/src/slips/push/PushLockProbe.render.test.tsx` | pass |
| F, two registrations in order | same | pass on the real code, fails under OM1 |
| G, erase during a flight (fake client) | same | record stays behind (m1) |
| G2 and G3, the real transport and the real sign-out order | `PushRealTransportProbe.render.test.tsx` | G2 record stays behind (m1); G3 no record |
| wire, concurrent, hostile routes | `pushProbe.test.ts` | pass (3 of 3) |

The G2 file also logs two unrelated unhandled `getValueWithKeyAsync` TypeErrors from `ThemeProvider` reading an unmocked `expo-secure-store` once the probe sets `Platform.OS` to iOS; that is the probe's harness, not the host.

## What CI must still show

- `Typecheck, unit, API, build`: `typecheck:app` and `typecheck:routes` exit 0, `test:app` and `test:unit` with the Hermes guards (the new files add `TextEncoder`, `import()` of `expo-notifications` and `expo-constants`).
- `Exports (web and iOS bundles)`: the iOS export is the one thing nobody has run. It compiles the new dynamic imports through Hermes and resolves the `expo-notifications` plugin entry.
- `Render (every file but the per-section suites)`: `PushHost.render.test.tsx` (13), `RootLayout.render.test.tsx` (8), and the four routes files. The three per-section shards, `Edge Worker`, `SQL integration and ops` and `Release image and smoke` are untouched by this diff and must stay green.

## Notes for later tasks

- **P4-T21:** after `ask()` grants, trigger a registration through the host's chain (expose an `enqueue` on it) rather than calling `registerPushIfNeeded` beside a host run; write `'0'` or `'1'` under `slip-notices`; decide m3 first, since a provisional status makes `ask()` unnecessary and `status` already `granted`.
- **P2-T36 (reminders):** do not call `setNotificationHandler`; reminders carry no data and so show nothing while the app is open, not even in the list. Pin it with the m4 case.
- **Sign-out owner (P6B or 1C):** erase-then-end-session lets an in-flight push registration recreate `push-device` (m1). Drain the push chain first, or erase again after `signOut()`.
- **D33 and P6C:** put a lowercase UUID in `extra.eas.projectId` (n2); check the plugin `mode` for store builds; set `icon`, `color` and `defaultChannel` for Android; a local iOS build needs a team with Push. Device checks beyond the brief's list: Android `slips_ready` arrives with `ref: null` (the serializer keeps JSON null, `NotificationSerializer.java:149`, so `isPushData` should pass; confirm on a device), and the cold-start `router.push` on both OSes. Consider a count-only registration-failure event (n3).
- **If notification categories or actions are ever added:** `take()` treats every response as a tap and ignores `actionIdentifier`; a dismiss action would route.

VERDICT: Approved
