# Brief P2-T26 fix round: the receipt photo in private mode, the undo bar's spoken words, the phone's first answer, and the reviews' pins

You are the fixer for the P2-T26 fix round. PR #456 (branch `p2/t26-record-detail`, head `52110318`) adds the Bun Wallet's record screen, its actions tray and its undo bar. CI is green 9 of 9, and both reviews say **Needs fixes**, for one major, which is the controller's ruling R123:
- the first review (`reviews/P2-T26.md`, Opus): M1, minors m1 to m3, nits n1 to n3;
- the second review (`reviews/P2-T26-second.md`, Sonnet, money and privacy): M1, minors m1 and m2, nits n1 to n5.

The controller ruled **R123** and **R124** (quoted in P22 and P23 below). The planner wrote every file below and proved it in a scratch copy of `52110318` (`git archive 52110318`, its own `npm ci`):
- RED: the round's two render files over `52110318`'s code, with no stub. `typecheck:app` exits 0, and 7 of 39 cases fail, each on an `AssertionError`;
- GREEN;
- 139 mutants, all killed, every failing case on an `AssertionError` (C1 by its suite failing to load, as it expects);
- R100's fast local gate, each file named;
- a dry run of this brief's own commands, Steps 1 to 6, on a copy of `52110318` (`PL/logs/fixer-dryrun/`).

You copy the planner's files, check them by checksum, prove RED, GREEN and the mutants in the worktree, run the gate, check the two receipts and commit. The planner wrote both receipts; you copy them and do not edit them. Do exactly what this brief says.

