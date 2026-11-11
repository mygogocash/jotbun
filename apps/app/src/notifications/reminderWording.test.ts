import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { recordingTc, untranslated } from '../spend/v1/redesign/testing/catalog.ts';
import { EVERY_DAY } from './reminders.ts';
import type { Weekday } from './reminders.ts';
import { reminderWording } from './reminderWording.ts';

/** The wording the owner approved on 24 October 2026: Bun speaking, one per weekday, Monday first. */
const APPROVED: Readonly<Record<Weekday, { en: [string, string]; th: [string, string] }>> = {
  1: { en: ["Bun's ready for a new week", 'Start it with what you spent today.'], th: ['บันพร้อมเริ่มสัปดาห์ใหม่แล้ว', 'เริ่มด้วยรายจ่ายของวันนี้กันนะ'] },
  2: { en: ['Bun saved you a fresh page', 'Add what you spent today in Jotbun.'], th: ['บันเปิดหน้าใหม่รอไว้แล้ว', 'เพิ่มรายจ่ายของวันนี้ใน Jotbun'] },
  3: { en: ['Halfway there, says Bun', "A minute now keeps this week's total right."], th: ['บันบอกว่าผ่านมาครึ่งสัปดาห์แล้ว', 'ใช้แค่นาทีเดียว ยอดรวมสัปดาห์นี้ก็ถูกต้อง'] },
  4: { en: ["Bun's all ears", 'Coffee, a ride, a top-up: each takes seconds to add.'], th: ['บันรอฟังอยู่นะ', 'กาแฟ ค่ารถ เติมเงินมือถือ เพิ่มได้ในไม่กี่วินาที'] },
  5: { en: ["Bun says it's Friday!", "Note today's spending before the weekend starts."], th: ['บันบอกว่าวันศุกร์แล้ว!', 'จดรายจ่ายวันนี้ไว้ก่อนเข้าสุดสัปดาห์นะ'] },
  6: { en: ['Bun likes weekends too', "Big or small, today's spending counts."], th: ['บันชอบวันหยุดเหมือนกัน', 'มากหรือน้อย รายจ่ายวันนี้ก็นับนะ'] },
  7: { en: ["Bun's wrapping up the week", "Add today's spending to make it complete."], th: ['บันกำลังปิดสัปดาห์นี้', 'เพิ่มรายจ่ายวันนี้ให้ครบทั้งสัปดาห์กัน'] },
};

const catalog = (locale: string): Record<string, string> =>
  JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), 'utf8'));

test('each weekday has its own reminder wording, as the owner approved it', () => {
  const { tc } = recordingTc();
  for (const day of EVERY_DAY) {
    const { title, body } = reminderWording(day, tc);
    assert.deepEqual([title, body], APPROVED[day].en, `day ${day}`);
  }
  assert.equal(new Set(EVERY_DAY.map((day) => reminderWording(day, tc).title)).size, 7);
});

test('every reminder wording is copy in en.json, in the Thai the owner approved', () => {
  const { tc, asked } = recordingTc();
  for (const day of EVERY_DAY) reminderWording(day, tc);
  assert.deepEqual(untranslated(asked), []);
  // First key wins, as in translateCopy.
  const en = catalog('en');
  const th = catalog('th');
  const keyOf = new Map<string, string>();
  for (const [key, value] of Object.entries(en)) if (!keyOf.has(value)) keyOf.set(value, key);
  for (const day of EVERY_DAY) {
    const [title, body] = APPROVED[day].en;
    assert.deepEqual([th[keyOf.get(title) ?? ''], th[keyOf.get(body) ?? '']], APPROVED[day].th, `day ${day}`);
  }
});
