// RED stub (P2-T20): the real types, with wrong answers.
import type { Minor, WalletDto } from '@gogospend/contracts';

import type { WalletKind } from '../looks/walletLooks.ts';

export type WalletsSummary = { activeCount: number; totalMinor: Minor; heldMinor: Minor; creditUsedMinor: Minor };

export function walletsSummary(_wallets: readonly WalletDto[], _kindOf: (id: string) => WalletKind | null): WalletsSummary {
  return { activeCount: 0, totalMinor: '0', heldMinor: '0', creditUsedMinor: '0' };
}

export function frontFirst<T extends Pick<WalletDto, 'id' | 'name' | 'archived'>>(_wallets: readonly T[], _order: readonly string[]): T[] {
  return [];
}

export function moveWallet(ids: readonly string[], _id: string, _by: -1 | 1): string[] {
  return [...ids];
}
