// P5-T4: the currency migration (B18) on a vault that already holds today's rows.
// Each case puts a vault back in the shape before the migration (migrateBefore),
// seeds rows with SQL, then migrates as a wake does.
import { env } from 'cloudflare:workers'
import { runInDurableObject } from 'cloudflare:test'
import { drizzle } from 'drizzle-orm/durable-sqlite'
import { migrate } from 'drizzle-orm/durable-sqlite/migrator'
import { expect, it } from 'vitest'

import { VAULT_MIGRATIONS } from '../../src/vault/migrations'
import { migrateBefore } from './support/migrations'

const SUFFIX = '_currencies_trips'
const AT = '2026-10-25T00:00:00.000Z'
const LATER = '2026-10-26T00:00:00.000Z'
const CAP = 99999999999
const USER_TABLES = "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name <> '__drizzle_migrations' ORDER BY name"
const NAMING_WALLETS = "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE type IN ('trigger', 'view') AND sql LIKE '%wallets%' ORDER BY name"
const WALLET_COLUMNS = ['id', 'name', 'currency', 'opening_minor', 'tracking_start', 'archived', 'version', 'created_at', 'updated_at']
const WALLET_ROWS = 'SELECT *, CAST(opening_minor AS TEXT) AS opening_text FROM wallets ORDER BY id'
// Every reference to a wallet, and how many name no wallet (a join, not a pragma).
const DANGLING = `SELECT count(*) AS refs, coalesce(sum(w.id IS NULL), 0) AS missing FROM (
    SELECT wallet_id AS id FROM transactions WHERE wallet_id IS NOT NULL
    UNION ALL SELECT source_wallet_id FROM transactions WHERE source_wallet_id IS NOT NULL
    UNION ALL SELECT destination_wallet_id FROM transactions WHERE destination_wallet_id IS NOT NULL
    UNION ALL SELECT wallet_id FROM import_selection_rows
  ) r LEFT JOIN wallets w ON w.id = r.id`

type Row = Record<string, SqlStorageValue>
type Seeded = { cash: string; card: string; food: string; bonus: string; expense: string; income: string; transfer: string; attachment: string; selection: string }

const uuid = () => crypto.randomUUID()
const vault = () => env.VAULT.get(env.VAULT.idFromName(uuid()))
const rows = (state: DurableObjectState, query: string, ...bindings: unknown[]): Row[] => state.storage.sql.exec<Row>(query, ...bindings).toArray()
const run = (state: DurableObjectState, query: string, ...bindings: unknown[]): void => {
  state.storage.sql.exec(query, ...bindings).toArray()
}
const columnsOf = (state: DurableObjectState, table: string) => rows(state, `PRAGMA table_info(${table})`).map((column) => column.name)
const upgrade = (state: DurableObjectState) => migrate(drizzle(state.storage), VAULT_MIGRATIONS)
/** Inserts one row from named values. */
const insert = (state: DurableObjectState, table: string, values: Record<string, unknown>) =>
  run(state, `INSERT INTO ${table} (${Object.keys(values).join(', ')}) VALUES (${Object.keys(values).map(() => '?').join(', ')})`, ...Object.values(values))

/**
 * Today's rows, in the shape before the migration: a cash wallet and an archived
 * card at the cap, an expense holding a receipt, a deleted income at the cap, a
 * transfer between the two wallets, and an import selection row naming the cash
 * wallet.
 */
