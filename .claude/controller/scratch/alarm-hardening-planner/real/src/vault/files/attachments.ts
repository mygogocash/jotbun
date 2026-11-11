import { ATTACHMENT_DOWNLOAD_PATH, ATTACHMENT_MESSAGE_KEYS, ContractValidationError, RECEIPT_RETENTION_CONSENT, isUuid } from '@gogospend/contracts'
import type { AttachmentContentType, AttachmentGrant, CommandAck } from '@gogospend/contracts'

import { ATTACHMENT_REMOVE_KIND, ATTACHMENT_REPLACE_KIND, ATTACHMENT_RETAIN_KIND } from '@api/attachments/attachments.service'
import { routeId, stateProblem } from '@api/commands/versioned-entity'
import { ProblemException } from '@api/common/api-problem.filter'

import type { VaultCall } from '../../v1/protocol'
import { expectVersion, requireLiveEntity } from '../commands/entity-state'
import { commandInput, runCommand } from '../commands/executor'
import type { AuditMetadata, VaultMutation } from '../commands/executor'
import type { VaultContext } from '../context'
import { COLUMNS, toDto, transactionRow } from '../domain/transactions'
import type { TransactionRow } from '../domain/transactions'
import { touch } from './context'
import type { FileContext } from './context'
import { receiptGrantScope, vaultGrants } from './grants'
import { vaultObjectKey, vaultPrefix } from './keys'
import { publishObject, reserveObject } from './objects'

// Receipt attachments on the vault (1B-T9): ports of AttachmentService (retain,
// replace, remove, grant, file, needsCopy) and of migration 0017's routines
// (gogospend_reserve_receipt_copy, gogospend_release_receipt_copy,
// gogospend_retain_attachment, gogospend_prune_attachments). The copy itself
// runs in the Worker (src/v1/files/receipts.ts) between two steps: prepare
// reserves the receipt key, the command publishes it. Every check of a step
// runs in one block (UserVault#call's), so no other request lands between the
// "receipt exists" and "copy in flight" checks (unlike 0017's two statements).

/** A copy's reservation lasts three minutes: the copy's one-minute deadline plus the command that publishes it (0017). */
export const RECEIPT_COPY_GRACE_MS = 180_000
/** An import image is copied only while it has more than this left before it is due (1B-T10's preview serves the same margin as `attachable_until`). */
export const SOURCE_MARGIN_MS = 2 * 60_000
/** At most this many copies in flight per vault, and this many reserved in a day (0017). */
const COPIES_IN_FLIGHT = 4
const COPIES_PER_DAY = 100
const DAY_MS = 86_400_000
/** A released receipt's row is dropped this long after its release, once its object is gone. */
export const RELEASED_ROW_MS = 30 * DAY_MS

const ENTITY = 'transaction'
const SCHEMA_VERSIONS: readonly number[] = [1]
const EXTENSIONS: Readonly<Record<AttachmentContentType, string>> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const CONTENT_TYPES: Readonly<Record<string, AttachmentContentType>> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

/** What a retain or replace needs before its command: nothing to copy, wait for another request's copy, or copy the import image to `key`. */
export type PreparedCopy =
  | { kind: 'none' }
  | { kind: 'wait' }
  | { kind: 'copy'; source_key: string; key: string; content_type: AttachmentContentType; bytes: number; sha256: string }

/** What the Worker's copy left at the reserved key, as its HEAD reported it. */
export type StoredCopy = { key: string; bytes: number; sha256: string }

/** The stored image a current grant names (AttachmentService's StoredAttachment). */
export type StoredReceiptFile = { key: string; bytes: number; sha256: string; contentType: AttachmentContentType; fileName: string }

/** A step body from the Worker's own receipt code: an object, or the call is refused before anything is written. */
function stepBody(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new Error('a receipt step body is an object')
  return body as Record<string, unknown>
}

/** AttachmentService.parse for retain and replace: the consent first, then the image's id. */
export function receiptChoice(input: Record<string, unknown>): string {
  if (input.consent !== RECEIPT_RETENTION_CONSENT) throw stateProblem(ATTACHMENT_MESSAGE_KEYS.consentRequired, 'consent')
  if (!isUuid(input.attachment_id)) throw new ContractValidationError('VALIDATION_FAILED', 'attachment_id must be a lower-case UUID.', 'attachment_id')
  return input.attachment_id
}

