import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

// react-native-svg's web build resolves image hrefs through React Native's
// asset registry, which only Metro provides. The kit draws no images, so that
// one resolver is stubbed and the real SVG elements still render (as in R1).
vi.mock('../../../../node_modules/react-native-svg/lib/module/lib/resolveAssetUri.web.js', () => ({ resolveAssetUri: () => null }));

import { haptics } from '@mobile/lib/haptics';
import { Keypad, KEYPAD_KEY_MIN } from './Keypad';
import { MATRIX, mountKit, rgb } from './entryKitTestHarness';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const KEYS: readonly (readonly [string, string])[] = [
  ['7', '7'], ['8', '8'], ['9', '9'], ['4', '4'], ['5', '5'], ['6', '6'], ['1', '1'], ['2', '2'], ['3', '3'], ['0', '0'],
  ['Triple zero', '000'], ['Decimal point', '.'], ['Delete', 'backspace'], ['Clear', 'clear'],
  ['Plus', 'add'], ['Minus', 'subtract'], ['Times', 'multiply'], ['Divided by', 'divide'], ['Equals', 'equals'],
];

test('every key has a spoken label and sends its key', () => {
  const onKey = vi.fn();
  const haptic = vi.fn();
  mountKit(<Keypad onKey={onKey} haptic={haptic} />);
  expect(screen.getAllByRole('button')).toHaveLength(KEYS.length);
  for (const [label, key] of KEYS) {
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(onKey).toHaveBeenLastCalledWith(key);
  }
  expect(onKey).toHaveBeenCalledTimes(KEYS.length);
  expect(haptic).toHaveBeenCalledTimes(KEYS.length);
});

test('presses go through the app haptics (expo-haptics, silent on web)', () => {
  const selection = vi.spyOn(haptics, 'selection').mockResolvedValue(undefined);
  mountKit(<Keypad onKey={() => undefined} />);
  fireEvent.click(screen.getByRole('button', { name: '5' }));
  expect(selection).toHaveBeenCalledTimes(1);
});

test('the keypad never opens the system keyboard', () => {
  const { container } = mountKit(<Keypad onKey={() => undefined} />);
  expect(container.querySelectorAll('input, textarea, [contenteditable]')).toHaveLength(0);
  expect(screen.getByRole('group', { name: 'Keypad' })).toBeTruthy();
});

test('keys are large targets of at least 56 points', () => {
  mountKit(<Keypad onKey={() => undefined} />);
  expect(KEYPAD_KEY_MIN).toBeGreaterThanOrEqual(56);
  for (const button of screen.getAllByRole('button')) {
    expect(Number.parseFloat(button.style.minHeight)).toBeGreaterThanOrEqual(56);
    expect(Number.parseFloat(button.style.minWidth)).toBeGreaterThanOrEqual(56);
  }
});

test('a disabled keypad sends nothing and says it is disabled', () => {
  const onKey = vi.fn();
  const haptic = vi.fn();
  mountKit(<Keypad onKey={onKey} haptic={haptic} disabled />);
  for (const button of screen.getAllByRole('button')) {
    expect(button.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(button);
  }
  expect(onKey).not.toHaveBeenCalled();
  expect(haptic).not.toHaveBeenCalled();
});

test('labels follow the locale, and = is the ink key in light and dark', () => {
  for (const { locale, mode, colors } of MATRIX) {
    mountKit(<Keypad onKey={() => undefined} />, { locale, mode });
    const remove = locale === 'th' ? 'ลบ' : 'Delete';
    expect(screen.getByRole('button', { name: remove })).toBeTruthy();
    const equals = screen.getByRole('button', { name: 'Equals' });
    expect(equals.style.backgroundColor).toEqual(rgb(colors.ink));
    expect(screen.getByText('=').style.color).toEqual(rgb(colors.onInk));
    expect(screen.getByText('7').style.color).toEqual(rgb(colors.ink));
    cleanup();
  }
});
