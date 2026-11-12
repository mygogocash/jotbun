# P2-T25 confirming review: Recently deleted, the fix round

- **Reviewer:** Claude Opus 5.5, the independent confirming review, read-only.
- **Reviewed:** PR #412 at `272aa84b` on `p2/t25-recently-deleted`, the fix round after the reviewed head `b840c195`:
  - `52d647bf`, the merge of `a00fff7c` (P1);
  - `0be9ba27`, the fix (8 files), built on Gemini 3.8 Flash from the Opus-planned kit;
  - `272aa84b`, the controller's own fix: one stub in `SpendRoutes.render.test.tsx`.
- **Against:**
  - the plan's `### Task P2-T25` (line 1287), its Global Constraints (lines 82 to 108) and Review Focus 2;
  - ruling R109 (`handover.md:185`), the brief `briefs/P2-T25-fix.md` (P1 to P18) and its kit in `scratch/p2-t25-fix-planner/`;
  - the first review (`reviews/P2-T25.md`) and the second (`reviews/P2-T25-second.md`);
  - the implementer's logs in `scratch/p2-t25-fix/`, both receipts, and the protocol (R87, R100).
- **Where:**
  - `scratch/p2-t25-confirm/tree/` is `git archive 272aa84b`, with `node_modules` symlinked from the worktree. Probes and mutants ran only there, and every mutated file was put back with its sha256 checked.
  - The worktree is clean at `272aa84b`, level with its remote branch. The main checkout was not touched.
  - Load average was about 10.7 on 18 cores. No case timed out.

## Verdict

Approved: no blocker and no major. There is one minor and three nits, and none of them blocks.

- **B1 holds.** `bw-deleted` stages the real screen on its own fakes, behind `lazy()`. CI's per-section job ran both catalogue cases and passed them.
- **M1 holds.** After a restore with private mode on, no amount appears on screen, in a live region, or in what iOS is told to speak. That was true in Thai and English, light and dark, through refusals, an unconfirmed restore and Try again. It also holds when private mode is turned on after the restore (probe A). No task case pins that last order (n1).
- **M2 holds.** Nothing calls `trackRecordRestored`.
- **The six pins hold the guards they name.** All six were killed in my sample, each in the case named.
- **`272aa84b`: a stub is the right tool there.** The routes test still checks the rule it always checked: `core`, the legacy flag and `off`. The `wallet` half of the route's rule has never had a case (m1).

## CI (R100)

- **Run 43122516449** on `272aa84b` (pull_request), from 23:47:43Z on 11 November to 00:00:45Z on 12 November: success, 9 of 9.
  - **Typecheck, unit, API, build:** `typecheck`, `typecheck:app` and `typecheck:routes` clean. `test:app` 34 of 34, `test:unit` 1010 of 1010, `test:dev` 7 of 7.
  - **Render (every file but the per-section suites):** 116 files, 1436 of 1436. That includes WalletDeleted (15), RecentlyDeleted (17) and SpendRoutes (3).
  - **Render, per-section suites:**
    - ids of length 3n: 170 passed, 440 skipped;
    - ids of length 3n+1: 212 passed, 398 skipped, including `section bw-deleted renders without errors in light and dark, in en, th and vi` and `section bw-deleted: every control has a name, nothing hidden takes focus`;
    - every other test: 228 passed, 382 skipped.
  - **Exports (web and iOS bundles):** pass. The route bundles with the real screen.
  - **Edge:** `test:edge` 189 of 189; `test:edge:workers` 776 passed and 1 todo; `test:edge:db` 12 of 12.
  - **SQL integration and ops:** `test:db` 694 of 694 (41 suites); `test:ops` 111 of 111.
  - **Release image and smoke:** pass.
- **At `0be9ba27`,** the render job could not load `SpendRoutes.render.test.tsx` (`SyntaxError: Unexpected token 'typeof'`). `272aa84b` is the fix.
- **Not rerun here (R100):** the whole suites. Docker is stopped, so no database suite ran locally.

## Findings

### Blocker

None.

### Major

None.

### Minor

**m1. Half of the route's rule has no case: nothing checks that the `wallet` area shows `WalletDeletedScreen` on the shared resources.**

