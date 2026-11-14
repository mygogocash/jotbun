import { SLIP_KINDS } from '@gogospend/contracts'
import type { AiDraft, AiLocale, AiSlipMediaType, SlipKind } from '@gogospend/contracts'

import { draftChoices, sanitizeDrafts } from '../../server/ai/drafts'
import type { DraftContext } from '../../server/ai/drafts'
import { ModelUnavailable, finishedJson } from '../../server/ai/model'
import type { MessageParams, ModelMessage } from '../../server/ai/model'
import { SLIP_SCHEMA, SLIP_SYSTEM } from '../../server/ai/prompts'
import { HAIKU, HAIKU_SLIP_CAP_MS, OPUS, haikuRequest, opusRequest } from './models'
import type { ModelTier } from './models'
import { SLIP_IMPORT_SCHEMA, SLIP_IMPORT_SYSTEM, missingImportFields, sanitizeSlipImportRead } from './slip-import'
import type { SlipImportRead } from './slip-import'
import { callFailure, tracedSend } from './transport'
import type { AiDeadline, AiTrace, CallFailure, ModelTransport, RecordedCall } from './transport'

// Reading one slip with D25's escalation (P3-T8, H6, A16). Haiku 5.5 reads the
// image first, capped at HAIKU_SLIP_CAP_MS of the deadline so that Opus keeps
// the rest. When D25's triggers say so (slipNeedsOpus), Opus 5.5 reads the same
// bytes again in the same request, while the image is still in memory; an
// outage never escalates (H7). The image goes to the models and nowhere else.
// This module counts no use and gives none back: its callers do (the
// /v1/ai/slip route, and P4's /v1/slips with its own trace and deadline per slip).
// P4-T4 adds the import mode ({ fields: 'import' }, A26): the same flow, reading
// the slip's time and both sides (slip-import.ts) in place of drafts, with only
// today and the locale beside the image.

export type SlipImage = { base64: string; mediaType: AiSlipMediaType }

export type SlipRead = {
  kind: SlipKind
  drafts: AiDraft[]
  bank: string | null
  /** The model whose read is shown (H4). */
  model: ModelTier
  /** True when D25 sent the slip to Opus, whatever Opus answered. */
  escalated: boolean
  /** True when either model's call stopped with a refusal. */
  declined: boolean
  /** Every call's input tokens (cache reads and writes included) and output tokens. */
  tokens: { input: number; output: number }
  /** Import mode only (P4-T4): the slip's time and both sides, when the read shown is a bank slip's. A single read never has this key. */
  import?: SlipImportRead
}

/** What the reader is asked for (A26): drafts, as a single read (the default), or the import mode's time and both sides. */
export type SlipReadOptions = { fields?: 'single' | 'import' }

/** No model read the slip: the read's last call failed, and its failure says how (A16). */
export class SlipNotRead extends Error {
  constructor(
    readonly failure: CallFailure,
    /** The failed call's wait from its retry-after (RecordedCall.retryAfterSeconds), or null (P4-T4, B27). */
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(`No model read the slip (${failure}).`)
    this.name = 'SlipNotRead'
  }
}

/** What one model call made of the slip. */
export type HaikuOutcome =
  | { kind: 'answer'; read: { kind: SlipKind; drafts: AiDraft[] } }
  | { kind: 'declined' }
  | { kind: 'unusable' }
  | { kind: 'failed'; failure: CallFailure }

/** One call's read, with the bank it named. */
type Read = { kind: SlipKind; drafts: AiDraft[]; bank: string | null }
type CallOutcome = Exclude<HaikuOutcome, { kind: 'answer' }> | { kind: 'answer'; read: Read }
/**
 * What one import call made of the slip (P4-T4): a bank slip's read, a decline,
 * an answer the import cannot use (a receipt, an unreadable slip, a broken or
 * cut-short answer), or the call's failure.
 */
type ImportOutcome = { kind: 'answer'; read: SlipImportRead } | { kind: 'declined' } | { kind: 'unusable' } | { kind: 'failed'; failure: CallFailure }

type ReadInput = { image: SlipImage; context: DraftContext; locale: AiLocale }
type ReadDeps = { transport: ModelTransport; trace: AiTrace; deadline: AiDeadline }
type RequestBase = Pick<MessageParams, 'model' | 'max_tokens' | 'betas' | 'fallbacks' | 'output_config'>

/**
 * D25's triggers (H6): Opus reads the slip again when Haiku declined, when its
 * answer was unusable (truncated, not JSON, with no kind, or with a draft the
 * sanitizer cannot read), when it found no draft, or when any draft's amount
 * does not parse, its date is implausible (sanitizeDrafts flags it
 * date_guessed) or, on a slip, an expense names no receiver. A guessed
 * category or wallet never escalates, and neither does an outage (H7).
 */
