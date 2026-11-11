// The card stack's catalogue sections (P2-T12, development only), drawn on the
// wallet's ground: bw-home's four wallets as the stack (bw-stack), and a
// stack whose front card has the longest Thai name, the largest amount, a
// pending total and today's money out, to capture at AX5, where the stack is
// one column of spine cards, front card first (bw-stack-large). Their own list
// beside kitSections.tsx, spread after the kit's in ./index.ts (plan order:
// P2-T12's stack before P2-T13's trays). A press ticks and lifts its card and
// opens nothing here. The sections take no kept look and no frame provider. A
// section never imports the wallet test harness, which loads vitest.
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { BUN_RADIUS, BUN_SPACE } from '@mobile/ui/layout';
import { CardStack } from '@mobile/wallet/card/CardStack';
import type { StackWallet } from '@mobile/wallet/card/CardStack';
import type { WalletLook } from '@mobile/wallet/looks/walletLooks';
import { SpecimenLabel } from '../parts';
import type { CatalogueSection } from '../registry';

const LOOKS = {
  credit: { kind: 'credit_card', material: 'titanium', face: 'calm' },
  transit: { kind: 'transit', material: 'sky', face: 'wow' },
  cash: { kind: 'cash', material: 'paper', face: 'wink' },
  bank: { kind: 'bank', material: 'silk', face: 'smile' },
} as const satisfies Readonly<Record<string, WalletLook>>;

/** bw-home's four wallets, back to front: the front card shows today's money out. */
const HOME_STACK: readonly StackWallet[] = [
  { id: 'bw-stack-credit', name: 'บัตรเครดิต', balanceMinor: '-392000', look: LOOKS.credit },
  { id: 'bw-stack-transit', name: 'บัตรเดินทาง', balanceMinor: '18600', look: LOOKS.transit },
  { id: 'bw-stack-cash', name: 'เงินสด', balanceMinor: '124000', look: LOOKS.cash },
  { id: 'bw-stack-main', name: 'บัญชีหลัก', balanceMinor: '2486000', todayOutMinor: '4700', look: LOOKS.bank },
];

/** 80 code points of Thai (Review Focus 3). */
const LONG_NAME = 'บัญชีออมทรัพย์สำหรับค่าเทอมลูกและค่าใช้จ่ายในบ้านของครอบครัวใหญ่ทุกเดือนตลอดปีนะ';

/** The longest name and the largest amount on the front card, which comes first at AX5. */
const LARGE_STACK: readonly StackWallet[] = [
  ...HOME_STACK.slice(0, 3),
  { id: 'bw-stack-long', name: LONG_NAME, balanceMinor: '99999999999', pendingMinor: '5000', todayOutMinor: '99999999999', look: LOOKS.bank },
];

const noop = () => undefined;

function StackGround({ label, children }: { label: string; children: ReactNode }) {
  const colors = useWalletColors();
  return (
    <View style={{ backgroundColor: colors.ground, borderRadius: BUN_RADIUS.card, padding: BUN_SPACE.md, gap: BUN_SPACE.sm }}>
      <SpecimenLabel>{label}</SpecimenLabel>
      {children}
    </View>
  );
}

export const WALLET_STACK_SECTIONS: readonly CatalogueSection[] = [
  {
    id: 'bw-stack',
    title: 'Bun Wallet: card stack',
    group: 'Kit',
    render: () => (
      <StackGround label="bw-home's stack: each card 54 pt below the one before, the front card whole with today's money out; a press ticks and lifts the card 12 pt">
        <CardStack wallets={HOME_STACK} onOpen={noop} />
      </StackGround>
    ),
  },
  {
    id: 'bw-stack-large',
    title: 'Bun Wallet: card stack, largest text',
    group: 'Kit',
    render: () => (
      <StackGround label="Capture at AX5: one column of spine cards, front card first, the longest name and the largest amount whole">
        <CardStack wallets={LARGE_STACK} onOpen={noop} />
      </StackGround>
    ),
  },
];
