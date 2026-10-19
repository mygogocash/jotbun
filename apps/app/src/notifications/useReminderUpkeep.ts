// Keeps the local reminders right after a time zone or language change:
// at launch and on every return to the foreground, the reminder service
// re-schedules them only if either changed since they were last scheduled. It
// never asks for permission and does nothing while reminders are off.
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { translateCopy } from '@mobile/i18n/messages';
import type { Locale } from '@mobile/i18n/locales';
import { createDeviceReminderService } from './localReminders';
import type { LocalReminderService, ReminderContent } from './reminders';

/** The reminder's own words in `locale`: what the notification says, and what the Reminders screen previews. */
export function reminderContent(locale: Locale): ReminderContent {
  return { title: translateCopy("Log today's spending", locale), body: translateCopy('Add what you spent today in Jotbun.', locale) };
}

/**
 * The app's reminder service in `locale`: the device's (expo-notifications;
 * on the web, unsupported), written in that language for the device's time
 * zone, on Android's "Daily reminder" channel. The upkeep below and the
 * Reminders screen both build it here, so they schedule the same reminders.
 */
export function createAppReminderService(locale: Locale): LocalReminderService {
  return createDeviceReminderService(
    () => reminderContent(locale),
    () => `${Intl.DateTimeFormat().resolvedOptions().timeZone}|${locale}`,
    () => translateCopy('Daily reminder', locale),
  );
}

export function useReminderUpkeep(locale: Locale): void {
  useEffect(() => {
    const service = createAppReminderService(locale);
    const refresh = () => void service.refresh().catch(() => undefined);
    refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => subscription.remove();
  }, [locale]);
}
