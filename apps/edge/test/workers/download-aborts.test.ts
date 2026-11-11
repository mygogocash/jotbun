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
// takes no slot hands over nothing. The review's fix round (m1, n2 to n4) adds
// three paths: every attempt of a copy (one that waited on another's copy
// included), an upload turned away at the isolate's limit, and a download
// refused after it took its slot; and each case takes its own slots as a line,
// so a leaked slot shows in the lines rather than as the test's own 503.
import { env } from 'cloudflare:workers'
import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { RECEIPT_RETENTION_CONSENT } from '@gogospend/contracts'
import type { AttachmentGrant, ExportDto, ExportGrant, SnapshotDto } from '@gogospend/contracts'

import { derivedUuid } from '@api/commands/derived-id'

import { EXPORT_SLOTS, RECEIPT_SLOTS, SNAPSHOT_SLOTS } from '../../src/v1/files/downloads'
import { COPY_SLOTS } from '../../src/v1/files/receipts'
import { MAX_UPLOADS_PER_ISOLATE, uploadsInFlight } from '../../src/v1/files/uploads'
import type { VaultCall } from '../../src/v1/protocol'
import type { VaultBucket } from '../../src/vault/files/keys'
import type { UserVault } from '../../src/vault/user-vault'
import { csvText, eventually, gate, seedImportImage, spyBucket, stalledBody, upload } from './support/files'
import type { Reply } from './support/files'
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
 * and keeps its slot until the case lets its body end, or cancels it. While the
 * case has the objects lost, such a key reads as gone: its download is refused
 * (404) after it took its slot. Every other key is served as stored.
 */
