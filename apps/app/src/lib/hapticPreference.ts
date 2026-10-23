// How much the phone answers back (Settings → "Haptics", premium plan A1).
// Pure: parsing, the default, and the policy that turns a moment's verb into
// what actually plays.
//
//   on      every moment in motion.haptic plays its verb
//   subtle  only what reports an outcome: saved, a warning, an error (a
//           celebration plays as a single success)
//   off     nothing
//
// The phone's own system haptics switch still applies underneath: iOS and
// Android mute these when the person has turned vibration off.
import { motion } from '../theme/motion.ts';

export type HapticPreference = 'on' | 'subtle' | 'off';

export const HAPTIC_PREFERENCES: readonly HapticPreference[] = ['on', 'subtle', 'off'];

export const DEFAULT_HAPTIC_PREFERENCE: HapticPreference = 'on';

export type HapticMoment = keyof typeof motion.haptic;
export type HapticVerb = Exclude<(typeof motion.haptic)[HapticMoment], 'none'>;

/** The stored word, or null for anything else (no trimming, no case folding). */
export function parseHapticPreference(value: unknown): HapticPreference | null {
  return value === 'on' || value === 'subtle' || value === 'off' ? value : null;
}

const OUTCOME_VERBS: ReadonlySet<HapticVerb> = new Set(['success', 'warning', 'error']);

/** What a moment plays under a preference; `none` is silence. */
export function hapticVerbFor(moment: HapticMoment, preference: HapticPreference): HapticVerb | 'none' {
  const verb = motion.haptic[moment];
  if (verb === 'none' || preference === 'off') return 'none';
  if (preference === 'on') return verb;
  if (verb === 'celebrate') return 'success';
  return OUTCOME_VERBS.has(verb) ? verb : 'none';
}

// The current choice for the whole app. playHaptic is called from event
// handlers outside React, so the provider keeps this in step with its state.
let current: HapticPreference = DEFAULT_HAPTIC_PREFERENCE;

export function currentHapticPreference(): HapticPreference {
  return current;
}

export function setCurrentHapticPreference(next: HapticPreference): void {
  current = next;
}
