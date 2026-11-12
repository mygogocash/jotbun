# Second Review P2-T31: Insights: three tabs, the info tray, readable bars and the calendar

- **Reviewer:** independent second reviewer (Gemini 3.8 Flash), read-only. Probes ran strictly in a scratch copy under `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t31-second/repo` (via `git archive afc19276`, `node_modules` symlinked from the worktree). No edits made to any worktree or the main checkout.
- **Reviewed:** commit `afc19276` on branch `p2/t31-insights` in `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t31` (range `origin/claude/p1a-vault-core...afc19276`), PR #421 (mygogocash/jotbun, base `claude/p1a-vault-core`).
- **Against:** plan P2 `### Task P2-T31` (lines 1485 to 1540), Global Constraints, W4, W6, W21, W24, R61, R65, R66, R71, R72; design boards `bw-insights.dc.html`, `wc-calendar.dc.html`, `es-empty-insights.dc.html`; the brief `briefs/P2-T31.md` and its kit; the implementer's receipt in `docs/implementation/receipts/P2-T31.md`.
- **Verdict:** Approved. No blocker or major findings. Two minor findings (`m1`, `m2`) and two nits (`n1`, `n2`); notes for later tasks.

---

## Focus Areas: Money, Privacy, Reads, and Logging

### 1. Exact Money
- **Minor satang integers:** All core models, calculations, and aggregations use exact BigInt arithmetic over minor satang strings without floats.
  - `calendarShade.ts:11`: `const satang = BigInt(outMinor);` maps boundary thresholds `0`, `20000`, `50000`, `100000`, `200000` via exact BigInt comparisons. Extreme values past $2^{53}$ (`900719925474099201` satang) and astronomically large amounts (`999...`) map safely to step 5 without throwing or precision loss (verified in reviewer `PROBE 3`).
  - `SpendingTab.tsx:83-93`: Category sum accumulator sums `r.amount_minor` with `BigInt`, converting back via `total.toString() as Minor`.
  - `MonthBars.tsx:47` and `InOutTab.tsx:129-130`: SVG bar scaling uses integer permille calculations `(BigInt(...) * 1000n) / max` before converting to 0..1 ratio for pixel layout coordinates.
  - `InOutTab.tsx:35-43`: `maxMinor` computed via BigInt search over compare summaries.
