// The Bun Wallet insights catalogue sections (P2-T31, development only):
// standard spending (bw-insights), in-out (bw-insights-in-out), calendar (bw-calendar),
// early state (bw-insights-early), private mode (bw-insights-private), and large text (bw-insights-large).
import type { CategoryDto, MonthSummary, TransactionDto } from '@gogospend/contracts';
import { lazy, Suspense } from 'react';
import { View } from 'react-native';

import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { BUN_SPACE } from '@mobile/ui/layout';
import { PRIVATE_MODE_NAME, PrivateModeProvider } from '@mobile/wallet/privacy/PrivateModeProvider';
import type { KeyValueStore } from '@mobile/wallet/store/walletStore';
import { Specimen, SpecimenLabel } from '../parts';
import type { CatalogueSection } from '../registry';
import type { InsightsData } from '../../../wallet/insights/insightsData';

const SpendingTab = lazy(() => import('../../../wallet/insights/SpendingTab').then((m) => ({ default: m.SpendingTab })));
const InOutTab = lazy(() => import('../../../wallet/insights/InOutTab').then((m) => ({ default: m.InOutTab })));
const CalendarTab = lazy(() => import('../../../wallet/insights/CalendarTab').then((m) => ({ default: m.CalendarTab })));

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

const SAMPLE_MONTH = '2026-10';
const SAMPLE_TODAY = '2026-10-24';

const SAMPLE_CATEGORIES: CategoryDto[] = [
  { id: 'c-food', type: 'expense', builtin_key: 'food', label: 'อาหาร', color: '#FFE3CC', archived: false, version: 1 },
  { id: 'c-fam', type: 'expense', builtin_key: 'household', label: 'ส่งให้ครอบครัว', color: '#FFDDE6', archived: false, version: 1 },
  { id: 'c-shop', type: 'expense', builtin_key: 'shopping', label: 'ช้อปปิ้ง', color: '#E9E1FF', archived: false, version: 1 },
  { id: 'c-trav', type: 'expense', builtin_key: 'travel', label: 'เดินทาง', color: '#DCE8FF', archived: false, version: 1 },
];

const SAMPLE_SUMMARY: MonthSummary = {
  month: SAMPLE_MONTH,
  expense_minor: '1248000',
  income_minor: '3500000',
  balance_minor: '2252000',
  by_wallet: {},
  as_of_revision: '1',
  budget: {
    overall_limit_minor: '1800000',
    spent_minor: '1248000',
    remaining_minor: '552000',
    categories: [],
  },
  categories: [
    { category_id: 'c-food', type: 'expense', total_minor: '462000' },
    { category_id: 'c-fam', type: 'expense', total_minor: '300000' },
    { category_id: 'c-shop', type: 'expense', total_minor: '231000' },
    { category_id: 'c-trav', type: 'expense', total_minor: '198000' },
  ],
};

const SAMPLE_RECORDS: TransactionDto[] = [
  { id: 'r1', type: 'expense', amount_minor: '324000', occurred_on: '2026-10-01', wallet_id: 'w1', category_id: 'c-food', note: 'Dinner', merchant: null, deleted_at: null, version: 1 },
  { id: 'r2', type: 'expense', amount_minor: '41200', occurred_on: '2026-10-02', wallet_id: 'w1', category_id: 'c-food', note: 'Lunch', merchant: null, deleted_at: null, version: 1 },
  { id: 'r3', type: 'expense', amount_minor: '18800', occurred_on: '2026-10-05', wallet_id: 'w1', category_id: 'c-trav', note: 'BTS', merchant: null, deleted_at: null, version: 1 },
  { id: 'r4', type: 'expense', amount_minor: '13200', occurred_on: '2026-10-24', wallet_id: 'w1', category_id: 'c-food', note: 'Coffee', merchant: 'Coffee', deleted_at: null, version: 1 },
];

function makeMonthSummary(month: string, expense: string, income: string): MonthSummary {
  return {
    month,
    expense_minor: expense,
    income_minor: income,
    balance_minor: (BigInt(income) - BigInt(expense)).toString(),
    by_wallet: {},
    as_of_revision: '1',
    budget: null,
    categories: [],
  };
}

