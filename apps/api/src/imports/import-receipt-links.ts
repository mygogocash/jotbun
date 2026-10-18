import type { EntityChange } from '@gogospend/contracts';

import type { OwnerTx } from '../database/owner-transaction';

/** A source row this confirmation batch saved, and the transaction it became. */
export type ConfirmedImportRow = { sourceRowId: string; transactionId: string; transactionVersion: number };

export type ConfirmedImportBatch = {
  jobId: string;
  selectionId: string;
  commandId: string;
  /** Only the rows this command saved (never rows acknowledged from an earlier batch). */
  rows: readonly ConfirmedImportRow[];
};

/**
 * P2C HOOK: retained receipt association for confirmed import rows.
 *
 * P3 does not link receipts. P2c implements this port with its ownership and
 * version rules, and the integrator binds it to IMPORT_RECEIPT_LINKS. The
 * contract:
 *   - It is called exactly once per confirmation batch, inside the batch's
 *     command transaction (M1 executor: account lock held, session and
 *     policies re-checked), after the batch's transactions and row progress
 *     were written and before the change group is appended. It is never
 *     called for a replayed command or a batch that saved no row.
 *   - It may only associate an owned, sanitized receipt image of this import
 *     (P2b's `import_previews.image_key`, retained under P2c's purpose) with
 *     the transactions in `rows`, following P2c's ownership and version rules
 *     (one current receipt per transaction).
 *   - It returns the entity changes it made (for example the transaction at
 *     its next version, or an attachment entity); they are committed in the
 *     same change group under the same revision. It returns [] when there is
 *     nothing to link.
 *   - Any failure throws and rolls back the whole batch: no transaction, no
 *     progress row and no receipt is kept.
 *   - It must not publish or delete objects outside this database
 *     transaction, and must not put raw candidate fields in any change.
 */
export interface ImportReceiptLinks {
  linkConfirmedRows(tx: OwnerTx, batch: ConfirmedImportBatch): Promise<readonly EntityChange[]>;
}

export const IMPORT_RECEIPT_LINKS = Symbol('IMPORT_RECEIPT_LINKS');

/** Until P2c lands: nothing is linked. */
export const NO_RECEIPT_LINKS: ImportReceiptLinks = { linkConfirmedRows: async () => [] };
