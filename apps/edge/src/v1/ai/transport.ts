import Anthropic from '@anthropic-ai/sdk'
import type { AiFeature } from '@gogospend/contracts'

import type { MessageParams, ModelMessage } from '../../server/ai/model'
import { flag } from '../../server/env'
import type { V1Env } from '../env'

export const AI_GATEWAY_HEADERS = {
  'cf-aig-collect-log': 'false',
  'cf-aig-skip-cache': 'true',
} as const

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
  const defaultHeaders: Record<string, string> = {
    ...AI_GATEWAY_HEADERS,
    ...(config.gatewayToken ? { 'cf-aig-authorization': `Bearer ${config.gatewayToken}` } : {}),
  }
  const client = new Anthropic({
    apiKey: config.apiKey,
    baseURL: config.baseURL || undefined,
    maxRetries: 0,
    defaultHeaders,
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
  env: Pick<V1Env, 'AI_ENABLED' | 'ANTHROPIC_API_KEY' | 'ANTHROPIC_BASE_URL' | 'AI_GATEWAY_TOKEN'>
): ModelTransport | null {
  if (!flag(env.AI_ENABLED) || !env.ANTHROPIC_API_KEY) return null
  return anthropicTransport({
    apiKey: env.ANTHROPIC_API_KEY,
    baseURL: env.ANTHROPIC_BASE_URL,
    gatewayToken: env.AI_GATEWAY_TOKEN,
  })
}

export type CallFailure = 'rate_limited' | 'server_error' | 'timeout' | 'no_connection' | 'rejected' | 'other'

export class DeadlinePassed extends Error {
  constructor(message = 'The AI deadline passed before the call could complete.') {
    super(message)
    this.name = 'DeadlinePassed'
  }
}

export function callFailure(error: unknown): CallFailure {
  if (
    error instanceof DeadlinePassed ||
    error instanceof Anthropic.APIUserAbortError ||
    error instanceof Anthropic.APIConnectionTimeoutError
  ) {
    return 'timeout'
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return 'no_connection'
  }
  if (error instanceof Anthropic.APIError) {
    if (error.status === 429) return 'rate_limited'
    if (typeof error.status === 'number' && error.status >= 500) return 'server_error'
    return 'rejected'
  }
  return 'other'
}

export class AiDeadline {
  private readonly end: number

  constructor(totalMs: number, readonly now: () => number = () => Date.now()) {
    this.end = now() + totalMs
  }

  remainingMs(): number {
    return Math.max(0, this.end - this.now())
  }

  child(capMs: number): AiDeadline {
    return new AiDeadline(Math.min(this.remainingMs(), capMs), this.now)
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

function parseRetryAfter(error: unknown): number | null {
  if (!(error instanceof Anthropic.APIError)) return null
  const header = error.headers?.get?.('retry-after') ?? (error.headers as Record<string, string> | undefined)?.['retry-after']
  if (!header) return null
  const seconds = parseInt(String(header), 10)
  return Number.isInteger(seconds) && seconds >= 1 && seconds <= 3_600 ? seconds : null
}

export async function tracedSend(
  transport: ModelTransport,
  trace: AiTrace,
  deadline: AiDeadline,
  call: { feature: AiFeature; escalated: boolean; params: MessageParams; capMs?: number }
): Promise<ModelMessage> {
  const availableMs = deadline.remainingMs()
  const callTime = call.capMs !== undefined ? Math.min(availableMs, call.capMs) : availableMs

  if (callTime < MIN_CALL_MS) {
    trace.calls.push({
      spanId: crypto.randomUUID(),
      feature: call.feature,
      requested: call.params.model,
      model: call.params.model,
      escalated: call.escalated,
      latencyMs: 0,
      sent: false,
      httpStatus: null,
      retryAfterSeconds: null,
      failure: 'timeout',
      stopReason: null,
      usage: null,
    })
    throw new DeadlinePassed()
  }

  const start = deadline.now()
  try {
    const message = await transport.send(call.params, { timeoutMs: callTime })
    const latencyMs = Math.max(0, deadline.now() - start)
    const usage = message.usage
      ? {
          input: message.usage.input_tokens,
          output: message.usage.output_tokens,
          cacheRead: (message.usage as unknown as { cache_read_input_tokens?: number | null }).cache_read_input_tokens ?? 0,
          cacheWrite: (message.usage as unknown as { cache_creation_input_tokens?: number | null }).cache_creation_input_tokens ?? 0,
        }
      : null
    trace.calls.push({
      spanId: crypto.randomUUID(),
      feature: call.feature,
      requested: call.params.model,
      model: message.model || call.params.model,
      escalated: call.escalated,
      latencyMs,
      sent: true,
      httpStatus: 200,
      retryAfterSeconds: null,
      failure: null,
      stopReason: message.stop_reason ?? null,
      usage,
    })
    return message
  } catch (error) {
    const latencyMs = Math.max(0, deadline.now() - start)
    const httpStatus = error instanceof Anthropic.APIError && typeof error.status === 'number' ? error.status : null
    trace.calls.push({
      spanId: crypto.randomUUID(),
      feature: call.feature,
      requested: call.params.model,
      model: call.params.model,
      escalated: call.escalated,
      latencyMs,
      sent: true,
      httpStatus,
      retryAfterSeconds: parseRetryAfter(error),
      failure: callFailure(error),
      stopReason: null,
      usage: null,
    })
    throw error
  }
}
