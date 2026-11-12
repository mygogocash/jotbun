// The wallet commands, read through a probe: each button sends one command
// through the hook (or resends), and every answer is kept in order. The
// Wallets screen's own suite stays the rendering check; the last section pins
// the pages' answers that suite does not reach (a refused unarchive, a frozen
// or blocked form, an archive conflict, a refusal that names a field).
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Pressable, Text } from 'react-native';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

vi.mock('expo-router', () => import('../../../dev/catalogue/routerTestStub'));
vi.mock('expo-router/build/Route', () => import('../../../dev/catalogue/routerTestStub'));
vi.mock('react-native-safe-area-context', () => import('../../../dev/catalogue/safeAreaTestStub'));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

import type { CreateWalletRequest, TransactionDto, WalletSnapshot } from '@gogospend/contracts';
import { recordAnalytics } from '@mobile/analytics/testing/recordAnalytics';
import type { Recorded } from '@mobile/analytics/testing/recordAnalytics';
import { V1Error } from '@mobile/api/client';
import { router } from '@mobile/dev/catalogue/routerTestStub';
import { installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import type { SpendV1Resources } from '@mobile/spend/v1/resources';
import { BUILTINS, createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
import { NOW, mountScreen } from '../HistoryTestHarness';
import { useWalletCommand } from './walletCommands';
import type { WalletCommand, WalletOutcome, WalletTrack } from './walletCommands';
import { WalletsScreen } from './WalletsScreen';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NOT_CONFIRMED = 'Not confirmed yet. Your entry is kept; try again.';
const [CASH] = goldenSeed().wallets as [WalletSnapshot, WalletSnapshot];
/** A wallet at exactly ฿0.00 with no entries: the one that can be archived. */
const OLD: WalletSnapshot = { id: '0000000a-0000-4000-8000-000000000003', name: 'Old card', currency: 'THB', opening_minor: '0', tracking_start: '2026-09-01', archived: false, version: 1 };
const SHUT: WalletSnapshot = { ...OLD, id: '0000000a-0000-4000-8000-000000000004', name: 'Travel card', archived: true, version: 2 };
const JAR: CreateWalletRequest = { id: '0000000a-0000-4000-8000-0000000000a1', name: 'Jar', opening_minor: '5000', tracking_start: '2026-09-29' };
const POT: CreateWalletRequest = { id: '0000000a-0000-4000-8000-0000000000a2', name: 'Pot', opening_minor: '700', tracking_start: '2026-09-29' };
const LOOK: WalletTrack = { walletType: 'transit', material: 'sky', bunFace: 'wow' };

const COMMANDS = {
  createJar: { kind: 'create', slot: 'create', input: JAR },
  createPot: { kind: 'create', slot: 'create', input: POT },
  renameCash: { kind: 'update', slot: `edit:${CASH.id}`, id: CASH.id, version: 1, changes: { name: 'Pocket' } },
  renamePurse: { kind: 'update', slot: `edit:${CASH.id}`, id: CASH.id, version: 1, changes: { name: 'Purse' } },
  correctCash: { kind: 'update', slot: `edit:${CASH.id}`, id: CASH.id, version: 1, changes: { opening_minor: '100' } },
  renameGone: { kind: 'update', slot: 'edit:gone', id: '0000000a-0000-4000-8000-0000000000ff', version: 1, changes: { name: 'Ghost' } },
  archiveOld: { kind: 'archive', slot: `archive:${OLD.id}`, id: OLD.id, version: 1 },
  archiveOldNewer: { kind: 'archive', slot: `archive:${OLD.id}`, id: OLD.id, version: 2 },
  archiveShut: { kind: 'archive', slot: `archive:${SHUT.id}`, id: SHUT.id, version: 2 },
  unarchiveShut: { kind: 'unarchive', slot: `unarchive:${SHUT.id}`, id: SHUT.id, version: 2 },
} satisfies Record<string, WalletCommand>;
type Name = keyof typeof COMMANDS;

type Answer = WalletOutcome | null;

/** One button per command (named by its key; "<key> with look" sends LOOK as the track), and Resend. */
function Probe({ answers }: { answers: Answer[] }) {
  const commands = useWalletCommand();
  const keep = (answer: Answer) => { answers.push(answer); };
  return (
    <>
      <Text testID="sending">{`sending ${commands.sending}`}</Text>
      {(Object.keys(COMMANDS) as Name[]).map((name) => (
        <Pressable key={name} accessibilityRole="button" accessibilityLabel={name} onPress={() => void commands.send(COMMANDS[name]).then(keep)}>
          <Text>{name}</Text>
        </Pressable>
      ))}
      <Pressable accessibilityRole="button" accessibilityLabel="createJar with look" onPress={() => void commands.send(COMMANDS.createJar, LOOK).then(keep)}>
        <Text>createJar with look</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Resend" onPress={() => void commands.resend().then(keep)}><Text>Resend</Text></Pressable>
    </>
  );
}

type Fake = ReturnType<typeof createFakeResources>;
const fakeWith = (...wallets: WalletSnapshot[]): Fake => createFakeResources({ wallets: [...goldenSeed().wallets, ...wallets], records: goldenSeed().records });

function mount(fake: Fake, resources: SpendV1Resources = fake.resources): Answer[] {
  const answers: Answer[] = [];
  mountScreen(<Probe answers={answers} />, { resources });
  return answers;
}
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
/** Presses, then waits for that press's answer. */
async function answer(answers: Answer[], name: string): Promise<Answer> {
  const before = answers.length;
  press(name);
  await waitFor(() => expect(answers).toHaveLength(before + 1));
  return answers[before];
}
const argsOf = (fake: Fake, method: keyof SpendV1Resources) => fake.callsOf(method).map((call) => call.args);
const keysOf = (fake: Fake, method: keyof SpendV1Resources) => argsOf(fake, method).map((args) => args.at(-1));
/** The captured wallet_added events, without the app-wide `origin` every capture carries. */
const added = (sent: Recorded[]) => sent.filter((event) => event.name === 'wallet_added').map(({ kind, properties }) => {
  const { origin: _origin, ...rest } = properties;
  return { kind, properties: rest };
});
/** A ฿50.00 expense in a wallet, as another device would add it. */
const expenseIn = (walletId: string): TransactionDto =>
  ({ id: '0000000b-0000-4000-8000-0000000000f1', type: 'expense', amount_minor: '5000', occurred_on: '2026-09-29', wallet_id: walletId, category_id: BUILTINS[0].id, note: null, merchant: null, deleted_at: null, version: 1 }) as TransactionDto;

let restoreAnalytics: (() => void) | null = null;
async function recordEvents(): Promise<Recorded[]> {
  const recorded = await recordAnalytics();
  restoreAnalytics = recorded.restore;
  return recorded.sent;
}

beforeAll(() => { installBrowserStorage(); });
beforeEach(() => {
  for (const fn of [router.push, router.replace, router.back, router.navigate]) fn.mockReset();
  router.canGoBack.mockReset();
  router.canGoBack.mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  restoreAnalytics?.();
  restoreAnalytics = null;
  window.localStorage.clear();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// The plan's five

test('a create sends once with its key and answers done; a lost answer freezes it and resend uses the same key', async () => {
  const fake = createFakeResources(goldenSeed());
  const answers = mount(fake);
  expect(await answer(answers, 'createJar')).toEqual({ kind: 'done' });
  expect(argsOf(fake, 'createWallet')).toHaveLength(1);
  const [firstInput, firstKey] = argsOf(fake, 'createWallet')[0] as [CreateWalletRequest, string];
  expect(firstInput).toEqual(JAR);
  expect(firstKey).toMatch(UUID);

  fake.loseResponse('createWallet');
  expect(await answer(answers, 'createPot')).toEqual({ kind: 'unconfirmed', message: NOT_CONFIRMED, blocked: false });
  expect(await answer(answers, 'Resend')).toEqual({ kind: 'done' });
  const [, lost, resent] = argsOf(fake, 'createWallet');
  expect(resent).toEqual(lost);
  expect(lost[1]).not.toBe(firstKey);
  // The resend replayed the first commit: one Pot, never two.
  expect(fake.wallets.size).toBe(4);
  // Known now: nothing is left to resend.
  expect(await answer(answers, 'Resend')).toBeNull();
  expect(argsOf(fake, 'createWallet')).toHaveLength(3);
});

test('an archive refused because the balance moved answers archiveRefused', async () => {
  const fake = fakeWith(OLD);
  fake.records.set('0000000b-0000-4000-8000-0000000000f1', expenseIn(OLD.id));
  const answers = mount(fake);
  expect(await answer(answers, 'archiveOld')).toEqual({
    kind: 'refused', message: 'Check the highlighted fields.', fields: {}, needsReason: false, archiveRefused: true, blocked: false,
  });
  // A definite refusal settles its key: the next archive is a new command.
  fake.records.delete('0000000b-0000-4000-8000-0000000000f1');
  expect(await answer(answers, 'archiveOld')).toEqual({ kind: 'done' });
  const [first, second] = keysOf(fake, 'archiveWallet');
  expect(second).not.toBe(first);
});

test("an unarchive in conflict answers the server's wallet", async () => {
  const fake = fakeWith(SHUT);
  fake.wallets.set(SHUT.id, { ...SHUT, name: 'Trip card', version: 3 });
  const answers = mount(fake);
  expect(await answer(answers, 'unarchiveShut')).toEqual({ kind: 'conflict', current: { ...SHUT, name: 'Trip card', version: 3, balance_minor: '0' } });
  expect(await answer(answers, 'Resend')).toBeNull();
  expect(fake.callsOf('unarchiveWallet')).toHaveLength(1);
});

test('a create sends one wallet_added with the look it was given', async () => {
  const sent = await recordEvents();
  const fake = createFakeResources(goldenSeed());
  const answers = mount(fake);
  expect(await answer(answers, 'createJar with look')).toEqual({ kind: 'done' });
  expect(added(sent)).toEqual([{ kind: 'capture', properties: { wallet_type: 'transit', material: 'sky', bun_face: 'wow' } }]);
  expect(sent).toHaveLength(1);
  // No name or amount from the wallet.
  const text = JSON.stringify(sent);
  for (const secret of [JAR.name, JAR.opening_minor, '50.00']) expect(text).not.toContain(secret);
  // With no look given, the event carries none.
  expect(await answer(answers, 'createPot')).toEqual({ kind: 'done' });
  expect(added(sent)).toEqual([
    { kind: 'capture', properties: { wallet_type: 'transit', material: 'sky', bun_face: 'wow' } },
    { kind: 'capture', properties: {} },
  ]);
});

test('a refused create sends nothing', async () => {
  const sent = await recordEvents();
  const fake = createFakeResources(goldenSeed());
  fake.fail('createWallet', 'invalid', { status: 422, code: 'MINOR_OUT_OF_RANGE', fields: { opening_minor: 'MINOR_OUT_OF_RANGE' } });
  const answers = mount(fake);
  expect(await answer(answers, 'createJar with look')).toEqual({
    kind: 'refused', message: 'Check the highlighted fields.', fields: { opening_minor: 'Amounts go up to ฿999,999,999.99' }, needsReason: false, archiveRefused: false, blocked: false,
  });
  expect(fake.callsOf('createWallet')).toHaveLength(1);
  expect(sent).toEqual([]);
  // A lost answer sends nothing either, until the resend lands.
  fake.loseResponse('createWallet');
  expect(await answer(answers, 'createPot')).toEqual({ kind: 'unconfirmed', message: NOT_CONFIRMED, blocked: false });
  expect(sent).toEqual([]);
});

// ---------------------------------------------------------------------------
// Every other rule the hook took from the two pages

test('an unconfirmed create stays frozen with its key while a resend is refused before processing, then lands', async () => {
  const fake = createFakeResources(goldenSeed());
  fake.loseResponse('createWallet');
  const answers = mount(fake);
  expect(await answer(answers, 'createJar')).toEqual({ kind: 'unconfirmed', message: NOT_CONFIRMED, blocked: false });
  // Signed out says nothing about whether the first attempt committed.
  fake.fail('createWallet', 'signed_out');
  expect(await answer(answers, 'Resend')).toEqual({ kind: 'unconfirmed', message: 'Sign in again to save.', blocked: false });
  // A changed session must not resend under another identity: still frozen, and blocked.
  fake.fail('createWallet', 'session_changed');
  expect(await answer(answers, 'Resend')).toEqual({ kind: 'unconfirmed', message: 'Your session changed. Sign in again to save.', blocked: true });
  expect(await answer(answers, 'Resend')).toEqual({ kind: 'done' });
  const keys = keysOf(fake, 'createWallet');
  expect(keys).toHaveLength(4);
  expect(new Set(keys).size).toBe(1);
  expect(fake.wallets.size).toBe(3);
});

test('a first attempt refused before processing is a definite refusal: its key is settled and nothing waits', async () => {
  const fake = createFakeResources(goldenSeed());
  fake.fail('createWallet', 'signed_out');
  const answers = mount(fake);
  expect(await answer(answers, 'createJar')).toEqual({
    kind: 'refused', message: 'Sign in again to save.', fields: {}, needsReason: false, archiveRefused: false, blocked: false,
  });
  expect(await answer(answers, 'Resend')).toBeNull();
  expect(await answer(answers, 'createJar')).toEqual({ kind: 'done' });
  const [first, second] = keysOf(fake, 'createWallet');
  expect(second).not.toBe(first);
});

test('a resend refused for good settles it: nothing is left to resend', async () => {
  const fake = createFakeResources(goldenSeed());
  fake.loseResponse('createWallet');
  const answers = mount(fake);
  expect(await answer(answers, 'createJar')).toEqual({ kind: 'unconfirmed', message: NOT_CONFIRMED, blocked: false });
  fake.fail('createWallet', 'invalid', { status: 422, code: 'INVALID_DATE', fields: { tracking_start: 'INVALID_DATE' } });
  expect(await answer(answers, 'Resend')).toEqual({
    kind: 'refused', message: 'Check the highlighted fields.', fields: { tracking_start: 'Enter a real date as YYYY-MM-DD' }, needsReason: false, archiveRefused: false, blocked: false,
  });
  expect(await answer(answers, 'Resend')).toBeNull();
  expect(fake.callsOf('createWallet')).toHaveLength(2);
});

test('a create that meets its own wallet was saved by an earlier attempt: done, with one wallet_added in the first look', async () => {
  const sent = await recordEvents();
  const fake = createFakeResources(goldenSeed());
  let attempt = 0;
  const sentKeys: string[] = [];
  const resources: SpendV1Resources = {
    ...fake.resources,
    async createWallet(input, key) {
      attempt += 1;
      sentKeys.push(key);
      if (attempt === 1) {
        await fake.resources.createWallet(input, key);
        throw new V1Error('network', 0, 'NETWORK_ERROR');
      }
      // Jotbun no longer knows the key, so the create meets its own wallet: the id is what tells.
      return fake.resources.createWallet(input, globalThis.crypto.randomUUID());
    },
  };
  const answers = mount(fake, resources);
  expect(await answer(answers, 'createJar with look')).toEqual({ kind: 'unconfirmed', message: NOT_CONFIRMED, blocked: false });
  expect(sent).toEqual([]);
  expect(await answer(answers, 'Resend')).toEqual({ kind: 'done' });
  expect(added(sent)).toEqual([{ kind: 'capture', properties: { wallet_type: 'transit', material: 'sky', bun_face: 'wow' } }]);
  expect(await answer(answers, 'Resend')).toBeNull();
  expect(fake.wallets.size).toBe(3);
  // Known now: its key is settled, so the same create again is a new command.
  expect(await answer(answers, 'createJar with look')).toEqual({ kind: 'done' });
  const [first, again, after] = sentKeys;
  expect(again).toBe(first);
  expect(after).not.toBe(first);
});

test('a done command settles its key: the same archive again is a new command, and meets the newer version', async () => {
  const fake = fakeWith(OLD);
  const answers = mount(fake);
  expect(await answer(answers, 'archiveOld')).toEqual({ kind: 'done' });
  expect(await answer(answers, 'archiveOld')).toEqual({ kind: 'conflict', current: { ...OLD, archived: true, version: 2, balance_minor: '0' } });
  const [first, second] = keysOf(fake, 'archiveWallet');
  expect(second).not.toBe(first);
});

test('a command changed while another is unconfirmed is a new command, under a new key', async () => {
  const fake = fakeWith(OLD);
  const answers = mount(fake);
  const lost = { kind: 'unconfirmed', message: NOT_CONFIRMED, blocked: false };
  // A create covers its whole request.
  fake.loseResponse('createWallet');
  expect(await answer(answers, 'createJar')).toEqual(lost);
  expect(await answer(answers, 'createPot')).toEqual({ kind: 'done' });
  expect(fake.wallets.has(POT.id)).toBe(true);
  const [jarKey, potKey] = keysOf(fake, 'createWallet');
  expect(potKey).not.toBe(jarKey);
  // An update covers its version and changes: Jotbun has Pocket at version 2 now.
  fake.loseResponse('updateWallet');
  expect(await answer(answers, 'renameCash')).toEqual(lost);
  expect(await answer(answers, 'renamePurse')).toEqual({ kind: 'conflict', current: { ...CASH, name: 'Pocket', version: 2, balance_minor: '235000' } });
  // An archive covers its version.
  fake.loseResponse('archiveWallet');
  expect(await answer(answers, 'archiveOld')).toEqual(lost);
  expect(await answer(answers, 'archiveOldNewer')).toEqual({ kind: 'conflict', current: null });
  const [oldKey, newerKey] = keysOf(fake, 'archiveWallet');
  expect(newerKey).not.toBe(oldKey);
});

test('a create refused over another wallet is a refusal, never a conflict', async () => {
  const fake = createFakeResources(goldenSeed());
  fake.fail('createWallet', 'conflict', { status: 409, code: 'VERSION_CONFLICT', current: { ...CASH, balance_minor: '235000' } });
  const answers = mount(fake);
  expect(await answer(answers, 'createJar')).toEqual({
    kind: 'refused', message: 'This entry could not be saved.', fields: {}, needsReason: false, archiveRefused: false, blocked: false,
  });
});

test('a wallet gone, or archived elsewhere, is a conflict with no wallet to show', async () => {
  const fake = fakeWith(SHUT);
  const answers = mount(fake);
  expect(await answer(answers, 'renameGone')).toEqual({ kind: 'conflict', current: null });
  expect(await answer(answers, 'archiveShut')).toEqual({ kind: 'conflict', current: null });
});

test('a correction Jotbun wants a reason for answers needsReason, with the words on its field', async () => {
  const fake = createFakeResources(goldenSeed());
  const answers = mount(fake);
  expect(await answer(answers, 'correctCash')).toEqual({
    kind: 'refused', message: 'Check the highlighted fields.', fields: { correction_reason: "Choose why you're changing this." }, needsReason: true, archiveRefused: false, blocked: false,
  });
});

test('a refusal that waits on an update says it is blocked', async () => {
  const fake = createFakeResources(goldenSeed());
  fake.fail('updateWallet', 'upgrade_required');
  const answers = mount(fake);
  expect(await answer(answers, 'renameCash')).toEqual({
    kind: 'refused', message: 'Update Jotbun to keep saving. Your entry is kept.', fields: {}, needsReason: false, archiveRefused: false, blocked: true,
  });
});

test('sending is true while a command is out; only a create sends wallet_added', async () => {
  const sent = await recordEvents();
  const fake = fakeWith(OLD, SHUT);
  const answers = mount(fake);
  expect(screen.getByTestId('sending').textContent).toBe('sending false');
  const release = fake.hold('updateWallet');
  press('renameCash');
  await waitFor(() => expect(screen.getByTestId('sending').textContent).toBe('sending true'));
  release();
  await waitFor(() => expect(answers).toEqual([{ kind: 'done' }]));
  await waitFor(() => expect(screen.getByTestId('sending').textContent).toBe('sending false'));
  expect(await answer(answers, 'archiveOld')).toEqual({ kind: 'done' });
  expect(await answer(answers, 'unarchiveShut')).toEqual({ kind: 'done' });
  expect(sent).toEqual([]);
  // The keys: an update covers its version and changes, an archive its version.
  expect(argsOf(fake, 'updateWallet')[0].slice(0, 3)).toEqual([CASH.id, 1, { name: 'Pocket' }]);
  expect(argsOf(fake, 'archiveWallet')[0].slice(0, 2)).toEqual([OLD.id, 1]);
  expect(argsOf(fake, 'unarchiveWallet')[0].slice(0, 2)).toEqual([SHUT.id, 2]);
});

// ---------------------------------------------------------------------------
// The pages' own answers

const footer = () => screen.getByTestId('wallets-footer');
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const typeName = (value: string) => fireEvent.change(screen.getByLabelText('Wallet name'), { target: { value } });
const disabled = (element: HTMLElement) => element.getAttribute('aria-disabled') === 'true';
async function openScreen(fake: Fake) {
  mountScreen(<WalletsScreen now={NOW} />, { resources: fake.resources });
  await screen.findByRole('button', { name: 'Add a wallet' });
}
async function openCreate(fake: Fake) {
  await openScreen(fake);
  click('Add a wallet');
  await screen.findByRole('heading', { name: 'Add a wallet' });
}

test("the archived list says a refused unarchive in Jotbun's words, and offers Unarchive again", async () => {
  const fake = fakeWith(SHUT);
  fake.fail('unarchiveWallet', 'signed_out');
  await openScreen(fake);
  click('Archived wallets (1)');
  const archived = screen.getByTestId('wallets-archived');
  fireEvent.click(within(archived).getByRole('button', { name: 'Unarchive Travel card' }));
  expect(await within(archived).findByText('Sign in again to save.')).toBeTruthy();
  expect(within(archived).queryByRole('button', { name: 'Try again' })).toBeNull();
  fireEvent.click(within(archived).getByRole('button', { name: 'Unarchive Travel card' }));
  expect(await screen.findByRole('button', { name: 'Travel card, balance ฿0.00' })).toBeTruthy();
  const [first, second] = keysOf(fake, 'unarchiveWallet');
  expect(second).not.toBe(first);
});

test('a changed session while a create is frozen keeps it frozen, and Try again waits', async () => {
  const fake = createFakeResources(goldenSeed());
  await openCreate(fake);
  fake.loseResponse('createWallet');
  typeName('Jar');
  click('Create wallet');
  expect(await within(footer()).findByText(NOT_CONFIRMED)).toBeTruthy();
  fake.fail('createWallet', 'session_changed');
  fireEvent.click(within(footer()).getByRole('button', { name: 'Try again' }));
  expect(await within(footer()).findByText('Your session changed. Sign in again to save.')).toBeTruthy();
  expect(disabled(within(footer()).getByRole('button', { name: 'Try again' }))).toBe(true);
  expect(fake.callsOf('createWallet')).toHaveLength(2);
});

test('a create refused until Jotbun is updated says so and holds Create', async () => {
  const fake = createFakeResources(goldenSeed());
  await openCreate(fake);
  fake.fail('createWallet', 'upgrade_required');
  typeName('Jar');
  click('Create wallet');
  expect(await within(footer()).findByText('Update Jotbun to keep saving. Your entry is kept.')).toBeTruthy();
  expect(disabled(within(footer()).getByRole('button', { name: 'Create wallet' }))).toBe(true);
  expect(fake.callsOf('createWallet')).toHaveLength(1);
});

test('an archive that meets a newer version shows theirs, and no "yours"', async () => {
  const fake = fakeWith(OLD);
  await openScreen(fake);
  click('Old card, balance ฿0.00');
  await screen.findByRole('heading', { name: 'Edit wallet' });
  fake.wallets.set(OLD.id, { ...OLD, name: 'Spare card', version: 2 });
  click('Archive wallet');
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Archive Old card' }));
  const conflict = await screen.findByTestId('wallet-conflict');
  expect(within(conflict).getByLabelText('Name. On the server: Spare card.')).toBeTruthy();
  expect(within(conflict).queryByLabelText(/Yours/)).toBeNull();
});

test('a refusal that names a field asks to check the highlighted fields, whatever else it says', async () => {
  const fake = createFakeResources(goldenSeed());
  await openCreate(fake);
  fake.fail('createWallet', 'policy_required', { status: 403, code: 'POLICY_REQUIRED', fields: { name: 'POLICY_REQUIRED' } });
  typeName('Jar');
  click('Create wallet');
  expect(await within(footer()).findByText('Check the highlighted fields.')).toBeTruthy();
  expect(within(footer()).queryByText('Review and accept the updated terms to continue.')).toBeNull();
});
