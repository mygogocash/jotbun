# Brief P2-T18: The wallet shell: the layout order, the tab bar, the + button and the host mounts

You are the implementer for plan P2, Task P2-T18. You add the Bun Wallet shell: the spend layout's wallet branch (inside the device diary and Bun's AI help, around History's keep and the screen, with the consent question in its place while it is unanswered), and `WalletShell`, which nests the shared v1 resources, the looks kept on the phone, the card frames, the saved toast's host and the one add tray host around a root that holds the screen, the floating + and the tab bar (กระเป๋า and สรุป as tabs, ฉัน as a link to Settings), with Magic Tap opening the add tray. In the wallet area, `/spend/add` opens the shell's tray over Home. The planner wrote every file below and proved it in a scratch copy of the integration head: RED on typed stubs (8 of 8 Node cases and 15 render cases fail, each on an `AssertionError`), GREEN, 87 mutants (86 killed, every failing case an `AssertionError`, and 1 equivalent), the neighbouring suites, the routes tests, the kit files, the web export and the fast local gate of R100. Do exactly what this brief says.

**This task is the second half of P2-T18 as the planner split it (P2).** The first half, P2-T18a (`briefs/P2-T18a.md`: today's-total guards, the private-mode announcement pin, and the new-wallet flow's one way out), shares no file with this one, so both can be built at once. **Merge P2-T18a first.** The followups ask for its guards before the shell mounts `SavedToastHost` and hides the bar on `/spend/wallet/*`. This brief does not check for P2-T18a; the controller keeps the merge order.

Read first, in this order:

