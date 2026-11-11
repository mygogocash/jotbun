# Review P2-T32 (second review: money and privacy): The month recap

**PR:** #411 (branch `p2/t32-month-recap` at commit `71b2255e`, base `origin/claude/p1a-vault-core`)
**Reviewer:** Gemini 3.8 Flash (independent second reviewer)
**Scratch copy:** `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t32-second/`
**Receipt:** `docs/implementation/receipts/P2-T32.md`

---

## Focus Area Findings

### 1. Exact Money
- **Minor units and BigInt arithmetic:**
  - `apps/app/src/wallet/recap/biggestDay.ts:31`: Daily expense sums are accumulated strictly via `BigInt(record.amount_minor)` into `dayTotals`. Zero floating-point arithmetic.
  - `apps/app/src/wallet/recap/biggestDay.ts:56`: `outMinor` is formatted strictly as `String(maxOut) as Minor`.
  - `apps/app/src/wallet/recap/WalletRecapScreen.tsx:117-123`: Spent, budget limit, and difference calculations (`diffMinor`) use `BigInt(spentMinor)` and `BigInt(budgetLimitMinor)`.
  - `apps/app/src/wallet/recap/recapShare.ts:24-31`: Over/under budget differences in share text are computed using `BigInt` subtraction.
- **Whole-baht formatting:**
  - In UI, all amounts (`spentMinor`, `budgetLimitMinor`, `diffMinor`, `biggest.outMinor`, `item.minor`) are rendered through `<WalletAmount>`, ensuring proper DM Sans 700 font rendering, thousand separators, and compact/exact satang handling.
  - In share text, amounts are formatted through `walletMoneyText(...)`.
- **Tie-breaker & filtering in `biggestDay`:**
  - `apps/app/src/wallet/recap/biggestDay.ts:26-28`: Deleted records (`deleted_at !== null`) and non-target months are properly ignored.
  - `apps/app/src/wallet/recap/biggestDay.ts:39-47`: `dayTotals.keys().sort()` sorts calendar dates ascending; `if (total > maxOut)` strictly breaks ties in favor of the earlier calendar date.
  - `apps/app/src/wallet/recap/biggestDay.ts:33-35`: Payday is flagged only if `record.type === 'income'` matches the salary category id (`cat.builtin_key === 'salary'`). Expense records categorized as salary do not trigger payday (verified by probe test).

### 2. Private Mode
- **Screen & VoiceOver / Accessibility labels:**
  - All rendered amounts on `WalletRecapScreen` delegate to `<WalletAmount>`.
  - Under private mode (`hidden: true`), `WalletAmount` replaces visual text with `฿••••` and sets `accessibilityLabel` to `common.amountHidden` ("ยอดเงินถูกซ่อนอยู่" / "Amount hidden"), completely suppressing the numeric satang digits and spoken amounts.
  - None of the testIDs (`recap-spent`, `recap-budget`, `recap-over`, `recap-under`, `recap-biggest-day-amount`) or surrounding labels contain numeric amounts.
- **Share text masking:**
  - `apps/app/src/wallet/recap/recapShare.ts:21-39`: When `hidden === true`, the total spent line and the budget line are omitted entirely. Top categories are emitted as `• ${cat.name}` without amount, colon, or `฿`.
  - Verified with strict regex/probe testing: with private mode enabled, not a single digit from spent, budget, difference, or category totals appears in `recapShareText`, and no `฿` symbol appears.

### 3. The Share Path
- `apps/app/src/screens/redesign/insights/recapData.ts:58-61`: `shareText(message)` passes only `message` to `Share.share({ message })`.
- No account identifiers, user IDs, wallet IDs, or hidden amounts are attached or included in the payload.
- `trackRecapShared()` and `trackRecapOpened()` emit analytics without payloads, complying with anti-goals (no amounts, notes, or identifiers in analytics).
- Share button copy uses `t('recap.share')` (`แชร์สรุป`), never containing `การ์ด` (satisfying W20 and board wording rules).

### 4. Logging
- Zero `console.*` or logger statements exist in any of the new or modified files (`WalletRecapScreen.tsx`, `recapData.ts`, `biggestDay.ts`, `recapShare.ts`, `Confetti.tsx`, `recapSections.tsx`).
- No amounts, names, or identifiers are logged.

---

## Probes and Independent Mutants

Executed in scratch copy `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t32-second/`:

1. **Sampled Planner Mutants (10/10 killed):**
   - `F1`: killed (count deleted records as active)
   - `F4`: killed (pick later date on tie instead of earlier)
   - `F5`: killed (never report payday)
   - `S1`: killed (leave spending in private share text)
   - `S2`: killed (include category amounts in private mode)
   - `S3`: killed (leave `฿` in private mode text)
   - `C1`: killed (render 23 pieces instead of 24)
   - `R1`: killed (play confetti while motion answer is pending)
   - `R2`: killed (play confetti under reduced motion)
   - `R7`: killed (share button says `การ์ด`)

2. **Custom Reviewer Probes (`probe_edge_cases.test.ts` - all 3 passed):**
   - Probe 1: BigInt precision exceeding `Number.MAX_SAFE_INTEGER` in `biggestDay` sums without precision loss.
   - Probe 2: Expense with salary category id does not trigger `payday: true`.
   - Probe 3: Exhaustive check of `recapShareText` under private mode confirms complete absence of `฿` and all satang/baht digits.

---

## Test Suites & Gate Verification

- `node --test apps/app/src/wallet/recap/biggestDay.test.ts`: 2 passed, 0 failed.
- `node --test apps/app/src/wallet/recap/recapShare.test.ts`: 2 passed, 0 failed.
- `npx vitest run src/wallet/recap/WalletRecap.render.test.tsx`: 11 passed, 0 failed.
- `npx vitest run src/screens/redesign/insights/RecapScreen.render.test.tsx`: 36 passed, 0 failed.
- `npx vitest run src/wallet/testing/walletHarness.render.test.tsx`: 9 passed, 0 failed.
- `npm run typecheck:app`: exit 0.
- `npm run typecheck:routes -w gogospend-app`: exit 0.
- `npm run test:app`: 34 passed, 0 failed.
- `npm run test:unit`: 978 passed, 0 failed.
- `git diff --check origin/claude/p1a-vault-core...71b2255e`: clean (exit 0).

### CI Status on PR #411
- CI workflow `backend` (run `43054279109`):
  - `Render, per-section suites (every other test)`: success (3m27s)
  - `Render, per-section suites (ids of length 3n+1)`: success (5m28s)
  - Remaining jobs progressing cleanly through the CI queue.

---

## Findings

- **Blocker:** None.
- **Major:** None.
- **Minor:** None.
- **Nit:**
  - `apps/app/src/wallet/recap/WalletRecapScreen.tsx:44`: `formatShortDate` manually indexes `THAI_MONTHS_SHORT` / `EN_MONTHS_SHORT` from a split string rather than using a date formatter, but correctly formats short dates for `YYYY-MM-DD` inputs in the recap view.

---

## Notes for Later Tasks

- `useRecapData` in `apps/app/src/screens/redesign/insights/recapData.ts` is now the shared loading hook for both `RecapScreen.tsx` and `WalletRecapScreen.tsx`. Keep `RecapLoadWithRecords` and `monthRecords` backwards-compatible when future insight features are added.

VERDICT: Approved
