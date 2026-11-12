// The widget snapshot (P6A-T2; X2, X3; ox-widget-home, ox-widget-lock; D41,
// B21; Review Focus 1 and 2): display-ready faces, a lock face with no amount
// while the Face ID lock or private mode is on, and entries that roll over at
// Bangkok midnight. The month is ox-widget-home's: ฿18,000 for October 2026,
// ฿13,360 spent by Saturday 24 October, so ฿4,640 is left for 8 days.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Minor } from '@gogospend/contracts';

import { budgetPace } from '../../spend/v1/redesign/budgetPace.ts';
import type { BudgetPace } from '../../spend/v1/redesign/budgetPace.ts';
import { budget, spentSummary } from '../../spend/v1/redesign/testing/fixtures.ts';
import { tableT } from '../copy/draftText.ts';
import { OUTSIDE_DRAFT } from './outsideCopy.draft.ts';
import { buildWidgetSnapshot, entryAt, faceFor, nextBangkokMidnight, sameSnapshot, signedOutSnapshot } from './widgetSnapshot.ts';
import type { WidgetEntry, WidgetFace, WidgetFacts, WidgetLinks, WidgetSnapshot } from './widgetSnapshot.ts';

const LINKS: WidgetLinks = { record: 'gogospend://outside/record', today: 'gogospend://outside/today', scan: null };
const OCT = '2026-10';
const LIMIT = '1800000';
/** 20:00 on Saturday 24 October in Bangkok. */
const NOW = new Date('2026-10-24T13:00:00Z');
const HIDDEN = '฿••••';
/** Every amount the October month holds, as a face or its words would write it. */
const AMOUNTS = ['132', '580', '662', '74', '13,360', '4,640', '18,000'];

function pace(today: string, spent: string, limit: string | null = LIMIT): BudgetPace {
  return budgetPace({ budget: limit === null ? null : budget(OCT, limit), summary: spentSummary(OCT, spent), today });
}

/** Records the amounts it is handed and says them in whole baht. */
function spokenFake(unit = 'บาท') {
  const handed: Minor[] = [];
  const spoken = (minor: Minor) => {
    handed.push(minor);
    return `${BigInt(minor) / 100n} ${unit}`;
  };
  return { handed, spoken };
}

type Build = Partial<WidgetFacts> & { links?: WidgetLinks; spoken?: (minor: Minor) => string };

/** ox-widget-home's evening: 3 records worth ฿132 today, on the October pace. */
function build(input: Build = {}): WidgetSnapshot {
  const { links = LINKS, spoken = spokenFake().spoken, ...given } = input;
  const facts: WidgetFacts = { now: NOW, todayCount: 3, todayOutMinor: '13200', pace: pace('2026-10-24', '1336000'), hidden: false, lockOn: false, locale: 'th', ...given };
  try {
    return buildWidgetSnapshot(facts, links, tableT(OUTSIDE_DRAFT, facts.locale), spoken);
  } catch (error) {
    assert.fail(`buildWidgetSnapshot threw: ${String(error)}`);
  }
}

function entry(snapshot: WidgetSnapshot, index: number): WidgetEntry {
  const found = snapshot.entries[index];
  assert.ok(found, `no entry ${index}`);
  return found;
}

function home(snapshot: WidgetSnapshot, index = 0): WidgetFace {
  const found = entry(snapshot, index).home;
  assert.ok(found, `no home face in entry ${index}`);
  return found;
}

function lock(snapshot: WidgetSnapshot, index = 0): WidgetFace {
  const found = entry(snapshot, index).lock;
  assert.ok(found, `no lock face in entry ${index}`);
  return found;
}

/** What a face draws, apart from its day and its spoken words. */
function drawn(face: WidgetFace) {
  return [face.masked, face.outLabel, face.out, face.count, face.today, face.sideLabel, face.side, face.over, face.gaugeLabel, face.gaugeText, face.gaugeFraction];
}

