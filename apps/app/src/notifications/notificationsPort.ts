// The reminder port over expo-notifications, kept apart from the module so
// its platform rules can be tested without a device.
import { readPermission } from './reminders.ts';
import type { ReminderPort, Weekday } from './reminders.ts';

type PermissionResponse = { granted: boolean; status: string; canAskAgain: boolean; ios?: { status?: number } | null };

/**
 * The two repeating triggers the reminders use, shaped as expo-notifications
 * SDK 58 takes them (`DailyTriggerInput`, `WeeklyTriggerInput`). Both repeat
 * by themselves; neither has a `repeats` field. A weekly `weekday` counts
 * from Sunday = 1 to Saturday = 7, as iOS and Android calendars do.
 */
export type ReminderTrigger =
  | { type: 'daily'; hour: number; minute: number; channelId?: string }
  | { type: 'weekly'; weekday: number; hour: number; minute: number; channelId?: string };

/** The slice of expo-notifications the reminder uses. */
export type NotificationsApi = {
  getPermissionsAsync(): Promise<PermissionResponse>;
  requestPermissionsAsync(request?: { ios?: { allowAlert: boolean; allowBadge: boolean; allowSound: boolean; allowProvisional: boolean } }): Promise<PermissionResponse>;
  cancelScheduledNotificationAsync(id: string): Promise<void>;
  scheduleNotificationAsync(request: { identifier: string; content: { title: string; body: string }; trigger: ReminderTrigger }): Promise<string>;
  setNotificationChannelAsync(id: string, channel: { name: string }): Promise<unknown>;
};

// expo-notifications' IosAuthorizationStatus.PROVISIONAL.
const IOS_PROVISIONAL = 3;
export const REMINDER_CHANNEL_ID = 'daily-reminder';

/** An ISO weekday (Monday = 1 … Sunday = 7) as expo-notifications counts it (Sunday = 1 … Saturday = 7). */
export function expoWeekday(day: Weekday): number {
  return (day % 7) + 1;
}

const reading = (response: PermissionResponse) =>
  readPermission({
    granted: response.granted,
    status: response.status === 'granted' || response.status === 'denied' ? response.status : 'undetermined',
    canAskAgain: response.canAskAgain,
    provisional: response.ios?.status === IOS_PROVISIONAL,
  });

/**
 * iOS asks for alerts and sounds and accepts quiet (provisional) delivery;
 * Android posts the reminder on its own channel, which the user can tune or
 * mute in system settings.
 */
export function createNotificationsPort(api: NotificationsApi, platform: string, channelName: () => string): ReminderPort {
  const android = platform === 'android';
  return {
    supported: true,
    permission: async () => reading(await api.getPermissionsAsync()),
    async requestPermission() {
      const response = await api.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: false, allowSound: true, allowProvisional: true } });
      return reading(response) === 'granted' ? 'granted' : 'denied';
    },
    cancel: (id) => api.cancelScheduledNotificationAsync(id),
    async scheduleDaily(id, hour, minute, message) {
      if (android) await api.setNotificationChannelAsync(REMINDER_CHANNEL_ID, { name: channelName() });
      await api.scheduleNotificationAsync({
        identifier: id,
        content: { title: message.title, body: message.body },
        trigger: { type: 'daily', hour, minute, ...(android ? { channelId: REMINDER_CHANNEL_ID } : {}) },
      });
    },
    async scheduleWeekly(id, weekday, hour, minute, message) {
      if (android) await api.setNotificationChannelAsync(REMINDER_CHANNEL_ID, { name: channelName() });
      await api.scheduleNotificationAsync({
        identifier: id,
        content: { title: message.title, body: message.body },
        trigger: { type: 'weekly', weekday: expoWeekday(weekday), hour, minute, ...(android ? { channelId: REMINDER_CHANNEL_ID } : {}) },
      });
    },
  };
}
