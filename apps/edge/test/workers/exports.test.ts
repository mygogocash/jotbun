// Exports on ExportWorkflow (1B-T6, B5, B7, B8, B21). Ports the 22 cases of
// apps/api/src/exports/export.integration.spec.ts under the not-applicable rule
// (19 ported, 3 not applicable) and the export case of apps/edge/test/jobs.db.test.ts.
// The file is written by UserVault#writeExport, the method ExportWorkflow's step
// calls: most cases call it directly (`drain`), and two run the Workflow. Tokens
// carry auth_time now unless a case says otherwise (the fresh sign-in, B7).
import { env } from 'cloudflare:workers'
import { introspectWorkflowInstance, runInDurableObject } from 'cloudflare:test'
import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

import { EXPORT_CSV_BOM, EXPORT_CSV_COLUMNS, EXPORT_DOWNLOAD_PATH, exportFileName, isCommittedChangeGroup, isExportDto, isExportGrant } from '@gogospend/contracts'
import type { CommandAck, ExportDto, ExportFilter, ExportGrant, HistoryPage, SyncChangesPage, TransactionDto } from '@gogospend/contracts'

import { derivedUuid } from '@api/commands/derived-id'

import { EXPORT_PENDING_MS, EXPORT_PURGE_MS, exportsDueAt, failExport, pruneExports, writeExport } from '../../src/vault/files/exports'
import type { ExportWriter } from '../../src/vault/files/exports'
import type { VaultBucket } from '../../src/vault/files/keys'
import { RESERVATION_GRACE_MS, deleteDueObjects, dueObjectKeys } from '../../src/vault/files/objects'
import { EXPORT_STARTER, START_RETRY_MS } from '../../src/vault/files/work'
import type { UserVault, VaultEnv } from '../../src/vault/user-vault'
import { DAY, HOUR, MIN, fileAt, setVaultClock, spyBucket, storedKeys, vaultExec, vaultIdOf, vaultRows } from './support/files'
import { builtinId, moneyFixtures } from './support/money-fixtures'
import { ISSUER, newUser, startV1, vaultOf } from './support/v1-client'
import type { TestUser, TokenOptions, V1Client } from './support/v1-client'

const MARCH: ExportFilter = { from: '2026-03-01', through: '2026-03-31' }

type Body = Record<string, any>

const json = async (res: Response): Promise<Body> => {
  const text = await res.text()
  return text ? (JSON.parse(text) as Body) : {}
}

const nowSeconds = () => Math.floor(Date.now() / 1000)

/** The token options of a request: a sign-in now (B7), unless the case gives its own. */
const fresh = (opts: TokenOptions = {}): TokenOptions => ({ authTime: nowSeconds(), ...opts })

/** A front door whose `starts` routes start nothing: each case writes its exports itself. */
async function setup(options: { startWork?: 'auto' | 'manual'; env?: Partial<import('../../src/v1/env').V1Env> } = {}) {
  const v1 = await startV1(undefined, { startWork: options.startWork ?? 'manual', ...(options.env ? { env: options.env } : {}) })
  return { v1, money: moneyFixtures(v1) }
}

/** POST /v1/exports with a proof id (unused, B8), the period and an idempotency key. */
async function requestExport(v1: V1Client, user: TestUser, filter: ExportFilter = MARCH, opts: { key?: string; proofId?: string; schema?: number | null; token?: TokenOptions; extra?: Body } = {}) {
  const key = opts.key ?? randomUUID()
  const proofId = opts.proofId ?? randomUUID()
  const res = await v1.as(user, fresh(opts.token)).post('/v1/exports', { proof_id: proofId, ...filter, ...opts.extra }, { key, schema: opts.schema })
  return { status: res.status, body: await json(res), key, proofId }
}

/** The vault's export id for a request key, as it derives it. */
const exportIdOf = (user: TestUser, key: string) => derivedUuid(user.sub, 'export-request', key)

/** Writes every pending export through the vault's own method, as ExportWorkflow's step does. */
async function drain(user: TestUser): Promise<void> {
  for (const { id } of await vaultRows<{ id: string }>(user, "SELECT id FROM exports WHERE status = 'pending' ORDER BY requested_at, id")) await vaultOf(user).writeExport(id)
}

async function readyExport(v1: V1Client, user: TestUser, filter: ExportFilter = MARCH): Promise<Extract<ExportDto, { status: 'ready' }>> {
  const requested = await requestExport(v1, user, filter)
  expect(requested.status).toBe(202)
  await drain(user)
  const res = await v1.as(user).get(`/v1/exports/${requested.body.entity_id}`)
  expect(res.status).toBe(200)
  const dto = (await json(res)) as ExportDto
  expect(dto.status).toBe('ready')
  return dto as Extract<ExportDto, { status: 'ready' }>
}

async function download(v1: V1Client, user: TestUser, exportId: string): Promise<{ grant: ExportGrant; bytes: Uint8Array; text: string }> {
  const grant = await v1.as(user).get(`/v1/exports/${exportId}/grant`)
  expect(grant.status).toBe(200)
  const body = (await json(grant)) as ExportGrant
  const file = await v1.as(user).get(body.url)
  expect(file.status).toBe(200)
  const bytes = new Uint8Array(await file.arrayBuffer())
  return { grant: body, bytes, text: new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes) }
}

/** A strict RFC 4180 reader (CRLF records, "" escapes), the API spec's. */
function parseCsv(text: string): string[][] {
  const records: string[][] = []
  let field = ''
  let record: string[] = []
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"'
        i += 1
      } else if (char === '"') quoted = false
      else field += char
    } else if (char === '"' && field === '') quoted = true
    else if (char === ',') {
      record.push(field)
      field = ''
    } else if (char === '\r' && text[i + 1] === '\n') {
      record.push(field)
      records.push(record)
      record = []
      field = ''
      i += 1
    } else field += char
  }
  if (field !== '' || record.length > 0) throw new Error('the CSV does not end with CRLF')
  return records
}

function csvRecords(text: string): Record<string, string>[] {
  expect(text.startsWith(EXPORT_CSV_BOM)).toBe(true)
  const [header, ...rows] = parseCsv(text.slice(EXPORT_CSV_BOM.length))
  expect(header).toEqual([...EXPORT_CSV_COLUMNS])
  return rows.map((row) => Object.fromEntries(row.map((value, i) => [header[i], value])))
}

const exportsOf = (user: TestUser) => vaultRows<{ id: string; status: string; object_key: string | null; started_at: string | null }>(user, 'SELECT id, status, object_key, started_at FROM exports ORDER BY requested_at, id')
const revisionOf = async (user: TestUser) => (await vaultRows<{ revision: string }>(user, 'SELECT CAST(revision AS TEXT) AS revision FROM sync_state WHERE id = 1'))[0].revision
const exportKeys = (user: TestUser) => storedKeys(`export/${vaultIdOf(user)}/`)
const registryOf = (user: TestUser) =>
  vaultRows<{ key: string; status: string; delete_after: number; created_at: number }>(user, "SELECT key, status, delete_after, created_at FROM vault_objects WHERE purpose = 'export' ORDER BY created_at, key")
const withoutRequestId = (body: Body) => ({ ...body, request_id: undefined })

