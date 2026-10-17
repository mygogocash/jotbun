import { Inject, Injectable } from '@nestjs/common';
import { ContractValidationError, EXPORT_DOWNLOAD_PATH, exportFileName, isExportFilter, isExportRequestSnapshot, isUuid } from '@gogospend/contracts';
import type { CommandAck, CommandInput, ExportDto, ExportFilter, ExportGrant, ExportRequestSnapshot, SessionContext } from '@gogospend/contracts';

import { authorizePurpose } from '../auth/reauthentication.service';
import { CommandExecutor } from '../commands/command-executor';
import { CommandRegistry } from '../commands/command-registry';
import { derivedUuid } from '../commands/derived-id';
import { DatabaseService } from '../database/database.service';
import type { OwnerTx } from '../database/owner-transaction';
import { parseHistoryRequest } from '../history/history-query';
import { SnapshotGrants } from '../sync/snapshot-grants';

export const EXPORT_ENTITY = 'export';
export const EXPORT_REQUEST_KIND = 'export.request';
/** Injection token: grant keys derived for exports (distinct from snapshot grant keys). */
export const EXPORT_GRANTS = Symbol('EXPORT_GRANTS');
// The P1 queue's attempt budget, and a bounded runtime per attempt.
const EXPORT_MAX_ATTEMPTS = 3;
const EXPORT_MAX_RUNTIME_SECONDS = 900;

export type StoredExportFile = { key: string; bytes: number; sha256: string; fileName: string };

/** The export period, with exactly the history filter's date validation. */
export function parseExportFilter(input: Record<string, unknown>): ExportFilter {
  const { filter } = parseHistoryRequest({ from: input.from, through: input.through });
  return { from: filter.from, through: filter.through };
}

type ExportRow = {
  export_id: string;
  from_date: string;
  through_date: string;
  requested_at: Date;
  ready_at: Date | null;
  expires_at: Date | null;
  bytes: string | null;
  sha256: string | null;
  row_count: number | null;
  high_water: string | null;
  current: boolean;
};

/**
 * P4 export, owner side. `request` is an M1 command (account lock, session
 * re-check, receipt replay, schema check, change group and audit in one
 * transaction) that consumes a fresh `export` proof bound to its command id,
 * then queues one export job through P1's app routine and records the request.
 * It is policy-exempt, so a pending policy acceptance never blocks it. Status,
 * grants and downloads see only the caller's own exports at the account's
 * current lifecycle generation, and only while the account is active; grants
 * are S1's opaque, account-bound HMAC grants under export-only keys, valid for
 * five minutes and never past the file's expiry.
 */
@Injectable()
export class ExportService {
  constructor(
    private readonly db: DatabaseService,
    private readonly executor: CommandExecutor,
    registry: CommandRegistry,
    @Inject(EXPORT_GRANTS) private readonly grants: SnapshotGrants,
  ) {
    registry.defineEntity({ entity: EXPORT_ENTITY, validate: isExportRequestSnapshot });
    registry.defineCommand({ kind: EXPORT_REQUEST_KIND, entity: EXPORT_ENTITY, outcome: 'accepted', schemaVersions: [1], policy: 'exempt' });
  }

  /** Queues one owned export of `input.payload`'s period; a retry of the same command returns the same acknowledgement. */
  request(ctx: SessionContext, proofId: string, input: CommandInput<ExportFilter>): Promise<CommandAck> {
    if (input.kind !== EXPORT_REQUEST_KIND) throw new Error(`export requests use ${EXPORT_REQUEST_KIND}`);
    if (!isExportFilter(input.payload)) throw new ContractValidationError('VALIDATION_FAILED', 'An export needs a period from 1970.', 'from');
    // The export (job and entity) id follows from the account and command, so a
    // retried command names the same export and no other account's job id.
    const id = derivedUuid(ctx.accountId, 'export-request', input.commandId);
    const snapshot: ExportRequestSnapshot = { id, from: input.payload.from, through: input.payload.through };
    return this.executor.run(ctx, { ...input, payload: snapshot }, async (tx) => {
      await authorizePurpose(tx, ctx, proofId, input.commandId, 'export');
      const [queued] = await tx.query<{ queued: boolean }>('SELECT gogospend_enqueue_account_job($1, $2, $3::jsonb, $4, $5) AS queued', [
        id,
        'export',
        JSON.stringify({ from: snapshot.from, through: snapshot.through }),
        EXPORT_MAX_ATTEMPTS,
        EXPORT_MAX_RUNTIME_SECONDS,
      ]);
      if (!queued?.queued) throw new Error('An export job with this id already exists.');
      await tx.query(
        `INSERT INTO exports (export_id, account_id, lifecycle_generation, from_date, through_date)
         SELECT $1, a.id, a.lifecycle_generation, $2::date, $3::date FROM accounts a WHERE a.id = $4`,
        [id, snapshot.from, snapshot.through, tx.accountId],
      );
      return { entityId: id, version: 1, changes: [{ entity: EXPORT_ENTITY, id, version: 1, state: 'active', snapshot }] };
    });
  }

