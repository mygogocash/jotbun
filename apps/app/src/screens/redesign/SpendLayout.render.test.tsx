// The redesign navigation shell (R3): app/spend/_layout.tsx draws the kit
// TabBar under the screens only while the redesign flag is on, hides it on
// Add and on a record, and leaves the current layout (and its auth redirect)
// exactly as it was when the flag is off. app/spend/index.tsx picks the new
// Home only under the flag, with the legacy flag still checked first. In the
// wallet area (P2-T18) the layout mounts the wallet shell in place of the
// kit's, its bar and + included, and /spend/add opens the shell's add tray.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentType, ReactElement } from 'react';
import { IntlProvider } from 'react-intl';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

// react-native-svg's web build resolves image hrefs through React Native's
// asset registry, which only Metro provides. The tab icons draw no images, so
// that one resolver is stubbed and the real SVG elements still render.

import type { TransactionDto, WalletSnapshot } from '@gogospend/contracts';

import { getAnalytics, setAnalytics } from '@mobile/analytics/bus';
import { fakeConsent } from '@mobile/analytics/testing/fakeConsent';
import { recordAnalytics } from '@mobile/analytics/testing/recordAnalytics';
import type { Locale } from '@mobile/i18n/locales';
import { translateCopy } from '@mobile/i18n/messages';
import { bunDark, bunLight } from '@mobile/theme/bunPalette';
import { BUILTINS, createFakeResources } from '@mobile/spend/v1/testing/fakeResources';
import { ThemePreferenceOverride, ThemeProvider } from '@mobile/theme/ThemeProvider';
import SpendLayout from '../../../app/spend/_layout';
import SpendAddRoute from '../../../app/spend/add';
import SpendHomeRoute from '../../../app/spend/index';
import { spendTab } from './SpendTabShell';

const nav = vi.hoisted(() => ({
  pathname: '/spend',
  params: {} as Record<string, string | string[]>,
  // The route the Slot draws; the stand-in screen unless a case names one.
  slot: null as ComponentType | null,
  router: { push: vi.fn(), navigate: vi.fn(), replace: vi.fn(), back: vi.fn() },
}));
const auth = vi.hoisted(() => ({ isAuthed: true, ready: true }));

vi.mock('expo-router', async () => {
  const { createElement } = await import('react');
  const { Text } = await import('react-native');
  return {
    Slot: () => (nav.slot === null ? createElement(Text, null, 'current screen') : createElement(nav.slot)),
    Redirect: ({ href }: { href: string }) => createElement(Text, null, `redirect to ${href}`),
    usePathname: () => nav.pathname,
    useRouter: () => nav.router,
    useLocalSearchParams: () => nav.params,
  };
});
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }) }));
vi.mock('@mobile/auth/useAuthGuardSession', () => ({ useAuthGuardSession: () => auth }));
vi.mock('@mobile/spend/v1/DeviceDiaryProvider', async () => {
  const { createElement } = await import('react');
  const { View } = await import('react-native');
  return { DeviceDiaryProvider: ({ children }: { children: unknown }) => createElement(View, { testID: 'device-diary' }, children as never) };
});
// The wallet shell reaches Quick add's command keys, which make ids with expo-crypto.
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));
// The shared v1 resources: a marker the stand-in screens read, or a case's fakes.
const shared = vi.hoisted(() => ({ resources: { marker: 'shared resources' } as unknown }));
vi.mock('@mobile/api/sharedV1', () => ({
  getSharedV1Resources: () => shared.resources,
  // The layouts give their screens Bun's AI help; here it never answers, so it stays off.
  getSharedAiResources: () => new Proxy({}, { get: () => () => new Promise(() => undefined) }),
}));
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
// Today's Quick add, which /spend/add keeps outside the wallet area.
vi.mock('@mobile/screens/redesign/QuickAddScreen', async () => {
  const { createElement } = await import('react');
  const { Text } = await import('react-native');
  return { QuickAddScreen: () => createElement(Text, null, 'quick add') };
});
// The wallet shell reads Home's sync plan for C5 (P2-T18), so that one export stays real.
vi.mock('@mobile/screens/redesign/HomeScreen', async (importOriginal) => {
  const { createElement } = await import('react');
  const { Text } = await import('react-native');
  const { useSpendV1 } = await import('@mobile/spend/v1/SpendV1Context');
  const { syncPlan } = await importOriginal<typeof import('@mobile/screens/redesign/HomeScreen')>();
  return { syncPlan, HomeScreen: () => createElement(Text, null, `redesigned home with ${(useSpendV1() as unknown as { marker: string }).marker}`) };
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
  nav.params = {};
  nav.slot = null;
  shared.resources = { marker: 'shared resources' };
  nav.router.push.mockReset();
  nav.router.navigate.mockReset();
  nav.router.replace.mockReset();
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
  for (const redesign of ['off', '-core']) {
    flags({ redesign });
    mount(<SpendLayout />);
    expect(within(screen.getByTestId('device-diary')).getByText('current screen')).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByTestId('tab-bar')).toBeNull();
    cleanup();
  }
});

