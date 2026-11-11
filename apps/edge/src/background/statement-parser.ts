// The stateless statement parser (B3, §6.9): the API's release image started
// as its parse server (apps/api/src/imports/parse-server.ts) in this Durable
// Object's container. It holds no secrets, no bindings and no internet: the
// file goes in the request body and the parse outcome comes back in the
// response. One parse runs at a time. Container API (Cloudflare Containers
// docs): `start`, `getTcpPort(port).fetch`, `setInactivityTimeout`.
import { DurableObject } from 'cloudflare:workers'

import type { ParseFormat } from '@api/imports/parsers/protocol'
import type { ParseServiceReply } from '@api/imports/parse-server'

/** One parser for every vault, as today's single parse worker. */
export const PARSER_NAME = 'statement-parser'
export const PARSER_PORT = 8080
/** The release image's parse server (apps/api/Dockerfile; its working directory is apps/api). */
export const PARSER_ENTRYPOINT = ['node', 'dist/imports/parse-server.js']

/** How long the container may take to answer its first health check. */
export const PARSER_START_MS = 60_000
const HEALTH_POLL_MS = 200
/** A parse's whole request, the 30-second child deadline included. */
export const PARSER_REQUEST_MS = 120_000
/** An idle container stops after this long. */
export const PARSER_IDLE_MS = 300_000

const UNAVAILABLE: ParseServiceReply = { kind: 'retry', code: 'parser_unavailable' }
const RETRY_CODES: readonly string[] = ['parser_unavailable', 'parser_sandbox_unsupported', 'not_started']

/** The shape of a parse server reply; anything else is treated as no answer. */
export function isParseServiceReply(value: unknown): value is ParseServiceReply {
  if (typeof value !== 'object' || value === null) return false
  const reply = value as Record<string, unknown>
  if (reply.kind === 'retry') return typeof reply.code === 'string' && RETRY_CODES.includes(reply.code)
  if (reply.kind !== 'parsed') return false
  const record = reply.record as Record<string, unknown> | null | undefined
  const image = reply.image as Record<string, unknown> | null | undefined
  return (
    typeof record === 'object' && record !== null && typeof record.preview === 'object' && record.preview !== null && Array.isArray(record.candidates) &&
    (image === null || (typeof image === 'object' && image !== undefined && typeof image.base64 === 'string' && typeof image.format === 'string' && Number.isInteger(image.width) && Number.isInteger(image.height)))
  )
}

export class StatementParser extends DurableObject {
  private queue: Promise<unknown> = Promise.resolve()

  /** Parses one file, after any parse already running. Never throws: a parser that cannot answer asks to be retried. */
  parse(input: { format: ParseFormat; today: string; bytes: Uint8Array }): Promise<ParseServiceReply> {
    const run = this.queue.then(() => this.parseNow(input))
    this.queue = run.catch(() => undefined)
    return run
  }

  private async parseNow(input: { format: ParseFormat; today: string; bytes: Uint8Array }): Promise<ParseServiceReply> {
    const container = this.ctx.container
    if (!container) return UNAVAILABLE
    try {
      if (!container.running) {
        container.start({ entrypoint: PARSER_ENTRYPOINT, env: { NODE_ENV: 'production', TZ: 'UTC', PARSE_SERVER_PORT: String(PARSER_PORT) }, enableInternet: false })
      }
      const port = container.getTcpPort(PARSER_PORT)
      // Any HTTP answer will do: a 503 means the sandbox does not hold, and the parse then answers not_started.
      const started = Date.now()
      for (;;) {
        try {
          const health = await port.fetch('http://parser/health', { signal: AbortSignal.timeout(5_000) })
          await health.body?.cancel()
          break
        } catch {
          if (Date.now() - started >= PARSER_START_MS) return UNAVAILABLE
          await new Promise((resolve) => setTimeout(resolve, HEALTH_POLL_MS))
        }
      }
      await container.setInactivityTimeout(PARSER_IDLE_MS)
      const response = await port.fetch('http://parser/parse', {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream', 'x-jotbun-format': input.format, 'x-jotbun-today': input.today },
        body: input.bytes as Uint8Array<ArrayBuffer>,
        signal: AbortSignal.timeout(PARSER_REQUEST_MS),
      })
      if (response.status !== 200) {
        await response.body?.cancel()
        return UNAVAILABLE
      }
      const reply: unknown = await response.json()
      return isParseServiceReply(reply) ? reply : UNAVAILABLE
    } catch {
      return UNAVAILABLE
    }
  }
}