/** The prepared copy a command step carries (what the Worker's HEAD reported), or null when it copied nothing. */
function storedCopyOf(value: unknown): StoredCopy | null {
  if (value === null || value === undefined) return null
  const copy = stepBody(value)
  if (typeof copy.key !== 'string' || !Number.isSafeInteger(copy.bytes) || typeof copy.sha256 !== 'string') throw new Error('a prepared copy names its key, size and digest')
  return { key: copy.key, bytes: copy.bytes as number, sha256: copy.sha256 }
}

/** The prefix of every copy key of one receipt: receipt/<vault id>/<attachment id>/. */
const copyPrefix = (c: FileContext, attachmentId: string) => `${vaultPrefix('receipt', c.vaultId)}${attachmentId}/`

/** gogospend_release_receipt_copy: a copy reservation that will not be published is due now. A published key is untouched. */
export function releaseReceiptCopy(c: FileContext, key: string): void {
  const released = c.sql
    .exec("UPDATE vault_objects SET delete_after = min(delete_after, ?) WHERE key = ? AND purpose = 'receipt' AND status = 'reserved' RETURNING key", c.now.getTime(), key)
    .toArray()
  if (released.length > 0) touch(c)
}

/**
 * AttachmentService.needsCopy and gogospend_reserve_receipt_copy, in one block:
 * `none` for a resend of a committed command, a receipt that already exists
 * (retained or released), a record the command would refuse (not live, not at
 * the expected version, or not holding what the command needs), or nothing to
 * copy (no ready preview names the image, or its image is not published with
 * more than two minutes left); `wait` while another request's copy of the same
 * image is reserved and unexpired; 429 RATE_LIMITED at four copies in flight or
 * a hundred reserved in the last 24 hours, with the seconds until the oldest
 * leaves; otherwise a fresh receipt key is reserved for three minutes and the
 * Worker copies the import image there.
 */
export function prepareReceipt(c: VaultContext, input: { attachment_id: string; command_id: string; record?: { id: string; expected_version: number | undefined; needs: 'none' | 'other' } }): PreparedCopy {
  const attachmentId = input.attachment_id
  if (c.sql.exec('SELECT 1 FROM command_receipts WHERE command_id = ?', input.command_id).toArray().length > 0) return { kind: 'none' }
  if (c.sql.exec('SELECT 1 FROM attachments WHERE id = ?', attachmentId).toArray().length > 0) return { kind: 'none' }
  const record = input.record
  if (record) {
    const [current] = c.sql
      .exec<{ version: number; attachment_id: string | null }>(
        'SELECT t.version, ta.attachment_id FROM transactions t LEFT JOIN transaction_attachments ta ON ta.transaction_id = t.id WHERE t.id = ? AND t.deleted_at IS NULL',
        record.id,
      )
      .toArray()
    if (!current || current.version !== record.expected_version) return { kind: 'none' }
    if (record.needs === 'none' && current.attachment_id) return { kind: 'none' }
    if (record.needs === 'other' && !current.attachment_id) return { kind: 'none' }
  }
  const now = c.now.getTime()
  const [source] = c.sql
    .exec<{ key: string; bytes: string; sha256: string }>(
      `SELECT p.image_key AS key, CAST(o.bytes AS TEXT) AS bytes, o.sha256 FROM import_previews p JOIN vault_objects o ON o.key = p.image_key
        WHERE p.image_attachment_id = ? AND p.status = 'ready' AND o.purpose = 'import_image' AND o.status = 'published' AND o.delete_after > ?`,
      attachmentId,
      now + SOURCE_MARGIN_MS,
    )
    .toArray()
  if (!source) return { kind: 'none' }
  const prefix = copyPrefix(c, attachmentId)
  const pending = c.sql
    .exec("SELECT 1 FROM vault_objects WHERE purpose = 'receipt' AND status = 'reserved' AND delete_after > ? AND substr(key, 1, ?) = ?", now, prefix.length, prefix)
    .toArray()
  if (pending.length > 0) return { kind: 'wait' }
  const inFlight = c.sql
    .exec<{ oldest: number | null; n: number }>("SELECT min(delete_after) AS oldest, count(*) AS n FROM vault_objects WHERE purpose = 'receipt' AND status = 'reserved' AND delete_after > ?", now)
    .one()
  if (inFlight.n >= COPIES_IN_FLIGHT) throw new ProblemException(429, 'RATE_LIMITED', { retryAfterSeconds: Math.max(1, Math.ceil(((inFlight.oldest ?? now) - now) / 1000)) })
  const today = c.sql.exec<{ oldest: number | null; n: number }>("SELECT min(created_at) AS oldest, count(*) AS n FROM vault_objects WHERE purpose = 'receipt' AND created_at > ?", now - DAY_MS).one()
  if (today.n >= COPIES_PER_DAY) throw new ProblemException(429, 'RATE_LIMITED', { retryAfterSeconds: Math.max(1, Math.ceil(((today.oldest ?? now) + DAY_MS - now) / 1000)) })
  // An import image's key ends in image.jpg, image.png or image.webp (parse.ts); the copy keeps its extension.
  const ext = source.key.slice(source.key.lastIndexOf('.') + 1)
  const key = vaultObjectKey('receipt', c.vaultId, attachmentId, crypto.randomUUID(), `image.${ext}`)
  reserveObject(c, key, 'receipt', RECEIPT_COPY_GRACE_MS)
  return { kind: 'copy', source_key: source.key, key, content_type: CONTENT_TYPES[ext], bytes: Number(source.bytes), sha256: source.sha256 }
}

