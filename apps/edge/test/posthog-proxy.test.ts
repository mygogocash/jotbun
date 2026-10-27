import handler from '@tanstack/react-start/server-entry'
import { describe, expect, it, vi } from 'vitest'

import { POSTHOG_PROXY_BODY_LIMIT_BYTES, isPostHogProxyPath, proxyPostHog } from '../src/analytics/posthog-proxy'
import worker from '../src/server'

type Sent = { url: string; method: string; headers: Headers; body: string | undefined; redirect: RequestRedirect | undefined }

const upstreamAnswer = () => new Response('{"status":1}', { status: 200, headers: { 'content-type': 'application/json', 'set-cookie': 'ph_session=1; Path=/' } })

/** A fetch that records what it is asked to send and answers with `answer`. */
function recordingFetch(answer: () => Response = upstreamAnswer) {
  const sent: Sent[] = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = init?.body === undefined || init.body === null ? undefined : await new Response(init.body).text()
    sent.push({ url: String(input), method: init?.method ?? 'GET', headers: new Headers(init?.headers), body, redirect: init?.redirect })
    return answer()
  }) as typeof fetch
  return { fetchImpl, sent }
}

describe('the PostHog proxy on the Worker', () => {
  it('a batch is forwarded to PostHog EU with the same bytes, without cookies, auth, client addresses or app headers', async () => {
    const body = '{"api_key":"phc_test","batch":[]}'
    const { fetchImpl, sent } = recordingFetch()
    const response = await proxyPostHog(
      new Request('https://edge.test/ingest/batch/', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'a=1',
          authorization: 'Bearer x',
          'x-forwarded-for': '1.2.3.4',
          'cf-connecting-ip': '1.2.3.4',
          'cf-ipcountry': 'TH',
          'x-real-ip': '1.2.3.4',
          'x-gogospend-client': 'ios/1.0.0',
        },
        body,
      }),
      fetchImpl,
    )
    expect(sent).toHaveLength(1)
    expect(sent[0].url).toBe('https://eu.i.posthog.com/batch/')
    expect(sent[0].method).toBe('POST')
    expect(sent[0].body).toBe(body)
    expect(sent[0].redirect).toBe('manual')
    expect([...sent[0].headers.keys()]).toEqual(['content-type'])
    expect(sent[0].headers.get('content-type')).toBe('application/json')
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('{"status":1}')
    expect(response.headers.has('set-cookie')).toBe(false)
  })

  it('assets and remote config go to the asset host, with the query kept', async () => {
    const { fetchImpl, sent } = recordingFetch()
    await proxyPostHog(new Request('https://edge.test/ingest/static/recorder.js?v=1'), fetchImpl)
    await proxyPostHog(new Request('https://edge.test/ingest/array/phc_test/config'), fetchImpl)
    expect(sent.map((call) => [call.method, call.url])).toEqual([
      ['GET', 'https://eu-assets.i.posthog.com/static/recorder.js?v=1'],
      ['GET', 'https://eu-assets.i.posthog.com/array/phc_test/config'],
    ])
  })

  it('the target host never comes from the request', async () => {
    const { fetchImpl, sent } = recordingFetch()
    await proxyPostHog(new Request('https://edge.test/ingest/batch/', { method: 'POST', headers: { 'content-type': 'application/json', host: 'evil.example' }, body: '{}' }), fetchImpl)
    expect(sent).toHaveLength(1)
    expect(sent[0].url).toBe('https://eu.i.posthog.com/batch/')
    expect(sent[0].headers.has('host')).toBe(false)
  })

  it('a body over 5 MiB is 413 before anything is sent, by content-length or as it streams', async () => {
    const { fetchImpl, sent } = recordingFetch()
    const declared = await proxyPostHog(
      new Request('https://edge.test/ingest/batch/', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': String(POSTHOG_PROXY_BODY_LIMIT_BYTES + 1) },
        body: '{}',
      }),
      fetchImpl,
    )
    expect(declared.status).toBe(413)

    // Without a length, and 64 MiB long: a bounded reader stops about two chunks past the limit.
    const chunk = new Uint8Array(1024 * 1024)
    let pulled = 0
    let cancelled = false
    const streamed = new ReadableStream<Uint8Array>({
      pull: (controller) => {
        if (pulled >= 64 * chunk.byteLength) {
          controller.close()
          return
        }
        pulled += chunk.byteLength
        controller.enqueue(chunk)
      },
      cancel: () => {
        cancelled = true
      },
    })
    const undeclared = await proxyPostHog(
      new Request('https://edge.test/ingest/batch/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: streamed, duplex: 'half' } as RequestInit),
      fetchImpl,
    )
    expect(undeclared.status).toBe(413)
    expect(cancelled).toBe(true)
    expect(pulled).toBeLessThanOrEqual(POSTHOG_PROXY_BODY_LIMIT_BYTES + 2 * chunk.byteLength)
    expect(sent).toHaveLength(0)
  })

  it('a request body that cannot be read is 400, and nothing is sent', async () => {
    const { fetchImpl, sent } = recordingFetch()
    const broken = new ReadableStream<Uint8Array>({ pull: (controller) => controller.error(new Error('client gone')) })
    const response = await proxyPostHog(
      new Request('https://edge.test/ingest/batch/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: broken, duplex: 'half' } as RequestInit),
      fetchImpl,
    )
    expect(response.status).toBe(400)
    expect(sent).toHaveLength(0)
  })

  it('no other client-address header is forwarded either', async () => {
    const { fetchImpl, sent } = recordingFetch()
    await proxyPostHog(
      new Request('https://edge.test/ingest/batch/', {
        headers: {
          forwarded: 'for=1.2.3.4',
          'true-client-ip': '1.2.3.4',
          'x-client-ip': '1.2.3.4',
          'x-cluster-client-ip': '1.2.3.4',
          'x-originating-ip': '1.2.3.4',
          'x-remote-ip': '1.2.3.4',
          'x-remote-addr': '1.2.3.4',
          'fastly-client-ip': '1.2.3.4',
          'x-forwarded-proto': 'https',
        },
      }),
      fetchImpl,
    )
    expect(sent).toHaveLength(1)
    expect([...sent[0].headers.keys()]).toEqual([])
  })

  it('only GET, HEAD and POST under /ingest/ are proxied', async () => {
    const { fetchImpl, sent } = recordingFetch()
    const deleted = await proxyPostHog(new Request('https://edge.test/ingest/batch/', { method: 'DELETE' }), fetchImpl)
    expect(deleted.status).toBe(405)
    expect(deleted.headers.get('allow')).toBe('GET, HEAD, POST')
    expect(sent).toHaveLength(0)
    await proxyPostHog(new Request('https://edge.test/ingest/batch/', { method: 'HEAD' }), fetchImpl)
    expect(sent.map((call) => call.method)).toEqual(['HEAD'])
    expect(isPostHogProxyPath('/ingest/batch/')).toBe(true)
    expect(isPostHogProxyPath('/ingest')).toBe(false)
    expect(isPostHogProxyPath('/ingest/')).toBe(false)
    expect(isPostHogProxyPath('/ingestx/batch')).toBe(false)
    expect(isPostHogProxyPath('/v1/ingest/x')).toBe(false)
  })

  it('an unreachable PostHog is 502 with no body, and the log names only the failure class', async () => {
    const logged: string[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(' '))
    })
    try {
      const unreachable = (async () => {
        throw new TypeError('fetch failed')
      }) as typeof fetch
      const response = await proxyPostHog(new Request('https://edge.test/ingest/batch/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }), unreachable)
      expect(response.status).toBe(502)
      expect(response.body).toBeNull()
      expect(logged.map((line) => JSON.parse(line))).toEqual([{ level: 'error', event: 'posthog_proxy_failed', failure: 'TypeError' }])
      expect(logged.join('')).not.toContain('fetch failed')
    } finally {
      spy.mockRestore()
    }
  })
})

describe('the HTTP Worker dispatch', () => {
  it('sends /ingest/* to the proxy before TanStack Start, and every other path to TanStack Start with its arguments', async () => {
    const page = vi.spyOn(handler, 'fetch').mockImplementation(async () => new Response('a page'))
    const upstream = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('from PostHog'))
    vi.stubGlobal('fetch', upstream)
    try {
      const proxied = await worker.fetch(new Request('https://edge.test/ingest/batch/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }))
      expect(await proxied.text()).toBe('from PostHog')
      expect(String(upstream.mock.calls[0][0])).toBe('https://eu.i.posthog.com/batch/')
      expect(page).not.toHaveBeenCalled()

      const request = new Request('https://edge.test/some/page')
      const options = {}
      const answered = await worker.fetch(request, options)
      expect(await answered.text()).toBe('a page')
      expect(page).toHaveBeenCalledWith(request, options)
      expect(upstream).toHaveBeenCalledTimes(1)
    } finally {
      vi.unstubAllGlobals()
      page.mockRestore()
    }
  })
})
