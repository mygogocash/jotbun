// bw-deleted's stage (plan P2-T25, development only), which recordSections.tsx
// loads lazily: the real WalletDeletedScreen on fakes, staged by screenSection
// as recentlyDeletedSections.tsx stages the old screen (R72: wallet sections
// use fakes only). The fixtures' today is 29 September 2026: rent was deleted
// yesterday, the September salary four days ago, lunch nine days ago, and a
// taxi on 30 August at 22:00 Bangkok time, so its last day ends tonight. The
// script waits until the list is drawn.
import type { TransactionDto } from '@gogospend/contracts';

import { WalletDeletedScreen } from '@mobile/wallet/records/WalletDeletedScreen';
import { CATALOGUE_NOW, GOLDEN, expense, goldenFake } from '../screenFixtures';
import { screenSection } from '../screenSection';
import type { ScreenFixture } from '../screenSection';

const DELETED_AT: Readonly<Record<string, string>> = {
  [GOLDEN.rentId]: '2026-09-28T03:00:00.000Z',
  [GOLDEN.salaryId]: '2026-09-25T03:00:00.000Z',
  [GOLDEN.lunchId]: '2026-09-20T03:00:00.000Z',
};

/** The golden diary with four entries deleted, one of them on its last day. */
function deletedGolden(): ScreenFixture {
  const taxi = expense(1, '2026-08-30', '12000', { category_id: GOLDEN.categories.travel.id, deleted_at: '2026-08-30T15:00:00.000Z', version: 2 });
  const fake = goldenFake([taxi]);
  for (const [id, deletedAt] of Object.entries(DELETED_AT)) {
    const record = fake.records.get(id) as TransactionDto;
    fake.records.set(id, { ...record, deleted_at: deletedAt, version: 2 } as TransactionDto);
  }
  return { resources: fake.resources, diary: null };
}

// The registry lists the section (its id and title) in recordSections.tsx; only this stage's render is drawn here.
const STAGE = screenSection({
  id: 'bw-deleted',
  title: 'Bun Wallet: recently deleted',
  fixture: deletedGolden,
  script: () => [{ waitFor: 'wallet-deleted-list' }],
  render: () => <WalletDeletedScreen now={CATALOGUE_NOW} />,
});

export default function DeletedSection() {
  return <>{STAGE.render()}</>;
}
