// The draft review (P3-T5): how a draft Bun made fared once the person saved
// or dropped it, sent as one ai_draft_reviewed. Pure, so Node tests run it.
//
// - A draft's fields hold an amount, a merchant and a note, but fieldsEdited
//   turns them into a count of the fields that changed, and that count, the
//   outcome, the model and escalated are all the event carries (§7).
// - '' and null are the same: an empty field is empty however the form holds it.
// - The tally (a development build's count, src/dev/draftTally.ts) comes after
//   the event, and a tally that fails is dropped, whether it rejects or throws
//   at once (P3-T5's review, m1): a count never fails a review. The review
//   stays synchronous.
import { trackAiDraftReviewed } from '../../../analytics/events.ts';
import type { AiModelName, DraftOutcome } from '../../../analytics/events.ts';

export type DraftFields = { type: string; amountMinor: string | null; occurredOn: string | null; categoryId: string | null; walletId: string | null; merchant: string | null; note: string | null };

const FIELDS: readonly (keyof DraftFields)[] = ['type', 'amountMinor', 'occurredOn', 'categoryId', 'walletId', 'merchant', 'note'];

function same(before: string | null, after: string | null): boolean {
  return (before ?? '') === (after ?? '');
}

export function fieldsEdited(before: DraftFields, after: DraftFields): number {
  return FIELDS.filter((field) => !same(before[field], after[field])).length;
}

export function savedOutcome(before: DraftFields, after: DraftFields): { outcome: 'kept' | 'edited'; fieldsEdited: number } {
  const edited = fieldsEdited(before, after);
  return { outcome: edited === 0 ? 'kept' : 'edited', fieldsEdited: edited };
}

export function reviewDraft(
  p: { outcome: DraftOutcome; fieldsEdited: number; model: AiModelName; escalated: boolean },
  tally?: (outcome: DraftOutcome, model: AiModelName) => void | Promise<void>,
): void {
  trackAiDraftReviewed(p);
  if (tally === undefined) return;
  try {
    void Promise.resolve(tally(p.outcome, p.model)).catch(() => undefined);
  } catch {
    // A tally that throws before it hands back a promise is dropped the same way.
  }
}
