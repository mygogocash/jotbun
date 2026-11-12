// Server events and the analytics id (1D-T11; plan 1D's L4 to L6, spec §7).
// GET /v1/me/analytics answers the HMAC analytics id, the whole weeks since
// sign-up and the person's consent. After a vault call the Worker sends
// record_saved for each record a create committed, resync_required for a stale
// cursor and sync_failed for a vault failure on the outbox's routes, under the
// analytics id, only for a person who said yes, on a request not marked off. A
// real failure is also counted anonymously, by its class name; a deliberate
// refusal never is. No test reaches PostHog: each front door here gets
// createServerAnalytics with a fake port, which records every message the SDK
// would send, and no analytics secret is set in vitest.workers.config.ts.
// Every case that checks nothing is sent also checks that something is sent
// once the condition is lifted, so no case passes before the code exists.
import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

import type { CommandAck } from '@gogospend/contracts'

import { toPreviewRecord } from '@api/imports/parse-outcome'
import type { ParsedRow } from '@api/imports/parsers/protocol'
import { encodeSyncCursor } from '@api/sync/sync-cursor'

import { createServerAnalytics } from '../../src/analytics/server-analytics'
import type { CaptureMessage, PostHogPort } from '../../src/analytics/server-analytics'
import type { EdgeConfigJson } from '../../src/v1/config'
import type { V1Env } from '../../src/v1/env'
import type { V1Deps } from '../../src/v1/handler'
import type { VaultCall, VaultRouteId } from '../../src/v1/protocol'
import { WORKER_HANDLERS } from '../../src/v1/worker-routes'
import { committedEvents } from '../../src/vault/analytics'
import { VAULT_HANDLERS } from '../../src/vault/routes'
import { countRows, inVault, revisionOf, sqlExec } from './support/command-fixtures'
import { seedPreview } from './support/files'
import { builtinId, moneyFixtures } from './support/money-fixtures'
import { BASE, TEST_POLICIES, newUser, signedHeaders, startV1, vaultOf } from './support/v1-client'
import type { TestUser, V1Client } from './support/v1-client'

type Body = Record<string, any>
type Reply = { status: number; body: Body }

const KEY = 'test-analytics-key'
/** Both server analytics secrets, per test: never in the Workers config. */
const ON: Partial<V1Env> = { POSTHOG_PROJECT_TOKEN: 'phc_test', ANALYTICS_ID_KEY: KEY }
const CONFIG: EdgeConfigJson = { policies: TEST_POLICIES, client_versions: { ios: '1.0.0', android: '1.0.0' } }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const json = async (res: Response): Promise<Reply> => {
  const text = await res.text()
  return { status: res.status, body: text ? (JSON.parse(text) as Body) : {} }
}

/** The analytics id a test expects: the lowercase hex HMAC-SHA256 of the user id under the test key, computed here with crypto.subtle. */
async function hmacOf(sub: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(sub))
  return [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

type Recording = { sent: CaptureMessage[]; settled(): Promise<void>; analytics: NonNullable<V1Deps['analytics']> }

/** The server's analytics with a fake port: every message the SDK would send is recorded in `sent`, in order. */
function recording(): Recording {
  const sent: CaptureMessage[] = []
  const pending: Promise<unknown>[] = []
  const port: PostHogPort = {
    captureImmediate: async (message) => {
      sent.push(message)
    },
  }
  return {
    sent,
    settled: async () => {
      while (pending.length > 0) await Promise.all(pending.splice(0))
    },
    analytics: (env) => createServerAnalytics(env, (promise) => pending.push(promise), () => port),
  }
}

/** A front door whose server events go to `r`, with the analytics secrets `env` gives. */
const frontDoor = (r: Recording, config: EdgeConfigJson = CONFIG, env: Partial<V1Env> = ON): Promise<V1Client> => startV1(config, { env, analytics: r.analytics })

/** A person who accepted the terms, with the built-in categories and one wallet, Cash. */
async function ledger(client: V1Client): Promise<{ user: TestUser; wallet: string }> {
  const money = moneyFixtures(client)
  const user = await money.member()
  return { user, wallet: await money.wallet(user) }
}

/** The person's analytics answer, as the app sends it (PUT /v1/me/privacy-preferences). */
async function answer(client: V1Client, user: TestUser, analytics: boolean): Promise<void> {
  expect((await client.as(user).put('/v1/me/privacy-preferences', { analytics })).status).toBe(200)
}

/** A lunch in the built-in food category, with a note and a merchant in Thai. */
const lunch = (user: TestUser, wallet: string, overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: randomUUID(),
  type: 'expense',
  amount_minor: '6500',
  occurred_on: '2026-10-20',
  wallet_id: wallet,
  category_id: builtinId(user, 'food'),
  note: 'ร้านป้าแดง',
  merchant: 'ป้าแดง',
  ...overrides,
})

