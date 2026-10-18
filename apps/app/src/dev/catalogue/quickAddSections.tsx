// Quick add in each of its states (redesign R2c+, development only), drawn by
// the real QuickAddScreen on fakes and reached with the same steps as
// QuickAddScreen.render.test.tsx: the same keys, the same chips, the same
// held, failed or lost saves. Online unless the state is about the device.
import type { CategoryDto, TransactionDto } from '@gogospend/contracts';

import { readCheerDay, writeCheerDay } from '@mobile/screens/redesign/quickAddCheer';
import { QuickAddScreen } from '@mobile/screens/redesign/QuickAddScreen';
import type { SpendV1Resources } from '@mobile/spend/v1/resources';
import { addDays } from '@mobile/spend/v1/redesign/shared';
import { createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
import type { CatalogueSection } from './registry';
import { CATALOGUE_NOW, CATALOGUE_TODAY, GOLDEN, deviceDiary, goldenFake } from './screenFixtures';
import { keypadSteps, screenSection } from './screenSection';
import type { ScreenFixture, Translate } from './screenSection';

const quickAdd = () => <QuickAddScreen now={CATALOGUE_NOW} />;
const online = (resources: SpendV1Resources = goldenFake().resources): ScreenFixture => ({ resources, diary: null });
/** The form has loaded and can be typed into. */
const ready = (tc: Translate) => [{ waitFor: tc('Keypad') }];
/** "65", Food, Save: the render test's plain expense. */
const saveCoffee = (tc: Translate) => [...ready(tc), ...keypadSteps(tc, '65'), { press: tc('Food') }, { press: tc('Save entry') }];

// The render test's own categories and recent use: three of the person's own (one deleted
// three times, one archived), so the chips are Coffee, Pets and Food and More holds the rest.
const custom = (n: number, label: string, archived = false): CategoryDto => ({
  id: `0000000c-0000-4000-8000-0000000000a${n}`, type: 'expense', builtin_key: null, label, color: null, archived, version: 1,
});
const COFFEE = custom(1, 'Coffee');
const PETS = custom(2, 'Pets');
const GYM = custom(3, 'Gym');
const SHUT = custom(4, 'Closed one', true);
let usedNumber = 100;
const used = (category: CategoryDto, occurredOn: string, deleted = false): TransactionDto => {
  usedNumber += 1;
  return {
    id: `0000000b-0000-4000-8000-000000000${usedNumber}`, type: 'expense', amount_minor: '100', occurred_on: occurredOn, wallet_id: GOLDEN.cash.id,
    category_id: category.id, note: null, merchant: null, deleted_at: deleted ? '2026-09-29T00:00:00.000Z' : null, version: 1,
  } as TransactionDto;
};
function rankedCategories(): SpendV1Resources {
  const seed = goldenSeed();
  const travel = GOLDEN.categories.travel;
  const fake = createFakeResources({
    wallets: seed.wallets,
    records: [
      ...seed.records,
      used(COFFEE, '2026-09-29'), used(COFFEE, '2026-09-28'), used(COFFEE, '2026-09-20'), used(PETS, '2026-09-29'),
      used(travel, '2026-08-01'), used(travel, '2026-08-02'),
      used(GYM, '2026-09-29', true), used(GYM, '2026-09-29', true), used(GYM, '2026-09-29', true), used(SHUT, '2026-09-29'),
    ],
  });
  return { ...fake.resources, ensureBuiltinCategories: async () => [...(await fake.resources.ensureBuiltinCategories()), COFFEE, PETS, GYM, SHUT] };
}

/**
 * The cheer shows at most once a Bangkok day, and the catalogue's day is
 * always 29 September 2026, so a second visit would draw no bun. Before the
 * saved moment opens, a stored day equal to that one is moved back a day.
 * The app itself compares the stored day with the real today, so a day in
 * 2026's September never changes what it shows.
 */
async function cheerAgain(): Promise<void> {
  if ((await readCheerDay()) === CATALOGUE_TODAY) await writeCheerDay(addDays(CATALOGUE_TODAY, -1));
}

export const QUICK_ADD_SECTIONS: readonly CatalogueSection[] = [
  screenSection({ id: 'quick-add-empty', title: 'Quick add: empty', fixture: () => online(), script: ready, render: quickAdd }),
  screenSection({ id: 'quick-add-sum', title: 'Quick add: keypad sum', fixture: () => online(), script: (tc) => [...ready(tc), ...keypadSteps(tc, '12.50+7.25')], render: quickAdd }),
  screenSection({
    id: 'quick-add-categories',
    title: 'Quick add: categories',
    fixture: () => online(rankedCategories()),
    script: (tc) => [...ready(tc), { press: tc('More categories') }, { waitFor: tc('Choose a category') }],
    render: quickAdd,
  }),
  screenSection({
    id: 'quick-add-move',
    title: 'Quick add: same wallet',
    fixture: () => online(),
    // Move ฿1,500.00, then choose Cash as To as well.
    script: (tc) => [
      ...ready(tc),
      { press: tc('Move') },
      ...keypadSteps(tc, '1500'),
      { press: tc('To {name}, balance {amount}', { name: GOLDEN.daily.name, amount: '฿18,700.00' }) },
      { press: tc('{name}, balance {amount}', { name: GOLDEN.cash.name, amount: '฿2,350.00' }) },
      { waitFor: tc('Choose two different wallets') },
    ],
    render: quickAdd,
  }),
  screenSection({
    id: 'quick-add-details',
    title: 'Quick add: details',
    fixture: () => online(),
    script: (tc) => [
      ...ready(tc),
      ...keypadSteps(tc, '65'),
      { press: tc('More details') },
      { type: 'Corner café', into: tc('Merchant') },
      { type: 'Lunch with Mai', into: tc('Note') },
    ],
    render: quickAdd,
  }),
  screenSection({
    id: 'quick-add-saving',
    title: 'Quick add: saving',
    // Jotbun never answers, so the save stays busy.
    fixture: () => {
      const fake = goldenFake();
      fake.hold('createTransaction');
      return online(fake.resources);
    },
    script: (tc) => [...saveCoffee(tc), { waitFor: tc('Saving…') }],
    render: quickAdd,
  }),
  screenSection({
    id: 'quick-add-unconfirmed',
    title: 'Quick add: unconfirmed',
    // The save's answer is lost: the entry freezes and offers only Try again (which then goes through).
    fixture: () => {
      const fake = goldenFake();
      fake.fail('createTransaction', 'network');
      return online(fake.resources);
    },
    script: (tc) => [...saveCoffee(tc), { waitFor: tc('Try again') }],
    render: quickAdd,
  }),
  screenSection({
    id: 'quick-add-saved',
    title: 'Quick add: saved, cheer',
    fixture: () => ({ ...online(), prepare: cheerAgain }),
    script: (tc) => [...saveCoffee(tc), { waitFor: 'quick-add-saved' }],
    render: quickAdd,
  }),
  screenSection({
    id: 'quick-add-copy',
    title: 'Quick add: copy',
    // Copy of the golden rent: /spend/add?copyOf=<rent>.
    fixture: () => ({ ...online(), params: { copyOf: GOLDEN.rentId } }),
    script: ready,
    render: quickAdd,
  }),
  screenSection({
    id: 'quick-add-no-wallet',
    title: 'Quick add: no wallet',
    fixture: () => online(createFakeResources().resources),
    script: (tc) => [{ waitFor: tc('No wallets yet') }],
    render: quickAdd,
  }),
  screenSection({
    id: 'quick-add-device-error',
    title: 'Quick add: device error',
    // The phone's diary refuses the save.
    fixture: () => {
      const diary = deviceDiary();
      diary.failNextSave(new Error('The device storage is full.'));
      return { resources: goldenFake().resources, diary: diary.diary };
    },
    script: (tc) => [...saveCoffee(tc), { waitFor: tc("Couldn't save this entry on the device. Nothing was saved.") }],
    render: quickAdd,
  }),
];