const SAMPLE_DATA: InsightsData = {
  month: SAMPLE_MONTH,
  today: SAMPLE_TODAY,
  summary: SAMPLE_SUMMARY,
  categories: SAMPLE_CATEGORIES,
  records: SAMPLE_RECORDS,
  drafts: [],
  compare: [
    makeMonthSummary('2026-05', '1420000', '3000000'),
    makeMonthSummary('2026-06', '1580000', '3000000'),
    makeMonthSummary('2026-07', '1390000', '3200000'),
    makeMonthSummary('2026-08', '1640000', '3200000'),
    makeMonthSummary('2026-09', '1600000', '3500000'),
    makeMonthSummary('2026-10', '1248000', '3500000'),
  ],
  refreshSuggested: false,
};

function InsightsGround({ label, children }: { label: string; children: React.ReactNode }) {
  const colors = useWalletColors();
  return (
    <View style={{ backgroundColor: colors.ground, borderRadius: 20, padding: BUN_SPACE.md, gap: BUN_SPACE.sm }}>
      <SpecimenLabel>{label}</SpecimenLabel>
      <Suspense fallback={null}>
        {children}
      </Suspense>
    </View>
  );
}

export const WALLET_INSIGHTS_SECTIONS: readonly CatalogueSection[] = [
  {
    id: 'bw-insights',
    title: 'Bun Wallet: Insights spending',
    group: 'Kit',
    render: () => (
      <Specimen label="Bun Wallet: Insights spending">
        <InsightsGround label="สรุปการใช้จ่ายรายเดือน">
          <SpendingTab data={SAMPLE_DATA} month={SAMPLE_MONTH} today={SAMPLE_TODAY} />
        </InsightsGround>
      </Specimen>
    ),
  },
  {
    id: 'bw-insights-in-out',
    title: 'Bun Wallet: Insights in and out',
    group: 'Kit',
    render: () => (
      <Specimen label="Bun Wallet: Insights in and out">
        <InsightsGround label="เงินเข้า-ออกและที่เก็บได้">
          <InOutTab data={SAMPLE_DATA} month={SAMPLE_MONTH} today={SAMPLE_TODAY} />
        </InsightsGround>
      </Specimen>
    ),
  },
  {
    id: 'bw-calendar',
    title: 'Bun Wallet: Insights calendar',
    group: 'Kit',
    render: () => (
      <Specimen label="Bun Wallet: Insights calendar">
        <InsightsGround label="ปฏิทินรายจ่าย">
          <CalendarTab
            data={SAMPLE_DATA}
            month={SAMPLE_MONTH}
            today={SAMPLE_TODAY}
            onMonthChange={() => {}}
          />
        </InsightsGround>
      </Specimen>
    ),
  },
  {
    id: 'bw-insights-early',
    title: 'Bun Wallet: Insights early state',
    group: 'Kit',
    render: () => (
      <Specimen label="Bun Wallet: Insights early state">
        <InsightsGround label="สถานะเริ่มต้น (จดน้อยกว่า 3 วัน)">
          <SpendingTab
            data={{ ...SAMPLE_DATA, records: SAMPLE_RECORDS.slice(0, 2) }}
            month={SAMPLE_MONTH}
            today={SAMPLE_TODAY}
          />
        </InsightsGround>
      </Specimen>
    ),
  },
  {
    id: 'bw-insights-private',
    title: 'Bun Wallet: Insights private mode',
    group: 'Kit',
    render: () => (
      <Specimen label="Bun Wallet: Insights private mode">
        <PrivateModeProvider store={memoryStore({ [PRIVATE_MODE_NAME]: '1' })}>
          <InsightsGround label="Private mode (ซ่อนยอดเงิน)">
            <SpendingTab data={SAMPLE_DATA} month={SAMPLE_MONTH} today={SAMPLE_TODAY} />
          </InsightsGround>
        </PrivateModeProvider>
      </Specimen>
    ),
  },
  {
    id: 'bw-insights-large',
    title: 'Bun Wallet: Insights large text',
    group: 'Kit',
    render: () => (
      <Specimen label="Bun Wallet: Insights large text">
        <InsightsGround label="ขนาดตัวอักษรใหญ่">
          <SpendingTab data={SAMPLE_DATA} month={SAMPLE_MONTH} today={SAMPLE_TODAY} />
        </InsightsGround>
      </Specimen>
    ),
  },
];
