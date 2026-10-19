import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createNotificationsPort } from './notificationsPort.ts';
import type { NotificationsApi } from './notificationsPort.ts';
import { createDeviceReminderService as createWebReminderService } from './localReminders.web.ts';
import { DAILY_REMINDER_ID, EVERY_DAY, WEEKLY_REMINDER_IDS, createLocalReminderService, readPermission } from './reminders.ts';
import type { ReminderPort, ReminderPreference, StoredReminderPreference, Weekday } from './reminders.ts';

/**
 * The OS's pending reminders, by identifier: scheduling an identifier again
 * replaces it, as iOS and Android do, so a reminder under a NEW identifier is
 * a second reminder (a duplicate the person would get twice).
 */
function fakePort(permission: 'granted' | 'denied' | 'undetermined', answer: 'granted' | 'denied' = 'granted', supported = true) {
  const scheduled = new Map<string, { hour: number; minute: number; title: string; weekday?: Weekday }>();
  const calls = { requests: 0, cancelled: [] as string[] };
  let current = permission;
  const port: ReminderPort = {
    supported,
    permission: async () => current,
    requestPermission: async () => {
      calls.requests += 1;
      current = answer;
      return answer;
    },
    cancel: async (id) => {
      calls.cancelled.push(id);
      scheduled.delete(id);
    },
    scheduleDaily: async (id, hour, minute, content) => void scheduled.set(id, { hour, minute, title: content.title }),
    scheduleWeekly: async (id, weekday, hour, minute, content) => void scheduled.set(id, { weekday, hour, minute, title: content.title }),
  };
  return { port, scheduled, calls };
}

function memoryPreferences(initial: StoredReminderPreference | null = null) {
  let saved: StoredReminderPreference | null = initial;
  let scheduledFor: string | null = null;
  return {
    store: {
      load: async () => saved,
      save: async (preference: ReminderPreference) => void (saved = preference),
      loadScheduledFor: async () => scheduledFor,
      saveScheduledFor: async (context: string | null) => void (scheduledFor = context),
    },
    saved: () => saved,
  };
}

const ALL: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7];

test('turning reminders on asks once, then schedules exactly one daily reminder at the local time', async () => {
  const { port, scheduled, calls } = fakePort('undetermined');
  const prefs = memoryPreferences();
  let language = 'en';
  const service = createLocalReminderService(port, prefs.store, () => ({ title: language === 'th' ? 'บันทึกรายจ่ายวันนี้' : "Log today's spending", body: '' }));
  assert.equal(await service.setPreference({ enabled: true, localTime: '20:30' }), 'scheduled');
  assert.equal(calls.requests, 1);
  assert.deepEqual([...scheduled.entries()], [[DAILY_REMINDER_ID, { hour: 20, minute: 30, title: "Log today's spending" }]]);
  // A new time replaces the reminder; a locale change re-schedules it in the new language, never duplicating.
  assert.equal(await service.setPreference({ enabled: true, localTime: '07:05' }), 'scheduled');
  language = 'th';
  assert.equal(await service.reschedule(), 'scheduled');
  assert.deepEqual([...scheduled.entries()], [[DAILY_REMINDER_ID, { hour: 7, minute: 5, title: 'บันทึกรายจ่ายวันนี้' }]]);
  assert.equal(calls.requests, 1);
  assert.equal(await service.setPreference({ enabled: false, localTime: '07:05' }), 'disabled');
  assert.equal(scheduled.size, 0);
  assert.deepEqual(await service.getPreference(), { enabled: false, localTime: '07:05', weekdays: ALL });
});

