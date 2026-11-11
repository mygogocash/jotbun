import Anthropic from '@anthropic-ai/sdk'
import type { AiFeature } from '@gogospend/contracts'

import type { MessageParams, ModelMessage } from '../../server/ai/model'
import type { V1Env } from '../env'

export const AI_GATEWAY_HEADERS = { 'cf-aig-collect-log': 'false', 'cf-aig-skip-cache': 'true' } as const

export const MIN_CALL_MS = 2_000

export type ModelTransport = {
  send(params: MessageParams, options: { timeoutMs: number }): Promise<ModelMessage>
}

export function anthropicTransport(config: {
  apiKey: string
  baseURL?: string
  gatewayToken?: string
  fetch?: typeof fetch
}): ModelTransport {
  // STUB: sends no headers
  const client = new Anthropic({
    apiKey: config.apiKey,
    baseURL: config.baseURL || undefined,
    maxRetries: 0,
    defaultHeaders: {},
    fetch: config.fetch,
  })
  return {
    send(params: MessageParams, options: { timeoutMs: number }): Promise<ModelMessage> {
      return client.beta.messages.create(params, {
        timeout: options.timeoutMs,
        signal: AbortSignal.timeout(options.timeoutMs),
      })
    },
  }
}

export function transportFromEnv(
  _env: Pick<V1Env, 'AI_ENABLED' | 'ANTHROPIC_API_KEY' | 'ANTHROPIC_BASE_URL' | 'AI_GATEWAY_TOKEN'>
): ModelTransport | null {
  // STUB: returns null
  return null
}

export type CallFailure = 'rate_limited' | 'server_error' | 'timeout' | 'no_connection' | 'rejected' | 'other'

export class DeadlinePassed extends Error {
  constructor(message = 'The AI deadline passed before the call could complete.') {
    super(message)
    this.name = 'DeadlinePassed'
  }
}

export function callFailure(_error: unknown): CallFailure {
  // STUB: returns 'other'
  return 'other'
}

export class AiDeadline {
  constructor(_totalMs: number, readonly now: () => number = () => Date.now()) {}

  remainingMs(): number {
    return 0
  }

  child(_capMs: number): AiDeadline {
    return new AiDeadline(0, this.now)
  }
}

export type RecordedCall = {
  spanId: string
  feature: AiFeature
  requested: string
  model: string
  escalated: boolean
  latencyMs: number
  sent: boolean
  httpStatus: number | null
  retryAfterSeconds: number | null
  failure: CallFailure | null
  stopReason: string | null
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number } | null
}

export type AiTrace = {
  readonly id: string
  readonly calls: RecordedCall[]
  analytics: 'yes' | 'no' | 'unasked'
}

export function newTrace(): AiTrace {
  return { id: crypto.randomUUID(), calls: [], analytics: 'unasked' }
}

export async function tracedSend(
  transport: ModelTransport,
  _trace: AiTrace,
  _deadline: AiDeadline,
  call: { feature: AiFeature; escalated: boolean; params: MessageParams; capMs?: number }
): Promise<ModelMessage> {
  // STUB: records nothing
  return transport.send(call.params, { timeoutMs: 25_000 })
}
