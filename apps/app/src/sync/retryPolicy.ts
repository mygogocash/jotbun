import type { FlushTrigger } from './types.ts';

/**
 * failures: consecutive transport/server failures (5 pause the engine);
 * notBefore: no retry before this time (backoff); paceUntil: the server's
 * Retry-After for a 429 - pacing, not a failure, honoured even by a manual retry.
 */
export type RetryState = { failures: number; paused: boolean; notBefore: number; paceUntil: number };

export const INITIAL_RETRY: RetryState = { failures: 0, paused: false, notBefore: 0, paceUntil: 0 };

const BASE_MS = 1_000;
const CAP_MS = 60_000;
const PAUSE_AFTER = 5;
const DEFAULT_PACE_SECONDS = 60;

/** Backoff from 1 s, doubling to 60 s, with jitter keeping half to all of it; a server's Retry-After wins when longer. */
export function afterFailure(state: RetryState, now: number, random: number, retryAfterSeconds?: number): RetryState {
  const failures = state.failures + 1;
  const base = Math.min(CAP_MS, BASE_MS * 2 ** Math.min(failures - 1, 16));
  const jittered = Math.round(base / 2 + (base / 2) * Math.min(Math.max(random, 0), 1));
  const delay = Math.max(jittered, (retryAfterSeconds ?? 0) * 1000);
  return { ...state, failures, paused: failures >= PAUSE_AFTER, notBefore: now + delay };
}

/** A 429: wait as long as the server asked; it does not count toward the pause. */
export function afterPacing(state: RetryState, now: number, retryAfterSeconds?: number): RetryState {
  const seconds = retryAfterSeconds !== undefined && retryAfterSeconds > 0 ? retryAfterSeconds : DEFAULT_PACE_SECONDS;
  return { ...state, paceUntil: now + seconds * 1000 };
}

export function afterSuccess(state: RetryState): RetryState {
  return { ...state, failures: 0, paused: false, notBefore: 0 };
}

/** Whether a flush may run now. Foreground and manual flushes lift a pause and the backoff, never the server's pacing. */
export function gate(state: RetryState, now: number, trigger: FlushTrigger): { go: boolean; state: RetryState; wait: 'paused' | 'waiting' | 'rate_limited' | null; until: number | null } {
  if (now < state.paceUntil) return { go: false, state, wait: 'rate_limited', until: state.paceUntil };
  if (trigger === 'manual' || trigger === 'foreground') return { go: true, state: { ...state, failures: 0, paused: false, notBefore: 0 }, wait: null, until: null };
  if (state.paused) return { go: false, state, wait: 'paused', until: null };
  if (now < state.notBefore) return { go: false, state, wait: 'waiting', until: state.notBefore };
  return { go: true, state, wait: null, until: null };
}