function seedToday(state: DurableObjectState): Seeded {
  const s: Seeded = { cash: uuid(), card: uuid(), food: uuid(), bonus: uuid(), expense: uuid(), income: uuid(), transfer: uuid(), attachment: uuid(), selection: uuid() }
  const job = uuid()
  const wallet = 'INSERT INTO wallets (id, name, currency, opening_minor, tracking_start, archived, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  run(state, wallet, s.cash, 'เงินสด', 'THB', 403200, '2026-01-01', 0, 3, AT, LATER)
  run(state, wallet, s.card, 'บัตรเครดิต', 'THB', CAP, '1970-01-01', 1, 2, AT, LATER)
  const category = 'INSERT INTO categories (id, type, builtin_key, label, color, archived, version, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, 0, 1, ?, ?)'
  run(state, category, s.food, 'expense', 'ข้าว', '#FFB400', AT, AT)
  run(state, category, s.bonus, 'income', 'โบนัส', null, AT, AT)
  const record = 'INSERT INTO transactions (id, type, amount_minor, occurred_on, wallet_id, category_id, source_wallet_id, destination_wallet_id, note, merchant, version, deleted_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  run(state, record, s.expense, 'expense', 4500, '2026-10-20', s.cash, s.food, null, null, 'ข้าวมันไก่', 'เจ๊ไฝ', 2, null, AT, LATER)
  run(state, record, s.income, 'income', CAP, '2026-10-01', s.card, s.bonus, null, null, null, null, 2, LATER, AT, LATER)
  run(state, record, s.transfer, 'transfer', 1000000, '2026-10-21', null, null, s.cash, s.card, null, null, 1, null, AT, AT)
  run(state, "INSERT INTO attachments (id, source_job_id, status, object_key, content_type, bytes, sha256, width, height, retained_at, released_at) VALUES (?, ?, 'retained', ?, 'image/jpeg', 10, ?, 1, 1, ?, NULL)", s.attachment, uuid(), `receipt/${'f'.repeat(64)}/${s.attachment}/${uuid()}/image.jpg`, 'a'.repeat(64), AT)
  run(state, 'INSERT INTO transaction_attachments (transaction_id, attachment_id, attached_at) VALUES (?, ?, ?)', s.expense, s.attachment, AT)
  run(state, "INSERT INTO import_uploads (job_id, intake_token, status, file_name, declared_type, declared_bytes, format, bytes, sha256, part_count, parse_state, parse_attempts, created_at, receive_deadline, accepted_at, expires_at) VALUES (?, 'token', 'accepted', 'statement.csv', 'text/csv', 10, 'csv', 10, ?, 1, 'parsed', 1, ?, ?, ?, ?)", job, 'b'.repeat(64), AT, AT, AT, LATER)
  run(state, "INSERT INTO import_previews (job_id, status, layout, issues, candidate_count, review_required_count, review_revision, created_at, expires_at) VALUES (?, 'ready', 'generic', '[]', 1, 0, 1, ?, ?)", job, AT, LATER)
  run(state, 'INSERT INTO import_selections (selection_id, job_id, frozen_revision, row_count, created_at, expires_at) VALUES (?, ?, 1, 1, ?, ?)', s.selection, job, AT, LATER)
  run(state, "INSERT INTO import_selection_rows (selection_id, source_row_id, ordinal, type, amount_minor, occurred_on, wallet_id, category_id, note, merchant) VALUES (?, 'row:1', 1, 'expense', 4500, '2026-10-20', ?, ?, NULL, NULL)", s.selection, s.cash, s.food)
  return s
}

/** Runs a case in a fresh vault put back before the migration and holding today's rows. */
const today = (test: (state: DurableObjectState, s: Seeded) => Promise<void>) =>
  runInDurableObject(vault(), async (_vault, state) => {
    await migrateBefore(state, SUFFIX)
    await test(state, seedToday(state))
  })

