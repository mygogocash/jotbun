// The redesign navigation shell (R3): app/spend/_layout.tsx draws the kit
// TabBar under the screens only while the redesign flag is on, hides it on
// Add and on a record, and leaves the current layout (and its auth redirect)
// exactly as it was when the flag is off. app/spend/index.tsx picks the new
// Home only under the flag, with the legacy flag still checked first.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { IntlProvider } from 'react-intl';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

// react-native-svg's web build resolves image hrefs through React Native's
// asset registry, which only Metro provides. The tab icons draw no images, so
// that one resolver is stubbed and the real SVG elements still render.

import type { Locale } from '@mobile/i18n/locales';
import { translateCopy } from '@mobile/i18n/messages';
import { bunDark, bunLight } from '@mobile/theme/bunPalette';
import { ThemePreferenceOverride, ThemeProvider } from '@mobile/theme/ThemeProvider';
import SpendLayout from '../../../app/spend/_layout';
import SpendHomeRoute from '../../../app/spend/index';
import { spendTab } from './SpendTabShell';

const nav = vi.hoisted(() => ({ pathname: '/spend', router: { push: vi.fn(), navigate: vi.fn(), replace: vi.fn(), back: vi.fn() } }));
const auth = vi.hoisted(() => ({ isAuthed: true, ready: true }));

vi.mock('expo-router', async () => {
  const { createElement } = await import('react');
  const { Text } = await import('react-native');
  return {
    Slot: () => createElement(Text, null, 'current screen'),
    Redirect: ({ href }: { href: string }) => createElement(Text, null, `redirect to ${href}`),
    usePathname: () => nav.pathname,
    useRouter: () => nav.router,
  };
});
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }) }));
vi.mock('@mobile/auth/useAuthGuardSession', () => ({ useAuthGuardSession: () => auth }));
vi.mock('@mobile/spend/v1/DeviceDiaryProvider', async () => {
  const { createElement } = await import('react');
  const { View } = await import('react-native');
  return { DeviceDiaryProvider: ({ children }: { children: unknown }) => createElement(View, { testID: 'device-diary' }, children as never) };
});
vi.mock('@mobile/api/sharedV1', () => ({ getSharedV1Resources: () => ({ marker: 'shared resources' }) }));
vi.mock('@mobile/screens/CustomerSpendScreen', async () => {
  const { createElement } = await import('react');
  const { Text } = await import('react-native');
  return { CustomerSpendScreen: () => createElement(Text, null, 'legacy home') };
});
vi.mock('@mobile/screens/v1/HomeScreen', async () => {
  const { createElement } = await import('react');
  const { Text } = await import('react-native');
  const { useSpendV1 } = await import('@mobile/spend/v1/SpendV1Context');
  return { HomeScreen: () => createElement(Text, null, `v1 home with ${(useSpendV1() as unknown as { marker: string }).marker}`) };
});
vi.mock('@mobile/screens/redesign/HomeScreen', async () => {
  const { createElement } = await import('react');
  const { Text } = await import('react-native');
  const { useSpendV1 } = await import('@mobile/spend/v1/SpendV1Context');
  return { HomeScreen: () => createElement(Text, null, `redesigned home with ${(useSpendV1() as unknown as { marker: string }).marker}`) };
});

const ENV = { redesign: process.env.EXPO_PUBLIC_REDESIGN, legacy: process.env.EXPO_PUBLIC_LEGACY_SPEND };
function flags({ redesign, legacy }: { redesign?: string; legacy?: string }) {
  if (redesign === undefined) delete process.env.EXPO_PUBLIC_REDESIGN;
  else process.env.EXPO_PUBLIC_REDESIGN = redesign;
  if (legacy === undefined) delete process.env.EXPO_PUBLIC_LEGACY_SPEND;
  else process.env.EXPO_PUBLIC_LEGACY_SPEND = legacy;
}

beforeEach(() => {
  nav.pathname = '/spend';
  nav.router.push.mockReset();
  nav.router.navigate.mockReset();
  auth.isAuthed = true;
  auth.ready = true;
  flags({});
});
afterEach(() => {
  cleanup();
  flags(ENV);
});

function mount(ui: ReactElement, locale: Locale = 'en', mode: 'light' | 'dark' = 'light') {
  return render(<IntlProvider locale={locale}><ThemeProvider><ThemePreferenceOverride preference={mode}>{ui}</ThemePreferenceOverride></ThemeProvider></IntlProvider>);
}
const rgb = (hex: string) => expect.stringMatching(new RegExp(`^rgba?\\(${[1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)).join(', ')}(, 1(\\.0+)?)?\\)$`));

test('flag off: exactly the current layout, with no tab bar', () => {
  mount(<SpendLayout />);
  expect(within(screen.getByTestId('device-diary')).getByText('current screen')).toBeTruthy();
  expect(screen.queryByRole('tablist')).toBeNull();
  expect(screen.queryByTestId('tab-bar')).toBeNull();
  cleanup();
  flags({ redesign: 'catalogue' });
  mount(<SpendLayout />);
  expect(screen.queryByRole('tablist')).toBeNull();
});

