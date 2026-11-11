// The Bun Wallet's motion table (P2-T9, board ax-motion; W6, R66). Pure: for
// each moment, what moves at full motion, what takes its place under Reduce
// Motion, and the haptic it plays in both. With Reduce Motion on, nothing
// travels, springs or zooms: feedback moves to fades, instant swaps and
// haptics, and the haptics do not change. Fades are 150 ms for the interface
// and 200 ms for the save. The builders in useWalletMotion.ts and GrowBar
// follow this table, and the part that plays a moment plays its haptic
// (playHaptic, src/lib/hapticMoment.ts).
//
// The save's success haptic belongs to the save rule (W17: useEntrySave's
// savedHaptic), so `save` names none here; a second one would play it twice.
import type { HapticMoment } from '../../lib/hapticPreference.ts';

export type WalletMoment =
  | 'trayOpen'
  | 'trayStep'
  | 'save'
  | 'savedToast'
  | 'walletOpen'
  | 'hideAmounts'
  | 'budgetBar'
  | 'walletAdded'
  | 'recap'
  | 'page';

/** Every moment, in the table's order. */
export const WALLET_MOMENTS: readonly WalletMoment[] = [
  'trayOpen',
  'trayStep',
  'save',
  'savedToast',
  'walletOpen',
  'hideAmounts',
  'budgetBar',
  'walletAdded',
  'recap',
  'page',
];

export type MotionSpec =
  | { kind: 'spring'; spring: 'snappy' | 'gentle' | 'bouncy' }
  | { kind: 'morph' }
  | { kind: 'fly' }
  | { kind: 'grow'; durationMs: number }
  | { kind: 'confetti' }
  | { kind: 'system' }
  | { kind: 'fade'; durationMs: 150 | 200 }
  | { kind: 'instant' };

export type MotionPlan = { motion: MotionSpec; haptic: HapticMoment | null };

type Row = { full: MotionSpec; reduced: MotionSpec; haptic: HapticMoment | null };

// ax-motion, row by row: full motion, then Reduce Motion, then the haptic.
const TABLE: Readonly<Record<WalletMoment, Row>> = {
  // The tray springs up from below; it fades in.
  trayOpen: { full: { kind: 'spring', spring: 'gentle' }, reduced: { kind: 'fade', durationMs: 150 }, haptic: null },
  // Its height morphs; a crossfade, and the height jumps.
  trayStep: { full: { kind: 'morph' }, reduced: { kind: 'fade', durationMs: 150 }, haptic: 'trayStep' },
  // The record flies into its card; a 200 ms crossfade.
  save: { full: { kind: 'fly' }, reduced: { kind: 'fade', durationMs: 200 }, haptic: null },
  // The saved toast slides down; it fades in place.
  savedToast: { full: { kind: 'spring', spring: 'snappy' }, reduced: { kind: 'fade', durationMs: 150 }, haptic: null },
  // The card lifts and the stack spreads; an instant switch.
  walletOpen: { full: { kind: 'spring', spring: 'gentle' }, reduced: { kind: 'instant' }, haptic: 'walletOpen' },
  // The amounts fade out; an instant swap to the mask.
  hideAmounts: { full: { kind: 'fade', durationMs: 150 }, reduced: { kind: 'instant' }, haptic: null },
  // The fill grows on open; it is drawn at its value.
  budgetBar: { full: { kind: 'grow', durationMs: 320 }, reduced: { kind: 'instant' }, haptic: null },
  // The new card drops into the stack; it fades in.
  walletAdded: { full: { kind: 'spring', spring: 'bouncy' }, reduced: { kind: 'fade', durationMs: 150 }, haptic: 'walletAdded' },
  // Confetti; no confetti, and one haptic.
  recap: { full: { kind: 'confetti' }, reduced: { kind: 'instant' }, haptic: 'celebration' },
  // Pages and tabs move as the system moves them, in both.
  page: { full: { kind: 'system' }, reduced: { kind: 'system' }, haptic: null },
};

/** What a moment plays: its motion at full motion or under Reduce Motion, and its haptic, the same in both. */
export function motionFor(moment: WalletMoment, reducedMotion: boolean): MotionPlan {
  const row = TABLE[moment];
  return { motion: reducedMotion ? row.reduced : row.full, haptic: row.haptic };
}
