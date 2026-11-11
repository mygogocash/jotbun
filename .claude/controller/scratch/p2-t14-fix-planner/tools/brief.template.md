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
{{RED_RENDER}}

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
   - It took the planner about {{MUTANT_MINUTES}} minutes, with the load average between {{MUTANT_LOAD}}.
   - Expected: exit 0, and these 139 lines: one per mutant, each ending "restored sha256 equal", then the tally. Compare with `PL/logs/mutants.out` (the planner's log adds an `exit=0` line).
   ```
{{MUTANTS}}
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

{{DIFFS}}
