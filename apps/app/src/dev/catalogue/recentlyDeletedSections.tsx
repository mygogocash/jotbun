// Recently deleted in each of its states (redesign plan §6.1, development
// only), drawn by the real RecentlyDeletedScreen on fakes and reached with
// the same steps as RecentlyDeletedScreen.render.test.tsx: the golden rent
// deleted yesterday and the food nine days ago, then restored, or the answer
// lost, or Jotbun out of reach. The fixtures' today is 29 September 2026.
import type { TransactionDto } from '@gogospend/contracts';

import { RecentlyDeletedScreen } from '@mobile/screens/redesign/RecentlyDeletedScreen';
import type { CatalogueSection } from './registry';
import { CATALOGUE_NOW, GOLDEN, alwaysFails, deviceDiary, goldenFake } from './screenFixtures';
import type { FakeResources } from './screenFixtures';
import { screenSection } from './screenSection';
import type { ScreenFixture, ScriptStep, Translate } from './screenSection';

type Deleted = ScreenFixture & { readonly fake: FakeResources };

/** The golden diary with rent deleted yesterday and food nine days ago. */
function deletedGolden(): Deleted {
  const fake = goldenFake();
  const when: Readonly<Record<string, string>> = { [GOLDEN.rentId]: '2026-09-28T03:00:00.000Z', [GOLDEN.lunchId]: '2026-09-20T03:00:00.000Z' };
  for (const [id, deletedAt] of Object.entries(when)) {
    const record = fake.records.get(id) as TransactionDto;
    fake.records.set(id, { ...record, deleted_at: deletedAt, version: 2 } as TransactionDto);
  }
  return { fake, resources: fake.resources, diary: null };
}

const recentlyDeleted = () => <RecentlyDeletedScreen now={CATALOGUE_NOW} />;
/** The list has loaded: rent's days left show. */
const listed = (tc: Translate): ScriptStep[] => [{ waitFor: tc('{days} days left to restore', { days: 29 }) }];
/** Rent's Restore, by the name a screen reader speaks. */
const restoreRent = (tc: Translate): ScriptStep => ({ press: tc('Restore {entry}', { entry: `${tc('Bills')}, ${tc('Expense')} ฿12,268.00` }) });

export const RECENTLY_DELETED_SECTIONS: readonly CatalogueSection[] = [
  screenSection({ id: 'recently-deleted-list', title: 'Recently deleted: the list', fixture: deletedGolden, script: listed, render: recentlyDeleted }),
  screenSection({
    id: 'recently-deleted-empty',
    title: 'Recently deleted: nothing deleted',
    fixture: () => ({ resources: goldenFake().resources, diary: null }),
    script: (tc) => [{ waitFor: tc('Nothing deleted in the last 30 days') }],
    render: recentlyDeleted,
  }),
  screenSection({
    id: 'recently-deleted-restored',
    title: 'Recently deleted: restored',
    fixture: deletedGolden,
    script: (tc) => [...listed(tc), restoreRent(tc), { waitFor: tc('{entry} {amount} is back in History.', { entry: tc('Bills'), amount: '฿12,268.00' }) }],
    render: recentlyDeleted,
  }),
  screenSection({
    id: 'recently-deleted-unconfirmed',
    title: 'Recently deleted: unconfirmed restore',
    fixture: deletedGolden,
    // The restore commits, then its answer is lost: frozen, with only Try again.
    script: (tc, { fake }) => [...listed(tc), { run: () => fake.loseResponse('restoreTransaction') }, restoreRent(tc), { waitFor: tc('Not confirmed yet. Your entry is kept; try again.') }],
    render: recentlyDeleted,
  }),
  screenSection({
    id: 'recently-deleted-offline',
    title: 'Recently deleted: offline',
    // Jotbun cannot be reached; this phone keeps a diary, so the banner says offline.
    fixture: () => ({ resources: alwaysFails(deletedGolden().resources, 'recentlyDeleted', 'network'), diary: deviceDiary().diary }),
    script: (tc) => [{ waitFor: tc('Offline. New entries are saved on this phone.') }],
    render: recentlyDeleted,
  }),
];
