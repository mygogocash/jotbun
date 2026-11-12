// RED stub (P3-T14): the plan's interface, with no behaviour yet.

export type AiConsentChange = {
  turnOn(): Promise<void>;
  turnOff(): Promise<void>;
  busy: boolean;
};

export function useAiConsentChange(): AiConsentChange {
  return { turnOn: async () => undefined, turnOff: async () => undefined, busy: false };
}

export const DAILY_NOTE_NAME = 'daily-note';

export type DailyNoteSetting = {
  on: boolean;
  ready: boolean;
  set(on: boolean): Promise<void>;
};

export function useDailyNoteSetting(): DailyNoteSetting {
  return { on: true, ready: true, set: async () => undefined };
}