/** What writeExport runs with inside the vault: the vault clock from `clock`, the bucket given (R2 by default), and the vault's own active check. */
function writerOf(vault: UserVault, state: DurableObjectState, opts: { bucket?: VaultBucket; clock?: () => number } = {}): ExportWriter {
  return { context: () => fileAt(state, (opts.clock ?? Date.now)()), bucket: opts.bucket ?? env.OBJECTS, active: (c) => vault.isActive(c) }
}

/** A member with March records on and around the period's edges, including hostile text (the API spec's marchDiary). */
async function marchDiary(v1: V1Client, money: ReturnType<typeof moneyFixtures>) {
  const user = await money.member()
  const cash = await money.wallet(user, { name: 'Cash' })
  const bank = await money.wallet(user, { name: '=Bank', opening_minor: '100000' })
  const lunch = randomUUID()
  expect((await v1.as(user).post('/v1/categories', { id: lunch, type: 'expense', label: '@Lunch' })).status).toBe(201)
  const food = builtinId(user, 'food')
  const salary = builtinId(user, 'salary')
  const ids = {
    before: await money.record(user, { type: 'expense', amount_minor: '111', occurred_on: '2026-02-28', wallet_id: cash, category_id: food }),
    first: await money.record(user, { type: 'expense', amount_minor: '6500', occurred_on: '2026-03-01', wallet_id: cash, category_id: food, note: '=SUM(A1:A2)', merchant: 'Cafe, "Amazon"' }),
    salary: await money.record(user, { type: 'income', amount_minor: '2800000', occurred_on: '2026-03-10', wallet_id: bank, category_id: salary, note: 'line one\nline two' }),
    transfer: await money.record(user, { type: 'transfer', amount_minor: '150000', occurred_on: '2026-03-15', source_wallet_id: bank, destination_wallet_id: cash, note: '+66 top-up' }),
    largest: await money.record(user, { type: 'expense', amount_minor: '99999999999', occurred_on: '2026-03-20', wallet_id: bank, category_id: food, merchant: '-minus' }),
    deleted: await money.record(user, { type: 'expense', amount_minor: '222', occurred_on: '2026-03-25', wallet_id: cash, category_id: food }),
    last: await money.record(user, { type: 'expense', amount_minor: '18200', occurred_on: '2026-03-31', wallet_id: cash, category_id: lunch, note: 'ข้าวมันไก่' }),
    after: await money.record(user, { type: 'income', amount_minor: '333', occurred_on: '2026-04-01', wallet_id: bank, category_id: salary }),
  }
  expect((await v1.as(user).del(`/v1/transactions/${ids.deleted}`, { ifMatch: 1 })).status).toBe(200)
  return { user, cash, bank, lunch, food, salary, ids }
}

describe('requesting an export, ported from export.integration.spec.ts', () => {
  it('needs a fresh export proof bound to its own command, and queues one owned job', async () => {
    // B7: the fresh proof is the token's auth_time (at most 300 seconds old); B8: proof_id is a UUID and is otherwise unused.
    const { v1, money } = await setup()
    const user = await money.member()
    const missing = await requestExport(v1, user, MARCH, { token: { authTime: undefined } })
    expect([missing.status, missing.body.code]).toEqual([401, 'REAUTH_REQUIRED'])
    const stale = await requestExport(v1, user, MARCH, { token: { authTime: nowSeconds() - 301 } })
    expect([stale.status, stale.body.code]).toEqual([401, 'REAUTH_REQUIRED'])
    expect(await exportsOf(user)).toEqual([])

    const accepted = await requestExport(v1, user)
    expect(accepted.status).toBe(202)
    const ack = accepted.body as CommandAck
    expect(ack).toMatchObject({ command_id: accepted.key, entity_id: exportIdOf(user, accepted.key), version: 1, outcome: 'accepted', entity_state: 'active' })
    expect(await exportsOf(user)).toEqual([{ id: ack.entity_id, status: 'pending', object_key: null, started_at: null }])
    expect(ack.committed_revision).toBe(await revisionOf(user))
    // B8: the proof id is not consumed, so it names nothing; a new command with it is another export.
    expect((await requestExport(v1, user, MARCH, { proofId: accepted.proofId })).status).toBe(202)

    // The request is an `export` entity in the change log, valid for sync.
    const changes = (await json(await v1.as(user).get('/v1/sync/changes?limit=1000'))) as SyncChangesPage
    const group = changes.groups.find((g) => g.command_id === accepted.key)
    expect(group && isCommittedChangeGroup(group)).toBe(true)
    expect(group?.changes).toEqual([{ entity: 'export', id: ack.entity_id, version: 1, state: 'active', snapshot: { id: ack.entity_id, from: MARCH.from, through: MARCH.through } }])
  })

  it('a replayed request returns the same acknowledgement and queues nothing new', async () => {
    const { v1, money } = await setup()
    const user = await money.member()
    const first = await requestExport(v1, user)
    expect(first.status).toBe(202)
    const replay = await requestExport(v1, user, MARCH, { key: first.key, proofId: first.proofId })
    expect(replay.status).toBe(202)
    expect(replay.body).toEqual(first.body)
    expect(await exportsOf(user)).toHaveLength(1)
    const status = await json(await v1.as(user).post('/v1/commands/status', { command_ids: [first.key] }))
    expect(status.statuses[0]).toEqual({ command_id: first.key, state: 'known', ack: first.body })
    const changed = await requestExport(v1, user, { from: MARCH.from, through: '2026-04-30' }, { key: first.key, proofId: first.proofId })
    expect([changed.status, changed.body.code]).toEqual([409, 'IDEMPOTENCY_MISMATCH'])
  })

  it('validates the period like history, and refuses an unsupported schema before using the proof', async () => {
    const { v1, money } = await setup()
    const user = await money.member()
    expect((await requestExport(v1, user, { from: '2026-03-31', through: '2026-03-01' })).status).toBe(422)
    expect((await requestExport(v1, user, { from: '2026-02-30', through: '2026-03-01' })).body.code).toBe('INVALID_DATE')
    expect((await requestExport(v1, user, { from: '1969-12-31', through: '2026-03-01' })).body.code).toBe('INVALID_DATE')
    const key = randomUUID()
    expect((await requestExport(v1, user, MARCH, { key, extra: { account_id: user.sub } })).body.code).toBe('UNKNOWN_FIELD')
    const unsupported = await requestExport(v1, user, MARCH, { key, schema: null })
    expect([unsupported.status, unsupported.body.code]).toEqual([422, 'COMMAND_SCHEMA_UNSUPPORTED'])
    expect((await requestExport(v1, user, MARCH, { key })).status).toBe(202)
  })

  it('stays reachable while a required policy is not accepted, but needs a bound session', async () => {
    const { v1 } = await setup()
    const pending = newUser()
    const wallet = await v1.as(pending).post('/v1/wallets', { id: randomUUID(), name: 'Cash', opening_minor: '0', tracking_start: '2026-01-01' })
    expect([wallet.status, (await json(wallet)).code]).toEqual([403, 'POLICY_ACCEPTANCE_REQUIRED'])
    const requested = await requestExport(v1, pending)
    expect(requested.status).toBe(202)
    await drain(pending)
    expect(await json(await v1.as(pending).get(`/v1/exports/${requested.body.entity_id}`))).toMatchObject({ status: 'ready', row_count: 0 })
    expect(csvRecords((await download(v1, pending, requested.body.entity_id)).text)).toEqual([])
    // A token with no session (no sid) is refused before the vault.
    expect((await requestExport(v1, pending, MARCH, { token: { omitSid: true } })).status).toBe(401)
  })
})

