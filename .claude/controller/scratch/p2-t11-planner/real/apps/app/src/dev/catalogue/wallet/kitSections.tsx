// The Bun Wallet kit's catalogue sections (plan P2, development only), drawn
// on the wallet's ground: money text (bw-amounts) and private mode
// (bw-private), from P2-T10; the materials and Bun's faces (bw-materials),
// the wallet card (bw-card) and category icons (bw-category-icons), from
// P2-T11; later kit tasks add theirs to this list.
//
// The catalogue's tests draw sections without the wallet root, and the app
// draws them inside it. So a section follows the private mode around it
// (outside a provider, amounts show), and a section that needs one state
// mounts its own PrivateModeProvider over a store kept in memory: the
// catalogue never changes the person's own setting. Cards take their look as
// a prop, and a category tile outside the wallet's looks shows no kept icon,
// so no section reads the person's kept looks. A section never imports the
// wallet test harness, which loads vitest.
import { BUILTIN_CATEGORIES, CATEGORY_COLORS } from '@gogospend/contracts';
import type { CategoryDto } from '@gogospend/contracts';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { THAI_EVERYDAY_PACK } from '@mobile/spend/v1/redesign/planning/thaiPack';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { WALLET_MATERIALS } from '@mobile/theme/walletPalette';
import { BUN_RADIUS, BUN_SPACE } from '@mobile/ui/layout';
import { WalletCard } from '@mobile/wallet/card/WalletCard';
import type { WalletCardModel } from '@mobile/wallet/card/WalletCard';
import { BunFace } from '@mobile/wallet/looks/BunFace';
import { CATEGORY_PICKER_GLYPHS } from '@mobile/wallet/looks/categoryGlyphs';
import { MaterialFill } from '@mobile/wallet/looks/MaterialFill';
import { CategoryGlyph, WalletCategoryIcon } from '@mobile/wallet/looks/WalletCategoryIcon';
import { BUN_FACES } from '@mobile/wallet/looks/walletLooks';
import type { WalletLook } from '@mobile/wallet/looks/walletLooks';
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

function MaterialsSection() {
  return (
    <WalletGround>
      <Specimen label="The five materials: a 135 degree gradient each; dark titanium adds a 1 pt edge">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: BUN_SPACE.sm }}>
          {WALLET_MATERIALS.map((material) => (
            <View key={material} style={{ gap: BUN_SPACE.xxs }}>
              <View style={{ width: 96, height: 60 }}>
                <MaterialFill material={material} radius={14} />
              </View>
              <SpecimenLabel>{material}</SpecimenLabel>
            </View>
          ))}
        </View>
      </Specimen>
      <Specimen label="Bun's five faces: smile, wink, calm, happy, wow">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: BUN_SPACE.sm }}>
          {BUN_FACES.map((face) => <BunFace key={face} face={face} size={38} />)}
        </View>
      </Specimen>
    </WalletGround>
  );
}

const CARD_LOOKS = {
  cash: { kind: 'cash', material: 'paper', face: 'wink' },
  bank: { kind: 'bank', material: 'silk', face: 'smile' },
  credit: { kind: 'credit_card', material: 'titanium', face: 'calm' },
  transit: { kind: 'transit', material: 'sky', face: 'wow' },
} as const satisfies Readonly<Record<string, WalletLook>>;

const CASH_WALLET: WalletCardModel = { id: 'bw-card-cash', name: 'เงินสด', balanceMinor: '124000' };
const MAIN_WALLET: WalletCardModel = { id: 'bw-card-main', name: 'บัญชีหลัก', balanceMinor: '2486000', todayOutMinor: '4700' };
const CREDIT_WALLET: WalletCardModel = { id: 'bw-card-credit', name: 'บัตรเครดิต', balanceMinor: '-392000' };
const SAVING_WALLET: WalletCardModel = { id: 'bw-card-saving', name: 'บัญชีหลัก', balanceMinor: '2481000', pendingMinor: '5000', todayOutMinor: '9700' };
const TRANSIT_WALLET: WalletCardModel = { id: 'bw-card-transit', name: 'บัตรเดินทาง', balanceMinor: '18600' };

