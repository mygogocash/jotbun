// Differential parity: the same scripted session against the real NestJS v1
// server (apps/api/dist, started as a child process) and the edge
// dispatcher, on one disposable database. Each run uses its own account;
// responses are compared after replacing per-account values (account and
// derived ids, request ids, cursors, timestamps) with stable placeholders.
// Needs `npm run build -w gogospend-api` first.
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { BASE, startEdge } from './support/edge-harness'
import type { Edge, SignedUp } from './support/edge-harness'
import { startNest } from './support/nest-server'
import type { NestServer, Send } from './support/nest-server'
import { normalizer } from './support/parity'

let edge: Edge
let nest: NestServer | undefined

beforeAll(async () => {
  edge = await startEdge()
  nest = await startNest(edge)
}, 60_000)

afterAll(async () => {
  nest?.stop()
  await edge?.close()
})

type Step = { name: string; build(user: SignedUp, token: string): Request }
type Seen = { status: number; headers: Record<string, string | null>; body: unknown }

const SHARED = {
  cash: randomUUID(),
  bank: randomUUID(),
  pets: randomUUID(),
  lunch: randomUUID(),
  salary: randomUUID(),
  move: randomUUID(),
  replayKey: randomUUID(),
  lunchKey: randomUUID(),
  unknownKey: randomUUID(),
}
const shared = new Set<string>(Object.values(SHARED))

const auth = (user: SignedUp, token: string): Record<string, string> => ({
  'x-gogospend-client': 'ios/1.0.0',
  authorization: `Bearer ${token}`,
  'x-gogospend-session': user.binding,
})
const command = (key = randomUUID(), ifMatch?: number): Record<string, string> => ({
  'idempotency-key': key,
  'x-gogospend-command-schema': '1',
  ...(ifMatch ? { 'if-match': `"${ifMatch}"` } : {}),
})
const req = (method: string, path: string, headers: Record<string, string>, body?: unknown, raw?: string) =>
  new Request(`${BASE}${path}`, {
    method,
    headers: body === undefined && raw === undefined ? headers : { ...headers, 'content-type': 'application/json' },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  })

/** The category id for a built-in key differs per account, so steps look it up by position in the run. */
const FOOD = '<food>'
const SALARY = '<salary-category>'

