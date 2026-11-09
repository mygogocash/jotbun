// The parse queue's consumer (B6, §6.9), in the vault Worker: one message at a
// time. Each message names a vault and an import (never a user, B11). The
// vault decides whether to parse and counts the attempts; the consumer reads
// the quarantined parts, has the stateless parser read the file, checks a
// sanitized image again, stores it, and hands the preview to the vault.
import { createHash } from 'node:crypto'

import { IMPORT_UPLOAD_MAX_BYTES, isUuid } from '@gogospend/contracts'

import type { FeatureGates } from '@api/common/feature-gates'
import { magicFormat, sanitizedImageHeader } from '@api/imports/parse-outcome'
import type { PreviewRecord } from '@api/imports/parse-outcome'
import type { ParseServiceReply } from '@api/imports/parse-server'
import { IMAGE_FORMATS, TABLE_FORMATS } from '@api/imports/parsers/protocol'
import type { ImageFormat, ParseFormat } from '@api/imports/parsers/protocol'
import { ObjectStoreError } from '@api/storage/object-store'

import { R2ObjectStore } from '../server/storage/r2-object-store'
import { readGates } from '../v1/config'
import type { V1Env } from '../v1/env'
import { logFailure } from '../v1/log'
import type { ParseSource } from '../vault/files/parse'
import { PARSE_MAX_ATTEMPTS } from '../vault/files/parse'
import { PARSER_NAME } from './statement-parser'
import type { StatementParser } from './statement-parser'
import { vaultById } from './vault-stub'

export type ParseMessage = { vault: string; job: string }
export type ParserPort = { parse(input: { format: ParseFormat; today: string; bytes: Uint8Array }): Promise<ParseServiceReply> }

/** A message retried for the parser or a failure waits this long. */
export const PARSE_RETRY_SECONDS = 30

const ALL_FORMATS: readonly ParseFormat[] = [...TABLE_FORMATS, ...IMAGE_FORMATS]
const IMAGE_TYPES: Readonly<Record<ImageFormat, string>> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
const VAULT_ID = /^[0-9a-f]{64}$/

/** The stateless parser in its container: one Durable Object for every vault. */
export function containerParser(binding: DurableObjectNamespace<StatementParser>): ParserPort {
  return { parse: (input) => binding.getByName(PARSER_NAME).parse(input) }
}

/** No parser bound: every parse asks to be retried. */
const UNBOUND_PARSER: ParserPort = { parse: async () => ({ kind: 'retry', code: 'parser_unavailable' }) }

/**
 * What is held: every format while `jobs` or `imports` is paused (C12: in the
 * API every worker claim needs `jobs` open), and the image formats while `ocr` is.
 */
export function heldFormats(gates: FeatureGates): ParseFormat[] {
  if (gates.isPaused('jobs') || gates.isPaused('imports')) return [...ALL_FORMATS]
  return gates.isPaused('ocr') ? [...IMAGE_FORMATS] : []
}

class QuarantineError extends Error {
  constructor(readonly code: 'quarantine_missing' | 'quarantine_corrupt') {
    super(code)
  }
}

const sha256Hex = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

/** ParseHandler.readQuarantine: each part's size and SHA-256, then the whole file's, against what the vault registered. A store error throws. */
async function readQuarantine(store: R2ObjectStore, source: Extract<ParseSource, { kind: 'parse' }>): Promise<Uint8Array> {
  const parts: Uint8Array[] = []
  for (const part of source.parts) {
    const data = await store.get(part.key)
    if (data === null) throw new QuarantineError('quarantine_missing')
    if (data.byteLength !== part.bytes || sha256Hex(data) !== part.sha256) throw new QuarantineError('quarantine_corrupt')
    parts.push(data)
  }
  const whole = parts.length === 1 ? parts[0] : Buffer.concat(parts)
  if (whole.byteLength !== source.bytes || sha256Hex(whole) !== source.sha256) throw new QuarantineError('quarantine_corrupt')
  return whole
}

const REJECTED: PreviewRecord = { preview: { status: 'rejected', layout: null, issues: ['parse_failed'], image: null, header_fingerprint: null }, candidates: [] }

/**
 * A `parsed` reply checked again, as previewFromOutcome checks a parse
 * (apps/api/src/imports/parse-outcome.ts): a rejected record is kept as it is,
 * with its own issue (image_too_large, parse_timeout, ...), and never stores an
 * image. A readable one has an image exactly for an image format, its bytes
 * are that format by their magic, at most the upload cap, and its own header
 * gives the size the parser claimed with no metadata. Anything else is the
 * rejected preview parse_failed, with no image.
 */
