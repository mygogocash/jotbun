// P4-T7: slip drafts. The list (newest slip first, a keyset page at a time), confirm (one command for
// up to 50 drafts, each record checked as transactions.create checks it, with the source the vault
// sets and the draft's slip reference), dismiss (the slip stays known), a single read's slip ref (a
// plain write that answers before slip import opens), and the 30-day expiry on the vault's alarm.
// Confirm and dismiss commit the slip_inbox change, so other phones are poked (S1). The drafts routes
// wait for SLIP_IMPORT_ENABLED, which wrangler.jsonc keeps off, so most cases release it for their own
// front door. Alarm cases keep every alarm in the real future (ruling R6): drafts read days ago expire
// weeks from now, and the vault clock moves forward to them. Synthetic values only.
import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test'
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { derivedUuid } from '@api/commands/derived-id'
import { SLIP_INBOX_ID, SLIP_LIMITS, isSlipDraftsPage } from '@gogospend/contracts'

import { createServerAnalytics } from '../../src/analytics/server-analytics'
import type { CaptureMessage, PostHogPort } from '../../src/analytics/server-analytics'
import type { V1Env } from '../../src/v1/env'
import { buildVaultRegistry } from '../../src/vault/commands/registry'
import { pruneSlips, slipsDueAt } from '../../src/vault/slips/prune'
import type { UserVault } from '../../src/vault/user-vault'
import { countRows, revisionOf, sqlExec, sqlRows } from './support/command-fixtures'
import { setVaultClock, vaultIdOf } from './support/files'
import { builtinId, moneyFixtures } from './support/money-fixtures'
import { party, randomRefHash, seedSlipDraft } from './support/slips'
import { BASE, TEST_POLICIES, member, newUser, openLive, startV1, vaultOf } from './support/v1-client'
import type { TestUser, V1Client } from './support/v1-client'

const CONFIG = { policies: TEST_POLICIES, client_versions: { ios: '1.0.0', android: '1.0.0' } }
/** This front door with slip import released; wrangler.jsonc keeps SLIP_IMPORT_ENABLED "false". */
const RELEASED = { env: { SLIP_IMPORT_ENABLED: 'true' } }
const DAY = 86_400_000

type Json = Record<string, any>
type Group = { revision: string; command_id: string; changes: Json[] }
type Setup = { client: V1Client; user: TestUser; cash: string; food: string }

const json = async (res: Response): Promise<Json> => {
  const text = await res.text()
  return text ? (JSON.parse(text) as Json) : {}
}
const iso = (ms: number) => new Date(ms).toISOString()
const otherSession = (user: TestUser): TestUser => ({ ...user, sid: randomUUID() })

/** A member of a front door (released by default) with a Cash wallet tracking from 2026-01-01 and the built-in categories. */
async function setup(options: Parameters<typeof startV1>[1] = RELEASED): Promise<Setup> {
  const client = await startV1(CONFIG, options)
  const money = moneyFixtures(client)
  const user = await money.member()
  const cash = await money.wallet(user, { name: 'Cash', tracking_start: '2026-01-01' })
  return { client, user, cash, food: builtinId(user, 'food') }
}

/** The record a phone sends to confirm a draft: 65.00 baht of food from Cash on 2026-10-20. */
const expense = (s: Setup, overrides: Json = {}): Json => ({ id: randomUUID(), type: 'expense', amount_minor: '6500', occurred_on: '2026-10-20', wallet_id: s.cash, category_id: s.food, ...overrides })

const confirm = (s: Setup, drafts: { draft_id: string; transaction: Json }[], key?: string, user: TestUser = s.user) => s.client.as(user).post('/v1/drafts/confirm', { drafts }, { key })
const dismiss = (s: Setup, draftId: string, key?: string, user: TestUser = s.user) => s.client.as(user).post(`/v1/drafts/${draftId}/dismiss`, {}, { key })
const recordRef = (s: Setup, body: Json) => s.client.as(s.user).post('/v1/slips/refs', body)

/** The ids of the open drafts, sorted, read straight from the vault. */
const openIds = async (user: TestUser) => (await sqlRows<{ id: string }>(user, 'SELECT id FROM slip_drafts ORDER BY id')).map((row) => row.id)
const refState = async (user: TestUser, refHash: string) => sqlRows<{ state: string; transaction_id: string | null }>(user, 'SELECT state, transaction_id FROM slip_refs WHERE ref_hash = ?', refHash)
/** Every change group the delta feed serves, oldest first. */
const groupsOf = async (s: Setup, user: TestUser = s.user): Promise<Group[]> => (await json(await s.client.as(user).get('/v1/sync/changes'))).groups as Group[]
const alarmOf = (user: TestUser) => runInDurableObject(vaultOf(user), (_vault, state) => state.storage.getAlarm())

/** Sets the vault clock to `ms`, then runs the alarm that is set, which must be one. */
async function fireAt(user: TestUser, ms: number): Promise<void> {
  await setVaultClock(user, ms)
  expect(await runDurableObjectAlarm(vaultOf(user))).toBe(true)
}

/** pruneSlips or slipsDueAt as the alarm runs them, on a vault clock of `at`. */
const pruneAt = (user: TestUser, at: number) =>
  runInDurableObject(vaultOf(user), (_vault, state) => {
    pruneSlips({ sql: state.storage.sql, storage: state.storage, now: new Date(at), vaultId: state.id.toString(), registry: buildVaultRegistry() })
  })