it('the rebuilt wallets keep every row and every reference to them', () =>
  today(async (state, s) => {
    const before = rows(state, WALLET_ROWS)
    const indexes = rows(state, 'PRAGMA index_list(wallets)')
    await upgrade(state)
    const after = rows(state, WALLET_ROWS)
    expect(after).toEqual(before.map((wallet) => ({ ...wallet, type: null, material: null, bun_face: null })))
    expect(after.map((wallet) => [wallet.id === s.card, wallet.archived, wallet.opening_text])).toEqual(expect.arrayContaining([[true, 1, String(CAP)], [false, 0, '403200']]))
    expect(rows(state, 'PRAGMA index_list(wallets)')).toEqual(indexes)
    expect(rows(state, 'SELECT transaction_id, attachment_id FROM transaction_attachments')).toEqual([{ transaction_id: s.expense, attachment_id: s.attachment }])
    expect(rows(state, 'SELECT selection_id, wallet_id, category_id FROM import_selection_rows')).toEqual([{ selection_id: s.selection, wallet_id: s.cash, category_id: s.food }])
    expect(rows(state, DANGLING)).toEqual([{ refs: 5, missing: 0 }])
    expect(() =>
      run(state, "INSERT INTO transactions (id, type, amount_minor, occurred_on, wallet_id, category_id, version, created_at, updated_at) VALUES (?, 'expense', 100, '2026-10-22', ?, ?, 1, ?, ?)", uuid(), uuid(), s.food, AT, AT),
    ).toThrow(/FOREIGN KEY/)
    // The next wake migrates again and changes nothing.
    await upgrade(state)
    expect(rows(state, WALLET_ROWS)).toEqual(after)
    expect(rows(state, 'SELECT count(*) AS n FROM __drizzle_migrations')).toEqual([{ n: VAULT_MIGRATIONS.journal.entries.length }])
  }))

it('every table that references wallets keeps its rows', () =>
  today(async (state) => {
    const references = () =>
      rows(state, USER_TABLES).flatMap(({ name }) =>
        rows(state, `PRAGMA foreign_key_list(${String(name)})`)
          .filter((key) => key.table === 'wallets')
          .map((key) => ({ table: String(name), column: String(key.from), to: key.to })),
      )
    const held = (refs: ReturnType<typeof references>) =>
      refs.map(({ table, column }) => ({
        table,
        column,
        count: rows(state, `SELECT count(*) AS n FROM ${table}`)[0].n,
        values: rows(state, `SELECT ${column} AS v FROM ${table} ORDER BY rowid`).map((row) => row.v),
      }))
    const before = references()
    const was = held(before)
    await upgrade(state)
    expect(columnsOf(state, 'wallets')).toEqual([...WALLET_COLUMNS, 'type', 'material', 'bun_face'])
    expect(before.map(({ table, column }) => `${table}.${column}`)).toEqual(
      expect.arrayContaining(['import_selection_rows.wallet_id', 'transactions.destination_wallet_id', 'transactions.source_wallet_id', 'transactions.wallet_id']),
    )
    expect(references()).toEqual(before)
    expect(held(before)).toEqual(was)
  }))

it('older records gain THB money fields', () =>
  today(async (state, s) => {
    const kept = (row: Row) => [row.id, row.version, row.updated_at, row.deleted_at]
    const before = rows(state, 'SELECT * FROM transactions ORDER BY id').map(kept)
    await upgrade(state)
    const after = rows(state, 'SELECT * FROM transactions ORDER BY id')
    expect(after.map(({ currency, rate, rate_source, rate_date, wallet_amount_minor, to_amount_minor, trip_id }) => ({ currency, rate, rate_source, rate_date, wallet_amount_minor, to_amount_minor, trip_id }))).toEqual(
      before.map(() => ({ currency: 'THB', rate: '1', rate_source: 'reference', rate_date: null, wallet_amount_minor: null, to_amount_minor: null, trip_id: null })),
    )
    const amounts: [string, string][] = [[s.expense, '4500'], [s.income, String(CAP)], [s.transfer, '1000000']]
    expect(rows(state, 'SELECT id, CAST(amount_minor AS TEXT) AS amount_minor, CAST(home_amount_minor AS TEXT) AS home_amount_minor FROM transactions ORDER BY id')).toEqual(
      amounts.sort(([a], [b]) => (a < b ? -1 : 1)).map(([id, amount]) => ({ id, amount_minor: amount, home_amount_minor: amount })),
    )
    // The backfill moves no version, time or deletion, so no phone sees a change.
    expect(after.map(kept)).toEqual(before)
  }))

