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
 * and the other workers can neither read nor write it. Append-only.
 */
export interface ErasureRegistry {
  /**
   * Idempotent: resolves with a stored marker of this account that covers
   * every alias, writing a new one only when none does. Anything else throws,
   * and the caller must not destroy anything.
   */
  record(accountId: string, providerSubjectKeys: readonly ProviderSubjectKey[]): Promise<MarkerReceipt>;
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

type MarkerRow = { marker_id: string; account_id: string; subject_lookups: string[]; lookup_key_id: string; recorded_at: Date };
const toMarker = (row: MarkerRow): ErasureMarker => ({
  marker_id: row.marker_id,
  account_id: row.account_id,
  subject_lookups: [...row.subject_lookups],
  lookup_key_id: row.lookup_key_id,
  recorded_at: row.recorded_at.toISOString(),
});

/**
 * The PostgreSQL registry (schema erasure_registry; INSERT and SELECT only),
 * on its own maintenance login. Locally it sits in the test/dev database; in
 * production it must be an independent store (P6a), so a restore of the main
 * database cannot roll it back.
 */
export class PostgresErasureRegistry implements ErasureRegistry {
  constructor(private readonly pool: Pool, private readonly key: LookupKey) {}

  get lookupKeyId(): string {
    return this.key.id;
  }

  async record(accountId: string, providerSubjectKeys: readonly ProviderSubjectKey[]): Promise<MarkerReceipt> {
    const valid = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 512;
    if (!isUuid(accountId) || providerSubjectKeys.length === 0 || !providerSubjectKeys.every((key) => valid(key?.issuer) && valid(key?.subject))) {
      throw new ErasureRegistryError('invalid_input');
    }
    const wanted = [...new Set(providerSubjectKeys.map((key) => this.key.lookup(key.issuer, key.subject)))].sort();
    const existing = await this.markersOf(accountId);
    const recorded = new Set(existing.flatMap((marker) => marker.subject_lookups));
    if (existing.length > 0 && wanted.every((lookup) => recorded.has(lookup))) return existing[0];
    // Append-only: a new marker (more than 32 aliases take several), never an edit.
    let first: ErasureMarker | undefined;
    for (let start = 0; start < wanted.length; start += MAX_LOOKUPS) {
      const { rows } = await this.pool.query<MarkerRow>(
        `INSERT INTO erasure_registry.erasure_markers (marker_id, account_id, subject_lookups, lookup_key_id)
         VALUES ($1, $2, $3::text[], $4)
         RETURNING marker_id, account_id, subject_lookups, lookup_key_id, recorded_at`,
        [randomUUID(), accountId, wanted.slice(start, start + MAX_LOOKUPS), this.key.id],
      );
      if (!rows[0]) throw new ErasureRegistryError('incomplete');
      first ??= toMarker(rows[0]);
    }
    // Read back: the registry, not this process's memory, is what restores use.
    const stored = await this.markersOf(accountId);
    const lookups = new Set(stored.flatMap((marker) => marker.subject_lookups));
    if (!first || !wanted.every((lookup) => lookups.has(lookup))) throw new ErasureRegistryError('incomplete');
    return first;
  }

  async listMarkers(): Promise<ErasureMarker[]> {
    const { rows } = await this.pool.query<MarkerRow>(
      `SELECT marker_id, account_id, subject_lookups, lookup_key_id, recorded_at FROM erasure_registry.erasure_markers ORDER BY recorded_at, marker_id`,
    );
    return rows.map(toMarker);
  }

  private async markersOf(accountId: string): Promise<ErasureMarker[]> {
    const { rows } = await this.pool.query<MarkerRow>(
      `SELECT marker_id, account_id, subject_lookups, lookup_key_id, recorded_at FROM erasure_registry.erasure_markers
        WHERE account_id = $1 AND lookup_key_id = $2 ORDER BY recorded_at, marker_id`,
      [accountId, this.key.id],
    );
    return rows.map(toMarker);
  }
}
