# Phase 2: Bun Wallet core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the app the Bun Wallet interface for the daily loop (a wallet card stack on Home, trays over the page, records, budget, insights, calendar and recap, the Thai pack, private mode, dark mode, the largest text sizes, VoiceOver, the Face ID lock and the D38 reminders), behind a `wallet` redesign area that the owner switches on after the E2 screenshots.

**Architecture:** New screens and components live in `apps/app/src/wallet/` and are routed only while the `wallet` redesign area is on (off until P2-T38, as every redesign area was). Rules are shared, never forked: Quick add's save rules, the record's rules, Home's loading, History's paging, Recently deleted and the planning commands move into hooks that the old and new screens both use, each move proven by the old screen's suite unchanged. The pure models (`src/spend/v1/redesign/*`) stay the source of every number; this plan adds tokens, one reduced-motion answer, money text with private mode, looks kept on the phone, the card stack, the tray and the screens.

**Tech stack:** Expo SDK 58 (expo 58.0.12, React Native 0.88, expo-router 58.0.21); react-native-reanimated 4.7.1 with react-native-worklets 0.13.0, react-native-gesture-handler ~3.3.0 and expo-local-authentication ~58.0.2 (the SDK 58 pins in `node_modules/expo/bundledNativeModules.json`; all approved in §4); react-native-svg 15.16.0, expo-notifications ~58.1.4 and expo-sqlite 58.0.13 (existing; SQLCipher on SQLite 3.53.3); Vitest 4.1 with happy-dom for render tests; Node's test runner for pure tests.

**Spec:** [docs/superpowers/specs/2026-10-25-jotbun-bun-wallet-cloudflare-design.md](../specs/2026-10-25-jotbun-bun-wallet-cloudflare-design.md). This plan implements §8 phase 2, using §2 (anti-goals), §3 (C3, C4, C5, C18, D35 to D42), §4 (copy, accessibility, packages), §5.1 to §5.3 and §6.12 (D38). The boards are the visual spec: `docs/design/bun-wallet/<board>.dc.html`. A screen task names its board, the data each part shows, its copy keys and its deviations; every size, spacing and colour it does not name comes from the board.

**Phase 2 and the other plans.** Phase 2 is app-side and runs beside 1A to 1D, against today's v1 client and its fakes (`src/spend/v1/testing/fakeResources.ts`, `fakeDiary.ts`, `src/spend/v1/ai/testing/fakeAiResources.ts`). It waits on: 1D-T1 (the analytics emitters, R61), 1D-T4 and 1D-T9 (the pending choice and `ChoicePanel`, R62), 1D-T5 (`useRefreshOnRevision`, R70), 1D-T8 (`useAnalyticsConsent`, for the first run's order, W34), 1C-T9 (the sign-in routes and the terms gate, for the first run) and the other session's reminder commit (P2-T36, with a fallback). Everything else starts from `base` or from tasks of this plan.

**Shared files** (other plans also edit these; every edit here is additive and named in its task):
- `apps/app/package.json` and the root `package-lock.json` (P2-T2, P2-T34). 1C and 1D add app packages too. The controller merges installs one at a time, regenerates the lockfile once per merge with `npm install` from the merged manifests, then runs `npm run test:ops`.
- `apps/app/app.json` (P2-T34: the expo-local-authentication plugin entry).
- `apps/app/app/_layout.tsx` (P2-T2: one `<WalletRoot>` wrapper; 1C and 1D-T6 add their own pieces beside it).
- `apps/app/app/spend/_layout.tsx` and its order test `src/wallet/home/spendLayoutOrder.test.ts` (P2-T18: the wallet branch, R58). 1C-T9 adds the session-ended guard before the providers, and 1C's terms gate (`TermsGate`, 1C's K24) between `DeviceDiaryProvider` and `CompanionBoundary`; 1D-T8 adds the consent question, which renders in place of `WalletShell` (inside `CompanionBoundary`), never inside it.
- `apps/app/app/index.tsx` (P2-T35; 1C-T8 and 1C-T9 change the first run before it).
- `apps/app/src/config/featureFlags.ts` and `featureFlags.test.ts` (P2-T2 adds `wallet`, P2-T38 approves it; 1C adds `signin`, 1D adds `analytics` and `conflict`).
- `apps/app/src/dev/catalogue/registry.tsx` (P2-T8: one spread of `WALLET_SECTIONS`; 1C and 1D add their own section lists).
- `apps/app/src/messages/en.json`, `th.json` and `apps/app/src/i18n/catalogs.test.ts` (P2-T38, and P2-T36's fallback import of the 14 `spendV1Reminder*` entries; 1C-T9 and 1D's approval commits add theirs).
- `apps/app/src/theme/ThemeProvider.tsx` (P2-T1: the `wallet` colours) and `apps/app/src/theme/motion.ts` (P2-T9: three haptic moments and one stale comment).
- `apps/app/src/storage/diaryRepository.ts`, `apps/app/src/spend/v1/spendDiary.ts` and `apps/app/src/spend/v1/testing/fakeDiary.ts` (P2-T3 `accountId`, P2-T4 `loggedDays`; 1D-T4 and 1D-T5 add their own members).
- `apps/app/src/spend/v1/DeviceDiaryProvider.tsx` (P2-T3: one call in `eraseWithDiary`; 1D-T6 adds its own erase).
- `apps/app/src/screens/redesign/account/PrivacyScreen.tsx` (P2-T3: the account erase after a confirmed deletion; 1C-T6, 1C-T9 and 1D-T8 edit it too) and `SettingsScreen.tsx` (P2-T33: one element; 1C edits it too).
- `apps/app/src/spend/v1/redesign/shared.ts` and `historyModel.ts`: 1D-T9 adds `choicePending`; P2-T28 reads it and edits neither file.
- `apps/app/src/ui/Sheet.tsx` (P2-T33: it reads the lock cover).
- `apps/app/src/screens/redesign/conflict/ChoicePanel.tsx`: 1D-T9 creates it and owns the C16 flow inside `useRecordActions`; P2-T27 restyles the panel in place, with the wallet look only while the `wallet` area is on (R62).
- The screens whose rules phase 2 moves into hooks, which 1D-T5, 1D-T7 or 1D-T9 also edit (all but `CategoriesScreen.tsx` and `RecapScreen.tsx`): `QuickAddScreen.tsx` (P2-T5), `RecordScreen.tsx` (P2-T6), `planning/CategoriesScreen.tsx` (P2-T7, P2-T29), `planning/WalletsScreen.tsx` (P2-T19), `HomeScreen.tsx` (P2-T23), `RecentlyDeletedScreen.tsx` (P2-T25), `HistoryScreen.tsx` (P2-T28), `planning/BudgetScreen.tsx` (P2-T30) and `insights/RecapScreen.tsx` (P2-T32). **The carry rule:** a move cuts each 1D addition (an event call, `useRefreshOnRevision`, the C16 flow) out together with the rule it sits in, unchanged, and the old screen's suite, 1D's new cases included, passes unchanged. If 1D's task comes second, it puts its addition into the hook.
- Analytics: `apps/app/src/analytics/events.ts` and its allow-list belong to 1D-T1. Phase 2 calls 1D's emitters from the rule that performs each action, never from a tray or a render, and defines no event of its own (R61).
- `docs/implementation/premium-progress.md`: each task's receipt, under "## P2: Bun Wallet core".
- Inside this plan only: `src/wallet/WalletRoot.tsx` (P2-T2, then P2-T10 and P2-T33 add one provider each), `src/wallet/home/WalletShell.tsx` (P2-T18, then P2-T30 and P2-T35 add one line each), `src/dev/catalogue/wallet/index.ts` (one spread per task with sections). Each route file under `apps/app/app/` is edited by one task only.
- `src/notifications/*`, `RemindersScreen.tsx` and `remindersModel.ts` belong to the other session until its commit; only P2-T36 edits them, after it.

