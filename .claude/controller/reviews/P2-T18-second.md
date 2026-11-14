# P2-T18 second review (Claude Sonnet 5.5): the wallet shell, the tab bar, the + and the host mounts

**Reviewed:** `a47a2876` on `p2/t18-wallet-shell`, the head of PR #465 (base `claude/p1a-vault-core`, parent `6961bba1`). The assignment named `179d03cb`; the controller corrected it. The two commits differ only in one wording line of `docs/implementation/receipts/P2-T18.md`. The tree objects of `apps`, `packages`, `package.json`, `package-lock.json` and `scripts` are identical in both (`git rev-parse <commit>:<path>` matches for each), so every local result below is a result for `a47a2876`.

- Range `origin/claude/p1a-vault-core...a47a2876`: 13 files, +1240 -13. `git diff --check` over it: exit 0.
- The 12 code files are byte-identical with the planner's `real/` (`cmp`, 12 of 12). The commit message and its `Claude Haiku 5.5` trailer are as the brief asks.
- No em dash or emoji in the 13 files, and no debug output left in them.
- I read no other review of this task. The worktree stayed clean (`git status` empty). Probes and mutants ran in a scratch copy (`git archive` of those five paths, `node_modules` linked entry by entry, the three workspace links pointed back into the copy); every mutant was restored byte for byte (sha256 compared).

## Verdict basis

No blocker and no major. Four minors and four nits. The privacy chain you asked about holds: I drove the real layout, the real `/spend/add` route and the real `PrivateModeProvider` with private mode on, from the record screen's Copy and from a deep link, and nothing outside the wallet tray draws the copied amount.

