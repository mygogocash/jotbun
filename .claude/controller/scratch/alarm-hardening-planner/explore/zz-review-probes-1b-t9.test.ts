// Reviewer probes for 1B-T9 (scratch only, never committed). Each case pins a
// behaviour the review checks; the reviewer's own mutants run against them.
import { env } from 'cloudflare:workers'
import { runInDurableObject } from 'cloudflare:test'
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { RECEIPT_RETENTION_CONSENT } from '@gogospend/contracts'

import { COPY_SLOTS, RECEIPT_LIMITS } from '../../src/v1/files/receipts'
import { RECEIPT_SLOTS } from '../../src/v1/files/downloads'
import { attachmentsDueAt, pruneAttachments } from '../../src/vault/files/attachments'
import { deleteDueObjects } from '../../src/vault/files/objects'
import type { UserVault } from '../../src/vault/user-vault'
import { MIN, fileAt, gate, seedImportImage, setVaultClock, vaultExec, vaultIdOf, vaultRows } from './support/files'
import type { SeededImage } from './support/files'
import { builtinId, moneyFixtures } from './support/money-fixtures'
import { TEST_POLICIES, startV1, vaultOf } from './support/v1-client'
import type { TestUser, V1Client } from './support/v1-client'

type Body = Record<string, any>
const CONSENT = { consent: RECEIPT_RETENTION_CONSENT }
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const json = async (res: Response) => {
  const text = await res.text()
  return { status: res.status, body: (text ? JSON.parse(text) : {}) as Body }
}

type Hooks = { get?: (key: string, real: () => Promise<any>) => Promise<any>; head?: (key: string, real: () => Promise<any>) => Promise<any> }

function hooked(hooks: Hooks, counted: { writes: number }) {
  const bucket = env.OBJECTS
  return {
    get: (key: string) => (hooks.get ? hooks.get(key, () => bucket.get(key)) : bucket.get(key)),
    put: (key: string, value: any, options: any) => {
      if (key.startsWith('receipt/')) counted.writes += 1
      return bucket.put(key, value, options)
    },
    head: (key: string) => (hooks.head ? hooks.head(key, () => bucket.head(key)) : bucket.head(key)),
    delete: (keys: any) => bucket.delete(keys),
    list: (options: any) => bucket.list(options),
  }
}

/** The VAULT binding, with every prepare reply observed. */
function observedVault(seen: { prepares: string[] }) {
  const ns = env.VAULT
  return {
    idFromName: (name: string) => ns.idFromName(name),
    idFromString: (id: string) => ns.idFromString(id),
    get: (id: any, options?: any) => {
      const stub = ns.get(id, options)
      return {
        id: stub.id,
        fetch: (...args: any[]) => (stub as any).fetch(...args),
        startPendingWork: (...args: any[]) => (stub as any).startPendingWork(...args),
        call: async (call: any) => {
          const reply = await stub.call(call)
          if (call.route === 'attachments.prepare') seen.prepares.push(reply.ok ? (reply.body as { kind: string }).kind : String(reply.status))
          return reply
        },
      }
    },
  }
}

async function setup(config?: any) {
  const hooks: Hooks = {}
  const counted = { writes: 0 }
  const seen = { prepares: [] as string[] }
  const v1 = await startV1(config, { env: { OBJECTS: hooked(hooks, counted) as any, VAULT: observedVault(seen) as any } })
  return { v1, money: moneyFixtures(v1), hooks, counted, seen }
}

async function memberWithRecords(kit: Awaited<ReturnType<typeof setup>>, count = 1) {
  const user = await kit.money.member()
  const wallet = await kit.money.wallet(user)
  const records: string[] = []
  for (let i = 0; i < count; i += 1) records.push(await kit.money.record(user, { type: 'expense', amount_minor: String(6500 + i), occurred_on: '2026-03-01', wallet_id: wallet, category_id: builtinId(user, 'food') }))
  return { user, records }
}

const retain = async (v1: V1Client, user: TestUser, id: string, attachmentId: string, ifMatch: number) =>
  json(await v1.as(user).post(`/v1/transactions/${id}/attachment`, { attachment_id: attachmentId, ...CONSENT }, { ifMatch }))