const dueAt = (user: TestUser, at: number) => runInDurableObject(vaultOf(user), (_vault, state) => slipsDueAt({ sql: state.storage.sql, storage: state.storage, now: new Date(at), vaultId: state.id.toString() }))

/** A response as a client sees it, but its request id: status, every header and the body. */
async function seen(res: Response): Promise<{ status: number; headers: [string, string][]; body: unknown }> {
  const headers = [...res.headers].filter(([name]) => name !== 'x-request-id').sort()
  const text = await res.text()
  let body: unknown = text
  if (text.length > 0) {
    const parsed = JSON.parse(text) as Json
    delete parsed.request_id
    body = parsed
  }
  return { status: res.status, headers, body }
}

describe('the drafts list (P4-T7)', () => {
  it('drafts come newest first, 50 a page and at most 200, with the total and a cursor', async () => {
    const s = await setup()
    // Five dates, three times, some with neither: ties on date and time fall to the id, and a slip
    // with no date (or no time) comes after every one with it.
    const seeded: { id: string; on: string | null; time: string | null }[] = []
    for (let i = 0; i < 120; i += 1) {
      const on = i % 10 === 9 ? null : `2026-10-1${i % 5}`
      const time = i % 7 === 3 ? null : `${String(8 + (i % 3)).padStart(2, '0')}:30`
      const { draftId } = await seedSlipDraft(s.user, { occurred_on: on, occurred_time: time })
      seeded.push({ id: draftId, on, time })
    }
    // The order the list promises, worked out here: date, time, then id, each descending, with none as ''.
    const key = (d: { id: string; on: string | null; time: string | null }) => [d.on ?? '', d.time ?? '', d.id]
    const later = (a: string[], b: string[]) => a.findIndex((part, index) => part !== b[index])
    const newestFirst = [...seeded]
      .sort((a, b) => {
        const [x, y] = [key(a), key(b)]
        const at = later(x, y)
        return at === -1 ? 0 : x[at] < y[at] ? 1 : -1
      })
      .map((d) => d.id)
    const read = async (query: string) => {
      const res = await s.client.as(s.user).get(`/v1/drafts${query}`)
      expect(res.status, query).toBe(200)
      const page = await json(res)
      expect(isSlipDraftsPage(page), query).toBe(true)
      return page
    }
    const first = await read('')
    expect([first.drafts.length, first.total, typeof first.next_cursor]).toEqual([50, 120, 'string'])
    const second = await read(`?cursor=${first.next_cursor}`)
    expect([second.drafts.length, second.total, typeof second.next_cursor]).toEqual([50, 120, 'string'])
    const third = await read(`?cursor=${second.next_cursor}`)
    expect([third.drafts.length, third.total, third.next_cursor]).toEqual([20, 120, null])
    expect([...first.drafts, ...second.drafts, ...third.drafts].map((draft: Json) => draft.id)).toEqual(newestFirst)
    // The 12 slips with no date come last, and within a date a slip with no time follows the timed ones.
    expect(third.drafts.slice(-12).map((draft: Json) => draft.occurred_on)).toEqual(Array(12).fill(null))
    const times = first.drafts.filter((draft: Json) => draft.occurred_on === '2026-10-14').map((draft: Json) => draft.occurred_time)
    expect(times).toEqual([...times].filter((time) => time !== null).sort().reverse().concat(times.filter((time: string | null) => time === null)))
    expect(times.includes(null)).toBe(true)
    // limit takes 1 to 200, and the whole list fits in one page of 200.
    const all = await read('?limit=200')
    expect([all.drafts.length, all.next_cursor]).toEqual([120, null])
    expect(all.drafts.map((draft: Json) => draft.id)).toEqual(newestFirst)
    // A page that takes the last draft exactly has no next page.
    expect((await read('?limit=120')).next_cursor).toBeNull()
    const seven = await read('?limit=7')
    expect(seven.drafts.map((draft: Json) => draft.id)).toEqual(newestFirst.slice(0, 7))
    expect((await read(`?limit=7&cursor=${seven.next_cursor}`)).drafts.map((draft: Json) => draft.id)).toEqual(newestFirst.slice(7, 14))
    for (const limit of ['201', '0', '-1', '7.5', 'abc', '']) {
      const res = await s.client.as(s.user).get(`/v1/drafts?limit=${limit}`)
      expect([limit, res.status, (await json(res)).fields]).toEqual([limit, 422, { limit: 'VALIDATION_FAILED' }])
    }
    // A cursor is this list's own: not base64url, not JSON, another kind or version, a bad id, date or time, or over 512 characters.
    const cursorOf = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
    const position = { v: 1, k: 'slip_drafts', d: '2026-10-14', t: '10:30', i: randomUUID() }
    expect((await read(`?cursor=${cursorOf(position)}`)).drafts.length).toBe(50)
    const long = cursorOf({ ...position, pad: 'x'.repeat(400) })
    expect(long.length).toBeGreaterThan(512)
    for (const cursor of ['not*base64', cursorOf('x'), cursorOf({ ...position, k: 'deleted' }), cursorOf({ ...position, v: 2 }), cursorOf({ ...position, i: 'x' }), cursorOf({ ...position, d: '14/10/2026' }), cursorOf({ ...position, t: '24:00' }), long]) {
      const res = await s.client.as(s.user).get(`/v1/drafts?cursor=${cursor}`)
      expect([cursor.slice(0, 24), res.status, (await json(res)).fields]).toEqual([cursor.slice(0, 24), 422, { cursor: 'VALIDATION_FAILED' }])
    }
    const unknown = await s.client.as(s.user).get('/v1/drafts?order=asc')
    expect([unknown.status, (await json(unknown)).fields]).toEqual([422, { order: 'UNKNOWN_FIELD' }])
  })

  it('the list names a live record with the same amount and date as a possible duplicate', async () => {
    const s = await setup()
    const money = moneyFixtures(s.client)
    const lunch = await money.record(s.user, expense(s))
    const gone = await money.record(s.user, expense(s, { amount_minor: '4500', occurred_on: '2026-10-21' }))
    expect((await s.client.as(s.user).del(`/v1/transactions/${gone}`, { ifMatch: 1 })).status).toBe(200)
    const same = await seedSlipDraft(s.user, { amount_minor: '6500', occurred_on: '2026-10-20' })
    const deleted = await seedSlipDraft(s.user, { amount_minor: '4500', occurred_on: '2026-10-21' })
    const otherDay = await seedSlipDraft(s.user, { amount_minor: '6500', occurred_on: '2026-10-22' })
    const res = await s.client.as(s.user).get('/v1/drafts')
    expect(res.status).toBe(200)
    const byId = new Map(((await json(res)).drafts as Json[]).map((draft) => [draft.id, draft.duplicate_of]))
    expect([byId.get(same.draftId), byId.get(deleted.draftId), byId.get(otherDay.draftId)]).toEqual([lunch, null, null])
  })
})

