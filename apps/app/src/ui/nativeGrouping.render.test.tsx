// A view that speaks for its children (a progress bar, an amount) must be one
// element on iOS, or VoiceOver skips its label and reads its bare children:
// Apple's accessibility audit found the budget ring's centre read as just
// "฿2,775.00" (R8). See src/testing/nativeAccessible.ts.
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { StoryDots } from '@mobile/screens/redesign/account/OnboardingParts';
import { Amount } from './Amount';
import { BudgetBar } from './BudgetBar';
import type { BudgetPace } from './budgetWords';
import { mountKit } from './entryKitTestHarness';
import { LARGEST_STANDARD_SCALE } from './largeTextScale';
import { PaceRing } from './PaceRing';
import { TabBar } from './TabBar';

vi.mock('react-native', async (importOriginal) =>
  (await import('@mobile/testing/nativeAccessible')).withNativeAccessible(await importOriginal()));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));

afterEach(() => cleanup());

const onTrack: BudgetPace = { state: 'on_track', spentMinor: '1200000', limitMinor: '1800000', leftMinor: '600000', perDayMinor: '42000', daysLeft: 10 };
const over: BudgetPace = { state: 'over', spentMinor: '1812000', limitMinor: '1800000', leftMinor: '-12000', perDayMinor: null, daysLeft: 9 };

const nativeAccessible = (element: HTMLElement) => element.getAttribute('data-native-accessible');

test('the budget ring is one element on iOS, so its centre is never read alone', () => {
  for (const pace of [onTrack, over]) {
    mountKit(<PaceRing {...pace} />);
    expect([pace.state, nativeAccessible(screen.getByRole('progressbar', { name: 'Budget' }))]).toEqual([pace.state, 'true']);
    cleanup();
  }
});

test('the budget bar is one element on iOS, so VoiceOver finds it at all', () => {
  for (const pace of [onTrack, over]) {
    mountKit(<BudgetBar {...pace} />);
    expect([pace.state, nativeAccessible(screen.getByRole('progressbar', { name: 'Budget' }))]).toEqual([pace.state, 'true']);
    cleanup();
  }
});

test('views that already group their words stay grouped', () => {
  mountKit(<Amount minor="6500" type="expense" />);
  expect(nativeAccessible(screen.getByLabelText('Expense ฿65.00'))).toBe('true');
  cleanup();
  mountKit(<StoryDots step={2} total={3} />);
  expect(nativeAccessible(screen.getByRole('progressbar', { name: 'Step 2 of 3' }))).toBe('true');
});

test('tab labels stop at the largest standard text size, and a long press shows them large on iOS', () => {
  // At the accessibility sizes the labels broke mid-word ("Hist / ory"), as
  // Apple's audit found at AX5 (R8). Apple's own tab bars keep their labels
  // on one line there and show the large content viewer instead.
  const items = ['Home', 'History', 'Budget', 'Me'].map((label) => ({ key: label.toLowerCase(), label, icon: null }));
  mountKit(<TabBar items={items} active="home" onSelect={() => undefined} onAdd={() => undefined} addLabel="Add a record" />);
  for (const { label } of items) {
    const tab = screen.getByRole('tab', { name: label });
    expect([label, tab.getAttribute('data-native-accessibility-shows-large-content-viewer'), tab.getAttribute('data-native-accessibility-large-content-title')]).toEqual([label, 'true', label]);
    const scale = Number(within(tab).getByText(label).getAttribute('data-native-max-font-size-multiplier'));
    expect([label, scale > 1 && scale <= LARGEST_STANDARD_SCALE]).toEqual([label, true]);
  }
  const add = screen.getByRole('button', { name: 'Add a record' });
  expect([add.getAttribute('data-native-accessibility-shows-large-content-viewer'), add.getAttribute('data-native-accessibility-large-content-title')]).toEqual(['true', 'Add a record']);
});