test('the home face reads as ox-widget-home', () => {
  const snapshot = build();
  const face = home(snapshot);
  assert.deepEqual(drawn(face), [false, 'ใช้วันนี้', '฿132', '3 รายการ', 'วันนี้ · 3 รายการ', 'เหลือวันนี้', '≈ ฿580', false, 'งบ ต.ค.', '74%', 0.742]);
  assert.deepEqual(face.spoken, {
    small: 'วันนี้ใช้ 132 บาท 3 รายการ เหลือวันนี้ประมาณ 580 บาท',
    inline: 'เหลือวันนี้ประมาณ 580 บาท',
    gauge: 'งบเดือนตุลาคม ใช้ไป 74 เปอร์เซ็นต์',
    rectangular: 'วันนี้ใช้ 132 บาท 3 รายการ เหลือวันนี้ประมาณ 580 บาท',
  });
  // With neither the lock nor private mode, the lock face reads the same.
  assert.deepEqual(lock(snapshot), face);
  const english = home(build({ locale: 'en', spoken: spokenFake('baht').spoken }));
  assert.deepEqual(drawn(english), [false, 'Spent today', '฿132', '3 records', 'Today · 3 records', 'Left today', '≈ ฿580', false, 'Oct budget', '74%', 0.742]);
  assert.deepEqual(english.spoken, {
    small: 'Spent 132 baht today, 3 records. About 580 baht left today',
    inline: 'About 580 baht left today',
    gauge: '74 percent of the October budget used',
    rectangular: 'Spent 132 baht today, 3 records. About 580 baht left today',
  });
});

test('with the Face ID lock on, the lock face holds no amount, private mode or not', () => {
  for (const hidden of [false, true]) {
    const snapshot = build({ lockOn: true, hidden });
    const face = lock(snapshot);
    assert.deepEqual(drawn(face), [true, 'ใช้วันนี้', HIDDEN, '3 รายการ', 'วันนี้ · 3 รายการ', 'เหลือวันนี้', HIDDEN, false, 'งบ ต.ค.', null, null], `hidden ${hidden}`);
    assert.deepEqual(face.spoken, { small: 'วันนี้ 3 รายการ ยอดเงินซ่อนอยู่', inline: 'วันนี้ 3 รายการ ยอดเงินซ่อนอยู่', gauge: 'งบเดือนนี้ ซ่อนอยู่', rectangular: 'วันนี้ 3 รายการ ยอดเงินซ่อนอยู่' });
    assert.equal(home(snapshot).out, hidden ? HIDDEN : '฿132');
    const lockFaces = JSON.stringify(snapshot.entries.map((one) => one.lock));
    for (const amount of AMOUNTS) assert.equal(lockFaces.includes(amount), false, `${amount} on a lock face, hidden ${hidden}`);
  }
});

test('private mode masks both faces and keeps the count', () => {
  const snapshot = build({ hidden: true });
  for (const face of [home(snapshot), lock(snapshot), home(snapshot, 1), lock(snapshot, 1)]) {
    assert.deepEqual([face.masked, face.out, face.side, face.gaugeText, face.gaugeFraction], [true, HIDDEN, HIDDEN, null, null]);
  }
  const face = home(snapshot);
  assert.deepEqual([face.count, face.today, face.sideLabel], ['3 รายการ', 'วันนี้ · 3 รายการ', 'เหลือวันนี้']);
  assert.equal(face.spoken.rectangular, 'วันนี้ 3 รายการ ยอดเงินซ่อนอยู่');
  assert.equal(face.spoken.gauge, 'งบเดือนนี้ ซ่อนอยู่');
  const faces = JSON.stringify(snapshot.entries.map((one) => [one.home, one.lock]));
  for (const amount of AMOUNTS) assert.equal(faces.includes(amount), false, amount);
});

