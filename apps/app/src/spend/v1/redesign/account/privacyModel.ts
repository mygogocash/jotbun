// R6 Privacy and data (plan §6.4), pure: the export period, a ready file's
// expiry on Bangkok's clock, and the journey states of privacy.ts and
// deletion.ts as the screen shows them. The rules themselves (one proof per
// request, a lost answer resent as the same request, erase only after a
// confirmed acceptance) stay in privacy.ts and deletion.ts.
import { TRACKING_START_MIN } from '@gogospend/contracts';
import type { ExportDto, ExportFailureReason, ExportFilter } from '@gogospend/contracts';

import type { DeletionState, PendingDeletionRequest } from '../../deletion.ts';
import type { DownloadResult, ExportState, PendingExportRequest } from '../../privacy.ts';

export type ReadyExport = Extract<ExportDto, { status: 'ready' }>;

/** Everything up to today, or this year when everything is too large for one file. */
export type ExportScope = 'everything' | 'this_year';

export function exportFilter(today: string, scope: ExportScope): ExportFilter {
  return { from: scope === 'everything' ? TRACKING_START_MIN : `${today.slice(0, 4)}-01-01`, through: today };
}

/** Bangkok is UTC+7 all year (no daylight saving). */
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

/** An instant on Bangkok's clock: its calendar date and "HH:MM". */
export function bangkokClock(instant: string): { date: string; time: string } {
  const shifted = new Date(Date.parse(instant) + BANGKOK_OFFSET_MS).toISOString();
  return { date: shifted.slice(0, 10), time: shifted.slice(11, 16) };
}

/** Why the idle export (or deletion) card has a line under it. */
export type IdleNote = 'cancelled' | 'reauth_required' | 'signin_unreachable' | 'refused' | null;

export type ExportPhase =
  | { readonly phase: 'idle'; readonly note: IdleNote }
  | { readonly phase: 'requesting' }
  /** The answer was lost: Try again resends exactly this request. */
  | { readonly phase: 'unconfirmed'; readonly request: PendingExportRequest }
  /** Being made. `offline`: the last check could not reach Jotbun. */
  | { readonly phase: 'preparing'; readonly exportId: string; readonly offline: boolean; readonly checking?: boolean }
  | { readonly phase: 'ready'; readonly exportId: string; readonly file: ReadyExport; readonly download: 'idle' | 'busy' | 'failed' }
  | { readonly phase: 'ready'; readonly exportId: string; readonly file: ReadyExport; readonly download: 'saved'; readonly fileName: string }
  | { readonly phase: 'expired'; readonly exportId: string }
  | { readonly phase: 'failed'; readonly exportId: string; readonly reason: ExportFailureReason };

/** privacy.ts's journey state as the screen shows it. */
export function exportPhase(state: ExportState): ExportPhase {
  switch (state.state) {
    case 'cancelled':
    case 'reauth_required':
      return { phase: 'idle', note: state.state };
    case 'unconfirmed': return { phase: 'unconfirmed', request: state.request };
    case 'queued': return { phase: 'preparing', exportId: state.exportId, offline: false };
    case 'ready': return { phase: 'ready', exportId: state.exportId, file: state.file, download: 'idle' };
    case 'failed': return { phase: 'failed', exportId: state.exportId, reason: state.reason };
    case 'expired': return { phase: 'expired', exportId: state.exportId };
  }
}

/**
 * After a download (privacy.ts's DownloadResult) and the share sheet. Ready
 * means the file exists on Jotbun, never that the person kept it: only a file
 * they sent somewhere reads as downloaded.
 */
export function downloadPhase(exportId: string, file: ReadyExport, result: DownloadResult, saved: boolean): ExportPhase {
  switch (result.state) {
    case 'downloaded':
      return saved ? { phase: 'ready', exportId, file, download: 'saved', fileName: result.fileName } : { phase: 'ready', exportId, file, download: 'idle' };
    case 'expired': return { phase: 'expired', exportId };
    case 'failed': return { phase: 'failed', exportId, reason: 'error' };
    case 'queued': return { phase: 'preparing', exportId, offline: false };
  }
}

/**
 * What happened to this phone's copy of the diary (deletion.ts's
 * `settleDeviceCopy`): erased after a confirmed acceptance, locked after a
 * refusal, kept otherwise. `none`: there is no diary on this device (the web);
 * `erase_failed`: the erase itself failed and is tried again at Done.
 */
export type DeviceCopyOutcome = 'erased' | 'locked' | 'kept' | 'none' | 'erase_failed';

export type DeletionPhase =
  | { readonly phase: 'idle'; readonly note: IdleNote }
  | { readonly phase: 'working' }
  | { readonly phase: 'accepted'; readonly requestId: string; readonly completed: boolean; readonly device: DeviceCopyOutcome }
  | { readonly phase: 'refused'; readonly device: DeviceCopyOutcome }
  | { readonly phase: 'unconfirmed'; readonly request: PendingDeletionRequest; readonly device: DeviceCopyOutcome };

/** deletion.ts's outcome, with what became of this phone's copy, as the screen shows it. */
export function deletionPhase(state: DeletionState, device: DeviceCopyOutcome): DeletionPhase {
  switch (state.state) {
    case 'cancelled':
    case 'reauth_required':
      return { phase: 'idle', note: state.state };
    case 'accepted': return { phase: 'accepted', requestId: state.requestId, completed: state.completed, device };
    case 'denied': return { phase: 'refused', device };
    case 'unconfirmed': return { phase: 'unconfirmed', request: state.request, device };
  }
}
