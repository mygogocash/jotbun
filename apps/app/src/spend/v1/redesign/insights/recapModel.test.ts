import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { CategoryTotal, HistoryPage, MonthSummary, TransactionDto } from '@gogospend/contracts';

import { V1Error } from '../../../../api/client.ts';
import { ART, BILLS, BUILTINS, FOOD, FUN, GIFT, PETS, SALARY, SHOPPING, TRAVEL, command, entry, marked, pending, summary, tc, transfer } from '../testing/fixtures.ts';
import {
  budgetLine, compareBars, compareWindow, daysLoggedOf, keptOf, monthPhase, readMonthDays, recapProblem, recapView, topCategories, waitingNote,
} from './recapModel.ts';
import type { MonthSpend, RecapData, RecapInput } from './recapModel.ts';

const TODAY = '2026-09-29';
const total = (category: { id: string; type: 'expense' | 'income' }, minor: string): CategoryTotal => ({ category_id: category.id, type: category.type, total_minor: minor });

// ---------------------------------------------------------------------------
// Months: phase and the compare window

test('a month is past, current or future against Bangkok today', () => {
  assert.deepEqual(['2026-08', '2026-09', '2026-10', '2025-12'].map((month) => monthPhase(month, TODAY)), ['past', 'current', 'future', 'past']);
});