test('a denied permission is a settled, usable state: off, nothing scheduled, no retry loop', async () => {
  const { port, scheduled, calls } = fakePort('undetermined', 'denied');
  const prefs = memoryPreferences();
  const service = createLocalReminderService(port, prefs.store, () => ({ title: 't', body: '' }));
  assert.equal(await service.setPreference({ enabled: true, localTime: '20:00' }), 'denied');
  assert.equal(scheduled.size, 0);
  assert.deepEqual(prefs.saved(), { enabled: false, localTime: '20:00', weekdays: ALL });
  assert.equal(await service.reschedule(), 'disabled');
  assert.equal(calls.requests, 1);
  // Already denied: asking again would only fail silently, so it reports denied without a prompt loop.
  const denied = fakePort('denied');
  assert.equal(await createLocalReminderService(denied.port, memoryPreferences().store, () => ({ title: 't', body: '' })).setPreference({ enabled: true, localTime: '20:00' }), 'denied');
  assert.equal(denied.calls.requests, 0);
});

test('unsupported platforms (web) say so; bad times are refused', async () => {
  const { port } = fakePort('granted', 'granted', false);
  const service = createLocalReminderService(port, memoryPreferences().store, () => ({ title: 't', body: '' }));
  assert.equal(await service.setPreference({ enabled: true, localTime: '20:00' }), 'unsupported');
  const ok = createLocalReminderService(fakePort('granted').port, memoryPreferences().store, () => ({ title: 't', body: '' }));
  for (const time of ['24:00', '7:00', '20:60', '']) await assert.rejects(ok.setPreference({ enabled: true, localTime: time }), RangeError);
});

test('a time zone or language change re-schedules the one reminder once; no change does nothing', async () => {
  const { port, scheduled } = fakePort('granted');
  let schedules = 0;
  const counting = { ...port, scheduleDaily: async (...args: Parameters<typeof port.scheduleDaily>) => ((schedules += 1), port.scheduleDaily(...args)) };
  let zone = 'Asia/Bangkok';
  let language = 'en';
  const service = createLocalReminderService(counting, memoryPreferences().store, () => ({ title: language, body: '' }), () => `${zone}|${language}`);
  assert.equal(await service.refresh(), 'disabled');
  await service.setPreference({ enabled: true, localTime: '20:00' });
  assert.equal(await service.refresh(), 'unchanged');
  assert.equal(schedules, 1);
  language = 'th';
  assert.equal(await service.refresh(), 'scheduled');
  zone = 'Europe/London';
  assert.equal(await service.refresh(), 'scheduled');
  assert.equal(await service.refresh(), 'unchanged');
  assert.equal(schedules, 3);
  assert.deepEqual([...scheduled.values()], [{ hour: 20, minute: 0, title: 'th' }]);
});

test('provisional iOS delivery counts as granted; a denial the OS still allows is asked again only on opt-in', () => {
  assert.equal(readPermission({ granted: false, status: 'undetermined', canAskAgain: true, provisional: true }), 'granted');
  assert.equal(readPermission({ granted: true, status: 'granted', canAskAgain: true, provisional: false }), 'granted');
  assert.equal(readPermission({ granted: false, status: 'undetermined', canAskAgain: true, provisional: false }), 'undetermined');
  assert.equal(readPermission({ granted: false, status: 'denied', canAskAgain: true, provisional: false }), 'undetermined');
  assert.equal(readPermission({ granted: false, status: 'denied', canAskAgain: false, provisional: false }), 'denied');
  assert.equal(readPermission({ granted: false, status: 'undetermined', canAskAgain: false, provisional: false }), 'denied');
});

function fakeNotifications() {
  const calls: unknown[][] = [];
  const api: NotificationsApi = {
    getPermissionsAsync: async () => ({ granted: false, status: 'undetermined', canAskAgain: true, ios: { status: 3 } }),
    requestPermissionsAsync: async (request) => (calls.push(['request', request]), { granted: true, status: 'granted', canAskAgain: true }),
    cancelScheduledNotificationAsync: async (id) => void calls.push(['cancel', id]),
    scheduleNotificationAsync: async (request) => (calls.push(['schedule', request]), 'id'),
    setNotificationChannelAsync: async (id, channel) => (calls.push(['channel', id, channel]), null),
  };
  return { api, calls };
}

