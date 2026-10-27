import { createHmac } from 'node:crypto'

import { afterEach, expect, it, vi } from 'vitest'

import {
  AnalyticsDeletionFailed,
  POSTHOG_EU_HOST,
  analyticsIdFor,
  createServerAnalytics,
  deletePostHogPerson,
  type CaptureMessage,
  type PostHogPort,
  type ServerAnalytics,
  type ServerAnalyticsEnv,
  type ServerEventName,
} from '../src/analytics/server-analytics'

const ID = 'a'.repeat(64)
const KEY = 'synthetic-analytics-key-0123456789abcdef'
const USER = 'user-7f3a'
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const DELETION_ENV: ServerAnalyticsEnv = { ANALYTICS_ID_KEY: KEY, POSTHOG_PERSONAL_API_KEY: 'phx_test', POSTHOG_PROJECT_ID: '12345' }

afterEach(() => {
  vi.unstubAllGlobals()
})

function hmacOf(userId: string, key = KEY): string {
  return createHmac('sha256', key).update(userId, 'utf8').digest('hex')
}

function must<T>(value: T | null): T {
  if (value === null) throw new Error('expected a PostHog client')
  return value
}

// A port that records each message it is given, and the promise it returned for it.
function harness(env: ServerAnalyticsEnv = { POSTHOG_PROJECT_TOKEN: 'phc_test' }) {
  const sent: CaptureMessage[] = []
  const returned: Promise<unknown>[] = []
  const waits: Promise<unknown>[] = []
  const port: PostHogPort = {
    captureImmediate(message) {
      sent.push(message)
      const done = Promise.resolve()
      returned.push(done)
      return done
    },
  }
  const analytics: ServerAnalytics = must(createServerAnalytics(env, (promise) => { waits.push(promise) }, () => port))
  return { analytics, sent, returned, waits }
}

// A fetch that records each request (with its headers and parsed body) and answers with respond().
function fakeFetch(respond: () => Response) {
  const calls: { url: string; method: string | undefined; headers: Headers; body: unknown }[] = []
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method,
      headers: new Headers(init?.headers),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    })
    return respond()
  }) as typeof fetch
  return { calls, fetchImpl }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

it('the analytics id is the HMAC of the user id under the key, never the id', async () => {
  const userIds = ['user-1', 'ผู้ใช้-42', 'a'.repeat(40)]
  const keys = [KEY, 'synthetic-analytics-key-B-0123456789abcdef']
  for (const userId of userIds) {
    const ids: string[] = []
    for (const key of keys) {
      const id = await analyticsIdFor(userId, key)
      expect(id).toBe(createHmac('sha256', key).update(userId, 'utf8').digest('hex'))
      expect(id).toMatch(/^[0-9a-f]{64}$/)
      expect(id).not.toContain(userId)
      ids.push(id)
    }
    expect(ids[0]).not.toBe(ids[1])
  }
})

it('a server event carries only its allow-listed properties and origin', () => {
  const h = harness()
  h.analytics.capture(ID, { name: 'record_saved', properties: { kind: 'expense', category_key: 'food', amount_minor: '4500', merchant: 'ร้านป้าแดง' } })
  expect(h.sent).toEqual([{ distinctId: ID, event: 'record_saved', properties: { kind: 'expense', category_key: 'food', origin: 'server' } }])
  expect(h.waits).toHaveLength(1)
  expect(h.waits[0]).toBe(h.returned[0])
})

it('an unknown server event is dropped', () => {
  const h = harness()
  h.analytics.capture(ID, { name: 'wallet_added' as unknown as ServerEventName, properties: { kind: 'expense' } })
  expect(h.sent).toEqual([])
  h.analytics.capture(ID, { name: 'sync_failed', properties: { reason_code: 'INTERNAL_ERROR' } })
  expect(h.sent).toEqual([{ distinctId: ID, event: 'sync_failed', properties: { reason_code: 'INTERNAL_ERROR', origin: 'server' } }])
})

it('a server event keeps only the values it allows: an unknown kind is dropped, a category outside the built-in keys is custom', () => {
  const h = harness()
  h.analytics.capture(ID, { name: 'record_saved', properties: { kind: 'loan', category_key: 'ค่าเช่าห้อง' } })
  h.analytics.capture(ID, { name: 'record_saved', properties: { kind: 'transfer', category_key: 'custom' } })
  h.analytics.capture(ID, { name: 'resync_required', properties: { reason_code: 'version conflict' } })
  expect(h.sent.map((message) => message.properties)).toEqual([
    { category_key: 'custom', origin: 'server' },
    { kind: 'transfer', category_key: 'custom', origin: 'server' },
    { origin: 'server' },
  ])
})

it('an identity that is not an analytics id is never sent as a distinct id', () => {
  const h = harness()
  h.analytics.capture('someone@example.com', { name: 'sync_failed', properties: { reason_code: 'INTERNAL_ERROR' } })
  h.analytics.capture('A'.repeat(64), { name: 'sync_failed', properties: { reason_code: 'INTERNAL_ERROR' } })
  expect(h.sent).toEqual([])
  h.analytics.capture(ID, { name: 'sync_failed', properties: { reason_code: 'INTERNAL_ERROR' } })
  expect(h.sent.map((message) => message.distinctId)).toEqual([ID])
})

