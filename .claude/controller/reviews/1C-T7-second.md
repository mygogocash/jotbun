# 1C-T7 second review: Native Apple and Google sign-in (PR #468)

Reviewer: Claude Sonnet 5.5, the independent second reviewer (privacy and native config). Read-only: every probe ran in a scratch copy (`git archive bf3e1259`, `node_modules` symlinked from the worktree), never in the worktree. The worktree stayed clean at `bf3e1259`, and my scratch files equal it after all mutation runs (`diff -rq` of `src`, `app.config.js`, `app.json`, `package.json` and the lockfile).

- **Reviewed:** `bf3e1259` on `p1/1c-t7-native-sign-in`, one commit on `b05b8924`, range `origin/claude/p1a-vault-core...bf3e1259`: 15 files, +791 -5. The integration branch has since moved to `37877cb2` (#461 merged); none of the 25 files that changed since the merge base is in this PR's paths.
- **Spec:** plan Task 7 (line 933) with Global Constraints, K14, K15, Q1, Q6, Q7 and M13; the brief `briefs/1C-T7.md` (P1 to P17); the receipt `docs/implementation/receipts/1C-T7.md`. I did not read any other review of this task.
- **Scratch:** `.claude/controller/scratch/1c-t7-second/` (logs, introspection files, `tools/mymutants.py`, `tools/importgraph.py`, `tools/lockcheck.py`, CI job logs).

## Summary

No blocker and no major. The code does what the plan and the brief say, and I could not make the committed code leak a token, a nonce or an authorization code. The native config changes are exactly the brief's nine lines (and five with Google's scheme), the lockfile change is exactly two entries, and CI is green on all nine jobs, the iOS export included. What I found are five test-strength gaps (m1 to m3, n1, n3), one config-coupling hazard (m4) and one robustness nit (n2), all minor or nit, each shown by a surviving mutant of my own or by a probe. None changes what ships with Google off.

## CI on PR #468

Read at 07:43 local. Run `43533173461` finished `success`. It checked out the PR's merge ref `225dffa` (`bf3e1259` merged into integration `15dee254`). That base differs from the PR's own base `b05b8924` by one controller-state sync and no code, so CI tested this commit's code as it is. The integration branch has moved once more since (`37877cb2`), with no overlapping file.

