import { describe, expect, it } from 'vitest'

import { EDGE_ONLY_ROUTES, V1_ROUTES, defaultStatus } from '../src/server/app/routes'
import type { Route } from '../src/server/app/routes'
import { VAULT_DEFERRED_ROUTES, VAULT_PENDING_ROUTES, VAULT_RETIRED_ROUTES, VAULT_V1_ROUTES, vaultStatus } from '../src/v1/routes'
import { VAULT_HANDLERS } from '../src/vault/routes'

// Every route the PostgreSQL edge declares must be placed once in the vault's
// route table: ported (VAULT_V1_ROUTES), pending for a later task, deferred to
// 1B, or retired by §6.4.
const keyOf = (method: string, path: string) => `${method} ${path}`
const legacy = new Map<string, Route>([...V1_ROUTES, ...EDGE_ONLY_ROUTES].map((route) => [keyOf(route.method, route.path), route]))

function placementsOf(key: string): string[] {
  return [
    VAULT_V1_ROUTES.some((route) => keyOf(route.method, route.path) === key) ? 'v1' : null,
    VAULT_PENDING_ROUTES.includes(key) ? 'pending' : null,
    VAULT_DEFERRED_ROUTES.includes(key) ? 'deferred' : null,
    VAULT_RETIRED_ROUTES.includes(key) ? 'retired' : null,
  ].filter((place): place is string => place !== null)
}

describe('the vault route table covers each v1 route exactly once', () => {
  it('every route the edge declares is in exactly one of the four places, and nothing else is listed', () => {
    for (const key of legacy.keys()) expect(placementsOf(key), key).toHaveLength(1)
    const listed = [...VAULT_V1_ROUTES.map((route) => keyOf(route.method, route.path)), ...VAULT_PENDING_ROUTES, ...VAULT_DEFERRED_ROUTES, ...VAULT_RETIRED_ROUTES]
    expect(listed.filter((key) => !legacy.has(key))).toEqual([])
    expect(new Set(listed).size).toBe(listed.length)
  })

  it('Tasks 2 to 6 and 8a port the front door, wallets, categories, transactions, budgets, command status and the sync delta feed, and nothing else', () => {
    expect(VAULT_V1_ROUTES.map((route) => keyOf(route.method, route.path)).sort()).toEqual([
      'DELETE /v1/transactions/:id',
      'GET /v1/budgets/:month',
      'GET /v1/categories',
      'GET /v1/me',
      'GET /v1/policies',
      'GET /v1/sync/changes',
      'GET /v1/transactions/:id',
      'GET /v1/wallets',
      'GET /v1/wallets/:id',
      'PATCH /v1/categories/:id',
      'PATCH /v1/transactions/:id',
      'PATCH /v1/wallets/:id',
      'POST /v1/categories',
      'POST /v1/categories/:id/archive',
      'POST /v1/categories/:id/unarchive',
      'POST /v1/categories/builtins',
      'POST /v1/commands/status',
      'POST /v1/me/logout',
      'POST /v1/me/policy-acceptances',
      'POST /v1/transactions',
      'POST /v1/transactions/:id/restore',
      'POST /v1/wallets',
      'POST /v1/wallets/:id/archive',
      'POST /v1/wallets/:id/unarchive',
      'PUT /v1/budgets/:month',
      'PUT /v1/me/privacy-preferences',
    ])
  })

  it('a ported route keeps its access, gates and status, and token_only never appears', () => {
    for (const route of VAULT_V1_ROUTES) {
      const key = keyOf(route.method, route.path)
      const old = legacy.get(key)
      expect(old, key).toBeDefined()
      if (!old) continue
      expect(route.access, key).not.toBe('token_only')
      expect(route.access, key).toBe(old.access)
      expect(route.gates ?? [], key).toEqual(old.gates ?? [])
      expect(vaultStatus(route), key).toBe(defaultStatus(old))
    }
  })

  it('a route with a vault id has a handler', () => {
    for (const route of VAULT_V1_ROUTES) {
      if (route.vault) expect(VAULT_HANDLERS[route.vault], route.vault).toBeTypeOf('function')
    }
  })

  it('the retired set is exactly the six routes §6.4 retires', () => {
    expect([...VAULT_RETIRED_ROUTES].sort()).toEqual(['POST /v1/auth/bootstrap', 'POST /v1/auth/challenges', 'POST /v1/auth/proofs', 'POST /v1/auth/provider-events', 'POST /v1/me/global-logout', 'POST /v1/me/identities'])
  })
})