The one result that should change what you plan is minor **m1**: by reading the installed React Native, Magic Tap (P12) cannot reach JS on an iOS build of this app. That is a prediction from the source, not something I saw on a phone. It does not make this PR wrong (the code matches the plan and RN's documented prop, the prop is inert where unsupported, the + is the VoiceOver path, and the area is off until P2-T38), but expect the SKIPPED device check to fail and decide what replaces it before E2-B.

Approval stands on CI going green. CI has not started (below).

## CI on PR #465

All 9 jobs are QUEUED at head `a47a2876` (`gh pr checks 465`, `statusCheckRollup`: `Typecheck, unit, API, build`; `Exports (web and iOS bundles)`; `Render (every file but the per-section suites)`; three `Render, per-section suites`; `Edge Worker`; `SQL integration and ops`; `Release image and smoke`). Nothing has run, so I claim nothing from CI. What it must still show:

- **`Typecheck, unit, API, build`:** `typecheck:app` and `typecheck:routes` (two route files change; the implementer's local logs are exit 0 for both), `test:app`, and `test:unit` with the Hermes guard (8 new Node cases; implementer's local run 1117 of 1117).
- **`Exports`:** `export:web` (the layout and `/spend/add` change; the implementer's local export was exit 0) and the iOS export, which no local gate runs. CI cannot show Magic Tap delivery either (m1).
- **`Render (every file but the per-section suites)`:** the shell's 11 cases, the layout's 22, the consent screen's 6, `HistoryReturn` and `QuickAddScreen` (92 together), and the four routes tests (17).
- **The `sections-*`, `edge`, `database` and `image` jobs:** this diff touches nothing they run (everything is under `apps/app`, no catalogue section is added). Expect green.

## What I ran (scratch copy, focused files only, R100)

| Check | Result |
| --- | --- |
| Node: `shellRoutes.test.ts`, `spendLayoutOrder.test.ts` | 8 of 8 pass |
| Render: `WalletShell`, `SpendLayout`, `AnalyticsConsentScreen` | 3 files, 39 of 39 pass |
| Render: `HistoryReturn`, `QuickAddScreen` (the other two importers of the layout and the add route) | 2 files, 92 of 92; 39 + 92 = the receipt's 131 |
| The four routes tests (`SpendRoutes`, `AccountRoutes`, `InsightsRoutes`, `PlanningRoutes`) | 4 files, 17 of 17 |
| Node: Hermes guard; `draftText`, `budgetCardWords`, `homeWallets` | 1 of 1; 18 of 18 |
| Planner mutants (12 of 87): L1 L4b L6b D2 D6 D7 S1 S9 S13 S19 X1 X7 | 12 killed, 0 survived, every failing case an `AssertionError`, every restore equal |
| My mutants on the PR's code (21: M1 to M13, N1 to N6, K3, K3b) | 6 killed, 15 survived: see the findings |
| My probes (5 files, 12 cases, `scratch/p2-t18-second/probes/`) | all pass, and each probe kills the mutant it targets (N3, a double open, no looks provider, no v1 resources) |

Not run, as R100 says (CI's): the full render suite, the workers suite, both exports, the database suites, `test:ops`. The eight kit render files are not needed (no catalogue section is added); the implementer's log has them 142 of 142. The implementer's gate logs in `scratch/p2-t18/` agree with mine where we overlap.

## Findings

### Blocker

None.

### Major

None.

### Minor

**m1. Magic Tap (P12) cannot reach JS on iOS in the installed React Native 0.88.0 (predicted from the source; device check still SKIPPED).**

The shell's root `View` carries `onMagicTap={openAdd}` (`WalletShell.tsx:77`). Reading the installed package, each link of the chain:

1. iOS builds of this app are Fabric only: `node_modules/react-native/scripts/react_native_pods.rb:140-144` sets `fabric_enabled = true`, `RCT_FABRIC_ENABLED` and `RCT_NEW_ARCH_ENABLED` to `1`, and `scripts/cocoapods/new_architecture.rb:167-168` makes `new_arch_enabled` return `true`. (`apps/app/app.json` sets no flag.)
2. The Fabric iOS view answers a Magic Tap only when `_props->onAccessibilityMagicTap` is set (`React/Fabric/Mounting/ComponentViews/View/RCTViewComponentView.mm:1683-1690`). That prop is read from a raw prop named `onAccessibilityMagicTap` (`ReactCommon/react/renderer/components/view/AccessibilityProps.cpp:148-152`, and the name switch at `:228`).
3. JS never sends that name. The iOS view config lists `onMagicTap` (`Libraries/NativeComponent/BaseViewConfig.ios.js:383`, event `topMagicTap` at `:173-175`), and `onAccessibilityMagicTap` appears nowhere in `Libraries` or `src`. The renderer keys the payload by the JS prop name and turns a function into `true` (`Libraries/ReactNative/ReactFabricPublicInstance/ReactNativeAttributePayload.js:78-89` and `:254-292`), so Fabric receives `onMagicTap: true` and its C++ props ignore it.
4. The only native code that reads a prop called `onMagicTap` is the legacy view (`React/Views/RCTView.m:443-444`, `RCTViewManager.m:191`), which a Fabric build does not use for `View`. The `'magicTap'` accessibility action name (`ViewAccessibility.js:149`) is not read by the Fabric view either.

So `accessibilityPerformMagicTap` should return NO and nothing reaches JS. The same scan shows the other iOS-only props this PR uses are fine: `accessibilityShowsLargeContentViewer` and `accessibilityLargeContentTitle` are in the view config (`BaseViewConfig.ios.js:201-202`) and in C++ (`AccessibilityProps.cpp:219-220`), and `aria-valuetext` is handled by `View.js:49,108-114`.

The PR's own case cannot see this: react-native-web drops `onMagicTap`, so `Magic Tap opens the add tray` proves the prop is wired to `openAdd` (by source and by calling the prop from the fiber), not that iOS delivers it. Mutants S13 (which I re-ran) and S15 (the planner's run) are killed for the same reason: they pin the wiring.

Why this stays minor: the code matches the plan's clause and RN's documented prop; the + (60 pt, named, hinted, disabled while blocked) is the VoiceOver path and works; the prop is a no-op where unsupported; the area is off until P2-T38; and no change inside this PR's files can fix it (the options are a native hook, which is new native code and needs the owner, or dropping Magic Tap from P12).

What to do: on a physical iPhone with VoiceOver on, a development build with `EXPO_PUBLIC_REDESIGN=wallet`, focus any element on Insights and two-finger double tap. If the tray does not open, record it and decide before E2-B: (a) accept the + as the only path and drop Magic Tap from the plan; or (b) a small native hook on the root view calling into JS, with the owner's approval. I did not check RN's issue tracker (no network): a later 0.88 patch may already map the name.

**m2. `/spend/add` passes its link through `addRequestOf`, and no test pins that the route does (mutant N3).**

- `apps/app/app/spend/add.tsx:31` is `tray.open(addRequestOf(params))`. Mutant N3 replaces it with `tray.open(params as never)` and passes `SpendLayout.render.test.tsx` 22 of 22 and the shell's 11: the route cases use `type=income` and one `copyOf`, both valid, so raw params look the same. `shellRoutes.test.ts` pins `addRequestOf` (the planner's R10 to R13 are killed in its run), not the route's use of it.
- What the guard protects: a deep link is untrusted text. Probe `probeType` shows what the host does with what `addRequestOf` drops: `type: 'refund'` opens the amount step in a dialog with no accessible name; `type: '__proto__'` names the dialog `[object Object]`; an array `walletId` or a numeric `copyOf` ends in the calm "this entry can't be copied, start a new one" line. No crash, no console error: a robustness pin, not a hole.
- Probe R3 (`probes/probeRoute.render.test.tsx`): `/spend/add?type=refund&amount=999999&walletId=&copyOf[]=a,b&note=x` opens "จดรายจ่าย" at ฿0 with nothing from the link, and it kills N3.
- Fix: add that case (about 12 lines) to `SpendLayout.render.test.tsx` in this PR or the next to touch the file.

**m3. The + button's own look and the bar's icons are unpinned, and in both palettes `primary` equals `ink`, so one slipped word draws an invisible +.**

- `walletPalette.ts`: light `primary: '#111014'` and `ink: '#111014'`; dark `primary: '#F4F2FA'` and `ink: '#F4F2FA'`. `onPrimary` is the contrast colour in each.
- Each of these passes the shell's 11 cases: M1 the glyph's `stroke` as `colors.ink` (`AddButton.tsx:48`; the plan says "a `+` in `onPrimary`"), M4 a 20 pt glyph (`:47`), M12 stroke width 1 (`:48`), M2 the lift kept at night (`:42`), M3 no dimming while disabled (`:43`), and on the bar M5 icons always `ink` (`WalletTabBar.tsx:94`; at the largest text sizes the labels hide and the icon colour is the only selected-versus-quiet cue).
- Pinned today: size, fill (`primary`), place, name and disabled state. Not pinned: the glyph, shadow, dimming and icon colours.
- M1 draws a black + on a black button by day and a white + on a white one at night. The accessible name stays, so no role or name assertion notices. The Global Constraints ask for graphics at 3:1 "held by tests".
- Fix: one case in `WalletShell.render.test.tsx`: the + path's `stroke` is `colors.onPrimary` in both modes, `box-shadow` by day only, `opacity` 0.4 when blocked, and each tab icon's colour follows `selected`.

**m4. Insights' overlap is up to 52 pt, not 18 pt, and its fix should also drop a double inset (named follow-up, P20).**

- `WalletInsightsScreen.tsx:114` pads `insets.bottom + 24`. The + fills 16 to 76 pt above the bar's top (`AddButton.tsx:33-37`). Overlap = 76 - (insets.bottom + 24): 18 pt at a 34 pt inset (the brief's figure), 52 pt on a phone with no bottom inset.
- The bar already takes the phone's inset (`WalletTabBar.tsx:84`), so `insets.bottom` counts it twice. `useWalletTabInset()` (84, or 96 at the largest sizes) replaces the whole `insets.bottom + 24`.
- Deferring is fine: the area is off until P2-T38. Put the 52 pt figure and the double inset in the follow-up. The old R3 Home drawn under the shell has the same + over its last rows until P2-T24 replaces it.

