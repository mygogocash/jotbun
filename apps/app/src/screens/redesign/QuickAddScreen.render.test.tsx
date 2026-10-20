// Redesign R3 Quick add. Two halves:
// - Parity: every behaviour the current Add form's tests pin
//   (AddTransactionScreen, OfflineSave and M5Hardening), ported to the keypad
//   screen: the exact command, one record id and command key per draft, the
//   frozen unconfirmed resend, isOwnCreate, the device save, the device
//   errors, transfers, note and merchant normalization and future dates.
// - New: exact keypad maths into the save input, category ranking, the More
//   sheet, Copy (copyOf), Add another, the saved moment and the bun, the
//   states, and TH/EN/VI in light and dark.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReactElement } from 'react';
import { IntlProvider } from 'react-intl';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
const search = vi.hoisted(() => ({ params: {} as Record<string, string> }));
const shared = vi.hoisted(() => ({ resources: null as unknown }));
vi.mock('expo-router', () => ({ useRouter: () => router, useLocalSearchParams: () => search.params }));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));
vi.mock('@mobile/api/sharedV1', () => ({ getSharedV1Resources: () => shared.resources }));
// react-native-svg's asset registry is stubbed for every render test by the shared alias in vitest.render.config.ts.

import type { CategoryDto, TransactionDto, WalletSnapshot } from '@gogospend/contracts';
import { translateCopy } from '@mobile/i18n/messages';
import type { Locale } from '@mobile/i18n/locales';
import type { BunIntensity } from '@mobile/mascot/bunIntensity';
import { BunIntensityProvider } from '@mobile/mascot/BunIntensityProvider';
import { BUN_INTENSITY_STORAGE_KEY } from '@mobile/mascot/bunIntensityStorage';
import { installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import type { SpendV1Resources } from '@mobile/spend/v1/resources';
import { SpendDiaryProvider } from '@mobile/spend/v1/SpendDiaryContext';
import type { SpendDiary } from '@mobile/spend/v1/spendDiary';
import { SpendV1Provider } from '@mobile/spend/v1/SpendV1Context';
import { createFakeDiary } from '@mobile/spend/v1/testing/fakeDiary';
import { BUILTINS, createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
import { DiaryLocked, DraftReferenceUnavailable } from '@mobile/storage/types';
import type { OutboxCommand, PendingEntry } from '@mobile/storage/types';
import { bunDark, bunLight } from '@mobile/theme/bunPalette';
import { ThemePreferenceOverride, ThemeProvider } from '@mobile/theme/ThemeProvider';
import { rgb } from '@mobile/ui/entryKitTestHarness';
import SpendAddRoute from '../../../app/spend/add';
import { NOW } from '../v1/renderHarness';
import { QUICK_ADD_CHEER_KEY } from './quickAddCheer';
import { QuickAddScreen } from './QuickAddScreen';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TODAY = '2026-09-29';
const [food, travel, bills, salary] = BUILTINS;
const seed = goldenSeed();
const [cash, daily] = seed.wallets;
const RENT = '0000000b-0000-4000-8000-000000000003';
const MOVE = '0000000b-0000-4000-8000-000000000004';
// Golden balances: Cash 4,032 − 182 − 1,500; Daily 1,468 + 28,000 − 12,268 + 1,500.
const CASH_BALANCE = '฿2,350.00';
const DAILY_BALANCE = '฿18,700.00';

beforeAll(() => {
  installBrowserStorage();
});
afterEach(() => {
  cleanup();
  shownLocale = 'en';
  search.params = {};
  router.replace.mockReset();
  window.localStorage.clear();
  vi.unstubAllEnvs();
});

type Mode = 'light' | 'dark';
type MountOptions = { locale?: string; mode?: Mode; diary?: SpendDiary | null; intensity?: BunIntensity };

function mount(ui: ReactElement, resources: SpendV1Resources, { locale = 'en', mode = 'light', diary = null, intensity }: MountOptions = {}) {
  if (intensity) window.localStorage.setItem(BUN_INTENSITY_STORAGE_KEY, intensity);
  return render(
    <IntlProvider locale={locale}>
      <ThemeProvider>
        <ThemePreferenceOverride preference={mode}>
          <BunIntensityProvider>
            <SpendV1Provider resources={resources}>
              <SpendDiaryProvider diary={diary}>{ui}</SpendDiaryProvider>
            </SpendV1Provider>
          </BunIntensityProvider>
        </ThemePreferenceOverride>
      </ThemeProvider>
    </IntlProvider>,
  );
}

/** Lets every settled fake call land (the fakes use no timers). */
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

type Fake = ReturnType<typeof createFakeResources>;
type OpenOptions = MountOptions & {
  seed?: { wallets?: WalletSnapshot[]; records?: TransactionDto[] };
  wrap?: (fake: Fake) => SpendV1Resources;
  before?: (fake: Fake) => void;
};

/** Opens Quick add on the golden diary and waits until it can be typed into. */
async function open(options: OpenOptions = {}): Promise<Fake> {
  const fake = createFakeResources(options.seed ?? goldenSeed());
  options.before?.(fake);
  mount(<QuickAddScreen now={NOW} />, options.wrap ? options.wrap(fake) : fake.resources, options);
  shownLocale = (options.locale ?? 'en') as Locale;
  await screen.findByRole('group', { name: keypadName() });
  await settle();
  return fake;
}

const KEY_NAMES: Readonly<Record<string, string>> = {
  '.': 'Decimal point', '+': 'Plus sign', '-': 'Minus sign', '*': 'Times', '/': 'Divided by', '=': 'Equals', '000': 'Triple zero', C: 'Clear', '<': 'Delete',
};
/** The locale the last `open` showed, so the keypad is found by its translated name. */
let shownLocale: Locale = 'en';
const keypadName = () => translateCopy('Keypad', shownLocale);
const keypad = () => screen.getByRole('group', { name: keypadName() });
/** Presses keypad keys: digits as themselves, `.`, `+ - * / =`, `000`, `C` (clear) and `<` (delete). */
function press(...keys: string[]) {
  for (const key of keys) fireEvent.click(within(keypad()).getByRole('button', { name: KEY_NAMES[key] ? translateCopy(KEY_NAMES[key], shownLocale) : key }));
}
const typeAmount = (text: string) => press(...[...text]);
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));
const choose = (name: string) => fireEvent.click(screen.getByRole('radio', { name }));
const chips = () => within(screen.getByRole('radiogroup', { name: 'Category' })).getAllByRole('radio');
const chipNames = () => chips().map((chip) => chip.getAttribute('aria-label'));
const disabled = (element: HTMLElement) => element.getAttribute('aria-disabled') === 'true';
const createCalls = (fake: Fake) => fake.callsOf('createTransaction').map((call) => call.args as [Record<string, unknown>, string]);
const transferCalls = (fake: Fake) => fake.callsOf('createTransfer').map((call) => call.args as [Record<string, unknown>, string]);

