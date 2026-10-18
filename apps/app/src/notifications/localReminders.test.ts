import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createNotificationsPort } from './notificationsPort.ts';
import type { NotificationsApi } from './notificationsPort.ts';
import { DAILY_REMINDER_ID, createLocalReminderService, readPermission } from './reminders.ts';
import type { ReminderPort, ReminderPreference } from './reminders.ts';

function fakePort(permission: 'granted' | 'denied' | 'undetermined', answer: 'granted' | 'denied' = 'granted', supported = true) {
  const scheduled = new Map<string, { hour: number; minute: number; title: string }>();
  const calls = { requests: 0 };
  let current = permission;
  const port: ReminderPort = {
    supported,
    permission: async () => current,
    requestPermission: async () => {
      calls.requests += 1;
      current = answer;
      return answer;
    },
    cancel: async (id) => void scheduled.delete(id),
    scheduleDaily: async (id, hour, minute, content) => void scheduled.set(id, { hour, minute, title: content.title }),
  };
  return { port, scheduled, calls };
}

function memoryPreferences() {
  let saved: ReminderPreference | null = null;
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
  assert.deepEqual(await service.getPreference(), { enabled: false, localTime: '07:05' });
});

test('a denied permission is a settled, usable state: off, nothing scheduled, no retry loop', async () => {
  const { port, scheduled, calls } = fakePort('undetermined', 'denied');
  const prefs = memoryPreferences();
  const service = createLocalReminderService(port, prefs.store, () => ({ title: 't', body: '' }));
  assert.equal(await service.setPreference({ enabled: true, localTime: '20:00' }), 'denied');
  assert.equal(scheduled.size, 0);
  assert.deepEqual(prefs.saved(), { enabled: false, localTime: '20:00' });
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
