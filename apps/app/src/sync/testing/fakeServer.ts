// An in-memory v1 server for sync tests: receipts by command id (a resent
// command replays its acknowledgement), one revision per committed command,
// delta pages with an opaque cursor and a retention line (410), snapshots
// with chunk grants, a business-write limit per minute, and scripted
// failures - including a commit whose response is lost. Test use only.
import type { CommandAck, CommandStatus, CommittedChangeGroup, EntityChange, SnapshotChunk, SnapshotChunkGrant, SnapshotDto, SyncChangesPage, TransactionDto } from '@gogospend/contracts';

import { V1Error } from '../../api/client.ts';
import type { V1Outcome } from '../../api/client.ts';
import type { OutboxCommand } from '../../storage/types.ts';
import type { SyncRemote } from '../types.ts';

export type Script =
  | { kind: 'network_before' } // never reached the server
  | { kind: 'network_after' } // committed; the response was lost
  | { kind: 'session_changed_after' } // committed; the session changed before the response
  | { kind: 'problem'; outcome: V1Outcome; status: number; code: string; retryAfterSeconds?: number };

const problem = (outcome: V1Outcome, status: number, code: string, retryAfterSeconds?: number): Script => ({ kind: 'problem', outcome, status, code, retryAfterSeconds });
export const PROBLEMS = {
  rateLimited: (seconds = 30) => problem('rate_limited', 429, 'RATE_LIMITED', seconds),
  unavailable: () => problem('unavailable', 503, 'SERVICE_UNAVAILABLE'),
  upgrade: () => problem('upgrade_required', 426, 'CLIENT_UPGRADE_REQUIRED'),
  schema: () => problem('schema_unsupported', 422, 'COMMAND_SCHEMA_UNSUPPORTED'),
  invalid: () => problem('invalid', 422, 'VALIDATION_FAILED'),
  conflict: () => problem('conflict', 409, 'VERSION_CONFLICT'),
  signedOut: () => problem('signed_out', 401, 'UNAUTHENTICATED'),
  accountUnavailable: () => problem('signed_out', 403, 'ACCOUNT_UNAVAILABLE'),
  policy: () => problem('policy_required', 403, 'POLICY_ACCEPTANCE_REQUIRED'),
};

const throwScript = (script: Exclude<Script, { kind: 'network_after' } | { kind: 'session_changed_after' }>): never => {
  if (script.kind === 'network_before') throw new V1Error('network', 0, 'NETWORK_ERROR');
  throw new V1Error(script.outcome, script.status, script.code, { retryAfterSeconds: script.retryAfterSeconds });
};

