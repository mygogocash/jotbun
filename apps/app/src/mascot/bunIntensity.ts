// How much of the bun a person wants to see (Settings → "Bun", decision D9).
// Pure: parsing, the default and the rules every mascot component follows.
//
//   full   the bun, its peeks and its speech bubbles
//   quiet  no bubbles; the bun and its peeks stay, because screens use them
//          only on empty states
//   off    no bun anywhere
export type BunIntensity = 'full' | 'quiet' | 'off';

export const BUN_INTENSITIES: readonly BunIntensity[] = ['full', 'quiet', 'off'];

export const DEFAULT_BUN_INTENSITY: BunIntensity = 'full';

/** The stored word, or null for anything else (no trimming, no case folding). */
export function parseBunIntensity(value: unknown): BunIntensity | null {
  return value === 'full' || value === 'quiet' || value === 'off' ? value : null;
}

/** A stored value, falling back to the default when it is missing or damaged. */
export function resolveBunIntensity(value: unknown): BunIntensity {
  return parseBunIntensity(value) ?? DEFAULT_BUN_INTENSITY;
}

/** `Bun` and `BunPeek` draw anything at all. */
export function showsBun(intensity: BunIntensity): boolean {
  return intensity !== 'off';
}

/** `SpeechBubble` draws anything at all. */
export function showsBubble(intensity: BunIntensity): boolean {
  return intensity === 'full';
}