test('on Android the reminder has its own notification channel; on iOS quiet (provisional) delivery is asked for', async () => {
  const android = fakeNotifications();
  const androidPort = createNotificationsPort(android.api, 'android', () => 'Daily reminder');
  await androidPort.scheduleDaily(DAILY_REMINDER_ID, 20, 0, { title: 't', body: 'b' });
  assert.deepEqual(android.calls[0]?.slice(0, 2), ['channel', 'daily-reminder']);
  assert.equal(((android.calls[1]?.[1] as { trigger: { channelId?: string } }).trigger).channelId, 'daily-reminder');
  const ios = fakeNotifications();
  const iosPort = createNotificationsPort(ios.api, 'ios', () => 'Daily reminder');
  assert.equal(await iosPort.permission(), 'granted');
  await iosPort.requestPermission();
  assert.deepEqual(ios.calls[0], ['request', { ios: { allowAlert: true, allowBadge: false, allowSound: true, allowProvisional: true } }]);
  assert.ok(!ios.calls.some((call) => call[0] === 'channel'));
});

// ---------------------------------------------------------------------------
// Weekdays (R5 Reminders): ISO weekdays, Monday = 1 … Sunday = 7.

const ids = (scheduled: Map<string, unknown>) => [...scheduled.keys()].sort();

test('a stored preference without weekdays (S4) reads as every day and keeps its one daily reminder', async () => {
  const { port, scheduled } = fakePort('granted');
  const prefs = memoryPreferences({ enabled: true, localTime: '20:00' });
  const service = createLocalReminderService(port, prefs.store, () => ({ title: 't', body: '' }), () => 'Asia/Bangkok|en');
  assert.deepEqual(EVERY_DAY, ALL);
  assert.deepEqual(await service.getPreference(), { enabled: true, localTime: '20:00', weekdays: ALL });
  assert.equal(await service.refresh(), 'scheduled');
  assert.deepEqual([...scheduled.entries()], [[DAILY_REMINDER_ID, { hour: 20, minute: 0, title: 't' }]]);
  // Damaged days read as every day too, never as none.
  for (const weekdays of [[], [0, 8], 'mon', null]) {
    const damaged = createLocalReminderService(port, memoryPreferences({ enabled: true, localTime: '20:00', weekdays } as StoredReminderPreference).store, () => ({ title: 't', body: '' }));
    assert.deepEqual((await damaged.getPreference()).weekdays, ALL);
  }
});

test('chosen days: one weekly reminder per day under its own fixed id; every day stays one daily reminder', async () => {
  const { port, scheduled, calls } = fakePort('undetermined');
  const prefs = memoryPreferences();
  const service = createLocalReminderService(port, prefs.store, () => ({ title: 't', body: '' }));
  assert.equal(await service.setPreference({ enabled: true, localTime: '07:30', weekdays: [5, 1, 3, 3] }), 'scheduled');
  assert.deepEqual(ids(scheduled), [WEEKLY_REMINDER_IDS[5], WEEKLY_REMINDER_IDS[1], WEEKLY_REMINDER_IDS[3]].sort());
  assert.deepEqual(scheduled.get(WEEKLY_REMINDER_IDS[1]), { weekday: 1, hour: 7, minute: 30, title: 't' });
  assert.deepEqual(scheduled.get(WEEKLY_REMINDER_IDS[5]), { weekday: 5, hour: 7, minute: 30, title: 't' });
  // Stored sorted and without repeats, Monday first.
  assert.deepEqual(prefs.saved(), { enabled: true, localTime: '07:30', weekdays: [1, 3, 5] });
  assert.deepEqual(await service.getPreference(), { enabled: true, localTime: '07:30', weekdays: [1, 3, 5] });

  // Every day: the daily reminder, and no weekly one is left behind.
  assert.equal(await service.setPreference({ enabled: true, localTime: '07:30', weekdays: [7, 6, 5, 4, 3, 2, 1] }), 'scheduled');
  assert.deepEqual(ids(scheduled), [DAILY_REMINDER_ID]);

  // The weekend only: the daily reminder goes, Saturday and Sunday come.
  assert.equal(await service.setPreference({ enabled: true, localTime: '09:00', weekdays: [6, 7] }), 'scheduled');
  assert.deepEqual(ids(scheduled), [WEEKLY_REMINDER_IDS[6], WEEKLY_REMINDER_IDS[7]].sort());
  assert.equal(calls.requests, 1);

  // The fixed ids: seven distinct weekly ids, none of them the daily one.
  assert.equal(new Set([...Object.values(WEEKLY_REMINDER_IDS), DAILY_REMINDER_ID]).size, 8);
});

