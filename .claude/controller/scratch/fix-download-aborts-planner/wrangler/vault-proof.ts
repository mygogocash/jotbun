// The vault Worker's entry for the fix-download-aborts `wrangler dev` proof
// only. It is never committed: run-proof.sh copies it to
// src/roles/vault-proof.ts in a proof copy of the tree and points
// wrangler.vault.jsonc's `main` at it. Every request that is not under
// /__proof/ goes to the real entry (src/roles/vault.ts), so the front door, the
// downloads and the copies run byte for byte as built from the tree. The two
// seeding routes write into a person's vault what the Workers tests' helpers
// write (test/workers/support/files.ts): a receipt photo's import image
// (seedImportImage) and records with their change rows and heads (seedLedger),
// because wrangler dev runs no parser container and the front door's write
// budget would make a large ledger slow.
import { changeGroupBytes } from '@api/sync/change-writer'

import { buildSnapshot } from '../vault/files/snapshots'
import vault from './vault'
import { UserVault as RealVault } from '../vault/user-vault'
import type { V1Env } from '../v1/env'

export { StatementParser, ExportWorkflow, SnapshotWorkflow } from './vault'

const MIN = 60_000
const DAY = 24 * 60 * MIN
/** IMPORT_UPLOAD_MAX_BYTES: the upload row's CHECK. A receipt is at most this size too (attachments.bytes). */
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024
const NOTE = 'ข้าวมันไก่ต้มกับน้ำซุปร้อน มื้อกลางวันที่ร้านประจำ'
const MERCHANT = 'ร้านข้าวมันไก่ประตูน้ำ'

export class UserVault extends RealVault {
  /** seedImportImage's three rows for a JPEG already stored at `key`: an accepted upload, a ready receipt preview naming the image, and its registration (published for a day). */
  proofImage(input: { jobId: string; attachmentId: string; key: string; bytes: number; sha256: string }): void {
    const now = Date.now()
    const at = (ms: number) => new Date(ms).toISOString()
    const sql = this.ctx.storage.sql
    this.ctx.storage.transactionSync(() => {
      sql.exec(
        `INSERT INTO import_uploads (job_id, intake_token, status, file_name, declared_type, format, bytes, sha256, part_count, parse_state, parse_attempts, created_at, receive_deadline, accepted_at, expires_at)
         VALUES (?, ?, 'accepted', 'receipt.jpg', 'image/jpeg', 'jpeg', ?, ?, 1, 'parsed', 1, ?, ?, ?, ?)`,
        input.jobId, crypto.randomUUID(), Math.min(input.bytes, MAX_UPLOAD_BYTES), input.sha256, at(now - MIN), at(now + 9 * MIN), at(now - MIN), at(now - MIN + DAY),
      )
      sql.exec(
        `INSERT INTO import_previews (job_id, status, layout, issues, candidate_count, review_required_count, image_key, image_width, image_height, image_attachment_id, review_revision, created_at, expires_at)
         VALUES (?, 'ready', 'receipt', '["receipt_fields_unread"]', 0, 0, ?, 1, 1, ?, 1, ?, ?)`,
        input.jobId, input.key, input.attachmentId, at(now), at(now + 7 * DAY),
      )
      sql.exec("INSERT INTO vault_objects (key, purpose, status, delete_after, bytes, sha256, created_at) VALUES (?, 'import_image', 'published', ?, ?, ?, ?)", input.key, now + DAY, input.bytes, input.sha256, now)
    })
  }

