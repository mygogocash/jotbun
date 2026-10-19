// Review nit: a summary that changes with every keystroke is announced once it settles.
import { act, cleanup, render } from '@testing-library/react';
import { AccessibilityInfo, Platform } from 'react-native';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { SETTLED_ANNOUNCEMENT_MS, useSettledAnnouncement } from './a11y';

function Speaker({ text }: { text: string | null }) {
  useSettledAnnouncement(text);
  return null;
}

const os = Platform.OS;
beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true, writable: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true, writable: true });
});

test('a summary that changes as the person types is said once, when it settles', () => {
  const announce = vi.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  const view = render(<Speaker text="5 entries" />);
  for (const text of ['3 entries', '2 entries', '1 entry, ฿12,268.00 out']) {
    act(() => { vi.advanceTimersByTime(SETTLED_ANNOUNCEMENT_MS / 4); });
    view.rerender(<Speaker text={text} />);
  }
  expect(announce).not.toHaveBeenCalled();
  act(() => { vi.advanceTimersByTime(SETTLED_ANNOUNCEMENT_MS); });
  expect(announce.mock.calls).toEqual([['1 entry, ฿12,268.00 out']]);
  // Nothing new, nothing said again.
  view.rerender(<Speaker text="1 entry, ฿12,268.00 out" />);
  act(() => { vi.advanceTimersByTime(SETTLED_ANNOUNCEMENT_MS * 2); });
  expect(announce).toHaveBeenCalledTimes(1);
});
