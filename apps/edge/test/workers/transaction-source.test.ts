// P3-T2: how each record was made (B2). A create may name its source, every read
// shows it, an edit never changes it, and a record made without one, before or
// after this release, reads as it always did. 0005_transaction_source.sql only adds
// the column, so a vault the previous release wrote keeps every row and link.
import { randomUUID } from 'node:crypto'

import { env } from 'cloudflare:workers'
import { runInDurableObject } from 'cloudflare:test'
import { drizzle } from 'drizzle-orm/durable-sqlite'
import { migrate } from 'drizzle-orm/durable-sqlite/migrator'
import { beforeEach, describe, expect, it } from 'vitest'

import { CommandDigester } from '@api/commands/command-digest'
import { RECEIPT_RETENTION_CONSENT, TRANSACTION_SOURCES, isTransactionSnapshot } from '@gogospend/contracts'

import { VAULT_MIGRATIONS } from '../../src/vault/migrations'
import { TEST_DIGEST_KEY, countRows, sqlExec, sqlRows } from './support/command-fixtures'
import { seedImportImage } from './support/files'
import { migrateBefore } from './support/migrations'
import { builtinId, moneyFixtures } from './support/money-fixtures'
import { startV1 } from './support/v1-client'
import type { TestUser, V1Client } from './support/v1-client'

let client: V1Client
let money: ReturnType<typeof moneyFixtures>

beforeEach(async () => {
  client = await startV1()
  money = moneyFixtures(client)
})

type Problem = { code?: string; fields?: Record<string, string> }
type Json = Record<string, unknown>
type Setup = { user: TestUser; cash: string; daily: string; expense: (overrides?: Json) => Json }

async function setup(): Promise<Setup> {
  const user = await money.member()
  const cash = await money.wallet(user, { name: 'Cash', opening_minor: '100000', tracking_start: '2026-09-01' })
  const daily = await money.wallet(user, { name: 'Daily', opening_minor: '0', tracking_start: '2026-09-01' })
  const expense = (overrides: Json = {}) => ({ id: randomUUID(), type: 'expense', amount_minor: '6500', occurred_on: '2026-09-20', wallet_id: cash, category_id: builtinId(user, 'food'), ...overrides })
  return { user, cash, daily, expense }
}

const json = async (res: Response): Promise<Json> => (await res.json()) as Json
const record = async (s: Setup, id: unknown): Promise<Json> => json(await client.as(s.user).get(`/v1/transactions/${String(id)}`))
const historyItem = async (s: Setup, id: unknown): Promise<Json | undefined> =>
  ((await json(await client.as(s.user).get('/v1/history?from=2026-09-01&through=2026-09-30'))).items as Json[]).find((item) => item.id === id)
const deletedItem = async (s: Setup, id: unknown): Promise<Json | undefined> => ((await json(await client.as(s.user).get('/v1/history/deleted'))).items as Json[]).find((item) => item.id === id)
/** Every snapshot the delta feed serves for this record, oldest first. */
const syncSnapshots = async (s: Setup, id: unknown): Promise<Json[]> => {
  const page = (await json(await client.as(s.user).get('/v1/sync/changes'))) as { groups: { changes: { entity: string; id: string; snapshot: Json }[] }[] }
  return page.groups.flatMap((group) => group.changes).filter((change) => change.entity === 'transaction' && change.id === id).map((change) => change.snapshot)
}