describe('the export file, ported from export.integration.spec.ts', () => {
  it('holds every income, expense and transfer field of the period exactly, and reconciles with history', async () => {
    const { v1, money } = await setup()
    const { user, cash, bank, lunch, food, salary, ids } = await marchDiary(v1, money)
    const dto = await readyExport(v1, user)
    expect(isExportDto(dto)).toBe(true)
    expect(dto).toMatchObject({ status: 'ready', from: MARCH.from, through: MARCH.through, row_count: 5, as_of_revision: await revisionOf(user) })
    expect(Math.abs(Date.parse(dto.expires_at) - (Date.now() + 24 * HOUR))).toBeLessThan(5 * MIN)

    const grantRes = await v1.as(user).get(`/v1/exports/${dto.export_id}/grant`)
    expect(grantRes.status).toBe(200)
    const grant = (await json(grantRes)) as ExportGrant
    expect(isExportGrant(grant)).toBe(true)
    expect(grant.url.startsWith(EXPORT_DOWNLOAD_PATH)).toBe(true)
    expect(Date.parse(grant.expires_at) - Date.now()).toBeLessThanOrEqual(5 * MIN + 1000)
    expect(JSON.stringify(grant)).not.toContain('export/')
    const file = await v1.as(user).get(grant.url)
    expect(file.status).toBe(200)
    expect(file.headers.get('content-type')).toMatch(/^text\/csv/)
    expect(file.headers.get('cache-control')).toBe('no-store')
    expect(file.headers.get('content-disposition')).toBe(`attachment; filename="${exportFileName(MARCH)}"`)
    const body = new Uint8Array(await file.arrayBuffer())
    expect(body.byteLength).toBe(dto.bytes)
    expect(createHash('sha256').update(body).digest('hex')).toBe(dto.sha256)
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(body)
    const rows = csvRecords(text)

    // Exactly the active records dated within the period, both edges included, in date order.
    expect(rows.map((row) => row.record_id)).toEqual([ids.first, ids.salary, ids.transfer, ids.largest, ids.last])
    const byId = new Map(rows.map((row) => [row.record_id, row]))
    expect(byId.get(ids.first)).toEqual({
      record_id: ids.first, date: '2026-03-01', type: 'expense', amount: '65.00', amount_minor: '6500', currency: 'THB',
      wallet_id: cash, wallet_name: 'Cash', category_id: food, category_name: 'food', category_builtin_key: 'food',
      source_wallet_id: '', source_wallet_name: '', destination_wallet_id: '', destination_wallet_name: '',
      merchant: 'Cafe, "Amazon"', note: "'=SUM(A1:A2)", version: '1',
    })
    expect(byId.get(ids.salary)).toMatchObject({ type: 'income', amount_minor: '2800000', wallet_id: bank, wallet_name: "'=Bank", category_id: salary, category_builtin_key: 'salary', note: 'line one\nline two' })
    expect(byId.get(ids.transfer)).toMatchObject({
      type: 'transfer', amount: '1500.00', amount_minor: '150000', wallet_id: '', category_id: '', category_name: '',
      source_wallet_id: bank, source_wallet_name: "'=Bank", destination_wallet_id: cash, destination_wallet_name: 'Cash', note: "'+66 top-up",
    })
    expect(byId.get(ids.largest)).toMatchObject({ amount: '999999999.99', amount_minor: '99999999999', merchant: "'-minus" })
    expect(byId.get(ids.last)).toMatchObject({ date: '2026-03-31', category_id: lunch, category_name: "'@Lunch", category_builtin_key: '', note: 'ข้าวมันไก่' })

    // Reconciles with history over the same period, record by record and in total.
    const history = (await json(await v1.as(user).get(`/v1/history?from=${MARCH.from}&through=${MARCH.through}&sort=date_asc&limit=200`))) as HistoryPage
    expect(rows.map((row) => row.record_id)).toEqual(history.items.map((item) => item.id))
    for (const item of history.items as TransactionDto[]) {
      const row = byId.get(item.id) as Record<string, string>
      expect(row).toMatchObject({ date: item.occurred_on, type: item.type, amount_minor: item.amount_minor, version: String(item.version) })
      if (item.type === 'transfer') expect(row).toMatchObject({ source_wallet_id: item.source_wallet_id, destination_wallet_id: item.destination_wallet_id })
      else expect(row).toMatchObject({ wallet_id: item.wallet_id, category_id: item.category_id })
    }
    const sum = (type: string) => rows.filter((row) => row.type === type).reduce((total, row) => total + BigInt(row.amount_minor), 0n).toString()
    expect(sum('income')).toBe(history.summary.income_minor)
    expect(sum('expense')).toBe(history.summary.expense_minor)
    expect(sum('transfer')).toBe('150000')

    // No receipt images and no account, session, vault or issuer identifiers.
    for (const secret of [user.sub, user.sid, vaultIdOf(user), ISSUER, 'account_id', 'receipt', 'attachment']) expect(text).not.toContain(secret)
  })

  it('a concurrent edit during the export does not tear its one consistent view', async () => {
    // The vault reads the period in one synchronous pass, so nothing can commit inside the read. Three
    // edits are committed through the front door while the file is being stored (after the read, before
    // the publish): the file is the view at its high water, and as_of_revision says which.
    const { v1, money } = await setup()
    const { user, cash, food, ids } = await marchDiary(v1, money)
    const before = await revisionOf(user)
    const requested = await requestExport(v1, user)
    const exportId = requested.body.entity_id as string
    const atRequest = await revisionOf(user)
    let wrote = false
    const edits = spyBucket({
      beforePut: async () => {
        expect((await v1.as(user).patch(`/v1/transactions/${ids.last}`, { amount_minor: '1' }, { ifMatch: 1 })).status).toBe(200)
        expect((await v1.as(user).del(`/v1/transactions/${ids.largest}`, { ifMatch: 1 })).status).toBe(200)
        await money.record(user, { type: 'expense', amount_minor: '4242', occurred_on: '2026-03-30', wallet_id: cash, category_id: food })
        wrote = true
      },
    })
    const outcome = await runInDurableObject(vaultOf(user), (vault: UserVault, state) => writeExport(writerOf(vault, state, { bucket: edits }), exportId))
    expect(outcome.outcome).toBe('ready')
    expect(wrote).toBe(true)
    expect(BigInt(await revisionOf(user))).toBe(BigInt(atRequest) + 3n)
    const dto = (await json(await v1.as(user).get(`/v1/exports/${exportId}`))) as ExportDto
    expect(dto).toMatchObject({ status: 'ready', as_of_revision: atRequest, row_count: 5 })
    expect(BigInt(atRequest)).toBe(BigInt(before) + 1n)
    const rows = csvRecords((await download(v1, user, exportId)).text)
    expect(rows.map((row) => row.record_id)).toEqual([ids.first, ids.salary, ids.transfer, ids.largest, ids.last])
    expect(rows.find((row) => row.record_id === ids.last)?.amount_minor).toBe('18200')
    expect(rows.some((row) => row.amount_minor === '4242')).toBe(false)

    // A later export sees the edits.
    const later = csvRecords((await download(v1, user, (await readyExport(v1, user)).export_id)).text)
    expect(later.find((row) => row.record_id === ids.last)?.amount_minor).toBe('1')
    expect(later.some((row) => row.record_id === ids.largest)).toBe(false)
    expect(later.some((row) => row.amount_minor === '4242')).toBe(true)
  })

  it('an export over its byte limit fails visibly and publishes nothing', async () => {
    const { v1, money } = await setup()
    const { user } = await marchDiary(v1, money)
    const requested = await requestExport(v1, user)
    const outcome = await runInDurableObject(vaultOf(user), (vault: UserVault, state) => writeExport(writerOf(vault, state), requested.body.entity_id, { maxBytes: 300 }))
    expect(outcome.outcome).toBe('too_large')
    expect((await json(await v1.as(user).get(`/v1/exports/${requested.body.entity_id}`))).status).toBe('failed')
    expect(await registryOf(user)).toEqual([])
    expect(await exportKeys(user)).toEqual([])
    expect((await v1.as(user).get(`/v1/exports/${requested.body.entity_id}/grant`)).status).toBe(404)
  })
})

