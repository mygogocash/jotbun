// RED stub (1D-T7): the relative import Node's test runner can load, and the same signature, sending nothing yet.
import { trackPermissionDenied } from '../analytics/events.ts';

export type SystemPermissionOpenSettingsResult = 'opened' | 'failed' | 'unsupported';
export function trackSystemPermissionOutcome(input: {
  permission: 'camera' | 'photos'; outcome: string; promptContext?: string;
  isReprompt?: boolean; openSettingsResult?: SystemPermissionOpenSettingsResult; openSettingsMethod?: string;
}): void {
  void input;
  void trackPermissionDenied;
}
