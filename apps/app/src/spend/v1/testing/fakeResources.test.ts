// The fake's phase 5 rules (P5-T17), which screen tests lean on: trips with
// versions and the overlap rule, a trip's summary from its records' stored
// amounts (P5-T12, X17), today's rates with an ETag (503 until set), and the
// home currency with its preview.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { BudgetDto, RatesTodayDto, TransactionDto, TripDto } from '@gogospend/contracts';

import { V1Error } from '../../../api/client.ts';
import { createFakeResources } from './fakeResources.ts';

/** A call's answer, or what it was refused with, never a thrown error: every check below is an assertion. */
const settled = (promise: Promise<unknown>): Promise<unknown> => promise.then(
  (value) => value,
  (error: unknown) => (error instanceof V1Error
    ? JSON.parse(JSON.stringify({ outcome: error.outcome, status: error.status, code: error.code, fields: error.fields, current: error.current, retryAfterSeconds: error.retryAfterSeconds }))
    : { thrown: error instanceof Error ? error.name : String(error) }),
);
const ack = (command: string, entity: string, version: number, revision: number, outcome: string, state = 'active') =>
  ({ command_id: command, entity_id: entity, version, committed_revision: String(revision), outcome, entity_state: state });
const overlap = (field: string) => ({ outcome: 'invalid', status: 422, code: 'VALIDATION_FAILED', fields: { [field]: 'errors.trip_overlap' } });

const JAPAN: TripDto = { id: '7a000000-0000-4000-8000-000000000001', name: 'ทริปญี่ปุ่น', currency: 'JPY', starts_on: '2026-11-01', ends_on: '2026-11-08', budget_minor: '120000', deleted_at: null, version: 1 };
const OLD: TripDto = { id: '7a000000-0000-4000-8000-000000000002', name: 'ทริปเชียงใหม่', currency: 'THB', starts_on: '2026-10-01', ends_on: '2026-10-05', budget_minor: null, deleted_at: '2026-10-20T00:00:00.000Z', version: 2 };
const KOREA = '7a000000-0000-4000-8000-000000000003';
const CHIANG_RAI = '7a000000-0000-4000-8000-000000000004';

test('the fake keeps trips with versions and refuses an overlap on create and edit', async () => {
  const fake = createFakeResources({ trips: [JAPAN, OLD] });
  const { resources } = fake;
  const korea = { id: KOREA, name: 'ทริปเกาหลี', currency: 'KRW', starts_on: '2026-11-09', ends_on: '2026-11-12' };
  const chiangRai = { id: CHIANG_RAI, name: 'ทริปเชียงราย', currency: 'THB', starts_on: '2026-10-02', ends_on: '2026-10-03', budget_minor: '500000' };
  const answers = [
    // Korea from 8 Nov shares Japan's last day.
    await settled(resources.createTrip({ ...korea, starts_on: '2026-11-08' }, 'k1')),
    // A deleted trip's days are free.
    await settled(resources.createTrip(chiangRai, 'k2')),
    await settled(resources.createTrip(korea, 'k3')),
    await settled(resources.createTrip({ ...korea, id: JAPAN.id, starts_on: '2026-12-01', ends_on: '2026-12-02' }, 'k4')),
    // Japan's end moved onto Korea's first day, then both of its ends.
    await settled(resources.updateTrip(JAPAN.id, 1, { ends_on: '2026-11-09' }, 'k5')),
    await settled(resources.updateTrip(JAPAN.id, 1, { starts_on: '2026-10-31', ends_on: '2026-11-09' }, 'k6')),
    // An edit inside its own dates overlaps nothing.
    await settled(resources.updateTrip(JAPAN.id, 1, { name: 'ทริปโตเกียว', budget_minor: null }, 'k7')),
    await settled(resources.updateTrip(JAPAN.id, 1, { name: 'x' }, 'k8')),
    await settled(resources.deleteTrip(JAPAN.id, 2, 'k9')),
    await settled(resources.updateTrip(JAPAN.id, 3, { name: 'y' }, 'k10')),
    await settled(resources.deleteTrip('7a000000-0000-4000-8000-0000000000ff', 1, 'k11')),
  ];
  const tokyo = { ...JAPAN, name: 'ทริปโตเกียว', budget_minor: null, version: 2 };
  assert.deepEqual(answers, [
    overlap('starts_on'),
    ack('k2', CHIANG_RAI, 1, 11, 'created'),
    ack('k3', KOREA, 1, 12, 'created'),
    { outcome: 'conflict', status: 409, code: 'VERSION_CONFLICT', current: JAPAN },
    overlap('ends_on'),
    overlap('starts_on'),
    ack('k7', JAPAN.id, 2, 13, 'updated'),
    { outcome: 'conflict', status: 409, code: 'VERSION_CONFLICT', current: tokyo },
    ack('k9', JAPAN.id, 3, 14, 'deleted', 'deleted'),
    { outcome: 'deleted', status: 409, code: 'ENTITY_DELETED' },
    { outcome: 'not_found', status: 404, code: 'NOT_FOUND' },
  ]);
  // Live trips only, the latest first; a trip created without a budget has none.
  assert.deepEqual(await settled(resources.trips()), [
    { ...korea, budget_minor: null, deleted_at: null, version: 1 },
    { ...chiangRai, deleted_at: null, version: 1 },
  ]);
  assert.deepEqual(fake.calls.map((call) => call.method), ['createTrip', 'createTrip', 'createTrip', 'createTrip', 'updateTrip', 'updateTrip', 'updateTrip', 'updateTrip', 'deleteTrip', 'updateTrip', 'deleteTrip', 'trips']);
});