Read first:
1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. R100 applies: the fast local gate only, and no whole-suite total as an expected value anywhere. R87 applies: the round's receipt is its own new file, `docs/implementation/receipts/P2-T26-fix.md`, and `P2-T26.md` takes the planner's correction; do not edit `premium-progress.md`.
2. The reviews: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/P2-T26.md` and `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/P2-T26-second.md`.
3. The first round's brief, `/Users/kunanonjarat/Developer/jotbun/.claude/controller/briefs/P2-T26.md`. Its rulings P1 to P21 stand, except where this brief's P22 to P31 change them.

## Paths and rules

- **WT** = `{WT}` (branch `p2/t26-record-detail`, head `52110318`, installed). Work only here. Do not merge the integration branch into it: the controller merges up.
- **S** = `{S}`, your scratch folder. Create it with `mkdir -p {S}`. Your logs, the mutant runs and the commit message go there. Never keep anything under `/private/tmp`.
- **PL** = `{PL}`, the planner's folder. Read it and `cp` from it; never write into it. It holds:
  - `real/`: the round's seven files at their repo paths: the record screen, the undo bar, the catalogue's record stages (`recordScreens.tsx`), the main render file, the new receipt render file, `P2-T26.md` corrected and `P2-T26-fix.md` (new);
  - `orig/`: the five of them that `52110318` has, as it has them;
  - `diffs/`: one diff per file (`orig/` to `real/`, or nothing to `real/` for the two new files), with repo paths `a/<path>` and `b/<path>` and full blob ids, and `p2-t26-fix.patch`, the whole round. `PL/logs/applycheck.log` proves the patch turns `orig/` into `real/` byte for byte. The Appendix prints them;
  - `tools/`: `files.sh` (the file lists), `stage.py` (the planner's forms: base, RED, GREEN), `mutants.py` (the runner), `batches.txt`, `merge_mutants.py` (joins the runner's batches), `first_errors.py` (each failing case's error kind), `diffs.sh`, `diffcheck.sh`, `sums.sh`, `dryrun.py`, `fill_brief.py` and `brief.template.md` (how this brief was built: every diff below prints the `diffs/` file);
  - `SHA256SUMS` (the kit, {{SUMS_COUNT}} files; check it from PL) and `SHA256SUMS.logs` (the planner's `logs/`);
  - four lists to check WT with `shasum -a 256 -c`, paths relative to WT:
    - `SHA256SUMS.base-in-wt`: the 17 unchanged files the round's code and cases rely on, as `52110318` has them;
    - `SHA256SUMS.orig-in-wt`: the five files as `52110318` has them;
    - `SHA256SUMS.red-in-wt`: the five files as RED leaves them (the two render files from `real/`, the three code files as `52110318` has them);
    - `SHA256SUMS.real-in-wt`: the round's seven files in their final form.
  - There is no `stubs/`: RED needs no stub (P29). `tree/` is the planner's proof tree; it is not in `SHA256SUMS`, and you never use it.
- Every shell call starts in a fresh directory, so every command below is written with full paths. Type each exactly. Git: `/usr/bin/git -C {WT} <command>`, one git command per call.
- Run one step at a time, in the foreground. Never run a test while a mutant batch (Step 4) is running: the runner changes the code files while it runs.
- No heavy lock is needed: no database suite and no workers pool. Docker is stopped and stays stopped.
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests, code or receipts to make them pass. One exception, a load flake: a case that times out near 5 s under load in a file this round does not touch. Rerun that file alone once, and record both runs.
- Every count you report comes from your own log in S. Never copy the planner's logs in place of one.

## Scope

| File | Change |
| --- | --- |
| `apps/app/src/wallet/records/WalletRecordScreen.tsx` | R123: while amounts are hidden, today's receipt section is not mounted, and a record that holds a receipt shows its frame (`HiddenReceipt`, P24). R124: `deletedBarText` returns the drawn and the spoken words, and the page gives the bar both (P25). 488 lines before, 528 after. |
| `apps/app/src/wallet/records/WalletUndoBar.tsx` | The optional `spoken` (P25), and the guard on the phone's first screen-reader answer (P26). 103 before, 117 after. |
| `apps/app/src/dev/catalogue/wallet/recordScreens.tsx` | The undo section gives its bar both words, and its draft table carries `COMMON_COPY` (P25). 148 before, 152 after. |
| `apps/app/src/wallet/records/WalletRecord.render.test.tsx` | 35 cases (25 before): ten new and four with a new part (P27, P28). 942 before, 1157 after. |
| `apps/app/src/wallet/records/WalletRecordReceipt.render.test.tsx` | **New**: R123's four cases on the real panel (P28). 171 lines. |
| `docs/implementation/receipts/P2-T26.md` | The planner's correction: a line pointing to the fix round, and the three lines the round makes untrue (P30). 44 lines before, 45 after. |
| `docs/implementation/receipts/P2-T26-fix.md` | **New**: the round's receipt (R87), written by the planner with the proven numbers (P30). 51 lines. |

Not in this round: `RecordReceipt.tsx` and today's `RecordScreen.tsx` (R123: the wallet page only; `RecordScreen` goes to P2-T37); `RecordActionsTray.tsx`; `records/copy.ts` (no new key: `records.noteHidden` is reused); `recordSections.tsx` (the second review's n3); `Tray.tsx` (its m2); `en.json`, `th.json`; any package or lockfile; `premium-progress.md`.

## Planner rulings (what this round decides, with the reason for each)

- **P22. R123, the controller's ruling of 13 November, quoted:** "Private mode and the receipt photo. Opus's shape, with Sonnet's area guard.
  - While `usePrivateMode().hidden`, the wallet page does not mount `RecordReceipt` at all, so no grant, no download, no image, no open, and no Attach, Replace or Remove.
  - When the record holds a receipt (`record.attachment_id` set) and `isRedesignEnabled('import')` is true, draw the section's frame in the wallet look instead: the heading `tc('Receipt photo')` (รูปใบเสร็จ) and `t('records.noteHidden')` (ซ่อนอยู่), read as one element.
  - When the record holds no receipt, or the import area is off, draw nothing while hidden.
  - With private mode off, today's panel is unchanged.
  - Fix only the wallet page (`WalletRecordScreen.tsx`), not `RecordReceipt`. Today's `RecordScreen` goes to P2-T37.
  - Its cases need a separate render file, since the main file stubs `RecordReceipt` module-wide. [...] Also assert, in the main file's private-mode case, that the stand-in's text is absent while hidden.
  - Reuse `records.noteHidden` unless you show a reason for a new key."
- **P23. R124, the controller's ruling of 13 November, quoted:** "The undo bar's spoken words (Opus m1, the Global Constraints' '฿ read as บาท').
  - `deletedBarText` returns the drawn words and the spoken ones, with the spoken amount through `spokenMoney`. Private mode is unchanged, since `records.deletedBarHidden` holds no amount.
  - `WalletUndoBar` takes an optional `spoken`, which labels its words and is what the iOS announcement says. That is one optional prop beyond the plan's three.
  - The iOS case expects ลบ ข้าวมันไก่ 50 บาท แล้ว."
- **P24. The frame (R123, how):**
  - `HiddenReceipt`, a new function in `WalletRecordScreen.tsx`, is a card (`testID="wallet-record-receipt-hidden"`, the facts card's look: `colors.card`, radius 20) holding one `Fact` row, the page's own: the label `tc('Receipt photo')` and the value `t('records.noteHidden')`. `Fact` is one accessible element labelled `${label} ${spoken}`, so the frame reads รูปใบเสร็จ ซ่อนอยู่ as one, exactly as the note reads โน้ต ซ่อนอยู่ in private mode.
  - The live record's body: `hidden ? (receiptHeld && isRedesignEnabled('import') ? <HiddenReceipt /> : null) : <RecordReceipt ... />`, with `receiptHeld = Boolean(record.attachment_id)`. `RecordReceipt`'s line itself is unchanged. The draft, deleted and frozen branches never drew the panel and are unchanged.
  - No new key: R123 names `records.noteHidden`, and the heading is today's catalog line.
  - `usePrivateMode().hidden` is true until the setting is read, so with private mode off the panel mounts once the setting is known, never before: no grant starts while the setting is unknown. Outside the wallet's provider the page reads as shown, and mounts today's panel, as today's record does.
- **P25. The spoken words (R124, how):**
  - `deletedBarText(title, amountMinor, hidden, t)` returns `{ text, spoken }`. `text` is as before (`walletMoneyText`, ฿50); `spoken` has the amount through `spokenMoney` (50 บาท). In private mode both are `records.deletedBarHidden`.
  - `WalletUndoBar`'s props become `{ message, spoken?, onUndo, onDismiss }`. `spoken` is the words' `accessibilityLabel` and what `useAnnouncement` says (`spoken ?? message`). Without it the bar reads and says `message`, as before. The bar stays one polite live region.
  - The page passes `message={words.text} spoken={words.spoken}`, and so does the catalogue's undo section. Its draft table `SAMPLES` now spreads `COMMON_COPY` before `COPY`, since `spokenMoney` reads `common.baht`. Without it the section's bar would be read as "ลบ ข้าวมันไก่ common.baht แล้ว" (mutant W6).
- **P26. The guard on the phone's first answer (the first review's n3, the second's n5; the controller left it to the planner):** done, since it is small and pinnable.
  - In `useScreenReaderRunning`, the `screenReaderChanged` listener sets a `changed` flag, and the first answer from `isScreenReaderEnabled()`, a value or a failure, applies only while `changed` is false. A late "no" after VoiceOver came on no longer starts the bar's time under a screen reader (WCAG 2.2.1).
  - One case (a late value and a late failure, after a change) and three mutants (G1 to G3).
  - Today's `UndoBar` also drops an answer that lands after the bar has gone (`live`). That half is not carried: React 19.3 drops a state update on an unmounted component silently, so no case or person can see it, and it would be the kit's one mutant no case can kill.
- **P27. The reviews' pins (the code is right today; one case and its mutants per guard, all in the main file):**

  | Review | Case | Mutants |
  | --- | --- | --- |
  | Opus m2 | `a new delete after an undo whose bar ran out is a new bar (Opus m2)` | M1, M2 |
  | Opus m3 | `the actions tray's Close closes it (Opus m3)` | M49 |
  | Opus n1 | `Back goes back, or to History when there is nowhere to go back to (Opus n1)` | M28, M28b |
  | Opus n2 | the fills in `the undo bar: a 44 pt Undo on the toast colour, gone after toastLong, but never while a screen reader runs` | M24, M24b |
  | Sonnet m1 | `a refused delete says why, sends once, reads the record again and keeps the page live (Sonnet m1)` and `the same refusal from the actions tray: the tray goes and the page says why (Sonnet m1)` | OM7 |
  | Sonnet m1 | `a draft whose Remove or Discard fails says so and stays (Sonnet m1)` | OM8 |
  | Sonnet m1 | `a draft's buttons stack at the largest text size too (Sonnet m1)` | OM1, OM2 |
  | Sonnet n2 | `the tile and the wallet's swatch are art, never read (Sonnet n2)` | OM19, OM20 |

  Each mutant is the reviewer's own edit, re-pointed at this round's lines. M24b and M28b are kin: the mark's circle shares the pill's fill, and Back's fallback is History (`/spend/all`).