/** Records every device save, including ones the fake diary then refuses. */
function recordingDiary(view: Parameters<typeof createFakeDiary>[0] = {}) {
  const fakeDiary = createFakeDiary(view);
  const attempts: { entry: PendingEntry; commandId: string | undefined }[] = [];
  const original = fakeDiary.diary.saveDraft;
  fakeDiary.diary.saveDraft = async (entry, commandId) => {
    attempts.push({ entry, commandId });
    return original(entry, commandId);
  };
  return { ...fakeDiary, attempts };
}

// ---------------------------------------------------------------------------
// Parity with the current Add form

test('saves an expense as one exact command and shows it saved only after the acknowledgement', async () => {
  const fake = await open();
  const release = fake.hold('createTransaction');
  typeAmount('65');
  choose('Food');
  save();
  expect(await screen.findByRole('button', { name: 'Saving…' })).toBeTruthy();
  expect(screen.queryByText('Saved')).toBeNull();
  release();
  expect(await screen.findByText('Saved')).toBeTruthy();
  const [[input, key]] = createCalls(fake);
  expect(input).toEqual({ id: expect.stringMatching(UUID), type: 'expense', amount_minor: '6500', occurred_on: TODAY, wallet_id: cash.id, category_id: food.id, note: null, merchant: null });
  expect(key).toMatch(UUID);
  expect(key).not.toBe(input.id);
  expect(router.replace).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  expect(router.replace).toHaveBeenCalledWith('/spend');
});

test.each([
  ['nothing typed', '', 'Enter an amount'],
  ['zero', '0', 'Enter an amount above zero'],
  ['zero from 000', '000', 'Enter an amount above zero'],
])('refuses %s without sending anything', async (_name, keys, message) => {
  const fake = await open();
  if (keys === '000') press('000');
  else typeAmount(keys);
  save();
  expect(await screen.findByText(message)).toBeTruthy();
  expect(fake.callsOf('createTransaction')).toHaveLength(0);
  expect(screen.queryByText('Saved')).toBeNull();
});

test('a third decimal is refused as it is typed, and the amount stays exact', async () => {
  const fake = await open();
  typeAmount('1.234');
  expect(await screen.findByText('Use at most two decimal places')).toBeTruthy();
  expect(screen.getByLabelText('Expense ฿1.23')).toBeTruthy();
  expect(fake.callsOf('createTransaction')).toHaveLength(0);
});

test('an amount above the cap is refused as it is typed', async () => {
  await open();
  typeAmount('9999999999');
  expect(await screen.findByText('Amounts go up to ฿999,999,999.99')).toBeTruthy();
  expect(screen.getByLabelText('Expense ฿999,999,999.00')).toBeTruthy();
});

test('a future date can never be chosen: the chip stops at today and the calendar shuts tomorrow', async () => {
  await open();
  expect(screen.getByRole('button', { name: /^Pick another date, .*29 September 2026$/ })).toBeTruthy();
  expect(disabled(screen.getByRole('button', { name: 'Next day' }))).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
  expect(screen.getByRole('button', { name: /^Pick another date, .*28 September 2026$/ })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Next day' }));
  expect(disabled(screen.getByRole('button', { name: 'Next day' }))).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: /^Pick another date/ }));
  expect(disabled(await screen.findByRole('button', { name: /30 September 2026$/ }))).toBe(true);
});

test('an unconfirmed save freezes the whole entry and offers only Try again, which resends the same command', async () => {
  const fake = await open();
  fake.fail('createTransaction', 'network');
  typeAmount('65');
  save();
  expect(await screen.findByText('Not confirmed yet. Your entry is kept; try again.')).toBeTruthy();
  // Frozen: no key, type, category, date, wallet or detail can change.
  for (const key of within(keypad()).getAllByRole('button')) expect(disabled(key)).toBe(true);
  for (const kind of within(screen.getByRole('radiogroup', { name: 'Record type' })).getAllByRole('radio')) expect(disabled(kind)).toBe(true);
  for (const chip of chips()) expect(disabled(chip)).toBe(true);
  for (const name of ['More categories', 'Previous day', 'More details']) expect(disabled(screen.getByRole('button', { name }))).toBe(true);
  expect(disabled(screen.getByRole('button', { name: /^Pick another date/ }))).toBe(true);
  expect(disabled(screen.getByRole('button', { name: 'Wallet: Cash' }))).toBe(true);
  press('1');
  expect(screen.getByLabelText('Expense ฿65.00')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Save entry' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Saved')).toBeTruthy();
  const [first, second] = createCalls(fake);
  expect(second).toEqual(first);
});

test('records a move between two different wallets, with no category', async () => {
  const fake = await open();
  choose('Move');
  typeAmount('1500');
  expect(screen.queryByRole('radiogroup', { name: 'Category' })).toBeNull();
  expect(screen.getByLabelText('Transfer ฿1,500.00')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: `To Daily account, balance ${DAILY_BALANCE}` }));
  fireEvent.click(within(screen.getByRole('radiogroup', { name: 'To' })).getByRole('radio', { name: `Cash, balance ${CASH_BALANCE}` }));
  expect(screen.getAllByText('Choose two different wallets')).toHaveLength(1);
  save();
  await settle();
  expect(screen.getAllByText('Choose two different wallets')).toHaveLength(1);
  expect(fake.callsOf('createTransfer')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: `To Cash, balance ${CASH_BALANCE}` }));
  fireEvent.click(within(screen.getByRole('radiogroup', { name: 'To' })).getByRole('radio', { name: `Daily account, balance ${DAILY_BALANCE}` }));
  save();
  expect(await screen.findByText('Saved')).toBeTruthy();
  const [[input]] = transferCalls(fake);
  expect(input).toEqual({ id: expect.stringMatching(UUID), amount_minor: '150000', occurred_on: TODAY, note: null, merchant: null, source_wallet_id: cash.id, destination_wallet_id: daily.id });
  expect(fake.callsOf('createTransaction')).toHaveLength(0);
});

test('a move can swap its wallets and move a whole balance', async () => {
  const fake = await open();
  choose('Move');
  fireEvent.click(screen.getByRole('button', { name: 'Swap wallets' }));
  fireEvent.click(screen.getByRole('button', { name: `Move all ${DAILY_BALANCE}` }));
  expect(screen.getByLabelText('Transfer ฿18,700.00')).toBeTruthy();
  save();
  expect(await screen.findByText('Saved')).toBeTruthy();
  expect(transferCalls(fake)[0][0]).toMatchObject({ amount_minor: '1870000', source_wallet_id: daily.id, destination_wallet_id: cash.id });
});

test('an upgrade requirement blocks saving but keeps the draft', async () => {
  const fake = await open();
  fake.fail('createTransaction', 'upgrade_required', { status: 426, code: 'CLIENT_UPGRADE_REQUIRED' });
  typeAmount('65');
  save();
  expect(await screen.findByText('Update Jotbun to keep saving. Your entry is kept.')).toBeTruthy();
  expect(screen.getByLabelText('Expense ฿65.00')).toBeTruthy();
  expect(disabled(screen.getByRole('button', { name: 'Save entry' }))).toBe(true);
  expect(screen.queryByText('Saved')).toBeNull();
  expect(router.replace).not.toHaveBeenCalled();
});

