// RED stub (P2-T17): the plan's interface, with no behaviour yet.
import type { Minor } from '@gogospend/contracts';

import type { SavedEntry } from '../../screens/redesign/entry/entrySave.ts';
import type { Lookups, Translate } from '../../spend/v1/redesign/shared.ts';
import type { OutboxCommand } from '../../storage/types.ts';
import type { AddType } from '../add/addFlow.ts';
import type { WalletT } from '../copy/draftText.ts';

export type SavedNotice = { recordId: string; commandId: string; kind: AddType; title: string; walletId: string | null; via: 'device' | 'online'; amountMinor: Minor; offline: boolean };

export type UndoPlan = { kind: 'remove_draft'; commandId: string } | { kind: 'delete_record'; recordId: string; version: 1 } | { kind: 'none' };

export function noticeOf(_saved: SavedEntry, _lookups: Lookups, _offline: boolean, _tc: Translate): SavedNotice {
  return { recordId: '', commandId: '', kind: 'expense', title: '', walletId: null, via: 'device', amountMinor: '0', offline: false };
}

export function undoPlan(_notice: SavedNotice, _outbox: readonly OutboxCommand[]): UndoPlan {
  return { kind: 'delete_record', recordId: '', version: 1 };
}

export function todayOutMinor(_input: { summaryExpenseMinor: Minor; confirmedIds: ReadonlySet<string>; outbox: readonly OutboxCommand[]; today: string }): Minor {
  return '0';
}

export function toastAmount(_todayOut: Minor, _hidden: boolean): string {
  return '';
}

export function toastWords(_notice: SavedNotice, _todayOut: Minor | null, _hidden: boolean, _t: WalletT): { text: string; spoken: string } {
  return { text: '', spoken: '' };
}
