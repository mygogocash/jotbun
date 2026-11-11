# Brief P2-T14: The add flow, the keypad and the amount step

You are the implementer for plan P2, Task P2-T14. You add the Bun Wallet add tray's pure flow (`addFlow.ts`: its types, its steps and the rules they share), the tray's keypad (`WalletKeypad`), its header (`TypeSwitchHeader`), the quick chips (`QuickChips`), the amount step and its pinned footer (`AmountStep`, `AmountFooter`), the area's draft copy (`add/copy.ts`) and two catalogue sections. The planner wrote every file below and proved it in a scratch copy of the integration head `b5aa2a7` with tray-hardening's three files laid over it, since this task starts after tray-hardening merges (ruling P2): RED on typed stubs (6 of 6 Node cases and 12 of 12 render cases fail, each on an assertion), GREEN, 92 mutants (all killed), the focused neighbours, the catalogue's wallet sections and the fast local gate of R100. Do exactly what this brief says.

**This task starts after tray-hardening merges** (the controller's ruling). Step 0.2 checks it; until then, report BLOCKED.

Read first, in this order:

1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. Its R87 note applies (your receipt is its own file, `docs/implementation/receipts/P2-T14.md`; do not edit `premium-progress.md`), and so does R100 (CI runs the whole suites; you run the fast local gate below, and you write no whole-suite total anywhere).
2. The plan task: `docs/superpowers/plans/2026-10-25-jotbun-p2-bun-wallet-core.md`, `### Task P2-T14` (lines 901 to 937), its Global Constraints (lines 82 to 108: copy and E2 on line 85, type on line 86, accessibility on line 87, colour on line 88, money on line 89, the R72 test traps on lines 94 to 99, both modes and both languages on line 106, the pure-module rule on line 107), W10 (line 47), W14 (line 51), W15 (line 52), W29 (line 66), W30 (line 67), and Review Focus 2 and 3 (lines 115 and 116). P2-T15 and P2-T16 (lines 940 to 1009) build on this task: read them for what they take from it.
3. The boards: `docs/design/bun-wallet/bw-tray-amount.dc.html`, `dk-tray-amount.dc.html`, `rh-income.dc.html`, `rh-transfer.dc.html`, `ax-large-tray.dc.html` and `bw-tray-confirm.dc.html`.
4. The receipts this task builds on: `docs/implementation/receipts/P2-T13.md` (the tray; its notes for later tasks), `tray-hardening.md` (once merged), `P2-T10.md` (money text and private mode), `P2-T11.md` (looks and `MaterialFill`) and `P2-T8.md` (how to mount through `mountWallet`).
5. The tray-hardening brief's ruling P11, `/Users/kunanonjarat/Developer/jotbun/.claude/controller/briefs/tray-hardening.md` (the tray's catalogue case reads the tray's four sections where they sit, so this task's sections can follow them).

## Paths and rules used below

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t14` (branch `p2/t14-add-flow`, made by the orchestrator from `origin/claude/p1a-vault-core`). Work only here.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t14`, your scratch folder. Create it with `mkdir -p`. Logs and the commit message go there. Never keep anything under `/private/tmp`.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t14-planner`, the planner's folder. Read it and `cp` from it; never write into it. It holds:
  - `real/`: the final version of the eleven files this task creates or changes, at their repo paths;
  - `stubs/`: the RED forms (typed stubs) of `addFlow.ts`, `WalletKeypad.tsx`, `TypeSwitchHeader.tsx`, `QuickChips.tsx` and `AmountStep.tsx`;
  - `orig/`: the two shared files, `apps/app/src/dev/catalogue/wallet/index.ts` and `apps/app/src/wallet/copy/draftText.test.ts`, as they are at `b5aa2a7`;
  - `base/`: tray-hardening's `Tray.tsx`, `Tray.render.test.tsx` and `trayGesture.test.ts` as its planner proved them, which this task's proof ran over (ruling P1);
  - `diffs/`: `apps_app_src_dev_catalogue_wallet_index.ts.diff` and `apps_app_src_wallet_copy_draftText.test.ts.diff` (paths `a/<repo path>` and `b/<repo path>`), and `p2-t14.patch`, the whole change, for reading. The planner checked that they turn `orig/` and nothing into `real/` byte for byte;
  - `tools/mutants.py` (the mutant runner) and `tools/prove.sh` (the planner's own stages);
  - `SHA256SUMS` (every file above) and `SHA256SUMS.logs` (the planner's logs in `logs/`: `summary.txt`, `base-*`, `red-*`, `green-*`, `compat-*`, `merge/`, `gate-*`, `mutants.out`, `mutant-logs/`; `round1/` is the planner's first round, which found ruling P3h, and `dev/` its working runs).
- Every shell call starts in a fresh directory, so type full paths. Below, WT, S and PL stand for the full paths above: type the full path. Git: `/usr/bin/git -C WT <command>`, one git command per call. npm: `cd WT && npm run <script>`. Focused Node files: `cd WT/apps/app && npm run test:unit -- <files>`. Focused render files: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts <files>`.
- This task needs no heavy lock: no database suite and no workers pool. Docker is stopped and stays stopped.
- To compare checksums: `shasum -a 256 <file>` and compare with the line for the same path in `PL/SHA256SUMS` (`real/...`, `stubs/...`, `orig/...` or `base/...`).
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests or code to make them pass. The only counts that may differ from this brief's are N and C (Step 1.3), and only as Step 0 says.

## Scope

