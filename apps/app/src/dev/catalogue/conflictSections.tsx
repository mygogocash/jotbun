// C16's conflict choice in each of its states (1D-T9, development only), drawn
// by the real RecordScreen and HistoryScreen on fakes, with the `conflict`
// area on for these sections only (`conflictArea`). They are reached with the
// same steps as RecordScreen.render.test.tsx: the golden rent edited to
// ฿12,000.00 while another phone changes it to ฿13,000.00, as
// `record-conflict` does today, or a choice already kept in the device diary.
// The copy is a draft for E2 (conflictCopy.draft.ts).
import type { TransactionDto } from '@gogospend/contracts';

import { HistoryScreen } from '@mobile/screens/redesign/HistoryScreen';
import { RecordScreen } from '@mobile/screens/redesign/RecordScreen';
import type { PendingChoice } from '@mobile/storage/types';
import type { CatalogueSection } from './registry';
import { CATALOGUE_NOW, GOLDEN, alwaysFails, deviceDiary, goldenFake } from './screenFixtures';
import type { FakeResources } from './screenFixtures';
import { keypadSteps, screenSection } from './screenSection';
import type { ScreenFixture, ScriptStep, Translate } from './screenSection';

type Golden = ScreenFixture & { readonly fake: FakeResources };

const editRent = () => <RecordScreen id={GOLDEN.rentId} mode="edit" now={CATALOGUE_NOW} conflictArea />;
const viewRent = () => <RecordScreen id={GOLDEN.rentId} now={CATALOGUE_NOW} conflictArea />;

/** The golden diary on a phone (a device diary that keeps the choice) or on the web (no diary: the choice cannot be kept). */
const golden = (onPhone: boolean) => (): Golden => {
  const fake = goldenFake();
  return { fake, resources: fake.resources, diary: onPhone ? deviceDiary().diary : null };
};

/** Another phone saves ฿13,000.00 with a note after this screen loaded the rent; this one saves ฿12,000.00 and is refused. */
const refused = (tc: Translate, { fake }: Golden): ScriptStep[] => [
  { waitFor: tc('Keypad') },
  {
    run: () => {
      const rent = fake.records.get(GOLDEN.rentId) as TransactionDto;
      fake.records.set(GOLDEN.rentId, { ...rent, amount_minor: '1300000', note: 'Rent and water', version: 2 } as TransactionDto);
    },
  },
  ...keypadSteps(tc, 'C12000'),
  { press: tc('Save changes') },
  { waitFor: 'choice-panel' },
];

/** A choice this phone kept earlier: ฿12,000.00 on the rent, refused at 09:14 by the ฿13,000.00 another phone saved. */
function keptChoice(): PendingChoice {
  const rent = goldenFake().records.get(GOLDEN.rentId) as TransactionDto;
  return {
    recordId: rent.id, original: rent, changes: { amount_minor: '1200000' },
    server: { ...rent, amount_minor: '1300000', note: 'Rent and water', version: 2 } as TransactionDto,
    editedAt: '2026-09-29T02:14:00.000Z', refusedAt: '2026-09-29T02:14:01.000Z',
  };
}

/** The rent deleted on another phone while this one keeps a choice for it. */
function deletedWithChoice(): ScreenFixture {
  const fake = goldenFake();
  const rent = fake.records.get(GOLDEN.rentId) as TransactionDto;
  fake.records.set(GOLDEN.rentId, { ...rent, deleted_at: '2026-09-29T00:00:00.000Z', version: 2 } as TransactionDto);
  return { resources: fake.resources, diary: deviceDiary({ pendingChoices: [keptChoice()] }).diary };
}

export const CONFLICT_SECTIONS: readonly CatalogueSection[] = [
  screenSection({ id: 'record-choice', title: 'Record: choice', fixture: golden(true), script: refused, render: editRent }),
  screenSection({
    id: 'record-choice-server',
    title: "Record: choice, the server's chosen",
    fixture: golden(true),
    script: (tc, fixture) => [...refused(tc, fixture), { call: 'onPress', on: { testID: 'choice-server' } }],
    render: editRent,
  }),
  screenSection({
    id: 'record-choice-offline',
    title: 'Record: choice offline',
    // The record cannot be read: the panel compares with the record the choice stored.
    fixture: () => ({ resources: alwaysFails(goldenFake().resources, 'transaction', 'network'), diary: deviceDiary({ pendingChoices: [keptChoice()] }).diary }),
    script: () => [{ waitFor: 'choice-panel' }],
    render: viewRent,
  }),
  screenSection({ id: 'record-choice-deleted', title: 'Record: choice, deleted elsewhere', fixture: deletedWithChoice, script: (tc) => [{ waitFor: tc('Restore') }], render: viewRent }),
  screenSection({ id: 'record-choice-cannot-keep', title: 'Record: choice, cannot keep', fixture: golden(false), script: refused, render: editRent }),
  screenSection({
    id: 'history-choice-waiting',
    title: 'History: waiting for a choice',
    fixture: () => ({ resources: goldenFake().resources, diary: deviceDiary({ pendingChoices: [keptChoice()] }).diary }),
    script: (tc) => [{ waitFor: `${tc('Money in')} ฿28,000.00` }, { waitFor: 'choice-waiting' }],
    render: () => <HistoryScreen now={CATALOGUE_NOW} conflictArea />,
  }),
];
