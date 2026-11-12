// Planner probe, never committed: what the vault's SQL does with a statement that is only a comment.
import { env } from 'cloudflare:workers'
import { runInDurableObject } from 'cloudflare:test'
import { expect, it } from 'vitest'

it('probe: a statement that is only a comment', async () => {
  const outcome = await runInDurableObject(env.VAULT.get(env.VAULT.idFromName(crypto.randomUUID())), (_vault, state) => {
    const run = (query: string) => {
      try {
        state.storage.sql.exec(query).toArray()
        return 'ok'
      } catch (error) {
        return String(error)
      }
    }
    return { commentOnly: run('-- only a comment\n'), selectOne: run('-- a comment\nSELECT 1;\n') }
  })
  console.log(`PROBE ${JSON.stringify(outcome)}`)
  expect(outcome.selectOne).toBe('ok')
})
