// Files on the vault's alarm (1B-T11). After 1A-T8b's retention jobs the alarm
// runs the file jobs (the five prunes, deleteDueObjects, then startPendingWork
// when a start is due), and every call or background method that writes
// rearms it. The plan's ten cases, two of them ported from
// apps/api/src/privacy/retention.integration.spec.ts through the alarm, then
// the planner's cases for the controller's notes and the brief's rulings, then
// alarm-hardening's cases for the 1B-T11 review (m1, m2, m4, n1 to n4).
// Time is the vault's clock (UserVault#clock); alarms run through
// runDurableObjectAlarm. A case that arms an alarm either sets the vault clock
// a day ahead of the real clock first (ruling R6), or runs its alarm moments
// after its last write, so no alarm fires on its own during it. A vault sleeps
// through evictDurableObject, its own only: a case that opens a gate from the
// test while the vault awaits it leaves that vault for evictAllDurableObjects
// to wait on.
import { env } from 'cloudflare:workers'
import { evictDurableObject, introspectWorkflowInstance, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test'
import { drizzle } from 'drizzle-orm/durable-sqlite'
import { migrate } from 'drizzle-orm/durable-sqlite/migrator'
import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { derivedUuid } from '@api/commands/derived-id'
import { ObjectStoreError } from '@api/storage/object-store'

import { attachmentsDueAt, pruneAttachments } from '../../src/vault/files/attachments'
import { touch } from '../../src/vault/files/context'
import type { FileContext } from '../../src/vault/files/context'
import { EXPORT_PENDING_MS, EXPORT_PURGE_MS } from '../../src/vault/files/exports'
import { FILE_PRUNES, runFileJobs } from '../../src/vault/files/jobs'
import { vaultObjectKey } from '../../src/vault/files/keys'
import type { VaultBucket } from '../../src/vault/files/keys'
import { DELETE_RETRY_MS, RESERVATION_GRACE_MS, TOMBSTONE_MS, reserveObject } from '../../src/vault/files/objects'
import { importsDueAt } from '../../src/vault/files/previews'
import { START_RETRY_MS, WORK_STARTERS } from '../../src/vault/files/work'
import type { WorkStarter } from '../../src/vault/files/work'
import { VAULT_MIGRATIONS } from '../../src/vault/migrations'
import { RETENTION_RETRY_MS } from '../../src/vault/retention'
import { CALL_ALARM_DELAY_MS } from '../../src/vault/user-vault'
import type { UserVault } from '../../src/vault/user-vault'
import { DAY, HOUR, MIN, csvRows, fileAt, gate, setVaultClock, spyBucket, upload, vaultExec, vaultIdOf, vaultRows } from './support/files'
import { migrateBefore } from './support/migrations'
import { builtinId, moneyFixtures } from './support/money-fixtures'
import { createLunch, member, startV1, vaultOf } from './support/v1-client'
import type { TestUser, V1Client } from './support/v1-client'

let client: V1Client
let money: ReturnType<typeof moneyFixtures>

beforeEach(async () => {
  client = await startV1(undefined, { startWork: 'manual' })
  money = moneyFixtures(client)
})

type Body = Record<string, any>
const json = async (res: Response): Promise<Body> => {
  const text = await res.text()
  return text ? (JSON.parse(text) as Body) : {}
}

/** A vault clock a day ahead of the real clock: every alarm a case arms from it lies in the real future (ruling R6). */
const ahead = () => Date.now() + DAY
const alarmOf = (user: TestUser) => runInDurableObject(vaultOf(user), (_vault, state) => state.storage.getAlarm())
const scheduleOf = (user: TestUser) => vaultRows<{ job: string; due_at: number }>(user, 'SELECT job, due_at FROM schedule ORDER BY job')
const registryOf = (user: TestUser, purpose: string) =>
  vaultRows<{ key: string; status: string; delete_after: number }>(user, 'SELECT key, status, delete_after FROM vault_objects WHERE purpose = ? ORDER BY key', purpose)
const exportKey = (state: DurableObjectState) => vaultObjectKey('export', state.id.toString(), randomUUID(), randomUUID(), 'export.csv')

/** Sets the vault clock to `ms`, then runs the alarm that is set, which must be one. */
async function fireAt(user: TestUser, ms: number): Promise<void> {
  await setVaultClock(user, ms)
  expect(await runDurableObjectAlarm(vaultOf(user))).toBe(true)
}

/** POST /v1/exports for March, with a sign-in now (B7). The fresh sign-in is checked on the vault clock, so the clock is the real one or within seconds of it. */
async function requestExport(v1: V1Client, user: TestUser, key: string = randomUUID()): Promise<{ status: number; id: string; requestedAt: number }> {
  const res = await v1.as(user, { authTime: Math.floor(Date.now() / 1000) }).post('/v1/exports', { proof_id: randomUUID(), from: '2026-03-01', through: '2026-03-31' }, { key })
  const body = await json(res)
  const id = body.entity_id as string
  const [row] = await vaultRows<{ requested_at: string }>(user, 'SELECT requested_at FROM exports WHERE id = ?', id)
  return { status: res.status, id, requestedAt: row ? Date.parse(row.requested_at) : Number.NaN }
}

/** The test seams a case set on the vault, back to their defaults. */
const resetSeams = (user: TestUser) =>
  runInDurableObject(vaultOf(user), (vault: UserVault) => {
    vault.fileJobOptions = {}
    delete (vault as { bucket?: VaultBucket }).bucket
  })

/** The alarm the vault believes it set, and the one the runtime holds. */
const both = (user: TestUser) => runInDurableObject(vaultOf(user), async (vault: UserVault, state) => [vault.alarmAt, await state.storage.getAlarm()])

/** True when one of the console.error lines a spy caught is the event `event`. */
const logged = (calls: unknown[][], event: string) => calls.some(([line]) => typeof line === 'string' && line.includes(`"event":"${event}"`))

/** Lets a promise the storage rejected run its handlers. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

/** An ISO time on the vault clock's scale, and a stand-in sha256 for rows written straight into the vault. */
const isoOf = (ms: number) => new Date(ms).toISOString()
const FILE_SHA = 'a'.repeat(64)

describe('files on the vault alarm (the plan)', () => {
  it('a key whose writer never published it is deleted by the alarm at its deadline', async () => {
    const user = await member(client)
    const t = ahead()
    await setVaultClock(user, t)
    const res = await client.as(user).post('/v1/sync/snapshots', {}, { key: randomUUID() })
    expect(res.status).toBe(202)
    const id = (await json(res)).snapshot_id as string
    // Its Workflow holds it (started), so the key is all the alarm has left of it.
    await vaultExec(user, 'UPDATE snapshots SET started_at = ? WHERE id = ?', new Date(t).toISOString(), id)
    // The build stores its chunk and dies before its record (B4): the key stays reserved and is never published.
    const threw = await runInDurableObject(vaultOf(user), async (vault: UserVault) => {
      Object.defineProperty(vault, 'bucket', {
        configurable: true,
        get: () =>
          spyBucket({
            afterPut: () => {
              throw new Error('the step died after its PUT')
            },
          }),
      })
      return vault.buildSnapshot(id).then(
        () => false,
        () => true,
      )
    })
    await resetSeams(user)
    expect(threw).toBe(true)
    const [row] = await registryOf(user, 'sync_snapshot')
    expect(row).toMatchObject({ status: 'reserved', delete_after: t + RESERVATION_GRACE_MS })
    expect(await env.OBJECTS.head(row.key)).not.toBeNull()
    // The build threw and still rearmed: the alarm is the key's deadline.
    expect(await alarmOf(user)).toBe(t + RESERVATION_GRACE_MS)
    await fireAt(user, t + RESERVATION_GRACE_MS)
    expect(await env.OBJECTS.head(row.key)).toBeNull()
    expect(await registryOf(user, 'sync_snapshot')).toEqual([{ key: row.key, status: 'tombstone', delete_after: t + RESERVATION_GRACE_MS + TOMBSTONE_MS }])
  })

  it('an export file is deleted by the alarm when it expires, and its status reads expired', async () => {
    const user = await member(client)
    const requested = await requestExport(client, user)
    expect(requested.status).toBe(202)
    expect(await vaultOf(user).writeExport(requested.id)).toEqual({ outcome: 'ready' })
    const ready = await json(await client.as(user).get(`/v1/exports/${requested.id}`))
    expect(ready.status).toBe('ready')
    const expiresAt = Date.parse(ready.expires_at)
    const [file] = await registryOf(user, 'export')
    expect(file).toMatchObject({ status: 'published', delete_after: expiresAt })
    // The write rearmed: the file's expiry is the earliest job.
    expect(await alarmOf(user)).toBe(expiresAt)
    await fireAt(user, expiresAt)
    expect(await env.OBJECTS.head(file.key)).toBeNull()
    expect(await registryOf(user, 'export')).toEqual([expect.objectContaining({ key: file.key, status: 'tombstone' })])
    expect((await json(await client.as(user).get(`/v1/exports/${requested.id}`))).status).toBe('expired')
    expect((await client.as(user).get(`/v1/exports/${requested.id}/grant`)).status).toBe(404)
  })

  it('work requested before the vault slept is started by its alarm after it wakes', async () => {
    // Review Focus 3. The front door handed nothing over (startWork 'manual'), as when the vault slept before the
    // Worker's waitUntil ran: the alarm a minute after the request starts the export after the vault wakes.
    const user = await member(client)
    const key = randomUUID()
    const id = derivedUuid(user.sub, 'export-request', key)
    const instance = await introspectWorkflowInstance(env.EXPORT_WORKFLOW, id)
    try {
      const requested = await requestExport(client, user, key)
      expect(requested.status).toBe(202)
      expect(await alarmOf(user)).toBe(requested.requestedAt + START_RETRY_MS)
      await evictDurableObject(vaultOf(user))
      await fireAt(user, requested.requestedAt + 61_000)
      await instance.waitForStatus('complete')
      expect(await instance.getOutput()).toEqual({ outcome: 'ready' })
    } finally {
      await instance.dispose()
    }
    expect((await json(await client.as(user).get(`/v1/exports/${id}`))).status).toBe('ready')
  }, 30_000)

  it('a failed start is retried a minute later, not in a loop', async () => {
    const user = await member(client)
    const t = ahead()
    await setVaultClock(user, t)
    let starts = 0
    const failing: WorkStarter = {
      kind: 'export',
      unstarted: () => ['never-starts'],
      dueAt: () => t - MIN,
      start: async () => {
        starts += 1
        throw new Error('the binding is down')
      },
      markStarted: () => undefined,
    }
    WORK_STARTERS.push(failing)
    try {
      await runInDurableObject(vaultOf(user), (vault: UserVault) => vault.rearm(vault.fileContext()))
      await fireAt(user, t)
      expect(starts).toBe(1)
      expect(await alarmOf(user)).toBe(t + START_RETRY_MS)
    } finally {
      WORK_STARTERS.splice(WORK_STARTERS.indexOf(failing), 1)
    }
  })

  it('a capped run leaves the alarm set, and the next alarm clears the rest', async () => {
    const user = await member(client)
    const t = ahead()
    await setVaultClock(user, t)
    const tombstones = async () => (await vaultRows<{ n: number }>(user, "SELECT count(*) AS n FROM vault_objects WHERE status = 'tombstone'"))[0].n
    await runInDurableObject(vaultOf(user), (vault: UserVault, state) => {
      vault.fileJobOptions = { maxBatches: 1 }
      // 1,001 keys due at t, rows only: R2 deletes keys it never held without an error.
      const c = fileAt(state, t - RESERVATION_GRACE_MS)
      state.storage.transactionSync(() => {
        for (let n = 0; n < 1_001; n += 1) reserveObject(c, exportKey(state), 'export')
      })
      vault.rearm(vault.fileContext(), 0)
    })
    try {
      expect(await alarmOf(user)).toBe(t)
      expect(await runDurableObjectAlarm(vaultOf(user))).toBe(true)
      expect(await tombstones()).toBe(1_000)
      const next = await alarmOf(user)
      expect(next).not.toBeNull()
      expect(next as number).toBeLessThanOrEqual(t)
      expect(await runDurableObjectAlarm(vaultOf(user))).toBe(true)
      expect(await tombstones()).toBe(1_001)
      expect(await alarmOf(user)).toBe(t + TOMBSTONE_MS)
    } finally {
      await resetSeams(user)
    }
  })

  it('a prune that throws is logged, the others still run, and the alarm is set again', async () => {
    const user = await member(client)
    const requested = await requestExport(client, user)
    expect(requested.status).toBe(202)
    await runInDurableObject(vaultOf(user), (vault: UserVault) => {
      vault.fileJobOptions = {
        prunes: [
          () => {
            throw new Error('boom')
          },
          ...FILE_PRUNES,
        ],
      }
    })
    const errors = vi.spyOn(console, 'error')
    try {
      // Left pending for a day: pruneExports, after the prune that throws, fails it.
      await fireAt(user, requested.requestedAt + EXPORT_PENDING_MS)
      expect(errors.mock.calls.some(([line]) => typeof line === 'string' && line.includes('"event":"file_prune_failed"'))).toBe(true)
    } finally {
      errors.mockRestore()
      await resetSeams(user)
    }
    expect(await json(await client.as(user).get(`/v1/exports/${requested.id}`))).toMatchObject({ status: 'failed', reason: 'error' })
    expect(await alarmOf(user)).toBe(requested.requestedAt + EXPORT_PURGE_MS)
  })

  it('the alarm follows the earliest of the core and file jobs', async () => {
    const user = await member(client)
    const t = Date.now()
    await setVaultClock(user, t)
    const lunch = await createLunch(client, user)
    expect((await client.as(user).del(`/v1/transactions/${lunch}`, { ifMatch: 1 })).status).toBe(200) // purged at t + 30 days
    const requested = await requestExport(client, user)
    expect(requested.status).toBe(202)
    expect(await vaultOf(user).writeExport(requested.id)).toEqual({ outcome: 'ready' }) // its file expires at t + 24 hours
    expect(await alarmOf(user)).toBe(t + DAY)
    await fireAt(user, t + DAY)
    // Changed form: the deleted file stays a day as a tombstone and is deleted once more then (B19), before the 30-day jobs.
    expect(await alarmOf(user)).toBe(t + 2 * DAY)
    await fireAt(user, t + 2 * DAY)
    expect(await alarmOf(user)).toBe(t + 30 * DAY)
  })

  it('after any alarm, every scheduled time is later than now', async () => {
    // Ruling R37. A vault holding one of each kind of due work, far fewer than 10,000 keys. The first alarm runs at t0,
    // when all of it is due; each later one at the time the last one set. After every alarm each schedule.due_at is
    // later than the vault clock, and getAlarm() is the smallest of them. Changed form (alarm-hardening): the seed also
    // holds a due import record and a ready snapshot that its purge makes stale (the 1B-T11 review's m1).
    const user = await member(client)
    const t0 = Date.now() + 40 * DAY
    // A deleted record past its 30 days, through the front door, deleted at t0 - 31 days.
    await setVaultClock(user, t0 - 31 * DAY)
    const lunch = await createLunch(client, user)
    expect((await client.as(user).del(`/v1/transactions/${lunch}`, { ifMatch: 1 })).status).toBe(200)
    await setVaultClock(user, t0)
    const seeded = await seedDueWork(user, t0)
    let at: number | null = t0
    for (let n = 0; at !== null && n < 50; n += 1) {
      await fireAt(user, at)
      const schedule = await scheduleOf(user)
      for (const row of schedule) expect(row.due_at, row.job).toBeGreaterThan(at)
      const next = await alarmOf(user)
      expect(next).toBe(schedule.length === 0 ? null : Math.min(...schedule.map((row) => row.due_at)))
      at = next
    }
    expect(at).toBeNull()
    // All of it is done, and the snapshot failed before anything started it.
    expect(await vaultRows(user, 'SELECT key FROM vault_objects')).toEqual([])
    expect(await vaultRows(user, 'SELECT id FROM exports')).toEqual([])
    expect(await vaultRows(user, 'SELECT id, status, started_at FROM snapshots')).toEqual([{ id: seeded.snapshot, status: 'failed', started_at: null }])
    expect(await vaultRows(user, 'SELECT id FROM attachments')).toEqual([])
    expect(await vaultRows(user, 'SELECT job_id FROM import_uploads')).toEqual([])
    expect(await vaultRows(user, 'SELECT state FROM entity_heads WHERE entity_id = ?', lunch)).toEqual([{ state: 'purged' }])
    expect(await vaultRows(user, 'SELECT state FROM entity_heads WHERE entity_id = ?', seeded.review)).toEqual([{ state: 'purged' }])
  }, 60_000)
})

/**
 * One of each kind of due work at `t0`, written straight into the vault: a key
 * past its reservation, an expired export file, a pending snapshot never
 * started (three days old), a released receipt (due at 0), an expired preview
 * with its sanitized image, a failed upload that ended 31 days ago, an import
 * review record last changed 31 days ago, and a ready snapshot that only the
 * purge of that record makes stale (the 1B-T11 review's m1).
 */
async function seedDueWork(user: TestUser, t0: number): Promise<{ snapshot: string; review: string }> {
  const vault = vaultIdOf(user)
  const iso = (ms: number) => new Date(ms).toISOString()
  const sha = 'a'.repeat(64)
  const exportId = randomUUID()
  const snapshot = randomUUID()
  const attachment = randomUUID()
  const preview = randomUUID()
  const failed = randomUUID()
  const review = randomUUID()
  const ready = randomUUID()
  await runInDurableObject(vaultOf(user), (_vault, state) => {
    state.storage.transactionSync(() => {
      const sql = state.storage.sql
      sql.exec("INSERT INTO vault_objects (key, purpose, status, delete_after, created_at) VALUES (?, 'export', 'reserved', ?, ?)", `export/${vault}/${randomUUID()}/${randomUUID()}/export.csv`, t0 - 5 * MIN, t0 - 20 * MIN)
      const file = `export/${vault}/${exportId}/${randomUUID()}/export.csv`
      sql.exec(
        `INSERT INTO exports (id, from_date, through_date, requested_at, status, started_at, object_key, bytes, sha256, row_count, high_water, ready_at, expires_at)
         VALUES (?, '2026-03-01', '2026-03-31', ?, 'ready', ?, ?, 10, ?, 0, 0, ?, ?)`,
        exportId, iso(t0 - 2 * DAY), iso(t0 - 2 * DAY), file, sha, iso(t0 - 2 * DAY), iso(t0 - DAY),
      )
      sql.exec("INSERT INTO vault_objects (key, purpose, status, delete_after, bytes, sha256, created_at) VALUES (?, 'export', 'published', ?, 10, ?, ?)", file, t0 - DAY, sha, t0 - 2 * DAY)
      sql.exec("INSERT INTO snapshots (id, status, created_at) VALUES (?, 'pending', ?)", snapshot, iso(t0 - 3 * DAY))
      const receipt = `receipt/${vault}/${attachment}/${randomUUID()}/image.jpg`
      sql.exec(
        "INSERT INTO attachments (id, source_job_id, status, object_key, content_type, bytes, sha256, width, height, retained_at) VALUES (?, ?, 'released', ?, 'image/jpeg', 3, ?, 1, 1, ?)",
        attachment, randomUUID(), receipt, sha, iso(t0 - 10 * DAY),
      )
      sql.exec("INSERT INTO vault_objects (key, purpose, status, delete_after, bytes, sha256, created_at) VALUES (?, 'receipt', 'published', 0, 3, ?, ?)", receipt, sha, t0 - 10 * DAY)
      sql.exec(
        `INSERT INTO import_uploads (job_id, intake_token, status, declared_type, format, bytes, sha256, part_count, parse_state, parse_attempts, created_at, receive_deadline, accepted_at, expires_at)
         VALUES (?, ?, 'accepted', 'image/jpeg', 'jpeg', 100, ?, 1, 'parsed', 1, ?, ?, ?, ?)`,
        preview, randomUUID(), sha, iso(t0 - 8 * DAY), iso(t0 - 8 * DAY + 10 * MIN), iso(t0 - 8 * DAY), iso(t0 - 7 * DAY),
      )
      const image = `import_image/${vault}/${preview}/${randomUUID()}/image.jpg`
      sql.exec(
        `INSERT INTO import_previews (job_id, status, layout, issues, candidate_count, review_required_count, image_key, image_width, image_height, image_attachment_id, review_revision, created_at, expires_at)
         VALUES (?, 'ready', 'receipt', '["receipt_fields_unread"]', 0, 0, ?, 1, 1, ?, 1, ?, ?)`,
        preview, image, randomUUID(), iso(t0 - 8 * DAY), iso(t0 - 60 * MIN),
      )
      // The image is due only at its own deadline; the preview's expiry makes it due at once (pruneImports).
      sql.exec("INSERT INTO vault_objects (key, purpose, status, delete_after, bytes, sha256, created_at) VALUES (?, 'import_image', 'published', ?, 3, ?, ?)", image, t0 + DAY, sha, t0 - 8 * DAY)
      sql.exec(
        "INSERT INTO import_uploads (job_id, intake_token, status, outcome_code, declared_type, created_at, receive_deadline, finished_at) VALUES (?, ?, 'failed', 'stream_failed', 'text/csv', ?, ?, ?)",
        failed, randomUUID(), iso(t0 - 31 * DAY), iso(t0 - 31 * DAY + 10 * MIN), iso(t0 - 31 * DAY),
      )
      // An import review record whose last change is 31 days old and whose preview is gone: pruneImports purges it at t0.
      sql.exec('UPDATE sync_state SET revision = revision + 1 WHERE id = 1')
      const { revision } = sql.exec<{ revision: number }>('SELECT revision FROM sync_state WHERE id = 1').one()
      sql.exec(
        "INSERT INTO entity_changes (revision, ordinal, command_id, entity, entity_id, version, state, snapshot, committed_at, group_bytes) VALUES (?, 0, ?, 'import_review', ?, 1, 'active', '{}', ?, 10)",
        revision, randomUUID(), review, iso(t0 - 31 * DAY),
      )
      sql.exec("INSERT INTO entity_heads (entity, entity_id, version, state, revision) VALUES ('import_review', ?, 1, 'active', ?)", review, revision)
      // A ready snapshot read at the revision the alarm's purge of the deleted record takes at t0 (the next one), as if
      // built just after that purge: only the import purge later in the same alarm makes it stale. Another purge before
      // pruneSnapshots in either order (a second purge group, an export past its 30 days) would make it stale sooner and
      // hide m1. Its chunk is published until its expiry, an hour after t0.
      const chunk = `sync_snapshot/${vault}/${ready}/${randomUUID()}/chunk-0000.json`
      sql.exec(
        "INSERT INTO snapshots (id, status, high_water, chunk_count, created_at, started_at, ready_at, expires_at) VALUES (?, 'ready', ?, 1, ?, ?, ?, ?)",
        ready, revision + 1, iso(t0 - HOUR), iso(t0 - HOUR), iso(t0 - HOUR), iso(t0 + HOUR),
      )
      sql.exec('INSERT INTO snapshot_chunks (snapshot_id, chunk_index, object_key, bytes, sha256) VALUES (?, 0, ?, 3, ?)', ready, chunk, sha)
      sql.exec("INSERT INTO vault_objects (key, purpose, status, delete_after, bytes, sha256, created_at) VALUES (?, 'sync_snapshot', 'published', ?, 3, ?, ?)", chunk, t0 + HOUR, sha, t0 - HOUR)
    })
  })
  return { snapshot, review }
}

describe('ported from retention.integration.spec.ts, through the alarm', () => {
  it('export requests are purged 30 days after the request; the receipt stays compact', async () => {
    const user = await member(client)
    const key = randomUUID()
    const requested = await requestExport(client, user, key)
    expect(requested.status).toBe(202)
    await fireAt(user, requested.requestedAt + 31 * DAY)
    expect(await vaultRows(user, 'SELECT 1 FROM exports WHERE id = ?', requested.id)).toEqual([])
    expect(await vaultRows(user, 'SELECT state FROM entity_heads WHERE entity_id = ?', requested.id)).toEqual([{ state: 'purged' }])
    expect(await vaultRows(user, 'SELECT state, snapshot FROM entity_changes WHERE entity_id = ?', requested.id)).toEqual([{ state: 'purged', snapshot: null }])
    expect((await client.as(user).get(`/v1/exports/${requested.id}`)).status).toBe(404)
    const status = await json(await client.as(user).post('/v1/commands/status', { command_ids: [key] }))
    expect(status.statuses[0].ack.entity_state).toBe('purged')
  })

  it('drops finished upload rows 30 days after they ended, never one still receiving or within the quota window', async () => {
    // Changed form: the old accepted import is parsed, since a vault's accepted upload always has a parse state; one
    // not parsed would first be expired by its own rule, and would then end now.
    const user = await member(client)
    const t = ahead()
    await setVaultClock(user, t)
    const day = (n: number) => new Date(t - n * DAY).toISOString()
    const row = async (status: string, ended: string | null, extra: { outcome?: string; created?: string; accepted?: string; expires?: string } = {}) => {
      const id = randomUUID()
      const created = extra.created ?? day(0)
      const accepted = extra.accepted ?? null
      await vaultExec(
        user,
        `INSERT INTO import_uploads (job_id, intake_token, status, outcome_code, file_name, declared_type, format, bytes, sha256, part_count, parse_state, created_at, receive_deadline, accepted_at, expires_at, finished_at)
         VALUES (?, ?, ?, ?, ?, 'text/csv', ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', ?, '+10 minutes'), ?, ?, ?)`,
        id, randomUUID(), status, extra.outcome ?? null, status === 'receiving' ? 'statement.csv' : null,
        accepted ? 'csv' : null, accepted ? 100 : null, status === 'accepted' ? 'ab'.repeat(32) : null, accepted ? 1 : null,
        status === 'accepted' ? 'parsed' : status === 'expired' ? 'cancelled' : null,
        created, created, accepted, extra.expires ?? null, ended,
      )
      return id
    }
    const oldFailed = await row('failed', day(31), { outcome: 'stream_failed', created: day(31) })
    const freshFailed = await row('failed', day(2), { outcome: 'stream_failed', created: day(2) })
    const oldExpired = await row('expired', day(32), { created: day(34), accepted: day(34), expires: day(33) })
    const oldAccepted = await row('accepted', null, { created: day(40), accepted: day(40), expires: day(39) })
    const receiving = await row('receiving', null, { created: day(0) })
    await runInDurableObject(vaultOf(user), (vault: UserVault) => vault.rearm(vault.fileContext()))
    await fireAt(user, t)
    const left = (await vaultRows<{ job_id: string }>(user, 'SELECT job_id FROM import_uploads')).map((r) => r.job_id).sort()
    expect(left).toEqual([freshFailed, receiving].sort())
    expect([oldFailed, oldExpired, oldAccepted].some((id) => left.includes(id))).toBe(false)
  })
})

describe("the controller's notes", () => {
  it('a resent snapshot request after its snapshot went stale reads expired and starts nothing; a new key builds a new one', async () => {
    // 1B-T8's review m-1 (probe D): the purge alarm makes the snapshot stale and pruneSnapshots releases its chunks but
    // keeps its row, so the resend reads expired, as the API's kept job does, and is not a pending row under an id whose
    // SnapshotWorkflow instance already completed (createOnce would count it as started, and nothing would build it).
    const auto = await startV1(undefined, { startWork: 'auto' })
    const user = await member(auto)
    const lunch = await createLunch(auto, user)
    expect((await auto.as(user).del(`/v1/transactions/${lunch}`, { ifMatch: 1 })).status).toBe(200)
    const key = randomUUID()
    const id = derivedUuid(user.sub, 'snapshot-request', key)
    const first = await introspectWorkflowInstance(env.SNAPSHOT_WORKFLOW, id)
    try {
      expect((await auto.as(user).post('/v1/sync/snapshots', {}, { key })).status).toBe(202)
      await auto.settle()
      await first.waitForStatus('complete')
    } finally {
      await first.dispose()
    }
    expect((await json(await auto.as(user).get(`/v1/sync/snapshots/${id}`))).status).toBe('ready')
    // The deletion ages past its 30 days, and the purge alarm runs the file jobs too.
    const old = new Date(Date.now() - 31 * DAY).toISOString()
    await vaultExec(user, "UPDATE entity_changes SET committed_at = ? WHERE entity = 'transaction' AND entity_id = ?", old, lunch)
    await vaultExec(user, 'UPDATE transactions SET deleted_at = ? WHERE id = ?', old, lunch)
    expect(await runDurableObjectAlarm(vaultOf(user))).toBe(true)
    expect(await vaultRows(user, 'SELECT 1 FROM snapshot_chunks WHERE snapshot_id = ?', id)).toEqual([])

    const resent = await auto.as(user).post('/v1/sync/snapshots', {}, { key })
    expect([resent.status, await json(resent)]).toEqual([202, { snapshot_id: id, status: 'expired' }])
    await auto.settle()
    expect(await vaultRows(user, 'SELECT id, status FROM snapshots')).toEqual([{ id, status: 'ready' }])

    const fresh = randomUUID()
    const freshId = derivedUuid(user.sub, 'snapshot-request', fresh)
    const second = await introspectWorkflowInstance(env.SNAPSHOT_WORKFLOW, freshId)
    try {
      expect((await auto.as(user).post('/v1/sync/snapshots', {}, { key: fresh })).status).toBe(202)
      await auto.settle()
      await second.waitForStatus('complete')
    } finally {
      await second.dispose()
    }
    expect((await json(await auto.as(user).get(`/v1/sync/snapshots/${freshId}`))).status).toBe('ready')
  }, 30_000)

  it('a vault that is not active runs no file job and keeps no alarm for them', async () => {
    // 1B-T6's, 1B-T8's and 1B-T10's notes: the prunes do not check the vault's state themselves, so the alarm runs and
    // schedules the file jobs only for an active vault, as 1A's retention, and a vault being deleted is left to its erasure.
    const user = await member(client)
    const requested = await requestExport(client, user)
    expect(requested.status).toBe(202)
    const key = await runInDurableObject(vaultOf(user), (_vault, state) => {
      const key = exportKey(state)
      reserveObject(fileAt(state, requested.requestedAt - RESERVATION_GRACE_MS), key, 'export')
      return key
    })
    await vaultExec(user, "UPDATE account_state SET status = 'deleting' WHERE id = 1")
    await fireAt(user, requested.requestedAt + EXPORT_PENDING_MS)
    expect(await vaultRows(user, 'SELECT status FROM exports WHERE id = ?', requested.id)).toEqual([{ status: 'pending' }])
    expect(await vaultRows(user, 'SELECT status FROM vault_objects WHERE key = ?', key)).toEqual([{ status: 'reserved' }])
    expect(await scheduleOf(user)).toEqual([])
    expect(await alarmOf(user)).toBeNull()
  })

  it('an upload arms the alarm though it commits no command', async () => {
    // 1B-T5's review: the upload steps write without moving the revision. Each touches, so call() rearms after it.
    const v1 = await startV1(undefined, { env: { IMPORT_UPLOADS_ENABLED: 'true' }, startWork: 'manual' })
    const user = await member(v1)
    expect(await alarmOf(user)).toBeNull()
    const accepted = await upload(v1, user, csvRows(2))
    expect(accepted.status).toBe(202)
    const [row] = await vaultRows<{ accepted_at: string }>(user, 'SELECT accepted_at FROM import_uploads WHERE job_id = ?', accepted.body.job_id)
    // Its parse was never sent (no hand-off), so the parse starter is due a minute after the acceptance.
    expect(await alarmOf(user)).toBe(Date.parse(row.accepted_at) + START_RETRY_MS)
  })

  it('only one file run at a time: a second run while the first waits on R2 deletes nothing', async () => {
    // The 1B-T4 follow-up: deleteDueObjects never overlaps itself (an overlap could keep a given-up reservation open).
    // Changed form (alarm-hardening): the second run reports the delete it could not run as failed (the 1B-T11 review's n1).
    const user = await member(client)
    const t = ahead()
    await setVaultClock(user, t)
    const outcome = await runInDurableObject(vaultOf(user), async (vault: UserVault, state) => {
      reserveObject(fileAt(state, t - RESERVATION_GRACE_MS), exportKey(state), 'export')
      const entered = gate()
      const release = gate()
      let deletes = 0
      const waiting = {
        delete: async () => {
          deletes += 1
          entered.open()
          await release.opened
        },
      } as unknown as VaultBucket
      Object.defineProperty(vault, 'bucket', { configurable: true, get: () => waiting })
      const firstRun = runFileJobs(vault)
      await Promise.race([entered.opened, firstRun])
      const secondRun = runFileJobs(vault)
      await new Promise((resolve) => setTimeout(resolve, 50))
      release.open()
      const [firstFailed, secondFailed] = await Promise.all([firstRun, secondRun])
      return { firstFailed, secondFailed, deletes, rows: state.storage.sql.exec('SELECT status FROM vault_objects').toArray() }
    })
    await resetSeams(user)
    expect(outcome).toEqual({ firstFailed: [], secondFailed: ['delete_objects'], deletes: 1, rows: [{ status: 'tombstone' }] })
  })

  it('an unbound bucket is a failed delete, due again a minute later; the alarm never throws', async () => {
    // The 1B-T4 follow-up: `this.bucket` throws while OBJECTS is unbound, so it is read inside the delete's own try.
    const user = await member(client)
    const t = ahead()
    await setVaultClock(user, t)
    const key = await runInDurableObject(vaultOf(user), (vault: UserVault, state) => {
      const key = exportKey(state)
      reserveObject(fileAt(state, t - RESERVATION_GRACE_MS), key, 'export')
      Object.defineProperty(vault, 'bucket', {
        configurable: true,
        get: () => {
          throw new ObjectStoreError('unavailable')
        },
      })
      vault.rearm(vault.fileContext(), 0)
      return key
    })
    const errors = vi.spyOn(console, 'error')
    try {
      expect(await runDurableObjectAlarm(vaultOf(user))).toBe(true)
      expect(errors.mock.calls.some(([line]) => typeof line === 'string' && line.includes('"event":"object_delete_failed"'))).toBe(true)
    } finally {
      errors.mockRestore()
      await resetSeams(user)
    }
    expect(await vaultRows(user, 'SELECT status, delete_after FROM vault_objects WHERE key = ?', key)).toEqual([{ status: 'reserved', delete_after: t + DELETE_RETRY_MS }])
    expect(await alarmOf(user)).toBe(t + DELETE_RETRY_MS)
  })

  it('an erase that lands while the alarm waits on R2 leaves the vault erased, with no alarm and no schedule', async () => {
    // The 1B-T4 follow-up: the alarm checks `erased` again after its R2 wait and never rearms an erased vault.
    const user = await member(client)
    const t = ahead()
    await setVaultClock(user, t)
    const entered = gate()
    const release = gate()
    await runInDurableObject(vaultOf(user), (vault: UserVault, state) => {
      reserveObject(fileAt(state, t - RESERVATION_GRACE_MS), exportKey(state), 'export')
      const waiting = {
        delete: async () => {
          entered.open()
          await release.opened
        },
      } as unknown as VaultBucket
      Object.defineProperty(vault, 'bucket', { configurable: true, get: () => waiting })
      vault.rearm(vault.fileContext(), 0)
    })
    expect(await alarmOf(user)).toBe(t)
    const run = runDurableObjectAlarm(vaultOf(user))
    await entered.opened
    await vaultOf(user).erase()
    release.open()
    expect(await run).toBe(true)
    await resetSeams(user)
    expect(await alarmOf(user)).toBeNull()
    expect(await scheduleOf(user)).toEqual([])
    expect(await vaultRows(user, 'SELECT account_id, status FROM account_state')).toEqual([{ account_id: '', status: 'deleted' }])
  })

  it("the alarm's due-time read of deleted records and the purge's change lookup use their indexes", async () => {
    // 1A-T8b's review, minor 2: nextDue runs after every write, and each purge group reads and deletes its entities'
    // earlier changes. The API's two indexes (0015_privacy.sql) serve them (0003_alarm_indexes.sql).
    const user = await member(client)
    const plan = async (query: string, ...bindings: unknown[]) =>
      (await vaultRows<{ detail: string }>(user, `EXPLAIN QUERY PLAN ${query}`, ...bindings)).map((row) => row.detail).join(' | ')
    expect(await plan('SELECT min(deleted_at) AS at FROM transactions WHERE deleted_at IS NOT NULL')).toContain('transactions_deleted_idx')
    expect(await plan('DELETE FROM entity_changes WHERE entity = ? AND entity_id IN (SELECT value FROM json_each(?)) AND revision < CAST(? AS INTEGER)', 'transaction', '[]', '1')).toContain('entity_changes_entity_idx')
  })
})

describe("the brief's rulings", () => {
  it('a prune that keeps throwing brings the alarm back a minute later, never in a loop', async () => {
    // Its work stays due now, so without the minute after a failed job the alarm would fire again at once.
    const user = await member(client)
    const requested = await requestExport(client, user)
    expect(requested.status).toBe(202)
    // Started, so the alarm starts nothing; only the prune that throws is left to fail it.
    await vaultExec(user, 'UPDATE exports SET started_at = requested_at WHERE id = ?', requested.id)
    await runInDurableObject(vaultOf(user), (vault: UserVault) => {
      vault.fileJobOptions = {
        prunes: [
          () => {
            throw new Error('boom')
          },
        ],
      }
    })
    try {
      const at = requested.requestedAt + EXPORT_PENDING_MS
      await fireAt(user, at)
      expect(await vaultRows(user, 'SELECT status FROM exports WHERE id = ?', requested.id)).toEqual([{ status: 'pending' }])
      expect(await alarmOf(user)).toBe(at + RETENTION_RETRY_MS)
    } finally {
      await resetSeams(user)
    }
  })

  it('after a failed job the alarm comes back a minute later, and a write in between does not bring it sooner', async () => {
    // 1A-T8b's review, nit 1: a write after a failing alarm re-armed it at the failing job's past due time.
    const user = await member(client)
    const t = ahead()
    await setVaultClock(user, t)
    const lunch = await createLunch(client, user)
    expect((await client.as(user).del(`/v1/transactions/${lunch}`, { ifMatch: 1 })).status).toBe(200)
    await vaultExec(user, "CREATE TRIGGER fail_purge BEFORE DELETE ON transactions BEGIN SELECT RAISE(ABORT, 'synthetic purge failure'); END")
    try {
      await fireAt(user, t + 31 * DAY)
      expect(await alarmOf(user)).toBe(t + 31 * DAY + RETENTION_RETRY_MS)
      await setVaultClock(user, t + 31 * DAY + 30_000)
      const [{ id: wallet }] = await vaultRows<{ id: string }>(user, 'SELECT id FROM wallets')
      expect((await client.as(user).patch(`/v1/wallets/${wallet}`, { name: 'Cash 2' }, { ifMatch: 1 })).status).toBe(200)
      expect(await alarmOf(user)).toBe(t + 31 * DAY + RETENTION_RETRY_MS)
    } finally {
      await vaultExec(user, 'DROP TRIGGER fail_purge')
    }
  })

  it('a write never sets the alarm sooner than a minute ahead, even with work already due, and a later write never postpones it', async () => {
    const user = await member(client)
    const t = ahead()
    await setVaultClock(user, t)
    // A key already past its deadline, as a released receipt is (due at 0).
    const key = await runInDurableObject(vaultOf(user), (_vault, state) => {
      const key = exportKey(state)
      reserveObject(fileAt(state, t - RESERVATION_GRACE_MS - MIN), key, 'export')
      return key
    })
    const cash = await money.wallet(user)
    expect(await alarmOf(user)).toBe(t + CALL_ALARM_DELAY_MS)
    await setVaultClock(user, t + 30_000)
    expect((await client.as(user).patch(`/v1/wallets/${cash}`, { name: 'Cash 2' }, { ifMatch: 1 })).status).toBe(200)
    expect(await alarmOf(user)).toBe(t + CALL_ALARM_DELAY_MS)
    await fireAt(user, t + CALL_ALARM_DELAY_MS)
    expect(await vaultRows(user, 'SELECT status FROM vault_objects WHERE key = ?', key)).toEqual([{ status: 'tombstone' }])
  })

  it('the vault knows the alarm it set: alarmAt matches getAlarm() after a write, an alarm, a wake and an erase', async () => {
    const user = await member(client)
    const t = ahead()
    await setVaultClock(user, t)
    const both = () => runInDurableObject(vaultOf(user), async (vault: UserVault, state) => [vault.alarmAt, await state.storage.getAlarm()])
    const lunch = await createLunch(client, user)
    expect((await client.as(user).del(`/v1/transactions/${lunch}`, { ifMatch: 1 })).status).toBe(200)
    expect(await both()).toEqual([t + 30 * DAY, t + 30 * DAY])
    await evictDurableObject(vaultOf(user))
    expect(await both()).toEqual([t + 30 * DAY, t + 30 * DAY])
    await fireAt(user, t + 31 * DAY)
    const [afterAlarm, set] = await both()
    expect(afterAlarm).toBe(set)
    // A write sets the alarm again, so the erase below has one to forget.
    const [{ id: wallet }] = await vaultRows<{ id: string }>(user, 'SELECT id FROM wallets')
    expect((await client.as(user).patch(`/v1/wallets/${wallet}`, { name: 'Cash 2' }, { ifMatch: 1 })).status).toBe(200)
    const [written, armed] = await both()
    expect(written).not.toBeNull()
    expect(written).toBe(armed)
    await vaultOf(user).erase()
    expect(await both()).toEqual([null, null])
  })

  it('a background step that writes moves the alarm: a failed export is due only at its purge', async () => {
    const user = await member(client)
    const requested = await requestExport(client, user)
    expect(requested.status).toBe(202)
    expect(await alarmOf(user)).toBe(requested.requestedAt + START_RETRY_MS)
    await vaultOf(user).failExport(requested.id)
    expect(await alarmOf(user)).toBe(requested.requestedAt + EXPORT_PURGE_MS)
  })

  it('a start moves the alarm on, from the alarm or from the Worker', async () => {
    const user = await member(client)
    const t = ahead()
    await setVaultClock(user, t)
    const marked = new Set<string>()
    const starter: WorkStarter = {
      kind: 'export',
      unstarted: () => (marked.has('work') ? [] : ['work']),
      dueAt: () => (marked.has('work') ? null : t - MIN),
      start: async () => 'started',
      markStarted: (c, id) => {
        marked.add(id)
        touch(c)
      },
    }
    WORK_STARTERS.push(starter)
    try {
      await runInDurableObject(vaultOf(user), (vault: UserVault) => vault.rearm(vault.fileContext()))
      expect(await alarmOf(user)).toBe(t + CALL_ALARM_DELAY_MS)
      expect(await vaultOf(user).startPendingWork()).toEqual({ started: 1, failed: 0, held: false })
      expect(await alarmOf(user)).toBeNull()
    } finally {
      WORK_STARTERS.splice(WORK_STARTERS.indexOf(starter), 1)
    }
  })
})

/** `n` records, each holding its own retained receipt, written straight into the vault (rows only, no objects). */
async function seedReceipts(user: TestUser, n: number): Promise<{ records: string[]; receipts: string[] }> {
  const wallet = await money.wallet(user)
  const food = builtinId(user, 'food')
  const vault = vaultIdOf(user)
  const records = Array.from({ length: n }, () => randomUUID())
  const receipts = Array.from({ length: n }, () => randomUUID())
  await runInDurableObject(vaultOf(user), (_vault, state) => {
    state.storage.transactionSync(() => {
      const sql = state.storage.sql
      records.forEach((record, i) => {
        sql.exec("INSERT INTO transactions (id, type, amount_minor, occurred_on, wallet_id, category_id, version, created_at, updated_at) VALUES (?, 'expense', 100, '2026-02-01', ?, ?, 1, 'x', 'x')", record, wallet, food)
        sql.exec(
          "INSERT INTO attachments (id, source_job_id, status, object_key, content_type, bytes, sha256, width, height, retained_at) VALUES (?, ?, 'retained', ?, 'image/jpeg', 3, ?, 1, 1, 'x')",
          receipts[i], randomUUID(), `receipt/${vault}/${receipts[i]}/${randomUUID()}/image.jpg`, FILE_SHA,
        )
        sql.exec("INSERT INTO transaction_attachments (transaction_id, attachment_id, attached_at) VALUES (?, ?, 'x')", record, receipts[i])
      })
    })
  })
  return { records, receipts }
}

/** Runs one statement with B20's trigger `name` dropped (as the 1B-T9 review's probe DU-2 does), then puts the trigger back. */
const aroundTrigger = (user: TestUser, name: string, query: string, ...bindings: unknown[]) =>
  runInDurableObject(vaultOf(user), (_vault, state) => {
    state.storage.transactionSync(() => {
      const sql = state.storage.sql
      const trigger = sql.exec<{ sql: string }>("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = ?", name).one().sql
      sql.exec(`DROP TRIGGER ${name}`)
      sql.exec(query, ...bindings)
      sql.exec(trigger)
    })
  })

/** Import records written straight into the vault: each a head and its change, the purged ones purged in a later group. */
async function seedImportRecords(user: TestUser, records: { entity: string; committedMs: number; purged?: boolean }[]): Promise<string[]> {
  const ids = records.map(() => randomUUID())
  await runInDurableObject(vaultOf(user), (_vault, state) => {
    state.storage.transactionSync(() => {
      const sql = state.storage.sql
      const next = () => {
        sql.exec('UPDATE sync_state SET revision = revision + 1 WHERE id = 1')
        return sql.exec<{ revision: number }>('SELECT revision FROM sync_state WHERE id = 1').one().revision
      }
      const change = (revision: number, ordinal: number, entity: string, id: string, version: number, at: number) =>
        sql.exec(
          "INSERT INTO entity_changes (revision, ordinal, command_id, entity, entity_id, version, state, snapshot, committed_at, group_bytes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          revision, ordinal, randomUUID(), entity, id, version, version === 1 ? 'active' : 'purged', version === 1 ? '{}' : null, isoOf(at), ordinal === 0 ? 10 : null,
        )
      const first = next()
      records.forEach((record, i) => {
        change(first, i, record.entity, ids[i], 1, record.committedMs)
        sql.exec("INSERT INTO entity_heads (entity, entity_id, version, state, revision) VALUES (?, ?, 1, 'active', ?)", record.entity, ids[i], first)
      })
      const purged = records.flatMap((record, i) => (record.purged ? [i] : []))
      if (purged.length === 0) return
      const group = next()
      purged.forEach((i, ordinal) => {
        sql.exec('DELETE FROM entity_changes WHERE entity = ? AND entity_id = ?', records[i].entity, ids[i])
        change(group, ordinal, records[i].entity, ids[i], 2, records[i].committedMs)
        sql.exec("UPDATE entity_heads SET version = 2, state = 'purged', revision = ? WHERE entity = ? AND entity_id = ?", group, records[i].entity, ids[i])
      })
    })
  })
  return ids
}

describe("alarm-hardening: the 1B-T11 review's findings", () => {
  it('an import purge in the same alarm releases a ready snapshot it makes stale, so no job is left due at the vault clock', async () => {
    // m1 (R37): pruneImports purges an import record, which raises the purge watermark. pruneSnapshots now runs after it,
    // so the snapshot that purge makes stale has its chunks released, and its key deleted, in this alarm. Run before it,
    // pruneSnapshots left the stale chunk rows, snapshotsDueAt answered now, and the alarm fired again at once.
    const user = await member(client)
    const t = ahead()
    await setVaultClock(user, t)
    const res = await client.as(user).post('/v1/sync/snapshots', {}, { key: randomUUID() })
    expect(res.status).toBe(202)
    const id = (await json(res)).snapshot_id as string
    expect(await vaultOf(user).buildSnapshot(id)).toEqual({ outcome: 'ready' })
    const [chunk] = await registryOf(user, 'sync_snapshot')
    const [review] = await seedImportRecords(user, [{ entity: 'import_review', committedMs: t - 31 * DAY }])
    await runInDurableObject(vaultOf(user), (vault: UserVault) => vault.rearm(vault.fileContext()))
    await fireAt(user, t)
    expect(await vaultRows(user, 'SELECT state FROM entity_heads WHERE entity_id = ?', review)).toEqual([{ state: 'purged' }])
    // The stale snapshot keeps its row (it reads expired); its chunk rows went and its key was deleted in this alarm.
    expect(await vaultRows(user, 'SELECT status FROM snapshots WHERE id = ?', id)).toEqual([{ status: 'ready' }])
    expect(await vaultRows(user, 'SELECT chunk_index FROM snapshot_chunks WHERE snapshot_id = ?', id)).toEqual([])
    expect(await registryOf(user, 'sync_snapshot')).toEqual([{ key: chunk.key, status: 'tombstone', delete_after: t + TOMBSTONE_MS }])
    const schedule = await scheduleOf(user)
    for (const row of schedule) expect(row.due_at, row.job).toBeGreaterThan(t)
    expect(await alarmOf(user)).toBe(Math.min(...schedule.map((row) => row.due_at)))
  })

  it('a delete whose own block throws is reported to the alarm, which comes back a minute later, not at once', async () => {
    // m2 (the alarm lens's probe PA): R2 deletes the key, then the block that tombstones it fails, so the key is still
    // due at t. runFileJobs reports the throw as delete_objects; unreported, the alarm would be set at t again and fire
    // at once into the same failure (R37).
    const user = await member(client)
    const t = ahead()
    await setVaultClock(user, t)
    const key = await runInDurableObject(vaultOf(user), (vault: UserVault, state) => {
      const key = exportKey(state)
      reserveObject(fileAt(state, t - RESERVATION_GRACE_MS), key, 'export')
      vault.rearm(vault.fileContext(), 0)
      return key
    })
    expect(await alarmOf(user)).toBe(t)
    await vaultExec(user, "CREATE TRIGGER fail_tombstone BEFORE UPDATE ON vault_objects BEGIN SELECT RAISE(ABORT, 'synthetic tombstone failure'); END")
    const errors = vi.spyOn(console, 'error')
    try {
      expect(await runDurableObjectAlarm(vaultOf(user))).toBe(true)
      expect(logged(errors.mock.calls, 'file_delete_failed')).toBe(true)
    } finally {
      errors.mockRestore()
      await vaultExec(user, 'DROP TRIGGER fail_tombstone')
    }
    expect(await vaultRows(user, 'SELECT status, delete_after FROM vault_objects WHERE key = ?', key)).toEqual([{ status: 'reserved', delete_after: t }])
    expect(await alarmOf(user)).toBe(t + RETENTION_RETRY_MS)
  })

  it('an alarm that finds another file run in progress reports its delete as failed, so it comes back a minute later', async () => {
    // n1 (probe PG): a run left waiting on R2 holds the one-run guard (P6), as an alarm cut off at its wall-clock limit
    // could leave it. Reported as success, the held guard brought the alarm back at once while work was due.
    const user = await member(client)
    const t = ahead()
    await setVaultClock(user, t)
    const entered = gate()
    const release = gate()
    let stuck: Promise<unknown> = Promise.resolve()
    await runInDurableObject(vaultOf(user), (vault: UserVault, state) => {
      reserveObject(fileAt(state, t - RESERVATION_GRACE_MS), exportKey(state), 'export')
      const waiting = {
        delete: async () => {
          entered.open()
          await release.opened
        },
      } as unknown as VaultBucket
      Object.defineProperty(vault, 'bucket', { configurable: true, get: () => waiting })
      vault.rearm(vault.fileContext(), 0)
      stuck = runFileJobs(vault)
    })
    await entered.opened
    expect(await alarmOf(user)).toBe(t)
    const errors = vi.spyOn(console, 'error')
    let held = false
    try {
      expect(await runDurableObjectAlarm(vaultOf(user))).toBe(true)
      held = logged(errors.mock.calls, 'file_run_held')
    } finally {
      errors.mockRestore()
    }
    const after = await alarmOf(user)
    release.open()
    await stuck
    await resetSeams(user)
    expect({ held, after }).toEqual({ held: true, after: t + RETENTION_RETRY_MS })
  })

  it('a setAlarm the storage refuses is logged and forgotten, so the next rearm sets the alarm again', async () => {
    // n2: rearm's setAlarm and deleteAlarm settle after it returns, outside its try. A refusal was an unhandled
    // rejection, and alarmAt already named the alarm, so a rearm to the same time returned early and nothing set it.
    const user = await member(client)
    const t = ahead()
    await setVaultClock(user, t)
    const errors = vi.spyOn(console, 'error')
    let refused: unknown
    try {
      refused = await runInDurableObject(vaultOf(user), async (vault: UserVault, state) => {
        reserveObject(fileAt(state, t - RESERVATION_GRACE_MS), exportKey(state), 'export')
        const refuse = vi.spyOn(state.storage, 'setAlarm').mockRejectedValueOnce(new Error('storage is down'))
        try {
          vault.rearm(vault.fileContext(), 0)
          await settle()
          return { asked: refuse.mock.calls.map(([at]) => at), alarmAt: vault.alarmAt, set: await state.storage.getAlarm(), logged: logged(errors.mock.calls, 'vault_alarm_unset') }
        } finally {
          refuse.mockRestore()
        }
      })
    } finally {
      errors.mockRestore()
    }
    expect(refused).toEqual({ asked: [t], alarmAt: null, set: null, logged: true })
    // The same time again: the vault does not take the refused alarm for set.
    await runInDurableObject(vaultOf(user), (vault: UserVault) => vault.rearm(vault.fileContext(), 0))
    expect(await both(user)).toEqual([t, t])
  })

  it('a refusal that lands after a later rearm leaves that alarm alone, and a refused deleteAlarm is logged', async () => {
    // n2: the refused alarm is forgotten only while alarmAt still names it.
    const user = await member(client)
    const t = ahead()
    await setVaultClock(user, t)
    const errors = vi.spyOn(console, 'error')
    try {
      const out = await runInDurableObject(vaultOf(user), async (vault: UserVault, state) => {
        // The first rearm asks for t + 10 minutes; that setAlarm hangs, and is refused only after a second rearm set t + 1 minute.
        reserveObject(fileAt(state, t + 10 * MIN - RESERVATION_GRACE_MS), exportKey(state), 'export')
        let refuse: (error: Error) => void = () => undefined
        const hang = vi.spyOn(state.storage, 'setAlarm').mockImplementationOnce(
          () =>
            new Promise<void>((_resolve, reject) => {
              refuse = reject
            }),
        )
        vault.rearm(vault.fileContext(), 0)
        hang.mockRestore()
        reserveObject(fileAt(state, t + MIN - RESERVATION_GRACE_MS), exportKey(state), 'export')
        vault.rearm(vault.fileContext(), 0)
        refuse(new Error('storage is down'))
        await settle()
        const kept = [vault.alarmAt, await state.storage.getAlarm()]
        // Nothing is left to do, so the next rearm deletes the alarm, which the storage refuses.
        state.storage.sql.exec('DELETE FROM vault_objects')
        const refuseDelete = vi.spyOn(state.storage, 'deleteAlarm').mockRejectedValueOnce(new Error('storage is down'))
        try {
          vault.rearm(vault.fileContext(), 0)
          await settle()
          return { kept, deletes: refuseDelete.mock.calls.length, alarmAt: vault.alarmAt }
        } finally {
          refuseDelete.mockRestore()
        }
      })
      expect(out).toEqual({ kept: [t + MIN, t + MIN], deletes: 1, alarmAt: null })
      expect(errors.mock.calls.filter(([line]) => typeof line === 'string' && line.includes('"event":"vault_alarm_unset"'))).toHaveLength(2)
    } finally {
      errors.mockRestore()
    }
  })

  it('a schedule write that fails after a call committed is logged, and the call still answers its success', async () => {
    // n3 (probe PH): rearm runs after the call's block committed, so it logs vault_alarm_unset instead of throwing.
    const user = await member(client)
    const t = ahead()
    await setVaultClock(user, t)
    const cash = await money.wallet(user)
    await vaultExec(user, "CREATE TRIGGER fail_schedule_i BEFORE INSERT ON schedule BEGIN SELECT RAISE(ABORT, 'synthetic schedule failure'); END")
    await vaultExec(user, "CREATE TRIGGER fail_schedule_u BEFORE UPDATE ON schedule BEGIN SELECT RAISE(ABORT, 'synthetic schedule failure'); END")
    const errors = vi.spyOn(console, 'error')
    let status = 0
    let wasLogged = false
    try {
      status = (await client.as(user).patch(`/v1/wallets/${cash}`, { name: 'Cash 2' }, { ifMatch: 1 })).status
      wasLogged = logged(errors.mock.calls, 'vault_alarm_unset')
    } finally {
      errors.mockRestore()
      await vaultExec(user, 'DROP TRIGGER fail_schedule_i')
      await vaultExec(user, 'DROP TRIGGER fail_schedule_u')
    }
    const stored = await vaultRows(user, 'SELECT name FROM wallets WHERE id = ?', cash)
    expect({ status, logged: wasLogged, stored }).toEqual({ status: 200, logged: true, stored: [{ name: 'Cash 2' }] })
  })

  it('a background write that makes work due at once still waits the write floor (R104 through background())', async () => {
    // n4 (probe PE): failExport is a short-block background method; a key already due beside it is due at once.
    const user = await member(client)
    const requested = await requestExport(client, user)
    expect(requested.status).toBe(202)
    const t = ahead()
    await setVaultClock(user, t)
    await runInDurableObject(vaultOf(user), async (vault: UserVault, state) => {
      reserveObject(fileAt(state, t - RESERVATION_GRACE_MS - MIN), exportKey(state), 'export')
      vault.alarmAt = null
      await state.storage.deleteAlarm()
    })
    await vaultOf(user).failExport(requested.id)
    expect(await both(user)).toEqual([t + CALL_ALARM_DELAY_MS, t + CALL_ALARM_DELAY_MS])
  })

  it('a start through rearming() that makes work due at once still waits the write floor (R104 through rearming())', async () => {
    // n4 (probe PF): the start gives a key up at once, as a release does.
    const user = await member(client)
    const t = ahead()
    await setVaultClock(user, t)
    const marked = new Set<string>()
    const starter: WorkStarter = {
      kind: 'export',
      unstarted: () => (marked.has('work') ? [] : ['work']),
      dueAt: () => (marked.has('work') ? null : t - MIN),
      start: async () => 'started',
      markStarted: (c, id) => {
        marked.add(id)
        reserveObject(c, vaultObjectKey('export', c.vaultId, randomUUID(), randomUUID(), 'export.csv'), 'export', -RESERVATION_GRACE_MS)
        touch(c)
      },
    }
    WORK_STARTERS.push(starter)
    try {
      expect(await vaultOf(user).startPendingWork()).toEqual({ started: 1, failed: 0, held: false })
      expect(await both(user)).toEqual([t + CALL_ALARM_DELAY_MS, t + CALL_ALARM_DELAY_MS])
    } finally {
      WORK_STARTERS.splice(WORK_STARTERS.indexOf(starter), 1)
    }
  })

  it('the due-time reads after a write read as many rows with a hundred held receipts and purged import records as with none', async () => {
    // m4: attachmentsDueAt and importsDueAt run after every write (1B-T11's rearm). The safety net read every retained
    // receipt and its holder, and the import read walked every import record the vault ever had, purged ones included.
    // rowsRead is the storage's own count of the rows a statement read.
    const user = await money.member()
    const t = ahead()
    const rowsRead = () =>
      runInDurableObject(vaultOf(user), (_vault, state) => {
        const cursors: SqlStorageCursor<Record<string, SqlStorageValue>>[] = []
        const sql = {
          exec: (query: string, ...bindings: unknown[]) => {
            const cursor = state.storage.sql.exec(query, ...bindings)
            cursors.push(cursor)
            return cursor
          },
        } as unknown as SqlStorage
        const c: FileContext = { sql, storage: state.storage, now: new Date(t), vaultId: state.id.toString() }
        const total = () => cursors.splice(0).reduce((sum, cursor) => sum + cursor.rowsRead, 0)
        attachmentsDueAt(c)
        const receipts = total()
        importsDueAt(c)
        return { receipts, imports: total() }
      })
    const none = await rowsRead()
    await seedReceipts(user, 100)
    await seedImportRecords(user, Array.from({ length: 100 }, () => ({ entity: 'import_review', committedMs: t - 40 * DAY, purged: true })))
    // pruneAttachments checks every receipt, as each alarm does.
    await runInDurableObject(vaultOf(user), (_vault, state) => pruneAttachments(fileAt(state, t)))
    expect(await rowsRead()).toEqual(none)
  })

  it('a receipt left with no holder is due at once however it lost its holder, and the prune that releases it empties the checks', async () => {
    // m4: the safety net (a retained receipt no record holds) reads only attachment_checks, which 0004's triggers fill
    // on each event that can leave a retained receipt with no holder. B20's triggers release a receipt whose last
    // holder goes, so the two events through a holder are made with B20's trigger dropped, as probe DU-2 does; the
    // release B20 makes is due at once through the stamp it waits for.
    const user = await money.member()
    const t = ahead()
    const { records, receipts } = await seedReceipts(user, 4)
    const vault = vaultIdOf(user)
    const dueAt = () => runInDurableObject(vaultOf(user), (_vault, state) => attachmentsDueAt(fileAt(state, t)))
    const checks = async () => (await vaultRows<{ attachment_id: string }>(user, 'SELECT attachment_id FROM attachment_checks')).map((row) => row.attachment_id)
    const prune = () => runInDurableObject(vaultOf(user), (_vault, state) => pruneAttachments(fileAt(state, t)))
    const statusOf = async (id: string) => (await vaultRows<{ status: string }>(user, 'SELECT status FROM attachments WHERE id = ?', id)).map((row) => row.status)
    await prune()
    expect([await dueAt(), await checks()]).toEqual([null, []])
    // A receipt kept with no record holding it.
    const kept = randomUUID()
    await vaultExec(
      user,
      "INSERT INTO attachments (id, source_job_id, status, object_key, content_type, bytes, sha256, width, height, retained_at) VALUES (?, ?, 'retained', ?, 'image/jpeg', 3, ?, 1, 1, 'x')",
      kept, randomUUID(), `receipt/${vault}/${kept}/${randomUUID()}/image.jpg`, FILE_SHA,
    )
    expect([await dueAt(), await checks()]).toEqual([t, [kept]])
    await prune()
    expect([await statusOf(kept), await checks()]).toEqual([['released'], []])
    // A holder deleted with B20 in place: the receipt is released and waits for its stamp.
    await vaultExec(user, 'DELETE FROM transaction_attachments WHERE transaction_id = ?', records[3])
    expect([await statusOf(receipts[3]), await dueAt(), await checks()]).toEqual([['released'], t, [receipts[3]]])
    await prune()
    expect(await checks()).toEqual([])
    // A holder deleted around B20's release.
    await aroundTrigger(user, 'transaction_attachments_unheld_delete', 'DELETE FROM transaction_attachments WHERE transaction_id = ?', records[0])
    expect([await dueAt(), await checks()]).toEqual([t, [receipts[0]]])
    await prune()
    expect([await statusOf(receipts[0]), await checks()]).toEqual([['released'], []])
    // A holder moved to another receipt around B20's release.
    await aroundTrigger(user, 'transaction_attachments_unheld_update', 'UPDATE transaction_attachments SET attachment_id = ? WHERE transaction_id = ?', receipts[2], records[1])
    expect([await dueAt(), await checks()]).toEqual([t, [receipts[1]]])
    await prune()
    expect([await statusOf(receipts[1]), await checks()]).toEqual([['released'], []])
    // A released receipt set back to retained, which nothing holds.
    await vaultExec(user, "UPDATE attachments SET status = 'retained', released_at = NULL WHERE id = ?", kept)
    expect([await dueAt(), await checks()]).toEqual([t, [kept]])
    await prune()
    expect([await statusOf(kept), await checks()]).toEqual([['released'], []])
    // The receipt two records still hold was never due.
    expect(await statusOf(receipts[2])).toEqual(['retained'])
  })

  it('a vault upgraded from 0003 starts its checks with the receipts that already have no holder', async () => {
    // m4: 0004 lists the receipts already left with no holder, so the safety net still finds them after the upgrade.
    const t = ahead()
    const [wallet, category, record, held, alone] = Array.from({ length: 5 }, () => randomUUID())
    const stub = env.VAULT.get(env.VAULT.idFromName(randomUUID()))
    const out = await runInDurableObject(stub, async (_vault, state) => {
      await migrateBefore(state, '_alarm_bounds')
      const sql = state.storage.sql
      const vault = state.id.toString()
      sql.exec("INSERT INTO wallets (id, name, currency, opening_minor, tracking_start, archived, version, created_at, updated_at) VALUES (?, 'Cash', 'THB', 0, '2026-10-01', 0, 1, 'x', 'x')", wallet)
      sql.exec("INSERT INTO categories (id, type, builtin_key, label, color, archived, version, created_at, updated_at) VALUES (?, 'expense', NULL, 'Snacks', NULL, 0, 1, 'x', 'x')", category)
      sql.exec("INSERT INTO transactions (id, type, amount_minor, occurred_on, wallet_id, category_id, version, created_at, updated_at) VALUES (?, 'expense', 100, '2026-10-20', ?, ?, 1, 'x', 'x')", record, wallet, category)
      for (const id of [held, alone]) {
        sql.exec(
          "INSERT INTO attachments (id, source_job_id, status, object_key, content_type, bytes, sha256, width, height, retained_at) VALUES (?, ?, 'retained', ?, 'image/jpeg', 3, ?, 1, 1, 'x')",
          id, randomUUID(), `receipt/${vault}/${id}/${randomUUID()}/image.jpg`, FILE_SHA,
        )
      }
      sql.exec("INSERT INTO transaction_attachments (transaction_id, attachment_id, attached_at) VALUES (?, ?, 'x')", record, held)
      await migrate(drizzle(state.storage), VAULT_MIGRATIONS)
      return { checks: sql.exec('SELECT attachment_id FROM attachment_checks').toArray(), due: attachmentsDueAt(fileAt(state, t)) }
    })
    expect(out).toEqual({ checks: [{ attachment_id: alone }], due: t })
  })

  it('importsDueAt counts the live import records only: a purged one is skipped, a live selection counts', async () => {
    // m4: importsDueAt reads the live import heads through entity_heads_imports_idx (0004). This pins the two terms of
    // its WHERE that the index matches: the purged state, and both entity names.
    const user = await member(client)
    const t = ahead()
    await seedImportRecords(user, [
      { entity: 'import_review', committedMs: t - 40 * DAY, purged: true },
      { entity: 'import_selection', committedMs: t - 10 * DAY },
    ])
    expect(await runInDurableObject(vaultOf(user), (_vault, state) => importsDueAt(fileAt(state, t)))).toBe(t + 20 * DAY)
  })
})