it('a wallet takes any ISO-shaped currency and never changes it', () =>
  today(async (state, s) => {
    await upgrade(state)
    expect(() => run(state, "UPDATE wallets SET currency = 'USD' WHERE id = ?", s.cash)).toThrow(/wallet currency is immutable/)
    run(state, "UPDATE wallets SET currency = 'THB', name = 'กระเป๋า', version = version + 1 WHERE id = ?", s.cash)
    expect(rows(state, 'SELECT name, currency, version FROM wallets WHERE id = ?', s.cash)).toEqual([{ name: 'กระเป๋า', currency: 'THB', version: 4 }])
    const wallet = (id: string, currency: string) => insert(state, 'wallets', { id, name: 'เงินสดเยน', currency, opening_minor: 0, tracking_start: '2026-11-01', archived: 0, version: 1, created_at: AT, updated_at: AT })
    const yen = uuid()
    wallet(yen, 'JPY')
    expect(rows(state, 'SELECT currency FROM wallets WHERE id = ?', yen)).toEqual([{ currency: 'JPY' }])
    expect(() => wallet(uuid(), 'jpy')).toThrow(/CHECK/)
    expect(() => wallet(uuid(), 'JPYX')).toThrow(/CHECK/)
    expect(() => run(state, "UPDATE wallets SET currency = 'THB' WHERE id = ?", yen)).toThrow(/wallet currency is immutable/)
  }))

it('the new columns keep their rules', () =>
  today(async (state, s) => {
    await upgrade(state)
    const record = (type: 'expense' | 'transfer', extra: Record<string, unknown>) =>
      insert(state, 'transactions', {
        id: uuid(),
        type,
        amount_minor: 4620,
        occurred_on: '2026-11-03',
        ...(type === 'transfer' ? { source_wallet_id: s.cash, destination_wallet_id: s.card } : { wallet_id: s.cash, category_id: s.food }),
        version: 1,
        created_at: AT,
        updated_at: AT,
        ...extra,
      })
    expect(() => record('expense', { to_amount_minor: 100 })).toThrow(/CHECK/)
    expect(() => record('transfer', { wallet_amount_minor: 100 })).toThrow(/CHECK/)
    expect(() => record('expense', { home_amount_minor: -1 })).toThrow(/CHECK/)
    expect(() => record('expense', { rate_source: 'market' })).toThrow(/CHECK/)
    expect(() =>
      insert(state, 'trips', { id: uuid(), name: 'ทริปญี่ปุ่น', currency: 'JPY', starts_on: '2026-11-08', ends_on: '2026-11-01', budget_minor: 120000, version: 1, created_at: AT, updated_at: AT }),
    ).toThrow(/CHECK/)
    expect(() =>
      insert(state, 'categories', { id: uuid(), type: 'expense', builtin_key: 'food', label: null, color: null, archived: 0, version: 1, created_at: AT, updated_at: AT, pack_key: 'merit' }),
    ).toThrow(/CHECK/)
    expect(rows(state, 'SELECT (SELECT count(*) FROM transactions) AS records, (SELECT count(*) FROM trips) AS trips, (SELECT count(*) FROM categories) AS categories')).toEqual([{ records: 3, trips: 0, categories: 2 }])
  }))

it('the triggers and views naming wallets are the same after the rebuild', () =>
  today(async (state) => {
    const before = rows(state, NAMING_WALLETS)
    await upgrade(state)
    const after = rows(state, NAMING_WALLETS)
    // The one this migration adds is the immutability trigger.
    expect(after.filter((row) => row.name !== 'wallets_currency_immutable')).toEqual(before)
    expect(after.find((row) => row.name === 'wallets_currency_immutable')).toMatchObject({ type: 'trigger', tbl_name: 'wallets' })
  }))

