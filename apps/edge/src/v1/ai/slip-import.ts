/**
 * The slip reader's import mode (P4-T4, A26, S4): what a slip read for import
 * asks the models for (SLIP_IMPORT_SYSTEM and SLIP_IMPORT_SCHEMA), how an
 * answer becomes a SlipImportRead (sanitizeSlipImportRead), and the fields
 * whose absence sends the slip to Opus once (SLIP_IMPORT_REQUIRED, D25). An
 * import read holds the slip's amount, day and time and both sides as printed
 * (bank key, last four digits, name): never a wallet, a category, a reference
 * or more than four digits of any number. slip-read.ts makes the calls
 * (readSlipImage with { fields: 'import' }), and P4's /v1/slips writes the read.
 */
import {
  AI_DRAFT_FLAGS,
  SLIP_KINDS,
  THAI_BANK_KEYS,
  accountLast4,
  addDays,
  isThaiBankKey,
  normalizeMerchant,
  validateOccurredOn,
} from '@gogospend/contracts'
import type { AiDraftFlag, Minor, SlipParty } from '@gogospend/contracts'

import { bahtToSatang } from '../../server/ai/drafts'
import { VOICE } from '../../server/ai/prompts'

/** A bank slip read for import: its exact amount, day and time, and both sides as printed. */
export type SlipImportRead = {
  amount_minor: Minor | null
  occurred_on: string | null
  occurred_time: string | null
  from: SlipParty
  to: SlipParty
  flags: AiDraftFlag[]
}

/** What an import read needs; a slip read missing any of them is read once more, by Opus (D25, S4). */
export const SLIP_IMPORT_REQUIRED = ['amount_minor', 'occurred_on', 'from.bank', 'to.name'] as const

/** The import read's system prompt: Bun's voice, then the task (P4-T4; locked after P4-T23's run, D25). */
export const SLIP_IMPORT_SYSTEM = `${VOICE}

Task: read one image the person chose, usually a Thai bank transfer or payment slip. kind is 'slip' for a bank transfer or payment slip, 'receipt' for a shop receipt and 'unreadable' otherwise. amount_baht: the amount transferred exactly as printed, digits with at most 2 decimals; never guess a blurred amount: use null and amount_unclear. date: YYYY-MM-DD; Thai slips print Buddhist-era years (2569 is 2026) and Thai month abbreviations. time: HH:MM in 24 hours as printed, or null. from is the sender and to is the receiver. bank: the key from the list for the bank whose name, logo text or app is printed (K PLUS is kbank, SCB EASY is scb, Krungthai NEXT is ktb); other for a bank not in the list; null when none is shown. account_last4: only the last four digits of the account or phone number as printed. name: the display name as printed. Never copy reference numbers, QR contents, or more than four digits of any account or phone number.`

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] })

/** One side of the slip: its bank's key, the last four digits of its account or phone, and its name. */
const SIDE = {
  type: 'object',
  additionalProperties: false,
  required: ['bank', 'account_last4', 'name'],
  properties: {
    bank: nullable({ type: 'string', enum: [...THAI_BANK_KEYS] }),
    account_last4: nullable({ type: 'string' }),
    name: nullable({ type: 'string' }),
  },
}

/** The import read's strict JSON schema: what the image is, the amount, day and time, both sides and the flags. */
export const SLIP_IMPORT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'amount_baht', 'date', 'time', 'from', 'to', 'flags'],
  properties: {
    kind: { type: 'string', enum: [...SLIP_KINDS] },
    amount_baht: nullable({ type: 'string' }),
    date: nullable({ type: 'string' }),
    time: nullable({ type: 'string' }),
    from: SIDE,
    to: SIDE,
    flags: { type: 'array', items: { type: 'string', enum: [...AI_DRAFT_FLAGS] } },
  },
}

const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/
/** The first day a slip may carry. */
const EARLIEST = '1970-01-01'
/**
 * Seven or more digits in a row: a phone, account or ID number, which no side's
 * name may carry. Any script's digits count (Thai ones too), and a space, dot
 * or dash between two digits does not break the row (081-234-5678).
 */
const LONG_NUMBER = /\p{Nd}(?:[ .-]?\p{Nd}){6,}/u

/**
 * A side's name, or null. P4-T16a makes a name the record's merchant, so it is
 * read by the merchant's own rule (one line, NFC, trimmed, 1 to 120 code
 * points, no control or bidi character), and dropped when it holds a long number.
 */
function sideName(value: unknown): string | null {
  let name: string | null
  try {
    name = normalizeMerchant(value)
  } catch {
    return null
  }
  return name !== null && LONG_NUMBER.test(name) ? null : name
}

/** One side of the slip, each field checked on its own; anything that is not a side has none of them. */
function side(value: unknown): SlipParty {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  return {
    bank: isThaiBankKey(raw.bank) ? raw.bank : null,
    account_last4: typeof raw.account_last4 === 'string' ? accountLast4(raw.account_last4) : null,
    name: sideName(raw.name),
  }
}

/** The slip's day when it is a real one from 1970-01-01 to `latest`; else null. */
function slipDay(value: unknown, latest: string): string | null {
  try {
    return validateOccurredOn(value, EARLIEST, latest)
  } catch {
    return null
  }
}

/**
 * A model's import answer as a SlipImportRead, or null when the answer is not
 * a bank slip's (its kind is not 'slip'). An amount is exact satang (1 to
 * 99,999,999,999), else null with amount_unclear. A day must be real, from
 * 1970-01-01 to the day after `today` (a backfill reaches far back, so there is
 * no 90-day window), else null with date_guessed. A time is HH:MM in 24 hours,
 * else null. A bank is one of THAI_BANK_KEYS; an account keeps its last four
 * digits; a name as sideName reads it. Unknown flags are dropped. Throws when
 * `today` is no day (a caller's bug: the read then counts as unusable).
 */
export function sanitizeSlipImportRead(raw: unknown, today: string): SlipImportRead | null {
  if (typeof raw !== 'object' || raw === null || (raw as { kind?: unknown }).kind !== 'slip') return null
  const reply = raw as Record<string, unknown>
  const latest = addDays(today, 1)
  // Only the known flags leave, once each and in their order.
  const flags = new Set<unknown>(Array.isArray(reply.flags) ? reply.flags : [])
  const amount = bahtToSatang(reply.amount_baht)
  if (amount === null) flags.add('amount_unclear')
  const day = slipDay(reply.date, latest)
  if (day === null) flags.add('date_guessed')
  return {
    amount_minor: amount?.toString() ?? null,
    occurred_on: day,
    occurred_time: typeof reply.time === 'string' && TIME.test(reply.time) ? reply.time : null,
    from: side(reply.from),
    to: side(reply.to),
    flags: AI_DRAFT_FLAGS.filter((f) => flags.has(f)),
  }
}

/** The SLIP_IMPORT_REQUIRED paths a read is missing (null), in that order. */
export function missingImportFields(read: SlipImportRead): string[] {
  const at: Record<(typeof SLIP_IMPORT_REQUIRED)[number], unknown> = {
    amount_minor: read.amount_minor,
    occurred_on: read.occurred_on,
    'from.bank': read.from.bank,
    'to.name': read.to.name,
  }
  return SLIP_IMPORT_REQUIRED.filter((path) => at[path] === null)
}