test('a new time, days, time zone or language replaces the weekly reminders and never adds a second', async () => {
  const { port, scheduled } = fakePort('granted');
  let zone = 'Asia/Bangkok';
  let language = 'en';
  const service = createLocalReminderService(port, memoryPreferences().store, () => ({ title: language, body: '' }), () => `${zone}|${language}`);
  await service.setPreference({ enabled: true, localTime: '20:00', weekdays: [1, 2, 3, 4, 5] });
  assert.equal(scheduled.size, 5);
  await service.setPreference({ enabled: true, localTime: '21:15', weekdays: [1, 2, 3, 4, 5] });
  assert.equal(scheduled.size, 5);
  assert.ok([...scheduled.values()].every((reminder) => reminder.hour === 21 && reminder.minute === 15));
  await service.setPreference({ enabled: true, localTime: '21:15', weekdays: [2, 4] });
  assert.deepEqual(ids(scheduled), [WEEKLY_REMINDER_IDS[2], WEEKLY_REMINDER_IDS[4]].sort());
  language = 'th';
  assert.equal(await service.refresh(), 'scheduled');
  zone = 'Europe/London';
  assert.equal(await service.refresh(), 'scheduled');
  assert.equal(await service.refresh(), 'unchanged');
  assert.deepEqual([...scheduled.values()].map((reminder) => [reminder.weekday, reminder.title]).sort(), [[2, 'th'], [4, 'th']]);
});

test('turning reminders off or a denial cancels every reminder, daily and weekly, and keeps the chosen days', async () => {
  const { port, scheduled, calls } = fakePort('granted');
  const prefs = memoryPreferences();
  const service = createLocalReminderService(port, prefs.store, () => ({ title: 't', body: '' }));
  await service.setPreference({ enabled: true, localTime: '20:00', weekdays: [1, 3] });
  calls.cancelled.length = 0;
  assert.equal(await service.setPreference({ enabled: false, localTime: '20:00', weekdays: [1, 3] }), 'disabled');
  assert.equal(scheduled.size, 0);
  assert.deepEqual([...calls.cancelled].sort(), [DAILY_REMINDER_ID, ...Object.values(WEEKLY_REMINDER_IDS)].sort());
  assert.deepEqual(prefs.saved(), { enabled: false, localTime: '20:00', weekdays: [1, 3] });

  // Asked once, denied: settled off with the days kept, nothing scheduled, no second prompt.
  const denying = fakePort('undetermined', 'denied');
  const kept = memoryPreferences();
  const denied = createLocalReminderService(denying.port, kept.store, () => ({ title: 't', body: '' }));
  assert.equal(await denied.setPreference({ enabled: true, localTime: '07:00', weekdays: [6, 7] }), 'denied');
  assert.equal(await denied.setPreference({ enabled: true, localTime: '07:00', weekdays: [6, 7] }), 'denied');
  assert.equal(denying.calls.requests, 1);
  assert.equal(denying.scheduled.size, 0);
  assert.deepEqual(kept.saved(), { enabled: false, localTime: '07:00', weekdays: [6, 7] });

  // Permission withdrawn in Settings later: the next refresh cancels every reminder and settles off.
  const withdrawn = fakePort('granted');
  const later = memoryPreferences();
  await createLocalReminderService(withdrawn.port, later.store, () => ({ title: 't', body: '' }), () => 'zone').setPreference({ enabled: true, localTime: '07:00', weekdays: [2, 4] });
  assert.equal(withdrawn.scheduled.size, 2);
  const revoked: ReminderPort = { ...withdrawn.port, permission: async () => 'denied' };
  assert.equal(await createLocalReminderService(revoked, later.store, () => ({ title: 't', body: '' }), () => 'other zone').refresh(), 'denied');
  assert.equal(withdrawn.scheduled.size, 0);
  assert.deepEqual(later.saved(), { enabled: false, localTime: '07:00', weekdays: [2, 4] });
});

