# Brief P2-T33 fix round: the receipt photo under the lock, and both reviews' minors and pins (R107)

You are the fixer for the P2-T33 fix round. PR #406 (branch `p2/t33-face-id-lock`, commit `5844e4c1`) adds the Face ID lock. Its first review (`reviews/P2-T33.md`) approves it with four minors and six nits. Its second review, the privacy one (`reviews/P2-T33-second.md`), says **Needs fixes** for one major:

- **M1.** The record's receipt photo shows over the locked app. `ReceiptViewer` (`apps/app/src/screens/redesign/import/ReceiptParts.tsx`) is a full-screen `Modal` of its own and never reads `useLockCover()`. A Modal draws above the app's root, so the gate's cover lies under it: with the lock on, the photo stays drawn, named and pressable over the lock screen.
- **The controller's ruling R107** (11 Nov, `handover.md` under "#406 (P2-T33)"):
  - the viewer draws the cover as `Sheet` does, and every `Modal` in `apps/app/src` is swept;
  - the first review's m2, m3, m4 and n4, and the second's m2 to m5 and n1, are fixed;
  - the first review's n1, n2, n3 and n5 are pinned, and its n6 is fixed if cheap;
  - the first review's m1 and the second's m1 and m6 are carried, not fixed;
  - every new guard gets a mutant, and every RED fails on an assertion.
- **The controller's leave:** you may edit `ReceiptParts.tsx` and the other Modal files (this round needs none of the others), and `ui/a11y.ts`.

The planner wrote every file below and proved it in scratch copies of `5844e4c1`:
- RED: the round's tests on `5844e4c1`'s code, with one typed stub (`lockModel.ts` gets its two new exports as pass-throughs). Every new case that guards a fix fails on an assertion;
- the pins whose code is already right: nine review survivors, each killed by its new pin on `5844e4c1`'s code;
- GREEN;
- 166 mutants, all killed: the first round's 121, re-aimed where this round moved their text, and 45 new;
- R100's fast local gate.

You copy the planner's files, check them by checksum, prove RED, the pins, GREEN and the mutants in your own worktree, run the gate, write the receipt and commit. Do exactly what this brief says.

