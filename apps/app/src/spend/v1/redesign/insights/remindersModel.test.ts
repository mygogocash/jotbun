import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Weekday } from '../../../../notifications/reminders.ts';
import {
  MINUTE_STEP, REMINDER_HOURS, REMINDER_MINUTES, WEEK, daysSummary, formatTime, isoWeekday, previewDay, splitTime, toggleDay, weekdayNames, weekdayTag, withHour, withMinute,
} from './remindersModel.ts';

test('the time is HH:MM, chosen as an hour 00-23 and a minute in 5-minute steps', () => {
  assert.equal(MINUTE_STEP, 5);
  assert.deepEqual(REMINDER_MINUTES, [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
  assert.deepEqual(REMINDER_HOURS, Array.from({ length: 24 }, (_, hour) => hour));
  assert.equal(formatTime(7, 5), '07:05');
  assert.equal(formatTime(0, 0), '00:00');
  assert.deepEqual(splitTime('20:30'), { hour: 20, minute: 30 });
  assert.equal(withHour('20:30', 7), '07:30');
  assert.equal(withMinute('07:30', 45), '07:45');
  // A time saved off the 5-minute steps (by S4) keeps its minute until one is picked.
  assert.equal(withHour('20:03', 6), '06:03');
  assert.throws(() => splitTime('7:30'), RangeError);
  assert.throws(() => withMinute('20:00', 7), RangeError);
  assert.throws(() => withHour('20:00', 24), RangeError);
});

test('the week runs Monday first', () => {
  assert.deepEqual(WEEK, [1, 2, 3, 4, 5, 6, 7]);
});

test("weekday names come from the locale's Intl data, Monday first", () => {
  assert.equal(weekdayTag('th'), 'th-TH');
  assert.equal(weekdayTag('vi'), 'vi-VN');
  assert.equal(weekdayTag('en'), 'en-GB');
  const en = weekdayNames('en');
  assert.deepEqual(en.map((name) => name.day), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(en.map((name) => name.long), ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
  assert.deepEqual(en.map((name) => name.short), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  const th = weekdayNames('th');
  assert.deepEqual(th.map((name) => name.long), ['วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์', 'วันอาทิตย์']);
  assert.deepEqual(th.map((name) => name.narrow), ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']);
  assert.deepEqual(weekdayNames('vi').map((name) => name.long), ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật']);
  for (const locale of ['en', 'th', 'vi']) {
    for (const name of weekdayNames(locale)) assert.ok(name.narrow.length > 0 && name.short.length > 0 && name.long.length > 0);
  }
});

test('a day turns on or off, kept Monday first; the last chosen day stays chosen', () => {
  assert.deepEqual(toggleDay([1, 2, 3, 4, 5, 6, 7], 6), { weekdays: [1, 2, 3, 4, 5, 7], kept: false });
  assert.deepEqual(toggleDay([5, 1], 3), { weekdays: [1, 3, 5], kept: false });
  assert.deepEqual(toggleDay([3], 3), { weekdays: [3], kept: true });
  assert.deepEqual(toggleDay([3], 4), { weekdays: [3, 4], kept: false });
});

test('the days in words: every day, weekdays, weekends, or the short names in order', () => {
  assert.deepEqual(daysSummary([1, 2, 3, 4, 5, 6, 7], weekdayNames('en')), { kind: 'every_day' });
  assert.deepEqual(daysSummary([1, 2, 3, 4, 5], weekdayNames('en')), { kind: 'weekdays' });
  assert.deepEqual(daysSummary([6, 7], weekdayNames('en')), { kind: 'weekends' });
  assert.deepEqual(daysSummary([5, 1, 3] as Weekday[], weekdayNames('en')), { kind: 'some', text: 'Mon, Wed, Fri' });
  assert.deepEqual(daysSummary([7], weekdayNames('th')), { kind: 'some', text: 'อาทิตย์' });
  assert.deepEqual(daysSummary([1, 2, 3, 4, 6], weekdayNames('en')), { kind: 'some', text: 'Mon, Tue, Wed, Thu, Sat' });
});

test("a date's ISO weekday is read on the phone's own calendar, Monday = 1 to Sunday = 7", () => {
  // Local dates, as the phone's clock gives them: 26 October 2026 is a Monday.
  assert.deepEqual([26, 27, 28, 29, 30, 31].map((date) => isoWeekday(new Date(2026, 9, date, 21, 0))), [1, 2, 3, 4, 5, 6]);
  assert.equal(isoWeekday(new Date(2026, 10, 1, 0, 5)), 7);
});

test("the preview shows the next reminder the person gets: today's when chosen, else the next chosen day", () => {
  assert.equal(previewDay(WEEK, 2), 2);
  assert.equal(previewDay([1, 3, 5], 2), 3);
  assert.equal(previewDay([1, 3, 5], 5), 5);
  assert.equal(previewDay([1, 3, 5], 6), 1);
  assert.equal(previewDay([3], 2), 3);
  assert.equal(previewDay([6, 7], 1), 6);
  assert.equal(previewDay([1], 7), 1);
  for (const today of WEEK) for (const days of [[1], [2, 4], [6, 7], [1, 2, 3, 4, 5], WEEK] as Weekday[][]) assert.ok(days.includes(previewDay(days, today)));
});
