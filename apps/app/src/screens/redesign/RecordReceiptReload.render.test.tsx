// Record and its receipt panel (R7): when the panel changes the record, Record
// reads it again, so its own Edit and Delete never send a stale version.
import { fireEvent, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
import { RecordScreen } from './RecordScreen';
import { FOOD_ID, NOW, mountScreen } from './HistoryTestHarness';

vi.mock('expo-router', () => import('@mobile/dev/catalogue/routerTestStub'));
vi.mock('expo-router/build/Route', () => import('@mobile/dev/catalogue/routerTestStub'));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));
vi.mock('./import/RecordReceipt', async () => {
  const { createElement } = await import('react');
  const { Pressable, Text } = await import('react-native');
  return {
    RecordReceipt: ({ onChanged, version }: { onChanged?: (version: number) => void; version: number }) =>
      createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Receipt changed', onPress: () => onChanged?.(version + 1) }, createElement(Text, null, `receipt at ${version}`)),
  };
});

test('a receipt change makes Record read the record again', async () => {
  const fake = createFakeResources(goldenSeed());
  mountScreen(<RecordScreen id={FOOD_ID} now={NOW} />, { resources: fake.resources });
  expect(await screen.findByText('receipt at 1')).toBeTruthy();
  const reads = fake.callsOf('transaction').length;
  fireEvent.click(screen.getByRole('button', { name: 'Receipt changed' }));
  await vi.waitFor(() => expect(fake.callsOf('transaction').length).toBe(reads + 1));
});