/**
 * gogospend_retain_attachment, inside the command's block: the receipt
 * `attachmentId` names, ready for a record to hold. An existing receipt is
 * ready while retained (a copy made for nothing is due at once) and 422
 * `removed` once released. Otherwise the image must be a preview's of this
 * vault (404 when none names it), and the prepared copy must be this receipt's
 * own reservation, unexpired and inside its own three minutes (even when a
 * failed delete moved its deadline on, the 1B-T4 follow-up), with the image's
 * extension, and the size and SHA-256 the HEAD reported must equal the import
 * image's registered ones; anything else is 422 `expired`, checked before
 * publishObject (which would throw). Then the copy is published with no expiry
 * and recorded as a retained receipt. 1B-T10's confirmation calls it too, for
 * the record an import's image row becomes.
 */
export function ready(c: VaultContext, attachmentId: string, copy: StoredCopy | null): void {
  const [existing] = c.sql.exec<{ status: string }>('SELECT status FROM attachments WHERE id = ?', attachmentId).toArray()
  if (existing) {
    if (copy) releaseReceiptCopy(c, copy.key)
    if (existing.status === 'retained') return
    throw stateProblem(ATTACHMENT_MESSAGE_KEYS.removed, 'attachment_id')
  }
  const [preview] = c.sql
    .exec<{ job_id: string; image_key: string; image_width: number; image_height: number }>(
      'SELECT job_id, image_key, image_width, image_height FROM import_previews WHERE image_attachment_id = ?',
      attachmentId,
    )
    .toArray()
  if (!preview) throw new ProblemException(404, 'NOT_FOUND')
  if (!copy) throw stateProblem(ATTACHMENT_MESSAGE_KEYS.expired, 'attachment_id')
  const now = c.now.getTime()
  const [reservation] = c.sql
    .exec<{ created_at: number }>("SELECT created_at FROM vault_objects WHERE key = ? AND purpose = 'receipt' AND status = 'reserved' AND delete_after > ?", copy.key, now)
    .toArray()
  const matches = c.sql
    .exec("SELECT 1 FROM vault_objects WHERE key = ? AND purpose = 'import_image' AND bytes = ? AND sha256 = ?", preview.image_key, copy.bytes, copy.sha256)
    .toArray()
  if (
    !reservation ||
    reservation.created_at + RECEIPT_COPY_GRACE_MS <= now ||
    !copy.key.startsWith(copyPrefix(c, attachmentId)) ||
    copy.key.slice(-4) !== preview.image_key.slice(-4) ||
    matches.length === 0
  ) {
    throw stateProblem(ATTACHMENT_MESSAGE_KEYS.expired, 'attachment_id')
  }
  const ext = copy.key.slice(copy.key.lastIndexOf('.') + 1)
  publishObject(c, copy.key, { bytes: copy.bytes, sha256: copy.sha256 }, null)
  c.sql.exec(
    "INSERT INTO attachments (id, source_job_id, status, object_key, content_type, bytes, sha256, width, height, retained_at) VALUES (?, ?, 'retained', ?, ?, ?, ?, ?, ?, ?)",
    attachmentId,
    preview.job_id,
    copy.key,
    CONTENT_TYPES[ext],
    copy.bytes,
    copy.sha256,
    preview.image_width,
    preview.image_height,
    c.now.toISOString(),
  )
  touch(c)
}

