// RED stub (1D-T6): the exports the tests import, with none of the behaviour.
import type { OutgoingEvent } from './gate.ts';

export const REPLAY_TOUCHES_CAN_BE_OFF: boolean = false;

export function dropDeviceName(properties: Record<string, unknown>): Record<string, unknown> {
  return properties;
}

export function posthogOptions(input: {
  host: string;
  beforeSend: (event: OutgoingEvent) => OutgoingEvent | null;
  crashReportsWithoutConsent: boolean;
  replayTouchesCanBeOff: boolean;
}): Record<string, unknown> {
  return { host: input.host };
}
