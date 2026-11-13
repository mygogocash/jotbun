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

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26` (branch `p2/t26-record-detail`, head `52110318`, installed). Work only here. Do not merge the integration branch into it: the controller merges up.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix`, your scratch folder. Create it with `mkdir -p /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix`. Your logs, the mutant runs and the commit message go there. Never keep anything under `/private/tmp`.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix-planner`, the planner's folder. Read it and `cp` from it; never write into it. It holds:
  - `real/`: the round's seven files at their repo paths: the record screen, the undo bar, the catalogue's record stages (`recordScreens.tsx`), the main render file, the new receipt render file, `P2-T26.md` corrected and `P2-T26-fix.md` (new);
  - `orig/`: the five of them that `52110318` has, as it has them;
  - `diffs/`: one diff per file (`orig/` to `real/`, or nothing to `real/` for the two new files), with repo paths `a/<path>` and `b/<path>` and full blob ids, and `p2-t26-fix.patch`, the whole round. `PL/logs/applycheck.log` proves the patch turns `orig/` into `real/` byte for byte. The Appendix prints them;
  - `tools/`: `files.sh` (the file lists), `stage.py` (the planner's forms: base, RED, GREEN), `mutants.py` (the runner), `batches.txt`, `merge_mutants.py` (joins the runner's batches), `first_errors.py` (each failing case's error kind), `diffs.sh`, `diffcheck.sh`, `sums.sh`, `dryrun.py`, `fill_brief.py` and `brief.template.md` (how this brief was built: every diff below prints the `diffs/` file);
  - `SHA256SUMS` (the kit, 34 files; check it from PL) and `SHA256SUMS.logs` (the planner's `logs/`);
  - four lists to check WT with `shasum -a 256 -c`, paths relative to WT:
    - `SHA256SUMS.base-in-wt`: the 17 unchanged files the round's code and cases rely on, as `52110318` has them;
    - `SHA256SUMS.orig-in-wt`: the five files as `52110318` has them;
    - `SHA256SUMS.red-in-wt`: the five files as RED leaves them (the two render files from `real/`, the three code files as `52110318` has them);
    - `SHA256SUMS.real-in-wt`: the round's seven files in their final form.
  - There is no `stubs/`: RED needs no stub (P29). `tree/` is the planner's proof tree; it is not in `SHA256SUMS`, and you never use it.
- Every shell call starts in a fresh directory, so every command below is written with full paths. Type each exactly. Git: `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26 <command>`, one git command per call.
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

1. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26 status --short`. Expected: no output.
2. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26 rev-parse --short HEAD`. Expected: `52110318`. Then `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26 branch --show-current`. Expected: `p2/t26-record-detail`.
3. `mkdir -p /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix`
4. The kit, checked from PL: `cd /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix-planner && shasum -a 256 -c SHA256SUMS | grep -vc ': OK$'`. Expected: `0`. Then `cd /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix-planner && shasum -a 256 -c SHA256SUMS | grep -c ': OK$'`. Expected: `34`.
5. The base files:
   - `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26 && shasum -a 256 -c /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix-planner/SHA256SUMS.orig-in-wt`. Expected: five `OK` lines, exit 0.
   - `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26 && shasum -a 256 -c /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix-planner/SHA256SUMS.base-in-wt`. Expected: 17 `OK` lines, exit 0.
   - `ls /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26/apps/app/src/wallet/records/WalletRecordReceipt.render.test.tsx /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26/docs/implementation/receipts/P2-T26-fix.md`. Expected: two "No such file or directory" lines.
6. `ls /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26/node_modules/.package-lock.json`. Expected: the path is printed. Only if it is missing: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26 && npm ci --ignore-scripts --no-audit --no-fund > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/npm-ci.log 2>&1; echo $?`. Expected: 0.
7. The focused base:
   - `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26 && npm run typecheck:app > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/base-typecheck.log 2>&1; echo $?`. Expected: 0.
   - `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/records/WalletRecord.render.test.tsx src/wallet/records/WalletDeleted.render.test.tsx src/screens/redesign/RecordScreen.render.test.tsx src/screens/redesign/import/RecordReceipt.render.test.tsx > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/base-focused.log 2>&1; echo $?`. Expected: 0, `Test Files  4 passed (4)`, `Tests  153 passed (153)` (25, 15, 65 and 48).

   Compare with `PL/logs/fixer-dryrun/base-typecheck.log` and `base-focused.log`.

## Step 2: RED (the round's two render files over `52110318`'s code)

1. Copy the two render files:
   ```bash
   cp /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix-planner/real/apps/app/src/wallet/records/WalletRecord.render.test.tsx /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26/apps/app/src/wallet/records/WalletRecord.render.test.tsx
   cp /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix-planner/real/apps/app/src/wallet/records/WalletRecordReceipt.render.test.tsx /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26/apps/app/src/wallet/records/WalletRecordReceipt.render.test.tsx
   ```
   Then `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26 && shasum -a 256 -c /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix-planner/SHA256SUMS.red-in-wt`. Expected: five `OK` lines, exit 0.
2. The RED typecheck: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26 && npm run typecheck:app > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/red-typecheck.log 2>&1; echo $?`. Expected: 0.
3. `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/records/WalletRecord.render.test.tsx src/wallet/records/WalletRecordReceipt.render.test.tsx > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/red-render.log 2>&1; echo $?`. Expected:
   - exit 1, `Test Files  2 failed (2)`, `Tests  7 failed | 32 passed (39)`;
   - `python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix-planner/tools/first_errors.py /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/red-render.log` prints `red-render.log: 7 failing case(s): AssertionError` and `1 logs, 0 with a failing case that is not an AssertionError (or with none)`;
   - `grep -cE 'Cannot find module|Failed to resolve|SyntaxError|is not a function|TestingLibraryElementError|TypeError|ReferenceError|Not implemented' /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/red-render.log` gives 0;
   - `grep -c 'stderr |' /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/red-render.log` gives 0.

   The 7 failing cases, each on an `AssertionError` (the first failure of each):
   - main file, `ลบ deletes, and Undo restores with the version the delete returned`: `th light: its words, read: expected null to be 'ลบ ข้าวมันไก่ 50 บาท แล้ว'`
   - main file, `private mode hides the record's amount and the ghost, and draws none of the person's words`: `th light: no receipt section: expected [ <div dir="auto" …(1)></div> ] to have a length of +0 but got 1`
   - main file, `the undo bar drops the phone's first answer once the phone has told of a change (the reviews' n3 and n5)`: `a late no: no time under a screen reader: expected [ { run: [Function], …(1) } ] to have a length of +0 but got 1`
   - main file, `on iOS the page says its undo bar once, with the amount in words, and in private mode without one (R124)`: `th: expected [ 'ลบ ข้าวมันไก่ ฿50 แล้ว' ] to deeply equal [ 'ลบ ข้าวมันไก่ 50 บาท แล้ว' ]`
   - main file, `the catalogue draws the record, a draft, a deleted entry, the actions tray and the undo bar on their own fakes`: `th: the bar, read: expected null to be 'ลบ ข้าวมันไก่ 50 บาท แล้ว'`
   - receipt file, `private mode: a record that holds a receipt shows the section's frame, รูปใบเสร็จ ซ่อนอยู่, and fetches nothing`: `th light: the frame: expected [] to have a length of 1 but got +0`
   - receipt file, `private mode: a record with no receipt shows no receipt section, and nothing to attach`: `th: no record-receipt: expected [ <div …(3)>…(2)</div> ] to have a length of +0 but got 1`
4. The list, sorted: `grep -E '^ +× ' /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/red-render.log | sed -E 's/ [0-9]+ms$//' | sed -E 's/^ +× //' | LC_ALL=C sort > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/red-render.list`, then `diff /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix-planner/logs/red/red-render.list /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/red-render.list`. Expected: no output.

   Compare with `PL/logs/red/red-typecheck-app.log` and `PL/logs/red/red-render.log`.

## Step 3: GREEN

1. Copy the code and the receipts:
   ```bash
   cp /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix-planner/real/apps/app/src/wallet/records/WalletRecordScreen.tsx /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26/apps/app/src/wallet/records/WalletRecordScreen.tsx
   cp /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix-planner/real/apps/app/src/wallet/records/WalletUndoBar.tsx /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26/apps/app/src/wallet/records/WalletUndoBar.tsx
   cp /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix-planner/real/apps/app/src/dev/catalogue/wallet/recordScreens.tsx /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26/apps/app/src/dev/catalogue/wallet/recordScreens.tsx
   cp /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix-planner/real/docs/implementation/receipts/P2-T26.md /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26/docs/implementation/receipts/P2-T26.md
   cp /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix-planner/real/docs/implementation/receipts/P2-T26-fix.md /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26/docs/implementation/receipts/P2-T26-fix.md
   ```
   Then `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26 && shasum -a 256 -c /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix-planner/SHA256SUMS.real-in-wt`. Expected: seven `OK` lines, exit 0.
2. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26 status --short`. Expected: these seven lines, in any order, and nothing else:
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
4. `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26 && npm run typecheck:app > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/green-typecheck.log 2>&1; echo $?`. Expected: 0.
5. The round's two files: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/records/WalletRecord.render.test.tsx src/wallet/records/WalletRecordReceipt.render.test.tsx > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/green-render.log 2>&1; echo $?`. Expected: 0, `Test Files  2 passed (2)`, `Tests  39 passed (39)` (35 and 4), and `grep -c 'stderr |' /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/green-render.log` gives 0.

   Compare with `PL/logs/fixer-dryrun/green-typecheck.log` and `green-render.log`.

## Step 4: Mutation check

Run the 139 mutants in ten batches, one batch per call, each in the foreground (two to four minutes each; nothing else may run meanwhile). First `mkdir -p /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/mutant-batches`. Then, one at a time:

