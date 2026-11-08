import { unsupportedBetterAuthPort } from './betterAuthPort.ts';
import type { BetterAuthPort } from './betterAuthPort.ts';

/** The web preview has no native sign-in. Metro loads this file instead of betterAuthClient.ts. */
export function createAppAuthPort(): BetterAuthPort {
  return unsupportedBetterAuthPort('Sign-in needs the iOS or Android app.');
}
