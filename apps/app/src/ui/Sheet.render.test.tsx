import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { IntlProvider } from 'react-intl';
import { Animated, View } from 'react-native';
import { afterEach, expect, test, vi } from 'vitest';

import type { Locale } from '@mobile/i18n/locales';
import { translateCopy } from '@mobile/i18n/messages';
import { bunDark, bunLight } from '@mobile/theme/bunPalette';
import { bunText } from '@mobile/theme/bunType';
import { ThemePreferenceOverride, ThemeProvider } from '@mobile/theme/ThemeProvider';
import { walletLight } from '@mobile/theme/walletPalette';
import { BunText } from './BunText';
import { BUN_SPACE } from './layout';
import { LockCoverContext } from './lockCover';
import { ConfirmSheet, Sheet, SHEET_SLIDE_FROM } from './Sheet';

vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 47, right: 0, bottom: 34, left: 0 }) }));
const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock('@mobile/hooks/useReducedMotion', () => ({ useReducedMotion: () => motion.reduced }));

afterEach(() => {
  cleanup();
  motion.reduced = false;
});

const LOCALES: readonly Locale[] = ['en', 'th', 'vi'];
const MODES = [['light', bunLight], ['dark', bunDark]] as const;

function mount(ui: ReactElement, locale: Locale = 'en', mode: 'light' | 'dark' = 'light') {
  return render(<IntlProvider locale={locale}><ThemeProvider><ThemePreferenceOverride preference={mode}>{ui}</ThemePreferenceOverride></ThemeProvider></IntlProvider>);
}
const rgb = (hex: string) => `rgba(${[1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)).join(', ')}, 1.00)`;

function sheet(onClose = vi.fn(), visible = true) {
  return <Sheet visible={visible} onClose={onClose} title="Pick a wallet"><BunText>Cash</BunText></Sheet>;
}

test('a hidden sheet renders nothing', () => {
  mount(sheet(vi.fn(), false));
  expect(screen.queryByRole('dialog', { name: 'Pick a wallet' })).toBeNull();
  expect(screen.queryByText('Cash')).toBeNull();
});

test('an open sheet is a named dialog with a heading, its content and a 44 pt close button', () => {
  for (const locale of LOCALES) {
    mount(sheet(), locale);
    const dialog = screen.getByRole('dialog', { name: 'Pick a wallet' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Pick a wallet' }).style.lineHeight).toBe(`${bunText('heading', locale === 'th' ? 'thai' : 'latin').lineHeight}px`);
    expect(screen.getByText('Cash')).toBeTruthy();
    const close = screen.getByRole('button', { name: translateCopy('Close', locale) });
    expect(close.style.minHeight).toBe('44px');
    expect(close.style.minWidth).toBe('44px');
    cleanup();
  }
});

test('it closes from the close button, the backdrop and the system back (Escape on the web)', () => {
  const onClose = vi.fn();
  mount(sheet(onClose));
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(onClose).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByTestId('sheet-backdrop'));
  expect(onClose).toHaveBeenCalledTimes(2);
  // react-native-web routes Escape to `onRequestClose`, the prop Android's back button calls.
  act(() => { document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' })); });
  expect(onClose).toHaveBeenCalledTimes(3);
});

test('focus moves into the sheet when it opens', async () => {
  const before = document.createElement('button');
  document.body.appendChild(before);
  before.focus();
  mount(sheet());
  const dialog = screen.getByRole('dialog', { name: 'Pick a wallet' });
  await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  before.remove();
});

test('on the web there is exactly one dialog, and it carries the sheet\'s name', () => {
  for (const locale of LOCALES) {
    mount(sheet(), locale);
    // react-native-web's Modal makes its own full-screen layer the dialog; the sheet names
    // that layer instead of nesting a second dialog inside an unnamed one.
    const dialogs = screen.getAllByRole('dialog');
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0].getAttribute('aria-label')).toBe('Pick a wallet');
    expect(dialogs[0].getAttribute('aria-modal')).toBe('true');
    const panel = screen.getByTestId('sheet-panel');
    expect(dialogs[0].contains(panel)).toBe(true);
    expect(panel.getAttribute('role')).toBeNull();
    expect(panel.getAttribute('aria-label')).toBeNull();
    cleanup();
  }
  // A confirm sheet is a sheet too.
  mount(<ConfirmSheet visible title="Delete this entry?" consequence="It moves to Recently deleted." confirmLabel="Delete entry" onConfirm={vi.fn()} onCancel={vi.fn()} />);
  expect(screen.getAllByRole('dialog').map((dialog) => dialog.getAttribute('aria-label'))).toEqual(['Delete this entry?']);
});

// Review m6: closing a sheet puts focus back on the control that opened it.
test('closing the sheet returns focus to the control that opened it', async () => {
  const opener = document.createElement('button');
  document.body.appendChild(opener);
  opener.focus();
  const view = mount(sheet());
  const dialog = screen.getByRole('dialog', { name: 'Pick a wallet' });
  await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  view.rerender(<IntlProvider locale="en"><ThemeProvider><ThemePreferenceOverride preference="light">{sheet(vi.fn(), false)}</ThemePreferenceOverride></ThemeProvider></IntlProvider>);
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(opener));
  opener.remove();
});

