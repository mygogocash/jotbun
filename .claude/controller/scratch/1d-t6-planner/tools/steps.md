## Step 0: Check the start

1. The worktree is clean and contains P2-T2:
   ```bash
   /usr/bin/git -C WT status --short
   /usr/bin/git -C WT log --oneline -3
   test -f APP/src/wallet/WalletRoot.tsx && echo WalletRoot-present
   grep -c '"react-native-reanimated": "4.7.1"' APP/package.json
   grep -c '<WalletRoot>' APP/app/_layout.tsx
   ```
   Expected: no status lines; `WalletRoot-present`; `1`; `1`. If WalletRoot is missing, stop: **BLOCKED: P2-T2 has not merged into the integration branch; 1D-T6 starts after it.**
2. Sync (protocol step 1): `/usr/bin/git -C WT fetch origin claude/p1a-vault-core`, then `/usr/bin/git -C WT merge --no-edit origin/claude/p1a-vault-core`. Install (protocol step 2), from WT: `npm ci --ignore-scripts --no-audit --no-fund`.
3. The planner's files are intact: `cd PL && shasum -a 256 -c SHA256SUMS | grep -v ': OK$'`. Expected: nothing printed.
4. The 13 files this task changes are the ones the planner proved on:
   ```bash
   cd PL/orig && for f in $(find . -type f | sort); do cmp -s "$f" "WT/$f" || echo "differs: $f"; done
   ```
   Expected: nothing printed. If any file differs (the integration branch moved, or P2-T2 merged with changes), run `python3 -I PL/tools/edits.py WT check`. If every line says `Find occurs 1 times` or `appends to`, go on and list the differing files in the receipt's Deviations; the Step 1 checksum comparison will then differ for the files that differ, and the lockfile diff decides instead. Otherwise stop and report BLOCKED with that output.

## Step 1: Install the two packages and read their types

From WT:
```bash
cp package-lock.json S/lock-before.json && cp apps/app/package.json S/app-package-before.json
npm view posthog-react-native@4.85.1 peerDependenciesMeta scripts.preinstall scripts.install scripts.postinstall --json > S/prn-view.json; grep -c '"optional": true' S/prn-view.json; grep -c 'install' S/prn-view.json
npm view @posthog/react-native-plugin@2.13.0 peerDependencies scripts.preinstall scripts.install scripts.postinstall --json
npm view posthog-react-native time --json | grep '"4.85.1"'; npm view @posthog/react-native-plugin time --json | grep '"2.13.0"'
npm install --workspace gogospend-app --save-exact --ignore-scripts --no-audit --no-fund --before 2026-11-01T00:00:00Z posthog-react-native@4.85.1 @posthog/react-native-plugin@2.13.0
```
Expected: `14` optional peers and `0` install scripts; the plugin's peers are `{ "react": "*", "react-native": "*" }` with no install script; the dates `"4.85.1": "2026-10-30T17:21:39.091Z"` and `"2.13.0": "2026-10-30T17:20:53.253Z"`; `added 4 packages`.

