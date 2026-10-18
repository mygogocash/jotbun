/**
 * S1 sync wire contract: ordered change deltas and immutable full snapshots.
 *
 * Deltas (`GET /v1/sync/changes?cursor=&limit=`) return whole committed
 * change groups in revision order; a page never splits a group. The cursor is
 * opaque and names the last fully included group revision. A cursor older
 * than the 30-day change retention gets `410 RESYNC_REQUIRED`: download a
 * snapshot, then continue from the snapshot's cursor.
 *
 * Snapshots (`POST /v1/sync/snapshots`, then `GET /v1/sync/snapshots/:id`)
 * are built by a background job from one consistent database view at
 * `high_water`. A ready snapshot lists its chunks with short-lived opaque
 * download grants (`GET /v1/sync/snapshot-chunks/:grant`), never storage
 * keys or URLs. Applying every chunk and then deltas after `cursor` yields
 * every entity's latest state exactly once.
 */
import { ENTITY_STATES } from "./common.ts";
import type { CommittedChangeGroup, EntityChange, Revision } from "./common.ts";
import { isBudgetSnapshot } from "./budgets.ts";
import { isCategorySnapshot } from "./categories.ts";
import { isImportReviewSnapshot, isImportSelectionSnapshot } from "./imports.ts";
import { isExportRequestSnapshot } from "./privacy.ts";
import { isTransactionSnapshot } from "./transactions.ts";
import { isUuid } from "./validation.ts";
import { isWalletSnapshot } from "./wallets.ts";

/** Default and maximum change groups per delta page (rows count groups, not changes). */
export const SYNC_DEFAULT_GROUPS = 200;
export const SYNC_MAX_GROUPS = 1000;
/** Serialized size budget of one delta page; one group (at most 1 MiB) always fits. */
export const SYNC_PAGE_BYTES = 2 * 1024 * 1024;
/** Committed changes stay available to deltas this long; older cursors must resync. */
export const SYNC_RETENTION_DAYS = 30;
/** A completed snapshot (manifest and chunks) expires after this. */
export const SNAPSHOT_TTL_HOURS = 24;
/** A chunk download grant expires after this. */
export const SNAPSHOT_GRANT_MINUTES = 5;
export const SNAPSHOT_SCHEMA_VERSION = 1;

export type SyncChangesPage = {
  groups: CommittedChangeGroup[];
  /** Resume after the last fully included group (the request's own position when empty). */
  next_cursor: string;
  has_more: boolean;
};

export const SNAPSHOT_STATUSES = ["pending", "ready", "failed", "expired"] as const;
export type SnapshotStatus = (typeof SNAPSHOT_STATUSES)[number];

export type SnapshotChunkGrant = {
  index: number;
  bytes: number;
  /** Lowercase hex SHA-256 of the chunk body. */
  sha256: string;
  /** Opaque; valid until `grant_expires_at`. Ask for the snapshot again for fresh grants. */
  grant: string;
  grant_expires_at: string;
};

export type SnapshotDto =
  | { snapshot_id: string; status: "pending" | "failed" | "expired" }
  | {
      snapshot_id: string;
      status: "ready";
      schema_version: typeof SNAPSHOT_SCHEMA_VERSION;
      high_water: Revision;
      /** Delta cursor at `high_water`: continue `GET /v1/sync/changes` from here. */
      cursor: string;
      expires_at: string;
      chunks: SnapshotChunkGrant[];
    };

/** One chunk body. Entities are each entity's latest state at `high_water` (deleted ones as tombstones). */
export type SnapshotChunk = {
  schema_version: typeof SNAPSHOT_SCHEMA_VERSION;
  snapshot_id: string;
  high_water: Revision;
  index: number;
  entities: EntityChange[];
};

/** The persisted DTO validator of every entity that sync carries. */
export const SYNC_ENTITY_VALIDATORS: Readonly<Record<string, (snapshot: unknown) => boolean>> = {
  wallet: isWalletSnapshot,
  category: isCategorySnapshot,
  transaction: isTransactionSnapshot,
  budget: isBudgetSnapshot,
  // P4: an export request (its period only); the file is never synced.
  export: isExportRequestSnapshot,
  // P3: an import's correction revision and a frozen selection's progress
  // (revisions and counts only; candidate fields are never synced).
  import_review: isImportReviewSnapshot,
  import_selection: isImportSelectionSnapshot,
};

