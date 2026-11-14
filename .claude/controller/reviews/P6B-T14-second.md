# P6B-T14 second review: remote flags after yes, flag exposure and the rollout layer (PR #469, `f6c976ca`)

Second reviewer (privacy and consent; this task touches no money, wallet, points, payment or sign-in code), Claude Sonnet 5.5. Read-only: nothing edited, committed or pushed in any worktree, the main checkout untouched, every probe in a scratch copy (`git archive f6c976ca` into `scratch/p6b-t14-second/tree`, `node_modules` linked entry by entry, the three workspace links re-pointed). I wrote this before reading any other review of the task. `git fetch` was run first; at the end `git status` in the T14 worktree is empty and all 20 reviewed files in my scratch tree equal the commit byte for byte.

Range: `origin/claude/p1a-vault-core...f6c976ca` on `p6b/t14-remote-flags`: 20 files (9 added, 11 modified), only `apps/app/src/analytics`, `apps/app/src/rollout` and the receipt. `git diff --check` is clean, and no changed file holds U+2013 or U+2014.

## Result in one paragraph

The consent machinery the brief asks about holds. I attacked it with ten race probes on the real controller (account switch, sign-out, no then yes, kept read and load in flight, storage failures) and with the real `@posthog/core` client behind the real gate: no flag request starts outside yes, nothing in flight is pushed or kept after a drop, no payload reaches any event, and with no key nothing is asked. The plan's test names, interfaces and file list are all met. The one real defect is outside the paths the brief lists: the PostHog SDK persists what `updateFlags` pushes, so after a relaunch it holds the last session's flags before the controller's first `reset()`, and a crash report (sent without consent by default) carries `$active_feature_flags` and every `$feature/<key>` (M1). It is a one-line gate fix, which I verified in my scratch copy. Four minors (a failing kept read stops the load; `redirect: 'error'` does nothing on React Native; `useRollout` mounted before the install never hears the flags; no test pins payload stripping on a crash report) and three nits follow. CI on the PR is green on all nine jobs.

## CI (PR #469, head `f6c976ca`, run 43533985946)

All 9 jobs pass (`gh pr checks 469 --repo mygogocash/jotbun`; logs in `scratch/p6b-t14-second/ci-job-*.log`). The jobs were still queued when I started and finished while I worked, so this is the final state.

| Job | Result | Counts from the job log |
| --- | --- | --- |
| Typecheck, unit, API, build | pass | `typecheck`, `typecheck:app`, `typecheck:routes` clean (no `error TS` in the log); `test:app` 37 of 37; `test:unit` 1128 of 1128; `test:dev` 7 of 7; `test:api`; `build -w gogospend-api` |
| Render (every file but the per-section suites) | pass | 133 of 133 files, 1699 of 1699 tests |
| Render, per-section suites (3 jobs) | pass | 2 of 2 files each |
| Exports (web and iOS bundles) | pass | `export:web` and `export:ios` |
| Edge Worker | pass | `test:edge` 21 files, 214 tests; `test:edge:workers` 38 files, 882 tests (1 todo); `test:edge:db` 3 files, 12 tests |
| SQL integration and ops | pass | `test:ops` 111 of 111 |
| Release image and smoke | pass | |

The implementer's local gate logs agree with CI where they overlap: `test:unit` 1128 of 1128, `test:app` 37 of 37, 35 render files (676 tests).

## What I ran, and what I did not