test('over budget says เกินงบไป ฿420 and, masked, keeps the words', () => {
  const over = pace('2026-10-24', '1842000');
  const snapshot = build({ pace: over });
  const face = home(snapshot);
  assert.deepEqual([face.sideLabel, face.side, face.over, face.gaugeText, face.gaugeFraction], ['เกินงบไป', '฿420', true, '102%', 1]);
  assert.equal(face.spoken.rectangular, 'วันนี้ใช้ 132 บาท 3 รายการ เกินงบไป 420 บาท');
  assert.equal(face.spoken.inline, 'เกินงบไป 420 บาท');
  // Tomorrow is still over, by the same amount.
  const tomorrow = home(snapshot, 1);
  assert.deepEqual([tomorrow.sideLabel, tomorrow.side, tomorrow.over], ['เกินงบไป', '฿420', true]);
  const masked = home(build({ pace: over, hidden: true }));
  assert.deepEqual([masked.sideLabel, masked.side, masked.over], ['เกินงบไป', HIDDEN, true]);
  // Spent to the satang of the limit is not over: nothing is left a day.
  const level = home(build({ pace: pace('2026-10-24', LIMIT) }));
  assert.deepEqual([level.sideLabel, level.side, level.over, level.gaugeText], ['เหลือวันนี้', '≈ ฿0', false, '100%']);
});

test('no budget has no side line and no gauge figure', () => {
  for (const none of [null, pace('2026-10-24', '1336000', null)]) {
    const face = home(build({ pace: none }));
    assert.deepEqual([face.sideLabel, face.side, face.over, face.gaugeLabel, face.gaugeText, face.gaugeFraction], [null, null, false, 'งบ ต.ค.', null, null]);
    assert.deepEqual(face.spoken, { small: 'วันนี้ใช้ 132 บาท 3 รายการ', inline: 'วันนี้ใช้ 132 บาท 3 รายการ', gauge: 'ยังไม่ได้ตั้งงบ', rectangular: 'วันนี้ใช้ 132 บาท 3 รายการ' });
  }
  // A limit of zero (budgets.ts never accepts one) draws no figures rather than dividing by zero.
  const zero = home(build({ pace: pace('2026-10-24', '1336000', '0') }));
  assert.deepEqual([zero.sideLabel, zero.side, zero.gaugeText, zero.gaugeFraction], [null, null, null, null]);
});

test('after midnight the widget shows a new day with nothing logged', () => {
  const { handed, spoken } = spokenFake();
  const snapshot = build({ spoken });
  const next = entry(snapshot, 1);
  assert.deepEqual([next.from, next.day, next.kind, next.prompt], [Date.parse('2026-10-24T17:00:00Z'), '2026-10-25', 'today', null]);
  const face = home(snapshot, 1);
  // ฿4,640 left for 7 days from Sunday: 66,285 satang a day, shown as ฿662.
  assert.deepEqual(drawn(face), [false, 'ใช้วันนี้', '฿0', '0 รายการ', 'วันนี้ · 0 รายการ', 'เหลือวันนี้', '≈ ฿662', false, 'งบ ต.ค.', '74%', 0.742]);
  assert.equal(face.spoken.rectangular, 'วันนี้ใช้ 0 บาท 0 รายการ เหลือวันนี้ประมาณ 662 บาท');
  assert.deepEqual(lock(snapshot, 1), face);
  // VoiceOver is handed the whole baht the face shows, never its satang.
  assert.equal(handed.includes('66200'), true);
  assert.equal(handed.includes('66285'), false);
});

test('each face names its day', () => {
  const thai = build({ lockOn: true });
  assert.deepEqual([home(thai).dayLabel, lock(thai).dayLabel, home(thai, 1).dayLabel, lock(thai, 1).dayLabel], ['ส. 24', 'ส. 24', 'อา. 25', 'อา. 25']);
  const english = build({ locale: 'en' });
  assert.deepEqual([home(english).dayLabel, lock(english).dayLabel, home(english, 1).dayLabel], ['Sat 24', 'Sat 24', 'Sun 25']);
});

