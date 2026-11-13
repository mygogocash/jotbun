// P4-T17: the push host and the permission hook (render). expo-notifications,
// expo-constants, expo-crypto, expo-linking and the router are fakes held in
// `phone`; the shared slip client is a fake whose registerDevice records each
// registration. The host's lock cover comes from a LockCoverContext the test
// sets, as P2-T33's gate gives it in the app. Waits are 1 s; a negative is
// read only after a later step that comes after it in the same order.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IntlProvider } from 'react-intl';
import { AppState, Platform, Text } from 'react-native';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { DeviceRegistration } from '@gogospend/contracts';

type Handler = { handleNotification: (notification: unknown) => Promise<unknown> };
type Listener = (response: unknown) => void;
type Answer = { granted: boolean; canAskAgain: boolean; status: string; expires: string };

const phone = vi.hoisted(() => ({
  token: 'ExponentPushToken[cccccccccccccccccccccc]',
  handler: null as Handler | null,
  handlers: 0,
  listeners: new Set<(response: unknown) => void>(),
  opened: null as unknown,
  openedThrows: false,
  cleared: 0,
  answer: { granted: true, canAskAgain: true, status: 'granted', expires: 'never' } as { granted: boolean; canAskAgain: boolean; status: string; expires: string },
  reads: 0,
  readThrows: false,
  requests: [] as unknown[],
  requestThrows: false,
  tokens: [] as string[],
  extra: null as unknown,
  configReads: 0,
  configThrows: false,
  pushed: [] as unknown[],
  settings: 0,
  settingsThrow: false,
  registered: [] as unknown[],
  refuse: false,
  refused: 0,
}));

vi.mock('expo-notifications', () => ({
  setNotificationHandler: (handler: Handler) => {
    phone.handler = handler;
    phone.handlers += 1;
  },
  addNotificationResponseReceivedListener: (listener: Listener) => {
    phone.listeners.add(listener);
    return { remove: () => { phone.listeners.delete(listener); } };
  },
  getLastNotificationResponse: () => {
    if (phone.openedThrows) throw new Error('not available');
    return phone.opened;
  },
  clearLastNotificationResponse: () => {
    phone.opened = null;
    phone.cleared += 1;
  },
  getPermissionsAsync: async () => {
    phone.reads += 1;
    if (phone.readThrows) throw new Error('not available');
    return phone.answer;
  },
  requestPermissionsAsync: async (request: unknown) => {
    phone.requests.push(request);
    if (phone.requestThrows) throw new Error('not available');
    return phone.answer;
  },
  getExpoPushTokenAsync: async ({ projectId }: { projectId: string }) => {
    phone.tokens.push(projectId);
    return { type: 'expo', data: phone.token };
  },
}));
vi.mock('expo-constants', () => ({
  default: {
    get expoConfig() {
      phone.configReads += 1;
      if (phone.configThrows) throw new Error('no config');
      return { extra: phone.extra };
    },
  },
}));
vi.mock('expo-crypto', async () => {
  const { createHash: hash } = await import('node:crypto');
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    digest: async (_algorithm: string, data: Uint8Array) => Uint8Array.from(hash('sha256').update(data).digest()).buffer,
  };
});
vi.mock('expo-linking', () => ({
  openSettings: async () => {
    phone.settings += 1;
    if (phone.settingsThrow) throw new Error('cannot open');
  },
}));
vi.mock('expo-router', () => ({ router: { push: (href: unknown) => { phone.pushed.push(href); } } }));
vi.mock('@mobile/api/sharedV1', () => ({
  getSharedSlipResources: () => ({
    registerDevice: async (registration: unknown) => {
      if (phone.refuse) {
        phone.refused += 1;
        throw new Error('refused');
      }
      phone.registered.push(registration);
    },
  }),
}));