// The brief's cases (beyond the plan's six).

it('the new columns take what phase 5 writes and refuse every shape outside their rules', () =>
  today(async (state, s) => {
    await upgrade(state)
    const outcome = (write: () => void): string => {
      try {
        write()
        return 'ok'
      } catch (error) {
        return /CHECK constraint failed/.test(String(error)) ? 'CHECK' : String(error)
      }
    }
    const wallet = (extra: Record<string, unknown>) =>
      insert(state, 'wallets', { id: uuid(), name: 'เงินสดเยน', currency: 'JPY', opening_minor: 0, tracking_start: '2026-11-01', archived: 0, version: 1, created_at: AT, updated_at: AT, ...extra })
    const record = (type: 'expense' | 'transfer', extra: Record<string, unknown>) =>
      insert(state, 'transactions', {
        id: uuid(),
        type,
        amount_minor: 4620,
        occurred_on: '2026-11-03',
        ...(type === 'transfer' ? { source_wallet_id: s.cash, destination_wallet_id: s.card } : { wallet_id: s.cash, category_id: s.food }),
        version: 1,
        created_at: AT,
        updated_at: AT,
        ...extra,
      })
    const trip = (extra: Record<string, unknown>) =>
      insert(state, 'trips', { id: uuid(), name: 'ทริปญี่ปุ่น', currency: 'JPY', starts_on: '2026-11-01', ends_on: '2026-11-08', budget_minor: 120000, version: 1, created_at: AT, updated_at: AT, ...extra })
    const settings = (extra: Record<string, unknown>) => insert(state, 'settings', { id: 1, entity_id: uuid(), home_currency: 'JPY', version: 1, updated_at: AT, ...extra })
    const category = (extra: Record<string, unknown>) =>
      insert(state, 'categories', { id: uuid(), type: 'expense', builtin_key: null, label: 'ทำบุญ', color: null, archived: 0, version: 1, created_at: AT, updated_at: AT, ...extra })
    const cases: [string, () => void, 'ok' | 'CHECK'][] = [
      ['a yen cash wallet with its look', () => wallet({ type: 'credit_card', material: 'titanium', bun_face: 'wow' }), 'ok'],
      ['a look with a capital', () => wallet({ type: 'Cash' }), 'CHECK'],
      ['a look of 33 characters', () => wallet({ material: 'a'.repeat(33) }), 'CHECK'],
      ['an empty face', () => wallet({ bun_face: '' }), 'CHECK'],
      ['the yen expense on a trip that does not exist (X4)', () => record('expense', { currency: 'JPY', rate: '0.2312', rate_source: 'reference', rate_date: '2026-11-03', home_amount_minor: 106814, wallet_amount_minor: 106814, trip_id: uuid() }), 'ok'],
      ['a home amount of 0 (Q10)', () => record('expense', { currency: 'VND', amount_minor: 1, rate: '0.0013', home_amount_minor: 0, wallet_amount_minor: 0 }), 'ok'],
      ['a home amount above the cap', () => record('expense', { home_amount_minor: CAP + 1 }), 'CHECK'],
      ['a charged amount above the cap', () => record('expense', { wallet_amount_minor: CAP + 1 }), 'CHECK'],
      ['a charged amount below 0', () => record('expense', { wallet_amount_minor: -1 }), 'CHECK'],
      ['an exchange', () => record('transfer', { rate_source: 'exchange', rate: '0.232558139535', home_amount_minor: 4620, to_amount_minor: 43000 }), 'ok'],
      ['an exchange receiving 0', () => record('transfer', { to_amount_minor: 0 }), 'CHECK'],
      ['an exchange receiving more than the cap', () => record('transfer', { to_amount_minor: CAP + 1 }), 'CHECK'],
      ['an own rate', () => record('expense', { rate_source: 'own', rate: '0.232792207792' }), 'ok'],
      ['a rate with a letter', () => record('expense', { rate: '0.23a' }), 'CHECK'],
      ['an empty rate', () => record('expense', { rate: '' }), 'CHECK'],
      ['a rate of 41 characters', () => record('expense', { rate: '1'.repeat(41) }), 'CHECK'],
      ['a rate of 40 characters', () => record('expense', { rate: `0.${'1'.repeat(38)}` }), 'ok'],
      ['a record currency in lower case', () => record('expense', { currency: 'jpy' }), 'CHECK'],
      ['a rate date that is not a day', () => record('expense', { rate_date: '2026-02-30' }), 'CHECK'],
      ["the board's trip", () => trip({}), 'ok'],
      ['a one-day trip with no budget', () => trip({ ends_on: '2026-11-01', budget_minor: null }), 'ok'],
      ['a trip budget of 0', () => trip({ budget_minor: 0 }), 'CHECK'],
      ['a trip budget above the cap', () => trip({ budget_minor: CAP + 1 }), 'CHECK'],
      ['a trip name with a space before it', () => trip({ name: ' ทริป' }), 'CHECK'],
      ['a trip name of 81 characters', () => trip({ name: 'ก'.repeat(81) }), 'CHECK'],
      ['a trip currency in lower case', () => trip({ currency: 'jpy' }), 'CHECK'],
      ['a trip start that is not a day', () => trip({ starts_on: '2026-11-31' }), 'CHECK'],
      ['a trip at version 0', () => trip({ version: 0 }), 'CHECK'],
      ['a second settings row', () => settings({ id: 2 }), 'CHECK'],
      ['a home currency in lower case', () => settings({ home_currency: 'thb' }), 'CHECK'],
      ['settings at version 0', () => settings({ version: 0 }), 'CHECK'],
      ['settings in yen', () => settings({}), 'ok'],
      ['a custom category with its icon and pack key', () => category({ icon: 'lotus', pack_key: 'merit' }), 'ok'],
      ['a built-in with an icon and no pack key', () => category({ builtin_key: 'travel', label: null, icon: 'car' }), 'ok'],
      ['an icon with a digit', () => category({ icon: 'gift2' }), 'CHECK'],
      ['a pack key with a hyphen', () => category({ pack_key: 'family-out' }), 'CHECK'],
    ]
    expect(cases.map(([name, write]) => [name, outcome(write)])).toEqual(cases.map(([name, , expected]) => [name, expected]))
  }))

