// P4-T4: the slip reader's import mode (A26, S4, D25), in Node with P3-T4's
// scripted model (no vault, no network). readSlipImage(..., { fields: 'import' })
// asks for the slip's time and both sides with only today and the locale beside
// the image, reads it again with Opus once when Haiku's answer is not a complete
// bank slip, and carries a failed call's wait on SlipNotRead (B27). Then the
// sanitizer alone, and the single read, which keeps P3-T8's shape.
import Anthropic from '@anthropic-ai/sdk'
import { THAI_BANK_KEYS } from '@gogospend/contracts'
import { describe, expect, it, vi } from 'vitest'

import type { MessageParams, ModelMessage } from '../src/server/ai/model'
import { SLIP_SCHEMA, SLIP_SYSTEM, VOICE } from '../src/server/ai/prompts'
import { HAIKU, OPUS } from '../src/v1/ai/models'
import { SLIP_IMPORT_REQUIRED, SLIP_IMPORT_SCHEMA, SLIP_IMPORT_SYSTEM, missingImportFields, sanitizeSlipImportRead } from '../src/v1/ai/slip-import'
import type { SlipImportRead } from '../src/v1/ai/slip-import'
import { SlipNotRead, readSlipImage } from '../src/v1/ai/slip-read'
import { AiDeadline, anthropicTransport, newTrace } from '../src/v1/ai/transport'
import type { AiTrace, ModelTransport } from '../src/v1/ai/transport'
import { apiFailure, fakeModel, json, refusal, text } from './support/fake-model'

const TODAY = '2026-10-25'
const CASH = '0c000000-0000-4000-8000-000000000001'
const LUNCH = '0c000000-0000-4000-8000-000000000002'
/** A caller's context holding a wallet and a category, by name and id, so the cases can show that the import mode sends none of it (P4-T6 passes empty lists). */
const context = {
  today: TODAY,
  wallets: [{ id: CASH, name: 'กระเป๋าลับ', archived: false }],
  categories: [{ id: LUNCH, type: 'expense' as const, builtin_key: null, label: 'ข้าวกลางวัน', archived: false }],
}
const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
type Image = { base64: string; mediaType: 'image/png' | 'image/jpeg' }
const png: Image = { base64: tinyPng, mediaType: 'image/png' }

const KANT = { bank: 'kbank', account_last4: '1234', name: 'นาย กานต์ ใจดี' }
const PA_DAENG = { bank: 'scb', account_last4: '9876', name: 'ร้านป้าแดง ข้าวแกง' }
/** A complete bank slip as a model answers it in import mode: ฿1,250.50 from นาย กานต์ ใจดี (K PLUS) to ร้านป้าแดง (SCB) on 24 October at 18:40, with `changes`. */
const answer = (changes: Record<string, unknown> = {}) => ({ kind: 'slip', amount_baht: '1250.50', date: '2026-10-24', time: '18:40', from: KANT, to: PA_DAENG, flags: [], ...changes })
/** That slip as the import read keeps it. */
const READ: SlipImportRead = {
  amount_minor: '125050',
  occurred_on: '2026-10-24',
  occurred_time: '18:40',
  from: { bank: 'kbank', account_last4: '1234', name: 'นาย กานต์ ใจดี' },
  to: { bank: 'scb', account_last4: '9876', name: 'ร้านป้าแดง ข้าวแกง' },
  flags: [],
}

/** `read` as the reader shows it, by `model`; `calls` scripted replies with usage add 10 input and 10 output tokens each. */
const shown = (read: SlipImportRead, model: string, escalated: boolean, calls: number, declined = false) => ({
  kind: 'slip',
  drafts: [],
  bank: read.from.bank,
  model,
  escalated,
  declined,
  tokens: { input: 10 * calls, output: 10 * calls },
  import: read,
})
/** No bank slip was read: Opus answered, and neither model's answer was one. */
const unreadable = (calls: number, declined = false) => ({ kind: 'unreadable', drafts: [], bank: null, model: OPUS, escalated: true, declined, tokens: { input: 10 * calls, output: 10 * calls } })

