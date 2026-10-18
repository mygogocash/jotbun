// The erasure-marker contract between P5 and P6a.
//
// P5's ErasureRegistry.record(accountId, providerSubjectKeys) writes one
// marker per accepted account deletion, before any destructive cleanup, to a
// maintenance-only recovery-control scope that is NOT inside the database or
// backups being restored. A restore reads every marker and erases the matching
// accounts in the private copy before anything could serve it.
//
// ErasureMarker (stored record; these keys only, nothing else):
//   marker_id        lower-case UUID
//   account_id       internal account UUID (opaque; never reused)
//   subject_lookups  1–32 keyed lookups, base64url HMAC-SHA256 (43 chars), one
//                    per provider alias: deriveSubjectLookup(key, issuer, subject)
//   lookup_key_id    32 hex chars: SubjectLookupKey.id of the key that made them
//   recorded_at      ISO-8601 UTC time the marker was durably written
//   purged_at        optional, ISO-8601 or null: when P5 verified the last
//                    server-side copy of the account's rows and objects was
//                    purged (P5 writes it once, after its purge). Until it is
//                    set the marker can never be cleared
//                    (recovery-inventory.mjs canClearMarker), and a restore
//                    re-queues the account's erasure (`reapply` below).
//   blocked_until    optional, ISO-8601 or null: the end of the account's
//                    blocked-principal hold as P5 set it at the purge (one
//                    hour past provider verification). A restore replays it;
//                    absent or null means no end yet - the re-queued erasure
//                    sets it when it purges again.
// No email, name, raw subject, token, amount or other financial value.
//
// ErasureMarkerSource (what P5 supplies to restores):
//   independent: true          only when stored outside the restored DB/backup
//   location: string           non-secret label, e.g. 'r2-recovery-control'
//   listMarkers(): Promise<ErasureMarker[]>   the complete set; throws on any
//                              read failure (never [] for "could not read")
//   lookupKey(): Promise<SubjectLookupKey>    throws/undefined if key custody is
//                              unavailable
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { inspect } from 'node:util';

import { OpsError } from './ops-safety.mjs';

const LOOKUP_INFO = 'gogospend-erasure-subject-v1';
const KEY_ID_INFO = 'gogospend-erasure-key-id-v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LOOKUP = /^[A-Za-z0-9_-]{43}$/;
const KEY_ID = /^[0-9a-f]{32}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const REQUIRED_KEYS = ['account_id', 'lookup_key_id', 'marker_id', 'recorded_at', 'subject_lookups'];
const OPTIONAL_KEYS = ['blocked_until', 'purged_at'];

/** gogospend_principal_digest(issuer, subject) as hex: sha256(issuer 0x00 subject). */
export function principalDigest(issuer, subject) {
  return createHash('sha256').update(Buffer.concat([Buffer.from(issuer, 'utf8'), Buffer.from([0]), Buffer.from(subject, 'utf8')])).digest('hex');
}

/** The registry's keyed lookup for one provider alias. P5 must use exactly this. */
export function deriveSubjectLookup(keyBytes, issuer, subject) {
  return createHmac('sha256', keyBytes).update(`${LOOKUP_INFO}\0${issuer}\0${subject}`, 'utf8').digest('base64url');
}

/** The erasure-registry lookup key; its bytes never leave this object. */
export class SubjectLookupKey {
  #bytes;

