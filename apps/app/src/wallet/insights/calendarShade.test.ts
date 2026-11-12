// Pure calendarShade unit tests (P2-T31).
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Minor } from '@gogospend/contracts';
import { calendarShade } from './calendarShade.ts';

test('calendarShade maps satang amounts to steps 0 through 5', () => {
  const inputs: Minor[] = ['0', '1', '20000', '20001', '50000', '100000', '200000', '200001'];
  assert.deepEqual(inputs.map(calendarShade), [0, 1, 1, 2, 2, 3, 4, 5]);
});

test('negative satang amounts map to step 0', () => {
  assert.equal(calendarShade('-1000' as Minor), 0);
});

test('exact boundary limits: 200, 500, 1000, 2000 baht', () => {
  assert.equal(calendarShade('20000' as Minor), 1);
  assert.equal(calendarShade('50000' as Minor), 2);
  assert.equal(calendarShade('100000' as Minor), 3);
  assert.equal(calendarShade('200000' as Minor), 4);
});
