# Brief P2-T31 fix round: insights on one quiet load, one scale, private calendar days alike, exact money, the boards' dates and words, and the real screen in the catalogue

You are the fixer for the P2-T31 fix round. PR #421 (branch `p2/t31-insights`, commit `afc19276`) adds the Bun Wallet insights: three tabs, the info tray, the six bars and the calendar. Its first review (Opus, `reviews/P2-T31.md`) says **Needs fixes**: eight majors (M1 to M8), eleven minors (m1 to m11) and seven nits (n1 to n7). The second review (Flash, `reviews/P2-T31-second.md`) approved and adds nothing. The controller ruled **R112**: fix every major and minor as the review proposes, unless the plan says otherwise.

The planner wrote every file below and proved it in a scratch copy of `afc19276`:
- RED on three typed stubs, each failing case on an `AssertionError`;
- GREEN;
- 127 mutants, all killed, the review's fifteen among them;
- R100's fast local gate, widened by the controller's 12 November rule (the eight kit files and `test:unit`).

You copy the planner's files, check them by checksum, prove RED, GREEN and the mutants in your own worktree, run the gate, and commit. The round's receipt is in the kit, written from the planner's logs; you copy it. Do exactly what this brief says.

Read first:
1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. R100 applies: the fast local gate only, and no whole-suite total as an expected value anywhere. R87 applies: the round's receipt is its own new file, `docs/implementation/receipts/P2-T31-fix.md`, and `P2-T31.md` gains one line pointing to it; do not edit `premium-progress.md`.
2. The review: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/P2-T31.md`.

## Paths and rules

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t31` (branch `p2/t31-insights`, head `afc19276`). Work only here.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t31-fix`, your scratch folder. Create it with `mkdir -p`. Logs and the commit message go there. Never keep anything under `/private/tmp`.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t31-fix-planner`, the planner's folder. Read it and `cp` from it; never write into it. It holds:
  - `real/`: the round's sixteen files at their repo paths (`files.txt` lists them): fourteen code and test files and two receipts (`P2-T31.md`'s one line, and `P2-T31-fix.md`, which is new);
  - `stubs/`: the RED forms (typed stubs) of `WalletInsightsScreen.tsx`, `insightsSections.tsx` and `src/ui/dateStep.ts`;
  - `orig/`: `afc19276`'s copy of every file the round changes or reads (eighteen);
  - `diffs/`: one diff per changed file, with paths `a/<repo path>` and `b/<repo path>`, and `p2-t31-fix.patch`, the whole round;
  - `tools/`: `mutants.py` (the runner), `prove.sh` (the planner's stages, which ran in a scratch `git archive` of `afc19276`, removed afterwards), `sums.py`, `diffs.py`, and `brief.py` with the templates it renders this brief and the receipt from;
  - `logs/`: the planner's own runs, to compare with yours;
  - `SHA256SUMS` (the kit) and `SHA256SUMS.logs` (the planner's `*.log` files);
  - three lists to check WT with `shasum -a 256 -c`, paths relative to WT:
    - `SHA256SUMS.orig-in-wt`: the eighteen base files;
    - `SHA256SUMS.red-in-wt`: the two tests from `real/` and the three stubs;
    - `SHA256SUMS.real-in-wt`: all sixteen `real/` files.
- Every shell call starts in a fresh directory, so type full paths. Below, WT, S and PL stand for the full paths above. Git: `/usr/bin/git -C WT <command>`, one git command per call. Focused Node files: `cd WT/apps/app && npm run test:unit -- <files>`. Focused render files: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts <files>`.
- No heavy lock is needed: no database suite and no workers pool. Docker is stopped and stays stopped.
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests or code to make them pass. One exception, a load flake: a case that times out under load in a file this round does not touch. Rerun that file alone once, and record both runs.
- Every log is your own run. Never copy the planner's logs in place of one.

## Scope

| File | Change |
| --- | --- |
| `apps/app/src/ui/dateStep.ts` | Shared, additive: `monthShortLabel(month, locale)` and `shortDateLabel(date, today, locale)` (P6). (221 lines; 201 before) |
| `apps/app/src/ui/dateStep.test.ts` | Shared, additive: the two new exports' cases. (133 lines; 112 before) |
| `apps/app/src/wallet/insights/calendarShade.ts` | Reads `CALENDAR_STEP_LIMITS_BAHT`, by relative path (P19). (15 lines; 20 before) |
| `apps/app/src/wallet/insights/copy.ts` | The draft table: new lines, draft marks, `insights.sample` dropped (P8). (49 lines; 33 before) |
| `apps/app/src/wallet/insights/insightsData.ts` | Rewritten: one quiet load, drafts at render time, compare months that fail the load (P2, P3). (120 lines; 118 before) |
| `apps/app/src/wallet/insights/WalletInsightsScreen.tsx` | Rewritten: the tabs, the analytics, the load's states (P9, P10, P18). (146 lines; 159 before) |
| `apps/app/src/wallet/insights/SpendingTab.tsx` | Rewritten: the days left, the early state, the categories (P11, P16). (151 lines; 287 before) |
| `apps/app/src/wallet/insights/MonthBars.tsx` | Rewritten: one scale, the budget label, the short months (P4, P7). (112 lines; 149 before) |
| `apps/app/src/wallet/insights/InOutTab.tsx` | Rewritten: money in and out, the kept line, the named pairs (P13). (116 lines; 198 before) |
| `apps/app/src/wallet/insights/CalendarTab.tsx` | Rewritten: private days alike, exact money, labels, the chosen day, 44 pt days (P5, P12, P14, P17). (252 lines; 380 before) |
| `apps/app/src/wallet/insights/InfoTray.tsx` | The explanation in a `WalletText` role. (17 lines; 26 before) |
| `apps/app/src/wallet/insights/WalletInsights.render.test.tsx` | Rewritten: 26 cases (11 before). (765 lines; 365 before) |
| `apps/app/src/dev/catalogue/wallet/insightsSections.tsx` | Rewritten: six section descriptors that load `insightsScreens.tsx` lazily (P15). (47 lines; 201 before) |
| `apps/app/src/dev/catalogue/wallet/insightsScreens.tsx` | **New**: the real screen on fakes, one state per section (P15). (168 lines) |
| `docs/implementation/receipts/P2-T31.md` | One line under "Notes for later tasks", pointing to the fix receipt. (122 lines; 121 before) |
| `docs/implementation/receipts/P2-T31-fix.md` | **New**: the round's receipt (R87). (55 lines) |

Shared, additive: `apps/app/src/ui/dateStep.ts` (two new exports, nothing else changed) and `apps/app/src/ui/dateStep.test.ts` (one import, two cases). No other round or in-flight PR edits either (P1).
Unchanged, and read: `apps/app/app/spend/insights.tsx` (the route), `InsightsRoutes.render.test.tsx` (it stubs `WalletInsightsScreen` already), `calendarShade.test.ts` (the plan's case) and `apps/app/src/dev/catalogue/wallet/index.ts`.

## Planner rulings (what this round decides, with the reason for each)

- **P1. No sync merge in this round: the fix commit goes on top of `afc19276`.**
  The controller said so: `index.ts` is unchanged in this round, and the controller merges the head again once the round lands, by plan order (INSIGHTS after CATEGORY, before RECAP). Since `afc19276`, #411 (P2-T32) and #412 (P2-T25) merged. None of this round's sixteen files, and none of the modules it builds on (`src/ui/dateStep.ts`, the catalogue's `insights/recapSections.tsx`, `screenFixtures.ts`, `screenSection.tsx`, the fakes and the harness), changed on the integration head since `afc19276`; `trackInsightsViewed` is unchanged too (#418 added other emitters beside it). No in-flight PR edits any of them: #420 (P3-T2) edits `events.ts` but not `trackInsightsViewed`, and #423 (P2-T29) edits its own `categorySections.tsx` and the catalogue's `index.ts`, which this round leaves alone. #411's recap test pins only its own four sections' order, so INSIGHTS before RECAP keeps it green.
- **P2. One quiet load (M1).**
  The load is keyed by `[resources, month, today]` only, as `InsightsScreen` keys its own. The phone's drafts are read at render time from the diary's view (so a draft saved meanwhile shows at once, and `dayFacts` keeps its money apart), and a draft that resolves (sent, discarded, undone or acknowledged) refreshes the load quietly, in place (`InsightsScreen`'s `useRefreshOnResolve`). A sync run's new outbox with the same drafts reads nothing. Data read for another month is never handed over as this month's: a month step renders once before its load starts, and the tabs draw the calendar of the month shown from the data read for it. A day's change keeps the month's records, so only the month is checked (the `today` half of `InsightsScreen`'s check would be an equivalent mutant here).
- **P3. Compare months (M6, n6), and the wallets (m5).**
  The six compare months are `compareWindow`'s. The month shown shares its own summary with its bar, as `RecapScreen` does, so this month is read once; any compare month that cannot be read fails the whole load, as the recap's does, and the screen says why with Try again. No bar is ever drawn or said as ฿0 for a month that was not read. The load also reads `wallets()`, once, so the chosen day can name each record's wallet (wc-calendar's "อาหาร · เงินสด"). Every history page of the month is read (`readAllPages`).
- **P4. One scale from one baseline (M2).**
  The taller of the largest month and the budget reaches the top of the chart; every bar and the dashed line stand on the same baseline by their true share, in exact integer maths on satang (only the drawn height, a whole number of units, is a JS number). A month with money out draws at least 3 units; a month with none draws nothing. A budget's limit is always above zero (the contract's `POSITIVE` rule), so a month with a budget has its line, and a month with none has no line and no label.
- **P5. Private mode (M3, R65, W10, D41).**
  Every day is one neutral fill (`raised`, `ink` numbers) with no amount and no border but today's 2 pt ink frame, and says its date alone (today named). The month line, the hero, the budget label, the kept line and every `WalletAmount` mask their amount with `HIDDEN_AMOUNT` and keep their words. The legend keeps its swatches, with no values and no unit, and says only that the framed day is today. The charts say their names and months, with no amount. (The review's plan-level note stands for E2-C: in light mode `raised` equals `ground`, so a private day's fill does not show against the page; the plan names `raised`.)
- **P6. Dates through dateStep, as the boards draw them (M4, m7): two additive exports in `src/ui/dateStep.ts`.**
  The plan's Time constraint puts every date on screen through `src/ui/dateStep.ts`, with the example `เสาร์ 24 ต.ค. 2569`. dateStep had no short month name (bw-insights' bars: พ.ค. to ต.ค.) and no short date that stays a date on today (wc-calendar's chosen day: "เสาร์ 24 ต.ค. · วันนี้"; `dayLabel` says วันนี้ alone). So it gains `monthShortLabel(month, locale)` and `shortDateLabel(date, today, locale)`, built from its own word tables, each with a Node case; nothing else in it changes. The early state's logged days use `shortDateLabel` ("ศุกร์ 23 ต.ค."): es-empty-insights draws "ศ. 23 ต.ค.", which is no dateStep form, and the plan's own example is the short form. For E2-C.
- **P7. Exact money in the wallet's money text (M5, W9, m10).**
  Every drawn amount is `walletMoneyText` or `WalletAmount` (compact, keeping satang that are not zero): the hero, the month line, the budget label (`งบ ฿18,000`), the categories, the chosen day and its records, and the in-and-out amounts. A calendar day shows its money out in whole baht without ฿ (`perDayText`'s rule, rounded down by BigInt: ฿3,240.50 reads 3,240). The spoken labels keep the models' exact form (`compareBars().spoken`, `calendarModel`'s labels, `formatMinor`). No `Number()`, `Math.round` or `toLocaleString` touches money.
- **P8. Every word in the catalogs or the draft table (M7, n3).**
  Weekdays come from `weekdayInitials`, วันนี้ from `insights.today`, the legend's unit from `insights.perDay`, and a record with no merchant or note is named by its category, never `รายการ`. New draft lines: `insights.soFar` (es-empty-insights' ที่จดไว้แล้ว), `insights.kept`, `insights.inOutName`, `insights.inOutMonth`, `insights.perDay` and `insights.legendToday`; `insights.legend` loses its frame clause, which is `insights.legendToday` now (n4: "กรอบดำ", black frame, is false in dark mode, where the frame is light ink). `insights.sample` is dropped: the plan's early state has no sample chart. The plan's Thai lines marked draft, and the lines no board shows, are marked `// draft` in `copy.ts`.
- **P9. Guards held, and the plan's analytics test (M8, R61).**
  `WalletInsights.render.test.tsx` has 26 cases (11 before), in both modes and both languages. The analytics case installs `recordAnalytics()`, asserts exactly one `insights_viewed` per tab shown (spending, then in_out, then calendar, and none for a repeated press), and that `JSON.stringify(sent)` holds no amount, note or name from the fixture. The review's fifteen survivors are R1 to R15 in `tools/mutants.py`, each killed; the plan's three are H1, C8 and S2.
- **P10. Load problems (m1).**
  A problem shows its title as a heading, its words (`recapProblem`), the kit's `PrimaryButton` Try again only when a retry can help, and the offline banner only when the error is a `V1Error` with outcome `network` and a diary is open and ready (`InsightsScreen`'s rule). When a later history page says the diary changed (`refreshSuggested`), the screen says so with Refresh.
- **P11. The days left (m2).**
  Today is counted, as W9 counts the days left: on Saturday 24 October the line reads `ใช้ไปแล้ว · อีก 8 วันจบเดือน`, as bw-insights does. A month gone by (reached by the calendar's month step) has no days left to count, so it has no line, rather than "อีก 0 วันจบเดือน".
- **P12. The day buttons speak (m3).**
  Outside private mode a day's label is `calendarModel`'s, with `fullDateLabel`: "วันพฤหัสบดีที่ 1 ตุลาคม 2569, จ่ายออก ฿3,240.50", today first named, a day with nothing "ไม่มีรายการ", and drafts said apart.
- **P13. In and out (W21, m4, m9).**
  Money in is `WalletAmount` with `sign="income"` (violet, with its plus), money out is ink. The kept line says `เก็บได้ {amount}`; more out than in and in and out matched use the catalog's own lines. The six pairs are on one scale, money in violet and money out ink (W21), and the chart is one image named `insights.inOutName` that reads each month's money in and out.
- **P14. The chosen day (m5).**
  Its heading is `shortDateLabel`, with `· วันนี้` on today; its count and money out; each record named by its merchant, its note, or its category, with "category · wallet" below (`categoryName`, so a built-in with `label: null` is named). A category or a wallet no longer listed is named `tc('Category')`, or left off. Records keep history's order.
- **P15. The catalogue draws the real screen (m6).**
  Six sections in the 'Screens' group with `layout: 'screen'`: `bw-insights`, `bw-insights-in-out`, `bw-calendar`, `bw-insights-early`, `bw-insights-private` (the private calendar, R65's main surface) and `bw-insights-large` (฿999,999,999.99 out, most of it under an 80-code-point Thai category name, for the AX5 captures). The month is wc-calendar's (฿12,480 out on 22 of the 24 days so far, bw-insights' four categories, ฿35,000 in, a ฿18,000 budget). As the 12 November rule asks, `insightsSections.tsx` loads its screens with `lazy()` from `insightsScreens.tsx` (created), so the wallet catalogue index never loads expo-router or expo-crypto; the gate runs the eight kit files that import that index.
- **P16. The categories' numbers (m8).**
  The rows are the month's summary totals through `topCategories`, with no fallback and no recount. Each count is the month's live expenses in that category, from every page; nothing defaults to 1. The tests give the fake summary its category totals (`withCategoryTotals`), so the production path is the one rendered.
- **P17. The largest text sizes, and 44 pt days on a 375 pt phone (m11).**
  A day is at least 44 pt wide with 4 pt gaps (375 less two 18 pt gutters and six gaps leaves 45 pt) and at least 50 pt tall, never a fixed height. The grid's numbers (DM Sans, wc-calendar; n5) stop at iOS's largest standard size, `LARGEST_STANDARD_SCALE`, the kit's rule for words that must hold their place in a fixed bar (`src/ui/largeTextScale.ts`); a day grows taller instead of cutting them. Every fact in the grid is in each button's label and, at every text size, in the chosen day's list, which keeps the wallet's roles to AX5. Nothing is clamped. P2-T37 checks the calendar at AX5 on a device.
- **P18. The wallet kit's parts and tokens (n1, n2).**
  `IconButton` for the `i`, previous and next (n2); `HIDDEN_AMOUNT` everywhere (n1); `WalletText` roles throughout. The monthly badge sits on `card` (violet on card is a held pair; `raised` is the page's own colour in light mode). The screen's month row shows on the spending and in-and-out tabs; the calendar names its month itself, with its steps, so the month is never said twice. The page keeps clear of the safe area (`insets.top + 12`, `insets.bottom + 24`), as the wallets list and the recap do: the first round's fixed 56 pt top sits under a 59 pt status-bar inset.
- **P19. `calendarShade` reads the plan's limits.**
  It consumes `CALENDAR_STEP_LIMITS_BAHT` (the plan's Interfaces) and imports by relative path (the pure-module rule; it imported `@mobile/…` before). Its Node test, the plan's case, is unchanged and passes before and after.
- **P20. Equivalent mutant, not run.**
  S13 (the calendar drawn for the data's month rather than the month shown) is equivalent: the tabs render only when the load's data is for the month shown, which D9 holds, so the two months are equal. The planner's run that found it is `PL/logs/draft-mutants.out`.
- **P21. The fast local gate (R100, and the 12 November rule).**
  `typecheck:app`; the three focused Node files; the insights render file; the four routes tests; the eight kit files that import the wallet catalogue index; the Bun diary insights and recap neighbours; both catalogue suites over the `bw-` sections; `test:app`; `test:unit`; `git diff --check`. No route, config or app entry changes, so no `typecheck:routes` and no `export:web` (CI runs it).
- **P22. followups.md.** No entry names P2-T31 (`grep -n "P2-T31" .claude/controller/followups.md` prints nothing).
- **P23. Commit summary.** `Rebuild Bun Wallet insights on one quiet load, one scale and exact money` (72 characters), a plain imperative line as the protocol asks.

## Step 1: Check the base

1. `/usr/bin/git -C WT status --short` prints nothing, and `/usr/bin/git -C WT rev-parse --short HEAD` prints `afc19276`. Otherwise report BLOCKED. Do not fetch or merge (P1).
2. `cd WT && shasum -a 256 -c PL/SHA256SUMS.orig-in-wt` (type full paths). Expected: 18 `OK` lines, exit 0.
   And `ls WT/apps/app/src/dev/catalogue/wallet/insightsScreens.tsx` says "No such file or directory", and so does `ls WT/docs/implementation/receipts/P2-T31-fix.md`.
3. Only if `WT/node_modules` is missing: `cd WT && npm ci --ignore-scripts --no-audit --no-fund > S/npm-ci.log 2>&1; echo $?`. Expected: 0.
4. The base checks:
   - `cd WT && npm run typecheck:app > S/base-typecheck.log 2>&1; echo $?`. Expected: 0.
   - `cd WT/apps/app && npm run test:unit -- src/ui/dateStep.test.ts src/wallet/insights/calendarShade.test.ts src/wallet/copy/draftText.test.ts > S/base-unit.log 2>&1; echo $?`. Expected: 0, `ℹ tests 17`, `ℹ pass 17`, `ℹ fail 0`.
   - `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/insights/WalletInsights.render.test.tsx src/screens/redesign/SpendRoutes.render.test.tsx src/screens/redesign/account/AccountRoutes.render.test.tsx src/screens/redesign/insights/InsightsRoutes.render.test.tsx src/screens/redesign/planning/PlanningRoutes.render.test.tsx src/wallet/card/CardStack.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/wallet/lock/Lock.render.test.tsx src/wallet/add/AmountStep.render.test.tsx src/wallet/wallets/WalletsList.render.test.tsx src/screens/redesign/insights/InsightsScreen.render.test.tsx src/screens/redesign/insights/RecapScreen.render.test.tsx > S/base-render.log 2>&1; echo $?`. Expected: 0, `Test Files  15 passed (15)`, `Tests  234 passed (234)`.
   - `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "bw-" > S/base-catalogue.log 2>&1; echo $?`. Expected: 1, `Test Files  1 failed | 1 passed (2)`, `Tests  1 failed | 53 passed | 572 skipped (626)`. The one failing case is `screenReader.render.test.tsx > section bw-insights-in-out: every control has a name, nothing hidden takes focus`, on an `AssertionError` listing one `img` with no name: the first round's in-and-out chart, the review's m4. This round fixes it (Step 3, item 7).

   Compare with `PL/logs/base-*.log`.

## Step 2: The tests first, and RED on the typed stubs

1. Copy the two tests and the three stubs:
   ```bash
   cp PL/real/apps/app/src/ui/dateStep.test.ts WT/apps/app/src/ui/dateStep.test.ts
   cp PL/real/apps/app/src/wallet/insights/WalletInsights.render.test.tsx WT/apps/app/src/wallet/insights/WalletInsights.render.test.tsx
   cp PL/stubs/apps/app/src/ui/dateStep.ts WT/apps/app/src/ui/dateStep.ts
   cp PL/stubs/apps/app/src/wallet/insights/WalletInsightsScreen.tsx WT/apps/app/src/wallet/insights/WalletInsightsScreen.tsx
   cp PL/stubs/apps/app/src/dev/catalogue/wallet/insightsSections.tsx WT/apps/app/src/dev/catalogue/wallet/insightsSections.tsx
   ```
   Then `cd WT && shasum -a 256 -c PL/SHA256SUMS.red-in-wt`. Expected: five `OK` lines, exit 0.
2. `cd WT && npm run typecheck:app > S/red-typecheck.log 2>&1; echo $?`. Expected: 0.
3. `cd WT/apps/app && npm run test:unit -- src/ui/dateStep.test.ts src/wallet/insights/calendarShade.test.ts src/wallet/copy/draftText.test.ts > S/red-unit.log 2>&1; echo $?`. Expected:
   - exit 1, `ℹ tests 19`, `ℹ pass 17`, `ℹ fail 2`;
   - `grep -c 'AssertionError \[ERR_ASSERTION\]' S/red-unit.log` gives 2;
   - the 2 failing tests, both new dateStep cases:
     - `a month's short name has no year, in each language`
     - `a short date is written out for today and yesterday too, with the year only when it is not this year`
4. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/insights/WalletInsights.render.test.tsx > S/red-render.log 2>&1; echo $?`. Expected:
   - exit 1, `Test Files  1 failed (1)`, `Tests  26 failed (26)`;
   - `grep -c '^AssertionError' S/red-render.log` gives 26;
   - `grep -cE 'TestingLibraryElementError|Cannot find module|Failed to resolve|SyntaxError|is not a function|TypeError' S/red-render.log` gives 0.

   The 26 render cases, each failing on an assertion:
   - `the spending tab draws six bars, this month in barNow and the others in barPast, with the budget line`: `AssertionError: insights-month-bars: expected null not to be null`
   - `the budget line sits on the bars' own scale, from one baseline`: `AssertionError: month-bar-2026-05: expected null not to be null`
   - `the chart is one named element that reads each month's amount`: `AssertionError: th: expected [] to have a length of 1 but got +0`
   - `the info button explains the number in a tray`: `AssertionError: button ตัวเลขนี้คืออะไร: expected null not to be null`
   - `the categories are the month's totals in topCategories' order, each with its own count, opening History filtered to it`: `AssertionError: insights-categories: expected null not to be null`
   - `a category no longer listed, a deleted record and money in are counted nowhere they do not belong`: `AssertionError: insights-categories: expected null not to be null`
   - `each tab is a 44 pt tab and sends insights_viewed with spending, in_out or calendar`: `AssertionError: expected [] to deeply equal [ 'ใช้จ่าย', 'เงินเข้า-ออก', 'ปฏิทิน' ]`
   - `the in-and-out tab shows money in in violet with a plus`: `AssertionError: tab เงินเข้า-ออก: expected null not to be null`
   - `more out than in, and in and out matched, are said in words`: `AssertionError: tab เงินเข้า-ออก: expected null not to be null`
   - `the calendar shades each day by its baht step, frames today and leaves future days inert`: `AssertionError: tab ปฏิทิน: expected null not to be null`
   - `each day button says its date and its money out, today named and drafts said apart`: `AssertionError: tab ปฏิทิน: expected null not to be null`
   - `the calendar's month line, legend and chosen day are wc-calendar's, every amount exact`: `AssertionError: tab ปฏิทิน: expected null not to be null`
   - `a record with no merchant or note is named by its category, and one whose wallet is no longer listed by its category alone`: `AssertionError: tab ปฏิทิน: expected null not to be null`
   - `the calendar steps back a month and never draws October under September; next stops at this month`: `AssertionError: tab ปฏิทิน: expected null not to be null`
   - `every page of the month is read`: `AssertionError: expected [] to deeply equal [ undefined, 'c2', 'c4' ]`
   - `with two logged days the early state asks for one more day`: `AssertionError: insights-early-state: expected null not to be null`
   - `a diary sync never blanks the screen or resets it, and reads nothing again`: `AssertionError: button ตัวเลขนี้คืออะไร: expected null not to be null`
   - `a draft saved meanwhile shows at once, and one that resolves refreshes in place`: `AssertionError: tab ปฏิทิน: expected null not to be null`
   - `a compare month that cannot be read is never drawn as ฿0: the problem says so with Try again`: `AssertionError: insights-problem: expected null not to be null`
   - `offline is said with the banner where a diary is open; a problem a retry cannot fix offers no Try again`: `AssertionError: insights-problem: expected null not to be null`
   - `entries changed meanwhile are said, with Refresh`: `AssertionError: insights-changed: expected null not to be null`
   - `in private mode the chart's name carries no amount and the calendar is one neutral fill with no legend values`: `AssertionError: insights-month-bars: expected null not to be null`
   - `in private mode the in-and-out tab masks every amount and keeps its words`: `AssertionError: tab เงินเข้า-ออก: expected null not to be null`
   - `in English the insights carry no Thai: weekdays, today, the per-day unit and entries are its own words`: `AssertionError: heading Insights: expected null not to be null`
   - `at AX5 the calendar's days stay 44 pt wide and grow taller, and nothing is cut`: `AssertionError: tab ปฏิทิน: expected null not to be null`
   - `the catalogue's insights sections draw the real screen on fakes, one state each`: `AssertionError: expected [] to deeply equal [ …(6) ]`

   Compare with `PL/logs/red-unit.log` and `PL/logs/red-render.log`.

## Step 3: GREEN

1. Copy every file of the round:
   ```bash
   cp PL/real/apps/app/src/ui/dateStep.ts WT/apps/app/src/ui/dateStep.ts
   cp PL/real/apps/app/src/ui/dateStep.test.ts WT/apps/app/src/ui/dateStep.test.ts
   cp PL/real/apps/app/src/wallet/insights/calendarShade.ts WT/apps/app/src/wallet/insights/calendarShade.ts
   cp PL/real/apps/app/src/wallet/insights/copy.ts WT/apps/app/src/wallet/insights/copy.ts
   cp PL/real/apps/app/src/wallet/insights/insightsData.ts WT/apps/app/src/wallet/insights/insightsData.ts
   cp PL/real/apps/app/src/wallet/insights/WalletInsightsScreen.tsx WT/apps/app/src/wallet/insights/WalletInsightsScreen.tsx
   cp PL/real/apps/app/src/wallet/insights/SpendingTab.tsx WT/apps/app/src/wallet/insights/SpendingTab.tsx
   cp PL/real/apps/app/src/wallet/insights/MonthBars.tsx WT/apps/app/src/wallet/insights/MonthBars.tsx
   cp PL/real/apps/app/src/wallet/insights/InOutTab.tsx WT/apps/app/src/wallet/insights/InOutTab.tsx
   cp PL/real/apps/app/src/wallet/insights/CalendarTab.tsx WT/apps/app/src/wallet/insights/CalendarTab.tsx
   cp PL/real/apps/app/src/wallet/insights/InfoTray.tsx WT/apps/app/src/wallet/insights/InfoTray.tsx
   cp PL/real/apps/app/src/wallet/insights/WalletInsights.render.test.tsx WT/apps/app/src/wallet/insights/WalletInsights.render.test.tsx
   cp PL/real/apps/app/src/dev/catalogue/wallet/insightsSections.tsx WT/apps/app/src/dev/catalogue/wallet/insightsSections.tsx
   cp PL/real/apps/app/src/dev/catalogue/wallet/insightsScreens.tsx WT/apps/app/src/dev/catalogue/wallet/insightsScreens.tsx
   cp PL/real/docs/implementation/receipts/P2-T31.md WT/docs/implementation/receipts/P2-T31.md
   cp PL/real/docs/implementation/receipts/P2-T31-fix.md WT/docs/implementation/receipts/P2-T31-fix.md
   ```
   Then `cd WT && shasum -a 256 -c PL/SHA256SUMS.real-in-wt`. Expected: sixteen `OK` lines, exit 0.
   Then `/usr/bin/git -C WT status --short`. Expected: exactly these lines, in this order:
   ```
    M apps/app/src/dev/catalogue/wallet/insightsSections.tsx
    M apps/app/src/ui/dateStep.test.ts
    M apps/app/src/ui/dateStep.ts
    M apps/app/src/wallet/insights/CalendarTab.tsx
    M apps/app/src/wallet/insights/InOutTab.tsx
    M apps/app/src/wallet/insights/InfoTray.tsx
    M apps/app/src/wallet/insights/MonthBars.tsx
    M apps/app/src/wallet/insights/SpendingTab.tsx
    M apps/app/src/wallet/insights/WalletInsights.render.test.tsx
    M apps/app/src/wallet/insights/WalletInsightsScreen.tsx
    M apps/app/src/wallet/insights/calendarShade.ts
    M apps/app/src/wallet/insights/copy.ts
    M apps/app/src/wallet/insights/insightsData.ts
    M docs/implementation/receipts/P2-T31.md
   ?? apps/app/src/dev/catalogue/wallet/insightsScreens.tsx
   ?? docs/implementation/receipts/P2-T31-fix.md
   ```
2. `cd WT && npm run typecheck:app > S/green-typecheck.log 2>&1; echo $?`. Expected: 0.
3. `cd WT/apps/app && npm run test:unit -- src/ui/dateStep.test.ts src/wallet/insights/calendarShade.test.ts src/wallet/copy/draftText.test.ts > S/green-unit.log 2>&1; echo $?`. Expected: 0, `ℹ tests 19`, `ℹ pass 19`, `ℹ fail 0`.
4. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/insights/WalletInsights.render.test.tsx > S/green-render.log 2>&1; echo $?`. Expected: 0, `Test Files  1 passed (1)`, `Tests  26 passed (26)`.
5. The four routes tests:
   `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/screens/redesign/SpendRoutes.render.test.tsx src/screens/redesign/account/AccountRoutes.render.test.tsx src/screens/redesign/insights/InsightsRoutes.render.test.tsx src/screens/redesign/planning/PlanningRoutes.render.test.tsx > S/green-routes.log 2>&1; echo $?`. Expected: 0, `Test Files  4 passed (4)`, `Tests  13 passed (13)`.
6. The eight kit files that import the wallet catalogue index, and the Bun diary insights and recap:
   `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/card/CardStack.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/wallet/lock/Lock.render.test.tsx src/wallet/add/AmountStep.render.test.tsx src/wallet/wallets/WalletsList.render.test.tsx src/screens/redesign/insights/InsightsScreen.render.test.tsx src/screens/redesign/insights/RecapScreen.render.test.tsx > S/green-neighbours.log 2>&1; echo $?`. Expected: 0, `Test Files  10 passed (10)`, `Tests  210 passed (210)`.
7. The catalogue's wallet sections, in both suites:
   `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "bw-" > S/green-catalogue.log 2>&1; echo $?`. Expected: 0, `Test Files  2 passed (2)`, `Tests  54 passed | 572 skipped (626)`.

   Compare with `PL/logs/green-*.log`.

## Step 4: Mutation check

Run the 127 mutants:
```bash
python3 -I PL/tools/mutants.py WT S/mutant-logs > S/mutants.out; echo $?
```
Expected: 0, taking about 14 minutes.
`tail -1 S/mutants.out` prints:
```
127 killed, 0 survived, 0 not as expected
```
Every mutant is killed and restored byte for byte. The planner's lines follow (from `PL/logs/mutants.out`), for comparison; the Expected lines are the exit code and the tail. Two are killed by an error rather than an assertion, by design: P19 (a category with no tile is a `TypeError`) and C34 (a wallet that is not listed is a `TypeError`).
```
D1 KILLED: each new outbox reloads from loading (M1: the outbox in the load's keys) -> a diary sync never blanks the screen or resets it, and reads nothing again [insightsData.ts; Tests 2 failed | 24 passed (26); AssertionError x2; restored sha256 equal]
D2 KILLED: a resolved draft reloads loudly, from loading -> a draft saved meanwhile shows at once, and one that resolves refreshes in place [insightsData.ts; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
D3 KILLED: a resolved draft never refreshes -> a draft saved meanwhile shows at once, and one that resolves refreshes in place [insightsData.ts; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
D4 KILLED: an acknowledged draft still counts as open -> a draft saved meanwhile shows at once, and one that resolves refreshes in place [insightsData.ts; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
D5 KILLED: the phone's drafts never read -> each day button says its date and its money out, today named and drafts said apart [insightsData.ts; Tests 2 failed | 24 passed (26); AssertionError x2; restored sha256 equal]
D6 KILLED: a diary that is not open counts as open -> offline is said with the banner where a diary is open; a problem a retry cannot fix offers no Try again [insightsData.ts; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
D7 KILLED: offline said with no diary open (m1) -> offline is said with the banner where a diary is open; a problem a retry cannot fix offers no Try again [insightsData.ts; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
D8 KILLED: every problem said as offline -> offline is said with the banner where a diary is open; a problem a retry cannot fix offers no Try again [insightsData.ts; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
D9 KILLED: the month before's data handed over as this month's -> the calendar steps back a month and never draws October under September; next stops at this month [insightsData.ts; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
D10 KILLED: a compare month that fails is drawn as ฿0 (M6) -> a compare month that cannot be read is never drawn as ฿0: the problem says so with Try again [insightsData.ts; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
D11 KILLED: this month's summary read twice (n6) -> a diary sync never blanks the screen or resets it, and reads nothing again [insightsData.ts; Tests 3 failed | 23 passed (26); AssertionError x3; restored sha256 equal]
D12 KILLED: the month's bar not from its own summary -> the spending tab draws six bars, this month in barNow and the others in barPast, with the budget line [insightsData.ts; Tests 25 failed | 1 passed (26); AssertionError x25; restored sha256 equal]
R10 KILLED: only the month's first history page read -> every page of the month is read [insightsData.ts; Tests 2 failed | 24 passed (26); AssertionError x2; restored sha256 equal]
D13 KILLED: a later page that says the diary changed is never said (m1) -> entries changed meanwhile are said, with Refresh [insightsData.ts; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
D14 KILLED: a deleted record counted as money out -> a category no longer listed, a deleted record and money in are counted nowhere they do not belong [insightsData.ts; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
D15 KILLED: money in counted as money out -> a category no longer listed, a deleted record and money in are counted nowhere they do not belong [insightsData.ts; Tests 2 failed | 24 passed (26); AssertionError x2; restored sha256 equal]
R1 KILLED: insights_viewed on every render (the dependency array dropped) -> each tab is a 44 pt tab and sends insights_viewed with spending, in_out or calendar [WalletInsightsScreen.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
S2 KILLED: the plan's mutant: tab 'inOut' -> each tab is a 44 pt tab and sends insights_viewed with spending, in_out or calendar [WalletInsightsScreen.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
S3 KILLED: the first tab shown never sent -> each tab is a 44 pt tab and sends insights_viewed with spending, in_out or calendar [WalletInsightsScreen.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
R9 KILLED: a load problem offers no Try again -> a compare month that cannot be read is never drawn as ฿0: the problem says so with Try again [WalletInsightsScreen.tsx; Tests 2 failed | 24 passed (26); AssertionError x2; restored sha256 equal]
S4 KILLED: Try again for a problem a retry cannot fix -> offline is said with the banner where a diary is open; a problem a retry cannot fix offers no Try again [WalletInsightsScreen.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
S5 KILLED: Try again does nothing -> a compare month that cannot be read is never drawn as ฿0: the problem says so with Try again [WalletInsightsScreen.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
S6 KILLED: the problem's title dropped (m1) -> a compare month that cannot be read is never drawn as ฿0: the problem says so with Try again [WalletInsightsScreen.tsx; Tests 2 failed | 24 passed (26); AssertionError x2; restored sha256 equal]
S7 KILLED: the offline banner never shown (m1) -> offline is said with the banner where a diary is open; a problem a retry cannot fix offers no Try again [WalletInsightsScreen.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
S8 KILLED: entries changed meanwhile never said -> entries changed meanwhile are said, with Refresh [WalletInsightsScreen.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
S9 KILLED: Refresh does nothing -> entries changed meanwhile are said, with Refresh [WalletInsightsScreen.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
S10 KILLED: no tab says it is selected -> each tab is a 44 pt tab and sends insights_viewed with spending, in_out or calendar [WalletInsightsScreen.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
S11 KILLED: tabs 40 pt tall -> each tab is a 44 pt tab and sends insights_viewed with spending, in_out or calendar [WalletInsightsScreen.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
S12 KILLED: the calendar tab names the month twice -> the calendar's month line, legend and chosen day are wc-calendar's, every amount exact [WalletInsightsScreen.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
R13 KILLED: the days-left line always says 0 -> the spending tab draws six bars, this month in barNow and the others in barPast, with the budget line [SpendingTab.tsx; Tests 3 failed | 23 passed (26); AssertionError x3; restored sha256 equal]
P2 KILLED: today not counted in the days left (m2) -> the spending tab draws six bars, this month in barNow and the others in barPast, with the budget line [SpendingTab.tsx; Tests 3 failed | 23 passed (26); AssertionError x3; restored sha256 equal]
P3 KILLED: a month gone by says how many days are left -> the calendar steps back a month and never draws October under September; next stops at this month [SpendingTab.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
R14 KILLED: three logged days still early -> with two logged days the early state asks for one more day [SpendingTab.tsx; Tests 2 failed | 24 passed (26); AssertionError x2; restored sha256 equal]
P5 KILLED: the early title always asks for three days -> with two logged days the early state asks for one more day [SpendingTab.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
P6 KILLED: every logged day labelled with today (M4) -> with two logged days the early state asks for one more day [SpendingTab.tsx; Tests 2 failed | 24 passed (26); AssertionError x2; restored sha256 equal]
P7 KILLED: every day so far counted as logged -> with two logged days the early state asks for one more day [SpendingTab.tsx; Tests 2 failed | 24 passed (26); AssertionError x2; restored sha256 equal]
R8 KILLED: the early state never says insights.noPrevious -> with two logged days the early state asks for one more day [SpendingTab.tsx; Tests 2 failed | 24 passed (26); AssertionError x2; restored sha256 equal]
P9 KILLED: insights.noPrevious though an earlier month has money out -> with two logged days the early state asks for one more day [SpendingTab.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
P10 KILLED: an earlier month with nothing spent counts as one to compare -> with two logged days the early state asks for one more day [SpendingTab.tsx; Tests 2 failed | 24 passed (26); AssertionError x2; restored sha256 equal]
P11 KILLED: the early state's categories heading is the board's หมวดหมู่ -> with two logged days the early state asks for one more day [SpendingTab.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
P12 KILLED: an empty categories card with nothing logged -> with two logged days the early state asks for one more day [SpendingTab.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
R12 KILLED: every category says 1 รายการ -> the categories are the month's totals in topCategories' order, each with its own count, opening History filtered to it [SpendingTab.tsx; Tests 5 failed | 21 passed (26); AssertionError x5; restored sha256 equal]
P14 KILLED: a category's count holds every expense -> the categories are the month's totals in topCategories' order, each with its own count, opening History filtered to it [SpendingTab.tsx; Tests 4 failed | 22 passed (26); AssertionError x4; restored sha256 equal]
P15 KILLED: a category row opens History by the category's name (R71) -> the categories are the month's totals in topCategories' order, each with its own count, opening History filtered to it [SpendingTab.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
P16 KILLED: the bars never given the budget -> the spending tab draws six bars, this month in barNow and the others in barPast, with the budget line [SpendingTab.tsx; Tests 5 failed | 21 passed (26); AssertionError x5; restored sha256 equal]
P17 KILLED: the bars never told about private mode -> in private mode the chart's name carries no amount and the calendar is one neutral fill with no legend values [SpendingTab.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
P18 KILLED: the info button opens nothing -> the info button explains the number in a tray [SpendingTab.tsx; Tests 2 failed | 24 passed (26); AssertionError x2; restored sha256 equal]
P19 KILLED: a category no longer listed has no tile -> a category no longer listed, a deleted record and money in are counted nowhere they do not belong [SpendingTab.tsx; Tests 1 failed | 25 passed (26); AssertionError x0; restored sha256 equal]
B1 KILLED: the bars on their own scale, not the budget's (M2) -> the budget line sits on the bars' own scale, from one baseline [MonthBars.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
B2 KILLED: the scale ignores the months -> the budget line sits on the bars' own scale, from one baseline [MonthBars.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
B3 KILLED: a small month draws flat -> the budget line sits on the bars' own scale, from one baseline [MonthBars.tsx; Tests 2 failed | 24 passed (26); AssertionError x2; restored sha256 equal]
B4 KILLED: a month with nothing out draws a stub -> the budget line sits on the bars' own scale, from one baseline [MonthBars.tsx; Tests 2 failed | 24 passed (26); AssertionError x2; restored sha256 equal]
B5 KILLED: the line's baseline is not the bars' (M2) -> the budget line sits on the bars' own scale, from one baseline [MonthBars.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
R2 KILLED: the chart's spoken label drops this month's amount -> the chart is one named element that reads each month's amount [MonthBars.tsx; Tests 2 failed | 24 passed (26); AssertionError x2; restored sha256 equal]
B7 KILLED: private mode: the chart's label keeps the amounts -> in private mode the chart's name carries no amount and the calendar is one neutral fill with no legend values [MonthBars.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
R5 KILLED: private mode: the budget label shows the budget -> in private mode the chart's name carries no amount and the calendar is one neutral fill with no legend values [MonthBars.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
B9 KILLED: the budget label in the exact form (m10) -> the spending tab draws six bars, this month in barNow and the others in barPast, with the budget line [MonthBars.tsx; Tests 4 failed | 22 passed (26); AssertionError x4; restored sha256 equal]
R3 KILLED: five bars drawn, not six -> the spending tab draws six bars, this month in barNow and the others in barPast, with the budget line [MonthBars.tsx; Tests 2 failed | 24 passed (26); AssertionError x2; restored sha256 equal]
B11 KILLED: this month drawn in barPast -> the spending tab draws six bars, this month in barNow and the others in barPast, with the budget line [MonthBars.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
B12 KILLED: the months cut from their long names (m7) -> the spending tab draws six bars, this month in barNow and the others in barPast, with the budget line [MonthBars.tsx; Tests 2 failed | 24 passed (26); AssertionError x2; restored sha256 equal]
R15 KILLED: money in drawn in ink, with no plus -> the in-and-out tab shows money in in violet with a plus [InOutTab.tsx; Tests 3 failed | 23 passed (26); AssertionError x3; restored sha256 equal]
R4 KILLED: private mode: the kept line shows its amount -> in private mode the in-and-out tab masks every amount and keeps its words [InOutTab.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
I3 KILLED: the kept line a bare amount (m9) -> the in-and-out tab shows money in in violet with a plus [InOutTab.tsx; Tests 4 failed | 22 passed (26); AssertionError x4; restored sha256 equal]
I4 KILLED: in and out matched said as more out -> more out than in, and in and out matched, are said in words [InOutTab.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
I5 KILLED: money in drawn in barPast -> the in-and-out tab shows money in in violet with a plus [InOutTab.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
I6 KILLED: money out drawn in barPast -> the in-and-out tab shows money in in violet with a plus [InOutTab.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
I7 KILLED: the in-and-out chart unnamed (m4) -> the in-and-out tab shows money in in violet with a plus [InOutTab.tsx; Tests 2 failed | 24 passed (26); AssertionError x2; restored sha256 equal]
I8 KILLED: private mode: the in-and-out chart's label keeps the amounts -> in private mode the in-and-out tab masks every amount and keeps its words [InOutTab.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
I9 KILLED: the pairs scaled by money out only -> the in-and-out tab shows money in in violet with a plus [InOutTab.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
C1 KILLED: the month line rounded through a JS number (M5) -> the calendar's month line, legend and chosen day are wc-calendar's, every amount exact [CalendarTab.tsx; Tests 4 failed | 22 passed (26); AssertionError x4; restored sha256 equal]
R6 KILLED: private mode: the calendar's month line shows the month's spending -> in private mode the chart's name carries no amount and the calendar is one neutral fill with no legend values [CalendarTab.tsx; Tests 2 failed | 24 passed (26); AssertionError x2; restored sha256 equal]
C3 KILLED: the days so far taken as the whole month -> the calendar's month line, legend and chosen day are wc-calendar's, every amount exact [CalendarTab.tsx; Tests 6 failed | 20 passed (26); AssertionError x6; restored sha256 equal]
R7 KILLED: next month never disabled -> the calendar steps back a month and never draws October under September; next stops at this month [CalendarTab.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
C5 KILLED: previous steps forward -> the calendar steps back a month and never draws October under September; next stops at this month [CalendarTab.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
C6 KILLED: the weekday initials always Thai (M7) -> in English the insights carry no Thai: weekdays, today, the per-day unit and entries are its own words [CalendarTab.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
C7 KILLED: private mode: an empty day keeps its hairline (M3) -> in private mode the chart's name carries no amount and the calendar is one neutral fill with no legend values [CalendarTab.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
C8 KILLED: the plan's mutant: the shades kept in private mode -> in private mode the chart's name carries no amount and the calendar is one neutral fill with no legend values [CalendarTab.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
R11 KILLED: private mode: the day numbers keep the step's colour -> in private mode the chart's name carries no amount and the calendar is one neutral fill with no legend values [CalendarTab.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
C10 KILLED: today framed 1 pt -> the calendar shades each day by its baht step, frames today and leaves future days inert [CalendarTab.tsx; Tests 2 failed | 24 passed (26); AssertionError x2; restored sha256 equal]
C11 KILLED: an empty day loses its hairline -> the calendar shades each day by its baht step, frames today and leaves future days inert [CalendarTab.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
C12 KILLED: a day button names its date alone (m3) -> each day button says its date and its money out, today named and drafts said apart [CalendarTab.tsx; Tests 3 failed | 23 passed (26); AssertionError x3; restored sha256 equal]
C13 KILLED: private mode: a day button says its money out -> in private mode the chart's name carries no amount and the calendar is one neutral fill with no legend values [CalendarTab.tsx; Tests 2 failed | 24 passed (26); AssertionError x2; restored sha256 equal]
C14 KILLED: private mode: today not named -> in private mode the chart's name carries no amount and the calendar is one neutral fill with no legend values [CalendarTab.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
C15 KILLED: private mode: a day shows its amount -> in private mode the chart's name carries no amount and the calendar is one neutral fill with no legend values [CalendarTab.tsx; Tests 2 failed | 24 passed (26); AssertionError x2; restored sha256 equal]
C16 KILLED: a day with nothing spent shows 0 -> the calendar shades each day by its baht step, frames today and leaves future days inert [CalendarTab.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
C17 KILLED: a day's baht rounded through a JS number (M5) -> the calendar shades each day by its baht step, frames today and leaves future days inert [CalendarTab.tsx; Tests 2 failed | 24 passed (26); AssertionError x2; restored sha256 equal]
C18 KILLED: the days shaded by the month's heat, not the fixed steps (W22) -> the calendar shades each day by its baht step, frames today and leaves future days inert [CalendarTab.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
C19 KILLED: future days are buttons -> the calendar shades each day by its baht step, frames today and leaves future days inert [CalendarTab.tsx; Tests 2 failed | 24 passed (26); AssertionError x2; restored sha256 equal]
C20 KILLED: future days reach screen readers -> the calendar shades each day by its baht step, frames today and leaves future days inert [CalendarTab.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
C21 KILLED: private mode: the legend's values shown (R65) -> in private mode the chart's name carries no amount and the calendar is one neutral fill with no legend values [CalendarTab.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
C22 KILLED: private mode: the legend's unit shown -> in private mode the chart's name carries no amount and the calendar is one neutral fill with no legend values [CalendarTab.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
C23 KILLED: private mode: the legend says its values (n4) -> in private mode the chart's name carries no amount and the calendar is one neutral fill with no legend values [CalendarTab.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
C24 KILLED: the legend's last value read past the limits -> a category no longer listed, a deleted record and money in are counted nowhere they do not belong [CalendarTab.tsx; Tests 13 failed | 13 passed (26); AssertionError x1; restored sha256 equal]
C25 KILLED: the per-day unit always Thai (M7) -> in English the insights carry no Thai: weekdays, today, the per-day unit and entries are its own words [CalendarTab.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
C26 KILLED: วันนี้ always Thai on the chosen day (M7) -> in English the insights carry no Thai: weekdays, today, the per-day unit and entries are its own words [CalendarTab.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
C27 KILLED: the chosen day not through dateStep (m7) -> a category no longer listed, a deleted record and money in are counted nowhere they do not belong [CalendarTab.tsx; Tests 7 failed | 19 passed (26); AssertionError x7; restored sha256 equal]
C28 KILLED: the chosen day never says today -> the calendar's month line, legend and chosen day are wc-calendar's, every amount exact [CalendarTab.tsx; Tests 3 failed | 23 passed (26); AssertionError x3; restored sha256 equal]
C29 KILLED: a month gone by opens on today's date -> the calendar steps back a month and never draws October under September; next stops at this month [CalendarTab.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
C30 KILLED: choosing a day does nothing -> a category no longer listed, a deleted record and money in are counted nowhere they do not belong [CalendarTab.tsx; Tests 4 failed | 22 passed (26); AssertionError x4; restored sha256 equal]
C31 KILLED: the chosen day lists the month's records -> a category no longer listed, a deleted record and money in are counted nowhere they do not belong [CalendarTab.tsx; Tests 4 failed | 22 passed (26); AssertionError x4; restored sha256 equal]
C32 KILLED: a built-in category unnamed on the chosen day (m5) -> a category no longer listed, a deleted record and money in are counted nowhere they do not belong [CalendarTab.tsx; Tests 5 failed | 21 passed (26); AssertionError x5; restored sha256 equal]
C33 KILLED: the wallet left off the chosen day (m5) -> a category no longer listed, a deleted record and money in are counted nowhere they do not belong [CalendarTab.tsx; Tests 4 failed | 22 passed (26); AssertionError x4; restored sha256 equal]
C34 KILLED: a record whose wallet is not listed -> a record with no merchant or note is named by its category, and one whose wallet is no longer listed by its category alone [CalendarTab.tsx; Tests 1 failed | 25 passed (26); AssertionError x0; restored sha256 equal]
C35 KILLED: a record with no merchant or note named รายการ (M7) -> a record with no merchant or note is named by its category, and one whose wallet is no longer listed by its category alone [CalendarTab.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
C36 KILLED: the chosen day's total never added up -> a category no longer listed, a deleted record and money in are counted nowhere they do not belong [CalendarTab.tsx; Tests 4 failed | 22 passed (26); AssertionError x4; restored sha256 equal]
C37 KILLED: a day 43 pt wide (m11) -> at AX5 the calendar's days stay 44 pt wide and grow taller, and nothing is cut [CalendarTab.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
C38 KILLED: the grid's gaps 6 pt, below 44 pt a day on a 375 pt phone (m11) -> at AX5 the calendar's days stay 44 pt wide and grow taller, and nothing is cut [CalendarTab.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
C39 KILLED: the grid's numbers grow to the body's scale (m11) -> at AX5 the calendar's days stay 44 pt wide and grow taller, and nothing is cut [CalendarTab.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
C40 KILLED: the grid's numbers in Anuphan (n5) -> at AX5 the calendar's days stay 44 pt wide and grow taller, and nothing is cut [CalendarTab.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
C41 KILLED: a day a fixed 50 pt tall (m11) -> at AX5 the calendar's days stay 44 pt wide and grow taller, and nothing is cut [CalendarTab.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
F1 KILLED: the tray explains nothing -> the info button explains the number in a tray [InfoTray.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
H1 KILLED: the plan's mutant: ฿200 is step 2 -> calendarShade maps satang amounts to steps 0 through 5 [calendarShade.ts; Tests 2 failed | 1 passed (3); AssertionError x2; restored sha256 equal]
H2 KILLED: above ฿2,000 is step 4 -> calendarShade maps satang amounts to steps 0 through 5 [calendarShade.ts; Tests 1 failed | 2 passed (3); AssertionError x1; restored sha256 equal]
H3 KILLED: the limits read as tenths of baht -> calendarShade maps satang amounts to steps 0 through 5 [calendarShade.ts; Tests 2 failed | 1 passed (3); AssertionError x2; restored sha256 equal]
T1 KILLED: a year 0 month named -> a month's short name has no year, in each language [dateStep.ts; Tests 1 failed | 11 passed (12); AssertionError x1; restored sha256 equal]
T2 KILLED: month 00 named -> a month's short name has no year, in each language [dateStep.ts; Tests 1 failed | 11 passed (12); AssertionError x1; restored sha256 equal]
T3 KILLED: month 13 named -> a month's short name has no year, in each language [dateStep.ts; Tests 1 failed | 11 passed (12); AssertionError x1; restored sha256 equal]
T4 KILLED: another year's date written without its year -> a short date is written out for today and yesterday too, with the year only when it is not this year [dateStep.ts; Tests 1 failed | 11 passed (12); AssertionError x1; restored sha256 equal]
T5 KILLED: today written as วันนี้ -> a short date is written out for today and yesterday too, with the year only when it is not this year [dateStep.ts; Tests 1 failed | 11 passed (12); AssertionError x1; restored sha256 equal]
K1 KILLED: the sections back in 'Kit' -> the catalogue's insights sections draw the real screen on fakes, one state each [insightsSections.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
K2 KILLED: the sections not drawn as whole screens -> the catalogue's insights sections draw the real screen on fakes, one state each [insightsSections.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
K3 KILLED: nothing drawn while the screen's module loads -> the catalogue's insights sections draw the real screen on fakes, one state each [insightsSections.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
K4 KILLED: the insights sections left out of the catalogue -> the catalogue's insights sections draw the real screen on fakes, one state each [index.ts; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
K5 KILLED: the private calendar without private mode -> the catalogue's insights sections draw the real screen on fakes, one state each [insightsScreens.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
K6 KILLED: the in-and-out section on the spending tab -> the catalogue's insights sections draw the real screen on fakes, one state each [insightsScreens.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
K7 KILLED: the first days drawn on wc-calendar's month -> the catalogue's insights sections draw the real screen on fakes, one state each [insightsScreens.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
K8 KILLED: the largest amount drawn on an ordinary month -> the catalogue's insights sections draw the real screen on fakes, one state each [insightsScreens.tsx; Tests 1 failed | 25 passed (26); AssertionError x1; restored sha256 equal]
```

Then `/usr/bin/git -C WT status --short` prints exactly the Step 3 list again, and `cd WT && shasum -a 256 -c PL/SHA256SUMS.real-in-wt` gives sixteen `OK` lines.

## Step 5: The fast local gate (R100)

1. `cd WT && npm run typecheck:app > S/gate-typecheck.log 2>&1; echo $?`. Expected: 0.
2. `cd WT && npm run test:app > S/gate-test-app.log 2>&1; echo $?`. Expected: 0, `ℹ fail 0`.
3. `cd WT && npm run test:unit > S/gate-test-unit.log 2>&1; echo $?`. Expected: 0, `ℹ fail 0`.
4. `/usr/bin/git -C WT diff --check`. Expected: no output, exit 0.
5. The focused files of Step 3 (items 3 to 7) are the rest of the gate; they already ran green.

CI on PR #421 runs the full render suite, the exports (web and iOS), edge, the database suites and ops. No route, config or app entry changed, so `typecheck:routes` and `export:web` are not run locally.

## Step 6: Receipt

The round's receipt `docs/implementation/receipts/P2-T31-fix.md` and the pointer line in `docs/implementation/receipts/P2-T31.md` were copied in Step 3, and checked by `SHA256SUMS.real-in-wt`. Do not edit them. If one of your counts differs from the receipt's, stop and report BLOCKED (do not edit the receipt).

## Step 7: Commit

Write the commit message to `S/commit.msg`:
```
Rebuild Bun Wallet insights on one quiet load, one scale and exact money

The fix round on PR #421 (review M1 to M8, m1 to m11; ruling R112):
- one load keyed by the month and today; drafts at render time, and a
  resolved draft refreshes quietly (M1)
- the budget line on the bars' own scale, from one baseline (M2)
- private mode draws every day alike, with no amount (M3, R65)
- the early state, the bars and the chosen day dated through dateStep,
  which gains monthShortLabel and shortDateLabel (M4, m7)
- exact money in the wallet's money text (M5, m10)
- a compare month that cannot be read fails the load, with Try again (M6)
- every word in the catalogs or the draft table (M7)
- 26 render cases, recordAnalytics, 127 mutants killed (M8)
- the catalogue draws the real screen on fakes, loaded lazily (m6)

Co-Authored-By: Gemini 3.8 Flash High <noreply@google.com>
```

Commit the fix (stage the round's files by name):
```bash
/usr/bin/git -C WT add apps/app/src/ui/dateStep.ts
/usr/bin/git -C WT add apps/app/src/ui/dateStep.test.ts
/usr/bin/git -C WT add apps/app/src/wallet/insights/calendarShade.ts
/usr/bin/git -C WT add apps/app/src/wallet/insights/copy.ts
/usr/bin/git -C WT add apps/app/src/wallet/insights/insightsData.ts
/usr/bin/git -C WT add apps/app/src/wallet/insights/WalletInsightsScreen.tsx
/usr/bin/git -C WT add apps/app/src/wallet/insights/SpendingTab.tsx
/usr/bin/git -C WT add apps/app/src/wallet/insights/MonthBars.tsx
/usr/bin/git -C WT add apps/app/src/wallet/insights/InOutTab.tsx
/usr/bin/git -C WT add apps/app/src/wallet/insights/CalendarTab.tsx
/usr/bin/git -C WT add apps/app/src/wallet/insights/InfoTray.tsx
/usr/bin/git -C WT add apps/app/src/wallet/insights/WalletInsights.render.test.tsx
/usr/bin/git -C WT add apps/app/src/dev/catalogue/wallet/insightsSections.tsx
/usr/bin/git -C WT add apps/app/src/dev/catalogue/wallet/insightsScreens.tsx
/usr/bin/git -C WT add docs/implementation/receipts/P2-T31.md
/usr/bin/git -C WT add docs/implementation/receipts/P2-T31-fix.md
/usr/bin/git -C WT commit -F S/commit.msg
/usr/bin/git -C WT rev-parse --short HEAD
/usr/bin/git -C WT diff --stat afc19276 HEAD
/usr/bin/git -C WT status --short
/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD
```
Expected: the stat lists the sixteen files of the Scope; `status --short` prints nothing; `diff --check` prints nothing and exits 0 (it covers the two new files too).

## Your final message

The orchestrator reads only this:
- First line: `STATUS: DONE` (or `STATUS: BLOCKED` with the exact blocker).
- Commit SHA and branch: `p2/t31-insights`, one commit on top of `afc19276`.
- Files: the sixteen of the Scope (shared: `src/ui/dateStep.ts` and `src/ui/dateStep.test.ts`, additive).
- RED: Node 2 failed (`AssertionError`), render 26 failed (`AssertionError`), with no lookup or module error.
- GREEN: Node 19 passed; insights 26 passed; the routes, neighbours and catalogue counts of Step 3.
- Mutants: 127 killed, 0 survived (S13 equivalent, not run).
- Gate: `typecheck:app` 0, `test:app` and `test:unit` `ℹ fail 0`, `diff --check` clean.
- Deviations: none from the brief's rulings.

## Appendix: the diffs

### `apps/app/src/ui/dateStep.ts`

```diff
diff --git a/apps/app/src/ui/dateStep.ts b/apps/app/src/ui/dateStep.ts
--- a/apps/app/src/ui/dateStep.ts
+++ b/apps/app/src/ui/dateStep.ts
@@ -199,3 +199,23 @@
 export function weekdayInitials(locale: DateLocale): readonly string[] {
   return WORDS[locale].weekdaysNarrow;
 }
+
+/** A month's short name, without its year, under a chart's bar: "Oct", "ต.ค.", "thg 10" (bw-insights). */
+export function monthShortLabel(month: string, locale: DateLocale): string {
+  const match = ISO_MONTH.exec(month);
+  const number = match ? Number(match[2]) : 0;
+  if (!match || Number(match[1]) < 1 || number < 1 || number > 12) throw new TypeError(`Expected a YYYY-MM month, got ${month}.`);
+  return WORDS[locale].monthsShort[number - 1];
+}
+
+/**
+ * The day written out even when it is today or yesterday: "Sat 24 Oct",
+ * "เสาร์ 24 ต.ค.", with the year only when it is not today's year. For a
+ * heading that says Today beside the date (wc-calendar: "เสาร์ 24 ต.ค. ·
+ * วันนี้") and for a row of dates (es-empty-insights); chips and day headers
+ * keep `dayLabel`.
+ */
+export function shortDateLabel(date: string, today: string, locale: DateLocale): string {
+  const day = partsOf(date);
+  return shortDate(day, locale, day.year !== partsOf(today).year);
+}
```

### `apps/app/src/ui/dateStep.test.ts`

```diff
diff --git a/apps/app/src/ui/dateStep.test.ts b/apps/app/src/ui/dateStep.test.ts
--- a/apps/app/src/ui/dateStep.test.ts
+++ b/apps/app/src/ui/dateStep.test.ts
@@ -1,7 +1,7 @@
 import assert from 'node:assert/strict';
 import { test } from 'node:test';

-import { canStepBack, canStepForward, dayLabel, displayYear, fullDateLabel, isCalendarDate, monthLabel, stepDate, stepDay, weekdayInitials } from './dateStep.ts';
+import { canStepBack, canStepForward, dayLabel, displayYear, fullDateLabel, isCalendarDate, monthLabel, monthShortLabel, shortDateLabel, stepDate, stepDay, weekdayInitials } from './dateStep.ts';

 test('steps one day across month and year ends', () => {
   assert.equal(stepDate('2026-10-17', 1), '2026-10-18');
@@ -110,3 +110,24 @@
   assert.deepEqual(weekdayInitials('th'), ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']);
   assert.deepEqual(weekdayInitials('vi'), ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']);
 });
+
+test("a month's short name has no year, in each language", () => {
+  assert.deepEqual(['2026-05', '2026-06', '2026-10', '2027-01'].map((month) => monthShortLabel(month, 'th')), ['พ.ค.', 'มิ.ย.', 'ต.ค.', 'ม.ค.']);
+  assert.deepEqual(['2026-05', '2026-10', '2027-01'].map((month) => monthShortLabel(month, 'en')), ['May', 'Oct', 'Jan']);
+  assert.equal(monthShortLabel('2026-12', 'vi'), 'thg 12');
+  assert.throws(() => monthShortLabel('2026-13', 'th'), TypeError);
+  assert.throws(() => monthShortLabel('2026-00', 'en'), TypeError);
+  assert.throws(() => monthShortLabel('0000-10', 'en'), TypeError);
+  assert.throws(() => monthShortLabel('2026-10-01', 'en'), TypeError);
+});
+
+test('a short date is written out for today and yesterday too, with the year only when it is not this year', () => {
+  const today = '2026-10-24';
+  assert.equal(shortDateLabel(today, today, 'th'), 'เสาร์ 24 ต.ค.');
+  assert.equal(shortDateLabel('2026-10-23', today, 'th'), 'ศุกร์ 23 ต.ค.');
+  assert.equal(shortDateLabel(today, today, 'en'), 'Sat 24 Oct');
+  assert.equal(shortDateLabel(today, today, 'vi'), 'Thứ 7, 24 thg 10');
+  assert.equal(shortDateLabel('2025-12-31', today, 'th'), 'พุธ 31 ธ.ค. 2568');
+  assert.equal(shortDateLabel('2025-12-31', today, 'en'), 'Wed 31 Dec 2025');
+  assert.throws(() => shortDateLabel('2026-02-30', today, 'en'), TypeError);
+});
```

### `apps/app/src/wallet/insights/calendarShade.ts`

```diff
diff --git a/apps/app/src/wallet/insights/calendarShade.ts b/apps/app/src/wallet/insights/calendarShade.ts
--- a/apps/app/src/wallet/insights/calendarShade.ts
+++ b/apps/app/src/wallet/insights/calendarShade.ts
@@ -1,20 +1,15 @@
-// Calendar shade step calculation for Bun Wallet insights (P2-T31).
-// Pure function: maps money out in satang (Minor) to a CalendarStep 0..5.
-// 0: nothing spent (outMinor <= 0)
-// 1: up to ฿200 inclusive (outMinor <= 20000)
-// 2: up to ฿500 inclusive (outMinor <= 50000)
-// 3: up to ฿1,000 inclusive (outMinor <= 100000)
-// 4: up to ฿2,000 inclusive (outMinor <= 200000)
-// 5: above ฿2,000 (outMinor > 200000)
+// A calendar day's step from its money out (P2-T31, wc-calendar, W22): 0 for
+// nothing spent, then up to ฿200, ฿500, ฿1,000 and ฿2,000 a day (each
+// inclusive) from CALENDAR_STEP_LIMITS_BAHT, and 5 above that. Exact: satang
+// through BigInt only. Pure: a Node test reads it, so it imports by relative
+// path.
 import type { Minor } from '@gogospend/contracts';
-import type { CalendarStep } from '@mobile/theme/walletPalette';
+
+import { CALENDAR_STEP_LIMITS_BAHT } from '../../theme/walletPalette.ts';
+import type { CalendarStep } from '../../theme/walletPalette.ts';

 export function calendarShade(outMinor: Minor): CalendarStep {
-  const satang = BigInt(outMinor);
-  if (satang <= 0n) return 0;
-  if (satang <= 20000n) return 1;
-  if (satang <= 50000n) return 2;
-  if (satang <= 100000n) return 3;
-  if (satang <= 200000n) return 4;
-  return 5;
+  const out = BigInt(outMinor);
+  const step = CALENDAR_STEP_LIMITS_BAHT.findIndex((baht) => out <= BigInt(baht) * 100n);
+  return (step === -1 ? CALENDAR_STEP_LIMITS_BAHT.length : step) as CalendarStep;
 }
```

### `apps/app/src/wallet/insights/copy.ts`

```diff
diff --git a/apps/app/src/wallet/insights/copy.ts b/apps/app/src/wallet/insights/copy.ts
--- a/apps/app/src/wallet/insights/copy.ts
+++ b/apps/app/src/wallet/insights/copy.ts
@@ -1,33 +1,49 @@
 import type { DraftTable } from '../copy/draftText.ts';

 /**
- * Insights copy table (bw-insights, wc-calendar, es-empty-insights).
- * Pure data: read through `useDraftCopy`.
- * Default pending owner Q3: built as written; English lines and Thai lines marked draft are drafts for E2-C.
+ * Insights' lines (bw-insights, wc-calendar, es-empty-insights), Thai first;
+ * Vietnamese shows the English (E2). Data only: read through `useDraftCopy`.
+ * Every word the screens draw is here, in the catalogs through `tc()`, or a
+ * date from src/ui/dateStep.ts, so P2-T38 moves them all at once.
+ * Default pending owner Q3: built as written. Every English line is a draft
+ * for E2-C, and so is each Thai line marked "draft" below (the plan's, and the
+ * lines no board shows).
  */
 export const COPY = {
   'insights.title': { th: 'สรุป', en: 'Insights' },
   'insights.tabSpending': { th: 'ใช้จ่าย', en: 'Spending' },
-  'insights.tabInOut': { th: 'เงินเข้า-ออก', en: 'In & Out' },
+  'insights.tabInOut': { th: 'เงินเข้า-ออก', en: 'In and out' },
   'insights.tabCalendar': { th: 'ปฏิทิน', en: 'Calendar' },
   'insights.monthly': { th: 'รายเดือน', en: 'Monthly' },
   'insights.whatIsThis': { th: 'ตัวเลขนี้คืออะไร', en: 'What is this number?' },
-  'insights.spentExplain': { th: 'ยอดนี้คือรายจ่ายที่บันทึกแล้วในเดือนนี้ ไม่รวมการโอนและรายการที่ยังรอส่ง', en: 'This is confirmed spending for this month, excluding transfers and drafts waiting to sync.' },
-  'insights.daysToEnd': { th: 'ใช้ไปแล้ว · อีก {n} วันจบเดือน', en: 'Spent · {n} days left in month' },
-  'insights.chartName': { th: 'ใช้จ่ายรายเดือน {from}ถึง{to}', en: 'Monthly spending {from} to {to}' },
+  // draft
+  'insights.spentExplain': { th: 'ยอดนี้คือรายจ่ายที่บันทึกแล้วในเดือนนี้ ไม่รวมการโอนและรายการที่ยังรอส่ง', en: 'This is the money out recorded this month. It leaves out moves between your wallets and entries still waiting to send.' },
+  'insights.daysToEnd': { th: 'ใช้ไปแล้ว · อีก {n} วันจบเดือน', en: 'Spent so far · {n} days to the end of the month' },
+  'insights.chartName': { th: 'ใช้จ่ายรายเดือน {from}ถึง{to}', en: 'Monthly spending, {from} to {to}' },
+  // draft
   'insights.moneyIn': { th: 'เงินเข้า', en: 'Money in' },
+  // draft
   'insights.moneyOut': { th: 'เงินออก', en: 'Money out' },
-  'insights.monthLine': { th: 'ใช้ไป {amount} · จด {n} จาก {d} วัน', en: 'Spent {amount} · Logged {n} of {d} days' },
+  'insights.monthLine': { th: 'ใช้ไป {amount} · จด {n} จาก {d} วัน', en: 'Spent {amount} · logged {n} of {d} days' },
   'insights.today': { th: 'วันนี้', en: 'Today' },
-  'insights.earlyTitle': { th: 'จดอีก {n} วัน กราฟจะขึ้นตรงนี้', en: 'Log {n} more days for the chart to appear here' },
+  'insights.earlyTitle': { th: 'จดอีก {n} วัน กราฟจะขึ้นตรงนี้', en: 'Log {n} more days and the chart shows here' },
   'insights.earlyBody': { th: 'กราฟต้องมีบันทึกอย่างน้อย 3 วัน ถึงจะเทียบกันได้', en: 'The chart needs at least 3 days of entries to compare' },
-  'insights.noPrevious': { th: 'ยังไม่มีเดือนก่อนให้เทียบ', en: 'No previous months to compare yet' },
+  'insights.noPrevious': { th: 'ยังไม่มีเดือนก่อนให้เทียบ', en: 'No earlier month to compare yet' },
+  'insights.nextDay': { th: 'วันถัดไป', en: 'Next day' },
   'insights.categories': { th: 'หมวดหมู่', en: 'Categories' },
+  'insights.soFar': { th: 'ที่จดไว้แล้ว', en: 'Logged so far' },
   'insights.entries': { th: '{count} รายการ', en: '{count} entries' },
   'insights.budget': { th: 'งบ {amount}', en: 'Budget {amount}' },
-  'insights.legend': { th: 'สีเข้มขึ้นเมื่อใช้มากขึ้น ตั้งแต่ 0 ถึงมากกว่า 2,000 บาทต่อวัน กรอบดำคือวันนี้', en: 'Darker with higher spending, from 0 to over 2,000 baht per day. Framed day is today.' },
-  'insights.sample': { th: 'ตัวอย่าง', en: 'Sample' },
-  'insights.nextDay': { th: 'วันถัดไป', en: 'Next day' },
+  // draft (W21: no board)
+  'insights.kept': { th: 'เก็บได้ {amount}', en: 'Kept {amount}' },
+  // draft (W21: no board)
+  'insights.inOutName': { th: 'เงินเข้าและเงินออกรายเดือน {from}ถึง{to}', en: 'Money in and out by month, {from} to {to}' },
+  // draft (W21: no board)
+  'insights.inOutMonth': { th: '{month} เงินเข้า {in} เงินออก {out}', en: '{month}: money in {in}, money out {out}' },
   'insights.previousMonth': { th: 'เดือนก่อน', en: 'Previous month' },
   'insights.nextMonth': { th: 'เดือนถัดไป', en: 'Next month' },
+  'insights.perDay': { th: 'บาท\nต่อวัน', en: 'baht\na day' },
+  'insights.legend': { th: 'สีเข้มขึ้นเมื่อใช้มากขึ้น ตั้งแต่ 0 ถึงมากกว่า 2,000 บาทต่อวัน', en: 'Darker as you spend more, from 0 to over 2,000 baht a day' },
+  // draft (wc-calendar says กรอบดำ, black frame; the frame is ink, which is light in dark mode)
+  'insights.legendToday': { th: 'กรอบคือวันนี้', en: 'The framed day is today' },
 } as const satisfies DraftTable;
```

### `apps/app/src/wallet/insights/insightsData.ts`

```diff
diff --git a/apps/app/src/wallet/insights/insightsData.ts b/apps/app/src/wallet/insights/insightsData.ts
--- a/apps/app/src/wallet/insights/insightsData.ts
+++ b/apps/app/src/wallet/insights/insightsData.ts
@@ -1,53 +1,84 @@
-// Insights data hook and types (P2-T31).
+// Insights' data (P2-T31): one load of the month and its six compare months,
+// keyed by the month and today only, so the diary's sync never reloads it.
+//
+// - One load reads the month's summary, the categories, the wallets, every
+//   page of the month's history (`readAllPages`, never an early stop) and the
+//   other compare months' summaries. The month shown shares its own summary
+//   with its bar, as the recap does. A compare month that cannot be read fails
+//   the load, so no bar is drawn or said as ฿0 for a month that was not read.
+// - Drafts on this phone are read at render time, from the diary's view, so a
+//   draft saved meanwhile shows at once (dayFacts keeps their money apart).
+//   When a draft the screen was showing resolves, the load runs again quietly,
+//   in place: the screen never blanks, and the chosen day and an open tray
+//   stay. A new outbox with the same drafts (every sync run) reads nothing.
+// - Data read for another month is never shown as this one's: a month step
+//   renders once before its load starts.
+// - Problems are recapProblem's words. Offline is said only where entries are
+//   kept on this phone (InsightsScreen's rule).
 import { HISTORY_MAX_LIMIT } from '@gogospend/contracts';
-import type { CategoryDto, MonthSummary, TransactionDto } from '@gogospend/contracts';
-import { useCallback, useEffect, useRef } from 'react';
+import type { CategoryDto, EntryDto, Minor, MonthSummary, TransactionDto, WalletDto } from '@gogospend/contracts';
+import { useEffect, useRef } from 'react';

+import { V1Error } from '@mobile/api/client';
 import { useCopy } from '@mobile/i18n/useCopy';
 import { useLoad } from '@mobile/screens/v1/parts';
 import { readAllPages } from '@mobile/spend/v1/redesign/insights/insightsModel';
+import { compareWindow, recapProblem } from '@mobile/spend/v1/redesign/insights/recapModel';
 import type { RecapProblem } from '@mobile/spend/v1/redesign/insights/recapModel';
-import { compareWindow, monthPhase, recapProblem } from '@mobile/spend/v1/redesign/insights/recapModel';
 import { useDiaryView, useSpendDiary } from '@mobile/spend/v1/SpendDiaryContext';
 import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
 import { monthRange } from '@mobile/spend/v1/viewModels';
 import type { OutboxCommand } from '@mobile/storage/types';

+/** 1D-T1's tab values (R61). */
 export type InsightsTab = 'spending' | 'in_out' | 'calendar';
+
+/** One compare month's money in and out, from its summary. */
+export type CompareMonth = { month: string; incomeMinor: Minor; expenseMinor: Minor };

 export type InsightsData = {
   month: string;
   today: string;
-  summary: MonthSummary | null;
+  /** The month's totals: money in and out, the budget, each category's money. */
+  summary: MonthSummary;
   categories: readonly CategoryDto[];
+  wallets: readonly WalletDto[];
+  /** Every confirmed record of the month, from every page. */
   records: readonly TransactionDto[];
-  drafts: readonly OutboxCommand[];
-  compare: readonly MonthSummary[];
+  /** The six compare months, oldest first (`compareWindow`). */
+  compare: readonly CompareMonth[];
+  /** A later page said the diary changed after the first was read. */
   refreshSuggested: boolean;
 };

 export type InsightsLoad =
-  | { state: 'loading'; reload?: () => void; refresh?: () => void }
-  | { state: 'ready'; data: InsightsData; reload: () => void; refresh: () => void }
-  | { state: 'error'; error: unknown; problem: RecapProblem; reload: () => void; refresh: () => void };
+  | { state: 'loading' }
+  | { state: 'ready'; data: InsightsData; drafts: readonly OutboxCommand[]; refresh: () => void }
+  | { state: 'error'; problem: RecapProblem; offline: boolean; reload: () => void };

 const NO_DRAFTS: readonly OutboxCommand[] = [];

+/** A live expense: the records a category's count and a chosen day's list hold (a deleted record counts nowhere). */
+export function isMoneyOut(record: TransactionDto): record is EntryDto {
+  return record.deleted_at === null && record.type === 'expense';
+}
+
+/** A category that is no longer listed: its tile is an initial on `raised`, and its name `tc('Category')`. */
+export function unknownCategory(id: string): Pick<CategoryDto, 'id' | 'builtin_key' | 'color' | 'label' | 'type'> {
+  return { id, builtin_key: null, color: null, label: null, type: 'expense' };
+}
+
+/** Refreshes in place whenever a draft the screen was showing resolves (sent, discarded or undone). */
 function useRefreshOnResolve(outbox: readonly OutboxCommand[], refresh: () => void): void {
   const open = useRef(new Set<string>());
   useEffect(() => {
-    const now = new Set(outbox.filter((c) => c.state !== 'acknowledged').map((c) => c.commandId));
+    const now = new Set(outbox.filter((command) => command.state !== 'acknowledged').map((command) => command.commandId));
     const resolved = [...open.current].some((id) => !now.has(id));
     open.current = now;
     if (resolved) refresh();
   }, [outbox, refresh]);
 }

-/**
- * Loads the month's summary, categories, all history pages for the month,
- * drafts from the local outbox, and the 6 compare months' summaries.
- * Errors are reported in recapProblem's words.
- */
 export function useInsightsData(month: string, today: string): InsightsLoad {
   const resources = useSpendV1();
   const tc = useCopy();
@@ -56,63 +87,34 @@

   const loaded = useLoad<InsightsData>(async () => {
     const months = compareWindow(month, today);
-    const started = monthPhase(month, today) !== 'future';
+    const others = months.filter((other) => other !== month);
+    const [summary, categories, wallets, read, otherSummaries] = await Promise.all([
+      resources.summary(month),
+      resources.categories(),
+      resources.wallets(),
+      readAllPages((cursor) => resources.history({ ...monthRange(month), sort: 'date_desc' }, cursor, HISTORY_MAX_LIMIT)),
+      Promise.all(others.map((other) => resources.summary(other))),
+    ]);
+    const summaryOf = new Map(others.map((other, index) => [other, otherSummaries[index]]));
+    const compare = months.map((shown): CompareMonth => {
+      // The month shown shares its own summary with its bar.
+      const totals = shown === month ? summary : summaryOf.get(shown)!;
+      return { month: shown, incomeMinor: totals.income_minor, expenseMinor: totals.expense_minor };
+    });
+    return { month, today, summary, categories, wallets, records: read.records, compare, refreshSuggested: read.refreshSuggested };
+  }, [resources, month, today]);

-    const [summary, categories, historyResult, compareList] = await Promise.all([
-      started ? resources.summary(month) : Promise.resolve(null),
-      resources.categories(),
-      started
-        ? readAllPages((cursor) => resources.history({ ...monthRange(month), sort: 'date_desc' }, cursor, HISTORY_MAX_LIMIT))
-        : Promise.resolve({ records: [], summary: { expense_minor: '0', income_minor: '0', count: 0 }, refreshSuggested: false }),
-      Promise.all(
-        months.map(async (m) => {
-          try {
-            return await resources.summary(m);
-          } catch {
-            return {
-              month: m,
-              expense_minor: '0',
-              income_minor: '0',
-              categories: [],
-              budget: null,
-            } as unknown as MonthSummary;
-          }
-        }),
-      ),
-    ]);
+  const diaryOpen = diary !== null && diaryView.phase === 'ready';
+  const drafts = diaryOpen ? diaryView.outbox : NO_DRAFTS;
+  useRefreshOnResolve(drafts, loaded.refresh);

-    const drafts = diary && diaryView.phase === 'ready' ? diaryView.outbox : NO_DRAFTS;
-
-    return {
-      month,
-      today,
-      summary,
-      categories,
-      records: historyResult.records,
-      drafts,
-      compare: compareList,
-      refreshSuggested: historyResult.refreshSuggested,
-    };
-  }, [resources, month, today, diary, diaryView.phase, diaryView.outbox]);
-
-  useRefreshOnResolve(diary && diaryView.phase === 'ready' ? diaryView.outbox : NO_DRAFTS, loaded.refresh);
-
-  if (loaded.state === 'loading') {
-    return { state: 'loading', reload: loaded.reload, refresh: loaded.refresh };
+  if (loaded.state === 'error') {
+    const unreachable = loaded.error instanceof V1Error && loaded.error.outcome === 'network';
+    return { state: 'error', problem: recapProblem(loaded.error, tc), offline: unreachable && diaryOpen, reload: loaded.reload };
   }
-  if (loaded.state === 'error') {
-    return {
-      state: 'error',
-      error: loaded.error,
-      problem: recapProblem(loaded.error, tc),
-      reload: loaded.reload,
-      refresh: loaded.refresh,
-    };
+  // A month step renders once before its load starts: the month before's data is never handed over as this one's.
+  if (loaded.state === 'ready' && loaded.data.month === month) {
+    return { state: 'ready', data: loaded.data, drafts, refresh: loaded.refresh };
   }
-  return {
-    state: 'ready',
-    data: loaded.data,
-    reload: loaded.reload,
-    refresh: loaded.refresh,
-  };
+  return { state: 'loading' };
 }
```

### `apps/app/src/wallet/insights/WalletInsightsScreen.tsx`

```diff
diff --git a/apps/app/src/wallet/insights/WalletInsightsScreen.tsx b/apps/app/src/wallet/insights/WalletInsightsScreen.tsx
--- a/apps/app/src/wallet/insights/WalletInsightsScreen.tsx
+++ b/apps/app/src/wallet/insights/WalletInsightsScreen.tsx
@@ -1,158 +1,145 @@
-// The Bun Wallet insights screen (P2-T31, bw-insights, wc-calendar, es-empty-insights).
-import { useEffect, useState } from 'react';
-import type { ReactElement } from 'react';
+// The Bun Wallet insights screen (P2-T31; bw-insights, wc-calendar,
+// es-empty-insights).
+//
+// - The heading, three 44 pt tabs (role tab), and on the spending and
+//   in-and-out tabs the month with `insights.monthly` as text (months only in
+//   phase 2). The calendar names the month itself, with its steps.
+// - The first tab shown, then each tab chosen, sends one insights_viewed with
+//   its InsightsTab (R61), from the tab rule.
+// - One load for every tab (useInsightsData). Loading says so. A problem says
+//   so with its title and words (recapProblem), Try again when a retry can
+//   help, and the offline banner where entries are kept on this phone. A
+//   refresh is quiet, so the tabs, the chosen day and an open tray stay.
+// - When a later history page says the diary changed, the screen says so and
+//   offers Refresh.
+// - The month is the tabs' one month; the calendar steps it.
+// - The page keeps clear of the status bar and the home indicator (the safe
+//   area), as the wallets list does.
+import { useEffect, useMemo, useState } from 'react';
+import type { ReactElement, ReactNode } from 'react';
 import { Pressable, ScrollView, View } from 'react-native';
+import { useSafeAreaInsets } from 'react-native-safe-area-context';

 import { trackInsightsViewed } from '@mobile/analytics/events';
 import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
-import { LoadingBlock, Notice } from '@mobile/screens/redesign/HistoryParts';
-import { monthLabel } from '@mobile/ui/dateStep';
+import { useMoneyLocale } from '@mobile/screens/v1/parts';
+import { calendarModel } from '@mobile/spend/v1/redesign/insights/insightsModel';
 import { monthOf, todayInBangkok } from '@mobile/spend/v1/viewModels';
+import type { OutboxCommand } from '@mobile/storage/types';
 import { useWalletColors } from '@mobile/theme/ThemeProvider';
-import { BUN_SPACE } from '@mobile/ui/layout';
+import { fullDateLabel, monthLabel } from '@mobile/ui/dateStep';
 import { SyncBanner } from '@mobile/ui/SyncBanner';
+import { COMMON_COPY } from '../common/copy';
 import { useDraftCopy } from '../copy/useDraftCopy';
+import { PrimaryButton } from '../tray/PrimaryButton';
+import { TextLink } from '../tray/TextLink';
 import { WalletText } from '../WalletText';
 import { CalendarTab } from './CalendarTab';
 import { COPY } from './copy';
 import { InOutTab } from './InOutTab';
-import { useInsightsData, type InsightsTab } from './insightsData';
+import { useInsightsData } from './insightsData';
+import type { InsightsData, InsightsTab } from './insightsData';
 import { SpendingTab } from './SpendingTab';

-const TABS: readonly { key: InsightsTab; labelKey: 'insights.tabSpending' | 'insights.tabInOut' | 'insights.tabCalendar' }[] = [
-  { key: 'spending', labelKey: 'insights.tabSpending' },
-  { key: 'in_out', labelKey: 'insights.tabInOut' },
-  { key: 'calendar', labelKey: 'insights.tabCalendar' },
+const INSIGHTS_COPY = { ...COMMON_COPY, ...COPY };
+/** bw-insights' side gutters, and the 12 pt between the status bar and the heading (its 56 pt top on a 44 pt status bar). */
+const GUTTER = 18;
+const BELOW_STATUS_BAR = 12;
+
+const TABS: readonly { tab: InsightsTab; label: 'insights.tabSpending' | 'insights.tabInOut' | 'insights.tabCalendar' }[] = [
+  { tab: 'spending', label: 'insights.tabSpending' },
+  { tab: 'in_out', label: 'insights.tabInOut' },
+  { tab: 'calendar', label: 'insights.tabCalendar' },
 ];

-export function WalletInsightsScreen(props: { now?: Date }): ReactElement {
+type ShownTabProps = { tab: InsightsTab; month: string; data: InsightsData; drafts: readonly OutboxCommand[]; onMonthChange: (month: string) => void };
+
+/** The tab shown, over one calendar of the month shown: drawn from the data read for that month, never another's. */
+function ShownTab({ tab, month, data, drafts, onMonthChange }: ShownTabProps) {
+  const tc = useCopy();
+  const locale = useMoneyLocale();
+  const dateLocale = useActiveLocale();
+  const words = useMemo(() => ({ tc, locale, fullDate: (date: string) => fullDateLabel(date, dateLocale) }), [tc, locale, dateLocale]);
+  const calendar = useMemo(() => calendarModel({ month, today: data.today, records: data.records, drafts, words }), [month, data, drafts, words]);
+  if (tab === 'in_out') return <InOutTab data={data} />;
+  // A month step unmounts the calendar while that month loads, so its chosen day starts afresh.
+  if (tab === 'calendar') return <CalendarTab data={data} calendar={calendar} onMonthChange={onMonthChange} />;
+  return <SpendingTab data={data} calendar={calendar} />;
+}
+
+export function WalletInsightsScreen({ now }: { now?: Date }): ReactElement {
   const colors = useWalletColors();
+  const insets = useSafeAreaInsets();
   const tc = useCopy();
+  const t = useDraftCopy(INSIGHTS_COPY);
   const dateLocale = useActiveLocale();
-  const t = useDraftCopy(COPY);
+  const today = todayInBangkok(now ?? new Date());
+  const [month, setMonth] = useState(() => monthOf(today));
+  const [tab, setTab] = useState<InsightsTab>('spending');
+  const load = useInsightsData(month, today);

-  const today = todayInBangkok(props.now ?? new Date());
-  const thisMonth = monthOf(today);
-  const [month, setMonth] = useState(thisMonth);
-  const [tab, setTab] = useState<InsightsTab>('spending');
-
-  // Analytics (R61): first tab shown, and each tab change, calls trackInsightsViewed({ tab })
+  // R61: the first tab shown, then each tab chosen, sends one insights_viewed.
   useEffect(() => {
     trackInsightsViewed({ tab });
   }, [tab]);

-  const load = useInsightsData(month, today);
-  const monthName = monthLabel(month, dateLocale);
+  let body: ReactNode;
+  if (load.state === 'loading') {
+    body = <WalletText role="body" tone="quietOnGround" testID="insights-loading">{tc('Loading your diary')}</WalletText>;
+  } else if (load.state === 'error') {
+    body = (
+      <View testID="insights-problem" style={{ gap: 12 }}>
+        {load.offline ? <SyncBanner state="offline" /> : null}
+        <WalletText role="h2" accessibilityRole="header">{load.problem.title}</WalletText>
+        <WalletText role="body" tone="quietOnGround">{load.problem.message}</WalletText>
+        {load.problem.retry ? <PrimaryButton label={t('common.tryAgain')} onPress={load.reload} testID="insights-try-again" /> : null}
+      </View>
+    );
+  } else {
+    body = (
+      <>
+        {load.data.refreshSuggested ? (
+          <View testID="insights-changed" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 8 }}>
+            <WalletText role="caption" tone="quietOnGround" style={{ flexShrink: 1 }}>{tc('Entries changed since you opened this list.')}</WalletText>
+            <TextLink label={tc('Refresh')} onPress={load.refresh} />
+          </View>
+        ) : null}
+        <ShownTab tab={tab} month={month} data={load.data} drafts={load.drafts} onMonthChange={setMonth} />
+      </>
+    );
+  }

   return (
     <View testID="wallet-insights-screen" style={{ flex: 1, backgroundColor: colors.ground }}>
-      <ScrollView
-        style={{ flex: 1 }}
-        contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 56, paddingBottom: 40, gap: 14 }}
-      >
-        {/* Screen Title */}
-        <WalletText style={{ fontSize: 32, fontWeight: '700', color: colors.ink, lineHeight: 40 }}>
-          {t('insights.title')}
-        </WalletText>
-
-        {/* Three 44 pt tabs (role="tab") */}
-        <View
-          accessibilityRole="tablist"
-          style={{
-            flexDirection: 'row',
-            gap: 22,
-            borderBottomWidth: 1,
-            borderBottomColor: colors.hairline,
-          }}
-        >
+      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: GUTTER, paddingTop: insets.top + BELOW_STATUS_BAR, paddingBottom: insets.bottom + 24, gap: 12 }}>
+        <WalletText role="h1" accessibilityRole="header">{t('insights.title')}</WalletText>
+        <View accessibilityRole="tablist" style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 22, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
           {TABS.map((item) => {
-            const selected = tab === item.key;
+            const selected = item.tab === tab;
             return (
               <Pressable
-                key={item.key}
+                key={item.tab}
                 accessibilityRole="tab"
                 accessibilityState={{ selected }}
-                testID={`insights-tab-${item.key}`}
-                onPress={() => setTab(item.key)}
-                style={{
-                  minHeight: 44,
-                  borderBottomWidth: selected ? 2.5 : 0,
-                  borderBottomColor: colors.ink,
-                  justifyContent: 'center',
-                  paddingHorizontal: 0,
-                }}
+                aria-selected={selected}
+                testID={`insights-tab-${item.tab}`}
+                onPress={() => setTab(item.tab)}
+                style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', borderBottomWidth: selected ? 2.5 : 0, borderBottomColor: colors.ink }}
               >
-                <WalletText
-                  style={{
-                    fontSize: 16,
-                    fontWeight: selected ? '700' : '400',
-                    color: selected ? colors.ink : colors.quiet,
-                  }}
-                >
-                  {t(item.labelKey)}
-                </WalletText>
+                <WalletText role="label" tone={selected ? 'ink' : 'quietOnGround'} style={{ fontWeight: selected ? '700' : '400' }}>{t(item.label)}</WalletText>
               </Pressable>
             );
           })}
         </View>
-
-        {/* Month and monthly text badge */}
-        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
-          <WalletText style={{ fontSize: 18, fontWeight: '700', color: colors.ink }}>
-            {monthName}
-          </WalletText>
-          <View
-            style={{
-              paddingHorizontal: 12,
-              paddingVertical: 6,
-              borderRadius: 999,
-              backgroundColor: colors.raised,
-            }}
-          >
-            <WalletText style={{ fontSize: 13, fontWeight: '500', color: colors.violet }}>
-              {t('insights.monthly')}
-            </WalletText>
+        {tab === 'calendar' ? null : (
+          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
+            <WalletText role="h2" testID="insights-month">{monthLabel(month, dateLocale)}</WalletText>
+            <View style={{ minHeight: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: colors.card, justifyContent: 'center' }}>
+              <WalletText role="caption" tone="violet" style={{ fontWeight: '500' }}>{t('insights.monthly')}</WalletText>
+            </View>
           </View>
-        </View>
-
-        {/* State handling: loading / error / ready */}
-        {load.state === 'loading' ? (
-          <View style={{ paddingVertical: 20 }}>
-            <LoadingBlock label={tc('Loading your diary')} />
-          </View>
-        ) : null}
-
-        {load.state === 'error' ? (
-          <View style={{ gap: BUN_SPACE.md, paddingVertical: 10 }}>
-            {load.error instanceof Error && load.error.message.includes('network') ? (
-              <SyncBanner state="offline" />
-            ) : null}
-            <Notice
-              tone="alert"
-              message={load.problem.message}
-              action={load.problem.retry ? { label: tc('Try again'), onPress: load.reload } : undefined}
-            />
-          </View>
-        ) : null}
-
-        {load.state === 'ready' ? (
-          <>
-            {tab === 'spending' ? (
-              <SpendingTab data={load.data} month={month} today={today} />
-            ) : null}
-            {tab === 'in_out' ? (
-              <InOutTab data={load.data} month={month} today={today} />
-            ) : null}
-            {tab === 'calendar' ? (
-              <CalendarTab
-                data={load.data}
-                month={month}
-                today={today}
-                onMonthChange={setMonth}
-              />
-            ) : null}
-          </>
-        ) : null}
+        )}
+        {body}
       </ScrollView>
     </View>
   );
```

### `apps/app/src/wallet/insights/SpendingTab.tsx`

```diff
diff --git a/apps/app/src/wallet/insights/SpendingTab.tsx b/apps/app/src/wallet/insights/SpendingTab.tsx
--- a/apps/app/src/wallet/insights/SpendingTab.tsx
+++ b/apps/app/src/wallet/insights/SpendingTab.tsx
@@ -1,15 +1,32 @@
-import type { Minor } from '@gogospend/contracts';
+// The spending tab (P2-T31; bw-insights, es-empty-insights; W9, W24, R65, R71).
+//
+// - The month's money out at 36 in the wallet's money text (W9), with the
+//   kit's `i` IconButton that explains the number in a tray, and, for this
+//   month, the days left with today counted (bw-insights: 8 on Saturday 24
+//   October). A month gone by has no days left to count, so it has no line.
+// - MonthBars: six months from compareBars, the budget line on their scale.
+// - The early state (es-empty-insights): fewer than 3 logged days shows the
+//   early lines, each logged day by its date (dateStep), the next day to log,
+//   `insights.noPrevious` when no earlier month has any money out, and the
+//   categories so far.
+// - The categories: the month's totals from its summary, in topCategories'
+//   order, each with the count of the month's live expenses in it, opening
+//   History filtered to it (R71).
 import { useRouter } from 'expo-router';
-import { useMemo, useState } from 'react';
+import { useState } from 'react';
 import type { ReactElement } from 'react';
 import { Pressable, View } from 'react-native';
+import Svg, { Circle, Path } from 'react-native-svg';

 import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
-import { daysInMonth } from '@mobile/spend/v1/redesign/shared';
+import { useMoneyLocale } from '@mobile/screens/v1/parts';
+import type { CalendarDay, CalendarModel } from '@mobile/spend/v1/redesign/insights/insightsModel';
 import { compareBars, topCategories } from '@mobile/spend/v1/redesign/insights/recapModel';
-import { calendarModel } from '@mobile/spend/v1/redesign/insights/insightsModel';
 import { monthOf } from '@mobile/spend/v1/viewModels';
 import { useWalletColors } from '@mobile/theme/ThemeProvider';
+import { DECORATIVE } from '@mobile/ui/a11y';
+import { shortDateLabel } from '@mobile/ui/dateStep';
+import { IconButton } from '../controls/IconButton';
 import { useDraftCopy } from '../copy/useDraftCopy';
 import { WalletCategoryIcon } from '../looks/WalletCategoryIcon';
 import { WalletAmount } from '../money/WalletAmount';
@@ -17,271 +34,118 @@
 import { WalletText } from '../WalletText';
 import { COPY } from './copy';
 import { InfoTray } from './InfoTray';
+import { isMoneyOut, unknownCategory } from './insightsData';
 import type { InsightsData } from './insightsData';
 import { MonthBars } from './MonthBars';

-export function SpendingTab({
-  data,
-  month,
-  today,
-}: {
-  data: InsightsData;
-  month: string;
-  today: string;
-}): ReactElement {
+/** The chart compares once this many days are logged (`insights.earlyBody`). */
+export const EARLY_DAYS = 3;
+
+function InfoGlyph({ color }: { color: string }) {
+  return (
+    <View {...DECORATIVE}>
+      <Svg width={24} height={24} viewBox="0 0 24 24">
+        <Circle cx={12} cy={12} r={9} fill="none" stroke={color} strokeWidth={1.6} />
+        <Path d="M12 11v5" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
+        <Circle cx={12} cy={7.8} r={1.2} fill={color} />
+      </Svg>
+    </View>
+  );
+}
+
+/** Fewer than three logged days: what the chart needs, and the days logged so far by their dates. */
+function EarlyState({ logged, today }: { logged: readonly CalendarDay[]; today: string }) {
+  const colors = useWalletColors();
+  const t = useDraftCopy(COPY);
+  const dateLocale = useActiveLocale();
+  return (
+    <View testID="insights-early-state" style={{ backgroundColor: colors.card, borderRadius: 20, padding: 16, gap: 12 }}>
+      <View style={{ gap: 2 }}>
+        <WalletText role="label" accessibilityRole="header" style={{ fontWeight: '700' }}>{t('insights.earlyTitle', { n: EARLY_DAYS - logged.length })}</WalletText>
+        <WalletText role="caption" tone="quiet">{t('insights.earlyBody')}</WalletText>
+      </View>
+      <View style={{ flexDirection: 'row', gap: 6 }}>
+        {Array.from({ length: EARLY_DAYS }, (_, index) => {
+          const day = logged[index];
+          return (
+            <View key={index} testID={`insights-early-day-${index}`} style={{ flex: 1, gap: 4 }}>
+              <View {...DECORATIVE} style={{ height: 6, borderRadius: 3, backgroundColor: day ? colors.ink : colors.track }} />
+              <WalletText role="caption" tone={day ? 'ink' : 'quiet'}>{day ? shortDateLabel(day.date, today, dateLocale) : t('insights.nextDay')}</WalletText>
+            </View>
+          );
+        })}
+      </View>
+    </View>
+  );
+}
+
+export function SpendingTab({ data, calendar }: { data: InsightsData; calendar: CalendarModel }): ReactElement {
   const router = useRouter();
   const colors = useWalletColors();
   const tc = useCopy();
+  const t = useDraftCopy(COPY);
+  const locale = useMoneyLocale();
   const dateLocale = useActiveLocale();
-  const t = useDraftCopy(COPY);
   const { hidden } = usePrivateMode();
-  const [infoOpen, setInfoOpen] = useState(false);
-
-  const spentMinor = data.summary?.expense_minor ?? '0';
-  const currentMonth = monthOf(today);
-  const isCurrentMonth = month === currentMonth;
-
-  // Days left calculation
-  const totalDays = daysInMonth(month);
-  const todayDayNum = isCurrentMonth ? Number.parseInt(today.slice(8), 10) : totalDays;
-  const daysLeft = Math.max(0, totalDays - todayDayNum);
-
-  // Calendar model to check days logged
-  const words = useMemo(
-    () => ({
-      tc,
-      locale: 'th' as const,
-      fullDate: (date: string) => date,
-    }),
-    [tc],
-  );
-
-  const cal = useMemo(
-    () =>
-      calendarModel({
-        month,
-        today,
-        records: data.records,
-        drafts: data.drafts,
-        words,
-      }),
-    [month, today, data.records, data.drafts, words],
-  );
-
-  const daysLogged = cal.daysLogged;
-  const isEarly = daysLogged < 3;
-
-  // Compare bars for MonthBars
-  const bars = useMemo(() => {
-    const monthSpends = data.compare.map((s) => ({
-      month: s.month,
-      expenseMinor: s.expense_minor,
-    }));
-    return compareBars(monthSpends, {
-      shown: month,
-      today,
-      tc,
-      locale: 'th',
-      dateLocale,
-    });
-  }, [data.compare, month, today, tc, dateLocale]);
-
-  // Top categories
-  const categoriesList = useMemo(() => {
-    let categoryTotals = data.summary?.categories ?? [];
-    if (categoryTotals.length === 0 && data.records.length > 0) {
-      const sumByCat = new Map<string, bigint>();
-      for (const r of data.records) {
-        if (!r.deleted_at && r.type === 'expense' && r.category_id) {
-          sumByCat.set(r.category_id, (sumByCat.get(r.category_id) ?? 0n) + BigInt(r.amount_minor));
-        }
-      }
-      categoryTotals = [...sumByCat.entries()].map(([category_id, total]) => ({
-        category_id,
-        type: 'expense' as const,
-        total_minor: total.toString() as Minor,
-      }));
-    }
-    return topCategories(categoryTotals, data.categories, tc, 'th');
-  }, [data.summary?.categories, data.records, data.categories, tc]);
-
-  // Count active transactions per category from records
-  const categoryCounts = useMemo(() => {
-    const counts = new Map<string, number>();
-    for (const record of data.records) {
-      if (record.deleted_at === null && record.type === 'expense' && record.category_id) {
-        counts.set(record.category_id, (counts.get(record.category_id) ?? 0) + 1);
-      }
-    }
-    return counts;
-  }, [data.records]);
-
-  // Check if earlier months exist for early state
-  const hasEarlierMonth = data.compare.some(
-    (m) => m.month < month && BigInt(m.expense_minor) > 0n,
-  );
+  const [explaining, setExplaining] = useState(false);
+  const { month, today, summary } = data;
+  // Today is counted, as W9 counts the days left.
+  const daysLeft = calendar.days.filter((day) => day.date >= today).length;
+  const logged = calendar.days.filter((day) => day.logged);
+  const early = logged.length < EARLY_DAYS;
+  const bars = compareBars(data.compare, { shown: month, today, tc, locale, dateLocale });
+  const earlier = data.compare.some((other) => other.month < month && BigInt(other.expenseMinor) > 0n);
+  const top = topCategories(summary.categories, data.categories, tc, locale);
+  const byId = new Map(data.categories.map((category) => [category.id, category]));

   return (
-    <View style={{ gap: 14 }}>
-      {/* Spent amount at 36 with Info button */}
-      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
-        <WalletAmount minor={spentMinor} size={36} testID="spending-hero-amount" />
-        <Pressable
-          accessibilityRole="button"
-          accessibilityLabel={t('insights.whatIsThis')}
-          testID="spending-info-button"
-          onPress={() => setInfoOpen(true)}
-          style={{
-            width: 44,
-            height: 44,
-            borderRadius: 22,
-            alignItems: 'center',
-            justifyContent: 'center',
-          }}
-        >
-          <View
-            style={{
-              width: 28,
-              height: 28,
-              borderRadius: 14,
-              borderWidth: 1.5,
-              borderColor: colors.quiet,
-              alignItems: 'center',
-              justifyContent: 'center',
-            }}
-          >
-            <WalletText style={{ fontSize: 14, fontWeight: '700', color: colors.quiet }}>i</WalletText>
-          </View>
-        </Pressable>
-      </View>
-
-      {/* Days left in month */}
-      <WalletText style={{ fontSize: 14, color: colors.quiet, marginTop: -4 }}>
-        {t('insights.daysToEnd', { n: daysLeft })}
-      </WalletText>
-
-      {/* Chart: Early state or MonthBars */}
-      {isEarly ? (
-        <View
-          testID="insights-early-state"
-          style={{
-            backgroundColor: colors.card,
-            borderRadius: 20,
-            padding: 16,
-            gap: 12,
-          }}
-        >
-          <View style={{ gap: 4 }}>
-            <WalletText style={{ fontSize: 16, fontWeight: '700', color: colors.ink }}>
-              {t('insights.earlyTitle', { n: 3 - daysLogged })}
-            </WalletText>
-            <WalletText style={{ fontSize: 14, color: colors.quiet, lineHeight: 20 }}>
-              {t('insights.earlyBody')}
-            </WalletText>
-          </View>
-
-          {/* Progress segments: 3 days */}
-          <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
-            {[0, 1, 2].map((idx) => {
-              const filled = idx < daysLogged;
-              return (
-                <View key={idx} style={{ flex: 1, gap: 4 }}>
-                  <View
-                    style={{
-                      height: 6,
-                      borderRadius: 3,
-                      backgroundColor: filled ? colors.ink : colors.raised,
-                    }}
-                  />
-                  <WalletText
-                    style={{
-                      fontSize: 12,
-                      color: filled ? colors.ink : colors.quiet,
-                      textAlign: 'center',
-                    }}
-                  >
-                    {filled ? `${today.slice(8)} ${month.slice(5)}` : t('insights.nextDay')}
-                  </WalletText>
-                </View>
-              );
-            })}
-          </View>
+    <View testID="spending-tab" style={{ gap: 12 }}>
+      <View style={{ gap: 2 }}>
+        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
+          <WalletAmount minor={summary.expense_minor} size={36} testID="spending-hero-amount" />
+          <IconButton label={t('insights.whatIsThis')} onPress={() => setExplaining(true)}>
+            <InfoGlyph color={colors.quiet} />
+          </IconButton>
         </View>
-      ) : (
-        <MonthBars
-          bars={bars}
-          budgetMinor={data.summary?.budget?.overall_limit_minor ?? null}
-          hidden={hidden}
-        />
-      )}
-
-      {/* Categories header and list */}
-      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
-        <WalletText style={{ fontSize: 17, fontWeight: '700', color: colors.ink }}>
-          {t('insights.categories')}
-        </WalletText>
-        {isEarly && !hasEarlierMonth ? (
-          <WalletText style={{ fontSize: 13, color: colors.quiet }}>
-            {t('insights.noPrevious')}
-          </WalletText>
+        {month === monthOf(today) ? (
+          <WalletText role="label" tone="quietOnGround" testID="spending-days-left">{t('insights.daysToEnd', { n: daysLeft })}</WalletText>
         ) : null}
       </View>

-      <View
-        style={{
-          backgroundColor: colors.card,
-          borderRadius: 20,
-          paddingHorizontal: 14,
-          paddingVertical: 2,
-        }}
-      >
-        {categoriesList.map((cat, idx) => {
-          const categoryObj = data.categories.find((c) => c.id === cat.categoryId);
-          const count = categoryCounts.get(cat.categoryId) ?? 1;
-          const isLast = idx === categoriesList.length - 1;
+      {early ? (
+        <EarlyState logged={logged} today={today} />
+      ) : (
+        <MonthBars bars={bars} budgetMinor={summary.budget?.overall_limit_minor ?? null} hidden={hidden} />
+      )}

-          return (
+      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 8 }}>
+        <WalletText role="h2" accessibilityRole="header">{t(early ? 'insights.soFar' : 'insights.categories')}</WalletText>
+        {early && !earlier ? <WalletText role="caption" tone="quietOnGround" testID="insights-no-previous">{t('insights.noPrevious')}</WalletText> : null}
+      </View>
+      {top.length > 0 ? (
+        <View testID="insights-categories" style={{ backgroundColor: colors.card, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 2 }}>
+          {top.map((item, index) => (
             <Pressable
-              key={cat.categoryId}
+              key={item.categoryId}
               accessibilityRole="link"
-              testID={`category-row-${cat.categoryId}`}
-              onPress={() => router.push({ pathname: '/spend/all', params: { category: cat.categoryId } })}
-              style={{
-                flexDirection: 'row',
-                alignItems: 'center',
-                gap: 12,
-                paddingVertical: 10,
-                borderBottomWidth: isLast ? 0 : 1,
-                borderBottomColor: colors.hairline,
-              }}
+              testID={`category-row-${item.categoryId}`}
+              onPress={() => router.push({ pathname: '/spend/all', params: { category: item.categoryId } })}
+              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 9, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.hairline }}
             >
-              {categoryObj ? (
-                <WalletCategoryIcon category={categoryObj} name={cat.name} size={36} />
-              ) : (
-                <View
-                  style={{
-                    width: 36,
-                    height: 36,
-                    borderRadius: 11,
-                    backgroundColor: colors.raised,
-                  }}
-                />
-              )}
-              <View style={{ flex: 1 }}>
-                <WalletText style={{ fontSize: 15, fontWeight: '500', color: colors.ink }}>
-                  {cat.name}
-                </WalletText>
-                <WalletText style={{ fontSize: 12, color: colors.quiet }}>
-                  {t('insights.entries', { count })}
+              <WalletCategoryIcon category={byId.get(item.categoryId) ?? unknownCategory(item.categoryId)} name={item.name} size={36} />
+              <View style={{ flex: 1, minWidth: 0 }}>
+                <WalletText role="label">{item.name}</WalletText>
+                <WalletText role="caption" tone="quiet">
+                  {t('insights.entries', { count: data.records.filter((record) => isMoneyOut(record) && record.category_id === item.categoryId).length })}
                 </WalletText>
               </View>
-              <WalletAmount minor={cat.minor} size={16} />
+              <WalletAmount minor={item.minor} size={16} />
             </Pressable>
-          );
-        })}
-      </View>
+          ))}
+        </View>
+      ) : null}

-      <InfoTray visible={infoOpen} onClose={() => setInfoOpen(false)} />
+      <InfoTray visible={explaining} onClose={() => setExplaining(false)} />
     </View>
   );
 }
```

### `apps/app/src/wallet/insights/MonthBars.tsx`

```diff
diff --git a/apps/app/src/wallet/insights/MonthBars.tsx b/apps/app/src/wallet/insights/MonthBars.tsx
--- a/apps/app/src/wallet/insights/MonthBars.tsx
+++ b/apps/app/src/wallet/insights/MonthBars.tsx
@@ -1,148 +1,111 @@
-// The Bun Wallet 6-month compare bars chart (P2-T31, bw-insights, W4, W24).
-// Drawn using react-native-svg: barPast for past months, barNow for this month,
-// dashed guideLine for the budget line. One accessible element with spoken label.
+// The six months' bars (P2-T31, bw-insights; W4, W9, W24, R65).
+//
+// - react-native-svg (W4): past months in `barPast`, this month in `barNow`,
+//   and the dashed `guideLine` at the month's budget (W24).
+// - One scale from one baseline for the bars and the line: the taller of the
+//   largest month and the budget reaches the top, so a month under budget
+//   stands below the line by its true share. Exact integer maths on satang;
+//   only the drawn height, a whole number of units, is a JS number.
+// - One accessible element named `insights.chartName` that reads each bar's
+//   `compareBars().spoken`, or in private mode only the name and the months
+//   (R65). The budget label is the wallet's money text (W9), ฿•••• in private
+//   mode. The months under the bars are dateStep's short names (พ.ค.).
 import type { Minor } from '@gogospend/contracts';
-import { useMemo } from 'react';
 import type { ReactElement } from 'react';
 import { View } from 'react-native';
 import Svg, { Line, Rect } from 'react-native-svg';

 import { useActiveLocale } from '@mobile/i18n/useCopy';
-import { formatMinor } from '@mobile/spend/v1/money';
-import { compareBars, type CompareBar } from '@mobile/spend/v1/redesign/insights/recapModel';
-import { monthLabel } from '@mobile/ui/dateStep';
+import type { CompareBar } from '@mobile/spend/v1/redesign/insights/recapModel';
 import { useWalletColors } from '@mobile/theme/ThemeProvider';
+import { monthLabel, monthShortLabel } from '@mobile/ui/dateStep';
 import { useDraftCopy } from '../copy/useDraftCopy';
+import { HIDDEN_AMOUNT, walletMoneyText } from '../money/walletMoney';
 import { WalletText } from '../WalletText';
 import { COPY } from './copy';

-export function MonthBars(props: {
-  bars: readonly CompareBar[];
-  budgetMinor: Minor | null;
-  hidden: boolean;
-}): ReactElement {
-  const { bars, budgetMinor, hidden } = props;
+/** The charts' drawing box: their bars stand on `baseline` and reach at most `rise` above it. */
+export const CHART = { width: 300, height: 140, baseline: 130, rise: 110 } as const;
+/** A month with money out never draws flat. */
+const MIN_RISE = 3;
+
+/** How far above the baseline `minor` reaches when `ceiling` (never below `minor`) reaches the full rise. */
+export function riseOf(minor: Minor, ceiling: bigint): number {
+  const value = BigInt(minor);
+  if (value <= 0n) return 0;
+  const rise = Number((value * BigInt(CHART.rise)) / ceiling);
+  return rise < MIN_RISE ? MIN_RISE : rise;
+}
+
+/** The larger of two exact amounts. */
+export function larger(a: bigint, b: bigint): bigint {
+  return a > b ? a : b;
+}
+
+export function MonthBars({ bars, budgetMinor, hidden }: { bars: readonly CompareBar[]; budgetMinor: Minor | null; hidden: boolean }): ReactElement {
   const colors = useWalletColors();
   const dateLocale = useActiveLocale();
   const t = useDraftCopy(COPY);
-
-  const fromMonth = bars.length > 0 ? monthLabel(bars[0].month, dateLocale) : '';
-  const toMonth = bars.length > 0 ? monthLabel(bars[bars.length - 1].month, dateLocale) : '';
-  const chartName = t('insights.chartName', { from: fromMonth, to: toMonth });
-
-  const spokenLabel = useMemo(() => {
-    if (hidden) {
-      // In private mode: only the chart's name and the months, with no amount (R65).
-      return `${chartName}: ${bars.map((b) => b.label).join(', ')}`;
-    }
-    return `${chartName}: ${bars.map((b) => b.spoken).join(', ')}`;
-  }, [hidden, chartName, bars]);
-
-  // Compute budget y position relative to the bars' scale
-  const budgetLineY = useMemo(() => {
-    if (!budgetMinor || BigInt(budgetMinor) <= 0n) return null;
-    const maxVal = bars.reduce((top, b) => (BigInt(b.minor) > top ? BigInt(b.minor) : top), 0n);
-    const ceiling = BigInt(budgetMinor) > maxVal ? BigInt(budgetMinor) : maxVal;
-    if (ceiling === 0n) return 100;
-    const ratio = Number((BigInt(budgetMinor) * 1000n) / ceiling) / 1000;
-    // Map ratio 0..1 to SVG y 125..20 (higher value = smaller y)
-    return Math.round(125 - ratio * 105);
-  }, [bars, budgetMinor]);
-
+  // A budget's limit is always above zero (the contract's rule), so a month with one has a line.
+  const budget = budgetMinor;
+  // One scale for the bars and the line: the taller of the largest month and the budget is the top.
+  const ceiling = bars.reduce((top, bar) => larger(top, BigInt(bar.minor)), budget === null ? 0n : BigInt(budget));
+  const name = t('insights.chartName', { from: monthLabel(bars[0].month, dateLocale), to: monthLabel(bars[bars.length - 1].month, dateLocale) });
+  const spoken = `${name}: ${bars.map((bar) => (hidden ? bar.label : bar.spoken)).join(', ')}`;
   return (
     <View
-      accessible={true}
+      accessible
       accessibilityRole="image"
-      accessibilityLabel={spokenLabel}
+      accessibilityLabel={spoken}
       testID="insights-month-bars"
-      style={{
-        position: 'relative',
-        backgroundColor: colors.card,
-        borderRadius: 20,
-        padding: 16,
-      }}
+      style={{ backgroundColor: colors.card, borderRadius: 20, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, gap: 6 }}
     >
-      {budgetMinor && BigInt(budgetMinor) > 0n ? (
-        <WalletText
-          aria-hidden={true}
-          style={{
-            position: 'absolute',
-            right: 16,
-            top: 14,
-            fontSize: 11,
-            color: colors.quiet,
-          }}
-        >
-          {t('insights.budget', {
-            amount: hidden ? '฿••••' : formatMinor(budgetMinor, 'th'),
-          })}
+      {budget !== null ? (
+        <WalletText role="caption" tone="quiet" testID="insights-budget-label" style={{ alignSelf: 'flex-end' }}>
+          {t('insights.budget', { amount: hidden ? HIDDEN_AMOUNT : walletMoneyText(budget) })}
         </WalletText>
       ) : null}
-
-      <Svg width="100%" height={140} viewBox="0 0 300 140" aria-hidden={true}>
-        {budgetLineY !== null ? (
+      <Svg width="100%" height={CHART.height} viewBox={`0 0 ${CHART.width} ${CHART.height}`}>
+        {budget !== null ? (
           <Line
-            x1="8"
-            y1={budgetLineY}
-            x2="292"
-            y2={budgetLineY}
+            testID="budget-guideline"
+            x1={8}
+            x2={CHART.width - 8}
+            y1={CHART.baseline - riseOf(budget, ceiling)}
+            y2={CHART.baseline - riseOf(budget, ceiling)}
             stroke={colors.guideLine}
-            strokeWidth="1.5"
+            strokeWidth={1.5}
             strokeDasharray="4 4"
-            testID="budget-guideline"
           />
         ) : null}
-
         {bars.map((bar, index) => {
-          const barWidth = 32;
-          const spacing = 16;
-          const x = 12 + index * (barWidth + spacing);
-          const barHeight = Math.max(6, Math.round((bar.permille / 1000) * 105));
-          const y = 130 - barHeight;
-          const fill = bar.current ? colors.barNow : colors.barPast;
-
+          const rise = riseOf(bar.minor, ceiling);
           return (
             <Rect
               key={bar.month}
-              x={x}
-              y={y}
-              width={barWidth}
-              height={barHeight}
+              testID={`month-bar-${bar.month}`}
+              x={14 + index * 48}
+              y={CHART.baseline - rise}
+              width={32}
+              height={rise}
               rx={8}
-              ry={8}
-              fill={fill}
-              testID={`month-bar-${bar.month}`}
+              fill={bar.current ? colors.barNow : colors.barPast}
             />
           );
         })}
       </Svg>
-
-      <View
-        aria-hidden={true}
-        style={{
-          flexDirection: 'row',
-          justifyContent: 'space-between',
-          marginTop: 6,
-          paddingHorizontal: 12,
-        }}
-      >
-        {bars.map((bar) => {
-          const shortName = monthLabel(bar.month, dateLocale).slice(0, 4);
-          return (
-            <WalletText
-              key={bar.month}
-              style={{
-                fontSize: 12,
-                color: bar.current ? colors.ink : colors.quiet,
-                fontWeight: bar.current ? '700' : '400',
-                textAlign: 'center',
-                width: 32,
-              }}
-            >
-              {shortName}
-            </WalletText>
-          );
-        })}
+      <View style={{ flexDirection: 'row' }}>
+        {bars.map((bar) => (
+          <WalletText
+            key={bar.month}
+            role="caption"
+            tone={bar.current ? 'ink' : 'quiet'}
+            testID={`month-name-${bar.month}`}
+            style={{ flex: 1, textAlign: 'center', fontWeight: bar.current ? '700' : '400' }}
+          >
+            {monthShortLabel(bar.month, dateLocale)}
+          </WalletText>
+        ))}
       </View>
     </View>
   );
```

### `apps/app/src/wallet/insights/InOutTab.tsx`

```diff
diff --git a/apps/app/src/wallet/insights/InOutTab.tsx b/apps/app/src/wallet/insights/InOutTab.tsx
--- a/apps/app/src/wallet/insights/InOutTab.tsx
+++ b/apps/app/src/wallet/insights/InOutTab.tsx
@@ -1,198 +1,116 @@
-// In & Out tab of Bun Wallet insights (P2-T31, W21).
-// Money in (violet, plus), money out (ink), kept/short from keptOf, six paired bars.
-import { useMemo } from 'react';
+// The in-and-out tab (P2-T31, W21: no board, a draft for E2-C).
+//
+// - The month's money in (violet, with a plus) and money out (ink), in the
+//   wallet's money text (W9).
+// - What was kept, or how much more went out, as a sentence from keptOf's
+//   kind. Private mode masks the amount, never the sentence (W10).
+// - Six paired bars on one scale, money in (violet) beside money out (ink).
+//   One accessible element named `insights.inOutName` that reads each month's
+//   money in and out, or in private mode only the name and the months (R65).
+import type { MonthSummary } from '@gogospend/contracts';
+import { Fragment } from 'react';
 import type { ReactElement } from 'react';
 import { View } from 'react-native';
-import Svg, { G, Rect } from 'react-native-svg';
+import Svg, { Rect } from 'react-native-svg';

 import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
+import { useMoneyLocale } from '@mobile/screens/v1/parts';
+import { formatMinor } from '@mobile/spend/v1/money';
 import { keptOf } from '@mobile/spend/v1/redesign/insights/recapModel';
-import { monthLabel } from '@mobile/ui/dateStep';
+import type { Kept } from '@mobile/spend/v1/redesign/insights/recapModel';
+import type { Translate } from '@mobile/spend/v1/redesign/shared';
 import { useWalletColors } from '@mobile/theme/ThemeProvider';
+import { monthLabel, monthShortLabel } from '@mobile/ui/dateStep';
+import type { WalletT } from '../copy/draftText';
 import { useDraftCopy } from '../copy/useDraftCopy';
 import { WalletAmount } from '../money/WalletAmount';
+import { HIDDEN_AMOUNT, walletMoneyText } from '../money/walletMoney';
 import { usePrivateMode } from '../privacy/PrivateModeProvider';
 import { WalletText } from '../WalletText';
 import { COPY } from './copy';
-import type { InsightsData } from './insightsData';
+import type { CompareMonth, InsightsData } from './insightsData';
+import { CHART, larger, riseOf } from './MonthBars';

-export function InOutTab({
-  data,
-  month,
-  today,
-}: {
-  data: InsightsData;
-  month: string;
-  today: string;
-}): ReactElement {
+/** "เก็บได้ ฿21,027.50", "จ่ายออกมากกว่ารับเข้า ฿1,200" or the even line, with the amount masked in private mode. */
+function keptLine(kept: Kept, hidden: boolean, t: WalletT, tc: Translate): string {
+  if (kept.kind === 'even') return kept.text;
+  // A short month's difference is below zero; the money text with no sign draws its size.
+  const amount = hidden ? HIDDEN_AMOUNT : walletMoneyText(kept.minor);
+  return kept.kind === 'kept' ? t('insights.kept', { amount }) : tc('{amount} more went out than came in', { amount });
+}
+
+function PairedBars({ compare, month, hidden }: { compare: readonly CompareMonth[]; month: string; hidden: boolean }) {
   const colors = useWalletColors();
-  const tc = useCopy();
+  const t = useDraftCopy(COPY);
   const dateLocale = useActiveLocale();
-  const t = useDraftCopy(COPY);
-  const { hidden } = usePrivateMode();
-
-  const incomeMinor = data.summary?.income_minor ?? '0';
-  const expenseMinor = data.summary?.expense_minor ?? '0';
-
-  const kept = useMemo(
-    () => keptOf(incomeMinor, expenseMinor, tc, 'th'),
-    [incomeMinor, expenseMinor, tc],
-  );
-
-  // Maximum value among all months' income and expense for chart scaling
-  const maxMinor = useMemo(() => {
-    let top = 0n;
-    for (const s of data.compare) {
-      const inc = BigInt(s.income_minor);
-      const exp = BigInt(s.expense_minor);
-      if (inc > top) top = inc;
-      if (exp > top) top = exp;
-    }
-    return top === 0n ? 1n : top;
-  }, [data.compare]);
-
+  const locale = useMoneyLocale();
+  const ceiling = compare.reduce((top, other) => larger(larger(top, BigInt(other.incomeMinor)), BigInt(other.expenseMinor)), 0n);
+  const name = t('insights.inOutName', { from: monthLabel(compare[0].month, dateLocale), to: monthLabel(compare[compare.length - 1].month, dateLocale) });
+  const months = compare.map((other) => (hidden
+    ? monthLabel(other.month, dateLocale)
+    : t('insights.inOutMonth', { month: monthLabel(other.month, dateLocale), in: formatMinor(other.incomeMinor, locale), out: formatMinor(other.expenseMinor, locale) })));
   return (
-    <View testID="in-out-tab" style={{ gap: 14 }}>
-      {/* Cards for Money In and Money Out */}
-      <View style={{ flexDirection: 'row', gap: 12 }}>
-        {/* Money In: violet, plus */}
-        <View
-          style={{
-            flex: 1,
-            backgroundColor: colors.card,
-            borderRadius: 20,
-            padding: 16,
-            gap: 6,
-          }}
-        >
-          <WalletText style={{ fontSize: 13, color: colors.quiet }}>
-            {t('insights.moneyIn')}
+    <View
+      accessible
+      accessibilityRole="image"
+      accessibilityLabel={`${name}: ${months.join(', ')}`}
+      testID="in-out-paired-bars"
+      style={{ backgroundColor: colors.card, borderRadius: 20, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, gap: 6 }}
+    >
+      <Svg width="100%" height={CHART.height} viewBox={`0 0 ${CHART.width} ${CHART.height}`}>
+        {compare.map((other, index) => {
+          const x = 14 + index * 48;
+          const inRise = riseOf(other.incomeMinor, ceiling);
+          const outRise = riseOf(other.expenseMinor, ceiling);
+          return (
+            <Fragment key={other.month}>
+              <Rect testID={`paired-in-${other.month}`} x={x} y={CHART.baseline - inRise} width={15} height={inRise} rx={4} fill={colors.violet} />
+              <Rect testID={`paired-out-${other.month}`} x={x + 17} y={CHART.baseline - outRise} width={15} height={outRise} rx={4} fill={colors.barNow} />
+            </Fragment>
+          );
+        })}
+      </Svg>
+      <View style={{ flexDirection: 'row' }}>
+        {compare.map((other) => (
+          <WalletText
+            key={other.month}
+            role="caption"
+            tone={other.month === month ? 'ink' : 'quiet'}
+            style={{ flex: 1, textAlign: 'center', fontWeight: other.month === month ? '700' : '400' }}
+          >
+            {monthShortLabel(other.month, dateLocale)}
           </WalletText>
-          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
-            <WalletText style={{ fontSize: 28, fontWeight: '700', color: colors.violet }}>
-              +
-            </WalletText>
-            <WalletAmount minor={incomeMinor} size={28} tone="violet" />
-          </View>
-        </View>
-
-        {/* Money Out: ink */}
-        <View
-          style={{
-            flex: 1,
-            backgroundColor: colors.card,
-            borderRadius: 20,
-            padding: 16,
-            gap: 6,
-          }}
-        >
-          <WalletText style={{ fontSize: 13, color: colors.quiet }}>
-            {t('insights.moneyOut')}
-          </WalletText>
-          <WalletAmount minor={expenseMinor} size={28} tone="ink" />
-        </View>
-      </View>
-
-      {/* Kept or short banner */}
-      <View
-        style={{
-          backgroundColor: colors.card,
-          borderRadius: 16,
-          paddingHorizontal: 16,
-          paddingVertical: 12,
-        }}
-      >
-        <WalletText style={{ fontSize: 14, color: colors.ink }}>
-          {hidden ? '฿••••' : kept.text}
-        </WalletText>
-      </View>
-
-      {/* Six paired bars */}
-      <View
-        accessible={true}
-        accessibilityRole="image"
-        testID="in-out-paired-bars"
-        style={{
-          backgroundColor: colors.card,
-          borderRadius: 20,
-          padding: 16,
-        }}
-      >
-        <Svg width="100%" height={140} viewBox="0 0 300 140" aria-hidden={true}>
-          {data.compare.map((s, index) => {
-            const pairWidth = 36;
-            const barWidth = 14;
-            const gap = 4;
-            const spacing = 12;
-            const x = 8 + index * (pairWidth + spacing);
-
-            const incRatio = Number((BigInt(s.income_minor) * 1000n) / maxMinor) / 1000;
-            const expRatio = Number((BigInt(s.expense_minor) * 1000n) / maxMinor) / 1000;
-
-            const incHeight = Math.max(4, Math.round(incRatio * 110));
-            const expHeight = Math.max(4, Math.round(expRatio * 110));
-
-            const isCurrent = s.month === month;
-
-            return (
-              <G key={s.month}>
-                {/* Money In bar: violet */}
-                <Rect
-                  x={x}
-                  y={130 - incHeight}
-                  width={barWidth}
-                  height={incHeight}
-                  rx={4}
-                  ry={4}
-                  fill={colors.violet}
-                  testID={`paired-in-${s.month}`}
-                />
-                {/* Money Out bar: ink/barNow for current, barPast for others */}
-                <Rect
-                  x={x + barWidth + gap}
-                  y={130 - expHeight}
-                  width={barWidth}
-                  height={expHeight}
-                  rx={4}
-                  ry={4}
-                  fill={isCurrent ? colors.barNow : colors.barPast}
-                  testID={`paired-out-${s.month}`}
-                />
-              </G>
-            );
-          })}
-        </Svg>
-
-        {/* Month labels */}
-        <View
-          aria-hidden={true}
-          style={{
-            flexDirection: 'row',
-            justifyContent: 'space-between',
-            marginTop: 6,
-            paddingHorizontal: 8,
-          }}
-        >
-          {data.compare.map((s) => {
-            const shortName = monthLabel(s.month, dateLocale).slice(0, 4);
-            const isCurrent = s.month === month;
-            return (
-              <WalletText
-                key={s.month}
-                style={{
-                  fontSize: 12,
-                  color: isCurrent ? colors.ink : colors.quiet,
-                  fontWeight: isCurrent ? '700' : '400',
-                  textAlign: 'center',
-                  width: 36,
-                }}
-              >
-                {shortName}
-              </WalletText>
-            );
-          })}
-        </View>
+        ))}
       </View>
     </View>
   );
 }
+
+export function InOutTab({ data }: { data: InsightsData }): ReactElement {
+  const colors = useWalletColors();
+  const tc = useCopy();
+  const t = useDraftCopy(COPY);
+  const locale = useMoneyLocale();
+  const { hidden } = usePrivateMode();
+  const summary: MonthSummary = data.summary;
+  const kept = keptOf(summary.income_minor, summary.expense_minor, tc, locale);
+  const card = { flexGrow: 1, flexBasis: 140, backgroundColor: colors.card, borderRadius: 20, padding: 16, gap: 4 } as const;
+  return (
+    <View testID="in-out-tab" style={{ gap: 12 }}>
+      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
+        <View style={card}>
+          <WalletText role="caption" tone="quiet">{t('insights.moneyIn')}</WalletText>
+          <WalletAmount minor={summary.income_minor} sign="income" size={28} testID="in-out-income" />
+        </View>
+        <View style={card}>
+          <WalletText role="caption" tone="quiet">{t('insights.moneyOut')}</WalletText>
+          <WalletAmount minor={summary.expense_minor} size={28} testID="in-out-expense" />
+        </View>
+      </View>
+      <View style={{ backgroundColor: colors.card, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 }}>
+        <WalletText role="label" testID="in-out-kept">{keptLine(kept, hidden, t, tc)}</WalletText>
+      </View>
+      <PairedBars compare={data.compare} month={data.month} hidden={hidden} />
+    </View>
+  );
+}
```

### `apps/app/src/wallet/insights/CalendarTab.tsx`

```diff
diff --git a/apps/app/src/wallet/insights/CalendarTab.tsx b/apps/app/src/wallet/insights/CalendarTab.tsx
--- a/apps/app/src/wallet/insights/CalendarTab.tsx
+++ b/apps/app/src/wallet/insights/CalendarTab.tsx
@@ -1,379 +1,251 @@
-// Calendar tab of Bun Wallet insights (P2-T31, wc-calendar, R65).
-import type { EntryDto, Minor, TransactionDto } from '@gogospend/contracts';
-import { useMemo, useState } from 'react';
+// The calendar tab (P2-T31, wc-calendar; W9, W22, R65).
+//
+// - The month with previous and next (the kit's IconButton; next is disabled
+//   once the month is this month) and the month line: its money out in the
+//   wallet's money text (W9), the days logged and the days so far.
+// - Sunday-first weekday initials, in the person's language (dateStep).
+// - A 50 pt button for each day up to today, at least 44 pt wide on a 375 pt
+//   phone: its number and its money out in whole baht without ฿ (by BigInt,
+//   rounded down, as W9's per-day figures are), shaded by
+//   calendarPaint(calendarShade(out)), in DM Sans as wc-calendar draws them.
+//   Its label is calendarModel's: the whole date, today named, the day's money
+//   out and any drafts said apart. Today is framed 2 pt in ink. Days after
+//   today are drawn and inert, and hidden from screen readers.
+// - Private mode (W10, D41, R65): every day is one neutral fill (`raised` with
+//   `ink` numbers) with no amount and no border but today's frame, and says
+//   its date alone; the month line masks its amount; the legend keeps its
+//   swatches, with no values and no unit.
+// - The largest text sizes: the grid's numbers stop at iOS's largest standard
+//   size, as a fixed bar's words do (largeTextScale.ts), and a cell grows
+//   taller rather than cut them. The chosen day below, in the wallet's roles,
+//   carries the same facts at every size.
+// - The chosen day: its date as wc-calendar writes it (dateStep), its entries
+//   and money out, and each record with its category and wallet.
+import type { CategoryDto, EntryDto, Minor, WalletDto } from '@gogospend/contracts';
+import { useState } from 'react';
 import type { ReactElement } from 'react';
 import { Pressable, View } from 'react-native';
+import Svg, { Path } from 'react-native-svg';

 import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
-import { daysInMonth } from '@mobile/spend/v1/redesign/shared';
-import { calendarModel, type CalendarDay } from '@mobile/spend/v1/redesign/insights/insightsModel';
-import { monthLabel } from '@mobile/ui/dateStep';
-import { monthOf, shiftMonth } from '@mobile/spend/v1/viewModels';
+import type { CalendarDay, CalendarModel } from '@mobile/spend/v1/redesign/insights/insightsModel';
+import { categoryName, monthOf, shiftMonth } from '@mobile/spend/v1/viewModels';
+import { Text } from '@mobile/theme/AppText';
 import { useWalletColors } from '@mobile/theme/ThemeProvider';
-import { calendarPaint, type CalendarStep } from '@mobile/theme/walletPalette';
+import { LATIN_UI_FONT_FAMILY } from '@mobile/theme/uiFontFamily';
+import { CALENDAR_STEP_LIMITS_BAHT, calendarPaint } from '@mobile/theme/walletPalette';
+import type { CalendarStep } from '@mobile/theme/walletPalette';
+import { walletLineHeight } from '@mobile/theme/walletType';
+import { DECORATIVE } from '@mobile/ui/a11y';
+import { fullDateLabel, monthLabel, shortDateLabel, weekdayInitials } from '@mobile/ui/dateStep';
+import { LARGEST_STANDARD_SCALE } from '@mobile/ui/largeTextScale';
+import { IconButton } from '../controls/IconButton';
 import { useDraftCopy } from '../copy/useDraftCopy';
 import { WalletCategoryIcon } from '../looks/WalletCategoryIcon';
 import { WalletAmount } from '../money/WalletAmount';
+import { HIDDEN_AMOUNT, perDayText, walletMoneyText } from '../money/walletMoney';
 import { usePrivateMode } from '../privacy/PrivateModeProvider';
 import { WalletText } from '../WalletText';
 import { calendarShade } from './calendarShade';
 import { COPY } from './copy';
+import { isMoneyOut, unknownCategory } from './insightsData';
 import type { InsightsData } from './insightsData';

-const WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'] as const;
-const LEGEND_STEPS: readonly CalendarStep[] = [0, 1, 2, 3, 4, 5];
-const LEGEND_LABELS = ['0', '≤200', '≤500', '≤1,000', '≤2,000', '2,000+'] as const;
-
-export function CalendarTab({
-  data,
-  month,
-  today,
-  onMonthChange,
-}: {
+/** Seven columns on a 375 pt phone: 375 less two 18 pt gutters and six 4 pt gaps leaves 45 pt a day. */
+const CELL_GAP = 4;
+const CELL = { flex: 1, minWidth: 44, minHeight: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 } as const;
+const STEPS: readonly CalendarStep[] = [0, 1, 2, 3, 4, 5];
+
+/** A day's money out in whole baht, without ฿: W9's per-day figure, rounded down by BigInt. */
+const dayBaht = (minor: Minor): string => perDayText(minor).slice(1);
+
+/** The legend's values, from the steps' own limits: 0, ≤200, ≤500, ≤1,000, ≤2,000 and 2,000+. */
+function legendValue(step: CalendarStep): string {
+  const limits: readonly number[] = CALENDAR_STEP_LIMITS_BAHT;
+  if (step === 0) return '0';
+  if (step < limits.length) return `≤${dayBaht(`${limits[step]}00`)}`;
+  return `${dayBaht(`${limits[limits.length - 1]}00`)}+`;
+}
+
+/** The grid's numbers in DM Sans (wc-calendar). They stop at iOS's largest standard size; the cell grows instead. */
+function GridText({ size, weight, color, testID, children }: { size: 14 | 11 | 10; weight: '500' | '700'; color: string; testID?: string; children: string }) {
+  return (
+    <Text
+      testID={testID}
+      maxFontSizeMultiplier={LARGEST_STANDARD_SCALE}
+      style={{ fontFamily: LATIN_UI_FONT_FAMILY, fontWeight: weight, fontSize: size, lineHeight: walletLineHeight(size, 'latin'), color, textAlign: 'center' }}
+    >
+      {children}
+    </Text>
+  );
+}
+
+function Chevron({ forward, color }: { forward: boolean; color: string }) {
+  return (
+    <View {...DECORATIVE}>
+      <Svg width={18} height={18} viewBox="0 0 24 24">
+        <Path d={forward ? 'M9 5l7 7-7 7' : 'M15 5l-7 7 7 7'} fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
+      </Svg>
+    </View>
+  );
+}
+
+function DayButton({ day, chosen, onChoose }: { day: CalendarDay; chosen: boolean; onChoose: (date: string) => void }) {
+  const colors = useWalletColors();
+  const tc = useCopy();
+  const dateLocale = useActiveLocale();
+  const { hidden } = usePrivateMode();
+  // In private mode every day is drawn alike, so none stands out by what was spent.
+  const paint = hidden ? { fill: colors.raised, text: colors.ink, border: null } : calendarPaint(calendarShade(day.outMinor), colors.isDark);
+  // Today is framed 2 pt in ink; otherwise only an empty day keeps its hairline.
+  const frame = day.isToday ? { borderWidth: 2, borderColor: colors.ink } : paint.border !== null ? { borderWidth: 1, borderColor: paint.border } : { borderWidth: 0 };
+  const date = fullDateLabel(day.date, dateLocale);
+  const label = hidden ? (day.isToday ? `${tc('Today')}, ${date}` : date) : day.label;
+  return (
+    <Pressable
+      accessibilityRole="button"
+      accessibilityLabel={label}
+      accessibilityState={{ selected: chosen }}
+      aria-selected={chosen}
+      testID={`calendar-day-${day.dayOfMonth}`}
+      onPress={() => onChoose(day.date)}
+      style={{ ...CELL, backgroundColor: paint.fill, ...frame }}
+    >
+      <GridText size={14} weight="700" color={paint.text}>{String(day.dayOfMonth)}</GridText>
+      {!hidden && BigInt(day.outMinor) > 0n ? (
+        <GridText size={10} weight="500" color={paint.text} testID={`calendar-day-amount-${day.dayOfMonth}`}>{dayBaht(day.outMinor)}</GridText>
+      ) : null}
+    </Pressable>
+  );
+}
+
+function DayRecord({ record, first, categories, wallets }: { record: EntryDto; first: boolean; categories: readonly CategoryDto[]; wallets: readonly WalletDto[] }) {
+  const colors = useWalletColors();
+  const tc = useCopy();
+  const category = categories.find((item) => item.id === record.category_id);
+  const categoryText = category ? categoryName(category, tc) : tc('Category');
+  const wallet = wallets.find((item) => item.id === record.wallet_id);
+  return (
+    <View
+      testID={`day-record-${record.id}`}
+      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 7, borderTopWidth: first ? 0 : 1, borderTopColor: colors.hairline }}
+    >
+      <WalletCategoryIcon category={category ?? unknownCategory(record.category_id)} name={categoryText} size={36} />
+      <View style={{ flex: 1, minWidth: 0 }}>
+        <WalletText role="label" style={{ fontWeight: '700' }}>{record.merchant ?? record.note ?? categoryText}</WalletText>
+        <WalletText role="caption" tone="quiet">{wallet ? `${categoryText} · ${wallet.name}` : categoryText}</WalletText>
+      </View>
+      <WalletAmount minor={record.amount_minor} size={16} />
+    </View>
+  );
+}
+
+export function CalendarTab({ data, calendar, onMonthChange }: {
   data: InsightsData;
-  month: string;
-  today: string;
+  calendar: CalendarModel;
   onMonthChange: (month: string) => void;
 }): ReactElement {
   const colors = useWalletColors();
-  const isDark = colors.isDark;
-  const tc = useCopy();
   const dateLocale = useActiveLocale();
   const t = useDraftCopy(COPY);
   const { hidden } = usePrivateMode();
-
-  const currentMonth = monthOf(today);
-  const isCurrentMonth = month === currentMonth;
-
-  // Selected date defaults to today if current month, else first day of month
-  const [selectedDay, setSelectedDay] = useState<string>(
-    isCurrentMonth ? today : `${month}-01`,
-  );
-
-  const words = useMemo(
-    () => ({
-      tc,
-      locale: 'th' as const,
-      fullDate: (date: string) => date,
-    }),
-    [tc],
-  );
-
-  const cal = useMemo(
-    () =>
-      calendarModel({
-        month,
-        today,
-        records: data.records,
-        drafts: data.drafts,
-        words,
-      }),
-    [month, today, data.records, data.drafts, words],
-  );
-
-  const totalDays = daysInMonth(month);
-  const daysCounted = isCurrentMonth ? Number.parseInt(today.slice(8), 10) : totalDays;
-  const spentMinor = data.summary?.expense_minor ?? '0';
-
-  // Transactions on the chosen day
-  const dayRecords = useMemo(
-    () =>
-      data.records.filter(
-        (r): r is EntryDto =>
-          r.occurred_on === selectedDay && r.deleted_at === null && r.type === 'expense',
-      ),
-    [data.records, selectedDay],
-  );
-
-  const dayTotalMinor = useMemo(() => {
-    let sum = 0n;
-    for (const r of dayRecords) sum += BigInt(r.amount_minor);
-    return sum.toString() as Minor;
-  }, [dayRecords]);
-
-  const monthName = monthLabel(month, dateLocale);
-  const canGoNext = month < currentMonth;
-
-  return (
-    <View testID="calendar-tab" style={{ gap: 14 }}>
-      {/* Month line and navigation */}
-      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
-        <View style={{ gap: 2 }}>
-          <WalletText style={{ fontSize: 20, fontWeight: '700', color: colors.ink }}>
-            {monthName}
-          </WalletText>
-          <WalletText style={{ fontSize: 13, color: colors.quiet }}>
-            {t('insights.monthLine', {
-              amount: hidden ? '฿••••' : `฿${Math.round(Number(spentMinor) / 100).toLocaleString()}`,
-              n: cal.daysLogged,
-              d: daysCounted,
-            })}
+  const { month, today } = data;
+  const thisMonth = monthOf(today);
+  const [chosen, setChosen] = useState(() => (month === thisMonth ? today : `${month}-01`));
+  const daysSoFar = calendar.days.filter((day) => !day.isFuture).length;
+  const chosenRecords = data.records.filter((record): record is EntryDto => isMoneyOut(record) && record.occurred_on === chosen);
+  const chosenOut = chosenRecords.reduce((sum, record) => sum + BigInt(record.amount_minor), 0n).toString();
+  const heading = shortDateLabel(chosen, today, dateLocale);
+
+  return (
+    <View testID="calendar-tab" style={{ gap: 12 }}>
+      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
+        <View style={{ flexShrink: 1, gap: 2 }}>
+          <WalletText role="h2" accessibilityRole="header">{monthLabel(month, dateLocale)}</WalletText>
+          <WalletText role="caption" tone="quietOnGround" testID="calendar-month-line">
+            {t('insights.monthLine', { amount: hidden ? HIDDEN_AMOUNT : walletMoneyText(data.summary.expense_minor), n: calendar.daysLogged, d: daysSoFar })}
           </WalletText>
         </View>
-
         <View style={{ flexDirection: 'row', gap: 8 }}>
-          <Pressable
-            accessibilityRole="button"
-            accessibilityLabel={t('insights.previousMonth')}
-            testID="calendar-prev-month"
-            onPress={() => onMonthChange(shiftMonth(month, -1))}
-            style={{
-              width: 44,
-              height: 44,
-              borderRadius: 22,
-              borderWidth: 1,
-              borderColor: colors.hairline,
-              backgroundColor: colors.card,
-              alignItems: 'center',
-              justifyContent: 'center',
-            }}
-          >
-            <WalletText style={{ color: colors.ink, fontSize: 16 }}>‹</WalletText>
-          </Pressable>
-
-          <Pressable
-            accessibilityRole="button"
-            accessibilityLabel={t('insights.nextMonth')}
-            accessibilityState={{ disabled: !canGoNext }}
-            testID="calendar-next-month"
-            disabled={!canGoNext}
-            onPress={() => {
-              if (canGoNext) onMonthChange(shiftMonth(month, 1));
-            }}
-            style={{
-              width: 44,
-              height: 44,
-              borderRadius: 22,
-              borderWidth: 1,
-              borderColor: colors.hairline,
-              backgroundColor: colors.card,
-              alignItems: 'center',
-              justifyContent: 'center',
-              opacity: canGoNext ? 1 : 0.4,
-            }}
-          >
-            <WalletText style={{ color: colors.ink, fontSize: 16 }}>›</WalletText>
-          </Pressable>
+          <IconButton label={t('insights.previousMonth')} onPress={() => onMonthChange(shiftMonth(month, -1))}>
+            <Chevron forward={false} color={colors.ink} />
+          </IconButton>
+          <IconButton label={t('insights.nextMonth')} disabled={month >= thisMonth} onPress={() => onMonthChange(shiftMonth(month, 1))}>
+            <Chevron forward color={colors.ink} />
+          </IconButton>
         </View>
       </View>

-      {/* Weekday initials */}
-      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
-        {WEEKDAYS.map((day, idx) => (
-          <WalletText
-            key={idx}
-            style={{
-              flex: 1,
-              textAlign: 'center',
-              fontSize: 12,
-              color: colors.quiet,
-            }}
-          >
-            {day}
+      <View {...DECORATIVE} style={{ flexDirection: 'row', gap: CELL_GAP }}>
+        {weekdayInitials(dateLocale).map((initial, index) => (
+          <WalletText key={index} role="caption" tone="quietOnGround" maxFontSizeMultiplier={LARGEST_STANDARD_SCALE} style={{ flex: 1, minWidth: 44, textAlign: 'center' }}>
+            {initial}
           </WalletText>
         ))}
       </View>

-      {/* Calendar Grid */}
-      <View style={{ gap: 6 }}>
-        {cal.weeks.map((week, wIdx) => (
-          <View key={wIdx} style={{ flexDirection: 'row', gap: 6 }}>
-            {week.map((day, dIdx) => {
-              if (!day) {
-                return <View key={dIdx} style={{ flex: 1, minHeight: 50 }} />;
-              }
-
+      <View testID="calendar-grid" style={{ gap: CELL_GAP }}>
+        {calendar.weeks.map((week, row) => (
+          <View key={row} style={{ flexDirection: 'row', gap: CELL_GAP }}>
+            {week.map((day, index) => {
+              if (day === null) return <View key={`blank-${index}`} {...DECORATIVE} style={{ flex: 1, minWidth: 44 }} />;
               if (day.isFuture) {
-                // Future days: drawn and inert
                 return (
                   <View
                     key={day.date}
+                    {...DECORATIVE}
                     testID={`calendar-future-day-${day.dayOfMonth}`}
-                    style={{
-                      flex: 1,
-                      minHeight: 50,
-                      borderRadius: 12,
-                      borderWidth: 1,
-                      borderStyle: 'dashed',
-                      borderColor: colors.hairline,
-                      alignItems: 'center',
-                      justifyContent: 'center',
-                    }}
+                    style={{ ...CELL, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.hairline }}
                   >
-                    <WalletText style={{ fontSize: 14, color: colors.quiet }}>
-                      {day.dayOfMonth}
-                    </WalletText>
+                    <GridText size={14} weight="500" color={colors.quietOnGround}>{String(day.dayOfMonth)}</GridText>
                   </View>
                 );
               }
-
-              // Active/Past day button (at least 50 pt)
-              const step = calendarShade(day.outMinor);
-              const paint = calendarPaint(step, isDark);
-              const outNum = Math.round(Number(day.outMinor) / 100);
-              const bahtText = outNum > 0 ? outNum.toLocaleString() : '';
-              const isToday = day.isToday;
-
-              const bg = hidden ? colors.raised : paint.fill;
-              const textColor = hidden ? colors.ink : paint.text;
-              const borderColor = isToday ? colors.ink : paint.border ?? 'transparent';
-              const borderWidth = isToday ? 2 : paint.border ? 1 : 0;
-
-              const spoken = isToday
-                ? `${day.dayOfMonth} ${monthName} วันนี้`
-                : `${day.dayOfMonth} ${monthName}`;
-
-              return (
-                <Pressable
-                  key={day.date}
-                  accessibilityRole="button"
-                  accessibilityLabel={spoken}
-                  testID={`calendar-day-${day.dayOfMonth}`}
-                  onPress={() => setSelectedDay(day.date)}
-                  style={{
-                    flex: 1,
-                    minHeight: 50,
-                    borderRadius: 12,
-                    backgroundColor: bg,
-                    borderWidth,
-                    borderColor,
-                    alignItems: 'center',
-                    justifyContent: 'center',
-                    padding: 2,
-                  }}
-                >
-                  <WalletText style={{ fontSize: 14, fontWeight: '700', color: textColor }}>
-                    {day.dayOfMonth}
-                  </WalletText>
-                  {!hidden && bahtText ? (
-                    <WalletText
-                      style={{ fontSize: 10, fontWeight: '500', color: textColor }}
-                      testID={`calendar-day-amount-${day.dayOfMonth}`}
-                    >
-                      {bahtText}
-                    </WalletText>
-                  ) : null}
-                </Pressable>
-              );
+              return <DayButton key={day.date} day={day} chosen={day.date === chosen} onChoose={setChosen} />;
             })}
           </View>
         ))}
       </View>

-      {/* Legend */}
       <View
-        accessible={true}
+        accessible
         accessibilityRole="image"
-        accessibilityLabel={t('insights.legend')}
+        accessibilityLabel={hidden ? t('insights.legendToday') : `${t('insights.legend')} ${t('insights.legendToday')}`}
         testID="calendar-legend"
-        style={{
-          flexDirection: 'row',
-          alignItems: 'flex-start',
-          gap: 6,
-          marginTop: 4,
-        }}
+        style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}
       >
-        <WalletText style={{ fontSize: 11, color: colors.quiet, minWidth: 32 }}>
-          {hidden ? '' : 'บาท\nต่อวัน'}
-        </WalletText>
-        {LEGEND_STEPS.map((step, idx) => {
-          const paint = calendarPaint(step, isDark);
+        {hidden ? null : (
+          <WalletText role="caption" tone="quietOnGround" maxFontSizeMultiplier={LARGEST_STANDARD_SCALE} testID="legend-unit">
+            {t('insights.perDay')}
+          </WalletText>
+        )}
+        {STEPS.map((step) => {
+          const paint = calendarPaint(step, colors.isDark);
           return (
             <View key={step} style={{ flex: 1, alignItems: 'center', gap: 3 }}>
               <View
-                style={{
-                  width: '100%',
-                  height: 12,
-                  borderRadius: 4,
-                  backgroundColor: paint.fill,
-                  borderWidth: paint.border ? 1 : 0,
-                  borderColor: paint.border ?? 'transparent',
-                }}
                 testID={`legend-swatch-${step}`}
+                style={{ alignSelf: 'stretch', height: 12, borderRadius: 4, backgroundColor: paint.fill, borderWidth: paint.border === null ? 0 : 1, borderColor: paint.border ?? 'transparent' }}
               />
-              {!hidden ? (
-                <WalletText
-                  style={{ fontSize: 10, color: colors.quiet }}
-                  testID={`legend-label-${step}`}
-                >
-                  {LEGEND_LABELS[idx]}
-                </WalletText>
-              ) : null}
+              {hidden ? null : <GridText size={11} weight="500" color={colors.quietOnGround} testID={`legend-label-${step}`}>{legendValue(step)}</GridText>}
             </View>
           );
         })}
       </View>

-      {/* Chosen Day's Records */}
-      <View
-        testID="calendar-chosen-day-section"
-        style={{
-          backgroundColor: colors.card,
-          borderRadius: 22,
-          padding: 16,
-          gap: 12,
-          marginTop: 6,
-        }}
-      >
-        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
-          <WalletText style={{ fontSize: 16, fontWeight: '700', color: colors.ink }}>
-            {selectedDay === today
-              ? `${selectedDay.slice(8)} ${monthName} · วันนี้`
-              : `${selectedDay.slice(8)} ${monthName}`}
-          </WalletText>
-          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
-            <WalletText style={{ fontSize: 13, color: colors.quiet }}>
-              {t('insights.entries', { count: dayRecords.length })}
-            </WalletText>
-            <WalletAmount minor={dayTotalMinor} size={16} />
+      <View testID="calendar-chosen-day-section" style={{ backgroundColor: colors.card, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 12, gap: 4 }}>
+        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 8 }}>
+          <WalletText role="label" accessibilityRole="header" testID="calendar-chosen-day" style={{ fontWeight: '700' }}>
+            {chosen === today ? `${heading} · ${t('insights.today')}` : heading}
+          </WalletText>
+          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
+            <WalletText role="caption" tone="quiet">{t('insights.entries', { count: chosenRecords.length })}</WalletText>
+            <WalletAmount minor={chosenOut} size={17} testID="calendar-chosen-day-total" />
           </View>
         </View>
-
-        {dayRecords.map((record, idx) => {
-          const categoryObj = data.categories.find((c) => c.id === record.category_id);
-          const isLast = idx === dayRecords.length - 1;
-
-          return (
-            <View
-              key={record.id}
-              style={{
-                flexDirection: 'row',
-                alignItems: 'center',
-                gap: 12,
-                paddingVertical: 8,
-                borderBottomWidth: isLast ? 0 : 1,
-                borderBottomColor: colors.hairline,
-              }}
-              testID={`day-record-${record.id}`}
-            >
-              {categoryObj ? (
-                <WalletCategoryIcon
-                  category={categoryObj}
-                  name={categoryObj.label ?? categoryObj.builtin_key ?? ''}
-                  size={36}
-                />
-              ) : (
-                <View
-                  style={{
-                    width: 36,
-                    height: 36,
-                    borderRadius: 11,
-                    backgroundColor: colors.raised,
-                  }}
-                />
-              )}
-              <View style={{ flex: 1 }}>
-                <WalletText style={{ fontSize: 15, fontWeight: '700', color: colors.ink }}>
-                  {record.merchant ?? record.note ?? categoryObj?.label ?? 'รายการ'}
-                </WalletText>
-                <WalletText style={{ fontSize: 12, color: colors.quiet }}>
-                  {categoryObj?.label ?? ''}
-                </WalletText>
-              </View>
-              <WalletAmount minor={record.amount_minor} size={16} />
-            </View>
-          );
-        })}
+        {chosenRecords.map((record, index) => (
+          <DayRecord key={record.id} record={record} first={index === 0} categories={data.categories} wallets={data.wallets} />
+        ))}
       </View>
     </View>
   );
```

### `apps/app/src/wallet/insights/InfoTray.tsx`

```diff
diff --git a/apps/app/src/wallet/insights/InfoTray.tsx b/apps/app/src/wallet/insights/InfoTray.tsx
--- a/apps/app/src/wallet/insights/InfoTray.tsx
+++ b/apps/app/src/wallet/insights/InfoTray.tsx
@@ -1,26 +1,17 @@
-// Info tray explaining the spent amount number (P2-T31).
+// What the spent amount is (P2-T31): the wallet's tray, so its motion follows
+// the wallet's one reduced-motion answer, with the explanation in body text.
 import type { ReactElement } from 'react';

-import { useWalletColors } from '@mobile/theme/ThemeProvider';
 import { useDraftCopy } from '../copy/useDraftCopy';
 import { Tray } from '../tray/Tray';
 import { WalletText } from '../WalletText';
 import { COPY } from './copy';

-export function InfoTray(props: { visible: boolean; onClose: () => void }): ReactElement {
+export function InfoTray({ visible, onClose }: { visible: boolean; onClose: () => void }): ReactElement {
   const t = useDraftCopy(COPY);
-  const colors = useWalletColors();
-
   return (
-    <Tray
-      visible={props.visible}
-      onClose={props.onClose}
-      title={t('insights.whatIsThis')}
-      testID="insights-info-tray"
-    >
-      <WalletText style={{ fontSize: 15, lineHeight: 22, color: colors.quiet, paddingVertical: 8 }}>
-        {t('insights.spentExplain')}
-      </WalletText>
+    <Tray visible={visible} onClose={onClose} title={t('insights.whatIsThis')} testID="insights-info-tray">
+      <WalletText role="body" tone="quiet" style={{ paddingVertical: 8 }}>{t('insights.spentExplain')}</WalletText>
     </Tray>
   );
 }
```

### `apps/app/src/wallet/insights/WalletInsights.render.test.tsx`

```diff
diff --git a/apps/app/src/wallet/insights/WalletInsights.render.test.tsx b/apps/app/src/wallet/insights/WalletInsights.render.test.tsx
--- a/apps/app/src/wallet/insights/WalletInsights.render.test.tsx
+++ b/apps/app/src/wallet/insights/WalletInsights.render.test.tsx
@@ -1,5 +1,18 @@
-// The Bun Wallet insights screen render tests (bw-insights, wc-calendar, es-empty-insights, P2-T31).
-import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
+// The Bun Wallet insights (P2-T31; bw-insights, wc-calendar,
+// es-empty-insights), on the boards' day, Saturday 24 October 2026: the three
+// tabs in both modes and both languages, the info tray, the six bars on one
+// scale with the budget, the calendar's steps and labels, the early state, the
+// load and its problems, a sync that changes nothing, private mode (R65), the
+// analytics (R61), the largest text sizes, and the catalogue's sections
+// drawing the real screen on fakes.
+//
+// The fakes: October holds ฿3,972.50 out over the 1st, 2nd, 5th and 24th (Food
+// ฿3,784.50 in three entries, Travel ฿188.00), ฿25,000.00 in, and a ฿18,000.00
+// budget; May to September before it spend ฿20.00, nothing, ฿2,500.00,
+// ฿6,000.00 and ฿9,000.00, and September earns ฿30,000.00. The month's summary
+// gives each category's money, as the server does (withCategoryTotals).
+import type { CategoryDto, TransactionDto, WalletSnapshot } from '@gogospend/contracts';
+import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
 import { afterEach, beforeEach, expect, test, vi } from 'vitest';

 vi.mock('expo-router', () => import('../../dev/catalogue/routerTestStub'));
@@ -8,358 +21,745 @@
 vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
 vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

-const analyticsMocks = vi.hoisted(() => ({
-  trackInsightsViewed: vi.fn(),
-}));
-
-vi.mock('@mobile/analytics/events', async (importOriginal) => {
-  const actual = await importOriginal<typeof import('@mobile/analytics/events')>();
+// react-native-web drops maxFontSizeMultiplier and numberOfLines from the DOM,
+// so the test records the props that reach the app's Text and still renders it.
+const seen = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));
+vi.mock('@mobile/theme/AppText', async (importOriginal) => {
+  const actual = await importOriginal<typeof import('@mobile/theme/AppText')>();
+  const { createElement, forwardRef } = await import('react');
+  const Text = forwardRef<unknown, Record<string, unknown>>(function RecordedText(props, ref) {
+    seen.props.push(props);
+    return createElement(actual.Text as never, { ...props, ref });
+  });
+  return { ...actual, Text };
+});
+
+// Each calendar the screen draws, by its month and the records it was drawn from.
+const drawn = vi.hoisted(() => ({ calendars: [] as { month: string; days: string[] }[] }));
+vi.mock('@mobile/spend/v1/redesign/insights/insightsModel', async (importOriginal) => {
+  const actual = await importOriginal<typeof import('@mobile/spend/v1/redesign/insights/insightsModel')>();
   return {
     ...actual,
-    trackInsightsViewed: analyticsMocks.trackInsightsViewed,
+    calendarModel: (input: Parameters<typeof actual.calendarModel>[0]) => {
+      drawn.calendars.push({ month: input.month, days: input.records.map((record) => record.occurred_on) });
+      return actual.calendarModel(input);
+    },
   };
 });

-import type { CategoryDto, TransactionDto } from '@gogospend/contracts';
+import { recordAnalytics } from '@mobile/analytics/testing/recordAnalytics';
+import { V1Error } from '@mobile/api/client';
+import { hiddenFromScreenReaders } from '@mobile/mascot/mascotTestHarness';
+import type { SpendV1Resources } from '@mobile/spend/v1/resources';
+import { createFakeDiary } from '@mobile/spend/v1/testing/fakeDiary';
+import { BUILTINS, createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
+import { LATIN_UI_FONT_FAMILY } from '@mobile/theme/uiFontFamily';
+import { calendarPaint, walletDark, walletLight } from '@mobile/theme/walletPalette';
+import type { WalletColors } from '@mobile/theme/walletPalette';
+import { LARGEST_STANDARD_SCALE } from '@mobile/ui/largeTextScale';
+import { rgba } from '../../dev/catalogue/catalogueTestHarness';
+import { recapBudget, withCategoryTotals } from '../../dev/catalogue/insights/recapSections';
+import { router } from '../../dev/catalogue/routerTestStub';
+import { draftEntry, queued } from '../../dev/catalogue/screenFixtures';
+import { WALLET_SECTIONS } from '../../dev/catalogue/wallet';
 import { WALLET_INSIGHTS_SECTIONS } from '../../dev/catalogue/wallet/insightsSections';
-import { createFakeResources } from '../../spend/v1/testing/fakeResources';
-import { calendarPaint } from '../../theme/walletPalette';
-import { mountWallet } from '../testing/walletHarness';
 import { PRIVATE_MODE_NAME } from '../privacy/PrivateModeProvider';
+import { AX5, mountWallet } from '../testing/walletHarness';
+import type { MountWalletOptions } from '../testing/walletHarness';
 import { WalletInsightsScreen } from './WalletInsightsScreen';

+beforeEach(() => {
+  router.push.mockReset();
+  drawn.calendars.length = 0;
+});
+
+afterEach(() => {
+  cleanup();
+  vi.restoreAllMocks();
+  seen.props.length = 0;
+});
+
+// ---------------------------------------------------------------------------
+// The fakes
+
+/** Saturday 24 October 2026, 17:00 in Bangkok. */
 const NOW = new Date('2026-10-24T10:00:00Z');
-const THIS_MONTH = '2026-10';
-
-const FOOD_CAT: CategoryDto = {
-  id: 'c-food',
-  type: 'expense',
-  builtin_key: 'food',
-  label: 'อาหาร',
-  color: '#FFE3CC',
-  archived: false,
-  version: 1,
-};
-const TRAVEL_CAT: CategoryDto = {
-  id: 'c-trav',
-  type: 'expense',
-  builtin_key: 'travel',
-  label: 'เดินทาง',
-  color: '#DCE8FF',
-  archived: false,
-  version: 1,
-};
-
-function makeRecords(): TransactionDto[] {
-  return [
-    // 2026-10-01: 3,240 baht -> step 5
-    { id: 't1', type: 'expense', amount_minor: '324000', occurred_on: '2026-10-01', wallet_id: 'w1', category_id: 'c-food', note: 'Dinner', merchant: null, deleted_at: null, version: 1 },
-    // 2026-10-02: 412 baht -> step 2
-    { id: 't2', type: 'expense', amount_minor: '41200', occurred_on: '2026-10-02', wallet_id: 'w1', category_id: 'c-food', note: 'Lunch', merchant: null, deleted_at: null, version: 1 },
-    // 2026-10-05: 188 baht -> step 1
-    { id: 't3', type: 'expense', amount_minor: '18800', occurred_on: '2026-10-05', wallet_id: 'w1', category_id: 'c-trav', note: 'BTS', merchant: null, deleted_at: null, version: 1 },
-    // 2026-10-24 (today): 132 baht
-    { id: 't4', type: 'expense', amount_minor: '13200', occurred_on: '2026-10-24', wallet_id: 'w1', category_id: 'c-food', note: 'Coffee', merchant: 'Coffee Shop', deleted_at: null, version: 1 },
-  ];
+const [CASH, DAILY] = goldenSeed().wallets as [WalletSnapshot, WalletSnapshot];
+const [FOOD, TRAVEL, BILLS, SALARY] = BUILTINS as [CategoryDto, CategoryDto, CategoryDto, CategoryDto, CategoryDto];
+
+function entry(id: string, type: 'expense' | 'income', day: string, amountMinor: string, category: CategoryDto, wallet: WalletSnapshot, extra: Partial<TransactionDto> = {}): TransactionDto {
+  return { id, type, amount_minor: amountMinor, occurred_on: day, wallet_id: wallet.id, category_id: category.id, note: null, merchant: null, deleted_at: null, version: 1, ...extra } as TransactionDto;
 }

-function seedData(records = makeRecords()) {
-  return {
-    records,
-    categories: [FOOD_CAT, TRAVEL_CAT],
-    budgets: [
-      {
-        id: 'b1',
-        month: THIS_MONTH,
-        overall_limit_minor: '1800000', // 18,000 baht
-        category_limits: [],
-        version: 1,
-      },
-    ],
-  };
+const OCTOBER: readonly TransactionDto[] = [
+  entry('t01', 'expense', '2026-10-01', '324050', FOOD, CASH, { note: 'Dinner' }),
+  entry('t02', 'income', '2026-10-01', '2500000', SALARY, DAILY),
+  entry('t03', 'expense', '2026-10-02', '41200', FOOD, CASH, { note: 'Lunch' }),
+  entry('t04', 'expense', '2026-10-05', '18800', TRAVEL, DAILY, { note: 'BTS' }),
+  entry('t05', 'expense', '2026-10-24', '13200', FOOD, CASH, { merchant: 'Coffee Shop' }),
+];
+const BEFORE: readonly TransactionDto[] = [
+  entry('t10', 'expense', '2026-05-10', '2000', FOOD, CASH),
+  entry('t11', 'expense', '2026-07-10', '250000', BILLS, DAILY),
+  entry('t12', 'expense', '2026-08-10', '600000', BILLS, DAILY),
+  entry('t13', 'expense', '2026-09-10', '900000', BILLS, DAILY),
+  entry('t14', 'income', '2026-09-01', '3000000', SALARY, DAILY),
+];
+
+function insightsFake({ records = [...OCTOBER, ...BEFORE], budgetMinor = '1800000' }: { records?: readonly TransactionDto[]; budgetMinor?: string | null } = {}) {
+  const fake = createFakeResources({ wallets: [CASH, DAILY], records: [...records], categories: [...BUILTINS], budgets: budgetMinor === null ? [] : [recapBudget('2026-10', budgetMinor)] });
+  return { fake, resources: withCategoryTotals(fake) };
 }

-/** The element with this role and name, which must be there. Fails on AssertionError. */
-function named(role: string, name: string | RegExp, inside: HTMLElement = document.body): HTMLElement {
-  const element = within(inside).queryByRole(role, { name });
-  expect(element, `a ${role} named ${String(name)}`).not.toBeNull();
-  return element as HTMLElement;
+function mountInsights(options: MountWalletOptions = {}) {
+  return mountWallet(<WalletInsightsScreen now={NOW} />, { resources: insightsFake().resources, ...options });
 }

-/** The element with this test id, which must be there. Fails on AssertionError. */
+/** Lets every read the fakes started land. */
+const settle = () => act(async () => {
+  for (let tick = 0; tick < 3; tick += 1) await new Promise((resolve) => setTimeout(resolve, 0));
+});
+
+// ---------------------------------------------------------------------------
+// Asserting lookups: each fails on an AssertionError, never a lookup error
+
 function found(testID: string, inside: HTMLElement = document.body): HTMLElement {
   const element = within(inside).queryByTestId(testID);
   expect(element, testID).not.toBeNull();
   return element as HTMLElement;
 }

-/** The element showing these words, which must be there. Fails on AssertionError. */
-function shown(words: string | RegExp, inside: HTMLElement = document.body): HTMLElement {
-  const element = within(inside).queryByText(words);
-  expect(element, String(words)).not.toBeNull();
+function named(role: string, name: string, inside: HTMLElement = document.body): HTMLElement {
+  const element = within(inside).queryByRole(role, { name });
+  expect(element, `${role} ${name}`).not.toBeNull();
   return element as HTMLElement;
 }

-beforeEach(() => {
-  analyticsMocks.trackInsightsViewed.mockClear();
-});
-
-afterEach(() => {
-  cleanup();
-  vi.restoreAllMocks();
-});
+const textOf = (testID: string) => found(testID).textContent;
+/** The words an element shows, leaving out what is hidden from screen readers (a category tile's initial). */
+function wordsOf(element: Element): string {
+  return [...element.childNodes].map((node) => {
+    if (node.nodeType === 3) return node.textContent ?? '';
+    return node instanceof Element && node.getAttribute('aria-hidden') !== 'true' ? wordsOf(node) : '';
+  }).join('');
+}
+const rowsOf = (testID: string) => [...found(testID).querySelectorAll('[role="link"]')].map(wordsOf);
+const labelOf = (element: HTMLElement) => element.getAttribute('aria-label');
+const day = (n: number) => found(`calendar-day-${n}`);
+const reads = (fake: ReturnType<typeof insightsFake>['fake']) =>
+  (['summary', 'history', 'categories', 'wallets'] as const).map((method) => fake.callsOf(method).length);
+
+async function press(element: HTMLElement) {
+  fireEvent.click(element);
+  await settle();
+}
+
+async function openTab(name: string) {
+  await press(named('tab', name));
+}
+
+const TABS = { th: { spending: 'ใช้จ่าย', inOut: 'เงินเข้า-ออก', calendar: 'ปฏิทิน' }, en: { spending: 'Spending', inOut: 'In and out', calendar: 'Calendar' } } as const;
+const PALETTE: Readonly<Record<'light' | 'dark', WalletColors>> = { light: walletLight, dark: walletDark };
+/** Thai letters and marks; ฿ (U+0E3F) is not one, since English amounts carry it too. */
+const THAI_LETTERS = /[\u0E01-\u0E3A\u0E40-\u0E5B]/;
+
+// ---------------------------------------------------------------------------
+// The spending tab

 test('the spending tab draws six bars, this month in barNow and the others in barPast, with the budget line', async () => {
-  const fake = createFakeResources(seedData());
-  mountWallet(<WalletInsightsScreen now={NOW} />, { resources: fake.resources, locale: 'th', mode: 'light' });
-
-  // Waiting for data load
-  await act(async () => {});
-
-  const chart = found('insights-month-bars');
-  expect(chart).not.toBeNull();
-
-  // Current month bar (2026-10) uses barNow (#111014)
-  const currentBar = found('month-bar-2026-10');
-  expect(currentBar.getAttribute('fill')).toBe('#111014');
-
-  // Past month bars use barPast (#8B76DA)
-  const pastBar = found('month-bar-2026-09');
-  expect(pastBar.getAttribute('fill')).toBe('#8B76DA');
-
-  // Budget guideline is drawn
-  const budgetLine = found('budget-guideline');
-  expect(budgetLine.getAttribute('stroke')).toBe('#8A879A');
+  for (const mode of ['light', 'dark'] as const) {
+    const colors = PALETTE[mode];
+    mountInsights({ mode, locale: 'th' });
+    await settle();
+    const chart = found('insights-month-bars');
+    const bars = [...chart.querySelectorAll('rect')];
+    expect(bars.map((bar) => bar.getAttribute('data-testid')), mode).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map((month) => `month-bar-${month}`));
+    expect(bars.map((bar) => bar.getAttribute('fill')), mode).toEqual([colors.barPast, colors.barPast, colors.barPast, colors.barPast, colors.barPast, colors.barNow]);
+    expect(found('budget-guideline').getAttribute('stroke'), mode).toBe(colors.guideLine);
+    expect(found('budget-guideline').getAttribute('stroke-dasharray'), mode).toBe('4 4');
+    // bw-insights: the money out at 36, the days left with today counted, the budget in the wallet's money text, the months by their short names.
+    expect(textOf('spending-hero-amount'), mode).toBe('฿3,972.50');
+    expect(textOf('spending-days-left'), mode).toBe('ใช้ไปแล้ว · อีก 8 วันจบเดือน');
+    expect(textOf('insights-budget-label'), mode).toBe('งบ ฿18,000');
+    expect(['05', '06', '07', '08', '09', '10'].map((month) => textOf(`month-name-2026-${month}`)), mode).toEqual(['พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.']);
+    cleanup();
+  }
+});
+
+test("the budget line sits on the bars' own scale, from one baseline", async () => {
+  // Under budget: ฿18,000 is the top (110 units above the baseline at 130), and every month stands by its true share.
+  mountInsights();
+  await settle();
+  const rise = (month: string) => Number(found(`month-bar-${month}`).getAttribute('height'));
+  const top = (month: string) => Number(found(`month-bar-${month}`).getAttribute('y'));
+  expect(['05', '06', '07', '08', '09', '10'].map((month) => rise(`2026-${month}`))).toEqual([3, 0, 15, 36, 55, 24]);
+  expect(['05', '06', '07', '08', '09', '10'].map((month) => top(`2026-${month}`) + rise(`2026-${month}`))).toEqual([130, 130, 130, 130, 130, 130]);
+  expect([found('budget-guideline').getAttribute('y1'), found('budget-guideline').getAttribute('y2')]).toEqual(['20', '20']);
+  cleanup();
+  // Over the budget in September: the largest month is the top, and the ฿4,500 line stands at its share of it.
+  mountInsights({ resources: insightsFake({ budgetMinor: '450000' }).resources });
+  await settle();
+  expect(['05', '06', '07', '08', '09', '10'].map((month) => rise(`2026-${month}`))).toEqual([3, 0, 30, 73, 110, 48]);
+  expect(found('budget-guideline').getAttribute('y1')).toBe('75');
+  expect(textOf('insights-budget-label')).toBe('งบ ฿4,500');
+  cleanup();
+  // No budget: no line and no label.
+  mountInsights({ resources: insightsFake({ budgetMinor: null }).resources });
+  await settle();
+  expect(found('insights-month-bars').querySelector('line')).toBeNull();
+  expect(screen.queryByTestId('insights-budget-label')).toBeNull();
+  expect(rise('2026-09')).toBe(110);
 });

 test("the chart is one named element that reads each month's amount", async () => {
-  const fake = createFakeResources(seedData());
-  mountWallet(<WalletInsightsScreen now={NOW} />, { resources: fake.resources, locale: 'th' });
-
-  await act(async () => {});
-
-  const chart = found('insights-month-bars');
-  const label = chart.getAttribute('aria-label') ?? chart.getAttribute('accessibilityLabel') ?? '';
-  expect(label).toContain('ใช้จ่ายรายเดือน');
-  // In normal mode, spoken label carries month and amount
-  expect(label).toMatch(/ตุลาคม/);
-  expect(label).toMatch(/3,972|12,480|0/);
-});
-
-test('in private mode the chart name carries no amount and the calendar is one neutral fill with no legend values', async () => {
-  const fake = createFakeResources(seedData());
-  mountWallet(<WalletInsightsScreen now={NOW} />, {
-    resources: fake.resources,
-    locale: 'th',
-    device: { [PRIVATE_MODE_NAME]: '1' },
-  });
-
-  await act(async () => {});
-
-  // 1. Chart accessibility label carries no amount
-  const chart = found('insights-month-bars');
-  const label = chart.getAttribute('aria-label') ?? chart.getAttribute('accessibilityLabel') ?? '';
-  expect(label).toContain('ใช้จ่ายรายเดือน');
-  expect(label).not.toContain('฿');
-  expect(label).not.toContain('บาท');
-  expect(label).not.toMatch(/3,972|12,480|3,240/);
-
-  // 2. Switch to calendar tab
-  const calTab = found('insights-tab-calendar');
-  fireEvent.click(calTab);
-  await act(async () => {});
-
-  // Every active day uses neutral fill (raised: #F4F3F9) and drops its amount
-  const day1 = found('calendar-day-1');
-  expect(day1.getAttribute('style')).toContain('background-color: rgba(244, 243, 249, 1.00)');
-  // No day amount text rendered
-  expect(within(day1).queryByTestId('calendar-day-amount-1')).toBeNull();
-
-  // 3. Legend shows swatches with no values
-  found('calendar-legend');
-  found('legend-swatch-0');
-  expect(within(document.body).queryByTestId('legend-label-0')).toBeNull();
-  expect(within(document.body).queryByTestId('legend-label-5')).toBeNull();
-});
-
-test('in private mode with English locale and dark mode, no amount reaches chart label, calendar days or legend', async () => {
-  const fake = createFakeResources(seedData());
-  mountWallet(<WalletInsightsScreen now={NOW} />, {
-    resources: fake.resources,
-    locale: 'en',
-    mode: 'dark',
-    device: { [PRIVATE_MODE_NAME]: '1' },
-  });
-
-  await act(async () => {});
-
-  const chart = found('insights-month-bars');
-  const label = chart.getAttribute('aria-label') ?? chart.getAttribute('accessibilityLabel') ?? '';
-  expect(label).toContain('Monthly spending');
-  expect(label).not.toContain('฿');
-  expect(label).not.toMatch(/3,972|12,480|3,240/);
-
-  const calTab = found('insights-tab-calendar');
-  fireEvent.click(calTab);
-  await act(async () => {});
-
-  const day1 = found('calendar-day-1');
-  expect(within(day1).queryByTestId('calendar-day-amount-1')).toBeNull();
-  expect(within(document.body).queryByTestId('legend-label-0')).toBeNull();
+  const spoken = {
+    th: 'ใช้จ่ายรายเดือน พฤษภาคม 2569ถึงตุลาคม 2569: พฤษภาคม 2569 ฿20.00, มิถุนายน 2569 ฿0.00, กรกฎาคม 2569 ฿2,500.00, สิงหาคม 2569 ฿6,000.00, กันยายน 2569 ฿9,000.00, ตุลาคม 2569 ถึงตอนนี้ ฿3,972.50',
+    en: 'Monthly spending, May 2026 to October 2026: May 2026, ฿20.00, June 2026, ฿0.00, July 2026, ฿2,500.00, August 2026, ฿6,000.00, September 2026, ฿9,000.00, October 2026 so far, ฿3,972.50',
+  } as const;
+  for (const locale of ['th', 'en'] as const) {
+    mountInsights({ locale });
+    await settle();
+    expect(screen.queryAllByRole('img', { name: spoken[locale] }), locale).toHaveLength(1);
+    expect(found('insights-month-bars').getAttribute('role'), locale).toBe('img');
+    cleanup();
+  }
 });

 test('the info button explains the number in a tray', async () => {
-  const fake = createFakeResources(seedData());
-  mountWallet(<WalletInsightsScreen now={NOW} />, { resources: fake.resources, locale: 'th' });
-
-  await act(async () => {});
-
-  const infoBtn = found('spending-info-button');
-  fireEvent.click(infoBtn);
-  await act(async () => {});
-
-  // Info tray opens with explanation
-  shown('ตัวเลขนี้คืออะไร');
-  shown('ยอดนี้คือรายจ่ายที่บันทึกแล้วในเดือนนี้ ไม่รวมการโอนและรายการที่ยังรอส่ง');
-});
+  mountInsights();
+  await settle();
+  const info = named('button', 'ตัวเลขนี้คืออะไร');
+  expect([info.style.width, info.style.height]).toEqual(['44px', '44px']);
+  expect(screen.queryByRole('dialog', { name: 'ตัวเลขนี้คืออะไร' })).toBeNull();
+  await press(info);
+  const tray = named('dialog', 'ตัวเลขนี้คืออะไร');
+  expect(within(tray).queryByText('ยอดนี้คือรายจ่ายที่บันทึกแล้วในเดือนนี้ ไม่รวมการโอนและรายการที่ยังรอส่ง')).not.toBeNull();
+});
+
+test("the categories are the month's totals in topCategories' order, each with its own count, opening History filtered to it", async () => {
+  for (const locale of ['th', 'en'] as const) {
+    mountInsights({ locale });
+    await settle();
+    expect(rowsOf('insights-categories'), locale).toEqual(locale === 'th'
+      ? ['อาหาร3 รายการ฿3,784.50', 'การเดินทาง1 รายการ฿188']
+      : ['Food3 entries฿3,784.50', 'Travel1 entries฿188']);
+    expect(named('heading', locale === 'th' ? 'หมวดหมู่' : 'Categories'), locale).not.toBeNull();
+    cleanup();
+  }
+  mountInsights();
+  await settle();
+  await press(found(`category-row-${TRAVEL.id}`));
+  expect(router.push.mock.calls).toEqual([[{ pathname: '/spend/all', params: { category: TRAVEL.id } }]]);
+});
+
+test('a category no longer listed, a deleted record and money in are counted nowhere they do not belong', async () => {
+  const GONE = '0000000c-0000-4000-8000-0000000000ff';
+  const records = [
+    ...OCTOBER,
+    ...BEFORE,
+    entry('t20', 'expense', '2026-10-02', '5000', { ...FOOD, id: GONE }, CASH, { note: 'Old tea' }),
+    entry('t21', 'income', '2026-10-02', '7000', SALARY, CASH),
+  ];
+  const { fake, resources } = insightsFake({ records });
+  // History hands back a record deleted meanwhile, as a page read before the delete would.
+  const withDeleted: SpendV1Resources = {
+    ...resources,
+    history: async (filter, cursor, limit) => {
+      const page = await fake.resources.history(filter, cursor, limit);
+      return cursor === undefined ? { ...page, items: [...page.items, entry('t22', 'expense', '2026-10-02', '9900', FOOD, CASH, { deleted_at: '2026-10-03T00:00:00.000Z' })] } : page;
+    },
+  };
+  mountInsights({ resources: withDeleted });
+  await settle();
+  const rows = rowsOf('insights-categories');
+  // Food's count is its three live expenses; the money in and the deleted record are not among them.
+  expect(rows).toEqual(['อาหาร3 รายการ฿3,784.50', 'การเดินทาง1 รายการ฿188', 'หมวดหมู่1 รายการ฿50']);
+  await openTab('ปฏิทิน');
+  await press(day(2));
+  expect(textOf('calendar-chosen-day')).toBe('ศุกร์ 2 ต.ค.');
+  // In history's order; the money in and the deleted record are not among them.
+  expect(wordsOf(found('calendar-chosen-day-section'))).toBe('ศุกร์ 2 ต.ค.2 รายการ฿462Old teaหมวดหมู่ · Cash฿50Lunchอาหาร · Cash฿412');
+});
+
+// ---------------------------------------------------------------------------
+// The tabs and the analytics

 test('each tab is a 44 pt tab and sends insights_viewed with spending, in_out or calendar', async () => {
-  const fake = createFakeResources(seedData());
-  mountWallet(<WalletInsightsScreen now={NOW} />, { resources: fake.resources, locale: 'th' });
-
-  await act(async () => {});
-
-  // Initial tab is spending: sends insights_viewed once with 'spending'
-  expect(analyticsMocks.trackInsightsViewed).toHaveBeenCalledWith({ tab: 'spending' });
-
-  // Each tab has at least 44 pt minHeight
-  const spendingTab = found('insights-tab-spending');
-  const inOutTab = found('insights-tab-in_out');
-  const calendarTab = found('insights-tab-calendar');
-
-  expect(spendingTab.getAttribute('style')).toContain('min-height: 44px');
-  expect(inOutTab.getAttribute('style')).toContain('min-height: 44px');
-  expect(calendarTab.getAttribute('style')).toContain('min-height: 44px');
-
-  // Switch to in_out tab
-  fireEvent.click(inOutTab);
-  await act(async () => {});
-  expect(analyticsMocks.trackInsightsViewed).toHaveBeenCalledWith({ tab: 'in_out' });
-
-  // Switch to calendar tab
-  fireEvent.click(calendarTab);
-  await act(async () => {});
-  expect(analyticsMocks.trackInsightsViewed).toHaveBeenCalledWith({ tab: 'calendar' });
+  const recorded = await recordAnalytics();
+  try {
+    mountInsights();
+    await settle();
+    const tabs = screen.queryAllByRole('tab');
+    expect(tabs.map((tab) => tab.textContent)).toEqual(['ใช้จ่าย', 'เงินเข้า-ออก', 'ปฏิทิน']);
+    for (const tab of tabs) expect(tab.style.minHeight, tab.textContent ?? '').toBe('44px');
+    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
+    await openTab('เงินเข้า-ออก');
+    await openTab('ปฏิทิน');
+    // Choosing the tab already shown sends nothing.
+    await openTab('ปฏิทิน');
+    await press(day(2));
+    const viewed = recorded.sent.filter((event) => event.name === 'insights_viewed');
+    expect(viewed.map(({ kind, properties }) => [kind, properties.tab, properties.period])).toEqual([
+      ['capture', 'spending', 'month'], ['capture', 'in_out', 'month'], ['capture', 'calendar', 'month'],
+    ]);
+    expect(recorded.sent.map((event) => event.name)).toEqual(['insights_viewed', 'insights_viewed', 'insights_viewed']);
+    const sent = JSON.stringify(recorded.sent);
+    for (const secret of ['324050', '3,240', '397250', '3,972', '1800000', '18,000', 'Dinner', 'Lunch', 'Coffee Shop', 'Cash']) expect(sent).not.toContain(secret);
+  } finally {
+    recorded.restore();
+  }
 });

 test('the in-and-out tab shows money in in violet with a plus', async () => {
-  const fake = createFakeResources(seedData());
-  mountWallet(<WalletInsightsScreen now={NOW} />, { resources: fake.resources, locale: 'th' });
-
-  await act(async () => {});
-
-  // Switch to in_out tab
-  const inOutTab = found('insights-tab-in_out');
-  fireEvent.click(inOutTab);
-  await act(async () => {});
-
-  found('in-out-tab');
-  // Plus sign in violet (#6A4BD4)
-  const plus = shown('+');
-  expect(plus.getAttribute('style')).toContain('color: rgba(106, 75, 212, 1.00)');
-
-  shown('เงินเข้า');
-  shown('เงินออก');
-});
+  for (const [mode, locale] of [['light', 'th'], ['dark', 'en']] as const) {
+    const colors = PALETTE[mode];
+    mountInsights({ mode, locale });
+    await settle();
+    await openTab(TABS[locale].inOut);
+    const income = found('in-out-income');
+    expect([income.textContent, income.style.color], mode).toEqual(['+฿25,000', rgba(colors.violet)]);
+    const out = found('in-out-expense');
+    expect([out.textContent, out.style.color], mode).toEqual(['฿3,972.50', rgba(colors.ink)]);
+    expect(textOf('in-out-kept'), mode).toBe(locale === 'th' ? 'เก็บได้ ฿21,027.50' : 'Kept ฿21,027.50');
+    // Six pairs on one scale, September's ฿30,000.00 in at the top: money in violet, money out in ink.
+    const pairs = found('in-out-paired-bars');
+    expect([...pairs.querySelectorAll('rect')].map((bar) => [bar.getAttribute('data-testid'), bar.getAttribute('fill'), bar.getAttribute('height')]), mode).toEqual([
+      ['paired-in-2026-05', colors.violet, '0'], ['paired-out-2026-05', colors.barNow, '3'],
+      ['paired-in-2026-06', colors.violet, '0'], ['paired-out-2026-06', colors.barNow, '0'],
+      ['paired-in-2026-07', colors.violet, '0'], ['paired-out-2026-07', colors.barNow, '9'],
+      ['paired-in-2026-08', colors.violet, '0'], ['paired-out-2026-08', colors.barNow, '22'],
+      ['paired-in-2026-09', colors.violet, '110'], ['paired-out-2026-09', colors.barNow, '33'],
+      ['paired-in-2026-10', colors.violet, '91'], ['paired-out-2026-10', colors.barNow, '14'],
+    ]);
+    expect(labelOf(pairs), mode).toBe(locale === 'th'
+      ? 'เงินเข้าและเงินออกรายเดือน พฤษภาคม 2569ถึงตุลาคม 2569: พฤษภาคม 2569 เงินเข้า ฿0.00 เงินออก ฿20.00, มิถุนายน 2569 เงินเข้า ฿0.00 เงินออก ฿0.00, กรกฎาคม 2569 เงินเข้า ฿0.00 เงินออก ฿2,500.00, สิงหาคม 2569 เงินเข้า ฿0.00 เงินออก ฿6,000.00, กันยายน 2569 เงินเข้า ฿30,000.00 เงินออก ฿9,000.00, ตุลาคม 2569 เงินเข้า ฿25,000.00 เงินออก ฿3,972.50'
+      : 'Money in and out by month, May 2026 to October 2026: May 2026: money in ฿0.00, money out ฿20.00, June 2026: money in ฿0.00, money out ฿0.00, July 2026: money in ฿0.00, money out ฿2,500.00, August 2026: money in ฿0.00, money out ฿6,000.00, September 2026: money in ฿30,000.00, money out ฿9,000.00, October 2026: money in ฿25,000.00, money out ฿3,972.50');
+    expect(pairs.getAttribute('role'), mode).toBe('img');
+    cleanup();
+  }
+});
+
+test('more out than in, and in and out matched, are said in words', async () => {
+  const short = insightsFake({ records: [...OCTOBER.filter((record) => record.type === 'expense'), entry('t30', 'income', '2026-10-03', '100000', SALARY, DAILY)] });
+  mountInsights({ resources: short.resources });
+  await settle();
+  await openTab('เงินเข้า-ออก');
+  expect(textOf('in-out-kept')).toBe('จ่ายออกมากกว่ารับเข้า ฿2,972.50');
+  cleanup();
+  const even = insightsFake({ records: [...OCTOBER.filter((record) => record.type === 'expense'), entry('t31', 'income', '2026-10-03', '397250', SALARY, DAILY)] });
+  mountInsights({ resources: even.resources });
+  await settle();
+  await openTab('เงินเข้า-ออก');
+  expect(textOf('in-out-kept')).toBe('ได้รับเท่ากับที่ใช้ไป');
+});
+
+// ---------------------------------------------------------------------------
+// The calendar

 test('the calendar shades each day by its baht step, frames today and leaves future days inert', async () => {
-  const fake = createFakeResources(seedData());
-  mountWallet(<WalletInsightsScreen now={NOW} />, { resources: fake.resources, locale: 'th', mode: 'light' });
-
-  await act(async () => {});
-
-  // Switch to calendar tab
-  const calendarTab = found('insights-tab-calendar');
-  fireEvent.click(calendarTab);
-  await act(async () => {});
-
-  // 1. Day 1 (3,240 baht): step 5 -> fill #3B2790
-  const day1 = found('calendar-day-1');
-  const step5Paint = calendarPaint(5, false);
-  expect(day1.getAttribute('style')).toContain(`background-color: ${hexToRgba(step5Paint.fill)}`);
-  expect(shown('3,240', day1)).not.toBeNull();
-
-  // 2. Day 2 (412 baht): step 2 -> fill #D5C9F7
-  const day2 = found('calendar-day-2');
-  const step2Paint = calendarPaint(2, false);
-  expect(day2.getAttribute('style')).toContain(`background-color: ${hexToRgba(step2Paint.fill)}`);
-  expect(shown('412', day2)).not.toBeNull();
-
-  // 3. Day 5 (188 baht): step 1 -> fill #EEE9FC
-  const day5 = found('calendar-day-5');
-  const step1Paint = calendarPaint(1, false);
-  expect(day5.getAttribute('style')).toContain(`background-color: ${hexToRgba(step1Paint.fill)}`);
-  expect(shown('188', day5)).not.toBeNull();
-
-  // 4. Day 24 (today): framed 2 pt in ink and named วันนี้
-  const day24 = found('calendar-day-24');
-  expect(day24.getAttribute('style')).toContain('border-width: 2px');
-  expect(day24.getAttribute('style')).toContain('border-color: rgba(17, 16, 20, 1.00)');
-  const day24Label = day24.getAttribute('aria-label') ?? day24.getAttribute('accessibilityLabel') ?? '';
-  expect(day24Label).toContain('วันนี้');
-
-  // 5. Future days (Day 25) are drawn and inert
-  const futureDay25 = found('calendar-future-day-25');
-  expect(futureDay25.getAttribute('role')).toBeNull();
-});
-
-test('a category row opens History filtered to it', async () => {
-  const routerMock = await import('../../dev/catalogue/routerTestStub');
-  const fake = createFakeResources(seedData());
-  mountWallet(<WalletInsightsScreen now={NOW} />, { resources: fake.resources, locale: 'th' });
-
-  await act(async () => {});
-
-  const catRow = found('category-row-c-food');
-  fireEvent.click(catRow);
-  await act(async () => {});
-
-  expect(routerMock.router.push).toHaveBeenCalledWith({
-    pathname: '/spend/all',
-    params: { category: 'c-food' },
-  });
-});
+  for (const mode of ['light', 'dark'] as const) {
+    const colors = PALETTE[mode];
+    mountInsights({ mode });
+    await settle();
+    await openTab('ปฏิทิน');
+    const paint = (step: 0 | 1 | 2 | 3 | 4 | 5) => calendarPaint(step, mode === 'dark');
+    // 3,240.50 is step 5, 412 step 2, 188 step 1, today's 132 step 1, and a day with nothing is step 0 with its hairline.
+    for (const [n, step, amount] of [[1, 5, '3,240'], [2, 2, '412'], [5, 1, '188'], [24, 1, '132'], [3, 0, null]] as const) {
+      const cell = day(n);
+      expect([cell.style.backgroundColor, within(cell).queryByTestId(`calendar-day-amount-${n}`)?.textContent ?? null], `${mode} day ${n}`).toEqual([rgba(paint(step).fill), amount]);
+      expect(within(cell).getByText(String(n)).style.color, `${mode} day ${n}`).toBe(rgba(paint(step).text));
+    }
+    expect([day(3).style.borderTopWidth, day(3).style.borderTopColor], mode).toEqual(['1px', rgba(paint(0).border!)]);
+    expect([day(1).style.borderTopWidth, day(2).style.borderTopWidth], mode).toEqual(['0px', '0px']);
+    expect([day(24).style.borderTopWidth, day(24).style.borderTopColor], mode).toEqual(['2px', rgba(colors.ink)]);
+    // Days after today are drawn, are no buttons and are hidden from screen readers.
+    const future = found('calendar-future-day-25');
+    expect([future.textContent, future.getAttribute('role'), hiddenFromScreenReaders(future)], mode).toEqual(['25', null, true]);
+    expect(screen.queryAllByRole('button').filter((button) => /^calendar-day-/.test(button.getAttribute('data-testid') ?? '')), mode).toHaveLength(24);
+    cleanup();
+  }
+});
+
+test('each day button says its date and its money out, today named and drafts said apart', async () => {
+  const diary = createFakeDiary({ outbox: [queued(draftEntry({ occurred_on: '2026-10-24' }), 'unsent')] });
+  mountInsights({ diary: diary.diary });
+  await settle();
+  await openTab('ปฏิทิน');
+  expect([labelOf(day(1)), labelOf(day(3)), labelOf(day(24))]).toEqual([
+    'วันพฤหัสบดีที่ 1 ตุลาคม 2569, จ่ายออก ฿3,240.50',
+    'วันเสาร์ที่ 3 ตุลาคม 2569, ไม่มีรายการ',
+    'วันนี้, วันเสาร์ที่ 24 ตุลาคม 2569, จ่ายออก ฿132.00, รอซิงก์: เงินออก ฿65.00',
+  ]);
+  cleanup();
+  mountInsights({ locale: 'en' });
+  await settle();
+  await openTab('Calendar');
+  expect([labelOf(day(1)), labelOf(day(3)), labelOf(day(24))]).toEqual([
+    'Thursday 1 October 2026, Money out ฿3,240.50',
+    'Saturday 3 October 2026, Nothing logged',
+    'Today, Saturday 24 October 2026, Money out ฿132.00',
+  ]);
+});
+
+test("the calendar's month line, legend and chosen day are wc-calendar's, every amount exact", async () => {
+  mountInsights();
+  await settle();
+  await openTab('ปฏิทิน');
+  expect(named('heading', 'ตุลาคม 2569')).not.toBeNull();
+  expect(screen.queryAllByText('ตุลาคม 2569')).toHaveLength(1);
+  expect(textOf('calendar-month-line')).toBe('ใช้ไป ฿3,972.50 · จด 4 จาก 24 วัน');
+  const legend = found('calendar-legend');
+  expect([legend.getAttribute('role'), labelOf(legend)]).toEqual(['img', 'สีเข้มขึ้นเมื่อใช้มากขึ้น ตั้งแต่ 0 ถึงมากกว่า 2,000 บาทต่อวัน กรอบคือวันนี้']);
+  expect([0, 1, 2, 3, 4, 5].map((step) => textOf(`legend-label-${step}`))).toEqual(['0', '≤200', '≤500', '≤1,000', '≤2,000', '2,000+']);
+  expect(textOf('legend-unit')).toBe('บาท\nต่อวัน');
+  expect([0, 1, 2, 3, 4, 5].map((step) => found(`legend-swatch-${step}`).style.backgroundColor)).toEqual([0, 1, 2, 3, 4, 5].map((step) => rgba(calendarPaint(step as 0, false).fill)));
+  // Today is chosen first; another day shows its own records, with each category and wallet named.
+  expect(wordsOf(found('calendar-chosen-day-section'))).toBe('เสาร์ 24 ต.ค. · วันนี้1 รายการ฿132Coffee Shopอาหาร · Cash฿132');
+  expect(named('heading', 'เสาร์ 24 ต.ค. · วันนี้')).not.toBeNull();
+  expect(day(24).getAttribute('aria-selected')).toBe('true');
+  await press(day(1));
+  expect(wordsOf(found('calendar-chosen-day-section'))).toBe('พฤหัส 1 ต.ค.1 รายการ฿3,240.50Dinnerอาหาร · Cash฿3,240.50');
+  expect([day(1).getAttribute('aria-selected'), day(24).getAttribute('aria-selected')]).toEqual(['true', 'false']);
+  await press(day(5));
+  expect(wordsOf(found('calendar-chosen-day-section'))).toBe('จันทร์ 5 ต.ค.1 รายการ฿188BTSการเดินทาง · Daily account฿188');
+});
+
+test('a record with no merchant or note is named by its category, and one whose wallet is no longer listed by its category alone', async () => {
+  const records = [...OCTOBER, ...BEFORE, entry('t40', 'expense', '2026-10-24', '2500', TRAVEL, { ...CASH, id: '0000000a-0000-4000-8000-0000000000ff' })];
+  mountInsights({ resources: insightsFake({ records }).resources });
+  await settle();
+  await openTab('ปฏิทิน');
+  expect(wordsOf(found('day-record-t40'))).toBe('การเดินทางการเดินทาง฿25');
+});
+
+test('the calendar steps back a month and never draws October under September; next stops at this month', async () => {
+  const { fake, resources } = insightsFake();
+  mountInsights({ resources });
+  await settle();
+  await openTab('ปฏิทิน');
+  const next = named('button', 'เดือนถัดไป');
+  expect([next.getAttribute('aria-disabled'), next.style.opacity]).toEqual(['true', '0.4']);
+  await press(next);
+  expect(textOf('calendar-month-line')).toBe('ใช้ไป ฿3,972.50 · จด 4 จาก 24 วัน');
+  const release = fake.hold('summary');
+  fireEvent.click(named('button', 'เดือนก่อน'));
+  await settle();
+  // While September loads, nothing of October is drawn under its name.
+  expect([screen.queryByTestId('calendar-tab'), textOf('insights-loading')]).toEqual([null, 'กำลังโหลดบันทึกของคุณ']);
+  await act(async () => release());
+  await settle();
+  expect(named('heading', 'กันยายน 2569')).not.toBeNull();
+  expect(textOf('calendar-month-line')).toBe('ใช้ไป ฿9,000 · จด 2 จาก 30 วัน');
+  expect(textOf('calendar-chosen-day')).toBe('อังคาร 1 ก.ย.');
+  expect(drawn.calendars.every(({ month, days }) => days.every((date) => date.startsWith(`${month}-`))), JSON.stringify(drawn.calendars.map(({ month }) => month))).toBe(true);
+  expect(drawn.calendars.some(({ month }) => month === '2026-09')).toBe(true);
+  expect(named('button', 'เดือนถัดไป').getAttribute('aria-disabled')).toBeNull();
+  // A month gone by has no days left to count.
+  await openTab('ใช้จ่าย');
+  expect([textOf('spending-hero-amount'), screen.queryByTestId('spending-days-left')]).toEqual(['฿9,000', null]);
+  await openTab('ปฏิทิน');
+  await press(named('button', 'เดือนถัดไป'));
+  expect(named('heading', 'ตุลาคม 2569')).not.toBeNull();
+});
+
+test('every page of the month is read', async () => {
+  const { fake, resources } = insightsFake();
+  // Pages of two: October's five records take three pages.
+  const paged: SpendV1Resources = { ...resources, history: (filter, cursor) => fake.resources.history(filter, cursor, 2) };
+  mountInsights({ resources: paged });
+  await settle();
+  expect(fake.callsOf('history').map((call) => call.args[1])).toEqual([undefined, 'c2', 'c4']);
+  await openTab('ปฏิทิน');
+  expect([labelOf(day(1)), labelOf(day(24))]).toEqual(['วันพฤหัสบดีที่ 1 ตุลาคม 2569, จ่ายออก ฿3,240.50', 'วันนี้, วันเสาร์ที่ 24 ตุลาคม 2569, จ่ายออก ฿132.00']);
+  expect(textOf('calendar-month-line')).toBe('ใช้ไป ฿3,972.50 · จด 4 จาก 24 วัน');
+});
+
+// ---------------------------------------------------------------------------
+// The early state

 test('with two logged days the early state asks for one more day', async () => {
-  // Seed with records on only 2 distinct days
-  const twoDayRecords = [
-    { id: 't1', type: 'expense', amount_minor: '10000', occurred_on: '2026-10-01', wallet_id: 'w1', category_id: 'c-food', note: null, merchant: null, deleted_at: null, version: 1 },
-    { id: 't2', type: 'expense', amount_minor: '20000', occurred_on: '2026-10-02', wallet_id: 'w1', category_id: 'c-food', note: null, merchant: null, deleted_at: null, version: 1 },
-  ] as TransactionDto[];
-
-  const fake = createFakeResources(seedData(twoDayRecords));
-  mountWallet(<WalletInsightsScreen now={NOW} />, { resources: fake.resources, locale: 'th' });
-
-  await act(async () => {});
-
-  found('insights-early-state');
-  shown('จดอีก 1 วัน กราฟจะขึ้นตรงนี้');
-  shown('กราฟต้องมีบันทึกอย่างน้อย 3 วัน ถึงจะเทียบกันได้');
-});
-
-test('the insights catalogue sections are registered and render correctly', async () => {
-  expect(WALLET_INSIGHTS_SECTIONS.length).toBe(6);
+  const early = insightsFake({ records: [OCTOBER[0], OCTOBER[2]] });
+  mountInsights({ resources: early.resources });
+  await settle();
+  const state = found('insights-early-state');
+  expect(named('heading', 'จดอีก 1 วัน กราฟจะขึ้นตรงนี้', state)).not.toBeNull();
+  expect(within(state).queryByText('กราฟต้องมีบันทึกอย่างน้อย 3 วัน ถึงจะเทียบกันได้')).not.toBeNull();
+  // es-empty-insights: each logged day by its own date, then the day still to log.
+  expect([0, 1, 2].map((index) => textOf(`insights-early-day-${index}`))).toEqual(['พฤหัส 1 ต.ค.', 'ศุกร์ 2 ต.ค.', 'วันถัดไป']);
+  expect(screen.queryByTestId('insights-month-bars')).toBeNull();
+  expect(named('heading', 'ที่จดไว้แล้ว')).not.toBeNull();
+  expect(textOf('insights-no-previous')).toBe('ยังไม่มีเดือนก่อนให้เทียบ');
+  expect(rowsOf('insights-categories')).toEqual(['อาหาร2 รายการ฿3,652.50']);
+  cleanup();
+  // An earlier month with money out: no "no earlier month".
+  mountInsights({ resources: insightsFake({ records: [OCTOBER[0], OCTOBER[2], BEFORE[3]] }).resources, locale: 'en' });
+  await settle();
+  expect([0, 1, 2].map((index) => textOf(`insights-early-day-${index}`))).toEqual(['Thu 1 Oct', 'Fri 2 Oct', 'Next day']);
+  expect(screen.queryByTestId('insights-no-previous')).toBeNull();
+  cleanup();
+  // Three logged days: the chart.
+  mountInsights({ resources: insightsFake({ records: [OCTOBER[0], OCTOBER[2], OCTOBER[3]] }).resources });
+  await settle();
+  expect([screen.queryByTestId('insights-early-state'), screen.queryByTestId('insights-month-bars') !== null]).toEqual([null, true]);
+  expect(named('heading', 'หมวดหมู่')).not.toBeNull();
+  cleanup();
+  // Nothing logged yet: three days to log, and no categories.
+  mountInsights({ resources: insightsFake({ records: [] }).resources });
+  await settle();
+  expect(named('heading', 'จดอีก 3 วัน กราฟจะขึ้นตรงนี้')).not.toBeNull();
+  expect([0, 1, 2].map((index) => textOf(`insights-early-day-${index}`))).toEqual(['วันถัดไป', 'วันถัดไป', 'วันถัดไป']);
+  expect(screen.queryByTestId('insights-categories')).toBeNull();
+});
+
+// ---------------------------------------------------------------------------
+// The load
+
+test('a diary sync never blanks the screen or resets it, and reads nothing again', async () => {
+  const { fake, resources } = insightsFake();
+  const diary = createFakeDiary();
+  mountInsights({ resources, diary: diary.diary });
+  await settle();
+  const before = reads(fake);
+  await press(named('button', 'ตัวเลขนี้คืออะไร'));
+  // What the diary does after every sync run: a new view with a new, equal outbox.
+  await act(async () => diary.set({ outbox: [] }));
+  await settle();
+  expect(named('dialog', 'ตัวเลขนี้คืออะไร')).not.toBeNull();
+  cleanup();
+  mountInsights({ resources, diary: diary.diary });
+  await settle();
+  await openTab('ปฏิทิน');
+  await press(day(2));
+  const counted = reads(fake);
+  await act(async () => diary.set({ outbox: [] }));
+  await settle();
+  await act(async () => diary.set({ outbox: [] }));
+  await settle();
+  expect([textOf('calendar-chosen-day'), screen.queryByTestId('insights-loading')]).toEqual(['ศุกร์ 2 ต.ค.', null]);
+  expect(reads(fake)).toEqual(counted);
+  expect(before).toEqual([6, 1, 1, 1]);
+});
+
+test('a draft saved meanwhile shows at once, and one that resolves refreshes in place', async () => {
+  const { fake, resources } = insightsFake();
+  const diary = createFakeDiary();
+  mountInsights({ resources, diary: diary.diary });
+  await settle();
+  await openTab('ปฏิทิน');
+  await press(day(2));
+  const counted = reads(fake);
+  const draft = queued(draftEntry({ occurred_on: '2026-10-24' }), 'unsent');
+  await act(async () => diary.set({ outbox: [draft] }));
+  await settle();
+  expect(labelOf(day(24))).toBe('วันนี้, วันเสาร์ที่ 24 ตุลาคม 2569, จ่ายออก ฿132.00, รอซิงก์: เงินออก ฿65.00');
+  expect(reads(fake)).toEqual(counted);
+  // It is sent and acknowledged: the month is read again, quietly, and the chosen day stays.
+  const release = fake.hold('summary');
+  await act(async () => diary.set({ outbox: [{ ...draft, state: 'acknowledged', ackedRevision: '11' }] }));
+  await settle();
+  expect([textOf('calendar-chosen-day'), screen.queryByTestId('insights-loading')]).toEqual(['ศุกร์ 2 ต.ค.', null]);
+  await act(async () => release());
+  await settle();
+  expect(reads(fake)).toEqual([counted[0] + 6, counted[1] + 1, counted[2] + 1, counted[3] + 1]);
+  expect([textOf('calendar-chosen-day'), labelOf(day(24))]).toEqual(['ศุกร์ 2 ต.ค.', 'วันนี้, วันเสาร์ที่ 24 ตุลาคม 2569, จ่ายออก ฿132.00']);
+});
+
+test('a compare month that cannot be read is never drawn as ฿0: the problem says so with Try again', async () => {
+  const { fake, resources } = insightsFake();
+  let failing = true;
+  const september: SpendV1Resources = {
+    ...resources,
+    summary: async (month) => {
+      if (month === '2026-09' && failing) {
+        failing = false;
+        throw new V1Error('network', 0, 'NETWORK_ERROR');
+      }
+      return resources.summary(month);
+    },
+  };
+  mountInsights({ resources: september, diary: null });
+  await settle();
+  const problem = found('insights-problem');
+  expect(named('heading', 'โหลดข้อมูลเดือนนี้ไม่สำเร็จ', problem)).not.toBeNull();
+  expect(within(problem).queryByText('ข้อมูลของคุณยังอยู่ครบ นี่เป็นปัญหาการเชื่อมต่อ ไม่ใช่เดือนที่ไม่มีรายการ')).not.toBeNull();
+  expect(screen.queryByTestId('insights-month-bars')).toBeNull();
+  // The month shown shares its own summary with its bar: October and the four others, once each.
+  expect(fake.callsOf('summary').map((call) => call.args[0]).sort()).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-10']);
+  await press(named('button', 'ลองอีกครั้ง', problem));
+  expect(labelOf(found('insights-month-bars'))).toContain('กันยายน 2569 ฿9,000.00');
+  expect(screen.queryByTestId('insights-problem')).toBeNull();
+});
+
+test('offline is said with the banner where a diary is open; a problem a retry cannot fix offers no Try again', async () => {
+  const offline = insightsFake();
+  offline.fake.fail('history', 'network', { code: 'NETWORK_ERROR' });
+  mountInsights({ resources: offline.resources });
+  await settle();
+  expect(found('insights-problem').textContent).toBe('ออฟไลน์อยู่ รายการใหม่จะบันทึกไว้ในเครื่องนี้โหลดข้อมูลเดือนนี้ไม่สำเร็จข้อมูลของคุณยังอยู่ครบ นี่เป็นปัญหาการเชื่อมต่อ ไม่ใช่เดือนที่ไม่มีรายการลองอีกครั้ง');
+  cleanup();
+  const web = insightsFake();
+  web.fake.fail('history', 'network', { code: 'NETWORK_ERROR' });
+  mountInsights({ resources: web.resources, diary: null });
+  await settle();
+  expect(found('insights-problem').textContent).toBe('โหลดข้อมูลเดือนนี้ไม่สำเร็จข้อมูลของคุณยังอยู่ครบ นี่เป็นปัญหาการเชื่อมต่อ ไม่ใช่เดือนที่ไม่มีรายการลองอีกครั้ง');
+  cleanup();
+  // A diary that is not open keeps nothing on this phone to speak of.
+  const locked = insightsFake();
+  locked.fake.fail('history', 'network', { code: 'NETWORK_ERROR' });
+  mountInsights({ resources: locked.resources, diary: createFakeDiary({ phase: 'locked', lockReason: null }).diary });
+  await settle();
+  expect(found('insights-problem').textContent).toBe('โหลดข้อมูลเดือนนี้ไม่สำเร็จข้อมูลของคุณยังอยู่ครบ นี่เป็นปัญหาการเชื่อมต่อ ไม่ใช่เดือนที่ไม่มีรายการลองอีกครั้ง');
+  cleanup();
+  const signedOut = insightsFake();
+  signedOut.fake.fail('categories', 'signed_out');
+  mountInsights({ resources: signedOut.resources, locale: 'en' });
+  await settle();
+  const problem = found('insights-problem');
+  expect(problem.textContent).toBe('Signed outSign in again to see your diary.');
+  expect(within(problem).queryByRole('button')).toBeNull();
+});
+
+test('entries changed meanwhile are said, with Refresh', async () => {
+  const { fake, resources } = insightsFake();
+  let changed = true;
+  const later: SpendV1Resources = {
+    ...resources,
+    history: async (filter, cursor, limit) => {
+      const page = await fake.resources.history(filter, cursor, 2);
+      return cursor === 'c2' && changed ? { ...page, refresh_suggested: true } : page;
+    },
+  };
+  mountInsights({ resources: later });
+  await settle();
+  expect(found('insights-changed').textContent).toBe('มีการเปลี่ยนแปลงรายการหลังจากที่คุณเปิดรายการนี้รีเฟรช');
+  changed = false;
+  await press(named('button', 'รีเฟรช'));
+  expect([screen.queryByTestId('insights-changed'), screen.queryByTestId('insights-month-bars') !== null]).toEqual([null, true]);
+});
+
+// ---------------------------------------------------------------------------
+// Private mode (R65)
+
+test("in private mode the chart's name carries no amount and the calendar is one neutral fill with no legend values", async () => {
+  for (const [mode, locale] of [['light', 'th'], ['dark', 'en']] as const) {
+    const colors = PALETTE[mode];
+    mountInsights({ mode, locale, device: { [PRIVATE_MODE_NAME]: '1' } });
+    await settle();
+    expect(labelOf(found('insights-month-bars')), mode).toBe(locale === 'th'
+      ? 'ใช้จ่ายรายเดือน พฤษภาคม 2569ถึงตุลาคม 2569: พฤษภาคม 2569, มิถุนายน 2569, กรกฎาคม 2569, สิงหาคม 2569, กันยายน 2569, ตุลาคม 2569 ถึงตอนนี้'
+      : 'Monthly spending, May 2026 to October 2026: May 2026, June 2026, July 2026, August 2026, September 2026, October 2026 so far');
+    expect([textOf('spending-hero-amount'), textOf('insights-budget-label')], mode).toEqual(['฿••••', locale === 'th' ? 'งบ ฿••••' : 'Budget ฿••••']);
+    await openTab(TABS[locale].calendar);
+    // Every day alike: one neutral fill, ink numbers, no amount, no border but today's frame.
+    for (const n of [1, 2, 3, 5, 24]) {
+      const cell = day(n);
+      expect([cell.style.backgroundColor, within(cell).getByText(String(n)).style.color, within(cell).queryByTestId(`calendar-day-amount-${n}`)], `${mode} day ${n}`).toEqual([rgba(colors.raised), rgba(colors.ink), null]);
+    }
+    expect([1, 2, 3, 5].map((n) => day(n).style.borderTopWidth), mode).toEqual(['0px', '0px', '0px', '0px']);
+    expect([day(24).style.borderTopWidth, day(24).style.borderTopColor], mode).toEqual(['2px', rgba(colors.ink)]);
+    // Each day says its date alone.
+    expect([labelOf(day(1)), labelOf(day(3)), labelOf(day(24))], mode).toEqual(locale === 'th'
+      ? ['วันพฤหัสบดีที่ 1 ตุลาคม 2569', 'วันเสาร์ที่ 3 ตุลาคม 2569', 'วันนี้, วันเสาร์ที่ 24 ตุลาคม 2569']
+      : ['Thursday 1 October 2026', 'Saturday 3 October 2026', 'Today, Saturday 24 October 2026']);
+    expect(textOf('calendar-month-line'), mode).toBe(locale === 'th' ? 'ใช้ไป ฿•••• · จด 4 จาก 24 วัน' : 'Spent ฿•••• · logged 4 of 24 days');
+    // The legend keeps its swatches, with no values, no unit and nothing said of amounts.
+    expect([0, 5].map((step) => found(`legend-swatch-${step}`).style.backgroundColor), mode).toEqual([rgba(calendarPaint(0, mode === 'dark').fill), rgba(calendarPaint(5, mode === 'dark').fill)]);
+    expect([screen.queryByTestId('legend-label-0'), screen.queryByTestId('legend-label-5'), screen.queryByTestId('legend-unit')], mode).toEqual([null, null, null]);
+    expect(labelOf(found('calendar-legend')), mode).toBe(locale === 'th' ? 'กรอบคือวันนี้' : 'The framed day is today');
+    expect(textOf('calendar-chosen-day-total'), mode).toBe('฿••••');
+    const shown = document.body.textContent ?? '';
+    for (const secret of ['3,240', '3,972', '412', '188', '132', '18,000']) expect(shown, `${mode} ${secret}`).not.toContain(secret);
+    cleanup();
+  }
+});
+
+test('in private mode the in-and-out tab masks every amount and keeps its words', async () => {
+  for (const locale of ['th', 'en'] as const) {
+    mountInsights({ locale, device: { [PRIVATE_MODE_NAME]: '1' } });
+    await settle();
+    await openTab(TABS[locale].inOut);
+    expect([textOf('in-out-income'), textOf('in-out-expense'), textOf('in-out-kept')], locale).toEqual(['฿••••', '฿••••', locale === 'th' ? 'เก็บได้ ฿••••' : 'Kept ฿••••']);
+    expect(labelOf(found('in-out-paired-bars')), locale).toBe(locale === 'th'
+      ? 'เงินเข้าและเงินออกรายเดือน พฤษภาคม 2569ถึงตุลาคม 2569: พฤษภาคม 2569, มิถุนายน 2569, กรกฎาคม 2569, สิงหาคม 2569, กันยายน 2569, ตุลาคม 2569'
+      : 'Money in and out by month, May 2026 to October 2026: May 2026, June 2026, July 2026, August 2026, September 2026, October 2026');
+    cleanup();
+  }
+  mountInsights({ device: { [PRIVATE_MODE_NAME]: '1' }, resources: insightsFake({ records: [...OCTOBER.filter((record) => record.type === 'expense'), entry('t30', 'income', '2026-10-03', '100000', SALARY, DAILY)] }).resources });
+  await settle();
+  await openTab('เงินเข้า-ออก');
+  expect(textOf('in-out-kept')).toBe('จ่ายออกมากกว่ารับเข้า ฿••••');
+});
+
+// ---------------------------------------------------------------------------
+// Languages and text sizes
+
+test('in English the insights carry no Thai: weekdays, today, the per-day unit and entries are its own words', async () => {
+  mountInsights({ locale: 'en', mode: 'dark' });
+  await settle();
+  expect(named('heading', 'Insights')).not.toBeNull();
+  expect(found('spending-tab').textContent).toBe('฿3,972.50Spent so far · 8 days to the end of the monthBudget ฿18,000MayJunJulAugSepOctCategoriesFood3 entries฿3,784.50Travel1 entries฿188');
+  await openTab('In and out');
+  expect(found('in-out-tab').textContent).not.toMatch(THAI_LETTERS);
+  expect(found('in-out-tab').textContent).toContain('Money in+฿25,000Money out฿3,972.50Kept ฿21,027.50');
+  await openTab('Calendar');
+  const calendar = found('calendar-tab');
+  expect(calendar.textContent).not.toMatch(THAI_LETTERS);
+  expect(calendar.textContent).toContain('October 2026Spent ฿3,972.50 · logged 4 of 24 daysSMTWTFS');
+  expect([textOf('legend-unit'), textOf('calendar-chosen-day')]).toEqual(['baht\na day', 'Sat 24 Oct · Today']);
+  expect(wordsOf(found('calendar-chosen-day-section'))).toBe('Sat 24 Oct · Today1 entries฿132Coffee ShopFood · Cash฿132');
+  expect(labelOf(found('calendar-legend'))).toBe('Darker as you spend more, from 0 to over 2,000 baht a day The framed day is today');
+  expect(named('button', 'Previous month')).not.toBeNull();
+});
+
+test("at AX5 the calendar's days stay 44 pt wide and grow taller, and nothing is cut", async () => {
+  mountInsights({ fontScale: AX5 });
+  await settle();
+  await openTab('ปฏิทิน');
+  const grid = found('calendar-grid');
+  for (const cell of [day(1), day(24), found('calendar-future-day-25')]) {
+    expect([cell.style.minWidth, cell.style.minHeight, cell.style.height], cell.textContent ?? '').toEqual(['44px', '50px', '']);
+  }
+  expect([...grid.children].map((row) => (row as HTMLElement).style.columnGap || (row as HTMLElement).style.gap)).toEqual(['4px', '4px', '4px', '4px', '4px']);
+  // The grid's numbers stop at the largest standard size, in DM Sans; every other word keeps its role's scale.
+  const grown = (text: string) => seen.props.filter((props) => props.children === text).map((props) => [props.maxFontSizeMultiplier, (props.style as { fontFamily?: string }).fontFamily]);
+  expect(grown('3,240').at(-1)).toEqual([LARGEST_STANDARD_SCALE, LATIN_UI_FONT_FAMILY]);
+  expect(grown('24').at(-1)).toEqual([LARGEST_STANDARD_SCALE, LATIN_UI_FONT_FAMILY]);
+  expect(grown('2,000+').at(-1)).toEqual([LARGEST_STANDARD_SCALE, LATIN_UI_FONT_FAMILY]);
+  for (const props of seen.props) expect([props.numberOfLines, props.adjustsFontSizeToFit, props.ellipsizeMode]).toEqual([undefined, undefined, undefined]);
+});
+
+// ---------------------------------------------------------------------------
+// The catalogue
+
+test("the catalogue's insights sections draw the real screen on fakes, one state each", async () => {
+  expect(WALLET_INSIGHTS_SECTIONS.map((section) => [section.id, section.group, section.layout])).toEqual([
+    ['bw-insights', 'Screens', 'screen'], ['bw-insights-in-out', 'Screens', 'screen'], ['bw-calendar', 'Screens', 'screen'],
+    ['bw-insights-early', 'Screens', 'screen'], ['bw-insights-private', 'Screens', 'screen'], ['bw-insights-large', 'Screens', 'screen'],
+  ]);
+  const ids = WALLET_SECTIONS.map((section) => section.id);
+  expect(ids.filter((id) => WALLET_INSIGHTS_SECTIONS.some((section) => section.id === id))).toEqual(WALLET_INSIGHTS_SECTIONS.map((section) => section.id));
+  const states: Readonly<Record<string, () => unknown>> = {
+    'bw-insights': () => [textOf('spending-hero-amount'), textOf('insights-budget-label'), textOf('spending-days-left')],
+    'bw-insights-in-out': () => [textOf('in-out-income'), textOf('in-out-kept')],
+    'bw-calendar': () => [textOf('calendar-month-line'), wordsOf(found('calendar-chosen-day-section'))],
+    'bw-insights-early': () => [0, 1, 2].map((index) => textOf(`insights-early-day-${index}`)).concat(textOf('insights-no-previous') ?? ''),
+    'bw-insights-private': () => [textOf('calendar-month-line'), screen.queryByTestId('calendar-day-amount-1'), labelOf(day(1))],
+    'bw-insights-large': () => [textOf('spending-hero-amount'), rowsOf('insights-categories')],
+  };
+  const expected: Readonly<Record<string, unknown>> = {
+    'bw-insights': ['฿12,480', 'งบ ฿18,000', 'ใช้ไปแล้ว · อีก 8 วันจบเดือน'],
+    'bw-insights-in-out': ['+฿35,000', 'เก็บได้ ฿22,520'],
+    'bw-calendar': ['ใช้ไป ฿12,480 · จด 22 จาก 24 วัน', 'เสาร์ 24 ต.ค. · วันนี้3 รายการ฿132กาแฟเย็นอาหาร · เงินสด฿65BTSการเดินทาง · บัญชีหลัก฿47วินการเดินทาง · เงินสด฿20'],
+    'bw-insights-early': ['ศุกร์ 23 ต.ค.', 'เสาร์ 24 ต.ค.', 'วันถัดไป', 'ยังไม่มีเดือนก่อนให้เทียบ'],
+    'bw-insights-private': ['ใช้ไป ฿•••• · จด 22 จาก 24 วัน', null, 'วันพฤหัสบดีที่ 1 ตุลาคม 2569'],
+    'bw-insights-large': ['฿999,999,999.99', ['ค่าเทอมลูก ค่าเรียนพิเศษ และค่าใช้จ่ายในบ้านของครอบครัวใหญ่ทุกเดือนตลอดทั้งปีน้า1 รายการ฿999,999,998.99', 'อาหาร2 รายการ฿1']],
+  };
   for (const section of WALLET_INSIGHTS_SECTIONS) {
-    expect(section.id.startsWith('bw-')).toBe(true);
-    expect(section.title.startsWith('Bun Wallet: ')).toBe(true);
-    expect(section.render()).not.toBeNull();
-  }
-});
-
-function hexToRgba(hex: string): string {
-  const n = Number.parseInt(hex.replace('#', ''), 16);
-  const r = (n >> 16) & 255;
-  const g = (n >> 8) & 255;
-  const b = n & 255;
-  return `rgba(${r}, ${g}, ${b}, 1.00)`;
-}
+    mountWallet(<>{section.render()}</>);
+    // The section's script runs its steps, then the stage says ready, or where it stopped.
+    await waitFor(() => expect(screen.queryByTestId('catalogue-screen-running')).toBeNull(), { timeout: 15_000 });
+    expect(screen.queryByTestId('catalogue-screen-ready'), section.id).not.toBeNull();
+    expect(states[section.id](), section.id).toEqual(expected[section.id]);
+    cleanup();
+  }
+}, 60_000);
```

### `apps/app/src/dev/catalogue/wallet/insightsSections.tsx`

```diff
diff --git a/apps/app/src/dev/catalogue/wallet/insightsSections.tsx b/apps/app/src/dev/catalogue/wallet/insightsSections.tsx
--- a/apps/app/src/dev/catalogue/wallet/insightsSections.tsx
+++ b/apps/app/src/dev/catalogue/wallet/insightsSections.tsx
@@ -1,201 +1,47 @@
-// The Bun Wallet insights catalogue sections (P2-T31, development only):
-// standard spending (bw-insights), in-out (bw-insights-in-out), calendar (bw-calendar),
-// early state (bw-insights-early), private mode (bw-insights-private), and large text (bw-insights-large).
-import type { CategoryDto, MonthSummary, TransactionDto } from '@gogospend/contracts';
+// The Bun Wallet insights in the catalogue (P2-T31, development only): the
+// real WalletInsightsScreen on fakes, one section per state for E2-C, in the
+// 'Screens' group, as the wallets list and the month recap draw theirs.
+//
+// The screen and its fakes are in ./insightsScreens.tsx, loaded when a section
+// opens: the screen brings expo-router, which only the screens' own tests
+// stand in for, and the wallet harness's and the tray's tests import this list
+// without it. While that module loads, a section reads
+// `catalogue-screen-running`, so the catalogue waits for it as it waits for a
+// screen's script (screenSection.tsx). A section never imports the wallet test
+// harness, which loads vitest.
 import { lazy, Suspense } from 'react';
 import { View } from 'react-native';

-import { useWalletColors } from '@mobile/theme/ThemeProvider';
-import { BUN_SPACE } from '@mobile/ui/layout';
-import { PRIVATE_MODE_NAME, PrivateModeProvider } from '@mobile/wallet/privacy/PrivateModeProvider';
-import type { KeyValueStore } from '@mobile/wallet/store/walletStore';
-import { Specimen, SpecimenLabel } from '../parts';
 import type { CatalogueSection } from '../registry';
-import type { InsightsData } from '../../../wallet/insights/insightsData';

-const SpendingTab = lazy(() => import('../../../wallet/insights/SpendingTab').then((m) => ({ default: m.SpendingTab })));
-const InOutTab = lazy(() => import('../../../wallet/insights/InOutTab').then((m) => ({ default: m.InOutTab })));
-const CalendarTab = lazy(() => import('../../../wallet/insights/CalendarTab').then((m) => ({ default: m.CalendarTab })));
+/** The insights' states, in the order the catalogue steps through them. */
+export const WALLET_INSIGHTS_IDS = ['bw-insights', 'bw-insights-in-out', 'bw-calendar', 'bw-insights-early', 'bw-insights-private', 'bw-insights-large'] as const;
+export type WalletInsightsId = (typeof WALLET_INSIGHTS_IDS)[number];

-function memoryStore(seed: Readonly<Record<string, string>>): KeyValueStore {
-  const kept = new Map(Object.entries(seed));
-  return {
-    get: async (name) => kept.get(name) ?? null,
-    set: async (name, value) => {
-      kept.set(name, value);
-    },
-    remove: async (name) => {
-      kept.delete(name);
-    },
-    eraseAll: async () => {
-      kept.clear();
-    },
-  };
+export const WALLET_INSIGHTS_TITLES: Readonly<Record<WalletInsightsId, string>> = {
+  'bw-insights': 'Bun Wallet: Insights, spending',
+  'bw-insights-in-out': 'Bun Wallet: Insights, in and out',
+  'bw-calendar': 'Bun Wallet: Insights, calendar',
+  'bw-insights-early': 'Bun Wallet: Insights, the first days',
+  'bw-insights-private': 'Bun Wallet: Insights, calendar in private mode',
+  'bw-insights-large': 'Bun Wallet: Insights, the largest amount',
+};
+
+const InsightsScreenSection = lazy(() => import('./insightsScreens'));
+
+/** What the catalogue meets while the screen's module loads. */
+function Loading() {
+  return <View testID="catalogue-screen-running" style={{ flex: 1 }} />;
 }

-const SAMPLE_MONTH = '2026-10';
-const SAMPLE_TODAY = '2026-10-24';
-
-const SAMPLE_CATEGORIES: CategoryDto[] = [
-  { id: 'c-food', type: 'expense', builtin_key: 'food', label: 'อาหาร', color: '#FFE3CC', archived: false, version: 1 },
-  { id: 'c-fam', type: 'expense', builtin_key: 'household', label: 'ส่งให้ครอบครัว', color: '#FFDDE6', archived: false, version: 1 },
-  { id: 'c-shop', type: 'expense', builtin_key: 'shopping', label: 'ช้อปปิ้ง', color: '#E9E1FF', archived: false, version: 1 },
-  { id: 'c-trav', type: 'expense', builtin_key: 'travel', label: 'เดินทาง', color: '#DCE8FF', archived: false, version: 1 },
-];
-
-const SAMPLE_SUMMARY: MonthSummary = {
-  month: SAMPLE_MONTH,
-  expense_minor: '1248000',
-  income_minor: '3500000',
-  balance_minor: '2252000',
-  by_wallet: {},
-  as_of_revision: '1',
-  budget: {
-    overall_limit_minor: '1800000',
-    spent_minor: '1248000',
-    remaining_minor: '552000',
-    categories: [],
-  },
-  categories: [
-    { category_id: 'c-food', type: 'expense', total_minor: '462000' },
-    { category_id: 'c-fam', type: 'expense', total_minor: '300000' },
-    { category_id: 'c-shop', type: 'expense', total_minor: '231000' },
-    { category_id: 'c-trav', type: 'expense', total_minor: '198000' },
-  ],
-};
-
-const SAMPLE_RECORDS: TransactionDto[] = [
-  { id: 'r1', type: 'expense', amount_minor: '324000', occurred_on: '2026-10-01', wallet_id: 'w1', category_id: 'c-food', note: 'Dinner', merchant: null, deleted_at: null, version: 1 },
-  { id: 'r2', type: 'expense', amount_minor: '41200', occurred_on: '2026-10-02', wallet_id: 'w1', category_id: 'c-food', note: 'Lunch', merchant: null, deleted_at: null, version: 1 },
-  { id: 'r3', type: 'expense', amount_minor: '18800', occurred_on: '2026-10-05', wallet_id: 'w1', category_id: 'c-trav', note: 'BTS', merchant: null, deleted_at: null, version: 1 },
-  { id: 'r4', type: 'expense', amount_minor: '13200', occurred_on: '2026-10-24', wallet_id: 'w1', category_id: 'c-food', note: 'Coffee', merchant: 'Coffee', deleted_at: null, version: 1 },
-];
-
-function makeMonthSummary(month: string, expense: string, income: string): MonthSummary {
-  return {
-    month,
-    expense_minor: expense,
-    income_minor: income,
-    balance_minor: (BigInt(income) - BigInt(expense)).toString(),
-    by_wallet: {},
-    as_of_revision: '1',
-    budget: null,
-    categories: [],
-  };
-}
-
-const SAMPLE_DATA: InsightsData = {
-  month: SAMPLE_MONTH,
-  today: SAMPLE_TODAY,
-  summary: SAMPLE_SUMMARY,
-  categories: SAMPLE_CATEGORIES,
-  records: SAMPLE_RECORDS,
-  drafts: [],
-  compare: [
-    makeMonthSummary('2026-05', '1420000', '3000000'),
-    makeMonthSummary('2026-06', '1580000', '3000000'),
-    makeMonthSummary('2026-07', '1390000', '3200000'),
-    makeMonthSummary('2026-08', '1640000', '3200000'),
-    makeMonthSummary('2026-09', '1600000', '3500000'),
-    makeMonthSummary('2026-10', '1248000', '3500000'),
-  ],
-  refreshSuggested: false,
-};
-
-function InsightsGround({ label, children }: { label: string; children: React.ReactNode }) {
-  const colors = useWalletColors();
-  return (
-    <View style={{ backgroundColor: colors.ground, borderRadius: 20, padding: BUN_SPACE.md, gap: BUN_SPACE.sm }}>
-      <SpecimenLabel>{label}</SpecimenLabel>
-      <Suspense fallback={null}>
-        {children}
-      </Suspense>
-    </View>
-  );
-}
-
-export const WALLET_INSIGHTS_SECTIONS: readonly CatalogueSection[] = [
-  {
-    id: 'bw-insights',
-    title: 'Bun Wallet: Insights spending',
-    group: 'Kit',
-    render: () => (
-      <Specimen label="Bun Wallet: Insights spending">
-        <InsightsGround label="สรุปการใช้จ่ายรายเดือน">
-          <SpendingTab data={SAMPLE_DATA} month={SAMPLE_MONTH} today={SAMPLE_TODAY} />
-        </InsightsGround>
-      </Specimen>
-    ),
-  },
-  {
-    id: 'bw-insights-in-out',
-    title: 'Bun Wallet: Insights in and out',
-    group: 'Kit',
-    render: () => (
-      <Specimen label="Bun Wallet: Insights in and out">
-        <InsightsGround label="เงินเข้า-ออกและที่เก็บได้">
-          <InOutTab data={SAMPLE_DATA} month={SAMPLE_MONTH} today={SAMPLE_TODAY} />
-        </InsightsGround>
-      </Specimen>
-    ),
-  },
-  {
-    id: 'bw-calendar',
-    title: 'Bun Wallet: Insights calendar',
-    group: 'Kit',
-    render: () => (
-      <Specimen label="Bun Wallet: Insights calendar">
-        <InsightsGround label="ปฏิทินรายจ่าย">
-          <CalendarTab
-            data={SAMPLE_DATA}
-            month={SAMPLE_MONTH}
-            today={SAMPLE_TODAY}
-            onMonthChange={() => {}}
-          />
-        </InsightsGround>
-      </Specimen>
-    ),
-  },
-  {
-    id: 'bw-insights-early',
-    title: 'Bun Wallet: Insights early state',
-    group: 'Kit',
-    render: () => (
-      <Specimen label="Bun Wallet: Insights early state">
-        <InsightsGround label="สถานะเริ่มต้น (จดน้อยกว่า 3 วัน)">
-          <SpendingTab
-            data={{ ...SAMPLE_DATA, records: SAMPLE_RECORDS.slice(0, 2) }}
-            month={SAMPLE_MONTH}
-            today={SAMPLE_TODAY}
-          />
-        </InsightsGround>
-      </Specimen>
-    ),
-  },
-  {
-    id: 'bw-insights-private',
-    title: 'Bun Wallet: Insights private mode',
-    group: 'Kit',
-    render: () => (
-      <Specimen label="Bun Wallet: Insights private mode">
-        <PrivateModeProvider store={memoryStore({ [PRIVATE_MODE_NAME]: '1' })}>
-          <InsightsGround label="Private mode (ซ่อนยอดเงิน)">
-            <SpendingTab data={SAMPLE_DATA} month={SAMPLE_MONTH} today={SAMPLE_TODAY} />
-          </InsightsGround>
-        </PrivateModeProvider>
-      </Specimen>
-    ),
-  },
-  {
-    id: 'bw-insights-large',
-    title: 'Bun Wallet: Insights large text',
-    group: 'Kit',
-    render: () => (
-      <Specimen label="Bun Wallet: Insights large text">
-        <InsightsGround label="ขนาดตัวอักษรใหญ่">
-          <SpendingTab data={SAMPLE_DATA} month={SAMPLE_MONTH} today={SAMPLE_TODAY} />
-        </InsightsGround>
-      </Specimen>
-    ),
-  },
-];
+export const WALLET_INSIGHTS_SECTIONS: readonly CatalogueSection[] = WALLET_INSIGHTS_IDS.map((id): CatalogueSection => ({
+  id,
+  title: WALLET_INSIGHTS_TITLES[id],
+  group: 'Screens',
+  layout: 'screen',
+  render: () => (
+    <Suspense fallback={<Loading />}>
+      <InsightsScreenSection id={id} />
+    </Suspense>
+  ),
+}));
```

### `apps/app/src/dev/catalogue/wallet/insightsScreens.tsx`

```diff
diff --git a/apps/app/src/dev/catalogue/wallet/insightsScreens.tsx b/apps/app/src/dev/catalogue/wallet/insightsScreens.tsx
new file mode 100644
--- /dev/null
+++ b/apps/app/src/dev/catalogue/wallet/insightsScreens.tsx
@@ -0,0 +1,168 @@
+// The Bun Wallet insights' catalogue states (P2-T31, development only), loaded
+// by ./insightsSections.tsx when a section opens: the real WalletInsightsScreen
+// on fakes, on the boards' day (Saturday 24 October 2026, 10:00 in Bangkok).
+//
+// - The month is wc-calendar's: ฿12,480 out on 22 of the 24 days so far, in
+//   bw-insights' four categories, ฿35,000 in, a ฿18,000 budget, and May to
+//   September before it.
+// - The first days are es-empty-insights': ฿312 over 23 and 24 October, with no
+//   month before them.
+// - Private mode is the section's own, over a store kept in memory, as
+//   kitSections.tsx shows it, so the catalogue never changes the person's own
+//   setting.
+// - The largest amount: ฿999,999,999.99 out in one month, most of it in a
+//   category with an 80-code-point Thai name, for the AX5 captures.
+// - The month's summary gives each category's money, as the server does
+//   (withCategoryTotals). No device diary: the web's case.
+import type { CategoryDto, TransactionDto, WalletSnapshot } from '@gogospend/contracts';
+import { useState } from 'react';
+import type { ReactNode } from 'react';
+
+import { BUILTINS, createFakeResources } from '@mobile/spend/v1/testing/fakeResources';
+import { WalletInsightsScreen } from '@mobile/wallet/insights/WalletInsightsScreen';
+import { PRIVATE_MODE_NAME, PrivateModeProvider } from '@mobile/wallet/privacy/PrivateModeProvider';
+import type { KeyValueStore } from '@mobile/wallet/store/walletStore';
+import { recapBudget, withCategoryTotals } from '../insights/recapSections';
+import type { CatalogueSection } from '../registry';
+import { screenSection } from '../screenSection';
+import type { ScreenFixture, ScriptStep } from '../screenSection';
+import { WALLET_INSIGHTS_TITLES } from './insightsSections';
+import type { WalletInsightsId } from './insightsSections';
+
+/** Saturday 24 October 2026, 10:00 in Bangkok: the boards' day. */
+const NOW = new Date('2026-10-24T03:00:00Z');
+const MONTH = '2026-10';
+
+const wallet = (index: number, name: string): WalletSnapshot => ({
+  id: `0000000c-0000-4000-8000-0000000003${String(index).padStart(2, '0')}`, name, currency: 'THB', opening_minor: '0', tracking_start: '2026-01-01', archived: false, version: 1,
+});
+const MAIN = wallet(1, 'บัญชีหลัก');
+const CASH = wallet(2, 'เงินสด');
+
+const [FOOD, TRAVEL, , SALARY] = BUILTINS as [CategoryDto, CategoryDto, CategoryDto, CategoryDto, CategoryDto];
+const category = (index: number, fields: Pick<CategoryDto, 'builtin_key' | 'label' | 'color'>): CategoryDto => ({
+  id: `0000000c-0000-4000-8000-0000000004${String(index).padStart(2, '0')}`, type: 'expense', archived: false, version: 1, ...fields,
+});
+const SHOPPING = category(1, { builtin_key: 'shopping', label: null, color: '#E9E1FF' });
+const FAMILY = category(2, { builtin_key: null, label: 'ส่งให้ครอบครัว', color: '#FFDDE6' });
+/** 80 code points, the longest name a category can have. */
+const LONG = category(3, { builtin_key: null, label: 'ค่าเทอมลูก ค่าเรียนพิเศษ และค่าใช้จ่ายในบ้านของครอบครัวใหญ่ทุกเดือนตลอดทั้งปีน้า', color: '#DCE8FF' });
+const CATEGORIES: readonly CategoryDto[] = [...BUILTINS, SHOPPING, FAMILY, LONG];
+
+let counter = 0;
+function entry(type: 'expense' | 'income', day: string, amountMinor: string, on: CategoryDto, from: WalletSnapshot, note: string | null = null): TransactionDto {
+  counter += 1;
+  return {
+    id: `0000000b-0000-4000-8000-${String(500 + counter).padStart(12, '0')}`, type, amount_minor: amountMinor, occurred_on: day,
+    wallet_id: from.id, category_id: on.id, note, merchant: null, deleted_at: null, version: 1,
+  } as TransactionDto;
+}
+const spent = (day: number, baht: string, on: CategoryDto, from: WalletSnapshot = CASH, note: string | null = null) =>
+  entry('expense', `${MONTH}-${String(day).padStart(2, '0')}`, `${baht}00`, on, from, note);
+
+/** wc-calendar's October: ฿12,480 on 22 of the 24 days so far (none on the 8th or the 20th). */
+const OCTOBER: readonly TransactionDto[] = [
+  entry('income', `${MONTH}-01`, '3500000', SALARY, MAIN),
+  spent(1, '3000', FAMILY, MAIN), spent(1, '240', FOOD), spent(2, '412', FOOD), spent(3, '1190', SHOPPING, MAIN), spent(4, '265', FOOD),
+  spent(5, '188', TRAVEL), spent(6, '230', FOOD), spent(7, '156', TRAVEL), spent(9, '545', FOOD), spent(10, '1120', SHOPPING, MAIN),
+  spent(10, '360', TRAVEL), spent(11, '380', FOOD), spent(12, '210', FOOD), spent(13, '174', TRAVEL), spent(14, '470', FOOD),
+  spent(15, '198', TRAVEL), spent(16, '850', FOOD), spent(17, '450', TRAVEL), spent(18, '290', FOOD), spent(19, '164', TRAVEL),
+  spent(21, '236', FOOD), spent(22, '310', TRAVEL), spent(23, '910', FOOD),
+  // History lists a day newest first (the higher id), so the board's order reads กาแฟเย็น, BTS, วิน.
+  spent(24, '20', TRAVEL, CASH, 'วิน'), spent(24, '47', TRAVEL, MAIN, 'BTS'), spent(24, '65', FOOD, CASH, 'กาแฟเย็น'),
+];
+
+/** May to September, as bw-insights' bars stand against the ฿18,000 budget. */
+const BEFORE: readonly TransactionDto[] = ([['05', '1420000', '3000000'], ['06', '1580000', '3000000'], ['07', '1390000', '3200000'], ['08', '1640000', '3200000'], ['09', '1600000', '3500000']] as const)
+  .flatMap(([month, outMinor, inMinor]) => [
+    entry('expense', `2026-${month}-15`, outMinor, FOOD, CASH),
+    entry('income', `2026-${month}-01`, inMinor, SALARY, MAIN),
+  ]);
+
+/** es-empty-insights: ฿312 in seven entries over 23 and 24 October, and nothing before. */
+const FIRST_DAYS: readonly TransactionDto[] = [
+  spent(23, '50', FOOD), spent(23, '45', FOOD), spent(23, '40', SHOPPING), spent(23, '47', TRAVEL, MAIN),
+  spent(24, '65', FOOD), spent(24, '45', FOOD), spent(24, '20', TRAVEL),
+];
+
+/** ฿999,999,999.99 out over three days, most of it under the longest name. */
+const LARGEST: readonly TransactionDto[] = [
+  entry('expense', `${MONTH}-01`, '99999999899', LONG, MAIN),
+  entry('expense', `${MONTH}-02`, '50', FOOD, CASH),
+  entry('expense', `${MONTH}-03`, '50', FOOD, CASH),
+];
+
+function fakes(records: readonly TransactionDto[]): ScreenFixture {
+  const fake = createFakeResources({ wallets: [MAIN, CASH], records: [...records], categories: [...CATEGORIES], budgets: [recapBudget(MONTH, '1800000')] });
+  return { resources: withCategoryTotals(fake), diary: null };
+}
+
+function memoryStore(seed: Readonly<Record<string, string>>): KeyValueStore {
+  const kept = new Map(Object.entries(seed));
+  return {
+    get: async (name) => kept.get(name) ?? null,
+    set: async (name, value) => { kept.set(name, value); },
+    remove: async (name) => { kept.delete(name); },
+    eraseAll: async () => { kept.clear(); },
+  };
+}
+
+/** Private mode on for this section only. */
+function PrivateInsights({ children }: { children: ReactNode }) {
+  const [store] = useState(() => memoryStore({ [PRIVATE_MODE_NAME]: '1' }));
+  return <PrivateModeProvider store={store}>{children}</PrivateModeProvider>;
+}
+
+const insights = () => <WalletInsightsScreen now={NOW} />;
+const shown = (testID: string): ScriptStep => ({ waitFor: testID });
+const tab = (name: 'in_out' | 'calendar'): ScriptStep => ({ call: 'onPress', on: { testID: `insights-tab-${name}` } });
+
+const SECTIONS: Readonly<Record<WalletInsightsId, CatalogueSection>> = {
+  'bw-insights': screenSection({
+    id: 'bw-insights',
+    title: WALLET_INSIGHTS_TITLES['bw-insights'],
+    fixture: () => fakes([...OCTOBER, ...BEFORE]),
+    script: () => [shown('insights-month-bars')],
+    render: insights,
+  }),
+  'bw-insights-in-out': screenSection({
+    id: 'bw-insights-in-out',
+    title: WALLET_INSIGHTS_TITLES['bw-insights-in-out'],
+    fixture: () => fakes([...OCTOBER, ...BEFORE]),
+    script: () => [shown('insights-month-bars'), tab('in_out'), shown('in-out-paired-bars')],
+    render: insights,
+  }),
+  'bw-calendar': screenSection({
+    id: 'bw-calendar',
+    title: WALLET_INSIGHTS_TITLES['bw-calendar'],
+    fixture: () => fakes([...OCTOBER, ...BEFORE]),
+    script: () => [shown('insights-month-bars'), tab('calendar'), shown('calendar-grid')],
+    render: insights,
+  }),
+  'bw-insights-early': screenSection({
+    id: 'bw-insights-early',
+    title: WALLET_INSIGHTS_TITLES['bw-insights-early'],
+    fixture: () => fakes(FIRST_DAYS),
+    script: () => [shown('insights-early-state')],
+    render: insights,
+  }),
+  'bw-insights-private': screenSection({
+    id: 'bw-insights-private',
+    title: WALLET_INSIGHTS_TITLES['bw-insights-private'],
+    fixture: () => fakes([...OCTOBER, ...BEFORE]),
+    script: () => [shown('insights-month-bars'), tab('calendar'), shown('calendar-grid')],
+    render: () => <PrivateInsights>{insights()}</PrivateInsights>,
+  }),
+  'bw-insights-large': screenSection({
+    id: 'bw-insights-large',
+    title: WALLET_INSIGHTS_TITLES['bw-insights-large'],
+    fixture: () => fakes(LARGEST),
+    script: () => [shown('insights-month-bars')],
+    render: insights,
+  }),
+};
+
+/** One insights state, drawn as the catalogue draws every screen section. */
+export default function InsightsScreenSection({ id }: { id: WalletInsightsId }) {
+  return <>{SECTIONS[id].render()}</>;
+}
```

### `docs/implementation/receipts/P2-T31.md`

```diff
diff --git a/docs/implementation/receipts/P2-T31.md b/docs/implementation/receipts/P2-T31.md
--- a/docs/implementation/receipts/P2-T31.md
+++ b/docs/implementation/receipts/P2-T31.md
@@ -119,3 +119,4 @@
 - **Notes for later tasks:**
   - E2-B: Review English draft copy lines in `wallet/insights/copy.ts`.
   - Wallet navigation: `SpendingTab` category press links to `/spend/all?category=<id>`. Ensure history filtering by category parameter handles both uuid and pack categories seamlessly.
+  - The fix round on PR #421 (the first review's M1 to M8 and m1 to m11, ruling R112) has its own receipt: `docs/implementation/receipts/P2-T31-fix.md`. Its counts replace this receipt's estimates (n7).
```

### `docs/implementation/receipts/P2-T31-fix.md`

```diff
diff --git a/docs/implementation/receipts/P2-T31-fix.md b/docs/implementation/receipts/P2-T31-fix.md
new file mode 100644
--- /dev/null
+++ b/docs/implementation/receipts/P2-T31-fix.md
@@ -0,0 +1,55 @@
+# P2-T31-fix: insights on one quiet load, one scale, private calendar days alike, exact money, the boards' dates and words, and the real screen in the catalogue
+
+- **Status:** built and verified locally on `p2/t31-insights` (`.claude/worktrees/p2-t31`): one fix commit on top of PR #421's reviewed head `afc19276`. Not pushed. This is the fix round on PR #421 after its first review (`.claude/controller/reviews/P2-T31.md`, Opus), which said Needs fixes for eight majors (M1 to M8), eleven minors and seven nits; the second (`P2-T31-second.md`, Flash) approved and added nothing. The controller ruled R112: fix every major and minor as the review proposes, unless the plan says otherwise. The planner's brief is `.claude/controller/briefs/P2-T31-fix.md`. Under R87 this receipt is its own file; `P2-T31.md` gains one line pointing here, and `premium-progress.md` is not edited. The independent review is the controller's, after this receipt.
+- **Base:** `afc19276`, with no sync merge (the controller merges the head again once the round lands, INSIGHTS after CATEGORY and before RECAP). None of the round's files, nor the modules it builds on, changed on the integration head since `afc19276`; #411 and #412 merged meanwhile. At the base, the catalogue's screen-reader pass fails one case, `bw-insights-in-out` (the first round's unnamed in-and-out chart, m4); it passes after this round.
+- **Files:**
+  - Rewritten: `apps/app/src/wallet/insights/insightsData.ts`, `WalletInsightsScreen.tsx`, `SpendingTab.tsx`, `MonthBars.tsx`, `InOutTab.tsx`, `CalendarTab.tsx`, and `WalletInsights.render.test.tsx` (26 cases; 11 before).
+  - Changed: `calendarShade.ts` (reads `CALENDAR_STEP_LIMITS_BAHT`, by relative path), `copy.ts` (the draft table), `InfoTray.tsx` (a role).
+  - The catalogue: `apps/app/src/dev/catalogue/wallet/insightsSections.tsx` (six section descriptors) and `insightsScreens.tsx` (created: the real screen on fakes, loaded lazily).
+  - Shared, additive: `apps/app/src/ui/dateStep.ts` gains `monthShortLabel` and `shortDateLabel`, and `dateStep.test.ts` their two cases.
+  - Unchanged: the route `app/spend/insights.tsx`, `InsightsRoutes.render.test.tsx` (it stubs the screen), `calendarShade.test.ts` and the catalogue's `index.ts`.
+  - This receipt, and one line in `P2-T31.md`.
+- **M1, one quiet load:** the load is keyed by the month, today and the resources only. The phone's drafts are read at render time, and a draft that resolves refreshes the month quietly, in place: a sync run never blanks the screen, never closes the info tray, never moves the chosen day and, with the same drafts, reads nothing. Data read for another month is never handed over as this one's.
+- **M2, one scale:** the bars and the dashed budget line stand on one baseline, scaled by the taller of the largest month and the budget, in exact integer maths. October's ฿3,972.50 against a ฿18,000 budget stands 24 of the line's 110 units.
+- **M3, private mode (R65):** every day is one neutral fill with ink numbers, no amount and no border but today's frame, and says its date alone. The legend keeps its swatches with no values, no unit, and says only that the framed day is today.
+- **M4 and m7, dates:** the early state names each logged day by its own date, the chosen day reads `เสาร์ 24 ต.ค. · วันนี้`, and the bars' months are `พ.ค.` to `ต.ค.`, all through `src/ui/dateStep.ts`.
+- **M5, money:** every drawn amount is the wallet's money text, keeping satang that are not zero (`฿3,972.50`, `งบ ฿18,000`); a calendar day shows whole baht by BigInt, rounded down (`3,240`). No `Number()`, `Math.round` or `toLocaleString` touches money.
+- **M6, a compare month that cannot be read:** it fails the load, which says so in Thai first with Try again; it is never drawn or said as ฿0. This month's own summary is its bar's, so it is read once (n6).
+- **M7, words:** the weekdays, วันนี้, the per-day unit and a record's name come from dateStep, the draft table or the catalogs; the English screen has no Thai.
+- **M8, guards and analytics:** 127 mutants, the review's fifteen among them, each killed; the analytics case installs `recordAnalytics()` and asserts one `insights_viewed` per tab shown, and no amount, note or name in what is sent.
+- **The minors:** m1, the offline banner only for a `V1Error` with outcome `network` where a diary is open, the problem's title as a heading, Try again only when a retry helps, and Refresh when a later page says the diary changed; m2, the days left with today counted (8 on 24 October), none for a month gone by; m3, each day button says `calendarModel`'s label; m4, the in-and-out chart is a named image that reads each month's money in and out; m5, built-in categories named on the chosen day, with the wallet; m6, the catalogue draws the real screen on fakes, the private calendar and the largest amount included; m8, the summary's totals with true counts, no fallback; m9, `เก็บได้ ฿21,027.50`; m10, `งบ ฿18,000`; m11, days at least 44 pt wide and 50 pt tall on a 375 pt phone, the grid's numbers capped at the largest standard size while the cells grow.
+- **The nits:** n1 `HIDDEN_AMOUNT`; n2 the kit's `IconButton`; n3 `insights.today` used, `insights.sample` dropped, draft lines marked; n4 the legend in private mode and in dark mode; n5 DM Sans for the grid; n6 one read of this month; n7 the counts here are the logs'.
+- **RED to GREEN:**
+  - RED, on the planner's typed stubs of `WalletInsightsScreen.tsx`, `insightsSections.tsx` and `src/ui/dateStep.ts`, with the round's two tests:
+    - `typecheck:app` exit 0;
+    - Node: `ℹ tests 19`, `ℹ pass 17`, `ℹ fail 2`; the two failures are the new dateStep cases, each an `AssertionError [ERR_ASSERTION]`;
+    - render: `Test Files  1 failed (1)`, `Tests  26 failed (26)`, each on an `AssertionError` from an asserting lookup, with no lookup or module error.
+  - GREEN:
+    - `typecheck:app` exit 0;
+    - Node: `ℹ tests 19`, `ℹ pass 19`, `ℹ fail 0` (`dateStep.test.ts`, `calendarShade.test.ts`, `draftText.test.ts`);
+    - `WalletInsights.render.test.tsx`: `Test Files  1 passed (1)`, `Tests  26 passed (26)`;
+    - the four routes tests: `Test Files  4 passed (4)`, `Tests  13 passed (13)`;
+    - the eight kit files that import the wallet catalogue index, and the Bun diary insights and recap: `Test Files  10 passed (10)`, `Tests  210 passed (210)`;
+    - the catalogue's wallet sections, both suites: `Test Files  2 passed (2)`, `Tests  54 passed | 572 skipped (626)`.
+- **Mutation check:** 127 mutants, all killed, every restore's SHA-256 checked (`tools/mutants.py`). The review's survivors are R1 to R15; the plan's three are H1 (฿200 as step 2), C8 (the shades kept in private mode) and S2 (`tab: 'inOut'`). Two are killed by an error rather than an assertion, by design: P19 (a category with no tile) and C34 (a wallet that is not listed), each a `TypeError`. One more is equivalent and not run: S13, the calendar drawn for the data's month, which the month guard (D9) makes the month shown.
+- **Gate** (worktree root; R100 and the 12 November rule):
+  - `typecheck:app` exit 0;
+  - `test:app` exit 0, `ℹ fail 0`;
+  - `test:unit` exit 0, `ℹ fail 0`;
+  - the focused files above;
+  - `git diff --check`: clean.
+- **CI** (R100): the full render suite, `export:web`, the iOS export, the database suites, `test:edge:workers` and `test:ops` run on the PR. No route, config or app entry changed, so `typecheck:routes` and `export:web` were not run locally.
+- **Deviations** (the brief's planner rulings):
+  - P3: the load reads `wallets()` once more, for the chosen day's "category · wallet".
+  - P6: `src/ui/dateStep.ts`, a shared file, gains two exports; the early state reads `ศุกร์ 23 ต.ค.` (the plan's short form), where es-empty-insights draws `ศ. 23 ต.ค.`.
+  - P8: `insights.sample` is dropped and six draft lines are added.
+  - P11: a month gone by has no days-left line.
+  - P13: the in-and-out pairs draw money out in ink, as W21 names it, rather than in the spending bars' colours.
+  - P17: the grid's numbers stop at the largest standard size; the chosen day's list carries the facts at every size.
+  - P18: the monthly badge is on `card`, the screen's month row is left off the calendar tab, and the page keeps clear of the safe area, as the wallets list does.
+- **SKIPPED:** device checks (VoiceOver over the bars, the pairs and the days; the calendar at AX5 on a 375 pt phone) until E2-C and P2-T37; Docker is stopped, so the database suites are CI's.
+- **For E2-C (owner, Q3):** the English lines and the Thai lines marked draft in `wallet/insights/copy.ts`; `ศุกร์ 23 ต.ค.` against the board's `ศ. 23 ต.ค.`; `กรอบคือวันนี้` against the board's `กรอบดำคือวันนี้`; a private day's `raised` fill, which equals the page's `ground` in light mode (the review's note).
+- **Notes for later tasks:**
+  - P2-T37: the calendar at AX5 on a 375 pt phone, and VoiceOver on the day buttons.
+  - P2-T38: every insights line is in `wallet/insights/copy.ts` or the catalogs; the move takes the table whole.
+  - R71: the category link carries only `category`, as the plan writes it; from a month gone by, History opens on this month (the review's note).
```
