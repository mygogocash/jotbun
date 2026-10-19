// The Wallets screen in each of its states (R4 Planning, development only),
// drawn by the real WalletsScreen on fakes and reached with the same steps as
// WalletsScreen.render.test.tsx: the same taps, keys and names, the same
// held, failed or lost commands, and the same changes "on another device".
// Not registered yet: the main session adds WALLET_SECTIONS to registry.tsx.
import type { TransactionDto, WalletSnapshot } from '@gogospend/contracts';

import { WalletsScreen } from '@mobile/screens/redesign/planning/WalletsScreen';
import { createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
import type { CatalogueSection } from '../registry';
import { CATALOGUE_NOW, GOLDEN, alwaysFails, deviceDiary, expense, goldenFake } from '../screenFixtures';
import type { FakeResources } from '../screenFixtures';
import { keypadSteps, screenSection } from '../screenSection';
import type { ScreenFixture, ScriptStep, Translate } from '../screenSection';

const wallets = () => <WalletsScreen now={CATALOGUE_NOW} />;

/** A fixture that keeps its fake, so a script can change it as another device would. */
type WalletFixture = ScreenFixture & { readonly fake: FakeResources };
const online = (fake: FakeResources = goldenFake()): WalletFixture => ({ resources: fake.resources, diary: null, fake });

/** At exactly ฿0.00 and with no entries: the wallet that can be archived. */
const OLD_CARD: WalletSnapshot = { id: '0000000a-0000-4000-8000-000000000003', name: 'Old card', currency: 'THB', opening_minor: '0', tracking_start: '2026-09-01', archived: false, version: 1 };
/** Archived earlier, at ฿0.00. */
const TRAVEL_CARD: WalletSnapshot = { ...OLD_CARD, id: '0000000a-0000-4000-8000-000000000004', name: 'Travel card', archived: true, version: 2 };

/** The golden diary with more wallets (and records). */
function goldenWith(extra: readonly WalletSnapshot[], records: readonly TransactionDto[] = []): FakeResources {
  const seed = goldenSeed();
  return createFakeResources({ wallets: [...seed.wallets, ...extra], records: [...seed.records, ...records] });
}

const ready = (tc: Translate): ScriptStep[] => [{ waitFor: tc('Add a wallet') }];
const card = (tc: Translate, name: string, amount: string) => tc('{name}, balance {amount}', { name, amount });
/** The golden Cash wallet, opened for editing. */
const editCash = (tc: Translate): ScriptStep[] => [...ready(tc), { press: card(tc, GOLDEN.cash.name, '฿2,350.00') }, { waitFor: tc('Save changes') }];
const editOldCard = (tc: Translate): ScriptStep[] => [...ready(tc), { press: card(tc, OLD_CARD.name, '฿0.00') }, { waitFor: tc('Archive wallet') }];
/** Add a wallet: "Piggy bank" with ฿1,234.50 typed on the keypad. */
const createPiggy = (tc: Translate): ScriptStep[] => [
  ...ready(tc),
  { press: tc('Add a wallet') },
  { type: 'Piggy bank', into: tc('Wallet name') },
  ...keypadSteps(tc, '1234.5'),
];

export const WALLET_SECTIONS: CatalogueSection[] = [
  screenSection({
    id: 'wallets-loading',
    title: 'Wallets: loading',
    // Jotbun never answers.
    fixture: () => {
      const fake = goldenFake();
      fake.hold('wallets');
      return online(fake);
    },
    script: (tc) => [{ waitFor: tc('Loading your wallets') }],
    render: wallets,
  }),
  screenSection({
    id: 'wallets-problem',
    title: 'Wallets: load problem',
    fixture: (): ScreenFixture => ({ resources: alwaysFails(goldenFake().resources, 'wallets', 'network'), diary: null }),
    script: (tc) => [{ waitFor: tc("We couldn't load your diary.") }],
    render: wallets,
  }),
  screenSection({
    id: 'wallets-offline',
    title: 'Wallets: offline',
    // Jotbun is out of reach; the phone's diary has the golden wallets synced.
    fixture: (): ScreenFixture => ({ resources: alwaysFails(goldenFake().resources, 'wallets', 'network'), diary: deviceDiary().diary }),
    script: () => [{ waitFor: 'wallets-on-device' }],
    render: wallets,
  }),
  screenSection({
    id: 'wallets-first-run',
    title: 'Wallets: first run',
    fixture: () => online(createFakeResources()),
    script: (tc) => [{ waitFor: tc('Add your first wallet') }],
    render: wallets,
  }),
  screenSection({ id: 'wallets-list', title: 'Wallets: list', fixture: () => online(), script: ready, render: wallets }),
  screenSection({
    id: 'wallets-archived',
    title: 'Wallets: archived',
    fixture: () => online(goldenWith([TRAVEL_CARD])),
    script: (tc) => [...ready(tc), { press: tc('Archived wallets ({count})', { count: 1 }) }, { waitFor: tc('Unarchive {name}', { name: TRAVEL_CARD.name }) }],
    render: wallets,
  }),
  screenSection({ id: 'wallets-create', title: 'Wallets: create, live preview', fixture: () => online(), script: createPiggy, render: wallets }),
  screenSection({
    id: 'wallets-saving',
    title: 'Wallets: saving',
    // The create is held, so the action stays busy.
    fixture: () => {
      const fake = goldenFake();
      fake.hold('createWallet');
      return online(fake);
    },
    script: (tc) => [...createPiggy(tc), { press: tc('Create wallet') }, { waitFor: tc('Saving…') }],
    render: wallets,
  }),
  screenSection({
    id: 'wallets-unconfirmed',
    title: 'Wallets: unconfirmed',
    // The answer is lost: the form freezes and offers only Try again (which then goes through).
    fixture: () => {
      const fake = goldenFake();
      fake.fail('createWallet', 'network');
      return online(fake);
    },
    script: (tc) => [...createPiggy(tc), { press: tc('Create wallet') }, { waitFor: tc('Try again') }],
    render: wallets,
  }),
  screenSection({ id: 'wallets-edit', title: 'Wallets: edit, not at zero', fixture: () => online(), script: editCash, render: wallets }),
  screenSection({
    id: 'wallets-conflict',
    title: 'Wallets: changed elsewhere',
    // Cash is renamed "Wallet" here while another device renames it "Pocket".
    fixture: () => online(),
    script: (tc, fixture: WalletFixture) => [
      ...editCash(tc),
      { type: 'Wallet', into: tc('Wallet name') },
      { run: () => { fixture.fake.wallets.set(GOLDEN.cash.id, { ...GOLDEN.cash, name: 'Pocket', version: 2 }); } },
      { press: tc('Save changes') },
      { waitFor: 'wallet-conflict' },
    ],
    render: wallets,
  }),
  screenSection({
    id: 'wallets-archive-confirm',
    title: 'Wallets: archive confirm',
    fixture: () => online(goldenWith([OLD_CARD])),
    script: (tc) => [...editOldCard(tc), { press: tc('Archive wallet') }, { waitFor: tc('Archive {name}', { name: OLD_CARD.name }) }],
    render: wallets,
  }),
  screenSection({
    id: 'wallets-archive-refused',
    title: 'Wallets: archive refused',
    // Old card is at ฿0.00 when opened; another device spends ฿50.00 from it before Archive is confirmed.
    fixture: () => online(goldenWith([OLD_CARD])),
    script: (tc, fixture: WalletFixture) => [
      ...editOldCard(tc),
      { press: tc('Archive wallet') },
      {
        run: () => {
          const spent = expense(241, '2026-09-29', '5000', { wallet_id: OLD_CARD.id });
          fixture.fake.records.set(spent.id, spent);
        },
      },
      { press: tc('Archive {name}', { name: OLD_CARD.name }) },
      { waitFor: tc("{name} wasn't archived: its balance is no longer {zero}.", { name: OLD_CARD.name, zero: '฿0.00' }) },
    ],
    render: wallets,
  }),
  screenSection({
    id: 'wallets-correction',
    title: 'Wallets: correction reason',
    // Cash has entries: a new opening balance asks why before anything is sent.
    fixture: () => online(),
    script: (tc) => [...editCash(tc), ...keypadSteps(tc, 'C5000'), { press: tc('Save changes') }, { waitFor: tc("Choose why you're changing this.") }],
    render: wallets,
  }),
  screenSection({
    id: 'wallets-field-error',
    title: 'Wallets: field problem',
    // Cash has an entry on 1 September, so Jotbun refuses a tracking start after it.
    fixture: () => {
      const fake = goldenFake([expense(242, '2026-09-01', '2000', { wallet_id: GOLDEN.cash.id })]);
      fake.fail('updateWallet', 'invalid', { status: 422, code: 'VALIDATION_FAILED', fields: { tracking_start: 'errors.records_before_tracking_start' } });
      return online(fake);
    },
    script: (tc) => [
      ...ready(tc),
      { press: card(tc, GOLDEN.cash.name, '฿2,330.00') },
      { waitFor: tc('Save changes') },
      { press: tc('Next day') },
      { press: tc('A mistake when I set it up') },
      { press: tc('Save changes') },
      { waitFor: tc('This wallet has entries before this date.') },
    ],
    render: wallets,
  }),
];
