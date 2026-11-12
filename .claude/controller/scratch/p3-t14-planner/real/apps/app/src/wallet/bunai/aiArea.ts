// P3:ai-area (P3-T14; A10, B25): the one switch every Bun AI entry point reads.
// The `bunai` redesign area rides on the Bun Wallet area, so both must be on.
// Every entry point calls its hook inside its component: the Settings row and
// /settings/ai (P3-T14), the attach step's read toggle (P3-T15), the slip read
// step (P3-T17), the tell step (P3-T18), the source row (P3-T19), /spend/ask
// (P3-T20) and the Home note (P3-T21). The photo rows and the receipt viewer
// call usePhotosArea, which never takes a rollout: a receipt needs no AI (B3).
// Pure: featureFlags.test.ts reads it under Node, so it imports only the flags.
import { isRedesignEnabled } from '../../config/featureFlags.ts';

/** Both areas on, for tests and for callers outside a render. */
export function bunAiAreaOn(): boolean {
  return isRedesignEnabled('wallet') && isRedesignEnabled('bunai');
}

/** bunAiAreaOn() today; P6B-T15 adds its rollout (useRollout) inside. */
export function useBunAiArea(): boolean {
  return bunAiAreaOn();
}

/** bunAiAreaOn(), never a rollout. */
export function usePhotosArea(): boolean {
  return bunAiAreaOn();
}
