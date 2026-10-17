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
});