describe('deletion and cancellation races, ported from export.integration.spec.ts', () => {
  it('an account deleted mid-export publishes nothing, and the file it wrote is swept', async () => {
    const { v1, money } = await setup()
    const { user } = await marchDiary(v1, money)
    const requested = await requestExport(v1, user)
    const exportId = requested.body.entity_id as string
    const now = Date.now()
    const outcome = await runInDurableObject(vaultOf(user), (vault: UserVault, state) => {
      const deleting = spyBucket({ afterPut: () => void state.storage.sql.exec("UPDATE account_state SET status = 'deleting' WHERE id = 1").toArray() })
      return writeExport(writerOf(vault, state, { bucket: deleting, clock: () => now }), exportId)
    })
    expect(outcome.outcome).toBe('skipped')
    expect(await exportsOf(user)).toEqual([{ id: exportId, status: 'pending', object_key: null, started_at: null }])
    expect((await registryOf(user)).map((row) => row.status)).toEqual(['reserved'])
    expect(await exportKeys(user)).toHaveLength(1)
    await runInDurableObject(vaultOf(user), (_vault, state) => deleteDueObjects({ context: () => fileAt(state, now + 2 * HOUR), bucket: env.OBJECTS }))
    expect(await exportKeys(user)).toEqual([])
  })

  it('a ready export cannot be granted or downloaded once the account is deleting or locked', async () => {
    // A vault has `deleting` and no lock or lifecycle generation: call() refuses an account that is not active before any route runs.
    const { v1, money } = await setup()
    const { user } = await marchDiary(v1, money)
    const dto = await readyExport(v1, user)
    const grant = (await json(await v1.as(user).get(`/v1/exports/${dto.export_id}/grant`))) as ExportGrant
    await vaultExec(user, "UPDATE account_state SET status = 'deleting' WHERE id = 1")
    for (const path of [`/v1/exports/${dto.export_id}`, `/v1/exports/${dto.export_id}/grant`, grant.url]) {
      const res = await v1.as(user).get(path)
      const text = await res.text()
      expect([res.status, JSON.parse(text).code], path).toEqual([403, 'ACCOUNT_UNAVAILABLE'])
      expect(text).not.toContain('record_id')
    }
  })
})

describe('ownership, ported from export.integration.spec.ts', () => {
  it("another account's export, job and grant are each the same 404 as an unknown id", async () => {
    const { v1, money } = await setup()
    const owner = (await marchDiary(v1, money)).user
    const other = await money.member()
    const dto = await readyExport(v1, owner)
    const grant = (await json(await v1.as(owner).get(`/v1/exports/${dto.export_id}/grant`))) as ExportGrant
    const unknown = await v1.as(other).get(`/v1/exports/${randomUUID()}`)
    expect(unknown.status).toBe(404)
    const foreign = await v1.as(other).get(`/v1/exports/${dto.export_id}`)
    expect(foreign.status).toBe(404)
    expect(withoutRequestId(await json(foreign))).toEqual(withoutRequestId(await json(unknown)))
    const foreignGrant = await v1.as(other).get(`/v1/exports/${dto.export_id}/grant`)
    expect(foreignGrant.status).toBe(404)
    expect(withoutRequestId(await json(foreignGrant))).toEqual(withoutRequestId(await json(await v1.as(other).get(`/v1/exports/${randomUUID()}/grant`))))
    const stolen = await v1.as(other).get(grant.url)
    expect(stolen.status).toBe(404)
    expect(await stolen.text()).not.toContain('record_id')
    expect((await v1.as(owner).get('/v1/exports/not-a-uuid')).status).toBe(404)
    expect((await v1.as(owner).get(`${EXPORT_DOWNLOAD_PATH}AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`)).status).toBe(404)
    // The owner still can.
    const own = await v1.as(owner).get(grant.url)
    expect(own.status).toBe(200)
    await own.arrayBuffer()
    // The other account's own export holds none of the owner's records.
    expect(csvRecords((await download(v1, other, (await readyExport(v1, other)).export_id)).text)).toEqual([])
  })
})

describe('expiry and cleanup, ported from export.integration.spec.ts', () => {
  it('grants last five minutes; the file expires after 24 hours and the sweep deletes it', async () => {
    const { v1, money } = await setup()
    const { user } = await marchDiary(v1, money)
    const dto = await readyExport(v1, user)
    const now = Date.now()
    try {
      await setVaultClock(user, now)
      const grant = (await json(await v1.as(user).get(`/v1/exports/${dto.export_id}/grant`))) as ExportGrant
      expect(Date.parse(grant.expires_at) - now).toBeLessThanOrEqual(5 * MIN)
      await setVaultClock(user, now + 5 * MIN - 2_000)
      const early = await v1.as(user).get(grant.url)
      expect(early.status).toBe(200)
      await early.arrayBuffer()
      await setVaultClock(user, now + 5 * MIN + 1_000)
      expect((await v1.as(user).get(grant.url)).status).toBe(404)

      const [row] = await vaultRows<{ ready_at: string; expires_at: string }>(user, 'SELECT ready_at, expires_at FROM exports WHERE id = ?', dto.export_id)
      const published = await registryOf(user)
      expect(published.map((object) => object.status)).toEqual(['published'])
      expect(published[0].delete_after).toBe(Date.parse(row.expires_at))
      expect(Math.abs(Date.parse(row.expires_at) - Date.parse(row.ready_at) - 24 * HOUR)).toBeLessThan(MIN)

      await setVaultClock(user, now + 24 * HOUR + MIN)
      expect((await json(await v1.as(user).get(`/v1/exports/${dto.export_id}`))).status).toBe('expired')
      expect((await v1.as(user).get(`/v1/exports/${dto.export_id}/grant`)).status).toBe(404)
      await setVaultClock(user, now + 24 * HOUR - MIN)
      const late = (await json(await v1.as(user).get(`/v1/exports/${dto.export_id}/grant`))) as ExportGrant
      expect(Date.parse(late.expires_at)).toBeLessThanOrEqual(Date.parse(row.expires_at))

      // Scheduled cleanup: the vault deletes the object at its deadline (the alarm runs this, 1B-T11).
      await runInDurableObject(vaultOf(user), (_vault, state) => deleteDueObjects({ context: () => fileAt(state, now + 25 * HOUR), bucket: env.OBJECTS }))
      expect(await exportKeys(user)).toEqual([])
      expect((await registryOf(user)).map((object) => object.status)).toEqual(['tombstone'])
      await setVaultClock(user, now + 25 * HOUR)
      expect((await json(await v1.as(user).get(`/v1/exports/${dto.export_id}`))).status).toBe('expired')
      expect((await v1.as(user).get(`/v1/exports/${dto.export_id}/grant`)).status).toBe(404)
      expect((await v1.as(user).get(grant.url)).status).toBe(404)
    } finally {
      await setVaultClock(user, null)
    }
  })

  it('a failed cleanup stays visible as overdue until a later sweep deletes the file', async () => {
    // The API's overdue count is the worker's cross-account alert (not applicable); a vault keeps its own failed delete due a minute later (1B-T4).
    const { v1, money } = await setup()
    const { user } = await marchDiary(v1, money)
    await readyExport(v1, user)
    const at = Date.now() + 25 * HOUR
    const failing: VaultBucket = { ...spyBucket({}), delete: async () => Promise.reject(new Error('unavailable')) }
    await runInDurableObject(vaultOf(user), (_vault, state) => deleteDueObjects({ context: () => fileAt(state, at), bucket: failing }))
    expect(await exportKeys(user)).toHaveLength(1)
    expect((await registryOf(user)).map((object) => [object.status, object.delete_after])).toEqual([['published', at + MIN]])
    await runInDurableObject(vaultOf(user), (_vault, state) => deleteDueObjects({ context: () => fileAt(state, at + MIN), bucket: env.OBJECTS }))
    expect(await exportKeys(user)).toEqual([])
  })
})

