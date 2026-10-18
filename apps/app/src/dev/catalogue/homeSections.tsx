// The redesigned Home in each of its states (redesign R2c+, development only),
// drawn by the real HomeScreen on fakes, as HomeScreen.render.test.tsx builds
// them. Today is the fixtures' 29 September 2026; the budget, when there is
// one, is the plan's ฿18,000.00.
import { HomeScreen } from '@mobile/screens/redesign/HomeScreen';
import { createFakeResources } from '@mobile/spend/v1/testing/fakeResources';
import type { CatalogueSection } from './registry';
import { CATALOGUE_NOW, GOLDEN, alwaysFails, deviceDiary, draftEntry, goldenFake, queued, withBudget } from './screenFixtures';
import { screenSection } from './screenSection';
import type { ScreenFixture } from './screenSection';

const BUDGET = '1800000';
const TIGHT_BUDGET = '1000000';

const home = () => <HomeScreen now={CATALOGUE_NOW} />;
/** The Home has finished loading: the month's total, a load problem, or the first wallet. */
const loaded = (testID: string) => () => [{ waitFor: testID }] as const;

/** The golden month with the plan's budget, on a phone whose diary is open and empty. */
const goldenMonth = (limit: string | null = BUDGET): ScreenFixture => {
  const fake = goldenFake().resources;
  return { resources: limit === null ? fake : withBudget(fake, limit), diary: deviceDiary().diary };
};

export const HOME_SECTIONS: readonly CatalogueSection[] = [
  screenSection({ id: 'home-ready', title: 'Home: ready', fixture: () => goldenMonth(), script: loaded('home-total'), render: home }),
  screenSection({ id: 'home-over-budget', title: 'Home: over budget', fixture: () => goldenMonth(TIGHT_BUDGET), script: loaded('home-total'), render: home }),
  screenSection({ id: 'home-no-budget', title: 'Home: no budget', fixture: () => goldenMonth(null), script: loaded('home-total'), render: home }),
  screenSection({
    id: 'home-first-run',
    title: 'Home: first run',
    // No wallet yet, on the server or on the device.
    fixture: () => ({ resources: createFakeResources().resources, diary: deviceDiary({ wallets: [], categories: [] }).diary }),
    script: (tc) => [{ waitFor: tc('Add a wallet') }],
    render: home,
  }),
  screenSection({
    id: 'home-offline',
    title: 'Home: offline, drafts kept',
    // Jotbun cannot be reached; the device keeps today's coffee and yesterday's bus.
    fixture: () => ({
      resources: alwaysFails(goldenFake().resources, 'summary', 'network'),
      diary: deviceDiary({ outbox: [queued(draftEntry(), 'unsent'), queued(draftEntry({ amount_minor: '4000', occurred_on: '2026-09-28', category_id: GOLDEN.categories.travel.id }), 'unsent')] }).diary,
    }),
    script: loaded('home-problem-load_failed'),
    render: home,
  }),
  screenSection({
    id: 'home-saving',
    title: 'Home: saving, checking',
    // One draft on its way, one being checked with Jotbun before it is sent again.
    fixture: () => ({
      resources: withBudget(goldenFake().resources, BUDGET),
      diary: deviceDiary({ outbox: [queued(draftEntry(), 'sending'), queued(draftEntry({ amount_minor: '900' }), 'uncertain')] }).diary,
    }),
    script: loaded('home-total'),
    render: home,
  }),
  screenSection({
    id: 'home-needs-review',
    title: 'Home: needs review',
    fixture: () => ({
      resources: withBudget(goldenFake().resources, BUDGET),
      diary: deviceDiary({ outbox: [queued(draftEntry({ amount_minor: '1200', note: 'Snacks' }), 'needs_review')] }).diary,
    }),
    script: loaded('home-total'),
    render: home,
  }),
  screenSection({
    id: 'home-upgrade',
    title: 'Home: upgrade required',
    // Jotbun needs a newer app; today's draft waits on the device for it.
    fixture: () => ({
      resources: alwaysFails(goldenFake().resources, 'ensureBuiltinCategories', 'upgrade_required'),
      diary: deviceDiary({ outbox: [queued(draftEntry(), 'paused_upgrade')] }).diary,
    }),
    script: loaded('home-problem-upgrade_required'),
    render: home,
  }),
  screenSection({
    id: 'home-signed-out',
    title: 'Home: signed out',
    fixture: () => ({ resources: alwaysFails(goldenFake().resources, 'ensureBuiltinCategories', 'signed_out'), diary: deviceDiary().diary }),
    script: loaded('home-problem-signed_out'),
    render: home,
  }),
  screenSection({
    id: 'home-locked',
    title: 'Home: diary locked',
    // The device's key is gone: the diary cannot be read, and Start over is offered.
    fixture: () => ({ resources: withBudget(goldenFake().resources, BUDGET), diary: deviceDiary({ phase: 'locked', lockReason: 'key_missing', wallets: [], categories: [] }).diary }),
    script: loaded('home-total'),
    render: home,
  }),
];
