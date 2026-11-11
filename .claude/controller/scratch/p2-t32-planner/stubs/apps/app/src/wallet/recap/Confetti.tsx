import type { ReactElement } from 'react';

export const CONFETTI_NAME = (month: string) => `recap-confetti-${month}`;

export function Confetti(props?: { durationMs?: number; testID?: string }): ReactElement | null {
  return null;
}