### Nit

**n1. Two small spec values have no pin.** `home.addHint`'s words: K3 (the Thai cut to `แตะสองครั้ง`) passes every test, while an empty hint is caught by `draftText.test.ts` (K3b is killed there). The shell case reads only the key by source regex (`/accessibilityHint=\{t\('home\.addHint'\)\}/`) because react-native-web drops the hint; a Node case importing `COPY` would pin both languages. The two `DECORATIVE` flags (M6 `WalletTabBar.tsx:109`, M7 `AddButton.tsx:46`) also survive; an accessible `Pressable` already groups its children for a screen reader, so they are close to equivalent.

**n2. The one-host check is a text scan for `<AddTrayHost` (`spendLayoutOrder.test.ts:96`).** A host mounted through an alias (`const Host = AddTrayHost; <Host>`, my N6) passes it. Contrived, and it does what the followup asks. By design it skips `src/dev/catalogue/`: `addHostSection.tsx:41` is the one catalogue section with its own host, and the catalogue route sits outside `/spend`, so it is never inside the shell.

**n3. `walletTab`, `walletTabInset`, `WALLET_TAB_ROUTES` and the types live in `home/shellRoutes.ts` (P4a), not in a file the plan names.** `useWalletTabInset` is in `WalletTabBar.tsx`; `WalletShell.tsx` exports only `WalletShell`. The plan's Produces block gives no path, and P6B's plan edits "P2-T18's `WalletTabBar.tsx` and `walletTab`". Say where they are in the P6B, P2-T35 and P2-T24 briefs.

