// The pending choice (C16): a refused online edit kept on the phone, and the
// model the conflict panel builds on. A choice is measured against the record
// the person opened (`original`) and compared with the current record before it
// is offered again or sent again.
import type { TransactionDto, UpdateTransactionRequest } from '@gogospend/contracts';

import type { PendingChoice } from '../../../storage/types.ts';
import { editDraftFrom } from './recordModel.ts';
import type { EditDraft } from './recordModel.ts';

/** The draft the person sees: the record they opened, with their change applied. */
export function draftFromChoice(choice: PendingChoice): EditDraft {
  const { changes } = choice;
  const draft: EditDraft = { ...editDraftFrom(choice.original) };
  if (changes.amount_minor !== undefined) draft.amountMinor = changes.amount_minor;
  if (changes.occurred_on !== undefined) draft.occurredOn = changes.occurred_on;
  if (changes.note !== undefined) draft.note = changes.note ?? '';
  if (changes.merchant !== undefined) draft.merchant = changes.merchant ?? '';
  if (changes.wallet_id !== undefined) draft.walletId = changes.wallet_id;
  if (changes.category_id !== undefined && draft.type !== 'transfer') {
    draft.categoryByType = draft.type === 'expense' ? { ...draft.categoryByType, expense: changes.category_id } : { ...draft.categoryByType, income: changes.category_id };
  }
  if (changes.source_wallet_id !== undefined) draft.fromWalletId = changes.source_wallet_id;
  if (changes.destination_wallet_id !== undefined) draft.toWalletId = changes.destination_wallet_id;
  return draft;
}

/** The server record to compare against: the fresh read when there is one, else the stored copy. */
export function choiceAgainst(choice: PendingChoice, fresh: TransactionDto | null): TransactionDto {
  if (fresh === null) return choice.server;
  if (fresh.id !== choice.recordId) throw new TypeError('The fresh record is another record.');
  return fresh;
}

/** True when every changed field already holds the current record's value. */
export function choiceSettled(choice: PendingChoice, current: TransactionDto): boolean {
  const fields = current as Record<string, unknown>;
  return Object.entries(choice.changes).every(([field, value]) => fields[field] === value);
}

/** "Use yours": the same changes, sent on the server's current version (as rebaseEdit does). Throws for another record. */
export function resendForChoice(choice: PendingChoice, current: TransactionDto): { id: string; version: number; changes: UpdateTransactionRequest } {
  if (current.id !== choice.recordId) throw new TypeError('The server record is another record.');
  return { id: choice.recordId, version: current.version, changes: { ...choice.changes } };
}
