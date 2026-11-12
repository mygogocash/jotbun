// RED stub (P2-T16): the plan's interface, with no behaviour yet.
import type { ReactNode } from 'react';

import type { SavedEntry } from '@mobile/screens/redesign/entry/entrySave';
import type { Lookups } from '@mobile/spend/v1/redesign/shared';
import type { AddType } from './addFlow';

export type AddRequest = { type?: AddType; walletId?: string; copyOf?: string };
export type SavedContext = { lookups: Lookups; offline: boolean };
export type AddTray = { open(request?: AddRequest): void; close(): void; isOpen: boolean; blocked: boolean; whenClosed(run: () => void): void };

const NOTHING: AddTray = { open: () => undefined, close: () => undefined, isOpen: false, blocked: false, whenClosed: () => undefined };

export function useAddTray(): AddTray {
  return NOTHING;
}

export function AddTrayHost({ children }: { children: ReactNode; onSaved?: (saved: SavedEntry, context: SavedContext) => void; blocked?: boolean }) {
  return <>{children}</>;
}