**n4. No test or SKIPPED item says the shell fills the window.** M8 (`flex: 1` removed from the root `View`, `WalletShell.tsx:77`) passes 33 of 33 across the shell and layout suites; happy-dom has no layout engine. M9 to M11 (hairline, bar background, top padding) are cosmetic. Add "the shell fills the window: bar on the bottom edge, + 16 pt above it, toast at the top" to the device list; E2-B's Home capture will show it.

## Your focus list

**The copy route (P13): holds.**
- **Every `/spend/*` route is inside the one host.** The wallet branch wraps the `Slot` (`_layout.tsx:24`). I rendered nine real routes in the real layout on fakes (Home, Insights, History, Wallets, Recently deleted, a record, Budget, Categories, a recap; only the legacy v1 screens stubbed): each has exactly one `wallet-shell`, no `console.error`, no redirect, and the bar and + only on `/spend` and `/spend/insights` (probe `probeRoutes`). The PR's own gate stubs the screens (the routes suite) or uses stand-ins (the shell and layout suites), so none of its cases renders a real route inside the shell.
- **`/spend/add` opens the shell's tray, never Quick add.** `WalletAdd` mounts only where the layout drew the shell (same flags; `ask` replaces the `Slot`; the sign-in redirect and the legacy build come first), so the `useAddTray` fallback cannot push `/spend/add` into a loop. Under StrictMode's double effect it opens once, replaces once and starts one record (probe R1). With a draft paused for an update it opens nothing, replaces once and pushes nothing (R2). With the consent question unanswered it draws no tray; after the answer one opens, and a "no" sends nothing (R4).
- **Private mode, from the record screen.** At this base the record route draws today's R3 `RecordScreen` (P2-T26 is #456, unmerged). Probe A2 with private mode on: its Copy pushes `{ pathname: '/spend/add', params: { copyOf } }`; the route then opens the shell's tray; `add-amount` reads `฿••••` with the label `ซ่อนยอดเงินอยู่`; Quick add is not drawn. Probe A1 scans the whole document, text and every attribute but `style`, on the amount step: no `182`, no merchant, no note. On the confirm step the amount stays masked but the copied merchant and note show. That is P2-T16's rule with the owner's E2-B question still open (followups, #439 m1), and it is inside the wallet look.
- **Not this PR's, but you should know:** until #456 merges, the record route is the R3 screen, which reads no private mode. With private mode on it shows `−฿182.00`, the merchant and the note, in text and in aria-labels (probe A2). R3 Home and History are the same. The same screens drew in the wallet area before this PR; P2-T26, P2-T24, P2-T28 and the P2-T37 sweep own them.

**One host (P14): holds.**
- X1 and X7 are killed by the shell's PROBE-C1 and PROBE-C3 cases (X2 and X3 are the planner's). The Node scan finds `<AddTrayHost` once outside tests, `/testing/` and the catalogue (`WalletShell.tsx:64`). A second host added to any other source file fails the Node case (my N5, a host in the bar file, is killed).
- No route can mount a second host inside the shell without that case failing. No catalogue section can, because `/dev/catalogue` is outside `/spend`. The one gap is the alias (n2).
- Probe `probeLife`: an open tray, the card-frame registry, the toast host and an unstored look change all survive a change of screen in the `Slot`.

