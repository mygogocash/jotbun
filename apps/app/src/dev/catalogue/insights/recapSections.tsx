// The month recap in each of its states (redesign R5, development only),
// drawn by the real RecapScreen on fakes. NOT registered in registry.tsx yet:
// R5 waits for E2 checkpoint 3.
//
// The fakes are the golden diary with five earlier months added (April to
// August 2026), on the catalogue's clock (29 September 2026, so September is
// this month, so far). Thai, dark mode and the bun's intensity are the
// catalogue's own switches, so every state below can be seen in each.
import type { BudgetDto, CategoryDto, CategoryTotal, MonthSummary, TransactionDto, WalletSnapshot } from '@gogospend/contracts';

import { RecapScreen } from '@mobile/screens/redesign/insights/RecapScreen';
import type { SpendV1Resources } from '@mobile/spend/v1/resources';
import { BUILTINS, createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
import type { CatalogueSection } from '../registry';
import { CATALOGUE_NOW, alwaysFails, deviceDiary, draftEntry, queued } from '../screenFixtures';
import type { FakeResources } from '../screenFixtures';
import { screenSection } from '../screenSection';
import type { ScreenFixture, ScriptStep, Translate } from '../screenSection';

const golden = goldenSeed();
const [CASH, DAILY] = golden.wallets as [WalletSnapshot, WalletSnapshot];
const [FOOD, TRAVEL, BILLS, SALARY, GIFT] = BUILTINS as [CategoryDto, CategoryDto, CategoryDto, CategoryDto, CategoryDto];

let counter = 0;
function record(occurred_on: string, amount_minor: string, kind: { type: 'expense' | 'income'; category: string; wallet: string; note?: string } | { type: 'transfer' }): TransactionDto {
  counter += 1;
  // After the golden records' ids (…0001 to …0004).
  const common = { id: `0000000b-0000-4000-8000-${String(100 + counter).padStart(12, '0')}`, amount_minor, occurred_on, note: null, merchant: null, deleted_at: null, version: 1 };
  if (kind.type === 'transfer') return { ...common, type: 'transfer', source_wallet_id: CASH.id, destination_wallet_id: DAILY.id };
  return { ...common, type: kind.type, wallet_id: kind.wallet, category_id: kind.category, note: kind.note ?? null };
}
const spend = (category: string, wallet = CASH.id, note?: string) => ({ type: 'expense' as const, category, wallet, note });
const earn = (category: string, wallet = DAILY.id) => ({ type: 'income' as const, category, wallet });

/**
 * April to August 2026, around the golden September:
 * - April: nothing.
 * - May: one lunch, ฿500.00.
 * - June: more out than in (rent and a trip, ฿15,268.00, against ฿10,000.00 in).
 * - July: money in only (salary and a gift, ฿28,500.00).
 * - August: a full month: ฿13,962.51 out over three categories, ฿29,500.00 in,
 *   seven days logged (a move on the 28th counts as a day, never as money).
 */
export const RECAP_RECORDS: readonly TransactionDto[] = [
  record('2026-05-14', '50000', spend(FOOD.id)),
  record('2026-06-01', '1226800', spend(BILLS.id, DAILY.id, 'Rent')),
  record('2026-06-18', '300000', spend(TRAVEL.id)),
  record('2026-06-25', '1000000', earn(SALARY.id)),
  record('2026-07-10', '50000', earn(GIFT.id, CASH.id)),
  record('2026-07-25', '2800000', earn(SALARY.id)),
  record('2026-08-01', '2800000', earn(SALARY.id)),
  record('2026-08-02', '1226800', spend(BILLS.id, DAILY.id, 'Rent')),
  record('2026-08-05', '25000', spend(FOOD.id)),
  record('2026-08-05', '6551', spend(FOOD.id)),
  record('2026-08-12', '48000', spend(TRAVEL.id)),
  record('2026-08-20', '150000', earn(GIFT.id)),
  record('2026-08-21', '89900', spend(BILLS.id, DAILY.id)),
  record('2026-08-28', '100000', { type: 'transfer' }),
];

/**
 * The fake's month summary has no per-category totals, so this adds them as
 * the server gives them: each category's confirmed money in the month.
 */
export function withCategoryTotals(fake: FakeResources): SpendV1Resources {
  const summary = async (month: string): Promise<MonthSummary> => {
    const base = await fake.resources.summary(month);
    const totals = new Map<string, CategoryTotal>();
    for (const item of fake.records.values()) {
      if (item.deleted_at || item.type === 'transfer' || !item.occurred_on.startsWith(`${month}-`)) continue;
      const before = totals.get(item.category_id);
      const sum = BigInt(before?.total_minor ?? '0') + BigInt(item.amount_minor);
      totals.set(item.category_id, { category_id: item.category_id, type: item.type, total_minor: sum.toString() });
    }
    return { ...base, categories: [...totals.values()] };
  };
  return { ...fake.resources, summary };
}

/** A month's overall budget for the fake. */
export const recapBudget = (month: string, limitMinor: string): BudgetDto => ({
  id: `0000000d-0000-4000-8000-0000000${month.replace('-', '')}`, month, overall_limit_minor: limitMinor, category_limits: [], version: 1,
});

/** The golden diary with the recap's earlier months, its categories, and any budgets or extra records. */
export function recapFake({ budgets = [], extra = [], records }: { budgets?: BudgetDto[]; extra?: TransactionDto[]; records?: TransactionDto[] } = {}) {
  const wallets = golden.wallets.map((wallet) => ({ ...wallet, tracking_start: '2026-01-01' }));
  const fake = createFakeResources({ wallets, records: records ?? [...golden.records, ...RECAP_RECORDS, ...extra], categories: BUILTINS, budgets });
  return { fake, resources: withCategoryTotals(fake) };
}

// ---------------------------------------------------------------------------
// The sections

/** The recap's fakes: no device diary unless a state needs one. */
const fakes = (options: Parameters<typeof recapFake>[0] = {}): ScreenFixture => ({ resources: recapFake(options).resources, diary: null });
const recap = (month: string) => () => <RecapScreen month={month} now={CATALOGUE_NOW} />;
const receipt = (): ScriptStep[] => [{ waitFor: 'receipt-slip' }];
const showing = (text: (tc: Translate) => string) => (tc: Translate): ScriptStep[] => [{ waitFor: text(tc) }];

export const RECAP_SECTIONS: readonly CatalogueSection[] = [
  screenSection({
    id: 'recap-month',
    title: 'Recap: a month',
    // August against a ฿18,000.00 budget, with the cheer bun and six months of bars.
    fixture: () => fakes({ budgets: [recapBudget('2026-08', '1800000')] }),
    script: receipt,
    render: recap('2026-08'),
  }),
  screenSection({
    id: 'recap-over-budget',
    title: 'Recap: over budget',
    fixture: () => fakes({ budgets: [recapBudget('2026-08', '1000000')] }),
    script: receipt,
    render: recap('2026-08'),
  }),
  screenSection({ id: 'recap-money-in-only', title: 'Recap: money in only', fixture: () => fakes(), script: receipt, render: recap('2026-07') }),
  screenSection({ id: 'recap-more-out', title: 'Recap: more out than in', fixture: () => fakes(), script: receipt, render: recap('2026-06') }),
  screenSection({ id: 'recap-this-month', title: 'Recap: this month so far', fixture: () => fakes(), script: receipt, render: recap('2026-09') }),
  screenSection({
    id: 'recap-on-device',
    title: 'Recap: entries on this device',
    // A ฿65.00 lunch still saving on this phone: mentioned, never added in.
    fixture: () => ({ resources: recapFake().resources, diary: deviceDiary({ outbox: [queued(draftEntry(), 'unsent')] }).diary }),
    script: receipt,
    render: recap('2026-09'),
  }),
  screenSection({
    id: 'recap-empty',
    title: 'Recap: empty month',
    fixture: () => fakes(),
    script: showing((tc) => tc('No entries in this month')),
    render: recap('2026-04'),
  }),
  screenSection({
    id: 'recap-loading',
    title: 'Recap: loading',
    // The month's summary never answers.
    fixture: () => {
      const { fake, resources } = recapFake();
      fake.hold('summary');
      return { resources, diary: null };
    },
    render: recap('2026-08'),
  }),
  screenSection({
    id: 'recap-offline',
    title: 'Recap: offline',
    fixture: () => ({ resources: alwaysFails(recapFake().resources, 'summary', 'network'), diary: null }),
    script: showing((tc) => tc('Try again')),
    render: recap('2026-08'),
  }),
  screenSection({
    id: 'recap-problem',
    title: 'Recap: update needed',
    fixture: () => ({ resources: alwaysFails(recapFake().resources, 'summary', 'upgrade_required'), diary: null }),
    script: () => [{ waitFor: 'recap-problem' }],
    render: recap('2026-08'),
  }),
];
