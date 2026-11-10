// Ruling R97 (fix-download-aborts): every slot the Worker takes for a request
// keeps that request alive until the slot is back. When a client goes away the
// runtime ends its request; only a pending waitUntil promise keeps it running
// until a download's cancel reaches its body, or a copy or an upload reaches
// its `finally`, and gives the slot back. The Workers test runtime keeps every
// request alive, so it cannot show the leak: the evidence is the `wrangler dev`
// proof in the receipt (four aborted requests of each kind, then one more is
// served). These cases pin the wiring that fix rests on: the promise each
// download, copy and upload hands to waitUntil stays pending while its slot is
// held, and ends once the slot is back, however its body ends; a request that
// takes no slot hands over nothing.
import { env } from 'cloudflare:workers'
import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { RECEIPT_RETENTION_CONSENT } from '@gogospend/contracts'
import type { AttachmentGrant, ExportDto, ExportGrant, SnapshotDto } from '@gogospend/contracts'

import { derivedUuid } from '@api/commands/derived-id'

import { EXPORT_SLOTS, RECEIPT_SLOTS, SNAPSHOT_SLOTS } from '../../src/v1/files/downloads'
import { COPY_SLOTS } from '../../src/v1/files/receipts'
import { uploadsInFlight } from '../../src/v1/files/uploads'
import type { VaultBucket } from '../../src/vault/files/keys'
import { csvText, eventually, gate, seedImportImage, spyBucket, stalledBody, upload } from './support/files'
import { builtinId, moneyFixtures } from './support/money-fixtures'
import { member, startV1, vaultOf } from './support/v1-client'
import type { TestUser, V1Client } from './support/v1-client'

/** How long a check waits before it calls a promise pending: nothing ends a held slot's promise but the case. */
const PENDING_MS = 100
/** How long a check waits at most for a promise that should end; it answers as soon as the promise ends. */
const ENDED_MS = 5_000
/** The size of the pieces a held body is served in. */
const PIECE = 16

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const sha256Of = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const nowSeconds = () => Math.floor(Date.now() / 1000)

/**
 * Watches every promise the front door has handed to waitUntil so far (and any
 * handed over while they run, as `settle()` does). The function it returns
 * answers whether they have all ended, waiting up to `ms` for them.
 */
function watch(v1: V1Client): (ms: number) => Promise<boolean> {
  let ended = false
  const settling = v1.settle().then(() => {
    ended = true
  })
  return async (ms) => {
    await Promise.race([settling, delay(ms)])
    return ended
  }
}

/**
 * The R2 binding as the Worker sees it, with the stored bodies of keys under
 * `prefix` held: each is served in PIECE-byte pieces, and its last piece waits
 * until the case opens the gate. A download of such a key answers its headers
 * and keeps its slot until the case lets its body end, or cancels it. Every
 * other key is served as stored.
 */
function heldBodies(prefix: string) {
  let open = false
  const waiting: (() => void)[] = []
  const bucket: VaultBucket = {
    ...spyBucket({}),
    get: async (key) => {
      const found = await env.OBJECTS.get(key)
      if (!found || !key.startsWith(prefix)) return found
      const bytes = new Uint8Array(await found.arrayBuffer())
      const body = (async function* () {
        for (let at = 0; at < bytes.length; at += PIECE) {
          if (at + PIECE >= bytes.length && !open) await new Promise<void>((resolve) => waiting.push(resolve))
          yield bytes.subarray(at, at + PIECE)
        }
      })()
      return {
        key: found.key,
        size: found.size,
        uploaded: found.uploaded,
        customMetadata: found.customMetadata,
        httpMetadata: found.httpMetadata,
        body,
        arrayBuffer: () => Promise.reject(new Error('read whole')),
      } as unknown as Awaited<ReturnType<VaultBucket['get']>>
    },
  }
  return {
    bucket,
    /** Lets every held body end, and serves later ones whole. */
    open: () => {
      open = true
      for (const go of waiting.splice(0)) go()
    },
    /** Holds every later body at its last piece again. */
    hold: () => {
      open = false
    },
  }
}

type Download = {
  v1: V1Client
  user: TestUser
  bodies: ReturnType<typeof heldBodies>
  /** The download's path and the SHA-256 its file was recorded with. */
  url: string
  sha256: string
  /** A path of the same route whose grant the vault refuses (404). */
  refusedUrl: string
  /** Takes one of the slots this person's download needs. */
  take: () => () => void
  /** How many of those slots one person may hold. */
  slots: number
}

/**
 * One download kind, through the front door: a GET read to its end, a GET
 * cancelled, a HEAD, then `slots` more GETs read to the end (one more
 * download than the person's slots, so a slot that is never returned would
 * refuse one), then a GET the vault refuses and a GET with every slot taken.
 * Each line names the request, its status, and whether every promise handed
 * to waitUntil had ended: not while a body is unread, and at once when it is
 * read, cancelled or answered to a HEAD, or when no slot was taken.
 */
