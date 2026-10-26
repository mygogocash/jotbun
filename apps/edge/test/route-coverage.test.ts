import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { EDGE_ONLY_ROUTES, FORWARDED_V1_ROUTES, V1_ROUTES, defaultStatus } from '../src/server/app/routes'

const API_SRC = fileURLToPath(new URL('../../api/src/', import.meta.url))

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

describe('the edge covers every NestJS v1 route', () => {
  const nest = nestRoutes()
  const ported = new Map(V1_ROUTES.map((r) => [`${r.method} ${r.path}`, r]))
  const forwarded = new Set(FORWARDED_V1_ROUTES)
  const health = new Set(['GET /live', 'GET /ready'])

  it('reads a plausible number of routes from the controllers', () => {
    expect(nest.length).toBeGreaterThanOrEqual(58)
    expect(nest.every((r) => r.access !== undefined)).toBe(true)
  })

  it('ports or explicitly forwards each one, never both', () => {
    const missing = nest.filter((r) => !ported.has(r.key) && !forwarded.has(r.key) && !health.has(r.key)).map((r) => r.key)
    expect(missing).toEqual([])
    expect(FORWARDED_V1_ROUTES.filter((key) => ported.has(key))).toEqual([])
  })

  it('keeps each ported route’s access class, gates and status', () => {
    const drift = nest
      .filter((r) => ported.has(r.key))
      .flatMap((r) => {
        const edge = ported.get(r.key)!
        const mine = { access: edge.access, gates: [...(edge.gates ?? [])].sort(), status: defaultStatus(edge) }
        const theirs = { access: r.access, gates: r.gates, status: r.status }
        return JSON.stringify(mine) === JSON.stringify(theirs) ? [] : [`${r.key}: edge ${JSON.stringify(mine)} nest ${JSON.stringify(theirs)}`]
      })
    expect(drift).toEqual([])
  })

  it('edge-only routes never shadow an API route', () => {
    const known = new Set(nest.map((r) => r.key))
    expect(EDGE_ONLY_ROUTES.map((r) => `${r.method} ${r.path}`).filter((key) => known.has(key))).toEqual([])
  })

  it('serves no route the API does not have, and forwards only real routes', () => {
    const known = new Set(nest.map((r) => r.key))
    expect([...ported.keys()].filter((key) => !known.has(key))).toEqual([])
    expect(FORWARDED_V1_ROUTES.filter((key) => !known.has(key))).toEqual([])
  })
})
