import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DAILY_REMINDER_ID, createLocalReminderService } from './reminders.ts';
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
  return { store: { load: async () => saved, save: async (preference: ReminderPreference) => void (saved = preference) }, saved: () => saved };
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
