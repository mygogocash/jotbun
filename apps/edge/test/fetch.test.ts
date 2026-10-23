import { describe, expect, it } from 'vitest'

import { makeWorkerFetch } from '../src/server/http/fetch'

/** A fetch that behaves like workerd's: `redirect: "error"` throws before anything is sent. */
function workerdLike(answer: () => Response) {
  const sent: RequestInit[] = []
  const base = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.redirect === 'error') throw new TypeError('Invalid redirect value, must be one of "follow" or "manual"')
    sent.push(init ?? {})
    return answer()
  }) as typeof fetch
  return { base, sent }
}

describe('workerFetch', () => {
  it('sends a never-follow request as manual and passes a normal answer through', async () => {
    const { base, sent } = workerdLike(() => new Response('{"ok":true}', { status: 200 }))
    const res = await makeWorkerFetch(base)('https://tenant.example/api/v2/users/x', { redirect: 'error', method: 'GET' })
    expect(await res.json()).toEqual({ ok: true })
    expect(sent.map((init) => [init.redirect, init.method])).toEqual([['manual', 'GET']])
  })

  it('rejects a redirect as the Fetch standard does, never following it', async () => {
    const { base, sent } = workerdLike(() => new Response(null, { status: 302, headers: { location: 'https://elsewhere.example/' } }))
    await expect(makeWorkerFetch(base)('https://tenant.example/oauth/token', { redirect: 'error', method: 'POST' })).rejects.toBeInstanceOf(TypeError)
    expect(sent).toHaveLength(1)
  })

  it('leaves every other request as it is', async () => {
    const { base, sent } = workerdLike(() => new Response(null, { status: 301 }))
    expect((await makeWorkerFetch(base)('https://catalogue.example/', { redirect: 'manual' })).status).toBe(301)
    expect((await makeWorkerFetch(base)('https://catalogue.example/')).status).toBe(301)
    expect(sent.map((init) => init.redirect)).toEqual(['manual', undefined])
  })
})
