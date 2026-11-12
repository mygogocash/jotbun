# Brief P2-T15 fix round: none of Bun's sentence in private mode, Next by the cards' rule, the reviews' pins, and lazy step sections

You are the fixer for the P2-T15 fix round. PR #427 (branch `p2/t15-transfer-confirm-pick`, head `fd41909c`) adds the add tray's transfer, confirm and pick steps. CI is green, but both reviews say **Needs fixes**:
- `reviews/P2-T15.md` (Opus): one major (M1), three minors (m1 to m3) and four nits (n1 to n4);
- `reviews/P2-T15-second.md` (Sonnet, money and privacy): one major (M1, the same as the first's), two minors (m1, the same as the first's; m2, five mutation survivors) and two nits (n1, n2).

The controller ruled **R114** on both (quoted in the rulings below). The planner wrote every file below and proved it in a scratch copy of `fd41909c`:
- RED on the round's tests with one typed stub: 4 of 17 render cases fail and 1 of 15 Node cases, each on an assertion;
- GREEN;
- 120 mutants, all killed;
- R100's fast local gate, with the eight kit render files, `test:unit` and the four routes tests.

You copy the planner's files, check them by checksum, prove RED, GREEN and the mutants in the worktree, run the gate, write the round's receipt and commit. Do exactly what this brief says.