- **Float observation (`m1`):** In [CalendarTab.tsx:107](file:///Users/kunanonjarat/Developer/jotbun/apps/app/src/wallet/insights/CalendarTab.tsx#L107) and [CalendarTab.tsx:213](file:///Users/kunanonjarat/Developer/jotbun/apps/app/src/wallet/insights/CalendarTab.tsx#L213), whole baht formatting uses `Math.round(Number(spentMinor) / 100)` and `Math.round(Number(day.outMinor) / 100)`. While standard JS `Number` float mantissa covers up to 90 trillion baht ($2^{53}-1$ satang), this departs from the strict BigInt rule past $2^{53}$. This was inherited directly from the planner's kit (`PL/real/apps/app/src/wallet/insights/CalendarTab.tsx`).

### 2. Private Mode (R65)
- **Zero amount leakage on screen or in labels:**
  - `MonthBars.tsx:30`: When `hidden: true`, `spokenLabel` speaks only `${chartName}: ${bars.map((b) => b.label).join(', ')}`, completely dropping all monetary numbers, `฿`, and `บาท`. Verified in both Thai and English. Budget line renders masked amount `฿••••` with `aria-hidden={true}`.
  - `SpendingTab.tsx:112`: Hero amount uses `<WalletAmount minor={spentMinor} size={36} />`, which masks to `฿••••` and announces `common.amountHidden` ("ซ่อนยอดเงินอยู่"). Category rows mask via `WalletAmount`.
  - `InOutTab.tsx:71,84,97`: Hero amounts mask via `WalletAmount`. The kept banner at line 97 renders `{hidden ? '฿••••' : kept.text}`. Paired bars have `aria-hidden={true}` on SVG.
  - `CalendarTab.tsx:107,210,240,265`: Month line renders `฿••••`. Every day button uses neutral fill `colors.raised` (`#F4F3F9` light, `#2C2A33` dark). Individual day amount text is completely omitted (`!hidden && bahtText`). Day button `spoken` accessibility label contains only day and month name (`${day.dayOfMonth} ${monthName}`), no amounts. Legend swatches omit all numeric labels. Chosen day section totals and records mask via `WalletAmount`.
  - Tested in Thai and English (verified in reviewer `PROBE 1` and `PROBE 2`).

### 3. Complete Data Reads
- `insightsData.ts:74`: Uses `readAllPages` with `HISTORY_MAX_LIMIT` to read every page of the month's history cursor-by-cursor until `next_cursor` is null.
- All 6 comparison months' summaries loaded in parallel via `Promise.all(months.map(...))`.
- Category totals fallback correctly aggregates confirmed non-deleted expense records if `summary.categories` is empty.
- Outbox drafts accurately supplied via `diaryView.outbox`, separating pending drafts from confirmed totals.

### 4. Logging & Privacy
- Zero `console.log`, `logger.`, or debug prints in any file added or modified by this PR (`git diff` clean).
- Analytics `trackInsightsViewed({ tab })` in `WalletInsightsScreen.tsx:40` passes only the enum tab identifier (`'spending' | 'in_out' | 'calendar'`), carrying zero monetary amounts, account identifiers, or personal data.

---

## Local Verification & Probes

### 1. Codebase Integrity & Checksums
All 15 files in `afc19276` match the verified sha256 checksums in `PL/SHA256SUMS` and the receipt `docs/implementation/receipts/P2-T31.md`:
- `dd20e7ef...` `calendarShade.ts`
- `241059a3...` `calendarShade.test.ts`
- `f819e2a3...` `copy.ts`
- `aabb09f4...` `insightsData.ts`
- `33e6c502...` `MonthBars.tsx`
- `b3b558a4...` `InfoTray.tsx`
- `2b7fa245...` `SpendingTab.tsx`
- `59bfbd65...` `InOutTab.tsx`
- `f5571cce...` `CalendarTab.tsx`
- `e776fcc3...` `WalletInsightsScreen.tsx`
- `aa237a48...` `WalletInsights.render.test.tsx`
- `0e3546c1...` `insightsSections.tsx`
- `7e85c123...` `index.ts` (verified post-merge with #416)
- `76d222ba...` `insights.tsx`
- `85e9f4b8...` `InsightsRoutes.render.test.tsx`

### 2. Fast Local Gate (Rerun in Scratch Copy)
- `npm run typecheck:app`: exit 0 (clean).
- `npm run typecheck:routes -w gogospend-app`: exit 0.
- `node --test apps/app/src/wallet/insights/calendarShade.test.ts`: exit 0, 3 passed, 0 failed.
- `npx vitest run --config vitest.render.config.ts src/wallet/insights/WalletInsights.render.test.tsx`: exit 0, 11 passed, 0 failed.
- The four routes tests: exit 0, 13 passed, 0 failed across 4 test files (`InsightsRoutes`, `SpendRoutes`, `PlanningRoutes`, `AccountRoutes`).
- `git diff --check`: exit 0 (clean whitespace).

### 3. Mutation Checks
- **Planner's sample (10 mutants rerun with `tools/mutants.py`):**
  - `M1`: killed OK (make ฿200 step 2)
  - `M2`: killed OK (map zero to step 1)
  - `M7`: killed OK (send tab: inOut instead of in_out)
  - `M8`: killed OK (suppress analytics trackInsightsViewed)
  - `M11`: killed OK (spoken label carries amounts in private mode)
  - `M12`: killed OK (invert month bar colors: barNow vs barPast)
  - `M14`: killed OK (keep the shades in private mode)
  - `M15`: killed OK (show day amounts in private mode)
  - `M16`: killed OK (show legend labels in private mode)
  - `M20`: killed OK (lower early state threshold to 1 day)
- **Reviewer Probes (`reviewerProbes.render.test.tsx`):**
  - `PROBE 1`: Verified `InOutTab` in private mode in both Thai and English. All three amounts (income hero, expense hero, kept banner) strictly render masked `฿••••`.
  - `PROBE 2`: Verified `CalendarTab` chosen day records section in private mode. Day total and record amounts strictly mask via `WalletAmount`.
  - `PROBE 3`: Verified `calendarShade` boundary limits, zero, negative satangs, and extreme scales past $2^{53}$ (`900719925474099201`).
- **Test gap mutant on `InOutTab`:** Mutating `InOutTab.tsx:97` from `{hidden ? '฿••••' : kept.text}` to `{kept.text}` survived `WalletInsights.render.test.tsx` because the suite never clicked the `in_out` tab under private mode (`m2`).

---

## Findings

### Blocker
None.

### Major
None.

### Minor

**m1. Floating-point division and conversion on satang amounts in `CalendarTab.tsx`**
- **Where:** [CalendarTab.tsx:107](file:///Users/kunanonjarat/Developer/jotbun/apps/app/src/wallet/insights/CalendarTab.tsx#L107) (`amount: hidden ? '฿••••' : `฿${Math.round(Number(spentMinor) / 100).toLocaleString()}`) and [CalendarTab.tsx:213](file:///Users/kunanonjarat/Developer/jotbun/apps/app/src/wallet/insights/CalendarTab.tsx#L213) (`const outNum = Math.round(Number(day.outMinor) / 100)`).
- **Evidence:** Running a probe with satang string `'900719925474099201'` demonstrates `Number('900719925474099201') === 900719925474099200` due to 53-bit IEEE 754 precision loss.
- **Why it is minor:** Standard transactions in consumer banking never reach 90 trillion baht. The planner provided this exact code in `PL/real/`, so the implementer adhered to the brief.
- **Suggestion:** In a future cleanup, compute whole baht via BigInt division: `const baht = BigInt(day.outMinor) / 100n; const bahtText = baht > 0n ? baht.toLocaleString() : '';` and use `formatMinor(spentMinor, 'th')` or `walletMoneyText(spentMinor)` for `monthLine`.

**m2. `WalletInsights.render.test.tsx` lacks private mode assertion for `InOutTab`**
- **Where:** [WalletInsights.render.test.tsx:151-213](file:///Users/kunanonjarat/Developer/jotbun/apps/app/src/wallet/insights/WalletInsights.render.test.tsx#L151-L213).
- **Evidence:** The test suite tests private mode on the Spending tab and Calendar tab, but does not switch to `insights-tab-in_out` while private mode is active. Mutating `InOutTab.tsx:97` to drop `{hidden ? '฿••••' : kept.text}` survived the test suite.
- **Why it is minor:** The implementation in `InOutTab.tsx` is completely correct and passed reviewer `PROBE 1`. This is purely a test coverage gap.

### Nit

**n1. Legend accessible label in private mode describes color scale values**
- **Where:** [CalendarTab.tsx:254-257](file:///Users/kunanonjarat/Developer/jotbun/apps/app/src/wallet/insights/CalendarTab.tsx#L254-L257).
- **Observation:** `accessibilityLabel={t('insights.legend')}` reads "สีเข้มขึ้นเมื่อใช้มากขึ้น ตั้งแต่ 0 ถึงมากกว่า 2,000 บาทต่อวัน กรอบดำคือวันนี้". While swatches drop numeric text labels in private mode, the overall image description mentions the static threshold "2,000 บาท". This describes the color scale rather than user diary data, so no personal data leaks.

**n2. Static Thai weekday initials in CalendarTab**
- **Where:** [CalendarTab.tsx:24](file:///Users/kunanonjarat/Developer/jotbun/apps/app/src/wallet/insights/CalendarTab.tsx#L24) (`WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']`).
- **Observation:** Under English locale, the calendar month name is localized ("October 2026"), but the weekday column headers remain Thai initials. Candidate for draft copy table localization in E2-C.

---

## Notes for Later Tasks

- **E2-C (Plan & Understand Checkpoint):** Review draft copy strings in `apps/app/src/wallet/insights/copy.ts`. Localize weekday initials for English locale in `CalendarTab`.
- **Sub-satang day shading:** For expenses strictly under 50 satangs (e.g. 40 satang), `calendarShade` shades the day as step 1, but `Math.round(40 / 100)` rounds to 0 baht so the button displays only the day number without baht text. This is visually clean and consistent with integer baht display on 50 pt buttons.

---

VERDICT: Approved
