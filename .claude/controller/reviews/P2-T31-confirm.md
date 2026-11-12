# Confirming review: P2-T31 Insights: three tabs, the info tray, readable bars and the calendar (fix round)

- **PR:** #421 (`p2/t31-insights` into `claude/p1a-vault-core`), head `f72ad233` after `git fetch` (equals `origin/p2/t31-insights`).
- **Reviewed:** the commits after the reviewed head `afc19276`: `91d7e926` (the fix, 16 files) and `f72ad233` (the controller's merge of the head: #412, #411, #420). `git diff 91d7e926 f72ad233` touches none of the round's files. `index.ts` keeps plan order (KIT, STACK, TRAY, ADD, LIST, RECORD, INSIGHTS, RECAP, LOCK), and the PR adds only its import and spread there.
- **Reviewer:** Claude Opus 5.5, read-only. The dispatch named Sonnet 5.5, but this session runs on Opus 5.5. Probes and mutants ran only in two `git archive f72ad233` copies under `.claude/controller/scratch/p2-t31-confirm/` (`tree/` and `own/`, with `.claude` dropped and node_modules symlinked from the worktree). The logs and scripts stay there. Both copies are still there too: about 22 MB each, plain files with no `.git`, node_modules as symlinks. A removal safety check blocked my `rm -rf` because the session's working directory was inside `own/`, so the controller should delete `scratch/p2-t31-confirm/tree` and `scratch/p2-t31-confirm/own`.
- **Against:** the plan's `### Task P2-T31` (line 1485) and its Global Constraints (Money, Accessibility, E2, Analytics, Time, R72), plus W4, W9, W10, W21, W22, W24, R61, R65 and R71. Also: the boards `bw-insights`, `wc-calendar` and `es-empty-insights`; the first review (`reviews/P2-T31.md`: M1 to M8, m1 to m11, n1 to n7); ruling R112 and the fix brief's P1 to P23; the implementer's logs (`scratch/p2-t31-fix/`); and both receipts.

## CI on #421 (run 43142204061, head f72ad233, pull_request): all nine jobs passed

- **Typecheck, unit, API, build:** typecheck (contracts, api), `typecheck:app`, `typecheck:routes`, `test:api`, `test:app` 35/35, `test:unit` 1042/1042 and the API build all passed.
- **Render (every file but the per-section suites):** 120 files, 1502 tests passed.
- **Render, per-section suites:** 240, 174 and 222 passed in the three shards, which together cover all 636 cases.
- **Exports:** web (4863 modules) and iOS (5829 modules) passed.
- **Edge Worker:** 192, 785 (plus 1 todo) and 12 tests passed.
- **SQL integration and ops:** 111/111 passed.
- **Release image and smoke:** passed.

## What holds (checked in the code at f72ad233, not taken from the receipt)

- **M1: one quiet load.**
  - `insightsData.ts:88-105` keys `useLoad` on `[resources, month, today]` only.
  - Drafts are read at render time (`:107-108`). A resolved draft refreshes quietly (`:71-80`, `:109`), as `InsightsScreen` does.
  - In the app, `resources` is the `getSharedV1Resources()` singleton (`api/sharedV1.ts:69-72`).
  - A sync run re-emits the view with its phase unchanged (`spendDiary.ts:154-163`, `:173-181`), so only `drafts` changes.
  - The month guard (`:116`) keeps another month's data off the screen.
  - The spend layout is a `Slot` (`app/spend/_layout.tsx`), so each visit mounts afresh.
  - Planner mutant D1 is killed.
- **M2: one scale.** The bars and the dashed line share one `riseOf(…, ceiling)` from baseline 130, in integer maths on satang (`MonthBars.tsx:33-38`, `:52`, `:74-88`). The test pins the heights `[3, 0, 15, 36, 55, 24]` and the line at y 20. B1 and B5 are killed.
- **M3: private mode marks no day by its spending, borders included.**
  - In private mode every day is `raised` with `ink` numbers and `border: null`; only today's 2 pt ink frame remains (`CalendarTab.tsx:99-101`).
  - A day's label is its date alone, with today named (`:103`), and no amount is drawn (`:115`).
  - The legend keeps its swatches but drops values and unit, and says only that the framed day is today (`:213-230`).
  - C7 and C8 are killed.
- **M4 and m7: dates through dateStep.**
  - The two exports are additive (`dateStep.ts:203-221`) and reuse its word tables.
  - Against the boards: `monthShortLabel` gives bw-insights' `พ.ค.` to `ต.ค.`, and `shortDateLabel` gives wc-calendar's `เสาร์ 24 ต.ค.` (plus `· วันนี้`).
  - The early state reads `ศุกร์ 23 ต.ค.` and `เสาร์ 24 ต.ค.`, where es-empty-insights draws `ศ. 23 ต.ค.` and `ส. 24 ต.ค.` (P6). That is in the receipt's E2-C list. The two boards disagree with each other here.
  - P6 is killed.
- **M5: exact money.**
  - In `src/wallet/insights` and the two catalogue files, the only `Number(` is `MonthBars.tsx:36`, the drawn height after BigInt division. There is no `Math.`, `toLocaleString`, `parseFloat`, `toFixed` or `Intl.`
  - Drawn amounts use `walletMoneyText` or `WalletAmount`. Day cells use `perDayText`, rounded down on the string. Spoken labels keep the models' `formatMinor`.
  - C17 is killed.
- **M6: a compare month that fails is never ฿0.**
  - `insightsData.ts:91-97` reads everything in one `Promise.all` with no `catch`, so a failing month fails the load (`recapProblem`, with Try again).
  - A failed quiet refresh keeps the last full read (`screens/v1/parts.tsx:247`). Nothing draws or says ฿0 for an unread month.
  - D10 is killed.
- **M7: no hard-coded Thai.**
  - A script scan finds no Thai letters in the insights code outside `copy.ts` and comments.
  - The weekdays come from `weekdayInitials`, วันนี้ from `insights.today` or `tc('Today')`, and the unit from `insights.perDay`. Every `tc()` key used has its Thai in the catalogs.
  - C6 is killed.
- **M8: the review's mutants and the plan's analytics test.**
  - There are 26 cases.
  - The analytics case installs `recordAnalytics()`. It asserts exactly one `insights_viewed` per tab shown (none for a repeated press) and no amount, note or name in `JSON.stringify(sent)`.
  - R1 to R15 are all in `tools/mutants.py`, and all are killed in the implementer's `mutants.out`. In my sample, R1, S2 and H1 are killed.
- **The minors:**
  - **m1:** the banner shows only for a `V1Error` with outcome network and a ready diary (`insightsData.ts:111-113`). The title is a heading, Try again shows only when `retry` is set, and Refresh shows on `refreshSuggested`.
  - **m2:** today is counted (`SpendingTab.tsx:93`); a month gone by has no days-left line (`:110`).
  - **m3:** each day button speaks `calendarModel`'s label, with `fullDateLabel`.
  - **m4:** the pairs are one named image.
  - **m5:** the chosen day names categories with `categoryName` and names the wallet.
  - **m6:** six 'Screens' sections load `insightsScreens.tsx` with `lazy()`. The fixtures add up: ฿12,480 over 22 of 24 days, ฿312, and ฿999,999,999.99.
  - **m8:** the rows come from `topCategories(summary.categories…)` with true counts and no fallback.
  - **m9:** the kept line reads `เก็บได้ ฿21,027.50`.
  - **m10:** the budget label reads `งบ ฿18,000`.
  - **m11:** days have `minWidth: 44` and `minHeight: 50`, no fixed height, and the grid's numbers stop at `LARGEST_STANDARD_SCALE`.
- **The kit and the receipt.**
  - 15 of the 16 `real/` files pass `SHA256SUMS.real-in-wt` at f72ad233. `P2-T31-fix.md` differs only by the accepted-rulings line, as the controller said.
  - The implementer's logs match the receipt:
    - RED: Node 2 and render 26 failed, all 26 on `AssertionError`, with no lookup or module error.
    - GREEN: 19, 26, 13, 210, and 54 passed with 572 skipped.
    - Gate (before the merge): `test:app` 34, `test:unit` 1019.
    - Mutants: 127 killed.
  - `git diff --check origin/claude/p1a-vault-core...f72ad233` is clean.
- **My focused reruns at f72ad233 (R100: no whole suites):**
  - the three Node files: 19/19;
  - `WalletInsights.render.test.tsx`: 26/26;
  - the four routes tests and the eight kit files that import the wallet catalogue index: 12 files, 151/151;
  - both catalogue suites over the six insights sections: 12 passed, 624 skipped.
- **The planner's mutants, a sample of 12:** D1, D10, B1, B5, C7, C8, P6, C17, C6, R1, S2 and H1. All were killed on `AssertionError`, and every file was restored (sha256 equal). Log: `scratch/p2-t31-confirm/planner-mutants.out`.

## Findings

### Blockers

None.

### Major

None.

### Minor

**m1. The month names drift off their bars on phones wider than 375 pt, in MonthBars and in the in-and-out pairs.**

- **Why it happens:**
  - `MonthBars.tsx:68` draws the bars in a fixed `viewBox="0 0 300 140"` at `width="100%"`.
  - react-native-svg defaults to `preserveAspectRatio: 'xMidYMid meet'` (`node_modules/react-native-svg/src/elements/Svg.tsx:52`). With the height fixed at 140 pt, the drawing never scales up, so it stays 300 wide and sits in the middle.
  - Bar centres are at `30 + 48i` units (`:87`).
  - The names are six `flex: 1` columns across the whole card (`:97-108`), centred at `W(2i+1)/12`, where W is the screen width less 68 (two 18 pt gutters and two 16 pt card paddings).
- **How far off the first and last names sit** (`5W/12 - 120` pt; a bar is 32 pt wide, so 16 pt is its edge):

  | Screen width | Offset |
  | --- | --- |
  | 375 pt | 8 pt |
  | 393 pt | 15 pt |
  | 402 pt | 19 pt (outside the bar) |
  | 430 pt | 31 pt |
  | 440 pt | 35 pt |

- **The budget line:** it spans only units 8 to 292 (`:72-73`) in the middle of a wider card, while its label is right-aligned at the card's edge (`:64`).
- **The in-and-out pairs** repeat the same geometry (`InOutTab.tsx:60-84`).
- **What the board shows:** bw-insights draws the bars and the names as matching `flex: 1` rows with a 12 px gap, and the dashed line across the card (`left: 16px; right: 16px`), so they line up at every width. The plan takes every size and spacing it does not name from the board.
- **History:** the problem predates this round (`afc19276`'s MonthBars used the same viewBox, with its names `space-between`). Neither earlier review caught it, and the round's rewrite kept it. happy-dom does no layout, so no render test can see it.
- **Fix:** lay the bars and the names out on the same columns. Either use the board's `flex: 1` columns with a 12 pt gap (bars as Views, which W4 allows) or a viewBox as wide as the measured card. Add a Node test of the column maths so each name's centre is its bar's. Do this before E2-C's captures.

**m2. Fourteen more guards are unheld (protocol step 5).**

I wrote 14 mutants of my own (`scratch/p2-t31-confirm/own_mutants.py`, logs in `own-mutant-logs/`). Each was applied alone and run against `WalletInsights.render.test.tsx` at f72ad233. All 14 survived at 26/26, and every file was restored (sha256 equal).

To show they are real changes, I ran a positive control against my probe file (`own-control-logs/`; the probe is kept as `scratch/p2-t31-confirm/ReviewerProbes.render.test.tsx`):
- under O12, private mode shows `อาหาร3 รายการ฿3,784.50การเดินทาง1 รายการ฿188`;
- under O1, the month row reads `ตุลาคม 2569` above September's ฿9,000.

The survivors:

- **O12 (R65, Review Focus 2): private mode shows the spending tab's category amounts.** The mutant swaps `SpendingTab.tsx:142` for plain money text. The private case checks only the hero and the budget label on that tab, and only scans the page for digits after the calendar tab is open.
- **O11 (Accessibility: text contrast is to be "held by tests"): every day's amount is drawn in `ink`.** The mutant changes `CalendarTab.tsx:116`, so 3,240 on light step 5 (`#3B2790`) becomes dark text on a dark fill. The shade case checks the colour of the day's number but not of its amount.
- **O1: the screen's month row always names this month (`WalletInsightsScreen.tsx:136`).** The step-back case checks only the hero after stepping to September.
- **O9, O14 and O10: `accessible` removed from the bars (`MonthBars.tsx:57`), the pairs (`InOutTab.tsx:54`) and the legend (`CalendarTab.tsx:211`).** react-native-web draws the role and the label without it, so the plan's "one accessible element" holds only on the web. On iOS, VoiceOver reads a View's label only when the View is accessible. R72's answer is a Node test that reads the source.
- **O2, O3 and O8:**
  - the weekday initials (`CalendarTab.tsx:181`) grow past `LARGEST_STANDARD_SCALE`;
  - so does the legend's unit (`:218`);
  - the initials reach screen readers (`:179`).

  The AX5 case checks only `GridText`.
- **O5: the page ignores the safe area,** using a fixed 56 pt top (`WalletInsightsScreen.tsx:114`). This is the first round's bug, which P18 names.
- **O7: the `insights.monthly` badge is not drawn (`:138`).** The badge is one of the plan's data bindings.
- **O13: the hero is drawn at 28 instead of the plan's 36 (`SpendingTab.tsx:105`).**
- **O4: a later month counts as an earlier one for `insights.noPrevious` (`SpendingTab.tsx:97`).** This shows only on a month gone by.
- **O6: Refresh reloads loudly from loading and resets the chosen day (`insightsData.ts:117`).**

The code is right in every case today, so this is a test gap, not a defect. The review's fifteen mutants, the plan's three and the round's majors are all held. The ones worth cases now are O12, O11, O1 and the three `accessible` flags (one Node test that reads the source). The rest can wait for P2-T37's sweep.

### Nit

- **n1. The English drafts do not agree in number.** `insights.entries` is `{count} entries` and `insights.earlyTitle` is `Log {n} more days and the chart shows here` (`copy.ts:35`, `:29`). English therefore reads "Travel1 entries", "Sat 24 Oct · Today1 entries" and "Log 1 more days" (probe). The suite pins "1 entries" (`WalletInsights.render.test.tsx:245`, `:700`, `:709`). The catalogs keep separate singular lines (`tc('1 day')`). This is for E2-C's English drafts.
- **n2. A day with less than ฿1 out draws "0" under its number.** The check `BigInt(outMinor) > 0n` passes (`CalendarTab.tsx:115`) and `dayBaht` rounds down (`:60`). Probe: ฿0.40 on the 3rd draws "3" over "0" on step 1's fill, and its label says ฿0.40.
- **n3. A day with only money in is logged, but its chosen-day section says "0 รายการ ฿0"** (`CalendarTab.tsx:156`, `:242`; probe). Its label says "จ่ายออก ฿0.00" (from `calendarModel`). The list holds money out only, by design, but "0 รายการ" reads as "no entries".
- **n4. A month gone by keeps the early state.** With fewer than three logged days, September (reached through the calendar's month step) shows "จดอีก 1 วัน กราฟจะขึ้นตรงนี้" and "วันถัดไป" on the spending tab (`SpendingTab.tsx:95`, `:115-116`; probe). P11 drops the days-left line for such a month, but not this.
- **n5. On a 360 dp Android phone the calendar is 8 dp wider than the page.** Seven columns of at least 44 pt plus six 4 pt gaps need 332, but 360 less two 18 pt gutters leaves 324 (`CalendarTab.tsx:55-56`, `:181`, `:191`). The weekday row overflows by the same amount, so the columns stay aligned; the grid runs into the right gutter.

## Notes for later tasks

- **E2-C (owner):**
  - The early state reads `ศุกร์ 23 ต.ค.` where es-empty-insights draws `ศ. 23 ต.ค.`, while wc-calendar draws `เสาร์ 24 ต.ค.`. The boards disagree, so the owner picks one.
  - A private day's `raised` fill equals `ground` in light mode.
  - Today's frame is a 2 pt inner border. wc-calendar draws an outer ring with a 2 px ground gap (`box-shadow: 0 0 0 2px #F4F3F9, 0 0 0 4px #111014`).
  - A draft saved offline shows only in its day's spoken label and the logged count, not on the day or in the chosen day's list. Probe: day 23 with a ฿65 draft draws "23" on the empty fill and lists "0 รายการ ฿0". This matches how the Bun diary's calendar keeps drafts apart.
  - The categories are `topCategories`' top five (`TOP_CATEGORY_COUNT = 5`), so a sixth spending category is not listed.
  - The English plurals (n1).
- **P2-T37:**
  - the bar columns from 393 to 440 pt on a device (m1);
  - the calendar at AX5 on 375 pt, and at 360 dp (n5);
  - the private-mode sweep over the spending tab's category rows (O12);
  - VoiceOver over the bars, the pairs, the legend and the days.
- **Refresh for changes from another phone:** like today's InsightsScreen, the wallet insights screen does not call 1D-T5's `useRefreshOnRevision`, so a change pulled from another phone shows on the next visit or when a draft resolves. Home and History refresh in place. The plan does not ask for this in P2-T31, but it is worth a look if P2-T18's shell keeps the tab mounted between visits.
- **R71:** the category link carries only `category`, so from a month gone by History opens on this month. The first review's note stands.

VERDICT: Approved