// The summary's fixture, on a JPY trip in a baht home: yen, a dollar and two
// baht expenses over three days and four categories; an income and an
// exchange tagged with the trip; a deleted and an untagged expense.
const CARD = '0a000000-0000-4000-8000-000000000001';
const BANK = '0a000000-0000-4000-8000-000000000002';
const YEN_CASH = '0a000000-0000-4000-8000-000000000003';
const FIRST = '2c000000-0000-4000-8000-000000000000';
const FOOD = '2c000000-0000-4000-8000-000000000001';
const TRAIN = '2c000000-0000-4000-8000-000000000002';
const GIFT = '2c000000-0000-4000-8000-000000000003';
/** A tagged expense on the card, as the vault stores it (P5-T10). */
function expense(id: number, day: string, currency: string, amount: string, rate: string, home: string, category: string, extra: Record<string, unknown> = {}): TransactionDto {
  return {
    id: `0b000000-0000-4000-8000-${String(id).padStart(12, '0')}`, type: 'expense', amount_minor: amount, occurred_on: day, wallet_id: CARD, category_id: category,
    note: null, merchant: null, deleted_at: null, version: 1,
    currency, rate, rate_source: 'reference', rate_date: currency === 'THB' ? null : day, home_amount_minor: home, wallet_amount_minor: currency === 'THB' ? null : home, trip_id: JAPAN.id,
    ...extra,
  } as TransactionDto;
}
const EXCHANGE = {
  id: '0b000000-0000-4000-8000-000000000007', type: 'transfer', amount_minor: '1000000', occurred_on: '2026-11-03', source_wallet_id: BANK, destination_wallet_id: YEN_CASH,
  note: null, merchant: null, deleted_at: null, version: 1,
  currency: 'THB', rate: '1', rate_source: 'reference', rate_date: null, home_amount_minor: '1000000', to_amount_minor: '43000', trip_id: JAPAN.id,
} as TransactionDto;
const TRIP_RECORDS: TransactionDto[] = [
  expense(5, '2026-11-03', 'USD', '1250', '34.68', '43350', GIFT),
  expense(1, '2026-11-03', 'JPY', '1200', '0.2312', '27744', FOOD),
  expense(2, '2026-11-02', 'JPY', '3400', '0.2308', '78472', FOOD),
  expense(3, '2026-11-02', 'JPY', '7980', '0.2308', '184178', TRAIN),
  expense(4, '2026-11-03', 'THB', '31200', '1', '31200', GIFT),
  expense(6, '2026-11-03', 'JPY', '5000', '0.2312', '115600', GIFT, { type: 'income' }),
  EXCHANGE,
  expense(8, '2026-11-03', 'JPY', '4620', '0.2312', '106814', FOOD, { deleted_at: '2026-11-04T00:00:00.000Z', version: 2 }),
  expense(9, '2026-11-03', 'JPY', '360', '0.2312', '8323', TRAIN, { trip_id: null }),
  expense(10, '2026-11-04', 'THB', '74550', '1', '74550', FIRST),
];
const money = (home: string, trip: string, other: string) => ({ spent_home_minor: home, spent_trip_minor: trip, other_home_minor: other });
const rate = (date: string, currency: string, value: string, rateDate: string | null) => ({ date, currency, rate: value, rate_source: 'reference', rate_date: rateDate });