Read first:
1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. R100 applies: the fast local gate only, and no whole-suite total as an expected value anywhere. R87 applies: the round's receipt is its own new file, `docs/implementation/receipts/P2-T15-fix.md`; `P2-T15.md` takes the planner's correction (Step 3); do not edit `premium-progress.md`.
2. The reviews: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/P2-T15.md` and `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/P2-T15-second.md`.
3. The first round's brief, `/Users/kunanonjarat/Developer/jotbun/.claude/controller/briefs/P2-T15.md`. Its rulings P1 to P19 stand, except where this brief's P20 to P33 change them.

## Paths and rules

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t15` (branch `p2/t15-transfer-confirm-pick`, head `fd41909c`). Work only here. Do not merge the integration branch into it: the controller merges up (P20).
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t15-fix`, your scratch folder. Create it with `mkdir -p`. Logs and the commit message go there. Never keep anything under `/private/tmp`.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t15-fix-planner`, the planner's folder. Read it and `cp` from it; never write into it. It holds:
  - `real/`: the round's nine files at their repo paths: seven changed and two new (your receipt, `P2-T15-fix.md`, is yours to write);
  - `stubs/`: the RED form of `apps/app/src/wallet/add/TransferStep.tsx` (`fd41909c`'s, with `TransferFooter` taking the round's `wallets` prop, optional and unread, P27);
  - `orig/`: `fd41909c`'s seven files that the round changes;
  - `diffs/`: one diff per changed file, `orig/` to `real/`, with paths `a/<repo path>` and `b/<repo path>` and full blob ids (the Appendix prints them);
  - `tools/`: `stage.sh` (the planner's stages: base, RED, GREEN), `focused.sh` (the focused set), `gate.sh` (the planner's GREEN runs and gate in one), `mutants.py` (the runner), `name_diffs.py`, `sums.sh`, `fill_brief.py` and `brief.template.md` (how this brief was built: every code block below is the `real/` or `stubs/` file or a `diffs/` file, byte for byte, and the mutant lines are `logs/mutants.out`);
  - `SHA256SUMS` (the kit; check from PL) and `SHA256SUMS.logs` (the planner's `logs/`: `base-*`, `red-*`, `green-*`, `gate-*`, `mutants.out`, `mutant-logs/`, `applycheck.log`, `dev-*`);
  - three lists to check WT with `shasum -a 256 -c`, paths relative to WT:
    - `SHA256SUMS.orig-in-wt`: the seven files as `fd41909c` has them;
    - `SHA256SUMS.red-in-wt`: the four files RED writes (the two tests and the copy from `real/`, the stub);
    - `SHA256SUMS.real-in-wt`: the round's nine files in their final form.
- Every shell call starts in a fresh directory, so type full paths. Below, WT, S and PL stand for the full paths above. Git: `/usr/bin/git -C WT <command>`, one git command per call. Focused Node files: `cd WT/apps/app && npm run test:unit -- <files>`. Focused render files: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts <files>`.
- No heavy lock is needed: no database suite and no workers pool. Docker is stopped and stays stopped.
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests or code to make them pass. One exception, a load flake: a case that times out under load in a file this round does not touch. Rerun that file alone once, and record both runs.
- Every log is your own run. Never copy the planner's logs in place of one.

## Scope

| File | Change |
| --- | --- |
| `apps/app/src/wallet/add/ConfirmStep.tsx` | In private mode the Bun line quotes nothing: `add.bunReadHidden` in place of the sentence; the mask (`NUMBER`) is removed (P21). {{LINES:orig:apps/app/src/wallet/add/ConfirmStep.tsx}} lines before, {{LINES:apps/app/src/wallet/add/ConfirmStep.tsx}} after. |
| `apps/app/src/wallet/add/TransferStep.tsx` | One rule, `inUse`, for the cards and Next; `TransferFooter` takes `wallets` (P22, P23). {{LINES:orig:apps/app/src/wallet/add/TransferStep.tsx}} before, {{LINES:apps/app/src/wallet/add/TransferStep.tsx}} after. |
| `apps/app/src/wallet/add/PickSteps.tsx` | `DatePick` opens a draft dated after today on today; the radio's dot gets the test id `pick-wallet-dot` (P25). {{LINES:orig:apps/app/src/wallet/add/PickSteps.tsx}} before, {{LINES:apps/app/src/wallet/add/PickSteps.tsx}} after. |
| `apps/app/src/wallet/add/copy.ts` | One draft line, `add.bunReadHidden` (P21). {{LINES:orig:apps/app/src/wallet/add/copy.ts}} before, {{LINES:apps/app/src/wallet/add/copy.ts}} after. |
| `apps/app/src/wallet/add/AddSteps.render.test.tsx` | 17 cases (14 before): three new, eight changed (P26). {{LINES:orig:apps/app/src/wallet/add/AddSteps.render.test.tsx}} before, {{LINES:apps/app/src/wallet/add/AddSteps.render.test.tsx}} after. |
| `apps/app/src/wallet/add/addStepsNative.test.ts` | **New**, Node ({{LINES:apps/app/src/wallet/add/addStepsNative.test.ts}} lines). 3 source pins: the problem's announcement, the seam's `zIndex`, the lazy sections (P24, P25). |
| `apps/app/src/dev/catalogue/wallet/addSections.tsx` | The four step sections load `addStepsSection.tsx` lazily, with the catalogue's running mark; P2-T14's two are unchanged (P25). {{LINES:orig:apps/app/src/dev/catalogue/wallet/addSections.tsx}} before, {{LINES:apps/app/src/dev/catalogue/wallet/addSections.tsx}} after. |
| `apps/app/src/dev/catalogue/wallet/addStepsSection.tsx` | **New**, development only ({{LINES:apps/app/src/dev/catalogue/wallet/addStepsSection.tsx}} lines): the step sections' host (`StepsTray`, default export) and its samples, moved from `addSections.tsx`; `TransferFooter` gets the wallets (P25). |
| `docs/implementation/receipts/P2-T15.md` | The planner's correction: a pointer to the fix round, and the three lines R114 makes untrue (P29). {{LINES:orig:docs/implementation/receipts/P2-T15.md}} lines before, {{LINES:docs/implementation/receipts/P2-T15.md}} after. |
| `docs/implementation/receipts/P2-T15-fix.md` | **New**: your receipt (Step 6). |

Not in this round: `addFlow.ts`, `AmountStep.tsx` and the rest of P2-T14's files (read only; the test's probe draws `AmountStep`); `WalletsList.render.test.tsx` (its sections case still reads `bw-tray-pick-category` right before `bw-wallets`); `src/dev/catalogue/wallet/index.ts` and `registry.tsx`; `draftText.test.ts` (the new line holds Thai letters); `en.json`, `th.json`; any route, the app entry, native code, package or lockfile; `premium-progress.md`.

## Planner rulings (what this round decides, with the reason for each)

**R114, the controller's ruling of 12 November**, quoted:
1. M1, both reviews: in private mode, do not draw Bun's sentence at all. Keep the violet line with words that do not quote it (one draft copy line, Thai first). Masking can never keep up with every number form the parser reads: Thai number words, scale words like พัน and k, and whatever it learns later. Add the reviews' number-word rows to the private-mode case, as proof the sentence is gone, not masked. Note for P2-T37 in the receipt: a "no digit" sweep cannot catch number words.
2. m1, both reviews: Next waits while either side's wallet is archived or unknown, exactly as the cards ask. Give `TransferFooter` the wallets, or the `listed` result. Assert Next in the archived case.
3. Pin every survivor and named gap: Opus m2 (`isPickStep`, and the way back from the amount chip's wallet pick); Opus m3 (the three accessibility behaviours); Sonnet m2 (negative balances and after lines keep their minus, M6 and M7; `WalletPick` offline with `balances === null`, M8; the problem's `useAnnouncement`, M14; the confirm wallet row's material, M18). One mutant per new guard.
4. Nits: fix Opus n1 (the trims), n2 (a source pin for the seam's `zIndex`) and n3 (the radio dot); n4: load the steps lazily from the sections (today's rule; `recordSections.tsx` shows how); Sonnet n1 (`DatePick` clamps a draft after today); Sonnet n2: say in a ruling whether `TransferFooter` should look at the amount, and why.

- **P20. The base is `fd41909c`, with no merge.** The dispatch puts the fix commit on top of `fd41909c`. Since this PR's base (`9a7b767e`) the integration branch has merged #420 (P3-T2: contracts, the vault, `diaryRepository.ts`, `resources.ts`, `events.ts`, `app.json`) and controller state, none of it this round's files, and no open branch touches them (the planner read `origin/p2/t21-wallet-edit`, `origin/p2/t29-categories`, `origin/p2/t31-insights` and `origin/p3/t6-haiku-first`). So the commit stays mergeable, and the controller merges up.
- **P21. Private mode draws none of Bun's sentence (R114.1; M1 of both reviews).**
  - `ConfirmStep`: with private mode on, the violet line (`confirm-bun`) reads `add.bunReadHidden`: บันอ่านจากที่คุณบอก, "Bun read this from what you told it" (Thai first; a draft for E2-B, owner Q3's default). Off, it quotes the sentence as before (`add.bunReadFrom`). The first round's mask (`NUMBER`, P8c) is removed with its five mutants (C7 to C11).
  - Why no mask: Tell Bun reads amounts from digits, Thai digits, Thai number words with no spaces (ห้าสิบ, สองพันห้าร้อย), scale words (2 พัน, 1.5k), and the server's model reads more ("Thai number words such as ห้าสิบ mean 50", `apps/edge/src/server/ai/prompts.ts:14`; `quickText.ts` `THAI_UNITS`, `THAI_MULTIPLIERS`). No list keeps up.
  - The proof (the private-mode case): the reviews' thirteen sentences (digits; ฿, 1,250.50 and ๒๐; ห้าสิบ with and without spaces; ร้อยห้าสิบ; สองพันห้าร้อยบาท; สามหมื่น; หนึ่งแสนสองหมื่นบาท; 2 พัน; 1.5k; 50.-; full-width ５０; Arabic-Indic ٥٠), each with the amount masked as a fill: the line is exactly the hidden words, and no word of the sentence is anywhere in the tray (gone, not masked). Then the English sentence "chicken rice fifty baht", in violet, and the catalogue's `bw-tray-confirm-bun` in private mode (the first review's note), with no digit in the tray.
  - The note for P2-T37 (the receipts carry it): a sweep for digits cannot catch an amount written in words; check that Bun's sentence is absent in private mode, not that it has no digit. The first review's other P2-T37 note stands: the title (Bun's merchant) and the note row are the model's text.
- **P22. Next by the cards' rule (R114.2; m1 of both reviews).**
  - One module function in `TransferStep.tsx`, `inUse(wallets, id)`: the side's wallet while it is in use; null for none, an archived wallet or one not listed. The cards read it (as before, through what was `listed`), and so does `TransferFooter`, which now takes `wallets: readonly WalletSnapshot[]` (required): the same wallets as `TransferStep`.
  - Next is enabled only with two different wallets in use. A side whose wallet is archived or unknown keeps Next waiting and says nothing, since its card already asks (เลือกกระเป๋า), as for a side with none. One wallet in use on both sides still says today's words above Next.
  - The case asserts Next for an archived from side (and that a press does nothing) and for an unknown to side; mutant X22 (Next reads the draft's ids, as before the fix) is killed by it.
- **P23. `TransferFooter` does not look at the amount (Sonnet n2).** The amount is the amount step's: its Next waits for `evaluateKeypad(keypad).ok`, and the transfer step has no keys. A Next that also waited for the amount here would leave a person stuck on a step with no way to type one and no word why. Every way in comes after the amount step's Next (P2-T16 enters the transfer step from it, or from a type change made after it), and move all only fills a positive amount within the cap. The save still refuses a zero amount with today's words (`amountProblemOf`). A comment in `TransferFooter` says so, and P2-T16's note says never to enter this step without an amount the keypad can save.
- **P24. The pins (R114.3), each with its case and its mutant:**
  - `isPickStep`: a table (the six picks true; amount, transfer and confirm false), with the first review's three survivors as P36 (no `wallet`), P37 (no `to`) and P38 (`confirm` and `transfer` counted).
  - The amount chip's way back: the probe now draws P2-T14's real `AmountStep` at the amount step (as the first review's PROBE-5 did). Its wallet chip opens the wallet pick, a choice comes back to the amount step (the chip reads จากเงินสด), and so does the tray's back. P36 is killed here too.
  - The accessibility behaviours (the first review's m3): the transfer amount's polite live region (X26) and the day's (P42), read from the DOM; the one-wallet problem's `useAnnouncement`, read from the source (`addStepsNative.test.ts`, as `amountStepNative.test.ts` pins `AmountStep`'s; F8, also the second review's M14).
  - Minus signs (M6, M7): ฿500 from ฿300 leaves −฿200, and a card owing ฿1,240 owes ฿740 after ฿500 comes in, on screen and in words (ติดลบ); X24 and X25.
  - Offline wallet pick (M8): with no balances the pick names each wallet with no amount; P41 (the guard removed) is killed by the crash it causes, offline.
  - The confirm wallet row's material (M18): a spending draft whose wallet differs from the move's from wallet draws its own; C31.
- **P25. The nits (R114.4).**
  - n1, the trims: a merchant of spaces gives way to the note, and a note of spaces to the category (C32, C33).
  - n2, the seam's `zIndex`: a source pin (`addStepsNative.test.ts`), since happy-dom paints nothing (X23).
  - n3, the radio dot: the chosen wallet's dot carries the test id `pick-wallet-dot`; the pick case asserts it is on the chosen radio only (P40).
  - Sonnet n1: `DatePick` opens a draft dated after today on today (it already held a draft before `earliest` at the start); P39. No add path makes such a draft, so this is symmetry.
  - n4, lazy sections: `addSections.tsx` keeps P2-T14's two sections as they are and lists the four step sections, each rendering `<Suspense fallback={<View testID="catalogue-screen-running" ... />}>` around a `lazy(() => import('./addStepsSection'))` component, as `recordSections.tsx` loads its screen. `addStepsSection.tsx` holds what was `StepsTray` and its samples, moved unchanged but for its own sample lines (`sample.open`, `sample.wallet`), its own `WALLET_ID`, the `StepStart` type (exported, imported by `addSections.tsx` as a type only), the default export, and `TransferFooter`'s `wallets`. The catalogue's every-section, screen-reader and large-text suites wait while `catalogue-screen-running` shows, so the four sections still pass in both suites (60 at the base and after). A source pin holds that the list loads the steps lazily, never imports them, and shows the running mark (S8, S9).
- **P26. The test file, 17 cases.** New: the minus signs (P24); `isPickStep` and the amount chip's way back (P24); the two live regions (P24). Changed: confirm (the entry's own wallet's material, M18); the transfer (the offline wallet pick, M8); a pick returns (the radio dot, n3); the date (a draft after today); one wallet on both sides (Next for an archived and an unknown side, P22); private mode (P21); confirm for a move and income (the trims, n1); the sections (each opened with `openSection`, which waits for the lazy load). The probe passes `wallets` to `TransferFooter` and draws `AmountStep` at the amount step.
- **P27. RED.** One typed stub: `fd41909c`'s `TransferStep.tsx` with `TransferFooter` taking `wallets` as an optional, unread prop, so the test and `fd41909c`'s `addSections.tsx` both typecheck. Every other file is `fd41909c`'s, but the two tests and the copy (data). So RED is the reviewed code under the round's tests: the four cases whose behaviour this round changes fail, each on an assertion (the radio dot, a draft after today, Next for an archived side, the sentence in private mode), and so does the source pin for the lazy sections. The other thirteen render cases pass at RED, among them the new pins: they hold behaviour that is right today, and their mutants prove them (Step 4).
- **P28. 120 mutants, all killed.** The first round's 104, less C7 to C11 (retired with the mask), are rerun on the new code, and 21 new ones cover each new guard and pin: X22 to X26, F8, C29 to C33, P36 to P42, K7, S8 and S9. Four run against the Node pins (X23, F8, S8 and S9); the rest against the render file. Every kill but one is an `AssertionError`: P41 (the offline guard removed) dies of the crash it causes, `TypeError: Cannot read properties of null (reading 'get')` in the offline wallet pick, which is the failure the second review's M8 named. None survives, and none is marked equivalent.
- **P29. The receipts (R87).** `P2-T15.md` gains one line pointing to this round, and three of its lines that R114 makes untrue are corrected (the private-mode bullet, the deviation P8c and the P2-T37 note); the planner wrote that file (`real/`), and you copy it in Step 3. Your receipt, `P2-T15-fix.md`, is new (Step 6).
- **P30. The gate (R100).** `typecheck:app`; RED to GREEN on the two test files; P2-T3's draft check and P2-T14's Node files; the eight kit render files that list the wallet's sections (each named); the catalogue's wallet sections in the every-section and screen-reader suites (`-t "bw-"`) and the registry rule; the four routes tests and the catalogue's route test (each named); `test:app`; `test:unit`; `git diff --check`. No route, config, app entry or package changes, so no `typecheck:routes`, `export:web`, iOS export or `test:ops` locally; CI runs the full render suite and the exports.
- **P31. For E2-B,** add to the first round's P17: in private mode the confirm step's violet line says บันอ่านจากที่คุณบอก (a Thai draft; the English is a draft too).
- **P32. Notes for later tasks** (your receipt carries them):
  - **P2-T16 (the host):** pass `wallets` to `TransferFooter`, the same as `TransferStep`'s; never enter the transfer step without an amount the keypad can save (P23); `bunSentence` is the text the person told Bun (null for a slip), and in private mode the step draws none of it, so the host needs no masking; Tell Bun's own sheet draws the typed sentence and its draft's amount with no private-mode masking (the second review's note), so decide whether the sheet masks too; the merchant typed for income stays in the draft across a type change (the first review's note).
  - **P2-T37 (the sweep):** P21's note: absence, not digits, for Bun's sentence; the title and the note row are the model's text.
  - **P2-T27 (the edit tray):** a record keeps an archived wallet it already references (the vault's `newlyReferenced`), but the cards and Next treat it as none (P22); decide what the edit tray does.
  - **Device check (SKIPPED):** with the swap on the seam, the button's whole 44 pt takes the tap, including the 11 pt over each card (the first review's note).
- **P33. Commit summary:** `Hide Bun's sentence in private mode and gate Next by the cards` (a plain imperative line).

## Step 1: Check the start, and the base

1. `/usr/bin/git -C WT status --short` prints nothing, and `/usr/bin/git -C WT rev-parse --short HEAD` prints `fd41909c`. Otherwise report BLOCKED.
2. `cd WT && shasum -a 256 -c PL/SHA256SUMS.orig-in-wt` (type full paths). Expected: 7 `OK` lines, exit 0. And `ls WT/apps/app/src/wallet/add/addStepsNative.test.ts WT/apps/app/src/dev/catalogue/wallet/addStepsSection.tsx WT/docs/implementation/receipts/P2-T15-fix.md` says "No such file or directory" three times.
3. Only if `WT/node_modules` is missing: `cd WT && npm ci --ignore-scripts --no-audit --no-fund > S/npm-ci.log 2>&1; echo $?`. Expected: 0, "added 1416 packages".
4. `cd WT && npm run typecheck:app > S/base-typecheck.log 2>&1; echo $?`. Expected: 0.
5. `sh PL/tools/focused.sh WT S/base > S/base-focused.out 2>&1; cat S/base-focused.out`. Expected: `unit exit 0`, `neighbours exit 0`, `catalogue exit 0`, `registry exit 0`, `routes exit 0`, and:
   - `S/base-unit.log`: `ℹ tests 12`, `ℹ pass 12` (`addFlow.test.ts` 7, `amountStepNative.test.ts` 1, `draftText.test.ts` 4; `addStepsNative.test.ts` is not there yet);
   - `S/base-neighbours.log`: `Test Files  8 passed (8)`, `Tests  138 passed (138)` (`AmountStep` 15, `WalletsList` 12, `Tray` 27, `CardStack` 15, `Lock` 38, `WalletLooks` 13, `PrivateMode` 9, `walletHarness` 9);
   - `S/base-catalogue.log`: `Tests  60 passed` (thirty wallet sections, two suites; ignore the skipped count);
   - `S/base-registry.log`: `Tests  1 passed`;
   - `S/base-routes.log`: `Test Files  5 passed (5)`, `Tests  15 passed (15)` (`SpendRoutes` 3, `AccountRoutes` 2, `InsightsRoutes` 3, `PlanningRoutes` 4, `catalogueRoute` 3).

   Compare with `PL/logs/base-*.log`.

## Step 2: The tests first, and RED on the typed stub

1. Copy the two tests, the copy and the stub:
   ```bash
   cp PL/real/apps/app/src/wallet/add/AddSteps.render.test.tsx WT/apps/app/src/wallet/add/AddSteps.render.test.tsx
   cp PL/real/apps/app/src/wallet/add/addStepsNative.test.ts WT/apps/app/src/wallet/add/addStepsNative.test.ts
   cp PL/real/apps/app/src/wallet/add/copy.ts WT/apps/app/src/wallet/add/copy.ts
   cp PL/stubs/apps/app/src/wallet/add/TransferStep.tsx WT/apps/app/src/wallet/add/TransferStep.tsx
   ```
   Then `cd WT && shasum -a 256 -c PL/SHA256SUMS.red-in-wt`. Expected: four `OK` lines, exit 0.
2. `cd WT && npm run typecheck:app > S/red-typecheck.log 2>&1; echo $?`. Expected: 0.
3. `cd WT/apps/app && npm run test:unit -- src/wallet/add/addFlow.test.ts src/wallet/add/amountStepNative.test.ts src/wallet/add/addStepsNative.test.ts src/wallet/copy/draftText.test.ts > S/red-unit.log 2>&1; echo $?`. Expected:
   - exit 1, `ℹ tests 15`, `ℹ pass 14`, `ℹ fail 1`;
   - the failing test, on an `AssertionError [ERR_ASSERTION]`: `the wallet's section list loads the steps lazily, never imports them, and reads the catalogue's running mark while they load`.
4. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/add/AddSteps.render.test.tsx > S/red-render.log 2>&1; echo $?`. Expected:
   - exit 1, `Test Files  1 failed (1)`, `Tests  4 failed | 13 passed (17)`;
   - `grep -c '^AssertionError' S/red-render.log` gives 4;
   - `grep -cE 'Cannot find module|Failed to resolve|SyntaxError|is not a function|TestingLibraryElementError|TypeError|ReferenceError' S/red-render.log` gives 0, and no "Unhandled" section.

   The four failing cases, each on an assertion:
{{RED_RENDER}}

   Compare with `PL/logs/red-unit.log` and `PL/logs/red-render.log`.

## Step 3: GREEN

1. Copy the code, the new section host and the corrected first receipt:
   ```bash
   cp PL/real/apps/app/src/wallet/add/ConfirmStep.tsx WT/apps/app/src/wallet/add/ConfirmStep.tsx
   cp PL/real/apps/app/src/wallet/add/TransferStep.tsx WT/apps/app/src/wallet/add/TransferStep.tsx
   cp PL/real/apps/app/src/wallet/add/PickSteps.tsx WT/apps/app/src/wallet/add/PickSteps.tsx
   cp PL/real/apps/app/src/dev/catalogue/wallet/addSections.tsx WT/apps/app/src/dev/catalogue/wallet/addSections.tsx
   cp PL/real/apps/app/src/dev/catalogue/wallet/addStepsSection.tsx WT/apps/app/src/dev/catalogue/wallet/addStepsSection.tsx
   cp PL/real/docs/implementation/receipts/P2-T15.md WT/docs/implementation/receipts/P2-T15.md
   ```
   Then `cd WT && shasum -a 256 -c PL/SHA256SUMS.real-in-wt`. Expected: nine `OK` lines, exit 0.
   Then `/usr/bin/git -C WT status --short`. Expected, exactly: ` M apps/app/src/dev/catalogue/wallet/addSections.tsx`, ` M apps/app/src/wallet/add/AddSteps.render.test.tsx`, ` M apps/app/src/wallet/add/ConfirmStep.tsx`, ` M apps/app/src/wallet/add/PickSteps.tsx`, ` M apps/app/src/wallet/add/TransferStep.tsx`, ` M apps/app/src/wallet/add/copy.ts`, ` M docs/implementation/receipts/P2-T15.md`, `?? apps/app/src/dev/catalogue/wallet/addStepsSection.tsx` and `?? apps/app/src/wallet/add/addStepsNative.test.ts`.
2. `cd WT && npm run typecheck:app > S/green-typecheck.log 2>&1; echo $?`. Expected: 0.
3. `cd WT/apps/app && npm run test:unit -- src/wallet/add/addFlow.test.ts src/wallet/add/amountStepNative.test.ts src/wallet/add/addStepsNative.test.ts src/wallet/copy/draftText.test.ts > S/green-unit.log 2>&1; echo $?`. Expected: 0, `ℹ tests 15`, `ℹ pass 15`, `ℹ fail 0`.
4. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/add/AddSteps.render.test.tsx > S/green-render.log 2>&1; echo $?`. Expected: 0, `Test Files  1 passed (1)`, `Tests  17 passed (17)`, each case marked `✓`, and `grep -c '^stderr |' S/green-render.log` gives 0.
5. `sh PL/tools/focused.sh WT S/green > S/green-focused.out 2>&1; cat S/green-focused.out`. Expected: five exits 0, and:
   - `S/green-unit.log`: `ℹ tests 15`, `ℹ pass 15`;
   - `S/green-neighbours.log`: `Tests  138 passed (138)`, unchanged;
   - `S/green-catalogue.log`: `Tests  60 passed`, unchanged, with each of `bw-tray-transfer`, `bw-tray-confirm`, `bw-tray-confirm-bun` and `bw-tray-pick-category` marked `✓` in both suites (`grep -cE "✓.*bw-tray-(transfer|confirm|pick)" S/green-catalogue.log` gives 8);
   - `S/green-registry.log`: `Tests  1 passed`;
   - `S/green-routes.log`: `Tests  15 passed (15)`, unchanged.

   Compare with `PL/logs/green-*.log`.

## Step 4: Mutation check

1. `python3 -I PL/tools/mutants.py WT S/mutant-logs > S/mutants.out 2>&1; echo $?`. It applies each mutant alone, runs its suite (the render file, or the Node pins for X23, F8, S8 and S9), and restores the file with its SHA-256 checked. It takes twenty to forty minutes, by the machine's load. Expected: exit 0, and these 121 lines (each line in your file also gives the file and suite, the suite's counts, the AssertionError count and "restored sha256 equal"; compare with `PL/logs/mutants.out`):
   ```
{{MUTANTS}}
{{MUTANT_TOTAL}}
   ```
   X1 and P22 are the plan's two mutants. C7 to C11 are retired (P21).
