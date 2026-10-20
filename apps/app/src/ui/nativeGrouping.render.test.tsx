// A view that speaks for its children (a progress bar, an amount) must be one
// element on iOS, or VoiceOver skips its label and reads its bare children:
// Apple's accessibility audit found the budget ring's centre read as just
// "฿2,775.00" (R8). See src/testing/nativeAccessible.ts.
import { cleanup, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { StoryDots } from '@mobile/screens/redesign/account/OnboardingParts';
import { Amount } from './Amount';
import { BudgetBar } from './BudgetBar';
import type { BudgetPace } from './budgetWords';
import { mountKit } from './entryKitTestHarness';
import { PaceRing } from './PaceRing';

vi.mock('react-native', async (importOriginal) =>
  (await import('@mobile/testing/nativeAccessible')).withNativeAccessible(await importOriginal()));

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
