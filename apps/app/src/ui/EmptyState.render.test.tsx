import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { IntlProvider } from 'react-intl';
import { View } from 'react-native';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';

import type { Locale } from '@mobile/i18n/locales';
import { installBrowserStorage, mountMascot } from '@mobile/mascot/mascotTestHarness';
import { bunDark, bunLight } from '@mobile/theme/bunPalette';
import { bunText } from '@mobile/theme/bunType';
import { ThemePreferenceOverride, ThemeProvider } from '@mobile/theme/ThemeProvider';
import { EmptyState } from './EmptyState';

beforeAll(() => { installBrowserStorage(); });
afterEach(() => cleanup());

const LOCALES: readonly Locale[] = ['en', 'th', 'vi'];
const MODES = [['light', bunLight], ['dark', bunDark]] as const;

function mount(ui: ReactElement, locale: Locale = 'en', mode: 'light' | 'dark' = 'light') {
  return render(<IntlProvider locale={locale}><ThemeProvider><ThemePreferenceOverride preference={mode}>{ui}</ThemePreferenceOverride></ThemeProvider></IntlProvider>);
}
const rgb = (hex: string) => `rgba(${[1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)).join(', ')}, 1.00)`;

test('a headline naming the space, one line of body and one action', () => {
  for (const [mode, colors] of MODES) {
    const onPress = vi.fn();
    mount(<EmptyState title="No wallets yet" body="Add the cash or bank account you spend from." action={{ label: 'Add your first wallet', onPress }} />, 'en', mode);
    const title = screen.getByRole('heading', { name: 'No wallets yet' });
    expect(title.style.color).toBe(rgb(colors.ink));
    expect(screen.getByText('Add the cash or bank account you spend from.').style.color).toBe(rgb(colors.muted));
    const action = screen.getByRole('button', { name: 'Add your first wallet' });
    expect(action.style.backgroundColor).toBe(rgb(colors.ink));
    fireEvent.click(action);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    cleanup();
  }
});

test('the action can be secondary when the screen already has its primary', () => {
  mount(<EmptyState title="No records" body="Nothing this month." action={{ label: 'Clear filters', onPress: vi.fn(), kind: 'secondary' }} />);
  expect(screen.getByRole('button', { name: 'Clear filters' }).style.backgroundColor).not.toBe(rgb(bunLight.ink));
});

test('the art is decorative', () => {
  mount(<EmptyState art={<View testID="thinking-bun" />} title="No records" body="Nothing this month." action={{ label: 'Add a record', onPress: vi.fn() }} />);
  expect(screen.getByTestId('thinking-bun').closest('[aria-hidden="true"]')).not.toBeNull();
});

test('the action is optional: without one there is no button at all', () => {
  mount(<EmptyState title="Add your first wallet" body="A wallet is where money sits." />);
  expect(screen.getByRole('heading', { name: 'Add your first wallet' })).toBeTruthy();
  expect(screen.getByText('A wallet is where money sits.')).toBeTruthy();
  expect(screen.queryAllByRole('button')).toHaveLength(0);
});

test('with no art, or with the bun turned off, the art space collapses', () => {
  // No art: nothing is drawn above the headline.
  mount(<EmptyState title="No records" body="Nothing this month." />);
  expect(screen.queryByTestId('empty-state-art')).toBeNull();
  cleanup();
  // Art at full intensity keeps its space.
  mountMascot(<EmptyState art={<View testID="thinking-bun" />} title="No records" body="Nothing this month." />, { intensity: 'full' });
  expect(screen.getByTestId('empty-state-art')).toBeTruthy();
  expect(screen.getByTestId('thinking-bun')).toBeTruthy();
  cleanup();
  window.localStorage.clear();
  // Quiet keeps the bun on empty states.
  mountMascot(<EmptyState art={<View testID="thinking-bun" />} title="No records" body="Nothing this month." />, { intensity: 'quiet' });
  expect(screen.getByTestId('empty-state-art')).toBeTruthy();
  cleanup();
  window.localStorage.clear();
  // Off: the art (and the margin it would keep) is not drawn at all.
  mountMascot(<EmptyState art={<View testID="thinking-bun" />} title="No records" body="Nothing this month." />, { intensity: 'off' });
  expect(screen.queryByTestId('empty-state-art')).toBeNull();
  expect(screen.queryByTestId('thinking-bun')).toBeNull();
  expect(screen.getByRole('heading', { name: 'No records' })).toBeTruthy();
  window.localStorage.clear();
});

test('text keeps each locale\'s leading', () => {
  for (const locale of LOCALES) {
    mount(<EmptyState title="ยังไม่มีกระเป๋าเงิน" body="เพิ่มเงินสดหรือบัญชีที่ใช้จ่าย" action={{ label: 'เพิ่มกระเป๋าเงิน', onPress: vi.fn() }} />, locale);
    const script = locale === 'th' ? 'thai' : 'latin';
    expect(screen.getByText('ยังไม่มีกระเป๋าเงิน').style.lineHeight).toBe(`${bunText('heading', script).lineHeight}px`);
    expect(screen.getByText('เพิ่มเงินสดหรือบัญชีที่ใช้จ่าย').style.lineHeight).toBe(`${bunText('body', script).lineHeight}px`);
    cleanup();
  }
});