const receiptRows = async (user: TestUser, now = Date.now()) =>
  (await vaultRows<{ key: string; status: string; delete_after: number | null }>(user, "SELECT key, status, delete_after FROM vault_objects WHERE purpose = 'receipt' ORDER BY created_at, key")).map((r) => ({
    key: r.key,
    status: r.status,
    forever: r.delete_after === null,
    due: r.delete_after !== null && r.delete_after <= now,
  }))
const attachments = (user: TestUser) => vaultRows<{ id: string; status: string; object_key: string }>(user, 'SELECT id, status, object_key FROM attachments')
const heldBy = async (user: TestUser, id: string) => (await vaultRows<{ transaction_id: string }>(user, 'SELECT transaction_id FROM transaction_attachments WHERE attachment_id = ? ORDER BY transaction_id', id)).map((r) => r.transaction_id)

describe('R-B: the vault never reserves a second copy of one image', () => {
  it('RB-1 ten prepares at once for one image: exactly one copy, nine waits', async () => {
    const kit = await setup()
    const user = await kit.money.member()
    const image = await seedImportImage(user)
    const replies = await Promise.all(
      Array.from({ length: 10 }, () =>
        vaultOf(user).call({
          route: 'attachments.prepare',
          access: 'current_policy',
          charge: 'step',
          claims: { accountId: user.sub, sessionId: user.sid, issuedAt: Math.floor(Date.now() / 1000), clientId: 'ios' },
          policies: TEST_POLICIES,
          params: {},
          query: {},
          headers: {},
          body: { attachment_id: image.attachmentId, command_id: randomUUID() },
        }),
      ),
    )
    const kinds = replies.map((r) => (r.ok ? (r.body as { kind: string }).kind : `refused ${r.status}`)).sort()
    expect(kinds).toEqual(['copy', ...Array(9).fill('wait')])
    expect(await receiptRows(user)).toHaveLength(1)
  })

  it('RB-2 the first request held after its HEAD: the second only waits, then attaches the receipt the first made', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit, 2)
    const image = await seedImportImage(user)
    const hold = gate()
    const inside = gate()
    let heads = 0
    kit.hooks.head = async (key, real) => {
      if (key.startsWith('receipt/') && (heads += 1) === 1) {
        inside.open()
        await hold.opened
      }
      return real()
    }
    try {
      const first = retain(kit.v1, user, records[0], image.attachmentId, 1)
      await inside.opened
      const second = retain(kit.v1, user, records[1], image.attachmentId, 1)
      // Wait until the second has been told to wait at least twice (it is polling).
      for (let i = 0; i < 200 && kit.seen.prepares.filter((k) => k === 'wait').length < 2; i += 1) await delay(10)
      expect(kit.seen.prepares.filter((k) => k === 'wait').length).toBeGreaterThanOrEqual(2)
      expect(await receiptRows(user)).toEqual([expect.objectContaining({ status: 'reserved', due: false })])
      hold.open()
      expect([(await first).status, (await second).status]).toEqual([200, 200])
    } finally {
      hold.open()
    }
    expect(kit.counted.writes).toBe(1)
    expect(kit.seen.prepares[0]).toBe('copy')
    expect(kit.seen.prepares[kit.seen.prepares.length - 1]).toBe('none')
    expect(await receiptRows(user)).toEqual([expect.objectContaining({ status: 'published', forever: true })])
    expect(await attachments(user)).toHaveLength(1)
    expect(await heldBy(user, image.attachmentId)).toEqual([...records].sort())
  })

  it('RB-3 a first copy held past its reservation: the second makes its own, and the first attaches the second one\'s receipt', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit, 2)
    const image = await seedImportImage(user)
    const hold = gate()
    const inside = gate()
    let heads = 0
    kit.hooks.head = async (key, real) => {
      if (key.startsWith('receipt/') && (heads += 1) === 1) {
        inside.open()
        await hold.opened
      }
      return real()
    }
    const t0 = Date.now()
    try {
      const first = retain(kit.v1, user, records[0], image.attachmentId, 1)
      await inside.opened
      await setVaultClock(user, t0 + 3 * MIN + 5_000)
      const second = await retain(kit.v1, user, records[1], image.attachmentId, 1)
      expect(second.status).toBe(200)
      hold.open()
      const done = await first
      expect(done.status).toBe(200)
    } finally {
      hold.open()
      await setVaultClock(user, null)
    }
    expect(kit.counted.writes).toBe(2)
    const rows = await receiptRows(user, t0 + 3 * MIN + 5_000)
    expect(rows.filter((r) => r.status === 'published')).toHaveLength(1)
    expect(rows.filter((r) => r.status === 'reserved')).toEqual([expect.objectContaining({ due: true })])
    const [row] = await attachments(user)
    expect(row.object_key).toBe(rows.find((r) => r.status === 'published')?.key)
    expect(await attachments(user)).toHaveLength(1)
    expect(await heldBy(user, image.attachmentId)).toEqual([...records].sort())
  })

  it('RB-4 a first command refused after its copy: the waiting second reserves its own copy and wins', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit, 2)
    const image = await seedImportImage(user)
    const hold = gate()
    const inside = gate()
    let heads = 0
    kit.hooks.head = async (key, real) => {
      if (key.startsWith('receipt/') && (heads += 1) === 1) {
        inside.open()
        await hold.opened
      }
      return real()
    }
    try {
      const first = retain(kit.v1, user, records[0], image.attachmentId, 1)
      await inside.opened
      const second = retain(kit.v1, user, records[1], image.attachmentId, 1)
      for (let i = 0; i < 200 && !kit.seen.prepares.includes('wait'); i += 1) await delay(10)
      // The first record moves on while its copy is in flight: its command is refused.
      expect((await kit.v1.as(user).patch(`/v1/transactions/${records[0]}`, { note: 'edited' }, { ifMatch: 1 })).status).toBe(200)
      hold.open()
      expect((await first).status).toBe(409)
      expect((await second).status).toBe(200)
    } finally {
      hold.open()
    }
    expect(kit.counted.writes).toBe(2)
    const rows = await receiptRows(user)
    expect(rows.filter((r) => r.status === 'published')).toHaveLength(1)
    expect(rows.filter((r) => r.status === 'reserved')).toEqual([expect.objectContaining({ due: true })])
    expect(await heldBy(user, image.attachmentId)).toEqual([records[1]])
  })
})

