// useDraftReview (P3-T5): the review a screen calls once a draft Bun made is
// saved or dropped (P3-T13 and P3-T18 call it). Each review sends one
// ai_draft_reviewed and, in a development build only, counts its outcome in
// the draft tally for the phase 3 proof.
//
// - The tally is reached only through the conditional below. In a release
//   build babel-preset-expo inlines __DEV__ as false and Metro folds the
//   conditional to undefined before it collects dependencies, so the import()
//   goes with it and src/dev/draftTally.ts never reaches a release bundle
//   (P3-T22 adds an export check that fails a bundle holding it). `typeof`
//   keeps this module loadable where nothing defines __DEV__, as in Node
//   tests.
// - The tally loads with import(), not require(): the render suite is a
//   development build whose require() is Node's own, which cannot resolve
//   @mobile or read TypeScript, while import() goes through the bundler there
//   as it does in the app.
// - reviewDraft drops a count that fails, so a review never fails on it.
import type { AiModelName, DraftOutcome } from '../../../analytics/events.ts';
import { reviewDraft } from './draftReview.ts';

type Review = Parameters<typeof reviewDraft>[0];

const tally: ((outcome: DraftOutcome, model: AiModelName) => Promise<void>) | undefined =
  typeof __DEV__ !== 'undefined' && __DEV__
    ? (outcome, model) => import('@mobile/dev/draftTally').then((dev) => dev.addDraftOutcome(outcome, model))
    : undefined;

function review(p: Review): void {
  reviewDraft(p, tally);
}

/** The same function every time, so a screen may keep it in a hook's dependency list. */
export function useDraftReview(): (p: Review) => void {
  return review;
}
