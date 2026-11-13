// RED stub (P3-T13): the plan's interface, with no behaviour yet.
import type { TransactionSource } from '@gogospend/contracts';

import type { AiModelName } from '../../analytics/events.ts';
import type { DraftFields } from '../../spend/v1/ai/draftReview.ts';
import type { QuickAddDraft } from '../../spend/v1/redesign/quickAddModel.ts';

export type DraftOrigin = { source: TransactionSource; review: { original: DraftFields; model: AiModelName; escalated: boolean } | null };

export const TYPED_ORIGIN: DraftOrigin = { source: 'typed', review: null };

export function draftFieldsOf(draft: QuickAddDraft, amountMinor: string | null): DraftFields {
  return { type: draft.type, amountMinor: amountMinor === null ? null : '', occurredOn: null, categoryId: null, walletId: null, merchant: null, note: null };
}