/** The record a receipt command acts on: 404, 410 ENTITY_PURGED and 409 ENTITY_DELETED from its head, then the version (If-Match). */
function liveRecord(c: VaultContext, id: string, expected: number | undefined): TransactionRow {
  requireLiveEntity(c, ENTITY, id)
  return expectVersion(transactionRow(c, id), expected, toDto)
}

/** The receipt a record holds now, or null. */
function heldBy(c: VaultContext, transactionId: string): string | null {
  const [row] = c.sql.exec<{ attachment_id: string }>('SELECT attachment_id FROM transaction_attachments WHERE transaction_id = ?', transactionId).toArray()
  return row?.attachment_id ?? null
}

/** The record's next version: its snapshot says which receipt it holds now. */
function nextVersion(c: VaultContext, id: string, audit: AuditMetadata): VaultMutation {
  const [row] = c.sql.exec<TransactionRow>(`UPDATE transactions SET version = version + 1, updated_at = ? WHERE id = ? RETURNING ${COLUMNS}`, c.now.toISOString(), id).toArray()
  return { entityId: id, version: row.version, changes: [{ entity: ENTITY, id, version: row.version, state: 'active', snapshot: toDto(row) }], audit }
}

/** `released` when the receipt a record let go of was released (no record holds it), `shared` otherwise. */
function stateOf(c: VaultContext, attachmentId: string): 'released' | 'shared' {
  const [row] = c.sql.exec<{ status: string }>('SELECT status FROM attachments WHERE id = ?', attachmentId).toArray()
  return row?.status === 'released' ? 'released' : 'shared'
}

/** The command a retain or replace step makes: its headers, the record's id, and the body the Worker built. */
function receiptCommand(c: VaultContext, call: VaultCall, kind: string) {
  const command = commandInput(call, kind, null, 'required')
  const transactionId = routeId(call.params.id ?? '')
  const body = stepBody(call.body)
  const attachmentId = receiptChoice(body)
  const copy = storedCopyOf(body.prepared)
  return { command, transactionId, attachmentId, copy, input: { ...command, payload: { id: transactionId, attachment_id: attachmentId, consent: RECEIPT_RETENTION_CONSENT } } }
}

/** POST /v1/transactions/:id/attachment's command step (AttachmentService.retain): the record, which must hold none, gains the receipt. */
export function retainReceipt(c: VaultContext, call: VaultCall): CommandAck {
  const { command, transactionId, attachmentId, copy, input } = receiptCommand(c, call, ATTACHMENT_RETAIN_KIND)
  return runCommand(c, input, () => {
    liveRecord(c, transactionId, command.expectedVersion)
    if (heldBy(c, transactionId)) throw stateProblem(ATTACHMENT_MESSAGE_KEYS.present, 'attachment_id')
    ready(c, attachmentId, copy)
    c.sql.exec('INSERT INTO transaction_attachments (transaction_id, attachment_id, attached_at) VALUES (?, ?, ?)', transactionId, attachmentId, c.now.toISOString())
    return nextVersion(c, transactionId, { consent: RECEIPT_RETENTION_CONSENT })
  })
}

