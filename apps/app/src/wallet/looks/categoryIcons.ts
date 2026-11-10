// Which glyph a category shows in the Bun Wallet (W7, W8): the icon the person
// kept for it, else its Thai pack glyph (a pack category is recognised by
// name until phase 5 adds pack_key), else its built-in drawing, else none, and
// the tile shows the name's initial. Kept icons live in the account store's
// `category-icons` (WalletLooksProvider). Pure: a Node test reads it.
import type { CategoryDto } from '@gogospend/contracts';

import { packKeyOf } from '../../spend/v1/redesign/planning/thaiPack.ts';
import type { PackKey } from '../../spend/v1/redesign/planning/thaiPack.ts';
import { isGlyphKey } from './categoryGlyphs.ts';
import type { GlyphKey } from './categoryGlyphs.ts';
import { keptEntries } from './walletLooks.ts';

/** C3's nine (P2-T7), each with its glyph from the icon picker. */
export const PACK_GLYPH: Readonly<Record<PackKey, GlyphKey>> = {
  family_out: 'heart',
  merit: 'lotus',
  delivery: 'food',
  motorbike_rail: 'car',
  topup: 'phone',
  seven: 'bag',
  lottery: 'receipt',
  pets: 'paw',
  family_in: 'heart',
};

export type KeptIcons = Readonly<Record<string, GlyphKey>>;

/** The kept icons by category id (the account store's `category-icons`). A damaged entry is dropped, never thrown. */
export function parseIcons(raw: string | null): KeptIcons {
  return Object.fromEntries(keptEntries(raw).filter((entry): entry is [string, GlyphKey] => isGlyphKey(entry[1])));
}

/** The kept icon, else the pack's glyph, else the built-in key, else null (the tile shows the initial). */
export function iconFor(category: Pick<CategoryDto, 'id' | 'type' | 'label' | 'builtin_key'>, kept: KeptIcons): GlyphKey | null {
  // A built-in is never a pack category (packKeyOf), so the pack's glyph and the built-in key never compete.
  const pack = packKeyOf(category);
  return kept[category.id] ?? (pack === null ? category.builtin_key : PACK_GLYPH[pack]);
}
