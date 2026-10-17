import type { Minor, WalletDto, WalletSnapshot } from '@gogospend/contracts';

import type { OwnerTx } from '../database/owner-transaction';

// Dates and bigints as text: never a JS Date (time zone) or Number (precision).
const COLUMNS = `id, name, currency, opening_minor::text AS opening_minor, tracking_start::text AS tracking_start, archived, version`;

/** The owner's wallets (RLS), optionally one id, optionally locked for a command. */
export async function walletRows(tx: OwnerTx, options: { id?: string; forUpdate?: boolean } = {}): Promise<WalletSnapshot[]> {
  const where = options.id ? 'WHERE id = $1' : '';
  const lock = options.forUpdate ? 'FOR UPDATE' : '';
  return tx.query<WalletSnapshot>(`SELECT ${COLUMNS} FROM wallets ${where} ORDER BY archived, created_at, id ${lock}`, options.id ? [options.id] : []);
}

export async function insertWallet(tx: OwnerTx, wallet: { id: string; name: string; opening_minor: Minor; tracking_start: string }): Promise<WalletSnapshot | undefined> {
  const [row] = await tx.query<WalletSnapshot>(
    `INSERT INTO wallets (account_id, id, name, opening_minor, tracking_start) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT DO NOTHING RETURNING ${COLUMNS}`,
    [tx.accountId, wallet.id, wallet.name, wallet.opening_minor, wallet.tracking_start],
  );
  return row;
}

export type WalletChange = { name?: string; opening_minor?: Minor; tracking_start?: string; archived?: boolean };

/** Applies a change and bumps the version; the caller has checked the expected version under the lock. */
export async function updateWallet(tx: OwnerTx, id: string, change: WalletChange): Promise<WalletSnapshot> {
  const [row] = await tx.query<WalletSnapshot>(
    `UPDATE wallets
        SET name = coalesce($2, name),
            opening_minor = coalesce($3::bigint, opening_minor),
            tracking_start = coalesce($4::date, tracking_start),
            archived = coalesce($5, archived),
            version = version + 1,
            updated_at = now()
      WHERE id = $1
      RETURNING ${COLUMNS}`,
    [id, change.name ?? null, change.opening_minor ?? null, change.tracking_start ?? null, change.archived ?? null],
  );
  return row;
}

/**
 * Derived balances: opening balance plus active records (M3 adds records).
 * Never a stored counter.
 */
export async function walletBalances(tx: OwnerTx, ids: readonly string[]): Promise<Map<string, Minor>> {
  const rows = await tx.query<{ id: string; balance: Minor }>('SELECT id, opening_minor::text AS balance FROM wallets WHERE id = ANY($1::uuid[])', [ids]);
  return new Map(rows.map((row) => [row.id, row.balance]));
}

export async function walletDtos(tx: OwnerTx, wallets: readonly WalletSnapshot[]): Promise<WalletDto[]> {
  const balances = await walletBalances(tx, wallets.map((wallet) => wallet.id));
  return wallets.map((wallet) => ({ ...wallet, balance_minor: balances.get(wallet.id) ?? wallet.opening_minor }));
}
