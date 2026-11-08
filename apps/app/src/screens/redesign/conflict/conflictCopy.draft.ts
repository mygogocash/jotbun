// DRAFT COPY - AWAITING E2 APPROVAL (1D-T9: C16's conflict choice, board rh-conflict).
//
// Thai and English text for ChoicePanel, the record's choice flow and History's
// waiting caption, kept here on purpose and NOT in the locale catalogs
// (src/messages/*.json) until the owner approves the screenshots (E2; decided,
// Q9 and Q10). The Thai of the heading, the cards, the mark and the buttons is
// the board's; "ตัดสินใจทีหลัง" is C16's; the rest is a first draft for the
// owner's or a translator's pass. When approved, move these lines into the
// catalogs, use `useCopy()` and delete this module. Vietnamese falls back to
// English until then.
import { useCallback } from 'react';

import type { Locale } from '@mobile/i18n/locales';
import { formatCopyValues } from '@mobile/i18n/messages';
import type { CopyValues } from '@mobile/i18n/messages';
import { useActiveLocale } from '@mobile/i18n/useCopy';

export const CONFLICT_COPY_DRAFT = {
  heading: { th: 'รายการนี้ถูกแก้ในอีกเครื่อง', en: 'This entry was changed on another phone' },
  keptHere: {
    th: 'ข้อมูลไม่ตรงกัน เลือกว่าจะเก็บแบบไหน การแก้ไขของคุณยังเก็บอยู่ในเครื่องนี้จนกว่าคุณจะเลือก',
    en: "The details don't match. Choose which to keep. Your change stays on this phone until you choose.",
  },
  yours: { th: 'ของคุณ', en: 'Yours' },
  yoursAt: { th: 'เครื่องนี้ · แก้ {time}', en: 'This phone · changed {time}' },
  server: { th: 'ในเซิร์ฟเวอร์', en: 'On the server' },
  serverAt: { th: 'อีกเครื่อง', en: 'Another phone' },
  differs: { th: 'ไม่ตรงกัน', en: 'Differs' },
  replaces: { th: 'ถ้าใช้ของคุณ ช่องที่ไม่ตรงกันในเซิร์ฟเวอร์จะถูกแทนที่', en: 'If you use yours, the fields that differ on the server are replaced.' },
  useYours: { th: 'ใช้ของคุณ', en: 'Use yours' },
  useServer: { th: 'ใช้ในเซิร์ฟเวอร์', en: "Use the server's" },
  decideLater: { th: 'ตัดสินใจทีหลัง', en: 'Decide later' },
  offline: { th: 'ต้องต่ออินเทอร์เน็ตก่อนจึงจะส่งของคุณได้', en: 'Connect to the internet to send yours.' },
  discardMine: { th: 'ทิ้งการแก้ไขของฉัน', en: 'Discard my change' },
  cannotKeep: { th: 'เครื่องนี้เก็บตัวเลือกไว้ไม่ได้ กรุณาเลือกตอนนี้', en: "This phone can't keep this choice, so please choose now." },
  waiting: { th: 'รอคุณเลือก', en: 'Waiting for your choice' },
} as const;

export type ConflictCopyKey = keyof typeof CONFLICT_COPY_DRAFT;

/** One draft line: Thai for Thai, English otherwise, with `{time}` filled in one pass. */
export function conflictText(key: ConflictCopyKey, locale: Locale, values?: CopyValues): string {
  const line = CONFLICT_COPY_DRAFT[key];
  return formatCopyValues(locale === 'th' ? line.th : line.en, values ?? {});
}

/** Draft copy for the active locale. */
export function useConflictCopy(): (key: ConflictCopyKey, values?: CopyValues) => string {
  const locale = useActiveLocale();
  return useCallback((key: ConflictCopyKey, values?: CopyValues) => conflictText(key, locale, values), [locale]);
}