/** POST /v1/transactions as the phone sends it, with any extra headers (the off header). */
async function record(client: V1Client, user: TestUser, body: Record<string, unknown>, extra: Record<string, string> = {}, key: string = randomUUID()): Promise<Response> {
  const headers = { ...(await signedHeaders(user)), 'idempotency-key': key, 'x-gogospend-command-schema': '1', 'content-type': 'application/json', ...extra }
  return client.raw(new Request(`${BASE}/v1/transactions`, { method: 'POST', headers, body: JSON.stringify(body) }))
}

/** Records a lunch and expects it created. */
async function saved(client: V1Client, user: TestUser, wallet: string, extra: Record<string, string> = {}): Promise<void> {
  expect((await record(client, user, lunch(user, wallet), extra)).status).toBe(201)
}

/** Confirms an import of three food rows into the Cash wallet (1B-T10's review routes); the vault creates three records. */
async function importThree(client: V1Client, user: TestUser, wallet: string): Promise<void> {
  const rows: ParsedRow[] = [2, 3, 4].map((n) => ({
    source_row_id: `row:${n}`,
    occurred_on: `2026-10-0${n}`,
    type: 'expense',
    amount_minor: String(n * 1000),
    wallet_label: 'Cash',
    category_label: 'food',
    merchant: null,
    note: null,
    issues: [],
  }))
  const candidates = toPreviewRecord({ ok: true, layout: 'generic', rows, file_issues: [], image: null, header_fingerprint: null, usage: { max_rss_kb: 1024, cpu_ms: 5 } }, '2026-12-31').candidates
  const jobId = await seedPreview(user, candidates)
  const ids = rows.map((row) => row.source_row_id)
  const mapping = { wallets: { Cash: wallet }, categories: { expense: { food: builtinId(user, 'food') }, income: {} } }
  const frozen = await json(await client.as(user).post(`/v1/imports/${jobId}/selections`, { review_revision: '1', selected_row_ids: ids, mapping }))
  expect(frozen.status).toBe(201)
  const confirmed = await json(await client.as(user).post(`/v1/imports/${jobId}/confirmations`, { selection_id: (frozen.body as CommandAck).entity_id, frozen_revision: '1', batch_row_ids: ids }))
  expect(confirmed.status).toBe(200)
}

/** Runs `run` with console.error silenced, and answers the lines it would have written. */
async function quietly(run: () => Promise<void>): Promise<string[]> {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  try {
    await run()
    return errors.mock.calls.map(([line]) => String(line))
  } finally {
    errors.mockRestore()
  }
}