function heldBodies(prefix: string) {
  let open = false
  let lost = false
  const waiting: (() => void)[] = []
  const bucket: VaultBucket = {
    ...spyBucket({}),
    get: async (key) => {
      if (lost && key.startsWith(prefix)) return null
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
    /** Makes every later read of a key under `prefix` find nothing (true), or the stored object again (false). */
    lose: (gone: boolean) => {
      lost = gone
    },
  }
}

/**
 * Takes up to `count` slots for the case itself into `own`, and answers how
 * many it got. A pool already short (a slot one of the case's requests kept)
 * answers fewer, so a leak shows in the case's lines rather than as the test's
 * own 503 (the review's n4). The case gives `own` back in its `finally`,
 * however far the takes got.
 */
function takeUpTo(take: () => () => void, count: number, own: (() => void)[]): number {
  for (let i = 0; i < count; i += 1) {
    try {
      own.push(take())
    } catch {
      break
    }
  }
  return own.length
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
 * refuse one), a GET whose object is gone (refused with 404 after it took its
 * slot: the `catch` path, the review's n3), a GET the vault refuses, and a GET
 * with every slot taken (the case takes them itself, as a line). Each line
 * names the request, its status, and whether every promise handed to
 * waitUntil had ended: not while a body is unread, and at once when it is
 * read, cancelled, answered to a HEAD or refused, or when no slot was taken.
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

  d.bodies.lose(true)
  const gone = await get()
  ended = watch(d.v1)
  lines.push(['GET refused after it took its slot (its object is gone)', gone.status, await ended(ENDED_MS)])
  await gone.arrayBuffer()
  d.bodies.lose(false)

  const refused = await d.v1.as(d.user).get(d.refusedUrl)
  ended = watch(d.v1)
  lines.push(['GET of a grant the vault refuses', refused.status, await ended(ENDED_MS)])
  await refused.arrayBuffer()

  const own: (() => void)[] = []
  try {
    lines.push(['slots the case takes for itself', takeUpTo(d.take, d.slots, own)])
    const busy = await get()
    ended = watch(d.v1)
    lines.push(['GET with every slot taken', busy.status, await ended(ENDED_MS)])
    await busy.arrayBuffer()
  } finally {
    for (const slot of own) slot()
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
  ['GET refused after it took its slot (its object is gone)', 404, true],
  ['GET of a grant the vault refuses', 404, true],
  ['slots the case takes for itself', slots],
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

/** Whether `step` is reached before `answered` settles: a request refused before it gets there answers first. */
const reachedFirst = (step: Promise<void>, answered: Promise<unknown>): Promise<boolean> =>
  Promise.race([step.then(() => true), answered.then(() => false, () => false)])

/** The VAULT binding, with the kind of every prepare step's reply recorded in `kinds`. */
function preparesSeen(kinds: string[]): DurableObjectNamespace<UserVault> {
  const real = env.VAULT
  return new Proxy(real, {
    get(target, prop) {
      if (prop === 'get') {
        return (id: DurableObjectId, options?: unknown) => {
          const stub = (target.get as (...args: unknown[]) => DurableObjectStub<UserVault>)(id, options)
          return new Proxy(stub, {
            get(s, p) {
              if (p === 'call') {
                return async (call: VaultCall) => {
                  const reply = await s.call(call)
                  if (call.route === 'attachments.prepare') kinds.push(reply.ok ? (reply.body as { kind: string }).kind : String(reply.status))
                  return reply
                }
              }
              const value = Reflect.get(s, p)
              return typeof value === 'function' ? value.bind(s) : value
            },
          })
        }
      }
      const value = Reflect.get(target, prop)
      return typeof value === 'function' ? value.bind(target) : value
    },
  }) as DurableObjectNamespace<UserVault>
}

describe('R97: a slot keeps its request alive until it is back (fix-download-aborts)', () => {
  it('an export download hands waitUntil a promise that is pending while its body is unread and ends once the body is read, cancelled, answered to a HEAD or refused after it took its slot', async () => {
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

  it('a snapshot chunk download hands waitUntil a promise that is pending while its body is unread and ends once the body is read, cancelled, answered to a HEAD or refused after it took its slot', async () => {
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

  it('a receipt download hands waitUntil a promise that is pending while its body is unread and ends once the body is read, cancelled, answered to a HEAD or refused after it took its slot', async () => {
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
    const own: (() => void)[] = []
    try {
      lines.push(['copy slots the case takes for itself', takeUpTo(() => COPY_SLOTS.take(), 4, own)])
      const busy = await retain(v1, user, last.record, last.image.attachmentId)
      ended = watch(v1)
      lines.push(['retain with every copy slot taken', busy.status, await ended(ENDED_MS)])
      await busy.arrayBuffer()
    } finally {
      for (const slot of own) slot()
    }
    expect(lines).toEqual([
      ['retain, copy held', false],
      ['retain', 200, true],
      ['retain', 200],
      ['retain', 200],
      ['retain', 200],
      ['retain', 200],
      ['copy slots the case takes for itself', 4],
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

  it("a retain that waited on another request's copy hands waitUntil a promise on its later attempt too, pending while that attempt copies", async () => {
    // The review's m1 (its R14), probe PB: prepare takes every attempt's COPY_SLOTS slot through untilReturned, not
    // only the first. Request A copies the image and fails; request B, from a second client, is told `wait`
    // meanwhile, then copies the image itself on a later attempt. The race helper keeps a refused request from
    // leaving the case waiting at a gate it never reaches.
    const reachedA = gate()
    const failA = gate()
    const reachedB = gate()
    const goB = gate()
    const bucketA: VaultBucket = {
      ...spyBucket({}),
      get: async (key) => {
        if (key.startsWith('import_image/')) {
          reachedA.open()
          await failA.opened
          throw new Error('the first copy fails')
        }
        return env.OBJECTS.get(key)
      },
    }
    let holdB = true
    const bucketB: VaultBucket = {
      ...spyBucket({}),
      get: async (key) => {
        if (key.startsWith('import_image/') && holdB) {
          holdB = false
          reachedB.open()
          await goB.opened
        }
        return env.OBJECTS.get(key)
      },
    }
    const kinds: string[] = []
    const a = await startV1(undefined, { env: { OBJECTS: bucketA } })
    const b = await startV1(undefined, { env: { OBJECTS: bucketB, VAULT: preparesSeen(kinds) } })
    const money = moneyFixtures(a)
    const user = await money.member()
    const wallet = await money.wallet(user)
    const record = () => money.record(user, { type: 'expense', amount_minor: '6500', occurred_on: '2026-03-05', wallet_id: wallet, category_id: builtinId(user, 'food') })
    const first = await record()
    const second = await record()
    const image = await seedImportImage(user)
    const lines: unknown[] = []
    const retainedA = retain(a, user, first, image.attachmentId)
    lines.push(['A copies', await reachedFirst(reachedA.opened, retainedA)])
    const retainedB = retain(b, user, second, image.attachmentId)
    for (let i = 0; i < 200 && !kinds.includes('wait'); i += 1) await delay(10)
    lines.push(['B is told to wait', kinds.includes('wait')])
    failA.open()
    const answerA = await retainedA
    lines.push(["A's copy fails", answerA.status])
    await answerA.arrayBuffer()
    const copying = await reachedFirst(reachedB.opened, retainedB)
    const ended = watch(b)
    lines.push(['B copies on a later attempt', copying, await ended(PENDING_MS)])
    goB.open()
    const answerB = await retainedB
    lines.push(['B retains', answerB.status, await ended(ENDED_MS)])
    await answerB.arrayBuffer()
    expect(lines).toEqual([
      ['A copies', true],
      ['B is told to wait', true],
      ["A's copy fails", 503],
      ['B copies on a later attempt', true, false],
      ['B retains', 200, true],
    ])
  }, 30_000)

  it("an upload turned away at the isolate's limit (503) hands waitUntil nothing", async () => {
    // The review's n2 (its R11), probe PA: sixteen uploads hold every place (MAX_UPLOADS_PER_ISOLATE), on one
    // client; a seventeenth, from a second client, is turned away before it takes a place, so that client is
    // handed nothing to wait for. Then the sixteen end and give their places back.
    const holder = await startV1(undefined, { env: { IMPORT_UPLOADS_ENABLED: 'true' }, startWork: 'manual' })
    const turned = await startV1(undefined, { env: { IMPORT_UPLOADS_ENABLED: 'true' }, startWork: 'manual' })
    const rest = gate()
    const held: Promise<Reply>[] = []
    const lines: unknown[] = []
    try {
      for (let pair = 0; pair < MAX_UPLOADS_PER_ISOLATE / 2; pair += 1) {
        const user = await member(holder)
        for (let i = 0; i < 2; i += 1) held.push(upload(holder, user, stalledBody(csvText(200), csvText(200), rest.opened), { chunked: true }))
      }
      lines.push(['uploads holding a place', await eventually(async () => uploadsInFlight(), (n) => n === MAX_UPLOADS_PER_ISOLATE)])
      const user = await member(turned)
      const next = await upload(turned, user, csvText(200))
      const ended = watch(turned)
      lines.push(['an upload with every place taken', next.status, await ended(ENDED_MS)])
    } finally {
      rest.open()
    }
    lines.push(['the sixteen, once their bodies end', (await Promise.all(held)).map((reply) => reply.status).filter((status) => status !== 202), uploadsInFlight()])
    expect(lines).toEqual([
      ['uploads holding a place', MAX_UPLOADS_PER_ISOLATE],
      ['an upload with every place taken', 503, true],
      ['the sixteen, once their bodies end', [], 0],
    ])
  }, 30_000)
})