describe('access: refused sessions copy nothing', () => {
  it('AC-1 a signed-out session is refused and nothing is reserved or copied', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit)
    const image = await seedImportImage(user)
    expect((await kit.v1.as(user).post('/v1/me/logout')).status).toBe(204)
    const res = await retain(kit.v1, user, records[0], image.attachmentId, 1)
    expect([res.status, res.body.code]).toEqual([401, 'SESSION_REQUIRED'])
    expect(await receiptRows(user)).toEqual([])
    expect(kit.counted.writes).toBe(0)
  })

  it('AC-2 a session without the current terms is refused and nothing is reserved or copied', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit)
    const image = await seedImportImage(user)
    const v2 = { kind: 'terms', version: 2, required: true, published_at: '2026-10-25T00:00:00.000Z', text: { th: 'ข้อกำหนด 2', en: 'Terms 2' } }
    const later = await setup({ policies: [...TEST_POLICIES, v2], client_versions: { ios: '1.0.0', android: '1.0.0' } })
    for (const res of [
      await retain(later.v1, user, records[0], image.attachmentId, 1),
      await json(await later.v1.as(user).put(`/v1/transactions/${records[0]}/attachment`, { attachment_id: image.attachmentId, ...CONSENT }, { ifMatch: 1 })),
      await json(await later.v1.as(user).del(`/v1/transactions/${records[0]}/attachment`, { ifMatch: 1 })),
    ]) {
      expect([res.status, res.body.code]).toEqual([403, 'POLICY_ACCEPTANCE_REQUIRED'])
    }
    expect(await receiptRows(user)).toEqual([])
    expect(later.counted.writes).toBe(0)
    await setup()
  })

  it('AC-3 a deleting account refuses retain, replace, remove, the grant and the download; the release step still runs', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit, 2)
    const image = await seedImportImage(user)
    const other = await seedImportImage(user)
    expect((await retain(kit.v1, user, records[0], image.attachmentId, 1)).status).toBe(200)
    const grant = (await json(await kit.v1.as(user).get(`/v1/attachments/${image.attachmentId}/grant`))).body
    const before = await receiptRows(user)
    await vaultExec(user, "UPDATE account_state SET status = 'deleting'")
    const answers = [
      await retain(kit.v1, user, records[1], other.attachmentId, 1),
      await json(await kit.v1.as(user).put(`/v1/transactions/${records[0]}/attachment`, { attachment_id: other.attachmentId, ...CONSENT }, { ifMatch: 2 })),
      await json(await kit.v1.as(user).del(`/v1/transactions/${records[0]}/attachment`, { ifMatch: 2 })),
      await json(await kit.v1.as(user).get(`/v1/attachments/${image.attachmentId}/grant`)),
      await json(await kit.v1.as(user).get(grant.url)),
    ]
    expect(answers.map((a) => [a.status, a.body.code])).toEqual(Array(5).fill([403, 'ACCOUNT_UNAVAILABLE']))
    expect(await receiptRows(user)).toEqual(before)
    expect(kit.counted.writes).toBe(1)
    const released = await vaultOf(user).call({
      route: 'attachments.release',
      access: 'current_policy',
      charge: 'step',
      claims: { accountId: user.sub, sessionId: user.sid, issuedAt: Math.floor(Date.now() / 1000), clientId: 'ios' },
      policies: TEST_POLICIES,
      params: {},
      query: {},
      headers: {},
      body: { key: before[0].key },
    })
    expect(released).toMatchObject({ ok: true, status: 200 })
    expect(await receiptRows(user)).toEqual(before)
  })

  it('AC-4 an erased vault refuses the receipt routes', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit)
    const image = await seedImportImage(user)
    expect((await retain(kit.v1, user, records[0], image.attachmentId, 1)).status).toBe(200)
    const grant = (await json(await kit.v1.as(user).get(`/v1/attachments/${image.attachmentId}/grant`))).body
    await runInDurableObject(vaultOf(user), (vault: UserVault) => vault.erase())
    for (const res of [
      await retain(kit.v1, user, records[0], image.attachmentId, 2),
      await json(await kit.v1.as(user).get(`/v1/attachments/${image.attachmentId}/grant`)),
      await json(await kit.v1.as(user).get(grant.url)),
    ]) {
      expect([res.status, res.body.code]).toEqual([403, 'ACCOUNT_UNAVAILABLE'])
    }
  })

  it('AC-5 an unknown body field is refused before anything is copied (the API controller reads the body this way)', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit)
    const image = await seedImportImage(user)
    const res = await json(await kit.v1.as(user).post(`/v1/transactions/${records[0]}/attachment`, { attachment_id: image.attachmentId, ...CONSENT, prepared: { key: 'x', bytes: 1, sha256: 'ab' } }, { ifMatch: 1 }))
    expect([res.status, res.body.code]).toEqual([422, 'UNKNOWN_FIELD'])
    expect(await receiptRows(user)).toEqual([])
  })
})

