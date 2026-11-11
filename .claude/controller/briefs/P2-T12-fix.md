# Brief P2-T12 fix round: VoiceOver opens each card of the stack, and the review's pins

You are the fixer for the P2-T12 fix round. PR #395 (branch `p2/t12-card-stack`, commit `90b5079`) adds the wallet card stack. Its Opus review says **Needs fixes** for one major:

- **M1.** Under VoiceOver on iOS, a double tap on a card behind the front one opens the card in front of it.
- **Why.** Each card is `WalletCard`'s plain `Pressable`, 200 pt tall, with only its top 54 pt showing. React Native 0.88's iOS view answers NO to `accessibilityActivate` unless `onAccessibilityTap` is set (`RCTViewComponentView.mm:1673-1680`). So VoiceOver taps the middle of the card's box, and that point lies under the next card.
- **The controller's leave.** You may edit `WalletCard.tsx`, P2-T11's file, for this fix. No task in flight edits it.

The round also takes the review's cheap pins in this task's own files (m3, m4, n2, n3 and n4), since CI cannot run before billing is fixed and one round now saves a CI run later.

The planner wrote every file below and proved it in a scratch copy of `90b5079`:
- RED on `90b5079`'s code, each new pin on an assertion;
- GREEN;
- 73 mutants, all killed;
- a run over tray-hardening's current files;
- R100's fast local gate.

You copy the planner's files, check them by checksum, prove RED, GREEN and the mutants in your own worktree, run the gate, add the receipt's fix-round section and commit. Do exactly what this brief says.

