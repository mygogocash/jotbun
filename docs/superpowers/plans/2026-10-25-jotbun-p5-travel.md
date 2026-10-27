# Phase 5: Travel and currencies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a person keep records in any currency against a home currency they pick, with daily reference rates, their own rate, cash exchange and trips, so that every day, month and trip total is the sum of the home amounts frozen on its records ("a trip adds up to the satang").

**Architecture:** `packages/contracts` gains an ISO 4217 table, BigInt rate arithmetic and currency fields on the DTOs in place (C2). The vault rebuilds `wallets` (B18), adds money columns, `trips` and `settings`, and freezes each record's home amount at save from a reference rate the Worker reads from the catalog's `fx_rates` (filled by a Cron) and passes in. The app shows all money in its own currency and estimates offline from cached rates; the travel entry points stay behind a `travel` redesign area until the owner approves them (E2).

**Tech Stack:** Cloudflare Workers with SQLite Durable Objects, D1 (`CATALOG_DB`) and KV (`CONFIG`); Cron Triggers (`triggers.crons` in wrangler 4.152.0, a `scheduled()` export, UTC); drizzle-orm 0.45.3; `@cloudflare/vitest-plugin` 1.4.7; BigInt only, no money package; Expo SDK 58 through P2's Bun Wallet kit; Vitest 4.1 with happy-dom, and Node's test runner.

**Spec:** [docs/superpowers/specs/2026-10-25-jotbun-bun-wallet-cloudflare-design.md](../specs/2026-10-25-jotbun-bun-wallet-cloudflare-design.md). This plan implements §8 phase 5 using §2, §3 (D24, D31, D40, C2, C5, C6, C8), §4, §5.1, §5.2 (`tc-*`), §6.2, §6.3, §6.6, §6.10, §6.12 and §7. The boards are `docs/design/bun-wallet/tc-*.dc.html`. Under the controller's split (`ctx/boundaries-p3-p6.md`) this plan owns `P5-T2 (P5:currency)`, `P5-T23 (P5:trips)` and `P5-T21 (P5:travel-area)`, and consumes `P3-T2 (P3:source)`, `P3-T6 (P3:ai-results)`, `P4-T2 (P4:catalog-db)` and `P4-T7 (P4:slip-drafts)`.

## Shared files

Other plans also edit these; every edit here is additive and named in its task.
- Contracts: `packages/contracts/src/index.ts` and `v1/` `transactions.ts` (P3, P4), `wallets.ts`, `categories.ts`, `history.ts`, `policies.ts`, `privacy.ts`, `sync.ts`, `auth.ts`, `ai.ts` and `quickText.ts` (P3).
- Edge: `src/v1/protocol.ts`, `routes.ts` (`VAULT_ADDED_ROUTES`), `handler.ts`, `worker-routes.ts`, `env.ts`; `test/vault-route-coverage.test.ts` (`route-coverage.test.ts` after 1B-T13); `wrangler.jsonc` (after P6C-T1, a new top-level var or Cron trigger is repeated in `env.staging` and `env.production` in the same commit, A20), `src/server.ts`, `src/vault-worker.ts`, `test/c1-shape.test.ts`, `apps/edge/README.md`; `migrations/catalog/` (P4); the vault's `migrations/index.ts`, `schema.ts`, `commands/registry.ts`, `routes.ts`, `replies.ts`, `policies.ts`, `retention.ts`, `domain/*`, `reads/*`, `files/exports.ts`, `files/snapshots.ts`, `files/confirmation.ts` (1B-T10, P4-T11), `slips/*` (P4), `ai.ts`, `analytics.ts` and `test/workers/vault-schema.test.ts`; `src/analytics/server-analytics.ts` (1D-T3); `src/server/ai/*` and `src/v1/ai/*` (P3); the parity tests.
- App: `app.json` (the version), `src/config/featureFlags.ts` and its test, `src/api/client.ts`, `src/spend/v1/resources.ts`, `money.ts`, `pendingTotals.ts`, `spendDiary.ts`, `SpendDiaryContext.tsx`, `DeviceDiaryProvider.tsx`, the fakes, `ai/aiResources.ts`, `ai/tellBun.ts` and `ai/tellBunDrafts.ts` (P3), `src/storage/diaryRepository.ts`, `src/ui/keypadExpression.ts`, the models under `src/spend/v1/redesign/`, `src/screens/redesign/entry/*` and `record/recordActions.ts` (P2), 1D-T9's `conflict/ChoicePanel.tsx`, the `src/wallet/**` and `src/slips/**` files of P2, P3, P4 and P6B named in each task, 1D's `src/analytics/catalog.ts` and `events.ts`, `src/dev/catalogue/wallet/index.ts`, `src/messages/en.json`, `th.json`, `src/i18n/catalogs.test.ts`, `app/spend/all.tsx`.
- `docs/implementation/premium-progress.md`: receipts under "## P5: Travel and currencies".

## Calls made in this plan

The controller's calls applied: **B7** (P5-T27a, T27b), **B15** (P5-T2, T4, T10), **B16** with **A8** (P5-T13, X3), **B17** (P5-T2, T8, T10), **B18** (P5-T4), **A7** (P5-T10), **A9** (P5-T8, X2), **A10** (P5-T21), **A20** (P5-T7, T15), **A29** (P5-T2, T4, T5, T19). The builder's own, for a reviewer to check:
- **X1.** Quotes are kept as the feed sends them, per one unit of its base; a cross rate is one division, half-up to 12 significant digits (P5-T1, T6).
- **X2.** A call missing a rate writes nothing and names the rates; the Worker reads them and calls once more as a step (P5-T8).
- **X3.** C8 rewrites each record's latest change row in place and raises `pruned_through`, so phones resync (P5-T13).
- **X4.** Trips are soft-deleted and purged after 30 days; a tag naming a deleted trip reads as no trip (P5-T9, T10).
- **X5.** `settings` is a synced entity; the home currency is THB until its first change (P5-T5, T13).
- **X6.** Looks, icons and pack keys are shape checks in SQL and exact lists in the contracts (P5-T4).
- **X7.** The older wallet shape still requires THB; the new one takes any ISO currency (P5-T2).
- **X8.** `EXPORT_CSV_COLUMNS` stays for apps/api; the vault writes `VAULT_EXPORT_CSV_COLUMNS` (P5-T2, T14).
- **X9.** An own rate keeps the charged amount; an amount edit keeps the rate, a date edit takes that day's (P5-T10).
- **X10.** `rate_date` is the earlier quote day of a cross rate (P5-T8).
- **X11.** The fixture feed runs only where `JOTBUN_ENV` is local, test or staging, until D31 (P5-T7).
- **X12.** One Cron at 06:00 Bangkok fills five years, 366 days a run; older dates wait until it has (P5-T6, T7).
- **X13.** The `travel` area, read only through `useTravelArea()`, gates only the travel entry points; money already in a currency shows in it everywhere, Tell Bun's drafts included (P5-T18d, T18e, T21, T27b).
- **X14.** No rate push: §6.13's four events only (ox-push's rate notification is dropped).
- **X15.** An exchange into the home currency is valued at what was received (P5-T10).
- **X16.** C6: a foreign cash wallet defaults to its latest exchange's rate (P5-T21).
- **X17.** A trip summary returns exact sums; the phone estimates the other currencies (P5-T12, T23).
- **X18.** The contracts own the look, glyph and pack lists; P2's and 1D's modules re-export them (P5-T19, T20).
- **X19.** Withdrawn: A7 keeps 1A's date rule.
- **X20.** The minimum client version is one minor above what `app.json` holds when P5-T2 runs: `0.3.0` over P3's `0.2.0` or `0.2.1`, `0.4.0` over P6B-T10's `0.3.0` (C5, P5-T2).

## Owner questions

A task that depends on one says "default pending owner Qn" and follows the default (R26).
- **Q1. D31, the rate provider:** five years of daily history for THB and the thirteen against one base, a defined rate date, keyed HTTPS from a Cron, terms that allow storing and showing rates. Candidates (`ctx/map-p5-travel.md` §6): Frankfurter v2, Open Exchange Rates (USD base below the Developer plan), the Bank of Thailand API (lacks KRW, TWD, VND and LAK). Default: the fixture feed only; P5-T15 waits.
- **Q2. B15, `wallet_amount_minor`.** Default: B15.
- **Q3. B16, C8.** Default: B16 as A8 refines it.
- **Q4. B17, `rate_date`.** Default: B17, the earlier quote day (X10).
- **Q5. B18, the wallets rebuild.** Default: B18, under deferred foreign keys.
- **Q6. Trips.** Default: the boundaries' (no overlaps; the budget as an estimate; ended, edited and deleted); a trip's currency is fixed; trip start's steps 1 and 3 are drafts for E2.
- **Q7. A wallet's currency is fixed once created.** Default: yes.
- **Q8. The parity sessions against NestJS.** Default: the normalisers drop the phase 5 fields, and an export's `bytes` and `sha256`, comparing a downloaded CSV's first 18 columns; the sessions retire when the owner removes `apps/api`.
- **Q9. Dates east of Bangkok.** Default: no record dated after Bangkok's today (A7).
- **Q10. Edge amounts.** Default: a home or wallet amount of 0 is kept (an own charged amount of 0 is refused); one above 99,999,999,999 minor units is refused.
- **Q11. Rate precision.** Default: X1's 12 digits; an own rate's charged amount is authoritative.
- **Q12. The calendar steps, the per-day hint and the budget presets outside THB.** Default: the baht steps converted at the latest cached rate, to two significant figures; the hint in whole major units, rounded down; the baht presets only in a THB home.
- **Q13. Copy the boards do not show** (symbols and names beyond tc-default-currency's nine, the home currency confirmation and review, trip start's steps 1 and 3, the explainer, the wallet currency row, the refusals). Default: drafts for E2; the home currency list follows §6.10's order after the current one, not the board's.
- **Q14. Board figures and defaults the plan does not reproduce.** (a) tc-history-mixed and tc-trip-home show the month at ฿9,742.84 (฿8,257.16 left), ฿599 more than their day lines; the plan's data gives ฿9,143.84 (฿8,856.16 left). (b) tc-trip-home's credit card reads ใช้ไป ฿911, but the plan puts the boards' yen rows on that card (tc-history-mixed draws several on เงินสดเยน), so the card holds the trip. (c) tc-add-foreign shows the reference rate on the yen cash wallet; the plan follows C6 (its latest exchange's rate). (d) tc-trip-summary's แชร์การ์ดสรุปทริป promises a card; no v1 plan builds a trip image, so P5-T24 shares text (W20). Default: the plan's choice in each.
- **Q15. A foreign receipt or slip read by Bun.** Default: photo reads stay THB (D24), so a read during a yen trip fills the tray in baht (P5-T27a, T27b).

## Global Constraints

