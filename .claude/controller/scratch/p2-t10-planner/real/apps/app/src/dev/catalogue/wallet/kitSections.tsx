// The Bun Wallet kit's catalogue sections (plan P2, development only), drawn
// on the wallet's ground: money text (bw-amounts) and private mode
// (bw-private), from P2-T10; later kit tasks add theirs to this list.
//
// The catalogue's tests draw sections without the wallet root, and the app
// draws them inside it. So a section follows the private mode around it
// (outside a provider, amounts show), and a section that needs one state
// mounts its own PrivateModeProvider over a store kept in memory: the
// catalogue never changes the person's own setting. A section never imports
// the wallet test harness, which loads vitest.
import { useState } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { BUN_RADIUS, BUN_SPACE } from '@mobile/ui/layout';
import { WalletAmount } from '@mobile/wallet/money/WalletAmount';
import type { WalletAmountSize } from '@mobile/wallet/money/WalletAmount';
import { PrivateEyeButton } from '@mobile/wallet/privacy/PrivateEyeButton';
import { PRIVATE_MODE_NAME, PrivateModeProvider } from '@mobile/wallet/privacy/PrivateModeProvider';
import { PrivateTip } from '@mobile/wallet/privacy/PrivateTip';
import type { KeyValueStore } from '@mobile/wallet/store/walletStore';
import { Specimen, SpecimenLabel, SpecimenRow } from '../parts';
import type { CatalogueSection } from '../registry';

const SIZES: readonly WalletAmountSize[] = [58, 44, 36, 34, 28, 22, 17, 16, 13];

/** A device store in memory, for a section that pins its own state. */
function memoryStore(seed: Readonly<Record<string, string>>): KeyValueStore {
  const kept = new Map(Object.entries(seed));
  return {
    get: async (name) => kept.get(name) ?? null,
    set: async (name, value) => {
      kept.set(name, value);
    },
    remove: async (name) => {
      kept.delete(name);
    },
    eraseAll: async () => {
      kept.clear();
    },
  };
}

function WalletGround({ children }: { children: ReactNode }) {
  const colors = useWalletColors();
  return (
    <View style={{ backgroundColor: colors.ground, borderRadius: BUN_RADIUS.card, padding: BUN_SPACE.md, gap: BUN_SPACE.sm }}>
      {children}
    </View>
  );
}

function AmountsSection() {
  return (
    <WalletGround>
      <Specimen label="Sizes 58 to 13: each grows with the text size, to 64 pt at most">
        <View style={{ gap: BUN_SPACE.xxs }}>
          {SIZES.map((size) => <WalletAmount key={size} minor="1248000" size={size} />)}
        </View>
      </Specimen>
      <SpecimenRow label="Exact"><WalletAmount minor="5000" exact size={17} /></SpecimenRow>
      <SpecimenRow label="With satang"><WalletAmount minor="5025" size={17} /></SpecimenRow>
      <SpecimenRow label="In a list"><WalletAmount minor="5000" size={17} /></SpecimenRow>
      <SpecimenRow label="Expense"><WalletAmount minor="5000" sign="expense" size={17} /></SpecimenRow>
      <SpecimenRow label="Income"><WalletAmount minor="3500000" sign="income" size={17} /></SpecimenRow>
      <SpecimenRow label="Below zero"><WalletAmount minor="-392000" sign="balance" size={17} /></SpecimenRow>
      <SpecimenRow label="Quiet, under, over">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: BUN_SPACE.sm }}>
          <WalletAmount minor="69000" size={17} tone="quiet" />
          <WalletAmount minor="69000" size={17} tone="under" />
          <WalletAmount minor="42000" size={17} tone="over" />
        </View>
      </SpecimenRow>
      <SpecimenRow label="Largest, exact"><WalletAmount minor="99999999999" exact size={28} /></SpecimenRow>
    </WalletGround>
  );
}

function PrivateSection() {
  // Hidden, with the tip not yet closed; the eye and the close change this preview only.
  const [store] = useState(() => memoryStore({ [PRIVATE_MODE_NAME]: '1' }));
  return (
    <PrivateModeProvider store={store}>
      <WalletGround>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: BUN_SPACE.sm }}>
          <View style={{ flex: 1 }}>
            <SpecimenLabel>The eye: one tap hides every amount, the next shows them</SpecimenLabel>
          </View>
          <PrivateEyeButton />
        </View>
        <PrivateTip />
        <Specimen label="Each amount keeps its size and line, so rows never change height">
          <View style={{ gap: BUN_SPACE.xxs }}>
            {([58, 28, 17, 13] as const).map((size) => <WalletAmount key={size} minor="1248000" size={size} />)}
          </View>
        </Specimen>
        <SpecimenRow label="Income"><WalletAmount minor="3500000" sign="income" size={17} /></SpecimenRow>
      </WalletGround>
    </PrivateModeProvider>
  );
}

export const WALLET_KIT_SECTIONS: readonly CatalogueSection[] = [
  { id: 'bw-amounts', title: 'Bun Wallet: amounts', group: 'Kit', render: () => <AmountsSection /> },
  { id: 'bw-private', title: 'Bun Wallet: private mode', group: 'Kit', render: () => <PrivateSection /> },
];
