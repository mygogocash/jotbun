// RED stub (P2-T9): the plan's interface, with no behaviour yet: every moment
// plays one placeholder spring and no haptic.
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

export function motionFor(_moment: WalletMoment, _reducedMotion: boolean): MotionPlan {
  return { motion: { kind: 'spring', spring: 'gentle' }, haptic: null };
}