2. `cd WT && shasum -a 256 -c PL/SHA256SUMS.real-in-wt` again: nine `OK` lines. `/usr/bin/git -C WT status --short`: unchanged from Step 3.1.

## Step 5: The fast local gate (R100)

From WT, in this order, each with its log in S:

1. `cd WT && npm run typecheck:app > S/gate-1-typecheck.log 2>&1; echo $?`. Expected: 0.
2. `cd WT && npm run test:app > S/gate-2-test-app.log 2>&1; echo $?`. Expected: 0, `ℹ fail 0`. (No count is expected: CI holds the whole suites, R100.)
3. `cd WT && npm run test:unit > S/gate-3-test-unit.log 2>&1; echo $?`. Expected: 0, `ℹ fail 0`.
4. The round's render file and the eight kit render files, each named: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/add/AddSteps.render.test.tsx src/wallet/add/AmountStep.render.test.tsx src/wallet/wallets/WalletsList.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/wallet/card/CardStack.render.test.tsx src/wallet/lock/Lock.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx > S/gate-4-focused.log 2>&1; echo $?`. Expected: 0, `Test Files  9 passed (9)`, `Tests  155 passed (155)`. A case that times out near 5 s in a file this round does not touch is a load flake: rerun that file alone once, record both runs, and do not change it.
5. The four routes tests and the catalogue's route test, each named: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/screens/redesign/SpendRoutes.render.test.tsx src/screens/redesign/account/AccountRoutes.render.test.tsx src/screens/redesign/insights/InsightsRoutes.render.test.tsx src/screens/redesign/planning/PlanningRoutes.render.test.tsx src/dev/catalogue/catalogueRoute.render.test.tsx > S/gate-5-routes.log 2>&1; echo $?`. Expected: 0, `Test Files  5 passed (5)`, `Tests  15 passed (15)`.
6. `/usr/bin/git -C WT diff --check` (before the commit) and, after it, `/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD`: no output.

