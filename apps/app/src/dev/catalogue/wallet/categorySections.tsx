// The Bun Wallet's categories catalogue sections (P2-T29, development only):
// - bw-categories: the categories screen with built-in and custom categories;
// - bw-category-new: the category tray creating a new category;
// - bw-category-limit: the category tray editing an expense limit with total;
// - bw-thai-pack: the Thai everyday pack tray with picked and held items.
// All sections draw the real components on fakes.
import { CATEGORY_COLORS } from '@gogospend/contracts';
import type { BudgetDto, CategoryDto } from '@gogospend/contracts';
import { useState } from 'react';
import { View } from 'react-native';

import { BUILTINS, createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
import { SpendV1Provider } from '@mobile/spend/v1/SpendV1Context';
import { ThemeProvider } from '@mobile/theme/ThemeProvider';
import { WalletRoot } from '@mobile/wallet/WalletRoot';
import { CategoryTray } from '@mobile/wallet/categories/CategoryTray';
import { ThaiPackTray } from '@mobile/wallet/categories/ThaiPackTray';
import { WalletCategoriesScreen } from '@mobile/wallet/categories/WalletCategoriesScreen';
import { Specimen } from '../parts';
import type { CatalogueSection } from '../registry';

const NOW = new Date('2026-09-29T03:00:00Z');

const [FOOD, TRAVEL, BILLS, SALARY, GIFT] = BUILTINS;
const PETS: CategoryDto = {
  id: '0000000c-0000-4000-8000-0000000000a1',
  type: 'expense',
  builtin_key: null,
  label: 'Pets',
  color: CATEGORY_COLORS[2],
  archived: false,
  version: 1,
};
const COFFEE: CategoryDto = {
  id: '0000000c-0000-4000-8000-0000000000a2',
  type: 'expense',
  builtin_key: null,
  label: 'Coffee',
  color: CATEGORY_COLORS[0],
  archived: false,
  version: 1,
};

const SAMPLE_CATEGORIES: CategoryDto[] = [FOOD, TRAVEL, BILLS, SALARY, GIFT, PETS, COFFEE];

const BUDGET: BudgetDto = {
  id: '0000000d-0000-4000-8000-000000000001',
  month: '2026-09',
  overall_limit_minor: '2000000',
  category_limits: [
    { category_id: FOOD.id, limit_minor: '600000' },
    { category_id: TRAVEL.id, limit_minor: '300000' },
  ],
  version: 1,
};

function fakeResources() {
  return createFakeResources({
    wallets: goldenSeed().wallets,
    categories: SAMPLE_CATEGORIES,
    budgets: [BUDGET],
  });
}

import { LanguageProvider } from '@mobile/i18n/LanguageProvider';

function SectionWrapper({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider device="th">
      <ThemeProvider>
        <WalletRoot>
          {children}
        </WalletRoot>
      </ThemeProvider>
    </LanguageProvider>
  );
}

function CategoriesGridSection() {
  const fake = fakeResources();
  return (
    <SectionWrapper>
      <Specimen label="The Bun Wallet categories screen: active built-ins and custom categories in 104 pt tiles">
        <View style={{ height: 600 }}>
          <SpendV1Provider resources={fake.resources}>
            <WalletCategoriesScreen now={NOW} onBack={() => {}} />
          </SpendV1Provider>
        </View>
      </Specimen>
    </SectionWrapper>
  );
}

function CategoryTrayNewSection() {
  const [visible, setVisible] = useState(true);
  const fake = fakeResources();
  return (
    <SectionWrapper>
      <Specimen label="New category tray: 12 glyphs at 48 pt, 7 swatches at 44 pt, name and limit switch">
        <View style={{ height: 500 }}>
          <SpendV1Provider resources={fake.resources}>
            <CategoryTray
              visible={visible}
              onClose={() => setVisible(false)}
              category={null}
              type="expense"
              now={NOW}
            />
          </SpendV1Provider>
        </View>
      </Specimen>
    </SectionWrapper>
  );
}

function CategoryTrayLimitSection() {
  const [visible, setVisible] = useState(true);
  const fake = fakeResources();
  return (
    <SectionWrapper>
      <Specimen label="Category tray with limit: monthly limit input with total and over-budget refusal">
        <View style={{ height: 500 }}>
          <SpendV1Provider resources={fake.resources}>
            <CategoryTray
              visible={visible}
              onClose={() => setVisible(false)}
              category={FOOD}
              type="expense"
              now={NOW}
            />
          </SpendV1Provider>
        </View>
      </Specimen>
    </SectionWrapper>
  );
}

function ThaiPackTraySection() {
  const [visible, setVisible] = useState(true);
  const fake = fakeResources();
  return (
    <SectionWrapper>
      <Specimen label="Thai everyday pack tray: 44 pt checkbox rows for 9 C3 items with held badges">
        <View style={{ height: 500 }}>
          <SpendV1Provider resources={fake.resources}>
            <ThaiPackTray
              visible={visible}
              onClose={() => setVisible(false)}
              categories={SAMPLE_CATEGORIES}
            />
          </SpendV1Provider>
        </View>
      </Specimen>
    </SectionWrapper>
  );
}

export const WALLET_CATEGORY_SECTIONS: readonly CatalogueSection[] = [
  {
    id: 'bw-categories',
    title: 'Bun Wallet: categories grid',
    group: 'Screens',
    render: () => <CategoriesGridSection />,
  },
  {
    id: 'bw-category-new',
    title: 'Bun Wallet: category tray, new',
    group: 'Screens',
    render: () => <CategoryTrayNewSection />,
  },
  {
    id: 'bw-category-limit',
    title: 'Bun Wallet: category tray with limit',
    group: 'Screens',
    render: () => <CategoryTrayLimitSection />,
  },
  {
    id: 'bw-thai-pack',
    title: 'Bun Wallet: Thai everyday pack tray',
    group: 'Screens',
    render: () => <ThaiPackTraySection />,
  },
];
