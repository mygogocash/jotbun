/**
 * v1 types shared by the API and the mobile app. Names follow the master
 * plan's "Shared interfaces and wire decisions"; wire DTOs are snake_case,
 * ports and request context are camelCase.
 */

/** Internal account UUID; never a provider subject. */
export type AccountId = string;
/** Canonical decimal integer string of satang; positive for amounts, signed for totals. */
export type Minor = string;
/** Nonnegative bigint decimal string allocated under the account lock. */
export type Revision = string;

export type ApiIdentity = {
  issuer: string;
  subject: string;
  clientId: string;
  scopes: readonly string[];
};

export type SessionContext = {
  accountId: AccountId;
  subject: string;
  clientId: string;
  bindingId: string;
  sessionGeneration: number;
};

export type CommandInput<P> = {
  commandId: string;
  kind: string;
  schemaVersion: number;
  payload: P;
  expectedVersion?: number;
};

export const COMMAND_OUTCOMES = [
  "created",
  "updated",
  "deleted",
  "restored",
  "archived",
  "unarchived",
  "accepted",
] as const;
export type CommandOutcome = (typeof COMMAND_OUTCOMES)[number];

export const ENTITY_STATES = ["active", "deleted", "purged"] as const;
export type EntityState = (typeof ENTITY_STATES)[number];

export type CommandAck = {
  command_id: string;
  entity_id: string;
  /** Entity version after this command. */
  version: number;
  committed_revision: Revision;
  outcome: CommandOutcome;
  entity_state: EntityState;
};

/** One entity's state after a command; `snapshot` is its persisted DTO (null once purged). */
export type EntityChange = {
  entity: string;
  id: string;
  version: number;
  state: EntityState;
  snapshot: unknown | null;
};

/** Everything one command committed, under one account revision. Sync never splits a group. */
export type CommittedChangeGroup = {
  revision: Revision;
  command_id: string;
  changes: readonly EntityChange[];
};

/** A serialized group above this is rejected before commit (`COMMAND_TOO_LARGE`). */
export const MAX_CHANGE_GROUP_BYTES = 1024 * 1024;

/** POST /v1/commands/status: at most this many command ids per request. */
export const MAX_COMMAND_STATUS_IDS = 100;

export type CommandStatusRequest = {
  command_ids: string[];
};

/**
 * `unknown`: never committed for this account (safe to resend the same
 * immutable command). `known`: the original acknowledgement, with
 * `entity_state` reporting the entity's current state (deleted/purged
 * entities are reported, never reconstructed).
 */
export type CommandStatus =
  | { command_id: string; state: "unknown" }
  | { command_id: string; state: "known"; ack: CommandAck };

export type CommandStatusResponse = {
  statuses: CommandStatus[];
};

/** Lower-case request header names used by v1. */
export const V1_HEADERS = {
  idempotencyKey: "idempotency-key",
  ifMatch: "if-match",
  session: "x-gogospend-session",
  client: "x-gogospend-client",
  commandSchema: "x-gogospend-command-schema",
} as const;