describe('a record source', () => {
  it('a record made with a source keeps it, and every read shows it', async () => {
    const s = await setup()
    const lunch = s.expense({ source: 'tell_bun' })
    expect((await client.as(s.user).post('/v1/transactions', lunch)).status).toBe(201)
    const got = await record(s, lunch.id)
    expect(got).toEqual({ id: lunch.id, type: 'expense', amount_minor: '6500', occurred_on: '2026-09-20', wallet_id: s.cash, category_id: builtinId(s.user, 'food'), note: null, merchant: null, deleted_at: null, version: 1, source: 'tell_bun' })
    expect(isTransactionSnapshot(got)).toBe(true)
    expect(await historyItem(s, lunch.id)).toMatchObject({ source: 'tell_bun', version: 1 })
    // An edit keeps the source (H9: set once, at create).
    expect(await json(await client.as(s.user).patch(`/v1/transactions/${String(lunch.id)}`, { note: 'ข้าวมันไก่' }, { ifMatch: 1 }))).toMatchObject({ outcome: 'updated', version: 2 })
    expect(await record(s, lunch.id)).toMatchObject({ note: 'ข้าวมันไก่', version: 2, source: 'tell_bun' })
    expect((await syncSnapshots(s, lunch.id)).map((snapshot) => [snapshot.version, snapshot.source])).toEqual([[1, 'tell_bun'], [2, 'tell_bun']])
    expect(await json(await client.as(s.user).del(`/v1/transactions/${String(lunch.id)}`, { ifMatch: 2 }))).toMatchObject({ outcome: 'deleted', version: 3 })
    expect(await deletedItem(s, lunch.id)).toMatchObject({ source: 'tell_bun', version: 3 })
    // A transfer carries its source the same way.
    const move = { id: randomUUID(), type: 'transfer', amount_minor: '1000', occurred_on: '2026-09-21', source_wallet_id: s.cash, destination_wallet_id: s.daily, source: 'share_extension' }
    expect((await client.as(s.user).post('/v1/transactions', move)).status).toBe(201)
    expect(await record(s, move.id)).toMatchObject({ type: 'transfer', source: 'share_extension' })
  })

  it('a record made without a source, or with null, reads without the key', async () => {
    const s = await setup()
    const plain = s.expense()
    const nulled = s.expense({ source: null })
    expect((await client.as(s.user).post('/v1/transactions', plain)).status).toBe(201)
    expect((await client.as(s.user).post('/v1/transactions', nulled)).status).toBe(201)
    for (const id of [plain.id, nulled.id]) {
      const got = await record(s, id)
      expect(['source' in got, got.version]).toEqual([false, 1])
      expect('source' in ((await historyItem(s, id)) ?? { source: 'missing item' })).toBe(false)
      expect((await syncSnapshots(s, id)).map((snapshot) => 'source' in snapshot)).toEqual([false])
    }
  })

  it('an unknown source is 422 VALIDATION_FAILED on source, and nothing is written', async () => {
    const s = await setup()
    for (const source of ['manual', '', 'Photo', 7]) {
      const key = randomUUID()
      const res = await client.as(s.user).post('/v1/transactions', s.expense({ source }), { key })
      expect([source, res.status, await res.json()]).toEqual([source, 422, expect.objectContaining({ code: 'VALIDATION_FAILED', fields: { source: expect.any(String) } })])
      expect(await sqlRows(s.user, 'SELECT command_id FROM command_receipts WHERE command_id = ?', key)).toEqual([])
    }
    expect(await countRows(s.user, 'transactions')).toBe(0)
  })

  it('the same command key with another source is 409 IDEMPOTENCY_MISMATCH', async () => {
    const s = await setup()
    const key = randomUUID()
    const lunch = s.expense({ source: 'tell_bun' })
    const first = await client.as(s.user).post('/v1/transactions', lunch, { key })
    expect(first.status).toBe(201)
    const sameAgain = await client.as(s.user).post('/v1/transactions', { ...lunch }, { key })
    expect(await sameAgain.json()).toEqual(await first.json())
    for (const changed of [{ ...lunch, source: 'photo' }, { ...lunch, source: null }]) {
      const res = await client.as(s.user).post('/v1/transactions', changed, { key })
      expect([changed.source, res.status, ((await res.json()) as Problem).code]).toEqual([changed.source, 409, 'IDEMPOTENCY_MISMATCH'])
    }
    // Absent and null are the same create: neither names a source.
    const plainKey = randomUUID()
    const plain = s.expense()
    const plainFirst = await client.as(s.user).post('/v1/transactions', plain, { key: plainKey })
    const plainAgain = await client.as(s.user).post('/v1/transactions', { ...plain, source: null }, { key: plainKey })
    expect(await plainAgain.json()).toEqual(await plainFirst.json())
  })

  it('a create without a source is digested as the release before gave it, so a command queued then still replays', async () => {
    const s = await setup()
    const key = randomUUID()
    const lunch = s.expense({ note: 'lunch' })
    expect((await client.as(s.user).post('/v1/transactions', lunch, { key })).status).toBe(201)
    const receipts = await sqlRows<{ digest: string }>(s.user, 'SELECT hex(request_digest) AS digest FROM command_receipts WHERE command_id = ?', key)
    // The payload the vault digested before P3-T2: the record's fields, and no source key at all. The
    // vault's COMMAND_DIGEST_KEY is TEST_DIGEST_KEY's secret (vitest.workers.config.ts); the key id is not digested.
    const earlier = new CommandDigester(TEST_DIGEST_KEY).digest(s.user.sub, {
      commandId: key,
      kind: 'transaction.create',
      schemaVersion: 1,
      payload: { id: lunch.id, type: 'expense', amount_minor: '6500', occurred_on: '2026-09-20', wallet_id: s.cash, category_id: builtinId(s.user, 'food'), source_wallet_id: null, destination_wallet_id: null, note: 'lunch', merchant: null },
    })
    expect(receipts).toEqual([{ digest: earlier?.digest.toString('hex').toUpperCase() }])
  })

  it('an edit cannot set the source', async () => {
    const s = await setup()
    const lunch = s.expense({ source: 'typed' })
    expect((await client.as(s.user).post('/v1/transactions', lunch)).status).toBe(201)
    const res = await client.as(s.user).patch(`/v1/transactions/${String(lunch.id)}`, { source: 'photo' }, { ifMatch: 1 })
    expect([res.status, await res.json()]).toEqual([422, expect.objectContaining({ code: 'UNKNOWN_FIELD', fields: { source: expect.any(String) } })])
    expect(await record(s, lunch.id)).toMatchObject({ version: 1, source: 'typed' })
  })

  it('a row without a source reads as before, with its receipt link', async () => {
    const s = await setup()
    const id = randomUUID()
    const receipt = randomUUID()
    const at = '2026-09-20T05:00:00.000Z'
    // Written as the previous release writes a record: its statement never names source.
    await sqlExec(s.user, "INSERT INTO transactions (id, type, amount_minor, occurred_on, wallet_id, category_id, version, created_at, updated_at) VALUES (?, 'expense', 4500, '2026-09-20', ?, ?, 1, ?, ?)", id, s.cash, builtinId(s.user, 'food'), at, at)
    await sqlExec(s.user, "INSERT INTO attachments (id, source_job_id, status, object_key, content_type, bytes, sha256, width, height, retained_at, released_at) VALUES (?, ?, 'retained', ?, 'image/jpeg', 10, ?, 1, 1, ?, NULL)", receipt, randomUUID(), `receipt/${'f'.repeat(64)}/${receipt}/${randomUUID()}/image.jpg`, 'a'.repeat(64), at)
    await sqlExec(s.user, 'INSERT INTO transaction_attachments (transaction_id, attachment_id, attached_at) VALUES (?, ?, ?)', id, receipt, at)
    const expected = { id, type: 'expense', amount_minor: '4500', occurred_on: '2026-09-20', wallet_id: s.cash, category_id: builtinId(s.user, 'food'), note: null, merchant: null, deleted_at: null, version: 1, attachment_id: receipt }
    expect(await record(s, id)).toEqual(expected)
    expect(await historyItem(s, id)).toEqual(expected)
  })
})

