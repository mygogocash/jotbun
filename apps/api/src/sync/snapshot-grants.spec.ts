import { randomUUID } from 'node:crypto';

import { SnapshotGrants } from './snapshot-grants';

const current = Buffer.alloc(32, 1);
const previous = Buffer.alloc(32, 2);

describe('snapshot grants', () => {
  it('a grant issued before a key rotation still verifies with the previous key', () => {
    const account = randomUUID();
    const target = { snapshotId: randomUUID(), index: 3 };
    const { grant } = new SnapshotGrants([previous]).issue(account, target);
    expect(new SnapshotGrants([current, previous]).verify(account, grant)).toEqual(target);
    expect(new SnapshotGrants([current]).verify(account, grant)).toBeNull();
    // New grants use the current key.
    const fresh = new SnapshotGrants([current, previous]).issue(account, target).grant;
    expect(new SnapshotGrants([current]).verify(account, fresh)).toEqual(target);
  });

  it('lasts five minutes by default, or the minutes its owner names, and rejects other lengths', () => {
    const now = new Date('2026-10-18T00:00:00Z');
    const target = { snapshotId: randomUUID(), index: 0 };
    expect(new SnapshotGrants([current]).issue('a', target, now).expiresAt.toISOString()).toBe('2026-10-18T00:05:00.000Z');
    expect(new SnapshotGrants([current], { minutes: 2 }).issue('a', target, now).expiresAt.toISOString()).toBe('2026-10-18T00:02:00.000Z');
    for (const minutes of [0, 61, 1.5, Number.NaN]) expect(() => new SnapshotGrants([current], { minutes })).toThrow(RangeError);
  });

  it('what the MAC covers is whatever scope the caller gives, so a longer scope binds more than the account', () => {
    const account = randomUUID();
    const grants = new SnapshotGrants([current]);
    const target = { snapshotId: randomUUID(), index: 0 };
    const { grant } = grants.issue(`${account}\u0000binding-a\u00001`, target);
    expect(grants.verify(`${account}\u0000binding-a\u00001`, grant)).toEqual(target);
    expect(grants.verify(`${account}\u0000binding-b\u00001`, grant)).toBeNull();
    expect(grants.verify(`${account}\u0000binding-a\u00002`, grant)).toBeNull();
    expect(grants.verify(account, grant)).toBeNull();
    // S1's own callers pass the account alone, as before.
    expect(grants.verify(account, grants.issue(account, target).grant)).toEqual(target);
  });
});
