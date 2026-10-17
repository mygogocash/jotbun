import { createElement, useState } from 'react';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { Window } from 'happy-dom';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { ThemeProvider } from '@mobile/theme/ThemeProvider';
import { useThemedStyles } from '@mobile/theme/useThemedStyles';
import { createSpendStyles } from './spendStyles';
import { SpendIntro } from './SpendIntroScreen';
import { autologCashbackPurchases } from './spendResource';

// Navigation and the native status bar belong to the platform, not the
// introduction. Its content, controls, theme, and state transition stay real.
vi.mock('expo-router', () => ({ useRouter: () => ({ canGoBack: () => false, replace: () => undefined }) }));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
// SVG's Metro-only asset registry is outside this control/state test; the
// actual vector rendering is checked in the browser smoke test.
vi.mock('react-native-svg', () => ({
  default: ({ children }: { children: React.ReactNode }) => createElement('svg', null, children),
  Defs: ({ children }: { children: React.ReactNode }) => createElement('defs', null, children),
  LinearGradient: ({ children }: { children: React.ReactNode }) => createElement('linearGradient', null, children),
  Rect: () => createElement('rect'), Stop: () => createElement('stop'),
}));

function Harness() {
  const [left, setLeft] = useState(false);
  const styles = useThemedStyles(createSpendStyles);
  return left ? <p>Continue to your diary</p> : <SpendIntro styles={styles} tc={value => value} onLeave={() => setLeft(true)} />;
}
beforeAll(() => {
  // Node 26 exposes a separate, unconfigured Web Storage getter. Use the
  // browser environment's real Storage implementation for this UI suite.
  const storage = new Window({ url: 'http://localhost:8081' }).localStorage;
  vi.stubGlobal('localStorage', storage);
  Object.defineProperty(window, 'localStorage', { configurable: true, value: storage });
});
afterEach(() => { cleanup(); window.localStorage.clear(); });
function mount() { return render(<IntlProvider locale="en"><ThemeProvider><Harness /></ThemeProvider></IntlProvider>); }

test('the introduction renders useful content and its primary control continues', () => {
  mount();
  expect(screen.getByText('Your money has been sneaking off')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: "Let's start!" }));
  expect(screen.getByText('Continue to your diary')).toBeTruthy();
});

test('appearance controls change the rendered theme and persist the choice', () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(window.localStorage.getItem('gogospend.theme.preference')).toBe('dark');
  fireEvent.click(screen.getByRole('button', { name: 'Light' }));
  expect(document.documentElement.dataset.theme).toBe('light');
});

test('unconnected cashback history is explicitly unavailable before account or network access', async () => {
  await expect(autologCashbackPurchases()).rejects.toMatchObject({ status: 503, code: 'CASHBACK_SYNC_UNAVAILABLE' });
});
