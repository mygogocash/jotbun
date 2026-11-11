# Brief P2-T14 fix round: room for the amount step's middle, filled amounts masked, and the reviews' pins

You are the fixer for the P2-T14 fix round. PR #407 (branch `p2/t14-add-flow`, commit `18876253`) adds the add tray's amount step. Its first review says **Needs fixes** for one major, M1: the tray's pinned header and footer leave the scrolling middle no room. At AX5 that hides the amount on a 667 pt phone and can push Next off the screen. At the default size, income's name field is hidden while the keyboard is up. The second review (money and privacy) found no major. The controller ruled **R106** on both reviews (quoted in the rulings below).

The planner wrote every file below and proved it in a scratch copy of `18876253`:
- RED on typed stubs, each failing case on an assertion;
- GREEN;
- 138 mutants, all killed;
- R100's fast local gate;
- R106's height budget, run on the fixed layout.

You copy the planner's files, check them by checksum, prove RED, GREEN and the mutants in your own worktree, run the gate, write the round's receipt and commit. Do exactly what this brief says.

Read first:
1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. R100 applies: the fast local gate only, and no whole-suite total as an expected value anywhere. R87 applies: the round's receipt is its own new file, `docs/implementation/receipts/P2-T14-fix.md`, and `P2-T14.md` gains one line pointing to it; do not edit `premium-progress.md`.
2. The reviews: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/P2-T14.md` (M1, m1 to m5, n1 to n4) and `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/P2-T14-second.md` (m1 to m4, n1 to n3).

## Paths and rules

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t14` (branch `p2/t14-add-flow`, head `18876253`). Work only here.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t14-fix`, your scratch folder. Create it with `mkdir -p`. Logs and the commit message go there. Never keep anything under `/private/tmp`.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t14-fix-planner`, the planner's folder. Read it and `cp` from it; never write into it. It holds:
  - `real/`: the round's ten files at their repo paths: nine changed (the receipt `P2-T14.md`'s one line among them) and `amountStepNative.test.ts`, which is new;
  - `stubs/`: the RED forms (typed stubs) of `addFlow.ts`, `AmountStep.tsx` and `TypeSwitchHeader.tsx`: the round's types with `18876253`'s answers;
  - `orig/`: `18876253`'s files that the round reads or changes, the receipt included;
  - `diffs/`: one diff per file, with the paths `a/<repo path>` and `b/<repo path>`. `p2-t14-fix.patch` is the whole round, for reading; the planner checked that it turns `orig/` into `real/` byte for byte (`logs/patch-check.log`);
  - `receipt/P2-T14-fix.md`: the round's receipt, with three marks for your own values (Step 6);
  - `probes/ax5-budget-fixed.ts`: R106's height budget on the fixed layout, and its output `logs/ax5-budget-fixed.log`;
  - `tools/`: `mutants.py` (the runner), `prove.sh` (the planner's stages), `brief.template.md` and `brief.py` (every diff and mutant line below is the kit's own);
  - `SHA256SUMS` (the kit) and `SHA256SUMS.logs` (the planner's `logs/`);
  - three lists to check WT with `shasum -a 256 -c`, paths relative to WT:
    - `SHA256SUMS.orig-in-wt`: `18876253`'s eleven files;
    - `SHA256SUMS.red-in-wt`: the three tests and three other files from `real/`, and the three stubs;
    - `SHA256SUMS.real-in-wt`: the nine `real/` code and test files;
    - `SHA256SUMS.receipt-in-wt`: `real/`'s `P2-T14.md`.
- Every shell call starts in a fresh directory, so type full paths. Below, WT, S and PL stand for the full paths above. Git: `/usr/bin/git -C WT <command>`, one git command per call. Focused Node files: `cd WT/apps/app && npm run test:unit -- <files>`. Focused render files: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts <files>`.
- No heavy lock is needed: no database suite and no workers pool. Docker is stopped and stays stopped.
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests or code to make them pass. One exception, a load flake: a case that times out under load in a file this round does not touch. Rerun that file alone once, and record both runs.
- Every log is your own run. Never copy the planner's logs in place of one.

## Scope

| File | Change |
| --- | --- |
| `apps/app/src/wallet/add/addFlow.ts` | Adds `filledKeypad(minor: Minor): KeypadState`, `isFilled(keypad: KeypadState): boolean`, `type WalletKey = KeypadDigit \| '000' \| 'backspace'` and `walletKey(keypad: KeypadState, key: WalletKey): KeypadState` (P7, P8). `stillGuessed` compares the note trimmed (n4). Still pure. |
| `apps/app/src/wallet/add/AmountStep.tsx` | `AmountStep(props: StepProps & { type: AddType; lookups: Lookups; chips: readonly QuickChip[]; canTellBun: boolean; onTellBun(): void; problem: string \| null; typeSwitch: ReactNode; onNaming(naming: boolean): void })` and `AmountFooter(props: StepProps & { type: AddType; naming: boolean })`, which loses `problem` (P3 to P8, P10, P11). `useCanTellBun` is unchanged. |
| `apps/app/src/wallet/add/TypeSwitchHeader.tsx` | Adds `useSwitchInHeader(): boolean`. `TypeSwitchHeader(props: { type: AddType; onType(type: AddType): void; disabled?: boolean })` (P3, P11). |
| `apps/app/src/wallet/add/WalletKeypad.tsx` | Types through `walletKey`; its props are unchanged (P8). |
| `apps/app/src/wallet/add/QuickChips.tsx` | Its header, and a comment on `QuickChip`'s `label`, only (P9). |
| `apps/app/src/dev/catalogue/wallet/addSections.tsx` | The host's wiring: the switch's place, the problem, `naming`, the chips' fill (P3 to P7, P12). |
| `apps/app/src/wallet/add/addFlow.test.ts` | Node: 6 cases before, 7 after (P13). |
| `apps/app/src/wallet/add/AmountStep.render.test.tsx` | Render: 12 cases before, 15 after (P13). |
| `apps/app/src/wallet/add/amountStepNative.test.ts` | **New**, Node: 1 case, R72's source pin (P13). |
| `docs/implementation/receipts/P2-T14-fix.md` | **New**: the round's receipt (R87). |
| `docs/implementation/receipts/P2-T14.md` | One line under its "Notes for later tasks", pointing to the round's receipt. |

No file in this round is shared (no route table, registry, `protocol.ts`, `env.ts`, catalog or contracts file). Not in this round: `Tray.tsx` (R106), `keypadExpression.ts` (Quick add's), `add/copy.ts` (no new line), the catalogue's `index.ts`, `draftText.test.ts`, `en.json` and `th.json`, any route, the app entry, native code, a package or the lockfile.

## Planner rulings (what this round decides, with the reason for each)

R106, the controller's ruling (11 Nov), in short:
1. M1: at the large text sizes the type switch leaves the pinned header for the top of the scrolling middle, and the header is the tray's one-line title. At every size the problem line leaves the footer for the middle, under the amount. While income's name has focus the footer is Next alone. `Tray.tsx` does not change. Prove it with the first review's height probe.
2. Private mode: an amount the person did not type is masked until a key is pressed. Build it for the chips' fill; P2-T15, P2-T16 and P2-T27 inherit the rule.
3. A chip's `label` is the name only: a line in `QuickChips`' header, and a test if a cheap one exists.
4. The minors m1 to m4.
5. Pin the untested guards; n1, n3 and n4 are the planner's.
6. Every new guard gets a mutant, and every RED fails on an assertion.

- **P1. R106.1's "top of the scrolling middle" fails R106's own proof, so the switch goes under the amount and its problem.** R106 asks that, at AX5 on a 667 pt phone, the amount have room. The planner ran the first review's height probe on the fixed layout (`PL/probes/ax5-budget-fixed.ts`, output `PL/logs/ax5-budget-fixed.log`). It uses the real type scale, iOS's line-height scaling, and `Tray.tsx`'s padding and gaps, unchanged.
  - **With the switch at the middle's top**, its three stacked segments (251 pt in Thai at AX5) come first. The amount then starts 263 pt down a middle that is 161 pt tall on the SE, 242 on the 13 mini, 277 on the board's 390×844 and 273 on a 15 or 16. Of the amount's 84 pt line, nothing is in view when the tray opens on the SE and the mini, and 14 and 10 pt on the 6.1-inch phones. All of it shows only on a Pro Max. The keypad never scrolls the middle, so the person types an amount they cannot see.
  - **With the amount first**, its line is in full view on every phone listed, in Thai and in English. One problem line under it fits too, but for 2.5 pt on the SE in Thai.
  - So the switch sits in the scrolling middle right under the amount and its problem, before the wallet chip, since the type decides what the chip says.
  - The rest of R106.1 holds as written:
    - the switch leaves the pinned header at the large text sizes (`useLargeText()`, the threshold P7 and ax-large-tray use);
    - the pinned header is the tray's title;
    - the problem is the middle's at every size;
    - the footer is the keys and Next;
    - `Tray.tsx` does not change.
  - **If the controller wants R106 as written:** mutant L2 is that layout. Move `{typeSwitch}` above the amount's group, and change the order lists in two render cases (P13).
  - **The rest of the proof** (same log):
    - Next is pinned and on screen on every phone listed, with any problem line, since the problem now scrolls with the middle.
    - At the default size with the keyboard up on the SE, the middle is 213 pt (5 before), and the 72 pt name row fits.
- **P2. Ready; the base is `18876253`, and the fix commit goes on it with no sync merge.**
  - This is a fix round; P2-T14's own "Starts after" tasks are merged.
  - It needs no package, lockfile change, Cloudflare resource, owner decision or account setting.
  - `git fetch` found the integration head at `3dc81b4d`. `git diff --stat 96a52c2a 3dc81b4d -- apps/app packages package.json package-lock.json` prints nothing: #405 (1B-T13) changed `apps/edge`, and the rest is controller state. So `18876253`'s app is the integration's.
  - The controller's note says the fix commit goes on top of `18876253`. So Step 1 fetches and checks, but does not merge.
- **P3. How the switch moves (R106.1).**
  - `TypeSwitchHeader.tsx` exports `useSwitchInHeader(): boolean`, which is `!useLargeText()`.
  - `AmountStep` takes `typeSwitch: ReactNode` and draws it, when given, under the amount and its problem.
  - The host makes one switch and passes it either as the tray's `header` or as the step's `typeSwitch`: `header={inHeader ? typeSwitch : undefined}` and `typeSwitch={inHeader ? null : typeSwitch}`. The catalogue and the test's host do this.
  - With no `header`, the tray draws its title in the header row (P2-T13's), so the title is the pinned header and `Tray.tsx` does not change.
  - Only the host sets the tray's `header`, so the host decides; the hook names the rule for every host (P2-T16 inherits it, the receipt's note).
  - At the standard sizes the amount, its problem and the wallet chip stay one group, 8 pt apart, as the boards draw them. At AX5 the chip follows the switch.
- **P4. The problem goes back to `AmountStep` (R106.1).**
  - `AmountStep` takes `problem: string | null`. This is the plan's own prop, which the first round moved to the footer (its P3a).
  - The step draws it right under the amount and over the wallet chip, as the same polite alert (`role="alert"`, `aria-live="polite"`).
  - `useAnnouncement(problem)` moves with it, so iOS still says it once.
  - `AmountFooter` loses `problem`.
- **P5. The footer while income's name has focus (R106.1).**
  - `AmountStep` takes `onNaming(naming: boolean)` and `AmountFooter` takes `naming: boolean`. The host holds the state (`useState(false)`), since the two are siblings in the tray.
  - The name field says `true` on focus and `false` on blur.
  - Two more ways to let go, so the keys always come back:
    - **Android's back** hides the keyboard but leaves the field focused: React Native 0.88's `ReactEditText.kt` has no back-key handling. So the field blurs itself on `Keyboard`'s `keyboardDidHide`. iOS hides its keyboard only on blur, so there it changes nothing.
    - **A field that leaves while focused** (the type or the step changed) says `false` from its effect's cleanup. Mutant N6 shows no blur reaches the host otherwise.
  - The rule is focus, not a keyboard listener alone: the ruling's words are "while income's name field has focus", and the web has no keyboard events to test.
- **P6. Income's name comes right under the wallet chip, before บอกบัน.**
  - rh-income draws the name under the wallet chip, and no Tell Bun.
  - The reason is the keyboard. React Native's iOS `ScrollView` brings a focused field into view only when `automaticallyAdjustKeyboardInsets` is set (`RCTScrollViewComponentView.mm:189`), and the tray's `ScrollView` does not set it.
  - With Tell Bun above it, the 72 pt name row starts 202 pt down the SE's 213 pt middle, so 61 pt of it is under the fold while typed. Under the wallet chip it starts at 140 and fits whole.
  - A problem line above the name would push it down again. That case, and whether iOS keeps the field in view, are the device check (SKIPPED).
  - Spending's order is unchanged.
- **P7. Private mode for an amount the person did not type (R106.2).** Three pure helpers in `addFlow.ts`, and one rule in the step:
  - `filledKeypad(minor)` is `keypadFromMinor(minor)` marked `fresh`, as today's keypad marks the result of `=`. Every fill goes in through it: here the chips' `apply` in the catalogue and in the test's host. P2-T15, P2-T16 and P2-T27 inherit it.
  - `isFilled(keypad)` is `fresh`, or satang, which only a fill can give, since this keypad has no point.
  - `AmountStep` masks the line while `hidden && isFilled(keypad)`. The mask is `฿••••` (`HIDDEN_AMOUNT`) at 58 pt with the mask's 0.12 em spacing, said as `common.amountHidden`, as `WalletAmount` masks (W10).
  - Any key clears `fresh` (today's `applyKey`), so the line then shows what the person types (the first round's P9).
  - `keypadExpression.ts` (Quick add's) does not change, and `keypadFromMinor` still opens an amount that typing continues, for Quick add.
- **P8. m4: the first key on a fill starts the amount over.** `walletKey(keypad, key)` in `addFlow.ts`, which the keypad now calls: on a filled amount (`isFilled`) a digit or 000 begins a new amount and delete clears it. On anything else it is today's `applyKey`.
  - A digit after a fill starting over is the controller's own example. Today's keypad does the same after `=`.
  - Delete clears, rather than taking the satang (฿65.50 to ฿65) as the second review offered. Taking the satang would leave digits the person did not type on the line, which R106.2 masks. With this rule, once a key is pressed the line holds only what was typed.
  - So the tray's keypad can no longer reach `too_precise` or a bare `฿65.`, and the catalogue's "two problems this keypad can meet" is true again.
  - `amountProblem` still passes `too_precise` on, since Quick add's keypad can refuse a third decimal. The Node case pins it (the second review's R1, here SR1).
  - Satang counts as a fill, so a host that opens satang with `keypadFromMinor` still gets the rule. A whole-baht amount cannot be told from a typed one, so hosts must fill through `filledKeypad` (the receipt's notes).
- **P9. Chip labels (R106.3): the header line, and no test here.**
  - `QuickChips`' header and the `QuickChip` type's `label` say it is the name only and never holds an amount.
  - No cheap test guards it in this task. `QuickChips` draws the `label` its host passes, and a name may hold digits ("7-Eleven", the catalogue's "BTS"), so the component cannot tell a name from an amount.
  - The mapping is P2-T16's. Its private-mode case with a real `oftenLogged()` item is the guard (its receipt note).
- **P10. m1: the field's own box.**
  - The `TextInput` gets `minHeight: BUN_TOUCH`, as `NoteField`, `SearchField` and `WalletParts` have.
  - The review's "keep the row at 58 pt" cannot hold: the 20 pt caption over a 44 pt box is 64 pt.
  - The row's vertical padding goes from 8 to 4, so the row is 72 pt in Thai and 69 in English (an E2-B difference, in the receipt).
  - The 44 pt sweep now switches to income and measures the field.
- **P11. m2, m3, n3, n4.**
  - **m2:** `{type === 'transfer' ? null : <QuickChips chips={chips} />}`, and the transfer case passes chips.
  - **m3:** `TypeSwitchHeader` takes `disabled?: boolean`: each segment dims to 0.4, and `Pressable`'s `disabled` stops the tick and `onType`.
    - `Pressable` itself says the segment is unavailable. React Native's `Pressable.js:260` adds `disabled` to the accessibility state, and react-native-web's sets `aria-disabled` (`index.js:125`). So the switch sets no attribute of its own: the planner's first form set both, and their mutant was equivalent.
    - The test's host passes the tray's `locked`, as P2-T16 will (its receipt note).
  - **n3:** the caption ชื่อรายการ above the field is hidden from screen readers (`DECORATIVE`), since the field says its own name.
  - **n4:** `stillGuessed` compares the note trimmed, as its row shows it.
- **P12. n1: the catalogue's two rules, pinned** in the sections case, beside the section's chip fill (P7) and its AX5 placement (P3):
  - the spending section's problems show today's Thai words through `tc` (a drift in `PROBLEM_WORDS` would show the English key);
  - a section closed and opened again starts over (its `onClosed`).
- **P13. The tests.**
  - `addFlow.test.ts`, 6 cases before and 7 after:
    - the guesses case gains the trimmed note (n4);
    - move all gains a balance above the cap (the second review's n1);
    - the problem case gains `too_precise` (m3's branch);
    - one new case: "a fill is an amount the person did not type: its first key starts it over, a digit as a new amount and delete as nothing".
  - `AmountStep.render.test.tsx`, 12 cases before and 15 after. The test's host now does what P3 to P7 say, and records `TextInput`'s props as well as `Text`'s.
    - Changed:
      - "the keypad's problem shows right under the amount ..." replaces "... above Next ..."; it checks the problem's siblings, its `aria-live`, and that the footer is the keys and Next;
      - income: the ink amount, the name's text-size cap, the caption hidden, the order, and a wallet no longer listed;
      - the transfer: no chips;
      - the 44 pt sweep: the name field;
      - the switch: the lift by day only, and `disabled`, alone and in a locked tray;
      - private mode: a chip's fill;
      - the sections: the problem words, the chip fill, close and open again, and AX5.
    - New: "the pinned parts leave the middle room ...", "while income's name field has focus the footer is Next alone ..." and "a fill starts over at the first key ...".
    - The first review's M1 (the live region) joins "typing 5 and 0".
  - `amountStepNative.test.ts` is new: R72's source pin for `useAnnouncement(problem)`, the first review's M2 and the second review's n2.
  - The traps, each explained in the file's header or at its use:
    - `vi.spyOn(Keyboard, 'addListener')` hands the case the step's `keyboardDidHide` listener;
    - the field takes focus through the element's own `focus()`, so it is the document's active element and its `blur()` works;
    - the section's close waits 400 ms for the tray's exit (220 ms, or 150 under reduced motion).
- **P14. RED on typed stubs.**
  - The stubs keep `18876253`'s answers behind the round's types:
    - `filledKeypad` is `keypadFromMinor`, `isFilled` is false and `walletKey` is `applyKey`, and the note's guess compares the raw note;
    - `useSwitchInHeader` is always true and `disabled` is ignored;
    - `AmountStep` ignores `problem`, `typeSwitch` and `onNaming`, and draws as `18876253` did; `AmountFooter` ignores `naming` and shows no problem.
  - `WalletKeypad.tsx`, `QuickChips.tsx` and `addSections.tsx` are the real ones at RED: the keypad's rule is `walletKey`'s, `QuickChips` changes only its words, and the catalogue is a host.
  - At RED, Node fails 2 of 8 and render 10 of 15, each on an assertion. The other cases guard what the first round already did right.
  - Those pins are proven another way: the reviews' 11 survivors all survive `18876253`'s own focused files (`PL/logs/before-pins.out`), and each is killed by its pin in Step 4.
- **P15. 138 mutants, all killed, none marked equivalent.**
  - The first round's 92 again. A5, A13 and K2 are re-aimed where the round moved their lines; A5 now puts the problem under the wallet chip.
  - This round's 46: L1 to L4 (the switch's place), N1 to N9 (the footer and the name field), P1 to P10 (private mode), W1 to W4 (`walletKey`), Q11 (m2), T12 and T13 (m3), F24 (n4), S7 to S10 (the catalogue host's wiring), and the reviews' survivors RM1 to RM10 (but RM4, which the first round's sections case kills), SR1 and SR3.
  - Every kill is an assertion in the case named (`AssertionError` at least once).
- **P16. The gate (R100):**
  - run: `typecheck:app`; the focused files RED to GREEN; the neighbours (N); the catalogue's wallet sections (C); the registry rule; `test:app`; `test:unit`; `git diff --check`;
  - CI runs the full render suite, `export:web` and the iOS export;
  - nothing here changes a route, the app entry, native code, a package or the lockfile, and nothing outside `apps/app`.
- **P17. Carried, not in this round.**
  - The first review's notes for P2-T15, P2-T16 and P2-T27 are the controller's to carry: a pick returning past Next's gate, `balancesAfter`'s satang, `AmountFooter`'s keypad `disabled`, and Bun's guesses after Tell Bun's fill. The receipt's notes keep what this round changes.
  - A pinned slot under the tray's header stays a follow-up (the first round's P10).
- **P18. Clear of the work in flight.**
  - #406 (P2-T33, `p2/t33-face-id-lock`) touches none of this round's files. It shares `index.ts` and `draftText.test.ts` with the first commit only, at the anchors its own P17 plans for.
  - The merge order is unchanged: this PR, then #406.

## Step 1: Check the base (no merge)

1. `/usr/bin/git -C WT status --short` prints nothing, and `/usr/bin/git -C WT rev-parse --short HEAD` prints `18876253`. Otherwise report BLOCKED.
2. Fetch and check the integration head, but do not merge (P2):
   - run `/usr/bin/git -C WT fetch origin claude/p1a-vault-core`;
   - then `/usr/bin/git -C WT rev-parse --short origin/claude/p1a-vault-core`, and record it as the integration head (`3dc81b4d` when the planner wrote this);
   - then `/usr/bin/git -C WT diff --stat 96a52c2a origin/claude/p1a-vault-core -- apps/app packages package.json package-lock.json`. Expected: no output. If it lists anything, report BLOCKED with the output: the controller decides how to sync first.
3. `cd WT && shasum -a 256 -c PL/SHA256SUMS.orig-in-wt` (type the full paths). Expected: eleven `OK` lines, exit 0. And `ls WT/apps/app/src/wallet/add/amountStepNative.test.ts` says "No such file or directory".
4. The base:
   - Only if `WT/node_modules` is missing: `cd WT && npm ci --ignore-scripts --no-audit --no-fund > S/npm-ci.log 2>&1; echo $?`. Expected: 0 and "added 1416 packages".
   - `cd WT && npm run typecheck:app > S/base-typecheck.log 2>&1; echo $?`. Expected: 0.
   - `cd WT/apps/app && npm run test:unit -- src/wallet/add/addFlow.test.ts src/wallet/copy/draftText.test.ts > S/base-unit.log 2>&1; echo $?`. Expected: 0, `ℹ tests 10`, `ℹ pass 10`.
   - `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/add/AmountStep.render.test.tsx > S/base-render.log 2>&1; echo $?`. Expected: 0, `Tests  12 passed (12)`.
   - The neighbours: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/tray/Tray.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx > S/base-neighbours.log 2>&1; echo $?`. Expected: 0, `Test Files  4 passed (4)`, `Tests  58 passed (58)`. Call this count N.
   - The catalogue's wallet sections: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "bw-" > S/base-catalogue.log 2>&1; echo $?`. Expected: 0, `Tests  26 passed` (13 wallet sections in two suites). Call this count C, and ignore the `skipped` count.
   - The registry rule: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx -t "registry has a section" > S/base-registry.log 2>&1; echo $?`. Expected: 0, `Tests  1 passed`.

   Compare with `PL/logs/base-*.log`.

## Step 2: The tests first, and RED on the typed stubs

1. Copy the three tests, the three files that are real at RED, and the three stubs:
   ```bash
   cp PL/real/apps/app/src/wallet/add/addFlow.test.ts WT/apps/app/src/wallet/add/addFlow.test.ts
   cp PL/real/apps/app/src/wallet/add/AmountStep.render.test.tsx WT/apps/app/src/wallet/add/AmountStep.render.test.tsx
   cp PL/real/apps/app/src/wallet/add/amountStepNative.test.ts WT/apps/app/src/wallet/add/amountStepNative.test.ts
   cp PL/real/apps/app/src/wallet/add/WalletKeypad.tsx WT/apps/app/src/wallet/add/WalletKeypad.tsx
   cp PL/real/apps/app/src/wallet/add/QuickChips.tsx WT/apps/app/src/wallet/add/QuickChips.tsx
   cp PL/real/apps/app/src/dev/catalogue/wallet/addSections.tsx WT/apps/app/src/dev/catalogue/wallet/addSections.tsx
   cp PL/stubs/apps/app/src/wallet/add/addFlow.ts WT/apps/app/src/wallet/add/addFlow.ts
   cp PL/stubs/apps/app/src/wallet/add/AmountStep.tsx WT/apps/app/src/wallet/add/AmountStep.tsx
   cp PL/stubs/apps/app/src/wallet/add/TypeSwitchHeader.tsx WT/apps/app/src/wallet/add/TypeSwitchHeader.tsx
   ```
   Then `cd WT && shasum -a 256 -c PL/SHA256SUMS.red-in-wt`. Expected: nine `OK` lines.
2. `cd WT && npm run typecheck:app > S/red-typecheck.log 2>&1; echo $?`. Expected: 0.
3. `cd WT/apps/app && npm run test:unit -- src/wallet/add/addFlow.test.ts src/wallet/add/amountStepNative.test.ts > S/red-unit.log 2>&1; echo $?`. Expected:
   - exit 1, `ℹ tests 8`, `ℹ pass 6`, `ℹ fail 2`, and `grep -c 'AssertionError \[ERR_ASSERTION\]' S/red-unit.log` gives 2;
   - `fields Bun filled are marked guessed until the person changes them`: strictly deep-equal, actual `[]`, expected `[ 'note' ]` (n4);
   - `a fill is an amount the person did not type: its first key starts it over, a digit as a new amount and delete as nothing`: strictly deep-equal, actual `[ '65.50', { ok: true, minor: '6550' }, false ]`, expected `[ '65.50', { ok: true, minor: '6550' }, true ]`.
4. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/add/AmountStep.render.test.tsx > S/red-render.log 2>&1; echo $?`. Expected:
   - exit 1, `Tests  10 failed | 5 passed (15)`;
   - `grep -c '^AssertionError' S/red-render.log` gives 10;
   - `grep -cE 'Cannot find module|Failed to resolve|SyntaxError|is not a function|TestingLibraryElementError' S/red-render.log` gives 0.

   The ten, each failing first on:
   - `the keypad's problem shows right under the amount in today's words, and Next waits for an amount it can save`: `add-problem: expected null not to be null`
   - `income asks เข้า{wallet} and ชื่อรายการ, and says it is not counted in the budget`: `th: expected null to be 'true' // Object.is equality`
   - `a transfer's amount stands alone, and its Next goes on to choose the two wallets`: `expected [ null, null, null, …(1) ] to deeply equal [ null, null, null, null ]`
   - `the pinned parts leave the middle room: at AX5 the header is the title and the switch sits under the amount and its problem; the footer is the keys and Next`: `th: expected [ false, <div …(5)>…(3)</div> ] to deeply equal [ true, null ]`
   - `while income's name field has focus the footer is Next alone, and the keys come back when it lets go, when the keyboard hides and when it leaves`: `expected [ 'wallet-keypad', 'add-next' ] to deeply equal [ 'add-next' ]`
   - `every key, chip, segment and field is at least 44 pt`: `th light: ชื่อรายการ: expected NaN to be greater than or equal to 44`
   - `the type switch is one named radio group: a new type ticks once and is chosen, and the chosen one does nothing`: `expected [ [ null, '' ], [ null, '' ], …(1) ] to deeply equal [ [ 'true', '0.4' ], …(2) ]`
   - `a fill starts over at the first key: a digit begins a new amount and delete clears it, so satang never meets a point the keypad cannot type`: `expected [ '฿65.50', null ] to deeply equal [ '฿7', null ]`
   - `private mode hides the chips' amounts and a filled amount until a key is pressed, never the amount being typed`: `expected [ '฿65', '65 บาท', '58px', '-1.16px' ] to deeply equal [ '฿••••', 'ซ่อนยอดเงินอยู่', …(2) ]`
   - `the add tray's sections come right after the tray's, and each opens at once on its board's words`: `bw-tray-income: expected [ 'wallet-keypad', 'add-next' ] to deeply equal [ 'add-next' ]`

   The five that pass guard what the first round already did right (P14): typing 5 and 0, บอกบัน, the AX5 chips, the keypad's rules and the chips alone. Compare with `PL/logs/red-unit.log` and `PL/logs/red-render.log`.

## Step 3: GREEN

1. Copy the code:
   ```bash
   cp PL/real/apps/app/src/wallet/add/addFlow.ts WT/apps/app/src/wallet/add/addFlow.ts
   cp PL/real/apps/app/src/wallet/add/AmountStep.tsx WT/apps/app/src/wallet/add/AmountStep.tsx
   cp PL/real/apps/app/src/wallet/add/TypeSwitchHeader.tsx WT/apps/app/src/wallet/add/TypeSwitchHeader.tsx
   ```
2. `cd WT && shasum -a 256 -c PL/SHA256SUMS.real-in-wt`. Expected: nine `OK` lines. Then `/usr/bin/git -C WT status --short`, which shows exactly these nine lines:
   ```
    M apps/app/src/dev/catalogue/wallet/addSections.tsx
    M apps/app/src/wallet/add/AmountStep.render.test.tsx
    M apps/app/src/wallet/add/AmountStep.tsx
    M apps/app/src/wallet/add/QuickChips.tsx
    M apps/app/src/wallet/add/TypeSwitchHeader.tsx
    M apps/app/src/wallet/add/WalletKeypad.tsx
    M apps/app/src/wallet/add/addFlow.test.ts
    M apps/app/src/wallet/add/addFlow.ts
   ?? apps/app/src/wallet/add/amountStepNative.test.ts
   ```
   The code's diffs are in the appendix.
3. `cd WT && npm run typecheck:app > S/green-typecheck.log 2>&1; echo $?`. Expected: 0.
4. `cd WT/apps/app && npm run test:unit -- src/wallet/add/addFlow.test.ts src/wallet/add/amountStepNative.test.ts src/wallet/copy/draftText.test.ts > S/green-unit.log 2>&1; echo $?`. Expected: 0, `ℹ tests 12`, `ℹ pass 12`, `ℹ fail 0` (7 + 1 + 4).
5. Step 1.4's render command, into `S/green-render.log`, with `--reporter=verbose`. Expected:
   - exit 0, `Tests  15 passed (15)`, each case marked `✓`;
   - `grep -c '^stderr |' S/green-render.log` gives 0: no `act(...)` warning and no `console.error`.
6. The neighbours, Step 1.4's command, into `S/green-neighbours.log`: exit 0, `Tests  N passed (N)`.
7. The catalogue, Step 1.4's command, into `S/green-catalogue.log`: exit 0, `Tests  C passed`, unchanged: the two sections are still there, now wired as P3 to P7 say. Then the registry rule, into `S/green-registry.log`: exit 0, `Tests  1 passed`.

## Step 4: Mutation check

1. `python3 -I PL/tools/mutants.py WT S/mutant-logs > S/mutants.out 2>&1; echo $?` (full paths).
   - It applies each mutant alone and runs its file: `addFlow.test.ts`, `amountStepNative.test.ts` or `AmountStep.render.test.tsx`.
   - It restores each file with its SHA-256 checked.
   - It took the planner about 9 minutes, with the load average between 13 and 22.
   - Expected: exit 0, and these 139 lines: one per mutant, each ending "restored sha256 equal", then the tally. Compare with `PL/logs/mutants.out` (the planner's log adds an `exit=0` line).
   ```
   F1 KILLED: income titled as spending [addFlow.ts] -> addFlow.test.ts: Tests 1 failed | 6 passed (7); first failing: "the tray's title follows its type, and the amount's Next goes to confirm, or a transfer's to its two wallets"; AssertionError x1; restored sha256 equal
   F2 KILLED: a transfer's Next goes to confirm [addFlow.ts] -> addFlow.test.ts: Tests 1 failed | 6 passed (7); first failing: "the tray's title follows its type, and the amount's Next goes to confirm, or a transfer's to its two wallets"; AssertionError x1; restored sha256 equal
   F3 KILLED: a refused key says nothing [addFlow.ts] -> addFlow.test.ts: Tests 1 failed | 6 passed (7); first failing: "the amount step's problem: a refused key's, else why the amount cannot go on, but nothing for a keypad nothing was typed on"; AssertionError x1; restored sha256 equal
   F4 KILLED: a keypad with nothing typed nags [addFlow.ts] -> addFlow.test.ts: Tests 1 failed | 6 passed (7); first failing: "the amount step's problem: a refused key's, else why the amount cannot go on, but nothing for a keypad nothing was typed on"; AssertionError x1; restored sha256 equal
   F5 KILLED: a zero amount says nothing [addFlow.ts] -> addFlow.test.ts: Tests 1 failed | 6 passed (7); first failing: "the amount step's problem: a refused key's, else why the amount cannot go on, but nothing for a keypad nothing was typed on"; AssertionError x1; restored sha256 equal
   F6 KILLED: a transfer confirms as spending's rows [addFlow.ts] -> addFlow.test.ts: Tests 2 failed | 5 passed (7); first failing: "an expense confirms category, wallet, date and note; a transfer confirms from, to, date and note"; AssertionError x2; restored sha256 equal
   F7 KILLED: a built-in category named in English [addFlow.ts] -> addFlow.test.ts: Tests 1 failed | 6 passed (7); first failing: "an expense confirms category, wallet, date and note; a transfer confirms from, to, date and note"; AssertionError x1; restored sha256 equal
   F8 KILLED: the note untrimmed [addFlow.ts] -> addFlow.test.ts: Tests 1 failed | 6 passed (7); first failing: "an expense confirms category, wallet, date and note; a transfer confirms from, to, date and note"; AssertionError x1; restored sha256 equal
   F9 KILLED: no row is ever guessed [addFlow.ts] -> addFlow.test.ts: Tests 1 failed | 6 passed (7); first failing: "fields Bun filled are marked guessed until the person changes them"; AssertionError x1; restored sha256 equal
   F10 KILLED: every row guessed once Bun filled any [addFlow.ts] -> addFlow.test.ts: Tests 1 failed | 6 passed (7); first failing: "fields Bun filled are marked guessed until the person changes them"; AssertionError x1; restored sha256 equal
   F11 KILLED: the date shown as stored [addFlow.ts] -> addFlow.test.ts: Tests 1 failed | 6 passed (7); first failing: "an expense confirms category, wallet, date and note; a transfer confirms from, to, date and note"; AssertionError x1; restored sha256 equal
   F12 KILLED: from and to swapped [addFlow.ts] -> addFlow.test.ts: Tests 1 failed | 6 passed (7); first failing: "an expense confirms category, wallet, date and note; a transfer confirms from, to, date and note"; AssertionError x1; restored sha256 equal
   F13 KILLED: the wallet row labelled as from [addFlow.ts] -> addFlow.test.ts: Tests 1 failed | 6 passed (7); first failing: "an expense confirms category, wallet, date and note; a transfer confirms from, to, date and note"; AssertionError x1; restored sha256 equal
   F14 KILLED: a changed field stays guessed [addFlow.ts] -> addFlow.test.ts: Tests 1 failed | 6 passed (7); first failing: "fields Bun filled are marked guessed until the person changes them"; AssertionError x1; restored sha256 equal
   F15 KILLED: any change drops every guess [addFlow.ts] -> addFlow.test.ts: Tests 1 failed | 6 passed (7); first failing: "fields Bun filled are marked guessed until the person changes them"; AssertionError x1; restored sha256 equal
   F16 KILLED: the category's guess ignores the type [addFlow.ts] -> addFlow.test.ts: Tests 1 failed | 6 passed (7); first failing: "fields Bun filled are marked guessed until the person changes them"; AssertionError x1; restored sha256 equal
   F17 KILLED: a key that is not a row is dropped [addFlow.ts] -> addFlow.test.ts: Tests 1 failed | 6 passed (7); first failing: "fields Bun filled are marked guessed until the person changes them"; AssertionError x1; restored sha256 equal
   F18 KILLED: move all offered at a zero balance (the plan's mutant) [addFlow.ts] -> addFlow.test.ts: Tests 1 failed | 6 passed (7); first failing: "move all offers the available balance only when it is known and above zero"; AssertionError x1; restored sha256 equal
   F19 KILLED: move all offered below zero [addFlow.ts] -> addFlow.test.ts: Tests 1 failed | 6 passed (7); first failing: "move all offers the available balance only when it is known and above zero"; AssertionError x1; restored sha256 equal
   F20 KILLED: the amount reaches from as well as to [addFlow.ts] -> addFlow.test.ts: Tests 1 failed | 6 passed (7); first failing: "balances after a transfer move the exact amount"; AssertionError x1; restored sha256 equal
   F21 KILLED: one wallet on both sides moves the amount [addFlow.ts] -> addFlow.test.ts: Tests 1 failed | 6 passed (7); first failing: "balances after a transfer move the exact amount"; AssertionError x1; restored sha256 equal
   F22 KILLED: the balance worked out in a JS number [addFlow.ts] -> addFlow.test.ts: Tests 1 failed | 6 passed (7); first failing: "balances after a transfer move the exact amount"; AssertionError x1; restored sha256 equal
   F23 KILLED: a balance not known counted as zero [addFlow.ts] -> addFlow.test.ts: Tests 1 failed | 6 passed (7); first failing: "balances after a transfer move the exact amount"; AssertionError x1; restored sha256 equal
   A1 KILLED: Next on an empty keypad (the plan's mutant) [AmountStep.tsx] -> render: Tests 3 failed | 12 passed (15); first failing: "typing 5 and 0 shows ฿50 and enables Next"; AssertionError x3; restored sha256 equal
   A2 KILLED: Next takes a zero amount [AmountStep.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "the keypad's problem shows right under the amount in today's words, and Next waits for an amount it can save"; AssertionError x1; restored sha256 equal
   A3 KILLED: a transfer's Next goes to confirm [AmountStep.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "a transfer's amount stands alone, and its Next goes on to choose the two wallets"; AssertionError x1; restored sha256 equal
   A4 KILLED: the problem never shows [AmountStep.tsx] -> render: Tests 3 failed | 12 passed (15); first failing: "the keypad's problem shows right under the amount in today's words, and Next waits for an amount it can save"; AssertionError x3; restored sha256 equal
   A5 KILLED: the problem under the wallet chip, not the amount (re-aimed: the problem left the footer) [AmountStep.tsx] -> render: Tests 2 failed | 13 passed (15); first failing: "the keypad's problem shows right under the amount in today's words, and Next waits for an amount it can save"; AssertionError x2; restored sha256 equal
   A6 KILLED: the problem is not an alert [AmountStep.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "the keypad's problem shows right under the amount in today's words, and Next waits for an amount it can save"; AssertionError x1; restored sha256 equal
   A7 KILLED: the amount always said as 0 baht [AmountStep.tsx] -> render: Tests 3 failed | 12 passed (15); first failing: "typing 5 and 0 shows ฿50 and enables Next"; AssertionError x3; restored sha256 equal
   A8 KILLED: the amount at 44 pt [AmountStep.tsx] -> render: Tests 3 failed | 12 passed (15); first failing: "typing 5 and 0 shows ฿50 and enables Next"; AssertionError x3; restored sha256 equal
   A9 KILLED: the amount grows like body text, past 64 pt [AmountStep.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "at AX5 the chips are full-width rows and ฿999,999,999.99 never truncates"; AssertionError x1; restored sha256 equal
   A10 KILLED: the amount clamped to one line [AmountStep.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "at AX5 the chips are full-width rows and ฿999,999,999.99 never truncates"; AssertionError x1; restored sha256 equal
   A11 KILLED: income's chip says จาก [AmountStep.tsx] -> render: Tests 2 failed | 13 passed (15); first failing: "income asks เข้า{wallet} and ชื่อรายการ, and says it is not counted in the budget"; AssertionError x2; restored sha256 equal
   A12 KILLED: the wallet chip opens confirm [AmountStep.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "income asks เข้า{wallet} and ชื่อรายการ, and says it is not counted in the budget"; AssertionError x1; restored sha256 equal
   A13 KILLED: a transfer shows the wallet chip (re-aimed: the chip is built once) [AmountStep.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "a transfer's amount stands alone, and its Next goes on to choose the two wallets"; AssertionError x1; restored sha256 equal
   A14 KILLED: Tell Bun on a transfer [AmountStep.tsx] -> render: Tests 2 failed | 13 passed (15); first failing: "a transfer's amount stands alone, and its Next goes on to choose the two wallets"; AssertionError x2; restored sha256 equal
   A15 KILLED: Tell Bun whether or not Bun can help [AmountStep.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "บอกบัน shows only when Bun is on in the companion area"; AssertionError x1; restored sha256 equal
   A16 KILLED: useCanTellBun ignores the companion area [AmountStep.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "บอกบัน shows only when Bun is on in the companion area"; AssertionError x1; restored sha256 equal
   A17 KILLED: useCanTellBun ignores Bun's AI help [AmountStep.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "บอกบัน shows only when Bun is on in the companion area"; AssertionError x1; restored sha256 equal
   A18 KILLED: the name field for spending too [AmountStep.tsx] -> render: Tests 4 failed | 11 passed (15); first failing: "income asks เข้า{wallet} and ชื่อรายการ, and says it is not counted in the budget"; AssertionError x4; restored sha256 equal
   A19 KILLED: the name field drops what is typed [AmountStep.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "income asks เข้า{wallet} and ชื่อรายการ, and says it is not counted in the budget"; AssertionError x1; restored sha256 equal
   A20 KILLED: the name has no length limit [AmountStep.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "income asks เข้า{wallet} and ชื่อรายการ, and says it is not counted in the budget"; AssertionError x1; restored sha256 equal
   A21 KILLED: the budget note left out [AmountStep.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "income asks เข้า{wallet} and ชื่อรายการ, and says it is not counted in the budget"; AssertionError x1; restored sha256 equal
   A22 KILLED: the wallet chip under 44 pt [AmountStep.tsx] -> render: Tests 2 failed | 13 passed (15); first failing: "at AX5 the chips are full-width rows and ฿999,999,999.99 never truncates"; AssertionError x2; restored sha256 equal
   A23 KILLED: at AX5 the wallet chip stays a pill [AmountStep.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "at AX5 the chips are full-width rows and ฿999,999,999.99 never truncates"; AssertionError x1; restored sha256 equal
   A24 KILLED: the Tell Bun row under 44 pt [AmountStep.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "every key, chip, segment and field is at least 44 pt"; AssertionError x1; restored sha256 equal
   A25 KILLED: a wallet not chosen says จาก and nothing [AmountStep.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "income asks เข้า{wallet} and ชื่อรายการ, and says it is not counted in the budget"; AssertionError x1; restored sha256 equal
   A26 KILLED: the wallet's material not drawn [AmountStep.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "typing 5 and 0 shows ฿50 and enables Next"; AssertionError x1; restored sha256 equal
   A27 KILLED: every wallet drawn in silk [AmountStep.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "typing 5 and 0 shows ฿50 and enables Next"; AssertionError x1; restored sha256 equal
   K1 KILLED: keys without a tick [WalletKeypad.tsx] -> render: Tests 2 failed | 13 passed (15); first failing: "typing 5 and 0 shows ฿50 and enables Next"; AssertionError x2; restored sha256 equal
   K2 KILLED: delete clears the whole amount (re-aimed: the keypad types through walletKey) [WalletKeypad.tsx] -> render: Tests 4 failed | 11 passed (15); first failing: "the keypad's problem shows right under the amount in today's words, and Next waits for an amount it can save"; AssertionError x4; restored sha256 equal
   K3 KILLED: keys 44 pt, under the boards [WalletKeypad.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "at AX5 the chips are full-width rows and ฿999,999,999.99 never truncates"; AssertionError x1; restored sha256 equal
   K4 KILLED: at AX5 keys stay 46 pt [WalletKeypad.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "at AX5 the chips are full-width rows and ฿999,999,999.99 never truncates"; AssertionError x1; restored sha256 equal
   K5 KILLED: at AX5 keys on nothing [WalletKeypad.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "at AX5 the chips are full-width rows and ฿999,999,999.99 never truncates"; AssertionError x1; restored sha256 equal
   K6 KILLED: keys always on raised [WalletKeypad.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "at AX5 the chips are full-width rows and ฿999,999,999.99 never truncates"; AssertionError x1; restored sha256 equal
   K7 KILLED: a disabled keypad still types [WalletKeypad.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "the keypad types through today's rules: 000 on nothing is one 0, delete takes one digit, each key ticks once, and a disabled keypad takes nothing"; AssertionError x1; restored sha256 equal
   K8 KILLED: a disabled key is not dimmed [WalletKeypad.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "the keypad types through today's rules: 000 on nothing is one 0, delete takes one digit, each key ticks once, and a disabled keypad takes nothing"; AssertionError x1; restored sha256 equal
   K9 KILLED: the digits grow past 34 pt [WalletKeypad.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "at AX5 the chips are full-width rows and ฿999,999,999.99 never truncates"; AssertionError x1; restored sha256 equal
   K10 KILLED: delete says its key name [WalletKeypad.tsx] -> render: Tests 6 failed | 9 passed (15); first failing: "the keypad's problem shows right under the amount in today's words, and Next waits for an amount it can save"; AssertionError x6; restored sha256 equal
   K11 KILLED: 0 before 000 [WalletKeypad.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "every key, chip, segment and field is at least 44 pt"; AssertionError x1; restored sha256 equal
   T1 KILLED: choosing the chosen type asks again [TypeSwitchHeader.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "the type switch is one named radio group: a new type ticks once and is chosen, and the chosen one does nothing"; AssertionError x1; restored sha256 equal
   T2 KILLED: no tick on a new type [TypeSwitchHeader.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "the type switch is one named radio group: a new type ticks once and is chosen, and the chosen one does nothing"; AssertionError x1; restored sha256 equal
   T3 KILLED: segments are buttons, not radios [TypeSwitchHeader.tsx] -> render: Tests 7 failed | 8 passed (15); first failing: "income asks เข้า{wallet} and ชื่อรายการ, and says it is not counted in the budget"; AssertionError x6; restored sha256 equal
   T4 KILLED: the chosen type not marked [TypeSwitchHeader.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "the type switch is one named radio group: a new type ticks once and is chosen, and the chosen one does nothing"; AssertionError x1; restored sha256 equal
   T5 KILLED: the group has no name [TypeSwitchHeader.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "the type switch is one named radio group: a new type ticks once and is chosen, and the chosen one does nothing"; AssertionError x1; restored sha256 equal
   T6 KILLED: the chosen type left on the track [TypeSwitchHeader.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "the type switch is one named radio group: a new type ticks once and is chosen, and the chosen one does nothing"; AssertionError x1; restored sha256 equal
   T7 KILLED: the chosen words not bold [TypeSwitchHeader.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "the type switch is one named radio group: a new type ticks once and is chosen, and the chosen one does nothing"; AssertionError x1; restored sha256 equal
   T8 KILLED: the others in ink [TypeSwitchHeader.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "the type switch is one named radio group: a new type ticks once and is chosen, and the chosen one does nothing"; AssertionError x1; restored sha256 equal
   T9 KILLED: at AX5 the switch stays a row [TypeSwitchHeader.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "at AX5 the chips are full-width rows and ฿999,999,999.99 never truncates"; AssertionError x1; restored sha256 equal
   T10 KILLED: segments 40 pt [TypeSwitchHeader.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "every key, chip, segment and field is at least 44 pt"; AssertionError x1; restored sha256 equal
   T11 KILLED: income before spending [TypeSwitchHeader.tsx] -> render: Tests 2 failed | 13 passed (15); first failing: "every key, chip, segment and field is at least 44 pt"; AssertionError x2; restored sha256 equal
   Q1 KILLED: four chips shown [QuickChips.tsx] -> render: Tests 4 failed | 11 passed (15); first failing: "at AX5 the chips are full-width rows and ฿999,999,999.99 never truncates"; AssertionError x4; restored sha256 equal
   Q2 KILLED: a chip that fills nothing [QuickChips.tsx] -> render: Tests 4 failed | 11 passed (15); first failing: "a fill starts over at the first key: a digit begins a new amount and delete clears it, so satang never meets a point the keypad cannot type"; AssertionError x4; restored sha256 equal
   Q3 KILLED: no tick on a chip [QuickChips.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "the quick chips: at most three, each says its name and amount, and a tap fills the entry through apply"; AssertionError x1; restored sha256 equal
   Q4 KILLED: private mode says the chips' amounts [QuickChips.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "private mode hides the chips' amounts and a filled amount until a key is pressed, never the amount being typed"; AssertionError x1; restored sha256 equal
   Q5 KILLED: the chip's amount as plain text, never masked [QuickChips.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "private mode hides the chips' amounts and a filled amount until a key is pressed, never the amount being typed"; AssertionError x1; restored sha256 equal
   Q6 KILLED: at AX5 the chips stay a row of pills [QuickChips.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "at AX5 the chips are full-width rows and ฿999,999,999.99 never truncates"; AssertionError x1; restored sha256 equal
   Q7 KILLED: at AX5 rows under 64 pt [QuickChips.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "at AX5 the chips are full-width rows and ฿999,999,999.99 never truncates"; AssertionError x1; restored sha256 equal
   Q8 KILLED: pills under 44 pt [QuickChips.tsx] -> render: Tests 2 failed | 13 passed (15); first failing: "at AX5 the chips are full-width rows and ฿999,999,999.99 never truncates"; AssertionError x2; restored sha256 equal
   Q9 KILLED: no chips still draws the list [QuickChips.tsx] -> render: Tests 2 failed | 13 passed (15); first failing: "income asks เข้า{wallet} and ชื่อรายการ, and says it is not counted in the budget"; AssertionError x2; restored sha256 equal
   Q10 KILLED: a chip says only its name [QuickChips.tsx] -> render: Tests 3 failed | 12 passed (15); first failing: "a fill starts over at the first key: a digit begins a new amount and delete clears it, so satang never meets a point the keypad cannot type"; AssertionError x2; restored sha256 equal
   C1 KILLED: income titled จดรายจ่าย [copy.ts] -> render: Tests 3 failed | 12 passed (15); first failing: "income asks เข้า{wallet} and ชื่อรายการ, and says it is not counted in the budget"; AssertionError x3; restored sha256 equal
   C2 KILLED: the delete key says ลบ [copy.ts] -> render: Tests 6 failed | 9 passed (15); first failing: "the keypad's problem shows right under the amount in today's words, and Next waits for an amount it can save"; AssertionError x6; restored sha256 equal
   C3 KILLED: จาก with a space [copy.ts] -> render: Tests 3 failed | 12 passed (15); first failing: "income asks เข้า{wallet} and ชื่อรายการ, and says it is not counted in the budget"; AssertionError x3; restored sha256 equal
   C4 KILLED: the chip's Thai line loses its amount [copy.ts] -> render: Tests 3 failed | 12 passed (15); first failing: "a fill starts over at the first key: a digit begins a new amount and delete clears it, so satang never meets a point the keypad cannot type"; AssertionError x2; restored sha256 equal
   S1 KILLED: the add sections not in the wallet list [index.ts] -> render: Tests 1 failed | 14 passed (15); first failing: "the add tray's sections come right after the tray's, and each opens at once on its board's words"; AssertionError x1; restored sha256 equal
   S2 KILLED: the add sections before the tray's [index.ts] -> render: Tests 1 failed | 14 passed (15); first failing: "the add tray's sections come right after the tray's, and each opens at once on its board's words"; AssertionError x1; restored sha256 equal
   S3 KILLED: a section opens closed [addSections.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "the add tray's sections come right after the tray's, and each opens at once on its board's words"; AssertionError x1; restored sha256 equal
   S4 KILLED: the income section starts as spending [addSections.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "the add tray's sections come right after the tray's, and each opens at once on its board's words"; AssertionError x1; restored sha256 equal
   S5 KILLED: the amount section without Tell Bun [addSections.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "the add tray's sections come right after the tray's, and each opens at once on its board's words"; AssertionError x1; restored sha256 equal
   S6 KILLED: the income section without its name [addSections.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "the add tray's sections come right after the tray's, and each opens at once on its board's words"; AssertionError x1; restored sha256 equal
   L1 KILLED: at AX5 the switch stays in the pinned header (useSwitchInHeader always true) [TypeSwitchHeader.tsx] -> render: Tests 2 failed | 13 passed (15); first failing: "the pinned parts leave the middle room: at AX5 the header is the title and the switch sits under the amount and its problem; the footer is the keys and Next"; AssertionError x2; restored sha256 equal
   L2 KILLED: the switch at the top of the middle, over the amount (R106 as written) [AmountStep.tsx] -> render: Tests 2 failed | 13 passed (15); first failing: "the pinned parts leave the middle room: at AX5 the header is the title and the switch sits under the amount and its problem; the footer is the keys and Next"; AssertionError x2; restored sha256 equal
   L3 KILLED: the step never draws the switch it is given [AmountStep.tsx] -> render: Tests 3 failed | 12 passed (15); first failing: "at AX5 the chips are full-width rows and ฿999,999,999.99 never truncates"; AssertionError x3; restored sha256 equal
   L4 KILLED: at AX5 the wallet chip is drawn twice, in the group and after the switch [AmountStep.tsx] -> render: Tests 3 failed | 12 passed (15); first failing: "at AX5 the chips are full-width rows and ฿999,999,999.99 never truncates"; AssertionError x2; restored sha256 equal
   N1 KILLED: the keys stay while the name field has focus [AmountStep.tsx] -> render: Tests 2 failed | 13 passed (15); first failing: "while income's name field has focus the footer is Next alone, and the keys come back when it lets go, when the keyboard hides and when it leaves"; AssertionError x2; restored sha256 equal
   N2 KILLED: Next leaves with the keys while naming [AmountStep.tsx] -> render: Tests 2 failed | 13 passed (15); first failing: "while income's name field has focus the footer is Next alone, and the keys come back when it lets go, when the keyboard hides and when it leaves"; AssertionError x2; restored sha256 equal
   N3 KILLED: the name field never says it has focus [AmountStep.tsx] -> render: Tests 2 failed | 13 passed (15); first failing: "while income's name field has focus the footer is Next alone, and the keys come back when it lets go, when the keyboard hides and when it leaves"; AssertionError x2; restored sha256 equal
   N4 KILLED: the name field never says it let go [AmountStep.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "while income's name field has focus the footer is Next alone, and the keys come back when it lets go, when the keyboard hides and when it leaves"; AssertionError x1; restored sha256 equal
   N5 KILLED: Android's back hides the keyboard and the keys stay hidden [AmountStep.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "while income's name field has focus the footer is Next alone, and the keys come back when it lets go, when the keyboard hides and when it leaves"; AssertionError x1; restored sha256 equal
   N6 KILLED: a name field that leaves with focus keeps the keys hidden [AmountStep.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "while income's name field has focus the footer is Next alone, and the keys come back when it lets go, when the keyboard hides and when it leaves"; AssertionError x1; restored sha256 equal
   N7 KILLED: the name field's own box under 44 pt (m1) [AmountStep.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "every key, chip, segment and field is at least 44 pt"; AssertionError x1; restored sha256 equal
   N8 KILLED: the name field's caption read out beside the field's own name (n3) [AmountStep.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "income asks เข้า{wallet} and ชื่อรายการ, and says it is not counted in the budget"; AssertionError x1; restored sha256 equal
   N9 KILLED: Tell Bun before income's name (rh-income draws the name under the wallet chip) [AmountStep.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "income asks เข้า{wallet} and ชื่อรายการ, and says it is not counted in the budget"; AssertionError x1; restored sha256 equal
   P1 KILLED: a fill shows its stored amount in private mode [AmountStep.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "private mode hides the chips' amounts and a filled amount until a key is pressed, never the amount being typed"; AssertionError x1; restored sha256 equal
   P2 KILLED: private mode masks what is typed too [AmountStep.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "private mode hides the chips' amounts and a filled amount until a key is pressed, never the amount being typed"; AssertionError x1; restored sha256 equal
   P3 KILLED: a fill masked outside private mode [AmountStep.tsx] -> render: Tests 2 failed | 13 passed (15); first failing: "at AX5 the chips are full-width rows and ฿999,999,999.99 never truncates"; AssertionError x2; restored sha256 equal
   P4 KILLED: the masked amount still says its amount [AmountStep.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "private mode hides the chips' amounts and a filled amount until a key is pressed, never the amount being typed"; AssertionError x1; restored sha256 equal
   P5 KILLED: the mask spaced as digits, not as WalletAmount's mask [AmountStep.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "private mode hides the chips' amounts and a filled amount until a key is pressed, never the amount being typed"; AssertionError x1; restored sha256 equal
   P6 KILLED: a fill is not marked as one (filledKeypad as keypadFromMinor) [addFlow.ts] -> addFlow.test.ts: Tests 1 failed | 6 passed (7); first failing: "a fill is an amount the person did not type: its first key starts it over, a digit as a new amount and delete as nothing"; AssertionError x1; restored sha256 equal
   P7 KILLED: satang is not taken for a fill [addFlow.ts] -> addFlow.test.ts: Tests 1 failed | 6 passed (7); first failing: "a fill is an amount the person did not type: its first key starts it over, a digit as a new amount and delete as nothing"; AssertionError x1; restored sha256 equal
   P8 KILLED: a whole-baht fill is not taken for a fill [addFlow.ts] -> addFlow.test.ts: Tests 1 failed | 6 passed (7); first failing: "a fill is an amount the person did not type: its first key starts it over, a digit as a new amount and delete as nothing"; AssertionError x1; restored sha256 equal
   P9 KILLED: the catalogue's chips fill as if typed [addSections.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "the add tray's sections come right after the tray's, and each opens at once on its board's words"; AssertionError x1; restored sha256 equal
   P10 KILLED: the masked line draws the fill's digits, though it says they are hidden [AmountStep.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "private mode hides the chips' amounts and a filled amount until a key is pressed, never the amount being typed"; AssertionError x1; restored sha256 equal
   W1 KILLED: delete on a fill takes one digit (฿65.50 to ฿65.5) [addFlow.ts] -> addFlow.test.ts: Tests 1 failed | 6 passed (7); first failing: "a fill is an amount the person did not type: its first key starts it over, a digit as a new amount and delete as nothing"; AssertionError x1; restored sha256 equal
   W2 KILLED: a digit on a fill goes on from it (too_precise after satang) [addFlow.ts] -> addFlow.test.ts: Tests 1 failed | 6 passed (7); first failing: "a fill is an amount the person did not type: its first key starts it over, a digit as a new amount and delete as nothing"; AssertionError x1; restored sha256 equal
   W3 KILLED: every key by today's rules, fills and all [addFlow.ts] -> addFlow.test.ts: Tests 1 failed | 6 passed (7); first failing: "a fill is an amount the person did not type: its first key starts it over, a digit as a new amount and delete as nothing"; AssertionError x1; restored sha256 equal
   W4 KILLED: the keypad ignores that an amount was filled [WalletKeypad.tsx] -> render: Tests 3 failed | 12 passed (15); first failing: "a fill starts over at the first key: a digit begins a new amount and delete clears it, so satang never meets a point the keypad cannot type"; AssertionError x3; restored sha256 equal
   Q11 KILLED: a transfer's amount shows the quick chips (m2) [AmountStep.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "a transfer's amount stands alone, and its Next goes on to choose the two wallets"; AssertionError x1; restored sha256 equal
   T12 KILLED: a locked switch still changes the type (m3) [TypeSwitchHeader.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "the type switch is one named radio group: a new type ticks once and is chosen, and the chosen one does nothing"; AssertionError x1; restored sha256 equal
   T13 KILLED: a locked switch is not dimmed (m3) [TypeSwitchHeader.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "the type switch is one named radio group: a new type ticks once and is chosen, and the chosen one does nothing"; AssertionError x1; restored sha256 equal
   F24 KILLED: the note's guess compares the raw note (n4) [addFlow.ts] -> addFlow.test.ts: Tests 1 failed | 6 passed (7); first failing: "fields Bun filled are marked guessed until the person changes them"; AssertionError x1; restored sha256 equal
   S7 KILLED: at AX5 the section keeps the switch in its header too [addSections.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "the add tray's sections come right after the tray's, and each opens at once on its board's words"; AssertionError x1; restored sha256 equal
   S8 KILLED: the section never gives the switch to the step [addSections.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "the add tray's sections come right after the tray's, and each opens at once on its board's words"; AssertionError x1; restored sha256 equal
   S9 KILLED: the section's footer never hears the name field [addSections.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "the add tray's sections come right after the tray's, and each opens at once on its board's words"; AssertionError x1; restored sha256 equal
   S10 KILLED: the section's problem never shows [addSections.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "the add tray's sections come right after the tray's, and each opens at once on its board's words"; AssertionError x1; restored sha256 equal
   RM1 KILLED: the typed amount leaves its polite live region (first review M1) [AmountStep.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "typing 5 and 0 shows ฿50 and enables Next"; AssertionError x1; restored sha256 equal
   RM2 KILLED: a new problem is never said on iOS (first review M2, second review R4) [AmountStep.tsx] -> amountStepNative.test.ts: Tests 1 failed | 0 passed (1); first failing: "iOS says the keypad's problem once, since it reads no live region"; AssertionError x1; restored sha256 equal
   RM3 KILLED: income's typed amount drawn violet (first review M3) [AmountStep.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "income asks เข้า{wallet} and ชื่อรายการ, and says it is not counted in the budget"; AssertionError x1; restored sha256 equal
   RM5 KILLED: the name field grows past body text's cap (first review M5) [AmountStep.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "income asks เข้า{wallet} and ชื่อรายการ, and says it is not counted in the budget"; AssertionError x1; restored sha256 equal
   RM6 KILLED: a wallet no longer listed is named by its id (first review M6) [AmountStep.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "income asks เข้า{wallet} and ชื่อรายการ, and says it is not counted in the budget"; AssertionError x1; restored sha256 equal
   RM7 KILLED: the problem is not polite, role alert kept (first review M7, n2) [AmountStep.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "the keypad's problem shows right under the amount in today's words, and Next waits for an amount it can save"; AssertionError x1; restored sha256 equal
   RM8 KILLED: the chosen segment lifted by a shadow at night too (first review M8, n2) [TypeSwitchHeader.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "the type switch is one named radio group: a new type ticks once and is chosen, and the chosen one does nothing"; AssertionError x1; restored sha256 equal
   RM9 KILLED: closing a section and opening it again keeps what was typed (first review M9, n1) [addSections.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "the add tray's sections come right after the tray's, and each opens at once on its board's words"; AssertionError x1; restored sha256 equal
   RM10 KILLED: a section's problem words drift from today's catalog line (first review M10, n1) [addSections.tsx] -> render: Tests 1 failed | 14 passed (15); first failing: "the add tray's sections come right after the tray's, and each opens at once on its board's words"; AssertionError x1; restored sha256 equal
   SR1 KILLED: the step drops a refused key's too_precise (second review R1, m3) [addFlow.ts] -> addFlow.test.ts: Tests 1 failed | 6 passed (7); first failing: "the amount step's problem: a refused key's, else why the amount cannot go on, but nothing for a keypad nothing was typed on"; AssertionError x1; restored sha256 equal
   SR3 KILLED: move all withholds a balance above the keypad's cap (second review R3, n1) [addFlow.ts] -> addFlow.test.ts: Tests 1 failed | 6 passed (7); first failing: "move all offers the available balance only when it is known and above zero"; AssertionError x1; restored sha256 equal
   138 killed, 0 survived, 0 not as expected
   ```
   The first 92 are the first round's (A5, A13 and K2 re-aimed); the last 46 are this round's. Every kill is an assertion in the case named.
2. `cd WT && shasum -a 256 -c PL/SHA256SUMS.real-in-wt`, and `/usr/bin/git -C WT status --short`. Expected: unchanged from Step 3.2.

## Step 5: The fast local gate (R100)

From WT, in this order, each with its log in S:

1. `npm run typecheck:app`: exit 0.
2. `npm run test:app`: exit 0 and `ℹ fail 0`. (R100: no total is checked; record what it prints.)
3. `npm run test:unit`: exit 0 and `ℹ fail 0`.
4. The focused files once more:
   - `cd WT/apps/app && npm run test:unit -- src/wallet/add/addFlow.test.ts src/wallet/add/amountStepNative.test.ts src/wallet/copy/draftText.test.ts`: 12 of 12;
   - `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/add/AmountStep.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx`: `Test Files  5 passed (5)`, `Tests  N+15 passed (N+15)` (73 at the planner's base).
5. The catalogue's wallet sections: Step 1.4's command: exit 0, `Tests  C passed`.
6. `/usr/bin/git -C WT diff --check` before the commit, and `/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD` after it: no output.

Not run here, and why (the receipt says it):
- In CI on the PR (R100): the full render suite, `export:web` and the iOS export. No route, config, app entry, native, package or lockfile change, so no `typecheck:routes` and no `test:ops`.
- Not needed: the API, edge and database suites, since nothing outside `apps/app` changes.
- SKIPPED: the device checks the receipt lists, and the first round's.

## Step 6: Receipt

The round's receipt is its own file (R87): `docs/implementation/receipts/P2-T14-fix.md`, from the kit's `receipt/P2-T14-fix.md`. `P2-T14.md` gains one line, under its "Notes for later tasks", pointing to it, since several of those notes changed (P7, P8 and the footer's props).

1. Copy both:
   ```bash
   cp PL/receipt/P2-T14-fix.md WT/docs/implementation/receipts/P2-T14-fix.md
   cp PL/real/docs/implementation/receipts/P2-T14.md WT/docs/implementation/receipts/P2-T14.md
   ```
   Then `cd WT && shasum -a 256 -c PL/SHA256SUMS.receipt-in-wt`. Expected: one `OK` line. The pointer's diff is in the appendix.
2. Fill the three marks in `WT/docs/implementation/receipts/P2-T14-fix.md` with your own values, using Edit:
   - `«INTEGRATION»`: the integration head from Step 1.2, in backticks already (for example `3dc81b4d`);
   - `«TEST_APP»`: what Step 5.2 printed, as `ℹ tests <n>, ℹ pass <n>`;
   - `«TEST_UNIT»`: what Step 5.3 printed, the same way.
3. If any other count of yours differs from the receipt's (it should not: RED, GREEN, N, C, the mutants), write yours. Then `grep -c '«' WT/docs/implementation/receipts/P2-T14-fix.md` gives 0.

## Step 7: Commit

1. `/usr/bin/git -C WT add apps/app/src/wallet/add/addFlow.ts apps/app/src/wallet/add/addFlow.test.ts apps/app/src/wallet/add/amountStepNative.test.ts apps/app/src/wallet/add/AmountStep.tsx apps/app/src/wallet/add/AmountStep.render.test.tsx apps/app/src/wallet/add/TypeSwitchHeader.tsx apps/app/src/wallet/add/WalletKeypad.tsx apps/app/src/wallet/add/QuickChips.tsx apps/app/src/dev/catalogue/wallet/addSections.tsx docs/implementation/receipts/P2-T14.md docs/implementation/receipts/P2-T14-fix.md`
2. `/usr/bin/git -C WT status --short`: those eleven files staged (`A` for `amountStepNative.test.ts` and `P2-T14-fix.md`, `M` for the other nine), nothing else.
3. Write the message to `S/commit-message.txt`:
   ```
   Give the amount step's middle room and mask filled amounts in private mode

   At the largest text sizes the type switch leaves the tray's pinned header
   for the scrolling middle, under the amount and its problem, and the header
   is the tray's title, so the amount being typed stays in view on a 667 pt
   phone. The keypad's problem moves from the pinned footer to the middle,
   under the amount, at every size. While income's name field has focus the
   footer is Next alone, and the field lets go of focus when the keyboard
   hides. In private mode an amount the person did not type, such as a chip's
   fill, is masked until a key is pressed, and the first key on a fill starts
   the amount over, so a satang fill never meets a point the keypad cannot
   type. The name field is 44 pt in its own box under the wallet chip, a
   transfer shows no quick chips, the switch is disabled while the tray is
   locked, and the reviews' untested guards are pinned.

   Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
   ```
4. `/usr/bin/git -C WT commit -F S/commit-message.txt`, then:
   - `/usr/bin/git -C WT log --oneline -2`: the fix commit, then `18876253`;
   - `/usr/bin/git -C WT show --stat HEAD`: 11 files;
   - `/usr/bin/git -C WT status --short` prints nothing.

   Do not push.

## Your final message

As the protocol says:
- `STATUS: DONE` (or `STATUS: BLOCKED` with the exact blocker) on the first line;
- the fix commit's SHA (its parent is `18876253`), the integration head you checked, and the files changed;
- RED: Node 2 of 8 and render 10 of 15 failing on assertions;
- GREEN: the counts;
- mutants: 138, all killed;
- each gate command with its result, and no whole-suite totals as expected values;
- SKIPPED and CI items.

Name what the reviewer should look at first:
- P1, the switch under the amount and not at the middle's top, with the height budget;
- P5's three ways the keys come back;
- P7 and P8: `filledKeypad`, `isFilled` and `walletKey`, the mask on the amount line, and why delete clears a fill;
- P6, income's name under the wallet chip.

---

## Appendix: the diffs

Each block is the kit's diff, byte for byte. Copy from `PL/real/`, not from here. The tests' diffs are in `PL/diffs/` (`apps_app_src_wallet_add_AmountStep.render.test.tsx.diff`, `apps_app_src_wallet_add_addFlow.test.ts.diff`, `apps_app_src_wallet_add_amountStepNative.test.ts.diff`), and the round's receipt is `PL/receipt/P2-T14-fix.md`.

`apps/app/src/wallet/add/addFlow.ts`:

```diff
diff --git a/apps/app/src/wallet/add/addFlow.ts b/apps/app/src/wallet/add/addFlow.ts
index b59d522..d566a3a 100644
--- a/apps/app/src/wallet/add/addFlow.ts
+++ b/apps/app/src/wallet/add/addFlow.ts
@@ -13,8 +13,8 @@ import type { Lookups, Translate } from '../../spend/v1/redesign/shared.ts';
 import { categoryName } from '../../spend/v1/viewModels.ts';
 import { dayLabel } from '../../ui/dateStep.ts';
 import type { DateLocale } from '../../ui/dateStep.ts';
-import { evaluateKeypad } from '../../ui/keypadExpression.ts';
-import type { KeypadProblem, KeypadState } from '../../ui/keypadExpression.ts';
+import { applyKey, EMPTY_KEYPAD, evaluateKeypad, keypadFromMinor } from '../../ui/keypadExpression.ts';
+import type { KeypadDigit, KeypadProblem, KeypadState } from '../../ui/keypadExpression.ts';

 /** What the tray adds: spending, income, or money moved between the person's own wallets (W14). */
 export type AddType = 'expense' | 'income' | 'transfer';
@@ -59,6 +59,41 @@ export function amountProblem(keypad: KeypadState): KeypadProblem | null {
   return outcome.ok || outcome.problem === 'empty' ? null : outcome.problem;
 }

+/**
+ * The keypad for an amount the person did not type: a chip's, Bun's reading,
+ * a copy, move all, or the edit tray's opening amount (R106). It shows as
+ * keypadFromMinor shows it (6550 as 65.50) and is `fresh`, so private mode
+ * masks it until a key is pressed, and the first key starts the amount over
+ * (walletKey).
+ */
+export function filledKeypad(minor: Minor): KeypadState {
+  return { ...keypadFromMinor(minor), fresh: true };
+}
+
+/**
+ * Whether the keypad holds an amount the person did not type: a fill
+ * (filledKeypad), or satang, which only a fill can give, since this keypad has
+ * no point (W29).
+ */
+export function isFilled(keypad: KeypadState): boolean {
+  return keypad.fresh || keypad.operands.some((operand) => operand.includes('.'));
+}
+
+/** The tray keypad's keys (W29): digits, 000, 0 and delete. */
+export type WalletKey = KeypadDigit | '000' | 'backspace';
+
+/**
+ * One key of the tray's keypad, through today's applyKey. On a filled amount
+ * the first key starts over: a digit begins a new amount and delete clears it.
+ * So delete never walks a fill's satang down to a bare point (฿65.50, ฿65.5,
+ * ฿65.), no digit is refused as too precise, and no digit of a fill shows once
+ * a key is pressed (R106).
+ */
+export function walletKey(keypad: KeypadState, key: WalletKey): KeypadState {
+  if (!isFilled(keypad)) return applyKey(keypad, key);
+  return key === 'backspace' ? EMPTY_KEYPAD : applyKey(EMPTY_KEYPAD, key);
+}
+
 export type ConfirmRow = { key: 'category' | 'wallet' | 'from' | 'to' | 'date' | 'note'; labelKey: string; value: string; guessed: boolean };
 type RowKey = ConfirmRow['key'];

@@ -96,14 +131,14 @@ export function confirmRows(
   return [row('category', category ? categoryName(category, tc) : ''), row('wallet', walletName(draft.walletId)), date, note];
 }

-/** What each row shows of the draft, to tell whether the person changed it. */
+/** What each row shows of the draft, to tell whether the person changed it: the note as its row shows it, trimmed. */
 const ROW_FIELDS = new Map<string, (draft: QuickAddDraft) => string | null>([
   ['category', (draft) => (draft.type === 'transfer' ? null : draft.categoryByType[draft.type])],
   ['wallet', (draft) => draft.walletId],
   ['from', (draft) => draft.fromWalletId],
   ['to', (draft) => draft.toWalletId],
   ['date', (draft) => draft.occurredOn],
-  ['note', (draft) => draft.note],
+  ['note', (draft) => draft.note.trim()],
 ]);

 /**
```

`apps/app/src/wallet/add/AmountStep.tsx`:

```diff
diff --git a/apps/app/src/wallet/add/AmountStep.tsx b/apps/app/src/wallet/add/AmountStep.tsx
index 3001e8a..4e73886 100644
--- a/apps/app/src/wallet/add/AmountStep.tsx
+++ b/apps/app/src/wallet/add/AmountStep.tsx
@@ -1,26 +1,34 @@
 // The add tray's amount step (P2-T14; W14, W15, W29; bw-tray-amount,
 // rh-income, ax-large-tray). AmountStep is the step's middle: the amount at
-// 58 pt from what the keypad holds; the wallet the money comes from (spending)
-// or goes into (income), which opens the wallet step; บอกบัน when Bun can help
-// (P2-T16 opens today's Tell Bun sheet from it); income's name and that income
-// is not counted in the budget; and up to three quick chips. AmountFooter is
-// its footer, which the host passes to the tray's pinned `footer`: the keypad,
-// the keypad's problem in today's words, and Next, which waits for an amount
-// the keypad can save. Both are controlled (StepProps), so the edit tray
-// (P2-T27) reuses them.
+// 58 pt from what the keypad holds, with the keypad's problem in today's words
+// right under it; the wallet the money comes from (spending) or goes into
+// (income), which opens the wallet step; income's name and that income is not
+// counted in the budget; บอกบัน when Bun can help (P2-T16 opens today's Tell
+// Bun sheet from it); and up to three quick chips, never for a transfer.
+// AmountFooter is its footer, which the host passes to the tray's pinned
+// `footer`: the keys and Next, which waits for an amount the keypad can save.
+// Both are controlled (StepProps), so the edit tray (P2-T27) reuses them.
 //
-// - What the person types is never masked: private mode hides stored amounts,
-//   such as the chips', not the amount being typed (the controller's P2-T14
-//   ruling).
+// - The pinned parts leave the scrolling middle room (the fix round's R106):
+//   the problem is the middle's at every size; while income's name field has
+//   focus (the system keyboard is up) the footer is Next alone; and at the
+//   largest text sizes the type switch leaves the header for the middle,
+//   right under the amount and its problem (`typeSwitch`), so the amount
+//   being typed stays in view.
+// - Private mode hides stored amounts, such as the chips', and an amount the
+//   person did not type (a fill, isFilled) until a key is pressed; what the
+//   person types is never masked (P9 as R106 narrows it).
 // - At the largest text sizes (ax-large-tray) the tray is full height, the
-//   keypad and Next stay pinned in its footer and only the middle scrolls; the
+//   keys and Next stay pinned in its footer and only the middle scrolls; the
 //   amount opens at the middle's top, grows to 64 pt and wraps; the wallet
 //   chip and the chips become full-width rows.
 // - Tell Bun is for spending and income, as Quick add offers it; a transfer's
 //   amount stands alone, and its Next goes on to choose the two wallets.
 // - No photo row (W15): the receipt stays the record's.
 import { MERCHANT_MAX_CHARS } from '@gogospend/contracts';
-import { Pressable, View } from 'react-native';
+import { useEffect, useRef } from 'react';
+import type { ComponentRef, ReactNode } from 'react';
+import { Keyboard, Pressable, View } from 'react-native';
 import Svg, { Circle, Path } from 'react-native-svg';

 import { isRedesignEnabled } from '@mobile/config/featureFlags';
@@ -33,14 +41,16 @@ import { amountMaxScale, WALLET_TYPE, walletLineHeight } from '@mobile/theme/wal
 import { DECORATIVE, POLITE_LIVE_REGION, useAnnouncement } from '@mobile/ui/a11y';
 import { evaluateKeypad, keypadDisplay } from '@mobile/ui/keypadExpression';
 import { useLargeText } from '@mobile/ui/largeText';
+import { BUN_TOUCH } from '@mobile/ui/layout';
 import { COMMON_COPY } from '../common/copy';
 import { useDraftCopy } from '../copy/useDraftCopy';
 import { MaterialFill } from '../looks/MaterialFill';
 import { useWalletLooks } from '../looks/WalletLooksProvider';
-import { spokenMoney } from '../money/walletMoney';
+import { HIDDEN_AMOUNT, spokenMoney } from '../money/walletMoney';
+import { usePrivateMode } from '../privacy/PrivateModeProvider';
 import { PrimaryButton } from '../tray/PrimaryButton';
 import { WalletText } from '../WalletText';
-import { stepAfterAmount } from './addFlow';
+import { isFilled, stepAfterAmount } from './addFlow';
 import type { AddType, StepProps } from './addFlow';
 import { COPY } from './copy';
 import { QuickChips } from './QuickChips';
@@ -58,16 +68,28 @@ export function useCanTellBun(): boolean {
   return isRedesignEnabled('companion') && enabled;
 }

-export function AmountStep({ draft, keypad, onDraft, onStep, type, lookups, chips, canTellBun, onTellBun }: StepProps & {
+export function AmountStep({ draft, keypad, onDraft, onStep, type, lookups, chips, canTellBun, onTellBun, problem, typeSwitch, onNaming }: StepProps & {
   type: AddType;
   lookups: Lookups;
   chips: readonly QuickChip[];
   canTellBun: boolean;
   onTellBun(): void;
+  /** The keypad's problem in today's words (amountProblem, then KEYPAD_PROBLEM_TEXT through tc), or null. */
+  problem: string | null;
+  /** The type switch, when the host gives it to the step (the largest text sizes, useSwitchInHeader); otherwise null. */
+  typeSwitch: ReactNode;
+  /** Whether income's name field has focus, for AmountFooter's `naming`. */
+  onNaming(naming: boolean): void;
 }) {
   const colors = useWalletColors();
   const t = useDraftCopy(LINES);
+  const { hidden } = usePrivateMode();
+  // iOS reads no live region, so a new problem is also said once.
+  useAnnouncement(problem);
   const typed = evaluateKeypad(keypad, { allowZero: true });
+  // An amount the person did not type is masked as a stored one is, until a key is pressed (R106).
+  const masked = hidden && isFilled(keypad);
+  const wallet = type === 'transfer' ? null : <WalletChip type={type} walletId={draft.walletId} lookups={lookups} onPress={() => onStep('wallet')} />;
   return (
     <View style={{ gap: 12 }}>
       <View style={{ alignItems: 'center', gap: 8 }}>
@@ -75,46 +97,49 @@ export function AmountStep({ draft, keypad, onDraft, onStep, type, lookups, chip
         <View {...POLITE_LIVE_REGION} style={{ alignSelf: 'stretch' }}>
           <Text
             testID="add-amount"
-            accessibilityLabel={spokenMoney(typed.ok ? typed.minor : '0', t)}
+            accessibilityLabel={masked ? t('common.amountHidden') : spokenMoney(typed.ok ? typed.minor : '0', t)}
             maxFontSizeMultiplier={amountMaxScale(AMOUNT)}
             style={{
               fontFamily: LATIN_UI_FONT_FAMILY,
               fontWeight: '700',
               fontSize: AMOUNT,
               lineHeight: walletLineHeight(AMOUNT, 'latin'),
-              letterSpacing: (AMOUNT * -2) / 100,
+              // The mask is spaced 0.12 em, as WalletAmount spaces it (bw-private).
+              letterSpacing: masked ? (AMOUNT * 12) / 100 : (AMOUNT * -2) / 100,
               color: colors.ink,
               textAlign: 'center',
             }}
           >
-            {`฿${keypadDisplay(keypad)}`}
+            {masked ? HIDDEN_AMOUNT : `฿${keypadDisplay(keypad)}`}
           </Text>
         </View>
-        {type === 'transfer' ? null : <WalletChip type={type} walletId={draft.walletId} lookups={lookups} onPress={() => onStep('wallet')} />}
+        {problem === null ? null : (
+          <WalletText testID="add-problem" role="label" accessibilityRole="alert" aria-live="polite" style={{ textAlign: 'center' }}>
+            {problem}
+          </WalletText>
+        )}
+        {typeSwitch ? null : wallet}
       </View>
+      {typeSwitch ? (
+        <>
+          {typeSwitch}
+          {wallet}
+        </>
+      ) : null}
+      {type === 'income' ? <NameField value={draft.merchant} onChange={(merchant) => onDraft({ ...draft, merchant })} onNaming={onNaming} /> : null}
       {canTellBun && type !== 'transfer' ? <TellBunRow onPress={onTellBun} /> : null}
-      {type === 'income' ? <NameField value={draft.merchant} onChange={(merchant) => onDraft({ ...draft, merchant })} /> : null}
-      <QuickChips chips={chips} />
+      {type === 'transfer' ? null : <QuickChips chips={chips} />}
     </View>
   );
 }

-/** The step's footer, for the tray's pinned `footer`: the keypad, then the keypad's problem right above Next. */
-export function AmountFooter({ keypad, onKeypad, onStep, type, problem }: StepProps & { type: AddType; problem: string | null }) {
+/** The step's footer, for the tray's pinned `footer`: the keys and Next; while income's name field has focus, Next alone (R106). */
+export function AmountFooter({ keypad, onKeypad, onStep, type, naming }: StepProps & { type: AddType; naming: boolean }) {
   const t = useDraftCopy(COMMON_COPY);
-  // iOS reads no live region, so a new problem is also said once.
-  useAnnouncement(problem);
   return (
     <View style={{ gap: 12 }}>
-      <WalletKeypad keypad={keypad} onKeypad={onKeypad} />
-      <View style={{ gap: 8 }}>
-        {problem === null ? null : (
-          <WalletText testID="add-problem" role="label" accessibilityRole="alert" aria-live="polite" style={{ textAlign: 'center' }}>
-            {problem}
-          </WalletText>
-        )}
-        <PrimaryButton testID="add-next" label={t('common.next')} disabled={!evaluateKeypad(keypad).ok} onPress={() => onStep(stepAfterAmount(type))} />
-      </View>
+      {naming ? null : <WalletKeypad keypad={keypad} onKeypad={onKeypad} />}
+      <PrimaryButton testID="add-next" label={t('common.next')} disabled={!evaluateKeypad(keypad).ok} onPress={() => onStep(stepAfterAmount(type))} />
     </View>
   );
 }
@@ -197,11 +222,30 @@ function TellBunRow({ onPress }: { onPress(): void }) {
   );
 }

-/** Income's name (rh-income): one line of up to 120 characters, and the note that income is not counted in the budget. */
-function NameField({ value, onChange }: { value: string; onChange(next: string): void }) {
+/**
+ * Income's name (rh-income), right under the wallet chip as the board draws
+ * it: one line of up to 120 characters in a field at least 44 pt tall (§4),
+ * and the note that income is not counted in the budget. Its focus is the
+ * host's `naming` (R106). Android's back hides the keyboard but leaves the
+ * field focused, so the field lets go of focus when the keyboard hides, and
+ * when it leaves (the type or the step changed), so the keys always come back.
+ */
+function NameField({ value, onChange, onNaming }: { value: string; onChange(next: string): void; onNaming(naming: boolean): void }) {
   const colors = useWalletColors();
   const t = useDraftCopy(COPY);
   const large = useLargeText();
+  const input = useRef<ComponentRef<typeof TextInput>>(null);
+  const naming = useRef(onNaming);
+  useEffect(() => {
+    naming.current = onNaming;
+  });
+  useEffect(() => {
+    const hidden = Keyboard.addListener('keyboardDidHide', () => input.current?.blur());
+    return () => {
+      hidden.remove();
+      naming.current(false);
+    };
+  }, []);
   return (
     <View
       testID="add-name"
@@ -212,7 +256,7 @@ function NameField({ value, onChange }: { value: string; onChange(next: string):
         gap: large ? 4 : 12,
         paddingLeft: large ? 14 : 9,
         paddingRight: 14,
-        paddingVertical: 8,
+        paddingVertical: 4,
         borderRadius: 16,
         backgroundColor: colors.raised,
       }}
@@ -226,14 +270,18 @@ function NameField({ value, onChange }: { value: string; onChange(next: string):
         </View>
       )}
       <View style={{ flex: large ? undefined : 1, minWidth: 0 }}>
-        <WalletText role="caption" tone="quiet">{t('add.merchantLabel')}</WalletText>
+        {/* The field says its own name, so screen readers skip the caption above it. */}
+        <WalletText role="caption" tone="quiet" {...DECORATIVE}>{t('add.merchantLabel')}</WalletText>
         <TextInput
+          ref={input}
           accessibilityLabel={t('add.merchantLabel')}
           value={value}
           onChangeText={onChange}
+          onFocus={() => onNaming(true)}
+          onBlur={() => onNaming(false)}
           maxLength={MERCHANT_MAX_CHARS}
           maxFontSizeMultiplier={WALLET_TYPE.body.maxScale}
-          style={{ fontFamily: THAI_UI_FONT_FAMILY, fontSize: WALLET_TYPE.body.size, fontWeight: '500', color: colors.ink, padding: 0 }}
+          style={{ fontFamily: THAI_UI_FONT_FAMILY, fontSize: WALLET_TYPE.body.size, fontWeight: '500', color: colors.ink, minHeight: BUN_TOUCH, padding: 0 }}
         />
       </View>
       <WalletText role="caption" tone="quiet">{t('add.notInBudget')}</WalletText>
```

`apps/app/src/wallet/add/TypeSwitchHeader.tsx`:

```diff
diff --git a/apps/app/src/wallet/add/TypeSwitchHeader.tsx b/apps/app/src/wallet/add/TypeSwitchHeader.tsx
index d628d85..77ccfc8 100644
--- a/apps/app/src/wallet/add/TypeSwitchHeader.tsx
+++ b/apps/app/src/wallet/add/TypeSwitchHeader.tsx
@@ -1,13 +1,20 @@
-// The add tray's header (W14; rh-income, rh-transfer): one segmented control
-// for spending, income and moving money. It takes the title's place in the
-// tray's header row, where the title still names the dialog and is what a
-// screen reader meets first (P2-T13). A radio group named ประเภทรายการ, as the
-// boards name it and as today's TypeSwitch is a radio group: the chosen type
-// is a `card` segment with bold ink words (lifted by a soft shadow by day),
-// the others quiet on the `raised` track, so the choice never rests on the
-// fill alone. Each segment is at least 44 pt (§4); at the largest text sizes
-// the three stack, so each word stays whole. A new choice ticks once
-// (segmentChange); the chosen one does nothing.
+// The add tray's type switch (W14; rh-income, rh-transfer): one segmented
+// control for spending, income and moving money. At the standard text sizes it
+// takes the title's place in the tray's header row, where the title still
+// names the dialog and is what a screen reader meets first (P2-T13). At the
+// largest ones (ax-large-tray) the pinned header is the tray's one-line title,
+// and the host gives the switch to the step, which draws it under the amount
+// in the scrolling middle, so the pinned parts leave the middle room
+// (useSwitchInHeader, R106). A radio group named ประเภทรายการ, as the boards
+// name it and as today's TypeSwitch is a radio group: the chosen type is a
+// `card` segment with bold ink words (lifted by a soft shadow by day), the
+// others quiet on the `raised` track, so the choice never rests on the fill
+// alone. Each segment is at least 44 pt (§4); at the largest text sizes the
+// three stack, so each word stays whole. A new choice ticks once
+// (segmentChange); the chosen one does nothing. Disabled while the tray is
+// locked for a save (P2-T16), as today's TypeSwitch is: dimmed, no tick, no
+// change, and said to be unavailable (Pressable derives that from `disabled`
+// on a phone and on the web).
 import { Pressable, View } from 'react-native';

 import { playHaptic } from '@mobile/lib/hapticMoment';
@@ -25,7 +32,16 @@ const LABELS = { expense: 'add.typeExpense', income: 'add.typeIncome', transfer:
 const SEGMENT = 44;
 const LIFT = '0px 1px 4px rgba(17, 16, 20, 0.14)';

-export function TypeSwitchHeader({ type, onType }: { type: AddType; onType(type: AddType): void }) {
+/**
+ * Where the switch goes (R106): the tray's header at the standard text sizes;
+ * at the largest ones the host leaves the header to the tray's title and
+ * passes the switch to the step (AmountStep's `typeSwitch`).
+ */
+export function useSwitchInHeader(): boolean {
+  return !useLargeText();
+}
+
+export function TypeSwitchHeader({ type, onType, disabled = false }: { type: AddType; onType(type: AddType): void; disabled?: boolean }) {
   const colors = useWalletColors();
   const t = useDraftCopy(COPY);
   const large = useLargeText();
@@ -45,6 +61,7 @@ export function TypeSwitchHeader({ type, onType }: { type: AddType; onType(type:
             accessibilityLabel={t(LABELS[each])}
             accessibilityState={{ checked }}
             aria-checked={checked}
+            disabled={disabled}
             onPress={() => {
               if (checked) return;
               playHaptic('segmentChange');
@@ -60,6 +77,7 @@ export function TypeSwitchHeader({ type, onType }: { type: AddType; onType(type:
               justifyContent: 'center',
               backgroundColor: checked ? colors.card : 'transparent',
               boxShadow: checked && !colors.isDark ? LIFT : undefined,
+              opacity: disabled ? 0.4 : 1,
             }}
           >
             <WalletText role="label" tone={checked ? 'ink' : 'quiet'} style={{ fontWeight: checked ? '700' : '500', textAlign: 'center' }}>
```

`apps/app/src/wallet/add/WalletKeypad.tsx`:

```diff
diff --git a/apps/app/src/wallet/add/WalletKeypad.tsx b/apps/app/src/wallet/add/WalletKeypad.tsx
index 0e9473e..06420c0 100644
--- a/apps/app/src/wallet/add/WalletKeypad.tsx
+++ b/apps/app/src/wallet/add/WalletKeypad.tsx
@@ -1,13 +1,15 @@
 // The add tray's keypad (W29; bw-tray-amount, rh-income, ax-large-tray): 1 to
 // 9, then 000, 0 and delete, three to a row. It types through today's exact
-// rules (applyKey, src/ui/keypadExpression.ts), so an amount stays satang and
-// a key that would pass ฿999,999,999.99 is refused, its problem set for the
-// host to show. No operators and no decimal point: Quick add keeps those. The
-// keys are buttons in DM Sans, as the boards draw them, at least 46 pt tall
-// (§4's 44 pt), with nothing behind them until pressed. At the largest text
-// sizes they are 56 pt on `raised` with the digits capped at 34 pt, so each
-// reads as a target and keeps its digits (the host pins the keypad in the
-// tray's footer, so it never scrolls). Each press ticks once (keyTap).
+// rules (applyKey, src/ui/keypadExpression.ts, by way of walletKey), so an
+// amount stays satang and a key that would pass ฿999,999,999.99 is refused,
+// its problem set for the host to show. On an amount the person did not type
+// (a fill), the first key starts it over (R106). No operators and no decimal
+// point: Quick add keeps those. The keys are buttons in DM Sans, as the boards
+// draw them, at least 46 pt tall (§4's 44 pt), with nothing behind them until
+// pressed. At the largest text sizes they are 56 pt on `raised` with the
+// digits capped at 34 pt, so each reads as a target and keeps its digits (the
+// host pins the keypad in the tray's footer, so it never scrolls). Each press
+// ticks once (keyTap).
 import { Pressable, View } from 'react-native';

 import { playHaptic } from '@mobile/lib/hapticMoment';
@@ -16,13 +18,14 @@ import { useWalletColors } from '@mobile/theme/ThemeProvider';
 import { LATIN_UI_FONT_FAMILY } from '@mobile/theme/uiFontFamily';
 import { walletLineHeight } from '@mobile/theme/walletType';
 import { Glyph } from '@mobile/ui/Glyph';
-import { applyKey } from '@mobile/ui/keypadExpression';
-import type { KeypadKey, KeypadState } from '@mobile/ui/keypadExpression';
+import type { KeypadState } from '@mobile/ui/keypadExpression';
 import { useLargeText } from '@mobile/ui/largeText';
 import { useDraftCopy } from '../copy/useDraftCopy';
+import { walletKey } from './addFlow';
+import type { WalletKey } from './addFlow';
 import { COPY } from './copy';

-const ROWS: readonly (readonly KeypadKey[])[] = [
+const ROWS: readonly (readonly WalletKey[])[] = [
   ['1', '2', '3'],
   ['4', '5', '6'],
   ['7', '8', '9'],
@@ -41,9 +44,9 @@ export function WalletKeypad({ keypad, onKeypad, disabled = false }: { keypad: K
   const colors = useWalletColors();
   const t = useDraftCopy(COPY);
   const large = useLargeText();
-  const press = (key: KeypadKey) => {
+  const press = (key: WalletKey) => {
     playHaptic('keyTap');
-    onKeypad(applyKey(keypad, key));
+    onKeypad(walletKey(keypad, key));
   };
   return (
     <View testID="wallet-keypad" style={{ gap: 4 }}>
```

`apps/app/src/wallet/add/QuickChips.tsx`:

```diff
diff --git a/apps/app/src/wallet/add/QuickChips.tsx b/apps/app/src/wallet/add/QuickChips.tsx
index d15d19b..40fd926 100644
--- a/apps/app/src/wallet/add/QuickChips.tsx
+++ b/apps/app/src/wallet/add/QuickChips.tsx
@@ -6,7 +6,10 @@
 // list of full-width rows of at least 64 pt, where a long name pushes the
 // amount onto the next line. The amount is WalletAmount's, so private mode
 // masks it (W10), and each chip says its name and its amount (add.chip), or
-// that the amount is hidden.
+// that the amount is hidden. A chip's `label` is its name only and never holds
+// an amount, since private mode masks only `amountMinor` (R106): P2-T16 builds
+// it from the often-logged item's `draft.merchant`, never its `label`, which
+// ends with the amount in digits.
 import type { Minor } from '@gogospend/contracts';
 import { Pressable, View } from 'react-native';

@@ -21,7 +24,12 @@ import { usePrivateMode } from '../privacy/PrivateModeProvider';
 import { WalletText } from '../WalletText';
 import { COPY } from './copy';

-export type QuickChip = { label: string; amountMinor: Minor; apply(): void };
+export type QuickChip = {
+  /** The name only, never an amount: private mode masks only `amountMinor`. */
+  label: string;
+  amountMinor: Minor;
+  apply(): void;
+};

 const LINES = { ...COMMON_COPY, ...COPY } as const;

```

`apps/app/src/dev/catalogue/wallet/addSections.tsx`:

```diff
diff --git a/apps/app/src/dev/catalogue/wallet/addSections.tsx b/apps/app/src/dev/catalogue/wallet/addSections.tsx
index 835de08..a43954b 100644
--- a/apps/app/src/dev/catalogue/wallet/addSections.tsx
+++ b/apps/app/src/dev/catalogue/wallet/addSections.tsx
@@ -1,15 +1,18 @@
 // The add tray's catalogue sections (P2-T14, development only): the amount
 // step for spending (bw-tray-amount) and for income (rh-income), each inside a
-// Tray with the type switch as its header and the keypad and Next pinned in
-// its footer, starting from fixed sample props as the boards draw them. Each
-// tray opens at once, so a screenshot of its section shows it over the page;
-// the keys, the switch, the chips and the name field work, the keypad's
-// problem shows in today's words (as the host shows it, P2-T16), and Open the
-// tray brings it back as it started. Next, the wallet chip and บอกบัน go
-// nowhere here: the steps after the amount and Tell Bun's sheet are P2-T15's
-// and P2-T16's. Their own list, spread after the tray's in ./index.ts. The
-// sample words are catalogue samples, not app copy. A section never imports
-// the wallet test harness, which loads vitest.
+// Tray with the type switch as its header (at the largest text sizes, in the
+// step under the amount, R106) and the keys and Next pinned in its footer,
+// starting from fixed sample props as the boards draw them. Each tray opens at
+// once, so a screenshot of its section shows it over the page; the keys, the
+// switch, the chips and the name field work (a chip fills the amount as a
+// fill, which private mode masks until a key is pressed), the keypad's problem
+// shows in today's words under the amount (as the host shows it, P2-T16), the
+// name field's focus leaves Next alone in the footer, and Open the tray brings
+// it back as it started. Next, the wallet chip and บอกบัน go nowhere here: the
+// steps after the amount and Tell Bun's sheet are P2-T15's and P2-T16's. Their
+// own list, spread after the tray's in ./index.ts. The sample words are
+// catalogue samples, not app copy. A section never imports the wallet test
+// harness, which loads vitest.
 import { useState } from 'react';
 import { View } from 'react-native';

@@ -19,12 +22,12 @@ import type { Lookups } from '@mobile/spend/v1/redesign/shared';
 import { keypadFromMinor } from '@mobile/ui/keypadExpression';
 import type { KeypadProblem, KeypadState } from '@mobile/ui/keypadExpression';
 import { BUN_SPACE } from '@mobile/ui/layout';
-import { amountProblem, trayTitleKey } from '@mobile/wallet/add/addFlow';
+import { amountProblem, filledKeypad, trayTitleKey } from '@mobile/wallet/add/addFlow';
 import type { AddType } from '@mobile/wallet/add/addFlow';
 import { AmountFooter, AmountStep } from '@mobile/wallet/add/AmountStep';
 import { COPY } from '@mobile/wallet/add/copy';
 import type { QuickChip } from '@mobile/wallet/add/QuickChips';
-import { TypeSwitchHeader } from '@mobile/wallet/add/TypeSwitchHeader';
+import { TypeSwitchHeader, useSwitchInHeader } from '@mobile/wallet/add/TypeSwitchHeader';
 import type { DraftTable } from '@mobile/wallet/copy/draftText';
 import { useDraftCopy } from '@mobile/wallet/copy/useDraftCopy';
 import { TextLink } from '@mobile/wallet/tray/TextLink';
@@ -43,7 +46,8 @@ const SAMPLES = {
 } as const satisfies DraftTable;

 /**
- * Today's words for the two problems this keypad can meet, read through tc as
+ * Today's words for the two problems this keypad can meet (a fill starts over
+ * at the first key, so no key is refused as too precise), read through tc as
  * the host reads KEYPAD_PROBLEM_TEXT (screens/redesign/entry/entryHelpers.ts,
  * P2-T16). That module loads the device's id maker (expo-crypto), which no
  * catalogue list may load: every test that reads the wallet's list would.
@@ -73,8 +77,10 @@ function AmountTray({ label, start }: { label: string; start: Start }) {
   const [open, setOpen] = useState(true);
   const [draft, setDraft] = useState(begin);
   const [keypad, setKeypad] = useState<KeypadState>(() => keypadFromMinor(start.amountMinor));
+  const [naming, setNaming] = useState(false);
+  const inHeader = useSwitchInHeader();
   const lookups: Lookups = { wallets: new Map([[WALLET_ID, { id: WALLET_ID, name: t('sample.wallet') }]]), categories: new Map() };
-  const fill = (minor: string) => () => setKeypad(keypadFromMinor(minor));
+  const fill = (minor: string) => () => setKeypad(filledKeypad(minor));
   const chips: QuickChip[] = start.chips
     ? [
       { label: t('sample.coffee'), amountMinor: '6500', apply: fill('6500') },
@@ -85,6 +91,7 @@ function AmountTray({ label, start }: { label: string; start: Start }) {
   const problem = amountProblem(keypad);
   const problemWords = problem === null ? undefined : PROBLEM_WORDS[problem];
   const step = { draft, keypad, onDraft: setDraft, onKeypad: setKeypad, onStep: () => undefined };
+  const typeSwitch = <TypeSwitchHeader type={draft.type} onType={(type) => setDraft((now) => ({ ...now, type }))} />;
   return (
     <View style={{ gap: BUN_SPACE.xs, alignItems: 'flex-start' }}>
       <SpecimenLabel>{label}</SpecimenLabel>
@@ -97,10 +104,20 @@ function AmountTray({ label, start }: { label: string; start: Start }) {
           setKeypad(keypadFromMinor(start.amountMinor));
         }}
         title={t(trayTitleKey(draft.type))}
-        header={<TypeSwitchHeader type={draft.type} onType={(type) => setDraft((now) => ({ ...now, type }))} />}
-        footer={<AmountFooter {...step} type={draft.type} problem={problemWords === undefined ? null : tc(problemWords)} />}
+        header={inHeader ? typeSwitch : undefined}
+        footer={<AmountFooter {...step} type={draft.type} naming={naming} />}
       >
-        <AmountStep {...step} type={draft.type} lookups={lookups} chips={chips} canTellBun={start.tellBun} onTellBun={() => undefined} />
+        <AmountStep
+          {...step}
+          type={draft.type}
+          lookups={lookups}
+          chips={chips}
+          canTellBun={start.tellBun}
+          onTellBun={() => undefined}
+          problem={problemWords === undefined ? null : tc(problemWords)}
+          typeSwitch={inHeader ? null : typeSwitch}
+          onNaming={setNaming}
+        />
       </Tray>
     </View>
   );
```

`docs/implementation/receipts/P2-T14.md`:

```diff
diff --git a/docs/implementation/receipts/P2-T14.md b/docs/implementation/receipts/P2-T14.md
index 13fb711..06a1dbe 100644
--- a/docs/implementation/receipts/P2-T14.md
+++ b/docs/implementation/receipts/P2-T14.md
@@ -53,7 +53,7 @@
   - `test:ops`: no package or lockfile change.
   - The API, edge and database suites: nothing outside `apps/app` changes, and Docker is stopped.
   - Device and simulator checks: the keypad's ticks and the switch on a phone; VoiceOver reading each key, the switch as a radio group, the chips' words and the amount's live updates; the income name field with the system keyboard up beside the pinned keypad; the tray at AX5 on a phone; and E2-B's screenshots (the controller's, after P2-T28).
-- **Notes for later tasks:**
+- **Notes for later tasks** (the fix round's `receipts/P2-T14-fix.md` replaces these where they differ, ruling R106: read it first):
   - P2-T15: add the row labels `confirmRows` returns as keys (`add.rowCategory`, `add.rowWallet`, `add.rowFrom`, `add.rowTo`, `add.rowDate`, `add.rowNote`) to `add/copy.ts`. A row's value is empty when nothing is chosen or written, so the step says what to add (bw-tray-confirm's เพิ่มโน้ต). `TransferStep` is the `transfer` step, and the transfer's keypad and Next belong in the tray's pinned footer as `AmountFooter`'s do. `moveAllMinor` offers a balance above ฿999,999,999.99 too, as Quick add does, so apply it with `keypadFromMinor` in a try and set `too_large` when it throws (`QuickAddScreen.tsx`). `balancesAfter` keeps one wallet's balance when it is on both sides.
   - P2-T16: pass `header={<TypeSwitchHeader type={draft.type} onType={...} />}` and, on the amount step, `footer={<AmountFooter {...stepProps} type={draft.type} problem={...} />}`. The problem is `amountProblem(keypad)` in today's words, `tc(KEYPAD_PROBLEM_TEXT[problem])`. Pass `canTellBun={useCanTellBun()}`. Keep the guesses with `stillGuessed(guessed, draft, next)` in `onDraft` (it returns a new set each time). `confirmRows` takes the app's `tc`. Next calls `onStep(stepAfterAmount(type))`. The chips' `apply` fills the draft and the keypad (`keypadFromMinor`).
   - P2-T16, or a tray task: a pinned place under the tray's header would let the amount stay above the scrolling middle at AX5, as ax-large-tray draws (P10).
```
