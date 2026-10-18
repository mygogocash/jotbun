import { createHash, randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { ATTACHMENT_DOWNLOAD_PATH, ATTACHMENT_MESSAGE_KEYS, ContractValidationError, RECEIPT_RETENTION_CONSENT, isUuid } from '@gogospend/contracts';
import type { AttachmentCommand, AttachmentContentType, AttachmentGrant, CommandAck, CommandInput, SessionContext } from '@gogospend/contracts';

import { CommandExecutor } from '../commands/command-executor';
import type { AuditMetadata, MutationResult } from '../commands/command-executor';
import { CommandRegistry } from '../commands/command-registry';
import { entityHead } from '../commands/entity-state';
import { expectVersion, routeId, stateProblem } from '../commands/versioned-entity';
import { ProblemException } from '../common/api-problem.filter';
import { DatabaseService } from '../database/database.service';
import type { OwnerTx } from '../database/owner-transaction';
import type { ObjectStore } from '../storage/object-store';
import { OBJECT_STORE } from '../storage/storage.module';
import { SnapshotGrants } from '../sync/snapshot-grants';
import { RECORD_COLUMNS, toDto } from '../transactions/transactions.repository';
import type { RecordRow } from '../transactions/transactions.repository';
import { TransactionsService } from '../transactions/transactions.service';

export const ATTACHMENT_RETAIN_KIND = 'attachment.retain';
export const ATTACHMENT_REPLACE_KIND = 'attachment.replace';
export const ATTACHMENT_REMOVE_KIND = 'attachment.remove';
/** Injection token: grant keys derived for receipts (distinct from snapshot and export grant keys). */
export const ATTACHMENT_GRANTS = Symbol('ATTACHMENT_GRANTS');

/** The record entity: retain, replace and remove acknowledge the record's next version. */
const ENTITY = 'transaction';
/** A copy that takes longer than this is abandoned (its reservation is due well before the sweep's deadline). */
const COPY_TIMEOUT_MS = 60_000;
const EXTENSIONS: Readonly<Record<AttachmentContentType, string>> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export type StoredAttachment = { key: string; bytes: number; sha256: string; contentType: AttachmentContentType; fileName: string };

/**
 * What a retain needs before its command runs. `copied`: the import image
 * was copied to this account's own registered receipt key (not published
 * yet); `none`: nothing was copied - the receipt already exists, the command
 * is a resend, or there is nothing (left) to copy - and the command decides.
 */
export type PreparedReceipt =
  | { kind: 'copied'; attachmentId: string; key: string; bytes: number; sha256: string }
  | { kind: 'none'; attachmentId: string };

type ReserveRow = { outcome: 'reserved' | 'existing' | 'limited' | 'unavailable'; copy_key: string | null; source_key: string | null; content_type: AttachmentContentType | null; bytes: string | null; sha256: string | null };
type HeldRow = { object_key: string; content_type: AttachmentContentType; bytes: string; sha256: string };

class CopyMismatch extends Error {}

/**
 * P2c receipts, owner side. Retain, replace and remove are M1 commands on the
 * record (account lock, session and policy re-check, receipt replay, schema
 * check, change group and audit in one transaction), versioned against the
 * record's current version and moving it to its next version, whose snapshot
 * carries `attachment_id` while it holds a receipt. Retain and replace need
 * the user's explicit consent (recorded as an audit code).
 *
 * Retaining copies the preview's sanitized import image, registry first: the
 * copy's `receipt` key is registered (committed) before the PUT, then
 * published with no expiry inside the command once it matches the import
 * image's registered size and digest. A copy the command did not use is due
 * at once; one never published is swept at its deadline either way.
 * Releasing (the trigger in 0017: removal, replacement, the record's purge or
 * erasure) happens when no record holds the receipt any more.
 *
 * Grants are S1's opaque, account-bound HMAC grants under receipt-only keys:
 * five minutes, for a retained receipt that one of the caller's active records
 * holds - re-checked again at download.
 */
@Injectable()
export class AttachmentService {
  constructor(
    private readonly db: DatabaseService,
    private readonly executor: CommandExecutor,
    registry: CommandRegistry,
    // Defines the `transaction` entity these commands report, so it is constructed first.
    readonly transactions: TransactionsService,
    @Inject(OBJECT_STORE) private readonly store: ObjectStore,
    @Inject(ATTACHMENT_GRANTS) private readonly grants: SnapshotGrants,
  ) {
    for (const kind of [ATTACHMENT_RETAIN_KIND, ATTACHMENT_REPLACE_KIND, ATTACHMENT_REMOVE_KIND]) {
      registry.defineCommand({ kind, entity: ENTITY, outcome: 'updated', schemaVersions: [1], policy: 'current' });
    }
  }

  /** The record (which must hold none) gains the receipt `attachment_id` names. */
  retain(ctx: SessionContext, input: CommandInput<AttachmentCommand>): Promise<CommandAck> {
    const { transactionId, attachmentId } = this.parse(input, ATTACHMENT_RETAIN_KIND);
    return this.withReceipt(ctx, attachmentId as string, input.commandId, { id: transactionId, expectedVersion: input.expectedVersion }, (prepared) =>
      this.executor.run(ctx, { ...input, payload: { id: transactionId, attachment_id: attachmentId, consent: RECEIPT_RETENTION_CONSENT } }, async (tx) => {
        const row = await this.liveRecord(tx, transactionId, input.expectedVersion);
        if (row.attachment_id) throw stateProblem(ATTACHMENT_MESSAGE_KEYS.present, 'attachment_id');
        await this.attachIn(tx, prepared, transactionId);
        return this.nextVersion(tx, transactionId, { consent: RECEIPT_RETENTION_CONSENT });
      }),
    );
  }

  /** The record's receipt becomes the one `attachment_id` names; the old one is released once nothing holds it. */
  replace(ctx: SessionContext, input: CommandInput<AttachmentCommand>): Promise<CommandAck> {
    const { transactionId, attachmentId } = this.parse(input, ATTACHMENT_REPLACE_KIND);
    return this.withReceipt(ctx, attachmentId as string, input.commandId, { id: transactionId, expectedVersion: input.expectedVersion }, (prepared) =>
      this.executor.run(ctx, { ...input, payload: { id: transactionId, attachment_id: attachmentId, consent: RECEIPT_RETENTION_CONSENT } }, async (tx) => {
        const row = await this.liveRecord(tx, transactionId, input.expectedVersion);
        const previous = row.attachment_id;
        if (!previous) throw stateProblem(ATTACHMENT_MESSAGE_KEYS.missing, 'attachment_id');
        if (previous === attachmentId) throw stateProblem(ATTACHMENT_MESSAGE_KEYS.unchanged, 'attachment_id');
        await this.ready(tx, prepared);
        await tx.query('UPDATE transaction_attachments SET attachment_id = $2, attached_at = now() WHERE transaction_id = $1', [transactionId, attachmentId]);
        return this.nextVersion(tx, transactionId, { consent: RECEIPT_RETENTION_CONSENT, previous: await this.stateOf(tx, previous) });
      }),
    );
  }

  /** The record lets go of its receipt; the image is deleted once nothing holds it (no undo). */
  remove(ctx: SessionContext, input: CommandInput<AttachmentCommand>): Promise<CommandAck> {
    const { transactionId } = this.parse(input, ATTACHMENT_REMOVE_KIND);
    return this.executor.run(ctx, { ...input, payload: { id: transactionId } }, async (tx) => {
      await this.liveRecord(tx, transactionId, input.expectedVersion);
      const [gone] = await tx.query<{ attachment_id: string }>('DELETE FROM transaction_attachments WHERE transaction_id = $1 RETURNING attachment_id', [transactionId]);
      if (!gone) throw stateProblem(ATTACHMENT_MESSAGE_KEYS.missing, 'attachment_id');
      return this.nextVersion(tx, transactionId, { previous: await this.stateOf(tx, gone.attachment_id) });
    });
  }

  /** A five-minute download grant for a retained receipt one of the caller's active records holds; null otherwise. */
  async grant(ctx: SessionContext, attachmentId: string, now: Date = new Date()): Promise<AttachmentGrant | null> {
    if (!isUuid(attachmentId)) return null;
    const held = await this.held(ctx, attachmentId);
    if (!held) return null;
    const { grant, expiresAt } = this.grants.issue(ctx.accountId, { snapshotId: attachmentId, index: 0 }, now);
    return { url: `${ATTACHMENT_DOWNLOAD_PATH}${grant}`, expires_at: expiresAt.toISOString(), content_type: held.contentType, bytes: held.bytes, sha256: held.sha256 };
  }

  /** The stored image a current grant names, if a record of the caller's still holds it (checked again now). */
  async file(ctx: SessionContext, grant: string, now: Date = new Date()): Promise<StoredAttachment | null> {
    const target = this.grants.verify(ctx.accountId, grant, now);
    if (!target || target.index !== 0) return null;
    return this.held(ctx, target.snapshotId);
  }

  /**
   * Before a command that will hold `attachmentId` (retain, replace, and P3's
   * confirmation of an image row): copies the preview's import image to this
   * account's newly registered receipt key unless the receipt exists already
   * or the command is a resend. `record` (an existing record the command
   * names) skips the copy when that record is not the caller's, not live or
   * not at that version - the command then refuses it, under its lock. Must
   * run outside any transaction (the reservation commits before the PUT).
   * Pair it with `release` once the command has finished, whatever its
   * outcome.
   */
  async prepare(ctx: SessionContext, attachmentId: string, commandId: string, record?: { id: string; expectedVersion: number | undefined }): Promise<PreparedReceipt> {
    const reservation = await this.db.withOwnerTransaction(ctx, async (tx) => {
      // A resend of a committed command replays without copying anything.
      const [resend] = await tx.query<{ found: number }>('SELECT 1 AS found FROM command_receipts WHERE command_id = $1', [commandId]);
      if (resend) return null;
      if (record) {
        const [current] = await tx.query<{ version: number }>('SELECT version FROM transactions WHERE id = $1 AND deleted_at IS NULL', [record.id]);
        if (!current || current.version !== record.expectedVersion) return null;
      }
      const [row] = await tx.query<ReserveRow>('SELECT * FROM gogospend_reserve_receipt_copy($1, $2)', [attachmentId, randomUUID()]);
      return row ?? null;
    });
    if (reservation?.outcome === 'limited') throw new ProblemException(429, 'RATE_LIMITED', { retryAfterSeconds: 60 });
    if (reservation?.outcome !== 'reserved' || !reservation.copy_key || !reservation.source_key || !reservation.content_type || reservation.bytes === null || !reservation.sha256) {
      return { kind: 'none', attachmentId };
    }
    const copy = { key: reservation.copy_key, source: reservation.source_key, contentType: reservation.content_type, bytes: Number(reservation.bytes), sha256: reservation.sha256 };
    try {
      if (await this.copy(copy)) return { kind: 'copied', attachmentId, key: copy.key, bytes: copy.bytes, sha256: copy.sha256 };
    } catch (error) {
      await this.release(ctx, { kind: 'copied', attachmentId, ...copy }).catch(() => undefined);
      if (error instanceof CopyMismatch) return { kind: 'none', attachmentId };
      throw new ProblemException(503, 'SERVICE_UNAVAILABLE', { retryAfterSeconds: 5 });
    }
    await this.release(ctx, { kind: 'copied', attachmentId, ...copy }).catch(() => undefined);
    return { kind: 'none', attachmentId };
  }

  /** A copy its command did not publish is due now (a published one is untouched). */
  async release(ctx: SessionContext, prepared: PreparedReceipt): Promise<void> {
    if (prepared.kind !== 'copied') return;
    await this.db.withOwnerTransaction(ctx, (tx) => tx.query('SELECT gogospend_release_receipt_copy($1)', [prepared.key]));
  }

  /**
   * Inside an M1 command, under the account lock: the record `transactionId`
   * (locked, live, at the expected version, holding no receipt) comes to hold
   * the prepared receipt. 404 for nothing of the owner's; 422 when the image
   * is past its window or the receipt was removed.
   */
  async attachIn(tx: OwnerTx, prepared: PreparedReceipt, transactionId: string): Promise<void> {
    await this.ready(tx, prepared);
    await tx.query('INSERT INTO transaction_attachments (account_id, transaction_id, attachment_id) VALUES ($1, $2, $3)', [tx.accountId, transactionId, prepared.attachmentId]);
  }

  private async withReceipt(
    ctx: SessionContext,
    attachmentId: string,
    commandId: string,
    record: { id: string; expectedVersion: number | undefined },
    run: (prepared: PreparedReceipt) => Promise<CommandAck>,
  ): Promise<CommandAck> {
    const prepared = await this.prepare(ctx, attachmentId, commandId, record);
    try {
      return await run(prepared);
    } finally {
      await this.release(ctx, prepared).catch(() => undefined);
    }
  }

  /** The receipt exists and is retained (recorded now from the prepared copy if it is new). */
  private async ready(tx: OwnerTx, prepared: PreparedReceipt): Promise<void> {
    const copied = prepared.kind === 'copied' ? prepared : null;
    const [result] = await tx.query<{ outcome: string }>("SELECT gogospend_retain_attachment($1, $2, $3, decode($4, 'hex')) AS outcome", [
      prepared.attachmentId,
      copied?.key ?? null,
      copied?.bytes ?? null,
      copied?.sha256 ?? null,
    ]);
    switch (result?.outcome) {
      case 'retained':
        return;
      case 'released':
        throw stateProblem(ATTACHMENT_MESSAGE_KEYS.removed, 'attachment_id');
      case 'expired':
        throw stateProblem(ATTACHMENT_MESSAGE_KEYS.expired, 'attachment_id');
      default:
        // Unknown and another account's ids alike.
        throw new ProblemException(404, 'NOT_FOUND');
    }
  }

  /** Copies the import image to the reserved key, checking size and digest on the way in and as stored. */
  private async copy(copy: { key: string; source: string; contentType: AttachmentContentType; bytes: number; sha256: string }): Promise<boolean> {
    const source = await this.store.getStream(copy.source);
    if (!source || source.bytes !== copy.bytes || (source.sha256 !== '' && source.sha256 !== copy.sha256)) return false;
    const written = await this.store.putStream(copy.key, verified(source.body, copy.bytes, copy.sha256), { contentType: copy.contentType, signal: AbortSignal.timeout(COPY_TIMEOUT_MS) });
    if (written.bytes !== copy.bytes || written.sha256 !== copy.sha256) return false;
    const stored = await this.store.head(copy.key);
    return stored !== null && stored.bytes === copy.bytes && stored.sha256 === copy.sha256;
  }

  private parse(input: CommandInput<AttachmentCommand>, kind: string): { transactionId: string; attachmentId: string | null } {
    if (input.kind !== kind) throw new Error(`this command uses ${kind}`);
    const payload = input.payload ?? ({} as AttachmentCommand);
    const transactionId = routeId(payload.transaction_id);
    if (kind === ATTACHMENT_REMOVE_KIND) {
      if (payload.attachment_id !== undefined || payload.consent !== undefined) throw new ContractValidationError('UNKNOWN_FIELD', 'A removal names only the record.', 'attachment_id');
      return { transactionId, attachmentId: null };
    }
    if (payload.consent !== RECEIPT_RETENTION_CONSENT) throw stateProblem(ATTACHMENT_MESSAGE_KEYS.consentRequired, 'consent');
    if (!isUuid(payload.attachment_id)) throw new ContractValidationError('VALIDATION_FAILED', 'attachment_id must be a lower-case UUID.', 'attachment_id');
    return { transactionId, attachmentId: payload.attachment_id };
  }

  /** The record FOR UPDATE: 404 when this owner has none, 410 once purged, 409 while deleted, then the version check. */
  private async liveRecord(tx: OwnerTx, id: string, expected: number | undefined): Promise<RecordRow> {
    const [row] = await tx.query<RecordRow>(`SELECT ${RECORD_COLUMNS} FROM transactions WHERE id = $1 FOR UPDATE`, [id]);
    if (!row) {
      if ((await entityHead(tx, ENTITY, id))?.state === 'purged') throw new ProblemException(410, 'ENTITY_PURGED');
      throw new ProblemException(404, 'NOT_FOUND');
    }
    if (row.deleted_at) throw new ProblemException(409, 'ENTITY_DELETED');
    return expectVersion(row, expected, async (current) => toDto(current));
  }

  /** The record's next version (its snapshot now says which receipt it holds). */
  private async nextVersion(tx: OwnerTx, id: string, audit: AuditMetadata): Promise<MutationResult> {
    const [row] = await tx.query<RecordRow>(`UPDATE transactions SET version = version + 1, updated_at = now() WHERE id = $1 RETURNING ${RECORD_COLUMNS}`, [id]);
    return { entityId: id, version: row.version, changes: [{ entity: ENTITY, id, version: row.version, state: 'active', snapshot: toDto(row) }], audit };
  }

  /** `released` when the receipt a record let go of was released (no record holds it), `shared` otherwise. */
  private async stateOf(tx: OwnerTx, attachmentId: string): Promise<'released' | 'shared'> {
    const [row] = await tx.query<{ status: string }>('SELECT status FROM attachments WHERE id = $1', [attachmentId]);
    return row?.status === 'released' ? 'released' : 'shared';
  }

  /** The caller's retained receipt, if one of its active records holds it and the account is active. */
  private held(ctx: SessionContext, attachmentId: string): Promise<StoredAttachment | null> {
    return this.db.withOwnerTransaction(
      ctx,
      async (tx) => {
        const [row] = await tx.query<HeldRow>(
          `SELECT a.object_key, a.content_type, a.bytes::text AS bytes, encode(a.sha256, 'hex') AS sha256
             FROM attachments a
             JOIN accounts acc ON acc.id = a.account_id AND acc.status = 'active'
            WHERE a.id = $1 AND a.status = 'retained'
              AND EXISTS (SELECT 1 FROM transaction_attachments ta
                            JOIN transactions t ON t.account_id = ta.account_id AND t.id = ta.transaction_id
                           WHERE ta.account_id = a.account_id AND ta.attachment_id = a.id AND t.deleted_at IS NULL)`,
          [attachmentId],
        );
        return row
          ? { key: row.object_key, bytes: Number(row.bytes), sha256: row.sha256, contentType: row.content_type, fileName: `receipt.${EXTENSIONS[row.content_type]}` }
          : null;
      },
      { snapshot: true },
    );
  }
}

/** Passes the source through, failing the copy if its size or digest is not what the registry recorded. */
async function* verified(body: AsyncIterable<Uint8Array>, bytes: number, sha256: string): AsyncIterable<Uint8Array> {
  const hash = createHash('sha256');
  let seen = 0;
  for await (const chunk of body) {
    seen += chunk.byteLength;
    if (seen > bytes) throw new CopyMismatch('the import image is larger than registered');
    hash.update(chunk);
    yield chunk;
  }
  if (seen !== bytes || hash.digest('hex') !== sha256) throw new CopyMismatch('the import image does not match its registration');
}
