export type ReminderPreference = { enabled: boolean; localTime: string };
export type PermissionOutcome = 'scheduled' | 'disabled' | 'denied' | 'unsupported';
export type ReminderContent = { title: string; body: string };

/** What a platform offers for local notifications (expo-notifications on device; nothing on web). */
export interface ReminderPort {
  readonly supported: boolean;
  permission(): Promise<'granted' | 'denied' | 'undetermined'>;
  requestPermission(): Promise<'granted' | 'denied'>;
  cancel(id: string): Promise<void>;
  scheduleDaily(id: string, hour: number, minute: number, content: ReminderContent): Promise<void>;
}

export interface PreferenceStore {
  load(): Promise<ReminderPreference | null>;
  save(preference: ReminderPreference): Promise<void>;
  /** The time zone and language the reminder was last scheduled for. */
  loadScheduledFor(): Promise<string | null>;
  saveScheduledFor(context: string | null): Promise<void>;
}

/** The OS permission as expo-notifications reads it. */
export type PermissionReading = { granted: boolean; status: 'granted' | 'denied' | 'undetermined'; canAskAgain: boolean; provisional: boolean };

/**
 * Provisional (quiet) delivery on iOS counts as granted. A denial the OS still
 * lets the app ask about is asked again only when the user turns reminders on.
 */
export function readPermission(reading: PermissionReading): 'granted' | 'denied' | 'undetermined' {
  if (reading.granted || reading.provisional) return 'granted';
  return reading.canAskAgain ? 'undetermined' : 'denied';
}

export interface LocalReminderService {
  setPreference(preference: ReminderPreference): Promise<PermissionOutcome>;
  /** After a time zone or locale change: the one reminder again, at the same local time, in the current language. */
  reschedule(): Promise<PermissionOutcome>;
  /** At launch and on foreground: re-schedules only if the time zone or language changed since the last schedule. */
  refresh(): Promise<PermissionOutcome | 'unchanged'>;
  getPreference(): Promise<ReminderPreference>;
}

export const DAILY_REMINDER_ID = 'gogospend.daily-reminder';

const TIME = /^([01][0-9]|2[0-3]):([0-5][0-9])$/;

function parseTime(localTime: string): { hour: number; minute: number } {
  const match = TIME.exec(localTime);
  if (!match) throw new RangeError('A reminder time is HH:MM, 00:00-23:59.');
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

/**
 * One device-local daily reminder (no push backend). Turning it on asks for
 * permission at most once; a denial is a settled state - the preference goes
 * off and nothing is retried behind the user's back. The reminder has one
 * fixed id, so a new time, time zone or language replaces it, never adding a
 * second. Delivery is up to the OS and is not promised.
 */
export function createLocalReminderService(port: ReminderPort, store: PreferenceStore, content: () => ReminderContent, context: () => string = () => ''): LocalReminderService {
  async function current(): Promise<ReminderPreference> {
    return (await store.load()) ?? { enabled: false, localTime: '20:00' };
  }

  async function schedule(preference: ReminderPreference): Promise<PermissionOutcome> {
    const { hour, minute } = parseTime(preference.localTime);
    const scheduledFor = context();
    await port.cancel(DAILY_REMINDER_ID);
    await port.scheduleDaily(DAILY_REMINDER_ID, hour, minute, content());
    await store.saveScheduledFor(scheduledFor);
    return 'scheduled';
  }

  async function reschedule(): Promise<PermissionOutcome> {
    const preference = await current();
    if (!port.supported) return 'unsupported';
    if (!preference.enabled) return 'disabled';
    if ((await port.permission()) !== 'granted') {
      await port.cancel(DAILY_REMINDER_ID);
      await store.save({ ...preference, enabled: false });
      await store.saveScheduledFor(null);
      return 'denied';
    }
    return schedule(preference);
  }

  return {
    async setPreference(preference) {
      parseTime(preference.localTime);
      if (!preference.enabled) {
        if (port.supported) await port.cancel(DAILY_REMINDER_ID);
        await store.save({ enabled: false, localTime: preference.localTime });
        await store.saveScheduledFor(null);
        return 'disabled';
      }
      if (!port.supported) return 'unsupported';
      let permission = await port.permission();
      if (permission === 'undetermined') permission = await port.requestPermission();
      if (permission !== 'granted') {
        await port.cancel(DAILY_REMINDER_ID);
        await store.save({ enabled: false, localTime: preference.localTime });
        await store.saveScheduledFor(null);
        return 'denied';
      }
      const outcome = await schedule(preference);
      await store.save(preference);
      return outcome;
    },
    reschedule,
    async refresh() {
      const preference = await current();
      if (!port.supported) return 'unsupported';
      if (!preference.enabled) return 'disabled';
      if ((await store.loadScheduledFor()) === context()) return 'unchanged';
      return reschedule();
    },
    getPreference: current,
  };
}