- **Focused files**, scratch copy: the five Node files (`remoteFlags`, `controller`, `gate`, `neverSent`, `rollout`) `ℹ tests 64`, `ℹ pass 64`, `ℹ fail 0` (`focused-node.log`). Seven render files under the heavy lock via `locked.sh` (on my first render run another agent held it and the script waited; it gave back only its own): T14's four, `RootLayout`, `PrivacyScreen`, `AnalyticsConsentScreen`: `Test Files 7 passed (7)`, `Tests 62 passed (62)`, no act warning or stderr (`focused-render.log`).
- **`tsc --noEmit` in `apps/app`** (what `typecheck:app` runs) on the scratch tree: the only two errors are in my own probe file (`typecheck-app.log`); none in any reviewed file.
- **14 of the planner's mutants**, with the planner's runner on my tree: C1, C4, C6, C9, C11, C14, C15, C16, G2, G5 (Node) and A1, A3, K3, U1 (vitest): 14 of 14 killed, every failing case an `AssertionError`, every touched file restored with an equal sha256 (`mutants-planner-node.out`, `mutants-planner-render.out`).
- **9 mutants of my own** (`mymut.py`, `mymut.out`): 8 killed, 1 survived (M10, m4 below).
- **Probes**, all in `scratch/p6b-t14-second/tree/apps/app/src/`:
  - `analytics/probeRealSdk.test.ts` (7 cases): a `PostHogCore` subclass with in-memory storage, `createAnalytics` over it, and the real `gateOutgoing` as `before_send`, so the SDK builds the real event properties. Logs: `probe-realsdk*.log`.
  - `analytics/probeRaces.test.ts` (10 cases): `probe-races.log`.
  - `rollout/probeInstallLate.render.test.tsx` (1 case): `probe-install-late.log`.
