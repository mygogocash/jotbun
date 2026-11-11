// RED stub (P2-T10): the plan's interface, with no behaviour yet.
import type { Minor } from '@gogospend/contracts';

import type { WalletT } from '../copy/draftText.ts';

export type MoneySign = 'none' | 'expense' | 'income' | 'balance';

export const HIDDEN_AMOUNT = '';

export function walletMoneyText(minor: Minor, _options: { sign?: MoneySign; exact?: boolean } = {}): string {
  return minor;
}

export function perDayText(perDayMinor: Minor): string {
  return perDayMinor;
}

export function spokenMoney(minor: Minor, _t: WalletT): string {
  return minor;
}