test('a changed session blocks saving too', async () => {
  const fake = await open();
  fake.fail('createTransaction', 'session_changed', { status: 401 });
  typeAmount('65');
  save();
  expect(await screen.findByText('Your session changed. Sign in again to save.')).toBeTruthy();
  expect(disabled(screen.getByRole('button', { name: 'Save entry' }))).toBe(true);
});

test('a refused entry shows the field problem, and the corrected entry is a new command for the same record', async () => {
  const fake = await open();
  fake.fail('createTransaction', 'invalid', { status: 422, code: 'DATE_BEFORE_TRACKING_START', fields: { occurred_on: 'x' } });
  typeAmount('65');
  save();
  expect(await screen.findByText('This date is before the wallet started tracking.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
  save();
  expect(await screen.findByText('Saved')).toBeTruthy();
  const [first, second] = createCalls(fake);
  expect(second[1]).not.toBe(first[1]);
  expect(second[0].id).toBe(first[0].id);
  expect(second[0].occurred_on).toBe('2026-09-28');
});

test('with a device diary, an entry is saved on the device first, shown saved only once that commit succeeds, and never sent directly', async () => {
  const fake = createFakeResources(goldenSeed());
  const diary = createFakeDiary();
  const original = diary.diary.saveDraft;
  let finish: () => void = () => undefined;
  diary.diary.saveDraft = (entry, commandId) => new Promise<void>((resolve, reject) => {
    finish = () => { original(entry, commandId).then(resolve, reject); };
  });
  mount(<QuickAddScreen now={NOW} />, fake.resources, { diary: diary.diary });
  await screen.findByRole('group', { name: 'Keypad' });
  await settle();
  typeAmount('65');
  choose('Food');
  save();
  expect(await screen.findByRole('button', { name: 'Saving…' })).toBeTruthy();
  expect(screen.queryByText('Saved on this device')).toBeNull();
  await act(async () => finish());
  expect(await screen.findByText('Saved on this device')).toBeTruthy();
  expect(diary.saves).toHaveLength(1);
  expect(diary.saves[0]).toEqual({ id: expect.stringMatching(UUID), type: 'expense', amount_minor: '6500', occurred_on: TODAY, wallet_id: cash.id, category_id: food.id, note: null, merchant: null });
  expect(diary.commandIds[0]).toMatch(UUID);
  expect(fake.callsOf('createTransaction')).toHaveLength(0);
});

test('a failed local save shows a save error and never claims the entry was saved', async () => {
  const diary = createFakeDiary();
  diary.failNextSave(new Error('disk full'));
  await open({ diary: diary.diary });
  typeAmount('65');
  save();
  expect(await screen.findByText("Couldn't save this entry on the device. Nothing was saved.")).toBeTruthy();
  expect(screen.queryByText(/^Saved/)).toBeNull();
  expect(router.replace).not.toHaveBeenCalled();
});

test('offline, Quick add works from the wallets and categories synced to the device', async () => {
  const diary = createFakeDiary({ wallets: seed.wallets, categories: BUILTINS });
  const fake = await open({ diary: diary.diary, before: (f) => f.fail('wallets', 'network') });
  typeAmount('65');
  choose('Food');
  // No balance is known offline, so wallets are offered by name only.
  fireEvent.click(screen.getByRole('button', { name: 'Wallet: Cash' }));
  const sheet = await screen.findByRole('dialog', { name: 'Wallet' });
  expect(within(sheet).getAllByRole('radio').map((radio) => radio.getAttribute('aria-label'))).toEqual(['Cash', 'Daily account']);
  expect(within(sheet).queryByText(/฿/)).toBeNull();
  fireEvent.click(within(sheet).getByRole('radio', { name: 'Daily account' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Wallet' })).toBeNull());
  save();
  expect(await screen.findByText('Saved on this device')).toBeTruthy();
  expect(diary.saves[0]).toMatchObject({ wallet_id: daily.id, category_id: food.id, amount_minor: '6500' });
  expect(diary.commandIds[0]).toMatch(UUID);
  expect(fake.callsOf('createTransaction')).toHaveLength(0);
});

test('offline, a move uses the kit wallet picker by name: From and To cards, swap, and no move all without a balance', async () => {
  const diary = createFakeDiary({ wallets: seed.wallets, categories: BUILTINS });
  const fake = await open({ diary: diary.diary, before: (f) => f.fail('wallets', 'network') });
  choose('Move');
  typeAmount('100');
  // The kit's From → To cards, by name only: no balance is known on the device.
  expect(screen.getByRole('button', { name: 'From Cash' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'To Daily account' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Move all/ })).toBeNull();
  expect(screen.queryByText(CASH_BALANCE)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Swap wallets' }));
  expect(screen.getByRole('button', { name: 'From Daily account' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'To Cash' }));
  fireEvent.click(within(screen.getByRole('radiogroup', { name: 'To' })).getByRole('radio', { name: 'Daily account' }));
  // The same wallet twice is said once, by the picker.
  expect(screen.getAllByText('Choose two different wallets')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'To Daily account' }));
  fireEvent.click(within(screen.getByRole('radiogroup', { name: 'To' })).getByRole('radio', { name: 'Cash' }));
  save();
  expect(await screen.findByText('Saved on this device')).toBeTruthy();
  expect(diary.saves[0]).toMatchObject({ type: 'transfer', amount_minor: '10000', source_wallet_id: daily.id, destination_wallet_id: cash.id });
  expect(fake.callsOf('createTransfer')).toHaveLength(0);
});

test('an unconfirmed online save stays online when the diary opens: Try again resends the same command', async () => {
  const diary = createFakeDiary({ phase: 'opening' });
  const fake = await open({ diary: diary.diary, before: (f) => f.loseResponse('createTransaction') });
  typeAmount('65');
  save();
  const again = await screen.findByRole('button', { name: 'Try again' });
  act(() => diary.set({ phase: 'ready', wallets: seed.wallets, categories: BUILTINS }));
  fireEvent.click(again);
  expect(await screen.findByText('Saved')).toBeTruthy();
  expect(diary.saves).toHaveLength(0);
  const keys = createCalls(fake).map(([, key]) => key);
  expect(keys).toHaveLength(2);
  expect(keys[1]).toBe(keys[0]);
  expect(fake.records.size).toBe(seed.records.length + 1);
});

test('a device save that fails says why, and every attempt of one draft keeps its record id and command id', async () => {
  const diary = recordingDiary();
  await open({ diary: diary.diary });
  diary.failNextSave(new DiaryLocked('locked'));
  typeAmount('65');
  save();
  expect(await screen.findByText("This device's diary is locked. Nothing was saved.")).toBeTruthy();
  diary.failNextSave(new DraftReferenceUnavailable('wallet'));
  save();
  expect(await screen.findByText("This wallet or category isn't on this device yet. Connect and try again. Nothing was saved.")).toBeTruthy();
  save();
  expect(await screen.findByText('Saved on this device')).toBeTruthy();
  expect(diary.attempts).toHaveLength(3);
  const [first, ...rest] = diary.attempts;
  expect(first.commandId).toMatch(UUID);
  for (const attempt of rest) {
    expect(attempt.commandId).toBe(first.commandId);
    expect(attempt.entry).toEqual(first.entry);
  }
});

test('an acknowledgement that arrives garbled is unconfirmed, and retrying the same command finishes', async () => {
  const fake = await open({ before: (f) => f.loseResponse('createTransaction', 'invalid_response') });
  typeAmount('65');
  save();
  expect(await screen.findByText('Not confirmed yet. Your entry is kept; try again.')).toBeTruthy();
  expect(disabled(within(keypad()).getByRole('button', { name: '1' }))).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Saved')).toBeTruthy();
  const [first, second] = createCalls(fake);
  expect(second).toEqual(first);
  expect(fake.records.size).toBe(5);
});

test('a lost response after the save committed resolves by replay, with no duplicate', async () => {
  const fake = await open({ before: (f) => f.loseResponse('createTransaction') });
  typeAmount('65');
  save();
  fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Saved')).toBeTruthy();
  expect(fake.records.size).toBe(5);
});

test('if this entry already exists under an earlier command, it counts as saved (isOwnCreate)', async () => {
  const fake = await open();
  fake.fail('createTransaction', 'invalid', { status: 422, code: 'DATE_BEFORE_TRACKING_START', fields: { occurred_on: 'x' } });
  typeAmount('65');
  save();
  await screen.findByText('This date is before the wallet started tracking.');
  // An earlier attempt of this same entry had in fact committed.
  const [[input]] = createCalls(fake);
  fake.records.set(input.id as string, { ...input, deleted_at: null, version: 1 } as TransactionDto);
  save();
  expect(await screen.findByText('Saved')).toBeTruthy();
  expect(screen.queryByText('This entry could not be saved.')).toBeNull();
  // The same record was named again, so nothing was saved twice.
  expect(createCalls(fake)[1][0].id).toBe(input.id);
  expect(fake.records.size).toBe(seed.records.length + 1);
});

// Review B1 (probe QA-1): an unconfirmed save may have committed. A retry refused
// before the server processes it (signed out, terms, an update, a changed
// session) says nothing about the first attempt, so the entry stays frozen with
// its key until that command's outcome is known.
test('an unconfirmed save stays frozen with its key when the retry is refused before processing; the saved moment shows what the server holds', async () => {
  const fake = await open({ before: (f) => f.loseResponse('createTransaction') });
  typeAmount('65');
  save();
  fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
  fake.fail('createTransaction', 'signed_out', { status: 401 });
  expect(await screen.findByText('Sign in again to save.')).toBeTruthy();
  // Still frozen: the keypad, the type and the wallet cannot change, and Try again is the only action.
  expect(disabled(within(keypad()).getByRole('button', { name: '5' }))).toBe(true);
  expect(disabled(screen.getByRole('button', { name: 'Wallet: Cash' }))).toBe(true);
  expect(screen.queryByRole('button', { name: 'Save entry' })).toBeNull();
  press('5');
  expect(screen.getByLabelText('Expense ฿65.00')).toBeTruthy();
  // Signed in again, Try again resends the very same command, and Jotbun's copy is what is shown.
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Saved')).toBeTruthy();
  expect(screen.getByTestId('quick-add-saved').textContent).toContain('฿65.00');
  const calls = createCalls(fake);
  expect(calls.length).toBeGreaterThanOrEqual(3);
  for (const call of calls) expect(call).toEqual(calls[0]);
  expect(fake.records.get(calls[0][0].id as string)?.amount_minor).toBe('6500');
});

test.each([
  ['policy_required', 403, 'Review and accept the updated terms to continue.'],
  ['session_changed', 401, 'Your session changed. Sign in again to save.'],
  ['upgrade_required', 426, 'Update Jotbun to keep saving. Your entry is kept.'],
] as const)('an unconfirmed save refused as %s on retry stays frozen with its key', async (outcome, status, message) => {
  const fake = await open({ before: (f) => f.loseResponse('createTransaction') });
  typeAmount('65');
  save();
  fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
  fake.fail('createTransaction', outcome, { status });
  expect(await screen.findByText(message)).toBeTruthy();
  expect(disabled(within(keypad()).getByRole('button', { name: '5' }))).toBe(true);
  expect(screen.queryByRole('button', { name: 'Save entry' })).toBeNull();
  const [first, second] = createCalls(fake);
  expect(second).toEqual(first);
});

test('a create that meets this draft\'s own record with other details is never shown as saved', async () => {
  const fake = await open();
  fake.fail('createTransaction', 'invalid', { status: 422, code: 'DATE_BEFORE_TRACKING_START', fields: { occurred_on: 'x' } });
  typeAmount('65');
  save();
  await screen.findByText('This date is before the wallet started tracking.');
  // Jotbun already holds this record id, but with another amount.
  const [[input]] = createCalls(fake);
  fake.records.set(input.id as string, { ...input, amount_minor: '6000', deleted_at: null, version: 1 } as TransactionDto);
  save();
  const alert = await screen.findByText('This entry is already saved in Jotbun as ฿60.00. Check it in History.');
  expect(alert).toBeTruthy();
  expect(screen.queryByText('Saved')).toBeNull();
  expect(screen.queryByTestId('quick-add-saved')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Save entry' })).toBeNull();
  expect(fake.records.get(input.id as string)?.amount_minor).toBe('6000');
});

test('a create refused because another record has the id is not mistaken for this one', async () => {
  const fake = await open();
  fake.fail('createTransaction', 'conflict', { status: 409, code: 'VERSION_CONFLICT', current: { id: RENT } });
  typeAmount('65');
  save();
  expect(await screen.findByText('This entry could not be saved.')).toBeTruthy();
  expect(screen.queryByText('Saved')).toBeNull();
});

test('note and merchant sit behind More details and are normalized the way the API does', async () => {
  const fake = await open();
  expect(screen.queryByLabelText('Note')).toBeNull();
  const toggle = screen.getByRole('button', { name: 'More details' });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  typeAmount('65');
  fireEvent.change(screen.getByLabelText('Merchant'), { target: { value: '  Café Amazon  ' } });
  fireEvent.change(screen.getByLabelText('Note'), { target: { value: '  iced latte  ' } });
  save();
  expect(await screen.findByText('Saved')).toBeTruthy();
  expect(createCalls(fake)[0][0]).toMatchObject({ merchant: 'Café Amazon', note: 'iced latte' });
});

test('a merchant over 120 characters is refused once, and a note problem reopens More details', async () => {
  const fake = await open();
  fireEvent.click(screen.getByRole('button', { name: 'More details' }));
  typeAmount('65');
  // A single-line input drops line breaks on the web, so the length rule is the one driven here.
  fireEvent.change(screen.getByLabelText('Merchant'), { target: { value: 'm'.repeat(121) } });
  fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'x'.repeat(501) } });
  fireEvent.click(screen.getByRole('button', { name: 'More details' }));
  expect(screen.queryByLabelText('Note')).toBeNull();
  save();
  expect(await screen.findByLabelText('Note')).toBeTruthy();
  expect(screen.getAllByText('Use one line of up to 120 characters.')).toHaveLength(1);
  expect(screen.getAllByText('Notes are up to 500 characters.')).toHaveLength(1);
  expect(fake.callsOf('createTransaction')).toHaveLength(0);
});

test("a date before the chosen wallet's tracking start is refused before anything is sent", async () => {
  const late: WalletSnapshot = { ...daily, tracking_start: TODAY };
  const fake = await open({ seed: { wallets: [cash, late], records: seed.records } });
  typeAmount('65');
  fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
  fireEvent.click(screen.getByRole('button', { name: 'Wallet: Cash' }));
  fireEvent.click(within(await screen.findByRole('dialog', { name: 'Wallet' })).getByRole('radio', { name: /^Daily account/ }));
  save();
  expect(await screen.findByText('This date is before the wallet started tracking.')).toBeTruthy();
  expect(fake.callsOf('createTransaction')).toHaveLength(0);
  // The chip never steps below the wallet's start.
  fireEvent.click(screen.getByRole('button', { name: 'Next day' }));
  expect(disabled(screen.getByRole('button', { name: 'Previous day' }))).toBe(true);
});

// ---------------------------------------------------------------------------
// New behaviour

test.each([
  ['12.50 + 7.25', ['1', '2', '.', '5', '0', '+', '7', '.', '2', '5'], '1975'],
  ['10 ÷ 3', ['1', '0', '/', '3'], '333'],
  ['10 ÷ 3 × 3', ['1', '0', '/', '3', '*', '3'], '1000'],
  ['65 + (dangling)', ['6', '5', '+'], '6500'],
  ['1 then 000', ['1', '000'], '100000'],
  ['0.1 + 0.2', ['0', '.', '1', '+', '0', '.', '2'], '30'],
])('keypad maths reaches the save input exactly: %s', async (_name, keys, minor) => {
  const fake = await open();
  press(...keys);
  save();
  expect(await screen.findByText('Saved')).toBeTruthy();
  expect(createCalls(fake)[0][0].amount_minor).toBe(minor);
});

test('the amount is live and spoken while a sum is typed', async () => {
  await open();
  // Even empty, the amount says what it is (Apple's accessibility audit, R8).
  expect(screen.getByLabelText('Expense ฿0.00').textContent).toBe('฿0.00');
  choose('Income');
  expect(screen.getByLabelText('Income ฿0.00').textContent).toBe('฿0.00');
  choose('Expense');
  press('1', '2', '.', '5', '0', '+', '7', '.', '2', '5');
  expect(screen.getByText('12.50 + 7.25')).toBeTruthy();
  expect(screen.getByLabelText('Expense ฿19.75')).toBeTruthy();
  choose('Income');
  expect(screen.getByLabelText('Income ฿19.75')).toBeTruthy();
  press('C', '5', '-', '1', '0', '=');
  expect(await screen.findByText("The sum can't go below zero.")).toBeTruthy();
});

const coffee: CategoryDto = { id: '0000000c-0000-4000-8000-0000000000a1', type: 'expense', builtin_key: null, label: 'Coffee', color: null, archived: false, version: 1 };
const pets: CategoryDto = { ...coffee, id: '0000000c-0000-4000-8000-0000000000a2', label: 'Pets' };
const gym: CategoryDto = { ...coffee, id: '0000000c-0000-4000-8000-0000000000a3', label: 'Gym' };
const shut: CategoryDto = { ...coffee, id: '0000000c-0000-4000-8000-0000000000a4', label: 'Closed one', archived: true };
let recordNumber = 100;
const used = (category: CategoryDto, occurred_on: string, deleted = false): TransactionDto => {
  recordNumber += 1;
  return { id: `0000000b-0000-4000-8000-000000000${recordNumber}`, type: 'expense', amount_minor: '100', occurred_on, wallet_id: cash.id, category_id: category.id, note: null, merchant: null, deleted_at: deleted ? '2026-09-29T00:00:00.000Z' : null, version: 1 } as TransactionDto;
};
const rankedSeed = () => ({
  wallets: seed.wallets,
  records: [
    ...seed.records,
    used(coffee, '2026-09-29'), used(coffee, '2026-09-28'), used(coffee, '2026-09-20'),
    used(pets, '2026-09-29'),
    used(travel, '2026-08-01'), used(travel, '2026-08-02'),
    used(gym, '2026-09-29', true), used(gym, '2026-09-29', true), used(gym, '2026-09-29', true),
    used(shut, '2026-09-29'),
  ],
});
const withCustom = (fake: Fake): SpendV1Resources => ({
  ...fake.resources,
  ensureBuiltinCategories: async () => [...(await fake.resources.ensureBuiltinCategories()), coffee, pets, gym, shut],
});

test('category chips are the top three by recent use, the first chosen, and deleted or archived ones never count', async () => {
  await open({ seed: rankedSeed(), wrap: withCustom });
  // Coffee 60 + 59 + 51, Pets 60, Bills 58, Food 57, Travel 1 + 2, Gym only deleted.
  expect(chipNames()).toEqual(['Coffee', 'Pets', 'Bills']);
  expect(screen.getByRole('radio', { name: 'Coffee' }).getAttribute('aria-checked')).toBe('true');
  choose('Income');
  expect(chipNames()).toEqual(['Salary', 'Gift']);
  expect(screen.getByRole('radio', { name: 'Salary' }).getAttribute('aria-checked')).toBe('true');
});

test('the order may follow the recent-use load until the first touch, and never moves after it', async () => {
  const late = createFakeResources(goldenSeed());
  const releaseLate = late.hold('history');
  mount(<QuickAddScreen now={NOW} />, late.resources);
  await screen.findByRole('group', { name: 'Keypad' });
  // The form never waits for recent use: built-in order first.
  expect(chipNames()).toEqual(['Food', 'Travel', 'Bills']);
  releaseLate();
  await waitFor(() => expect(chipNames()).toEqual(['Bills', 'Food', 'Travel']));
  expect(screen.getByRole('radio', { name: 'Bills' }).getAttribute('aria-checked')).toBe('true');
  cleanup();

  const touched = createFakeResources(goldenSeed());
  const releaseTouched = touched.hold('history');
  mount(<QuickAddScreen now={NOW} />, touched.resources);
  await screen.findByRole('group', { name: 'Keypad' });
  press('6', '5');
  releaseTouched();
  await settle();
  expect(chipNames()).toEqual(['Food', 'Travel', 'Bills']);
  expect(screen.getByRole('radio', { name: 'Food' }).getAttribute('aria-checked')).toBe('true');
  save();
  expect(await screen.findByText('Saved')).toBeTruthy();
  expect(createCalls(touched)[0][0].category_id).toBe(food.id);
});

test("drafts waiting on the device count toward the ranking", async () => {
  const draft = (id: string): PendingEntry => ({ id, type: 'expense', amount_minor: '100', occurred_on: TODAY, wallet_id: cash.id, category_id: gym.id, note: null, merchant: null });
  const diary = createFakeDiary({ pending: [draft(crypto.randomUUID()), draft(crypto.randomUUID())] });
  await open({ seed: rankedSeed(), wrap: withCustom, diary: diary.diary });
  expect(chipNames()).toEqual(['Coffee', 'Gym', 'Pets']);
});

test('More opens every category in a sheet; a pick closes it and stays in view', async () => {
  const fake = await open({ seed: rankedSeed(), wrap: withCustom });
  fireEvent.click(screen.getByRole('button', { name: 'More categories' }));
  const sheet = await screen.findByRole('dialog', { name: 'Choose a category' });
  const grid = within(sheet).getByRole('radiogroup', { name: 'Categories' });
  expect(within(grid).getAllByRole('radio').map((radio) => radio.getAttribute('aria-label')).sort()).toEqual(['Bills', 'Coffee', 'Food', 'Gym', 'Pets', 'Travel']);
  fireEvent.click(within(grid).getByRole('radio', { name: 'Travel' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Choose a category' })).toBeNull());
  expect(chipNames()).toEqual(['Coffee', 'Pets', 'Travel']);
  expect(screen.getByRole('radio', { name: 'Travel' }).getAttribute('aria-checked')).toBe('true');
  typeAmount('40');
  save();
  expect(await screen.findByText('Saved')).toBeTruthy();
  expect(createCalls(fake)[0][0].category_id).toBe(travel.id);
});

test('Copy (copyOf) prefills a new draft from the record, dated today, with a new id', async () => {
  search.params = { copyOf: RENT };
  const fake = await open();
  expect(fake.callsOf('transaction')[0].args).toEqual([RENT]);
  expect(screen.getByLabelText('Expense ฿12,268.00')).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'Bills' }).getAttribute('aria-checked')).toBe('true');
  expect(screen.getByRole('button', { name: 'Wallet: Daily account' })).toBeTruthy();
  expect(screen.getByRole('button', { name: /^Pick another date, .*29 September 2026$/ })).toBeTruthy();
  expect((screen.getByLabelText('Note') as HTMLInputElement).value).toBe('Rent');
  save();
  expect(await screen.findByText('Saved')).toBeTruthy();
  const [[input, key]] = createCalls(fake);
  expect(input).toEqual({ id: expect.stringMatching(UUID), type: 'expense', amount_minor: '1226800', occurred_on: TODAY, wallet_id: daily.id, category_id: bills.id, note: 'Rent', merchant: null });
  expect(input.id).not.toBe(RENT);
  expect(key).not.toBe(input.id);
});

test('Copy of a move prefills From → To and the amount', async () => {
  search.params = { copyOf: MOVE };
  const fake = await open();
  expect(screen.getByRole('radio', { name: 'Move' }).getAttribute('aria-checked')).toBe('true');
  expect(screen.getByRole('button', { name: `From Cash, balance ${CASH_BALANCE}` })).toBeTruthy();
  expect(screen.getByRole('button', { name: `To Daily account, balance ${DAILY_BALANCE}` })).toBeTruthy();
  save();
  expect(await screen.findByText('Saved')).toBeTruthy();
  expect(transferCalls(fake)[0][0]).toEqual({ id: expect.stringMatching(UUID), amount_minor: '150000', occurred_on: TODAY, note: null, merchant: null, source_wallet_id: cash.id, destination_wallet_id: daily.id });
});

test('Copy of a draft still on the device works from the device', async () => {
  const pendingId = crypto.randomUUID();
  const diary = createFakeDiary({ pending: [{ id: pendingId, type: 'income', amount_minor: '4200', occurred_on: '2026-09-20', wallet_id: cash.id, category_id: salary.id, note: null, merchant: 'Shop' }] });
  search.params = { copyOf: pendingId };
  await open({ diary: diary.diary });
  expect(screen.getByLabelText('Income ฿42.00')).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'Salary' }).getAttribute('aria-checked')).toBe('true');
  expect((screen.getByLabelText('Merchant') as HTMLInputElement).value).toBe('Shop');
  save();
  expect(await screen.findByText('Saved on this device')).toBeTruthy();
  expect(diary.saves[0]).toMatchObject({ type: 'income', amount_minor: '4200', occurred_on: TODAY, merchant: 'Shop' });
  expect(diary.saves[0].id).not.toBe(pendingId);
});

