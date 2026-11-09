// 1C-T8: the account-exists draft (C14, R54): each method the server named,
// in its order, as an action, the email code always, and one choice reported.
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';

vi.mock('expo-router', () => import('@mobile/dev/catalogue/routerTestStub'));
vi.mock('expo-router/build/Route', () => import('@mobile/dev/catalogue/routerTestStub'));
vi.mock('react-native-safe-area-context', () => import('@mobile/dev/catalogue/safeAreaTestStub'));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));

import type { SignInMethod } from '@mobile/auth/betterAuthPort';
import { mountInApp, settle } from '@mobile/dev/catalogue/catalogueTestHarness';
import { installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import { AccountExistsScreen } from './AccountExistsScreen';

beforeAll(() => { installBrowserStorage(); });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

const LABELS: Readonly<Record<SignInMethod, string>> = { apple: 'Continue with Apple', google: 'Continue with Google', email: 'Continue with email' };
/** The method buttons, in the order the screen draws them. */
const methodButtons = () => screen.getAllByRole('button').filter((button) => Object.values(LABELS).includes(button.getAttribute('aria-label') ?? ''));
const names = () => methodButtons().map((button) => button.getAttribute('aria-label'));

async function open(methods: readonly SignInMethod[], onMethod = vi.fn()) {
  const view = mountInApp(<AccountExistsScreen methods={methods} onMethod={onMethod} onBack={vi.fn()} />);
  await settle();
  return { view, onMethod };
}

test('it names Apple first when the account uses Apple', async () => {
  const { view } = await open(['apple', 'email']);
  expect(screen.getByRole('heading', { name: 'You already have an account' })).toBeTruthy();
  expect(names()).toEqual([LABELS.apple, LABELS.email]);
  expect(screen.getByText('Use the same Apple ID as before.')).toBeTruthy();
  view.unmount();
  await open(['google', 'apple']);
  expect(names()).toEqual([LABELS.google, LABELS.apple, LABELS.email]);
});

test('it always offers the email code', async () => {
  const { view } = await open(['apple']);
  expect(names()).toEqual([LABELS.apple, LABELS.email]);
  expect(screen.getByText('We send a 6-digit code to this email.')).toBeTruthy();
  view.unmount();
  await open(['email', 'email']);
  expect(names()).toEqual([LABELS.email]);
});

test('choosing a method reports it once', async () => {
  const { onMethod } = await open(['apple', 'email']);
  const apple = screen.getByRole('button', { name: LABELS.apple });
  const email = screen.getByRole('button', { name: LABELS.email });
  // Three presses before the screen draws again, as a fast double tap lands.
  act(() => {
    fireEvent.click(apple);
    fireEvent.click(apple);
    fireEvent.click(email);
  });
  expect(onMethod).toHaveBeenCalledTimes(1);
  expect(onMethod).toHaveBeenCalledWith('apple');
  // Afterwards the others wait: nothing more is reported.
  fireEvent.click(screen.getByRole('button', { name: LABELS.email }));
  expect(onMethod).toHaveBeenCalledTimes(1);
});