**The layout (P5, P6): holds.**
- **Order:** sign-in redirect, legacy build, `ask`, wallet branch, core branch (`_layout.tsx:16-24`). L1, L4b and L6b are killed. `ready` can only go false from a signed-out boot (`sessionMachine.ts`: `hydrate_start` is accepted from `signed_out` only), so the layout never unmounts an open tray for it.
- **`all` now drawing the shell:** `all` already turned the wallet area on for every wallet route (the routes suite's `all` case) and for `WalletRoot`'s lock. A grep of the commit finds no script, workflow or env file that sets `all`: only the catalogue's two message lines, one routes case and historical docs. One layout case changed: `flag on: History is selected on /spend/all and Home navigates back` now names `all,-wallet`, assertions unchanged. In a wallet build History stays reachable through R3 Home's "See all entries" (`HomeScreen.tsx:703`). Nothing that relied on `all` meaning the core look breaks.

**Private mode under the shell (P16): holds.** The shell draws no amount and quotes nothing. `WalletRoot`'s `PrivateModeProvider` wraps the root `Stack` (`app/_layout.tsx`), so what the shell mounts reads it. The toast is masked with no digit in its text or label (the shell's case); `SaveFlight` omits the title when hidden (`SaveFlight.tsx:131`).

**Lifetimes (P8): hold.** The four are mounted once in `WalletShell`; only the bar and the + toggle, nothing above the hosts is conditional. My probe uses a bare provider stack without the harness's own looks and v1 providers (which would otherwise mask the shell's, as the planner noted); it fails when the shell's looks provider (LP10) or its resources (LP11) are removed. LP8 and LP9 survive my probe only because "outside a provider" returns a shared default, so my identity check cannot tell; the PR's own S8 (the planner's run) and S9 (I re-ran it) cases kill them. `HistoryKeepProvider` moved below the diary and the shell; it uses neither.

**Magic Tap and the + (P11, P12): the + holds; Magic Tap is m1.**
- The + is 60 pt; the items are 44 by 56 pt (52 by 64 at AX5). The + is named `จดรายการ`, with its hint, and disabled while blocked (the planner's A1 and S2 to S4 are killed in its run; I re-ran S1).
- The root `View` carries `onMagicTap={openAdd}` and no other file sets `onMagicTap`, so a screen's own handler is asked first by iOS's chain, as P12 says. Whether iOS delivers it at all is m1.

**The inset (P10): holds.** 84, 96 and 0 as built and pinned (the planner's R6 to R9, B15 and B16, killed in its run). The geometry checks: the + spans 16 to 76 pt above the bar, so 84 clears it by 8. Insights is m4.

## Notes for later tasks

- **Merge order is money-visible.** #465 mounts `SavedToastHost` before #464's guards: today's-total races A and B (followups 838 m1, an under- or over-count in the toast) and the iOS private-mode announcement pin (PV1, m2). Keep #464 first. #464 also carries the new-wallet flow's once-only `leave()` that the hidden bar on `/spend/wallet/*` depends on (followups 700 and 701).
- **P2-T38 device list:** put Magic Tap first and expect it to fail (m1). Add the shell fills the window (n4). Keep `aria-valuetext` against iOS's own "tab n of 3" (the brief has it).
- **1C-T9:** the wallet branch is one line (`_layout.tsx:24`), so `<TermsGate>` will conflict textually. Put it between `<DeviceDiaryProvider>` and `<CompanionBoundary>`; the order test then checks it.
- **P6B (widen `walletTab`):** `WalletTabKey` and `WALLET_TAB_ROUTES` are in `shellRoutes.ts`; `ITEMS` and the place count are in `WalletTabBar.tsx` (`home.tabPlace` is a fixed `{n} จาก 3`).
- **P2-T26:** its Copy should call `useAddTray().open({ copyOf })`. The shell's case and my probe A2 show that and the `/spend/add` link both land in the masked tray; opening from `onClosed` (followups 777) still applies.
- **Worth promoting to PR cases:** probe R3 (the hostile link, m2) and probe A1's whole-document scan (it also pins the confirm step's current behaviour for the owner's E2-B question).

## Artefacts

`scratch/p2-t18-second/`: `notes.md`; `linkfarm.sh`; `mymutants.py` with `mymutants-1.out` to `mymutants-5.out` and `mymutant-logs/`; the planner-mutant outputs `mutant-batch-1.out`, `mutant-batch-2.out` and `mutant-logs/`; `probes/` (`probeCopy`, `probeType`, `probeRoute`, `probeLife`, `probeRoutes`, each `.render.test.tsx`); `logs/`. To rerun a probe, copy it into `tree/apps/app/src/wallet/home/` and run `npx vitest run --config vitest.render.config.ts <file>` from `tree/apps/app`.

VERDICT: Approved
