// R4 Planning: the Wallets screen (plan §6.2), every state on the in-memory
// fakes. The list (exact total, a card per wallet, the dashed Add tile, the
// collapsed Archived section with Unarchive), create with a live preview on
// the keypad, edit (rename, corrections with their reason), archive (only at
// ฿0.00, otherwise said in words; a confirm sheet), and the command states:
// saving, unconfirmed (frozen; Try again resends the same command and key),
// changed elsewhere, refused, and a field problem from Jotbun. Then TH, EN
// and VI in light and dark, targets, labels, the bun and reduced motion, and
// the catalogue's wallet sections.
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Animated } from 'react-native';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

// The catalogue's stand-ins: a recorded router (with expo-router's params context) and a safe area with a phone's insets.
vi.mock('expo-router', () => import('../../../dev/catalogue/routerTestStub'));
vi.mock('expo-router/build/Route', () => import('../../../dev/catalogue/routerTestStub'));
vi.mock('react-native-safe-area-context', () => import('../../../dev/catalogue/safeAreaTestStub'));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));
const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock('@mobile/hooks/useReducedMotion', () => ({ useReducedMotion: () => motion.reduced }));

import type { CreateWalletRequest, TransactionDto, WalletSnapshot } from '@gogospend/contracts';
import { V1Error } from '@mobile/api/client';
import { mountInApp } from '@mobile/dev/catalogue/catalogueTestHarness';
import { router } from '@mobile/dev/catalogue/routerTestStub';
import { WALLET_SECTIONS } from '@mobile/dev/catalogue/planning/walletSections';
import type { Locale } from '@mobile/i18n/locales';
import { translateCopy } from '@mobile/i18n/messages';
import type { BunIntensity } from '@mobile/mascot/bunIntensity';
import { BUN_INTENSITY_STORAGE_KEY } from '@mobile/mascot/bunIntensityStorage';
import { installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import type { SpendV1Resources } from '@mobile/spend/v1/resources';
import type { SpendDiary } from '@mobile/spend/v1/spendDiary';
import { createFakeDiary } from '@mobile/spend/v1/testing/fakeDiary';
import { BUILTINS, createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
import { BUN_TEXT_PAIRS, bunLight } from '@mobile/theme/bunPalette';
import type { BunColors } from '@mobile/theme/bunPalette';
import { contrastRatio } from '@mobile/theme/contrast';
import { fullDateLabel } from '@mobile/ui/dateStep';
import { MATRIX, NOW, hiddenFromScreenReaders, leading, mountScreen, rgb } from '../HistoryTestHarness';
import { WalletsScreen } from './WalletsScreen';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TODAY = '2026-09-29';
const NOT_CONFIRMED = 'Not confirmed yet. Your entry is kept; try again.';
const CHANGED = 'This wallet changed on another device.';
const golden = goldenSeed();
const [CASH, DAILY] = golden.wallets as [WalletSnapshot, WalletSnapshot];
// Golden balances: Cash 4,032 − 182 − 1,500; Daily 1,468 + 28,000 − 12,268 + 1,500.
const CASH_CARD = 'Cash, balance ฿2,350.00';
const DAILY_CARD = 'Daily account, balance ฿18,700.00';
/** A wallet at exactly ฿0.00 with no entries: the one that can be archived. */
const OLD: WalletSnapshot = { id: '0000000a-0000-4000-8000-000000000003', name: 'Old card', currency: 'THB', opening_minor: '0', tracking_start: '2026-09-01', archived: false, version: 1 };
const OLD_CARD = 'Old card, balance ฿0.00';
const SHUT: WalletSnapshot = { ...OLD, id: '0000000a-0000-4000-8000-000000000004', name: 'Travel card', archived: true, version: 2 };

beforeAll(() => { installBrowserStorage(); });
beforeEach(() => {
  for (const fn of [router.push, router.replace, router.back, router.navigate]) fn.mockReset();
  router.canGoBack.mockReset();
  router.canGoBack.mockReturnValue(true);
  motion.reduced = false;
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

type Fake = ReturnType<typeof createFakeResources>;
type Options = { locale?: Locale; mode?: 'light' | 'dark'; diary?: SpendDiary | null; intensity?: BunIntensity; resources?: SpendV1Resources };

const fakeWith = (...wallets: WalletSnapshot[]): Fake => createFakeResources({ wallets: [...goldenSeed().wallets, ...wallets], records: goldenSeed().records });
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

function mount(fake: Fake, options: Options = {}) {
  if (options.intensity) window.localStorage.setItem(BUN_INTENSITY_STORAGE_KEY, options.intensity);
  return mountScreen(<WalletsScreen now={NOW} />, { resources: options.resources ?? fake.resources, diary: options.diary ?? null, locale: options.locale, mode: options.mode });
}
async function openList(fake: Fake = createFakeResources(goldenSeed()), options: Options = {}): Promise<Fake> {
  mount(fake, options);
  await screen.findByRole('button', { name: translateCopy('Add a wallet', options.locale ?? 'en') });
  await settle();
  return fake;
}
async function openCreate(fake: Fake = createFakeResources(goldenSeed())): Promise<Fake> {
  await openList(fake);
  fireEvent.click(screen.getByRole('button', { name: 'Add a wallet' }));
  await screen.findByRole('heading', { name: 'Add a wallet' });
  return fake;
}
async function openEdit(fake: Fake, cardName: string, options: Options = {}): Promise<Fake> {
  await openList(fake, options);
  fireEvent.click(screen.getByRole('button', { name: cardName }));
  await screen.findByRole('heading', { name: 'Edit wallet' });
  // The check for entries in the wallet lands.
  await settle();
  return fake;
}

const keypad = () => screen.getByRole('group', { name: 'Keypad' });
const press = (...keys: string[]) => {
  for (const key of keys) fireEvent.click(within(keypad()).getByRole('button', { name: key }));
};
const typeName = (value: string) => fireEvent.change(screen.getByLabelText('Wallet name'), { target: { value } });
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const footer = () => screen.getByTestId('wallets-footer');
const preview = () => screen.getByTestId('wallet-preview');
const disabled = (element: HTMLElement) => element.getAttribute('aria-disabled') === 'true';
const isLocked = (label: string) => {
  const input = screen.getByLabelText(label) as HTMLInputElement;
  return input.disabled || input.readOnly;
};
const creates = (fake: Fake) => fake.callsOf('createWallet').map((call) => call.args as [CreateWalletRequest, string]);
const updates = (fake: Fake) => fake.callsOf('updateWallet').map((call) => call.args);
/** A ฿50.00 expense in a wallet, as another device would add it. */
const expenseIn = (walletId: string, id = '0000000b-0000-4000-8000-0000000000f1'): TransactionDto =>
  ({ id, type: 'expense', amount_minor: '5000', occurred_on: '2026-09-29', wallet_id: walletId, category_id: BUILTINS[0].id, note: null, merchant: null, deleted_at: null, version: 1 }) as TransactionDto;

// ---------------------------------------------------------------------------
// Loading and load problems

test('loading, then the list', async () => {
  const fake = createFakeResources(goldenSeed());
  const release = fake.hold('wallets');
  mount(fake);
  expect(await screen.findByLabelText('Loading your wallets')).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Wallets' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Add a wallet' })).toBeNull();
  release();
  expect(await screen.findByRole('button', { name: CASH_CARD })).toBeTruthy();
});

test('a load problem a retry can fix names itself and offers Try again', async () => {
  const fake = createFakeResources(goldenSeed());
  fake.fail('wallets', 'network');
  mount(fake);
  const problem = await screen.findByTestId('wallets-problem-load_failed');
  expect(within(problem).getByRole('heading', { name: 'Diary not loaded' })).toBeTruthy();
  expect(within(problem).getByText("We couldn't load your diary.")).toBeTruthy();
  fireEvent.click(within(problem).getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('button', { name: CASH_CARD })).toBeTruthy();
});

test.each([
  ['upgrade_required', 'Update Jotbun', 'Update Jotbun to keep using your diary. Nothing you saved is lost.'],
  ['signed_out', 'Signed out', 'Sign in again to see your diary.'],
  ['policy_required', 'Updated terms', 'Review and accept the updated terms to continue.'],
] as const)('a %s load says what to do and offers no retry', async (outcome, heading, message) => {
  const fake = createFakeResources(goldenSeed());
  fake.fail('wallets', outcome);
  mount(fake);
  expect(await screen.findByRole('heading', { name: heading })).toBeTruthy();
  expect(screen.getByText(message)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
});

test('offline, the wallets synced to this device are still listed by name, with no guessed balance and no changes', async () => {
  const fake = createFakeResources(goldenSeed());
  fake.fail('wallets', 'network');
  const diary = createFakeDiary({ wallets: golden.wallets, categories: BUILTINS });
  mount(fake, { diary: diary.diary });
  const device = await screen.findByTestId('wallets-on-device');
  expect(within(device).getByRole('heading', { name: 'Saved on this device' })).toBeTruthy();
  expect(within(device).getByText('Cash')).toBeTruthy();
  expect(within(device).getByText('Daily account')).toBeTruthy();
  expect(within(device).getByText('Balances and changes need a connection to Jotbun.')).toBeTruthy();
  expect(device.textContent).not.toMatch(/฿/);
  expect(screen.queryByRole('button', { name: 'Add a wallet' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
});

// ---------------------------------------------------------------------------
// The list

test('the list: the exact total on the stage, a card per wallet with its balance, and the dashed Add tile', async () => {
  const fake = await openList();
  expect(fake.callsOf('wallets')).toHaveLength(1);
  const total = screen.getByTestId('wallets-total');
  expect(total.getAttribute('aria-label')).toBe('Total balance ฿21,050.00');
  expect(within(total).getByText('฿21,050.00')).toBeTruthy();
  expect(screen.getByTestId('stage-header').contains(total)).toBe(true);
  const cards = screen.getAllByTestId('wallet-card');
  expect(cards.map((node) => node.getAttribute('aria-label'))).toEqual([CASH_CARD, DAILY_CARD]);
  expect(within(cards[0]).getByText('฿2,350.00')).toBeTruthy();
  expect(within(cards[0]).getByText(`Tracking from ${fullDateLabel('2026-09-01', 'en')}`)).toBeTruthy();
  const tile = screen.getByRole('button', { name: 'Add a wallet' });
  expect(tile.style.borderStyle).toBe('dashed');
  // The plus is decoration beside the words.
  expect(hiddenFromScreenReaders(within(tile).getByText('+'))).toBe(true);
  // No archived wallets, no Archived section.
  expect(screen.queryByTestId('wallets-archived-toggle')).toBeNull();
});

test('a balance below zero is said exactly, with its sign, and counts in the total', async () => {
  const fake = fakeWith({ ...OLD, name: 'Card' });
  fake.records.set('0000000b-0000-4000-8000-0000000000f2', { ...expenseIn(OLD.id, '0000000b-0000-4000-8000-0000000000f2'), amount_minor: '20050' } as TransactionDto);
  await openList(fake);
  expect(screen.getByRole('button', { name: 'Card, balance Minus ฿200.50' })).toBeTruthy();
  expect(screen.getByText('-฿200.50')).toBeTruthy();
  expect(screen.getByTestId('wallets-total').getAttribute('aria-label')).toBe('Total balance ฿20,849.50');
});

test('archived wallets sit in a collapsed Archived section, left out of the total, each with Unarchive', async () => {
  const fake = await openList(fakeWith(SHUT));
  expect(screen.getByTestId('wallets-total').getAttribute('aria-label')).toBe('Total balance ฿21,050.00');
  expect(screen.getAllByTestId('wallet-card')).toHaveLength(2);
  const toggle = screen.getByRole('button', { name: 'Archived wallets (1)' });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByText('Travel card')).toBeNull();
  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  const archived = screen.getByTestId('wallets-archived');
  expect(within(archived).getByText('Travel card')).toBeTruthy();
  // Archived is said in words, not by a muted colour alone.
  expect(within(archived).getByText('Archived')).toBeTruthy();
  // An archived wallet cannot be changed, so it does not open the edit.
  expect(screen.queryByRole('button', { name: 'Travel card, balance ฿0.00' })).toBeNull();

  const release = fake.hold('unarchiveWallet');
  fireEvent.click(within(archived).getByRole('button', { name: 'Unarchive Travel card' }));
  await waitFor(() => expect(within(archived).getByRole('button', { name: 'Unarchive Travel card' }).getAttribute('aria-busy')).toBe('true'));
  release();
  expect(await screen.findByRole('button', { name: 'Travel card, balance ฿0.00' })).toBeTruthy();
  const [[id, version, key]] = fake.callsOf('unarchiveWallet').map((call) => call.args);
  expect([id, version]).toEqual([SHUT.id, 2]);
  expect(key).toMatch(UUID);
  expect(screen.queryByTestId('wallets-archived-toggle')).toBeNull();
});

test('an unconfirmed unarchive is frozen, and Try again resends the same command with the same key', async () => {
  const fake = await openList(fakeWith(SHUT, { ...SHUT, id: '0000000a-0000-4000-8000-000000000005', name: 'Spare' }));
  fake.loseResponse('unarchiveWallet');
  click('Archived wallets (2)');
  click('Unarchive Travel card');
  const archived = screen.getByTestId('wallets-archived');
  expect(await within(archived).findByText(NOT_CONFIRMED)).toBeTruthy();
  expect(within(archived).queryByRole('button', { name: 'Unarchive Travel card' })).toBeNull();
  expect(disabled(within(archived).getByRole('button', { name: 'Unarchive Spare' }))).toBe(true);
  fireEvent.click(within(archived).getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('button', { name: 'Travel card, balance ฿0.00' })).toBeTruthy();
  const [first, second] = fake.callsOf('unarchiveWallet');
  expect(second.args).toEqual(first.args);
});

test('an unarchive that meets a newer version shows theirs, and Reload reads the wallets again', async () => {
  const fake = await openList(fakeWith(SHUT));
  fake.wallets.set(SHUT.id, { ...SHUT, name: 'Trip card', version: 3 });
  click('Archived wallets (1)');
  click('Unarchive Travel card');
  const conflict = await screen.findByTestId('wallet-conflict');
  expect(within(conflict).getByRole('heading', { name: CHANGED })).toBeTruthy();
  expect(within(conflict).getByLabelText('Name. On the server: Trip card.')).toBeTruthy();
  expect(within(conflict).getByLabelText('Status. On the server: Archived.')).toBeTruthy();
  fireEvent.click(within(conflict).getByRole('button', { name: 'Reload' }));
  await waitFor(() => expect(fake.callsOf('wallets')).toHaveLength(2));
  expect(await screen.findByRole('button', { name: 'Archived wallets (1)' })).toBeTruthy();
  expect(screen.queryByTestId('wallet-conflict')).toBeNull();
  expect(fake.callsOf('unarchiveWallet')).toHaveLength(1);
});

test('Back on the stage goes back, or to Home (where Manage wallets opens it) when there is nothing to go back to', async () => {
  await openList();
  click('Back');
  expect(router.back).toHaveBeenCalledTimes(1);
  router.canGoBack.mockReturnValue(false);
  click('Back');
  expect(router.replace).toHaveBeenCalledWith('/spend');
});

// ---------------------------------------------------------------------------
// First run

test('no wallets: the hello bun names the space, and the first wallet form follows with one primary action', async () => {
  const fake = createFakeResources();
  mount(fake);
  expect(await screen.findByRole('heading', { name: 'Add your first wallet' })).toBeTruthy();
  expect(screen.getByText('A wallet is where money sits, like cash or a bank account. Its opening balance is not income.')).toBeTruthy();
  const art = screen.getByTestId('empty-state-art');
  expect(art.querySelector('svg')).not.toBeNull();
  expect(hiddenFromScreenReaders(art)).toBe(true);
  expect(screen.getByTestId('wallet-preview')).toBeTruthy();
  const primaries = screen.getAllByRole('button').filter((button) => hexOf(button.style.backgroundColor) === bunLight.ink.toUpperCase() && !keypad().contains(button));
  expect(primaries.map((button) => button.getAttribute('aria-label') ?? button.textContent)).toEqual(['Create wallet']);

  typeName('Cash');
  press('1', '0', '0', '0');
  click('Create wallet');
  expect(await screen.findByRole('button', { name: 'Cash, balance ฿1,000.00' })).toBeTruthy();
  expect(creates(fake)[0][0]).toMatchObject({ name: 'Cash', opening_minor: '100000', tracking_start: TODAY });
});

test.each([['quiet', true], ['off', false]] as const)('the first-run bun at %s intensity: shown %s', async (intensity, shown) => {
  mount(createFakeResources(), { intensity });
  await screen.findByRole('heading', { name: 'Add your first wallet' });
  // Off draws no bun, and no art space is kept for it.
  expect(screen.queryByTestId('empty-state-art')?.querySelector('svg') != null).toBe(shown);
});

test('the list itself has no bun: the bun is for moments, not lists and forms', async () => {
  await openList(fakeWith(SHUT));
  click('Archived wallets (1)');
  expect(document.querySelector('svg')).toBeNull();
});

// ---------------------------------------------------------------------------
// Create, with the live preview

test('create: the preview follows the name, the keypad and the start as they change, then one exact command', async () => {
  const fake = await openCreate();
  // Only the stage's Back leaves the form; nothing else on the list shows.
  expect(screen.queryByTestId('wallet-card')).toBeNull();
  expect(preview().getAttribute('aria-label')).toBe('Card preview: New wallet, balance ฿0.00');
  expect(within(preview()).getByText(`Tracking from ${fullDateLabel(TODAY, 'en')}`)).toBeTruthy();
  typeName('Piggy bank');
  expect(preview().getAttribute('aria-label')).toBe('Card preview: Piggy bank, balance ฿0.00');
  press('1', '2', '3', '4', 'Decimal point', '5');
  expect(within(preview()).getByText('฿1,234.50')).toBeTruthy();
  expect(preview().getAttribute('aria-label')).toBe('Card preview: Piggy bank, balance ฿1,234.50');
  expect(screen.getByLabelText('Opening balance, ฿1,234.50')).toBeTruthy();
  click('Previous day');
  expect(within(preview()).getByText(`Tracking from ${fullDateLabel('2026-09-28', 'en')}`)).toBeTruthy();
  click('Create wallet');
  expect(await screen.findByRole('button', { name: 'Piggy bank, balance ฿1,234.50' })).toBeTruthy();
  const [[input, key]] = creates(fake);
  expect(input).toEqual({ id: expect.stringMatching(UUID), name: 'Piggy bank', opening_minor: '123450', tracking_start: '2026-09-28' });
  expect(key).toMatch(UUID);
  expect(key).not.toBe(input.id);
  expect(screen.getByTestId('wallets-total').getAttribute('aria-label')).toBe('Total balance ฿22,284.50');
});

test('the opening balance is typed on the kit keypad only: the one text field is the name', async () => {
  const { container } = mount(createFakeResources(goldenSeed()));
  await screen.findByRole('button', { name: 'Add a wallet' });
  click('Add a wallet');
  await screen.findByRole('group', { name: 'Keypad' });
  expect([...container.querySelectorAll('input, textarea')].map((node) => node.getAttribute('aria-label'))).toEqual(['Wallet name']);
});

test('a sum on the keypad is worked out exactly, and refusals are said as they are typed', async () => {
  const fake = await openCreate();
  typeName('Jar');
  press('1', '0', 'Divided by', '3');
  expect(within(screen.getByTestId('wallet-opening')).getByText('10 ÷ 3')).toBeTruthy();
  expect(screen.getByLabelText('Opening balance, 10 ÷ 3 = ฿3.33')).toBeTruthy();
  press('Clear', '1', 'Decimal point', '2', '3', '4');
  expect(screen.getByText('Use at most two decimal places')).toBeTruthy();
  expect(within(preview()).getByText('฿1.23')).toBeTruthy();
  press('Clear', '5', 'Minus sign', '9', 'Equals');
  expect(screen.getByText("The sum can't go below zero.")).toBeTruthy();
  press('Clear', '1', '0', 'Plus sign', '5', '0');
  click('Create wallet');
  await screen.findByRole('button', { name: 'Jar, balance ฿60.00' });
  expect(creates(fake)[0][0].opening_minor).toBe('6000');
});

test('a wallet needs a name; nothing is sent until it has one', async () => {
  const fake = await openCreate();
  click('Create wallet');
  expect(await screen.findByText('Enter a wallet name')).toBeTruthy();
  typeName('x'.repeat(81));
  click('Create wallet');
  expect(await screen.findByText('Wallet names are up to 80 characters.')).toBeTruthy();
  expect(fake.callsOf('createWallet')).toHaveLength(0);
});

test('saving: the action is busy and the whole form holds still until Jotbun answers', async () => {
  const fake = await openCreate();
  const release = fake.hold('createWallet');
  typeName('Jar');
  press('5');
  click('Create wallet');
  const busy = await within(footer()).findByRole('button', { name: 'Saving…' });
  expect(busy.getAttribute('aria-busy')).toBe('true');
  expect(isLocked('Wallet name')).toBe(true);
  for (const key of within(keypad()).getAllByRole('button')) expect(disabled(key)).toBe(true);
  expect(disabled(screen.getByRole('button', { name: 'Previous day' }))).toBe(true);
  release();
  expect(await screen.findByRole('button', { name: 'Jar, balance ฿5.00' })).toBeTruthy();
  expect(fake.callsOf('createWallet')).toHaveLength(1);
});

test('unconfirmed: the form freezes, only Try again is offered, and it resends the same command and key', async () => {
  const fake = await openCreate();
  fake.loseResponse('createWallet');
  typeName('Jar');
  press('1', '0', '0');
  click('Create wallet');
  expect(await within(footer()).findByText(NOT_CONFIRMED)).toBeTruthy();
  expect(isLocked('Wallet name')).toBe(true);
  for (const key of within(keypad()).getAllByRole('button')) expect(disabled(key)).toBe(true);
  expect(disabled(screen.getByRole('button', { name: 'Previous day' }))).toBe(true);
  expect(disabled(screen.getByRole('button', { name: /^Pick another date/ }))).toBe(true);
  expect(screen.queryByRole('button', { name: 'Create wallet' })).toBeNull();
  press('9');
  expect(within(preview()).getByText('฿100.00')).toBeTruthy();
  fireEvent.click(within(footer()).getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('button', { name: 'Jar, balance ฿100.00' })).toBeTruthy();
  const [first, second] = creates(fake);
  expect(second).toEqual(first);
  expect(fake.wallets.size).toBe(3);
});

test('an unconfirmed create stays frozen with its key when the retry is refused before processing', async () => {
  const fake = await openCreate();
  fake.loseResponse('createWallet');
  typeName('Jar');
  click('Create wallet');
  expect(await within(footer()).findByText(NOT_CONFIRMED)).toBeTruthy();
  // Signed out says nothing about whether the first attempt committed.
  fake.fail('createWallet', 'signed_out');
  fireEvent.click(within(footer()).getByRole('button', { name: 'Try again' }));
  expect(await within(footer()).findByText('Sign in again to save.')).toBeTruthy();
  expect(isLocked('Wallet name')).toBe(true);
  expect(screen.queryByRole('button', { name: 'Create wallet' })).toBeNull();
  fireEvent.click(within(footer()).getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('button', { name: 'Jar, balance ฿0.00' })).toBeTruthy();
  const keys = creates(fake).map(([, key]) => key);
  expect(keys).toHaveLength(3);
  expect(new Set(keys).size).toBe(1);
  expect(fake.wallets.size).toBe(3);
});

test('a create whose wallet already exists under this id was saved by an earlier attempt (isOwnCreate)', async () => {
  const fake = createFakeResources(goldenSeed());
  let attempt = 0;
  const resources: SpendV1Resources = {
    ...fake.resources,
    async createWallet(input, key) {
      attempt += 1;
      if (attempt === 1) {
        await fake.resources.createWallet(input, key);
        throw new V1Error('network', 0, 'NETWORK_ERROR');
      }
      // Jotbun no longer knows the key, so the create meets its own wallet: the id is what tells.
      return fake.resources.createWallet(input, globalThis.crypto.randomUUID());
    },
  };
  mount(fake, { resources });
  await screen.findByRole('button', { name: 'Add a wallet' });
  click('Add a wallet');
  typeName('Jar');
  click('Create wallet');
  fireEvent.click(await within(footer()).findByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('button', { name: 'Jar, balance ฿0.00' })).toBeTruthy();
  expect(fake.wallets.size).toBe(3);
});

test("Jotbun's field problem is shown on its own field, and the corrected wallet is a new command", async () => {
  const fake = await openCreate();
  fake.fail('createWallet', 'invalid', { status: 422, code: 'MINOR_OUT_OF_RANGE', fields: { opening_minor: 'MINOR_OUT_OF_RANGE' } });
  typeName('Jar');
  press('5');
  click('Create wallet');
  const opening = screen.getByTestId('wallet-opening-field');
  expect(await within(opening).findByText('Amounts go up to ฿999,999,999.99')).toBeTruthy();
  expect(within(footer()).getByText('Check the highlighted fields.')).toBeTruthy();
  // A definite refusal: the form is free again and Create is offered, not Try again.
  expect(isLocked('Wallet name')).toBe(false);
  press('0');
  click('Create wallet');
  expect(await screen.findByRole('button', { name: 'Jar, balance ฿50.00' })).toBeTruthy();
  const [[firstInput, firstKey], [secondInput, secondKey]] = creates(fake);
  expect(secondInput.id).toBe(firstInput.id);
  expect(secondKey).not.toBe(firstKey);
});

test('Back leaves the form for the list without sending anything', async () => {
  const fake = await openCreate();
  typeName('Jar');
  click('Back');
  expect(await screen.findByRole('button', { name: CASH_CARD })).toBeTruthy();
  expect(fake.callsOf('createWallet')).toHaveLength(0);
  expect(router.back).not.toHaveBeenCalled();
});

// ---------------------------------------------------------------------------
// Edit: rename and corrections

test('rename sends only the name, with the version that was read, under its own key', async () => {
  const fake = await openEdit(createFakeResources(goldenSeed()), CASH_CARD);
  expect((screen.getByLabelText('Wallet name') as HTMLInputElement).value).toBe('Cash');
  // The preview is the card as it will read: the balance, while the opening balance is what the keypad holds.
  expect(preview().getAttribute('aria-label')).toBe(`Card preview: ${CASH_CARD}`);
  expect(screen.getByLabelText('Opening balance, ฿4,032.00')).toBeTruthy();
  typeName('Pocket money');
  // A new name is not a correction: no reason is asked.
  expect(screen.queryByRole('radiogroup', { name: 'Why are you changing this?' })).toBeNull();
  click('Save changes');
  expect(await screen.findByRole('button', { name: 'Pocket money, balance ฿2,350.00' })).toBeTruthy();
  const [[id, version, changes, key]] = updates(fake);
  expect([id, version, changes]).toEqual([CASH.id, 1, { name: 'Pocket money' }]);
  expect(key).toMatch(UUID);
});

test('saving an unchanged wallet sends nothing and goes back to the list', async () => {
  const fake = await openEdit(createFakeResources(goldenSeed()), CASH_CARD);
  click('Save changes');
  expect(await screen.findByRole('button', { name: CASH_CARD })).toBeTruthy();
  expect(fake.callsOf('updateWallet')).toHaveLength(0);
});

test('a correction to a wallet with entries asks why before sending, and sends the reason chosen', async () => {
  const fake = await openEdit(createFakeResources(goldenSeed()), CASH_CARD);
  const history = fake.callsOf('history')[0].args[0] as Record<string, unknown>;
  expect(history).toMatchObject({ wallet_id: CASH.id, through: TODAY });
  press('Clear', '5', '0', '0', '0');
  // The preview's balance moves with the opening balance, exactly: ฿2,350.00 + (฿5,000.00 − ฿4,032.00).
  expect(preview().getAttribute('aria-label')).toBe('Card preview: Cash, balance ฿3,318.00');
  const question = screen.getByRole('radiogroup', { name: 'Why are you changing this?' });
  expect(within(question).getByText('This wallet already has entries, so Jotbun keeps a note of why.')).toBeTruthy();
  click('Save changes');
  expect(await within(question).findByText("Choose why you're changing this.")).toBeTruthy();
  expect(fake.callsOf('updateWallet')).toHaveLength(0);
  const reconcile = within(question).getByRole('radio', { name: 'Match my real balance' });
  expect(reconcile.getAttribute('aria-checked')).toBe('false');
  fireEvent.click(reconcile);
  expect(reconcile.getAttribute('aria-checked')).toBe('true');
  expect(within(question).getByRole('radio', { name: 'A mistake when I set it up' }).getAttribute('aria-checked')).toBe('false');
  click('Save changes');
  // ฿5,000.00 − ฿182.00 − ฿1,500.00.
  expect(await screen.findByRole('button', { name: 'Cash, balance ฿3,318.00' })).toBeTruthy();
  expect(updates(fake)[0].slice(0, 3)).toEqual([CASH.id, 1, { opening_minor: '500000', correction_reason: 'balance_reconciliation' }]);
});

test('a tracking start correction asks too; "A mistake when I set it up" is entry_error', async () => {
  const fake = await openEdit(createFakeResources(goldenSeed()), CASH_CARD);
  click('Previous day');
  fireEvent.click(screen.getByRole('radio', { name: 'A mistake when I set it up' }));
  click('Save changes');
  await screen.findByRole('button', { name: CASH_CARD });
  expect(updates(fake)[0].slice(0, 3)).toEqual([CASH.id, 1, { tracking_start: '2026-08-31', correction_reason: 'entry_error' }]);
});

test('a wallet with no entries is corrected without a reason', async () => {
  const fake = await openEdit(fakeWith(OLD), OLD_CARD);
  press('2', '0', '0');
  expect(screen.queryByRole('radiogroup', { name: 'Why are you changing this?' })).toBeNull();
  click('Save changes');
  expect(await screen.findByRole('button', { name: 'Old card, balance ฿200.00' })).toBeTruthy();
  expect(updates(fake)[0].slice(0, 3)).toEqual([OLD.id, 1, { opening_minor: '20000' }]);
});

test('if Jotbun still wants a reason, the question appears and the answer is sent as a new command', async () => {
  const fake = await openEdit(fakeWith(OLD), OLD_CARD);
  fake.fail('updateWallet', 'invalid', { status: 422, code: 'VALIDATION_FAILED', fields: { correction_reason: 'errors.correction_reason_required' } });
  press('2', '0', '0');
  click('Save changes');
  const question = await screen.findByRole('radiogroup', { name: 'Why are you changing this?' });
  expect(within(question).getByText("Choose why you're changing this.")).toBeTruthy();
  fireEvent.click(within(question).getByRole('radio', { name: 'A mistake when I set it up' }));
  click('Save changes');
  expect(await screen.findByRole('button', { name: 'Old card, balance ฿200.00' })).toBeTruthy();
  const [first, second] = updates(fake);
  expect(first[2]).toEqual({ opening_minor: '20000' });
  expect(second[2]).toEqual({ opening_minor: '20000', correction_reason: 'entry_error' });
  expect(second[3]).not.toBe(first[3]);
});

test("Jotbun's tracking start problem is shown under Tracking starts", async () => {
  const fake = await openEdit(createFakeResources(goldenSeed()), CASH_CARD);
  fake.fail('updateWallet', 'invalid', { status: 422, code: 'VALIDATION_FAILED', fields: { tracking_start: 'errors.records_before_tracking_start' } });
  click('Next day');
  fireEvent.click(screen.getByRole('radio', { name: 'A mistake when I set it up' }));
  click('Save changes');
  const field = screen.getByTestId('wallet-start-field');
  expect(await within(field).findByText('This wallet has entries before this date.')).toBeTruthy();
  expect(within(footer()).getByText('Check the highlighted fields.')).toBeTruthy();
});

test('an unconfirmed edit is frozen, and Try again resends the same change with the same key', async () => {
  const fake = await openEdit(createFakeResources(goldenSeed()), CASH_CARD);
  fake.loseResponse('updateWallet');
  typeName('Pocket');
  click('Save changes');
  expect(await within(footer()).findByText(NOT_CONFIRMED)).toBeTruthy();
  expect(isLocked('Wallet name')).toBe(true);
  expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
  fireEvent.click(within(footer()).getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('button', { name: 'Pocket, balance ฿2,350.00' })).toBeTruthy();
  const [first, second] = updates(fake);
  expect(second).toEqual(first);
});

test('changed elsewhere: theirs is shown beside yours, nothing is resent, and Reload starts again from theirs', async () => {
  const fake = await openEdit(createFakeResources(goldenSeed()), CASH_CARD);
  typeName('Wallet');
  fake.wallets.set(CASH.id, { ...CASH, name: 'Pocket', version: 2 });
  click('Save changes');
  const conflict = await screen.findByTestId('wallet-conflict');
  expect(within(conflict).getByRole('heading', { name: CHANGED })).toBeTruthy();
  expect(within(conflict).getByLabelText('Name. Yours: Wallet. On the server: Pocket.')).toBeTruthy();
  expect(within(conflict).getByLabelText('Balance. On the server: ฿2,350.00.')).toBeTruthy();
  expect(within(footer()).queryByRole('button', { name: 'Save changes' })).toBeNull();
  fireEvent.click(within(footer()).getByRole('button', { name: 'Reload' }));
  await waitFor(() => expect((screen.getByLabelText('Wallet name') as HTMLInputElement).value).toBe('Pocket'));
  expect(screen.queryByTestId('wallet-conflict')).toBeNull();
  expect(fake.callsOf('updateWallet')).toHaveLength(1);
  typeName('Wallet');
  click('Save changes');
  expect(await screen.findByRole('button', { name: 'Wallet, balance ฿2,350.00' })).toBeTruthy();
  expect(updates(fake)[1].slice(0, 3)).toEqual([CASH.id, 2, { name: 'Wallet' }]);
});

// ---------------------------------------------------------------------------
// Archive

test('a wallet that holds money is not offered Archive; the screen says why and what to do', async () => {
  await openEdit(createFakeResources(goldenSeed()), CASH_CARD);
  const section = screen.getByTestId('wallet-archive');
  expect(within(section).getByText('To archive Cash, its balance must be ฿0.00. It holds ฿2,350.00 now: move that money to another wallet first.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Archive wallet' })).toBeNull();
});

test('a wallet below zero is told to bring money in first', async () => {
  const fake = fakeWith({ ...OLD, name: 'Card' });
  fake.records.set('0000000b-0000-4000-8000-0000000000f2', { ...expenseIn(OLD.id, '0000000b-0000-4000-8000-0000000000f2'), amount_minor: '20050' } as TransactionDto);
  await openEdit(fake, 'Card, balance Minus ฿200.50');
  expect(within(screen.getByTestId('wallet-archive')).getByText('To archive Card, its balance must be ฿0.00. It is at -฿200.50 now: move money in from another wallet first.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Archive wallet' })).toBeNull();
});

test('at ฿0.00, Archive asks first in the confirm sheet, then archives with the version that was read', async () => {
  const fake = await openEdit(fakeWith(OLD), OLD_CARD);
  click('Archive wallet');
  const dialog = await screen.findByRole('dialog', { name: 'Archive Old card?' });
  expect(within(dialog).getByText('Old card leaves your wallet list and Quick add. Its entries stay in History, and you can unarchive it any time.')).toBeTruthy();
  // The quiet bun is decoration.
  expect(hiddenFromScreenReaders(dialog.querySelector('svg'))).toBe(true);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Keep it' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(fake.callsOf('archiveWallet')).toHaveLength(0);
  click('Archive wallet');
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Archive Old card' }));
  expect(await screen.findByRole('button', { name: 'Archived wallets (1)' })).toBeTruthy();
  const [[id, version, key]] = fake.callsOf('archiveWallet').map((call) => call.args);
  expect([id, version]).toEqual([OLD.id, 1]);
  expect(key).toMatch(UUID);
  expect(screen.queryByRole('button', { name: OLD_CARD })).toBeNull();
});

test('archive refused because the balance is no longer zero: said in words, and the balance is read again', async () => {
  const fake = await openEdit(fakeWith(OLD), OLD_CARD);
  click('Archive wallet');
  const dialog = await screen.findByRole('dialog');
  fake.records.set('0000000b-0000-4000-8000-0000000000f1', expenseIn(OLD.id));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Archive Old card' }));
  const section = screen.getByTestId('wallet-archive');
  expect(await within(section).findByText("Old card wasn't archived: its balance is no longer ฿0.00.")).toBeTruthy();
  expect(await within(section).findByText('To archive Old card, its balance must be ฿0.00. It is at -฿50.00 now: move money in from another wallet first.')).toBeTruthy();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Archive wallet' })).toBeNull();
  expect(fake.callsOf('wallets').length).toBeGreaterThanOrEqual(2);
});

test('an unconfirmed archive is frozen, and Try again resends the same archive with the same key', async () => {
  const fake = await openEdit(fakeWith(OLD), OLD_CARD);
  fake.loseResponse('archiveWallet');
  click('Archive wallet');
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Archive Old card' }));
  expect(await within(footer()).findByText(NOT_CONFIRMED)).toBeTruthy();
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(isLocked('Wallet name')).toBe(true);
  expect(disabled(screen.getByRole('button', { name: 'Archive wallet' }))).toBe(true);
  fireEvent.click(within(footer()).getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('button', { name: 'Archived wallets (1)' })).toBeTruthy();
  const [first, second] = fake.callsOf('archiveWallet');
  expect(second.args).toEqual(first.args);
});

// ---------------------------------------------------------------------------
// Accessibility, motion, palette and language

test('every control is at least 44 points, keypad keys at least 56, and each has a role and a name', async () => {
  await openList(fakeWith(SHUT));
  click('Archived wallets (1)');
  for (const name of ['Back', CASH_CARD, DAILY_CARD, 'Add a wallet', 'Archived wallets (1)', 'Unarchive Travel card']) {
    expect(Number.parseFloat(screen.getByRole('button', { name }).style.minHeight), name).toBeGreaterThanOrEqual(44);
  }
  click(CASH_CARD);
  await screen.findByRole('heading', { name: 'Edit wallet' });
  await settle();
  press('Clear', '1');
  for (const name of ['Back', 'Save changes', 'Previous day', 'Next day']) {
    expect(Number.parseFloat(screen.getByRole('button', { name }).style.minHeight), name).toBeGreaterThanOrEqual(44);
  }
  for (const radio of screen.getAllByRole('radio')) expect(Number.parseFloat(radio.style.minHeight)).toBeGreaterThanOrEqual(44);
  expect(Number.parseFloat((screen.getByLabelText('Wallet name') as HTMLElement).style.minHeight)).toBeGreaterThanOrEqual(44);
  for (const key of within(keypad()).getAllByRole('button')) expect(Number.parseFloat(key.style.minHeight)).toBeGreaterThanOrEqual(56);
  for (const button of screen.getAllByRole('button')) expect(button.getAttribute('aria-label') ?? button.textContent, 'every button has a name').toBeTruthy();
});

test('under reduced motion nothing springs: the screen has no motion of its own and its sheet simply appears', async () => {
  motion.reduced = true;
  const spring = vi.spyOn(Animated, 'spring');
  const timing = vi.spyOn(Animated, 'timing');
  await openEdit(fakeWith(OLD), OLD_CARD);
  click('Archive wallet');
  const dialog = await screen.findByRole('dialog');
  expect(spring).not.toHaveBeenCalled();
  expect(timing).not.toHaveBeenCalled();
  expect(within(dialog.ownerDocument.body).getByTestId('sheet-panel').style.transform).toBe('translateY(0px)');
});

test('the screen draws with palette tokens only, and keeps money out of floating point', () => {
  for (const file of ['WalletsScreen.tsx', 'WalletParts.tsx']) {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), file), 'utf8');
    expect(source, file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source, file).not.toMatch(/rgba?\(/);
    expect(source, file).not.toMatch(/parseFloat|parseInt|toFixed|Number\(|Math\.|keyboardType/);
    expect(source, file).toMatch(/useBunColors\(\)/);
  }
});

test.each(MATRIX)('reads in $locale, $mode: the stage, exact money, palette colours and Thai leading', async ({ locale, mode, colors }) => {
  const say = (english: string, values?: Record<string, string>) => translateCopy(english, locale, values);
  await openList(fakeWith(SHUT), { locale, mode });
  expect(screen.getByTestId('wallets-screen').style.backgroundColor).toEqual(rgb(colors.background));
  expect(screen.getByTestId('stage-header').style.backgroundColor).toEqual(rgb(colors.stage));
  const title = screen.getByRole('heading', { name: say('Wallets') });
  expect(title.style.color).toEqual(rgb(colors.ink));
  expect(title.style.lineHeight).toBe(leading('title', locale));
  expect(screen.getByTestId('wallets-total').getAttribute('aria-label')).toBe(`${say('Total balance')} ฿21,050.00`);
  const cash = screen.getByRole('button', { name: say('{name}, balance {amount}', { name: 'Cash', amount: '฿2,350.00' }) });
  expect(cash.style.backgroundColor).toEqual(rgb(colors.card));
  expect(within(cash).getByText('Cash').style.lineHeight).toBe(leading('heading', locale));
  expect(within(cash).getByText('฿2,350.00').style.color).toEqual(rgb(colors.ink));
  expect(within(cash).getByText(say('Tracking from {date}', { date: fullDateLabel('2026-09-01', locale) })).style.lineHeight).toBe(leading('caption', locale));
  fireEvent.click(screen.getByRole('button', { name: say('Archived wallets ({count})', { count: '1' }) }));
  expect(within(screen.getByTestId('wallets-archived')).getByText(say('Archived')).style.lineHeight).toBe(leading('caption', locale));
  expectApprovedTextPairs(document.body, colors);
});

test.each(MATRIX)('the form reads in $locale, $mode: preview, fields and footer on approved colours with Thai leading', async ({ locale, mode, colors }) => {
  const say = (english: string, values?: Record<string, string>) => translateCopy(english, locale, values);
  await openList(createFakeResources(goldenSeed()), { locale, mode });
  fireEvent.click(screen.getByRole('button', { name: say('Add a wallet') }));
  const heading = await screen.findByRole('heading', { name: say('Add a wallet') });
  expect(heading.style.lineHeight).toBe(leading('title', locale));
  fireEvent.change(screen.getByLabelText(say('Wallet name')), { target: { value: 'กระปุก' } });
  expect(within(preview()).getByText('กระปุก').style.lineHeight).toBe(leading('heading', locale));
  expect(preview().style.backgroundColor).toEqual(rgb(colors.card));
  const create = within(footer()).getByRole('button', { name: say('Create wallet') });
  expect(create.style.backgroundColor).toEqual(rgb(colors.ink));
  fireEvent.change(screen.getByLabelText(say('Wallet name')), { target: { value: '' } });
  fireEvent.click(create);
  expect(await screen.findByText(say('Enter a wallet name'))).toBeTruthy();
  expectApprovedTextPairs(document.body, colors);
});

test.each(['light', 'dark'] as const)('%s: edit with its reason, the archive advice, a conflict and the confirm sheet use approved text pairs', async (mode) => {
  const colors = MATRIX.find((entry) => entry.mode === mode)!.colors;
  const fake = fakeWith(OLD);
  mount(fake, { mode });
  fireEvent.click(await screen.findByRole('button', { name: CASH_CARD }));
  await screen.findByRole('heading', { name: 'Edit wallet' });
  await settle();
  press('Clear', '1');
  click('Save changes');
  await screen.findByText("Choose why you're changing this.");
  expectApprovedTextPairs(document.body, colors);
  fireEvent.click(screen.getByRole('radio', { name: 'Match my real balance' }));
  fake.wallets.set(CASH.id, { ...CASH, name: 'Pocket', version: 2 });
  click('Save changes');
  await screen.findByTestId('wallet-conflict');
  expectApprovedTextPairs(document.body, colors);
  cleanup();
  await openEdit(fakeWith(OLD), OLD_CARD, { mode });
  click('Archive wallet');
  await screen.findByRole('dialog');
  expectApprovedTextPairs(document.body, colors);
});

test('Thai: the screen speaks Thai, and the money stays exact baht', async () => {
  await openList(createFakeResources(goldenSeed()), { locale: 'th' });
  expect(screen.getByRole('heading', { name: 'กระเป๋าเงิน' })).toBeTruthy();
  expect(screen.getByTestId('wallets-total').getAttribute('aria-label')).toBe(`${translateCopy('Total balance', 'th')} ฿21,050.00`);
  fireEvent.click(screen.getByRole('button', { name: translateCopy('Add a wallet', 'th') }));
  await screen.findByRole('group', { name: translateCopy('Keypad', 'th') });
  for (const key of ['1', '2', '3', '4']) fireEvent.click(within(screen.getByRole('group', { name: translateCopy('Keypad', 'th') })).getByRole('button', { name: key }));
  expect(within(preview()).getByText('฿1,234.00')).toBeTruthy();
});

// ---------------------------------------------------------------------------
// The catalogue's wallet sections (registered by the main session)

/** What each catalogue section must show once its script has run. */
const SECTION_SHOWS: Readonly<Record<string, (body: HTMLElement) => void>> = {
  'wallets-loading': (body) => expect(within(body).getByLabelText('Loading your wallets')).toBeTruthy(),
  'wallets-problem': (body) => expect(within(body).getByText("We couldn't load your diary.")).toBeTruthy(),
  'wallets-offline': (body) => expect(within(body).getByTestId('wallets-on-device')).toBeTruthy(),
  'wallets-first-run': (body) => {
    expect(within(body).getByRole('heading', { name: 'Add your first wallet' })).toBeTruthy();
    expect(within(body).getByTestId('wallet-preview')).toBeTruthy();
  },
  'wallets-list': (body) => expect(within(body).getByTestId('wallets-total').getAttribute('aria-label')).toBe('Total balance ฿21,050.00'),
  'wallets-archived': (body) => expect(within(body).getByRole('button', { name: 'Unarchive Travel card' })).toBeTruthy(),
  'wallets-create': (body) => expect(within(body).getByTestId('wallet-preview').getAttribute('aria-label')).toBe('Card preview: Piggy bank, balance ฿1,234.50'),
  'wallets-saving': (body) => expect(within(body).getByRole('button', { name: 'Saving…' })).toBeTruthy(),
  'wallets-unconfirmed': (body) => {
    expect(within(body).getByText(NOT_CONFIRMED)).toBeTruthy();
    expect(within(body).getByRole('button', { name: 'Try again' })).toBeTruthy();
  },
  'wallets-edit': (body) => expect(within(body).getByText('To archive Cash, its balance must be ฿0.00. It holds ฿2,350.00 now: move that money to another wallet first.')).toBeTruthy(),
  'wallets-conflict': (body) => expect(within(body).getByLabelText('Name. Yours: Wallet. On the server: Pocket.')).toBeTruthy(),
  'wallets-archive-confirm': () => expect(screen.getByRole('dialog', { name: 'Archive Old card?' })).toBeTruthy(),
  'wallets-archive-refused': (body) => expect(within(body).getByText("Old card wasn't archived: its balance is no longer ฿0.00.")).toBeTruthy(),
  'wallets-correction': (body) => expect(within(body).getByText("Choose why you're changing this.")).toBeTruthy(),
  'wallets-field-error': (body) => expect(within(within(body).getByTestId('wallet-start-field')).getByText('This wallet has entries before this date.')).toBeTruthy(),
};

test('the catalogue has one wallet section per state, ids wallets-… and titles Wallets: …', () => {
  expect(WALLET_SECTIONS.map((section) => section.id)).toEqual(Object.keys(SECTION_SHOWS));
  for (const section of WALLET_SECTIONS) {
    expect(section.id).toMatch(/^wallets-[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(section.title).toMatch(/^Wallets: \S/);
    expect(section.group).toBe('Screens');
    expect(section.layout).toBe('screen');
  }
  expect(new Set(WALLET_SECTIONS.map((section) => section.title)).size).toBe(WALLET_SECTIONS.length);
});

test.each(WALLET_SECTIONS.map((section) => [section.id, section] as const))('catalogue section %s reaches its state on fakes alone', async (id, section) => {
  const network = vi.spyOn(globalThis, 'fetch');
  const errors = vi.spyOn(console, 'error');
  mountInApp(<>{section.render()}</>);
  await waitFor(() => expect(screen.queryByTestId('catalogue-screen-running')).toBeNull(), { timeout: 15_000 });
  expect(screen.queryByTestId('catalogue-screen-stopped'), screen.queryByTestId('catalogue-screen-stopped')?.textContent ?? '').toBeNull();
  SECTION_SHOWS[id](screen.getByTestId('catalogue-screen-ready'));
  expect(network).not.toHaveBeenCalled();
  expect(errors).not.toHaveBeenCalled();
}, 30_000);

// ---------------------------------------------------------------------------
// Text pairs (as the Home render test checks them)

/** `#RRGGBB` for a CSS colour react-native-web wrote; null when transparent. */
function hexOf(css: string): string | null {
  if (/^#[0-9a-f]{6}$/i.test(css)) return css.toUpperCase();
  const match = /^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/.exec(css);
  if (!match || (match[4] !== undefined && Number(match[4]) === 0)) return null;
  return `#${[match[1], match[2], match[3]].map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/**
 * Every piece of text on screen is drawn in a palette pair that BUN_TEXT_PAIRS
 * approves, and clears 4.5:1 against the nearest ground behind it.
 */
function expectApprovedTextPairs(root: ParentNode, colors: BunColors) {
  const tokens = (hex: string) => Object.entries(colors).filter(([, value]) => typeof value === 'string' && value.toUpperCase() === hex).map(([name]) => name);
  let checked = 0;
  for (const element of root.querySelectorAll<HTMLElement>('*')) {
    const ownText = [...element.childNodes].some((node) => node.nodeType === 3 && (node.textContent ?? '').trim() !== '');
    if (!ownText || !element.style.color || hiddenFromScreenReaders(element)) continue;
    const fg = hexOf(element.style.color);
    let ground: string | null = null;
    for (let node: HTMLElement | null = element; node && !ground; node = node.parentElement) ground = node.style?.backgroundColor ? hexOf(node.style.backgroundColor) : null;
    expect(fg, element.textContent ?? '').not.toBeNull();
    expect(ground, element.textContent ?? '').not.toBeNull();
    const pairOk = BUN_TEXT_PAIRS.some(([text, on]) => tokens(fg as string).includes(text) && tokens(ground as string).includes(on));
    expect(pairOk, `${element.textContent}: ${fg} on ${ground}`).toBe(true);
    expect(contrastRatio(fg as string, ground as string), element.textContent ?? '').toBeGreaterThanOrEqual(4.5);
    checked += 1;
  }
  expect(checked).toBeGreaterThan(0);
}
