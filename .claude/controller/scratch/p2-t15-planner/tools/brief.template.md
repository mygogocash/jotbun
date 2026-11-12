# Brief P2-T15: The transfer, confirm and pick steps

You are the implementer for plan P2, Task P2-T15. You add the Bun Wallet add tray's transfer step (`TransferStep`: the from and to cards with each wallet's balance and what it holds after the move, the swap, the amount being moved and move all; `TransferFooter`: the note that a move is not spending, and Next), its confirm step (`ConfirmStep`: the category's tile, the title, what Bun read, the amount and one row per field, each opening its pick; `confirmTitle`, the title's rule), its four pick steps (`CategoryPick`, `WalletPick`, `DatePick`, `NotePick`, and `isPickStep` for the host), the steps' draft copy (`add/copy.ts` extended) and four catalogue sections (`addSections.tsx` extended), with one line of P2-T20's wallets-list test following the sections. The planner wrote every file below and proved it in a scratch copy of the integration head `88d82ce8` (its app code is `8434af6`): RED on typed stubs (14 of 14 render cases fail, each on an assertion), GREEN, 104 mutants (all killed), the focused neighbours, the catalogue's wallet sections, the routes tests and the fast local gate of R100. Do exactly what this brief says.

**This task starts after P2-T14** (#407, merged as `7cf4927a`, in the head). Step 0.2 checks it by content.

Read first, in this order:

1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. R100 applies: the fast local gate only (Step 6), and no whole-suite total anywhere; CI runs the whole suites on the PR. R87 applies: your receipt is its own file, `docs/implementation/receipts/P2-T15.md`; do not edit `premium-progress.md`.
2. The plan task: `docs/superpowers/plans/2026-10-25-jotbun-p2-bun-wallet-core.md`, `### Task P2-T15` (lines 940 to 968); W10, W12, W14 and W15 (lines 47, 49, 51 and 52); Review Focus 2 and 3 (lines 115 and 116); its Global Constraints (lines 82 to 108: copy and E2 on line 85, accessibility on line 87, colour on line 88, money on line 89, the R72 test traps on lines 94 to 99, both modes and both languages on line 106); P2-T14 (lines 901 to 937), which this task builds on; P2-T16 (lines 972 to 1009), which hosts these steps.
3. The boards: `docs/design/bun-wallet/rh-transfer.dc.html`, `bw-tray-confirm.dc.html` and `dk-tray-confirm.dc.html`.
4. The receipts this task builds on: `docs/implementation/receipts/P2-T14.md` and `P2-T14-fix.md` (the add flow, its rules and the amount step), `P2-T13.md` and `tray-hardening.md` (the tray), `P2-T10.md` (money text and private mode), `P2-T11.md` (looks, `MaterialFill`, `WalletCategoryIcon`) and `P2-T8.md` (how to mount through `mountWallet`).

## Paths and rules used below

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t15` (branch `p2/t15-transfer-confirm-pick`, made by the orchestrator from `origin/claude/p1a-vault-core`). Work only here.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t15`, your scratch folder. Create it with `mkdir -p`. Logs and the commit message go there. Never keep anything under `/private/tmp`.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t15-planner`, the planner's folder. Read it and `cp` from it; never write into it. It holds:
  - `real/`: the final version of the seven files this task creates or changes, at their repo paths (the receipt is yours);
  - `stubs/`: the RED forms (typed stubs) of `TransferStep.tsx`, `ConfirmStep.tsx` and `PickSteps.tsx`;
  - `orig/`: the three existing files this task changes, as they are in the head `88d82ce8` (`add/copy.ts`, `addSections.tsx`, `WalletsList.render.test.tsx`);
  - `diffs/`: one diff per changed existing file, paths `a/<repo path>` and `b/<repo path>` with full blob ids, so `git apply --3way` can merge them: `apps_app_src_wallet_add_copy.ts.diff`, `apps_app_src_dev_catalogue_wallet_addSections.tsx.diff` and `apps_app_src_wallet_wallets_WalletsList.render.test.tsx.diff`. The planner checked that each turns `orig/` into `real/` byte for byte (`PL/logs/applycheck.log`);
  - `tools/`: `stage.sh` (puts a tree at the base, RED or GREEN), `focused.sh` (the focused set: Node files, neighbours, the catalogue's wallet sections, the registry rule), `gate.sh` (the planner's GREEN focused set, routes and fast gate in one run), `mutants.py` (the mutant runner), `name_diffs.py`, `looks.mjs` (which material a sample wallet id derives), `fill_brief.py` and `brief.template.md` (how this brief was built: every code block below is the `real/` or `stubs/` file, byte for byte, and the mutant lines are `logs/mutants.out`), `sums.sh`;
  - `SHA256SUMS` (every file above) and `SHA256SUMS.logs` (everything in `logs/`, which the state commits leave out: `base-*`, `red-*`, `green-*`, `gate-*` (the fast gate), `mutants.out` and `mutant-logs/`, `applycheck.log`, `red-render.list` (Step 3.3's lines), `dev-*` (the planner's working runs), and `superseded/`, the first mutant round (103 mutants, all killed, run before ruling P4d widened the swap's seam and X21 was added)).
- Every shell call starts in a fresh directory, so type full paths. Below, WT, S and PL stand for the full paths above: type the full path. Git: `/usr/bin/git -C WT <command>`, one git command per call. npm: `cd WT && npm run <script>`. Focused Node files: `cd WT/apps/app && npm run test:unit -- <files>`. Focused render files: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts <files>`.
- This task needs no heavy lock: no database suite and no workers pool. Docker is stopped and stays stopped.
- To compare checksums: `shasum -a 256 <file>` and compare with the line for the same path in `PL/SHA256SUMS` (`real/...`, `stubs/...` or `orig/...`).
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests or code to make them pass. The only counts that may differ from this brief's are N, C and R (Step 1.3), and only as Step 0 says; and a load flake (a case that times out under load in a file this task does not touch: rerun that file alone once and record both runs).

## Scope

| File | Change |
| --- | --- |
| `apps/app/src/wallet/add/TransferStep.tsx` | **new** ({{LINES:apps/app/src/wallet/add/TransferStep.tsx}} lines). `TransferStep`, exactly the plan's props, and `TransferFooter` (P3a; P4 to P6). |
| `apps/app/src/wallet/add/ConfirmStep.tsx` | **new** ({{LINES:apps/app/src/wallet/add/ConfirmStep.tsx}} lines). `ConfirmStep`, the plan's props and `lookups` (P3c), and `confirmTitle` (P3b; P7, P8). |
| `apps/app/src/wallet/add/PickSteps.tsx` | **new** ({{LINES:apps/app/src/wallet/add/PickSteps.tsx}} lines). `CategoryPick`, `WalletPick` (with `back`, P3d), `DatePick` and `NotePick`, the plan's props, and `isPickStep` (P9). |
| `apps/app/src/wallet/add/AddSteps.render.test.tsx` | **new**, render suite ({{LINES:apps/app/src/wallet/add/AddSteps.render.test.tsx}} lines). 14 cases: the plan's five and nine more (P13). |
| `apps/app/src/wallet/add/copy.ts` | **extended** (P2-T14's draft table). The plan's thirteen lines and `add.addNote` (P3f). {{LINES:orig:apps/app/src/wallet/add/copy.ts}} lines before, {{LINES:apps/app/src/wallet/add/copy.ts}} after. |
| `apps/app/src/dev/catalogue/wallet/addSections.tsx` | **extended** (P2-T14's list), development only. Four sections after P2-T14's two, and their host (P3e, P11). {{LINES:orig:apps/app/src/dev/catalogue/wallet/addSections.tsx}} lines before, {{LINES:apps/app/src/dev/catalogue/wallet/addSections.tsx}} after. |
| `apps/app/src/wallet/wallets/WalletsList.render.test.tsx` | **shared** (P2-T20's). One line: its sections case's first id becomes `bw-tray-pick-category`, the add tray's last section now (P3e). {{LINES:orig:apps/app/src/wallet/wallets/WalletsList.render.test.tsx}} lines before and after; its 12 cases unchanged otherwise. |
| `docs/implementation/receipts/P2-T15.md` | **new**. Your receipt (R87). |

Not in this task: `addFlow.ts` (read, never changed: `confirmRows`, `balancesAfter`, `moveAllMinor`, `stillGuessed`, `filledKeypad`, `isFilled`, `trayTitleKey`), `AmountStep.tsx`, `TypeSwitchHeader.tsx`, `WalletKeypad.tsx`, `QuickChips.tsx` and `AmountStep.render.test.tsx` (P2-T14's; its suite runs unchanged); anything under `src/wallet/tray/`, `src/wallet/looks/`, `src/wallet/money/` or `src/wallet/privacy/` (read only); `src/ui/dateStep.ts`, `entryHelpers.ts` (the `Ranking` type only) and `recentCategories.ts` (read only); `src/dev/catalogue/wallet/index.ts` (no spread: P3e) and `registry.tsx`; `draftText.test.ts` (every new Thai line holds Thai letters, so `LATIN_LINES` does not change); `en.json` and `th.json` (no catalog line is added; today's lines are reused through `tc`); the add tray's host (P2-T16); any route, the app entry or native code; any package or lockfile; `premium-progress.md`.

## Planner rulings (the calls this brief makes, with the reason for each)

- **P1. Ready.**
  - Starts after P2-T14 (#407, merged `7cf4927a`, after its R106 fix round), in the head. It consumes `rank` and `Ranking` (P2-T5, #333), `WalletCategoryIcon` (P2-T11, #382) and `stepDay` and `canStepForward` (`src/ui/dateStep.ts`, at base), all in the head.
  - No package, lockfile change, Cloudflare resource, account setting or owner decision is needed. The copy follows owner Q3's default (P3f, P17).
- **P2. The proof's base is the head `88d82ce8`.** `git fetch` found `origin/claude/p1a-vault-core` at `88d82ce8`; `git diff --stat 8434af62 88d82ce8` lists only `.claude/` files, so its app code is `8434af6` (#416 P2-T20 and #418 P3-T5 merged). The planner built the copy with `git archive 88d82ce8` and `npm ci` (1416 packages) and ran every stage on it.
- **P3. The names and files beyond the plan's list.**
  - (a) **`TransferFooter`** (in `TransferStep.tsx`) is the transfer step's footer, for the tray's pinned `footer`, as P2-T14's `AmountFooter` is the amount step's: rh-transfer pins the note and Next at the tray's foot. Both take `StepProps`, so a host spreads one object into both.
  - (b) **`confirmTitle(draft, rows, t)`** (in `ConfirmStep.tsx`) is the plan's title rule in one place ("the merchant, else the note, else the category's name"), for P2-T16, which passes its answer as `ConfirmStep`'s `title`. With none of the three (a move with no note, spending with no category) it is the tray's title (`trayTitleKey`), so the title is never empty. `t` reads the add tray's lines.
  - (c) **`ConfirmStep` takes `lookups`** (the `Lookups` the host already holds, as `AmountStep` takes them): the plan's props cannot reach the category's look for its tile, nor a wallet row's material.
  - (d) **`WalletPick` takes `back`** (the step it goes back to; `confirm` when absent). The plan says "a pick returns to confirm", but the transfer step's cards open the from and to picks, and P2-T14's amount step opens the wallet pick from its chip; returning those to confirm would skip the step the person was on (and, from the amount step, Next's check that there is an amount). The other three picks open only from confirm's rows, so they always go back to confirm. **`isPickStep(step)`** tells the host which steps are picks, so it can keep the step that opened one, for `back` and for the tray's back button.
  - (e) **The sections join P2-T14's list in `addSections.tsx`**, the plan's file (`WALLET_ADD_SECTIONS` gains four after `bw-tray-income`), so `index.ts` is untouched and no spread can collide with the work in flight. P2-T20's sections case reads the add tray's last section right before its own (`WalletsList.render.test.tsx`, `ids.slice(at - 1, at + 3)`), so its first id becomes `bw-tray-pick-category`: one line (the diff in `PL/diffs/`). P2-T14's sections case (`ids.slice(at - 4, at + 2)` around `bw-tray-amount`) passes unchanged, since the new sections come after `bw-tray-income`.
  - (f) **`copy.ts`**: the plan's thirteen lines as written (`add.after` to `add.today`), and one more: `add.addNote` เพิ่มโน้ต, bw-tray-confirm's words for the note row with nothing written. An unchosen wallet says P2-T14's `add.chooseWallet` (เลือกกระเป๋า), the same words as the amount step's chip. Four lines are today's catalog lines, reused through `tc` (Global Constraints, line 85): "Choose a category" (เลือกหมวดหมู่), "Choose two different wallets" (เลือกกระเป๋าเงินสองใบที่ต่างกัน, as today's `WalletPicker` says it), "Previous day" and "Next day" (วันก่อนหน้า, วันถัดไป, as today's `DateChip` names its arrows). The English lines are drafts for E2-B.
- **P4. The transfer step (rh-transfer; W14).**
  - (a) A transfer goes amount, transfer, confirm (P2-T14's `stepAfterAmount`). So the keypad stays the amount step's, and this step shows the amount being moved (52 pt, the board's, centred) without keys, with move all under it.
  - (b) The from and to cards: at least 84 pt, radius 18, each on its wallet's own material (`MaterialFill` from `useWalletLooks().lookOf`), with the side's word (`add.rowFrom` จาก, `add.rowTo` ไป), the name, and, when the balance is known, the balance (`WalletAmount` 17, `sign="balance"`, so a card below zero reads −฿) and the after line (`add.after` around a `WalletAmount` 13), in the material's text colours. `balancesAfter` works in BigInt, so a balance past 2^53 stays exact (the case pins ฿90,071,992,547,409.93 less ฿500).
  - (c) Each card is a button that opens its side's wallet pick (`from`, `to`), which comes back here (P3d). Its label is the side, the name, the balance in words and the after line in words (no "tap to change": a button says it is one).
  - (d) Swap is the plan's `IconButton` (`add.swap`), on the seam between the cards as rh-transfer draws it; it exchanges the two wallets in the draft, so each card's name, balance and after line follow its own wallet. The cards are 22 pt apart (the board draws 8), so the 44 pt button overlaps only their 11 pt padding: on the board's 8 pt seam it would cover 7 pt of each card's words at its centre, where a long name's last line runs (the planner's own check of the layout; mutant X21 pins it).
  - (e) Archived wallets are never shown, as today's `WalletPicker`: a side whose wallet is archived or unknown asks for one (เลือกกระเป๋า), on `raised`.
  - (f) Offline (`balances` null) there are no balances: names only, no after line and no move all (`moveAllMinor` gives null), since a guessed balance would be a wrong number on screen.
- **P5. Move all and the amount cap (the P2-T14 review's note for this task).** Move all fills the amount with the from wallet's whole balance as a fill (`filledKeypad`), so private mode masks it (P8). It is offered only when that balance is known, above zero (`moveAllMinor`) and at most ฿999,999,999.99 (`MINOR_AMOUNT_MAX`): `keypadFromMinor` throws above the cap, and a record cannot hold more. Today's Quick add instead offers it and then shows the cap's words; here nothing is offered, so nothing, in private mode or out, says that a hidden balance is above the cap. That settles the followup "when move all is refused in private mode, the cap's words over a masked line show that the hidden balance is above the cap".
- **P6. The transfer footer.** The note (`add.transferNote`, the board's info mark and caption in `quiet`), then Next (`common.next`), which goes to confirm and is enabled only with two different wallets chosen. One wallet on both sides (a draft opened with one wallet, or a copy) says today's words above it, as a polite alert, also said on iOS (`useAnnouncement`). A side with no wallet only keeps Next waiting, and its card asks: nothing nags (§2).
- **P7. The confirm step (bw-tray-confirm, dk-tray-confirm; W12, W15).**
  - (a) The summary: the category's tile (`WalletCategoryIcon` at 52, the board's), or for a move the swap mark on a `raised` 52 pt tile, or an empty tile when no category is chosen; the title (`h2`); what Bun read (`add.bunReadFrom`, caption in violet) when the host passes `bunSentence`; and the amount at 44 (the plan's; the board draws 32): DM Sans 700, ink for spending and a move, violet with a plus for income (§2, `walletMoneyText`'s income sign).
  - (b) The rows: one button per `ConfirmRow`, in its order, at least 52 pt (the board's 14 pt padding), on one `raised` group with hairline separators: the row's name in `quiet`, then Bun's mark (`add.bunGuess` in violet, ringed in violet) on a guessed row, the wallet's material (30 by 20) on a wallet, from or to row, the value, and a chevron. A row says its name, its value and, when guessed, บันเดา. A tap opens its pick (`onStep(row.key)`).
  - (c) A row with nothing chosen or written says what to add, in `quiet`: the category row today's "Choose a category", a wallet row เลือกกระเป๋า, the note row เพิ่มโน้ต. The date row is never empty (P2-T14's `dayLabel`: วันนี้, เมื่อวาน or the date), and there is no time (W12) and no photo row (W15).
  - (d) Back to the amount ("Confirm: back to the amount") and Save ("The confirm footer's button is the host's") are the host's (P2-T16): the tray's `onBack` and `footer`. The step draws neither.
- **P8. Private mode (W10; Review Focus 2).**
  - (a) Stored amounts are `WalletAmount`s, masked as ฿•••• at their own size: the cards' balances and after lines, move all's amount and the wallet pick's balances. Each label says only that its amount is hidden (ซ่อนยอดเงินอยู่).
  - (b) The amount line on the transfer and confirm steps follows the amount step's rule (R106, P2-T14's P9): what the person typed shows; a fill (move all, Bun's reading, a chip) is ฿•••• and says it is hidden.
  - (c) What Bun read is the person's own words, but it holds the amount Bun read, beside an amount masked as a fill. So in private mode every number in it is masked, with any ฿ before it: “ข้าวมันไก่ ฿50 กับน้ำ 1,250.50 และ ๒๐” reads “ข้าวมันไก่ ฿•••• กับน้ำ ฿•••• และ ฿••••” (Thai digits too).
  - (d) The case sweeps every word and label in the tray for a digit: none, but the amount the person typed.
- **P9. The picks.**
  - (a) Each writes its choice into the draft through `onDraft`, then goes back (P3d). The tray's back (the host's) leaves a pick with nothing changed: the day and the note are held in the step until เสร็จ (`common.done`), and the category and the wallet change only on a tap.
  - (b) `CategoryPick`: the type's categories in use, in the ranking's order (top, then the rest), then any the ranking does not hold (made since it was ranked), in the order `categories` lists them; an archived one is left out even when the ranking still holds it. A grid of 52 pt tiles with names, four across (two at the largest text sizes, as today's grid), one radio group named หมวด; the chosen tile ringed in violet with its name bold, so the choice never rests on colour alone. A tap ticks once (`chipPick`, as today's grid) and sets that type's category. A move has no category: the step draws nothing.
  - (c) `WalletPick`: the wallets in use, each a radio row (at least 56 pt, on `raised`) with a radio mark, its material, its name and its balance when known; the chosen one ringed in violet. One radio group named by its role (กระเป๋า, จาก, ไป). For a move, picking the wallet already on the other side swaps the two, as the swap button does, so a pick never puts one wallet on both sides. No tick (today's picker has none).
  - (d) `DatePick`: ‹ and › step one day (`stepDay`), never past today (`canStepForward`) and never before `earliest` (the wallet's tracking start, `canStepBack`): an arrow that cannot step is disabled and does nothing, and a draft dated before the start opens at the start. The day shows as its label (`dayLabel`) and in full under it (`fullDateLabel`), in a polite live region. วันนี้ (`add.today`, a `TextLink`) comes back to today and shows only on another day. Each day change ticks once (`dateStep`), as today's date chip does. เสร็จ keeps the day.
  - (e) `NotePick`: one field named โน้ต, at most 500 characters (`NOTE_MAX_CHARS`), with เพิ่มโน้ต as its placeholder, and เสร็จ.
- **P10. The largest text sizes (Review Focus 3).** At AX5: each card stacks its amounts under its name, and the swap takes its own row between the cards, so it never covers a card's words; the confirm summary and each row stack (name above value); the category grid is two across; a wallet row stacks. No `Text` is clamped or shrunk (`numberOfLines`, `adjustsFontSizeToFit`, `ellipsizeMode` unset), so an 80-code-point Thai name and ฿999,999,999.99 wrap. The amount lines grow with the text to 64 pt and no more (`amountMaxScale`).
- **P11. The sections.**
  - `bw-tray-transfer` (rh-transfer's move: ฿500 from บัญชีหลัก ฿24,860 to เงินสด ฿1,240, its after lines, swap and move all), `bw-tray-confirm` (bw-tray-confirm typed: ฿50 of อาหาร from บัญชีหลัก, today), `bw-tray-confirm-bun` (as Tell Bun filled it: ข้าวมันไก่, what Bun read, ฿50 as a fill, the category marked as Bun's guess) and `bw-tray-pick-category` (spending's categories, อาหาร chosen).
  - Each puts its step in a `Tray` that opens at once, titled from `trayTitleKey`, with a small host (`StepsTray`) that moves as P2-T16's will: Next goes on to confirm, a row opens its pick, a card opens its wallet pick, a pick goes back to the step that opened it, the tray's back leaves a pick unchanged, and a change undoes Bun's guess on that row (`stillGuessed`). Save goes nowhere, and there is no back to the amount (P7d). Open the tray brings it back as it started.
  - Samples: the boards' day `2026-10-24`; three wallets whose ids derive the boards' materials (`bw-add-main-account` lavender silk, `bw-add-cash-wallet` cream paper, `bw-add-savings-wallet` peach; `PL/tools/looks.mjs`); the built-in categories, ranked by `rankRecentCategories` with no records (P2-T5's `rank` lives in `entryHelpers.ts`, which loads `expo-crypto`, which no catalogue list may load).
  - The titles are `Bun Wallet: add tray, transfer`, `Bun Wallet: add tray, confirm`, `Bun Wallet: add tray, confirm with Bun's reading` and `Bun Wallet: add tray, choose a category` (R72: unique, never a heading the section draws). No section imports the harness.
- **P12. The test seams, each explained in the test file's header or beside its use.**
  - A probe holds the draft, the keypad, the step shown, where a pick goes back to (`isPickStep`) and Bun's guesses (`stillGuessed`), and switches steps as `onStep` asks, inside a `Tray`, as the plan's Step 1 asks.
  - Reanimated keeps the tray's card, and each new step's content, unseen until an `animationstart` that happy-dom never fires, and queries by role skip what is unseen: `startAnimations()` fires it after every mount and step change (`tap`), as `Tray.render.test.tsx` and `AmountStep.render.test.tsx` do.
  - react-native-web drops `numberOfLines`, `adjustsFontSizeToFit` and `maxFontSizeMultiplier`, so the props reaching `@mobile/theme/AppText`'s `Text` are recorded, as `WalletCard.render.test.tsx` does.
  - `playHaptic` is mocked, so each case reads the moments by name; the tray ticks each step change itself (`trayStep`).
  - react-native-web omits `aria-disabled` when it is false, and draws `transparent` as `rgba(0, 0, 0, 0.00)`.
  - The test imports nothing that loads `expo-crypto` (`Ranking` is a type import), so it mocks none.
- **P13. The cases beyond the plan's.** The plan's five: confirm (฿50, the category, the wallet, วันนี้, each row 44 pt); a guessed row; the transfer (balances after, swap, move all, offline); a pick returns to confirm; the date's bounds. Nine more: a card's pick comes back to the transfer step, and picking the other side's wallet swaps; one wallet on both sides, a side with none and an archived wallet; private mode (P8); move all's offer at zero, below zero, above the cap, at the cap and at one satang; AX5 (P10); every control at least 44 pt; the category pick's order, archived and missing categories, the chosen one, income's own and none for a move; confirm for a move and for income, and with no category; and the sections. The cases that draw colour or words run in Thai and English (confirm in both modes as well); the rest run in Thai by day (Global Constraints, line 106).
- **P14. 104 mutants, all killed.** They cover the transfer step (X1 to X21; X1 is the plan's "swap without swapping the balances", modelled as balances that stay where the step opened them while the names swap), its footer (F1 to F7), the confirm step (C1 to C28), the picks (P1 to P35; P22 is the plan's "let the date step pass today"), the copy (K1 to K6) and the sections (S1 to S7). Every kill is an `AssertionError`; none survives, and none is marked equivalent.
- **P15. Clear of the work in flight; merge order.**
  - None of #412 (P2-T25), #411 (P2-T32), #420 (P3-T2), #421 (P2-T31) or #423 (P2-T29) touches `src/wallet/add/`, `addSections.tsx` or `WalletsList.render.test.tsx`, and none of their tests reads the wallet sections' order (the planner read each branch: `origin/p2/t25-recently-deleted`, `origin/p2/t29-categories`, `origin/p2/t31-insights`, `origin/p3/t2-transaction-source`, `origin/promote/p2-t32`). This task does not touch `index.ts`, where each of them adds a spread, so it merges cleanly before or after any of them.
  - Their sections add to C (Step 1.3) if they merge first; P2-T25's sections come after the wallets list's, so P2-T20's sections case, which this task edits, still reads `bw-tray-pick-category` right before `bw-wallets`.
  - #420 (P3-T2) changes `packages/contracts` (transactions, the AI drafts) and `diaryRepository.ts`; this task reads only `MINOR_AMOUNT_MAX`, `NOTE_MAX_CHARS`, `BUILTIN_CATEGORIES` and the `CategoryDto`, `Minor` and `WalletSnapshot` types there, so either order works (Step 0.3).
- **P16. The gate (R100).** Run: `typecheck:app`; the focused file RED to GREEN; P2-T3's draft check and P2-T14's Node files; the eight neighbours (the render files that read the add folder or the wallet's section list); the catalogue's wallet sections in the every-section and screen-reader suites (`-t "bw-"`) and the registry rule; the four routes tests (`SpendRoutes`, `AccountRoutes`, `InsightsRoutes`, `PlanningRoutes`, each named) and the catalogue's route test (`catalogueRoute.render.test.tsx`, whose route loads the wallet's sections); `test:app`; `test:unit`; `git diff --check`. No route, config or app entry changes, so there is no `typecheck:routes` and no `export:web` locally; CI runs the full render suite, `export:web` and the iOS export. Nothing outside `apps/app` changes, so there is no API, edge or database suite; no package changes, so no `test:ops`.
- **P17. For E2-B (the owner's look at the daily loop), the differences from the boards:**
  - rh-transfer: the transfer is its own step after the amount, so the keys are the amount step's and this step shows the amount without them; Next says ถัดไป (the boards ต่อไป); the swap is P2-T10's `IconButton` (a `card` circle with a hairline ring), as the plan names it, not the board's ink circle, and the cards are 22 pt apart, not 8 (P4d); the to side says ไป (the plan's), the board ไปยัง; the balances are at 17 and the after amounts at 13 (the board draws 18 and 12); no small glass card mark beside the name; move all is a 44 pt pill with its amount at 16 (the board 14); at AX5 the swap takes its own row.
  - bw-tray-confirm: the amount at 44 (the board 32); no time on the date row (W12) and no photo row (W15); Bun's mark is a violet ring with violet words (the board's light violet fill is not in the palette); rows at 52 pt with their words at 17 (the board 16); the chevron in `quiet` (the board #8A879A); the back to the amount, the title ตรวจก่อนบันทึก and Save are the host's (P7d): the sections draw the tray's title, and a Save that goes nowhere.
  - No board: the one-wallet words under the transfer step, and every pick (the category grid, the wallet rows, the day stepper with วันนี้ and เสร็จ, the note field), all drafts.
  - Every English line is a draft.
- **P18. Notes for later tasks** (the receipt carries them):
  - **P2-T16 (the host):**
    - Steps: amount, then confirm, or amount, transfer, confirm. A row opens its pick; keep the step that opened a pick (`isPickStep`) and pass it as `WalletPick`'s `back` (the transfer step's cards, the amount step's wallet chip); the tray's back on a pick goes there with nothing changed, and on the transfer and confirm steps to the amount.
    - Footers: `AmountFooter` on the amount, `TransferFooter` on the transfer, Save on confirm; none on a pick (its เสร็จ is in its middle).
    - `ConfirmStep`: `rows` from `confirmRows(draft, { lookups, today, dateLocale, guessed, tc })`, `title={confirmTitle(draft, rows, t)}` with `t` reading `add/copy.ts`, `bunSentence` what the person told Bun when Tell Bun filled the entry (else null), and `lookups`. `DatePick`: `earliest={earliestFor(draft, wallets) ?? undefined}` (`entryHelpers.ts`). Pass every `onDraft` through `stillGuessed`.
    - Still yours, from P2-T14's reviews: where the type switch goes on the steps after the amount at AX5, and that a change to transfer always goes to the transfer step. These steps draw no switch, and the sections leave it out.
    - A copied move with one wallet on both sides can reach confirm only if the host opens it there; `TransferFooter` keeps the transfer step from going on with one wallet or none.
  - **P2-T27 (the edit tray):** reuses `ConfirmStep` and the picks; `WalletPick`'s `back` names the step that opened it.
  - **P2-T37 (the sweep):** the amount lines `transfer-amount` and `confirm-amount` show what the person typed, as `add-amount` does (P2-T14's P9), never a fill; Bun's sentence has no digit in private mode; the day stepper's dates (พฤหัส 22 ต.ค.) and older date rows carry digits that are not amounts.
  - **E2-B:** capture `bw-tray-transfer`, `bw-tray-confirm`, `bw-tray-confirm-bun` and `bw-tray-pick-category` each from a fresh launch (P2-T13's n2), at AX5 by hand (the large-text suite does not open the tray sections); P17's differences.
- **P19. The followups that name this task (`followups.md`), each carried:**
  - P2-T14's planner, P3: "P2-T15 adds the confirm step's row labels (`labelKey`)": `add.rowCategory` to `add.rowNote`, the plan's words.
  - P2-T14's confirming review: "when move all is refused in private mode, the cap's words over a masked line show that the hidden balance is above the cap": settled by P5 (never offered above the cap).
  - The controller's P2-T14 items for P2-T16 (the switch's place at AX5 on confirm and the pickers; a change to transfer goes to the transfer step): P2-T16's, since the host owns the header and the type; recorded in P18.

---

## Step 0: Sync, and what this task waits for

1. `/usr/bin/git -C WT fetch origin claude/p1a-vault-core`, then `/usr/bin/git -C WT merge --no-edit origin/claude/p1a-vault-core`. Expected: "Already up to date.", or a fast-forward. Then `/usr/bin/git -C WT rev-parse --short HEAD`, and record it.
2. P2-T14 has merged, and this task has not:
   - `grep -c "export function confirmRows(" WT/apps/app/src/wallet/add/addFlow.ts` and `grep -c "'bw-tray-income'" WT/apps/app/src/dev/catalogue/wallet/addSections.tsx`. Expected: `1` and `1`. If either prints `0`, report BLOCKED: "P2-T14 has not merged; P2-T15 starts after it (brief P1)".
   - `ls WT/apps/app/src/wallet/add/TransferStep.tsx WT/apps/app/src/wallet/add/ConfirmStep.tsx WT/apps/app/src/wallet/add/PickSteps.tsx WT/apps/app/src/wallet/add/AddSteps.render.test.tsx`: "No such file or directory" four times.
3. `/usr/bin/git -C WT diff --stat 88d82ce8 HEAD -- apps/app packages package.json package-lock.json`. Expected: nothing, or the work in flight (P15).
   - If it lists a file this task creates, report BLOCKED with the output.
   - If it lists `apps/app/src/wallet/add/copy.ts`, `apps/app/src/dev/catalogue/wallet/addSections.tsx` or `apps/app/src/wallet/wallets/WalletsList.render.test.tsx`, go on: Step 2.1 or Step 4.1 applies that file's diff with `git apply --3way`.
   - If it lists a file this task's code calls into, go on, but name it in the receipt; a differing Expected line later is then a BLOCKED with this list: `apps/app/src/wallet/add/addFlow.ts`, `apps/app/src/wallet/add/AmountStep.tsx`, `apps/app/src/wallet/add/TypeSwitchHeader.tsx`, `apps/app/src/wallet/tray/Tray.tsx`, `apps/app/src/wallet/tray/PrimaryButton.tsx`, `apps/app/src/wallet/tray/TextLink.tsx`, `apps/app/src/wallet/controls/IconButton.tsx`, `apps/app/src/wallet/money/WalletAmount.tsx`, `apps/app/src/wallet/money/walletMoney.ts`, `apps/app/src/wallet/privacy/PrivateModeProvider.tsx`, `apps/app/src/wallet/looks/WalletLooksProvider.tsx`, `apps/app/src/wallet/looks/WalletCategoryIcon.tsx`, `apps/app/src/wallet/looks/MaterialFill.tsx`, `apps/app/src/wallet/common/copy.ts`, `apps/app/src/wallet/testing/walletHarness.tsx`, `apps/app/src/ui/dateStep.ts`, `apps/app/src/ui/keypadExpression.ts`, `apps/app/src/spend/v1/redesign/recentCategories.ts`, `apps/app/src/spend/v1/viewModels.ts`, `apps/app/src/screens/redesign/entry/entryHelpers.ts`, `apps/app/src/messages/en.json`, `apps/app/src/messages/th.json`.
   - Under `packages/`: go on if every file listed is #420's (`packages/contracts/src/v1/transactions.ts`, `packages/contracts/src/v1/ai.ts`, `packages/contracts/src/index.ts`), and name it in the receipt; anything else under `packages/`, or `package.json` or `package-lock.json`: BLOCKED.
   - Any other file: go on. The focused counts this task does not change (N, C, R) are then your own Step 1.3 base, and the receipt names each merge.
   - Then run `/usr/bin/git -C WT log --oneline 88d82ce8..HEAD`, and keep the merged PRs it lists for the receipt.
4. The three existing files: `shasum -a 256 WT/apps/app/src/wallet/add/copy.ts WT/apps/app/src/dev/catalogue/wallet/addSections.tsx WT/apps/app/src/wallet/wallets/WalletsList.render.test.tsx`. Each equals its `orig/` line, except a file Step 0.3 listed. If anything else differs, report BLOCKED.

## Step 1: Install and the focused base

1. `cd WT && npm ci --ignore-scripts --no-audit --no-fund > S/npm-ci.log 2>&1; echo $?`. Expected: 0 and "added 1416 packages".
2. `cd WT && npm run typecheck:app > S/base-typecheck.log 2>&1; echo $?`. Expected: 0.
3. The focused base (the per-file counts this task's Expected lines build on; R100: no whole-suite count):
   - `sh PL/tools/focused.sh WT S/base > S/base-focused.out 2>&1; cat S/base-focused.out`. Expected: `unit exit 0`, `neighbours exit 0`, `catalogue exit 0`, `registry exit 0`, and in its four logs:
     - `S/base-unit.log`: `ℹ tests 12`, `ℹ pass 12` (`addFlow.test.ts` 7, `amountStepNative.test.ts` 1, `draftText.test.ts` 4);
     - `S/base-neighbours.log`: `Test Files  8 passed (8)`, `Tests  138 passed (138)` (`AmountStep` 15, `WalletsList` 12, `Tray` 27, `CardStack` 15, `Lock` 38, `WalletLooks` 13, `PrivateMode` 9, `walletHarness` 9). Call this count N;
     - `S/base-catalogue.log`: `Tests  42 passed` (twenty-one wallet sections, two suites), more if a task in flight with sections merged first (P15). Call this count C. Ignore the `skipped` count: it moves with the head;
     - `S/base-registry.log`: `Tests  1 passed`.
   - The routes tests and the catalogue's route test: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/screens/redesign/SpendRoutes.render.test.tsx src/screens/redesign/account/AccountRoutes.render.test.tsx src/screens/redesign/insights/InsightsRoutes.render.test.tsx src/screens/redesign/planning/PlanningRoutes.render.test.tsx src/dev/catalogue/catalogueRoute.render.test.tsx > S/base-routes.log 2>&1; echo $?`. Expected: 0, `Test Files  5 passed (5)`, `Tests  15 passed (15)` at the brief's base (`SpendRoutes` 3, `AccountRoutes` 2, `InsightsRoutes` 3, `PlanningRoutes` 4, `catalogueRoute` 3); more if #412, #411 or #421 merged first (each adds cases to its routes test). Call this count R.

## Step 2: The test, the copy and the typed stubs (plan Step 1)

1. Copy:
   ```bash
   cp PL/real/apps/app/src/wallet/add/AddSteps.render.test.tsx WT/apps/app/src/wallet/add/AddSteps.render.test.tsx
   cp PL/real/apps/app/src/wallet/add/copy.ts WT/apps/app/src/wallet/add/copy.ts
   cp PL/stubs/apps/app/src/wallet/add/TransferStep.tsx WT/apps/app/src/wallet/add/TransferStep.tsx
   cp PL/stubs/apps/app/src/wallet/add/ConfirmStep.tsx WT/apps/app/src/wallet/add/ConfirmStep.tsx
   cp PL/stubs/apps/app/src/wallet/add/PickSteps.tsx WT/apps/app/src/wallet/add/PickSteps.tsx
   ```
   If Step 0.3 listed `apps/app/src/wallet/add/copy.ts`, use this in place of its `cp`: `/usr/bin/git -C WT apply --3way PL/diffs/apps_app_src_wallet_add_copy.ts.diff`. It must apply with no conflict; otherwise report BLOCKED.
2. `shasum -a 256` the five files and compare: the `real/` lines for the test and `copy.ts` (only when it was copied), the `stubs/` lines for the three others. If a `cp` source is missing or a checksum differs, report BLOCKED.
3. The stubs, for reference: the real exported names and types, and no behaviour. `addSections.tsx` and `WalletsList.render.test.tsx` stay as at the start until Step 4.

`apps/app/src/wallet/add/TransferStep.tsx` (stub):
{{CODE:stubs:apps/app/src/wallet/add/TransferStep.tsx}}

`apps/app/src/wallet/add/ConfirmStep.tsx` (stub):
{{CODE:stubs:apps/app/src/wallet/add/ConfirmStep.tsx}}

`apps/app/src/wallet/add/PickSteps.tsx` (stub):
{{CODE:stubs:apps/app/src/wallet/add/PickSteps.tsx}}

## Step 3: RED (plan Step 2)

1. `cd WT && npm run typecheck:app > S/red-typecheck.log 2>&1; echo $?`. Expected: 0.
2. `cd WT/apps/app && npm run test:unit -- src/wallet/add/addFlow.test.ts src/wallet/add/amountStepNative.test.ts src/wallet/copy/draftText.test.ts > S/red-unit.log 2>&1; echo $?`. Expected: 0, `ℹ tests 12`, `ℹ pass 12`, `ℹ fail 0` (P2-T3's draft check reads the new copy lines, which hold Thai letters).
3. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/add/AddSteps.render.test.tsx > S/red-render.log 2>&1; echo $?`. Expected: 1, `Test Files  1 failed (1)`, `Tests  14 failed (14)`, no "Unhandled" section, `grep -c '^AssertionError' S/red-render.log` gives 14 and `grep -cE 'Cannot find module|Failed to resolve|SyntaxError|is not a function|TestingLibraryElementError' S/red-render.log` gives 0. Failing, each on an `AssertionError` from an asserting lookup:
{{RED_RENDER}}
   Compare with `PL/logs/red-render.log`.

## Step 4: GREEN (plan Steps 3 and 4)

1. Copy the code:
   ```bash
   cp PL/real/apps/app/src/wallet/add/TransferStep.tsx WT/apps/app/src/wallet/add/TransferStep.tsx
   cp PL/real/apps/app/src/wallet/add/ConfirmStep.tsx WT/apps/app/src/wallet/add/ConfirmStep.tsx
   cp PL/real/apps/app/src/wallet/add/PickSteps.tsx WT/apps/app/src/wallet/add/PickSteps.tsx
   cp PL/real/apps/app/src/dev/catalogue/wallet/addSections.tsx WT/apps/app/src/dev/catalogue/wallet/addSections.tsx
   cp PL/real/apps/app/src/wallet/wallets/WalletsList.render.test.tsx WT/apps/app/src/wallet/wallets/WalletsList.render.test.tsx
   ```
   If Step 0.3 listed `addSections.tsx` or `WalletsList.render.test.tsx`, use `/usr/bin/git -C WT apply --3way PL/diffs/<that file's diff>` in place of its `cp`. It must apply with no conflict; otherwise report BLOCKED.
2. `shasum -a 256` the seven files against their `real/` lines in `PL/SHA256SUMS` (all equal; a file applied with `--3way` only when its start was the `orig/` one). `/usr/bin/git -C WT status --short` shows exactly ` M apps/app/src/dev/catalogue/wallet/addSections.tsx`, ` M apps/app/src/wallet/add/copy.ts`, ` M apps/app/src/wallet/wallets/WalletsList.render.test.tsx`, `?? apps/app/src/wallet/add/AddSteps.render.test.tsx`, `?? apps/app/src/wallet/add/ConfirmStep.tsx`, `?? apps/app/src/wallet/add/PickSteps.tsx` and `?? apps/app/src/wallet/add/TransferStep.tsx` (`M ` in the first column, staged, for a file `git apply --3way` wrote).
3. The code, for reference: the Appendix holds every file (read them before the receipt; their headers say why). `TransferStep.tsx`: P3a, P4 to P6; `ConfirmStep.tsx`: P3b, P3c, P7, P8; `PickSteps.tsx`: P3d, P9; `addSections.tsx`: P3e, P11; `copy.ts`: P3f.
4. `cd WT && npm run typecheck:app > S/green-typecheck.log 2>&1; echo $?`. Expected: 0.
5. `cd WT/apps/app && npm run test:unit -- src/wallet/add/addFlow.test.ts src/wallet/add/amountStepNative.test.ts src/wallet/copy/draftText.test.ts > S/green-unit.log 2>&1; echo $?`. Expected: 0, `ℹ tests 12`, `ℹ pass 12`, `ℹ fail 0`.
6. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/add/AddSteps.render.test.tsx > S/green-render.log 2>&1; echo $?`. Expected: 0, `Test Files  1 passed (1)`, `Tests  14 passed (14)`, each case marked `✓`, and `grep -c '^stderr |' S/green-render.log` gives 0 (no `act(...)` warning and no `console.error`).
7. The neighbours, the catalogue's wallet sections and the registry rule: `sh PL/tools/focused.sh WT S/green > S/green-focused.out 2>&1; cat S/green-focused.out`. Expected: four exits 0, and: `S/green-unit.log` 12 of 12; `S/green-neighbours.log` `Tests  N passed (N)` (138 at the brief's base: P2-T20's sections case now reads `bw-tray-pick-category` before its own, and P2-T14's still finds its two after the tray's); `S/green-catalogue.log` `Tests  C + 8 passed` (50 at the brief's base: four sections, two suites), with each of `bw-tray-transfer`, `bw-tray-confirm`, `bw-tray-confirm-bun` and `bw-tray-pick-category` marked `✓` in both suites; `S/green-registry.log` `Tests  1 passed`.

## Step 5: Mutation check (plan Step 5)

1. `python3 -I PL/tools/mutants.py WT S/mutant-logs > S/mutants.out 2>&1; echo $?`. It applies each mutant alone, runs `AddSteps.render.test.tsx`, and restores the file with its SHA-256 checked. It takes fifteen to thirty minutes, by the machine's load. Expected: exit 0, and these 105 lines (each line in your file also gives the suite's counts, the AssertionError count and "restored sha256 equal"; compare with `PL/logs/mutants.out`):
   ```
{{MUTANTS}}
{{MUTANT_TOTAL}}
   ```
   X1 and P22 are the plan's two mutants.
2. `shasum -a 256` the seven files against `real/` again, and run `/usr/bin/git -C WT status --short`. Expected: unchanged from Step 4.2.

## Step 6: The fast local gate (R100)

From WT, in this order, each with its log in S:

1. `npm run typecheck:app > S/gate-1-typecheck.log 2>&1; echo $?`: exit 0.
2. `npm run test:app > S/gate-2-test-app.log 2>&1; echo $?`: exit 0, `ℹ fail 0`. (No count is expected here: CI holds the whole suites, R100.)
3. `npm run test:unit > S/gate-3-test-unit.log 2>&1; echo $?`: exit 0, `ℹ fail 0`.
4. The focused files once more: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/add/AddSteps.render.test.tsx src/wallet/add/AmountStep.render.test.tsx src/wallet/wallets/WalletsList.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/wallet/card/CardStack.render.test.tsx src/wallet/lock/Lock.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx > S/gate-4-focused.log 2>&1; echo $?`: exit 0, `Test Files  9 passed (9)`, `Tests  14 + N passed` (152 at the brief's base). A case that times out near 5 s in a file this task does not touch is a load flake: rerun that file alone once, record both runs, and do not change it.
5. The routes tests and the catalogue's route test (the controller's rule): the Step 1.3 routes command with `S/gate-5-routes.log`. Expected: 0, `Test Files  5 passed (5)`, `Tests  R passed (R)` (15 at the brief's base), unchanged.
6. `/usr/bin/git -C WT diff --check` (before the commit) and, after it, `/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD`: no output.

Not run, and why (put this in the receipt): `typecheck:routes` and `export:web` (no route, config or app entry changes; CI runs `export:web`); the full render suite (CI, R100; the catalogue's every-section and screen-reader suites pick up the four sections there, and the large-text suite does not open them); the iOS export (CI); `test:ops` (no package or lockfile change); the API, edge and database suites (nothing outside `apps/app` changes; Docker is stopped); and device and simulator checks, all SKIPPED: VoiceOver on the cards, the rows, the picks' radio groups and the day's live region; the swap button on the seam on a phone (its ring on each material); the note field with the Thai keyboard up on a 667 pt phone; Android's back on a pick; and E2-B's screenshots (the controller's, after P2-T28).

## Step 7: Receipt

Write `docs/implementation/receipts/P2-T15.md` in the house style (see `docs/implementation/receipts/P2-T20.md`), with your own numbers where they differ from these. Start from:

```markdown
# P2-T15: The transfer, confirm and pick steps

- **Status:** built and verified locally on `p2/t15-transfer-confirm-pick` (`.claude/worktrees/p2-t15`), from `<head>`. Not pushed. The independent review is the controller's, after this receipt. Under ruling R87 this receipt is its own file; `premium-progress.md` is not edited.
- **Base:** `<head>`. (The brief was proven at `88d82ce8`. Name each merged PR from `git log --oneline 88d82ce8..HEAD`, and any shared file applied with `git apply --3way`.)
- **Files:** created `apps/app/src/wallet/add/TransferStep.tsx`, `ConfirmStep.tsx`, `PickSteps.tsx`, `AddSteps.render.test.tsx` (14 cases) and this receipt; modified `apps/app/src/wallet/add/copy.ts` (fourteen lines), `apps/app/src/dev/catalogue/wallet/addSections.tsx` (four sections and their host) and `apps/app/src/wallet/wallets/WalletsList.render.test.tsx` (one line).
- **What changed:** (the transfer step and its footer; move all and the cap; the confirm step and its title; private mode; the picks and where each goes back; the sections; the copy.)
- **RED to GREEN:** ... (Steps 3 and 4: the 14 render failures and their messages, with the Node files 12 of 12 at both; GREEN 14; the neighbours N unchanged; the catalogue's wallet sections C to C + 8.)
- **Mutation check:** 104 mutants, all killed ... (one line per group, with the cases that kill it; X1 and P22 are the plan's.)
- **Gate** (worktree root): ... (Step 6, each command with its result; no whole-suite count, R100.)
- **Deviations:** the names and files beyond the plan's list (rulings P3a to P3f: `TransferFooter`, `confirmTitle`, `ConfirmStep`'s `lookups`, `WalletPick`'s `back` and `isPickStep`, the sections in P2-T14's list and the one line in P2-T20's test, `add.addNote`); move all never above the cap (P5); the one-wallet words (P6); back and Save left to the host (P7d); Bun's sentence masked in private mode (P8c); the E2-B differences (P17).
- **SKIPPED:** `typecheck:routes`, `export:web`, the full render suite and the iOS export (CI); `test:ops`; the API, edge and database suites; device and simulator checks (Step 6).
- **Risks:** the swap button overlaps the cards' 11 pt padding at the standard text sizes (P4d); a device shows whether its ring reads cleanly on each material (SKIPPED). The picks' เสร็จ sits in the scrolling middle, under the note field: with the keyboard up on a small phone it may need a scroll.
- **Notes for later tasks:** (ruling P18, each.)
```

## Step 8: Commit

1. `/usr/bin/git -C WT add apps/app/src/wallet/add/TransferStep.tsx apps/app/src/wallet/add/ConfirmStep.tsx apps/app/src/wallet/add/PickSteps.tsx apps/app/src/wallet/add/AddSteps.render.test.tsx apps/app/src/wallet/add/copy.ts apps/app/src/dev/catalogue/wallet/addSections.tsx apps/app/src/wallet/wallets/WalletsList.render.test.tsx docs/implementation/receipts/P2-T15.md`
2. `/usr/bin/git -C WT status --short`: those eight staged, nothing else (no log, no `dist/`).
3. Write the message to `S/commit-message.txt`, ending with the `Co-Authored-By:` trailer naming the model you run as (for a Claude Haiku 5.5 implementer, `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`):
   ```
   Add the transfer, confirm and pick steps of the Bun Wallet tray

   Add the add tray's transfer step: the from and to cards with each
   wallet's balance and what it holds after the move, exact in satang, the
   swap, and move all, offered only for a known balance above zero and
   within the amount cap; its footer says a move is not spending and waits
   for two different wallets. Add the confirm step: the category's tile,
   the title, what Bun read, the amount, and a row per field that opens its
   pick, with Bun's guesses marked. Add the category, wallet, day and note
   picks, each going back with the choice. Private mode masks every stored
   amount and the numbers Bun read. Add four catalogue sections after the
   amount step's.

   Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
   ```
4. `/usr/bin/git -C WT commit -F S/commit-message.txt`, then `/usr/bin/git -C WT log --oneline -1` and `/usr/bin/git -C WT show --stat HEAD`: 8 files.

## Your final message

As the protocol says: `STATUS: DONE` (or `STATUS: BLOCKED` with the exact blocker) on the first line; the commit SHA and branch; files changed; RED and GREEN counts; mutants (104 killed); each gate command with its result (no whole-suite count, R100); SKIPPED items; deviations (P3 to P9, P17); and what the reviewer should look at first: move all and the cap (P5), private mode on the amount lines and in what Bun read (P8), each pick's way back and the swap on a pick (P3d, P9c), the day's bounds (P9d), the sections in P2-T14's list with the one line in P2-T20's test (P3e), and the transfer step's money (P4b: `balancesAfter` in BigInt, a balance past 2^53).

---

## Appendix: the code

Every block is the file in `PL/real/`, byte for byte; the diffs are `PL/diffs/`.

`apps/app/src/wallet/add/TransferStep.tsx`:
{{CODE:apps/app/src/wallet/add/TransferStep.tsx}}

`apps/app/src/wallet/add/ConfirmStep.tsx`:
{{CODE:apps/app/src/wallet/add/ConfirmStep.tsx}}

`apps/app/src/wallet/add/PickSteps.tsx`:
{{CODE:apps/app/src/wallet/add/PickSteps.tsx}}

`apps/app/src/wallet/add/copy.ts`:
{{CODE:apps/app/src/wallet/add/copy.ts}}

`apps/app/src/dev/catalogue/wallet/addSections.tsx`:
{{CODE:apps/app/src/dev/catalogue/wallet/addSections.tsx}}

`apps/app/src/wallet/add/AddSteps.render.test.tsx`:
{{CODE:apps/app/src/wallet/add/AddSteps.render.test.tsx}}

`PL/diffs/apps_app_src_wallet_add_copy.ts.diff`:
{{DIFF:apps_app_src_wallet_add_copy.ts.diff}}

`PL/diffs/apps_app_src_dev_catalogue_wallet_addSections.tsx.diff`:
{{DIFF:apps_app_src_dev_catalogue_wallet_addSections.tsx.diff}}

`PL/diffs/apps_app_src_wallet_wallets_WalletsList.render.test.tsx.diff`:
{{DIFF:apps_app_src_wallet_wallets_WalletsList.render.test.tsx.diff}}