test('a copied record whose wallet is closed asks for a wallet instead of guessing one', async () => {
  const closed: WalletSnapshot = { ...cash, id: '0000000a-0000-4000-8000-000000000009', name: 'Old purse', archived: true };
  const old = { ...seed.records[1], id: '0000000b-0000-4000-8000-000000000099', wallet_id: closed.id } as TransactionDto;
  search.params = { copyOf: old.id };
  const fake = await open({ seed: { wallets: [...seed.wallets, closed], records: [...seed.records, old] } });
  expect(screen.getByRole('button', { name: 'Choose a wallet' })).toBeTruthy();
  save();
  await waitFor(() => expect(screen.getAllByRole('alert').some((node) => node.textContent === 'Choose a wallet')).toBe(true));
  expect(fake.callsOf('createTransaction')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Choose a wallet' }));
  fireEvent.click(within(await screen.findByRole('dialog', { name: 'Wallet' })).getByRole('radio', { name: /^Cash/ }));
  save();
  expect(await screen.findByText('Saved')).toBeTruthy();
  expect(createCalls(fake)[0][0]).toMatchObject({ wallet_id: cash.id, amount_minor: '18200', category_id: food.id });
});

test('a record that cannot be copied says so and offers a blank entry', async () => {
  search.params = { copyOf: '0000000b-0000-4000-8000-0000000000ff' };
  const fake = createFakeResources(goldenSeed());
  mount(<QuickAddScreen now={NOW} />, fake.resources);
  expect(await screen.findByText("This entry isn't available to copy.")).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Start a new entry' }));
  expect(await screen.findByLabelText('Expense ฿0.00')).toBeTruthy();
});

// Review nit: a deleted record is not offered for copying through the URL.
test('a deleted record cannot be copied through the URL', async () => {
  search.params = { copyOf: RENT };
  const fake = createFakeResources(goldenSeed());
  const rent = fake.records.get(RENT) as TransactionDto;
  fake.records.set(RENT, { ...rent, deleted_at: '2026-09-28T00:00:00.000Z', version: 2 });
  mount(<QuickAddScreen now={NOW} />, fake.resources);
  expect(await screen.findByText("This entry isn't available to copy.")).toBeTruthy();
  expect(screen.queryByLabelText('Expense ฿12,268.00')).toBeNull();
});

// Review m6: the amount is a polite live region, so each key's result is read.
test('the amount line is a polite live region that says the live result', async () => {
  await open();
  typeAmount('12');
  const live = screen.getByLabelText('Expense ฿12.00').closest('[aria-live="polite"]');
  expect(live).not.toBeNull();
  press('+', '3');
  expect(within(live as HTMLElement).getByLabelText('Expense ฿15.00')).toBeTruthy();
});

// Review m8: move all never offers money that waiting drafts on this device already spent.
test('move all is the balance less what drafts waiting on this device take from the wallet', async () => {
  const waiting = { id: crypto.randomUUID(), type: 'expense', amount_minor: '50000', occurred_on: TODAY, wallet_id: daily.id, category_id: food.id, note: null, merchant: null } as PendingEntry;
  const incoming = { id: crypto.randomUUID(), amount_minor: '10000', occurred_on: TODAY, source_wallet_id: cash.id, destination_wallet_id: daily.id, note: null, merchant: null, type: 'transfer' } as PendingEntry;
  // Being checked (sending or uncertain): Jotbun may count it already, so it is not taken off again.
  const checking = { id: crypto.randomUUID(), type: 'expense', amount_minor: '70000', occurred_on: TODAY, wallet_id: daily.id, category_id: food.id, note: null, merchant: null } as PendingEntry;
  const sent = { id: crypto.randomUUID(), type: 'expense', amount_minor: '30000', occurred_on: TODAY, wallet_id: daily.id, category_id: food.id, note: null, merchant: null } as PendingEntry;
  const command = (payload: PendingEntry, state: OutboxCommand['state']): OutboxCommand => ({
    commandId: crypto.randomUUID(), accountId: 'a0000000-0000-4000-8000-000000000001', schemaVersion: 1, kind: 'transaction.create', payload, state,
    firstTransmissionAt: state === 'unsent' ? null : '2026-09-29T03:00:00.000Z', createdAt: '2026-09-29T03:00:00.000Z', ackedRevision: null,
  });
  const diary = createFakeDiary({ wallets: seed.wallets, categories: BUILTINS, outbox: [command(waiting, 'unsent'), command(incoming, 'unsent'), command(checking, 'uncertain'), command(sent, 'sending')] });
  await open({ diary: diary.diary });
  choose('Move');
  fireEvent.click(screen.getByRole('button', { name: 'Swap wallets' }));
  // Daily: ฿18,700.00 − ฿500.00 waiting to be spent + ฿100.00 waiting to arrive.
  fireEvent.click(screen.getByRole('button', { name: 'Move all ฿18,300.00' }));
  expect(screen.getByLabelText('Transfer ฿18,300.00')).toBeTruthy();
});

test('Add another starts a fresh draft with a new record id and a new command id, keeping the choices', async () => {
  const diary = recordingDiary();
  await open({ diary: diary.diary });
  typeAmount('65');
  choose('Food');
  fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
  save();
  expect(await screen.findByText('Saved on this device')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Add another' }));
  expect(await screen.findByLabelText('Expense ฿0.00')).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'Food' }).getAttribute('aria-checked')).toBe('true');
  typeAmount('12');
  save();
  expect(await screen.findByText('Saved on this device')).toBeTruthy();
  const [first, second] = diary.attempts;
  expect(second.entry.id).not.toBe(first.entry.id);
  expect(second.commandId).not.toBe(first.commandId);
  expect(second.entry).toMatchObject({ amount_minor: '1200', category_id: food.id, wallet_id: cash.id, occurred_on: '2026-09-28' });
});

