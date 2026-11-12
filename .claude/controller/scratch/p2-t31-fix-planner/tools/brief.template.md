# Brief P2-T31 fix round: insights on one quiet load, one scale, private calendar days alike, exact money, the boards' dates and words, and the real screen in the catalogue

You are the fixer for the P2-T31 fix round. PR #421 (branch `p2/t31-insights`, commit `afc19276`) adds the Bun Wallet insights: three tabs, the info tray, the six bars and the calendar. Its first review (Opus, `reviews/P2-T31.md`) says **Needs fixes**: eight majors (M1 to M8), eleven minors (m1 to m11) and seven nits (n1 to n7). The second review (Flash, `reviews/P2-T31-second.md`) approved and adds nothing. The controller ruled **R112**: fix every major and minor as the review proposes, unless the plan says otherwise.

The planner wrote every file below and proved it in a scratch copy of `afc19276`:
- RED on three typed stubs, each failing case on an `AssertionError`;
- GREEN;
- {{MUTANT_COUNT}} mutants, all killed, the review's fifteen among them;
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
{{SCOPE}}

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
  `WalletInsights.render.test.tsx` has {{RENDER_CASES}} cases (11 before), in both modes and both languages. The analytics case installs `recordAnalytics()`, asserts exactly one `insights_viewed` per tab shown (spending, then in_out, then calendar, and none for a repeated press), and that `JSON.stringify(sent)` holds no amount, note or name from the fixture. The review's fifteen survivors are R1 to R15 in `tools/mutants.py`, each killed; the plan's three are H1, C8 and S2.
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
   - `cd WT/apps/app && npm run test:unit -- src/ui/dateStep.test.ts src/wallet/insights/calendarShade.test.ts src/wallet/copy/draftText.test.ts > S/base-unit.log 2>&1; echo $?`. Expected: 0, {{NODE:base-unit}}.
   - `cd WT/apps/app && npx vitest run --config vitest.render.config.ts {{INSIGHTS}} {{ROUTES}} {{NEIGHBOURS}} > S/base-render.log 2>&1; echo $?`. Expected: 0, {{VITEST:base-render}}.
   - `cd WT/apps/app && npx vitest run --config vitest.render.config.ts {{CATALOGUE}} -t "bw-" > S/base-catalogue.log 2>&1; echo $?`. Expected: 1, {{VITEST:base-catalogue}}. The one failing case is `screenReader.render.test.tsx > section bw-insights-in-out: every control has a name, nothing hidden takes focus`, on an `AssertionError` listing one `img` with no name: the first round's in-and-out chart, the review's m4. This round fixes it (Step 3, item 7).

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
   - exit 1, {{NODE:red-unit}};
   - `grep -c 'AssertionError \[ERR_ASSERTION\]' S/red-unit.log` gives {{RED_UNIT_ASSERTIONS}};
   - the {{RED_UNIT_FAILED_COUNT}} failing tests, both new dateStep cases:
{{RED_UNIT_FAILED}}
4. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/insights/WalletInsights.render.test.tsx > S/red-render.log 2>&1; echo $?`. Expected:
   - exit 1, {{VITEST:red-render}};
   - `grep -c '^AssertionError' S/red-render.log` gives {{RED_RENDER_ASSERTIONS}};
   - `grep -cE 'TestingLibraryElementError|Cannot find module|Failed to resolve|SyntaxError|is not a function|TypeError' S/red-render.log` gives 0.

   The {{RENDER_CASES}} render cases, each failing on an assertion:
{{RED_RENDER}}

   Compare with `PL/logs/red-unit.log` and `PL/logs/red-render.log`.

## Step 3: GREEN

1. Copy every file of the round:
   ```bash
{{COPY_REAL}}
   ```
   Then `cd WT && shasum -a 256 -c PL/SHA256SUMS.real-in-wt`. Expected: sixteen `OK` lines, exit 0.
   Then `/usr/bin/git -C WT status --short`. Expected: exactly these lines, in this order:
   ```
{{STATUS}}
   ```
2. `cd WT && npm run typecheck:app > S/green-typecheck.log 2>&1; echo $?`. Expected: 0.
3. `cd WT/apps/app && npm run test:unit -- src/ui/dateStep.test.ts src/wallet/insights/calendarShade.test.ts src/wallet/copy/draftText.test.ts > S/green-unit.log 2>&1; echo $?`. Expected: 0, {{NODE:green-unit}}.
4. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/insights/WalletInsights.render.test.tsx > S/green-render.log 2>&1; echo $?`. Expected: 0, {{VITEST:green-render}}.
5. The four routes tests:
   `cd WT/apps/app && npx vitest run --config vitest.render.config.ts {{ROUTES}} > S/green-routes.log 2>&1; echo $?`. Expected: 0, {{VITEST:green-routes}}.
6. The eight kit files that import the wallet catalogue index, and the Bun diary insights and recap:
   `cd WT/apps/app && npx vitest run --config vitest.render.config.ts {{NEIGHBOURS}} > S/green-neighbours.log 2>&1; echo $?`. Expected: 0, {{VITEST:green-neighbours}}.
7. The catalogue's wallet sections, in both suites:
   `cd WT/apps/app && npx vitest run --config vitest.render.config.ts {{CATALOGUE}} -t "bw-" > S/green-catalogue.log 2>&1; echo $?`. Expected: 0, {{VITEST:green-catalogue}}.

   Compare with `PL/logs/green-*.log`.

## Step 4: Mutation check

Run the {{MUTANT_COUNT}} mutants:
```bash
python3 -I PL/tools/mutants.py WT S/mutant-logs > S/mutants.out; echo $?
```
Expected: 0, taking about {{MUTANT_MINUTES}} minutes.
`tail -1 S/mutants.out` prints:
```
{{MUTANT_TAIL}}
```
Every mutant is killed and restored byte for byte. The planner's lines follow (from `PL/logs/mutants.out`), for comparison; the Expected lines are the exit code and the tail. Two are killed by an error rather than an assertion, by design: P19 (a category with no tile is a `TypeError`) and C34 (a wallet that is not listed is a `TypeError`).
```
{{MUTANTS}}
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
- {{RENDER_CASES}} render cases, recordAnalytics, {{MUTANT_COUNT}} mutants killed (M8)
- the catalogue draws the real screen on fakes, loaded lazily (m6)

Co-Authored-By: Gemini 3.8 Flash High <noreply@google.com>
```

Commit the fix (stage the round's files by name):
```bash
{{GIT_ADD}}
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
- RED: Node {{RED_UNIT_FAILED_COUNT}} failed (`AssertionError`), render {{RENDER_CASES}} failed (`AssertionError`), with no lookup or module error.
- GREEN: Node {{GREEN_UNIT_TESTS}} passed; insights {{RENDER_CASES}} passed; the routes, neighbours and catalogue counts of Step 3.
- Mutants: {{MUTANT_COUNT}} killed, 0 survived (S13 equivalent, not run).
- Gate: `typecheck:app` 0, `test:app` and `test:unit` `ℹ fail 0`, `diff --check` clean.
- Deviations: none from the brief's rulings.

## Appendix: the diffs

{{DIFFS}}
