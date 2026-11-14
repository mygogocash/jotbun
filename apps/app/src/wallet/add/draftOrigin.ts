// How the add tray's entry was made (P3-T13; H9): the source its save gives
// the record, and, for a draft an AI model made, what the draft review
// (P3-T5) compares the saved record with. Pure: a Node test reads it, so it
// imports by relative path and loads no React or React Native.
//
// - A typed entry is `typed`, with nothing to review. P2's Tell Bun sheet
//   gives `tell_bun`, also with nothing to review: the sheet does not say
//   which model read the sentence. A draft handed to applyAiDraft gives its
//   own source (`tell_bun` or `photo`), and its review keeps the model, whether
//   Opus answered, and the entry as the tray showed it once the draft filled
//   it (`original`).
// - draftFieldsOf turns a tray's draft into the review's fields: the type, the
//   amount it settles on (the tray keeps the amount on its keypad, so the
//   caller passes it), the date, the type's category (none for a move), the
//   wallet (for a move, the one it leaves), the merchant and the note.
import type { TransactionSource } from '@gogospend/contracts';

import type { AiModelName } from '../../analytics/events.ts';
import type { DraftFields } from '../../spend/v1/ai/draftReview.ts';
import type { QuickAddDraft } from '../../spend/v1/redesign/quickAddModel.ts';

export type DraftOrigin = { source: TransactionSource; review: { original: DraftFields; model: AiModelName; escalated: boolean } | null };

export const TYPED_ORIGIN: DraftOrigin = { source: 'typed', review: null };

export function draftFieldsOf(draft: QuickAddDraft, amountMinor: string | null): DraftFields {
  const move = draft.type === 'transfer';
  return {
    type: draft.type,
    amountMinor,
    occurredOn: draft.occurredOn,
    categoryId: draft.type === 'transfer' ? null : draft.categoryByType[draft.type],
    walletId: move ? draft.fromWalletId : draft.walletId,
    merchant: draft.merchant,
    note: draft.note,
  };
}
