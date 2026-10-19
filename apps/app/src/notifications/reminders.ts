/**
 * A day of the week as ISO 8601 numbers it: Monday = 1 … Sunday = 7, so the
 * numbers run in the Monday-first order the Reminders screen draws. (This is
 * NOT expo-notifications' numbering, where Sunday = 1: the notifications port
 * converts at the edge.)
 */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * The reminder as the person chose it. `weekdays` holds the chosen days,
 * sorted Monday first and never empty; all seven means every day.
 */
export type ReminderPreference = { enabled: boolean; localTime: string; weekdays: readonly Weekday[] };

/** What a caller asks for. Leaving out `weekdays` means every day (the S4 callers). */
export type ReminderPreferenceInput = { enabled: boolean; localTime: string; weekdays?: readonly Weekday[] };

/**
 * A preference as it was stored. S4 stored no `weekdays`, and a stored value
 * may be damaged: either reads as every day, never as no day.
 */
export type StoredReminderPreference = { enabled: boolean; localTime: string; weekdays?: unknown };

export type PermissionOutcome = 'scheduled' | 'disabled' | 'denied' | 'unsupported';
export type ReminderContent = { title: string; body: string };

/** What a platform offers for local notifications (expo-notifications on device; nothing on web). */
export interface ReminderPort {
  readonly supported: boolean;
  permission(): Promise<'granted' | 'denied' | 'undetermined'>;
  requestPermission(): Promise<'granted' | 'denied'>;
  cancel(id: string): Promise<void>;
  /** Repeats every day at the local time. */
  scheduleDaily(id: string, hour: number, minute: number, content: ReminderContent): Promise<void>;
  /** Repeats every week on `weekday` (ISO: Monday = 1 … Sunday = 7) at the local time. */
  scheduleWeekly(id: string, weekday: Weekday, hour: number, minute: number, content: ReminderContent): Promise<void>;
}

export interface PreferenceStore {
  load(): Promise<StoredReminderPreference | null>;
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
  /** False where nothing can be scheduled (the web): turning reminders on answers `unsupported`. */
  readonly supported: boolean;
  setPreference(preference: ReminderPreferenceInput): Promise<PermissionOutcome>;
  /** After a time zone or locale change: the reminders again, at the same local time and days, in the current language. */
  reschedule(): Promise<PermissionOutcome>;
  /** At launch and on foreground: re-schedules only if the time zone or language changed since the last schedule. */
  refresh(): Promise<PermissionOutcome | 'unchanged'>;
  getPreference(): Promise<ReminderPreference>;
}

/** Every day, Monday first. */
export const EVERY_DAY: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7];

/** Every day is one daily reminder, under the id S4 already used, so an S4 install keeps exactly one. */
export const DAILY_REMINDER_ID = 'gogospend.daily-reminder';

/** Fewer days are one weekly reminder per chosen day, each under its day's own fixed id. */
export const WEEKLY_REMINDER_IDS: Readonly<Record<Weekday, string>> = {
  1: 'gogospend.weekly-reminder.mon',
  2: 'gogospend.weekly-reminder.tue',
  3: 'gogospend.weekly-reminder.wed',
  4: 'gogospend.weekly-reminder.thu',
  5: 'gogospend.weekly-reminder.fri',
  6: 'gogospend.weekly-reminder.sat',
  7: 'gogospend.weekly-reminder.sun',
};

/** Every id a reminder can have: cancelling all of them leaves no reminder behind. */
const ALL_REMINDER_IDS: readonly string[] = [DAILY_REMINDER_ID, ...EVERY_DAY.map((day) => WEEKLY_REMINDER_IDS[day])];

const TIME = /^([01][0-9]|2[0-3]):([0-5][0-9])$/;
const DEFAULT_TIME = '20:00';