test('Add another online uses a new record and a new command key', async () => {
  const fake = await open();
  typeAmount('65');
  save();
  fireEvent.click(await screen.findByRole('button', { name: 'Add another' }));
  typeAmount('7');
  save();
  expect(await screen.findByText('Saved')).toBeTruthy();
  const [first, second] = createCalls(fake);
  expect(second[0].id).not.toBe(first[0].id);
  expect(second[1]).not.toBe(first[1]);
});

test('the saved moment is a polite live region with the exact amount', async () => {
  await open();
  typeAmount('65');
  choose('Food');
  save();
  const moment = await screen.findByTestId('quick-add-saved');
  expect(moment.getAttribute('aria-live')).toBe('polite');
  expect(within(moment).getByText('Saved')).toBeTruthy();
  expect(within(moment).getByLabelText('Expense ฿65.00')).toBeTruthy();
  expect(within(moment).getByText('Food · Cash')).toBeTruthy();
});

test('save problems are announced as alerts', async () => {
  const fake = await open();
  fake.fail('createTransaction', 'network');
  typeAmount('65');
  save();
  await screen.findByText('Not confirmed yet. Your entry is kept; try again.');
  expect(screen.getAllByRole('alert').some((node) => node.textContent?.includes('Not confirmed yet'))).toBe(true);
});