  /** seedLedger's writer: one wallet and one expense category, then `count` expense records on `on`, each with its change row and head under a revision of its own, 1,000 per block. */
  proofLedger(count: number, on: string): { records: number } {
    const sql = this.ctx.storage.sql
    const at = new Date().toISOString()
    const commit = (entity: string, id: string, snapshot: Record<string, unknown>) => {
      sql.exec('UPDATE sync_state SET revision = revision + 1 WHERE id = 1')
      const commandId = crypto.randomUUID()
      sql.exec(
        `INSERT INTO entity_changes (revision, ordinal, command_id, entity, entity_id, version, state, snapshot, committed_at, group_bytes)
         VALUES ((SELECT revision FROM sync_state WHERE id = 1), 0, ?, ?, ?, 1, 'active', ?, ?, ?)`,
        commandId, entity, id, JSON.stringify(snapshot), at, changeGroupBytes(commandId, [{ entity, id, version: 1, state: 'active', snapshot }]),
      )
      sql.exec("INSERT INTO entity_heads (entity, entity_id, version, state, revision) VALUES (?, ?, 1, 'active', (SELECT revision FROM sync_state WHERE id = 1))", entity, id)
    }
    const wallet = crypto.randomUUID()
    const category = crypto.randomUUID()
    this.ctx.storage.transactionSync(() => {
      sql.exec("INSERT INTO wallets (id, name, currency, opening_minor, tracking_start, archived, version, created_at, updated_at) VALUES (?, 'บัญชีออมทรัพย์', 'THB', 0, '2016-01-01', 0, 1, ?, ?)", wallet, at, at)
      commit('wallet', wallet, { id: wallet, name: 'บัญชีออมทรัพย์', currency: 'THB', opening_minor: '0', tracking_start: '2016-01-01', archived: false, version: 1 })
      sql.exec("INSERT INTO categories (id, type, builtin_key, label, color, archived, version, created_at, updated_at) VALUES (?, 'expense', NULL, 'อาหารกลางวัน', NULL, 0, 1, ?, ?)", category, at, at)
      commit('category', category, { id: category, type: 'expense', builtin_key: null, label: 'อาหารกลางวัน', color: null, archived: false, version: 1 })
    })
    for (let done = 0; done < count; ) {
      const batch = Math.min(1000, count - done)
      this.ctx.storage.transactionSync(() => {
        for (let i = 0; i < batch; i += 1) {
          const id = crypto.randomUUID()
          const amount = String(1000 + ((done + i) % 99_000))
          sql.exec(
            "INSERT INTO transactions (id, type, amount_minor, occurred_on, wallet_id, category_id, note, merchant, version, created_at, updated_at) VALUES (?, 'expense', ?, ?, ?, ?, ?, ?, 1, ?, ?)",
            id, Number(amount), on, wallet, category, NOTE, MERCHANT, at, at,
          )
          commit('transaction', id, { id, amount_minor: amount, occurred_on: on, note: NOTE, merchant: MERCHANT, deleted_at: null, version: 1, type: 'expense', wallet_id: wallet, category_id: category })
        }
      })
      done += batch
    }
    return { records: count }
  }

  /**
   * A snapshot of the vault built by buildSnapshot (the method SnapshotWorkflow's
   * step runs) with chunks of up to `chunkBytes`: one larger than the socket
   * buffers, so a client that goes away once the headers are in leaves most of
   * the chunk unsent. Its row is marked started, so no starter builds it again.
   */
  async proofSnapshot(chunkBytes: number): Promise<{ id: string; outcome: string }> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    this.ctx.storage.sql.exec("INSERT INTO snapshots (id, status, created_at, started_at) VALUES (?, 'pending', ?, ?)", id, now, now)
    const { outcome } = await buildSnapshot({ context: () => this.fileContext(), bucket: this.bucket, active: (c) => this.isActive(c) }, id, { chunkBytes })
    return { id, outcome }
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * POST /__proof/image?sub=&bytes=: a JPEG-typed image of `bytes` bytes (a
 * fixed pattern) stored at a fresh import_image key with its SHA-256, and its
 * rows in the person's vault; answers { attachment_id, sha256 }.
 * POST /__proof/ledger?sub=&count=&on=: proofLedger in the person's vault.
 * POST /__proof/snapshot?sub=&chunkBytes=: proofSnapshot in the person's vault; answers { id, outcome }.
 */
async function proof(url: URL, env: V1Env): Promise<Response> {
  const sub = url.searchParams.get('sub') ?? ''
  const id = env.VAULT.idFromName(sub)
  const stub = env.VAULT.get(id, { locationHint: 'apac' }) as unknown as DurableObjectStub<UserVault>
  if (url.pathname === '/__proof/image') {
    const size = Number(url.searchParams.get('bytes') ?? '159')
    const bytes = new Uint8Array(size)
    for (let i = 0; i < size; i += 1) bytes[i] = (i * 31 + 7) & 0xff
    const sha256 = await sha256Hex(bytes)
    const jobId = crypto.randomUUID()
    const attachmentId = crypto.randomUUID()
    const key = `import_image/${id.toString()}/${jobId}/${crypto.randomUUID()}/image.jpg`
    if (!env.OBJECTS) throw new Error('no bucket')
    await env.OBJECTS.put(key, bytes, { sha256, customMetadata: { sha256 }, httpMetadata: { contentType: 'image/jpeg' } })
    await stub.proofImage({ jobId, attachmentId, key, bytes: size, sha256 })
    return Response.json({ attachment_id: attachmentId, sha256 })
  }
  if (url.pathname === '/__proof/snapshot') {
    return Response.json(await stub.proofSnapshot(Number(url.searchParams.get('chunkBytes') ?? String(1024 * 1024))))
  }
  if (url.pathname === '/__proof/ledger') {
    return Response.json(await stub.proofLedger(Number(url.searchParams.get('count') ?? '0'), url.searchParams.get('on') ?? '2026-03-15'))
  }
  return new Response(null, { status: 404 })
}

export default {
  fetch(request: Request, env: V1Env): Promise<Response> | Response {
    const url = new URL(request.url)
    if (request.method === 'POST' && url.pathname.startsWith('/__proof/')) return proof(url, env)
    return vault.fetch(request, env)
  },
  queue: vault.queue,
}
