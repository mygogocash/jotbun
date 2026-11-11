// 1C-T8: the devices draft (sa-account's methods, sessions as devices): this
// phone is marked and never signed out here; another device, or all the
// others, are signed out after asking; linking and removing a method run the
// fresh sign-in first (R43); the last Apple or Google method has no remove.
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';

vi.mock('expo-router', () => import('@mobile/dev/catalogue/routerTestStub'));
vi.mock('expo-router/build/Route', () => import('@mobile/dev/catalogue/routerTestStub'));
vi.mock('react-native-safe-area-context', () => import('@mobile/dev/catalogue/safeAreaTestStub'));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));

import type { DeviceDto, SignInMethod } from '@mobile/auth/betterAuthPort';
import type { FreshOutcome } from '@mobile/auth/credentialProvider';
import type { StoredSession } from '@mobile/auth/sessionStore';
import { mountInApp, settle } from '@mobile/dev/catalogue/catalogueTestHarness';
import { installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import { DevicesScreen } from './DevicesScreen';
import type { DevicesPort } from './DevicesScreen';

beforeAll(() => { installBrowserStorage(); });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

const ACCOUNT: StoredSession = { accountId: '0a000000-0000-4000-8000-00000000000a', sessionId: '0b000000-0000-4000-8000-00000000000b', email: 'karn@icloud.com', method: 'apple' };
const THIS: DeviceDto = { id: '0b000000-0000-4000-8000-00000000000b', current: true, signed_in_at: '2026-11-01T02:00:00.000Z', last_active_at: '2026-11-09T02:00:00.000Z', user_agent: 'Jotbun/1 (iPhone; iOS 26.1)' };
const ANDROID: DeviceDto = { id: '0e000000-0000-4000-8000-00000000000e', current: false, signed_in_at: '2026-10-20T02:00:00.000Z', last_active_at: '2026-11-08T02:00:00.000Z', user_agent: 'Jotbun/1 (Linux; Android 15)' };
const MAC: DeviceDto = { id: '0f000000-0000-4000-8000-00000000000f', current: false, signed_in_at: '2026-10-02T02:00:00.000Z', last_active_at: '2026-10-30T02:00:00.000Z', user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_1)' };

/** The port and a log of what changed, in order; `fresh` is what the fresh sign-in answers. */
function setup({ linked = ['apple', 'email'], fresh = 'fresh' }: { linked?: readonly SignInMethod[]; fresh?: FreshOutcome } = {}) {
  const log: string[] = [];
  let now = [...linked];
  const port = {
    methods: ['apple', 'google', 'email'] as const,
    devices: vi.fn(async (): Promise<DeviceDto[]> => [THIS, ANDROID, MAC]),
    signOutDevice: vi.fn(async (id: string) => { log.push(`signOutDevice:${id}`); }),
    signOutOtherDevices: vi.fn(async () => {
      log.push('signOutOtherDevices');
      return 2;
    }),
    linkMethod: vi.fn(async (method: 'apple' | 'google') => {
      log.push(`link:${method}`);
      now = [method, ...now];
    }),
    unlinkMethod: vi.fn(async (method: 'apple' | 'google') => {
      log.push(`unlink:${method}`);
      now = now.filter((item) => item !== method);
    }),
    linkedMethods: vi.fn(async (): Promise<SignInMethod[]> => [...now]),
  } satisfies DevicesPort;
  const freshSignIn = vi.fn(async (): Promise<FreshOutcome> => {
    log.push('fresh');
    return fresh;
  });
  return { port, freshSignIn, log };
}

async function open(options: Parameters<typeof setup>[0] = {}) {
  const fake = setup(options);
  mountInApp(<DevicesScreen port={fake.port} freshSignIn={fake.freshSignIn} account={ACCOUNT} />);
  await settle();
  await screen.findByText('iPhone · This phone');
  return fake;
}

const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
const dialog = (name: string) => screen.getByRole('dialog', { name });

test('this device is marked and cannot be signed out here', async () => {
  await open();
  const row = screen.getByTestId(`device-${THIS.id}`);
  expect(within(row).getByText('To sign out this phone, use Sign out in Settings.')).toBeTruthy();
  expect(within(row).queryAllByRole('button')).toEqual([]);
  expect(screen.getByRole('button', { name: 'Sign out Android' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Sign out Mac' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Sign out iPhone' })).toBeNull();
});

test('signing out another device asks first, then calls signOutDevice once and removes the row', async () => {
  const { port, log } = await open();
  press('Sign out Android');
  expect(port.signOutDevice).not.toHaveBeenCalled();
  const asking = dialog('Sign out Android?');
  expect(within(asking).getByText('That device must sign in again. Records it already sent stay in your account.')).toBeTruthy();
  fireEvent.click(within(asking).getByRole('button', { name: 'Sign out' }));
  await flush();
  expect(port.signOutDevice).toHaveBeenCalledTimes(1);
  expect(log).toEqual([`signOutDevice:${ANDROID.id}`]);
  expect(screen.queryByTestId(`device-${ANDROID.id}`)).toBeNull();
  expect(screen.getByTestId(`device-${MAC.id}`)).toBeTruthy();
  expect(screen.getByTestId(`device-${THIS.id}`)).toBeTruthy();
});

test('signing out the other devices calls once', async () => {
  const { port } = await open();
  press('Sign out the other devices');
  expect(port.signOutOtherDevices).not.toHaveBeenCalled();
  fireEvent.click(within(dialog('Sign out the other devices?')).getByRole('button', { name: 'Sign out' }));
  await flush();
  expect(port.signOutOtherDevices).toHaveBeenCalledTimes(1);
  expect(port.signOutDevice).not.toHaveBeenCalled();
  expect(screen.queryByTestId(`device-${ANDROID.id}`)).toBeNull();
  expect(screen.queryByTestId(`device-${MAC.id}`)).toBeNull();
  expect(screen.getByTestId(`device-${THIS.id}`)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Sign out the other devices' })).toBeNull();
});

test('linking Google runs the fresh sign-in first, then linkMethod once', async () => {
  const { port, freshSignIn, log } = await open();
  const link = screen.getByRole('button', { name: 'Link Google' });
  act(() => {
    fireEvent.click(link);
    fireEvent.click(link);
  });
  await flush();
  expect(freshSignIn).toHaveBeenCalledTimes(1);
  expect(port.linkMethod).toHaveBeenCalledTimes(1);
  expect(log).toEqual(['fresh', 'link:google']);
  expect(await screen.findByText('Sign in with Google')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Link Google' })).toBeNull();
  cleanup();
  // A fresh sign-in that does not go through links nothing, and says so.
  const refused = await open({ fresh: 'failed' });
  press('Link Google');
  await flush();
  expect(refused.port.linkMethod).not.toHaveBeenCalled();
  expect(screen.getByText("Confirm it's you first. Nothing changed.")).toBeTruthy();
});

test('removing a method runs the fresh sign-in first', async () => {
  const { port, log } = await open({ linked: ['apple', 'google', 'email'] });
  press('Remove Google');
  expect(log).toEqual([]);
  fireEvent.click(within(dialog('Remove Google?')).getByRole('button', { name: 'Remove Google' }));
  await flush();
  expect(port.unlinkMethod).toHaveBeenCalledTimes(1);
  expect(log).toEqual(['fresh', 'unlink:google']);
  await flush();
  expect(screen.queryByText('Sign in with Google')).toBeNull();
});

test('the last linked method has no remove action', async () => {
  await open({ linked: ['apple', 'email'] });
  expect(screen.getByText('Sign in with Apple')).toBeTruthy();
  expect(screen.getByText('Sign in with an email code')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull();
  cleanup();
  await open({ linked: ['apple', 'google', 'email'] });
  expect(screen.getAllByRole('button', { name: /^Remove / }).map((button) => button.getAttribute('aria-label'))).toEqual(['Remove Apple', 'Remove Google']);
});

// The 1C-T8 fix round (review m1, RV6): Link is offered only for a method this build runs.
test('linking is offered only for a method this build runs', async () => {
  // A build with Google and no Apple (Android, K15), and an account that already has Google: nothing to link.
  const fake = setup({ linked: ['google', 'email'] });
  const port = { ...fake.port, methods: ['google', 'email'] as const } satisfies DevicesPort;
  mountInApp(<DevicesScreen port={port} freshSignIn={fake.freshSignIn} account={{ ...ACCOUNT, email: 'karn@gmail.com', method: 'google' }} />);
  await settle();
  await screen.findByTestId('devices-list');
  expect(screen.getByText('Sign in with Google')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /^Link / })).toBeNull();
});