// E2 checkpoint 1 approved the core loop: with no flag set (or only other areas), the tab bar shows.
test('approved: the redesigned layout is the default', () => {
  for (const redesign of [undefined, '', 'catalogue']) {
    flags({ redesign });
    mount(<SpendLayout />);
    expect(screen.getByTestId('tab-bar')).toBeTruthy();
    cleanup();
  }
});

test('flag on: Home and History tabs under the screen, with the add button in the centre', () => {
  // Insights (its own tab, on since E2 checkpoint 3) is switched off here; the insights test below has three tabs.
  flags({ redesign: 'core,-insights' });
  mount(<SpendLayout />);
  expect(within(screen.getByTestId('device-diary')).getByText('current screen')).toBeTruthy();
  const list = screen.getByRole('tablist');
  const tabs = within(list).getAllByRole('tab');
  expect(tabs.map((tab) => tab.getAttribute('aria-label'))).toEqual(['Home', 'History']);
  expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual(['true', 'false']);
  // The add button is drawn in the centre of the bar, outside the tablist (a tablist holds only tabs).
  const add = within(screen.getByTestId('tab-bar')).getByRole('button', { name: 'Add an entry' });
  expect(list.contains(add)).toBe(false);
  const order = [...list.querySelectorAll('[role="tab"], [data-testid="tab-bar-add-space"]')];
  expect(order.indexOf(screen.getByTestId('tab-bar-add-space'))).toBe(1);
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
  // Every area but the wallet, whose shell takes the layout's place (P2-T18).
  flags({ redesign: 'all,-wallet' });
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
  // Recently deleted is pushed over History with its own Back, like a record.
  expect(spendTab('/spend/deleted')).toEqual({ visible: false, active: '' });
});