```bash
python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix-planner/tools/mutants.py /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26 /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/mutant-logs S1 S2 S3 S4 S5 S6 S7 S8 S9 S10 S11 S12 S13 S14 > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/mutant-batches/b01.out 2>&1; echo $?
python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix-planner/tools/mutants.py /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26 /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/mutant-logs S15 S16 S17 S18 S19 S20 S21 S22 S23 S24 S25 S26 S27 S28 > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/mutant-batches/b02.out 2>&1; echo $?
python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix-planner/tools/mutants.py /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26 /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/mutant-logs S29 S30 S31 S32 S33 S34 S35 S36 S37 S38 S39 S40 S41 S42 > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/mutant-batches/b03.out 2>&1; echo $?
python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix-planner/tools/mutants.py /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26 /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/mutant-logs S43 S44 S45 S46 S47 S48 S49 S50 S51 S52 S53 S54 S55 S56 > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/mutant-batches/b04.out 2>&1; echo $?
python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix-planner/tools/mutants.py /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26 /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/mutant-logs S57 S58 S59 S60 S61 S62 S63 S64 S65 S66 T1 T2 T3 T4 > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/mutant-batches/b05.out 2>&1; echo $?
python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix-planner/tools/mutants.py /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26 /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/mutant-logs T5 T6 T7 T8 T9 T10 T11 T12 T13 U1 U2 U3 U4 U5 > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/mutant-batches/b06.out 2>&1; echo $?
python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix-planner/tools/mutants.py /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26 /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/mutant-logs U6 U7 U8 U9 U10 U11 U12 U13 U14 U15 U16 K1 K2 C1 > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/mutant-batches/b07.out 2>&1; echo $?
python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix-planner/tools/mutants.py /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26 /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/mutant-logs C2 C3 C4 C5 R1 R2 R3 D1 F1 F2 F3 F4 F5 F6 > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/mutant-batches/b08.out 2>&1; echo $?
python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix-planner/tools/mutants.py /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26 /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/mutant-logs F7 F8 F9 F10 W1 W2 W3 W4 W5 W6 W7 G1 G2 G3 > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/mutant-batches/b09.out 2>&1; echo $?
python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix-planner/tools/mutants.py /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26 /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/mutant-logs M1 M2 M24 M24b M28 M28b M49 OM1 OM2 OM7 OM8 OM19 OM20 > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/mutant-batches/b10.out 2>&1; echo $?
```

Expected after each: 0, and `tail -1` of its file prints `14 killed, 0 survived, 0 not as expected` (batch 10: `13 killed, 0 survived, 0 not as expected`). After each batch, `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26 && shasum -a 256 -c /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix-planner/SHA256SUMS.real-in-wt` gives seven `OK` lines. If a call is cut short, a mutant may be left in a file: run that check, and if a file fails it, `cp` that file again from `PL/real/` as Step 3.1 does, check again, and rerun the whole batch.

Then join them: `python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix-planner/tools/merge_mutants.py /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix-planner/tools/mutants.py /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/mutant-batches /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/mutants.out; echo $?`. Expected: `139 lines; 139 killed, 0 survived, 0 not as expected` and `0`. Then `diff /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix-planner/logs/mutants.out /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/mutants.out`. Expected: no output. (If a line differs only in its counts, while still `KILLED` with only `AssertionError`s, record the line in your final message and go on.) Then `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26 && shasum -a 256 -c /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix-planner/SHA256SUMS.real-in-wt` again: seven `OK` lines. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26 status --short`: unchanged from Step 3.2.

The mutants, by group (the full lines are in `PL/logs/mutants.out`):
- S1 to S66, T1 to T13, U1 to U16, K1, K2, C1 to C5, R1 to R3 and D1: the first round's 106. S38, S64, U3, U4, U12 and U15 are re-pointed at the lines this round moves.
- F1 to F10, R123's frame, run against the receipt file: private mode mounting the panel, the frame with no receipt or with the area off, no frame, its words, how it is read, its card.
- W1 to W7, R124: the spoken amount, the page's and the catalogue's `spoken`, private mode's words, the label, and iOS.
- G1 to G3: the guard on the phone's first answer (P26).
- M1, M2, M24, M24b, M28, M28b, M49, OM1, OM2, OM7, OM8, OM19 and OM20: the reviews' pins (P27).

## Step 5: The fast local gate (R100)

In this order, each with its log in S:

1. `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26 && npm run typecheck:app > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/gate-1-typecheck.log 2>&1; echo $?`. Expected: 0.
2. The focused render files and today's three neighbours: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/records/WalletRecord.render.test.tsx src/wallet/records/WalletRecordReceipt.render.test.tsx src/wallet/records/WalletDeleted.render.test.tsx src/screens/redesign/RecordScreen.render.test.tsx src/screens/redesign/import/RecordReceipt.render.test.tsx > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/gate-2-focused.log 2>&1; echo $?`. Expected: 0, `Test Files  5 passed (5)`, `Tests  167 passed (167)` (35, 4, 15, 65 and 48: the last three as at the base), and `grep -c 'stderr |' /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/gate-2-focused.log` gives 0.
3. The four routes tests, each named: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26/apps/app && npx vitest run --config vitest.render.config.ts src/screens/redesign/SpendRoutes.render.test.tsx src/screens/redesign/account/AccountRoutes.render.test.tsx src/screens/redesign/insights/InsightsRoutes.render.test.tsx src/screens/redesign/planning/PlanningRoutes.render.test.tsx > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/gate-3-routes4.log 2>&1; echo $?`. Expected: 0, `Test Files  4 passed (4)`, `Tests  18 passed (18)`.
4. The eight kit render files, each named: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/card/CardStack.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/wallet/lock/Lock.render.test.tsx src/wallet/add/AmountStep.render.test.tsx src/wallet/wallets/WalletsList.render.test.tsx > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/gate-4-kit8.log 2>&1; echo $?`. Expected: 0, `Test Files  8 passed (8)`, `Tests  142 passed (142)`.
5. The record's sections and bw-deleted, in both catalogue suites: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "section bw-record|section bw-deleted" > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/gate-5-catalogue.log 2>&1; echo $?`. Expected: 0, `Test Files  2 passed (2)`, `Tests  12 passed | 672 skipped (684)`.
6. `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26 && npm run test:app > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/gate-6-test-app.log 2>&1; echo $?`. Expected: 0, `ℹ fail 0`. (No count is expected: CI holds the whole suites, R100.)
7. `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26 && npm run test:unit > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/gate-7-test-unit.log 2>&1; echo $?`. Expected: 0, `ℹ fail 0`.
8. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26 diff --check`. Expected: no output, exit 0. (After the commit, Step 7.5 checks the range.)

Compare with `PL/logs/fixer-dryrun/gate-*.log`. A case that times out near 5 s in a file this round does not touch is a load flake: rerun that file alone once, record both runs, and do not change it.

Not run, and why (the receipt says so): `typecheck:routes` and `export:web` (no route, config or app entry changes; CI runs `export:web`); the full render suite (CI, R100; its per-section jobs open the record's five sections); the iOS export (CI); `test:ops` (no package or lockfile change); the API, edge and database suites (nothing outside `apps/app` and the receipts changes; Docker is stopped); and the device checks, SKIPPED: VoiceOver and TalkBack reading the bar's words with the amount in words, the frame read as one in private mode, and the first round's list.

## Step 6: The receipts

The planner wrote both, and you copied them in Step 3.1 (P30). Check that they are unchanged:
`cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26 && shasum -a 256 docs/implementation/receipts/P2-T26.md docs/implementation/receipts/P2-T26-fix.md`. Expected: the same two sums as their lines in `PL/SHA256SUMS.real-in-wt`. Every number in `P2-T26-fix.md` is one of this brief's Expected lines or Scope counts, which your runs matched. Do not edit either file.

## Step 7: Commit

1. Stage the seven files:
   `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26 add apps/app/src/wallet/records/WalletRecordScreen.tsx apps/app/src/wallet/records/WalletUndoBar.tsx apps/app/src/dev/catalogue/wallet/recordScreens.tsx apps/app/src/wallet/records/WalletRecord.render.test.tsx apps/app/src/wallet/records/WalletRecordReceipt.render.test.tsx docs/implementation/receipts/P2-T26.md docs/implementation/receipts/P2-T26-fix.md`
2. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26 status --short`. Expected: five `M ` lines and two `A ` lines (the seven files), and nothing else: no log.
3. Write the message to `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/commit-message.txt`, exactly:
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
4. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26 commit -F /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix/commit-message.txt`, then `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26 log --oneline -2` (your commit on `52110318`) and `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26 show --stat HEAD` (7 files).
5. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26 diff --check origin/claude/p1a-vault-core...HEAD`. Expected: no output, exit 0.

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

