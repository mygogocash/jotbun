// P5-T2: currencies, looks, icons and pack keys on wallets, categories and
// records, in the contract in place (C2, X7, X8; B15 and B17 by their
// defaults, owner Q2 and Q4). The first four cases are the plan's; the last
// five are the brief's: the lists, then each new guard of each shape, one
// at a time, and an older record as the P5-T4 migration filled its row.
import {
  BUN_FACES,
  CATEGORY_PICKER_GLYPHS,
  EXPORT_CSV_COLUMNS,
  HISTORY_MAX_WALLETS,
  PACK_KEYS,
  RECORD_MONEY_KEYS,
  VAULT_EXPORT_CSV_COLUMNS,
  VAULT_EXPORT_CSV_CURRENCY_COLUMNS,
  WALLET_KINDS,
  WALLET_MATERIALS,
  isCategorySnapshot,
  isTransactionSnapshot,
  isWalletSnapshot,
} from '@gogospend/contracts'
import { expect, it } from 'vitest'

const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`
// Hex letters, so its upper-case spelling differs.
const TRIP = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const RECEIPT = uuid(10)

// Today's shapes, as the vault sends them before phase 5.
const wallet = { id: uuid(1), name: 'เงินสด', currency: 'THB', opening_minor: '403200', tracking_start: '2026-09-01', archived: false, version: 1 }
const custom = { id: uuid(2), type: 'expense', builtin_key: null, label: 'ทำบุญ', color: '#F291C4', archived: false, version: 1 }
const builtin = { id: uuid(3), type: 'expense', builtin_key: 'food', label: null, color: '#F0A868', archived: false, version: 1 }
const entry = { id: uuid(4), type: 'expense', amount_minor: '6500', occurred_on: '2026-11-03', wallet_id: uuid(1), category_id: uuid(2), note: null, merchant: null, deleted_at: null, version: 1 }
const transfer = { id: uuid(5), type: 'transfer', amount_minor: '150000', occurred_on: '2026-11-01', source_wallet_id: uuid(1), destination_wallet_id: uuid(6), note: null, merchant: null, deleted_at: null, version: 1 }

// A yen wallet with its look, and the plan's yen expense and cash exchange.
const look = { ...wallet, currency: 'JPY', type: 'cash', material: 'sky', bun_face: 'wow' }
const yen = { ...entry, amount_minor: '4620', currency: 'JPY', rate: '0.2312', rate_source: 'reference', rate_date: '2026-11-03', home_amount_minor: '106814', wallet_amount_minor: '106814', trip_id: TRIP }
const exchange = { ...transfer, amount_minor: '1000000', currency: 'THB', rate: '1', rate_source: 'reference', rate_date: null, home_amount_minor: '1000000', to_amount_minor: '43000', trip_id: null }

it('an older wallet is THB; a newer one carries its currency and its look', () => {
  const { material: _material, ...noMaterial } = look
  expect([isWalletSnapshot(wallet), isWalletSnapshot({ ...wallet, currency: 'USD' })]).toEqual([true, false])
  expect(isWalletSnapshot(look)).toBe(true)
  expect([isWalletSnapshot({ ...look, type: 'ewallet' }), isWalletSnapshot(noMaterial), isWalletSnapshot({ ...look, currency: 'jpy' })]).toEqual([false, false, false])
})

it('a category has its icon and pack key, or neither', () => {
  expect([isCategorySnapshot({ ...custom, icon: 'lotus', pack_key: 'merit' }), isCategorySnapshot({ ...builtin, icon: null, pack_key: null })]).toEqual([true, true])
  expect([
    isCategorySnapshot({ ...builtin, icon: null, pack_key: 'merit' }),
    isCategorySnapshot({ ...custom, icon: 'boat', pack_key: null }),
    isCategorySnapshot({ ...custom, icon: 'lotus' }),
  ]).toEqual([false, false, false])
})

it('a record carries all of its money fields or none', () => {
  expect([isTransactionSnapshot(yen), isTransactionSnapshot({ ...yen, home_amount_minor: '0' })]).toEqual([true, true])
  const { trip_id: _trip, ...noTrip } = yen
  expect([
    isTransactionSnapshot(noTrip),
    isTransactionSnapshot({ ...yen, rate: '0.23120' }),
    isTransactionSnapshot({ ...yen, rate_source: 'market' }),
    isTransactionSnapshot({ ...yen, home_amount_minor: '-1' }),
    isTransactionSnapshot({ ...yen, to_amount_minor: '43000' }),
  ]).toEqual([false, false, false, false, false])
  expect([isTransactionSnapshot(exchange), isTransactionSnapshot({ ...exchange, wallet_amount_minor: '1000000' })]).toEqual([true, false])
  // The older shapes of apps/api's contract spec, with and without attachment_id and source.
  const common = { id: 'a', amount_minor: '6500', occurred_on: '2026-09-20', note: null, merchant: null, deleted_at: null, version: 1 }
  const older = [{ ...common, type: 'expense', wallet_id: 'w', category_id: 'c' }, { ...common, type: 'transfer', source_wallet_id: 'w', destination_wallet_id: 'v' }]
  for (const record of older) {
    for (const extra of [{}, { attachment_id: RECEIPT }, { source: 'typed' }, { attachment_id: RECEIPT, source: 'photo' }]) {
      expect([record.type, extra, isTransactionSnapshot({ ...record, ...extra })]).toEqual([record.type, extra, true])
    }
  }
})

it("the vault's export header is today's 18 columns, then the 15 currency columns", () => {
  const currencyColumns = ['rate', 'rate_source', 'rate_date', 'home_amount', 'home_amount_minor', 'home_currency', 'wallet_amount', 'wallet_amount_minor', 'wallet_currency', 'to_amount', 'to_amount_minor', 'to_currency', 'trip_id', 'trip_name', 'source']
  expect(VAULT_EXPORT_CSV_COLUMNS.slice(18)).toEqual(currencyColumns)
  expect(VAULT_EXPORT_CSV_COLUMNS.slice(0, 18)).toEqual([...EXPORT_CSV_COLUMNS])
  expect(VAULT_EXPORT_CSV_CURRENCY_COLUMNS).toEqual(currencyColumns)
})

it("the contract's lists are the boards', in order, and a filter names at most 20 wallets", () => {
  expect([[...WALLET_KINDS], [...WALLET_MATERIALS], [...BUN_FACES]]).toEqual([
    ['cash', 'bank', 'credit_card', 'transit'],
    ['silk', 'paper', 'titanium', 'sky', 'peach'],
    ['smile', 'wink', 'calm', 'happy', 'wow'],
  ])
  expect([[...CATEGORY_PICKER_GLYPHS], [...PACK_KEYS]]).toEqual([
    ['food', 'coffee', 'car', 'bag', 'home', 'receipt', 'heart', 'lotus', 'gift', 'phone', 'paw', 'book'],
    ['family_out', 'merit', 'delivery', 'motorbike_rail', 'topup', 'seven', 'lottery', 'pets', 'family_in'],
  ])
  expect([[...RECORD_MONEY_KEYS], HISTORY_MAX_WALLETS]).toEqual([['currency', 'home_amount_minor', 'rate', 'rate_date', 'rate_source', 'trip_id'], 20])
})

it("each look is one of its list or none, and a wallet with its look takes any ISO currency, THB included", () => {
  const accepted = [
    { ...look, type: null, material: null, bun_face: null },
    { ...look, currency: 'THB' },
    ...WALLET_KINDS.map((type) => ({ ...look, type })),
    ...WALLET_MATERIALS.map((material) => ({ ...look, material })),
    ...BUN_FACES.map((bun_face) => ({ ...look, bun_face })),
  ]
  for (const shape of accepted) expect([shape, isWalletSnapshot(shape)]).toEqual([shape, true])
  const refused = [
    { ...look, material: 'gold' },
    { ...look, bun_face: 'grin' },
    { ...look, currency: 'XAU' },
    { ...look, extra: 1 },
    { ...wallet, type: 'cash' },
  ]
  for (const shape of refused) expect([shape, isWalletSnapshot(shape)]).toEqual([shape, false])
})

it("a category's icon and pack key are each one of its list or none, and a built-in may have an icon", () => {
  const accepted = [
    { ...builtin, icon: 'food', pack_key: null },
    { ...custom, icon: null, pack_key: 'family_in' },
    ...CATEGORY_PICKER_GLYPHS.map((icon) => ({ ...custom, icon, pack_key: null })),
    ...PACK_KEYS.map((pack_key) => ({ ...custom, icon: null, pack_key })),
  ]
  for (const shape of accepted) expect([shape, isCategorySnapshot(shape)]).toEqual([shape, true])
  const refused = [
    { ...custom, icon: null, pack_key: 'temple' },
    { ...custom, pack_key: 'merit' },
    { ...custom, icon: 'lotus', pack_key: 'merit', extra: 1 },
  ]
  for (const shape of refused) expect([shape, isCategorySnapshot(shape)]).toEqual([shape, false])
})

it('each money field is checked: the currency, the rate and its day, the amounts and the trip', () => {
  const accepted = [
    { ...yen, wallet_amount_minor: null },
    { ...yen, wallet_amount_minor: '0' },
    { ...yen, home_amount_minor: '99999999999', wallet_amount_minor: '99999999999' },
    { ...yen, rate_source: 'own', rate_date: null },
    { ...yen, rate_source: 'exchange', rate_date: null },
    { ...yen, trip_id: null },
    { ...yen, attachment_id: RECEIPT, source: 'photo' },
    { ...exchange, to_amount_minor: null },
    { ...exchange, to_amount_minor: '1' },
  ]
  for (const shape of accepted) expect([shape, isTransactionSnapshot(shape)]).toEqual([shape, true])
  const refused = [
    { ...yen, currency: 'XAU' },
    { ...yen, currency: 'jpy' },
    { ...yen, rate_date: '2026-02-30' },
    { ...yen, rate_date: '1969-12-31' },
    { ...yen, home_amount_minor: null },
    { ...yen, home_amount_minor: '100000000000' },
    { ...yen, wallet_amount_minor: '-5' },
    { ...yen, wallet_amount_minor: '100000000000' },
    { ...exchange, to_amount_minor: '0' },
    { ...exchange, to_amount_minor: '100000000000' },
    { ...yen, trip_id: 'ทริปญี่ปุ่น' },
    { ...yen, trip_id: TRIP.toUpperCase() },
  ]
  for (const shape of refused) expect([shape, isTransactionSnapshot(shape)]).toEqual([shape, false])
})

it('an older record, as the P5-T4 migration filled its row, is baht at 1 and valid', () => {
  const baht = { currency: 'THB', rate: '1', rate_source: 'reference', rate_date: null, trip_id: null }
  expect([
    isTransactionSnapshot({ ...entry, ...baht, home_amount_minor: entry.amount_minor, wallet_amount_minor: null }),
    isTransactionSnapshot({ ...transfer, ...baht, home_amount_minor: transfer.amount_minor, to_amount_minor: null }),
  ]).toEqual([true, true])
})
