// Review m9: on native the provider reads and writes the secure store. A store
// that rejects (a locked keychain, a storage error) must never surface as an
// unhandled rejection: the bun keeps the default, and a choice made on screen
// still applies for the session.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Platform, Pressable, Text } from 'react-native';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { BunIntensityProvider, useBunIntensity } from './BunIntensityProvider';

const store = vi.hoisted(() => ({
  getItemAsync: vi.fn(async () => { throw new Error('keychain locked'); }),
  setItemAsync: vi.fn(async () => { throw new Error('keychain locked'); }),
}));
vi.mock('expo-secure-store', () => store);

const os = Platform.OS;
const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => { unhandled.push(reason); };

beforeEach(() => {
  unhandled.length = 0;
  process.on('unhandledRejection', onUnhandled);
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true, writable: true });
});
afterEach(() => {
  cleanup();
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true, writable: true });
  process.off('unhandledRejection', onUnhandled);
});

function Probe() {
  const { intensity, setIntensity } = useBunIntensity();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Quiet" onPress={() => setIntensity('quiet')}>
      <Text>{`intensity:${intensity}`}</Text>
    </Pressable>
  );
}

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

test('a secure store that rejects keeps the default bun and never leaves an unhandled rejection', async () => {
  render(<BunIntensityProvider><Probe /></BunIntensityProvider>);
  await settle();
  expect(store.getItemAsync).toHaveBeenCalled();
  expect(screen.getByText('intensity:full')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Quiet' }));
  await settle();
  expect(store.setItemAsync).toHaveBeenCalled();
  // The choice still applies for this session, though it could not be stored.
  expect(screen.getByText('intensity:quiet')).toBeTruthy();
  await settle();
  expect(unhandled).toEqual([]);
});
