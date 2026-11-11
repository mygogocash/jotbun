# P2-T14 confirming review: the fix round, room for the amount step's middle and filled amounts masked

- **Reviewer:** Claude Opus 5.5, the independent confirming review, read-only. Nothing in the worktree or the main checkout was edited, committed or run against; git there was `fetch`, `log`, `show`, `diff`, `rev-parse` and `archive` only.
- **Reviewed:** PR #407, the fix commit `28b9d5ac` on `p2/t14-add-flow` (range `18876253..28b9d5ac`: one commit, 11 files, +629 / -131), pushed and equal to `origin/p2/t14-add-flow`.
- **Against:**
  - the first review's M1, m1 to m5 and n1 to n4 (`reviews/P2-T14.md`);
  - the second review's m1 to m4 and n1 to n3 (`reviews/P2-T14-second.md`);
  - ruling R106, as the controller amended it with the fix planner's P1;
  - the fix brief `briefs/P2-T14-fix.md` (P1 to P18) and its kit (`scratch/p2-t14-fix-planner/`);
  - plan P2 `### Task P2-T14` (line 901), its Global Constraints (lines 82 to 108), W14 and Review Focus 2 and 3;
  - the receipts `receipts/P2-T14-fix.md` and `P2-T14.md`; the protocol (R87, R100).
- **Where:** `scratch/p2-t14-confirm/copy/` is `git archive 28b9d5ac` with `node_modules` symlinked from the worktree. My probes and mutant runs are there and in `scratch/p2-t14-confirm/`.

## Verdict

Approved: no blocker, no major. Two minors and two nits, none of which needs a change before merge. The controller can carry them, as the notes at the end say.

- **M1 is fixed.** I reran the first review's height budget on the fixed layout. This time the line counts come from the app's own font files, not from estimates.
  - Next is pinned and on screen at AX5 on every phone listed, in Thai and English, whatever the problem line.
  - At AX5 on a 667 pt phone in Thai, the amount being typed is in view.
  - At the default size with the keyboard up on an SE, the name row fits, in view, with 1 pt to spare.
- **What m1 adds.** The planner's budget assumed the amount is one line. At AX5 on a 375 pt phone, amounts of ฿1,000,000 or more take two lines. In English on an SE, most of the second line's digits then sit under the fold. That case is beyond what R106 lets this round change.
- **Private mode (R106.2) holds.**
  - A fill is masked until the first key: drawn, spoken and labelled.
  - The first key starts the amount over.
  - My sweep finds no digit of a fill, or of any stored amount, anywhere on the step, at the default size and at AX5. A positive control proves the sweep would see one.
  - A 4,000-case fuzz finds that, after any key on a fill, the keypad equals the same keys typed on an empty one.
- **The minors hold:**
  - the 44 pt name field;
  - no chips on a transfer;
  - the switch locked with the tray, at AX5 too;
  - no `too_precise` and no bare `฿65.`;
  - the trimmed note.
- **The name field lets go when the keyboard hides.** React Native 0.88's Android `EditText` has no back-key handling, so this listener is the right remedy there.
- **Mutants.**
  - Planner's sample: 10 of the 138 rerun, all killed by assertions.
  - My own four:
    - two survive the committed files, and my probes kill both (m2);
    - one is a layout constant no test can see (n1);
    - one is equivalent.

## Findings

### Blocker

None.

### Major

None.

### Minor

**m1. At AX5 an amount of ฿1,000,000 or more takes two lines on a 375 pt phone. The fix's budget counted one, so two cases on the SE fall short.**

Measured with `scratch/p2-t14-confirm/ax5-budget-confirm.mjs` (output in `ax5-budget-confirm.log`). The probe follows the first review's arithmetic and constants, all checked against `28b9d5ac`:
- `Tray.tsx`: padding 18, gap 12, inset 8, close 44 with a 10 pt gap. The probe also uses `TypeSwitchHeader`, `WalletKeypad` and `PrimaryButton`.
- Line counts come from the font files' own advance widths (`fontWidths.mjs` reads `cmap` and `hmtx`).
- iOS scales a line's height by the capped multiplier (`RCTAttributedTextUtils.mm:247`) but not its letter spacing (`:213-214`).
- DM Sans Bold has no `฿` (U+0E3F). iOS falls back for it, and the probe uses Anuphan Bold's 0.665 em.

The widths, at 64 pt in the SE's 323 pt column:
- `฿999,999` is 292.9 pt: one line.
- `฿1,000,000` is 356.1 pt: two lines (167.7 pt).
- `฿999,999,999.99` is 519.8 pt: also two lines.

