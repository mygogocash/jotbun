// The record screen's rules, read through a probe: the hook's state is text,
// and the buttons call the hook. RecordScreen's own suite stays the rendering check.
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { Pressable, Text } from 'react-native';

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), replace: vi.fn(), back: vi.fn(), canGoBack: vi.fn(() => true) } }));
vi.mock('expo-router', () => ({ useRouter: () => nav.router }));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

import type { TransactionDto } from '@gogospend/contracts';
import { installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import { createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
import { NOW, RENT, mountScreen } from '../HistoryTestHarness';
import { useRecordActions } from './recordActions';

beforeAll(() => { installBrowserStorage(); });
beforeEach(() => {
  for (const fn of [nav.router.push, nav.router.replace, nav.router.back]) fn.mockReset();
  nav.router.canGoBack.mockReturnValue(true);
});
afterEach(() => { cleanup(); });

const state = () => screen.getByTestId('state').textContent ?? '';

function Probe({ id }: { id: string }) {
  const actions = useRecordActions({ id, mode: 'view', now: NOW });
  const record = actions.loaded.state === 'ready' ? actions.loaded.record : null;
  const editing = actions.editing;
  const conflict = editing?.conflict;
  const retype = () => {
    actions.startEditing();
    for (const key of ['clear', '1', '2', '0', '0', '0'] as const) actions.pressKey(key);
  };
  return (
    <>
      <Text testID="state">{[
        `loaded ${actions.loaded.state}`,
        `deleted ${actions.deleted ? String(actions.deleted.version) : 'none'}`,
        editing
          ? `editing base ${editing.draft.baseVersion} amount ${editing.draft.amountMinor} keypad ${editing.keypad.operands.join(',')} conflict ${conflict ? `${conflict.version} ${conflict.amount_minor}` : 'none'} unconfirmed ${editing.unconfirmed} note ${editing.draft.note}`
          : 'editing none',
        `message ${editing?.message ?? 'none'}`,
      ].join('\n')}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Delete" onPress={() => { if (record) void actions.remove(record); }}><Text>Delete</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Undo" onPress={() => { if (actions.deleted) void actions.restore(actions.deleted); }}><Text>Undo</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Retype" onPress={retype}><Text>Retype</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Save" onPress={() => void actions.submitEdit()}><Text>Save</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Try again" onPress={() => void actions.submitEdit()}><Text>Try again</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Digit" onPress={() => actions.pressKey('5')}><Text>Digit</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Note" onPress={() => actions.changeEditing((current) => ({ ...current, draft: { ...current.draft, note: 'Changed here' } }))}><Text>Note</Text></Pressable>
    </>
  );
}

function mount(id: string) {
  const fake = createFakeResources(goldenSeed());
  mountScreen(<Probe id={id} />, { resources: fake.resources });
  return fake;
}

test('deleting gives an undo that restores with the version the delete returned', async () => {
  const fake = mount(RENT);
  await waitFor(() => expect(state()).toContain('loaded ready'));
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(state()).toContain('deleted 2'));
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  await waitFor(() => expect(fake.callsOf('restoreTransaction')).toHaveLength(1));
  const [id, version, key] = fake.callsOf('restoreTransaction')[0].args;
  expect([id, version]).toEqual([RENT, 2]);
  expect(typeof key).toBe('string');
  expect(fake.callsOf('deleteTransaction')).toHaveLength(1);
});

test('an edit refused with VERSION_CONFLICT keeps both versions and sends nothing more', async () => {
  const fake = mount(RENT);
  await waitFor(() => expect(state()).toContain('loaded ready'));
  fireEvent.click(screen.getByRole('button', { name: 'Retype' }));
  await waitFor(() => expect(state()).toContain('keypad 12000'));
  const rent = fake.records.get(RENT) as TransactionDto;
  fake.records.set(RENT, { ...rent, amount_minor: '1300000', version: 2 });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(state()).toContain('conflict 2 1300000'));
  expect(state()).toContain('base 1 amount 1200000');
  expect(fake.callsOf('updateTransaction')).toHaveLength(1);
  expect(fake.callsOf('updateTransaction')[0].args[1]).toBe(1);
});

test('an edit whose answer never came is frozen, and Try again resends the same command key', async () => {
  const fake = mount(RENT);
  await waitFor(() => expect(state()).toContain('loaded ready'));
  fake.loseResponse('updateTransaction');
  fireEvent.click(screen.getByRole('button', { name: 'Retype' }));
  await waitFor(() => expect(state()).toContain('keypad 12000'));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(state()).toContain('unconfirmed true'));
  expect(state()).toContain('Not confirmed yet. Your entry is kept; try again.');
  const frozen = state();
  fireEvent.click(screen.getByRole('button', { name: 'Digit' }));
  expect(state()).toBe(frozen);
  fireEvent.click(screen.getByRole('button', { name: 'Note' }));
  expect(state()).toBe(frozen);
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(fake.callsOf('updateTransaction')).toHaveLength(2));
  const [first, second] = fake.callsOf('updateTransaction');
  expect(second.args).toEqual(first.args);
});
