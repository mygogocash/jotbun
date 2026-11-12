// RED stub (P3-T5): the plan's interface, with no behaviour yet.
import type { AiModelName, DraftOutcome } from '../../../analytics/events.ts';

export type DraftFields = { type: string; amountMinor: string | null; occurredOn: string | null; categoryId: string | null; walletId: string | null; merchant: string | null; note: string | null };

export function fieldsEdited(_before: DraftFields, _after: DraftFields): number {
  return 0;
}

export function savedOutcome(_before: DraftFields, _after: DraftFields): { outcome: 'kept' | 'edited'; fieldsEdited: number } {
  return { outcome: 'kept', fieldsEdited: 0 };
}

export function reviewDraft(
  _p: { outcome: DraftOutcome; fieldsEdited: number; model: AiModelName; escalated: boolean },
  _tally?: (outcome: DraftOutcome, model: AiModelName) => void | Promise<void>,
): void {}
