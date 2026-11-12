// The Bun Wallet's wallets list (P2-T20; wc-wallets, W28): the summary card's
// figures, and the one order the list, the reorder tray and Home's stack
// share. Pure: a Node test reads it. Money stays exact (BigInt over canonical
// satang strings, never a JS number).
import type { Minor, WalletDto } from '@gogospend/contracts';

import type { WalletKind } from '../looks/walletLooks.ts';

export type WalletsSummary = {
  /** Wallets in use. Archived wallets are left out of every figure. */
  activeCount: number;
  /** Every balance in use, added up: the money held less what the credit cards have spent (รวมทุกกระเป๋า). */
  totalMinor: Minor;
  /** Every balance above zero (เงินที่มี), a credit card paid ahead included. */
  heldMinor: Minor;
  /** What the credit cards have spent: each credit card's balance below zero, as a size (หักบัตรเครดิตที่ใช้ไป). */
  creditUsedMinor: Minor;
};

/**
 * wc-wallets' figures. A wallet's kind is the look kept on the phone (W7), so
 * `kindOf` says which wallets are credit cards. A wallet below zero that is
 * not a credit card (an overdrawn account) counts in the total only.
 */
export function walletsSummary(wallets: readonly WalletDto[], kindOf: (id: string) => WalletKind | null): WalletsSummary {
  let activeCount = 0;
  let total = 0n;
  let held = 0n;
  let creditUsed = 0n;
  for (const wallet of wallets) {
    if (wallet.archived) continue;
    activeCount += 1;
    const balance = BigInt(wallet.balance_minor);
    total += balance;
    if (balance > 0n) held += balance;
    else if (balance < 0n && kindOf(wallet.id) === 'credit_card') creditUsed -= balance;
  }
  return { activeCount, totalMinor: total.toString(), heldMinor: held.toString(), creditUsedMinor: creditUsed.toString() };
}

/**
 * The wallets in use, front first: the kept order first (W28), then every
 * wallet it does not name, by name, as the device diary lists wallets. An id
 * the order names that is not in use here (archived, or unknown) is passed
 * over. Home's stack (P2-T23) draws this order with the front card last.
 */
export function frontFirst<T extends Pick<WalletDto, 'id' | 'name' | 'archived'>>(wallets: readonly T[], order: readonly string[]): T[] {
  const left = new Map(wallets.filter((wallet) => !wallet.archived).map((wallet) => [wallet.id, wallet]));
  const kept: T[] = [];
  for (const id of order) {
    const wallet = left.get(id);
    if (wallet === undefined) continue;
    kept.push(wallet);
    left.delete(id);
  }
  const rest = [...left.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return [...kept, ...rest];
}

/**
 * The order with `id` moved one place toward the front (-1) or the back (1).
 * Always a new array, never the one given, since the kept looks hold what
 * they are given (n3). Unchanged at either end, and for an id it does not hold.
 */
export function moveWallet(ids: readonly string[], id: string, by: -1 | 1): string[] {
  const next = [...ids];
  const from = next.indexOf(id);
  const to = from + by;
  if (from < 0 || to < 0 || to >= next.length) return next;
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
