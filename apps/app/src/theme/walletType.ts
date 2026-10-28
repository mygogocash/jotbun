// Bun Wallet type roles (W30). WalletText draws every role in Anuphan.
// Thai leading is taller because marks sit above and below the line.
export type WalletTextRole = 'h1' | 'h2' | 'body' | 'label' | 'caption';
type WalletWeight = '400' | '500' | '700';

export const WALLET_TYPE: Readonly<Record<WalletTextRole, { readonly size: number; readonly weight: WalletWeight; readonly maxScale: number }>> = {
  h1: { size: 28, weight: '700', maxScale: 2.07 },
  h2: { size: 18, weight: '700', maxScale: 2.4 },
  body: { size: 17, weight: '400', maxScale: 3.12 },
  label: { size: 15, weight: '500', maxScale: 3.12 },
  caption: { size: 13, weight: '400', maxScale: 3.38 },
};

/** An amount grows no more than body text, and never past 64 pt. */
export function amountMaxScale(size: number): number {
  return Math.min(WALLET_TYPE.body.maxScale, 64 / size);
}

export function walletLineHeight(size: number, script: 'thai' | 'latin'): number {
  return Math.ceil(size * (script === 'thai' ? 1.5 : 1.3));
}
