// The terms step's client (1C-T8, K24): which required policy versions this
// account still has to accept (GET /v1/me's `pending_policies`), the
// published text of each kind (GET /v1/policies), and the acceptance itself
// (POST /v1/me/policy-acceptances, one call per version). Pure: relative
// imports and contracts only, so Node's test runner loads it as it is.
//
// `watchPolicyRequired` wraps a transport so that a `policy_required` answer
// to any request it carries (the outbox's sends included, once 1C-T9 wraps
// the shared transport) reaches the terms gate, which then reads /v1/me again.
import { POLICY_KINDS } from '@gogospend/contracts';
import type { PolicyKind, PolicyVersionDto } from '@gogospend/contracts';

import { V1Error } from '../../api/client.ts';
import type { V1RequestOptions, V1Transport } from '../../api/client.ts';

export type PendingPolicy = { kind: PolicyKind; version: number };

export type PolicyClient = {
  /** GET /v1/me: validates `pending_policies` only (each kind in POLICY_KINDS, each version a safe integer of at least 1), so /v1/me may grow. */
  pending(): Promise<PendingPolicy[]>;
  /** GET /v1/policies: the latest published version of each kind. */
  published(): Promise<PolicyVersionDto[]>;
  /** POST /v1/me/policy-acceptances with the body exactly { kind, version }; the 204 is validated as null. */
  accept(policy: PendingPolicy): Promise<void>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isKind(value: unknown): value is PolicyKind {
  return typeof value === 'string' && (POLICY_KINDS as readonly string[]).includes(value);
}

function isVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
}

function isPendingPolicy(value: unknown): value is PendingPolicy {
  return isRecord(value) && isKind(value.kind) && isVersion(value.version);
}

/** Only `pending_policies` is read: whatever else /v1/me carries is neither checked nor kept. */
function hasPendingPolicies(value: unknown): value is { pending_policies: PendingPolicy[] } {
  return isRecord(value) && Array.isArray(value.pending_policies) && value.pending_policies.every(isPendingPolicy);
}

function isPolicyVersion(value: unknown): value is PolicyVersionDto {
  return isRecord(value) && isKind(value.kind) && isVersion(value.version) && typeof value.required === 'boolean'
    && typeof value.published_at === 'string' && isRecord(value.text) && typeof value.text.th === 'string' && typeof value.text.en === 'string';
}

function isPublished(value: unknown): value is PolicyVersionDto[] {
  return Array.isArray(value) && value.every(isPolicyVersion);
}

export function createPolicyClient(transport: V1Transport): PolicyClient {
  return {
    async pending() {
      const me = await transport.request('GET', '/v1/me', { validate: hasPendingPolicies });
      return me.pending_policies.map(({ kind, version }) => ({ kind, version }));
    },
    async published() {
      const policies = await transport.request('GET', '/v1/policies', { validate: isPublished });
      return policies.map(({ kind, version, required, published_at, text }) => ({ kind, version, required, published_at, text: { th: text.th, en: text.en } }));
    },
    async accept(policy) {
      await transport.request('POST', '/v1/me/policy-acceptances', {
        body: { kind: policy.kind, version: policy.version },
        validate: (value): value is null => value === null,
      });
    },
  };
}

/** One accept per entry, in order; the first failure rejects, and nothing after it is sent. */
export async function acceptPending(client: PolicyClient, pending: readonly PendingPolicy[]): Promise<void> {
  for (const policy of pending) await client.accept(policy);
}

/** The same transport, calling `onRequired` for each V1Error whose outcome is `policy_required`, then rethrowing it unchanged. */
export function watchPolicyRequired(transport: V1Transport, onRequired: () => void): V1Transport {
  return {
    async request<T>(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, options: V1RequestOptions<T>): Promise<T> {
      try {
        return await transport.request(method, path, options);
      } catch (error) {
        if (error instanceof V1Error && error.outcome === 'policy_required') onRequired();
        throw error;
      }
    },
  };
}
