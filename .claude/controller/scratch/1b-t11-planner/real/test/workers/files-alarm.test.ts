// Files on the vault's alarm (1B-T11). After 1A-T8b's retention jobs the alarm
// runs the file jobs (the five prunes, deleteDueObjects, then startPendingWork
// when a start is due), and every call or background method that writes
// rearms it. The plan's ten cases, two of them ported from
// apps/api/src/privacy/retention.integration.spec.ts through the alarm, then
// the planner's cases for the controller's notes and the brief's rulings.
// Time is the vault's clock (UserVault#clock); alarms run through
// runDurableObjectAlarm. A case that arms an alarm either sets the vault clock
// a day ahead of the real clock first (ruling R6), or runs its alarm moments
// after its last write, so no alarm fires on its own during it. A vault sleeps
// through evictDurableObject, its own only: a case that opens a gate from the
// test while the vault awaits it leaves that vault for evictAllDurableObjects
// to wait on.
import { env } from 'cloudflare:workers'
import { evictDurableObject, introspectWorkflowInstance, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test'
import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { derivedUuid } from '@api/commands/derived-id'
import { ObjectStoreError } from '@api/storage/object-store'

import { touch } from '../../src/vault/files/context'
import { EXPORT_PENDING_MS, EXPORT_PURGE_MS } from '../../src/vault/files/exports'
import { FILE_PRUNES, runFileJobs } from '../../src/vault/files/jobs'
import { vaultObjectKey } from '../../src/vault/files/keys'
import type { VaultBucket } from '../../src/vault/files/keys'
import { DELETE_RETRY_MS, RESERVATION_GRACE_MS, TOMBSTONE_MS, reserveObject } from '../../src/vault/files/objects'
import { START_RETRY_MS, WORK_STARTERS } from '../../src/vault/files/work'
import type { WorkStarter } from '../../src/vault/files/work'
import { RETENTION_RETRY_MS } from '../../src/vault/retention'
import { CALL_ALARM_DELAY_MS } from '../../src/vault/user-vault'
import type { UserVault } from '../../src/vault/user-vault'
import { DAY, MIN, csvRows, fileAt, gate, setVaultClock, spyBucket, upload, vaultExec, vaultIdOf, vaultRows } from './support/files'
import { moneyFixtures } from './support/money-fixtures'
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
    // later than the vault clock, and getAlarm() is the smallest of them.
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
  }, 60_000)
})

/**
 * One of each kind of due work at `t0`, written straight into the vault: a key
 * past its reservation, an expired export file, a pending snapshot never
 * started (three days old), a released receipt (due at 0), an expired preview
 * with its sanitized image, and a failed upload that ended 31 days ago.
 */
async function seedDueWork(user: TestUser, t0: number): Promise<{ snapshot: string }> {
  const vault = vaultIdOf(user)
  const iso = (ms: number) => new Date(ms).toISOString()
  const sha = 'a'.repeat(64)
  const exportId = randomUUID()
  const snapshot = randomUUID()
  const attachment = randomUUID()
  const preview = randomUUID()
  const failed = randomUUID()
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
    })
  })
  return { snapshot }
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
    expect(outcome).toEqual({ firstFailed: [], secondFailed: [], deletes: 1, rows: [{ status: 'tombstone' }] })
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