test('flag on: Home and History tabs under the screen, with the add button in the centre', () => {
  flags({ redesign: 'core' });
  mount(<SpendLayout />);
  expect(within(screen.getByTestId('device-diary')).getByText('current screen')).toBeTruthy();
  const list = screen.getByRole('tablist');
  const tabs = within(list).getAllByRole('tab');
  expect(tabs.map((tab) => tab.getAttribute('aria-label'))).toEqual(['Home', 'History']);
  expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual(['true', 'false']);
  const add = within(list).getByRole('button', { name: 'Add an entry' });
  const order = [...list.querySelectorAll('[role="tab"], [role="button"]')];
  expect(order.indexOf(add)).toBe(1);
  // The bar comes after the screen in the page, never over it.
  const screenNode = screen.getByText('current screen');
  expect(screenNode.compareDocumentPosition(screen.getByTestId('tab-bar')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

  fireEvent.click(screen.getByRole('tab', { name: 'History' }));
  expect(nav.router.navigate).toHaveBeenCalledWith('/spend/all');
  fireEvent.click(screen.getByRole('tab', { name: 'Home' }));
  expect(nav.router.navigate).toHaveBeenCalledTimes(1);
  fireEvent.click(add);
  expect(nav.router.push).toHaveBeenCalledWith('/spend/add');
});

test('flag on: History is selected on /spend/all and Home navigates back', () => {
  flags({ redesign: 'all' });
  nav.pathname = '/spend/all';
  mount(<SpendLayout />);
  expect(screen.getByRole('tab', { name: 'History' }).getAttribute('aria-selected')).toBe('true');
  fireEvent.click(screen.getByRole('tab', { name: 'Home' }));
  expect(nav.router.navigate).toHaveBeenCalledWith('/spend');
});

test.each(['/spend/add', '/spend/record/0000000b-0000-4000-8000-000000000003', '/spend/record/0000000b-0000-4000-8000-000000000003/edit'])('flag on: no tab bar on %s', (pathname) => {
  flags({ redesign: 'core' });
  nav.pathname = pathname;
  mount(<SpendLayout />);
  expect(screen.getByText('current screen')).toBeTruthy();
  expect(screen.queryByRole('tablist')).toBeNull();
  expect(screen.queryByTestId('tab-bar')).toBeNull();
});

test('the legacy flag still wins: no diary provider and no tab bar', () => {
  flags({ redesign: 'core', legacy: '1' });
  mount(<SpendLayout />);
  expect(screen.getByText('current screen')).toBeTruthy();
  expect(screen.queryByTestId('device-diary')).toBeNull();
  expect(screen.queryByRole('tablist')).toBeNull();
});

test.each([undefined, 'core'])('the auth redirect is unchanged (redesign flag %s)', (redesign) => {
  flags({ redesign });
  auth.isAuthed = false;
  mount(<SpendLayout />);
  expect(screen.getByText('redirect to /login')).toBeTruthy();
  expect(screen.queryByText('current screen')).toBeNull();
  expect(screen.queryByRole('tablist')).toBeNull();
  cleanup();
  auth.ready = false;
  const { container } = mount(<SpendLayout />);
  expect(container.textContent).toBe('');
});

test.each(['en', 'th', 'vi'] as const)('the tab bar speaks %s, in light and dark, with 44 pt targets', (locale) => {
  flags({ redesign: 'core' });
  for (const [mode, colors] of [['light', bunLight], ['dark', bunDark]] as const) {
    mount(<SpendLayout />, locale, mode);
    const home = screen.getByRole('tab', { name: translateCopy('Home', locale) });
    const history = screen.getByRole('tab', { name: translateCopy('History', locale) });
    const add = screen.getByRole('button', { name: translateCopy('Add an entry', locale) });
    for (const target of [home, history]) expect(target.style.minHeight).toBe('44px');
    expect(add.style.minHeight).toBe('56px');
    expect(within(home).getByText(translateCopy('Home', locale)).style.color).toEqual(rgb(colors.ink));
    expect(within(history).getByText(translateCopy('History', locale)).style.color).toEqual(rgb(colors.onInk));
    cleanup();
  }
});

test('which tab a path belongs to', () => {
  expect(spendTab('/spend')).toEqual({ visible: true, active: 'home' });
  expect(spendTab('/spend/')).toEqual({ visible: true, active: 'home' });
  expect(spendTab('/spend/all')).toEqual({ visible: true, active: 'history' });
  expect(spendTab('/spend/import')).toEqual({ visible: true, active: '' });
  expect(spendTab('/spend/add')).toEqual({ visible: false, active: '' });
  expect(spendTab('/spend/record/abc')).toEqual({ visible: false, active: '' });
  expect(spendTab('/spend/record')).toEqual({ visible: false, active: '' });
  expect(spendTab('/spend/recorder')).toEqual({ visible: true, active: '' });
});

test('the Home route: the new Home under the flag, the legacy flag first, else the current Home', () => {
  mount(<SpendHomeRoute />);
  expect(screen.getByText('v1 home with shared resources')).toBeTruthy();
  cleanup();
  flags({ redesign: 'core' });
  mount(<SpendHomeRoute />);
  expect(screen.getByText('redesigned home with shared resources')).toBeTruthy();
  cleanup();
  flags({ redesign: 'core', legacy: '1' });
  mount(<SpendHomeRoute />);
  expect(screen.getByText('legacy home')).toBeTruthy();
});
