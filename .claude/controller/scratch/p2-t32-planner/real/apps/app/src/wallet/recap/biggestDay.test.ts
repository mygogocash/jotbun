import assert from 'node:assert/strict';
import test from 'node:test';

import type { CategoryDto, EntryDto, Minor } from '@gogospend/contracts';
import { biggestDay } from './biggestDay.ts';

function entry(partial: Partial<EntryDto> & { occurred_on: string; amount_minor: Minor; type: 'expense' | 'income' }): EntryDto {
  return {
    id: `e-${Math.random()}`,
    wallet_id: 'w1',
    category_id: 'c-food',
    deleted_at: null,
    merchant: null,
    note: null,
    version: 1,
    ...partial,
  };
}

test('the biggest day is the most money out, the earlier day on a tie', () => {
  const records = [
    // October 2: total 1500
    entry({ occurred_on: '2026-10-02', amount_minor: '1000', type: 'expense' }),
    entry({ occurred_on: '2026-10-02', amount_minor: '500', type: 'expense' }),
    // October 5: total 3000
    entry({ occurred_on: '2026-10-05', amount_minor: '3000', type: 'expense' }),
    // October 12: total 3000 (tie with Oct 5 -> Oct 5 should win)
    entry({ occurred_on: '2026-10-12', amount_minor: '3000', type: 'expense' }),
    // September record (different month, ignored)
    entry({ occurred_on: '2026-09-28', amount_minor: '9000', type: 'expense' }),
    // Deleted record on Oct 15 (ignored)
    entry({ occurred_on: '2026-10-15', amount_minor: '9000', type: 'expense', deleted_at: '2026-10-16T00:00:00Z' }),
  ];

  const result = biggestDay(records, '2026-10');
  assert.deepEqual(result, {
    date: '2026-10-05',
    outMinor: '3000',
    payday: false,
  });
});

test('payday is said only when that day holds a salary income', () => {
  const categories: CategoryDto[] = [
    { id: 'cat-sal', type: 'income', builtin_key: 'salary', label: null, color: '#A8CC4A', archived: false, version: 1 },
    { id: 'cat-other', type: 'income', builtin_key: 'bonus', label: null, color: '#F2CE5C', archived: false, version: 1 },
  ];

  const records = [
    entry({ occurred_on: '2026-10-25', amount_minor: '250000', type: 'expense' }),
    // Salary on Oct 25 (the biggest day)
    entry({ occurred_on: '2026-10-25', amount_minor: '3500000', type: 'income', category_id: 'cat-sal' }),
    // Another day with smaller expense
    entry({ occurred_on: '2026-10-02', amount_minor: '1000', type: 'expense' }),
  ];

  const withSalary = biggestDay(records, '2026-10', categories);
  assert.equal(withSalary?.payday, true);
  assert.equal(withSalary?.date, '2026-10-25');

  // If salary is deleted, payday is false
  const withDeletedSalary = [
    records[0],
    entry({ occurred_on: '2026-10-25', amount_minor: '3500000', type: 'income', category_id: 'cat-sal', deleted_at: '2026-10-26T00:00:00Z' }),
    records[2],
  ];
  assert.equal(biggestDay(withDeletedSalary, '2026-10', categories)?.payday, false);

  // If salary is on another day, payday is false
  const salaryDifferentDay = [
    records[0],
    entry({ occurred_on: '2026-10-26', amount_minor: '3500000', type: 'income', category_id: 'cat-sal' }),
    records[2],
  ];
  assert.equal(biggestDay(salaryDifferentDay, '2026-10', categories)?.payday, false);

  // If income on that day is NOT salary (e.g. bonus), payday is false
  const withNonSalaryIncome = [
    records[0],
    entry({ occurred_on: '2026-10-25', amount_minor: '100000', type: 'income', category_id: 'cat-other' }),
    records[2],
  ];
  assert.equal(biggestDay(withNonSalaryIncome, '2026-10', categories)?.payday, false);

  // String salary category
  const withStringSalary = biggestDay([
    entry({ occurred_on: '2026-10-25', amount_minor: '250000', type: 'expense' }),
    entry({ occurred_on: '2026-10-25', amount_minor: '3500000', type: 'income', category_id: 'custom-salary' }),
  ], '2026-10', 'custom-salary');
  assert.equal(withStringSalary?.payday, true);

  // Empty records in month returns null
  assert.equal(biggestDay([], '2026-10'), null);
});
