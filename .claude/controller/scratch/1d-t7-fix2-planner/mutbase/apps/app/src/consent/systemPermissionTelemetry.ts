// The phone's camera and photos permission answers (1D-T7). Only a denial is
// counted: permission_denied with CAMERA_DENIED or PHOTOS_DENIED, through the
// typed emitter (R23). A grant, an Open Settings tap and anything else send
// nothing, and the prompt's context and method never leave the phone (§7). A
// relative import, so Node's test runner loads this file.
import { trackPermissionDenied } from '../analytics/events.ts';

export type SystemPermissionOpenSettingsResult = 'opened' | 'failed' | 'unsupported';
export function trackSystemPermissionOutcome(input: {
  permission: 'camera' | 'photos'; outcome: string; promptContext?: string;
  isReprompt?: boolean; openSettingsResult?: SystemPermissionOpenSettingsResult; openSettingsMethod?: string;
}): void {
  if (input.outcome === 'deny') trackPermissionDenied({ permission: input.permission });
}
