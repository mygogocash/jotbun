// R6 Settings (plan §6.4), pure: the choices Settings offers, which links it
// shows for the areas that are on, and what this phone's diary holds that a
// sign-out erase would lose. The screen turns these into words.
import type { Locale } from '../../../../i18n/locales.ts';
import { BUN_INTENSITIES } from '../../../../mascot/bunIntensity.ts';
import type { BunIntensity } from '../../../../mascot/bunIntensity.ts';
import type { OutboxState } from '../../../../storage/types.ts';
import type { ThemePreference } from '../../../../theme/themePreference.ts';
import type { DiaryView } from '../../spendDiary.ts';

/** Appearance, saved through the theme preference. */
export const APPEARANCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

/**
 * The app's languages, each named in itself, so a person who cannot read the
 * current language still finds their own. Thai first, as the app's home.
 */
export const LANGUAGES: readonly { readonly locale: Locale; readonly name: string }[] = [
  { locale: 'th', name: 'ไทย' },
  { locale: 'en', name: 'English' },
  { locale: 'vi', name: 'Tiếng Việt' },
];

/** The bun's intensity (decision D9), saved through the bun intensity provider. */
export const BUN_CHOICES: readonly BunIntensity[] = BUN_INTENSITIES;

/** How the session says this account signs in. The session does not say yet. */
export type SignInMethod = 'apple' | 'google' | 'email';

/**
 * The areas whose rows Settings shows. Planning (Wallets, Categories, Budget)
 * and insights (Reminders) wait for their own E2 approval; import waits for
 * every import gate (handover §8).
 */
export type SettingsAreas = { readonly planning: boolean; readonly insights: boolean; readonly imports: boolean };

export type DiaryLinkKey = 'wallets' | 'categories' | 'budget' | 'reminders' | 'import';

export const SETTINGS_HREFS = {
  wallets: '/spend/wallets',
  categories: '/spend/categories',
  budget: '/spend/budget',
  reminders: '/spend/reminders',
  import: '/spend/import',
  privacy: '/settings/privacy',
} as const satisfies Record<DiaryLinkKey | 'privacy', string>;

/** The diary's links, in order: planning's three, then Reminders, then Import. Privacy and data is always shown. */
export function diaryLinks(areas: SettingsAreas): DiaryLinkKey[] {
  return [
    ...(areas.planning ? (['wallets', 'categories', 'budget'] as const) : []),
    ...(areas.insights ? (['reminders'] as const) : []),
    ...(areas.imports ? (['import'] as const) : []),
  ];
}

/** Drafts on this phone that Jotbun has not confirmed: an erase loses them. None without a diary (the web keeps none). */
export function unsyncedEntries(view: DiaryView | null): number {
  if (!view || view.phase !== 'ready') return 0;
  return view.outbox.filter((command) => command.state !== 'acknowledged').length;
}

/** Waiting on the connection, as Home's banner counts it (a refused draft is not). */
const WAITING: readonly OutboxState[] = ['unsent', 'sending', 'uncertain', 'paused_upgrade'];

/** Offline: sync is backing off with entries waiting (Home's rule, so both screens agree). */
export function deviceOffline(view: DiaryView | null): boolean {
  if (!view || view.phase !== 'ready') return false;
  const status = view.outcome?.status;
  const waiting = view.outbox.some((command) => WAITING.includes(command.state));
  return (status === 'waiting' || status === 'paused') && waiting;
}
