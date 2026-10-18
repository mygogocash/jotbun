import Module from 'node:module';

import { cleanup, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

// react-native-svg's web build resolves image hrefs through React Native's
// asset registry, which only Metro provides. The bun and the icons draw no
// images, so that one resolver is stubbed and the real SVG elements render.
vi.mock('../../../../../node_modules/react-native-svg/lib/module/lib/resolveAssetUri.web.js', () => ({ resolveAssetUri: () => null }));
// The real safe-area package loads React Native itself, which vitest cannot run.
vi.mock('react-native-safe-area-context', () => import('./safeAreaTestStub'));
const router = vi.hoisted(() => ({ params: {} as Record<string, string> }));
vi.mock('expo-router', () => ({ useLocalSearchParams: () => router.params }));
// The catalogue's screen sections import the real screens and the route params context; none is opened here.
vi.mock('expo-router/build/Route', () => import('./routerTestStub'));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

import DevCatalogueRoute from '../../../app/dev/catalogue';
import { installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import * as catalogueModule from './CatalogueScreen';
import { mountInApp, settle } from './catalogueTestHarness';

/**
 * The route loads the catalogue with `if (__DEV__) require(...)`. Metro
 * resolves that require in the app; under vitest `require` is Node's own,
 * which cannot load TSX. So Node's loader is asked to hand over the module
 * vitest already loaded, for that one request only, and every request the
 * route makes is recorded.
 */
const CATALOGUE_REQUEST = '@mobile/dev/catalogue/CatalogueScreen';
type NodeLoader = (request: string, parent: unknown, isMain: boolean) => unknown;
const nodeModule = Module as unknown as { _load: NodeLoader };
const originalLoad = nodeModule._load;
let requests: string[] = [];

const globals = globalThis as { __DEV__?: boolean };
const setDev = (dev: boolean) => { globals.__DEV__ = dev; };

beforeAll(() => {
  installBrowserStorage();
  nodeModule._load = function load(this: unknown, request, parent, isMain) {
    if (request.includes('catalogue')) {
      requests.push(request);
      if (request === CATALOGUE_REQUEST) return catalogueModule;
    }
    return originalLoad.call(this, request, parent, isMain);
  };
});
afterAll(() => {
  nodeModule._load = originalLoad;
  delete globals.__DEV__;
});
beforeEach(() => {
  requests = [];
  router.params = {};
  setDev(true);
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  window.localStorage.clear();
});

async function openRoute() {
  const view = mountInApp(<DevCatalogueRoute />);
  await settle();
  return view;
}

test('with the catalogue flag off, the route says it is not available and never loads the catalogue', async () => {
  for (const flag of [undefined, '', 'core', 'catalog']) {
    if (flag === undefined) vi.stubEnv('EXPO_PUBLIC_REDESIGN', undefined);
    else vi.stubEnv('EXPO_PUBLIC_REDESIGN', flag);
    router.params = { section: 'receipt' };
    await openRoute();
    expect(screen.getByText('Not available')).toBeTruthy();
    // A development build says how to turn it on.
    expect(screen.getByText(/EXPO_PUBLIC_REDESIGN=catalogue/)).toBeTruthy();
    expect(screen.queryByTestId('catalogue')).toBeNull();
    cleanup();
  }
  expect(requests).toEqual([]);
});

test('a release build never loads the catalogue, even with the flag on', async () => {
  setDev(false);
  vi.stubEnv('EXPO_PUBLIC_REDESIGN', 'all');
  router.params = { section: 'receipt' };
  await openRoute();
  expect(screen.getByText('Not available')).toBeTruthy();
  expect(screen.queryByText(/EXPO_PUBLIC_REDESIGN/)).toBeNull();
  expect(screen.queryByTestId('catalogue')).toBeNull();
  expect(requests).toEqual([]);
});

test('a development build with the flag on loads the catalogue and opens the deep-linked section', async () => {
  for (const flag of ['catalogue', 'core, catalogue', 'all']) {
    vi.stubEnv('EXPO_PUBLIC_REDESIGN', flag);
    router.params = { section: 'receipt', theme: 'dark', locale: 'th' };
    await openRoute();
    expect(screen.queryByText('Not available')).toBeNull();
    const body = screen.getByTestId('catalogue-section-receipt');
    expect(within(body).getAllByTestId('receipt-slip').length).toBeGreaterThan(0);
    screen.getByRole('radio', { name: 'Dark', checked: true });
    screen.getByRole('radio', { name: 'Thai', checked: true });
    cleanup();
  }
  expect(new Set(requests)).toEqual(new Set([CATALOGUE_REQUEST]));
});