- **P28. The tests:**
  - `WalletRecordReceipt.render.test.tsx` (new, 4 cases) runs the real `RecordReceipt` in `ReceiptPortsProvider`, on `createFakeAttachments` seeded with `seedReceipt`. Private mode is `device: { [PRIVATE_MODE_NAME]: '1' }` (`'private-mode'`). The import area is on by default and off with `EXPO_PUBLIC_REDESIGN='-import'`, put back after each case. The cases:
    - a record with a receipt in private mode, in Thai and English, light and dark: the frame, its words, how it is read and its card colour; no part of the panel, no `<img>`, no photo's bytes in the page, and no grant or download;
    - a record with no receipt in private mode: nothing;
    - private mode off: the thumbnail, one grant and no frame, and Attach for a record with no receipt;
    - the import area off: neither the frame nor the panel, with private mode on or off.
  - `WalletRecord.render.test.tsx` has ten new cases: the answer guard, the iOS page case, and the eight pins in P27. Four cases gain a part:
    - the delete case: the words, read;
    - the private-mode case: the stand-in is not drawn, the words are read as drawn, and no label holds an amount;
    - the undo bar case: the fills;
    - the catalogue case: the bar, read, in both modes.

    The bar-level iOS case is unchanged: a bar with no `spoken` says its words.
