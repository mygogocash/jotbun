import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { IntlProvider } from 'react-intl';
import { View } from 'react-native';
import { afterEach, expect, test, vi } from 'vitest';

import type { Locale } from '@mobile/i18n/locales';
import { bunDark, bunLight } from '@mobile/theme/bunPalette';
import { bunText } from '@mobile/theme/bunType';
import { ThemePreferenceOverride, ThemeProvider } from '@mobile/theme/ThemeProvider';
import { BUN_SPACE } from './layout';
import { TabBar } from './TabBar';
import type { TabBarItem } from './TabBar';

vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 47, right: 0, bottom: 34, left: 0 }) }));

afterEach(() => cleanup());

const LOCALES: readonly Locale[] = ['en', 'th', 'vi'];
const MODES = [['light', bunLight], ['dark', bunDark]] as const;

function mount(ui: ReactElement, locale: Locale = 'en', mode: 'light' | 'dark' = 'light') {
  return render(<IntlProvider locale={locale}><ThemeProvider><ThemePreferenceOverride preference={mode}>{ui}</ThemePreferenceOverride></ThemeProvider></IntlProvider>);
}
const rgb = (hex: string) => `rgba(${[1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)).join(', ')}, 1.00)`;

const items: TabBarItem[] = [
  { key: 'home', label: 'Home', icon: ({ selected, color }) => <View testID={`icon-home-${selected}`} accessibilityLabel={color} /> },
  { key: 'history', label: 'History', icon: <View testID="icon-history" /> },
  { key: 'budgets', label: 'Budgets', icon: <View testID="icon-budgets" /> },
  { key: 'me', label: 'Me', icon: <View testID="icon-me" /> },
];

function bar(active = 'home', onSelect = vi.fn(), onAdd = vi.fn()) {
  return <TabBar items={items} active={active} onSelect={onSelect} onAdd={onAdd} addLabel="Add a record" />;
}

test('tabs carry the tab role, their names and the selected state', () => {
  const onSelect = vi.fn();
  mount(bar('history', onSelect));
  const list = screen.getByRole('tablist');
  const tabs = within(list).getAllByRole('tab');
  expect(tabs.map((tab) => tab.getAttribute('aria-label') ?? tab.textContent)).toEqual(['Home', 'History', 'Budgets', 'Me']);
  expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false', 'false']);
  fireEvent.click(screen.getByRole('tab', { name: 'Budgets' }));
  expect(onSelect).toHaveBeenCalledWith('budgets');
});

test('the round add button sits in the centre and has its own label', () => {
  const onAdd = vi.fn();
  mount(bar('home', vi.fn(), onAdd));
  const add = screen.getByRole('button', { name: 'Add a record' });
  fireEvent.click(add);
  expect(onAdd).toHaveBeenCalledTimes(1);
  const order = Array.from(screen.getByRole('tablist').querySelectorAll('[role="tab"], [role="button"]')).map((node) => node.getAttribute('aria-label'));
  expect(order).toEqual(['Home', 'History', 'Add a record', 'Budgets', 'Me']);
  expect(add.style.minHeight).not.toBe('');
  expect(Number.parseFloat(add.style.minHeight)).toBeGreaterThanOrEqual(44);
  expect(add.style.borderTopLeftRadius || add.style.borderRadius).toBe('999px');
});

test('a floating ink pill: onInk labels, the selected tab on cream with ink, a cream add button', () => {
  for (const [mode, colors] of MODES) {
    mount(bar('home'), 'en', mode);
    const pill = screen.getByRole('tablist');
    expect(pill.style.backgroundColor).toBe(rgb(colors.ink));
    expect(pill.style.borderTopLeftRadius || pill.style.borderRadius).toBe('999px');
    expect(screen.getByRole('tab', { name: 'Home' }).style.backgroundColor).toBe(rgb(colors.card));
    expect(screen.getByText('Home').style.color).toBe(rgb(colors.ink));
    expect(screen.getByText('History').style.color).toBe(rgb(colors.onInk));
    expect(screen.getByRole('button', { name: 'Add a record' }).style.backgroundColor).toBe(rgb(colors.card));
    expect(screen.getByText('+').style.color).toBe(rgb(colors.ink));
    // Icons drawn by a function get the colour of their ground.
    expect(screen.getByTestId('icon-home-true').getAttribute('aria-label')).toBe(colors.ink);
    cleanup();
  }
  mount(bar('history'));
  expect(screen.getByTestId('icon-home-false').getAttribute('aria-label')).toBe(bunLight.onInk);
});

test('every tab is at least 44 pt and the bar sits above the bottom safe area', () => {
  mount(bar());
  for (const tab of screen.getAllByRole('tab')) {
    expect(tab.style.minHeight).toBe('44px');
    expect(tab.style.minWidth).toBe('44px');
  }
  expect(screen.getByTestId('tab-bar').style.paddingBottom).toBe(`${34 + BUN_SPACE.xs}px`);
});

test('icons are decorative: the label names the tab', () => {
  mount(bar());
  const icon = screen.getByTestId('icon-history');
  expect(icon.closest('[aria-hidden="true"]')).not.toBeNull();
  expect(screen.getByText('+').closest('[aria-hidden="true"]')).not.toBeNull();
});

test('labels keep their locale\'s leading', () => {
  for (const locale of LOCALES) {
    mount(<TabBar items={[{ key: 'home', label: 'หน้าแรก', icon: null }, { key: 'me', label: 'ฉัน', icon: null }]} active="home" onSelect={vi.fn()} onAdd={vi.fn()} addLabel="เพิ่มรายการ" />, locale);
    expect(screen.getByText('หน้าแรก').style.lineHeight).toBe(`${bunText('micro', locale === 'th' ? 'thai' : 'latin').lineHeight}px`);
    expect(screen.getByRole('button', { name: 'เพิ่มรายการ' })).toBeTruthy();
    cleanup();
  }
});
