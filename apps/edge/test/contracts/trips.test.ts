// P5-T3: the trip, settings and rates contracts (spec section 6.10; X5, X17;
// default pending owner Q6). The first five cases are the plan's, verbatim
// (tc-trip-summary's yen trip and the golden rates); the last four are the
// brief's: every field of each shape, one guard at a time.
import {
  SYNC_ENTITY_VALIDATORS,
  TRIP_MAX_DAYS,
  addDays,
  isEntityChange,
  isHomeCurrencyPreview,
  isRatesTodayDto,
  isSettingsSnapshot,
  isTripSnapshot,
  isTripSummaryDto,
} from '@gogospend/contracts'
import { expect, it } from 'vitest'

const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`
const TRIP = uuid(1)
const SETTINGS = uuid(2)

const trip = { id: TRIP, name: 'ทริปญี่ปุ่น', currency: 'JPY', starts_on: '2026-11-01', ends_on: '2026-11-08', budget_minor: '120000', deleted_at: null, version: 1 }
const settings = { id: SETTINGS, home_currency: 'JPY', version: 2 }
const preview = { currency: 'JPY', records: 13, own_rates: 1, budgets: 2 }
const day = { date: '2026-11-03', spent_trip_minor: '6180', spent_home_minor: '142881', other_home_minor: '0' }
const summary = {
  trip,
  home_currency: 'THB',
  count: 13,
  totals: { spent_home_minor: '883184', spent_trip_minor: '38200', other_home_minor: '0' },
  days: [day],
  categories: [],
  rates: [],
  as_of_revision: '7',
}
const today = { base: 'USD', as_of: '2026-11-03', rates: { THB: { per_base: '34.68', day: '2026-11-03' }, JPY: { per_base: '150', day: '2026-11-02' } } }

it("the board's trip is valid; a trip ending first, longer than 366 days or with a zero budget is not", () => {
  expect(isTripSnapshot(trip)).toBe(true)
  expect([
    isTripSnapshot({ ...trip, ends_on: '2026-10-31' }),
    isTripSnapshot({ ...trip, ends_on: addDays('2026-11-01', 366) }),
    isTripSnapshot({ ...trip, budget_minor: '0' }),
    isTripSnapshot({ ...trip, currency: 'jpy' }),
    isTripSnapshot({ ...trip, extra: 1 }),
  ]).toEqual([false, false, false, false, false])
  expect(isTripSnapshot({ ...trip, ends_on: addDays('2026-11-01', 365) })).toBe(true)
  expect(TRIP_MAX_DAYS).toBe(366)
})

it('settings and the preview are exact', () => {
  expect(isSettingsSnapshot(settings)).toBe(true)
  expect(isSettingsSnapshot({ ...settings, home_currency: 'XAU' })).toBe(false)
  expect(isHomeCurrencyPreview(preview)).toBe(true)
  expect(isHomeCurrencyPreview({ ...preview, records: -1 })).toBe(false)
})

it('a trip summary is exact', () => {
  expect(isTripSummaryDto(summary)).toBe(true)
  const { date: _date, ...undated } = day
  expect(isTripSummaryDto({ ...summary, days: [undated] })).toBe(false)
})

it("today's rates are quotes against one base, none after the day", () => {
  expect(isRatesTodayDto(today)).toBe(true)
  const withQuote = (quote: Record<string, unknown>) => ({ ...today, rates: { ...today.rates, ...quote } })
  expect([
    isRatesTodayDto(withQuote({ USD: { per_base: '1', day: '2026-11-03' } })),
    isRatesTodayDto(withQuote({ JPY: { per_base: '0', day: '2026-11-02' } })),
    isRatesTodayDto(withQuote({ JPY: { per_base: '150', day: '2026-11-04' } })),
  ]).toEqual([false, false, false])
})

it('sync carries trips and settings, and an older reader skips them', () => {
  const tripChange = { entity: 'trip', id: TRIP, version: 1, state: 'active', snapshot: trip }
  const settingsChange = { entity: 'settings', id: SETTINGS, version: 2, state: 'active', snapshot: settings }
  expect([isEntityChange(tripChange), isEntityChange(settingsChange)]).toEqual([true, true])
  const { trip: _trip, ...older } = SYNC_ENTITY_VALIDATORS
  expect([isEntityChange(tripChange, older), isEntityChange(tripChange, older, { unknownEntities: 'skip' })]).toEqual([false, true])
})

it('every field of a trip is checked: its id, name, dates, budget, deletion and version', () => {
  expect([
    isTripSnapshot({ ...trip, budget_minor: null }),
    isTripSnapshot({ ...trip, budget_minor: '99999999999' }),
    isTripSnapshot({ ...trip, ends_on: '2026-11-01' }),
    isTripSnapshot({ ...trip, starts_on: '2027-12-31', ends_on: '2028-12-30' }),
    isTripSnapshot({ ...trip, deleted_at: '2026-11-09T03:00:00.000Z', version: 3 }),
  ]).toEqual([true, true, true, true, true])
  const { deleted_at: _deletedAt, ...missing } = trip
  expect(isTripSnapshot(missing)).toBe(false)
  const bad: Record<string, unknown>[] = [
    { id: 'trip-1' },
    { name: ' ทริปญี่ปุ่น' },
    { name: '' },
    { name: 7 },
    { currency: 'XAU' },
    { starts_on: '2026-02-30', ends_on: '2026-03-01' },
    { starts_on: '1969-12-30', ends_on: '1969-12-31' },
    { ends_on: '2026-11-08T00:00:00Z' },
    { starts_on: '2027-12-31', ends_on: '2028-12-31' },
    { budget_minor: '100000000000' },
    { budget_minor: '-1' },
    { budget_minor: 120000 },
    { budget_minor: '0120000' },
    { deleted_at: 'yesterday' },
    { version: 0 },
    { version: 1.5 },
  ]
  expect(bad.map((fields) => isTripSnapshot({ ...trip, ...fields }))).toEqual(bad.map(() => false))
})

it('every part of a summary is checked: its trip, count, sums, days, categories and rates', () => {
  const rate = { date: '2026-11-03', currency: 'JPY', rate: '0.2312', rate_source: 'reference', rate_date: '2026-11-03' }
  const category = { category_id: uuid(3), spent_trip_minor: '6180', spent_home_minor: '142881', other_home_minor: '0' }
  const full = { ...summary, categories: [category], rates: [rate, { ...rate, rate: '0.232792207792', rate_source: 'own', rate_date: null }] }
  expect([
    isTripSummaryDto(full),
    isTripSummaryDto({ ...full, totals: { ...summary.totals, spent_home_minor: '199999999998' } }),
  ]).toEqual([true, true])
  const bad: Record<string, unknown>[] = [
    { trip: { ...trip, budget_minor: '0' } },
    { home_currency: 'thb' },
    { count: -1 },
    { count: 1.5 },
    { totals: { ...summary.totals, spent_home_minor: '-1' } },
    { totals: { ...summary.totals, other_home_minor: 0 } },
    { totals: { ...summary.totals, extra: '0' } },
    { days: [{ ...day, date: '2026-11-31' }] },
    { days: day },
    { categories: [{ ...category, category_id: 'food' }] },
    { rates: [{ ...rate, rate: '0.23120' }] },
    { rates: [{ ...rate, rate_source: 'market' }] },
    { rates: [{ ...rate, rate_date: '2026-13-01' }] },
    { rates: [{ ...rate, currency: 'XAU' }] },
    { as_of_revision: 7 },
    { as_of_revision: '07' },
    { extra: 1 },
  ]
  expect(bad.map((fields) => isTripSummaryDto({ ...full, ...fields }))).toEqual(bad.map(() => false))
})

it('settings and the preview check every field', () => {
  expect([
    isSettingsSnapshot({ ...settings, home_currency: 'THB', version: 1 }),
    isHomeCurrencyPreview({ currency: 'VND', records: 0, own_rates: 0, budgets: 0 }),
  ]).toEqual([true, true])
  const { version: _version, ...unversioned } = settings
  expect([
    isSettingsSnapshot(unversioned),
    isSettingsSnapshot({ ...settings, id: 'settings' }),
    isSettingsSnapshot({ ...settings, home_currency: 'thb' }),
    isSettingsSnapshot({ ...settings, version: 0 }),
    isSettingsSnapshot({ ...settings, extra: 1 }),
  ]).toEqual([false, false, false, false, false])
  expect([
    isHomeCurrencyPreview({ ...preview, currency: 'jpy' }),
    isHomeCurrencyPreview({ ...preview, own_rates: 1.5 }),
    isHomeCurrencyPreview({ ...preview, budgets: '2' }),
    isHomeCurrencyPreview({ ...preview, extra: 1 }),
  ]).toEqual([false, false, false, false])
})

it("today's rates check the base, the day and each quote's text", () => {
  expect(isRatesTodayDto({ ...today, rates: { ...today.rates, VND: { per_base: '26345.5', day: '2026-10-31' } } })).toBe(true)
  const bad: Record<string, unknown>[] = [
    { base: 'usd' },
    { as_of: '2026-11-31' },
    { as_of: '1969-12-31', rates: {} },
    { rates: [] },
    { rates: { ...today.rates, XAU: { per_base: '0.0004', day: '2026-11-03' } } },
    { rates: { ...today.rates, jpy: { per_base: '150', day: '2026-11-02' } } },
    { rates: { ...today.rates, JPY: { per_base: '150.0', day: '2026-11-02' } } },
    { rates: { ...today.rates, JPY: { per_base: 150, day: '2026-11-02' } } },
    { rates: { ...today.rates, JPY: { per_base: '1234567890.123456', day: '2026-11-02' } } },
    { rates: { ...today.rates, JPY: { per_base: '150' } } },
    { rates: { ...today.rates, JPY: { per_base: '150', day: '2026-11-02', source: 'feed' } } },
    { extra: 1 },
  ]
  expect(bad.map((fields) => isRatesTodayDto({ ...today, ...fields }))).toEqual(bad.map(() => false))
})
