// Large text on the screens (redesign R8): at AX5 (3.571x), the record's
// conflict panel stacks "Yours" above "On the server" field by field, and the
// footer's two actions stack, so amounts and words stay whole.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { Dimensions } from 'react-native';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';

vi.mock('../../../../../node_modules/react-native-svg/lib/module/lib/resolveAssetUri.web.js', () => ({ resolveAssetUri: () => null }));
vi.mock('react-native-safe-area-context', () => import('./safeAreaTestStub'));
vi.mock('expo-router', () => import('./routerTestStub'));
vi.mock('expo-router/build/Route', () => import('./routerTestStub'));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

import { installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import { mountInApp, settle } from './catalogueTestHarness';
import { CatalogueScreen } from './CatalogueScreen';

beforeAll(() => { installBrowserStorage(); });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function textScale(fontScale: number) {
  const real = Dimensions.get.bind(Dimensions);
  vi.spyOn(Dimensions, 'get').mockImplementation((dimension) => ({ ...real(dimension), fontScale }));
}

async function open(id: string) {
  mountInApp(<CatalogueScreen params={{ section: id, theme: 'light', locale: 'en' }} />);
  await settle();
  if (screen.queryByTestId('catalogue-screen-running')) {
    await waitFor(() => expect(screen.queryByTestId('catalogue-screen-running')).toBeNull(), { timeout: 15_000 });
  }
  return screen.getByTestId(`catalogue-section-${id}`);
}

test('the conflict panel names Yours and On the server on every field at large text, one under the other', async () => {
  textScale(3.571);
  const panel = within(await open('record-conflict')).getByTestId('conflict');
  // No side-by-side column heads: each field says whose value is whose.
  expect(within(panel).getAllByText('Yours').length).toBeGreaterThan(1);
  expect(within(panel).getAllByText('On the server').length).toBe(within(panel).getAllByText('Yours').length);
  cleanup();
  vi.restoreAllMocks();
  textScale(1);
  const plain = within(await open('record-conflict')).getByTestId('conflict');
  expect(within(plain).getAllByText('Yours')).toHaveLength(1);
}, 60_000);

test('the edit footer stacks Cancel and Save changes at large text', async () => {
  for (const [scale, direction] of [[1, 'row'], [3.571, 'column']] as const) {
    textScale(scale);
    const footer = within(await open('record-edit')).getByTestId('record-edit-footer');
    expect(within(footer).getByRole('button', { name: 'Save changes' })).toBeTruthy();
    const row = within(footer).getByTestId('action-row');
    expect([scale, row.style.flexDirection]).toEqual([scale, direction]);
    cleanup();
    vi.restoreAllMocks();
  }
}, 60_000);