test('the cheer bun shows at most once a day, and only at full intensity', async () => {
  await open();
  typeAmount('65');
  save();
  expect((await screen.findByTestId('quick-add-saved')).querySelector('svg')).not.toBeNull();
  expect(window.localStorage.getItem(QUICK_ADD_CHEER_KEY)).toBe(TODAY);
  fireEvent.click(screen.getByRole('button', { name: 'Add another' }));
  typeAmount('7');
  save();
  expect((await screen.findByTestId('quick-add-saved')).querySelector('svg')).toBeNull();
  cleanup();
  // A new Quick add the same day: still no second cheer.
  await open();
  typeAmount('8');
  save();
  expect((await screen.findByTestId('quick-add-saved')).querySelector('svg')).toBeNull();
});

test.each(['quiet', 'off'] as const)('at %s intensity the saved moment has no bun', async (intensity) => {
  await open({ intensity });
  typeAmount('65');
  save();
  expect((await screen.findByTestId('quick-add-saved')).querySelector('svg')).toBeNull();
});

test('loading, then the form', async () => {
  const fake = createFakeResources(goldenSeed());
  const release = fake.hold('wallets');
  mount(<QuickAddScreen now={NOW} />, fake.resources);
  expect(await screen.findByLabelText('Loading your wallets')).toBeTruthy();
  expect(screen.queryByRole('group', { name: 'Keypad' })).toBeNull();
  release();
  expect(await screen.findByRole('group', { name: 'Keypad' })).toBeTruthy();
});

