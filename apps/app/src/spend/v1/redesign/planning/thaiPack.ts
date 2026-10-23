// "Thai everyday" categories (premium plan A2, decision D18): the spending
// that is part of daily life in Thailand and the region but not one of the
// ten built-ins: money sent to family, merit making, delivery, the phone
// bill, pets and the lottery; and money received from family. They are made
// as ordinary custom categories, named in the person's language, so the wire
// contract and the built-in keys stay as they are. Pure.
import type { CategoryDto, CategoryType } from '@gogospend/contracts';

import type { CategoryCommand } from './categoriesModel.ts';

export type PackItem = { readonly key: string; readonly type: CategoryType; readonly th: string; readonly en: string; readonly color: string };

export const THAI_EVERYDAY_PACK: readonly PackItem[] = [
  { key: 'family_out', type: 'expense', th: 'ส่งเงินให้ครอบครัว', en: 'Family support', color: '#F291C4' },
  { key: 'merit', type: 'expense', th: 'ทำบุญ', en: 'Merit making', color: '#F2CE5C' },
  { key: 'delivery', type: 'expense', th: 'สั่งอาหารเดลิเวอรี่', en: 'Food delivery', color: '#F0A868' },
  { key: 'phone', type: 'expense', th: 'ค่าโทรศัพท์และเน็ต', en: 'Phone and internet', color: '#6FB3F2' },
  { key: 'pets', type: 'expense', th: 'สัตว์เลี้ยง', en: 'Pets', color: '#9CD4F5' },
  { key: 'lottery', type: 'expense', th: 'ลอตเตอรี่', en: 'Lottery', color: '#D3C2F2' },
  { key: 'family_in', type: 'income', th: 'เงินจากครอบครัว', en: 'From family', color: '#A8CC4A' },
];

const fold = (text: string) => text.normalize('NFC').trim().toLowerCase();

/** The pack's items the person does not have yet (by either language's name, archived ones included). */
export function missingPackItems(existing: readonly Pick<CategoryDto, 'type' | 'label'>[]): PackItem[] {
  const have = new Set(existing.filter((c) => c.label !== null).map((c) => `${c.type}\u0000${fold(c.label as string)}`));
  return THAI_EVERYDAY_PACK.filter((item) => !have.has(`${item.type}\u0000${fold(item.th)}`) && !have.has(`${item.type}\u0000${fold(item.en)}`));
}

/** One create command per missing item, named in the person's language (Thai for Thai, English otherwise). */
export function packCommands(existing: readonly Pick<CategoryDto, 'type' | 'label'>[], locale: 'th' | 'en' | 'vi', newId: () => string): CategoryCommand[] {
  return missingPackItems(existing).map((item) => ({
    slot: 'category',
    kind: 'create',
    input: { id: newId(), type: item.type, label: locale === 'th' ? item.th : item.en, color: item.color },
  }));
}