- **P29. RED needs no stub.** No case passes `spoken` or reads `deletedBarText`, so both files compile against `52110318`'s code: `typecheck:app` exits 0 at RED (proven). The 7 failing cases are the ones the round changes (Step 2).
- **P30. The receipts:** the planner wrote both with the proven numbers; you copy them and do not edit them. `P2-T26.md` gains a line pointing to the fix round. Three of its lines are corrected: private mode, the P2-T37 note, and the receipt-photo note, now decided as R123.
- **P31. Not in this round** (the controller's followups): the second review's m2 (the iOS dismissal bound for the tray's hand-off), n3 (the static import cycle) and n4 (the undo bar's literals). Also its n1: the controller's list calls n1 "the If-Match regex copy", but the second review's n1 is `after.current` not cleared once `actionsClosed` has used it (unreachable today), and neither review raises an If-Match regex. The receipt names both for the controller.

---

## Step 1: Check the base

1. `/usr/bin/git -C {WT} status --short`. Expected: no output.
2. `/usr/bin/git -C {WT} rev-parse --short HEAD`. Expected: `52110318`. Then `/usr/bin/git -C {WT} branch --show-current`. Expected: `p2/t26-record-detail`.
3. `mkdir -p {S}`
4. The kit, checked from PL: `cd {PL} && shasum -a 256 -c SHA256SUMS | grep -vc ': OK$'`. Expected: `0`. Then `cd {PL} && shasum -a 256 -c SHA256SUMS | grep -c ': OK$'`. Expected: `{{SUMS_COUNT}}`.
5. The base files:
   - `cd {WT} && shasum -a 256 -c {PL}/SHA256SUMS.orig-in-wt`. Expected: five `OK` lines, exit 0.
   - `cd {WT} && shasum -a 256 -c {PL}/SHA256SUMS.base-in-wt`. Expected: 17 `OK` lines, exit 0.
   - `ls {WT}/apps/app/src/wallet/records/WalletRecordReceipt.render.test.tsx {WT}/docs/implementation/receipts/P2-T26-fix.md`. Expected: two "No such file or directory" lines.
6. `ls {WT}/node_modules/.package-lock.json`. Expected: the path is printed. Only if it is missing: `cd {WT} && npm ci --ignore-scripts --no-audit --no-fund > {S}/npm-ci.log 2>&1; echo $?`. Expected: 0.
7. The focused base:
   - `cd {WT} && npm run typecheck:app > {S}/base-typecheck.log 2>&1; echo $?`. Expected: 0.
   - `cd {WT}/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/records/WalletRecord.render.test.tsx src/wallet/records/WalletDeleted.render.test.tsx src/screens/redesign/RecordScreen.render.test.tsx src/screens/redesign/import/RecordReceipt.render.test.tsx > {S}/base-focused.log 2>&1; echo $?`. Expected: 0, `Test Files  4 passed (4)`, `Tests  153 passed (153)` (25, 15, 65 and 48).

   Compare with `PL/logs/fixer-dryrun/base-typecheck.log` and `base-focused.log`.

## Step 2: RED (the round's two render files over `52110318`'s code)

1. Copy the two render files:
   ```bash
   cp {PL}/real/apps/app/src/wallet/records/WalletRecord.render.test.tsx {WT}/apps/app/src/wallet/records/WalletRecord.render.test.tsx
   cp {PL}/real/apps/app/src/wallet/records/WalletRecordReceipt.render.test.tsx {WT}/apps/app/src/wallet/records/WalletRecordReceipt.render.test.tsx
   ```
   Then `cd {WT} && shasum -a 256 -c {PL}/SHA256SUMS.red-in-wt`. Expected: five `OK` lines, exit 0.
2. The RED typecheck: `cd {WT} && npm run typecheck:app > {S}/red-typecheck.log 2>&1; echo $?`. Expected: 0.
3. `cd {WT}/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/records/WalletRecord.render.test.tsx src/wallet/records/WalletRecordReceipt.render.test.tsx > {S}/red-render.log 2>&1; echo $?`. Expected:
   - exit 1, `Test Files  2 failed (2)`, `Tests  7 failed | 32 passed (39)`;
   - `python3 -I {PL}/tools/first_errors.py {S}/red-render.log` prints `red-render.log: 7 failing case(s): AssertionError` and `1 logs, 0 with a failing case that is not an AssertionError (or with none)`;
   - `grep -cE 'Cannot find module|Failed to resolve|SyntaxError|is not a function|TestingLibraryElementError|TypeError|ReferenceError|Not implemented' {S}/red-render.log` gives 0;
   - `grep -c 'stderr |' {S}/red-render.log` gives 0.

   The 7 failing cases, each on an `AssertionError` (the first failure of each):
   - main file, `ลบ deletes, and Undo restores with the version the delete returned`: `th light: its words, read: expected null to be 'ลบ ข้าวมันไก่ 50 บาท แล้ว'`
   - main file, `private mode hides the record's amount and the ghost, and draws none of the person's words`: `th light: no receipt section: expected [ <div dir="auto" …(1)></div> ] to have a length of +0 but got 1`
   - main file, `the undo bar drops the phone's first answer once the phone has told of a change (the reviews' n3 and n5)`: `a late no: no time under a screen reader: expected [ { run: [Function], …(1) } ] to have a length of +0 but got 1`
   - main file, `on iOS the page says its undo bar once, with the amount in words, and in private mode without one (R124)`: `th: expected [ 'ลบ ข้าวมันไก่ ฿50 แล้ว' ] to deeply equal [ 'ลบ ข้าวมันไก่ 50 บาท แล้ว' ]`
   - main file, `the catalogue draws the record, a draft, a deleted entry, the actions tray and the undo bar on their own fakes`: `th: the bar, read: expected null to be 'ลบ ข้าวมันไก่ 50 บาท แล้ว'`
   - receipt file, `private mode: a record that holds a receipt shows the section's frame, รูปใบเสร็จ ซ่อนอยู่, and fetches nothing`: `th light: the frame: expected [] to have a length of 1 but got +0`
   - receipt file, `private mode: a record with no receipt shows no receipt section, and nothing to attach`: `th: no record-receipt: expected [ <div …(3)>…(2)</div> ] to have a length of +0 but got 1`
4. The list, sorted: `grep -E '^ +× ' {S}/red-render.log | sed -E 's/ [0-9]+ms$//' | sed -E 's/^ +× //' | LC_ALL=C sort > {S}/red-render.list`, then `diff {PL}/logs/red/red-render.list {S}/red-render.list`. Expected: no output.

   Compare with `PL/logs/red/red-typecheck-app.log` and `PL/logs/red/red-render.log`.

## Step 3: GREEN

1. Copy the code and the receipts:
   ```bash
   cp {PL}/real/apps/app/src/wallet/records/WalletRecordScreen.tsx {WT}/apps/app/src/wallet/records/WalletRecordScreen.tsx
   cp {PL}/real/apps/app/src/wallet/records/WalletUndoBar.tsx {WT}/apps/app/src/wallet/records/WalletUndoBar.tsx
   cp {PL}/real/apps/app/src/dev/catalogue/wallet/recordScreens.tsx {WT}/apps/app/src/dev/catalogue/wallet/recordScreens.tsx
   cp {PL}/real/docs/implementation/receipts/P2-T26.md {WT}/docs/implementation/receipts/P2-T26.md
   cp {PL}/real/docs/implementation/receipts/P2-T26-fix.md {WT}/docs/implementation/receipts/P2-T26-fix.md
   ```
   Then `cd {WT} && shasum -a 256 -c {PL}/SHA256SUMS.real-in-wt`. Expected: seven `OK` lines, exit 0.
2. `/usr/bin/git -C {WT} status --short`. Expected: these seven lines, in any order, and nothing else:
   ```
    M apps/app/src/dev/catalogue/wallet/recordScreens.tsx
    M apps/app/src/wallet/records/WalletRecord.render.test.tsx
    M apps/app/src/wallet/records/WalletRecordScreen.tsx
    M apps/app/src/wallet/records/WalletUndoBar.tsx
    M docs/implementation/receipts/P2-T26.md
   ?? apps/app/src/wallet/records/WalletRecordReceipt.render.test.tsx
   ?? docs/implementation/receipts/P2-T26-fix.md
   ```
3. The code, for reference: the Appendix prints every diff. Read them before Step 7.
4. `cd {WT} && npm run typecheck:app > {S}/green-typecheck.log 2>&1; echo $?`. Expected: 0.
5. The round's two files: `cd {WT}/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/records/WalletRecord.render.test.tsx src/wallet/records/WalletRecordReceipt.render.test.tsx > {S}/green-render.log 2>&1; echo $?`. Expected: 0, `Test Files  2 passed (2)`, `Tests  39 passed (39)` (35 and 4), and `grep -c 'stderr |' {S}/green-render.log` gives 0.

   Compare with `PL/logs/fixer-dryrun/green-typecheck.log` and `green-render.log`.

## Step 4: Mutation check

Run the 139 mutants in ten batches, one batch per call, each in the foreground (two to four minutes each; nothing else may run meanwhile). First `mkdir -p {S}/mutant-batches`. Then, one at a time:

```bash
{{BATCH_COMMANDS}}
```

Expected after each: 0, and `tail -1` of its file prints `14 killed, 0 survived, 0 not as expected` (batch 10: `13 killed, 0 survived, 0 not as expected`). After each batch, `cd {WT} && shasum -a 256 -c {PL}/SHA256SUMS.real-in-wt` gives seven `OK` lines. If a call is cut short, a mutant may be left in a file: run that check, and if a file fails it, `cp` that file again from `PL/real/` as Step 3.1 does, check again, and rerun the whole batch.

Then join them: `python3 -I {PL}/tools/merge_mutants.py {PL}/tools/mutants.py {S}/mutant-batches {S}/mutants.out; echo $?`. Expected: `139 lines; 139 killed, 0 survived, 0 not as expected` and `0`. Then `diff {PL}/logs/mutants.out {S}/mutants.out`. Expected: no output. (If a line differs only in its counts, while still `KILLED` with only `AssertionError`s, record the line in your final message and go on.) Then `cd {WT} && shasum -a 256 -c {PL}/SHA256SUMS.real-in-wt` again: seven `OK` lines. `/usr/bin/git -C {WT} status --short`: unchanged from Step 3.2.

The mutants, by group (the full lines are in `PL/logs/mutants.out`):
- S1 to S66, T1 to T13, U1 to U16, K1, K2, C1 to C5, R1 to R3 and D1: the first round's 106. S38, S64, U3, U4, U12 and U15 are re-pointed at the lines this round moves.
- F1 to F10, R123's frame, run against the receipt file: private mode mounting the panel, the frame with no receipt or with the area off, no frame, its words, how it is read, its card.
- W1 to W7, R124: the spoken amount, the page's and the catalogue's `spoken`, private mode's words, the label, and iOS.
- G1 to G3: the guard on the phone's first answer (P26).
- M1, M2, M24, M24b, M28, M28b, M49, OM1, OM2, OM7, OM8, OM19 and OM20: the reviews' pins (P27).

## Step 5: The fast local gate (R100)

In this order, each with its log in S:

1. `cd {WT} && npm run typecheck:app > {S}/gate-1-typecheck.log 2>&1; echo $?`. Expected: 0.
2. The focused render files and today's three neighbours: `cd {WT}/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/records/WalletRecord.render.test.tsx src/wallet/records/WalletRecordReceipt.render.test.tsx src/wallet/records/WalletDeleted.render.test.tsx src/screens/redesign/RecordScreen.render.test.tsx src/screens/redesign/import/RecordReceipt.render.test.tsx > {S}/gate-2-focused.log 2>&1; echo $?`. Expected: 0, `Test Files  5 passed (5)`, `Tests  167 passed (167)` (35, 4, 15, 65 and 48: the last three as at the base), and `grep -c 'stderr |' {S}/gate-2-focused.log` gives 0.
3. The four routes tests, each named: `cd {WT}/apps/app && npx vitest run --config vitest.render.config.ts src/screens/redesign/SpendRoutes.render.test.tsx src/screens/redesign/account/AccountRoutes.render.test.tsx src/screens/redesign/insights/InsightsRoutes.render.test.tsx src/screens/redesign/planning/PlanningRoutes.render.test.tsx > {S}/gate-3-routes4.log 2>&1; echo $?`. Expected: 0, `Test Files  4 passed (4)`, `Tests  18 passed (18)`.
4. The eight kit render files, each named: `cd {WT}/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/card/CardStack.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/wallet/lock/Lock.render.test.tsx src/wallet/add/AmountStep.render.test.tsx src/wallet/wallets/WalletsList.render.test.tsx > {S}/gate-4-kit8.log 2>&1; echo $?`. Expected: 0, `Test Files  8 passed (8)`, `Tests  142 passed (142)`.
5. The record's sections and bw-deleted, in both catalogue suites: `cd {WT}/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "section bw-record|section bw-deleted" > {S}/gate-5-catalogue.log 2>&1; echo $?`. Expected: 0, `Test Files  2 passed (2)`, `Tests  12 passed | 672 skipped (684)`.
6. `cd {WT} && npm run test:app > {S}/gate-6-test-app.log 2>&1; echo $?`. Expected: 0, `ℹ fail 0`. (No count is expected: CI holds the whole suites, R100.)
7. `cd {WT} && npm run test:unit > {S}/gate-7-test-unit.log 2>&1; echo $?`. Expected: 0, `ℹ fail 0`.
8. `/usr/bin/git -C {WT} diff --check`. Expected: no output, exit 0. (After the commit, Step 7.5 checks the range.)

Compare with `PL/logs/fixer-dryrun/gate-*.log`. A case that times out near 5 s in a file this round does not touch is a load flake: rerun that file alone once, record both runs, and do not change it.

Not run, and why (the receipt says so): `typecheck:routes` and `export:web` (no route, config or app entry changes; CI runs `export:web`); the full render suite (CI, R100; its per-section jobs open the record's five sections); the iOS export (CI); `test:ops` (no package or lockfile change); the API, edge and database suites (nothing outside `apps/app` and the receipts changes; Docker is stopped); and the device checks, SKIPPED: VoiceOver and TalkBack reading the bar's words with the amount in words, the frame read as one in private mode, and the first round's list.

## Step 6: The receipts

The planner wrote both, and you copied them in Step 3.1 (P30). Check that they are unchanged:
`cd {WT} && shasum -a 256 docs/implementation/receipts/P2-T26.md docs/implementation/receipts/P2-T26-fix.md`. Expected: the same two sums as their lines in `PL/SHA256SUMS.real-in-wt`. Every number in `P2-T26-fix.md` is one of this brief's Expected lines or Scope counts, which your runs matched. Do not edit either file.

## Step 7: Commit

1. Stage the seven files:
   `/usr/bin/git -C {WT} add apps/app/src/wallet/records/WalletRecordScreen.tsx apps/app/src/wallet/records/WalletUndoBar.tsx apps/app/src/dev/catalogue/wallet/recordScreens.tsx apps/app/src/wallet/records/WalletRecord.render.test.tsx apps/app/src/wallet/records/WalletRecordReceipt.render.test.tsx docs/implementation/receipts/P2-T26.md docs/implementation/receipts/P2-T26-fix.md`
2. `/usr/bin/git -C {WT} status --short`. Expected: five `M ` lines and two `A ` lines (the seven files), and nothing else: no log.
3. Write the message to `{S}/commit-message.txt`, exactly:
   ```
   Hide the receipt photo in private mode and read the undo bar's amount

   In private mode the wallet record no longer mounts today's receipt
   section: a record that holds a receipt shows the section's frame,
   with its words hidden, so no slip is granted, downloaded, drawn or
   opened. The undo bar's words are read, and said on iOS, with the
   amount in words, and the phone's first screen-reader answer no
   longer overrides a change. Pin the reviews' survivors, and correct
   P2-T26's receipt.

   Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
   ```
4. `/usr/bin/git -C {WT} commit -F {S}/commit-message.txt`, then `/usr/bin/git -C {WT} log --oneline -2` (your commit on `52110318`) and `/usr/bin/git -C {WT} show --stat HEAD` (7 files).
5. `/usr/bin/git -C {WT} diff --check origin/claude/p1a-vault-core...HEAD`. Expected: no output, exit 0.

## Your final message

The orchestrator reads only this:
- First line: `STATUS: DONE` (or `STATUS: BLOCKED` with the exact blocker and its output).
- The commit SHA and branch: `p2/t26-record-detail`, one commit on `52110318`.
- Files: 7 (the screen, the undo bar, `recordScreens.tsx`, the main render file, the receipt render file (new), `P2-T26.md` corrected, `P2-T26-fix.md` new); checksums: all seven equal `real/`.
- RED: `typecheck:app` 0; 7 of 39 failed, each on an `AssertionError`.
- GREEN: 39 of 39 (35 and 4).
- Mutants: 139 killed, 0 survived; every failing case an `AssertionError` (C1 by its suite failing to load).
- The gate: each command and its result, with no whole-suite count (R100).
- SKIPPED: Step 5's list.
- Deviations: none from the brief's rulings (or each, with why).
- For the reviewer, first: the frame and its branch (P24), the spoken words and the catalogue's table (P25), the guard on the phone's first answer (P26).

---

## Appendix: the diffs

Each block prints the file in `PL/diffs/`. The files there are the reference: a copy of this brief may have lost the single space that begins an empty context line. Copy the `real/` files as Steps 2 and 3 say; do not apply these.

{{APPENDIX}}