test('a load problem that a retry can fix offers Try again', async () => {
  const fake = createFakeResources(goldenSeed());
  fake.fail('wallets', 'network');
  mount(<QuickAddScreen now={NOW} />, fake.resources);
  expect(await screen.findByText("We couldn't load your diary.")).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('group', { name: 'Keypad' })).toBeTruthy();
});

test.each([
  ['upgrade_required', 'Update Jotbun to keep using your diary. Nothing you saved is lost.'],
  ['signed_out', 'Sign in again to see your diary.'],
  ['policy_required', 'Review and accept the updated terms to continue.'],
] as const)('a %s load is blocked: it says what to do and offers no retry', async (outcome, message) => {
  const fake = createFakeResources(goldenSeed());
  fake.fail('wallets', outcome);
  mount(<QuickAddScreen now={NOW} />, fake.resources);
  expect(await screen.findByText(message)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Home' }));
  expect(router.replace).toHaveBeenCalledWith('/spend');
});

test('with no wallet it says to add one on the home screen, with the bun', async () => {
  const fake = createFakeResources();
  const { container } = mount(<QuickAddScreen now={NOW} />, fake.resources);
  expect(await screen.findByText('Add a wallet on the home screen first.')).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'No wallets yet' })).toBeTruthy();
  expect(container.querySelector('svg')).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Home' }));
  expect(router.replace).toHaveBeenCalledWith('/spend');
});

