import { createHmac, timingSafeEqual } from 'node:crypto';

import { SNAPSHOT_GRANT_MINUTES } from '@gogospend/contracts';

export type GrantTarget = { snapshotId: string; index: number };

const VERSION = 1;
const MAC_BYTES = 16;
// version (1) | snapshot id (16) | chunk index (2) | expiry, unix seconds (6) | MAC (16)
const BODY_BYTES = 1 + 16 + 2 + 6;

/**
 * Opaque chunk download grants: a snapshot id, chunk index and expiry under
 * an HMAC that also covers the owner's account id, so a grant is useless to
 * any other account and after SNAPSHOT_GRANT_MINUTES. A grant names no
 * storage key; downloads still need the owner's bound session, and the chunk
 * is looked up under the owner's RLS.
 */
export class SnapshotGrants {
  constructor(private readonly key: Buffer) {
    if (key.length < 32) throw new RangeError('grant keys are at least 32 bytes');
  }

  issue(accountId: string, target: GrantTarget, now: Date = new Date(), notAfter?: Date): { grant: string; expiresAt: Date } {
    if (!Number.isInteger(target.index) || target.index < 0 || target.index > 0xffff) throw new RangeError('chunk index out of range');
    let expires = Math.floor(now.getTime() / 1000) + SNAPSHOT_GRANT_MINUTES * 60;
    if (notAfter) expires = Math.min(expires, Math.floor(notAfter.getTime() / 1000));
    const body = Buffer.alloc(BODY_BYTES);
    body.writeUInt8(VERSION, 0);
    Buffer.from(target.snapshotId.replace(/-/g, ''), 'hex').copy(body, 1);
    body.writeUInt16BE(target.index, 17);
    body.writeUIntBE(Math.max(0, expires), 19, 6);
    return { grant: Buffer.concat([body, this.mac(accountId, body)]).toString('base64url'), expiresAt: new Date(expires * 1000) };
  }

  verify(accountId: string, grant: string, now: Date = new Date()): GrantTarget | null {
    if (typeof grant !== 'string' || grant.length > 64 || !/^[A-Za-z0-9_-]+$/.test(grant)) return null;
    const raw = Buffer.from(grant, 'base64url');
    if (raw.length !== BODY_BYTES + MAC_BYTES) return null;
    const body = raw.subarray(0, BODY_BYTES);
    if (!timingSafeEqual(raw.subarray(BODY_BYTES), this.mac(accountId, body)) || body.readUInt8(0) !== VERSION) return null;
    if (body.readUIntBE(19, 6) * 1000 <= now.getTime()) return null;
    const hex = body.subarray(1, 17).toString('hex');
    return { snapshotId: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`, index: body.readUInt16BE(17) };
  }

  private mac(accountId: string, body: Buffer): Buffer {
    return createHmac('sha256', this.key).update(`gogospend.snapshot-grant.v1\u0000${accountId}\u0000`).update(body).digest().subarray(0, MAC_BYTES);
  }
}