describe('runtime logs, ported from export.integration.spec.ts', () => {
  it('carry no CSV contents, grants, object keys or amounts', async () => {
    const lines: string[] = []
    const spies = (['log', 'info', 'warn', 'error'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(' '))
      }),
    )
    try {
      const { v1, money } = await setup()
      const user = await money.member()
      const wallet = await money.wallet(user, { name: 'Sentinel wallet' })
      await money.record(user, { type: 'expense', amount_minor: '7777777', occurred_on: '2026-03-03', wallet_id: wallet, category_id: builtinId(user, 'food'), note: 'SENTINEL-CSV-NOTE' })
      const dto = await readyExport(v1, user)
      const { grant, text } = await download(v1, user, dto.export_id)
      expect(text).toContain('SENTINEL-CSV-NOTE')
      const joined = lines.join('\n')
      for (const secret of ['SENTINEL', '7777777', '77777.77', grant.url.slice(EXPORT_DOWNLOAD_PATH.length), `export/${vaultIdOf(user)}`, dto.sha256]) expect(joined).not.toContain(secret)
    } finally {
      for (const spy of spies) spy.mockRestore()
    }
  })
})

/** The binding's object as a plain object whose body is `body` and which cannot be read whole. */
function streamedOnly(found: NonNullable<Awaited<ReturnType<VaultBucket['get']>>>, body: unknown) {
  return {
    key: found.key,
    size: found.size,
    uploaded: found.uploaded,
    customMetadata: found.customMetadata,
    httpMetadata: found.httpMetadata,
    body,
    arrayBuffer: () => Promise.reject(new Error('read whole')),
  } as unknown as Awaited<ReturnType<VaultBucket['get']>>
}

describe('P4 review fixes, ported from export.integration.spec.ts', () => {
  it('a download streams the stored file and never reads it whole', async () => {
    const streaming: VaultBucket = { ...spyBucket({}), get: async (key) => {
      const found = await env.OBJECTS.get(key)
      return found && streamedOnly(found, found.body)
    } }
    const { v1, money } = await setup({ env: { OBJECTS: streaming } })
    const { user } = await marchDiary(v1, money)
    const ready = await readyExport(v1, user)
    const { bytes } = await download(v1, user, ready.export_id)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(ready.sha256)
  })

  it('at most four export downloads run at once in a process; more are told to retry', async () => {
    // Per isolate: EXPORT_SLOTS. A download opens its file only after it takes a slot, so four files opened
    // are four slots held. Their bodies wait at a gate; the slot is returned when a body ends.
    let opened = 0
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => (release = resolve))
    const held: VaultBucket = { ...spyBucket({}), get: async (key) => {
      opened += 1
      const found = await env.OBJECTS.get(key)
      if (!found || opened > 4) return found
      const body = found.body as unknown as AsyncIterable<Uint8Array>
      return streamedOnly(found, (async function* () {
        await gate
        yield* body
      })())
    } }
    const { v1, money } = await setup({ env: { OBJECTS: held } })
    const { user } = await marchDiary(v1, money)
    const ready = await readyExport(v1, user)
    const grant = (await json(await v1.as(user).get(`/v1/exports/${ready.export_id}/grant`))) as ExportGrant
    const four = await Promise.all(Array.from({ length: 4 }, () => v1.as(user).get(grant.url)))
    try {
      expect([opened, ...four.map((res) => res.status)]).toEqual([4, 200, 200, 200, 200])
      const extra = await v1.as(user).get(grant.url)
      expect([extra.status, (await json(extra)).code]).toEqual([503, 'SERVICE_UNAVAILABLE'])
      expect(opened).toBe(4)
    } finally {
      release()
      for (const res of four) expect(createHash('sha256').update(new Uint8Array(await res.arrayBuffer())).digest('hex')).toBe(ready.sha256)
    }
    const after = await v1.as(user).get(grant.url)
    expect(after.status).toBe(200)
    await after.arrayBuffer()
  })

  it('a too-large export says why, and is not an operator alert', async () => {
    // The write answers too_large (a result, not a throw), so ExportWorkflow completes and nothing is logged as a failure.
    const { v1, money } = await setup()
    const { user } = await marchDiary(v1, money)
    const requested = await requestExport(v1, user)
    const errors = vi.spyOn(console, 'error')
    try {
      const outcome = await runInDurableObject(vaultOf(user), (vault: UserVault, state) => writeExport(writerOf(vault, state), requested.body.entity_id, { maxBytes: 300 }))
      expect(outcome).toEqual({ outcome: 'too_large' })
      expect(errors).not.toHaveBeenCalled()
    } finally {
      errors.mockRestore()
    }
    const status = await json(await v1.as(user).get(`/v1/exports/${requested.body.entity_id}`))
    expect(status).toMatchObject({ status: 'failed', reason: 'too_large' })
    expect(isExportDto(status)).toBe(true)
  })

  it('an account can have at most two exports open; a third waits', async () => {
    const { v1, money } = await setup()
    const { user } = await marchDiary(v1, money)
    expect((await requestExport(v1, user)).status).toBe(202)
    expect((await requestExport(v1, user, { from: '2026-02-01', through: '2026-02-28' })).status).toBe(202)
    const third = await requestExport(v1, user, { from: '2026-01-01', through: '2026-01-31' })
    expect([third.status, third.body.code]).toEqual([429, 'RATE_LIMITED'])
    expect(third.body.retry_after_seconds).toBeGreaterThan(0)
    await drain(user)
    expect((await requestExport(v1, user, { from: '2026-01-01', through: '2026-01-31' })).status).toBe(202)
  })

  it('an expired file is not served even while its grant and object remain', async () => {
    const { v1, money } = await setup()
    const { user } = await marchDiary(v1, money)
    const ready = await readyExport(v1, user)
    const grant = (await json(await v1.as(user).get(`/v1/exports/${ready.export_id}/grant`))) as ExportGrant
    await vaultExec(user, 'UPDATE exports SET ready_at = ?, expires_at = ? WHERE id = ?', new Date(Date.now() - 2 * HOUR).toISOString(), new Date(Date.now() - 1_000).toISOString(), ready.export_id)
    expect(await exportKeys(user)).toHaveLength(1)
    expect((await v1.as(user).get(grant.url)).status).toBe(404)
  })

  it('recording a file needs the current lease, an active account and the published object itself', async () => {
    // Changed form: a vault has no lease. A file is recorded only for a pending export of an active vault, under
    // the key this write reserved (the inactive vault is the deletion race above; a late key is the deadline case below).
    const { v1, money } = await setup()
    const { user } = await marchDiary(v1, money)
    const ready = await readyExport(v1, user)
    expect(await vaultOf(user).writeExport(ready.export_id)).toEqual({ outcome: 'skipped' })
    expect(await exportKeys(user)).toHaveLength(1)
    expect((await registryOf(user)).map((object) => object.status)).toEqual(['published'])
    const failed = await requestExport(v1, user, { from: '2026-02-01', through: '2026-02-28' })
    await runInDurableObject(vaultOf(user), (_vault, state) => state.storage.transactionSync(() => failExport(fileAt(state, Date.now()), failed.body.entity_id)))
    expect(await vaultOf(user).writeExport(failed.body.entity_id)).toEqual({ outcome: 'skipped' })
    expect(await exportKeys(user)).toHaveLength(1)
    expect(await json(await v1.as(user).get(`/v1/exports/${failed.body.entity_id}`))).toMatchObject({ status: 'failed', reason: 'error' })
  })
})

