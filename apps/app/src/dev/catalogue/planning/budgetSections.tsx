// Budget in each of its states (R4 Planning, development only), drawn by the
// real BudgetScreen on fakes and reached with the same steps as
// BudgetScreen.render.test.tsx: the same keys, the same rows, the same held,
// failed, refused or overtaken saves. Online throughout: Budget reads and
// writes through the API. Not registered yet: the main session adds
// BUDGET_SECTIONS to `registry.tsx`.
import type { BudgetDto, CategoryDto, TransactionDto } from '@gogospend/contracts';

import { BudgetScreen } from '@mobile/screens/redesign/planning/BudgetScreen';
import { BUILTINS, createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
import { categoryName } from '@mobile/spend/v1/viewModels';
import type { CatalogueSection } from '../registry';
import { CATALOGUE_NOW, GOLDEN, alwaysFails, expense } from '../screenFixtures';
import { keypadSteps, screenSection } from '../screenSection';
import type { ScreenFixture, ScriptStep, Translate } from '../screenSection';

type FakeResources = ReturnType<typeof createFakeResources>;
type BudgetFixture = ScreenFixture & { readonly fake: FakeResources };

const SEPT = '2026-09';
const FOOD = GOLDEN.categories.food;
const BILLS = GOLDEN.categories.bills;
/** 27 September: the rent has just gone out, four days to go. */
const SEPT_27 = new Date('2026-09-27T03:00:00Z');
/** 30 September: the month's last day. */
const SEPT_30 = new Date('2026-09-30T03:00:00Z');

/** September's budget: the plan's ฿18,000.00, with Food and Bills limits unless told otherwise. */
function septBudget(limitMinor: string, limits: readonly (readonly [CategoryDto, string])[] = [[FOOD, '300000'], [BILLS, '1000000']], version = 1): BudgetDto {
  return {
    id: '0000000d-0000-4000-8000-0000000000b1', month: SEPT, overall_limit_minor: limitMinor, version,
    category_limits: limits.map(([category, limit]) => ({ category_id: category.id, limit_minor: limit })),
  };
}

/** The golden diary with the built-in categories, any budgets, and wallets tracked from `trackingStart`. */
function budgetFake(options: { budgets?: BudgetDto[]; records?: TransactionDto[]; trackingStart?: string } = {}): FakeResources {
  const seed = goldenSeed();
  const wallets = options.trackingStart ? seed.wallets.map((wallet) => ({ ...wallet, tracking_start: options.trackingStart as string })) : seed.wallets;
  return createFakeResources({ wallets, records: [...seed.records, ...(options.records ?? [])], categories: BUILTINS, budgets: options.budgets ?? [] });
}

const online = (fake: FakeResources = budgetFake()): BudgetFixture => ({ resources: fake.resources, diary: null, fake });
const withFake = (change: (fake: FakeResources) => void, options?: Parameters<typeof budgetFake>[0]) => (): BudgetFixture => {
  const fake = budgetFake(options);
  change(fake);
  return online(fake);
};
const budgetOn = (now: Date) => () => <BudgetScreen now={now} />;
const budget = budgetOn(CATALOGUE_NOW);

/** The month view has loaded. */
const monthReady = () => [{ waitFor: 'budget-total' }];
/** The no-budget view, then Set a budget: the editor's total. */
const setUp = (tc: Translate): ScriptStep[] => [{ press: tc('Set a budget') }, { waitFor: tc('Keypad') }];
/** A row of the limits list, as it reads before a limit is typed. */
const limitRow = (tc: Translate, category: CategoryDto, value = tc('No limit')) => tc('{label}, {value}', { label: categoryName(category, tc), value });
/** Set a budget of ฿18,000.00, then on to the limits. */
const toLimits = (tc: Translate, total = '18000'): ScriptStep[] => [...setUp(tc), ...keypadSteps(tc, total), { press: tc('Next') }, { waitFor: tc('Save budget') }];

export const BUDGET_SECTIONS: readonly CatalogueSection[] = [
  screenSection({
    id: 'budget-loading',
    title: 'Budget: loading',
    // Jotbun never answers the budget read.
    fixture: withFake((fake) => { fake.hold('budget'); }),
    script: (tc) => [{ waitFor: tc('Loading your budget') }],
    render: budget,
  }),
  screenSection({
    id: 'budget-offline',
    title: 'Budget: offline',
    fixture: () => {
      const fake = budgetFake();
      return { ...online(fake), resources: alwaysFails(fake.resources, 'summary', 'network') };
    },
    script: (tc) => [{ waitFor: tc("We couldn't load your diary.") }],
    render: budget,
  }),
  screenSection({
    id: 'budget-upgrade',
    title: 'Budget: update needed',
    fixture: () => {
      const fake = budgetFake();
      return { ...online(fake), resources: alwaysFails(fake.resources, 'budget', 'upgrade_required') };
    },
    script: (tc) => [{ waitFor: tc('Update Jotbun to keep using your diary. Nothing you saved is lost.') }],
    render: budget,
  }),
  screenSection({ id: 'budget-none', title: 'Budget: no budget', fixture: () => online(), script: (tc) => [{ waitFor: tc('Set a budget') }], render: budget }),
  screenSection({
    id: 'budget-first-month',
    title: 'Budget: first month, no prefill',
    // The golden wallets start on 1 September: no earlier month to average.
    fixture: () => online(),
    script: (tc) => [...setUp(tc), { waitFor: 'budget-amount' }],
    render: budget,
  }),
  screenSection({
    id: 'budget-prefilled',
    title: 'Budget: prefilled from the average',
    // Tracked since July: ฿10,000.00 in July and ฿14,000.50 in August average ฿12,000.25.
    fixture: () => online(budgetFake({
      trackingStart: '2026-07-01',
      records: [expense(201, '2026-07-10', '1000000'), expense(202, '2026-08-12', '1400050', { category_id: BILLS.id })],
    })),
    script: (tc) => [...setUp(tc), { waitFor: 'budget-prefill' }],
    render: budget,
  }),
  screenSection({
    id: 'budget-limits',
    title: 'Budget: category limits',
    fixture: () => online(),
    script: (tc) => [
      ...toLimits(tc),
      { press: limitRow(tc, FOOD) },
      ...keypadSteps(tc, '3000'),
      { waitFor: tc('Left for everything else: {amount}', { amount: '฿15,000.00' }) },
    ],
    render: budget,
  }),
  screenSection({ id: 'budget-on-track', title: 'Budget: on track', fixture: () => online(budgetFake({ budgets: [septBudget('1800000')] })), script: monthReady, render: budget }),
  screenSection({
    id: 'budget-tight',
    title: 'Budget: tight',
    // ฿12,450.00 of ฿12,500.00 on the 27th: more than a tenth ahead of the even pace.
    fixture: () => online(budgetFake({ budgets: [septBudget('1250000', [[FOOD, '50000']])] })),
    script: monthReady,
    render: budgetOn(SEPT_27),
  }),
  screenSection({
    id: 'budget-over',
    title: 'Budget: over',
    fixture: () => online(budgetFake({ budgets: [septBudget('1000000', [[FOOD, '100000'], [BILLS, '900000']])] })),
    script: monthReady,
    render: budget,
  }),
  screenSection({ id: 'budget-last-day', title: 'Budget: last day', fixture: () => online(budgetFake({ budgets: [septBudget('1800000')] })), script: monthReady, render: budgetOn(SEPT_30) }),
  screenSection({
    id: 'budget-saving',
    title: 'Budget: saving',
    // Jotbun never answers, so the save stays busy.
    fixture: withFake((fake) => { fake.hold('setBudget'); }),
    script: (tc) => [...toLimits(tc), { press: tc('Save budget') }, { waitFor: tc('Saving…') }],
    render: budget,
  }),
  screenSection({
    id: 'budget-unconfirmed',
    title: 'Budget: unconfirmed',
    // The answer is lost: the budget freezes and offers only Try again (which then goes through).
    fixture: withFake((fake) => { fake.fail('setBudget', 'network'); }),
    script: (tc) => [...toLimits(tc), { press: tc('Save budget') }, { waitFor: tc('Try again') }],
    render: budget,
  }),
  screenSection({
    id: 'budget-conflict',
    title: 'Budget: changed on another device',
    // Edit the ฿18,000.00 budget to ฿20,000.00 while another device makes it ฿25,000.00 with no Bills limit.
    fixture: () => online(budgetFake({ budgets: [septBudget('1800000')] })),
    script: (tc, fixture) => [
      { press: tc('Edit budget') },
      { waitFor: tc('Keypad') },
      ...keypadSteps(tc, 'C20000'),
      { press: tc('Next') },
      { waitFor: tc('Save budget') },
      { run: () => { fixture.fake.budgets.set(SEPT, septBudget('2500000', [[FOOD, '300000']], 2)); } },
      { press: tc('Save budget') },
      { waitFor: 'budget-conflict' },
    ],
    render: budget,
  }),
  screenSection({
    id: 'budget-over-total',
    title: 'Budget: limits over the total',
    fixture: () => online(),
    script: (tc) => [
      ...toLimits(tc, '10000'),
      { press: limitRow(tc, FOOD) },
      ...keypadSteps(tc, '6000'),
      { press: limitRow(tc, BILLS) },
      ...keypadSteps(tc, '5000'),
      { waitFor: tc('The limits add up to {limits}, more than the total of {total}.', { limits: '฿11,000.00', total: '฿10,000.00' }) },
    ],
    render: budget,
  }),
  screenSection({
    id: 'budget-refused',
    title: 'Budget: refused by Jotbun',
    // Jotbun refuses a limit (a category archived meanwhile, say): the problem is said where it is.
    fixture: withFake((fake) => { fake.fail('setBudget', 'invalid', { status: 422, code: 'VALIDATION_FAILED', fields: { category_limits: 'errors.category_archived' } }); }),
    script: (tc) => [
      ...toLimits(tc),
      { press: limitRow(tc, FOOD) },
      ...keypadSteps(tc, '3000'),
      { press: tc('Save budget') },
      { waitFor: tc('Check the highlighted fields.') },
    ],
    render: budget,
  }),
];