describe('confirming drafts (B10, A1)', () => {
  it('confirming 50 drafts is one command under one revision, and every record carries source slip_import and its slip ref', async () => {
    const s = await setup()
    const seeded: { draftId: string; refHash: string }[] = []
    for (let i = 0; i < SLIP_LIMITS.confirmBatch; i += 1) seeded.push(await seedSlipDraft(s.user, { amount_minor: String(1000 + i) }))
    const drafts = seeded.map((draft, i) => ({ draft_id: draft.draftId, transaction: expense(s, { amount_minor: String(1000 + i) }) }))
    const before = await revisionOf(s.user)
    const key = randomUUID()
    const res = await confirm(s, drafts, key)
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ command_id: key, entity_id: SLIP_INBOX_ID, version: 1, committed_revision: String(BigInt(before) + 1n), outcome: 'accepted', entity_state: 'active' })
    expect(await revisionOf(s.user)).toBe(String(BigInt(before) + 1n))
    expect(await sqlRows(s.user, 'SELECT kind, entity, entity_id FROM command_receipts WHERE command_id = ?', key)).toEqual([{ kind: 'slip_draft.confirm', entity: 'slip_inbox', entity_id: SLIP_INBOX_ID }])
    // One group: the 50 records in the request's order, each slip_import, then the inbox, now empty.
    const groups = (await groupsOf(s)).filter((group) => group.command_id === key)
    expect(groups.length).toBe(1)
    const changes = groups[0].changes
    expect(changes.map((change) => (change.entity === 'transaction' ? change.id : change.entity))).toEqual([...drafts.map((draft) => draft.transaction.id), 'slip_inbox'])
    expect(changes.slice(0, 50).map((change) => [change.version, change.snapshot.source, change.snapshot.amount_minor])).toEqual(drafts.map((draft) => [1, 'slip_import', draft.transaction.amount_minor]))
    expect(changes[50]).toEqual({ entity: 'slip_inbox', id: SLIP_INBOX_ID, version: 1, state: 'active', snapshot: { id: SLIP_INBOX_ID, version: 1, open: 0 } })
    // Each record holds its draft's slip reference, now confirmed with that record, and no draft is left.
    const linked = await sqlRows<{ id: string; ref_hash: string; state: string }>(s.user, 'SELECT t.id, r.ref_hash, r.state FROM transactions t JOIN slip_refs r ON r.id = t.slip_ref_id AND r.transaction_id = t.id')
    const byHash = (rows: string[][]) => rows.sort((x, y) => (x[0] < y[0] ? -1 : 1))
    expect(byHash(linked.map((row) => [row.ref_hash, row.id, row.state]))).toEqual(byHash(seeded.map((draft, i) => [draft.refHash, String(drafts[i].transaction.id), 'confirmed'])))
    expect(await countRows(s.user, 'slip_drafts')).toBe(0)
  })

  it("a shared slip's draft confirms as share_extension", async () => {
    const s = await setup()
    const shared = await seedSlipDraft(s.user, { origin: 'share' })
    const album = await seedSlipDraft(s.user, { origin: 'album' })
    const [fromShare, fromAlbum] = [expense(s), expense(s, { amount_minor: '4500' })]
    expect((await confirm(s, [{ draft_id: shared.draftId, transaction: fromShare }, { draft_id: album.draftId, transaction: fromAlbum }])).status).toBe(200)
    const sourceOf = async (id: string) => (await json(await s.client.as(s.user).get(`/v1/transactions/${id}`))).source
    expect([await sourceOf(fromShare.id), await sourceOf(fromAlbum.id)]).toEqual(['share_extension', 'slip_import'])
  })

  it('more than 50 drafts, a repeated draft or a repeated record id is 422, and nothing is written', async () => {
    const s = await setup()
    const [a, b] = [await seedSlipDraft(s.user), await seedSlipDraft(s.user)]
    const recordId = randomUUID()
    const before = await revisionOf(s.user)
    const cases: [string, { draft_id: string; transaction: Json }[], Json][] = [
      ['51 drafts', Array.from({ length: 51 }, () => ({ draft_id: randomUUID(), transaction: expense(s) })), { drafts: 'VALIDATION_FAILED' }],
      ['a draft twice', [{ draft_id: a.draftId, transaction: expense(s) }, { draft_id: a.draftId, transaction: expense(s) }], { 'drafts[1].draft_id': 'VALIDATION_FAILED' }],
      ['a record id twice', [{ draft_id: a.draftId, transaction: expense(s, { id: recordId }) }, { draft_id: b.draftId, transaction: expense(s, { id: recordId }) }], { 'drafts[1].transaction.id': 'VALIDATION_FAILED' }],
    ]
    for (const [label, drafts, fields] of cases) {
      const res = await confirm(s, drafts)
      expect([label, res.status, (await json(res)).fields]).toEqual([label, 422, fields])
    }
    expect([await revisionOf(s.user), await openIds(s.user), await countRows(s.user, 'transactions')]).toEqual([before, [a.draftId, b.draftId].sort(), 0])
  })

  it('a resent confirm replays its acknowledgement and writes nothing more', async () => {
    const s = await setup()
    const [a, b] = [await seedSlipDraft(s.user), await seedSlipDraft(s.user)]
    const drafts = [{ draft_id: a.draftId, transaction: expense(s) }, { draft_id: b.draftId, transaction: expense(s, { amount_minor: '4500' }) }]
    const key = randomUUID()
    const first = await confirm(s, drafts, key)
    expect(first.status).toBe(200)
    const ack = await json(first)
    const after = { revision: await revisionOf(s.user), records: await countRows(s.user, 'transactions'), receipts: await countRows(s.user, 'command_receipts') }
    const again = await confirm(s, drafts, key)
    expect([again.status, await json(again)]).toEqual([200, ack])
    expect({ revision: await revisionOf(s.user), records: await countRows(s.user, 'transactions'), receipts: await countRows(s.user, 'command_receipts') }).toEqual({ ...after, records: 2 })
    // The same key with other content is refused.
    const other = await confirm(s, [drafts[0]], key)
    expect([other.status, (await json(other)).code]).toEqual([409, 'IDEMPOTENCY_MISMATCH'])
    expect(await revisionOf(s.user)).toBe(after.revision)
  })

  it('a draft confirmed on another phone makes the batch 409, and nothing is written', async () => {
    const s = await setup()
    const [a, b] = [await seedSlipDraft(s.user), await seedSlipDraft(s.user)]
    expect((await confirm(s, [{ draft_id: a.draftId, transaction: expense(s) }])).status).toBe(200)
    const before = await revisionOf(s.user)
    const late = expense(s, { amount_minor: '4500' })
    const res = await confirm(s, [{ draft_id: a.draftId, transaction: expense(s) }, { draft_id: b.draftId, transaction: late }], undefined, otherSession(s.user))
    expect([res.status, (await json(res)).code]).toEqual([409, 'VERSION_CONFLICT'])
    expect([await revisionOf(s.user), await openIds(s.user), (await s.client.as(s.user).get(`/v1/transactions/${String(late.id)}`)).status]).toEqual([before, [b.draftId], 404])
    // After a reload, the phone confirms what is still open.
    expect((await confirm(s, [{ draft_id: b.draftId, transaction: late }], undefined, otherSession(s.user))).status).toBe(200)
  })

  it('each record is checked as transactions.create checks it, and a refused record is named by its draft index', async () => {
    const s = await setup()
    const [a, b] = [await seedSlipDraft(s.user), await seedSlipDraft(s.user)]
    const before = await revisionOf(s.user)
    const refused = async (drafts: { draft_id: string; transaction: Json }[]) => {
      const res = await confirm(s, drafts)
      const body = await json(res)
      return [res.status, body.code, body.fields]
    }
    // A category of the other type, on the first draft.
    expect(await refused([{ draft_id: a.draftId, transaction: expense(s, { category_id: builtinId(s.user, 'salary') }) }])).toEqual([422, 'VALIDATION_FAILED', { 'drafts[0].transaction.category_id': 'errors.category_type_mismatch' }])
    // A second draft dated before its wallet's start, after a first that is fine.
    expect(await refused([{ draft_id: a.draftId, transaction: expense(s) }, { draft_id: b.draftId, transaction: expense(s, { occurred_on: '2025-12-31' }) }])).toEqual([422, 'DATE_BEFORE_TRACKING_START', { 'drafts[1].transaction.occurred_on': 'DATE_BEFORE_TRACKING_START' }])
    // The record's own checks, before its references: an amount of nothing, an unknown wallet.
    expect(await refused([{ draft_id: b.draftId, transaction: expense(s, { amount_minor: '0' }) }])).toEqual([422, 'MINOR_OUT_OF_RANGE', { 'drafts[0].transaction.amount_minor': 'MINOR_OUT_OF_RANGE' }])
    expect(await refused([{ draft_id: a.draftId, transaction: expense(s) }, { draft_id: b.draftId, transaction: expense(s, { wallet_id: randomUUID() }) }])).toEqual([422, 'VALIDATION_FAILED', { 'drafts[1].transaction.wallet_id': 'errors.wallet_not_found' }])
    expect([await revisionOf(s.user), await openIds(s.user), await countRows(s.user, 'transactions')]).toEqual([before, [a.draftId, b.draftId].sort(), 0])
    // The rest of the batch saves without the refused draft (Review Focus 1).
    expect((await confirm(s, [{ draft_id: a.draftId, transaction: expense(s) }])).status).toBe(200)
    expect(await openIds(s.user)).toEqual([b.draftId])
  })

  it('a transaction carrying source or slip_ref_id is 422 UNKNOWN_FIELD: the vault sets both', async () => {
    const s = await setup()
    const a = await seedSlipDraft(s.user)
    for (const extra of [{ source: 'slip_import' }, { source: 'typed' }, { slip_ref_id: randomUUID() }]) {
      const res = await confirm(s, [{ draft_id: a.draftId, transaction: expense(s, extra) }])
      const field = `drafts[0].transaction.${Object.keys(extra)[0]}`
      expect([res.status, await json(res)]).toEqual([422, expect.objectContaining({ code: 'UNKNOWN_FIELD', fields: { [field]: 'UNKNOWN_FIELD' } })])
    }
    expect([await openIds(s.user), await countRows(s.user, 'transactions')]).toEqual([[a.draftId], 0])
    // transactions.create still takes its own source, and never a slip reference.
    const typed = expense(s, { source: 'photo' })
    expect((await s.client.as(s.user).post('/v1/transactions', typed)).status).toBe(201)
    const linked = await s.client.as(s.user).post('/v1/transactions', expense(s, { slip_ref_id: randomUUID() }))
    expect([linked.status, (await json(linked)).fields]).toEqual([422, { slip_ref_id: 'UNKNOWN_FIELD' }])
  })

  it('slip confirmations send no record_saved (S18)', async () => {
    const sent: CaptureMessage[] = []
    const pending: Promise<unknown>[] = []
    const port: PostHogPort = { captureImmediate: async (message) => void sent.push(message) }
    const analytics = (e: V1Env) => createServerAnalytics(e, (promise) => void pending.push(promise), () => port)
    const settle = async () => {
      while (pending.length > 0) await Promise.all(pending.splice(0))
    }
    const s = await setup({ env: { POSTHOG_PROJECT_TOKEN: 'phc_test', ANALYTICS_ID_KEY: 'test-analytics-key', SLIP_IMPORT_ENABLED: 'true' }, analytics })
    expect((await s.client.as(s.user).put('/v1/me/privacy-preferences', { analytics: true })).status).toBe(200)
    const [a, b] = [await seedSlipDraft(s.user), await seedSlipDraft(s.user)]
    await settle()
    sent.length = 0
    expect((await confirm(s, [{ draft_id: a.draftId, transaction: expense(s) }, { draft_id: b.draftId, transaction: expense(s, { amount_minor: '4500' }) }])).status).toBe(200)
    await settle()
    expect(sent).toEqual([])
    // The control: the same person's typed record is sent.
    expect((await s.client.as(s.user).post('/v1/transactions', expense(s))).status).toBe(201)
    await settle()
    expect(sent.map((message) => message.event)).toEqual(['record_saved'])
  })
})