| Job | Result | Counts from the job log |
| --- | --- | --- |
| Typecheck, unit, API, build | pass, 2m42s | `typecheck`, `typecheck:app` and `typecheck:routes` ran; `test:app` 37 of 37; `test:unit` 1127 of 1127 (the receipt's numbers); API build |
| Exports (web and iOS bundles) | pass, 2m13s | Web Bundled 4887 modules, iOS Bundled 5871 modules, both `Exported: dist` |
| Render (every file but the per-section suites) | pass, 3m28s | 133 files, 1704 tests; it ran `nativeModules.render.test.tsx` (4), `appServicesWiring.render.test.tsx` (3), `SessionEndedScreen.render.test.tsx` (8) and `RootLayout.render.test.tsx` (8) |
| Render, per-section suites (3n, 3n+1, every other test) | pass x3 | 192 + 236 + 254 passed of 682 each (every test runs in exactly one) |
| Edge Worker | pass, 3m22s | 21 files / 214 tests, 38 / 882 (1 todo), 3 / 12 |
| SQL integration and ops | pass, 2m47s | ops node tests 111 of 111, which includes `lockfile-bindings.test.mjs` |
| Release image and smoke | pass, 49s | release graph `"problems": []` |

The web module count (4887) is six above the receipt's local 4881. I did not chase it: the code is the same (the two bases differ by no code), both bundles complete, and no file that a web route reaches gains an import in this PR (the import graph below). It is most likely a platform difference between the implementer's machine and the runner, which I did not verify.

## What I ran (local, focused, in scratch)

R100: I ran no whole suite, no export and no database suite; the counts in the CI table are CI's own. I left the lock free after every run (`/private/tmp/claude-501/jotbun-heavy.lock` does not exist now) and kept nothing under `/private/tmp`.

- **Node:** `nativeSignIn.test.ts` and `env.test.ts`: 20 of 20. `hermesGlobals.test.ts`: 1 of 1. `lockfile-bindings.test.mjs`: 2 of 2 (it first failed in my partial archive for want of `apps/api/Dockerfile`, then passed once I added the files it reads).
- **Render (under the heavy lock):** the three task files: 15 of 15, no stderr, `act` or unhandled noise (the grep count is 0). `RootLayout.render.test.tsx`: 8 of 8, count 0. Load average was 10 to 13; nothing timed out.
- **Native config, offline, base against head:** I built a base tree from `origin/claude/p1a-vault-core` whose `node_modules` is a link farm without the two new packages, ran `expo config --type introspect` on it and on the head, with and without `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME`, and compared with the planner's `config_diff.mjs`. The result is byte-identical to the planner's `introspect-diff.txt` (nine lines) and `introspect-google-diff.txt` (five lines). `--type public` gives the last plugin `expo-apple-authentication`, and with the scheme Google's `["@react-native-google-signin/google-signin",{"iosUrlScheme":...}]` last. A whitespace-only scheme adds no plugin.
- **What `app.config.js` itself adds:** I also introspected the head with `app.config.js` moved aside. The packages alone already bring the Apple entitlement, `CFBundleAllowMixedLocalizations` and both autolinked modules; the file adds only `ios.usesAppleSignIn` and the explicit plugin entries (see the autolinking answer).
- **Import graph** (`tools/importgraph.py`, every file under `app/` as an entry, Metro's platform extension order, `import type` erased): see the answer to the Google question below.
- **A probe of P7's claim** that a build without Google's native half starts: with the package's factory throwing as `getEnforcing` does, importing `nativeModules.ts` and calling `appNativeSignIn()` throws nothing and loads nothing, the first and second Google sign-ins reject, and the module loads once (the failure is memoized). Throwaway test in scratch, not committed.
- **Packages and lockfile** (`tools/lockcheck.py`): see the answer on packages.
- **Mutants:** 13 of the planner's 68 (below), and 10 of my own.

## Mutants

**The planner's, 13 rerun, 13 killed**, each failing case an `AssertionError` and each file restored with an equal sha256: A1 (Apple on Android, the plan's), A5 (one nonce for every sign-in, the plan's), A6 (Apple given another nonce than the one returned), A8 (full name asked too), P1 (a log line naming Apple's token and nonce), G2 (Google on iOS without its iOS id), G9 (no Play services check), C4 (app.json's plugins dropped), C5 (Google's plugin without its scheme), N10 (Google loads at launch), N15 (Google loads as soon as it is offered), X1 (R98 only on email-only builds) and W1 (Privacy skips the fresh sign-in).

**Mine, 10 run, 1 killed, 9 survived** (`tools/mymutants.py`, logs in `my-mutant-logs/`):

| Id | Mutant | Result | Finding |
| --- | --- | --- | --- |
| O1 | `console.log` of Apple's identity token and code in `nativeModules.ts` | survives all 17 Node and 4 render cases; the log shows the token printed | m1 |
| O2 | `console.log` of Google's whole answer in `nativeModules.ts` | survives | m1 |
| O3 | `idTokenOf` drops the nonce | survives 17 of 17 | m2 |
| O4 | `idTokenOf` also sends Apple's authorization code | survives 17 of 17 | m2 |
| O13 | `app.config.js` hard-codes `app.json`'s plugin list | survives at the head; killed once #466's `expo-notifications` is laid over `app.json` | m3 |
| O14 | `app.config.js` hard-codes `app.json`'s iOS block | survives, also with #466 laid over | m3 |
| O11 | the cancel check matches the error's message, not its code | survives | n1 |
| O15 | Privacy's `freshSignIn` always reports `'fresh'` and swallows a failure | survives 3 of 3 | n3 |
| O16 | Settings' `freshSignIn` is always `null` (`accountServices.ts:27`) | survives 3 of 3 | n3 |
| O6 | the Apple nonce comes from `Math.random` | killed by `nativeModules.render.test.tsx` | none |

## Findings

### Blockers

None.

### Major

None.

### Minor

**m1. The privacy rule is not pinned at the one file where the SDKs' full credentials enter JS.**
- `nativeModules.ts:25` returns Apple's whole credential (which carries the user id and email fields as well as the token and code) and `:46` returns Google's whole answer (the user's name, email, photo and `idToken`). The Node privacy case (`nativeSignIn.test.ts:187-230`) runs `createNativeSignIn` over fakes and never loads `nativeModules.ts`. The render file (`nativeModules.render.test.tsx`) never looks at the console, the telemetry sink or storage, and `renderSetup.ts` does not police console output.
- Probe: mutants O1 and O2 (a `console.log` of the credential) pass every test of this task, and the mutant's log output with the token is in `my-mutant-logs/O1-nativeModules.render.test.tsx.log:5`.
- The committed code is clean: a grep for `console.`, `SecureStore`, `AsyncStorage`, `localStorage`, `analytics`, `track(`, `capture(`, `posthog`, `fetch(` and `XMLHttpRequest` finds nothing in `nativeSignIn.ts`, `nativeModules.ts`, `nativeModules.web.ts` or `app.config.js`. So this is a guard that P12 promises but does not hold at its main choke point.
- Fix: in `nativeModules.render.test.tsx`, wrap the two native sign-ins with the same console and `setConsentedTelemetrySink` capture the Node case uses, and assert that no token, nonce or code appears.

**m2. The nonce's last hop, `idTokenOf`, is unpinned, and a dropped nonce would not break sign-in.**
- `betterAuthClient.ts:41-47` copies `nonce` from the `NativeIdToken` into Better Auth's request. Neither runner can load that file; B1 (`nativeSignIn.test.ts:249-256`) pins only the `appNativeSignIn()` wiring; and the privacy case's fake client sits upstream of `idTokenOf`.
- This matters because of how the installed Better Auth (1.6.33) uses the nonce: the sign-in route passes the request's `idToken.nonce` to the provider (`better-auth/dist/api/routes/sign-in.mjs:149-150`), and Apple's check runs only when one was sent (`@better-auth/core/src/social-providers/apple.ts:168`, `if (nonce && !(await nonceMatches(...)))`). So O3 (drop the nonce) turns the check off silently, and the happy path still works: a device check would not catch it either. O4 (also forward the code) passes too, although the plan has the code go to 1C-T13 by another route.
- Fix: extend B1's source pin to `idTokenOf`'s two spread lines (cheap), or move `idTokenOf` into a module the runners can load. 1C-T13 edits this function to send the code, which is the natural time.
- Minor, because `idTokenOf` is 1C-T5's code and it is right today.

**m3. P9's "never a copy of `app.json`'s lists" is held only after #466 merges, and the iOS block is not held at all.**
- `app.config.js:15-16` reads `config.ios` and `config.plugins`, which is correct. But the config tests (`nativeSignIn.test.ts:236-247`) pass the real `app.json`, so a hand-written copy equal to today's file is indistinguishable: O13 and O14 both pass 17 of 17 at the head.
- With #466's change laid over my scratch `app.json` (`expo-notifications` inserted), the unmutated code still passes 17 of 17 and O13 is then killed; O14 still survives, since #466 does not touch `ios`. So the plugin rule is held from the day #466 merges, the iOS rule never.
- Fix: also call `appConfig` with a synthetic base (an extra plugin and an extra `ios` key such as `bundleIdentifier`) and assert both survive in order.

**m4. One iOS Google setup needs two independently set variables, and nothing checks that they agree.**
- JS offers Google on iOS when the web and iOS client ids are set (`nativeSignIn.ts:76-77`). The config plugin that registers the URL scheme runs only when `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME` is set (`app.config.js:11-12`). The scheme is the only thing the Google plugin writes (`plugin/build/withGoogleSignIn.js`, `withGoogleUrlScheme`), and Google's iOS SDK needs it to get its redirect back. Ids set without the scheme gives a visible Google button on iOS that cannot finish a sign-in. I could not check whether GoogleSignIn-iOS then rejects or throws, because no Pods are installed here.
- The scheme is a pure function of the iOS client id (`<id>.apps.googleusercontent.com` becomes `com.googleusercontent.apps.<id>`), but the plan (M18) names the third variable, so deriving it would need a ruling.
- Plan-conformant, and it only matters once the owner sets the ids. I would write "set all three together" into `.env.example` now (it lists each, not the coupling), and have D33 or P6C-T7 derive or assert it.

### Nits

- **n1. The cancel fixture carries Expo's real message** (`nativeSignIn.test.ts:120`), so an implementation that matches the message instead of `error.code` passes (O11). Give the fixture a different message so only the code can match.
- **n2. `app.config.js:16` throws** (`config.plugins is not iterable`) if `app.json` ever has no `plugins` key, while the test file itself writes `base.plugins ?? []`. Use `...(config.plugins ?? [])`.
- **n3. The carried wiring test pins five behaviours and no more.** Privacy's `freshSignIn` always answering `'fresh'` (O15, `privacyServices.ts:57`) and Settings' `freshSignIn` always `null` (O16, `accountServices.ts:27`) both pass 3 of 3. The first is also held by the server's `assertFreshSignIn`; the second shows as a disabled button. One failure-outcome case and one `appAccountServices().freshSignIn` case would hold both.

## Answers to the controller's focus questions

**Tokens, nonce and code (P8, P12).** Held. `nativeSignIn.ts` and `nativeModules.ts` contain no log, storage, analytics or network call (grep above). The provider swallows an unknown native error into `failed` without logging it (`credentialProvider.ts:244-247`), and the stored session record is only `accountId`, `sessionId`, `email` and `method` (`:223`). PostHog replay and network telemetry are off (`posthogOptions.ts`). One fresh `Crypto.randomUUID()` per Apple sign-in, returned as the token's `nonce`: A5, A6 and N6 kill the three ways to break it, and my O6 (a `Math.random` nonce) is killed too. `expo-crypto`'s `randomUUID` is documented as cryptographically secure, and Hermes lacks a Web Crypto global (`hermesGlobals.test.ts`), which is why it is the right source. The gaps are m1 (the guard at `nativeModules.ts`) and m2 (the hop after the port).

**Apple (P5).** Held, and checked against the installed `expo-apple-authentication` 58.0.2:
- iOS only (A1, A2). `request.nonce = options.nonce` is passed through unmodified (`ios/AppleAuthenticationRequest.swift:37`).
- A closed sheet is `RequestCanceledException` (`ios/AppleAuthenticationExceptions.swift:16,68`), whose code is `ERR_REQUEST_CANCELED`, which the module's own JS docs state.
- `signInAsync` already throws `ERR_REQUEST_FAILED` when the token, code or user is missing (`build/AppleAuthentication.js`), so the missing-token refusal and the missing-code branch are defensive, as P5 says.
- Only the email scope (A8, N7).
- One fact for the device checks: on iOS, `isAvailableAsync` is hard-coded `true` (`ios/AppleAuthenticationModule.swift:12-14`). The `REFUSED` branch therefore fires only in a build without the native half (the JS stand-in answers `false`), not for an iPhone with no Apple ID; that case reaches `signInAsync` and, I expect, ends as `ERR_REQUEST_UNKNOWN` (the mapping of Apple's `.unknown`, `ios/AppleAuthenticationExceptions.swift:66-67`) or as a cancel; I could not run it. The provider maps `REFUSED` and unknown errors to the same `failed`, so the user sees no difference, but P15's "an iPhone without an Apple ID (a refusal)" should expect `failed`.

**Google (P6, P7).** Held.
- Hidden with the ids unset (the Node and render cases). The package calls `TurboModuleRegistry.getEnforcing('RNGoogleSignin')` while loading (`src/spec/NativeGoogleSignin.ts`), which is why the lazy `import()` is right.
- **Import paths.** From `app/_layout.tsx` on iOS and Android the chain is `_layout.tsx` to `appAuth.ts` to `betterAuthClient.ts` to `nativeModules.ts`; the Google package is reached there only by the dynamic `import()` (no static path from any route), while Apple's module is imported statically on that launch path (safe: its JS stand-in answers `false` and its button's `requireNativeView` is guarded by a try/catch in `expo-modules-core` 58.0.20). On the **web** build, neither package is reachable, and no `nativeModules*` file is reached at all: `betterAuthClient.web.ts` never imports it (B1 pins that), so `nativeModules.web.ts` is a safety net no web route uses today. In the render suite the only importer of `nativeModules` in `src` is `betterAuthClient.ts`, which vitest resolves to its web twin; the one test that loads the real phone file mocks all three native modules, and `RootLayout.render.test.tsx` passes.
- Memoized: the render case expects one load across two sign-ins and passes, and my probe shows one load across two failed sign-ins. Never at launch: N10 and N15 are killed.
- iOS needs both ids: verified in the package source, `ios/RNGoogleSignin.mm:78-81` rejects `configure` when neither `iosClientId` nor a plist is given (and logs `RCTLogError`). The JS `configure` stores that promise unawaited (`GoogleSignin.ts`, `configPromise`), so skipping the offer on iOS without the iOS id also avoids a red-box and an unhandled rejection (PostHog autocaptures unhandled rejections).
- Cancel: the package turns `SIGN_IN_CANCELLED` into `{ type: 'cancelled' }` (`translateNativeRejection.ts`). Its `signIn` takes only `loginHint`, so no nonce, as P6 (d) says.

**`app.config.js` (P9).** The code spreads `config.plugins` after `app.json`'s own, so #466 merging first is safe (the unmutated code passes 17 of 17 with `expo-notifications` laid over `app.json`); the test strength is m3. The introspection against the base is exactly the brief's nine lines, and Google's scheme adds exactly the five (both byte-identical to the planner's files). Google's plugin is always given options, so it never enters its Firebase mode (`withGoogleSignInRoot` takes that path only without options), and a scheme that does not start with `com.googleusercontent.apps.` makes every plugin-running Expo command throw, as the brief says.

**Autolinking Google into every native build while its ids are unset: a build risk, not a runtime risk.**
- *Runtime:* low. JS never loads the module (above). On iOS the package's Expo adapter registers an app-delegate subscriber (`expo-module.config.json`: `appDelegateSubscribers: ["GoogleSignInAppDelegate"]`, whose only code is `GIDSignIn.sharedInstance.handle(url)` in `application(_:open:options:)`). I expect that to return false for any URL that is not Google's own callback, so deep links such as `gogospend://` are not swallowed, but GoogleSignIn-iOS is not installed here, so confirm with one deep link in the first development build.
- *Build:* real, and unset ids do not reduce it. It comes from `package.json` alone: with `app.config.js` moved aside, the packages already add both autolinked modules, the Apple entitlement and `CFBundleAllowMixedLocalizations`. The package's docs list Expo up to 57 and React Native up to 0.87, so a native incompatibility would break every iOS and Android build, Apple-only ones included, until the owner removes the package or excludes it. The brief's P15 says "excluded from autolinking or removed"; the installed `expo-modules-autolinking` 58.0.13 does support an `exclude` list for both Expo and React Native modules (`src/commands/autolinkingOptions.ts`), so the exclusion route exists (not tried here).
- *Binary and store:* Google's SDK (`GoogleSignIn ~> 9.0`, which I expect to carry its own privacy manifest) ships in every iOS binary, and `play-services-auth` 21.4.0 in every Android one (the package's own `AndroidManifest.xml` is empty). The App Store privacy label and the merged Android manifest permissions should be checked at the first development build; I could not verify them offline.

