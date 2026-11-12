/**
 * v1 owned wallets. A wallet's balance is derived from its opening balance
 * and active records; it is never a stored counter. From phase 5 (P5-T2, X7)
 * a wallet keeps its money in one ISO 4217 currency, fixed once created (Q7),
 * and carries its look: its kind, its card's material and Bun's face. A
 * snapshot written before phase 5 has no look and is always THB.
 */
import type { Minor } from "./common.ts";
import type { CurrencyCode } from "./currency.ts";

/** The older wallet shape's only currency: a snapshot without its look is THB (X7). */
export const WALLET_CURRENCY = "THB";

/** What kind of wallet it is, in the boards' order. */
export const WALLET_KINDS = [] as unknown as readonly ["cash", "bank", "credit_card", "transit"];
export type WalletKind = (typeof WALLET_KINDS)[number];

/** The card's material, in the boards' order. */
export const WALLET_MATERIALS = [] as unknown as readonly ["silk", "paper", "titanium", "sky", "peach"];
export type WalletMaterial = (typeof WALLET_MATERIALS)[number];

/** Bun's face on the card, in the boards' order. */
export const BUN_FACES = [] as unknown as readonly ["smile", "wink", "calm", "happy", "wow"];
export type BunFaceName = (typeof BUN_FACES)[number];

/** A wallet's look; null where none was chosen. */
export type WalletLookFields = { type: WalletKind | null; material: WalletMaterial | null; bun_face: BunFaceName | null };

/** Why an opening balance or tracking start changed after records exist (M3). */
export const WALLET_CORRECTION_REASONS = ["entry_error", "balance_reconciliation"] as const;
export type WalletCorrectionReason = (typeof WALLET_CORRECTION_REASONS)[number];

/**
 * The persisted wallet (the change-log snapshot). Every look key is optional
 * in the type, as older snapshots lack them; the vault sends all three from
 * phase 5 on.
 */
export type WalletSnapshot = {
  id: string;
  name: string;
  /** THB in a snapshot without its look, any ISO currency in one with it (X7). Fixed once created (Q7). */
  currency: CurrencyCode;
  /** Nonnegative setup balance, in the wallet's currency; never income. */
  opening_minor: Minor;
  /** First date records may use (Gregorian `YYYY-MM-DD`). */
  tracking_start: string;
  archived: boolean;
  version: number;
} & Partial<WalletLookFields>;

/** GET /v1/wallets: the snapshot plus its derived balance (may be negative). */
export type WalletDto = WalletSnapshot & { balance_minor: Minor };

/** POST /v1/wallets; `id` is a client-generated UUID. */
export type CreateWalletRequest = {
  id: string;
  name: string;
  opening_minor: Minor;
  tracking_start: string;
  /** The wallet's currency, fixed once created (Q7); left out, the home currency (P5-T5). */
  currency?: CurrencyCode;
} & Partial<WalletLookFields>;

/** PATCH /v1/wallets/:id with `If-Match`; at least one field. Never a currency (Q7). */
export type UpdateWalletRequest = {
  name?: string;
  opening_minor?: Minor;
  tracking_start?: string;
  correction_reason?: WalletCorrectionReason;
} & Partial<WalletLookFields>;

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