/** One import read of the slip through scripted replies, on the single route's 45 s deadline. */
function importRead(replies: (ModelMessage | Error)[], trace: AiTrace = newTrace(), image: Image = png) {
  const model = fakeModel(replies)
  const read = readSlipImage({ image, context, locale: 'th' }, { transport: model.transport, trace, deadline: new AiDeadline(45_000) }, { fields: 'import' })
  return { read, model, trace }
}

const asked = (model: ReturnType<typeof fakeModel>) => model.calls.map((call) => call.model)

/** The text a request sent beside the image. */
function textOf(call: MessageParams): string {
  const content = call.messages[0].content as { type: string; text?: string }[]
  return content.find((block) => block.type === 'text')?.text ?? ''
}

/** The whole request an import call sends on `base`: the import schema and prompt, the image, and only today and the locale. */
const importRequest = (base: Record<string, unknown>, image: Image = png) => ({
  ...base,
  max_tokens: 8_000,
  output_config: { effort: 'medium', format: { type: 'json_schema', schema: SLIP_IMPORT_SCHEMA } },
  system: SLIP_IMPORT_SYSTEM,
  messages: [
    {
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } },
        { type: 'text', text: JSON.stringify({ today: TODAY, locale: 'th' }) },
      ],
    },
  ],
})
const HAIKU_BASE = { model: HAIKU }
const OPUS_BASE = { model: OPUS, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }

const TASK =
  "Task: read one image the person chose, usually a Thai bank transfer or payment slip. kind is 'slip' for a bank transfer or payment slip, 'receipt' for a shop receipt and 'unreadable' otherwise. amount_baht: the amount transferred exactly as printed, digits with at most 2 decimals; never guess a blurred amount: use null and amount_unclear. date: YYYY-MM-DD; Thai slips print Buddhist-era years (2569 is 2026) and Thai month abbreviations. time: HH:MM in 24 hours as printed, or null. from is the sender and to is the receiver. bank: the key from the list for the bank whose name, logo text or app is printed (K PLUS is kbank, SCB EASY is scb, Krungthai NEXT is ktb); other for a bank not in the list; null when none is shown. account_last4: only the last four digits of the account or phone number as printed. name: the display name as printed. Never copy reference numbers, QR contents, or more than four digits of any account or phone number."

