// The web preview has no local reminders: the service says so, gracefully.
import { EVERY_DAY, createLocalReminderService } from './reminders.ts';
import type { LocalReminderService, ReminderContent, StoredReminderPreference, Weekday } from './reminders.ts';

export function createDeviceReminderService(content: (day: Weekday) => ReminderContent, context: () => string = () => '', _channelName: () => string = () => ''): LocalReminderService {
  let saved: StoredReminderPreference = { enabled: false, localTime: '20:00', weekdays: EVERY_DAY };
  return createLocalReminderService(
    {
      supported: false,
      permission: async () => 'denied',
      requestPermission: async () => 'denied',
      cancel: async () => undefined,
      scheduleWeekly: async () => undefined,
    },
    { load: async () => saved, save: async (preference) => void (saved = preference), loadScheduledFor: async () => null, saveScheduledFor: async () => undefined },
    content,
    context,
  );
}
