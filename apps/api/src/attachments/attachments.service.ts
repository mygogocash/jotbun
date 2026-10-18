import { randomUUID } from 'node:crypto';

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
import { ATTACHMENT_LIMITS } from './attachment-limits';
import type { AttachmentLimits } from './attachment-limits';

export const ATTACHMENT_RETAIN_KIND = 'attachment.retain';
export const ATTACHMENT_REPLACE_KIND = 'attachment.replace';
export const ATTACHMENT_REMOVE_KIND = 'attachment.remove';
/** Injection token: grant keys derived for receipts (distinct from snapshot and export grant keys). */
export const ATTACHMENT_GRANTS = Symbol('ATTACHMENT_GRANTS');

/** The record entity: retain, replace and remove acknowledge the record's next version. */
const ENTITY = 'transaction';
const SCHEMA_VERSIONS: readonly number[] = [1];
/** Told to a caller turned away because this process is busy (nothing was reserved). */
const BUSY_RETRY_SECONDS = 5;
/** How often a request waiting on another's copy of the same image looks again. */
const WAIT_POLL_MS = 75;
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

type ReserveRow = {
  outcome: 'reserved' | 'existing' | 'pending' | 'limited' | 'unavailable';
  copy_key: string | null;
  source_key: string | null;
  content_type: AttachmentContentType | null;
  bytes: string | null;
  sha256: string | null;
  retry_after: number | null;
};
type HeldRow = { object_key: string; content_type: AttachmentContentType; bytes: string; sha256: string };
/** What a retain asks of the record it names: `none` (it must hold no receipt) or `other` (it must hold one that is not this). */
type RecordNeed = 'none' | 'other';
export type PrepareRecord = { id: string; expectedVersion: number | undefined; needs?: RecordNeed };

/**
 * P2c receipts, owner side. Retain, replace and remove are M1 commands on the
 * record (account lock, session and policy re-check, receipt replay, schema
 * check, change group and audit in one transaction), versioned against the
 * record's current version and moving it to its next version, whose snapshot
 * carries `attachment_id` while it holds a receipt. Retain and replace need
 * the user's explicit consent (recorded as an audit code).
 *
 * Retaining copies the preview's sanitized import image inside the object
 * store (a server-side copy: no image bytes pass through this process),
 * registry first: the copy's `receipt` key is registered (committed) before
 * the copy, then published with no expiry inside the command once the copy as
 * stored (HEAD) matches the import image's registered size and digest. A copy
 * the command did not use is due at once; one never published is swept at its
 * deadline either way. Work is bounded: a refused command copies nothing, one
 * image is copied once however many requests ask for it at once, a process
 * runs a few copies at a time (a busy one answers 503 before reserving), an
 * account has a few in flight and a daily budget, and the whole copy shares
 * one deadline.
 * Releasing (the trigger in 0017: removal, replacement, the record's purge or
 * erasure) happens when no record holds the receipt any more.
 *
 * Grants are S1's opaque HMAC grants under receipt-only keys, bound to the
 * account and to the session (binding and generation) that asked: five
 * minutes, for a retained receipt that one of the caller's active records
 * holds - re-checked again at download.
 */
@Injectable()
export class AttachmentService {
  /** Copies running in this process (the semaphore the limits' `copiesPerProcess` bounds). */
  private slots = 0;

  constructor(
    private readonly db: DatabaseService,
    private readonly executor: CommandExecutor,
    registry: CommandRegistry,
    // Defines the `transaction` entity these commands report, so it is constructed first.
    readonly transactions: TransactionsService,
    @Inject(OBJECT_STORE) private readonly store: ObjectStore,
    @Inject(ATTACHMENT_GRANTS) private readonly grants: SnapshotGrants,
    @Inject(ATTACHMENT_LIMITS) private readonly limits: AttachmentLimits,
  ) {
    for (const kind of [ATTACHMENT_RETAIN_KIND, ATTACHMENT_REPLACE_KIND, ATTACHMENT_REMOVE_KIND]) {
      registry.defineCommand({ kind, entity: ENTITY, outcome: 'updated', schemaVersions: [...SCHEMA_VERSIONS], policy: 'current' });
    }
  }