**Packages and lockfile (P3).** Held. `tools/lockcheck.py` over the base and head lockfiles: exactly two entries added (`node_modules/@react-native-google-signin/google-signin` 16.1.5 and `node_modules/expo-apple-authentication` 58.0.2), one entry changed (`apps/app` gains the two dependency lines), none removed. Neither new entry has dependencies, a `bin` or `hasInstallScript`, and the install-script count stays 8 to 8. The package manifests agree: no lifecycle script in `expo-apple-authentication`, and Google's `prepare` runs only for git installs. One copy each of `expo` 58.0.12, `react` 19.3.0 and `react-native` 0.88.0. Both `integrity` values equal the registry's `dist.integrity` in the offline npm cache (`npm view --offline`). Publish dates from that cache: 58.0.2 on 2026-09-29 (46 days old) and 16.1.5 on 2026-09-03 (72 days), so the two-week rule holds, and 58.0.3 (2026-11-11) was rightly kept out. The versions are as briefed (`~58.0.2`, exact `16.1.5`).

**The followups' cases (P14).** Held. `appServicesWiring.render.test.tsx` passes 3 of 3 and its W1 is killed (13 planner mutants above); `SessionEndedScreen.render.test.tsx`'s appended case passes and X1 is killed, which holds R98 (handover: whenever the main button is the email code to the account's own address, "Use another way" also offers an email code to another address) on a build with all three methods. Beyond the five behaviours it was built for, the wiring test is thin (n3).

## Plan conformance

The names, the two `...ModuleLike` types and `createNativeSignIn`'s options match the plan's Interfaces exactly; the plan's nine test names are present verbatim; `env.ts` and `app.config.js` follow Task 7's text. The deviations are the brief's P5 to P7, P9, P10 and P13, which I checked above and accept: iOS needing both Google ids and the lazy Google import are both justified by the package source. The device check (Step 6) is SKIPPED with each item named, as the plan allows.

## What CI cannot show, and what stays open

CI is green, so nothing more is needed for the merge gate. CI sets no `EXPO_PUBLIC_GOOGLE_*`, so its two bundles prove only the Google-off configuration; a native compile of Google's package on Expo 58 and React Native 0.88 and every device check (P15) remain SKIPPED until D33 and 1C-T3, as the receipt says. Approval is for what this commit does with Google off.

## Notes for later tasks

- **1C-T13 (Apple revocation):** when it edits `betterAuthClient.ts`'s `idTokenOf` to send the authorization code, pin the function (m2): Better Auth checks Apple's nonce only when the request carries one.
- **1C-T3 (the server):** Better Auth's Google `getUserInfo` maps the token's `name` and `picture` into the user (`@better-auth/core/src/social-providers/google.ts:228-234`), and this task passes no `scopes`, so the package default (email and profile, per its types doc) applies, while Apple is asked for email only. If the design wants Apple-like minimisation, decide it there (for example `mapProfileToUser`); the client cannot narrow it here. Whether the SDK can be narrowed on a device is a device-check item.
- **D33, P6C-T7, 1C-T9:** set `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` and `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME` together, or derive the scheme (m4). At the first development build: one deep link (the app-delegate subscriber), the merged Android manifest and the App Store privacy label (autolinking answer), and, if Google fails to build, `expo.autolinking.exclude` before removing the package.
- **P15 device checks:** an iPhone without an Apple ID should expect `failed`, not a refusal (`isAvailableAsync` is constant `true` on iOS). Also check whether a second Google sign-in offers the account picker (Review Focus 4): no code path calls `GoogleSignin.signOut()` or `revokeAccess()` (the `GoogleModuleLike` type has neither), so the SDK's own last-user state outlives Jotbun's sign-out and deletion; calling it from sign-out is a choice for 1C-T9 or 1C-T13.
- **Whoever next edits the config tests or the wiring test:** m3 and n3 are one-case additions each.

VERDICT: Approved
