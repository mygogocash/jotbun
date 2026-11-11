# Brief wallet-looks-unstored: Keep a look, order or icon that was never stored on screen until the app closes

You are the implementer for the follow-up task wallet-looks-unstored: P2-T11's review minor m1. Today `WalletLooksProvider` drops a change it could not store (its name could not be read, or its write failed) from view at the next read of that name: the next stored change to the same name, or the account's first read. P2-T11's rule P3 says such a change "shows until the app closes". You change two existing files:

- `apps/app/src/wallet/looks/WalletLooksProvider.tsx`: the provider keeps, per account, each change that was not stored and every change made after it, and lays them over every later read of that account's names. No exported name changes.
- `apps/app/src/wallet/looks/WalletLooks.render.test.tsx`: V4 is extended so it pins what its title says, and four cases are added after it: the review's ready cases D1, D2 and D8b, and one that pins that a later change still wins.

The planner wrote both files and proved them in a scratch copy of the integration head `8194e7f`: RED (the head's own provider against the new tests: 4 of 13 cases fail, each on an assertion), GREEN (13 of 13), 37 mutants killed (none survive) and R100's fast local gate. Do exactly what this brief says.

Read first, in this order:

1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. Two notes at its top apply:
   - **R100:** CI is the gate for whole suites. Run only the fast local gate (Step 5). Never run the full render suite or the iOS export, and never compare whole-suite totals.
   - **R87:** your receipt is its own file, `docs/implementation/receipts/wallet-looks-unstored.md`; do not edit `premium-progress.md`.
2. The review that asks for this task: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/P2-T11.md`, m1 (lines 85 to 107) and "Notes for later tasks" (lines 323 to 326).
3. P2-T11's brief, rule P3 (the rule this task restores): `/Users/kunanonjarat/Developer/jotbun/.claude/controller/briefs/P2-T11.md`, lines 58 to 63.
4. The plan: `docs/superpowers/plans/2026-10-25-jotbun-p2-bun-wallet-core.md`:
   - `### Task P2-T11` (lines 757 to 806), especially "Kept data (R64)" (line 794);
   - W7 (line 44) and "Two scopes (R64)" (line 366);
   - the Global Constraints (lines 82 to 108), especially the anti-goals (line 91), the R72 test traps (lines 94 to 99) and the standard steps (line 100);
   - for context only: P2-T18's layout and `WalletShell` (lines 1073 to 1075), which will mount this provider.
5. `/Users/kunanonjarat/Developer/jotbun/.claude/controller/followups.md`, the P2-T11 entry (lines 270 to 275).

## Paths and rules used below

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/wallet-looks-unstored` (branch `fix/wallet-looks-unstored`, made by the orchestrator from `origin/claude/p1a-vault-core`). Work only here.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/wallet-looks-unstored`, your scratch folder. Create it with `mkdir -p`. Logs and the commit message go there. Never keep anything under `/private/tmp`.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/wallet-looks-unstored-planner`, the planner's folder. Read it and `cp` from it; never write into it. It holds:
  - `real/`: the final version of the two files, at their repo paths (the receipt is yours);
  - `stubs/`: the RED form of the provider. It is the head's own `WalletLooksProvider.tsx`, byte for byte `orig/`'s: the fix adds no export, so the head's file is already the compile-safe seam the new tests fail against;
  - `orig/`: both files as they are at `8194e7f`;
  - `diffs/`: one diff per changed file (`apps_app_src_wallet_looks_WalletLooksProvider.tsx.diff`, `apps_app_src_wallet_looks_WalletLooks.render.test.tsx.diff`), for reading only (each turns `orig/` into `real/`);
  - `probes/`: the review's `DataLensProbes.render.test.tsx`, as the review left it, for the reviewer. It is not part of this task: never copy it into WT;
  - `ref/plan-p2-head.md`: the P2 plan as `8194e7f` has it, which the line numbers in this brief cite;
  - `tools/`: `mutants.py` (the mutant runner), `prove.sh` and `run-all.sh` (the planner's stages), `killers.py` (every case each mutant fails), `rehearse.sh` with `commit_message.py` (this brief's steps, rehearsed), `sums.sh`, and `brief.template.md` with `fill_brief.py` (how this brief was built: every code block in the appendix is the kit's file, byte for byte);
  - `logs/`: see "For the controller";
  - checksums with paths relative to WT, for `shasum -a 256 -c` run from WT: `SHA256SUMS.base` (both files at the head), `SHA256SUMS.red` (the RED state: the final test file and the head's provider) and `SHA256SUMS.real` (both final files); and `SHA256SUMS`, the folder's own (paths under PL; the planner's `*.log` files are listed in `SHA256SUMS.logs`, not in it);
  - `work/`: the planner's proof tree, outside the sums.
- Every shell call starts in a fresh directory, so type full paths.
  - Git: `/usr/bin/git -C WT <command>`, one git command per call.
  - npm: `cd WT && npm run <script>`.
  - Render files: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose <files>`.

  Below, WT, S and PL stand for those full paths: type the full path.
- No database or workers suite runs in this task, so there is no lock to take. Docker stays stopped.
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests or code to make them pass.
  - The one exception is a case that times out under load in a file this task does not touch (a known flake, protocol). Rerun that file alone once; if it passes alone, record both runs and go on.

## Scope

| File | Change |
| --- | --- |
| `apps/app/src/wallet/looks/WalletLooksProvider.tsx` | P2-T11's; P2-T20, P2-T21, P2-T29 and P5-T19 build on it. The header's second paragraph; an `Edit` type and `layOver` after `nothingKept`; in the provider, the `unstored` ref, the first read's `layOver`, and `keep`'s body (P2 to P8). 153 lines before, 173 after. |
| `apps/app/src/wallet/looks/WalletLooks.render.test.tsx` | P2-T11's. The header; three imports (`useEffect`, `SpendDiaryProvider`, `WalletLooksProvider`); a `storeOver` helper after `heldReads`; V4 extended; four cases after V4 (P9). 418 lines before, 542 after; 9 cases before, 13 after. |
| `docs/implementation/receipts/wallet-looks-unstored.md` (repo root) | **new.** Your receipt (R87). |

Not in this task:
- The review's D8: the first read is not queued ahead of a change made from a child's mount effect (P6).
- Every other P2-T11 file: `walletHarness.tsx` and its test, `WalletCard`, the looks modules, the catalogue sections. The harness keeps mounting the provider as it does.
- P2-T13's files, in flight as PR #383 (`src/wallet/tray/`, `src/ui/lockCover.tsx`, `dev/catalogue/wallet/index.ts`, `traySections.tsx`, `theme/motion.ts`, `useWalletMotion.render.test.tsx`); 1B-T7 and 1B-T11 (PRs #385 and #387, `apps/edge` only).
- `en.json` and `th.json` (no copy changes), any package or lockfile, any route, and `premium-progress.md`.

## Interfaces (as `PL/real` has them)

No exported name, type or signature changes: `WalletLooksProvider`, `useWalletLooks`, `useCategoryIcons`, `LOOKS_NAME`, `WALLET_ORDER_NAME`, `CATEGORY_ICONS_NAME` and the `WalletLooks` and `CategoryIcons` types stay as P2-T11 made them. Inside the module:

```ts
/** One change, as it acts on everything kept: its own name, changed. */
type Edit = (kept: Kept) => Kept;

/** Lays changes over what was read, in the order they were made. */
const layOver = (kept: Kept, edits: readonly Edit[]): Kept => edits.reduce((now, edit) => edit(now), kept);

// In WalletLooksProvider: by account id, while the provider is mounted.
const unstored = useRef(new Map<string, readonly Edit[]>());
```

The test file adds one helper:

```ts
/** The harness's store, read and written in place; while a fault is set, every read or every write fails. */
function storeOver(stored: Map<string, string>): { faults: { reads: boolean; writes: boolean }; backend: StoreBackend };
```

## The integration head

- The planner's proof base is `8194e7f`, the head when this brief was written. Its proof tree is a `git archive` of `8194e7f` with `npm ci` (1416 packages).
- P2-T11 (#382) merged as `5a33820`, an ancestor of `8194e7f`. Neither file has changed since: `git log 5a33820..8194e7f` over `apps/app/src/wallet/looks`, `wallet/testing` and `wallet/store` is empty. `PL/orig/` equals the head's blobs (`c14a7a4` for the provider, `d0ba8b3` for the test), and `PL/SHA256SUMS.base` checks them in Step 0.
- R100: no whole-suite totals are expected here. For the controller's CI check, this task's deltas are: render +0 files and +4 cases (`WalletLooks.render.test.tsx`, 9 to 13); `test:unit` +0; `test:app` +0; web and iOS +0 modules. No app file imports the provider yet: only the wallet test harness mounts it.

## Planner rulings (the calls this brief makes, with the reason for each)

- **P1. Ready.**
  - "Starts after": P2-T11 only, merged (#382, `5a33820`, 10 November). The follow-up was recorded with it (`followups.md`, P2-T11 entry) and holds P2-T20, P2-T21 and P2-T29 in `held.txt`.
  - No package, lockfile, Cloudflare resource, account setting or owner decision: the fix restores what P2-T11's accepted rule P3, W7 and R64 already say.
  - At the head, the focused file passes 9 of 9, and the review's probe file fails D1, D2, D8 and D8b exactly as the review recorded, while D3 to D7 pass (`PL/logs/base-looks.log`, `PL/logs/base-probes.log`).
- **P2. The fix is the review's: unstored changes per account, in a ref, laid over each read.**
  - A change is *not stored* when its name could not be read (P3: a name the store cannot read is never written over) or when its write failed.
  - Each change is kept as an `Edit`: the change itself, as it acts on everything kept (one wallet's look set, one category's icon set, or the whole order replaced). An edit is replayed, not a value merged, so the module needs no per-name merge rule. (`enqueue`'s own parameter keeps its name `step`: a queued task, not an edit.)
  - The edits are laid, in the order made, over every read of the account's names:
    - the account's first read: `layOver(read, memory)`;
    - each change's own read: the name replaced by what the store holds, then every edit in memory, then this change.
  - With nothing in memory, every read and every change shows and writes exactly what it did before: the first read publishes `read`, and a change publishes `slot.put(now, change(read))` (`change` over what is shown, when its name cannot be read) and writes `change(read)`.
- **P3. A later change still wins.** Once an account has a change in memory, every later change for it goes into memory too, stored or not, in the order made.
  - Without that, a stored later look for the same wallet would be read back and then covered again by the earlier, unstored one (mutants WU16 and WU17).
  - Replaying a stored change over a read that already holds it changes nothing, since each change sets one entry or the whole order.
  - With nothing in memory, a stored change adds nothing, so a session where every write lands keeps nothing in memory. Adding every change regardless would show the same while this provider is the names' only writer, but would hold the whole session's changes for nothing.
- **P4. A write holds only what was read and the change itself; nothing unstored is folded in.** The review offered folding them into the next write as another way. It is not taken:
  - the review's ready case D1 asserts the store then holds only what was stored;
  - P3 asks that such a change *shows* until the app closes, not that a later write stores it;
  - the Global Constraints' anti-goal "nothing is saved without the person's tap" (plan line 91) reads most simply as each write holding what its own tap asked for. A fold would store an earlier look at a later tap on another wallet (mutant WU11).
- **P5. The memory lives in a ref per provider (`useRef`), not in module scope.**
  - The review and the controller ask for a ref. "Until the app closes" then holds while the provider stays mounted, as P2-T10's private mode keeps a choice it could not store in its own provider's state (`apps/app/src/wallet/privacy/PrivateModeProvider.tsx:83`).
  - `WalletShell` will mount the one provider inside the spend layout (P2-T18, plan lines 1073 to 1075). When the shell unmounts (the app leaves the spend area, or 1C's terms step or 1D-T8's consent question takes the shell's place, plan lines 19 and 71), the memory goes with it, and the account's next first read shows what the store holds. Nothing else clears it: a diary that locks or closes only sets the account id to null, and the memory waits for the account to open again (V4 pins it; mutant WU20).
  - A module-scope map would outlive that, but every render test opens `TEST_ACCOUNT_ID`, so a change left unstored in one case would show in the next unless the shared harness reset it, and `walletHarness.tsx` is outside this task. The header says "(while this provider stays mounted)". Note for P2-T18.
- **P6. The review's D8 is not taken.** The review: "Take D8 only if the fix also queues the first read ahead of every change."
  - React runs a child's effects before its parent's, so a change made from a child's mount effect is queued before the provider's first read.
  - Putting the read first would mean starting it before React runs the children's effects: from a layout effect (the app has none, and a child's layout effect would still run first) or from render (a side effect in render, run twice under StrictMode).
  - The fix makes the outcome right without it. The change reads its own name before it writes, so nothing stored is lost; and if it was not stored, the first read lays it over what it reads (D8b). No planned caller changes a look from a mount effect: P2-T20, P2-T21 and P2-T29 call the setters from taps.
  - So the header no longer says each change runs "after the account's first read"; it says what holds (one queue, and each read lays what was not stored over what it reads). V2 still pins that a change made once the account is open waits for its first read. The review's D8 still fails, on the store's call order only (`PL/logs/probes.log`): record it for the reviewer.
- **P7. What each read shows.**
  - The first read: what it read, with the account's memory laid over it.
  - A change to a name the store can read: the name replaced by what was read, with the memory and this change laid over it. What was read is the base, so a first read that failed is made good at the next change to that name (V4's last part; mutant WU7).
  - A change to a name the store cannot read: what is shown, with the memory and this change laid over it. What is shown already holds every edit in memory, and laying them again changes nothing; if the account's first read has not landed yet, they show at once.
  - Every publish keeps its guard: it lands only while the account it was made for is open (P2-T11's PR10, on the new line).
- **P8. The memory is not trimmed.** It grows by one edit per change made after the account's first unstored change, until the provider unmounts. Changes are taps, and each edit holds one id and a look or an icon, or one order.
- **P9. The tests, all in `WalletLooks.render.test.tsx`.**
  - Why this file: it already holds the provider's cases and their helpers (`Keeper`, `shown`, the held stores). P5-T19's plan names a later `looks/WalletLooksProvider.render.test.tsx`, so that name is left to it. A new file would add a render file to CI for four cases.
  - **V4** ("a name the store cannot read is never written over, and what fails to store still shows until the app closes") now pins its whole title. After its two failures (W1's look and c1's icon changed while unreadable, W3's look whose write failed), the store works again:
    - while the diary is locked, every look is derived; when it opens again, the account's next first read shows them over what the store holds;
    - the other account's first read, and a change made under it, never show them;
    - back on this account, its next first read shows them again;
    - the store still holds only `{ W2: SKY }`.

    Its last part also pins that, after a first read that failed, a change shows what the store holds (WU7). V4 now mounts with `createFakeDiary()` (the same account) so it can switch accounts.
  - **D1, D2 and D8b** are the review's ready cases. They keep their steps and assertions, with the file's names (`TEST_ACCOUNT_ID` for the review's `A`) and the new `storeOver` helper in place of each case's own store (the same reads, writes and failures). D2 also checks that the store then holds only what was stored, as D1 does, and D8b that the store was never written. D8b's effect lists `setLook` as its dependency.
  - **A new case:** "a later change wins over one that was never stored, at every later read of the account's names". A look and an order each fail to store once, and are then set again and stored. The next change and the account's next first read must show the later ones. It passes at RED by design (the head keeps nothing unstored, so nothing can cover a later change). It pins the order the fix must keep (WU5, WU16, WU17).
  - RED: 4 of 13 fail, each on an assertion: V4 (at "opened again"), D1, D2 and D8b. GREEN: 13 of 13.
- **P10. The mutants.** WU1 to WU20 cover every new line. PR1 to PR10 and PR14 to PR20 are P2-T11's provider mutants, on the lines where they moved, so every rule of P3 that held still holds. P2-T11's PR11, PR12 and PR13 are WU12, WU8 and WU14 here. Each runs against the three render files that mount the provider (`WalletLooks`, `WalletCard`, `walletHarness`: 31 cases). The planner's run killed all 37, and a second run printed the same lines byte for byte.
- **P11. The gate (R100).**
  - Run: `typecheck:app`; the focused file RED to GREEN; the five other render files that mount the provider through `mountWallet` (`WalletCard` 9, `walletHarness` 9, `PrivateMode` 9, `WalletAmount` 5, `GrowBar` 6); `test:app`; `test:unit`; `git diff --check`.
  - Not run: `typecheck:routes` and `export:web` (no route, app config or app entry changes, and no app file imports the provider yet); the edge, API and database suites; `test:ops` (no package or lockfile change).
  - Left to CI: the full render suite and the iOS export.
- **P12. Clear of the work in flight.** P2-T13 (#383) and 1B-T7 and 1B-T11 (#385, #387, `apps/edge` only) touch nothing under `src/wallet/looks/`.
- **P13. Notes for later tasks** (the receipt carries them):
  - **P2-T18:** where `WalletShell` mounts the provider sets how long an unstored change shows (P5).
  - **P2-T20, P2-T21 and P2-T29:** a setter's promise resolves whether or not the change was stored, and the change shows either way. A screen cannot tell the person it was not saved; P3 asks only that it shows.
  - **P5-T19:** the upload reads kept values from the store, so an unstored change is never uploaded. If the provider later reads looks from the server, decide whether the memory is laid over the server's values too.

---

## Step 0: Sync, install and check the base

1. `/usr/bin/git -C WT fetch origin claude/p1a-vault-core`, then `/usr/bin/git -C WT merge --no-edit origin/claude/p1a-vault-core`. Expected: "Already up to date." or a clean merge. Then `/usr/bin/git -C WT rev-parse --short HEAD`, and record it.
2. `mkdir -p S`, then `cd WT && shasum -a 256 -c PL/SHA256SUMS.base > S/base-check.txt 2>&1; echo exit=$?`. Expected: `exit=0` and two `OK` lines.
   - If a line says `FAILED`, another task changed that file since `8194e7f`, and the kit's files would undo its change. Stop: BLOCKED, with `/usr/bin/git -C WT log --oneline -3 -- <that file>`.
3. `cd WT && npm ci --ignore-scripts --no-audit --no-fund > S/npm-ci.log 2>&1; echo exit=$?`. Expected: `exit=0`. The worktree may come installed; running it again is safe. There is no edge install: this task is app-only.
4. The base: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/looks/WalletLooks.render.test.tsx > S/base-render.log 2>&1; echo exit=$?`. Expected: `exit=0`, and `grep -E "^ +Tests " S/base-render.log` prints `      Tests  9 passed (9)`.

## Step 1: The tests (plan Step 1)

1. Copy the final test file. The provider stays as the head has it: that is its RED form (`PL/stubs/` holds the same bytes).
   ```
   cp PL/real/apps/app/src/wallet/looks/WalletLooks.render.test.tsx WT/apps/app/src/wallet/looks/WalletLooks.render.test.tsx
   ```
2. `/usr/bin/git -C WT status --short --untracked-files=all`. Expected: exactly this line, and nothing else:
   ```
    M apps/app/src/wallet/looks/WalletLooks.render.test.tsx
   ```
3. `cd WT && shasum -a 256 -c PL/SHA256SUMS.red`. Expected: 2 `OK` lines, exit 0.
4. `cd WT && npm run typecheck:app > S/red-typecheck.log 2>&1; echo exit=$?`. Expected: `exit=0`.

## Step 2: RED (plan Step 2)

1. Run the focused file:
   ```
   cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/looks/WalletLooks.render.test.tsx > S/red-render.log 2>&1; echo exit=$?
   ```
   Expected: `exit=1`, and `grep -E "^ +Tests " S/red-render.log` prints `      Tests  4 failed | 9 passed (13)`.
2. `grep "×" S/red-render.log` prints exactly these four cases (each line ends with its time):
   ```
    × src/wallet/looks/WalletLooks.render.test.tsx > a name the store cannot read is never written over, and what fails to store still shows until the app closes
    × src/wallet/looks/WalletLooks.render.test.tsx > a change whose write failed still shows after a later change to the same name is stored, and the store holds only what was stored
    × src/wallet/looks/WalletLooks.render.test.tsx > a change made while its name could not be read still shows after the store reads again and a later change to it is stored
    × src/wallet/looks/WalletLooks.render.test.tsx > a change made from a child's mount effect, whose write fails, still shows once the account's first read lands
   ```
3. Every failure is an assertion:
   - `grep -c '^AssertionError' S/red-render.log` prints `4`; the first three name `opened again`, `after a later change to the same name` and `the earlier change, after the store reads again`;
   - `grep -cE 'Cannot find module|Failed to resolve|TypeError|ReferenceError' S/red-render.log` prints `0`.

## Step 3: GREEN (plan Steps 3 and 4)

1. Copy the final provider: `cp PL/real/apps/app/src/wallet/looks/WalletLooksProvider.tsx WT/apps/app/src/wallet/looks/WalletLooksProvider.tsx` (type the full paths). Then `cd WT && shasum -a 256 -c PL/SHA256SUMS.real`. Expected: 2 `OK` lines, exit 0.
2. `cd WT && npm run typecheck:app > S/green-typecheck.log 2>&1; echo exit=$?`. Expected: `exit=0`.
3. The same command as Step 2.1, into `S/green-render.log`. Expected: `exit=0`, `      Tests  13 passed (13)`.
4. The other render files that mount the provider:
   ```
   cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/card/WalletCard.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/money/WalletAmount.render.test.tsx src/wallet/motion/GrowBar.render.test.tsx > S/green-neighbours.log 2>&1; echo exit=$?
   ```
   Expected: `exit=0`, `Test Files  5 passed (5)` and `      Tests  38 passed (38)` (WalletCard 9, walletHarness 9, PrivateMode 9, WalletAmount 5, GrowBar 6). Its one stderr block, "Bun setting could not be saved." and "Language choice could not be saved." from `walletHarness`, is the head's own (P2-T11 review n7).

What the code does: read it in `PL/real` (the appendix holds the same bytes), and do not retype it. It follows rulings P2 to P8.

## Step 4: Mutation check (plan Step 5)

Run the planner's runner once. It applies each mutant alone to `WalletLooksProvider.tsx` in WT, runs the three render files that mount the provider, restores the file and checks its SHA-256:

```
MUTANT_LOGS=S/mutant-logs python3 -I PL/tools/mutants.py WT > S/mutants.out 2> S/mutants.err; echo exit=$?
```

Type the full paths. To check first that every pattern matches once, run `python3 -I PL/tools/mutants.py WT --check` (37 `APPLIES` lines, exit 0).

Expected: `exit=0`, and:
- `grep -c " KILLED: " S/mutants.out` prints `37`, and `grep -c "restored=True" S/mutants.out` prints `37`;
- `diff S/mutants.out PL/logs/mutants.out` prints nothing: each mutant fails the same cases as in the planner's run.

It takes about two minutes. Then `/usr/bin/git -C WT status --short --untracked-files=all` shows exactly ` M` for the two files, and `cd WT && shasum -a 256 -c PL/SHA256SUMS.real` still prints 2 `OK` lines.

In the table, V1 to V5 are the file's first five cases (V4 is the extended one); "later wins" is the new case; D1, D2 and D8b are the review's.

| Mutant | Change | Killed by |
| --- | --- | --- |
| WU1 | the first read lays nothing over what it reads | V4 (`opened again`), D8b |
| WU2 | the first read lays every account's unstored changes | V4 (`the other account's first read`) |
| WU3 | a change lays every account's unstored changes | V4 (`the other account's change`) |
| WU4 | a change keeps and lays only itself | V4, D1, D2 |
| WU5 | a change goes under the earlier unstored ones | later wins |
| WU6 | a change's own read shows only that change over it | D1, D2 |
| WU7 | a change's own read is not shown, only what was shown | V4 (`what the store holds, with the change over it`) |
| WU8 | a change to a name the store cannot read does not show | V4, D2 |
| WU9 | a change shows only what was read, nothing laid over it | V1, V2, V4, D1, D2, later wins |
| WU10 | a write holds only the change, not what was read | V1, V2, V3, D1, D2, later wins |
| WU11 | a write folds in what was never stored | D1, D2 |
| WU12 | a name the store cannot read is written over, as nothing kept | V4, D2 |
| WU13 | a write that fails counts as stored | D1, D8b |
| WU14 | a write that fails is not caught | V4, D1, later wins, D8b |
| WU15 | a change not stored is kept in memory only after an earlier one | V4, D1, D2, D8b |
| WU16 | a stored change after an unstored one is not kept in memory | later wins |
| WU17 | changes are kept in memory only after two unstored ones | later wins |
| WU18 | nothing is kept in memory | V4, D1, D2, D8b |
| WU19 | the memory is forgotten when the account changes | V4 (`opened again`) |
| WU20 | the memory is forgotten when the diary locks or closes | V4 (`opened again`) |
| PR1 | the store is never read | V1, V3, V4, later wins, D8b, the tile case; WalletCard's account case; the harness's looks case |
| PR2 to PR4 | a setter keeps nothing | V1 (and the cases that use that setter) |
| PR5 | changes run at once, not one after another | V1, V2, D8b |
| PR6 | the account's first read does not wait its turn | V2, D8b |
| PR7 | nothing resets when the account changes | V2, V3, V4 |
| PR8 to PR10 | the last account's looks show for a render; a late first read, or a late change, lands on the next account | V3 |
| PR14 | a read that fails is not caught | V4, D2 |
| PR15 | `setOrder` keeps a repeated id | V1 |
| PR16 | with no account open a change is kept anyway | WalletCard's "with no diary open the derived look shows and setLook stores nothing" |
| PR17 to PR20 | `lookOf` or `iconOf` ignores what was kept; the order is not given; icons kept under another name | V1 and others, as `PL/logs/killers.txt` lists |

`PL/logs/killers.txt` lists every case each mutant fails.

## Step 5: The fast local gate (R100)

Run from WT, in order, and record each result. Whole-suite totals are not compared (R100): record the counts you see.

1. `cd WT && npm run typecheck:app`. Expected: exit 0 (Step 3.2).
2. The focused file and its neighbours together:
   ```
   cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/looks/WalletLooks.render.test.tsx src/wallet/card/WalletCard.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/money/WalletAmount.render.test.tsx src/wallet/motion/GrowBar.render.test.tsx > S/gate-render.log 2>&1; echo exit=$?
   ```
   Expected: `exit=0`, `Test Files  6 passed (6)` and `      Tests  51 passed (51)`.
3. `cd WT && npm run test:app > S/test-app.log 2>&1; echo exit=$?`. Expected: `exit=0` and `ℹ fail 0`. This task changes no `test:app` file.
4. `cd WT && npm run test:unit > S/test-unit.log 2>&1; echo exit=$?`. Expected: `exit=0` and `ℹ fail 0`. This task changes no Node test.
5. `/usr/bin/git -C WT diff --check; echo exit=$?`. Expected: no output and `exit=0` (both files are tracked, so `git diff` sees them before staging).

Not run here, recorded as "CI" (R100): the full `test:render` suite and the iOS export. Not run at all: `typecheck:routes` and `export:web` (no route, app config or app entry changes), the edge, API and database suites (nothing outside `apps/app` changes), and `test:ops` (no package or lockfile change).

## Step 6: Receipt

Create `WT/docs/implementation/receipts/wallet-looks-unstored.md` with the Write tool, in the house style of `docs/implementation/receipts/P2-T11.md`. Replace every `<...>` with what you saw; if a number differs from the planner's, write yours and say why under Deviations.

```markdown
# wallet-looks-unstored: Keep a look, order or icon that was never stored on screen until the app closes

- **Status:** built and verified locally on `fix/wallet-looks-unstored` (`.claude/worktrees/wallet-looks-unstored`), from `<head>`. Not pushed. The independent review is the controller's, after this receipt. Under R87 this receipt is its own file; `premium-progress.md` is not edited.
- **What it fixes:** P2-T11's review m1 (`.claude/controller/reviews/P2-T11.md`). A look, order or icon change that `WalletLooksProvider` could not store (its name could not be read, or its write failed) dropped out of view at the next stored change to the same name, or when the account's first read landed. P2-T11's rule P3 says it shows until the app closes. No stored data was ever harmed.
- **What changed:**
  - `WalletLooksProvider.tsx`: per account, in a ref, the provider keeps each change that was not stored and every change made after it, in the order made, and lays them over every later read of that account's names: the account's first read and each change's own read. So such a change shows until the app closes (while the provider stays mounted), and a later change still wins over it.
  - Unchanged: a write holds only what the change's own read found plus that change; a name the store cannot read is never written over; reads for an account no longer open are dropped; nothing of the last account shows after a switch; with no account open the setters keep nothing.
  - The header says what holds now. Its claim that each change runs "after the account's first read" is gone: a change made from a child's mount effect runs before it (the review's D8, not taken), and the first read lays it over what it reads when it was not stored.
  - `WalletLooks.render.test.tsx`: V4 pins its whole title (after the store works again, the account's next first read, when the diary opens again or the account comes back, shows what was never stored over what is stored, and another account never shows it); the review's ready cases D1, D2 and D8b; and a case that pins that a later change wins at every later read. 9 cases before, 13 after.
- **Files:** modified `apps/app/src/wallet/looks/WalletLooksProvider.tsx` (153 lines before, 173 after) and `apps/app/src/wallet/looks/WalletLooks.render.test.tsx` (418 before, 542 after); created this receipt.
- **RED to GREEN** (the head's provider is the RED form: the fix adds no export):
  - RED: `typecheck:app` `<result>`; `WalletLooks.render.test.tsx` `<counts>`; the four failing cases V4, D1, D2 and D8b, `<n>` `AssertionError`s, no module or type error.
  - GREEN: `typecheck:app` `<result>`; `WalletLooks.render.test.tsx` `<counts>`; the other five render files that mount the provider `<counts>` (WalletCard 9, walletHarness 9, PrivateMode 9, WalletAmount 5, GrowBar 6).
- **Mutation check:** the planner's runner (`.claude/controller/scratch/wallet-looks-unstored-planner/tools/mutants.py`), 37 mutants on `WalletLooksProvider.tsx`, each applied alone, run against `WalletLooks`, `WalletCard` and `walletHarness` and restored (SHA-256 checked): `<killed> killed, <survived> survived`. `S/mutants.out` `<is identical to / differs from>` the planner's `logs/mutants.out`.
  - WU1 to WU20: the new lines (what the first read and each change lay, the memory's keying per account, its order, when a change goes into it, that nothing unstored is written, and that neither an account switch nor a locked diary clears it).
  - PR1 to PR10 and PR14 to PR20: P2-T11's provider mutants, on the lines where they moved.
- **Gate** (worktree root; R100's fast local gate):
  - `typecheck:app`: `<result>`.
  - Focused and neighbours: `<counts>`.
  - `test:app`: `<counts>`. `test:unit`: `<counts>`.
  - `git diff --check`: `<result>`. The check after the commit is in the final message.
  - CI (R100, not run locally): the full `test:render` suite and the iOS export. This task adds no render file and no bundled module.
- **SKIPPED:**
  - A real phone's AsyncStorage failing: no device or simulator here; the cases fail the store through the test backend.
  - `typecheck:routes` and `export:web` (no route, app config or app entry changes). The edge, API and database suites (nothing outside `apps/app` changed; Docker is stopped). `test:ops` (no package or lockfile change).
- **Not applicable:** no package, lockfile, route, `en.json` or `th.json` change; no analytics event; no log line.
- **Deviations** (the planner's rulings P1 to P13 in `.claude/controller/briefs/wallet-looks-unstored.md`):
  1. The review's D8 is not taken: the first read is not queued ahead of a change made from a child's mount effect (P6).
  2. Nothing unstored is folded into a later write, the review's other way (P4).
  3. The memory lives while the provider is mounted, as P2-T10's private mode keeps a choice it could not store (P5).
  <your own, if any>
- **Risks and notes for later tasks:**
  - P2-T18: an unstored change shows while `WalletShell`'s provider stays mounted; when the shell unmounts (the app leaves the spend area, or 1C's terms step or 1D-T8's consent question takes its place), the account's next first read shows what the store holds.
  - P2-T20, P2-T21 and P2-T29: a setter's promise resolves whether or not the change was stored, and the change shows either way; a screen cannot tell the person it was not saved.
  - P5-T19: the upload reads kept values from the store, so an unstored change is never uploaded. If the provider later reads looks from the server, decide whether the memory is laid over the server's values too.
  - The review's D8 still fails on the store's call order only: a change made from a child's mount effect reads and writes its name before the account's first read. Nothing is lost, and what shows is right (D8b).
  - The memory grows by one edit per change made after an account's first unstored change, until the provider unmounts.
```

## Step 7: Commit

1. `/usr/bin/git -C WT add apps/app/src/wallet/looks/WalletLooksProvider.tsx apps/app/src/wallet/looks/WalletLooks.render.test.tsx docs/implementation/receipts/wallet-looks-unstored.md`
2. `/usr/bin/git -C WT status --short`. Expected: exactly these three lines, and nothing else:
   ```
   M  apps/app/src/wallet/looks/WalletLooks.render.test.tsx
   M  apps/app/src/wallet/looks/WalletLooksProvider.tsx
   A  docs/implementation/receipts/wallet-looks-unstored.md
   ```
   If anything else shows, stop and report.
3. `/usr/bin/git -C WT diff --cached --check; echo exit=$?`. Expected: no output and `exit=0`.
4. Write the message to `S/commit-message.txt` with the Write tool, then `/usr/bin/git -C WT commit -F S/commit-message.txt`:

```
Keep a look, order or icon that was never stored on screen until the app closes

WalletLooksProvider keeps, per account, each change it could not store
(its name could not be read, or its write failed) and every change made
after it, and lays them over each later read: the change's own and the
account's first. Such a change now shows until the app closes, a later
change still wins over it, and each write still holds only what was read
and the change itself. P2-T11's review m1, with its ready cases D1, D2
and D8b, and V4 extended to pin its title.

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
```

5. `/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD; echo exit=$?`. Expected: no output and `exit=0`. Then `/usr/bin/git -C WT log --oneline -1`, and record the SHA.

## Your final message

As the protocol says:
- `STATUS: DONE` or `STATUS: BLOCKED` first;
- the commit SHA and branch, and the files;
- the RED and GREEN counts, and the mutants (37 killed, and whether `S/mutants.out` equals the planner's);
- each gate command with its counts;
- SKIPPED: the phone check, `typecheck:routes`, `export:web`, the edge, API and database suites and `test:ops`; CI: the full render suite and the iOS export;
- deviations: the three above, and any of your own.

---

## For the controller (not the implementer's)

- **Readiness.** READY. P2-T11 is merged; no package, lockfile, Cloudflare resource, account setting or owner answer is needed. No in-flight task shares a file (P12). Once this merges, the `held.txt` lines for P2-T20, P2-T21 and P2-T29 can go.
- **Size:** S. One code file (+20 lines net) and its test file (+124).
- **Kit checks.**
  - The folder's own sums: `shasum -a 256 -c SHA256SUMS` from PL. The `*.log` files are in `SHA256SUMS.logs`, not in it.
  - `SHA256SUMS.base`, `.red` and `.real` (paths relative to WT): the head's two files, the RED state and the final state.
  - `PL/work/` is the planner's proof tree (`8194e7f`'s code plus `node_modules` and the final files), outside the sums.
- **The planner's logs** (in `PL/logs/`):
  - `summary.txt`: every stage of `tools/run-all.sh`, timed, with the load average: base 47 of 47 (the focused file 9 and its five neighbours 38); RED 4 failed and 9 passed of 13 with four assertions and no load error; GREEN 13 of 13 and the neighbours 38 of 38; the mutants 37 killed; and the gate (`typecheck:app` exit 0, the six render files 51 of 51, `test:app` and `test:unit` exit 0 with `ℹ fail 0`, no whitespace error).
  - `base-*`, `red-*`, `green-*` and `gate-*`: each stage's own logs.
  - `mutants.out` and `mutant-logs/`: the run; `repeat/`: a second run, whose `mutants.out` is byte for byte the first's; `killers.txt`: every case each mutant fails.
  - `probes.log`: the review's probe file on the final provider. D1 to D7 and D8b pass; D8 fails on the store's call order only (P6). `base-probes.log`: the same file at the head, where D1, D2, D8 and D8b fail as the review recorded. `base-looks.log`: the focused file at the head, 9 of 9.
  - `mutants-check.out`: the runner's `--check`, 37 `APPLIES`.
  - `rehearsal.txt`: this brief's Steps 0.2 to 7, typed as written (`tools/rehearse.sh`) in a throwaway git copy of `8194e7f`, deleted afterwards; the commit message came from this brief. Every Expected line held, and its `mutants.out` was identical to `logs/mutants.out`. Step 0.1 needs the real remote, and the receipt was a stand-in.
  - `superseded/run-1/`: the first full run, before V4 gained the diary's lock and open, with 36 mutants. Every mutant failed the same cases as in the final run; WU20 came with the lock and open, which pin that a locked diary keeps the memory (P5).
  - `superseded/run-2/`: the final files before the provider's new type was renamed from `Step` to `Edit`, so that it no longer shares a word with `enqueue`'s `step`. The same results, case for case.
  - `iter-*`: checks run while the files were written, kept as history.
- **The CI deltas:** render +0 files and +4 cases (`WalletLooks.render.test.tsx` 9 to 13); `test:unit`, `test:app`, web and iOS +0.
- **For the reviewer:** the review's D8 (not taken, P6) and the fold it offered (not taken, P4); the memory's lifetime (P5); and that a stored change joins the memory once an unstored one is there (P3). `PL/probes/` holds the review's probe file, to run against the commit.
- **Followups to record:**
  - P2-T18: the provider's place in `WalletShell` sets how long an unstored change shows (P5).
  - P2-T20, P2-T21 and P2-T29: a setter resolves whether or not its change was stored; a screen cannot tell the person.
  - P5-T19: an unstored change is never uploaded; decide whether the memory is laid over server reads.
  - The review's D8 order, accepted (P6): revisit only if a caller changes a look from a mount effect and the order of the store's calls matters.

## Appendix: the code

Every block below is the kit's file, byte for byte (`tools/fill_brief.py` checks it). Copy from PL with `cp`; never retype.

### The final provider (`PL/real/apps/app/src/wallet/looks/WalletLooksProvider.tsx`)

```tsx
// Looks kept on the phone (W7, R64): each wallet's kind, material and Bun
// face, the wallet order and each category's icon. They are the person's
// data, kept per account in the account store (P2-T3) under `looks`,
// `wallet-order` and `category-icons` for the open diary's account, so they
// survive sign-out and go only with a confirmed account deletion. With no
// account (no diary open: the web, opening, locked or signed out) every
// wallet shows its derived look and the setters keep nothing. WalletShell
// mounts the one provider (P2-T18); outside it, looks are derived, no order
// or icon is kept, and nothing changes.
//
// Every read and every change waits for the one before it (one queue). Each
// change reads its name from the store, changes it and writes it back, so two
// quick changes never drop each other and a change made just before the
// account changes is kept for the account it was made in. A name the store
// cannot read counts as nothing kept and is never written over. A change that
// is not stored (its name could not be read, or its write failed) stays in
// memory for its account, with each change made after it, and is laid over
// every later read of that account's names, the change's own and the
// account's first: it shows until the app closes (while this provider stays
// mounted), and a later change still wins over it. A write holds only what
// was read and the change itself.
import type { CategoryDto } from '@gogospend/contracts';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { useDiaryView } from '@mobile/spend/v1/SpendDiaryContext';
import { walletAccountStore } from '../store/deviceWalletStore';
import type { KeyValueStore } from '../store/walletStore';
import type { GlyphKey } from './categoryGlyphs';
import { iconFor, parseIcons } from './categoryIcons';
import type { KeptIcons } from './categoryIcons';
import { derivedLook, parseLooks, parseOrder } from './walletLooks';
import type { WalletLook } from './walletLooks';

/** The account store's names: `jotbun.account.<accountId>.looks`, `.wallet-order` and `.category-icons`. */
export const LOOKS_NAME = 'looks';
export const WALLET_ORDER_NAME = 'wallet-order';
export const CATEGORY_ICONS_NAME = 'category-icons';

type KeptLooks = Readonly<Record<string, WalletLook>>;

type Kept = {
  /** The account these were read for. */
  readonly accountId: string | null;
  readonly looks: KeptLooks;
  readonly order: readonly string[];
  readonly icons: KeptIcons;
};

/** One kept name: how its text reads, and where its value sits. */
type Slot<T> = {
  readonly name: string;
  readonly parse: (raw: string | null) => T;
  readonly of: (kept: Kept) => T;
  readonly put: (kept: Kept, value: T) => Kept;
};

const LOOKS: Slot<KeptLooks> = { name: LOOKS_NAME, parse: parseLooks, of: (kept) => kept.looks, put: (kept, looks) => ({ ...kept, looks }) };
const ORDER: Slot<readonly string[]> = { name: WALLET_ORDER_NAME, parse: parseOrder, of: (kept) => kept.order, put: (kept, order) => ({ ...kept, order }) };
const ICONS: Slot<KeptIcons> = { name: CATEGORY_ICONS_NAME, parse: parseIcons, of: (kept) => kept.icons, put: (kept, icons) => ({ ...kept, icons }) };

const nothingKept = (accountId: string | null): Kept => ({ accountId, looks: {}, order: [], icons: {} });

/** One change, as it acts on everything kept: its own name, changed. */
type Edit = (kept: Kept) => Kept;

/** Lays changes over what was read, in the order they were made. */
const layOver = (kept: Kept, edits: readonly Edit[]): Kept => edits.reduce((now, edit) => edit(now), kept);

export type WalletLooks = {
  /** The kept look, else the one derived from the id. */
  lookOf(walletId: string): WalletLook;
  /** Keeps a wallet's look for the open account; with none open, keeps nothing. */
  setLook(walletId: string, look: WalletLook): Promise<void>;
  /** The kept wallet order, by id; empty when none is kept. */
  order: readonly string[];
  /** Keeps the wallet order (each id once) for the open account; with none open, keeps nothing. */
  setOrder(ids: readonly string[]): Promise<void>;
};

export type CategoryIcons = {
  /** The kept icon, else the pack's glyph, else the built-in key, else null (the initial). */
  iconOf(category: Pick<CategoryDto, 'id' | 'type' | 'label' | 'builtin_key'>): GlyphKey | null;
  /** Keeps a category's icon for the open account; with none open, keeps nothing. */
  setIcon(categoryId: string, icon: GlyphKey): Promise<void>;
};

type LooksContextValue = {
  readonly kept: Kept;
  readonly setLook: WalletLooks['setLook'];
  readonly setOrder: WalletLooks['setOrder'];
  readonly setIcon: CategoryIcons['setIcon'];
};

const keepNothing = () => Promise.resolve();

/** Outside the provider: derived looks, no order, no kept icons, and the setters keep nothing. */
const OUTSIDE: LooksContextValue = { kept: nothingKept(null), setLook: keepNothing, setOrder: keepNothing, setIcon: keepNothing };

const LooksContext = createContext<LooksContextValue>(OUTSIDE);

/** A name's text (null when absent), or null in place of the whole answer when the store cannot read it. */
const readName = (store: KeyValueStore, name: string) => store.get(name).then((raw) => ({ raw }), () => null);

export function WalletLooksProvider({ children }: { children: ReactNode }) {
  const { accountId } = useDiaryView();
  const [state, setState] = useState<Kept>(() => nothingKept(accountId));
  // Every read and every change runs after the one before it.
  const queue = useRef<Promise<void>>(Promise.resolve());
  // By account, while this provider is mounted: each change that was not stored and every change made
  // after it, in the order made. Each read lays them over what it reads.
  const unstored = useRef(new Map<string, readonly Edit[]>());
  const enqueue = useCallback((step: () => Promise<void>) => {
    const run = queue.current.then(step);
    queue.current = run.catch(() => undefined);
    return run;
  }, []);

  useEffect(() => {
    setState((now) => (now.accountId === accountId ? now : nothingKept(accountId)));
    if (accountId === null) return;
    const store = walletAccountStore(accountId);
    void enqueue(async () => {
      const [looks, order, icons] = await Promise.all([LOOKS, ORDER, ICONS].map((slot) => readName(store, slot.name)));
      const read: Kept = { accountId, looks: parseLooks(looks?.raw ?? null), order: parseOrder(order?.raw ?? null), icons: parseIcons(icons?.raw ?? null) };
      const shown = layOver(read, unstored.current.get(accountId) ?? []);
      setState((now) => (now.accountId === accountId ? shown : now));
    });
  }, [accountId, enqueue]);

  const keep = useCallback(<T,>(slot: Slot<T>, change: (value: T) => T): Promise<void> => {
    if (accountId === null) return Promise.resolve();
    const store = walletAccountStore(accountId);
    const edit: Edit = (kept) => slot.put(kept, change(slot.of(kept)));
    return enqueue(async () => {
      const stored = await readName(store, slot.name);
      const earlier = unstored.current.get(accountId) ?? [];
      const edits = [...earlier, edit];
      // What the store holds (what is shown, when it cannot be read), with each change not stored and this one over it.
      setState((now) => (now.accountId === accountId ? layOver(stored === null ? now : slot.put(now, slot.parse(stored.raw)), edits) : now));
      // A name the store cannot read is never written over, and a write that fails is caught.
      const written = stored !== null && (await store.set(slot.name, JSON.stringify(change(slot.parse(stored.raw)))).then(() => true, () => false));
      if (!written || earlier.length > 0) unstored.current.set(accountId, edits);
    });
  }, [accountId, enqueue]);

  const setLook = useCallback((walletId: string, look: WalletLook) => keep(LOOKS, (looks) => ({ ...looks, [walletId]: look })), [keep]);
  const setOrder = useCallback((ids: readonly string[]) => keep(ORDER, () => [...new Set(ids)]), [keep]);
  const setIcon = useCallback((categoryId: string, icon: GlyphKey) => keep(ICONS, (icons) => ({ ...icons, [categoryId]: icon })), [keep]);

  // Right after the account changes, nothing of the last account's shows, even for one render.
  const kept = useMemo(() => (state.accountId === accountId ? state : nothingKept(accountId)), [state, accountId]);
  const value = useMemo<LooksContextValue>(() => ({ kept, setLook, setOrder, setIcon }), [kept, setLook, setOrder, setIcon]);
  return <LooksContext.Provider value={value}>{children}</LooksContext.Provider>;
}

/** Wallet looks and order as the nearest provider keeps them; outside one, derived looks and no order. */
export function useWalletLooks(): WalletLooks {
  const { kept, setLook, setOrder } = useContext(LooksContext);
  return useMemo(() => ({
    lookOf: (walletId: string) => kept.looks[walletId] ?? derivedLook(walletId),
    setLook,
    order: kept.order,
    setOrder,
  }), [kept, setLook, setOrder]);
}

/** Category icons as the nearest provider keeps them; outside one, none are kept. */
export function useCategoryIcons(): CategoryIcons {
  const { kept, setIcon } = useContext(LooksContext);
  const { icons } = kept;
  return useMemo(() => ({ iconOf: (category) => iconFor(category, icons), setIcon }), [icons, setIcon]);
}
```

### The provider's change (`PL/diffs/apps_app_src_wallet_looks_WalletLooksProvider.tsx.diff`)

```diff
--- a/apps/app/src/wallet/looks/WalletLooksProvider.tsx
+++ b/apps/app/src/wallet/looks/WalletLooksProvider.tsx
@@ -8,12 +8,17 @@
 // mounts the one provider (P2-T18); outside it, looks are derived, no order
 // or icon is kept, and nothing changes.
 //
-// Each change reads its name from the store, changes it and writes it back,
-// after the account's first read and after the change before it: two quick
-// changes never drop each other, and a change made just before the account
-// changes is kept for the account it was made in. A name the store cannot
-// read counts as nothing kept and is never written over; a change to it, or a
-// write that fails, shows until the app closes.
+// Every read and every change waits for the one before it (one queue). Each
+// change reads its name from the store, changes it and writes it back, so two
+// quick changes never drop each other and a change made just before the
+// account changes is kept for the account it was made in. A name the store
+// cannot read counts as nothing kept and is never written over. A change that
+// is not stored (its name could not be read, or its write failed) stays in
+// memory for its account, with each change made after it, and is laid over
+// every later read of that account's names, the change's own and the
+// account's first: it shows until the app closes (while this provider stays
+// mounted), and a later change still wins over it. A write holds only what
+// was read and the change itself.
 import type { CategoryDto } from '@gogospend/contracts';
 import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
 import type { ReactNode } from 'react';
@@ -56,6 +61,12 @@
 
 const nothingKept = (accountId: string | null): Kept => ({ accountId, looks: {}, order: [], icons: {} });
 
+/** One change, as it acts on everything kept: its own name, changed. */
+type Edit = (kept: Kept) => Kept;
+
+/** Lays changes over what was read, in the order they were made. */
+const layOver = (kept: Kept, edits: readonly Edit[]): Kept => edits.reduce((now, edit) => edit(now), kept);
+
 export type WalletLooks = {
   /** The kept look, else the one derived from the id. */
   lookOf(walletId: string): WalletLook;
@@ -96,6 +107,9 @@
   const [state, setState] = useState<Kept>(() => nothingKept(accountId));
   // Every read and every change runs after the one before it.
   const queue = useRef<Promise<void>>(Promise.resolve());
+  // By account, while this provider is mounted: each change that was not stored and every change made
+  // after it, in the order made. Each read lays them over what it reads.
+  const unstored = useRef(new Map<string, readonly Edit[]>());
   const enqueue = useCallback((step: () => Promise<void>) => {
     const run = queue.current.then(step);
     queue.current = run.catch(() => undefined);
@@ -109,18 +123,24 @@
     void enqueue(async () => {
       const [looks, order, icons] = await Promise.all([LOOKS, ORDER, ICONS].map((slot) => readName(store, slot.name)));
       const read: Kept = { accountId, looks: parseLooks(looks?.raw ?? null), order: parseOrder(order?.raw ?? null), icons: parseIcons(icons?.raw ?? null) };
-      setState((now) => (now.accountId === accountId ? read : now));
+      const shown = layOver(read, unstored.current.get(accountId) ?? []);
+      setState((now) => (now.accountId === accountId ? shown : now));
     });
   }, [accountId, enqueue]);
 
   const keep = useCallback(<T,>(slot: Slot<T>, change: (value: T) => T): Promise<void> => {
     if (accountId === null) return Promise.resolve();
     const store = walletAccountStore(accountId);
+    const edit: Edit = (kept) => slot.put(kept, change(slot.of(kept)));
     return enqueue(async () => {
       const stored = await readName(store, slot.name);
-      const value = stored === null ? null : change(slot.parse(stored.raw));
-      setState((now) => (now.accountId === accountId ? slot.put(now, value ?? change(slot.of(now))) : now));
-      if (value !== null) await store.set(slot.name, JSON.stringify(value)).catch(() => undefined);
+      const earlier = unstored.current.get(accountId) ?? [];
+      const edits = [...earlier, edit];
+      // What the store holds (what is shown, when it cannot be read), with each change not stored and this one over it.
+      setState((now) => (now.accountId === accountId ? layOver(stored === null ? now : slot.put(now, slot.parse(stored.raw)), edits) : now));
+      // A name the store cannot read is never written over, and a write that fails is caught.
+      const written = stored !== null && (await store.set(slot.name, JSON.stringify(change(slot.parse(stored.raw)))).then(() => true, () => false));
+      if (!written || earlier.length > 0) unstored.current.set(accountId, edits);
     });
   }, [accountId, enqueue]);
 
```

### The test file's change (`PL/diffs/apps_app_src_wallet_looks_WalletLooks.render.test.tsx.diff`)

```diff
--- a/apps/app/src/wallet/looks/WalletLooks.render.test.tsx
+++ b/apps/app/src/wallet/looks/WalletLooks.render.test.tsx
@@ -1,12 +1,14 @@
 // Looks kept on the phone (P2-T11, W5, W7, R64): the provider keeps wallet
 // looks, the wallet order and category icons for the open diary's account,
-// one change after another and never over what it could not read; Bun's five
-// faces and the five materials are the boards'; a category's tile; and the
-// kit's catalogue sections.
+// one change after another and never over what it could not read, and what it
+// could not store shows until the app closes (wallet-looks-unstored); Bun's
+// five faces and the five materials are the boards'; a category's tile; and
+// the kit's catalogue sections.
 import { act, cleanup, render, screen } from '@testing-library/react';
 import { readFileSync } from 'node:fs';
 import { dirname, join } from 'node:path';
 import { fileURLToPath } from 'node:url';
+import { useEffect } from 'react';
 import { Text } from 'react-native';
 import { afterEach, expect, test, vi } from 'vitest';
 
@@ -15,7 +17,7 @@
 
 import { WALLET_SECTIONS } from '@mobile/dev/catalogue/wallet';
 import { rgba } from '@mobile/dev/catalogue/catalogueTestHarness';
-import { useDiaryView } from '@mobile/spend/v1/SpendDiaryContext';
+import { SpendDiaryProvider, useDiaryView } from '@mobile/spend/v1/SpendDiaryContext';
 import { createFakeDiary } from '@mobile/spend/v1/testing/fakeDiary';
 import { materialPaint, tileTint, WALLET_MATERIALS } from '@mobile/theme/walletPalette';
 import { CATEGORY_DRAWINGS } from '@mobile/ui/categoryDrawings';
@@ -27,7 +29,7 @@
 import { WalletCategoryIcon } from './WalletCategoryIcon';
 import { BUN_FACES, derivedLook } from './walletLooks';
 import type { WalletLook } from './walletLooks';
-import { useCategoryIcons, useWalletLooks } from './WalletLooksProvider';
+import { useCategoryIcons, useWalletLooks, WalletLooksProvider } from './WalletLooksProvider';
 import type { CategoryIcons, WalletLooks } from './WalletLooksProvider';
 
 afterEach(() => {
@@ -124,6 +126,25 @@
   };
 }
 
+/** The harness's store, read and written in place; while a fault is set, every read or every write fails. */
+function storeOver(stored: Map<string, string>) {
+  const faults = { reads: false, writes: false };
+  const backend: StoreBackend = {
+    getItem: async (key) => {
+      if (faults.reads) throw new Error('the keychain is locked');
+      return stored.get(key) ?? null;
+    },
+    setItem: async (key, value) => {
+      if (faults.writes) throw new Error('the disk is full');
+      stored.set(key, value);
+    },
+    removeItem: async (key) => { stored.delete(key); },
+    getAllKeys: async () => [...stored.keys()],
+    multiRemove: async (keys) => { for (const key of keys) stored.delete(key); },
+  };
+  return { faults, backend };
+}
+
 test("a kept look, the wallet order and a category's icon go to this account's store, and two quick changes keep each other", async () => {
   const { stored } = mountWallet(<Keeper />, { account: { looks: JSON.stringify({ [W2]: SKY }) } });
   await settle();
@@ -193,7 +214,8 @@
 });
 
 test('a name the store cannot read is never written over, and what fails to store still shows until the app closes', async () => {
-  const { stored } = mountWallet(<Keeper />, { account: { looks: JSON.stringify({ [W2]: SKY }) } });
+  const fake = createFakeDiary();
+  const { stored } = mountWallet(<Keeper />, { diary: fake.diary, account: { looks: JSON.stringify({ [W2]: SKY }) } });
   await settle();
   const written: string[] = [];
   const locked = new Error('the keychain is locked');
@@ -223,11 +245,32 @@
   });
   await act(async () => { await api?.looks.setLook(W3, CASH); });
   expect(shown().w3).toEqual(CASH);
+
+  // Until the app closes. The store works again. When the diary locks and opens, the account's next first
+  // read lays what was never stored over what the store holds; another account never shows it, at its
+  // first read or at a change.
+  installStoreBackend(storeOver(stored).backend);
+  await act(async () => { fake.set({ accountId: null, phase: 'locked' }); });
+  await settle();
+  expect(shown(), 'locked').toEqual({ w1: derivedLook(W1), w2: derivedLook(W2), w3: derivedLook(W3), order: [], c1: 'lotus' });
+  await act(async () => { fake.set({ accountId: TEST_ACCOUNT_ID, phase: 'ready' }); });
+  await settle();
+  expect(shown(), 'opened again').toEqual({ w1: PEACH, w2: SKY, w3: CASH, order: [], c1: 'book' });
+  stored.set(keyOf(OTHER_ACCOUNT, 'looks'), JSON.stringify({ [W1]: CASH }));
+  await act(async () => { fake.set({ accountId: OTHER_ACCOUNT }); });
+  await settle();
+  expect(shown(), "the other account's first read").toEqual({ w1: CASH, w2: derivedLook(W2), w3: derivedLook(W3), order: [], c1: 'lotus' });
+  await act(async () => { await api?.looks.setLook(W3, SKY); });
+  expect(shown(), "the other account's change").toEqual({ w1: CASH, w2: derivedLook(W2), w3: SKY, order: [], c1: 'lotus' });
+  await act(async () => { fake.set({ accountId: TEST_ACCOUNT_ID }); });
+  await settle();
+  expect(shown(), 'this account again').toEqual({ w1: PEACH, w2: SKY, w3: CASH, order: [], c1: 'book' });
+  expect(stored.get(keyOf(TEST_ACCOUNT_ID, 'looks')), 'never written').toBe(JSON.stringify({ [W2]: SKY }));
   cleanup();
 
-  // An account whose first read fails shows derived looks.
-  const fake = createFakeDiary({ accountId: null });
-  mountWallet(<Keeper />, { diary: fake.diary });
+  // An account whose first read fails shows derived looks; once its names read again, a change shows what they hold.
+  const later = createFakeDiary({ accountId: null });
+  const again = mountWallet(<Keeper />, { diary: later.diary, account: { looks: JSON.stringify({ [W2]: SKY }) } });
   await settle();
   installStoreBackend({
     getItem: async () => { throw locked; },
@@ -236,11 +279,92 @@
     getAllKeys: async () => [],
     multiRemove: async () => undefined,
   });
-  await act(async () => { fake.set({ accountId: TEST_ACCOUNT_ID }); });
+  await act(async () => { later.set({ accountId: TEST_ACCOUNT_ID }); });
   await settle();
   expect(shown()).toEqual({ w1: derivedLook(W1), w2: derivedLook(W2), w3: derivedLook(W3), order: [], c1: 'lotus' });
+  installStoreBackend(storeOver(again.stored).backend);
+  await act(async () => { await api?.looks.setLook(W1, PEACH); });
+  expect(shown(), 'what the store holds, with the change over it').toMatchObject({ w1: PEACH, w2: SKY });
+});
+
+// The review's ready case D1 (P2-T11 m1).
+test('a change whose write failed still shows after a later change to the same name is stored, and the store holds only what was stored', async () => {
+  const { stored } = mountWallet(<Keeper />, { account: { looks: JSON.stringify({ [W2]: SKY }) } });
+  await settle();
+  const store = storeOver(stored);
+  installStoreBackend(store.backend);
+  store.faults.writes = true;
+  await act(async () => { await api?.looks.setLook(W1, PEACH); });
+  expect(shown().w1, 'right after the failed write').toEqual(PEACH);
+  store.faults.writes = false;
+  await act(async () => { await api?.looks.setLook(W3, CASH); });
+  expect(JSON.parse(stored.get(keyOf(TEST_ACCOUNT_ID, 'looks')) ?? 'null'), 'what the store holds').toEqual({ [W2]: SKY, [W3]: CASH });
+  expect(shown(), 'after a later change to the same name').toMatchObject({ w1: PEACH, w2: SKY, w3: CASH });
 });
 
+// The review's ready case D2 (P2-T11 m1).
+test('a change made while its name could not be read still shows after the store reads again and a later change to it is stored', async () => {
+  const { stored } = mountWallet(<Keeper />, { account: { looks: JSON.stringify({ [W2]: SKY }) } });
+  await settle();
+  const store = storeOver(stored);
+  installStoreBackend(store.backend);
+  store.faults.reads = true;
+  await act(async () => { await api?.looks.setLook(W1, PEACH); });
+  expect(shown().w1, 'while unreadable').toEqual(PEACH);
+  expect(stored.get(keyOf(TEST_ACCOUNT_ID, 'looks')), 'never written over').toBe(JSON.stringify({ [W2]: SKY }));
+  store.faults.reads = false;
+  await act(async () => { await api?.looks.setLook(W3, CASH); });
+  expect(JSON.parse(stored.get(keyOf(TEST_ACCOUNT_ID, 'looks')) ?? 'null'), 'what the store holds').toEqual({ [W2]: SKY, [W3]: CASH });
+  expect(shown(), 'the earlier change, after the store reads again').toMatchObject({ w1: PEACH, w2: SKY, w3: CASH });
+});
+
+test("a later change wins over one that was never stored, at every later read of the account's names", async () => {
+  const fake = createFakeDiary();
+  const { stored } = mountWallet(<Keeper />, { diary: fake.diary, account: { looks: JSON.stringify({ [W2]: SKY }) } });
+  await settle();
+  const store = storeOver(stored);
+  installStoreBackend(store.backend);
+  // A look that is not stored, then a later look for the same wallet that is; the same for the order.
+  store.faults.writes = true;
+  await act(async () => { await api?.looks.setLook(W1, PEACH); });
+  store.faults.writes = false;
+  await act(async () => { await api?.looks.setLook(W1, CASH); });
+  store.faults.writes = true;
+  await act(async () => { await api?.looks.setOrder([W1, W2]); });
+  store.faults.writes = false;
+  await act(async () => { await api?.looks.setOrder([W2]); });
+  expect(shown(), 'after the later changes').toMatchObject({ w1: CASH, w2: SKY, order: [W2] });
+  // The next change to the name reads it again, and so does the account's first read when it opens again.
+  await act(async () => { await api?.looks.setLook(W3, SKY); });
+  expect(shown(), 'after the next change').toMatchObject({ w1: CASH, w2: SKY, w3: SKY, order: [W2] });
+  await act(async () => { fake.set({ accountId: OTHER_ACCOUNT }); });
+  await settle();
+  await act(async () => { fake.set({ accountId: TEST_ACCOUNT_ID }); });
+  await settle();
+  expect(shown(), "after the account's first read").toEqual({ w1: CASH, w2: SKY, w3: SKY, order: [W2], c1: 'lotus' });
+  expect(JSON.parse(stored.get(keyOf(TEST_ACCOUNT_ID, 'looks')) ?? 'null')).toEqual({ [W2]: SKY, [W1]: CASH, [W3]: SKY });
+  expect(JSON.parse(stored.get(keyOf(TEST_ACCOUNT_ID, 'wallet-order')) ?? 'null')).toEqual([W2]);
+});
+
+// The review's ready case D8b (P2-T11 m1). React runs a child's effects before its parent's, so this
+// change runs before the provider's first read.
+test("a change made from a child's mount effect, whose write fails, still shows once the account's first read lands", async () => {
+  const stored = new Map([[keyOf(TEST_ACCOUNT_ID, 'looks'), JSON.stringify({ [W2]: SKY })]]);
+  const store = storeOver(stored);
+  store.faults.writes = true;
+  installStoreBackend(store.backend);
+  function ChangesOnMount() {
+    const { setLook } = useWalletLooks();
+    useEffect(() => { void setLook(W1, PEACH); }, [setLook]);
+    return null;
+  }
+  render(<SpendDiaryProvider diary={createFakeDiary().diary}><WalletLooksProvider><ChangesOnMount /><Keeper /></WalletLooksProvider></SpendDiaryProvider>);
+  await settle();
+  await settle();
+  expect(shown()).toMatchObject({ w1: PEACH, w2: SKY });
+  expect(stored.get(keyOf(TEST_ACCOUNT_ID, 'looks')), 'never written').toBe(JSON.stringify({ [W2]: SKY }));
+});
+
 test('outside the provider looks are derived, no order or icon is kept, and the setters keep nothing', async () => {
   render(<Keeper />);
   await act(async () => {
```
