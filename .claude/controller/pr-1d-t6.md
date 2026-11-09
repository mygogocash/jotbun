## Summary
- PostHog on the phone (1D-T6):
  - Adds `posthog-react-native` 4.85.1 and `@posthog/react-native-plugin` 2.13.0, pinned. Both are MIT, with no install scripts. The lockfile gains 4 entries and drops none, and keeps one copy each of React and React Native.
  - The client is built only on iOS and Android, and only with a project key. No PostHog project exists yet (Q5), so it stays null and nothing is sent.
- New `src/analytics/`:
  - `posthogOptions` (pure options, gated by 1D-T1's `before_send`), `analyticsServer` (the consent and identity calls) and `consentStorage` (this phone's answer in the secure store);
  - `posthogClient`, the only importer of `posthog-react-native`;
  - `appAnalytics`, and `AnalyticsUpkeep`, which handles screens as route patterns, language, the session's account through R86's epoch, and a refresh at each foreground.
- Shared files, each edited additively:
  - `_layout.tsx` mounts `<AnalyticsUpkeep />` after `<LocaleUpkeep />` inside P2-T2's `<WalletRoot>`.
  - `api/client.ts` sends `X-GoGoSpend-Analytics: off` unless the answer is yes.
  - `sharedV1.ts`, `env.ts` (`posthogKey`, `posthogHost`, `crashReportsWithoutConsent`), `AiCompanionProvider` (`ai_enabled`) and `DeviceDiaryProvider` (the erase also clears the stored answer).
- 1D-T1's follow-ups, carried in `controller.ts`:
  - `AccountChangedError` for a yes refused because the account changed;
  - a no is stored at the call, so it survives the app closing;
  - a same-account yes is documented and pinned.
- The controller accepted the brief's six decisions. Decision 1 is R93: `rageClickConfig: { enabled: false }`, because the iOS SDK sends `$rageclick` outside `before_send`, and repeated keypad taps would reveal amounts. The receipt is its own file under R87: `docs/implementation/receipts/1D-T6.md`.
- 1C-T6 (fresh sign-in) is being built in parallel and also edits `api/client.ts` and its test, in other places. Whichever merges second takes the other first.

## Test plan
- [x] RED on typed stubs: unit 10 of 39, test:app 1 of 33, render 11 of 22 in 5 files; all 22 are assertion failures. GREEN: 39, 33 and 22, `tsc` clean.
- [x] 31 of 31 mutants killed, every file restored byte for byte.
- [x] At `5dbd7be`:
  - `typecheck:app`, `typecheck:routes`;
  - `test:app` 33, `test:unit` 892, full `test:render` 92 files and 1661 tests;
  - `export:web` 4782 modules, the iOS export 5748 modules;
  - `lockfile-bindings` 2, `test:ops` 106 passed and 1 skipped, the API build and release graph (no problems), `git diff --check`.
- [ ] SKIPPED, native and hosted: a development build with the plugin on iOS and Android, replay masking and tap positions in a real recording, native crash `before_send` and symbolication (P6C-T12), and PostHog itself (no project or key, Q5).
- [ ] CI on this pull request is green.
- [ ] Independent review.

Closes #137 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
