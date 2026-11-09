# Brief P2-T13: The tray, the main button, the text link and the lock cover

You are the implementer for plan P2, Task P2-T13. You add the Bun Wallet's tray (`Tray`: React Native's `Modal` with Reanimated and Gesture Handler, 8 pt from the edges, radius 34, swipe to close, hidden under the lock), its main button (`PrimaryButton`) and text link (`TextLink`), the lock's cover (`src/ui/lockCover.tsx`), the swipe's rule (`trayGesture.ts`) and four catalogue sections. The planner wrote every file below and proved it in a scratch copy of `712574d` (the integration head when this brief was written): RED on typed stubs (4 of 4 Node cases and 16 of 16 render cases fail, each on an assertion), GREEN, 99 mutants (98 killed, 1 equivalent), the focused neighbours, a run over P2-T11's final files (whichever merges first) and the fast local gate of R100. Do exactly what this brief says.

Read first, in this order:

1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. Its R87 note applies (your receipt is its own file, `docs/implementation/receipts/P2-T13.md`; do not edit `premium-progress.md`), and so does R100 (CI runs the whole suites; you run the fast local gate below, and you write no whole-suite total anywhere).
2. The plan task: `docs/superpowers/plans/2026-10-25-jotbun-p2-bun-wallet-core.md`, `### Task P2-T13` (lines 840 to 897), its Global Constraints (lines 82 to 108: the R72 test traps on lines 94 to 99, both modes and both languages on line 106, the pure-module rule on line 107), W3 (line 40), W6 (line 43), Review Focus 1 (line 114) and the Shared files lines for `motion.ts` (line 24) and `Sheet.tsx` (line 29).
3. The boards: `docs/design/bun-wallet/bw-tray-amount.dc.html`, `bw-tray-confirm.dc.html`, `dk-tray-amount.dc.html`, `rh-income.dc.html`, `ax-large-tray.dc.html`, `sa-locked.dc.html` and `bw-style.dc.html`.
4. The receipts this task builds on: `docs/implementation/receipts/P2-T8.md` (how to mount through `mountWallet`), `P2-T9.md` (the builders and `TRAY_EXIT_MS`) and `P2-T10.md` (its note that the tray decides its own buttons).
5. P2-T9's review, `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/P2-T9.md`: its m-2 and its note on two animation systems in one screen (rulings P5 and P6).

## Paths and rules used below

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t13` (branch `p2/t13-tray`, made by the orchestrator from `origin/claude/p1a-vault-core`). Work only here.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t13`, your scratch folder. Create it with `mkdir -p`. Logs and the commit message go there. Never keep anything under `/private/tmp`.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t13-planner`, the planner's folder. Read it and `cp` from it; never write into it. It holds:
  - `real/`: the final version of the eleven files this task creates or changes, at their repo paths;
  - `stubs/`: the RED forms (typed stubs) of `trayGesture.ts`, `Tray.tsx`, `PrimaryButton.tsx`, `TextLink.tsx` and `lockCover.tsx`;
  - `orig/`: the three shared files as they are at `712574d`;
  - `diffs/`: one diff per shared file (`apps_app_src_dev_catalogue_wallet_index.ts.diff`, `apps_app_src_theme_motion.ts.diff`, `apps_app_src_wallet_motion_useWalletMotion.render.test.tsx.diff`), each with the paths `a/<repo path>` and `b/<repo path>`, and `p2-t13.patch`, the whole change, for reading. The planner checked that they turn `orig/` and nothing into `real/` byte for byte;
  - `tools/mutants.py` (the mutant runner) and `tools/prove.sh` (the planner's own stages);
  - `SHA256SUMS` (every file above) and `SHA256SUMS.logs` (the planner's logs in `logs/`: `summary.txt`, `base-*`, `red-*`, `green-*`, `compat-*`, `gate-*`, `mutants.out`, `mutant-logs/`).
- Every shell call starts in a fresh directory, so type full paths. Below, WT, S and PL stand for the full paths above: type the full path. Git: `/usr/bin/git -C WT <command>`, one git command per call. npm: `cd WT && npm run <script>`. Focused Node files: `cd WT/apps/app && npm run test:unit -- <files>`. Focused render files: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts <files>`.
- This task needs no heavy lock: no database suite and no workers pool. Docker is stopped and stays stopped.
- To compare checksums: `shasum -a 256 <file>` and compare with the line for the same path in `PL/SHA256SUMS` (`real/...`, `stubs/...` or `orig/...`).
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests or code to make them pass. The only counts that may differ from this brief's are N and C (Step 1.3), and only as Step 0.2 says.

## Scope