test('a cream sheet over a dimmed backdrop the screen reader skips', () => {
  for (const [mode, colors] of MODES) {
    mount(sheet(), 'en', mode);
    // The cream panel sits inside the one dialog (see the single-dialog test above).
    const panel = screen.getByTestId('sheet-panel');
    expect(screen.getByRole('dialog', { name: 'Pick a wallet' }).contains(panel)).toBe(true);
    expect(panel.style.backgroundColor).toBe(rgb(colors.card));
    expect(panel.style.borderTopLeftRadius).toBe('24px');
    expect(panel.style.paddingBottom).toBe(`${34 + BUN_SPACE.lg}px`);
    const backdrop = screen.getByTestId('sheet-backdrop');
    expect(backdrop.getAttribute('aria-hidden')).toBe('true');
    expect(backdrop.style.backgroundColor).toBe(rgb(colors.isDark ? colors.background : colors.ink));
    expect(Number(backdrop.style.opacity)).toBeGreaterThan(0);
    expect(Number(backdrop.style.opacity)).toBeLessThan(1);
    cleanup();
  }
});

test('the sheet springs up from below, except under reduced motion', () => {
  // Animated settles at once under test, so watch the flight being asked for.
  const spring = vi.spyOn(Animated, 'spring');
  mount(sheet());
  expect(spring).toHaveBeenCalledTimes(1);
  const [value, config] = spring.mock.calls[0];
  expect(config).toMatchObject({ toValue: 0, damping: 30, stiffness: 180 });
  expect(value).toBeInstanceOf(Animated.Value);
  cleanup();
  spring.mockClear();
  motion.reduced = true;
  mount(sheet());
  expect(spring).not.toHaveBeenCalled();
  expect(screen.getByTestId('sheet-panel').style.transform).toBe('translateY(0px)');
  spring.mockRestore();
});

test('the slide starts the sheet below its resting place', () => {
  const values: number[] = [];
  const spring = vi.spyOn(Animated, 'spring').mockImplementation((value) => {
    values.push(Number(JSON.stringify(value)));
    return { start: () => undefined, stop: () => undefined, reset: () => undefined } as unknown as Animated.CompositeAnimation;
  });
  mount(sheet());
  expect(values).toEqual([SHEET_SLIDE_FROM]);
  expect(screen.getByTestId('sheet-panel').style.transform).toBe(`translateY(${SHEET_SLIDE_FROM}px)`);
  spring.mockRestore();
});

function confirm(props: Partial<Parameters<typeof ConfirmSheet>[0]> = {}) {
  return (
    <ConfirmSheet
      visible
      title="Delete this entry?"
      consequence="Coffee ฿65.00 moves to Recently deleted for 30 days."
      confirmLabel="Delete entry"
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
      {...props}
    />
  );
}