`apps/app/src/wallet/records/WalletRecordScreen.tsx`:
```diff
diff --git a/apps/app/src/wallet/records/WalletRecordScreen.tsx b/apps/app/src/wallet/records/WalletRecordScreen.tsx
index e977458bd0ccd3b9928c38c368e621f7cef17605..c7886bc113a1e58cfe7b3fb6a9778e7da6629da5 100644
--- a/apps/app/src/wallet/records/WalletRecordScreen.tsx
+++ b/apps/app/src/wallet/records/WalletRecordScreen.tsx
@@ -24,7 +24,10 @@
 // - Private mode (W10, R114): every amount is ฿•••• (WalletAmount, the ghost)
 //   and the undo bar names the entry without one; no free text that quotes the
 //   person is drawn: the title is the category's name, never the merchant (Bun
-//   may have filled it), and a note says it is hidden.
+//   may have filled it), and a note says it is hidden. Today's receipt section
+//   is not mounted (R123): a slip shows amounts and names, so a record that
+//   holds one shows the section's frame and ซ่อนอยู่, and nothing is fetched.
+// - The undo bar's words are spoken with ฿ read as บาท (R124).
 // - This screen sends no event (R61): they sit in useRecordActions.
 import type { CategoryDto, Minor } from '@gogospend/contracts';
 import { useRef, useState } from 'react';
@@ -34,6 +37,7 @@ import { useSafeAreaInsets } from 'react-native-safe-area-context';
 import Svg, { Circle, Path } from 'react-native-svg';

 import { V1Error } from '@mobile/api/client';
+import { isRedesignEnabled } from '@mobile/config/featureFlags';
 import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
 import { LoadingBlock, Notice, useGoBack } from '@mobile/screens/redesign/HistoryParts';
 import { RecordReceipt } from '@mobile/screens/redesign/import/RecordReceipt';
@@ -63,7 +67,7 @@ import { MaterialFill } from '../looks/MaterialFill';
 import { CategoryGlyph, WalletCategoryIcon } from '../looks/WalletCategoryIcon';
 import { useWalletLooks } from '../looks/WalletLooksProvider';
 import { WalletAmount } from '../money/WalletAmount';
-import { HIDDEN_AMOUNT, walletMoneyText } from '../money/walletMoney';
+import { HIDDEN_AMOUNT, spokenMoney, walletMoneyText } from '../money/walletMoney';
 import type { MoneySign } from '../money/walletMoney';
 import { usePrivateMode } from '../privacy/PrivateModeProvider';
 import { PrimaryButton } from '../tray/PrimaryButton';
@@ -87,12 +91,20 @@ const leadingFor = (size: number, locale: string) => walletLineHeight(size, loca
 const valueOf = (detail: RecordDetail, key: ReceiptRowKey) => detail.rows.find((row) => row.key === key)?.value ?? null;

 /**
- * The words of the undo bar: the entry and its amount, or in private mode the
- * entry alone (as records.restoredHidden, R109). The bar is a live region, so
- * no amount may reach it while amounts are hidden.
+ * The words of the undo bar, drawn and spoken: the entry and its amount, with
+ * the spoken amount in words (฿ read as บาท, R124); or in private mode the
+ * entry alone, both alike (as records.restoredHidden, R109). The bar is a live
+ * region, so no amount may reach it while amounts are hidden.
  */
-export function deletedBarText(title: string, amountMinor: Minor, hidden: boolean, t: WalletT): string {
-  return hidden ? t('records.deletedBarHidden', { title }) : t('records.deletedBar', { title, amount: walletMoneyText(amountMinor) });
+export function deletedBarText(title: string, amountMinor: Minor, hidden: boolean, t: WalletT): { text: string; spoken: string } {
+  if (hidden) {
+    const words = t('records.deletedBarHidden', { title });
+    return { text: words, spoken: words };
+  }
+  return {
+    text: t('records.deletedBar', { title, amount: walletMoneyText(amountMinor) }),
+    spoken: t('records.deletedBar', { title, amount: spokenMoney(amountMinor, t) }),
+  };
 }

 /** What the page shows of one entry, confirmed or a draft. */
@@ -185,6 +197,26 @@ function WalletSwatch({ walletId }: { walletId: string }) {
   );
 }

+/**
+ * The receipt section while amounts are hidden (R123): its frame in the wallet
+ * look, a card of one fact, รูปใบเสร็จ and ซ่อนอยู่, read as one, as the note
+ * is. Today's panel is not mounted, so no grant, no download, no image, no
+ * open, and no Attach, Replace or Remove.
+ */
+function HiddenReceipt() {
+  const colors = useWalletColors();
+  const t = useDraftCopy(RECORD_COPY);
+  const tc = useCopy();
+  const words = t('records.noteHidden');
+  return (
+    <View testID="wallet-record-receipt-hidden" style={{ backgroundColor: colors.card, borderRadius: 20, overflow: 'hidden' }}>
+      <Fact label={tc('Receipt photo')} spoken={words} first>
+        <WalletText role="label" style={{ fontWeight: '400' }}>{words}</WalletText>
+      </Fact>
+    </View>
+  );
+}
+
 /** One of the page's 52 pt buttons: the main one, a quiet one or an outlined one. */
 function PageButton({ label, kind, onPress, disabled = false, grow, testID }: {
   label: string;
@@ -336,9 +368,11 @@ export function WalletRecordScreen({ id, mode = 'view', now }: WalletRecordScree
         </>
       );
       if (undoShown) {
+        const words = deletedBarText(title, shown.amountMinor, hidden, t);
         footer = (
           <WalletUndoBar
-            message={deletedBarText(title, shown.amountMinor, hidden, t)}
+            message={words.text}
+            spoken={words.spoken}
             onUndo={() => void restore(deleted)}
             onDismiss={() => setUndoGone(undoKey)}
           />
@@ -371,9 +405,15 @@ export function WalletRecordScreen({ id, mode = 'view', now }: WalletRecordScree
         <Notice tone="alert" message={notice ?? ''} action={pending === 'delete' ? { label: tc('Try again'), busy, onPress: () => void remove(record) } : undefined} />
       );
     } else {
+      // R123: while amounts are hidden today's panel is not mounted; a record that holds a receipt shows its frame.
+      const receiptHeld = Boolean(record.attachment_id);
       body = (
         <>
-          <RecordReceipt recordId={record.id} version={record.version} attachmentId={record.attachment_id ?? null} onChanged={() => void load()} />
+          {hidden ? (
+            receiptHeld && isRedesignEnabled('import') ? <HiddenReceipt /> : null
+          ) : (
+            <RecordReceipt recordId={record.id} version={record.version} attachmentId={record.attachment_id ?? null} onChanged={() => void load()} />
+          )}
           {notice ? <Notice tone="alert" message={notice} /> : null}
         </>
       );
```

`apps/app/src/wallet/records/WalletUndoBar.tsx`:
```diff
diff --git a/apps/app/src/wallet/records/WalletUndoBar.tsx b/apps/app/src/wallet/records/WalletUndoBar.tsx
index b69ea8cfa76a4921a8c1a5854b20d4e0e326e86e..5c4f9dc2dde8cc766570d48b1cd064182b2e7ff2 100644
--- a/apps/app/src/wallet/records/WalletUndoBar.tsx
+++ b/apps/app/src/wallet/records/WalletUndoBar.tsx
@@ -1,7 +1,9 @@
 // The Bun Wallet's undo bar (plan P2-T26, rh-undo): a toast on the `toast`
 // colour with a round trash mark, what just happened (the host's words, such
 // as records.deletedBar) and a 44 pt Undo pill. It is a polite live region,
-// said once on iOS, and never takes focus. It goes after
+// said once on iOS, and never takes focus. A host may give the words' spoken
+// form (`spoken`, R124: an amount read as บาท, not ฿): it labels the words and
+// is what iOS says. It goes after
 // motion.duration.toastLong (onDismiss), except while a screen reader runs or
 // before the phone has said whether one does: reaching Undo by swipe takes
 // longer, and an undo that times out under a screen reader fails WCAG 2.2.1,
@@ -20,7 +22,7 @@ import { COMMON_COPY } from '../common/copy';
 import { useDraftCopy } from '../copy/useDraftCopy';
 import { WalletText } from '../WalletText';

-export type WalletUndoBarProps = { message: string; onUndo(): void; onDismiss(): void };
+export type WalletUndoBarProps = { message: string; spoken?: string; onUndo(): void; onDismiss(): void };

 /** The mark's circle and the pill: the toast's words at 12%, as rh-undo's #2A2830 sits on #111014. */
 const ON_TOAST_FILL = 'rgba(255, 255, 255, 0.12)';
@@ -29,19 +31,31 @@ const ON_TOAST_FILL = 'rgba(255, 255, 255, 0.12)';
 function useScreenReaderRunning(): boolean | null {
   const [running, setRunning] = useState<boolean | null>(null);
   useEffect(() => {
+    // Once the phone has told of a change, its first answer is old news and is dropped (review n3, n5).
+    let changed = false;
     // A phone that cannot answer reads as no screen reader, as today's UndoBar does.
-    AccessibilityInfo.isScreenReaderEnabled().then(setRunning, () => setRunning(false));
-    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', (enabled: boolean) => setRunning(enabled));
+    AccessibilityInfo.isScreenReaderEnabled().then(
+      (enabled) => {
+        if (!changed) setRunning(enabled);
+      },
+      () => {
+        if (!changed) setRunning(false);
+      },
+    );
+    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', (enabled: boolean) => {
+      changed = true;
+      setRunning(enabled);
+    });
     return () => subscription.remove();
   }, []);
   return running;
 }

-export function WalletUndoBar({ message, onUndo, onDismiss }: WalletUndoBarProps) {
+export function WalletUndoBar({ message, spoken, onUndo, onDismiss }: WalletUndoBarProps) {
   const colors = useWalletColors();
   const t = useDraftCopy(COMMON_COPY);
   const screenReader = useScreenReaderRunning();
-  useAnnouncement(message);
+  useAnnouncement(spoken ?? message);

   // The latest onDismiss, so a host that draws again never restarts the time.
   const dismiss = useRef(onDismiss);
@@ -77,7 +91,7 @@ export function WalletUndoBar({ message, onUndo, onDismiss }: WalletUndoBarProps
         </Svg>
       </View>
       {/* Never clamped: at the largest text sizes the words wrap. */}
-      <WalletText role="label" tone="onToast" style={{ flex: 1, fontWeight: '400' }}>{message}</WalletText>
+      <WalletText role="label" tone="onToast" accessibilityLabel={spoken} style={{ flex: 1, fontWeight: '400' }}>{message}</WalletText>
       <Pressable
         accessibilityRole="button"
         accessibilityLabel={t('common.undo')}
```