  /** The record (which must hold none) gains the receipt `attachment_id` names. */
  retain(ctx: SessionContext, input: CommandInput<AttachmentCommand>): Promise<CommandAck> {
    const { transactionId, attachmentId } = this.parse(input, ATTACHMENT_RETAIN_KIND);
    return this.withReceipt(ctx, attachmentId as string, input, { id: transactionId, expectedVersion: input.expectedVersion, needs: 'none' }, (prepared) =>
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
    return this.withReceipt(ctx, attachmentId as string, input, { id: transactionId, expectedVersion: input.expectedVersion, needs: 'other' }, (prepared) =>
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
    const { grant, expiresAt } = this.grants.issue(grantScope(ctx), { snapshotId: attachmentId, index: 0 }, now);
    return { url: `${ATTACHMENT_DOWNLOAD_PATH}${grant}`, expires_at: expiresAt.toISOString(), content_type: held.contentType, bytes: held.bytes, sha256: held.sha256 };
  }

  /** The stored image a current grant names, if a record of the caller's still holds it (checked again now). */
  async file(ctx: SessionContext, grant: string, now: Date = new Date()): Promise<StoredAttachment | null> {
    const target = this.grants.verify(grantScope(ctx), grant, now);
    if (!target || target.index !== 0) return null;
    return this.held(ctx, target.snapshotId);
  }

  /**
   * Before a command that will hold `attachmentId` (retain, replace, and P3's
   * confirmation of an image row): copies the preview's import image to this
   * account's newly registered receipt key unless the receipt exists already
   * or the command would be refused anyway. Decided first, in one short
   * transaction and before anything is copied: a resend of a committed
   * command, a receipt that already exists, and - when `record` is given - a
   * record that is not the caller's, not live, not at that version, or does
   * not hold what the command needs (`needs`). The command then refuses it
   * under its lock, having copied nothing. Then, at most a few copies run in
   * this process (503 + `retry_after` before reserving when it is busy), an
   * account has a few in flight and a daily budget (429 + the time the oldest
   * leaves), and another request already copying the same image is waited for
   * rather than copied again. Must run outside any transaction (the
   * reservation commits before the copy). Pair it with `release` once the
   * command has finished, whatever its outcome.
   */
  async prepare(ctx: SessionContext, attachmentId: string, commandId: string, record?: PrepareRecord): Promise<PreparedReceipt> {
    const none: PreparedReceipt = { kind: 'none', attachmentId };
    if (!(await this.needsCopy(ctx, attachmentId, commandId, record))) return none;
    const deadline = Date.now() + this.limits.copyDeadlineMs;
    for (;;) {
      if (!this.acquire()) throw new ProblemException(503, 'SERVICE_UNAVAILABLE', { retryAfterSeconds: BUSY_RETRY_SECONDS });
      let result: PreparedReceipt | 'wait';
      try {
        result = await this.reserveAndCopy(ctx, attachmentId);
      } finally {
        this.slots -= 1;
      }
      if (result !== 'wait') return result;
      // Another request is copying this image: look again shortly (it may have made the receipt by then).
      if (Date.now() >= deadline) throw new ProblemException(503, 'SERVICE_UNAVAILABLE', { retryAfterSeconds: BUSY_RETRY_SECONDS });
      await new Promise<void>((resolve) => setTimeout(resolve, WAIT_POLL_MS));
    }
  }

  /** One reservation attempt and, if it was made, its copy; `wait` when another request is copying the same image. */
  private async reserveAndCopy(ctx: SessionContext, attachmentId: string): Promise<PreparedReceipt | 'wait'> {
    const reservation = await this.db.withOwnerTransaction(ctx, async (tx) => {
      const [row] = await tx.query<ReserveRow>('SELECT * FROM gogospend_reserve_receipt_copy($1, $2)', [attachmentId, randomUUID()]);
      return row ?? null;
    });
    if (reservation?.outcome === 'limited') throw new ProblemException(429, 'RATE_LIMITED', { retryAfterSeconds: Math.max(1, reservation.retry_after ?? 60) });
    if (reservation?.outcome === 'pending') return 'wait';
    if (reservation?.outcome !== 'reserved' || !reservation.copy_key || !reservation.source_key || !reservation.content_type || reservation.bytes === null || !reservation.sha256) {
      return { kind: 'none', attachmentId };
    }
    const reserved = { key: reservation.copy_key, source: reservation.source_key, contentType: reservation.content_type, bytes: Number(reservation.bytes), sha256: reservation.sha256 };
    const given = { kind: 'copied', attachmentId, ...reserved } as const;
    let stored: { bytes: number; sha256: string } | null;
    try {
      stored = await this.copy(reserved);
    } catch {
      await this.release(ctx, given).catch(() => undefined);
      throw new ProblemException(503, 'SERVICE_UNAVAILABLE', { retryAfterSeconds: BUSY_RETRY_SECONDS });
    }
    if (!stored) {
      await this.release(ctx, given).catch(() => undefined);
      return { kind: 'none', attachmentId };
    }
    // What the store reports for the copy goes to the database, which compares it with the import image's registration.
    return { kind: 'copied', attachmentId, key: reserved.key, bytes: stored.bytes, sha256: stored.sha256 };
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
    input: CommandInput<AttachmentCommand>,
    record: PrepareRecord,
    run: (prepared: PreparedReceipt) => Promise<CommandAck>,
  ): Promise<CommandAck> {
    // The executor refuses an unsupported schema; nothing is copied for it.
    const prepared = SCHEMA_VERSIONS.includes(input.schemaVersion) ? await this.prepare(ctx, attachmentId, input.commandId, record) : ({ kind: 'none', attachmentId } as const);
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

  /**
   * Copies the import image to the reserved key inside the store, then reads
   * what is stored there, both under one deadline. Null when the import image
   * is gone. The database, not this code, decides whether the stored copy is
   * the registered image.
   */
  private async copy(copy: { key: string; source: string }): Promise<{ bytes: number; sha256: string } | null> {
    const signal = AbortSignal.timeout(this.limits.copyDeadlineMs);
    if (!(await this.store.copy(copy.source, copy.key, { signal }))) return null;
    const stored = await this.store.head(copy.key, { signal });
    return stored ? { bytes: stored.bytes, sha256: stored.sha256 } : null;
  }

  private acquire(): boolean {
    if (this.slots >= this.limits.copiesPerProcess) return false;
    this.slots += 1;
    return true;
  }

  /**
   * The checks of the command that decide it needs no copy, made before one:
   * false for a resend of a committed command, for a receipt that already
   * exists, and for a named record the command would refuse.
   */
  private needsCopy(ctx: SessionContext, attachmentId: string, commandId: string, record: PrepareRecord | undefined): Promise<boolean> {
    return this.db.withOwnerTransaction(ctx, async (tx) => {
      const [resend] = await tx.query<{ found: number }>('SELECT 1 AS found FROM command_receipts WHERE command_id = $1', [commandId]);
      if (resend) return false;
      const [exists] = await tx.query<{ found: number }>('SELECT 1 AS found FROM attachments WHERE id = $1', [attachmentId]);
      if (exists) return false;
      if (!record) return true;
      const [current] = await tx.query<{ version: number; attachment_id: string | null }>(
        `SELECT t.version, ta.attachment_id FROM transactions t
           LEFT JOIN transaction_attachments ta ON ta.account_id = t.account_id AND ta.transaction_id = t.id
          WHERE t.id = $1 AND t.deleted_at IS NULL`,
        [record.id],
      );
      if (!current || current.version !== record.expectedVersion) return false;
      if (record.needs === 'none' && current.attachment_id) return false;
      // Replacing with the receipt it already holds was settled above: that receipt exists.
      if (record.needs === 'other' && !current.attachment_id) return false;
      return true;
    });
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

/** The MAC context of a receipt grant: the account and the session (binding and generation) it was issued to. */
const grantScope = (ctx: SessionContext): string => `${ctx.accountId}\u0000${ctx.bindingId}\u0000${ctx.sessionGeneration}`;