describe("the slip reader's import mode", () => {
  it('the import mode asks for the time and both sides, and sends only today and the locale', async () => {
    const { read, model, trace } = importRead([json(answer())])
    await expect(read).resolves.toMatchObject({ kind: 'slip', model: HAIKU })
    expect(model.calls).toHaveLength(1)
    const [haiku] = model.calls
    // The whole request: Haiku's base and effort, the import schema and prompt, the image, and beside it only the day and the language.
    expect(haiku).toEqual(importRequest(HAIKU_BASE))
    expect(JSON.parse(textOf(haiku))).toEqual({ today: '2026-10-25', locale: 'th' })
    // None of the caller's context, by name or id, and no id of the request (its trace's; Node has no account, session, vault or device).
    const sent = JSON.stringify(haiku)
    for (const kept of [CASH, LUNCH, 'กระเป๋าลับ', 'ข้าวกลางวัน', trace.id]) expect(sent).not.toContain(kept)
  })

  it("the import schema is strict throughout, and the prompt is Bun's voice and then the import task", () => {
    const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] })
    const side = {
      type: 'object',
      additionalProperties: false,
      required: ['bank', 'account_last4', 'name'],
      properties: {
        bank: nullable({ type: 'string', enum: [...THAI_BANK_KEYS] }),
        account_last4: nullable({ type: 'string' }),
        name: nullable({ type: 'string' }),
      },
    }
    expect(SLIP_IMPORT_SCHEMA).toEqual({
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'amount_baht', 'date', 'time', 'from', 'to', 'flags'],
      properties: {
        kind: { type: 'string', enum: ['slip', 'receipt', 'unreadable'] },
        amount_baht: nullable({ type: 'string' }),
        date: nullable({ type: 'string' }),
        time: nullable({ type: 'string' }),
        from: side,
        to: side,
        flags: { type: 'array', items: { type: 'string', enum: ['amount_unclear', 'multiple_amounts', 'date_guessed', 'category_guessed', 'wallet_guessed', 'not_money'] } },
      },
    })
    expect(SLIP_IMPORT_SYSTEM).toBe([VOICE, TASK].join('\n\n'))
    // VOICE is the paragraph every prompt starts with, its text unchanged.
    expect(VOICE).toMatch(/^You are Bun \(บัน\), the small steamed-bun companion inside Jotbun, a private spending diary/)
    expect(SLIP_SYSTEM.startsWith(`${VOICE}\n\nTask: `)).toBe(true)
    expect(SLIP_IMPORT_REQUIRED).toEqual(['amount_minor', 'occurred_on', 'from.bank', 'to.name'])
  })

  it('a slip read in import mode fills import with exact satang and clean sides', async () => {
    const { read, model } = importRead([json(answer())])
    await expect(read).resolves.toStrictEqual(shown(READ, HAIKU, false, 1))
    expect(asked(model)).toEqual([HAIKU])
  })

  it('an account number longer than four digits keeps only its last four, and a name holding seven digits in a row is dropped', async () => {
    const { read, model } = importRead([json(answer({ from: { bank: 'kbank', account_last4: '012-3-45678-9', name: 'โอนเข้า 0812345678' } }))])
    await expect(read).resolves.toStrictEqual(shown({ ...READ, from: { bank: 'kbank', account_last4: '6789', name: null } }, HAIKU, false, 1))
    expect(asked(model)).toEqual([HAIKU])
  })

  it('a bank outside the list becomes null, and an impossible time null', async () => {
    const { read, model } = importRead([json(answer({ to: { ...PA_DAENG, bank: 'promptpay' }, time: '24:00' }))])
    await expect(read).resolves.toStrictEqual(shown({ ...READ, occurred_time: null, to: { ...READ.to, bank: null } }, HAIKU, false, 1))
    expect(asked(model)).toEqual([HAIKU])
  })

  it.each<[string, Record<string, unknown>]>([
    ['amount', { amount_baht: 'about 1,250' }],
    ['day', { date: null }],
    ['sender bank', { from: { ...KANT, bank: null } }],
    ['receiver name', { to: { ...PA_DAENG, name: null } }],
  ])("a missing %s re-reads the slip with Opus once, and Opus's read is shown", async (_what, missing) => {
    const { read, model } = importRead([json(answer(missing)), json(answer())])
    await expect(read).resolves.toStrictEqual(shown(READ, OPUS, true, 2))
    expect(asked(model)).toEqual([HAIKU, OPUS])
  })

  it("Opus's bank slip read is shown even when it misses a field too: one re-read, never a third call", async () => {
    const { read, model } = importRead([json(answer({ to: { ...PA_DAENG, name: null } })), json(answer({ from: { ...KANT, bank: null } }))])
    await expect(read).resolves.toStrictEqual(shown({ ...READ, from: { ...READ.from, bank: null } }, OPUS, true, 2))
    expect(asked(model)).toEqual([HAIKU, OPUS])
  })

  it('what an import read does not need never sends the slip to Opus: the time, the accounts, the sender name and the receiver bank', async () => {
    const sparse = { time: null, from: { bank: 'kbank', account_last4: null, name: null }, to: { bank: null, account_last4: null, name: 'ร้านป้าแดง ข้าวแกง' } }
    const { read, model } = importRead([json(answer(sparse))])
    const kept: SlipImportRead = { ...READ, occurred_time: null, from: { bank: 'kbank', account_last4: null, name: null }, to: { bank: null, account_last4: null, name: 'ร้านป้าแดง ข้าวแกง' } }
    await expect(read).resolves.toStrictEqual(shown(kept, HAIKU, false, 1))
    expect(asked(model)).toEqual([HAIKU])
  })

  it('an outage on Haiku throws SlipNotRead with the wait it was given, and calls no Opus', async () => {
    const rows: [Error, string, number | null][] = [
      [apiFailure(429, { 'retry-after': '40' }), 'rate_limited', 40],
      [apiFailure(529), 'server_error', null],
      [new Anthropic.APIConnectionTimeoutError({ message: 'Request timed out.' }), 'timeout', null],
    ]
    for (const [failure, kind, wait] of rows) {
      const { read, model } = importRead([failure])
      await expect(read).rejects.toBeInstanceOf(SlipNotRead)
      await expect(read).rejects.toMatchObject({ name: 'SlipNotRead', failure: kind, retryAfterSeconds: wait })
      expect(asked(model)).toEqual([HAIKU])
    }
  })

  it("Opus failing after Haiku's import read keeps Haiku's read (A14)", async () => {
    const { read, model } = importRead([json(answer({ to: { ...PA_DAENG, name: null } })), apiFailure(529)])
    await expect(read).resolves.toStrictEqual(shown({ ...READ, to: { ...READ.to, name: null } }, HAIKU, true, 1))
    expect(asked(model)).toEqual([HAIKU, OPUS])
  })

  it("Opus failing after Haiku read no bank slip throws SlipNotRead with Opus's failure and wait", async () => {
    const limited = importRead([json(answer({ kind: 'unreadable' })), apiFailure(429, { 'retry-after': '30' })])
    await expect(limited.read).rejects.toMatchObject({ name: 'SlipNotRead', failure: 'rate_limited', retryAfterSeconds: 30 })
    expect(asked(limited.model)).toEqual([HAIKU, OPUS])
    const down = importRead([refusal(), apiFailure(529)])
    await expect(down.read).rejects.toMatchObject({ name: 'SlipNotRead', failure: 'server_error', retryAfterSeconds: null })
  })

  it('with the real transport a 429 is not retried, and its retry-after reaches SlipNotRead', async () => {
    let fetches = 0
    const limited = async (): Promise<Response> => {
      fetches += 1
      return new Response(JSON.stringify({ error: { message: 'Too many requests' } }), { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '40' } })
    }
    const transport = anthropicTransport({ apiKey: 'sk-test', fetch: limited })
    const start = Date.now()
    const read = readSlipImage({ image: png, context, locale: 'th' }, { transport, trace: newTrace(), deadline: new AiDeadline(45_000) }, { fields: 'import' })
    await expect(read).rejects.toMatchObject({ name: 'SlipNotRead', failure: 'rate_limited', retryAfterSeconds: 40 })
    expect(fetches).toBe(1)
    expect(Date.now() - start).toBeLessThan(1_000)
  })

  it.each(['unreadable', 'receipt'])("a slip Haiku calls %s is re-read once by Opus, and Opus's read is the draft", async (kind) => {
    const { read, model } = importRead([json(answer({ kind })), json(answer())])
    await expect(read).resolves.toStrictEqual(shown(READ, OPUS, true, 2))
    expect(asked(model)).toEqual([HAIKU, OPUS])
  })

  it('a slip both models call unreadable has no import read', async () => {
    const { read, model } = importRead([json(answer({ kind: 'unreadable' })), json(answer({ kind: 'receipt' }))])
    await expect(read).resolves.toStrictEqual(unreadable(2))
    expect(asked(model)).toEqual([HAIKU, OPUS])
    // Both were asked for an import read.
    expect(model.calls.map((call) => call.system)).toEqual([SLIP_IMPORT_SYSTEM, SLIP_IMPORT_SYSTEM])
  })

  it('a decline from both models is unreadable and declined: a decline is an answer, never SlipNotRead', async () => {
    const { read, model } = importRead([refusal(), refusal()])
    await expect(read).resolves.toStrictEqual(unreadable(2, true))
    expect(model.calls.map((call) => call.system)).toEqual([SLIP_IMPORT_SYSTEM, SLIP_IMPORT_SYSTEM])
  })

  it.each<[string, ModelMessage]>([
    ['null', text('null')],
    ['an array', text('[]')],
    ['a string', text('"hello"')],
    ['an answer cut short', text('{"kind":"slip","amount_baht":"12', 'max_tokens')],
  ])("%s as Haiku's whole answer is re-read by Opus (the P3-T8 second review's MJ)", async (_what, whole) => {
    const { read, model } = importRead([whole, json(answer())])
    await expect(read).resolves.toStrictEqual(shown(READ, OPUS, true, 2))
    expect(asked(model)).toEqual([HAIKU, OPUS])
  })

  it.each<[string, ModelMessage, boolean]>([
    ['calls it unreadable', json(answer({ kind: 'unreadable', from: { ...KANT, bank: 'bbl' } })), false],
    ['declines', refusal(), true],
    ['answers in broken JSON', text('not json'), false],
  ])("an Opus that %s leaves Haiku's read and its bank (the P3-T8 reviews' MC)", async (_what, opus, declined) => {
    const { read } = importRead([json(answer({ to: { ...PA_DAENG, name: null } })), opus])
    await expect(read).resolves.toStrictEqual(shown({ ...READ, to: { ...READ.to, name: null } }, HAIKU, true, 2, declined))
  })

  it("Opus is asked the same way, on Opus's base, and its call is marked escalated in the trace", async () => {
    const { read, model, trace } = importRead([refusal(), json(answer())])
    await expect(read).resolves.toStrictEqual(shown(READ, OPUS, true, 2, true))
    expect(model.calls).toHaveLength(2)
    expect(model.calls[1]).toEqual(importRequest(OPUS_BASE))
    expect(trace.calls.map((call) => [call.requested, call.feature, call.escalated, call.sent])).toEqual([
      [HAIKU, 'slip', false, true],
      [OPUS, 'slip', true, true],
    ])
  })

  it.each<[number, string, number | null]>([
    [45_000, 'the other 25 s', 25_000],
    [22_000, 'the last 2 s', 2_000],
    [21_999, "no call, and Haiku's read stands", null],
  ])("on a %i ms deadline, Haiku's import read is capped at 20 s and Opus gets %s (P4-T6's per-slip deadline must leave it 2 s)", async (total, _gets, opusMs) => {
    const clock = { ms: Date.parse('2026-10-25T03:00:00.000Z') }
    const given: [string, number][] = []
    const transport: ModelTransport = {
      async send(params: MessageParams, options: { timeoutMs: number }): Promise<ModelMessage> {
        given.push([params.model, options.timeoutMs])
        if (given.length > 1) return json(answer())
        // Haiku takes its whole share, then answers without the receiver's name.
        clock.ms += 20_000
        return json(answer({ to: { ...PA_DAENG, name: null } }))
      },
    }
    const trace = newTrace()
    const read = readSlipImage({ image: png, context, locale: 'th' }, { transport, trace, deadline: new AiDeadline(total, () => clock.ms) }, { fields: 'import' })
    if (opusMs === null) {
      // Under 2 s left: Opus is never sent (recorded unsent), and Haiku's read stands (A14).
      await expect(read).resolves.toStrictEqual(shown({ ...READ, to: { ...READ.to, name: null } }, HAIKU, true, 1))
      expect(given).toEqual([[HAIKU, 20_000]])
      expect(trace.calls.map((call) => [call.requested, call.sent, call.failure])).toEqual([
        [HAIKU, true, null],
        [OPUS, false, 'timeout'],
      ])
    } else {
      await expect(read).resolves.toStrictEqual(shown(READ, OPUS, true, 2))
      expect(given).toEqual([
        [HAIKU, 20_000],
        [OPUS, opusMs],
      ])
    }
  })

  it("an old genuine slip keeps its day and is read once: no 90-day window (the P3-T8 review's PK)", async () => {
    const { read, model } = importRead([json(answer({ date: '2024-03-15' }))])
    await expect(read).resolves.toStrictEqual(shown({ ...READ, occurred_on: '2024-03-15' }, HAIKU, false, 1))
    expect(asked(model)).toEqual([HAIKU])
  })

  it("the image's media type reaches both calls (the P3-T8 reviews' MO3)", async () => {
    const jpeg: Image = { base64: tinyPng, mediaType: 'image/jpeg' }
    const { read, model } = importRead([json(answer({ kind: 'receipt' })), json(answer())], newTrace(), jpeg)
    await expect(read).resolves.toStrictEqual(shown(READ, OPUS, true, 2))
    expect(model.calls).toEqual([importRequest(HAIKU_BASE, jpeg), importRequest(OPUS_BASE, jpeg)])
  })

  it("tokens count this read's calls only, when its trace already holds another (A16, the P3-T8 reviews' MA)", async () => {
    const trace = newTrace()
    const used = (usage: Record<string, number>) => ({ ...json(answer()), usage }) as unknown as ModelMessage
    await expect(importRead([used({ input_tokens: 1_000, output_tokens: 100 })], trace).read).resolves.toMatchObject({ tokens: { input: 1_000, output: 100 } })
    await expect(importRead([used({ input_tokens: 70, output_tokens: 7 })], trace).read).resolves.toMatchObject({ tokens: { input: 70, output: 7 } })
  })

  it('an import read writes no log line, so no image, name or number reaches one', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => undefined))
    try {
      await expect(importRead([json(answer({ to: { ...PA_DAENG, name: null } })), json(answer())]).read).resolves.toMatchObject({ model: OPUS, import: READ })
      await expect(importRead([apiFailure(429, { 'retry-after': '40' })]).read).rejects.toMatchObject({ name: 'SlipNotRead', retryAfterSeconds: 40 })
      for (const spy of spies) expect(spy).not.toHaveBeenCalled()
    } finally {
      for (const spy of spies) spy.mockRestore()
    }
  })

  it('a read the sanitizer cannot take is unusable, so Opus reads it again, and nothing crashes', async () => {
    // A day that is no date makes the sanitizer throw for any slip (P4-T6 always sends a real one), so neither read can be used.
    const model = fakeModel([json(answer()), json(answer())])
    const read = readSlipImage(
      { image: png, context: { ...context, today: 'not-a-date' }, locale: 'th' },
      { transport: model.transport, trace: newTrace(), deadline: new AiDeadline(45_000) },
      { fields: 'import' },
    )
    await expect(read).resolves.toStrictEqual(unreadable(2))
    expect(asked(model)).toEqual([HAIKU, OPUS])
    expect(model.calls.map((call) => call.system)).toEqual([SLIP_IMPORT_SYSTEM, SLIP_IMPORT_SYSTEM])
  })
})

