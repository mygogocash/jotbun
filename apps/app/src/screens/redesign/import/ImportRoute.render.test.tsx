// The import route (R7): the legacy build keeps its screen; the redesigned
// journey shows only under the `import` area; otherwise Home.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import SpendImportRoute from '../../../../app/spend/import';

vi.mock('expo-router', async () => {
  const { createElement } = await import('react');
  const { Text } = await import('react-native');
  return { Redirect: ({ href }: { href: string }) => createElement(Text, null, `redirect to ${href}`) };
});
vi.mock('@mobile/api/sharedV1', () => ({ getSharedV1Resources: () => ({ marker: 'shared resources' }) }));
function stub(name: string, text: string) {
  return async () => {
    const { createElement } = await import('react');
    const { Text } = await import('react-native');
    return { [name]: () => createElement(Text, null, text) };
  };
}
vi.mock('@mobile/screens/CustomerSpendImportScreen', stub('CustomerSpendImportScreen', 'legacy import'));
vi.mock('@mobile/screens/redesign/import/ImportScreen', stub('ImportScreen', 'redesigned import'));

const ENV = { redesign: process.env.EXPO_PUBLIC_REDESIGN, legacy: process.env.EXPO_PUBLIC_LEGACY_SPEND };
function flags({ redesign, legacy }: { redesign?: string; legacy?: string }) {
  if (redesign === undefined) delete process.env.EXPO_PUBLIC_REDESIGN;
  else process.env.EXPO_PUBLIC_REDESIGN = redesign;
  if (legacy === undefined) delete process.env.EXPO_PUBLIC_LEGACY_SPEND;
  else process.env.EXPO_PUBLIC_LEGACY_SPEND = legacy;
}
beforeEach(() => flags({}));
afterEach(() => {
  cleanup();
  flags(ENV);
});

test('legacy first, then the redesigned journey under the import area, else Home', () => {
  render(<SpendImportRoute />);
  expect(screen.getByText('redirect to /spend')).toBeTruthy();
  cleanup();
  flags({ redesign: 'import' });
  render(<SpendImportRoute />);
  expect(screen.getByText('redesigned import')).toBeTruthy();
  cleanup();
  flags({ redesign: 'import', legacy: '1' });
  render(<SpendImportRoute />);
  expect(screen.getByText('legacy import')).toBeTruthy();
});