const REVISION = /^(0|[1-9][0-9]{0,18})$/;
const SHA256 = /^[0-9a-f]{64}$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactly(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

/**
 * An entity change whose snapshot matches its entity's persisted DTO
 * (`validators`, default SYNC_ENTITY_VALIDATORS). Unknown entities fail.
 */
export function isEntityChange(value: unknown, validators: Readonly<Record<string, (snapshot: unknown) => boolean>> = SYNC_ENTITY_VALIDATORS): value is EntityChange {
  if (!isObject(value) || !hasExactly(value, ["entity", "id", "version", "state", "snapshot"])) return false;
  const validate = typeof value.entity === "string" && Object.prototype.hasOwnProperty.call(validators, value.entity) ? validators[value.entity] : undefined;
  if (!validate || !isUuid(value.id) || !Number.isInteger(value.version) || (value.version as number) < 1) return false;
  if (!ENTITY_STATES.includes(value.state as never)) return false;
  if (value.state === "purged") return value.snapshot === null;
  const snapshot = value.snapshot;
  return isObject(snapshot) && snapshot.id === value.id && (snapshot.version === undefined || snapshot.version === value.version) && validate(snapshot);
}

export function isCommittedChangeGroup(value: unknown, validators = SYNC_ENTITY_VALIDATORS): value is CommittedChangeGroup {
  return (
    isObject(value) && hasExactly(value, ["revision", "command_id", "changes"]) &&
    typeof value.revision === "string" && REVISION.test(value.revision) && value.revision !== "0" &&
    isUuid(value.command_id) && Array.isArray(value.changes) && value.changes.length > 0 &&
    value.changes.every((change) => isEntityChange(change, validators))
  );
}

export function isSnapshotChunk(value: unknown, validators = SYNC_ENTITY_VALIDATORS): value is SnapshotChunk {
  return (
    isObject(value) && hasExactly(value, ["schema_version", "snapshot_id", "high_water", "index", "entities"]) &&
    value.schema_version === SNAPSHOT_SCHEMA_VERSION && isUuid(value.snapshot_id) &&
    typeof value.high_water === "string" && REVISION.test(value.high_water) &&
    Number.isInteger(value.index) && (value.index as number) >= 0 &&
    Array.isArray(value.entities) && value.entities.every((entity) => isEntityChange(entity, validators))
  );
}

export function isSnapshotChunkGrant(value: unknown): value is SnapshotChunkGrant {
  return (
    isObject(value) && hasExactly(value, ["index", "bytes", "sha256", "grant", "grant_expires_at"]) &&
    Number.isInteger(value.index) && (value.index as number) >= 0 &&
    Number.isSafeInteger(value.bytes) && (value.bytes as number) >= 0 &&
    typeof value.sha256 === "string" && SHA256.test(value.sha256) &&
    typeof value.grant === "string" && /^[A-Za-z0-9_-]{16,512}$/.test(value.grant) &&
    typeof value.grant_expires_at === "string" && !Number.isNaN(Date.parse(value.grant_expires_at))
  );
}

const CURSOR = /^[A-Za-z0-9_-]{1,512}$/;

/** A delta page: whole valid groups in strictly increasing revision order. */
export function isSyncChangesPage(value: unknown, validators = SYNC_ENTITY_VALIDATORS): value is SyncChangesPage {
  if (!isObject(value) || !hasExactly(value, ["groups", "next_cursor", "has_more"])) return false;
  if (typeof value.next_cursor !== "string" || !CURSOR.test(value.next_cursor) || typeof value.has_more !== "boolean" || !Array.isArray(value.groups)) return false;
  let previous = -1n;
  for (const group of value.groups) {
    if (!isCommittedChangeGroup(group, validators)) return false;
    const revision = BigInt(group.revision);
    if (revision <= previous) return false;
    previous = revision;
  }
  return true;
}

/** A snapshot status: pending/failed/expired carry only their id; ready carries its versioned manifest view. */
export function isSnapshotDto(value: unknown): value is SnapshotDto {
  if (!isObject(value) || !isUuid(value.snapshot_id)) return false;
  if (value.status === "pending" || value.status === "failed" || value.status === "expired") return hasExactly(value, ["snapshot_id", "status"]);
  return (
    value.status === "ready" &&
    hasExactly(value, ["snapshot_id", "status", "schema_version", "high_water", "cursor", "expires_at", "chunks"]) &&
    value.schema_version === SNAPSHOT_SCHEMA_VERSION &&
    typeof value.high_water === "string" && REVISION.test(value.high_water) &&
    typeof value.cursor === "string" && CURSOR.test(value.cursor) &&
    typeof value.expires_at === "string" && !Number.isNaN(Date.parse(value.expires_at)) &&
    Array.isArray(value.chunks) && value.chunks.length > 0 &&
    value.chunks.every((chunk, index) => isSnapshotChunkGrant(chunk) && chunk.index === index)
  );
}
