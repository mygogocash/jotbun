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
  image_attachment_id: string | null;
  attachable_until: Date | null;
  review_revision: string | null;
  expires_at: Date | null;
};
type CandidateRow = Omit<ImportCandidate, 'ordinal'> & { ordinal: number; issues: { field: ImportField | null; code: string }[] };
export type PreviewPaging = { offset: number; limit: number };
type AdviceRow = { source_row_id: string; kind: ImportDuplicateAdvice['kind']; matches: string[] };

/**
 * Duplicate advice for one import ($1: its job id), at most 5 matches per row
 * and kind. Same-file matches use a window over the duplicate key (linear in
 * the file); existing-record matches use a LATERAL lookup through
 * transactions_duplicate_advice_idx (at most 5 ids per candidate). Rows with
 * a null date, type or amount are excluded — they cannot be duplicates.
 */
function duplicateAdviceSql(paged: boolean): string {
  // A page names advice for its own rows only: $2 and $3 are its first and last ordinal.
  const existingScope = paged ? '\n            AND c.ordinal BETWEEN $2 AND $3' : '';
  const sameScope = paged ? ' AND ordinal BETWEEN $2 AND $3' : '';
  return `SELECT source_row_id, kind, matches FROM (
         SELECT c.source_row_id, c.ordinal, 'existing_transaction' AS kind, x.matches
           FROM import_candidates c
           CROSS JOIN LATERAL (
             SELECT array_agg(t.id::text ORDER BY t.id) AS matches
               FROM (
                 SELECT t.id FROM transactions t
                  WHERE t.account_id = c.account_id AND t.occurred_on = c.occurred_on AND t.type = c.type
                    AND t.amount_minor = c.amount_minor AND t.deleted_at IS NULL
                  ORDER BY t.id
                  LIMIT 5
               ) t
           ) x
          WHERE c.job_id = $1
            AND c.occurred_on IS NOT NULL AND c.type IS NOT NULL AND c.amount_minor IS NOT NULL
            AND x.matches IS NOT NULL${existingScope}
         UNION ALL
         SELECT source_row_id, ordinal, 'same_file', matches
           FROM (
             SELECT c.source_row_id, c.ordinal,
                    (array_remove(
                       array_agg(c.source_row_id) OVER (
                         PARTITION BY c.occurred_on, c.type, c.amount_minor, c.wallet_label, c.merchant, c.note
                         ORDER BY c.ordinal
                         ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
                       ),
                       c.source_row_id
                     ))[1:5] AS matches
               FROM import_candidates c
              WHERE c.job_id = $1
                AND c.occurred_on IS NOT NULL AND c.type IS NOT NULL AND c.amount_minor IS NOT NULL
           ) same
          WHERE cardinality(matches) > 0${sameScope}
       ) advice ORDER BY ordinal, kind`;
}