it('a failure is an anonymous class-name count', () => {
  const h = harness()
  h.analytics.captureFailure('RangeError', 'wallets.list')
  h.analytics.captureFailure('RangeError', 'wallets.list')
  h.analytics.captureFailure('ร้าน ฿1,234', 'x y')
  expect(h.sent).toHaveLength(3)
  const [first, second, third] = h.sent
  expect(first).toEqual({
    distinctId: expect.stringMatching(UUID_V4),
    event: '$exception',
    properties: {
      $exception_list: [{ type: 'RangeError', value: 'RangeError', mechanism: { handled: true, synthetic: true } }],
      $exception_fingerprint: 'RangeError:wallets.list',
      route: 'wallets.list',
      origin: 'server',
      $process_person_profile: false,
    },
  })
  expect(second.distinctId).toMatch(UUID_V4)
  expect(second.distinctId).not.toBe(first.distinctId)
  expect(third).toEqual({
    distinctId: expect.stringMatching(UUID_V4),
    event: '$exception',
    properties: {
      $exception_list: [{ type: 'Error', value: 'Error', mechanism: { handled: true, synthetic: true } }],
      $exception_fingerprint: 'Error:worker',
      route: 'worker',
      origin: 'server',
      $process_person_profile: false,
    },
  })
})

it('a deletion count can never recreate the person', () => {
  const h = harness()
  h.analytics.capture(ID, { name: 'resync_required', properties: { reason_code: 'INVALID_CURSOR' } })
  h.analytics.captureAnonymous('account_deleted')
  expect(h.sent).toHaveLength(2)
  expect(h.sent[1]).toEqual({
    distinctId: expect.stringMatching(UUID_V4),
    event: 'account_deleted',
    properties: { origin: 'server', $process_person_profile: false },
  })
  expect(h.sent[1].distinctId).not.toBe(ID)
})

it('without a project token there is no client', () => {
  expect(createServerAnalytics({}, () => {})).toBeNull()
  expect(createServerAnalytics({ ANALYTICS_ID_KEY: KEY }, () => {})).toBeNull()
  expect(createServerAnalytics({ POSTHOG_PROJECT_TOKEN: '' }, () => {})).toBeNull()
})

it('the real client sends to PostHog EU', async () => {
  const requests: string[] = []
  vi.stubGlobal('fetch', async (url: string | URL | Request) => {
    requests.push(String(url))
    return new Response('{"status":1}', { status: 200 })
  })
  const waits: Promise<unknown>[] = []
  const analytics = must(createServerAnalytics({ POSTHOG_PROJECT_TOKEN: 'phc_test' }, (promise) => { waits.push(promise) }))
  analytics.capture(ID, { name: 'sync_failed', properties: { reason_code: 'INTERNAL_ERROR' } })
  await Promise.all(waits)
  expect(requests).toHaveLength(1)
  expect(requests[0].startsWith(`${POSTHOG_EU_HOST}/`)).toBe(true)
})

it('person deletion asks PostHog to delete the person, its events and its recordings', async () => {
  const { calls, fetchImpl } = fakeFetch(() => json(202, { deletion_errors: [] }))
  await expect(deletePostHogPerson(DELETION_ENV, USER, fetchImpl)).resolves.toBe('queued')
  expect(calls).toHaveLength(1)
  expect(calls[0].url).toBe('https://eu.posthog.com/api/projects/12345/persons/bulk_delete')
  expect(calls[0].method).toBe('POST')
  expect(calls[0].headers.get('authorization')).toBe('Bearer phx_test')
  expect(calls[0].headers.get('content-type')).toBe('application/json')
  expect(calls[0].body).toEqual({ distinct_ids: [hmacOf(USER)], delete_events: true, delete_recordings: true })
})

it('a deletion PostHog refuses, or cannot reach, throws AnalyticsDeletionFailed', async () => {
  const refusals: Array<typeof fetch> = [
    fakeFetch(() => json(202, { deletion_errors: [{ error: 'unknown distinct id' }] })).fetchImpl,
    fakeFetch(() => json(202, {})).fetchImpl,
    fakeFetch(() => json(500, { detail: 'internal' })).fetchImpl,
    (async () => { throw new TypeError('fetch failed') }) as typeof fetch,
  ]
  for (const fetchImpl of refusals) {
    await expect(deletePostHogPerson(DELETION_ENV, USER, fetchImpl)).rejects.toBeInstanceOf(AnalyticsDeletionFailed)
  }
})

it('without ANALYTICS_ID_KEY there is nothing to delete, and no request is made', async () => {
  const { calls, fetchImpl } = fakeFetch(() => json(202, { deletion_errors: [] }))
  await expect(deletePostHogPerson({ POSTHOG_PROJECT_TOKEN: 'phc_test', POSTHOG_PERSONAL_API_KEY: 'phx_test', POSTHOG_PROJECT_ID: '12345' }, USER, fetchImpl))
    .resolves.toBe('nothing_to_delete')
  expect(calls).toHaveLength(0)
})

it('with the key but no personal key or project id, deletion fails and no request is made', async () => {
  const { calls, fetchImpl } = fakeFetch(() => json(202, { deletion_errors: [] }))
  await expect(deletePostHogPerson({ ANALYTICS_ID_KEY: KEY, POSTHOG_PROJECT_ID: '12345' }, USER, fetchImpl)).rejects.toBeInstanceOf(AnalyticsDeletionFailed)
  await expect(deletePostHogPerson({ ANALYTICS_ID_KEY: KEY, POSTHOG_PERSONAL_API_KEY: 'phx_test' }, USER, fetchImpl)).rejects.toBeInstanceOf(AnalyticsDeletionFailed)
  expect(calls).toHaveLength(0)
})

it('deletion depends on the analytics key, not on the project token', async () => {
  const { calls, fetchImpl } = fakeFetch(() => json(202, { deletion_errors: [] }))
  await expect(deletePostHogPerson(DELETION_ENV, USER, fetchImpl)).resolves.toBe('queued')
  expect(calls).toHaveLength(1)
})
