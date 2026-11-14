// Where the wallet shell's bar shows, and what /spend/add asks the add tray
// (P2-T18; bw-home, W13, ax-large-home rule 8). Pure: a Node test reads it.
//
// - The bar (with the floating +) shows on Home (/spend) and Insights
//   (/spend/insights) only. Every other spend screen (a wallet, a record,
//   History, setup, budget, the add route) has the whole height and its own
//   way back. ฉัน opens Settings, outside the shell, so it is never selected.
// - The bar is a row of the layout under the screen, never over it. A screen
//   keeps its last row clear of the +, which floats 16 pt above the bar: the
//   inset is bw-home's 84 pt at the standard sizes (16 + the + button's 60 + 8)
//   and ax-large-home's 96 pt at the largest, and 0 where the bar is hidden.
// - /spend/add in the wallet area opens the add tray with what its link names:
//   the type (spending, income or a move), the wallet and a record to copy.
//   Anything else in the link is left out.
import type { AddType } from '../add/addFlow.ts';

export type WalletTabKey = 'wallets' | 'insights';
export type WalletTab = { visible: boolean; active: WalletTabKey | null };

/** The tabs' routes. */
export const WALLET_TAB_ROUTES: Readonly<Record<WalletTabKey, '/spend' | '/spend/insights'>> = { wallets: '/spend', insights: '/spend/insights' };

/** A screen's bottom inset under the bar at the standard text sizes (bw-home's 84 pt bar), and at the largest (ax-large-home). */
export const WALLET_TAB_INSET = 84;
export const WALLET_TAB_INSET_LARGE = 96;

const ADD_TYPES: readonly AddType[] = ['expense', 'income', 'transfer'];

/** Whether the bar shows on `pathname`, and which tab it selects. */
export function walletTab(pathname: string): WalletTab {
  const path = `/${pathname.split('/').filter((part) => part !== '').join('/')}`;
  if (path === WALLET_TAB_ROUTES.wallets) return { visible: true, active: 'wallets' };
  if (path === WALLET_TAB_ROUTES.insights) return { visible: true, active: 'insights' };
  return { visible: false, active: null };
}

/** The inset a screen keeps under the bar: none where the bar is hidden. */
export function walletTabInset(visible: boolean, large: boolean): number {
  if (!visible) return 0;
  return large ? WALLET_TAB_INSET_LARGE : WALLET_TAB_INSET;
}

/** What /spend/add's link asks the add tray: a known type, a wallet and a record to copy, each only when named. */
export function addRequestOf(params: Readonly<Record<string, unknown>>): { type?: AddType; walletId?: string; copyOf?: string } {
  const named = (key: string) => {
    const value = params[key];
    return typeof value === 'string' && value !== '' ? value : undefined;
  };
  const type = ADD_TYPES.find((each) => each === params.type);
  const walletId = named('walletId');
  const copyOf = named('copyOf');
  return {
    ...(type === undefined ? {} : { type }),
    ...(walletId === undefined ? {} : { walletId }),
    ...(copyOf === undefined ? {} : { copyOf }),
  };
}