Not run, and why (put this in the receipt): `typecheck:routes`, `export:web` and the iOS export (no route, config or app entry change; CI runs the exports); the full render suite (CI, R100; the every-section and screen-reader suites run the four sections there, now loaded lazily); `test:ops` (no package or lockfile change); the API, edge and database suites (nothing outside `apps/app` and the receipts changes; Docker is stopped); and the device checks, SKIPPED: the first round's, and P32's swap tap.

## Step 6: The round's receipt

Write `docs/implementation/receipts/P2-T15-fix.md` in the house style (see `docs/implementation/receipts/P2-T25-fix.md`), with your own numbers where they differ. Start from:

```markdown
# P2-T15-fix: none of Bun's sentence in private mode, Next by the cards' rule, the reviews' pins, and lazy step sections

- **Status:** built and verified locally on `p2/t15-transfer-confirm-pick` (`.claude/worktrees/p2-t15`), one commit on PR #427's reviewed head `fd41909c`. Not pushed. This is the fix round on PR #427 after two reviews: the first (`.claude/controller/reviews/P2-T15.md`) said Needs fixes (M1, m1 to m3, n1 to n4); the second (`P2-T15-second.md`, money and privacy) said Needs fixes (M1, m1, m2, n1, n2). The controller ruled R114, and the planner's brief is `.claude/controller/briefs/P2-T15-fix.md`. Under R87 this receipt is its own file; `P2-T15.md` is corrected and points here.
- **Base:** `fd41909c`, with no merge (the brief's P20).
- **Files:** (the nine of the brief's Scope, and this receipt.)
- **What changed:** (P21 to P26: the hidden line; Next by `inUse`; the pins; the nits; the lazy sections; the test file.)
- **RED to GREEN:** (Steps 2 and 3, your counts and messages.)
- **Mutation check:** 120 mutants, all killed ... (by group; C7 to C11 retired.)
- **Gate:** (Step 5, each command and its result; no whole-suite count, R100.)
- **Deviations:** none from the brief's rulings. (Or name each.)
- **SKIPPED:** (Step 5's list.)
- **Notes for later tasks:** (P32, each; and, for P2-T37: a sweep for digits cannot catch an amount written in words, so check that Bun's sentence is absent in private mode.)
```

