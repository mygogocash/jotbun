import { leaseBudgetMs } from './job.repository';

describe('lease budgets', () => {
  it('count only elapsed local time against the granted lease, minus the safety margin', () => {
    const now = Date.now();
    expect(leaseBudgetMs(30_000, now, 30)).toBeGreaterThan(24_900);
    expect(leaseBudgetMs(30_000, now, 30)).toBeLessThanOrEqual(25_000);
    expect(leaseBudgetMs(30_000, now - 10_000, 30)).toBeLessThanOrEqual(15_000);
    // Short leases keep a fifth as margin; an exhausted lease has no budget.
    expect(leaseBudgetMs(2_000, now, 2)).toBeLessThanOrEqual(1_600);
    expect(leaseBudgetMs(1_000, now - 5_000, 30)).toBe(0);
  });
});