describe('the source column', () => {
  it('takes each of the seven sources or NULL, and refuses anything else', async () => {
    const s = await setup()
    const outcome = async (source: unknown): Promise<string> => {
      try {
        await sqlExec(s.user, "INSERT INTO transactions (id, type, amount_minor, occurred_on, wallet_id, category_id, version, created_at, updated_at, source) VALUES (?, 'expense', 100, '2026-09-20', ?, ?, 1, 'x', 'x', ?)", randomUUID(), s.cash, builtinId(s.user, 'food'), source)
        return 'ok'
      } catch (error) {
        return /CHECK constraint failed/.test(String(error)) ? 'CHECK' : String(error)
      }
    }
    const cases: [unknown, string][] = [...TRANSACTION_SOURCES.map((source): [unknown, string] => [source, 'ok']), [null, 'ok'], ['manual', 'CHECK'], ['', 'CHECK'], ['Photo', 'CHECK'], ['tell_bun ', 'CHECK']]
    const seen: [unknown, string][] = []
    for (const [source] of cases) seen.push([source, await outcome(source)])
    expect(seen).toEqual(cases)
  })

  it('a vault the previous release wrote gains the column in place: every record, receipt link and import link keeps its row', async () => {
    await runInDurableObject(env.VAULT.get(env.VAULT.idFromName(randomUUID())), async (_vault, state) => {
      const rows = (query: string, ...bindings: unknown[]) => state.storage.sql.exec(query, ...bindings).toArray()
      const run = (query: string, ...bindings: unknown[]) => void state.storage.sql.exec(query, ...bindings).toArray()
      const upgrade = () => migrate(drizzle(state.storage), VAULT_MIGRATIONS)
      await migrateBefore(state, '_transaction_source')
      const at = '2026-10-25T00:00:00.000Z'
      const [cash, food, lunch, coffee, receipt, job, selection] = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()]
      run("INSERT INTO wallets (id, name, currency, opening_minor, tracking_start, archived, version, created_at, updated_at) VALUES (?, 'เงินสด', 'THB', 0, '2026-01-01', 0, 1, ?, ?)", cash, at, at)
      run("INSERT INTO categories (id, type, builtin_key, label, color, archived, version, created_at, updated_at) VALUES (?, 'expense', NULL, 'ข้าว', NULL, 0, 1, ?, ?)", food, at, at)
      const expense = "INSERT INTO transactions (id, type, amount_minor, occurred_on, wallet_id, category_id, note, merchant, version, created_at, updated_at) VALUES (?, 'expense', ?, '2026-10-20', ?, ?, ?, NULL, 1, ?, ?)"
      // A record confirmed from a statement import, and one holding a receipt.
      run(expense, lunch, 4500, cash, food, null, at, at)
      run(expense, coffee, 99999999999, cash, food, 'กาแฟ', at, at)
      run("INSERT INTO import_uploads (job_id, intake_token, status, file_name, declared_type, declared_bytes, format, bytes, sha256, part_count, parse_state, parse_attempts, created_at, receive_deadline, accepted_at, expires_at) VALUES (?, 'token', 'accepted', 'statement.csv', 'text/csv', 10, 'csv', 10, ?, 1, 'parsed', 1, ?, ?, ?, ?)", job, 'b'.repeat(64), at, at, at, at)
      run("INSERT INTO import_previews (job_id, status, layout, issues, candidate_count, review_required_count, review_revision, created_at, expires_at) VALUES (?, 'ready', 'generic', '[]', 1, 0, 1, ?, ?)", job, at, at)
      run('INSERT INTO import_selections (selection_id, job_id, frozen_revision, row_count, created_at, expires_at) VALUES (?, ?, 1, 1, ?, ?)', selection, job, at, at)
      run("INSERT INTO import_selection_rows (selection_id, source_row_id, ordinal, type, amount_minor, occurred_on, wallet_id, category_id, note, merchant) VALUES (?, 'row:1', 1, 'expense', 4500, '2026-10-20', ?, ?, NULL, NULL)", selection, cash, food)
      run("INSERT INTO import_row_progress (job_id, source_row_id, selection_id, transaction_id, command_id, committed_at) VALUES (?, 'row:1', ?, ?, ?, ?)", job, selection, lunch, randomUUID(), at)
      run("INSERT INTO attachments (id, source_job_id, status, object_key, content_type, bytes, sha256, width, height, retained_at, released_at) VALUES (?, ?, 'retained', ?, 'image/jpeg', 10, ?, 1, 1, ?, NULL)", receipt, randomUUID(), `receipt/${'f'.repeat(64)}/${receipt}/${randomUUID()}/image.jpg`, 'a'.repeat(64), at)
      run('INSERT INTO transaction_attachments (transaction_id, attachment_id, attached_at) VALUES (?, ?, ?)', coffee, receipt, at)
      const columns = () => rows('PRAGMA table_info(transactions)').map((column) => column.name)
      const records = "SELECT rowid AS row_number, *, CAST(amount_minor AS TEXT) AS amount_text FROM transactions ORDER BY id"
      const links = 'SELECT (SELECT json_group_array(json_array(transaction_id, attachment_id)) FROM transaction_attachments) AS receipts, (SELECT json_group_array(json_array(job_id, transaction_id)) FROM import_row_progress) AS imports, (SELECT count(*) FROM attachment_checks) AS checks'
      const before = { columns: columns(), records: rows(records), links: rows(links) }
      expect(before.columns).not.toContain('source')
      await upgrade()
      // A later migration adds its own columns after `source` (P4-T3's slip_ref_id), each null on a row the previous release wrote.
      const added = columns().slice(before.columns.length)
      expect(added[0]).toBe('source')
      expect(columns()).toEqual([...before.columns, ...added])
      const unset = Object.fromEntries(added.map((column) => [column, null]))
      expect(rows(records)).toEqual(before.records.map((row) => ({ ...row, ...unset })))
      expect(rows(links)).toEqual(before.links)
      expect(rows('PRAGMA foreign_key_check')).toEqual([])
      // The next wake migrates again and changes nothing.
      await upgrade()
      expect(rows(records)).toEqual(before.records.map((row) => ({ ...row, ...unset })))
      expect(rows('SELECT count(*) AS n FROM __drizzle_migrations')).toEqual([{ n: VAULT_MIGRATIONS.journal.entries.length }])
    })
  })
})

