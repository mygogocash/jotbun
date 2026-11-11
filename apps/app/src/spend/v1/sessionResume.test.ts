// D37 (spec §3): a phone signed out from elsewhere keeps its unsent records
// and sends them once the same account signs in again; another account never
// sees them, and the first account's diary stays on the phone until an
// explicit erase. Today's outbox already pauses on `signed_out` (verdictFor:
// not processed), so this pins the behaviour 1C keeps.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ACCOUNT_A, ACCOUNT_B } from '../../storage/testing/diaryFixtures.ts';
import { bench } from '../../sync/testing/harness.ts';

test('after a session ended, the same account sends the unsent records once; another account never sees them', async () => {
  const b = await bench();
  try {
    const queued = await b.save();
    // The server ended the session: a token refresh cannot renew it (the provider's refresh answers false).
    b.refreshes.result = false;
    b.server.scriptSends({ kind: 'problem', outcome: 'signed_out', status: 401, code: 'SESSION_REQUIRED' });
    assert.equal((await b.flush('foreground')).status, 'signed_out');
    assert.equal(b.server.receipts.has(queued.commandId), false);
    // The same account signs in again: a new session moves the epoch, the diary reopens, the outbox sends.
    b.session.epoch += 1;
    const again = await b.database.open(ACCOUNT_A, b.session.epoch);
    await b.newEngine(again).flush({ accountId: ACCOUNT_A, epoch: b.session.epoch }, 'launch');
    assert.equal(b.server.sent.filter((s) => s.commandId === queued.commandId).length, 2, 'the refused try and the one that landed');
    assert.equal(b.server.receipts.has(queued.commandId), true);
    // Another account signs in: its own diary opens; account A's file stays until an explicit erase.
    b.session.epoch += 1;
    const other = await b.database.open(ACCOUNT_B, b.session.epoch);
    await b.newEngine(other).flush({ accountId: ACCOUNT_B, epoch: b.session.epoch }, 'launch');
    assert.equal(b.server.sent.filter((s) => s.commandId === queued.commandId).length, 2);
    assert.ok(b.files.names().includes(`diary-${ACCOUNT_A}.db`));
  } finally {
    b.dispose();
  }
});
