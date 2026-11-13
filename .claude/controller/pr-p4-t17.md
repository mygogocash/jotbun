## Summary
- **P4-T17: push on the phone.** It covers the token, taps behind the lock, and the permission.
- **Registration (`slips/push/pushRegistration.ts`, P5):** `registerPushIfNeeded` sends `PUT /v1/devices` for the signed-in session in four cases: the build names an EAS project, the phone already allows notifications, and something changed (the token, the platform, the language, the slip-notice switch or the session) or a week has passed.
  - **Order:** no project id first, then signed out, then the permission, which is read and never asked. The token comes last.
  - **The record:** it is written only after the server answers.
  - **Until D33:** there is no EAS project id, so nothing is fetched or sent.
- **Privacy (P6, the controller's note):**
  - The phone keeps only the session's SHA-256 in its device-store record, never the binding.
  - The body is the contract's four fields.
  - A case checks that no token, binding, hash, id or month reaches a console line, and that no analytics event is sent.
- **The host (`PushHost.tsx`, P7):** `<PushHost />` is the first child inside `WalletRoot`, under the lock gate.
  - A tapped push's route waits while the lock's cover is up, then goes once and is cleared.
  - It sets the app's only notification handler. Since expo-notifications 58 shows foreground notifications unless a handler says otherwise, that handler decides foreground behaviour for every notification.
- **The routes (`pushRouting.ts`, P8; followups line 255, n11):** `/spend/slips/review`, `/spend/import`, `/settings/privacy` and `/spend/recap/<YYYY-MM>`. All four are typed routes, and the tests check their literal paths.
- **The permission hook (`notificationPermission.ts`, P10)** is for P4-T21's screens. It asks for alerts and sounds only, never the badge or provisional delivery (P3 (b)).
- **The config:** `app.json` gains the plain `expo-notifications` plugin entry. It changes no native config: `@expo/prebuild-config` already applies the package's plugin, with these defaults, whenever the package is installed. So `aps-environment: development` is in today's prebuild too (the Opus review's m3; P3 (c)'s premise was wrong). The entry is where D33 and P6C will pass `mode`.
- **R126 (P3 (a)):** while the app is open, a local reminder is now hidden, as the plan says ("a local reminder stays hidden"). Today it shows with a sound. The owner may reverse this with one line in `presentation`.
- **The reviews' pins (the controller's commit `b5458587`, test-only plus the receipt).** Both reviews approve. Their findings included two guards no case held:
  - registrations run one at a time, in order (Opus m1, Sonnet m2);
  - only the push host sets a notification handler, so R126 cannot be undone silently (Sonnet m4).
- **For the owner, before D33 turns registration on (Opus m2, Sonnet m3):** quiet iOS delivery, and Android 12 and below, read as granted. So such a phone registers without a push prompt, and P4-T21's screens would not ask. Recorded in followups for P4-T21.
- **The controller accepted the planner's calls P1 to P17.**
  - Planned on Claude Opus, built on Claude Haiku 5.5.
  - The controller checked the commit: all 9 `real/` files are byte-identical.
  - The receipt is its own file under R87: `docs/implementation/receipts/P4-T17.md`.
  - No package or lockfile change: `expo-notifications` 58.1.5 is already installed. No edge or database change.

## Test plan
- [x] RED: Node 13 of 13 failing; render 13 of 21 failing, with the root layout's 8 passing. Every failing case is an `AssertionError`.
- [x] GREEN: Node 13 of 13; render 21 of 21.
- [x] 94 mutants: 92 killed and 2 equivalent (H33, M2). Every failing case is an assertion, and every outcome matches the planner's.
- [x] R100's fast gate:
  - `typecheck:app` and `typecheck:routes`;
  - `test:app` and `test:unit` (`fail 0`);
  - the routes render gate, 38 of 38 (`PushHost`, `RootLayout` and the four routes tests);
  - `export:web` (exported, 4950 modules);
  - `git diff --check`.
- [x] The reviews' pins (`b5458587`), under the heavy lock:
  - the two render files 22 of 22, the two Node files 14 of 14, and `typecheck:app`;
  - the reviews' R1 and OM1 and the controller's X1 are each killed on an assertion;
  - the planner's H1 to H32, N1 to N13, L1 to L3, G1 to G35, M1, C1 and C2 are still killed.

  Proof: `.claude/controller/scratch/p4-t17-pins/`.
- [ ] CI on this pull request is green: the nine jobs. Note: GitHub Actions is queued org-wide.
- [x] Independent review (Opus), and a second review (Sonnet): privacy (the session hash, the request body, no log or analytics line), the lock and the tap's route, the foreground handler (R126), and the permission. Both approve.
- [ ] The Opus reviewer confirms `b5458587`.
- [ ] SKIPPED, until D33's EAS project, APNs and FCM: device checks (a real token, delivery, a tap behind the lock, the permission prompt, the foreground handler per OS, Android's channel, an iOS build with `aps-environment`).

Closes #226 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