describe('copy path', () => {
  it('CP-1 a request waiting on another copy gives up at copyDeadlineMs with 503', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit, 2)
    const image = await seedImportImage(user)
    const hold = gate()
    const inside = gate()
    kit.hooks.get = async (key, real) => {
      if (key.startsWith('import_image/')) {
        inside.open()
        await hold.opened
      }
      return real()
    }
    try {
      const first = retain(kit.v1, user, records[0], image.attachmentId, 1)
      await inside.opened
      const saved = RECEIPT_LIMITS.copyDeadlineMs
      RECEIPT_LIMITS.copyDeadlineMs = 400
      const started = Date.now()
      let second
      try {
        second = await retain(kit.v1, user, records[1], image.attachmentId, 1)
      } finally {
        RECEIPT_LIMITS.copyDeadlineMs = saved
      }
      expect([second.status, second.body.code, second.body.retry_after_seconds]).toEqual([503, 'SERVICE_UNAVAILABLE', 5])
      expect(Date.now() - started).toBeLessThan(3_000)
      hold.open()
      expect((await first).status).toBe(200)
    } finally {
      hold.open()
    }
  }, 15_000)

  it('CP-2 an image whose preview is no longer ready is not copied', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit)
    const image = await seedImportImage(user)
    await vaultExec(user, "UPDATE import_previews SET status = 'expired', expired_at = ? WHERE job_id = ?", new Date().toISOString(), image.jobId)
    const res = await retain(kit.v1, user, records[0], image.attachmentId, 1)
    expect([res.status, res.body.message_key]).toEqual([422, 'errors.attachment_expired'])
    expect(await receiptRows(user)).toEqual([])
    expect(kit.counted.writes).toBe(0)
  })

  it('CP-3 slots: every copy slot and download slot is back after the probes', async () => {
    const copies = [COPY_SLOTS.take(), COPY_SLOTS.take(), COPY_SLOTS.take(), COPY_SLOTS.take()]
    for (const slot of copies) slot()
    const downloads = Array.from({ length: 8 }, (_, i) => RECEIPT_SLOTS.take(`p${i % 4}`))
    for (const slot of downloads) slot()
  })
})