/** PUT /v1/transactions/:id/attachment's command step (AttachmentService.replace): the record's receipt becomes this one; the old one is released once nothing holds it. */
export function replaceReceipt(c: VaultContext, call: VaultCall): CommandAck {
  const { command, transactionId, attachmentId, copy, input } = receiptCommand(c, call, ATTACHMENT_REPLACE_KIND)
  return runCommand(c, input, () => {
    liveRecord(c, transactionId, command.expectedVersion)
    const previous = heldBy(c, transactionId)
    if (!previous) throw stateProblem(ATTACHMENT_MESSAGE_KEYS.missing, 'attachment_id')
    if (previous === attachmentId) throw stateProblem(ATTACHMENT_MESSAGE_KEYS.unchanged, 'attachment_id')
    ready(c, attachmentId, copy)
    c.sql.exec('UPDATE transaction_attachments SET attachment_id = ?, attached_at = ? WHERE transaction_id = ?', attachmentId, c.now.toISOString(), transactionId)
    return nextVersion(c, transactionId, { consent: RECEIPT_RETENTION_CONSENT, previous: stateOf(c, previous) })
  })
}

/** DELETE /v1/transactions/:id/attachment (AttachmentService.remove): the record lets go of its receipt; its image is deleted once nothing holds it (no undo). */
export function removeReceipt(c: VaultContext, call: VaultCall): CommandAck {
  const command = commandInput(call, ATTACHMENT_REMOVE_KIND, null, 'required')
  const transactionId = routeId(call.params.id ?? '')
  return runCommand(c, { ...command, payload: { id: transactionId } }, () => {
    liveRecord(c, transactionId, command.expectedVersion)
    const [gone] = c.sql.exec<{ attachment_id: string }>('DELETE FROM transaction_attachments WHERE transaction_id = ? RETURNING attachment_id', transactionId).toArray()
    if (!gone) throw stateProblem(ATTACHMENT_MESSAGE_KEYS.missing, 'attachment_id')
    return nextVersion(c, transactionId, { previous: stateOf(c, gone.attachment_id) })
  })
}

type HeldRow = { object_key: string; content_type: AttachmentContentType; bytes: string; sha256: string }

/** AttachmentService.held: the receipt, while retained and held by at least one of the vault's live records. */
function held(c: VaultContext, attachmentId: string): StoredReceiptFile | null {
  const [row] = c.sql
    .exec<HeldRow>(
      `SELECT a.object_key, a.content_type, CAST(a.bytes AS TEXT) AS bytes, a.sha256 FROM attachments a
        WHERE a.id = ? AND a.status = 'retained'
          AND EXISTS (SELECT 1 FROM transaction_attachments ta JOIN transactions t ON t.id = ta.transaction_id WHERE ta.attachment_id = a.id AND t.deleted_at IS NULL)`,
      attachmentId,
    )
    .toArray()
  return row ? { key: row.object_key, bytes: Number(row.bytes), sha256: row.sha256, contentType: row.content_type, fileName: `receipt.${EXTENSIONS[row.content_type]}` } : null
}

/** A receipt grant's MAC context: the account and the session that asked (1B-T4's receiptGrantScope). */
const grantScope = (c: VaultContext) => receiptGrantScope(c.claims)

/** GET /v1/attachments/:id/grant (AttachmentService.grant): a five-minute download path for a receipt one of the vault's live records holds; null otherwise. */
export function receiptGrant(c: VaultContext, id: string): AttachmentGrant | null {
  if (!isUuid(id)) return null
  const file = held(c, id)
  if (!file) return null
  const { grant, expiresAt } = vaultGrants(c, 'attachment').issue(grantScope(c), { snapshotId: id, index: 0 }, c.now)
  return { url: `${ATTACHMENT_DOWNLOAD_PATH}${grant}`, expires_at: expiresAt.toISOString(), content_type: file.contentType, bytes: file.bytes, sha256: file.sha256 }
}

/** The `attachments.file` step (AttachmentService.file): the stored image a current grant of this session names, if a live record still holds it. */
export function receiptFile(c: VaultContext, grant: string): StoredReceiptFile | null {
  const target = vaultGrants(c, 'attachment').verify(grantScope(c), grant, c.now)
  if (!target || target.index !== 0) return null
  return held(c, target.snapshotId)
}

/** The receipt work a prepare step names: its image, its command, and the record the command will act on. */
export function prepareInput(body: unknown): Parameters<typeof prepareReceipt>[1] {
  const input = stepBody(body)
  const record = input.record === undefined ? undefined : stepBody(input.record)
  if (!isUuid(input.attachment_id) || !isUuid(input.command_id)) throw new Error('a prepare step names its image and command')
  if (record && (!isUuid(record.id) || (record.needs !== 'none' && record.needs !== 'other') || !(record.expected_version === undefined || Number.isSafeInteger(record.expected_version)))) {
    throw new Error('a prepare step names its record as the command reads it')
  }
  return {
    attachment_id: input.attachment_id,
    command_id: input.command_id,
    ...(record ? { record: { id: record.id as string, expected_version: record.expected_version as number | undefined, needs: record.needs as 'none' | 'other' } } : {}),
  }
}