The first case is English on an SE (375×667):
- Spending's title "Add spending" is 278.6 pt at AX5's 43.2 pt. Its column is 269 pt (`Tray.tsx:299`, beside close), so it wraps.
- With the title in two lines, the header is 115.2 pt and the middle 120.0 pt.
- A two-line amount runs 47.7 pt past the fold.
- DM Sans's digits sit about 19 to 64 pt down each 83.9 pt line (ascender 0.992, cap height 0.700). So the fold cuts the second line's digits after their top 17 of 45 pt, both when the tray opens and while the amount is typed.
- "Add income" (240.0 pt) and "Move money" (253.5 pt) stay one line. On the 13 mini the middle is 201.0 pt, and the amount is in view.

The second case is Thai on an SE:
- The title is one line, so the middle is 161.1 pt.
- The two-line amount's box passes the fold by 6.6 pt. That is the second line's descender space, so its digits are in view.
- The cap's problem (จำนวนเงินสูงสุด ฿999,999,999.99, 700.5 pt wide, three lines) shows only when a tenth digit is refused. By then the amount is ฿100,000,000 or more, always two lines.
- So the problem starts at 175.7 pt, wholly below the fold. A refused tenth digit changes nothing in view: the key ticks, and iOS says the problem (`useAnnouncement`).
- On the 13 mini, the problem's first line is in view but for 5.4 pt. On the board's 390×844 its first line is in full view.

What still holds:
- Next is pinned and on screen on every phone, in both languages, with any problem.
- The amount's first line is in view in every case.
- The middle scrolls, and the amount is in its live region.
- The receipt's "the amount's 84 pt line opens in full view" (line 30) and the planner's "in full view on every phone listed, in Thai and in English" are true for amounts under ฿1,000,000.

Why minor, not major:
- The Thai case of the controller's bar holds: the amount is in view and Next is on screen with the longest problem line.
- The English line is a draft for E2-B.
- The miss needs AX5, a 375×667 phone and seven or more digits.
- The cures are outside this round's files:
  - R106 keeps `Tray.tsx`, where the title could be held to one line at the large sizes, as ax-large-tray draws it;
  - W30 sets the amount's 64 pt;
  - the brief keeps `add/copy.ts`, where a shorter English title would also cure it.

**Ask:** no change in this round. Carry two things:
- the title's scale at the large sizes, to the tray follow-up (the receipt's "pinned place under the tray's header" note);
- the two captures, to E2-B (see the notes).

**m2. Two of the round's new guards are unpinned: my mutants OM1 and OM2 pass both Node files and all 15 render cases.**

Runs are in `scratch/p2-t14-confirm/own-mutants.out`, with logs in `own-mutant-logs/`. Every restore's SHA-256 is equal.

- **OM1: the step masks with `keypad.fresh` instead of `isFilled(keypad)`** (`AmountStep.tsx:91`).
  - `isFilled` also counts satang opened with `keypadFromMinor` as a fill (`addFlow.ts:78-79`, P7). That is R106.2's safety net for a host that opens a stored satang amount that way (today's `keypadFor` and `copyOf`).
  - The Node case pins `isFilled` itself (P7), but nothing pins its use on the amount line. The render case for satang opened as typed (`AmountStep.render.test.tsx:556`) runs outside private mode.
  - My probe C2 kills it: private mode, `minor="6550"`, then expect `฿••••`, then press 1.
  - **Fix:** mount line 556's case once more with private mode on, and assert the mask before the key.
- **OM2: the name field's listener effect depends on `[onNaming]`** instead of `[]` with the latest-callback ref (`AmountStep.tsx:238-248`).
  - Both committed hosts pass a stable `setNaming` (`AmountStep.render.test.tsx:202`, `addSections.tsx:119`), so nothing can tell the two apart.
  - Take a host that passes an inline arrow, as P2-T16's may. Under the mutant, each render reruns the effect, and its cleanup says `false`. So the keys come back the moment the field takes focus.
  - My probe C6 (`onNaming={(next) => setNaming(next)}`, focus, keys gone) passes on `28b9d5ac` and kills OM2 with an AssertionError.
  - **Fix:** give the focus case's host an inline `onNaming`, or make it a stated case in P2-T16's brief.

Both guards are right today. These are pins, as the first review's m5 was.

### Nit

