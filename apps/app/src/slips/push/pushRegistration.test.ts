// P4-T17: push registration on the phone (Node). The token goes to PUT
// /v1/devices only with an EAS project id, a session and a permission the
// phone already gave; again only when something changed or a week passed. The
// record kept on the phone holds the session's hash, never its binding. Every
// call is read through `outcome`, so a call that throws fails on an assertion.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseDeviceRegistration } from '@gogospend/contracts';
import type { DeviceRegistration } from '@gogospend/contracts';

import { deviceStore } from '../../wallet/store/walletStore.ts';
import type { KeyValueStore, StoreBackend } from '../../wallet/store/walletStore.ts';
import { fakeSlipResources } from '../testing/fakeSlipResources.ts';
import {
  PUSH_RECORD_NAME,
  PUSH_RENEW_MS,
  SLIP_NOTICES_NAME,
  expoPushTokens,
  permissionOf,
  pushProjectId,
  readSlipNotices,
  registerPushIfNeeded,
  sessionHash,
} from './pushRegistration.ts';
import type { PushPermission, PushTokenPort } from './pushRegistration.ts';

const PROJECT = '0b5c7a1e-2d3f-4a6b-8c9d-0e1f2a3b4c5d';
const TOKEN = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const NEW_TOKEN = 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]';
const SESSION = 'a'.repeat(64);
const NOW = Date.UTC(2026, 10, 14, 2, 0, 0);
const RECORD_KEY = `jotbun.wallet.${PUSH_RECORD_NAME}`;

type Deps = Parameters<typeof registerPushIfNeeded>[0];
type FakePort = PushTokenPort & { answer: PushPermission; current: string; reads: number; asked: number; tokens: string[]; fetchFails: boolean };

function memoryStore(): { store: KeyValueStore; items: Map<string, string> } {
  const items = new Map<string, string>();
  const backend: StoreBackend = {
    getItem: async (key) => items.get(key) ?? null,
    setItem: async (key, value) => { items.set(key, value); },
    removeItem: async (key) => { items.delete(key); },
    getAllKeys: async () => [...items.keys()],
    multiRemove: async (keys) => { for (const key of keys) items.delete(key); },
  };
  return { store: deviceStore(backend), items };
}

function fakePort(): FakePort {
  const port: FakePort = {
    answer: 'granted',
    current: TOKEN,
    reads: 0,
    asked: 0,
    tokens: [],
    fetchFails: false,
    async permission() {
      port.reads += 1;
      return port.answer;
    },
    async request() {
      port.asked += 1;
      return port.answer;
    },
    async token(projectId) {
      port.tokens.push(projectId);
      if (port.fetchFails) throw new Error('offline');
      return port.current;
    },
  };
  return port;
}

function setup(overrides: Partial<Deps> = {}) {
  const { store, items } = memoryStore();
  const port = fakePort();
  const resources = fakeSlipResources();
  const deps: Deps = { port, projectId: PROJECT, resources, store, platform: 'ios', language: 'th', slipNotices: true, session: SESSION, nowMs: NOW, ...overrides };
  const sent = () => resources.calls.filter((call) => call.method === 'registerDevice').map((call) => call.body as DeviceRegistration);
  return { deps, port, items, sent };
}

/** The answer, or what was thrown: a registration never throws. */
const outcome = (deps: Deps) => registerPushIfNeeded(deps).catch((error: unknown) => ({ thrown: error instanceof Error ? error.name : String(error) }));

const sha = (data: Uint8Array) => Promise.resolve(new Uint8Array(createHash('sha256').update(data).digest()));

test('without a project id nothing is registered', async () => {
  const { deps, port, items, sent } = setup({ projectId: null });
  assert.equal(await outcome(deps), 'no_project');
  assert.deepEqual([sent(), port.tokens, [...items.keys()]], [[], [], []]);
  // The same phone with a project id registers: nothing went above only for want of one.
  assert.equal(await outcome({ ...deps, projectId: PROJECT }), 'registered');
  assert.deepEqual([port.tokens, sent().length], [[PROJECT], 1]);
});