## Step 7: Commit

1. `/usr/bin/git -C WT add apps/app/src/wallet/add/ConfirmStep.tsx apps/app/src/wallet/add/TransferStep.tsx apps/app/src/wallet/add/PickSteps.tsx apps/app/src/wallet/add/copy.ts apps/app/src/wallet/add/AddSteps.render.test.tsx apps/app/src/wallet/add/addStepsNative.test.ts apps/app/src/dev/catalogue/wallet/addSections.tsx apps/app/src/dev/catalogue/wallet/addStepsSection.tsx docs/implementation/receipts/P2-T15.md docs/implementation/receipts/P2-T15-fix.md`
2. `/usr/bin/git -C WT status --short`: those ten staged, nothing else (no log, no `dist/`).
3. Write the message to `S/commit-message.txt`, ending with the `Co-Authored-By:` trailer naming the model you run as (for a Claude Haiku 5.5 fixer, `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`):
   ```
   Hide Bun's sentence in private mode and gate Next by the cards

   In private mode the confirm step draws none of what the person told Bun:
   its violet line says only that Bun read it from what they said, since no
   mask keeps up with every way an amount is written. The transfer step's
   Next now waits, as its cards ask, while a side's wallet is archived or
   not listed. Pin what the reviews found unheld: isPickStep and the amount
   chip's way back, the live regions and the problem's announcement, minus
   signs, the offline wallet pick, the entry wallet's material, the title's
   trims, the radio dot and a draft dated after today. The step sections
   now load lazily.

   Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
   ```