describe('dismissing a draft, and the inbox count', () => {
  it('dismissing keeps the slip known, and a dismissed draft cannot be confirmed', async () => {
    const s = await setup()
    const [a, b] = [await seedSlipDraft(s.user), await seedSlipDraft(s.user)]
    const key = randomUUID()
    const res = await dismiss(s, a.draftId, key)
    expect(res.status).toBe(200)
    const ack = await json(res)
    expect(ack).toMatchObject({ command_id: key, entity_id: SLIP_INBOX_ID, version: 1, outcome: 'updated', entity_state: 'active' })
    expect([await openIds(s.user), await refState(s.user, a.refHash), await refState(s.user, b.refHash)]).toEqual([[b.draftId], [{ state: 'dismissed', transaction_id: null }], [{ state: 'draft', transaction_id: null }]])
    const inbox = (await groupsOf(s)).filter((group) => group.command_id === key).flatMap((group) => group.changes)
    expect(inbox).toEqual([{ entity: 'slip_inbox', id: SLIP_INBOX_ID, version: 1, state: 'active', snapshot: { id: SLIP_INBOX_ID, version: 1, open: 1 } }])
    const after = await revisionOf(s.user)
    // A resend replays; a dismissed draft is gone for confirm and for another dismiss.
    const again = await dismiss(s, a.draftId, key)
    expect([again.status, await json(again)]).toEqual([200, ack])
    const confirmed = await confirm(s, [{ draft_id: a.draftId, transaction: expense(s) }])
    expect([confirmed.status, (await json(confirmed)).code]).toEqual([409, 'VERSION_CONFLICT'])
    const twice = await dismiss(s, a.draftId)
    expect([twice.status, (await json(twice)).code]).toEqual([404, 'NOT_FOUND'])
    // The draft's id before the body (R41): an id that is not one is 404 whatever the body holds.
    expect((await dismiss(s, 'not-a-draft')).status).toBe(404)
    expect((await s.client.as(s.user).post('/v1/drafts/not-a-draft/dismiss', { reason: 'mine' })).status).toBe(404)
    const extra = await s.client.as(s.user).post(`/v1/drafts/${b.draftId}/dismiss`, { reason: 'mine' })
    expect([extra.status, (await json(extra)).fields]).toEqual([422, { reason: 'UNKNOWN_FIELD' }])
    expect([await revisionOf(s.user), await openIds(s.user), await refState(s.user, a.refHash)]).toEqual([after, [b.draftId], [{ state: 'dismissed', transaction_id: null }]])
  })

  it('confirm and dismiss poke the other phones with the new inbox count', async () => {
    const s = await setup()
    const phone = otherSession(s.user)
    const opened = await openLive(s.client, phone)
    expect(opened.status).toBe(101)
    const socket = opened.socket as NonNullable<typeof opened.socket>
    try {
      const [a, b, c] = [await seedSlipDraft(s.user), await seedSlipDraft(s.user), await seedSlipDraft(s.user)]
      const confirmed = await confirm(s, [{ draft_id: a.draftId, transaction: expense(s) }])
      expect(confirmed.status).toBe(200)
      expect(await socket.next()).toBe(`{"revision":"${(await json(confirmed)).committed_revision}"}`)
      const dismissed = await dismiss(s, b.draftId)
      expect(dismissed.status).toBe(200)
      expect(await socket.next()).toBe(`{"revision":"${(await json(dismissed)).committed_revision}"}`)
      // The other phone reads the counts from the delta feed: 2 open, then 1.
      const counts = (await groupsOf(s, phone)).flatMap((group) => group.changes).filter((change) => change.entity === 'slip_inbox').map((change) => change.snapshot.open)
      expect(counts).toEqual([2, 1])
      expect(await openIds(s.user)).toEqual([c.draftId])
    } finally {
      socket.close()
    }
  })
})