async function pinnedDownload(d: Download): Promise<unknown[]> {
  const lines: unknown[] = []
  const get = () => d.v1.as(d.user).get(d.url)

  d.bodies.hold()
  const read = await get()
  let ended = watch(d.v1)
  lines.push(['GET, body unread', read.status, await ended(PENDING_MS)])
  d.bodies.open()
  const bytes = new Uint8Array(await read.arrayBuffer())
  lines.push(['GET, body read to its end', sha256Of(bytes) === d.sha256, await ended(ENDED_MS)])

  d.bodies.hold()
  const cancelled = await get()
  ended = watch(d.v1)
  lines.push(['GET, body unread', cancelled.status, await ended(PENDING_MS)])
  await cancelled.body?.cancel()
  lines.push(['GET, body cancelled', await ended(ENDED_MS)])

  d.bodies.open()
  const head = await d.v1.as(d.user).request('HEAD', d.url)
  ended = watch(d.v1)
  lines.push(['HEAD', head.status, (await head.arrayBuffer()).byteLength, await ended(ENDED_MS)])

  for (let i = 0; i < d.slots; i += 1) {
    const again = await get()
    lines.push(['GET', again.status, sha256Of(new Uint8Array(await again.arrayBuffer())) === d.sha256])
  }

  const refused = await d.v1.as(d.user).get(d.refusedUrl)
  ended = watch(d.v1)
  lines.push(['GET of a grant the vault refuses', refused.status, await ended(ENDED_MS)])
  await refused.arrayBuffer()

  const taken = Array.from({ length: d.slots }, () => d.take())
  try {
    const busy = await get()
    ended = watch(d.v1)
    lines.push(['GET with every slot taken', busy.status, await ended(ENDED_MS)])
    await busy.arrayBuffer()
  } finally {
    for (const slot of taken) slot()
  }
  return lines
}

/** What pinnedDownload must read for a download kind whose person holds `slots` slots. */
const PINNED = (slots: number): unknown[] => [
  ['GET, body unread', 200, false],
  ['GET, body read to its end', true, true],
  ['GET, body unread', 200, false],
  ['GET, body cancelled', true],
  ['HEAD', 200, 0, true],
  ...Array.from({ length: slots }, () => ['GET', 200, true]),
  ['GET of a grant the vault refuses', 404, true],
  ['GET with every slot taken', 503, true],
]

async function memberWithRecord(v1: V1Client): Promise<{ user: TestUser; record: string }> {
  const money = moneyFixtures(v1)
  const user = await money.member()
  const wallet = await money.wallet(user)
  const record = await money.record(user, { type: 'expense', amount_minor: '6500', occurred_on: '2026-03-05', wallet_id: wallet, category_id: builtinId(user, 'food') })
  return { user, record }
}

const retain = (v1: V1Client, user: TestUser, record: string, attachmentId: string) =>
  v1.as(user).post(`/v1/transactions/${record}/attachment`, { attachment_id: attachmentId, consent: RECEIPT_RETENTION_CONSENT }, { ifMatch: 1 })

