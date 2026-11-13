import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { matchRoute } from '../src/v1/match'
import type { VaultRouteId } from '../src/v1/protocol'
import { VAULT_ADDED_ROUTES, VAULT_DEFERRED_ROUTES, VAULT_EDGE_ONLY_ROUTES, VAULT_PENDING_ROUTES, VAULT_RETIRED_ROUTES, VAULT_STEP_ROUTES, VAULT_V1_ROUTES, vaultStatus } from '../src/v1/routes'
import { WORKER_HANDLERS } from '../src/v1/worker-routes'
import { VAULT_HANDLERS } from '../src/vault/routes'

// Every NestJS v1 route sits in exactly one place in the vault's route table
// (C1: the one Worker serves /v1 from the UserVault): served, deferred to 1C,
// or retired by §6.4. The routes NestJS never had are the edge-only ones (the
// AI companion and the bridge) and the added ones (1D). vault-route-coverage
// checked the same against the PostgreSQL edge's table, which retired.
const API_SRC = fileURLToPath(new URL('../../api/src/', import.meta.url))
const EDGE = fileURLToPath(new URL('../', import.meta.url))
/** wrangler.jsonc as c1-shape.test.ts reads it: every comment is on a line of its own. */
const wranglerVars = (): Record<string, string> =>
  JSON.parse(
    readFileSync(join(EDGE, 'wrangler.jsonc'), 'utf8')
      .split('\n')
      .filter((line) => !/^\s*\/\//.test(line))
      .join('\n'),
  ).vars

type NestRoute = { key: string; access: string | undefined; gates: string[]; status: number }

function controllers(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'spend' || name === 'testing' ? [] : controllers(path)
    return name.endsWith('.controller.ts') ? [path] : []
  })
}

const join2 = (...parts: string[]) => `/${parts.filter(Boolean).join('/')}`.replace(/\/+/g, '/').replace(/(.)\/$/, '$1')

/**
 * Reads the v1 controllers' decorators as written (they follow one layout:
 * `@Controller(base)`, then per handler an HTTP-method decorator followed by
 * `@Access`, optional `@Gated` and `@HttpCode` before the method).
 */
