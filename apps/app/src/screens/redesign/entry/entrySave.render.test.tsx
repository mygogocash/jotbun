// useEntrySave, probed without the Quick add screen: a fixed expense draft,
// the diary or the online command, and what the caller is told afterwards.
// Then Quick add itself, for what the move must keep: a sum worked out the
// moment Save is pressed, and Tell Bun's often-logged chips.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReactElement } from 'react';
import { IntlProvider } from 'react-intl';
import { Pressable, Text } from 'react-native';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';

vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: () => undefined, replace: () => undefined, back: () => undefined }), useLocalSearchParams: () => ({}) }));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('react-native-safe-area-context', () => import('../../../dev/catalogue/safeAreaTestStub'));

import type { TransactionDto, WalletSnapshot } from '@gogospend/contracts';
import { haptics } from '@mobile/lib/haptics';
import { installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import type { QuickAddDraft } from '@mobile/spend/v1/redesign/quickAddModel';
import { entry, FOOD, WALLETS } from '@mobile/spend/v1/redesign/testing/fixtures';
import { SpendDiaryProvider } from '@mobile/spend/v1/SpendDiaryContext';
import type { SpendDiary } from '@mobile/spend/v1/spendDiary';
import { SpendV1Provider } from '@mobile/spend/v1/SpendV1Context';
import { createFakeDiary } from '@mobile/spend/v1/testing/fakeDiary';
import { BUILTINS, createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
import type { SpendV1Resources } from '@mobile/spend/v1/resources';
import { EMPTY_KEYPAD, applyKey, keypadDisplay, keypadFromMinor } from '@mobile/ui/keypadExpression';
import type { KeypadKey, KeypadState } from '@mobile/ui/keypadExpression';
import { mountScreen, NOW } from '../HistoryTestHarness';
import { QuickAddScreen } from '../QuickAddScreen';

import type { EntryTrack, SaveAttempt, SavedEntry } from './entrySave';
import { useEntrySave } from './entrySave';

const TODAY = '2026-10-18';
const RECORD_ID = '00000000-0000-4000-8000-0000000000a1';
const COMMAND_ID = '00000000-0000-4000-8000-0000000000a2';

function expenseDraft(): QuickAddDraft {
  return {
    mode: 'create',
    recordId: RECORD_ID,
    commandId: COMMAND_ID,
    type: 'expense',
    amountMinor: '6500',
    occurredOn: TODAY,
    walletId: WALLETS[0].id,
    categoryByType: { expense: FOOD.id, income: null },
    fromWalletId: WALLETS[0].id,
    toWalletId: WALLETS[1].id,
    note: '',
    merchant: '',
  };
}

const KEYPAD: KeypadState = keypadFromMinor('6500');
/** 12.50 + 7.25, typed and not yet worked out. */
const SUM_KEYS: readonly KeypadKey[] = ['1', '2', '.', '5', '0', 'add', '7', '.', '2', '5'];
const SUM: KeypadState = SUM_KEYS.reduce((state, key) => applyKey(state, key), EMPTY_KEYPAD);

beforeAll(() => {
  installBrowserStorage();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

function Probe({
  draft,
  wallets,
  keypad,
  track,
  onSaved,
  savedHaptic,
  onAttempt,
}: {
  draft: QuickAddDraft;
  wallets: readonly WalletSnapshot[];
  keypad: KeypadState;
  track?: EntryTrack;
  onSaved?: (saved: SavedEntry) => void;
  savedHaptic?: 'quickAdd' | 'success';
  onAttempt?: (attempt: SaveAttempt) => void;
}) {
  const entrySave = useEntrySave({ today: TODAY, onSaved, savedHaptic });
  return (
    <>
      <Text testID="status">{entrySave.status}</Text>
      <Text testID="message">{entrySave.message ?? ''}</Text>
      <Text testID="locked">{entrySave.locked ? 'locked' : 'open'}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Save entry"
        onPress={() => { void entrySave.save({ draft, keypad, wallets, track }).then(onAttempt); }}
      >
        <Text>Save entry</Text>
      </Pressable>
    </>
  );
}

function mount(ui: ReactElement, resources: SpendV1Resources, diary: SpendDiary | null = null) {
  return render(
    <IntlProvider locale="en">
      <SpendV1Provider resources={resources}>
        <SpendDiaryProvider diary={diary}>{ui}</SpendDiaryProvider>
      </SpendV1Provider>
    </IntlProvider>,
  );
}

const saveButton = () => screen.getByRole('button', { name: 'Save entry' });
const resources = () => createFakeResources({ wallets: [...WALLETS], categories: [FOOD] }).resources;

test('a device save calls onSaved once, after the diary kept it', async () => {
  const onSaved = vi.fn();
  const diary = createFakeDiary({ phase: 'ready', wallets: [...WALLETS], categories: [FOOD] });
  const original = diary.diary.saveDraft.bind(diary.diary);
  let release!: () => void;
  diary.diary.saveDraft = (saved, commandId) => new Promise<void>((resolve, reject) => {
    release = () => { void original(saved, commandId).then(resolve, reject); };
  });
  mount(<Probe draft={expenseDraft()} wallets={WALLETS} keypad={KEYPAD} onSaved={onSaved} />, resources(), diary.diary);
  fireEvent.click(saveButton());
  // The diary holds the save: nothing is reported until it keeps the entry.
  await waitFor(() => expect(release).toBeTypeOf('function'));
  expect(onSaved).not.toHaveBeenCalled();
  await act(async () => { release(); });
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(onSaved.mock.calls[0][0]).toMatchObject({ via: 'device', track: null });

  cleanup();
  const rejected = vi.fn();
  const failing = createFakeDiary({ phase: 'ready', wallets: [...WALLETS], categories: [FOOD] });
  failing.failNextSave(new Error('disk full'));
  mount(<Probe draft={expenseDraft()} wallets={WALLETS} keypad={KEYPAD} onSaved={rejected} />, resources(), failing.diary);
  fireEvent.click(saveButton());
  expect(await screen.findByText("Couldn't save this entry on the device. Nothing was saved.")).toBeTruthy();
  expect(rejected).not.toHaveBeenCalled();
});

test('an online save that may have committed is frozen, and saving again resends the same command key', async () => {
  const fake = createFakeResources({ wallets: [...WALLETS], categories: [FOOD] });
  fake.loseResponse('createTransaction');
  mount(<Probe draft={expenseDraft()} wallets={WALLETS} keypad={KEYPAD} />, fake.resources, null);
  fireEvent.click(saveButton());
  await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unconfirmed'));
  expect(screen.getByTestId('locked').textContent).toBe('locked');
  expect(fake.callsOf('createTransaction')).toHaveLength(1);
  fireEvent.click(saveButton());
  await waitFor(() => expect(fake.callsOf('createTransaction')).toHaveLength(2));
  const [first, second] = fake.callsOf('createTransaction');
  expect(second.args[1]).toBe(first.args[1]);
  expect(second.args[0]).toEqual(first.args[0]);
});

test('a create refused because the record already exists with other details is a conflict, never saved', async () => {
  const onSaved = vi.fn();
  const draft = expenseDraft();
  const fake = createFakeResources({ wallets: [...WALLETS], categories: [FOOD] });
  fake.records.set(draft.recordId, entry({
    id: draft.recordId,
    amount_minor: '100',
    occurred_on: TODAY,
    wallet_id: WALLETS[0].id,
    category_id: FOOD.id,
  }));
  mount(<Probe draft={draft} wallets={WALLETS} keypad={KEYPAD} onSaved={onSaved} />, fake.resources, null);
  fireEvent.click(saveButton());
  await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('conflict'));
  expect(onSaved).not.toHaveBeenCalled();
});

test('the track a caller passes reaches onSaved, and a resend keeps the first attempt\'s track', async () => {
  const first: EntryTrack = { source: 'typed', categoryKey: 'food', openedAt: 1_700_000_000_000 };
  const second: EntryTrack = { source: 'tell_bun', categoryKey: null, openedAt: 1_700_000_100_000 };
  const onSaved = vi.fn();
  const fake = createFakeResources({ wallets: [...WALLETS], categories: [FOOD] });
  fake.loseResponse('createTransaction');
  const probe = (track: EntryTrack) => (
    <IntlProvider locale="en">
      <SpendV1Provider resources={fake.resources}>
        <SpendDiaryProvider diary={null}>
          <Probe draft={expenseDraft()} wallets={WALLETS} keypad={KEYPAD} track={track} onSaved={onSaved} />
        </SpendDiaryProvider>
      </SpendV1Provider>
    </IntlProvider>
  );
  const view = render(probe(first));
  fireEvent.click(saveButton());
  await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unconfirmed'));
  expect(onSaved).not.toHaveBeenCalled();
  view.rerender(probe(second));
  fireEvent.click(saveButton());
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(onSaved.mock.calls[0][0].track).toEqual(first);
  expect(onSaved.mock.calls[0][0].via).toBe('online');
});

test('savedHaptic success plays success for a phone-kept save; Quick add\'s default stays light', async () => {
  const success = vi.spyOn(haptics, 'success');
  const light = vi.spyOn(haptics, 'light');
  const diary = () => createFakeDiary({ phase: 'ready', wallets: [...WALLETS], categories: [FOOD] }).diary;
  mount(
    <Probe draft={expenseDraft()} wallets={WALLETS} keypad={KEYPAD} savedHaptic="success" />,
    resources(),
    diary(),
  );
  fireEvent.click(saveButton());
  await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('saved'));
  expect(success).toHaveBeenCalled();
  expect(light).not.toHaveBeenCalled();

  cleanup();
  success.mockClear();
  light.mockClear();
  mount(<Probe draft={expenseDraft()} wallets={WALLETS} keypad={KEYPAD} />, resources(), diary());
  fireEvent.click(saveButton());
  await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('saved'));
  expect(light).toHaveBeenCalled();
  expect(success).not.toHaveBeenCalled();
});

test('the attempt hands back the keypad as Save leaves it: a sum worked out, a plain amount as typed', async () => {
  const attempts: SaveAttempt[] = [];
  mount(<Probe draft={expenseDraft()} wallets={WALLETS} keypad={SUM} onAttempt={(attempt) => attempts.push(attempt)} />, resources(), null);
  fireEvent.click(saveButton());
  await waitFor(() => expect(attempts).toHaveLength(1));
  expect(screen.getByTestId('status').textContent).toBe('saved');
  expect(attempts[0].settledKeypad ? keypadDisplay(attempts[0].settledKeypad) : null).toBe('19.75');

  cleanup();
  attempts.length = 0;
  mount(<Probe draft={expenseDraft()} wallets={WALLETS} keypad={KEYPAD} onAttempt={(attempt) => attempts.push(attempt)} />, resources(), null);
  fireEvent.click(saveButton());
  await waitFor(() => expect(attempts).toHaveLength(1));
  expect(attempts[0].settledKeypad).toBeNull();
});

test('Quick add shows a sum worked out the moment Save is pressed, while the save is still on its way', async () => {
  const fake = createFakeResources(goldenSeed());
  mountScreen(<QuickAddScreen now={NOW} />, { resources: fake.resources });
  await screen.findByRole('group', { name: 'Keypad' });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  for (const name of ['1', '2', 'Decimal point', '5', '0', 'Plus sign', '7', 'Decimal point', '2', '5']) {
    fireEvent.click(within(screen.getByRole('group', { name: 'Keypad' })).getByRole('button', { name }));
  }
  const amount = () => screen.getByTestId('quick-add-amount').textContent ?? '';
  expect(amount()).toContain('12.50 + 7.25');
  const release = fake.hold('createTransaction');
  fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));
  expect(await screen.findByRole('button', { name: 'Saving…' })).toBeTruthy();
  expect(amount()).not.toContain('12.50 + 7.25');
  expect(amount()).toContain('19.75');
  await act(async () => { release(); });
  expect(await screen.findByText('Saved')).toBeTruthy();
  expect(fake.callsOf('createTransaction')[0].args[0]).toMatchObject({ amount_minor: '1975' });
});

