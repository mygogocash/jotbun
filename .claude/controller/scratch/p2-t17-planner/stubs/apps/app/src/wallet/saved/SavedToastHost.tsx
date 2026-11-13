// RED stub (P2-T17): the plan's interface, with no behaviour yet.
import type { ReactNode } from 'react';

import { motion } from '@mobile/theme/motion';
import type { SavedNotice } from './savedMoment';

export type SavedToast = { show(notice: SavedNotice): void };

export const TOTAL_WAIT_MS = 600;
export const TOAST_MS = motion.duration.toastLong;

const NOWHERE: SavedToast = { show: () => undefined };

export function useSavedToast(): SavedToast {
  return NOWHERE;
}

export function SavedToastHost({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