- **Where:** `app/spend/deleted.tsx:14`, `isRedesignEnabled('wallet') ? <WalletDeletedScreen /> : <RecentlyDeletedScreen />`. This was added in round one, not in this round.
  - `SpendRoutes.render.test.tsx:126-137` never turns the `wallet` area on.
  - The stub at line 39 draws `wallet recently deleted`, and no case looks for it.
  - The old screen's stub (lines 40 to 47) reads `useSpendV1()`, which proves the route hands it the shared port. The wallet stub does not.
- **Mutants (mine, `scratch/p2-t25-confirm/own-mutants.out`):** both pass SpendRoutes 3 of 3.
  - X3a: the route never shows the wallet screen.
  - X3b: the wallet screen is drawn outside `SpendV1Provider`, so on a phone it throws `useSpendV1 needs a SpendV1Provider.`
- **Probe** (`tree/apps/app/src/screens/redesign/zzConfirmRoutes.render.test.tsx`): the route under seven flag sets.
  - `wallet`, `core,wallet` and `all`: the wallet screen on the shared resources.
  - The default and `wallet,-wallet`: the old screen.
  - `-core,wallet`, and `wallet` with the legacy flag: a redirect to `/spend/all`.
  - It passes at `272aa84b` and kills X3a and X3b. So the route is right today; only the pin is missing.
- **Why it matters:** E2 takes its captures from catalogue deep links (plan line 135), not from the route. A broken wallet branch would go unseen until P2-T38 turns the area on.
- **Precedent:** P2-T33's route got `LockRoute.render.test.tsx` from its first review's n2.
- **Fix** (a few lines, now that the stub exists): let the wallet stub read `useSpendV1()` as the old screen's does, and add the probe's cases to `SpendRoutes.render.test.tsx`.

### Nit

**n1. A restore followed by private mode turned on is handled right, but no case pins it.**

- **Probe A** (`zzConfirmPrivate.render.test.tsx`; Thai and English, light and dark):
  - Restore rent with private mode off. The notice reads `ค่าบิล ฿12,268.00 กลับมาอยู่ในประวัติแล้ว`.
  - Turn private mode on through the provider's `toggle`. The notice becomes `ค่าบิล กลับมาอยู่ในประวัติแล้ว` (English: `Bills is back in History.`).
  - Neither the container nor any live region then holds `฿` followed by a digit, or `12,268`.
  - The next text handed to `useAnnouncement` (what iOS speaks) is the hidden line.
  - This holds because the words are chosen at render time: `noticeWords` at `WalletDeletedScreen.tsx:53-55`, called at line 264.
- **Mutant X1** (the words decided once, when the notice appears) passes all 15 cases of `WalletDeleted.render.test.tsx`. Probe A kills it, and so does probe C (the reverse order).
- **A phone cannot reach this today:**
  - no routed screen draws the eye yet (`PrivateEyeButton` is on no route);
  - the spend layout's `Slot` unmounts Recently deleted whenever another spend screen opens;
  - Settings has no private-mode row.
- **Fix:** add one loop to the R109 case. Restore with private mode off, flip it (a small `toggle` button inside `mountWallet`, as the probe does), then run the same checks.

**n2. A transfer's amount has no case.**

- Ruling P7 and the fix receipt say a move is drawn as its size alone, in ink.
- Mutant X2 makes a move draw like income: `sign={row.type === 'expense' ? 'none' : 'income'}`, so the move reads `+฿1,500` in violet. It passes all 15 cases.
- The m4 case already lists the move (`· Cash → Daily account · เมื่อวาน`). One check of its sign and colour would pin it.

**n3. The fix receipt never mentions `272aa84b`.**

- `receipts/P2-T25-fix.md` gives the gate as the focused files and kit suites (8 files, 120 of 120), and says the commit "changes no route". That is true.
- But `SpendRoutes.render.test.tsx` loads the route, and with it the screen. The gate never ran that file, which is how CI went red at `0be9ba27`.
- The PR body records this. One line in the receipt would keep it true to the PR: name `272aa84b`, its stub, and the four routes tests now in the fast gate.