- **Reads**: the installed SDK source (`@posthog/core` 1.62.0, `posthog-react-native` 4.85.1 `dist`), React Native 0.88.0's `fetch` and `whatwg-fetch` 3.6.20, the edge proxy (`apps/edge/src/analytics/posthog-proxy.ts`), the diffs of all nine CI-waiting PRs (`pr-<n>.diff`).
- **Not run**: whole suites, `export:web` and the iOS export (CI's, green); database suites (Docker stopped; CI ran them); anything against hosted PostHog (no key exists, no network); anything on a device.

## Findings

### Blocker

None.

### Major

**M1. Flags the SDK persisted ride on crash reports that leave before consent is known (the relaunch window), by default.** Reproduced with the real SDK and the real gate.

- **Mechanism.**
  - `updateFlags` stores what it is given "exactly as if returned by the flags endpoint", persisted (`@posthog/core/src/posthog-core.ts:1312-1375`). The React Native client keeps every persisted key in its file storage (`_persistence` defaults to `'file'`; `posthogOptions.ts:60-75` does not set it), and `disableRemoteFeatureFlags` stops the SDK from clearing them at init.
  - After a relaunch the new SDK client therefore holds the last yes's flags, and `getCommonEventProperties` adds `$active_feature_flags` and a `$feature/<key>` per flag to every event it builds (`posthog-core.ts:213-227`).
  - The controller only empties them with `reset()`, which first runs at the first `setAccount` (`controller.ts:299`). That comes after `await fetchAccountId()` (`AnalyticsUpkeep.tsx:56-61`), so a launch with a stored session and no network never reaches it until a later follow.
  - Until then the controller is `loading`, so the gate passes only `$exception`, and does so by default: `crashReportsWithoutConsent` is on unless the env is `'0'` (`env.ts:15`). `scrubException` is a deny-list: it drops `$exception*` and `$issue*` and keeps every other property (`gate.ts:71-74`).
- **Evidence.** `probeRealSdk.test.ts`, "RELAUNCH after a yes": session 1 reaches yes and pushes flags with payloads; session 2 is a new client and controller over the same storage, still `loading`, and an `$exception` leaves with
  `{"$active_feature_flags":["rollout-travel","exp-budget-question"],"$feature/rollout-travel":true,"$feature/exp-budget-question":"no_presets", ..., "$exception_list":[{"value":"Error","type":"Error"}]}`.
  The same SDK's `getDistinctId()` returns the previous analytics id there, so the report is attributable to it. That part is 1D's existing behaviour (the controller's header comment says as much), but flags are new with this task. The probe `RELAUNCH, then setAccount resets` passes: once `reset()` runs, nothing leaks. After a no in the same session nothing leaks either (probe "a crash report after a no ... carries no flag values" passes).
- **What does not leak.** Payloads: they stay in the SDK's storage and are not an event property, and `strip()` would remove the two payload keys anyway.
- **Why it matters.**
  - Brief P4: "Flags never outlive the yes that loaded them", and it names crash reports as the reason.
  - Spec section 7, Consent: nothing analytic before yes; crash reports are scrubbed.
  - Plan Review Focus 1.
  - Every test client starts empty and clears on `reset()`, so nothing restarts a client over persisted state.
- **Severity.** Major because a stated guarantee fails in the default configuration with a reproducible probe. The data is flag keys and variant labels, not payloads or anything typed, and the report already carried the old id, so the controller may downgrade it to minor if it accepts the window. No PostHog key exists yet, so nothing is sent today.
- **Fix, verified in my scratch copy.** In `scrubException`, skip `$active_feature_flags` and any key that starts with `$feature/` when `!policy.analytics`:
  ```ts
  if (!policy.analytics && (key === '$active_feature_flags' || key.startsWith('$feature/'))) continue;
  ```
  With it the relaunch probe passes and `gate.test.ts`, `neverSent.test.ts` and my probes pass (13 of 13; `probe-fix-check.log`); the file was restored byte for byte. Add gate cases for an `$exception` carrying both, before and after yes. Optionally also call `posthog.updateFlags({}, {})` right after `new PostHog(...)` in `posthogClient.ts`, so a previous run's flags are not live at all until the controller pushes.

### Minor

**m1. A rejecting kept read stops the flags load.** `controller.ts:172` awaits `store.get(REMOTE_FLAGS_NAME)` unguarded, so if AsyncStorage rejects, `syncFlags(true)` throws before `flags.load` and the entry into yes loads nothing (the rejection is swallowed by `enterYes`'s `.catch`). It heals at the next foreground, because a refresh in yes skips the kept read. The receipt says a kept answer that cannot be read counts as none, which holds for unparseable text but not for a failing store. Probe R5 (`probe-races.log`) fails on it; the fix is a `.catch(() => null)` on the read, and R5 is a ready test.

**m2. `redirect: 'error'` does nothing on React Native, so the comment's guarantee does not hold on a phone.** `remoteFlags.ts:71` (and the comments at `:5-7` and `:45-46`, the receipt's "SKIPPED: device" item, the v1 client at `api/client.ts:38` and `:305`) rely on it. React Native 0.88.0's `fetch` is `whatwg-fetch` 3.6.20 over XHR (`react-native/Libraries/Network/fetch.js:15`), and its `Request` reads `credentials`, `headers`, `method`, `mode`, `signal`, `referrer` and `body` and never `redirect` (`whatwg-fetch/dist/fetch.umd.js`); XHR follows redirects. The device question can therefore be closed from source: a 30x from the proxy host is followed. Real risk is low and shared with the v1 transport: it needs the configured host to redirect, and the proxy passes an upstream redirect through (`posthog-proxy.ts:65-78`). Reword the comment and receipt, or check `response.url` against the host after the answer (it cannot stop a 307 or 308 body from being sent). Note it for P6C: set `EXPO_PUBLIC_POSTHOG_HOST` to a host that never redirects.

**m3. `useRollout` mounted before the controller is installed never hears the flags.** `useRollout.ts:13-16` reads `getAnalytics()` at each render and subscribes to what it found; `AnalyticsUpkeep.tsx:72-76` installs the controller in an effect, after the first render, and a rollout hook that rendered earlier holds a no-op subscription. Probe `probeInstallLate.render.test.tsx` fails: mounted with none installed, then `recordAnalytics({ flags })` installs and pushes, and the hook still shows `travel=false` (`probe-install-late.log`). It is the same house pattern as `useAnalyticsConsent` and P12 says so, and it clears the next time the component renders for any reason, so it is a minor for T14. It matters for T15, whose hooks gate real features. A `subscribe` on `setAnalytics` in `bus.ts`, read by `useRollout`, would close it.

**m4. Nothing pins payload stripping on a crash report.** Mutant M10 (`strip()` leaves `$feature_flag_payload` and `$feature_flag_bootstrapped_payload` when the event is `$exception`) survives all 64 cases. The code is right (`scrubException` ends in the shared `strip`, `gate.ts:77`), but the receipt and brief P9 claim "payloads are stripped from every event" and only the exposure event is tested (`gate.test.ts`, `neverSent.test.ts`). Add an `$exception` case carrying both keys, for both policies (this is also where M1's cases go).

### Nit

- **n1. The brief's P3 misdescribes the SDK on a partial answer.** It says PostHog's client keeps its previous flags in both the quota and the partial case. For a partial answer it upserts the flags that computed (`posthog-core.ts:871-888`, `!res.flags[key].failed`) over the current ones. The code's all-or-nothing choice is documented as a deviation and is defensible, but a flag that cannot be computed freezes every rollout at its last answer, silently. Tell the owner to keep the six flags' conditions simple.
- **n2. `parseKeptFlags` checks the shape, not the value types** (`remoteFlags.ts:89`). A kept `{"flags":{"x":1}}` is pushed as is, though `rolloutOn` and `variantOf` read any non-boolean, non-string as off and `control`, so it degrades safely.
- **n3. No throttle on loads.** Each foreground in yes is one `/flags` request, as the plan says (`AnalyticsUpkeep.tsx:94`). It is fine for a closed beta; PostHog bills flag requests.

## The controller's focus points, one by one

- **No flag request before a yes or after a no (P4 to P8): holds.**
  - `/flags` can start only from `enterYes` (`controller.ts:209`), which is reached only from the stale-checked tails of `load` and `answer`. The epoch moves at every `applyNo`, `openQuestion` and `setAccount` (`dropFlags`, `:151-157`), and is checked after the kept read (`:173`) and after the load (`:179`) with no await between the check and the push or the store write, so a late answer is never pushed or kept.
  - Own probes on the real controller, all pass: R1 account switch A to B with A's load in flight (nothing pushed or kept for either account); R2 sign-out with the load in flight (nothing pushed, A's kept flags erased); R3 no then yes before the old load answers (the old answer dropped, the new kept); R4 A's kept read in flight at a switch to B (only B's flags are ever pushed, A's erased); R10 a stored undelivered no outranks a server yes (no request at the launch).
  - A no found on the server at a foreground asks for nothing, because `load` reads the server before `enterYes`. A rejecting `remove`, `set` or `load` leaves the no in force and raises nothing unhandled (R6 to R8).
  - The store is a straight AsyncStorage pass-through (`walletStore.ts:24-30`), so a `set` and a later `remove` land in call order.
  - Known gap, as the brief says (P6): an account never named in a run keeps its kept flags until its next answer. They are values only and show only after that account's own yes.
- **No key, no client (P8): holds.** `appAnalytics.ts:35-43` builds a client only on iOS or Android with a key; `controller.ts:168` returns at `client === null`. C11 killed; the wiring case installs without a key first and asserts no request and `flag()` undefined.
- **The exposure and payloads (P9): holds, with M1 and m4.**
  - With the real SDK, a `$feature_flag_called` built by `getFeatureFlag` after yes carries `$feature_flag`, `$feature_flag_response`, `$used_bootstrap_value`, `$active_feature_flags`, `$feature/<key>`, `$lib`, `$lib_version`, `$session_id`, `$is_identified`, `$process_person_profile` and `$geoip_disable`, and no payload, though the SDK holds the sentinel payload (`probe-realsdk.log`).
  - Before yes the event is dropped. The request body is `{ api_key, distinct_id }` only, with none of the SDK's own `$anon_distinct_id`, `$device_id`, groups or person properties. The plain global `fetch` carries no credentials, and nothing patches `fetch` globally.
  - A flag read after a push for a key the answer lacks still passes the gate, with `$feature_flag_error: flag_missing` (a note for T15).
- **The shared helpers (P11): holds.**
  - `recordAnalytics` keeps its signature, its fields and its `sent` stream (flags never enter `sent`); with no `flags` option its load answers null and nothing is pushed. `fakeConsent` gains two no-ops and passes no `flags` dependency.
  - I grepped the diffs of all nine CI-waiting PRs (#456, #460 to #467): none contains `PostHogLike`, `createAnalytics(`, `startSessionRecording` or `stopSessionRecording`, and none builds an `Analytics` literal (the one `Analytics` match, at line 89 of #467's diff, is a parameter type). The PRs whose diffs add calls (#456, #460, #465, #466, #467) call `recordAnalytics()` with `consent` only, or read `Recorded`; #464's diff adds none, its tests reach the helpers through existing ones.
  - Together with the planner's logs in `proof/compat/`, the additive claim holds. The one thing it cannot cover is a new `PostHogLike` literal in a later PR, which now needs the two methods.
- **The SDK (P2, P10): holds.**
  - `apps/app/package.json:49` pins 4.85.1 and the lockfile resolves `@posthog/core` 1.62.0.
  - Read in the source: `/flags/?v=2` at `posthog-core-stateless.ts:810`; `reset()` empties the flags when `disableRemoteFeatureFlags` is set (`posthog-core.ts:191-198`) and the React Native `reset` keeps only install and device ids; `updateFlags` replaces and persists (`:1328-1375`); `getFeatureFlag` captures once per flag and value (`:1048-1100`); every internal reload honours `disableRemoteFeatureFlags` (`:654`, `:1245`, `:1268`), and the one config-only request is gated by `preloadFeatureFlags !== false && !disableRemoteFeatureFlags` (`:777`).
  - `posthogClient.ts:23-24` forwards both methods as given; the PostHog options file is unchanged, as the plan says. The only gap is M1.
- **`useRollout` (P12): holds, with m3.** `useSyncExternalStore` over `analytics.subscribe`, `flag(ROLLOUT_FLAGS[key])` as the snapshot; with nothing loaded `rolloutOn(key, undefined)` returns the all-off default (`rollout.ts:24`); a push, a no, a sign-out and a switch all notify (`setStatus` or `pushFlags`).

## Mutants

| Set | Ids | Result |
| --- | --- | --- |
| Planner's (14 of 55) | C1 C4 C6 C9 C11 C14 C15 C16 G2 G5 A1 A3 K3 U1 | 14 killed, 0 survivors, 0 killed by an error, 0 not restored |
| Mine (9) | M1 kept flags re-read on every refresh; M3 payloads dropped at the push; M4 crash report not stripped; M5 `dropFlags` erases nothing from the store; M6 epoch captured after the kept read; M7 `flag()` readable in `loading`; M8 no analytics-id guard; M9 a refreshed answer not kept; M10 payloads kept on a crash report | M1, M3 to M9 killed; **M10 survived** (m4) |

## Notes for later tasks

- **P6B-T15** (rollout wrappers): `useRollout` reads `getAnalytics()` at render, so a hook mounted before the install stays at its default until it next renders (m3); close it in `bus.ts` or test the first render after the install. A read of a rollout the owner has not created sends an exposure with `flag_missing` and returns `false` from a non-empty answer, but the default from an empty one; with all-off defaults that is invisible, but it matters if Q10(a) turns a default on. Land T15 after the owner's flags exist, as the plan says.
- **P6B-T16** (experiments): `readExperiment` is the exposure and it sits in render paths, so it counts people who rendered a screen, not only people who saw the arm; read once per showing, as the receipt says.
- **1D lane**: `scrubException` is a deny-list, so any property the SDK adds (flags today, anything an upgrade adds tomorrow) leaves on a crash report without consent. An allow-list of the common properties would close the class; M1's one-liner closes only today's.
- **Owner and P6C**: create `rollout-bun-ai`, `rollout-slip-import`, `rollout-travel` and the three `exp-*` flags with exactly those keys; keep their conditions simple (n1); set `EXPO_PUBLIC_POSTHOG_HOST` only to a host that never redirects (m2); each foreground in yes is one billed flags request (n3).

VERDICT: Needs fixes