test("on the month's last evening the next entry drops the budget figures", () => {
  const evening = new Date('2026-10-31T13:00:00Z');
  for (const spent of ['1336000', '1842000']) {
    const snapshot = build({ now: evening, pace: pace('2026-10-31', spent) });
    assert.deepEqual([home(snapshot).gaugeLabel, home(snapshot).gaugeText !== null], ['งบ ต.ค.', true], spent);
    assert.equal(entry(snapshot, 1).day, '2026-11-01');
    const face = home(snapshot, 1);
    assert.deepEqual([face.dayLabel, face.sideLabel, face.side, face.over, face.gaugeLabel, face.gaugeText, face.gaugeFraction], ['อา. 1', null, null, false, 'งบ พ.ย.', null, null], spent);
    assert.equal(face.spoken.gauge, 'ยังไม่ได้ตั้งงบ', spent);
  }
  // The last day's own figure: all of what is left, for one day.
  assert.equal(home(build({ now: evening, pace: pace('2026-10-31', '1336000') })).side, '≈ ฿4,640');
});

test("a pace for another month draws no budget figures, so the 1st never shows last month's", () => {
  // 00:30 on Sunday 1 November in Bangkok, before Home has moved its pace to November.
  const snapshot = build({ now: new Date('2026-10-31T17:30:00Z'), pace: pace('2026-10-31', '1336000') });
  assert.equal(entry(snapshot, 0).day, '2026-11-01');
  for (const face of [home(snapshot), lock(snapshot), home(snapshot, 1)]) {
    assert.deepEqual([face.sideLabel, face.side, face.gaugeLabel, face.gaugeText, face.gaugeFraction], [null, null, 'งบ พ.ย.', null, null]);
  }
});

test('the second midnight asks to open Jotbun', () => {
  const snapshot = build();
  assert.equal(snapshot.entries.length, 3);
  assert.deepEqual(entry(snapshot, 2), { from: Date.parse('2026-10-25T17:00:00Z'), day: '2026-10-26', kind: 'stale', home: null, lock: null, prompt: 'เปิด Jotbun เพื่อดูยอดวันนี้' });
  assert.deepEqual([entry(snapshot, 0).from, entry(snapshot, 0).day, entry(snapshot, 0).kind, entry(snapshot, 0).prompt], [NOW.getTime(), '2026-10-24', 'today', null]);
});

test('nextBangkokMidnight is the next 00:00 in Bangkok, strictly after now', () => {
  const next = (iso: string) => new Date(nextBangkokMidnight(Date.parse(iso))).toISOString();
  assert.equal(next('2026-10-24T16:59:59.999Z'), '2026-10-24T17:00:00.000Z');
  assert.equal(next('2026-10-24T17:00:00.000Z'), '2026-10-25T17:00:00.000Z');
  assert.equal(next('2026-10-24T00:00:00.000Z'), '2026-10-24T17:00:00.000Z');
  assert.equal(next('2026-12-31T20:00:00.000Z'), '2027-01-01T17:00:00.000Z');
});

test('entryAt picks the newest started entry, else the first', () => {
  const snapshot = build();
  const [first, second, third] = [entry(snapshot, 0), entry(snapshot, 1), entry(snapshot, 2)];
  assert.equal(entryAt(snapshot, first.from - 60_000), first);
  assert.equal(entryAt(snapshot, first.from), first);
  assert.equal(entryAt(snapshot, second.from - 1), first);
  assert.equal(entryAt(snapshot, second.from), second);
  assert.equal(entryAt(snapshot, third.from - 1), second);
  assert.equal(entryAt(snapshot, third.from), third);
  assert.equal(entryAt(snapshot, third.from + 7 * 86_400_000), third);
});

