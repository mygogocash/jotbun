import assert from 'node:assert/strict';
import { test } from 'node:test';

import { afterEndedSignIn, mayEraseOtherAccount, sessionEndedView } from './sessionEnded.ts';
import type { SessionEndedView } from './sessionEnded.ts';
import type { SessionSnapshot } from './sessionMachine.ts';
import type { StoredSession } from './sessionStore.ts';

const ACCOUNT_A = '0a000000-0000-4000-8000-00000000000a';
const ACCOUNT_B = '0b000000-0000-4000-8000-00000000000b';
const SESSION = '0c000000-0000-4000-8000-00000000000c';
const RECORD: StoredSession = { accountId: ACCOUNT_A, sessionId: SESSION, email: 'kan@example.test', method: 'apple' };
const snapshot = (state: SessionSnapshot['state'], accountId: string | null = ACCOUNT_A): SessionSnapshot => ({ state, accountId, binding: accountId ? SESSION : null, epoch: 4 });

test('a locked or server-ended session shows the session-ended view with the unsent count and the account\'s method', () => {
  assert.deepEqual(sessionEndedView(snapshot('reauth_required'), RECORD, 'signed_out_elsewhere', 3), { kind: 'signed_out_elsewhere', accountId: ACCOUNT_A, method: 'apple', unsent: 3 });
  assert.deepEqual(sessionEndedView(snapshot('reauth_required'), RECORD, 'account_unavailable', 0), { kind: 'account_unavailable', accountId: ACCOUNT_A, method: 'apple', unsent: 0 });
  assert.deepEqual(sessionEndedView(snapshot('locked'), { ...RECORD, method: 'email' }, 'signed_out_elsewhere', 1), { kind: 'signed_out_elsewhere', accountId: ACCOUNT_A, method: 'email', unsent: 1 });
  // Locked at launch without its cookie: no reason was given, so it reads as signed out elsewhere.
  assert.deepEqual(sessionEndedView(snapshot('locked'), RECORD, null, 2), { kind: 'signed_out_elsewhere', accountId: ACCOUNT_A, method: 'apple', unsent: 2 });
});

test('active and signed-out sessions show no session-ended view', () => {
  for (const state of ['active', 'signed_out', 'hydrating', 'authenticating', 'bootstrap_pending'] as const) {
    assert.equal(sessionEndedView(snapshot(state), RECORD, 'signed_out_elsewhere', 3), null, state);
  }
  // Nothing stored, or a record that is not this session's account: no view either.
  assert.equal(sessionEndedView(snapshot('locked'), null, 'signed_out_elsewhere', 3), null);
  assert.equal(sessionEndedView(snapshot('reauth_required', ACCOUNT_B), RECORD, 'signed_out_elsewhere', 3), null);
});

const ENDED: SessionEndedView = { kind: 'signed_out_elsewhere', accountId: ACCOUNT_A, method: 'apple', unsent: 3 };

test('signing in again to the same account resumes', () => {
  assert.deepEqual(afterEndedSignIn(ENDED, ACCOUNT_A), { kind: 'resumed' });
  assert.deepEqual(afterEndedSignIn({ ...ENDED, kind: 'account_unavailable', unsent: 0 }, ACCOUNT_A), { kind: 'resumed' });
});

test('another account with unsent records asks keep or erase', () => {
  assert.deepEqual(afterEndedSignIn(ENDED, ACCOUNT_B), { kind: 'other_account', previousAccountId: ACCOUNT_A, unsent: 3 });
  // With none waiting it is still another account: nothing is replayed, and the screen has nothing to ask.
  assert.deepEqual(afterEndedSignIn({ ...ENDED, unsent: 0 }, ACCOUNT_B), { kind: 'other_account', previousAccountId: ACCOUNT_A, unsent: 0 });
});

test('erasing another account\'s records needs the explicit confirmation', () => {
  assert.equal(mayEraseOtherAccount({ kind: 'erase', confirmed: true }), true);
  assert.equal(mayEraseOtherAccount({ kind: 'erase', confirmed: false }), false);
});

test('keep never erases', () => {
  assert.equal(mayEraseOtherAccount({ kind: 'keep' }), false);
});