**Calls made in this plan** (the builder's, listed so a reviewer can check them):
- **W1. Beside the approved screens, behind the `wallet` area.** `RedesignArea` gains `'wallet'`, not in `APPROVED` until P2-T38; afterwards `-wallet` keeps the Bun diary screens, as `-core` does today. Every new route redirects to its Bun diary route while the area is off.
- **W2. Rules move into hooks** (P2-T5, T6, T19, T23, T25, T28, T29, T30, T32), each a refactor proven by the old screen's suite before a new screen uses it.
- **W3. Trays are React Native's `Modal` with Reanimated and Gesture Handler.** No sheet library or native sheet: native sheets cannot draw the 8 pt inset, radius 34, the per-step height change or the full-height tray at AX sizes, and `src/ui/Sheet.tsx` already proves the Modal's focus, escape and back button. P2-T13 states how it handles one tray opening as another closes, a Sheet inside a tray, the keyboard, exit animations and gesture callbacks (R69).
- **W4. No Skia in phase 2.** The bars, the dashed line, the progress bar and the calendar are react-native-svg and Views, which the web export builds and happy-dom renders; Skia on the web needs CanvasKit loaded first.
- **W5. Materials are react-native-svg `LinearGradient`s,** as `src/spend/SpendIntroScreen.tsx` draws its gradient.
- **W6. Reduced motion is answered once, in `WalletRoot`,** and reads as reduced until the phone answers (R66). Every Reanimated animation passes `ReduceMotion.Never`, because the wallet's own answer decides, not Reanimated's start-up read.
- **W7. Wallet type, material and Bun face, category icons and wallet order are kept on the phone, keyed by account** (R64), until phase 5's contract adds them. They survive sign-out and go only with a confirmed account deletion. A wallet with no kept look gets a material and a face derived from its id and no type.
- **W8. Pack categories are recognised by name** (C3's names and the earlier pack's, both languages) until phase 5 adds `pack_key`. `analyticsCategoryKey` is the built-in key, else the pack key, else `custom`.
- **W9. Money text:** the compact form drops `.00` only when the satang are zero; the exact form always shows two decimals. Home's per-day hint is C4's (left ÷ days left, today included, whole baht rounded down, from `budgetPace().perDayMinor`). The budget question's hint is the whole-month figure, the amount ÷ the days in the month, as bw-budget shows (฿18,000 in October reads ฿580) (R73).
- **W10. Private mode** is a device setting that stays on until the eye is tapped again and is forgotten by the sign-out erase. Every masked amount is `฿••••` at the amount's own size, so rows never change height. The calendar draws one neutral fill with no legend values, chart labels drop amounts, the flight chip masks its amount, and the recap's share text drops amounts (D41, R65).
- **W11. Streaks count logged days** (§5.1, R59): one count for the person, across every wallet, of the distinct days with a live record or a draft, read from the device diary. A skipped day pauses it and never lowers it; the note is the board's "ข้ามวันได้ ไม่เสียสถิติ". With no diary open (the web), the tile is left out.
- **W12. No times on rows.** v1 records carry a date only and no planned change adds a time, so the boards' "12:10" is dropped.
- **W13. The tab bar is กระเป๋า, สรุป and ฉัน, plus the floating +.** ฉัน opens Settings, outside the shell, so it is a link and never shows as selected. The cashback tab is plan P6B's (D42); Home's pill and the wallet tile show the count only and open nothing (R73).
- **W14. One tray serves expense, income and transfer;** its header is the type switch, as rh-income and rh-transfer draw it.
- **W15. Photos stay where they are today** (the record's receipt section). The tray's "แนบรูป" and bw-attach are plan P3's.
- **W16. The filter tray picks one wallet, one category and one type,** because `/v1/history` scopes by one of each and its totals must stay exact (C2). Filtering by several wallets is a phase 5 contract change.
- **W17. A save plays success when it lands, online or kept on the phone,** because the record is safe in either place ("saved here, sends later") (R74). Quick add keeps its own rule until it is retired.
- **W18. The Face ID lock locks on every app open** (sa-lock-setup: "ทุกครั้งที่เปิดแอป"), with no grace time: returning from the background locks, while `inactive` (the Face ID prompt itself, Control Centre, the app switcher) only covers, so the scan cannot loop (R67). It is offered only when the phone has a passcode or biometrics; otherwise the setting stays off and says why. Before the lock ever turns itself off, the phone's enrolment is read again.
- **W19. D38:** at most 14 one-shot reminders (under iOS's 64), ids `gogospend.reminder.once.<YYYY-MM-DD>`, each in its weekday's committed wording. Today's is left out or cancelled once today holds a record in the device diary or this phone saved one today; the plan is rebuilt at every open and rescheduled when the planned ids, the time zone, the language or the schedule shape change. The planner and the save mark use the phone's local calendar day (R68).
- **W20. The recap shares text** (an image needs react-native-view-shot, not approved; plan P6B takes the recap image). The button says สรุป, never การ์ด. Confetti: 24 pieces for 1.2 s, once per recap month per phone; under reduced motion one celebration haptic instead.
- **W21. Insights "เงินเข้า-ออก" has no board:** the month's money in (violet), money out (ink) and what was kept, with six paired bars; a draft for E2.
- **W22. The calendar uses the board's fixed steps** (0, ≤200, ≤500, ≤1,000, ≤2,000 and 2,000+ baht a day). Its dark ramp is drafted, with tested contrast.
- **W23. Dark peach** (on no dk-* board): `#7A4B36` → `#57331F` (text 6.56:1).
- **W24. Readable graphics (§5.3):** light insight bars `#8B76DA` (3.68:1 on white); dark bars `#6E5FB8` (3.32:1); the dashed budget line `#8A879A` light (3.49:1) and `#6E6B7A` dark (3.36:1). Text never uses `#8A879A`.
- **W25. Wallet types are §5.2's four** (R74): bank, cash, card and travel card, with keys `bank`, `cash`, `credit_card` and `transit` (exactly 1D-T1's `wallet_type` values, R81). The board's e-wallet is dropped. A card reads ใช้ไป for its spending.
- **W26. Today's look stays for Settings, Privacy, sign-in, import, AI, the Reminders screen, es-restore and es-error-generic** (st-*, sa-*, im-*, ai-*; plan P6B restyles st-*, sa-*, es-restore and es-error-generic, plan P4 im-* and plan P3 ai-*; R73). Settings gains only the lock row, in today's Settings parts.
- **W27. Events come from the rule, never a tray** (R61): each emitter of 1D-T1 is called once, in the hook or service that performs the action, after the acknowledgement or the device commit. Trays pass what only they know (`track`) into the rule.
- **W28. Reordering wallets is a tray with move-up and move-down buttons,** kept on the phone; no drag, so it works at every text size and with VoiceOver.
- **W29. The tray's keypad is the board's** (digits, `000`, `0`, delete). Quick add keeps its operator keys.
- **W30. Text sizes follow iOS's AX5 sizes** from ax-large-home (body 17 to 53 pt, title 28 to 58 pt, footnote 13 to 44 pt) through `maxFontSizeMultiplier`; an amount grows with the text size up to 64 pt and never more than body text.
- **W31. The saved toast follows bw-saved:** บันทึกแล้ว · วันนี้ ฿182, today's money out after the save (R74). Offline it is rh-offline's เก็บไว้ในเครื่องแล้ว · จะบันทึกเมื่อออนไลน์. The flying chip names what was saved.
- **W32. The greeting has no name** (สวัสดี): v1 holds none.
- **W33. Bun's daily note is not on the Bun Wallet Home in phase 2** (no bw-* board has it); today's Home keeps it, and plan P3 adds the daily note to the wallet Home in full mode.
- **W34. The first run** (C15, R73, 1C's K16 and K24, boundaries A11): bw-welcome, then `/login` from either button, then 1C's terms step (while `/v1/me` lists pending policies, 1C-T9's `TermsGate` shows it in place of `CompanionBoundary` and everything inside it, P2-T18), then 1D-T8's consent question (while it is unanswered, the spend layout shows it in place of `WalletShell`, inside `CompanionBoundary`, P2-T18, R82), then the setup checklist at `/spend/setup`. While the terms show, they cover every spend route, `/spend/setup` included. Right after sign-in, 1C's gate is still reading `/v1/me` and the status is `signed_out` or `loading` for a moment, and neither blocks the screens on those, so Home can show before the terms and the question; with the `analytics` area on, P2-T35's redirect to setup waits through those two states, so the checklist opens after the question, not before it. That glimpse of Home is a stated departure from R73 (Q10), and a tray opened in it closes, unsaved, when the terms or the question take the shell's place. One stated exception: a relaunch partway through the first run that reaches the spend layout before 1D-T6 has installed analytics reads `signed_out` with `installed: false`, which counts as settled, and 1D-T8's hook sees the install only at its next render, so there the checklist can open before the question (rare: the session must be ready before the install, and a true first run signs in first). The wallet area's welcome opens `/login` without `from=onboarding`, so 1C's reminder question is not shown twice; the checklist's reminder step asks instead.
- **W35. The record detail has no "จดจาก" row:** v1 records do not say how they were made; phase 3 (plan P3) adds `source`.
- **W36. The over-budget moment shows once per category per month,** right after the save that took the category over, never on opening the app.
- **W37. Update required (C5) shows this phone's version only:** the client is told `426 upgrade_required`, not the version it needs. The store button waits for a store link (D33).
- **W38. The routed Bun diary Categories screen keeps today's seven pack items until P2-T38;** only the wallet area offers C3's nine before E2-C is approved.

**Open questions for the owner** (each has a default the plan follows; every task that depends on one says "default pending owner Qn" there and states the default, R26):
- **Q1. The app switcher and Android recents.** The cover is drawn by JavaScript on `inactive`, which can lose the race with iOS's snapshot, and Android's recents thumbnail is not covered at all. Covering them reliably needs `expo-screen-capture` (Android `FLAG_SECURE`), which §4 does not list. Default: the JavaScript cover only, both recorded SKIPPED with this risk (P2-T33).
- **Q2. The Face ID permission line** (`faceIDPermission`) in Thai and English. Default: an English draft in `app.json`; localized Info.plist strings wait for the wording (P2-T34).
- **Q3. Every English line in the draft tables** is a draft for E2, as are the Thai lines no board shows (marked draft in each task). Default: each task builds with its lines as written, and the owner approves or rewrites the drafts at that task's E2 checkpoint; P2-T38 moves the approved wording into the catalogs. P2-T3's `common/copy.ts` and P2-T7's English pack names follow the same default (the pack names are data, so P2-T38 writes the approved ones into `thaiPack.ts` and keeps each replaced one as an alias).

## Global Constraints

- **Packages (§4):** P2-T2 installs exactly `react-native-reanimated@4.7.1`, `react-native-worklets@0.13.0` (Reanimated 4's required peer, covered by its approval) and `react-native-gesture-handler@~3.3.0`; P2-T34 installs `expo-local-authentication@~58.0.2`; each with `npx expo install`. Nothing else: no sheet, chart, QR, view-shot, screen-capture or gradient package. No lockfile regeneration with Linux bindings without the owner.
- **E2 (§4, handover §3):** new screens and copy are not routed, and not added to `en.json` or `th.json`, before the owner approves their screenshots. Until P2-T38 every new line lives in its area's draft table `src/wallet/<area>/copy.ts` (P2-T3), Thai first, each key with `th` and `en`; Vietnamese shows the English. Strings already in the catalogs (today's load and save messages) are reused through `tc()`. No emojis, no em dashes, the §5.1 voice table.
- **Type (§5.1, R74):** Anuphan (`THAI_UI_FONT_FAMILY`, `src/theme/uiFontFamily.ts`) for all text in every language; DM Sans 700 (`LATIN_UI_FONT_FAMILY`) only for amounts, through `WalletAmount`; unless a board shows otherwise.
- **Accessibility (§4):** controls at least 44 × 44 pt in their own box (react-native-web ignores `hitSlop`, and the tests measure the box); text contrast at least 4.5:1 and graphics at least 3:1, held by tests; Dynamic Type to AX5 (`fontScale` 3.571) with nothing truncated; reduced motion swaps each animation for a fade plus a haptic (P2-T9's table). VoiceOver labels in Thai, ฿ read as บาท; decorative art hidden from screen readers.
- **Colour (§2):** red and green (`under`, `over`) only for budget state. Income is violet with a plus sign. The saved check is neutral (§5.3).
- **Money (§4):** satang strings through BigInt only, never a JS number; `formatMinor` stays the formatter underneath; totals come from the pure models, and drafts never enter confirmed totals.
- **Contracts (C2):** no change to `packages/contracts`. Missing fields use W7 and W8, and the phase 5 handoff below.
- **Anti-goals (§2):** nothing shames, nags or alarms; nothing is saved without the person's tap; no amount, wallet name, note or custom category name in any analytics property.
- **Analytics (R61, W27):** every event goes through 1D-T1's emitters in `apps/app/src/analytics/events.ts`, called once per action in the rule that performs it. Tests install `recordAnalytics()` from `apps/app/src/analytics/testing/recordAnalytics.ts` (async; it resolves to `{ analytics, sent, restore }`, `sent` holding `{ kind, name, properties }` items), assert exactly one event per action, and assert that `JSON.stringify(sent)` holds no amount, note or name from the fixture. A task that calls an emitter starts after 1D-T1.
- **Diary SQL (R57):** SQL against the phone's diary binds an id list of unbounded size as one JSON parameter (`WHERE id IN (SELECT value FROM json_each(?))` with `JSON.stringify(ids)`), never one `?` per id. The phone's SQLite (expo-sqlite 58.0.13's SQLCipher, SQLite 3.53.3) keeps the default `SQLITE_MAX_VARIABLE_NUMBER` of 32766 (`vendor/sqlcipher/sqlite3.c`; no build file overrides it), so the rule is for unbounded lists; the vault's limit is 100. Phase 2's one new query (P2-T4) binds nothing.
- **Test-environment traps (R72):**
  - In the Vitest render suite, Reanimated runs its web build without the Worklets Babel plugin, so every `useAnimatedStyle`, `useDerivedValue`, `useAnimatedProps` and `useAnimatedReaction` call passes a dependency array as its last argument, naming the shared value itself (`[offset]`, never `[offset.value]`) (Reanimated 4.7.1, web support). This is valid on native too.
  - Reanimated's `setUpTests()` is a Jest helper and does nothing in this web suite. Tests assert end states, and use `vi.useFakeTimers()` only where a step needs time to pass.
  - `CatalogueScreen.render.test.tsx` renders every registered section in light and dark, in `en`, `th` and `vi`, and fails on any `console.error` or `fetch`. Wallet sections use fakes only. Section ids start with `bw-`, match `/^[a-z0-9]+(-[a-z0-9]+)*$/` and are unique; titles start with `Bun Wallet: `, are unique, and never equal a heading the section's screen draws (the suite finds the title by its heading).
  - react-native-web drops `hitSlop`, `onMagicTap` and `onAccessibilityEscape`. A test that needs a native-only prop reads the source with a Node test (`readFileSync`, as `src/ui/dynamicType.test.ts` does).
  - `RecordActionsState` (P2-T6) holds exactly the fields P2-T26 and P2-T27 read: `today`, `draftCommand`, `loaded`, `editing`, `deleted`, `pending`, `gone`, `notice`, `busy`, `load()`, `startEditing()`, `cancelEditing()`, `changeEditing(change)`, `pressKey(key)`, `submitEdit()`, `remove(record)`, `restore(target)`, `settleDraft(commandId, how)`, plus `choicePanel` (1D-T9: the `ChoicePanelProps` of the open choice, or null).
- **The standard steps.** Every task runs: (1) write the failing tests, behind typed stubs so the RED is behavioural; (2) run them and record the counts; (3) implement; (4) run them green, with every old suite the task names, unchanged; (5) the mutation check, then restore and compare checksums; (6) the app gate, the receipt and the commit. Run Node tests with `npm run test:unit -w gogospend-app -- <files>` and render tests with `npm run test:render -w gogospend-app -- <files>`.
- **Process for every task** (handover §4): a behavioural RED with counts, GREEN, a mutation check, the app gate, a receipt in `docs/implementation/premium-progress.md` under "## P2: Bun Wallet core", a local commit ending with the attribution trailer, and an independent read-only review. Do not push. Never run a bare `git stash`. Nothing under `vendor/`. Device, simulator and owner checks are recorded **SKIPPED** until run.
- **The app gate** (repo root):
  ```bash
  npm run typecheck:app && npm run typecheck:routes -w gogospend-app && npm run test:app && npm run test:unit && npm run test:render -w gogospend-app && npm run export:web -w gogospend-app -- --max-workers 2 && git diff --check
  ```
- **Both modes and both languages:** every new screen's render test runs light and dark, in `th` and `en`, through `mountWallet` (P2-T8), and asserts the Thai strings from the draft tables.
- **Pure modules stay pure:** a module with a Node test (`*.test.ts`) imports by relative path (never `@mobile/…`), loads no React, react-native or native package at the top level, and reaches native code only through an injected port or a lazy `import()`, as `src/lib/haptics.ts` does.
- **Time:** money's "today" is Bangkok's date (`todayInBangkok`); dates on screen follow the boards (`เสาร์ 24 ต.ค. 2569`, Buddhist year in Thai) through `src/ui/dateStep.ts`; D38 uses the phone's local calendar day (W19).

## Review Focus

The five failure modes most likely to bite a real person that no ported suite exercises. Each has its test in the task that owns the code.

1. **A save in flight is dismissed.** Swipe, backdrop, escape and Android back do nothing while a tray saves; the result still lands and the toast says so; an unconfirmed online save keeps today's frozen Try again (P2-T16).
2. **Private mode leaks a number.** With private mode on, no digit of an amount reaches the screen, a spoken label, the toast, the flying chip, a chart label, the calendar or the share text (P2-T10, T17, T24, T31, T32, and the P2-T37 sweep).
3. **The largest amount and the longest Thai name at AX5.** ฿999,999,999.99 and an 80-code-point Thai wallet name wrap and never truncate on the card, in the stack's list and in the tray (P2-T11, T12, T14).
4. **Undo after the draft has left the phone.** Undo deletes the record (restorable for 30 days) instead of removing a draft that no longer exists, and says so (P2-T17).
5. **Day edges.** The per-day hint on the month's last day divides by 1; "today" at 00:30 Bangkok on a phone whose clock reads the day before in UTC; the D38 plan across a month end on the phone's local day (P2-T24, T30, T36).

## Lanes

The controller can run these at once, each task in its own worktree, merging with `git merge --no-ff` into `claude/p1a-vault-core`:
- **From `base`:** P2-T1, T2, T3, T4, T5, T6, T7. After 1D-T1 alone: P2-T19.
- **Kit:** T8 (after T2, T3); T9 (after T2, T8); T10 (after T1, T3, T8, 1D-T1); T11 (after T1, T3, T7, T8, T10); T12 (after T9, T11); T13 (after T1, T8, T9, T10).
- **Capture:** T14 (after T5, T10, T11, T13); T15 (after T14); T16 (after T5, T7, T15, 1D-T1); T17 (after T12, T16, 1D-T1); T18 (after T12, T16, T17).
- **Wallets and Home:** T20 (after T11, T13, T19); T21 (after T9, T14, T20); T22 (after T4, T11, T16, T18, T21); T23 (after T5, T10, T11, T12); T24 (after T18, T20, T22, T23, 1D-T5).
- **Records:** T25 (after T8, T10); T26 (after T6, T10, T13, T16); T27 (after T15, T26, 1D-T4, 1D-T9); T28 (after T18, T26, 1D-T5, 1D-T9).
- **Plan and understand:** T29 (after T7, T11, T13); T30 (after T9, T10, T13, T14, T18, 1D-T1); T31 (after T1, T9, T10, T11, T13, 1D-T1); T32 (after T9, T10, T11, T13, 1D-T1).
- **Lock:** T33 (after T2, T10, T11, T13), then T34.
- **First run:** T35 (after T18, T21, T24, T30, T33, 1C-T9, 1D-T1, 1D-T8).
- **Last:** T36 (after every other build task, P2-T1 to T35, and 1D-T1), beside T37 (after T22, T24, T25, T27, T28, T29, T30, T31, T32, T33, T35); then T38 (after T37) once every E2 checkpoint is approved.

## E2 checkpoints (controller steps, not tasks)

Taken on the iOS simulator with a development client and `EXPO_PUBLIC_REDESIGN=catalogue,wallet`, one deep link per section: `gogospend://dev/catalogue?section=<id>&theme=<light|dark>&locale=<th|en>&chrome=off`, screenshotted after 8 s, as the redesign's checkpoints were (`docs/implementation/redesign-progress.md`). Every section in light and dark Thai and light English; the kit and Home also at AX5. The contact sheets go to the owner with the calls (W1 to W38) and each screen's draft copy beside it; an English line that a catalog entry or another draft line has with other Thai is marked, since it needs distinct English (P2-T38).
- **E2-A, the kit** (after P2-T13): materials, the wallet card, the stack, the tray, private mode.
- **E2-B, the daily loop** (after P2-T28): Home in each state, the trays, the saved moment, wallet detail and management, the record, the conflict panel, History.
- **E2-C, plan and understand** (after P2-T32): categories and the Thai pack (including the routed screen's switch to C3's nine, W38), budget, insights, calendar, recap.
- **E2-D, the rest** (after P2-T37): first run, the lock, and the dark, AX5 and reduced-motion captures from the sweep. Reminders are not in E2: phase 2 adds no reminder screen (R60).

Approval is recorded in the receipts with the owner's words. P2-T38 starts only after all four.

## Phase 5 handoff (R64)

When phase 5's contract adds wallet `type`, `material` and `bun_face`, category `icon` and `pack_key`:
- **Upload once:** the app sends each account's kept values (P2-T11's account store) once, then stops reading them.
- **The server wins when it has a value;** a kept value fills only a server field that is null.
- **`pack_key` is backfilled by name** with P2-T7's `packKeyOf`.
- **Wallet order stays on the phone;** no planned field carries it. Filtering History by several wallets (W16) needs its own contract change.

## File structure

```
apps/app/src/theme/walletPalette.ts, walletType.ts                         T1
apps/app/src/wallet/
  WalletRoot.tsx, motion/reducedMotion.tsx                                 T2 (T10, T33 add providers)
  WalletText.tsx                                                           T1
  copy/draftText.ts, copy/useDraftCopy.ts, common/copy.ts                  T3; each area keeps <area>/copy.ts
  store/walletStore.ts, store/deviceWalletStore.ts                         T3 (device settings; account-kept looks)
  testing/walletHarness.tsx                                                T8
  motion/walletMotion.ts, useWalletMotion.ts, GrowBar.tsx                  T9
  money/, controls/IconButton.tsx, privacy/                                T10
  looks/ (walletLooks, WalletLooksProvider, BunFace, MaterialFill, categoryGlyphs, categoryIcons, WalletCategoryIcon), card/WalletCard.tsx   T11
  card/CardStack.tsx, card/cardFrames.tsx                                  T12
  tray/ (Tray, trayGesture, PrimaryButton, TextLink)                       T13
  add/ (addFlow, WalletKeypad, AmountStep, TypeSwitchHeader, QuickChips)  T14; (TransferStep, ConfirmStep, PickSteps) T15; (AddTrayHost) T16
  saved/ (savedMoment, SavedToastHost, SaveFlight)                         T17
  home/ (WalletShell, WalletTabBar, AddButton) T18; (homeWallets, budgetCardWords) T23; (WalletHomeScreen, BudgetCard, TodayRow, CashbackPill, HomeSkeleton) T24
  wallets/ (walletsList, WalletsListScreen, ReorderTray) T20; (NewWalletFlow, WalletForm, WalletEditScreen, CorrectionTray) T21; (walletDetail, WalletDetailScreen) T22
  records/ (WalletDeletedScreen) T25; (WalletRecordScreen, RecordActionsTray, WalletUndoBar) T26; (EditTray) T27
  history/ (WalletHistoryScreen, FilterTray)                               T28
  categories/ (WalletCategoriesScreen, CategoryTray, ThaiPackTray)         T29
  budget/ (budgetQuestion, overSeen, BudgetQuestion, WalletBudgetScreen, OverBudgetMoment, OverBudgetWatch)   T30
  insights/ (calendarShade, insightsData, WalletInsightsScreen, SpendingTab, InOutTab, CalendarTab, MonthBars, InfoTray)   T31
  recap/ (biggestDay, recapShare, WalletRecapScreen, Confetti)             T32
  lock/ (lockModel, localAuthPort, LockGate, LockedScreen, LockSetupScreen, LockSettingsRow) T33; expoLocalAuth.ts T34
  setup/ (setupChecklist, SetupScreen, SetupCard, WelcomeScreen, LanguageTray)   T35
  sweep.render.test.tsx, sweep.test.ts                                     T37
apps/app/src/ui/lockCover.tsx                                              T13 (read by Tray; Sheet reads it from T33)
apps/app/src/spend/v1/redesign/loggedDays.ts                               T4
apps/app/src/screens/redesign/ (rules moved out of the approved screens, behaviour unchanged)
  entry/entryHelpers.ts, entry/entryReferences.ts, entry/entrySave.ts T5; record/recordActions.ts T6;
  planning/walletCommands.ts T19; homeData.ts T23; deleted/deletedData.ts T25; history/historyData.ts T28;
  planning/categoryCommands.ts T29; planning/budgetCommands.ts T30; insights/recapData.ts T32
apps/app/src/notifications/oneShotPlan.ts, loggedToday.ts                  T36
apps/app/src/dev/catalogue/wallet/index.ts                                 T8; one section file per task
Routes (the wallet screen while `isRedesignEnabled('wallet')`, else today's screen or a redirect to it):
  app/spend/_layout.tsx, add.tsx T18; wallets.tsx T20; wallet/new.tsx, wallet/[id]/edit.tsx (new) T21;
  wallet/[id]/index.tsx (new) T22; index.tsx T24; deleted.tsx T25; record/[id].tsx T26; all.tsx T28;
  categories.tsx T29; budget.tsx T30; insights.tsx T31; recap/[month].tsx T32; app/settings/lock.tsx (new) T33;
  app/index.tsx, app/spend/setup.tsx (new) T35
```

---

### Task P2-T1: The Bun Wallet palette, materials, type roles and WalletText

**Starts after:** base

**Files:**
- Create: `apps/app/src/theme/walletPalette.ts`, `apps/app/src/theme/walletType.ts`, `apps/app/src/wallet/WalletText.tsx`
- Modify: `apps/app/src/theme/ThemeProvider.tsx` (the context value and `ThemePreferenceOverride` gain `wallet: WalletColors`; export `useWalletColors()`)
- Test: `apps/app/src/theme/walletPalette.test.ts`, `walletType.test.ts` (Node), `apps/app/src/wallet/WalletText.render.test.tsx` (through `mountInApp` from `src/dev/catalogue/catalogueTestHarness.tsx`)

**Interfaces:**
- Produces (`walletPalette.ts`):
  - `type WalletColors` (light / dark), plus `isDark: boolean`:

    | Field | Light | Dark | Use |
    | --- | --- | --- | --- |
    | `ground` | `#F4F3F9` | `#0E0D12` | page |
    | `card` | `#FFFFFF` | `#1A1920` | cards |
    | `sheet` | `#FFFFFF` | `#24222B` | trays |
    | `raised` | `#F4F3F9` | `#2C2A33` | chips, keys, segments on a card or tray |
    | `ink` | `#111014` | `#F4F2FA` | text |
    | `quiet` | `#6B6878` | `#A9A6B6` | quiet text on card, sheet, raised |
    | `quietOnGround` | `#4A4756` | `#A9A6B6` | quiet text on the ground |
    | `hairline` | `#E6E4EE` | `#2C2A33` | separators (decorative) |
    | `violet` | `#6A4BD4` | `#B9A3F9` | links, income, selection |
    | `under` / `over` | `#1A7F4B` / `#B4364F` | `#4CC38A` / `#F47C93` | budget state only |
    | `primary` / `onPrimary` | `#111014` / `#FFFFFF` | `#F4F2FA` / `#111014` | the main button and the + |
    | `toast` / `onToast` / `toastLink` | `#111014` / `#FFFFFF` / `#B9A3F9` | `#2C2A33` / `#F4F2FA` / `#B9A3F9` | toasts |
    | `track` | `#EEEDF4` | `#2C2A33` | bar tracks |
    | `barPast` / `barNow` | `#8B76DA` / `#111014` | `#6E5FB8` / `#F4F2FA` | insight bars (W24) |
    | `guideLine` | `#8A879A` | `#6E6B7A` | the dashed budget line (W24) |
  - `walletLight`, `walletDark`, `getWalletColors(resolved: ResolvedTheme): WalletColors`.
  - `type WalletMaterial = 'silk' | 'paper' | 'titanium' | 'sky' | 'peach'`; `WALLET_MATERIALS` in that order; `type MaterialPaint = { stops: readonly { offset: number; color: string }[]; text: string; quietText: string; edge: string | null }`; `materialPaint(material, isDark): MaterialPaint`. Light stops: silk `#D9CCFF` 0, `#A891F7` 0.55, `#EFE9FF` 1; paper `#FFF4DC`, `#F3E2BE`; titanium `#3A3842`, `#121116`; sky `#D6EEFF`, `#8CC8F5`; peach `#FFE2CF`, `#FFAE85`. Dark stops: silk `#5E4CB8` 0, `#43349A` 0.55, `#6A5AC2` 1; paper `#6B5A3B`, `#4A3E28`; titanium `#34323C`, `#17161C` with `edge` `#5C5968`; sky `#2A5F86`, `#1C4466`; peach `#7A4B36`, `#57331F`. Text `#111014` on light silk, paper, sky and peach (quiet `#2A2830`); `#FFFFFF` on light titanium (quiet `#C9C6D4`); `#F4F2FA` on every dark material (quiet the same).
  - `type CalendarStep = 0 | 1 | 2 | 3 | 4 | 5`; `CALENDAR_STEP_LIMITS_BAHT = [0, 200, 500, 1000, 2000] as const`; `calendarPaint(step, isDark): { fill: string; text: string; border: string | null }`. Light fills `#FFFFFF` (border `#E6E4EE`), `#EEE9FC`, `#D5C9F7`, `#AE97EE`, `#6A4BD4`, `#3B2790`, text `#111014` on 0 to 3 and `#FFFFFF` on 4 and 5. Dark fills `#1A1920` (border `#2C2A33`), `#2E2650`, `#4A3F7A`, `#6E5FB8`, `#B9A3F9`, `#E2D9FD`, text `#F4F2FA` on 0 to 3 and `#111014` on 4 and 5.
  - `tileTint(hue: string, isDark: boolean): string`: 28% hue over `#FFFFFF` (light) or 18% hue over `#1A1920` (dark), per channel, rounded, uppercase `#RRGGBB`.
  - `WALLET_TEXT_PAIRS`: `ink` on `card`, `ground`, `sheet`, `raised`; `quiet` on `card`, `sheet`, `raised`; `quietOnGround` on `ground`; `violet` on `card`, `ground`, `sheet`, `raised`; `under` and `over` on `card` and `ground`; `onPrimary` on `primary`; `onToast` and `toastLink` on `toast`. `WALLET_GRAPHIC_PAIRS`: `barPast`, `barNow` and `guideLine` on `card`; `ink`, `over` and `violet` on `track`; `primary` on `ground`.
- Produces (`walletType.ts`): `type WalletTextRole = 'h1' | 'h2' | 'body' | 'label' | 'caption'`; `WALLET_TYPE` = h1 28/700/2.07, h2 18/700/2.4, body 17/400/3.12, label 15/500/3.12, caption 13/400/3.38 (size / weight / `maxScale`, W30); `amountMaxScale(size) = Math.min(WALLET_TYPE.body.maxScale, 64 / size)`; `walletLineHeight(size, script: 'thai' | 'latin') = Math.ceil(size * (script === 'thai' ? 1.5 : 1.3))`.
- Produces (`WalletText.tsx`): `WalletText(props: TextProps & { role?: WalletTextRole; tone?: 'ink' | 'quiet' | 'quietOnGround' | 'violet' | 'under' | 'over' | 'onPrimary' | 'onToast' })`: `THAI_UI_FONT_FAMILY` (Anuphan) in every language (§5.1, R74), the role's size and weight, `walletLineHeight(size, locale === 'th' ? 'thai' : 'latin')`, and `maxFontSizeMultiplier` from the role. `useWalletColors(): WalletColors` from `ThemeProvider.tsx`.

- [ ] **Step 1: Write the failing tests.**

```ts
const modes = [['light', walletLight], ['dark', walletDark]] as const;

test('the §5.1 tokens, exactly', () => {
  assert.deepEqual([walletLight.ground, walletLight.card, walletLight.ink, walletLight.quiet, walletLight.quietOnGround, walletLight.hairline, walletLight.violet, walletLight.under, walletLight.over],
    ['#F4F3F9', '#FFFFFF', '#111014', '#6B6878', '#4A4756', '#E6E4EE', '#6A4BD4', '#1A7F4B', '#B4364F']);
  assert.deepEqual([walletDark.ground, walletDark.card, walletDark.sheet, walletDark.ink, walletDark.quiet, walletDark.violet, walletDark.under, walletDark.over],
    ['#0E0D12', '#1A1920', '#24222B', '#F4F2FA', '#A9A6B6', '#B9A3F9', '#4CC38A', '#F47C93']);
});

test('text pairs clear 4.5:1 and graphic pairs 3:1 in both modes; the board bar did not (§5.3)', () => {
  for (const [mode, c] of modes) {
    for (const [fg, bg] of WALLET_TEXT_PAIRS) assert.ok(contrastRatio(c[fg] as string, c[bg] as string) >= 4.5, `${mode}: ${fg} on ${bg}`);
    for (const [fg, bg] of WALLET_GRAPHIC_PAIRS) assert.ok(contrastRatio(c[fg] as string, c[bg] as string) >= 3, `${mode}: ${fg} on ${bg}`);
  }
  assert.ok(contrastRatio('#DCD3F7', '#FFFFFF') < 3);
});

test('material text and quiet text clear 4.5:1 on every stop, light and dark', () => {
  for (const isDark of [false, true]) for (const material of WALLET_MATERIALS) {
    const paint = materialPaint(material, isDark);
    for (const { color } of paint.stops) for (const text of [paint.text, paint.quietText]) assert.ok(contrastRatio(text, color) >= 4.5, `${material} ${isDark}`);
  }
  assert.equal(materialPaint('titanium', true).edge, '#5C5968');
});

test('the calendar ramp is wc-calendar, and each day number clears 4.5:1 on its fill', () => {
  assert.deepEqual(([0, 1, 2, 3, 4, 5] as const).map((s) => calendarPaint(s, false).fill), ['#FFFFFF', '#EEE9FC', '#D5C9F7', '#AE97EE', '#6A4BD4', '#3B2790']);
  for (const isDark of [false, true]) for (const s of [0, 1, 2, 3, 4, 5] as const) assert.ok(contrastRatio(calendarPaint(s, isDark).text, calendarPaint(s, isDark).fill) >= 4.5);
});

test('category tiles: the mode ink clears 4.5:1 on every hue tint', () => {
  for (const hue of CATEGORY_COLORS) {
    assert.ok(contrastRatio(walletLight.ink, tileTint(hue, false)) >= 4.5, hue);
    assert.ok(contrastRatio(walletDark.ink, tileTint(hue, true)) >= 4.5, hue);
  }
  assert.equal(tileTint('#F0A868', false), '#FBE7D5');
});
```
  `walletType.test.ts`: `AX5 sizes follow ax-large-home: body 53, title 58, footnote 44` (round `size * maxScale` for body, h1 and caption); `an amount never passes 64 pt nor grows more than body text` (sizes 58, 44, 36, 34, 28, 22, 17, 16, 13). `WalletText.render.test.tsx`: `WalletText is Anuphan in Thai and in English, in the wallet ink of each mode` (`fontFamily` equals `THAI_UI_FONT_FAMILY` for `th` and `en`; `color` equals `rgba('#111014')` light and `rgba('#F4F2FA')` dark).
- [ ] **Step 2: Run them and see them fail** against placeholder exports with the right types and wrong values. Record the counts.
- [ ] **Step 3: Write the palette, the type roles, `WalletText` and the ThemeProvider field.**
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.** `barPast` back to `#DCD3F7`: the pairs test fails. Dark silk `quietText` `#E9E6F2`: the material test fails. Body `maxScale` 3.571: the AX5 test fails. DM Sans for English: the WalletText test fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add the Bun Wallet palette, materials and type roles, held to WCAG by tests"`

---

### Task P2-T2: Packages, the gesture root, the wallet area and one reduced-motion answer

**Starts after:** base

**Files:**
- Modify: `apps/app/package.json` and `package-lock.json` (by `npx expo install`); `apps/app/vitest.render.config.ts` only if Step 2 needs it
- Modify: `apps/app/src/config/featureFlags.ts` (`RedesignArea` gains `'wallet'`, not in `APPROVED`), `featureFlags.test.ts`
- Create: `apps/app/src/wallet/WalletRoot.tsx`, `apps/app/src/wallet/motion/reducedMotion.tsx`; Modify: `apps/app/app/_layout.tsx` (`<WalletRoot>` inside `ThemeProvider`, around `LocaleUpkeep`, `ThemedStatusBar` and the `Stack`)
- Test: `apps/app/src/wallet/WalletRoot.render.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  // src/wallet/motion/reducedMotion.tsx
  export function WalletMotionProvider({ children }: { children: ReactNode }): JSX.Element
  export function useWalletReducedMotion(): boolean   // true until the phone answers (R66), then its live answer
  export function useReducedMotionKnown(): boolean    // false until the first answer
  // src/wallet/WalletRoot.tsx: GestureHandlerRootView style={{ flex: 1 }} > WalletMotionProvider > children
  export function WalletRoot({ children }: { children: ReactNode }): JSX.Element
  ```
- The provider calls `AccessibilityInfo.isReduceMotionEnabled()` once at mount (a rejection answers `false`, as `src/hooks/useReducedMotion.ts` does) and keeps one `reduceMotionChanged` listener. Outside the provider both hooks resolve the same way with local state. Every wallet animation reads `useWalletReducedMotion()` and decides at mount, so nothing starts at full motion before the answer.

- [ ] **Step 1: Install the packages.**
  ```bash
  node -e "const m=require('./node_modules/expo/bundledNativeModules.json');console.log(m['react-native-reanimated'],m['react-native-worklets'],m['react-native-gesture-handler'])"   # 4.7.1 0.13.0 ~3.3.0
  (cd apps/app && npx expo install react-native-reanimated react-native-worklets react-native-gesture-handler)
  npm ls react-native-reanimated react-native-worklets react-native-gesture-handler   # one copy each, those versions
  npm run test:ops
  ```
  No Babel or `app.json` change: babel-preset-expo includes the plugin.
- [ ] **Step 2: Write the failing tests.**
  - `featureFlags.test.ts`: `the wallet area is off unless named` (`isRedesignEnabled('wallet', undefined) === false`; `'wallet'` and `'all'` turn it on; `'wallet,-wallet'` and `'off'` keep it off).
  - `WalletRoot.render.test.tsx` (rendered directly; the harness comes in P2-T8):
    - `Reanimated and Gesture Handler load in the render suite without a console error`: a probe with `usePanGesture({ runOnJS: true })` in a `GestureDetector` around `<Animated.View testID="mover" entering={FadeIn.duration(150)} />` inside `<WalletRoot>`: `mover` is found and a `vi.spyOn(console, 'error')` was never called (R72).
    - `reduced motion reads as on until the phone answers, then follows it`: `vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled')` returns a promise the test resolves, and `addEventListener` is spied to capture the handler. A probe shows `reduced=true known=false`; after resolving `false`, `reduced=false known=true`; after the handler is called with `true`, `reduced=true`.
  - If the smoke test cannot load Reanimated or Gesture Handler, add the three packages to `test.server.deps.inline` in `vitest.render.config.ts` (as `react-native-svg` is) and run again. Record what was needed.
- [ ] **Step 3: Run them and see them fail.** Record the counts.
- [ ] **Step 4: Implement** the flag, the provider, `WalletRoot` and its mount.
- [ ] **Step 5: Run them and see them pass,** then the whole render suite once (the root layout changed): `npm run test:render -w gogospend-app`.
- [ ] **Step 6: Mutation check.** `'wallet'` in `APPROVED`: the flag test fails. Start the answer at `false`: the reduced-motion test fails.
- [ ] **Step 7: Gate, receipt, commit.** The receipt records the installed versions and the lockfile change. `git commit -m "Add Reanimated and Gesture Handler, the wallet area and one reduced-motion answer at the root"`

---

### Task P2-T3: Draft copy and the wallet stores: device settings and account-kept looks

**Starts after:** base

**Files:**
- Create: `apps/app/src/wallet/copy/draftText.ts` (pure), `apps/app/src/wallet/copy/useDraftCopy.ts`, `apps/app/src/wallet/common/copy.ts`
- Create: `apps/app/src/wallet/store/walletStore.ts` (pure), `apps/app/src/wallet/store/deviceWalletStore.ts`
- Modify: `apps/app/src/spend/v1/spendDiary.ts` (`DiaryView.accountId`), `apps/app/src/spend/v1/testing/fakeDiary.ts` (`accountId` in the view; default `'00000000-0000-4000-8000-0000000000aa'`), `apps/app/src/spend/v1/DeviceDiaryProvider.tsx` (`eraseWithDiary` also awaits `eraseDeviceSettings().catch(() => undefined)`), `apps/app/src/screens/redesign/account/PrivacyScreen.tsx` (`DeleteCard`'s `settle`)
- Test: `apps/app/src/wallet/copy/draftText.test.ts`, `apps/app/src/wallet/store/walletStore.test.ts` (Node); `apps/app/src/spend/v1/spendDiary.test.ts`, `DeviceDiaryProvider.render.test.tsx` (its AsyncStorage mock gains `getAllKeys` and `multiRemove`), `apps/app/src/screens/redesign/account/PrivacyScreen.render.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  // copy/draftText.ts (pure)
  export type DraftLine = { readonly th: string; readonly en: string }
  export type DraftTable = Readonly<Record<string, DraftLine>>
  export type CopyValues = Readonly<Record<string, string | number>>
  export type WalletT = (key: string, values?: CopyValues) => string
  export function draftText(table: DraftTable, key: string, locale: 'th' | 'en' | 'vi', values?: CopyValues): string   // th: Thai; en and vi: English; {token}s filled in one pass as formatCopyValues does
  export function tableT(table: DraftTable, locale: 'th' | 'en' | 'vi'): WalletT
  // copy/useDraftCopy.ts
  export function useDraftCopy(table: DraftTable): WalletT   // locale from useActiveLocale
  // store/walletStore.ts (pure)
  export const DEVICE_PREFIX = 'jotbun.wallet.'
  export const ACCOUNT_PREFIX = 'jotbun.account.'
  export type StoreBackend = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void>; getAllKeys(): Promise<readonly string[]>; multiRemove(keys: readonly string[]): Promise<void> }
  export type KeyValueStore = { get(name: string): Promise<string | null>; set(name: string, value: string): Promise<void>; remove(name: string): Promise<void>; eraseAll(): Promise<void> }
  export function deviceStore(backend: StoreBackend): KeyValueStore                      // 'jotbun.wallet.<name>'
  export function accountStore(backend: StoreBackend, accountId: string): KeyValueStore   // 'jotbun.account.<accountId>.<name>'; eraseAll removes only that account's keys
  // store/deviceWalletStore.ts (AsyncStorage 2.2.0 underneath)
  export function walletDeviceStore(): KeyValueStore
  export function walletAccountStore(accountId: string): KeyValueStore
  export function installStoreBackend(backend: StoreBackend | null): void   // tests only
  export function eraseDeviceSettings(): Promise<void>                       // at the sign-out erase
  export function eraseAccountKept(accountId: string): Promise<void>         // after a confirmed account deletion
  // spend/v1/spendDiary.ts
  DiaryView.accountId: string | null   // the open diary's account; null with no open diary (web, opening, locked, signed out)
  ```
- **Two scopes (R64).** Device settings (private mode and its tip, the lock, setup answers, over-budget marks, confetti marks) live in `walletDeviceStore()` and go at the sign-out erase. Wallet looks, category icons and wallet order are the person's data: `walletAccountStore(accountId)` with `useDiaryView().accountId`; they survive sign-out and go only after a confirmed deletion. With no account id nothing is stored and derived looks show.
- **The deletion erase:** in `DeleteCard`'s `settle`, read `view.accountId` before settling; when `settleDeviceCopy` answers `'erased'` and the id is not null, `await eraseAccountKept(accountId).catch(() => undefined)`. Nothing else in the deletion flow changes.
- **The copy rule for every later task:** each area keeps `src/wallet/<area>/copy.ts` exporting `export const COPY = { '<area>.<name>': { th: '…', en: '…' } } as const satisfies DraftTable`, data only (`import type { DraftTable }`). Keys are `<area>.<name>`, unique across every table, so a component that needs several areas passes the merged tables (`useDraftCopy({ ...COMMON_COPY, ...HOME_COPY })`). `common/copy.ts` (exported as `COMMON_COPY`) holds `common.close` (ปิด / Close), `common.back` (กลับ / Back), `common.next` (ถัดไป / Next, sa-lock-setup's word), `common.save` (บันทึก / Save), `common.undo` (เลิกทำ / Undo), `common.later` (ไว้ทีหลัง / Later), `common.done` (เสร็จ / Done), `common.tryAgain` (ลองอีกครั้ง / Try again), `common.amountHidden` (ซ่อนยอดเงินอยู่ / Amount hidden), `common.baht` (`{amount} บาท` / `{amount} baht`), `common.satang` (`{baht} บาท {satang} สตางค์` / `{baht} baht {satang} satang`) and `common.minus` (`ติดลบ {amount}` / `minus {amount}`, around either of the other two).

- [ ] **Step 1: Write the failing tests.**
  - `draftText.test.ts` imports every `src/wallet/**/copy.ts` found with `readdirSync`:
    - `every draft line has Thai and English, with the same placeholders`: non-empty `th` with a character from U+0E00 to U+0E7F, unless its key is in the test's own `LATIN_LINES` set (lines the boards write in Latin letters in Thai too, such as `card.kindTransit`, "BTS / MRT"); non-empty `en`; the same sorted `{placeholder}` lists;
    - `no draft line has an emoji or a dash used as punctuation` (`/\p{Extended_Pictographic}/u`; no U+2014 or U+2013);
    - `every key is unique across every table and has an area prefix` (`/^[a-z]+\.[A-Za-z0-9_.]+$/`);
    - `draftText picks Thai for th and English for en and vi, then fills placeholders` (`common.baht` with `{ amount: '12,480' }` gives `12,480 บาท`, then `12,480 baht` for `en` and `vi`).
  - `walletStore.test.ts`: `the device erase removes every jotbun.wallet. key and nothing else` (a memory backend holding `jotbun.wallet.private-mode`, `jotbun.account.a1.looks` and `gogospend.bun.intensity` keeps the last two); `an account erase removes only that account's keys` (`jotbun.account.a1.looks` goes, `jotbun.account.a2.looks` stays); `names are prefixed by their scope`.
  - `spendDiary.test.ts`: `the view names the open diary's account, and nobody without one`.
  - `DeviceDiaryProvider.render.test.tsx`: `the sign-out erase forgets the wallet's device settings and keeps the account's looks`.
  - `PrivacyScreen.render.test.tsx`: `a confirmed deletion erases this account's kept looks; a refused one keeps them` (drive the suite's existing deletion cases that end `accepted` and refused, with a memory backend installed).
- [ ] **Step 2: Run them and see them fail.** Record the counts.
- [ ] **Step 3: Implement** the copy, the stores, the view field, the two erase calls and `common/copy.ts`.
- [ ] **Step 4: Run them and see them pass,** with `PrivacyScreen.render.test.tsx` and `DeviceDiaryProvider.render.test.tsx` whole.
- [ ] **Step 5: Mutation check.** Drop the prefix filter in the device erase: the store test fails. Erase account looks at sign-out: the DeviceDiaryProvider test fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add Bun Wallet draft copy, a device store forgotten at sign-out and account-kept looks erased only with the account"`

---

### Task P2-T4: Logged days from the device diary

**Starts after:** base

**Files:**
- Modify: `apps/app/src/storage/diaryRepository.ts` (`loggedDays()`), `apps/app/src/spend/v1/spendDiary.ts` (`SpendDiary.loggedDays()`), `apps/app/src/spend/v1/testing/fakeDiary.ts` (`createFakeDiary(view, { loggedDays })`: `loggedDays()` answers the seeded dates merged with the view's `pending` dates, or null when the view's phase is not `ready`)
- Create: `apps/app/src/spend/v1/redesign/loggedDays.ts` (pure)
- Test: `apps/app/src/storage/diaryRepository.test.ts`, `apps/app/src/spend/v1/spendDiary.test.ts`, `apps/app/src/spend/v1/redesign/loggedDays.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // storage/diaryRepository.ts, DiaryStore
  loggedDays(): Promise<string[]>   // distinct YYYY-MM-DD of live confirmed transactions and of drafts, ascending
  // spend/v1/spendDiary.ts, SpendDiary
  loggedDays(): Promise<readonly string[] | null>   // null with no open diary
  // spend/v1/redesign/loggedDays.ts
  export function streakCount(days: readonly string[], today: string): number   // distinct valid dates up to today (R59)
  export function loggedOn(days: readonly string[], day: string): boolean
  ```
- The store's one read, through its `read` helper, binding nothing:
  ```sql
  SELECT json_extract(snapshot, '$.occurred_on') AS day FROM confirmed_entities WHERE entity = 'transaction' AND state = 'active'
  UNION
  SELECT json_extract(entry, '$.occurred_on') AS day FROM pending_entries
  ORDER BY day
  ```

- [ ] **Step 1: Write the failing tests.**
  - `diaryRepository.test.ts`: `logged days are the distinct dates of live records and drafts`: two confirmed records on `2026-10-20`, a deleted one on `2026-10-21` and a draft on `2026-10-23` give `['2026-10-20', '2026-10-23']`.
  - `spendDiary.test.ts`: `logged days come from the open diary, and null without one`.
  - `loggedDays.test.ts`:
    ```ts
    test('the streak counts every logged day; a skipped day pauses it and never lowers it', () => {
      const days = ['2026-10-20', '2026-10-21', '2026-10-23', '2026-10-24'];
      assert.equal(streakCount(days, '2026-10-24'), 4);
      assert.equal(streakCount(days, '2026-10-26'), 4);
    });
    test('a day dated in the future does not count yet, and repeats count once', () => {
      assert.equal(streakCount(['2026-10-24', '2026-10-24', '2026-10-25'], '2026-10-24'), 1);
    });
    test('loggedOn finds a day', () => {
      assert.equal(loggedOn(['2026-10-24'], '2026-10-24'), true);
      assert.equal(loggedOn(['2026-10-23'], '2026-10-24'), false);
    });
    ```
- [ ] **Step 2: Run them and see them fail.** Record the counts.
- [ ] **Step 3: Implement** the query, the diary method and the model.
- [ ] **Step 4: Run them and see them pass,** then `npm run test:unit -w gogospend-app` whole.
- [ ] **Step 5: Mutation check.** Count only the run that ends today (a restart on a skip, the old rule): the streak test fails (R59). Drop the drafts from the union: the repository test fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Read the days logged from the device diary, for a streak that pauses on a skipped day"`

---

### Task P2-T5: Quick add's references and save rules move into hooks

**Starts after:** base

**Files:**
- Create: `apps/app/src/screens/redesign/entry/entryHelpers.ts` (moved unchanged from `QuickAddScreen.tsx`: `rank`, `firstDraft`, `withDefaults`, `earliestFor`, `availableBalances`, `walletChoices`, `keypadFor`, `KEYPAD_PROBLEM_TEXT`, `localSaveProblem`, `copyProblem`, and the `Ranking`, `References`, `CopySource` and `CreateInput` types), `entry/entryReferences.ts`, `entry/entrySave.ts`
- Modify: `apps/app/src/screens/redesign/QuickAddScreen.tsx` (renders from the hooks; no behaviour change)
- Test: `apps/app/src/screens/redesign/entry/entrySave.render.test.tsx`; `QuickAddScreen.render.test.tsx` and `CatalogueScreen.render.test.tsx` run unchanged

**Interfaces:**
- Produces:
  ```ts
  export type EntryReferences =
    | { state: 'loading'; label: string }
    | { state: 'problem'; message: string; retry: (() => void) | null; startBlank: (() => void) | null }
    | { state: 'no_wallet' }
    | { state: 'ready'; today: string; wallets: readonly WalletSnapshot[]; categories: readonly CategoryDto[];
        balances: ReadonlyMap<string, Minor> | null; records: readonly TransactionDto[]; drafts: readonly PendingEntry[];
        source: CopySource | null; refreshBalances: () => void };
  export function useEntryReferences(input: { copyOf: string | null; now?: Date }): EntryReferences;

  export type EntryTrack = { source: 'typed' | 'tell_bun'; categoryKey: string | null; openedAt: number };   // 1D-T1's trackRecordSaved inputs
  export type EntrySaveStatus = 'editing' | 'saving' | 'unconfirmed' | 'blocked' | 'saved' | 'conflict';
  export type SavedEntry = { draft: QuickAddDraft; via: 'device' | 'online'; cheer: boolean; track: EntryTrack | null };
  export type SaveAttempt = { settledKeypad: KeypadState | null; openDetails: boolean };
  export type EntrySave = {
    status: EntrySaveStatus; message: string | null;
    errors: Readonly<Record<string, string>>; serverErrors: Readonly<Record<string, string>>;
    resendBlocked: boolean; saved: SavedEntry | null; locked: boolean;
    save(input: { draft: QuickAddDraft; keypad: KeypadState; wallets: readonly WalletSnapshot[]; track?: EntryTrack }): Promise<SaveAttempt>;
    another(): void;
  };
  export function useEntrySave(options: { today: string; onSaved?: (saved: SavedEntry) => void; savedHaptic?: 'quickAdd' | 'success' }): EntrySave;
  ```
- `useEntryReferences` is today's `QuickAddScreen` body before `<EntryForm>` (the three loads, the device references, the frozen lists, the copy source, `availableBalances`). `useEntrySave` holds `finish`, `sendOnline`, `save` and the cheer-day read, word for word, with two additions: `finish` receives the `track` of the save that led to it (a resend keeps its first attempt's track) and puts it on `SavedEntry`; and `savedHaptic: 'success'` plays `saveLanded` for a phone-kept save too (W17), while the default `'quickAdd'` keeps today's `saveQueued`. `onSaved` is called once per success, after the device commit or the acknowledgement, never on a conflict.
- Analytics: this task sends no event. 1D-T7 adds `trackRecordSaved` inside `finish`, from `track` (R61); under the carry rule, if Quick add's `finish` already holds that call, it moves with `finish` and reads `track` when one is given.

- [ ] **Step 1: Write the failing tests** in `entrySave.render.test.tsx`, through a probe that calls `useEntrySave` and draws `status` and a Save button for a fixed expense draft (fixtures from `src/spend/v1/redesign/testing/fixtures.ts`):
  - `a device save calls onSaved once, after the diary kept it` (a fake diary in phase `ready` whose `saveDraft` resolves: one `onSaved` with `via: 'device'`; with `saveDraft` rejecting, no `onSaved` and the message `Couldn't save this entry on the device. Nothing was saved.`);
  - `an online save that may have committed is frozen, and saving again resends the same command key` (no diary; `fake.loseResponse('createTransaction')`: status `unconfirmed`; the second save calls `createTransaction` with the same key);
  - `a create refused because the record already exists with other details is a conflict, never saved`;
  - `the track a caller passes reaches onSaved, and a resend keeps the first attempt's track`;
  - `savedHaptic success plays success for a phone-kept save; Quick add's default stays light` (`vi.spyOn(haptics, 'success')` and `vi.spyOn(haptics, 'light')` from `src/lib/haptics.ts`).
- [ ] **Step 2: Run it and see it fail** against a placeholder that never calls `onSaved`. Record the counts.
- [ ] **Step 3: Move the code.** Cut, do not rewrite: the helpers, then `useEntryReferences`, then `useEntrySave`; add `track` and `savedHaptic`.
- [ ] **Step 4: Run it, Quick add's suite and the catalogue suite.** Quick add's count is unchanged (record both counts).
- [ ] **Step 5: Mutation check.** Call `onSaved` before `saveDraft` resolves: the first test fails. Settle the key on a network error: the second fails. Play `saveQueued` under `'success'`: the haptic test fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Move Quick add's loading and save rules into hooks the trays can share"`

---

### Task P2-T6: The record screen's rules move into a hook

**Starts after:** base

**Files:**
- Create: `apps/app/src/screens/redesign/record/recordActions.ts`
- Modify: `apps/app/src/screens/redesign/RecordScreen.tsx` (renders from the hook; no behaviour change)
- Test: `apps/app/src/screens/redesign/record/recordActions.render.test.tsx`; `RecordScreen.render.test.tsx` and `CatalogueScreen.render.test.tsx` run unchanged

**Interfaces:**
- Produces (the names `RecordScreen` uses today; `RecordScreen` keeps only rendering):
  ```ts
  export type RecordLoaded = { state: 'loading' } | { state: 'ready'; record: TransactionDto; wallets: WalletDto[]; categories: CategoryDto[] } | { state: 'error'; error: unknown };
  export type RecordEditing = { draft: EditDraft; keypad: KeypadState; errors: FieldErrors; message: string | null; conflict: TransactionDto | null; unconfirmed: boolean };
  export type RecordActionsState = {
    today: string;
    draftCommand: OutboxCommand | undefined;            // the record is still a draft on this phone
    loaded: RecordLoaded;
    editing: RecordEditing | null;
    deleted: { id: string; version: number } | null;    // the undo bar restores this version
    pending: 'delete' | 'restore' | null;               // an outcome unknown: frozen until Try again
    gone: boolean;                                       // an edit learned it was deleted elsewhere
    notice: string | null;
    busy: boolean;
    load(): Promise<void>;
    startEditing(): void;                                // today's setEditing(startEdit(record))
    cancelEditing(): void;
    changeEditing(change: (current: RecordEditing) => RecordEditing): void;
    pressKey(key: KeypadKey): void;
    submitEdit(): Promise<void>;                         // on the current editing state
    remove(record: TransactionDto): Promise<void>;
    restore(target: { id: string; version: number }): Promise<void>;
    settleDraft(commandId: string, how: 'remove' | 'discard'): Promise<void>;
  };
  export function useRecordActions(input: { id: string; mode: 'view' | 'edit'; now?: Date }): RecordActionsState;
  export { lookupsOf, earliestDate, startEdit, KEYPAD_PROBLEM_TEXT };   // moved unchanged
  ```
- Under the carry rule: if 1D-T9 merged first, its C16 flow moves into this hook with `submitEdit` and the load, and the hook also returns `choicePanel: ChoicePanelProps | null`; if 1D-T7 merged first, its record events move with their rules. This task adds no event and no choice of its own.

- [ ] **Step 1: Write the failing tests** in `recordActions.render.test.tsx`, through a probe that calls the hook and shows its state as text:
  - `deleting gives an undo that restores with the version the delete returned` (`deleteTransaction` acknowledges version 2; undo calls `restoreTransaction(id, 2, key)`);
  - `an edit refused with VERSION_CONFLICT keeps both versions and sends nothing more` (`editing.conflict` is the server's record; one `updateTransaction`);
  - `an edit whose answer never came is frozen, and Try again resends the same command key`.
- [ ] **Step 2: Run it and see it fail** against a placeholder hook. Record the counts.
- [ ] **Step 3: Move the code** out of `RecordScreen`, unchanged.
- [ ] **Step 4: Run it, Record's suite and the catalogue suite.** Record's count is unchanged.
- [ ] **Step 5: Mutation check.** Restore with version 1 instead of the delete's: the first test fails. Settle the edit key on a lost answer: the third test fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Move the record screen's rules into a hook the Bun Wallet record can share"`

---

### Task P2-T7: The Thai everyday pack per C3, pack keys and analytics category keys

**Starts after:** base

**Files:**
- Modify: `apps/app/src/spend/v1/redesign/planning/thaiPack.ts`, `thaiPack.test.ts`
- Modify: `apps/app/src/screens/redesign/planning/CategoriesScreen.tsx` (its two calls pass `PACK_BEFORE_C3`, so the routed screen keeps today's seven until P2-T38; W38)

**Interfaces:**
- Produces:
  ```ts
  export type PackKey = 'family_out' | 'merit' | 'delivery' | 'motorbike_rail' | 'topup' | 'seven' | 'lottery' | 'pets' | 'family_in';
  export type PackItem = { readonly key: string; readonly type: CategoryType; readonly th: string; readonly en: string; readonly color: string; readonly aliases?: readonly string[] };
  export type C3Item = PackItem & { readonly key: PackKey; readonly aliases: readonly string[] };
  export const THAI_EVERYDAY_PACK: readonly C3Item[];   // C3's nine, in C3's order: 1D-T1's PACK_KEYS equals its keys
  export const PACK_BEFORE_C3: readonly PackItem[];     // today's seven, unchanged (keys family_out, merit, delivery, phone, pets, lottery, family_in)
  export function missingPackItems(existing: readonly Pick<CategoryDto, 'type' | 'label'>[], pack?: readonly PackItem[]): PackItem[];   // pack defaults to THAI_EVERYDAY_PACK
  export function packCommands(existing: readonly Pick<CategoryDto, 'type' | 'label'>[], locale: 'th' | 'en' | 'vi', newId: () => string, options?: { pack?: readonly PackItem[]; only?: readonly string[] }): CategoryCommand[];
  export function packKeyOf(category: Pick<CategoryDto, 'type' | 'label' | 'builtin_key'>): PackKey | null;
  export function analyticsCategoryKey(category: Pick<CategoryDto, 'type' | 'label' | 'builtin_key'> | null): string | null;
  ```
- `THAI_EVERYDAY_PACK` (en is draft):

  | key | type | th | en | color | aliases |
  | --- | --- | --- | --- | --- | --- |
  | family_out | expense | ส่งเงินให้ครอบครัว | Family support | `#F291C4` | |
  | merit | expense | ทำบุญ | Merit making | `#F2CE5C` | |
  | delivery | expense | เดลิเวอรี | Delivery | `#F0A868` | สั่งอาหารเดลิเวอรี่, Food delivery |
  | motorbike_rail | expense | วินมอไซค์และรถไฟฟ้า | Motorbike taxi and rail | `#4E93D9` | |
  | topup | expense | เติมเงินมือถือ | Mobile top-up | `#6FB3F2` | ค่าโทรศัพท์และเน็ต, Phone and internet |
  | seven | expense | เซเว่น | Convenience store | `#D6EE8A` | |
  | lottery | expense | ลอตเตอรี่ | Lottery | `#D3C2F2` | |
  | pets | expense | สัตว์เลี้ยง | Pets | `#9CD4F5` | |
  | family_in | income | เงินจากครอบครัว | From family | `#A8CC4A` | |
- Matching folds as today (NFC, trimmed, lower case, same type) over `th`, `en` and every alias. `packCommands` creates the missing items of `pack` (or only the `only` keys among them), named in the person's language. `packKeyOf` matches a custom category against C3's names and aliases; a built-in is never a pack category. `analyticsCategoryKey` is `null` for no category (a transfer), else the built-in key, else the pack key, else `'custom'`; keep this signature and key order (R61).

- [ ] **Step 1: Write the failing tests** (keep the hue and uniqueness test):
  ```ts
  test('the pack is C3: eight expense categories and one income, in order', () => {
    assert.deepEqual(THAI_EVERYDAY_PACK.map((i) => i.key), ['family_out', 'merit', 'delivery', 'motorbike_rail', 'topup', 'seven', 'lottery', 'pets', 'family_in']);
    assert.deepEqual(THAI_EVERYDAY_PACK.map((i) => i.type), [...Array(8).fill('expense'), 'income']);
  });
  test('a person who added the earlier pack gets no second delivery or top-up category', () => {
    const missing = missingPackItems([{ type: 'expense', label: 'สั่งอาหารเดลิเวอรี่' }, { type: 'expense', label: 'Phone and internet' }]).map((i) => i.key);
    assert.ok(!missing.includes('delivery') && !missing.includes('topup'));
  });
  test('packKeyOf names a pack category by any of its names, never a built-in or another type', () => {
    assert.equal(packKeyOf({ type: 'expense', label: '  เดลิเวอรี ', builtin_key: null }), 'delivery');
    assert.equal(packKeyOf({ type: 'income', label: 'Pets', builtin_key: null }), null);
    assert.equal(packKeyOf({ type: 'expense', label: null, builtin_key: 'food' }), null);
  });
  test('analyticsCategoryKey sends a built-in key, a pack key or custom, never a label', () => {
    assert.equal(analyticsCategoryKey({ type: 'expense', label: null, builtin_key: 'food' }), 'food');
    assert.equal(analyticsCategoryKey({ type: 'expense', label: 'ทำบุญ', builtin_key: null }), 'merit');
    assert.equal(analyticsCategoryKey({ type: 'expense', label: 'Art', builtin_key: null }), 'custom');
    assert.equal(analyticsCategoryKey(null), null);
  });
  test('packCommands creates only the picked items, in the person’s language', () => {
    const commands = packCommands([], 'th', () => '00000000-0000-4000-8000-000000000001', { only: ['seven'] });
    assert.equal(commands.length, 1);
    assert.equal(commands[0].slot === 'category' && commands[0].kind === 'create' ? commands[0].input.label : '', 'เซเว่น');
  });
  test('the routed screen keeps today’s seven until the switch', () => {
    assert.deepEqual(PACK_BEFORE_C3.map((i) => i.key), ['family_out', 'merit', 'delivery', 'phone', 'pets', 'lottery', 'family_in']);
  });
  ```
- [ ] **Step 2: Run it and see it fail.** Record the counts.
- [ ] **Step 3: Implement** the pack, the two lists and the functions; pass `PACK_BEFORE_C3` in `CategoriesScreen`'s `missingPackItems` and `packCommands` calls.
- [ ] **Step 4: Run it, `CategoriesScreen.render.test.tsx` and the catalogue suite, unchanged** (the routed screen still offers seven).
- [ ] **Step 5: Mutation check.** Drop the aliases from matching: the earlier-pack test fails. Let `packKeyOf` ignore the type: its second assertion fails.
- [ ] **Step 6: Gate, receipt, commit.** The receipt lists the English names as drafts for E2-C. `git commit -m "Add C3's nine-item Thai pack for the wallet area, recognised by name, with today's routed pack kept until approval"`

---

### Task P2-T8: The wallet test harness and the catalogue list

**Starts after:** P2-T2, P2-T3

**Files:**
- Create: `apps/app/src/wallet/testing/walletHarness.tsx`, `apps/app/src/dev/catalogue/wallet/index.ts`
- Modify: `apps/app/src/dev/catalogue/registry.tsx` (`...WALLET_SECTIONS` last in `CATALOGUE_SECTIONS`)
- Test: `apps/app/src/wallet/testing/walletHarness.render.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export const AX5 = 3.571;
  export const TEST_ACCOUNT_ID = '00000000-0000-4000-8000-0000000000aa';   // the fake diary's account
  export type MountWalletOptions = {
    resources?: SpendV1Resources;               // default createFakeResources().resources
    diary?: SpendDiary | null;                  // default createFakeDiary().diary; null mounts no diary (the web)
    ai?: AiResources;                           // default fakeAiResources().resources (companion off)
    locale?: 'th' | 'en'; mode?: 'light' | 'dark'; fontScale?: number;   // defaults th, light, 1
    reducedMotion?: boolean | 'pending';        // default false; 'pending' holds the answer until answerReducedMotion
    device?: Readonly<Record<string, string>>;  // seeds 'jotbun.wallet.<name>'
    account?: Readonly<Record<string, string>>; // seeds 'jotbun.account.<TEST_ACCOUNT_ID>.<name>'
  };
  export function mountWallet(element: ReactElement, options?: MountWalletOptions): RenderResult & { stored: Map<string, string>; answerReducedMotion(value: boolean): void };
  export const WALLET_SECTIONS: readonly CatalogueSection[];   // dev/catalogue/wallet/index.ts, empty here
  ```
- The nesting matches the app's (R58): `LanguageProvider > IntlProvider > ThemeProvider (ThemePreferenceOverride) > BunIntensityProvider > SafeAreaProvider (the catalogue's PHONE) > WalletRoot > SpendV1Provider > SpendDiaryProvider > AiCompanionProvider > element`. It installs a memory `StoreBackend` (`installStoreBackend`), spies `Dimensions.get` for `fontScale` and `AccessibilityInfo.isReduceMotionEnabled` for `reducedMotion` (the patterns of `src/ui/largeText.render.test.tsx` and `src/mascot/BunPeek.render.test.tsx`). Tests call `cleanup()` and `vi.restoreAllMocks()` after each case and drive failures with the fake's `fail`, `loseResponse` and `hold`.

- [ ] **Step 1: Write the failing test** `the harness nests the providers as the app does`: a probe reads `useDiaryView().accountId === TEST_ACCOUNT_ID`, `useAiCompanion().resources !== null`, `useSpendV1()` present, `useWalletReducedMotion() === false` once settled, and `await walletDeviceStore().get('private-mode')` returns the seeded `'1'`; a write shows in `stored`. And `reducedMotion: 'pending' reads as reduced until answerReducedMotion(false)`.
- [ ] **Step 2: Run it and see it fail.** Record the counts.
- [ ] **Step 3: Implement** the harness and the empty list, and spread it into the registry.
- [ ] **Step 4: Run it and the catalogue suite.**
- [ ] **Step 5: Mutation check.** Leave out `AiCompanionProvider`: the probe's AI assertion fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add the wallet test harness, nested as the app nests its providers"`

---

### Task P2-T9: Motion: the reduced-motion table, the motion builders and the grow bar

**Starts after:** P2-T2, P2-T8

**Files:**
- Create: `apps/app/src/wallet/motion/walletMotion.ts` (pure), `useWalletMotion.ts`, `GrowBar.tsx`
- Modify: `apps/app/src/theme/motion.ts` (`motion.haptic` gains `trayStep: "selection"`, `walletOpen: "selection"`, `walletAdded: "success"`; the comment above `spring` says the Bun diary screens drive these through `Animated.spring` and the Bun Wallet screens through Reanimated, never both in one screen)
- Test: `apps/app/src/wallet/motion/walletMotion.test.ts` (Node), `GrowBar.render.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export type WalletMoment = 'trayOpen' | 'trayStep' | 'save' | 'savedToast' | 'walletOpen' | 'hideAmounts' | 'budgetBar' | 'walletAdded' | 'recap' | 'page';
  export const WALLET_MOMENTS: readonly WalletMoment[];
  export type MotionSpec = | { kind: 'spring'; spring: 'snappy' | 'gentle' | 'bouncy' } | { kind: 'morph' } | { kind: 'fly' }
    | { kind: 'grow'; durationMs: number } | { kind: 'confetti' } | { kind: 'system' } | { kind: 'fade'; durationMs: 150 | 200 } | { kind: 'instant' };
  export type MotionPlan = { motion: MotionSpec; haptic: HapticMoment | null };
  export function motionFor(moment: WalletMoment, reducedMotion: boolean): MotionPlan;
  // useWalletMotion.ts: each builder ends .reduceMotion(ReduceMotion.Never); springs use motion.spring through .springify().damping(d).stiffness(s).mass(m)
  export const TRAY_EXIT_MS = 220;
  export function trayEntering(reduced: boolean)        // FadeIn.duration(150) | SlideInDown, gentle
  export function trayExiting(reduced: boolean)         // FadeOut.duration(150) | SlideOutDown.duration(TRAY_EXIT_MS)
  export function toastEntering(reduced: boolean)       // FadeIn.duration(150) | SlideInUp, snappy
  export function stepEntering()                         // FadeIn.duration(150)
  export function stepLayout(reduced: boolean)          // undefined | LinearTransition.springify(), gentle
  export function walletAddedEntering(reduced: boolean) // FadeIn.duration(150) | SlideInUp, bouncy
  export function GrowBar(props: { fraction: number; color: string; track: string; height?: number }): JSX.Element   // height 6
  ```
- The table (ax-motion; default / reduced / haptic in both): `trayOpen` spring gentle / fade 150 / none; `trayStep` morph / fade 150 / `trayStep`; `save` fly / fade 200 / none; `savedToast` spring snappy / fade 150 / none; `walletOpen` spring gentle / instant / `walletOpen`; `hideAmounts` fade 150 / instant / none; `budgetBar` grow 320 / instant / none; `walletAdded` spring bouncy / fade 150 / `walletAdded`; `recap` confetti / instant / `celebration`; `page` system / system / none.
- `GrowBar` is decorative (the words beside it carry the numbers), clamps to 0..1, and reads `useWalletReducedMotion()` at mount: when false it grows from 0 over 320 ms with `withTiming` (its `useAnimatedStyle` has a dependency array, R72); when true, including before the phone answers (R66), it is a plain `View` at its value.

- [ ] **Step 1: Write the failing tests.**
  ```ts
  test('the reduced-motion table is ax-motion, moment by moment', () => {
    assert.deepEqual(motionFor('trayOpen', true), { motion: { kind: 'fade', durationMs: 150 }, haptic: null });
    assert.deepEqual(motionFor('trayStep', true), { motion: { kind: 'fade', durationMs: 150 }, haptic: 'trayStep' });
    assert.deepEqual(motionFor('walletOpen', true), { motion: { kind: 'instant' }, haptic: 'walletOpen' });
    assert.deepEqual(motionFor('budgetBar', false), { motion: { kind: 'grow', durationMs: 320 }, haptic: null });
    assert.deepEqual(motionFor('recap', true), { motion: { kind: 'instant' }, haptic: 'celebration' });
  });
  test('with reduced motion nothing travels, springs or zooms, and haptics do not change', () => {
    for (const moment of WALLET_MOMENTS) {
      assert.ok(['fade', 'instant', 'system'].includes(motionFor(moment, true).motion.kind), moment);
      assert.equal(motionFor(moment, true).haptic, motionFor(moment, false).haptic, moment);
    }
  });
  test('a selection tick per tray step and on opening a wallet; success for a new wallet', () => {
    assert.deepEqual([motion.haptic.trayStep, motion.haptic.walletOpen, motion.haptic.walletAdded], ['selection', 'selection', 'success']);
  });
  ```
  `GrowBar.render.test.tsx`: `under reduced motion the bar is drawn at its value` (fraction 0.62: the fill's width is `62%`); `before the phone answers, the bar is drawn still at its value` (`reducedMotion: 'pending'`); `the fill never passes the track` (1.4 gives `100%`); `the bar is hidden from screen readers`.
- [ ] **Step 2: Run them and see them fail.** Record the counts.
- [ ] **Step 3: Implement** the table, the builders, `GrowBar` and the `motion.ts` change.
- [ ] **Step 4: Run them and see them pass,** then `src/lib/hapticPreference.test.ts` (it walks every moment).
- [ ] **Step 5: Mutation check.** Reduced `walletOpen` as a fade: the table test fails. Let `GrowBar` animate while the answer is pending: the pending test fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add Bun Wallet motion: the reduced-motion table, its Reanimated builders and the grow bar"`

---

### Task P2-T10: Money text, WalletAmount, the icon button and private mode

**Starts after:** P2-T1, P2-T3, P2-T8, 1D-T1

**Files:**
- Create: `apps/app/src/wallet/money/walletMoney.ts` (pure), `money/WalletAmount.tsx`, `apps/app/src/wallet/controls/IconButton.tsx`, `apps/app/src/wallet/privacy/PrivateModeProvider.tsx`, `privacy/PrivateEyeButton.tsx`, `privacy/PrivateTip.tsx`, `privacy/copy.ts`
- Modify: `apps/app/src/wallet/WalletRoot.tsx` (wraps `PrivateModeProvider`)
- Catalogue: `apps/app/src/dev/catalogue/wallet/kitSections.tsx` (`bw-amounts`, `bw-private`), spread into `index.ts`
- Test: `apps/app/src/wallet/money/walletMoney.test.ts` (Node), `money/WalletAmount.render.test.tsx`, `apps/app/src/wallet/privacy/PrivateMode.render.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export type MoneySign = 'none' | 'expense' | 'income' | 'balance';
  export function walletMoneyText(minor: Minor, options?: { sign?: MoneySign; exact?: boolean }): string;   // over formatMinor; U+2212 minus; 'balance' signs only a negative; zero never signed
  export function perDayText(perDayMinor: Minor): string;   // whole baht, rounded down
  export const HIDDEN_AMOUNT = '฿••••';
  export function spokenMoney(minor: Minor, t: WalletT): string;   // common.baht, or common.satang when satang are non-zero, inside common.minus when negative
  export function WalletAmount(props: { minor: Minor; sign?: MoneySign; exact?: boolean; size: 58 | 44 | 36 | 34 | 28 | 22 | 17 | 16 | 13;
    tone?: 'ink' | 'quiet' | 'violet' | 'under' | 'over'; color?: string; label?: string; testID?: string }): JSX.Element;
  export function IconButton(props: { label: string; onPress: () => void; children: ReactNode; disabled?: boolean }): JSX.Element;   // 44 × 44 round, 24 pt glyph
  export const PRIVATE_MODE_NAME = 'private-mode';  export const PRIVATE_TIP_NAME = 'private-tip-seen';   // device store
  export function PrivateModeProvider({ children }: { children: ReactNode }): JSX.Element;
  export function usePrivateMode(): { hidden: boolean; ready: boolean; toggle(): void; tipSeen: boolean; dismissTip(): void };   // outside a provider: shown, ready, no-ops
  export function PrivateEyeButton(): JSX.Element;
  export function PrivateTip(): JSX.Element;
  ```
- `WalletAmount`: `LATIN_UI_FONT_FAMILY` 700, letter spacing −0.02 em at 28 and above, `maxFontSizeMultiplier={amountMaxScale(size)}`, never `numberOfLines`; income defaults to `violet`; `color` overrides the tone (text on a material). Its label is `label` then the spoken amount; in private mode the text is `HIDDEN_AMOUNT` and the label is `label` then `common.amountHidden`.
- `toggle` is the rule (R61): it stores `'1'` or removes the name, announces `privacy.hiddenAnnounce` or `privacy.shownAnnounce` with `announcePolitely`, and calls `trackPrivateModeToggled()`, which carries no properties.
- Copy (`privacy/copy.ts`; bw-private's words): `privacy.hide` ซ่อนยอดเงิน, `privacy.show` แสดงยอดเงิน, `privacy.hiddenAnnounce` ซ่อนยอดเงินอยู่, `privacy.shownAnnounce` แสดงยอดเงินแล้ว, `privacy.tipTitle` โหมดส่วนตัว, `privacy.tipBody` ซ่อนยอดเงินทุกที่แล้ว แตะรูปตาอีกครั้งเมื่ออยากดู เหมาะตอนอยู่บนรถไฟฟ้า, `privacy.tipClose` ปิดคำแนะนำ. Default pending owner Q3: built as written; the English lines, and any Thai line marked draft, are drafts for E2-A.

- [ ] **Step 1: Write the failing tests.**
  - `walletMoney.test.ts`: `walletMoneyText('1248000')` is `฿12,480`; `'5025'` is `฿50.25`; `'5000'` exact is `฿50.00`; `'99999999999'` is `฿999,999,999.99`; expense `'5000'` is `−฿50`; income `'3500000'` is `+฿35,000`; balance `'-392000'` is `−฿3,920`; expense `'0'` is `฿0`; `perDayText('69099')` is `฿690` and `'99'` is `฿0`; with `t = tableT({ ...COMMON }, 'th')`, `spokenMoney('1248000', t)` is `12,480 บาท`, `'5025'` is `50 บาท 25 สตางค์`, `'-392000'` is `ติดลบ 3,920 บาท`, and in English `'1248000'` is `12,480 baht`.
  - `WalletAmount.render.test.tsx`: `income is violet with a plus, an expense in a list has no sign`; `private mode draws ฿•••• and says the amount is hidden, with no digit anywhere` (Review Focus 2: `device: { 'private-mode': '1' }`; `<WalletAmount minor="1248000" size={28} label="ใช้ไปเดือนนี้" />` has text `฿••••`, label `ใช้ไปเดือนนี้ ซ่อนยอดเงินอยู่`, and `container.textContent` has no `/\d/`); `an amount is never clamped to a line`.
  - `PrivateMode.render.test.tsx`: `the eye hides every amount and the choice survives a restart` (`stored.get('jotbun.wallet.private-mode') === '1'`; remounting with that seed stays hidden); `the eye says what it will do, at 44 pt`; `the tip shows the first time only`; `toggling sends one private_mode_toggled with no properties` (`recordAnalytics()`).
- [ ] **Step 2: Run them and see them fail.** Record the counts.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.** Draw the real amount under the mask: the no-digit test fails. Round the per-day hint to the nearest baht: the `69099` case fails. Send `{ on }` with the event: the analytics test fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add Bun Wallet money text and private mode, which hides every amount behind one eye"`

---

### Task P2-T11: Looks kept on the phone: wallet looks, Bun faces, materials, category icons and the wallet card

**Starts after:** P2-T1, P2-T3, P2-T7, P2-T8, P2-T10

**Files:**
- Create: `apps/app/src/wallet/looks/walletLooks.ts` (pure), `looks/WalletLooksProvider.tsx`, `looks/BunFace.tsx`, `looks/MaterialFill.tsx`, `looks/categoryGlyphs.ts` (pure), `looks/categoryIcons.ts` (pure), `looks/WalletCategoryIcon.tsx`, `apps/app/src/wallet/card/WalletCard.tsx`, `card/copy.ts`
- Create: `apps/app/src/ui/categoryDrawings.ts` (today's `DRAWINGS` moved out of `src/ui/categoryIcons.tsx` unchanged and exported as `CATEGORY_DRAWINGS`, with its shape type as `DrawingShape`); Modify: `apps/app/src/ui/categoryIcons.tsx` (imports it; no behaviour change)
- Modify: `apps/app/src/wallet/testing/walletHarness.tsx` (`WalletLooksProvider` innermost, as `WalletShell` mounts it in P2-T18)
- Catalogue: `kitSections.tsx` gains `bw-materials`, `bw-card` (cash, bank with today's spending, credit card, a pending total, private) and `bw-category-icons`
- Test: `apps/app/src/wallet/looks/walletLooks.test.ts`, `looks/categoryIcons.test.ts` (Node), `apps/app/src/wallet/card/WalletCard.render.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export type WalletKind = 'cash' | 'bank' | 'credit_card' | 'transit';   // §5.2's four (W25), wc-wallet-type's order without e-wallet
  export const WALLET_KINDS: readonly WalletKind[];
  export type BunFaceName = 'smile' | 'wink' | 'calm' | 'happy' | 'wow';  // ยิ้ม, ขยิบตา, สบาย ๆ, ดีใจ, ว้าว (wc-wallet-edit)
  export const BUN_FACES: readonly BunFaceName[];
  export type WalletLook = { kind: WalletKind | null; material: WalletMaterial; face: BunFaceName };
  export function derivedLook(walletId: string): WalletLook;   // h = 32-bit FNV-1a of the id's UTF-16 code units; WALLET_MATERIALS[h % 5], BUN_FACES[(h >>> 8) % 5], kind null
  export function parseLooks(raw: string | null): Readonly<Record<string, WalletLook>>;   // bad entries dropped, never thrown
  export function WalletLooksProvider({ children }: { children: ReactNode }): JSX.Element;   // reads useDiaryView().accountId
  export function useWalletLooks(): { lookOf(walletId: string): WalletLook; setLook(walletId: string, look: WalletLook): Promise<void>; order: readonly string[]; setOrder(ids: readonly string[]): Promise<void> };
  export function BunFace(props: { face: BunFaceName; size: number }): JSX.Element;            // cream #FFF6E6 with ink features, decorative
  export function MaterialFill(props: { material: WalletMaterial; radius: number }): JSX.Element;   // absolute react-native-svg rect, 135° LinearGradient from materialPaint, plus the dark titanium edge (W5)
  export type GlyphKey = BuiltinCategoryKey | 'transfer' | 'coffee' | 'car' | 'bag' | 'home' | 'receipt' | 'heart' | 'lotus' | 'gift' | 'phone' | 'paw' | 'book';
  export const CATEGORY_PICKER_GLYPHS: readonly GlyphKey[];   // food, coffee, car, bag, home, receipt, heart, lotus, gift, phone, paw, book: อาหาร, กาแฟ, รถ, ถุงช้อปปิ้ง, บ้าน, ใบเสร็จ, หัวใจ, ดอกบัว, ของขวัญ, มือถือ, รอยเท้าสัตว์, หนังสือ
  export function glyphShapes(key: GlyphKey): readonly DrawingShape[];
  export const PACK_GLYPH: Readonly<Record<PackKey, GlyphKey>>;   // family_out heart, merit lotus, delivery food, motorbike_rail car, topup phone, seven bag, lottery receipt, pets paw, family_in heart
  export function parseIcons(raw: string | null): Readonly<Record<string, GlyphKey>>;
  export function iconFor(category: Pick<CategoryDto, 'id' | 'type' | 'label' | 'builtin_key'>, kept: Readonly<Record<string, GlyphKey>>): GlyphKey | null;   // kept, else PACK_GLYPH[packKeyOf], else the built-in key, else null (the initial)
  export function useCategoryIcons(): { iconOf(category: Pick<CategoryDto, 'id' | 'type' | 'label' | 'builtin_key'>): GlyphKey | null; setIcon(categoryId: string, icon: GlyphKey): Promise<void> };
  export function WalletCategoryIcon(props: { category: Pick<CategoryDto, 'id' | 'builtin_key' | 'color' | 'label' | 'type'>; name: string; size?: number }): JSX.Element;   // 36, radius 11, tileTint(color) or raised; decorative
  export type WalletCardModel = { id: string; name: string; balanceMinor: Minor; todayOutMinor?: Minor | null; pendingMinor?: Minor | null };
  export function walletCardWords(wallet: WalletCardModel, look: WalletLook, hidden: boolean, t: WalletT): { amountMinor: Minor; amountPrefix: string | null; kindLine: string | null; pendingLine: string | null; spoken: string };
  export function WalletCard(props: { wallet: WalletCardModel; look: WalletLook; variant: 'stack' | 'full' | 'spine'; onPress?: () => void }): JSX.Element;
  ```
- Kept data (R64): the account store's names `looks`, `wallet-order` and `category-icons` for the open diary's account. With no account (no diary, the web) every look is derived and the setters store nothing.
- Glyph data: the built-in keys use `CATEGORY_DRAWINGS`; the twelve picker glyphs copy their shapes unchanged from the 24-unit SVGs in `docs/design/bun-wallet/wc-category-edit.dc.html` (a `line` or `polyline` becomes a `d` path), drawn as 2 pt round strokes. (`phosphor-react-native` is installed, but its 256-unit icons are not the board's, so the board's own shapes are used.)
- The card (bw-home, bw-wallet, rh-offline, ax-large-home): `stack` and `full` are 200 pt with the material, the face and name top left and the amount top right; `full` adds the kind line (`card.kindCash` ในกระเป๋าสตางค์, `card.kindBank` บัญชีธนาคาร, `card.kindCard` ยอดที่ใช้ไป, `card.kindTransit` BTS / MRT); every variant shows `card.pending` (รวม {amount} ที่กำลังบันทึก) when `pendingMinor` is non-zero; the front stack card shows `card.todayOut` (วันนี้ {amount}) when `todayOutMinor` is non-zero; `spine` (the largest text sizes) is a row with a 12 pt material spine, name and amount stacked, no face. A credit card with a negative balance shows its spending after `card.spent` (ใช้ไป). Text colours come from `materialPaint`. With `onPress` the card is one button labelled `spoken`: `บัตรเครดิต, ใช้ไป 3,920 บาท`; `บัตรเดินทาง, เหลือ 186 บาท`; `บัญชีหลัก, เหลือ 24,810 บาท, รวม 50 บาทที่กำลังบันทึก, วันนี้ใช้ 97 บาท`; in private mode `บัญชีหลัก, ซ่อนยอดเงินอยู่`. The `card.*` lines live in `card/copy.ts`. Default pending owner Q3: built as written; the English lines, and any Thai line marked draft, are drafts for E2-A.

- [ ] **Step 1: Write the failing tests.**
  - `walletLooks.test.ts`: `a derived look is stable and always valid` (same id, same look; 1,000 random UUIDs give valid materials and faces and `kind: null`); `damaged kept looks are dropped, not thrown` (`'{"a":{"kind":"boat","material":"silk","face":"smile"},"b":{"kind":null,"material":"paper","face":"wow"}}'` keeps only `b`; `'nope'` gives `{}`).
  - `categoryIcons.test.ts`: `a kept icon wins, then the pack glyph, then the built-in drawing, else the initial` (custom `ทำบุญ` gives `lotus`; built-in `food` gives `food`; `Art` gives `null`); `damaged kept icons are dropped`; `every picker glyph has shapes copied from the board` (twelve non-empty lists).
  - `WalletCard.render.test.tsx` (both modes and languages): `a credit card shows what was spent, others show what is left`; `each card says itself as ax-voiceover and rh-offline write it` (the four labels above); `the pending line shows on stack cards too`; `titanium carries white text, silk ink; dark titanium has a 1 pt edge of #5C5968`; `at AX5 a ฿999,999,999.99 balance and an 80-code-point Thai name wrap and never truncate` (Review Focus 3, variant `spine`); `a card is at least 44 pt tall in every variant`; `looks come from the open diary's account, and a look kept for another wallet is ignored`; `with no diary open the derived look shows and setLook stores nothing`.
- [ ] **Step 2: Run them and see them fail.** Record the counts.
- [ ] **Step 3: Implement,** drawing the faces and materials from bw-adding, wc-wallet-edit and bw-home.
- [ ] **Step 4: Run them and see them pass,** with `src/ui/categoryIcons` users' suites unchanged (`npm run test:render -w gogospend-app -- src/dev/catalogue/CatalogueScreen.render.test.tsx`).
- [ ] **Step 5: Mutation check.** Show a credit card's balance instead of its spending: the first card test fails. `numberOfLines={1}` on the name: the AX5 test fails. Hide the pending line on stack cards: its test fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add looks kept per account: wallet looks, Bun faces, the five materials, category icons and the wallet card"`

---

### Task P2-T12: The card stack and card frames

**Starts after:** P2-T9, P2-T11

**Files:**
- Create: `apps/app/src/wallet/card/CardStack.tsx`, `card/cardFrames.tsx`
- Catalogue: `kitSections.tsx` gains `bw-stack` and `bw-stack-large`
- Test: `apps/app/src/wallet/card/CardStack.render.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export type StackWallet = WalletCardModel & { look: WalletLook };
  export const STACK_PEEK = 54;  export const CARD_HEIGHT = 200;
  export function CardStack(props: { wallets: readonly StackWallet[]; onOpen: (walletId: string) => void }): JSX.Element;
  export function CardFramesProvider({ children }: { children: ReactNode }): JSX.Element;
  export function useRegisterCardFrame(walletId: string): (view: View | null) => void;
  export function useCardFrames(): { frameOf(walletId: string): { x: number; y: number; width: number; height: number } | null };   // measureInWindow after layout
  ```
- The stack (bw-home): cards in the given order, each `STACK_PEEK` below the one before, the last (the front card) whole, height `STACK_PEEK * (n − 1) + CARD_HEIGHT`. Pressing a card plays `walletOpen` (`playHaptic` from `src/lib/hapticMoment.ts`), lifts it 12 pt with the `gentle` spring (none under reduced motion; `useAnimatedStyle` with a dependency array, R72) and calls `onOpen` at once. At the largest text sizes (`useLargeText()`) it is a one-column list of `spine` cards, front card first. Screen readers meet the cards in the drawn order.

- [ ] **Step 1: Write the failing tests** (both modes): `the stack is 54 pt per card plus one whole card` (four wallets: 362 pt); `pressing a card plays the walletOpen tick and opens that wallet at once` (`vi.spyOn(haptics, 'selection')`; `onOpen` in the same act); `under reduced motion the card opens with no lift`; `at AX5 the stack is a list with the front card first, and nothing truncates`; `screen readers meet the cards in the drawn order, each a button with its card's words`.
- [ ] **Step 2: Run it and see it fail.** Record the counts.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run it and see it pass.**
- [ ] **Step 5: Mutation check.** List the large-text cards front card last: the AX5 test fails. Call `onOpen` from the spring's end: the "at once" test fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add the wallet card stack, a list at the largest text sizes"`

---

### Task P2-T13: The tray, the main button, the text link and the lock cover

**Starts after:** P2-T1, P2-T8, P2-T9, P2-T10

**Files:**
- Create: `apps/app/src/wallet/tray/Tray.tsx`, `tray/trayGesture.ts` (pure), `tray/PrimaryButton.tsx`, `tray/TextLink.tsx`, `tray/copy.ts` (default pending owner Q3: its lines are built as written; the English lines, and any Thai line marked draft, are drafts for E2-A), `apps/app/src/ui/lockCover.tsx`
- Catalogue: `kitSections.tsx` gains `bw-tray-short`, `bw-tray-tall`, `bw-tray-large` and `bw-buttons`
- Test: `apps/app/src/wallet/tray/trayGesture.test.ts` (Node), `tray/Tray.render.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  // src/ui/lockCover.tsx
  export type LockCover = { hidden: boolean };
  export const LockCoverContext: React.Context<LockCover>;   // default { hidden: false }; LockGate provides it (P2-T33)
  export function useLockCover(): LockCover;
  export function LockCoverArt(): JSX.Element;               // testID 'lock-cover': fills its parent with the wallet ground colour, no text, hidden from screen readers
  // tray/trayGesture.ts
  export const TRAY_INSET = 8;  export const TRAY_RADIUS = 34;
  export function shouldDismiss(translationY: number, velocityY: number): boolean;   // translationY > 120 || (translationY > 60 && velocityY > 900)
  // tray/Tray.tsx, PrimaryButton.tsx, TextLink.tsx
  export type TrayProps = { visible: boolean; onClose: () => void; onClosed?: () => void; title: string; header?: ReactNode; onBack?: () => void;
    step?: string; footer?: ReactNode; locked?: boolean; children: ReactNode; testID?: string };
  export function Tray(props: TrayProps): JSX.Element;
  export function PrimaryButton(props: { label: string; onPress: () => void; busy?: boolean; busyLabel?: string; disabled?: boolean; testID?: string }): JSX.Element;   // 54 pt, radius 16, primary with onPrimary text
  export function TextLink(props: { label: string; onPress: () => void; tone?: 'violet' | 'ink' }): JSX.Element;   // at least 44 pt tall
  ```
- The tray: a transparent React Native `Modal` (`animationType="none"`, `statusBarTranslucent`) whose content sits in `GestureHandlerRootView` (Gesture Handler's rule for modals on Android), with a dimmed backdrop. The card sits `TRAY_INSET` from the left, right and bottom (plus the bottom safe area), radius `TRAY_RADIUS`, on `sheet`; at the largest text sizes it is full height under the top safe area. The header row has back (`common.back`) when `onBack` is given, then `header` or the title, then close (`common.close`); the title is the dialog's name and takes focus in `onShow`. A `step` change plays `trayStep` and uses `stepLayout` and `stepEntering`.
- One `requestClose()` serves close, the backdrop, `onAccessibilityEscape`, Android's `onRequestClose` and the swipe; it does nothing while `locked` (close is then disabled).
- How the device cases are handled (R69):
  - **Exit animation:** when `visible` turns false the Modal stays shown while the card unmounts and `trayExiting` plays; the Modal hides after `TRAY_EXIT_MS` (150 ms under reduced motion), then `onClosed()` fires once.
  - **One tray after another:** a host that opens a second tray when one closes opens it from the first tray's `onClosed`, never in the same render, because iOS does not present a Modal while another is still dismissing.
  - **A Sheet inside a tray:** Tell Bun's `Sheet`, or any `Sheet`, opened from a tray renders inside the tray's content, so iOS presents it from the tray's window; never as a sibling Modal.
  - **The keyboard:** the card sits in a `KeyboardAvoidingView` with `behavior={Platform.OS === 'ios' ? 'padding' : undefined}`, as `EntryPage` in `src/screens/redesign/ActionFooter.tsx` does, and `footer` stays pinned under the scrolling content, as `ActionFooter` does.
  - **The swipe:** `usePanGesture({ activeOffsetY: 10, failOffsetX: [-20, 20], runOnJS: true, onUpdate, onDeactivate })` on the header row, because its callbacks set React state (Gesture Handler 3 runs hook callbacks on the UI thread unless `runOnJS` is true). The card follows the finger downward only, closes when `shouldDismiss` is true and springs back otherwise.
- **The lock (R63):** while `useLockCover().hidden` is true the tray renders `<LockCoverArt />` in place of its backdrop and card. Its children unmount; every step is controlled by its host, so no draft is lost.

- [ ] **Step 1: Write the failing tests.**
  ```ts
  test('a pull of 120 pt, or a quick flick past 60 pt, closes the tray; a pull up never does', () => {
    assert.equal(shouldDismiss(119, 0), false);
    assert.equal(shouldDismiss(121, 0), true);
    assert.equal(shouldDismiss(61, 901), true);
    assert.equal(shouldDismiss(61, 899), false);
    assert.equal(shouldDismiss(-300, 2000), false);
  });
  test('the swipe runs on the JS runtime', () => {
    assert.match(readFileSync(new URL('./Tray.tsx', import.meta.url), 'utf8'), /runOnJS: true/);
  });
  ```
  `Tray.render.test.tsx` (both modes): `the tray is a named dialog, 8 pt from the edges, radius 34`; `close and the backdrop close it, and the title takes focus when it opens`; `while locked nothing closes it, and close says it is unavailable` (Review Focus 1); `at AX5 it opens full height`; `under reduced motion a new step shows at once`; `the card leaves before the Modal hides, then onClosed fires once` (`vi.useFakeTimers()`: after `visible={false}` the dialog is still mounted; after 220 ms it is gone and `onClosed` was called once); `a hidden lock cover replaces the tray's content` (inside `LockCoverContext.Provider value={{ hidden: true }}`: `lock-cover` is present and the title is not); `the main button is 54 pt tall, radius 16, ink with white text in light and light with ink text in dark; busy says its busy label`; `every control in the header is at least 44 pt`.
- [ ] **Step 2: Run them and see them fail.** Record the counts.
- [ ] **Step 3: Implement** on `Modal`, Reanimated and Gesture Handler.
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.** Let the backdrop close a locked tray: the locked test fails. Hide the Modal at once on close: the exit test fails. Ignore the lock cover: its test fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add the Bun Wallet tray: inset 8 pt, radius 34, swipe to close, hidden under the lock"`

**Checkpoint E2-A** (controller): the kit sections from P2-T10 to P2-T13.

---

### Task P2-T14: The add flow, the keypad and the amount step

**Starts after:** P2-T5, P2-T10, P2-T11, P2-T13

**Files:**
- Create: `apps/app/src/wallet/add/addFlow.ts` (pure), `add/WalletKeypad.tsx`, `add/TypeSwitchHeader.tsx`, `add/QuickChips.tsx`, `add/AmountStep.tsx`, `add/copy.ts`
- Catalogue: `apps/app/src/dev/catalogue/wallet/addSections.tsx` (`bw-tray-amount`, `bw-tray-income`; the steps inside a `Tray` on fixed props)
- Test: `apps/app/src/wallet/add/addFlow.test.ts` (Node), `add/AmountStep.render.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export type AddType = 'expense' | 'income' | 'transfer';
  export type AddStep = 'amount' | 'confirm' | 'category' | 'wallet' | 'from' | 'to' | 'date' | 'note';
  export function trayTitleKey(type: AddType): 'add.titleExpense' | 'add.titleIncome' | 'add.titleTransfer';
  export type ConfirmRow = { key: 'category' | 'wallet' | 'from' | 'to' | 'date' | 'note'; labelKey: string; value: string; guessed: boolean };
  export function confirmRows(draft: QuickAddDraft, context: { lookups: Lookups; today: string; dateLocale: DateLocale; guessed: ReadonlySet<string>; t: WalletT }): ConfirmRow[];   // expense, income: category, wallet, date, note; transfer: from, to, date, note
  export function moveAllMinor(balances: ReadonlyMap<string, Minor> | null, walletId: string | null): Minor | null;   // the available balance when known and above zero
  export function balancesAfter(balances: ReadonlyMap<string, Minor> | null, fromId: string | null, toId: string | null, amountMinor: Minor): { from: Minor | null; to: Minor | null };   // BigInt
  export type StepProps = { draft: QuickAddDraft; keypad: KeypadState; onDraft(next: QuickAddDraft): void; onKeypad(next: KeypadState): void; onStep(step: AddStep): void };   // every step is controlled, so P2-T27's edit tray reuses them
  export function WalletKeypad(props: { keypad: KeypadState; onKeypad(next: KeypadState): void; disabled?: boolean }): JSX.Element;   // digits, 000, 0, delete (W29), through applyKey
  export function TypeSwitchHeader(props: { type: AddType; onType(type: AddType): void }): JSX.Element;
  export function QuickChips(props: { chips: readonly { label: string; amountMinor: Minor; apply(): void }[] }): JSX.Element;   // at most three
  export function AmountStep(props: StepProps & { type: AddType; lookups: Lookups; chips: readonly { label: string; amountMinor: Minor; apply(): void }[]; canTellBun: boolean; onTellBun(): void; problem: string | null }): JSX.Element;
  ```
- Data bindings (bw-tray-amount, rh-income): the amount at size 58 from `keypadDisplay(keypad)`; the wallet chip (`add.fromWallet` for an expense, `add.intoWallet` for income) opens the wallet step; the บอกบัน row only when `canTellBun` (the `companion` area on and `useAiCompanion().enabled`); income adds the merchant field (`add.merchantLabel`) and `add.notInBudget`; the footer's `PrimaryButton` `common.next` is enabled when `evaluateKeypad(keypad).ok`, otherwise `problem` (today's keypad words through `tc`) shows above it. Largest text (ax-large-tray): the amount stays above the scrolling middle, chips become full-width rows of at least 64 pt, keys are 56 pt on `raised`. Deviation: no photo row (W15).
- Copy (`add/copy.ts`): `add.titleExpense` จดรายจ่าย, `add.titleIncome` จดรายรับ, `add.titleTransfer` โอนเงิน, `add.typeExpense` รายจ่าย, `add.typeIncome` รายรับ, `add.typeTransfer` โอน, `add.fromWallet` จาก{wallet}, `add.intoWallet` เข้า{wallet}, `add.tellBun` บอกบัน, `add.merchantLabel` ชื่อรายการ, `add.notInBudget` ไม่นับในงบ, `add.chip` {label} {amount}, `add.deleteKey` ลบตัวเลข (draft). Default pending owner Q3: built as written; the English lines, and any Thai line marked draft, are drafts for E2-B.

- [ ] **Step 1: Write the failing tests.**
  - `addFlow.test.ts`: `an expense confirms category, wallet, date and note; a transfer confirms from, to, date and note`; `fields Bun filled are marked guessed until the person changes them`; `move all offers the available balance only when it is known and above zero` (`null` balances, `'0'` and `'-500'` give `null`); `balances after a transfer move the exact amount` (`'2486000'` and `'124000'` with `'50000'` give `'2436000'` and `'174000'`, rh-transfer's numbers).
  - `AmountStep.render.test.tsx` (both modes and languages): `typing 5 and 0 shows ฿50 and enables Next`; `the keypad's problem shows above Next in today's words`; `income asks เข้า{wallet} and ชื่อรายการ, and says it is not counted in the budget`; `บอกบัน shows only when Bun is on in the companion area`; `at AX5 the chips are full-width rows and ฿999,999,999.99 never truncates` (Review Focus 3); `every key, chip and segment is at least 44 pt`.
- [ ] **Step 2: Run them and see them fail.** Record the counts.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.** Offer move all at a zero balance: its test fails. Enable Next on an empty keypad: the first render test fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add the Bun Wallet add flow, its keypad and the amount step"`

---

### Task P2-T15: The transfer, confirm and pick steps

**Starts after:** P2-T14

**Files:**
- Create: `apps/app/src/wallet/add/TransferStep.tsx`, `add/ConfirmStep.tsx`, `add/PickSteps.tsx`; extend `add/copy.ts`
- Catalogue: `addSections.tsx` gains `bw-tray-transfer`, `bw-tray-confirm`, `bw-tray-confirm-bun`, `bw-tray-pick-category`
- Test: `apps/app/src/wallet/add/AddSteps.render.test.tsx`

**Interfaces:**
- Consumes: `rank` and `Ranking` (P2-T5); `WalletCategoryIcon` (P2-T11); `stepDay`, `canStepForward` (`src/ui/dateStep.ts`).
- Produces:
  ```ts
  export function TransferStep(props: StepProps & { wallets: readonly WalletSnapshot[]; balances: ReadonlyMap<string, Minor> | null }): JSX.Element;
  export function ConfirmStep(props: StepProps & { rows: readonly ConfirmRow[]; title: string; bunSentence: string | null; type: AddType }): JSX.Element;
  export function CategoryPick(props: StepProps & { categories: readonly CategoryDto[]; ranking: Ranking }): JSX.Element;
  export function WalletPick(props: StepProps & { wallets: readonly WalletSnapshot[]; balances: ReadonlyMap<string, Minor> | null; role: 'wallet' | 'from' | 'to' }): JSX.Element;
  export function DatePick(props: StepProps & { today: string; earliest?: string }): JSX.Element;
  export function NotePick(props: StepProps): JSX.Element;
  ```
- Data bindings (rh-transfer, bw-tray-confirm): the from and to cards (84 pt) each show the wallet's available balance and `add.after` from `balancesAfter`; a swap `IconButton` (`add.swap`); `add.moveAll` from `moveAllMinor`, hidden when null (no balances offline); `add.transferNote`. Confirm: back to the amount; the title is the merchant, else the note, else the category's name; `add.bunReadFrom` when Tell Bun filled it; the amount at 44; one 44 pt row per `ConfirmRow`, opening its pick step, with `add.bunGuess` on a guessed row. A pick returns to confirm with the choice; the date never passes today or goes before `earliest`. The confirm footer's button is the host's (P2-T16).
- Copy: `add.after` หลังโอน {amount}, `add.swap` สลับกระเป๋าเงิน, `add.moveAll` ย้ายทั้งหมด {amount}, `add.transferNote` โอนระหว่างกระเป๋าของคุณเอง ไม่นับเป็นรายจ่าย, `add.bunReadFrom` บันอ่านจาก “{sentence}”, `add.bunGuess` บันเดา, `add.rowCategory` หมวด, `add.rowWallet` กระเป๋า, `add.rowFrom` จาก, `add.rowTo` ไป, `add.rowDate` วันที่, `add.rowNote` โน้ต, `add.today` วันนี้. Default pending owner Q3: built as written; the English lines, and any Thai line marked draft, are drafts for E2-B.

- [ ] **Step 1: Write the failing tests** (both modes and languages; a probe holds the draft and switches steps as `onStep` asks): `confirm shows ฿50, the category, the wallet and วันนี้, each row 44 pt`; `a guessed row says บันเดา`; `a transfer shows each wallet's balance after the move, swaps, and fills move all; offline there is no move all`; `a pick returns to confirm with the choice`; `the date cannot pass today or go before the wallet's start`.
- [ ] **Step 2: Run it and see it fail.** Record the counts.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run it and see it pass.**
- [ ] **Step 5: Mutation check.** Let the date step pass today: its test fails. Swap without swapping the balances: the transfer test fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add the transfer, confirm and pick steps of the Bun Wallet tray"`

---

### Task P2-T16: The add tray host: open, Tell Bun, save

**Starts after:** P2-T5, P2-T7, P2-T15, 1D-T1

**Files:**
- Create: `apps/app/src/wallet/add/AddTrayHost.tsx`; extend `add/copy.ts`
- Catalogue: `addSections.tsx` gains `bw-tray-saving`, `bw-tray-unconfirmed`, `bw-tray-add-large`
- Test: `apps/app/src/wallet/add/AddTray.render.test.tsx`

**Interfaces:**
- Consumes: `useEntryReferences`, `useEntrySave`, `SavedEntry`, `EntryTrack` and the entry helpers (P2-T5); `analyticsCategoryKey` (P2-T7); the steps (P2-T14, P2-T15); `TellBunSheet`, `applyDraft`, `oftenLogged` (today's); `trackRecordStarted` (1D-T1).
- Produces:
  ```ts
  export type AddRequest = { type?: AddType; walletId?: string; copyOf?: string };
  export type SavedContext = { lookups: Lookups; offline: boolean };
  export function AddTrayHost(props: { children: ReactNode; onSaved?: (saved: SavedEntry, context: SavedContext) => void; blocked?: boolean }): JSX.Element;
  export function useAddTray(): { open(request?: AddRequest): void; close(): void; isOpen: boolean; blocked: boolean; whenClosed(run: () => void): void };
  ```
- `whenClosed(run)` runs `run` once after the tray's Modal has hidden (its `onClosed`), or at once when no tray is open, so a second tray never opens while the first is dismissing (R69).
- `open` is the rule that starts an entry: one `Tray` (header `TypeSwitchHeader`, title from `trayTitleKey`), the draft from `firstDraft` with the request's type and wallet (`copyOf` copies as Quick add does), `openedAt = Date.now()`, and one `trackRecordStarted({ kind: type, source: 'typed' })` (1D-T7 gives the start to this rule). While `blocked` (C5) it does nothing. Outside a host it pushes `/spend/add` (today's Quick add).
- Steps: amount, then confirm (a transfer goes amount, transfer, confirm); rows open picks; picks return to confirm.
- Tell Bun: the บอกบัน row opens today's `TellBunSheet` unchanged, rendered inside the tray's content (R69). Its `onUse` fills the draft through `applyDraft` and marks the filled fields as guessed.
- Save calls `useEntrySave({ today, onSaved, savedHaptic: 'success' }).save({ draft, keypad, wallets, track: { source: guessed.size > 0 ? 'tell_bun' : 'typed', categoryKey: analyticsCategoryKey(category), openedAt } })`. The tray sends no `record_saved` (R61: 1D-T7's call in `finish` reads `track`). While `status` is `saving` the tray is `locked`. On `saved`: `onSaved(saved, { lookups, offline: saved.via === 'device' && diaryView.outcome?.status !== 'synced' })`, then close. `unconfirmed` and `conflict` show today's message with Try again or Done, as Quick add does, and the tray can be closed.
- Copy: `add.saving` กำลังบันทึก…. Default pending owner Q3: built as written; the English lines, and any Thai line marked draft, are drafts for E2-B.

- [ ] **Step 1: Write the failing tests** (fake resources and a fake diary; both modes and languages):
  - `open() shows the amount tray named จดรายจ่าย and sends one record_started` (`recordAnalytics()`);
  - `saving with a ready diary keeps the entry on the phone, closes the tray and hands on the track` (`saveDraft` once; `onSaved` once with `via: 'device'` and `track` `{ source: 'typed', categoryKey: 'food' }` plus a number `openedAt`);
  - `a tray that is saving cannot be closed by close, the backdrop or escape, and the result still lands` (Review Focus 1: no diary, `const release = fake.hold('createTransaction')`; close and the backdrop leave it open; `release()` calls `onSaved` and closes it);
  - `an unconfirmed online save keeps today's Try again, which resends the same command key`;
  - `a draft from Tell Bun marks its fields guessed and saves with source tell_bun` (companion on; drive the sheet's `onUse` prop);
  - `Tell Bun's sheet opens inside the tray` (the sheet's dialog is a descendant of the tray's dialog);
  - `while blocked, open does nothing`; `at AX5 the tray is full height`.
- [ ] **Step 2: Run them and see them fail.** Record the counts.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass,** with Quick add's suite (it shares the hooks).
- [ ] **Step 5: Mutation check.** Drop `locked` while saving: the Review Focus 1 test fails. Send `source: 'typed'` after a Bun draft: its test fails. Render the sheet beside the tray: the inside test fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add the Bun Wallet add tray host for spending, income and moving money, on Quick add's save rules"`

---

### Task P2-T17: The saved moment: the toast, Undo and the drop into the card

**Starts after:** P2-T12, P2-T16, 1D-T1

**Files:**
- Create: `apps/app/src/wallet/saved/savedMoment.ts` (pure), `saved/SavedToastHost.tsx`, `saved/SaveFlight.tsx`, `saved/copy.ts`
- Catalogue: `apps/app/src/dev/catalogue/wallet/savedSections.tsx` (`bw-saved-toast`, `bw-saved-offline`, `bw-saved-private`, `bw-saved-undone`)
- Test: `apps/app/src/wallet/saved/savedMoment.test.ts` (Node), `saved/SavedMoment.render.test.tsx`

**Interfaces:**
- Consumes: `SavedEntry` (P2-T5); `SavedContext` (P2-T16); `useCardFrames` (P2-T12); `motionFor`, `toastEntering` (P2-T9); `walletMoneyText`, `HIDDEN_AMOUNT`, `usePrivateMode` (P2-T10); `canUndoDraft`, `openDrafts` (`src/spend/v1/redesign/shared.ts`); `trackUndoUsed` (1D-T1).
- Produces:
  ```ts
  export type SavedNotice = { recordId: string; commandId: string; kind: AddType; title: string; walletId: string | null; via: 'device' | 'online'; amountMinor: Minor; offline: boolean };
  export function noticeOf(saved: SavedEntry, lookups: Lookups, offline: boolean): SavedNotice;   // a transfer's walletId is its destination
  export type UndoPlan = { kind: 'remove_draft'; commandId: string } | { kind: 'delete_record'; recordId: string; version: 1 } | { kind: 'none' };
  export function undoPlan(notice: SavedNotice, outbox: readonly OutboxCommand[]): UndoPlan;
  export function todayOutMinor(input: { summaryExpenseMinor: Minor; confirmedIds: ReadonlySet<string>; outbox: readonly OutboxCommand[]; today: string }): Minor;   // the confirmed total plus open expense drafts dated today whose id is not confirmed
  export function toastWords(notice: SavedNotice, todayOut: Minor | null, hidden: boolean, t: WalletT): { text: string; spoken: string };
  export function SavedToastHost(props: { children: ReactNode }): JSX.Element;
  export function useSavedToast(): { show(notice: SavedNotice): void };
  export function SaveFlight(props: { notice: SavedNotice | null }): JSX.Element | null;
  ```
- `undoPlan`: a draft still on the phone that `canUndoDraft` allows is removed; a draft being sent or checked offers no Undo; a record the server holds (an online save, or a draft no longer in the outbox) is deleted at version 1, so it waits 30 days in Recently deleted.
- The toast (bw-saved, W31): `saved.toast` with today's money out; offline, `saved.toastOffline` (rh-offline) with no read. After `show`, the host reads `resources.history({ from: today, through: today, type: 'expense', sort: 'date_desc' }, undefined, HISTORY_MAX_LIMIT)` and computes `todayOutMinor` from its `summary.expense_minor` and item ids; the toast appears when the read lands or after 600 ms, whichever comes first, as `saved.toastPlain` while the total is unknown. In private mode the amount is `HIDDEN_AMOUNT` and the spoken form says `common.amountHidden`. The check is neutral (an `onToast` circle with a `toast`-coloured tick, never `under`); Undo is a `TextLink` in `toastLink` unless the plan is `none`; it enters with `toastEntering`, is announced politely, and leaves after `motion.duration.toastLong`.
- Undo is the rule (R61): `diary.removeDraft(commandId)`, or `deleteTransaction(recordId, 1, key)` under its own `useCommandKeys` key; then `saved.undone` or `saved.undoneDeleted`, and one `trackUndoUsed({ kind })`. A delete refused with `VERSION_CONFLICT` shows `saved.undoConflict` and changes nothing.
- `SaveFlight`: when `motionFor('save', reduced)` is `fly` and `frameOf(walletId)` is known, a chip with the title and the amount (`HIDDEN_AMOUNT` in private mode, R65) travels from the bottom centre to the card on the `gentle` spring, shrinking and fading; otherwise nothing travels.
- Copy: `saved.toast` บันทึกแล้ว · วันนี้ {amount}, `saved.toastPlain` บันทึกแล้ว, `saved.toastOffline` เก็บไว้ในเครื่องแล้ว · จะบันทึกเมื่อออนไลน์, `saved.undone` เลิกทำแล้ว, `saved.undoneDeleted` เลิกทำแล้ว กู้คืนได้ในรายการที่เพิ่งลบ, `saved.undoConflict` ลบไม่ได้ รายการนี้ถูกแก้ในอีกเครื่อง. Default pending owner Q3: built as written; the English lines, and any Thai line marked draft, are drafts for E2-B.

- [ ] **Step 1: Write the failing tests.**
  - `savedMoment.test.ts`: `a draft never sent is removed by Undo`; `a draft being sent or checked offers no Undo`; `a record the server holds is deleted at version 1` (Review Focus 4: an online save, and a device save whose command left the outbox); `today's money out adds waiting drafts once` (a summary of `'13200'`, a waiting `'5000'` expense draft dated today and a draft whose id is confirmed give `'18200'`); `the toast follows bw-saved, and hides the amount in private mode` (`บันทึกแล้ว · วันนี้ ฿182` for `'18200'`; `บันทึกแล้ว · วันนี้ ฿••••` spoken with `ซ่อนยอดเงินอยู่`; offline, `เก็บไว้ในเครื่องแล้ว · จะบันทึกเมื่อออนไลน์`).
  - `SavedMoment.render.test.tsx`: `after a save the toast shows today's total and Undo, and its check is neutral`; `a slow total read leaves the toast saying บันทึกแล้ว after 600 ms` (`fake.hold('history')`, fake timers); `Undo removes a draft still on the phone, says เลิกทำแล้ว and sends one undo_used`; `Undo after the draft has left the phone deletes the record, which stays restorable` (Review Focus 4); `Undo refused by a newer version changes nothing and says so`; `the flying chip hides its amount in private mode` (R65); `no flight under reduced motion, or when the card is not on screen`; `Undo is a 44 pt control`.
- [ ] **Step 2: Run them and see them fail.** Record the counts.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.** Remove a draft in `sending`: the no-Undo test fails. Colour the check `under`: the neutral test fails. Show the chip's real amount: the private chip test fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add the saved moment: today's total, Undo, a neutral check and the drop into the card"`

---

### Task P2-T18: The wallet shell: the layout order, the tab bar, the + button and the hosts

**Starts after:** P2-T12, P2-T16, P2-T17

**Files:**
- Create: `apps/app/src/wallet/home/WalletShell.tsx`, `home/WalletTabBar.tsx`, `home/AddButton.tsx`, `home/copy.ts`
- Modify: `apps/app/app/spend/_layout.tsx` (the wallet branch, first, before the `core` branch), `apps/app/app/spend/add.tsx` (the wallet area: open the tray in an effect, then `router.replace('/spend')`)
- Test: `apps/app/src/wallet/home/spendLayoutOrder.test.ts` (Node, reads `app/spend/_layout.tsx`), `home/WalletShell.render.test.tsx`; `apps/app/src/screens/redesign/SpendLayout.render.test.tsx` gains the wallet cases

**Interfaces:**
- Consumes (only when 1D-T8 has merged, for the consent hole and its two cases): `AnalyticsConsentScreen`, `useAnalyticsConsent` and the `analytics` area (1D-T8); `recordAnalytics` (1D-T1).
- Produces:
  ```ts
  export function WalletShell({ children }: { children: ReactNode }): JSX.Element;
  export function walletTab(pathname: string): { visible: boolean; active: 'wallets' | 'insights' | null };   // visible on /spend and /spend/insights only
  export function useWalletTabInset(): number;   // 0 where the bar is hidden; the bar's height, or 96 at the largest text sizes
  export function WalletTabBar(): JSX.Element;
  export function AddButton(props: { onPress(): void; disabled: boolean }): JSX.Element;
  ```
- The layout (R58): `if (isRedesignEnabled('wallet')) return <DeviceDiaryProvider><CompanionBoundary><WalletShell><HistoryKeepProvider><Slot /></HistoryKeepProvider></WalletShell></CompanionBoundary></DeviceDiaryProvider>;`. 1C-T9's guard sits before the providers, and its `TermsGate` (1C's K24) wraps `CompanionBoundary` inside `DeviceDiaryProvider` in this branch too (W34); whichever of this task and 1C-T9 lands second writes it, with its order check and mutant (Steps 1 and 5).
- The consent hole (R82): 1D-T8's question replaces the whole `<WalletShell>…</WalletShell>` element, its `HistoryKeepProvider` and `Slot` with it, as `CompanionBoundary`'s only child while 1D-T8's condition holds (the `analytics` area on and `useAnalyticsConsent().status === 'unanswered'`): `<CompanionBoundary>{askConsent ? <AnalyticsConsentScreen /> : <WalletShell>…</WalletShell>}</CompanionBoundary>`. It never renders inside `WalletShell`, so the tab bar, the + and the trays are not drawn while it shows. Whichever of this task and 1D-T8 lands second writes this swap and the two consent cases in Step 1.
- `WalletShell` nests `SpendV1Provider` (with `getSharedV1Resources()`, the singleton every route wraps) > `WalletLooksProvider` > `CardFramesProvider` > `SavedToastHost` > `AddTrayHost` > a root `View` with `onMagicTap={openAdd}` (ax-voiceover: Magic Tap opens the add tray on any tab) holding the screen, the `AddButton` and the `WalletTabBar`. `AddTrayHost`'s `onSaved(saved, context)` shows `noticeOf(saved, context.lookups, context.offline)` (an inner component below `SavedToastHost` reads `useSavedToast()` and renders `AddTrayHost`). `blocked` is `syncPlan(useDiaryView(), false, tc).upgrade` from `HomeScreen.tsx` (true for a `paused_upgrade` draft or an `upgrade_required` outcome, C5).
- The bar (bw-home, W13): กระเป๋า (`/spend`) and สรุป (`/spend/insights`) are tabs saying their place (`1 จาก 3`, `2 จาก 3`); ฉัน (`/settings`) is a link saying `3 จาก 3`, never selected, because Settings sits outside the shell. Each item is at least 44 pt. At the largest text sizes the labels hide and the icons grow to 30 pt, each keeping its name (ax-large-home rule 8), and `useWalletTabInset()` answers 96. The `AddButton` (60 pt, `primary` with a `+` in `onPrimary`, bottom right above the bar) is named `home.add` with the hint `home.addHint`, shows where the bar shows, and is disabled while blocked.
- Copy (`home/copy.ts`): `home.tabWallets` กระเป๋า, `home.tabInsights` สรุป, `home.tabMe` ฉัน, `home.tabPlace` {n} จาก 3, `home.add` จดรายการ, `home.addHint` แตะสองครั้งเพื่อจดรายจ่ายใหม่. Default pending owner Q3: built as written; the English lines, and any Thai line marked draft, are drafts for E2-B.

- [ ] **Step 1: Write the failing tests.**
  - `spendLayoutOrder.test.ts`: `the wallet branch nests the diary, the companion, the shell, History's keep and the slot in that order` (in the source of the wallet branch, the index of `<DeviceDiaryProvider>` < `<CompanionBoundary>` < `<WalletShell>` < `<HistoryKeepProvider>` < `<Slot />`; once 1C-T9 has merged, also `<DeviceDiaryProvider>` < `<TermsGate` < `<CompanionBoundary>`).
  - `walletTab` cases: `/spend` and `/spend/insights` show the bar; `/spend/all`, `/spend/wallet/x`, `/spend/record/x`, `/spend/setup` and `/spend/budget` hide it.
  - `WalletShell.render.test.tsx`: `the bar has กระเป๋า and สรุป as tabs and ฉัน as a link, each 44 pt, and the + opens the add tray`; `a save shows the toast once`; `a draft paused for an update, or an update-required outcome, disables the + and nothing opens` (C5); `Magic Tap opens the add tray` (a source check that `WalletShell.tsx` passes `onMagicTap={openAdd}` on its root, plus a probe calling `openAdd`); `at AX5 the labels hide, the items keep their names and the inset is 96`.
  - `SpendLayout.render.test.tsx`: `with EXPO_PUBLIC_REDESIGN=wallet the spend screens sit in the wallet shell; without it nothing changes`; `/spend/add?type=income in the wallet area opens the income tray over Home`.
  - The two consent cases (R82), once 1D-T8 has merged (otherwise 1D-T8 adds them): `spendLayoutOrder.test.ts`: `the consent question takes the shell's place inside CompanionBoundary` (in the wallet branch's source, `<AnalyticsConsentScreen` sits between `<CompanionBoundary>` and `</CompanionBoundary>` and outside `<WalletShell>…</WalletShell>`); `SpendLayout.render.test.tsx`: `in the wallet area, a never-asked consent question renders in place of the wallet shell` (`EXPO_PUBLIC_REDESIGN=wallet,analytics` and `recordAnalytics({ consent: 'unasked' })`: the question's title ช่วยพัฒนา Jotbun is drawn and the tab bar and the + are not; after `analytics.answer('no')` the shell is drawn).
- [ ] **Step 2: Run them and see them fail.** Record the counts.
- [ ] **Step 3: Implement**, and the two route edits.
- [ ] **Step 4: Run them and see them pass,** with `SpendRoutes.render.test.tsx` unchanged.
- [ ] **Step 5: Mutation check.** Put `WalletShell` above `DeviceDiaryProvider`: the order test fails. With 1C-T9 merged, leave `TermsGate` out of the wallet branch: the order test fails. Read only `outcome.status` for `blocked`: the paused-draft case fails. Show the bar on `/spend/all`: the `walletTab` test fails. With 1D-T8 merged, render the consent question inside `WalletShell`: both consent cases fail.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add the wallet shell inside the device diary and Bun's AI: two tabs, a link to Settings, the floating plus and Magic Tap"`

---

### Task P2-T19: Wallet commands move into one hook

**Starts after:** 1D-T1

**Files:**
- Create: `apps/app/src/screens/redesign/planning/walletCommands.ts`
- Modify: `apps/app/src/screens/redesign/planning/WalletsScreen.tsx` (both pages use the hook; no behaviour change)
- Test: `apps/app/src/screens/redesign/planning/walletCommands.render.test.tsx`; `WalletsScreen.render.test.tsx` runs unchanged

**Interfaces:**
- Produces:
  ```ts
  export type WalletCommand =
    | { kind: 'create'; slot: string; input: CreateWalletRequest }
    | { kind: 'update'; slot: string; id: string; version: number; changes: UpdateWalletRequest }
    | { kind: 'archive' | 'unarchive'; slot: string; id: string; version: number };
  export type WalletTrack = { walletType: string | null; material: string; bunFace: string };   // 1D-T1's trackWalletAdded inputs
  export type WalletOutcome =
    | { kind: 'done' }
    | { kind: 'unconfirmed'; message: string; blocked: boolean }
    | { kind: 'conflict'; current: WalletDto | null }
    | { kind: 'refused'; message: string | null; fields: WalletFieldErrors; needsReason: boolean; archiveRefused: boolean; blocked: boolean };
  export function useWalletCommand(): { sending: boolean; send(command: WalletCommand, track?: WalletTrack): Promise<WalletOutcome>; resend(): Promise<WalletOutcome | null> };
  ```
- This merges today's two `send` functions, `ListPage.send` (unarchive) and `WalletFormPage.send` (create, update, archive), into one hook with their key, own-create, unconfirmed-freeze, refusal and conflict rules unchanged. Each page keeps its own follow-ups (`onDone`, `onChanged`, `setConfirming`, `setAskReason`, `setArchiveRefused`, `onRefresh`) and maps the returned outcome onto its own state, so its suite passes unchanged.
- Analytics (R61, W27): a create's acknowledgement, or a matching own create, calls `trackWalletAdded(track ?? {})` once, inside `send`. Under the carry rule, if 1D-T7 already placed the call in `WalletFormPage.send`, it moves here and takes `track`; there is never a second call.

- [ ] **Step 1: Write the failing tests** through a probe page: `a create sends once with its key and answers done; a lost answer freezes it and resend uses the same key`; `an archive refused because the balance moved answers archiveRefused`; `an unarchive in conflict answers the server's wallet`; `a create sends one wallet_added with the look it was given` (`recordAnalytics()`: `{ wallet_type: 'transit', material: 'sky', bun_face: 'wow' }`); `a refused create sends nothing`.
- [ ] **Step 2: Run them and see them fail.** Record the counts.
- [ ] **Step 3: Move the code** and add the call.
- [ ] **Step 4: Run them and the old suite, unchanged.**
- [ ] **Step 5: Mutation check.** Send the event before the acknowledgement: the refused test fails. A new key on resend: the first test fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Merge the wallet screen's two send rules into one hook that also reports a new wallet's look"`

---

### Task P2-T20: The wallets list, the archived list and reorder

**Starts after:** P2-T11, P2-T13, P2-T19

**Files:**
- Create: `apps/app/src/wallet/wallets/walletsList.ts` (pure), `wallets/WalletsListScreen.tsx`, `wallets/ReorderTray.tsx`, `wallets/copy.ts`
- Modify: `apps/app/app/spend/wallets.tsx` (the wallet area: `WalletsListScreen`, `?reorder=1` opening the reorder tray)
- Catalogue: `apps/app/src/dev/catalogue/wallet/walletListSections.tsx` (`bw-wallets`, `bw-wallets-archived`, `bw-wallets-reorder`)
- Test: `apps/app/src/wallet/wallets/walletsList.test.ts` (Node), `wallets/WalletsList.render.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export function walletsSummary(wallets: readonly WalletDto[], kindOf: (id: string) => WalletKind | null): { activeCount: number; totalMinor: Minor; heldMinor: Minor; creditUsedMinor: Minor };   // credit used: the spending of credit-card wallets with a negative balance; held: every other positive balance
  export function WalletsListScreen(props: { openReorder?: boolean }): JSX.Element;
  export function ReorderTray(props: { visible: boolean; onClose(): void; wallets: readonly WalletDto[] }): JSX.Element;
  ```
- Data bindings (wc-wallets): back; `wallets.reorder` (จัดเรียง) opens `ReorderTray`; the heading `wallets.title`; the summary card from `walletsSummary`; 68 pt rows (name, kind line from `card.kind*`, amount; credit cards say `card.spent`), each opening `/spend/wallet/<id>` and labelled as the board labels them (`บัญชีหลัก บัญชีธนาคาร ยอด 24,860 บาท`); the add tile to `/spend/wallet/new`; the archived row opening the archived list, where each wallet has `wallets.unarchive` through `useWalletCommand().send({ kind: 'unarchive', … })`; the archived note. The reorder tray lists the wallets front-first, each row with move-up and move-down `IconButton`s naming the wallet, and saves with `setOrder` (W28).
- Copy: `wallets.title` กระเป๋าเงิน, `wallets.reorder` จัดเรียง, `wallets.totalLabel` รวมทุกกระเป๋า, `wallets.count` ใช้อยู่ {n} ใบ, `wallets.held` เงินที่มี, `wallets.creditUsed` · หักบัตรเครดิตที่ใช้ไป, `wallets.rowLabel` {name} {kind} ยอด {amount}, `wallets.add` เพิ่มกระเป๋า, `wallets.addLine` เงินสด บัญชี บัตร หรือบัตรเดินทาง, `wallets.archived` เก็บถาวร, `wallets.archivedCount` {n} ใบ, `wallets.archivedNote` รายการของกระเป๋าที่เก็บถาวรยังอยู่ในประวัติ นำกลับมาใช้ได้ทุกเมื่อ, `wallets.unarchive` นำกลับมาใช้ (draft), `wallets.moveUp` ย้าย{name}ขึ้น (draft), `wallets.moveDown` ย้าย{name}ลง (draft). Default pending owner Q3: built as written; the English lines, and any Thai line marked draft, are drafts for E2-B.

- [ ] **Step 1: Write the failing tests.** `walletsList.test.ts`: `the summary splits money held from credit-card spending` (balances `2486000`, `124000`, `-392000` on a credit card and `18600` give a total of `2236600`, held `2628600` and credit used `392000`, wc-wallets' numbers). `WalletsList.render.test.tsx` (both modes and languages): `the list shows each wallet with its kind line and amount, the add tile and the archived count`; `unarchive sends one command and the wallet returns`; `reorder moves a wallet up and keeps the order front-first for this account`; `?reorder=1 opens the reorder tray`; `every row and arrow is at least 44 pt, and each arrow names its wallet`.
- [ ] **Step 2: Run them and see them fail.** Record the counts.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass,** with `WalletsScreen.render.test.tsx` unchanged.
- [ ] **Step 5: Mutation check.** Count a credit card's debt as held money: the summary test fails. Save the order last-first: the reorder test fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add the Bun Wallet wallets list with archived wallets and reorder"`

---

### Task P2-T21: A new wallet, editing a wallet and the correction tray

**Starts after:** P2-T9, P2-T14, P2-T20

**Files:**
- Create: `apps/app/src/wallet/wallets/NewWalletFlow.tsx`, `wallets/WalletFields.tsx`, `wallets/WalletEditScreen.tsx`, `wallets/CorrectionTray.tsx`; extend `wallets/copy.ts`
- Create: `apps/app/app/spend/wallet/new.tsx`, `apps/app/app/spend/wallet/[id]/edit.tsx` (each `<Redirect href="/spend/wallets" />` while the wallet area is off)
- Catalogue: `walletListSections.tsx` gains `bw-wallet-new-type`, `bw-wallet-new-form`, `bw-wallet-added`, `bw-wallet-edit`, `bw-wallet-correction`
- Test: `apps/app/src/wallet/wallets/NewWallet.render.test.tsx`, `wallets/WalletEdit.render.test.tsx`

**Interfaces:**
- Consumes: `walletsModel.ts` (`WalletForm`, `newWalletForm`, `walletFormOf`, `walletPreview`, `buildCreateWallet`, `buildWalletUpdate`, `correctionNeedsReason`, `CORRECTION_REASONS`, `canArchive`, `archiveAdvice`); `useWalletCommand` (P2-T19); `useWalletLooks`, `WalletCard`, `BunFace`, `MaterialFill` (P2-T11); `WalletKeypad` (P2-T14); `walletAddedEntering`, `motionFor` (P2-T9).
- Produces:
  ```ts
  export function NewWalletFlow(props: { returnTo?: '/spend/setup' }): JSX.Element;   // the route passes '/spend/setup' for ?setup=1
  export function WalletFields(props: { form: WalletForm; onForm(next: WalletForm): void; look: WalletLook; onLook(next: WalletLook): void; keypad: KeypadState; onKeypad(next: KeypadState): void; errors: WalletFieldErrors; preview: WalletCardModel }): JSX.Element;
  export function WalletEditScreen(props: { walletId: string }): JSX.Element;
  export function CorrectionTray(props: { visible: boolean; onClose(): void; onReason(reason: WalletCorrectionReason): void }): JSX.Element;
  ```
- Data bindings: step 1 (wc-wallet-type) lists the four kinds with their lines (no e-wallet, W25); step 2 is `WalletFields` (name, the five faces at 48 pt, the five materials at 56 × 44 pt, the opening balance on `WalletKeypad`, the tracking start as `walletsModel` sets it, the live preview card); step 3 (bw-adding) shows the card entering with `walletAddedEntering`, plays `walletAdded`, and ends with เสร็จ, to `returnTo` or `/spend`. Creating calls `send({ kind: 'create', … }, { walletType: kind, material, bunFace: face })`, then, after `done` only, `setLook(id, { kind, material, face })`. Edit (wc-wallet-edit): save in the header, the preview, the same fields; a correction that `correctionNeedsReason` flags opens `CorrectionTray` with today's two reasons first; archive only when `canArchive`, otherwise `wallets.archiveLater` with both amounts. Look changes in edit are kept at once and need no command.
- Copy: `wallets.newStep` กระเป๋าใหม่ · ขั้นที่ {n} จาก 3, `wallets.typeQuestion` อยากเพิ่มกระเป๋าแบบไหน?, `wallets.typeHint` เลือกแบบที่ใกล้ที่สุด ชื่อและหน้าตาเปลี่ยนเองได้ในขั้นถัดไป, `wallets.kindCashLine` เงินในกระเป๋าสตางค์ จดเองเมื่อจ่าย, `wallets.kindBankLine` ออมทรัพย์ บัญชีเงินเดือน หรือพร้อมเพย์, `wallets.kindCardLine` ดูยอดที่ใช้ไป จนกว่าจะจ่ายคืน, `wallets.kindTransitLine` บัตรที่เติมเงินไว้ จดค่าเดินทางแต่ละเที่ยว, `wallets.typeNote` ทุกแบบนับยอดแบบเดียวกัน บัตรเครดิตจะแสดงเป็นยอดที่ใช้ไปแทนยอดคงเหลือ, `wallets.kindCash` เงินสด, `wallets.kindBank` บัญชีธนาคาร, `wallets.kindCard` บัตรเครดิต, `wallets.kindTransit` บัตรเดินทาง, `wallets.name` ชื่อกระเป๋า, `wallets.face` หน้าบัน, `wallets.material` วัสดุ, `wallets.opening` ยอดเริ่มต้น, `wallets.trackingFrom` เริ่มจด {date}, `wallets.hasRecords` กระเป๋านี้มีรายการแล้ว ถ้าแก้ยอดนี้ บันจะถามเหตุผลก่อนบันทึก, `wallets.editTitle` แก้ไขกระเป๋า, `wallets.preview` ตัวอย่างการ์ด {name} ยอด {amount}, `wallets.archive` เก็บกระเป๋านี้ถาวร, `wallets.archiveLater` เก็บได้เมื่อยอดเหลือ ฿0 ตอนนี้มี {amount} โอนไปกระเป๋าอื่นก่อนนะ, `wallets.added` เพิ่มกระเป๋าแล้ว, `wallets.ready` {name}พร้อมให้จดแล้ว, the faces' names (ยิ้ม, ขยิบตา, สบาย ๆ, ดีใจ, ว้าว) and the materials' (ไหม, กระดาษ, ไทเทเนียม, ฟ้า, พีช). Default pending owner Q3: built as written; the English lines, and any Thai line marked draft, are drafts for E2-B.

- [ ] **Step 1: Write the failing tests** (both modes and languages): `a new wallet: kind, name, face, material and opening balance, then the ceremony` (`createWallet` once; the look kept after the acknowledgement; one `wallet_added` with the look); `a look is not kept when the create is refused`; `the flow offers four kinds, never e-wallet`; `opened with ?setup=1 the ceremony returns to /spend/setup`; `editing a wallet with records asks why before a correction is sent`; `archive is offered only at ฿0; otherwise the screen says why`; `every face, material and key is at least 44 pt, and each is named`.
- [ ] **Step 2: Run them and see them fail.** Record the counts.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.** Keep the look before the acknowledgement: the refused test fails. Offer archive at a non-zero balance: the archive test fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add the Bun Wallet new-wallet flow with its look, wallet editing and the correction tray"`

---

### Task P2-T22: Wallet detail and the streak

**Starts after:** P2-T4, P2-T11, P2-T16, P2-T18, P2-T21

**Files:**
- Create: `apps/app/src/wallet/wallets/walletDetail.ts` (pure), `wallets/WalletDetailScreen.tsx`; extend `wallets/copy.ts`
- Create: `apps/app/app/spend/wallet/[id]/index.tsx` (the wallet area: `WalletDetailScreen`; otherwise `<Redirect href="/spend/wallets" />`)
- Catalogue: `walletListSections.tsx` gains `bw-wallet-detail`, `bw-wallet-detail-card`, `bw-wallet-detail-private`, `bw-wallet-detail-web`
- Test: `apps/app/src/wallet/wallets/walletDetail.test.ts` (Node), `wallets/WalletDetail.render.test.tsx`

**Interfaces:**
- Consumes: `streakCount` and `SpendDiary.loggedDays()` (P2-T4); `WalletCard`, `useWalletLooks`, `WalletCategoryIcon` (P2-T11); `useAddTray` (P2-T16); `WalletAmount` (P2-T10); `countCashbackPurchases`, `cashbackView` (`src/spend/v1/ai/cashbackModel.ts`); `useLoad`, `classifyLoadProblem`.
- Produces:
  ```ts
  export type WalletTiles = { monthOutMinor: Minor; todayOutMinor: Minor; todayCount: number; cashbackCount: number | null; streakDays: number | null };
  export function walletTiles(input: { month: Pick<HistoryPage, 'summary'>; today: Pick<HistoryPage, 'items' | 'summary'>; streakDays: number | null; cashback: number | null }): WalletTiles;
  export function WalletDetailScreen(props: { walletId: string; now?: Date }): JSX.Element;
  ```
- Reads: `resources.wallets()`; this month for the wallet, `history({ from: month start, through: today, wallet_id, sort: 'date_desc' }, undefined, 3)` (its `summary.expense_minor` and its three latest records); today for the wallet, `history({ from: today, through: today, wallet_id, sort: 'date_desc' }, undefined, HISTORY_MAX_LIMIT)`; and `diary.loggedDays()` for the streak (R59).
- Data bindings (bw-wallet): close, search in this wallet (`/spend/all?wallet=<id>&search=1`), more (a tray with แก้ไข to `/spend/wallet/<id>/edit`); the `full` card with `wallet.recorded` and the balance at 34; four 44 pt actions (จดรายจ่าย, รับเงิน, ย้ายเงิน open the add tray with `{ type, walletId }`; แก้ไข opens edit); tiles: `wallet.monthOut`, `wallet.today` with the count, the cashback tile (count only, opening nothing, only when `cashbackView` says tips, D42), and the streak tile, `streakCount(days, today)` with the board's note (left out while `loggedDays()` answers null, as on the web); the latest three rows (category tile, title, day; no time, W12) and `wallet.seeAll` to `/spend/all?wallet=<id>`. An archived or unknown wallet shows `wallet.gone` and Back.
- Copy: `wallet.search` ค้นหาในกระเป๋านี้, `wallet.more` ตัวเลือกเพิ่มเติม, `wallet.recorded` ยอดคงเหลือที่จดไว้, `wallet.addExpense` จดรายจ่าย, `wallet.receive` รับเงิน, `wallet.move` ย้ายเงิน, `wallet.edit` แก้ไข, `wallet.monthOut` ใช้เดือนนี้, `wallet.today` วันนี้, `wallet.count` {n} รายการ, `wallet.cashback` อาจได้คืน, `wallet.cashbackVia` ผ่าน GoGoCash, `wallet.streak` จดต่อเนื่อง, `wallet.streakDays` {n} วัน, `wallet.streakNote` ข้ามวันได้ ไม่เสียสถิติ (the board's words, R59), `wallet.latest` รายการล่าสุด, `wallet.seeAll` ดูทั้งหมด, `wallet.noneThisMonth` ยังไม่มีรายการเดือนนี้ (draft), `wallet.gone` กระเป๋านี้ถูกเก็บถาวรหรือไม่มีแล้ว (draft). Default pending owner Q3: built as written; the English lines, and any Thai line marked draft, are drafts for E2-B.

- [ ] **Step 1: Write the failing tests.** `walletDetail.test.ts`: `tiles take the month's and today's money out from the server's totals, and count today's live records`; `the cashback tile is hidden unless tips are on`. `WalletDetail.render.test.tsx` (both modes and languages): `the detail shows the card, the four actions and the tiles as bw-wallet does`; `จดรายจ่าย, รับเงิน and ย้ายเงิน open the add tray with this wallet and that type`; `the streak counts every logged day across wallets and says ข้ามวันได้ ไม่เสียสถิติ` (the fake diary's logged days `2026-10-20`, `2026-10-21`, `2026-10-23`, `2026-10-24` show `4 วัน`); `with no diary there is no streak tile`; `a credit card's balance reads ใช้ไป`; `private mode hides the balance and every tile amount`; `no row shows a time`; `an archived wallet says it is gone and offers Back`.
- [ ] **Step 2: Run them and see them fail.** Record the counts.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.** Count the days of this wallet's loaded records instead of the diary's days: the streak test fails (the person's count is global). Show the tile with no diary as 0: the no-diary test fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add the Bun Wallet wallet detail, with its tiles and a streak that pauses on a skipped day"`

---

### Task P2-T23: Home's data moves into a hook, and the Home models

**Starts after:** P2-T5, P2-T10, P2-T11, P2-T12

**Files:**
- Create: `apps/app/src/screens/redesign/homeData.ts` (moved out of `HomeScreen.tsx`: `readToday`, `useRefreshOnResolve`, `useBudgetThresholdHaptic` and the load); Modify: `HomeScreen.tsx` (no behaviour change)
- Create: `apps/app/src/wallet/home/homeWallets.ts`, `home/budgetCardWords.ts` (pure)
- Test: `apps/app/src/wallet/home/homeWallets.test.ts`, `home/budgetCardWords.test.ts` (Node); `HomeScreen.render.test.tsx` runs unchanged

**Interfaces:**
- Produces:
  ```ts
  // screens/redesign/homeData.ts
  export function useHomeData(today: string): HomeLoad & { reload(): void; refresh(): void };   // today's useLoad in HomeScreen, with useRefreshOnResolve
  export { readToday, useBudgetThresholdHaptic };   // moved unchanged
  // wallet/home/homeWallets.ts
  export function homeWallets(input: { wallets: readonly WalletDto[]; todayRecords: readonly TransactionDto[]; outbox: readonly OutboxCommand[]; order: readonly string[]; lookOf: (id: string) => WalletLook }): StackWallet[];
  // wallet/home/budgetCardWords.ts
  export function budgetCardWords(pace: BudgetPace, hidden: boolean, t: WalletT): { headline: string; side: { text: string; tone: 'under' | 'over' | 'ink' } | null; spoken: string };
  ```
- `homeWallets`: archived wallets left out; `order` is front-first and wallets not in it follow by name; the result is the stack's drawing order, so the front card is last; `balanceMinor` is `availableBalances` (P2-T5: the server's balance less what waiting drafts take); `pendingMinor` sums the waiting drafts touching the wallet; `todayOutMinor` sums today's confirmed expenses from it.
- `budgetCardWords` (bw-home, bw-private, ax-voiceover): on track, `home.perDay` (เหลือวันละ {amount}, `perDayText(pace.perDayMinor)`, C4) in `under`; tight, the same words in `ink`; over, `home.over` (เกินงบไป {amount}) in `over`; no budget, `side` is null (the screen shows `home.setBudget`); private mode, `home.onTrack` (ตามแผน) or `home.overWord` (เกินงบ) and no amount. `spoken`: `ใช้ไปเดือนนี้ 12,480 บาท จากงบ 18,000 บาท, เหลือวันละ 690 บาท`. These keys go in `home/copy.ts`. Default pending owner Q3: built as written; the English lines, and any Thai line marked draft, are drafts for E2-B.
- Carry rule: 1D-T5's `useRefreshOnRevision` call on Home's load moves into `useHomeData` with it.

- [ ] **Step 1: Write the failing tests.** `homeWallets.test.ts`: `the stack draws the kept order with the front card last, archived wallets out`; `a card's balance takes off what waiting drafts spend and says how much is still saving` (rh-offline: `2486000` with a waiting `5000` expense gives `2481000` and pending `5000`); `today's spending counts confirmed expenses only`. `budgetCardWords.test.ts` (paces built with `budgetPace`): `on track says เหลือวันละ ฿690 in the under colour`; `over says เกินงบไป ฿420 in the over colour`; `private mode says ตามแผน or เกินงบ and no amount`; `on the month's last day the per-day hint is all that is left` (Review Focus 5: today `2026-10-31`, left `552000` gives `เหลือวันละ ฿5,520`).
- [ ] **Step 2: Run them and see them fail.** Record the counts.
- [ ] **Step 3: Move the load, then write the models.**
- [ ] **Step 4: Run them, and Home's suite unchanged.**
- [ ] **Step 5: Mutation check.** Draw the front card first: the order test fails. Show the per-day amount in private mode: the private test fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Move Home's load into a hook and add the wallet stack and budget card models"`

---

### Task P2-T24: The wallet Home

**Starts after:** P2-T18, P2-T20, P2-T22, P2-T23, 1D-T5

**Files:**
- Create: `apps/app/src/wallet/home/WalletHomeScreen.tsx`, `home/BudgetCard.tsx`, `home/TodayRow.tsx`, `home/CashbackPill.tsx`, `home/HomeSkeleton.tsx`; extend `home/copy.ts`
- Modify: `apps/app/app/spend/index.tsx` (the wallet area: `WalletHomeScreen`)
- Catalogue: `apps/app/src/dev/catalogue/wallet/homeSections.tsx` (`bw-home`, `bw-home-private`, `bw-home-offline`, `bw-home-empty`, `bw-home-no-wallet`, `bw-home-loading`, `bw-home-over`, `bw-home-no-budget`, `bw-home-update`, `bw-home-large`)
- Test: `apps/app/src/wallet/home/WalletHome.render.test.tsx`

**Interfaces:**
- Consumes: `useHomeData`, `homeWallets`, `budgetCardWords` (P2-T23); `homeModel`, `budgetPace`, `syncPlan`; `CardStack` (P2-T12); `useWalletLooks` (P2-T11); `WalletAmount`, `PrivateEyeButton`, `PrivateTip` (P2-T10); `GrowBar` (P2-T9); `useWalletTabInset` (P2-T18); 1D-T5's `useRefreshOnRevision` (`src/screens/redesign/useRefreshOnRevision.ts`), already inside `useHomeData`; `countCashbackPurchases`, `cashbackView` (A5).
- Produces: `WalletHomeScreen(props: { now?: Date }): JSX.Element`.
- Data bindings (bw-home, rh-offline, es-empty-home, es-loading, es-update-required, ax-large-home):
  - Header: `CashbackPill` (A5's count when `cashbackView` says tips; a count only that opens nothing, R73), or, while drafts wait and the last run did not reach Jotbun (`syncPlan(...).offline`), the offline pill opening today's drafts review as Home does today; search (`/spend/all?search=1`) and account (`/settings`) `IconButton`s.
  - The greeting (heading, no name, W32), `PrivateEyeButton`, `PrivateTip`.
  - `BudgetCard`: the spent amount at 28, the limit, `budgetCardWords`' side line, a `GrowBar` of spent over the limit (`ink`, `over` when over) with a 2 pt `violet` mark at today's place in the month, and `home.pendingTotal` while drafts wait; it opens `/spend/budget`.
  - The wallets heading with `wallets.reorder` (`/spend/wallets?reorder=1`), then `CardStack` from `homeWallets`, opening `/spend/wallet/<id>`.
  - `TodayRow`: today's count and money out, `home.saving` while drafts wait; it opens `/spend/all`.
  - States from `homeModel`: loading is `HomeSkeleton` (shown after 300 ms, then held at least 500 ms; one shimmer band, none under reduced motion; one status line); the first run and an empty month are es-empty-home (the ฿0 budget card with `home.countFromToday`, the stack plus a dashed `home.addWallet` card to `/spend/wallet/new`, the empty lines and a `PrimaryButton` `home.firstEntry` opening the add tray); a load problem shows its words and Try again, with the phone's drafts below when offline; update required (C5) shows `home.updateTitle`, `home.updateSafe`, `home.updateWaiting`, this phone's version from `expo-application` (W37) and `home.browseLocal`, which shows Home from what the phone holds with the + and every tray disabled.
  - The refresh on a new revision comes with `useHomeData` (1D-T5's `useRefreshOnRevision` call, which the carry rule put into the hook, R70; the screen adds no second call); `useBudgetThresholdHaptic` as today. No Bun note (W33).
  - Screen-reader order: the pill, search, account, the greeting, the eye, the budget card, the wallets heading, จัดเรียง, each card in drawn order, the today row, then the shell's + and tabs.
  - Largest text: the greeting hides; the pill becomes its count beside a glyph and keeps its full name as its label; the budget card stacks one fact per line; จัดเรียง drops below its heading; the stack is the list; amounts wrap below names.
- Copy: `home.cashback` {count} รายการอาจได้คืน, `home.offline` ออฟไลน์ · รอบันทึก {n} รายการ, `home.search` ค้นหา, `home.account` บัญชี, `home.greeting` สวัสดี, `home.spentLabel` ใช้ไปเดือนนี้, `home.budgetLabel` งบ, `home.setBudget` ตั้งงบ, `home.pendingTotal` รวม {amount} ที่กำลังบันทึกในเครื่องนี้, `home.walletsHeading` กระเป๋า, `home.today` วันนี้ · {count} รายการ, `home.saving` กำลังบันทึก {n} รายการ…, `home.loading` กำลังโหลดบันทึกของคุณ, `home.countFromToday` เริ่มนับจากวันนี้ (draft), `home.addWallet` เพิ่มกระเป๋า, `home.emptyTitle` ยังไม่มีรายการ, `home.emptyBody` เริ่มจากกาแฟแก้วแรกของวันนี้ก็ได้, `home.emptyHint` จดเสร็จในไม่กี่วินาที, `home.firstEntry` จดรายการแรก, `home.updateTitle` อัปเดต Jotbun, `home.updateSafe` บันทึกที่จดไว้ไม่หายไปไหน (draft), `home.updateWaiting` อีก {n} รายการรออยู่ในเครื่องนี้ จะส่งหลังอัปเดต (draft), `home.version` เวอร์ชันในเครื่องนี้ {version} (draft), `home.browseLocal` ดูบันทึกในเครื่องก่อน. Default pending owner Q3: built as written; the English lines, and any Thai line marked draft, are drafts for E2-B.

- [ ] **Step 1: Write the failing tests** (both modes and languages): `Home draws the greeting, the eye, the budget card, the stack and today's row as bw-home does`; `screen readers meet Home in ax-voiceover's order`; `private mode hides every amount on Home, and its words carry no digit` (Review Focus 2); `offline, the cards include what is saving and the pill says how many wait`; `the cashback pill shows a count and opens nothing`; `the empty day-one Home offers the first entry and the next wallet`; `update required keeps the phone's records browsable and blocks new ones` (C5); `loading shows nothing for 300 ms, then the skeleton, which reduced motion keeps still`; `at AX5 the greeting hides, the budget card stacks and the stack is a list`; `"today" is the Bangkok date on a phone in another time zone` (Review Focus 5: `now` 2026-10-24T17:30:00Z reads 25 October's records); `a change pulled from another phone refreshes Home in place` (`appliedRevision` from `'5'` to `'7'` reads once more; the same revision reads nothing).
- [ ] **Step 2: Run them and see them fail.** Record the counts.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass,** with `HomeScreen.render.test.tsx` unchanged.
- [ ] **Step 5: Mutation check.** Refresh on every view update: the refresh test fails. Let the pill open a tray: the cashback test fails. Show the skeleton at once: the loading test fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add the Bun Wallet Home: the wallet stack, the budget card and today's records"`

---

### Task P2-T25: Recently deleted

**Starts after:** P2-T8, P2-T10

**Files:**
- Create: `apps/app/src/screens/redesign/deleted/deletedData.ts` (moved out of `RecentlyDeletedScreen.tsx`: the paging, `loadMore` and `restore` with their keys and frozen state); Modify: `RecentlyDeletedScreen.tsx` (no behaviour change)
- Create: `apps/app/src/wallet/records/WalletDeletedScreen.tsx`, `records/copy.ts`
- Modify: `apps/app/app/spend/deleted.tsx` (the wallet area: `WalletDeletedScreen`)
- Catalogue: `apps/app/src/dev/catalogue/wallet/recordSections.tsx` (`bw-deleted`)
- Test: `apps/app/src/wallet/records/WalletDeleted.render.test.tsx`; `RecentlyDeletedScreen.render.test.tsx` runs unchanged

**Interfaces:**
- Produces: `useRecentlyDeleted(now?: Date): RecentlyDeletedState` (the state values and handlers the screen holds today, under their names); `WalletDeletedScreen(props: { now?: Date }): JSX.Element`.
- Carry rule: 1D-T7's `trackRecordRestored` moves with `restore`.
- Data bindings (rh-deleted): back; the heading; the policy line first; rows with the title, amount, wallet and date, then `records.daysLeft` or `records.lastDay`; a 44 pt `records.restore` named `กู้คืน {title} {amount}`; the footer line; today's paging, refresh-suggested and refusal words through `tc`.
- Copy: `records.deletedTitle` รายการที่เพิ่งลบ, `records.deletedPolicy` รายการที่ลบแล้วกู้คืนได้ภายใน 30 วัน หลังจากนั้นจะถูกลบถาวร กู้คืนแล้วรายการจะกลับไปอยู่ในวันเดิมของมัน, `records.daysLeft` เหลือ {n} วัน, `records.lastDay` วันสุดท้ายที่กู้คืนได้, `records.restore` กู้คืน, `records.restoreLabel` กู้คืน {title} {amount}, `records.deletedFooter` เรียงจากที่ลบล่าสุด · ยอดในงบและกระเป๋าไม่นับรายการที่ลบ. Default pending owner Q3: built as written; the English lines, and any Thai line marked draft, are drafts for E2-B.

- [ ] **Step 1: Write the failing tests** (both modes and languages): `Recently deleted says how many days are left and restores one entry` (`restoreTransaction` once with its version and key); `the last day says so`; `private mode hides every amount`; `every restore button is 44 pt and names its entry`.
- [ ] **Step 2: Run them and see them fail.** Record the counts.
- [ ] **Step 3: Move `useRecentlyDeleted`, run its suite, then build the screen.**
- [ ] **Step 4: Run them and see them pass,** with the old suite unchanged.
- [ ] **Step 5: Mutation check.** Count days left from the delete day plus 31: the days test fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Move Recently deleted's rules into a hook and add its Bun Wallet screen"`

---

### Task P2-T26: The record: detail, actions and Undo

**Starts after:** P2-T6, P2-T10, P2-T13, P2-T16

**Files:**
- Create: `apps/app/src/wallet/records/WalletRecordScreen.tsx`, `records/RecordActionsTray.tsx`, `records/WalletUndoBar.tsx`; extend `records/copy.ts`
- Modify: `apps/app/app/spend/record/[id].tsx` (the wallet area: `WalletRecordScreen`)
- Catalogue: `recordSections.tsx` gains `bw-record`, `bw-record-draft`, `bw-record-deleted`, `bw-record-actions`, `bw-record-undo`
- Test: `apps/app/src/wallet/records/WalletRecord.render.test.tsx`; `RecordScreen.render.test.tsx` runs unchanged

**Interfaces:**
- Consumes: `useRecordActions` and the `RecordActionsState` fields listed in Global Constraints (P2-T6); `useAddTray` (P2-T16, for ทำซ้ำ); `WalletAmount`, `usePrivateMode` (P2-T10); `Tray`, `PrimaryButton`, `TextLink` (P2-T13); `recordDetail`, `DRAFT_STATE_TEXT`.
- Produces:
  ```ts
  export function WalletRecordScreen(props: { id: string; mode?: 'view' | 'edit'; now?: Date }): JSX.Element;
  export function RecordActionsTray(props: { visible: boolean; onClose(): void; onClosed?(): void; title: string; detail: string; amountMinor: Minor; onEdit(): void; onCopy(): void; onDelete(): void }): JSX.Element;
  export function WalletUndoBar(props: { message: string; onUndo(): void; onDismiss(): void }): JSX.Element;   // on toast, a 44 pt Undo, gone after motion.duration.toastLong
  ```
- Data bindings (bw-record, rh-actions, rh-undo): the amount ghosted large behind (decorative); back and more (opening `RecordActionsTray`); the title and the date as the board writes it with no time (W12); the amount exact at 44; a facts card (status from the row state, wallet, category, note; no `จดจาก` row, W35); today's receipt section unchanged when the `import` area is on (W15); three 52 pt buttons แก้ไข (`startEditing()`, which P2-T27's tray shows), ทำซ้ำวันนี้ (`useAddTray().open({ copyOf: id })`) and ลบ (`remove(record)`, then `WalletUndoBar` restoring `deleted` through `restore`). A draft still on the phone shows its state with Remove or Discard (`settleDraft`), as today, and cannot be edited. `pending` freezes with Try again, `gone` and `notice` show today's words. This task sends no event (R61: they sit in `useRecordActions`).
- Copy: `records.status` สถานะ, `records.wallet` กระเป๋า, `records.category` หมวด, `records.note` โน้ต, `records.more` ตัวเลือกเพิ่มเติม, `records.edit` แก้ไข, `records.copyToday` ทำซ้ำวันนี้, `records.delete` ลบ, `records.actionEditLine` ยอด หมวด กระเป๋า วันที่ หรือโน้ต, `records.actionCopy` ทำซ้ำ, `records.actionCopyLine` จดใหม่เป็นของวันนี้, `records.actionDeleteLine` กู้คืนได้ภายใน 30 วัน, `records.deletedBar` ลบ {title} {amount} แล้ว. Default pending owner Q3: built as written; the English lines, and any Thai line marked draft, are drafts for E2-B.

- [ ] **Step 1: Write the failing tests** (fakes; both modes and languages): `the record shows its amount exactly, its facts and no time` (`฿50.00`, `เสาร์ 24 ต.ค. 2569`, no `/\d{1,2}:\d{2}/`); `ทำซ้ำวันนี้ opens the add tray copying this record`; `ลบ deletes, and Undo restores with the version the delete returned`; `the actions tray offers edit, copy and delete in 66 pt rows`; `a draft never sent can be removed and one that needs a look discarded; neither can be edited`; `private mode hides the record's amount and the ghost`; `every action and row is at least 44 pt`.
- [ ] **Step 2: Run them and see them fail.** Record the counts.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass,** with Record's suite unchanged.
- [ ] **Step 5: Mutation check.** Show the time: the first test fails. Restore with version 1: the undo test fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add the Bun Wallet record: detail, actions and Undo, on the record's shared rules"`

---

### Task P2-T27: Editing in the tray, and the conflict panel in the wallet look

**Starts after:** P2-T15, P2-T26, 1D-T4, 1D-T9

**Files:**
- Create: `apps/app/src/wallet/records/EditTray.tsx`
- Modify: `apps/app/src/screens/redesign/conflict/ChoicePanel.tsx` (1D-T9's; the wallet look only while `isRedesignEnabled('wallet')`, R62), `apps/app/src/wallet/records/WalletRecordScreen.tsx` (shows `EditTray` while `editing` is set, and `ChoicePanel` from `choicePanel`)
- Catalogue: `recordSections.tsx` gains `bw-record-edit` and `bw-record-choice`
- Test: `apps/app/src/wallet/records/EditTray.render.test.tsx`; `apps/app/src/screens/redesign/conflict/ChoicePanel.render.test.tsx` gains the wallet-look cases; `RecordScreen.render.test.tsx` runs unchanged

**Interfaces:**
- Consumes: `editing`, `changeEditing`, `pressKey`, `submitEdit`, `cancelEditing`, `busy`, `choicePanel` (`RecordActionsState`, P2-T6 with 1D-T9's addition); the steps (P2-T14, P2-T15); `earliestDate` (P2-T6); `ChoicePanelProps` (1D-T9: `model`, `yoursAt`, `busy`, `canSendYours`, `note`, `onUseYours`, `onUseServer`, `onDecideLater?`).
- Produces: `EditTray(props: { actions: RecordActionsState; lookups: Lookups; wallets: readonly WalletSnapshot[]; categories: readonly CategoryDto[] }): JSX.Element`.
- `EditTray`: the add tray's amount, confirm and pick steps on `editing.draft` and `editing.keypad`, the save button calling `submitEdit()` (today's rule: only the changed fields, with the version seen), locked while `busy`, today's frozen Try again while `editing.unconfirmed`. A record with a `choicePanel` shows the panel instead of the tray.
- `ChoicePanel` restyle: with the wallet area on, the panel draws in the wallet look (rh-conflict: the two radio cards on `card`, the black `PrimaryButton` following the chosen card, `TextLink` for decide later) from the same props and copy; with it off, nothing about 1D-T9's panel changes. P2 adds no test of decide-later (1D-T9 owns it).

- [ ] **Step 1: Write the failing tests.** `EditTray.render.test.tsx` (both modes and languages): `แก้ไข saves only the changed fields with the version seen` (`updateTransaction(id, 1, { amount_minor: '5500' }, key)`); `a save in flight cannot close the tray`; `an edit whose answer never came keeps Try again with the same key`; `a pending choice shows the panel, not the tray`. `ChoicePanel.render.test.tsx`: `in the wallet area the panel uses the wallet look and the same props`; `outside it the panel is unchanged`; `private mode hides both versions' amounts`.
- [ ] **Step 2: Run them and see them fail.** Record the counts.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass,** with Record's suite and 1D-T9's panel cases unchanged.
- [ ] **Step 5: Mutation check.** Send every field on edit: the changed-fields test fails. Apply the wallet look with the area off: the unchanged test fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Edit records in the Bun Wallet tray and show 1D's conflict panel in the wallet look"`

---

### Task P2-T28: History, search and the filter tray

**Starts after:** P2-T18, P2-T26, 1D-T5, 1D-T9

**Files:**
- Create: `apps/app/src/screens/redesign/history/historyData.ts` (moved out of `HistoryScreen.tsx`: the month, filters, search, paging, `historyKeep`, refresh-suggested and the delete-with-undo commands); Modify: `HistoryScreen.tsx` (no behaviour change)
- Create: `apps/app/src/wallet/history/WalletHistoryScreen.tsx`, `history/FilterTray.tsx`, `history/copy.ts`
- Modify: `apps/app/app/spend/all.tsx` (the wallet area: `WalletHistoryScreen` with `month`, `wallet`, `category`, `type` and `search` read from the URL, R71)
- Catalogue: `apps/app/src/dev/catalogue/wallet/historySections.tsx` (`bw-history`, `bw-history-search`, `bw-history-filter`, `bw-history-saving`, `bw-history-choice`, `bw-history-empty`, `bw-history-large`)
- Test: `apps/app/src/wallet/history/WalletHistory.render.test.tsx`; `HistoryScreen.render.test.tsx`, `HistoryReturn.render.test.tsx` and `HistoryList.render.test.tsx` run unchanged

**Interfaces:**
- Produces:
  ```ts
  export type HistoryStart = { initialMonth?: string; initialWalletId?: string; initialCategoryId?: string; initialType?: TransactionType; startSearch?: boolean };
  export function useHistoryData(input: HistoryStart & { now?: Date; onMonthChange?: (month: string) => void }): HistoryDataState;   // today's state and handlers, under their names
  export function WalletHistoryScreen(props: HistoryStart & { now?: Date; onMonthChange?: (month: string) => void }): JSX.Element;
  export function FilterTray(props: { visible: boolean; onClose(): void; month: string; walletId: string | null; categoryId: string | null; type: TransactionType | null; onApply(next: { month: string; walletId: string | null; categoryId: string | null; type: TransactionType | null }): void }): JSX.Element;
  ```
- Carry rule: 1D-T5's `useRefreshOnRevision` and 1D-T7's delete and undo events move with History's rules.
- Data bindings (rh-history, rh-search, rh-filter, rh-actions, rh-undo): back; the heading; the search field (48 pt); four 44 pt pills (the month, ทุกกระเป๋า, ทุกหมวด, ทุกประเภท, each naming its current choice) opening `FilterTray`; the month card with the server's exact total for the filter; the deleted link (`/spend/deleted`); day groups headed `วันนี้ · เสาร์ 24 ต.ค.` with the day's confirmed total and drafts' money said apart; 60 pt rows (category tile, title, wallet, amount; a draft says `history.saving` in `violet`; a record with a pending choice shows 1D-T9's `choicePending` caption, `waiting` from `conflictCopy.draft.ts`, R62; no time, W12); a long press, or the screen reader's actions, opens `RecordActionsTray`; a delete shows `WalletUndoBar`. Search shows `history.matches` and says when only the loaded pages were searched, as today. The refresh on a new revision comes with `useHistoryData` (1D-T5's call on `loadRef.current(true)`, moved into the hook by the carry rule, R70; the screen adds no second call).
- `FilterTray` (rh-filter): the month with previous and next (next disabled for a month not started); wallets as single-choice 66 pt rows with balances (one wallet, W16); categories as chips; the type as four segments; `history.clear` and `history.apply`. Each choice scopes the server's query, so totals stay exact.
- Copy: `history.title` ประวัติ, `history.searchHint` ค้นหา ร้าน หมวด หรือโน้ต, `history.allWallets` ทุกกระเป๋า, `history.allCategories` ทุกหมวด, `history.allTypes` ทุกประเภท, `history.monthSpent` เดือนนี้ใช้ไป, `history.deletedLink` ดูรายการที่ลบ (30 วัน), `history.today` วันนี้, `history.yesterday` เมื่อวาน, `history.saving` กำลังบันทึก…, `history.matches` {count} รายการ · {amount}, `history.matchesIn` ที่ตรงกับ “{query}” ในเดือน{month}, `history.typeAll` ทั้งหมด, `history.clear` ล้างตัวกรอง, `history.apply` แสดงผล. Default pending owner Q3: built as written; the English lines, and any Thai line marked draft, are drafts for E2-B.

- [ ] **Step 1: Write the failing tests** (fakes; both modes and languages): `History groups the month by day with each day's total, and rows show no time`; `the filter tray picks one wallet, one category and one type, and the server's query and total follow`; `opening with ?wallet=, ?category= and ?type= starts filtered to them` (R71: `history` called with `wallet_id`, `category_id` and `type`); `search shows how many entries match and their total` (`5 รายการ · ฿325`); `a draft on the phone says กำลังบันทึก… and stays out of the day's total`; `a record with a pending choice shows the waiting caption`; `a long press opens the actions; a delete shows Undo, which restores`; `a change pulled from another phone refreshes the list in place`; `private mode hides every amount, the day totals and the search total`; `at AX5 amounts wrap below names and nothing truncates`.
- [ ] **Step 2: Run them and see them fail.** Record the counts.
- [ ] **Step 3: Move `useHistoryData`, run History's suites, then build the screen and the tray.**
- [ ] **Step 4: Run them and see them pass,** with History's three suites unchanged.
- [ ] **Step 5: Mutation check.** Filter on the phone instead of in the query: the total test fails. Ignore `?category=`: the R71 test fails. Add a draft's amount to the day total: the draft test fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add Bun Wallet history with search, a filter tray and links by wallet, category and type"`

**Checkpoint E2-B** (controller): Home, the trays, the saved moment, wallets, the record, the conflict panel, History.

---

### Task P2-T29: Categories, the category tray and the Thai pack tray

**Starts after:** P2-T7, P2-T11, P2-T13

**Files:**
- Create: `apps/app/src/screens/redesign/planning/categoryCommands.ts` (moved out of `CategoriesScreen.tsx`: `sendCommand` and `send` with their keys, refusals and conflicts); Modify: `CategoriesScreen.tsx` (no behaviour change)
- Create: `apps/app/src/wallet/categories/WalletCategoriesScreen.tsx`, `categories/CategoryTray.tsx`, `categories/ThaiPackTray.tsx`, `categories/copy.ts`
- Modify: `apps/app/app/spend/categories.tsx` (the wallet area: `WalletCategoriesScreen`)
- Catalogue: `apps/app/src/dev/catalogue/wallet/categorySections.tsx` (`bw-categories`, `bw-category-new`, `bw-category-limit`, `bw-thai-pack`)
- Test: `apps/app/src/wallet/categories/WalletCategories.render.test.tsx`; `CategoriesScreen.render.test.tsx` runs unchanged

**Interfaces:**
- Consumes: `THAI_EVERYDAY_PACK`, `missingPackItems`, `packCommands` (P2-T7, C3 by default); `categoriesModel.ts` (`groupCategories`, `checkLabel`, `readLimit`, `checkLimits`, `budgetReplace`, `newCategoryDraft`, `archiveCommand`); `WalletCategoryIcon`, `CATEGORY_PICKER_GLYPHS`, `useCategoryIcons` (P2-T11); `Tray`, `PrimaryButton` (P2-T13).
- Produces: `useCategoryCommands()` (today's `send(commands, origin)` and its state, moved unchanged); `WalletCategoriesScreen(props: { now?: Date })`; `CategoryTray(props: { visible: boolean; onClose(): void; category: CategoryDto | null; type: CategoryType })`; `ThaiPackTray(props: { visible: boolean; onClose(): void; categories: readonly CategoryDto[] })`; `TRAY_SWATCHES = [0, 4, 5, 2, 3, 6, 8].map((i) => CATEGORY_COLORS[i])`.
- Data bindings (wc-categories, wc-category-edit, wc-thai-pack): back and new; the type segments; the pack card while `missingPackItems(categories)` is not empty (the first three missing names, then `categories.packMore`); the built-in and custom grids of 104 pt tiles with this month's spending against the limit (`งบ {amount}`, `เกิน {amount}` in `over`, or ไม่จำกัด), each labelled as the board labels it; the new tile. `CategoryTray`: name, type (new only), the twelve glyphs at 48 pt, the seven swatches at 44 pt named สีส้มพีช, สีฟ้า, สีม่วงอ่อน, สีชมพู, สีเหลือง, สีเทาฟ้า, สีเทาม่วง (no hex literal in the component), the monthly limit with `categories.limitsTotal` and today's over-total refusal; the icon is kept for the account only after Jotbun accepted the category. `ThaiPackTray`: one 44 pt checkbox row per C3 item with its name and line, `categories.packHave` and disabled for one the person has, the note, and `categories.packAdd` creating only the picked items with `packCommands(categories, locale, newId, { only: picked })`; pack categories show their glyph through `iconFor`, so nothing is kept for them.
- Copy: `categories.title` หมวดหมู่, `categories.expense` รายจ่าย, `categories.income` รายรับ, `categories.packTitle` เพิ่มชุดหมวด, `categories.packName` ชีวิตประจำวันแบบไทย, `categories.packMore` และอีก {n} หมวด, `categories.builtins` หมวดตั้งต้น, `categories.thisMonth` เดือนนี้, `categories.custom` หมวดของคุณ, `categories.limit` งบ {amount}, `categories.over` เกิน {amount}, `categories.unlimited` ไม่จำกัด, `categories.tileLabel` {name} ใช้ไป {spent} จากงบ {limit}, `categories.tileOver` {name} ใช้ไป {spent} เกินงบ {over}, `categories.tileUnlimited` {name} ใช้ไป {spent} ไม่จำกัดงบ, `categories.new` หมวดใหม่, `categories.limitsTotal` วงเงินทุกหมวดรวมกันจะเป็น {total} จากงบ {budget}, `categories.packHeading` ชุดหมวดแบบไทย, `categories.packIntro` หมวดที่ใช้กันทุกวันในไทย เลือกเฉพาะที่ใช่ แล้วเพิ่มทีเดียว, `categories.packPick` เลือกหมวดที่จะเพิ่ม, `categories.packHave` มีแล้ว, `categories.packNote` เพิ่มแล้วเป็นหมวดของคุณเหมือนหมวดอื่น เปลี่ยนชื่อ ไอคอน สี หรือเก็บถาวรได้ทุกเมื่อ, `categories.packAdd` เพิ่ม {n} หมวด; the pack lines `pack.family_out` เงินที่โอนให้พ่อแม่หรือญาติ, `pack.merit` ใส่บาตร ทำบุญที่วัด หรือบริจาค, `pack.delivery` สั่งอาหารผ่านแอป รวมค่าส่ง, `pack.motorbike_rail` วิน BTS และ MRT แยกจากเดินทางอื่น, `pack.topup` เติมเงินหรือจ่ายค่าโทรรายเดือน, `pack.seven` ของกินของใช้จากร้านสะดวกซื้อ, `pack.lottery` สลากงวดวันที่ 1 และ 16, `pack.pets` อาหารและค่าหมอของสัตว์เลี้ยง (draft), `pack.family_in` เงินที่พ่อแม่หรือญาติโอนมาให้ (draft). Default pending owner Q3: built as written; the English lines, and any Thai line marked draft, are drafts for E2-C.

- [ ] **Step 1: Write the failing tests** (both modes and languages): `the grid shows each category's spending against its limit, over in the over colour`; `the pack card names the first three missing C3 items`; `the pack tray adds only the picked missing items, and marks the ones the person has`; `a new category keeps its icon for the account only after Jotbun accepted it`; `a limit that would pass the month's budget is refused in words`; `private mode hides the tiles' amounts`; `every glyph, swatch and checkbox is at least 44 pt and named`.
- [ ] **Step 2: Run them and see them fail.** Record the counts.
- [ ] **Step 3: Move `useCategoryCommands`, run its suite, then build the screen and the two trays.**
- [ ] **Step 4: Run them and see them pass,** with the old suite unchanged.
- [ ] **Step 5: Mutation check.** Create every missing item, not only the picked ones: the pack test fails. Keep the icon before the acknowledgement: the icon test fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add Bun Wallet categories, the category tray and the C3 Thai pack tray"`

---

### Task P2-T30: Budget, the over-budget moment and the budget question

**Starts after:** P2-T9, P2-T10, P2-T13, P2-T14, P2-T18, 1D-T1

**Files:**
- Create: `apps/app/src/screens/redesign/planning/budgetCommands.ts` (moved out of `BudgetScreen.tsx`: `loadMonth`, `readPrefill`, `readExpenses` and `BudgetEditor`'s `send`); Modify: `BudgetScreen.tsx` (no behaviour change)
- Create: `apps/app/src/wallet/budget/budgetQuestion.ts`, `budget/overSeen.ts` (pure), `budget/BudgetQuestion.tsx`, `budget/WalletBudgetScreen.tsx`, `budget/OverBudgetMoment.tsx`, `budget/OverBudgetWatch.tsx`, `budget/copy.ts`
- Modify: `apps/app/app/spend/budget.tsx` (the wallet area: `WalletBudgetScreen`); `apps/app/src/wallet/home/WalletShell.tsx` (one line: `AddTrayHost`'s `onSaved` also calls `useOverBudgetWatch().check(saved)`, inside an `OverBudgetWatch` provider)
- Catalogue: `apps/app/src/dev/catalogue/wallet/budgetSections.tsx` (`bw-budget`, `bw-budget-tight`, `bw-budget-over`, `bw-budget-none`, `bw-over-moment`, `bw-budget-question`)
- Test: `apps/app/src/wallet/budget/budgetQuestion.test.ts`, `budget/overSeen.test.ts` (Node), `budget/WalletBudget.render.test.tsx`; `BudgetScreen.render.test.tsx` runs unchanged

**Interfaces:**
- Produces:
  ```ts
  export { loadMonth, readPrefill, readExpenses };   // moved unchanged
  export type BudgetSetCommand = { month: string; input: SetMonthlyBudgetRequest; existing?: { id: string; version: number } };   // BudgetScreen's local BudgetCommand plus its month, renamed so it never meets categoriesModel's BudgetCommand
  export function wholeMonthBudget(month: string, amountMinor: Minor, existing: BudgetDto | null): BudgetSetCommand;   // the request BudgetEditor sends for a total, keeping an existing budget's category limits
  export function useBudgetCommand(): { status: 'idle' | 'sending' | 'unconfirmed' | 'refused' | 'conflict' | 'done'; message: string | null; send(command: BudgetSetCommand): Promise<boolean>; resend(): Promise<boolean>; reset(): void };
  export function budgetQuestionHint(input: { amountMinor: Minor | null; today: string }): Minor | null;   // the amount ÷ the days in today's month, rounded down to whole satang; null for no amount or zero (R73, W9)
  export const BUDGET_PRESETS_MINOR = ['1000000', '1500000', '1800000'] as const;
  export function BudgetQuestion(props: { step?: { at: number; of: number }; initialMinor: Minor | null; today: string; onAnswer(answer: { kind: 'set'; minor: Minor } | { kind: 'skip' }): void }): JSX.Element;
  export const OVER_SEEN_NAME = 'over-seen';   // device store, a JSON list of '<YYYY-MM>:<categoryId>'
  export function shouldShowOver(seen: readonly string[], month: string, categoryId: string): boolean;
  export function markOverSeen(seen: readonly string[], month: string, categoryId: string): string[];
  export function WalletBudgetScreen(props: { now?: Date }): JSX.Element;
  export function OverBudgetMoment(props: { category: CategoryPace; pace: BudgetPace; onAdjust(): void; onSeeHigh(): void; onLater(): void }): JSX.Element;
  export function OverBudgetWatch({ children }: { children: ReactNode }): JSX.Element;
  export function useOverBudgetWatch(): { check(saved: SavedEntry): void };
  ```
- Analytics (R61): `useBudgetCommand().send` calls `trackBudgetSet({ set: true })` once on the acknowledgement of a budget set (under the carry rule, 1D-T7's call in `BudgetEditor`'s send moves here); the question's and the screen's ยังไม่ตั้ง calls `trackBudgetSet({ set: false })` from its own skip and sends no command.
- Data bindings: `BudgetQuestion` (bw-budget) is the heading, the hint line, the amount on `WalletKeypad`, `budget.perDayHint` from `perDayText(budgetQuestionHint(...))` (฿18,000 in October reads ฿580), the three presets and ยังไม่ตั้ง as 44 pt chips, and a 56 pt round next named `common.next`; P2-T35 uses it as setup step 3, the budget screen in a tray for แก้ไขงบ. `WalletBudgetScreen` (wc-budget): back, the month (`budget.pickMonth`, naming the month shown), แก้ไขงบ, the heading; the card (spent, limit, a `GrowBar` with today's `violet` mark and the month's first and last days under it, and the pace line from `budgetPace().state`: `budget.underPace` on track, `budget.aheadPace` when tight, the over words in `over`); three tiles (left, per day as C4's `perDayMinor`, days left); category limit rows (spent of the limit, `เหลือ` in `under` or `เกิน` in `over`) and the unlimited row; จัดการหมวด (`/spend/categories`). `OverBudgetMoment` (wc-over): kind and factual, never an exclamation mark; the category's bar in `over`; when the month as a whole is still under, `budget.monthStillOk` with the per-day line in `under`; ปรับงบ, ดูรายการที่สูง (`/spend/all?category=<id>`, R71) and ไว้ทีหลัง. `OverBudgetWatch.check`, after an expense save with a category, reads this month's budget and summary, runs `budgetPace`, and when that category is `over` and `shouldShowOver` allows, opens the moment in a `Tray` through `useAddTray().whenClosed` (R69) and marks it seen (W36). It never runs on opening the app.
- Copy: `budget.question` งบใช้จ่ายต่อเดือนเท่าไหร่ดี?, `budget.questionHint` ใส่คร่าว ๆ ก่อนก็ได้ เปลี่ยนทีหลังได้เสมอ, `budget.perDayHint` ประมาณ {amount} ต่อวัน ใช่ไหม?, `budget.notYet` ยังไม่ตั้ง, `budget.title` งบประมาณ, `budget.pickMonth` เลือกเดือน {month}, `budget.edit` แก้ไขงบ, `budget.spent` ใช้ไปเดือนนี้, `budget.limit` งบ, `budget.underPace` ใช้น้อยกว่าอัตราเฉลี่ยของเดือน, `budget.aheadPace` ใช้เร็วกว่าอัตราเฉลี่ยของเดือน (draft), `budget.left` เหลือ, `budget.perDay` เหลือวันละ, `budget.daysLeft` อีก {n} วัน, `budget.categoryLimits` วงเงินหมวดหมู่, `budget.unlimited` ไม่จำกัด, `budget.manageCategories` จัดการหมวด, `budget.overKind` ไม่เป็นไรนะ, `budget.overFact` {category}เกินไป {amount}, `budget.overDaysLeft` ยังเหลืออีก {n} วัน, `budget.monthStillOk` ทั้งเดือนยังอยู่ในงบ, `budget.adjust` ปรับงบ, `budget.seeHigh` ดูรายการที่สูง. Default pending owner Q3: built as written; the English lines, and any Thai line marked draft, are drafts for E2-C.

- [ ] **Step 1: Write the failing tests.**
  ```ts
  test('the question shows the whole-month figure, as bw-budget does (R73)', () => {
    assert.equal(budgetQuestionHint({ amountMinor: '1800000', today: '2026-10-24' }), '58064');
    assert.equal(budgetQuestionHint({ amountMinor: '1800000', today: '2026-11-03' }), '60000');
    assert.equal(budgetQuestionHint({ amountMinor: null, today: '2026-10-24' }), null);
    assert.equal(budgetQuestionHint({ amountMinor: '0', today: '2026-10-24' }), null);
  });
  test('the over moment shows once per category per month', () => {
    assert.equal(shouldShowOver([], '2026-10', 'cat-a'), true);
    assert.equal(shouldShowOver(markOverSeen([], '2026-10', 'cat-a'), '2026-10', 'cat-a'), false);
    assert.equal(shouldShowOver(['2026-10:cat-a'], '2026-11', 'cat-a'), true);
  });
  ```
  `WalletBudget.render.test.tsx` (both modes and languages): `the card says the pace in words and the tiles give what is left, per day and the days left` (wc-budget's ฿5,520, ฿690 and 8); `a category over its limit says เกิน in the over colour, and nothing else is red or green`; `the question's hint follows the amount as it is typed (ประมาณ ฿580 ต่อวัน ใช่ไหม? for ฿18,000 in October)`; `saving a budget sends one budget_set; ยังไม่ตั้ง sends budget_set skipped and no command`; `the over moment is kind, factual and has no exclamation mark`; `a save that takes a category over its limit shows the moment once, and the next save in that category does not`; `ดูรายการที่สูง opens History filtered to the category`; `private mode hides every amount and keeps the pace words`; `every chip, row and button is at least 44 pt`.
- [ ] **Step 2: Run them and see them fail.** Record the counts.
- [ ] **Step 3: Move the budget commands, run their suite, then build.**
- [ ] **Step 4: Run them and see them pass,** with `BudgetScreen.render.test.tsx` unchanged.
- [ ] **Step 5: Mutation check.** Divide by the days left instead of the days in the month: the 24 October case fails. Colour the tiles `under` when tight: the colour test fails. Send `budget_set` before the acknowledgement: the analytics test fails on a refused save.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add the Bun Wallet budget, the kind over-budget moment and the one-question budget"`

---

### Task P2-T31: Insights: three tabs, the info tray, readable bars and the calendar

**Starts after:** P2-T1, P2-T9, P2-T10, P2-T11, P2-T13, 1D-T1

**Files:**
- Create: `apps/app/src/wallet/insights/calendarShade.ts` (pure), `insights/insightsData.ts`, `insights/WalletInsightsScreen.tsx`, `insights/SpendingTab.tsx`, `insights/InOutTab.tsx`, `insights/CalendarTab.tsx`, `insights/MonthBars.tsx`, `insights/InfoTray.tsx`, `insights/copy.ts`
- Modify: `apps/app/app/spend/insights.tsx` (the wallet area: `WalletInsightsScreen`, whatever the `insights` area says)
- Catalogue: `apps/app/src/dev/catalogue/wallet/insightsSections.tsx` (`bw-insights`, `bw-insights-in-out`, `bw-calendar`, `bw-insights-early`, `bw-insights-private`, `bw-insights-large`)
- Test: `apps/app/src/wallet/insights/calendarShade.test.ts` (Node), `insights/WalletInsights.render.test.tsx`

**Interfaces:**
- Consumes: `compareWindow`, `compareBars`, `keptOf`, `topCategories` (`recapModel.ts`); `dayFacts`, `calendarModel`, `readAllPages` (`insightsModel.ts`); `calendarPaint`, `CALENDAR_STEP_LIMITS_BAHT` (P2-T1); `trackInsightsViewed` (1D-T1).
- Produces:
  ```ts
  export function calendarShade(outMinor: Minor): CalendarStep;   // 0 nothing spent; 1 up to ฿200 inclusive; 2 up to ฿500; 3 up to ฿1,000; 4 up to ฿2,000; 5 above
  export type InsightsTab = 'spending' | 'in_out' | 'calendar';   // 1D-T1's tab values (R61)
  export function useInsightsData(month: string, today: string): InsightsLoad;   // the month's summary, each compare month's summary, every page of the month (dayFacts keeps drafts apart); problems in recapProblem's words
  export function WalletInsightsScreen(props: { now?: Date }): JSX.Element;
  export function MonthBars(props: { bars: ReturnType<typeof compareBars>; budgetMinor: Minor | null; hidden: boolean }): JSX.Element;
  ```
- Analytics (R61): choosing a tab, and the first tab shown, call `trackInsightsViewed({ tab })` with an `InsightsTab`, once per change, from the tab rule.
- Data bindings (bw-insights, wc-calendar, es-empty-insights): the heading; three 44 pt tabs (`role="tab"`); the month and `insights.monthly` as text (months only in phase 2). `SpendingTab`: the spent amount at 36 with an `i` `IconButton` opening `InfoTray`, the days-left line, `MonthBars` (six months from `compareBars`, past `barPast`, this month `barNow`, the dashed `guideLine` at the budget; react-native-svg, W4, W24) and the categories with counts and totals, each opening `/spend/all?category=<id>` (R71). `MonthBars` is one accessible element named `insights.chartName`, reading each bar's `compareBars().spoken`, or, in private mode, only the chart's name and the months, with no amount (R65). `InOutTab` (W21, draft): money in (violet, plus), money out (ink), kept or short from `keptOf`, six paired bars. `CalendarTab`: the month with previous and next (next disabled after this month); the month line; Sunday-first initials; 50 pt day buttons with the day number and the day's money out in baht without ฿, shaded by `calendarPaint(calendarShade(out))`, today framed 2 pt in `ink` and named วันนี้, future days drawn and inert; the legend; the chosen day's records below. In private mode every day uses one neutral fill (`raised` with `ink` numbers), drops its amount, and the legend shows its swatches with no values (R65). The early state: fewer than 3 logged days shows the early lines, the logged days, `insights.noPrevious` when no earlier month exists, and the categories so far.
- Copy: `insights.title` สรุป, `insights.tabSpending` ใช้จ่าย, `insights.tabInOut` เงินเข้า-ออก, `insights.tabCalendar` ปฏิทิน, `insights.monthly` รายเดือน, `insights.whatIsThis` ตัวเลขนี้คืออะไร, `insights.spentExplain` ยอดนี้คือรายจ่ายที่บันทึกแล้วในเดือนนี้ ไม่รวมการโอนและรายการที่ยังรอส่ง (draft), `insights.daysToEnd` ใช้ไปแล้ว · อีก {n} วันจบเดือน, `insights.chartName` ใช้จ่ายรายเดือน {from}ถึง{to}, `insights.moneyIn` เงินเข้า (draft), `insights.moneyOut` เงินออก (draft), `insights.monthLine` ใช้ไป {amount} · จด {n} จาก {d} วัน, `insights.today` วันนี้, `insights.earlyTitle` จดอีก {n} วัน กราฟจะขึ้นตรงนี้, `insights.earlyBody` กราฟต้องมีบันทึกอย่างน้อย 3 วัน ถึงจะเทียบกันได้, `insights.noPrevious` ยังไม่มีเดือนก่อนให้เทียบ. Default pending owner Q3: built as written; the English lines, and any Thai line marked draft, are drafts for E2-C.

- [ ] **Step 1: Write the failing tests.** `calendarShade.test.ts`: `['0', '1', '20000', '20001', '50000', '100000', '200000', '200001'].map(calendarShade)` deep-equals `[0, 1, 1, 2, 2, 3, 4, 5]`. `WalletInsights.render.test.tsx` (fakes; both modes and languages): `the spending tab draws six bars, this month in barNow and the others in barPast, with the budget line` (the rendered fills equal the tokens); `the chart is one named element that reads each month's amount`; `in private mode the chart's name carries no amount and the calendar is one neutral fill with no legend values` (R65); `the info button explains the number in a tray`; `each tab is a 44 pt tab and sends insights_viewed with spending, in_out or calendar`; `the in-and-out tab shows money in in violet with a plus`; `the calendar shades each day by its baht step, frames today and leaves future days inert` (3,240 is step 5, 412 step 2, 188 step 1); `a category row opens History filtered to it`; `with two logged days the early state asks for one more day`.
- [ ] **Step 2: Run them and see them fail.** Record the counts.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.** Make ฿200 step 2: the shade test fails. Keep the shades in private mode: the private test fails. Send `tab: 'inOut'`: the analytics test fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add Bun Wallet insights with three tabs, readable bars, an info tray and the calendar"`

---

### Task P2-T32: The month recap

**Starts after:** P2-T9, P2-T10, P2-T11, P2-T13, 1D-T1

**Files:**
- Create: `apps/app/src/screens/redesign/insights/recapData.ts` (moved out of `RecapScreen.tsx`: its load and `share`); Modify: `RecapScreen.tsx` (no behaviour change)
- Create: `apps/app/src/wallet/recap/biggestDay.ts`, `recap/recapShare.ts` (pure), `recap/WalletRecapScreen.tsx`, `recap/Confetti.tsx`, `recap/copy.ts`
- Modify: `apps/app/app/spend/recap/[month].tsx` (the wallet area: `WalletRecapScreen`)
- Catalogue: `apps/app/src/dev/catalogue/wallet/recapSections.tsx` (`bw-recap`, `bw-recap-over`, `bw-recap-private`, `bw-recap-cashback`)
- Test: `apps/app/src/wallet/recap/biggestDay.test.ts`, `recap/recapShare.test.ts` (Node), `recap/WalletRecap.render.test.tsx`; `RecapScreen.render.test.tsx` runs unchanged

**Interfaces:**
- Produces:
  ```ts
  export function useRecapData(month: string, now?: Date): RecapLoad;   // moved unchanged
  export function shareText(message: string): Promise<void>;          // moved unchanged
  export function biggestDay(records: readonly TransactionDto[], month: string): { date: string; outMinor: Minor; payday: boolean } | null;   // most confirmed money out, the earlier day on a tie; payday when that day holds a live income in the built-in salary category
  export function recapShareText(input: { monthLabel: string; daysLogged: string; spentMinor: Minor; budgetMinor: Minor | null; top: readonly { name: string; minor: Minor }[] }, hidden: boolean, t: WalletT): string;   // hidden: no amount at all (D41)
  export const CONFETTI_NAME = (month: string) => `recap-confetti-${month}`;   // device store
  export function WalletRecapScreen(props: { month: string; now?: Date }): JSX.Element;
  export function Confetti(): JSX.Element | null;   // 24 pieces, 1.2 s, palette colours only
  ```
- Analytics (R61): the recap's load, when it first shows a month, calls `trackRecapOpened()` once; `share` calls `trackRecapShared()` after the share sheet resolves.
- Data bindings (bw-recap): close; the month; `recap.title`; `recap.days`; the spent amount with the budget and what is left (`under`) or over (`over`); `recap.biggestDay` from `biggestDay` with `recap.payday`; the top three categories; the cashback card with A5's count only when tips are on (D42: a count, never baht); `recap.share` as the `PrimaryButton`, sharing `recapShareText` through React Native's `Share` (W20; it never says การ์ด). The first opening of a past month's recap on this phone plays `Confetti` and keeps `CONFETTI_NAME(month)`; under reduced motion, and before the phone's answer is known (R66), only the `celebration` haptic plays.
- Copy: `recap.title` สรุปเดือน{month}, `recap.days` จดครบ {n} จาก {d} วัน, `recap.biggestDay` วันที่ใช้มากสุด, `recap.payday` วันเงินเดือนออก, `recap.cashback` {n} รายการเดือนนี้ อาจได้เงินคืนผ่าน GoGoCash, `recap.sister` บริการในเครือ (draft), `recap.share` แชร์สรุป (draft; the board's "แชร์การ์ดสรุป" would promise a card). Default pending owner Q3: built as written; the English lines, and any Thai line marked draft, are drafts for E2-C.

- [ ] **Step 1: Write the failing tests.** `biggestDay.test.ts`: `the biggest day is the most money out, the earlier day on a tie`; `payday is said only when that day holds a salary income`. `recapShare.test.ts`: `the share text names the month, the days logged, the spending and the top categories`; `with private mode on, the share text has no ฿ and none of the amounts` (Review Focus 2). `WalletRecap.render.test.tsx` (both modes and languages): `the recap draws bw-recap's facts from the month`; `the cashback card is a count and shows only when tips are on`; `confetti plays once per month on this phone, never under reduced motion, and never before the phone answers` (`reducedMotion: 'pending'`: no pieces and one celebration haptic, decided at mount); `opening sends one recap_opened, sharing one recap_shared`; `private mode hides every amount`; `the share button never says การ์ด`.
- [ ] **Step 2: Run them and see them fail.** Record the counts.
- [ ] **Step 3: Move the recap data, run its suite, then build.**
- [ ] **Step 4: Run them and see them pass,** with `RecapScreen.render.test.tsx` unchanged.
- [ ] **Step 5: Mutation check.** Leave the spending in the private share text: the share test fails. Play confetti while the answer is pending: its test fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add the Bun Wallet month recap, with a share text that respects private mode"`

**Checkpoint E2-C** (controller): categories and the Thai pack, budget and the over moment, insights, the calendar and the recap.

---

### Task P2-T33: The Face ID lock on a port: the gate, the cover over trays and sheets, the locked screen, setup and the Settings row

**Starts after:** P2-T2, P2-T10, P2-T11, P2-T13

**Files:**
- Create: `apps/app/src/wallet/lock/lockModel.ts` (pure), `lock/localAuthPort.ts`, `lock/LockGate.tsx`, `lock/LockedScreen.tsx`, `lock/LockSetupScreen.tsx`, `lock/LockSettingsRow.tsx`, `lock/copy.ts`
- Modify: `apps/app/src/wallet/WalletRoot.tsx` (`LockGate` outside P2-T10's `PrivateModeProvider`, around the children, only while the `wallet` area is on); `apps/app/src/ui/Sheet.tsx` (while `useLockCover().hidden`, it renders `<LockCoverArt />` in place of its backdrop and panel, R63); `apps/app/src/screens/redesign/account/SettingsScreen.tsx` (one `<LockSettingsRow />` after `<HapticsChoice />`; it renders nothing unless the `wallet` area is on)
- Create: `apps/app/app/settings/lock.tsx` (`LockSetupScreen`, `?setup=1` for the setup step; `<Redirect href="/settings" />` while the area is off)
- Catalogue: `apps/app/src/dev/catalogue/wallet/lockSections.tsx` (`bw-lock-setup`, `bw-lock-setup-unavailable`, `bw-locked`, `bw-locked-fingerprint`, `bw-lock-cover`)
- Test: `apps/app/src/wallet/lock/lockModel.test.ts` (Node), `lock/Lock.render.test.tsx`; `apps/app/src/ui/Sheet.render.test.tsx` gains the cover case

**Interfaces:**
- Produces:
  ```ts
  export type LockMethod = 'face' | 'fingerprint' | 'passcode';
  export type AuthResult = 'success' | 'cancelled' | 'failed' | 'lockout' | 'unavailable';
  export type LocalAuthPort = { availability(): Promise<{ canLock: boolean; method: LockMethod | null }>; authenticate(words: { prompt: string; cancel: string; fallback: string }): Promise<AuthResult> };
  export const noLocalAuth: LocalAuthPort;                 // canLock: false
  export function getAppLocalAuth(): LocalAuthPort;        // noLocalAuth until P2-T34
  export function fakeLocalAuth(results: readonly AuthResult[], availability?: readonly { canLock: boolean; method: LockMethod | null }[]): LocalAuthPort;   // tests: answers in turn, the last repeating
  export type LockView = { locked: boolean; covered: boolean };
  export type LockEvent = { type: 'start' } | { type: 'background' } | { type: 'inactive' } | { type: 'active' } | { type: 'unlocked' } | { type: 'disabled' };
  export function lockReducer(view: LockView, event: LockEvent, enabled: boolean): LockView;
  export const LOCK_NAME = 'lock';  export const LOCK_ANSWERED_NAME = 'lock-answered';   // device store
  export function LockGate(props: { port: LocalAuthPort; children: ReactNode }): JSX.Element;
  export function LockedScreen(props: { method: LockMethod; note: string | null; onUnlock(): void }): JSX.Element;
  export function LockSetupScreen(props: { setup: boolean }): JSX.Element;
  export function LockSettingsRow(): JSX.Element | null;
  ```
- **The order in `WalletRoot`** while the `wallet` area is on: `GestureHandlerRootView > WalletMotionProvider > LockGate > PrivateModeProvider > children` (with the area off, `PrivateModeProvider` sits directly inside `WalletMotionProvider`). The gate wraps P2-T10's provider and every screen because nothing that shows an amount may render above the lock; the gesture root and the motion answer show nothing.
- The rules (W18, R67), with the lock on: `start` locks; `background` covers and locks (no grace time); `inactive` covers only, so the Face ID prompt, which only makes the app inactive, cannot loop; `active` uncovers and leaves a lock in place; `unlocked` unlocks; `disabled` clears both. With the lock off nothing locks or covers.
- `LockGate` follows `AppState` and provides `LockCoverContext` with `{ hidden: locked || covered }`, so every `Tray` and, from this task, every `Sheet` hides its content (R63). While locked it draws `LockedScreen` over the app, which stays mounted (drafts and sync carry on) and is hidden from screen readers; while only covered it draws `LockCoverArt`. For the app switcher and Android recents (default pending owner Q1), this JavaScript cover is the only cover, with no `expo-screen-capture`: iOS's snapshot can race it and Android's recents thumbnail is not covered, and Step 6 records both SKIPPED with that risk. Becoming locked asks for authentication once by itself. `success` unlocks; `cancelled` and `failed` stay locked with `lock.tryAgain`; `lockout` says `lock.lockout`; `unavailable` asks `port.availability()` again before anything else (R67): still able to lock, it stays locked with `lock.tryAgain`; no longer able, it turns the lock off, unlocks and says `lock.turnedOff` once.
- `LockedScreen` (sa-locked): the title, the method's line and main button, and `lock.usePasscode` as a `TextLink` that opens the same system prompt (whose fallback carries that label). `LockSetupScreen` (sa-lock-setup): with `setup`, the step line and a 56 pt next (named `common.next`) back to `/spend/setup`; the question and body named by method; the 44 pt switch row with its line; `lock.changeLater`; a masked card preview (`WalletCard` with `HIDDEN_AMOUNT`). Turning the lock on, and off, each need a successful authentication first. With `canLock: false` the switch stays off and disabled and `lock.needsPasscode` says why (R67). Any answer keeps `lock-answered`. `LockSettingsRow` uses today's Settings parts (the row component `HapticsChoice` sits beside) to say `lock.row` with เปิด or ปิด, opening `/settings/lock`.
- Copy (sa-lock-setup, sa-locked): `lock.step` ตั้งค่า · ขั้นที่ 5 จาก 5, `lock.question` ล็อก Jotbun ด้วย {method} ไหม?, `lock.body` ทุกครั้งที่เปิดแอป ต้องสแกนหน้าก่อนถึงจะเห็นยอดเงินและบันทึก เหมาะเวลายื่นโทรศัพท์ให้คนอื่นดูรูป, `lock.switch` ล็อกด้วย {method}, `lock.fallbackLine` สแกนไม่ผ่าน ใช้รหัสผ่านของเครื่องแทนได้, `lock.changeLater` เปลี่ยนใจได้ทุกเมื่อในการตั้งค่า, `lock.lockedTitle` Jotbun ล็อกอยู่, `lock.lineFace` สแกนหน้าเพื่อเปิดบันทึกของคุณ, `lock.lineFingerprint` สแกนลายนิ้วมือเพื่อเปิดบันทึกของคุณ (draft), `lock.linePasscode` ใส่รหัสผ่านของเครื่องเพื่อเปิดบันทึกของคุณ (draft), `lock.unlock` ปลดล็อกด้วย {method}, `lock.usePasscode` ใช้รหัสผ่าน, `lock.methodFace` Face ID, `lock.methodFingerprint` ลายนิ้วมือ, `lock.methodPasscode` รหัสผ่าน, and drafts: `lock.tryAgain` ลองอีกครั้ง หรือใช้รหัสผ่าน, `lock.lockout` สแกนไม่ผ่านหลายครั้ง ใช้รหัสผ่านของเครื่องแทน, `lock.turnedOff` ปิดการล็อกแล้ว เพราะเครื่องนี้ไม่มีรหัสผ่านหรือ Face ID แล้ว, `lock.needsPasscode` ตั้งรหัสผ่านหรือ Face ID ในการตั้งค่าเครื่องก่อน จึงจะล็อก Jotbun ได้, `lock.row` ล็อกด้วย {method}, `lock.on` เปิด, `lock.off` ปิด. Default pending owner Q3: built as written; the English lines, and any Thai line marked draft, are drafts for E2-D.

- [ ] **Step 1: Write the failing tests.**
  ```ts
  const open: LockView = { locked: false, covered: false };
  test('with the lock on, every app open locks: a cold start and every return from the background', () => {
    assert.equal(lockReducer(open, { type: 'start' }, true).locked, true);
    const away = lockReducer(open, { type: 'background' }, true);
    assert.deepEqual(away, { locked: true, covered: true });
    assert.deepEqual(lockReducer(away, { type: 'active' }, true), { locked: true, covered: false });
  });
  test('inactive only covers, so the Face ID prompt cannot lock again', () => {
    assert.deepEqual(lockReducer(open, { type: 'inactive' }, true), { locked: false, covered: true });
    assert.deepEqual(lockReducer({ locked: false, covered: true }, { type: 'active' }, true), open);
  });
  test('with the lock off nothing locks or covers', () => {
    for (const type of ['start', 'background', 'inactive'] as const) assert.deepEqual(lockReducer(open, { type }, false), open);
  });
  ```
  `lockModel.test.ts` also reads `WalletRoot.tsx`'s source with `readFileSync`, as P2-T18's `spendLayoutOrder.test.ts` reads the layout: `the lock wraps private mode, so nothing that shows an amount renders above it` (the first `<LockGate` comes before the first `<PrivateModeProvider`).
  `Lock.render.test.tsx` (both modes and languages, with `fakeLocalAuth`): `with the lock on, the app opens locked and the app below is hidden from screen readers`; `a successful scan unlocks; a cancel stays locked and says try again`; `a lockout says to use the passcode`; `an unavailable answer re-reads the phone and stays locked while it can still lock`; `when the phone can no longer lock, the lock turns off once and says why`; `an open tray, then a return from the background, shows no tray content` (R63: open a `Tray`, send `background` then `active` through the spied `AppState` listener: `lock-cover` is drawn and the tray's title is gone); `the cover shows no amount and no text` (the JavaScript cover only, default pending owner Q1); `turning the lock on asks to authenticate first and stays off when that fails`; `turning it off asks too`; `a phone without a passcode cannot turn the lock on, and says why`; `Settings shows the lock row only in the wallet area`; `every button and the switch are at least 44 pt`. `Sheet.render.test.tsx`: `a hidden lock cover replaces the sheet's content`.
- [ ] **Step 2: Run them and see them fail.** Record the counts.
- [ ] **Step 3: Implement**, wiring `getAppLocalAuth()` into `LockGate` in `WalletRoot`.
- [ ] **Step 4: Run them and see them pass,** with `SettingsScreen.render.test.tsx` and `Sheet.render.test.tsx` unchanged otherwise.
- [ ] **Step 5: Mutation check.** Give `background` a grace time: the every-open test fails. Turn the lock off on the first `unavailable`: the re-read test fails. Let the Sheet ignore the cover: its test fails. Put `LockGate` inside `PrivateModeProvider`: the order case fails.
- [ ] **Step 6: Device checks, recorded SKIPPED with the risk.** Face ID on a phone; the iOS app switcher snapshot (the cover is drawn by JavaScript on `inactive` and can lose the race with the snapshot); Android recents (not covered at all without `FLAG_SECURE`). Both follow the default pending owner Q1: the JavaScript cover only, no `expo-screen-capture`, recorded SKIPPED with this risk.
- [ ] **Step 7: Gate, receipt, commit.** `git commit -m "Add the Face ID lock on a local-auth port: every open locks, trays and sheets hide under it, setup and the Settings row"`

---

### Task P2-T34: The Face ID adapter on expo-local-authentication

**Starts after:** P2-T33

**Files:**
- Modify: `apps/app/package.json`, `package-lock.json` (`npx expo install expo-local-authentication`; SDK 58 pins `~58.0.2`); `apps/app/app.json` (plugin `["expo-local-authentication", { "faceIDPermission": "Allow $(PRODUCT_NAME) to use Face ID to unlock your diary." }]`; default pending owner Q2: this English draft in `app.json`, with no localized Info.plist strings until the wording is approved)
- Create: `apps/app/src/wallet/lock/expoLocalAuth.ts` (the package through a lazy `import('expo-local-authentication')`, as `src/lib/haptics.ts` loads expo-haptics); Modify: `lock/localAuthPort.ts` (`getAppLocalAuth()` answers `expoLocalAuth` on iOS and Android, `noLocalAuth` on the web)
- Test: `apps/app/src/wallet/lock/expoLocalAuth.test.ts` (Node, the module injected)

**Interfaces:**
- Produces: `createExpoLocalAuth(load: () => Promise<Pick<typeof LocalAuthentication, 'getEnrolledLevelAsync' | 'supportedAuthenticationTypesAsync' | 'authenticateAsync' | 'SecurityLevel' | 'AuthenticationType'>>): LocalAuthPort` (a type-only import of the module) and `expoLocalAuth = createExpoLocalAuth(() => import('expo-local-authentication'))`.
- `availability` reads `getEnrolledLevelAsync()` every time it is asked (no cache, so P2-T33's re-read sees a change, R67): `canLock` at `SecurityLevel.SECRET` or above; `method` is `face` when `supportedAuthenticationTypesAsync()` includes `AuthenticationType.FACIAL_RECOGNITION` and the level is biometric, `fingerprint` for `FINGERPRINT`, else `passcode`. `authenticate` calls `authenticateAsync({ promptMessage, cancelLabel, fallbackLabel, disableDeviceFallback: false })`; `success: true` is `success`; the errors `user_cancel`, `system_cancel`, `app_cancel` and `user_fallback` are `cancelled`, `lockout` is `lockout`, `not_enrolled`, `not_available` and `passcode_not_set` are `unavailable`, every other code is `failed`.

- [ ] **Step 1: Write the failing tests:** `a phone with only a passcode can lock, by passcode`; `Face ID is named when the phone has it`; `availability reads the enrolled level each time`; `each error code maps to its result` (a table of the 14 `LocalAuthenticationError` codes); `the prompt keeps the device fallback on`.
- [ ] **Step 2: Run it and see it fail.** Record the counts.
- [ ] **Step 3: Install, add the plugin and implement.**
- [ ] **Step 4: Run it and the lock suites, and see them pass.**
- [ ] **Step 5: Mutation check.** Pass `disableDeviceFallback: true`: the fallback test fails. Cache the first availability: the each-time test fails.
- [ ] **Step 6: Gate, receipt, commit.** A development build and a phone check are SKIPPED until the owner runs them; localized Face ID strings wait for the owner's wording (default pending owner Q2: the English draft only). `git commit -m "Unlock the Face ID lock through expo-local-authentication, with the passcode as fallback"`

---

### Task P2-T35: First run: welcome, the setup checklist and its steps

**Starts after:** P2-T18, P2-T21, P2-T24, P2-T30, P2-T33, 1C-T9, 1D-T1, 1D-T8

**Files:**
- Create: `apps/app/src/wallet/setup/setupChecklist.ts` (pure), `setup/WelcomeScreen.tsx`, `setup/SetupScreen.tsx`, `setup/SetupCard.tsx`, `setup/LanguageTray.tsx`, `setup/copy.ts`
- Create: `apps/app/app/spend/setup.tsx` (the wallet area: `SetupScreen`; otherwise `<Redirect href="/spend" />`); Modify: `apps/app/app/index.tsx` (the wallet area: `WelcomeScreen`; otherwise today's first run)
- Modify: `apps/app/src/wallet/home/WalletHomeScreen.tsx` (one `<SetupCard />` under the greeting), `apps/app/src/wallet/home/WalletShell.tsx` (one effect: once per install, as soon as the shell is mounted with the consent status settled while setup is unfinished, `router.replace('/spend/setup')` and keep `setup-shown`; settled means the `analytics` area is off, or the status from `useAnalyticsConsent()` is not `loading` and is not `signed_out` while `installed` is true, W34)
- Catalogue: `apps/app/src/dev/catalogue/wallet/setupSections.tsx` (`bw-welcome`, `bw-setup`, `bw-setup-done`, `bw-setup-card`)
- Test: `apps/app/src/wallet/setup/setupChecklist.test.ts` (Node), `setup/Setup.render.test.tsx`

**Interfaces:**
- Consumes: `NewWalletFlow` via `/spend/wallet/new?setup=1` (P2-T21); `BudgetQuestion` and `useBudgetCommand` (P2-T30); `/settings/lock?setup=1` and `LOCK_ANSWERED_NAME` (P2-T33); `createAppReminderService` (`src/notifications/useReminderUpkeep.ts`), `FIRST_REMINDER` and `primingAnswer` (`src/spend/v1/redesign/account/onboardingModel.ts`); `useLanguage` (`src/i18n/LanguageProvider.tsx`); `trackOnboardingStepViewed`, `trackSetupCompleted`, and for the wait test `createAnalytics` and `setAnalytics` (1D-T1); `useAnalyticsConsent()`'s `status` and `installed`, and the `analytics` area (1D-T8).
- Produces:
  ```ts
  export type SetupStep = 'language' | 'wallet' | 'budget' | 'reminder' | 'lock';
  export const SETUP_STEPS: readonly SetupStep[];   // bw-setup's order
  export type SetupFacts = { languageChosen: boolean; walletCount: number; budgetSet: boolean; remindersOn: boolean; answered: ReadonlySet<SetupStep> };
  export function setupProgress(facts: SetupFacts): { steps: readonly { step: SetupStep; done: boolean }[]; current: SetupStep | null; finished: boolean };
  export const SETUP_ANSWERED_NAME = 'setup-answered';  export const SETUP_SHOWN_NAME = 'setup-shown';  export const SETUP_FINISHED_NAME = 'setup-finished';   // device store
  export function WelcomeScreen(): JSX.Element;
  export function SetupScreen(): JSX.Element;
  export function SetupCard(): JSX.Element | null;
  export function LanguageTray(props: { visible: boolean; onClose(): void }): JSX.Element;
  ```
- Steps are done when: language, chosen or answered; wallet, at least one exists; budget, this month has one or ยังไม่ตั้ง was answered; reminder, reminders are on (`getPreference().enabled`) or answered (R60); lock, `lock-answered` is kept.
- The order (W34): bw-welcome, whose two buttons both open `/login` (1C-T9's routes; no `from=onboarding`); then 1C's terms step, which 1C-T9's `TermsGate` shows in place of `CompanionBoundary` while `/v1/me` lists pending policies (1C's K24); then 1D-T8's consent question, which the spend layout shows in place of `WalletShell` while unanswered (P2-T18, R73, R82); then `/spend/setup`; then Home with `SetupCard` until setup is finished. The shell can mount before the question, while the status is still `signed_out` or `loading`, so Home shows for a moment; the redirect waits for a settled status, so setup opens after the answer, or at once when the server already holds one (W34 states the one exception, a relaunch that reaches the layout before analytics is installed). With the server unreachable and no stored answer, the status stays `loading` and the redirect waits; `SetupCard` still offers setup.
- `SetupScreen` (bw-setup): close (to `/spend`); the five rows (done rows ticked, the current one open with its line); `setup.continue` opens the current step (language: `LanguageTray`, ไทย or English through `setPreference`; wallet: `/spend/wallet/new?setup=1`; budget: `BudgetQuestion` in a tray as step 3 of 5, whose `set` answer reads the month with `loadMonth` and sends `wholeMonthBudget(month, minor, existing)` through `useBudgetCommand()`; reminder: in place, below; lock: `/settings/lock?setup=1`); `setup.skip` goes to `/spend` (it skips setup steps, never sign-in, C15). The reminder step builds no screen (R60): its row opens with `setup.reminderLine` and two buttons, `setup.reminderOn`, which runs today's priming (`primingAnswer(await createAppReminderService(locale).setPreference({ ...FIRST_REMINDER }))`; `scheduled` makes the step done, `denied`, `unsupported` and `failed` show today's words for that answer and mark the step answered), and `common.later`, which marks it answered. Opening a step calls `trackOnboardingStepViewed({ step })`; finishing calls `trackSetupCompleted()` once and keeps `setup-finished`.
- `WelcomeScreen` (bw-welcome): the language switch at 44 pt (the board's 36 pt enlarged, §5.3), three fanned sample cards (decorative), the title, body and the no-bank line, `welcome.start` as the `PrimaryButton` and `welcome.signIn` as a `TextLink`, both opening `/login` (or `/spend` when `useAuthGuardSession().isAuthed` is already true).
- `SetupCard`: while setup is unfinished, `setup.cardLine` with `setup.continue`, and a close that hides it until the next launch (memory only), as §5.2 asks.
- Copy (bw-setup, bw-welcome): `setup.title` ตั้งค่า Jotbun, `setup.stepLanguage` ภาษาและรูปแบบวันที่, `setup.stepWallet` กระเป๋าแรกของคุณ, `setup.stepBudget` งบประมาณรายเดือน, `setup.stepReminder` เตือนให้จดทุกวัน, `setup.stepLock` ความเป็นส่วนตัวและ Face ID, `setup.continue` ทำต่อ, `setup.skip` ข้ามไปก่อน เริ่มจดเลย, `setup.reminderLine` บันจะสะกิดเบา ๆ ตอน 20:00 ถ้าวันนั้นยังไม่ได้จด เปลี่ยนเวลาได้ในการเตือน (draft: the board's line promises a time choice that today's priming does not offer), `setup.reminderOn` เปิดการเตือน (draft), `setup.cardLine` ตั้งค่าต่ออีก {n} ขั้น (draft), `welcome.language` ไทย · EN, `welcome.title` ทุกกระเป๋าเงินอยู่ในที่เดียว, `welcome.body` จดง่าย เห็นชัด เป็นส่วนตัว, `welcome.noBank` ไม่ต้องผูกบัญชีธนาคาร, `welcome.start` เริ่มต้นใช้งาน, `welcome.signIn` มีบัญชีแล้ว เข้าสู่ระบบ. Default pending owner Q3: built as written; the English lines, and any Thai line marked draft, are drafts for E2-D.

- [ ] **Step 1: Write the failing tests.**
  ```ts
  const facts = (over: Partial<SetupFacts> = {}): SetupFacts => ({ languageChosen: false, walletCount: 0, budgetSet: false, remindersOn: false, answered: new Set(), ...over });
  test('the checklist walks the five steps in order, and every one can be answered by skipping', () => {
    assert.equal(setupProgress(facts()).current, 'language');
    assert.equal(setupProgress(facts({ languageChosen: true, walletCount: 1 })).current, 'budget');
    assert.equal(setupProgress(facts({ languageChosen: true, walletCount: 1, answered: new Set(['budget', 'reminder', 'lock']) })).finished, true);
  });
  test('a budget set this month and reminders already on finish their steps without an answer', () => {
    assert.equal(setupProgress(facts({ languageChosen: true, walletCount: 1, budgetSet: true, remindersOn: true })).current, 'lock');
  });
  ```
  `Setup.render.test.tsx` (both modes and languages): `welcome's two buttons both open /login, and the language switch is 44 pt`; `setup shows done steps ticked and opens the current one`; `the reminder step turns reminders on with today's priming and finishes the step` (a fake reminder service answers `scheduled`); `ไว้ทีหลัง answers the reminder step`; `skipping goes to Home and leaves the card there until setup is finished`; `the shell opens setup once per install while it is unfinished`; `the setup redirect waits for the consent answer` (`EXPO_PUBLIC_REDESIGN=wallet,analytics` and a controller from 1D-T1's `createAnalytics`, with a null client, an empty store and a server whose `read()` waits for the test, installed with `setAnalytics`, the shell rendered right after `setAnalytics`, then `setAccount(null)` (`signed_out`, installed; a new controller is `loading` until its first `setAccount`, 1D-T1), then `setAccount(A)`, not awaited, while the read waits (`loading`): in both states the shell stays on Home; once the read answers `yes`, it opens `/spend/setup` once); `with the analytics area on and nothing installed, the shell opens /spend/setup at once`; `opening a step sends onboarding_step_viewed with its name, and finishing sends setup_completed once`.
- [ ] **Step 2: Run them and see them fail.** Record the counts.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass,** then the route suites.
- [ ] **Step 5: Mutation check.** Count a skipped wallet step as done: the order test fails. Redirect to setup on every mount: the once-per-install test fails. Redirect while the status is `loading`, or count `signed_out` with analytics installed as settled: the wait test fails. Wait on every `signed_out`, whatever `installed` says: the nothing-installed case fails. Leave the reminder step undone after `scheduled`: its test fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add the Bun Wallet first run: welcome, sign-in, the terms, the consent question, then a five-step checklist that can always be skipped"`

---

### Task P2-T36: D38 reminders on days with nothing logged (no new screen)

**Starts after:** every other build task of this plan (P2-T1 to P2-T35), 1D-T1, and the other session's commit of its weekday reminder work (or this task's Step 0)

**Files:**
- Step 0 only, if that commit has not landed (R60): copy the other session's uncommitted reminder set unchanged from the main checkout, `/Users/kunanonjarat/Developer/jotbun`, into this worktree, as its own commit: `apps/app/src/notifications/reminderWording.ts`, `reminderWording.test.ts`, `reminders.ts` (with `SCHEDULE_SHAPE`), `localReminders.ts`, `localReminders.test.ts`, `notificationsPort.ts`, `useReminderUpkeep.ts`; `apps/app/src/screens/redesign/insights/RemindersScreen.tsx`, `RemindersScreen.render.test.tsx`; `apps/app/src/spend/v1/redesign/insights/remindersModel.ts`, `remindersModel.test.ts`; `apps/app/src/dev/catalogue/insights/remindersSections.tsx`; and the 14 `spendV1Reminder*` entries of `apps/app/src/messages/en.json` and `th.json` (those entries only).
- Create: `apps/app/src/notifications/oneShotPlan.ts` (pure), `apps/app/src/notifications/loggedToday.ts`
- Modify: `apps/app/src/notifications/reminders.ts` (the port gains `scheduleOnce`; the service plans one-shots; `SCHEDULE_SHAPE` becomes `'one-shot-14'`; `setPreference` sends `trackReminderSet`), `notificationsPort.ts` (a DATE trigger), `localReminders.ts` (maps it to `SchedulableTriggerInputTypes.DATE`), `useReminderUpkeep.ts` (passes `isLoggedToday`, the clock, the time zone and the language), `localReminders.test.ts` (the weekly cases become one-shot cases), `apps/app/src/screens/redesign/entry/entrySave.ts` (`finish` calls `void noteRecordSaved(fields.occurredOn)`)
- Test: `apps/app/src/notifications/oneShotPlan.test.ts`, `loggedToday.test.ts`, `localReminders.test.ts`

**Interfaces:**
- Consumes: the committed `reminderContent(locale, weekday)` and `Weekday` (read the commit first and use what it exports; never re-implement the wording); `SpendDiary.loggedDays()` (P2-T4); `trackReminderSet` (1D-T1).
- Produces:
  ```ts
  // oneShotPlan.ts (pure)
  export const ONE_SHOT_DAYS = 14;
  export function oneShotId(date: string): string;   // `gogospend.reminder.once.${date}`
  export type OneShot = { id: string; date: string; weekday: Weekday; hour: number; minute: number };
  export function localDay(now: Date): string;        // the phone's local calendar day, from getFullYear, getMonth and getDate (R68)
  export function planOneShotReminders(input: { today: string; nowMinutes: number; localTime: string; weekdays: readonly Weekday[]; loggedToday: boolean }): OneShot[];   // each of the 14 days from today on a chosen weekday, leaving out today when logged or past its time
  export type PlanKey = { ids: readonly string[]; timeZone: string; locale: string; shape: string };
  export function samePlan(a: PlanKey | null, b: PlanKey): boolean;
  // loggedToday.ts
  export const SAVED_DAY_KEY = 'gogospend.reminder.saved-day';   // AsyncStorage, erased where the planned list is erased
  export function createLoggedToday(deps: { loggedDays(): Promise<readonly string[] | null>; readSavedDay(): Promise<string | null>; today(): string }): () => Promise<boolean>;
  export function noteRecordSaved(date: string, now?: Date): Promise<void>;
  // reminders.ts: ReminderPort gains
  scheduleOnce(id: string, at: { date: string; hour: number; minute: number }, content: ReminderContent): Promise<void>;
  ```
- `isLoggedToday` (R68) is true when the kept saved day equals today, or when the open diary's `loggedDays()` holds today (a confirmed record or a draft dated today); otherwise false. It never reads the server, so an offline save still counts.
- `noteRecordSaved(date, now)`: when `date === localDay(now)`, it keeps `SAVED_DAY_KEY`, cancels that day's one-shot and drops it from the planned list; nothing else. The planner, the mark and `isLoggedToday` all use `localDay` (one date basis, R68).
- The service: `schedule` cancels the old daily id, the seven weekly ids and every id it planned before (`loadPlanned` and `savePlanned` under `gogospend.reminder.planned.v2`, holding the `PlanKey`), then schedules the plan with `scheduleOnce` and each date's weekday wording. `refresh` builds the plan at every launch and every return to the foreground and reschedules when `samePlan` is false: the ids, the time zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`), the reminder language or the shape changed (DATE triggers are fixed instants). `setPreference` is the save rule: when it turns reminders on or changes their time it calls `trackReminderSet({ hour })` once (R60).
- The port sends `{ type: 'date', date: new Date(y, m - 1, d, hour, minute), channelId }` (Android's reminder channel as today), which `localReminders.ts` maps to `{ type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId }` (`DateTriggerInput` in expo-notifications SDK 58).
- Today's Reminders screen is unchanged and gains no line (R73).

- [ ] **Step 0: Only if the other session's commit has not landed:** copy the set above, then run `npm run test:unit -w gogospend-app -- src/notifications src/spend/v1/redesign/insights/remindersModel.test.ts`, `npm run test:render -w gogospend-app -- src/screens/redesign/insights/RemindersScreen.render.test.tsx src/dev/catalogue/CatalogueScreen.render.test.tsx` and `npm run test:unit -w gogospend-app -- src/i18n/catalogs.test.ts`. If any fails, stop and report to the controller; do not fix the other session's work. Otherwise commit `git commit -m "Bring in the weekday reminder wording and its service changes from the other session, unchanged"`.
- [ ] **Step 1: Write the failing tests.**
  ```ts
  const every: Weekday[] = [1, 2, 3, 4, 5, 6, 7];
  test('fourteen days ahead, on the chosen days, at the chosen time', () => {
    const plan = planOneShotReminders({ today: '2026-10-25', nowMinutes: 600, localTime: '20:30', weekdays: every, loggedToday: false });
    assert.equal(plan.length, 14);
    assert.deepEqual([plan[0].id, plan[13].date, plan[0].hour, plan[0].minute], ['gogospend.reminder.once.2026-10-25', '2026-11-07', 20, 30]);
  });
  test('today is left out once something is logged, or once its time has passed', () => {
    assert.equal(planOneShotReminders({ today: '2026-10-25', nowMinutes: 600, localTime: '20:30', weekdays: every, loggedToday: true })[0].date, '2026-10-26');
    assert.equal(planOneShotReminders({ today: '2026-10-25', nowMinutes: 1230, localTime: '20:30', weekdays: every, loggedToday: false })[0].date, '2026-10-26');
  });
  test('the plan crosses a month end and keeps only the chosen weekdays', () => {
    const plan = planOneShotReminders({ today: '2026-10-25', nowMinutes: 0, localTime: '20:00', weekdays: [1, 3, 5], loggedToday: false });
    assert.deepEqual(plan.map((p) => p.date), ['2026-10-26', '2026-10-28', '2026-10-30', '2026-11-02', '2026-11-04', '2026-11-06']);
  });
  test('the day is the phone’s own calendar day', () => {
    assert.equal(localDay(new Date(2026, 9, 25, 0, 30)), '2026-10-25');
  });
  test('a new time zone or language is a new plan, even with the same ids', () => {
    const key = { ids: ['a'], timeZone: 'Asia/Bangkok', locale: 'th', shape: 'one-shot-14' };
    assert.equal(samePlan(key, { ...key }), true);
    assert.equal(samePlan(key, { ...key, timeZone: 'Europe/London' }), false);
    assert.equal(samePlan(key, { ...key, locale: 'en' }), false);
  });
  ```
  `loggedToday.test.ts`: `a draft or a record dated today in the diary counts, offline too`; `today's saved mark counts with no diary open`; `nothing logged answers false`. `localReminders.test.ts`: `turning reminders on schedules one-shot DATE reminders in each day's wording and cancels the old daily and weekly ones`; `a refresh after a record today drops today's reminder only`; `noteRecordSaved cancels today's reminder and no other`; `a time-zone or language change reschedules`; `the next day's launch plans the new fourteenth day`; `a one-shot is a DATE trigger at the local time, on the reminder channel on Android`; `turning reminders on sends one reminder_set with the hour` (`recordAnalytics()`).
- [ ] **Step 2: Run them and see them fail.** Record the counts.
- [ ] **Step 3: Implement** the planner, the logged-today rule, the port, the service change and the save hook's call.
- [ ] **Step 4: Run them and see them pass,** then the Quick add, tray and `RemindersScreen` suites.
- [ ] **Step 5: Mutation check.** Plan 15 days: the first test fails. Cancel every planned reminder on a save: the `noteRecordSaved` test fails. Leave the time zone out of `samePlan`: the new-plan test fails. Read only the server in `isLoggedToday`: the offline test fails.
- [ ] **Step 6: Gate, receipt, commit.** Delivery on a phone is SKIPPED. `git commit -m "Remind only on days with nothing logged: fourteen one-shot reminders in each weekday's words"`

---

### Task P2-T37: The accessibility, dark-mode, private-mode and motion sweep

**Starts after:** P2-T22, P2-T24, P2-T25, P2-T27, P2-T28, P2-T29, P2-T30, P2-T31, P2-T32, P2-T33, P2-T35

**Files:**
- Create: `apps/app/src/wallet/sweep.render.test.tsx`, `apps/app/src/wallet/sweep.test.ts` (Node, source checks)
- Modify: whatever the sweep finds, each fix test-first in the owning task's files

**Interfaces:**
- Consumes: `WALLET_SECTIONS`, `mountWallet`, `AX5`, the palettes.

- [ ] **Step 1: Write the sweep tests.**
  - `sweep.render.test.tsx`, for every section in `WALLET_SECTIONS`, light and dark, `th` and `en`: `every control is at least 44 by 44 pt in its own box` (each element with role button, tab, link, switch, radio or checkbox; `hitSlop` does not count, react-native-web drops it); `with private mode on, no amount reaches the screen or a label` (Review Focus 2: no `฿` followed by a digit, and no `บาท` or `baht` after a number, in `textContent` or any `aria-label`); and at AX5 for screen sections, `nothing is clamped to a line`.
  - `sweep.test.ts` over `src/wallet/**`, skipping `*.test.ts`, `*.test.tsx` and `testing/`: `components take colours from the palettes` (no `#RRGGBB` literal outside `src/theme/walletPalette.ts` and `looks/BunFace.tsx`; Confetti uses palette values); `every entering, exiting or layout animation comes from useWalletMotion` (no import of `FadeIn`, `FadeOut`, `SlideIn*`, `SlideOut*` or `LinearTransition` outside `motion/`); `no wallet screen calls tc() with a string missing from en.json`; `red and green are budget state only` (the `under` and `over` tokens appear only in `WalletText.tsx`, `money/WalletAmount.tsx`, `home/BudgetCard.tsx`, `home/budgetCardWords.ts`, `budget/**`, `categories/**` and `recap/WalletRecapScreen.tsx`).
- [ ] **Step 2: Run them.** Some fail; each failure is a finding. Record them.
- [ ] **Step 3: Fix each finding test-first** in the owning task's files. A finding that is a board decision goes to the receipt as an owner question instead.
- [ ] **Step 4: Run them and see them pass,** then the app gate.
- [ ] **Step 5: Mutation check.** Shrink the tray's close button to 36 pt: the 44 pt sweep fails. Draw one amount without `WalletAmount`: the private sweep fails.
- [ ] **Step 6: Receipt, commit.** The receipt lists §5.3's fixes and where each landed: the neutral saved check (P2-T17), readable insight bars (P2-T1, P2-T31), 44 pt targets (this sweep and each task); `sl-settings`, `sl-done`, `im-pick` and `im-expect` belong to phase 4, `ox-email-deleted` to 1C. `git commit -m "Sweep the Bun Wallet area for 44 pt targets, private mode, colour and reduced motion"`

**Checkpoint E2-D** (controller): first run, the lock, and the dark, AX5 and reduced-motion captures of every wallet section.

---

### Task P2-T38: After E2: route the wallet area, move the copy into the catalogs and switch the routed pack

**Starts after:** P2-T37, and the owner's approval of E2-A, E2-B, E2-C and E2-D

**Files:**
- Modify: `apps/app/src/config/featureFlags.ts` (`'wallet'` joins `APPROVED`), `featureFlags.test.ts`
- Modify: `apps/app/src/messages/en.json`, `th.json` (every approved draft line under a new camelCase `wallet…` key named like the existing keys, the English in `en.json` and the Thai in `th.json`), `apps/app/src/i18n/catalogs.test.ts` (`every wallet line in use is in en.json and th.json`, and `no approved English line takes another key's Thai`)
- Modify: every phase 2 `src/wallet/<area>/copy.ts`, the tables this task moves (each becomes `{ '<area>.<name>': '<English>' }`; a later plan's area still in draft keeps its `{ th, en }` table until its own E2 task, boundaries section 4), `src/wallet/copy/useDraftCopy.ts` (renamed `useWalletCopy.ts`: `useWalletCopy(): WalletT` = `(key, values) => tc(ALL_COPY[key], values)` with `tc` from `useCopy()`, where `ALL_COPY` in a new `src/wallet/copy/allCopy.ts` merges the moved tables, and a later area's table joins it at that area's E2 task), each call site; `draftText.ts` keeps `DraftTable`, `WalletT` and `tableT` as P2-T3 built them, for the areas still in draft and for the pure tests, which read the moved lines' Thai from `src/messages/<locale>.json` through a test helper; `src/wallet/copy/draftText.test.ts` (rewritten only for the tables `ALL_COPY` merges, which it checks as English-only; every other `src/wallet/**/copy.ts`, an area still in draft, keeps P2-T3's `{ th, en }` cases until its own E2 task)
- Modify: `apps/app/src/screens/redesign/planning/CategoriesScreen.tsx` (drops `PACK_BEFORE_C3`, so the routed screen offers C3's nine; its pack test's expected list becomes the nine, W38), `apps/app/src/spend/v1/redesign/planning/thaiPack.ts` (deletes `PACK_BEFORE_C3`, and applies the owner's E2-C rewrite, if any, of `THAI_EVERYDAY_PACK`'s `en` names, Q3, keeping each replaced name as an alias of its item: five of the draft names are also today's routed pack's, so a category made under one must still match, W8) and `thaiPack.test.ts` (drops the before-C3 test; its expected English names follow that rewrite; it gains Step 1's earlier-name case)
- Modify: `docs/implementation/premium-progress.md` (the phase 2 closing receipt with the owner's approval words)

**Interfaces:**
- The call (R75's minor finding on a second lookup): the catalogs keep the app's one lookup, `tc(english)`, as 1C-T9 and 1D's approval commits use it; the wallet layer only maps its keys to English text. `tc()` finds an entry by its English text and the first entry wins (`EN_VALUE_TO_KEY` in `src/i18n/messages.ts`), so a wallet line whose English another entry already has with other Thai would show that entry's Thai: "Back" would render `accountSetupBack`'s ย้อนกลับ instead of the wallet's กลับ, and "Done" `redesignDone`'s เสร็จสิ้น instead of เสร็จ. Such a line gets distinct English, approved at E2 (Q3); Step 1's `no approved English line takes another key's Thai` checks every line of `ALL_COPY`, including the tables later areas add to it.

- [ ] **Step 1: Write the failing tests:** `the wallet area is on by default and -wallet turns it off`; `every wallet line in use is in en.json and th.json, with the same placeholders`; `no approved English line takes another key's Thai` (for every line of `ALL_COPY`, all `en.json` entries with that English have one Thai in `th.json`, since `src/i18n/messages.ts` lets the first key win; so `tc()` shows each wallet line its own Thai, and today's screens keep theirs); `no table ALL_COPY merges holds Thai text any more` (only the moved tables: an area still in draft keeps its `{ th, en }` table, boundaries section 4); `the routed Categories screen offers C3's nine`; and, when E2-C replaced an English pack name, `a person who added the pack under its earlier English name gets no second category` (for each replaced name, `missingPackItems` over a category with that name leaves its item out, and `packKeyOf` still names its key).
- [ ] **Step 2: Run them and see them fail.** Record the counts.
- [ ] **Step 3: Move the copy** with the owner's E2 edits applied (a short Node script under the scratchpad writes the catalog entries from the tables; review its output by hand), switch the hook, switch the pack (with its approved English names, each replaced name kept as an alias) and approve the area.
- [ ] **Step 4: Run them and see them pass,** then the app gate. Every route now shows the Bun Wallet screen by default.
- [ ] **Step 5: Mutation check.** Remove one Thai entry: `catalogs.test.ts` fails. Give `common.back` the English "Back" again: the test that no approved English line takes another key's Thai fails. When a pack name was replaced, drop it from its item's aliases: the earlier-name test fails.
- [ ] **Step 6: Receipt, commit.** The phase 2 proof (§8: the daily loop feels premium on a real phone) is the owner's, on a development build; record it SKIPPED until then. `git commit -m "Switch the app to Bun Wallet after the owner's E2 approval, and move its copy into the catalogs"`

---

## Self-review notes (for the executor)

- **Spec coverage, §8 phase 2:** tokens and materials, P2-T1 and P2-T11; the card stack and trays, P2-T12 to P2-T18; records, P2-T14 to P2-T17 and P2-T25 to P2-T28 (the offline state in P2-T11, P2-T17 and P2-T24); budget, P2-T30; insights, calendar and recap, P2-T31 and P2-T32; the Thai pack, P2-T7 and P2-T29; private mode, P2-T10 and the P2-T37 sweep (D41's share text in P2-T32; reminders carry no amounts, C18); dark mode, the largest text sizes and VoiceOver, P2-T1, every render test, P2-T24's order, P2-T18's Magic Tap and P2-T37; the Face ID lock and D38, P2-T33, P2-T34 and P2-T36; §5.3's fixes, P2-T17, P2-T1, P2-T31 and P2-T37; first open, P2-T35, P2-T30 and P2-T21; C5, P2-T18 and P2-T24.
- **The controller's rulings:** R58 P2-T8, P2-T18; R59 P2-T4, P2-T22, W11; R60 P2-T35, P2-T36, E2-D; R61 Global Constraints, W27, P2-T5, T6, T10, T16, T17, T19, T30, T31, T32, T35, T36; R62 P2-T27, P2-T28; R63 P2-T13, P2-T33; R64 P2-T3, P2-T11, the phase 5 handoff; R65 P2-T17, P2-T31; R66 P2-T2, P2-T9, P2-T32; R67 W18, P2-T33, P2-T34; R68 W19, P2-T36; R69 P2-T13, P2-T16, P2-T30; R70 Shared files, the `Starts after` lines, P2-T24, P2-T28; R71 P2-T28 (P2-T30 and P2-T31 link by category); R72 Global Constraints; R73 W9, W13, W26, W34, P2-T30, P2-T35, P2-T36; R74 W16, W17, W25, W31, the type rule; R75 the task splits, the board prose cut to bindings and copy keys, and the diary SQL rule. R26: Q1 in P2-T33, Q2 in P2-T34 and Q3 in every task with a draft table, each marked "default pending owner Qn", except the implemented P2-T3 and P2-T7, which the Q3 entry covers. R81: W25. R82: P2-T18's consent hole, W34 and P2-T35, whose redirect waits for a settled consent status; W34 states the departures from R73 (Q10): a moment of Home before the question, and the rare relaunch that reaches the layout before analytics is installed, where the checklist can come first. Boundaries A11 (the terms step is 1C's, its K24): Shared files, W34, P2-T18's layout and P2-T35's order put the terms after sign-in and before the consent question.
- **Not in phase 2, on purpose:** photos and the Bun AI screens (phase 3; Tell Bun stays as today inside the tray); slips and statements (phase 4); currencies, trips and D40 (phase 5); the cashback tab, the st-* restyle and the recap image (phase 6); sign-in, devices and D37 (1C); C16's flow and PostHog (1D).
- **Contract fields the boards need that v1 lacks** (C2, phase 5): wallet `type`, `material` and `bun_face`, category `icon` (kept per account, W7), `pack_key` (by name, W8); record `source` arrives in phase 3 (plan P3, W35); a record's time of day (W12) is in no planned change; filtering by several wallets (W16) arrives in phase 5 (plan P5).
