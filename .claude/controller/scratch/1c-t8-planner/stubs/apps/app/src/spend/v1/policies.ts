// 1C-T8 RED stub (R52): the terms client reads nothing pending, sends nothing, and watches nothing.
import type { PolicyKind, PolicyVersionDto } from '@gogospend/contracts';

import type { V1Transport } from '../../api/client.ts';

export type PendingPolicy = { kind: PolicyKind; version: number };

export type PolicyClient = {
  pending(): Promise<PendingPolicy[]>;
  published(): Promise<PolicyVersionDto[]>;
  accept(policy: PendingPolicy): Promise<void>;
};

export function createPolicyClient(_transport: V1Transport): PolicyClient {
  return {
    pending: async () => [],
    published: async () => [],
    accept: async () => undefined,
  };
}

export async function acceptPending(_client: PolicyClient, _pending: readonly PendingPolicy[]): Promise<void> {
  return undefined;
}

export function watchPolicyRequired(transport: V1Transport, _onRequired: () => void): V1Transport {
  return transport;
}
