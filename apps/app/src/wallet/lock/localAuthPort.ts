// The Face ID lock's port to the phone's own authentication (P2-T33): what the
// phone can do, and its system prompt (Face ID, a fingerprint or the
// passcode). The app asks getAppLocalAuth(), which is noLocalAuth until
// P2-T34's adapter on expo-local-authentication, so until then the lock
// cannot be turned on. Tests and the catalogue answer with fakeLocalAuth.
import type { AuthResult, LockAvailability, LockMethod } from './lockModel';

export type LocalAuthPort = {
  /** Read every time it is asked, never cached (R67: the lock reads the phone again before it turns itself off). */
  availability(): Promise<{ canLock: boolean; method: LockMethod | null }>;
  /** The system prompt; `fallback` labels its passcode button. */
  authenticate(words: { prompt: string; cancel: string; fallback: string }): Promise<AuthResult>;
};

/** A phone (or the web) with no passcode and no biometrics: it cannot lock, and every prompt is unavailable. */
export const noLocalAuth: LocalAuthPort = {
  availability: async () => ({ canLock: false, method: null }),
  authenticate: async () => 'unavailable',
};

/** The app's port: noLocalAuth until P2-T34. */
export function getAppLocalAuth(): LocalAuthPort {
  return noLocalAuth;
}

/**
 * Tests and the catalogue: each prompt answers the next of `results`, and the
 * last one again once they run out; `availability` likewise, by default a
 * phone with Face ID.
 */
export function fakeLocalAuth(
  results: readonly AuthResult[],
  availability: readonly LockAvailability[] = [{ canLock: true, method: 'face' }],
): LocalAuthPort {
  if (results.length === 0 || availability.length === 0) throw new Error('fakeLocalAuth needs at least one answer of each kind.');
  let asked = 0;
  let read = 0;
  const turn = <T,>(answers: readonly T[], at: number): T => answers[Math.min(at, answers.length - 1)];
  return {
    availability: async () => ({ ...turn(availability, read++) }),
    authenticate: async () => turn(results, asked++),
  };
}
