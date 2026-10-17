import { Injectable } from '@nestjs/common';
import type { ImportFormat, ImportJobDto, ImportLimit, ImportStatus, SessionContext } from '@gogospend/contracts';

import { assertActiveSession } from '../accounts/active-session';
import { assertPolicyAccepted } from '../auth/application-session.guard';
import { DatabaseService } from '../database/database.service';
import { lockAccount } from '../database/owner-transaction';
import type { OwnerTx } from '../database/owner-transaction';
import { PolicyService } from '../policies/policy.service';

/** Why an upload ended without acceptance (stored on its row; never user text). */
export type IntakeOutcomeCode =
  | 'too_large'
  | 'empty'
  | 'unsupported_type'
  | 'unsupported_heic'
  | 'type_mismatch'
  | 'limit_bytes'
  | 'limit_parse_jobs'
  | 'upload_incomplete'
  | 'storage_unavailable'
  | 'reservation_refused'
  | 'deadline_passed'
  | 'account_changed'
  | 'session_ended'
  | 'intake_error';

export type BeginInput = { jobId: string; intakeToken: string; fileName: string; declaredType: string; declaredBytes: number | null };
export type StoredUpload = { dto: ImportJobDto; fileName: string | null; declaredType: string };
export type BeginResult =
  | { kind: 'started' }
  | { kind: 'replay'; upload: StoredUpload }
  | { kind: 'in_progress'; retryAfterSeconds: number }
  | { kind: 'ended'; status: 'rejected' | 'failed'; code: string }
  | { kind: 'limited'; limit: ImportLimit; retryAfterSeconds: number };

export type QuarantinePart = { index: number; key: string; bytes: number; sha256: string };
export type FinishInput = { jobId: string; intakeToken: string; format: ImportFormat; bytes: number; sha256: string; parts: readonly QuarantinePart[] };
export type FinishResult =
  | { kind: 'accepted'; dto: ImportJobDto }
  | { kind: 'limited'; limit: ImportLimit; retryAfterSeconds: number }
  | { kind: 'refused'; code: IntakeOutcomeCode };

/** The intake's database port (ImportRepository; a fake in unit tests). */
export interface ImportIntakeRepository {
  begin(ctx: SessionContext, input: BeginInput): Promise<BeginResult>;
  reservePart(ctx: SessionContext, jobId: string, intakeToken: string, index: number): Promise<string | null>;
  finish(ctx: SessionContext, input: FinishInput): Promise<FinishResult>;
  /** Ends a receiving upload; returns the keys of its unpublished parts, now `deleting`. */
  abort(ctx: SessionContext, jobId: string, intakeToken: string, status: 'rejected' | 'failed', code: IntakeOutcomeCode): Promise<string[]>;
  /** Confirms parts whose storage delete succeeded (otherwise the sweep retries them). */
  discarded?(ctx: SessionContext, jobId: string, intakeToken: string, keys: readonly string[]): Promise<void>;
}

const LIMITS: Record<string, ImportLimit> = { limit_uploads: 'uploads', limit_bytes: 'bytes', limit_parse_jobs: 'parse_jobs' };
const REFUSALS: readonly IntakeOutcomeCode[] = ['deadline_passed', 'account_changed'];

type Outcome = { outcome: string; code: string | null; retry_after_seconds: number | null };
type UploadRow = {
  job_id: string;
  status: string;
  format: ImportFormat;
  file_name: string | null;
  declared_type: string;
  bytes: string;
  accepted_at: Date;
  expires_at: Date;
  job_status: string | null;
};

/** The client-visible state of an accepted import: expired, or its parse job's state. */
function importStatus(row: UploadRow): ImportStatus {
  if (row.status === 'expired') return 'expired';
  switch (row.job_status) {
    case 'queued':
      return 'queued';
    case 'leased':
      return 'parsing';
    case 'succeeded':
      return 'parsed';
    case 'cancelled':
    case null:
      return 'cancelled';
    default:
      return 'failed';
  }
}

function toDto(row: UploadRow): ImportJobDto {
  return {
    job_id: row.job_id,
    status: importStatus(row),
    format: row.format,
    file_name: row.file_name,
    bytes: Number(row.bytes),
    received_at: row.accepted_at.toISOString(),
    expires_at: row.expires_at.toISOString(),
  };
}

/**
 * The owner's side of import intake, in owner transactions through the 0011
 * routines. `begin` and `finish` take the common account lock and re-check
 * that the account is active, this session is still valid and the current
 * policies are accepted, so an upload that waited behind a logout or
 * deletion records nothing.
 */