export function slipNeedsOpus(outcome: HaikuOutcome): boolean {
  if (outcome.kind === 'failed') return false
  if (outcome.kind !== 'answer') return true
  const { kind, drafts } = outcome.read
  if (drafts.length === 0) return true
  return drafts.some(
    (draft) => draft.amount_minor === null || draft.flags.includes('date_guessed') || (kind === 'slip' && draft.type === 'expense' && draft.merchant === null),
  )
}

/**
 * Reads one slip (A16). Haiku first; Opus again, with the same image and
 * text, only when slipNeedsOpus says so. Opus's drafts win; else Haiku's, if
 * it had any (the use is spent, A14); else the slip is unreadable when Opus
 * answered. Throws SlipNotRead when no model answered: Haiku failed (Opus is
 * never asked then), or Haiku found nothing and Opus failed. With
 * `{ fields: 'import' }` it reads for import instead (readSlipImport, P4-T4).
 */
export async function readSlipImage(input: ReadInput, deps: ReadDeps, options: SlipReadOptions = {}): Promise<SlipRead> {
  if (options.fields === 'import') return readSlipImport(input, deps)
  const first = deps.trace.calls.length
  const done = (read: Read, model: ModelTier, outcomes: readonly CallOutcome[]): SlipRead => settled(read, model, outcomes, deps.trace.calls.slice(first))
  const haiku = await readOnce(input, deps, haikuRequest('medium', 8_000), false, HAIKU_SLIP_CAP_MS)
  if (haiku.kind === 'failed') throw new SlipNotRead(haiku.failure, lastWait(deps.trace))
  if (haiku.kind === 'answer' && !slipNeedsOpus(haiku)) return done(haiku.read, HAIKU, [haiku])
  // Opus gets what is left of the deadline.
  const opus = await readOnce(input, deps, opusRequest('medium', 8_000), true)
  if (opus.kind === 'answer' && opus.read.drafts.length > 0) return done(opus.read, OPUS, [haiku, opus])
  if (haiku.kind === 'answer' && haiku.read.drafts.length > 0) return done(haiku.read, HAIKU, [haiku, opus])
  if (opus.kind === 'failed') throw new SlipNotRead(opus.failure, lastWait(deps.trace))
  // Opus answered and found nothing either: its read is unreadable, or it declined or answered unusably.
  return done(opus.kind === 'answer' ? opus.read : { kind: 'unreadable', drafts: [], bank: null }, OPUS, [haiku, opus])
}

/**
 * The import mode (P4-T4, A26, S4): P3-T8's flow with the import read in place
 * of drafts. Haiku reads first; Opus reads the same image again when Haiku
 * declined, answered unusably, called the image a receipt or unreadable (the
 * phone sends only QR-checked bank slips, D25), or read a slip with a
 * SLIP_IMPORT_REQUIRED field missing. Opus's slip read wins; else Haiku's (the
 * use is spent, A14); else the slip is unreadable when Opus answered. Throws
 * SlipNotRead when no model answered, as the single read does. `drafts` is
 * always empty and `bank` is the sender's bank key.
 */
async function readSlipImport(input: ReadInput, deps: ReadDeps): Promise<SlipRead> {
  const first = deps.trace.calls.length
  const done = (read: SlipImportRead | null, model: ModelTier, outcomes: readonly ImportOutcome[]): SlipRead => {
    const shown: Read = read ? { kind: 'slip', drafts: [], bank: read.from.bank } : { kind: 'unreadable', drafts: [], bank: null }
    const result = settled(shown, model, outcomes, deps.trace.calls.slice(first))
    return read ? { ...result, import: read } : result
  }
  const haiku = await importOnce(input, deps, haikuRequest('medium', 8_000), false, HAIKU_SLIP_CAP_MS)
  if (haiku.kind === 'failed') throw new SlipNotRead(haiku.failure, lastWait(deps.trace))
  if (haiku.kind === 'answer' && missingImportFields(haiku.read).length === 0) return done(haiku.read, HAIKU, [haiku])
  // Opus gets what is left of the deadline.
  const opus = await importOnce(input, deps, opusRequest('medium', 8_000), true)
  if (opus.kind === 'answer') return done(opus.read, OPUS, [haiku, opus])
  if (haiku.kind === 'answer') return done(haiku.read, HAIKU, [haiku, opus])
  if (opus.kind === 'failed') throw new SlipNotRead(opus.failure, lastWait(deps.trace))
  // Opus answered, and neither model read a bank slip.
  return done(null, OPUS, [haiku, opus])
}

/**
 * The wait the trace's last call was given (its retry-after): tracedSend records
 * a failed call before it throws, and a slip's calls run one at a time (A16).
 */
const lastWait = (trace: AiTrace): number | null => trace.calls.at(-1)?.retryAfterSeconds ?? null

/** A token count as the API reported it, or 0 when it is missing or not a count, so the phone never refuses a read it was billed for (the P3-T8 second review's n1). */
const counted = (n: number): number => (Number.isSafeInteger(n) && n >= 0 ? n : 0)

