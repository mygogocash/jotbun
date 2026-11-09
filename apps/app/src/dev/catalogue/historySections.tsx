// History in each of its states (redesign R2c+, development only), drawn by
// the real HistoryScreen on fakes and reached with the same steps as
// HistoryScreen.render.test.tsx (its harness is HistoryTestHarness.tsx):
// a search typed, chips chosen, a row deleted. The month is September 2026.
import type { HistoryPage, TransactionDto } from '@gogospend/contracts';

import { HistoryScreen } from '@mobile/screens/redesign/HistoryScreen';
import type { SpendV1Resources } from '@mobile/spend/v1/resources';
import { createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
import type { CatalogueSection } from './registry';
import { CATALOGUE_NOW, GOLDEN, alwaysFails, deviceDiary, draftEntry, expense, extraRecords, goldenFake, queued } from './screenFixtures';
import { screenSection } from './screenSection';
import type { ScreenFixture, ScriptStep, Translate } from './screenSection';

const history = () => <HistoryScreen now={CATALOGUE_NOW} />;
const online = (resources: SpendV1Resources = goldenFake().resources): ScreenFixture => ({ resources, diary: null });
/** The month has loaded: the stage shows its money in. */
const loaded = (tc: Translate): ScriptStep[] => [{ waitFor: `${tc('Money in')} ฿28,000.00` }];
const search = (tc: Translate, text: string): ScriptStep => ({ type: text, into: tc('Search entries') });

/** Two entries with Thai words: a note that needs its tone marks, and a merchant with sara am. */
const THAI_WORDS: readonly TransactionDto[] = [
  expense(101, '2026-09-20', '5000', { note: 'ปู่ย่า' }),
  expense(102, '2026-09-21', '2000', { merchant: 'น้ำแข็ง' }),
];

/** Every page of the month says entries changed since the list opened. */
function refreshSuggested(resources: SpendV1Resources): SpendV1Resources {
  return { ...resources, history: async (...args) => ({ ...(await resources.history(...args)), refresh_suggested: true }) as HistoryPage };
}

export const HISTORY_SECTIONS: readonly CatalogueSection[] = [
  screenSection({ id: 'history-month', title: 'History: the month', fixture: () => online(), script: loaded, render: history }),
  screenSection({
    id: 'history-search',
    title: 'History: search',
    fixture: () => online(),
    script: (tc) => [...loaded(tc), search(tc, 'rent'), { waitFor: 'history-summary' }],
    render: history,
  }),
  screenSection({
    id: 'history-search-thai',
    title: 'History: Thai search',
    fixture: () => online(goldenFake(THAI_WORDS).resources),
    // The tone mark typed before the lower vowel still finds "ปู่".
    script: (tc) => [...loaded(tc), { waitFor: 'Cash · ปู่ย่า' }, search(tc, 'ปู่'), { waitFor: 'history-summary' }],
    render: history,
  }),
  screenSection({
    id: 'history-search-partial',
    title: 'History: partial search',
    // Sixty more entries: the month needs a second page, and search covers the first.
    fixture: () => online(goldenFake(extraRecords()).resources),
    script: (tc) => [...loaded(tc), search(tc, tc('Food')), { waitFor: tc('Only loaded entries are searched. Load more to search the rest.') }],
    render: history,
  }),
  screenSection({
    id: 'history-filters',
    title: 'History: filters',
    fixture: () => online(),
    script: (tc) => [
      ...loaded(tc),
      { press: tc('Expense') },
      { press: GOLDEN.cash.name },
      { press: tc('Food') },
      { waitFor: `${tc('Food')}, ${tc('Expense')} ฿182.00, ${GOLDEN.cash.name}` },
    ],
    render: history,
  }),
  screenSection({
    id: 'history-empty',
    title: 'History: empty month',
    fixture: () => online(createFakeResources({ wallets: goldenSeed().wallets, records: [] }).resources),
    script: (tc) => [{ waitFor: tc('No entries in this month') }],
    render: history,
  }),
  screenSection({
    id: 'history-no-match',
    title: 'History: no match',
    // Nothing went on Travel in September.
    fixture: () => online(),
    script: (tc) => [...loaded(tc), { press: tc('Travel') }, { waitFor: tc('No entries match') }],
    render: history,
  }),
  screenSection({
    id: 'history-undo',
    title: 'History: undo a delete',
    // The rent row's Delete (its long-press action).
    fixture: () => online(),
    script: (tc) => [...loaded(tc), { call: 'onDelete', on: { title: tc('Bills') } }, { waitFor: tc('Entry deleted') }],
    render: history,
  }),
  screenSection({
    id: 'history-drafts',
    title: 'History: drafts',
    // Drafts on the device join their days: one saving, one being checked, one that needs a look.
    fixture: () => ({
      resources: goldenFake().resources,
      diary: deviceDiary({
        outbox: [
          queued(draftEntry({ occurred_on: '2026-09-26' }), 'unsent'),
          queued(draftEntry({ amount_minor: '4000', occurred_on: '2026-09-27', category_id: GOLDEN.categories.travel.id }), 'uncertain'),
          queued(draftEntry({ amount_minor: '999', note: 'Snacks' }), 'needs_review'),
        ],
      }).diary,
    }),
    script: loaded,
    render: history,
  }),
  screenSection({
    id: 'history-refresh',
    title: 'History: refresh',
    fixture: () => online(refreshSuggested(goldenFake().resources)),
    script: (tc) => [{ waitFor: tc('Entries changed since you opened this list.') }],
    render: history,
  }),
  screenSection({
    id: 'history-offline',
    title: 'History: offline',
    // Jotbun cannot be reached; the device still holds today's draft.
    fixture: () => ({ resources: alwaysFails(goldenFake().resources, 'history', 'network'), diary: deviceDiary({ outbox: [queued(draftEntry(), 'unsent')] }).diary }),
    script: (tc) => [{ waitFor: tc('Offline. New entries are saved on this phone.') }],
    render: history,
  }),
];