`apps/app/src/dev/catalogue/wallet/recordScreens.tsx`:
```diff
diff --git a/apps/app/src/dev/catalogue/wallet/recordScreens.tsx b/apps/app/src/dev/catalogue/wallet/recordScreens.tsx
index 084d55524324967ca35c18d37650582572d4ac64..dc93f54f017fea8babe419194c70bff4e38c8aef 100644
--- a/apps/app/src/dev/catalogue/wallet/recordScreens.tsx
+++ b/apps/app/src/dev/catalogue/wallet/recordScreens.tsx
@@ -21,6 +21,7 @@ import { createFakeDiary } from '@mobile/spend/v1/testing/fakeDiary';
 import { BUILTINS, createFakeResources } from '@mobile/spend/v1/testing/fakeResources';
 import type { PendingEntry } from '@mobile/storage/types';
 import { BUN_SPACE } from '@mobile/ui/layout';
+import { COMMON_COPY } from '@mobile/wallet/common/copy';
 import type { DraftTable } from '@mobile/wallet/copy/draftText';
 import { useDraftCopy } from '@mobile/wallet/copy/useDraftCopy';
 import { WalletCategoryIcon } from '@mobile/wallet/looks/WalletCategoryIcon';
@@ -72,6 +73,7 @@ function onThisPhone(): ScreenFixture {
 }

 const SAMPLES = {
+  ...COMMON_COPY,
   ...COPY,
   'sample.open': { th: 'เปิดถาด', en: 'Open the tray' },
   'sample.chickenRice': { th: 'ข้าวมันไก่', en: 'Chicken rice' },
@@ -108,10 +110,12 @@ function ActionsTraySection() {
 function UndoBarSection() {
   const t = useDraftCopy(SAMPLES);
   const { hidden } = usePrivateMode();
+  // Drawn and spoken (R124): the spoken amount needs common.baht, so SAMPLES carries COMMON_COPY.
+  const words = deletedBarText(t('sample.chickenRice'), '5000', hidden, t);
   return (
     <View style={{ flex: 1, gap: BUN_SPACE.md, padding: BUN_SPACE.md, justifyContent: 'space-between' }}>
       <SpecimenLabel>{t('sample.undo')}</SpecimenLabel>
-      <WalletUndoBar message={deletedBarText(t('sample.chickenRice'), '5000', hidden, t)} onUndo={() => undefined} onDismiss={() => undefined} />
+      <WalletUndoBar message={words.text} spoken={words.spoken} onUndo={() => undefined} onDismiss={() => undefined} />
     </View>
   );
 }
```