it('the trip indexes cover live tagged records and live trips', () =>
  today(async (state) => {
    await upgrade(state)
    expect(rows(state, "SELECT name, tbl_name, substr(sql, instr(sql, ' WHERE ')) AS predicate FROM sqlite_master WHERE type = 'index' AND name IN ('transactions_trip_idx', 'trips_dates_idx') ORDER BY name")).toEqual([
      { name: 'transactions_trip_idx', tbl_name: 'transactions', predicate: ' WHERE deleted_at IS NULL AND trip_id IS NOT NULL' },
      { name: 'trips_dates_idx', tbl_name: 'trips', predicate: ' WHERE deleted_at IS NULL' },
    ])
    expect(rows(state, 'PRAGMA index_info(transactions_trip_idx)').map((column) => column.name)).toEqual(['trip_id', 'occurred_on'])
    expect(rows(state, 'PRAGMA index_info(trips_dates_idx)').map((column) => column.name)).toEqual(['starts_on', 'ends_on'])
  }))

it('a record, wallet or category the previous release writes after the migration is in baht with no look, icon or pack key', () =>
  today(async (state, s) => {
    await upgrade(state)
    // 1A's own statements (src/vault/domain/transactions.ts, wallets.ts and categories.ts), column for column.
    const id = uuid()
    run(state, 'INSERT INTO transactions (id, type, amount_minor, occurred_on, wallet_id, category_id, source_wallet_id, destination_wallet_id, note, merchant, version, created_at, updated_at) VALUES (?, ?, CAST(? AS INTEGER), ?, ?, ?, ?, ?, ?, ?, 1, ?, ?) ON CONFLICT DO NOTHING', id, 'expense', '120', '2026-10-22', s.cash, s.food, null, null, null, null, AT, AT)
    const [row] = rows(state, 'SELECT * FROM transactions WHERE id = ?', id)
    expect({ ...row, id: undefined, amount_minor: undefined, occurred_on: undefined, wallet_id: undefined, category_id: undefined }).toEqual({
      type: 'expense', source_wallet_id: null, destination_wallet_id: null, note: null, merchant: null, version: 1, deleted_at: null, created_at: AT, updated_at: AT,
      currency: 'THB', rate: '1', rate_source: 'reference', rate_date: null, home_amount_minor: null, wallet_amount_minor: null, to_amount_minor: null, trip_id: null,
    })
    // Reads take a null home amount as the record's amount.
    expect(rows(state, 'SELECT CAST(coalesce(home_amount_minor, amount_minor) AS TEXT) AS home FROM transactions WHERE id = ?', id)).toEqual([{ home: '120' }])
    const wallet = uuid()
    run(state, "INSERT INTO wallets (id, name, currency, opening_minor, tracking_start, archived, version, created_at, updated_at) VALUES (?, ?, 'THB', CAST(? AS INTEGER), ?, 0, 1, ?, ?) ON CONFLICT DO NOTHING", wallet, 'Cash', '0', '2026-10-01', AT, AT)
    expect(rows(state, 'SELECT currency, type, material, bun_face FROM wallets WHERE id = ?', wallet)).toEqual([{ currency: 'THB', type: null, material: null, bun_face: null }])
    const category = uuid()
    run(state, 'INSERT INTO categories (id, type, builtin_key, label, color, archived, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?) ON CONFLICT DO NOTHING', category, 'expense', 'food', null, null, AT, AT)
    expect(rows(state, 'SELECT builtin_key, icon, pack_key FROM categories WHERE id = ?', category)).toEqual([{ builtin_key: 'food', icon: null, pack_key: null }])
  }))