- **n1. The name row's 4 pt padding carries M1's keyboard-up fit with 1 pt to spare, and nothing pins it.**
  - With the 260 pt keyboard both reviews and the planner assumed, the SE's middle is 213 pt. The 72 pt row runs from 140 to 212 (`AmountStep.tsx:259`; the brief's P10).
  - My OM3 (padding back to 8, an 80 pt row ending 7 pt past the fold) passes everything, since happy-dom has no layout.
  - The 1 pt margin also rests on the keyboard's height. A taller one puts the field's line under the fold, and the tray's `ScrollView` does not bring it into view (P6). Thai's Kedmanee layout has four letter rows, so it may be taller; not verified.
  - A style assertion would pin the padding. E2-B's capture with the Thai keyboard is the real check.
- **n2. The field lets go on every `keyboardDidHide`, though P5's reason is Android's back alone.**
  - React Native's iOS observer forwards every `UIKeyboardDidHideNotification` (`RCTKeyboardObserver.mm:35`).
  - iOS can hide its keyboard while the field keeps focus, against P5's "iOS hides its keyboard only on blur". Examples: an iPad keyboard undocked, split or floated while typing (`app.json:11` sets `supportsTablet: true`), or a hardware keyboard attached.
  - In those cases the name field blurs and the person taps it again. Recoverable, and not verified on a device.
  - `Platform.OS === 'android'` around the listener would match P5's stated reason, if the device check shows it.

## What holds (evidence)

**1. M1, the height budget (focus 1).** My run of the budget (`ax5-budget-confirm.log`) agrees with the planner's (`p2-t14-fix-planner/logs/ax5-budget-fixed.log`) wherever both count the same lines. The middle's height at AX5:

| Phone | Thai | English |
| --- | --- | --- |
| SE 3, 375×667 | 161.1 | 120.0 (title in 2 lines) |
| 13 mini, 375×812 | 242.1 | 201.0 (title in 2 lines) |
| Board, 390×844 | 277.1 | 293.6 |
| 15 / 16, 393×852 | 273.1 | 289.6 |
| 16 Pro Max, 440×956 | 374.1 | 390.6 |

The first review's SE had -25 pt in Thai and 12 pt in English.

- **The amount is first in the middle.**
  - `AmountStep.tsx:95-122`: the amount, then the problem, then the wallet chip. The switch follows at AX5 (`:123-128`).
  - A one-line amount (84 pt) is in view on every phone in both languages. For two lines, see m1.
- **Next is pinned.**
  - The footer is the keys and Next (`AmountStep.tsx:141-142`), 353.1 pt in Thai at AX5.
  - The problem left it, so Next stays on screen whatever the problem's length. Every middle above is at least 0.
- **The zero problem** (two lines in Thai at AX5) starts right under the amount. Its first line is in view on the SE but for 2.6 pt.
- **At the default size with the keyboard up:**
  - the middle is 213.0 pt on the SE (5 before), 218.0 on the mini and 249 to 253 on 6.1-inch phones;
  - the name row is 72 pt in Thai and 69 in English, under the wallet chip (P6), and in view as the tray opens;
  - under a one-line zero problem it is 30 pt below the fold. The planner recorded that case as a device check.
- **The threshold.** `useSwitchInHeader()` is `!useLargeText()`, which starts at 1.5× (`largeTextScale.ts:14`). So iOS's xxxLarge (1.353×) keeps the switch in the header, and AX1 (1.786×) moves it.

**2. Private mode (focus 2).** These are my probes in `copy/apps/app/src/wallet/add/zzConfirmProbe.render.test.tsx` (7 of 7, `probe-render.log`) and `zzConfirmProbe.test.ts` (1 of 1, `probe-unit.log`).

- **C0, the control.** Outside private mode, my sweep of every text node and every `aria-*`, `title`, `alt`, `value` and `placeholder` outside the keypad does find ฿77,777.77 and ฿88.88. So C1 is not vacuous.
- **C1, the sweep in private mode.** Chips of ฿77,777.77 and ฿88.88 (no often-logged amount repeats such digits), at the default size and at AX5:
  - **Before a fill:** no `77`, `7,7` or `88` anywhere.
  - **After a fill:**
    - the line is `฿••••`, said ซ่อนยอดเงินอยู่;
    - the masked text is what the polite live region holds, so a change is announced as the mask;
    - Next is enabled and says only ถัดไป.
  - **Switching the type** to income and to transfer keeps the mask.
  - **The first key.** For each of 0 to 9 (but 7), 000 and delete, pressed as the first key after a fill, the line is that key's own amount and the sweep stays clean.
