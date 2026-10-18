import type { TransactionDto, TransactionType } from '@gogospend/contracts';

/** Record columns with dates and bigints as text: never a JS Date (time zone) or Number (precision). */
export const RECORD_COLUMNS = `id, type, amount_minor::text AS amount_minor, to_char(occurred_on, 'YYYY-MM-DD') AS occurred_on, wallet_id, category_id,
  source_wallet_id, destination_wallet_id, note, merchant, deleted_at, version`;

export type RecordRow = {
  id: string; type: TransactionType; amount_minor: string; occurred_on: string;
  wallet_id: string | null; category_id: string | null; source_wallet_id: string | null; destination_wallet_id: string | null;
  note: string | null; merchant: string | null; deleted_at: Date | null; version: number;
};

/** The persisted record DTO for a row. */
export function toDto(row: RecordRow): TransactionDto {
  const common = { id: row.id, amount_minor: row.amount_minor, occurred_on: row.occurred_on, note: row.note, merchant: row.merchant, deleted_at: row.deleted_at ? row.deleted_at.toISOString() : null, version: row.version };
  return row.type === 'transfer'
    ? { ...common, type: 'transfer', source_wallet_id: row.source_wallet_id as string, destination_wallet_id: row.destination_wallet_id as string }
    : { ...common, type: row.type, wallet_id: row.wallet_id as string, category_id: row.category_id as string };
}
