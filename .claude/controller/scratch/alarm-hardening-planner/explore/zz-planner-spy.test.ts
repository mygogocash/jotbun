// Planner exploration (scratch only): can a test make the vault's setAlarm and deleteAlarm reject?
import { runInDurableObject } from 'cloudflare:test'
import { expect, it, vi } from 'vitest'

import type { UserVault } from '../../src/vault/user-vault'
import { member, startV1, vaultOf } from './support/v1-client'

it('a spy on the storage makes setAlarm and deleteAlarm reject, for the vault too', async () => {
  const client = await startV1(undefined, { startWork: 'manual' })
  const user = await member(client)
  const out = await runInDurableObject(vaultOf(user), async (vault: UserVault, state) => {
    const same = (vault as unknown as { ctx: DurableObjectState }).ctx.storage === state.storage
    const set = vi.spyOn(state.storage, 'setAlarm').mockRejectedValueOnce(new Error('storage is down'))
    const del = vi.spyOn(state.storage, 'deleteAlarm').mockRejectedValueOnce(new Error('storage is down'))
    const caught: string[] = []
    await state.storage.setAlarm(Date.now() + 10_000_000).catch((e: unknown) => caught.push(`set ${String(e)}`))
    await state.storage.deleteAlarm().catch((e: unknown) => caught.push(`delete ${String(e)}`))
    const calls = [set.mock.calls.length, del.mock.calls.length]
    set.mockRestore()
    del.mockRestore()
    await state.storage.setAlarm(Date.now() + 10_000_000)
    const real = await state.storage.getAlarm()
    await state.storage.deleteAlarm()
    return { same, caught, calls, real: real !== null, after: await state.storage.getAlarm() }
  })
  console.log(`spy probe: ${JSON.stringify(out)}`)
  expect(out).toMatchObject({ same: true, calls: [1, 1], real: true, after: null })
})
