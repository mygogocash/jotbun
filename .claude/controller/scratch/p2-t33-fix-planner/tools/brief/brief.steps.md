
---

## Step 1: Check the base

1. `/usr/bin/git -C WT status --short` prints nothing, and `/usr/bin/git -C WT rev-parse --short HEAD` prints `5844e4c1`. Otherwise report BLOCKED.
2. `/usr/bin/git -C WT fetch origin claude/p1a-vault-core`, then `/usr/bin/git -C WT diff --stat 96a52c2a origin/claude/p1a-vault-core -- apps/app packages package.json package-lock.json`.
   - Expected: no output; or only P2-T14's files (`apps/app/src/wallet/add/`, `apps/app/src/dev/catalogue/wallet/addSections.tsx`, `index.ts`, `apps/app/src/wallet/copy/draftText.test.ts`), or another lane's files that are not in `PL/files.txt`. Go on, and name them in the receipt: the controller merges later (ruling P1). Do not merge.
   - If it lists one of `PL/files.txt`'s eleven, report BLOCKED with the output.
3. `cd WT && shasum -a 256 -c PL/SHA256SUMS.orig-in-wt` (type the full paths). Expected: nine `OK` lines, exit 0. Then `ls WT/apps/app/src/ui/lockCover.test.ts WT/apps/app/src/wallet/lock/LockRoute.render.test.tsx`: "No such file or directory" twice.
4. The base. Compare each with `PL/logs/base-*.log`:
   - Only if `WT/node_modules` is missing: `cd WT && npm ci --ignore-scripts --no-audit --no-fund > S/npm-ci.log 2>&1; echo $?`. Expected: 0.
   - `cd WT && npm run typecheck:app > S/base-typecheck.log 2>&1; echo $?`. Expected: 0.
   - `cd WT/apps/app && npm run test:unit -- src/wallet/lock/lockModel.test.ts src/wallet/copy/draftText.test.ts > S/base-unit.log 2>&1; echo $?`. Expected: 0, `ℹ tests 15`, `ℹ pass 15`.
   - The round's render files: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/lock/Lock.render.test.tsx src/ui/Sheet.render.test.tsx src/screens/redesign/import/RecordReceipt.render.test.tsx src/sync/SyncStatus.render.test.tsx src/ui/a11y.render.test.tsx src/ui/StagedProgress.render.test.tsx src/ui/SyncBanner.render.test.tsx > S/base-focused.log 2>&1; echo $?`. Expected: 0, `Test Files  7 passed (7)`, `Tests  112 passed (112)` (24, 15, 48, 11, 1, 5 and 8).
   - The neighbours (the first round's twelve): `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/ui/Sheet.keyboard.render.test.tsx src/wallet/WalletRoot.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/screens/redesign/account/SettingsScreen.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx src/wallet/card/WalletCard.render.test.tsx src/wallet/motion/GrowBar.render.test.tsx src/wallet/money/WalletAmount.render.test.tsx src/screens/redesign/account/AccountRoutes.render.test.tsx src/screens/redesign/RootLayout.render.test.tsx > S/base-neighbours.log 2>&1; echo $?`. Expected: 0, `Test Files  12 passed (12)`, `Tests  174 passed (174)`. Call this count N.
   - The catalogue's wallet and receipt sections: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "bw-|receipt-" > S/base-catalogue.log 2>&1; echo $?`. Expected: 0, `Tests  62 passed` (sixteen wallet and fifteen receipt sections, in two suites). Ignore the `skipped` count. Call this count C.

## Step 2: The tests first, and RED on `5844e4c1`'s code

1. Copy the four tests, the copy and the stub:
   ```bash
   cp PL/real/apps/app/src/wallet/lock/Lock.render.test.tsx WT/apps/app/src/wallet/lock/Lock.render.test.tsx
   cp PL/real/apps/app/src/wallet/lock/LockRoute.render.test.tsx WT/apps/app/src/wallet/lock/LockRoute.render.test.tsx
   cp PL/real/apps/app/src/wallet/lock/lockModel.test.ts WT/apps/app/src/wallet/lock/lockModel.test.ts
   cp PL/real/apps/app/src/ui/lockCover.test.ts WT/apps/app/src/ui/lockCover.test.ts
   cp PL/real/apps/app/src/wallet/lock/copy.ts WT/apps/app/src/wallet/lock/copy.ts
   cp PL/stubs/apps/app/src/wallet/lock/lockModel.ts WT/apps/app/src/wallet/lock/lockModel.ts
   ```
   Then `cd WT && shasum -a 256 -c PL/SHA256SUMS.red-in-wt`. Expected: eleven `OK` lines, exit 0.
2. `cd WT && npm run typecheck:app > S/red-typecheck.log 2>&1; echo $?`. Expected: 0.
3. `cd WT/apps/app && npm run test:unit -- src/wallet/lock/lockModel.test.ts src/ui/lockCover.test.ts src/wallet/copy/draftText.test.ts > S/red-unit.log 2>&1; echo $?`. Expected:
   - exit 1, `ℹ tests 18`, `ℹ pass 16`, `ℹ fail 2`;
   - the two failures, each on `AssertionError [ERR_ASSERTION]`:
     - `every Modal a person can open with the lock on draws the lock's cover; the legacy screen's four are the only others`: `AssertionError [ERR_ASSERTION]: src/screens/redesign/import/ReceiptParts.tsx`;
     - `an answer or a reading outside the port's types counts as a failed scan, or as a phone that could not be read`: `AssertionError [ERR_ASSERTION]: not_interactive`.
   - The 16 that pass include `the lock's Thai lines are the plan's, and only four more` (the copy went in with the tests, P15).
4. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/lock/Lock.render.test.tsx src/wallet/lock/LockRoute.render.test.tsx > S/red-render.log 2>&1; echo $?`. Expected:
   - exit 1, `Test Files  1 failed | 1 passed (2)`, `Tests  9 failed | 31 passed (40)`;
   - `grep -c '^AssertionError' S/red-render.log` gives 9;
   - `grep -cE 'Cannot find module|Failed to resolve|SyntaxError|is not a function|TestingLibraryElementError' S/red-render.log` gives 0;
   - one `Unhandled Rejection` section, `TypeError: Cannot read properties of undefined (reading 'step')`, which vitest attributes to "an answer outside the port's types ...". That is the first review's n4 itself (P15). Nothing else unhandled.

   The nine, each failing first on:
   - `with the receipt photo open, a return from the background shows the lock screen inside its own cover, and nothing of the photo`: `AssertionError: expected <div tabindex="-1" …(3)>…(2)</div> to be null`
   - `the first prompt waits until the phone has said how it locks, so it asks in its words; a phone that cannot be read is asked in the passcode's`: `AssertionError: face: expected "vi.fn()" to not be called at all, but actually been called 1 times`
   - `back in front while an earlier prompt is up, the new opening asks by itself once that prompt answers`: `AssertionError: expected 1 to be 2 // Object.is equality`
   - `an answer outside the port's types counts as a failed scan: the note says try again, and the button asks again`: `AssertionError: ลองอีกครั้ง หรือใช้รหัสผ่าน: expected null not to be null`
   - `a reading outside the port's types counts as a phone that could not be read: the lock stays on, and the screen names the passcode`: `AssertionError: a heading named Jotbun ล็อกอยู่: expected null not to be null`
   - `turning the lock on holds only once it is stored: a store that cannot keep it leaves the switch off and says so`: `AssertionError: expected 'true' to be 'false' // Object.is equality`
   - `while the cover is up the app below says nothing on iOS; the lock's own notes are said, and the app speaks again once unlocked`: `AssertionError: expected [ …(4) ] to deeply equal [ [ 'ลองอีกครั้ง หรือใช้รหัสผ่าน' ] ]`
   - `becoming hidden puts the keyboard away, so no typing reaches the screen under the cover`: `AssertionError: inactive: expected "dismiss" to be called 1 times, but got 0 times`
   - `a setting that cannot be read, on a phone that cannot lock, opens the app with no notice; a lock turned on since is said`: `AssertionError: expected <div aria-live="polite" …(4)>…(2)</div> to be null`

   The other new cases pass at RED: their code is already right, and Step 2.5 gives their RED. Compare with `PL/logs/red-unit.log` and `PL/logs/red-render.log`.
5. The pins whose code is already right (P13): the review survivors, each now killed by its own pin on `5844e4c1`'s code. The nine cases of Step 2.4 are left out by name (`RENDER_T`, a test-name pattern `mutants.py` passes to vitest as `-t`). Type it on one line:
   ```bash
   RENDER_T='^(?!.*(?:receipt photo open|first prompt waits|earlier prompt is up|answer outside the port|reading outside the port|holds only once it is stored|says nothing on iOS|puts the keyboard away|cannot be read, on a phone that cannot lock)).*$' python3 -I PL/tools/mutants.py WT S/red-pins-logs --pins > S/red-pins.out 2>&1; echo $?
   ```
   Expected: exit 0, and these 10 lines. Each mutant fails one case, its pin, on one assertion; G21 fails four, and its first failure is n5's new line (`no screen reader reaches the amount below`). Compare with `PL/logs/red-pins.out`.
   ```
{{PINS}}
   ```
   Then `cd WT && shasum -a 256 -c PL/SHA256SUMS.red-in-wt` again: eleven `OK` lines. The runner puts each file back.

## Step 3: GREEN

1. Copy the code:
   ```bash
   cp PL/real/apps/app/src/wallet/lock/lockModel.ts WT/apps/app/src/wallet/lock/lockModel.ts
   cp PL/real/apps/app/src/wallet/lock/LockGate.tsx WT/apps/app/src/wallet/lock/LockGate.tsx
   cp PL/real/apps/app/src/screens/redesign/import/ReceiptParts.tsx WT/apps/app/src/screens/redesign/import/ReceiptParts.tsx
   cp PL/real/apps/app/src/ui/a11y.ts WT/apps/app/src/ui/a11y.ts
   cp PL/real/apps/app/src/sync/announce.ts WT/apps/app/src/sync/announce.ts
   cp PL/real/apps/app/src/ui/Sheet.tsx WT/apps/app/src/ui/Sheet.tsx
   ```
2. `cd WT && shasum -a 256 -c PL/SHA256SUMS.real-in-wt`. Expected: eleven `OK` lines. Then `/usr/bin/git -C WT status --short`, which shows exactly these eleven lines:
   ```
    M apps/app/src/screens/redesign/import/ReceiptParts.tsx
    M apps/app/src/sync/announce.ts
    M apps/app/src/ui/Sheet.tsx
    M apps/app/src/ui/a11y.ts
    M apps/app/src/wallet/lock/Lock.render.test.tsx
    M apps/app/src/wallet/lock/LockGate.tsx
    M apps/app/src/wallet/lock/copy.ts
    M apps/app/src/wallet/lock/lockModel.test.ts
    M apps/app/src/wallet/lock/lockModel.ts
   ?? apps/app/src/ui/lockCover.test.ts
   ?? apps/app/src/wallet/lock/LockRoute.render.test.tsx
   ```
3. `cd WT && npm run typecheck:app > S/green-typecheck.log 2>&1; echo $?`. Expected: 0.
4. The command of Step 2.3, into `S/green-unit.log`. Expected: 0, `ℹ tests 18`, `ℹ pass 18`, `ℹ fail 0`.
5. The command of Step 2.4, into `S/green-render.log`. Expected:
   - exit 0, `Test Files  2 passed (2)`, `Tests  40 passed (40)` (Lock 38, LockRoute 2), each case marked `✓`;
   - `grep -c '^stderr |' S/green-render.log` gives 0, and the log has no `act(...)` warning, no `console.error` and no "Unhandled" section. Its other output is only the base's notices: Vite's config-loader notice, two `expo-status-bar` sourcemap notices and Node's `localStorage` warning.
6. The round's other render files: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/ui/Sheet.render.test.tsx src/screens/redesign/import/RecordReceipt.render.test.tsx src/sync/SyncStatus.render.test.tsx src/ui/a11y.render.test.tsx src/ui/StagedProgress.render.test.tsx src/ui/SyncBanner.render.test.tsx > S/green-focused.log 2>&1; echo $?`. Expected: 0, `Test Files  6 passed (6)`, `Tests  88 passed (88)` (15, 48, 11, 1, 5 and 8), as at the base.
7. The neighbours: Step 1.4's command, into `S/green-neighbours.log`. Expected: 0, `Tests  N passed (N)` (174).
8. The catalogue's sections: Step 1.4's command, into `S/green-catalogue.log`. Expected: 0, `Tests  C passed` (62), as at the base. The round changes no section; `receipt-full-screen` draws the viewer outside a gate, so nothing is hidden there.

## Step 4: Mutation check

1. `python3 -I PL/tools/mutants.py WT S/mutant-logs > S/mutants.out 2>&1; echo $?` (full paths).
   - It checks every mutant's text first: a text that does not match once stops it with exit 2, before anything changes. Then it applies each mutant alone, runs its tests (the three Node files; `Lock.render.test.tsx`; `LockRoute.render.test.tsx` for the route; the sheet's and the lock's render files for H), and restores the file with its SHA-256 checked. MS1 and MS2 edit `apps/app/src/ui/DateChip.tsx` and are restored the same way.
   - It took the planner {{MUTANT_MINUTES}} minutes in each of two runs, at load averages between 13 and 58. Allow longer on a busier machine.
   - Expected: exit 0, and these 167 lines: one per mutant, each ending "restored sha256 equal", then the tally. Compare with `PL/logs/mutants.out`.
   ```
{{MUTANTS}}
   ```
   The first 121 are the first round's (P16 names the re-aimed ones); the last 45 are this round's. Every kill fails an assertion. N1A also leaves an `Unhandled Rejection` in its log: the odd answer reaches `afterAnswer`, whose `undefined` throws inside the `try`, and the `finally` still resets `asking`.
2. `cd WT && shasum -a 256 -c PL/SHA256SUMS.real-in-wt`, `cd WT && shasum -a 256 -c PL/SHA256SUMS.datechip-in-wt` (one `OK` line: the runner put `DateChip.tsx` back), and `/usr/bin/git -C WT status --short`. Expected: unchanged from Step 3.2.

## Step 5: The fast local gate (R100)

From WT, in this order, each with its log in S:

1. `npm run typecheck:app`: exit 0.
2. `npm run test:unit`: exit 0 and `ℹ fail 0`. (R100: no total is checked; record what it prints.)
3. `npm run test:app`: exit 0 and `ℹ fail 0`.
4. The focused files once more:
   - `cd WT/apps/app && npm run test:unit -- src/wallet/lock/lockModel.test.ts src/ui/lockCover.test.ts src/wallet/copy/draftText.test.ts`: `ℹ pass 18`, `ℹ fail 0`;
   - the render files of Steps 3.5 to 3.7 in one run: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/lock/Lock.render.test.tsx src/wallet/lock/LockRoute.render.test.tsx src/ui/Sheet.render.test.tsx src/screens/redesign/import/RecordReceipt.render.test.tsx src/sync/SyncStatus.render.test.tsx src/ui/a11y.render.test.tsx src/ui/StagedProgress.render.test.tsx src/ui/SyncBanner.render.test.tsx src/ui/Sheet.keyboard.render.test.tsx src/wallet/WalletRoot.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/screens/redesign/account/SettingsScreen.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx src/wallet/card/WalletCard.render.test.tsx src/wallet/motion/GrowBar.render.test.tsx src/wallet/money/WalletAmount.render.test.tsx src/screens/redesign/account/AccountRoutes.render.test.tsx src/screens/redesign/RootLayout.render.test.tsx`: exit 0, `Test Files  20 passed (20)`, `Tests  302 passed (302)` (40 + 88 + N).
5. The catalogue's sections: Step 1.4's command: exit 0, `Tests  C passed`.
6. `/usr/bin/git -C WT diff --check` before the commit, and `/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD` after it: no output. (The second command spans the first round's commit too, which was clean.)

Not run here, and why (put this in the receipt):
- In CI on the PR (R100): the full render suite, `export:web`, the iOS export, `test:ops` and the database suites.
- Not needed: `typecheck:routes` and `export:web` locally (no route, config or app entry changes), and the API and edge suites (nothing outside `apps/app` changes).
- SKIPPED: the device checks of P19, and the first round's.

## Step 6: Receipt

Write `WT/docs/implementation/receipts/P2-T33-fix.md` in the house style of `receipts/P2-T33.md`, with your own numbers where they differ from these. Start from:

```markdown
# P2-T33-fix: The P2-T33 fix round (PR #406; ruling R107)

- **Status:** built and verified locally on `p2/t33-face-id-lock` (`.claude/worktrees/p2-t33`), on top of the reviewed head `5844e4c1`, with no merge (the controller merges after #407). Not pushed. The second review said Needs fixes (M1, major); the first approved with minors. Ruling R107 rules every finding; the controller gave leave to edit `ReceiptParts.tsx`, the other Modal files and `ui/a11y.ts`. Under R87 this receipt is its own file.
- **Base:** `5844e4c1`. Step 1.2 listed: (what it printed, or "nothing").
- **Files:** modified `apps/app/src/screens/redesign/import/ReceiptParts.tsx` (the receipt photo draws the cover), `apps/app/src/ui/a11y.ts` (the quiet flag), `apps/app/src/sync/announce.ts` (through `announcePolitely`), `apps/app/src/ui/Sheet.tsx` (a comment), `apps/app/src/wallet/lock/LockGate.tsx`, `lockModel.ts`, `copy.ts` (`lock.notStored`), `lockModel.test.ts` (11 cases before, 12 after) and `Lock.render.test.tsx` (24 before, 38 after); created `apps/app/src/ui/lockCover.test.ts` (2 cases), `apps/app/src/wallet/lock/LockRoute.render.test.tsx` (2 cases) and this receipt.
- **What changed, by finding:**
  - The second review's M1 (P2, P3): ...
  - The first review's m2, m3, m4 and n4 (P4 to P7): ...
  - The second review's m2 to m5 and n1 (P8 to P11, P13): ...
  - The pins (P13): the first review's n1, n2, n3 and n5.
  - The first review's n6 (P12): ...
- **RED to GREEN:**
  - RED (Step 2): Node 2 of 18 failing, render 9 of 40, each on an assertion, with the messages; the one expected unhandled `TypeError` (n4, P15); the nine pins killing their survivors on `5844e4c1`'s code (Step 2.5).
  - GREEN (Step 3): Node 18 of 18; Lock 38 and LockRoute 2; the round's other render files 88; the neighbours N; the catalogue C.
- **Mutation check:** 166, all killed: the first round's 121 (re-aimed, P16) and this round's 45. Every kill fails an assertion; N1A also leaves an unhandled `TypeError`.
- **Gate:** every command of Step 5 with its result, and no whole-suite totals.
- **Carried (R107.5):** the first review's m1 to P2-T34's phone check; the second review's m1 to later sheet hosts (1C-T9, P6B-T8) and P2-T34, with `Sheet.tsx`'s comment now saying so; the second review's m6 to owner Q1.
- **SKIPPED and CI:** as Step 5 says, and P19's device checks: the keyboard on a phone when the lock engages, VoiceOver over the receipt photo's cover, nothing below speaking on an iPhone, and TalkBack's live regions under the cover.
- **Notes for later tasks:**
  - P2-T34: map every answer to an `AuthResult` and keep `canLock` a boolean. The gate now treats anything else as a failed scan or an unreadable phone (`authResultOf`, `availabilityOf`), but the adapter is still the place to get it right. `availability()` must answer, since the first automatic ask waits for it. Keep `getAppLocalAuth()` one stable object (the first review's note). Check Android's activity-based credential screen (the first review's m1).
  - Every later Modal: draw `LockCoverArt` under `useLockCover().hidden`, as `Sheet`, `Tray` and the receipt photo do, or `src/ui/lockCover.test.ts` fails. P3's `WalletReceiptViewer` is one.
  - Every later announcement: go through `announcePolitely` (or `useAnnouncement`), never `AccessibilityInfo.announceForAccessibility` itself, so it stays quiet under the lock's cover. Only the gate uses `announceOverLockCover`.
  - 1C-T9 and P6B-T8: under the cover a Sheet's or a tray's children unmount, so the email code step starts again (the second review's m1).
  - E2-D: `lock.notStored` is a new draft line (P20).
```

## Step 7: Commit

1. `/usr/bin/git -C WT add apps/app/src/screens/redesign/import/ReceiptParts.tsx apps/app/src/sync/announce.ts apps/app/src/ui/Sheet.tsx apps/app/src/ui/a11y.ts apps/app/src/ui/lockCover.test.ts apps/app/src/wallet/lock/Lock.render.test.tsx apps/app/src/wallet/lock/LockGate.tsx apps/app/src/wallet/lock/LockRoute.render.test.tsx apps/app/src/wallet/lock/copy.ts apps/app/src/wallet/lock/lockModel.test.ts apps/app/src/wallet/lock/lockModel.ts docs/implementation/receipts/P2-T33-fix.md`
2. `/usr/bin/git -C WT status --short`: those twelve files staged (`A` for the two new tests and the receipt, `M` for the nine others), nothing else (no log).
3. Write the message to `S/commit-message.txt`. The trailer names the model you run as (for Claude Haiku 5.5, the line below):
   ```
   Cover the receipt photo under the Face ID lock, and tighten the gate as both reviews ask

   The record's receipt photo is a Modal of its own, so it stayed drawn
   over the locked app. It now draws the lock's cover in its place, as a
   sheet does, and a source check holds every Modal to that rule.

   The first automatic ask waits for the phone's words; an opening that
   comes while a prompt is up asks once that prompt answers; an answer or
   a reading outside the port's types counts as a failed scan or a phone
   still able to lock; turning the lock on holds only once it is stored.
   While the cover is up, the app below says nothing on iOS and the
   keyboard goes. A lock that was on only because its setting could not
   be read turns off without a word. Pin what the reviews found loose.

   Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
   ```
4. `/usr/bin/git -C WT commit -F S/commit-message.txt`, then `/usr/bin/git -C WT log --oneline -2` and `/usr/bin/git -C WT show --stat HEAD`: 12 files. `/usr/bin/git -C WT status --short` prints nothing. Do not push.

## Your final message

As the protocol says:
- `STATUS: DONE` (or `STATUS: BLOCKED` with the exact blocker) on the first line;
- the fix commit's SHA and branch, and the files changed;
- RED: Node 2 of 18 and render 9 of 40 failing on assertions, the one expected unhandled `TypeError`, and the nine pins;
- GREEN: the counts;
- mutants: 166, all killed;
- each gate command with its result, and no whole-suite totals;
- SKIPPED and CI items.

Name what the reviewer should look at first:
- the receipt photo under the cover, and the Modal sweep's source check (P2, P3);
- the gate's openings: `settled`, the mark in `unlock`, `busy` as a dependency (P4, P5);
- the quiet flag in `a11y.ts`, its layout effect, and the one line in `sync/announce.ts` that R107 did not name (P10);
- the fail-closed write and its notice (P9).