## What holds

### `272aa84b` (checked on its own)

- **A stub is the right tool there:**
  - **Without it** (my copy of the file minus line 39), the file fails to load: `SyntaxError: Unexpected token 'typeof'` (`probe-nostub.log`). That is CI's failure, and it is also the controller's `ctl-spendroutes-red.log`.
  - **Mocking only the m5 import is not enough.** With just `react-native-safe-area-context` mocked, the file then fails on `Cannot find module .../expo/build/async-require/hmr` (`probe-safearea.log`).
    - The real screen needs the five mocks that `WalletDeleted.render.test.tsx` sets up (lines 13 to 18).
    - Copying them into a routes file would tie it to the screen's imports.
  - **The file's purpose:** it says it tests only the routes' rules (lines 1 to 6), and it already stubs every other screen.
  - **No coverage was lost.** Before `272aa84b`, no case turned the `wallet` area on, so the real screen was imported but never drawn.
  - **The route still bundles** with the real screen: CI's Exports job passed at `272aa84b`.
- **The routes test still checks the rule it checked:**
  - under `core`, the old screen draws on the shared resources;
  - `off`, `-core` and the legacy flag redirect to `/spend/all`.
  - It passes 3 of 3 here and in CI. Its wallet half was never checked (m1).
- **The fast gate's four routes tests at head:** SpendRoutes, AccountRoutes, InsightsRoutes and PlanningRoutes, run together with WalletDeleted and RecentlyDeleted: 6 files, 43 of 43 (`focused-head.log`).

### M1: no amount after a restore in private mode

- **The hook:**
  - `restored: row` is set only after a confirmed restore (`deletedData.ts:138`). The refusal and unconfirmed notices carry none (line 146).
  - `message` is unchanged. The old screen still draws `shownNotice.message` (`RecentlyDeletedScreen.tsx:96`), and its suite passes 17 of 17.
- **The wallet screen** reads `usePrivateMode()` itself (line 216) and picks the words at render time.
- **Probe B** (Thai and English), with private mode on throughout: a `deleted` refusal, an archived-category refusal, an unconfirmed restore, Try again, then the confirmed restore.
  - At every step, neither the container nor any live region holds `฿` followed by a digit, `12,268` or `12268`.
  - Nothing handed to `useAnnouncement` holds `฿` followed by a digit, `12,268` or `182`.
  - The spoken line is `ค่าบิล กลับมาอยู่ในประวัติแล้ว` / `Bills is back in History.`.
- **Probe A:** private mode turned on after the restore (n1).
- **Probe C:** private mode turned off after a hidden restore brings the amount back, which private mode allows.
- **The task's R109 case,** MP2 and MH (killed in my sample).
- **The second review's three points** (its major, its minor and its nit) are all answered by this round.

### B1: the section on its own fakes, behind `lazy()`

- **`deletedSection.tsx` stages the real screen with `screenSection`:**
  - the stage makes its fakes once per mount (`screenSection.tsx:112`, `useState(spec.fixture)`);
  - it provides `SpendV1Provider` and the diary (lines 127 to 128);
  - it gives no top inset under the catalogue's chrome (line 125), as P10 says.
- **`recordSections.tsx`** imports only `lazy`, `Suspense` and `View`, and its fallback reads `catalogue-screen-running`.
- **Two mutants, killed in my sample:**
  - B1c: the stage on fakes with nothing deleted.
  - B1e: a static import. `walletHarness` and `Tray` then fail to load with `SyntaxError: Unexpected token 'typeof'`, so `lazy()` is still load-bearing.
- **`dayLabel` takes `vi`,** so the catalogue's Vietnamese pass draws real day labels.

### M2: nothing carried

- `git grep trackRecordRestored 272aa84b -- apps/app/src apps/app/app` finds only its definition (`analytics/events.ts:46`), the event catalog and their tests.
- The test mocks no analytics module.
- Nothing changes under `src/analytics`, in `historyModel.ts` or in `RecentlyDeletedScreen.render.test.tsx`.

### The six pins