4. `/usr/bin/git -C WT commit -F S/commit-message.txt`, then `/usr/bin/git -C WT log --oneline -1` and `/usr/bin/git -C WT show --stat HEAD`: 10 files.

## Your final message

As the protocol says: `STATUS: DONE` (or `STATUS: BLOCKED` with the exact blocker) on the first line; the commit SHA and branch (`p2/t15-transfer-confirm-pick`, on `fd41909c`); files changed (10); RED (Node 1 of 15, render 4 of 17, each on an assertion) and GREEN (Node 15, render 17); mutants (120 killed); each gate command with its result (no whole-suite count); SKIPPED items; deviations; and what the reviewer should look at first: the hidden line and its proof (P21), Next by `inUse` (P22), the ruling on the amount (P23), and the lazy sections (P25).

---

## Appendix: the code

The new files and the stub in full, and each changed file as its diff from `fd41909c`. Every block is the file in `PL/real/`, `PL/stubs/` or `PL/diffs/`, byte for byte.

`apps/app/src/dev/catalogue/wallet/addStepsSection.tsx` (new):
{{CODE:apps/app/src/dev/catalogue/wallet/addStepsSection.tsx}}

`apps/app/src/wallet/add/addStepsNative.test.ts` (new):
{{CODE:apps/app/src/wallet/add/addStepsNative.test.ts}}

