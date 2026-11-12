// The companion area in the catalogue (premium plan, development only): the
// real screens with Bun's AI help, the daily note, the GoGoCash bridge and the
// Thai everyday categories, drawn on fakes, so each state can be screenshotted
// for E2 and is read by the catalogue's screen-reader and large-text checks.
// The AI fakes answer at once and send nothing anywhere.
import { AI_DAILY_LIMITS, BUILTIN_CASHBACK_BRANDS, GOGOCASH_HOME } from '@gogospend/contracts';
import type { AiPreferencesDto, TransactionDto } from '@gogospend/contracts';
import type { ReactNode } from 'react';

import { AskBunScreen } from '@mobile/screens/redesign/ai/AskBunScreen';
import { CategoriesScreen } from '@mobile/screens/redesign/planning/CategoriesScreen';
import { HomeScreen } from '@mobile/screens/redesign/HomeScreen';
import { InsightsScreen } from '@mobile/screens/redesign/insights/InsightsScreen';
import { QuickAddScreen } from '@mobile/screens/redesign/QuickAddScreen';
import { SettingsScreen } from '@mobile/screens/redesign/account/SettingsScreen';
import { AiCompanionProvider } from '@mobile/spend/v1/ai/AiCompanionProvider';
import type { AiResources } from '@mobile/spend/v1/ai/aiResources';
import { BUILTINS, createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';

import { fakeAccount } from '../account/settingsSections';
import type { CatalogueSection } from '../registry';
import { CATALOGUE_NOW, deviceDiary, expense, goldenFake } from '../screenFixtures';
import { screenSection } from '../screenSection';
import type { ScreenFixture, Translate } from '../screenSection';

type CompanionFixture = ScreenFixture & { readonly ai: AiResources };

/** AI resources that answer at once from fixed data. The wallet recap's cashback state uses them too (P2-T32). */
export function catalogueAi(preferences: Partial<AiPreferencesDto> = {}, overrides: Partial<AiResources> = {}): AiResources {
  let current: AiPreferencesDto = { companion: false, cashback_tips: false, notice_version: null, current_notice_version: 1, remaining: { ...AI_DAILY_LIMITS }, available: true, ...preferences };
  return {
    preferences: async () => current,
    setPreferences: async (update) => (current = { ...current, ...update }),
    parse: async () => ({ drafts: [], source: 'rules' }),
    slip: async () => ({ drafts: [], bank: null, source: 'ai' }),
    // Worded as the edge words them (fact-text.ts): in Thai for Thai, English otherwise.
    note: async (date, locale) => ({
      date,
      // The golden month's own top category: the rent, ฿12,268 of ฿12,450 out.
      facts: [{ kind: 'top_category', amount_minor: '1226800', percent: 99, category_key: 'bills', category_label: null }],
      text: locale === 'th' ? 'เดือนนี้ใช้กับค่าบิลมากที่สุด ฿12,268' : 'Bills leads this month at ฿12,268.',
      source: 'facts',
    }),
    ask: async ({ locale }) => ({
      // The golden month's food: one entry, ฿182 on 26 September.
      answer: locale === 'th' ? 'เดือนนี้ใช้กับอาหารไป ฿182 ทั้งหมดเป็นของวันที่ 26' : 'You spent ฿182 on food this month, all of it on the 26th.',
      figures: [{ label: locale === 'th' ? 'อาหาร 1–29 ก.ย. 2569' : 'Food, 1–29 Sep 2026', amount_minor: '18200' }],
      source: 'ai',
    }),
    cashbackCatalogue: async () => ({ source: 'builtin', updated_at: null, home_href: GOGOCASH_HOME, brands: [...BUILTIN_CASHBACK_BRANDS] }),
    ...overrides,
  };
}

const on = { companion: true, notice_version: 1 } as const;
const withAi = (fixture: CompanionFixture, screen: ReactNode) => <AiCompanionProvider resources={fixture.ai}>{screen}</AiCompanionProvider>;
const online = (ai: AiResources, resources = goldenFake().resources): CompanionFixture => ({ resources, diary: null, ai });

/** Seven September days of shopping at cashback brands, so the bridge has something to say. */
const SHOPPING: readonly TransactionDto[] = [1, 2, 4, 5, 6, 8, 9].map((day, i) =>
  expense(300 + i, `2026-09-${String(day).padStart(2, '0')}`, '29900', { merchant: i % 3 === 0 ? 'Lazada' : 'Shopee' }),
);

export const COMPANION_SECTIONS: readonly CatalogueSection[] = [
  screenSection({
    id: 'ask-bun-off',
    title: 'Ask Bun: AI help off',
    fixture: () => online(catalogueAi()),
    script: (tc: Translate) => [{ waitFor: tc('Ask about your spending') }],
    render: (f) => withAi(f, <AskBunScreen now={CATALOGUE_NOW} />),
  }),
  screenSection({
    id: 'ask-bun-answer',
    title: 'Ask Bun: an answer with its figures',
    fixture: () => online(catalogueAi(on)),
    script: (tc: Translate) => [{ waitFor: tc('How much did I spend on food this month?') }, { press: tc('How much did I spend on food this month?') }, { waitFor: 'ask-bun-answer' }],
    render: (f) => withAi(f, <AskBunScreen now={CATALOGUE_NOW} />),
  }),
  screenSection({
    id: 'quick-add-tell-bun',
    title: 'Quick add: Tell Bun read a Thai sentence',
    fixture: () => online(catalogueAi()),
    script: (tc: Translate) => [
      { waitFor: tc('Keypad') },
      { press: tc('Tell Bun') },
      { waitFor: tc('What did you spend or receive?') },
      { type: 'ข้าวมันไก่ 50', into: tc('What did you spend or receive?') },
      { press: tc('Read it') },
      { waitFor: 'tell-bun-draft' },
    ],
    render: (f) => withAi(f, <QuickAddScreen now={CATALOGUE_NOW} />),
  }),
  screenSection({
    id: 'home-bun-note',
    title: "Home: Bun's daily note",
    fixture: () => ({ ...online(catalogueAi()), diary: deviceDiary().diary }),
    script: () => [{ waitFor: 'home-bun-note' }],
    render: (f) => withAi(f, <HomeScreen now={CATALOGUE_NOW} />),
  }),
  screenSection({
    id: 'insights-cashback-ask',
    title: 'Insights: GoGoCash asks once',
    fixture: () => online(catalogueAi(), goldenFake(SHOPPING).resources),
    script: () => [{ waitFor: 'cashback-card' }],
    render: (f) => withAi(f, <InsightsScreen now={CATALOGUE_NOW} />),
  }),
  screenSection({
    id: 'insights-cashback-tips',
    title: 'Insights: GoGoCash tips on',
    fixture: () => online(catalogueAi({ cashback_tips: true }), goldenFake(SHOPPING).resources),
    script: () => [{ waitFor: 'cashback-card' }],
    render: (f) => withAi(f, <InsightsScreen now={CATALOGUE_NOW} />),
  }),
  screenSection({
    id: 'settings-companion',
    title: "Settings: Bun's AI help on",
    fixture: () => online(catalogueAi(on)),
    script: (tc: Translate) => [{ waitFor: tc('Left today: {parse} sentences, {slip} slips, {ask} questions.', { parse: 30, slip: 10, ask: 20 }) }],
    render: (f) => withAi(f, <SettingsScreen services={fakeAccount().services} />),
  }),
  screenSection({
    id: 'categories-thai-pack',
    title: 'Categories: Thai everyday offered',
    fixture: () => online(catalogueAi(), createFakeResources({ wallets: goldenSeed().wallets, categories: [...BUILTINS] }).resources),
    script: () => [{ waitFor: 'thai-everyday-pack' }],
    render: () => <CategoriesScreen now={CATALOGUE_NOW} />,
  }),
];