test('the Home route: the new Home under the flag, the legacy flag first, else the current Home', () => {
  mount(<SpendHomeRoute />);
  expect(screen.getByText('redesigned home with shared resources')).toBeTruthy();
  cleanup();
  flags({ redesign: 'off' });
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

// R4 under decision D7 (a small tab set): Planning adds no tab. Budget opens
// from Home, Wallets and Categories from Budget; each takes the whole height
// with its own way back.
test('planning on: no tab of its own; the bar hides on budget, wallets and categories', () => {
  const tabNames = () => within(screen.getByRole('tablist')).getAllByRole('tab').map((tab) => tab.getAttribute('aria-label'));
  flags({ redesign: 'planning' });
  mount(<SpendLayout />);
  expect(tabNames()).toEqual(['Home', 'History', 'Insights']);
  cleanup();
  flags({ redesign: '-planning' });
  mount(<SpendLayout />);
  expect(tabNames()).toEqual(['Home', 'History', 'Insights']);
  cleanup();
  for (const path of ['/spend/budget', '/spend/wallets', '/spend/categories']) expect(spendTab(path)).toEqual({ visible: false, active: '' });
});

// R5 under decision D7: Insights joins the bar as a tab; a month's recap and
// the reminder settings take the whole height with their own way back.
test('insights on: an Insights tab, selected on /spend/insights; the bar hides on a recap and on reminders', () => {
  flags({ redesign: 'insights' });
  nav.pathname = '/spend/insights';
  mount(<SpendLayout />);
  const tabs = within(screen.getByRole('tablist')).getAllByRole('tab');
  expect(tabs.map((tab) => tab.getAttribute('aria-label'))).toEqual(['Home', 'History', 'Insights']);
  expect(screen.getByRole('tab', { name: 'Insights' }).getAttribute('aria-selected')).toBe('true');
  fireEvent.click(screen.getByRole('tab', { name: 'History' }));
  expect(nav.router.navigate).toHaveBeenLastCalledWith('/spend/all');
  cleanup();
  nav.pathname = '/spend';
  mount(<SpendLayout />);
  fireEvent.click(screen.getByRole('tab', { name: 'Insights' }));
  expect(nav.router.navigate).toHaveBeenLastCalledWith('/spend/insights');
  cleanup();
  expect(spendTab('/spend/insights')).toEqual({ visible: true, active: 'insights' });
  for (const path of ['/spend/recap/2026-09', '/spend/reminders']) expect(spendTab(path)).toEqual({ visible: false, active: '' });
});

// D34 (1D-T8): an account never asked answers the analytics question in place
// of the screens, inside the diary and CompanionBoundary, only while the
// `analytics` area is on. Loading never blocks, and a no brings the screens
// back at once.
test("a never-asked question takes the screens' place only in the analytics area", async () => {
  const question = () => screen.queryByRole('heading', { name: 'Help improve Jotbun' });
  const recorded = await recordAnalytics({ consent: 'unasked' });
  try {
    expect(recorded.analytics.status()).toBe('unanswered');
    flags({ redesign: 'analytics' });
    mount(<SpendLayout />);
    expect(question()).toBeTruthy();
    expect(within(screen.getByTestId('device-diary')).getByRole('button', { name: 'No, thanks' })).toBeTruthy();
    expect(screen.queryByText('current screen')).toBeNull();
    cleanup();
    // The area off (as it ships until E2), or switched off: the screens as today.
    for (const redesign of [undefined, 'all,-analytics']) {
      flags({ redesign });
      mount(<SpendLayout />);
      expect(screen.getByText('current screen')).toBeTruthy();
      expect(question()).toBeNull();
      cleanup();
    }
    // A no is in force at the call: the screens come back at once.
    flags({ redesign: 'analytics' });
    mount(<SpendLayout />);
    act(() => { void recorded.analytics.answer('no'); });
    expect(screen.getByText('current screen')).toBeTruthy();
    expect(question()).toBeNull();
  } finally {
    recorded.restore();
  }
  cleanup();
  // A controller still loading the answer (the server not reached yet) never blocks the screens.
  const loading = fakeConsent({ offline: true });
  await loading.signIn();
  expect(loading.analytics.status()).toBe('loading');
  const previous = getAnalytics();
  setAnalytics(loading.analytics);
  try {
    mount(<SpendLayout />);
    expect(screen.getByText('current screen')).toBeTruthy();
    expect(question()).toBeNull();
  } finally {
    setAnalytics(previous);
  }
});

// The Bun Wallet (P2-T18; R58, R82): the wallet branch comes first, so the
// wallet area draws the wallet shell (its bar, the + and the trays) inside the
// diary and Bun's AI help, around History's keep and the screen, in place of
// the kit's bar. The legacy build and the sign-in redirect still come first.
// Each lookup below asserts, so a case that fails, fails on its assertion.

/** The elements with this test id, which must number `count`. */
function counted(testID: string, count: number, at: string): HTMLElement[] {
  const elements = screen.queryAllByTestId(testID);
  expect(elements, `${at}: ${testID}`).toHaveLength(count);
  return elements;
}
/** The one element with this role and name. */
function theOne(role: string, name: string, at = ''): HTMLElement {
  const elements = screen.queryAllByRole(role, { name });
  expect(elements, `${at}: one ${role} named ${name}`).toHaveLength(1);
  return elements[0] as HTMLElement;
}
/** Starts the tray's entering animations, which happy-dom never starts (the add tray's own suite does the same). */
function startAnimations() {
  act(() => {
    for (const node of document.querySelectorAll<HTMLElement>('[style*="visibility: hidden"]')) node.dispatchEvent(new Event('animationstart'));
  });
}
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

test('with EXPO_PUBLIC_REDESIGN=wallet the spend screens sit in the wallet shell; without it nothing changes', () => {
  for (const redesign of ['wallet', 'core,wallet', 'all']) {
    flags({ redesign });
    mount(<SpendLayout />, 'th');
    // The screen inside the shell, inside the diary; the wallet's bar and +, not the kit's bar.
    const [diary] = counted('device-diary', 1, redesign);
    const [shell] = counted('wallet-shell', 1, redesign);
    expect(diary?.contains(shell ?? null), redesign).toBe(true);
    expect(within(shell as HTMLElement).queryAllByText('current screen'), redesign).toHaveLength(1);
    counted('wallet-tab-bar', 1, redesign);
    theOne('tab', 'กระเป๋า', redesign);
    theOne('button', 'จดรายการ', redesign);
    counted('tab-bar', 0, redesign);
    cleanup();
  }
  // Without the area (as it ships until E2), or switched off: the layout as it was, the kit's bar and no shell.
  for (const redesign of [undefined, 'wallet,-wallet']) {
    flags({ redesign });
    mount(<SpendLayout />, 'th');
    counted('tab-bar', 1, String(redesign));
    counted('wallet-shell', 0, String(redesign));
    counted('wallet-tab-bar', 0, String(redesign));
    cleanup();
  }
  // The legacy build still wins: no diary and no shell.
  flags({ redesign: 'wallet', legacy: '1' });
  mount(<SpendLayout />, 'th');
  expect(screen.queryAllByText('current screen')).toHaveLength(1);
  counted('device-diary', 0, 'legacy');
  counted('wallet-shell', 0, 'legacy');
  cleanup();
  // Signed out, the redirect to sign-in comes first.
  flags({ redesign: 'wallet' });
  auth.isAuthed = false;
  mount(<SpendLayout />, 'th');
  expect(screen.queryAllByText('redirect to /login')).toHaveLength(1);
  counted('wallet-shell', 0, 'signed out');
});

test('/spend/add?type=income in the wallet area opens the income tray over Home', async () => {
  flags({ redesign: 'wallet' });
  shared.resources = createFakeResources({ categories: BUILTINS }).resources;
  nav.pathname = '/spend/add';
  nav.params = { type: 'income' };
  nav.slot = SpendAddRoute;
  const view = mount(<SpendLayout />, 'th');
  await settle();
  startAnimations();
  // The route opens the shell's tray on the type its link names, then goes to Home in its place.
  theOne('dialog', 'จดรายรับ');
  expect(nav.router.replace.mock.calls).toEqual([['/spend']]);
  expect(nav.router.push).not.toHaveBeenCalled();
  // Home under it: the tray stays open over Home, with the bar.
  nav.pathname = '/spend';
  nav.slot = null;
  view.rerender(<IntlProvider locale="th"><ThemeProvider><ThemePreferenceOverride preference="light"><SpendLayout /></ThemePreferenceOverride></ThemeProvider></IntlProvider>);
  await settle();
  theOne('dialog', 'จดรายรับ');
  expect(screen.queryAllByText('current screen')).toHaveLength(1);
  counted('wallet-tab-bar', 1, 'home');
  cleanup();
  nav.router.replace.mockReset();
  // Outside the wallet area, and in the legacy build (whose layout draws no shell), /spend/add is today's Quick add.
  for (const flag of [{ redesign: undefined }, { redesign: 'wallet', legacy: '1' }]) {
    flags(flag);
    nav.pathname = '/spend/add';
    nav.slot = SpendAddRoute;
    mount(<SpendLayout />, 'th');
    await settle();
    expect(screen.queryAllByText('quick add'), JSON.stringify(flag)).toHaveLength(1);
    expect([nav.router.replace.mock.calls, nav.router.push.mock.calls], JSON.stringify(flag)).toEqual([[], []]);
    cleanup();
  }
});

test('a link to /spend/add is read through addRequestOf: an unknown type, an amount, an empty id and a list open the plain spending tray with nothing from the link', async () => {
  // A deep link is untrusted text: only what addRequestOf accepts reaches the tray.
  const wallet: WalletSnapshot = { id: '0000000a-0000-4000-8000-000000000001', name: 'เงินสด', currency: 'THB', opening_minor: '0', tracking_start: '2026-01-01', archived: false, version: 1 };
  flags({ redesign: 'wallet' });
  shared.resources = createFakeResources({ wallets: [wallet], categories: BUILTINS }).resources;
  nav.pathname = '/spend/add';
  nav.params = { type: 'refund', amount: '999999', walletId: '', copyOf: ['a', 'b'], note: 'x' };
  nav.slot = SpendAddRoute;
  mount(<SpendLayout />, 'th');
  await settle();
  startAnimations();
  theOne('dialog', 'จดรายจ่าย');
  expect(screen.queryAllByTestId('add-amount').map((amount) => amount.textContent)).toEqual(['฿0']);
  expect(nav.router.replace.mock.calls).toEqual([['/spend']]);
});

test("a record's copy linked to /spend/add in the wallet area opens in the shell's tray, never today's Quick add", async () => {
  // A copy asked where no tray host is (useAddTray's fallback pushes /spend/add?copyOf=...) lands in the wallet's tray too.
  const wallet: WalletSnapshot = { id: '0000000a-0000-4000-8000-000000000001', name: 'เงินสด', currency: 'THB', opening_minor: '0', tracking_start: '2026-01-01', archived: false, version: 1 };
  const copied = {
    id: '0000000b-0000-4000-8000-000000000009', type: 'expense', amount_minor: '18200', occurred_on: '2026-11-01', wallet_id: wallet.id,
    category_id: BUILTINS[0].id, note: null, merchant: null, deleted_at: null, version: 1,
  } as TransactionDto;
  flags({ redesign: 'wallet' });
  shared.resources = createFakeResources({ wallets: [wallet], categories: BUILTINS, records: [copied] }).resources;
  nav.pathname = '/spend/add';
  nav.params = { copyOf: copied.id };
  nav.slot = SpendAddRoute;
  mount(<SpendLayout />, 'th');
  await settle();
  startAnimations();
  theOne('dialog', 'จดรายจ่าย');
  expect(screen.queryAllByTestId('add-amount').map((amount) => amount.textContent)).toEqual(['฿182']);
  expect(screen.queryAllByText('quick add')).toHaveLength(0);
  expect(nav.router.replace.mock.calls).toEqual([['/spend']]);
});

test('in the wallet area, a never-asked consent question renders in place of the wallet shell', async () => {
  const recorded = await recordAnalytics({ consent: 'unasked' });
  try {
    flags({ redesign: 'wallet,analytics' });
    mount(<SpendLayout />, 'th');
    // The question, inside the diary (and CompanionBoundary), with no shell: no bar, no + and no tray.
    const question = theOne('heading', 'ช่วยพัฒนา Jotbun');
    const [diary] = counted('device-diary', 1, 'asked');
    expect(diary?.contains(question)).toBe(true);
    counted('wallet-shell', 0, 'asked');
    counted('wallet-tab-bar', 0, 'asked');
    expect(screen.queryAllByRole('button', { name: 'จดรายการ' })).toHaveLength(0);
    expect(screen.queryAllByText('current screen')).toHaveLength(0);
    // A no is in force at the call: the shell comes back at once.
    act(() => { void recorded.analytics.answer('no'); });
    expect(screen.queryAllByRole('heading', { name: 'ช่วยพัฒนา Jotbun' })).toHaveLength(0);
    counted('wallet-shell', 1, 'answered');
    counted('wallet-tab-bar', 1, 'answered');
    expect(screen.queryAllByText('current screen')).toHaveLength(1);
  } finally {
    recorded.restore();
  }
});