describe('the analytics answer: GET /v1/me/analytics', () => {
  it("the analytics id is the HMAC of the caller's id, with the weeks and the consent", async () => {
    const client = await frontDoor(recording())
    const user = newUser()
    const id = await hmacOf(user.sub)
    const read = async () => json(await client.as(user).get('/v1/me/analytics'))
    const first = await read()
    expect(first).toEqual({ status: 200, body: { analytics_id: id, weeks_since_signup: 0, consent: 'unasked' } })
    expect(Object.keys(first.body)).toEqual(['analytics_id', 'weeks_since_signup', 'consent'])
    await answer(client, user, true)
    const yes = await read()
    expect(yes).toEqual({ status: 200, body: { analytics_id: id, weeks_since_signup: 0, consent: 'yes' } })
    await answer(client, user, false)
    const no = await read()
    expect(no).toEqual({ status: 200, body: { analytics_id: id, weeks_since_signup: 0, consent: 'no' } })
    for (const reply of [first, yes, no]) expect(JSON.stringify(reply.body)).not.toContain(user.sub)
  })

  it('without the key the analytics id is null, and nothing is sent under the person', async () => {
    const r = recording()
    const client = await frontDoor(r, CONFIG, { POSTHOG_PROJECT_TOKEN: 'phc_test', ANALYTICS_ID_KEY: undefined })
    const { user, wallet } = await ledger(client)
    expect(await json(await client.as(user).get('/v1/me/analytics'))).toEqual({ status: 200, body: { analytics_id: null, weeks_since_signup: 0, consent: 'unasked' } })
    await answer(client, user, true)
    await saved(client, user, wallet)
    expect(await json(await client.as(user).get('/v1/me/analytics'))).toEqual({ status: 200, body: { analytics_id: null, weeks_since_signup: 0, consent: 'yes' } })
    await r.settled()
    expect(r.sent).toEqual([])
    // With the key set, the same person's next record is sent under their analytics id.
    const keyed = await frontDoor(r)
    await saved(keyed, user, wallet)
    await r.settled()
    expect(r.sent.map((message) => [message.event, message.distinctId])).toEqual([['record_saved', await hmacOf(user.sub)]])
  })

  it('an ended session cannot read it', async () => {
    const client = await frontDoor(recording())
    const user = newUser()
    expect((await client.as(user).get('/v1/me/analytics')).status).toBe(200)
    expect((await client.as(user).post('/v1/me/logout')).status).toBe(204)
    expect(await json(await client.as(user).get('/v1/me/analytics'))).toMatchObject({ status: 401, body: { code: 'SESSION_REQUIRED' } })
  })

  it('the weeks since sign-up are whole weeks on the vault clock, from 0 to 1040', async () => {
    const client = await frontDoor(recording())
    const user = newUser()
    const weeks = async (): Promise<unknown> => (await json(await client.as(user).get('/v1/me/analytics'))).body.weeks_since_signup
    expect(await weeks()).toBe(0)
    const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()
    // 20 days is 2.86 weeks: whole weeks round down. 21 years is past the 1040-week bound. A future or unreadable time is 0.
    const cases: [string, number][] = [[daysAgo(20), 2], [daysAgo(21 * 366), 1040], [daysAgo(-3), 0], ['not a time', 0]]
    for (const [createdAt, expected] of cases) {
      await sqlExec(user, 'UPDATE account_state SET created_at = ? WHERE id = 1', createdAt)
      expect(await weeks(), createdAt).toBe(expected)
    }
  })
})

