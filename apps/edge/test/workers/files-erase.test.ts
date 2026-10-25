// The vault's durable erase (B22), its object keys (B1) and the prefix purge
// that deletion's object step uses (§6.12). The purge cases write their keys
// out in the B1 shape, so a stubbed key builder cannot make them pass.
import { env } from 'cloudflare:workers'
import { evictAllDurableObjects, runInDurableObject } from 'cloudflare:test'
import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'

import { ObjectStoreError } from '@api/storage/object-store'

import { VAULT_OBJECT_PURPOSES, vaultObjectKey } from '../../src/vault/files/keys'
import type { VaultObjectPurpose } from '../../src/vault/files/keys'
import { purgeVaultObjects } from '../../src/vault/files/purge'
import { member, newUser, startV1, vaultOf } from './support/v1-client'

const USER_TABLES = "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name <> '__drizzle_migrations' ORDER BY name"
const AT = '2026-10-25T00:00:00.000Z'

const sql = (stub: DurableObjectStub, query: string, ...args: unknown[]) =>
  runInDurableObject(stub, (_v, state) => state.storage.sql.exec(query, ...args).toArray())

/** A vault id as the namespace names one: the 64 lowercase hex characters of a Durable Object id. */
const newVaultId = () => env.VAULT.idFromName(randomUUID()).toString()

/** The objects under a vault's prefix for each purpose. */
async function objectsUnder(vaultId: string): Promise<number> {
  let count = 0
  for (const purpose of VAULT_OBJECT_PURPOSES) {
    count += (await env.OBJECTS.list({ prefix: `${purpose}/${vaultId}/`, limit: 1000 })).objects.length
  }
  return count
}

it('erase empties the vault, cancels its alarm and leaves only the deleted marker', async () => {
  const stub = env.VAULT.get(env.VAULT.idFromName(randomUUID()), { locationHint: 'apac' })
  await runInDurableObject(stub, async (_vault, state) => {
    state.storage.sql.exec("INSERT INTO consents (kind, version, granted, updated_at) VALUES ('analytics', 0, 1, ?)", AT)
    state.storage.sql.exec("INSERT INTO wallets (id, name, currency, opening_minor, tracking_start, archived, version, created_at, updated_at) VALUES (?, 'Cash', 'THB', 0, '2026-10-01', 0, 1, ?, ?)", randomUUID(), AT, AT)
    await state.storage.setAlarm(Date.now() + 60_000)
  })
  await stub.erase()
  for (const { name } of await sql(stub, USER_TABLES)) {
    if (name === 'account_state') continue
    expect(await sql(stub, `SELECT count(*) AS n FROM ${name}`), name).toEqual([{ n: 0 }])
  }
  expect(await sql(stub, 'SELECT account_id, status FROM account_state')).toEqual([{ account_id: '', status: 'deleted' }])
  expect(await runInDurableObject(stub, (_vault, state) => state.storage.getAlarm())).toBeNull()
  expect(await runInDurableObject(stub, (vault) => vault.erased)).toBe(true)
})

it('an erased vault stays erased after it sleeps', async () => {
  const client = await startV1()
  const user = await member(client, newUser())
  await vaultOf(user).erase()
  await evictAllDurableObjects()
  const res = await client.as(user).get('/v1/me')
  expect(res.status).toBe(403)
  expect((await res.json()).code).toBe('ACCOUNT_UNAVAILABLE')
  expect(await sql(vaultOf(user), 'SELECT account_id, status FROM account_state')).toEqual([{ account_id: '', status: 'deleted' }])
  await expect(vaultOf(user).erase()).resolves.toBeUndefined()
})

it('an erased instance refuses every call, even when its marker is missing', async () => {
  const client = await startV1()
  const user = await member(client, newUser())
  const stub = vaultOf(user)
  await stub.erase()
  await runInDurableObject(stub, (_vault, state) => state.storage.sql.exec('DELETE FROM account_state'))
  const res = await client.as(user).get('/v1/me')
  expect(res.status).toBe(403)
  expect((await res.json()).code).toBe('ACCOUNT_UNAVAILABLE')
  expect(await sql(stub, 'SELECT count(*) AS n FROM account_state')).toEqual([{ n: 0 }])
})

it("purgeVaultObjects deletes every object under the vault's prefixes and nothing of another vault", async () => {
  const a = newVaultId()
  const b = newVaultId()
  for (const vaultId of [a, b]) {
    for (const purpose of VAULT_OBJECT_PURPOSES) {
      await env.OBJECTS.put(`${purpose}/${vaultId}/${randomUUID()}/${randomUUID()}/object.bin`, new Uint8Array([1, 2, 3]))
    }
  }
  expect(await purgeVaultObjects(env.OBJECTS, a)).toBe(5)
  expect(await objectsUnder(a)).toBe(0)
  expect(await objectsUnder(b)).toBe(5)
})

it('purgeVaultObjects pages through more than one listing', async () => {
  const a = newVaultId()
  const keys = Array.from({ length: 1001 }, (_, index) => `receipt/${a}/${randomUUID()}/${randomUUID()}/image-${index}.jpg`)
  for (let start = 0; start < keys.length; start += 100) {
    await Promise.all(keys.slice(start, start + 100).map((key) => env.OBJECTS.put(key, new Uint8Array([7]))))
  }
  expect(await purgeVaultObjects(env.OBJECTS, a)).toBe(1001)
  expect(await objectsUnder(a)).toBe(0)
}, 120_000)

it("vault object keys pass the store's key rule and refuse a vault id that is not 64 hex characters", () => {
  const id = randomUUID()
  const token = randomUUID()
  expect(vaultObjectKey('receipt', 'f'.repeat(64), id, token, 'image.jpg')).toBe(`receipt/${'f'.repeat(64)}/${id}/${token}/image.jpg`)
  expect(() => vaultObjectKey('receipt', 'nope', 'x')).toThrow(ObjectStoreError)
  expect(() => vaultObjectKey('bogus' as VaultObjectPurpose, 'f'.repeat(64), 'x')).toThrow(ObjectStoreError)
})