test('the moved rules keep money out of floating point', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const file of ['entryHelpers.ts', 'entryReferences.ts', 'entrySave.ts']) {
    const source = readFileSync(join(here, file), 'utf8');
    expect(source, file).not.toMatch(/parseFloat|parseInt|toFixed|Number\(|Math\./);
  }
});

test("Quick add still offers Tell Bun's often-logged chips from the records it loaded", async () => {
  const seed = goldenSeed();
  const lunch = (n: number, occurredOn: string) => ({
    id: `0000000b-0000-4000-8000-0000000000e${n}`, type: 'expense', amount_minor: '5000', occurred_on: occurredOn, wallet_id: seed.wallets[0].id,
    category_id: BUILTINS[0].id, note: null, merchant: 'ข้าวมันไก่', deleted_at: null, version: 1,
  }) as TransactionDto;
  const fake = createFakeResources({ wallets: seed.wallets, records: [...seed.records, lunch(1, '2026-09-27'), lunch(2, '2026-09-28')] });
  mountScreen(<QuickAddScreen now={NOW} />, { resources: fake.resources });
  await screen.findByRole('group', { name: 'Keypad' });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  fireEvent.click(screen.getByTestId('quick-add-tell-bun'));
  expect(await screen.findByText('Often logged:')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'ข้าวมันไก่ 50' })).toBeTruthy();
});