test('faceFor gives system families the home face and accessory families the lock face', () => {
  const now = entry(build({ lockOn: true }), 0);
  assert.ok(now.home !== null && now.lock !== null && now.home.masked !== now.lock.masked);
  for (const family of ['systemSmall', 'systemMedium'] as const) assert.equal(faceFor(now, family), now.home, family);
  for (const family of ['accessoryInline', 'accessoryCircular', 'accessoryRectangular'] as const) assert.equal(faceFor(now, family), now.lock, family);
  assert.equal(faceFor(entry(build(), 2), 'systemSmall'), null);
});

test('Vietnamese reads the English lines', () => {
  const face = home(build({ locale: 'vi' }));
  assert.deepEqual([face.outLabel, face.gaugeLabel, face.count, face.today, face.sideLabel, face.dayLabel], ['Spent today', 'Oct budget', '3 records', 'Today · 3 records', 'Left today', 'Sat 24']);
  assert.equal(face.spoken.gauge, '74 percent of the October budget used');
  assert.equal(entry(build({ locale: 'vi' }), 2).prompt, "Open Jotbun to see today's spending");
});

test('a signed-out snapshot has no figures', () => {
  const snapshot = signedOutSnapshot(NOW, LINKS, tableT(OUTSIDE_DRAFT, 'th'));
  assert.deepEqual(snapshot.entries, [{ from: NOW.getTime(), day: '2026-10-24', kind: 'signed_out', home: null, lock: null, prompt: 'เปิด Jotbun เพื่อเริ่มจด' }]);
  assert.deepEqual([snapshot.v, Object.keys(snapshot)], [1, ['v', 'links', 'labels', 'entries']]);
  assert.equal(JSON.stringify(snapshot).includes('฿'), false);
});

test("sameSnapshot ignores only the first entry's time", () => {
  const at = (iso: string, input: Build = {}) => build({ now: new Date(iso), ...input });
  const eight = at('2026-10-24T13:00:00Z');
  assert.equal(sameSnapshot(eight, at('2026-10-24T13:30:00Z')), true);
  assert.equal(sameSnapshot(eight, eight), true);
  assert.equal(sameSnapshot(eight, at('2026-10-24T13:00:00Z', { todayCount: 4 })), false);
  assert.equal(sameSnapshot(eight, at('2026-10-24T13:00:00Z', { lockOn: true })), false);
  assert.equal(sameSnapshot(eight, at('2026-10-24T13:00:00Z', { links: { ...LINKS, scan: 'gogospend://outside/scan' } })), false);
  // The next morning's snapshot starts its later entries a day on.
  assert.equal(sameSnapshot(eight, at('2026-10-25T01:00:00Z', { pace: pace('2026-10-25', '1336000') })), false);
  const later = { ...eight, entries: eight.entries.map((one, index) => (index === 1 ? { ...one, from: one.from + 1 } : one)) };
  assert.equal(sameSnapshot(eight, later), false);
});

test("both snapshots carry the link words in the person's language", () => {
  const thai = { record: 'จดรายจ่าย', scan: 'สแกนสลิป', log: 'จด' };
  const english = { record: 'Add spending', scan: 'Scan a slip', log: 'Add' };
  for (const [locale, words] of [['th', thai], ['en', english], ['vi', english]] as const) {
    assert.deepEqual(build({ locale }).labels, words, locale);
    assert.deepEqual(signedOutSnapshot(NOW, LINKS, tableT(OUTSIDE_DRAFT, locale)).labels, words, `${locale} signed out`);
  }
  // The links are kept by name: nothing else the object carries is written.
  const carried = { ...LINKS, session: 'not a link' } as WidgetLinks;
  assert.deepEqual(build({ links: carried }).links, LINKS);
  assert.deepEqual(signedOutSnapshot(NOW, carried, tableT(OUTSIDE_DRAFT, 'th')).links, LINKS);
});
