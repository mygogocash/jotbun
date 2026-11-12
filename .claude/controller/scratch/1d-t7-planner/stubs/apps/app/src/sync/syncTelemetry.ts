// RED stub (1D-T7): the plan's interface, with no behaviour yet.
import type { SyncOutcome } from './types.ts';

export type SyncEvent = { name: 'sync_failed' | 'resync_required'; properties: Record<string, string> };

export function syncEvents(previous: SyncOutcome | null, next: SyncOutcome): SyncEvent[] {
  void previous;
  void next;
  return [];
}
