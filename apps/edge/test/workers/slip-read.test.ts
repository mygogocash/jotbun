// P3-T8: reading one slip with D25's escalation (H6, A14, A16, B9). Haiku 5.5
// reads the slip first; Opus 5.5 reads the same image again, in the same
// request, only when D25's triggers say so (slipNeedsOpus); an outage never
// escalates (H7). The route counts one use before the first call, gives it back
// when no model read the slip and the last call failed with an outage (H5), and
// writes nothing else (B9). The front-door cases script the models' replies (no
// network); the last cases run slipNeedsOpus, readSlipImage and the cap alone.
// P3-T9 carries the P3-T8 reviews' pins: a model date that is no calendar date,
// an Opus outage after any unusable Haiku answer, an Opus answer with no draft,
// the media type, the archived choices, a bare answer, and the read's tokens.
import { randomUUID } from 'node:crypto'

import Anthropic from '@anthropic-ai/sdk'
import { AI_DAILY_LIMITS, bangkokDate } from '@gogospend/contracts'
import type { AiDraft, AiFeature, SlipKind } from '@gogospend/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MessageParams, ModelMessage } from '../../src/server/ai/model'
import { SLIP_SCHEMA } from '../../src/server/ai/prompts'
import { HAIKU_SLIP_CAP_MS } from '../../src/v1/ai/models'
import { SlipNotRead, readSlipImage, slipNeedsOpus } from '../../src/v1/ai/slip-read'
import type { HaikuOutcome } from '../../src/v1/ai/slip-read'
import { AiDeadline, DeadlinePassed, anthropicTransport, newTrace, tracedSend } from '../../src/v1/ai/transport'
import type { ModelTransport } from '../../src/v1/ai/transport'
import { VAULT_OBJECT_PURPOSES, vaultPrefix } from '../../src/vault/files/keys'
import { apiFailure, fakeModel, json, refusal, text } from '../support/fake-model'
import { storedKeys, vaultIdOf, vaultRows } from './support/files'
import { member, startV1 } from './support/v1-client'
import type { TestUser, V1Client } from './support/v1-client'

const today = bangkokDate(new Date())
const nextYear = `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`
const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const body = async (res: Response) => res.json()

/** A slip read as a model answers it. */
const slipReply = (kind: string, drafts: unknown[], bank: string | null = 'K PLUS') => json({ kind, bank, drafts })

/** The image a request sent, as base64. */
function imageOf(call: MessageParams): string | undefined {
  const content = call.messages[0].content as { type: string; source?: { data?: string } }[]
  return content.find((block) => block.type === 'image')?.source?.data
}

/** The media type of the image a request sent. */
function mediaOf(call: MessageParams): string | undefined {
  const content = call.messages[0].content as { type: string; source?: { media_type?: string } }[]
  return content.find((block) => block.type === 'image')?.source?.media_type
}

/** The text a request sent beside the image. */
function textOf(call: MessageParams): string | undefined {
  const content = call.messages[0].content as { type: string; text?: string }[]
  return content.find((block) => block.type === 'text')?.text
}

