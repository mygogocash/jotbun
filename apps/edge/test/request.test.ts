import { describe, expect, it } from 'vitest'

import { V1_ROUTES, matchRoute } from '../src/server/app/routes'
import { BodyError, JSON_BODY_LIMIT_BYTES, RAW_JSON_BODY_LIMIT_BYTES, queryOf, readJsonBody, readRawJsonBody, reqLike } from '../src/server/http/request'

const post = (body: string | undefined, type = 'application/json', extra: Record<string, string> = {}) =>
  new Request('http://edge.test/v1/x', { method: 'POST', headers: { 'content-type': type, ...extra }, body })

describe('readJsonBody, like express.json({ strict: true })', () => {
  it('parses objects and arrays', async () => {
    expect(await readJsonBody(post('{"a":1}'))).toEqual({ a: 1 })
    expect(await readJsonBody(post(' [1,2]'))).toEqual([1, 2])
    expect(await readJsonBody(post('{"a":1}', 'application/json; charset=utf-8'))).toEqual({ a: 1 })
  })

  it('an empty JSON body is {}; no body is undefined', async () => {
    expect(await readJsonBody(post(''))).toEqual({})
    expect(await readJsonBody(new Request('http://edge.test/v1/x'))).toBeUndefined()
  })

  it('other content types are not parsed', async () => {
    expect(await readJsonBody(post('{"a":1}', 'text/plain'))).toBeUndefined()
    expect(await readJsonBody(post('{"a":1}', 'application/vnd.api+json'))).toBeUndefined()
  })

  it.each(['"text"', '42', 'true', 'null', '{"a":', '{bad}'])('refuses %s as invalid', async (body) => {
    await expect(readJsonBody(post(body))).rejects.toEqual(new BodyError('invalid'))
  })

  it('refuses a body over the limit, by header or by size', async () => {
    await expect(readJsonBody(post('{}', 'application/json', { 'content-length': String(JSON_BODY_LIMIT_BYTES + 1) }))).rejects.toEqual(new BodyError('too_large'))
    await expect(readJsonBody(post(`{"a":"${'x'.repeat(32)}"}`), 16)).rejects.toEqual(new BodyError('too_large'))
  })
})

describe('readRawJsonBody, like jsonBody(\'8kb\', { keepRaw: true })', () => {
  const post = (body: string, type = 'application/json') => new Request('http://edge.test/v1/auth/provider-events', { method: 'POST', headers: { 'content-type': type }, body })

  it('keeps the exact bytes it parsed', async () => {
    const text = '{ "id" : "evt_12345678" }'
    const read = await readRawJsonBody(post(text))
    expect(read.body).toEqual({ id: 'evt_12345678' })
    expect(new TextDecoder().decode(read.raw)).toBe(text)
  })

  it('reads nothing that is not JSON, so there are no bytes to verify', async () => {
    expect(await readRawJsonBody(post('id=1', 'application/x-www-form-urlencoded'))).toEqual({ body: undefined, raw: undefined })
  })

  it('refuses more than 8 KiB', async () => {
    await expect(readRawJsonBody(post(JSON.stringify({ x: 'y'.repeat(RAW_JSON_BODY_LIMIT_BYTES) })))).rejects.toEqual(new BodyError('too_large'))
  })
})

describe('queryOf, like Express 5’s simple query parser', () => {
  it('keeps single values as strings and repeats as arrays', () => {
    expect(queryOf(new URL('http://e/v1/history?from=2026-10-01&type=a&type=b&q=a+b'))).toEqual({ from: '2026-10-01', type: ['a', 'b'], q: 'a b' })
  })
})

describe('reqLike', () => {
  it('lowercases headers and takes the address from CF-Connecting-IP only', () => {
    const r = reqLike(new Request('http://e/', { method: 'get', headers: { 'X-GoGoSpend-Client': 'ios/1.0.0', 'CF-Connecting-IP': '203.0.113.9', 'X-Forwarded-For': '198.51.100.1' } }))
    expect(r).toMatchObject({ method: 'GET', ip: '203.0.113.9' })
    expect(r.headers['x-gogospend-client']).toBe('ios/1.0.0')
  })
})

describe('matchRoute, like Express’s default router', () => {
  const id = '3b1d0c6e-4f7a-4c55-9d1e-2a6f8b9c0d1e'

  it('matches literals case-insensitively and an optional trailing slash', () => {
    expect(matchRoute(V1_ROUTES, 'GET', '/V1/Wallets/')?.route.path).toBe('/v1/wallets')
  })

  it('decodes params and keeps their case', () => {
    expect(matchRoute(V1_ROUTES, 'GET', `/v1/wallets/${id.toUpperCase()}`)?.params).toEqual({ id: id.toUpperCase() })
    expect(matchRoute(V1_ROUTES, 'GET', '/v1/budgets/2026%2D10')?.params).toEqual({ month: '2026-10' })
  })

  it('prefers the literal route over a parameter and keeps methods apart', () => {
    expect(matchRoute(V1_ROUTES, 'GET', '/v1/history/deleted')?.route.path).toBe('/v1/history/deleted')
    expect(matchRoute(V1_ROUTES, 'POST', '/v1/categories/builtins')?.route.path).toBe('/v1/categories/builtins')
    expect(matchRoute(V1_ROUTES, 'DELETE', '/v1/wallets/x')).toBeNull()
  })

  it('serves HEAD from the GET route and refuses malformed escapes', () => {
    expect(matchRoute(V1_ROUTES, 'HEAD', '/v1/wallets')?.route.method).toBe('GET')
    expect(matchRoute(V1_ROUTES, 'GET', '/v1/wallets/%E0%A4%A')).toBeNull()
  })

  it('does not match a deeper path or an empty segment', () => {
    expect(matchRoute(V1_ROUTES, 'GET', '/v1/wallets/a/b')).toBeNull()
    expect(matchRoute(V1_ROUTES, 'GET', '/v1/transactions//')).toBeNull()
  })
})
