// The Bun Wallet insights' catalogue states (P2-T31, development only), loaded
// by ./insightsSections.tsx when a section opens: the real WalletInsightsScreen
// on fakes, on the boards' day (Saturday 24 October 2026, 10:00 in Bangkok).
//
// - The month is wc-calendar's: ฿12,480 out on 22 of the 24 days so far, in
//   bw-insights' four categories, ฿35,000 in, a ฿18,000 budget, and May to
//   September before it.
// - The first days are es-empty-insights': ฿312 over 23 and 24 October, with no
//   month before them.
// - Private mode is the section's own, over a store kept in memory, as
//   kitSections.tsx shows it, so the catalogue never changes the person's own
//   setting.
// - The largest amount: ฿999,999,999.99 out in one month, most of it in a
//   category with an 80-code-point Thai name, for the AX5 captures.
// - The month's summary gives each category's money, as the server does
//   (withCategoryTotals). No device diary: the web's case.
import type { CategoryDto, TransactionDto, WalletSnapshot } from '@gogospend/contracts';
import { useState } from 'react';
import type { ReactNode } from 'react';

import { BUILTINS, createFakeResources } from '@mobile/spend/v1/testing/fakeResources';
import { WalletInsightsScreen } from '@mobile/wallet/insights/WalletInsightsScreen';
import { PRIVATE_MODE_NAME, PrivateModeProvider } from '@mobile/wallet/privacy/PrivateModeProvider';
import type { KeyValueStore } from '@mobile/wallet/store/walletStore';
import { recapBudget, withCategoryTotals } from '../insights/recapSections';
import type { CatalogueSection } from '../registry';
import { screenSection } from '../screenSection';
import type { ScreenFixture, ScriptStep } from '../screenSection';
import { WALLET_INSIGHTS_TITLES } from './insightsSections';
import type { WalletInsightsId } from './insightsSections';

/** Saturday 24 October 2026, 10:00 in Bangkok: the boards' day. */
const NOW = new Date('2026-10-24T03:00:00Z');
const MONTH = '2026-10';

const wallet = (index: number, name: string): WalletSnapshot => ({
  id: `0000000c-0000-4000-8000-0000000003${String(index).padStart(2, '0')}`, name, currency: 'THB', opening_minor: '0', tracking_start: '2026-01-01', archived: false, version: 1,
});
const MAIN = wallet(1, 'บัญชีหลัก');
const CASH = wallet(2, 'เงินสด');

const [FOOD, TRAVEL, , SALARY] = BUILTINS as [CategoryDto, CategoryDto, CategoryDto, CategoryDto, CategoryDto];
const category = (index: number, fields: Pick<CategoryDto, 'builtin_key' | 'label' | 'color'>): CategoryDto => ({
  id: `0000000c-0000-4000-8000-0000000004${String(index).padStart(2, '0')}`, type: 'expense', archived: false, version: 1, ...fields,
});
const SHOPPING = category(1, { builtin_key: 'shopping', label: null, color: '#E9E1FF' });
const FAMILY = category(2, { builtin_key: null, label: 'ส่งให้ครอบครัว', color: '#FFDDE6' });
/** 80 code points, the longest name a category can have. */
const LONG = category(3, { builtin_key: null, label: 'ค่าเทอมลูก ค่าเรียนพิเศษ และค่าใช้จ่ายในบ้านของครอบครัวใหญ่ทุกเดือนตลอดทั้งปีน้า', color: '#DCE8FF' });
const CATEGORIES: readonly CategoryDto[] = [...BUILTINS, SHOPPING, FAMILY, LONG];

let counter = 0;
function entry(type: 'expense' | 'income', day: string, amountMinor: string, on: CategoryDto, from: WalletSnapshot, note: string | null = null): TransactionDto {
  counter += 1;
  return {
    id: `0000000b-0000-4000-8000-${String(500 + counter).padStart(12, '0')}`, type, amount_minor: amountMinor, occurred_on: day,
    wallet_id: from.id, category_id: on.id, note, merchant: null, deleted_at: null, version: 1,
  } as TransactionDto;
}
const spent = (day: number, baht: string, on: CategoryDto, from: WalletSnapshot = CASH, note: string | null = null) =>
  entry('expense', `${MONTH}-${String(day).padStart(2, '0')}`, `${baht}00`, on, from, note);

/** wc-calendar's October: ฿12,480 on 22 of the 24 days so far (none on the 8th or the 20th). */
const OCTOBER: readonly TransactionDto[] = [
  entry('income', `${MONTH}-01`, '3500000', SALARY, MAIN),
  spent(1, '3000', FAMILY, MAIN), spent(1, '240', FOOD), spent(2, '412', FOOD), spent(3, '1190', SHOPPING, MAIN), spent(4, '265', FOOD),
  spent(5, '188', TRAVEL), spent(6, '230', FOOD), spent(7, '156', TRAVEL), spent(9, '545', FOOD), spent(10, '1120', SHOPPING, MAIN),
  spent(10, '360', TRAVEL), spent(11, '380', FOOD), spent(12, '210', FOOD), spent(13, '174', TRAVEL), spent(14, '470', FOOD),
  spent(15, '198', TRAVEL), spent(16, '850', FOOD), spent(17, '450', TRAVEL), spent(18, '290', FOOD), spent(19, '164', TRAVEL),
  spent(21, '236', FOOD), spent(22, '310', TRAVEL), spent(23, '910', FOOD),
  // History lists a day newest first (the higher id), so the board's order reads กาแฟเย็น, BTS, วิน.
  spent(24, '20', TRAVEL, CASH, 'วิน'), spent(24, '47', TRAVEL, MAIN, 'BTS'), spent(24, '65', FOOD, CASH, 'กาแฟเย็น'),
];