describe('the import sanitizer', () => {
  /** The sanitizer's answer for `raw`; a throw fails the case as an assertion. */
  function sanitized(raw: unknown, today = TODAY): unknown {
    let out: unknown = 'threw'
    expect(() => {
      out = sanitizeSlipImportRead(raw, today)
    }).not.toThrow()
    return out
  }

  it('only a bank slip has an import read', () => {
    for (const raw of [answer({ kind: 'receipt' }), answer({ kind: 'unreadable' }), answer({ kind: 'Slip' }), answer({ kind: undefined }), null, [], 'hello', 7]) {
      expect(sanitized(raw), JSON.stringify(raw)).toBeNull()
    }
    expect(sanitized(answer())).toEqual(READ)
  })

  it('an amount is exact satang from 1 to 99,999,999,999, else null with amount_unclear', () => {
    const rows: [unknown, string | null][] = [
      ['1,250.50', '125050'],
      ['60', '6000'],
      [1250.5, '125050'],
      ['999999999.99', '99999999999'],
      ['0', null],
      ['0.00', null],
      ['1000000000', null],
      ['1250.505', null],
      ['about 1,250', null],
      [null, null],
    ]
    for (const [baht, minor] of rows) {
      expect(sanitized(answer({ amount_baht: baht })), String(baht)).toEqual({ ...READ, amount_minor: minor, flags: minor === null ? ['amount_unclear'] : [] })
    }
  })

  it('a day is real and from 1970-01-01 to the day after today, else null with date_guessed', () => {
    const rows: [unknown, string | null][] = [
      ['1970-01-01', '1970-01-01'],
      ['2024-03-15', '2024-03-15'],
      ['2026-10-25', '2026-10-25'],
      ['2026-10-26', '2026-10-26'],
      ['1969-12-31', null],
      ['2026-10-27', null],
      ['2026-02-30', null],
      ['2026-10-32', null],
      ['0000-00-00', null],
      ['25/10/2569', null],
      ['2569-10-24', null],
      [20261024, null],
      [null, null],
    ]
    for (const [date, day] of rows) {
      expect(sanitized(answer({ date })), String(date)).toEqual({ ...READ, occurred_on: day, flags: day === null ? ['date_guessed'] : [] })
    }
  })

  it('a time is HH:MM in 24 hours, else null', () => {
    const rows: [unknown, string | null][] = [
      ['00:00', '00:00'],
      ['23:59', '23:59'],
      ['24:00', null],
      ['18:60', null],
      ['6:40', null],
      ['18:40:00', null],
      [1840, null],
      [null, null],
    ]
    for (const [time, kept] of rows) expect(sanitized(answer({ time })), String(time)).toEqual({ ...READ, occurred_time: kept })
  })

  it("a bank is a key from the list, else null; 'other' is a key", () => {
    for (const bank of THAI_BANK_KEYS) expect(sanitized(answer({ to: { ...PA_DAENG, bank } })), bank).toEqual({ ...READ, to: { ...READ.to, bank } })
    for (const bank of ['KBANK', 'K PLUS', 'promptpay', ' kbank', 7, null]) {
      expect(sanitized(answer({ to: { ...PA_DAENG, bank } })), String(bank)).toEqual({ ...READ, to: { ...READ.to, bank: null } })
    }
  })

  it('an account keeps only its last four digits, Thai digits read as ASCII', () => {
    const rows: [unknown, string | null][] = [
      ['012-3-45678-9', '6789'],
      ['xxx-x-x1234-x', '1234'],
      ['XXX-XXX-5678', '5678'],
      ['๑๒๓๔', '1234'],
      ['xxx-12', null],
      [1234, null],
      [null, null],
    ]
    for (const [account, last4] of rows) {
      expect(sanitized(answer({ to: { ...PA_DAENG, account_last4: account } })), String(account)).toEqual({ ...READ, to: { ...READ.to, account_last4: last4 } })
    }
  })

  it('a name is one line of 1 to 120 code points, NFC and trimmed, and never holds a long number', () => {
    const LF = String.fromCharCode(10)
    const RLO = String.fromCharCode(0x202e)
    const rows: [unknown, string | null][] = [
      ['  นาย กานต์ ใจดี  ', 'นาย กานต์ ใจดี'],
      ['Cafe' + String.fromCharCode(0x301), 'Caf' + String.fromCharCode(0xe9)],
      ['ก'.repeat(120), 'ก'.repeat(120)],
      ['ก'.repeat(121), null],
      ['โอนเข้า 0812345678', null],
      ['ร้าน 081-234-5678', null],
      ['ร้าน 081 234 5678', null],
      ['ร้าน ๐๘๑๒๓๔๕๖๗๘', null],
      ['ร้าน 7-11 สาขา 123456', 'ร้าน 7-11 สาขา 123456'],
      ['นาย กานต์' + LF + 'ใจดี', null],
      [RLO + 'ร้านป้าแดง', null],
      ['   ', null],
      ['', null],
      [42, null],
      [null, null],
    ]
    for (const [name, kept] of rows) {
      expect(sanitized(answer({ to: { ...PA_DAENG, name } })), JSON.stringify(name)).toEqual({ ...READ, to: { ...READ.to, name: kept } })
    }
  })

  it('a side that is not an object has no bank, account or name', () => {
    expect(sanitized(answer({ from: null }))).toEqual({ ...READ, from: { bank: null, account_last4: null, name: null } })
    expect(sanitized(answer({ to: 'scb' }))).toEqual({ ...READ, to: { bank: null, account_last4: null, name: null } })
  })

  it('known flags are kept once each, in their order, and unknown ones dropped', () => {
    expect(sanitized(answer({ flags: ['date_guessed', 'bogus', 'multiple_amounts', 'date_guessed', 7] }))).toEqual({ ...READ, flags: ['multiple_amounts', 'date_guessed'] })
    expect(sanitized(answer({ amount_baht: null, flags: ['not_money'] }))).toEqual({ ...READ, amount_minor: null, flags: ['amount_unclear', 'not_money'] })
    expect(sanitized(answer({ flags: 'date_guessed' }))).toEqual(READ)
  })

  it("a day that is no day for today throws: the caller's bug, which the reader counts as unusable", () => {
    expect(() => sanitizeSlipImportRead(answer(), 'not-a-date')).toThrow(TypeError)
  })

  it('missingImportFields names the required fields a read lacks, in order', () => {
    expect(missingImportFields(READ)).toEqual([])
    const none = { bank: null, account_last4: null, name: null }
    expect(missingImportFields({ ...READ, amount_minor: null, occurred_on: null, from: none, to: none })).toEqual(['amount_minor', 'occurred_on', 'from.bank', 'to.name'])
    expect(missingImportFields({ ...READ, to: { ...READ.to, name: null } })).toEqual(['to.name'])
    expect(missingImportFields({ ...READ, occurred_time: null, from: { ...READ.from, account_last4: null, name: null }, to: { ...READ.to, bank: null, account_last4: null } })).toEqual([])
  })
})

