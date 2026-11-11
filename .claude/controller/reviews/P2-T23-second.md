# Second Review for P2-T23: Home's data moves into a hook, and the Home models

Reviewer: Independent second reviewer (Gemini 3.8 Flash)
PR: #409 (`p2/t23-home-data`, commit `0c3bbeb7cb9518bfbfb928f20d70c47fe39553bb` against `origin/claude/p1a-vault-core`)
Focus: Money correctness, privacy, draft handling, logging integrity, and architecture boundaries.

---

## CI & Automated Gate Verification

PR #409 checks (`gh pr checks 409 --repo mygogocash/jotbun`) completed with all 9 jobs passing cleanly:
- `backend/Edge Worker (types, unit, workerd, build, PostgreSQL container)`: SUCCESS (1m58s)
- `backend/Exports (web and iOS bundles)`: SUCCESS (1m55s)
- `backend/Release image and smoke (never pushed)`: SUCCESS (16s)
- `backend/Render (every file but the per-section suites)`: SUCCESS (2m6s)
- `backend/Render, per-section suites (every other test)`: SUCCESS (3m34s)
- `backend/Render, per-section suites (ids of length 3n)`: SUCCESS (2m30s)
- `backend/Render, per-section suites (ids of length 3n+1)`: SUCCESS (3m10s)
- `backend/SQL integration and ops (local PostgreSQL 17 container)`: SUCCESS (1m45s)
- `backend/Typecheck, unit, API, build`: SUCCESS (1m49s)

Focused tests in isolated scratch copy (`0c3bbeb7`):
- Unit tests (`homeWallets.test.ts`, `budgetCardWords.test.ts`): 14/14 passed.
- Render tests (`homeData.render.test.tsx`): 6/6 passed, 0 stderr warnings.
- Neighbour render tests (`HomeScreen.render.test.tsx`): 44/44 passed unchanged.
- Mutants: Sampled 10 mutants across all modules (`H1`, `H8`, `H13`, `B1`, `B6`, `W1`, `W8`, `W9`, `D1`, `T1`); all 10 killed cleanly with matching SHA-256 restoration.

---

## Money Path & Privacy Audit

### 1. Exact Money Arithmetic
- **Minor Units & BigInt**: [availableBalances.ts:20-35](/Users/kunanonjarat/Developer/jotbun/apps/app/src/spend/v1/redesign/availableBalances.ts:20-35), [homeWallets.ts:41-65](/Users/kunanonjarat/Developer/jotbun/apps/app/src/wallet/home/homeWallets.ts:41-65), and [budgetCardWords.ts:31-33](/Users/kunanonjarat/Developer/jotbun/apps/app/src/wallet/home/budgetCardWords.ts:31-33) perform all balance, pending, today's spending, and per-day calculations strictly via `BigInt` over canonical satang strings. No intermediate Javascript numbers or floating-point conversions are used. Probed with amounts exceeding $2^{53}$ (`9007199254740995` satang); figures remain bit-exact.
- **Whole Baht Rounding (W9, C4)**: [budgetCardWords.ts:32](/Users/kunanonjarat/Developer/jotbun/apps/app/src/wallet/home/budgetCardWords.ts:32) defines `wholeBaht = (minor: Minor): Minor => ((BigInt(minor) / 100n) * 100n).toString();` and pairs with `perDayText(perDay)` which strips `.00` down to whole baht. Verified with probe tests across fractional satang values (`683.00`, `683.25`, `683.50`, `683.75`, `683.99`): all consistently round down to `฿683` and spoken `683 บาท` without satang or upward rounding.
- **Over-Budget Exactness**: When over budget, [budgetCardWords.ts:41](/Users/kunanonjarat/Developer/jotbun/apps/app/src/wallet/home/budgetCardWords.ts:41) preserves exact satang in both headline and spoken copy (e.g. `18,420 บาท 50 สตางค์`).

