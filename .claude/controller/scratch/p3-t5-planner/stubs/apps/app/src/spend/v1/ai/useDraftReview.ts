// RED stub (P3-T5): the plan's interface, with no behaviour yet.
import type { reviewDraft } from './draftReview.ts';

export function useDraftReview(): (p: Parameters<typeof reviewDraft>[0]) => void {
  return () => undefined;
}
