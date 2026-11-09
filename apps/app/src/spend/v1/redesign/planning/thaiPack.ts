// "Thai everyday" categories (premium plan A2, decision D18, spec C3): the spending
// that is part of daily life in Thailand and the region but not one of the
// ten built-ins. They are made as ordinary custom categories, named in the
// person's language, so the wire contract and the built-in keys stay as they
// are. THAI_EVERYDAY_PACK is C3's nine. The routed Categories screen still
// offers today's seven, PACK_BEFORE_C3, until that screen switches. Pure.
import type { CategoryDto, CategoryType } from '@gogospend/contracts';

import type { CategoryCommand } from './categoriesModel.ts';

export type PackKey = 'family_out' | 'merit' | 'delivery' | 'motorbike_rail' | 'topup' | 'seven' | 'lottery' | 'pets' | 'family_in';
export type PackItem = { readonly key: string; readonly type: CategoryType; readonly th: string; readonly en: string; readonly color: string; readonly aliases?: readonly string[] };
export type C3Item = PackItem & { readonly key: PackKey; readonly aliases: readonly string[] };

/** C3's nine, in C3's order. English names are drafts. */
export const THAI_EVERYDAY_PACK: readonly C3Item[] = [
  { key: 'family_out', type: 'expense', th: 'ส่งเงินให้ครอบครัว', en: 'Family support', color: '#F291C4', aliases: [] },
  { key: 'merit', type: 'expense', th: 'ทำบุญ', en: 'Merit making', color: '#F2CE5C', aliases: [] },
  { key: 'delivery', type: 'expense', th: 'เดลิเวอรี', en: 'Delivery', color: '#F0A868', aliases: ['สั่งอาหารเดลิเวอรี่', 'Food delivery'] },
  { key: 'motorbike_rail', type: 'expense', th: 'วินมอไซค์และรถไฟฟ้า', en: 'Motorbike taxi and rail', color: '#4E93D9', aliases: [] },
  { key: 'topup', type: 'expense', th: 'เติมเงินมือถือ', en: 'Mobile top-up', color: '#6FB3F2', aliases: ['ค่าโทรศัพท์และเน็ต', 'Phone and internet'] },
  { key: 'seven', type: 'expense', th: 'เซเว่น', en: 'Convenience store', color: '#D6EE8A', aliases: [] },
  { key: 'lottery', type: 'expense', th: 'ลอตเตอรี่', en: 'Lottery', color: '#D3C2F2', aliases: [] },
  { key: 'pets', type: 'expense', th: 'สัตว์เลี้ยง', en: 'Pets', color: '#9CD4F5', aliases: [] },
  { key: 'family_in', type: 'income', th: 'เงินจากครอบครัว', en: 'From family', color: '#A8CC4A', aliases: [] },
];

/** Today's seven, unchanged, until the routed screen is allowed to offer C3. */
export const PACK_BEFORE_C3: readonly PackItem[] = [
  { key: 'family_out', type: 'expense', th: 'ส่งเงินให้ครอบครัว', en: 'Family support', color: '#F291C4' },
  { key: 'merit', type: 'expense', th: 'ทำบุญ', en: 'Merit making', color: '#F2CE5C' },
  { key: 'delivery', type: 'expense', th: 'สั่งอาหารเดลิเวอรี่', en: 'Food delivery', color: '#F0A868' },
  { key: 'phone', type: 'expense', th: 'ค่าโทรศัพท์และเน็ต', en: 'Phone and internet', color: '#6FB3F2' },
  { key: 'pets', type: 'expense', th: 'สัตว์เลี้ยง', en: 'Pets', color: '#9CD4F5' },
  { key: 'lottery', type: 'expense', th: 'ลอตเตอรี่', en: 'Lottery', color: '#D3C2F2' },
  { key: 'family_in', type: 'income', th: 'เงินจากครอบครัว', en: 'From family', color: '#A8CC4A' },
];

const fold = (text: string) => text.normalize('NFC').trim().toLowerCase();

/** Thai, English and every alias, folded the same way a saved label is. */
function foldedNames(item: PackItem): readonly string[] {
  return [item.th, item.en, ...(item.aliases ?? [])].map(fold);
}

function held(existing: readonly Pick<CategoryDto, 'type' | 'label'>[]): Set<string> {
  return new Set(existing.filter((category) => category.label !== null).map((category) => `${category.type}\u0000${fold(category.label as string)}`));
}

/** The pack's items the person does not have yet (by any folded name, archived ones included). `pack` defaults to C3. */
export function missingPackItems(existing: readonly Pick<CategoryDto, 'type' | 'label'>[], pack: readonly PackItem[] = THAI_EVERYDAY_PACK): PackItem[] {
  const have = held(existing);
  return pack.filter((item) => !foldedNames(item).some((name) => have.has(`${item.type}\u0000${name}`)));
}

/** One create command per missing item, named in the person's language (Thai for Thai, English otherwise). */
export function packCommands(
  existing: readonly Pick<CategoryDto, 'type' | 'label'>[],
  locale: 'th' | 'en' | 'vi',
  newId: () => string,
  options?: { pack?: readonly PackItem[]; only?: readonly string[] },
): CategoryCommand[] {
  const pack = options?.pack ?? THAI_EVERYDAY_PACK;
  const only = options?.only;
  return missingPackItems(existing, pack)
    .filter((item) => only === undefined || only.includes(item.key))
    .map((item) => ({
      slot: 'category',
      kind: 'create',
      input: { id: newId(), type: item.type, label: locale === 'th' ? item.th : item.en, color: item.color },
    }));
}

/** C3's key for a custom category, matched on any of its names. A built-in is never a pack category. */
export function packKeyOf(category: Pick<CategoryDto, 'type' | 'label' | 'builtin_key'>): PackKey | null {
  if (category.builtin_key !== null || category.label === null) return null;
  const label = fold(category.label);
  return THAI_EVERYDAY_PACK.find((item) => item.type === category.type && foldedNames(item).includes(label))?.key ?? null;
}

/** No category (a transfer) is null. Otherwise the built-in key, else the pack key, else `custom`. Never the label. */
export function analyticsCategoryKey(category: Pick<CategoryDto, 'type' | 'label' | 'builtin_key'> | null): string | null {
  if (category === null) return null;
  return category.builtin_key ?? packKeyOf(category) ?? 'custom';
}