import { recordAnalytics } from '@mobile/analytics/testing/recordAnalytics';
import { setSession } from '@mobile/auth/session';
import { LockCoverContext } from '@mobile/ui/lockCover';
import { installStoreBackend } from '@mobile/wallet/store/deviceWalletStore';
import { PushHost } from './PushHost';
import { useNotificationPermission } from './notificationPermission';

const ACCOUNT = '00000000-0000-4000-8000-0000000000aa';
const PROJECT = '0b5c7a1e-2d3f-4a6b-8c9d-0e1f2a3b4c5d';
const JOB = '6a7b8c9d-0e1f-4a2b-9c3d-4e5f6a7b8c9d';
const EXPORT = '3f2b1c0d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const RECORD_KEY = 'jotbun.wallet.push-device';
const WAIT = { timeout: 1000 };
const GRANTED: Answer = { granted: true, canAskAgain: true, status: 'granted', expires: 'never' };
const DENIED: Answer = { granted: false, canAskAgain: false, status: 'denied', expires: 'never' };
const SILENT = { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false };
const RECAP = { pathname: '/spend/recap/[month]', params: { month: '2026-09' } };

const stored = new Map<string, string>();
const rejections: unknown[] = [];
const onRejection = (reason: unknown) => { rejections.push(reason); };
const os = Platform.OS;
const setPlatform = (value: string) => Object.defineProperty(Platform, 'OS', { value, configurable: true, writable: true });
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const signIn = (binding: string) => act(() => { setSession({ access_token: `token-${binding}`, userId: ACCOUNT, binding }); });
const registered = () => phone.registered as DeviceRegistration[];

beforeEach(() => {
  Object.assign(phone, {
    handler: null, handlers: 0, opened: null, openedThrows: false, cleared: 0, answer: GRANTED, reads: 0, readThrows: false,
    requests: [], requestThrows: false, tokens: [], extra: { eas: { projectId: PROJECT } }, configReads: 0, configThrows: false,
    pushed: [], settings: 0, settingsThrow: false, registered: [], refuse: false, refused: 0,
  });
  phone.listeners.clear();
  stored.clear();
  rejections.length = 0;
  process.on('unhandledRejection', onRejection);
  installStoreBackend({
    getItem: async (key) => stored.get(key) ?? null,
    setItem: async (key, value) => { stored.set(key, value); },
    removeItem: async (key) => { stored.delete(key); },
    getAllKeys: async () => [...stored.keys()],
    multiRemove: async (keys) => { for (const key of keys) stored.delete(key); },
  });
  setPlatform('ios');
});
afterEach(() => {
  cleanup();
  setSession(null);
  installStoreBackend(null);
  process.off('unhandledRejection', onRejection);
  setPlatform(os);
  vi.restoreAllMocks();
});

function Host({ hidden = false, locale = 'th' }: { hidden?: boolean; locale?: string }) {
  return (
    <IntlProvider locale={locale}>
      <LockCoverContext.Provider value={{ hidden }}>
        <PushHost />
      </LockCoverContext.Provider>
    </IntlProvider>
  );
}

const response = (identifier: string, data?: Record<string, unknown>) => ({
  actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
  notification: { date: 0, request: { identifier, trigger: null, content: { title: null, subtitle: null, body: null, categoryIdentifier: null, sound: null, ...(data === undefined ? {} : { data }) } } },
});
const tap = (identifier: string, data?: Record<string, unknown>) => act(() => {
  for (const listener of [...phone.listeners]) listener(response(identifier, data));
});
const installed = () => waitFor(() => expect(phone.listeners.size).toBe(1), WAIT);

test('a tap waits for the lock to open before it routes', async () => {
  const view = render(<Host hidden />);
  await installed();
  tap('push-1', { kind: 'slips_ready', ref: null });
  // A local reminder tapped under the lock opens nothing, and the push keeps its route.
  tap('reminder-1');
  expect(phone.pushed).toEqual([]);
  view.rerender(<Host />);
  expect(phone.pushed).toEqual(['/spend/slips/review']);
  expect(phone.cleared).toBe(1);
  // Covered and uncovered again, it does not go twice; a tap with the app open goes at once.
  view.rerender(<Host hidden />);
  view.rerender(<Host />);
  tap('push-2', { kind: 'month_recap_ready', ref: '2026-09' });
  expect(phone.pushed).toEqual(['/spend/slips/review', RECAP]);
});