test('the token is registered at sign-in, and again only when something changed or a week passed', async () => {
  const { deps, port, items, sent } = setup();
  assert.equal(await outcome(deps), 'registered');
  assert.deepEqual(sent(), [{ push_token: TOKEN, platform: 'ios', language: 'th', slip_notices: true }]);
  // The body is the contract's registration exactly: no session and no binding in it.
  assert.deepEqual(parseDeviceRegistration(sent()[0]), sent()[0]);
  assert.deepEqual(JSON.parse(items.get(RECORD_KEY) ?? 'null'), { token: TOKEN, platform: 'ios', language: 'th', slipNotices: true, session: SESSION, at: NOW });
  // An hour on, and a moment short of a week on, nothing changed: nothing is sent.
  assert.equal(PUSH_RENEW_MS, 604_800_000);
  assert.equal(await outcome({ ...deps, nowMs: NOW + 3_600_000 }), 'unchanged');
  assert.equal(await outcome({ ...deps, nowMs: NOW + PUSH_RENEW_MS - 1 }), 'unchanged');
  assert.equal(sent().length, 1);
  // A week after the record it goes again, and the record is renewed.
  const later = NOW + PUSH_RENEW_MS;
  assert.equal(await outcome({ ...deps, nowMs: later }), 'registered');
  assert.equal(JSON.parse(items.get(RECORD_KEY) ?? 'null').at, later);
  // Each change goes once: the token, the platform, the language, the slip-notice switch.
  port.current = NEW_TOKEN;
  assert.equal(await outcome({ ...deps, nowMs: later }), 'registered');
  assert.equal(await outcome({ ...deps, nowMs: later }), 'unchanged');
  assert.equal(await outcome({ ...deps, nowMs: later, platform: 'android' }), 'registered');
  assert.equal(await outcome({ ...deps, nowMs: later, platform: 'android', language: 'en' }), 'registered');
  assert.equal(await outcome({ ...deps, nowMs: later, platform: 'android', language: 'en', slipNotices: false }), 'registered');
  assert.equal(await outcome({ ...deps, nowMs: later, platform: 'android', language: 'en', slipNotices: false }), 'unchanged');
  assert.deepEqual(sent().slice(1), [
    { push_token: TOKEN, platform: 'ios', language: 'th', slip_notices: true },
    { push_token: NEW_TOKEN, platform: 'ios', language: 'th', slip_notices: true },
    { push_token: NEW_TOKEN, platform: 'android', language: 'th', slip_notices: true },
    { push_token: NEW_TOKEN, platform: 'android', language: 'en', slip_notices: true },
    { push_token: NEW_TOKEN, platform: 'android', language: 'en', slip_notices: false },
  ]);
});

test('a new session registers again with the same token', async () => {
  const { deps, sent } = setup();
  assert.equal(await outcome(deps), 'registered');
  const next = 'b'.repeat(64);
  assert.equal(await outcome({ ...deps, session: next }), 'registered');
  assert.equal(await outcome({ ...deps, session: next }), 'unchanged');
  assert.deepEqual(sent().map((registration) => registration.push_token), [TOKEN, TOKEN]);
});

test('registering never asks for the permission, and a denied one registers nothing', async () => {
  const { deps, port, items, sent } = setup();
  port.answer = 'denied';
  assert.equal(await outcome(deps), 'not_allowed');
  port.answer = 'undetermined';
  assert.equal(await outcome(deps), 'not_allowed');
  assert.deepEqual([sent(), port.tokens, [...items.keys()]], [[], [], []]);
  port.answer = 'granted';
  assert.equal(await outcome(deps), 'registered');
  assert.deepEqual([port.reads, port.asked, sent().length], [3, 0, 1]);
});

test('slip notices are on by default', async () => {
  const { store } = memoryStore();
  const read = (from: KeyValueStore) => readSlipNotices(from).catch(() => 'threw');
  assert.equal(await read(store), true);
  assert.equal(SLIP_NOTICES_NAME, 'slip-notices');
  await store.set(SLIP_NOTICES_NAME, '0');
  assert.equal(await read(store), false);
  await store.set(SLIP_NOTICES_NAME, '1');
  assert.equal(await read(store), true);
  // A switch that cannot be read counts as on, its default.
  const broken: KeyValueStore = { ...store, get: async () => { throw new Error('storage unavailable'); } };
  assert.equal(await read(broken), true);
});

test('Vietnamese registers English', async () => {
  const { deps, sent } = setup({ language: 'vi' });
  assert.equal(await outcome(deps), 'registered');
  assert.equal(await outcome({ ...deps, language: 'en' }), 'unchanged');
  assert.equal(await outcome({ ...deps, language: 'th' }), 'registered');
  assert.deepEqual(sent().map((registration) => registration.language), ['en', 'th']);
});

test('signed out, nothing is read, fetched or sent', async () => {
  const { deps, port, items, sent } = setup({ session: null });
  assert.equal(await outcome(deps), 'not_allowed');
  assert.deepEqual([port.reads, port.tokens, sent(), [...items.keys()]], [0, [], [], []]);
});