function CardSection() {
  // The private card pins its own preview, hidden; the eye elsewhere never changes it.
  const [hiddenStore] = useState(() => memoryStore({ [PRIVATE_MODE_NAME]: '1' }));
  return (
    <WalletGround>
      <Specimen label="Cash"><WalletCard wallet={CASH_WALLET} look={CARD_LOOKS.cash} variant="stack" /></Specimen>
      <Specimen label="Bank, with today's spending: the stack's front card"><WalletCard wallet={MAIN_WALLET} look={CARD_LOOKS.bank} variant="stack" /></Specimen>
      <Specimen label="Credit card: what was spent"><WalletCard wallet={CREDIT_WALLET} look={CARD_LOOKS.credit} variant="stack" /></Specimen>
      <Specimen label="A pending total: drafts still saving"><WalletCard wallet={SAVING_WALLET} look={CARD_LOOKS.bank} variant="stack" /></Specimen>
      <Specimen label="Private mode: every amount masked, each line in place">
        <PrivateModeProvider store={hiddenStore}>
          <WalletCard wallet={SAVING_WALLET} look={CARD_LOOKS.bank} variant="stack" />
        </PrivateModeProvider>
      </Specimen>
      <Specimen label="Full: the wallet's own page, with its kind line">
        <WalletCard wallet={{ ...MAIN_WALLET, todayOutMinor: null }} look={CARD_LOOKS.bank} variant="full" />
      </Specimen>
      <Specimen label="Spine: the largest text sizes"><WalletCard wallet={TRANSIT_WALLET} look={CARD_LOOKS.transit} variant="spine" /></Specimen>
    </WalletGround>
  );
}

type TileCategory = Pick<CategoryDto, 'id' | 'type' | 'label' | 'builtin_key' | 'color'>;

/** A built-in, two pack categories (recognised by name), a custom one and one with no colour. */
const TILE_CATEGORIES: readonly { category: TileCategory; name: string }[] = [
  ...BUILTIN_CATEGORIES.filter((builtin) => ['food', 'travel', 'salary'].includes(builtin.key)).map((builtin) => ({
    category: { id: `bw-icon-${builtin.key}`, type: builtin.type, label: null, builtin_key: builtin.key, color: builtin.color },
    name: builtin.key,
  })),
  ...THAI_EVERYDAY_PACK.filter((item) => item.key === 'merit' || item.key === 'delivery').map((item) => ({
    category: { id: `bw-icon-${item.key}`, type: item.type, label: item.th, builtin_key: null, color: item.color },
    name: item.th,
  })),
  { category: { id: 'bw-icon-art', type: 'expense', label: 'Art', builtin_key: null, color: CATEGORY_COLORS[8] }, name: 'Art' },
  { category: { id: 'bw-icon-savings', type: 'expense', label: 'ออมเงิน', builtin_key: null, color: null }, name: 'ออมเงิน' },
];

function CategoryIconsSection() {
  const colors = useWalletColors();
  return (
    <WalletGround>
      <Specimen label="The icon picker's twelve (wc-category-edit), each a 2 pt round stroke">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: BUN_SPACE.xs }}>
          {CATEGORY_PICKER_GLYPHS.map((glyph) => (
            <View key={glyph} style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' }}>
              <CategoryGlyph glyph={glyph} size={22} color={colors.ink} />
            </View>
          ))}
        </View>
      </Specimen>
      <Specimen label="Tiles: built-ins, the Thai pack by name, a custom initial, no colour">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: BUN_SPACE.xs }}>
          {TILE_CATEGORIES.map(({ category, name }) => <WalletCategoryIcon key={category.id} category={category} name={name} />)}
        </View>
      </Specimen>
    </WalletGround>
  );
}

export const WALLET_KIT_SECTIONS: readonly CatalogueSection[] = [
  { id: 'bw-amounts', title: 'Bun Wallet: amounts', group: 'Kit', render: () => <AmountsSection /> },
  { id: 'bw-private', title: 'Bun Wallet: private mode', group: 'Kit', render: () => <PrivateSection /> },
  { id: 'bw-materials', title: 'Bun Wallet: materials and faces', group: 'Kit', render: () => <MaterialsSection /> },
  { id: 'bw-card', title: 'Bun Wallet: wallet card', group: 'Kit', render: () => <CardSection /> },
  { id: 'bw-category-icons', title: 'Bun Wallet: category icons', group: 'Kit', render: () => <CategoryIconsSection /> },
];