describe('server events', () => {
  it('a record saved by a person who said yes sends one record_saved with kind and category only', async () => {
    const r = recording()
    const client = await frontDoor(r)
    const { user, wallet } = await ledger(client)
    await answer(client, user, true)
    const body = lunch(user, wallet)
    expect((await record(client, user, body)).status).toBe(201)
    await r.settled()
    expect(r.sent).toEqual([{ distinctId: await hmacOf(user.sub), event: 'record_saved', properties: { kind: 'expense', category_key: 'food', origin: 'server' } }])
    const text = JSON.stringify(r.sent)
    for (const value of [user.sub, String(body.id), wallet, '6500', 'ร้านป้าแดง', 'ป้าแดง']) expect(text).not.toContain(value)
  })

  it('a transfer sends its kind only, and a record in a category of its own is sent as custom', async () => {
    const r = recording()
    const client = await frontDoor(r)
    const { user, wallet } = await ledger(client)
    const savings = await moneyFixtures(client).wallet(user, { name: 'Savings' })
    const own = randomUUID()
    expect((await client.as(user).post('/v1/categories', { id: own, type: 'expense', label: 'ก๋วยเตี๋ยวเรือ' })).status).toBe(201)
    await answer(client, user, true)
    const transfer = { id: randomUUID(), type: 'transfer', amount_minor: '1000', occurred_on: '2026-10-20', source_wallet_id: wallet, destination_wallet_id: savings }
    expect((await record(client, user, transfer)).status).toBe(201)
    expect((await record(client, user, lunch(user, wallet, { category_id: own }))).status).toBe(201)
    await r.settled()
    const id = await hmacOf(user.sub)
    expect(r.sent).toEqual([
      { distinctId: id, event: 'record_saved', properties: { kind: 'transfer', origin: 'server' } },
      { distinctId: id, event: 'record_saved', properties: { kind: 'expense', category_key: 'custom', origin: 'server' } },
    ])
    expect(JSON.stringify(r.sent)).not.toContain('ก๋วยเตี๋ยวเรือ')
  })

  it('a resent command sends no second event', async () => {
    const r = recording()
    const client = await frontDoor(r)
    const { user, wallet } = await ledger(client)
    await answer(client, user, true)
    const body = lunch(user, wallet)
    const key = randomUUID()
    const first = await json(await record(client, user, body, {}, key))
    const again = await json(await record(client, user, body, {}, key))
    expect(first.status).toBe(201)
    expect(again).toEqual(first)
    await r.settled()
    expect(r.sent.map((message) => message.event)).toEqual(['record_saved'])
  })

  it('nothing is sent for a person who said no, or while their phone says off', async () => {
    const r = recording()
    const client = await frontDoor(r)
    const { user, wallet } = await ledger(client)
    // Never asked, then no, then yes with the request marked off (in any case).
    await saved(client, user, wallet)
    await answer(client, user, false)
    await saved(client, user, wallet)
    await answer(client, user, true)
    await saved(client, user, wallet, { 'x-gogospend-analytics': 'off' })
    await saved(client, user, wallet, { 'x-gogospend-analytics': 'OFF' })
    await r.settled()
    expect(r.sent).toEqual([])
    // The same person, once a request is not marked off: one record_saved.
    await saved(client, user, wallet)
    await r.settled()
    expect(r.sent.map((message) => message.event)).toEqual(['record_saved'])
  })

  it('an edit, a delete or an import is not a record_saved', async () => {
    const r = recording()
    const client = await frontDoor(r)
    const { user, wallet } = await ledger(client)
    await answer(client, user, true)
    const body = lunch(user, wallet)
    expect((await record(client, user, body)).status).toBe(201)
    await r.settled()
    expect(r.sent.map((message) => message.event)).toEqual(['record_saved'])
    const path = `/v1/transactions/${String(body.id)}`
    expect((await client.as(user).patch(path, { amount_minor: '7000' }, { ifMatch: 1 })).status).toBe(200)
    expect((await client.as(user).del(path, { ifMatch: 2 })).status).toBe(200)
    expect((await client.as(user).post(`${path}/restore`, {}, { ifMatch: 3 })).status).toBe(200)
    const records = await countRows(user, 'transactions')
    await importThree(client, user, wallet)
    expect(await countRows(user, 'transactions')).toBe(records + 3)
    await r.settled()
    expect(r.sent.map((message) => message.event)).toEqual(['record_saved'])
  })

  it('a stale cursor sends resync_required', async () => {
    const r = recording()
    const client = await frontDoor(r)
    const { user } = await ledger(client)
    await answer(client, user, true)
    await sqlExec(user, 'UPDATE sync_state SET pruned_through = revision WHERE id = 1')
    const stale = await json(await client.as(user).get(`/v1/sync/changes?cursor=${encodeURIComponent(encodeSyncCursor(user.sub, '0'))}`))
    expect(stale).toMatchObject({ status: 410, body: { code: 'RESYNC_REQUIRED' } })
    await r.settled()
    expect(r.sent).toEqual([{ distinctId: await hmacOf(user.sub), event: 'resync_required', properties: { reason_code: 'RESYNC_REQUIRED', origin: 'server' } }])
  })

  it("a vault failure on the outbox's routes sends sync_failed, beside its anonymous count", async () => {
    const r = recording()
    const client = await frontDoor(r)
    const { user, wallet } = await ledger(client)
    await answer(client, user, true)
    const create = vi.spyOn(VAULT_HANDLERS, 'transactions.create').mockImplementation(() => {
      throw new TypeError('the write failed')
    })
    const changes = vi.spyOn(VAULT_HANDLERS, 'sync.changes').mockImplementation(() => {
      throw new SyntaxError('the read failed')
    })
    try {
      await quietly(async () => {
        expect(await json(await record(client, user, lunch(user, wallet)))).toMatchObject({ status: 500, body: { code: 'INTERNAL_ERROR' } })
        expect(await json(await client.as(user).get('/v1/sync/changes'))).toMatchObject({ status: 500, body: { code: 'INTERNAL_ERROR' } })
      })
    } finally {
      create.mockRestore()
      changes.mockRestore()
    }
    await r.settled()
    const id = await hmacOf(user.sub)
    expect(r.sent.filter((message) => message.event === 'sync_failed')).toEqual([
      { distinctId: id, event: 'sync_failed', properties: { reason_code: 'INTERNAL_ERROR', origin: 'server' } },
      { distinctId: id, event: 'sync_failed', properties: { reason_code: 'INTERNAL_ERROR', origin: 'server' } },
    ])
    const counts = r.sent.filter((message) => message.event === '$exception')
    expect(counts.map((message) => [message.properties.route, (message.properties.$exception_list as { type: string }[])[0].type])).toEqual([
      ['transactions.create', 'TypeError'],
      ['sync.changes', 'SyntaxError'],
    ])
    expect(counts.every((message) => message.distinctId !== id && UUID.test(message.distinctId))).toBe(true)
    expect(r.sent).toHaveLength(4)
  })

  it('a deliberate refusal is never an error count', async () => {
    const r = recording()
    const open = await frontDoor(r)
    const { user } = await ledger(open)
    await answer(open, user, true)
    const wallet = { id: randomUUID(), name: 'Cash', opening_minor: '0', tracking_start: '2026-10-01' }
    const signed = await signedHeaders(user)
    const refusals = await quietly(async () => {
      // No token, an outdated app, a policy not accepted, and a malformed body.
      expect((await open.raw(new Request(`${BASE}/v1/wallets`, { headers: { 'x-gogospend-client': 'ios/1.0.0' } }))).status).toBe(401)
      expect((await open.as(user, { client: 'ios/0.9.0' }).get('/v1/wallets')).status).toBe(426)
      expect((await open.as(newUser()).post('/v1/wallets', wallet)).status).toBe(403)
      const malformed = new Request(`${BASE}/v1/wallets`, { method: 'POST', headers: { ...signed, 'content-type': 'application/json', 'idempotency-key': randomUUID() }, body: '{' })
      expect((await open.raw(malformed)).status).toBe(400)
      // A paused gate, before the token. Each front door writes config:v1 again, so they take turns.
      const paused = await frontDoor(r, { ...CONFIG, gates: { paused: ['writes'], retry_after_seconds: 60 } })
      expect(await json(await paused.as(user).post('/v1/wallets', wallet))).toMatchObject({ status: 503, body: { code: 'WRITES_PAUSED' } })
      // Policies not yet published: the vault's own 503.
      const unpublished = await frontDoor(r, { client_versions: { ios: '1.0.0', android: '1.0.0' } })
      expect(await json(await unpublished.as(user).post('/v1/wallets', wallet))).toMatchObject({ status: 503, body: { code: 'SERVICE_UNAVAILABLE' } })
    })
    expect(refusals.filter((line) => line.includes('_failed'))).toEqual([])
    await r.settled()
    expect(r.sent).toEqual([])
    // A real failure, with the policies published again, is counted once.
    const again = await frontDoor(r)
    const list = vi.spyOn(VAULT_HANDLERS, 'wallets.list').mockImplementation(() => {
      throw new RangeError('the read failed')
    })
    try {
      await quietly(async () => {
        expect((await again.as(user).get('/v1/wallets')).status).toBe(500)
      })
    } finally {
      list.mockRestore()
    }
    await r.settled()
    expect(r.sent.map((message) => message.event)).toEqual(['$exception'])
  })

  it('an unexpected failure sends its class name only, without the person', async () => {
    const r = recording()
    const client = await frontDoor(r)
    const { user } = await ledger(client)
    await answer(client, user, true)
    const list = vi.spyOn(VAULT_HANDLERS, 'wallets.list').mockImplementation(() => {
      throw new RangeError('ร้านป้าแดง ฿1,234')
    })
    let logged: string[] = []
    try {
      logged = await quietly(async () => {
        expect(await json(await client.as(user).get('/v1/wallets'))).toMatchObject({ status: 500, body: { code: 'INTERNAL_ERROR' } })
      })
    } finally {
      list.mockRestore()
    }
    await r.settled()
    expect(r.sent).toHaveLength(1)
    const [count] = r.sent
    expect(count).toMatchObject({
      event: '$exception',
      properties: { $exception_list: [{ type: 'RangeError', value: 'RangeError' }], route: 'wallets.list', origin: 'server', $process_person_profile: false },
    })
    expect(count.distinctId).not.toBe(await hmacOf(user.sub))
    expect(count.distinctId).toMatch(UUID)
    const text = JSON.stringify(r.sent) + logged.join('\n')
    expect(text).not.toContain('ร้านป้าแดง')
    expect(text).not.toContain('1,234')
  })

  it("an unexpected exception in the Worker is counted as the Worker's, by its class name only", async () => {
    const r = recording()
    const client = await frontDoor(r)
    const catalogue = vi.spyOn(WORKER_HANDLERS, 'bridge.catalogue').mockImplementation(async () => {
      throw new RangeError('ร้านป้าแดง ฿1,234')
    })
    try {
      await quietly(async () => {
        expect(await json(await client.raw(new Request(`${BASE}/v1/bridge/gogocash/catalogue`)))).toMatchObject({ status: 500, body: { code: 'INTERNAL_ERROR' } })
      })
    } finally {
      catalogue.mockRestore()
    }
    await r.settled()
    expect(r.sent).toHaveLength(1)
    expect(r.sent[0]).toMatchObject({ event: '$exception', properties: { $exception_list: [{ type: 'RangeError', value: 'RangeError' }], route: 'worker', $process_person_profile: false } })
    expect(JSON.stringify(r.sent)).not.toContain('ร้านป้าแดง')
  })

  it("a vault that holds another account reads no consent: the failure is counted, and nothing is sent under the person", async () => {
    const r = recording()
    const client = await frontDoor(r)
    const { user, wallet } = await ledger(client)
    await answer(client, user, true)
    await sqlExec(user, 'UPDATE account_state SET account_id = ? WHERE id = 1', randomUUID())
    await quietly(async () => {
      expect(await json(await record(client, user, lunch(user, wallet)))).toMatchObject({ status: 500, body: { code: 'INTERNAL_ERROR' } })
    })
    await r.settled()
    expect(r.sent.map((message) => [message.event, message.properties.route, (message.properties.$exception_list as { type: string }[] | undefined)?.[0].type])).toEqual([
      ['$exception', 'transactions.create', 'VaultOwnerMismatch'],
    ])
  })

  it('the reply sent to the phone never carries analytics fields', async () => {
    const r = recording()
    const client = await frontDoor(r)
    const { user, wallet } = await ledger(client)
    await answer(client, user, true)
    const replies: Reply[] = [await json(await record(client, user, lunch(user, wallet))), await json(await client.as(user).get('/v1/wallets'))]
    const list = vi.spyOn(VAULT_HANDLERS, 'wallets.list').mockImplementation(() => {
      throw new RangeError('the read failed')
    })
    try {
      await quietly(async () => {
        replies.push(await json(await client.as(user).get('/v1/wallets')))
      })
    } finally {
      list.mockRestore()
    }
    replies.push(await json(await client.raw(new Request(`${BASE}/v1/wallets`, { headers: { 'x-gogospend-client': 'ios/1.0.0' } }))))
    const analytics = await json(await client.as(user).get('/v1/me/analytics'))
    expect(replies.map((reply) => reply.status)).toEqual([201, 200, 500, 401])
    for (const reply of [...replies, analytics]) {
      for (const body of Array.isArray(reply.body) ? reply.body : [reply.body]) {
        for (const key of ['analytics', 'events', 'failure']) expect(Object.keys(body as Body), `${reply.status}: ${key}`).not.toContain(key)
      }
    }
    expect(Object.keys(analytics.body)).toEqual(['analytics_id', 'weeks_since_signup', 'consent'])
  })
})