function nestRoutes(): NestRoute[] {
  const routes: NestRoute[] = []
  for (const file of controllers(API_SRC)) {
    const text = readFileSync(file, 'utf8')
    const base = /@Controller\((?:'([^']*)')?\)/.exec(text)?.[1] ?? ''
    const blocks = text.split(/\n(?=\s*@(?:Get|Post|Put|Patch|Delete)\()/)
    for (const block of blocks.slice(1)) {
      const head = /^\s*@(Get|Post|Put|Patch|Delete)\((?:'([^']*)')?\)/.exec(block)
      if (!head) continue
      const decorators = block.slice(0, block.search(/\n\s*(?:async\s+)?[a-zA-Z]+\(/) + 1)
      const method = head[1].toUpperCase()
      const access = /@Access\('([a-z_]+)'\)/.exec(decorators)?.[1]
      const gates = [...(/@Gated\(([^)]*)\)/.exec(decorators)?.[1] ?? '').matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort()
      const code = /@HttpCode\((\d+)\)/.exec(decorators)?.[1]
      routes.push({ key: `${method} ${join2(base, head[2] ?? '')}`, access, gates, status: code ? Number(code) : method === 'POST' ? 201 : 200 })
    }
  }
  return routes
}

const keyOf = (route: { method: string; path: string }) => `${route.method} ${route.path}`

describe('the one Worker covers every NestJS v1 route', () => {
  const nest = nestRoutes()
  const nestByKey = new Map(nest.map((r) => [r.key, r]))
  // /live and /ready are the Worker's own TanStack Start routes (src/routes; c1-worker.db.test.ts).
  const health = new Set(['GET /live', 'GET /ready'])
  const served = VAULT_V1_ROUTES.map(keyOf)

  function placementsOf(key: string): string[] {
    return [
      served.includes(key) ? 'served' : null,
      VAULT_DEFERRED_ROUTES.includes(key) ? 'deferred' : null,
      VAULT_RETIRED_ROUTES.includes(key) ? 'retired' : null,
    ].filter((place): place is string => place !== null)
  }

  it('reads a plausible number of routes from the controllers', () => {
    expect(nest.length).toBeGreaterThanOrEqual(58)
    expect(nest.every((r) => r.access !== undefined)).toBe(true)
  })

  it('places every NestJS route in exactly one of the served, deferred and retired sets', () => {
    const misplaced = nest.filter((r) => !health.has(r.key) && placementsOf(r.key).length !== 1).map((r) => `${r.key}: ${placementsOf(r.key).join(', ') || 'nowhere'}`)
    expect(misplaced).toEqual([])
    expect(VAULT_PENDING_ROUTES).toEqual([])
  })

  it('lists each route once, and nothing NestJS lacks but the edge-only and the added routes', () => {
    const listed = [...served, ...VAULT_DEFERRED_ROUTES, ...VAULT_RETIRED_ROUTES]
    expect(new Set(listed).size).toBe(listed.length)
    expect(listed.filter((key) => !nestByKey.has(key)).sort()).toEqual([...VAULT_EDGE_ONLY_ROUTES, ...VAULT_ADDED_ROUTES].sort())
    expect(VAULT_EDGE_ONLY_ROUTES.filter((key) => VAULT_ADDED_ROUTES.includes(key))).toEqual([])
  })

  it('keeps each served NestJS route’s access class, gates and status', () => {
    const drift = VAULT_V1_ROUTES.flatMap((route) => {
      const theirs = nestByKey.get(keyOf(route))
      if (!theirs) return []
      const mine = { access: route.access, gates: [...(route.gates ?? [])].sort(), status: vaultStatus(route) }
      const reference = { access: theirs.access, gates: theirs.gates, status: theirs.status }
      return JSON.stringify(mine) === JSON.stringify(reference) ? [] : [`${keyOf(route)}: vault ${JSON.stringify(mine)} nest ${JSON.stringify(reference)}`]
    })
    expect(drift).toEqual([])
  })

  it('defers exactly the two deletion routes to 1C (B16), and retires exactly the six routes §6.4 retires', () => {
    expect([...VAULT_DEFERRED_ROUTES].sort()).toEqual(['POST /v1/auth/deletion-receipt', 'POST /v1/me/deletion'])
    expect([...VAULT_RETIRED_ROUTES].sort()).toEqual(['POST /v1/auth/bootstrap', 'POST /v1/auth/challenges', 'POST /v1/auth/proofs', 'POST /v1/auth/provider-events', 'POST /v1/me/global-logout', 'POST /v1/me/identities'])
  })

  it('serves the seven AI and bridge routes and the added ones, and no NestJS route shadows them', () => {
    expect([...VAULT_EDGE_ONLY_ROUTES].sort()).toEqual([
      'GET /v1/ai/note',
      'GET /v1/bridge/gogocash/catalogue',
      'GET /v1/me/ai-preferences',
      'POST /v1/ai/ask',
      'POST /v1/ai/parse',
      'POST /v1/ai/slip',
      'PUT /v1/me/ai-preferences',
    ])
    expect(VAULT_ADDED_ROUTES).toContain('GET /v1/sync/live')
    const nestTable = nest.map((r) => {
      const [method, path] = r.key.split(' ')
      return { method, path }
    })
    for (const key of [...VAULT_EDGE_ONLY_ROUTES, ...VAULT_ADDED_ROUTES]) {
      const [method, path] = key.split(' ')
      expect(matchRoute(VAULT_V1_ROUTES, method, path)?.route, key).toMatchObject({ method, path })
      expect(matchRoute(nestTable, method, path), key).toBeNull()
    }
  })

  it('each served route is one vault call or one Worker route with its handler, and a step id is only a vault call', () => {
    for (const route of VAULT_V1_ROUTES) {
      const key = keyOf(route)
      // The public policy list is answered by the front door; a live route (1D-T10) by UserVault#fetch.
      if (key === 'GET /v1/policies' || route.live) {
        expect([route.vault, route.worker], key).toEqual([undefined, undefined])
        continue
      }
      expect(Number(route.vault !== undefined) + Number(route.worker !== undefined), key).toBe(1)
      if (route.vault) expect(VAULT_HANDLERS[route.vault], route.vault).toBeTypeOf('function')
      if (route.worker) expect(WORKER_HANDLERS[route.worker], route.worker).toBeTypeOf('function')
    }
    for (const id of Object.keys(VAULT_STEP_ROUTES) as VaultRouteId[]) {
      expect(VAULT_HANDLERS[id], id).toBeTypeOf('function')
      expect(VAULT_V1_ROUTES.some((route) => route.vault === id), id).toBe(false)
    }
  })

  it('a live route has neither a vault call nor a Worker handler, and is an added route', () => {
    const live = VAULT_V1_ROUTES.filter((route) => route.live)
    expect(live.map(keyOf)).toEqual(['GET /v1/sync/live'])
    for (const route of live) {
      expect(route).toEqual({ method: 'GET', path: '/v1/sync/live', access: 'bound_session', live: true })
      expect(VAULT_ADDED_ROUTES).toContain(keyOf(route))
    }
  })

  it('GET /v1/me/analytics is an added route with a vault handler (1D-T11)', () => {
    expect(VAULT_ADDED_ROUTES).toContain('GET /v1/me/analytics')
    expect(VAULT_V1_ROUTES.filter((route) => keyOf(route) === 'GET /v1/me/analytics')).toEqual([{ method: 'GET', path: '/v1/me/analytics', access: 'bound_session', vault: 'me.analytics' }])
    expect(VAULT_HANDLERS['me.analytics']).toBeTypeOf('function')
  })

  it('the slip salt and slip accounts are added routes, and only the accounts wait for SLIP_IMPORT_ENABLED, a var wrangler.jsonc keeps off (P4-T3, S13)', () => {
    expect([...VAULT_ADDED_ROUTES].sort()).toEqual(['GET /v1/me/analytics', 'GET /v1/slip-accounts', 'GET /v1/slips/salt', 'GET /v1/sync/live', 'PUT /v1/slip-accounts/:id'])
    expect(VAULT_V1_ROUTES.filter((route) => route.path.startsWith('/v1/slip'))).toEqual([
      { method: 'GET', path: '/v1/slips/salt', access: 'bound_session', vault: 'slips.salt' },
      { method: 'GET', path: '/v1/slip-accounts', access: 'bound_session', vault: 'slipAccounts.list', release: 'SLIP_IMPORT_ENABLED' },
      { method: 'PUT', path: '/v1/slip-accounts/:id', access: 'current_policy', vault: 'slipAccounts.update', gates: ['imports'], status: 200, release: 'SLIP_IMPORT_ENABLED' },
    ])
    for (const id of ['slips.salt', 'slipAccounts.list', 'slipAccounts.update'] as const) expect(VAULT_HANDLERS[id], id).toBeTypeOf('function')
    // Every release names a var that wrangler.jsonc keeps off, so a deploy without it hides the route.
    const released = VAULT_V1_ROUTES.filter((route) => route.release !== undefined)
    expect(released.map(keyOf)).toEqual(['GET /v1/slip-accounts', 'PUT /v1/slip-accounts/:id'])
    const vars = wranglerVars()
    for (const route of released) expect(vars[route.release as string], keyOf(route)).toBe('false')
  })
})
