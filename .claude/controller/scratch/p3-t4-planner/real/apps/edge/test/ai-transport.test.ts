import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it } from 'vitest'

import type { MessageParams, ModelMessage } from '../src/server/ai/model'
import {
  AI_GATEWAY_HEADERS,
  AiDeadline,
  DeadlinePassed,
  anthropicTransport,
  callFailure,
  newTrace,
  tracedSend,
  transportFromEnv,
} from '../src/v1/ai/transport'

const sampleParams: MessageParams = {
  model: 'claude-haiku-5-5',
  max_tokens: 100,
  messages: [{ role: 'user', content: 'hello' }],
}

const sampleResponse = (overrides: Partial<ModelMessage> = {}): ModelMessage =>
  ({
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-5-5',
    content: [{ type: 'text', text: 'response', citations: null }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
    ...overrides,
  }) as ModelMessage

describe('P3-T4: The gateway transport, one deadline per request and the call trace', () => {
  it('every request goes to the gateway with logging and caching off', async () => {
    let capturedUrl: string | undefined
    let capturedHeaders: HeadersInit | undefined

    const recordingFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      capturedUrl = String(url)
      capturedHeaders = init?.headers
      return new Response(JSON.stringify(sampleResponse()), {
        headers: { 'content-type': 'application/json' },
      })
    }

    const transport = anthropicTransport({
      apiKey: 'sk-test',
      baseURL: 'https://gateway.ai.cloudflare.com/v1/acct/gw/anthropic',
      fetch: recordingFetch,
    })

    const reply = await transport.send(sampleParams, { timeoutMs: 5_000 })
    expect(reply.id).toBe('msg_test')

    expect(capturedUrl).toBeDefined()
    expect(capturedUrl!).toMatch(/^https:\/\/gateway\.ai\.cloudflare\.com\/v1\/acct\/gw\/anthropic\/v1\/messages/)

    const headers = new Headers(capturedHeaders)
    expect(headers.get('cf-aig-collect-log')).toBe('false')
    expect(headers.get('cf-aig-skip-cache')).toBe('true')
    expect(headers.get('cf-aig-authorization')).toBeNull()
    const authOrKey = headers.get('authorization') ?? headers.get('x-api-key')
    expect(authOrKey === 'Bearer sk-test' || authOrKey === 'sk-test').toBe(true)
  })

  it('the gateway token is sent only when set', async () => {
    let capturedHeadersWithToken: HeadersInit | undefined
    let capturedHeadersWithoutToken: HeadersInit | undefined

    const fetchWithToken = async (_url: unknown, init?: RequestInit): Promise<Response> => {
      capturedHeadersWithToken = init?.headers
      return new Response(JSON.stringify(sampleResponse()), { headers: { 'content-type': 'application/json' } })
    }
    const fetchWithoutToken = async (_url: unknown, init?: RequestInit): Promise<Response> => {
      capturedHeadersWithoutToken = init?.headers
      return new Response(JSON.stringify(sampleResponse()), { headers: { 'content-type': 'application/json' } })
    }

    const withToken = anthropicTransport({
      apiKey: 'sk-test',
      gatewayToken: 't0k',
      fetch: fetchWithToken,
    })
    await withToken.send(sampleParams, { timeoutMs: 5_000 })
    expect(new Headers(capturedHeadersWithToken).get('cf-aig-authorization')).toBe('Bearer t0k')

    const withoutToken = anthropicTransport({
      apiKey: 'sk-test',
      fetch: fetchWithoutToken,
    })
    await withoutToken.send(sampleParams, { timeoutMs: 5_000 })
    expect(new Headers(capturedHeadersWithoutToken).get('cf-aig-authorization')).toBeNull()
  })

  it('a call that outlives its time fails as a timeout and is recorded', async () => {
    const hangingFetch = async (_url: unknown, init?: RequestInit): Promise<Response> => {
      return new Promise<Response>((_resolve, reject) => {
        if (init?.signal) {
          if (init.signal.aborted) {
            reject(new DOMException('The operation was aborted.', 'AbortError'))
          } else {
            init.signal.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'))
            })
          }
        }
      })
    }

    const transport = anthropicTransport({
      apiKey: 'sk-test',
      fetch: hangingFetch,
    })

    const trace = newTrace()
    const deadline = new AiDeadline(2_100)
    const start = Date.now()

    let caught: unknown
    try {
      await tracedSend(transport, trace, deadline, {
        feature: 'parse',
        escalated: false,
        params: sampleParams,
      })
    } catch (error) {
      caught = error
    }

    const elapsedMs = Date.now() - start
    expect(elapsedMs).toBeLessThan(3_000)
    expect(caught).toBeDefined()
    expect(callFailure(caught)).toBe('timeout')

    expect(trace.calls).toHaveLength(1)
    const [call] = trace.calls
    expect(call.sent).toBe(true)
    expect(call.failure).toBe('timeout')
    expect(call.httpStatus).toBeNull()
  })

  it('a rate limit fails at once as rate_limited with its wait', async () => {
    let fetchCount = 0
    const rateLimitFetch = async (): Promise<Response> => {
      fetchCount += 1
      return new Response(JSON.stringify({ error: { message: 'Too many requests' } }), {
        status: 429,
        headers: { 'content-type': 'application/json', 'retry-after': '40' },
      })
    }

    const transport = anthropicTransport({
      apiKey: 'sk-test',
      fetch: rateLimitFetch,
    })

    const trace = newTrace()
    const deadline = new AiDeadline(25_000)
    const start = Date.now()

    let caught: unknown
    try {
      await tracedSend(transport, trace, deadline, {
        feature: 'parse',
        escalated: false,
        params: sampleParams,
      })
    } catch (error) {
      caught = error
    }

    const elapsedMs = Date.now() - start
    expect(elapsedMs).toBeLessThan(2_000)
    expect(fetchCount).toBe(1)
    expect(caught).toBeDefined()
    expect(callFailure(caught)).toBe('rate_limited')

    expect(trace.calls).toHaveLength(1)
    const [call] = trace.calls
    expect(call.sent).toBe(true)
    expect(call.httpStatus).toBe(429)
    expect(call.retryAfterSeconds).toBe(40)
    expect(call.failure).toBe('rate_limited')
  })

  it('a request with less than 2 s left makes no call', async () => {
    let fetchCalled = false
    const recordingFetch = async (): Promise<Response> => {
      fetchCalled = true
      return new Response(JSON.stringify(sampleResponse()), { headers: { 'content-type': 'application/json' } })
    }

    const transport = anthropicTransport({
      apiKey: 'sk-test',
      fetch: recordingFetch,
    })

    const trace = newTrace()
    const deadline = new AiDeadline(1_000)

    let caught: unknown
    try {
      await tracedSend(transport, trace, deadline, {
        feature: 'slip',
        escalated: false,
        params: sampleParams,
      })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(DeadlinePassed)
    expect(fetchCalled).toBe(false)
    expect(trace.calls).toHaveLength(1)
    const [call] = trace.calls
    expect(call.sent).toBe(false)
    expect(call.failure).toBe('timeout')
    expect(call.httpStatus).toBeNull()
  })

  it('a child deadline ends at the earlier of its cap and its parent', () => {
    let clock = 100_000
    const parent1 = new AiDeadline(55_000, () => clock)
    const child1 = parent1.child(25_000)
    expect(child1.remainingMs()).toBe(25_000)

    let clock2 = 100_000
    const parent2 = new AiDeadline(45_000, () => clock2)
    clock2 += 40_000
    const child2 = parent2.child(25_000)
    expect(child2.remainingMs()).toBe(5_000)
  })

  it('callFailure names each failure', () => {
    expect(callFailure(new DeadlinePassed())).toBe('timeout')
    expect(callFailure(new Anthropic.APIUserAbortError())).toBe('timeout')
    expect(callFailure(new Anthropic.APIConnectionTimeoutError())).toBe('timeout')
    expect(callFailure(new Anthropic.APIConnectionError({ message: 'connection dropped' }))).toBe('no_connection')
    expect(callFailure(Anthropic.APIError.generate(429, { error: { message: 'rate limit' } }, 'Rate limit', new Headers()))).toBe('rate_limited')
    expect(callFailure(Anthropic.APIError.generate(529, { error: { message: 'overloaded' } }, 'Overloaded', new Headers()))).toBe('server_error')
    expect(callFailure(Anthropic.APIError.generate(500, { error: { message: 'internal' } }, 'Server error', new Headers()))).toBe('server_error')
    expect(callFailure(Anthropic.APIError.generate(400, { error: { message: 'bad request' } }, 'Bad request', new Headers()))).toBe('rejected')
    expect(callFailure(new Error('something else'))).toBe('other')
  })

  it('the trace keeps the reply\'s model, status, stop reason and tokens', async () => {
    const rawReply = {
      id: 'msg_haiku',
      type: 'message' as const,
      role: 'assistant' as const,
      model: 'claude-haiku-5-5',
      content: [{ type: 'text' as const, text: 'done', citations: null }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: 120,
        output_tokens: 40,
        cache_read_input_tokens: 10,
        cache_creation_input_tokens: null,
      },
    }

    const transport = {
      send: async () => rawReply as unknown as ModelMessage,
    }

    const trace = newTrace()
    const deadline = new AiDeadline(25_000)

    const reply = await tracedSend(transport, trace, deadline, {
      feature: 'parse',
      escalated: false,
      params: { model: 'requested-model', max_tokens: 100, messages: [{ role: 'user', content: 'test' }] },
    })

    expect(reply.model).toBe('claude-haiku-5-5')
    expect(trace.calls).toHaveLength(1)
    const [call] = trace.calls
    expect(call.model).toBe('claude-haiku-5-5')
    expect(call.requested).toBe('requested-model')
    expect(call.httpStatus).toBe(200)
    expect(call.stopReason).toBe('end_turn')
    expect(call.usage).toEqual({ input: 120, output: 40, cacheRead: 10, cacheWrite: 0 })
    expect(call.failure).toBeNull()
    expect(call.sent).toBe(true)
  })

  it('transportFromEnv is null unless AI is on and keyed', () => {
    expect(transportFromEnv({ AI_ENABLED: 'false', ANTHROPIC_API_KEY: 'sk-test' })).toBeNull()
    expect(transportFromEnv({ AI_ENABLED: 'true' })).toBeNull()
    expect(transportFromEnv({ AI_ENABLED: 'true', ANTHROPIC_API_KEY: '' })).toBeNull()
    expect(transportFromEnv({ AI_ENABLED: '0', ANTHROPIC_API_KEY: 'sk-test' })).toBeNull()

    const enabled = transportFromEnv({ AI_ENABLED: 'true', ANTHROPIC_API_KEY: 'sk-test' })
    expect(enabled).not.toBeNull()
    expect(typeof enabled?.send).toBe('function')

    const enabled1 = transportFromEnv({ AI_ENABLED: '1', ANTHROPIC_API_KEY: 'sk-test' })
    expect(enabled1).not.toBeNull()
  })
})