const STEPS: Step[] = [
  { name: 'published policies', build: () => req('GET', '/v1/policies', {}) },
  { name: 'me with pending terms', build: (u, t) => req('GET', '/v1/me', auth(u, t)) },
  { name: 'write before terms', build: (u, t) => req('POST', '/v1/wallets', { ...auth(u, t), ...command() }, { id: SHARED.cash, name: 'Cash', opening_minor: '100000', tracking_start: '2026-10-01' }) },
  { name: 'accept terms', build: (u, t) => req('POST', '/v1/me/policy-acceptances', auth(u, t), { kind: 'terms', version: 1 }) },
  { name: 'seed built-ins', build: (u, t) => req('POST', '/v1/categories/builtins', auth(u, t)) },
  { name: 'create cash wallet', build: (u, t) => req('POST', '/v1/wallets', { ...auth(u, t), ...command(SHARED.replayKey) }, { id: SHARED.cash, name: ' Cash ', opening_minor: '100000', tracking_start: '2026-10-01' }) },
  { name: 'replay cash wallet', build: (u, t) => req('POST', '/v1/wallets', { ...auth(u, t), ...command(SHARED.replayKey) }, { id: SHARED.cash, name: ' Cash ', opening_minor: '100000', tracking_start: '2026-10-01' }) },
  { name: 'same key, other content', build: (u, t) => req('POST', '/v1/wallets', { ...auth(u, t), ...command(SHARED.replayKey) }, { id: SHARED.cash, name: 'Other', opening_minor: '100000', tracking_start: '2026-10-01' }) },
  { name: 'invalid opening balance', build: (u, t) => req('POST', '/v1/wallets', { ...auth(u, t), ...command() }, { id: randomUUID(), name: 'Bad', opening_minor: '1.50', tracking_start: '2026-10-01' }) },
  { name: 'future tracking start', build: (u, t) => req('POST', '/v1/wallets', { ...auth(u, t), ...command() }, { id: randomUUID(), name: 'Bad', opening_minor: '0', tracking_start: '2099-01-01' }) },
  { name: 'unknown field', build: (u, t) => req('POST', '/v1/wallets', { ...auth(u, t), ...command() }, { id: randomUUID(), name: 'Bad', opening_minor: '0', tracking_start: '2026-10-01', colour: 'red' }) },
  { name: 'missing idempotency key', build: (u, t) => req('POST', '/v1/wallets', { ...auth(u, t), 'x-gogospend-command-schema': '1' }, { id: randomUUID(), name: 'Bad', opening_minor: '0', tracking_start: '2026-10-01' }) },
  { name: 'malformed JSON', build: (u, t) => req('POST', '/v1/wallets', { ...auth(u, t), ...command() }, undefined, '{"id":') },
  { name: 'create bank wallet', build: (u, t) => req('POST', '/v1/wallets', { ...auth(u, t), ...command() }, { id: SHARED.bank, name: 'K PLUS', opening_minor: '2500000', tracking_start: '2026-10-01' }) },
  { name: 'rename bank', build: (u, t) => req('PATCH', `/v1/wallets/${SHARED.bank}`, { ...auth(u, t), ...command(undefined, 1) }, { name: 'SCB' }) },
  { name: 'stale rename', build: (u, t) => req('PATCH', `/v1/wallets/${SHARED.bank}`, { ...auth(u, t), ...command(undefined, 1) }, { name: 'KTB' }) },
  { name: 'missing If-Match', build: (u, t) => req('PATCH', `/v1/wallets/${SHARED.bank}`, { ...auth(u, t), ...command() }, { name: 'KTB' }) },
  { name: 'archive bank', build: (u, t) => req('POST', `/v1/wallets/${SHARED.bank}/archive`, { ...auth(u, t), ...command(undefined, 2) }, {}) },
  { name: 'unarchive bank', build: (u, t) => req('POST', `/v1/wallets/${SHARED.bank}/unarchive`, { ...auth(u, t), ...command(undefined, 3) }, {}) },
  { name: 'wallet by bad id', build: (u, t) => req('GET', '/v1/wallets/not-a-uuid', auth(u, t)) },
  { name: 'wallets', build: (u, t) => req('GET', '/v1/wallets', auth(u, t)) },
  { name: 'custom category', build: (u, t) => req('POST', '/v1/categories', { ...auth(u, t), ...command() }, { id: SHARED.pets, type: 'expense', label: 'ทำบุญ', color: '#9CD4F5' }) },
  { name: 'categories', build: (u, t) => req('GET', '/v1/categories', auth(u, t)) },
  { name: 'lunch', build: (u, t) => req('POST', '/v1/transactions', { ...auth(u, t), ...command(SHARED.lunchKey) }, { id: SHARED.lunch, type: 'expense', amount_minor: '6000', occurred_on: '2026-10-20', wallet_id: SHARED.cash, category_id: FOOD, merchant: 'ข้าวมันไก่', note: 'with soup' }) },
  { name: 'salary', build: (u, t) => req('POST', '/v1/transactions', { ...auth(u, t), ...command() }, { id: SHARED.salary, type: 'income', amount_minor: '3000000', occurred_on: '2026-10-25', wallet_id: SHARED.bank, category_id: SALARY }) },
  { name: 'move to cash', build: (u, t) => req('POST', '/v1/transactions', { ...auth(u, t), ...command() }, { id: SHARED.move, type: 'transfer', amount_minor: '200000', occurred_on: '2026-10-26', source_wallet_id: SHARED.bank, destination_wallet_id: SHARED.cash }) },
  { name: 'transfer to itself', build: (u, t) => req('POST', '/v1/transactions', { ...auth(u, t), ...command() }, { id: randomUUID(), type: 'transfer', amount_minor: '1', occurred_on: '2026-10-26', source_wallet_id: SHARED.bank, destination_wallet_id: SHARED.bank }) },
  { name: 'edit lunch', build: (u, t) => req('PATCH', `/v1/transactions/${SHARED.lunch}`, { ...auth(u, t), ...command(undefined, 1) }, { amount_minor: '6500' }) },
  { name: 'lunch', build: (u, t) => req('GET', `/v1/transactions/${SHARED.lunch}`, auth(u, t)) },
  { name: 'history', build: (u, t) => req('GET', '/v1/history?from=2026-10-01&through=2026-10-31', auth(u, t)) },
  { name: 'history, one per page', build: (u, t) => req('GET', '/v1/history?from=2026-10-01&through=2026-10-31&limit=1', auth(u, t)) },
  { name: 'history, bad date', build: (u, t) => req('GET', '/v1/history?from=2026-13-01&through=2026-10-31', auth(u, t)) },
  { name: 'history, repeated filter', build: (u, t) => req('GET', '/v1/history?from=2026-10-01&from=2026-10-02&through=2026-10-31', auth(u, t)) },
  { name: 'summary', build: (u, t) => req('GET', '/v1/summary?month=2026-10', auth(u, t)) },
  { name: 'summary, bad month', build: (u, t) => req('GET', '/v1/summary?month=2026-1', auth(u, t)) },
  { name: 'set budget', build: (u, t) => req('PUT', '/v1/budgets/2026-10', { ...auth(u, t), ...command() }, { overall_limit_minor: '1800000', category_limits: [{ category_id: FOOD, limit_minor: '600000' }] }) },
  { name: 'budget', build: (u, t) => req('GET', '/v1/budgets/2026-10', auth(u, t)) },
  { name: 'summary with budget', build: (u, t) => req('GET', '/v1/summary?month=2026-10', auth(u, t)) },
  { name: 'delete lunch', build: (u, t) => req('DELETE', `/v1/transactions/${SHARED.lunch}`, { ...auth(u, t), ...command(undefined, 2) }) },
  { name: 'recently deleted', build: (u, t) => req('GET', '/v1/history/deleted', auth(u, t)) },
  { name: 'edit deleted lunch', build: (u, t) => req('PATCH', `/v1/transactions/${SHARED.lunch}`, { ...auth(u, t), ...command(undefined, 3) }, { amount_minor: '7000' }) },
  { name: 'restore lunch', build: (u, t) => req('POST', `/v1/transactions/${SHARED.lunch}/restore`, { ...auth(u, t), ...command(undefined, 3) }, {}) },
  { name: 'command status', build: (u, t) => req('POST', '/v1/commands/status', auth(u, t), { command_ids: [SHARED.lunchKey, SHARED.unknownKey] }) },
  { name: 'sync, two groups', build: (u, t) => req('GET', '/v1/sync/changes?limit=2', auth(u, t)) },
  { name: 'sync, everything', build: (u, t) => req('GET', '/v1/sync/changes', auth(u, t)) },
  { name: 'privacy preferences', build: (u, t) => req('PUT', '/v1/me/privacy-preferences', auth(u, t), { analytics: true }) },
  { name: 'me', build: (u, t) => req('GET', '/v1/me', auth(u, t)) },
  { name: 'sign out', build: (u, t) => req('POST', '/v1/me/logout', auth(u, t)) },
  { name: 'after sign out', build: (u, t) => req('GET', '/v1/wallets', auth(u, t)) },
]