/** The read that is shown, with what every call of it added up to. */
function settled(read: Read, model: ModelTier, outcomes: readonly { kind: string }[], calls: readonly RecordedCall[]): SlipRead {
  let input = 0
  let output = 0
  for (const { usage } of calls) {
    if (!usage) continue
    for (const n of [usage.input, usage.cacheRead, usage.cacheWrite]) input += counted(n)
    output += counted(usage.output)
  }
  return {
    ...read,
    model,
    // The second outcome is Opus's.
    escalated: outcomes.length > 1,
    declined: outcomes.some((outcome) => outcome.kind === 'declined'),
    tokens: { input, output },
  }
}

/** What one call on the slip answered: its JSON, a decline, an unusable answer (cut short or not JSON), or the call's failure. */
type Answer = { kind: 'json'; raw: unknown } | { kind: 'declined' } | { kind: 'unusable' } | { kind: 'failed'; failure: CallFailure }

/**
 * One call on the slip, on `base`, through the request's trace and deadline:
 * the image, then `prompt.text`, under `prompt.system` and its JSON schema.
 * The single read and the import mode both ask through it.
 */
async function callSlip(
  input: ReadInput,
  deps: ReadDeps,
  base: RequestBase,
  escalated: boolean,
  capMs: number | undefined,
  prompt: { system: string; schema: Record<string, unknown>; text: string },
): Promise<Answer> {
  const params: MessageParams = {
    ...base,
    // The base's effort, with the read's JSON format (the P3-T6 review's n2).
    output_config: { ...base.output_config, format: { type: 'json_schema', schema: prompt.schema } },
    system: prompt.system,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: input.image.mediaType, data: input.image.base64 } },
          { type: 'text', text: prompt.text },
        ],
      },
    ],
  }
  let message: ModelMessage
  try {
    message = await tracedSend(deps.transport, deps.trace, deps.deadline, { feature: 'slip', escalated, params, capMs })
  } catch (error) {
    return { kind: 'failed', failure: callFailure(error) }
  }
  try {
    return { kind: 'json', raw: finishedJson(message) }
  } catch (error) {
    // finishedJson throws ModelUnavailable only: a refusal is a decline; a truncated or broken answer is unusable.
    return error instanceof ModelUnavailable && error.reason === 'refusal' ? { kind: 'declined' } : { kind: 'unusable' }
  }
}

/** One model's read of the slip: one call, on `base`, through the request's trace and deadline. */
async function readOnce(input: ReadInput, deps: ReadDeps, base: RequestBase, escalated: boolean, capMs?: number): Promise<CallOutcome> {
  const answer = await callSlip(input, deps, base, escalated, capMs, {
    system: SLIP_SYSTEM,
    schema: SLIP_SCHEMA,
    text: JSON.stringify({ today: input.context.today, locale: input.locale, ...draftChoices(input.context) }),
  })
  if (answer.kind !== 'json') return answer
  const raw = answer.raw
  const reply = (typeof raw === 'object' && raw !== null ? raw : {}) as { kind?: unknown; bank?: unknown }
  if (!(SLIP_KINDS as readonly unknown[]).includes(reply.kind)) return { kind: 'unusable' }
  // An unreadable answer's drafts are dropped, and a read with no draft is unreadable. A draft the
  // sanitizer cannot read leaves the answer unusable, so Opus reads it again (the P3-T8 second review's m1).
  let drafts: AiDraft[]
  try {
    drafts = reply.kind === 'unreadable' ? [] : sanitizeDrafts(raw, input.context)
  } catch {
    return { kind: 'unusable' }
  }
  const bank = typeof reply.bank === 'string' && reply.bank.trim() ? reply.bank.trim().slice(0, 60) : null
  return { kind: 'answer', read: { kind: drafts.length > 0 ? (reply.kind as SlipKind) : 'unreadable', drafts, bank } }
}

/** One model's import read of the slip (P4-T4): one call, with only today and the locale beside the image. */
async function importOnce(input: ReadInput, deps: ReadDeps, base: RequestBase, escalated: boolean, capMs?: number): Promise<ImportOutcome> {
  const answer = await callSlip(input, deps, base, escalated, capMs, {
    system: SLIP_IMPORT_SYSTEM,
    schema: SLIP_IMPORT_SCHEMA,
    // Nothing of the context but its day: no wallet, category or id is sent.
    text: JSON.stringify({ today: input.context.today, locale: input.locale }),
  })
  if (answer.kind !== 'json') return answer
  let read: SlipImportRead | null
  try {
    read = sanitizeSlipImportRead(answer.raw, input.context.today)
  } catch {
    // A read the sanitizer cannot take is unusable, so Opus reads it again, as a single read's draft is.
    return { kind: 'unusable' }
  }
  // A receipt, an unreadable slip or an answer of no known kind: no bank slip was read.
  return read ? { kind: 'answer', read } : { kind: 'unusable' }
}