1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. R100 applies: the fast local gate only (Step 6), and no whole-suite total anywhere; CI runs the whole suites on the PR. R87 applies: your receipt is its own file, `docs/implementation/receipts/P2-T18.md`; do not edit `premium-progress.md`.
2. The plan task: `docs/superpowers/plans/2026-10-25-jotbun-p2-bun-wallet-core.md`, `### Task P2-T18` (lines 1053 to 1091); W13 and W34 (lines 50 and 71); the Shared files paragraph (lines 15 to 35: `_layout.tsx`, `spendLayoutOrder.test.ts`, `WalletShell.tsx`); the Global Constraints (lines 82 to 108, the R72 traps above all: react-native-web drops `onMagicTap`).
3. The receipts this task builds on: `docs/implementation/receipts/P2-T16.md` and `P2-T16-fix.md` (the add tray host and its bound), `P2-T17.md` (the saved toast's host and `noticeOf`), `P2-T12.md` (the card frames), `1D-T8.md` (the consent question in the spend layout).

## Paths and rules used below

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t18` (branch `p2/t18-wallet-shell`, made by the orchestrator from `origin/claude/p1a-vault-core`). Work only here.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t18`, your scratch folder. Create it with `mkdir -p`. Logs and the commit message go there. Never keep anything under `/private/tmp`.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t18-planner`, the planner's folder. Read it and copy from it; never write into it. It holds:
  - `real/`: the final version of the 12 files this task creates or changes, at their repo paths (the receipt is yours);
  - `stubs/`: the RED form (typed stubs) of `shellRoutes.ts`, `WalletTabBar.tsx`, `AddButton.tsx` and `WalletShell.tsx`;
  - `orig/`: the five existing files this task changes, as they are at the base;
  - `diffs/`: one diff per changed existing file, with repo paths and full blob ids so `git apply --3way` can merge them, and `p2-t18.patch` (the whole task, for reading). `logs/applycheck.log` shows the patch turns `orig/` into `real/` byte for byte;
  - `tools/`: `files.txt` (the 12 files, `new` or `shared`), `stage.py` (puts a tree in its base, RED or GREEN form and checks each file's sha256), `mutants.py` (the mutant runner), `batches.txt` (its three batches), `merge_mutants.py` (joins the batches), `first_errors.py` (the error kind of every failing case), `diffs.py`, `sums.sh`, `brief.body.md`, `rulings.md` and `fill_brief.py` (how this brief was built: the Appendix prints the `real/` files and the `diffs/` diffs; those files, never this page, are the reference, since something after the planner strips trailing whitespace from the briefs, a diff's one-space blank context lines among it);
  - `compat/files.txt`: the ten files of #460 (P3-T13) the planner laid over a second tree (`compat-tree/`) to prove this brief also works once #460 merges (P3);
  - `SHA256SUMS` (every file above) and `SHA256SUMS.logs` (everything in `logs/`, which the state commits leave out).
- Every shell call starts in a fresh directory, so type full paths. Below, WT, S and PL stand for the full paths above: type the full path. Git: `/usr/bin/git -C WT <command>`, one git command per call. npm: `cd WT && npm run <script>`. Focused Node files: `cd WT/apps/app && node scripts/test-unit.mjs <files>`. Focused render files: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose <files>`.
- The shell is zsh, which does not split a `$LIST` in a `for` loop. Every step below names its files one by one.
- This task needs no heavy lock: no database suite and no workers pool. Docker is stopped and stays stopped.
- To compare checksums: `shasum -a 256 <file>` and compare with the line for the same path in `PL/SHA256SUMS` (`real/...`, `stubs/...` or `orig/...`).
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests or code to make them pass. The only results that may differ from this brief's are the base counts in Step 1.3 (if a merge since added cases to one of those four files, record the new count), and a load flake: a case that times out under load in a file this task does not touch. Rerun that file alone once and record both runs.

## Scope

| File | Change |
| --- | --- |
| `apps/app/src/wallet/home/shellRoutes.ts` | **new** (57 lines), pure (a Node test reads it). `walletTab` (the plan's), `walletTabInset`, `WALLET_TAB_INSET` (84), `WALLET_TAB_INSET_LARGE` (96), `WALLET_TAB_ROUTES`, `addRequestOf`, the types `WalletTab` and `WalletTabKey` (P4a). |
| `apps/app/src/wallet/home/WalletTabBar.tsx` | **new** (122 lines). `WalletTabBar` and `useWalletTabInset` (the plan's). |
| `apps/app/src/wallet/home/AddButton.tsx` | **new** (53 lines). `AddButton` (the plan's) and `ADD_BUTTON_SIZE`. |
| `apps/app/src/wallet/home/WalletShell.tsx` | **new** (85 lines). `WalletShell` (the plan's). |
| `apps/app/src/wallet/home/shellRoutes.test.ts` | **new**, Node (35 lines). 3 cases (P4b). |
| `apps/app/src/wallet/home/spendLayoutOrder.test.ts` | **new**, Node (98 lines). 5 cases: the plan's two, plus three (P17). |
| `apps/app/src/wallet/home/WalletShell.render.test.tsx` | **new**, render (496 lines). 11 cases: the plan's five, plus six (P17). |
| `apps/app/src/wallet/home/copy.ts` | **shared** (P2-T23's; P2-T24 adds the screen's lines after this task). The plan's six lines after `home.spokenBudget`, and its header names them (P15). 18 lines before, 26 after. |
| `apps/app/app/spend/_layout.tsx` | **shared** (1C-T9 adds the terms gate). One import, and the wallet branch with its comment after `const ask` (P5). 24 lines before, 29 after. |
| `apps/app/app/spend/add.tsx` | The wallet area opens the shell's tray (P13). 12 lines before, 35 after. |
| `apps/app/src/screens/redesign/SpendLayout.render.test.tsx` | **shared** (1D-T8's and today's layout cases). The expo-crypto mock, a Quick add stand-in, the real `syncPlan` in its Home mock, a Slot, params and resources a case can set, one case's flag (P6), and four new cases at the end (P17). 309 lines before, 485 after. |
| `apps/app/src/screens/redesign/account/AnalyticsConsentScreen.render.test.tsx` | **shared** (1D-T8's). One `vi.mock('expo-crypto', ...)` with its comment (P4d). 215 lines before, 217 after. |
| `docs/implementation/receipts/P2-T18.md` | **new**. Your receipt (R87). |

Not in this task: P2-T18a's files (`src/wallet/saved/*`, `src/wallet/wallets/*`, P2-T21's receipts); the add tray host and its suite (`add/AddTrayHost.tsx`, `add/AddTray.render.test.tsx`: read only here, and #460's); the toast's host (`saved/*`), the card frames (`card/cardFrames.tsx`), the looks provider (`looks/WalletLooksProvider.tsx`), `WalletRoot.tsx`, `app/_layout.tsx` and `HomeScreen.tsx` (read only); every other route (the record, wallet, Insights and Home routes keep their own `SpendV1Provider`); `SpendRoutes.render.test.tsx` (unchanged, as the plan's Step 4 says); the catalogue (no section: the shell has no board of its own, and Home's sections are P2-T24's); `en.json` and `th.json`; any package or lockfile; `premium-progress.md`.

## Planner rulings (the calls this brief makes, with the reason for each)

@@RULINGS@@

---

## Step 0: Sync and check the base

1. `/usr/bin/git -C WT fetch origin claude/p1a-vault-core`, then `/usr/bin/git -C WT merge --no-edit origin/claude/p1a-vault-core`. Expected: "Already up to date." or a fast-forward.
2. `/usr/bin/git -C WT rev-parse --short HEAD`. Record it as the base in the receipt.
3. `/usr/bin/git -C WT diff --stat 8ac7b4c3 HEAD -- apps/app packages`. Expected: nothing, or only files of the approved PRs waiting on CI (P22): #460's (`wallet/add/AddTrayHost.tsx`, `wallet/add/AddTray.render.test.tsx`, `wallet/add/draftOrigin.ts` and its test, `screens/redesign/entry/entrySave.ts` and its render test, `spend/v1/redesign/quickAddModel.ts` and its test, `spend/v1/ai/draftReview.ts` and its test), #461's (`spend/v1/ai/aiResources.ts` and its test, `dev/catalogue/companion/companionSections.tsx`, `screens/redesign/ai/AskBunScreen.render.test.tsx`, `packages/contracts/src/index.ts`, `packages/contracts/src/v1/ai.ts`), #462's (`storage/diaryRepository.test.ts`), #456's (`wallet/records/*`, `app/spend/record/[id].tsx`, `screens/redesign/SpendRoutes.render.test.tsx`, `ui/dateStep.ts` and its test, `dev/catalogue/wallet/recordSections.tsx` and `recordScreens.tsx`) and P2-T18a's (`wallet/saved/*`, `wallet/wallets/*`). Record any in the receipt. If any of the 12 files in Scope is listed, report BLOCKED with the list.
4. `python3 -I PL/tools/stage.py PL WT check-base`. Expected: 12 lines starting `OK`, then `check-base: 12 files, 0 not as expected` (the five changed files equal `orig/` and the seven new files are absent).
5. `cd PL && shasum -a 256 -c SHA256SUMS | grep -vc ': OK$'`. Expected: `0`.

## Step 1: Install and record the base

1. If `WT/node_modules` is missing: `cd WT && npm ci --ignore-scripts --no-audit --no-fund`. Expected: exit 0.
2. `mkdir -p S`.
3. The four suites that import the spend layout or the add route, at the base:
   ```bash
   cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/screens/redesign/SpendLayout.render.test.tsx src/screens/redesign/account/AnalyticsConsentScreen.render.test.tsx src/screens/redesign/HistoryReturn.render.test.tsx src/screens/redesign/QuickAddScreen.render.test.tsx > S/base-render.log 2>&1; echo $?
   ```
   Expected: `0`, `Test Files  4 passed (4)`, `Tests  116 passed (116)` (`PL/logs/base-render.log`). Record the count as B.

## Step 2: The tests and the typed stubs (plan Step 1)

1. `python3 -I PL/tools/stage.py PL WT red`. Expected: 12 lines starting `OK`, then `red: 12 files, 0 not as expected`. This copies the three new test files, the changed copy table and the two changed test files in their final form (`real/`), the four typed stubs (`stubs/`), and leaves the layout and the add route as at the base.
2. The stubs, for reference. `stubs/apps/app/src/wallet/home/WalletShell.tsx`:
   ```tsx
   // RED stub (P2-T18): the interface, with no behaviour yet.
   import type { ReactNode } from 'react';

   export function WalletShell({ children }: { children: ReactNode }) {
     return <>{children}</>;
   }
   ```
   `WalletTabBar.tsx` exports `useWalletTabInset()` answering 0 and `WalletTabBar()` drawing nothing; `AddButton.tsx` exports `ADD_BUTTON_SIZE = 60` and an `AddButton` drawing nothing; `shellRoutes.ts` keeps the types and `WALLET_TAB_ROUTES`, sets both insets to 0, and answers a hidden bar, a 0 inset and an empty request.

## Step 3: RED (plan Step 2)

1. `cd WT && npm run typecheck:app`. Expected: exit 0.
2. `cd WT/apps/app && node scripts/test-unit.mjs src/wallet/home/shellRoutes.test.ts src/wallet/home/spendLayoutOrder.test.ts > S/red-unit.log 2>&1; echo $?`. Expected: `1`, with `ℹ tests 8`, `ℹ pass 0`, `ℹ fail 8`.
3. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/home/WalletShell.render.test.tsx src/screens/redesign/SpendLayout.render.test.tsx src/screens/redesign/account/AnalyticsConsentScreen.render.test.tsx > S/red-render.log 2>&1; echo $?`. Expected: `1`, with `Test Files  2 failed | 1 passed (3)` and `Tests  15 failed | 24 passed (39)`: the shell's 11 cases and the layout's 4 new ones fail; the layout's 18 old cases and the consent screen's 6 pass.
4. Every failing case fails on an assertion: `python3 -I PL/tools/first_errors.py S/red-render.log` and `python3 -I PL/tools/first_errors.py S/red-unit.log`. Expected: each ends `1 logs, 0 with a failing case that is not an AssertionError (or with none)` and exits 0.
5. The failing cases are the planner's:
   ```bash
   grep -E "^ +× " S/red-render.log | sed -E 's/ [0-9]+ms$//' | LC_ALL=C sort > S/red-render.list
   diff S/red-render.list PL/logs/red-render.list
   grep -E "^✖ " S/red-unit.log | grep -v "^✖ failing tests:" | sed -E 's/ \([0-9.]+ms\)$//' | LC_ALL=C sort -u > S/red-unit.list
   diff S/red-unit.list PL/logs/red-unit.list
   ```
   Expected: both `diff`s print nothing. (The 15 and 8 case names are in the receipt template, Step 7.)

## Step 4: GREEN (plan Steps 3 and 4)

1. `python3 -I PL/tools/stage.py PL WT green`. Expected: 12 lines starting `OK`, then `green: 12 files, 0 not as expected`. The code is in the Appendix, for reference.
2. `cd WT && npm run typecheck:app`. Expected: exit 0. Then `cd WT && npm run typecheck:routes -w gogospend-app`. Expected: exit 0 (two route files change).
3. `cd WT/apps/app && node scripts/test-unit.mjs src/wallet/home/shellRoutes.test.ts src/wallet/home/spendLayoutOrder.test.ts > S/green-unit.log 2>&1; echo $?`. Expected: `0`, `ℹ tests 8`, `ℹ pass 8`, `ℹ fail 0`.
4. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/home/WalletShell.render.test.tsx src/screens/redesign/SpendLayout.render.test.tsx src/screens/redesign/account/AnalyticsConsentScreen.render.test.tsx > S/green-render.log 2>&1; echo $?`. Expected: `0`, `Test Files  3 passed (3)`, `Tests  39 passed (39)`. And `grep -cE "stderr \||Unhandled|not wrapped in act" S/green-render.log` prints `0`. (Node 26's `ExperimentalWarning: localStorage ...` line is base noise and does not count.)
5. `/usr/bin/git -C WT status --short`. Expected: five modified files (` M apps/app/app/spend/_layout.tsx`, ` M apps/app/app/spend/add.tsx`, ` M apps/app/src/screens/redesign/SpendLayout.render.test.tsx`, ` M apps/app/src/screens/redesign/account/AnalyticsConsentScreen.render.test.tsx`, ` M apps/app/src/wallet/home/copy.ts`) and the seven new files under `apps/app/src/wallet/home/` (`??`, listed one by one or as the folder's new files); nothing else.

## Step 5: Mutation check (plan Step 5)

1. `mkdir -p S/mutant-batches S/mutant-logs`.
2. Three batches, each in the foreground (about 25 s, 2 minutes and 3.5 minutes on a quiet machine); each prints one line per mutant:
   ```bash
   cd PL && python3 -I tools/mutants.py WT S/mutant-logs $(sed -n 1p tools/batches.txt) > S/mutant-batches/batch-1.out 2>&1; echo $?
   cd PL && python3 -I tools/mutants.py WT S/mutant-logs $(sed -n 2p tools/batches.txt) > S/mutant-batches/batch-2.out 2>&1; echo $?
   cd PL && python3 -I tools/mutants.py WT S/mutant-logs $(sed -n 3p tools/batches.txt) > S/mutant-batches/batch-3.out 2>&1; echo $?
   ```
   Expected: each prints `0`. Their last lines: `36 killed, 0 survived, 0 not as expected`, `20 killed, 0 survived, 0 not as expected` and `30 killed, 1 survived, 0 not as expected` (S5, the equivalent mutant, P18).
3. `python3 -I PL/tools/merge_mutants.py PL/tools/mutants.py S/mutant-batches S/mutants.out`. Expected: `87 lines; 86 killed, 1 survived (1 equivalent), 0 not as expected`, exit 0. Then `diff S/mutants.out PL/logs/mutants.out`. Expected: no output.
4. `python3 -I PL/tools/first_errors.py S/mutant-logs | grep -v ': [0-9]* failing case(s): AssertionError$'`. Expected: exactly two lines, `S5: 0 failing case(s): none` and `87 logs, 1 with a failing case that is not an AssertionError (or with none)`: every kill fails only on assertions, and S5 has no failing case because it survives by design.
5. `python3 -I PL/tools/stage.py PL WT green` again (it rewrites nothing that differs). Expected: `green: 12 files, 0 not as expected`. And `/usr/bin/git -C WT status --short`: as in Step 4.5 (the X mutants change `add/AddTrayHost.tsx` and each restores it: it must not be listed).

## Step 6: Fast local gate (R100)

From WT, each with its log in S:

1. `npm run typecheck:app`: exit 0. `npm run typecheck:routes -w gogospend-app`: exit 0.
2. `npm run test:app > S/gate-test-app.log 2>&1; echo $?`: `0`, with `ℹ fail 0`.
3. `npm run test:unit > S/gate-test-unit.log 2>&1; echo $?`: `0`, with `ℹ fail 0` (the Hermes guards, `src/testing/hermesGlobals.test.ts`, included).
4. The four routes tests (the controller's rule: this task changes two routes):
   ```bash
   cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/screens/redesign/SpendRoutes.render.test.tsx src/screens/redesign/account/AccountRoutes.render.test.tsx src/screens/redesign/insights/InsightsRoutes.render.test.tsx src/screens/redesign/planning/PlanningRoutes.render.test.tsx > S/gate-routes.log 2>&1; echo $?
   ```
   Expected: `0`, `Test Files  4 passed (4)`, no failed case (the kit's count was 17; #456 adds cases to `SpendRoutes.render.test.tsx` if it has merged).
5. The eight kit render files that import the wallet catalogue index (the controller's rule):
   ```bash
   cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/card/CardStack.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/wallet/lock/Lock.render.test.tsx src/wallet/add/AmountStep.render.test.tsx src/wallet/wallets/WalletsList.render.test.tsx > S/gate-kit8.log 2>&1; echo $?
   ```
   Expected: `0`, `Test Files  8 passed (8)`, no failed case. (One `stderr | src/wallet/testing/walletHarness.render.test.tsx > the bun intensity can change ...` block is that suite's own base noise.)
6. The shell's files and every suite that imports the spend layout or the add route:
   ```bash
   cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/home/WalletShell.render.test.tsx src/screens/redesign/SpendLayout.render.test.tsx src/screens/redesign/account/AnalyticsConsentScreen.render.test.tsx src/screens/redesign/HistoryReturn.render.test.tsx src/screens/redesign/QuickAddScreen.render.test.tsx > S/gate-neighbours.log 2>&1; echo $?
   ```
   Expected: `0`, `Test Files  5 passed (5)`, `Tests  131 passed (131)` (B + 15), and `grep -cE "stderr \||Unhandled|not wrapped in act" S/gate-neighbours.log` prints `0`.
7. `npm run export:web -w gogospend-app -- --max-workers 2 > S/gate-export-web.log 2>&1; echo $?` (routes change). Expected: `0`, with `Web Bundled` and `Exported: dist`. Then `rm -rf WT/apps/app/dist` (the export's output, which git ignores).
8. `/usr/bin/git -C WT diff --check`: no output.

Not run, and why (put this in the receipt): the full render suite, the iOS export, the database suites and `test:ops` (CI runs them on the PR, R100); `build:edge` and the edge suites (nothing outside `apps/app` changes). Device checks: SKIPPED (P14, P20).

## Step 7: Receipt

Write `docs/implementation/receipts/P2-T18.md` in the house style (see `docs/implementation/receipts/P2-T17.md`), with your own numbers where they differ from these. Start from:

```markdown
# P2-T18: The wallet shell: the layout order, the tab bar, the + button and the host mounts

- **Status:** built and verified locally on `p2/t18-wallet-shell` (`.claude/worktrees/p2-t18`), from `<base>`. Not pushed. The reviews are the controller's. Under R87 this receipt is its own file. The planner split P2-T18 in two: P2-T18a (the guards the followups ask for first) merges before this task.
- **Files:** created `apps/app/src/wallet/home/shellRoutes.ts`, `WalletTabBar.tsx`, `AddButton.tsx`, `WalletShell.tsx`, `shellRoutes.test.ts` (3 cases), `spendLayoutOrder.test.ts` (5), `WalletShell.render.test.tsx` (11), this receipt; changed `apps/app/src/wallet/home/copy.ts` (six lines), `apps/app/app/spend/_layout.tsx` (the wallet branch), `apps/app/app/spend/add.tsx` (the wallet area), `apps/app/src/screens/redesign/SpendLayout.render.test.tsx` (4 cases, its mocks, one case's flag) and `apps/app/src/screens/redesign/account/AnalyticsConsentScreen.render.test.tsx` (the expo-crypto mock).
- **What changed:** (the layout's wallet branch and its order; the shell's nesting and what each provider gives; the bar, its places and its largest sizes; the inset; the +, C5 and Magic Tap; the add route and the copy; the toast once per save.)
- **RED to GREEN:** base B = 116 (four suites). RED: Node 8 of 8 fail, render 15 failed and 24 passed (39), every failing case an `AssertionError`. GREEN: Node 8 of 8, render 39 of 39. (List the 15 and the 8 case names.)
- **Mutation check:** 87 mutants, 86 killed (every failing case an `AssertionError`), 1 equivalent: S5 (two shows in one save draw one toast). The plan's: R1, S1, L1, L2, L3, L4 and L4b. P2-T16's guarantees: X1 to X3 and X7. (One line per group, with the case that kills it.)
- **Gate:** (every command in Step 6 with its result.)
- **Deviations:** P4 (the files and names beyond the plan's), P6 (`all,-wallet` in one old case), P10 (what the inset is), P12 (Magic Tap read through React's fiber), P14 (P2-T16's pins in the shell's suite), P17 (the cases beyond the plan's).
- **SKIPPED:** device and simulator: the refused present before the + and Magic Tap reach the host (P2-T16's item; P2-T26's tray-to-edit hand-off is the same); VoiceOver saying each item's place once, Magic Tap, the large content viewer on a long press; the bar and the + at AX5; the chip's landing on Home (P2-T24). Whole suites: CI (R100).
- **Notes for later tasks:** (P20.)
```

## Step 8: Commit

1. `/usr/bin/git -C WT add apps/app/src/wallet/home/shellRoutes.ts apps/app/src/wallet/home/WalletTabBar.tsx apps/app/src/wallet/home/AddButton.tsx apps/app/src/wallet/home/WalletShell.tsx apps/app/src/wallet/home/shellRoutes.test.ts apps/app/src/wallet/home/spendLayoutOrder.test.ts apps/app/src/wallet/home/WalletShell.render.test.tsx apps/app/src/wallet/home/copy.ts apps/app/app/spend/_layout.tsx apps/app/app/spend/add.tsx apps/app/src/screens/redesign/SpendLayout.render.test.tsx apps/app/src/screens/redesign/account/AnalyticsConsentScreen.render.test.tsx docs/implementation/receipts/P2-T18.md`
2. `/usr/bin/git -C WT status --short`: those 13 staged, nothing else (no `dist/`, no log).
3. Write the message to `S/commit-message.txt`:
   ```
   Add the wallet shell inside the device diary and Bun's AI: two tabs, a link to Settings, the floating plus and Magic Tap

   The spend layout's wallet branch comes first: the device diary, Bun's AI
   help, then the wallet shell around History's keep and the screen, with
   the consent question in the shell's place while it is unanswered. The
   shell holds the shared resources, the looks kept on the phone, the card
   frames, the saved toast and the one add tray host, and draws the bar
   (กระเป๋า and สรุป as tabs, ฉัน as a link to Settings) and the + on Home
   and Insights. Saving is blocked while an update is needed. Magic Tap
   opens the add tray, and /spend/add in the wallet area opens it over Home.

   Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
   ```
4. `/usr/bin/git -C WT commit -F S/commit-message.txt`, then `/usr/bin/git -C WT log --oneline -1` and `/usr/bin/git -C WT show --stat HEAD`: 13 files.

## Your final message

As the protocol says: `STATUS: DONE` (or `STATUS: BLOCKED` with the exact blocker) on the first line; the commit SHA and branch; files changed; RED and GREEN counts; mutants (86 killed, S5 equivalent and why); each gate command with its result; SKIPPED items; deviations (P4, P6, P10, P12, P14, P17); and what the reviewer should look at first: the layout's wallet branch and its order test, the shell's nesting (P7), the C5 rule (P7), the add route outside the shell (P13), and the copy path (P13).

---

## Appendix: the code, for reading (`PL/real/` and `PL/diffs/` are the reference)

@@APPENDIX@@
