// RED stub (P2-T18a): todayOutMinor takes the read's revision, and does nothing with it yet.
// The saved moment's rules (P2-T17; bw-saved, rh-offline, W31, R65, R114,
// Review Focus 4). Pure: a Node test reads it.
//
// - What a landed save says (noticeOf): its record and command, its kind, the
//   wallet its chip drops into (a transfer's is where the money went), how it
//   was saved and whether it stayed on this phone, its amount, and a title
//   that names it as confirm does: the merchant, else the note, else the
//   category's name, else the kind's, in the app's words (`tc`).
// - What Undo does (undoPlan, Review Focus 4): a draft still on this phone that
//   was never sent is removed; one being sent or checked offers nothing (it may
//   be in Jotbun already); a record Jotbun holds (a command not in the outbox,
//   as an online save never is, or one Jotbun has acknowledged) is deleted at
//   its first version, so it waits 30 days in Recently deleted.
// - Today's money out (todayOutMinor): the read's confirmed total, plus each
//   expense command dated today whose record the read does not list, so its
//   money is not in that total yet, whatever its state; but never one Jotbun
//   refused (needs review), which counts nowhere. The caller reads a page that
//   holds every expense of the day, so a listed record is never counted twice.
// - The toast's words (toastWords): bw-saved's บันทึกแล้ว · วันนี้ ฿182, the
//   amount masked in private mode and said to be hidden (R65); บันทึกแล้ว
//   while the total is unknown; rh-offline's words offline, with no total.
//   They quote nothing the person typed (R114).
import type { Minor } from '@gogospend/contracts';

import type { SavedEntry } from '../../screens/redesign/entry/entrySave.ts';
import type { Lookups, Translate } from '../../spend/v1/redesign/shared.ts';
import { canUndoDraft } from '../../spend/v1/redesign/shared.ts';
import { categoryName } from '../../spend/v1/viewModels.ts';
import type { OutboxCommand } from '../../storage/types.ts';
import type { AddType } from '../add/addFlow.ts';
import type { WalletT } from '../copy/draftText.ts';
import { HIDDEN_AMOUNT, spokenMoney, walletMoneyText } from '../money/walletMoney.ts';

export type SavedNotice = { recordId: string; commandId: string; kind: AddType; title: string; walletId: string | null; via: 'device' | 'online'; amountMinor: Minor; offline: boolean };

export type UndoPlan = { kind: 'remove_draft'; commandId: string } | { kind: 'delete_record'; recordId: string; version: 1 } | { kind: 'none' };

/** Each kind's own name in today's words, for a save with no merchant, note or known category. */
const KIND_NAMES: Readonly<Record<AddType, string>> = { expense: 'Expense', income: 'Income', transfer: 'Transfer' };

/** A landed save as the toast and the chip say it (`tc`: the app's words, for a built-in category's name). A transfer's walletId is its destination. */
export function noticeOf(saved: SavedEntry, lookups: Lookups, offline: boolean, tc: Translate): SavedNotice {
  const { draft } = saved;
  const categoryId = draft.type === 'transfer' ? null : draft.categoryByType[draft.type];
  const category = categoryId === null ? undefined : lookups.categories.get(categoryId);
  const title = draft.merchant.trim() || draft.note.trim() || (category === undefined ? '' : categoryName(category, tc)) || tc(KIND_NAMES[draft.type]);
  return {
    recordId: draft.recordId,
    commandId: draft.commandId,
    kind: draft.type,
    title,
    walletId: draft.type === 'transfer' ? draft.toWalletId : draft.walletId,
    via: saved.via,
    amountMinor: draft.amountMinor,
    offline,
  };
}

/** What Undo does for this save, from the outbox as it is now (see the note at the top). */
export function undoPlan(notice: SavedNotice, outbox: readonly OutboxCommand[]): UndoPlan {
  const command = outbox.find((each) => each.commandId === notice.commandId);
  if (command === undefined || command.state === 'acknowledged') return { kind: 'delete_record', recordId: notice.recordId, version: 1 };
  return canUndoDraft(command) ? { kind: 'remove_draft', commandId: command.commandId } : { kind: 'none' };
}

/** The confirmed total plus each expense command dated today whose record is not confirmed, unless Jotbun refused it. */
export function todayOutMinor(input: { summaryExpenseMinor: Minor; confirmedIds: ReadonlySet<string>; outbox: readonly OutboxCommand[]; today: string; readRevision?: string }): Minor {
  let total = BigInt(input.summaryExpenseMinor);
  for (const { payload, state } of input.outbox) {
    if (payload.type !== 'expense' || payload.occurred_on !== input.today) continue;
    if (state === 'needs_review' || input.confirmedIds.has(payload.id)) continue;
    total += BigInt(payload.amount_minor);
  }
  return total.toString();
}

/** The amount the toast draws: today's money out in the compact form, or the mask in private mode (W10, R65). */
export function toastAmount(todayOut: Minor, hidden: boolean): string {
  return hidden ? HIDDEN_AMOUNT : walletMoneyText(todayOut);
}

/** What the toast draws and says (`t` reads the saved lines and the shared ones). */
export function toastWords(notice: SavedNotice, todayOut: Minor | null, hidden: boolean, t: WalletT): { text: string; spoken: string } {
  if (notice.offline) {
    const text = t('saved.toastOffline');
    return { text, spoken: text };
  }
  if (todayOut === null) {
    const text = t('saved.toastPlain');
    return { text, spoken: text };
  }
  return {
    text: t('saved.toast', { amount: toastAmount(todayOut, hidden) }),
    spoken: t('saved.toast', { amount: hidden ? t('common.amountHidden') : spokenMoney(todayOut, t) }),
  };
}