`apps/app/src/wallet/records/WalletRecord.render.test.tsx`:
```diff
diff --git a/apps/app/src/wallet/records/WalletRecord.render.test.tsx b/apps/app/src/wallet/records/WalletRecord.render.test.tsx
index acfc6f7cf33e047260da03ed76e7f450ef9fc029..eb92a52511e9648ad6bb26e4bb66169f178937bb 100644
--- a/apps/app/src/wallet/records/WalletRecord.render.test.tsx
+++ b/apps/app/src/wallet/records/WalletRecord.render.test.tsx
@@ -21,6 +21,14 @@
 // a button that says what it was given, as RecordReceiptReload.render.test.tsx
 // does for today's record. Every lookup asserts one match, so a missing
 // element fails on an AssertionError.
+//
+// The fix round (R123, R124 and the reviews' pins): the undo bar's words are
+// read, and said on iOS, with the amount in words; in private mode today's
+// receipt section is not mounted (its real panel runs in
+// WalletRecordReceipt.render.test.tsx). A refused delete, a failed draft
+// Remove or Discard, a draft at the largest size, the tray's Close, Back, a
+// second delete's bar, the Undo pill's fill, the art that is never read, and a
+// screen-reader change before the phone's first answer each have a case.
 import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
 import { AccessibilityInfo, Platform } from 'react-native';
 import { afterEach, beforeEach, expect, test, vi } from 'vitest';
@@ -165,6 +173,7 @@ const WORDS = {
     baht: '50 บาท', pay: '28,000 บาท', hidden: 'ซ่อนยอดเงินอยู่', noteHidden: 'ซ่อนอยู่', today: 'วันนี้',
     editRow: 'แก้ไข ยอด หมวด กระเป๋า วันที่ หรือโน้ต', copyRow: (amount: string) => `ทำซ้ำ จดใหม่เป็นของวันนี้ ${amount}`, deleteRow: 'ลบ กู้คืนได้ภายใน 30 วัน',
     deletedBar: 'ลบ ข้าวมันไก่ ฿50 แล้ว', deletedBarHidden: 'ลบ อาหาร แล้ว', daysLeft: 'เหลือ 30 วัน', lastDay: 'วันสุดท้ายที่กู้คืนได้',
+    deletedBarSpoken: 'ลบ ข้าวมันไก่ 50 บาท แล้ว',
   },
   en: {
     edit: 'Edit', copyToday: 'Again today', delete: 'Delete', more: 'More options', back: 'Back', close: 'Close', undo: 'Undo',
@@ -172,6 +181,7 @@ const WORDS = {
     baht: '50 baht', pay: '28,000 baht', hidden: 'Amount hidden', noteHidden: 'Hidden', today: 'Today',
     editRow: 'Edit Amount, category, wallet, date or note', copyRow: (amount: string) => `Log it again A new entry for today ${amount}`, deleteRow: 'Delete You can restore it for 30 days',
     deletedBar: 'Deleted ข้าวมันไก่ ฿50', deletedBarHidden: 'Deleted Food', daysLeft: '30 days left', lastDay: 'Last day to restore',
+    deletedBarSpoken: 'Deleted ข้าวมันไก่ 50 baht',
   },
 } as const;

@@ -182,6 +192,10 @@ const NOT_CONFIRMED = 'Not confirmed yet. Your entry is kept; try again.';
 const LAZY = 10_000;
 /** The saved check on the status row (§5.3: neutral). */
 const CHECK = 'path[d="M5 12.5l4.5 4.5L19 7.5"]';
+/** The undo bar's pill and its mark's circle: the toast's words at 12%. */
+const ON_TOAST_FILL = 'rgba(255, 255, 255, 0.12)';
+/** An amount, drawn or in words. */
+const AMOUNT = /฿\s*\d|\d\s*(บาท|baht)/;

 // Every lookup takes the queryAll form and asserts one match, so a missing or doubled element fails on an
 // AssertionError, never a TestingLibraryElementError (a closing tray's Modal stays in the DOM for its exit).
@@ -378,6 +392,8 @@ test('ลบ deletes, and Undo restores with the version the delete returned', a
       const bar = await findFound('wallet-undo-bar');
       expect([bar.getAttribute('role'), bar.getAttribute('aria-live'), bar.style.backgroundColor], `${locale} ${mode}: the bar`).toEqual(['status', 'polite', rgba(colors.toast)]);
       expect(shown(words.deletedBar, bar).style.color, `${locale} ${mode}: its words`).toBe(rgba(colors.onToast));
+      // Read with the amount in words: ฿ is read as บาท (R124).
+      expect(shown(words.deletedBar, bar).getAttribute('aria-label'), `${locale} ${mode}: its words, read`).toBe(words.deletedBarSpoken);
       expect(fake.callsOf('deleteTransaction'), `${locale} ${mode}: one delete`).toHaveLength(1);
       const [removal] = fake.callsOf('deleteTransaction');
       expect(removal.args.slice(0, 2), `${locale} ${mode}: the delete`).toEqual([LUNCH.id, 3]);
@@ -509,6 +525,8 @@ test("private mode hides the record's amount and the ghost, and draws none of th
       const facts = found('wallet-record-facts');
       expect(facts.textContent, `${locale} ${mode}: the note`).toContain(`${words.note}${words.noteHidden}`);
       expect(facts.querySelectorAll(`[aria-label="${words.note} ${words.noteHidden}"]`), `${locale} ${mode}: the note, read`).toHaveLength(1);
+      // Today's receipt section is not mounted while amounts are hidden (R123; the real panel's cases are in WalletRecordReceipt.render.test.tsx).
+      expect(screen.queryAllByText(/^receipt of /), `${locale} ${mode}: no receipt section`).toHaveLength(0);
       const tray = await openActions(locale, words.food);
       named('button', words.copyRow(words.hidden), tray);
       for (const text of [document.body.textContent ?? '', mounted.container.textContent ?? '']) {
@@ -519,8 +537,10 @@ test("private mode hides the record's amount and the ghost, and draws none of th
       // A delete's undo bar names the entry without its amount, on screen and in every live region.
       tap(named('button', words.deleteRow, tray));
       const bar = await findFound('wallet-undo-bar');
-      shown(words.deletedBarHidden, bar);
+      expect(shown(words.deletedBarHidden, bar).getAttribute('aria-label'), `${locale} ${mode}: its words, read`).toBe(words.deletedBarHidden);
       for (const region of liveRegions(mounted.container)) expect(region.textContent, `${locale} ${mode}: a live region`).not.toMatch(/฿\s*\d|50/);
+      // Nothing labelled carries an amount, drawn or in words.
+      for (const labelled of document.querySelectorAll('[aria-label]')) expect(labelled.getAttribute('aria-label'), `${locale} ${mode}: a label`).not.toMatch(AMOUNT);
       cleanup();
     }
   }
@@ -704,6 +724,9 @@ test('the undo bar: a 44 pt Undo on the toast colour, gone after toastLong, but
       expect([bar.getAttribute('role'), bar.getAttribute('aria-live'), bar.style.backgroundColor], `${locale} ${mode}`).toEqual(['status', 'polite', rgba(colors.toast)]);
       const undo = named('button', words.undo, bar);
       expect(undo.style.minHeight, `${locale} ${mode}: 44 pt`).toBe('44px');
+      // The pill and the mark's circle (the bar's first art): the toast's words at 12%.
+      const mark = bar.querySelector<HTMLElement>('[aria-hidden="true"]');
+      expect([undo.style.backgroundColor, mark?.style.backgroundColor], `${locale} ${mode}: the fills`).toEqual([ON_TOAST_FILL, ON_TOAST_FILL]);
       expect(shown(words.undo, undo).style.color, `${locale} ${mode}: its words`).toBe(rgba(colors.onToast));
       const dismissals = barTimers(timers);
       expect(dismissals, `${locale} ${mode}: toastLong`).toHaveLength(1);
@@ -758,6 +781,36 @@ test("the undo bar's time follows the phone: no answer counts as no screen reade
   expect(removed.filter((name) => name === 'screenReaderChanged'), 'the listener goes with the bar').toHaveLength(1);
 });

+test("the undo bar drops the phone's first answer once the phone has told of a change (the reviews' n3 and n5)", async () => {
+  for (const fails of [false, true]) {
+    const label = fails ? 'an answer that failed' : 'a late no';
+    const handlers: Record<string, (value: boolean) => void> = {};
+    vi.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((name: string, handler: (value: boolean) => void) => {
+      handlers[name] = handler;
+      return { remove: () => undefined };
+    }) as never);
+    const answer: { give: (on: boolean) => void; fail: (error: Error) => void } = { give: () => undefined, fail: () => undefined };
+    vi.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockImplementation(() => new Promise<boolean>((resolve, reject) => {
+      answer.give = resolve;
+      answer.fail = reject;
+    }));
+    const timers = vi.spyOn(globalThis, 'setTimeout');
+    mountWallet(<WalletUndoBar message={WORDS.th.deletedBar} onUndo={vi.fn()} onDismiss={vi.fn()} />);
+    await settle();
+    // A screen reader turned on before the first answer lands: that answer is old news.
+    expect(handlers.screenReaderChanged, `${label}: a listener`).toBeTypeOf('function');
+    act(() => handlers.screenReaderChanged(true));
+    await act(async () => {
+      if (fails) answer.fail(new Error('no answer'));
+      else answer.give(false);
+    });
+    await settle();
+    expect(barTimers(timers), `${label}: no time under a screen reader`).toHaveLength(0);
+    cleanup();
+    vi.restoreAllMocks();
+  }
+});
+
 test('the undo bar says its words once on iOS', async () => {
   const view = mountWallet(<WalletUndoBar message={WORDS.en.deletedBar} onUndo={vi.fn()} onDismiss={vi.fn()} />);
   await settle();
@@ -770,6 +823,28 @@ test('the undo bar says its words once on iOS', async () => {
   expect(said.mock.calls.map(([text]) => text)).toEqual([WORDS.th.deletedBar]);
 });

+test('on iOS the page says its undo bar once, with the amount in words, and in private mode without one (R124)', async () => {
+  for (const locale of LOCALES) {
+    for (const hidden of [false, true]) {
+      const label = `${locale}${hidden ? ' private' : ''}`;
+      const words = WORDS[locale];
+      mount({ locale, device: hidden ? PRIVATE : {} });
+      await findNamed('button', words.delete);
+      await settle();
+      // iOS from here on (the app's providers have read the web's settings).
+      Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true, writable: true });
+      const said = vi.spyOn(AccessibilityInfo, 'announceForAccessibility');
+      tap(named('button', words.delete));
+      await findFound('wallet-undo-bar');
+      await settle();
+      expect(said.mock.calls.map(([text]) => text), label).toEqual([hidden ? words.deletedBarHidden : words.deletedBarSpoken]);
+      cleanup();
+      Object.defineProperty(Platform, 'OS', { value: os, configurable: true, writable: true });
+      vi.restoreAllMocks();
+    }
+  }
+});
+
 test('a record deleted elsewhere says so, counts its days and restores with its own version', async () => {
   for (const locale of LOCALES) {
     const words = WORDS[locale];
@@ -889,6 +964,143 @@ test('at the largest text size the three buttons stack and nothing is clamped',
   }
 });

+// ---------------------------------------------------------------------------
+// The reviews' pins (the fix round): behaviour that was right, now held
+
+test('a new delete after an undo whose bar ran out is a new bar (Opus m2)', async () => {
+  screenReader(false);
+  const timers = vi.spyOn(globalThis, 'setTimeout');
+  const { fake } = mount();
+  tap(await findNamed('button', WORDS.th.delete));
+  const bar = await findFound('wallet-undo-bar');
+  await settle();
+  const release = fake.hold('restoreTransaction');
+  tap(named('button', WORDS.th.undo, bar));
+  const first = barTimers(timers);
+  expect(first, "the first bar's time").toHaveLength(1);
+  act(() => first[0].run());
+  await act(async () => { release(); });
+  await findNamed('button', WORDS.th.edit);
+  // Live again: deleted once more, with the version the undo returned.
+  tap(named('button', WORDS.th.delete));
+  await findFound('wallet-undo-bar');
+  expect(fake.callsOf('deleteTransaction').map((call) => call.args[1]), 'the versions').toEqual([3, 5]);
+  expect(screen.queryAllByText(tc('Entry deleted', 'th')), 'not gone yet').toHaveLength(0);
+});
+
+test("the actions tray's Close closes it (Opus m3)", async () => {
+  for (const locale of LOCALES) {
+    mount({ locale });
+    const tray = await openActions(locale);
+    tap(named('button', WORDS[locale].close, tray));
+    await wait(300);
+    expect(screen.queryAllByRole('dialog', { name: 'ข้าวมันไก่' }), `${locale}: the tray has gone`).toHaveLength(0);
+    named('button', WORDS[locale].more);
+    cleanup();
+  }
+});
+
+test('Back goes back, or to History when there is nowhere to go back to (Opus n1)', async () => {
+  mount();
+  tap(await findNamed('button', WORDS.th.back));
+  expect([router.back.mock.calls.length, router.replace.mock.calls.length], 'back').toEqual([1, 0]);
+  cleanup();
+  router.canGoBack.mockReturnValue(false);
+  mount();
+  tap(await findNamed('button', WORDS.th.back));
+  expect([router.back.mock.calls.length, router.replace.mock.calls], 'to History').toEqual([1, [['/spend/all']]]);
+});
+
+/** A delete refused for good, and today's words for it. */
+const REFUSALS = [
+  ['conflict', 'This entry changed on another device.'],
+  ['deleted', 'This entry was already deleted.'],
+  ['not_found', 'This entry was already deleted.'],
+  ['invalid', 'This entry could not be saved.'],
+] as const;
+
+test('a refused delete says why, sends once, reads the record again and keeps the page live (Sonnet m1)', async () => {
+  for (const locale of LOCALES) {
+    const words = WORDS[locale];
+    for (const [outcome, english] of REFUSALS) {
+      const label = `${locale} ${outcome}`;
+      const { fake } = mount({ locale });
+      fake.fail('deleteTransaction', outcome);
+      tap(await findNamed('button', words.delete));
+      await findShown(tc(english, locale));
+      await settle();
+      expect(screen.queryAllByTestId('wallet-undo-bar'), `${label}: no undo bar`).toHaveLength(0);
+      expect([fake.callsOf('deleteTransaction').length, fake.callsOf('transaction').length], `${label}: one send, two reads`).toEqual([1, 2]);
+      for (const name of [words.edit, words.copyToday, words.delete, words.more]) named('button', name);
+      cleanup();
+    }
+  }
+});
+
+test('the same refusal from the actions tray: the tray goes and the page says why (Sonnet m1)', async () => {
+  for (const [outcome, english] of REFUSALS) {
+    const { fake } = mount();
+    fake.fail('deleteTransaction', outcome);
+    const tray = await openActions('th');
+    tap(named('button', WORDS.th.deleteRow, tray));
+    await findShown(tc(english, 'th'));
+    await wait(300);
+    expect(screen.queryAllByRole('dialog', { name: 'ข้าวมันไก่' }), `${outcome}: the tray has gone`).toHaveLength(0);
+    expect(screen.queryAllByTestId('wallet-undo-bar'), `${outcome}: no undo bar`).toHaveLength(0);
+    expect(fake.callsOf('deleteTransaction'), `${outcome}: one send`).toHaveLength(1);
+    named('button', WORDS.th.edit);
+    cleanup();
+  }
+});
+
+test("a draft whose Remove or Discard fails says so and stays (Sonnet m1)", async () => {
+  for (const locale of LOCALES) {
+    const unsent = draft('unsent', 5);
+    const review = draft('needs_review', 6);
+    const diary = createFakeDiary({ wallets: WALLETS, categories: BUILTINS, outbox: [unsent, review] });
+    diary.diary.removeDraft = async () => { throw new Error('disk'); };
+    diary.diary.discardDraft = async () => { throw new Error('disk'); };
+    const failed = tc("Couldn't change this device's copy. Try again.", locale);
+    mount({ locale, id: unsent.payload.id, diary: diary.diary });
+    tap(await findNamed('button', tc('Remove', locale)));
+    await findShown(failed);
+    expect(router.back, `${locale}: stays after a failed remove`).not.toHaveBeenCalled();
+    named('button', tc('Remove', locale));
+    cleanup();
+    mount({ locale, id: review.payload.id, diary: diary.diary });
+    tap(await findNamed('button', tc('Discard', locale)));
+    await findShown(failed);
+    expect(router.back, `${locale}: stays after a failed discard`).not.toHaveBeenCalled();
+    named('button', tc('Discard', locale));
+    cleanup();
+  }
+});
+
+test("a draft's buttons stack at the largest text size too (Sonnet m1)", async () => {
+  for (const locale of LOCALES) {
+    const unsent = draft('unsent', 7);
+    const diary = createFakeDiary({ wallets: WALLETS, categories: BUILTINS, outbox: [unsent] });
+    const names = [WORDS[locale].copyToday, tc('Remove', locale)];
+    mount({ locale, id: unsent.payload.id, diary: diary.diary, fontScale: AX5 });
+    await findNamed('button', tc('Remove', locale));
+    expect(found('wallet-record-actions').style.flexDirection, `${locale}: stacked`).toBe('column');
+    expect(names.map((name) => named('button', name).style.flexGrow), `${locale}: no grow`).toEqual(['', '']);
+    cleanup();
+    mount({ locale, id: unsent.payload.id, diary: diary.diary });
+    await findNamed('button', tc('Remove', locale));
+    expect(found('wallet-record-actions').style.flexDirection, `${locale}: a row`).toBe('row');
+    expect(names.map((name) => named('button', name).style.flexGrow), `${locale}: they share the row`).toEqual(['1', '1']);
+    cleanup();
+  }
+});
+
+test("the tile and the wallet's swatch are art, never read (Sonnet n2)", async () => {
+  mount();
+  await findNamed('button', WORDS.th.edit);
+  await settle();
+  expect(['wallet-record-tile', 'wallet-record-swatch'].map((testID) => found(testID).getAttribute('aria-hidden'))).toEqual(['true', 'true']);
+});
+
 test('the catalogue draws the record, a draft, a deleted entry, the actions tray and the undo bar on their own fakes', async () => {
   const ids = WALLET_SECTIONS.map((section) => section.id);
   const at = ids.indexOf('bw-deleted');
@@ -932,11 +1144,14 @@ test('the catalogue draws the record, a draft, a deleted entry, the actions tray
     cleanup();
     mountWallet(<>{section('bw-record-undo').render()}</>, { locale });
     const bar = await findFound('wallet-undo-bar', LAZY);
-    shown(locale === 'th' ? 'ลบ ข้าวมันไก่ ฿50 แล้ว' : 'Deleted Chicken rice ฿50', bar);
+    // Read with the amount in words (R124).
+    const read = shown(locale === 'th' ? 'ลบ ข้าวมันไก่ ฿50 แล้ว' : 'Deleted Chicken rice ฿50', bar).getAttribute('aria-label');
+    expect(read, `${locale}: the bar, read`).toBe(locale === 'th' ? 'ลบ ข้าวมันไก่ 50 บาท แล้ว' : 'Deleted Chicken rice 50 baht');
     cleanup();
-    // In private mode, the screen's words without the amount.
+    // In private mode, the screen's words without the amount, drawn and read.
     mountWallet(<>{section('bw-record-undo').render()}</>, { locale, device: PRIVATE });
-    shown(locale === 'th' ? 'ลบ ข้าวมันไก่ แล้ว' : 'Deleted Chicken rice', await findFound('wallet-undo-bar', LAZY));
+    const hiddenWords = locale === 'th' ? 'ลบ ข้าวมันไก่ แล้ว' : 'Deleted Chicken rice';
+    expect(shown(hiddenWords, await findFound('wallet-undo-bar', LAZY)).getAttribute('aria-label'), `${locale}: private, read`).toBe(hiddenWords);
     cleanup();
   }
 }, 30_000);
```

