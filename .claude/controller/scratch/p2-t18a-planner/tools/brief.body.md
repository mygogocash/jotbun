# Brief P2-T18a: Before the wallet shell: today's total held to one moment, the private announcement pinned, and the new-wallet flow left once

You are the implementer for plan P2, Task P2-T18a, the first half of P2-T18 as its planner split it. The second half is the wallet shell (`briefs/P2-T18.md`). This half carries the followups that must land before the shell mounts the saved toast's host and hides the tab bar on `/spend/wallet/*`. All of them are small fixes or pins in files that have merged:

- **today's money out** in the saved toast is shown only when the read and the device diary are one moment (P2-T17's reviews' m1: races A and B, and a diary that closes mid-read);
- **private mode's iOS announcement** gets its pin (their m2, probe PV1);
- **the new-wallet flow** is left once, and its card's place gets a `nativeID`; step 2's back after a refusal is pinned; the editor's leave-once ref survives React's development double run (P2-T21's confirming review: m2, m1, n1 and n2);
- **P2-T21's two receipts** say what the code now does, and gain the review's m3 among their risks.

The planner wrote every file below and proved it in a scratch copy of the integration head:

- **RED** on the base code and one typed stub: 1 of 8 Node cases and 6 of 54 render cases fail, each on an `AssertionError`. The others pass at RED, among them the two cases that pin behaviour already right.
- **GREEN**, then 20 mutants, all killed, every failing case an `AssertionError`.
- **The fast local gate** of R100.

Do exactly what this brief says.

Read first, in this order:

1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. R100 applies: the fast local gate only (Step 6), and no whole-suite total anywhere; CI runs the whole suites on the PR. R87 applies: your receipt is its own file, `docs/implementation/receipts/P2-T18a.md`; do not edit `premium-progress.md`.
2. The plan task this half belongs to: `docs/superpowers/plans/2026-10-25-jotbun-p2-bun-wallet-core.md`, `### Task P2-T18` (lines 1053 to 1091), and the Global Constraints (lines 82 to 108).
3. The reviews and followups it carries: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/P2-T17.md` (m1, m2) and `P2-T17-second.md` (m1, m2b), `P2-T21-confirm.md` (m1, m2, m3, n1, n2), and `/Users/kunanonjarat/Developer/jotbun/.claude/controller/followups.md` lines 699 to 716 (P2-T21's block and the owner's note on its m3) and 832 to 849 (P2-T17's block).
4. The receipts it builds on: `docs/implementation/receipts/P2-T17.md`, `P2-T21.md`, `P2-T21-fix.md`.

## Paths and rules used below

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t18a` (branch `p2/t18a-shell-guards`, made by the orchestrator from `origin/claude/p1a-vault-core`). Work only here.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t18a`, your scratch folder. Create it with `mkdir -p`. Logs and the commit message go there. Never keep anything under `/private/tmp`.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t18a-planner`, the planner's folder. Read it and copy from it; never write into it. It holds:
  - `real/`: the final version of the ten files this task changes, at their repo paths (the receipt is yours);
  - `stubs/`: the RED form of `savedMoment.ts`: the base with `todayOutMinor`'s new optional input, unused, so RED typechecks;
  - `orig/`: the ten files as they are at the base;
  - `diffs/`: one diff per changed file, with repo paths and full blob ids so `git apply --3way` can merge them, and `p2-t18a.patch` (the whole task, for reading). `logs/applycheck.log` shows the patch turns `orig/` into `real/` byte for byte;
  - `tools/`: `files.txt`, `stage.py` (puts a tree in its base, RED or GREEN form and checks each file's sha256), `mutants.py` (the mutant runner), `batches.txt` (one batch), `merge_mutants.py`, `first_errors.py` (the error kind of every failing case), `diffs.py`, `sums.sh`, `brief.body.md`, `rulings.md` and `fill_brief.py` (how this brief was built: the Appendix prints the `diffs/` diffs; those files, never this page, are the reference, since something after the planner strips trailing whitespace from the briefs, a diff's one-space blank context lines among it);
  - `SHA256SUMS` (every file above) and `SHA256SUMS.logs` (everything in `logs/`, which the state commits leave out).
- Every shell call starts in a fresh directory, so type full paths. Below, WT, S and PL stand for the full paths above: type the full path. Git: `/usr/bin/git -C WT <command>`, one git command per call. npm: `cd WT && npm run <script>`. Focused Node files: `cd WT/apps/app && node scripts/test-unit.mjs <files>`. Focused render files: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose <files>`.
- The shell is zsh, which does not split a `$LIST` in a `for` loop. Every step below names its files one by one.
- This task needs no heavy lock: no database suite and no workers pool. Docker is stopped and stays stopped.
- To compare checksums: `shasum -a 256 <file>` and compare with the line for the same path in `PL/SHA256SUMS`.
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests or code to make them pass. The only results that may differ from this brief's are the base counts in Step 1.3 (if a merge since added cases to one of those files, record the new count), the catalogue's skipped count in Step 6.6, and a load flake: a case that times out under load in a file this task does not touch. Rerun that file alone once and record both runs.

## Scope

| File | Change |
| --- | --- |
| `apps/app/src/wallet/saved/savedMoment.ts` | `todayOutMinor` takes an optional `readRevision` and leaves out an acknowledged command committed at or before it (race B, P4); its header and doc comment say so. 96 lines before, 104 after. |
| `apps/app/src/wallet/saved/savedMoment.test.ts` | One case (P4). 122 lines before, 146 after. |
| `apps/app/src/wallet/saved/SavedToastHost.tsx` | When the read lands, the total is unknown if the diary moved: it applied a revision past the read's, or it was open when the toast began and is not now (race A and the closed diary, P3); the read's revision goes to `todayOutMinor` (P4); its header says so. 263 lines before, 271 after. |
| `apps/app/src/wallet/saved/SavedMoment.render.test.tsx` | Four cases at the end, with their helper `raced` (P3, P4, P6). 633 lines before, 698 after. |
| `apps/app/src/wallet/wallets/NewWalletFlow.tsx` | `leave()` runs once (P7), and the card's place has a `nativeID`, with its comment corrected (P8). 419 lines before, 425 after. |
| `apps/app/src/wallet/wallets/NewWallet.render.test.tsx` | Two cases (P7, P9); the setup case's last part on a mount of its own (P7); one assertion in the drop case (P8). 646 lines before, 697 after. |
| `apps/app/src/wallet/wallets/WalletEditScreen.tsx` | The leave-once ref is set again at each mount (P10). 421 lines before, 427 after. |
| `apps/app/src/wallet/wallets/WalletEdit.render.test.tsx` | `StrictMode` imported, and one case (P10). 650 lines before, 663 after. |
| `docs/implementation/receipts/P2-T21-fix.md` | Lines 34 and 35 corrected, and m3 added to the risks after line 78 (P11). |
| `docs/implementation/receipts/P2-T21.md` | Two device-check lines corrected (lines 67 and 80, P11). |
| `docs/implementation/receipts/P2-T18a.md` | **new**. Your receipt (R87). |

Not in this task: the wallet shell, its routes and every `wallet/home` file (P2-T18); the add tray host and its suite (#460's); `SaveFlight.tsx`, `copy.ts`, the catalogue's saved and wallets sections (read only); `WalletsListScreen.tsx`, `WalletFields.tsx`, `CorrectionTray.tsx` and the other wallets files; `en.json` and `th.json`; any package or lockfile; `premium-progress.md`.

## Planner rulings (the calls this brief makes, with the reason for each)

@@RULINGS@@

---

## Step 0: Sync and check the base

1. `/usr/bin/git -C WT fetch origin claude/p1a-vault-core`, then `/usr/bin/git -C WT merge --no-edit origin/claude/p1a-vault-core`. Expected: "Already up to date." or a fast-forward.
2. `/usr/bin/git -C WT rev-parse --short HEAD`. Record it as the base in the receipt.
3. `/usr/bin/git -C WT diff --stat 90006f03 HEAD -- apps/app packages docs/implementation/receipts/P2-T21.md docs/implementation/receipts/P2-T21-fix.md`. Expected: nothing, or only files of the approved PRs waiting on CI (P15): #460's (`wallet/add/*`, `screens/redesign/entry/entrySave.ts` and its render test, `spend/v1/redesign/quickAddModel.ts` and its test, `spend/v1/ai/draftReview.ts` and its test), #461's (`spend/v1/ai/aiResources.ts` and its test, `dev/catalogue/companion/companionSections.tsx`, `screens/redesign/ai/AskBunScreen.render.test.tsx`, `packages/contracts/src/index.ts`, `packages/contracts/src/v1/ai.ts`), #462's (`storage/diaryRepository.test.ts`), #456's (`wallet/records/*`, `app/spend/record/[id].tsx`, `screens/redesign/SpendRoutes.render.test.tsx`, `ui/dateStep.ts` and its test, `dev/catalogue/wallet/recordSections.tsx` and `recordScreens.tsx`) and P2-T18's (`wallet/home/*`, `app/spend/_layout.tsx`, `app/spend/add.tsx`, `screens/redesign/SpendLayout.render.test.tsx`, `screens/redesign/account/AnalyticsConsentScreen.render.test.tsx`). Record any in the receipt. If any of the ten files in Scope is listed, report BLOCKED with the list.
4. `python3 -I PL/tools/stage.py PL WT check-base`. Expected: 10 lines starting `OK`, then `check-base: 10 files, 0 not as expected`.
5. `cd PL && shasum -a 256 -c SHA256SUMS | grep -vc ': OK$'`. Expected: `0`.

## Step 1: Install and record the base

1. If `WT/node_modules` is missing: `cd WT && npm ci --ignore-scripts --no-audit --no-fund`. Expected: exit 0.
2. `mkdir -p S`.
3. The four focused files at the base:
   - `cd WT/apps/app && node scripts/test-unit.mjs src/wallet/saved/savedMoment.test.ts > S/base-unit.log 2>&1; echo $?`. Expected: `0`, `ℹ tests 7`, `ℹ pass 7`.
   - `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/saved/SavedMoment.render.test.tsx src/wallet/wallets/NewWallet.render.test.tsx src/wallet/wallets/WalletEdit.render.test.tsx > S/base-render.log 2>&1; echo $?`. Expected: `0`, `Test Files  3 passed (3)`, `Tests  47 passed (47)` (16, 16 and 15; `PL/logs/base-render.log`).

## Step 2: The tests and the stub

1. `python3 -I PL/tools/stage.py PL WT red`. Expected: 10 lines starting `OK`, then `red: 10 files, 0 not as expected`. This copies the four test files in their final form, `savedMoment.ts` as its stub, and leaves the other five files as at the base.
2. The stub differs from the base in its first line (`// RED stub (P2-T18a): ...`) and in `todayOutMinor`'s input type, which gains `readRevision?: string`; it does nothing with it.

## Step 3: RED

1. `cd WT && npm run typecheck:app`. Expected: exit 0.
2. `cd WT/apps/app && node scripts/test-unit.mjs src/wallet/saved/savedMoment.test.ts > S/red-unit.log 2>&1; echo $?`. Expected: `1`, `ℹ tests 8`, `ℹ pass 7`, `ℹ fail 1`.
3. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/saved/SavedMoment.render.test.tsx src/wallet/wallets/NewWallet.render.test.tsx src/wallet/wallets/WalletEdit.render.test.tsx > S/red-render.log 2>&1; echo $?`. Expected: `1`, `Test Files  3 failed (3)`, `Tests  6 failed | 48 passed (54)`.
4. `python3 -I PL/tools/first_errors.py S/red-render.log` and `python3 -I PL/tools/first_errors.py S/red-unit.log`. Expected: each ends `1 logs, 0 with a failing case that is not an AssertionError (or with none)` and exits 0.
5. The failing cases are the planner's:
   ```bash
   grep -E "^ +× " S/red-render.log | sed -E 's/ [0-9]+ms$//' | LC_ALL=C sort > S/red-render.list
   diff S/red-render.list PL/logs/red-render.list
   grep -E "^✖ " S/red-unit.log | grep -v "^✖ failing tests:" | sed -E 's/ \([0-9.]+ms\)$//' | LC_ALL=C sort -u > S/red-unit.list
   diff S/red-unit.list PL/logs/red-unit.list
   ```
   Expected: both `diff`s print nothing. The six render cases: race A, race B and the closed diary (`SavedMoment`); the flow left once and the drop's place (`NewWallet`); the editor under StrictMode (`WalletEdit`). The Node case: today's money out leaving out a command acknowledged by the read's revision. PV1 and the refusal case pass at RED: they pin behaviour that is already right (P6, P9).

## Step 4: GREEN

1. `python3 -I PL/tools/stage.py PL WT green`. Expected: 10 lines starting `OK`, then `green: 10 files, 0 not as expected`. The source diffs are in the Appendix, for reference.
2. `cd WT && npm run typecheck:app`. Expected: exit 0.
3. `cd WT/apps/app && node scripts/test-unit.mjs src/wallet/saved/savedMoment.test.ts > S/green-unit.log 2>&1; echo $?`. Expected: `0`, `ℹ tests 8`, `ℹ pass 8`, `ℹ fail 0`.
4. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/saved/SavedMoment.render.test.tsx src/wallet/wallets/NewWallet.render.test.tsx src/wallet/wallets/WalletEdit.render.test.tsx > S/green-render.log 2>&1; echo $?`. Expected: `0`, `Test Files  3 passed (3)`, `Tests  54 passed (54)`, and `grep -cE "stderr \||Unhandled|not wrapped in act" S/green-render.log` prints `0`.
5. `/usr/bin/git -C WT status --short`. Expected: exactly the ten files of Scope modified (` M`), nothing else.

## Step 5: Mutation check

1. `mkdir -p S/mutant-batches S/mutant-logs`.
2. `cd PL && python3 -I tools/mutants.py WT S/mutant-logs $(sed -n 1p tools/batches.txt) > S/mutant-batches/batch-1.out 2>&1; echo $?`. About a minute. Expected: `0`; last line `20 killed, 0 survived, 0 not as expected`.
3. `python3 -I PL/tools/merge_mutants.py PL/tools/mutants.py S/mutant-batches S/mutants.out`. Expected: `20 lines; 20 killed, 0 survived (0 equivalent), 0 not as expected`, exit 0. Then `diff S/mutants.out PL/logs/mutants.out`. Expected: no output.
4. `python3 -I PL/tools/first_errors.py S/mutant-logs`. Expected: last line `20 logs, 0 with a failing case that is not an AssertionError (or with none)`, exit 0.
5. `python3 -I PL/tools/stage.py PL WT green`. Expected: `green: 10 files, 0 not as expected`. And `/usr/bin/git -C WT status --short`: as in Step 4.5.

## Step 6: Fast local gate (R100)

From WT, each with its log in S:

1. `npm run typecheck:app`: exit 0.
2. `npm run test:app > S/gate-test-app.log 2>&1; echo $?`: `0`, with `ℹ fail 0`.
3. `npm run test:unit > S/gate-test-unit.log 2>&1; echo $?`: `0`, with `ℹ fail 0` (the Hermes guards included).
4. The four routes tests (the controller's rule: the flow and the editor are screens the wallet routes load):
   ```bash
   cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/screens/redesign/SpendRoutes.render.test.tsx src/screens/redesign/account/AccountRoutes.render.test.tsx src/screens/redesign/insights/InsightsRoutes.render.test.tsx src/screens/redesign/planning/PlanningRoutes.render.test.tsx > S/gate-routes.log 2>&1; echo $?
   ```
   Expected: `0`, `Test Files  4 passed (4)`, no failed case.
5. The eight kit render files that import the wallet catalogue index:
   ```bash
   cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/card/CardStack.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/wallet/lock/Lock.render.test.tsx src/wallet/add/AmountStep.render.test.tsx src/wallet/wallets/WalletsList.render.test.tsx > S/gate-kit8.log 2>&1; echo $?
   ```
   Expected: `0`, `Test Files  8 passed (8)`, no failed case. (One `stderr | src/wallet/testing/walletHarness.render.test.tsx > the bun intensity can change ...` block is that suite's own base noise.)
6. The catalogue's saved and wallets sections, in the every-section and screen-reader suites (their screens change):
   ```bash
   cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "bw-saved|bw-wallet" > S/gate-catalogue.log 2>&1; echo $?
   ```
   Expected: `0`, `Test Files  2 passed (2)`, `Tests  24 passed | ... skipped (...)` (24 passed; the skipped count is the rest of the catalogue).
7. `/usr/bin/git -C WT diff --check`: no output.

Not run, and why (put this in the receipt): `typecheck:routes` and `export:web` (no route, config or app entry changes); the full render suite, the iOS export, the database suites and `test:ops` (CI, R100); the edge suites (nothing outside `apps/app` and two receipts). Device checks: SKIPPED (P16).

## Step 7: Receipt

Write `docs/implementation/receipts/P2-T18a.md` in the house style (see `docs/implementation/receipts/P2-T17.md`), with your own numbers where they differ from these. Start from:

```markdown
# P2-T18a: Before the wallet shell: today's total held to one moment, the private announcement pinned, and the new-wallet flow left once

- **Status:** built and verified locally on `p2/t18a-shell-guards` (`.claude/worktrees/p2-t18a`), from `<base>`. Not pushed. The reviews are the controller's. Under R87 this receipt is its own file. The first half of P2-T18 as its planner split it; the wallet shell (P2-T18) merges after it.
- **Files:** changed `apps/app/src/wallet/saved/savedMoment.ts`, `savedMoment.test.ts` (1 case), `SavedToastHost.tsx`, `SavedMoment.render.test.tsx` (4 cases), `apps/app/src/wallet/wallets/NewWalletFlow.tsx`, `NewWallet.render.test.tsx` (2 cases, one split, one assertion), `WalletEditScreen.tsx`, `WalletEdit.render.test.tsx` (1 case), `docs/implementation/receipts/P2-T21-fix.md` and `P2-T21.md` (corrected lines, m3); created this receipt.
- **What changed:** (today's total: the moved diary and the read's revision; PV1; the flow's leave once and its place's nativeID; the editor's ref; the receipts.)
- **RED to GREEN:** base: Node 7 of 7, render 47 of 47. RED: Node 1 of 8 fails, render 6 failed and 48 passed (54), every failing case an `AssertionError`. GREEN: Node 8 of 8, render 54 of 54. (List the 7 failing case names; say PV1 and the refusal case pass at RED by design.)
- **Mutation check:** 20 mutants, all killed, every failing case an `AssertionError`. (One line per group, with the case that kills it.)
- **Gate:** (every command in Step 6 with its result.)
- **Deviations:** P3 (the closed diary: open when the toast began), P11 (two other tasks' receipts corrected, as the review asked).
- **SKIPPED:** device and simulator: the new card's drop on a phone with the nativeID (about 200 pt and 44 pt of overshoot), VoiceOver hearing the masked toast in private mode, the two quick presses on a phone. Whole suites: CI (R100).
- **Notes for later tasks:** (P16.)
```

## Step 8: Commit

1. `/usr/bin/git -C WT add apps/app/src/wallet/saved/savedMoment.ts apps/app/src/wallet/saved/savedMoment.test.ts apps/app/src/wallet/saved/SavedToastHost.tsx apps/app/src/wallet/saved/SavedMoment.render.test.tsx apps/app/src/wallet/wallets/NewWalletFlow.tsx apps/app/src/wallet/wallets/NewWallet.render.test.tsx apps/app/src/wallet/wallets/WalletEditScreen.tsx apps/app/src/wallet/wallets/WalletEdit.render.test.tsx docs/implementation/receipts/P2-T21-fix.md docs/implementation/receipts/P2-T21.md docs/implementation/receipts/P2-T18a.md`
2. `/usr/bin/git -C WT status --short`: those 11 staged, nothing else.
3. Write the message to `S/commit-message.txt`:
   ```
   Show today's total only when the read and the diary agree, and leave the new-wallet flow once

   Before the wallet shell mounts the saved toast's host: today's money out
   is shown only when the device diary has applied nothing past the read's
   revision and is still open, and an acknowledged save committed by the
   read's revision that the read does not list counts as deleted. A test
   holds that iOS hears no amount in private mode. The new-wallet flow is
   left once, its card's place forms a stacking context on a phone, and
   the editor's leave-once ref survives React's development double run.
   P2-T21's receipts say so.

   Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
   ```
4. `/usr/bin/git -C WT commit -F S/commit-message.txt`, then `/usr/bin/git -C WT log --oneline -1` and `/usr/bin/git -C WT show --stat HEAD`: 11 files.

## Your final message

As the protocol says: `STATUS: DONE` (or `STATUS: BLOCKED` with the exact blocker) on the first line; the commit SHA and branch; files changed; RED and GREEN counts; mutants (20 of 20 killed); each gate command with its result; SKIPPED items; deviations (P3, P11); and what the reviewer should look at first: the moved-diary rule and its four cases (P3, P4), and the two receipts' corrected lines (P11).

---

## Appendix: the source changes, for reading (`PL/diffs/` is the reference)

@@APPENDIX@@