test('at least one day must stay chosen; only the days 1 (Monday) to 7 (Sunday) are accepted', async () => {
  const { port, scheduled, calls } = fakePort('undetermined');
  const service = createLocalReminderService(port, memoryPreferences().store, () => ({ title: 't', body: '' }));
  for (const weekdays of [[], [0], [8], [1.5], [-1]] as unknown as Weekday[][]) {
    await assert.rejects(service.setPreference({ enabled: true, localTime: '20:00', weekdays }), RangeError);
    await assert.rejects(service.setPreference({ enabled: false, localTime: '20:00', weekdays }), RangeError);
  }
  assert.equal(calls.requests, 0);
  assert.equal(scheduled.size, 0);
  // Left out, the days are every day (the S4 callers).
  assert.equal(await service.setPreference({ enabled: true, localTime: '20:00' }), 'scheduled');
  assert.deepEqual(ids(scheduled), [DAILY_REMINDER_ID]);
});

test('the service says whether the platform can remind at all', () => {
  assert.equal(createLocalReminderService(fakePort('granted').port, memoryPreferences().store, () => ({ title: 't', body: '' })).supported, true);
  assert.equal(createLocalReminderService(fakePort('granted', 'granted', false).port, memoryPreferences().store, () => ({ title: 't', body: '' })).supported, false);
});

test('the web stub has no reminders: unsupported, with every day by default', async () => {
  const web = createWebReminderService(() => ({ title: 't', body: '' }));
  assert.equal(web.supported, false);
  assert.deepEqual(await web.getPreference(), { enabled: false, localTime: '20:00', weekdays: ALL });
  assert.equal(await web.setPreference({ enabled: true, localTime: '07:00', weekdays: [1] }), 'unsupported');
  assert.equal(await web.setPreference({ enabled: false, localTime: '07:00', weekdays: [1] }), 'disabled');
  assert.deepEqual(await web.getPreference(), { enabled: false, localTime: '07:00', weekdays: [1] });
});

test('a weekly reminder is an expo-notifications weekly trigger, counted from Sunday = 1, on the Android channel', async () => {
  const android = fakeNotifications();
  const androidPort = createNotificationsPort(android.api, 'android', () => 'Daily reminder');
  await androidPort.scheduleWeekly(WEEKLY_REMINDER_IDS[1], 1, 7, 30, { title: 't', body: 'b' });
  assert.deepEqual(android.calls[0]?.slice(0, 2), ['channel', 'daily-reminder']);
  assert.deepEqual(android.calls[1], ['schedule', {
    identifier: WEEKLY_REMINDER_IDS[1],
    content: { title: 't', body: 'b' },
    trigger: { type: 'weekly', weekday: 2, hour: 7, minute: 30, channelId: 'daily-reminder' },
  }]);
  const ios = fakeNotifications();
  const iosPort = createNotificationsPort(ios.api, 'ios', () => 'Daily reminder');
  const sent: unknown[] = [];
  for (const day of ALL) {
    await iosPort.scheduleWeekly(WEEKLY_REMINDER_IDS[day], day, 20, 0, { title: 't', body: 'b' });
    sent.push((ios.calls.at(-1)?.[1] as { trigger: unknown }).trigger);
  }
  // Monday … Saturday are 2 … 7 and Sunday is 1 in expo-notifications (as in the iOS and Android calendars).
  assert.deepEqual(sent.map((trigger) => (trigger as { weekday: number }).weekday), [2, 3, 4, 5, 6, 7, 1]);
  assert.deepEqual(sent[6], { type: 'weekly', weekday: 1, hour: 20, minute: 0 });
  assert.ok(!ios.calls.some((call) => call[0] === 'channel'));
});
