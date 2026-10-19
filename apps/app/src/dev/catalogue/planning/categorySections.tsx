// The Categories screen in each of its states (R4 Planning, development
// only), drawn by the real CategoriesScreen on fakes and reached with the
// same steps as CategoriesScreen.render.test.tsx: the same taps, the same
// held, failed or changed-elsewhere saves. Not registered yet: the main
// session adds CATEGORY_SECTIONS to registry.tsx.
import { CATEGORY_COLORS } from '@gogospend/contracts';
import type { BudgetDto, CategoryDto } from '@gogospend/contracts';

import { CategoriesScreen } from '@mobile/screens/redesign/planning/CategoriesScreen';
import { BUILTINS, createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
import type { CatalogueSection } from '../registry';
import { CATALOGUE_NOW, alwaysFails } from '../screenFixtures';
import type { FakeResources } from '../screenFixtures';
import { screenSection } from '../screenSection';
import type { ScreenFixture, ScriptStep, Translate } from '../screenSection';

const categories = () => <CategoriesScreen now={CATALOGUE_NOW} />;

// The render test's own account: the built-ins, Pets of the person's own and
// Old hobby archived, with September's budget of ฿20,000.00 holding a
// ฿3,000.00 limit on Travel.
const [FOOD, TRAVEL] = BUILTINS;
const PETS: CategoryDto = { id: '0000000c-0000-4000-8000-0000000000a1', type: 'expense', builtin_key: null, label: 'Pets', color: CATEGORY_COLORS[2], archived: false, version: 1 };
const OLD: CategoryDto = { id: '0000000c-0000-4000-8000-0000000000a2', type: 'expense', builtin_key: null, label: 'Old hobby', color: CATEGORY_COLORS[9], archived: true, version: 3 };
const BUDGET: BudgetDto = {
  id: '0000000d-0000-4000-8000-000000000001', month: '2026-09', overall_limit_minor: '2000000', category_limits: [{ category_id: TRAVEL.id, limit_minor: '300000' }], version: 4,
};

type Seed = { categories?: CategoryDto[]; budgets?: BudgetDto[] };
type Fixture = ScreenFixture & { readonly fake: FakeResources };

function account(seed: Seed = {}, change?: (fake: FakeResources) => void): Fixture {
  const fake = createFakeResources({ wallets: goldenSeed().wallets, categories: seed.categories ?? [...BUILTINS, PETS, OLD], budgets: seed.budgets ?? [BUDGET] });
  change?.(fake);
  return { fake, resources: fake.resources, diary: null };
}

/** The grid has loaded. */
const ready = (tc: Translate): ScriptStep[] => [{ waitFor: tc('New category') }];
/** The form for a new category, named "Coffee". */
const newCoffee = (tc: Translate): ScriptStep[] => [...ready(tc), { press: tc('New category') }, { waitFor: tc('Name') }, { type: 'Coffee', into: tc('Name') }];
/** The form for an existing category, from its tile. */
const editing = (tc: Translate, tile: string): ScriptStep[] => [...ready(tc), { press: tile }, { waitFor: tc('Save changes') }];

export const CATEGORY_SECTIONS: CatalogueSection[] = [
  screenSection({
    id: 'categories-loading',
    title: 'Categories: loading',
    // Jotbun never answers, so the spinner stays.
    fixture: () => account({}, (fake) => { fake.hold('ensureBuiltinCategories'); }),
    script: (tc) => [{ waitFor: tc('Loading your diary') }],
    render: categories,
  }),
  screenSection({
    id: 'categories-load-problem',
    title: 'Categories: load problem',
    // Offline: every load fails, so Try again meets the same problem.
    fixture: () => {
      const fixture = account();
      return { ...fixture, resources: alwaysFails(fixture.resources, 'ensureBuiltinCategories', 'network') };
    },
    script: (tc) => [{ waitFor: tc("We couldn't load your diary.") }],
    render: categories,
  }),
  screenSection({ id: 'categories-expense', title: 'Categories: expense', fixture: () => account(), script: ready, render: categories }),
  screenSection({
    id: 'categories-income',
    title: 'Categories: income',
    fixture: () => account(),
    script: (tc) => [...ready(tc), { press: tc('Income') }, { waitFor: tc('Salary') }],
    render: categories,
  }),
  screenSection({
    id: 'categories-no-custom',
    title: 'Categories: no custom yet',
    fixture: () => account({ categories: [...BUILTINS] }),
    script: (tc) => [...ready(tc), { waitFor: tc('No categories of your own yet') }],
    render: categories,
  }),
  screenSection({
    id: 'categories-create',
    title: 'Categories: creating',
    // Named, coloured and limited: the preview shows the chip as Quick add will.
    fixture: () => account(),
    script: (tc) => [...newCoffee(tc), { press: tc('Lavender') }, { type: '500', into: tc("This month's limit") }],
    render: categories,
  }),
  screenSection({
    id: 'categories-edit-builtin',
    title: 'Categories: editing a built-in',
    // Food renamed "Meals": "Use the default name" puts its own name back.
    fixture: () => account({ categories: [{ ...FOOD, label: 'Meals', version: 2 }, ...BUILTINS.slice(1), PETS, OLD] }),
    script: (tc) => [...editing(tc, 'Meals'), { waitFor: tc('Use the default name') }],
    render: categories,
  }),
  screenSection({
    id: 'categories-saving',
    title: 'Categories: saving',
    // Jotbun never answers, so the save stays busy.
    fixture: () => account({}, (fake) => { fake.hold('createCategory'); }),
    script: (tc) => [...newCoffee(tc), { press: tc('Add this category') }, { waitFor: tc('Saving…') }],
    render: categories,
  }),
  screenSection({
    id: 'categories-unconfirmed',
    title: 'Categories: unconfirmed',
    // The save's answer is lost: the form freezes and offers only Try again.
    fixture: () => account({}, (fake) => { fake.fail('createCategory', 'network'); }),
    script: (tc) => [...newCoffee(tc), { press: tc('Add this category') }, { waitFor: tc('Try again') }],
    render: categories,
  }),
  screenSection({
    id: 'categories-conflict',
    title: 'Categories: conflict',
    // Pets is renamed "Dogs" on another device while it is being renamed "Cats" here.
    fixture: () => account(),
    script: (tc, fixture) => [
      ...editing(tc, 'Pets'),
      { type: 'Cats', into: tc('Name') },
      { run: () => { fixture.fake.categories.set(PETS.id, { ...PETS, label: 'Dogs', color: CATEGORY_COLORS[11], version: 2 }); } },
      { press: tc('Save changes') },
      { waitFor: 'categories-conflict' },
    ],
    render: categories,
  }),
  screenSection({
    id: 'categories-archived',
    title: 'Categories: archived',
    fixture: () => account(),
    script: (tc) => [...ready(tc), { press: tc('{label}, {value}', { label: tc('Archived'), value: '1' }) }, { waitFor: tc('Unarchive {name}', { name: OLD.label as string }) }],
    render: categories,
  }),
  screenSection({
    id: 'categories-archive-confirm',
    title: 'Categories: archive confirm',
    fixture: () => account(),
    script: (tc) => [...editing(tc, 'Pets'), { press: tc('Archive category') }, { waitFor: tc('Archive {name}?', { name: 'Pets' }) }],
    render: categories,
  }),
  screenSection({
    id: 'categories-limit-no-budget',
    title: 'Categories: limit, no budget',
    // September has no budget: a limit waits for one, and the screen links to Budget.
    fixture: () => account({ budgets: [] }),
    script: (tc) => [...editing(tc, tc('Food')), { waitFor: tc('Set a monthly budget') }],
    render: categories,
  }),
  screenSection({
    id: 'categories-limit-over',
    title: 'Categories: limit over the total',
    // ฿17,000.01 on Food, with ฿3,000.00 on Travel, is one satang over the ฿20,000.00 budget.
    fixture: () => account(),
    script: (tc) => [...editing(tc, tc('Food')), { type: '17000.01', into: tc("This month's limit") }, { waitFor: tc("Category limits would add up to {total}, more than this month's budget of {overall}.", { total: '฿20,000.01', overall: '฿20,000.00' }) }],
    render: categories,
  }),
  screenSection({
    id: 'categories-label-error',
    title: 'Categories: label error',
    // Add this category with no name.
    fixture: () => account(),
    script: (tc) => [...ready(tc), { press: tc('New category') }, { waitFor: tc('Name') }, { press: tc('Add this category') }, { waitFor: tc('Give the category a name.') }],
    render: categories,
  }),
];
