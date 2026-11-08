// P6B-T0 (A12; X8, default pending owner Q5): the request number the
// deletion receipt and the deletion email show.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { deletionShortCode } from '@gogospend/contracts';

test('the short code is DEL and eight Crockford digits of the request id', () => {
  assert.equal(deletionShortCode('0b3f2c1e-6a4d-4f6e-9a51-2f3c4d5e6f70'), 'DEL-1CZJ-R7KA');
  assert.equal(deletionShortCode('0B3F2C1E-6A4D-4F6E-9A51-2F3C4D5E6F70'), 'DEL-1CZJ-R7KA');
  assert.equal(deletionShortCode('ffffffff-ffff-4fff-bfff-ffffffffffff'), 'DEL-ZZZZ-ZZZZ');
  assert.equal(deletionShortCode('00000000-0000-4000-8000-000000000000'), 'DEL-0000-0000');
});