| File | Change |
| --- | --- |
| `apps/app/src/wallet/add/addFlow.ts` | **new**, pure (150 lines). `AddType`, `AddStep` (with `transfer`, P3d), `StepProps`, `trayTitleKey`, `stepAfterAmount` (P3c), `amountProblem` (P3c, P6), `ConfirmRow`, `confirmRows` (with `tc`, P3e), `stillGuessed` (P3c), `moveAllMinor`, `balancesAfter`. |
| `apps/app/src/wallet/add/addFlow.test.ts` | **new**, Node. 6 cases: the plan's four and two more (P12). |
| `apps/app/src/wallet/add/copy.ts` | **new** (31 lines). `COPY`: the plan's thirteen lines and two more (P3g). |
| `apps/app/src/wallet/add/WalletKeypad.tsx` | **new** (90 lines). `WalletKeypad`, exactly the plan's props (P5). |
| `apps/app/src/wallet/add/TypeSwitchHeader.tsx` | **new** (73 lines). `TypeSwitchHeader`, exactly the plan's props (P7). |
| `apps/app/src/wallet/add/QuickChips.tsx` | **new** (71 lines). The `QuickChip` type and `QuickChips`, the plan's props (P8). |
| `apps/app/src/wallet/add/AmountStep.tsx` | **new** (242 lines). `AmountStep`, `AmountFooter` (P3a) and `useCanTellBun` (P3b). |
| `apps/app/src/wallet/add/AmountStep.render.test.tsx` | **new**, render suite. 12 cases: the plan's six and six more (P12). |
| `apps/app/src/dev/catalogue/wallet/addSections.tsx` | **new**, development only. `WALLET_ADD_SECTIONS`: `bw-tray-amount`, `bw-tray-income` (P11). |
| `apps/app/src/dev/catalogue/wallet/index.ts` | **shared** (P2-T8's list). One import after the tray's import, one spread after the tray's spread (P3f). 12 lines before, 14 after. |
| `apps/app/src/wallet/copy/draftText.test.ts` | **shared** (P2-T3's check of every draft table). One place: `LATIN_LINES` gains `add.chip`, and the comment above it says why (P3h). 99 lines before, 103 after; 4 cases before and after. |
| `docs/implementation/receipts/P2-T14.md` | **new**. Your receipt (R87). |

Not in this task: anything under `apps/app/src/wallet/tray/` (tray-hardening's and P2-T13's; P2, P10); `kitSections.tsx` and `traySections.tsx`; `src/wallet/looks/` (wallet-looks-unstored, #391) and `src/wallet/card/` (P2-T12); `WalletAmount.tsx`; `keypadExpression.ts`, `quickAddModel.ts`, `entryHelpers.ts` and `dateStep.ts` (read, never changed); `TransferStep`, `ConfirmStep`, the pick steps and the add tray host (P2-T15, P2-T16); `registry.tsx`; `en.json` and `th.json` (no catalog line is added); any route, the app entry or native code; any package or lockfile; `premium-progress.md`.

## Planner rulings (the calls this brief makes, with the reason for each)

- **P1. The base is `b5aa2a7`, with tray-hardening's three files over it.** The dispatch named `3091b41`. `git fetch` found `6db889a` (controller files only), where the planner built the proof copy (`git archive 6db889a`, then `npm ci`, 1416 packages). The head then moved to `b5aa2a7`, which adds 1B-T11 (#387: `apps/edge` and its receipt) and controller files: `git diff --stat 6db889a b5aa2a7 -- apps/app packages package.json package-lock.json` prints nothing, so the copy's app is `b5aa2a7`'s. After the controller's ruling (P2), every stage ran with tray-hardening's `Tray.tsx`, `Tray.render.test.tsx` and `trayGesture.test.ts` laid over the copy, from `PL/base/`, whose checksums equal the `real/` lines of `scratch/tray-hardening-planner/SHA256SUMS`.
- **P2. Ready, and it starts after tray-hardening.**
  - Starts after P2-T5 (#333, merged `92c14d6`), P2-T10 (#370, `51be132`), P2-T11 (#382, `5a33820`) and P2-T13 (#383, `08e0566`), all in `b5aa2a7`. No package, lockfile change, Cloudflare resource or account setting is needed. The copy follows owner Q3's default (P3g, P17).
  - The controller's ruling: this task spreads its sections after the tray's in `index.ts`, as that file asks (plan order, P3f). The head's tray catalogue case (`Tray.render.test.tsx`, `ids.slice(-4)`) reads the tray's four sections as the last ones, so it fails on this spread (`PL/logs/compat-head-tray-case.log`). tray-hardening's ruling P11 rewrites that case to read the tray's four where they sit, after the kit's (`compat-final-tray-case.log` passes). This task edits nothing under `src/wallet/tray/`.
  - Nothing here changes a route, the app entry or native code, so there is no `typecheck:routes`, no `export:web` (CI runs it) and no iOS export for the controller.
- **P3. The names and files that differ from the plan's list.**
  - (a) **`AmountFooter`**, a second component in `AmountStep.tsx`, is the step's footer: the keypad, the keypad's problem, and Next. The host passes it to the tray's `footer`. P2-T13's `Tray` pins only `footer`; everything given as its children scrolls. ax-large-tray says the keypad never scrolls and Next stays pinned, and the plan names "the footer's `PrimaryButton`". So the plan's `problem` prop moves from `AmountStep` to `AmountFooter`, where it shows above Next. `AmountStep` keeps every other prop of the plan's. Both take `StepProps`, so a host spreads one object into both.
  - (b) **`useCanTellBun()`** (in `AmountStep.tsx`) is the plan's rule for `canTellBun` ("the `companion` area on and `useAiCompanion().enabled`") in one place, for P2-T16. The plan's case "บอกบัน shows only when Bun is on in the companion area" tests the rule itself through it. `AmountStep` still takes `canTellBun`, so the edit tray (P2-T27) can pass false.
  - (c) **Three rules in `addFlow.ts`** that the plan's cases name but its list leaves out: `stepAfterAmount(type)` (where Next goes), `amountProblem(keypad)` (which keypad problem shows, P6), and `stillGuessed(guessed, before, after)`, the rule in the plan's case "fields Bun filled are marked guessed until the person changes them". P2-T16 calls it from its `onDraft`. Each is pure and Node-tested.
  - (d) **`AddStep` gains `transfer`.** P2-T16 says "a transfer goes amount, transfer, confirm", and the plan's union has no step for P2-T15's `TransferStep` (rh-transfer's two wallets). The `from` and `to` steps are `WalletPick`'s, which return to confirm. Next from a transfer's amount goes to `transfer`.
  - (e) **`confirmRows` takes `tc: Translate` (the app's copy) in place of `t: WalletT`.** Its only words are category names. A built-in category's name is a catalog line, read through `tc` (`categoryName` in `spend/v1/viewModels.ts`, as every screen names categories). A `WalletT` reads draft tables, so it would leave "Food" in English in Thai. The row labels stay keys (`labelKey`), for the confirm step's own `t` (P2-T15 adds those lines). The types `Translate` and `WalletT` have the same shape, so only the name says which copy to pass.
  - (f) **The sections are in their own list**, `dev/catalogue/wallet/addSections.tsx` (`WALLET_ADD_SECTIONS`), spread in `index.ts` right after the tray's spread, with its import right after the tray's import. This is an anchor of the task's own: P2-T12's list, planned now, belongs with the kit's (plan order), after `...WALLET_KIT_SECTIONS,`. The two edits are one unchanged line apart, so `git merge-file` merges them cleanly in either order, and both orders give the same file (`PL/logs/merge/`, `compat-*` in `summary.txt`). Never `kitSections.tsx`.
  - (g) **`copy.ts`** exports `COPY`, as `card/copy.ts` and `privacy/copy.ts` do. It holds the plan's thirteen lines and two more. `add.typeGroup` ประเภทรายการ is the boards' name for the switch (rh-income, rh-transfer), and a radio group needs a name (§4). `add.chooseWallet` เลือกกระเป๋า (Thai marked draft) is what the wallet chip says when no wallet is chosen, as when a copied record's wallet was closed. The plan gives only Thai: the English lines are drafts for E2-B (owner Q3's default). `add.deleteKey` keeps the plan's ลบตัวเลข, rh-income's name for the key; bw-tray-amount says ลบ.
  - (h) **One line in P2-T3's draft check** (`src/wallet/copy/draftText.test.ts`). It reads every area's `copy.ts` and wants each Thai line to hold Thai letters, unless its key is in `LATIN_LINES`. The plan's `add.chip` is `{label} {amount}` in both languages, only placeholders, and is built as written (owner Q3's default). So `add.chip` joins `LATIN_LINES` (where `card.kindTransit`, "BTS / MRT", already is), and the comment says such lines are made only of placeholders. Without it the head's check fails on `add.chip` (`PL/logs/compat-head-draft.log`; the planner's first round found it in `test:unit`, `PL/logs/round1/gate-3-test-unit.log`). The copy and the exemption go in together at RED (Step 2), so the check passes before and after.
- **P4. The amount step (bw-tray-amount, rh-income; W14, W15).**
  - (a) Order: the amount, with the wallet chip under it; บอกบัน; income's name field; the quick chips. The footer (P3a) holds the keypad, the problem and Next. Parts are 12 pt apart, and the amount and its chip 8.
  - (b) The header is `TypeSwitchHeader` in the title's place (W14, as rh-income and rh-transfer draw it). bw-tray-amount's drawn title and the Bun face beside it give way to the switch, and ax-large-tray hides the face too. The title still names the dialog (P2-T13's P8c), from `trayTitleKey`.
  - (c) The amount is `฿` and `keypadDisplay(keypad)`: ฿0 with nothing typed, ฿50, ฿999,999,999.99. It is DM Sans 700 at 58 in ink, centred, with WalletAmount's sizing (`amountMaxScale`, the Latin line height, −2% letter spacing). The keypad has no decimal point (W29), so it shows whole baht, or two decimals when a chip or Bun filled satang (`keypadFromMinor`). It says the amount in baht (`spokenMoney` of the amount, `0 บาท` with nothing typed) in a polite live region, so where live regions are read, each key's result is read out.
  - (d) It is drawn by the step's own `Text`, not `WalletAmount`: WalletAmount masks in private mode, and the controller ruled that what the person types is never masked (P9). It is ink with no plus sign, also for income, as rh-income draws it: it is the amount being typed, not an income row (Global Constraints, colour).
  - (e) The wallet chip: a 44 pt pill on `raised`. It holds the wallet's own material (`MaterialFill`, 34 by 22 pt, radius 5, from `useWalletLooks().lookOf`), the words and a chevron. The words are `add.fromWallet` for spending and `add.intoWallet` for income, or `add.chooseWallet` with no material when the wallet is not chosen or not listed. It opens the wallet step (`onStep('wallet')`). rh-income draws it 44 pt; bw-tray-amount draws 36 (§4).
  - (f) บอกบัน: a 50 pt row on `raised` with the boards' sparkle in violet and the words in `quiet`. It calls `onTellBun` (P2-T16 opens today's Tell Bun sheet). It is offered for spending and income, never for a transfer, as Quick add offers Tell Bun (`QuickAddScreen.tsx`: `companion && type !== 'transfer'`).
  - (g) Income's name field (rh-income): a 58 pt row on `raised`. It holds a 40 pt `card` tile with the boards' banknote, the caption `add.merchantLabel`, and one line of text at 17/500 in Anuphan, at most `MERCHANT_MAX_CHARS` (120, `normalizeMerchant`'s limit), written into `draft.merchant` through `onDraft`. The caption `add.notInBudget` sits on the right. At the largest text sizes it is a column without the tile.
  - (h) A transfer's amount stands alone: no wallet chip, no บอกบัน and no name field. Next takes it to its two wallets (P3d).
  - (i) No photo row (W15), and no date chip. rh-income draws วันนี้ beside the wallet, but the plan's bindings name none, and the day is the confirm step's row (P2-T15) for spending and income alike (P17).
- **P5. The keypad (W29, ax-large-tray).**
  - 1 to 9, then 000, 0 and delete, three to a row, typed through `applyKey`. A tenth digit is refused with `too_large` and the amount stays. `000` on nothing is one 0, and delete takes one digit.
  - Keys are at least 46 pt (the boards), radius 14, nothing behind them until pressed (then `raised`). The digits are DM Sans 500 at 24 pt (000 at 20) in ink, as the boards draw them ("unless a board shows otherwise"), capped at 34 pt (`maxFontSizeMultiplier` 34/24). At the largest text sizes keys are 56 pt on `raised`, 6 pt apart.
  - Each press plays `keyTap`. Delete is named `add.deleteKey`; a digit key's name is its digits. `disabled` dims each key to 0.4, and a disabled keypad takes nothing (for a locked tray, P2-T16).
- **P6. Next and the problem.**
  - Next is `PrimaryButton` (`common.next` ถัดไป). It is enabled exactly when `evaluateKeypad(keypad).ok`, so never with nothing typed and never at zero, and it calls `onStep(stepAfterAmount(type))`.
  - `problem` shows right above Next whenever the host passes one: `label` text, centred, `role="alert"`, polite, and said once on iOS (`useAnnouncement`).
  - `amountProblem(keypad)` says which problem to pass: a refused key's (`too_large`), else why the amount cannot go on (`zero`). With nothing typed it passes none, since Next waiting is enough and nothing nags (§2).
  - The words are today's: the host shows `tc(KEYPAD_PROBLEM_TEXT[problem])`, as Quick add does, and the render test's probe does exactly that.
- **P7. The type switch (W14, rh-income).** One radio group, named `add.typeGroup`, as today's `TypeSwitch` is a radio group. Its three segments are at least 44 pt, radius 13, on a `raised` track (radius 17, padding 4, gap 2). The chosen one is a `card` segment with bold ink words, lifted by the board's soft shadow by day (`0px 1px 4px rgba(17, 16, 20, 0.14)`); the others are quiet at 500 on the track. A new choice plays `segmentChange` and calls `onType`; the chosen one does nothing. At the largest text sizes the segments stack. There is no `disabled`, since the plan's props have none.
- **P8. The quick chips (bw-tray-amount, ax-large-tray).**
  - At most three, each its name (`label`, 15/500) and its amount (`WalletAmount` at 16). By default they are a wrapping row of 44 pt pills on `card` with a hairline ring (the boards draw 36 pt).
  - At the largest text sizes they are a hairline-ringed list of full-width rows of at least 64 pt, where a long name pushes the amount onto the next line.
  - Each chip says `add.chip` (its name, then its amount in baht). A tap plays `chipPick` and calls the chip's `apply`, which is the host's (P2-T16 builds the chips from today's often-logged list). No chips, no list.
- **P9. Private mode.** The chips' amounts are stored amounts, so `WalletAmount` masks them (฿••••) and each chip says the amount is hidden (W10, Review Focus 2). The amount being typed is never masked (the controller's P2-T14 ruling): a person must see what they type. P2-T37's sweep should know that `add-amount` is the one amount private mode leaves on screen, by design.
- **P10. The largest text sizes (ax-large-tray), and what this task takes from the tray.**
  - These hold: the tray is full height (the tray's own); the keypad and Next are pinned in its footer; keys are 56 pt on `raised` with digits capped at 34 pt; the amount grows to 64 pt (`amountMaxScale(58)`) and wraps, and ฿999,999,999.99 and an 80-code-point Thai wallet name are never clamped (Review Focus 3); the wallet chip and the chips become full-width rows of at least 64 pt; the switch stacks.
  - One part of the board does not hold: "the amount pins under the title". It opens at the top of the scrolling middle but scrolls away with it. The tray has no pinned place under its header, and this task may not edit `Tray.tsx` (the dispatch). A pinned slot under the header is a follow-up for the tray (P2-T16, or a tray task), and E2-B's AX5 capture of `bw-tray-amount` is by hand (the controller's lesson: only the every-section and screen-reader suites open every section; the large-text suite does not).
  - The tray behaviours these cases rely on (the dispatch asks for them): `header` is drawn in the header row in the title's place; `footer` is pinned under the scrolling content; the title names the dialog. They are P2-T13's and stay as they are under tray-hardening. The planner ran this task's render file against both the head's `Tray.tsx` and tray-hardening's, and it passes on both (`PL/logs/compat-head-tray-render.log`, `green-render.log`).
- **P11. The sections.**
  - `bw-tray-amount` is spending: ฿50 typed, the wallet it comes from, บอกบัน and three quick chips. `bw-tray-income` is income: ฿35,000 into the wallet, its name filled (เงินเดือน), and that it is not counted in the budget.
  - Each puts the step in a `Tray` that opens at once, with the switch as its header and `AmountFooter` as its footer, on fixed sample props. The keys, the switch, the chips and the name work; closing the tray and opening it again (Open the tray) starts over. Next, the wallet chip and บอกบัน go nowhere, since the steps after the amount and Tell Bun's sheet are P2-T15's and P2-T16's.
  - The problem's words are today's two reachable lines, read through `tc` from a small map in the file. `entryHelpers.ts` loads the device's id maker (`expo-crypto`, through `screens/v1/parts.tsx`), and no catalogue list may load it: every test that reads the wallet's list would fail to load.
  - The sample wallet's id (`bw-add-main-account`) derives the boards' lavender silk. The titles are `Bun Wallet: add tray, amount` and `Bun Wallet: add tray, income` (R72: unique, never a heading the section draws). No section imports the harness.
- **P12. The cases beyond the plan's, and the test traps.**
  - (a) `addFlow.test.ts`: the plan's four (the expense's and the transfer's rows, Bun's guesses until changed, move all, the balances after a move), plus "the tray's title follows its type, and the amount's Next goes to confirm, or a transfer's to its two wallets" and "the amount step's problem: ...". The balances case adds a balance past 2^53, so a JS number would show (F22), and one wallet on both sides.
  - (b) `AmountStep.render.test.tsx`: the plan's six, plus six more: a transfer's amount alone and its Next; the type switch as one named radio group; the keypad's rules, ticks and disabled state; the chips' cap, words, `apply` and tick; private mode (P9); and the sections (after the tray's, each open at once on its board's words). The cases that draw colour (typing ฿50, the 44 pt sweep, the switch) run light and dark in Thai and English; the cases about words (the problem, income, the chips) run in Thai and English; the rest run in Thai by day (Global Constraints, line 106).
  - (c) Traps, each solved in the file and explained in its header:
    - Reanimated keeps the tray's card `visibility: hidden` until an `animationstart` that happy-dom never fires, and queries by role skip what is unseen: `startAnimations()` dispatches it, as `Tray.render.test.tsx` does;
    - react-native-web drops `maxFontSizeMultiplier` and `numberOfLines`, so the file records the props reaching `@mobile/theme/AppText`'s `Text` (`vi.mock`, as `WalletCard.render.test.tsx` does);
    - `playHaptic` is mocked, so each case reads the moments by name (`keyTap`, `segmentChange`, `chipPick`);
    - `expo-crypto` is mocked (as the catalogue suites mock it), because the probe imports `KEYPAD_PROBLEM_TEXT` from `entryHelpers.ts`;
    - `vi.stubEnv('EXPO_PUBLIC_REDESIGN', '-companion')` switches the companion area off for one case (`vi.unstubAllEnvs()` after each);
    - react-native-web omits `aria-disabled` when it is false, so an enabled Next has none;
    - `useWindowDimensions()` reads 0 by 0 under `mountWallet` (P2-T8's review), but `useLargeText()` reads only `fontScale`, which the harness sets.
- **P13. The RED stubs.** `addFlow.ts` has the real types and wrong answers: always `add.titleExpense`, always `confirm`, never a problem, no rows, the guesses unchanged, no move all, unknown balances. `WalletKeypad.tsx` and `TypeSwitchHeader.tsx` draw an empty view with the real test id. `QuickChips.tsx` has the real `QuickChip` type and draws nothing. `AmountStep.tsx` has `useCanTellBun()` false and an empty `AmountStep` and `AmountFooter`. `copy.ts` is data and goes in with the tests, and so does `draftText.test.ts`'s exemption for it (P3h). `index.ts` stays as at the head and `addSections.tsx` is not there until GREEN. `typecheck:app` passes, and every RED failure is an assertion; no module fails to load.
- **P14. 92 mutants, all killed.** They cover the flow's rules (F1 to F23, the Node file; F18 is the plan's "offer move all at a zero balance"), the step, the footer, the wallet chip, Tell Bun and the name (A1 to A27; A1 is the plan's "enable Next on an empty keypad"), the keypad (K1 to K11), the switch (T1 to T11), the chips (Q1 to Q10), the copy (C1 to C4) and the catalogue (S1 to S6). No mutant survives, and none is marked equivalent. The planner's first round ran 91 (all killed); C4 came with P3h.
- **P15. Clear of the work in flight; merge order.**
  - tray-hardening (`src/wallet/tray/`) merges first (P2); this task touches nothing there.
  - wallet-looks-unstored (#391, `src/wallet/looks/`) changes no exported name or signature; this task reads `useWalletLooks().lookOf` and `MaterialFill`. If #391 merges first, `WalletLooks.render.test.tsx` has 13 cases, not 9, so N is 53 (Step 1.3).
  - P2-T12 (`src/wallet/card/`, its own section list) shares no file with this task but `index.ts`, at another anchor (P3f). If it merges first, apply this task's `index.ts` diff with `git apply --3way` (Step 4.1), and C counts its sections too.
  - `draftText.test.ts`: if another task adds a key to `LATIN_LINES` first, apply this task's diff with `git apply --3way` (Step 2.1); a conflict on that one line is a BLOCKED.
  - 1B-T11 (merged), fix-download-aborts and 1B-T12 (`apps/edge`) touch nothing here.
- **P16. The gate (R100).** Run: `typecheck:app`, the focused files RED to GREEN (with P2-T3's draft check, P3h), the focused neighbours (the four render files that read the wallet's catalogue list), the catalogue's wallet sections in the every-section and screen-reader suites (`-t "bw-"`) and the registry rule, `test:app`, `test:unit` and `git diff --check`. CI runs the full render suite and `export:web`; the iOS export too. Nothing here changes a route, the app entry or native code, so there is no `typecheck:routes`, `export:web` or iOS export locally. Nothing outside `apps/app` changes, so there is no API, edge or database suite; no package changes, so no `test:ops`.
- **P17. For E2-B (the owner's look at the daily loop), the differences from the boards:**
  - the switch replaces bw-tray-amount's drawn title and Bun face (W14);
  - the wallet chip, the quick chips and the keys are at least 44 pt (bw-tray-amount draws 36 pt chips; the keys are the boards' 46);
  - Next says ถัดไป (`common.next`, P2-T3's line); the boards say ต่อไป;
  - the main button is P2-T13's 54 pt with radius 16 (the trays draw 56 and 18);
  - บอกบัน is a row that opens Tell Bun's sheet, not a field typed into, and there is no แนบรูป (W15);
  - rh-income's วันนี้ chip is not drawn (P4i);
  - the amount is ink without a sign for income too, and 58 pt (rh-income draws 56);
  - in the dark the chips' ring is `hairline` (dk-tray-amount draws #3A3842, not in the palette), and the switch, which no dark board draws, is a `card` segment on `raised`;
  - the delete key says ลบตัวเลข (rh-income; bw-tray-amount ลบ);
  - at AX5 the amount scrolls with the middle (P10), so capture `bw-tray-amount` at AX5 by hand.

---

## Step 0: Sync, tray-hardening, and what has merged since `b5aa2a7`

1. `/usr/bin/git -C WT fetch origin claude/p1a-vault-core`, then `/usr/bin/git -C WT merge --no-edit origin/claude/p1a-vault-core`. Expected: "Already up to date.", or a fast-forward. Then `/usr/bin/git -C WT rev-parse --short HEAD`, and record it.
2. tray-hardening has merged:
   - `grep -c "const first = ids.indexOf('bw-tray-short');" WT/apps/app/src/wallet/tray/Tray.render.test.tsx`. Expected: `1`. If it prints `0`, report BLOCKED: "tray-hardening has not merged; P2-T14 starts after it (brief P2)".
   - `shasum -a 256 WT/apps/app/src/wallet/tray/Tray.tsx WT/apps/app/src/wallet/tray/Tray.render.test.tsx WT/apps/app/src/wallet/tray/trayGesture.test.ts`. Expected: each equals its `base/` line in `PL/SHA256SUMS`. If one differs (tray-hardening changed after its planner), go on, record which in the receipt, and take N from your own Step 1.3: this task's cases rely only on the tray's header, footer and title (P10).
3. `/usr/bin/git -C WT diff --stat b5aa2a7 HEAD -- apps/app packages package.json package-lock.json`. Expected: tray-hardening's three files under `apps/app/src/wallet/tray/`, and perhaps #391's (`apps/app/src/wallet/looks/WalletLooksProvider.tsx`, `WalletLooks.render.test.tsx`) and P2-T12's (files under `apps/app/src/wallet/card/`, a section list under `apps/app/src/dev/catalogue/wallet/`, and `index.ts`).
   - If it lists a file this task creates or builds on, report BLOCKED with the output: anything under `apps/app/src/wallet/add/`, or `apps/app/src/dev/catalogue/wallet/addSections.tsx`, `apps/app/src/ui/keypadExpression.ts`, `apps/app/src/ui/dateStep.ts`, `apps/app/src/spend/v1/redesign/quickAddModel.ts`, `apps/app/src/spend/v1/redesign/shared.ts`, `apps/app/src/spend/v1/viewModels.ts`, `apps/app/src/screens/redesign/entry/entryHelpers.ts`, `apps/app/src/wallet/money/WalletAmount.tsx`, `apps/app/src/wallet/money/walletMoney.ts`, `apps/app/src/wallet/privacy/PrivateModeProvider.tsx`, `apps/app/src/wallet/tray/PrimaryButton.tsx`, `apps/app/src/wallet/tray/TextLink.tsx`, `apps/app/src/wallet/looks/MaterialFill.tsx`, `apps/app/src/wallet/common/copy.ts`, `apps/app/src/wallet/copy/useDraftCopy.ts`, `apps/app/src/wallet/WalletText.tsx`, `apps/app/src/theme/walletType.ts`, `apps/app/src/theme/AppText.tsx`, `apps/app/src/spend/v1/ai/AiCompanionProvider.tsx`, `apps/app/src/config/featureFlags.ts`, `apps/app/src/lib/hapticMoment.ts`, `apps/app/vitest.render.config.ts`, `apps/app/package.json`, `package-lock.json` or anything under `packages/`.
   - If it lists `apps/app/src/dev/catalogue/wallet/index.ts`, go on: Step 4.1 applies the diff there. If it lists `apps/app/src/wallet/copy/draftText.test.ts`, go on: Step 2.1 applies the diff there.
   - Any other file: go on. The focused counts this task does not change (the neighbours, the catalogue's wallet sections before GREEN) are then your own Step 1.3 base, and the receipt names each merge.
   - Then run `/usr/bin/git -C WT log --oneline b5aa2a7..HEAD`, and keep the merged PRs it lists for the receipt.
4. The base files:
   - `shasum -a 256 WT/apps/app/src/dev/catalogue/wallet/index.ts WT/apps/app/src/wallet/copy/draftText.test.ts`: each equals its `orig/` line, unless Step 0.3 listed it;
   - `ls WT/apps/app/src/wallet/add WT/apps/app/src/dev/catalogue/wallet/addSections.tsx` says "No such file or directory" twice.

   If any differs, report BLOCKED.

## Step 1: Install and the focused base

1. `cd WT && npm ci --ignore-scripts --no-audit --no-fund > S/npm-ci.log 2>&1; echo $?`. Expected: 0 and "added 1416 packages".
2. `cd WT && npm run typecheck:app > S/base-typecheck.log 2>&1; echo $?`. Expected: 0.
3. The focused base (the per-file counts this task's Expected lines build on; R100: no whole-suite count):
   - `cd WT/apps/app && npm run test:unit -- src/wallet/copy/draftText.test.ts > S/base-draft.log 2>&1; echo $?`. Expected: 0, `ℹ tests 4`, `ℹ pass 4`.
   - `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/tray/Tray.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx > S/base-neighbours.log 2>&1; echo $?`. Expected: 0, `Test Files  4 passed (4)`, `Tests  49 passed (49)` (22 + 9 + 9 + 9), or 53 if #391 merged first (its looks file has 13). Call this count N; if Step 0 found another merge or a changed tray file, N is what you measure.
   - `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "bw-" > S/base-catalogue.log 2>&1; echo $?`. Expected: 0, `Tests  18 passed` (nine wallet sections, two suites), or more if P2-T12 merged first. Call this count C. Ignore the `skipped` count: it moves with the head.
   - `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx -t "registry has a section" > S/base-registry.log 2>&1; echo $?`. Expected: 0, `Tests  1 passed`.

## Step 2: The tests, the copy, the draft check's exemption and the typed stubs (plan Step 1)

1. Copy:
   ```bash
   mkdir -p WT/apps/app/src/wallet/add
   cp PL/real/apps/app/src/wallet/add/addFlow.test.ts WT/apps/app/src/wallet/add/addFlow.test.ts
   cp PL/real/apps/app/src/wallet/add/AmountStep.render.test.tsx WT/apps/app/src/wallet/add/AmountStep.render.test.tsx
   cp PL/real/apps/app/src/wallet/add/copy.ts WT/apps/app/src/wallet/add/copy.ts
   cp PL/stubs/apps/app/src/wallet/add/addFlow.ts WT/apps/app/src/wallet/add/addFlow.ts
   cp PL/stubs/apps/app/src/wallet/add/WalletKeypad.tsx WT/apps/app/src/wallet/add/WalletKeypad.tsx
   cp PL/stubs/apps/app/src/wallet/add/TypeSwitchHeader.tsx WT/apps/app/src/wallet/add/TypeSwitchHeader.tsx
   cp PL/stubs/apps/app/src/wallet/add/QuickChips.tsx WT/apps/app/src/wallet/add/QuickChips.tsx
   cp PL/stubs/apps/app/src/wallet/add/AmountStep.tsx WT/apps/app/src/wallet/add/AmountStep.tsx
   cp PL/real/apps/app/src/wallet/copy/draftText.test.ts WT/apps/app/src/wallet/copy/draftText.test.ts
   ```
   If Step 0.3 listed `draftText.test.ts`, use this in place of its `cp`: `/usr/bin/git -C WT apply --3way PL/diffs/apps_app_src_wallet_copy_draftText.test.ts.diff`. It must apply with no conflict, and `LATIN_LINES` must hold `'add.chip'`; otherwise report BLOCKED.
2. `shasum -a 256` the nine files and compare: the `real/` lines for the two tests, `copy.ts` and `draftText.test.ts` (only when it was copied), the `stubs/` lines for the five others. If a `cp` source is missing or a checksum differs, report BLOCKED.

## Step 3: RED (plan Step 2)

1. `cd WT && npm run typecheck:app > S/red-typecheck.log 2>&1; echo $?`. Expected: 0.
2. `cd WT/apps/app && npm run test:unit -- src/wallet/add/addFlow.test.ts > S/red-unit.log 2>&1; echo $?`. Expected: 1, `ℹ tests 6`, `ℹ pass 0`, `ℹ fail 6`, each an `AssertionError [ERR_ASSERTION]`:
   - `the tray's title follows its type, and the amount's Next goes to confirm, or a transfer's to its two wallets`: strictly equal, actual `'add.titleExpense'`, expected `'add.titleIncome'`;
   - `an expense confirms category, wallet, date and note; a transfer confirms from, to, date and note`: strictly deep-equal, actual `[]`;
   - `fields Bun filled are marked guessed until the person changes them`: strictly deep-equal, actual `[]`, expected `[ 'category', 'wallet', 'date' ]`;
   - `move all offers the available balance only when it is known and above zero`: `null !== '2486000'`;
   - `balances after a transfer move the exact amount`: strictly deep-equal, actual `{ from: null, to: null }`, expected `{ from: '2436000', to: '174000' }`;
   - `the amount step's problem: a refused key's, else why the amount cannot go on, but nothing for a keypad nothing was typed on`: `null !== 'zero'`.
3. `cd WT/apps/app && npm run test:unit -- src/wallet/copy/draftText.test.ts > S/red-draft.log 2>&1; echo $?`. Expected: 0, `ℹ tests 4`, `ℹ pass 4`: the copy and its exemption went in together (P3h), so the check passes before and after.
4. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/add/AmountStep.render.test.tsx > S/red-render.log 2>&1; echo $?`. Expected: 1, `Test Files  1 failed (1)`, `Tests  12 failed (12)`, no "Unhandled" section, `grep -c '^AssertionError' S/red-render.log` gives 12 and `grep -cE 'Cannot find module|Failed to resolve|SyntaxError|is not a function|TestingLibraryElementError' S/red-render.log` gives 0. The twelve, each on an `AssertionError`:
{{RED_RENDER_LINES}}

   Compare with `PL/logs/red-unit.log` and `PL/logs/red-render.log`.

## Step 4: GREEN (plan Steps 3 and 4)

1. Copy the code:
   ```bash
   cp PL/real/apps/app/src/wallet/add/addFlow.ts WT/apps/app/src/wallet/add/addFlow.ts
   cp PL/real/apps/app/src/wallet/add/WalletKeypad.tsx WT/apps/app/src/wallet/add/WalletKeypad.tsx
   cp PL/real/apps/app/src/wallet/add/TypeSwitchHeader.tsx WT/apps/app/src/wallet/add/TypeSwitchHeader.tsx
   cp PL/real/apps/app/src/wallet/add/QuickChips.tsx WT/apps/app/src/wallet/add/QuickChips.tsx
   cp PL/real/apps/app/src/wallet/add/AmountStep.tsx WT/apps/app/src/wallet/add/AmountStep.tsx
   cp PL/real/apps/app/src/dev/catalogue/wallet/addSections.tsx WT/apps/app/src/dev/catalogue/wallet/addSections.tsx
   cp PL/real/apps/app/src/dev/catalogue/wallet/index.ts WT/apps/app/src/dev/catalogue/wallet/index.ts
   ```
   If Step 0.3 listed `index.ts`, use this in place of its `cp`: `/usr/bin/git -C WT apply --3way PL/diffs/apps_app_src_dev_catalogue_wallet_index.ts.diff`. It must apply with no conflict, `import { WALLET_ADD_SECTIONS } from './addSections';` must come right after `import { WALLET_TRAY_SECTIONS } from './traySections';`, and `...WALLET_ADD_SECTIONS,` right after `...WALLET_TRAY_SECTIONS,`; otherwise report BLOCKED.
2. `shasum -a 256` the eleven files against their `real/` lines in `PL/SHA256SUMS` (all equal; `index.ts` and `draftText.test.ts` only when they were copied). `/usr/bin/git -C WT status --short` shows exactly ` M apps/app/src/dev/catalogue/wallet/index.ts`, ` M apps/app/src/wallet/copy/draftText.test.ts`, `?? apps/app/src/dev/catalogue/wallet/addSections.tsx` and `?? apps/app/src/wallet/add/` (`M ` in the first column, staged, for a file `git apply --3way` wrote).
3. The code, for reference (read the full files in `PL/real/` before the receipt; their headers say why): `addFlow.ts`, rulings P3c to P3e and P6; `WalletKeypad.tsx`, P5; `TypeSwitchHeader.tsx`, P7; `QuickChips.tsx`, P8; `AmountStep.tsx`, P3a, P3b, P4, P6 and P9; `addSections.tsx` and `index.ts`, P3f and P11; `copy.ts`, P3g.
4. `cd WT && npm run typecheck:app > S/green-typecheck.log 2>&1; echo $?`. Expected: 0.
5. `cd WT/apps/app && npm run test:unit -- src/wallet/add/addFlow.test.ts src/wallet/copy/draftText.test.ts > S/green-unit.log 2>&1; echo $?`. Expected: 0, `ℹ tests 10`, `ℹ pass 10`, `ℹ fail 0` (6 + 4).
6. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/add/AmountStep.render.test.tsx > S/green-render.log 2>&1; echo $?`. Expected: 0, `Test Files  1 passed (1)`, `Tests  12 passed (12)`, each case marked `✓`, and `grep -c '^stderr |' S/green-render.log` gives 0. Its stderr lines are only the notices the base logs carry too (Vite's config-loader notice, the sourcemap notices), with no `act(...)` warning and no `console.error`.
7. The neighbours, unchanged: the Step 1.3 neighbours command with `S/green-neighbours.log`. Expected: 0, `Tests  N passed (N)` (49 at `b5aa2a7` with tray-hardening).
8. The catalogue's wallet sections: the Step 1.3 catalogue command with `S/green-catalogue.log`. Expected: 0, `Tests  C + 4 passed` (22 at `b5aa2a7`: eleven sections, two suites). Then the registry rule: the Step 1.3 registry command with `S/green-registry.log`. Expected: 0, `Tests  1 passed`.

## Step 5: Mutation check (plan Step 5)

1. `python3 -I PL/tools/mutants.py WT S/mutant-logs > S/mutants.out 2>&1; echo $?`. It applies each mutant alone, runs its suite (the Node file for F1 to F23; the render file for the rest), and restores the file with its SHA-256 checked. It takes ten to forty minutes, by the machine's load. Expected: exit 0, and these 93 lines (each line in your file also gives its suite's counts, the AssertionError count and "restored sha256 equal"; compare with `PL/logs/mutants.out`):
   ```
{{MUTANT_LINES}}
   ```
   F18 and A1 are the plan's two mutants.
2. `shasum -a 256` the eleven files against `real/` again, and run `/usr/bin/git -C WT status --short`. Expected: unchanged from Step 4.2.

## Step 6: The fast local gate (R100)

From WT, in this order, each with its log in S:

1. `npm run typecheck:app`: exit 0.
2. `npm run test:app`: exit 0, `ℹ fail 0`. (No count is expected here: CI holds the whole suites, R100.)
3. `npm run test:unit`: exit 0, `ℹ fail 0`.
4. The focused files once more: Step 4.5 (`ℹ pass 10`, `ℹ fail 0`) and the render command of Step 4.6 with the four neighbours added (`src/wallet/tray/Tray.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx`): exit 0, `Test Files  5 passed (5)`, `Tests  12 + N passed` (61 at `b5aa2a7` with tray-hardening). A case that times out near 5 s in a file this task does not touch is a load flake: rerun that file alone once, record both runs, and do not change it.
5. `/usr/bin/git -C WT diff --check` (before the commit) and, after it, `/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD`: no output.

Not run, and why (put this in the receipt): the full render suite and `export:web` (CI, R100; the catalogue's every-section and screen-reader suites pick up the two sections there, and the large-text suite does not open them); `typecheck:routes` and the iOS export (no route, app entry or native change; CI runs the iOS export); `test:ops` (no package or lockfile change); the API, edge and database suites (nothing outside `apps/app` changes; Docker is stopped); and device and simulator checks, all SKIPPED: the keypad's ticks and the switch's on a phone; VoiceOver reading each key, the switch as a radio group, the chips' words and the amount's live updates (iOS reads no live region, so the amount is read only by its own label when focused); the income name field with the system keyboard up beside the pinned keypad (iOS and Android); the tray at AX5 on a phone (P10); and E2-B's screenshots (the controller's, after P2-T28).

## Step 7: Receipt

Write `docs/implementation/receipts/P2-T14.md` in the house style (see `docs/implementation/receipts/P2-T13.md`), with your own numbers where they differ from these. Start from:

```markdown
# P2-T14: The add flow, the keypad and the amount step

- **Status:** built and verified locally on `p2/t14-add-flow` (`.claude/worktrees/p2-t14`), from `<head>`. Not pushed. The independent review is the controller's, after this receipt. Under ruling R87 this receipt is its own file; `premium-progress.md` is not edited.
- **Base:** `<head>`, after tray-hardening merged. (The brief was proven at `b5aa2a7` with tray-hardening's three files laid over it. Name each merged PR from `git log --oneline b5aa2a7..HEAD`, and say whether #391 or P2-T12 merged first.)
- **Files:** created `apps/app/src/wallet/add/addFlow.ts`, `addFlow.test.ts` (6 cases), `copy.ts`, `WalletKeypad.tsx`, `TypeSwitchHeader.tsx`, `QuickChips.tsx`, `AmountStep.tsx`, `AmountStep.render.test.tsx` (12 cases), `apps/app/src/dev/catalogue/wallet/addSections.tsx` and this receipt; modified `apps/app/src/dev/catalogue/wallet/index.ts` (one import, one spread, after the tray's) and `apps/app/src/wallet/copy/draftText.test.ts` (`add.chip` joins `LATIN_LINES`).
- **What changed:** (the pure flow and its rules; the keypad; the switch; the chips; the amount step and its pinned footer; the copy; the sections.)
- **RED to GREEN:** ... (Steps 3 and 4: the 6 and 12 failing cases and their messages; GREEN counts; the neighbours unchanged; the catalogue's wallet sections C to C + 4.)
- **Mutation check:** 92 mutants, all killed ... (one line per group, with the case that kills it; F18 and A1 are the plan's.)
- **Gate** (worktree root): ... (Step 6, each command with its result; no whole-suite count, R100.)
- **Deviations:** `AmountFooter` and the `problem` prop (ruling P3a); `useCanTellBun` (P3b); `stepAfterAmount`, `amountProblem` and `stillGuessed` (P3c); `AddStep`'s `transfer` (P3d); `confirmRows`' `tc` (P3e); the sections' list and anchor (P3f); the two extra copy lines (P3g); `add.chip` in the draft check's `LATIN_LINES` (P3h); the typed amount drawn unmasked (P4d, P9); at AX5 the amount scrolls with the middle (P10); the E2-B differences from the boards (P17).
- **SKIPPED:** the full render suite and `export:web` (CI); `typecheck:routes` and the iOS export (no route, app entry or native change); `test:ops`; the API, edge and database suites; device and simulator checks (Step 6).
- **Notes for later tasks:**
  - P2-T15: add the row labels `confirmRows` returns as keys (`add.rowCategory`, `add.rowWallet`, `add.rowFrom`, `add.rowTo`, `add.rowDate`, `add.rowNote`) to `add/copy.ts`. A row's value is empty when nothing is chosen or written, so the step says what to add (bw-tray-confirm's เพิ่มโน้ต). `TransferStep` is the `transfer` step, and the transfer's keypad and Next belong in the tray's pinned footer as `AmountFooter`'s do (`WalletKeypad`, `PrimaryButton`). `moveAllMinor` offers a balance above ฿999,999,999.99 too, as Quick add does, so apply it with `keypadFromMinor` in a try and set `too_large` when it throws (`QuickAddScreen.tsx`). `balancesAfter` keeps one wallet's balance when it is on both sides.
  - P2-T16: pass `header={<TypeSwitchHeader type={draft.type} onType={...} />}` and, on the amount step, `footer={<AmountFooter {...stepProps} type={draft.type} problem={...} />}`; the problem is `amountProblem(keypad)` in today's words, `tc(KEYPAD_PROBLEM_TEXT[problem])`. `canTellBun={useCanTellBun()}`. Keep the guesses with `stillGuessed(guessed, draft, next)` in `onDraft` (it returns a new set each time). `confirmRows` takes the app's `tc`. Next calls `onStep(stepAfterAmount(type))`. The chips' `apply` fills the draft and the keypad (`keypadFromMinor`).
  - P2-T16, or a tray task: a pinned place under the tray's header would let the amount stay above the scrolling middle at AX5, as ax-large-tray draws (ruling P10).
  - P2-T27: the edit tray reuses `AmountStep` and `AmountFooter`; `WalletKeypad`'s `disabled` serves a locked tray.
  - P2-T37: the typed amount (`add-amount`) is the one amount private mode leaves on screen, by design (ruling P9).
  - E2-B: the differences from the boards (ruling P17); capture `bw-tray-amount` at AX5 by hand, and each tray section from a fresh launch (P2-T13's n2).
```

## Step 8: Commit

1. `/usr/bin/git -C WT add apps/app/src/wallet/add/addFlow.ts apps/app/src/wallet/add/addFlow.test.ts apps/app/src/wallet/add/copy.ts apps/app/src/wallet/add/WalletKeypad.tsx apps/app/src/wallet/add/TypeSwitchHeader.tsx apps/app/src/wallet/add/QuickChips.tsx apps/app/src/wallet/add/AmountStep.tsx apps/app/src/wallet/add/AmountStep.render.test.tsx apps/app/src/dev/catalogue/wallet/addSections.tsx apps/app/src/dev/catalogue/wallet/index.ts apps/app/src/wallet/copy/draftText.test.ts docs/implementation/receipts/P2-T14.md`
2. `/usr/bin/git -C WT status --short`: those twelve staged, nothing else (no log, no `dist/`).
3. Write the message to `S/commit-message.txt`:
   ```
   Add the Bun Wallet add flow, its keypad and the amount step

   Add the add tray's pure flow: its types and steps, the confirm rows,
   Bun's guesses kept until the person changes them, move all for a known
   balance above zero, and each wallet's balance after a transfer, exact in
   BigInt. Add the tray's keypad (digits, 000, 0, delete), the type switch
   for its header, the quick chips, and the amount step with its pinned
   footer: the amount at 58 pt, the wallet chip, Tell Bun, income's name, and
   Next, which waits for an amount above zero with the keypad's problem in
   today's words. At the largest text sizes the keys are 56 pt and the chips
   full-width rows. Add the step's catalogue sections after the tray's.

   Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
   ```
4. `/usr/bin/git -C WT commit -F S/commit-message.txt`, then `/usr/bin/git -C WT log --oneline -1` and `/usr/bin/git -C WT show --stat HEAD`: 12 files.

## Your final message

As the protocol says: `STATUS: DONE` (or `STATUS: BLOCKED` with the exact blocker) on the first line; the commit SHA and branch; files changed; RED and GREEN counts; mutants (92 killed); each gate command with its result (no whole-suite count, R100); SKIPPED items; deviations (P3, P4d, P9, P10, P17); and what the reviewer should look at first: the footer split and why (P3a, P10), `confirmRows`' `tc` (P3e), `AddStep`'s `transfer` (P3d), Next and the problem (P6), the unmasked typed amount (P9), the AX5 layout and what it leaves (P10), the catalogue's anchor and its merge with P2-T12 (P3f), the draft check's exemption (P3h), and the test traps (P12c).
