// Keeps the one local reminder right after a time zone or language change:
// at launch and on every return to the foreground, the reminder service
// re-schedules it only if either changed since it was last scheduled. It
// never asks for permission and does nothing while reminders are off.
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { translateCopy } from '@mobile/i18n/messages';
import type { Locale } from '@mobile/i18n/locales';
import { createDeviceReminderService } from './localReminders';

export function useReminderUpkeep(locale: Locale): void {
  useEffect(() => {
    const service = createDeviceReminderService(
      () => ({ title: translateCopy("Log today's spending", locale), body: translateCopy('Add what you spent today in Jotbun.', locale) }),
      () => `${Intl.DateTimeFormat().resolvedOptions().timeZone}|${locale}`,
      () => translateCopy('Daily reminder', locale),
    );
    const refresh = () => void service.refresh().catch(() => undefined);
    refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => subscription.remove();
  }, [locale]);
}