Read first:
1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. R100 applies: the fast local gate only, and no whole-suite total anywhere. R87 applies: your receipt is the existing `docs/implementation/receipts/P2-T12.md`; do not edit `premium-progress.md`.
2. The review: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/P2-T12.md`, M1, m3, m4 and n2 to n4.

## Paths and rules

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t12` (branch `p2/t12-card-stack`, head `90b5079`). Work only here.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t12-fix`, your scratch folder. Create it with `mkdir -p`. Logs and the commit message go there. Never keep anything under `/private/tmp`.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t12-fix-planner`, the planner's folder. Read it and `cp` from it; never write into it. It holds:
  - `real/`: the round's five files at their repo paths: four changed and `cardNativeProps.test.ts`, which is new;
  - `orig/`: `90b5079`'s seven files (the receipt included) and `WalletCard.tsx`, as the commit and the integration head both have them;
  - `ready/`: P2-T11's review's ready case `cardNativeProps.test.ts`, as the review wrote it. It is not on the head; `real/` holds it with M1's case added;
  - `diffs/`: one diff per file, with the paths `a/<repo path>` and `b/<repo path>`. `p2-t12-fix.patch` is the whole round, for reading; the planner checked that it turns `orig/` into `real/` byte for byte;
  - `tools/`: `mutants.py` (the runner), `prove.sh` (the planner's stages), `sums.sh`, `brief.py` and `brief.template.md` (every diff and mutant line below is the kit's own);
  - `SHA256SUMS` (the kit) and `SHA256SUMS.logs` (the planner's `logs/` and `probes/`);
  - three lists to check WT with `shasum -a 256 -c`, paths relative to WT:
    - `SHA256SUMS.orig-in-wt`: `90b5079`'s eight files;
    - `SHA256SUMS.red-in-wt`: the three tests from `real/` and the two code files from `orig/`;
    - `SHA256SUMS.real-in-wt`: the five `real/` files.
- Every shell call starts in a fresh directory, so type full paths. Below, WT, S and PL stand for the full paths above. Git: `/usr/bin/git -C WT <command>`, one git command per call. Focused Node files: `cd WT/apps/app && npm run test:unit -- <files>`. Focused render files: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts <files>`.
- No heavy lock is needed: no database suite and no workers pool. Docker is stopped and stays stopped.
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests or code to make them pass. Two exceptions:
  - the counts N and C (Step 1.5), only as Step 1.3 says;
  - a load flake: a case that times out under load in a file this round does not touch. Rerun that file alone once, and record both runs.
- Every log is your own run. Never copy the planner's logs in place of one.

## What this round decides (the planner's calls, with the reason for each)

- **F1. M1's fix is one prop:** `onAccessibilityTap={onPress}` on `WalletCard`'s `Pressable`, with two header sentences saying why. The planner read React Native 0.88's sources in `node_modules`:
  - **iOS:** `accessibilityActivate` then dispatches `onAccessibilityTap` and answers YES (`React/Fabric/Mounting/ComponentViews/View/RCTViewComponentView.mm:1673-1680`). So UIKit synthesizes no tap, and VoiceOver's double tap runs the card's own press once.
  - **Android:** nothing under `ReactAndroid` mentions the prop: 0 of its files, including the 746 Kotlin and Java files under `src/main`, with `ReactAccessibilityDelegate.kt` among them. So TalkBack's double tap stays the node's one click, and no second press is added.
  - **`Pressable`** keeps the prop in its rest props and hands it to its `View` (`Libraries/Components/Pressable/Pressable.js:238`, `:274`, `:360`). `ViewPropTypes.js:51` declares it.
  - **react-native-web 0.21.4** drops it, so the web is unchanged and logs nothing. P2-T11's `WalletCard.render.test.tsx` (9 of 9) and the catalogue's wallet sections (22) pass.
- **F2. M1's pins.**
  - **The Node pin:** in `cardNativeProps.test.ts`, P2-T11's review's ready case taken as the review wrote it (the `accessible` pin, n3 there), plus M1's case reading the `Pressable`'s props from the source (R72's trap). followups.md gave the ready case to P2-T21 and P2-T22; the pin is now in place, and the card's web role stays their decision.
  - **A render case** calls what iOS calls. The test file records each `Pressable`'s props (`vi.mock('react-native')`, wrapping `Pressable` only and passing every other export through). The case checks that a VoiceOver double tap on a card behind the front one runs the same press as a touch (P6: the tick, the lift on the gentle spring, and that card's own `onOpen` at once), once, and nothing more when the lift settles.
- **F3. n2's fix needs two lines, not one.** `frames.delete(view)` in `forget()` alone, as the review proposed, still answers the review's FP4 sequence with (2, 2). An answer that lands while the view is away is stored again after the delete. So `forget()` deletes the view's frame, and `measureView` drops an answer whose view is no longer the one registered under its wallet id.
  - Then a view that comes back (React shows a hidden subtree again with the same views) answers only what is measured after it is back.
  - N2a (no delete) and N2b (no drop) each fail the new case.
  - On a phone `measureInWindow` answers at once, so nothing lands late there; this is the web's case.
- **F4. Where the pins sit.** Each is an assertion in the case its rule belongs to, plus three new cases at the end of `CardStack.render.test.tsx` (12 cases before, 15 after):
  - m3: a lone card shows today's line (S1, L10), and a card behind the front one says and draws its pending total (S7, L1);
  - m4: one open per press after the lift settles (S4, MF7);
  - n4:
    - a second layout measures again (S10, MF9);
    - a render that changes nothing measures nothing again, counted per card view (S10, MF4);
    - `frameOf` is read as is in S10 and S11, so an `undefined` is no null (MF6);
  - n3:
    - the new case "a new order keeps each card its own frame, in the stack and in the list" (L3, and the stack's L2);
    - L4's pin in `cardStackNative.test.ts`, the Node check that reads `CardStack.tsx`. M1's pin sits with `WalletCard.tsx`'s;
  - n2 and MF6: the new registry case, which drives a card's ref by hand with views whose measurements land when it says (the review's FP4, as an assertion).
- **F5. RED for every new pin, on an assertion.**
  - M1's two pins and n2's case are RED on `90b5079`'s code itself.
  - The other pins guard code that is already right. Their RED is the review's eight survivors (L1, L10, MF7, L3, L4, MF9, MF6, MF4):
    - on `90b5079` with its own tests, all eight survive (`PL/logs/before-pins.out`);
    - on `90b5079`'s code with this round's tests, each fails its own pin on one assertion (Step 2.5). The two cases that are RED there anyway are left out by name, so no kill comes from them.
- **F6. The mutants: 73, all killed.**
  - The first round's 59, with CF1, CF6 and CF7 re-aimed where `cardFrames.tsx`'s lines moved.
  - Plus 14 new: M1 (the render case), M1n (the Node pin), M1b (a double tap that presses twice), RM4 (P2-T11's review's mutant on the card's `accessible`), L1, L10, MF7, L3, L4, MF9, MF6, MF4, N2a and N2b.
  - The only kills that are not assertions are the first round's two: CS20b (Reanimated's web build throws for a missing dependency array, R72) and CF8 (outside a provider the stack destructures from null).
- **F7. Carried elsewhere; the controller records them:** m1 (a card behind the front one that grows past it) to P2-T24 with E2-A's peek decision; m2 (stale frames after a reorder of the same count) to P2-T17; n1 (two quick presses) to P2-T24. The receipt's P2-T17 note now says to call `measure()` before every flight (Step 6).
- **F8. Clear of the work in flight.** tray-hardening (PR #392, now `99ce506`) shares no file with this round. `prove.sh compat-tray` laid its three files from the PR's branch over the GREEN copy:
  - typecheck exit 0;
  - Node 8 of 8;
  - render 42 of 42: this file's 15 and its `Tray.render.test.tsx`'s 27.
- **F9. A device check stays SKIPPED** until someone runs it: with VoiceOver on an iPhone, a double tap on each card behind the front one opens its own wallet. The Simulator has no VoiceOver.

## Step 1: Sync and check the base

1. `/usr/bin/git -C WT status --short` prints nothing, and `/usr/bin/git -C WT rev-parse --short HEAD` prints `90b5079`. Otherwise report BLOCKED.
2. `/usr/bin/git -C WT fetch origin claude/p1a-vault-core`, then `/usr/bin/git -C WT merge --no-edit origin/claude/p1a-vault-core`. Expected: a clean merge of controller files, or "Already up to date." (since `dbfde7d`, `90b5079`'s base, the head has changed only files under `.claude/`). Any conflict: BLOCKED. Then `/usr/bin/git -C WT rev-parse --short HEAD`, and record it.
3. `/usr/bin/git -C WT diff --stat 90b5079 HEAD -- apps packages package.json package-lock.json`. Expected: no output.
   - If it lists only tray-hardening's three files (`apps/app/src/wallet/tray/Tray.tsx`, `Tray.render.test.tsx`, `trayGesture.test.ts`; PR #392 merged meanwhile), go on. N is then what you measure in Step 1.5 (49 if its test has 27 cases), and the receipt names the merge.
   - Anything else: BLOCKED with the output.
4. `cd WT && shasum -a 256 -c PL/SHA256SUMS.orig-in-wt` (type the full paths). Expected: eight `OK` lines, exit 0. And `ls WT/apps/app/src/wallet/card/cardNativeProps.test.ts` says "No such file or directory".
5. The base:
   - Only if `WT/node_modules` is missing: `cd WT && npm ci --ignore-scripts --no-audit --no-fund > S/npm-ci.log 2>&1; echo $?`. Expected: 0 and "added 1416 packages".
   - `cd WT && npm run typecheck:app > S/base-typecheck.log 2>&1; echo $?`. Expected: 0.
   - `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/card/CardStack.render.test.tsx src/wallet/card/WalletCard.render.test.tsx > S/base-focused.log 2>&1; echo $?`. Expected: 0, `Tests  21 passed (21)` (12 and 9).
   - The neighbours: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/testing/walletHarness.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx > S/base-neighbours.log 2>&1; echo $?`. Expected: 0, `Tests  38 passed (38)` (9, 16 and 13). Call this count N.
   - The catalogue's wallet sections: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "bw-" > S/base-catalogue.log 2>&1; echo $?`. Expected: 0, `Tests  22 passed` (11 wallet sections in two suites). Call this count C, and ignore the `skipped` count.

   Compare with `PL/logs/base-*.log`.

## Step 2: The tests first, and RED on `90b5079`'s code

1. Copy the three test files:
   ```bash
   cp PL/real/apps/app/src/wallet/card/CardStack.render.test.tsx WT/apps/app/src/wallet/card/CardStack.render.test.tsx
   cp PL/real/apps/app/src/wallet/card/cardStackNative.test.ts WT/apps/app/src/wallet/card/cardStackNative.test.ts
   cp PL/real/apps/app/src/wallet/card/cardNativeProps.test.ts WT/apps/app/src/wallet/card/cardNativeProps.test.ts
   ```
   Then `cd WT && shasum -a 256 -c PL/SHA256SUMS.red-in-wt`. Expected: five `OK` lines.
2. `cd WT && npm run typecheck:app > S/red-typecheck.log 2>&1; echo $?`. Expected: 0.
3. `cd WT/apps/app && npm run test:unit -- src/wallet/card/cardNativeProps.test.ts src/wallet/card/cardStackNative.test.ts > S/red-unit.log 2>&1; echo $?`. Expected:
   - exit 1, `ℹ tests 4`, `ℹ pass 3`, `ℹ fail 1`;
   - the one failure is `VoiceOver's double tap runs the card's own press, never a tap at the card's middle`, on `AssertionError [ERR_ASSERTION]: The input did not match the regular expression /<Pressable accessibilityRole="button" ...`.
4. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/card/CardStack.render.test.tsx > S/red-render.log 2>&1; echo $?`. Expected:
   - exit 1, `Tests  2 failed | 13 passed (15)`;
   - `grep -c '^AssertionError' S/red-render.log` gives 2;
   - `grep -cE 'Cannot find module|Failed to resolve|TestingLibraryElementError' S/red-render.log` gives 0.

   The two, each failing first on:
   - `a VoiceOver double tap on a card behind the front one runs that card's own press, once (M1)`: `expected [ 'undefined', 'undefined', …(2) ] to deeply equal [ 'function', 'function', …(2) ]`
   - `a view that comes back answers only what is measured after it is back, and frameOf is exactly null until then`: `expected [ 3, { x: 2, y: 2, width: 100, …(1) } ] to deeply equal [ 3, null ]` (the stale answer of the review's FP4)

   The other 13 pass: the review found their code right (F5).
5. The pins that guard code which is already right: the review's eight survivors, each now killed by its own pin on `90b5079`'s code. The two cases of Step 2.4 are left out by name (`RENDER_T`, a test-name pattern that `mutants.py` passes to vitest as `-t`). Type it on one line:
   ```bash
   RENDER_T='^(?!.*(?:VoiceOver double tap|a view that comes back)).*$' python3 -I PL/tools/mutants.py WT S/red-pins-logs L1 L10 MF7 L3 L4 MF9 MF6 MF4 > S/red-pins.out 2>&1; echo $?
   ```
   Expected: exit 0, and these 9 lines. Each mutant fails one case, its pin, on one assertion; L4 fails the Node check. Compare with `PL/logs/red-pins.out`. The same eight survive on `90b5079` with its own tests (`PL/logs/before-pins.out`).
   ```
   L1 KILLED: a card behind the front one drops its pending total (m3) [CardStack.tsx] -> Tests 1 failed | 12 passed | 2 skipped (15); first failing: "screen readers meet the cards in the drawn order, each a button with its card's words"; AssertionError x1; restored sha256 equal
   L10 KILLED: the front card shows today only while there is more than one card (m3) [CardStack.tsx] -> Tests 1 failed | 12 passed | 2 skipped (15); first failing: "the stack is 54 pt per card plus one whole card"; AssertionError x1; restored sha256 equal
   MF7 KILLED: onOpen at once and again at the spring's end (m4) [CardStack.tsx] -> Tests 1 failed | 12 passed | 2 skipped (15); first failing: "under reduced motion the card opens with no lift"; AssertionError x1; restored sha256 equal
   L3 KILLED: the list keys its cards by place, not by wallet (n3) [CardStack.tsx] -> Tests 1 failed | 12 passed | 2 skipped (15); first failing: "a new order keeps each card its own frame, in the stack and in the list: the cards are keyed by wallet"; AssertionError x1; restored sha256 equal
   L4 KILLED: the stack groups its cards into one accessibility element on a phone (n3) [CardStack.tsx] -> Tests 1 failed | 1 passed (2); first failing: "no view of the stack groups its cards into one accessibility element, so VoiceOver meets each card's button"; AssertionError x1; restored sha256 equal
   MF9 KILLED: the stack measures its cards after its first layout only (n4) [CardStack.tsx] -> Tests 1 failed | 12 passed | 2 skipped (15); first failing: "each card's place in the window is known after layout, measured again when the stack lays out, and forgotten when the card leaves"; AssertionError x1; restored sha256 equal
   MF6 KILLED: frameOf answers undefined, not null, before a card is measured (n4) [cardFrames.tsx] -> Tests 1 failed | 12 passed | 2 skipped (15); first failing: "each card's place in the window is known after layout, measured again when the stack lays out, and forgotten when the card leaves"; AssertionError x1; restored sha256 equal
   MF4 KILLED: a new ref on every render: each render measures every card again (n4) [cardFrames.tsx] -> Tests 1 failed | 12 passed | 2 skipped (15); first failing: "each card's place in the window is known after layout, measured again when the stack lays out, and forgotten when the card leaves"; AssertionError x1; restored sha256 equal
   8 killed, 0 survived, 0 not as expected
   ```
   Then `cd WT && shasum -a 256 -c PL/SHA256SUMS.red-in-wt` again: five `OK` lines. The runner puts each file back.

## Step 3: GREEN

1. Copy the code:
   ```bash
   cp PL/real/apps/app/src/wallet/card/WalletCard.tsx WT/apps/app/src/wallet/card/WalletCard.tsx
   cp PL/real/apps/app/src/wallet/card/cardFrames.tsx WT/apps/app/src/wallet/card/cardFrames.tsx
   ```
2. `cd WT && shasum -a 256 -c PL/SHA256SUMS.real-in-wt`. Expected: five `OK` lines. Then `/usr/bin/git -C WT status --short`, which shows exactly these five lines:
   ```
    M apps/app/src/wallet/card/CardStack.render.test.tsx
    M apps/app/src/wallet/card/WalletCard.tsx
    M apps/app/src/wallet/card/cardFrames.tsx
    M apps/app/src/wallet/card/cardStackNative.test.ts
   ?? apps/app/src/wallet/card/cardNativeProps.test.ts
   ```
   The diffs are in the appendix.
3. `cd WT && npm run typecheck:app > S/green-typecheck.log 2>&1; echo $?`. Expected: 0.
4. `cd WT/apps/app && npm run test:unit -- src/wallet/card/cardNativeProps.test.ts src/wallet/card/cardStackNative.test.ts > S/green-unit.log 2>&1; echo $?`. Expected: 0, `ℹ tests 4`, `ℹ pass 4`, `ℹ fail 0`.
5. The command of Step 1.5's focused line, into `S/green-focused.log`, with `--reporter=verbose`. Expected:
   - exit 0, `Tests  24 passed (24)` (CardStack 15, WalletCard 9), each case marked `✓`;
   - the stderr holds only the base's notices: Vite's config-loader notice, two `expo-status-bar` sourcemap notices and Node's `localStorage` warning. No `act(...)` warning and no `console.error`.
6. The neighbours, Step 1.5's command, into `S/green-neighbours.log`: exit 0, `Tests  N passed (N)`.
7. The catalogue, Step 1.5's command, into `S/green-catalogue.log`: exit 0, `Tests  C passed`, unchanged. The wallet sections draw `WalletCard`, and the new prop changes nothing on the web.

## Step 4: Mutation check

1. `python3 -I PL/tools/mutants.py WT S/mutant-logs > S/mutants.out 2>&1; echo $?` (full paths).
   - It applies each mutant alone and runs its test file: `CardStack.render.test.tsx`, or one of the two Node checks.
   - It restores each file with its SHA-256 checked.
   - It takes about two and a half minutes for the planner, at a load average near 8.
   - Expected: exit 0, and these 74 lines: one per mutant, each ending "restored sha256 equal", then the tally. Compare with `PL/logs/mutants.out`.
   ```
   CS1 KILLED: the large-text list puts the front card last (the plan's mutant) [CardStack.tsx] -> Tests 3 failed | 12 passed (15); first failing: "at AX5 the stack is a list with the front card first, and nothing truncates"; AssertionError x3; restored sha256 equal
   CS2 KILLED: onOpen is called from the spring's end (the plan's mutant) [CardStack.tsx] -> Tests 3 failed | 12 passed (15); first failing: "pressing a card plays the walletOpen tick and opens that wallet at once"; AssertionError x3; restored sha256 equal
   CS3 KILLED: each card 50 pt below the one before [CardStack.tsx] -> Tests 2 failed | 13 passed (15); first failing: "the stack is 54 pt per card plus one whole card"; AssertionError x2; restored sha256 equal
   CS4 KILLED: the front card is placed over the stack too, out of its flow [CardStack.tsx] -> Tests 2 failed | 13 passed (15); first failing: "the stack is 54 pt per card plus one whole card"; AssertionError x2; restored sha256 equal
   CS5 KILLED: the cards behind are in the flow, each pushed down [CardStack.tsx] -> Tests 2 failed | 13 passed (15); first failing: "the stack is 54 pt per card plus one whole card"; AssertionError x2; restored sha256 equal
   CS6 KILLED: the front card sits at the stack's top [CardStack.tsx] -> Tests 2 failed | 13 passed (15); first failing: "the stack is 54 pt per card plus one whole card"; AssertionError x2; restored sha256 equal
   CS7 KILLED: the cards behind span only their content, not the stack [CardStack.tsx] -> Tests 1 failed | 14 passed (15); first failing: "the stack is 54 pt per card plus one whole card"; AssertionError x1; restored sha256 equal
   CS8 KILLED: the stack draws its cards front card first [CardStack.tsx] -> Tests 11 failed | 4 passed (15); first failing: "the stack is 54 pt per card plus one whole card"; AssertionError x11; restored sha256 equal
   CS9 KILLED: no tick [CardStack.tsx] -> Tests 3 failed | 12 passed (15); first failing: "pressing a card plays the walletOpen tick and opens that wallet at once"; AssertionError x3; restored sha256 equal
   CS10 KILLED: the tick goes straight to the engine, past the person's setting [CardStack.tsx] -> Tests 1 failed | 14 passed (15); first failing: "pressing a card plays the walletOpen tick and opens that wallet at once"; AssertionError x1; restored sha256 equal
   CS11 KILLED: the tick only at full motion [CardStack.tsx] -> Tests 1 failed | 14 passed (15); first failing: "under reduced motion the card opens with no lift"; AssertionError x1; restored sha256 equal
   CS12 KILLED: the lift ignores reduced motion [CardStack.tsx] -> Tests 1 failed | 14 passed (15); first failing: "under reduced motion the card opens with no lift"; AssertionError x1; restored sha256 equal
   CS13 KILLED: the answer is read at mount, not at the press [CardStack.tsx] -> Tests 3 failed | 12 passed (15); first failing: "under reduced motion the card opens with no lift"; AssertionError x3; restored sha256 equal
   CS14 KILLED: no onOpen at all [CardStack.tsx] -> Tests 4 failed | 11 passed (15); first failing: "pressing a card plays the walletOpen tick and opens that wallet at once"; AssertionError x4; restored sha256 equal
   CS15 KILLED: a 10 pt lift [CardStack.tsx] -> Tests 3 failed | 12 passed (15); first failing: "under reduced motion the card opens with no lift"; AssertionError x3; restored sha256 equal
   CS16 KILLED: the bouncy spring [CardStack.tsx] -> Tests 3 failed | 12 passed (15); first failing: "under reduced motion the card opens with no lift"; AssertionError x3; restored sha256 equal
   CS17 KILLED: Reanimated's own setting can cut the lift (W6) [CardStack.tsx] -> Tests 3 failed | 12 passed (15); first failing: "under reduced motion the card opens with no lift"; AssertionError x3; restored sha256 equal
   CS18 KILLED: the card stays lifted [CardStack.tsx] -> Tests 3 failed | 12 passed (15); first failing: "under reduced motion the card opens with no lift"; AssertionError x3; restored sha256 equal
   CS19 KILLED: the card drops instead of lifting [CardStack.tsx] -> Tests 3 failed | 12 passed (15); first failing: "under reduced motion the card opens with no lift"; AssertionError x3; restored sha256 equal
   CS20 KILLED: an empty dependency array: the style never hears the lift (R72) [CardStack.tsx] -> Tests 3 failed | 12 passed (15); first failing: "under reduced motion the card opens with no lift"; AssertionError x3; restored sha256 equal
   CS20b KILLED: no dependency array (R72; Reanimated's web build throws) [CardStack.tsx] -> Tests 14 failed | 1 passed (15); first failing: "the stack is 54 pt per card plus one whole card"; AssertionError x0; restored sha256 equal
   CS21 KILLED: no lift at all [CardStack.tsx] -> Tests 3 failed | 12 passed (15); first failing: "under reduced motion the card opens with no lift"; AssertionError x3; restored sha256 equal
   CS22 KILLED: every card shows today's money out [CardStack.tsx] -> Tests 4 failed | 11 passed (15); first failing: "at AX5 the stack is a list with the front card first, and nothing truncates"; AssertionError x4; restored sha256 equal
   CS23 KILLED: no card shows today's money out [CardStack.tsx] -> Tests 6 failed | 9 passed (15); first failing: "the stack is 54 pt per card plus one whole card"; AssertionError x6; restored sha256 equal
   CS24 KILLED: the first card shows today's money out, not the front one [CardStack.tsx] -> Tests 4 failed | 11 passed (15); first failing: "screen readers meet the cards in the drawn order, each a button with its card's words"; AssertionError x4; restored sha256 equal
   CS25 KILLED: the list's front card loses today's money out [CardStack.tsx] -> Tests 2 failed | 13 passed (15); first failing: "at AX5 the stack is a list with the front card first, and nothing truncates"; AssertionError x2; restored sha256 equal
   CS26 KILLED: the list draws stack cards [CardStack.tsx] -> Tests 3 failed | 12 passed (15); first failing: "at AX5 the stack is a list with the front card first, and nothing truncates"; AssertionError x3; restored sha256 equal
   CS27 KILLED: the stack draws spine cards [CardStack.tsx] -> Tests 3 failed | 12 passed (15); first failing: "the stack is 54 pt per card plus one whole card"; AssertionError x3; restored sha256 equal
   CS28 KILLED: the list 10 pt apart [CardStack.tsx] -> Tests 1 failed | 14 passed (15); first failing: "at AX5 the stack is a list with the front card first, and nothing truncates"; AssertionError x1; restored sha256 equal
   CS29 KILLED: no list at the largest text sizes [CardStack.tsx] -> Tests 5 failed | 10 passed (15); first failing: "by day each card casts bw-home's shadow up onto the card behind it; at night, and in the list, none"; AssertionError x5; restored sha256 equal
   CS30 KILLED: the list at every text size [CardStack.tsx] -> Tests 11 failed | 4 passed (15); first failing: "the stack is 54 pt per card plus one whole card"; AssertionError x11; restored sha256 equal
   CS31 KILLED: the first card casts a shadow [CardStack.tsx] -> Tests 2 failed | 13 passed (15); first failing: "the stack is 54 pt per card plus one whole card"; AssertionError x2; restored sha256 equal
   CS32 KILLED: shadows at night [CardStack.tsx] -> Tests 1 failed | 14 passed (15); first failing: "by day each card casts bw-home's shadow up onto the card behind it; at night, and in the list, none"; AssertionError x1; restored sha256 equal
   CS33 KILLED: the front card casts the cards' behind shadow [CardStack.tsx] -> Tests 1 failed | 14 passed (15); first failing: "by day each card casts bw-home's shadow up onto the card behind it; at night, and in the list, none"; AssertionError x1; restored sha256 equal
   CS34 KILLED: the frame has no corner for its shadow [CardStack.tsx] -> Tests 1 failed | 14 passed (15); first failing: "by day each card casts bw-home's shadow up onto the card behind it; at night, and in the list, none"; AssertionError x1; restored sha256 equal
   CS35 KILLED: the list casts shadows [CardStack.tsx] -> Tests 1 failed | 14 passed (15); first failing: "by day each card casts bw-home's shadow up onto the card behind it; at night, and in the list, none"; AssertionError x1; restored sha256 equal
   CS36 KILLED: the stack does not measure its cards after its layout [CardStack.tsx] -> Tests 1 failed | 14 passed (15); first failing: "each card's place in the window is known after layout, measured again when the stack lays out, and forgotten when the card leaves"; AssertionError x1; restored sha256 equal
   CS37 KILLED: the list does not measure its cards after its layout [CardStack.tsx] -> Tests 1 failed | 14 passed (15); first failing: "each card's place in the window is known after layout, measured again when the stack lays out, and forgotten when the card leaves"; AssertionError x1; restored sha256 equal
   CS38 KILLED: the cards do not register [CardStack.tsx] -> Tests 1 failed | 14 passed (15); first failing: "each card's place in the window is known after layout, measured again when the stack lays out, and forgotten when the card leaves"; AssertionError x1; restored sha256 equal
   CS39 KILLED: the measured view may be flattened away on a phone [CardStack.tsx] -> Tests 1 failed | 1 passed (2); first failing: "the view each card registers is kept as a native view, so it can be measured"; AssertionError x1; restored sha256 equal
   CF1 KILLED: a view is not measured when it registers [cardFrames.tsx] -> Tests 3 failed | 12 passed (15); first failing: "each card's place in the window is known after layout, measured again when the stack lays out, and forgotten when the card leaves"; AssertionError x2; restored sha256 equal
   CF2 KILLED: x and y swapped [cardFrames.tsx] -> Tests 2 failed | 13 passed (15); first failing: "each card's place in the window is known after layout, measured again when the stack lays out, and forgotten when the card leaves"; AssertionError x2; restored sha256 equal
   CF3 KILLED: width and height swapped [cardFrames.tsx] -> Tests 3 failed | 12 passed (15); first failing: "each card's place in the window is known after layout, measured again when the stack lays out, and forgotten when the card leaves"; AssertionError x3; restored sha256 equal
   CF4 KILLED: a view that leaves is never forgotten [cardFrames.tsx] -> Tests 2 failed | 13 passed (15); first failing: "each card's place in the window is known after layout, measured again when the stack lays out, and forgotten when the card leaves"; AssertionError x2; restored sha256 equal
   CF5 KILLED: a view that leaves forgets another view's frame [cardFrames.tsx] -> Tests 1 failed | 14 passed (15); first failing: "one view per wallet id: the last registered answers, and a view that leaves never forgets another; outside a provider nothing is kept"; AssertionError x1; restored sha256 equal
   CF6 KILLED: frames kept by wallet id: a measurement that lands after its view left is given out [cardFrames.tsx] -> Tests 2 failed | 13 passed (15); first failing: "each card's place in the window is known after layout, measured again when the stack lays out, and forgotten when the card leaves"; AssertionError x2; restored sha256 equal
   CF7 KILLED: measure() measures nothing [cardFrames.tsx] -> Tests 2 failed | 13 passed (15); first failing: "each card's place in the window is known after layout, measured again when the stack lays out, and forgotten when the card leaves"; AssertionError x1; restored sha256 equal
   CF8 KILLED: outside a provider the stack has no frames to ask [cardFrames.tsx] -> Tests 13 failed | 2 passed (15); first failing: "the stack is 54 pt per card plus one whole card"; AssertionError x0; restored sha256 equal
   CF9 KILLED: the ref keeps its first wallet's id [cardFrames.tsx] -> Tests 1 failed | 14 passed (15); first failing: "one view per wallet id: the last registered answers, and a view that leaves never forgets another; outside a provider nothing is kept"; AssertionError x1; restored sha256 equal
   CF10 KILLED: the ref never forgets the view it registered [cardFrames.tsx] -> Tests 3 failed | 12 passed (15); first failing: "each card's place in the window is known after layout, measured again when the stack lays out, and forgotten when the card leaves"; AssertionError x3; restored sha256 equal
   CF11 KILLED: a new registry on every render of the provider [cardFrames.tsx] -> Tests 2 failed | 13 passed (15); first failing: "each card's place in the window is known after layout, measured again when the stack lays out, and forgotten when the card leaves"; AssertionError x2; restored sha256 equal
   CF12 KILLED: useCardFrames never reads the provider [cardFrames.tsx] -> Tests 3 failed | 12 passed (15); first failing: "each card's place in the window is known after layout, measured again when the stack lays out, and forgotten when the card leaves"; AssertionError x3; restored sha256 equal
   SC1 KILLED: the stack's sections after the tray's [index.ts] -> Tests 1 failed | 14 passed (15); first failing: "the catalogue's stack sections come after the kit's and draw bw-home's stack; the largest-text one is the list at AX5"; AssertionError x1; restored sha256 equal
   SC2 KILLED: the stack's sections are not listed [index.ts] -> Tests 1 failed | 14 passed (15); first failing: "the catalogue's stack sections come after the kit's and draw bw-home's stack; the largest-text one is the list at AX5"; AssertionError x1; restored sha256 equal
   SC3 KILLED: another id for the largest-text section [stackSections.tsx] -> Tests 1 failed | 14 passed (15); first failing: "the catalogue's stack sections come after the kit's and draw bw-home's stack; the largest-text one is the list at AX5"; AssertionError x1; restored sha256 equal
   SC4 KILLED: a title without 'Bun Wallet: ' [stackSections.tsx] -> Tests 1 failed | 14 passed (15); first failing: "the catalogue's stack sections come after the kit's and draw bw-home's stack; the largest-text one is the list at AX5"; AssertionError x1; restored sha256 equal
   SC5 KILLED: the largest-text section draws the home stack [stackSections.tsx] -> Tests 1 failed | 14 passed (15); first failing: "the catalogue's stack sections come after the kit's and draw bw-home's stack; the largest-text one is the list at AX5"; AssertionError x1; restored sha256 equal
   SC6 KILLED: the largest-text section's front card has a short name [stackSections.tsx] -> Tests 1 failed | 14 passed (15); first failing: "the catalogue's stack sections come after the kit's and draw bw-home's stack; the largest-text one is the list at AX5"; AssertionError x1; restored sha256 equal
   RM5 KILLED: the spine card's balance loses its minus (P2-T11's review, n2) [WalletCard.tsx] -> Tests 1 failed | 14 passed (15); first failing: "a bank account below zero keeps its minus in the stack and in the list, in words and on screen (P2-T11's review, K5)"; AssertionError x1; restored sha256 equal
   M1 KILLED: VoiceOver's double tap taps the card's middle again (M1) [WalletCard.tsx] -> Tests 1 failed | 14 passed (15); first failing: "a VoiceOver double tap on a card behind the front one runs that card's own press, once (M1)"; AssertionError x1; restored sha256 equal
   M1n KILLED: VoiceOver's double tap taps the card's middle again (M1), read from the source [WalletCard.tsx] -> Tests 1 failed | 1 passed (2); first failing: "VoiceOver's double tap runs the card's own press, never a tap at the card's middle"; AssertionError x1; restored sha256 equal
   M1b KILLED: VoiceOver's double tap runs the press twice [WalletCard.tsx] -> Tests 1 failed | 14 passed (15); first failing: "a VoiceOver double tap on a card behind the front one runs that card's own press, once (M1)"; AssertionError x1; restored sha256 equal
   RM4 KILLED: a card with no onPress is no accessibility element on a phone (P2-T11's review, n3) [WalletCard.tsx] -> Tests 1 failed | 1 passed (2); first failing: "a card with no onPress is one accessibility element on a phone, labelled with its words"; AssertionError x1; restored sha256 equal
   L1 KILLED: a card behind the front one drops its pending total (m3) [CardStack.tsx] -> Tests 1 failed | 14 passed (15); first failing: "screen readers meet the cards in the drawn order, each a button with its card's words"; AssertionError x1; restored sha256 equal
   L10 KILLED: the front card shows today only while there is more than one card (m3) [CardStack.tsx] -> Tests 1 failed | 14 passed (15); first failing: "the stack is 54 pt per card plus one whole card"; AssertionError x1; restored sha256 equal
   MF7 KILLED: onOpen at once and again at the spring's end (m4) [CardStack.tsx] -> Tests 2 failed | 13 passed (15); first failing: "under reduced motion the card opens with no lift"; AssertionError x2; restored sha256 equal
   L3 KILLED: the list keys its cards by place, not by wallet (n3) [CardStack.tsx] -> Tests 1 failed | 14 passed (15); first failing: "a new order keeps each card its own frame, in the stack and in the list: the cards are keyed by wallet"; AssertionError x1; restored sha256 equal
   L4 KILLED: the stack groups its cards into one accessibility element on a phone (n3) [CardStack.tsx] -> Tests 1 failed | 1 passed (2); first failing: "no view of the stack groups its cards into one accessibility element, so VoiceOver meets each card's button"; AssertionError x1; restored sha256 equal
   MF9 KILLED: the stack measures its cards after its first layout only (n4) [CardStack.tsx] -> Tests 1 failed | 14 passed (15); first failing: "each card's place in the window is known after layout, measured again when the stack lays out, and forgotten when the card leaves"; AssertionError x1; restored sha256 equal
   MF6 KILLED: frameOf answers undefined, not null, before a card is measured (n4) [cardFrames.tsx] -> Tests 2 failed | 13 passed (15); first failing: "each card's place in the window is known after layout, measured again when the stack lays out, and forgotten when the card leaves"; AssertionError x2; restored sha256 equal
   MF4 KILLED: a new ref on every render: each render measures every card again (n4) [cardFrames.tsx] -> Tests 2 failed | 13 passed (15); first failing: "each card's place in the window is known after layout, measured again when the stack lays out, and forgotten when the card leaves"; AssertionError x2; restored sha256 equal
   N2a KILLED: a view that leaves keeps its frame, so it answers it again when it comes back (n2) [cardFrames.tsx] -> Tests 1 failed | 14 passed (15); first failing: "a view that comes back answers only what is measured after it is back, and frameOf is exactly null until then"; AssertionError x1; restored sha256 equal
   N2b KILLED: an answer that lands while its view is away is kept (n2) [cardFrames.tsx] -> Tests 1 failed | 14 passed (15); first failing: "a view that comes back answers only what is measured after it is back, and frameOf is exactly null until then"; AssertionError x1; restored sha256 equal
   73 killed, 0 survived, 0 not as expected
   ```
   The first 59 are the first round's (CS, CF, SC and RM5); the last 14 are this round's. Every kill is an assertion in the case named, except CS20b (every case fails on Reanimated's own error for a missing dependency array, R72) and CF8 (a `TypeError`: outside a provider the stack destructures `measure` from null), as in the first round.
2. `cd WT && shasum -a 256 -c PL/SHA256SUMS.real-in-wt`, and `/usr/bin/git -C WT status --short`. Expected: unchanged from Step 3.2.

## Step 5: The fast local gate (R100)

From WT, in this order, each with its log in S:

1. `npm run typecheck:app`: exit 0.
2. `npm run test:unit`: exit 0 and `ℹ fail 0`. (R100: no total is checked; record what it prints.)
3. `npm run test:app`: exit 0 and `ℹ fail 0`.
4. The focused files once more:
   - `cd WT/apps/app && npm run test:unit -- src/wallet/card/cardNativeProps.test.ts src/wallet/card/cardStackNative.test.ts`: 4 of 4;
   - `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/card/CardStack.render.test.tsx src/wallet/card/WalletCard.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx`: `Test Files  5 passed (5)`, `Tests  N+24 passed (N+24)` (62 at the planner's base).
5. The catalogue's wallet sections: Step 1.5's command: exit 0, `Tests  C passed`.
6. `/usr/bin/git -C WT diff --check` before the commit, and `/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD` after it: no output.

Not run here, and why (put this in the receipt):
- In CI on the PR once billing is fixed (R100): the full render suite, `export:web`, the iOS export, `test:ops` and the database suites. No route, config, app entry, package or lockfile changes.
- Not needed: the API and edge suites, since nothing outside `apps/app` changes.
- SKIPPED: the device check of F9, and the first round's device checks.

## Step 6: Receipt

Edit `WT/docs/implementation/receipts/P2-T12.md` in its own style. Change only the two places below.

1. In "Notes for later tasks", the P2-T17 line: replace exactly `Call \`measure()\` before a flight: a frame does not follow Home's scroll.` with:
   ```
   Call `measure()` before every flight: a frame does not follow a reorder of the same number of wallets, a swapped wallet, an ancestor that moves, or Home's scroll (review m2). On a phone `frameOf` is fresh right after the call; on the web, after a `setTimeout` of 0.
   ```
2. At the end of the file, add a section `## Fix round (review M1, m3, m4, n2, n3 and n4)`, with your own numbers where they differ from these. Use these bold-labelled bullets:
   - **Status:** the review's verdict (Needs fixes, M1 major), the commit it reviewed (`90b5079`), this round's merge commit from Step 1.2 and the head you built on. The controller's leave to edit `WalletCard.tsx`. Not pushed.
   - **Files:**
     - modified `apps/app/src/wallet/card/WalletCard.tsx` (one prop and the header's two sentences), `cardFrames.tsx` (n2), `CardStack.render.test.tsx` (12 cases before, 15 after) and `cardStackNative.test.ts` (1 case before, 2 after);
     - created `cardNativeProps.test.ts` (2 cases: P2-T11's review's ready case and M1's pin);
     - this receipt.
   - **M1:** what VoiceOver did (the review's M1) and the fix (F1: iOS answers YES and synthesizes no tap; Android never reads the prop; the web drops it). Its two pins (F2).
   - **The pins:** m3, m4, n3 and n4, each with where it sits and the mutant it kills (F4); n2's two-line fix and why one line was not enough (F3).
   - **RED to GREEN:**
     - RED (Step 2): Node 1 of 4 failing and render 2 of 15, each on an assertion, with the messages; the eight survivors killed by their pins (Step 2.5).
     - GREEN (Step 3): Node 4 of 4; CardStack 15 and WalletCard 9; the neighbours N; the catalogue C.
   - **Mutation check:** 73, all killed, with the line counts by group (the first round's 59 and this round's 14). The two kills that are not assertions (CS20b, CF8).
   - **Gate:** every command of Step 5 with its result, and no whole-suite totals.
   - **Carried elsewhere:** m1 to P2-T24 with E2-A's peek decision; m2 to P2-T17 (the note above); n1 to P2-T24 (F7).
   - **SKIPPED and CI:** as Step 5 says, and F9's device check.
   - **Notes for later tasks:**
     - P2-T21 and P2-T22: `cardNativeProps.test.ts` now pins `accessible` on a card with no `onPress` (P2-T11's review's n3); the card's web role is still theirs to decide.
     - P2-T24: Home's web tests cannot see M1; rely on `cardNativeProps.test.ts` and the device check.

## Step 7: Commit

1. `/usr/bin/git -C WT add apps/app/src/wallet/card/WalletCard.tsx apps/app/src/wallet/card/cardFrames.tsx apps/app/src/wallet/card/CardStack.render.test.tsx apps/app/src/wallet/card/cardStackNative.test.ts apps/app/src/wallet/card/cardNativeProps.test.ts docs/implementation/receipts/P2-T12.md`
2. `/usr/bin/git -C WT status --short`: those six files staged (`A` for `cardNativeProps.test.ts`, `M` for the other five), nothing else.
3. Write the message to `S/commit-message.txt`:
   ```
   Let VoiceOver open each card of the stack, and pin what the review found loose

   A VoiceOver double tap on a card behind the front one tapped the middle
   of its box, which lies under the next card, so the wrong wallet opened.
   The card's button now runs its own press for VoiceOver
   (onAccessibilityTap), pinned from the source since react-native-web
   drops it. A card view that comes back to the frames answers only what
   is measured after it is back. Pin the review's other gaps: pending
   totals behind the front card, a lone card's today line, one open per
   press, the list's keys, the stack out of the accessibility tree, frames
   measured after each layout but not on a re-render, and frameOf's exact
   null.

   Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
   ```
4. `/usr/bin/git -C WT commit -F S/commit-message.txt`, then `/usr/bin/git -C WT log --oneline -2` and `/usr/bin/git -C WT show --stat HEAD`: 6 files. `/usr/bin/git -C WT status --short` prints nothing. Do not push.

## Your final message

As the protocol says:
- `STATUS: DONE` (or `STATUS: BLOCKED` with the exact blocker) on the first line;
- the merge and fix commit SHAs, and the files changed;
- RED: Node 1 of 4 and render 2 of 15 failing on assertions, and the eight survivors killed by their pins;
- GREEN: the counts;
- mutants: 73, all killed;
- each gate command with its result, and no whole-suite totals;
- SKIPPED and CI items.

Name what the reviewer should look at first:
- `WalletCard.tsx`'s one prop and its pins (F1, F2);
- `cardFrames.tsx`'s two-line n2 fix (F3);
- the `react-native` mock in `CardStack.render.test.tsx`, which wraps `Pressable` only.

---

## Appendix: the diffs

Each block is the kit's diff, byte for byte. Copy from `PL/real/`, not from here.

`apps/app/src/wallet/card/WalletCard.tsx`:

```diff
diff --git a/apps/app/src/wallet/card/WalletCard.tsx b/apps/app/src/wallet/card/WalletCard.tsx
index eed96c3..60abc17 100644
--- a/apps/app/src/wallet/card/WalletCard.tsx
+++ b/apps/app/src/wallet/card/WalletCard.tsx
@@ -7,9 +7,12 @@
 // are saving, and today's money out when the caller passes it (the stack's
 // front card, P2-T12). A credit card at zero or below shows what was spent,
 // after ใช้ไป (W25). With onPress the card is one button that says its words
-// (ax-voiceover); private mode masks every amount and the card says only
-// that it is hidden (W10). Nothing is clamped to a line, so the longest name
-// and the largest amount wrap at every text size (Review Focus 3).
+// (ax-voiceover), and VoiceOver's double tap runs onPress itself
+// (onAccessibilityTap), because iOS would otherwise tap the card's middle, which
+// in the stack lies under the card in front (P2-T12's review, M1); private mode
+// masks every amount and the card says only that it is hidden (W10). Nothing
+// is clamped to a line, so the longest name and the largest amount wrap at
+// every text size (Review Focus 3).
 import type { Minor } from '@gogospend/contracts';
 import type { ReactNode } from 'react';
 import { Pressable, View } from 'react-native';
@@ -159,6 +162,6 @@ export function WalletCard({ wallet, look, variant, onPress }: {
   return onPress === undefined ? (
     <View accessible accessibilityLabel={words.spoken} style={style}>{content}</View>
   ) : (
-    <Pressable accessibilityRole="button" accessibilityLabel={words.spoken} onPress={onPress} style={style}>{content}</Pressable>
+    <Pressable accessibilityRole="button" accessibilityLabel={words.spoken} onPress={onPress} onAccessibilityTap={onPress} style={style}>{content}</Pressable>
   );
 }
```

`apps/app/src/wallet/card/cardFrames.tsx`:

```diff
diff --git a/apps/app/src/wallet/card/cardFrames.tsx b/apps/app/src/wallet/card/cardFrames.tsx
index c37fee8..c1f262c 100644
--- a/apps/app/src/wallet/card/cardFrames.tsx
+++ b/apps/app/src/wallet/card/cardFrames.tsx
@@ -11,10 +11,13 @@
 // the page has laid out).
 //
 // One view per wallet id: the last one registered. A view that leaves forgets
-// its wallet's frame, never another view's, and a measurement that lands after
-// its view has left is never given out. Outside a provider nothing is kept:
-// every frame is null and measure() does nothing, so a card anywhere (the
-// catalogue, a test) needs no provider. WalletShell mounts it (P2-T18).
+// its wallet's frame, never another view's, and its own frame too, and a
+// measurement that lands while its view is not registered is dropped, so a
+// view that comes back (React shows a hidden subtree again with the same
+// views) answers only what is measured after it is back. Outside a provider
+// nothing is kept: every frame is null and measure() does nothing, so a card
+// anywhere (the catalogue, a test) needs no provider. WalletShell mounts it
+// (P2-T18).
 import { createContext, useCallback, useContext, useRef, useState } from 'react';
 import type { ReactNode } from 'react';
 import type { HostInstance } from 'react-native';
@@ -37,25 +40,27 @@ function createRegistry(): Registry {
   const views = new Map<string, HostInstance>();
   // Keyed by the view, so a frame measured for a view that has left never answers for its wallet.
   const frames = new WeakMap<HostInstance, CardFrame>();
-  const measureView = (view: HostInstance) => {
+  const measureView = (walletId: string, view: HostInstance) => {
     view.measureInWindow((x, y, width, height) => {
-      frames.set(view, { x, y, width, height });
+      // An answer that lands while its view is away is dropped.
+      if (views.get(walletId) === view) frames.set(view, { x, y, width, height });
     });
   };
   return {
     register(walletId, view) {
       views.set(walletId, view);
-      measureView(view);
+      measureView(walletId, view);
     },
     forget(walletId, view) {
       if (views.get(walletId) === view) views.delete(walletId);
+      frames.delete(view);
     },
     frameOf(walletId) {
       const view = views.get(walletId);
       return view === undefined ? null : (frames.get(view) ?? null);
     },
     measure() {
-      for (const view of views.values()) measureView(view);
+      for (const [walletId, view] of views) measureView(walletId, view);
     },
   };
 }
```

`apps/app/src/wallet/card/cardNativeProps.test.ts` (new):

```diff
diff --git a/apps/app/src/wallet/card/cardNativeProps.test.ts b/apps/app/src/wallet/card/cardNativeProps.test.ts
new file mode 100644
index 0000000..5a9dce2
--- /dev/null
+++ b/apps/app/src/wallet/card/cardNativeProps.test.ts
@@ -0,0 +1,22 @@
+// What react-native-web drops from the wallet card, read from the source (R72's
+// trap, as src/ui/dynamicType.test.ts does). The first case is P2-T11's review's
+// ready case (n3): a card with no onPress is one accessibility element on a
+// phone. The second is P2-T12's review's M1: VoiceOver's double tap runs the
+// card's own press. Without onAccessibilityTap, React Native's iOS view answers
+// NO to accessibilityActivate, and VoiceOver taps the middle of the card, which
+// in the stack lies under the card in front, so that card would open instead.
+import assert from 'node:assert/strict';
+import { readFileSync } from 'node:fs';
+import { dirname, join } from 'node:path';
+import { test } from 'node:test';
+import { fileURLToPath } from 'node:url';
+
+const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'WalletCard.tsx'), 'utf8');
+
+test('a card with no onPress is one accessibility element on a phone, labelled with its words', () => {
+  assert.match(source, /<View accessible accessibilityLabel=\{words\.spoken\}/);
+});
+
+test("VoiceOver's double tap runs the card's own press, never a tap at the card's middle", () => {
+  assert.match(source, /<Pressable accessibilityRole="button" accessibilityLabel=\{words\.spoken\} onPress=\{onPress\} onAccessibilityTap=\{onPress\}/);
+});
```

The same file against P2-T11's review's ready case (`PL/ready/`):

```diff
diff --git a/apps/app/src/wallet/card/cardNativeProps.test.ts b/apps/app/src/wallet/card/cardNativeProps.test.ts
index 6cbc673..5a9dce2 100644
--- a/apps/app/src/wallet/card/cardNativeProps.test.ts
+++ b/apps/app/src/wallet/card/cardNativeProps.test.ts
@@ -1,5 +1,10 @@
-// Review ready case (P2-T11, data lens; R72's trap): react-native-web drops `accessible`,
-// so a card with no onPress being one accessibility element on a phone is read from the source.
+// What react-native-web drops from the wallet card, read from the source (R72's
+// trap, as src/ui/dynamicType.test.ts does). The first case is P2-T11's review's
+// ready case (n3): a card with no onPress is one accessibility element on a
+// phone. The second is P2-T12's review's M1: VoiceOver's double tap runs the
+// card's own press. Without onAccessibilityTap, React Native's iOS view answers
+// NO to accessibilityActivate, and VoiceOver taps the middle of the card, which
+// in the stack lies under the card in front, so that card would open instead.
 import assert from 'node:assert/strict';
 import { readFileSync } from 'node:fs';
 import { dirname, join } from 'node:path';
@@ -11,3 +16,7 @@ const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'Walle
 test('a card with no onPress is one accessibility element on a phone, labelled with its words', () => {
   assert.match(source, /<View accessible accessibilityLabel=\{words\.spoken\}/);
 });
+
+test("VoiceOver's double tap runs the card's own press, never a tap at the card's middle", () => {
+  assert.match(source, /<Pressable accessibilityRole="button" accessibilityLabel=\{words\.spoken\} onPress=\{onPress\} onAccessibilityTap=\{onPress\}/);
+});
```

`apps/app/src/wallet/card/cardStackNative.test.ts`:

```diff
diff --git a/apps/app/src/wallet/card/cardStackNative.test.ts b/apps/app/src/wallet/card/cardStackNative.test.ts
index edeab06..66a039d 100644
--- a/apps/app/src/wallet/card/cardStackNative.test.ts
+++ b/apps/app/src/wallet/card/cardStackNative.test.ts
@@ -1,7 +1,9 @@
 // What react-native-web drops from the card stack, read from the source (R72's
 // trap, as src/ui/dynamicType.test.ts does): on a phone the view each card
 // registers for its frame must stay a real native view, or React Native may
-// flatten it away as a layout-only view, and there would be nothing to measure.
+// flatten it away as a layout-only view, and there would be nothing to measure;
+// and no view of the stack may be `accessible`, or VoiceOver would meet the
+// whole stack as one element instead of each card's button (P2-T12's review, n3).
 import assert from 'node:assert/strict';
 import { readFileSync } from 'node:fs';
 import { test } from 'node:test';
@@ -11,3 +13,8 @@ const source = readFileSync(new URL('./CardStack.tsx', import.meta.url), 'utf8')
 test('the view each card registers is kept as a native view, so it can be measured', () => {
   assert.match(source, /<View ref=\{register\} collapsable=\{false\}>/);
 });
+
+test("no view of the stack groups its cards into one accessibility element, so VoiceOver meets each card's button", () => {
+  const code = source.replace(/\/\/.*$/gm, '');
+  assert.doesNotMatch(code, /\baccessible\b/);
+});
```

`apps/app/src/wallet/card/CardStack.render.test.tsx`:

```diff
diff --git a/apps/app/src/wallet/card/CardStack.render.test.tsx b/apps/app/src/wallet/card/CardStack.render.test.tsx
index 0277fa3..01cd963 100644
--- a/apps/app/src/wallet/card/CardStack.render.test.tsx
+++ b/apps/app/src/wallet/card/CardStack.render.test.tsx
@@ -13,10 +13,15 @@
 // a layout would. Reanimated's springs run on the timers: a case that watches
 // the lift uses vi.useFakeTimers() and reads each card's transform frame by
 // frame. withSpring is watched (vi.fn around the real one), so a case sees the
-// spring the lift asked for; vi.clearAllMocks() after each case.
-import { act, cleanup, screen, within } from '@testing-library/react';
+// spring the lift asked for; vi.clearAllMocks() after each case. Each
+// Pressable's props are recorded too: react-native-web drops onAccessibilityTap,
+// which iOS calls for VoiceOver's double tap, so the VoiceOver case calls it as
+// iOS would. The registry's own case drives a card's ref by hand, with views
+// whose measurements land when the case says.
+import { act, cleanup, render, screen, within } from '@testing-library/react';
 import type { ReactNode } from 'react';
 import { View } from 'react-native';
+import type { HostInstance } from 'react-native';
 import { ReduceMotion, withSpring } from 'react-native-reanimated';
 import { afterEach, expect, test, vi } from 'vitest';
 
@@ -43,6 +48,18 @@ vi.mock('react-native-reanimated', async (importOriginal) => {
   return { ...actual, withSpring: vi.fn(actual.withSpring) };
 });
 
+// Each Pressable's props, recorded, so the VoiceOver case can call what iOS calls (see the note at the top).
+const pressables = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));
+vi.mock('react-native', async (importOriginal) => {
+  const actual = await importOriginal<typeof import('react-native')>();
+  const { createElement, forwardRef } = await import('react');
+  const Pressable = forwardRef<unknown, Record<string, unknown>>(function RecordedPressable(props, ref) {
+    pressables.props.push(props);
+    return createElement(actual.Pressable as never, { ...props, ref });
+  });
+  return { ...actual, Pressable };
+});
+
 import { WALLET_SECTIONS } from '@mobile/dev/catalogue/wallet';
 import { setCurrentHapticPreference } from '@mobile/lib/hapticPreference';
 import { haptics } from '@mobile/lib/haptics';
@@ -58,6 +75,7 @@ afterEach(() => {
   vi.restoreAllMocks();
   vi.clearAllMocks();
   seen.props.length = 0;
+  pressables.props.length = 0;
   setCurrentHapticPreference('on');
 });
 
@@ -122,7 +140,7 @@ type Place = { left: number; top: number; width: number; height: number };
 
 /** Gives elements a place in the window, as the page's layout would; anything else is at 0, 0 with no size, as happy-dom says. */
 function placeViews(places: Map<Element, Place>) {
-  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function placed(this: HTMLElement) {
+  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function placed(this: HTMLElement) {
     const { left, top, width, height } = places.get(this) ?? { left: 0, top: 0, width: 0, height: 0 };
     return { left, top, width, height, x: left, y: top, right: left + width, bottom: top + height, toJSON: () => ({}) } as DOMRect;
   });
@@ -171,6 +189,8 @@ test('the stack is 54 pt per card plus one whole card', async () => {
   mountWallet(<CardStack wallets={HOME.slice(3)} onOpen={press} />);
   await settle();
   expect([cardFrame('w-main').style.position, cardFrame('w-main').style.marginTop, cardFrame('w-main').style.boxShadow]).toEqual(['', '0px', '']);
+  // The lone card is the front card, so it shows today's money out (P5).
+  expect(drawn(screen.getByRole('button'))).toEqual(['บัญชีหลัก', '฿24,860', `วันนี้ ${MINUS}฿47`]);
   cleanup();
   mountWallet(<CardStack wallets={[]} onOpen={press} />);
   await settle();
@@ -254,6 +274,8 @@ test('under reduced motion the card opens with no lift', async () => {
   act(() => { buttons()[3].click(); });
   expect(springs()).toEqual([[-CARD_LIFT, GENTLE], [0, GENTLE]]);
   expect(Math.min(...trace(['w-main'], 3000)['w-main'])).toBeLessThan(-11.5);
+  // One open per press: the lift settling opens nothing more.
+  expect(onOpen.mock.calls).toEqual([['w-main'], ['w-main']]);
 });
 
 test('at full motion a pressed card lifts 12 pt on the gentle spring and settles back in its place; the others stay', async () => {
@@ -336,6 +358,11 @@ test("screen readers meet the cards in the drawn order, each a button with its c
       cleanup();
     }
   }
+  // A card behind the front one says and draws its own pending total (P5).
+  const saving = HOME.map((wallet) => (wallet.id === 'w-cash' ? { ...wallet, pendingMinor: '5000' } : wallet));
+  mountWallet(<CardStack wallets={saving} onOpen={press} />);
+  await settle();
+  expect([labels()[2], drawn(buttons()[2])]).toEqual(['เงินสด, เหลือ 1,240 บาท, รวม 50 บาทที่กำลังบันทึก', ['เงินสด', '฿1,240', 'รวม ฿50 ที่กำลังบันทึก']]);
 });
 
 test('a wallet added later joins the front of the stack at once: the stack plays no drop', async () => {
@@ -367,10 +394,11 @@ test("a bank account below zero keeps its minus in the stack and in the list, in
 
 test("each card's place in the window is known after layout, measured again when the stack lays out, and forgotten when the card leaves", async () => {
   const places = new Map<Element, Place>();
-  placeViews(places);
+  const rects = placeViews(places);
   let frames: CardFrames | null = null;
   const take = (given: CardFrames) => { frames = given; };
-  const frameOf = (id: string): CardFrame | null => (frames as CardFrames | null)?.frameOf(id) ?? null;
+  // Read as is, so a frame that is undefined is no null.
+  const frameOf = (id: string): CardFrame | null => (frames as unknown as CardFrames).frameOf(id);
   const tree = (wallets: readonly StackWallet[]) => (
     <CardFramesProvider>
       <FramesProbe onFrames={take} />
@@ -388,12 +416,23 @@ test("each card's place in the window is known after layout, measured again when
   await settle();
   expect(HOME.map(({ id }) => frameOf(id))).toEqual(expected(0));
   expect(frameOf('w-unknown')).toBeNull();
+  // A render that changes nothing measures nothing again: each card keeps its ref.
+  const measured = () => rects.mock.contexts.filter((element) => HOME.some(({ id }) => element === viewOf(id))).length;
+  const first = measured();
+  view.rerender(tree(HOME));
+  await settle();
+  expect([first, measured()]).toEqual([4, 4]);
 
   // The stack moves 40 pt down the page (say the budget card above it grew): its layout measures every card again.
   placeAt(40);
   layOut(stack());
   await settle();
   expect(HOME.map(({ id }) => frameOf(id))).toEqual(expected(40));
+  // ...and again at each later layout (on a phone each move of the stack lays it out again).
+  placeAt(80);
+  layOut(stack());
+  await settle();
+  expect(HOME.map(({ id }) => frameOf(id))).toEqual(expected(80));
 
   // measure() measures them again when asked (for P2-T17, before a flight).
   placeAt(-100);
@@ -432,7 +471,8 @@ test('one view per wallet id: the last registered answers, and a view that leave
   placeViews(places);
   let frames: CardFrames | null = null;
   const take = (given: CardFrames) => { frames = given; };
-  const frameOf = (id: string): CardFrame | null => (frames as CardFrames | null)?.frameOf(id) ?? null;
+  // Read as is, so a frame that is undefined is no null.
+  const frameOf = (id: string): CardFrame | null => (frames as unknown as CardFrames).frameOf(id);
   const tree = (children: ReactNode) => (
     <CardFramesProvider>
       <FramesProbe onFrames={take} />
@@ -502,3 +542,81 @@ test("the catalogue's stack sections come after the kit's and draw bw-home's sta
   ]);
   expect(buttons().map(faces)).toEqual([0, 0, 0, 0]);
 });
+
+test("a VoiceOver double tap on a card behind the front one runs that card's own press, once (M1)", async () => {
+  const onOpen = vi.fn();
+  const tick = vi.spyOn(haptics, 'selection');
+  mountWallet(<CardStack wallets={HOME} onOpen={onOpen} />);
+  await settle();
+  // What each card last handed its Pressable for VoiceOver's double tap. iOS calls it and taps nothing
+  // (accessibilityActivate answers YES); without it, iOS taps the card's middle, which on a card behind
+  // the front one lies under the next card, and that card would open.
+  const voiceOverTap = (label: string) => pressables.props.filter((props) => props.accessibilityLabel === label).at(-1)?.onAccessibilityTap as (() => void) | undefined;
+  expect(WORDS.th.map((label) => typeof voiceOverTap(label))).toEqual(['function', 'function', 'function', 'function']);
+  vi.useFakeTimers();
+  act(() => { voiceOverTap(WORDS.th[1])?.(); });
+  // The same press as a touch: the tick, the 12 pt lift on the gentle spring, and that card's own wallet, at once...
+  expect([onOpen.mock.calls, tick.mock.calls.length, springs()]).toEqual([[['w-transit']], 1, [[-12, GENTLE], [0, GENTLE]]]);
+  expect(Math.min(...trace(['w-transit'], 3000)['w-transit'])).toBeLessThan(-11.5);
+  // ...and only once.
+  expect([onOpen.mock.calls, tick.mock.calls.length]).toEqual([[['w-transit']], 1]);
+});
+
+test('a new order keeps each card its own frame, in the stack and in the list: the cards are keyed by wallet', async () => {
+  // Every card moves: the first card becomes the front card.
+  const turned = [...HOME.slice(1), HOME[0]];
+  for (const fontScale of [1, AX5]) {
+    const view = mountWallet(<CardStack wallets={HOME} onOpen={press} />, { fontScale });
+    await settle();
+    const before = new Map(HOME.map(({ id }) => [id, cardFrame(id)]));
+    view.rerender(<CardStack wallets={turned} onOpen={press} />);
+    const ids = turned.map(({ id }) => id);
+    expect(order(), `${fontScale}`).toEqual(fontScale === 1 ? ids : [...ids].reverse());
+    // Each card keeps its own frame (and with it its lift and its registered view) in its new place.
+    expect(HOME.map(({ id }) => cardFrame(id) === before.get(id)), `${fontScale}`).toEqual([true, true, true, true]);
+    cleanup();
+  }
+});
+
+/** A card's view whose measurements land only when the case says. */
+function heldView() {
+  type Answer = (x: number, y: number, width: number, height: number) => void;
+  const answers: Answer[] = [];
+  const view = { measureInWindow: (answer: Answer) => { answers.push(answer); } } as unknown as HostInstance;
+  return { view, asked: () => answers.length, land: (index: number, x: number, y: number) => { answers[index](x, y, 100, 200); } };
+}
+
+/** Hands the case the ref a card's view takes, to call as React does. */
+function RefProbe({ walletId, onRef }: { walletId: string; onRef: (ref: (view: HostInstance | null) => void) => void }) {
+  onRef(useRegisterCardFrame(walletId));
+  return null;
+}
+
+test('a view that comes back answers only what is measured after it is back, and frameOf is exactly null until then', () => {
+  let frames: CardFrames | null = null;
+  let ref: ((view: HostInstance | null) => void) | null = null;
+  render(
+    <CardFramesProvider>
+      <FramesProbe onFrames={(given) => { frames = given; }} />
+      <RefProbe walletId="w" onRef={(given) => { ref = given; }} />
+    </CardFramesProvider>,
+  );
+  const registry = frames as unknown as CardFrames;
+  const attach = ref as unknown as (view: HostInstance | null) => void;
+  const card = heldView();
+  const at = (x: number, y: number) => ({ x, y, width: 100, height: 200 });
+  attach(card.view);
+  expect(registry.frameOf('w')).toBeNull();
+  card.land(0, 1, 1);
+  expect(registry.frameOf('w')).toEqual(at(1, 1));
+  // The view leaves (React hides its subtree) while a measurement is on the way, which lands while it is away.
+  registry.measure();
+  attach(null);
+  card.land(1, 2, 2);
+  expect(registry.frameOf('w')).toBeNull();
+  // The same view comes back: nothing from before it left or from while it was away, only what is measured now.
+  attach(card.view);
+  expect([card.asked(), registry.frameOf('w')]).toEqual([3, null]);
+  card.land(2, 3, 3);
+  expect(registry.frameOf('w')).toEqual(at(3, 3));
+});
```