- **R1:** the first case clicks Restore twice inside one `act` (`WalletDeleted.render.test.tsx:237-240`).
  - React draws nothing between the clicks, so the second click still finds the row enabled and reaches `restore`.
  - Only the `acting` ref (`deletedData.ts:126`) stops it.
  - Without the ref, the same key is sent twice, and `toHaveLength(1)` (line 244) fails.
- **R2** also leaves the busy row enabled; it is killed the same way.
- **R3 and R4:** a row with 36 hours left reads `เหลือ 2 วัน`, quiet at weight 400. Exactly one row is the last day, in ink at 700, in each mode (lines 263 to 267).
- **R15:** rent's row text holds `· Daily account ·` (line 233).
- **R17:** the footer line is shown (line 234).
- **Result:** all six were killed in my sample, each on assertions in the case named, matching the brief's lines.

### Mutants

- **My sample of the kit's 48:** R1, R2, R3, R4, R15, R17, MP2, MH, B1c and B1e.
  - 10 killed, with the same counts and first failing case as the brief's `mutants.out` lines.
  - Every file was restored with its sha256 equal (`sample-mutants.out`).
- **My own mutants:**
  - X1: the notice's words decided once (n1);
  - X2: a move drawn as income (n2);
  - X3a and X3b: the route's wallet branch (m1).
  - They ran with `scratch/p2-t25-confirm/confirm_mutants.py`, which uses no git. Each was killed only by my probes, never by the task's tests; every file was restored with its sha256 equal.

### Merge, kit, logs, receipts

- **The merge:**
  - `52d647bf`'s parents are `b840c195` and `a00fff7c`.
  - `index.ts` gains only the RECORD import and spread, between ADD and LOCK, and it equals the kit's `merge/index.ts`.
  - The merge touches none of the task's other files.
- **The kit:** at head, the kit's `SHA256SUMS.real-in-wt` and `SHA256SUMS.receipts-in-wt` check 8 OK.
- **The base:** the integration branch has moved to `fae273e5` since `a00fff7c`, with controller state only. `git diff --stat a00fff7c origin/claude/p1a-vault-core -- apps packages package.json package-lock.json .github` is empty, and GitHub reports the PR as MERGEABLE and CLEAN.
- **The implementer's logs match the brief's Expected lines:**
  - RED: 8 of 15, each an `AssertionError`, with no lookup or load error;
  - the catalogue's two `bw-deleted` cases RED;
  - the pins: 6 of 6 killed;
  - GREEN 32, neighbours 88, catalogue `bw-` 38;
  - mutants: 48 of 48 killed;
  - the gate: 120 of 120, and 2 of 2.
- **The receipts:** `P2-T25.md` carries m6's corrections:
  - nothing was carried;
  - the old screen's behaviour;
  - the seven keys;
  - `useGoBack()`;
  - M14 out of the mutant record;
  - ruling P2 withdrawn;
  - the section.
- **Copy:** the two new keys have Thai and English and are marked drafts. No added app line has an em dash or an emoji.
- **Whitespace:** `git diff --check origin/claude/p1a-vault-core...272aa84b` is clean.

## Notes for later tasks

- **P2-T26 (the record and Undo):**
  - Choose private mode's words when drawing, never when a notice or toast is set (n1). `records.deletedBar` needs the same treatment.
  - Test both orders: private mode on before the action, and turned on after it.
- **Every task whose route imports a wallet screen** (P2-T26's `record/[id].tsx`, P2-T28's `all.tsx`, P2-T29's `categories.tsx` and the rest):
  - In the routes test, stub the screen as `272aa84b` does. Where the route provides the shared resources, the stub reads `useSpendV1()`.
  - Add a case under the `wallet` area (m1).
  - Run the four routes tests in the fast gate.
- **1D-T7 (#138):** nothing calls `trackRecordRestored` today, so its `RecentlyDeletedScreen` case starts RED. Add the call to `useRecentlyDeleted`'s `restore`, after the acknowledgement.
- **E2-B:**
  - `records.restoredHidden`, and the English of `records.backToHistory`, are drafts.
  - A row's day reads วันนี้, เมื่อวาน, or a weekday and date, where the board shows only the date.

VERDICT: Approved