describe("a single read's slip ref (P4-T16b)", () => {
  it("a single read's slip ref is recorded once against its record", async () => {
    // Not released: the slip ref answers before slip import opens (S13).
    const s = await setup({})
    const money = moneyFixtures(s.client)
    const lunch = await money.record(s.user, expense(s, { source: 'photo' }))
    const hash = randomRefHash()
    for (let i = 0; i < 2; i += 1) {
      const res = await recordRef(s, { ref_hash: hash, transaction_id: lunch })
      expect([i, res.status, await res.text()]).toEqual([i, 204, ''])
    }
    const refs = await sqlRows<{ id: string; state: string; transaction_id: string }>(s.user, 'SELECT id, state, transaction_id FROM slip_refs WHERE ref_hash = ?', hash)
    expect(refs.map((ref) => [ref.state, ref.transaction_id])).toEqual([['recorded', lunch]])
    expect(await sqlRows(s.user, 'SELECT slip_ref_id FROM transactions WHERE id = ?', lunch)).toEqual([{ slip_ref_id: refs[0].id }])
    // A record that is not live is 404, and its slip is not recorded.
    const gone = await money.record(s.user, expense(s, { amount_minor: '4500' }))
    expect((await s.client.as(s.user).del(`/v1/transactions/${gone}`, { ifMatch: 1 })).status).toBe(200)
    for (const id of [gone, randomUUID()]) {
      const other = randomRefHash()
      const res = await recordRef(s, { ref_hash: other, transaction_id: id })
      expect([res.status, (await json(res)).code, await refState(s.user, other)]).toEqual([404, 'NOT_FOUND', []])
    }
    const bad = await recordRef(s, { ref_hash: 'A'.repeat(64), transaction_id: lunch })
    expect([bad.status, (await json(bad)).fields]).toEqual([422, { ref_hash: 'VALIDATION_FAILED' }])
  })

  it('a slip ref leaves the record as it was: its version, its source or none, its change log and a slip ref it has', async () => {
    const s = await setup()
    const money = moneyFixtures(s.client)
    const photo = await money.record(s.user, expense(s, { source: 'photo' }))
    const plain = await money.record(s.user, expense(s, { amount_minor: '4500' }))
    // A record confirmed from a draft already holds that draft's slip reference.
    const draft = await seedSlipDraft(s.user, { amount_minor: '3000' })
    const confirmed = expense(s, { amount_minor: '3000' })
    expect((await confirm(s, [{ draft_id: draft.draftId, transaction: confirmed }])).status).toBe(200)
    const [{ slip_ref_id: draftRef }] = await sqlRows<{ slip_ref_id: string }>(s.user, 'SELECT slip_ref_id FROM transactions WHERE id = ?', confirmed.id)
    // A slip still open as a draft is known too.
    const open = await seedSlipDraft(s.user, { amount_minor: '2000' })
    const before = await revisionOf(s.user)
    for (const [hash, id] of [[randomRefHash(), photo], [randomRefHash(), plain], [randomRefHash(), confirmed.id], [open.refHash, plain]] as const) {
      expect((await recordRef(s, { ref_hash: hash, transaction_id: id })).status).toBe(204)
    }
    const read = async (id: string) => json(await s.client.as(s.user).get(`/v1/transactions/${id}`))
    const [p, q, r] = [await read(photo), await read(plain), await read(String(confirmed.id))]
    expect([p.version, p.source, q.version, 'source' in q, r.version, r.source]).toEqual([1, 'photo', 1, false, 1, 'slip_import'])
    expect(await revisionOf(s.user)).toBe(before)
    expect(await sqlRows(s.user, 'SELECT slip_ref_id FROM transactions WHERE id = ?', confirmed.id)).toEqual([{ slip_ref_id: draftRef }])
    expect([await openIds(s.user), await refState(s.user, open.refHash)]).toEqual([[open.draftId], [{ state: 'draft', transaction_id: null }]])
    // The plain record's slip reference is the one recorded for it, not the open draft's.
    expect(await sqlRows(s.user, "SELECT r.state FROM transactions t JOIN slip_refs r ON r.id = t.slip_ref_id WHERE t.id = ?", plain)).toEqual([{ state: 'recorded' }])
  })
})

