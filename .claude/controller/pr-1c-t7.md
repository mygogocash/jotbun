## Summary
- **1C-T7: native Apple and Google sign-in, on 1C-T5's Better Auth port.**
- **Apple (P5, P8):** iOS only (Q7). `isAvailableAsync()` false answers `AuthRefused('REFUSED')`, so the port's `methods` stay synchronous. It asks only for the email scope, with one fresh `Crypto.randomUUID()` nonce per sign-in, sent to Apple and returned with the token.
- **Google (P6, P7, Q1):** it ships hidden. Its env values are unset, so it is never offered and its module never loads.
  - **Why it loads late:** the package calls `TurboModuleRegistry.getEnforcing` while loading, which throws in any build without its native half. So it loads with `import()` at the first Google sign-in, once, never at launch.
  - **iOS needs both ids** (P6).
- **`app.config.js` (new, P9):** it adds `usesAppleSignIn` and the plugins after `app.json`'s own, never copying its list, so #466's `expo-notifications` entry is safe whichever merges first.
  - **Native changes against the base:** the Sign in with Apple entitlement, `CFBundleAllowMixedLocalizations`, and both packages autolinked into every native build. With Google's URL scheme set, its plugin and `CFBundleURLTypes` entry are added too.
- **Packages (P3):** `expo-apple-authentication` `~58.0.2` (locked at 58.0.2, Expo SDK 58's own pin) and `@react-native-google-signin/google-signin` `16.1.5` exact (Q1). The lockfile gains two entries, with one copy each of `expo`, `react` and `react-native`.
- **Privacy (P12):** no token, nonce or authorization code reaches a log line, an analytics event or the stored session. A case pins it.
- **Followups carried (P14):**
  - line 62, R98 on every build: one case appended to `SessionEndedScreen.render.test.tsx`;
  - lines 98 to 105: `appServicesWiring.render.test.tsx`, which kills the 1C-T6 review's five mutants;
  - line 111: a device check.
- **For the owner, neither blocking:**
  - (a) the approved Google package 16.1.5 documents Expo up to 57 and React Native up to 0.87, while the app is on 58 and 0.88. The development build is the proof (SKIPPED). If it fails, the package is autolinked into every native build, so it would have to be excluded or moved to 16.2.0 or 17.0.0 (the same JavaScript).
  - (b) Every iOS build must now be signed by a team with the Sign in with Apple capability.
- **The controller accepted the planner's calls P1 to P17.**
  - Planned on Claude Opus, built on Claude Haiku 5.5.
  - The controller checked the commit: all 14 `real/` files are byte-identical.
  - The receipt is its own file under R87: `docs/implementation/receipts/1C-T7.md`.
  - No edge, route or database change.

## Test plan
- [x] RED: Node 18 of 20 and render 3 of 15 failing, every one an `AssertionError`.
- [x] GREEN: Node 20 of 20; render 15 of 15.
- [x] 68 of 68 mutants killed, every failing case an assertion, identical to the planner's.
- [x] R100's fast gate:
  - `typecheck:app`;
  - `test:app` 37 and `test:unit` 1127;
  - the render gate 23 of 23, and the four routes tests 17 of 17;
  - `export:web` (exported);
  - `expo config` public and introspected, equal to the planner's diffs;
  - the API build and `release-graph.mjs check`;
  - the lockfile bindings test, and a clean `npm ci`;
  - `git diff --check`.
- [ ] CI on this pull request is green: the nine jobs, the iOS export included. Note: GitHub Actions is queued org-wide.
- [ ] Independent review (Opus), and a second review (Sonnet): the tokens and the nonce (P12), Google's late load (P7), the config and native changes (P9), and the packages (P3).
- [ ] SKIPPED, until D33/Q6 and 1C-T3: device checks (Apple on a real iPhone, Google in a development build on both platforms, fresh sign-in from Settings and Privacy).

Closes #124 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