describe('R37 and the safety net', () => {
  it('DU-1 a stamped release whose object is still live is not due yet (the alarm comes back for the object first)', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit)
    const image = await seedImportImage(user)
    expect((await retain(kit.v1, user, records[0], image.attachmentId, 1)).status).toBe(200)
    expect((await json(await kit.v1.as(user).del(`/v1/transactions/${records[0]}/attachment`, { ifMatch: 2 }))).status).toBe(200)
    const t0 = Date.now()
    await runInDurableObject(vaultOf(user), (_v, state) => pruneAttachments(fileAt(state, t0)))
    // The object is still published (due), not gone: nothing for pruneAttachments to do until it is.
    expect(await runInDurableObject(vaultOf(user), (_v, state) => attachmentsDueAt(fileAt(state, t0)))).toBeNull()
    await runInDurableObject(vaultOf(user), (_v, state) => deleteDueObjects({ context: () => fileAt(state, t0), bucket: env.OBJECTS }))
    expect(await runInDurableObject(vaultOf(user), (_v, state) => attachmentsDueAt(fileAt(state, t0)))).toBe(t0 + 30 * 86_400_000)
  })

  it('DU-2 a retained receipt nothing holds makes attachmentsDueAt now (the safety net is scheduled)', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit)
    const image = await seedImportImage(user)
    expect((await retain(kit.v1, user, records[0], image.attachmentId, 1)).status).toBe(200)
    await runInDurableObject(vaultOf(user), (_v, state) => {
      state.storage.transactionSync(() => {
        const sql = state.storage.sql
        const trigger = sql.exec<{ sql: string }>("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'transaction_attachments_unheld_delete'").one().sql
        sql.exec('DROP TRIGGER transaction_attachments_unheld_delete')
        sql.exec('DELETE FROM transaction_attachments WHERE transaction_id = ?', records[0])
        sql.exec(trigger)
      })
    })
    const t0 = Date.now()
    expect(await runInDurableObject(vaultOf(user), (_v, state) => attachmentsDueAt(fileAt(state, t0)))).toBe(t0)
  })
})

describe('R96 for receipts, per HEAD', () => {
  it('HD-1 each HEAD on a 256 KiB receipt reads the whole file, then a GET answers 200', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit)
    const bytes = new Uint8Array(256 * 1024).map((_, i) => (i * 31 + 7) & 0xff)
    const large: SeededImage = await seedImportImage(user, { bytes })
    expect((await retain(kit.v1, user, records[0], large.attachmentId, 1)).status).toBe(200)
    const grant = (await json(await kit.v1.as(user).get(`/v1/attachments/${large.attachmentId}/grant`))).body
    let read = 0
    kit.hooks.get = async (key, real) => {
      const found = await real()
      if (!found || !key.startsWith('receipt/')) return found
      const body = found.body as AsyncIterable<Uint8Array>
      const counted = (async function* () {
        for await (const chunk of body) {
          read += chunk.byteLength
          yield chunk
        }
      })()
      return { key: found.key, size: found.size, uploaded: found.uploaded, customMetadata: found.customMetadata, httpMetadata: found.httpMetadata, body: counted, arrayBuffer: () => found.arrayBuffer() }
    }
    const heads: number[][] = []
    for (let i = 0; i < 3; i += 1) {
      read = 0
      const head = await kit.v1.as(user).request('HEAD', grant.url)
      heads.push([head.status, (await head.arrayBuffer()).byteLength, read])
    }
    expect(heads).toEqual(Array(3).fill([200, 0, bytes.length]))
    const file = await kit.v1.as(user).get(grant.url)
    expect([file.status, (await file.arrayBuffer()).byteLength]).toEqual([200, bytes.length])
  })
})

describe('1B-T9 helpers stay exact', () => {
  it('ID-1 the vault id is in every receipt key', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit)
    const image = await seedImportImage(user)
    expect((await retain(kit.v1, user, records[0], image.attachmentId, 1)).status).toBe(200)
    expect((await receiptRows(user))[0].key.startsWith(`receipt/${vaultIdOf(user)}/${image.attachmentId}/`)).toBe(true)
  })
})