export const DUPLICATE_ADVICE_SQL = duplicateAdviceSql(false);
const DUPLICATE_ADVICE_PAGE_SQL = duplicateAdviceSql(true);

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

  /** `paging` null is the whole preview; otherwise only the candidates of that page (see `ImportPreview.page`). */
  find(ctx: SessionContext, jobId: string, paging: PreviewPaging | null = null): Promise<ImportPreview | null> {
    return this.db.withOwnerTransaction(ctx, (tx) => this.read(tx, jobId, paging), { snapshot: true });
  }

  private async read(tx: OwnerTx, jobId: string, paging: PreviewPaging | null): Promise<ImportPreview | null> {
    const [head] = await tx.query<HeadRow>(
      `SELECT u.job_id, u.status AS upload_status, gogospend_import_job_status(u.job_id) AS job_status, gogospend_import_parse_failure(u.job_id) AS failure,
              p.status, p.layout, p.issues, p.candidate_count, p.review_required_count,
              p.expense_total_minor::text AS expense, p.income_total_minor::text AS income, p.transfer_total_minor::text AS transfer,
              p.image_width, p.image_height, p.image_attachment_id, gogospend_import_image_attachable_until(p.job_id) AS attachable_until,
              p.review_revision::text AS review_revision, p.expires_at
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

    // M4: past expires_at the route never serves ready rows, even if the
    // single expiry job was superseded or failed and retention has not run yet.
    const pastExpiry = head.expires_at !== null && head.expires_at.getTime() <= Date.now();
    const expired = head.status === 'expired' || pastExpiry;
    const summary: ImportPreview['summary'] = {
      layout: head.layout,
      candidate_count: head.candidate_count ?? 0,
      review_required_count: head.review_required_count ?? 0,
      totals: { expense_minor: head.expense ?? '0', income_minor: head.income ?? '0', transfer_minor: head.transfer ?? '0' },
      // P2c: the image's opaque attachment id (never its object key) and until when it can be retained.
      image:
        head.image_width !== null && head.image_height !== null && head.image_attachment_id !== null
          ? { width: head.image_width, height: head.image_height, attachment_id: head.image_attachment_id, attachable_until: head.attachable_until ? head.attachable_until.toISOString() : null }
          : null,
    };
    if (expired) {
      return {
        job_id: head.job_id,
        status: 'expired',
        candidates: [],
        issues: [],
        duplicate_advice: [],
        review_revision: head.review_revision,
        expires_at: head.expires_at ? head.expires_at.toISOString() : null,
        summary,
      };
    }

    const columns = `source_row_id, ordinal, to_char(occurred_on, 'YYYY-MM-DD') AS occurred_on, type, amount_minor::text AS amount_minor,
              wallet_label, category_label, merchant, note, review_required, issues`;
    const issues: ImportIssue[] = [];
    for (const code of head.issues as string[]) issues.push({ code, source_row_id: null, field: null });

    if (paging === null) {
      const rows = await tx.query<CandidateRow>(`SELECT ${columns} FROM import_candidates WHERE job_id = $1 ORDER BY ordinal`, [jobId]);
      const candidates: ImportCandidate[] = rows.map(({ issues: _issues, ...candidate }) => candidate);
      for (const row of rows) for (const issue of row.issues) issues.push({ code: issue.code, source_row_id: row.source_row_id, field: issue.field });

      // At most 5 matches are named per row.
      const advice = await tx.query<AdviceRow>(DUPLICATE_ADVICE_SQL, [jobId]);
      return {
        job_id: head.job_id,
        status: head.status,
        candidates,
        issues,
        duplicate_advice: advice.map((row) => ({ source_row_id: row.source_row_id, kind: row.kind, matches: row.matches })),
        review_revision: head.review_revision,
        expires_at: head.expires_at ? head.expires_at.toISOString() : null,
        summary,
      };
    }

    // A page: candidates only. Row issues stay whole-file (a reviewer needs
    // every problem, not just the visible ones), so they come from their own
    // narrow read; advice covers the page's rows.
    const rows = await tx.query<CandidateRow>(`SELECT ${columns} FROM import_candidates WHERE job_id = $1 ORDER BY ordinal LIMIT $2 OFFSET $3`, [jobId, paging.limit, paging.offset]);
    const candidates: ImportCandidate[] = rows.map(({ issues: _issues, ...candidate }) => candidate);
    const flagged = await tx.query<Pick<CandidateRow, 'source_row_id' | 'issues'>>(
      'SELECT source_row_id, issues FROM import_candidates WHERE job_id = $1 AND jsonb_array_length(issues) > 0 ORDER BY ordinal',
      [jobId],
    );
    for (const row of flagged) for (const issue of row.issues) issues.push({ code: issue.code, source_row_id: row.source_row_id, field: issue.field });
    const advice = rows.length === 0 ? [] : await tx.query<AdviceRow>(DUPLICATE_ADVICE_PAGE_SQL, [jobId, rows[0].ordinal, rows[rows.length - 1].ordinal]);
    const total = summary.candidate_count;
    const end = paging.offset + rows.length;
    return {
      job_id: head.job_id,
      status: head.status,
      candidates,
      issues,
      duplicate_advice: advice.map((row) => ({ source_row_id: row.source_row_id, kind: row.kind, matches: row.matches })),
      review_revision: head.review_revision,
      expires_at: head.expires_at ? head.expires_at.toISOString() : null,
      summary,
      page: { offset: paging.offset, limit: paging.limit, total, next_offset: rows.length > 0 && end < total ? end : null },
    };
  }
}