describe('the jobs Worker export, ported from apps/edge/test/jobs.db.test.ts', () => {
  it('writes a requested export, streamed back with its length, and never serves a tampered file', async () => {
    const { v1, money } = await setup()
    const user = await money.member()
    const wallet = await money.wallet(user, { name: 'เงินสด', opening_minor: '100000', tracking_start: '2026-10-01' })
    await money.record(user, { type: 'expense', amount_minor: '6000', occurred_on: '2026-10-20', wallet_id: wallet, category_id: builtinId(user, 'food'), merchant: 'ข้าวมันไก่' })
    const dto = await readyExport(v1, user, { from: '2026-10-01', through: '2026-10-31' })
    const grant = (await json(await v1.as(user).get(`/v1/exports/${dto.export_id}/grant`))) as ExportGrant
    const res = await v1.as(user).get(grant.url)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8')
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="[^"]+\.csv"$/)
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect(Number(res.headers.get('content-length'))).toBe(bytes.byteLength)
    // A UTF-8 byte-order mark first, so spreadsheet apps read the Thai text as UTF-8.
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const csv = new TextDecoder().decode(bytes)
    expect(csv).toContain('ข้าวมันไก่')
    expect(csv).toContain('60.00')

    // The stored object is swapped for other bytes: its recorded size and digest no longer match.
    const [key] = await exportKeys(user)
    await env.OBJECTS.delete(key)
    await env.OBJECTS.put(key, new TextEncoder().encode(`\uFEFF${csv.replace('60.00', '6.00')}`))
    const swapped = (await json(await v1.as(user).get(`/v1/exports/${dto.export_id}/grant`))) as ExportGrant
    expect((await v1.as(user).get(swapped.url)).status).toBe(404)
  })
})

