# Brief P2-T12: The card stack and card frames

You are the implementer for plan P2, Task P2-T12. You add the Bun Wallet's card stack (`CardStack`: the wallet cards 54 pt apart with the front card whole, a one-column list of spine cards at the largest text sizes, and a press that ticks, lifts the card 12 pt and opens the wallet at once), the cards' frames for the saved moment's flight (`cardFrames.tsx`), and two catalogue sections. The planner wrote every file below and proved it in a scratch copy of the integration head (`76b329c`, once wallet-looks-unstored had merged): RED on typed stubs (12 of 12 render cases and 1 of 1 Node case fail, each on an assertion), GREEN, 59 mutants all killed, the focused neighbours, a run over each in-flight task's final files, and the fast local gate of R100. Do exactly what this brief says.

Read first, in this order:

1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. R100 applies: the fast local gate only (Step 6), and no whole-suite total anywhere; CI runs the whole suites on the PR. R87 applies: your receipt is its own file, `docs/implementation/receipts/P2-T12.md`; do not edit `premium-progress.md`.
2. The plan task: `docs/superpowers/plans/2026-10-25-jotbun-p2-bun-wallet-core.md`, `### Task P2-T12` (lines 810 to 836); W6, W10 and W30 (lines 43, 47 and 67); Review Focus 3 (line 116); its Global Constraints (lines 82 to 108: the R72 test traps on lines 94 to 99, both modes and both languages on line 106, pure modules on line 107); the users of this task's code: P2-T17's `SaveFlight` (line 1039), P2-T21's bw-adding step (line 1177) and P2-T24's Home (line 1270); P2-T37's sweep rules (lines 1776 and 1777).
3. The boards: `docs/design/bun-wallet/bw-home.dc.html`, `dk-home.dc.html`, `ax-large-home.dc.html`, `ax-voiceover.dc.html` and `ax-motion.dc.html`.
4. The receipts this task builds on: `docs/implementation/receipts/P2-T11.md` (its notes for P2-T12), `P2-T9.md` (the motion table) and `P2-T8.md` (how to mount through `mountWallet`).

## Paths and rules used below

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t12` (branch `p2/t12-card-stack`, made by the orchestrator from `origin/claude/p1a-vault-core`). Work only here.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t12`, your scratch folder. Create it with `mkdir -p`. Logs and the commit message go there. Never keep anything under `/private/tmp`.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t12-planner`, the planner's folder. Read it and `cp` from it; never write into it. It holds:
  - `real/`: the final version of the six files this task creates or changes, at their repo paths (the receipt is yours);
  - `stubs/`: the RED forms (typed stubs) of `CardStack.tsx` and `cardFrames.tsx`;
  - `orig/`: the one shared file this task changes, `apps/app/src/dev/catalogue/wallet/index.ts`, and the looks provider the proof ran against, `apps/app/src/wallet/looks/WalletLooksProvider.tsx` (wallet-looks-unstored's, merged as `76b329c`; this task never edits it), both as they are at the head;
  - `diffs/`: `apps_app_src_dev_catalogue_wallet_index.ts.diff` (the shared file's change, paths `a/<repo path>` and `b/<repo path>`) and `p2-t12.patch` (the whole change, for reading). The planner checked that they turn `orig/` and nothing into `real/` byte for byte;
  - `tools/`: `mutants.py` (the mutant runner), `prove.sh` (the planner's own stages), `brief.py` and `brief.template.md` (how this brief was built: every code block below is the kit's file, byte for byte, and the mutant lines are `logs/mutants.out`);
  - `SHA256SUMS` (every file above) and `SHA256SUMS.logs` (the planner's logs in `logs/` and probes in `probes/`, which the state commits leave out: `summary.txt` (every stage, timed, with the load average), `base-*`, `red-*`, `green-*`, `gate-*`, `compat-tray-*`, `mutants.out` and `mutant-logs/`; `superseded/head-6db889a/`, the first proof, on the dispatch head's tree; `probes/lift-trace.txt` (the lift, frame by frame) and `probes/merge/` (the `index.ts` merge check)).
- Every shell call starts in a fresh directory, so type full paths. Below, WT, S and PL stand for the full paths above: type the full path. Git: `/usr/bin/git -C WT <command>`, one git command per call. npm: `cd WT && npm run <script>`. Focused Node files: `cd WT/apps/app && npm run test:unit -- <files>`. Focused render files: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts <files>`.
- This task needs no heavy lock: no database suite and no workers pool. Docker is stopped and stays stopped.
- To compare checksums: `shasum -a 256 <file>` and compare with the line for the same path in `PL/SHA256SUMS` (`real/...`, `stubs/...` or `orig/...`).
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests or code to make them pass. The only counts that may differ from this brief's are N and C (Step 1.3), and only as Step 0.2 says; and a load flake (a case that times out under load in a file this task does not touch: rerun that file alone once and record both runs).

## Scope