test("the fake's trip summary adds its tagged records' stored amounts, as the vault does", async () => {
  const fake = createFakeResources({ trips: [JAPAN, OLD], records: TRIP_RECORDS });
  assert.deepEqual(await settled(fake.resources.tripSummary(JAPAN.id)), {
    trip: JAPAN,
    home_currency: 'THB',
    // Every live tagged record, the income and the exchange included.
    count: 8,
    totals: money('439494', '12580', '149100'),
    days: [
      { date: '2026-11-02', ...money('262650', '11380', '0') },
      { date: '2026-11-03', ...money('102294', '1200', '74550') },
      { date: '2026-11-04', ...money('74550', '0', '74550') },
    ],
    // By home amount, the larger first; a tie by id.
    categories: [
      { category_id: TRAIN, ...money('184178', '7980', '0') },
      { category_id: FOOD, ...money('106216', '4600', '0') },
      { category_id: FIRST, ...money('74550', '0', '74550') },
      { category_id: GIFT, ...money('74550', '0', '74550') },
    ],
    // Each distinct rate of a record in another currency, by date, then currency.
    rates: [rate('2026-11-02', 'JPY', '0.2308', '2026-11-02'), rate('2026-11-03', 'JPY', '0.2312', '2026-11-03'), rate('2026-11-03', 'USD', '34.68', '2026-11-03')],
    as_of_revision: '10',
  });
  // A deleted trip, or one that never was, has no summary.
  assert.deepEqual([await settled(fake.resources.tripSummary(OLD.id)), await settled(fake.resources.tripSummary(KOREA))], [
    { outcome: 'not_found', status: 404, code: 'NOT_FOUND' },
    { outcome: 'not_found', status: 404, code: 'NOT_FOUND' },
  ]);
  // In a yen home the rates used are those of the baht and dollar records.
  const yenHome = createFakeResources({ trips: [JAPAN], records: TRIP_RECORDS, settings: { id: '5e000000-0000-4000-8000-000000000001', home_currency: 'JPY', version: 1 } });
  const summary = await settled(yenHome.resources.tripSummary(JAPAN.id)) as { home_currency?: unknown; rates?: unknown };
  assert.deepEqual([summary.home_currency, summary.rates], ['JPY', [rate('2026-11-03', 'THB', '1', null), rate('2026-11-03', 'USD', '34.68', '2026-11-03'), rate('2026-11-04', 'THB', '1', null)]]);
  assert.deepEqual(fake.calls.map((call) => call.method), ['tripSummary', 'tripSummary', 'tripSummary']);
});

const NOV_2: RatesTodayDto = { base: 'USD', as_of: '2026-11-02', rates: { THB: { per_base: '34.62', day: '2026-11-02' }, JPY: { per_base: '150', day: '2026-11-02' } } };
const NOV_3: RatesTodayDto = { base: 'USD', as_of: '2026-11-03', rates: { THB: { per_base: '34.68', day: '2026-11-03' }, JPY: { per_base: '150', day: '2026-11-03' } } };

