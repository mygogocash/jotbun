import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

// The catalogue's stand-ins: a recorded router (also the route params context
// the catalogue's screen sections use) and the safe-area insets of a phone.
vi.mock('expo-router', () => import('../../../dev/catalogue/routerTestStub'));
vi.mock('expo-router/build/Route', () => import('../../../dev/catalogue/routerTestStub'));
vi.mock('react-native-safe-area-context', () => import('../../../dev/catalogue/safeAreaTestStub'));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

import type { BudgetDto, CategoryDto, TransactionDto, WalletSnapshot } from '@gogospend/contracts';
import { BUDGET_SECTIONS } from '@mobile/dev/catalogue/planning/budgetSections';
import { router } from '@mobile/dev/catalogue/routerTestStub';
import type { Locale } from '@mobile/i18n/locales';
import { translateCopy } from '@mobile/i18n/messages';
import { installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import type { SpendDiary } from '@mobile/spend/v1/spendDiary';
import { createFakeDiary } from '@mobile/spend/v1/testing/fakeDiary';
import { BUILTINS, createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
import { CATEGORIES, MATRIX, NOW, hiddenFromScreenReaders, leading, mountScreen, outboxCommand, pendingExpense, rgb } from '../HistoryTestHarness';
import { BudgetScreen } from './BudgetScreen';

beforeAll(() => { installBrowserStorage(); });
beforeEach(() => {
  for (const fn of [router.push, router.replace, router.back, router.navigate]) fn.mockReset();
  router.canGoBack.mockReturnValue(true);
});
afterEach(() => cleanup());

type Fake = ReturnType<typeof createFakeResources>;

const SEPT = '2026-09';
const BUDGET_ID = '0000000d-0000-4000-8000-0000000000b1';
const { FOOD, BILLS } = CATEGORIES;
/** The 27th: the rent has just gone out, four days to go. */
const SEPT_27 = new Date('2026-09-27T03:00:00Z');
/** The 30th: the last day of the month. */
const SEPT_30 = new Date('2026-09-30T03:00:00Z');
const UNCONFIRMED = 'Not confirmed yet. Your budget is kept; try again.';

/** September's budget: ฿18,000.00 with Food ฿3,000.00 and Bills ฿10,000.00, unless told otherwise. */
function septBudget(limit = '1800000', limits: readonly (readonly [CategoryDto, string])[] = [[FOOD, '300000'], [BILLS, '1000000']], version = 1): BudgetDto {
  return { id: BUDGET_ID, month: SEPT, overall_limit_minor: limit, version, category_limits: limits.map(([category, limit_minor]) => ({ category_id: category.id, limit_minor })) };
}

let extraNumber = 0;
function expenseOn(day: string, amount: string, category: CategoryDto = FOOD): TransactionDto {
  extraNumber += 1;
  const wallet = goldenSeed().wallets[0];
  return {
    id: `0000000d-0000-4000-8000-${String(900 + extraNumber).padStart(12, '0')}`, type: 'expense', amount_minor: amount, occurred_on: day,
    wallet_id: wallet.id, category_id: category.id, note: null, merchant: null, deleted_at: null, version: 1,
  } as TransactionDto;
}

type MountOptions = {
  now?: Date;
  locale?: Locale;
  mode?: 'light' | 'dark';
  budgets?: BudgetDto[];
  records?: TransactionDto[];
  wallets?: WalletSnapshot[];
  diary?: SpendDiary | null;
  /** Holds, failures and changes to the fake before the screen mounts. */
  prepare?: (fake: Fake) => void;
};

/** The golden diary (with the built-in categories) and any budgets, then the screen. */
function mountBudget(options: MountOptions = {}): Fake {
  const seed = goldenSeed();
  const fake = createFakeResources({ wallets: options.wallets ?? seed.wallets, records: [...seed.records, ...(options.records ?? [])], categories: BUILTINS, budgets: options.budgets ?? [] });
  options.prepare?.(fake);
  mountScreen(<BudgetScreen now={options.now ?? NOW} />, { resources: fake.resources, diary: options.diary ?? null, locale: options.locale, mode: options.mode });
  return fake;
}

const keypad = () => screen.getByRole('group', { name: 'Keypad' });
const press = (...keys: string[]) => {
  for (const key of keys) fireEvent.click(within(keypad()).getByRole('button', { name: key }));
};
const typeAmount = (amount: string) => press(...[...amount].map((key) => (key === '.' ? 'Decimal point' : key === '+' ? 'Plus sign' : key)));
const footer = () => screen.getByTestId('budget-footer');
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const limitRow = (name: string) => screen.getByRole('radio', { name });
const save = () => click('Save budget');

/** The month view, once it has loaded. */
async function monthView(options: MountOptions = {}): Promise<Fake> {
  const fake = mountBudget({ budgets: [septBudget()], ...options });
  await screen.findByTestId('budget-total');
  return fake;
}

/** No budget yet: Set a budget, type the total, Next. */
async function toLimits(total: string, options: MountOptions = {}): Promise<Fake> {
  const fake = mountBudget(options);
  fireEvent.click(await screen.findByRole('button', { name: 'Set a budget' }));
  typeAmount(total);
  click('Next');
  await screen.findByRole('button', { name: 'Save budget' });
  return fake;
}

// ---------------------------------------------------------------------------
// Loading and problems

test('loading: the stage and Back show at once, with a spinner until the month arrives', async () => {
  let release = () => {};
  mountBudget({ budgets: [septBudget()], prepare: (fake) => { release = fake.hold('budget'); } });
  expect(screen.getByRole('heading', { name: 'Budget' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
  expect(screen.getByLabelText('Loading your budget')).toBeTruthy();
  release();
  expect(await screen.findByTestId('budget-total')).toBeTruthy();
  expect(screen.queryByLabelText('Loading your budget')).toBeNull();
});

test('a network problem says so with Try again, which loads the month', async () => {
  const fake = mountBudget({ budgets: [septBudget()], prepare: (fake) => fake.fail('summary', 'network') });
  const notice = await screen.findByText("We couldn't load your diary.");
  expect(notice.closest('[role="alert"]')).toBeTruthy();
  // Set up still works while the month can't load.
  expect(screen.getByRole('button', { name: 'Wallets' })).toBeTruthy();
  click('Try again');
  expect((await screen.findByTestId('budget-total')).textContent).toBe('฿12,450.00 of ฿18,000.00');
  expect(fake.callsOf('summary').filter((call) => call.args[0] === SEPT)).toHaveLength(2);
});

test('a load that needs the person elsewhere (an update) says what to do, with no Try again', async () => {
  mountBudget({ prepare: (fake) => fake.fail('budget', 'upgrade_required') });
  expect(await screen.findByText('Update Jotbun to keep using your diary. Nothing you saved is lost.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
});

// ---------------------------------------------------------------------------
// No budget, setting one up

test('no budget: an empty state offers to set one, with the thinking bun hidden from screen readers', async () => {
  const fake = mountBudget();
  expect(await screen.findByRole('heading', { name: 'No budget this month' })).toBeTruthy();
  expect(screen.getByText("Set a monthly budget to see what's left each day")).toBeTruthy();
  expect(hiddenFromScreenReaders(screen.getByTestId('budget-empty-bun'))).toBe(true);
  expect(screen.getByRole('button', { name: 'Set a budget' })).toBeTruthy();
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(fake.callsOf('budget')[0].args).toEqual([SEPT]);
});

test('the first month with no history: no prefill, the total typed on the keypad, then saved as a create', async () => {
  const fake = mountBudget();
  fireEvent.click(await screen.findByRole('button', { name: 'Set a budget' }));
  expect(screen.getByRole('heading', { name: 'Set a budget' })).toBeTruthy();
  // The golden wallets start on 1 September: no earlier month was tracked whole, so none is read.
  expect(fake.callsOf('summary').map((call) => call.args[0])).toEqual([SEPT]);
  expect(screen.queryByTestId('budget-prefill')).toBeNull();
  expect(screen.getByLabelText('Monthly total, ฿0.00')).toBeTruthy();
  // The keypad only: no text field, so the system keyboard never opens.
  expect(document.querySelectorAll('input, textarea, [contenteditable]')).toHaveLength(0);
  typeAmount('18000');
  expect(screen.getByLabelText('Monthly total, ฿18,000.00')).toBeTruthy();
  click('Next');
  expect(await screen.findByLabelText('Monthly total, ฿18,000.00')).toBeTruthy();
  expect(screen.getByText('Left for everything else: ฿18,000.00')).toBeTruthy();
  save();
  expect(await screen.findByText('Budget saved')).toBeTruthy();
  const [month, input, key, existing] = fake.callsOf('setBudget')[0].args;
  expect([month, input, existing]).toEqual([SEPT, { overall_limit_minor: '1800000', category_limits: [] }, undefined]);
  expect(typeof key).toBe('string');
  // The month is read again after the acknowledgement.
  expect((await screen.findByTestId('budget-total')).textContent).toBe('฿12,450.00 of ฿18,000.00');
  expect(fake.callsOf('budget')).toHaveLength(2);
});

test('prefilled from the average of complete earlier months that have spending', async () => {
  const seed = goldenSeed();
  const fake = mountBudget({
    // Tracked from 1 July: July and August are whole months; June was before tracking began.
    wallets: seed.wallets.map((wallet) => ({ ...wallet, tracking_start: '2026-07-01' })),
    records: [expenseOn('2026-07-10', '1000000'), expenseOn('2026-08-12', '1400050', BILLS)],
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Set a budget' }));
  expect(screen.getByTestId('budget-prefill').textContent).toBe('Filled in from your average spending over 2 months: ฿12,000.25');
  expect(screen.getByLabelText('Monthly total, ฿12,000.25')).toBeTruthy();
  expect(fake.callsOf('summary').map((call) => call.args[0]).sort()).toEqual(['2026-07', '2026-08', SEPT]);
  click('Next');
  save();
  expect(await screen.findByText('Budget saved')).toBeTruthy();
  expect(fake.callsOf('setBudget')[0].args[1]).toEqual({ overall_limit_minor: '1200025', category_limits: [] });
});

test('a prefill that cannot be read never blocks setting up', async () => {
  const seed = goldenSeed();
  mountBudget({
    wallets: seed.wallets.map((wallet) => ({ ...wallet, tracking_start: '2026-07-01' })),
    records: [expenseOn('2026-08-12', '1400050')],
    prepare: (fake) => fake.fail('wallets', 'network'),
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Set a budget' }));
  expect(screen.queryByTestId('budget-prefill')).toBeNull();
  expect(screen.getByLabelText('Monthly total, ฿0.00')).toBeTruthy();
});

test('the total is exact: a keypad sum is worked out in satang, and nothing or zero is refused in words', async () => {
  const fake = mountBudget();
  fireEvent.click(await screen.findByRole('button', { name: 'Set a budget' }));
  click('Next');
  expect(screen.getByText('Enter an amount')).toBeTruthy();
  press('0');
  click('Next');
  expect(screen.getByText('Enter an amount above zero')).toBeTruthy();
  press('Clear');
  typeAmount('10000+2500.5');
  expect(screen.getByLabelText('Monthly total, 10,000 + 2,500.5 = ฿12,500.50')).toBeTruthy();
  click('Next');
  expect(await screen.findByLabelText('Monthly total, ฿12,500.50')).toBeTruthy();
  save();
  expect(await screen.findByText('Budget saved')).toBeTruthy();
  expect(fake.callsOf('setBudget')[0].args[1]).toEqual({ overall_limit_minor: '1250050', category_limits: [] });
});

test('category limits are optional, typed per category, and go sorted with the total', async () => {
  const fake = await toLimits('18000');
  expect(screen.getByText('Limits are optional. Pick a category to give it one.')).toBeTruthy();
  // Expense categories only, each saying it has no limit yet.
  const group = screen.getByRole('radiogroup', { name: 'Category limits' });
  expect(within(group).getAllByRole('radio').map((row) => row.getAttribute('aria-label'))).toEqual(['Food, No limit', 'Travel, No limit', 'Bills, No limit']);
  fireEvent.click(limitRow('Bills, No limit'));
  expect(limitRow('Bills, No limit').getAttribute('aria-checked')).toBe('true');
  typeAmount('10000');
  expect(screen.getByLabelText('Limit for Bills, ฿10,000.00')).toBeTruthy();
  fireEvent.click(limitRow('Food, No limit'));
  typeAmount('3000');
  expect(limitRow('Food, ฿3,000.00')).toBeTruthy();
  expect(limitRow('Bills, ฿10,000.00')).toBeTruthy();
  expect(screen.getByText('Left for everything else: ฿5,000.00')).toBeTruthy();
  save();
  expect(await screen.findByText('Budget saved')).toBeTruthy();
  expect(fake.callsOf('setBudget')[0].args[1]).toEqual({
    overall_limit_minor: '1800000',
    category_limits: [{ category_id: FOOD.id, limit_minor: '300000' }, { category_id: BILLS.id, limit_minor: '1000000' }],
  });
});

test('limits that add up to more than the total are said inline, and nothing is sent until they fit', async () => {
  const fake = await toLimits('10000');
  fireEvent.click(limitRow('Food, No limit'));
  typeAmount('6000');
  fireEvent.click(limitRow('Bills, No limit'));
  typeAmount('5000');
  const problem = screen.getByText('The limits add up to ฿11,000.00, more than the total of ฿10,000.00.');
  expect(problem.getAttribute('role')).toBe('alert');
  save();
  expect(fake.callsOf('setBudget')).toHaveLength(0);
  expect(screen.getByRole('button', { name: 'Save budget' })).toBeTruthy();
  press('Clear');
  typeAmount('4000');
  expect(screen.queryByText(/more than the total/)).toBeNull();
  expect(screen.getByText('Left for everything else: ฿0.00')).toBeTruthy();
  save();
  expect(await screen.findByText('Budget saved')).toBeTruthy();
  expect(fake.callsOf('setBudget')[0].args[1]).toEqual({
    overall_limit_minor: '1000000',
    category_limits: [{ category_id: FOOD.id, limit_minor: '600000' }, { category_id: BILLS.id, limit_minor: '400000' }],
  });
});

test('Change total goes back to the total with the limits kept; Cancel leaves without sending', async () => {
  const fake = await toLimits('18000');
  fireEvent.click(limitRow('Food, No limit'));
  typeAmount('3000');
  click('Change total');
  expect(screen.getByLabelText('Monthly total, ฿18,000.00')).toBeTruthy();
  click('Next');
  expect(limitRow('Food, ฿3,000.00')).toBeTruthy();
  click('Cancel');
  expect(await screen.findByRole('heading', { name: 'No budget this month' })).toBeTruthy();
  expect(fake.callsOf('setBudget')).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// The month

test('on track: the confirmed month against the budget, the pace ring, the burn-down in words and the limits', async () => {
  await monthView();
  expect(screen.getByTestId('budget-total').textContent).toBe('฿12,450.00 of ฿18,000.00');
  const ring = screen.getByRole('progressbar', { name: 'Budget' });
  expect(ring.getAttribute('aria-valuetext')).toBe('฿2,775.00 a day left, On track, ฿5,550.00 left, 2 days to go');
  expect(screen.getByRole('heading', { name: 'Left to spend' })).toBeTruthy();
  // The burn-down: drawn for the eye, said in words for everyone.
  const chart = screen.getByTestId('budget-burn-down');
  expect(hiddenFromScreenReaders(chart)).toBe(true);
  expect(chart.querySelectorAll('path, line, polyline').length).toBeGreaterThan(0);
  for (const line of ['Spent by today: ฿12,450.00', 'Even pace by today: ฿17,400.00', '฿4,950.00 under an even pace']) expect(screen.getByText(line)).toBeTruthy();
  // Each limit: the name, spent of limit, and its state in words; the bar is decoration.
  expect(screen.getByLabelText('Food, ฿182.00 of ฿3,000.00, ฿2,818.00 left')).toBeTruthy();
  expect(screen.getByLabelText('Bills, ฿12,268.00 of ฿10,000.00, ฿2,268.00 over, It happens.')).toBeTruthy();
  expect(hiddenFromScreenReaders(screen.getByTestId(`budget-bar-${FOOD.id}`))).toBe(true);
  // At full intensity the bun only appears when over; on track the stage has none.
  expect(screen.queryByTestId('budget-bun-oops-kind')).toBeNull();
});

test('tight: spending more than a tenth ahead of the even pace says Tight, never a scolding', async () => {
  await monthView({ now: SEPT_27, budgets: [septBudget('1250000', [[FOOD, '50000']])] });
  const ring = screen.getByRole('progressbar', { name: 'Budget' });
  expect(ring.getAttribute('aria-valuetext')).toBe('฿12.50 a day left, Tight, ฿50.00 left, 4 days to go');
  expect(screen.getByText('฿1,200.00 ahead of an even pace')).toBeTruthy();
});

test('over: kind words and the facts, the oops-kind bun hidden from screen readers, red only on the over figures', async () => {
  await monthView({ budgets: [septBudget('1000000', [[FOOD, '100000'], [BILLS, '900000']])] });
  const ring = screen.getByRole('progressbar', { name: 'Budget' });
  expect(ring.getAttribute('aria-valuetext')).toBe('฿2,450.00 over, 2 days to go, It happens. ฿12,450.00 of ฿10,000.00 spent.');
  expect(screen.getByLabelText('Bills, ฿12,268.00 of ฿9,000.00, ฿3,268.00 over, It happens.')).toBeTruthy();
  expect(screen.getByLabelText('Food, ฿182.00 of ฿1,000.00, ฿818.00 left')).toBeTruthy();
  expect(hiddenFromScreenReaders(screen.getByTestId('budget-bun-oops-kind'))).toBe(true);
  // Even pace by the 29th: ฿10,000.00 × 29 ÷ 30 = ฿9,666.66 (rounded down).
  expect(screen.getByText('฿2,783.34 ahead of an even pace')).toBeTruthy();
});

test('the last day: the whole rest of the budget is today’s', async () => {
  await monthView({ now: SEPT_30 });
  const ring = screen.getByRole('progressbar', { name: 'Budget' });
  expect(ring.getAttribute('aria-valuetext')).toBe('฿5,550.00 a day left, On track, ฿5,550.00 left, Last day');
  expect(screen.getByText('Even pace by today: ฿18,000.00')).toBeTruthy();
});

test('money waiting on this device joins the pace and says so; the stage stays confirmed', async () => {
  const fakeDiary = createFakeDiary({ outbox: [outboxCommand(pendingExpense({ amount_minor: '6500', occurred_on: '2026-09-29' }), 'unsent')] });
  await monthView({ diary: fakeDiary.diary });
  expect(screen.getByTestId('budget-total').textContent).toBe('฿12,450.00 of ฿18,000.00');
  expect(screen.getByText('Includes ฿65.00 saving on this device')).toBeTruthy();
  expect(screen.getByText('Spent by today: ฿12,515.00')).toBeTruthy();
  expect(screen.getByLabelText('Food, ฿247.00 of ฿3,000.00, ฿2,753.00 left')).toBeTruthy();
});

test('a budget with no category limits says so quietly', async () => {
  await monthView({ budgets: [septBudget('1800000', [])] });
  expect(screen.getByText('No category limits this month.')).toBeTruthy();
});

test('the month switcher: earlier months, and one month ahead to plan the next', async () => {
  const fake = await monthView();
  expect(screen.getByText('September 2026')).toBeTruthy();
  click('Previous month');
  expect(await screen.findByRole('heading', { name: 'No budget this month' })).toBeTruthy();
  expect(screen.getByText('August 2026')).toBeTruthy();
  expect(fake.callsOf('budget').map((call) => call.args[0])).toEqual([SEPT, '2026-08']);
  click('Next month');
  expect(await screen.findByTestId('budget-total')).toBeTruthy();
  click('Next month');
  expect(await screen.findByText('October 2026')).toBeTruthy();
  expect(await screen.findByRole('heading', { name: 'No budget this month' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Next month' }).getAttribute('aria-disabled')).toBe('true');
});

// ---------------------------------------------------------------------------
// Editing, saving and what can go wrong

test('editing a budget starts from it and replaces it with the version read', async () => {
  const fake = await monthView();
  click('Edit budget');
  expect(screen.getByRole('heading', { name: 'Edit budget' })).toBeTruthy();
  expect(screen.getByLabelText('Monthly total, ฿18,000.00')).toBeTruthy();
  click('Next');
  fireEvent.click(limitRow('Food, ฿3,000.00'));
  press('Clear');
  typeAmount('4000');
  save();
  expect(await screen.findByText('Budget saved')).toBeTruthy();
  const [month, input, , existing] = fake.callsOf('setBudget')[0].args;
  expect([month, input, existing]).toEqual([
    SEPT,
    { overall_limit_minor: '1800000', category_limits: [{ category_id: FOOD.id, limit_minor: '400000' }, { category_id: BILLS.id, limit_minor: '1000000' }] },
    { version: 1, id: BUDGET_ID },
  ]);
  expect(await screen.findByLabelText('Food, ฿182.00 of ฿4,000.00, ฿3,818.00 left')).toBeTruthy();
});

test('saving: Save is busy and the keypad and rows wait', async () => {
  let release = () => {};
  await toLimits('18000', { prepare: (fake) => { release = fake.hold('setBudget'); } });
  save();
  const busy = await screen.findByRole('button', { name: 'Saving…' });
  expect(busy.getAttribute('aria-busy')).toBe('true');
  expect(within(keypad()).getByRole('button', { name: '1' }).getAttribute('aria-disabled')).toBe('true');
  expect(limitRow('Food, No limit').getAttribute('aria-disabled')).toBe('true');
  release();
  expect(await screen.findByText('Budget saved')).toBeTruthy();
});

test('unconfirmed: the budget freezes, only Try again is offered, and it resends the same command with the same key', async () => {
  const fake = await toLimits('18000');
  fireEvent.click(limitRow('Food, No limit'));
  typeAmount('3000');
  fake.loseResponse('setBudget');
  save();
  expect(await within(footer()).findByText(UNCONFIRMED)).toBeTruthy();
  expect(within(footer()).getByRole('button', { name: 'Try again' })).toBeTruthy();
  for (const gone of ['Save budget', 'Cancel']) expect(screen.queryByRole('button', { name: gone })).toBeNull();
  expect(within(keypad()).getByRole('button', { name: '1' }).getAttribute('aria-disabled')).toBe('true');
  expect(limitRow('Food, ฿3,000.00').getAttribute('aria-disabled')).toBe('true');
  expect(screen.getByRole('button', { name: 'Change total' }).getAttribute('aria-disabled')).toBe('true');
  // A key pressed while frozen changes nothing.
  press('9');
  expect(limitRow('Food, ฿3,000.00')).toBeTruthy();
  click('Try again');
  expect(await screen.findByText('Budget saved')).toBeTruthy();
  const [first, second] = fake.callsOf('setBudget');
  expect(second.args).toEqual(first.args);
  expect(fake.budgets.get(SEPT)?.overall_limit_minor).toBe('1800000');
});

test('a refusal before processing, after an unconfirmed attempt, stays frozen with its key', async () => {
  const fake = await toLimits('18000');
  fake.fail('setBudget', 'network');
  save();
  expect(await within(footer()).findByText(UNCONFIRMED)).toBeTruthy();
  // Signed out says nothing about whether the first attempt committed.
  fake.fail('setBudget', 'signed_out');
  click('Try again');
  expect(await within(footer()).findByText('Sign in again to save.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Save budget' })).toBeNull();
  click('Try again');
  expect(await screen.findByText('Budget saved')).toBeTruthy();
  const keys = fake.callsOf('setBudget').map((call) => call.args[2]);
  expect(new Set(keys).size).toBe(1);
});

test('changed on another device: theirs side by side with yours, and Reload shows theirs', async () => {
  const fake = await monthView();
  click('Edit budget');
  press('Clear');
  typeAmount('20000');
  click('Next');
  fake.budgets.set(SEPT, septBudget('2500000', [[FOOD, '300000']], 2));
  save();
  const panel = await screen.findByTestId('budget-conflict');
  expect(within(panel).getByRole('heading', { name: 'This budget changed on another device.' })).toBeTruthy();
  expect(within(panel).getByLabelText('Monthly total. Yours: ฿20,000.00. On the server: ฿25,000.00.')).toBeTruthy();
  expect(within(panel).getByLabelText('Food. Yours: ฿3,000.00. On the server: ฿3,000.00.')).toBeTruthy();
  expect(within(panel).getByLabelText('Bills. Yours: ฿10,000.00. On the server: No limit.')).toBeTruthy();
  expect(fake.callsOf('setBudget')[0].args[3]).toEqual({ version: 1, id: BUDGET_ID });
  expect(screen.queryByRole('group', { name: 'Keypad' })).toBeNull();
  fireEvent.click(within(footer()).getByRole('button', { name: 'Reload' }));
  expect((await screen.findByTestId('budget-total')).textContent).toBe('฿12,450.00 of ฿25,000.00');
  expect(fake.callsOf('setBudget')).toHaveLength(1);
});

test('created on another device first: theirs is shown, never overwritten', async () => {
  const fake = await toLimits('18000');
  fake.budgets.set(SEPT, septBudget('1500000', []));
  save();
  const panel = await screen.findByTestId('budget-conflict');
  expect(within(panel).getByLabelText('Monthly total. Yours: ฿18,000.00. On the server: ฿15,000.00.')).toBeTruthy();
  fireEvent.click(within(footer()).getByRole('button', { name: 'Reload' }));
  expect((await screen.findByTestId('budget-total')).textContent).toBe('฿12,450.00 of ฿15,000.00');
});

test('created on another device with exactly these figures counts as saved', async () => {
  const fake = await toLimits('18000');
  fake.budgets.set(SEPT, { ...septBudget('1800000', []), id: '0000000d-0000-4000-8000-0000000000b2' });
  save();
  expect(await screen.findByText('Budget saved')).toBeTruthy();
  expect(screen.queryByTestId('budget-conflict')).toBeNull();
});

test('refused by Jotbun: the problem is said under the limits, and the corrected save is a new command', async () => {
  const fake = await toLimits('18000');
  fireEvent.click(limitRow('Travel, No limit'));
  typeAmount('2000');
  fake.fail('setBudget', 'invalid', { status: 422, code: 'VALIDATION_FAILED', fields: { category_limits: 'errors.category_archived' } });
  save();
  expect(await within(footer()).findByText('Check the highlighted fields.')).toBeTruthy();
  expect(screen.getByText('Check this and try again.')).toBeTruthy();
  // Not frozen: the person can change the limits.
  fireEvent.click(limitRow('Travel, ฿2,000.00'));
  press('Clear');
  save();
  expect(await screen.findByText('Budget saved')).toBeTruthy();
  const [first, second] = fake.callsOf('setBudget');
  expect(second.args[2]).not.toBe(first.args[2]);
  expect(second.args[1]).toEqual({ overall_limit_minor: '1800000', category_limits: [] });
});

// ---------------------------------------------------------------------------
// Navigation

test('Back is the stage’s first control and goes back (or Home, where Budget opens from, with nothing to go back to); editing hides it', async () => {
  await monthView();
  const stage = screen.getByTestId('stage-header');
  expect(within(stage).getByRole('button', { name: 'Back' })).toBe(screen.getAllByRole('button')[0]);
  click('Back');
  expect(router.back).toHaveBeenCalledTimes(1);
  router.canGoBack.mockReturnValue(false);
  click('Back');
  expect(router.replace).toHaveBeenLastCalledWith('/spend');
  click('Edit budget');
  expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Previous month' })).toBeNull();
});

test('Set up opens Wallets and Categories', async () => {
  await monthView();
  expect(screen.getByRole('heading', { name: 'Set up' })).toBeTruthy();
  click('Wallets');
  expect(router.push).toHaveBeenLastCalledWith('/spend/wallets');
  click('Categories');
  expect(router.push).toHaveBeenLastCalledWith('/spend/categories');
});

// ---------------------------------------------------------------------------
// Accessibility, colour and copy

test('targets are at least 44 points, keypad keys at least 56', async () => {
  await monthView();
  for (const name of ['Back', 'Previous month', 'Next month', 'Edit budget', 'Wallets', 'Categories']) {
    expect(Number.parseFloat(screen.getByRole('button', { name }).style.minHeight), name).toBeGreaterThanOrEqual(44);
  }
  click('Edit budget');
  for (const name of ['Cancel', 'Next']) expect(Number.parseFloat(screen.getByRole('button', { name }).style.minHeight), name).toBeGreaterThanOrEqual(44);
  for (const key of within(keypad()).getAllByRole('button')) expect(Number.parseFloat(key.style.minHeight)).toBeGreaterThanOrEqual(56);
  click('Next');
  for (const name of ['Change total', 'Save budget']) expect(Number.parseFloat(screen.getByRole('button', { name }).style.minHeight), name).toBeGreaterThanOrEqual(44);
  for (const row of screen.getAllByRole('radio')) expect(Number.parseFloat(row.style.minHeight)).toBeGreaterThanOrEqual(44);
});

test('the screen draws with palette tokens only, keeps money out of floating point, and never animates', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const file of ['BudgetScreen.tsx', 'BudgetParts.tsx']) {
    const source = readFileSync(join(here, file), 'utf8');
    expect(source, file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source, file).not.toMatch(/rgba?\(/);
    expect(source, file).not.toMatch(/parseFloat|parseInt|toFixed|keyboardType|TextInput/);
    // Nothing moves, so reduced motion has nothing to take away.
    expect(source, file).not.toMatch(/Animated|useSpringPop|withSpring|LayoutAnimation/);
    expect(source, file).toMatch(/useBunColors\(\)/);
  }
});

test.each(MATRIX)('reads in $locale, $mode: palette colours and the script’s own leading', async ({ locale, mode, colors }) => {
  const say = (english: string, values?: Record<string, string>) => translateCopy(english, locale, values);
  await monthView({ locale, mode });
  expect(screen.getByTestId('budget-screen').style.backgroundColor).toEqual(rgb(colors.background));
  expect(screen.getByTestId('stage-header').style.backgroundColor).toEqual(rgb(colors.stage));
  const title = screen.getByRole('heading', { name: say('Budget') });
  expect(title.style.lineHeight).toBe(leading('title', locale));
  expect(title.style.color).toEqual(rgb(colors.ink));
  const section = screen.getByRole('heading', { name: say('Left to spend') });
  expect(section.style.lineHeight).toBe(leading('label', locale));
  expect(screen.getByRole('button', { name: say('Edit budget') })).toBeTruthy();
  // The amounts are exact in every language.
  expect(screen.getByTestId('budget-total').textContent).toBe(say('{spent} of {limit}', { spent: '฿12,450.00', limit: '฿18,000.00' }));
  const over = screen.getByText(say('{amount} over', { amount: '฿2,268.00' }));
  expect(over.style.color).toEqual(rgb(colors.over));
  expect(over.style.lineHeight).toBe(leading('caption', locale));
});

// ---------------------------------------------------------------------------
// The catalogue's Budget sections (registered by the main session)

test('every Budget catalogue section reaches its state on the fakes', async () => {
  const ids = BUDGET_SECTIONS.map((section) => section.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids).toEqual(expect.arrayContaining([
    'budget-loading', 'budget-offline', 'budget-none', 'budget-first-month', 'budget-prefilled', 'budget-on-track', 'budget-tight',
    'budget-over', 'budget-last-day', 'budget-saving', 'budget-unconfirmed', 'budget-conflict', 'budget-over-total', 'budget-refused',
  ]));
  for (const section of BUDGET_SECTIONS) {
    expect(section.id).toMatch(/^budget-[a-z0-9-]+$/);
    expect(section.title).toMatch(/^Budget: /);
    expect(section.layout).toBe('screen');
    const view = mountScreen(<>{section.render()}</>, { resources: createFakeResources().resources });
    await waitFor(() => expect(screen.queryByTestId('catalogue-screen-running')).toBeNull(), { timeout: 15_000 });
    expect(screen.queryByTestId('catalogue-screen-stopped'), `${section.id}: ${screen.queryByTestId('catalogue-screen-stopped')?.textContent}`).toBeNull();
    expect(screen.getByTestId('budget-screen')).toBeTruthy();
    view.unmount();
  }
}, 120_000);