describe('the 30-day expiry (C11, R37)', () => {
  it('an open draft leaves the inbox 30 days after it was read, and its slip stays known (C11)', async () => {
    const s = await setup()
    // Read two days and one day ago: the first expiry is the vault's earliest due work.
    const readAt = Date.now() - 2 * DAY
    const expiring = await seedSlipDraft(s.user, { created_at: iso(readAt) })
    const staying = await seedSlipDraft(s.user, { created_at: iso(readAt + DAY) })
    const other = await seedSlipDraft(s.user)
    const expiresAt = readAt + SLIP_LIMITS.draftDays * DAY
    // A dismiss commits a command, so its call sets the alarm: at the first expiry.
    expect((await dismiss(s, other.draftId)).status).toBe(200)
    expect(await alarmOf(s.user)).toBe(expiresAt)
    // A moment before, the alarm's prune leaves it, and the alarm comes back at its expiry.
    await fireAt(s.user, expiresAt - 1)
    expect([await openIds(s.user), await alarmOf(s.user)]).toEqual([[expiring.draftId, staying.draftId].sort(), expiresAt])
    const before = await revisionOf(s.user)
    await fireAt(s.user, expiresAt)
    expect([await openIds(s.user), await refState(s.user, expiring.refHash)]).toEqual([[staying.draftId], [{ state: 'expired', transaction_id: null }]])
    // One inbox change, under the prune's derived id and with no receipt: one fewer open.
    const commandId = derivedUuid(vaultIdOf(s.user), 'slip-prune', iso(expiresAt))
    const changes = await sqlRows<{ revision: string; command_id: string; entity: string; snapshot: string }>(s.user, 'SELECT CAST(revision AS TEXT) AS revision, command_id, entity, snapshot FROM entity_changes WHERE revision > CAST(? AS INTEGER)', before)
    expect(changes.map((change) => [change.revision, change.command_id, change.entity, JSON.parse(change.snapshot)])).toEqual([[String(BigInt(before) + 1n), commandId, 'slip_inbox', { id: SLIP_INBOX_ID, version: 2, open: 1 }]])
    expect(await sqlRows(s.user, 'SELECT command_id FROM command_receipts WHERE command_id = ?', commandId)).toEqual([])
    // The alarm moves on to the other draft's expiry; the prunes ran with the registry the vault built once.
    expect(await alarmOf(s.user)).toBe(readAt + DAY + SLIP_LIMITS.draftDays * DAY)
    expect(await runInDurableObject(vaultOf(s.user), (vault: UserVault) => vault.registry === vault.registry)).toBe(true)
  })

  it('after pruneSlips at slipsDueAt, the next slipsDueAt is later or null (R37), and backfill uses go once more than 31 Bangkok days old', async () => {
    const s = await setup()
    const first = Date.parse('2027-02-05T03:00:00.000Z')
    const second = Date.parse('2027-02-15T12:00:00.000Z')
    const d1 = await seedSlipDraft(s.user, { created_at: iso(first - SLIP_LIMITS.draftDays * DAY) })
    const d2 = await seedSlipDraft(s.user, { created_at: iso(second - SLIP_LIMITS.draftDays * DAY) })
    await sqlExec(s.user, "INSERT INTO slip_backfill_uses (day, uses) VALUES ('2027-01-08', 3), ('2027-01-20', 4)")
    // 2027-01-08 is more than 31 days old from Bangkok's 2027-02-09 (17:00 UTC the day before); 2027-01-20 from 2027-02-21.
    const oldDay = Date.parse('2027-02-09T00:00:00.000+07:00')
    const newDay = Date.parse('2027-02-21T00:00:00.000+07:00')
    const days = async () => (await sqlRows<{ day: string }>(s.user, 'SELECT day FROM slip_backfill_uses ORDER BY day')).map((row) => row.day)
    /** One prune at `at`, then what is left and when the next one is due. */
    const step = async (at: number) => {
      await expect(pruneAt(s.user, at)).resolves.toBeUndefined()
      return { open: await openIds(s.user), days: await days(), revision: await revisionOf(s.user), next: await dueAt(s.user, at) }
    }
    expect(await dueAt(s.user, first - DAY)).toBe(first)
    const start = await revisionOf(s.user)
    const one = await step(first)
    expect(one).toEqual({ open: [d2.draftId], days: ['2027-01-08', '2027-01-20'], revision: String(BigInt(start) + 1n), next: oldDay })
    // A moment before the old day's Bangkok midnight its row stays, and nothing is written.
    expect(await step(oldDay - 1)).toEqual(one)
    const two = await step(oldDay)
    expect(two).toEqual({ open: [d2.draftId], days: ['2027-01-20'], revision: one.revision, next: second })
    const three = await step(second)
    expect(three).toEqual({ open: [], days: ['2027-01-20'], revision: String(BigInt(start) + 2n), next: newDay })
    expect(await step(newDay)).toEqual({ open: [], days: [], revision: three.revision, next: null })
    expect([await refState(s.user, d1.refHash), await refState(s.user, d2.refHash)]).toEqual([[{ state: 'expired', transaction_id: null }], [{ state: 'expired', transaction_id: null }]])
  })

  it('the prune takes more drafts than SQLite has parameters', async () => {
    const s = await setup()
    const expiresAt = Date.parse('2027-03-01T00:00:00.000Z')
    for (let i = 0; i < 101; i += 1) await seedSlipDraft(s.user, { created_at: iso(expiresAt - SLIP_LIMITS.draftDays * DAY - i) })
    const stays = await seedSlipDraft(s.user, { created_at: iso(expiresAt - SLIP_LIMITS.draftDays * DAY + 1) })
    const before = await revisionOf(s.user)
    await expect(pruneAt(s.user, expiresAt)).resolves.toBeUndefined()
    expect(await openIds(s.user)).toEqual([stays.draftId])
    expect(await sqlRows(s.user, 'SELECT state, count(*) AS n FROM slip_refs GROUP BY state ORDER BY state')).toEqual([{ state: 'draft', n: 1 }, { state: 'expired', n: 101 }])
    const snapshots = await sqlRows<{ snapshot: string }>(s.user, "SELECT snapshot FROM entity_changes WHERE entity = 'slip_inbox' AND revision > CAST(? AS INTEGER)", before)
    expect(snapshots.map((row) => JSON.parse(row.snapshot).open)).toEqual([1])
  })
})

