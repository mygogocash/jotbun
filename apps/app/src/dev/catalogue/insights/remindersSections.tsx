// The Reminders screen in each of its states (R5, development only), drawn by
// the real RemindersScreen on a fake reminder service and reached with the
// same steps as RemindersScreen.render.test.tsx. The service is S4's own
// (`createLocalReminderService`) over an in-memory notifications port and
// store, so every state is the service's real answer: on, off, denied, not on
// the web, or a save still going.
//
// Theme, language and bun intensity come from the catalogue's header, as for
// every section. Two states are drawn fixed as well, for their screenshots:
// `reminders-thai` in Thai and `reminders-dark` in the dark theme. The bun
// peeks over the preview only at Full: pick Quiet or Off in the header on
// `reminders-every-day` to see it go (there is no per-section override for the
// intensity, which is the app's own setting).
//
// Not registered in registry.tsx yet: R5 waits for E2 checkpoint 3.
import { IntlProvider } from 'react-intl';

import { createLocalReminderService } from '@mobile/notifications/reminders';
import type { LocalReminderService, PermissionOutcome, ReminderPort, StoredReminderPreference } from '@mobile/notifications/reminders';
import { RemindersScreen } from '@mobile/screens/redesign/insights/RemindersScreen';
import { createFakeResources } from '@mobile/spend/v1/testing/fakeResources';
import { ThemePreferenceOverride } from '@mobile/theme/ThemeProvider';
import type { CatalogueSection } from '../registry';
import { CATALOGUE_NOW } from '../screenFixtures';
import { screenSection } from '../screenSection';
import type { ScreenFixture, ScriptStep, Translate } from '../screenSection';

type ReminderFixture = ScreenFixture & { readonly service: LocalReminderService };

type FakeOptions = {
  /** What the device has stored; null for nothing yet (off, 20:00, every day). */
  readonly stored?: StoredReminderPreference | null;
  /** The OS permission before asking, and the answer when asked. */
  readonly permission?: 'granted' | 'denied' | 'undetermined';
  readonly answer?: 'granted' | 'denied';
  /** False: the web, where nothing can be scheduled. */
  readonly supported?: boolean;
  /** Saves never finish: the screen stays saving. */
  readonly hold?: boolean;
};

/** S4's reminder service over an in-memory port and store: nothing reaches the OS. */
export function fakeReminderService({ stored = null, permission = 'granted', answer = 'granted', supported = true, hold = false }: FakeOptions = {}): LocalReminderService {
  let current = permission;
  let saved = stored;
  const port: ReminderPort = {
    supported,
    permission: async () => current,
    requestPermission: async () => {
      current = answer;
      return answer;
    },
    cancel: async () => undefined,
    scheduleWeekly: async () => undefined,
  };
  const service = createLocalReminderService(
    port,
    { load: async () => saved, save: async (next) => void (saved = next), loadScheduledFor: async () => null, saveScheduledFor: async () => undefined },
    () => ({ title: '', body: '' }),
  );
  if (!hold) return service;
  return { ...service, supported: service.supported, setPreference: () => new Promise<PermissionOutcome>(() => undefined) };
}

const fixture = (options: FakeOptions = {}) => (): ReminderFixture => ({ resources: createFakeResources().resources, diary: null, service: fakeReminderService(options) });
const reminders = ({ service }: ReminderFixture) => <RemindersScreen service={service} now={CATALOGUE_NOW} />;

const ON: StoredReminderPreference = { enabled: true, localTime: '20:00', weekdays: [1, 2, 3, 4, 5, 6, 7] };
const WEEKDAYS: StoredReminderPreference = { enabled: true, localTime: '07:30', weekdays: [1, 2, 3, 4, 5] };

/** The stored reminder has loaded. */
const loaded = (tc: Translate): ScriptStep[] => [{ waitFor: tc('Remind me to log') }];
/** ...and it is on: the preview shows. */
const shown = (tc: Translate): ScriptStep[] => [...loaded(tc), { waitFor: 'reminders-preview' }];

export const REMINDERS_SECTIONS: readonly CatalogueSection[] = [
  screenSection({ id: 'reminders-off', title: 'Reminders: off', fixture: fixture(), script: loaded, render: reminders }),
  screenSection({ id: 'reminders-every-day', title: 'Reminders: on, every day', fixture: fixture({ stored: ON }), script: shown, render: reminders }),
  screenSection({ id: 'reminders-weekdays', title: 'Reminders: on, weekdays only', fixture: fixture({ stored: WEEKDAYS }), script: shown, render: reminders }),
  screenSection({
    id: 'reminders-time',
    title: 'Reminders: changing the time',
    fixture: fixture({ stored: ON }),
    // The sheet open on 07:30, the preview behind it already moved.
    script: (tc) => [...shown(tc), { press: `${tc('Reminder time')}, 20:00` }, { press: '07' }, { press: '30' }, { waitFor: 'reminders-time-shown' }],
    render: reminders,
  }),
  screenSection({
    id: 'reminders-denied',
    title: 'Reminders: permission denied',
    fixture: fixture({ permission: 'undetermined', answer: 'denied' }),
    script: (tc) => [
      ...loaded(tc),
      { press: tc('Remind me to log') },
      { press: tc('Save') },
      { waitFor: tc("Jotbun can't send notifications. Turn on notifications for Jotbun in Settings.") },
    ],
    render: reminders,
  }),
  screenSection({ id: 'reminders-unsupported', title: 'Reminders: unsupported (web)', fixture: fixture({ supported: false }), script: (tc) => [...loaded(tc), { waitFor: 'reminders-unsupported' }], render: reminders }),
  screenSection({
    id: 'reminders-one-day',
    title: 'Reminders: at least one day',
    fixture: fixture({ stored: { enabled: true, localTime: '20:00', weekdays: [3] } }),
    // Press the one chosen day (Wednesday in any language): it stays, and the screen says why.
    script: (tc) => [...shown(tc), { call: 'onPress', on: { accessibilityRole: 'checkbox', 'aria-checked': true } }, { waitFor: 'reminders-day-note' }],
    render: reminders,
  }),
  screenSection({
    id: 'reminders-saving',
    title: 'Reminders: saving',
    fixture: fixture({ stored: ON, hold: true }),
    script: (tc) => [...shown(tc), { press: tc('Save') }, { waitFor: tc('Saving…') }],
    render: reminders,
  }),
  screenSection({
    id: 'reminders-thai',
    title: 'Reminders: Thai',
    fixture: fixture({ stored: WEEKDAYS }),
    script: () => [{ waitFor: 'reminders-preview' }],
    render: (each) => <IntlProvider locale="th">{reminders(each)}</IntlProvider>,
  }),
  screenSection({
    id: 'reminders-dark',
    title: 'Reminders: dark',
    fixture: fixture({ stored: WEEKDAYS }),
    script: shown,
    render: (each) => <ThemePreferenceOverride preference="dark">{reminders(each)}</ThemePreferenceOverride>,
  }),
];