| File | Change |
| --- | --- |
| `apps/app/src/wallet/tray/trayGesture.ts` | **new**, pure ({{LINES real/apps/app/src/wallet/tray/trayGesture.ts}} lines). `TRAY_INSET`, `TRAY_RADIUS`, `shouldDismiss`, exactly the plan's. |
| `apps/app/src/wallet/tray/trayGesture.test.ts` | **new**, Node. 4 cases: the plan's two and two more (ruling P15). |
| `apps/app/src/wallet/tray/Tray.tsx` | **new** ({{LINES real/apps/app/src/wallet/tray/Tray.tsx}} lines). `TrayProps` and `Tray`, exactly the plan's props. |
| `apps/app/src/wallet/tray/PrimaryButton.tsx` | **new** ({{LINES real/apps/app/src/wallet/tray/PrimaryButton.tsx}} lines). `PrimaryButton` and its props type `PrimaryButtonProps`. |
| `apps/app/src/wallet/tray/TextLink.tsx` | **new** ({{LINES real/apps/app/src/wallet/tray/TextLink.tsx}} lines). `TextLink`. |
| `apps/app/src/ui/lockCover.tsx` | **new** ({{LINES real/apps/app/src/ui/lockCover.tsx}} lines). `LockCover`, `LockCoverContext`, `useLockCover`, `LockCoverArt`, exactly the plan's. |
| `apps/app/src/wallet/tray/Tray.render.test.tsx` | **new**, render suite. 16 cases: the plan's nine and seven more (ruling P15). |
| `apps/app/src/dev/catalogue/wallet/traySections.tsx` | **new**, development only. `WALLET_TRAY_SECTIONS`: `bw-tray-short`, `bw-tray-tall`, `bw-tray-large`, `bw-buttons` (rulings P3 and P14). |
| `apps/app/src/dev/catalogue/wallet/index.ts` | **shared** (P2-T8's list). One import and one spread, after `...WALLET_KIT_SECTIONS` (P3). {{LINES orig/apps/app/src/dev/catalogue/wallet/index.ts}} lines before, {{LINES real/apps/app/src/dev/catalogue/wallet/index.ts}} after. |
| `apps/app/src/theme/motion.ts` | **shared** (plan line 24). One place: the last two lines of the comment's second paragraph above `spring` become five (P5). {{LINES orig/apps/app/src/theme/motion.ts}} lines before, {{LINES real/apps/app/src/theme/motion.ts}} after. |
| `apps/app/src/wallet/motion/useWalletMotion.render.test.tsx` | **shared** (P2-T9's test). One place: the case `each call builds its own animation, ...` covers all six builders, both answers (P2-T9's review m-2, ruling P6). {{LINES orig/apps/app/src/wallet/motion/useWalletMotion.render.test.tsx}} lines before, {{LINES real/apps/app/src/wallet/motion/useWalletMotion.render.test.tsx}} after. |
| `docs/implementation/receipts/P2-T13.md` | **new**. Your receipt (R87). |

Not in this task: `tray/copy.ts` (ruling P3); `kitSections.tsx`, `walletHarness.tsx` and its test (P2-T11, being built now, ruling P4); `src/ui/Sheet.tsx` (P2-T33 makes it read the cover); `useWalletMotion.ts`, `walletMotion.ts`, `reducedMotion.tsx`, `GrowBar.tsx` and its test (ruling P6: m-1 stays with P2-T24 or P2-T30); `WalletRoot.tsx`; `registry.tsx`; `en.json` and `th.json` (no copy line is added); any route, the app entry or native code; any package or lockfile; `premium-progress.md`.

## Planner rulings (the calls this brief makes, with the reason for each)

- **P1. The base is `712574d`.** The dispatch named `b4a0811`. `git fetch` found `25a6364` (one controller-state commit, `handover.md` only), where the planner built and first proved the task; after the controller's usage-limit stop the head was `712574d`, which adds P4-T13 (#375), 1B-T8 (#374), P4-T12 (#376) and controller-state commits. `git diff --stat 25a6364 712574d -- apps/app/src/wallet apps/app/src/dev apps/app/src/theme apps/app/src/ui apps/app/src/lib apps/app/src/hooks apps/app/vitest.render.config.ts apps/app/package.json package-lock.json packages` prints nothing (their app changes are `src/slips/`, `app/spend/slips/`, `src/api/sharedV1.ts` and `DeviceDiaryProvider.tsx`). The planner then rebuilt the scratch copy at `712574d` and ran every stage there twice: `PL/logs/round1/` is the first round (three survivors, P17), and `PL/logs/` is the final round, on a fresh copy, after the fixes.
- **P2. Ready.** Starts after P2-T1 (#329, merged `d193a68`), P2-T8 (#365, `1502e65`), P2-T9 (#368, `860990f`) and P2-T10 (#370, `51be132`), all in `712574d`. Reanimated 4.7.1, Worklets 0.13.0 and Gesture Handler 3.3.0 are installed (P2-T2), and the render suite loads them. No package, lockfile change, owner decision, Cloudflare resource or account setting is needed. Nothing here changes a route, the app entry or native code, so there is no `typecheck:routes`, no `export:web` (CI runs it) and no iOS export for the controller.
- **P3. The files that differ from the plan's list.**
  - (a) The four sections go in their own list, `src/dev/catalogue/wallet/traySections.tsx` (`WALLET_TRAY_SECTIONS`), spread after the kit's in `dev/catalogue/wallet/index.ts`, not into `kitSections.tsx`. P2-T11, being built beside this task, rewrites `kitSections.tsx`'s header, imports, section bodies and list end, so any addition there would conflict; `index.ts` itself says each wallet task adds one spread of its own list there, and P2-T11 does not touch it (its brief, "Not in this task"). The catalogue's order is the plan's either way: the kit's sections, then the tray's.
  - (b) `tray/copy.ts` is not created. The plan names no `tray.*` line, and the tray speaks only P2-T3's `common.back` and `common.close` (`src/wallet/common/copy.ts`); an empty draft table would be dead code. The catalogue's sample words are in `traySections.tsx` (`SAMPLES`), catalogue samples and not app copy, so P2-T38 does not move them.
  - (c) Two shared edits the dispatch asked this task to decide: `motion.ts`'s comment (P5) and the m-2 pin (P6).
- **P4. Clear of the work in flight; whichever of this task and P2-T11 merges first.** P2-T11's files (`src/ui/categoryDrawings.ts`, `src/ui/categoryIcons.tsx`, `src/wallet/looks/*`, `src/wallet/card/*`, `walletHarness.tsx` and its test, `kitSections.tsx`) share no file with this task. If P2-T11 merges first, the only differences you see are counts: the harness test has 9 cases, not 6, and its three sections join the catalogue (N and C in Step 1.3). The planner laid P2-T11's final files (`scratch/p2-t11-planner/real/`) over the GREEN copy and ran this task's focused files there: typecheck, the tray and builder files, the harness test and P2-T11's own looks test, and the catalogue's wallet sections all pass (`PL/logs/compat-*`). This task's case on the catalogue order (`ids.slice(0, 2)` and `ids.slice(-4)`) holds either way, and P2-T11's own section case finds its sections by id. P4-T12 (merged), 1B-T8 (merged), 1B-T7 and 1B-T11 (`apps/edge`) and ci-parallel-jobs (`.github/workflows`, `scripts/ci`) touch nothing here. If another merge changes `index.ts`, apply `PL/diffs/apps_app_src_dev_catalogue_wallet_index.ts.diff` (Step 4.1).
- **P5. Two animation systems on one screen (P2-T9's note for this task).** Decision: keep them apart, one system per surface, and change the comment to say so, with the reason. A Sheet opened from a tray (Tell Bun's, P2-T16) renders inside the tray's content (R69), so it is its own Modal presented over the tray. It keeps Sheet's `Animated.spring` slide, and the tray's Reanimated never moves it. The other way, giving Sheet a Reanimated slide inside a tray, is an edit to `src/ui/Sheet.tsx`, which P2-T33 owns and the plan does not give this task. In `motion.ts`, the paragraph above `spring` ended "Never both in one screen: a second animation system in one screen is worse than a slightly less ergonomic API." It now reads (`PL/diffs/apps_app_src_theme_motion.ts.diff`):
  ```
     * Never both on one surface: a second animation system on one surface is
     * worse than a slightly less ergonomic API. The one place both show at once
     * is a kit `Sheet` opened from a wallet tray (Tell Bun's, P2-T16): the Sheet
     * is its own Modal over the tray (`wallet/tray/Tray.tsx`, R69), keeps its
     * `Animated` slide, and the tray's Reanimated motion never moves it.
  ```
  The first and third paragraphs are unchanged, and nothing else in the file changes.
- **P6. P2-T9's review m-2 is pinned here; m-1 is not.** The tray takes `trayExiting`, so, as the dispatch asks, the case `each call builds its own animation, so one part changing its copy never changes another` now walks all six builders under both answers (the review's own loop). It passes before and after this task, since it pins P2-T9's code, which is right. Mutants M1 to M4 (the review's R5 to R8: one shared animation for `trayExiting`, `toastEntering`, `walletAddedEntering` and `stepLayout(false)`) show it bites. m-1, GrowBar's growing path, stays open: the dispatch scopes this task to m-2, nothing here draws a `GrowBar`, and followups.md already gives m-1 to GrowBar's first screen (P2-T24 or P2-T30), where its five cases are ready. The controller can drop m-2 from followups.md and keep m-1.
- **P7. The shape (the boards).**
  - (a) The card: 8 pt from the left and right, and 8 pt plus the bottom safe area from the bottom (`TRAY_INSET + insets.bottom`, so 42 pt on the test phone); radius 34; on `sheet`; padding 18 and gap 12 (bw-tray-amount). The boards' edge: a soft shadow up the page by day (`0px -10px 40px rgba(17, 16, 20, 0.18)`, bw-tray-amount) and a 1 pt light line along the top at night (`inset 0px 1px 0px rgba(255, 255, 255, 0.08)`, dk-tray-amount), as React Native 0.88's `boxShadow` strings.
  - (b) The frame around the card is what follows the finger. It is padded by the top safe area, so a tall tray stops under the status bar, and it has `pointerEvents="box-none"`, so the page around the card still takes the backdrop's taps.
  - (c) At the largest text sizes (`useLargeText()`, a text scale of 1.5 or more) the frame, the card and the scrolling middle grow, so the tray is full height under the top safe area and its footer sits at the bottom (ax-large-tray).
  - (d) The backdrop: ink at 38% by day (bw-tray-amount), black at 60% at night (dk-tray-amount). It is drawn as long as the Modal is (it has no animation of its own), it is decorative, and it is never a tab stop: `tabIndex={-1}`, because react-native-web's Pressable takes `tabIndex` and ignores `focusable={false}`. (Sheet's backdrop has the same gap, which no test sees because no catalogue section shows an open Sheet. That is P2-T33's file; see the notes.)
  - (e) The header row: back (when `onBack` is given), then `header` or the title, then close. Back and close are 44 pt circles on `raised` with a 16 pt ink glyph (`chevron-left`, `close`), as rh-income and ax-large-tray draw close. The boards' 36 pt circle would be under §4's 44 pt (P2-T10's receipt left the tray's buttons to this task). The title is `h2` (18/700, bw-tray-amount), left and wrapping. The row's gap is 10.
  - (f) `footer` is pinned under the scrolling middle (`ScrollView` with `keyboardShouldPersistTaps="handled"`), as `ActionFooter` is. The card sits in a `KeyboardAvoidingView` with `behavior={Platform.OS === 'ios' ? 'padding' : undefined}`, as `EntryPage` does.
  - (g) The card's test id is the `testID` prop, `tray` by default; the backdrop is `tray-backdrop`, the header row `tray-header` and the footer `tray-footer`.