@Injectable()
export class ImportRepository implements ImportIntakeRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly policies: PolicyService,
  ) {}

  begin(ctx: SessionContext, input: BeginInput): Promise<BeginResult> {
    return this.db.withOwnerTransaction(ctx, async (tx) => {
      await this.underLock(tx, ctx);
      const [row] = await tx.query<Outcome>(
        'SELECT outcome, code, retry_after_seconds FROM gogospend_begin_import_upload($1, $2, $3, $4, $5)',
        [input.jobId, input.intakeToken, input.fileName, input.declaredType, input.declaredBytes],
      );
      switch (row?.outcome) {
        case 'started':
          return { kind: 'started' };
        case 'replay': {
          const stored = await this.stored(tx, input.jobId);
          if (!stored) throw new Error('a replayed upload has no accepted row');
          return { kind: 'replay', upload: { dto: toDto(stored), fileName: stored.file_name, declaredType: stored.declared_type } };
        }
        case 'in_progress':
          return { kind: 'in_progress', retryAfterSeconds: row.retry_after_seconds ?? 1 };
        case 'rejected':
        case 'failed':
          return { kind: 'ended', status: row.outcome, code: row.code ?? 'intake_error' };
        case 'limited':
          return { kind: 'limited', limit: LIMITS[row.code ?? ''] ?? 'uploads', retryAfterSeconds: row.retry_after_seconds ?? 1 };
        default:
          throw new Error('unknown upload start outcome');
      }
    });
  }

  reservePart(ctx: SessionContext, jobId: string, intakeToken: string, index: number): Promise<string | null> {
    return this.db.withOwnerTransaction(ctx, async (tx) => {
      const [row] = await tx.query<{ key: string | null }>('SELECT gogospend_reserve_import_part($1, $2, $3) AS key', [jobId, intakeToken, index]);
      return row?.key ?? null;
    });
  }

  finish(ctx: SessionContext, input: FinishInput): Promise<FinishResult> {
    const parts = input.parts.map((part) => ({ key: part.key, bytes: part.bytes, sha256: part.sha256 }));
    return this.db.withOwnerTransaction(ctx, async (tx) => {
      await this.underLock(tx, ctx);
      const [row] = await tx.query<Outcome>(
        `SELECT outcome, code, retry_after_seconds FROM gogospend_finish_import_upload($1, $2, $3, $4, decode($5, 'hex'), $6::jsonb)`,
        [input.jobId, input.intakeToken, input.format, input.bytes, input.sha256, JSON.stringify(parts)],
      );
      switch (row?.outcome) {
        case 'accepted': {
          const stored = await this.stored(tx, input.jobId);
          if (!stored) throw new Error('an accepted upload has no row');
          return { kind: 'accepted', dto: toDto(stored) };
        }
        case 'limited':
          return { kind: 'limited', limit: LIMITS[row.code ?? ''] ?? 'bytes', retryAfterSeconds: row.retry_after_seconds ?? 1 };
        case 'refused': {
          const code = REFUSALS.find((refusal) => refusal === row.code) ?? 'deadline_passed';
          return { kind: 'refused', code };
        }
        default:
          throw new Error('unknown upload finish outcome');
      }
    });
  }

  abort(ctx: SessionContext, jobId: string, intakeToken: string, status: 'rejected' | 'failed', code: IntakeOutcomeCode): Promise<string[]> {
    return this.db.withOwnerTransaction(ctx, async (tx) => {
      const rows = await tx.query<{ key: string }>('SELECT key FROM gogospend_abort_import_upload($1, $2, $3, $4) AS key', [jobId, intakeToken, status, code]);
      return rows.map((row) => row.key);
    });
  }

  async discarded(ctx: SessionContext, jobId: string, intakeToken: string, keys: readonly string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.db.withOwnerTransaction(ctx, (tx) => tx.query('SELECT gogospend_discard_import_parts($1, $2, $3)', [jobId, intakeToken, [...keys]]));
  }

  /** The caller's own accepted import, or null (unknown, another account's, or never accepted). */
  async find(ctx: SessionContext, jobId: string): Promise<ImportJobDto | null> {
    const row = await this.db.withOwnerTransaction(ctx, (tx) => this.stored(tx, jobId), { snapshot: true });
    return row ? toDto(row) : null;
  }

  private async underLock(tx: OwnerTx, ctx: SessionContext): Promise<void> {
    const state = await lockAccount(tx, ctx.accountId);
    await assertActiveSession(tx, ctx, state);
    assertPolicyAccepted(await this.policies.stateIn(tx));
  }

  private async stored(tx: OwnerTx, jobId: string): Promise<UploadRow | null> {
    // Row-level security limits this to the caller's own rows.
    const [row] = await tx.query<UploadRow>(
      `SELECT u.job_id, u.status, u.format, u.file_name, u.declared_type, u.bytes::text AS bytes, u.accepted_at, u.expires_at,
              gogospend_import_job_status(u.job_id) AS job_status
         FROM import_uploads u
        WHERE u.job_id = $1 AND u.accepted_at IS NOT NULL`,
      [jobId],
    );
    return row ?? null;
  }
}
