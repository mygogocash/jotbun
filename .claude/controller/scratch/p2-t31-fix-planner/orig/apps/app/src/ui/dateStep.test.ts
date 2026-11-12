import assert from 'node:assert/strict';
import { test } from 'node:test';

import { canStepBack, canStepForward, dayLabel, displayYear, fullDateLabel, isCalendarDate, monthLabel, stepDate, stepDay, weekdayInitials } from './dateStep.ts';

test('steps one day across month and year ends', () => {
  assert.equal(stepDate('2026-10-17', 1), '2026-10-18');
  assert.equal(stepDate('2026-10-18', -1), '2026-10-17');
  assert.equal(stepDate('2026-01-31', 1), '2026-02-01');
  assert.equal(stepDate('2026-03-01', -1), '2026-02-28');
  assert.equal(stepDate('2026-04-30', 1), '2026-05-01');
  assert.equal(stepDate('2026-05-01', -1), '2026-04-30');
  assert.equal(stepDate('2026-12-31', 1), '2027-01-01');
  assert.equal(stepDate('2027-01-01', -1), '2026-12-31');
});

test('leap days follow the Gregorian rules', () => {
  assert.equal(stepDate('2028-02-28', 1), '2028-02-29');
  assert.equal(stepDate('2028-02-29', 1), '2028-03-01');
  assert.equal(stepDate('2028-03-01', -1), '2028-02-29');
  assert.equal(stepDate('2000-02-28', 1), '2000-02-29');
  assert.equal(stepDate('2100-02-28', 1), '2100-03-01');
  assert.equal(stepDate('2100-03-01', -1), '2100-02-28');
});

test('only real YYYY-MM-DD dates are accepted', () => {
  assert.equal(isCalendarDate('2028-02-29'), true);
  for (const bad of ['2026-02-29', '2026-02-30', '2026-13-01', '2026-00-10', '2026-1-1', '26-01-01', '', '2026-10-18T00:00:00Z', 20261018]) {
    assert.equal(isCalendarDate(bad), false, String(bad));
  }
  assert.throws(() => stepDate('2026-02-30', 1), TypeError);
  assert.throws(() => dayLabel('2026-02-30', '2026-10-18', 'en'), TypeError);
});

test('never steps into the future', () => {
  const today = '2026-10-18';
  assert.equal(canStepForward(today, today), false);
  assert.equal(canStepForward('2026-10-17', today), true);
  assert.equal(stepDay(today, 1, { today }), null);
  assert.equal(stepDay('2026-10-17', 1, { today }), today);
  assert.equal(stepDay('2026-10-17', -1, { today }), '2026-10-16');
  // A date already past today (a clock change) can only come back towards today.
  assert.equal(canStepForward('2026-10-20', today), false);
  assert.equal(stepDay('2026-10-20', 1, { today }), null);
  assert.equal(stepDay('2026-10-20', -1, { today }), '2026-10-19');
  // Across a month end into today, then no further.
  assert.equal(stepDay('2026-09-30', 1, { today: '2026-10-01' }), '2026-10-01');
  assert.equal(stepDay('2026-10-01', 1, { today: '2026-10-01' }), null);
  // Across a leap day into today.
  assert.equal(stepDay('2028-02-29', 1, { today: '2028-03-01' }), '2028-03-01');
  assert.equal(stepDay('2028-03-01', 1, { today: '2028-03-01' }), null);
});

test('never steps before the earliest date (the wallet tracking start, or 1970)', () => {
  assert.equal(canStepBack('1970-01-01'), false);
  assert.equal(canStepBack('1970-01-02'), true);
  assert.equal(stepDay('1970-01-01', -1, { today: '2026-10-18' }), null);
  assert.equal(canStepBack('2026-09-01', '2026-09-01'), false);
  assert.equal(stepDay('2026-09-01', -1, { today: '2026-10-18', earliest: '2026-09-01' }), null);
  assert.equal(stepDay('2026-09-02', -1, { today: '2026-10-18', earliest: '2026-09-01' }), '2026-09-01');
});

