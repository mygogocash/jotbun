// LOCAL TWIN, never committed (1B-T12 fix planner; adapted from the 1B-T12 review's lens B): a setup file that
// lets the COMMITTED vault-parity-files.db.test.ts and vault-parity.db.test.ts run unchanged against the real built
// vault Worker in workerd, with no PostgreSQL and no NestJS. Only that side is replaced: startEdge gives a JWKS
// issuer (no database), startNest gives a send() that answers /v1/policies, and runFilesSession in 'nest' mode
// replays the answers the planner read from the API's code (TWIN_EXPECTED; the default is this kit's
// smoke/expected-nest.json, which the review's lens A re-derived byte for byte). Everything else is real: STEPS,
// vaultUser, vaultHeaders, startVaultWorker, the normalizer, the comparison and every assertion.
import { readFileSync } from 'node:fs'

import { vi } from 'vitest'

const EXPECTED = process.env.TWIN_EXPECTED ?? '/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1b-t12-fix-planner/smoke/expected-nest.json'
const day = new Date(Date.now() - 86_400_000).toISOString()
// The two policies the edge harness publishes for NestJS (publishPolicies), in the order NestJS lists them.
const POLICIES = [
  { kind: 'privacy', version: 1, required: false, published_at: day, text: { th: 'ความเป็นส่วนตัว', en: 'Privacy' } },
  { kind: 'terms', version: 1, required: true, published_at: day, text: { th: 'ข้อกำหนด', en: 'Terms' } },
]

vi.mock('./support/edge-harness', async (importOriginal) => {
  const real = await importOriginal<typeof import('./support/edge-harness')>()
  return {
    ...real,
    startEdge: async () => {
      const { startJwksFixture } = await import('@api/testing/jwks-server')
      const issuer = await startJwksFixture()
      return {
        issuer,
        member: async () => {
          throw new Error('twin: no PostgreSQL member')
        },
        close: async () => {
          await issuer.close()
        },
      }
    },
  }
})

vi.mock('./support/nest-server', async (importOriginal) => {
  const real = await importOriginal<typeof import('./support/nest-server')>()
  return {
    ...real,
    startNest: async () => ({
      url: 'http://nest.twin',
      send: async (request: Request) => {
        if (new URL(request.url).pathname === '/v1/policies') return Response.json(POLICIES)
        return new Response('twin: nest has no other route', { status: 500 })
      },
      stop() {},
    }),
  }
})

vi.mock('./support/files-session', async (importOriginal) => {
  const real = await importOriginal<typeof import('./support/files-session')>()
  const expected = JSON.parse(readFileSync(EXPECTED, 'utf8')) as { step: string; status: number; headers: Record<string, string | null>; body: unknown }[]
  const replay = () => {
    let k = 0
    return real.STEPS.map((step) => {
      if (step.signIn) return null
      const e = expected[k++]!
      return { status: e.status, headers: e.headers, body: e.body }
    })
  }
  return {
    ...real,
    nestUser: async () => ({ headers: async () => ({}) }),
    runFilesSession: async (send: Parameters<typeof real.runFilesSession>[0], who: Parameters<typeof real.runFilesSession>[1], mode: 'nest' | 'vault') =>
      mode === 'nest' ? replay() : real.runFilesSession(send, who, mode),
  }
})