| File | Change |
| --- | --- |
| `apps/app/src/wallet/card/cardFrames.tsx` | **new** (90 lines). `CardFrame`, `CardFrames`, `CardFramesProvider`, `useRegisterCardFrame`, `useCardFrames` (rulings P10, P13). |
| `apps/app/src/wallet/card/CardStack.tsx` | **new** (117 lines). `StackWallet`, `STACK_PEEK`, `CARD_HEIGHT` (re-exported from `WalletCard.tsx`), `CARD_LIFT`, `CardStack` (P4 to P9). |
| `apps/app/src/wallet/card/CardStack.render.test.tsx` | **new**, render suite (504 lines). 12 cases: the plan's five and seven more (P15). |
| `apps/app/src/wallet/card/cardStackNative.test.ts` | **new**, Node (13 lines). 1 case: the native-only prop react-native-web drops, read from the source (P10e). |
| `apps/app/src/dev/catalogue/wallet/stackSections.tsx` | **new**, development only (78 lines). `WALLET_STACK_SECTIONS`: `bw-stack` and `bw-stack-large` (P3). |
| `apps/app/src/dev/catalogue/wallet/index.ts` | **shared** (P2-T8's list). One import and one spread, each between the kit's and the tray's (P3). 12 lines before, 14 after. |
| `docs/implementation/receipts/P2-T12.md` | **new**. Your receipt (R87). |

Not in this task: `kitSections.tsx` (P3) and `traySections.tsx`; `WalletCard.tsx`, `card/copy.ts` and `WalletCard.render.test.tsx` (P2-T11's; P12 takes K5 into this task's test file); `src/wallet/looks/` (wallet-looks-unstored, merged as #391; P8: the stack needs no change there); `src/wallet/tray/` (tray-hardening, PR #392); `src/wallet/add/` (P2-T14, being planned); `src/wallet/motion/` (P11: the new wallet's drop is P2-T21's); `walletHarness.tsx`; `registry.tsx`; `en.json` and `th.json` (no copy line is added); any route, the app entry or native code; any package or lockfile; `premium-progress.md`.

## Planner rulings (the calls this brief makes, with the reason for each)

- **P1. Ready, on base `76b329c`.** Starts after P2-T9 (#368, merged `860990f`) and P2-T11 (#382, `5a33820`), both merged; it also builds on P2-T8 (#365, `1502e65`), P2-T10 (#370, `51be132`) and P2-T13 (#383, `08e0566`: the catalogue's `index.ts` and the tray's sections). Reanimated 4.7.1 and react-native-svg 15.16.0 are installed; no package, lockfile change, Cloudflare resource, owner decision or account setting is needed, and no copy line is added (every word on a card is P2-T11's `card/copy.ts`; the sections' labels are catalogue chrome). The task was dispatched at `6db889a`, and the planner first proved it on that tree (`PL/logs/superseded/head-6db889a/`). Then wallet-looks-unstored (#391) merged as `76b329c`, changing `WalletLooksProvider.tsx` and `WalletLooks.render.test.tsx`, which every `mountWallet` mount reads, so the planner rebuilt the scratch copy from `76b329c` and ran every stage again: the same RED messages, the same 59 mutant lines byte for byte, and N up by 4 (`WalletLooks.render.test.tsx` now has 13 cases). The head is now `a58ea2a`, with controller files only since `76b329c`: `git diff --stat 76b329c a58ea2a -- apps packages package.json package-lock.json docs/superpowers docs/design` prints nothing. Step 0.2 compares from `76b329c`. Nothing here changes a route, the app entry or native code, so there is no `typecheck:routes`, no `export:web` and no iOS export locally.
- **P2. Clear of the work in flight; it waits on none of it.**
  - **tray-hardening** (PR #392; `Tray.tsx`, `Tray.render.test.tsx`, `trayGesture.test.ts`; its P11 rewrites the tray's catalogue case). This task's spread sits between the kit's and the tray's (P3), so the tray's four sections stay last, and both the head's case (`ids.slice(-4)`) and the rewrite (the kit's first, then the tray's four together at or after the kit's end) hold, whichever merges first. Proven: the GREEN neighbours run the head's `Tray.render.test.tsx` (16 of 16), and `prove.sh compat-tray` laid tray-hardening's three final files over the GREEN copy (byte-identical to the PR's branch `fix/tray-hardening`): typecheck exit 0, Node 5 of 5 (`trayGesture.test.ts` and this task's), render 34 of 34 (its `Tray.render.test.tsx` and this task's file); `PL/logs/compat-tray-*`.
  - **wallet-looks-unstored** (#391) merged as `76b329c`, and the proof runs on it (P1). The stack reads no looks and needs no change to the provider (P8).
  - **P2-T14** (being planned; `src/wallet/add/`). The only file it may share is `index.ts`, where its place in plan order is after the tray's spread. The planner merged `index.ts` both ways against such an edit with `git merge-file` (no conflict either way, the same file both ways) and applied this task's diff with `git apply --3way` onto it (clean); `PL/probes/merge/RESULT.txt`. The later wallet tasks with sections (P2-T20, P2-T21 and P2-T29, unheld once #391 merged, and on) also come after the tray's in plan order, so none of them shares this task's place in `index.ts`.
  - 1B-T11 (merged), fix-download-aborts and 1B-T12 (`apps/edge`) touch nothing here.
- **P3. The sections and the catalogue's order.** The plan puts `bw-stack` and `bw-stack-large` in `kitSections.tsx`; as the dispatch asks, they are in their own list, `src/dev/catalogue/wallet/stackSections.tsx` (`WALLET_STACK_SECTIONS`), as P2-T13 did with the tray's, so P2-T11's `kitSections.tsx` is untouched. In `index.ts` the import goes between the kit's and the tray's imports and the spread between the kit's and the tray's spreads: plan order (P2-T12 before P2-T13, and the plan's own place for these sections was the kit's list), which `index.ts` asks for. Each added line has an unchanged line on each side, so an edit after the tray's spread merges in either order (P2). The controller allowed a spread after the tray's, but that would have to wait for tray-hardening (the head's `ids.slice(-4)`) and would share P2-T14's natural place. `bw-stack` (title `Bun Wallet: card stack`) is bw-home's four wallets; `bw-stack-large` (`Bun Wallet: card stack, largest text`) has the longest Thai name, the largest amount, a pending total and today's money out on its front card, to capture at AX5, where the stack is the list (a section cannot set the text size; P14). A press in a section ticks and lifts its card and opens nothing. The sections need no frame provider and read no kept look, and they never import the harness.
- **P4. The stack's shape (bw-home).** The cards come in the order given. The cards behind the front one are placed `STACK_PEEK` (54) apart (`position: absolute`, `top: 54 × i`, `left: 0`, `right: 0`), over the front card, which sits in the stack's own flow with `marginTop: 54 × (n − 1)`. So the stack is `STACK_PEEK × (n − 1) + CARD_HEIGHT` tall (four wallets: 362 pt), and if the front card's words ever need more than 200 pt (P2-T11's P9: a stack card grows rather than clips) the stack grows with it, where an absolutely placed front card would spill over what sits under the stack (Home's today row). No wallets draw an empty stack (P2-T24 decides Home's empty state). `CARD_HEIGHT` is re-exported from `WalletCard.tsx`, which already exports it (P2-T11's P13), not defined twice.
- **P5. Today's money out on the front card only** (P2-T11's P8 and its receipt's note). The stack passes `todayOutMinor: null` to every card but the front one, in the stack and in the list (bw-home and ax-large-home draw it on the front card only, and ax-voiceover's 12 says it for the front card only). Pending totals go through on every card (P2-T11: every variant shows them).
- **P6. The press (`walletOpen`; ax-motion, W6, R66).**
  - (a) It asks `motionFor('walletOpen', reduced)`: the haptic plays through `playHaptic` (so the person's Haptics setting applies), and the motion decides the lift: the `gentle` spring at full motion, `instant` (no lift) under Reduce Motion.
  - (b) The card lifts `CARD_LIFT` (12 pt) on `motion.spring.gentle` with `ReduceMotion.Never` (W6), then comes back down on the same spring (`withSequence`), so it is in its place when the person comes back to Home: the stack stays mounted under the wallet's page. The planner's trace (`PL/probes/lift-trace.txt`): −12 pt at 928 ms, back at 0 from 1856 ms; the gentle spring is overdamped, so it never passes 12 or 0.
  - (c) The wallet's answer is read at the press (`useWalletReducedMotion()` in render, used by the handler), so a change made while Home is open counts at the next press. Before the phone answers it reads as reduced (R66): a press then plays the tick and opens with no lift.
  - (d) `onOpen` is called at once, after the tick and the start of the lift, never from the spring's end.
  - (e) `useAnimatedStyle(..., [lift])` names the shared value itself (R72). The list's cards lift too: one press rule.
- **P7. The largest text sizes (ax-large-home, W30).** At `useLargeText()` the stack is one column of `spine` cards, the front card first, then back to the first card, 14 pt apart (the board's column gap), each in the column's flow, with no shadows. Nothing is clamped (the card's own rule, P2-T11). Screen readers meet the cards in the drawn order in both layouts: back to front in the stack (ax-voiceover's 9 to 12, which is also top to bottom on screen), front first in the list.
- **P8. Looks, and the derived look before the first read** (P2-T11's review; the dispatch asks whether the stack cares). It does not: the stack draws the look each `StackWallet` carries and never reads the account's looks. Showing a derived look for the few milliseconds before the account's looks are read is the caller's call (P2-T23's `homeWallets` reads `lookOf`; P2-T24's Home can keep its skeleton up until then). The same holds for the kept order: `order` is `[]` until the account's first read lands (#391's review, n5), so a caller that sorts by it may first pass the wallets in their default order, and the stack then redraws each card in its new place with no animation (each card keeps its identity by wallet id). #391's other caller notes (a fresh object or array for each setter call, `setOrder` once per drop, a setter that resolves whether or not the change was stored) are for P2-T20, P2-T21 and P2-T29, which call the setters; the stack calls none. `WalletLooksProvider` needs no change for this task.
- **P9. The shadows (bw-home, dk-home).** By day each card after the first casts `0px -4px 14px rgba(17, 16, 20, 0.1)` up onto the card behind it, and the front card `0px -6px 18px rgba(17, 16, 20, 0.12)`; the first card has no card behind it and casts none. Each frame takes the card's 22 pt corner, which the shadow follows. At night none (dk-home draws inset highlights instead, which P2-T11 left out but for dark titanium's edge), and none in the list (ax-large-home). These are React Native 0.88 `boxShadow` strings, as P2-T13's tray draws its edge. The board's violet glow under the front card (`0 18px 34px rgba(106, 75, 212, 0.22)`) is the silk material's colour, so it is not drawn (P14).
- **P10. The card frames (`cardFrames.tsx`, for P2-T17's flight).**
  - (a) The plan's interface, with the view typed `HostInstance`: React Native 0.88 types `View` as a function component whose ref is a `HostInstance` (`ReactNativeElement`), as `Tray`, `Sheet` and `RecordRow` use.
  - (b) `useCardFrames()` returns `{ frameOf, measure }`. `measure()` is beyond the plan's interface: the stack uses it after each of its own layouts, and P2-T17 can call it before a flight, since a frame measured after layout does not follow Home's scroll.
  - (c) A view is measured when it registers, which is after layout (on the web, react-native-web's `measureInWindow` answers after a `setTimeout` of 0, from the page's layout; on a phone, refs attach after Fabric's layout), and again on each `onLayout` of the stack's container, so a stack that moves within the page (say the budget card above it grows) is measured where it now is.
  - (d) One view per wallet id: the last one registered. A view that leaves forgets its wallet's frame, never another view's, and frames are kept per view, so a measurement that lands after its view has left is never given out. Outside a provider nothing is kept: `frameOf` is null and `measure()` does nothing, so the catalogue and tests need no provider. P2-T18's `WalletShell` mounts it (plan line 1075).
  - (e) The registered view is a plain `View` inside each card's frame, with `collapsable={false}`: React Native can flatten a layout-only view on a phone, leaving nothing to measure. react-native-web drops the prop, so `cardStackNative.test.ts` reads it from the source (R72's trap, as P2-T11's review's `cardNativeProps.test.ts` does).
  - (f) The frame is the card's whole box (200 pt). A card behind the front one shows only its top 54 pt (P2-T17: aim at the frame's top `STACK_PEEK`).
- **P11. The new wallet's drop is not the stack's** (P2-T9's review: `walletAddedEntering(false)` drops a card from a full window height on the under-damped bouncy spring, which overshoots by about 22% of the travel, about 190 pt on an 874 pt phone; the dispatch asks this task to decide). The stack plays no entering animation: a wallet that joins is drawn at once in its place, and the card that was in front moves back (a case pins it). The plan gives the drop to P2-T21's bw-adding step (plan line 1177: "shows the card entering with `walletAddedEntering`"), whose stage is 230 pt tall with the card 16 pt down. For P2-T21: the overshoot scales with the travel, so shorten the drop to about one card height (P2-T9's review suggests `.withInitialValues({ originY })`; 22% of 200 pt is about 44 pt) with its test in `useWalletMotion.render.test.tsx`, and check it on the simulator at E2-B (wallet management, plan line 137). P2-T9's review also leaves E2 the board's "success on the first wallet" against the plan's success on every new wallet.
- **P12. K5 (P2-T11's review, n2) is taken into this task's test file**, through the stack: "a bank account below zero keeps its minus in the stack and in the list, in words and on screen", with the stack card at text size 1 and the spine card at AX5. It kills RM5 (the spine's amount without `sign="balance"`, `WalletCard.tsx`), which the planner ran. It is not added to `WalletCard.render.test.tsx`: wallet-looks-unstored's brief counts that file's 9 cases as a neighbour, so a tenth case would stop its implementer on a count if this task merged first; and the stack is the spine card's only user.
- **P13. Names beyond the plan's interface:** `CARD_LIFT` (12), the `CardFrame` and `CardFrames` types, `measure()` (P10b) and `WALLET_STACK_SECTIONS`; test ids `card-stack` (the stack's container) and `card-stack-<walletId>` (each card's frame), for P2-T24's tests.
- **P14. For E2-A (plan line 136), the differences from the boards:**
  - every card in the stack is the `stack` variant (P2-T11's P9): bw-home's front card has a 34 pt face, a 30 pt amount at the bottom and the "Jotbun" mark, which are not drawn;
  - no violet glow under the front card (P9);
  - no VoiceOver hint on the cards (ax-voiceover's "แตะสองครั้งเพื่อเปิดกระเป๋า"): `WalletCard` takes no hint and the plan names none;
  - ax-motion's "card lifts, stack spreads, detail grows" is drawn as the plan's 12 pt lift; the wallet's page opens with the system's push (`page: system`);
  - at the standard text sizes a card behind the front one shows its top 54 pt, so a name that wraps to a second line is partly behind the next card (its button still says the whole name, and the list at the largest sizes shows it whole); E2-A decides whether the peek should grow with the name;
  - bw-home's stack box is 364 pt tall for four cards, the plan's 362;
  - `bw-stack-large` must be captured at AX5 by hand: only `CatalogueScreen` and `screenReader` open every section (lessons.md), and a section cannot set the text size.
- **P15. The cases beyond the plan's five, and the test traps.**
  - (a) `CardStack.render.test.tsx`: the plan's five (both modes; the screen-reader case in both languages too), plus the shadows (P9); the full-motion lift (the two `withSpring` calls and the trace: up to 12 pt and no further, then back to 0, while the other cards never move); a wallet added later (no drop, the front card moves back and loses its today line: P11); K5 (P12); the frames, in two cases (P10); and the two sections (P3).
  - (b) `cardStackNative.test.ts`: `collapsable={false}` on the registered view (P10e).
  - (c) Traps, each solved in the file and explained in its header:
    - happy-dom lays nothing out, so the cases read the styles that place each card;
    - `getBoundingClientRect` is stubbed to give each card's view a place, which react-native-web's `measureInWindow` reads after a `setTimeout` of 0 (the case settles before reading `frameOf`);
    - react-native-web keeps a view's `onLayout` on its node as `__reactLayoutHandler` and calls it from a `ResizeObserver`, which happy-dom never fires, so the frames' case calls it, as a layout would;
    - the lift runs on the faked timers (`vi.useFakeTimers()`), read frame by frame from the frame's `transform`; `withSpring` is watched (`vi.mock` of `react-native-reanimated` with `vi.fn` around the real one), so a case sees the spring the lift asked for; `vi.clearAllMocks()` after each case;
    - the registrar case passes its views as one keyed list in every render, so React keeps a view that stays;
    - `useWindowDimensions()` reads 0 by 0 under `mountWallet` (P2-T8's review note), but the stack reads only `fontScale`, which the harness sets; no case counts the phone's reduced-motion asks (the spy adds them up across mounts).
- **P16. The RED stubs.** `cardFrames.tsx` has the real types, a provider that renders its children, a ref that does nothing and frames that are always null. `CardStack.tsx` has the real names, types and constants and draws each wallet's card as passed (today's money out included) in a plain column with the test ids; a press opens nothing. `index.ts` stays as at the head and `stackSections.tsx` is not there until GREEN. `typecheck:app` passes, and every RED failure is an assertion; no module fails to load.
- **P17. 59 mutants, all killed:** the stack (CS1 to CS39, with CS20b), the frames (CF1 to CF12), the catalogue (SC1 to SC6) and RM5, the mutant that K5 kills (P12). The plan's two are CS1 (the list's front card last) and CS2 (`onOpen` from the spring's end). The planner ran the whole set three times, twice on `6db889a`'s tree and once on `76b329c`'s, and every run printed the same lines byte for byte (`PL/logs/superseded/head-6db889a/mutants-run-1/` is the first, where the catalogue's ids were still K1 to K6). Two kills are not assertions, each a failing test all the same: CS20b (no dependency array), where Reanimated's web build throws its own error (R72's guard), and CF8, where outside a provider the stack destructures `measure` from null.
- **P18. The gate (R100).** `typecheck:app`; the focused files RED to GREEN; `test:unit` and `test:app`; the neighbours (`WalletCard`, `walletHarness`, `Tray`, `WalletLooks`); the catalogue's every-section and screen-reader suites for the two new sections (`-t "bw-stack"`); `git diff --check`. CI runs the full render suite (both catalogue suites pick up the two sections), `export:web`, the iOS export, `test:ops` and the database suites. Nothing outside `apps/app` changes, so there is no API, edge or database suite here.

---

## Step 0: Sync, and what has merged since `76b329c`

1. `/usr/bin/git -C WT fetch origin claude/p1a-vault-core`, then `/usr/bin/git -C WT merge --no-edit origin/claude/p1a-vault-core`. Expected: "Already up to date.", or a fast-forward. Then `/usr/bin/git -C WT rev-parse --short HEAD`, and record it.
2. `/usr/bin/git -C WT diff --stat 76b329c HEAD -- apps/app/src/wallet apps/app/src/dev/catalogue/wallet apps/app/src/lib apps/app/src/theme apps/app/src/ui apps/app/src/hooks apps/app/vitest.render.config.ts apps/app/package.json package-lock.json`. Expected: no output, or only files of the tasks in flight (P2): tray-hardening's (PR #392: `apps/app/src/wallet/tray/Tray.tsx`, `Tray.render.test.tsx`, `trayGesture.test.ts`) or P2-T14's (under `apps/app/src/wallet/add/`, and its own list under `apps/app/src/dev/catalogue/wallet/`).
   - If it lists a file this task creates or builds on, report BLOCKED with the output: anything under `apps/app/src/wallet/card/`, `apps/app/src/wallet/motion/`, `apps/app/src/wallet/money/`, `apps/app/src/wallet/privacy/`, `apps/app/src/wallet/testing/`, `apps/app/src/wallet/copy/` or `apps/app/src/wallet/common/`, or `apps/app/src/dev/catalogue/wallet/stackSections.tsx`, `apps/app/src/lib/hapticMoment.ts`, `apps/app/src/lib/haptics.ts`, `apps/app/src/lib/hapticPreference.ts`, `apps/app/src/theme/motion.ts`, `apps/app/src/theme/walletPalette.ts`, `apps/app/src/ui/largeText.ts`, `apps/app/src/ui/largeTextScale.ts`, `apps/app/vitest.render.config.ts`, `apps/app/package.json` or `package-lock.json`.
   - If it lists `apps/app/src/dev/catalogue/wallet/index.ts`, go on: Step 4.1 applies the diff there.
   - Any other file: go on. The counts this task does not change (N and C in Step 1.3) are then your own Step 1.3 base, and the receipt names each merge.
   - Then run `/usr/bin/git -C WT log --oneline 76b329c..HEAD`, and keep the merged PRs it lists for the receipt.
3. The base files:
   - `shasum -a 256 WT/apps/app/src/dev/catalogue/wallet/index.ts` equals its `orig/` line in `PL/SHA256SUMS`, unless Step 0.2 listed it;
   - `shasum -a 256 WT/apps/app/src/wallet/looks/WalletLooksProvider.tsx` equals its `orig/` line, unless Step 0.2 listed it (then N is what you measure in Step 1.3);
   - `ls WT/apps/app/src/wallet/card/CardStack.tsx WT/apps/app/src/wallet/card/cardFrames.tsx WT/apps/app/src/dev/catalogue/wallet/stackSections.tsx` says "No such file or directory" three times.

   If any of these differs, report BLOCKED.

## Step 1: Install and the focused base

1. Only if `WT/node_modules` is missing: `cd WT && npm ci --ignore-scripts --no-audit --no-fund > S/npm-ci.log 2>&1; echo $?`. Expected: 0 and "added 1416 packages".
2. `cd WT && npm run typecheck:app > S/base-typecheck.log 2>&1; echo $?`. Expected: 0.
3. The focused base (the per-file counts this task's Expected lines build on; R100: no whole-suite count):
   - The neighbours: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/card/WalletCard.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx > S/base-neighbours.log 2>&1; echo $?`. Expected: 0, `Test Files  4 passed (4)`, `Tests  47 passed (47)` (9 + 9 + 16 + 13), or 53 if tray-hardening has merged (its `Tray.render.test.tsx` has 22 cases). Call this count N; if Step 0.2 listed another merge, N is what you measure.
   - The catalogue's wallet sections: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "bw-" > S/base-catalogue.log 2>&1; echo $?`. Expected: 0, `Tests  18 passed` (nine wallet sections, two suites), or more if P2-T14 has merged its sections. Call this count C. Ignore the `skipped` count: it moves with the head.

   Compare with `PL/logs/base-neighbours.log` and `PL/logs/base-catalogue.log`.

## Step 2: The tests and the typed stubs (plan Step 1)

1. Copy the two test files and the two stubs:
   ```bash
   cp PL/real/apps/app/src/wallet/card/CardStack.render.test.tsx WT/apps/app/src/wallet/card/CardStack.render.test.tsx
   cp PL/real/apps/app/src/wallet/card/cardStackNative.test.ts WT/apps/app/src/wallet/card/cardStackNative.test.ts
   cp PL/stubs/apps/app/src/wallet/card/CardStack.tsx WT/apps/app/src/wallet/card/CardStack.tsx
   cp PL/stubs/apps/app/src/wallet/card/cardFrames.tsx WT/apps/app/src/wallet/card/cardFrames.tsx
   ```
2. `shasum -a 256` the two tests against their `real/` lines and the two stubs against their `stubs/` lines in `PL/SHA256SUMS`: all equal. `/usr/bin/git -C WT status --short` shows exactly `?? apps/app/src/wallet/card/CardStack.render.test.tsx`, `?? apps/app/src/wallet/card/CardStack.tsx`, `?? apps/app/src/wallet/card/cardFrames.tsx` and `?? apps/app/src/wallet/card/cardStackNative.test.ts`.
3. Read both tests before you go on: the receipt names every case. The tests and the stubs are in the appendix.

## Step 3: RED (plan Step 2)

1. `cd WT && npm run typecheck:app > S/red-typecheck.log 2>&1; echo $?`. Expected: 0.
2. `cd WT/apps/app && npm run test:unit -- src/wallet/card/cardStackNative.test.ts > S/red-unit.log 2>&1; echo $?`. Expected: 1, `ℹ tests 1`, `ℹ pass 0`, `ℹ fail 1`, and the failure is `AssertionError [ERR_ASSERTION]: The input did not match the regular expression /<View ref=\{register\} collapsable=\{false\}>/` (N1 `the view each card registers is kept as a native view, so it can be measured`).
3. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/card/CardStack.render.test.tsx > S/red-render.log 2>&1; echo $?`. Expected: 1, `Test Files  1 failed (1)`, `Tests  12 failed (12)`, no "Unhandled" section, `grep -c '^AssertionError' S/red-render.log` gives 12 and `grep -cE 'Cannot find module|Failed to resolve|TestingLibraryElementError' S/red-render.log` gives 0. The twelve, in file order, each failing first on:
   - S1 `the stack is 54 pt per card plus one whole card`: `light: expected [ [ '', '', '', '' ], …(2) ] to deeply equal [ …(3) ]`
   - S2 `by day each card casts bw-home's shadow up onto the card behind it; at night, and in the list, none`: `light: expected [ '', '', '', '' ] to deeply equal [ '', …(3) ]`
   - S3 `pressing a card plays the walletOpen tick and opens that wallet at once`: `light: expected [ [], +0 ] to deeply equal [ [ [ 'w-transit' ] ], 1 ]`
   - S4 `under reduced motion the card opens with no lift`: `light: expected [ [], +0 ] to deeply equal [ [ [ 'w-main' ] ], 1 ]`
   - S5 `at full motion a pressed card lifts 12 pt on the gentle spring and settles back in its place; the others stay`: `light: expected [] to deeply equal [ Array(2) ]`
   - S6 `at AX5 the stack is a list with the front card first, and nothing truncates`: `light: expected [ 'w-credit', 'w-transit', …(2) ] to deeply equal [ 'w-main', 'w-cash', …(2) ]`
   - S7 `screen readers meet the cards in the drawn order, each a button with its card's words`: `th light: expected [ …(4) ] to deeply equal [ 'บัตรเครดิต, ใช้ไป 3,920 บาท', …(3) ]`
   - S8 `a wallet added later joins the front of the stack at once: the stack plays no drop`: `expected [ '', '', '' ] to deeply equal [ '162px', '', '' ]`
   - S9 `a bank account below zero keeps its minus in the stack and in the list, in words and on screen (P2-T11's review, K5)`: `3.571: expected 1 to be +0 // Object.is equality`
   - S10 `each card's place in the window is known after layout, measured again when the stack lays out, and forgotten when the card leaves`: `expected [ null, null, null, null ] to deeply equal [ { x: 16, y: 300, …(2) }, …(3) ]`
   - S11 `one view per wallet id: the last registered answers, and a view that leaves never forgets another; outside a provider nothing is kept`: `expected null to deeply equal { x: 10, y: 20, width: 30, height: 40 }`
   - S12 `the catalogue's stack sections come after the kit's and draw bw-home's stack; the largest-text one is the list at AX5`: `expected [ 'bw-category-icons', …(3) ] to deeply equal [ 'bw-category-icons', …(3) ]`

   S1, S3, S4, S6 and S7 are the plan's five. Step 5 names the cases by these ids. Compare with `PL/logs/red-unit.log` and `PL/logs/red-render.log`.

## Step 4: GREEN (plan Steps 3 and 4)

1. Copy the code:
   ```bash
   cp PL/real/apps/app/src/wallet/card/CardStack.tsx WT/apps/app/src/wallet/card/CardStack.tsx
   cp PL/real/apps/app/src/wallet/card/cardFrames.tsx WT/apps/app/src/wallet/card/cardFrames.tsx
   cp PL/real/apps/app/src/dev/catalogue/wallet/stackSections.tsx WT/apps/app/src/dev/catalogue/wallet/stackSections.tsx
   cp PL/real/apps/app/src/dev/catalogue/wallet/index.ts WT/apps/app/src/dev/catalogue/wallet/index.ts
   ```
   If Step 0.2 listed `index.ts`, use this in place of its `cp`: `/usr/bin/git -C WT apply --3way PL/diffs/apps_app_src_dev_catalogue_wallet_index.ts.diff`. It must apply with no conflict, with `import { WALLET_STACK_SECTIONS } from './stackSections';` right after the kit's import and `...WALLET_STACK_SECTIONS,` right after `...WALLET_KIT_SECTIONS,`; otherwise report BLOCKED.
2. `shasum -a 256` the six files against their `real/` lines in `PL/SHA256SUMS` (all equal; `index.ts` only when it was copied). `/usr/bin/git -C WT status --short` shows exactly ` M apps/app/src/dev/catalogue/wallet/index.ts`, `?? apps/app/src/dev/catalogue/wallet/stackSections.tsx` and the four `?? apps/app/src/wallet/card/...` lines of Step 2.2 (`M  apps/app/src/dev/catalogue/wallet/index.ts`, staged, if `git apply --3way` wrote it).
3. The code is in the appendix (from `PL/real/`, byte for byte), with the shared file's diff.
4. `cd WT && npm run typecheck:app > S/green-typecheck.log 2>&1; echo $?`. Expected: 0.
5. `cd WT/apps/app && npm run test:unit -- src/wallet/card/cardStackNative.test.ts > S/green-unit.log 2>&1; echo $?`. Expected: 0, `ℹ tests 1`, `ℹ pass 1`, `ℹ fail 0`.
6. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/card/CardStack.render.test.tsx > S/green-render.log 2>&1; echo $?`. Expected: 0, `Test Files  1 passed (1)`, `Tests  12 passed (12)`, each case marked `✓`. The stderr holds only the notices the base logs hold too: Vite's config-loader notice, two sourcemap notices for `expo-status-bar` and Node's `ExperimentalWarning: localStorage is not available ...`. No `act(...)` warning, no `console.error`, no network error.
7. The neighbours, the command of Step 1.3: Expected: 0 and `Tests  N passed (N)`, unchanged (the stack's sections do not move the tray's four from the end of the list, P2).
8. The catalogue, the command of Step 1.3 into `S/green-catalogue.log`: Expected: 0 and `Tests  C+4 passed` (the two new sections in each of the two suites; 22 at the planner's head).

## Step 5: Mutation check (plan Step 5)

1. `python3 -I PL/tools/mutants.py WT S/mutant-logs > S/mutants.out 2>&1; echo $?`. It applies each mutant alone, runs its test file (`CardStack.render.test.tsx`, or `cardStackNative.test.ts` for CS39), and restores the file with its SHA-256 checked; about three minutes for the planner, at a load average near 15. RM5 mutates P2-T11's `WalletCard.tsx` and puts it back byte for byte. Expected: exit 0, and these 60 lines: one per mutant, each ending "restored sha256 equal", then the tally. The case named is the first that failed in the run, by its full name; Step 3 gives each name its id:
   ```
{{mutants}}
   ```
   Compare with `PL/logs/mutants.out`. The plan's two are CS1 and CS2. Every kill is an assertion in the case named, with these two exceptions, each a failing test all the same: CS20b fails every case on Reanimated's own `Error: [Reanimated] \`useAnimatedStyle\` was used without a dependency array or Babel plugin.` (R72's guard), and CF8 fails eleven cases on a `TypeError`, since outside a provider the stack destructures `measure` from null.
2. `shasum -a 256` the six files against `real/` again, and `/usr/bin/git -C WT status --short`. Expected: unchanged from Step 4.2, which also shows that `WalletCard.tsx`, which RM5 mutates, is back as it was.

## Step 6: The fast local gate (R100)

From WT, in this order, each with its log in S:

1. `npm run typecheck:app`: exit 0.
2. `npm run test:unit`: exit 0 and `ℹ fail 0`. (R100: no total is checked; record what it prints.)
3. `npm run test:app`: exit 0 and `ℹ fail 0`.
4. The focused files once more: `cd WT/apps/app && npm run test:unit -- src/wallet/card/cardStackNative.test.ts` (1 of 1), then `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/card/CardStack.render.test.tsx src/wallet/card/WalletCard.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx`: `Test Files  5 passed (5)`, `Tests  N+12 passed (N+12)` (59 at the planner's head).
5. The catalogue's two suites for the two new sections: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "bw-stack"`: `Test Files  2 passed (2)`, `Tests  4 passed | ... skipped`.
6. `/usr/bin/git -C WT diff --check` (before the commit) and, after it, `/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD`: no output.

Not run here, and why (put this in the receipt): the full render suite, `export:web`, the iOS export, `test:ops` and the database suites run in CI on the PR (R100; no route, config, app entry, package or lockfile change); the API and edge suites (nothing outside `apps/app` changes); device and simulator checks (the lift and the shadows on a phone, `measureInWindow` on a phone, VoiceOver's order over the stack) and the E2-A screenshots of `bw-stack` and `bw-stack-large` (the controller's): SKIPPED.

## Step 7: Receipt

Write `docs/implementation/receipts/P2-T12.md` in the house style (see `docs/implementation/receipts/P2-T11.md`), with your own numbers where they differ from these. Start from:

```markdown
# P2-T12: The card stack and card frames

- **Status:** built and verified locally on `p2/t12-card-stack` (`.claude/worktrees/p2-t12`), from `<head>`. Not pushed. The independent review is the controller's, after this receipt. Under ruling R87 this receipt is its own file; `premium-progress.md` is not edited.
- **Base:** `<head>`. (The brief was proven on `76b329c`. If your head is later, name each merged PR from `git log --oneline 76b329c..HEAD`.)
- **Files:** created `apps/app/src/wallet/card/cardFrames.tsx`, `CardStack.tsx`, `CardStack.render.test.tsx` (12 cases), `cardStackNative.test.ts` (1 case), `apps/app/src/dev/catalogue/wallet/stackSections.tsx` and this receipt; modified `apps/app/src/dev/catalogue/wallet/index.ts` (one import and one spread, between the kit's and the tray's).
- **What changed:** (the stack's shape and its growth with the front card; today's money out on the front card only; the shadows; the list at the largest text sizes, front card first; the press: the tick, the 12 pt lift and back, none under Reduce Motion or before the phone answers, `onOpen` at once; the frames: measured after layout and after the stack's layouts, one view per wallet, `measure()`; no drop in the stack; the two sections.)
- **RED to GREEN:** ... (Steps 3 and 4: the 12 render cases and the 1 Node case failing, each on an assertion, and their messages; the neighbours N; the catalogue C+4.)
- **Mutation check:** 59 mutants, all killed ... (one line per group, with the case that kills it; the plan's two are CS1 and CS2; RM5 is P2-T11's review's, killed by K5; CS20b and CF8 are the two non-assertion kills).
- **Gate** (worktree root, R100's fast local gate): ... (every command in Step 6 with its result; no whole-suite totals).
- **Deviations:** the rulings in force: P3 (the sections' own list, between the kit's and the tray's), P4 (the front card in the stack's flow), P6 (the lift comes back down), P9 (the shadows), P10 (the frames: `HostInstance`, `measure()`, one view per wallet, `collapsable={false}` and its Node check), P11 (no drop in the stack), P12 (K5 in this task's test file), P13 (names), P15 (the cases beyond the plan's five).
- **SKIPPED and CI:** the full render suite, `export:web`, the iOS export, `test:ops` and the database suites run in CI (R100); the API and edge suites (no change there); device and simulator checks and E2-A's screenshots (Step 6).
- **Notes for later tasks:**
  - P2-T17: `useCardFrames().frameOf(walletId)` is the card's whole box in the window, or null when no card of that wallet is on screen; a card behind the front one shows only its top `STACK_PEEK` (54 pt), so aim there. Call `measure()` when the tray opens: a frame does not follow Home's scroll. A Home kept mounted under another tab keeps its cards registered, so check that Home is the screen showing before a flight.
  - P2-T18: mount `CardFramesProvider` in `WalletShell` (plan line 1075); without it the stack works and nothing is kept.
  - P2-T21: the new wallet's drop and its overshoot are yours (P11): shorten the travel, then check it at E2-B.
  - P2-T23 and P2-T24: pass each wallet's `todayOutMinor`; the stack shows the front card's only. The stack draws the looks it is given, so the derived look before the account's first read is Home's to hide (P8). Test ids `card-stack` and `card-stack-<walletId>`.
  - E2-A: the board calls in P14; capture `bw-stack-large` at AX5.
```

## Step 8: Commit

1. `/usr/bin/git -C WT add apps/app/src/wallet/card/cardFrames.tsx apps/app/src/wallet/card/CardStack.tsx apps/app/src/wallet/card/CardStack.render.test.tsx apps/app/src/wallet/card/cardStackNative.test.ts apps/app/src/dev/catalogue/wallet/stackSections.tsx apps/app/src/dev/catalogue/wallet/index.ts docs/implementation/receipts/P2-T12.md`
2. `/usr/bin/git -C WT status --short`: those 7 files staged (`A` for the 6 new ones, `M` for `index.ts`), nothing else (no `dist/`, no log).
3. Write the message to `S/commit-message.txt`:
   ```
   Add the wallet card stack, a list at the largest text sizes

   Stack the wallet cards as bw-home draws them, each 54 pt below the
   one before, with the front card whole and the only one that shows
   today's money out, and bw-home's shadows by day. At the largest text
   sizes the stack is one column of spine cards, front card first. A
   press plays the walletOpen tick, lifts the card 12 pt on the gentle
   spring and back (no lift under Reduce Motion or before the phone
   answers) and opens the wallet at once. Each card registers its place
   in the window for the saved moment's flight. Add the stack's two
   catalogue sections.

   Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
   ```
4. `/usr/bin/git -C WT commit -F S/commit-message.txt`, then `/usr/bin/git -C WT log --oneline -1` and `/usr/bin/git -C WT show --stat HEAD`: 7 files.

## Your final message

As the protocol says: `STATUS: DONE` (or `STATUS: BLOCKED` with the exact blocker) on the first line; the commit SHA and branch; files changed; RED and GREEN counts (12 render and 1 Node case failing at RED, each on an assertion); mutants (59, all killed); each gate command with its result, no whole-suite totals; SKIPPED and CI items; deviations (P3 to P15); and what the reviewer should look at first: the front card in the stack's flow (P4), the press and its lift (P6, cases S3 to S5), the frames' rules (P10, cases S10 and S11), and the catalogue's order with the tasks in flight (P2, P3).

---

## Appendix: the code

Every block is the kit's file, byte for byte (`tools/brief.py` builds this brief from `tools/brief.template.md`). Copy from `PL/real/` and `PL/stubs/`, not from here.

### The shared file

`apps/app/src/dev/catalogue/wallet/index.ts` (12 lines before, 14 after):

{{diff:apps_app_src_dev_catalogue_wallet_index.ts.diff}}

### The frames

`apps/app/src/wallet/card/cardFrames.tsx`:

{{file:apps/app/src/wallet/card/cardFrames.tsx}}

### The stack

`apps/app/src/wallet/card/CardStack.tsx`:

{{file:apps/app/src/wallet/card/CardStack.tsx}}

### The catalogue sections

`apps/app/src/dev/catalogue/wallet/stackSections.tsx`:

{{file:apps/app/src/dev/catalogue/wallet/stackSections.tsx}}

### The tests

`apps/app/src/wallet/card/CardStack.render.test.tsx`:

{{file:apps/app/src/wallet/card/CardStack.render.test.tsx}}

`apps/app/src/wallet/card/cardStackNative.test.ts`:

{{file:apps/app/src/wallet/card/cardStackNative.test.ts}}

### The RED stubs

`apps/app/src/wallet/card/CardStack.tsx` (stub):

{{stub:apps/app/src/wallet/card/CardStack.tsx}}

`apps/app/src/wallet/card/cardFrames.tsx` (stub):

{{stub:apps/app/src/wallet/card/cardFrames.tsx}}