test('the fake answers 503 until rates are set, then the set with its ETag, and unchanged for that ETag', async () => {
  const fake = createFakeResources();
  const unavailable = { outcome: 'unavailable', status: 503, code: 'SERVICE_UNAVAILABLE', retryAfterSeconds: 300 };
  const before = await settled(fake.resources.ratesToday());
  const first = fake.setRates(NOV_2);
  const answers = [await settled(fake.resources.ratesToday()), await settled(fake.resources.ratesToday(first ?? undefined)), await settled(fake.resources.ratesToday('"stale"'))];
  // A new set has a new ETag, so the old one no longer answers unchanged.
  const second = fake.setRates(NOV_3);
  const later = await settled(fake.resources.ratesToday(first ?? undefined));
  const cleared = fake.setRates(null);
  const after = await settled(fake.resources.ratesToday(second ?? undefined));
  assert.deepEqual([before, answers, later, after], [
    unavailable,
    [{ etag: first, rates: NOV_2 }, 'unchanged', { etag: first, rates: NOV_2 }],
    { etag: second, rates: NOV_3 },
    unavailable,
  ]);
  assert.deepEqual([typeof first, first === second, cleared], ['string', false, null]);
  assert.equal(fake.callsOf('ratesToday').length, 6);
});

test('the fake changes the home currency with versions, and previews from its records', async () => {
  const yen = (id: number, source: string, extra: Record<string, unknown> = {}) => expense(id, '2026-11-03', 'JPY', '4620', '0.2312', '106814', FOOD, { rate_source: source, trip_id: null, ...extra });
  const older = { id: '0b000000-0000-4000-8000-000000000020', type: 'expense', amount_minor: '6500', occurred_on: '2026-09-20', wallet_id: CARD, category_id: FOOD, note: null, merchant: null, deleted_at: null, version: 1 } as TransactionDto;
  const budget = (month: string): BudgetDto => ({ id: `0d000000-0000-4000-8000-0000000000${month.slice(5)}`, month, overall_limit_minor: '1800000', category_limits: [], version: 1 });
  const fake = createFakeResources({
    records: [yen(21, 'own'), yen(22, 'exchange'), yen(23, 'reference'), yen(24, 'reference', { deleted_at: '2026-11-04T00:00:00.000Z', version: 2 }), older],
    budgets: [budget('2026-10'), budget('2026-11')],
  });
  const { resources } = fake;
  // Records not purged (a deleted one included), those at an own or exchange rate, and stored budget months.
  assert.deepEqual(await settled(resources.homeCurrencyPreview('JPY')), { currency: 'JPY', records: 5, own_rates: 2, budgets: 2 });
  const same = { outcome: 'invalid', status: 422, code: 'VALIDATION_FAILED', fields: { currency: 'errors.home_currency_same' } };
  const answers = [
    // No settings row yet: no version may be named.
    await settled(resources.setHomeCurrency('JPY', 1, 'h1')),
    await settled(resources.setHomeCurrency('THB', null, 'h2')),
    await settled(resources.setHomeCurrency('JPY', null, 'h3')),
    await settled(resources.setHomeCurrency('USD', null, 'h4')),
    await settled(resources.setHomeCurrency('JPY', 1, 'h5')),
    await settled(resources.setHomeCurrency('USD', 1, 'h6')),
  ];
  const settings = fake.settings();
  const id = settings?.id ?? 'none';
  assert.deepEqual(answers, [
    { outcome: 'conflict', status: 409, code: 'VERSION_CONFLICT', current: null },
    same,
    ack('h3', id, 1, 11, 'updated'),
    { outcome: 'conflict', status: 409, code: 'VERSION_CONFLICT', current: { id, home_currency: 'JPY', version: 1 } },
    same,
    ack('h6', id, 2, 12, 'updated'),
  ]);
  assert.deepEqual(settings, { id, home_currency: 'USD', version: 2 });
  assert.deepEqual(fake.calls.map((call) => call.method), ['homeCurrencyPreview', ...answers.map(() => 'setHomeCurrency')]);
});