/** May to September, as bw-insights' bars stand against the ฿18,000 budget. */
const BEFORE: readonly TransactionDto[] = ([['05', '1420000', '3000000'], ['06', '1580000', '3000000'], ['07', '1390000', '3200000'], ['08', '1640000', '3200000'], ['09', '1600000', '3500000']] as const)
  .flatMap(([month, outMinor, inMinor]) => [
    entry('expense', `2026-${month}-15`, outMinor, FOOD, CASH),
    entry('income', `2026-${month}-01`, inMinor, SALARY, MAIN),
  ]);

/** es-empty-insights: ฿312 in seven entries over 23 and 24 October, and nothing before. */
const FIRST_DAYS: readonly TransactionDto[] = [
  spent(23, '50', FOOD), spent(23, '45', FOOD), spent(23, '40', SHOPPING), spent(23, '47', TRAVEL, MAIN),
  spent(24, '65', FOOD), spent(24, '45', FOOD), spent(24, '20', TRAVEL),
];

/** ฿999,999,999.99 out over three days, most of it under the longest name. */
const LARGEST: readonly TransactionDto[] = [
  entry('expense', `${MONTH}-01`, '99999999899', LONG, MAIN),
  entry('expense', `${MONTH}-02`, '50', FOOD, CASH),
  entry('expense', `${MONTH}-03`, '50', FOOD, CASH),
];

function fakes(records: readonly TransactionDto[]): ScreenFixture {
  const fake = createFakeResources({ wallets: [MAIN, CASH], records: [...records], categories: [...CATEGORIES], budgets: [recapBudget(MONTH, '1800000')] });
  return { resources: withCategoryTotals(fake), diary: null };
}

function memoryStore(seed: Readonly<Record<string, string>>): KeyValueStore {
  const kept = new Map(Object.entries(seed));
  return {
    get: async (name) => kept.get(name) ?? null,
    set: async (name, value) => { kept.set(name, value); },
    remove: async (name) => { kept.delete(name); },
    eraseAll: async () => { kept.clear(); },
  };
}

/** Private mode on for this section only. */
function PrivateInsights({ children }: { children: ReactNode }) {
  const [store] = useState(() => memoryStore({ [PRIVATE_MODE_NAME]: '1' }));
  return <PrivateModeProvider store={store}>{children}</PrivateModeProvider>;
}

const insights = () => <WalletInsightsScreen now={NOW} />;
const shown = (testID: string): ScriptStep => ({ waitFor: testID });
const tab = (name: 'in_out' | 'calendar'): ScriptStep => ({ call: 'onPress', on: { testID: `insights-tab-${name}` } });

const SECTIONS: Readonly<Record<WalletInsightsId, CatalogueSection>> = {
  'bw-insights': screenSection({
    id: 'bw-insights',
    title: WALLET_INSIGHTS_TITLES['bw-insights'],
    fixture: () => fakes([...OCTOBER, ...BEFORE]),
    script: () => [shown('insights-month-bars')],
    render: insights,
  }),
  'bw-insights-in-out': screenSection({
    id: 'bw-insights-in-out',
    title: WALLET_INSIGHTS_TITLES['bw-insights-in-out'],
    fixture: () => fakes([...OCTOBER, ...BEFORE]),
    script: () => [shown('insights-month-bars'), tab('in_out'), shown('in-out-paired-bars')],
    render: insights,
  }),
  'bw-calendar': screenSection({
    id: 'bw-calendar',
    title: WALLET_INSIGHTS_TITLES['bw-calendar'],
    fixture: () => fakes([...OCTOBER, ...BEFORE]),
    script: () => [shown('insights-month-bars'), tab('calendar'), shown('calendar-grid')],
    render: insights,
  }),
  'bw-insights-early': screenSection({
    id: 'bw-insights-early',
    title: WALLET_INSIGHTS_TITLES['bw-insights-early'],
    fixture: () => fakes(FIRST_DAYS),
    script: () => [shown('insights-early-state')],
    render: insights,
  }),
  'bw-insights-private': screenSection({
    id: 'bw-insights-private',
    title: WALLET_INSIGHTS_TITLES['bw-insights-private'],
    fixture: () => fakes([...OCTOBER, ...BEFORE]),
    script: () => [shown('insights-month-bars'), tab('calendar'), shown('calendar-grid')],
    render: () => <PrivateInsights>{insights()}</PrivateInsights>,
  }),
  'bw-insights-large': screenSection({
    id: 'bw-insights-large',
    title: WALLET_INSIGHTS_TITLES['bw-insights-large'],
    fixture: () => fakes(LARGEST),
    script: () => [shown('insights-month-bars')],
    render: insights,
  }),
};

/** One insights state, drawn as the catalogue draws every screen section. */
export default function InsightsScreenSection({ id }: { id: WalletInsightsId }) {
  return <>{SECTIONS[id].render()}</>;
}