- **C2.** Satang opened as typed (`keypadFromMinor('6550')`, not `filledKeypad`) is masked in private mode until a key. This is the guard m2 asks to pin.
- **C5.** The catalogue's `bw-tray-amount` in private mode masks a chip fill, and shows its ฿50 sample as typed, as its label says.
- **F1 to F3, the Node fuzz.** 4,000 deterministic cases: random fills up to the cap, half through `filledKeypad` and half `keypadFromMinor`, then 1 to 14 random keys.
  - The fill keeps its exact amount, and `filledKeypad` is always a fill.
  - After any key on a fill, the keypad deep-equals the same keys typed on `EMPTY_KEYPAD`. So nothing of the fill is left, and no digit of it can show.
  - No state ever has `too_precise`, a point, a display ending in `.`, or `fresh`.
- **The committed case.** `AmountStep.render.test.tsx:582` checks the mask's size and spacing too (`58px`, `6.96px`). The planner's P1, P4 and P10 were rerun and killed.

**3. The minors (focus 3).**
- **The 44 pt name field.** `minHeight: BUN_TOUCH` (`AmountStep.tsx:284`; `BUN_TOUCH` is 44). The 44 pt sweep now switches to income and measures it. My C4 measures it at AX5 too.
- **No chips on a transfer** (`AmountStep.tsx:131`). Q11 was rerun and killed.
- **The switch locks with the tray.**
  - `TypeSwitchHeader` takes `disabled` (`TypeSwitchHeader.tsx:44`, `:64`, `:80`).
  - React Native's `Pressable` adds `disabled` to the accessibility state, and react-native-web sets `aria-disabled`.
  - T12 was rerun and killed.
  - My C3: at AX5 the switch the host gives the step is locked too, with no type change and no tick.
- **Satang.** `walletKey` (`addFlow.ts:92-94`) starts a fill over: a digit begins a new amount, and delete clears it. The fuzz above holds it, and W2 and P7 were rerun and killed. `amountProblem` still passes `too_precise` for Quick add's keypad (SR1, in the implementer's log).
- **`stillGuessed` with the trimmed note** (`addFlow.ts:141`): F24 is killed in the implementer's log.

**4. The name field and the keyboard (focus 4).**
- **On focus** the field says `true`, and the footer is Next alone (`AmountStep.tsx:141`, `:280`).
- **On blur** it says `false`.
- **When the keyboard hides,** the listener blurs it, so the keys come back (`:243`).
- **When it leaves,** its cleanup says `false` (`:246`). That covers a type change, a step change, the tray closing and the lock's cover.
- **Android.** `ReactEditText.kt:344-349` handles only Enter, so Android's back leaves the field focused, as P5 says.
- **The mutants.** N5 and N6 were rerun and killed. My C4 runs focus, hide and blur at AX5. A second hide with no focus changes nothing.
- **Other ways the keys come back on iOS.** Return blurs a one-line field. A tap on the middle's plain content also blurs it, since the `ScrollView` is `keyboardShouldPersistTaps="handled"` (`Tray.tsx:305`).
- **What is not covered:** see n2.

**5. Mutants (focus 5).**
- **The planner's sample.** I reran L2, N5, N6, P1, P4, P7, P10, W2, T12 and Q11 with the planner's runner: 10 killed, each by an AssertionError, every restore's SHA-256 equal (`planner-sample.out`, logs in `planner-sample-logs/`).
- **The implementer's log** (`scratch/p2-t14-fix/mutants.out`): 138 killed, and no kill has `AssertionError x0`.
- **My own four:**

| Mutant | Committed files | My probes | Note |
| --- | --- | --- | --- |
| OM1, the line masked by `fresh` alone | survives | killed (C2) | m2 |
| OM2, the listener effect on `[onNaming]` | survives | killed (C6) | m2 |
| OM3, the name row's padding back to 8 | survives | survives | n1, a layout constant |
| OM4, the listener never removed | survives | survives | equivalent: after unmount the ref is null, so a leaked listener's `blur()` does nothing |

**The commit and the gate.**
- **Scope.** The commit is the brief's eleven files.
  - The nine code and test files, and `P2-T14.md`, equal the planner's `real/` byte for byte (`shasum -c SHA256SUMS.real-in-wt` and `SHA256SUMS.receipt-in-wt` on the copy).
  - `P2-T14-fix.md` equals the kit's receipt but for its three filled marks.