Then:
```bash
shasum -a 256 package-lock.json apps/app/package.json PL/final/package-lock.json PL/final/apps/app/package.json
node PL/tools/lockdiff.mjs S/lock-before.json package-lock.json | cut -c1-120
diff S/app-package-before.json apps/app/package.json
npm install --ignore-scripts --no-audit --no-fund && /usr/bin/git -C WT diff --stat
npm ls -w gogospend-app posthog-react-native @posthog/react-native-plugin @posthog/core @posthog/types react react-native > S/npm-ls.txt; echo ls=$?; grep -E 'posthog|react@|react-native@' S/npm-ls.txt | grep -v deduped
node --test scripts/ci/lockfile-bindings.test.mjs 2>&1 | grep -E '^ℹ (pass|fail)'
grep -n 'captureTouches?: boolean' node_modules/posthog-react-native/dist/types.d.ts
npm run build -w gogospend-api > S/api-build.log 2>&1 && node apps/api/scripts/release-graph.mjs check | grep -E '"problems"'
```
Expected:
- The two worktree files have the same SHA-256 as the planner's: `b49999f184ea478f666cbfa073c995c36bbe11f1701d291290d0e5f74281ec13` (`package-lock.json`) and `1db967f0e313b6c35f566ef353042139bc9b1b97a951b4984ced0d963ddd9f11` (`apps/app/package.json`). Before the install they were P2-T2's `614c0eaf…` and `1a2b50ab…` (`PL/orig/`).
- The lockfile diff: `added 4` (`node_modules/@posthog/core 1.62.0`, `node_modules/@posthog/react-native-plugin 2.13.0`, `node_modules/@posthog/types 1.419.0`, `node_modules/posthog-react-native 4.85.1`, none with `INSTALL-SCRIPT`), `removed 0`, `changed 1` (only `apps/app: dependencies`), and `top-level keys equal except packages: true`.
- `apps/app/package.json` gains exactly `"@posthog/react-native-plugin": "2.13.0",` (after `"@gogospend/contracts"`) and `"posthog-react-native": "4.85.1",` (after `"phosphor-react-native"`).
- The second `npm install` says `up to date` and the diff stat still lists only those two files.
- `ls=0`, and exactly these eight non-deduped lines: `@posthog/react-native-plugin@2.13.0`, `@testing-library/react@16.3.3`, `phosphor-react-native@3.0.6`, `posthog-react-native@4.85.1`, `@posthog/core@1.62.0` and `@posthog/types@1.419.0` (both under `posthog-react-native`), `react-native@0.88.0`, `react@19.3.0`: one copy of React and of React Native.
- `ℹ pass 2`, `ℹ fail 0`.
- Two `captureTouches?: boolean` lines (53 and 166; the second is `PostHogSessionReplayConfig`'s): `REPLAY_TOUCHES_CAN_BE_OFF` is `true`.
- `"problems": []`.

## Step 2: The failing tests (RED)

From WT:
```bash
cp PL/final/apps/app/src/analytics/posthogOptions.test.ts PL/final/apps/app/src/analytics/analyticsServer.test.ts PL/final/apps/app/src/analytics/consentStorage.render.test.tsx PL/final/apps/app/src/analytics/AnalyticsUpkeep.render.test.tsx APP/src/analytics/
cp PL/final/apps/app/src/config/env.test.ts APP/src/config/
cp PL/final/apps/app/src/api/sharedV1.render.test.tsx APP/src/api/
cp PL/stubs/apps/app/src/analytics/posthogOptions.ts PL/stubs/apps/app/src/analytics/analyticsServer.ts PL/stubs/apps/app/src/analytics/consentStorage.ts PL/stubs/apps/app/src/analytics/AnalyticsUpkeep.tsx APP/src/analytics/
python3 -I PL/tools/edits.py WT red
```
Expected from `edits.py`: T1a, T2a to T2f, T3a, T3b, T4a, T4b and S1 each `Find occurs 1 times`; T1b, T2g and T4c `appends to`; then `edited` for `client.test.ts`, `controller.test.ts`, `bunSettingsErase.render.test.tsx`, `RootLayout.render.test.tsx` and `controller.ts`.

What the RED edits do (the exact text is in `edits.py`):
- T1: `client.test.ts`'s echo server also answers the request's `x-gogospend-analytics` header, and the test `requests carry X-GoGoSpend-Analytics: off unless this phone's answer is yes` is appended.
- T2: `controller.test.ts` imports `AccountChangedError`; the harness can hold the next write of a no (`holdNextNoWrite`, `releaseNoWrite`); `a yes waiting behind another call is refused once another account has signed in` expects the refusal to be an `AccountChangedError`; three tests are appended (Decision 2).
- T3: `bunSettingsErase.render.test.tsx` expects `ANALYTICS_CONSENT_KEY` last among the secure-store deletes.
- T4: `RootLayout.render.test.tsx`'s `expo-router` mock gains `useSegments: () => []`; it imports `getAnalytics` and `setAnalytics`; appended: a mock of `@mobile/api/sharedV1`, a counting mock of `@mobile/analytics/posthogClient`, and `the web build installs analytics with no PostHog client, even with a project key`.
- S1: `controller.ts` exports `AccountChangedError` (not yet thrown), so the tests load.

Run UNIT, APPT and RENDER, each with its output saved under S. Expected (planner, `logs/run/red-*.log`):
- UNIT: `ℹ tests 39`, `ℹ pass 29`, `ℹ fail 10`.
- APPT: `ℹ tests 33`, `ℹ pass 32`, `ℹ fail 1`.
- RENDER: `Test Files  5 failed (5)`, `Tests  11 failed | 11 passed (22)`.
- The 22 failures, each an `AssertionError` (no load error, no `TypeError`):
  - UNIT: `the client is built with replay masked, logs and network capture off, no lifecycle, flag, push or GeoIP traffic, and console errors not captured`; `replay can start after a yes: the installed SDK lets native replay keep tap positions out`; `read answers the consent, the analytics id and the weeks`; `a null analytics id is accepted, a malformed one is invalid_response`; `a server without the route falls back to /v1/me`; `setConsent sends exactly { analytics } and checks the answer`; `a yes waiting behind another call is refused once another account has signed in`; `a no given while a refresh is on its way is stored at once`; `PostHog stays off until its project key is set, and goes through the Worker proxy unless told otherwise`; `scrubbed crash reports are sent without consent unless the switch says 0`.
  - APPT: `requests carry X-GoGoSpend-Analytics: off unless this phone's answer is yes`.
  - RENDER: the seven `AnalyticsUpkeep` tests (`screens are sent as route patterns`, `a sign-out resets identity`, `a session already restored at start sets the account`, `another session clears the account at once, before the new account is read`, `a failed account read is tried again at the next foreground`, `coming to the foreground reads the answer again`, `the language and the AI switch reach every event`); `on native the answer is kept on this device only, read back, and erased`; `requests from the app carry X-GoGoSpend-Analytics: off unless this phone's answer is yes`; `the sign-out erase hook forgets the bun settings after the import draft, and a setting that cannot be erased never stops it`; `the web build installs analytics with no PostHog client, even with a project key`.
- Passing at RED on purpose (they pin what the fix must keep): `the no stored at the call lands before the queue writes and sends it`, `a yes waiting while the same account signs out and in again is still sent for it`, and two of the three `consentStorage` cases (the stub keeps nothing).

## Step 3: The code (GREEN)

From WT:
```bash
cp PL/final/apps/app/src/analytics/posthogOptions.ts PL/final/apps/app/src/analytics/analyticsServer.ts PL/final/apps/app/src/analytics/consentStorage.ts PL/final/apps/app/src/analytics/posthogClient.ts PL/final/apps/app/src/analytics/appAnalytics.ts PL/final/apps/app/src/analytics/AnalyticsUpkeep.tsx APP/src/analytics/
python3 -I PL/tools/edits.py WT green
(cd APP && npx tsc --noEmit); echo tsc=$?
```
Expected from `edits.py`: G1a to G7b each `Find occurs 1 times` (G2d `appends to`), then `edited` for `client.ts`, `sharedV1.ts`, `env.ts`, `AiCompanionProvider.tsx`, `DeviceDiaryProvider.tsx`, `controller.ts` and `_layout.tsx`; `tsc=0` with no output.

What the GREEN edits do:
- G1 (`client.ts`): `createV1Transport`'s options gain `analyticsOff?: () => boolean`; each request reads it and, when it answers `true`, sends `X-GoGoSpend-Analytics: off`.
- G2 (`sharedV1.ts`): `analyticsOff: () => getAnalytics()?.allowsAnalytics() !== true`; `getSharedAnalyticsServer()` (one `createAnalyticsServer` over the shared transport).
- G3 (`env.ts`): `posthogKey` (`EXPO_PUBLIC_POSTHOG_KEY`, trimmed, else `''`), `posthogHost` (`EXPO_PUBLIC_POSTHOG_HOST`, else the v1 URL without trailing slashes plus `/ingest`), `crashReportsWithoutConsent` (`EXPO_PUBLIC_CRASH_REPORTS_WITHOUT_CONSENT` trimmed `!== '0'`).
- G4 (`AiCompanionProvider.tsx`): an effect calls `getAnalytics()?.setCommon({ ai_enabled: value.enabled })` when `enabled` changes.
- G5 (`DeviceDiaryProvider.tsx`): `eraseWithDiary` adds `eraseStoredConsent().catch(() => undefined)` to the settings erased together; its comment names it.
- G6 (`controller.ts`): JSDoc on `setAccount` and `answer`; `answer('no')` writes the pending no at the call and the queue awaits that write first; the account check throws `AccountChangedError`.
- G7 (`_layout.tsx`): `import { AnalyticsUpkeep } from '@mobile/analytics/AnalyticsUpkeep';` after the `installAppAuth` import; `<AnalyticsUpkeep />` on its own line after `<LocaleUpkeep />`, same indent, inside `<WalletRoot>` (on a one-line return it would follow `<LocaleUpkeep />` on that line).

Run UNIT, APPT and RENDER again. Expected (`logs/run/green-*.log`): UNIT `ℹ tests 39`, `ℹ pass 39`, `ℹ fail 0`; APPT `ℹ tests 33`, `ℹ pass 33`, `ℹ fail 0`; RENDER `Test Files  5 passed (5)`, `Tests  22 passed (22)`.

Then every file matches the planner's:
```bash
cd PL/final && for f in $(find apps package-lock.json -type f | sort); do cmp -s "$f" "WT/$f" || echo "differs: $f"; done
```
Expected: nothing printed (if Step 0 found differing files, only those may differ, and `/usr/bin/git -C WT diff` for them must show exactly the edits above).

## Step 4: Mutation check

From WT: `python3 -I PL/tools/mutants.py WT S/mutants > S/mutants.out 2>&1; echo exit=$?`, then `cat S/mutants.out`.
Expected: `exit=0` and 31 lines, each `M<n>: killed (...)` ending `restored, sha256 OK`. Then `/usr/bin/git -C WT status --short` lists exactly the files of the Scope table, and the Step 3 `cmp` loop prints nothing again.

| Id | Mutant | Killed by |
| --- | --- | --- |
| M1 | `captureLog: true` (plan) | `the client is built with replay masked…` |
| M2 | `nativeCrashes: true` whatever the switch (plan) | the same |
| M3 | `client.ts` sends the header whenever `analyticsOff` is given, so also when the answer is yes (plan) | `requests carry X-GoGoSpend-Analytics: off…` |
| M4 | no `refresh()` on the foreground (plan) | `coming to the foreground reads the answer again` |
| M5 | `usePathname()` split into segments instead of `useSegments()` (plan) | `screens are sent as route patterns` |
| M6 | no account set when the instance resolves (plan) | `a session already restored at start sets the account` |
| M7 | `rageClickConfig: { enabled: true }` | `the client is built…` |
| M8 | `dropDeviceName` keeps `$device_name` | `the client is built…` |
| M9 | `captureTouches: false` even when touches cannot be off | `the client is built…` |
| M10 | `REPLAY_TOUCHES_CAN_BE_OFF = false` | `replay can start after a yes…` |
| M11 | fall back to `/v1/me` on any failure | `a server without the route falls back to /v1/me` |
| M12 | no upper bound on `weeks_since_signup` | `a null analytics id is accepted, a malformed one is invalid_response` |
| M13 | `setConsent` accepts any answer | `setConsent sends exactly { analytics }…` |
| M14 | the fallback reads `privacy.analytics: false` as `no` | `a server without the route falls back to /v1/me` |
| M15 | no write at the call | `a no given while a refresh is on its way is stored at once` |
| M16 | the queue does not wait for the write at the call | `the no stored at the call lands before the queue writes and sends it` |
| M17 | no queued write after the write at the call | `a yes being stored when the person says no cannot replace the no` (1D-T1's) |
| M18 | a plain `Error` for the refused yes | `a yes waiting behind another call is refused once another account has signed in` |
| M19 | any newer call refuses a queued yes | `a yes waiting while the same account signs out and in again is still sent for it` (and two of 1D-T1's) |
| M20 | no `setAccount(null)` when the epoch moves | `another session clears the account at once, before the new account is read` |
| M21 | the epoch counted as held before its read succeeds | `a failed account read is tried again at the next foreground` |
| M22 | no `language` in the common properties | `the language and the AI switch reach every event` (and the screens test) |
| M23 | no `ai_enabled` from `AiCompanionProvider` | `the language and the AI switch reach every event` |
| M24 | `eraseWithDiary` keeps the stored answer | `the sign-out erase hook forgets the bun settings…` |
| M25 | `sharedV1` sends the header only when the controller says no | `requests from the app carry X-GoGoSpend-Analytics: off…` |
| M26 | PostHog loaded on the web when a key is set | `the web build installs analytics with no PostHog client…` |
| M27 | the stored answer not limited to this device | `on native the answer is kept on this device only…` |
| M28 | extra keys accepted in the stored answer | `anything that is not exactly a stored answer reads as none…` |
| M29 | a failing secure-store read throws | the same |
| M30 | crash reports without consent only when the switch says `1` | `scrubbed crash reports are sent without consent unless the switch says 0` |
| M31 | the PostHog host keeps a trailing slash of the v1 URL | `PostHog stays off until its project key is set…` |

## Step 5: The gate

From WT, each output saved under S:
```bash
npm run typecheck:app
npm run typecheck:routes -w gogospend-app
npm run test:app
npm run test:unit
npm run test:render -w gogospend-app
npm run export:web -w gogospend-app -- --max-workers 2
(cd apps/app && CI=1 npx expo export --platform ios --output-dir S/ios-dist) && rm -rf S/ios-dist
node --test scripts/ci/lockfile-bindings.test.mjs
npm run test:ops
/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD
```
(`git diff --check` runs after the commit, Step 7; before it, run `/usr/bin/git -C WT diff --check` and `/usr/bin/git -C WT diff --check --cached`.)

Expected (planner, `logs/run/gate-*.log`):
@@GATE_EXPECTED@@

Not run, with the reason for the receipt: the edge and API gates and the database suites (nothing under `apps/edge`, `apps/api` or `packages/` changes; the release graph was checked in Step 1 because the lockfile changed). Native checks are SKIPPED (Step 7 of the plan): see the receipt template.

## Step 6: The receipt (R87)

`cp PL/final/1D-T6.receipt.md WT/docs/implementation/receipts/1D-T6.md`, then replace every `<...>` placeholder with your own results: the head you started from, the counts from Steps 2, 3 and 5, and the 31 lines of `S/mutants.out` under "Mutation check". If Step 0 found differing files, add them to Deviations. Change nothing else in the template unless a result differs, in which case you have already stopped (BLOCKED). Do not edit `premium-progress.md`.

## Step 7: Commit

Stage exactly the Scope files and the receipt:
```bash
/usr/bin/git -C WT add apps/app/package.json package-lock.json apps/app/app/_layout.tsx apps/app/src/analytics apps/app/src/api/client.ts apps/app/src/api/client.test.ts apps/app/src/api/sharedV1.ts apps/app/src/api/sharedV1.render.test.tsx apps/app/src/config/env.ts apps/app/src/config/env.test.ts apps/app/src/spend/v1/ai/AiCompanionProvider.tsx apps/app/src/spend/v1/DeviceDiaryProvider.tsx apps/app/src/mascot/bunSettingsErase.render.test.tsx apps/app/src/screens/redesign/RootLayout.render.test.tsx docs/implementation/receipts/1D-T6.md
/usr/bin/git -C WT status --short
```
Expected: 26 staged paths (`M ` or `A `): 13 modified and 13 added, nothing unstaged, nothing untracked. Write `S/commit.txt`:
```
Wire PostHog into the app behind the analytics bus: masked replay only after yes, scrubbed crash reports, route-pattern screens and consent read from the server

Adds posthog-react-native 4.85.1 and @posthog/react-native-plugin 2.13.0,
pinned. The client is built only on iOS and Android with a project key,
gated by 1D-T1's before_send, with native rage taps off. AnalyticsUpkeep
sends route patterns, follows the session's account (cleared at once when
the epoch moves) and reads the answer again at every foreground. Requests
carry X-GoGoSpend-Analytics: off unless the answer is yes. A no is stored
at the call; a refused yes is an AccountChangedError.

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
```
Then `/usr/bin/git -C WT commit -F S/commit.txt` and `/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD` (Expected: nothing printed).

## Your final message

As the protocol says: `STATUS: DONE` or `STATUS: BLOCKED` first; the commit SHA and branch; the files; RED and GREEN counts; the mutants (31 killed, or the survivors); each gate command with its result; SKIPPED items; deviations, and "review first: Decisions 1 to 3 of the brief".

## Appendix A: `apps/app/src/analytics/posthogOptions.ts`

```ts
@@posthogOptions.ts@@
```

## Appendix B: `apps/app/src/analytics/analyticsServer.ts`

```ts
@@analyticsServer.ts@@
```

## Appendix C: `apps/app/src/analytics/consentStorage.ts`

```ts
@@consentStorage.ts@@
```

## Appendix D: `apps/app/src/analytics/posthogClient.ts`

```ts
@@posthogClient.ts@@
```

## Appendix E: `apps/app/src/analytics/appAnalytics.ts`

```ts
@@appAnalytics.ts@@
```

## Appendix F: `apps/app/src/analytics/AnalyticsUpkeep.tsx`

```tsx
@@AnalyticsUpkeep.tsx@@
```

## Appendix G: the controller's changed lines (`controller.ts`, after S1 and G6)

```ts
@@controller-excerpt@@
```
