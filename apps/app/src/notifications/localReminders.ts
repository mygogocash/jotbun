// The device's local reminder (expo-notifications; no push backend). Metro
// uses localReminders.web.ts on the web, which reports reminders unsupported.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

import { createLocalReminderService } from './reminders.ts';
import type { LocalReminderService, ReminderContent, ReminderPreference } from './reminders.ts';

const PREFERENCE_KEY = 'gogospend.reminder.v1';

export function createDeviceReminderService(content: () => ReminderContent): LocalReminderService {
  return createLocalReminderService(
    {
      supported: true,
      async permission() {
        const status = await Notifications.getPermissionsAsync();
        return status.granted ? 'granted' : status.canAskAgain ? 'undetermined' : 'denied';
      },
      async requestPermission() {
        return (await Notifications.requestPermissionsAsync()).granted ? 'granted' : 'denied';
      },
      async cancel(id) {
        await Notifications.cancelScheduledNotificationAsync(id);
      },
      async scheduleDaily(id, hour, minute, message) {
        await Notifications.scheduleNotificationAsync({
          identifier: id,
          content: { title: message.title, body: message.body },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
        });
      },
    },
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
    },
    content,
  );
}
