import assert from 'node:assert/strict';
import { test } from 'node:test';

import { INITIAL_SESSION, reduceSession } from './sessionMachine.ts';
import type { SessionEvent, SessionSnapshot } from './sessionMachine.ts';

const A = '0a000000-0000-4000-8000-00000000000a';
const B = '0b000000-0000-4000-8000-00000000000b';

const run = (events: SessionEvent[], from: SessionSnapshot = INITIAL_SESSION) => events.reduce(reduceSession, from);

test('the epoch moves only when the identity (account or binding) changes, never on a token refresh', () => {
  const active = run([{ type: 'sign_in_start' }, { type: 'authenticated' }, { type: 'bootstrapped', accountId: A, binding: 'bind-a' }]);
  assert.deepEqual([active.state, active.accountId, active.binding], ['active', A, 'bind-a']);
  assert.ok(active.epoch > 0);
  assert.equal(reduceSession(active, { type: 'token_refreshed' }), active);
  const out = reduceSession(active, { type: 'signed_out' });
  assert.deepEqual([out.state, out.accountId, out.binding], ['signed_out', null, null]);
  assert.ok(out.epoch > active.epoch);
  const b = run([{ type: 'sign_in_start' }, { type: 'authenticated' }, { type: 'bootstrapped', accountId: B, binding: 'bind-b' }], out);
  assert.ok(b.epoch > out.epoch);
  // A switch is accepted beside an active session. The same account with a
  // new binding is a binding replacement: the epoch moves.
  const again = reduceSession(b, { type: 'bootstrapped', accountId: B, binding: 'bind-b2' });
  assert.deepEqual([again.state, again.accountId, again.binding], ['active', B, 'bind-b2']);
  assert.ok(again.epoch > b.epoch, 'a new binding is a new identity');
  // Losing the token locks the same identity without moving the epoch; a working refresh unlocks it.
  const locked = reduceSession(again, { type: 'auth_denied' });
  assert.deepEqual([locked.state, locked.accountId, locked.epoch], ['locked', B, again.epoch]);
  assert.deepEqual(reduceSession(locked, { type: 'token_refreshed' }), again);
  // The server ending the session keeps the identity and the epoch (drafts stay with it).
  const reauth = reduceSession(again, { type: 'reauth_required' });
  assert.deepEqual(reauth, { ...again, state: 'reauth_required' });
  assert.deepEqual(reduceSession(locked, { type: 'reauth_required' }), { ...again, state: 'reauth_required' });
});

test('sign-out always starts a new epoch, even while a sign-in is still establishing an identity', () => {
  const pending = run([{ type: 'sign_in_start' }, { type: 'authenticated' }]);
  const out = reduceSession(pending, { type: 'signed_out' });
  assert.equal(out.state, 'signed_out');
  assert.ok(out.epoch > pending.epoch, 'a late bootstrap response is dropped');
  assert.equal(reduceSession(out, { type: 'signed_out' }), out, 'signing out again changes nothing');
});

test('hydration never shows a previous account, and impossible events change nothing', () => {
  const hydrating = reduceSession(INITIAL_SESSION, { type: 'hydrate_start' });
  assert.deepEqual([hydrating.state, hydrating.accountId, hydrating.binding], ['hydrating', null, null]);
  const active: SessionSnapshot = { accountId: A, binding: 'x', epoch: 4, state: 'active' };
  assert.equal(reduceSession(active, { type: 'hydrate_start' }), active, 'an active session is not hydrated again (the epoch never moves for nothing)');
  assert.equal(reduceSession({ ...active, state: 'reauth_required' }, { type: 'hydrate_start' }).state, 'reauth_required');
  assert.equal(reduceSession(INITIAL_SESSION, { type: 'bootstrapped', accountId: A, binding: 'b' }), INITIAL_SESSION);
  assert.equal(reduceSession(INITIAL_SESSION, { type: 'auth_denied' }), INITIAL_SESSION);
  assert.equal(reduceSession(INITIAL_SESSION, { type: 'locked', accountId: A, binding: 'b' }), INITIAL_SESSION, 'a lock comes only from hydration');
});