test('Today and Yesterday in English, Thai and Vietnamese', () => {
  const today = '2026-10-18';
  assert.deepEqual(dayLabel(today, today, 'en'), { kind: 'today', text: 'Today' });
  assert.deepEqual(dayLabel(today, today, 'th'), { kind: 'today', text: 'วันนี้' });
  assert.deepEqual(dayLabel(today, today, 'vi'), { kind: 'today', text: 'Hôm nay' });
  assert.deepEqual(dayLabel('2026-10-17', today, 'en'), { kind: 'yesterday', text: 'Yesterday' });
  assert.deepEqual(dayLabel('2026-10-17', today, 'th'), { kind: 'yesterday', text: 'เมื่อวาน' });
  assert.deepEqual(dayLabel('2026-10-17', today, 'vi'), { kind: 'yesterday', text: 'Hôm qua' });
  // Yesterday across a year end and a leap day.
  assert.equal(dayLabel('2026-12-31', '2027-01-01', 'en').kind, 'yesterday');
  assert.equal(dayLabel('2028-02-29', '2028-03-01', 'en').kind, 'yesterday');
  assert.equal(dayLabel('2026-02-28', '2026-03-01', 'en').kind, 'yesterday');
});

test('other days are written out, with the year only when it is not this year', () => {
  const today = '2026-10-18';
  assert.deepEqual(dayLabel('2026-10-15', today, 'en'), { kind: 'date', text: 'Thu 15 Oct' });
  assert.equal(dayLabel('2026-10-15', today, 'th').text, 'พฤหัส 15 ต.ค.');
  assert.equal(dayLabel('2026-10-15', today, 'vi').text, 'Thứ 5, 15 thg 10');
  assert.equal(dayLabel('2025-12-31', today, 'en').text, 'Wed 31 Dec 2025');
  assert.equal(dayLabel('2025-12-31', today, 'vi').text, 'Thứ 4, 31 thg 12, 2025');
  assert.equal(dayLabel('2026-10-18', '2026-10-20', 'en').text, 'Sun 18 Oct');
});

test('Thai dates show Buddhist-era years', () => {
  assert.equal(displayYear(2026, 'th'), 2569);
  assert.equal(displayYear(2026, 'en'), 2026);
  assert.equal(displayYear(2026, 'vi'), 2026);
  assert.equal(dayLabel('2025-12-31', '2026-10-18', 'th').text, 'พุธ 31 ธ.ค. 2568');
  assert.equal(fullDateLabel('2026-10-17', 'th'), 'วันเสาร์ที่ 17 ตุลาคม 2569');
  assert.equal(fullDateLabel('2028-02-29', 'th'), 'วันอังคารที่ 29 กุมภาพันธ์ 2571');
  assert.equal(monthLabel('2026-10', 'th'), 'ตุลาคม 2569');
  assert.equal(monthLabel('2027-01', 'th'), 'มกราคม 2570');
});

test('full dates and month names in English and Vietnamese keep the Gregorian year', () => {
  assert.equal(fullDateLabel('2026-10-17', 'en'), 'Saturday 17 October 2026');
  assert.equal(fullDateLabel('2026-10-17', 'vi'), 'Thứ Bảy, 17 tháng 10, 2026');
  assert.equal(fullDateLabel('2026-10-18', 'vi'), 'Chủ Nhật, 18 tháng 10, 2026');
  assert.equal(fullDateLabel('2028-02-29', 'en'), 'Tuesday 29 February 2028');
  assert.equal(monthLabel('2026-10', 'en'), 'October 2026');
  assert.equal(monthLabel('2026-10', 'vi'), 'Tháng 10 năm 2026');
  assert.throws(() => monthLabel('2026-13', 'en'), TypeError);
});

test('weekday initials run Sunday first in each language', () => {
  assert.deepEqual(weekdayInitials('en'), ['S', 'M', 'T', 'W', 'T', 'F', 'S']);
  assert.deepEqual(weekdayInitials('th'), ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']);
  assert.deepEqual(weekdayInitials('vi'), ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']);
});