test('while the app is open slips ready goes only to the list, other pushes show a banner, and a local reminder stays hidden', async () => {
  render(<Host />);
  await waitFor(() => expect(phone.handler).not.toBeNull(), WAIT);
  const show = (data?: Record<string, unknown>) => Promise.resolve(phone.handler?.handleNotification(response('shown', data).notification)).catch(() => 'threw');
  expect(await show({ kind: 'slips_ready', ref: null })).toEqual({ ...SILENT, shouldShowList: true });
  for (const data of [{ kind: 'statement_parsed', ref: JOB }, { kind: 'export_ready', ref: EXPORT }, { kind: 'month_recap_ready', ref: '2026-09' }]) {
    expect(await show(data)).toEqual({ ...SILENT, shouldShowBanner: true, shouldShowList: true });
  }
  // P2-T36's local reminder carries no push data, and a malformed push is not one either.
  for (const data of [undefined, {}, { kind: 'slips_ready', ref: JOB }]) expect(await show(data)).toEqual(SILENT);
  expect(phone.handlers).toBe(1);
});

test('the cold-start response is routed once and cleared', async () => {
  phone.opened = response('cold-1', { kind: 'month_recap_ready', ref: '2026-09' });
  const view = render(<Host />);
  await waitFor(() => expect(phone.pushed).toHaveLength(1), WAIT);
  // The same response reaching the listener too is not routed again.
  tap('cold-1', { kind: 'month_recap_ready', ref: '2026-09' });
  expect(phone.pushed).toEqual([RECAP]);
  expect([phone.cleared, phone.opened]).toEqual([1, null]);
  // The app's next start finds nothing to route.
  view.unmount();
  render(<Host />);
  await installed();
  expect(phone.pushed).toEqual([RECAP]);
});

test('the token is registered at sign-in and after each session change, keeping the session as its hash, never its binding', async () => {
  signIn('session-a');
  const before = Date.now();
  const view = render(<Host />);
  await waitFor(() => expect(registered()).toHaveLength(1), WAIT);
  const after = Date.now();
  expect(registered()[0]).toEqual({ push_token: phone.token, platform: 'ios', language: 'th', slip_notices: true });
  const record = JSON.parse(stored.get(RECORD_KEY) ?? 'null') as { at: number };
  expect(record).toEqual({ token: phone.token, platform: 'ios', language: 'th', slipNotices: true, session: sha('session-a'), at: record.at });
  expect(record.at).toBeGreaterThanOrEqual(before);
  expect(record.at).toBeLessThanOrEqual(after);
  expect([...stored.values()].join('\n')).not.toContain('session-a');
  // A notice that leaves the session as it was fetches nothing; a new session registers again.
  signIn('session-a');
  signIn('session-b');
  await waitFor(() => expect(registered()).toHaveLength(2), WAIT);
  expect(phone.tokens).toEqual([PROJECT, PROJECT]);
  // Signed out, nothing is fetched or sent; signed in again, it registers again.
  act(() => { setSession(null); });
  signIn('session-c');
  await waitFor(() => expect(registered()).toHaveLength(3), WAIT);
  expect(phone.tokens).toHaveLength(3);
  expect(JSON.parse(stored.get(RECORD_KEY) ?? 'null').session).toBe(sha('session-c'));
  // A new language registers again, and from then on only in that language.
  view.rerender(<Host locale="en" />);
  await waitFor(() => expect(registered()).toHaveLength(4), WAIT);
  signIn('session-d');
  await waitFor(() => expect(registered()).toHaveLength(5), WAIT);
  expect(registered().map((registration) => registration.language)).toEqual(['th', 'th', 'th', 'en', 'en']);
});