describe('reading one slip through the front door', () => {
  let model: ReturnType<typeof fakeModel>
  let client: V1Client

  beforeEach(async () => {
    model = fakeModel()
    client = await startV1(undefined, { transport: model.transport })
  })

  afterEach(() => {
    // Every scripted reply was asked for.
    expect(model.left()).toBe(0)
  })

  type Person = { user: TestUser; cash: string; food: string }

  /** A member who agreed to the AI notice. */
  async function consenting(): Promise<TestUser> {
    const user = await member(client)
    expect((await client.as(user).put('/v1/me/ai-preferences', { companion: true, notice_version: 1 })).status).toBe(200)
    return user
  }

  /** A consenting member with one cash wallet (opened at ฿1,000, a balance no prompt may carry) and the built-in categories. */
  async function person(): Promise<Person> {
    const user = await consenting()
    const cash = randomUUID()
    expect((await client.as(user).post('/v1/wallets', { id: cash, name: 'เงินสด', opening_minor: '100000', tracking_start: '2026-01-01' })).status).toBe(201)
    const categories = (await body(await client.as(user).post('/v1/categories/builtins'))) as { id: string; builtin_key: string | null }[]
    const food = categories.find((category) => category.builtin_key === 'food')?.id
    if (!food) throw new Error('the built-in categories have no food')
    return { user, cash, food }
  }

  /** One draft as a model writes it: ฿1,250 paid to ร้านป้าแดง today, from the person's cash, with `changes`. */
  const drafted = (who: Person | null, changes: Record<string, unknown> = {}) => ({
    type: 'expense',
    amount_baht: '1,250.00',
    date: today,
    category_id: who?.food ?? null,
    wallet_id: who?.cash ?? null,
    merchant: 'ร้านป้าแดง',
    note: null,
    confidence: 'high',
    flags: [],
    ...changes,
  })

  const readSlip = (user: TestUser, as: V1Client = client) => as.as(user).post('/v1/ai/slip', { image_base64: tinyPng, media_type: 'image/png', today, locale: 'th' })
  const remaining = async (user: TestUser): Promise<Record<AiFeature, number>> => (await body(await client.as(user).get('/v1/me/ai-preferences'))).remaining
  const modelsAsked = () => model.calls.map((call) => call.model)

  it('a complete slip is read once by Haiku', async () => {
    const who = await person()
    model.push(slipReply('slip', [drafted(who)]))
    const res = await readSlip(who.user)
    expect(res.status).toBe(200)
    expect(await body(res)).toEqual({
      drafts: [{ type: 'expense', amount_minor: '125000', occurred_on: today, category_id: who.food, wallet_id: who.cash, merchant: 'ร้านป้าแดง', note: null, confidence: 'high', flags: [] }],
      bank: 'K PLUS',
      source: 'ai',
      model: 'claude-haiku-5-5',
      escalated: false,
      kind: 'slip',
      declined: false,
      tokens: { input: 10, output: 10 },
    })
    expect(modelsAsked()).toEqual(['claude-haiku-5-5'])
    const [haiku] = model.calls
    // Haiku's base and its effort, with the slip's JSON format, whose schema asks for the kind; the rules say what each kind means.
    expect(haiku).toMatchObject({ model: 'claude-haiku-5-5', max_tokens: 8_000, output_config: { effort: 'medium', format: { type: 'json_schema', schema: SLIP_SCHEMA } } })
    expect(SLIP_SCHEMA).toMatchObject({ required: ['kind', 'drafts', 'bank'], properties: { kind: { type: 'string', enum: ['slip', 'receipt', 'unreadable'] } } })
    expect(haiku.system).toContain('- kind: "slip" for a bank or e-wallet transfer slip, "receipt" for a shop receipt or bill, "unreadable" when no amount can be read; with "unreadable" return 0 drafts.')
    expect(imageOf(haiku)).toBe(tinyPng)
    // Beside the image, the day and the names to choose from: never a balance.
    expect(JSON.parse(textOf(haiku) ?? 'null')).toEqual({
      today,
      locale: 'th',
      wallets: [{ id: who.cash, name: 'เงินสด' }],
      categories: expect.arrayContaining([{ id: who.food, type: 'expense', name: 'food' }]),
    })
    expect((await remaining(who.user)).slip).toBe(AI_DAILY_LIMITS.slip - 1)
  })

  it.each([
    ['the amount does not parse', { amount_baht: null }],
    ['the date is implausible (next year)', { date: nextYear }],
    ['a slip has no receiver', { merchant: null }],
  ])('Opus re-reads when %s', async (_why, changes) => {
    const who = await person()
    model.push(slipReply('slip', [drafted(who, changes)]), slipReply('slip', [drafted(who, { amount_baht: '1,350.00' })], 'SCB EASY'))
    const res = await readSlip(who.user)
    expect(res.status).toBe(200)
    expect(await body(res)).toMatchObject({ model: 'claude-opus-5-5', escalated: true, declined: false, kind: 'slip', bank: 'SCB EASY', drafts: [{ amount_minor: '135000', merchant: 'ร้านป้าแดง' }] })
    expect(modelsAsked()).toEqual(['claude-haiku-5-5', 'claude-opus-5-5'])
    const [haiku, opus] = model.calls
    expect(opus).toMatchObject({
      model: 'claude-opus-5-5',
      max_tokens: 8_000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SLIP_SCHEMA } },
    })
    // The same bytes and the same words as Haiku's.
    expect(imageOf(opus)).toBe(tinyPng)
    expect(opus.messages).toEqual(haiku.messages)
    expect(opus.system).toBe(haiku.system)
  })

  it('a Haiku refusal is re-read by Opus and marked declined', async () => {
    const who = await person()
    model.push(refusal(), slipReply('slip', [drafted(who)]))
    expect(await body(await readSlip(who.user))).toMatchObject({ model: 'claude-opus-5-5', escalated: true, declined: true, kind: 'slip', drafts: [{ amount_minor: '125000' }] })
    expect(modelsAsked()).toEqual(['claude-haiku-5-5', 'claude-opus-5-5'])
    // A decline spends the use (A14).
    expect((await remaining(who.user)).slip).toBe(AI_DAILY_LIMITS.slip - 1)
  })

  it("an Opus refusal marks the read declined too, and Haiku's draft stands", async () => {
    const who = await person()
    model.push(slipReply('slip', [drafted(who, { amount_baht: null })]), refusal())
    expect(await body(await readSlip(who.user))).toMatchObject({ model: 'claude-haiku-5-5', escalated: true, declined: true, kind: 'slip', drafts: [{ amount_minor: null, flags: ['amount_unclear'] }] })
    expect((await remaining(who.user)).slip).toBe(AI_DAILY_LIMITS.slip - 1)
  })

  const unusable: [string, (who: Person) => ModelMessage][] = [
    ['is not JSON', () => text('I read ฿1,250 paid to ร้านป้าแดง.')],
    ['was cut short', () => text('{"kind":"slip","bank":"K PL', 'max_tokens')],
    ['has no kind', (who) => json({ bank: 'K PLUS', drafts: [drafted(who)] })],
    ['has a kind that is not slip, receipt or unreadable', (who) => slipReply('invoice', [drafted(who)])],
    ['has no draft', () => slipReply('slip', [])],
    ['says unreadable, so its drafts are dropped', (who) => slipReply('unreadable', [drafted(who)])],
  ]
  it.each(unusable)('an answer that %s is re-read by Opus', async (_what, haikuReply) => {
    const who = await person()
    model.push(haikuReply(who), slipReply('receipt', [drafted(who, { amount_baht: '89' })], null))
    expect(await body(await readSlip(who.user))).toMatchObject({ model: 'claude-opus-5-5', escalated: true, declined: false, kind: 'receipt', bank: null, drafts: [{ amount_minor: '8900' }] })
    expect(modelsAsked()).toEqual(['claude-haiku-5-5', 'claude-opus-5-5'])
  })

  it.each(['2026-10-32', '0000-00-00'])("a Haiku date of %s, which is no calendar date, is re-read by Opus (the P3-T8 second review's m1)", async (date) => {
    const who = await person()
    model.push(slipReply('slip', [drafted(who, { date })]), slipReply('slip', [drafted(who)], 'SCB EASY'))
    const res = await readSlip(who.user)
    expect(res.status).toBe(200)
    expect(await body(res)).toMatchObject({ model: 'claude-opus-5-5', escalated: true, kind: 'slip', bank: 'SCB EASY', drafts: [{ amount_minor: '125000', occurred_on: today }] })
    expect(modelsAsked()).toEqual(['claude-haiku-5-5', 'claude-opus-5-5'])
  })

  it('a guessed category or wallet never escalates', async () => {
    // No wallet and no category to choose from, so both are guessed.
    const user = await consenting()
    model.push(slipReply('slip', [drafted(null, { category_id: randomUUID(), wallet_id: randomUUID() })]))
    expect(await body(await readSlip(user))).toMatchObject({
      model: 'claude-haiku-5-5',
      escalated: false,
      kind: 'slip',
      drafts: [{ category_id: null, wallet_id: null, flags: ['category_guessed', 'wallet_guessed'] }],
    })
    expect(modelsAsked()).toEqual(['claude-haiku-5-5'])
  })

  it.each([
    ['a receipt', 'receipt', {}],
    ['an income slip', 'slip', { type: 'income' }],
  ])('%s without a receiver is not re-read', async (_what, kind, changes) => {
    const who = await person()
    model.push(slipReply(kind, [drafted(who, { ...changes, category_id: null, merchant: null })]))
    expect(await body(await readSlip(who.user))).toMatchObject({ model: 'claude-haiku-5-5', escalated: false, kind, drafts: [{ merchant: null }] })
    expect(modelsAsked()).toEqual(['claude-haiku-5-5'])
  })

  it('when Opus also finds nothing the slip is unreadable', async () => {
    const who = await person()
    // Opus names a slip but drafts nothing: a read with no draft is unreadable.
    model.push(slipReply('unreadable', [], null), slipReply('slip', []))
    expect(await body(await readSlip(who.user))).toEqual({
      drafts: [],
      bank: 'K PLUS',
      source: 'ai',
      model: 'claude-opus-5-5',
      escalated: true,
      kind: 'unreadable',
      declined: false,
      tokens: { input: 20, output: 20 },
    })
    // Opus answered, so the use is spent.
    expect((await remaining(who.user)).slip).toBe(AI_DAILY_LIMITS.slip - 1)
  })

  it.each([
    ['declines', () => refusal()],
    ['answers in broken JSON', () => text('{"kind":"slip","bank":"K PL', 'max_tokens')],
  ])('when Opus also %s after a Haiku decline, the slip is unreadable and the use is spent', async (_what, opusReply) => {
    const who = await person()
    model.push(refusal(), opusReply())
    expect(await body(await readSlip(who.user))).toMatchObject({ model: 'claude-opus-5-5', escalated: true, declined: true, kind: 'unreadable', drafts: [], bank: null })
    expect((await remaining(who.user)).slip).toBe(AI_DAILY_LIMITS.slip - 1)
  })

  it("Opus failing after a Haiku draft keeps Haiku's draft, and spends the use (Review Focus 3)", async () => {
    const who = await person()
    model.push(slipReply('slip', [drafted(who, { amount_baht: null })]), apiFailure(529))
    const res = await readSlip(who.user)
    expect(res.status).toBe(200)
    expect(await body(res)).toMatchObject({
      model: 'claude-haiku-5-5',
      escalated: true,
      declined: false,
      kind: 'slip',
      bank: 'K PLUS',
      drafts: [{ amount_minor: null, merchant: 'ร้านป้าแดง', flags: ['amount_unclear'] }],
    })
    expect(modelsAsked()).toEqual(['claude-haiku-5-5', 'claude-opus-5-5'])
    expect((await remaining(who.user)).slip).toBe(AI_DAILY_LIMITS.slip - 1)
  })

  it("Haiku's draft and bank stand when Opus answers with no draft (the P3-T8 reviews' m2 and MC)", async () => {
    const who = await person()
    model.push(slipReply('slip', [drafted(who, { amount_baht: null })]), slipReply('unreadable', [], 'SCB EASY'))
    const res = await readSlip(who.user)
    expect(res.status).toBe(200)
    expect(await body(res)).toMatchObject({ model: 'claude-haiku-5-5', escalated: true, declined: false, kind: 'slip', bank: 'K PLUS', drafts: [{ amount_minor: null, merchant: 'ร้านป้าแดง' }] })
    expect((await remaining(who.user)).slip).toBe(AI_DAILY_LIMITS.slip - 1)
  })

  it('a Haiku refusal followed by an Opus outage is 503 AI_PAUSED and gives the use back (Review Focus 3)', async () => {
    const who = await person()
    model.push(refusal(), apiFailure(529))
    const warnings = vi.spyOn(console, 'warn')
    let res: Response
    let logged: string[] = []
    try {
      res = await readSlip(who.user)
    } finally {
      logged = warnings.mock.calls.map(([line]) => String(line))
      warnings.mockRestore()
    }
    expect(res.status).toBe(503)
    expect(await body(res)).toMatchObject({ code: 'AI_PAUSED', retry_after_seconds: 300 })
    expect(modelsAsked()).toEqual(['claude-haiku-5-5', 'claude-opus-5-5'])
    expect((await remaining(who.user)).slip).toBe(AI_DAILY_LIMITS.slip)
    // One line, naming the failure's class only (Global Constraints, Logging).
    expect(logged.map((line) => JSON.parse(line))).toEqual([{ level: 'warn', event: 'ai_fallback', feature: 'slip', failure: 'SlipNotRead' }])
  })

  it.each([
    ['is not JSON', () => text('I read ฿1,250.')],
    ['has no draft', () => slipReply('slip', [])],
    ['says unreadable', () => slipReply('unreadable', [], null)],
  ])("a Haiku answer that %s, then an Opus outage, is 503 AI_PAUSED and gives the use back (Review Focus 3; the P3-T8 reviews' m1 and MO2)", async (_what, haikuReply) => {
    const user = await consenting()
    model.push(haikuReply(), apiFailure(529))
    const res = await readSlip(user)
    expect(res.status).toBe(503)
    expect(await body(res)).toMatchObject({ code: 'AI_PAUSED', retry_after_seconds: 300 })
    expect(modelsAsked()).toEqual(['claude-haiku-5-5', 'claude-opus-5-5'])
    expect((await remaining(user)).slip).toBe(AI_DAILY_LIMITS.slip)
  })

  it('an outage on Haiku is 503 AI_PAUSED, with no Opus call and the use given back', async () => {
    const who = await person()
    model.push(apiFailure(529))
    const res = await readSlip(who.user)
    expect(res.status).toBe(503)
    expect(await body(res)).toMatchObject({ code: 'AI_PAUSED', retry_after_seconds: 300 })
    expect(modelsAsked()).toEqual(['claude-haiku-5-5'])
    expect((await remaining(who.user)).slip).toBe(AI_DAILY_LIMITS.slip)
  })

  it('a slip the API rejects (a 400) is 503 AI_PAUSED, with no Opus call, and spends the use (A14)', async () => {
    const who = await person()
    model.push(apiFailure(400))
    expect((await readSlip(who.user)).status).toBe(503)
    expect(modelsAsked()).toEqual(['claude-haiku-5-5'])
    expect((await remaining(who.user)).slip).toBe(AI_DAILY_LIMITS.slip - 1)
  })

  it('an escalated read spends one use', async () => {
    const who = await person()
    model.push(slipReply('slip', [drafted(who, { merchant: null })]), slipReply('slip', [drafted(who)]))
    expect(await body(await readSlip(who.user))).toMatchObject({ model: 'claude-opus-5-5', escalated: true })
    expect(await vaultRows(who.user, 'SELECT feature, uses FROM ai_usage')).toEqual([{ feature: 'slip', uses: 1 }])
    expect((await remaining(who.user)).slip).toBe(AI_DAILY_LIMITS.slip - 1)
  })

  it('both requests carry the same bytes through the gateway, and nothing is kept', async () => {
    const who = await person()
    // The real transport, over a fetch that records each request and answers with the next scripted message.
    const replies = [slipReply('slip', [drafted(who, { amount_baht: null })]), slipReply('slip', [drafted(who)])]
    const sent: { url: string; headers: Headers; body: MessageParams }[] = []
    const gatewayFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const request = new Request(input, init)
      sent.push({ url: request.url, headers: request.headers, body: (await request.json()) as MessageParams })
      const next = replies.shift()
      if (!next) throw new Error('no scripted reply left')
      return new Response(JSON.stringify(next), { headers: { 'content-type': 'application/json' } })
    }
    const transport = anthropicTransport({ apiKey: 'synthetic-key', baseURL: 'https://gateway.ai.cloudflare.com/v1/account/gateway/anthropic', fetch: gatewayFetch as typeof fetch })
    const gateway = await startV1(undefined, { transport })
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) => vi.spyOn(console, level))
    let res: Response
    let lines: string[] = []
    try {
      res = await readSlip(who.user, gateway)
    } finally {
      // Read before mockRestore, which clears what each spy saw.
      lines = spies.flatMap((spy) => spy.mock.calls.map((args) => args.map(String).join(' ')))
      for (const spy of spies) spy.mockRestore()
    }
    expect(res.status).toBe(200)
    expect(await body(res)).toMatchObject({ model: 'claude-opus-5-5', escalated: true, drafts: [{ amount_minor: '125000' }] })
    expect(sent.map((request) => request.body.model)).toEqual(['claude-haiku-5-5', 'claude-opus-5-5'])
    for (const request of sent) {
      expect(request.url).toMatch(/^https:\/\/gateway\.ai\.cloudflare\.com\/v1\/account\/gateway\/anthropic\/v1\/messages/)
      expect(request.headers.get('cf-aig-collect-log')).toBe('false')
      expect(request.headers.get('cf-aig-skip-cache')).toBe('true')
      expect(imageOf(request.body)).toBe(tinyPng)
    }
    // Only Opus's request names the fallback beta (H2).
    expect(sent.map((request) => request.headers.get('anthropic-beta'))).toEqual([null, 'server-side-fallback-2026-07-01'])
    // Nothing kept: no object under any of the vault's prefixes, no upload, and no row but the slip's one use.
    for (const purpose of VAULT_OBJECT_PURPOSES) expect(await storedKeys(vaultPrefix(purpose, vaultIdOf(who.user))), purpose).toEqual([])
    expect(await vaultRows(who.user, 'SELECT job_id FROM import_uploads')).toEqual([])
    expect(await vaultRows(who.user, 'SELECT feature, uses FROM ai_usage')).toEqual([{ feature: 'slip', uses: 1 }])
    // No console line carries any 16 characters of the image.
    const pieces = Array.from({ length: tinyPng.length - 15 }, (_, at) => tinyPng.slice(at, at + 16))
    expect(lines.filter((line) => pieces.some((piece) => line.includes(piece)))).toEqual([])
  })

  it('the prompts carry no account, session or device identifier, and no balance (both calls)', async () => {
    const who = await person()
    model.push(refusal(), slipReply('slip', [drafted(who)]))
    expect((await readSlip(who.user)).status).toBe(200)
    expect(model.calls).toHaveLength(2)
    const wire = JSON.stringify(model.calls)
    for (const secret of [who.user.sub, who.user.sid, vaultIdOf(who.user), 'ios/1.0.0', '100000', '฿1,000']) expect(wire, secret).not.toContain(secret)
  })

  it("both calls carry the image's media type, a phone's JPEG included (the P3-T8 reviews' n1 and MO3)", async () => {
    const who = await person()
    model.push(refusal(), slipReply('slip', [drafted(who)]))
    expect((await client.as(who.user).post('/v1/ai/slip', { image_base64: tinyPng, media_type: 'image/jpeg', today, locale: 'th' })).status).toBe(200)
    expect(model.calls.map(mediaOf)).toEqual(['image/jpeg', 'image/jpeg'])
  })

  it("an archived wallet or category reaches neither call (the P3-T8 reviews' m3, MB1 and MB2)", async () => {
    const who = await person()
    const spare = randomUUID()
    expect((await client.as(who.user).post('/v1/wallets', { id: spare, name: 'Spare', opening_minor: '0', tracking_start: '2026-01-01' })).status).toBe(201)
    expect((await client.as(who.user).post(`/v1/wallets/${spare}/archive`, {}, { ifMatch: 1 })).status).toBe(200)
    const listed = (await body(await client.as(who.user).get('/v1/categories'))) as { id: string; builtin_key: string | null }[]
    const fun = listed.find((category) => category.builtin_key === 'fun')?.id
    if (!fun) throw new Error('the built-in categories have no fun')
    expect((await client.as(who.user).post(`/v1/categories/${fun}/archive`, {}, { ifMatch: 1 })).status).toBe(200)
    model.push(refusal(), slipReply('slip', [drafted(who)]))
    expect((await readSlip(who.user)).status).toBe(200)
    expect(modelsAsked()).toEqual(['claude-haiku-5-5', 'claude-opus-5-5'])
    for (const call of model.calls) {
      const sent = JSON.parse(textOf(call) ?? 'null') as { wallets: { id: string }[]; categories: { id: string }[] }
      expect(sent.wallets.map((wallet) => wallet.id)).toEqual([who.cash])
      expect(sent.categories.map((category) => category.id)).toContain(who.food)
      expect(sent.categories.map((category) => category.id)).not.toContain(fun)
    }
  })

  it('tokens add up both calls, cache reads and writes included', async () => {
    const who = await person()
    const used = (message: ModelMessage, usage: Record<string, number>) => ({ ...message, usage }) as unknown as ModelMessage
    model.push(
      used(slipReply('slip', [drafted(who, { amount_baht: null })]), { input_tokens: 1_200, output_tokens: 150, cache_read_input_tokens: 300, cache_creation_input_tokens: 40 }),
      used(slipReply('slip', [drafted(who)]), { input_tokens: 1_500, output_tokens: 210, cache_read_input_tokens: 0, cache_creation_input_tokens: 60 }),
    )
    expect(await body(await readSlip(who.user))).toMatchObject({ model: 'claude-opus-5-5', escalated: true, tokens: { input: 3_100, output: 360 } })
  })
})