function parseTime(localTime: string): { hour: number; minute: number } {
  const match = TIME.exec(localTime);
  if (!match) throw new RangeError('A reminder time is HH:MM, 00:00-23:59.');
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function isWeekday(value: unknown): value is Weekday {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 7;
}

/** Sorted Monday first, each day once. */
function sortedDays(days: readonly Weekday[]): Weekday[] {
  return EVERY_DAY.filter((day) => days.includes(day));
}

/** The chosen days, checked: at least one, each 1-7. Left out, every day. */
function parseWeekdays(weekdays: readonly Weekday[] | undefined): Weekday[] {
  if (weekdays === undefined) return [...EVERY_DAY];
  if (!Array.isArray(weekdays) || weekdays.length === 0 || !weekdays.every(isWeekday)) {
    throw new RangeError('Reminder days are 1 (Monday) to 7 (Sunday), and at least one stays chosen.');
  }
  return sortedDays(weekdays);
}

/** A stored value's days: missing (S4) or damaged reads as every day. */
function storedWeekdays(value: unknown): Weekday[] {
  if (!Array.isArray(value)) return [...EVERY_DAY];
  const days = sortedDays(value.filter(isWeekday));
  return days.length > 0 ? days : [...EVERY_DAY];
}

const isEveryDay = (days: readonly Weekday[]) => days.length === EVERY_DAY.length;

/**
 * Device-local reminders (no push backend): every day is one daily reminder,
 * fewer days one weekly reminder per chosen day. Turning them on asks for
 * permission at most once; a denial is a settled state - the preference goes
 * off and nothing is retried behind the user's back. Every reminder has a
 * fixed id (the daily one, or its weekday's), and each schedule first cancels
 * all of them, so a new time, new days, a time zone or a language replaces
 * the reminders and never adds a second. Delivery is up to the OS and is not
 * promised.
 */
export function createLocalReminderService(port: ReminderPort, store: PreferenceStore, content: () => ReminderContent, context: () => string = () => ''): LocalReminderService {
  async function current(): Promise<ReminderPreference> {
    const stored = await store.load();
    if (!stored) return { enabled: false, localTime: DEFAULT_TIME, weekdays: [...EVERY_DAY] };
    return { enabled: stored.enabled, localTime: stored.localTime, weekdays: storedWeekdays(stored.weekdays) };
  }

  async function cancelAll(): Promise<void> {
    for (const id of ALL_REMINDER_IDS) await port.cancel(id);
  }

  async function settleOff(preference: ReminderPreference): Promise<void> {
    await cancelAll();
    await store.save({ ...preference, enabled: false });
    await store.saveScheduledFor(null);
  }

  async function schedule(preference: ReminderPreference): Promise<PermissionOutcome> {
    const { hour, minute } = parseTime(preference.localTime);
    const scheduledFor = context();
    const message = content();
    await cancelAll();
    if (isEveryDay(preference.weekdays)) {
      await port.scheduleDaily(DAILY_REMINDER_ID, hour, minute, message);
    } else {
      for (const day of preference.weekdays) await port.scheduleWeekly(WEEKLY_REMINDER_IDS[day], day, hour, minute, message);
    }
    await store.saveScheduledFor(scheduledFor);
    return 'scheduled';
  }

  async function reschedule(): Promise<PermissionOutcome> {
    const preference = await current();
    if (!port.supported) return 'unsupported';
    if (!preference.enabled) return 'disabled';
    if ((await port.permission()) !== 'granted') {
      await settleOff(preference);
      return 'denied';
    }
    return schedule(preference);
  }

  return {
    supported: port.supported,
    async setPreference(input) {
      parseTime(input.localTime);
      const preference: ReminderPreference = { enabled: input.enabled, localTime: input.localTime, weekdays: parseWeekdays(input.weekdays) };
      if (!preference.enabled) {
        if (port.supported) await cancelAll();
        await store.save(preference);
        await store.saveScheduledFor(null);
        return 'disabled';
      }
      if (!port.supported) return 'unsupported';
      let permission = await port.permission();
      if (permission === 'undetermined') permission = await port.requestPermission();
      if (permission !== 'granted') {
        await settleOff(preference);
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
