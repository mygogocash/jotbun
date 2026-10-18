import { EXPORT_CSV_COLUMNS, EXPORT_TTL_HOURS } from '@gogospend/contracts';
import type { ExportCsvColumn } from '@gogospend/contracts';
import type { Pool } from 'pg';

import type { LeasedAccountRead, LeasedExportRow } from '../database/leased-account-read';
import type { JobRepository } from '../jobs/job.repository';
import type { JobLease } from '../jobs/job-types';
import type { ObjectPublicationService } from '../storage/object-publication.service';
import type { ObjectStore } from '../storage/object-store';
import { CsvTooLarge, CsvWriter, MAX_EXPORT_BYTES, csvLiteral, csvNumber, csvText, minorToDecimal } from './csv-writer';
import type { CsvBody } from './csv-writer';

export type ExportDeps = { reader: LeasedAccountRead; jobs: JobRepository; store: ObjectStore; publication: ObjectPublicationService };

export type ExportHandlerOptions = {
  /** Records read per leased page. */
  pageSize?: number;
  /** The CSV's byte limit (an export above it fails as `export_too_large`). */
  maxBytes?: number;
  /** Test hook: runs inside the read transaction after each page. */
  afterPage?: (index: number) => Promise<void>;
  /** Test hook: runs after the file is stored, before publication. */
  afterUpload?: () => Promise<void>;
};

const HOUR_MS = 3_600_000;
const DEFAULT_PAGE_SIZE = 500;
/** The file's name inside its private key (<purpose>/<account>/<job>/<lease>/<name>). */
const OBJECT_NAME = 'export.csv';
// An export object is overdue when its deletion deadline passed this long ago
// (the worker sweeps every 15 minutes by default) or its storage delete failed.
const OVERDUE_GRACE_SECONDS = 3600;

/** One record as CSV cells, in EXPORT_CSV_COLUMNS order. */
export function exportRowCells(row: LeasedExportRow): string[] {
  const entry = row.type !== 'transfer';
  const cells: Record<ExportCsvColumn, string> = {
    record_id: csvLiteral(row.id),
    date: csvLiteral(row.occurredOn),
    type: csvLiteral(row.type),
    amount: csvNumber(minorToDecimal(row.amountMinor)),
    amount_minor: csvNumber(row.amountMinor),
    // THB only (master plan); the wallets table refuses any other currency.
    currency: csvLiteral('THB'),
    wallet_id: csvLiteral(entry ? row.walletId : null),
    wallet_name: csvText(entry ? row.walletName : null),
    category_id: csvLiteral(entry ? row.categoryId : null),
    // A custom or relabelled category by its label; a built-in by its stable key.
    category_name: csvText(entry ? (row.categoryLabel ?? row.categoryBuiltinKey) : null),
    category_builtin_key: csvLiteral(entry ? row.categoryBuiltinKey : null),
    source_wallet_id: csvLiteral(entry ? null : row.sourceWalletId),
    source_wallet_name: csvText(entry ? null : row.sourceWalletName),
    destination_wallet_id: csvLiteral(entry ? null : row.destinationWalletId),
    destination_wallet_name: csvText(entry ? null : row.destinationWalletName),
    merchant: csvText(row.merchant),
    note: csvText(row.note),
    version: csvNumber(String(row.version)),
  };
  return EXPORT_CSV_COLUMNS.map((column) => cells[column]);
}

async function* blocks(parts: readonly Buffer[]): AsyncIterable<Uint8Array> {
  for (const part of parts) yield part;
}

/**
 * The worker's `export` handler. Every record and the high-water revision
 * come from one REPEATABLE READ view through the leased-read role (the export
 * read routine takes the account and period from the stored job), so edits
 * committed while it reads cannot tear the file. The CSV is built in bounded
 * memory (at most MAX_EXPORT_BYTES; larger fails visibly as
 * `export_too_large`) and the read transaction is closed before any upload.
 * The file is registered before its PUT, then published with a 24-hour expiry,
 * recorded and the job completed in one transaction that re-checks the lease,
 * account and lifecycle generation - so a cancellation, deadline or account
 * deletion leaves nothing published (the sweep deletes the rest). Never logs
 * contents, keys or amounts.
 */
export class ExportHandler {
  constructor(private readonly deps: ExportDeps, private readonly options: ExportHandlerOptions = {}) {}

  async run(lease: JobLease): Promise<void> {
    if (lease.accountId === null) throw new Error('an export job needs an account');
    const pageSize = this.options.pageSize ?? DEFAULT_PAGE_SIZE;
    let csv: CsvBody & { highWater: string };
    try {
      csv = await this.deps.reader.withSnapshot(lease, 'export', async (read) => {
        const highWater = await read.highWater();
        const writer = new CsvWriter(EXPORT_CSV_COLUMNS, { maxBytes: this.options.maxBytes ?? MAX_EXPORT_BYTES });
        let after: { occurredOn: string; id: string } | null = null;
        for (let page = 0; ; page += 1) {
          lease.signal.throwIfAborted();
          const rows = await read.exportRows(after, pageSize);
          for (const row of rows) writer.row(exportRowCells(row));
          await this.options.afterPage?.(page);
          if (rows.length < pageSize) break;
          const last = rows[rows.length - 1];
          after = { occurredOn: last.occurredOn, id: last.id };
        }
        return { highWater, ...writer.finish() };
      });
    } catch (error) {
      if (!(error instanceof CsvTooLarge)) throw error;
      await this.deps.jobs.fail(lease, { code: 'export_too_large', retryable: false });
      return;
    }

    // Cancelled, reclaimed or expired while reading: nothing to publish.
    lease.signal.throwIfAborted();
    if (!(await this.deps.jobs.isHeld(lease))) return;
    const key = await this.deps.publication.reserve(lease, 'export', OBJECT_NAME);
    const stored = await this.deps.store.putStream(key, blocks(csv.parts), { contentType: 'text/csv; charset=utf-8', signal: lease.signal });
    if (stored.bytes !== csv.bytes) throw new Error('the stored export differs from the file that was built');
    await this.options.afterUpload?.();

    lease.signal.throwIfAborted();
    const expiresAt = new Date(Date.now() + EXPORT_TTL_HOURS * HOUR_MS);
    const done = await this.deps.publication.finishWithObjects(this.deps.jobs, lease, [{ key, ...stored }], expiresAt, async (client) => {
      const { rows } = await client.query<{ ok: boolean }>('SELECT gogospend_record_export($1, $2, $3, $4, $5, $6, $7, $8) AS ok', [
        lease.jobId,
        lease.leaseToken,
        key,
        stored.bytes,
        stored.sha256,
        csv.rows,
        csv.highWater,
        expiresAt,
      ]);
      return rows[0]?.ok === true;
    });
    // Not published but still held: the record was refused - retry.
    if (!done && (await this.deps.jobs.isHeld(lease))) await this.deps.jobs.fail(lease, { code: 'export_not_recorded', retryable: true });
  }
}

/**
 * Export objects whose scheduled deletion is overdue (deadline passed over an
 * hour ago) or whose storage delete failed and awaits retry - one account's,
 * or all. The worker alerts on a non-zero count after each sweep.
 */
export async function exportCleanupOverdue(pool: Pool, accountId?: string): Promise<number> {
  const { rows } = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM object_publications
      WHERE purpose = 'export' AND ($1::uuid IS NULL OR account_id = $1)
        AND (status = 'deleting' OR (status IN ('reserved', 'published') AND delete_after < now() - make_interval(secs => $2)))`,
    [accountId ?? null, OVERDUE_GRACE_SECONDS],
  );
  return rows[0]?.n ?? 0;
}