describe('the vault half', () => {
  it('a failed analytics read never changes the reply, and is logged by its class name only', async () => {
    const client = await frontDoor(recording())
    const { user } = await ledger(client)
    await sqlExec(user, 'DROP TABLE consents')
    const lines = await quietly(async () => {
      expect((await client.as(user).get('/v1/wallets')).status).toBe(200)
    })
    expect(lines.filter((line) => line.includes('"event":"vault_analytics_failed"'))).toEqual(['{"level":"error","event":"vault_analytics_failed","failure":"Error"}'])
    expect(lines.join('\n')).not.toContain('consents')
  })

  it("callWithAnalytics answers call()'s reply, with the consent read after the block and no failure for a refusal", async () => {
    const client = await frontDoor(recording())
    const user = newUser()
    await answer(client, user, true)
    const refused: VaultCall = {
      route: 'me.privacy',
      access: 'bound_session',
      charge: 'write',
      claims: { accountId: user.sub, sessionId: user.sid, issuedAt: Math.floor(Date.now() / 1000), clientId: 'ios/1.0.0' },
      policies: TEST_POLICIES,
      params: {},
      query: {},
      headers: {},
      body: { analytics: 'maybe' },
    }
    const answered = await vaultOf(user).callWithAnalytics(refused)
    expect(answered).toEqual({
      reply: { ok: false, status: 422, code: 'VALIDATION_FAILED', problem: { fields: { analytics: 'VALIDATION_FAILED' } } },
      analytics: { consent: 'yes', events: [], failure: null },
    })
    expect(await vaultOf(user).call(refused)).toEqual(answered.reply)
  })

  it('the change log counts a create once, by its first version, inside the revision range only', async () => {
    const client = await frontDoor(recording())
    const { user, wallet } = await ledger(client)
    const first = lunch(user, wallet)
    expect((await record(client, user, first)).status).toBe(201)
    const afterFirst = await revisionOf(user)
    expect((await record(client, user, lunch(user, wallet))).status).toBe(201)
    expect((await client.as(user).patch(`/v1/transactions/${String(first.id)}`, { amount_minor: '7000' }, { ifMatch: 1 })).status).toBe(200)
    const afterEdit = await revisionOf(user)
    const events = (route: VaultRouteId, before: string, after: string) => inVault(user, (c) => committedEvents(c, route, before, after))
    const food = { name: 'record_saved', properties: { kind: 'expense', category_key: 'food' } }
    // From 0: the categories' and the wallet's changes are not records, and the second record is past the range.
    await expect(events('transactions.create', '0', afterFirst)).resolves.toEqual([food])
    // After the first record: the second record only, not the edit's second version.
    await expect(events('transactions.create', afterFirst, afterEdit)).resolves.toEqual([food])
    // Any other route reads nothing (Q16).
    await expect(events('transactions.update', '0', afterEdit)).resolves.toEqual([])
    // A first version that is not active (a purged change has no snapshot) is never read. The change log takes rows at the current revision only.
    await sqlExec(user, 'UPDATE sync_state SET revision = revision + 1 WHERE id = 1')
    await sqlExec(
      user,
      "INSERT INTO entity_changes (revision, ordinal, command_id, entity, entity_id, version, state, snapshot, committed_at) VALUES ((SELECT revision FROM sync_state WHERE id = 1), 0, ?, 'transaction', ?, 1, 'purged', NULL, ?)",
      randomUUID(),
      randomUUID(),
      new Date().toISOString(),
    )
    const purgedAt = await revisionOf(user)
    await expect(events('transactions.create', afterEdit, purgedAt)).resolves.toEqual([])
  })
})
