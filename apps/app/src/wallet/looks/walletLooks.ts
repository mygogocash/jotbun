// A wallet's look (W7, R64): its kind, its material and Bun's face on it. The
// person's choices are kept on the phone per account (WalletLooksProvider);
// a wallet with none kept gets a material and a face derived from its id, and
// no kind. Kept text is read leniently: a damaged entry is dropped, never
// thrown. Pure: a Node test reads it.
import { WALLET_MATERIALS } from '../../theme/walletPalette.ts';
import type { WalletMaterial } from '../../theme/walletPalette.ts';

/** §5.2's four (W25), in wc-wallet-type's order without the e-wallet: 1D-T1's `wallet_type` values. */
export type WalletKind = 'cash' | 'bank' | 'credit_card' | 'transit';
export const WALLET_KINDS: readonly WalletKind[] = ['cash', 'bank', 'credit_card', 'transit'];

/** ยิ้ม, ขยิบตา, สบาย ๆ, ดีใจ and ว้าว, in wc-wallet-edit's order. */
export type BunFaceName = 'smile' | 'wink' | 'calm' | 'happy' | 'wow';
export const BUN_FACES: readonly BunFaceName[] = ['smile', 'wink', 'calm', 'happy', 'wow'];

export type WalletLook = { kind: WalletKind | null; material: WalletMaterial; face: BunFaceName };

/** 32-bit FNV-1a over the text's UTF-16 code units, unsigned. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The look of a wallet with none kept: the same id always gets the same material and face, and no kind. */
export function derivedLook(walletId: string): WalletLook {
  const hash = fnv1a(walletId);
  return {
    kind: null,
    material: WALLET_MATERIALS[hash % WALLET_MATERIALS.length],
    face: BUN_FACES[(hash >>> 8) % BUN_FACES.length],
  };
}

/** Kept text as JSON; undefined when it is missing or is not JSON. */
function parsed(raw: string | null): unknown {
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** A kept JSON object's own entries; none when the text is missing, is not JSON or is not an object. */
export function keptEntries(raw: string | null): [string, unknown][] {
  const value = parsed(raw);
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? Object.entries(value) : [];
}

const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === 'string' && (list as readonly string[]).includes(value);

function asLook(value: unknown): WalletLook | null {
  if (value === null || typeof value !== 'object') return null;
  const { kind, material, face } = value as Record<string, unknown>;
  if (kind !== null && !isOneOf(WALLET_KINDS, kind)) return null;
  if (!isOneOf(WALLET_MATERIALS, material) || !isOneOf(BUN_FACES, face)) return null;
  return { kind, material, face };
}

/** The kept looks by wallet id (the account store's `looks`). A damaged entry is dropped, never thrown. */
export function parseLooks(raw: string | null): Readonly<Record<string, WalletLook>> {
  return Object.fromEntries(keptEntries(raw).flatMap(([walletId, value]) => {
    const look = asLook(value);
    return look === null ? [] : [[walletId, look] as const];
  }));
}

/** The kept wallet order (the account store's `wallet-order`): ids, each once, in order. Anything else is dropped. */
export function parseOrder(raw: string | null): readonly string[] {
  const value = parsed(raw);
  return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string'))] : [];
}
