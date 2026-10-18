import { createHmac, randomUUID } from 'node:crypto';

import { isUuid } from '@gogospend/contracts';
import type { Pool } from 'pg';

/**
 * One erased account, exactly as P6a's restore reads it (the
 * erasure-marker contract): no email, name, raw subject, token or amount.
 */
export type ErasureMarker = {
  marker_id: string;
  /** The internal account UUID (opaque; never reused). */
  account_id: string;
  /** 1-32 keyed lookups, one per provider alias (`subjectLookup`). */
  subject_lookups: string[];
  /** The id of the lookup key that made them (`lookupKeyId`). */
  lookup_key_id: string;
  /** ISO-8601 UTC time the marker was durably written. */
  recorded_at: string;
  /** When P5 verified the account's server-side rows and objects were purged; null until then (the marker cannot be cleared before). */
  purged_at: string | null;
  /** The end of the aliases' hold P5 set at the purge (a restore replays it); null while the hold has no end. */
  blocked_until: string | null;
};

/** The stored marker that covers a `record` call. */
export type MarkerReceipt = ErasureMarker;

/** A provider alias of the account: its issuer and subject (turned into a keyed lookup, never stored raw). */
export type ProviderSubjectKey = { issuer: string; subject: string };

/**
 * The independent erasure authority (P5). Before anything is destroyed, the
 * deletion handler records a marker for the account and its provider
 * aliases in a maintenance-only scope outside the main database's restore
 * path, so P6a can re-erase the account (and every alias created no later
 * than the marker) after restoring an older backup. Only the deletion
 * worker's maintenance login (gogospend_erasure_registry) can use it; the API
 * and the other workers can neither read nor write it. Append-only, except
 * that each marker's purge is recorded once.
 */
export interface ErasureRegistry {
  /**
   * Idempotent: resolves with a stored marker of this account that covers
   * every alias, writing a new one only when none does. Anything else throws,
   * and the caller must not destroy anything.
   */
  record(accountId: string, providerSubjectKeys: readonly ProviderSubjectKey[]): Promise<MarkerReceipt>;
  /**
   * Records, once, that the account's server-side data is purged and when its
   * aliases' hold ends, on every marker of the account. Resolves only when
   * every marker carries it.
   */
  recordPurge(accountId: string, purgedAt: Date, blockedUntil: Date | null): Promise<void>;
  /** The complete marker set; throws when it cannot read (never [] for "unreadable"). */
  listMarkers(): Promise<ErasureMarker[]>;
}

export class ErasureRegistryError extends Error {
  constructor(readonly code: 'invalid_input' | 'incomplete') {
    super(`Erasure registry: ${code}`);
    this.name = 'ErasureRegistryError';
  }
}

const LOOKUP_INFO = 'gogospend-erasure-subject-v1';
const KEY_ID_INFO = 'gogospend-erasure-key-id-v1';
const MAX_LOOKUPS = 32;

/** The registry's 32-byte lookup key; P6a's SubjectLookupKey derives the same id and lookups. */
export class LookupKey {
  readonly id: string;
  readonly #bytes: Buffer;

