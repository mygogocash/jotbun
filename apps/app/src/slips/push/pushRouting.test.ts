// P4-T17: where a push tap goes (Node). The links are asserted as their literal
// pathnames, not only as the constants they come from (P4-T12 review's n11).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { PushData } from '@gogospend/contracts';

import { routeForPush } from './pushRouting.ts';

const JOB = '6a7b8c9d-0e1f-4a2b-9c3d-4e5f6a7b8c9d';
const EXPORT = '3f2b1c0d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

test('each push kind opens its screen, and anything else opens nothing', () => {
  assert.equal(routeForPush({ kind: 'slips_ready', ref: null }), '/spend/slips/review');
  assert.equal(routeForPush({ kind: 'statement_parsed', ref: JOB }), '/spend/import');
  assert.equal(routeForPush({ kind: 'export_ready', ref: EXPORT }), '/settings/privacy');
  assert.deepEqual(routeForPush({ kind: 'month_recap_ready', ref: '2026-09' }), { pathname: '/spend/recap/[month]', params: { month: '2026-09' } });
  // Not a push's data: a ref of the wrong kind, a malformed month or id, an extra key, another kind, a local reminder's data.
  const other = [
    { kind: 'slips_ready', ref: JOB },
    { kind: 'month_recap_ready', ref: '2026-13' },
    { kind: 'export_ready', ref: 'export-1' },
    { kind: 'slips_ready', ref: null, count: 3 },
    { kind: 'reminder', ref: null },
    {},
    null,
    undefined,
  ];
  for (const data of other) assert.equal(routeForPush(data as PushData), null, JSON.stringify(data));
});