// P3-T2's reviews (m1; brief source-pins): a restore (restoreTransaction) and a receipt's
// retain, replace and remove (attachments.ts, nextVersion) bump the version with an UPDATE
// that never names source. Each keeps the record's source (H9: set once, at create); these
// cases hold it. An import confirmation writes only new records, and the source it gives
// them is P4-T11's (statement).
describe('the write paths that never name the source keep it', () => {
  it('a restore keeps the source, in the record and in the sync feed', async () => {
    const s = await setup()
    const lunch = s.expense({ source: 'tell_bun' })
    expect((await client.as(s.user).post('/v1/transactions', lunch)).status).toBe(201)
    expect(await json(await client.as(s.user).del(`/v1/transactions/${String(lunch.id)}`, { ifMatch: 1 }))).toMatchObject({ outcome: 'deleted', version: 2 })
    expect(await json(await client.as(s.user).post(`/v1/transactions/${String(lunch.id)}/restore`, {}, { ifMatch: 2 }))).toMatchObject({ outcome: 'restored', version: 3 })
    expect(await record(s, lunch.id)).toMatchObject({ deleted_at: null, version: 3, source: 'tell_bun' })
    expect((await syncSnapshots(s, lunch.id)).map((snapshot) => [snapshot.version, snapshot.source])).toEqual([[1, 'tell_bun'], [2, 'tell_bun'], [3, 'tell_bun']])
  })

  it('a receipt kept, replaced and removed leaves the source as it was: a typed record stays typed', async () => {
    const s = await setup()
    const lunch = s.expense({ source: 'typed' })
    expect((await client.as(s.user).post('/v1/transactions', lunch)).status).toBe(201)
    const first = await seedImportImage(s.user)
    const second = await seedImportImage(s.user)
    const receipt = `/v1/transactions/${String(lunch.id)}/attachment`
    const steps: [string, () => Promise<Response>][] = [
      ['retain', () => client.as(s.user).post(receipt, { attachment_id: first.attachmentId, consent: RECEIPT_RETENTION_CONSENT }, { ifMatch: 1 })],
      ['replace', () => client.as(s.user).put(receipt, { attachment_id: second.attachmentId, consent: RECEIPT_RETENTION_CONSENT }, { ifMatch: 2 })],
      ['remove', () => client.as(s.user).del(receipt, { ifMatch: 3 })],
    ]
    // Each command's answer, then the record as read after it.
    const seen: unknown[][] = []
    for (const [step, send] of steps) {
      const status = (await send()).status
      const got = await record(s, lunch.id)
      seen.push([step, status, got.version, got.attachment_id ?? null, got.source])
    }
    expect(seen).toEqual([
      ['retain', 200, 2, first.attachmentId, 'typed'],
      ['replace', 200, 3, second.attachmentId, 'typed'],
      ['remove', 200, 4, null, 'typed'],
    ])
    expect((await syncSnapshots(s, lunch.id)).map((snapshot) => [snapshot.version, snapshot.source])).toEqual([[1, 'typed'], [2, 'typed'], [3, 'typed'], [4, 'typed']])
  })
})