export function checkedParse(format: ParseFormat, reply: Extract<ParseServiceReply, { kind: 'parsed' }>): { record: PreviewRecord; image: { format: ImageFormat; bytes: Buffer; width: number; height: number } | null } {
  // The API rejects before it looks for an image (parse-outcome.ts, recordFor), so a rejection keeps its code.
  if (reply.record.preview.status === 'rejected') return { record: reply.record, image: null }
  const expectsImage = (IMAGE_FORMATS as readonly string[]).includes(format)
  const image = reply.image
  if (expectsImage !== (image !== null)) return { record: REJECTED, image: null }
  if (image === null) return { record: reply.record, image: null }
  if (image.format !== format) return { record: REJECTED, image: null }
  const bytes = Buffer.from(image.base64, 'base64')
  if (bytes.length === 0 || bytes.length > IMPORT_UPLOAD_MAX_BYTES || magicFormat(bytes) !== image.format) return { record: REJECTED, image: null }
  const header = sanitizedImageHeader(bytes, image.format)
  if (!header || header.width !== image.width || header.height !== image.height) return { record: REJECTED, image: null }
  return { record: reply.record, image: { format: image.format, bytes, width: image.width, height: image.height } }
}

function isParseMessage(body: unknown): body is ParseMessage {
  if (typeof body !== 'object' || body === null) return false
  const { vault, job } = body as Record<string, unknown>
  return typeof vault === 'string' && VAULT_ID.test(vault) && isUuid(job)
}

type Deps = { parser?: ParserPort; gates?: (env: V1Env) => Promise<FeatureGates> }

/** Every message of a batch, one after another (the queue gives one at a time, B6). */
export async function handleParseBatch(batch: MessageBatch<ParseMessage>, env: V1Env, deps: Deps = {}): Promise<void> {
  const parser = deps.parser ?? (env.PARSER ? containerParser(env.PARSER) : UNBOUND_PARSER)
  const gatesOf = deps.gates ?? ((e: V1Env) => readGates(e.CONFIG))
  for (const message of batch.messages) await handleParseMessage(message, env, parser, gatesOf)
}

async function handleParseMessage(message: Message<ParseMessage>, env: V1Env, parser: ParserPort, gatesOf: (env: V1Env) => Promise<FeatureGates>): Promise<void> {
  const body = message.body
  if (!isParseMessage(body)) {
    // Not a message the vault sent: nothing to parse, and retrying cannot help.
    logFailure('parse_message_malformed', new Error('a parse message names a vault and an import'))
    message.ack()
    return
  }
  const vault = vaultById(env, body.vault)
  try {
    const gates = await gatesOf(env)
    const source = await vault.parseSource(body.job, heldFormats(gates))
    if (source.kind === 'held') {
      message.retry({ delaySeconds: gates.retryAfterSeconds })
      return
    }
    if (source.kind === 'skip') {
      message.ack()
      return
    }
    if (!env.OBJECTS) throw new ObjectStoreError('unavailable')
    const store = new R2ObjectStore(env.OBJECTS)
    let bytes: Uint8Array
    try {
      bytes = await readQuarantine(store, source)
    } catch (error) {
      if (!(error instanceof QuarantineError)) throw error
      await vault.failParse(body.job, error.code)
      message.ack()
      return
    }
    const reply = await parser.parse({ format: source.format, today: source.today, bytes })
    if (reply.kind === 'retry') {
      if (reply.code === 'not_started') {
        // No parser ran: the attempt is given back.
        await vault.retryParse(body.job, false)
        message.retry({ delaySeconds: PARSE_RETRY_SECONDS })
      } else if (source.attempt >= PARSE_MAX_ATTEMPTS) {
        await vault.failParse(body.job, reply.code)
        message.ack()
      } else {
        await vault.retryParse(body.job, true)
        message.retry({ delaySeconds: PARSE_RETRY_SECONDS })
      }
      return
    }
    const checked = checkedParse(source.format, reply)
    let image = null
    if (checked.image) {
      const key = await vault.reserveImageKey(body.job, checked.image.format)
      if (key === null) {
        // The import stopped parsing (it expired or was ended): nothing to record.
        message.ack()
        return
      }
      const stored = await store.putStream(key, checked.image.bytes, { contentType: IMAGE_TYPES[checked.image.format] })
      image = { key, bytes: stored.bytes, sha256: stored.sha256, width: checked.image.width, height: checked.image.height }
    }
    // recordPreview reads the vault clock now, after the PUT, so a reservation past its deadline is never published.
    await vault.recordPreview(body.job, { record: checked.record, image })
    message.ack()
  } catch (error) {
    logFailure('parse_consumer_failed', error)
    try {
      await vault.retryParse(body.job, true)
    } catch (retryError) {
      logFailure('parse_retry_unrecorded', retryError)
    }
    message.retry({ delaySeconds: PARSE_RETRY_SECONDS })
  }
}
