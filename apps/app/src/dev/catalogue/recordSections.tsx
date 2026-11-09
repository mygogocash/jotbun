// The record detail in each of its states (redesign R2c+, development only),
// drawn by the real RecordScreen on fakes and reached with the same steps as
// RecordScreen.render.test.tsx: the golden rent edited to ฿12,000.00 while
// another device changes or deletes it, or while the answer is lost.
import type { TransactionDto } from '@gogospend/contracts';

import { RecordScreen } from '@mobile/screens/redesign/RecordScreen';
import type { CatalogueSection } from './registry';
import { CATALOGUE_NOW, GOLDEN, deviceDiary, draftEntry, goldenFake, queued } from './screenFixtures';
import type { FakeResources } from './screenFixtures';
import { keypadSteps, screenSection } from './screenSection';
import type { ScreenFixture, ScriptStep, Translate } from './screenSection';

type Golden = ScreenFixture & { readonly fake: FakeResources };
const golden = (): Golden => {
  const fake = goldenFake();
  return { fake, resources: fake.resources, diary: null };
};
const view = (id: string) => () => <RecordScreen id={id} now={CATALOGUE_NOW} />;
const editRent = () => <RecordScreen id={GOLDEN.rentId} mode="edit" now={CATALOGUE_NOW} />;
const receipt = () => [{ waitFor: 'receipt-slip' }];

/** Another device changes the rent after this screen loaded it. */
const elsewhere = (fake: FakeResources, patch: Partial<TransactionDto>) => () => {
  const rent = fake.records.get(GOLDEN.rentId) as TransactionDto;
  fake.records.set(GOLDEN.rentId, { ...rent, ...patch } as TransactionDto);
};
/** Clear the amount, type 12000 and save. */
const resave = (tc: Translate): ScriptStep[] => [...keypadSteps(tc, 'C12000'), { press: tc('Save changes') }];

/** A draft still on the device: ฿65.00 at the café, saving. */
function draftOnDevice(): ScreenFixture & { readonly id: string } {
  const entry = draftEntry({ merchant: 'Café' });
  return { id: entry.id, resources: goldenFake().resources, diary: deviceDiary({ outbox: [queued(entry, 'unsent')] }).diary };
}

export const RECORD_SECTIONS: readonly CatalogueSection[] = [
  screenSection({ id: 'record-expense', title: 'Record: expense', fixture: golden, script: receipt, render: view(GOLDEN.rentId) }),
  screenSection({ id: 'record-income', title: 'Record: income', fixture: golden, script: receipt, render: view(GOLDEN.salaryId) }),
  screenSection({ id: 'record-move', title: 'Record: move', fixture: golden, script: receipt, render: view(GOLDEN.moveId) }),
  screenSection({
    id: 'record-draft',
    title: 'Record: draft',
    fixture: draftOnDevice,
    script: receipt,
    render: (fixture) => <RecordScreen id={fixture.id} now={CATALOGUE_NOW} />,
  }),
  screenSection({ id: 'record-edit', title: 'Record: edit', fixture: golden, script: (tc) => [{ waitFor: tc('Keypad') }], render: editRent }),
  screenSection({
    id: 'record-conflict',
    title: 'Record: conflict',
    fixture: golden,
    script: (tc, { fake }) => [
      { waitFor: tc('Keypad') },
      { run: elsewhere(fake, { amount_minor: '1300000', note: 'Rent and water', version: 2 }) },
      ...resave(tc),
      { waitFor: 'conflict' },
    ],
    render: editRent,
  }),
  screenSection({
    id: 'record-deleted',
    title: 'Record: deleted elsewhere',
    fixture: golden,
    script: (tc, { fake }) => [
      { waitFor: tc('Keypad') },
      { run: elsewhere(fake, { deleted_at: '2026-09-29T00:00:00.000Z', version: 2 }) },
      ...resave(tc),
      { waitFor: tc('Restore') },
    ],
    render: editRent,
  }),
  screenSection({
    id: 'record-unconfirmed',
    title: 'Record: unconfirmed',
    fixture: golden,
    // The edit commits, then its answer is lost: frozen, with only Try again.
    script: (tc, { fake }) => [
      { waitFor: tc('Keypad') },
      ...keypadSteps(tc, 'C12000'),
      { run: () => fake.loseResponse('updateTransaction') },
      { press: tc('Save changes') },
      { waitFor: tc('Try again') },
    ],
    render: editRent,
  }),
];
