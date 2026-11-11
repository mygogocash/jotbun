// RED stub (P2-T11): the plan's interface, with no behaviour yet.
import type { WalletMaterial } from '../../theme/walletPalette.ts';

export type WalletKind = 'cash' | 'bank' | 'credit_card' | 'transit';
export const WALLET_KINDS: readonly WalletKind[] = [];

export type BunFaceName = 'smile' | 'wink' | 'calm' | 'happy' | 'wow';
export const BUN_FACES: readonly BunFaceName[] = [];

export type WalletLook = { kind: WalletKind | null; material: WalletMaterial; face: BunFaceName };

export function derivedLook(_walletId: string): WalletLook {
  return { kind: null, material: 'silk', face: 'smile' };
}

export function keptEntries(_raw: string | null): [string, unknown][] {
  return [];
}

export function parseLooks(_raw: string | null): Readonly<Record<string, WalletLook>> {
  return {};
}

export function parseOrder(_raw: string | null): readonly string[] {
  return [];
}