### 2. Private Mode (W10, P8, Review Focus 2)
- **Masking**: [budgetCardWords.ts:57](/Users/kunanonjarat/Developer/jotbun/apps/app/src/wallet/home/budgetCardWords.ts:57) renders `headline: hidden ? HIDDEN_AMOUNT : walletMoneyText(spent)`.
- **Side Text**: [budgetCardWords.ts:38-46](/Users/kunanonjarat/Developer/jotbun/apps/app/src/wallet/home/budgetCardWords.ts:38-46) returns `home.overWord` (`เกินงบ`) or `home.onTrack` (`ตามแผน`) with no amount placeholders.
- **Spoken Text**: [budgetCardWords.ts:50-54](/Users/kunanonjarat/Developer/jotbun/apps/app/src/wallet/home/budgetCardWords.ts:50-54) replaces the spent amount with `common.amountHidden` (`ซ่อนยอดเงินอยู่`) and deliberately omits the budget limit amount (as the limit is also financial data).
- **Leak Probe**: Probed with comprehensive Unicode digit matching (`[0-9]`, Thai digits `[\u0e50-\u0e59]`, and Eastern Arabic/Indic digits) across 26 combinations of states (on track, tight, at limit, over, no budget, month end, after month) in both Thai and English. Zero digits reach `headline`, `side.text`, or `spoken`.

### 3. Draft Lifecycle & Non-Double-Counting
- **Draft States**: In [availableBalances.ts:26](/Users/kunanonjarat/Developer/jotbun/apps/app/src/spend/v1/redesign/availableBalances.ts:26) and [homeWallets.ts:46](/Users/kunanonjarat/Developer/jotbun/apps/app/src/wallet/home/homeWallets.ts:46), only `WAITING_STATES` (`unsent`, `paused_upgrade`) affect available balance and pending sums. `sending`, `uncertain`, `needs_review`, and `acknowledged` commands are safely excluded from `pendingMinor` and available balance shifts.
- **Transfers**: Handled symmetrically: source decreases by amount, destination increases by amount; both wallets accrue the waiting transfer amount in `pendingMinor`.
- **Today's Confirmed Expenses**: [homeWallets.ts:59-66](/Users/kunanonjarat/Developer/jotbun/apps/app/src/wallet/home/homeWallets.ts:59-66) strictly filters `record.type === 'expense'`, ignoring income and transfers. Drafts (which do not reside in `todayRecords`) are not double-counted into `todayOutMinor`.

### 4. Logging & Privacy Leak Prevention
- Zero log calls (`console.*` or loggers) added or moved in this PR.
- No wallet names, account identifiers, notes, or monetary amounts are emitted.

---

## Findings

- **Blocker**: None.
- **Major**: None.
- **Minor**: None.
- **Nit**: None.

The refactor cleanly extracts `useHomeData` out of `HomeScreen.tsx` without changing behaviour or hook invocation ordering, ensures pure models stay pure (Node-executable without loading React or React Native), and adheres strictly to the plan specification and rulings P1–P15.

---

## Notes for Later Tasks

1. **P2-T24**:
   - Filter `data.records` by `record.occurred_on === today` when supplying `todayRecords` to `homeWallets`.
   - Once P2-T20 merges, replace the private copy of `frontFirst` in `wallet/home/homeWallets.ts` with `import { frontFirst } from '../wallets/walletsList.ts'`.
   - In `BudgetCard`, use `budgetCardWords(pace, hidden, t)` where `t` is constructed with `{ ...COMMON_COPY, ...COPY }` outside render.
   - Note that `useHomeData` already encapsulates 1D-T5's `useRefreshOnRevision`, so no additional revision refresh hook is needed in `WalletHomeScreen`.
2. **P5-T18b**:
   - `availableBalances` now resides in `src/spend/v1/redesign/availableBalances.ts` (re-exported by `entryHelpers.ts`). Edits supporting optional `price` should be made directly in `availableBalances.ts`.

VERDICT: Approved
