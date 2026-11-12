# Review P2-T32 fix round (confirming): the month recap

- **Reviewer:** independent confirming review, Claude Opus 5.5. Read-only.
- **Reviewed:** the fix-round commits on `p2/t32-month-recap` (PR #411, base `claude/p1a-vault-core`) after the reviewed head `71b2255e`, at `9add4415`, after `git fetch`:
  - `dbfd5bb4`: the sync merge of the integration head;
  - `b4a99b6e`: the fix (Gemini 3.8 Flash, from the Opus-planned kit);
  - `9add4415`: the controller's stub of the wallet recap in the insights routes test.

  The local head equals `origin/p2/t32-month-recap`. GitHub reports the PR `MERGEABLE`, `CLEAN`. Since the merge, the integration branch has moved to `fae273e5`, but only under `.claude/` (no app file), so the PR's app diff is unchanged.
- **Against:**
  - the plan's `### Task P2-T32` (line 1518) and its Global Constraints (lines 82 to 108);
  - W6, W13, W20, R66, R73, D41 and D42;
  - the first review's M1 to M8 and m1 to m7, under ruling R110;
  - the brief `briefs/P2-T32-fix.md` (P1 to P16) and its kit;
  - the implementer's logs in `scratch/p2-t32-fix/`;
  - the receipts `P2-T32.md` and `P2-T32-fix.md`;
  - the protocol, with R87 and R100.
- **Where I probed:** only in a scratch copy, `.claude/controller/scratch/p2-t32-confirm/src/` (a `git archive` of `9add4415`, with `node_modules` symlinked from the worktree). It holds:
  - two probe files: `apps/app/src/wallet/recap/ConfirmProbes.render.test.tsx` and `apps/app/src/screens/redesign/insights/RouteWalletProbe.render.test.tsx`;
  - my mutant runners, `tools/own_mutants.py` and `tools/o1_probe_kill.py`;
  - the logs, next to `src/` (`probes-s.log`, `probe-route.log`, `own-mutants.out`, `planner-mutants.out`, `focused-*.log`, `catalogue-recap.log`, `ci-job-*.log`).

  Every mutated file was restored and checked by sha256. Nothing in the worktree or the main checkout was edited.

## Summary

**What is right:**
- **M1 to M8 and the minors are fixed.** I confirmed each with code, a focused run, and a sampled or own mutant (table below).
- **The kit is what was committed.** `shasum -a 256 -c SHA256SUMS.real-in-wt` on `9add4415`'s tree gives 16 `OK`.
- **The merge resolution is clean.** It is one additive spread in plan order: ADD, RECAP, LOCK.
- **The controller's `9add4415` is right.** It hides a Vitest loading limit, not a product failure: CI bundled the real route for web and iOS at the same head.
- **RED was behavioural:** all 25 render cases failed on an assertion or an asserting lookup, and the 6 Node cases on `AssertionError`.
- **The implementer's GREEN and gate logs match the receipt's counts.**

**What needs fixing:** no blocker and no major. There are three minors and three nits:
- the one real defect, m1, is latent: a month changed in place spends its one celebration on the previous month's data. No path in today's app changes the wallet recap's month in place;
- two test gaps, m2 and m3, each with a one-case fix;
- three small nits.

## CI on PR #411 (run 43122735276, head `9add4415`)

All 9 jobs pass. Counts are from the job logs:

| Job | Result |
| --- | --- |
| Typecheck, unit, API, build | pass. `typecheck`, `typecheck:app` and `typecheck:routes` clean; `test:api` 47 suites, 1000 tests; `test:app` 34 of 34; `test:unit` 1016 of 1016; `test:dev` 7 of 7; the API build. |
| Render (every file but the per-section suites) | pass. 116 files, 1446 tests. Among them: `WalletRecap.render.test.tsx` 25, `RecapScreen` 36, `InsightsScreen` 36, `CashbackCard` 4, and the four routes tests (Spend 3, Account 2, Insights 3, Planning 3). |
| Render, per-section suites (every other test) | pass. 232 passed, 384 skipped (616). The log lists `bw-recap`. |
| Render, per-section suites (ids of length 3n) | pass. 170 passed, 446 skipped (616). |
| Render, per-section suites (ids of length 3n+1) | pass. 214 passed, 402 skipped (616). The log lists `bw-recap-over`. |
| Exports (web and iOS bundles) | pass. Web bundled 4,844 modules and iOS 5,810, both exported. |
| SQL integration and ops | pass. 41 suites, 694 tests; ops 111 of 111. |
| Edge Worker | pass. 189, then 776 (and 1 todo), then 12. |
| Release image and smoke | pass. The smoke reports `"ok": true`. |

The per-section logs print only cases slower than 300 ms, so `bw-recap-private` and `bw-recap-cashback` are not named in them. My focused catalogue run below names all four sections, in both suites.

## What I ran

**Focused files, in the scratch copy:**
- **Node:** `biggestDay.test.ts`, `recapShare.test.ts` and `draftText.test.ts`: 10 of 10.
- **Render:** 7 files, 76 of 76:
  - `WalletRecap` 25;
  - `RecapScreen` 36;
  - `CashbackCard` 4;
  - the four routes tests, 11. The fast gate requires these, because `WalletRecapScreen` is imported by `app/spend/recap/[month].tsx`.

  The log has no React warning and no unhandled rejection.
- **Catalogue:** `CatalogueScreen` and `screenReader` with `-t "bw-recap"`: 8 of 8. Each of the four sections renders in light and dark, in en, th and vi, and passes the screen-reader check.

**Probes.** Each asserts the round's own claim, so a failing probe is the evidence.

| Probe | What it asserts | Result |
| --- | --- | --- |
| PROBE-S1 | August is celebrated, then the month changes in place to April, an empty past month. April gets no haptic, no mark and no pieces. | **fails**: `{"haptic":[["celebration"]],"aprilMark":"1","pieces":24}`, over the empty state |
| PROBE-S2 | The same switch to July, whose load fails. | **fails**: the haptic plays, the mark is kept and 24 pieces show, over the problem state |
| PROBE-S3 | The same switch to July while July's summary is held. Nothing is spent while it loads. | **fails**: spent while loading |
| CONTROL-S4 | The same switch to July, unmarked, which loads normally. July celebrates once. | passes |
| PROBE-R | Under `EXPO_PUBLIC_REDESIGN=wallet`, the recap route draws the wallet recap with the shared resources. | passes at `9add4415`, and fails under O1 (`o1_probe_kill.py`: exit 1, restored) |

**Mutants:**
- **The planner's sample:** 10 of 91 rerun (C1, C8, K1, K4, K9, F2, S6, A1, D2, M2). All 10 are killed, each restore sha-checked. Nine fail on `AssertionError`; M2 fails on an asserting lookup (`getAllByLabelText('ซ่อนยอดเงินอยู่')`).
- **My own:** 4 mutants, all of which survive:

| Id | Mutant | Tests run | Result |
| --- | --- | --- | --- |
| O1 | `[month].tsx`: `false ?` in place of `isRedesignEnabled('wallet') ?`, so the wallet area never reaches the wallet recap (it still typechecks) | the four routes tests and `WalletRecap` (36) | survived |
| O2 | `Confetti.tsx` without `pointerEvents="none"` | `WalletRecap` (25) | survived |
| O3 | `recap_opened` sent before the month is read, so also on a failed load | `WalletRecap` and `RecapScreen` (61) | survived |
| O4 | `decided.current !== null`, so a month changed in place never celebrates | `WalletRecap` (25) | survived |

## The first review's findings, confirmed

| Item | Status | Evidence |
| --- | --- | --- |
| M1: motion from the wallet's one answer | Fixed | `useCelebration` reads `useWalletReducedMotion()` through `motionFor('recap', reduced)` (`WalletRecapScreen.tsx:147,153`). The recap never asks the phone: the test at `:327` holds `isReduceMotionEnabled` to the root's single call. Pending and Reduce Motion play the haptic alone. Nothing else on the screen moves: `BunFace`, `WalletCategoryIcon`, `WalletAmount`, `PrimaryButton` and `IconButton` have no Reanimated call or timer. C8 and C9 are killed. |
| M2: share failures, Thai first, with a way out | Fixed | `share()` catches the rejection (`:287-294`) and shows the catalog's `เปิดการแชร์ไม่ได้ ลองอีกครั้ง` (th.json:667) as an `alert`. The next press clears it. `trackRecapShared()` follows `await Share.share` (`recapData.ts:69-72`). S6 and A1 are killed. |
| M3: the cashback card | Fixed | It reads `useCashbackCatalogue` (`CashbackCard.tsx:27`, now exported, so Insights and the recap share one off-switch rule: a 404 means off). It shows only when `cashbackView === 'tips'`: tips on, a match and seven days logged (`cashbackModel.ts:37-40`). It is a plain `View`, with no role, tab stop or link (R73). It shows a count and the shops that matched (D42). K1, K4 and K9 are killed. |
| M4: the real screen in the catalogue | Fixed | Four sections, each in `Screens` with `layout: 'screen'`, lazy (`recapSections.tsx:28-45`). They draw the real screen on the Bun diary recap's fakes (`recapScreens.tsx`). Private mode is the section's own, over a store in memory. The private state masks 7 amounts; English draws no Thai. M2 is killed. |
| M5: the whole month | Fixed | `readAllPages(page)` reads the records alongside the days read (`recapData.ts:51`). D2 is killed. `RecapScreen` passes its 36 cases unchanged. |
| M6: colours, type and dark contrast | Fixed | No `#RRGGBB`, `rgb(` or `hsl(` in the recap's sources. Left over is `under` in each mode. The dark `toast` (#2C2A33) stands off the dark ground (#0E0D12). The facts test holds every visible word to a `WALLET_TEXT_PAIRS` pair at 4.5:1 or more, in both modes and both languages: Anuphan for words, DM Sans 700 for amounts. Confetti uses the materials' colours. F2 is killed. |
| M7: Thai-first states | Fixed | Loading says `กำลังโหลดบันทึกของคุณ`. A load problem is `recapProblem`'s, with Try again only when a retry helps. There are empty and not-started states. Close is in every state, and the Thai loading and problem screens draw no Latin letter. |
| M8: the suite against the plan's list | Fixed | Every case the plan names exists. The facts case runs both modes and both languages through `mountWallet`. Analytics use `recordAnalytics()` with exactly-one and no-secret checks. The remaining gaps are m1 to m3 below. |
| m1 to m5, m7 | Fixed | `topCategories`' order, with ties by name (test `:214`); dateStep's `monthLabel` and `dayLabel`; the shared `daysInMonth`; the celebration decided when the facts first show (but see m1 below); `useGoBack('/spend/insights')`; empty and not-started states; headings and decorative glyphs; `biggestDay(records, month, categories)` through `builtin_key` (an entry's `category_id` is always a string, so no null can match). |
| m6: the receipt | Fixed | `P2-T32-fix.md` exists, with a pointer line in `P2-T32.md`. See n1 for what it leaves out. |

**The controller's `9add4415`, checked independently:**
- **Why it was needed.** At `b4a99b6e`, `InsightsRoutes.render.test.tsx` could not load: `SyntaxError: Unexpected token 'typeof'` (`scratch/p2-t32-fix/ctl-routes2.log`). `[month].tsx` loads the real `WalletRecapScreen`, whose new imports (the safe-area inset, and `useGoBack`'s router) do not load in Vitest without the stubs the wallet suite uses.
- **What it does.** It stubs the screen as the file stubs every other screen (`:29-34`). The stub matches the route's named import and passes `month` through.
- **It hides no product failure.** CI's Exports job bundled the real route for web and iOS at the same head, and the four routes tests pass (11 of 11 locally, and in CI).
- **What it leaves.** Its text is never asserted (m2).

## Findings

### Blockers

None.

### Major

None.

### Minor

**m1. A month changed in place spends its one celebration on the previous month's data.**
- **The code.**
  - `useLoad` (`screens/v1/parts.tsx:236-251`) keeps its last result until its effect resets it to loading (`:244`).
  - So, on the first render after `month` changes, `load` is still the old month's `ready` data. `recapView` (`recapModel.ts:298`) builds a `recap` view for the new month from it, and `due` (`WalletRecapScreen.tsx:282`) holds for any past month.
  - `useCelebration` (`:146-163`) decides in that commit. It keeps the new month's mark, plays the haptic and, at full motion, shows the confetti (`:362`), all before the new month is read.
- **Evidence.** PROBE-S1 (to April, an empty month): 24 pieces over the empty state, the haptic played, and April's mark kept. PROBE-S2 shows the same over the problem state, and PROBE-S3 shows it spent while July loads. CONTROL-S4 shows a normal switch celebrating once.
- **Against:**
  - the round's own claim: the screen's comment (`:19-20`, "Loading, a load problem or an empty month spends nothing") and the receipt's m2 line;
  - W20 ("once per recap month per phone");
  - the first review's m2.
- **Why the suite misses it.** The case "a recap whose month changes in place starts afresh" (`WalletRecap.render.test.tsx:375-392`) mounts with July already marked (`:376`). It never checks the next month's celebration either way, so O4 survives.
- **Reach: latent.**
  - The wallet recap has no month control.
  - No notification or link changes the route's month in place. Only the Bun diary recap's bars do (`RecapScreen.tsx:63`), and with the wallet area on, the route draws the wallet recap, which has none.
  - So no one can reach this in today's app. A later in-place month change would: P6B's recap image, a month chip, or a link opened from a notification.
- **Fix.**
  - Either draw the screen's body keyed by month (an inner component under `key={month}`, so `useLoad` starts at loading), or decide only once the data read is the month's.
  - Then add S1 and S4 as cases, and drop July's pre-mark at `:376`.

**m2. The route's wallet branch is untested, and `9add4415`'s stub is never asserted.**
- **The gap.**
  - `app/spend/recap/[month].tsx:18` draws `WalletRecapScreen` under the `wallet` area.
  - `InsightsRoutes.render.test.tsx`'s recap case (`:66-82`) runs only with that area off, the default (`featureFlags.ts:58-61`). So the stub at `:34` only lets the module load.
- **Evidence.** O1 survives the four routes tests and the wallet suite (36 of 36), and still typechecks.
- **Fix.** One case: `vi.stubEnv('EXPO_PUBLIC_REDESIGN', 'wallet')`, expecting `wallet recap of 2026-09 with shared resources` (PROBE-R). It passes at `9add4415` and kills O1.
- **Why add it now.** The branch is the first round's, and it matters from P2-T38, which turns the area on. The case goes in the file the controller just touched.

**m3. The suite does not hold two behaviours the code gets right.**
- **The confetti takes no taps.**
  - The code: `Confetti.tsx:42`'s `pointerEvents="none"`.
  - The gap: O2 survives. `fireEvent` dispatches straight to the element, so no case would notice a full-screen overlay that took every tap for 1.2 s, Close and Share included.
  - The fix: assert `pointer-events: none` on `recap-confetti` in the confetti case (`:358-373`).
- **A failed load sends no `recap_opened`.**
  - The code: `recap_opened` is sent after the read (`recapData.ts:54`).
  - The gap: O3 survives both suites. Nothing checks that a failed load sends none (the plan: "when it first shows a month"; R61, "once per action").
  - The fix: record analytics in the load-problem case (`:420-438`), and expect `['recap_opened']` only after Try again succeeds.

### Nits

**n1. The receipt omits the round's last commit and the routes gate.**
- **The commits.** `receipts/P2-T32-fix.md` says "then one fix commit. Not pushed." The branch also holds `9add4415`, and both were pushed.
- **The gate.** It omits the four routes tests, which the fast gate requires when a change touches a screen an `app/` route imports. That is how the routes file's load failure surfaced only after the build. The brief's Step 5 did not list them, so this is the brief's gap, not the builder's.
- **Commit messages.**
  - `b4a99b6e`'s summary starts in lower case ("rebuild ..."), against the repo's house style; the brief dictated it.
  - `dbfd5bb4` keeps git's `# Conflicts:` lines.

**n2. Every wallet recap open reads the month's first history page twice.** With `withRecords`, `readMonthDays(month, page)` and `readAllPages(page)` both start at page one (`recapData.ts:44-51`). The days read may also stop early while the full read goes on. With every record in hand, the days logged could come from the records. This is efficiency only.

**n3. The catalogue keeps August 2026's mark in the real device store of the phone it runs on.**
- **Where.** `recapScreens.tsx:14-15`, and the receipt's last note.
- **Why it matters.** The private section got a store in memory so the catalogue changes nothing of the person's (P7). The celebration mark goes to `walletDeviceStore()`, so on the owner's E2-C phone the real August 2026 recap will never celebrate.
- **Impact.** Development only, and the month is past.

## Notes for later tasks

- **P2-T38:** when the wallet area turns on, the routes suite should draw the wallet recap. Add m2's case then, if it is not added now.
- **Any later in-place month change on the wallet recap** (P6B's recap image, a month chip, a notification link): fix m1 first.
- **P2-T37:**
  - `src/wallet/recap` holds no colour literal, and its `tc()` calls use only catalog lines.
  - P2-T33's `lock/LockedScreen.tsx:27-28,35-36` and `lock/LockSetupView.tsx:77` hold `#RRGGBB` literals, which the sweep will flag.
- **Analytics and E2-C:** `shareText` is shared with the Bun diary recap, and follows the plan's "after the share sheet resolves". As a result:
  - an iOS dismissal (`dismissedAction`) counts as `recap_shared`;
  - a web cancel (`navigator.share`'s AbortError) shows the "could not open" line.
- **E2-C:** no catalogue state shows the confetti; it has gone before the screenshot. The still pieces (the first review's n4) need a look on a device.
- **Briefs:** a brief whose change touches a screen an `app/` route imports should list the four routes tests in its fast gate. This round's Step 5 did not.

VERDICT: Approved