`apps/app/src/wallet/records/WalletRecordReceipt.render.test.tsx`:
```diff
diff --git a/apps/app/src/wallet/records/WalletRecordReceipt.render.test.tsx b/apps/app/src/wallet/records/WalletRecordReceipt.render.test.tsx
new file mode 100644
index 0000000000000000000000000000000000000000..4d1cf5ee8883877e291b61c496067b1d4544545a
--- /dev/null
+++ b/apps/app/src/wallet/records/WalletRecordReceipt.render.test.tsx
@@ -0,0 +1,171 @@
+// The Bun Wallet's record and today's receipt section in private mode (plan
+// P2-T26, ruling R123): while amounts are hidden the page does not mount
+// today's panel (RecordReceipt) at all, so no photo is granted, downloaded,
+// drawn or opened, and Attach, Replace and Remove wait. A record that holds a
+// receipt shows the section's frame in the wallet look instead: a card of one
+// fact, รูปใบเสร็จ ซ่อนอยู่, read as one, as the note is. A record with no
+// receipt shows nothing while hidden. With private mode off, today's panel as
+// before; with the import area off, neither. The real panel runs here, on the
+// fake attachments: WalletRecord.render.test.tsx stands it in, module-wide.
+// Every lookup asserts its count, so a missing or extra element fails on an
+// AssertionError.
+import { act, cleanup, screen, waitFor } from '@testing-library/react';
+import { afterEach, beforeEach, expect, test, vi } from 'vitest';
+
+vi.mock('expo-router', () => import('../../dev/catalogue/routerTestStub'));
+vi.mock('expo-router/build/Route', () => import('../../dev/catalogue/routerTestStub'));
+vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
+vi.mock('react-native-safe-area-context', () => import('../../dev/catalogue/safeAreaTestStub'));
+vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));
+vi.mock('@mobile/lib/hapticMoment', () => ({ playHaptic: vi.fn() }));
+
+import type { CategoryDto, TransactionDto, WalletSnapshot } from '@gogospend/contracts';
+import { rgba } from '@mobile/dev/catalogue/catalogueTestHarness';
+import { translateCopy } from '@mobile/i18n/messages';
+import { ReceiptPortsProvider } from '@mobile/screens/redesign/import/ReceiptParts';
+import type { ReceiptPorts } from '@mobile/screens/redesign/import/ReceiptParts';
+import { createFakeAttachments } from '@mobile/spend/v1/testing/fakeAttachments';
+import { BUILTINS, createFakeResources } from '@mobile/spend/v1/testing/fakeResources';
+import { walletDark, walletLight } from '@mobile/theme/walletPalette';
+import { PRIVATE_MODE_NAME } from '../privacy/PrivateModeProvider';
+import { mountWallet } from '../testing/walletHarness';
+import { WalletRecordScreen } from './WalletRecordScreen';
+
+const ENV = process.env.EXPO_PUBLIC_REDESIGN;
+beforeEach(() => {
+  // The import area is approved: on unless switched off.
+  delete process.env.EXPO_PUBLIC_REDESIGN;
+});
+afterEach(() => {
+  cleanup();
+  vi.restoreAllMocks();
+  if (ENV === undefined) delete process.env.EXPO_PUBLIC_REDESIGN;
+  else process.env.EXPO_PUBLIC_REDESIGN = ENV;
+});
+
+const LOCALES = ['th', 'en'] as const;
+const MODES = ['light', 'dark'] as const;
+const PALETTE = { light: walletLight, dark: walletDark } as const;
+type Locale = (typeof LOCALES)[number];
+
+/** Saturday 24 October 2026, 10:00 in Bangkok: bw-record's day. */
+const NOW = new Date('2026-10-24T03:00:00Z');
+const MAIN: WalletSnapshot = { id: '0000000a-0000-4000-8000-000000000801', name: 'บัญชีหลัก', currency: 'THB', opening_minor: '0', tracking_start: '2026-01-01', archived: false, version: 1 };
+const [FOOD] = BUILTINS as [CategoryDto];
+/** bw-record's entry: ฿50.00 of chicken rice from the main account, with its note. */
+const LUNCH = {
+  id: '0000000b-0000-4000-8000-000000000801', type: 'expense', amount_minor: '5000', occurred_on: '2026-10-24', wallet_id: MAIN.id,
+  category_id: FOOD.id, merchant: 'ข้าวมันไก่', note: 'กับเพื่อนที่ออฟฟิศ', deleted_at: null, version: 3,
+} as TransactionDto;
+
+/** The draft tables' words (Thai first); today's panel's come through the catalogs. */
+const WORDS = {
+  th: { food: 'อาหาร', noteHidden: 'ซ่อนอยู่' },
+  en: { food: 'Food', noteHidden: 'Hidden' },
+} as const;
+const tc = (english: string, locale: Locale) => translateCopy(english, locale);
+/** Today's panel's buttons: none of them while amounts are hidden. */
+const PANEL_BUTTONS = ['Attach a receipt photo', 'Replace photo', 'Remove photo', 'Open the receipt photo'];
+/** Today's panel's parts: its card, the thumbnail and its image, the viewer and its image. */
+const PANEL_PARTS = ['record-receipt', 'receipt-thumbnail', 'receipt-thumbnail-image', 'receipt-viewer', 'receipt-full-image'];
+
+/** Lets the stores, the phone's answers and the panel's reads arrive. */
+const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
+
+type Mount = { hidden: boolean; receipt?: boolean; locale?: Locale; mode?: 'light' | 'dark' };
+
+/** The record screen with the real panel, on a record that holds a receipt unless `receipt` is false. */
+function mount({ hidden, receipt = true, locale = 'th', mode = 'light' }: Mount) {
+  const fake = createFakeResources({ wallets: [MAIN], categories: BUILTINS, records: [LUNCH] });
+  const files = createFakeAttachments({ records: fake.records });
+  if (receipt) files.seedReceipt(LUNCH.id);
+  const ports: Partial<ReceiptPorts> = {
+    attachments: files.attachments, uploads: files.uploads, picker: files.picker, now: files.now,
+    sleep: async () => {}, pollMs: 0, maxPolls: 5, newId: () => globalThis.crypto.randomUUID(),
+  };
+  mountWallet(
+    <ReceiptPortsProvider ports={ports}><WalletRecordScreen id={LUNCH.id} now={NOW} /></ReceiptPortsProvider>,
+    { resources: fake.resources, locale, mode, device: hidden ? { [PRIVATE_MODE_NAME]: '1' } : {} },
+  );
+  return { files };
+}
+
+/** Waits for the page's title (the category's name while hidden, R114), then lets the reads land. */
+async function ready(title: string) {
+  await waitFor(() => expect(screen.queryAllByRole('heading', { name: title }), `the title ${title}`).toHaveLength(1));
+  await settle();
+  await settle();
+}
+
+/** Nothing of today's panel: no part, no button, no image and no photo's bytes anywhere. */
+function noPanel(locale: Locale, label: string) {
+  for (const part of PANEL_PARTS) expect(screen.queryAllByTestId(part), `${label}: no ${part}`).toHaveLength(0);
+  for (const name of PANEL_BUTTONS) expect(screen.queryAllByRole('button', { name: tc(name, locale) }), `${label}: no ${name}`).toHaveLength(0);
+  expect(document.querySelectorAll('img'), `${label}: no image`).toHaveLength(0);
+  expect(document.body.innerHTML, `${label}: no photo's bytes`).not.toContain('data:image');
+}
+
+test("private mode: a record that holds a receipt shows the section's frame, รูปใบเสร็จ ซ่อนอยู่, and fetches nothing", async () => {
+  for (const locale of LOCALES) {
+    for (const mode of MODES) {
+      const label = `${locale} ${mode}`;
+      const words = WORDS[locale];
+      const { files } = mount({ hidden: true, locale, mode });
+      await ready(words.food);
+      const frames = screen.queryAllByTestId('wallet-record-receipt-hidden');
+      expect(frames, `${label}: the frame`).toHaveLength(1);
+      const frame = frames[0] as HTMLElement;
+      const heading = tc('Receipt photo', locale);
+      expect(frame.textContent, `${label}: its words`).toBe(`${heading}${words.noteHidden}`);
+      // Read as one, as the note is.
+      expect([...frame.querySelectorAll('[aria-label]')].map((row) => row.getAttribute('aria-label')), `${label}: read as`).toEqual([`${heading} ${words.noteHidden}`]);
+      // The wallet look: a card, as the facts are.
+      expect(frame.style.backgroundColor, `${label}: the card`).toBe(rgba(PALETTE[mode].card));
+      noPanel(locale, label);
+      // Nothing fetched: no grant and no download, so no slip reaches the phone while amounts are hidden.
+      expect([files.callsOf('grant').length, files.callsOf('file').length], `${label}: nothing granted or downloaded`).toEqual([0, 0]);
+      cleanup();
+    }
+  }
+});
+
+test('private mode: a record with no receipt shows no receipt section, and nothing to attach', async () => {
+  for (const locale of LOCALES) {
+    const { files } = mount({ hidden: true, receipt: false, locale });
+    await ready(WORDS[locale].food);
+    expect(screen.queryAllByTestId('wallet-record-receipt-hidden'), `${locale}: no frame`).toHaveLength(0);
+    noPanel(locale, locale);
+    expect(files.callsOf('grant'), `${locale}: nothing granted`).toHaveLength(0);
+    cleanup();
+  }
+});
+
+test("with private mode off, today's panel as before: the photo, granted once, and no frame", async () => {
+  for (const locale of LOCALES) {
+    const { files } = mount({ hidden: false, locale });
+    await ready('ข้าวมันไก่');
+    await waitFor(() => expect(screen.queryAllByTestId('receipt-thumbnail-image'), `${locale}: the thumbnail`).toHaveLength(1));
+    expect(screen.queryAllByRole('button', { name: tc('Open the receipt photo', locale) }), `${locale}: open`).toHaveLength(1);
+    expect(screen.queryAllByTestId('wallet-record-receipt-hidden'), `${locale}: no frame`).toHaveLength(0);
+    expect(files.callsOf('grant'), `${locale}: one grant`).toHaveLength(1);
+    cleanup();
+  }
+  // With no receipt, today's Attach.
+  mount({ hidden: false, receipt: false });
+  await ready('ข้าวมันไก่');
+  await waitFor(() => expect(screen.queryAllByRole('button', { name: tc('Attach a receipt photo', 'th') }), 'attach').toHaveLength(1));
+  expect(screen.queryAllByTestId('wallet-record-receipt-hidden'), 'no frame').toHaveLength(0);
+});
+
+test('with the import area off, neither the frame nor the panel, private mode on or off', async () => {
+  process.env.EXPO_PUBLIC_REDESIGN = '-import';
+  for (const hidden of [true, false]) {
+    const label = hidden ? 'hidden' : 'shown';
+    const { files } = mount({ hidden });
+    await ready(hidden ? WORDS.th.food : 'ข้าวมันไก่');
+    expect(screen.queryAllByTestId('wallet-record-receipt-hidden'), `${label}: no frame`).toHaveLength(0);
+    noPanel('th', label);
+    expect([files.callsOf('grant').length, files.callsOf('file').length], `${label}: nothing fetched`).toEqual([0, 0]);
+    cleanup();
+  }
+});
```

`docs/implementation/receipts/P2-T26.md`:
```diff
diff --git a/docs/implementation/receipts/P2-T26.md b/docs/implementation/receipts/P2-T26.md
index b4da7d60cd0a5b5811c7f3cefd226174ca1acc93..c53b99c39af617e4f750f8f59419dd2a25a77dca 100644
--- a/docs/implementation/receipts/P2-T26.md
+++ b/docs/implementation/receipts/P2-T26.md
@@ -1,6 +1,7 @@
 # P2-T26: The record: detail, actions and Undo

 - **Status:** built and verified locally on `p2/t26-record-detail` (`.claude/worktrees/p2-t26`), from `2062b89a`. Not pushed. The independent reviews are the controller's (money and privacy path: Opus, then Sonnet). Under R87 this receipt is its own file; `premium-progress.md` is not edited.