`apps/app/src/wallet/add/TransferStep.tsx` (the RED stub):
{{CODE:stubs:apps/app/src/wallet/add/TransferStep.tsx}}

`PL/diffs/apps_app_src_wallet_add_ConfirmStep.tsx.diff`:
{{DIFF:apps_app_src_wallet_add_ConfirmStep.tsx.diff}}

`PL/diffs/apps_app_src_wallet_add_TransferStep.tsx.diff`:
{{DIFF:apps_app_src_wallet_add_TransferStep.tsx.diff}}

`PL/diffs/apps_app_src_wallet_add_PickSteps.tsx.diff`:
{{DIFF:apps_app_src_wallet_add_PickSteps.tsx.diff}}

`PL/diffs/apps_app_src_wallet_add_copy.ts.diff`:
{{DIFF:apps_app_src_wallet_add_copy.ts.diff}}

`PL/diffs/apps_app_src_dev_catalogue_wallet_addSections.tsx.diff`:
{{DIFF:apps_app_src_dev_catalogue_wallet_addSections.tsx.diff}}

`PL/diffs/docs_implementation_receipts_P2-T15.md.diff`:
{{DIFF:docs_implementation_receipts_P2-T15.md.diff}}

`PL/diffs/apps_app_src_wallet_add_AddSteps.render.test.tsx.diff`:
{{DIFF:apps_app_src_wallet_add_AddSteps.render.test.tsx.diff}}