async function runSession(send: Send, user: SignedUp, issuerToken: () => Promise<string>): Promise<Seen[]> {
  const out: Seen[] = []
  let food = ''
  let salary = ''
  for (const step of STEPS) {
    const built = step.build(user, await issuerToken())
    let request = built
    if (food || salary) {
      const text = built.method === 'GET' || built.method === 'HEAD' ? null : await built.clone().text()
      if (text) request = new Request(built, { body: text.replaceAll(FOOD, food).replaceAll(SALARY, salary) })
    }
    const res = await send(request)
    const raw = await res.text()
    const body = raw ? JSON.parse(raw) : null
    if (step.name === 'seed built-ins' && Array.isArray(body)) {
      food = body.find((c: { builtin_key: string }) => c.builtin_key === 'food')?.id ?? ''
      salary = body.find((c: { builtin_key: string }) => c.builtin_key === 'salary')?.id ?? ''
    }
    out.push({
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type'),
        'cache-control': res.headers.get('cache-control'),
        'retry-after': res.headers.get('retry-after'),
      },
      body,
    })
  }
  return out
}

describe('the edge answers exactly like the NestJS v1 API', () => {
  it('runs one scripted session on each and compares every response', async () => {
    const nestUser = await edge.fx.signUp()
    const edgeUser = await edge.fx.signUp()
    const nestRun = await runSession(nest!.send, nestUser, () => edge.issuer.accessToken({ sub: nestUser.who.subject }))
    const edgeRun = await runSession(edge.call, edgeUser, () => edge.issuer.accessToken({ sub: edgeUser.who.subject }))

    const nestNorm = normalizer(shared)
    const edgeNorm = normalizer(shared)
    const differences = STEPS.flatMap((step, i) => {
      const a = { ...nestRun[i], body: nestNorm(nestRun[i].body) }
      const b = { ...edgeRun[i], body: edgeNorm(edgeRun[i].body) }
      return JSON.stringify(a) === JSON.stringify(b) ? [] : [{ step: `${i + 1}. ${step.name}`, nest: a, edge: b }]
    })
    expect(differences).toEqual([])
    // The script must exercise real outcomes, not a wall of identical errors.
    const statuses = new Set(nestRun.map((r) => r.status))
    for (const status of [200, 201, 204, 400, 401, 403, 404, 409, 422]) expect(statuses).toContain(status)
  })
})