+- **Fix round:** PR #456's two reviews said Needs fixes (Opus: M1, m1 to m3, n1 to n3; Sonnet: M1, m1, m2, n1 to n5). The controller ruled R123 and R124, and `receipts/P2-T26-fix.md` records the round: in private mode the page no longer mounts today's receipt section, and a record that holds a receipt shows the section's frame with ซ่อนอยู่; the undo bar's words are read, and said on iOS, with the amount in words; the phone's first screen-reader answer gives way to a change; and the reviews' pins hold. The lines below that the round makes untrue are corrected.
 - **Base and sync:** `git fetch origin claude/p1a-vault-core`, then `git merge --no-edit origin/claude/p1a-vault-core` printed `Already up to date.` The head is `2062b89a2eac882c39d6f0d7135691818285543c`, not the kit's `437743e2`; `437743e2` is an ancestor of it (#449's merge). `git diff --stat 437743e2 HEAD` over the task's seven paths printed nothing, so the kit applies as proved. `node_modules` was already installed, so `npm ci` was skipped. The kit's `SHA256SUMS` had 0 lines not OK, and `stage.py check-base` printed 11 OK lines and `check-base: 11 files, 0 not as expected`.
 - **Files:** created `apps/app/src/wallet/records/WalletRecordScreen.tsx`, `apps/app/src/wallet/records/RecordActionsTray.tsx`, `apps/app/src/wallet/records/WalletUndoBar.tsx`, `apps/app/src/wallet/records/WalletRecord.render.test.tsx` (25 cases), `apps/app/src/dev/catalogue/wallet/recordScreens.tsx` and this receipt. Modified `apps/app/src/wallet/records/copy.ts` (18 added lines: 15 keys and 3 comment lines), `apps/app/src/dev/catalogue/wallet/recordSections.tsx` (31 added lines: the five sections), `apps/app/app/spend/record/[id].tsx` (4 added, 2 removed: the wallet area), `apps/app/src/screens/redesign/SpendRoutes.render.test.tsx` (46 added, 1 removed: a stub and one case), `apps/app/src/ui/dateStep.ts` (10 added: `shortDateWithYear`) and `apps/app/src/ui/dateStep.test.ts` (10 added, 1 removed: the import and one case).
 - **What changed** (the planner's rulings are numbered as in the brief):
@@ -8,7 +9,7 @@
   - The actions tray, `RecordActionsTray` (P6, P7): the plan's props, plus the optional `art` and `sign`. Two groups of 66 pt rows, each one button named by its title and line. แก้ไข and ทำซ้ำ close the tray and run from its `onClosed`, once its Modal has gone (R69). ลบ runs at once. A tray opened again before it has gone forgets the action it was leaving for.
   - The undo bar, `WalletUndoBar` (P9, P10): the toast's words on a pill at 12% on `toast`, with a 44 pt Undo that plays `undoDone`. It goes after `motion.duration.toastLong`, but never while a screen reader runs or before the phone has said whether one does. The page keeps it while its undo is on its way or unconfirmed. Once it has gone, the page says ลบรายการแล้ว.
   - Deleted and frozen states (P11): a deleted entry keeps its facts, with Undo only. A record deleted elsewhere says so, counts its days and offers Restore with the record's version (Try again while unconfirmed). A delete whose answer never came is frozen with Try again, which resends the same key.
-  - Private mode (P3): every amount is ฿•••• (the page's amount, the ghost, the tray's header and copy row). The title is the category's name, the note reads ซ่อนอยู่, and the undo bar's words drop the amount (`deletedBarText`).
+  - Private mode (P3): every amount is ฿•••• (the page's amount, the ghost, the tray's header and copy row). The title is the category's name, the note reads ซ่อนอยู่, and the undo bar's words drop the amount (`deletedBarText`). Since the fix round, today's receipt section is not mounted while amounts are hidden (R123).
   - The route (P16): with `isRedesignEnabled('wallet')` the record route renders `WalletRecordScreen` with `key={id}` and the same `mode`. Otherwise `RecordScreen` is unchanged.
   - The catalogue (P15): five sections in `recordSections.tsx`, loaded lazily from `recordScreens.tsx`. bw-record, bw-record-draft and bw-record-deleted are screens on fakes; bw-record-actions and bw-record-undo are kit sections on sample props.
   - The date and copy (P3, P4): `shortDateWithYear` is appended to `dateStep.ts`. `records/copy.ts` gets the plan's 13 keys and the two private-mode drafts (`records.deletedBarHidden`, `records.noteHidden`). No `en.json` or `th.json` change (E2).
@@ -39,6 +40,6 @@
   - P2-T27: draw `EditTray` while `editing` is set and `ChoicePanel` from `choicePanel`; offer `discardChoice` beside the deleted notices, as today's record does (P8). The tray's แก้ไข already waits for `onClosed` (R69).
   - P2-T27 and P2-T28: if the record gains a refresh on revision, keep the kind on `deleted` (followups line 773).
   - P2-T18: inside the wallet shell's `AddTrayHost`, ทำซ้ำวันนี้ opens the add tray on the copy; outside one it pushes today's Quick add.
-  - P2-T37 (the sweep): the ghost amount is decorative text drawn outside `WalletAmount` (masked in private mode); the undo bar's words carry an amount through `walletMoneyText` outside private mode only.
-  - Private mode and the receipt photo (for the controller to decide; P3 does not name it): `RecordReceipt` (today's section, W15) draws the attached slip thumbnail (`apps/app/src/screens/redesign/import/RecordReceipt.tsx`, `ReceiptThumbnail`) whenever the record has an attachment. It has no private-mode check, and the page draws it at `WalletRecordScreen.tsx` line 376, as today's `RecordScreen` does at its line 214. A slip shows amounts and names.
+  - P2-T37 (the sweep): the ghost amount is decorative text drawn outside `WalletAmount` (masked in private mode); the undo bar's words carry an amount through `walletMoneyText` outside private mode only, and since the fix round are read through `spokenMoney` (R124).
+  - Private mode and the receipt photo (decided as R123; see `P2-T26-fix.md`): `RecordReceipt` (today's section, W15) draws the attached slip thumbnail (`apps/app/src/screens/redesign/import/RecordReceipt.tsx`, `ReceiptThumbnail`) whenever the record has an attachment. It has no private-mode check. Since the fix round the wallet page does not mount it while amounts are hidden; today's `RecordScreen` still draws it (its line 214), which goes to P2-T37. A slip shows amounts and names.
   - E2-B: every English line, and the Thai drafts ซ่อนอยู่ and ลบ {title} แล้ว. Wallet, Category and Note have catalog twins with other Thai (กระเป๋าเงิน, หมวดหมู่, หมายเหตุ) for P2-T38 to mark. The saved toast's Undo (P2-T17's link) against this bar's pill (P10). A merchant title gives way to the category's name in private mode (P3).
```

`docs/implementation/receipts/P2-T26-fix.md`:
```diff
diff --git a/docs/implementation/receipts/P2-T26-fix.md b/docs/implementation/receipts/P2-T26-fix.md
new file mode 100644
index 0000000000000000000000000000000000000000..0a7d00e6c028f89e2fa61d756904d0f35ef84aa3
--- /dev/null
+++ b/docs/implementation/receipts/P2-T26-fix.md
@@ -0,0 +1,51 @@
+# P2-T26-fix: the receipt photo in private mode, the undo bar's spoken words, and the reviews' pins
+
+- **Status:** built and verified locally on `p2/t26-record-detail` (`.claude/worktrees/p2-t26`), one commit on PR #456's reviewed head `52110318`. Not pushed. This is the fix round on PR #456 after two reviews, both Needs fixes for one major, which is the controller's R123:
+  - the first (`.claude/controller/reviews/P2-T26.md`, Opus): M1, m1 to m3, n1 to n3;
+  - the second (`P2-T26-second.md`, Sonnet, money and privacy): M1, m1, m2, n1 to n5.
+
+  The controller ruled R123 and R124 (13 November), and the planner's brief is `.claude/controller/briefs/P2-T26-fix.md`. Under R87 this receipt is its own file; `P2-T26.md` is corrected and points here.
+- **Base:** `52110318`, with no merge: the controller merges the integration branch up. #451 (P2-T17), #452 (P4-T3) and #454 (P3-T8) merged after the build; none changes a file of this task.
+- **Files:** modified `apps/app/src/wallet/records/WalletRecordScreen.tsx` (488 lines before, 528 after), `apps/app/src/wallet/records/WalletUndoBar.tsx` (103, 117), `apps/app/src/dev/catalogue/wallet/recordScreens.tsx` (148, 152), `apps/app/src/wallet/records/WalletRecord.render.test.tsx` (942, 1157; 25 cases before, 35 after) and `docs/implementation/receipts/P2-T26.md` (a line pointing here, and the lines the round makes untrue); created `apps/app/src/wallet/records/WalletRecordReceipt.render.test.tsx` (171 lines, 4 cases) and this receipt. `RecordReceipt.tsx` and today's `RecordScreen.tsx` are unchanged. No copy key is added (`records.noteHidden` is reused), and no catalog, route, package or lockfile changes.
+- **R123, private mode and the receipt photo (both reviews' M1):**
+  - While `usePrivateMode().hidden`, the wallet page does not mount today's `RecordReceipt`, so nothing is granted, downloaded, drawn or opened, and Attach, Replace and Remove wait. Private mode reads as hidden until its setting is read, so the panel never mounts before the setting is known.
+  - A record that holds a receipt (`attachment_id` set), with the import area on, shows the section's frame in the wallet look instead: a card of one fact, รูปใบเสร็จ (`tc('Receipt photo')`) and ซ่อนอยู่ (`records.noteHidden`), read as one, as the note's row is in private mode. No new key: the words are the note's private line.
+  - A record with no receipt, or the import area off, shows nothing while hidden: there is nothing to hide, and a photo attached now would be drawn at once.
+  - With private mode off, today's panel, unchanged. The fix lives in the wallet page only; today's `RecordScreen` (its line 214) goes to P2-T37.
+  - The cases run the real panel, in their own file (`WalletRecordReceipt.render.test.tsx`), since the main file stands the panel in module-wide: a record with a receipt in private mode (Thai and English, light and dark: the frame, its words and how it is read, the facts' card colour; no part of the panel, no `<img>`, no photo's bytes in the page, no grant and no download); one with no receipt (nothing); private mode off (the thumbnail, one grant, no frame; Attach with no receipt); the import area off (neither, private mode on or off). The main file's private-mode case also checks that the stand-in is not drawn.
+- **R124, the undo bar's spoken words (the first review's m1):**
+  - `deletedBarText` returns the drawn words and the spoken ones: ลบ ข้าวมันไก่ ฿50 แล้ว is read, and said on iOS, as ลบ ข้าวมันไก่ 50 บาท แล้ว (the spoken amount through `spokenMoney`). In private mode both are `records.deletedBarHidden`, which holds no amount.
+  - `WalletUndoBar` takes an optional `spoken`, one prop beyond the plan's three: it labels the bar's words and is what iOS is told (`spoken ?? message`). A bar given no `spoken` reads and says its words, as before.
+  - The catalogue's undo section passes both. Its draft table now carries `COMMON_COPY`, so `common.baht` resolves there.
+  - The cases: a delete's words, read (Thai and English, light and dark); the private-mode case, read as drawn, and no label in the page holding an amount, drawn or in words; on iOS the page says its bar once, ลบ ข้าวมันไก่ 50 บาท แล้ว (Deleted ข้าวมันไก่ 50 baht), and in private mode ลบ อาหาร แล้ว (Deleted Food); and the catalogue's section, read in both modes.
+- **The guard on the phone's first answer (the first review's n3, the second's n5; the controller left it to the planner):** once the phone has told the bar of a screen-reader change, its first answer to `isScreenReaderEnabled()`, a value or a failure, is dropped, so a late "no" can no longer start the time under a screen reader (WCAG 2.2.1). The case answers late, after a change, both ways. The other half of today's `UndoBar` guard, an answer after the bar has gone, is not carried: React 19 drops a state update on an unmounted component with no warning, so it changes nothing a person or a case can see.
+- **The reviews' pins (the code was right; each now has a case and a mutant):** a new delete after an undo whose bar ran out is a new bar (Opus m2: M1, M2); the tray's Close closes it (m3: M49); Back goes back, or to History when there is nowhere to go back to (n1: M28, M28b); the Undo pill's fill and the mark's circle (n2: M24, M24b); a refused delete (`conflict`, `deleted`, `not_found`, `invalid`) says why from the page and from the tray, with one `deleteTransaction`, two reads and the page still live (Sonnet m1: OM7); a draft whose Remove or Discard fails says so and stays (OM8); a draft at the largest text size stacks (OM1, OM2); the tile and the swatch are never read (n2: OM19, OM20).
+- **RED to GREEN:**
+  - RED (the round's two render files over `52110318`'s code, with no stub): `npm run typecheck:app` exit 0. Exit 1, `Test Files 2 failed (2)`, `Tests 7 failed | 32 passed (39)`. `first_errors.py`: 7 failing cases, each an `AssertionError`, and no line for a module, syntax, reference or type error. The 7: the delete case, the private-mode case, the answer guard, the iOS page case and the catalogue case (main file), and the two private-mode cases of the receipt file.
+  - GREEN: `typecheck:app` exit 0; the two files 39 of 39 (35 and 4), with no `stderr |` line.
+- **Mutation check:** 139 mutants, 139 killed, 0 survived. Each file was restored with its SHA-256 checked, and every failing case of every kill is an `AssertionError`, except C1, killed as it expects by its suite failing to load.
+  - The first round's 106. S38, S64, U3, U4, U12 and U15 are re-pointed at the lines this round moves.
+  - This round's F1 to F10 (R123's frame, in the receipt file), W1 to W7 (R124's spoken words) and G1 to G3 (the answer guard).
+  - The reviews' pins under the reviewers' names: M1, M2, M24, M28 and M49 (Opus), OM1, OM2, OM7, OM8, OM19 and OM20 (Sonnet), and two kin, M24b and M28b.
+- **Gate (R100, each file named):**
+  - `npm run typecheck:app`: exit 0.
+  - The focused render files and today's three neighbours (`WalletRecord`, `WalletRecordReceipt`, `WalletDeleted`, `RecordScreen` and `RecordReceipt` `.render.test.tsx`): `Test Files 5 passed (5)`, `Tests 167 passed (167)` (35, 4, 15, 65 and 48; the last three unchanged), no `stderr |` line.
+  - The four routes tests (SpendRoutes, AccountRoutes, InsightsRoutes, PlanningRoutes): 18 of 18.
+  - The eight kit render files that import the wallet catalogue index (CardStack, WalletLooks, PrivateMode, walletHarness, Tray, Lock, AmountStep, WalletsList): 142 of 142.
+  - The record's and bw-deleted's sections in both catalogue suites (`-t "section bw-record|section bw-deleted"`): `Tests 12 passed | 672 skipped (684)`.
+  - `npm run test:app`: exit 0, `ℹ fail 0`.
+  - `npm run test:unit`: exit 0, `ℹ fail 0`.
+  - `git diff --check`: clean before the commit, and against `origin/claude/p1a-vault-core...HEAD` after it.
+- **Deviations:** none from the brief's rulings.
+- **SKIPPED and CI:**
+  - In CI on the PR (R100): the full render suite (its per-section jobs open the record's five sections), `export:web` and the iOS export, the database, edge and image jobs, and `test:ops`.
+  - Not needed: `typecheck:routes` and `export:web` locally (no route, config or entry changes), and the API and edge suites (nothing outside `apps/app` and the receipts changes).
+  - SKIPPED until a device: VoiceOver and TalkBack reading the bar's words with the amount in words (TalkBack hears the bar as a live region); the frame read as one in private mode; and the first round's list.
+- **Risks:**
+  - Turning private mode on while today's panel is attaching or preparing a photo unmounts the panel mid-way. With private mode off again, the panel mounts afresh and reads the record; no case covers a switch in the middle of an attach. Attaching waits until private mode is off.
+  - Outside the wallet's private-mode provider the page reads as shown and mounts today's panel, as today's record does.
+- **Notes for later tasks:**
+  - **P2-T24 (Home, the first routed eye):** R123 is in, so private mode can be reached with the record's photo hidden.
+  - **P2-T37 (the sweep):** today's `RecordScreen` still draws the slip in private mode (R123, the first review's point 4); the undo bar's literals (the second review's n4: the 12% fill and the shadow, white in both modes).
+  - **The controller's followups, not in this round:** the iOS dismissal bound for the tray's hand-off (the second review's m2, the device item before P2-T18); the static import cycle between `recordScreens` and `recordSections` (n3). The second review's n1 is `after.current` not cleared once `actionsClosed` has used it (unreachable today); the controller's list names it "the If-Match regex copy", which neither review raises.
+  - **E2-B (the owner):** the frame's words, รูปใบเสร็จ ซ่อนอยู่ (Receipt photo Hidden), and the bar's spoken words.
```
