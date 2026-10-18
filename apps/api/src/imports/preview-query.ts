import { Injectable } from '@nestjs/common';
import type { ImportCandidate, ImportDuplicateAdvice, ImportField, ImportIssue, ImportLayout, ImportPreview, ImportPreviewStatus, SessionContext } from '@gogospend/contracts';

import { DatabaseService } from '../database/database.service';
import type { OwnerTx } from '../database/owner-transaction';

type HeadRow = {
  job_id: string;
  upload_status: string;
  job_status: string | null;
  failure: string | null;
  status: 'ready' | 'rejected' | 'expired' | null;
  layout: ImportLayout | null;
  issues: unknown;
  candidate_count: number | null;
  review_required_count: number | null;
  expense: string | null;
  income: string | null;
  transfer: string | null;
  image_width: number | null;
  image_height: number | null;
  review_revision: string | null;
  expires_at: Date | null;
};
type CandidateRow = Omit<ImportCandidate, 'ordinal'> & { ordinal: number; issues: { field: ImportField | null; code: string }[] };
type AdviceRow = { source_row_id: string; kind: ImportDuplicateAdvice['kind']; matches: string[] };

// Job error codes that mean the quarantined file could not be read.
const UNAVAILABLE = new Set(['quarantine_corrupt', 'quarantine_missing', 'storage_unavailable', 'import_unavailable']);

/** The client-visible state of an import that has no recorded preview. */
function pendingStatus(head: HeadRow): ImportPreviewStatus {
  if (head.upload_status === 'expired') return 'expired';
  switch (head.job_status) {
    case 'queued':
      return 'queued';
    case 'leased':
      return 'parsing';
    case 'failed':
    case 'succeeded':
      return 'failed';
    default:
      return 'cancelled';
  }
}

/**
 * The owner's import as a reviewable preview, read in one owner snapshot
 * (row-level security: another account's import is simply not found).
 * Duplicate advice is computed here, as the owner, so the worker never needs
 * to read financial records; it never changes or hides a candidate.
 */
@Injectable()
export class PreviewQuery {
  constructor(private readonly db: DatabaseService) {}

  find(ctx: SessionContext, jobId: string): Promise<ImportPreview | null> {
    return this.db.withOwnerTransaction(ctx, (tx) => this.read(tx, jobId), { snapshot: true });
  }

  private async read(tx: OwnerTx, jobId: string): Promise<ImportPreview | null> {
    const [head] = await tx.query<HeadRow>(
      `SELECT u.job_id, u.status AS upload_status, gogospend_import_job_status(u.job_id) AS job_status, gogospend_import_parse_failure(u.job_id) AS failure,
              p.status, p.layout, p.issues, p.candidate_count, p.review_required_count,
              p.expense_total_minor::text AS expense, p.income_total_minor::text AS income, p.transfer_total_minor::text AS transfer,
              p.image_width, p.image_height, p.review_revision::text AS review_revision, p.expires_at
         FROM import_uploads u
         LEFT JOIN import_previews p ON p.job_id = u.job_id
        WHERE u.job_id = $1 AND u.accepted_at IS NOT NULL`,
      [jobId],
    );
    if (!head) return null;
    if (head.status === null) {
      const status = pendingStatus(head);
      const issues: ImportIssue[] =
        status === 'failed' ? [{ code: head.failure && UNAVAILABLE.has(head.failure) ? 'quarantine_unavailable' : 'parse_failed', source_row_id: null, field: null }] : [];
      return { job_id: head.job_id, status, candidates: [], issues, duplicate_advice: [], review_revision: null, expires_at: null, summary: null };
    }

    const rows = await tx.query<CandidateRow>(
      `SELECT source_row_id, ordinal, to_char(occurred_on, 'YYYY-MM-DD') AS occurred_on, type, amount_minor::text AS amount_minor,
              wallet_label, category_label, merchant, note, review_required, issues
         FROM import_candidates WHERE job_id = $1 ORDER BY ordinal`,
      [jobId],
    );
    const candidates: ImportCandidate[] = rows.map(({ issues: _issues, ...candidate }) => candidate);
    const issues: ImportIssue[] = [];
    if (head.status !== 'expired') {
      for (const code of head.issues as string[]) issues.push({ code, source_row_id: null, field: null });
    }
    for (const row of rows) for (const issue of row.issues) issues.push({ code: issue.code, source_row_id: row.source_row_id, field: issue.field });

    // At most 5 matches are named per row.
    const advice = await tx.query<AdviceRow>(
      `SELECT source_row_id, kind, matches FROM (
         SELECT c.source_row_id, c.ordinal, 'existing_transaction' AS kind, (array_agg(t.id::text ORDER BY t.id))[1:5] AS matches
           FROM import_candidates c
           JOIN transactions t ON t.account_id = c.account_id AND t.occurred_on = c.occurred_on AND t.type = c.type
                              AND t.amount_minor = c.amount_minor AND t.deleted_at IS NULL
          WHERE c.job_id = $1
          GROUP BY c.source_row_id, c.ordinal
         UNION ALL
         SELECT c.source_row_id, c.ordinal, 'same_file', (array_agg(d.source_row_id ORDER BY d.ordinal))[1:5]
           FROM import_candidates c
           JOIN import_candidates d ON d.job_id = c.job_id AND d.source_row_id <> c.source_row_id
                                   AND d.occurred_on = c.occurred_on AND d.type = c.type AND d.amount_minor = c.amount_minor
                                   AND d.wallet_label IS NOT DISTINCT FROM c.wallet_label AND d.merchant IS NOT DISTINCT FROM c.merchant
                                   AND d.note IS NOT DISTINCT FROM c.note
          WHERE c.job_id = $1
          GROUP BY c.source_row_id, c.ordinal
       ) advice ORDER BY ordinal, kind`,
      [jobId],
    );

    return {
      job_id: head.job_id,
      status: head.status,
      candidates,
      issues,
      duplicate_advice: advice.map((row) => ({ source_row_id: row.source_row_id, kind: row.kind, matches: row.matches })),
      review_revision: head.review_revision,
      expires_at: head.expires_at ? head.expires_at.toISOString() : null,
      summary: {
        layout: head.layout,
        candidate_count: head.candidate_count ?? 0,
        review_required_count: head.review_required_count ?? 0,
        totals: { expense_minor: head.expense ?? '0', income_minor: head.income ?? '0', transfer_minor: head.transfer ?? '0' },
        image: head.image_width !== null && head.image_height !== null ? { width: head.image_width, height: head.image_height } : null,
      },
    };
  }
}
