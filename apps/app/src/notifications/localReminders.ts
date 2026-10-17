// The device's local reminder (expo-notifications; no push backend). Metro
// uses localReminders.web.ts on the web, which reports reminders unsupported.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { createNotificationsPort } from './notificationsPort.ts';
import { createLocalReminderService } from './reminders.ts';
import type { LocalReminderService, ReminderContent, ReminderPreference } from './reminders.ts';

const PREFERENCE_KEY = 'gogospend.reminder.v1';
const SCHEDULED_FOR_KEY = 'gogospend.reminder.scheduled-for.v1';

/**
 * `context` names the device time zone and language the reminder is written
 * for; `refresh()` re-schedules when it changes.
 */
export function createDeviceReminderService(content: () => ReminderContent, context: () => string, channelName: () => string): LocalReminderService {
  const port = createNotificationsPort(
    {
      getPermissionsAsync: () => Notifications.getPermissionsAsync(),
      requestPermissionsAsync: (request) => Notifications.requestPermissionsAsync(request),
      cancelScheduledNotificationAsync: (id) => Notifications.cancelScheduledNotificationAsync(id),
      scheduleNotificationAsync: ({ identifier, content: message, trigger }) =>
        Notifications.scheduleNotificationAsync({
          identifier,
          content: message,
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: trigger.hour, minute: trigger.minute, channelId: trigger.channelId },
        }),
      setNotificationChannelAsync: (id, channel) => Notifications.setNotificationChannelAsync(id, { name: channel.name, importance: Notifications.AndroidImportance.DEFAULT }),
    },
    Platform.OS,
    channelName,
  );
  return createLocalReminderService(
    port,
    {
      async load() {
        const raw = await AsyncStorage.getItem(PREFERENCE_KEY);
        if (!raw) return null;
        try {
          const value = JSON.parse(raw) as ReminderPreference;
          return typeof value.enabled === 'boolean' && typeof value.localTime === 'string' ? value : null;
        } catch {
          return null;
        }
      },
      save: (preference) => AsyncStorage.setItem(PREFERENCE_KEY, JSON.stringify(preference)),
      loadScheduledFor: () => AsyncStorage.getItem(SCHEDULED_FOR_KEY),
      saveScheduledFor: (value) => (value === null ? AsyncStorage.removeItem(SCHEDULED_FOR_KEY) : AsyncStorage.setItem(SCHEDULED_FOR_KEY, value)),
    },
    content,
    context,
  );
}
