// RED stub (P2-T18): the interface, with no behaviour yet.
import type { AddType } from '../add/addFlow.ts';

export type WalletTabKey = 'wallets' | 'insights';
export type WalletTab = { visible: boolean; active: WalletTabKey | null };

export const WALLET_TAB_ROUTES: Readonly<Record<WalletTabKey, '/spend' | '/spend/insights'>> = { wallets: '/spend', insights: '/spend/insights' };

export const WALLET_TAB_INSET = 0;
export const WALLET_TAB_INSET_LARGE = 0;

export function walletTab(pathname: string): WalletTab {
  void pathname;
  return { visible: false, active: null };
}

export function walletTabInset(visible: boolean, large: boolean): number {
  void visible;
  void large;
  return 0;
}

export function addRequestOf(params: Readonly<Record<string, unknown>>): { type?: AddType; walletId?: string; copyOf?: string } {
  void params;
  return {};
}
