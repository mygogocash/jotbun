// The web preview has no local reminders: the service says so, gracefully.
import { createLocalReminderService } from './reminders.ts';
import type { LocalReminderService, ReminderContent } from './reminders.ts';

export function createDeviceReminderService(content: () => ReminderContent): LocalReminderService {
  let saved = { enabled: false, localTime: '20:00' };
  return createLocalReminderService(
    {
      supported: false,
      permission: async () => 'denied',
      requestPermission: async () => 'denied',
      cancel: async () => undefined,
      scheduleDaily: async () => undefined,
    },
    { load: async () => saved, save: async (preference) => void (saved = preference) },
    content,
  );
}