describe('exports on the vault (1B-T6)', () => {
  it('an export needs a sign-in from the last five minutes, and a resent export still replays', async () => {
    const { v1, money } = await setup()
    const user = await money.member()
    const stale = await requestExport(v1, user, MARCH, { token: { authTime: nowSeconds() - 301 } })
    expect([stale.status, stale.body.code]).toEqual([401, 'REAUTH_REQUIRED'])
    const first = await requestExport(v1, user)
    expect(first.status).toBe(202)
    const resent = await requestExport(v1, user, MARCH, { key: first.key, proofId: first.proofId, token: { authTime: nowSeconds() - 400 } })
    expect(resent.status).toBe(202)
    expect(resent.body).toEqual(first.body)
  })

  it('an export runs on ExportWorkflow and is ready to download', async () => {
    const { v1, money } = await setup({ startWork: 'auto' })
    const user = await money.member()
    const wallet = await money.wallet(user)
    await money.record(user, { type: 'expense', amount_minor: '6500', occurred_on: '2026-03-05', wallet_id: wallet, category_id: builtinId(user, 'food') })
    const key = randomUUID()
    const exportId = exportIdOf(user, key)
    const instance = await introspectWorkflowInstance(env.EXPORT_WORKFLOW, exportId)
    try {
      expect((await requestExport(v1, user, MARCH, { key })).status).toBe(202)
      await v1.settle()
      // The front door's hand-off started it: the row is marked, so the instance exists.
      expect((await exportsOf(user)).map((row) => [row.id, row.started_at === null])).toEqual([[exportId, false]])
      await instance.waitForStatus('complete')
      expect(await instance.getOutput()).toEqual({ outcome: 'ready' })
    } finally {
      await instance.dispose()
    }
    expect(await json(await v1.as(user).get(`/v1/exports/${exportId}`))).toMatchObject({ status: 'ready', row_count: 1 })
    const grant = (await json(await v1.as(user).get(`/v1/exports/${exportId}/grant`))) as ExportGrant
    const file = await v1.as(user).get(grant.url)
    expect([file.status, file.headers.get('content-type')]).toEqual([200, 'text/csv; charset=utf-8'])
    expect(csvRecords(new TextDecoder('utf-8', { ignoreBOM: true }).decode(new Uint8Array(await file.arrayBuffer())))).toHaveLength(1)
  })

  it('an export whose write keeps failing is recorded failed after its retries', async () => {
    const { v1, money } = await setup({ startWork: 'auto' })
    const user = await money.member()
    const key = randomUUID()
    const exportId = exportIdOf(user, key)
    const instance = await introspectWorkflowInstance(env.EXPORT_WORKFLOW, exportId)
    try {
      await instance.modify(async (m) => {
        await m.disableRetryDelays()
        await m.mockStepError({ name: 'write the export file' }, new Error('unavailable'))
      })
      expect((await requestExport(v1, user, MARCH, { key })).status).toBe(202)
      await v1.settle()
      expect((await exportsOf(user)).map((row) => [row.id, row.started_at === null])).toEqual([[exportId, false]])
      await instance.waitForStatus('complete')
      expect(await instance.getOutput()).toEqual({ outcome: 'failed' })
    } finally {
      await instance.dispose()
    }
    expect(await json(await v1.as(user).get(`/v1/exports/${exportId}`))).toMatchObject({ status: 'failed', reason: 'error' })
  })

  it('the export starter starts each pending export once on ExportWorkflow, and is due a minute after an unstarted request', async () => {
    const { v1, money } = await setup()
    const user = await money.member()
    expect((await requestExport(v1, user)).status).toBe(202)
    expect((await requestExport(v1, user, { from: '2026-02-01', through: '2026-02-28' })).status).toBe(202)
    const rows = await vaultRows<{ id: string; requested_at: string }>(user, 'SELECT id, requested_at FROM exports ORDER BY requested_at, id')
    expect(rows).toHaveLength(2)
    const [a, b] = rows.map((row) => row.id)
    const first = rows[0]
    const at = Date.now()
    await runInDurableObject(vaultOf(user), async (_vault, state) => {
      const c = fileAt(state, at)
      expect(EXPORT_STARTER.unstarted(c)).toEqual([a, b])
      expect(EXPORT_STARTER.dueAt(c)).toBe(Date.parse(first.requested_at) + START_RETRY_MS)
      expect(await EXPORT_STARTER.start({} as VaultEnv, state.id.toString(), a)).toBe('unbound')
      state.storage.transactionSync(() => EXPORT_STARTER.markStarted(c, a))
      expect(EXPORT_STARTER.unstarted(c)).toEqual([b])
      state.storage.transactionSync(() => EXPORT_STARTER.markStarted(c, b))
      expect(EXPORT_STARTER.unstarted(c)).toEqual([])
      expect(EXPORT_STARTER.dueAt(c)).toBeNull()
    })
    expect((await exportsOf(user)).map((row) => row.started_at)).toEqual([new Date(at).toISOString(), new Date(at).toISOString()])
  })

  it('an export started twice by overlapping runs is written once', async () => {
    // markStarted is not an at-most-once guard (1B-T4 follow-up): two overlapping starts both start the
    // export. The second create finds the instance; two writes that overlap publish one file.
    const { v1, money } = await setup()
    const { user } = await marchDiary(v1, money)
    const exportId = (await requestExport(v1, user)).body.entity_id as string
    const instance = await introspectWorkflowInstance(env.EXPORT_WORKFLOW, exportId)
    try {
      await instance.modify(async (m) => {
        await m.mockStepResult({ name: 'write the export file' }, { outcome: 'skipped' })
      })
      const workflowEnv = env as unknown as VaultEnv
      expect(await EXPORT_STARTER.start(workflowEnv, vaultIdOf(user), exportId)).toBe('started')
      expect(await EXPORT_STARTER.start(workflowEnv, vaultIdOf(user), exportId)).toBe('started')
      await instance.waitForStatus('complete')
    } finally {
      await instance.dispose()
    }
    const outcomes = await runInDurableObject(vaultOf(user), (vault: UserVault, state) => {
      let arrived = 0
      let both: () => void = () => undefined
      const together = new Promise<void>((resolve) => (both = resolve))
      const overlapping = spyBucket({
        beforePut: async () => {
          arrived += 1
          if (arrived === 2) both()
          await together
        },
      })
      const writer = writerOf(vault, state, { bucket: overlapping })
      return Promise.all([writeExport(writer, exportId), writeExport(writer, exportId)])
    })
    expect(outcomes.map((outcome) => outcome.outcome).sort()).toEqual(['ready', 'skipped'])
    expect((await registryOf(user)).map((object) => object.status).sort()).toEqual(['published', 'reserved'])
    expect(await json(await v1.as(user).get(`/v1/exports/${exportId}`))).toMatchObject({ status: 'ready', row_count: 5 })
  })

  it('a text cell that starts like a formula is written as text', async () => {
    const { v1, money } = await setup()
    const user = await money.member()
    const wallet = await money.wallet(user)
    await money.record(user, { type: 'expense', amount_minor: '100', occurred_on: '2026-03-02', wallet_id: wallet, category_id: builtinId(user, 'food'), merchant: '=SUM(A1)' })
    const dto = await readyExport(v1, user)
    const { text } = await download(v1, user, dto.export_id)
    expect(csvRecords(text)[0].merchant).toBe("'=SUM(A1)")
    expect(text).toContain(",'=SUM(A1),")
  })

  it('an export that finishes after the vault stopped being active publishes nothing', async () => {
    // Review Focus 1: the bucket's put marks the vault deleting before it stores.
    const { v1, money } = await setup()
    const { user } = await marchDiary(v1, money)
    const exportId = (await requestExport(v1, user)).body.entity_id as string
    const now = Date.now()
    const outcome = await runInDurableObject(vaultOf(user), (vault: UserVault, state) => {
      const deleting = spyBucket({ beforePut: () => void state.storage.sql.exec("UPDATE account_state SET status = 'deleting' WHERE id = 1").toArray() })
      return writeExport(writerOf(vault, state, { bucket: deleting, clock: () => now }), exportId)
    })
    expect(outcome.outcome).toBe('skipped')
    expect((await exportsOf(user)).map((row) => row.status)).toEqual(['pending'])
    const [reserved] = await registryOf(user)
    expect(reserved).toMatchObject({ status: 'reserved', delete_after: now + RESERVATION_GRACE_MS })
    const due = await runInDurableObject(vaultOf(user), (_vault, state) => dueObjectKeys(fileAt(state, now + RESERVATION_GRACE_MS)).map((row) => row.key))
    expect(due).toEqual([reserved.key])
  })

  it('a write retried after its file was stored but before it was recorded completes', async () => {
    // Review Focus 2: the retry writes under a new attempt token; the first attempt's file is deleted at its deadline.
    const { v1, money } = await setup()
    const { user } = await marchDiary(v1, money)
    const exportId = (await requestExport(v1, user)).body.entity_id as string
    const now = Date.now()
    await expect(
      runInDurableObject(vaultOf(user), (vault: UserVault, state) => {
        const lost = spyBucket({ afterPut: () => Promise.reject(new Error('lost after the put')) })
        return writeExport(writerOf(vault, state, { bucket: lost, clock: () => now }), exportId)
      }),
    ).rejects.toThrow()
    const [first] = await exportKeys(user)
    expect(await runInDurableObject(vaultOf(user), (vault: UserVault, state) => writeExport(writerOf(vault, state, { clock: () => now + MIN }), exportId))).toMatchObject({ outcome: 'ready' })
    const objects = await registryOf(user)
    expect(objects.map((object) => [object.key === first, object.status])).toEqual([[true, 'reserved'], [false, 'published']])
    await runInDurableObject(vaultOf(user), (_vault, state) => deleteDueObjects({ context: () => fileAt(state, now + RESERVATION_GRACE_MS), bucket: env.OBJECTS }))
    expect(await exportKeys(user)).toEqual([objects[1].key])
    expect((await json(await v1.as(user).get(`/v1/exports/${exportId}`))).status).toBe('ready')
  })

  it('a write whose PUT ends past its own reservation deadline publishes nothing, even when a failed delete moved it on', async () => {
    // The publish reads the clock after the PUT (publishObject trusts c.now), and a writer never publishes
    // past created_at plus the grace, although a failed delete moved delete_after a minute on (1B-T4 follow-up).
    const { v1, money } = await setup()
    const { user } = await marchDiary(v1, money)
    const exportId = (await requestExport(v1, user)).body.entity_id as string
    let now = Date.now()
    await expect(
      runInDurableObject(vaultOf(user), (vault: UserVault, state) => {
        const slow = spyBucket({
          afterPut: (key) => {
            now += RESERVATION_GRACE_MS
            state.storage.sql.exec('UPDATE vault_objects SET delete_after = ? WHERE key = ?', now + MIN, key).toArray()
          },
        })
        return writeExport(writerOf(vault, state, { bucket: slow, clock: () => now }), exportId)
      }),
    ).rejects.toThrow()
    expect((await exportsOf(user)).map((row) => [row.status, row.object_key])).toEqual([['pending', null]])
    expect((await registryOf(user)).map((object) => object.status)).toEqual(['reserved'])
    // The step's retry writes under a fresh key and publishes it.
    expect(await vaultOf(user).writeExport(exportId)).toEqual({ outcome: 'ready' })
    expect((await registryOf(user)).map((object) => object.status)).toEqual(['reserved', 'published'])
  })

  it('an export is stored with one put of one buffer, and nothing is left behind', async () => {
    // B21: putConcatenated concatenates once and puts that buffer; the vault holds the parts and that one copy at most.
    const { v1, money } = await setup()
    const user = await money.member()
    const wallet = await money.wallet(user)
    await money.bulkRecords(user, Array.from({ length: 600 }, (_, i) => ({ type: 'expense' as const, amount_minor: String(1000 + i), occurred_on: '2026-03-15', wallet_id: wallet, category_id: builtinId(user, 'food'), note: `bulk record ${i}` })))
    const exportId = (await requestExport(v1, user)).body.entity_id as string
    const puts: unknown[] = []
    const recording: VaultBucket = { ...spyBucket({}), put: async (key, value, options) => {
      puts.push(value)
      return env.OBJECTS.put(key, value, options)
    } }
    const outcome = await runInDurableObject(vaultOf(user), (vault: UserVault, state) => writeExport(writerOf(vault, state, { bucket: recording }), exportId))
    expect(outcome.outcome).toBe('ready')
    const dto = (await json(await v1.as(user).get(`/v1/exports/${exportId}`))) as Extract<ExportDto, { status: 'ready' }>
    expect(dto.row_count).toBe(600)
    expect(dto.bytes).toBeGreaterThan(64 * 1024)
    expect(puts).toHaveLength(1)
    expect(puts[0]).toBeInstanceOf(Uint8Array)
    expect((puts[0] as Uint8Array).byteLength).toBe(dto.bytes)
    expect(outcome.peakHeldBytes).toBeLessThanOrEqual(2 * dto.bytes)
    expect(await exportKeys(user)).toHaveLength(1)
    expect(csvRecords((await download(v1, user, exportId)).text)).toHaveLength(600)
  })

  it('pruneExports purges an export 30 days after its request and fails one left pending for a day', async () => {
    // Ruling R33, and the API retention spec's `export requests are purged 30 days after the request; the receipt stays compact`.
    const { v1, money } = await setup()
    const user = await money.member()
    const ready = await requestExport(v1, user)
    await drain(user)
    const pending = await requestExport(v1, user, { from: '2026-02-01', through: '2026-02-28' })
    expect(await exportsOf(user)).toHaveLength(2)
    const requestedAt = async (id: string) => Date.parse((await vaultRows<{ requested_at: string }>(user, 'SELECT requested_at FROM exports WHERE id = ?', id))[0].requested_at)
    const a = { id: ready.body.entity_id as string }
    const readyAt = await requestedAt(a.id)
    const pendingAt = await requestedAt(pending.body.entity_id)
    const prune = (ms: number) => runInDurableObject(vaultOf(user), (_vault, state) => pruneExports(fileAt(state, ms)))
    const dueAt = (ms: number) => runInDurableObject(vaultOf(user), (_vault, state) => exportsDueAt(fileAt(state, ms)))
    expect(await dueAt(pendingAt)).toBe(pendingAt + EXPORT_PENDING_MS)

    const statuses = async () => Object.fromEntries((await exportsOf(user)).map((row) => [row.id === a.id ? 'requested first' : 'left pending', row.status]))
    await prune(pendingAt + EXPORT_PENDING_MS - 1)
    expect(await statuses()).toEqual({ 'requested first': 'ready', 'left pending': 'pending' })
    await prune(pendingAt + EXPORT_PENDING_MS)
    expect(await statuses()).toEqual({ 'requested first': 'ready', 'left pending': 'failed' })
    expect(await json(await v1.as(user).get(`/v1/exports/${pending.body.entity_id}`))).toMatchObject({ status: 'failed', reason: 'error' })
    expect(await dueAt(pendingAt + EXPORT_PENDING_MS)).toBe(readyAt + EXPORT_PURGE_MS)

    await prune(readyAt + EXPORT_PURGE_MS - 1)
    expect(await exportsOf(user)).toHaveLength(2)
    await prune(Math.max(readyAt, pendingAt) + EXPORT_PURGE_MS)
    expect(await exportsOf(user)).toEqual([])
    const heads = await vaultRows<{ entity_id: string; state: string }>(user, "SELECT entity_id, state FROM entity_heads WHERE entity = 'export' ORDER BY entity_id")
    expect(heads.map((head) => head.state)).toEqual(['purged', 'purged'])
    const changes = await vaultRows<{ state: string; snapshot: string | null }>(user, "SELECT state, snapshot FROM entity_changes WHERE entity = 'export' AND entity_id = ?", a.id)
    expect(changes).toEqual([{ state: 'purged', snapshot: null }])
    expect((await v1.as(user).get(`/v1/exports/${a.id}`)).status).toBe(404)
    const status = await json(await v1.as(user).post('/v1/commands/status', { command_ids: [ready.key] }))
    expect(status.statuses[0].ack.entity_state).toBe('purged')
    expect(await dueAt(Math.max(readyAt, pendingAt) + EXPORT_PURGE_MS)).toBeNull()
  })

  it('pruneExports purges more exports at once than SQLite has parameters', async () => {
    // Ruling R57: 101 ids bind as one JSON parameter.
    const { money } = await setup()
    const user = await money.member()
    const ids = Array.from({ length: 101 }, () => randomUUID())
    const longAgo = new Date(Date.now() - 31 * DAY).toISOString()
    await vaultExec(user, "INSERT INTO exports (id, from_date, through_date, requested_at, status, failure) SELECT value, '2026-03-01', '2026-03-31', ?, 'failed', 'error' FROM json_each(?)", longAgo, JSON.stringify(ids))
    await vaultExec(user, "INSERT INTO entity_heads (entity, entity_id, version, state, revision) SELECT 'export', value, 1, 'active', 1 FROM json_each(?)", JSON.stringify(ids))
    await runInDurableObject(vaultOf(user), (_vault, state) => pruneExports(fileAt(state, Date.now())))
    expect(await vaultRows(user, 'SELECT id FROM exports')).toEqual([])
    const heads = await vaultRows<{ state: string; n: number }>(user, "SELECT state, count(*) AS n FROM entity_heads WHERE entity = 'export' GROUP BY state")
    expect(heads).toEqual([{ state: 'purged', n: 101 }])
  })

  it('after pruneExports at exportsDueAt, the next exportsDueAt is later or null', async () => {
    const { money } = await setup()
    const user = await money.member()
    const t0 = Date.now()
    const seed = (status: 'pending' | 'failed', ms: number) =>
      vaultExec(user, "INSERT INTO exports (id, from_date, through_date, requested_at, status, failure) VALUES (?, '2026-03-01', '2026-03-31', ?, ?, ?)", randomUUID(), new Date(ms).toISOString(), status, status === 'failed' ? 'error' : null)
    await seed('pending', t0)
    await seed('failed', t0 - 10 * DAY)
    await seed('failed', t0 - 29 * DAY - HOUR)
    const seen: number[] = []
    await runInDurableObject(vaultOf(user), (_vault, state) => {
      let due = exportsDueAt(fileAt(state, t0))
      while (due !== null && seen.length < 10) {
        seen.push(due)
        pruneExports(fileAt(state, due))
        const next = exportsDueAt(fileAt(state, due))
        if (next !== null) expect(next).toBeGreaterThan(due)
        due = next
      }
    })
    expect(seen).toEqual([t0 + DAY - HOUR, t0 + DAY, t0 + 20 * DAY, t0 + 30 * DAY])
  })
})
