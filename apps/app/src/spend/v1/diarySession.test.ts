import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import { V1Error } from '../../api/client.ts';
import { ACCOUNT_A, ACCOUNT_B } from '../../storage/testing/diaryFixtures.ts';
import { createDiarySessionResolver } from './diarySession.ts';
import { createKnownAccount } from './knownAccount.ts';
import type { DiarySession } from './spendDiary.ts';

function setup() {
  let stored: string | null = null;
  const known = createKnownAccount(
    { get: async () => stored, set: async (value) => void (stored = value), remove: async () => void (stored = null) },
    async (text) => createHash('sha256').update(text).digest('hex'),
  );
  const identity = { binding: 'binding-1' as string | null, epoch: 1 };
  const server = { answers: [] as (() => Promise<string>)[], calls: 0 };
  const seen: DiarySession[] = [];
  const resolver = createDiarySessionResolver({
    snapshot: () => ({ ...identity }),
    fetchAccountId: () => {
      server.calls += 1;
      const answer = server.answers.shift();
      return answer ? answer() : Promise.resolve(ACCOUNT_A);
    },
    known,
    sessionChanged: async () => void seen.push(resolver.current()),
  });
  return { resolver, identity, server, seen };
}

const offline = () => Promise.reject(new V1Error('network', 0, 'NETWORK_ERROR'));

test('offline on a fresh install, no account is assumed', async () => {
  const { resolver, server } = setup();
  server.answers.push(offline);
  await resolver.refresh();
  assert.deepEqual(resolver.current(), { accountId: null, epoch: 1 });
});

test('the verified account is remembered across resolvers for the same binding, never for another', async () => {
  let stored: string | null = null;
  const slot = { get: async () => stored, set: async (value: string) => void (stored = value), remove: async () => void (stored = null) };
  const sha = async (text: string) => createHash('sha256').update(text).digest('hex');
  const make = (binding: string, answer: () => Promise<string>) =>
    createDiarySessionResolver({ snapshot: () => ({ binding, epoch: 1 }), fetchAccountId: answer, known: createKnownAccount(slot, sha), sessionChanged: async () => undefined });
  await make('binding-1', async () => ACCOUNT_A).refresh();
  const relaunch = make('binding-1', offline);
  await relaunch.refresh();
  assert.equal(relaunch.current().accountId, ACCOUNT_A);
  const other = make('binding-2', offline);
  await other.refresh();
  assert.equal(other.current().accountId, null, 'a new identity inherits nothing');
  const refused = make('binding-1', () => Promise.reject(new V1Error('signed_out', 401, 'UNAUTHENTICATED')));
  await refused.refresh();
  assert.equal(refused.current().accountId, null, 'a refusal is not an outage');
});

test('a token refresh for the same identity does not ask the server again', async () => {
  const { resolver, server, seen } = setup();
  await resolver.refresh();
  await resolver.refresh();
  assert.equal(server.calls, 1);
  assert.equal(seen.length, 2);
  assert.deepEqual(seen[1], { accountId: ACCOUNT_A, epoch: 1 });
});

test('an account recalled offline is verified again on the next refresh', async () => {
  let stored: string | null = null;
  const known = createKnownAccount({ get: async () => stored, set: async (value) => void (stored = value), remove: async () => void (stored = null) }, async (text) => createHash('sha256').update(text).digest('hex'));
  await known.remember('binding-1', ACCOUNT_A);
  let calls = 0;
  let online = false;
  const resolver = createDiarySessionResolver({
    snapshot: () => ({ binding: 'binding-1', epoch: 1 }),
    fetchAccountId: () => ((calls += 1), online ? Promise.resolve(ACCOUNT_A) : offline()),
    known,
    sessionChanged: async () => undefined,
  });
  await resolver.refresh();
  assert.equal(resolver.current().accountId, ACCOUNT_A);
  online = true;
  await resolver.refresh();
  await resolver.refresh();
  assert.equal(calls, 2, 'verified once more, then trusted for the session');
});

test('an older answer that arrives after a newer one is ignored', async () => {
  const { resolver, server } = setup();
  let failOld: () => void = () => undefined;
  server.answers.push(() => new Promise<string>((_resolve, reject) => (failOld = () => reject(new V1Error('network', 0, 'NETWORK_ERROR')))));
  const old = resolver.refresh();
  await new Promise((resolve) => setTimeout(resolve, 0));
  server.answers.push(async () => ACCOUNT_A);
  await resolver.refresh();
  failOld();
  await old;
  assert.deepEqual(resolver.current(), { accountId: ACCOUNT_A, epoch: 1 });
  await resolver.refresh();
  assert.equal(server.calls, 2, 'the verified answer stands; the late failure changed nothing');
});

test('after dispose nothing reopens', async () => {
  const { resolver, server, seen } = setup();
  let release: (id: string) => void = () => undefined;
  server.answers.push(() => new Promise<string>((resolve) => (release = resolve)));
  const pending = resolver.refresh();
  await new Promise((resolve) => setTimeout(resolve, 0));
  resolver.dispose();
  release(ACCOUNT_A);
  await pending;
  assert.deepEqual(seen, []);
});
