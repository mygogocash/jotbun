# Brief tray-hardening second fix round: the late iOS dismissal also reads the commit before's `shown`; pin HIDE-END and the fresh `onClosed` (confirming review c-m1, c-n1, c-n2)

You are the fixer for tray-hardening's second fix round. PR #392 (branch `fix/tray-hardening`, head `fc78376`) hardens the Bun Wallet's tray. The confirming Sonnet review approved `fc78376` (`reviews/tray-hardening-confirm.md`: no blocker or major, one minor and two nits), and the controller folds all three findings into the same PR before it merges (CI has not run on any head yet: GitHub Actions is paused for billing):

- **c-m1 (code and a case):** the fix round's guard on iOS's late `onDismiss` reads only this render's `shown`. An earlier dismissal's end rendered in the same commit as the hide timer's `setShown(false)` still says the tray closed, and the second hide's own end says it again. The guard now also reads the commit before's `shown` (the `showing` ref, back as round one had it), and the review's HIDE-END becomes a case.
- **c-n1 (a case):** which `onClosed` iOS's end calls was unpinned (the review's mutant M3 survived).
- **c-n2 (the receipt):** four stale lines.

You merge today's base, copy three files from the planner's kit (and one RED-only file), prove them (two RED runs, GREEN, 45 mutants, R100's fast gate) and commit. The planner proved every step on `fc78376`'s tree (the integration branch has changed only `.claude/` since `33edab1`'s base), and a rehearsal ran this brief's Steps 2 to 8 on a git copy of that tree. Do exactly what this brief says.

Read first:
1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. R100: run only the fast local gate (Step 6), never the full render suite or the iOS export, and write no whole-suite total, not even `test:app`'s or `test:unit`'s. R87: your receipt is `docs/implementation/receipts/tray-hardening.md`, which exists; Step 7 replaces it with the kit's copy, and you do not edit `premium-progress.md`.
2. The confirming review: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/tray-hardening-confirm.md`: c-m1 (lines 32 to 48), c-n1 (52 to 56), c-n2 (58 to 63) and "Notes for later tasks" (113 to 126).
3. The fix round's brief, whose rules stay in force except where this brief's rulings say otherwise: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/briefs/tray-hardening-fix.md`, above all F1 (lines 42 to 47) and F3 (52 to 54).

## Paths and rules used below

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/tray-hardening` (branch `fix/tray-hardening`, head `fc78376`). Work only here.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/tray-hardening-fix2-fixer`, your scratch folder. Create it with `mkdir -p`. Logs and the commit message go there. Never write into `.../scratch/tray-hardening-fix2/` (another agent's files) or any other folder of `scratch/`, and never keep anything under `/private/tmp`.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/tray-hardening-fix2-planner`, the planner's kit. Read it and `cp` from it; never write into it. It holds:
  - `real/`: the three final files: `apps/app/src/wallet/tray/Tray.tsx`, `apps/app/src/wallet/tray/Tray.render.test.tsx` and `docs/implementation/receipts/tray-hardening.md`;
  - `orig/`: the same three files as `fc78376` has them;
  - `red-m3/`: `fc78376`'s `Tray.tsx` with the review's mutant M3, for c-n1's RED only (Step 3, G4);
  - `diffs/`: one diff per file, `orig/` to `real/` byte for byte, for reading only (the appendix holds the same bytes);
  - `probes/`: the reviews' probe files, for the reviewer. Never copy them into WT;
  - `tools/`: `mutants.py` (the mutant runner), `killers.py`, `prove.sh` and `run-all.sh` (the planner's stages), `controls.py`, `rehearse.sh` (this brief's steps, rehearsed), `diffs.sh`, `sums.sh`, and `brief.template.md` with `fill_brief.py` and `commit-message.txt`;
  - `logs/`: see "For the controller";
  - checksums with paths relative to WT, for `shasum -a 256 -c` run from WT, three files each: `SHA256SUMS.base` (as `fc78376` has them), `SHA256SUMS.red` (Step 3's first RED), `SHA256SUMS.redm3` (its second), `SHA256SUMS.green` (after Step 4) and `SHA256SUMS.real` (after Step 7); and `SHA256SUMS`, the kit's own (paths under PL; the `*.log` files are in `SHA256SUMS.logs`, not in it);
  - `work/`: the planner's proof tree, outside the sums.
- Every shell call starts in a fresh directory, so type full paths.
  - Git: `/usr/bin/git -C WT <command>`, one git command per call.
  - npm: `cd WT && npm run <script>`.
  - The Node file: `cd WT/apps/app && npm run test:unit -- src/wallet/tray/trayGesture.test.ts`.
  - Render files: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose <files>`.

  Below, WT, S and PL stand for those full paths: type the full path.
- No database or workers suite runs, so there is no lock to take. Docker stays stopped. Never kill a process you did not start. Never run the whole `CatalogueScreen.render.test.tsx`: only with `-t "bw-"`, as Steps 4 and 6 do.
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests or code to make them pass.
  - The one exception is a case that times out under load in a file this task does not touch (a known flake, protocol). Rerun that file alone once; if it passes alone, record both runs and go on.

## Planner rulings for this round (G1 to G8)

- **G1. c-m1's fix is the review's validated guard: `if (!shown && !showing.current) closed.current?.()`, with the `showing` ref back and refreshed with `closed` (`784667b`'s two lines).** It replaces F1's first ruling, that the ref goes.
  - `Modal.js` (lines 315 to 323) calls `onDismiss` from a `setState` callback, in the layout phase of the commit that renders UIKit's end. There the render's `shown` is that commit's, and `showing.current` is still the commit before's: that commit's passive effects ran before this render began (the part of round one's P3 that holds), and this commit's run only after its layout phase (F1's correction of P3).
  - Each source alone gets one batching class right. `shown` alone (`fc78376`) says closed for an end rendered with the hide timer's `setShown(false)`: c-m1. The ref alone (`784667b`) says closed for an end rendered with a reopen: m-1. Both together are the review's arrival rule: an end says the tray closed only if the Modal is hidden when the end arrives and still hidden after the batch it lands in.
  - Evidence (`PL/logs/`): the review's model of every valid sequence (`model*-*.log`): `fc78376` deviates in 7 of the 65 sequences of 7 steps and in 22 of the 141 of 8, all first at an end batched with a hide; the fix deviates in none. The probes (`green-probes.log`): on the fix only P-J fails, by design (the first round's P5); the confirming review's H3d reads 0 calls after the batch and 1 after the second end (`fc78376`: 1 and 2).
  - Two equivalent forms, run as controls rather than mutants (`logs/controls.out`): refreshing `showing` in a layout effect (the Modal sits inside the tray's tree, and React runs a child's layout callbacks before its parent's), and calling the render's `onClosed` instead of `closed.current` (F1's last point).
- **G2. F1's sentence about a second hide, corrected; four texts say it.**
  - F1 (`briefs/tray-hardening-fix.md`, line 44) said that a late end of an earlier hide that comes while the card leaves again "finds `shown` true ... and says nothing". That fails when the end is rendered in the commit of the second hide (c-m1). Read instead: **an earlier hide's end that comes while the card leaves again says nothing: rendered alone it finds `shown` true (the Modal stays shown for the exit), and rendered in the commit that ends that exit, where the hide timer's `setShown(false)` has made `shown` false, it finds `showing` true. That hide's own end then says the tray closed, once.** The first round's H3 reasoning holds in both orders. F1's own text stays as written; this ruling replaces it.
  - The same now reads right in: the comment above `dismissed` in `Tray.tsx` (`fc78376`'s lines 164 to 169, which named one source) and the ref's comment (line 149); the receipt's description under "What changed" (line 9); the receipt's fix-round m-1 line (54), where the ref is "gone" and a parenthesis now says the second fix round brings it back; and this round's receipt section.
- **G3. c-m1's case is HIDE-END, on the test file's own seam, with its end and the hide in one `act`.**
  - `on iOS a dismissal that ends in the commit that hides the tray again says nothing; the next one says it closed`, after m-1's case. Close, hide (220 ms), open, close and 219 ms; then UIKit's end of the first dismissal and the exit's last millisecond inside one `act`, so one commit holds the end and the Modal's second hide; then the second dismissal's end. Expected: nothing after the batch, one `onClosed` after the second end.
  - One `act`, as F3 ruled for m-1's case. In two acts the end commits alone, while the Modal is still shown, and the case passes on `fc78376`'s guard too (control SB2-orig); m-1's case in two acts fails on the fixed code (control SB-real, the review's SB).
- **G4. c-n1's case: on iOS, an `onClosed` given while the dismissal is under way is the one called.**
  - `on iOS an onClosed given while the dismissal is under way is the one called`, after HIDE-END. Hide, pass a new `onClosed` while UIKit's dismissal is under way (P2-T16's `whenClosed` passes a new one on every render), then end: the new one is called once, the old one never. It kills M3 on its assertion, and only it.
  - It pins code that is right on `fc78376`, so it passes there by design, as F7's three pins did. Its RED is therefore `fc78376`'s `Tray.tsx` with the review's M3 laid on it (`PL/red-m3/`), the regression it pins against: there it fails on its assertion (Step 3.8).
- **G5. RED is two runs, each failing on an assertion with no module or type error.**
  - (a) The final test file over `fc78376`'s `Tray.tsx`: `1 failed | 27 passed (28)`. HIDE-END fails; c-n1's case passes (G4).
  - (b) The same over `PL/red-m3/`'s `Tray.tsx`: `2 failed | 26 passed (28)`, HIDE-END and c-n1's case.
- **G6. The mutants: 45.**
  - The fix round's 40, with H2, H3, H4, H12 and X4 written again for the new guard. H12 (`784667b`'s guard) now changes the guard's line only, since the ref is back. H4 (a callback never renewed) now reads the live ref, so it behaves as H12 and only m-1's case kills it.
  - M3, the review's (c-n1), written for the new guard.
  - H13 to H16 on the new guard (c-m1): only this render's `shown` (`fc78376`'s guard); `||` for `&&`; `showing` written during the render; `showing` never refreshed.
  - All 45 are killed, each on an assertion, and two runs printed the same 46 lines byte for byte. The other 32 fail exactly the cases they failed in the fix round.
- **G7. The receipt is the kit's copy, whole (Step 7).**
  - c-n2's four lines: the Status (pushed; `784667b` approved; the head is this round's commit) and Base lines at the top (round one's base, and where each fix round's is); round one's CI line (the PR adds 12 render cases: 16 at the base, 28 at the head); the fix round's Base (the merge `33edab1` also brought #391's receipt, `docs/implementation/receipts/wallet-looks-unstored.md`).
  - G2's two lines (9 and 54), and a section for this round at the end.
  - No whole-suite totals (R100): `test:app` and `test:unit` are recorded as exit 0 and `ℹ fail 0`. Every count in the section is one of this brief's Expected lines, so the copy is right when every step held. The one edit you may make is G8's.
- **G8. The base and the scope.**
  - `fc78376` sits on the merge `33edab1` (`784667b` with `origin/claude/p1a-vault-core` at `6a727dc`). Since `6a727dc` the integration branch has changed only `.claude/` (checked at `52c6f5f`), so the merge in Step 1 should bring nothing a test reads. If it brings files outside `.claude/` but none under `apps/app/` or `packages/` and no `package.json` or `package-lock.json`, go on: record them in the receipt's new Base line and its Deviations line (Step 7.3). Anything under `apps/app/` or `packages/`, or a package file: stop, BLOCKED with the list (the planner's proof tree would no longer match).
  - Not in this round: n-3 (P2-T16's), P-J (P2-T33's), `trayGesture.ts`, `trayGesture.test.ts` and every other file; no package, lockfile, route, app entry, `en.json`, `th.json` or `premium-progress.md` change.
  - For CI: render +0 files and +2 cases (`Tray.render.test.tsx` 26 to 28; 16 to 28 across the PR); `test:unit`, `test:app`, web and iOS +0.

---

## Step 1: Sync

1. `mkdir -p S`. Then `/usr/bin/git -C WT status --short` prints nothing, and `/usr/bin/git -C WT rev-parse --short HEAD` prints `fc78376`. If either differs, stop: BLOCKED, with both outputs and `/usr/bin/git -C WT log --oneline -3`.
2. `/usr/bin/git -C WT fetch origin claude/p1a-vault-core`, then `/usr/bin/git -C WT merge --no-edit origin/claude/p1a-vault-core`. Expected: a merge commit, with no conflict. Then:
   - `/usr/bin/git -C WT rev-parse --short HEAD` (the merge commit) and `/usr/bin/git -C WT rev-parse --short origin/claude/p1a-vault-core`: record both for your final message;
   - `/usr/bin/git -C WT diff --stat fc78376 HEAD -- . ':!.claude'`. Expected: no output. If it lists files, follow G8.
3. Install only if missing (the protocol's step 2): `ls WT/node_modules/.bin/vitest`. If it prints "No such file or directory", run `cd WT && npm ci --ignore-scripts --no-audit --no-fund > S/npm-ci.log 2>&1; echo exit=$?` (expected `exit=0`); otherwise skip it.

## Step 2: Check the base

1. `cd WT && shasum -a 256 -c PL/SHA256SUMS.base > S/base-check.txt 2>&1; echo exit=$?`. Expected: `exit=0`, and `S/base-check.txt` holds three `OK` lines (`Tray.tsx`, `Tray.render.test.tsx` and the receipt).
2. `cd WT/apps/app && npm run test:unit -- src/wallet/tray/trayGesture.test.ts > S/base-unit.log 2>&1; echo exit=$?`. Expected: `exit=0`, `ℹ tests 4`, `ℹ pass 4`, `ℹ fail 0`.
3. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/tray/Tray.render.test.tsx > S/base-render.log 2>&1; echo exit=$?`. Expected: `exit=0`, and `grep -E "^ +Tests " S/base-render.log` prints `      Tests  26 passed (26)`.

## Step 3: The test file and RED

1. `cp PL/real/apps/app/src/wallet/tray/Tray.render.test.tsx WT/apps/app/src/wallet/tray/Tray.render.test.tsx` (type the full paths). `Tray.tsx` stays as `fc78376` has it for now.
2. `/usr/bin/git -C WT status --short --untracked-files=all`. Expected: exactly ` M apps/app/src/wallet/tray/Tray.render.test.tsx`, and nothing else.
3. `cd WT && shasum -a 256 -c PL/SHA256SUMS.red`. Expected: 3 `OK` lines, exit 0.
4. `cd WT && npm run typecheck:app > S/red-typecheck.log 2>&1; echo exit=$?`. Expected: `exit=0`.
5. RED (a): `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/tray/Tray.render.test.tsx > S/red-render.log 2>&1; echo exit=$?`. Expected: `exit=1`, and:
   - `grep -E "^ +Tests " S/red-render.log` prints `      Tests  1 failed | 27 passed (28)`;
   - `grep "×" S/red-render.log` prints exactly one line: ` × src/wallet/tray/Tray.render.test.tsx > on iOS a dismissal that ends in the commit that hides the tray again says nothing; the next one says it closed`, then its time;
   - `grep '^AssertionError' S/red-render.log` prints exactly `AssertionError: the earlier end, in the commit that hides the Modal again: expected "vi.fn()" to not be called at all, but actually been called 1 times`;
   - `grep -cE 'Cannot find module|Failed to resolve|SyntaxError|TypeError|ReferenceError' S/red-render.log` prints `0`.

   c-n1's case passes here, by design (G4).
6. `cp PL/red-m3/apps/app/src/wallet/tray/Tray.tsx WT/apps/app/src/wallet/tray/Tray.tsx`. Then `cd WT && shasum -a 256 -c PL/SHA256SUMS.redm3`. Expected: 3 `OK` lines, exit 0.
7. `cd WT && npm run typecheck:app > S/redm3-typecheck.log 2>&1; echo exit=$?`. Expected: `exit=0`.
8. RED (b): the render file as in 5, into `S/redm3-render.log`. Expected: `exit=1`, and:
   - `grep -E "^ +Tests " S/redm3-render.log` prints `      Tests  2 failed | 26 passed (28)`;
   - `grep "×" S/redm3-render.log` prints exactly two lines, each followed by its time: 5's line, and ` × src/wallet/tray/Tray.render.test.tsx > on iOS an onClosed given while the dismissal is under way is the one called`;
   - `grep '^AssertionError' S/redm3-render.log` prints exactly two lines: 5's, and `AssertionError: calls: the onClosed given first, the one given last: expected [ 1, +0 ] to deeply equal [ +0, 1 ]`;
   - the grep for load errors, as in 5, prints `0`.

## Step 4: The fix and GREEN

1. `cp PL/real/apps/app/src/wallet/tray/Tray.tsx WT/apps/app/src/wallet/tray/Tray.tsx`. Then `cd WT && shasum -a 256 -c PL/SHA256SUMS.green`. Expected: 3 `OK` lines, exit 0.
2. `cd WT && npm run typecheck:app > S/green-typecheck.log 2>&1; echo exit=$?`. Expected: `exit=0`.
3. The Node file, as in Step 2.2, into `S/green-unit.log`. Expected: `exit=0`, `ℹ tests 4`, `ℹ pass 4`, `ℹ fail 0`.
4. The render file, as in Step 3.5, into `S/green-render.log`. Expected: `exit=0`, `      Tests  28 passed (28)`, and `grep -c '^stderr |' S/green-render.log` prints `0`.
5. The catalogue's wallet sections in the every-section and screen-reader suites (the tray's only host):
   ```
   cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "bw-" > S/green-catalogue.log 2>&1; echo exit=$?
   ```
   Expected: `exit=0`, `Test Files  2 passed (2)`, and a `Tests` line that starts `Tests  18 passed`. Ignore the `skipped` count: it moves with the head.

## Step 5: Mutation check

Run the planner's runner once. It applies each mutant alone to its file in WT (`Tray.tsx`, or `dev/catalogue/wallet/index.ts` for K1 and K2), runs both of the tray's test files, restores the file and checks its SHA-256:

```
MUTANT_LOGS=S/mutant-logs python3 -I PL/tools/mutants.py WT > S/mutants.out 2> S/mutants.err; echo exit=$?
```

Type the full paths. To check first that every pattern matches once, run `python3 -I PL/tools/mutants.py WT --check` (45 `APPLIES` lines, exit 0).

Expected: `exit=0`, and:
- `grep -c " KILLED: " S/mutants.out` prints `45`, and `grep -c "restored=True" S/mutants.out` prints `45`;
- `diff S/mutants.out PL/logs/mutants.out` prints nothing: each mutant fails the same cases as in the planner's run.

It takes two minutes or more, by the machine's load: give the call a timeout of 600000 ms. Then `/usr/bin/git -C WT status --short --untracked-files=all` shows exactly ` M` for `Tray.tsx` and `Tray.render.test.tsx`, and `cd WT && shasum -a 256 -c PL/SHA256SUMS.green` still prints 3 `OK` lines.

In the table, "HIDE-END" is `on iOS a dismissal that ends in the commit that hides the tray again says nothing; the next one says it closed`, "c-n1's case" is `on iOS an onClosed given while the dismissal is under way is the one called`, "m-1's case" is `on iOS a dismissal that ends in the commit that opens the tray again says nothing`, "the late case" is `on iOS a dismissal that ends after the tray is shown again says nothing; the next one says it closed`, "the no-onClosed case" is `on iOS a tray with no onClosed closes, its dismissal ends, and it opens again`, and "the phone case" is `on a phone the card is the named dialog and the title takes focus, with or without a header; on iOS onClosed waits for the Modal's own dismissal`.

| Mutant | Change | Killed by |
| --- | --- | --- |
| H13 | the late `onDismiss`'s guard reads only this render's `shown`, as `fc78376` did (c-m1) | HIDE-END, and only it |
| H14 | it says closed when either one is hidden, not both (`\|\|` for `&&`) | m-1's case and HIDE-END |
| H15 | `showing` is written during the render, not after the commit | HIDE-END, and only it |
| H16 | `showing` is never refreshed | HIDE-END, and only it |
| M3 | `dismissed` is memoised on `[shown]` and calls the `onClosed` captured then (the confirming review's, c-n1) | c-n1's case, and only it |
| H12 | the guard reads only the ref an effect refreshes, as `784667b` did (m-1) | m-1's case, and only it |
| H2 | the late `onDismiss` always says the tray closed | the late case, m-1's case and HIDE-END |
| H3 | its guard reads `visible`, not the Modal | the late case and HIDE-END |
| H4 | its guard keeps the first render's `shown` (a callback never renewed) | m-1's case, and only it |
| X4 | iOS's `onDismiss` calls `onClosed` with no optional chaining (n-2) | the no-onClosed case, and only it |
| B1 | the `onClosed` ref is never refreshed (n3) | `an onClosed given while the card leaves is the one called` and c-n1's case |
| R25, R26 | on iOS `onClosed` fires before the Modal has gone; on iOS it never fires | the phone case, the late case, m-1's case, HIDE-END and c-n1's case (R26 also the no-onClosed case) |
| the other 32 | H1, H5 to H11, B2, B4, O1, O2, O5 to O7, O11, R1 to R5, R7, R13 to R16, K1, K2, X1, X2, D1 and D2, as in the fix round | the same cases as in the fix round's table (`briefs/tray-hardening-fix.md`, Step 4) |

`PL/logs/killers.txt` lists every case each mutant fails.

## Step 6: The fast local gate (R100)

Run from WT, in order, and record each result. Whole-suite totals are not compared or recorded (R100).

1. `cd WT && npm run typecheck:app`. Expected: exit 0.
2. The two tray files and the catalogue's wallet sections: Steps 4.3, 4.4 and 4.5 again, into `S/gate-unit.log`, `S/gate-render.log` and `S/gate-catalogue.log`. Expected: as there (4 of 4; 28 of 28; 18 passed).
3. `cd WT && npm run test:app > S/test-app.log 2>&1; echo exit=$?`. Expected: `exit=0` and `ℹ fail 0`.
4. `cd WT && npm run test:unit > S/test-unit.log 2>&1; echo exit=$?`. Expected: `exit=0` and `ℹ fail 0`.
5. `/usr/bin/git -C WT diff --check; echo exit=$?`. Expected: no output and `exit=0`.

Not run here, recorded as "CI" (R100): the full `test:render` suite and the iOS export. Not run at all: `typecheck:routes` and `export:web` (no route, app config or app entry changes), the edge, API and database suites (nothing outside `apps/app` and the receipt changes), and `test:ops` (no package or lockfile change).

## Step 7: Receipt

1. `cp PL/real/docs/implementation/receipts/tray-hardening.md WT/docs/implementation/receipts/tray-hardening.md`.
2. `cd WT && shasum -a 256 -c PL/SHA256SUMS.real`. Expected: 3 `OK` lines, exit 0.
3. Read the new section at the end (`## Second fix round: ...`). Its counts are this brief's Expected lines, so they hold when every step did. Only if Step 1.2 listed files (G8), edit with the Edit tool, in that section only:
   - in its **Base** line (the section's second line), replace the second sentence, from "Since" to "printed nothing.", with one that names the files Step 1.2's `git diff --stat` listed;
   - replace its line `- **Deviations:** none.` with one that names those files and says that none is under `apps/app/` or `packages/`.

   `SHA256SUMS.real` then fails for the receipt alone; say so in your final message. Change nothing else in the receipt.

## Step 8: Commit

1. `/usr/bin/git -C WT add apps/app/src/wallet/tray/Tray.tsx apps/app/src/wallet/tray/Tray.render.test.tsx docs/implementation/receipts/tray-hardening.md`
2. `/usr/bin/git -C WT status --short`. Expected: exactly these three lines, and nothing else:
   ```
   M  apps/app/src/wallet/tray/Tray.render.test.tsx
   M  apps/app/src/wallet/tray/Tray.tsx
   M  docs/implementation/receipts/tray-hardening.md
   ```
   If anything else shows, stop and report.
3. `/usr/bin/git -C WT diff --cached --check; echo exit=$?`. Expected: no output and `exit=0`.
4. Write the message to `S/commit-message.txt` with the Write tool (it is also `PL/tools/commit-message.txt`), then `/usr/bin/git -C WT commit -F S/commit-message.txt`:

```
Read the commit before's shown too in the tray's late iOS dismissal

The guard on iOS's late onDismiss read only the render's shown, so an
earlier dismissal's end rendered in the commit that hides the Modal
again said the tray closed, and the second hide's own end said it
again. It now also reads the commit before's (the showing ref, back
and refreshed with onClosed). Pin that case and which onClosed iOS's
end calls, and fix four stale receipt lines. The confirming review's
c-m1, c-n1 and c-n2.

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
```

5. `/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD; echo exit=$?`. Expected: no output and `exit=0`. Then `/usr/bin/git -C WT log --oneline -3`, and record the fix commit's SHA. Do not push.

## Your final message

As the protocol says:
- `STATUS: DONE` or `STATUS: BLOCKED` first;
- the merge commit and the fix commit (SHAs), the integration head you merged, and the branch; the files;
- RED (a) `1 failed | 27 passed (28)` and RED (b) `2 failed | 26 passed (28)`, GREEN (28 and 4), and the mutants (45 killed, and whether `S/mutants.out` equals the planner's);
- each gate command with its result: the focused counts; `test:app` and `test:unit` as exit 0 and `ℹ fail 0`, with no totals (R100);
- SKIPPED: the phone checks, `typecheck:routes`, `export:web`, the edge, API and database suites and `test:ops`; CI: the full render suite and the iOS export;
- deviations, if any.

---

## For the controller (not the fixer's)

- **Readiness: BLOCKED until the controller rules on `99ce506`.** The brief is complete and proven, but its base has moved.
  - At 14:41:47 on 10 November another agent committed `99ce506` ("Say the tray closed on iOS only when the Modal was hidden in both commits", trailer `Co-Authored-By: Cursor <cursoragent@cursor.com>`) on `fix/tray-hardening` in WT, and pushed it at 14:41:49 (the reflog of `refs/remotes/origin/fix/tray-hardening` says "update by push"), so it is PR #392's head. Its shell ran under T3 Code; its logs are in `scratch/tray-hardening-fix2/`. From 14:38 to 14:41 it edited WT's files and ran the fix round's mutant runner inside WT. The times match the old planner thread 351b244a's run 4 (from 14:38), which the handover says never received the request. The handover at `52c6f5f` does not know of `99ce506`, and still plans `merge_task_pr.sh 392 fc78376`.
  - What `99ce506` holds (`PL/other-99ce506/`, its three files): the same guard, ref and refresh as `PL/real/`'s `Tray.tsx` (only the two comments' wording differs), the review's HIDE-END case (27 cases; the same steps as `PL/real/`'s, under another name and comments), and receipt edits for c-m1 and c-n2 that send c-n1 to P2-T16. It has no c-n1 case, did not merge the integration branch first, ran 35 of the 40 old mutants plus 5 of its own, and has no Haiku trailer. It was not reviewed.
  - Either way works from this kit. To use this brief as written: point WT's branch back at `fc78376` before the fixer starts (its Step 1.1 stops otherwise), and push the fixer's commit with a force push, since `99ce506` is not its ancestor. To keep `99ce506` instead: the final state is still `PL/real/` (its code equals `99ce506`'s), but Steps 1 to 3, the diffs, the receipt's new section and the commit message need a short re-plan on top of `99ce506`.
- **Size:** S. One line of code and the ref restored (two lines), two comments, two new cases, and the receipt.
- **Kit checks.**
  - The kit's own sums: `shasum -a 256 -c SHA256SUMS` from PL. The `*.log` files are in `SHA256SUMS.logs`, not in it.
  - The five worktree sums (paths relative to WT): `SHA256SUMS.base` (`fc78376`), `.red`, `.redm3`, `.green` and `.real`. `check_kit.sh` compares `SHA256SUMS.base` and `orig/` with `origin/claude/p1a-vault-core` unless told otherwise; PR #392 has not merged, so run it with `--head fc78376`.
  - `PL/work/` is the planner's proof tree: `git archive fc78376` of WT, with WT's `node_modules` and `apps/app/node_modules/@better-auth` symlinked. It is outside the sums.
- **The planner's logs** (in `PL/logs/`):
  - `summary.txt`: every stage of `tools/run-all.sh`, timed, with the load average.
    - The base (`fc78376`): the Node file 4 of 4, the render file 26 of 26, the catalogue's wallet sections 18; the probes (the first review's 19, the first planner's 15, the confirming review's 8, its seam copy with HIDE-END, its model at 6 steps) fail HIDE-END and P-J only.
    - RED (a) and (b) as in Step 3; GREEN 4 of 4, 28 of 28 with no stderr, 18; on the fix the probes fail only P-J (by design).
    - The model at 7 and 8 steps on both `Tray.tsx` files (G1), the mutants twice, and the gate (`test:app` and `test:unit` exit 0 and `ℹ fail 0`).
  - `base-*`, `red-*`, `redm3-*`, `green-*`, `gate-*` and `model*-*`: each stage's own logs; `base-probes.log` and `green-probes.log`: the six probe files on `fc78376` and on the fix.
  - `mutants.out` and `mutant-logs/`: the run; `repeat/`: a second run, whose `mutants.out` is byte for byte the first's (`repeat/diff.txt` is empty); `mutants-check.out`: 45 `APPLIES`; `killers.txt`: every case each mutant fails.
  - `controls.out` and `control-logs/` (`tools/controls.py`): SB2-orig and SB2-real (HIDE-END in two acts passes on both guards), SB-real (m-1's case in two acts fails on the fix), LE and M1 (the equivalent forms of G1, both pass).
  - `rehearsal.txt`: this brief's Steps 2 to 8, typed as written (`tools/rehearse.sh`), in a throwaway git copy of `fc78376`'s tree, deleted afterwards. Step 1 needs the real branch and remote; its first check ran on the copy.
- **The CI deltas:** render +0 files and +2 cases (`Tray.render.test.tsx` 26 to 28; 16 to 28 across the PR's three rounds); `test:unit`, `test:app`, web and iOS +0. No route, app entry, package or lockfile change. The run that gates the merge should be on this round's head, a true merge with the current base.
- **For the reviewer of this round:** G1's guard and why each source alone fails (the two RED runs and H12, H13); G3's one `act` (controls SB2-orig and SB-real); G4's RED on `red-m3/`; G2's four texts. `PL/probes/` runs against the commit: on the fix only P-J fails, and the model at 8 steps shows no deviation.
- **Followups to record:**
  - P2-T16: c-n1 is pinned here now (no longer its case to add). n-3 stands: `whenClosed` treats a second `onClosed` as nothing and keeps its queue in a ref.
  - E2-A's device check for a quick reopen on iOS: also how long UIKit's end can lag (c-m1's window needs a whole exit after two more taps).
  - F1's first ruling (the ref goes) and its sentence about a second hide are superseded by G1 and G2.

## Appendix: the code

Every block below is the kit's diff, byte for byte (`tools/fill_brief.py` checks it). The full files are in `PL/real/`. Copy from PL with `cp`; never retype.

### `Tray.tsx` (`PL/diffs/apps_app_src_wallet_tray_Tray.tsx.diff`)

```diff
diff --git a/apps/app/src/wallet/tray/Tray.tsx b/apps/app/src/wallet/tray/Tray.tsx
index 663a610..4fa719a 100644
--- a/apps/app/src/wallet/tray/Tray.tsx
+++ b/apps/app/src/wallet/tray/Tray.tsx
@@ -146,10 +146,13 @@ export function Tray({ visible, onClose, onClosed, title, header, onBack, step,
   const [shown, setShown] = useState(visible);
   if (visible && !shown) setShown(true);
 
-  // The latest onClosed, as the last commit left it, for the hide's timer and iOS's onDismiss.
+  // The latest onClosed, and whether the Modal is shown, as the last commit
+  // left them: the hide's timer reads the first, iOS's onDismiss both.
   const closed = useRef(onClosed);
+  const showing = useRef(shown);
   useEffect(() => {
     closed.current = onClosed;
+    showing.current = shown;
   });
   const exitMs = trayExiting(reduced).getDuration();
   useEffect(() => {
@@ -163,12 +166,14 @@ export function Tray({ visible, onClose, onClosed, title, header, onBack, step,
   }, [visible, shown, exitMs]);
   // iOS's onDismiss comes when UIKit's dismissal ends, after the hide. A tray
   // shown again by then (a quick reopen) has not closed, so that late one says
-  // nothing (P10d); the hide that follows has its own onDismiss. The guard reads
-  // this render's `shown`, not a ref an effect refreshes: Modal.js calls the
-  // latest onDismiss in the layout phase of the commit that renders the end, and
-  // a reopen batched with the end is in that same commit, before its effects run.
+  // nothing (P10d); the hide that follows has its own onDismiss. Modal.js calls
+  // the latest onDismiss in the layout phase of the commit that renders the end,
+  // before that commit's effects run, so `shown` is this commit's and `showing`
+  // the commit before's. The end says closed only if the Modal is hidden in
+  // both: a reopen batched with the end shows it in this commit, and an earlier
+  // end batched with the next hide finds it shown in the commit before.
   const dismissed = () => {
-    if (!shown) closed.current?.();
+    if (!shown && !showing.current) closed.current?.();
   };
 
   /** A close may be asked for: never while locked (a save in flight), once the tray is leaving, or under the lock's cover. */
```

### `Tray.render.test.tsx` (`PL/diffs/apps_app_src_wallet_tray_Tray.render.test.tsx.diff`)

```diff
diff --git a/apps/app/src/wallet/tray/Tray.render.test.tsx b/apps/app/src/wallet/tray/Tray.render.test.tsx
index 29c98aa..a32c390 100644
--- a/apps/app/src/wallet/tray/Tray.render.test.tsx
+++ b/apps/app/src/wallet/tray/Tray.render.test.tsx
@@ -744,6 +744,62 @@ test('on iOS a dismissal that ends in the commit that opens the tray again says
   expect(onClosed, 'onClosed while the tray is open').not.toHaveBeenCalled();
 });
 
+test('on iOS a dismissal that ends in the commit that hides the tray again says nothing; the next one says it closed', async () => {
+  phoneFocus();
+  dismissals.late = true;
+  const onClosed = vi.fn();
+  const view = mountWallet(tray({ visible: false, onClosed }));
+  await settle();
+  platform('ios');
+  view.rerender(tray({ onClosed }));
+  await settle();
+  vi.useFakeTimers();
+  const close = () => view.rerender(tray({ visible: false, onClosed }));
+  const open = () => view.rerender(tray({ onClosed }));
+  // Closed: the Modal hides at 220 ms, and UIKit's dismissal is under way.
+  close();
+  act(() => { vi.advanceTimersByTime(220); });
+  expect([dismissals.held, onClosed.mock.calls.length]).toEqual([1, 0]);
+  // Opened and closed again before it ends: the card leaves, and the Modal stays shown for the exit.
+  open();
+  close();
+  act(() => { vi.advanceTimersByTime(219); });
+  // UIKit's end of the first dismissal, then the exit's last millisecond, both before React renders the end: one
+  // commit holds the end and the Modal's second hide. Modal.js calls onDismiss in that commit's layout phase, before
+  // any of its effects run. (The end leaves the held count here, as endDismissal() does.)
+  dismissals.held -= 1;
+  act(() => {
+    dismissals.end?.();
+    vi.advanceTimersByTime(1);
+  });
+  expect(dismissals.held, 'hidden again, its dismissal under way').toBe(1);
+  expect(onClosed, 'the earlier end, in the commit that hides the Modal again').not.toHaveBeenCalled();
+  // The second hide's own end: closed, once.
+  endDismissal();
+  expect(onClosed).toHaveBeenCalledTimes(1);
+});
+
+test('on iOS an onClosed given while the dismissal is under way is the one called', async () => {
+  phoneFocus();
+  dismissals.late = true;
+  const first = vi.fn();
+  const latest = vi.fn();
+  const view = mountWallet(tray({ visible: false, onClosed: first }));
+  await settle();
+  platform('ios');
+  view.rerender(tray({ onClosed: first }));
+  await settle();
+  vi.useFakeTimers();
+  view.rerender(tray({ visible: false, onClosed: first }));
+  act(() => { vi.advanceTimersByTime(220); });
+  expect([dismissals.held, first.mock.calls.length]).toEqual([1, 0]);
+  // The Modal has hidden; a host that passes a new function on every render (P2-T16's whenClosed queue) does so
+  // before UIKit's dismissal ends.
+  view.rerender(tray({ visible: false, onClosed: latest }));
+  endDismissal();
+  expect([first.mock.calls.length, latest.mock.calls.length], 'calls: the onClosed given first, the one given last').toEqual([0, 1]);
+});
+
 test('on iOS a tray with no onClosed closes, its dismissal ends, and it opens again', async () => {
   phoneFocus();
   dismissals.late = true;
```

### The receipt (`PL/diffs/docs_implementation_receipts_tray-hardening.md.diff`)

```diff
diff --git a/docs/implementation/receipts/tray-hardening.md b/docs/implementation/receipts/tray-hardening.md
index 228a55e..64fa922 100644
--- a/docs/implementation/receipts/tray-hardening.md
+++ b/docs/implementation/receipts/tray-hardening.md
@@ -1,12 +1,12 @@
 # tray-hardening: Harden the Bun Wallet tray before its first hosts: the lock cover, a late dismissal, the drag reset and one tick
 
-- **Status:** built and verified locally on `fix/tray-hardening` (`.claude/worktrees/tray-hardening`), from `ecc00b7`. Not pushed. The independent review is the controller's, after this receipt. Under R87 this receipt is its own file; `premium-progress.md` is not edited.
-- **Base:** `ecc00b7`. The dispatch named `58be2e2`. The sync fast-forwarded the branch to `ecc00b7`, which changes three controller files only, none under `apps/`, `packages/` or `scripts/`. `shasum -a 256 -c` against the planner's `SHA256SUMS.base` printed `OK` for the head's three files (`apps/app/src/wallet/tray/Tray.tsx`, `Tray.render.test.tsx` and `trayGesture.test.ts`). At the base: `trayGesture.test.ts` 4 of 4, `Tray.render.test.tsx` 16 of 16.
+- **Status:** pushed, as PR #392 (`fix/tray-hardening`, `.claude/worktrees/tray-hardening`, into `claude/p1a-vault-core`), in three rounds. The Sonnet review approved round one at `784667b` (`.claude/controller/reviews/tray-hardening.md`), and the confirming review approved the fix round at `fc78376` (`.claude/controller/reviews/tray-hardening-confirm.md`). The head is the second fix round's commit (the last section). Under R87 this receipt is its own file; `premium-progress.md` is not edited.
+- **Base:** round one's: `ecc00b7`. The dispatch named `58be2e2`. The sync fast-forwarded the branch to `ecc00b7`, which changes three controller files only, none under `apps/`, `packages/` or `scripts/`. `shasum -a 256 -c` against the planner's `SHA256SUMS.base` printed `OK` for the head's three files (`apps/app/src/wallet/tray/Tray.tsx`, `Tray.render.test.tsx` and `trayGesture.test.ts`). At the base: `trayGesture.test.ts` 4 of 4, `Tray.render.test.tsx` 16 of 16. Each fix round merged `origin/claude/p1a-vault-core` into the branch again, and its own section gives its base (the fix round's merge is `33edab1`).
 - **What it fixes:** P2-T13's review (`.claude/controller/reviews/P2-T13.md`): m1's guard, m2, m3's reset, m4, m5, m6, n1 and n3, and n4's comment. P2-T16, the first host tray, was held until this lands.
 - **What changed:**
   - `Tray.tsx`:
     - Under the lock's cover nothing asks to close the tray: `closable` is `visible && !locked && !hidden`, so Android's back cannot close a covered tray and lose a draft (m1).
-    - On iOS, `onClosed` comes from the Modal's `onDismiss` only while the Modal is hidden (the render's `shown`, since the fix round below), so a dismissal that ends after the tray was shown again says nothing, even during a second exit or in the very commit that reopens it (m2). `shown` is not held until `onDismiss` (planner ruling P4).
+    - On iOS, `onClosed` comes from the Modal's `onDismiss` only when the Modal is hidden both in the commit that renders the end (the render's `shown`) and in the commit before (`showing`, refreshed with `closed`), since the second fix round below. So a dismissal that ends after the tray was shown again says nothing: during a second exit, in the very commit that reopens it, or in the commit that hides the Modal again (m2). `shown` is not held until `onDismiss` (planner ruling P4).
     - The drag is back in its place when the lock's cover comes or goes while the tray is open, so a drag the cover cuts off cannot leave the card pulled down (m3's reset).
     - A step change ticks only when the tray was open and uncovered in the commit before and still is: opening at another step in one render, a step change under the cover, and the cover lifting on another step play none (m4).
     - A swipe the system cancels springs back, even past the line (n1).
@@ -26,7 +26,7 @@
   - Focused: `trayGesture.test.ts` 4 passed, 0 failed; `Tray.render.test.tsx` 22 passed (22), no stderr; the catalogue's wallet sections `Test Files 2 passed (2)`, `Tests 18 passed | 572 skipped (590)`.
   - `test:app`: exit 0, `ℹ tests 34`, `ℹ pass 34`, `ℹ fail 0`. `test:unit`: exit 0, `ℹ tests 970`, `ℹ pass 970`, `ℹ fail 0`.
   - `git diff --check`: exit 0, no output. The check against `origin/claude/p1a-vault-core...HEAD` after the commit is reported in the final message, since this receipt cannot record its own commit.
-  - CI (R100, not run locally): the full `test:render` suite and the iOS export. This task adds 6 render cases and no file, and no bundled module.
+  - CI (R100, not run locally): the full `test:render` suite and the iOS export. Round one adds 6 render cases; the PR adds 12 over its three rounds (`Tray.render.test.tsx` has 16 at the base and 28 at the head), and no file or bundled module.
 - **SKIPPED:**
   - On a phone: a quick reopen on iOS while UIKit's dismissal ends; Android's back under the cover; a drag the cover cuts off; a swipe the system cancels (a call). No device or simulator here; the cases drive React Native's Modal and Gesture Handler's own handler.
   - `typecheck:routes` and `export:web` (no route, app config or app entry changes). The edge, API and database suites (nothing outside `apps/app` changed; Docker is stopped). `test:ops` (no package or lockfile change).
@@ -50,8 +50,8 @@
 ## Fix round: the review's m-1, m-2, n-1 and n-2
 
 - **The review:** `.claude/controller/reviews/tray-hardening.md` (Sonnet; Approved, no blocker or major). The controller folded m-1, m-2, n-1 and n-2 into PR #392 before it merges; n-3 stays a note for P2-T16. Brief: `.claude/controller/briefs/tray-hardening-fix.md` (rulings F1 to F10).
-- **Base:** `784667b` merged with `origin/claude/p1a-vault-core` at `6a727dc` as `33edab1`. It brings #391 (`apps/app/src/wallet/looks/WalletLooksProvider.tsx` and `WalletLooks.render.test.tsx`) and controller state under `.claude/`; nothing under `apps/app/src/wallet/tray/`, `apps/app/src/wallet/testing/` or `apps/app/src/ui/`. `shasum -a 256 -c` against the planner's `SHA256SUMS.base` printed 3 `OK` lines after the merge.
-- **m-1 (code):** the late iOS dismissal's guard read a ref of `shown` that a passive effect refreshed. `Modal.js` calls `onDismiss` from a `setState` callback in the layout phase of the commit that renders UIKit's end, before that commit's effects run, so when a reopen was batched into that commit the ref still read the hide, and `onClosed` fired with the tray open (the review's R-d, R-d2, R-d3, R-d5 and R-d5b). `dismissed` now reads this render's `shown` (`if (!shown) closed.current?.()`), and the `showing` ref is gone. A new case runs the review's R-d5b order: UIKit's end, then a tap on add, both pending before React renders, so one commit holds both (queued inside one `act`, the brief's F3).
+- **Base:** `784667b` merged with `origin/claude/p1a-vault-core` at `6a727dc` as `33edab1`. It brings #391 (`apps/app/src/wallet/looks/WalletLooksProvider.tsx`, `WalletLooks.render.test.tsx` and its receipt, `docs/implementation/receipts/wallet-looks-unstored.md`) and controller state under `.claude/`; nothing under `apps/app/src/wallet/tray/`, `apps/app/src/wallet/testing/` or `apps/app/src/ui/`. `shasum -a 256 -c` against the planner's `SHA256SUMS.base` printed 3 `OK` lines after the merge.
+- **m-1 (code):** the late iOS dismissal's guard read a ref of `shown` that a passive effect refreshed. `Modal.js` calls `onDismiss` from a `setState` callback in the layout phase of the commit that renders UIKit's end, before that commit's effects run, so when a reopen was batched into that commit the ref still read the hide, and `onClosed` fired with the tray open (the review's R-d, R-d2, R-d3, R-d5 and R-d5b). `dismissed` now reads this render's `shown` (`if (!shown) closed.current?.()`), and the `showing` ref is gone (the second fix round below brings it back beside `shown`, for the confirming review's c-m1). A new case runs the review's R-d5b order: UIKit's end, then a tap on add, both pending before React renders, so one commit holds both (queued inside one `act`, the brief's F3).
 - **m-2, n-1 and n-2 (cases):** a card that leaves stays where the finger let it go, also when the lock's cover comes and goes during the exit (mutant X1); once the cover lifts on the step it had under the cover, a step change ticks (D2); on iOS a tray with no `onClosed` closes, its dismissal ends without throwing, and it opens again (X4). The test file's Modal seam now ends a held dismissal as `Modal.js` does: a `setState` callback, in the layout phase of the commit that renders it.
 - **Files:** modified `apps/app/src/wallet/tray/Tray.tsx` (316 lines before, 317 after), `apps/app/src/wallet/tray/Tray.render.test.tsx` (713 before, 817 after; 22 cases before, 26 after) and this receipt. `trayGesture.test.ts` is unchanged.
 - **RED to GREEN:**
@@ -73,3 +73,32 @@
   - P2-T16 (the review's n-3): on iOS `onClosed` can come twice for two hides, and not at all for a Modal that never presented. `whenClosed` treats a second call as nothing and must not wait on one call per hide; its device check should ask whether UIKit sends a dismissal for a present it refused during a dismissal under way. Keep `whenClosed`'s queue in a ref: iOS's `onClosed` is the one the commit before the end's left.
   - P2-T16: the exit position is now pinned here; its case for a swipe during a save can drive `dragThrough()`.
   - Any later change to the iOS path of `Tray.tsx`: m-1's case queues UIKit's end and the tap inside one `act`, so one commit holds both (the brief's F3). Keep it so: on two separate tasks it passes or fails by the scheduler's timing.
+
+## Second fix round: the confirming review's c-m1, c-n1 and c-n2
+
+- **The review:** `.claude/controller/reviews/tray-hardening-confirm.md` (Sonnet; Approved on `fc78376`, no blocker or major). The controller folded its minor c-m1 and its nits c-n1 and c-n2 into PR #392 before it merges. Brief: `.claude/controller/briefs/tray-hardening-fix2.md` (rulings G1 to G8).
+- **Base:** `fc78376` merged with `origin/claude/p1a-vault-core`. Since `6a727dc`, the fix round's base, the integration branch changed only controller state under `.claude/`: after the merge, `git diff --stat fc78376 HEAD -- . ':!.claude'` printed nothing. `shasum -a 256 -c` against the planner's `SHA256SUMS.base` printed 3 `OK` lines after the merge.
+- **c-m1 (code):** the fix round's guard read only this render's `shown`. When UIKit's end of an earlier dismissal came while the card left again and was rendered in the same commit as the hide timer's `setShown(false)`, `shown` was false in that commit: the end said the tray closed, and the second hide's own end said it again. `dismissed` now says closed only if the Modal is hidden in the commit that renders the end and was hidden in the commit before: `if (!shown && !showing.current) closed.current?.()`, with the `showing` ref back and refreshed with `closed`, as round one had it. `Modal.js` calls `onDismiss` in that commit's layout phase, before its effects run, so the render's `shown` is this commit's and `showing` the commit before's. A reopen batched with the end (m-1) shows the Modal in this commit, and a second hide batched with it (c-m1) had it shown in the commit before: both say nothing. The comment above `dismissed` says both.
+- **c-m1 (case):** the review's HIDE-END, on the test file's own seam: close, hide, open and close again, then UIKit's first end and the exit's last millisecond inside one `act` (one commit holds the end and the Modal's second hide), then the second end. Nothing after the batch, and one `onClosed` after the second end. So the first round's H3 reasoning (its brief's P3, the fix round's F1) now holds in both orders: an earlier hide's end that comes during a second exit says nothing, rendered alone or in the commit that ends that exit, and that hide's own end says the tray closed, once.
+- **c-n1 (case):** which `onClosed` iOS's end calls: hide, pass a new `onClosed` while the dismissal is under way, then end; the new one is called once and the old one not. It pins code that was right, and kills the review's M3 (`dismissed` memoised on `[shown]`, calling the `onClosed` captured then).
+- **c-n2 (this receipt):** the Status and Base lines at the top; round one's CI line (the PR adds 12 render cases, not 6); the fix round's Base (the merge `33edab1` also brought #391's receipt). The guard's description under "What changed" and the fix round's m-1 line now say what the code does.
+- **Files:** modified `apps/app/src/wallet/tray/Tray.tsx` (317 lines before, 322 after), `apps/app/src/wallet/tray/Tray.render.test.tsx` (817 before, 873 after; 26 cases before, 28 after) and this receipt. `trayGesture.test.ts` is unchanged.
+- **RED to GREEN:**
+  - RED (the final test file over `fc78376`'s `Tray.tsx`): `typecheck:app` exit 0; `Tray.render.test.tsx` exit 1, `Tests 1 failed | 27 passed (28)`; HIDE-END fails on its assertion (1 `AssertionError`: `the earlier end, in the commit that hides the Modal again: expected "vi.fn()" to not be called at all, but actually been called 1 times`; the grep for `Cannot find module`, `Failed to resolve`, `SyntaxError`, `TypeError` and `ReferenceError` printed 0). c-n1's case passes there, by design: the code it pins is right.
+  - RED for c-n1's case (the final test file over `fc78376`'s `Tray.tsx` with the review's M3, the stale callback it pins against): `typecheck:app` exit 0; `Tray.render.test.tsx` exit 1, `Tests 2 failed | 26 passed (28)`: HIDE-END, and c-n1's case on its assertion (`calls: the onClosed given first, the one given last: expected [ 1, +0 ] to deeply equal [ +0, 1 ]`); the same grep printed 0.
+  - GREEN: `typecheck:app` exit 0; `trayGesture.test.ts` exit 0, `ℹ tests 4`, `ℹ pass 4`, `ℹ fail 0`; `Tray.render.test.tsx` exit 0, `Tests 28 passed (28)`, no `stderr |` line; the catalogue's wallet sections `Test Files 2 passed (2)`, 18 passed.
+- **Mutation check:** the planner's runner (`.claude/controller/scratch/tray-hardening-fix2-planner/tools/mutants.py`, run with `python3 -I`), 45 mutants, each applied alone, run against both of the tray's test files and restored (SHA-256 checked): 45 killed, 0 survived. `.claude/controller/scratch/tray-hardening-fix2-fixer/mutants.out` is identical to the planner's `logs/mutants.out` (`diff` prints nothing). The runner's `--check` mode printed 45 `APPLIES` lines.
+  - The fix round's 40, with H2, H3, H4, H12 and X4 written again for the new guard (H12, `784667b`'s guard, now changes the guard's line only).
+  - M3 (the review's, c-n1): killed by c-n1's case, and only it.
+  - H13 to H16 on the new guard (c-m1): it reads only this render's `shown` (`fc78376`'s guard); it says closed when either one is hidden; `showing` is written during the render; `showing` is never refreshed. HIDE-END kills each (H14 also m-1's case).
+- **Gate** (worktree root; R100's fast local gate; logs in `.claude/controller/scratch/tray-hardening-fix2-fixer/`):
+  - `typecheck:app`: exit 0.
+  - Focused: `trayGesture.test.ts` `ℹ tests 4`, `ℹ pass 4`, `ℹ fail 0`; `Tray.render.test.tsx` `Tests 28 passed (28)`, no stderr; the catalogue's wallet sections (`CatalogueScreen.render.test.tsx` and `screenReader.render.test.tsx`, `-t "bw-"`) `Test Files 2 passed (2)`, 18 passed.
+  - `test:app`: exit 0, `ℹ fail 0`. `test:unit`: exit 0, `ℹ fail 0`. Their totals are not recorded (R100).
+  - `git diff --check`: exit 0, no output. The check against `origin/claude/p1a-vault-core...HEAD` is in the final message, since this receipt cannot record its own commit.
+  - CI (R100): the full `test:render` suite (with `Tray.render.test.tsx` at 28 cases) and the iOS export.
+- **SKIPPED:** as in the first round. The device check for a quick reopen on iOS should also ask how long UIKit's end can lag: c-m1's window needs it to outlast a whole exit after two more taps.
+- **Deviations:** none.
+- **Notes for later tasks:**
+  - P2-T16: iOS's `onClosed` no longer comes early when an earlier end renders in the commit of a second hide. n-3 stands: two hides that both reach the Modal give two calls, and a Modal that never presented gives none, so `whenClosed` treats a second call as nothing. Which `onClosed` iOS's end calls is pinned (c-n1): the one the commit before the end's left.
+  - Any later change to the iOS path of `Tray.tsx` or to the test's Modal seam: m-1's case and HIDE-END each queue UIKit's end with another update inside one `act`, so one commit holds both. Keep it so: in two acts the end commits alone, m-1's case then fails on correct code, and HIDE-END passes on `fc78376`'s guard.
```