- **Nothing outside the add folder is reached.** The changed modules are imported only by the add folder and `addSections.tsx`, so no neighbour can change.
- **The integration branch.** It is now `647cb4a0`. It has no change under `apps/app`, `packages` or the lockfiles since the merge base `96a52c2a` (`git diff --stat`, empty), so the brief's no-merge base holds.
- **Hygiene.**
  - `git diff --check` is clean for `18876253..28b9d5ac` and for `origin/claude/p1a-vault-core...28b9d5ac`.
  - The 629 added lines hold no em or en dash, no `console`, logger or analytics call, and no `Number(` in code.
  - `addFlow.ts` still imports only by relative path.
- **My copy:**
  - `typecheck:app` exits 0, with my probe files included;
  - the focused Node files pass 12 of 12 (`addFlow.test.ts` 7, `amountStepNative.test.ts` 1, `draftText.test.ts` 4);
  - `AmountStep.render.test.tsx` passes 15 of 15 (`focused-render.log`).
- **The implementer's logs** match the brief's expected values:
  - RED: Node 2 of 8 failing, render 10 of 15, each on an AssertionError, with no module error;
  - GREEN: 12 and 15;
  - neighbours 58, catalogue 26.
- **The trailer.** The commit's trailer names Gemini 3.8 Flash, not the brief's template. The protocol asks for the model the implementer ran as, so this is not a finding.

## CI on PR #407 (run 43052410808, head `28b9d5ac`)

Four jobs sat in the queue from 15:50 UTC. Both self-hosted runners were offline when I checked at 17:31 UTC, and back at 17:33. At the time of writing:

| Job | Result |
| --- | --- |
| Typecheck, unit, API, build | pass: `test:app` 34 of 34; `test:unit` 982 of 982, with `addFlow.test.ts` and `amountStepNative.test.ts`; 7 of 7 in the next runner |
| Render, per-section suites (every other test), which holds `bw-tray-amount` and `bw-tray-income` (14-character ids) | pass: 2 files, 228 passed, 370 skipped (598) |
| Render, per-section suites (ids of length 3n) | pass: 166 passed, 432 skipped |
| Render, per-section suites (ids of length 3n+1) | pass: 204 passed, 394 skipped |
| SQL integration and ops | pass (1m46s) |
| Edge Worker | pass (1m39s) |
| Render (every file but the per-section suites), which holds `AmountStep.render.test.tsx` | queued |
| Exports (web and iOS bundles) | queued |
| Release image and smoke | queued |

Nothing is red. The three queued jobs must pass before the merge. My copy ran the render job's focused file (15 of 15) and `typecheck:app`. Nothing in this round changes a route, the app entry or a package.

## Notes for later tasks

- **P2-T16, or the tray follow-up:**
  - **At AX5 the switch sits under the amount (P1).** To reach รายรับ on an SE in Thai, the person scrolls the middle about 110 pt. The middle keeps that offset after the type changes, and the keypad never scrolls it, so the amount typed next can be out of view.
  - **Two cures.** Scroll the middle to its top when the type changes, or build the pinned place under the header the receipt names; it would also settle m1.
- **P2-T16:**
  - At AX5 only `AmountStep` draws the switch (`typeSwitch`). W14 and plan line 991 make the switch the tray's header on every step. So the host decides where it goes on confirm and the pickers at AX5, or records "the type is chosen on the amount step" among E2-B's differences.
  - The second review's rule still applies: a change to transfer goes to the transfer step, never stays on confirm.
- **P2-T16 and P2-T27:** keep `onNaming` stable, or pin the inline case (m2's OM2). Pass `filledKeypad` for every fill. The step's satang net (m2's OM1) is only a net.
- **P2-T37: two strings carry digits that are not a stored amount.** The sweep's exemptions need to know them:
  - the keypad's keys (1 to 9, 000, 0);
  - the cap's words (จำนวนเงินสูงสุด ฿999,999,999.99).
- **P2-T15, when move all is refused in private mode.** A balance above the cap shows the cap's words over a masked line, which tells the person the hidden balance is above ฿999,999,999.99. That is low risk; decide it with P2-T15's private-mode rules.
- **E2-B:**
  - Capture `bw-tray-amount` at AX5 on a 375×667 phone in English, with ฿1,000,000 or more typed (m1), and in Thai with a tenth digit refused.
  - Capture `bw-tray-income` with the Thai keyboard up on a 667 pt phone (n1).
  - Check the name field on an iPad, with the keyboard floated or undocked while typing (n2).
  - "Add spending" is the one English title that wraps at AX5 on a 375 pt phone.

VERDICT: Approved