// ===========================================================================
// D25's triggers, the read on its own, and the slip's deadline.
// ===========================================================================

describe("D25's triggers and the slip's deadline, directly", () => {
  const CASH = '1a000000-0000-4000-8000-000000000001'
  const DAY = '2026-11-12'
  const context = { today: DAY, wallets: [{ id: CASH, name: 'เงินสด', archived: false }], categories: [] }
  const image = { base64: tinyPng, mediaType: 'image/png' as const }

  /** A sanitized draft: ฿1,250 paid to ร้านป้าแดง, with `changes`. */
  const draft = (changes: Partial<AiDraft> = {}): AiDraft => ({
    type: 'expense',
    amount_minor: '125000',
    occurred_on: DAY,
    category_id: null,
    wallet_id: CASH,
    merchant: 'ร้านป้าแดง',
    note: null,
    confidence: 'medium',
    flags: ['category_guessed'],
    ...changes,
  })
  const answer = (kind: SlipKind, drafts: AiDraft[]): HaikuOutcome => ({ kind: 'answer', read: { kind, drafts } })
  /** One draft as a model writes it, for the same slip. */
  const written = (changes: Record<string, unknown> = {}) => ({ type: 'expense', amount_baht: '1,250.00', date: DAY, category_id: null, wallet_id: CASH, merchant: 'ร้านป้าแดง', note: null, confidence: 'high', flags: [], ...changes })

  it('slipNeedsOpus says yes only for a decline, an unusable answer, no draft, or a draft whose amount, date or receiver is missing', () => {
    const rows: [string, HaikuOutcome, boolean][] = [
      ['a complete slip', answer('slip', [draft()]), false],
      ['a decline', { kind: 'declined' }, true],
      ['an unusable answer', { kind: 'unusable' }, true],
      ['an outage', { kind: 'failed', failure: 'server_error' }, false],
      ['a request the API rejected', { kind: 'failed', failure: 'rejected' }, false],
      ['no draft', answer('unreadable', []), true],
      ['an amount that does not parse', answer('slip', [draft({ amount_minor: null, flags: ['amount_unclear', 'category_guessed'] })]), true],
      ['an implausible date', answer('receipt', [draft({ flags: ['date_guessed', 'category_guessed'] })]), true],
      ['a slip expense with no receiver', answer('slip', [draft({ merchant: null })]), true],
      ['a receipt with no receiver', answer('receipt', [draft({ merchant: null })]), false],
      ['a slip income with no receiver', answer('slip', [draft({ type: 'income', merchant: null })]), false],
      ['a guessed category and wallet', answer('slip', [draft({ wallet_id: null, flags: ['category_guessed', 'wallet_guessed'] })]), false],
      ['a second draft with no amount', answer('receipt', [draft(), draft({ amount_minor: null, flags: ['amount_unclear'] })]), true],
    ]
    for (const [what, outcome, opus] of rows) expect(slipNeedsOpus(outcome), what).toBe(opus)
  })

  it("Haiku's read is capped at 20 s of the slip's 45, and Opus gets what is left (the P3-T4 review's m3)", async () => {
    const clock = { ms: Date.parse('2026-11-12T03:00:00.000Z') }
    const given: { model: string; timeoutMs: number }[] = []
    const transport: ModelTransport = {
      async send(params: MessageParams, options: { timeoutMs: number }): Promise<ModelMessage> {
        given.push({ model: params.model, timeoutMs: options.timeoutMs })
        if (given.length > 1) return slipReply('slip', [written()])
        // Haiku takes its whole share, then answers with no amount.
        clock.ms += 20_000
        return slipReply('slip', [written({ amount_baht: null })])
      },
    }
    const trace = newTrace()
    const read = await readSlipImage({ image, context, locale: 'th' }, { transport, trace, deadline: new AiDeadline(45_000, () => clock.ms) })
    expect(HAIKU_SLIP_CAP_MS).toBe(20_000)
    expect(given).toEqual([
      { model: 'claude-haiku-5-5', timeoutMs: 20_000 },
      { model: 'claude-opus-5-5', timeoutMs: 25_000 },
    ])
    expect(read).toMatchObject({ model: 'claude-opus-5-5', escalated: true, kind: 'slip', drafts: [{ amount_minor: '125000' }] })
    // The trace marks the Opus call as the escalation (P3-T10 reads it).
    expect(trace.calls.map((call) => [call.requested, call.escalated])).toEqual([
      ['claude-haiku-5-5', false],
      ['claude-opus-5-5', true],
    ])
  })

  it("a cap under 2 s makes no call and records a timeout that was never sent (the P3-T4 review's R9)", async () => {
    const sends: number[] = []
    const transport: ModelTransport = {
      async send(_params: MessageParams, options: { timeoutMs: number }): Promise<ModelMessage> {
        sends.push(options.timeoutMs)
        return slipReply('slip', [written()])
      },
    }
    const params: MessageParams = { model: 'claude-haiku-5-5', max_tokens: 8_000, messages: [{ role: 'user', content: 'a slip' }] }
    const trace = newTrace()
    await expect(tracedSend(transport, trace, new AiDeadline(25_000), { feature: 'slip', escalated: false, params, capMs: 1_500 })).rejects.toBeInstanceOf(DeadlinePassed)
    expect(sends).toEqual([])
    expect(trace.calls).toMatchObject([{ feature: 'slip', requested: 'claude-haiku-5-5', sent: false, failure: 'timeout', latencyMs: 0 }])
    // A cap of 3 s under the same deadline is the call's time.
    await tracedSend(transport, trace, new AiDeadline(25_000), { feature: 'slip', escalated: false, params, capMs: 3_000 })
    expect(sends).toEqual([3_000])
  })

  it("when no model read the slip, SlipNotRead carries the last call's failure (A16)", async () => {
    const read = (...replies: (ModelMessage | Error)[]) =>
      readSlipImage({ image, context, locale: 'th' }, { transport: fakeModel(replies).transport, trace: newTrace(), deadline: new AiDeadline(45_000) })
    // Haiku's outage or timeout: Opus is never asked.
    await expect(read(apiFailure(529))).rejects.toMatchObject({ name: 'SlipNotRead', failure: 'server_error' })
    await expect(read(new Anthropic.APIConnectionTimeoutError({ message: 'Request timed out.' }))).rejects.toMatchObject({ name: 'SlipNotRead', failure: 'timeout' })
    await expect(read(apiFailure(400))).rejects.toMatchObject({ name: 'SlipNotRead', failure: 'rejected' })
    // A decline, then Opus rate limited: Opus's failure.
    await expect(read(refusal(), apiFailure(429))).rejects.toMatchObject({ name: 'SlipNotRead', failure: 'rate_limited' })
    await expect(read(apiFailure(529))).rejects.toBeInstanceOf(SlipNotRead)
  })

  it.each([
    ['null', 'null'],
    ['an array', '[]'],
    ['a string', '"hello"'],
  ])("%s as the whole answer is re-read by Opus (the P3-T8 second review's MJ)", async (_what, whole) => {
    const replies = fakeModel([text(whole), slipReply('slip', [written()])])
    await expect(readSlipImage({ image, context, locale: 'th' }, { transport: replies.transport, trace: newTrace(), deadline: new AiDeadline(45_000) })).resolves.toMatchObject({
      model: 'claude-opus-5-5',
      escalated: true,
      kind: 'slip',
    })
    expect(replies.calls).toHaveLength(2)
  })

  it("a draft the sanitizer cannot read leaves the answer unusable, so Opus reads it again and nothing crashes (the P3-T8 second review's m1)", async () => {
    // A day that is no date makes sanitizeDrafts throw for any draft (the service always sends a real one), so neither read can be used.
    const replies = fakeModel([slipReply('slip', [written()]), slipReply('slip', [written()])])
    await expect(
      readSlipImage({ image, context: { ...context, today: 'not-a-date' }, locale: 'th' }, { transport: replies.transport, trace: newTrace(), deadline: new AiDeadline(45_000) }),
    ).resolves.toMatchObject({ kind: 'unreadable', drafts: [], bank: null, model: 'claude-opus-5-5', escalated: true })
    expect(replies.calls).toHaveLength(2)
  })

  it("tokens count this read's calls only, when its trace already holds another (the P3-T8 reviews' n2 and MA)", async () => {
    const trace = newTrace()
    const used = (usage: Record<string, number>) => ({ ...slipReply('slip', [written()]), usage }) as unknown as ModelMessage
    const read = (usage: Record<string, number>) => readSlipImage({ image, context, locale: 'th' }, { transport: fakeModel([used(usage)]).transport, trace, deadline: new AiDeadline(45_000) })
    expect((await read({ input_tokens: 1_000, output_tokens: 100 })).tokens).toEqual({ input: 1_000, output: 100 })
    expect((await read({ input_tokens: 70, output_tokens: 7 })).tokens).toEqual({ input: 70, output: 7 })
  })

  it.each([
    ['without input tokens', { output_tokens: 7 }, { input: 0, output: 7 }],
    ['without output tokens', { input_tokens: 70 }, { input: 70, output: 0 }],
    ['with a count below zero', { input_tokens: -5, output_tokens: 7 }, { input: 0, output: 7 }],
  ])("a usage %s counts what it has, so the phone takes the read (the P3-T8 second review's n1)", async (_what, usage, tokens) => {
    const reply = { ...slipReply('slip', [written()]), usage } as unknown as ModelMessage
    const read = await readSlipImage({ image, context, locale: 'th' }, { transport: fakeModel([reply]).transport, trace: newTrace(), deadline: new AiDeadline(45_000) })
    expect(read.tokens).toEqual(tokens)
  })
})