test('a confirm sheet states the consequence and offers confirm and cancel', () => {
  for (const locale of LOCALES) {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    mount(confirm({ onConfirm, onCancel }), locale);
    expect(screen.getByRole('dialog', { name: 'Delete this entry?' })).toBeTruthy();
    expect(screen.getByText('Coffee ฿65.00 moves to Recently deleted for 30 days.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete entry' }));
    fireEvent.click(screen.getByRole('button', { name: translateCopy('Cancel', locale) }));
    fireEvent.click(screen.getByTestId('sheet-backdrop'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(2);
    cleanup();
  }
});

test('an ordinary confirm is the one primary; a destructive one leaves the safe choice primary', () => {
  for (const [mode, colors] of MODES) {
    mount(confirm({ confirmLabel: 'Save changes', cancelLabel: 'Keep editing' }), 'en', mode);
    expect(screen.getByRole('button', { name: 'Save changes' }).style.backgroundColor).toBe(rgb(colors.ink));
    expect(screen.getByRole('button', { name: 'Keep editing' }).style.backgroundColor).not.toBe(rgb(colors.ink));
    cleanup();
    mount(confirm({ destructive: true }), 'en', mode);
    expect(screen.getByRole('button', { name: 'Delete entry' }).style.backgroundColor).not.toBe(rgb(colors.ink));
    expect(screen.getByRole('button', { name: 'Cancel' }).style.backgroundColor).toBe(rgb(colors.ink));
    cleanup();
  }
});

test('the art slot is decorative', () => {
  mount(confirm({ art: <View testID="quiet-bun" /> }));
  expect(screen.getByTestId('quiet-bun').closest('[aria-hidden="true"]')).not.toBeNull();
});

test('while busy, confirm is marked busy and nothing closes the sheet', () => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  mount(confirm({ busy: true, onConfirm, onCancel }));
  const confirmButton = screen.getByRole('button', { name: 'Delete entry' });
  expect(confirmButton.getAttribute('aria-busy')).toBe('true');
  fireEvent.click(confirmButton);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.click(screen.getByTestId('sheet-backdrop'));
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(onConfirm).not.toHaveBeenCalled();
  expect(onCancel).not.toHaveBeenCalled();
});

// R63 (P2-T33): under the Face ID lock's cover a sheet draws the cover in place of its backdrop and panel. Nothing of
// it is drawn or named, and Android's back (Escape on the web) asks nothing; when the cover lifts it is as it was.
test("a hidden lock cover replaces the sheet's content", () => {
  const onClose = vi.fn();
  const covered = (hidden: boolean) => (
    <IntlProvider locale="en">
      <ThemeProvider>
        <ThemePreferenceOverride preference="light">
          <LockCoverContext.Provider value={{ hidden }}>{sheet(onClose)}</LockCoverContext.Provider>
        </ThemePreferenceOverride>
      </ThemeProvider>
    </IntlProvider>
  );
  const view = render(covered(true));
  const cover = screen.queryByTestId('lock-cover');
  expect(cover, 'the lock cover').not.toBeNull();
  expect(cover?.getAttribute('aria-hidden')).toBe('true');
  expect(cover?.style.backgroundColor).toBe(rgb(walletLight.ground));
  expect(screen.queryByTestId('sheet-panel')).toBeNull();
  expect(screen.queryByTestId('sheet-backdrop')).toBeNull();
  expect(screen.queryByText('Cash')).toBeNull();
  expect(screen.queryByText('Pick a wallet')).toBeNull();
  expect(screen.queryByRole('dialog')?.getAttribute('aria-label')).toBeNull();
  act(() => { document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' })); });
  expect(onClose).not.toHaveBeenCalled();
  view.rerender(covered(false));
  expect(screen.queryByTestId('lock-cover')).toBeNull();
  expect(screen.queryByRole('dialog', { name: 'Pick a wallet' })).not.toBeNull();
  expect(screen.queryByText('Cash')).not.toBeNull();
  act(() => { document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' })); });
  expect(onClose).toHaveBeenCalledTimes(1);
});

// The backdrop is hidden from screen readers, so it is never a tab stop either: react-native-web's Pressable reads
// tabIndex, not focusable (P2-T13's planner notes).
test('the backdrop is never a tab stop', () => {
  mount(sheet());
  expect(screen.getByTestId('sheet-backdrop').getAttribute('tabindex')).toBe('-1');
});