  constructor(bytes) {
    if (!Buffer.isBuffer(bytes) || bytes.length !== 32) throw new OpsError('REGISTRY_KEY_CUSTODY_MISSING');
    this.#bytes = Buffer.from(bytes);
    this.id = createHmac('sha256', this.#bytes).update(KEY_ID_INFO).digest().subarray(0, 16).toString('hex');
    Object.freeze(this);
  }

  static generate() {
    return new SubjectLookupKey(randomBytes(32));
  }

  static fromBytes(bytes) {
    return new SubjectLookupKey(bytes);
  }

  lookup(issuer, subject) {
    return deriveSubjectLookup(this.#bytes, issuer, subject);
  }

  toJSON() {
    return { lookup_key_id: this.id };
  }

  toString() {
    return `SubjectLookupKey(${this.id})`;
  }

  [inspect.custom]() {
    return this.toString();
  }
}

const isIso = (value) => typeof value === 'string' && ISO.test(value) && Number.isFinite(Date.parse(value));

export function isValidMarker(marker) {
  if (!marker || typeof marker !== 'object' || Array.isArray(marker)) return false;
  const keys = Object.keys(marker);
  if (!REQUIRED_KEYS.every((key) => keys.includes(key)) || !keys.every((key) => REQUIRED_KEYS.includes(key) || OPTIONAL_KEYS.includes(key))) return false;
  if (!OPTIONAL_KEYS.every((key) => marker[key] === undefined || marker[key] === null || isIso(marker[key]))) return false;
  if (isIso(marker.purged_at) && Date.parse(marker.purged_at) < Date.parse(marker.recorded_at)) return false;
  return UUID.test(marker.marker_id) && UUID.test(marker.account_id) && KEY_ID.test(marker.lookup_key_id) && isIso(marker.recorded_at)
    && Array.isArray(marker.subject_lookups) && marker.subject_lookups.length >= 1 && marker.subject_lookups.length <= 32
    && marker.subject_lookups.every((lookup) => typeof lookup === 'string' && LOOKUP.test(lookup));
}

/**
 * Reads and checks the complete marker set before a restore touches data.
 * Every failure refuses the restore; none degrades to "no markers".
 */
export async function loadErasureMarkers(source) {
  if (!source || typeof source.listMarkers !== 'function' || typeof source.lookupKey !== 'function') {
    throw new OpsError('ERASURE_REGISTRY_MISSING');
  }
  if (source.independent !== true) throw new OpsError('ERASURE_REGISTRY_NOT_INDEPENDENT');
  let lookupKey;
  try {
    lookupKey = await source.lookupKey();
  } catch {
    throw new OpsError('REGISTRY_KEY_CUSTODY_MISSING');
  }
  if (!(lookupKey instanceof SubjectLookupKey)) throw new OpsError('REGISTRY_KEY_CUSTODY_MISSING');
  let markers;
  try {
    markers = await source.listMarkers();
  } catch {
    throw new OpsError('ERASURE_REGISTRY_UNAVAILABLE');
  }
  if (!Array.isArray(markers)) throw new OpsError('ERASURE_REGISTRY_UNAVAILABLE');
  markers.forEach((marker, index) => {
    if (!isValidMarker(marker)) throw new OpsError('ERASURE_MARKER_INVALID', { index });
    if (marker.lookup_key_id !== lookupKey.id) throw new OpsError('REGISTRY_KEY_MISMATCH', { index });
  });
  return { markers: markers.map((marker) => Object.freeze({ ...marker, subject_lookups: [...marker.subject_lookups] })), lookupKey };
}

/** In-memory registry for tests and synthetic rehearsals. */
export function memoryMarkerSource({ markers, key, independent = true, location = 'memory' }) {
  return {
    independent,
    location,
    async listMarkers() {
      return markers;
    },
    async lookupKey() {
      return key;
    },
  };
}

/**
 * The hosted registry lives in a private R2 recovery-control scope with
 * maintenance-only credentials. Not configured until E1 authorizes it.
 */
export function hostedMarkerSource() {
  throw new OpsError('HOSTED_ADAPTER_NOT_AUTHORIZED');
}

/**
 * What the markers erase in the restored copy:
 * - each marker's own account, and any account holding an alias whose keyed
 *   lookup the marker lists if that alias was created no later than the marker
 *   (an older backup can hold an alias that later moved accounts; a later
 *   sign-up with the same subject is a new person record and is kept);
 * - `principalDigests`: every alias of those accounts, for the tables keyed by
 *   principal digest (event receipts, reconcile checks, …);
 * - `blocks`: those aliases re-blocked with the block end their marker
 *   records. Several markers on one account: no end wins, else the latest.
 *   An end already past adds no block.
 * - `reapply`: the accounts whose erasure was still in progress (a marker
 *   without purged_at, or a request held by the copy), for P5's re-queue.
 */
export function planErasure(identities, markers, lookupKey, existingAccountIds, now = new Date(), requestedAccountIds = []) {
  const existing = new Set(existingAccountIds);
  const byLookup = new Map();
  const byAccount = new Map();
  for (const identity of identities) {
    const entry = { ...identity, createdAt: Date.parse(identity.created_at) };
    const lookup = lookupKey.lookup(identity.issuer, identity.subject);
    byLookup.set(lookup, [...(byLookup.get(lookup) ?? []), entry]);
    byAccount.set(identity.account_id, [...(byAccount.get(identity.account_id) ?? []), entry]);
  }
  // P5 sets purged_at and blocked_until on every marker once its purge is
  // verified. A marker without them is an erasure still in progress at the
  // registry's last write: its account is re-queued (`reapply`, P5's
  // gogospend_reapply_erasure) so provider cleanup runs again, and its aliases
  // are held with no end until that erasure purges and sets the end. The same
  // goes for `requestedAccountIds`: deletions the restored copy itself holds
  // as accepted but not purged (their marker may not exist yet).
  const blockEnd = new Map();
  const pending = new Set();
  const erase = (accountId, marker) => {
    if (!marker.purged_at) pending.add(accountId);
    const until = marker.blocked_until ?? null;
    const previous = blockEnd.has(accountId) ? blockEnd.get(accountId) : undefined;
    blockEnd.set(accountId, previous === null || until === null ? null : previous === undefined || Date.parse(until) > Date.parse(previous) ? until : previous);
  };
  let applied = 0;
  for (const marker of markers) {
    const recordedAt = Date.parse(marker.recorded_at);
    let hit = existing.has(marker.account_id);
    if (hit) erase(marker.account_id, marker);
    for (const lookup of marker.subject_lookups) {
      for (const identity of byLookup.get(lookup) ?? []) {
        if (Number.isFinite(identity.createdAt) && identity.createdAt <= recordedAt) {
          erase(identity.account_id, marker);
          hit = true;
        }
      }
    }
    if (hit) applied += 1;
  }
  for (const accountId of requestedAccountIds) erase(accountId, { purged_at: null, blocked_until: null });
  const principalDigests = [];
  const blocks = [];
  const nowMs = new Date(now).getTime();
  for (const [accountId, until] of blockEnd) {
    for (const identity of byAccount.get(accountId) ?? []) {
      const digest = principalDigest(identity.issuer, identity.subject);
      principalDigests.push(digest);
      if (until === null || Date.parse(until) > nowMs) blocks.push({ digest, until });
    }
  }
  // Every marker's own account id is erased too, present or not: deleting an
  // absent id is a no-op, and the after-check then covers it as well.
  const accountIds = new Set([...blockEnd.keys(), ...markers.map((marker) => marker.account_id)]);
  return {
    accountIds: [...accountIds].sort(), accountsErased: blockEnd.size, applied, notPresent: markers.length - applied,
    principalDigests: principalDigests.sort(), blocks, reapply: [...pending].filter((accountId) => blockEnd.has(accountId)).sort(),
  };
}