test('the bars compare the last six months up to this month, and never a month after it', () => {
  const recent = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
  // Any month of the last six keeps the same bars, so tapping one never moves the others.
  for (const month of recent) assert.deepEqual(compareWindow(month, TODAY), recent, month);
  // A month after this one (a hand-typed link) still stops at this month.
  assert.deepEqual(compareWindow('2026-11', TODAY), recent);
  // An older month ends the bars at itself, with the five months before it.
  assert.deepEqual(compareWindow('2026-03', TODAY), ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03']);
  // Across a year end.
  assert.deepEqual(compareWindow('2026-02', '2026-02-10'), ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02']);
  for (const month of ['2024-01', '2026-03', '2026-09', '2027-01']) {
    for (const shown of compareWindow(month, TODAY)) assert.ok(shown <= '2026-09', `${month}: ${shown}`);
  }
});

// ---------------------------------------------------------------------------
// Days logged, read across every page of the month

type Page = Pick<HistoryPage, 'items' | 'next_cursor'>;
const on = (occurred_on: string, overrides: Partial<TransactionDto> = {}) => entry({ occurred_on, ...overrides } as Partial<Extract<TransactionDto, { type: 'expense' | 'income' }>>);

function reader(pages: Page[]) {
  const cursors: (string | undefined)[] = [];
  return {
    cursors,
    read: async (cursor: string | undefined) => {
      cursors.push(cursor);
      return pages[cursors.length - 1];
    },
  };
}

test('days logged counts each day with any entry once, across every page', async () => {
  const pages = reader([
    { items: [on('2026-09-28'), on('2026-09-28', { type: 'income', category_id: SALARY.id }), transfer({ occurred_on: '2026-09-27' })], next_cursor: 'c1' },
    { items: [on('2026-09-25'), on('2026-09-01')], next_cursor: null },
  ]);
  assert.deepEqual(await readMonthDays('2026-09', pages.read), { days: ['2026-09-01', '2026-09-25', '2026-09-27', '2026-09-28'], complete: true });
  assert.deepEqual(pages.cursors, [undefined, 'c1']);
});

test('days logged leaves out deleted entries and dates outside the month', async () => {
  const pages = reader([{ items: [on('2026-09-02', { deleted_at: '2026-09-03T00:00:00.000Z' }), on('2026-08-31'), on('2026-09-03')], next_cursor: null }]);
  assert.deepEqual(await readMonthDays('2026-09', pages.read), { days: ['2026-09-03'], complete: true });
});

test('days logged stops at its page limit and says it may be more; it stops early once every day is counted', async () => {
  const endless = reader(Array.from({ length: 5 }, (_, index) => ({ items: [on(`2026-09-0${index + 1}`)], next_cursor: `c${index + 1}` })));
  assert.deepEqual(await readMonthDays('2026-09', endless.read, 3), { days: ['2026-09-01', '2026-09-02', '2026-09-03'], complete: false });
  assert.equal(endless.cursors.length, 3);

  const february = Array.from({ length: 28 }, (_, index) => on(`2026-02-${String(index + 1).padStart(2, '0')}`));
  const full = reader([{ items: february, next_cursor: 'c1' }, { items: [on('2026-02-01')], next_cursor: null }]);
  const days = await readMonthDays('2026-02', full.read);
  assert.deepEqual([days.days.length, days.complete, full.cursors.length], [28, true, 1]);
});

test('days logged in words: one day, several, or at least that many', () => {
  assert.equal(daysLoggedOf({ days: ['2026-09-01'], complete: true }, tc).text, '1 day');
  assert.deepEqual(daysLoggedOf({ days: ['2026-09-01', '2026-09-02', '2026-09-05', '2026-09-06'], complete: true }, tc), { count: 4, complete: true, text: '4 days' });
  assert.deepEqual(daysLoggedOf({ days: ['2026-09-01', '2026-09-02'], complete: false }, tc), { count: 2, complete: false, text: 'At least 2 days' });
});

// ---------------------------------------------------------------------------
// Top categories, kept and the budget line

test('top categories: money out only, largest first, at most five, each with its exact amount', () => {
  const unknown = { id: 'c0000000-0000-4000-8000-0000000000ff', type: 'expense' as const };
  const totals = [
    total(SALARY, '2800000'), total(GIFT, '9999999999'),
    total(FOOD, '18200'), total(BILLS, '1226800'), total(TRAVEL, '48000'), total(PETS, '6551'), total(unknown, '5000'),
    total(ART, '100'), total(SHOPPING, '99'), total(FUN, '0'),
  ];
  const top = topCategories(totals, [...BUILTINS, PETS, ART], tc, 'en');
  assert.deepEqual(top.map((row) => [row.name, row.amountText, row.minor]), [
    ['Bills', '฿12,268.00', '1226800'],
    ['Travel', '฿480.00', '48000'],
    ['Food', '฿182.00', '18200'],
    ['Pets', '฿65.51', '6551'],
    ['Category', '฿50.00', '5000'],
  ]);
  assert.deepEqual(top.map((row) => row.categoryId), [BILLS.id, TRAVEL.id, FOOD.id, PETS.id, unknown.id]);
  assert.deepEqual(topCategories(totals, BUILTINS, tc, 'en', 2).map((row) => row.name), ['Bills', 'Travel']);
});

test('top categories compare exact satang, past where floating point can tell them apart, and break ties by name', () => {
  // Both round to the same double; only exact maths puts Pets first.
  const huge = topCategories([total(ART, '90071992547409929'), total(PETS, '90071992547409930')], [PETS, ART], tc, 'en');
  assert.deepEqual(huge.map((row) => [row.name, row.amountText]), [['Pets', '฿900,719,925,474,099.30'], ['Art', '฿900,719,925,474,099.29']]);
  const tied = topCategories([total(TRAVEL, '5000'), total(FOOD, '5000')], BUILTINS, tc, 'en');
  assert.deepEqual(tied.map((row) => row.name), ['Food', 'Travel']);
  // Built-in names go through the translator.
  assert.deepEqual(topCategories([total(FOOD, '5000')], BUILTINS, marked, 'en').map((row) => row.name), ['[Food]']);
});

test('kept is earned minus spent when positive, and kind words when it is not', () => {
  assert.deepEqual(keptOf('2950000', '1396251', tc, 'en'), { kind: 'kept', minor: '1553749', text: '฿15,537.49' });
  assert.deepEqual(keptOf('1000000', '1000000', tc, 'en'), { kind: 'even', minor: '0', text: 'Earned and spent matched' });
  assert.deepEqual(keptOf('1000000', '1526800', tc, 'en'), { kind: 'short', minor: '-526800', text: '฿5,268.00 more went out than came in' });
  assert.deepEqual(keptOf('0', '0', tc, 'en').kind, 'even');
});

test('the budget line: spent of the limit, and over said kindly with the exact amount', () => {
  const usage = (limit: string, spent: string): MonthSummary['budget'] => ({ overall_limit_minor: limit, spent_minor: spent, remaining_minor: (BigInt(limit) - BigInt(spent)).toString(), categories: [] });
  assert.equal(budgetLine(null, tc, 'en'), null);
  assert.deepEqual(budgetLine(usage('1800000', '1396251'), tc, 'en'), {
    spentMinor: '1396251', limitMinor: '1800000', over: false, overMinor: '0', value: '฿13,962.51 of ฿18,000.00', note: null,
  });
  assert.deepEqual(budgetLine(usage('1000000', '1000000'), tc, 'en')?.value, '฿10,000.00 of ฿10,000.00');
  assert.deepEqual(budgetLine(usage('1000000', '1396251'), tc, 'en'), {
    spentMinor: '1396251', limitMinor: '1000000', over: true, overMinor: '396251', value: '฿3,962.51 over', note: 'It happens. ฿13,962.51 of ฿10,000.00 spent.',
  });
});

// ---------------------------------------------------------------------------
// The compare bars

const SIX: MonthSpend[] = [
  { month: '2026-04', expenseMinor: '0' }, { month: '2026-05', expenseMinor: '50000' }, { month: '2026-06', expenseMinor: '1526800' },
  { month: '2026-07', expenseMinor: '0' }, { month: '2026-08', expenseMinor: '1396251' }, { month: '2026-09', expenseMinor: '1245000' },
];

test('each bar names its month and its exact money out; the month shown is chosen and this month is marked so far', () => {
  const bars = compareBars(SIX, { shown: '2026-08', today: TODAY, tc, locale: 'en', dateLocale: 'en' });
  assert.deepEqual(bars.map((bar) => [bar.month, bar.label, bar.amountText, bar.spoken, bar.permille, bar.selected, bar.current]), [
    ['2026-04', 'April 2026', '฿0.00', 'April 2026, ฿0.00', 0, false, false],
    ['2026-05', 'May 2026', '฿500.00', 'May 2026, ฿500.00', 32, false, false],
    ['2026-06', 'June 2026', '฿15,268.00', 'June 2026, ฿15,268.00', 1000, false, false],
    ['2026-07', 'July 2026', '฿0.00', 'July 2026, ฿0.00', 0, false, false],
    ['2026-08', 'August 2026', '฿13,962.51', 'August 2026, ฿13,962.51', 914, true, false],
    ['2026-09', 'September 2026 so far', '฿12,450.00', 'September 2026 so far, ฿12,450.00', 815, false, true],
  ]);
  assert.deepEqual(compareBars(SIX.map((bar) => ({ ...bar, expenseMinor: '0' })), { shown: '2026-08', today: TODAY, tc, locale: 'en', dateLocale: 'en' }).map((bar) => bar.permille), [0, 0, 0, 0, 0, 0]);
  const thai = compareBars(SIX, { shown: '2026-08', today: TODAY, tc, locale: 'th', dateLocale: 'th' });
  assert.deepEqual(thai.map((bar) => bar.label), ['เมษายน 2569', 'พฤษภาคม 2569', 'มิถุนายน 2569', 'กรกฎาคม 2569', 'สิงหาคม 2569', 'กันยายน 2569 so far']);
});

// ---------------------------------------------------------------------------
// Drafts on this device, and load problems

test('entries still on this device for the month are mentioned, since the recap holds only confirmed money', () => {
  const draft = (occurred_on: string, state: 'unsent' | 'acknowledged' = 'unsent') => command(pending({ occurred_on }), state);
  assert.equal(waitingNote([draft('2026-09-20')], '2026-09', tc), "Entries still on this device aren't in this recap yet.");
  assert.equal(waitingNote([draft('2026-10-01'), draft('2026-09-20', 'acknowledged')], '2026-09', tc), null);
  assert.equal(waitingNote([], '2026-09', tc), null);
});

test('load problems: offline says the records are safe and offers a retry; the others say what to do', () => {
  assert.deepEqual(recapProblem(new V1Error('network', 0, 'NETWORK_ERROR'), tc), {
    title: 'We could not load this month', message: 'Your records are safe. This is a connection problem, not an empty month.', retry: true,
  });
  assert.deepEqual(recapProblem(new V1Error('upgrade_required', 426, 'UPGRADE_REQUIRED'), tc), {
    title: 'Update Jotbun', message: 'Update Jotbun to keep using your diary. Nothing you saved is lost.', retry: false,
  });
  assert.deepEqual(recapProblem(new V1Error('policy_required', 403, 'POLICY_REQUIRED'), tc).title, 'Updated terms');
  assert.deepEqual(recapProblem(new V1Error('signed_out', 401, 'SIGNED_OUT'), tc).title, 'Signed out');
  assert.deepEqual(recapProblem(new V1Error('unsupported_platform', 400, 'UNSUPPORTED_PLATFORM'), tc).title, 'Use the Jotbun app');
  assert.deepEqual(recapProblem(new Error('boom'), tc), { title: 'Diary not loaded', message: "We couldn't load your diary.", retry: true });
});

// ---------------------------------------------------------------------------
// The whole recap and its share text

const AUGUST: MonthSummary = summary('2026-08', {
  income_minor: '2950000', expense_minor: '1396251', balance_minor: '1553749',
  categories: [total(BILLS, '1316700'), total(SALARY, '2800000'), total(TRAVEL, '48000'), total(FOOD, '31551'), total(GIFT, '150000')],
});
const AUGUST_DAYS = { days: ['2026-08-01', '2026-08-02', '2026-08-05', '2026-08-12', '2026-08-20', '2026-08-21'], complete: true };
const data = (overrides: Partial<RecapData> = {}): RecapData => ({ summary: AUGUST, categories: BUILTINS, days: AUGUST_DAYS, compare: SIX, ...overrides });
const view = (month: string, overrides: Partial<RecapData> = {}, input: Partial<RecapInput> = {}) =>
  recapView({ month, today: TODAY, load: { state: 'ready', data: data(overrides) }, outbox: [], tc, locale: 'en', dateLocale: 'en', ...input });

test('a past month: the receipt facts, the hero, the bars and the exact share text', () => {
  const recap = view('2026-08', { summary: { ...AUGUST, budget: { overall_limit_minor: '1800000', spent_minor: '1396251', remaining_minor: '403749', categories: [] } } });
  assert.equal(recap.kind, 'recap');
  if (recap.kind !== 'recap') return;
  assert.deepEqual(recap.header, { title: 'Month recap', subtitle: 'August 2026', hero: '฿13,962.51 spent' });
  assert.equal(recap.phase, 'past');
  assert.deepEqual([recap.facts.monthTitle, recap.facts.spentText, recap.facts.earnedText, recap.facts.days.text, recap.facts.kept.text], ['August 2026', '฿13,962.51', '฿29,500.00', '6 days', '฿15,537.49']);
  assert.deepEqual(recap.facts.top.map((row) => `${row.name} ${row.amountText}`), ['Bills ฿13,167.00', 'Travel ฿480.00', 'Food ฿315.51']);
  assert.equal(recap.facts.budget?.value, '฿13,962.51 of ฿18,000.00');
  assert.deepEqual(recap.bars.filter((bar) => bar.selected).map((bar) => bar.month), ['2026-08']);
  assert.equal(recap.waiting, null);
  assert.equal(recap.share, [
    'August 2026 in Jotbun',
    'Spent: ฿13,962.51',
    'Budget: ฿13,962.51 of ฿18,000.00',
    'Earned: ฿29,500.00',
    'Top categories',
    'Bills: ฿13,167.00',
    'Travel: ฿480.00',
    'Food: ฿315.51',
    'Days logged: 6 days',
    'Kept: ฿15,537.49',
  ].join('\n'));
});

test('the share text: over budget kindly, money in only, more out than in, and every word through the translator', () => {
  const over = view('2026-08', { summary: { ...AUGUST, budget: { overall_limit_minor: '1000000', spent_minor: '1396251', remaining_minor: '-396251', categories: [] } } });
  assert.ok(over.kind === 'recap');
  assert.match(over.share, /\nSpent: ฿13,962\.51\nBudget: ฿3,962\.51 over\nIt happens\. ฿13,962\.51 of ฿10,000\.00 spent\.\nEarned: /);

  const july = view('2026-07', {
    summary: summary('2026-07', { income_minor: '2850000', balance_minor: '2850000', categories: [total(SALARY, '2800000'), total(GIFT, '50000')] }),
    days: { days: ['2026-07-10', '2026-07-25'], complete: true },
  });
  assert.ok(july.kind === 'recap');
  assert.equal(july.share, ['July 2026 in Jotbun', 'Spent: ฿0.00', 'Earned: ฿28,500.00', 'Days logged: 2 days', 'Kept: ฿28,500.00'].join('\n'));
  assert.deepEqual(july.facts.top, []);

  const june = view('2026-06', {
    summary: summary('2026-06', { income_minor: '1000000', expense_minor: '1526800', balance_minor: '-526800', categories: [total(BILLS, '1226800'), total(TRAVEL, '300000'), total(SALARY, '1000000')] }),
    days: { days: ['2026-06-01', '2026-06-15'], complete: false },
  });
  assert.ok(june.kind === 'recap');
  assert.ok(june.share.endsWith('Days logged: At least 2 days\nKept: ฿5,268.00 more went out than came in'), june.share);

  const translated = recapView({ month: '2026-08', today: TODAY, load: { state: 'ready', data: data() }, outbox: [], tc: marked, locale: 'en', dateLocale: 'en' });
  assert.ok(translated.kind === 'recap');
  for (const line of translated.share.split('\n')) assert.match(line, /^\[.*\]$/, line);
});

test('this month so far: the hero, the subtitle and the share heading say so', () => {
  const september = view('2026-09', {
    summary: summary('2026-09', { income_minor: '2800000', expense_minor: '1245000', balance_minor: '1555000', categories: [total(BILLS, '1226800'), total(FOOD, '18200')] }),
    days: { days: ['2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28'], complete: true },
  });
  assert.ok(september.kind === 'recap');
  assert.deepEqual(september.header, { title: 'Month recap', subtitle: 'September 2026 so far', hero: '฿12,450.00 spent so far' });
  assert.equal(september.phase, 'current');
  assert.ok(september.share.startsWith('September 2026 so far in Jotbun\nSpent: ฿12,450.00\nEarned: ฿28,000.00\n'), september.share);
});

test('loading, a problem, an empty month and a month not started yet', () => {
  const input = { month: '2026-08', today: TODAY, outbox: [], tc, locale: 'en' as const, dateLocale: 'en' as const };
  assert.deepEqual(recapView({ ...input, load: { state: 'loading' } }), { kind: 'loading', header: { title: 'Month recap', subtitle: 'August 2026', hero: null }, label: 'Loading your diary' });
  const problem = recapView({ ...input, load: { state: 'error', error: new V1Error('network', 0, 'NETWORK_ERROR') } });
  assert.deepEqual(problem.kind === 'problem' && [problem.header.hero, problem.problem.retry], [null, true]);

  const nothing = { summary: summary('2026-08'), days: { days: [], complete: true } };
  const empty = view('2026-08', nothing);
  assert.ok(empty.kind === 'empty');
  assert.deepEqual([empty.title, empty.body, empty.canAdd, empty.header.hero, empty.bars.length], ['No entries in this month', 'Entries you add for this month show up here.', false, null, 6]);
  const emptyNow = view('2026-09', { ...nothing, summary: summary('2026-09') });
  assert.ok(emptyNow.kind === 'empty');
  assert.equal(emptyNow.canAdd, true);

  // Only moves between wallets: something was logged, so it is a recap, not empty.
  const moves = view('2026-08', { summary: summary('2026-08'), days: { days: ['2026-08-03'], complete: true } });
  assert.deepEqual(moves.kind === 'recap' && [moves.facts.spentText, moves.facts.kept.text, moves.facts.days.text], ['฿0.00', 'Earned and spent matched', '1 day']);

  const future = view('2026-11', { summary: null, days: { days: [], complete: true } });
  assert.ok(future.kind === 'empty');
  assert.deepEqual([future.phase, future.title, future.body, future.canAdd, future.header.subtitle], ['future', 'No entries in this month', "This month hasn't started yet.", false, 'November 2026']);
  assert.deepEqual(future.bars.filter((bar) => bar.selected), []);
});

test('the waiting note rides along on a recap and an empty month alike', () => {
  const outbox = [command(pending({ occurred_on: '2026-08-30' }), 'uncertain')];
  const recap = view('2026-08', {}, { outbox });
  const empty = view('2026-08', { summary: summary('2026-08'), days: { days: [], complete: true } }, { outbox });
  for (const result of [recap, empty]) assert.equal((result.kind === 'recap' || result.kind === 'empty') && result.waiting, "Entries still on this device aren't in this recap yet.");
});