test('an Android phone registers as android, with the slip-notice switch as the device store keeps it', async () => {
  setPlatform('android');
  stored.set('jotbun.wallet.slip-notices', '0');
  signIn('session-a');
  render(<Host />);
  await waitFor(() => expect(registered()).toHaveLength(1), WAIT);
  expect(registered()[0]).toEqual({ push_token: phone.token, platform: 'android', language: 'th', slip_notices: false });
});

test('without an EAS project id no token is fetched and nothing is sent', async () => {
  phone.extra = { eas: {} };
  signIn('session-a');
  render(<Host />);
  await waitFor(() => expect(phone.configReads).toBe(1), WAIT);
  // The id arrives (as D33's build will carry it), and the next session registers.
  phone.extra = { eas: { projectId: PROJECT } };
  signIn('session-b');
  await waitFor(() => expect(registered()).toHaveLength(1), WAIT);
  expect(phone.tokens).toEqual([PROJECT]);
});

test('on the web there is no push: nothing is set up, fetched or sent', async () => {
  setPlatform('web');
  signIn('session-a');
  const view = render(<Host />);
  // The same host on a phone registers (its language changes, so registration runs again); the web mount sent nothing first.
  setPlatform('ios');
  view.rerender(<Host locale="en" />);
  await waitFor(() => expect(registered()).toHaveLength(1), WAIT);
  expect(registered()[0].language).toBe('en');
  expect([phone.tokens.length, phone.handlers, phone.listeners.size]).toEqual([1, 0, 0]);
});

test('the host leaves no listener behind, even when it leaves before the module loads', async () => {
  render(<Host />).unmount();
  const view = render(<Host />);
  await waitFor(() => expect(phone.handlers).toBe(1), WAIT);
  expect(phone.listeners.size).toBe(1);
  view.unmount();
  expect(phone.listeners.size).toBe(0);
});

test('a notification module or a config that fails leaves the app as it is: taps still route and a later session registers', async () => {
  phone.openedThrows = true;
  phone.configThrows = true;
  signIn('session-a');
  render(<Host />);
  await installed();
  tap('push-1', { kind: 'export_ready', ref: EXPORT });
  expect(phone.pushed).toEqual(['/settings/privacy']);
  await waitFor(() => expect(phone.configReads).toBe(1), WAIT);
  phone.configThrows = false;
  signIn('session-b');
  await waitFor(() => expect(registered()).toHaveLength(1), WAIT);
  expect(rejections).toEqual([]);
});

test('no token, session or push data reaches a log line or an analytics event', async () => {
  const { sent, restore } = await recordAnalytics();
  const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((name) => vi.spyOn(console, name).mockImplementation(() => undefined));
  let lines: string[] = [];
  try {
    signIn('session-a');
    const view = render(<Host hidden />);
    await waitFor(() => expect(registered()).toHaveLength(1), WAIT);
    // A refused registration, then one that goes, so the refused one has ended.
    phone.refuse = true;
    signIn('session-b');
    await waitFor(() => expect(phone.refused).toBe(1), WAIT);
    phone.refuse = false;
    signIn('session-c');
    await waitFor(() => expect(registered()).toHaveLength(2), WAIT);
    // Taps behind the lock, routed when it opens, and each kind shown while the app is open.
    tap('push-1', { kind: 'statement_parsed', ref: JOB });
    tap('push-2', { kind: 'month_recap_ready', ref: '2026-09' });
    view.rerender(<Host />);
    expect(phone.pushed).toEqual([RECAP]);
    for (const data of [{ kind: 'slips_ready', ref: null }, { kind: 'export_ready', ref: EXPORT }]) await phone.handler?.handleNotification(response('shown', data).notification);
  } finally {
    lines = spies.flatMap((spy) => spy.mock.calls.map((args) => args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' ')));
    for (const spy of spies) spy.mockRestore();
    restore();
  }
  const secrets = [phone.token, 'session-a', 'session-b', 'session-c', sha('session-a'), sha('session-b'), sha('session-c'), JOB, EXPORT, '2026-09'];
  expect(lines.filter((line) => secrets.some((secret) => line.includes(secret)))).toEqual([]);
  expect(sent).toEqual([]);
});

