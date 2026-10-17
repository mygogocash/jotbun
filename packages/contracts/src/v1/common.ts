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

/** Lower-case request header names used by v1. */
export const V1_HEADERS = {
  idempotencyKey: "idempotency-key",
  ifMatch: "if-match",
  session: "x-gogospend-session",
  client: "x-gogospend-client",
  commandSchema: "x-gogospend-command-schema",
} as const;