  /** The caller's export, or null (unknown and foreign ids alike). */
  async status(ctx: SessionContext, exportId: string, now: Date = new Date()): Promise<ExportDto | null> {
    if (!isUuid(exportId)) return null;
    return this.db.withOwnerTransaction(ctx, (tx) => this.statusIn(tx, exportId, now), { snapshot: true });
  }

  /** A five-minute download grant for the caller's own ready, unexpired export; null otherwise. */
  async grant(ctx: SessionContext, exportId: string, now: Date = new Date()): Promise<ExportGrant | null> {
    const dto = await this.status(ctx, exportId, now);
    if (dto?.status !== 'ready') return null;
    const { grant, expiresAt } = this.grants.issue(ctx.accountId, { snapshotId: exportId, index: 0 }, now, new Date(dto.expires_at));
    return { url: `${EXPORT_DOWNLOAD_PATH}${grant}`, expires_at: expiresAt.toISOString() };
  }

  /** The stored file a current grant names, if it is the caller's, ready, unexpired and the account is active at its generation. */
  async file(ctx: SessionContext, grant: string, now: Date = new Date()): Promise<StoredExportFile | null> {
    const target = this.grants.verify(ctx.accountId, grant, now);
    if (!target || target.index !== 0) return null;
    return this.db.withOwnerTransaction(
      ctx,
      async (tx) => {
        const [row] = await tx.query<{ object_key: string; bytes: string; sha256: string; from_date: string; through_date: string }>(
          `SELECT e.object_key, e.bytes::text AS bytes, encode(e.sha256, 'hex') AS sha256,
                  to_char(e.from_date, 'YYYY-MM-DD') AS from_date, to_char(e.through_date, 'YYYY-MM-DD') AS through_date
             FROM exports e
             JOIN accounts a ON a.id = e.account_id AND a.status = 'active' AND a.lifecycle_generation = e.lifecycle_generation
            WHERE e.export_id = $1 AND e.ready_at IS NOT NULL AND e.expires_at > $2`,
          [target.snapshotId, now],
        );
        return row ? { key: row.object_key, bytes: Number(row.bytes), sha256: row.sha256, fileName: exportFileName({ from: row.from_date, through: row.through_date }) } : null;
      },
      { snapshot: true },
    );
  }

  private async statusIn(tx: OwnerTx, exportId: string, now: Date): Promise<ExportDto | null> {
    const [row] = await tx.query<ExportRow>(
      `SELECT e.export_id, to_char(e.from_date, 'YYYY-MM-DD') AS from_date, to_char(e.through_date, 'YYYY-MM-DD') AS through_date,
              e.requested_at, e.ready_at, e.expires_at, e.bytes::text AS bytes, encode(e.sha256, 'hex') AS sha256, e.row_count,
              e.high_water::text AS high_water, (a.status = 'active' AND a.lifecycle_generation = e.lifecycle_generation) AS current
         FROM exports e JOIN accounts a ON a.id = e.account_id
        WHERE e.export_id = $1`,
      [exportId],
    );
    if (!row) return null;
    const base = { export_id: row.export_id, from: row.from_date, through: row.through_date, requested_at: row.requested_at.toISOString() };
    // An earlier lifecycle generation's export, or an account that is no longer active, is never served.
    if (!row.current) return { ...base, status: 'expired' };
    if (row.ready_at && row.expires_at && row.bytes !== null && row.sha256 !== null && row.row_count !== null && row.high_water !== null) {
      if (row.expires_at.getTime() <= now.getTime()) return { ...base, status: 'expired' };
      return { ...base, status: 'ready', as_of_revision: row.high_water, row_count: row.row_count, bytes: Number(row.bytes), sha256: row.sha256, expires_at: row.expires_at.toISOString() };
    }
    const [job] = await tx.query<{ status: string | null }>('SELECT gogospend_export_job_status($1) AS status', [exportId]);
    return { ...base, status: job?.status === 'queued' || job?.status === 'leased' ? 'pending' : 'failed' };
  }
}