const permission: { current: ReturnType<typeof useNotificationPermission> | null } = { current: null };
function PermissionProbe() {
  permission.current = useNotificationPermission();
  return <Text testID="permission">{permission.current.status}</Text>;
}
const status = () => screen.getByTestId('permission').textContent;

test("the permission hook reads the phone's answer, asks only when told, reads again on return, and opens the phone's settings", async () => {
  const changes = new Set<(state: string) => void>();
  vi.spyOn(AppState, 'addEventListener').mockImplementation(((_type: string, handler: (state: string) => void) => {
    changes.add(handler);
    return { remove: () => { changes.delete(handler); } };
  }) as unknown as typeof AppState.addEventListener);
  const change = (state: string) => act(() => { for (const handler of [...changes]) handler(state); });
  phone.answer = DENIED;
  const view = render(<PermissionProbe />);
  // Until the phone answers, the permission reads as undetermined.
  expect(status()).toBe('undetermined');
  await waitFor(() => expect(status()).toBe('denied'), WAIT);
  expect([phone.reads, phone.requests]).toEqual([1, []]);
  // Changed in the phone's settings: read again when the app comes back to the front, and only then.
  phone.answer = GRANTED;
  change('background');
  // A read is microtasks only once the module has loaded: a zero timer runs after any it started.
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  expect([phone.reads, status()]).toEqual([1, 'denied']);
  change('active');
  await waitFor(() => expect(status()).toBe('granted'), WAIT);
  // Asked only when the screen asks.
  phone.answer = DENIED;
  let asked: unknown;
  await act(async () => { asked = await permission.current?.ask().catch(() => 'threw'); });
  expect([asked, status()]).toEqual(['denied', 'denied']);
  expect(phone.requests).toEqual([{ ios: { allowAlert: true, allowBadge: false, allowSound: true } }]);
  // A request the phone cannot answer counts as a refusal; a read it cannot answer leaves the answer.
  phone.answer = GRANTED;
  phone.requestThrows = true;
  await act(async () => { asked = await permission.current?.ask().catch(() => 'threw'); });
  expect([asked, status()]).toEqual(['denied', 'denied']);
  phone.readThrows = true;
  change('active');
  await waitFor(() => expect(phone.reads).toBe(3), WAIT);
  expect(status()).toBe('denied');
  // The phone's settings, best effort.
  let opened: unknown = 'not yet';
  await act(async () => { opened = await permission.current?.openSettings().catch(() => 'threw'); });
  expect(opened).toBeUndefined();
  phone.settingsThrow = true;
  await act(async () => { opened = await permission.current?.openSettings().catch(() => 'threw'); });
  expect([opened, phone.settings]).toEqual([undefined, 2]);
  view.unmount();
  expect(changes.size).toBe(0);
  expect(rejections).toEqual([]);
});

test('off the phone the permission is denied and nothing is asked', async () => {
  setPlatform('web');
  phone.answer = GRANTED;
  render(<PermissionProbe />);
  await waitFor(() => expect(status()).toBe('denied'), WAIT);
  let asked: unknown;
  await act(async () => { asked = await permission.current?.ask().catch(() => 'threw'); });
  expect([asked, phone.reads, phone.requests]).toEqual(['denied', 0, []]);
});

test('the root layout mounts the push host once, as the first child inside the wallet root', () => {
  const layout = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../app/_layout.tsx'), 'utf8');
  expect(layout).toContain("import { PushHost } from '@mobile/slips/push/PushHost';");
  expect(layout.match(/<PushHost \/>/g) ?? []).toHaveLength(1);
  expect(layout).toMatch(/<WalletRoot>\n\s*<PushHost \/>\n\s*<LocaleUpkeep \/>/);
});
