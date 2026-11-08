// The vault's object registry with tombstones (B4, B19, ruling R29), the
// single-copy put (B21), download grants per purpose, and the pending-work
// starts (B5, C12). Registry functions run inside runInDurableObject, with the
// vault clock given per call as `at(state, ms)`.
import { env } from 'cloudflare:workers'
import { runInDurableObject } from 'cloudflare:test'
import { createHash, randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'

import { ATTACHMENT_GRANT_MINUTES } from '@gogospend/contracts'

import { ProblemException } from '@api/common/api-problem.filter'
import { FeatureGates } from '@api/common/feature-gates'
import { commandDigesterFromEnv } from '@api/commands/command-digest'
import { sanitizedImageHeader } from '@api/imports/parse-handler'
import { ObjectStoreError } from '@api/storage/object-store'
import { SnapshotGrants } from '@api/sync/snapshot-grants'

import { vaultById } from '../../src/background/vault-stub'
import { readGates } from '../../src/v1/config'
import { EXPORT_SLOTS, RECEIPT_SLOTS } from '../../src/v1/files/downloads'
import { startsWork } from '../../src/v1/handler'
import type { VaultClaims, VaultRouteId, WorkerRouteId } from '../../src/v1/protocol'
import { VAULT_STEP_ROUTES, VAULT_V1_ROUTES } from '../../src/v1/routes'
import type { VaultRoute } from '../../src/v1/routes'
import { WORKER_HANDLERS, vaultSession } from '../../src/v1/worker-routes'
import type { FileContext } from '../../src/vault/files/context'
import { receiptGrantScope, vaultGrants } from '../../src/vault/files/grants'
import { vaultObjectKey } from '../../src/vault/files/keys'
import type { VaultBucket } from '../../src/vault/files/keys'
import { DELETE_RETRY_MS, RESERVATION_GRACE_MS, TOMBSTONE_MS, deleteDueObjects, dueObjectKeys, objectsDueAt, publishObject, putConcatenated, releaseObject, reserveObject, tombstoneObjects } from '../../src/vault/files/objects'
import { START_RETRY_MS, WORK_STARTERS, createOnce, startDueAt, startPendingWork } from '../../src/vault/files/work'
import type { PendingWorkHost, StartResult, WorkStarter } from '../../src/vault/files/work'
import { okReply } from '../../src/vault/replies'
import { VAULT_HANDLERS } from '../../src/vault/routes'
import type { UserVault } from '../../src/vault/user-vault'
import { TINY_JPEG } from './support/files'
import { TEST_POLICIES, member, startV1, vaultOf } from './support/v1-client'
import type { TestUser } from './support/v1-client'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const SHA = 'a'.repeat(64)
const t0 = Date.parse('2026-10-25T00:00:00.000Z')

/** A vault no one has called yet, so it holds no account. */
const freshVault = () => env.VAULT.get(env.VAULT.idFromName(randomUUID()), { locationHint: 'apac' })

/** The vault's file view at `ms`, as UserVault#fileContext builds it, with the clock given. */
const at = (state: DurableObjectState, ms: number): FileContext => ({ sql: state.storage.sql, storage: state.storage, now: new Date(ms), vaultId: state.id.toString() })

const keyOf = (state: DurableObjectState, purpose: 'export' | 'receipt' = 'export') =>
  vaultObjectKey(purpose, state.id.toString(), randomUUID(), randomUUID(), purpose === 'receipt' ? 'image.jpg' : 'export.csv')

const rowOf = (state: DurableObjectState, key: string) => state.storage.sql.exec('SELECT status, delete_after FROM vault_objects WHERE key = ?', key).toArray()

const dueKeys = (c: FileContext) => dueObjectKeys(c).map((row) => row.key).sort()

/** A starter whose start answers what `result` gives (or throws), counting its starts and keeping its marks in memory. */
function fakeStarter(kind: WorkStarter['kind'], ids: string[], result: () => Promise<StartResult>) {
  const marked = new Set<string>()
  let starts = 0
  const starter: WorkStarter = {
    kind,
    unstarted: () => ids.filter((id) => !marked.has(id)),
    dueAt: () => null,
    start: async () => {
      starts += 1
      return result()
    },
    markStarted: (_c, id) => {
      marked.add(id)
    },
  }
  return { starter, marked, starts: () => starts }
}

function hostFor(state: DurableObjectState, options: { erased?: boolean; active?: boolean; gates?: FeatureGates } = {}): PendingWorkHost {
  return {
    env: {},
    erased: options.erased ?? false,
    context: () => at(state, t0),
    active: () => options.active ?? true,
    gates: async () => options.gates ?? new FeatureGates(),
  }
}

/** A Workflow binding where `create` answers as given and `get` finds the instance only when `exists`. */
function fakeWorkflow(create: (options: unknown) => Promise<void>, exists: boolean): Workflow<{ vault: string }> {
  const instance = (id: string): WorkflowInstance => ({ id, status: async () => ({ status: 'running' }) })
  return {
    create: async (options) => {
      await create(options)
      return instance(options?.id ?? 'unnamed')
    },
    get: async (id) => {
      if (!exists) throw new Error('instance.not_found')
      return instance(id)
    },
  }
}

const lastStart = (user: TestUser) => runInDurableObject(vaultOf(user), (v: UserVault) => v.lastStartAttemptMs)

it('a reserved key is due at its grace deadline, a published one at its expiry, and a held receipt never until released', async () => {
  await runInDurableObject(freshVault(), (_v, state) => {
    const k1 = keyOf(state)
    const k2 = keyOf(state, 'receipt')
    const k3 = keyOf(state)
    const c = at(state, t0)
    reserveObject(c, k1, 'export')
    reserveObject(c, k2, 'receipt')
    publishObject(c, k2, { bytes: 3, sha256: SHA }, null)
    reserveObject(c, k3, 'export')
    publishObject(c, k3, { bytes: 3, sha256: SHA }, t0 + DAY)
    expect(c.touched).toBe(true)
    expect(dueKeys(at(state, t0 + 15 * MIN - 1))).toEqual([])
    expect(dueKeys(at(state, t0 + 15 * MIN))).toEqual([k1])
    expect(dueKeys(at(state, t0 + DAY))).toEqual([k1, k3].sort())
    expect(objectsDueAt(c)).toBe(t0 + 15 * MIN)
    releaseObject(at(state, t0 + 1), k2)
    expect(dueKeys(at(state, t0 + 1))).toEqual([k2])
    expect(rowOf(state, k2)).toEqual([{ status: 'published', delete_after: 0 }])
  })
})

it('a key written after it was forgotten is still deleted', async () => {
  const stub = freshVault()
  const run = (ms: number) => runInDurableObject(stub, (vault: UserVault, state) => deleteDueObjects({ context: () => at(state, ms), bucket: vault.bucket }))
  const row = (key: string) => runInDurableObject(stub, (_v, state) => rowOf(state, key))

  // Forgotten by its writer: the row is a tombstone at once, due a day later.
  const forgotten = await runInDurableObject(stub, (_v, state) => {
    const key = keyOf(state)
    reserveObject(at(state, t0), key, 'export')
    tombstoneObjects(at(state, t0), [key])
    return key
  })
  expect(await row(forgotten)).toEqual([{ status: 'tombstone', delete_after: t0 + 86_400_000 }])
  await env.OBJECTS.put(forgotten, new Uint8Array([1])) // a PUT that lands late
  expect(await run(t0 + TOMBSTONE_MS - 1)).toBe(0)
  expect(await env.OBJECTS.head(forgotten)).not.toBeNull()
  expect(await run(t0 + TOMBSTONE_MS)).toBe(1)
  expect(await env.OBJECTS.head(forgotten)).toBeNull()
  expect(await row(forgotten)).toEqual([])

  // Given up at its deadline: deleted, kept a day as a tombstone, then deleted once more.
  const abandoned = await runInDurableObject(stub, (_v, state) => {
    const key = keyOf(state)
    reserveObject(at(state, t0), key, 'export')
    return key
  })
  const grace = t0 + RESERVATION_GRACE_MS
  expect(await run(grace)).toBe(1)
  expect(await row(abandoned)).toEqual([{ status: 'tombstone', delete_after: grace + 86_400_000 }])
  await env.OBJECTS.put(abandoned, new Uint8Array([2])) // a PUT that lands late
  expect(await run(grace + TOMBSTONE_MS)).toBe(1)
  expect(await env.OBJECTS.head(abandoned)).toBeNull()
  expect(await row(abandoned)).toEqual([])
})

it('publishing a key that was never reserved throws and writes nothing', async () => {
  await runInDurableObject(freshVault(), (_v, state) => {
    const key = keyOf(state)
    const c = at(state, t0)
    expect(() => publishObject(c, key, { bytes: 3, sha256: SHA }, t0 + DAY)).toThrow()
    expect(rowOf(state, key)).toEqual([])
    expect(c.touched).toBeUndefined()
    // A tombstone is no reservation either.
    reserveObject(c, key, 'export')
    tombstoneObjects(c, [key])
    expect(() => publishObject(c, key, { bytes: 3, sha256: SHA }, t0 + DAY)).toThrow()
    expect(rowOf(state, key)).toEqual([{ status: 'tombstone', delete_after: t0 + TOMBSTONE_MS }])
  })
})

it('a failed R2 delete keeps the rows and retries them a minute later', async () => {
  await runInDurableObject(freshVault(), async (_v, state) => {
    const reserved = keyOf(state)
    const published = keyOf(state)
    reserveObject(at(state, t0), reserved, 'export')
    reserveObject(at(state, t0), published, 'export')
    publishObject(at(state, t0), published, { bytes: 3, sha256: SHA }, t0 + HOUR)
    const failing = {
      delete: async () => {
        throw new Error('R2 is down')
      },
    } as unknown as VaultBucket
    const now = t0 + 2 * HOUR
    expect(await deleteDueObjects({ context: () => at(state, now), bucket: failing })).toBe(0)
    expect(rowOf(state, reserved)).toEqual([{ status: 'reserved', delete_after: now + 60_000 }])
    expect(rowOf(state, published)).toEqual([{ status: 'published', delete_after: now + DELETE_RETRY_MS }])
    expect(objectsDueAt(at(state, now))).toBe(now + 60_000)
  })
})

it('registry functions take more key lists than SQLite has parameters', async () => {
  await runInDurableObject(freshVault(), async (_v, state) => {
    const tombstones = (deleteAfter: number) =>
      state.storage.sql.exec("SELECT count(*) AS n FROM vault_objects WHERE status = 'tombstone' AND delete_after = ?", deleteAfter).one()
    const forgotten = Array.from({ length: 1001 }, () => keyOf(state))
    for (const key of forgotten) reserveObject(at(state, t0), key, 'export')
    tombstoneObjects(at(state, t0), forgotten)
    expect(tombstones(t0 + TOMBSTONE_MS)).toEqual({ n: 1001 })

    const due = Array.from({ length: 1001 }, () => keyOf(state))
    for (const key of due) reserveObject(at(state, t0 + 1), key, 'export')
    const batches: number[] = []
    const counting = {
      delete: async (keys: string | string[]) => {
        batches.push(Array.isArray(keys) ? keys.length : 1)
        await env.OBJECTS.delete(keys)
      },
    } as unknown as VaultBucket
    const now = t0 + 1 + RESERVATION_GRACE_MS
    expect(await deleteDueObjects({ context: () => at(state, now), bucket: counting })).toBe(1001)
    expect(batches).toEqual([1000, 1])
    expect(tombstones(now + TOMBSTONE_MS)).toEqual({ n: 1001 })
  })
}, 60_000)

it('putConcatenated stores one create-only object with its SHA-256 and refuses an existing key', async () => {
  const key = vaultObjectKey('export', env.VAULT.idFromName(randomUUID()).toString(), randomUUID(), randomUUID(), 'export.csv')
  const text = new TextEncoder()
  const parts = [text.encode('date,amount\n'), text.encode('2026-10-25,100\n')]
  let heldAtPut = -1
  const recording = {
    put: (...args: Parameters<VaultBucket['put']>) => {
      heldAtPut = parts.length
      return env.OBJECTS.put(...args)
    },
  } as unknown as VaultBucket
  const sha256 = createHash('sha256').update('date,amount\n2026-10-25,100\n').digest('hex')
  expect(await putConcatenated(recording, key, parts, 27, 'text/csv; charset=utf-8')).toEqual({ bytes: 27, sha256 })
  expect(heldAtPut).toBe(0)
  const stored = await env.OBJECTS.get(key)
  expect(new TextDecoder().decode(await stored!.arrayBuffer())).toBe('date,amount\n2026-10-25,100\n')
  expect(stored!.customMetadata).toEqual({ sha256 })
  expect(stored!.httpMetadata?.contentType).toBe('text/csv; charset=utf-8')

  const again = putConcatenated(env.OBJECTS, key, [text.encode('x')], 1, 'text/csv')
  await expect(again).rejects.toBeInstanceOf(ObjectStoreError)
  await expect(again).rejects.toMatchObject({ code: 'exists' })
  const down = {
    put: async () => {
      throw new Error('R2 is down')
    },
  } as unknown as VaultBucket
  await expect(putConcatenated(down, key, [text.encode('x')], 1, 'text/csv')).rejects.toMatchObject({ code: 'unavailable' })
})

it('grants are per purpose, and a receipt grant is bound to its session', () => {
  const c = { digester: commandDigesterFromEnv({ COMMAND_DIGEST_KEY: 'synthetic-command-digest-key-0123456789abcdef' }) }
  const now = new Date(t0)
  const target = { snapshotId: randomUUID(), index: 0 }
  const snapshot = vaultGrants(c, 'snapshot').issue('account-a', target, now).grant
  expect(vaultGrants(c, 'snapshot').verify('account-a', snapshot, now)).toEqual(target)
  expect(vaultGrants(c, 'export').verify('account-a', snapshot, now)).toBeNull()
  expect(vaultGrants(c, 'attachment').verify('account-a', snapshot, now)).toBeNull()
  // The keys are derived under the labels the edge's buildContainer used.
  const labels = [['snapshot', 'gogospend.snapshot-grant.v1'], ['export', 'gogospend.export-grant.v1'], ['attachment', 'gogospend.attachment-grant.v1']] as const
  for (const [purpose, label] of labels) {
    const issued = new SnapshotGrants(c.digester.deriveKeys(label)).issue('account-a', target, now).grant
    expect(vaultGrants(c, purpose).verify('account-a', issued, now), purpose).toEqual(target)
  }

  const a: VaultClaims = { accountId: 'account-a', sessionId: randomUUID(), issuedAt: 0, clientId: 'ios/1.0.0' }
  const b: VaultClaims = { ...a, sessionId: randomUUID() }
  expect(receiptGrantScope(a)).toBe(`account-a\u0000${a.sessionId}`)
  const receipt = vaultGrants(c, 'attachment').issue(receiptGrantScope(a), target, now)
  expect(receipt.expiresAt.getTime()).toBe(t0 + ATTACHMENT_GRANT_MINUTES * 60_000)
  expect(vaultGrants(c, 'attachment').verify(receiptGrantScope(a), receipt.grant, now)).toEqual(target)
  expect(vaultGrants(c, 'attachment').verify(receiptGrantScope(b), receipt.grant, now)).toBeNull()
})

it('a route marked starts hands its vault to startWork only after a 2xx', () => {
  const route: VaultRoute = { method: 'POST', path: '/v1/x', access: 'bound_session', vault: 'me.get', starts: true }
  expect(startsWork(route, 202)).toBe(true)
  expect(startsWork(route, 200)).toBe(true)
  expect(startsWork(route, 409)).toBe(false)
  expect(startsWork(route, 300)).toBe(false)
  expect(startsWork(route, 199)).toBe(false)
  expect(startsWork({ method: 'POST', path: '/v1/x', access: 'bound_session', vault: 'me.get' }, 202)).toBe(false)
})

it('the front door starts pending work after a starts route answers 2xx, and not after an error or in manual mode', async () => {
  const me = VAULT_V1_ROUTES.find((route) => route.vault === 'me.get')!
  const wallet = VAULT_V1_ROUTES.find((route) => route.vault === 'wallets.get')!
  me.starts = true
  wallet.starts = true
  try {
    const auto = await startV1()
    const started = await member(auto)
    expect((await auto.as(started).get('/v1/me')).status).toBe(200)
    await auto.settle()
    expect(await lastStart(started)).toEqual(expect.any(Number))

    const refused = await member(auto)
    expect((await auto.as(refused).get(`/v1/wallets/${randomUUID()}`)).status).toBe(404)
    await auto.settle()
    expect(await lastStart(refused)).toBeNull()

    const manual = await startV1(undefined, { startWork: 'manual' })
    const untouched = await member(manual)
    expect((await manual.as(untouched).get('/v1/me')).status).toBe(200)
    await manual.settle()
    expect(await lastStart(untouched)).toBeNull()
  } finally {
    delete me.starts
    delete wallet.starts
  }
})

it("a Worker route marked starts hands its session's vault to startWork after a 2xx", async () => {
  const id = 'test.starts' as WorkerRouteId
  const routes = VAULT_V1_ROUTES as VaultRoute[]
  const route: VaultRoute = { method: 'POST', path: '/v1/test-starts', access: 'bound_session', worker: id, starts: true }
  routes.push(route)
  WORKER_HANDLERS[id] = async (w) => w.vault!.call('me.get')
  try {
    const client = await startV1()
    const user = await member(client)
    expect((await client.as(user).post('/v1/test-starts', {})).status).toBe(200)
    await client.settle()
    expect(await lastStart(user)).toEqual(expect.any(Number))
  } finally {
    routes.splice(routes.indexOf(route), 1)
    delete WORKER_HANDLERS[id]
  }
})

it('startPendingWork starts each item once and marks it, counts an existing instance as started, and leaves an unbound kind for later', async () => {
  await runInDurableObject(freshVault(), async (_v, state) => {
    const existing = fakeWorkflow(async () => {
      throw new Error('instance.already_exists')
    }, true)
    const exported = fakeStarter('export', ['e1'], async () => {
      await createOnce(existing, 'e1', { vault: state.id.toString() })
      return 'started'
    })
    const parse = fakeStarter('parse', ['p1'], async () => 'unbound')
    const snapshot = fakeStarter('snapshot', ['s1'], async () => {
      throw new Error('workflows down')
    })
    const starters = [exported.starter, parse.starter, snapshot.starter]
    expect(await startPendingWork(hostFor(state), starters)).toEqual({ started: 1, failed: 1, held: false })
    expect([...exported.marked, ...parse.marked, ...snapshot.marked]).toEqual(['e1'])
    expect(await startPendingWork(hostFor(state), starters)).toEqual({ started: 0, failed: 1, held: false })
    expect([exported.starts(), parse.starts(), snapshot.starts()]).toEqual([1, 2, 2])
  })
})

it('startPendingWork starts nothing while jobs is paused', async () => {
  await runInDurableObject(freshVault(), async (_v, state) => {
    const exported = fakeStarter('export', ['e1'], async () => 'started')
    expect(await startPendingWork(hostFor(state, { gates: new FeatureGates({ paused: ['jobs'] }) }), [exported.starter])).toEqual({ started: 0, failed: 0, held: true })
    expect(exported.starts()).toBe(0)
    expect(await startPendingWork(hostFor(state), [exported.starter])).toEqual({ started: 1, failed: 0, held: false })
  })
  // The vault reads the gates from config:v1, as the Worker does.
  const client = await startV1({ policies: TEST_POLICIES, client_versions: { ios: '1.0.0', android: '1.0.0' }, gates: { paused: ['jobs'] } })
  const user = await member(client)
  expect(await vaultOf(user).startPendingWork()).toEqual({ started: 0, failed: 0, held: true })
  expect(await lastStart(user)).toEqual(expect.any(Number))
  await startV1()
  expect(await vaultOf(user).startPendingWork()).toEqual({ started: 0, failed: 0, held: false })
})

it('createOnce treats an existing instance as created and rethrows otherwise', async () => {
  const created: unknown[] = []
  const fresh = fakeWorkflow(async (options) => {
    created.push(options)
  }, false)
  await createOnce(fresh, 'w1', { vault: 'v' })
  expect(created).toEqual([{ id: 'w1', params: { vault: 'v' } }])

  const existing = fakeWorkflow(async () => {
    throw new Error('instance.already_exists')
  }, true)
  await expect(createOnce(existing, 'w1', { vault: 'v' })).resolves.toBeUndefined()

  const first = new Error('workflows down')
  const broken = fakeWorkflow(async () => {
    throw first
  }, false)
  await expect(createOnce(broken, 'w1', { vault: 'v' })).rejects.toBe(first)
})

it('TINY_JPEG is a valid 1×1 baseline JPEG', () => {
  const jpeg = Buffer.from(TINY_JPEG)
  expect(jpeg.byteLength).toBe(159)
  expect([...jpeg.subarray(0, 4)]).toEqual([0xff, 0xd8, 0xff, 0xe0])
  expect(jpeg.indexOf(Buffer.from([0xff, 0xc0]))).toBeGreaterThan(0)
  expect(sanitizedImageHeader(jpeg, 'jpeg')).toEqual({ width: 1, height: 1 })
})

it('startPendingWork does nothing in an erased vault or one that is not active', async () => {
  await runInDurableObject(freshVault(), async (_v, state) => {
    const exported = fakeStarter('export', ['e1'], async () => 'started')
    expect(await startPendingWork(hostFor(state, { erased: true }), [exported.starter])).toEqual({ started: 0, failed: 0, held: false })
    expect(await startPendingWork(hostFor(state, { active: false }), [exported.starter])).toEqual({ started: 0, failed: 0, held: false })
    expect(exported.starts()).toBe(0)
    expect(await startPendingWork(hostFor(state), [exported.starter])).toEqual({ started: 1, failed: 0, held: false })
  })
  // A vault is active only while it holds an active account.
  const isActive = (stub: DurableObjectStub<UserVault>) => runInDurableObject(stub, (v: UserVault) => v.isActive(v.fileContext()))
  const client = await startV1()
  const user = await member(client)
  expect(await isActive(vaultOf(user))).toBe(true)
  expect(await isActive(freshVault())).toBe(false)
  await vaultOf(user).erase()
  expect(await isActive(vaultOf(user))).toBe(false)
  expect(await vaultOf(user).startPendingWork()).toEqual({ started: 0, failed: 0, held: false })
})

it("startDueAt is the later of the starters' earliest and the last attempt plus a minute", async () => {
  await runInDurableObject(freshVault(), (_v, state) => {
    const c = at(state, t0)
    const dueAt = (ms: number | null): WorkStarter => ({ ...fakeStarter('export', [], async () => 'started').starter, dueAt: () => ms })
    const starters = [dueAt(t0 + 10_000), dueAt(t0 + 5_000), dueAt(null)]
    expect(START_RETRY_MS).toBe(60_000)
    expect(startDueAt(c, null, starters)).toBe(t0 + 5_000)
    expect(startDueAt(c, t0, starters)).toBe(t0 + 60_000)
    expect(startDueAt(c, t0 - 2 * MIN, starters)).toBe(t0 + 5_000)
    expect(startDueAt(c, t0, [dueAt(null)])).toBeNull()
    expect(startDueAt(c, t0, [])).toBeNull()
  })
})

it('after deleteDueObjects at objectsDueAt, the next objectsDueAt is later or null', async () => {
  await runInDurableObject(freshVault(), async (vault: UserVault, state) => {
    reserveObject(at(state, t0), keyOf(state), 'export')
    let due = objectsDueAt(at(state, t0))
    expect(due).toBe(t0 + RESERVATION_GRACE_MS)
    const seen: number[] = []
    while (due !== null) {
      const now: number = due
      seen.push(now)
      expect(seen.length).toBeLessThanOrEqual(2)
      await deleteDueObjects({ context: () => at(state, now), bucket: vault.bucket })
      const next = objectsDueAt(at(state, now))
      if (next !== null) expect(next).toBeGreaterThan(now)
      due = next
    }
    expect(seen).toEqual([t0 + RESERVATION_GRACE_MS, t0 + RESERVATION_GRACE_MS + TOMBSTONE_MS])
  })
})

it('readGates reads only the gates of config:v1 and fails closed as readEdgeConfig does', async () => {
  const kv = (stored: unknown, fails = false) =>
    ({
      get: async () => {
        if (fails) throw new Error('KV is down')
        return stored
      },
    }) as unknown as KVNamespace
  expect((await readGates(kv(null))).isPaused('jobs')).toBe(false)
  expect((await readGates(kv({ gates: { paused: ['jobs'] } }))).isPaused('jobs')).toBe(true)
  expect((await readGates(kv({ gates: { paused: ['ocr'] } }))).isPaused('jobs')).toBe(false)
  expect((await readGates(kv(null, true))).isPaused('jobs')).toBe(true)
  expect((await readGates(kv({ gates: 'nope' }))).isPaused('jobs')).toBe(true)
})

it("a vault call's context carries the vault's own id, and vaultById reaches the vault by that id", async () => {
  const step = 'test.vault-id' as VaultRouteId
  VAULT_STEP_ROUTES[step] = {}
  VAULT_HANDLERS[step] = (c, call) => okReply(call.route, { vaultId: c.vaultId })
  try {
    const client = await startV1()
    const user = await member(client)
    const vaultId = vaultOf(user).id.toString()
    expect(vaultId).toMatch(/^[0-9a-f]{64}$/)
    const claims: VaultClaims = { accountId: user.sub, sessionId: user.sid, issuedAt: Math.floor(Date.now() / 1000), clientId: 'ios/1.0.0' }
    expect(await vaultSession(env, claims, TEST_POLICIES, 'bound_session', 'read').call(step)).toEqual({ ok: true, status: 200, body: { vaultId } })
    expect(await runInDurableObject(vaultOf(user), (v: UserVault) => [v.vaultId, v.fileContext().vaultId])).toEqual([vaultId, vaultId])
    expect(await runInDurableObject(vaultById(env, vaultId), (v: UserVault) => v.vaultId)).toBe(vaultId)
  } finally {
    delete VAULT_STEP_ROUTES[step]
    delete VAULT_HANDLERS[step]
  }
})

it('the download slots keep the API limits: four exports an isolate, eight receipts and two an account', () => {
  const exportsHeld = Array.from({ length: 4 }, () => EXPORT_SLOTS.take())
  try {
    expect(() => EXPORT_SLOTS.take()).toThrow(ProblemException)
  } finally {
    for (const give of exportsHeld) give()
  }
  const mine = [RECEIPT_SLOTS.take('a'), RECEIPT_SLOTS.take('a')]
  try {
    expect(() => RECEIPT_SLOTS.take('a')).toThrow(ProblemException)
    const others = Array.from({ length: 6 }, (_, n) => RECEIPT_SLOTS.take(`other-${n % 3}`))
    try {
      expect(() => RECEIPT_SLOTS.take('b')).toThrow(ProblemException)
    } finally {
      for (const give of others) give()
    }
  } finally {
    for (const give of mine) give()
  }
})

// 1B-T4 follow-up: the publish and delete race, the vault's own prefix, putConcatenated's checks, and the deviations' tests.

it('a reservation is published only before its deadline', async () => {
  await runInDurableObject(freshVault(), (_v, state) => {
    const early = keyOf(state)
    const late = keyOf(state)
    reserveObject(at(state, t0), early, 'export')
    reserveObject(at(state, t0), late, 'export')
    const deadline = t0 + RESERVATION_GRACE_MS
    publishObject(at(state, deadline - 1), early, { bytes: 3, sha256: SHA }, t0 + DAY)
    expect(rowOf(state, early)).toEqual([{ status: 'published', delete_after: t0 + DAY }])
    // At its deadline the reservation is due and given up: publishing it throws and writes nothing.
    const c = at(state, deadline)
    expect(() => publishObject(c, late, { bytes: 3, sha256: SHA }, t0 + DAY)).toThrow()
    expect(rowOf(state, late)).toEqual([{ status: 'reserved', delete_after: deadline }])
    expect(c.touched).toBeUndefined()
  })
})

it('a write or a forget that lands while a delete is in flight is never lost', async () => {
  await runInDurableObject(freshVault(), async (_v, state) => {
    const now = t0 + RESERVATION_GRACE_MS
    const tryPublish = (key: string): 'published' | 'refused' => {
      try {
        publishObject(at(state, now + 1), key, { bytes: 3, sha256: SHA }, null)
        return 'published'
      } catch {
        return 'refused'
      }
    }

    // The writer's PUT and publish land before the delete reaches R2: the publish is refused, so the writer knows.
    const putFirst = keyOf(state, 'receipt')
    reserveObject(at(state, t0), putFirst, 'receipt')
    let first = ''
    const putThenDelete = {
      delete: async (keys: string | string[]) => {
        await env.OBJECTS.put(putFirst, new Uint8Array([1, 2, 3]))
        first = tryPublish(putFirst)
        await env.OBJECTS.delete(keys)
      },
    } as unknown as VaultBucket
    expect(await deleteDueObjects({ context: () => at(state, now), bucket: putThenDelete })).toBe(1)
    expect(first).toBe('refused')
    expect(rowOf(state, putFirst)).toEqual([{ status: 'tombstone', delete_after: now + TOMBSTONE_MS }])
    expect(await env.OBJECTS.head(putFirst)).toBeNull()

    // The delete reaches R2 first, then the PUT and the publish: the publish is refused and the late object is deleted a day later.
    const deleteFirst = keyOf(state, 'receipt')
    reserveObject(at(state, t0), deleteFirst, 'receipt')
    let second = ''
    const deleteThenPut = {
      delete: async (keys: string | string[]) => {
        await env.OBJECTS.delete(keys)
        await env.OBJECTS.put(deleteFirst, new Uint8Array([1, 2, 3]))
        second = tryPublish(deleteFirst)
      },
    } as unknown as VaultBucket
    expect(await deleteDueObjects({ context: () => at(state, now), bucket: deleteThenPut })).toBe(1)
    expect(second).toBe('refused')
    expect(rowOf(state, deleteFirst)).toEqual([{ status: 'tombstone', delete_after: now + TOMBSTONE_MS }])
    expect(await env.OBJECTS.head(deleteFirst)).not.toBeNull()
    await deleteDueObjects({ context: () => at(state, now + TOMBSTONE_MS), bucket: env.OBJECTS })
    expect(await env.OBJECTS.head(deleteFirst)).toBeNull()
    expect(rowOf(state, deleteFirst)).toEqual([])

    // A tombstone its writer forgets again while its second delete is in flight keeps the new deadline.
    const forgotten = keyOf(state)
    reserveObject(at(state, t0), forgotten, 'export')
    tombstoneObjects(at(state, t0), [forgotten])
    const later = t0 + TOMBSTONE_MS
    const forgetDuring = {
      delete: async (keys: string | string[]) => {
        await env.OBJECTS.delete(keys)
        tombstoneObjects(at(state, later + 1), [forgotten])
      },
    } as unknown as VaultBucket
    expect(await deleteDueObjects({ context: () => at(state, later), bucket: forgetDuring })).toBe(1)
    expect(rowOf(state, forgotten)).toEqual([{ status: 'tombstone', delete_after: later + 1 + TOMBSTONE_MS }])
  })
})

it('a vault reserves only keys under its own prefix', async () => {
  await runInDurableObject(freshVault(), (_v, state) => {
    const refusal = (run: () => void): unknown => {
      try {
        run()
        return null
      } catch (error) {
        return error
      }
    }
    const c = at(state, t0)
    const others = vaultObjectKey('export', env.VAULT.idFromName(randomUUID()).toString(), randomUUID(), randomUUID(), 'export.csv')
    const otherVault = refusal(() => reserveObject(c, others, 'export'))
    expect(otherVault).toBeInstanceOf(ObjectStoreError)
    expect(otherVault).toMatchObject({ code: 'invalid_key' })
    // This vault's own key, named under another purpose, is refused the same way.
    const otherPurpose = refusal(() => reserveObject(c, keyOf(state, 'receipt'), 'export'))
    expect(otherPurpose).toBeInstanceOf(ObjectStoreError)
    expect(otherPurpose).toMatchObject({ code: 'invalid_key' })
    expect(state.storage.sql.exec('SELECT count(*) AS n FROM vault_objects').one()).toEqual({ n: 0 })
    expect(c.touched).toBeUndefined()
    reserveObject(c, keyOf(state), 'export')
    expect(state.storage.sql.exec('SELECT count(*) AS n FROM vault_objects').one()).toEqual({ n: 1 })
  })
})

it('putConcatenated refuses a bad key, or parts that do not add up to totalBytes, before it stores anything', async () => {
  const key = vaultObjectKey('export', env.VAULT.idFromName(randomUUID()).toString(), randomUUID(), randomUUID(), 'export.csv')
  let puts = 0
  const counting = {
    put: (...args: Parameters<VaultBucket['put']>) => {
      puts += 1
      return env.OBJECTS.put(...args)
    },
  } as unknown as VaultBucket
  const bad = 'Not A Vault Key'
  const parts = [new Uint8Array([1]), new Uint8Array([2])]
  await expect(putConcatenated(counting, bad, parts, 2, 'text/csv')).rejects.toMatchObject({ code: 'invalid_key' })
  await expect(putConcatenated(counting, key, parts, 5, 'text/csv')).rejects.toThrow(RangeError)
  await expect(putConcatenated(counting, key, parts, 1, 'text/csv')).rejects.toThrow(RangeError)
  await expect(putConcatenated(counting, key, [new Uint8Array([1, 2, 3])], 2, 'text/csv')).rejects.toThrow(RangeError)
  // A refused call stores nothing and leaves the caller's parts as they were.
  expect(puts).toBe(0)
  expect(parts.length).toBe(2)
  expect(await env.OBJECTS.head(bad)).toBeNull()
  expect(await env.OBJECTS.head(key)).toBeNull()
  expect(await putConcatenated(counting, key, parts, 2, 'text/csv')).toMatchObject({ bytes: 2 })
  expect(puts).toBe(1)
})

it('a start that rejects is logged and never fails the reply', async () => {
  const me = VAULT_V1_ROUTES.find((route) => route.vault === 'me.get')!
  const broken: WorkStarter = {
    kind: 'export',
    unstarted: () => {
      throw new Error('unreadable')
    },
    dueAt: () => null,
    start: async () => 'started',
    markStarted: () => undefined,
  }
  me.starts = true
  WORK_STARTERS.push(broken)
  try {
    const client = await startV1()
    const user = await member(client)
    expect((await client.as(user).get('/v1/me')).status).toBe(200)
    await expect(client.settle()).resolves.toBeUndefined()
    expect(await lastStart(user)).toEqual(expect.any(Number))
  } finally {
    delete me.starts
    WORK_STARTERS.splice(WORK_STARTERS.indexOf(broken), 1)
  }
})

it('a failed batch does not stop the next one', async () => {
  await runInDurableObject(freshVault(), async (_v, state) => {
    for (let n = 0; n < 1001; n += 1) reserveObject(at(state, t0), keyOf(state), 'export')
    const batches: number[] = []
    const failing = {
      delete: async (keys: string | string[]) => {
        batches.push(Array.isArray(keys) ? keys.length : 1)
        throw new Error('R2 is down')
      },
    } as unknown as VaultBucket
    const now = t0 + RESERVATION_GRACE_MS
    expect(await deleteDueObjects({ context: () => at(state, now), bucket: failing })).toBe(0)
    expect(batches).toEqual([1000, 1])
    expect(state.storage.sql.exec("SELECT count(*) AS n FROM vault_objects WHERE status = 'reserved' AND delete_after = ?", now + DELETE_RETRY_MS).one()).toEqual({ n: 1001 })
  })
}, 60_000)

it('releasing a tombstone keeps its second delete a day later', async () => {
  await runInDurableObject(freshVault(), (_v, state) => {
    const key = keyOf(state, 'receipt')
    reserveObject(at(state, t0), key, 'receipt')
    publishObject(at(state, t0), key, { bytes: 3, sha256: SHA }, null)
    tombstoneObjects(at(state, t0), [key])
    releaseObject(at(state, t0 + 1), key)
    expect(rowOf(state, key)).toEqual([{ status: 'tombstone', delete_after: t0 + TOMBSTONE_MS }])
    expect(dueObjectKeys(at(state, t0 + 1))).toEqual([])
  })
})

it('a failed delete leaves a deadline a writer moved during it', async () => {
  await runInDurableObject(freshVault(), async (_v, state) => {
    const key = keyOf(state)
    reserveObject(at(state, t0), key, 'export')
    const now = t0 + RESERVATION_GRACE_MS
    const forgetThenFail = {
      delete: async () => {
        // The writer deletes the key itself and forgets it while the alarm's delete is in flight; then R2 fails.
        tombstoneObjects(at(state, now + 1), [key])
        throw new Error('R2 is down')
      },
    } as unknown as VaultBucket
    expect(await deleteDueObjects({ context: () => at(state, now), bucket: forgetThenFail })).toBe(0)
    expect(rowOf(state, key)).toEqual([{ status: 'tombstone', delete_after: now + 1 + TOMBSTONE_MS }])
  })
})
