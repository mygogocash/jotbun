// Resync snapshots on SnapshotWorkflow (1B-T8, B5, B14, owner answer 4). Ports
// apps/api/src/sync/snapshot-builder.integration.spec.ts (14 cases: 13 ported,
// 1 not applicable), the snapshot halves of two cases of
// apps/api/src/privacy/retention.integration.spec.ts, and the snapshot case of
// apps/edge/test/jobs.db.test.ts. A snapshot is built by UserVault#buildSnapshot,
// the method SnapshotWorkflow's step calls: most cases call it directly (`drain`,
// or `buildSnapshot` inside the vault with a chosen bucket, clock or SQL), and
// the Workflow cases run it in Miniflare. The front door starts no work here
// unless a case says `startWork: 'auto'`.
import { env } from 'cloudflare:workers'
import { introspectWorkflowInstance, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test'
import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { isSnapshotChunk } from '@gogospend/contracts'
import type { EntityChange, ExportDto, SnapshotChunk, SnapshotDto, SyncChangesPage } from '@gogospend/contracts'

import { derivedUuid } from '@api/commands/derived-id'
import { decodeSyncCursor } from '@api/sync/sync-cursor'

import type { V1Env } from '../../src/v1/env'
import { VAULT_EXPORT_MAX_BYTES, writeExport } from '../../src/vault/files/exports'
import type { VaultBucket } from '../../src/vault/files/keys'
import { RESERVATION_GRACE_MS, deleteDueObjects, dueObjectKeys } from '../../src/vault/files/objects'
import { SNAPSHOT_CHUNK_BYTES, SNAPSHOT_KEEP_MS, SNAPSHOT_PENDING_MS, buildSnapshot, pruneSnapshots, purgeWatermark, snapshotsDueAt } from '../../src/vault/files/snapshots'
import type { SnapshotWriter } from '../../src/vault/files/snapshots'
import { SNAPSHOT_STARTER, START_RETRY_MS, WORK_STARTERS } from '../../src/vault/files/work'
import { runDue } from '../../src/vault/retention'
import type { UserVault, VaultEnv } from '../../src/vault/user-vault'
import { DAY, HOUR, MIN, fileAt, seedLedger, seedRecords, setVaultClock, spyBucket, storedKeys, vaultExec, vaultIdOf, vaultRows } from './support/files'
import { builtinId, moneyFixtures } from './support/money-fixtures'
import { TEST_POLICIES, member, startV1, vaultOf } from './support/v1-client'
import type { TestUser, V1Client } from './support/v1-client'

type Body = Record<string, any>
type Ready = Extract<SnapshotDto, { status: 'ready' }>

const json = async (res: Response): Promise<Body> => {
  const text = await res.text()
  return text ? (JSON.parse(text) as Body) : {}
}

const sha256Of = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

/** A front door whose `starts` routes start nothing, unless a case runs the Workflow (`startWork: 'auto'`). */
async function setup(options: { startWork?: 'auto' | 'manual'; env?: Partial<V1Env> } = {}) {
  const v1 = await startV1(undefined, { startWork: options.startWork ?? 'manual', ...(options.env ? { env: options.env } : {}) })
  return { v1, money: moneyFixtures(v1) }
}

/** The vault's snapshot id for a request key, as it derives it. */
const snapshotIdOf = (user: TestUser, key: string) => derivedUuid(user.sub, 'snapshot-request', key)

/** POST /v1/sync/snapshots with an idempotency key (a fresh one unless given). */
async function requestSnapshot(v1: V1Client, user: TestUser, key: string = randomUUID()): Promise<{ status: number; body: Body; key: string; id: string }> {
  const res = await v1.as(user).post('/v1/sync/snapshots', {}, { key })
  return { status: res.status, body: await json(res), key, id: snapshotIdOf(user, key) }
}

/** Builds every pending snapshot through the vault's own method, as SnapshotWorkflow's step does. */
async function drain(user: TestUser): Promise<void> {
  for (const { id } of await vaultRows<{ id: string }>(user, "SELECT id FROM snapshots WHERE status = 'pending' ORDER BY created_at, id")) await vaultOf(user).buildSnapshot(id)
}

/** GET /v1/sync/snapshots/:id, which must answer 200. */
async function statusOf(v1: V1Client, user: TestUser, id: string): Promise<SnapshotDto> {
  const res = await v1.as(user).get(`/v1/sync/snapshots/${id}`)
  expect(res.status).toBe(200)
  return (await json(res)) as SnapshotDto
}

/** What buildSnapshot runs with inside the vault: the vault clock from `clock`, the bucket and SQL given (R2 and the vault's own by default), and the vault's own active check. */
function writerOf(vault: UserVault, state: DurableObjectState, opts: { bucket?: VaultBucket; clock?: () => number; sql?: SqlStorage } = {}): SnapshotWriter {
  return {
    context: () => ({ ...fileAt(state, (opts.clock ?? Date.now)()), ...(opts.sql ? { sql: opts.sql } : {}) }),
    bucket: opts.bucket ?? env.OBJECTS,
    active: (c) => vault.isActive(c),
  }
}

/** One build inside the vault, with a chosen bucket or clock and chunk options. */
const build = (user: TestUser, id: string, opts: { bucket?: VaultBucket; clock?: () => number } = {}, options: { chunkBytes?: number; maxBytes?: number } = {}) =>
  runInDurableObject(vaultOf(user), (vault: UserVault, state) => buildSnapshot(writerOf(vault, state, opts), id, options))

/** A requested snapshot, built and ready (with `options` when given, else as the Workflow builds it). */
async function readySnapshot(v1: V1Client, user: TestUser, options?: { chunkBytes?: number }): Promise<Ready> {
  const requested = await requestSnapshot(v1, user)
  expect(requested.status).toBe(202)
  if (options) expect((await build(user, requested.id, {}, options)).outcome).toBe('ready')
  else await drain(user)
  const dto = await statusOf(v1, user, requested.id)
  expect(dto.status).toBe('ready')
  return dto as Ready
}

/** Every chunk of a ready snapshot, through its grant, each checked against its size, digest and the chunk contract. */
async function download(v1: V1Client, user: TestUser, dto: Ready): Promise<SnapshotChunk[]> {
  const chunks: SnapshotChunk[] = []
  for (const grant of dto.chunks) {
    const res = await v1.as(user).get(`/v1/sync/snapshot-chunks/${grant.grant}`)
    expect(res.status).toBe(200)
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect([bytes.byteLength, sha256Of(bytes)]).toEqual([grant.bytes, grant.sha256])
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown
    expect(isSnapshotChunk(parsed)).toBe(true)
    chunks.push(parsed as SnapshotChunk)
  }
  return chunks
}

const entitiesOf = (chunks: SnapshotChunk[]): EntityChange[] => chunks.flatMap((chunk) => chunk.entities)
const snapshotsOf = (user: TestUser) => vaultRows<{ id: string; status: string; started_at: string | null }>(user, 'SELECT id, status, started_at FROM snapshots ORDER BY created_at, id')
const chunkRowsOf = (user: TestUser, id: string) =>
  vaultRows<{ chunk_index: number; object_key: string; bytes: number }>(user, 'SELECT chunk_index, object_key, bytes FROM snapshot_chunks WHERE snapshot_id = ? ORDER BY chunk_index', id)
const snapshotKeys = (user: TestUser) => storedKeys(`sync_snapshot/${vaultIdOf(user)}/`)
const registryOf = (user: TestUser) =>
  vaultRows<{ key: string; status: string; delete_after: number; created_at: number }>(user, "SELECT key, status, delete_after, created_at FROM vault_objects WHERE purpose = 'sync_snapshot' ORDER BY created_at, key")
const revisionOf = async (user: TestUser) => (await vaultRows<{ revision: string }>(user, 'SELECT CAST(revision AS TEXT) AS revision FROM sync_state WHERE id = 1'))[0].revision
const headsOf = (user: TestUser) => vaultRows<{ id: string; version: number; state: string }>(user, 'SELECT entity_id AS id, version, state FROM entity_heads ORDER BY entity_id')
const watermarkOf = (user: TestUser) => runInDurableObject(vaultOf(user), (_vault, state) => purgeWatermark(fileAt(state, Date.now())))

/** A stored object as the bucket gives it, with its body replaced and any whole read refused (1B-T6's helper). */
function streamedOnly(found: NonNullable<Awaited<ReturnType<VaultBucket['get']>>>, body: unknown) {
  return {
    key: found.key,
    size: found.size,
    uploaded: found.uploaded,
    customMetadata: found.customMetadata,
    httpMetadata: found.httpMetadata,
    body,
    arrayBuffer: () => Promise.reject(new Error('read whole')),
  } as unknown as Awaited<ReturnType<VaultBucket['get']>>
}

/** The vault's SQL with the entity read watched (B14): the cursor of a statement that reads entity_heads counts the rows it yields and refuses toArray. */
function watchedSql(sql: SqlStorage, seen: { reads: number; rows: number }): SqlStorage {
  return {
    get databaseSize() {
      return sql.databaseSize
    },
    exec(query: string, ...bindings: unknown[]) {
      const cursor = sql.exec(query, ...bindings)
      if (!/\bentity_heads\b/.test(query)) return cursor
      seen.reads += 1
      const rows = (function* () {
        for (const row of cursor) {
          seen.rows += 1
          yield row
        }
      })()
      const refuse = () => {
        throw new Error('the entity read must iterate its cursor')
      }
      return { toArray: refuse, one: refuse, raw: refuse, next: () => rows.next(), [Symbol.iterator]: () => rows }
    },
  } as unknown as SqlStorage
}

/** A member with a Cash wallet and `count` records noted `entry <n>`. */
async function diary(v1: V1Client, money: ReturnType<typeof moneyFixtures>, count: number) {
  const user = await money.member()
  const cash = await money.wallet(user)
  const records: string[] = []
  for (let i = 0; i < count; i += 1) records.push(await money.record(user, { type: 'expense', amount_minor: String(1000 + i), occurred_on: '2026-03-05', wallet_id: cash, category_id: builtinId(user, 'food'), note: `entry ${i}` }))
  return { user, cash, records }
}

const NOTE = 'secret lunch with a private person'

/** A member with one lunch noted NOTE, then deleted: its record id. */
async function deletedLunch(v1: V1Client, money: ReturnType<typeof moneyFixtures>) {
  const user = await money.member()
  const cash = await money.wallet(user, { tracking_start: '2026-10-01' })
  const record = await money.record(user, { type: 'expense', amount_minor: '6500', occurred_on: '2026-10-20', wallet_id: cash, category_id: builtinId(user, 'food'), note: NOTE })
  expect((await v1.as(user).del(`/v1/transactions/${record}`, { ifMatch: 1 })).status).toBe(200)
  return { user, record }
}

/** Moves the record's history and its deletion 31 days back (the API spec's `age`), so the purge alarm takes it (1A-T8b). */
async function age(user: TestUser, id: string): Promise<void> {
  const at = new Date(Date.now() - 31 * DAY).toISOString()
  await vaultExec(user, "UPDATE entity_changes SET committed_at = ? WHERE entity = 'transaction' AND entity_id = ?", at, id)
  await vaultExec(user, 'UPDATE transactions SET deleted_at = ? WHERE id = ? AND deleted_at IS NOT NULL', at, id)
}

const headOf = async (user: TestUser, id: string) =>
  (await vaultRows<{ version: number; state: string; revision: string }>(user, 'SELECT version, state, CAST(revision AS TEXT) AS revision FROM entity_heads WHERE entity_id = ?', id))[0]

describe('consistent snapshots, ported from snapshot-builder.integration.spec.ts', () => {
  it('applying the snapshot and then later deltas yields every latest entity exactly once, from one view', async () => {
    // Changed form: the vault reads in one synchronous pass, so nothing commits inside the read. The three
    // writes commit through the front door while the first chunk is being stored, after the read and
    // before the record: the snapshot is the view at its high water, and later deltas carry them.
    const { v1, money } = await setup()
    const { user, cash, records: made } = await diary(v1, money, 6)
    expect((await v1.as(user).del(`/v1/transactions/${made[0]}`, { ifMatch: 1 })).status).toBe(200)
    const requested = await requestSnapshot(v1, user)
    expect([requested.status, requested.body]).toEqual([202, { snapshot_id: requested.id, status: 'pending' }])
    expect(await statusOf(v1, user, requested.id)).toEqual({ snapshot_id: requested.id, status: 'pending' })
    const highWater = await revisionOf(user)
    let writes = 0
    const late = spyBucket({
      beforePut: async () => {
        if (writes > 0) return
        await money.record(user, { type: 'expense', amount_minor: '1', occurred_on: '2026-03-06', wallet_id: cash, category_id: builtinId(user, 'food'), note: 'late 1' })
        await money.record(user, { type: 'expense', amount_minor: '2', occurred_on: '2026-03-06', wallet_id: cash, category_id: builtinId(user, 'food'), note: 'late 2' })
        expect((await v1.as(user).del(`/v1/transactions/${made[1]}`, { ifMatch: 1 })).status).toBe(200)
        writes += 3
      },
    })
    expect((await build(user, requested.id, { bucket: late }, { chunkBytes: 400 })).outcome).toBe('ready')
    expect(writes).toBe(3)

    const ready = await statusOf(v1, user, requested.id)
    expect(ready).toMatchObject({ snapshot_id: requested.id, status: 'ready', schema_version: 1, high_water: highWater })
    if (ready.status !== 'ready') throw new Error('not ready')
    expect(decodeSyncCursor(user.sub, ready.cursor)).toBe(highWater)
    expect(Math.abs(Date.parse(ready.expires_at) - (Date.now() + 24 * HOUR))).toBeLessThan(5 * MIN)
    expect(ready.chunks.length).toBeGreaterThan(1)
    expect(ready.chunks.map((chunk) => chunk.index)).toEqual(ready.chunks.map((_chunk, index) => index))
    expect(JSON.stringify(ready)).not.toContain('sync_snapshot/')

    const chunks = await download(v1, user, ready)
    expect(chunks.map((chunk) => [chunk.snapshot_id, chunk.high_water, chunk.index])).toEqual(chunks.map((_chunk, index) => [requested.id, highWater, index]))
    // Every entity in the API's order: by entity, then by id.
    const order = entitiesOf(chunks).map((e) => `${e.entity} ${e.id}`)
    expect(order).toEqual([...order].sort())
    const state = new Map<string, EntityChange>()
    for (const entity of entitiesOf(chunks)) {
      expect(state.has(entity.id)).toBe(false)
      state.set(entity.id, entity)
    }
    // The view is the one at the high water: the ten built-in categories, the wallet and the six records; the concurrent delete is not in it.
    expect(state.size).toBe(17)
    expect(state.get(made[0])).toMatchObject({ version: 2, state: 'deleted' })
    expect(state.get(made[1])).toMatchObject({ version: 1, state: 'active' })
    // Each snapshot keeps the API's jsonb key order (ruling R92).
    expect(Object.keys(state.get(cash)?.snapshot as object)).toEqual(['id', 'name', 'version', 'archived', 'currency', 'opening_minor', 'tracking_start'])
    expect(Object.keys(state.get(made[2])?.snapshot as object)).toEqual(['id', 'note', 'type', 'version', 'merchant', 'wallet_id', 'deleted_at', 'category_id', 'occurred_on', 'amount_minor'])

    const later = await json(await v1.as(user).get(`/v1/sync/changes?cursor=${encodeURIComponent(ready.cursor)}`))
    const page = later as SyncChangesPage
    expect(page.groups.map((group) => group.revision)).toEqual([1n, 2n, 3n].map((n) => String(BigInt(highWater) + n)))
    for (const change of page.groups.flatMap((group) => group.changes)) {
      const known = state.get(change.id)
      if (!known || known.version < change.version) state.set(change.id, change)
    }
    expect([...state.values()].map((e) => ({ id: e.id, version: e.version, state: e.state })).sort((a, b) => a.id.localeCompare(b.id))).toEqual(await headsOf(user))

    expect((await snapshotsOf(user)).map((row) => row.status)).toEqual(['ready'])
    const published = (await registryOf(user)).filter((row) => row.status === 'published')
    expect(published).toHaveLength(ready.chunks.length)
    expect(new Set(published.map((row) => row.delete_after))).toEqual(new Set([Date.parse(ready.expires_at)]))
  })

  it('an account deletion during the build publishes nothing, and its chunks are swept', async () => {
    const { v1, money } = await setup()
    const { user } = await diary(v1, money, 4)
    const { id } = await requestSnapshot(v1, user)
    const now = Date.now()
    const outcome = await runInDurableObject(vaultOf(user), (vault: UserVault, state) => {
      const deleting = spyBucket({ afterPut: () => void state.storage.sql.exec("UPDATE account_state SET status = 'deleting' WHERE id = 1").toArray() })
      return buildSnapshot(writerOf(vault, state, { bucket: deleting, clock: () => now }), id, { chunkBytes: 300 })
    })
    expect(outcome.outcome).toBe('skipped')
    expect(await chunkRowsOf(user, id)).toEqual([])
    expect((await snapshotsOf(user)).map((row) => row.status)).toEqual(['pending'])
    const registry = await registryOf(user)
    expect(registry.length).toBeGreaterThan(1)
    expect(new Set(registry.map((row) => row.status))).toEqual(new Set(['reserved']))
    expect(await snapshotKeys(user)).toHaveLength(registry.length)
    await runInDurableObject(vaultOf(user), (_vault, state) => deleteDueObjects({ context: () => fileAt(state, now + 2 * HOUR), bucket: env.OBJECTS }))
    expect(await snapshotKeys(user)).toEqual([])
  })

  it('a build that runs out of time publishes no manifest', async () => {
    // Changed form: a vault build has no lease. Its time is its reservations' (RESERVATION_GRACE_MS), and a writer never
    // publishes past it, even when a failed delete moved delete_after a minute on (1B-T4 follow-up). The record reads the
    // clock after the PUT; past the deadline it throws, so the step retries under a fresh token.
    const { v1, money } = await setup()
    const { user } = await diary(v1, money, 4)
    const { id } = await requestSnapshot(v1, user)
    let now = Date.now()
    await expect(
      runInDurableObject(vaultOf(user), (vault: UserVault, state) => {
        const slow = spyBucket({
          afterPut: (key) => {
            now += RESERVATION_GRACE_MS
            state.storage.sql.exec('UPDATE vault_objects SET delete_after = ? WHERE key = ?', now + MIN, key).toArray()
          },
        })
        return buildSnapshot(writerOf(vault, state, { bucket: slow, clock: () => now }), id)
      }),
    ).rejects.toThrow()
    expect(await chunkRowsOf(user, id)).toEqual([])
    expect((await registryOf(user)).map((row) => row.status)).toEqual(['reserved'])
    expect(await statusOf(v1, user, id)).toEqual({ snapshot_id: id, status: 'pending' })
    // The step's retry writes under a fresh token and records it.
    expect(await vaultOf(user).buildSnapshot(id)).toEqual({ outcome: 'ready' })
    expect((await registryOf(user)).map((row) => row.status)).toEqual(['reserved', 'published'])
  })

  it('an empty account still gets a one-chunk snapshot at its high-water', async () => {
    const { v1 } = await setup()
    const user = await member(v1)
    const dto = await readySnapshot(v1, user)
    expect(dto.chunks).toHaveLength(1)
    expect(await download(v1, user, dto)).toEqual([{ schema_version: 1, snapshot_id: dto.snapshot_id, high_water: '0', index: 0, entities: [] }])
  })

  it('refuses to publish an entity that does not match its persisted DTO', async () => {
    // The API's builder ran with no validators; here a stored change no longer matches its wallet DTO.
    const { v1, money } = await setup()
    const { user } = await diary(v1, money, 1)
    await vaultExec(user, "UPDATE entity_changes SET snapshot = json_set(snapshot, '$.archived', 'no') WHERE entity = 'wallet'")
    const { id } = await requestSnapshot(v1, user)
    await expect(build(user, id)).rejects.toThrow()
    expect(await chunkRowsOf(user, id)).toEqual([])
    expect(await registryOf(user)).toEqual([])
    expect(await snapshotKeys(user)).toEqual([])
    expect((await snapshotsOf(user)).map((row) => row.status)).toEqual(['pending'])
  })
})

describe('snapshot requests, status and grants, ported from snapshot-builder.integration.spec.ts', () => {
  it('requests are idempotent, share an open build, and reuse a snapshot from the last hour', async () => {
    // Changed form: the vault judges reuse by ready_at (the plan), so the aged snapshot's ready_at moves back.
    const { v1, money } = await setup()
    const { user } = await diary(v1, money, 1)
    const first = await requestSnapshot(v1, user)
    expect([first.status, first.body]).toEqual([202, { snapshot_id: first.id, status: 'pending' }])
    expect((await requestSnapshot(v1, user, first.key)).body).toEqual(first.body)
    expect((await requestSnapshot(v1, user)).body).toEqual(first.body)
    await drain(user)
    const reused = await requestSnapshot(v1, user)
    expect([reused.status, reused.body.snapshot_id, reused.body.status]).toEqual([200, first.id, 'ready'])
    await vaultExec(user, 'UPDATE snapshots SET ready_at = ?, expires_at = ? WHERE id = ?', new Date(Date.now() - 2 * HOUR).toISOString(), new Date(Date.now() + 22 * HOUR).toISOString(), first.id)
    const fresh = await requestSnapshot(v1, user)
    expect([fresh.status, fresh.body]).toEqual([202, { snapshot_id: fresh.id, status: 'pending' }])
    expect(fresh.id).not.toBe(first.id)
    expect(await statusOf(v1, user, fresh.id)).toEqual({ snapshot_id: fresh.id, status: 'pending' })
  })

  it("grants are short-lived, bound to the owner, and refuse another account's snapshot", async () => {
    const { v1, money } = await setup()
    const { user } = await diary(v1, money, 1)
    const other = await money.member()
    const ready = await readySnapshot(v1, user)
    const [chunk] = ready.chunks
    const url = (grant: string) => `/v1/sync/snapshot-chunks/${grant}`
    expect(Date.parse(chunk.grant_expires_at) - Date.now()).toBeLessThanOrEqual(5 * MIN + 1000)
    const own = await v1.as(user).get(url(chunk.grant))
    expect(own.status).toBe(200)
    await own.arrayBuffer()
    expect((await v1.as(other).get(url(chunk.grant))).status).toBe(404)
    expect((await v1.as(other).get(`/v1/sync/snapshots/${ready.snapshot_id}`)).status).toBe(404)
    await setVaultClock(user, Date.now() + 6 * MIN)
    expect((await v1.as(user).get(url(chunk.grant))).status).toBe(404)
    await setVaultClock(user, null)
    const tampered = chunk.grant.slice(0, -2) + (chunk.grant.endsWith('AA') ? 'BB' : 'AA')
    expect((await v1.as(user).get(url(tampered))).status).toBe(404)
    expect((await v1.as(user).get(url('garbage'))).status).toBe(404)
    // The download step checks the session (VAULT_STEP_ROUTES): after sign-out the same grant is refused.
    expect((await v1.as(user).post('/v1/me/logout')).status).toBe(204)
    expect((await v1.as(user).get(url(chunk.grant))).status).toBe(401)
  })

  it('reports failed and expired snapshots, and grants nothing for them', async () => {
    const { v1, money } = await setup()
    const { user } = await diary(v1, money, 1)
    const failed = await requestSnapshot(v1, user)
    await vaultOf(user).failSnapshot(failed.id)
    expect(await statusOf(v1, user, failed.id)).toEqual({ snapshot_id: failed.id, status: 'failed' })
    // A resent request names its own snapshot, failed as it is.
    expect(await requestSnapshot(v1, user, failed.key)).toMatchObject({ status: 202, body: { snapshot_id: failed.id, status: 'failed' } })
    const ready = await readySnapshot(v1, user)
    expect(ready.snapshot_id).not.toBe(failed.id)
    await vaultExec(user, 'UPDATE snapshots SET ready_at = ?, expires_at = ? WHERE id = ?', new Date(Date.now() - 25 * HOUR).toISOString(), new Date(Date.now() - HOUR).toISOString(), ready.snapshot_id)
    expect(await statusOf(v1, user, ready.snapshot_id)).toEqual({ snapshot_id: ready.snapshot_id, status: 'expired' })
    expect((await v1.as(user).get(`/v1/sync/snapshot-chunks/${ready.chunks[0].grant}`)).status).toBe(404)
  })

  it('SnapshotWorkflow runs the build', async () => {
    // Changed form of `the worker runs snapshot jobs through the registered handler`: the vault's pending work holds
    // the snapshot starter, and the front door's hand-off starts SnapshotWorkflow, whose step builds the snapshot.
    expect(WORK_STARTERS).toContain(SNAPSHOT_STARTER)
    const { v1, money } = await setup({ startWork: 'auto' })
    const { user } = await diary(v1, money, 1)
    const key = randomUUID()
    const instance = await introspectWorkflowInstance(env.SNAPSHOT_WORKFLOW, snapshotIdOf(user, key))
    try {
      expect((await requestSnapshot(v1, user, key)).status).toBe(202)
      await v1.settle()
      // The front door's hand-off started it: the row is marked, so the instance exists.
      expect((await snapshotsOf(user)).map((row) => row.started_at === null)).toEqual([false])
      await instance.waitForStatus('complete')
      expect(await instance.getOutput()).toEqual({ outcome: 'ready' })
    } finally {
      await instance.dispose()
    }
    expect((await statusOf(v1, user, snapshotIdOf(user, key))).status).toBe('ready')
  }, 30_000)
})

describe('S1 review: one view and bounded work, ported from snapshot-builder.integration.spec.ts', () => {
  const fixed = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  const LATE = 'ffffffff-ffff-4fff-bfff-ffffffffffff'

  it('every entity comes from the high-water view even when writes land between single-entity pages', async () => {
    // Changed form: there are no pages. Every chunk holds one entity (chunkBytes 1), and the writes land
    // while the first chunk is being stored, after the one read.
    const { v1, money } = await setup()
    const user = await money.member()
    const cash = await money.wallet(user)
    for (const n of [1, 2, 3]) await money.record(user, { id: fixed(n), type: 'expense', amount_minor: '100', occurred_on: '2026-03-05', wallet_id: cash, category_id: builtinId(user, 'food') })
    expect((await v1.as(user).del(`/v1/transactions/${fixed(1)}`, { ifMatch: 1 })).status).toBe(200)
    const { id } = await requestSnapshot(v1, user)
    const highWater = await revisionOf(user)
    const heads = (await headsOf(user)).length
    let writes = 0
    const late = spyBucket({
      beforePut: async () => {
        if (writes > 0) return
        await money.record(user, { id: LATE, type: 'expense', amount_minor: '100', occurred_on: '2026-03-05', wallet_id: cash, category_id: builtinId(user, 'food'), note: 'late' })
        expect((await v1.as(user).del(`/v1/transactions/${fixed(3)}`, { ifMatch: 1 })).status).toBe(200)
        writes += 2
      },
    })
    expect((await build(user, id, { bucket: late }, { chunkBytes: 1 })).outcome).toBe('ready')
    expect(writes).toBe(2)
    const ready = await statusOf(v1, user, id)
    expect(ready).toMatchObject({ status: 'ready', high_water: highWater })
    const chunks = await download(v1, user, ready as Ready)
    expect(chunks.map((chunk) => chunk.entities.length)).toEqual(Array.from({ length: heads }, () => 1))
    const records = entitiesOf(chunks).filter((e) => e.entity === 'transaction').map((e) => [e.id, e.version, e.state])
    expect(records).toEqual([[fixed(1), 2, 'deleted'], [fixed(2), 1, 'active'], [fixed(3), 1, 'active']])
  })

  it('reads every row before the first R2 call', async () => {
    // Changed form of `closes the read transaction before uploading chunks`: the vault's read is one synchronous pass,
    // and the bucket records how many entity rows had been read when its first call came.
    const { v1, money } = await setup()
    const { user } = await diary(v1, money, 3)
    const { id } = await requestSnapshot(v1, user)
    const heads = (await headsOf(user)).length
    const seen = { reads: 0, rows: 0 }
    const calls: { call: string; rows: number }[] = []
    const watched: VaultBucket = {
      put: (key, value, options) => {
        calls.push({ call: 'put', rows: seen.rows })
        return env.OBJECTS.put(key, value, options)
      },
      head: (key) => {
        calls.push({ call: 'head', rows: seen.rows })
        return env.OBJECTS.head(key)
      },
      get: (key) => {
        calls.push({ call: 'get', rows: seen.rows })
        return env.OBJECTS.get(key)
      },
      delete: (keys) => {
        calls.push({ call: 'delete', rows: seen.rows })
        return env.OBJECTS.delete(keys)
      },
      list: (options) => {
        calls.push({ call: 'list', rows: seen.rows })
        return env.OBJECTS.list(options)
      },
    }
    const outcome = await runInDurableObject(vaultOf(user), (vault: UserVault, state) =>
      buildSnapshot(writerOf(vault, state, { bucket: watched, sql: watchedSql(state.storage.sql, seen) }), id, { chunkBytes: 300 }),
    )
    expect(outcome.outcome).toBe('ready')
    expect(seen).toEqual({ reads: 1, rows: heads })
    expect(calls.length).toBeGreaterThan(1)
    expect(calls.every((call) => call.call === 'put' && call.rows === heads)).toBe(true)
  })

  it('a head whose change row is missing fails the build instead of vanishing from it', async () => {
    const { v1, money } = await setup()
    const { user, records } = await diary(v1, money, 2)
    await vaultExec(user, "DELETE FROM entity_changes WHERE entity = 'transaction' AND entity_id = ?", records[0])
    const { id } = await requestSnapshot(v1, user)
    await expect(build(user, id)).rejects.toThrow()
    expect(await chunkRowsOf(user, id)).toEqual([])
    expect(await snapshotKeys(user)).toEqual([])
  })

  it('keeps chunks near their target size and grants within the snapshot expiry', async () => {
    const { v1, money } = await setup()
    const { user } = await diary(v1, money, 8)
    const ready = await readySnapshot(v1, user, { chunkBytes: 500 })
    expect(ready.chunks.length).toBeGreaterThan(2)
    expect(ready.chunks.every((chunk) => chunk.bytes <= 500 + 400)).toBe(true)
    await vaultExec(user, 'UPDATE snapshots SET expires_at = ? WHERE id = ?', new Date(Date.now() + 2 * MIN).toISOString(), ready.snapshot_id)
    const soon = await statusOf(v1, user, ready.snapshot_id)
    if (soon.status !== 'ready') throw new Error('not ready')
    expect(soon.chunks.every((chunk) => Date.parse(chunk.grant_expires_at) <= Date.parse(soon.expires_at))).toBe(true)
    // A grant's expiry is whole seconds (SnapshotGrants), so the capped one is the expiry's second.
    expect(Date.parse(soon.chunks[0].grant_expires_at)).toBe(Math.floor(Date.parse(soon.expires_at) / 1000) * 1000)
  })
})

describe('retention, the snapshot halves of retention.integration.spec.ts', () => {
  it('tombstones reach delta readers, older cursors resync, and snapshots built before the purge are dropped', async () => {
    // The snapshot half (1A-T8b ported the delta half in retention.test.ts). A snapshot built after the deletion still
    // carries the deleted record's data. The purge alarm also runs the file jobs (1B-T11), so after it the snapshot
    // reads expired and serves nothing, its chunks are deleted from R2 (kept a day as tombstones, B19), and a new
    // request builds another. Changed form (1B-T8's review m-1, fixed in 1B-T11): the dropped snapshot keeps its row,
    // so a resend of its key reads expired, as the API's kept job does; only its chunk rows go.
    const { v1, money } = await setup()
    const { user, record } = await deletedLunch(v1, money)
    const before = await readySnapshot(v1, user)
    expect(JSON.stringify(entitiesOf(await download(v1, user, before)))).toContain(NOTE)
    const keys = (await chunkRowsOf(user, before.snapshot_id)).map((row) => row.object_key)
    await age(user, record)
    expect(await runDurableObjectAlarm(vaultOf(user))).toBe(true)
    const head = await headOf(user, record)
    expect(head).toMatchObject({ version: 3, state: 'purged' })
    expect(await watermarkOf(user)).toBe(head.revision)

    expect(await statusOf(v1, user, before.snapshot_id)).toEqual({ snapshot_id: before.snapshot_id, status: 'expired' })
    expect((await v1.as(user).get(`/v1/sync/snapshot-chunks/${before.chunks[0].grant}`)).status).toBe(404)
    const again = await requestSnapshot(v1, user)
    expect([again.status, again.body]).toEqual([202, { snapshot_id: again.id, status: 'pending' }])

    expect((await snapshotsOf(user)).map((row) => row.id).sort()).toEqual([before.snapshot_id, again.id].sort())
    expect(await chunkRowsOf(user, before.snapshot_id)).toEqual([])
    const registry = await registryOf(user)
    expect(keys.map((key) => registry.find((row) => row.key === key)?.status)).toEqual(keys.map(() => 'tombstone'))
    for (const key of keys) expect(await env.OBJECTS.head(key)).toBeNull()

    // A new snapshot reads the head's own change: a tombstone without data.
    await drain(user)
    const entities = entitiesOf(await download(v1, user, (await statusOf(v1, user, again.id)) as Ready))
    expect(entities.find((e) => e.id === record)).toEqual({ entity: 'transaction', id: record, version: 3, state: 'purged', snapshot: null })
    expect(JSON.stringify(entities)).not.toContain(NOTE)
  })

  it('a snapshot read before a purge is never recorded afterwards, so it cannot serve the purged data', async () => {
    // The purge runs while the build stores its chunks, after its read. The record refuses a view below the purge
    // watermark and throws (planner ruling P4: the step retries, as the API retries snapshot_not_recorded); the
    // retry reads after the purge and is recorded.
    const { v1, money } = await setup()
    const { user, record } = await deletedLunch(v1, money)
    await age(user, record)
    const { id } = await requestSnapshot(v1, user)
    let purged = false
    await expect(
      runInDurableObject(vaultOf(user), (vault: UserVault, state) => {
        const purging = spyBucket({
          beforePut: () => {
            if (purged) return
            expect(runDue({ sql: state.storage.sql, storage: state.storage, now: new Date() })).toEqual([])
            purged = true
          },
        })
        return buildSnapshot(writerOf(vault, state, { bucket: purging }), id)
      }),
    ).rejects.toThrow()
    expect(purged).toBe(true)
    const head = await headOf(user, record)
    expect(head).toMatchObject({ version: 3, state: 'purged' })
    expect(await watermarkOf(user)).toBe(head.revision)
    expect(await chunkRowsOf(user, id)).toEqual([])
    expect(await statusOf(v1, user, id)).toEqual({ snapshot_id: id, status: 'pending' })
    // What it stored still holds the note, but nothing is published: its key stays reserved, due at its deadline.
    const [stored] = await registryOf(user)
    expect((await registryOf(user)).map((row) => row.status)).toEqual(['reserved'])
    const kept = await env.OBJECTS.get(stored.key)
    expect(kept && new TextDecoder().decode(await kept.arrayBuffer())).toContain(NOTE)

    expect(await vaultOf(user).buildSnapshot(id)).toEqual({ outcome: 'ready' })
    const entities = entitiesOf(await download(v1, user, (await statusOf(v1, user, id)) as Ready))
    expect(entities.find((e) => e.id === record)).toEqual({ entity: 'transaction', id: record, version: 3, state: 'purged', snapshot: null })
    expect(JSON.stringify(entities)).not.toContain(NOTE)
  })
})

describe('the jobs Worker snapshot, ported from apps/edge/test/jobs.db.test.ts', () => {
  it('builds a requested snapshot, whose chunks the edge then serves', async () => {
    const { v1, money } = await setup()
    const user = await money.member()
    const wallet = await money.wallet(user, { name: 'เงินสด', opening_minor: '100000', tracking_start: '2026-10-01' })
    await money.record(user, { type: 'expense', amount_minor: '6000', occurred_on: '2026-10-20', wallet_id: wallet, category_id: builtinId(user, 'food'), merchant: 'ข้าวมันไก่' })
    const requested = await requestSnapshot(v1, user)
    expect(requested.status).toBe(202)
    await drain(user)
    const ready = await statusOf(v1, user, requested.body.snapshot_id)
    expect(ready).toMatchObject({ snapshot_id: requested.id, status: 'ready' })
    const entities: EntityChange[] = []
    for (const chunk of (ready as Ready).chunks) {
      const res = await v1.as(user).get(`/v1/sync/snapshot-chunks/${encodeURIComponent(chunk.grant)}`)
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('application/json')
      const text = await res.text()
      expect([Buffer.byteLength(text), createHash('sha256').update(text).digest('hex')]).toEqual([chunk.bytes, chunk.sha256])
      entities.push(...(JSON.parse(text) as SnapshotChunk).entities)
    }
    expect(entities.map((e) => e.id)).toContain(wallet)
    expect(JSON.stringify(entities)).toContain('ข้าวมันไก่')
  })
})

describe('snapshots on the vault (1B-T8)', () => {
  it('a snapshot runs on SnapshotWorkflow, and its cursor continues with /v1/sync/changes', async () => {
    const { v1, money } = await setup({ startWork: 'auto' })
    const user = await money.member()
    await money.wallet(user)
    const key = randomUUID()
    const id = snapshotIdOf(user, key)
    const instance = await introspectWorkflowInstance(env.SNAPSHOT_WORKFLOW, id)
    try {
      expect((await requestSnapshot(v1, user, key)).status).toBe(202)
      await v1.settle()
      // The front door's hand-off started it: the row is marked, so the instance exists.
      expect((await snapshotsOf(user)).map((row) => [row.id, row.started_at === null])).toEqual([[id, false]])
      await instance.waitForStatus('complete')
      expect(await instance.getOutput()).toEqual({ outcome: 'ready' })
    } finally {
      await instance.dispose()
    }
    const ready = await statusOf(v1, user, id)
    if (ready.status !== 'ready') throw new Error(`snapshot is ${ready.status}`)
    const empty = await v1.as(user).get(`/v1/sync/changes?cursor=${encodeURIComponent(ready.cursor)}`)
    expect(empty.status).toBe(200)
    expect(((await json(empty)) as SyncChangesPage).groups).toEqual([])
    const savings = await money.wallet(user, { name: 'Savings' })
    const next = (await json(await v1.as(user).get(`/v1/sync/changes?cursor=${encodeURIComponent(ready.cursor)}`))) as SyncChangesPage
    expect(next.groups.map((group) => group.changes.map((change) => [change.entity, change.id]))).toEqual([[['wallet', savings]]])
  }, 30_000)

  it('a snapshot that became ready in the last hour is reused, judged by ready_at', async () => {
    const { v1, money } = await setup()
    const { user } = await diary(v1, money, 1)
    const ready = await readySnapshot(v1, user)
    const at = (ms: number) => new Date(Date.now() + ms).toISOString()
    // Created two hours ago, ready 30 minutes ago: reused.
    await vaultExec(user, 'UPDATE snapshots SET created_at = ?, ready_at = ?, expires_at = ? WHERE id = ?', at(-2 * HOUR), at(-30 * MIN), at(23 * HOUR + 30 * MIN), ready.snapshot_id)
    const reused = await requestSnapshot(v1, user)
    expect([reused.status, reused.body.snapshot_id]).toEqual([200, ready.snapshot_id])
    // Ready 10 minutes ago, but expiring in 22 hours: not reused.
    await vaultExec(user, 'UPDATE snapshots SET ready_at = ?, expires_at = ? WHERE id = ?', at(-10 * MIN), at(22 * HOUR), ready.snapshot_id)
    const shortLived = await requestSnapshot(v1, user)
    expect([shortLived.status, shortLived.body.snapshot_id]).toEqual([202, shortLived.id])
    await vaultOf(user).failSnapshot(shortLived.id)
    // Ready 61 minutes ago, though still expiring more than 23 hours from now: not reused.
    await vaultExec(user, 'UPDATE snapshots SET ready_at = ?, expires_at = ? WHERE id = ?', at(-61 * MIN), at(23 * HOUR + 30 * MIN), ready.snapshot_id)
    const stale = await requestSnapshot(v1, user)
    expect([stale.status, stale.body.snapshot_id]).toEqual([202, stale.id])
  })

  it("a build retried after its chunks were stored completes, and the first attempt's chunks are deleted at their deadline", async () => {
    // Review Focus 2: the retry writes under a new attempt token; the first attempt's chunks are deleted at their deadline.
    const { v1, money } = await setup()
    const { user } = await diary(v1, money, 2)
    const { id } = await requestSnapshot(v1, user)
    const now = Date.now()
    await expect(build(user, id, { bucket: spyBucket({ afterPut: () => Promise.reject(new Error('lost after the put')) }), clock: () => now })).rejects.toThrow()
    const [first] = await snapshotKeys(user)
    expect(await build(user, id, { clock: () => now + MIN })).toMatchObject({ outcome: 'ready' })
    const objects = await registryOf(user)
    expect(objects.map((object) => [object.key === first, object.status])).toEqual([[true, 'reserved'], [false, 'published']])
    expect(objects[0]).toMatchObject({ delete_after: now + RESERVATION_GRACE_MS })
    await runInDurableObject(vaultOf(user), (_vault, state) => deleteDueObjects({ context: () => fileAt(state, now + RESERVATION_GRACE_MS), bucket: env.OBJECTS }))
    expect(await snapshotKeys(user)).toEqual([objects[1].key])
    expect((await statusOf(v1, user, id)).status).toBe('ready')
  })

  it('a build that finishes after the vault stopped being active publishes nothing', async () => {
    // Review Focus 1: the bucket's put marks the vault deleting before it stores.
    const { v1, money } = await setup()
    const { user } = await diary(v1, money, 1)
    const { id } = await requestSnapshot(v1, user)
    const now = Date.now()
    const outcome = await runInDurableObject(vaultOf(user), (vault: UserVault, state) => {
      const deleting = spyBucket({ beforePut: () => void state.storage.sql.exec("UPDATE account_state SET status = 'deleting' WHERE id = 1").toArray() })
      return buildSnapshot(writerOf(vault, state, { bucket: deleting, clock: () => now }), id)
    })
    expect(outcome.outcome).toBe('skipped')
    expect(await chunkRowsOf(user, id)).toEqual([])
    const [reserved] = await registryOf(user)
    expect(reserved).toMatchObject({ status: 'reserved', delete_after: now + RESERVATION_GRACE_MS })
    const due = await runInDurableObject(vaultOf(user), (_vault, state) => dueObjectKeys(fileAt(state, now + RESERVATION_GRACE_MS)).map((row) => row.key))
    expect(due).toEqual([reserved.key])
  })

  it('a build cut into more chunks than SQLite has parameters records them all', async () => {
    // Ruling R57: 150 records, one per chunk (chunkBytes 256), and every list binds as one JSON parameter.
    const { v1 } = await setup()
    const user = await member(v1)
    await seedRecords(user, 150)
    const { id } = await requestSnapshot(v1, user)
    expect((await build(user, id, {}, { chunkBytes: 256 })).outcome).toBe('ready')
    const rows = await chunkRowsOf(user, id)
    expect(rows.length).toBeGreaterThanOrEqual(150)
    expect(rows.map((row) => row.chunk_index)).toEqual(rows.map((_row, index) => index))
    const registry = await registryOf(user)
    expect(registry).toHaveLength(rows.length)
    expect(registry.every((row) => row.status === 'published')).toBe(true)
    const dto = await statusOf(v1, user, id)
    expect(dto.status === 'ready' && dto.chunks.length).toBe(rows.length)
  })

  it('a chunk is served with its exact bytes and digest, and a tampered chunk is 404', async () => {
    const { v1, money } = await setup()
    const { user } = await diary(v1, money, 3)
    const ready = await readySnapshot(v1, user, { chunkBytes: 300 })
    expect(ready.chunks.length).toBeGreaterThan(2)
    const rows = await chunkRowsOf(user, ready.snapshot_id)
    const [first, second, third] = ready.chunks
    const res = await v1.as(user).get(`/v1/sync/snapshot-chunks/${first.grant}`)
    expect([res.status, res.headers.get('content-type'), res.headers.get('content-length')]).toEqual([200, 'application/json', String(first.bytes)])
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect([bytes.byteLength, sha256Of(bytes)]).toEqual([first.bytes, first.sha256])
    expect(new TextDecoder().decode(bytes).startsWith(`{"schema_version":1,"snapshot_id":"${ready.snapshot_id}","high_water":"${ready.high_water}","index":0,"entities":[`)).toBe(true)
    // Swapped for other bytes of the same length, stored with their own digest: 404.
    const same = new Uint8Array(second.bytes).fill(0x20)
    await env.OBJECTS.delete(rows[1].object_key)
    await env.OBJECTS.put(rows[1].object_key, same, { customMetadata: { sha256: sha256Of(same) } })
    expect((await v1.as(user).get(`/v1/sync/snapshot-chunks/${second.grant}`)).status).toBe(404)
    // Swapped for bytes of another length: 404.
    await env.OBJECTS.delete(rows[2].object_key)
    await env.OBJECTS.put(rows[2].object_key, new TextEncoder().encode('{"entities":[]}'))
    expect((await v1.as(user).get(`/v1/sync/snapshot-chunks/${third.grant}`)).status).toBe(404)
  })

  it('after pruneSnapshots at snapshotsDueAt, the next snapshotsDueAt is later or null', async () => {
    const { v1 } = await setup()
    const user = await member(v1)
    const t0 = Date.now()
    const iso = (ms: number) => new Date(ms).toISOString()
    // A purged change at revision 1, so a ready snapshot read at revision 0 is below the purge watermark.
    await vaultExec(user, 'UPDATE sync_state SET revision = revision + 1 WHERE id = 1')
    await vaultExec(user, "INSERT INTO entity_changes (revision, ordinal, command_id, entity, entity_id, version, state, snapshot, committed_at) VALUES (1, 0, ?, 'transaction', ?, 2, 'purged', NULL, ?)", randomUUID(), randomUUID(), iso(t0))
    const seed = async (status: 'pending' | 'ready', highWater: number | null, created: number, expires: number | null) => {
      const id = randomUUID()
      await vaultExec(
        user,
        'INSERT INTO snapshots (id, status, high_water, chunk_count, created_at, ready_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        id, status, highWater, status === 'ready' ? 1 : null, iso(created), status === 'ready' ? iso(created) : null, expires === null ? null : iso(expires),
      )
      return id
    }
    await seed('pending', null, t0, null)
    const stale = await seed('ready', 0, t0 - 2 * HOUR, t0 + 22 * HOUR)
    await seed('ready', 1, t0 - 6 * DAY, t0 - 5 * DAY)
    await seed('ready', 1, t0 - HOUR, t0 + 23 * HOUR)
    // The stale snapshot's chunk row: due now until the prune releases it. Changed form (1B-T11, the m-1 fix): its
    // row then stays until a week past its expiry, so that is one more due time.
    await vaultExec(user, "INSERT INTO snapshot_chunks (snapshot_id, chunk_index, object_key, bytes, sha256) VALUES (?, 0, ?, 1, ?)", stale, `sync_snapshot/${vaultIdOf(user)}/${stale}/${randomUUID()}/chunk-0000.json`, 'a'.repeat(64))
    const seen: number[] = []
    await runInDurableObject(vaultOf(user), (_vault, state) => {
      let due = snapshotsDueAt(fileAt(state, t0))
      while (due !== null && seen.length < 10) {
        seen.push(due)
        pruneSnapshots(fileAt(state, due))
        const next = snapshotsDueAt(fileAt(state, due))
        if (next !== null) expect(next).toBeGreaterThan(due)
        due = next
      }
    })
    expect(seen).toEqual([t0, t0 + SNAPSHOT_PENDING_MS, t0 - 5 * DAY + SNAPSHOT_KEEP_MS, t0 + 22 * HOUR + SNAPSHOT_KEEP_MS, t0 + 23 * HOUR + SNAPSHOT_KEEP_MS])
    expect(await snapshotsOf(user)).toEqual([expect.objectContaining({ status: 'failed' })])
  })

  it('ten times the yearly ledger builds and exports inside the memory budget', async () => {
    // B14, owner answer 4, rulings R30 and R38: a vault whose SQLite file holds at least 50,000,000 bytes. The entity
    // read must iterate its cursor (the watched SQL refuses toArray and counts the rows), and the bytes the build holds at
    // once may not pass what it stores plus one chunk and its longest line. Then the whole period exports in one put.
    // The wall times are measured around each call into the vault, an upper bound on its CPU (limits.cpu_ms).
    const { v1 } = await setup()
    const user = await member(v1)
    let mark = Date.now()
    const { records } = await seedLedger(user, 50_000_000)
    const seedMs = Date.now() - mark
    const databaseSize = await runInDurableObject(vaultOf(user), (_vault, state) => state.storage.sql.databaseSize)
    expect(databaseSize).toBeGreaterThanOrEqual(50_000_000)
    const heads = (await vaultRows<{ n: number }>(user, 'SELECT count(*) AS n FROM entity_heads'))[0].n
    expect(heads).toBe(records + 2)
    const { id } = await requestSnapshot(v1, user)

    const seen = { reads: 0, rows: 0 }
    mark = Date.now()
    const result = await runInDurableObject(vaultOf(user), (vault: UserVault, state) => buildSnapshot(writerOf(vault, state, { sql: watchedSql(state.storage.sql, seen) }), id))
    const buildMs = Date.now() - mark
    expect(result.outcome).toBe('ready')
    expect(seen).toEqual({ reads: 1, rows: heads })

    const rows = await chunkRowsOf(user, id)
    let storedBytes = 0
    let longestLine = 0
    let entities = 0
    const ids = new Set<string>()
    for (const row of rows) {
      const object = await env.OBJECTS.get(row.object_key)
      expect(object).not.toBeNull()
      const bytes = new Uint8Array(await (object as NonNullable<typeof object>).arrayBuffer())
      expect(bytes.byteLength).toBe(row.bytes)
      storedBytes += bytes.byteLength
      for (const entity of (JSON.parse(new TextDecoder().decode(bytes)) as SnapshotChunk).entities) {
        entities += 1
        ids.add(entity.id)
        longestLine = Math.max(longestLine, Buffer.byteLength(JSON.stringify(entity)))
      }
    }
    expect([entities, ids.size]).toEqual([heads, heads])
    for (const row of rows) expect(row.bytes).toBeLessThanOrEqual(SNAPSHOT_CHUNK_BYTES + longestLine)
    // It holds every chunk's bytes from the read until its upload, plus the one copy putConcatenated joins: more than it
    // stores, and never more than that plus one chunk.
    expect(result.peakHeldBytes).toBeGreaterThan(storedBytes)
    expect(result.peakHeldBytes).toBeLessThanOrEqual(storedBytes + SNAPSHOT_CHUNK_BYTES + longestLine)

    const requested = await v1.as(user, { authTime: Math.floor(Date.now() / 1000) }).post('/v1/exports', { proof_id: randomUUID(), from: '2016-01-01', through: '2026-12-31' })
    expect(requested.status).toBe(202)
    const exportId = (await json(requested)).entity_id as string
    const puts: unknown[] = []
    const recording: VaultBucket = {
      ...spyBucket({}),
      put: async (key, value, options) => {
        puts.push(value)
        return env.OBJECTS.put(key, value, options)
      },
    }
    mark = Date.now()
    const exported = await runInDurableObject(vaultOf(user), (vault: UserVault, state) =>
      writeExport({ context: () => fileAt(state, Date.now()), bucket: recording, active: (c) => vault.isActive(c) }, exportId),
    )
    const exportMs = Date.now() - mark
    expect(exported.outcome).toBe('ready')
    expect(puts).toHaveLength(1)
    expect(puts[0]).toBeInstanceOf(Uint8Array)
    const csvBytes = (puts[0] as Uint8Array).byteLength
    expect(csvBytes).toBeLessThan(VAULT_EXPORT_MAX_BYTES)
    expect(exported.peakHeldBytes).toBeLessThanOrEqual(2 * csvBytes)
    expect(((await json(await v1.as(user).get(`/v1/exports/${exportId}`))) as Extract<ExportDto, { status: 'ready' }>).row_count).toBe(records)
    console.log(`ten-times proof: ${JSON.stringify({ databaseSize, records, entities, chunks: rows.length, storedBytes, longestLine, peakHeldBytes: result.peakHeldBytes, csvBytes, exportPeakHeldBytes: exported.peakHeldBytes, seedMs, buildMs, exportMs })}`)
  }, 300_000)
})

describe("the planner's cases (1B-T8): the controller's notes and the rules the plan's cases leave open", () => {
  it('a build that starts after the vault stopped being active reads nothing and stores nothing', async () => {
    // The 1B-T6 review's m-1, carried to 1B-T8: the build checks the vault when it reads as well as when it records.
    const { v1, money } = await setup()
    const { user } = await diary(v1, money, 1)
    const { id } = await requestSnapshot(v1, user)
    await vaultExec(user, "UPDATE account_state SET status = 'deleting' WHERE id = 1")
    let puts = 0
    const seen = { reads: 0, rows: 0 }
    const outcome = await runInDurableObject(vaultOf(user), (vault: UserVault, state) =>
      buildSnapshot(writerOf(vault, state, { bucket: spyBucket({ beforePut: () => void (puts += 1) }), sql: watchedSql(state.storage.sql, seen) }), id),
    )
    expect([outcome, puts, seen.reads]).toEqual([{ outcome: 'skipped' }, 0, 0])
    expect(await registryOf(user)).toEqual([])
    expect(await snapshotKeys(user)).toEqual([])
    expect(await snapshotsOf(user)).toEqual([{ id, status: 'pending', started_at: null }])
  })

  it('a too-large snapshot fails visibly and publishes nothing', async () => {
    const { v1, money } = await setup()
    const { user } = await diary(v1, money, 2)
    const { id } = await requestSnapshot(v1, user)
    expect(await build(user, id, {}, { maxBytes: 300 })).toEqual({ outcome: 'too_large' })
    expect(await statusOf(v1, user, id)).toEqual({ snapshot_id: id, status: 'failed' })
    expect(await registryOf(user)).toEqual([])
    expect(await snapshotKeys(user)).toEqual([])
  })

  it('a snapshot whose build fails on all three attempts is recorded failed', async () => {
    // SNAPSHOT_STEP's retries, pinned by behaviour (the 1B-T6 review's n-1): three failures exhaust the step, and the
    // next case shows two do not, so the step makes exactly three attempts (the API's max_attempts).
    const { v1, money } = await setup({ startWork: 'auto' })
    const { user } = await diary(v1, money, 1)
    const key = randomUUID()
    const instance = await introspectWorkflowInstance(env.SNAPSHOT_WORKFLOW, snapshotIdOf(user, key))
    try {
      await instance.modify(async (m) => {
        await m.disableRetryDelays()
        await m.mockStepError({ name: 'build the snapshot' }, new Error('unavailable'), 3)
      })
      expect((await requestSnapshot(v1, user, key)).status).toBe(202)
      await v1.settle()
      expect((await snapshotsOf(user)).map((row) => row.started_at === null)).toEqual([false])
      await instance.waitForStatus('complete')
      expect(await instance.getOutput()).toEqual({ outcome: 'failed' })
    } finally {
      await instance.dispose()
    }
    expect(await statusOf(v1, user, snapshotIdOf(user, key))).toEqual({ snapshot_id: snapshotIdOf(user, key), status: 'failed' })
  }, 30_000)

  it('a build that fails on its first two attempts is ready on its third', async () => {
    const { v1, money } = await setup({ startWork: 'auto' })
    const { user } = await diary(v1, money, 1)
    const key = randomUUID()
    const instance = await introspectWorkflowInstance(env.SNAPSHOT_WORKFLOW, snapshotIdOf(user, key))
    try {
      await instance.modify(async (m) => {
        await m.disableRetryDelays()
        await m.mockStepError({ name: 'build the snapshot' }, new Error('unavailable'), 2)
      })
      expect((await requestSnapshot(v1, user, key)).status).toBe(202)
      await v1.settle()
      expect((await snapshotsOf(user)).map((row) => row.started_at === null)).toEqual([false])
      await instance.waitForStatus('complete')
      expect(await instance.getOutput()).toEqual({ outcome: 'ready' })
    } finally {
      await instance.dispose()
    }
    expect((await statusOf(v1, user, snapshotIdOf(user, key))).status).toBe('ready')
  }, 30_000)

  it('the snapshot starter starts each pending snapshot once on SnapshotWorkflow, and is due a minute after an unstarted request', async () => {
    const { v1, money } = await setup()
    const user = await money.member()
    const { id } = await requestSnapshot(v1, user)
    const [row] = await vaultRows<{ created_at: string }>(user, 'SELECT created_at FROM snapshots WHERE id = ?', id)
    const at = Date.now()
    await runInDurableObject(vaultOf(user), async (_vault, state) => {
      const c = fileAt(state, at)
      expect(SNAPSHOT_STARTER.unstarted(c)).toEqual([id])
      expect(SNAPSHOT_STARTER.dueAt(c)).toBe(Date.parse(row.created_at) + START_RETRY_MS)
      expect(await SNAPSHOT_STARTER.start({} as VaultEnv, state.id.toString(), id)).toBe('unbound')
      state.storage.transactionSync(() => SNAPSHOT_STARTER.markStarted(c, id))
      expect(SNAPSHOT_STARTER.unstarted(c)).toEqual([])
      expect(SNAPSHOT_STARTER.dueAt(c)).toBeNull()
    })
    expect(await snapshotsOf(user)).toEqual([{ id, status: 'pending', started_at: new Date(at).toISOString() }])
  })

  it('a snapshot started twice by overlapping runs is built once', async () => {
    // markStarted is not an at-most-once guard (1B-T4 follow-up): two overlapping starts both start the snapshot. The
    // second create finds the instance; two builds that overlap record one snapshot, and the other's chunks stay reserved.
    const { v1, money } = await setup()
    const { user } = await diary(v1, money, 2)
    const { id } = await requestSnapshot(v1, user)
    const instance = await introspectWorkflowInstance(env.SNAPSHOT_WORKFLOW, id)
    try {
      await instance.modify(async (m) => {
        await m.mockStepResult({ name: 'build the snapshot' }, { outcome: 'skipped' })
      })
      const workflowEnv = env as unknown as VaultEnv
      expect(await SNAPSHOT_STARTER.start(workflowEnv, vaultIdOf(user), id)).toBe('started')
      expect(await SNAPSHOT_STARTER.start(workflowEnv, vaultIdOf(user), id)).toBe('started')
      await instance.waitForStatus('complete')
    } finally {
      await instance.dispose()
    }
    const outcomes = await runInDurableObject(vaultOf(user), (vault: UserVault, state) => {
      let arrived = 0
      let both: () => void = () => undefined
      const together = new Promise<void>((resolve) => (both = resolve))
      const overlapping = spyBucket({
        beforePut: async () => {
          arrived += 1
          if (arrived === 2) both()
          await together
        },
      })
      const writer = writerOf(vault, state, { bucket: overlapping })
      return Promise.all([buildSnapshot(writer, id), buildSnapshot(writer, id)])
    })
    expect(outcomes.map((outcome) => outcome.outcome).sort()).toEqual(['ready', 'skipped'])
    expect((await registryOf(user)).map((object) => object.status).sort()).toEqual(['published', 'reserved'])
    expect(await chunkRowsOf(user, id)).toHaveLength(1)
  }, 30_000)

  it('pruneSnapshots fails a snapshot left pending for a day, drops one read below the purge watermark, and deletes one a week past its expiry', async () => {
    const { v1, money } = await setup()
    const { user, record } = await deletedLunch(v1, money)
    const old = await readySnapshot(v1, user)
    // Ready two hours ago, so the next request is not answered with it.
    await vaultExec(user, 'UPDATE snapshots SET ready_at = ? WHERE id = ?', new Date(Date.now() - 2 * HOUR).toISOString(), old.snapshot_id)
    const pending = await requestSnapshot(v1, user)
    expect(pending.status).toBe(202)
    const prune = (ms: number) => runInDurableObject(vaultOf(user), (_vault, state) => pruneSnapshots(fileAt(state, ms)))
    const statuses = async () => Object.fromEntries((await snapshotsOf(user)).map((row) => [row.id === old.snapshot_id ? 'old' : 'pending', row.status]))
    const [{ created_at: createdAt }] = await vaultRows<{ created_at: string }>(user, 'SELECT created_at FROM snapshots WHERE id = ?', pending.id)
    const created = Date.parse(createdAt)

    // A pending snapshot fails a day after its request, not a moment sooner.
    await prune(created + SNAPSHOT_PENDING_MS - 1)
    expect(await statuses()).toEqual({ old: 'ready', pending: 'pending' })
    await prune(created + SNAPSHOT_PENDING_MS)
    expect(await statuses()).toEqual({ old: 'ready', pending: 'failed' })
    expect(await statusOf(v1, user, pending.id)).toEqual({ snapshot_id: pending.id, status: 'failed' })

    // A ready snapshot is deleted a week past its expiry, not a moment sooner; its objects were due at its expiry.
    const expires = Date.parse(old.expires_at)
    const keys = (await chunkRowsOf(user, old.snapshot_id)).map((row) => row.object_key)
    expect(new Set((await registryOf(user)).filter((row) => keys.includes(row.key)).map((row) => row.delete_after))).toEqual(new Set([expires]))
    await prune(expires + SNAPSHOT_KEEP_MS - 1)
    expect(await statuses()).toEqual({ old: 'ready', pending: 'failed' })
    await prune(expires + SNAPSHOT_KEEP_MS)
    expect(await statuses()).toEqual({ pending: 'failed' })
    expect(await chunkRowsOf(user, old.snapshot_id)).toEqual([])

    // A ready snapshot read below the purge watermark is released at once: its chunk keys due now, its chunk rows gone.
    // Changed form (1B-T8's review m-1, fixed in 1B-T11): its row stays and reads expired, and goes a week past its
    // expiry like any ready snapshot. The purge runs here without the alarm's file jobs (runDue alone), so this case
    // checks pruneSnapshots itself.
    const before = await readySnapshot(v1, user)
    const beforeKeys = (await chunkRowsOf(user, before.snapshot_id)).map((row) => row.object_key)
    await age(user, record)
    await runInDurableObject(vaultOf(user), (_vault, state) => expect(runDue({ sql: state.storage.sql, storage: state.storage, now: new Date() })).toEqual([]))
    const now = Date.now()
    await prune(now)
    expect((await snapshotsOf(user)).find((row) => row.id === before.snapshot_id)).toMatchObject({ status: 'ready' })
    expect(await statusOf(v1, user, before.snapshot_id)).toEqual({ snapshot_id: before.snapshot_id, status: 'expired' })
    expect(await chunkRowsOf(user, before.snapshot_id)).toEqual([])
    const due = await runInDurableObject(vaultOf(user), (_vault, state) => dueObjectKeys(fileAt(state, now)).map((row) => row.key))
    expect(beforeKeys.every((key) => due.includes(key))).toBe(true)
    await prune(Date.parse(before.expires_at) + SNAPSHOT_KEEP_MS - 1)
    expect((await snapshotsOf(user)).map((row) => row.id)).toContain(before.snapshot_id)
    await prune(Date.parse(before.expires_at) + SNAPSHOT_KEEP_MS)
    expect((await snapshotsOf(user)).map((row) => row.id)).not.toContain(before.snapshot_id)
  })

  it('a request takes no body field and a UUID key, waits for the jobs gate, and a status of a malformed or unknown id is 404', async () => {
    const { v1, money } = await setup()
    const user = await money.member()
    const field = await v1.as(user).post('/v1/sync/snapshots', { full: true }, { key: randomUUID() })
    expect([field.status, (await json(field)).code]).toEqual([422, 'UNKNOWN_FIELD'])
    const bad = await v1.as(user).post('/v1/sync/snapshots', {}, { key: 'not-a-uuid' })
    expect([bad.status, (await json(bad)).fields]).toEqual([422, { 'idempotency-key': 'VALIDATION_FAILED' }])
    expect((await v1.as(user).get('/v1/sync/snapshots/not-a-uuid')).status).toBe(404)
    expect((await v1.as(user).get(`/v1/sync/snapshots/${randomUUID()}`)).status).toBe(404)
    const paused = await startV1({ policies: TEST_POLICIES, client_versions: { ios: '1.0.0', android: '1.0.0' }, gates: { paused: ['jobs'] } }, { startWork: 'manual' })
    expect((await paused.as(user).post('/v1/sync/snapshots', {}, { key: randomUUID() })).status).toBe(503)
    expect(await snapshotsOf(user)).toEqual([])
  })

  it('at most four chunk downloads run at once in a process, each streamed and never read whole; more are told to retry', async () => {
    // SNAPSHOT_SLOTS (planner ruling P6). A download opens its chunk only after it takes a slot, so four chunks
    // opened are four slots held. Their bodies wait at a gate; the slot is returned when a body ends.
    let opened = 0
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => (release = resolve))
    const held: VaultBucket = {
      ...spyBucket({}),
      get: async (key) => {
        opened += 1
        const found = await env.OBJECTS.get(key)
        if (!found || opened > 4) return found && streamedOnly(found, found.body)
        const body = found.body as unknown as AsyncIterable<Uint8Array>
        return streamedOnly(
          found,
          (async function* () {
            await gate
            yield* body
          })(),
        )
      },
    }
    const { v1, money } = await setup({ env: { OBJECTS: held } })
    const { user } = await diary(v1, money, 1)
    const ready = await readySnapshot(v1, user)
    const [chunk] = ready.chunks
    const url = `/v1/sync/snapshot-chunks/${chunk.grant}`
    const four = await Promise.all(Array.from({ length: 4 }, () => v1.as(user).get(url)))
    try {
      expect([opened, ...four.map((res) => res.status)]).toEqual([4, 200, 200, 200, 200])
      const extra = await v1.as(user).get(url)
      expect([extra.status, (await json(extra)).code]).toEqual([503, 'SERVICE_UNAVAILABLE'])
      expect(opened).toBe(4)
    } finally {
      release()
      for (const res of four) expect(sha256Of(new Uint8Array(await res.arrayBuffer()))).toBe(chunk.sha256)
    }
    const after = await v1.as(user).get(url)
    expect(after.status).toBe(200)
    expect(sha256Of(new Uint8Array(await after.arrayBuffer()))).toBe(chunk.sha256)
  })

  it('a chunk download refused after it took its slot gives the slot back', async () => {
    // R96's failed-download case (the 1B-T6 review's X3): five refused downloads (the object no longer matches its
    // record: 404 after the slot was taken), one more than SNAPSHOT_SLOTS, then a good chunk is still served.
    const { v1, money } = await setup()
    const { user } = await diary(v1, money, 2)
    const ready = await readySnapshot(v1, user, { chunkBytes: 300 })
    const [bad, good] = ready.chunks
    const [row] = await chunkRowsOf(user, ready.snapshot_id)
    await env.OBJECTS.delete(row.object_key)
    await env.OBJECTS.put(row.object_key, new TextEncoder().encode('changed'))
    const refused: number[] = []
    for (let i = 0; i < 5; i += 1) refused.push((await v1.as(user).get(`/v1/sync/snapshot-chunks/${bad.grant}`)).status)
    expect(refused).toEqual([404, 404, 404, 404, 404])
    const res = await v1.as(user).get(`/v1/sync/snapshot-chunks/${good.grant}`)
    expect(res.status).toBe(200)
    expect(sha256Of(new Uint8Array(await res.arrayBuffer()))).toBe(good.sha256)
  })

  it('a HEAD on a chunk download answers its headers, reads its chunk to the end and gives its slot back', async () => {
    // R96: the front door serves HEAD from the GET route and reads the body it drops to its end, so the download
    // returns its slot. The chunk is large (600 records, one chunk), so its body comes in many pieces, and each HEAD
    // has its own byte counter (the 1B-T6 confirming review's n-2). Four HEADs (SNAPSHOT_SLOTS), then a GET is served.
    const reads: number[] = []
    const counting: VaultBucket = {
      ...spyBucket({}),
      get: async (key) => {
        const found = await env.OBJECTS.get(key)
        if (!found) return found
        const slot = reads.push(0) - 1
        const body = found.body as unknown as AsyncIterable<Uint8Array>
        return streamedOnly(
          found,
          (async function* () {
            for await (const piece of body) {
              reads[slot] += piece.byteLength
              yield piece
            }
          })(),
        )
      },
    }
    const { v1 } = await setup({ env: { OBJECTS: counting } })
    const user = await member(v1)
    await seedRecords(user, 600)
    const ready = await readySnapshot(v1, user)
    expect(ready.chunks).toHaveLength(1)
    const [chunk] = ready.chunks
    expect(chunk.bytes).toBeGreaterThan(200_000)
    const url = `/v1/sync/snapshot-chunks/${chunk.grant}`
    const heads: unknown[] = []
    for (let i = 0; i < 4; i += 1) {
      const head = await v1.as(user).request('HEAD', url)
      heads.push([head.status, head.headers.get('content-length'), (await head.arrayBuffer()).byteLength, reads[i]])
    }
    const file = await v1.as(user).get(url)
    const body = file.status === 200 ? new Uint8Array(await file.arrayBuffer()) : null
    expect({ heads, file: [file.status, body && sha256Of(body)] }).toEqual({
      heads: Array.from({ length: 4 }, () => [200, String(chunk.bytes), 0, chunk.bytes]),
      file: [200, chunk.sha256],
    })
  }, 30_000)
})
