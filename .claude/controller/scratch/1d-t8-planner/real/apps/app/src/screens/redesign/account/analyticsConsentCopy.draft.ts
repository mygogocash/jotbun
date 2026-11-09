// DRAFT COPY - AWAITING E2 APPROVAL (1D-T8: D34's consent question and Privacy's switch).
//
// Thai and English text for AnalyticsConsentScreen and Privacy's ช่วยพัฒนา
// Jotbun switch, kept here on purpose and NOT in the locale catalogs
// (src/messages/*.json) until the owner approves the screenshots (E2; decided,
// Q4, Q9 and Q10). The lines are the plan's table word for word; there is no
// board, and the Thai is a first draft for the owner's or a translator's pass.
// When approved, move these lines into the catalogs, use `useCopy()` and
// delete this module. Vietnamese falls back to English until then.
import { useCallback } from 'react';

import type { Locale } from '@mobile/i18n/locales';
import { useActiveLocale } from '@mobile/i18n/useCopy';

export const ANALYTICS_CONSENT_COPY_DRAFT = {
  title: { th: 'ช่วยพัฒนา Jotbun', en: 'Help improve Jotbun' },
  body: {
    th: 'ให้ Jotbun เห็นว่าคุณใช้แอปอย่างไร เช่น หน้าที่เปิดและวิธีที่จด เพื่อปรับให้ใช้ง่ายขึ้น',
    en: 'Let Jotbun see how you use the app, such as the screens you open and how you record, so we can make it easier.',
  },
  replay: {
    th: 'รวมถึงการบันทึกหน้าจอที่ซ่อนข้อความและรูปทั้งหมด และแบบสอบถามสั้น ๆ บางครั้ง',
    en: 'This includes screen recordings with every word and picture hidden, and an occasional short survey.',
  },
  never: {
    th: 'เราไม่เคยส่งยอดเงิน ชื่อร้าน ชื่อกระเป๋า โน้ต อีเมล หรือรูปสลิป',
    en: 'We never send amounts, shop or wallet names, notes, your email or slip photos.',
  },
  later: { th: 'เปลี่ยนได้ทุกเมื่อในความเป็นส่วนตัว', en: 'You can change this any time in Privacy.' },
  yes: { th: 'ได้ ช่วยเลย', en: "Yes, I'll help" },
  no: { th: 'ไม่ ขอบคุณ', en: 'No, thanks' },
  saveFailed: { th: 'บันทึกคำตอบไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองอีกครั้ง', en: "Couldn't save your answer. Check your connection and try again." },
  switchLabel: { th: 'ช่วยพัฒนา Jotbun', en: 'Help improve Jotbun' },
  stoppedHere: { th: 'หยุดส่งจากเครื่องนี้แล้ว จะแจ้ง Jotbun เมื่อออนไลน์', en: "Stopped on this phone. Jotbun will be told when you're online." },
} as const;

export type ConsentCopyKey = keyof typeof ANALYTICS_CONSENT_COPY_DRAFT;

/** One draft line: Thai for Thai, English otherwise. */
export function consentText(key: ConsentCopyKey, locale: Locale): string {
  const line = ANALYTICS_CONSENT_COPY_DRAFT[key];
  return locale === 'th' ? line.th : line.en;
}

/** Draft copy for the active locale. */
export function useConsentCopy(): (key: ConsentCopyKey) => string {
  const locale = useActiveLocale();
  return useCallback((key: ConsentCopyKey) => consentText(key, locale), [locale]);
}
