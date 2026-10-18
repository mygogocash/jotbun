import { cleanup, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { IntlProvider } from 'react-intl';
import { AccessibilityInfo, Platform } from 'react-native';
import { afterEach, expect, test, vi } from 'vitest';

import type { Locale } from '@mobile/i18n/locales';
import { translateCopy } from '@mobile/i18n/messages';
import { bunDark, bunLight } from '@mobile/theme/bunPalette';
import { bunText } from '@mobile/theme/bunType';
import { ThemePreferenceOverride, ThemeProvider } from '@mobile/theme/ThemeProvider';
import { StagedProgress } from './StagedProgress';
import type { ProgressStage } from './StagedProgress';

// The iOS test flips Platform.OS, which sends the theme to native storage.
vi.mock('@mobile/theme/themePreferenceStorage', () => ({
  readStoredThemePreferenceSync: () => null,
  readStoredThemePreference: async () => null,
  writeStoredThemePreference: async () => undefined,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const LOCALES: readonly Locale[] = ['en', 'th', 'vi'];
const MODES = [['light', bunLight], ['dark', bunDark]] as const;

function wrap(ui: ReactElement, locale: Locale = 'en', mode: 'light' | 'dark' = 'light') {
  return <IntlProvider locale={locale}><ThemeProvider><ThemePreferenceOverride preference={mode}>{ui}</ThemePreferenceOverride></ThemeProvider></IntlProvider>;
}
function mount(ui: ReactElement, locale: Locale = 'en', mode: 'light' | 'dark' = 'light') {
  return render(wrap(ui, locale, mode));
}
const rgb = (hex: string) => `rgba(${[1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)).join(', ')}, 1.00)`;

const stages: ProgressStage[] = [
  { key: 'read', label: 'Read the file', status: 'done', done: 1234, total: 1234 },
  { key: 'check', label: 'Check rows', status: 'active', done: 120, total: 5678 },
  { key: 'save', label: 'Save to your diary', status: 'pending' },
  { key: 'sync', label: 'Sync', status: 'failed', done: 3 },
];

test('each stage is spoken with its state and its count', () => {
  mount(<StagedProgress title="Importing" stages={stages} />);
  expect(screen.getByRole('heading', { name: 'Importing' })).toBeTruthy();
  expect(screen.getByLabelText('Read the file, Done, 1,234 of 1,234')).toBeTruthy();
  expect(screen.getByLabelText('Check rows, In progress, 120 of 5,678')).toBeTruthy();
  expect(screen.getByLabelText('Save to your diary, Waiting')).toBeTruthy();
  expect(screen.getByLabelText('Sync, Failed, 3')).toBeTruthy();
});

test('the state is shown as a word beside its tick in every locale', () => {
  for (const locale of LOCALES) {
    mount(<StagedProgress stages={stages} />, locale);
    for (const word of ['Done', 'In progress', 'Waiting', 'Failed']) {
      const node = screen.getByText(translateCopy(word, locale));
      expect(node.style.lineHeight).toBe(`${bunText('caption', locale === 'th' ? 'thai' : 'latin').lineHeight}px`);
    }
    expect(screen.getByText('1,234 of 1,234')).toBeTruthy();
    cleanup();
  }
  mount(<StagedProgress stages={stages} />, 'th');
  expect(screen.getByText('ล้มเหลว')).toBeTruthy();
});

test('ticks are decorative and each tone matches its state', () => {
  for (const [mode, colors] of MODES) {
    mount(<StagedProgress stages={stages} />, 'en', mode);
    const marks = ['Read the file, Done, 1,234 of 1,234', 'Check rows, In progress, 120 of 5,678', 'Save to your diary, Waiting', 'Sync, Failed, 3']
      .map((label) => screen.getByLabelText(label).querySelector('[aria-hidden="true"]'));
    expect(marks.map((mark) => mark?.textContent)).toEqual(['✓', '•', '○', '!']);
    expect(screen.getByText('Done').style.color).toBe(rgb(colors.ink));
    expect(screen.getByText('In progress').style.color).toBe(rgb(colors.accent));
    expect(screen.getByText('Waiting').style.color).toBe(rgb(colors.muted));
    expect(screen.getByText('Failed').style.color).toBe(rgb(colors.ink));
    cleanup();
  }
});

test('rows are polite live regions, so a stage that changes state is read out', () => {
  const { rerender } = mount(<StagedProgress stages={stages} />);
  const row = screen.getByLabelText('Check rows, In progress, 120 of 5,678');
  expect(row.getAttribute('aria-live')).toBe('polite');
  rerender(wrap(<StagedProgress stages={stages.map((stage) => (stage.key === 'check' ? { ...stage, status: 'done', done: 5678 } : stage))} />));
  expect(screen.getByLabelText('Check rows, Done, 5,678 of 5,678')).toBeTruthy();
});

test('iOS hears the stage that just changed', () => {
  const announce = vi.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  const os = Platform.OS;
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true, writable: true });
  try {
    const first = stages.slice(0, 3);
    const { rerender } = mount(<StagedProgress stages={first} />);
    expect(announce).toHaveBeenLastCalledWith('Check rows, In progress, 120 of 5,678');
    rerender(wrap(<StagedProgress stages={first.map((stage) => (stage.key === 'check' ? { ...stage, status: 'done', done: 5678 } : stage.key === 'save' ? { ...stage, status: 'active' } : stage))} />));
    expect(announce).toHaveBeenLastCalledWith('Save to your diary, In progress');
    rerender(wrap(<StagedProgress stages={stages} />));
    expect(announce).toHaveBeenLastCalledWith('Sync, Failed, 3');
  } finally {
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true, writable: true });
  }
});