describe('the routes (S13, C12)', () => {
  it('the drafts routes are 404 until SLIP_IMPORT_ENABLED is on, as a missing path answers, and the slip ref answers before it', async () => {
    // wrangler.jsonc's own var: SLIP_IMPORT_ENABLED "false".
    const s = await setup({})
    const hidden = s.client
    // A draft that is open: released, a dismiss of it would answer 200.
    const { draftId: id } = await seedSlipDraft(s.user)
    const body = JSON.stringify({ drafts: [{ draft_id: id, transaction: {} }] })
    const pairs: [string, (path: string) => Promise<Response>][] = [
      ['GET /v1/drafts', (path) => hidden.raw(new Request(`${BASE}${path}`))],
      ['GET /v1/drafts signed in', (path) => hidden.as(s.user).get(path)],
      ['POST /v1/drafts/confirm', (path) => hidden.raw(new Request(`${BASE}${path}/confirm`, { method: 'POST', headers: { 'content-type': 'application/json' }, body }))],
      ['POST /v1/drafts/confirm signed in', (path) => hidden.as(s.user).post(`${path}/confirm`, JSON.parse(body))],
      ['POST /v1/drafts/:id/dismiss signed in', (path) => hidden.as(s.user).post(`${path}/${id}/dismiss`, {})],
    ]
    for (const [label, send] of pairs) {
      const unreleased = await seen(await send('/v1/drafts'))
      expect(unreleased.status, label).toBe(404)
      expect(unreleased, label).toEqual(await seen(await send('/v1/draftz')))
    }
    expect(await openIds(s.user)).toEqual([id])
    // The slip ref is not behind the release.
    const lunch = await moneyFixtures(hidden).record(s.user, expense(s))
    expect((await hidden.as(s.user).post('/v1/slips/refs', { ref_hash: randomRefHash(), transaction_id: lunch })).status).toBe(204)
    // Released, the list answers.
    expect((await (await startV1(CONFIG, RELEASED)).as(s.user).get('/v1/drafts')).status).toBe(200)
  })

  it('confirm, dismiss and the slip ref are writes under the current policy and the imports gate, confirm also under writes; the list needs only the session', async () => {
    const client = await startV1(CONFIG, RELEASED)
    const user = newUser()
    const draft = await seedSlipDraft(user)
    const shape = async (res: Response) => [res.status, (await json(res)).code]
    expect((await client.as(user).get('/v1/drafts')).status).toBe(200)
    const policy = [403, 'POLICY_ACCEPTANCE_REQUIRED']
    expect(await shape(await client.as(user).post('/v1/drafts/confirm', { drafts: [{ draft_id: draft.draftId, transaction: { id: randomUUID() } }] }))).toEqual(policy)
    expect(await shape(await client.as(user).post(`/v1/drafts/${draft.draftId}/dismiss`, {}))).toEqual(policy)
    expect(await shape(await client.as(user).post('/v1/slips/refs', { ref_hash: randomRefHash(), transaction_id: randomUUID() }))).toEqual(policy)
    await member(client, user)
    // Each front door is made right before its requests: startV1 rewrites the one config entry.
    const imports = await startV1({ ...CONFIG, gates: { paused: ['imports'] } }, RELEASED)
    expect(await shape(await imports.as(user).post('/v1/drafts/confirm', { drafts: [{ draft_id: draft.draftId, transaction: { id: randomUUID() } }] }))).toEqual([503, 'IMPORTS_PAUSED'])
    expect(await shape(await imports.as(user).post(`/v1/drafts/${draft.draftId}/dismiss`, {}))).toEqual([503, 'IMPORTS_PAUSED'])
    expect(await shape(await imports.as(user).post('/v1/slips/refs', { ref_hash: randomRefHash(), transaction_id: randomUUID() }))).toEqual([503, 'IMPORTS_PAUSED'])
    const writes = await startV1({ ...CONFIG, gates: { paused: ['writes'] } }, RELEASED)
    expect(await shape(await writes.as(user).post('/v1/drafts/confirm', { drafts: [{ draft_id: draft.draftId, transaction: { id: randomUUID() } }] }))).toEqual([503, 'WRITES_PAUSED'])
    expect(await openIds(user)).toEqual([draft.draftId])
    // With writes paused, a dismiss still goes through: it writes no record.
    expect((await writes.as(user).post(`/v1/drafts/${draft.draftId}/dismiss`, {})).status).toBe(200)
    expect(await openIds(user)).toEqual([])
  })
})