Read first:
1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. R100 applies: the fast local gate only, and no whole-suite total anywhere. R87 applies: your receipt is its own new file, `docs/implementation/receipts/P2-T33-fix.md`. Do not edit `premium-progress.md` or `receipts/P2-T33.md`.
2. The two reviews: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/P2-T33.md` (m1 to m4, n1 to n6) and `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/P2-T33-second.md` (M1, m1 to m6, n1).

## Paths and rules

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t33` (branch `p2/t33-face-id-lock`, head `5844e4c1`, `node_modules` installed). Work only here.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t33-fix`, your scratch folder. Create it with `mkdir -p`. Logs and the commit message go there. Never keep anything under `/private/tmp`.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t33-fix-planner`, the planner's folder. Read it and `cp` from it; never write into it. It holds:
  - `real/`: the round's eleven files at their repo paths, nine changed and two new (`files.txt` lists them);
  - `orig/`: `5844e4c1`'s nine (each checked against `git show 5844e4c1:<path>`);
  - `stubs/`: the RED form of `lockModel.ts`;
  - `diffs/`: one diff per file, `<path with / as _>.diff`, with the paths `a/<repo path>` and `b/<repo path>`. They are for reading: the planner checked that each turns `orig/` into `real/` byte for byte (`git apply --whitespace=error-all`). The code diffs are also in the appendix;
  - `tools/`: `mutants.py` (the runner), `stage.py` (the planner's stages: `orig`, `red`, `green`) and `sums.py` (writes the kit's checksums);
  - `files.txt` (the eleven) and `shared.txt` (the four that are not P2-T33's own files: `ReceiptParts.tsx`, `sync/announce.ts`, `ui/Sheet.tsx` and `ui/a11y.ts`);
  - `SHA256SUMS` (the kit) and `SHA256SUMS.logs` (the planner's `logs/`);
  - four lists to check WT with `shasum -a 256 -c`, paths relative to WT:
    - `SHA256SUMS.orig-in-wt`: `5844e4c1`'s nine files;
    - `SHA256SUMS.red-in-wt`: the RED stage's eleven (the four tests and `copy.ts` from `real/`, `lockModel.ts` from `stubs/`, the five other code files from `orig/`);
    - `SHA256SUMS.real-in-wt`: the eleven `real/` files;
    - `SHA256SUMS.datechip-in-wt`: `5844e4c1`'s `apps/app/src/ui/DateChip.tsx`, which mutants MS1 and MS2 edit and the runner restores.
- Every shell call starts in a fresh directory, so type full paths. Below, WT, S and PL stand for the full paths above. Git: `/usr/bin/git -C WT <command>`, one git command per call. Focused Node files: `cd WT/apps/app && npm run test:unit -- <files>`. Focused render files: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts <files>`.
- No heavy lock is needed: no database suite and no workers pool. Docker is stopped and stays stopped.
- **Do not merge the integration branch into this branch.** The fix commit goes straight on top of `5844e4c1` (ruling P1).
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests or code to make them pass. One exception: a load flake, a case that times out under load in a file this round does not touch. Rerun that file alone once, and record both runs.
- Every log is your own run. Never copy the planner's logs in place of one.

## Scope

| File | Change |
| --- | --- |
| `apps/app/src/screens/redesign/import/ReceiptParts.tsx` | **shared** (R7's; R107's leave). `ReceiptViewer` reads `useLockCover()`: while hidden it draws `<LockCoverArt />` in place of the photo, Android's back asks nothing, the web layer is unnamed (P2). |
| `apps/app/src/ui/a11y.ts` | **shared** (the kit's; R107's leave). A quiet flag the gate sets while its cover is up: `setQuietUnderLockCover(quiet)`. `announcePolitely` says nothing while it is set, and `announceOverLockCover` is the lock's own way past it (P10). |
| `apps/app/src/sync/announce.ts` | **shared**, one line. `announceStatus` goes through `announcePolitely`, so it is quiet under the cover too (P10). |
| `apps/app/src/ui/Sheet.tsx` | **shared** (P2-T33 changed it). A comment only: under the cover a sheet's children unmount, so a child's own state starts again (P14). |
| `apps/app/src/ui/lockCover.test.ts` | **new**, Node, 2 cases. The Modal sweep, read from the sources (P3). |
| `apps/app/src/wallet/lock/LockGate.tsx` | The first ask waits for the phone; an opening counts as asked once its prompt starts; `finally` resets; the port's types; turning on stored fail-closed; quiet below the cover; the keyboard; an unreadable setting turns off silently (P4 to P12). |
| `apps/app/src/wallet/lock/lockModel.ts` | `authResultOf` and `availabilityOf`; `afterRecheck` turns off only on `canLock === false` (P8). |
| `apps/app/src/wallet/lock/copy.ts` | One line: `lock.notStored` (P9, P20). |
| `apps/app/src/wallet/lock/lockModel.test.ts` | One case added, and the Thai-lines case counts four extra lines (11 cases before, 12 after). |
| `apps/app/src/wallet/lock/Lock.render.test.tsx` | 14 cases added (24 before, 38 after); `Below` draws its amount as a heading, and the first case's vacuous line is made real (P13). |
| `apps/app/src/wallet/lock/LockRoute.render.test.tsx` | **new**, render, 2 cases. The route's `Redirect` and `?setup=1` (P13). |
| `docs/implementation/receipts/P2-T33-fix.md` | **new**. Your receipt (R87). |

Not in this round: `index.ts` and `draftText.test.ts` (P2-T14's merge is the controller's, ruling P17); `CustomerSpendScreen.tsx`, `SpendDatePicker.tsx`, `SpendNewCategorySheet.tsx` and `SpendMediaPermissionPrimer.tsx` (left, P3); `Tray.tsx`, `lockCover.tsx`, `LockedScreen.tsx`, `LockSetupView.tsx`, `LockSetupScreen.tsx`, `LockSettingsRow.tsx`, `lockSections.tsx`, the route `app/settings/lock.tsx` (read and tested, never changed); `en.json` and `th.json`; any package or lockfile; `premium-progress.md`.