describe("the single read keeps P3-T8's shape", () => {
  it('the single mode is unchanged: no import key, and the drafts prompt with the wallets and categories to choose from', async () => {
    const written = { type: 'expense', amount_baht: '1,250.00', date: TODAY, category_id: LUNCH, wallet_id: CASH, merchant: 'ร้านป้าแดง', note: null, confidence: 'high', flags: [] }
    const draft = { type: 'expense', amount_minor: '125000', occurred_on: TODAY, category_id: LUNCH, wallet_id: CASH, merchant: 'ร้านป้าแดง', note: null, confidence: 'high', flags: [] }
    const expected = { kind: 'slip', drafts: [draft], bank: 'K PLUS', model: HAIKU, escalated: false, declined: false, tokens: { input: 10, output: 10 } }
    for (const options of [undefined, { fields: 'single' as const }]) {
      const model = fakeModel([json({ kind: 'slip', bank: 'K PLUS', drafts: [written] })])
      const read = readSlipImage({ image: png, context, locale: 'th' }, { transport: model.transport, trace: newTrace(), deadline: new AiDeadline(45_000) }, options)
      await expect(read).resolves.toStrictEqual(expected)
      expect(model.calls).toHaveLength(1)
      expect(model.calls[0]).toMatchObject({ system: SLIP_SYSTEM, output_config: { effort: 'medium', format: { type: 'json_schema', schema: SLIP_SCHEMA } } })
      expect(JSON.parse(textOf(model.calls[0]))).toEqual({ today: TODAY, locale: 'th', wallets: [{ id: CASH, name: 'กระเป๋าลับ' }], categories: [{ id: LUNCH, type: 'expense', name: 'ข้าวกลางวัน' }] })
    }
  })

  it("a single read's SlipNotRead carries the failed call's wait too", async () => {
    const single = (replies: (ModelMessage | Error)[]) =>
      readSlipImage({ image: png, context, locale: 'th' }, { transport: fakeModel(replies).transport, trace: newTrace(), deadline: new AiDeadline(45_000) })
    await expect(single([apiFailure(429, { 'retry-after': '40' })])).rejects.toMatchObject({ name: 'SlipNotRead', failure: 'rate_limited', retryAfterSeconds: 40 })
    await expect(single([refusal(), apiFailure(429, { 'retry-after': '30' })])).rejects.toMatchObject({ name: 'SlipNotRead', failure: 'rate_limited', retryAfterSeconds: 30 })
    await expect(single([apiFailure(529)])).rejects.toMatchObject({ name: 'SlipNotRead', failure: 'server_error', retryAfterSeconds: null })
  })
})