test.each([['quiet', true], ['off', false]] as const)('the empty state bun at %s intensity: shown %s', async (intensity, shown) => {
  const { container } = mount(<QuickAddScreen now={NOW} />, createFakeResources().resources, { intensity });
  await screen.findByText('Add a wallet on the home screen first.');
  expect(container.querySelector('svg') !== null).toBe(shown);
});

test('Close leaves without saving', async () => {
  const fake = await open();
  typeAmount('65');
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(router.replace).toHaveBeenCalledWith('/spend');
  expect(fake.callsOf('createTransaction')).toHaveLength(0);
});

test('targets are at least 44 points, keypad keys at least 56', async () => {
  await open();
  for (const name of ['Close', 'Wallet: Cash', 'More details', 'Save entry', 'More categories', 'Previous day']) {
    expect(Number.parseFloat(screen.getByRole('button', { name }).style.minHeight), name).toBeGreaterThanOrEqual(44);
  }
  for (const key of within(keypad()).getAllByRole('button')) expect(Number.parseFloat(key.style.minHeight)).toBeGreaterThanOrEqual(56);
});

test('the amount never opens the system keyboard: no text field until More details', async () => {
  const fake = createFakeResources(goldenSeed());
  const { container } = mount(<QuickAddScreen now={NOW} />, fake.resources);
  await screen.findByRole('group', { name: 'Keypad' });
  expect(container.querySelectorAll('input, textarea, [contenteditable]')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'More details' }));
  expect([...container.querySelectorAll('input, textarea')].map((node) => node.getAttribute('aria-label'))).toEqual(['Merchant', 'Note']);
});

test('the screen draws with palette tokens only, and keeps money out of floating point', () => {
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'QuickAddScreen.tsx'), 'utf8');
  expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  expect(source).not.toMatch(/rgba?\(/);
  expect(source).not.toMatch(/parseFloat|parseInt|toFixed|Number\(|Math\.|keyboardType/);
  expect(source).toMatch(/useBunColors\(\)/);
});

const MATRIX = (['en', 'th', 'vi'] as const).flatMap((locale) => ([['light', bunLight], ['dark', bunDark]] as const).map(([mode, colors]) => ({ locale, mode, colors })));

test.each(MATRIX)('speaks $locale in $mode, in palette colours', async ({ locale, mode, colors }) => {
  const say = (english: string) => translateCopy(english, locale as Locale);
  await open({ locale, mode });
  const page = screen.getByTestId('quick-add-screen');
  expect(page.style.backgroundColor).toEqual(rgb(colors.background));
  // The title is a heading for screen readers only; the form opens on the type switch.
  expect(screen.getByRole('heading', { name: say('Add an entry') })).toBeTruthy();
  const close = screen.getByRole('button', { name: say('Close') });
  expect(close.style.borderColor).toEqual(rgb(colors.ink));
  expect(screen.getByRole('radio', { name: say('Expense') }).getAttribute('aria-checked')).toBe('true');
  expect(screen.getByRole('radio', { name: say('Income') })).toBeTruthy();
  const saveButton = screen.getByRole('button', { name: say('Save entry') });
  expect(saveButton.style.backgroundColor).toEqual(rgb(colors.ink));
  press('6', '5');
  fireEvent.click(saveButton);
  const moment = await screen.findByTestId('quick-add-saved');
  expect(moment.style.backgroundColor).toEqual(rgb(colors.stage));
  const heading = within(moment).getByText(say('Saved'));
  expect(heading.style.color).toEqual(rgb(colors.ink));
  expect(within(moment).getByRole('button', { name: say('Add another') })).toBeTruthy();
});

test('Thai: the screen speaks Thai and the amount stays in exact baht', async () => {
  await open({ locale: 'th' });
  expect(screen.getByRole('button', { name: 'บันทึกรายการ' })).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'รายจ่าย' })).toBeTruthy();
  press('1', '2', '3', '4', '.', '5');
  expect(screen.getByLabelText(translateCopy('Expense {amount}', 'th', { amount: '฿1,234.50' }))).toBeTruthy();
});

test('the route opens Quick add unless the core redesign is switched off', async () => {
  const fake = createFakeResources(goldenSeed());
  shared.resources = fake.resources;
  for (const flag of ['core', '']) {
    vi.stubEnv('EXPO_PUBLIC_REDESIGN', flag);
    mount(<SpendAddRoute />, fake.resources);
    expect(await screen.findByRole('group', { name: 'Keypad' })).toBeTruthy();
    cleanup();
  }
  vi.stubEnv('EXPO_PUBLIC_REDESIGN', 'off');
  mount(<SpendAddRoute />, fake.resources);
  expect(await screen.findByRole('textbox', { name: 'Amount' })).toBeTruthy();
  expect(screen.queryByRole('group', { name: 'Keypad' })).toBeNull();
});

// E2 (19 October 2026): on a 402 × 874 pt phone the keypad pushed Save and any
// save problem below the fold. They now sit in a footer pinned under the
// scrolling form, and the form opens on the type switch with Close beside it
// (plan §6.1 has no title row); the title stays a heading for screen readers.
test('Save and any save problem are pinned under the scrolling form, within thumb reach', async () => {
  const fake = await open();
  const scroll = screen.getByTestId('quick-add-scroll');
  const footer = screen.getByTestId('quick-add-footer');
  expect(within(footer).getByRole('button', { name: 'Save entry' })).toBeTruthy();
  expect(within(scroll).queryByRole('button', { name: 'Save entry' })).toBeNull();
  expect(within(scroll).getByRole('group', { name: 'Keypad' })).toBeTruthy();
  expect(scroll.contains(footer)).toBe(false);
  expect(scroll.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fake.fail('createTransaction', 'network');
  typeAmount('65');
  save();
  const message = await within(footer).findByText('Not confirmed yet. Your entry is kept; try again.');
  expect(within(footer).getByRole('button', { name: 'Try again' })).toBeTruthy();
  // Said the way Record says it: a bold alert.
  expect(message.style.fontWeight).toBe('700');
});

test('the form opens on the type switch with Close beside it; the title is a heading for screen readers only', async () => {
  await open();
  expect(screen.getByRole('heading', { name: 'Add an entry' })).toBeTruthy();
  expect(screen.queryByText('Add an entry')).toBeNull();
  const top = screen.getByTestId('quick-add-top');
  expect(within(top).getByRole('radiogroup', { name: 'Record type' })).toBeTruthy();
  expect(within(top).getByRole('button', { name: 'Close' })).toBeTruthy();
});