it('an upgrade that fails part way leaves the vault as it was, and the next wake applies it', () =>
  today(async (state) => {
    // A table in the way of the migration's last statement.
    run(state, 'CREATE TABLE settings (id INTEGER PRIMARY KEY) STRICT')
    const wallets = rows(state, WALLET_ROWS)
    const journal = rows(state, 'SELECT created_at FROM __drizzle_migrations ORDER BY created_at')
    await expect(upgrade(state)).rejects.toThrow()
    expect(columnsOf(state, 'wallets')).toEqual(WALLET_COLUMNS)
    expect(columnsOf(state, 'transactions')).not.toContain('currency')
    expect(rows(state, "SELECT name FROM sqlite_master WHERE name IN ('wallets_next', 'trips', 'wallets_currency_immutable', 'transactions_trip_idx')")).toEqual([])
    expect(rows(state, WALLET_ROWS)).toEqual(wallets)
    expect(rows(state, 'SELECT created_at FROM __drizzle_migrations ORDER BY created_at')).toEqual(journal)
    run(state, 'DROP TABLE settings')
    await upgrade(state)
    expect(columnsOf(state, 'wallets')).toEqual([...WALLET_COLUMNS, 'type', 'material', 'bun_face'])
    expect(rows(state, WALLET_ROWS)).toEqual(wallets.map((wallet) => ({ ...wallet, type: null, material: null, bun_face: null })))
    expect(rows(state, 'SELECT count(*) AS n FROM __drizzle_migrations')).toEqual([{ n: VAULT_MIGRATIONS.journal.entries.length }])
  }))
