// RED stub (P2-T11): the plan's interface, with no behaviour yet.
import type { CategoryDto } from '@gogospend/contracts';
import type { ReactNode } from 'react';

import type { GlyphKey } from './categoryGlyphs';
import { derivedLook } from './walletLooks';
import type { WalletLook } from './walletLooks';

export const LOOKS_NAME = '';
export const WALLET_ORDER_NAME = '';
export const CATEGORY_ICONS_NAME = '';

export type WalletLooks = {
  lookOf(walletId: string): WalletLook;
  setLook(walletId: string, look: WalletLook): Promise<void>;
  order: readonly string[];
  setOrder(ids: readonly string[]): Promise<void>;
};

export type CategoryIcons = {
  iconOf(category: Pick<CategoryDto, 'id' | 'type' | 'label' | 'builtin_key'>): GlyphKey | null;
  setIcon(categoryId: string, icon: GlyphKey): Promise<void>;
};

const keepNothing = () => Promise.resolve();

export function WalletLooksProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useWalletLooks(): WalletLooks {
  return { lookOf: derivedLook, setLook: keepNothing, order: [], setOrder: keepNothing };
}

export function useCategoryIcons(): CategoryIcons {
  return { iconOf: () => null, setIcon: keepNothing };
}
