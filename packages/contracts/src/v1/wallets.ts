/**
 * v1 owned wallets. THB only. A wallet's balance is derived from its opening
 * balance and active records; it is never a stored counter.
 */
import type { Minor } from "./common.ts";

export const WALLET_CURRENCY = "THB";

/** Why an opening balance or tracking start changed after records exist (M3). */
export const WALLET_CORRECTION_REASONS = ["entry_error", "balance_reconciliation"] as const;
export type WalletCorrectionReason = (typeof WALLET_CORRECTION_REASONS)[number];

/** The persisted wallet (the change-log snapshot). */
export type WalletSnapshot = {
  id: string;
  name: string;
  currency: typeof WALLET_CURRENCY;
  /** Nonnegative setup balance; never income. */
  opening_minor: Minor;
  /** First date records may use (Gregorian `YYYY-MM-DD`). */
  tracking_start: string;
  archived: boolean;
  version: number;
};

/** GET /v1/wallets: the snapshot plus its derived balance (may be negative). */
export type WalletDto = WalletSnapshot & { balance_minor: Minor };

/** POST /v1/wallets; `id` is a client-generated UUID. */
export type CreateWalletRequest = {
  id: string;
  name: string;
  opening_minor: Minor;
  tracking_start: string;
};

/** PATCH /v1/wallets/:id with `If-Match`; at least one field. */
export type UpdateWalletRequest = {
  name?: string;
  opening_minor?: Minor;
  tracking_start?: string;
  correction_reason?: WalletCorrectionReason;
};

const WALLET_KEYS = ["archived", "currency", "id", "name", "opening_minor", "tracking_start", "version"].join(",");

/** True for exactly the persisted wallet shape (no extra or missing fields). */
export function isWalletSnapshot(value: unknown): value is WalletSnapshot {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const wallet = value as Record<string, unknown>;
  return (
    Object.keys(wallet).sort().join(",") === WALLET_KEYS &&
    typeof wallet.id === "string" &&
    typeof wallet.name === "string" &&
    wallet.currency === WALLET_CURRENCY &&
    typeof wallet.opening_minor === "string" && /^(0|[1-9][0-9]{0,10})$/.test(wallet.opening_minor) &&
    typeof wallet.tracking_start === "string" && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(wallet.tracking_start) &&
    typeof wallet.archived === "boolean" &&
    Number.isSafeInteger(wallet.version) && (wallet.version as number) >= 1
  );
}
