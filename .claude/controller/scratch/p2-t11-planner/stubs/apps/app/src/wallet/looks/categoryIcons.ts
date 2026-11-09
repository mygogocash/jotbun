// RED stub (P2-T11): the plan's interface, with no behaviour yet.
import type { CategoryDto } from '@gogospend/contracts';

import type { PackKey } from '../../spend/v1/redesign/planning/thaiPack.ts';
import type { GlyphKey } from './categoryGlyphs.ts';

export const PACK_GLYPH: Readonly<Record<PackKey, GlyphKey>> = {
  family_out: 'food',
  merit: 'food',
  delivery: 'food',
  motorbike_rail: 'food',
  topup: 'food',
  seven: 'food',
  lottery: 'food',
  pets: 'food',
  family_in: 'food',
};

export type KeptIcons = Readonly<Record<string, GlyphKey>>;

export function parseIcons(_raw: string | null): KeptIcons {
  return {};
}

export function iconFor(_category: Pick<CategoryDto, 'id' | 'type' | 'label' | 'builtin_key'>, _kept: KeptIcons): GlyphKey | null {
  return null;
}
