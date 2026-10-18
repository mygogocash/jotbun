import { cleanup, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';

import { PaceRing } from './PaceRing';
import type { BudgetPace } from './budgetWords';
import { MATRIX, leading, mountKit, rgb } from './entryKitTestHarness';

afterEach(() => cleanup());

const onTrack: BudgetPace = { state: 'on_track', spentMinor: '1200000', limitMinor: '1800000', leftMinor: '600000', perDayMinor: '42000', daysLeft: 10 };
const over: BudgetPace = { state: 'over', spentMinor: '1812000', limitMinor: '1800000', leftMinor: '-12000', perDayMinor: null, daysLeft: 9 };
const none: BudgetPace = { state: 'no_budget', spentMinor: '1200000', limitMinor: null, leftMinor: null, perDayMinor: null, daysLeft: 9 };

function arcs(container: HTMLElement) {
  return Array.from(container.querySelectorAll('circle'));
}

test('a ring drawn in SVG: the arc is the share spent, the centre is the daily pace', () => {
  const { container } = mountKit(<PaceRing {...onTrack} size={120} />);
  const [track, arc] = arcs(container);
  expect(track).toBeTruthy();
  expect(arc).toBeTruthy();
  const radius = Number(arc.getAttribute('r'));
  const circumference = 2 * Math.PI * radius;
  const [drawn] = (arc.getAttribute('stroke-dasharray') ?? arc.getAttribute('strokeDasharray') ?? '').split(' ').map(Number);
  expect(drawn / circumference).toBeCloseTo(0.666, 3);
  expect(screen.getByText('฿420.00')).toBeTruthy();
  expect(screen.getByText('a day left')).toBeTruthy();
  expect(screen.getByText('On track · ฿6,000.00 left · 10 days to go')).toBeTruthy();
  const ring = screen.getByRole('progressbar', { name: 'Budget' });
  expect(ring.getAttribute('aria-valuetext')).toBe('฿420.00 a day left, On track, ฿6,000.00 left, 10 days to go');
  // The drawing itself is hidden from screen readers; the words carry it.
  expect(container.querySelector('svg')?.closest('[aria-hidden="true"]')).toBeTruthy();
});

test('over budget: a full ring, and the words say over', () => {
  const { container } = mountKit(<PaceRing {...over} />);
  const [, arc] = arcs(container);
  const radius = Number(arc.getAttribute('r'));
  const [drawn] = (arc.getAttribute('stroke-dasharray') ?? arc.getAttribute('strokeDasharray') ?? '').split(' ').map(Number);
  expect(drawn).toBeCloseTo(2 * Math.PI * radius, 3);
  expect(screen.getByText('฿120.00')).toBeTruthy();
  expect(screen.getByText('over')).toBeTruthy();
  expect(screen.getByText('9 days to go')).toBeTruthy();
  expect(screen.getByText('It happens. ฿18,120.00 of ฿18,000.00 spent.')).toBeTruthy();
});

test('no budget: the track only, and words', () => {
  const { container } = mountKit(<PaceRing {...none} />);
  expect(arcs(container)).toHaveLength(1);
  expect(screen.getByText('No budget this month')).toBeTruthy();
  expect(screen.getByText('฿12,000.00 spent so far')).toBeTruthy();
  expect(screen.queryByRole('progressbar')).toBeNull();
});

test('under and over colour the arc only, in light and dark; Thai has room', () => {
  for (const { locale, mode, colors } of MATRIX) {
    const first = mountKit(<PaceRing {...onTrack} />, { locale, mode });
    expect(arcs(first.container)[1].getAttribute('stroke')).toBe(colors.under);
    expect(arcs(first.container)[0].getAttribute('stroke')).toBe(colors.rule);
    expect(screen.getByText('฿420.00').style.color).toEqual(rgb(colors.ink));
    expect(screen.getByText('a day left').style.lineHeight).toBe(leading('caption', locale));
    cleanup();
    const second = mountKit(<PaceRing {...over} />, { locale, mode });
    expect(arcs(second.container)[1].getAttribute('stroke')).toBe(colors.over);
    expect(screen.getByText('over').style.color).toEqual(rgb(colors.over));
    cleanup();
  }
});