describe('R97: a slot keeps its request alive until it is back (fix-download-aborts)', () => {
  it('an export download hands waitUntil a promise that is pending while its body is unread and ends once the body is read, cancelled or answered to a HEAD', async () => {
    const bodies = heldBodies('export/')
    const v1 = await startV1(undefined, { startWork: 'manual', env: { OBJECTS: bodies.bucket } })
    const { user } = await memberWithRecord(v1)
    const key = randomUUID()
    const requested = await v1.as(user, { authTime: nowSeconds() }).post('/v1/exports', { proof_id: randomUUID(), from: '2026-03-01', through: '2026-03-31' }, { key })
    expect(requested.status).toBe(202)
    const exportId = derivedUuid(user.sub, 'export-request', key)
    expect(await vaultOf(user).writeExport(exportId)).toEqual({ outcome: 'ready' })
    const dto = (await (await v1.as(user).get(`/v1/exports/${exportId}`)).json()) as Extract<ExportDto, { status: 'ready' }>
    const grant = (await (await v1.as(user).get(`/v1/exports/${exportId}/grant`)).json()) as ExportGrant
    const lines = await pinnedDownload({ v1, user, bodies, url: grant.url, sha256: dto.sha256, refusedUrl: '/v1/export-files/not-a-grant', take: () => EXPORT_SLOTS.take(), slots: 4 })
    expect(lines).toEqual(PINNED(4))
  }, 30_000)

  it('a snapshot chunk download hands waitUntil a promise that is pending while its body is unread and ends once the body is read, cancelled or answered to a HEAD', async () => {
    const bodies = heldBodies('sync_snapshot/')
    const v1 = await startV1(undefined, { startWork: 'manual', env: { OBJECTS: bodies.bucket } })
    const { user } = await memberWithRecord(v1)
    const key = randomUUID()
    expect((await v1.as(user).post('/v1/sync/snapshots', {}, { key })).status).toBe(202)
    const snapshotId = derivedUuid(user.sub, 'snapshot-request', key)
    expect(await vaultOf(user).buildSnapshot(snapshotId)).toEqual({ outcome: 'ready' })
    const dto = (await (await v1.as(user).get(`/v1/sync/snapshots/${snapshotId}`)).json()) as Extract<SnapshotDto, { status: 'ready' }>
    const [chunk] = dto.chunks
    const lines = await pinnedDownload({
      v1,
      user,
      bodies,
      url: `/v1/sync/snapshot-chunks/${chunk.grant}`,
      sha256: chunk.sha256,
      refusedUrl: '/v1/sync/snapshot-chunks/AAAAAAAAAAAAAAAAAAAAAAAA',
      take: () => SNAPSHOT_SLOTS.take(),
      slots: 4,
    })
    expect(lines).toEqual(PINNED(4))
  }, 30_000)

  it('a receipt download hands waitUntil a promise that is pending while its body is unread and ends once the body is read, cancelled or answered to a HEAD', async () => {
    const bodies = heldBodies('receipt/')
    const v1 = await startV1(undefined, { env: { OBJECTS: bodies.bucket } })
    const { user, record } = await memberWithRecord(v1)
    const image = await seedImportImage(user)
    expect((await retain(v1, user, record, image.attachmentId)).status).toBe(200)
    const grant = (await (await v1.as(user).get(`/v1/attachments/${image.attachmentId}/grant`)).json()) as AttachmentGrant
    // The account's two receipt download slots (RECEIPT_SLOTS, per account).
    const lines = await pinnedDownload({ v1, user, bodies, url: grant.url, sha256: image.sha256, refusedUrl: '/v1/attachment-files/not-a-grant', take: () => RECEIPT_SLOTS.take(user.sub), slots: 2 })
    expect(lines).toEqual(PINNED(2))
  }, 30_000)

  it('a retain hands waitUntil a promise that is pending while it holds a copy slot and ends once the slot is back; a retain turned away for want of a slot hands over nothing', async () => {
    // The copy reads the import image through the Worker's bucket: the first read waits for the case, so the
    // retain holds its COPY_SLOTS slot (taken before the prepare step) until the gate opens.
    const copying = gate()
    const reached = gate()
    let holdNext = true
    const bucket: VaultBucket = {
      ...spyBucket({}),
      get: async (key) => {
        if (key.startsWith('import_image/') && holdNext) {
          holdNext = false
          reached.open()
          await copying.opened
        }
        return env.OBJECTS.get(key)
      },
    }
    const v1 = await startV1(undefined, { env: { OBJECTS: bucket } })
    const money = moneyFixtures(v1)
    const user = await money.member()
    const wallet = await money.wallet(user)
    const recordAndImage = async () => ({
      record: await money.record(user, { type: 'expense', amount_minor: '6500', occurred_on: '2026-03-05', wallet_id: wallet, category_id: builtinId(user, 'food') }),
      image: await seedImportImage(user),
    })
    const lines: unknown[] = []
    const first = await recordAndImage()
    const retained = retain(v1, user, first.record, first.image.attachmentId)
    await reached.opened
    let ended = watch(v1)
    lines.push(['retain, copy held', await ended(PENDING_MS)])
    copying.open()
    lines.push(['retain', (await retained).status, await ended(ENDED_MS)])
    // Four more, one more retain than COPY_SLOTS holds, so a slot that is never returned would refuse one.
    for (let i = 0; i < 4; i += 1) {
      const next = await recordAndImage()
      const res = await retain(v1, user, next.record, next.image.attachmentId)
      lines.push(['retain', res.status])
      await res.arrayBuffer()
    }
    const last = await recordAndImage()
    const taken = Array.from({ length: 4 }, () => COPY_SLOTS.take())
    try {
      const busy = await retain(v1, user, last.record, last.image.attachmentId)
      ended = watch(v1)
      lines.push(['retain with every copy slot taken', busy.status, await ended(ENDED_MS)])
      await busy.arrayBuffer()
    } finally {
      for (const slot of taken) slot()
    }
    expect(lines).toEqual([
      ['retain, copy held', false],
      ['retain', 200, true],
      ['retain', 200],
      ['retain', 200],
      ['retain', 200],
      ['retain', 200],
      ['retain with every copy slot taken', 503, true],
    ])
  }, 30_000)

  it("an upload hands waitUntil a promise that is pending while it holds its place among the isolate's uploads and ends once it gives the place back", async () => {
    // The upload's body stalls after its first 200 bytes, so the upload holds its place (MAX_UPLOADS_PER_ISOLATE)
    // until the case lets the rest through.
    const v1 = await startV1(undefined, { env: { IMPORT_UPLOADS_ENABLED: 'true' }, startWork: 'manual' })
    const user = await member(v1)
    const rest = gate()
    const accepted = upload(v1, user, stalledBody(csvText(200), csvText(200), rest.opened), { chunked: true })
    expect(await eventually(async () => uploadsInFlight(), (n) => n === 1)).toBe(1)
    const ended = watch(v1)
    const lines: unknown[] = [['upload, body stalled', await ended(PENDING_MS)]]
    rest.open()
    const reply = await accepted
    lines.push(['upload', reply.status, await ended(ENDED_MS), uploadsInFlight()])
    expect(lines).toEqual([
      ['upload, body stalled', false],
      ['upload', 202, true, 0],
    ])
  }, 30_000)
})
