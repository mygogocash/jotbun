// Insights in each of its states (redesign R5, development only), drawn by
// the real InsightsScreen on fakes and reached with the same steps as
// InsightsScreen.render.test.tsx. The month is September 2026, today the
// 29th. Thai and dark mode are the catalogue's own switches, as for every
// section.
//
// Not registered yet: R5 waits for E2 checkpoint 3, and registry.tsx adds
// these to SCREEN_SECTIONS then.
import type { TransactionDto } from '@gogospend/contracts';

import { InsightsScreen } from '@mobile/screens/redesign/insights/InsightsScreen';
import type { SpendV1Resources } from '@mobile/spend/v1/resources';
import { createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
import type { CatalogueSection } from '../registry';
import { CATALOGUE_NOW, alwaysFails, deviceDiary, draftEntry, expense, goldenFake, queued } from '../screenFixtures';
import { screenSection } from '../screenSection';
import type { ScreenFixture, ScriptStep, Translate } from '../screenSection';

const insights = () => <InsightsScreen now={CATALOGUE_NOW} />;
const online = (resources: SpendV1Resources = goldenFake().resources): ScreenFixture => ({ resources, diary: null });
/** The month has loaded: the calendar is drawn. */
const calendar: ScriptStep = { waitFor: 'insights-calendar' };

/** Logged on the 23rd and the 3rd as well: the 24th is skipped, and the rhythm forgives it. */
const GAPS: readonly TransactionDto[] = [expense(201, '2026-09-23', '4500'), expense(202, '2026-09-03', '1200')];
/** Logged on the 23rd and 24th too: six of the last seven days, a week the bun cheers. */
const GOOD_WEEK: readonly TransactionDto[] = [expense(211, '2026-09-23', '4500'), expense(212, '2026-09-24', '1200')];
/** Two days in August, for the month before. */
const AUGUST: readonly TransactionDto[] = [expense(221, '2026-08-15', '5000'), expense(222, '2026-08-03', '32000')];

export const INSIGHTS_SECTIONS: CatalogueSection[] = [
  screenSection({ id: 'insights-month', title: 'Insights: the month', fixture: () => online(), script: () => [calendar], render: insights }),
  screenSection({
    id: 'insights-loading',
    title: 'Insights: loading',
    // The month is never read: the screen stays on its loading state.
    fixture: () => {
      const fake = goldenFake();
      fake.hold('history');
      return online(fake.resources);
    },
    script: (tc: Translate) => [{ waitFor: tc('Loading your diary') }],
    render: insights,
  }),
  screenSection({
    id: 'insights-problem',
    title: 'Insights: load problem',
    fixture: () => online(alwaysFails(goldenFake().resources, 'history', 'network')),
    script: (tc: Translate) => [{ waitFor: tc("We couldn't load your diary.") }],
    render: insights,
  }),
  screenSection({
    id: 'insights-offline',
    title: 'Insights: offline',
    // Jotbun cannot be reached; the device still holds today's draft.
    fixture: () => ({ resources: alwaysFails(goldenFake().resources, 'history', 'network'), diary: deviceDiary({ outbox: [queued(draftEntry(), 'unsent')] }).diary }),
    script: (tc: Translate) => [{ waitFor: tc('Offline. New entries are saved on this phone.') }],
    render: insights,
  }),
  screenSection({
    id: 'insights-empty',
    title: 'Insights: empty month',
    fixture: () => online(createFakeResources({ wallets: goldenSeed().wallets, records: [] }).resources),
    script: (tc: Translate) => [{ waitFor: tc('No entries in this month') }],
    render: insights,
  }),
  screenSection({
    id: 'insights-past-month',
    title: 'Insights: past month',
    fixture: () => online(goldenFake(AUGUST).resources),
    script: (tc: Translate) => [calendar, { press: tc('Previous month') }, { waitFor: 'insights-heat-2026-08-15' }],
    render: insights,
  }),
  screenSection({ id: 'insights-gaps', title: 'Insights: a month with gaps', fixture: () => online(goldenFake(GAPS).resources), script: () => [calendar], render: insights }),
  screenSection({
    id: 'insights-good-week',
    title: 'Insights: a good week',
    // At full bun intensity the bun cheers it; the catalogue's bun control previews Quiet and Off.
    fixture: () => online(goldenFake(GOOD_WEEK).resources),
    script: () => [calendar, { waitFor: 'insights-rhythm' }],
    render: insights,
  }),
  screenSection({
    id: 'insights-drafts',
    title: 'Insights: drafts on this device',
    // Today's lunch is waiting to sync and Saturday's taxi is being checked: both log their day, apart from confirmed money.
    fixture: () => ({
      resources: goldenFake().resources,
      diary: deviceDiary({
        outbox: [queued(draftEntry(), 'unsent'), queued(draftEntry({ amount_minor: '4000', occurred_on: '2026-09-26' }), 'uncertain')],
      }).diary,
    }),
    script: () => [calendar],
    render: insights,
  }),
];