test('a registration that fails is sent again next time, and a damaged or future record counts as none', async () => {
  // The token cannot be fetched: failed, and nothing is sent or kept.
  const offline = setup();
  offline.port.fetchFails = true;
  assert.equal(await outcome(offline.deps), 'failed');
  assert.deepEqual([offline.sent(), offline.items.has(RECORD_KEY)], [[], false]);
  // The server refuses: failed, no record, and the next run sends again.
  const { deps, items, sent } = setup();
  const refusing = { registerDevice: async () => { throw new Error('refused'); } };
  assert.equal(await outcome({ ...deps, resources: refusing }), 'failed');
  assert.equal(items.has(RECORD_KEY), false);
  assert.equal(await outcome(deps), 'registered');
  assert.equal(await outcome(deps), 'unchanged');
  // A permission the phone cannot read: failed.
  const unreadable = { ...deps.port, permission: async (): Promise<PushPermission> => { throw new Error('unavailable'); } };
  assert.equal(await outcome({ ...deps, port: unreadable }), 'failed');
  // A damaged record, one dated after now and one whose time is not a number: each is no record.
  const kept = JSON.parse(items.get(RECORD_KEY) ?? 'null') as Record<string, unknown>;
  for (const damaged of ['{"token":', JSON.stringify({ ...kept, at: NOW + 1 }), JSON.stringify({ ...kept, at: String(NOW) })]) {
    items.set(RECORD_KEY, damaged);
    assert.equal(await outcome(deps), 'registered', damaged);
  }
  assert.equal(sent().length, 4);
});

test('the session kept is the SHA-256 of the binding, never the binding', async () => {
  for (const binding of ['Qe3lB0kZt7sG2vX9pN4wY1cR', 'session-a']) {
    assert.equal(await sessionHash(binding, sha), createHash('sha256').update(binding, 'utf8').digest('hex'));
  }
});

test('the EAS project id comes from extra.eas.projectId, and only a UUID counts', () => {
  const read = (extra: unknown) => {
    try {
      return pushProjectId(extra);
    } catch {
      return 'threw';
    }
  };
  assert.equal(read({ eas: { projectId: PROJECT } }), PROJECT);
  const none = [{ projectId: PROJECT }, { eas: { projectId: 'my-project' } }, { eas: { projectId: '' } }, { eas: { projectId: 42 } }, { eas: {} }, { eas: null }, {}, null, undefined];
  for (const extra of none) assert.equal(read(extra), null, JSON.stringify(extra));
});

test('the port reads, asks and fetches through expo-notifications 58.1.5, and reads the permission as the reminders do', async () => {
  assert.equal(permissionOf({ granted: true, canAskAgain: false }), 'granted');
  // iOS's quiet (provisional) delivery counts as granted.
  assert.equal(permissionOf({ granted: false, canAskAgain: false, ios: { status: 3 } }), 'granted');
  assert.equal(permissionOf({ granted: false, canAskAgain: false, ios: { status: 1 } }), 'denied');
  // A refusal the phone still lets the app ask about again (Android's first) counts as undetermined.
  assert.equal(permissionOf({ granted: false, canAskAgain: true }), 'undetermined');
  assert.equal(permissionOf({ granted: false, canAskAgain: false, ios: null }), 'denied');
  const calls: unknown[] = [];
  const answer = { granted: false, canAskAgain: true, status: 'undetermined', expires: 'never' };
  const module = {
    getPermissionsAsync: async () => { calls.push(['permission']); return answer; },
    requestPermissionsAsync: async (request: unknown) => { calls.push(['request', request]); return { ...answer, granted: true, status: 'granted' }; },
    getExpoPushTokenAsync: async (options: unknown) => { calls.push(['token', options]); return { type: 'expo', data: TOKEN }; },
  };
  const port = expoPushTokens(async () => module as unknown as typeof import('expo-notifications'));
  assert.deepEqual([await port.permission(), await port.request(), await port.token(PROJECT)], ['undetermined', 'granted', TOKEN]);
  assert.deepEqual(calls, [['permission'], ['request', { ios: { allowAlert: true, allowBadge: false, allowSound: true } }], ['token', { projectId: PROJECT }]]);
});

test("the app's config adds expo-notifications' plugin with its defaults", () => {
  const config = JSON.parse(readFileSync(new URL('../../../app.json', import.meta.url), 'utf8')) as { expo: { plugins: unknown[] } };
  const entries = config.expo.plugins.filter((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) === 'expo-notifications');
  assert.deepEqual(entries, ['expo-notifications']);
});

test('the push host is the only place that sets a notification handler, so a reminder stays silent while the app is open', () => {
  // SDK 58 keeps only the last handler set, so a second call anywhere would undo the host's (R126).
  const appRoot = fileURLToPath(new URL('../../../', import.meta.url));
  const sources = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
  const setters = [...sources(join(appRoot, 'app')), ...sources(join(appRoot, 'src'))]
    .filter((path) => readFileSync(path, 'utf8').includes('setNotificationHandler('))
    .map((path) => relative(appRoot, path).split(sep).join('/'));
  assert.deepEqual(setters, ['src/slips/push/PushHost.tsx']);
});