- **P8. Names and focus.**
  - (a) Exactly one named dialog. On the web it is the Modal's own layer, which react-native-web makes `role="dialog"` and `aria-modal` and cannot be told otherwise; the tray names it with the title, as Sheet does. On a phone the card is the dialog (`role="dialog"`, `aria-modal`, `aria-label`, `accessibilityViewIsModal`, `onAccessibilityEscape`).
  - (b) Focus when it opens (`onShow`). On the web the dialog layer takes it (`tabIndex={-1}`). Reanimated's web build keeps a view with an entering animation `visibility: hidden` until its CSS animation starts a frame later, and a browser does not focus a hidden element, while the layer carries the title as its name, so a screen reader says the title. On a phone the title takes it: one accessible header, through `moveAccessibilityFocus` (`AccessibilityInfo.sendAccessibilityEvent(node, 'focus')`). This is Sheet's own split, and the plan's "the title takes focus" holds on both.
  - (c) With `header`, the header takes the title's place in the row, and the title still names the dialog. Screen readers meet it first: an accessible header, 1 by 1 pt and drawing nothing, at the start of the row, which takes the phone's focus (P2-T14's type switch, P2-T16).
  - (d) On the web the title's text is the heading (`accessibilityRole="header"` only there); on a phone the accessible View around it is, so a phone never has a heading inside a heading (react-native-web would draw `<h1>` in `<h1>` if a test made the platform iOS).
  - (e) Under the lock nothing of the tray is named or announced: the web layer loses its name, and the card is gone.
- **P9. Closing (Review Focus 1).** One `requestClose()` serves close, the backdrop, `onAccessibilityEscape`, the Modal's `onRequestClose` (Android's back; Escape on the web) and the swipe. It asks only while `closable = visible && !locked`: never while `locked` (a save in flight), and never once the tray is leaving, so a tap on the page during the exit asks nothing more. While locked, close is disabled (`aria-disabled`, `accessibilityState`, dimmed to 0.4), which is "close says it is unavailable". A swipe past the line asks to close only when `closable`; otherwise the card goes back to its place, so a locked tray never stays pulled down. Back is the host's (`onBack`) and is not disabled by the lock; the plan says close. `onClose` must close the tray (set `visible` false); a host that wants the tray kept open passes `locked`.
- **P10. The exit and `onClosed` (R69).**
  - (a) The Modal is driven by the tray's own `shown`. It opens at once with `visible`. When `visible` turns false, the card unmounts at once and plays `trayExiting(reduced)`, while the Modal, the dimmed page and the dialog stay.
  - (b) The Modal hides after `trayExiting(reduced).getDuration()`: 220 ms (`TRAY_EXIT_MS`), or 150 ms for the fade under Reduce Motion. The time is read from the very builder the card leaves with (Reanimated's public `getDuration()`), so the hide never drifts from the exit, and 150 is not written twice.
  - (c) `onClosed` fires once. On iOS it comes from the Modal's own `onDismiss`: React Native calls that on iOS only, from UIKit's dismissal completion (`RCTModalHostViewComponentView.mm`), and iOS presents no Modal while another is still leaving. Elsewhere it fires right after the hide, since the Modal is gone at once there (React Native's Modal draws nothing on Android once `visible` is false).
  - (d) A tray opened again while it leaves cancels the hide and says nothing. A host keeps the `Tray` mounted until `onClosed`, and opens a second tray from it (P2-T16's `whenClosed`).
- **P11. Motion (P2-T9's builders, W6).**
  - (a) The tray reads the wallet's answer live (`useWalletReducedMotion()`). The card mounts when the tray opens, so its entering follows the answer at that moment; its exit and the hide follow the answer when it closes. The tray itself is mounted long before it opens, so its own mount is the wrong moment to decide.
  - (b) A `step` change plays `motionFor('trayStep', reduced).haptic` through `playHaptic`: a selection tick, the same under Reduce Motion. It plays once per change, only while the tray is open; opening the tray, or opening it at another step, plays none.
  - (c) The content is keyed on `step` and enters with `stepEntering()` (a 150 ms fade, in both modes, P2-T9's P7d). The first step's fade is skipped (`LayoutAnimationConfig skipEntering`), so the content arrives with the card and does not fade in a second time.
  - (d) The card takes `layout={stepLayout(reduced)}`: its height morphs on the gentle spring, or jumps under Reduce Motion.
  - (e) The swipe's way back is the one animation the tray builds itself, since the plan names no builder for it: `withSpring(0, { ...motion.spring.gentle, reduceMotion: ReduceMotion.Never })` at full motion, and a jump under Reduce Motion (W6: the wallet's answer decides, not Reanimated's own setting).
- **P12. The swipe (Gesture Handler 3).** `usePanGesture({ activeOffsetY: 10, failOffsetX: [-20, 20], runOnJS: true, onUpdate, onDeactivate })` on the header row, exactly the plan's. The card's frame follows the finger down only (`Math.max(0, translationY)`, through `useAnimatedStyle(..., [drag])`, R72), closes past `shouldDismiss` and otherwise goes back (P11e). Asked to close, it stays where the finger let it go, so the card's exit starts from there. Opened again, it is back in its place.
- **P13. The lock (R63).** While `useLockCover().hidden` is true, `LockCoverArt` takes the place of the backdrop and the card inside the Modal, which stays shown, and the content unmounts; every step is its host's, so nothing typed is lost. The card goes at once: the uncovered part sits in `LayoutAnimationConfig skipExiting`, so on a phone Reanimated skips the card's exit when the cover replaces it, and the card never shows over the cover (the app-switcher snapshot, Q1). On the web the exit has nothing to draw over. `LockCoverContext`'s default is one constant `{ hidden: false }`. `LockCoverArt` fills its parent (absolute, all edges 0) with `ground`, has no text, is `DECORATIVE` (hidden from screen readers) and has the test id `lock-cover`. It lives in `src/ui/`, since P2-T33's `Sheet` reads it too.
- **P14. The buttons and the sections.**
  - (a) `PrimaryButton`: at least 54 pt (`minHeight`, so the words grow at large text sizes and are never cut), radius 16, `primary` with `onPrimary` words (`body`, 700). By day that is ink with white words, and at night light with ink words (the palette's pair, held to 4.5:1 by `walletPalette.test.ts`). `busy` says `busyLabel` (or keeps `label`), is marked busy and ignores presses. `disabled` is marked, ignores presses and dims to 0.4, as `IconButton` does. There is no spinner: the plan says "busy says its busy label". A pressed button dims to 0.85.
  - (b) `TextLink`: at least 44 by 44 pt in its own box, no fill, the `label` role (15/500, the size of the boards' 44 pt links) in violet by default or ink, named by its words, dimming to 0.6 when pressed. It is a button, since it acts, as the boards' footer links are `<button>`s.
  - (c) The sections: each tray opens at once, so an E2-A screenshot of its section shows it over the page. A text link, `Open the tray`, opens it again after a close. `bw-tray-tall` and `bw-tray-large` are a two-step tray (a list that scrolls under the pinned footer, then a short step with back, whose height follows); `bw-tray-large` carries a long title and its label says to capture it at AX5, since a section cannot set the text size (`useLargeText()` reads the phone's). The titles are `Bun Wallet: tray, short`, `Bun Wallet: tray, tall`, `Bun Wallet: tray, largest text` and `Bun Wallet: main button and text link` (R72: unique, never a heading the section draws). No section imports the harness.
- **P15. The cases beyond the plan's, and the test traps.**
  - (a) `trayGesture.test.ts`: the plan's two, plus `each line is passed, never met: ...` (exactly 120 pt, exactly 60 pt and exactly 900 pt a second do not close; G1 to G3 survive without it) and `what the web drops is wired for a phone: ...`, which reads `Tray.tsx` for `onAccessibilityEscape={requestClose}`, `accessibilityViewIsModal`, `transparent`, `statusBarTranslucent`, the keyboard's `behavior` and `<LayoutAnimationConfig skipExiting>` (R72: react-native-web drops these, so the source is read, as the plan's own `runOnJS` case does).
  - (b) `Tray.render.test.tsx`: the plan's nine (both modes; the named-dialog and header cases in both languages too), plus: the swipe (follows the finger down only, goes back short of the line, closes past it, and is back in its place when opened again; under Reduce Motion it jumps back); the wallet's answer decides the swipe's way back, not Reanimated's own setting (W6, with `<ReducedMotionConfig mode={ReduceMotion.Always} />`, which warns once); full motion (the card springs up, a step change morphs and ticks once, opening ticks nothing); a phone's paths (the title takes focus, and on iOS `onClosed` waits for the Modal's own `onDismiss`); the text link; a header in the title's place; and the catalogue's sections (after the kit's, each tray open at once).
  - (c) Traps, each solved in the file and explained in its header:
    - Reanimated's web entering keeps a view `visibility: hidden` until a CSS `animationstart` that happy-dom never fires, and queries by role skip what is unseen; `startAnimations()` dispatches `animationstart` on such views, as a browser would.
    - Gesture Handler reads no pointer in happy-dom, so the file wraps `usePanGesture` (`vi.mock` of `react-native-gesture-handler`, passing every other export through) to keep the tray's config and call its `onUpdate` and `onDeactivate`.
    - The builders are watched (`vi.mock` of `../motion/useWalletMotion` wrapping `trayEntering`, `trayExiting` and `stepLayout` in `vi.fn` around the real ones), so a case sees which answer the tray asked with; `vi.clearAllMocks()` after each case.
    - A phone's paths set `Platform.OS` to `ios` after the tray mounts (Gesture Handler checks the platform while it renders) and define `AccessibilityInfo.sendAccessibilityEvent`, which react-native-web lacks; both are put back after the case.
    - The mount renders twice at once: the harness's `Dimensions.get` spy returns a new object each time, which `useWindowDimensions` takes as a change, and the second render redraws a view's inline style, so Reanimated's first-render `visibility: hidden` is gone. The first step's own fade is therefore read from its `animation-name` after the mount settles (empty when its entering is skipped, `FadeIn` when not), and a new step's from its `visibility` right after the step changes.
    - `useWindowDimensions()` reads 0 by 0 under `mountWallet` (P2-T8's review note), but the tray reads only `fontScale`, which the harness sets.
    - No case counts the phone's reduced-motion asks (the spy adds them up across mounts).
- **P16. The RED stubs.** `trayGesture.ts` exports `TRAY_INSET = 0`, `TRAY_RADIUS = 0` and a `shouldDismiss` that always says false. `Tray.tsx` has the real `TrayProps` and draws only the title and the content in a transparent Modal (test id `tray`). `PrimaryButton.tsx` (with its props type) and `TextLink.tsx` draw a plain named button. `lockCover.tsx` has the real types and context, a `useLockCover` that never reads the context, and a bare `View` with the test id. `index.ts` and `motion.ts` stay as at the head until GREEN, and `traySections.tsx` is not there yet. `typecheck:app` passes, and every RED failure is an assertion; no module fails to load.
- **P17. 99 mutants: 98 killed, 1 equivalent.** They cover the gesture rule (G), the wiring the web drops (N, through the Node source case), the tray (R, including the plan's three: R1, R2 and R3), the buttons (P, L), the cover (C), the catalogue (K) and P2-T9's builders (M, ruling P6).
  - P10 is equivalent: it takes `aria-disabled` and `accessibilityState.disabled` off `PrimaryButton`, and screen readers are still told, because React Native's `Pressable` merges `disabled` into its accessibility state and react-native-web's writes `aria-disabled` from it. The explicit props stay, as `IconButton` and `PillButton` have them; the 16 cases pass with the mutant.
  - The planner's first round (`PL/logs/round1/`) had two more survivors, now killed. R33, the dialog layer without `tabIndex={-1}`: happy-dom focuses any element, while a browser focuses a `div` only with a tabindex and would then give focus to the decorative backdrop, so the focus case now checks the layer's `tabindex`. R52, the first step without `skipEntering`: the mount redraws the step's inline style at once (P15c), so the case now reads the step's own `animation-name` after the mount settles.
  - R56 (the night's tray with the day's shadow) came with the boards' edge (P7a), added after the first round.
- **P18. The gate (R100).** `typecheck:app`, the focused files RED to GREEN, the focused neighbours, `test:app`, `test:unit` and `git diff --check`. CI runs the full render suite (the catalogue's every-section, screen-reader and large-text suites pick up the four new sections by themselves) and `export:web`. Nothing here changes a route, the app entry or native code, so there is no `typecheck:routes`, `export:web` or iOS export locally. Nothing outside `apps/app` changes, so there is no API, edge or database suite; no package changes, so no `test:ops`.
- **P19. For E2-A (the owner's look at the kit), the differences from the boards:**
  - every header button is a 44 pt `raised` circle (bw-tray-amount and bw-tray-confirm draw 36 pt);
  - the main button is the plan's 54 pt with radius 16 (bw-style draws 52 and 16, the trays 56 and 18);
  - the text link is 15/500 at 44 pt (the footer links on sa-locked, bw-welcome and sa-signout-tray are 16/500 at 48 pt);
  - the title is left-aligned (bw-tray-confirm and sa-signout-tray centre it);
  - bw-tray-amount's Bun face beside the title belongs to the add tray's own `header` (P2-T14, P2-T16);
  - the backdrop comes and goes with the Modal, with no fade;
  - `bw-tray-large` must be captured at AX5;
  - the fades keep Reanimated's default curve (P2-T9's P7f).

---

## Step 0: Sync, and what has merged since `712574d`

1. `/usr/bin/git -C WT fetch origin claude/p1a-vault-core`, then `/usr/bin/git -C WT merge --no-edit origin/claude/p1a-vault-core`. Expected: "Already up to date.", or a fast-forward. Then `/usr/bin/git -C WT rev-parse --short HEAD`, and record it.
2. `/usr/bin/git -C WT diff --stat 712574d HEAD -- apps/app/src/wallet apps/app/src/ui apps/app/src/theme apps/app/src/dev/catalogue/wallet apps/app/src/lib apps/app/src/hooks apps/app/vitest.render.config.ts apps/app/package.json package-lock.json`. Expected: no output, or only P2-T11's files (P4: `apps/app/src/ui/categoryDrawings.ts`, `apps/app/src/ui/categoryIcons.tsx`, files under `apps/app/src/wallet/looks/` and `apps/app/src/wallet/card/`, `apps/app/src/wallet/testing/walletHarness.tsx`, `apps/app/src/wallet/testing/walletHarness.render.test.tsx`, `apps/app/src/dev/catalogue/wallet/kitSections.tsx`).
   - If it lists a file this task creates or builds on, report BLOCKED with the output: anything under `apps/app/src/wallet/tray/`, `apps/app/src/wallet/motion/`, `apps/app/src/wallet/copy/` or `apps/app/src/wallet/common/`, or `apps/app/src/ui/lockCover.tsx`, `apps/app/src/dev/catalogue/wallet/traySections.tsx`, `apps/app/src/wallet/WalletText.tsx`, `apps/app/src/theme/motion.ts`, `apps/app/src/theme/walletPalette.ts`, `apps/app/src/theme/walletType.ts`, `apps/app/src/ui/a11y.ts`, `apps/app/src/ui/Glyph.tsx`, `apps/app/src/ui/largeText.ts`, `apps/app/src/lib/haptics.ts`, `apps/app/src/lib/hapticMoment.ts`, `apps/app/vitest.render.config.ts`, `apps/app/package.json` or `package-lock.json`.
   - If it lists `apps/app/src/dev/catalogue/wallet/index.ts`, go on: Step 4.1 applies the diff there.
   - Any other file (P2-T11's, or another task's under `apps/app/src/wallet/`, `ui/`, `theme/`, `lib/` or `hooks/`): go on. The focused counts this task does not change (the neighbours, the catalogue's wallet sections before GREEN) are then your own Step 1.3 base, and the receipt names each merge.
   - Then run `/usr/bin/git -C WT log --oneline 712574d..HEAD`, and keep the merged PRs it lists for the receipt.
3. The base files:
   - `shasum -a 256 WT/apps/app/src/theme/motion.ts WT/apps/app/src/wallet/motion/useWalletMotion.render.test.tsx` equal their `orig/` lines in `PL/SHA256SUMS`;
   - `shasum -a 256 WT/apps/app/src/dev/catalogue/wallet/index.ts` equals its `orig/` line, unless Step 0.2 listed it;
   - `ls WT/apps/app/src/wallet/tray WT/apps/app/src/ui/lockCover.tsx WT/apps/app/src/dev/catalogue/wallet/traySections.tsx` says "No such file or directory" three times.

   If any differs, report BLOCKED.

## Step 1: Install and the focused base

1. `cd WT && npm ci --ignore-scripts --no-audit --no-fund > S/npm-ci.log 2>&1; echo $?`. Expected: 0 and "added 1416 packages".
2. `cd WT && npm run typecheck:app > S/base-typecheck.log 2>&1; echo $?`. Expected: 0.
3. The focused base (the per-file counts this task's Expected lines build on; R100: no whole-suite count):
   - `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/motion/useWalletMotion.render.test.tsx > S/base-motion.log 2>&1; echo $?`. Expected: 0, `Tests  6 passed (6)`.
   - `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/testing/walletHarness.render.test.tsx src/wallet/WalletRoot.render.test.tsx src/wallet/motion/GrowBar.render.test.tsx src/ui/Sheet.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx > S/base-neighbours.log 2>&1; echo $?`. Expected: 0, `Test Files  5 passed (5)`, `Tests  42 passed (42)` (6 + 8 + 6 + 13 + 9), or 45 if P2-T11 merged first (its harness test has 9 cases). Call this count N; if Step 0.2 listed another merge, N is what you measure.
   - `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "bw-" > S/base-catalogue.log 2>&1; echo $?`. Expected: 0, `Tests  4 passed` (two wallet sections, two suites), or 10 if P2-T11 merged first (five sections). Call this count C. Ignore the `skipped` count: it moves with the head.

## Step 2: The tests and the typed stubs (plan Step 1)

1. Copy:
   ```bash
   mkdir -p WT/apps/app/src/wallet/tray
   cp PL/real/apps/app/src/wallet/tray/trayGesture.test.ts WT/apps/app/src/wallet/tray/trayGesture.test.ts
   cp PL/real/apps/app/src/wallet/tray/Tray.render.test.tsx WT/apps/app/src/wallet/tray/Tray.render.test.tsx
   cp PL/real/apps/app/src/wallet/motion/useWalletMotion.render.test.tsx WT/apps/app/src/wallet/motion/useWalletMotion.render.test.tsx
   cp PL/stubs/apps/app/src/wallet/tray/trayGesture.ts WT/apps/app/src/wallet/tray/trayGesture.ts
   cp PL/stubs/apps/app/src/wallet/tray/Tray.tsx WT/apps/app/src/wallet/tray/Tray.tsx
   cp PL/stubs/apps/app/src/wallet/tray/PrimaryButton.tsx WT/apps/app/src/wallet/tray/PrimaryButton.tsx
   cp PL/stubs/apps/app/src/wallet/tray/TextLink.tsx WT/apps/app/src/wallet/tray/TextLink.tsx
   cp PL/stubs/apps/app/src/ui/lockCover.tsx WT/apps/app/src/ui/lockCover.tsx
   ```
2. `shasum -a 256` the eight files and compare: the `real/` lines for the three tests, the `stubs/` lines for the five others. If a `cp` source is missing or a checksum differs, report BLOCKED.

## Step 3: RED (plan Step 2)

1. `cd WT && npm run typecheck:app > S/red-typecheck.log 2>&1; echo $?`. Expected: 0.
2. `cd WT/apps/app && npm run test:unit -- src/wallet/tray/trayGesture.test.ts > S/red-unit.log 2>&1; echo $?`. Expected: 1, `ℹ tests 4`, `ℹ pass 0`, `ℹ fail 4`, each an `AssertionError [ERR_ASSERTION]`:
   - `a pull of 120 pt, or a quick flick past 60 pt, closes the tray; a pull up never does`: strictly equal, actual `false`, expected `true` (the `121` line);
   - `each line is passed, never met: more than 120 pt, more than 60 pt, faster than 900 pt a second`: strictly equal, actual `false`, expected `true` (the `120.5` line);
   - `the swipe runs on the JS runtime`: `The input did not match the regular expression /runOnJS: true/`;
   - `what the web drops is wired for a phone: the screen reader's escape, the modal card, the Modal, the keyboard and the cover`: `The input did not match the regular expression /^\s+onAccessibilityEscape=\{requestClose\}$/m`.
3. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/tray/Tray.render.test.tsx > S/red-render.log 2>&1; echo $?`. Expected: 1, `Test Files  1 failed (1)`, `Tests  16 failed (16)`, no "Unhandled" section, `grep -c '^AssertionError' S/red-render.log` gives 16 and `grep -cE 'Cannot find module|Failed to resolve|SyntaxError|is not a function' S/red-render.log` gives 0. The sixteen, each on an `AssertionError`:
   - `the tray is a named dialog, 8 pt from the edges, radius 34`: `th light: a dialog named จดรายจ่าย: expected null not to be null`
   - `close and the backdrop close it, and the title takes focus when it opens`: `the dialog: expected null not to be null`
   - `while locked nothing closes it, and close says it is unavailable`: `a button named ปิด: expected null not to be null`
   - `at AX5 it opens full height`: `expected [ '', '', '', '' ] to deeply equal [ '1', '62px', '1', '42px' ]`
   - `under reduced motion a new step shows at once`: `expected '' to be 'hidden'`
   - `the card leaves before the Modal hides, then onClosed fires once`: `reduced motion false: expected null not to be null`
   - `a hidden lock cover replaces the tray's content`: `the lock cover: expected null not to be null`
   - `the main button is 54 pt tall, radius 16, ink with white text in light and light with ink text in dark; busy says its busy label`: `light: expected [ '', '' ] to deeply equal [ '54px', '16px' ]`
   - `every control in the header is at least 44 pt`: `tray-header: expected null not to be null`
   - `the swipe follows the finger down, springs back short of the line, and closes past it`: `the swipe: expected null not to be null`
   - `the wallet's answer decides the swipe's spring back, not Reanimated's own setting (W6)`: `the swipe: expected null not to be null`
   - `at full motion the card springs up, and a step change morphs its height and ticks once; opening ticks nothing`: `expected [] to deeply equal [ false ]`
   - `on a phone the title takes focus, and on iOS onClosed waits for the Modal's own dismissal`: `expected [] to deeply equal [ [ 'focus', 'จดรายจ่าย', 'heading' ] ]`
   - `a text link is at least 44 pt, violet by default or ink, and says its words`: `light: expected [ '', '', '' ] to deeply equal [ '44px', '44px', '' ]`
   - `a header takes the title's place, and screen readers meet the title first`: `the title still names the dialog: expected null not to be null`
   - `the catalogue's tray sections come after the kit's, and each tray opens at once`: `expected [ 'bw-amounts', 'bw-private' ] to deeply equal [ 'bw-tray-short', …(3) ]` (if P2-T11 merged first, the actual list names its sections instead)

   Compare with `PL/logs/red-unit.log` and `PL/logs/red-render.log`.
4. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/motion/useWalletMotion.render.test.tsx > S/red-motion.log 2>&1; echo $?`. Expected: 0, `Tests  6 passed (6)`. The extended case pins P2-T9's code, which is right, so it passes before and after (ruling P6; mutants M1 to M4 show it bites).

## Step 4: GREEN (plan Steps 3 and 4)

1. Copy the code:
   ```bash
   cp PL/real/apps/app/src/wallet/tray/trayGesture.ts WT/apps/app/src/wallet/tray/trayGesture.ts
   cp PL/real/apps/app/src/wallet/tray/Tray.tsx WT/apps/app/src/wallet/tray/Tray.tsx
   cp PL/real/apps/app/src/wallet/tray/PrimaryButton.tsx WT/apps/app/src/wallet/tray/PrimaryButton.tsx
   cp PL/real/apps/app/src/wallet/tray/TextLink.tsx WT/apps/app/src/wallet/tray/TextLink.tsx
   cp PL/real/apps/app/src/ui/lockCover.tsx WT/apps/app/src/ui/lockCover.tsx
   cp PL/real/apps/app/src/dev/catalogue/wallet/traySections.tsx WT/apps/app/src/dev/catalogue/wallet/traySections.tsx
   cp PL/real/apps/app/src/theme/motion.ts WT/apps/app/src/theme/motion.ts
   cp PL/real/apps/app/src/dev/catalogue/wallet/index.ts WT/apps/app/src/dev/catalogue/wallet/index.ts
   ```
   If Step 0.2 listed `index.ts`, use this in place of its `cp`: `/usr/bin/git -C WT apply --3way PL/diffs/apps_app_src_dev_catalogue_wallet_index.ts.diff`. It must apply with no conflict, and `...WALLET_TRAY_SECTIONS,` must come right after `...WALLET_KIT_SECTIONS,`; otherwise report BLOCKED.
2. `shasum -a 256` the eleven files against their `real/` lines in `PL/SHA256SUMS` (all equal; `index.ts` only when it was copied). `/usr/bin/git -C WT status --short` shows exactly ` M apps/app/src/dev/catalogue/wallet/index.ts`, ` M apps/app/src/theme/motion.ts`, ` M apps/app/src/wallet/motion/useWalletMotion.render.test.tsx`, `?? apps/app/src/dev/catalogue/wallet/traySections.tsx`, `?? apps/app/src/ui/lockCover.tsx` and `?? apps/app/src/wallet/tray/` (`M  apps/app/src/dev/catalogue/wallet/index.ts`, staged, if `git apply --3way` wrote it).
3. The code, for reference (read the full files in `PL/real/` before the receipt; their headers say why):
   - `trayGesture.ts`: `TRAY_INSET = 8`, `TRAY_RADIUS = 34`, and `shouldDismiss(translationY, velocityY)` returns `translationY > 120 || (translationY > 60 && velocityY > 900)`.
   - `lockCover.tsx`: `LockCoverContext = createContext<LockCover>(UNCOVERED)` (`{ hidden: false }`), `useLockCover()` reads it, and `LockCoverArt` is a `DECORATIVE` `View` with the test id `lock-cover`, absolute on all four edges, on `ground`.
   - `Tray.tsx`: the rulings P7 to P13, in this order in the file: `shown` (the Modal) and the hide's timer from `trayExiting(reduced).getDuration()`; `closable` and `requestClose`; the step tick; the swipe (`drag`, `follow`, `usePanGesture`); the focus target; the names; then the Modal (`transparent`, `animationType="none"`, `statusBarTranslucent`, `onRequestClose`, `onShow`, iOS's `onDismiss`) holding `GestureHandlerRootView`, then either `LockCoverArt` or `LayoutAnimationConfig skipExiting` > `KeyboardAvoidingView` > the backdrop and the frame > the card (entering, exiting, layout) > the header row in its `GestureDetector`, the `ScrollView` with the keyed step content in `LayoutAnimationConfig skipEntering`, and the footer.
   - `PrimaryButton.tsx` and `TextLink.tsx`: ruling P14.
   - `traySections.tsx` and `index.ts`: rulings P3 and P14.
   - `motion.ts`: ruling P5 (`PL/diffs/apps_app_src_theme_motion.ts.diff`).
4. `cd WT && npm run typecheck:app > S/green-typecheck.log 2>&1; echo $?`. Expected: 0.
5. `cd WT/apps/app && npm run test:unit -- src/wallet/tray/trayGesture.test.ts > S/green-unit.log 2>&1; echo $?`. Expected: 0, `ℹ tests 4`, `ℹ pass 4`, `ℹ fail 0`.
6. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/tray/Tray.render.test.tsx src/wallet/motion/useWalletMotion.render.test.tsx > S/green-render.log 2>&1; echo $?`. Expected: 0, `Test Files  2 passed (2)`, `Tests  22 passed (22)` (16 + 6), each case marked `✓`, and `grep -c '^stderr |' S/green-render.log` gives 0. Its stderr lines are only the notices the base logs carry too (Vite's config-loader notice, the sourcemap notices for `expo-status-bar` and Node's `ExperimentalWarning: localStorage ...`): no `act(...)` warning and no `console.error`. The W6 case's Reanimated warning is silenced by its own spy.
7. The neighbours, unchanged: the Step 1.3 neighbours command with `S/green-neighbours.log`. Expected: 0, `Tests  N passed (N)` (42 at `712574d`).
8. The catalogue's wallet sections: the Step 1.3 catalogue command with `S/green-catalogue.log`. Expected: 0, `Tests  C + 8 passed` (12 at `712574d`: six sections, two suites; 18 if P2-T11 merged first). Then the registry's rule: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx -t "registry has a section" > S/green-registry.log 2>&1; echo $?`. Expected: 0, `Tests  1 passed`.

## Step 5: Mutation check (plan Step 5)

1. `python3 -I PL/tools/mutants.py WT S/mutant-logs > S/mutants.out 2>&1; echo $?`. It applies each mutant alone, runs its suite (the Node file for G1 to G8 and N1 to N7; the tray's render file for G9, G10, R, P, L, C and K; the builders' render file for M), and restores the file with its SHA-256 checked. It takes ten to twenty minutes, by the machine's load. Expected: exit 0, and these 100 lines (each line in your file also gives its suite's counts, the AssertionError count and "restored sha256 equal"; compare with `PL/logs/mutants.out`):
   ```
{{MUTANT_LINES}}
{{MUTANT_SUMMARY}}
   ```
   R1, R2 and R3 are the plan's three mutants. M1 to M4 are P2-T9's review R5 to R8 (ruling P6).
2. `shasum -a 256` the eleven files against `real/` again, and run `/usr/bin/git -C WT status --short`. Expected: unchanged from Step 4.2, and `WT/apps/app/src/wallet/motion/useWalletMotion.ts` is still its `712574d` self: `/usr/bin/git -C WT diff --stat -- apps/app/src/wallet/motion/useWalletMotion.ts` prints nothing.

## Step 6: The fast local gate (R100)

From WT, in this order, each with its log in S:

1. `npm run typecheck:app`: exit 0.
2. `npm run test:app`: exit 0, `ℹ fail 0`. (No count is expected here: CI holds the whole suites, R100.)
3. `npm run test:unit`: exit 0, `ℹ fail 0`.
4. The focused files once more: Step 4.5 (`ℹ pass 4`, `ℹ fail 0`) and the render command of Step 4.6 with the five neighbours added, `src/wallet/testing/walletHarness.render.test.tsx src/wallet/WalletRoot.render.test.tsx src/wallet/motion/GrowBar.render.test.tsx src/ui/Sheet.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx`: exit 0, `Test Files  7 passed (7)`, `Tests  22 + N passed` (64 at `712574d`). A case that times out near 5 s in a file this task does not touch is a load flake: rerun that file alone once, record both runs, and do not change it.
5. `/usr/bin/git -C WT diff --check` (before the commit) and, after it, `/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD`: no output.

Not run, and why (put this in the receipt): the full render suite and `export:web` (CI, R100; the catalogue's every-section, screen-reader and large-text suites pick up the four sections there); `typecheck:routes` and the iOS export (no route, app entry or native change); `test:ops` (no package or lockfile change); the API, edge and database suites (nothing outside `apps/app` changes; Docker is stopped); and device and simulator checks, all SKIPPED: the swipe on a phone, the exit and `onDismiss` on iOS, the keyboard on iOS and Android, VoiceOver landing on the title (and on the unseen title with a header), Android's back button, the cover replacing a tray with no flash of its exit, and E2-A's screenshots (the controller's, after this task).

## Step 7: Receipt

Write `docs/implementation/receipts/P2-T13.md` in the house style (see `docs/implementation/receipts/P2-T9.md`), with your own numbers where they differ from these. Start from:

```markdown
# P2-T13: The tray, the main button, the text link and the lock cover

- **Status:** built and verified locally on `p2/t13-tray` (`.claude/worktrees/p2-t13`), from `<head>`. Not pushed. The independent review is the controller's, after this receipt. Under ruling R87 this receipt is its own file; `premium-progress.md` is not edited.
- **Base:** `<head>`. (The brief was proven at `712574d`. If your head is later, name each merged PR from `git log --oneline 712574d..HEAD`, and say whether P2-T11 merged first.)
- **Files:** created `apps/app/src/wallet/tray/trayGesture.ts`, `trayGesture.test.ts` (4 cases), `Tray.tsx`, `PrimaryButton.tsx`, `TextLink.tsx`, `Tray.render.test.tsx` (16 cases), `apps/app/src/ui/lockCover.tsx`, `apps/app/src/dev/catalogue/wallet/traySections.tsx` and this receipt; modified `apps/app/src/dev/catalogue/wallet/index.ts` (one import, one spread), `apps/app/src/theme/motion.ts` (the comment above `spring`) and `apps/app/src/wallet/motion/useWalletMotion.render.test.tsx` (the own-animation case covers all six builders).
- **What changed:** (the tray: shape, names and focus, one requestClose and the lock, the exit and onClosed, motion and the swipe, the cover; the two buttons; the cover; the sections; the two shared edits.)
- **RED to GREEN:** ... (Steps 3 and 4: the 4 and 16 failing cases and their messages; the builders' file passing by design; GREEN counts; the neighbours unchanged; the catalogue's wallet sections.)
- **Mutation check:** 99 mutants, 98 killed, 1 equivalent (P10, and why) ... (one line per group, with the case that kills it; R1 to R3 are the plan's; M1 to M4 are P2-T9's review m-2.)
- **Gate** (worktree root): ... (Step 6, each command with its result; no whole-suite count, R100.)
- **Deviations:** the four sections in `traySections.tsx` and `index.ts`, not `kitSections.tsx` (ruling P3a); no `tray/copy.ts` (P3b); `motion.ts`'s comment (P5); the m-2 pin (P6); the calls the plan leaves open (P7 to P14); the cases beyond the plan's (P15); the E2-A differences from the boards (P19).
- **SKIPPED:** the full render suite and `export:web` (CI); `typecheck:routes` and the iOS export (no route, app entry or native change); `test:ops`; the API, edge and database suites; device and simulator checks (Step 6).
- **Notes for later tasks:**
  - P2-T14, P2-T16 and every tray host: keep the `Tray` mounted until `onClosed`, and open a second tray from it (P2-T16's `whenClosed`). `onClose` must close the tray; to keep it open, pass `locked`. Under the lock its children unmount, so a host keeps its steps and drafts in its own state.
  - P2-T16: a Sheet opened from the tray renders inside its content. On the web every Modal is its own layer under `document.body`, and only the top one is `role="dialog"`, so "the sheet's dialog is a descendant of the tray's dialog" cannot be checked through the DOM. Check it through the tray: closing it, or covering it, takes the sheet away with its content. Escape on the web closes only the top Modal.
  - P2-T16 and P2-T33: `Sheet` decides its motion from `src/hooks/useReducedMotion.ts`, not the wallet's answer, so a Sheet opened before the phone answers runs at full motion inside a tray that reads as reduced (R66).
  - P2-T33: `LockGate` provides `LockCoverContext`; `Sheet` reads `useLockCover()` as the tray does. Sheet's backdrop is a tab stop on the web (react-native-web's Pressable ignores `focusable={false}`; the tray passes `tabIndex={-1}`).
  - P2-T17: `TextLink`'s tones are violet and ink; the toast's Undo needs `toastLink`, which P2-T17 adds as a third tone.
  - Tests of a tray's content by role fire `animationstart` on the views Reanimated keeps unseen, as `Tray.render.test.tsx`'s `startAnimations()` does, or query by text or test id. A tray's swipe is driven through `usePanGesture`'s config, as that file does.
  - With a `header`, the title still names the dialog and is the row's first element for screen readers.
```

## Step 8: Commit

1. `/usr/bin/git -C WT add apps/app/src/wallet/tray/trayGesture.ts apps/app/src/wallet/tray/trayGesture.test.ts apps/app/src/wallet/tray/Tray.tsx apps/app/src/wallet/tray/PrimaryButton.tsx apps/app/src/wallet/tray/TextLink.tsx apps/app/src/wallet/tray/Tray.render.test.tsx apps/app/src/ui/lockCover.tsx apps/app/src/dev/catalogue/wallet/traySections.tsx apps/app/src/dev/catalogue/wallet/index.ts apps/app/src/theme/motion.ts apps/app/src/wallet/motion/useWalletMotion.render.test.tsx docs/implementation/receipts/P2-T13.md`
2. `/usr/bin/git -C WT status --short`: those twelve staged, nothing else (no log, no `dist/`).
3. Write the message to `S/commit-message.txt`:
   ```
   Add the Bun Wallet tray: inset 8 pt, radius 34, swipe to close, hidden under the lock

   Add the Bun Wallet's tray, a React Native Modal that floats 8 pt in from
   the edges with radius 34 and is full height at the largest text sizes. One
   close rule serves close, the backdrop, the screen reader's escape, the
   system back and the swipe, and does nothing while a save is in flight. The
   card leaves before the Modal hides, then onClosed fires once, and the lock's
   cover replaces it at once. Add the main button, the text link, the lock
   cover and their catalogue sections, and pin that every motion builder
   builds a new animation per call.

   Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
   ```
4. `/usr/bin/git -C WT commit -F S/commit-message.txt`, then `/usr/bin/git -C WT log --oneline -1` and `/usr/bin/git -C WT show --stat HEAD`: 12 files.

## Your final message

As the protocol says: `STATUS: DONE` (or `STATUS: BLOCKED` with the exact blocker) on the first line; the commit SHA and branch; files changed; RED and GREEN counts; mutants (98 killed, P10 equivalent and why); each gate command with its result (no whole-suite count, R100); SKIPPED items; deviations (P3, P5, P6, P15, P19); and what the reviewer should look at first: the exit and `onClosed` (P10, including iOS's `onDismiss`), focus and names on the web and on a phone (P8), the lock's cover and the skipped exit (P13), the swipe and its way back (P11e, P12), the test traps (P15c), and the two shared edits (P5, P6).