  constructor(bytes: Buffer) {
    if (!Buffer.isBuffer(bytes) || bytes.length !== 32) throw new RangeError('the erasure lookup key is 32 bytes');
    this.#bytes = Buffer.from(bytes);
    this.id = createHmac('sha256', this.#bytes).update(KEY_ID_INFO).digest().subarray(0, 16).toString('hex');
  }

  /** base64url(HMAC-SHA256(key, "gogospend-erasure-subject-v1\0<issuer>\0<subject>")). */
  lookup(issuer: string, subject: string): string {
    return createHmac('sha256', this.#bytes).update(`${LOOKUP_INFO}\u0000${issuer}\u0000${subject}`, 'utf8').digest('base64url');
  }

  toJSON(): { lookup_key_id: string } {
    return { lookup_key_id: this.id };
  }
}

type MarkerRow = { marker_id: string; account_id: string; subject_lookups: string[]; lookup_key_id: string; recorded_at: Date; purged_at: Date | null; blocked_until: Date | null };
const COLUMNS = 'marker_id, account_id, subject_lookups, lookup_key_id, recorded_at, purged_at, blocked_until';
const toMarker = (row: MarkerRow): ErasureMarker => ({
  marker_id: row.marker_id,
  account_id: row.account_id,
  subject_lookups: [...row.subject_lookups],
  lookup_key_id: row.lookup_key_id,
  recorded_at: row.recorded_at.toISOString(),
  purged_at: row.purged_at ? row.purged_at.toISOString() : null,
  blocked_until: row.blocked_until ? row.blocked_until.toISOString() : null,
});

export type RegistryPlacement = {
  /** True only when the registry lives outside the main database and its backups (P6a refuses anything else). */
  independent?: boolean;
  /** A non-secret label for receipts, e.g. 'r2-recovery-control'. */
  location?: string;
};

/**
 * The PostgreSQL registry (schema erasure_registry; INSERT, SELECT and the
 * once-only purge record), on its own maintenance login. It has the shape
 * P6a's restore reads (`independent`, `location`, `listMarkers()`) except
 * `lookupKey()`: the key's bytes never leave this object and the API code
 * never imports the restore tooling, so that tooling takes the lookup key from
 * its own custody and checks it against `lookupKeyId`. Locally it sits in the
 * test/dev database, so it is NOT independent (the default); production must
 * place it in an independent store and say so.
 */
export class PostgresErasureRegistry implements ErasureRegistry {
  readonly independent: boolean;
  readonly location: string;

  constructor(private readonly pool: Pool, private readonly key: LookupKey, placement: RegistryPlacement = {}) {
    this.independent = placement.independent === true;
    this.location = placement.location ?? 'same-database';
  }

  get lookupKeyId(): string {
    return this.key.id;
  }

  async record(accountId: string, providerSubjectKeys: readonly ProviderSubjectKey[]): Promise<MarkerReceipt> {
    const valid = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 512;
    if (!isUuid(accountId) || providerSubjectKeys.length === 0 || !providerSubjectKeys.every((key) => valid(key?.issuer) && valid(key?.subject))) {
      throw new ErasureRegistryError('invalid_input');
    }
    const wanted = [...new Set(providerSubjectKeys.map((key) => this.key.lookup(key.issuer, key.subject)))].sort();
    // Only markers whose purge is not recorded yet count: an erasure re-run
    // after a restore appends a new one, so the account's markers cannot be
    // cleared before this run's purge is recorded too.
    const existing = (await this.markersOf(accountId)).filter((marker) => marker.purged_at === null);
    const recorded = new Set(existing.flatMap((marker) => marker.subject_lookups));
    if (existing.length > 0 && wanted.every((lookup) => recorded.has(lookup))) return existing[0];
    // Append-only: a new marker (more than 32 aliases take several), never an edit.
    let first: ErasureMarker | undefined;
    for (let start = 0; start < wanted.length; start += MAX_LOOKUPS) {
      const { rows } = await this.pool.query<MarkerRow>(
        `INSERT INTO erasure_registry.erasure_markers (marker_id, account_id, subject_lookups, lookup_key_id)
         VALUES ($1, $2, $3::text[], $4)
         RETURNING ${COLUMNS}`,
        [randomUUID(), accountId, wanted.slice(start, start + MAX_LOOKUPS), this.key.id],
      );
      if (!rows[0]) throw new ErasureRegistryError('incomplete');
      first ??= toMarker(rows[0]);
    }
    // Read back: the registry, not this process's memory, is what restores use.
    const stored = (await this.markersOf(accountId)).filter((marker) => marker.purged_at === null);
    const lookups = new Set(stored.flatMap((marker) => marker.subject_lookups));
    if (!first || !wanted.every((lookup) => lookups.has(lookup))) throw new ErasureRegistryError('incomplete');
    return first;
  }

  async recordPurge(accountId: string, purgedAt: Date, blockedUntil: Date | null): Promise<void> {
    if (!isUuid(accountId) || !(purgedAt instanceof Date) || Number.isNaN(purgedAt.getTime())) throw new ErasureRegistryError('invalid_input');
    // A marker's clock may run ahead of the main database's: purged_at never precedes recorded_at.
    await this.pool.query(
      `UPDATE erasure_registry.erasure_markers SET purged_at = greatest($2::timestamptz, recorded_at), blocked_until = $3
        WHERE account_id = $1 AND lookup_key_id = $4 AND purged_at IS NULL`,
      [accountId, purgedAt, blockedUntil, this.key.id],
    );
    const markers = await this.markersOf(accountId);
    if (markers.length === 0 || markers.some((marker) => marker.purged_at === null)) throw new ErasureRegistryError('incomplete');
  }

  async listMarkers(): Promise<ErasureMarker[]> {
    const { rows } = await this.pool.query<MarkerRow>(`SELECT ${COLUMNS} FROM erasure_registry.erasure_markers ORDER BY recorded_at, marker_id`);
    return rows.map(toMarker);
  }

  private async markersOf(accountId: string): Promise<ErasureMarker[]> {
    const { rows } = await this.pool.query<MarkerRow>(
      `SELECT ${COLUMNS} FROM erasure_registry.erasure_markers
        WHERE account_id = $1 AND lookup_key_id = $2 ORDER BY recorded_at, marker_id`,
      [accountId, this.key.id],
    );
    return rows.map(toMarker);
  }
}