export function createFakeServer(options: { now?: () => number; writesPerMinute?: number } = {}) {
  const now = options.now ?? (() => Date.now());
  const groups: CommittedChangeGroup[] = [];
  const receipts = new Map<string, { ack: CommandAck; body: string }>();
  const heads = new Map<string, EntityChange>();
  const sendScripts: Script[] = [];
  const otherScripts: Script[] = [];
  const sent: { commandId: string; schemaVersion: number; body: string }[] = [];
  const writeTimes: number[] = [];
  const snapshots = new Map<string, { polls: number; ready: SnapshotDto | null; failed?: boolean }>();
  let prunedThrough = 0;
  let inFlight = 0;
  let maxInFlight = 0;
  let snapshotPolls = 0;

  const cursor = (revision: number) => `cursor-${revision}`;
  const revisionOf = (value: string | null) => (value === null ? 0 : Number(value.replace('cursor-', '')));

  function commit(commandId: string, changes: EntityChange[]): number {
    const revision = groups.length + 1;
    groups.push({ revision: String(revision), command_id: commandId, changes });
    for (const change of changes) heads.set(change.id, change);
    return revision;
  }

  function createTransaction(command: OutboxCommand): CommandAck {
    const payload = command.payload as Record<string, unknown>;
    const dto = { note: null, merchant: null, ...payload, deleted_at: null, version: 1 } as unknown as TransactionDto;
    const revision = commit(command.commandId, [{ entity: 'transaction', id: dto.id, version: 1, state: 'active', snapshot: dto }]);
    return { command_id: command.commandId, entity_id: dto.id, version: 1, committed_revision: String(revision), outcome: 'created', entity_state: 'active' };
  }

  let offline = false;
  async function nextScript(queue: Script[]): Promise<Script | undefined> {
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (offline) return { kind: 'network_before' };
    return queue.shift();
  }

  const remote: SyncRemote = {
    async sendCreate(command) {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        const body = JSON.stringify(command.payload);
        sent.push({ commandId: command.commandId, schemaVersion: command.schemaVersion, body });
        const script = await nextScript(sendScripts);
        if (script && script.kind !== 'network_after' && script.kind !== 'session_changed_after') throwScript(script);
        // Like the real guard: every write (replays included) is charged to a
        // fixed one-minute window before the receipt lookup.
        if (options.writesPerMinute !== undefined) {
          const window = Math.floor(now() / 60_000);
          const used = writeTimes.filter((at) => Math.floor(at / 60_000) === window).length;
          if (used >= options.writesPerMinute) throw new V1Error('rate_limited', 429, 'RATE_LIMITED', { retryAfterSeconds: Math.ceil(((window + 1) * 60_000 - now()) / 1000) });
          writeTimes.push(now());
        }
        const receipt = receipts.get(command.commandId);
        if (receipt) {
          if (receipt.body !== body) throw new V1Error('idempotency_mismatch', 409, 'IDEMPOTENCY_MISMATCH');
          return receipt.ack;
        }
        const ack = createTransaction(command);
        receipts.set(command.commandId, { ack, body });
        if (script?.kind === 'network_after') throw new V1Error('network', 0, 'TIMEOUT');
        if (script?.kind === 'session_changed_after') throw new V1Error('session_changed', 0, 'SESSION_CHANGED');
        return ack;
      } finally {
        inFlight -= 1;
      }
    },
    async commandStatus(ids) {
      const script = await nextScript(otherScripts);
      if (script && script.kind !== 'network_after' && script.kind !== 'session_changed_after') throwScript(script);
      return ids.map((id): CommandStatus => {
        const receipt = receipts.get(id);
        if (!receipt) return { command_id: id, state: 'unknown' };
        const head = heads.get(receipt.ack.entity_id);
        return { command_id: id, state: 'known', ack: { ...receipt.ack, entity_state: head?.state ?? receipt.ack.entity_state } };
      });
    },
    async changes(from, limit = 200) {
      const script = await nextScript(otherScripts);
      if (script && script.kind !== 'network_after' && script.kind !== 'session_changed_after') throwScript(script);
      const position = revisionOf(from);
      if (position < prunedThrough || position > groups.length) throw new V1Error('unavailable', 410, 'RESYNC_REQUIRED');
      const page = groups.slice(position, position + limit);
      const last = page.length > 0 ? Number(page[page.length - 1].revision) : position;
      return { groups: page, next_cursor: cursor(last), has_more: last < groups.length } satisfies SyncChangesPage;
    },
    async requestSnapshot(key) {
      const id = `00000000-0000-4000-8000-${key.replace(/-/g, '').slice(0, 12)}`;
      if (!snapshots.has(id)) snapshots.set(id, { polls: snapshotPolls, ready: null });
      return remote.snapshotStatus(id);
    },
    async snapshotStatus(id) {
      const entry = snapshots.get(id);
      if (!entry) throw new V1Error('not_found', 404, 'NOT_FOUND');
      if (entry.failed) return { snapshot_id: id, status: 'failed' };
      if (entry.polls > 0) {
        entry.polls -= 1;
        return { snapshot_id: id, status: 'pending' };
      }
      if (!entry.ready) {
        const highWater = groups.length;
        entry.ready = {
          snapshot_id: id,
          status: 'ready',
          schema_version: 1,
          high_water: String(highWater),
          cursor: cursor(highWater),
          expires_at: new Date(now() + 86_400_000).toISOString(),
          chunks: [{ index: 0, bytes: 1, sha256: '0'.repeat(64), grant: `grant-${id}-AAAAAAAAAAAA`, grant_expires_at: new Date(now() + 300_000).toISOString() }],
        };
        chunkBodies.set(`grant-${id}-AAAAAAAAAAAA`, { schema_version: 1, snapshot_id: id, high_water: String(highWater), index: 0, entities: [...heads.values()].sort((a, b) => a.id.localeCompare(b.id)) });
      }
      return entry.ready;
    },
    async snapshotChunk(grant: SnapshotChunkGrant) {
      const chunk = chunkBodies.get(grant.grant);
      if (!chunk) throw new V1Error('not_found', 404, 'NOT_FOUND');
      return chunk;
    },
  };
  const chunkBodies = new Map<string, SnapshotChunk>();

  return {
    remote,
    sent,
    groups,
    receipts,
    get maxInFlight() {
      return maxInFlight;
    },
    /** Scripts the next sendCreate calls, in order. */
    scriptSends(...scripts: Script[]) {
      sendScripts.push(...scripts);
    },
    /** Scripts the next status/changes calls, in order. */
    scriptOthers(...scripts: Script[]) {
      otherScripts.push(...scripts);
    },
    /** Commits a change made elsewhere (another device, the server). */
    commitElsewhere(changes: EntityChange[]) {
      return commit(`0e000000-0000-4000-8000-${String(groups.length + 1).padStart(12, '0')}`, changes);
    },
    head: (id: string) => heads.get(id),
    prune(through: number) {
      prunedThrough = through;
    },
    /** While offline, every call fails before reaching the server. */
    setOffline(value: boolean) {
      offline = value;
    },
    snapshotPendingFor(polls: number) {
      snapshotPolls = polls;
    },
    records: () => [...heads.values()].filter((change) => change.entity === 'transaction'),
  };
}

export type FakeServer = ReturnType<typeof createFakeServer>;