- **Packages (§4):** none new; no lockfile change.
- **Money (§4, §6.10, D24, D40):** minor units come from the contracts' ISO table, never from `Intl`; a record is at most 99,999,999,999 minor units of its currency; a rate is a decimal string of home units per source unit, applied in BigInt, half-up once, at save; totals add stored home amounts, balances stay in each wallet's currency and budgets in the home currency; slips, statements and cashback stay baht; the THB golden fixture stays.
- **Commands and SQL (§6.2):** one `transactionSync` per call with the seven steps, no `await`, no nested block (R21); I/O such as a rate is read by the Worker first and passed in. STRICT tables (R16); amounts and sums leave SQLite as `CAST(... AS TEXT)`; an unbounded list binds as one JSON parameter through `json_each` (R57); large reads iterate the cursor.
- **Routes and gates (§4, C12):** every new mutating route carries `writes` (503 before authentication when paused); every new `/v1` route joins `VAULT_ADDED_ROUTES`; dynamic Expo Router segments are lowercase (`[id]`). Failures are logged by `failureName` only (`logFailure`).
- **Migrations:** vault, D1 and diary migrations take their number at integration; the integrator renames `NNNN_*` and updates the journal and the receipt.
- **E2 (§4):** the travel entry points stay behind the `travel` area, and every new line lives in `src/wallet/travel/copy.ts` or `src/wallet/currency/copy.ts` (`{ th, en }`, P2-T3's `DraftTable`), until P5-T29. Thai first, §5.1's voice, no emojis, no U+2014 or U+2013, no times on rows (W12). A checkpoint taken without a simulator is recorded SKIPPED, with its section ids for the owner.
- **Accessibility and privacy (§4, D41):** 44 pt targets in their own box; text 4.5:1 and graphics 3:1; AX5 with nothing truncated; VoiceOver reads a symbol as its currency's name; in private mode every amount, in any currency, is its symbol and `••••`, and share text carries no amount.
- **Analytics (R23 to R25):** through 1D-T1's emitters, once per action, in the rule that performs it; never an amount, a rate, a trip, wallet or category name, or a note.
- **Process (handover §4):** typed stubs; a behavioural RED with counts, in which each new case fails on its assertion against the typed stubs and none on a missing module; GREEN; a mutation check; the gate; a receipt; a local commit with the attribution trailer; an independent read-only review. No push, no bare `git stash`, nothing under `vendor/`, no cloud resource; hosted, native and device checks are recorded SKIPPED with the reason.
- **Gates** (repo root). Edge: `npm run typecheck:edge && npm run test:edge && npm run test:edge:workers && npm run build:edge && npm run test:edge:db`. A contracts change also runs `npm run typecheck` (the read-only API still compiles) and `npm run test:api -- src/v1/contracts.spec.ts` (unchanged). App: `npm run typecheck:app && npm run typecheck:routes -w gogospend-app && npm run test:app && npm run test:unit && npm run test:render -w gogospend-app && npm run export:web -w gogospend-app -- --max-workers 2 && git diff --check`.

## Review Focus

The six failure modes most likely to bite a person that no ported suite exercises; each has its test in the owning task.
1. **A feed that skips a currency on a day.** The record takes that currency's latest earlier quote and `rate_date` names the earlier day (P5-T6 `a record's date takes that day's quote, else the latest earlier day, per currency`; P5-T8 `quote days differ: the earlier names the rate`).
2. **An estimate that moves when the record is confirmed.** Once the vault answers, the row, the toast and the day total show its home amount, never the offline estimate (P5-T21 `after the send, the row shows the vault's home amount, not the estimate`).
3. **A home currency change while another phone holds unsent records.** Queued records arrive in the new home currency (an own or exchange one becomes a reference record that keeps its charged amount on its wallet), and that phone resyncs instead of reading deltas over stale amounts (P5-T13 `a record sent after the change is in the new home currency`, `an own-rate record queued before the change arrives as a reference record in the new home currency, and its card keeps the charged amount`, `older cursors resync, and the snapshot carries the new home amounts`).
4. **The ends of the range.** ₫1 in a baht home is kept at 0; ฿999,999,999.99 into a dong home passes the cap and is refused on its field, writing nothing (P5-T10, P5-T13).
5. **A trip whose dates move under its records.** Overlaps, more than 366 days, and an edit leaving a tagged record outside are refused with the field named (P5-T9).
6. **Budgets converting either way.** `0000`'s sublimit triggers fire on every update, so the order of the overall and the limits depends on whether the numbers shrink or grow (P5-T13 `budgets convert at the change day's rate: the overall half-up, each limit down`, `budgets convert into a currency with larger numbers`).

---

## File structure

New modules sit beside the code they extend: contracts in `packages/contracts/src/v1/`; the vault in `apps/edge/src/vault/`; the rate book and the feed in `apps/edge/src/v1/rates/` and `src/background/`; the app's travel code in `apps/app/src/wallet/travel/`, with routes `app/spend/trip/new.tsx`, `app/spend/trip/[id].tsx` and `app/settings/home-currency.tsx`.

**Lanes:** T1, then T2 and T3. Vault and feed: T4 to T14 as their phase 1, 3 and 4 dependencies land; T15 once Q1 is answered. App: T16 after T1, T17 after T2 and T3, T19 after T17, T18a to T18d after T16 and T17, T18e after T18d and P3's and P4's screens, T20 after T18a; the screens T21 to T26 after them; T27a and T27b after P3. T28 and T29 last.

---

### Task P5-T1: The currency table and exact rate arithmetic

**Starts after:** base

**Files:**
- Create: `packages/contracts/src/v1/currency.ts`
- Modify: `packages/contracts/src/v1/validation.ts` (`addDays`), `packages/contracts/src/index.ts`
- Test: `apps/edge/test/contracts/currency.test.ts` (Node)

**Interfaces:**
- Produces:
  ```ts
  export type MinorUnits = 0 | 2 | 3 | 4
  export const ISO_4217_MINOR_UNITS: Readonly<Record<string, MinorUnits>>   // ISO 4217 list one (SIX, 2026-09-17), codes with a numeric minor unit only
  export type CurrencyCode = string
  export function isCurrencyCode(value: unknown): value is CurrencyCode
  export function minorUnitsOf(code: CurrencyCode): MinorUnits              // TypeError for an unknown code
  export const DEFAULT_HOME_CURRENCY = 'THB'
  export const PICKER_CURRENCIES: readonly ['JPY', 'KRW', 'CNY', 'HKD', 'TWD', 'SGD', 'MYR', 'VND', 'LAK', 'USD', 'EUR', 'GBP', 'AUD']
  export const CURRENCY_SYMBOLS: Readonly<Record<string, string>>           // THB ฿ JPY ¥ KRW ₩ CNY ¥ HKD HK$ TWD NT$ SGD S$ MYR RM VND ₫ LAK ₭ USD $ EUR € GBP £ AUD A$
  export const RATE_SOURCES: readonly ['reference', 'own', 'exchange']; export type RateSource
  export function parseRate(value: unknown, field?: string): string          // canonical positive decimal, at most 12 significant digits, else ContractValidationError on field
  export function canonicalQuote(value: unknown): string | null             // a positive finite JSON number or decimal text, at most 15 significant digits
  export function convertMinor(amount: Minor | bigint, rate: string, from: CurrencyCode, to: CurrencyCode): bigint       // half-up once
  export function convertMinorDown(amount: Minor | bigint, rate: string, from: CurrencyCode, to: CurrencyCode): bigint   // rounded down (B16's limits)
  export function crossRate(perBaseTo: string, perBaseFrom: string): string // units of `to` per one `from`
  export function rateFromAmounts(fromMinor: Minor | bigint, from: CurrencyCode, toMinor: Minor | bigint, to: CurrencyCode): string
  export function minorToDecimal(minor: Minor, code: CurrencyCode): string
  export function decimalToMinor(text: string, code: CurrencyCode): bigint | null   // null when malformed or finer than the currency
  export function moneyText(minor: Minor, code: CurrencyCode): string       // symbol, comma groups, the currency's decimals; U+2212 before a negative; "CHF 12.50" without a symbol
  export function rateText(rate: string): string                            // display: 4 significant digits below 1, else at most 4 decimals, trailing zeros dropped
  export function addDays(date: string, days: number): string               // validation.ts
  ```
- Rules: `Intl` is never read. With `rate = N / 10^s` and `k = e_to - e_from`: `n = amount * N * 10^max(k, 0)`, `d = 10^s * 10^max(-k, 0)`, `convertMinor` is `(2n + d) / (2d)` and `convertMinorDown` is `n / d`, in BigInt. `crossRate` and `rateFromAmounts` scale the exact quotient to 12 significant digits, round half-up once and drop trailing zeros (default pending owner Q11). The symbols no board draws (HK$, NT$, ₭, £, A$) are drafts (default pending owner Q13).

- [ ] **Step 1: Write typed stubs, then the failing tests** (the boards' figures, `ctx/map-p5-travel.md` §5):
  ```ts
  it('minor units come from the ISO table, never from Intl', () => {
    expect(['THB', 'JPY', 'KRW', 'VND', 'LAK', 'USD', 'BHD', 'CLF'].map(minorUnitsOf)).toEqual([2, 0, 0, 0, 2, 2, 3, 4])
    const codes = (u: number) => Object.entries(ISO_4217_MINOR_UNITS).filter(([, v]) => v === u).map(([c]) => c).sort()
    expect(codes(0)).toEqual(['BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG', 'RWF', 'UGX', 'UYI', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'])
    expect([codes(3), codes(4)]).toEqual([['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND'], ['CLF', 'UYW']])
    expect([Object.keys(ISO_4217_MINOR_UNITS).length, codes(2).length]).toEqual([165, 139])   // SIX list one of 2026-09-17
    expect([...PICKER_CURRENCIES, 'THB'].every(isCurrencyCode)).toBe(true)
    for (const bad of ['XAU', 'thb', 'ABC', 'JPYX', 1]) expect(isCurrencyCode(bad)).toBe(false)
  })
  it('converts once, half-up, in exact integers', () => {
    const jpy = (y: string, r: string) => convertMinor(y, r, 'JPY', 'THB')
    expect([jpy('4620', '0.2312'), jpy('1200', '0.2312'), jpy('360', '0.2312'), jpy('43000', '0.2312'), jpy('120000', '0.2312')]).toEqual([106814n, 27744n, 8323n, 994160n, 2774400n])
    expect([jpy('3400', '0.2308'), jpy('7980', '0.2308'), jpy('4620', '0.2308'), jpy('2580', '0.2317')]).toEqual([78472n, 184178n, 106630n, 59779n])
    expect(jpy('6180', '0.2312')).toBe(142882n)                       // the day's yen at once; its stored rows add to 142,881
    expect([convertMinor('6500', '4.6583', 'THB', 'JPY'), convertMinor('1800000', '4.6583', 'THB', 'JPY'), convertMinor('150013', '4.6583', 'THB', 'JPY')]).toEqual([303n, 83849n, 6988n])
    expect(convertMinorDown('100005', '4.6583', 'THB', 'JPY') + convertMinorDown('50008', '4.6583', 'THB', 'JPY')).toBe(6987n)
    expect([convertMinor('1', '0.0013', 'VND', 'THB'), convertMinor('1', '4.6583', 'THB', 'JPY'), convertMinor('5', '0.5', 'THB', 'THB')]).toEqual([0n, 0n, 3n])
    expect(convertMinor('99999999999', '765.6', 'THB', 'VND')).toBe(765599999992n)
  })
  it('cross rates and rates from amounts round once to 12 significant digits', () => {
    expect([crossRate('34.755', '150'), crossRate('34.62', '150'), crossRate('34.68', '150'), crossRate('149.0656', '32')]).toEqual(['0.2317', '0.2308', '0.2312', '4.6583'])
    expect([crossRate('150', '34.68'), crossRate('32', '149.0656')]).toEqual(['4.32525951557', '0.214670587983'])
    expect(rateFromAmounts('4620', 'JPY', '107550', 'THB')).toBe('0.232792207792')   // tc-rate-edit: ฿1,075.50 charged
    expect(rateFromAmounts('43000', 'JPY', '1000000', 'THB')).toBe('0.232558139535')  // tc-exchange: ฿10,000 for ¥43,000
    expect(convertMinor('4620', '0.232558139535', 'JPY', 'THB')).toBe(107442n)
  })
  it('rates, quotes and amounts as text', () => {
    expect([parseRate('0.2312'), parseRate('1'), parseRate('765.6')]).toEqual(['0.2312', '1', '765.6'])
    for (const bad of ['0', '-1', '0.23120', '.5', '1e3', '0.1234567890123', ' 1', 1, null]) expect(() => parseRate(bad, 'rate')).toThrow(ContractValidationError)
    expect([canonicalQuote(149.0656), canonicalQuote('34.6800'), canonicalQuote(0), canonicalQuote(Number.NaN), canonicalQuote('1.23e5')]).toEqual(['149.0656', '34.68', null, null, null])
    expect([minorToDecimal('4620', 'JPY'), minorToDecimal('106814', 'THB'), minorToDecimal('-5', 'THB'), minorToDecimal('1234', 'BHD')]).toEqual(['4620', '1068.14', '-0.05', '1.234'])
    expect([decimalToMinor('1075.50', 'THB'), decimalToMinor('12.5', 'JPY'), decimalToMinor('1,075', 'THB')]).toEqual([107550n, null, null])
    expect([moneyText('106814', 'THB'), moneyText('4620', 'JPY'), moneyText('-5000', 'THB'), moneyText('1250', 'CHF')]).toEqual(['฿1,068.14', '¥4,620', '−฿50.00', 'CHF 12.50'])
    expect(['0.2312', '0.232792207792', '0.232558139535', '4.32525951557', '765.6', '0.00130612'].map(rateText)).toEqual(['0.2312', '0.2328', '0.2326', '4.3253', '765.6', '0.001306'])
    expect([addDays('2026-10-31', 1), addDays('2026-11-03', -366), addDays('2028-02-28', 1)]).toEqual(['2026-11-01', '2025-11-02', '2028-02-29'])
  })
  ```
- [ ] **Step 2: Run it and see it fail.** Run: `npm run test:edge -- test/contracts/currency.test.ts`. Record the counts.
- [ ] **Step 3: Implement** the table (from SIX's list one), the symbols and the functions, BigInt only.
- [ ] **Step 4: Run it and see it pass,** then `npm run typecheck`.
- [ ] **Step 5: Mutation check.** Round half-even: the `5 at 0.5` case fails. Truncate: the ¥2,580 case reads 59,778. Take exponents from `Intl.NumberFormat`: LAK reads 0 and the first case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add the ISO 4217 table and exact BigInt rate arithmetic to the contracts"`

---

### Task P5-T2: Currency fields on wallets, categories and records, in the contract and the app's validators

**Starts after:** P5-T1, P3-T2 (P3:source)

**Delivers:** P5:currency

**Files:**
- Modify: `packages/contracts/src/v1/wallets.ts`, `categories.ts`, `transactions.ts`, `history.ts`, `policies.ts`, `privacy.ts`, `auth.ts`, `packages/contracts/src/index.ts`
- Modify: `apps/app/src/spend/v1/resources.ts` (`isTotals` accepts an optional `currency`), `apps/app/app.json` (`expo.version` one minor up, X20)
- Test: `apps/edge/test/contracts/shapes.test.ts` (Node), `apps/app/src/spend/v1/resources.test.ts` (one case), `apps/app/src/api/clientVersion.test.ts` (Node, new); `apps/api/src/v1/contracts.spec.ts` runs unchanged

**Interfaces:**
- Consumes: `CurrencyCode`, `isCurrencyCode`, `parseRate`, `RateSource`, `RATE_SOURCES` (P5-T1); P3-T2's `TransactionSource`, the optional `source` on both record shapes (`P3-T2 (P3:source)`) and `AI_MIN_CLIENT_VERSION`.
- Produces (contracts; every new DTO field is optional in the TypeScript type, as older snapshots lack it; the vault always sends it from phase 5 on):
  ```ts
  // wallets.ts (WALLET_CURRENCY stays 'THB': the older shape's only currency)
  export const WALLET_KINDS: readonly ['cash', 'bank', 'credit_card', 'transit']; export type WalletKind
  export const WALLET_MATERIALS: readonly ['silk', 'paper', 'titanium', 'sky', 'peach']; export type WalletMaterial
  export const BUN_FACES: readonly ['smile', 'wink', 'calm', 'happy', 'wow']; export type BunFaceName
  export type WalletLookFields = { type: WalletKind | null; material: WalletMaterial | null; bun_face: BunFaceName | null }
  // WalletSnapshot.currency becomes CurrencyCode; WalletSnapshot gains Partial<WalletLookFields>
  // CreateWalletRequest gains currency?: CurrencyCode and Partial<WalletLookFields>; UpdateWalletRequest gains Partial<WalletLookFields> (never a currency, Q7)
  // categories.ts
  export const CATEGORY_PICKER_GLYPHS: readonly ['food', 'coffee', 'car', 'bag', 'home', 'receipt', 'heart', 'lotus', 'gift', 'phone', 'paw', 'book']; export type PickerGlyph
  export const PACK_KEYS: readonly ['family_out', 'merit', 'delivery', 'motorbike_rail', 'topup', 'seven', 'lottery', 'pets', 'family_in']; export type PackKey
  // CategoryDto gains icon?: PickerGlyph | null and pack_key?: PackKey | null; CreateCategoryRequest gains both; UpdateCategoryRequest gains icon?: PickerGlyph | null and pack_key?: PackKey
  // transactions.ts
  export type RecordMoney = { currency: CurrencyCode; rate: string; rate_source: RateSource; rate_date: string | null; home_amount_minor: Minor; trip_id: string | null }
  export const RECORD_MONEY_KEYS: readonly ['currency', 'home_amount_minor', 'rate', 'rate_date', 'rate_source', 'trip_id']
  // EntryDto gains Partial<RecordMoney & { wallet_amount_minor: Minor | null }> (B15, default pending owner Q2); TransferDto gains Partial<RecordMoney & { to_amount_minor: Minor | null }>; rate_date is B17's (default pending owner Q4)
  // CreateTransactionRequest gains currency?, rate_source?, rate?, home_amount_minor?, home_currency?: CurrencyCode (the home an own or exchange figure is against), trip_id?: string | null, and on a transfer to_amount_minor?
  // UpdateTransactionRequest gains currency?, rate_source?, rate?, home_amount_minor?, home_currency?, to_amount_minor?, trip_id?: string | null
  // history.ts
  export const HISTORY_MAX_WALLETS = 20
  // HistoryFilter gains trip_id?: string, currency?: CurrencyCode, wallet_ids?: string[]; Totals gains currency?: CurrencyCode (the home currency of every amount but by_wallet)
  // policies.ts: MeDto gains home_currency?: CurrencyCode
  // privacy.ts (EXPORT_CSV_COLUMNS unchanged, X8)
  export const VAULT_EXPORT_CSV_CURRENCY_COLUMNS: readonly ['rate', 'rate_source', 'rate_date', 'home_amount', 'home_amount_minor', 'home_currency', 'wallet_amount', 'wallet_amount_minor', 'wallet_currency', 'to_amount', 'to_amount_minor', 'to_currency', 'trip_id', 'trip_name', 'source']
  export const VAULT_EXPORT_CSV_COLUMNS: readonly [...typeof EXPORT_CSV_COLUMNS, ...typeof VAULT_EXPORT_CSV_CURRENCY_COLUMNS]; export type VaultExportCsvColumn
  // auth.ts: older builds refuse the new keys (C5); P6C raises config:v1.client_versions to it before the phase 5 server serves phones
  export const CURRENCY_MIN_CLIENT_VERSION = '0.3.0'   // X20
  ```
- Validators (X7): a wallet has today's seven keys with THB, or those plus the three looks with any ISO currency; a category has `icon` and `pack_key` both or neither (`pack_key` null on a built-in); a record has no money key, or every `RECORD_MONEY_KEYS` key plus `wallet_amount_minor` (entry) or `to_amount_minor` (transfer), each in range (`rate` canonical; `rate_date` null or a date; amounts 0 to the cap, `wallet_amount_minor` and `to_amount_minor` also null, `to_amount_minor` from 1; `trip_id` null or a UUID).

- [ ] **Step 1: Write the failing tests** (the new exports as typed stubs first, the validators unchanged).
  - `shapes.test.ts`:
    - `an older wallet is THB; a newer one carries its currency and its look`: today's THB wallet is valid and `{ ...it, currency: 'USD' }` is not; `{ ...it, currency: 'JPY', type: 'cash', material: 'sky', bun_face: 'wow' }` is valid; with `type: 'ewallet'`, with `material` missing, or with `currency: 'jpy'` it is not.
    - `a category has its icon and pack key, or neither`: `{ ...custom, icon: 'lotus', pack_key: 'merit' }` and `{ ...builtin, icon: null, pack_key: null }` are valid; `{ ...builtin, icon: null, pack_key: 'merit' }`, `{ ...custom, icon: 'boat', pack_key: null }` and a category with `icon` alone are not.
    - `a record carries all of its money fields or none`: the yen expense `{ ...entry, amount_minor: '4620', currency: 'JPY', rate: '0.2312', rate_source: 'reference', rate_date: '2026-11-03', home_amount_minor: '106814', wallet_amount_minor: '106814', trip_id: TRIP }` is valid, and so is it with `home_amount_minor: '0'`; without `trip_id`, with `rate: '0.23120'`, `rate_source: 'market'`, `home_amount_minor: '-1'` or a `to_amount_minor` it is not; the exchange `{ ...transfer, amount_minor: '1000000', currency: 'THB', rate: '1', rate_source: 'reference', rate_date: null, home_amount_minor: '1000000', to_amount_minor: '43000', trip_id: null }` is valid and is not with `wallet_amount_minor`; the older shapes of `apps/api/src/v1/contracts.spec.ts` pass, with and without `attachment_id` and `source`.
    - `the vault's export header is today's 18 columns, then the 15 currency columns`: `VAULT_EXPORT_CSV_COLUMNS.slice(0, 18)` deep-equals `EXPORT_CSV_COLUMNS` and the rest equals the list above.
  - `resources.test.ts`: `totals may name their currency`: a history page whose summary carries `currency: 'JPY'` is valid, `currency: 'jpy'` is `invalid_response`, and one without `currency` is valid.
  - `clientVersion.test.ts`: `this build is at least the minimum client version, which is above P3's and shared with no other`: `compareVersions(appJson.expo.version, CURRENCY_MIN_CLIENT_VERSION) >= 0` (read with `readFileSync`; it fails until `app.json` is raised), `compareVersions(CURRENCY_MIN_CLIENT_VERSION, AI_MIN_CLIENT_VERSION)` is `1`, and no other `*_MIN_CLIENT_VERSION` export equals it.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge -- test/contracts/shapes.test.ts` and `npm run test:unit -w gogospend-app -- src/spend/v1/resources.test.ts src/api/clientVersion.test.ts`. Record the counts.
- [ ] **Step 3: Implement** the types, lists and validators, `isTotals`, and the app version.
- [ ] **Step 4: Run them and see them pass,** then `npm run typecheck`, `npm run test:api -- src/v1/contracts.spec.ts` (unchanged: an older wallet in USD is still refused), the edge gate and the app gate.
- [ ] **Step 5: Mutation check.** Accept any currency in the older wallet shape: the USD case and the API's contract test fail. Accept a record with only some money keys: the partial case fails. Require `currency` on totals: the older-summary case fails.
- [ ] **Step 6: Gate, receipt, commit.** The receipt names `CURRENCY_MIN_CLIENT_VERSION` and the owner action that goes with it. `git commit -m "Add currencies, looks, icons and pack keys to the v1 contract in place, still reading older shapes"`

---

### Task P5-T3: The trip, settings and rates contracts

**Starts after:** P5-T1

**Files:**
- Create: `packages/contracts/src/v1/trips.ts`, `settings.ts`, `rates.ts`
- Modify: `packages/contracts/src/v1/sync.ts` (`SYNC_ENTITY_VALIDATORS` gains `trip` and `settings`), `packages/contracts/src/index.ts`
- Test: `apps/edge/test/contracts/trips.test.ts` (Node)

**Interfaces:**
- Consumes: `CurrencyCode`, `isCurrencyCode`, `RateSource`, `canonicalQuote`, `addDays` (P5-T1); `normalizeName`, `MINOR_AMOUNT_MAX`, `isUuid` (contracts).
- Produces:
  ```ts
  // trips.ts
  export const TRIP_MAX_DAYS = 366
  export type TripDto = { id: string; name: string; currency: CurrencyCode; starts_on: string; ends_on: string; budget_minor: Minor | null; deleted_at: string | null; version: number }   // also the change-log snapshot
  export type CreateTripRequest = { id: string; name: string; currency: CurrencyCode; starts_on: string; ends_on: string; budget_minor?: Minor | null }
  export type UpdateTripRequest = { name?: string; starts_on?: string; ends_on?: string; budget_minor?: Minor | null }   // never the currency (Q6)
  export type TripMoney = { spent_home_minor: Minor; spent_trip_minor: Minor; other_home_minor: Minor }
  export type TripRateUsed = { date: string; currency: CurrencyCode; rate: string; rate_source: RateSource; rate_date: string | null }
  export type TripSummaryDto = { trip: TripDto; home_currency: CurrencyCode; count: number; totals: TripMoney; days: (TripMoney & { date: string })[]; categories: (TripMoney & { category_id: string })[]; rates: TripRateUsed[]; as_of_revision: Revision }
  export function isTripSnapshot(value: unknown): value is TripDto
  export function isTripSummaryDto(value: unknown): value is TripSummaryDto
  // settings.ts
  export type SettingsSnapshot = { id: string; home_currency: CurrencyCode; version: number }
  export type HomeCurrencyRequest = { currency: CurrencyCode }
  export type HomeCurrencyPreview = { currency: CurrencyCode; records: number; own_rates: number; budgets: number }
  export function isSettingsSnapshot(value: unknown): value is SettingsSnapshot
  export function isHomeCurrencyPreview(value: unknown): value is HomeCurrencyPreview
  // rates.ts
  export type FxQuoteDto = { per_base: string; day: string }   // units of the currency per one unit of the base; the feed day it is from
  export type RatesTodayDto = { base: CurrencyCode; as_of: string; rates: Readonly<Record<CurrencyCode, FxQuoteDto>> }
  export function isRatesTodayDto(value: unknown): value is RatesTodayDto
  ```
- Rules: a trip has exactly its keys; `name` is what `normalizeName` returns; `starts_on <= ends_on` with at most `TRIP_MAX_DAYS` days counting both ends; `budget_minor` null or 1 to the cap, in the trip's currency. `TripMoney`: `spent_trip_minor` adds the amounts of the trip's expenses in the trip currency, `other_home_minor` the home amounts of its expenses in any other currency, `spent_home_minor` every expense's home amount. In `RatesTodayDto` every key is an ISO code other than `base`, every `per_base` is canonical (`canonicalQuote`), and every `day` is on or before `as_of`.

- [ ] **Step 1: Write the failing tests** (typed stubs answering false first):
  - `the board's trip is valid; a trip ending first, longer than 366 days or with a zero budget is not`: `{ id, name: 'ทริปญี่ปุ่น', currency: 'JPY', starts_on: '2026-11-01', ends_on: '2026-11-08', budget_minor: '120000', deleted_at: null, version: 1 }` is valid; `ends_on: '2026-10-31'`, `ends_on: addDays('2026-11-01', 366)`, `budget_minor: '0'`, `currency: 'jpy'` and an extra key are not; `ends_on: addDays('2026-11-01', 365)` is.
  - `settings and the preview are exact`: `{ id, home_currency: 'JPY', version: 2 }` is valid, `home_currency: 'XAU'` is not; a preview with `records: -1` is not.
  - `a trip summary is exact`: the trip above with `home_currency: 'THB'`, `count: 13`, totals `'883184'`, `'38200'` and `'0'`, no categories or rates, `as_of_revision: '7'` and the day `{ date: '2026-11-03', spent_trip_minor: '6180', spent_home_minor: '142881', other_home_minor: '0' }` is a `TripSummaryDto`; that day without `date` is not.
  - `today's rates are quotes against one base, none after the day`: `{ base: 'USD', as_of: '2026-11-03', rates: { THB: { per_base: '34.68', day: '2026-11-03' }, JPY: { per_base: '150', day: '2026-11-02' } } }` is valid; a `USD` key, `per_base: '0'` and a `day` of `2026-11-04` are not.
  - `sync carries trips and settings, and an older reader skips them`: `isEntityChange({ entity: 'trip', id, version: 1, state: 'active', snapshot: trip })` and the same for `entity: 'settings'` with the settings above are true; with a validators map lacking `trip` it is false by default and true with `{ unknownEntities: 'skip' }`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge -- test/contracts/trips.test.ts`. Record the counts.
- [ ] **Step 3: Implement** the three modules and the two sync entries.
- [ ] **Step 4: Run them and see them pass,** then `npm run typecheck`.
- [ ] **Step 5: Mutation check.** Count trip days without the last one: the 365 and 366 cases swap. Drop `settings` from `SYNC_ENTITY_VALIDATORS`: the sync case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add the trip, home currency and rates contracts, and sync their entities"`

---

### Task P5-T4: The vault migration: a rebuilt wallets table, currency columns, trips and settings

**Starts after:** 1B-T2

The rebuild is B18's call (default pending owner Q5); the fixed currency is default pending owner Q7.

**Files:**
- Create: `apps/edge/src/vault/migrations/NNNN_currencies_trips.sql` (numbered by the integrator after every merged vault migration, P3's and P4's included)
- Modify: `apps/edge/src/vault/migrations/index.ts` (the entry), `apps/edge/src/vault/schema.ts` (the new columns; tables `trips` and `settings`), `apps/edge/test/workers/vault-schema.test.ts` (the pinned table list and counts)
- Create: `apps/edge/test/workers/support/migrations.ts` (`migrateBefore(state, suffix)`: `deleteAll()`, then drizzle's `migrate` with the journal entries before the one whose tag ends with `suffix`, so the integrator's number does not matter)
- Test: `apps/edge/test/workers/currency-migration.test.ts`

**Interfaces:**
- Consumes: the `0000` schema (base) and 1B-T2's `0001`; drizzle's `migrate` (`drizzle-orm/durable-sqlite/migrator`); `VAULT_MIGRATIONS`.
- Produces, in this order in one migration (B18: `0000` and `0001` are never edited; the migrator runs the whole entry inside one `transactionSync`):
  1. `PRAGMA defer_foreign_keys = ON`. Every trigger and view whose SQL names `wallets` (`SELECT type, name, sql FROM sqlite_master WHERE type IN ('trigger', 'view') AND sql LIKE '%wallets%'`; none in `0000` or `0001`) is dropped here and created again after step 4.
  2. `CREATE TABLE wallets_next`: today's columns and rules, except `currency TEXT NOT NULL CHECK (currency GLOB '[A-Z][A-Z][A-Z]')`, plus `type`, `material` and `bun_face`, each `TEXT CHECK (x IS NULL OR (length(x) BETWEEN 1 AND 32 AND x NOT GLOB '*[^a-z_]*'))` (X6), STRICT.
  3. `INSERT INTO wallets_next (id, name, currency, opening_minor, tracking_start, archived, version, created_at, updated_at) SELECT ... FROM wallets`; `DROP TABLE wallets`; `ALTER TABLE wallets_next RENAME TO wallets`.
  4. `PRAGMA defer_foreign_keys = OFF` (setting it off before the commit clears the violations the drop counted, which the copy has already answered), then `CREATE TRIGGER wallets_currency_immutable BEFORE UPDATE OF currency ON wallets WHEN NEW.currency IS NOT OLD.currency BEGIN SELECT RAISE(ABORT, 'wallet currency is immutable'); END` (Q7).
  5. `categories`: `ADD COLUMN icon TEXT` and `ADD COLUMN pack_key TEXT`, each with X6's shape check; `pack_key` also requires `builtin_key IS NULL`.
  6. `transactions`, by ADD COLUMN only (a rebuild would cascade into `transaction_attachments`): `currency TEXT NOT NULL DEFAULT 'THB'` (ISO shape), `rate TEXT NOT NULL DEFAULT '1'` (1 to 40 digits and dots), `rate_source TEXT NOT NULL DEFAULT 'reference'` (`reference`, `own`, `exchange`), `rate_date TEXT` (null or a real date), `home_amount_minor INTEGER` (null or 0 to the cap), `wallet_amount_minor INTEGER` (null, or 0 to the cap when `type <> 'transfer'`), `to_amount_minor INTEGER` (null, or 1 to the cap on a transfer), `trip_id TEXT` (no foreign key, X4); then `UPDATE transactions SET home_amount_minor = amount_minor WHERE home_amount_minor IS NULL` and the partial index `transactions_trip_idx (trip_id, occurred_on)` over live tagged rows.
  7. `trips` (`id` primary key, `name`, `currency`, `starts_on`, `ends_on`, `budget_minor`, `version`, `deleted_at`, `created_at`, `updated_at`), STRICT, checking a name of 1 to 80 trimmed characters, the ISO shape, real dates with `ends_on >= starts_on`, a budget null or 1 to the cap, a version of 1 or more; the partial index `trips_dates_idx (starts_on, ends_on)` over live trips.
  8. `settings` (`id INTEGER PRIMARY KEY CHECK (id = 1)`, `entity_id`, `home_currency` in the ISO shape, `version` of 1 or more, `updated_at`), STRICT.
  - `schema.ts` gains the columns and `trips`, `settings`; reads of `home_amount_minor` treat null as `amount_minor` (a row an older release wrote), and the vault writes it on every row from phase 5 on.
- **If workerd refuses `PRAGMA defer_foreign_keys`** (UNVERIFIED for Durable Objects; documented for D1): steps 1 to 4 become `PRAGMA legacy_alter_table = ON`, `ALTER TABLE wallets RENAME TO wallets_previous` (child foreign keys keep naming `wallets`), `CREATE TABLE wallets (...)`, the copy, `DROP TABLE wallets_previous`, `PRAGMA legacy_alter_table = OFF`. The receipt says which path the test proved.

- [ ] **Step 1: Write the failing tests** in `currency-migration.test.ts`. Each starts inside `runInDurableObject` with `migrateBefore(state, '_currencies_trips')`, seeds rows with SQL, then runs `migrate(drizzle(state.storage), VAULT_MIGRATIONS)`:
  - `the rebuilt wallets keep every row and every reference to them`: before, two wallets (one archived), an expense, a transfer between them, an `import_selection_rows` row naming one (1B) and a `transaction_attachments` link on the expense; after, every wallet column equals its value before, `type`, `material` and `bun_face` are null, the link and the selection row are there, no transaction or selection row names a missing wallet (a join, not a pragma), and an expense naming an unknown wallet throws `/FOREIGN KEY/`.
  - `every table that references wallets keeps its rows`: for each table whose `PRAGMA foreign_key_list` names `wallets` (P4's `slip_accounts` included once merged), the row count and the referencing column's values are equal before and after.
  - `older records gain THB money fields`: `currency` `THB`, `rate` `1`, `rate_source` `reference`, `rate_date` null, `home_amount_minor` equal to `amount_minor` read as text, `trip_id` null.
  - `a wallet takes any ISO-shaped currency and never changes it`: inserting `JPY` succeeds; `jpy` and `JPYX` throw; `UPDATE wallets SET currency = 'USD'` throws `/wallet currency is immutable/`.
  - `the new columns keep their rules`: `to_amount_minor` on an expense, `wallet_amount_minor` on a transfer, `home_amount_minor = -1`, `rate_source = 'market'`, a trip ending before it starts and a pack key on a built-in category each throw `/CHECK/`.
  - `the triggers and views naming wallets are the same after the rebuild` (the step 1 query's rows before and after are equal).
  - `vault-schema.test.ts`: the pinned table list gains `settings` and `trips`, the Drizzle drift test covers the new columns, and a new vault has run each migration once.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/currency-migration.test.ts test/workers/vault-schema.test.ts`. Record the counts.
- [ ] **Step 3: Write the migration, the journal entry and the schema.** Run the first case alone first: it proves which path workerd allows.
- [ ] **Step 4: Run them and see them pass,** then the whole Workers suite (every 1A and 1B suite unchanged, the THB golden diary included).
- [ ] **Step 5: Mutation check.** Leave out the copy of `archived`: the first case fails. Drop the immutability trigger: its case fails. Skip the home-amount backfill: the older-records case fails.
- [ ] **Step 6: Gate, receipt, commit.** The receipt records the path (deferred keys or legacy rename) and the trigger list it found. `git commit -m "Rebuild the vault's wallets for any currency and add currency columns, trips and settings"`

---

### Task P5-T5: Wallets and categories with their currency and looks in the vault, and pack keys in the server's events

**Starts after:** P5-T2, P5-T4, 1A-T9, 1D-T11, P4-T6

**Files:**
- Create: `apps/edge/src/vault/domain/settings.ts` (`homeCurrency`; P5-T13 adds the rest), `apps/edge/test/support/phase5-fields.ts` (`dropPhase5Fields`)
- Modify: `src/vault/domain/wallets.ts` (the `'THB'` literal goes; currency and look fields), `src/vault/domain/categories.ts`, `src/analytics/server-analytics.ts` (1D-T3: `record_saved.category_key` also takes `PACK_KEYS`), `src/vault/analytics.ts` (1D-T11's `committedEvents`), `src/vault/slips/batch.ts` (P4-T6's `writeSlip`: the catalog step), `test/workers/wallets.test.ts` and `categories.test.ts` (the exact DTOs gain the new keys; 1A's "`currency` is refused" case becomes accepted, C2), `test/vault-parity.db.test.ts` (both runs' bodies pass through `dropPhase5Fields` before the comparison; default pending owner Q8)
- Test: `test/workers/wallets-currency.test.ts`, `test/workers/server-events.test.ts` and `slips-route.test.ts` (one case each)

**Interfaces:**
- Consumes: `isCurrencyCode`, `WALLET_KINDS`, `WALLET_MATERIALS`, `BUN_FACES`, `CATEGORY_PICKER_GLYPHS`, `PACK_KEYS` (P5-T1, P5-T2); the migrated columns (P5-T4); P4-T6's `writeSlip` and its test support.
- Produces: `homeCurrency(c: VaultContext): CurrencyCode` (the `settings` row's, else `DEFAULT_HOME_CURRENCY`); `dropPhase5Fields(body: unknown): unknown` (removes a wallet's `type`, `material` and `bun_face` (an object with `opening_minor`), and at any depth `icon`, `pack_key`, every `RECORD_MONEY_KEYS` key (`currency` included: NestJS answers THB, so nothing compared is lost), `wallet_amount_minor`, `to_amount_minor` and `home_currency`). Wallet and category DTOs are always the new shape.
- Rules: `POST /v1/wallets` takes `currency` (default `homeCurrency(c)`), `type`, `material`, `bun_face`; `PATCH` takes the three looks (a value or null) and never `currency` (UNKNOWN_FIELD; default pending owner Q7). Categories take `icon` on create and edit, and `pack_key` on create, or on an edit while it is null (else 422 `errors.pack_key_fixed` on `pack_key`); a built-in takes neither pack key (422 on `pack_key`). The server's `record_saved.category_key` is the category's `builtin_key`, else its `pack_key`, else `custom` (1D's decided Q18). P4-T6's catalog step (P4's S3), with no live built-in of the catalog key, takes the oldest (`created_at`, then `id`) live, unarchived custom category whose `pack_key` it is and whose type is the draft's.

- [ ] **Step 1: Write the failing tests:**
  - `wallets-currency.test.ts`: `a wallet is created in its currency with its look` (`currency: 'JPY'`, `type: 'cash'`, `material: 'sky'`, `bun_face: 'wow'` read back exactly, balance `'0'`); `without a currency a wallet takes the home currency` (THB; `JPY` after a `settings` row naming JPY is written with SQL); `a wallet's currency never changes` (PATCH `{ currency: 'USD' }` is 422 `UNKNOWN_FIELD` on `currency`); `an unknown currency or look is 422 on its field` (`'jpy'`, `type: 'ewallet'`); `a look is set and cleared by an edit, each a new version`; `a category keeps its icon and pack key; a pack key is set once and never on a built-in`.
  - `server-events.test.ts`: `a record in a pack category sends its pack key` (consent yes; a custom category with `pack_key: 'merit'`: `record_saved` carries `category_key: 'merit'`).
  - `slips-route.test.ts`: `a catalog pack key guesses the person's pack category` (a merchant pattern seeded with `seven` and two custom expense categories with `pack_key: 'seven'`: the draft's category is the older).
  - The money parity session runs with `dropPhase5Fields` on both runs (`npm run test:edge:db -- test/vault-parity.db.test.ts`).
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/wallets-currency.test.ts test/workers/wallets.test.ts test/workers/categories.test.ts test/workers/server-events.test.ts test/workers/slips-route.test.ts`. Record the counts.
- [ ] **Step 3: Implement** the fields, `homeCurrency`, the event key and P4-T6's catalog step.
- [ ] **Step 4: Run them and see them pass,** then the parity session (49 steps, no difference once the phase 5 fields are dropped).
- [ ] **Step 5: Mutation check.** Insert `'THB'` again: the JPY case fails. Accept `currency` on PATCH: the immutability case fails. Send `custom` for a pack category: the event case fails. Guess built-ins only: the pack-guess case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Keep each wallet's currency and look and each category's icon and pack key in the vault"`

---

### Task P5-T6: The rate book: fx_rates, rate reads, today's set in KV and GET /v1/rates/today

**Starts after:** P4-T2 (P4:catalog-db), P5-T3, 1B-T3, 1D-T10

**Files:**
- Create: `apps/edge/migrations/catalog/NNNN_fx_rates.sql` (numbered by the integrator after P4's catalog migrations), `apps/edge/src/v1/rates/book.ts`, `src/v1/rates/today-route.ts`, `apps/edge/test/workers/support/fx.ts`
- Modify: `src/v1/protocol.ts` (`FxQuote`, `RateNeed`, `RateBook`; `WorkerRouteId` gains `'rates.today'`), `src/v1/routes.ts` (the route; `VAULT_ADDED_ROUTES`), `src/v1/worker-routes.ts` (`WORKER_HANDLERS['rates.today']`), `test/route-coverage.test.ts`, and `test/workers/catalog.test.ts` if P4-T2's case pins the catalog's table list (`fx_rates` joins it)
- Test: `apps/edge/test/workers/fx-book.test.ts`

**Interfaces:**
- Consumes: `CATALOG_DB`, its migrations folder and test setup (`P4-T2 (P4:catalog-db)`); `RatesTodayDto` (P5-T3); `WORKER_HANDLERS`, `WorkerContext` (1B-T3); `bangkokDate`, `logFailure`.
- Produces:
  ```ts
  // protocol.ts
  export type FxQuote = { perBase: string; day: string }
  export type RateNeed = { dates: readonly string[]; currencies: readonly string[] }
  export type RateBook = { base: CurrencyCode; on: Readonly<Record<string, Readonly<Record<CurrencyCode, FxQuote>>>> }   // asked date, then currency
  // rates/book.ts
  export const RATES_TODAY_KEY = 'fx:today'
  export type TodayRates = RatesTodayDto & { etag: string }
  export function readTodayRates(kv: KVNamespace): Promise<TodayRates | null>          // null when absent or not a RatesTodayDto
  export function buildTodayRates(db: D1Database, asOf: string): Promise<TodayRates | null>   // null with no rows
  export function rateBookFor(env: { CATALOG_DB?: D1Database; CONFIG: KVNamespace }, need: RateNeed, now: Date): Promise<RateBook | null>   // null without the binding
  // test/workers/support/fx.ts
  export function seedFx(rows: readonly { day: string; currency: string; per_base: string }[], options?: { base?: string; complete?: boolean }): Promise<void>   // base 'USD'; complete (default) also sets fx:history_from to the earliest day
  export const FX_GOLDEN_DAYS: readonly { day: string; currency: string; per_base: string }[]   // 2026-11-01 THB 34.755, 11-02 THB 34.62, 11-03 THB 34.68, JPY 150 each day
  ```
- `fx_rates`: `day TEXT` (a real date), `currency TEXT`, `base TEXT` (both the ISO shape, `base <> currency`), `per_base TEXT` (1 to 40 characters), `fetched_at TEXT`, `PRIMARY KEY (currency, day)`, STRICT (X1, default pending owner Q11).
- Rules:
  - A book quote for an asked date and currency is that currency's row with the latest `day` on or before the date; with none, its earliest row (the date is older than the history, §6.10), but only once KV holds `fx:history_from` (P5-T7 sets it when five years are stored; until then the book is null, X12); a currency with no rows is absent from that date. The base needs no quote. Dates and currencies bind as two JSON parameters of one query (R57).
  - When every asked date is Bangkok's today of `now` and KV holds today's set for it, the book comes from KV and D1 is not read.
  - No rows at all, or a failed read (logged `fx_book_failed`), answer null.
  - `buildTodayRates` picks per currency the latest day on or before `asOf`, never a later one. Its ETag is `"` plus the first 16 hex digits of the SHA-256 of the canonical JSON, plus `"`.
  - The route `{ method: 'GET', path: '/v1/rates/today', access: 'bound_session', worker: 'rates.today' }` answers 200 with the `RatesTodayDto` and an `ETag` header; 304 with the `ETag` and no body when `If-None-Match` equals it; 503 `SERVICE_UNAVAILABLE` (retry 300) while KV holds no set. It never calls the vault.

- [ ] **Step 1: Write the failing tests** (typed stubs answering null first):
  - `a record's date takes that day's quote, else the latest earlier day, per currency` (JPY on 11-01 to 11-03, THB on 11-01 and 11-03 only: the book for `2026-11-02` holds JPY of `2026-11-02` and THB of `2026-11-01`).
  - `a date before the history takes each currency's earliest quote` (asked `2019-01-01`: each `day` is the first seeded day); `before five years are stored, such a date gets no book` (`complete: false`).
  - `a currency the feed never had is missing from the date`; `without CATALOG_DB there is no book`.
  - `a book for 1,001 dates and every currency is one query` (R57: 1,001 dates answer without a too-many-variables error).
  - `no rows is no book, and a failed read is no book with one fx_book_failed line`.
  - `today's book is read from KV and D1 is never touched` (`CATALOG_DB` replaced by one whose `prepare` throws).
  - `today's set takes each currency's latest day on or before the day, never a later one` (a row for `2026-11-04` is ignored on `2026-11-03`).
  - `GET /v1/rates/today answers today's set with its ETag, 304 for that ETag, 503 while none is stored`.
  - `route-coverage.test.ts`: the route is an added Worker route with its handler.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/fx-book.test.ts` and `npm run test:edge -- test/route-coverage.test.ts`. Record the counts.
- [ ] **Step 3: Implement** the migration, `book.ts`, the route and the test helpers.
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.** Take the earliest quote first: the latest-earlier case fails. Bind one `?` per date: the 1,001 case fails. Read D1 for today: the KV case fails. Answer 200 when the ETags match: the 304 case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Store daily reference rates in the catalog and read rate books and today's set for the vault and the app"`

---

### Task P5-T7: The daily feed: the provider interface, the fixture feed and the Cron

**Starts after:** P5-T6, 1B-T4, 1B-T13

**Files:**
- Create: `apps/edge/src/background/fx-feed.ts`, `apps/edge/src/background/fx-cron.ts`
- Modify: `src/vault-worker.ts` (the default export gains `scheduled`), `src/server.ts` (`scheduled: vaultWorker.scheduled`), `wrangler.jsonc` (`"triggers": { "crons": ["0 23 * * *"] }` and the var `"FX_FEED": "fixture"`; once P6C-T1 has landed, the same trigger in `env.staging` and `env.production`, with `FX_FEED` `"fixture"` in staging and `""` in production, A20, whichever lands second reconciling), `src/v1/env.ts` (`FX_FEED?: string`), `test/workers/support/fx.ts` (re-exports `FX_GOLDEN_DAYS`, now in `fx-feed.ts`), `test/c1-shape.test.ts`, `apps/edge/README.md` (the Cron; five runs fill the history; the fixture runs only locally, in tests and on staging; a local run is `curl "http://localhost:8092/cdn-cgi/local/scheduled?cron=0+23+*+*+*"`)
- Test: `apps/edge/test/workers/fx-cron.test.ts`

**Interfaces:**
- Consumes: `buildTodayRates`, `RATES_TODAY_KEY` (P5-T6); `canonicalQuote`, `isCurrencyCode`, `addDays` (P5-T1); `readGates` (1B-T4); `bangkokDate`, `logFailure`.
- Produces:
  ```ts
  // fx-feed.ts
  export type FxDay = { day: string; rates: Readonly<Record<string, string>> }   // units per one unit of the base; the base never appears
  export interface FxFeed { readonly name: string; readonly base: string; latest(): Promise<FxDay>; range(from: string, through: string): Promise<FxDay[]> }   // range: every published day, oldest first
  export const FIXTURE_FIRST_DAY = '2020-01-01'
  export const FIXTURE_PER_BASE: Readonly<Record<string, string>>   // USD base: THB '32', JPY '149.0656', KRW '1380', CNY '7.1', HKD '7.8', TWD '32.5', SGD '1.35', MYR '4.7', VND '24500', LAK '21000', EUR '0.92', GBP '0.79', AUD '1.52'
  export const FX_GOLDEN_DAYS: readonly { day: string; currency: string; per_base: string }[]   // moved here from P5-T6's test support, unchanged
  export function fixtureFeed(today: string): FxFeed   // one day per date from FIXTURE_FIRST_DAY to today; FX_GOLDEN_DAYS' values on 2026-11-01 to 11-03
  export function feedFor(env: { FX_FEED?: string; JOTBUN_ENV?: string }, now: Date): FxFeed | null   // 'fixture' gives fixtureFeed(bangkokDate(now)) only where JOTBUN_ENV is local, test or staging (X11); P5-T15 adds the D31 provider; else null
  // fx-cron.ts
  export const FX_CRON = '0 23 * * *'                 // 06:00 in Bangkok (Cron Triggers run in UTC)
  export const FX_HISTORY_YEARS = 5
  export const FX_BACKFILL_DAYS_PER_RUN = 366
  export const FX_INSERT_DAYS = 30
  export const FX_HISTORY_FROM_KEY = 'fx:history_from'
  export type RatesCronOutcome = { feed: 'ok' | 'failed' | 'unconfigured' | 'paused' | 'base_changed'; stored: number; backfilled: number; asOf: string }
  export function runRatesCron(env: { CATALOG_DB?: D1Database; CONFIG: KVNamespace }, deps: { feed: FxFeed | null; now: Date }): Promise<RatesCronOutcome>   // unconfigured without the binding
  ```
- Rules, in order (X12): `asOf = bangkokDate(now)`. While `readGates(env.CONFIG)` holds `jobs` paused (R31) the feed is not read (`paused`); with no feed, one `fx_feed_unconfigured` line. With a feed: `latest()`; a base other than the stored rows' writes nothing (`base_changed`); each quote passes `canonicalQuote` and `isCurrencyCode` or is skipped; rows go in with `INSERT OR IGNORE` and `fetched_at`. Then, when the earliest stored day E is after the target (the same month and day `FX_HISTORY_YEARS` years before `asOf`; 29 February becomes 28 February), `range(max(target, addDays(E, -FX_BACKFILL_DAYS_PER_RUN)), addDays(E, -1))` goes in through one `CATALOG_DB.batch` of statements of at most `FX_INSERT_DAYS` days, each binding its rows as one JSON parameter, so a failed run stores none of its backfill; once E reaches the target, KV's `FX_HISTORY_FROM_KEY` is set to it. A feed error skips the writes. Each line goes through `logFailure` with a named error (`fx_base_changed`, `fx_quote_skipped`, `fx_feed_failed`), never a value or a count. Whatever happened, today's set is rebuilt from D1 and written to KV when it changed, so a failed or paused day keeps the last day's rates for today (§6.12).
- `scheduled(controller, env, ctx)` runs `ctx.waitUntil(runRatesCron(env, { feed: feedFor(env, now), now }))` with `now = new Date(controller.scheduledTime)`.

- [ ] **Step 1: Write the failing tests** (`runRatesCron` stubbed to answer `unconfigured` first):
  - `the first run stores today's quotes and the 366 days before, and KV holds today's set` (fixture; `now` 2026-11-02T23:00:00Z, so `asOf` is `2026-11-03`: 13 quotes for `2026-11-03`, 13 × 366 older rows, KV's set has `as_of: '2026-11-03'`, THB `34.68` and JPY `150`).
  - `five runs on five days fill five years, then a run adds one day` (runs on `2026-11-03` to `2026-11-07`: the earliest stored day is `2025-11-02`, `2024-11-01`, `2023-11-01`, `2022-10-31`, then `2021-11-07`; `fx:history_from` is unset until the fifth run, then `2021-11-07`; the run on `2026-11-08` backfills nothing and adds 13 rows).
  - `a feed failure keeps the last day's rates for today` (a feed whose `latest()` throws on `2026-11-04`: outcome `failed`, no new row, KV's `as_of` is `2026-11-04` with the `2026-11-03` quotes, one log line naming only `fx_feed_failed`).
  - `a failed backfill stores none of its days` (a `CATALOG_DB` whose `batch` throws: no backfilled day is stored, and the next run backfills the same days).
  - `while jobs is paused the feed is not read, and today's set is still rebuilt`.
  - `the fixture never runs in production` (`feedFor({ FX_FEED: 'fixture', JOTBUN_ENV: 'production' }, now)` is null; the Cron answers `unconfigured` with one `fx_feed_unconfigured` line).
  - `a feed that changes its base writes nothing` (`base_changed`).
  - `a stored day's rate is never rewritten` (a later answer for `2026-11-03` with THB `35` leaves `34.68`).
  - `quotes outside the ISO table or not positive are skipped`.
  - `the scheduled handler runs the Cron` (`createScheduledController({ scheduledTime: Date.parse('2026-11-02T23:00:00Z'), cron: FX_CRON })`, `createExecutionContext()`, `waitOnExecutionContext(ctx)`: rows exist).
  - `c1-shape.test.ts`: `triggers.crons` equals `['0 23 * * *']`, in each environment block too once P6C-T1 has added them, and `src/server.ts` matches `/scheduled: vaultWorker\.scheduled/`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/fx-cron.test.ts` and `npm run test:edge -- test/c1-shape.test.ts`. Record the counts.
- [ ] **Step 3: Implement** the feed, the Cron, the entry points and the config.
- [ ] **Step 4: Run them and see them pass,** then `npm run build:edge` (the scheduled export bundles).
- [ ] **Step 5: Mutation check.** Use `INSERT OR REPLACE`: the never-rewritten case fails. Skip the KV rebuild after a failure: the failure case fails. Give the fixture to any `JOTBUN_ENV`: the production case fails. Insert the backfill block by block outside the batch: the failed-backfill case fails. Drop `scheduled` from `src/server.ts`: the shape test fails.
- [ ] **Step 6: Gate, receipt, commit.** Deployed Cron runs are SKIPPED (no cloud). `git commit -m "Fill the catalog's rates from a daily Cron behind a feed interface, with a fixture feed and a five-year backfill"`

---

### Task P5-T8: The rate resolver: rates the vault asks for, passed in on the call

**Starts after:** P5-T1, P5-T6, 1B-T3, 1D-T11

**Files:**
- Create: `apps/edge/src/vault/rates.ts`, `apps/edge/src/v1/rates/with-rates.ts`
- Modify: `src/v1/protocol.ts` (`VaultCall.rates?: RateBook`; the failure `VaultReply` gains `ratesFor?: RateNeed`), `src/vault/replies.ts` (`toProblemReply` turns `RatesNeeded` into that reply, never logged as a failure), `src/v1/handler.ts` (its vault call goes through `withRates`; `ratesFor` never reaches a response), `src/v1/worker-routes.ts` (`vaultSession(...).call` goes through `withRates`)
- Test: `apps/edge/test/vault-rates.test.ts` (Node), `apps/edge/test/workers/rates-resolve.test.ts`

**Interfaces:**
- Consumes: `crossRate` (P5-T1); `RateBook`, `RateNeed`, `rateBookFor` (P5-T6); `callWithAnalytics` (1D-T11); `VaultCall.charge` (1B-T3).
- Produces:
  ```ts
  // vault/rates.ts
  export class RatesNeeded extends Error { constructor(readonly need: RateNeed) }
  export type ReferenceRate = { rate: string; rateDate: string | null }
  export function requireRates(book: RateBook | undefined, need: RateNeed): void   // throws RatesNeeded(need) unless the book holds every asked date
  export function referenceRate(book: RateBook | undefined, date: string, from: CurrencyCode, to: CurrencyCode): ReferenceRate
  // v1/rates/with-rates.ts
  export function withRates<T extends { reply: VaultReply }>(env: { CATALOG_DB?: D1Database; CONFIG: KVNamespace }, attempt: (rates?: RateBook) => Promise<T>, now: Date): Promise<T>
  ```
- Rules (X2): `referenceRate` answers `{ rate: '1', rateDate: null }` when `from === to`; throws `RatesNeeded` when the book lacks the date; throws `stateProblem('errors.rate_unavailable', 'currency')` (422) when the date is there but a currency other than the base is not; otherwise `crossRate(perBase(to), perBase(from))`, the base's `perBase` being `'1'`, and `rateDate` the earlier of the two quote days (X10, default pending owner Q4). `withRates` runs `attempt()`; when its reply carries `ratesFor`, it reads `rateBookFor(env, ratesFor, now)` and, with a book, runs `attempt(book)` once more; the handler's attempt sends `charge: 'step'` on that second call. A null book, or `ratesFor` again, gives back that reply with `ratesFor` removed: 503 `SERVICE_UNAVAILABLE`, retry 1 (60 with no book).

- [ ] **Step 1: Write the failing tests:**
  - `vault-rates.test.ts`: `one currency is rate 1 with no date`; `a cross rate comes from the book, with its day` (USD base, THB `34.68` and JPY `150` on `2026-11-03`: `{ rate: '0.2312', rateDate: '2026-11-03' }`); `quote days differ: the earlier names the rate` (THB from `11-03`, JPY from `11-02`: `rateDate` `2026-11-02`); `the base needs no quote` (USD to THB is `34.68`); `a missing date asks for rates; a missing currency is 422 rate_unavailable on currency`.
  - `rates-resolve.test.ts`, with a step id added for the test and removed afterwards (`'test.rate'` in `VAULT_STEP_ROUTES` and a handler that inserts a `schedule` row, then calls `referenceRate(call.rates, '2026-11-03', 'JPY', 'THB')` and answers it): `a call needing a rate it was not given writes nothing and names what it needs` (the reply is 503 with `ratesFor: { dates: ['2026-11-03'], currencies: ['JPY', 'THB'] }`, no `schedule` row); `the Worker reads the named rates and calls once more as a step` (through `vaultSession(...).call`: `{ rate: '0.2312' }`, one `schedule` row, the second call's `charge` is `'step'`); `asking again, or no rates at all, is a plain 503 to the phone` (no `ratesFor` key in the JSON; retry 60 with an empty catalog).
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge -- test/vault-rates.test.ts` and `npm run test:edge:workers -- test/workers/rates-resolve.test.ts`. Record the counts.
- [ ] **Step 3: Implement** `rates.ts`, `withRates`, the reply and the two call sites.
- [ ] **Step 4: Run them and see them pass,** with 1D-T11's `server-events.test.ts` unchanged (an asked-again call sends no event).
- [ ] **Step 5: Mutation check.** Take the later quote day: the days case fails. Charge the second call: the step case fails. Let `ratesFor` through to the response: the plain-503 case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Let the vault ask for the reference rates a command needs, read once by the Worker and passed in on the call"`

---

### Task P5-T9: Trips in the vault

**Starts after:** P5-T3, P5-T4, 1A-T8b, 1D-T10

**Files:**
- Create: `apps/edge/src/vault/domain/trips.ts`
- Modify: `src/vault/routes.ts`, `src/v1/routes.ts` (four routes; `VAULT_ADDED_ROUTES`), `src/v1/protocol.ts` (`VaultRouteId` gains `'trips.list' | 'trips.create' | 'trips.update' | 'trips.delete'`), `src/vault/commands/registry.ts` (entity `trip` validated by `isTripSnapshot`; `trip.create` created, `trip.update` updated, `trip.delete` deleted; schema 1, policy `current`, after every earlier kind), `src/vault/retention.ts` (1A-T8b's purge also purges trips deleted 30 days ago), `test/vault-route-coverage.test.ts` (`route-coverage.test.ts` after 1B-T13)
- Test: `apps/edge/test/workers/trips.test.ts`

**Interfaces:**
- Consumes: `TripDto`, `isTripSnapshot`, `TRIP_MAX_DAYS` (P5-T3); the `trips` table (P5-T4); `runCommand`, `commandInput`, `expectVersion`, `requireLiveEntity` (1A-T3); 1A-T8b's `nextDue`, `runDue` and purge.
- Produces: `listTrips(c): TripDto[]` (live, latest `starts_on` first); `createTrip`, `updateTrip`, `deleteTrip(c, call): CommandAck`; `assertTripTag(c: VaultContext, tripId: string | null, date: string): void` (null passes; else `stateProblem('errors.trip_not_found', 'trip_id')` unless a live trip with that id exists, and `stateProblem('errors.trip_dates', 'trip_id')` unless `starts_on <= date <= ends_on`).
- Routes: `GET /v1/trips` (`bound_session`), `POST /v1/trips` (`current_policy`, `writes`, 201), `PATCH /v1/trips/:id` and `DELETE /v1/trips/:id` (`current_policy`, `writes`, 200, `If-Match` required).
- Rules (default pending owner Q6; X4): a create takes exactly `CreateTripRequest`'s fields (If-Match forbidden); the name passes `normalizeName`, the dates are real, `ends_on >= starts_on`, at most 366 days, the budget null or 1 to the cap in the trip's currency; no two live trips share a day (`stateProblem('errors.trip_overlap', 'starts_on')`). An edit takes name, dates and budget, never the currency (UNKNOWN_FIELD), and is refused when its new dates share a day with another live trip (`errors.trip_overlap`, on `ends_on` when only it moves, else on `starts_on`) or a live record tagged with the trip would fall outside them (`stateProblem('errors.trip_records_outside', 'starts_on')` or `'ends_on'`). Ending a trip is an edit of `ends_on`. A delete sets `deleted_at` and writes a `deleted` change; records keep their tag; the purge removes the row 30 days later with a `purged` change.

- [ ] **Step 1: Write the failing tests:** `a trip is created, listed and synced` (the board's trip: `GET /v1/trips` lists it, `GET /v1/sync/changes` carries a `trip` change); `trips never overlap` (a second trip on `2026-11-08` to `11-10` is 422 `trip_overlap` on `starts_on`, one from `11-09` is created); `an edit cannot make two trips overlap` (beside a trip from `2026-11-09`, moving the board's `ends_on` to `2026-11-09` is 422 `trip_overlap` on `ends_on`); `a trip lasts at most 366 days and ends on or after it starts`; `an edit cannot leave a tagged record outside the trip` (a tagged record on `2026-11-03` written with SQL; `starts_on: '2026-11-04'` is 422 `trip_records_outside`); `a trip's currency cannot be edited`; `deleting is soft and the alarm purges it 30 days later` (the change is `deleted`, the record keeps its `trip_id`; 29 days on the head is still `deleted`; 31 days on, `runDurableObjectAlarm` leaves it `purged`); `a resent create replays its acknowledgement`; `an erased vault keeps no trip or settings row` (1B-T2's `erase()`); in the coverage test the four routes are added routes.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/trips.test.ts` and `npm run test:edge -- test/vault-route-coverage.test.ts` (or `route-coverage.test.ts`). Record the counts.
- [ ] **Step 3: Implement** the domain, the routes, the registry entries and the purge.
- [ ] **Step 4: Run them and see them pass,** with 1A-T8b's `retention.test.ts` unchanged.
- [ ] **Step 5: Mutation check.** Compare dates with `<` for overlaps: the touching-day case fails. Check overlaps on a create only: the overlapping-edit case fails. Skip the tagged-record check: the outside case fails. Purge at 29 days: the purge case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add trips to the vault: no overlaps, at most a year, soft deletes purged after 30 days"`

---

### Task P5-T10: Records in any currency: create, edit and balances

**Starts after:** P5-T2, P5-T5, P5-T8, P5-T9, 1A-T5, 1B-T10, P4-T7 (P4:slip-drafts), P4-T11

**Files:**
- Modify: `apps/edge/src/vault/domain/transactions.ts` (the insert shared by `createTransaction` and P4's `createTransactionRow`), `src/vault/files/confirmation.ts` (P4-T11's `createTransactionRow` call in `confirmImportBatch` gains `currency: 'THB'` and the batch's one `requireRates`), `src/vault/slips/drafts.ts` (P4-T7), `src/vault/slips/inbox.ts` (P4-T3's `slipDuplicateOf` gains `AND currency = 'THB'`), `src/vault/reads/balances.ts`, `test/workers/transactions.test.ts` (the exact DTOs gain the money keys; 1A-T5's date case stays, A7)
- Test: `apps/edge/test/workers/transactions-currency.test.ts` (with `seedFx(FX_GOLDEN_DAYS)` and the vault clock at `2026-11-03T08:00:00Z` unless a case says otherwise)

**Interfaces:**
- Consumes: `homeCurrency` (P5-T5); `RatesNeeded`, `requireRates`, `referenceRate` (P5-T8); `assertTripTag` (P5-T9); `convertMinor`, `rateFromAmounts`, `parseRate` (P5-T1); `createTransactionRow`, `seedSlipDraft` (`P4-T7 (P4:slip-drafts)`); `confirmImportBatch`, `seedPreview` (1B-T10).
- Produces: `TransactionRow` and `toDto` with every money key (a row whose `home_amount_minor` is null reads its `amount_minor`); `walletBalances` moving an entry's wallet by `coalesce(wallet_amount_minor, amount_minor)` and a transfer's destination by `coalesce(to_amount_minor, amount_minor)`. Every row a create, a slip confirmation or a statement confirmation writes passes the rules below; slip and statement rows pass `currency: 'THB'` (D24), and a slip draft's possible duplicate is a live THB record only.
- Rules for a create, in order:
  1. `currency`: an entry's defaults to its wallet's; a transfer's is its source wallet's, and a different one is `stateProblem('errors.currency_not_wallet', 'currency')`.
  2. Inside the mutation (after `runCommand`'s receipt lookup, so a replay answers first), every rate the record needs (record to home, record to the entry's wallet), or a batch command's records need, is collected and checked with one `requireRates` before any is resolved, so one retry serves them all.
  3. `home_currency` comes with `own` and `exchange` only (422 on `home_currency` otherwise). When it is not `homeCurrency(c)` (the home changed while the record was queued), the record is saved as `reference` (C8: edited rates do not carry over), and its sent charged amount, or its amount at the sent rate, becomes `wallet_amount_minor` when its wallet is in that sent currency.
  4. By `rate_source` (default `reference`). `reference`: no `rate` or `home_amount_minor` (422 on that field); the home currency's own records get `'1'` and a null `rate_date`; others `referenceRate(call.rates, occurred_on, currency, home)`. `own` (currency other than home, else 422 on `rate_source`): exactly one of `home_amount_minor` (kept as sent, at least 1, else 422 on it; `rate` is `rateFromAmounts`) or `rate` (`home_amount_minor` is `convertMinor`) (X9; default pending owner Q11). `exchange` (currency other than home): `rate` required, `home_amount_minor` is `convertMinor` (X16).
  5. A transfer between wallets of two currencies needs `to_amount_minor` (`stateProblem('errors.exchange_needs_both', 'to_amount_minor')`), and one within a currency refuses it. When the destination currency is home, the home amount is `to_amount_minor`, the rate `rateFromAmounts(amount, currency, to_amount, home)` and the source `exchange`; rate fields in the request are then refused (X15).
  6. Unless rule 3 set it, an entry whose wallet's currency differs from the record's freezes `wallet_amount_minor` (B15, default pending owner Q2): the home amount when the wallet is in the home currency, else `convertMinor` at `referenceRate(call.rates, occurred_on, currency, walletCurrency)`.
  7. A home or wallet amount above 99,999,999,999 is `MINOR_OUT_OF_RANGE` on `amount_minor`; 0 is kept (default pending owner Q10).
  8. `assertTripTag(c, trip_id ?? null, occurred_on)`; the date passes 1A-T5's `validateOccurredOn` against `bangkokDate(c.now)`, never after Bangkok's today (A7, default pending owner Q9).
  - The command's digested payload is the request's fields only, never a resolved rate.
- Rules for an edit: a change of `currency`, `rate_source`, `rate`, `home_amount_minor`, or of `occurred_on` on a reference rate, resolves the rate again as a create does (rule 3 included); a change of `amount_minor` alone keeps `rate` and `rate_date` and recomputes the home and wallet amounts from them; a change of wallet recomputes `wallet_amount_minor`; `to_amount_minor` may change on an exchange; the tag is checked only when `trip_id` or `occurred_on` changes, and a stored tag naming a deleted trip passes as none (X4).

- [ ] **Step 1: Write the failing tests:**
  - `a yen expense on a baht card freezes the day's reference rate` (¥4,620 from a THB credit card: `rate '0.2312'`, `rate_date '2026-11-03'`, `home_amount_minor '106814'`, `wallet_amount_minor '106814'`; the card's balance `'-106814'`).
  - `a record older than the history takes the earliest rate and says so` (rows from `2021-11-01`; a record on `2021-06-01`: `rate_date '2021-11-01'`).
  - `an own rate keeps the charged amount` (`home_amount_minor: '107550'` with `home_currency: 'THB'`: `rate '0.232792207792'`, `rate_source 'own'`, `rate_date` null); `own takes exactly one of a rate and a charged amount of at least 1, and needs home_currency; a reference rate takes none of them`.
  - `a yen cash wallet's record takes the exchange rate the app sends` (`rate_source: 'exchange'`, `rate: '0.232558139535'`, `home_currency: 'THB'`: home `'107442'`, `wallet_amount_minor` null, the yen wallet `'-4620'`).
  - `cash exchange is one transfer with both amounts` (฿10,000 from the bank to the yen cash wallet for ¥43,000: balances `'1486000'` and `'43000'`, home `'1000000'`, rate `'1'`); `an exchange into the home currency takes what was received` (¥10,000 for ฿2,320.00: home `'232000'`, rate `'0.232'`, source `exchange`); `a transfer between currencies needs both amounts, and one within a currency takes no second`.
  - `a third-currency expense moves its wallet by its converted amount` (¥4,620 on a USD wallet: `wallet_amount_minor '3080'`, rate USD per JPY `0.00666666666667`); `one request needing two rates asks once` (that create's first reply names `JPY`, `THB` and `USD`).
  - `a trip tag needs a live trip whose dates hold the record`; `a record tagged with a deleted trip can still move a day`.
  - `editing the amount keeps the rate; editing the date takes that day's rate` (5,000 yen: home `'115600'`; then `occurred_on: '2026-11-02'`: rate `'0.2308'`, home `'115400'`).
  - `₫1 in a baht home is kept at 0; a home amount past the cap is refused on amount_minor`.
  - `a resent create replays even after that day's stored rate changed`.
  - `a slip draft confirmed in a JPY home freezes its home amount at its date's rate` (฿500.00 on `2026-11-03`: `currency 'THB'`, `rate '4.32525951557'`, `home_amount_minor '2163'`); `a statement row confirmed into a yen wallet stays THB and moves the wallet by its converted amount` (฿500.00: `wallet_amount_minor '2163'`, the yen wallet `'-2163'`); `a ¥50,000 record is not a ฿500.00 slip's duplicate` (`GET /v1/drafts` names a ฿500.00 record of that day, never the yen one).
  - `a row without a home amount, written by an older release, reads its amount as its home amount`.
  - `golden-diary.test.ts` (THB) passes unchanged.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/transactions-currency.test.ts test/workers/transactions.test.ts test/workers/golden-diary.test.ts`. Record the counts.
- [ ] **Step 3: Implement** the create and edit rules and the balances.
- [ ] **Step 4: Run them and see them pass,** then the money parity session (with P5-T5's normaliser).
- [ ] **Step 5: Mutation check.** Convert the wallet amount at the home rate for a USD wallet: the third-currency case fails. Recompute an amount-only edit at today's rate: the edit case fails. Put the resolved rate into the digested payload: the replay case fails. Move an exchange's destination by `amount_minor`: the exchange case fails. Give a statement row its wallet's currency: the statement case reads ¥50,000 and fails. Drop the currency from `slipDuplicateOf`: the duplicate case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Keep each record's currency, rate and frozen home amount in the vault, with wallet balances in each wallet's currency"`

---

### Task P5-T11: History, summary and budgets on home amounts, with the history parser and cursor forked

**Starts after:** P5-T10, 1A-T7

**Files:**
- Create: `apps/edge/src/vault/reads/history-query.ts` (fork of `@api/history/history-query`'s `single`, `parseLimit` and `parseHistoryRequest`), `apps/edge/src/vault/reads/history-cursor.ts` (fork of `@api/history/cursor`'s `encodeCursor` and `decodeCursor`), `apps/edge/test/workers/support/golden-trip.ts` (`seedGoldenTrip`, below)
- Modify: `src/vault/reads/history.ts` (imports the forks; the new filters; totals on home amounts), `src/vault/reads/summary.ts`
- Test: `apps/edge/test/history-query.test.ts` (Node), `apps/edge/test/workers/history-currency.test.ts`

**Interfaces:**
- Consumes: P5-T10's records and balance moves; `@api/history/history-query` and `@api/history/cursor`; `startV1`, `member` (1A-T2); `seedFx`, `FX_GOLDEN_DAYS` (P5-T6).
- Produces: `parseHistoryRequest(query): { filter: HistoryFilter; cursor?: string; limit: number }` with `trip_id` (a UUID), `currency` (`isCurrencyCode`) and `wallet_ids` (1 to `HISTORY_MAX_WALLETS` comma-separated UUIDs, never with `wallet_id`, each 422 on its own field); `encodeCursor(filter, position: CursorPosition)` and `decodeCursor(filter, cursor)` (the API's `CursorPosition`, `{ occurredOn, id, revision }`) whose filter key appends `[trip_id, currency, wallet_ids]` only when one is set, so a filter without them keeps today's key and an older cursor continues.
- `seedGoldenTrip(client, user): Promise<GoldenTrip>` (`GoldenTrip = { tripId: string; bank: string; card: string; yenCash: string; exchangeId: string; recordIds: readonly string[] }`; its layout is default pending owner Q14) writes, through the routes with the vault clock on each day and `FX_GOLDEN_DAYS` seeded: wallets บัญชีหลัก (bank, THB, opening `2486000`), บัตรเครดิต (credit card, THB) and เงินสดเยน (cash, JPY); the trip ทริปญี่ปุ่น (JPY, `2026-11-01` to `2026-11-08`, budget `120000`); November's budget `1800000`; on the card, tagged with the trip: `2026-11-01` ¥2,580 รถไฟ Skyliner, ¥5,500, ¥5,520 and ¥638; `2026-11-02` ¥3,400 ซูชิ, ¥7,980 ตั๋วรถไฟ JR, ¥3,000, ¥3,220 and ¥182; `2026-11-03` ¥4,620 ร้านยา, ¥1,200 ราเมน and ¥360 รถไฟใต้ดิน; untagged, ฿312 Grab ส่งแม่ไปหาหมอ on the card on `2026-11-03`; tagged, the exchange of ฿10,000 from the bank for ¥43,000 into the yen cash on `2026-11-03`. It answers the ids. Days 1 and 2 are the boards' totals split into rows (`ctx/map-p5-travel.md` §5): their stored rows add to `329894` and `410409`.
- Rules: income, expense and balance add `coalesce(home_amount_minor, amount_minor)`; `by_wallet` stays in each wallet's own currency (P5-T10's moves); totals carry `currency` (the home currency); the filters match a record's `trip_id`, its `currency`, and any of `wallet_ids` on either side of a transfer; the month summary's categories and budget usage add home amounts, trip spending included (D40).

- [ ] **Step 1: Write the failing tests:**
  - `history-query.test.ts`: `the fork reads today's filters exactly as the API does` (each case of `@api/history/history-query` run through both, equal); `trip, currency and several wallets are read and checked` (`wallet_ids` of 21 ids, `wallet_id` with `wallet_ids`, `currency=jpy` are each 422 on that field); `a cursor made before the fork continues its listing` (the fork's `encodeCursor` equals `@api/history/cursor`'s for a filter without the new fields, and decodes it); `a cursor belongs to its trip filter` (one encoded with `trip_id` is 422 on `cursor` under a filter without it).
  - `history-currency.test.ts` (on `seedGoldenTrip`): `a day adds its stored home amounts: day 3 is 142,881, never 142,882` (`from=through=2026-11-03&currency=JPY`: `expense_minor '142881'`; without the currency filter `'174081'`, Grab's ฿312 included); `totals name the home currency, and by_wallet stays in each wallet's currency` (`currency: 'THB'`; the yen wallet's entry is in yen); `the trip filter scopes items and totals` (`trip_id`: count 13, the exchange included, `expense_minor '883184'`); `several wallets scope items and totals, and the cursor continues` (`wallet_ids` of the bank and the card: 14 items over three pages of 5, the exchange included; `expense_minor '914384'`); `the month's budget counts trip spending in home amounts` (D40: November's `spent_minor '914384'`, `remaining_minor '885616'` against ฿18,000).
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge -- test/history-query.test.ts` and `npm run test:edge:workers -- test/workers/history-currency.test.ts`. Record the counts.
- [ ] **Step 3: Fork the parser and cursor, then change the reads.**
- [ ] **Step 4: Run them and see them pass,** with 1A-T7's `history.test.ts` and `summary.test.ts` unchanged apart from `currency` in their expected totals.
- [ ] **Step 5: Mutation check.** Sum `amount_minor`: the day 3 case fails. Leave the new fields out of the cursor key: `a cursor belongs to its trip filter` fails. Match `wallet_ids` on entries only: the several-wallets case fails on the exchange.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Total history, summaries and budgets on frozen home amounts, filtered by trip, currency and several wallets"`

---

### Task P5-T12: The trip summary

**Starts after:** P5-T11, 1B-T13

**Files:**
- Create: `apps/edge/src/vault/reads/trip-summary.ts`
- Modify: `src/vault/routes.ts`, `src/v1/routes.ts` (`GET /v1/trips/:id/summary`, `bound_session`; `VAULT_ADDED_ROUTES`), `src/v1/protocol.ts` (`'trips.summary'`), `test/route-coverage.test.ts`
- Test: `apps/edge/test/workers/trip-summary.test.ts`

**Interfaces:**
- Consumes: `TripSummaryDto`, `TripMoney` (P5-T3); `seedGoldenTrip` (P5-T11).
- Produces: `tripSummary(c: VaultContext, id: string): TripSummaryDto` (404 `NOT_FOUND` for an unknown or deleted trip).
- Rules (X17): over live records tagged with the trip: `count` counts every type; `totals`, `days` (by `occurred_on`, ascending) and `categories` (by `spent_home_minor` descending, then id) add expenses only, as `TripMoney` says; `rates` lists each distinct `(occurred_on, currency, rate, rate_source, rate_date)` of a tagged record in a currency other than home, by date then currency (tc-trip-summary's "เรทที่ใช้").

- [ ] **Step 1: Write the failing tests** on `seedGoldenTrip`: `the golden trip sums its stored rows` (`count` 13; totals `spent_trip_minor '38200'`, `spent_home_minor '883184'`, `other_home_minor '0'`; days `14238`/`329894`, `17782`/`410409`, `6180`/`142881`; the exchange counts and adds nothing); `a baht record tagged with the trip adds to other_home_minor`; `the rates used are each day's` (`2026-11-01` `0.2317`, `11-02` `0.2308`, `11-03` `0.2312`, all `reference`); `a deleted trip's summary is 404`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/trip-summary.test.ts`. Record the counts.
- [ ] **Step 3: Implement** the read and the route.
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.** Count transfers as spending: the golden case fails. Convert the day's yen at once: day 3 reads `142882`.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Serve a trip's summary from the stored amounts of its records"`

---

### Task P5-T13: Changing the home currency (C8) in one vault transaction

**Starts after:** P5-T11, 1A-T6, 1B-T8, 1B-T13

**Files:**
- Modify: `apps/edge/src/vault/domain/settings.ts` (`settingsOf`, `homeCurrencyPreview`, `changeHomeCurrency`), `src/vault/policies.ts` (`describeMe` adds `home_currency`), `src/vault/files/snapshots.ts` (1B-T8: a ready snapshot whose `high_water` is below `sync_state.pruned_through` reads `expired` and is never reused), `src/vault/routes.ts`, `src/v1/routes.ts` (two routes; `VAULT_ADDED_ROUTES`), `src/v1/protocol.ts` (`'settings.home_currency' | 'settings.home_currency_preview'`), `src/vault/commands/registry.ts` (entity `settings` validated by `isSettingsSnapshot`; `settings.home_currency`, outcome updated, schema 1, policy `current`), `test/route-coverage.test.ts`
- Test: `apps/edge/test/workers/home-currency.test.ts`

**Interfaces:**
- Consumes: `requireRates`, `referenceRate` (P5-T8); P5-T10's create rules; `convertMinor`, `convertMinorDown` (P5-T1); `derivedUuid` (`@api/commands/derived-id`); 1B-T8's snapshot status and reuse rule.
- Produces: `settingsOf(c): SettingsSnapshot | null`; `homeCurrencyPreview(c, query): HomeCurrencyPreview`; `changeHomeCurrency(c, call): CommandAck`. Routes: `PUT /v1/me/home-currency` (`current_policy`, `writes`, 200; body `{ currency }`; `If-Match` optional: absent only while no `settings` row exists, otherwise required) and `GET /v1/me/home-currency/preview?currency=` (`bound_session`).
- Rules (C8, B16, X3; default pending owner Q3), all inside the call's one transaction:
  1. The same currency is `stateProblem('errors.home_currency_same', 'currency')`; an unknown one 422 on `currency`; a stale `If-Match` 409 `VERSION_CONFLICT` with the current settings.
  2. After the receipt lookup (a replay answers first), one `requireRates` for every distinct date of a record that is not purged and not in the new currency (with every such record's currency and the new one), plus the change day (`bangkokDate(now)`) with the old and new home currencies.
  3. Each record (active or deleted, never purged), read by iterating the cursor: in the new currency, rate `'1'`, `reference`, no `rate_date`, home = amount; otherwise the reference rate of its own date and `convertMinor`. Own and exchange rates become reference ("rates the person edited do not carry over"). `wallet_amount_minor` and `to_amount_minor` do not change (B15). Its row is updated and the snapshot of its latest change row is rewritten to the new DTO under the same version, one statement per record.
  4. A home amount, budget overall or limit above the cap refuses the whole change: `stateProblem('errors.home_amount_over_cap', 'currency')`, nothing written.
  5. Each stored month's budget converts at the change day's rate: the overall `convertMinor`, at least 1; each limit `convertMinorDown`, removed when it reaches 0; each budget is a new version with its change. `0000`'s triggers check sublimits after every update, so a month whose overall shrinks updates its limits first, and one whose overall grows updates the overall first.
  6. The `settings` row is inserted (version 1, entity id `derivedUuid(accountId, 'account-settings')`) or moves to the next version; its change joins the group, which therefore holds the settings and the budgets only.
  7. After the group is appended, still inside the mutation (so a replay never moves it), `sync_state.pruned_through` becomes its revision: every older delta cursor is 410 `RESYNC_REQUIRED` and phones download a snapshot.
- The preview answers `{ currency, records, own_rates, budgets }`: records not purged, those whose rate source is `own` or `exchange`, and stored budget months.

- [ ] **Step 1: Write the failing tests** (fixture rates on `2026-10-20` and `2026-10-25`: USD base, THB `32`, JPY `149.0656`, so 1 THB is ¥4.6583; the vault clock on `2026-10-25`):
  - `every record is recomputed at its own date's reference rate` (฿65.00 on `2026-10-20` becomes `home_amount_minor '303'` at `4.6583`; a ¥4,620 record becomes rate `'1'` and home `'4620'`; an own-rate record becomes `reference`).
  - `budgets convert at the change day's rate: the overall half-up, each limit down` (฿18,000.00 becomes `'83849'`; ฿1,500.13 with limits ฿1,000.05 and ฿500.08 becomes `'6988'` with `'4658'` and `'2329'`); `a budget that converts to nothing keeps one yen, and a limit that does is removed` (฿0.01); `budgets convert into a currency with larger numbers` (VND at `24499.2` per USD, so ฿1 is ₫765.6: the same budget becomes `'1148500'` with `'765638'` and `'382861'`).
  - `wallet balances never move` (every `balance_minor` equal before and after).
  - `older cursors resync, and the snapshot carries the new home amounts` (a cursor taken before is 410; a snapshot requested after holds each record's new `home_amount_minor`; one built before reads `expired`).
  - `one change group holds the settings and the budgets, whatever the number of records` (2,000 records: the group has 1 plus the budgets' changes, under 1 MiB).
  - `a home amount past the cap refuses the change and writes nothing` (a record, and then a budget, of ฿999,999,999.99 into VND at `765.6`).
  - `a record sent after the change is in the new home currency` (an outbox-style create sent after the change carries a yen home amount); `an own-rate record queued before the change arrives as a reference record in the new home currency, and its card keeps the charged amount` (after the change to JPY, ¥4,620 on the THB card with `rate_source: 'own'`, `home_amount_minor: '107550'` and `home_currency: 'THB'`: `reference`, rate `'1'`, home `'4620'`, `wallet_amount_minor '107550'`).
  - `a stale If-Match is 409 with the current settings; the same currency is 422`; `a resent change replays without recomputing again, and leaves pruned_through where it was`; `the preview counts records, own rates and budgets`; `/v1/me names the home currency` (`THB` before, `JPY` after).
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/home-currency.test.ts`. Record the counts.
- [ ] **Step 3: Implement** the command, the preview, the snapshot rule and the routes.
- [ ] **Step 4: Run them and see them pass,** with 1B-T8's `snapshots.test.ts` and 1A-T8a's `sync.test.ts` unchanged.
- [ ] **Step 5: Mutation check.** Round limits half-up: the sublimit case fails. Update the overall first in every month: the yen case fails; the limits first: the dong case fails. Write one change per record: the 2,000-record case fails on its count. Leave `pruned_through` as it was: the resync case fails. Skip rewriting the change rows: the snapshot case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Change the home currency in one vault transaction, converting records and budgets and sending every phone to a snapshot"`

---

### Task P5-T14: The export's currency columns, with exportRowCells forked

**Starts after:** P5-T11, 1B-T6, 1B-T12, P3-T2 (P3:source)

**Files:**
- Create: `apps/edge/src/vault/files/export-cells.ts` (fork of `@api/exports/export-handler`'s `exportRowCells`)
- Modify: `src/vault/files/exports.ts` (1B-T6: the export read takes the money columns, the trip's name and the home currency; the writer uses `VAULT_EXPORT_CSV_COLUMNS`), `test/vault-parity-files.db.test.ts` (the vault run's export statuses drop `bytes` and `sha256`, and its downloaded rows are compared on their first 18 columns; default pending owner Q8)
- Test: `apps/edge/test/export-cells.test.ts` (Node), `apps/edge/test/workers/exports-currency.test.ts`

**Interfaces:**
- Consumes: `VAULT_EXPORT_CSV_COLUMNS`, `minorToDecimal` (P5-T1, P5-T2); `csvLiteral`, `csvNumber`, `csvText` (`@api/exports/csv-writer`); `seedGoldenTrip` (P5-T11).
- Produces: `type VaultExportRow` (1B-T6's row plus `currency`, `rate`, `rateSource`, `rateDate`, `homeAmountMinor`, `homeCurrency`, `walletAmountMinor`, `walletCurrency`, `toAmountMinor`, `toCurrency`, `tripId`, `tripName`, `source`); `exportRowCells(row: VaultExportRow): string[]` in `VAULT_EXPORT_CSV_COLUMNS` order.
- Rules (§6.12): `amount` and `amount_minor` are in the record's currency with its decimals (JPY `4620`, never `46.20`) and `currency` is the record's; each `*_amount` is `minorToDecimal` of its `*_minor` in its currency; empty cells where a field is null; `trip_name` through `csvText`, so a name that starts like a formula is written as text; a deleted or purged trip's name is empty.

- [ ] **Step 1: Write the failing tests:** `export-cells.test.ts`: `an older THB row's first 18 cells equal the API's` (the same row through `@api`'s `exportRowCells` and the fork); `a yen record writes its yen amount, rate, rate date and home amount exactly` (`4620`, `JPY`, `0.2312`, `reference`, `2026-11-03`, `1068.14`, `106814`, `THB`, `1068.14`, `106814`, `THB`); `an exchange writes both amounts and currencies`; `a trip name starting with = is written with a leading '`. `exports-currency.test.ts`: `the golden trip exports every row with its currency columns` (the file's header is `VAULT_EXPORT_CSV_COLUMNS`; the sum of `home_amount_minor` over the trip's expense rows is `883184`); `a record's source is written as P3 named it, and an older record's is empty` (`tell_bun` in the last cell; a row whose `source` is NULL, written with SQL, leaves it empty).
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge -- test/export-cells.test.ts` and `npm run test:edge:workers -- test/workers/exports-currency.test.ts`. Record the counts.
- [ ] **Step 3: Fork the cells, then extend the export read and the writer.**
- [ ] **Step 4: Run them and see them pass,** with 1B-T6's `exports.test.ts` (its header assertion now `VAULT_EXPORT_CSV_COLUMNS`) and the files parity session.
- [ ] **Step 5: Mutation check.** Format every amount with two decimals: the yen case fails (`46.20`). Write the trip name with `csvLiteral`: the formula case fails. Leave `source` out of the export read: the source case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Export each record's currency, rate, home amount and trip, in exact minor units"`

---

### Task P5-T15: The D31 rate provider

**Starts after:** P5-T7

**Waits on owner D31** (Q1): skip this task until the owner names the provider; nothing else in this plan needs it.

**Files:**
- Create: `apps/edge/src/background/fx-feeds/<provider>.ts`
- Modify: `src/background/fx-feed.ts` (`feedFor` knows the provider's name), `src/v1/env.ts` (`FX_API_KEY?`, a secret, only when the provider needs a key, D33; a var it adds goes in both environment blocks too, A20), `wrangler.jsonc` (`FX_FEED` names the provider in `env.production` and `env.staging`, the latter deployed only after the README's emptying steps; the top level keeps `fixture`; A20), `apps/edge/README.md` (the provider, its secret, its rate date, its terms, and how an environment that ran the fixture, such as staging, empties `fx_rates`, `fx:today` and `fx:history_from` with `wrangler d1 execute` and `wrangler kv key delete` before the provider's first run, SKIPPED here)
- Test: `apps/edge/test/fx-provider.test.ts` (Node)

**Interfaces:**
- Consumes: `FxFeed`, `FxDay`, `feedFor` (P5-T7); `canonicalQuote` (P5-T1).
- Produces: `<provider>Feed(env: { FX_API_KEY?: string }, fetchImpl?: typeof fetch): FxFeed` (P5-T7's interface: `name`, `base`, `latest()`, `range(from, through)` oldest first, one `FxDay` per published day).
- Rules: first confirm Q1's needs against the provider's current docs and record them in the receipt, with its base, which day a rate is dated (against the 06:00 Bangkok Cron, weekends and holidays) and its limits for a 366-day range. Quotes pass `canonicalQuote`. A non-2xx answer or an unreadable body throws a named error, logged by the Cron as `fx_feed_failed`.

- [ ] **Step 1: Write the failing tests** on recorded responses copied from the provider's documentation into the test (no live call): `latest reads the day and every quote`; `range reads every day, oldest first, in as few requests as the provider allows`; `a refused or unreadable answer throws`; `the key is sent as the provider asks and never logged`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge -- test/fx-provider.test.ts`. Record the counts.
- [ ] **Step 3: Implement** the adapter and its `feedFor` name.
- [ ] **Step 4: Run them and see them pass.** A live call needs the provider account and the D33 Cloudflare account: SKIPPED.
- [ ] **Step 5: Mutation check.** Return `range` newest first: its case fails. Ignore a non-2xx status: the refusal case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Read daily reference rates from the provider the owner chose (D31)"`

---

### Task P5-T16: Money in any currency in the app: text, input, the keypad, private mode and spoken names

**Starts after:** P5-T1, P2-T10, P2-T14, P2-T37

**Files:**
- Create: `apps/app/src/wallet/currency/copy.ts` (`CURRENCY_COPY`, a P2-T3 `DraftTable`, so `draftText.test.ts` checks it)
- Modify: `apps/app/src/spend/v1/money.ts`, `apps/app/src/ui/keypadExpression.ts`, `apps/app/src/wallet/money/walletMoney.ts` and `money/WalletAmount.tsx` (P2-T10), `apps/app/src/wallet/add/WalletKeypad.tsx` (P2-T14), `apps/app/src/wallet/sweep.render.test.tsx` (P2-T37)
- Test: `apps/app/src/spend/v1/money.test.ts`, `src/ui/keypadExpression.test.ts`, `src/wallet/money/walletMoney.test.ts` (Node), `src/wallet/money/WalletAmount.render.test.tsx`

**Interfaces:**
- Consumes: `moneyText`, `minorUnitsOf`, `decimalToMinor`, `CURRENCY_SYMBOLS` (P5-T1).
- Produces (THB stays every default here; P5-T18d passes each surface's currency):
  ```ts
  // spend/v1/money.ts
  export function formatMoney(value: Minor, currency: CurrencyCode, locale: MoneyLocale): string
  export function parseAmountInputIn(text: string, currency: CurrencyCode, locale: MoneyLocale): Minor   // parseAmountInput's rules with the currency's decimals and symbol
  // ui/keypadExpression.ts
  KeypadState gains exponent?: MinorUnits (2 when absent); export function emptyKeypad(exponent?: MinorUnits): KeypadState; keypadFromMinor(minor, exponent?)
  // wallet/money/walletMoney.ts
  walletMoneyText(minor, options?: { sign?; exact?; currency?: CurrencyCode }); perDayText(perDayMinor, currency?)   // whole major units, rounded down (default pending owner Q12)
  export function hiddenAmount(currency?: CurrencyCode): string   // the symbol, then ••••; HIDDEN_AMOUNT === hiddenAmount('THB')
  spokenMoney(minor, t, currency?, locale?)   // THB keeps common.baht and common.satang; others read '{amount} {spoken name}' with the currency's decimals, the name from tableT(CURRENCY_COPY, locale ?? 'th') whatever t is, until P5-T29
  // WalletAmount gains currency?: CurrencyCode (it passes the active locale); WalletKeypad gains decimal?: boolean (the '.' key, for tc-rate-edit)
  ```
- Rules: a keypad with exponent 0 refuses `.` and one with exponent 2 a third decimal (`too_precise`); values are minor units of the keypad's currency. `CURRENCY_COPY` holds `currency.<CODE>.name` and `currency.<CODE>.spoken` for THB and the thirteen: tc-default-currency's names (บาทไทย, ดอลลาร์สหรัฐ, เยนญี่ปุ่น, วอนเกาหลีใต้, ดอลลาร์สิงคโปร์, ริงกิตมาเลเซีย, ดองเวียดนาม, ยูโร, หยวนจีน) and drafts (ดอลลาร์ฮ่องกง, ดอลลาร์ไต้หวัน, กีบลาว, ปอนด์สเตอร์ลิง, ดอลลาร์ออสเตรเลีย); spoken words บาท, ดอลลาร์สหรัฐ, เยน, วอน, ดอลลาร์สิงคโปร์, ริงกิต, ดอง, ยูโร, หยวน, ดอลลาร์ฮ่องกง, ดอลลาร์ไต้หวัน, กีบ, ปอนด์, ดอลลาร์ออสเตรเลีย; English lines are drafts (default pending owner Q13). A currency outside the table is spoken by its code.

- [ ] **Step 1: Write the failing tests:**
  - `money.test.ts`: `formatMoney('4620', 'JPY', 'th')` is `¥4,620`, `('106814', 'THB')` `฿1,068.14`, `('1250', 'USD')` `$12.50`, `('120000', 'VND')` `₫120,000`; `parseAmountInputIn('1,075.50', 'THB', 'th')` is `107550`, `('12.5', 'JPY')` throws `too_precise`, `('๑๒๐๐', 'JPY', 'th')` is `1200`.
  - `keypadExpression.test.ts`: `a yen keypad has no decimals` (`.` on `emptyKeypad(0)` sets `too_precise` and keeps the state; 4, 6, 2, 0 evaluate to `4620`); every existing case passes unchanged.
  - `walletMoney.test.ts`: `walletMoneyText('4620', { currency: 'JPY' })` is `¥4,620` and with `sign: 'expense'` `−¥4,620`; `hiddenAmount('JPY')` is `¥••••`; `spokenMoney('4620', t, 'JPY')` is `4,620 เยน`, `('1250', t, 'USD')` `12.50 ดอลลาร์สหรัฐ`, `('5025', t)` still `50 บาท 25 สตางค์`; `perDayText('1550', 'JPY')` is `¥1,550`, `('1299', 'USD')` `$12`.
  - `WalletAmount.render.test.tsx` (both modes and languages): `a yen amount shows ¥ and is read in yen` (`<WalletAmount minor="4620" currency="JPY" size={44} label="ร้านยา" />`: text `¥4,620`, label `ร้านยา 4,620 เยน`); `private mode hides a yen amount behind ¥••••, with no digit`.
  - `sweep.render.test.tsx`: the private-mode sweep also refuses any `CURRENCY_SYMBOLS` value before a digit and any spoken currency word after a number.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/spend/v1/money.test.ts src/ui/keypadExpression.test.ts src/wallet/money/walletMoney.test.ts` and `npm run test:render -w gogospend-app -- src/wallet/money/WalletAmount.render.test.tsx`. Record the counts.
- [ ] **Step 3: Implement** the functions, the props and the copy table.
- [ ] **Step 4: Run them and see them pass,** with every P2 suite on money and the keypad unchanged.
- [ ] **Step 5: Mutation check.** Use two decimals for every currency: the yen keypad case fails. Mask with `฿••••` for every currency: the private yen case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Format, type, hide and speak money in each currency's own units"`

---

### Task P5-T17: The app's client for trips, today's rates and the home currency, and the rates cache

**Starts after:** P5-T2, P5-T3, P2-T3

**Files:**
- Create: `apps/app/src/spend/v1/ratesCache.ts`
- Modify: `apps/app/src/api/client.ts` (conditional reads), `apps/app/src/spend/v1/resources.ts`, `src/spend/v1/testing/fakeResources.ts`
- Test: `apps/app/src/api/client.test.ts` (one case), `src/spend/v1/resources.test.ts`, `src/spend/v1/ratesCache.test.ts` (Node)

**Interfaces:**
- Consumes: the P5-T2 and P5-T3 DTOs and validators; `KeyValueStore`, `walletDeviceStore` (P2-T3).
- Produces:
  ```ts
  // api/client.ts
  export const NOT_MODIFIED: unique symbol
  V1RequestOptions gains ifNoneMatch?: string and etag?: (value: string | null) => void   // a 304 to a request with ifNoneMatch is handed to validate as NOT_MODIFIED and returned
  // resources.ts: CreateEntryInput and CreateTransferInput gain currency?, rate_source?, rate?, home_amount_minor?, home_currency?, trip_id?, and a transfer to_amount_minor?
  SpendV1Resources gains:
    trips(): Promise<TripDto[]>
    createTrip(input: CreateTripRequest, commandId: string): Promise<CommandAck>
    updateTrip(id: string, version: number, changes: UpdateTripRequest, commandId: string): Promise<CommandAck>
    deleteTrip(id: string, version: number, commandId: string): Promise<CommandAck>
    tripSummary(id: string): Promise<TripSummaryDto>
    ratesToday(etag?: string): Promise<{ etag: string | null; rates: RatesTodayDto } | 'unchanged'>
    homeCurrencyPreview(currency: CurrencyCode): Promise<HomeCurrencyPreview>
    setHomeCurrency(currency: CurrencyCode, version: number | null, commandId: string): Promise<CommandAck>   // If-Match only with a version
  // ratesCache.ts (pure over a KeyValueStore)
  export const RATES_TODAY_NAME = 'rates-today'   // device store: public data, erased at sign-out like every device setting
  export type CachedRates = { etag: string | null; rates: RatesTodayDto }
  export function readCachedRates(store: KeyValueStore): Promise<CachedRates | null>   // damaged JSON reads as null
  export function refreshRates(resources: Pick<SpendV1Resources, 'ratesToday'>, store: KeyValueStore): Promise<CachedRates | null>   // keeps the cache on 'unchanged' or a failure
  ```
- The fake resources implement the same methods in memory (trips with versions and the overlap rule on create and edit, a settable rates set with an ETag, 503 until one is set, a preview from its records) and record every call, as today's fake does.

- [ ] **Step 1: Write the failing tests:** `client.test.ts`: `a conditional read hands a 304 back as NOT_MODIFIED and reports a 200's ETag`. `resources.test.ts`: `a yen create sends its money fields`; `trips are created, edited and deleted with their keys and versions, and listed and summarised against their validators`; `the home currency is changed with If-Match only when a version is known`; `today's rates answer unchanged for the cached ETag`. `ratesCache.test.ts`: `a refresh stores a new set with its ETag`; `a 304 or a failure keeps the cache`; `a damaged cache reads as none`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:app` (the client) and `npm run test:unit -w gogospend-app -- src/spend/v1/resources.test.ts src/spend/v1/ratesCache.test.ts`. Record the counts.
- [ ] **Step 3: Implement** the transport option, the methods, the fake and the cache.
- [ ] **Step 4: Run them and see them pass,** with every existing `resources.test.ts` case unchanged.
- [ ] **Step 5: Mutation check.** Treat a 304 as an error: the conditional case fails. Overwrite the cache on a failure: its case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Give the app trips, today's rates with their ETag, and the home currency change"`

---

### Task P5-T18a: The phone's home amounts, draft prices and the diary's view

**Starts after:** P5-T16, P5-T17

**Files:**
- Create: `apps/app/src/spend/v1/homeAmounts.ts` (pure), `apps/app/src/spend/v1/testing/goldenTrip.ts` (`goldenTripRecords()`: P5-T11's golden trip as DTOs with the vault's stored amounts, its wallets, trip and budget, and the cached rates of `2026-11-02` and `2026-11-03`)
- Modify: `apps/app/src/storage/diaryRepository.ts` (`recomputeTotals`; `assertDraft`), `src/spend/v1/spendDiary.ts`, `SpendDiaryContext.tsx` (`NO_DIARY` gains `trips: []` and `homeCurrency: 'THB'`), `testing/fakeDiary.ts`
- Test: `apps/app/src/spend/v1/homeAmounts.test.ts`, `src/storage/diaryRepository.test.ts`, `src/spend/v1/spendDiary.test.ts`

**Interfaces:**
- Consumes: `crossRate`, `convertMinor` (P5-T1); the P5-T2 and P5-T3 DTOs.
- Produces:
  ```ts
  export function homeMinorOf(record: TransactionDto): Minor                       // home_amount_minor ?? amount_minor (an older snapshot is THB in a THB home)
  export function walletDeltaOf(record: TransactionDto, walletId: string): bigint  // P5-T10's moves, in the wallet's currency
  export type DraftMoney = { amount_minor: Minor; currency?: CurrencyCode; rate_source?: RateSource; rate?: string; home_amount_minor?: Minor }
  export type HomeEstimate = { minor: Minor; estimated: boolean; rate: string | null; day: string | null }
  export function estimateHomeMinor(draft: DraftMoney, walletCurrency: CurrencyCode, home: CurrencyCode, rates: RatesTodayDto | null): HomeEstimate | null   // null when a quote it needs is not cached
  export function draftWalletDelta(draft: PendingEntry, walletId: string, walletCurrency: CurrencyCode, home: CurrencyCode, rates: RatesTodayDto | null): bigint | null   // what a waiting draft moves that wallet by; null when unpriced
  export type DraftPricing = { home(draft: PendingEntry): HomeEstimate | null; wallet(draft: PendingEntry, walletId: string): bigint | null }
  export function draftPricing(wallets: readonly WalletSnapshot[], home: CurrencyCode, rates: RatesTodayDto | null): DraftPricing
  export function dayCurrencyLines(records: readonly TransactionDto[], home: CurrencyCode): { currency: CurrencyCode; minor: Minor }[]   // a day's expenses per original currency, home last
  // spendDiary.ts
  DiaryView.trips: TripDto[]              // live, from the diary's confirmed trip entities, by starts_on
  DiaryView.homeCurrency: CurrencyCode    // the synced settings', else 'THB'
  ```
- Rules: a draft in the home currency (its `currency`, else its wallet's) is its `amount_minor`, not estimated, cached quotes or not; otherwise an estimate is the charged amount of an own rate, `convertMinor` at a sent rate, else `crossRate` of the cached quotes (the base's quote is `1`), marked estimated with the earlier quote day. `draftWalletDelta` is exact in the draft's own currency, the charged amount for an own draft on a home-currency wallet, else the cached estimate; a waiting transfer moves its source by `amount_minor` and its destination by `to_amount_minor` when set. `assertDraft` checks the money fields as the server does (an ISO currency; a canonical rate; neither rate nor home amount on a reference draft, exactly one on an own draft; `home_currency` with own or exchange; `to_amount_minor` on a transfer only; `trip_id` null or a synced live trip whose dates hold the draft's date).

- [ ] **Step 1: Write the failing tests:**
  - `homeAmounts.test.ts`: `an older snapshot's home amount is its amount`; `a wallet moves by its charged amount and an exchange's destination by what it received` (the golden exchange: bank `-1000000`, yen cash `43000`); `a yen draft is estimated from the cached rate` (cached THB `34.62`, JPY `150` on `2026-11-02`: ¥4,620 is `{ minor: '106630', estimated: true, rate: '0.2308', day: '2026-11-02' }`, tc-offline-rate's ≈ ฿1,066.30); `an own draft's charged amount is not an estimate`; `no cached quote is no estimate`; `a baht draft in a baht home is its own amount, even with no cached quote`; `a waiting ¥4,620 draft takes ฿1,066.30 off a baht card at the cached 0.2308, never ฿46.20` (`draftWalletDelta` is `-106630n`); `a waiting exchange moves its destination by what it receives` (฿10,000 for ¥43,000: the bank `-1000000n`, the yen cash `43000n`, never the cached estimate); `a day lists foreign currencies first` (day 3: `JPY 6180`, then `THB 31200`).
  - `diaryRepository.test.ts`: `confirmed balances follow each wallet's currency`; `a draft may carry the money fields, checked as the server checks them` (a trip tag outside the trip's dates is refused).
  - `spendDiary.test.ts`: `the view lists live trips and the home currency` (`JPY` once a settings snapshot syncs; `THB` without one).
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/spend/v1/homeAmounts.test.ts src/storage/diaryRepository.test.ts src/spend/v1/spendDiary.test.ts`. Record the counts.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass,** with the THB golden seed's suites unchanged.
- [ ] **Step 5: Mutation check.** Price an own draft at the cached rate: the own case fails. Price a home-currency draft from the quotes: the baht-home case fails. Move a baht card by a yen draft's `amount_minor`: the ฿46.20 case fails. Price a waiting exchange's destination from the cached rate: the exchange case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Give the phone home amounts, draft prices from cached rates, and the diary's trips and home currency"`

---

### Task P5-T18b: The models on home amounts, with waiting drafts priced

**Starts after:** P5-T18a, P2-T5, P2-T23, P2-T31

**Files:**
- Modify: `apps/app/src/spend/v1/pendingTotals.ts`, `src/spend/v1/redesign/budgetPace.ts`, `planning/budgetModel.ts`, `insights/insightsModel.ts`, `homeModel.ts`, `historyModel.ts`, `shared.ts`, `src/screens/redesign/entry/entryHelpers.ts` (P2-T5: `availableBalances`), `src/wallet/home/homeWallets.ts` (P2-T23), `src/wallet/insights/calendarShade.ts` (P2-T31)
- Test: `apps/app/src/spend/v1/pendingTotals.test.ts`, the six models' tests, `src/wallet/home/homeWallets.test.ts`, `src/wallet/insights/calendarShade.test.ts` (Node)

**Interfaces:**
- Consumes: `homeMinorOf`, `walletDeltaOf`, `DraftPricing` (P5-T18a); P2's models.
- Produces:
  ```ts
  // pendingTotals.ts; without price every draft counts at its amount_minor, so the v1 HomeScreen's call is unchanged
  export type DisplayedTotals = { confirmed: Totals; pendingAdjustment: Totals & { unpriced: number }; estimated: Totals }
  export function deriveDisplayedTotals(confirmed: Totals, pending: readonly PendingEntry[], price?: DraftPricing): DisplayedTotals
  // availableBalances(wallets, outbox, price?) and homeWallets({ ..., price? }) move each wallet by price.wallet
  export function calendarShade(outMinor: Minor, home?: CurrencyCode, rates?: RatesTodayDto | null): CalendarStep
  ```
- Rules: every sum of money in or out (budget pace, the budget model's days, insights, Home's lines, History's day totals) adds `homeMinorOf`; a wallet's balance, today's money out and pending money use `walletDeltaOf` and `price.wallet`, in the wallet's currency; a draft that cannot be priced stays out and counts in `unpriced`. In a home other than THB, `calendarShade` converts `CALENDAR_STEP_LIMITS_BAHT` at the cached rate, to two significant figures (default pending owner Q12).

- [ ] **Step 1: Write the failing tests:**
  - `pendingTotals.test.ts`: `a yen draft adds its estimate; one without a rate is counted apart`.
  - `homeWallets.test.ts`: `a card's waiting yen draft is priced, never read as satang` (rh-offline's `2486000` card with a waiting ¥4,620 draft at the cached 0.2308 gives `2379370`, pending `106630`).
  - `calendarShade.test.ts`: `a yen home shades by the baht steps in yen` (at 4.6583 yen per baht the steps are ¥930, ¥2,300, ¥4,700 and ¥9,300; THB unchanged).
  - The models' tests: `budget pace, the budget model, insights, Home and History add home amounts` (each existing fixture plus one ¥4,620 record with home `106814` moves its total by `106814`).
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/spend/v1/pendingTotals.test.ts src/wallet/home/homeWallets.test.ts src/wallet/insights/calendarShade.test.ts` and the models' (`src/spend/v1/redesign/budgetPace.test.ts`, `homeModel.test.ts`, `historyModel.test.ts`, `shared.test.ts`, `planning/budgetModel.test.ts`, `insights/insightsModel.test.ts`). Record the counts.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass,** with the THB golden seed's suites unchanged.
- [ ] **Step 5: Mutation check.** Sum `amount_minor` in insights: its case fails. Add an unpriced draft as 0: the pending case fails. Move the card by the draft's `amount_minor`: the priced-draft case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add home amounts in every model and price waiting drafts in each wallet's currency"`

---

### Task P5-T18c: Today's rates on the phone, in the wallet shell

**Starts after:** P5-T18a, P5-T18b, P2-T24, P2-T28, P2-T30

**Files:**
- Create: `apps/app/src/wallet/travel/RatesProvider.tsx`
- Modify: `apps/app/src/wallet/home/WalletShell.tsx` (P2-T18: one `RatesProvider` directly inside `SpendV1Provider`, so P2-T30's `OverBudgetWatch`, the toast, the tray and the screens read it), `src/wallet/testing/walletHarness.tsx` (P2-T8: `RatesProvider` innermost)
- Modify, so waiting drafts reach the screens priced: `src/spend/v1/redesign/homeModel.ts`, `historyModel.ts`, `shared.ts`, `budgetPace.ts`, `planning/budgetModel.ts`, `insights/insightsModel.ts` and `src/wallet/saved/savedMoment.ts` (P2-T17) take `price?`; `src/wallet/home/WalletHomeScreen.tsx` (P2-T24: `homeWallets` and `homeModel`), `src/screens/redesign/entry/entryReferences.ts` (P2-T5: `availableBalances`), `src/wallet/saved/SavedToastHost.tsx` (P2-T17: `todayOutMinor`), `src/wallet/budget/WalletBudgetScreen.tsx` and `OverBudgetWatch.tsx` (P2-T30), `src/screens/redesign/history/historyData.ts` (P2-T28's `useHistoryData`) and `src/wallet/insights/insightsData.ts` (P2-T31) pass `useRates().pricing`
- Test: `apps/app/src/wallet/travel/RatesProvider.render.test.tsx`, `src/spend/v1/redesign/budgetPace.test.ts` and `homeModel.test.ts` (Node, the price cases)

**Interfaces:**
- Consumes: `readCachedRates`, `refreshRates` (P5-T17); `estimateHomeMinor`, `draftPricing`, `DiaryView.homeCurrency` (P5-T18a); the `price` of `homeWallets` and `availableBalances` (P5-T18b); `walletDeviceStore` (P2-T3).
- Produces:
  ```ts
  export function RatesProvider({ children }: { children: ReactNode }): JSX.Element   // reads the cache, refreshes on mount and on return to the foreground
  export function useRates(): { rates: RatesTodayDto | null; home: CurrencyCode; estimate(draft: DraftMoney, walletCurrency: CurrencyCode): HomeEstimate | null; pricing: DraftPricing | undefined }   // pricing over the diary's wallets; outside a provider: no rates and no pricing, so today's Quick add counts drafts as before
  // waitingMoneyLines(outbox, month, tc, locale, confirmedIds?, price?), HomeInput.price? (handed to it and to budgetPace), HistoryInput.price? and RowContext.price? (draftRow and dayTotals), budgetPace({ ..., price? }), dailySpending({ ..., price? }), dayFacts(records, drafts, price?) and todayOutMinor({ ..., price? }) count each of their drafts at price.home instead of its amount_minor, leaving an unpriced one out; without price, nothing changes
  ```

- [ ] **Step 1: Write the failing tests:** `budgetPace.test.ts` and `homeModel.test.ts`: `a priced draft counts at its home price, and an unpriced one not at all` (a waiting ¥4,620 draft at the cached 0.2308: pace's pending and `waitingMoneyLines`' money out read ฿1,066.30). `RatesProvider.render.test.tsx`: `rates refresh on mount and on return to the foreground, and a 304 keeps them`; `outside a provider there are no rates or pricing, and nothing is estimated`; `on Home, a waiting ¥4,620 draft on the baht card shows ฿1,066.30 pending and the toast adds ฿1,066.30, never ฿46.20` (cached rates of `2026-11-02`: rh-offline's `2486000` card reads ฿23,793.70, as does the add tray's balance for it, and the budget card's pending total is ฿1,066.30; over a summary of `'13200'` the toast reads วันนี้ ฿1,198.30); `the budget screen and History count a waiting ¥4,620 draft as ฿1,066.30, never ฿46.20`; `with no cached rates (today's rates answer 503), a waiting ฿50.00 draft still counts in Home's pending and the toast`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/spend/v1/redesign/budgetPace.test.ts src/spend/v1/redesign/homeModel.test.ts` and `npm run test:render -w gogospend-app -- src/wallet/travel/RatesProvider.render.test.tsx`. Record the counts.
- [ ] **Step 3: Implement,** with the shell, the harness and the call sites.
- [ ] **Step 4: Run them and see them pass,** with every P2 render suite unchanged inside the harness's `RatesProvider`, whose fake answers 503 until a test sets rates.
- [ ] **Step 5: Mutation check.** Refresh only on mount: the foreground case fails. Drop the price at Home's `homeWallets` call: the Home case reads ฿46.20 and fails. Drop it at the budget screen's `budgetPace` call: the budget case reads ฿46.20 and fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Keep today's rates on the phone, refreshed in the wallet shell, and price waiting drafts wherever the screens add them"`

---

### Task P5-T18d: Every amount in its own currency, travel area or not

**Starts after:** P5-T16, P5-T18b, P2-T37

On P2's and 1D's screens, and P6B's when they landed first (X13): a record's amount uses `record.currency ?? 'THB'`; a wallet's balance, pending and today lines use `wallet.currency`; totals, budgets, category limits, the per-day hint, insights, the calendar, the recap and the toast's total use `DiaryView.homeCurrency`.

**Files:**
- Modify (P2's, under `apps/app/src/wallet/`): `add/AmountStep.tsx`, `ConfirmStep.tsx`, `TransferStep.tsx`, `PickSteps.tsx`, `AddTrayHost.tsx`; `saved/savedMoment.ts`, `SaveFlight.tsx`; `card/WalletCard.tsx`; `wallets/walletsList.ts`, `WalletsListScreen.tsx`, `WalletFields.tsx`, `WalletEditScreen.tsx`, `WalletDetailScreen.tsx`; `home/budgetCardWords.ts`, `BudgetCard.tsx`, `TodayRow.tsx`; `records/WalletDeletedScreen.tsx`, `WalletRecordScreen.tsx`, `RecordActionsTray.tsx`, `EditTray.tsx`; `history/WalletHistoryScreen.tsx`, `FilterTray.tsx`; `categories/WalletCategoriesScreen.tsx`, `CategoryTray.tsx`; `budget/WalletBudgetScreen.tsx`, `BudgetQuestion.tsx`, `OverBudgetMoment.tsx`; `insights/SpendingTab.tsx`, `InOutTab.tsx`, `CalendarTab.tsx`, `MonthBars.tsx`; `recap/recapShare.ts`, `WalletRecapScreen.tsx`; `currency/copy.ts`
- Modify: `apps/app/src/screens/redesign/entry/entryHelpers.ts` (`keypadFor`), `record/recordActions.ts` (`startEdit`), `conflict/ChoicePanel.tsx` (1D-T9); `src/spend/v1/redesign/planning/walletsModel.ts` (`WalletForm.currency`, `buildCreateWallet`), `quickAddModel.ts` and `categoriesModel.ts` (the cap words)
- Modify, if they landed first (under `apps/app/src/wallet/`): P6B-T3's `settings/WalletSettingsScreen.tsx` (the budget row), P6B-T8's `account/WalletSessionEndedScreen.tsx` (each unsent row), P6B-T12's `recap/recapCard.ts` and `shareRecap.ts` (`RecapCardInput.currency`, passed to `recapShareText` and `hiddenAmount`)
- Test: `apps/app/src/wallet/currencySweep.render.test.tsx`, `add/AddTray.render.test.tsx`, `records/EditTray.render.test.tsx`, `wallets/NewWallet.render.test.tsx`, `wallets/walletsList.test.ts`

**Interfaces:**
- Consumes: `minorUnitsOf`, `moneyText`, `MINOR_AMOUNT_MAX` (P5-T1); `emptyKeypad`, `keypadFromMinor` and the `currency` of `WalletAmount`, `walletMoneyText`, `perDayText`, `spokenMoney` and `hiddenAmount` (P5-T16); `DiaryView.homeCurrency`, `walletDeltaOf` (P5-T18a).
- Produces: `currency: CurrencyCode` on `WalletCardModel` and `SavedNotice`, and as the last parameter of `budgetCardWords`, `toastWords` and `recapShareText`; `walletsSummary(wallets, kindOf, home)` totalling the home-currency wallets, with `otherCount`; `WalletForm.currency` (the home currency unless picked; `buildCreateWallet` sends it, the opening in its minor units).
- Rules:
  - Keypads take their currency's exponent: the add tray's (the draft's currency: the wallet's unless the travel area or Tell Bun, P5-T27b, sets another; reset when a wallet in another currency is picked), the edit tray's (`keypadFromMinor(record.amount_minor, minorUnitsOf(record.currency ?? 'THB'))`), the budget and category limits' (home), and the wallet form's opening and correction (the wallet's).
  - With the travel area off, the transfer step offers only wallets in the source's currency (the exchange's second amount is an entry point, P5-T22).
  - `BudgetQuestion`'s baht presets show only in a THB home (default pending owner Q12); the calendar's day amounts carry no symbol in any currency.
  - Copy (`currency/copy.ts`, drafts, default pending owner Q13): `currency.capAmount` ยอดสูงสุดคือ {amount} (past the cap in a currency other than THB, `{amount}` from `moneyText(MINOR_AMOUNT_MAX, currency)`; THB keeps today's words), `currency.otherWallets` ไม่รวมกระเป๋าสกุลอื่นอีก {n} ใบ; both read with `tableT(CURRENCY_COPY, locale)` until P5-T29.

- [ ] **Step 1: Write the failing tests.**
  - `currencySweep.render.test.tsx` (both modes and languages): `in a yen home with only yen money, no screen shows ฿ before a digit or a yen amount with decimals` (Home, the wallets list, wallet detail, the wallet edit screen, a record, the edit tray, the conflict panel, Recently deleted, History and its filter tray, the categories screen and its tray, the budget, the budget question, the over-budget moment, insights with the calendar, the recap, the add tray's transfer and pick steps and the saved toast, and, once landed, P6B's Settings, session-ended screen and recap share tray, on a fake diary whose home is JPY, with a yen cash wallet at ¥43,000, ¥4,620 and ¥1,200 records and a ¥83,849 budget; private mode shows `¥••••`); `a baht record in a yen home shows ฿312 on its row and adds ¥1,453 to the day's total`.
  - `AddTray.render.test.tsx`: `with the travel area off, a yen wallet's tray takes whole yen` (`.` is refused; 4, 6, 2, 0 saves `amount_minor: '4620'`).
  - `EditTray.render.test.tsx`: `editing a ¥4,620 record to 5000 sends amount_minor '5000'`.
  - `NewWallet.render.test.tsx`: `in a yen home a new wallet's opening is typed in whole yen` (¥43,000 is sent as `opening_minor: '43000'` with `currency: 'JPY'`).
  - `walletsList.test.ts`: `the wallets total counts home-currency wallets and names the others`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/wallet/wallets/walletsList.test.ts` and `npm run test:render -w gogospend-app -- src/wallet/currencySweep.render.test.tsx src/wallet/add/AddTray.render.test.tsx src/wallet/records/EditTray.render.test.tsx src/wallet/wallets/NewWallet.render.test.tsx`. Record the counts.
- [ ] **Step 3: Implement,** surface by surface, by the rule above.
- [ ] **Step 4: Run them and see them pass,** with every P2 suite unchanged in a THB home.
- [ ] **Step 5: Mutation check.** Build the edit tray's keypad with two decimals: the 5000 case sends `'500000'` and fails. Draw a record's amount in the home currency: the baht-record case fails. Drop `currency` from Home's budget card: the sweep finds ฿.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Show and type every amount in its own currency on P2's screens, travel area or not"`

---

### Task P5-T18e: P3's and P4's surfaces in their currency

**Starts after:** P5-T18d, P3-T19, P4-T16a, P4-T20, P4-T21

**Files:**
- Modify: `apps/app/src/wallet/receipts/WalletReceiptViewer.tsx` (P3-T19: a `currency?: CurrencyCode` prop, THB when absent, for its `WalletAmount` and `receipts.confirmLine`), `src/wallet/records/WalletRecordScreen.tsx` (passes `record.currency ?? 'THB'`), `src/slips/slipReview.ts` (P4-T16a), `src/wallet/slips/SlipWalletMapScreen.tsx`, `SlipReviewScreen.tsx` (P4-T20) and `SlipDoneScreen.tsx` (P4-T21)
- Test: `apps/app/src/slips/slipReview.test.ts` (Node), `src/wallet/slips/Review.render.test.tsx`, `src/wallet/currencySweep.render.test.tsx` (the viewer joins it)

**Interfaces:**
- Consumes: `WalletAmount`'s and `hiddenAmount`'s `currency` (P5-T16); `buildReview`, `UnsentEntry` (P4-T16a); P4-T20's wallet map.
- Produces: `UnsentEntry.currency: CurrencyCode`, which each builder from the outbox (P4-T20's review, P4-T21's done screen) sets to `currency ?? 'THB'`.
- Rules (D24): `buildReview` matches a slip only against THB unsent entries, as `slipDuplicateOf` does after P5-T10; sl-wallet-map's "บันแนะนำ" last-four match considers THB wallets only, and its new wallets (the suggestion's and the เลือก… tray's) are created with `currency: 'THB'` in any home.

- [ ] **Step 1: Write the failing tests:** `slipReview.test.ts`: `a yen unsent record is not a ฿500.00 slip's duplicate` (an unsent ¥50,000 on the slip's day leaves the row ticked); `Review.render.test.tsx`: `in a yen home the suggested new wallet, and one made from the เลือก… tray's row, are created in THB`; `currencySweep.render.test.tsx`: `a ¥4,620 record's receipt viewer and its delete confirm show ¥4,620, never ฿46.20` (`¥••••` in private mode).
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/slips/slipReview.test.ts` and `npm run test:render -w gogospend-app -- src/wallet/slips/Review.render.test.tsx src/wallet/currencySweep.render.test.tsx`. Record the counts.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass,** with P3-T19's and P4-T20's suites unchanged in a THB home.
- [ ] **Step 5: Mutation check.** Match unsent entries in any currency: the duplicate case fails. Create either new wallet without a currency: the yen-home case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Keep slip review in baht and show a kept receipt in its record's currency"`

---

### Task P5-T19: Kept looks reach the server: P2's phase 5 handoff (R64)

**Starts after:** P5-T17, P2-T11, P2-T21, P2-T29

**Files:**
- Create: `apps/app/src/wallet/looks/lookUpload.ts` (pure)
- Modify: `apps/app/src/wallet/looks/walletLooks.ts` (re-exports `WALLET_KINDS` and `BUN_FACES` from the contracts, X18; `lookOf` takes the server's fields first), `looks/WalletLooksProvider.tsx` (the upload), `looks/categoryIcons.ts` (re-exports `CATEGORY_PICKER_GLYPHS`; `iconFor` takes the server's `icon` first), `apps/app/src/theme/walletPalette.ts` (re-exports `WALLET_MATERIALS`), `src/screens/redesign/planning/walletCommands.ts` (P2-T19), `src/wallet/wallets/NewWalletFlow.tsx` and `WalletEditScreen.tsx` (P2-T21), `src/wallet/categories/CategoryTray.tsx` (P2-T29), `src/spend/v1/redesign/planning/thaiPack.ts` (`packCommands` sends `pack_key`)
- Test: `apps/app/src/wallet/looks/lookUpload.test.ts` (Node), `looks/WalletLooksProvider.render.test.tsx`, `wallets/NewWallet.render.test.tsx`, `categories/WalletCategories.render.test.tsx`

**Interfaces:**
- Consumes: today's `updateWallet` and `updateCategory` with P5-T2's fields (the server takes them from P5-T5); `packKeyOf` (P2-T7); `walletAccountStore` (P2-T3); `useWalletLooks`, `parseLooks`, `parseIcons` (P2-T11); `useWalletCommand` (P2-T19).
- Produces:
  ```ts
  export const LOOKS_UPLOADED_NAME = 'looks-uploaded'   // account store (P2-T3)
  export type LookUpload = { wallets: { id: string; version: number; changes: UpdateWalletRequest }[]; categories: { id: string; version: number; changes: UpdateCategoryRequest }[] }
  export function lookUploadPlan(input: { wallets: readonly WalletSnapshot[]; categories: readonly CategoryDto[]; looks: Readonly<Record<string, WalletLook>>; icons: Readonly<Record<string, GlyphKey>> }): LookUpload   // a kept icon outside CATEGORY_PICKER_GLYPHS is left out
  // categoryIcons.ts: iconFor's parameter becomes Pick<CategoryDto, 'id' | 'type' | 'label' | 'builtin_key' | 'icon'>
  ```
- Rules (P2's "Phase 5 handoff (R64)"): a kept value fills only a server field that is null; the server wins when it has a value; a custom category without a server `pack_key` gets `packKeyOf`'s, a built-in never; wallet order stays on the phone. `WalletLooksProvider`, once per account after the first sync that holds new-shape snapshots, sends the plan through `updateWallet` and `updateCategory` with the versions it read; when every update is acknowledged (or the plan is empty) it stores `LOOKS_UPLOADED_NAME` and reads looks from the server only afterwards (derived when null); a conflict or failure leaves the marker unset for the next open. From then on a new wallet's look travels in its create, a look edit is a wallet update, a category's icon travels in its commands, and the Thai pack creates its items with their `pack_key`.

- [ ] **Step 1: Write the failing tests:** `lookUpload.test.ts`: `kept looks fill only empty server fields`; `a pack category is backfilled by its name, a built-in never`; `wallet order is never uploaded`; `a kept icon the server cannot take is left out`. Render: `the provider sends the plan once and then reads the server's looks` (a second open sends nothing; a kept look for a wallet the server has set is ignored); `a refused upload is retried at the next open`; `a new wallet sends its look in its create, and nothing is kept on the phone`; `the Thai pack's items are created with their pack keys`; `the app's lists are the contract's` (`WALLET_KINDS`, `BUN_FACES`, `WALLET_MATERIALS`, `CATEGORY_PICKER_GLYPHS` are the contracts' arrays).
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/wallet/looks/lookUpload.test.ts` and `npm run test:render -w gogospend-app -- src/wallet/looks/WalletLooksProvider.render.test.tsx src/wallet/wallets/NewWallet.render.test.tsx src/wallet/categories/WalletCategories.render.test.tsx`. Record the counts.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass,** with P2-T11's, P2-T21's and P2-T29's suites (their "kept" cases now read the server's fields).
- [ ] **Step 5: Mutation check.** Let a kept look overwrite a server value: the first case fails. Store the marker before the acknowledgements: the retry case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Upload each account's kept looks, icons and pack keys once, then read them from the server"`

---

### Task P5-T20: Travel in the analytics: the home currency, pack keys and the travel events

**Starts after:** P5-T18a, 1D-T1, 1D-T6, P2-T7

**Files:**
- Create: `apps/app/src/analytics/HomeCurrencyUpkeep.tsx`
- Modify: `apps/app/src/analytics/events.ts`, `catalog.ts` (`PACK_KEYS` re-exported from the contracts, X18), `src/spend/v1/DeviceDiaryProvider.tsx` (renders `HomeCurrencyUpkeep` inside its `SpendDiaryProvider`), `src/spend/v1/redesign/planning/thaiPack.ts` (`analyticsCategoryKey`)
- Test: `apps/app/src/analytics/events.test.ts`, `catalog.test.ts`, `neverSent.test.ts` (Node), `src/spend/v1/DeviceDiaryProvider.render.test.tsx`, `src/spend/v1/redesign/planning/thaiPack.test.ts`

**Interfaces:**
- Consumes: `DiaryView.homeCurrency` (P5-T18a); 1D-T1's `trackClientEvent`, `APP_EVENTS`, `getAnalytics` and `recordAnalytics`; `packKeyOf` (P2-T7).
- Produces (1D-T1's allow-list already holds these names and rules, R23):
  ```ts
  export function trackHomeCurrencySet(p: { currencyCode: string }): void                          // home_currency_set { currency_code }
  export function trackTripStarted(p: { currencyCode: string; tripLengthDays: number }): void       // trip_started { currency_code, trip_length_days }
  export function trackRateOverridden(p: { currencyCode: string }): void                           // rate_overridden { currency_code }
  export function trackCashExchanged(p: { currencyCode: string }): void                            // cash_exchanged { currency_code }, the currency received
  ```
- Rules: each is called once, after the acknowledgement or the device commit, by the rule that performs the action (R25): P5-T26's home currency change, P5-T23's `useTripCommand` create, P5-T22's own-rate and exchange saves. `HomeCurrencyUpkeep` calls `getAnalytics()?.setCommon({ home_currency })` whenever `useDiaryView().homeCurrency` changes, inside the diary's tree, as 1D-T6 sets `ai_enabled`. `analyticsCategoryKey` is the built-in key, else the category's `pack_key`, else `packKeyOf`, else `custom` (its `Pick` gains `'pack_key'`; the name and key order are kept, R61).

- [ ] **Step 1: Write the failing tests:** `the travel emitters send §7's names and properties only` (`trackTripStarted({ currencyCode: 'JPY', tripLengthDays: 8 })` sends `['trip_started', { currency_code: 'JPY', trip_length_days: 8 }]`, and the other three likewise); `DeviceDiaryProvider.render.test.tsx`: `the open diary's home currency reaches every event` (mounted as the layouts mount it, with `recordAnalytics()`: once a settings snapshot naming JPY syncs, the next event carries `home_currency: 'JPY'`); `a category sends its server pack key` (`{ type: 'expense', builtin_key: null, label: 'Art', pack_key: 'merit' }` is `merit`); `catalog.test.ts`: `PACK_KEYS is the contract's`; `neverSent.test.ts` adds the sentinels `trip_name: 'ทริปญี่ปุ่น'`, `rate: '0.2312'` and `home_amount_minor: '106814'`, none of which leaves.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/analytics/events.test.ts src/analytics/catalog.test.ts src/analytics/neverSent.test.ts src/spend/v1/redesign/planning/thaiPack.test.ts` and `npm run test:render -w gogospend-app -- src/spend/v1/DeviceDiaryProvider.render.test.tsx`. Record the counts.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.** Send the trip's name: `events.test.ts`'s exact properties fail. Set the home currency from the root layout: the diary case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Send the home currency, server pack keys and the four travel events through 1D's analytics"`

---

### Task P5-T21: A foreign record in the tray: the currency step, the active trip, the rate line and the offline estimate

**Starts after:** P5-T18c, P5-T18d, P2-T16

**Delivers:** P5:travel-area (`useTravelArea()`, the one switch)

**Files:**
- Create: `apps/app/src/wallet/travel/copy.ts` (`TRAVEL_COPY`), `travel/useTravelCopy.ts`, `travel/travelArea.ts`, `travel/activeTrip.ts` (pure), `travel/CurrencyPick.tsx`, `travel/RateLine.tsx`, `travel/TripTagChip.tsx`, `apps/app/src/dev/catalogue/wallet/travelSections.tsx` (spread into `wallet/index.ts`: `bw-travel-foreign`, `bw-travel-currency-pick`, `bw-travel-offline`, `bw-travel-tray-refusals`)
- Modify: `apps/app/src/config/featureFlags.ts` and `featureFlags.test.ts`, `src/wallet/copy/draftText.test.ts` (P2-T3: `LATIN_LINES` gains `travel.approx` and `travel.rateLine`, which have no Thai letter), `src/spend/v1/redesign/quickAddModel.ts` (`EntryFields` gains the money fields; `buildQuickAdd` sends them), `src/wallet/add/addFlow.ts` (`AddStep` gains `'currency'`), `add/AmountStep.tsx`, `add/ConfirmStep.tsx`, `add/AddTrayHost.tsx` (P2-T14 to P2-T16)
- Test: `apps/app/src/wallet/travel/activeTrip.test.ts` (Node), `travel/travelArea.render.test.tsx` (a render test, so it still holds once P6B-T15's rollout hook is inside), `travel/ForeignRecord.render.test.tsx`

**Interfaces:**
- Consumes: `useRates`, `DiaryView.trips`, `DiaryView.homeCurrency` (P5-T18a, T18c); `formatMoney`, `emptyKeypad`, `WalletAmount` with `currency`, `CURRENCY_COPY` (P5-T16); `rateText`, `rateFromAmounts`, `PICKER_CURRENCIES` (P5-T1); P2's tray, steps and host.
- Produces:
  ```ts
  // featureFlags.ts: RedesignArea gains 'travel', outside APPROVED
  // travel/travelArea.ts: the one switch (A10, X13); every travel entry point and route in P5-T21 to T26 reads it, never the areas themselves
  export function useTravelArea(): boolean   // isRedesignEnabled('wallet') && isRedesignEnabled('travel')
  export function useTravelCopy(): WalletT   // tableT({ ...TRAVEL_COPY, ...CURRENCY_COPY }, locale); P5-T29 replaces it with useWalletCopy
  export function activeTrip(trips: readonly TripDto[], today: string): TripDto | null
  export function pickerCurrencies(rates: RatesTodayDto | null, home: CurrencyCode, current: CurrencyCode): CurrencyCode[]   // current, home, the thirteen the cached set covers (all thirteen with no set), then the set's others by code
  export type DraftMoneyDefaults = { currency: CurrencyCode; rateSource: RateSource; rate: string | null; tripId: string | null }
  export function defaultMoney(input: { wallet: WalletSnapshot; trip: TripDto | null; home: CurrencyCode; records: readonly TransactionDto[] }): DraftMoneyDefaults   // C6, X16
  export function CurrencyPick(props: { selected: CurrencyCode; onPick(code: CurrencyCode): void }): JSX.Element   // the add tray's currency step
  export function CurrencyPickTray(props: { visible: boolean; onClose(): void; selected: CurrencyCode; onPick(code: CurrencyCode): void }): JSX.Element   // the same list in a Tray, for screens only
  // EntryFields gains currency?: CurrencyCode; rateSource?: RateSource; rate?: string | null; homeAmountMinor?: Minor | null; toAmountMinor?: Minor | null; tripId?: string | null
  // AmountStep and ConfirmStep gain onEditRate?: () => void, which P5-T22 passes
  ```
- Rules (tc-add-foreign, tc-offline-rate):
  - Travel entry points, only while `useTravelArea()`: the currency chip `travel.currencyChip`, opening the add tray's `currency` step (inside the tray, never a second Modal, R69; back returns to the amount); `open` starting in the active trip's currency with its removable `TripTagChip` (tc-trip-home's + in ¥); `travel.editRate` and `travel.ownRateLink`, drawn only with `onEditRate`.
  - Any draft in another currency, travel on or off: the keypad follows its exponent (P5-T18d); under the amount, `travel.approx` and `RateLine` (`1 ¥ = ฿0.2312 · เรทอ้างอิงวันที่ 3 พ.ย. 2569`, with `rateText` and the quote's day), and `travel.rateWillUse` when the draft's date is not the quote's day; offline, ConfirmStep shows `travel.offline` · `travel.offlineKeep`, the estimate, `travel.offlineRate` with the cached day and `travel.offlineExplain`; a kept draft reads `≈ … · travel.awaitingRate` until the vault answers.
  - `defaultMoney` gives a cash wallet in a currency other than home its latest exchange's rate (`rateFromAmounts` of that exchange's `to_amount_minor` and home amount) as `exchange`, every other wallet `reference` (default pending owner Q14).
  - The tag drops when the draft's date leaves the trip. The outbox body carries `currency`, `trip_id`, and with an own or exchange rate the rate and `home_currency` (the diary's); a reference draft never carries an estimate. A refusal on `trip_id` reads `travel.tripDatesOutside` (`errors.trip_dates`) or `travel.tripNotFound` (`errors.trip_not_found`), and `errors.rate_unavailable` reads `travel.rateUnavailable`. Rows show no time (W12).
- Copy (`TRAVEL_COPY`, Thai from the boards, English drafts, default pending owner Q13): `travel.currencyChip` สกุลเงิน {name} {code} แตะเพื่อเปลี่ยน, `travel.currencySearch` ค้นหา เช่น เยน หรือ JPY, `travel.currencyPickTitle` เลือกสกุลเงิน (draft), `travel.approx` ≈ {amount}, `travel.rateLine` 1 {symbol} = {rate}, `travel.rateRefDate` เรทอ้างอิงวันที่ {date}, `travel.editRate` แก้เรท, `travel.rateWillUse` จะใช้เรทของวันที่ {date} (draft), `travel.tripChip` ติดป้าย{trip} (the chip's label; its text is the trip's name, as tc-add-foreign draws it), `travel.offline` ออฟไลน์, `travel.offlineKeep` จะเก็บไว้ในเครื่องก่อน, `travel.offlineRate` ใช้เรทล่าสุด ({date}) · จะอัปเดตเมื่อออนไลน์, `travel.offlineExplain` พอต่อเน็ตได้ จะเปลี่ยนเป็นเรทของวันที่ {date} ให้เอง ยอด{home}อาจขยับเล็กน้อย ยอด{foreign}ไม่เปลี่ยน, `travel.ownRateLink` รู้ยอด{home}จริงแล้ว ใส่เอง, `travel.awaitingRate` รออัปเดตเรท, `travel.tripDatesOutside` วันที่นี้อยู่นอกช่วงทริป (draft), `travel.tripNotFound` ทริปนี้ถูกลบไปแล้ว (draft), `travel.rateUnavailable` ยังไม่มีเรทของสกุลนี้ ลองใหม่ภายหลัง (draft).

- [ ] **Step 1: Write the failing tests.** `activeTrip.test.ts`: `a trip is active from its first day through its last` (`2026-11-08` yes, `11-09` no; a deleted trip never); `the picker lists the current, home and §6.10's currencies first, and only those the cached set covers` (a set without KRW leaves KRW out); `a yen cash wallet defaults to its latest exchange's rate` (`0.232558139535`, `exchange`), `a card defaults to the reference rate`. `featureFlags.test.ts`: `travel is a redesign area, off until approved`. `travelArea.render.test.tsx`: `the travel switch is on only when the wallet and travel areas both are` (a probe reading `useTravelArea()` with `EXPO_PUBLIC_REDESIGN` `wallet,travel`, `-wallet,travel` and `wallet,-travel`: true, false, false). `ForeignRecord.render.test.tsx` (the travel area on unless a case says otherwise; both modes and languages; fake resources and diary; cached rates for `2026-11-03`): `the tray starts in the active trip's currency and tags the trip`; `the currency pick renders inside the add tray, with one Modal open`; `a yen amount shows ≈ ฿1,068.14 and the day's reference rate`; `a back-dated draft says the rate of its own day will be used`; `the yen keypad has no decimal key`; `a draft keeps its trip tag only while its date is in the trip`; `offline, confirm shows the estimate and says the rate updates when online` (cached `2026-11-02`: ≈ ฿1,066.30, `2 พ.ย.`); `the kept draft carries no estimate` (the outbox payload has `currency: 'JPY'` and `trip_id`, no `home_amount_minor`); `after the send, the row shows the vault's home amount, not the estimate` (Review Focus 2: once the confirmed record with `106814` syncs, the toast's and the day's figures read ฿1,068.14, not ฿1,066.30); `a refusal on the trip's dates, a deleted trip or the rate says why`; `with the travel area off there is no currency chip, trip tag or rate link, and a yen wallet's draft still shows its ≈ ฿ line` (P2's AmountStep and AddTray suites unchanged); `every chip and key is at least 44 pt, and at AX5 nothing truncates`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/wallet/travel/activeTrip.test.ts src/config/featureFlags.test.ts src/wallet/copy/draftText.test.ts` and `npm run test:render -w gogospend-app -- src/wallet/travel/travelArea.render.test.tsx src/wallet/travel/ForeignRecord.render.test.tsx`. Record the counts.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass,** with the catalogue suite.
- [ ] **Step 5: Mutation check.** Send the estimate as `home_amount_minor`: the draft case fails. Default every wallet to the reference rate: the C6 case fails. Open the currency pick as its own `Tray`: the one-Modal case fails. Let `useTravelArea()` read the travel area alone: the switch case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Record in any currency from the tray, in the active trip's currency, with offline estimates (travel area, off)"`

---

### Task P5-T22: The rate editor and cash exchange

**Starts after:** P5-T20, P5-T21, P2-T15

**Files:**
- Create: `apps/app/src/wallet/travel/rateEdit.ts`, `travel/exchange.ts` (pure), `travel/RateEditStep.tsx`, `travel/ExchangeAmounts.tsx`
- Modify: `src/wallet/add/addFlow.ts` (`AddStep` gains `'rate'`), `add/AddTrayHost.tsx` (passes `onEditRate`, draws the `rate` step), `add/TransferStep.tsx` and `add/TypeSwitchHeader.tsx` (P2-T14 to P2-T16), `src/screens/redesign/entry/entrySave.ts` (P2-T5: the two emitters), `src/dev/catalogue/wallet/travelSections.tsx` (`bw-travel-rate`, `bw-travel-exchange`)
- Test: `apps/app/src/wallet/travel/rateEdit.test.ts`, `travel/exchange.test.ts` (Node), `travel/RateExchange.render.test.tsx`

**Interfaces:**
- Consumes: `rateFromAmounts`, `convertMinor`, `rateText` (P5-T1); `useRates` (P5-T18c); `WalletKeypad`'s `decimal` (P5-T16); `RateLine`, `onEditRate`, `useTravelArea` (P5-T21); `trackRateOverridden`, `trackCashExchanged` (P5-T20); P2-T15's steps and P2-T5's `useEntrySave`.
- Produces:
  ```ts
  export function ownRateFromCharged(input: { amountMinor: Minor; currency: CurrencyCode; chargedMinor: Minor; home: CurrencyCode; referenceRate: string | null }): { rate: string; differenceMinor: Minor | null }
  export function RateEditStep(props: StepProps & { referenceRate: string | null }): JSX.Element   // the add tray's rate step; sets rateSource and homeAmountMinor on the draft
  export function exchangeFacts(input: { paidMinor: Minor; paidCurrency: CurrencyCode; gotMinor: Minor; gotCurrency: CurrencyCode; home: CurrencyCode; referenceRate: string | null }): { realRate: string; referenceValueMinor: Minor | null; differenceMinor: Minor | null; differencePercent: string | null }   // the rate in home per foreign unit; percent of the reference value, one decimal, half-up
  ```
- Rules: `RateEditStep` (tc-rate-edit) is the add tray's `rate` step, opened by `onEditRate` from the amount or confirm step and drawn inside the tray (R69: never a second Modal; back returns to the step that opened it). It offers the day's reference rate (`RateLine` and the home amount) or the charged home amount on `WalletKeypad` with the `.` key; the latter shows the rate got (`rateText`) and the difference, and `travel.rateUse` sets `rateSource: 'own'` with `homeAmountMinor` (X9). A transfer between wallets of two currencies (tc-exchange) takes both amounts (paid on the source's keypad, got on the destination's), shows each wallet after the exchange, the real rate, the reference value and the difference, and says it is not spending; this second amount and `travel.typeExchange` on the type switch are travel entry points. After the acknowledgement or the device commit, `entrySave` calls `trackRateOverridden` for an own rate and `trackCashExchanged` (the currency received) for an exchange, once (R25).
- Copy: `travel.rateTitle` เรทของรายการนี้, `travel.rateQuestion` คิดเป็น{home}ด้วยเรทไหน, `travel.rateReference` ใช้เรทอ้างอิงของวันนั้น, `travel.rateCharged` ใส่ยอดที่ถูกตัดจริงเป็น{home}, `travel.rateChargedHint` ดูได้จากสลิปบัตรหรือแอปธนาคาร, `travel.chargedLabel` ยอดที่ถูกตัดจริง, `travel.rateGot` เรทที่ได้, `travel.rateDiff` ต่างจากเรทอ้างอิง {amount}, `travel.rateOnlyThis` ใช้กับรายการนี้เท่านั้น, `travel.rateUse` ใช้เรทนี้, `travel.decimalKey` จุดทศนิยม, `travel.exchangeTitle` แลกเงิน, `travel.typeExchange` โอน · แลก, `travel.exchangeAfter` หลังแลก, `travel.exchangePaid` จ่ายไป · {name}, `travel.exchangeGot` ได้มา · {name} (each `{name}` is `currency.<CODE>.spoken`: บาท, เยน), `travel.exchangeReal` เรทที่ได้จริง, `travel.exchangeAtReference` ถ้าคิดตามเรทอ้างอิง, `travel.exchangeEquals` เท่ากับ, `travel.exchangeDiff` ครั้งนี้ต่างไป {amount} (ราว {percent}%), `travel.exchangeNotSpending` การแลกเงินไม่นับเป็นรายจ่าย.

- [ ] **Step 1: Write the failing tests.** `rateEdit.test.ts`: `a charged amount gives the rate and the difference` (¥4,620 charged ฿1,075.50 at reference `0.2312`: rate `0.232792207792`, shown `0.2328`, difference `736`). `exchange.test.ts`: `the board's exchange` (฿10,000 for ¥43,000 at `0.2312`: real rate `0.232558139535`, shown `0.2326`, reference value `994160`, difference `5840`, percent `0.6`); `the percent is of the reference value` (฿1,000 for ¥4,000: reference `92480`, difference `7520`, percent `8.1`); `with no cached rate there is no comparison`. `RateExchange.render.test.tsx` (both modes and languages): `the editor offers the reference rate or the charged amount, and keeps the charged amount`; `แก้เรท in the add tray opens the rate step, and the charged amount is saved as an own rate` (through `AddTrayHost`: the draft sent has `rate_source: 'own'`, `home_amount_minor: '107550'` and `home_currency: 'THB'`); `the rate step renders inside the add tray, with one Modal open`; `an exchange takes both amounts, shows both wallets after it and says it is not spending` (บัญชีหลัก ฿14,860 and เงินสดเยน ¥43,000 after); `an own-rate save sends one rate_overridden and an exchange one cash_exchanged, with no amount` (`recordAnalytics()`); `a refused own-rate save sends no rate_overridden`; `private mode hides every amount and the difference`; `every key and choice is at least 44 pt`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/wallet/travel/rateEdit.test.ts src/wallet/travel/exchange.test.ts` and `npm run test:render -w gogospend-app -- src/wallet/travel/RateExchange.render.test.tsx`. Record the counts.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass,** with P2-T15's `AddSteps` suite unchanged for one-currency transfers.
- [ ] **Step 5: Mutation check.** Take the percent of the amount paid: the ฿1,000 case reads `7.5` and fails. Send the event before the acknowledgement: the refused case fails. Open the rate editor as its own `Tray`: the one-Modal case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add the per-record rate editor and cash exchange with both amounts (travel area, off)"`

**Checkpoint E2-P5A** (controller): the foreign record, the currency step, the offline estimate, the tray's refusals, the rate editor and the exchange, taken as P2's checkpoints are (`EXPO_PUBLIC_REDESIGN=catalogue,wallet,travel`, `gogospend://dev/catalogue?section=<id>&theme=<light|dark>&locale=<th|en>&chrome=off`, light and dark Thai and light English, AX5 for the tray), with this plan's calls and each screen's draft copy beside them.

---

### Task P5-T23: Starting a trip, and the trip on Home

**Starts after:** P5-T20, P5-T21, P2-T24

**Delivers:** P5:trips

**Files:**
- Create: `apps/app/src/wallet/travel/tripStart.ts`, `travel/tripCard.ts` (pure), `travel/tripCommands.ts`, `travel/TripStartFlow.tsx`, `travel/TripCard.tsx`, `apps/app/app/spend/trip/new.tsx` (`<Redirect href="/spend" />` unless `useTravelArea()`)
- Modify: `src/wallet/home/WalletHomeScreen.tsx` (P2-T24), `home/AddButton.tsx` (P2-T18), `src/wallet/card/WalletCard.tsx` (P2-T11), `travelSections.tsx` (`bw-travel-trip-start-1`, `-2`, `-3`, `bw-travel-trip-home`, `bw-travel-trip-overlap`)
- Test: `apps/app/src/wallet/travel/tripCard.test.ts` (Node), `travel/TripStart.render.test.tsx`, `travel/TripHome.render.test.tsx`

**Interfaces:**
- Consumes: `createTrip`, `updateTrip`, `deleteTrip`, `tripSummary` (P5-T17); `estimateHomeMinor`, `goldenTripRecords`, `useRates` (P5-T18a, T18c); `trackTripStarted` (P5-T20); `activeTrip`, `CurrencyPickTray`, `useTravelArea` (P5-T21); P2-T24's Home and P2-T19's command rules.
- Produces:
  ```ts
  // tripStart.ts
  export function tripDays(startsOn: string, endsOn: string): number          // both ends counted
  export function dailyBudget(budgetMinor: Minor, days: number): Minor        // rounded down
  export function tripBudgetEstimate(budgetMinor: Minor, currency: CurrencyCode, home: CurrencyCode, rates: RatesTodayDto | null): HomeEstimate | null
  // tripCommands.ts
  export type TripCommand = { kind: 'create'; slot: string; input: CreateTripRequest } | { kind: 'update'; slot: string; id: string; version: number; changes: UpdateTripRequest } | { kind: 'delete'; slot: string; id: string; version: number }
  export type TripOutcome = { kind: 'done' } | { kind: 'unconfirmed'; message: string } | { kind: 'conflict'; current: TripDto | null } | { kind: 'refused'; fields: Readonly<Record<string, string>> }
  export function useTripCommand(): { sending: boolean; send(command: TripCommand): Promise<TripOutcome>; resend(): Promise<TripOutcome | null> }   // P2-T19's rules: one key per command, frozen while unconfirmed, refusals by field; a create's acknowledgement calls trackTripStarted once (R25)
  // tripCard.ts
  export type TripCardModel = { name: string; day: number; days: number; currency: CurrencyCode; spentTripMinor: Minor; estimated: boolean; spentHomeMinor: Minor; budgetMinor: Minor | null; leftMinor: Minor | null }
  export function tripMoneyFromRecords(records: readonly TransactionDto[], trip: TripDto, home: CurrencyCode): TripMoney   // P5-T12's sums over the diary's live tagged records, for offline
  export function tripCardModel(trip: TripDto, money: TripMoney, rates: RatesTodayDto | null, today: string): TripCardModel   // other_home_minor in the trip currency at the cached rate, marked estimated (X17; default pending owner Q6)
  export function TripCard(props: { model: TripCardModel; onOpen?: () => void }): JSX.Element   // P5-T24 passes onOpen
  ```
- Rules: `TripStartFlow` (tc-trip-start): step 1 (drafted) says what a trip does (the + starts in its currency, records are tagged, its spending counts in the month's budget, D40); step 2 (the board) takes the name, the dates (written `1-8 พ.ย. 2569 · 8 วัน`, no en dash), the trip currency and an optional budget with `≈ ฿27,744.00 · วันละประมาณ ¥15,000 · คิดจากเรทอ้างอิงล่าสุด 1 ¥ = ฿0.2312`; step 3 (drafted) reviews and starts. Starting sends `createTrip` through `useTripCommand`; an overlap refusal shows `travel.tripOverlap` on the dates. While a trip is active, Home (tc-trip-home) shows `TripCard` directly above the budget card, after P4-T21's inbox card when it is there (`ทริปญี่ปุ่น · วันที่ 3 จาก 8`, `ใช้ไป ¥38,200 ≈ ฿8,831.84`, `งบทริปเหลือ ¥81,800 จาก ¥120,000`) from `tripSummary`'s totals, or offline from `tripMoneyFromRecords` over the diary's records; the budget card reads `travel.monthWithTrip` and the + is named `travel.addInCurrency`. These are travel entry points. Any wallet card in another currency adds `≈ {home} ตามเรทวันนี้` from `estimateHomeMinor` of its balance (เงินสดเยน ¥43,000 ≈ ฿9,941.60). The trip's figures follow Q14's choices (default pending owner Q14).
- Copy: `travel.tripStartStep` เริ่มทริป · ขั้นที่ {n} จาก 3, `travel.tripWhere` ไปเที่ยวที่ไหน และใช้สกุลอะไร?, `travel.tripWhereHint` ระหว่างทริป ปุ่มจดจะเริ่มที่สกุลนี้ และติดป้ายทริปให้ทุกรายการ, `travel.tripName` ชื่อทริป, `travel.tripDates` วันที่, `travel.tripDays` {n} วัน, `travel.tripCurrency` สกุลเงินของทริป, `travel.tripBudget` งบทริป (ไม่ใส่ก็ได้), `travel.tripPerDay` วันละประมาณ {amount}, `travel.tripRateNote` คิดจากเรทอ้างอิงล่าสุด, `travel.tripIntroTitle` ทริปช่วยอะไรบ้าง (draft), `travel.tripIntroLines` ปุ่มจดเริ่มที่สกุลของทริป ติดป้ายทริปให้ทุกรายการ และยอดทริปนับรวมในงบเดือนนี้ (draft), `travel.tripReviewTitle` พร้อมเริ่มทริปแล้ว (draft), `travel.tripStart` เริ่มทริป (draft), `travel.tripDayOf` วันที่ {day} จาก {days}, `travel.tripSpent` ใช้ไป, `travel.tripLeft` งบทริปเหลือ, `travel.tripOf` จาก {amount}, `travel.monthWithTrip` ใช้ไปเดือนนี้ · รวมทริป, `travel.atTodayRate` ตามเรทวันนี้, `travel.addInCurrency` จดรายการ เป็น{name} ติดป้าย{trip}, `travel.tripOverlap` ช่วงวันที่นี้ซ้อนกับทริปอื่น (draft).

- [ ] **Step 1: Write the failing tests.** `tripCard.test.ts`: `the golden trip on day 3` (`day 3`, `days 8`, `38200`, not estimated, `883184`, left `81800`); `offline, the trip card reads the diary's records: ¥38,200 ≈ ฿8,831.84` (`tripMoneyFromRecords` over `goldenTripRecords()`); `a baht record in a yen trip is estimated into yen at the cached rate`; `tripDays` and `dailyBudget` (`8` and `'15000'` for ¥120,000). `TripStart.render.test.tsx` (both modes and languages): `three steps start a trip and send one trip_started` (`recordAnalytics()`: `{ currency_code: 'JPY', trip_length_days: 8 }`; a refused create sends none); `the budget shows its home estimate and per day` (≈ ฿27,744.00, ¥15,000); `an overlapping trip is refused on its dates, saying travel.tripOverlap`. `TripHome.render.test.tsx`: `Home shows the active trip and the month including it`; `with drafts waiting, the inbox card comes before the trip card` (once P4-T21 has landed); `the + is named for the trip's currency and tag`; `a yen wallet card shows ≈ ฿9,941.60 at today's rate`; `private mode hides every amount on the trip card`; `at AX5 the trip card stacks and nothing truncates`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/wallet/travel/tripCard.test.ts` and `npm run test:render -w gogospend-app -- src/wallet/travel/TripStart.render.test.tsx src/wallet/travel/TripHome.render.test.tsx`. Record the counts.
- [ ] **Step 3: Implement,** with the route.
- [ ] **Step 4: Run them and see them pass,** with P2-T24's `WalletHome` suite unchanged while no trip is active.
- [ ] **Step 5: Mutation check.** Count trip days without the last day: the `8` case fails. Add an estimate as exact: the estimated case fails. Send `trip_started` from the flow before the acknowledgement: the refused case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Start trips and show the active trip on Home (travel area, off)"`

---

### Task P5-T24: The trip summary

**Starts after:** P5-T23

**Files:**
- Create: `apps/app/src/wallet/travel/tripSummary.ts` (pure), `travel/TripSummaryScreen.tsx`, `travel/RatesUsedTray.tsx`, `travel/TripActionsTray.tsx`, `apps/app/app/spend/trip/[id].tsx` (`<Redirect href="/spend" />` unless `useTravelArea()`)
- Modify: `src/wallet/home/WalletHomeScreen.tsx` (the trip card's `onOpen` pushes `/spend/trip/<id>`), `travelSections.tsx` (`bw-travel-trip-summary`, `bw-travel-rates-used`, `bw-travel-trip-private`, `bw-travel-trip-actions`, `bw-travel-trip-refusals`)
- Test: `apps/app/src/wallet/travel/tripSummary.test.ts` (Node), `travel/TripSummary.render.test.tsx`

**Interfaces:**
- Consumes: `tripSummary` (P5-T17); `useTripCommand`, `tripDays`, `tripMoneyFromRecords`, `TripCard` (P5-T23); `RateLine`, `useTravelArea` (P5-T21); P2's `Tray`, `WalletAmount` and `GrowBar`.
- Produces: `tripSummaryModel(summary: TripSummaryDto, today: string): { daysSoFar: number; averageTripMinor: Minor; perDayBudgetMinor: Minor | null; maxDay: { date: string; tripMinor: Minor } | null; top: { categoryId: string; tripMinor: Minor; homeMinor: Minor }[] }` (the average divides by the days from the start through the earlier of today and the end, rounded down; the top three by home amount); `tripSummaryFromRecords(records: readonly TransactionDto[], trip: TripDto, home: CurrencyCode): TripSummaryDto` (P5-T12's rules over the diary's records, read when the summary cannot load offline); `tripShareText(input, hidden: boolean, t: WalletT): string` (no amount when hidden, D41).
- Rules (tc-trip-summary): the dates, `travel.tripSummaryTitle`, `travel.tripSummaryDays`, the total in the trip currency with `≈` home and `travel.tripSumByDay`, `travel.ratesUsed` opening `RatesUsedTray` (each day's rate and source), the budget and what is left, the per-day average, the per-day bars (react-native-svg, P2's W4) with the budget-per-day line and `travel.maxDay`, one accessible chart element reading each day (amounts left out in private mode), the top three categories in both currencies, and `travel.shareTrip`, which shares text (W20; never การ์ด). `TripActionsTray`: edit (step 2's fields), `travel.tripEndToday` (sets `ends_on` to today), `travel.tripDelete` with `travel.tripDeleteNote` (records keep their amounts and lose the tag); a refusal says `travel.tripRecordsOutside` or `travel.tripOverlap` (P5-T23) on the dates, or `travel.tripNotFound` (P5-T21) for a trip deleted elsewhere.
- Copy: `travel.tripSummaryTitle` สรุป{name}, `travel.tripSummaryDays` {days} วัน · จดไว้ {count} รายการ, `travel.tripSpentAll` ใช้ไปทั้งทริป, `travel.tripSumByDay` รวมตามเรทของแต่ละวัน, `travel.ratesUsed` เรทที่ใช้, `travel.tripBudgetLabel` งบทริป, `travel.tripLeftAll` เหลือจากงบ, `travel.perDayAverage` ใช้ต่อวัน · เฉลี่ย, `travel.perDayBudget` งบต่อวัน, `travel.maxDay` มากสุด {date}, `travel.topCategories` หมวดที่ใช้มากสุด, `travel.shareTrip` แชร์สรุปทริป (draft, Q14 (d)), `travel.tripEdit` แก้ไขทริป (draft), `travel.tripEndToday` จบทริปวันนี้ (draft), `travel.tripDelete` ลบทริป (draft), `travel.tripDeleteNote` รายการยังอยู่ครบ แค่ไม่มีป้ายทริปแล้ว (draft), `travel.tripRecordsOutside` มีรายการของทริปอยู่นอกช่วงวันที่ใหม่ (draft).

- [ ] **Step 1: Write the failing tests.** `tripSummary.test.ts`: `the golden trip's first three days` (`daysSoFar` 3, average `12733`, per-day budget `15000`, max day `2026-11-02` `17782`); `the share text names the trip, its days and its spending, and nothing of it in private mode`; `offline, the summary is built from the diary's records` (`tripSummaryFromRecords` over `goldenTripRecords()`: count 13, `38200` and `883184`, the three days). `TripSummary.render.test.tsx` (both modes and languages): `the summary draws both currencies and the days`; `the rates used are each day's` (`0.2317`, `0.2308`, `0.2312`); `the trip card on Home opens the trip summary`; `ending, editing and deleting go through the trip commands`; `an edit leaving a record outside or overlapping another trip, or a trip deleted elsewhere, says why`; `private mode hides every amount and the chart reads no amount`; `every control is at least 44 pt; at AX5 nothing truncates`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/wallet/travel/tripSummary.test.ts` and `npm run test:render -w gogospend-app -- src/wallet/travel/TripSummary.render.test.tsx`. Record the counts.
- [ ] **Step 3: Implement,** with the route.
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.** Divide the average by the trip's eight days: the average case fails. Keep amounts in the private share text: its case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add the trip summary with the rates used and the trip's actions (travel area, off)"`

---

### Task P5-T25: Mixed-currency history, the home-amount explainer and the record's rate

**Starts after:** P5-T21, P2-T26, P2-T28

**Files:**
- Create: `apps/app/src/wallet/travel/recordRate.ts` (pure), `travel/HomeAmountExplainTray.tsx`
- Modify: `src/screens/redesign/history/historyData.ts` (P2-T28: `trip_id`, `currency` and `wallet_ids` reach the query), `src/wallet/history/WalletHistoryScreen.tsx` and `history/FilterTray.tsx` (P2-T28), `src/wallet/records/WalletRecordScreen.tsx` (P2-T26), `apps/app/app/spend/all.tsx` (also reads `trip`, `currency` and `wallets`, R71), `src/spend/v1/testing/fakeResources.ts` (`history` filters by `trip_id`, `currency` and `wallet_ids`), `travelSections.tsx` (`bw-travel-history`, `bw-travel-explain`, `bw-travel-record`)
- Test: `apps/app/src/wallet/travel/recordRate.test.ts` (Node), `travel/MixedHistory.render.test.tsx`

**Interfaces:**
- Consumes: `dayCurrencyLines`, `homeMinorOf` (P5-T18a); `RateLine`, `useTravelArea` (P5-T21); `HISTORY_MAX_WALLETS` (P5-T2).
- Produces: `recordRateFacts(record: TransactionDto, home: CurrencyCode): { original: { minor: Minor; currency: CurrencyCode }; home: Minor; rate: string | null; rateDate: string | null; source: RateSource; beforeHistory: boolean } | null` (null for a record in the home currency; `beforeHistory` when `rate_date` is after the record's date, B17); `HistoryStart` gains `initialTripId?`, `initialCurrency?`, `initialWalletIds?`.
- Rules (tc-history-mixed): the travel entry points, only while `useTravelArea()`, are the pills for the trip, the wallets (several, up to 20, W16 lifted) and the currency (`travel.allCurrencies`), and `travel.explainLink`, which opens the explainer. For any record in another currency, travel on or off: the month card is the server's home total; each day's header shows its home total, then `dayCurrencyLines` joined with ` + ` (`฿1,740.81` · `¥6,180 + ฿312`); a foreign row shows its own amount with `≈` home under it, a kept draft `≈ … · travel.awaitingRate`; no times (W12). The record (P2-T26) shows the original amount, `≈` home, and a rate row: the reference line with its date, `travel.ownRate` or `travel.exchangeRate`, plus `travel.beforeHistory` when it applies, and the trip.
- Copy: `travel.allCurrencies` ทุกสกุล, `travel.walletsCount` {n} กระเป๋า (draft), `travel.explainLink` ยอด{home}คิดยังไง, `travel.explainTitle` ยอด{home}มาจากไหน (draft), `travel.explainBody` แต่ละรายการคิดเป็น{home}ตอนบันทึก ด้วยเรทอ้างอิงของวันนั้น หรือเรทที่คุณใส่เอง แล้วไม่เปลี่ยนอีก ยอดรวมของวัน เดือน และทริป คือผลรวมของยอดเหล่านี้ (draft), `travel.rateRow` เรท, `travel.ownRate` เรทที่ใส่เอง (draft), `travel.exchangeRate` เรทจากการแลกเงิน (draft), `travel.beforeHistory` ใช้เรทเก่าสุดที่มี (draft), `travel.tripRow` ทริป.

- [ ] **Step 1: Write the failing tests.** `recordRate.test.ts`: `a reference record names its rate and day; an own one says so; a home record has none; an old record says it used the earliest rate`. `MixedHistory.render.test.tsx` (P5-T18a's golden trip DTOs, both modes and languages): `a day shows its home total and its currencies` (`฿1,740.81`, `¥6,180 + ฿312`); `trip, currency and several wallets reach the query, and the totals follow` (`history` called with `trip_id`, `currency: 'JPY'`, `wallet_ids`); `opening with ?trip= starts filtered to the trip`; `the explainer opens from the month card`; `a record shows its rate, its day and its trip`; `with the travel area off there are no trip, currency or wallets pills, and a yen row still shows its ≈ ฿ line`; `private mode hides every amount, the day lines included`; `at AX5 amounts wrap below names`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/wallet/travel/recordRate.test.ts` and `npm run test:render -w gogospend-app -- src/wallet/travel/MixedHistory.render.test.tsx`. Record the counts.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass,** with P2-T28's three History suites unchanged while the travel area is off.
- [ ] **Step 5: Mutation check.** Join day lines with home first: the day case fails. Drop `wallet_ids` from the query: the filter case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Show mixed currencies in History and each record's rate (travel area, off)"`

---

### Task P5-T26: The home currency, its confirmation and the budget review; a wallet's currency

**Starts after:** P5-T18c, P5-T18d, P5-T20, P5-T21, P2-T21, P2-T30, P2-T33

**Files:**
- Create: `apps/app/src/wallet/travel/homeCurrencyChange.ts` (the hook), `travel/HomeCurrencyScreen.tsx`, `travel/HomeCurrencyConfirmTray.tsx`, `travel/BudgetReviewNote.tsx`, `apps/app/app/settings/home-currency.tsx` (while `useTravelArea()`, `<SpendV1Provider resources={getSharedV1Resources()}><RatesProvider><HomeCurrencyScreen /></RatesProvider></SpendV1Provider>`; else `<Redirect href="/settings" />`)
- Modify: `src/screens/redesign/account/SettingsScreen.tsx` (one row while `useTravelArea()`, beside P2-T33's lock row) and, if P6B-T3 has landed, `src/wallet/settings/WalletSettingsScreen.tsx` (the same row under the same switch, as P6B-T1's `LinkRow`, for P6B-T3's `every link today's Settings offers is offered here too`), `src/wallet/wallets/WalletFields.tsx` (P2-T21: the currency row at creation), `src/wallet/budget/WalletBudgetScreen.tsx` (P2-T30: the review note), `travelSections.tsx` (`bw-travel-home-currency`, `bw-travel-home-confirm`, `bw-travel-home-refused`, `bw-travel-budget-review`, `bw-travel-wallet-currency`)
- Test: `apps/app/src/wallet/travel/HomeCurrency.render.test.tsx`, `src/wallet/wallets/NewWallet.render.test.tsx` (the currency cases)

**Interfaces:**
- Consumes: `homeCurrencyPreview`, `setHomeCurrency` (P5-T17); `DiaryView.homeCurrency` (P5-T18a); `RatesProvider` (P5-T18c); `WalletForm.currency` (P5-T18d); `trackHomeCurrencySet` (P5-T20); `pickerCurrencies`, `CurrencyPickTray`, `useTravelArea` (P5-T21); P2-T21's `WalletFields` and P2-T30's budget screen.
- Produces: `useHomeCurrencyChange(): { preview(currency: CurrencyCode): Promise<HomeCurrencyPreview>; status: 'idle' | 'sending' | 'unconfirmed' | 'refused' | 'conflict' | 'done'; send(currency: CurrencyCode): Promise<boolean>; resend(): Promise<boolean> }` (one key per change; the settings version from the diary; online only); `BUDGET_REVIEW_NAME = 'budget-review'` (device store: the month list to review, cleared when dismissed).
- Rules (tc-default-currency, C8): the list has the search, the current currency first with `travel.homeCurrent`, then §6.10's order, then the feed's others (default pending owner Q13); choosing another opens the confirm tray with the preview's counts (records to recompute, own rates that become reference rates, budget months that convert) and the line that original amounts do not change; it is disabled offline. After the acknowledgement: `trackHomeCurrencySet({ currencyCode })`, the diary's next sync meets 410 and resyncs (1A's rules), and the budget screen shows `BudgetReviewNote` until dismissed. A refusal for the cap says `travel.homeOverCap`. A new wallet's form adds the currency row (default the home currency, `CurrencyPickTray`, the note that it cannot change later), which sets `WalletForm.currency` and resets the opening keypad to that currency's exponent; editing a wallet shows its currency as text.
- Copy: `travel.homeTitle` สกุลเงินหลัก, `travel.homeBody` ยอดรวม งบ และสรุปทั้งหมดจะแสดงเป็นสกุลนี้, `travel.homeAnyTime` เปลี่ยนได้ทุกเมื่อ, `travel.homeNote` ยอดรวมย้อนหลังจะแสดงใหม่ด้วยเรทของวันที่ในแต่ละรายการ ส่วนยอดเงินเดิมของรายการไม่เปลี่ยน, `travel.homeListLabel` เลือกสกุลเงินหลัก, `travel.homeCurrent` ตอนนี้, `travel.homeConfirmTitle` เปลี่ยนเป็น{name}? (draft), `travel.homeConfirmRecords` {n} รายการจะคิดเป็น{name}ใหม่ ด้วยเรทของวันที่ในแต่ละรายการ (draft), `travel.homeConfirmOwn` {n} รายการที่ใส่เรทเอง จะใช้เรทอ้างอิงแทน (draft), `travel.homeConfirmBudgets` งบ {n} เดือนจะแปลงด้วยเรทวันนี้ ตรวจได้หลังเปลี่ยน (draft), `travel.homeConfirm` เปลี่ยนสกุลเงินหลัก (draft), `travel.needsOnline` ต้องต่อเน็ตก่อนเปลี่ยน (draft), `travel.budgetReview` งบแปลงเป็น{name}แล้ว ลองดูว่ายังพอดีไหม (draft), `travel.walletCurrency` สกุลเงินของกระเป๋า (draft), `travel.walletCurrencyFixed` เปลี่ยนสกุลเงินไม่ได้หลังสร้างกระเป๋า (draft), `travel.homeOverCap` บางยอดจะเกินยอดสูงสุดของสกุลนี้ จึงเปลี่ยนไม่ได้ (draft).

- [ ] **Step 1: Write the failing tests.** `HomeCurrency.render.test.tsx` (both modes and languages): `the list puts the current currency first, then §6.10's order`; `the routed screen, mounted in the settings layout without the harness, lists a feed currency outside the thirteen` (a cached set holding CHF); `search finds a currency by Thai name or code` (`เยน`, `JPY`); `confirming shows the preview's counts and sends one change with the settings version`; `the change is disabled offline`; `an acknowledged change sends one home_currency_set and opens the budget review`; `a refused or stale change says why and changes nothing` (`errors.home_amount_over_cap` reads `travel.homeOverCap`); `every row is at least 44 pt; at AX5 nothing truncates`. `NewWallet.render.test.tsx`: `a new wallet takes the home currency unless another is picked, and its create says so`; `a yen wallet's opening ¥43,000 is sent as opening_minor '43000' with currency 'JPY'` (picked in a THB home; the keypad resets to whole yen); `editing a wallet shows its currency and cannot change it`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:render -w gogospend-app -- src/wallet/travel/HomeCurrency.render.test.tsx src/wallet/wallets/NewWallet.render.test.tsx`. Record the counts.
- [ ] **Step 3: Implement,** with the route and the Settings row.
- [ ] **Step 4: Run them and see them pass,** with P2-T21's and P2-T30's suites unchanged while the travel area is off.
- [ ] **Step 5: Mutation check.** Send without the version: the stale case fails. Send the event before the acknowledgement: the refused case sends it and fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Let a person pick their home currency and a new wallet's currency (travel area, off)"`

**Checkpoint E2-P5B** (controller), taken as E2-P5A: trip start (all three steps), Home during a trip, the trip summary, its rates, its actions and refusals, mixed History and the explainer, the record's rate, the home currency with its confirmation, refusal and the budget review, and a new wallet's currency.

---

### Task P5-T27a: Bun AI in the right currency: the contract and the edge (B7)

**Starts after:** P3-T6 (P3:ai-results), P3-T9, P3-T10, P3-T11, P5-T10, P5-T11

**Files:**
- Modify: `packages/contracts/src/v1/ai.ts` (`AiDraft.currency?: CurrencyCode | null`, `AiFigure.currency?: CurrencyCode`, `BunFact.currency?: CurrencyCode`, `AiParseRequest.currency?: CurrencyCode`), `v1/quickText.ts`, `apps/edge/src/server/ai/grounding.ts`, `fact-text.ts`, `prompts.ts`, `drafts.ts`, `apps/edge/src/v1/ai/ask.ts`, `service.ts`, `tools.ts`, `slip-read.ts`, `apps/edge/src/vault/ai.ts` (1B-T7's `aiDayFacts` and `aiTool`), `apps/app/src/spend/v1/ai/aiResources.ts` (the app's validators take the new optional keys, C2)
- Test: `apps/edge/test/quick-text.test.ts`, `ai-grounding.test.ts` (Node), `test/workers/ai-currency.test.ts`, `test/workers/slip-read.test.ts` (two cases), `apps/app/src/spend/v1/ai/aiResources.test.ts`

**Interfaces:**
- Consumes: `moneyText`, `CURRENCY_SYMBOLS` (P5-T1); `homeCurrency` (P5-T5); `seedGoldenTrip` (P5-T11); P3's model routing and AI results.
- Produces: `QuickTextContext.currency?: CurrencyCode` (the tray's); `QuickTextGuess.currency: CurrencyCode | null` (the symbol, Thai spoken name or code of THB or one of the thirteen, next to the amount; ¥ is CNY only when `QuickTextContext.currency` is CNY, else JPY); `draftFromQuickText` sets `AiDraft.currency` to the written currency, else the context's, else THB, and reads the amount in that currency's units; `formatMoneyText(minor, currency)` beside `formatBaht`. `aiDayFacts` (each `BunFact.currency`) and `aiTool`'s figures and sums read `coalesce(home_amount_minor, amount_minor)` and carry the home currency; the grounding check reads numbers written in it. The parse prompt names `AiParseRequest.currency` (the tray's) as the default and asks for the written currency's ISO code (or null) and an amount in its units, through `PARSE_SCHEMA`'s own draft item with a nullable `currency` (`SLIP_SCHEMA` keeps `DRAFT_ITEM`); given null, the parse sanitizer reads that amount in `AiParseRequest.currency`'s units, else THB's, and names that currency; it grounds each amount on the sentence's numbers read in the draft currency's minor units (`numbersIn(text, currency = 'THB')`). The phase 5 release carries this task, so P5-T2's minimum covers it (C5); the receipt says so.
- Slips stay baht (D24, default pending owner Q15): a single slip read's drafts (`readSlipImage`) carry `currency: 'THB'`; `SLIP_SYSTEM`, `SLIP_SCHEMA`, the `VOICE` text the slip prompts include, `bahtToSatang` and `sanitizeDrafts`' `amount_baht` path stay byte for byte (P3-T22, P4-T4), so the currency wording goes only into `PARSE_SYSTEM`, `NOTE_SYSTEM` and `ASK_SYSTEM`, under a voice line for those three that does not say baht.

- [ ] **Step 1: Write the failing tests:** `quick-text.test.ts`: `'ราเมน 1200 เยน'` reads ¥1,200 in `JPY`, `'¥4,620 ร้านยา'` reads `JPY`, and `CNY` when the context's currency is `CNY`; `'กาแฟ 65'` has `currency: null` and `'กาแฟ 65 บาท'` `THB`; `'ราเมน 1200'` with a `JPY` context drafts `amount_minor '1200'` in `JPY`; `ai-grounding.test.ts`: `a yen figure is grounded when it was read` (`¥303`); `ai-currency.test.ts`: `after the home becomes yen, Ask Bun's figures carry JPY and home amounts` (the fake model quoting `¥303` keeps `source: 'ai'`), `a parse whose model names no currency reads its amount in the request's JPY`, and P3's `no prompt carries the account, the session or a balance` run again on `seedGoldenTrip`, also finding no trip or wallet id; `slip-read.test.ts`: `a single slip read's drafts are THB`, and `the slip prompt and schema are unchanged` (a guard: the SHA-256 of `SLIP_SYSTEM` and of `JSON.stringify(SLIP_SCHEMA)` equal their values before this task); `aiResources.test.ts`: `AI results may name their currency, and a lowercase code is invalid_response`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge -- test/quick-text.test.ts test/ai-grounding.test.ts`, `npm run test:edge:workers -- test/workers/ai-currency.test.ts test/workers/slip-read.test.ts` and `npm run test:unit -w gogospend-app -- src/spend/v1/ai/aiResources.test.ts`. Record the counts.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass,** with P3's AI suites unchanged for baht.
- [ ] **Step 5: Mutation check.** Ground against original amounts: the yen-home case fails. Read ¥ as JPY whatever the context: the CNY case fails. Read a bare amount as satang in a `JPY` context: the ราเมน case fails. Leave a slip read's drafts without a currency: the THB case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Give Bun's facts, answers and parsed amounts the right currency"`

---

### Task P5-T27b: Bun AI in the right currency on the phone (B7)

**Starts after:** P5-T27a, P5-T21, P3-T17, P3-T18, P3-T20

**Files:**
- Modify: `apps/app/src/spend/v1/ai/tellBun.ts` (`applyDraft`; `TellBunContext.currency?`, the tray's), `tellBunDrafts.ts` (sends the tray's currency), `oftenLogged.ts`, `draftReview.ts` (P3-T5: `DraftFields.currency: string | null`), `src/wallet/add/draftOrigin.ts` (P3-T13's `draftFieldsOf` fills it), `src/wallet/bunai/TellStep.tsx` (P3-T18), `askModel.ts` and `WalletAskScreen.tsx` (P3-T20), `src/screens/redesign/ai/TellBunSheet.tsx` (today's sheet, which P2-T16's tray shows while the `bunai` area is off), `src/wallet/add/AddTrayHost.tsx` (the sheet's context carries the tray's currency)
- Test: `apps/app/src/spend/v1/ai/tellBun.test.ts`, `oftenLogged.test.ts`, `draftReview.test.ts` (Node), `src/wallet/bunai/WalletAsk.render.test.tsx`, `TellStep.render.test.tsx`, `SlipRead.render.test.tsx` (P3-T17), `src/wallet/add/AddTray.render.test.tsx`, `src/screens/redesign/ai/TellBunSheet.render.test.tsx`

**Interfaces:**
- Consumes: P5-T27a's fields; `activeTrip` (P5-T21); `moneyText` (P5-T1); `formatMoney`, `WalletAmount`'s `currency` (P5-T16).
- Rules: `applyDraft`, and so P3-T13's `applyAiDraft`, sets the tray's currency from a draft that has one and keeps the tray's (the active trip's) otherwise, so a slip read's THB draft (P5-T27a) fills a yen trip's tray in baht; with the travel area off a draft's currency is still kept and shown, so the record is right (X13). A changed currency counts as one edited field in the draft review. Each Tell Bun draft is drawn in `draft.currency ?? the tray's currency`, in `TellStep` (its total one amount per currency, joined with ` + `) and in `TellBunSheet` (which also sends the tray's currency to the parse). Tell Bun's chips (`oftenLogged`) come from records in the tray's currency, worded with `moneyText` in it (`bahtWords` stays for THB); Ask Bun's figures show `AiFigure.currency ?? 'THB'`.

- [ ] **Step 1: Write the failing tests:** `tellBun.test.ts`: `a draft in yen makes the tray yen; one without a currency keeps the trip's; ราเมน 1200 read in a yen trip is ¥1,200, never ¥120,000`; `draftReview.test.ts`: `a changed currency counts as one edited field`; `oftenLogged.test.ts`: `during a yen trip the chips are yen records, in yen`; `WalletAsk.render.test.tsx`: `in a yen home Ask Bun's figures show yen`; `SlipRead.render.test.tsx`: `during a yen trip, a slip read of ฿1,250 fills confirm as ฿1,250.00, never ¥125,000`; in a baht tray with the travel area off, `TellStep.render.test.tsx`: `ราเมน 1200 เยน ชาเขียว 300 เยน shows ¥1,200, ¥300 and ¥1,500, never ฿12.00` (the fake model answers both drafts, saved with `currency: 'JPY'`), `TellBunSheet.render.test.tsx`: `ราเมน 1200 เยน ชาเขียว 300 เยน shows ¥1,200 on the sheet, never ฿12.00`, and `AddTray.render.test.tsx`: `after Use this on ราเมน 1200 เยน the amount step shows ¥1,200 with no decimal key, and the draft saves amount_minor '1200' with currency 'JPY'`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/spend/v1/ai/tellBun.test.ts src/spend/v1/ai/oftenLogged.test.ts src/spend/v1/ai/draftReview.test.ts` and `npm run test:render -w gogospend-app -- src/wallet/bunai/WalletAsk.render.test.tsx src/wallet/bunai/TellStep.render.test.tsx src/wallet/bunai/SlipRead.render.test.tsx src/wallet/add/AddTray.render.test.tsx src/screens/redesign/ai/TellBunSheet.render.test.tsx`. Record the counts.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass,** with P3's AI suites unchanged for baht.
- [ ] **Step 5: Mutation check.** Default a draft without a currency to THB: the trip case fails. Word a yen chip with `bahtWords`: the chip case fails. Draw a Tell Bun draft with `formatMinor`: the ราเมน case reads ฿12.00 and fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Give Bun's drafts, chips and figures the right currency on the phone"`

---

### Task P5-T28: The phase 5 proof: a golden trip that adds up to the satang

**Starts after:** P5-T12, P5-T13, P5-T24

**Files:**
- Create: `apps/edge/test/workers/golden-trip.test.ts`, `apps/app/src/wallet/travel/goldenTrip.test.ts` (Node)

**Interfaces:**
- Consumes: `seedGoldenTrip` (P5-T11); `goldenTripRecords` (P5-T18a) and the app's models (P5-T18b); `tripCardModel`, `tripBudgetEstimate` (P5-T23); `tripSummaryModel` (P5-T24).

- [ ] **Step 1: Write the tests.**
  - `golden-trip.test.ts` (Workers runtime, on `seedGoldenTrip`): `every record froze its home amount at its day's rate` (in order: `59779`, `127435`, `127898`, `14782`; `78472`, `184178`, `69240`, `74318`, `4201`; `106814`, `27744`, `8323`; Grab `31200`; the exchange `1000000`); `day, trip and month totals are the sums of their stored rows` (each day's `expense_minor` equals the sum of its items' `home_amount_minor`: `329894`, `410409`, `174081`, and `142881` for day 3 in yen; the trip summary `38200` and `883184`; November `914384` with `885616` of the budget left; for every history and summary read of the month, the totals equal the sums over the rows they cover); `balances stay in each wallet's currency` (bank `1486000`, card `-914384`, yen cash `43000`); `the THB golden diary still reconciles` (1A-T5's case, run in this file's suite as well).
  - `goldenTrip.test.ts` (the app's models): `History's day 3 reads ฿1,740.81 with ¥6,180 + ฿312`; `the trip card reads ¥38,200 ≈ ฿8,831.84 with ¥81,800 of ¥120,000 left`; `the month reads ฿9,143.84 of ฿18,000, ฿8,856.16 left`; `the yen cash card reads ≈ ฿9,941.60 at the cached 3 November rate`; `the trip start estimate for ¥120,000 reads ≈ ฿27,744.00`; the app's THB golden seed suites pass unchanged.
- [ ] **Step 2: Run them.** Run: `npm run test:edge:workers -- test/workers/golden-trip.test.ts` and `npm run test:unit -w gogospend-app -- src/wallet/travel/goldenTrip.test.ts`. They pass on the merged tasks; any failure is a defect fixed test-first in its owning task.
- [ ] **Step 3: Mutation check.** Convert a day's yen at once in the vault's history totals: day 3 reads `142882` and the proof fails. Sum `amount_minor` in the app's day model: the History case fails.
- [ ] **Step 4: Receipt.** The figures follow Q14's choices (default pending owner Q14). §8's proof on a real phone ("a trip adds up to the satang": a development build against local `wrangler dev` with the fixture feed) is SKIPPED until the development build and the D33 accounts exist; the hosted checks (a deployed Cron filling five years from the D31 provider, and the golden trip against staging) are SKIPPED until D31 and the D33 accounts exist.
- [ ] **Step 5: Gate, commit.** `git commit -m "Prove a golden trip adds up to the satang in the vault and in the app's models"`

---

### Task P5-T29: After E2: route the travel screens and move their copy into the catalogs

**Starts after:** P5-T22, P5-T24, P5-T25, P5-T26, P2-T38, and the owner's approval of E2-P5A and E2-P5B

**Files:**
- Modify: `apps/app/src/config/featureFlags.ts` and `featureFlags.test.ts` (`'travel'` joins `APPROVED`), `src/messages/en.json` and `th.json` (every approved `travel.*` line under a camelCase `walletTravel…` key, and `currency.*` under `walletCurrency…`), `src/i18n/catalogs.test.ts`, `src/wallet/travel/copy.ts` and `src/wallet/currency/copy.ts` (each becomes `{ '<area>.<name>': '<English>' }`, as P2-T38 does), `src/wallet/copy/allCopy.ts` (P2-T38's `ALL_COPY` gains both tables, so P2-T38's `no approved English line takes another key's Thai` covers them), `src/wallet/copy/draftText.test.ts` (`travel.approx` and `travel.rateLine` leave `LATIN_LINES`; both moved tables are checked as English only), every `useTravelCopy()` call and every `tableT(CURRENCY_COPY, …)` reader (`money/walletMoney.ts`, `money/WalletAmount.tsx` and those of P5-T18d's two lines), now `useWalletCopy()`; `travel/useTravelCopy.ts` is deleted
- Modify: `docs/implementation/premium-progress.md` (the phase 5 closing receipt with the owner's words)
- Test: `apps/app/src/config/featureFlags.test.ts`, `src/i18n/catalogs.test.ts`, `src/wallet/travel/travelCopy.render.test.tsx` (new: the `useWalletCopy` case)

**Interfaces:**
- Consumes: P2-T38's `useWalletCopy`, `ALL_COPY` and catalog script; `TRAVEL_COPY` (P5-T21) and `CURRENCY_COPY` (P5-T16).
- Produces: the `travel` area approved; every travel and currency line in `en.json` and `th.json`.

- [ ] **Step 1: Write the failing tests:** `the travel area is on by default and -travel turns it off`; `every travel and currency line in use is in en.json and th.json, with the same placeholders`; `every travel and currency line reads its approved Thai through useWalletCopy in th`; `no travel copy table holds Thai text any more`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/config/featureFlags.test.ts src/i18n/catalogs.test.ts` and `npm run test:render -w gogospend-app -- src/wallet/travel/travelCopy.render.test.tsx`. Record the counts.
- [ ] **Step 3: Move the copy** with the owner's E2 edits applied (a scratchpad script writes the catalog entries from the tables; its output is reviewed by hand), giving each line English that no other `en.json` key uses unless that key's Thai is the same; switch the hook and approve the area.
- [ ] **Step 4: Run them and see them pass,** then the app gate. Every travel screen now shows by default; the routes stop redirecting.
- [ ] **Step 5: Mutation check.** Remove one Thai entry: `catalogs.test.ts` fails.
- [ ] **Step 6: Receipt, commit.** The phase 5 proof on a phone stays SKIPPED (P5-T28). `git commit -m "Switch on the travel screens after the owner's E2 approval, and move their copy into the catalogs"`

---

## Self-review notes (for the executor)

- **Spec coverage, §8 phase 5:** the rate feed behind an interface, the D31 provider waiting on the owner (P5-T6, T7, T15); the contract's currency fields (P5-T1 to T3); wallet currencies (P5-T4, T5, T18d, T26); trips (P5-T3, T9, T12, T23, T24); own rates and exchange (P5-T10, T22); the home currency change (C8: P5-T13, T26); the proof (P5-T28). §6.10: units and rates (P5-T1), reference rates and five years (P5-T6, T7), who sets the rate (P5-T8, T10), offline (P5-T18a, T18c, T21), totals and budgets with D40 (P5-T11, T12, T18b, T18d), the picker (P5-T21, T26). §6.6 (P5-T2, T3, T6, T13); §6.12's export columns (P5-T14) and Cron (P5-T7); §7's travel events and `home_currency` (P5-T20) and pack keys in server events (P5-T5); §5.2's nine tc-* boards (P5-T21 to T26); P2's phase 5 handoff, R64 (P5-T19); B7 (P5-T27a, T27b); D24 for slips and statements (P5-T10, T18e, T27a).
- **Not in phase 5, on purpose:** slip import and cashback in other currencies (D24); a rate push (X14); a trip image to share (W20: not planned in v1, Q14 (d)); remote rollout flags (P6B, B25); staging, production and the real provider's account (P6C, D33).
