// The erasure-marker contract between P5 and P6a.
//
// P5's ErasureRegistry.record(accountId, providerSubjectKeys) writes one
// marker per accepted account deletion, before any destructive cleanup, to a
// maintenance-only recovery-control scope that is NOT inside the database or
// backups being restored. A restore reads every marker and erases the matching
// accounts in the private copy before anything could serve it.
//
// ErasureMarker (stored record; exactly these keys, nothing else):
//   marker_id        lower-case UUID
//   account_id       internal account UUID (opaque; never reused)
//   subject_lookups  1–32 keyed lookups, base64url HMAC-SHA256 (43 chars), one
//                    per provider alias: deriveSubjectLookup(key, issuer, subject)
//   lookup_key_id    32 hex chars: SubjectLookupKey.id of the key that made them
//   recorded_at      ISO-8601 UTC time the marker was durably written
// No email, name, raw subject, token, amount or other financial value.
//
// ErasureMarkerSource (what P5 supplies to restores):
//   independent: true          only when stored outside the restored DB/backup
//   location: string           non-secret label, e.g. 'r2-recovery-control'
//   listMarkers(): Promise<ErasureMarker[]>   the complete set; throws on any
//                              read failure (never [] for "could not read")
//   lookupKey(): Promise<SubjectLookupKey>    throws/undefined if key custody is
//                              unavailable
import { createHmac, randomBytes } from 'node:crypto';
import { inspect } from 'node:util';

import { OpsError } from './ops-safety.mjs';

const LOOKUP_INFO = 'gogospend-erasure-subject-v1';
const KEY_ID_INFO = 'gogospend-erasure-key-id-v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LOOKUP = /^[A-Za-z0-9_-]{43}$/;
const KEY_ID = /^[0-9a-f]{32}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const MARKER_KEYS = ['account_id', 'lookup_key_id', 'marker_id', 'recorded_at', 'subject_lookups'];

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

export function isValidMarker(marker) {
  if (!marker || typeof marker !== 'object' || Array.isArray(marker)) return false;
  if (Object.keys(marker).sort().join(',') !== MARKER_KEYS.join(',')) return false;
  return UUID.test(marker.marker_id) && UUID.test(marker.account_id) && KEY_ID.test(marker.lookup_key_id)
    && typeof marker.recorded_at === 'string' && ISO.test(marker.recorded_at) && Number.isFinite(Date.parse(marker.recorded_at))
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
 * Accounts in the restored copy that markers erase. A marker matches its own
 * account id, and any alias whose keyed lookup it lists if that alias was
 * created no later than the marker (an older backup can hold an alias that
 * later moved accounts; a later sign-up with the same subject is a new person
 * record and is kept).
 */
export function planErasure(identities, markers, lookupKey, existingAccountIds) {
  const existing = new Set(existingAccountIds);
  const erase = new Set();
  let applied = 0;
  const lookups = identities.map((identity) => ({ ...identity, lookup: lookupKey.lookup(identity.issuer, identity.subject), createdAt: Date.parse(identity.created_at) }));
  for (const marker of markers) {
    const wanted = new Set(marker.subject_lookups);
    const recordedAt = Date.parse(marker.recorded_at);
    let hit = existing.has(marker.account_id);
    if (hit) erase.add(marker.account_id);
    for (const identity of lookups) {
      if (Number.isFinite(identity.createdAt) && identity.createdAt <= recordedAt && wanted.has(identity.lookup)) {
        erase.add(identity.account_id);
        hit = true;
      }
    }
    if (hit) applied += 1;
  }
  // Every marker's own account id is erased too, present or not: deleting an
  // absent id is a no-op, and the after-check then covers it as well.
  const accountIds = new Set([...erase, ...markers.map((marker) => marker.account_id)]);
  return { accountIds: [...accountIds].sort(), accountsErased: erase.size, applied, notPresent: markers.length - applied };
}