/** A command's schema the receipt commands support (AttachmentService's SCHEMA_VERSIONS), so the Worker copies nothing for any other. */
export function supportsReceiptSchema(schemaVersion: number): boolean {
  return SCHEMA_VERSIONS.includes(schemaVersion)
}

const UNHELD = "status = 'retained' AND NOT EXISTS (SELECT 1 FROM transaction_attachments ta WHERE ta.attachment_id = attachments.id)"
/** A released receipt whose object is gone from the registry's live states. */
const OBJECT_GONE = "NOT EXISTS (SELECT 1 FROM vault_objects o WHERE o.key = attachments.object_key AND o.status IN ('reserved', 'published'))"

/**
 * gogospend_prune_attachments on the vault clock, in short blocks of its own:
 * a retained receipt no record holds (the safety net) is released; every
 * released receipt without a stamp (the B20 trigger cannot read the vault
 * clock) gets released_at now and its object due (a no-op for one the trigger
 * already made due; a tombstone keeps its own deadline); and a released
 * receipt's row is dropped 30 days after its release, once its object is gone.
 * Each rule acts at its own due time (inclusive), so attachmentsDueAt moves
 * past it (ruling R37). Set-based statements, no id lists (ruling R57). The
 * safety net reads every retained receipt here, so the receipts waiting in
 * attachment_checks have all been checked, and the table is emptied in the
 * same block (alarm-hardening).
 */
export function pruneAttachments(c: FileContext): void {
  c.storage.transactionSync(() => {
    const unheld = c.sql.exec(`UPDATE attachments SET status = 'released' WHERE ${UNHELD} RETURNING id`).toArray()
    const due = c.sql
      .exec("UPDATE vault_objects SET delete_after = 0 WHERE status <> 'tombstone' AND key IN (SELECT object_key FROM attachments WHERE status = 'released' AND released_at IS NULL) RETURNING key")
      .toArray()
    const stamped = c.sql.exec("UPDATE attachments SET released_at = ? WHERE status = 'released' AND released_at IS NULL RETURNING id", c.now.toISOString()).toArray()
    c.sql.exec('DELETE FROM attachment_checks').toArray()
    if (unheld.length + due.length + stamped.length > 0) touch(c)
  })
  c.storage.transactionSync(() => {
    const dropped = c.sql
      .exec(`DELETE FROM attachments WHERE status = 'released' AND released_at <= ? AND ${OBJECT_GONE} RETURNING id`, new Date(c.now.getTime() - RELEASED_ROW_MS).toISOString())
      .toArray()
    if (dropped.length > 0) touch(c)
  })
}

/**
 * When pruneAttachments next has work: now while a receipt waits for its stamp or has lost its holders, else the
 * earliest release whose object is gone plus 30 days; null when none (ruling R37). It runs after every write
 * (1B-T11's rearm), so it reads no receipt it need not (alarm-hardening): the stamp through attachments_released_idx,
 * and the safety net only among attachment_checks, the receipts whose holders changed since pruneAttachments last
 * checked them all (0004's triggers keep it), read from that table first.
 */
export function attachmentsDueAt(c: FileContext): number | null {
  const { waiting, oldest } = c.sql
    .exec<{ waiting: number; oldest: string | null }>(
      `SELECT EXISTS (SELECT 1 FROM attachments WHERE status = 'released' AND released_at IS NULL)
           OR EXISTS (SELECT 1 FROM attachment_checks k CROSS JOIN attachments ON attachments.id = k.attachment_id WHERE ${UNHELD}) AS waiting,
              (SELECT min(released_at) FROM attachments WHERE status = 'released' AND released_at IS NOT NULL AND ${OBJECT_GONE}) AS oldest`,
    )
    .one()
  if (waiting) return c.now.getTime()
  return oldest === null ? null : Date.parse(oldest) + RELEASED_ROW_MS
}
