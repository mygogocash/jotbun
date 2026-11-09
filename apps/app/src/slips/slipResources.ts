// The phone's slip calls (P4-T12, S13): the salt, slip batches read inside
// their request, drafts reviewed online, slip accounts mapped to wallets, a
// single read's slip ref, the bank album catalog and this device's push
// registration. Every answer must be exactly its contract DTO; nothing is
// coerced. Confirm and dismiss are commands under the caller's key. The
// account update is a plain write, sent as a command only because a command
// is how the transport sends If-Match. The slip read is no command, so the
// transport never resends it after a lost answer: the scan engine's next run
// sends the batch again (P4-T14). Its batch goes as the JSON's UTF-8 bytes,
// typed application/octet-stream: POST /v1/slips reads up to 8 MiB from the
// request's stream and parses it itself (P4-T6), while the edge's dispatcher
// parses an application/json body (up to 2 MiB) before the route and then
// hands it no stream.
// Pure: contracts and relative imports only, so Node loads it.
import {
  SLIP_INBOX_ID,
  SLIP_LIMITS,
  isBankAlbumsDto,
  isSlipAccountDto,
  isSlipAccountsDto,
  isSlipBatchResult,
  isSlipDraftsPage,
  isSlipSaltDto,
  isUuid,
} from '@gogospend/contracts';
import type {
  BankAlbumDto,
  CommandAck,
  DeviceRegistration,
  SlipAccountDto,
  SlipBatchRequest,
  SlipBatchResult,
  SlipConfirmRequest,
  SlipDraftsPage,
  SlipRefRequest,
  SlipSaltDto,
} from '@gogospend/contracts';

import { V1Error } from '../api/client.ts';
import type { V1Transport } from '../api/client.ts';
import { V1_COMMAND_SCHEMA, isCommandAck } from '../spend/v1/resources.ts';

export type SlipResources = {
  /** GET /v1/slips/salt: answers before slip import opens (S13). */
  salt(): Promise<SlipSaltDto>;
  /** POST /v1/slips, the batch as its JSON bytes for the route's stream: waits SLIP_LIMITS.clientTimeoutMs (90 s); not a command, so the transport never resends it. */
  read(request: SlipBatchRequest): Promise<SlipBatchResult>;
  drafts(cursor?: string, limit?: number): Promise<SlipDraftsPage>;
  confirm(drafts: SlipConfirmRequest['drafts'], commandId: string): Promise<CommandAck>;
  dismiss(draftId: string, commandId: string): Promise<CommandAck>;
  accounts(): Promise<SlipAccountDto[]>;
  /** A command with a new id and If-Match `version`; a stale version throws V1Error VERSION_CONFLICT (its `current` is the account) for the caller to reload. */
  updateAccount(id: string, version: number, walletId: string | null): Promise<SlipAccountDto>;
  /** POST /v1/slips/refs (204): answers before slip import opens (S13). */
  recordRef(request: SlipRefRequest): Promise<void>;
  bankAlbums(): Promise<BankAlbumDto[]>;
  /** PUT /v1/devices (204); a null push_token forgets this session's device. */
  registerDevice(registration: DeviceRegistration): Promise<void>;
};

/** The slip batch's type: bytes the route reads itself, never a JSON body the dispatcher parses first. */
const SLIP_BATCH_TYPE = 'application/octet-stream';

/** A 204 answer: no body at all. */
const isNoContent = (value: unknown): value is null => value === null;

/** An acknowledgement of this command for the vault's one slip_inbox entity (S1): confirm and dismiss. */
const inboxAck = (commandId: string) => (value: unknown): value is CommandAck =>
  isCommandAck(value) && value.command_id === commandId && value.entity_id === SLIP_INBOX_ID;

/** A draft or account id in a path: only a UUID, so nothing else can reach another route. */
const segment = (id: string) => {
  if (!isUuid(id)) throw new V1Error('invalid', 0, 'INVALID_ID');
  return id;
};

/** A new command id from expo-crypto, loaded only when an account update is sent (Hermes has no Web Crypto). */
const expoUuid = async (): Promise<string> => (await import('expo-crypto')).randomUUID();

export function createSlipResources(transport: V1Transport, newId: () => Promise<string> = expoUuid): SlipResources {
  return {
    salt: () => transport.request('GET', '/v1/slips/salt', { validate: isSlipSaltDto }),
    read: async (request) =>
      transport.request('POST', '/v1/slips', {
        raw: { bytes: new TextEncoder().encode(JSON.stringify(request)), contentType: SLIP_BATCH_TYPE },
        timeoutMs: SLIP_LIMITS.clientTimeoutMs,
        validate: isSlipBatchResult,
      }),
    drafts: (cursor, limit) => {
      const query = new URLSearchParams();
      if (cursor !== undefined) query.set('cursor', cursor);
      if (limit !== undefined) query.set('limit', String(limit));
      const search = query.toString();
      return transport.request('GET', `/v1/drafts${search ? `?${search}` : ''}`, { validate: isSlipDraftsPage });
    },
    confirm: (drafts, commandId) =>
      transport.request('POST', '/v1/drafts/confirm', { body: { drafts }, command: { id: commandId, schemaVersion: V1_COMMAND_SCHEMA }, validate: inboxAck(commandId) }),
    // Async, so an id that is not a UUID is a rejection like any other refusal.
    dismiss: async (draftId, commandId) =>
      transport.request('POST', `/v1/drafts/${segment(draftId)}/dismiss`, { body: {}, command: { id: commandId, schemaVersion: V1_COMMAND_SCHEMA }, validate: inboxAck(commandId) }),
    accounts: async () => (await transport.request('GET', '/v1/slip-accounts', { validate: isSlipAccountsDto })).accounts,
    updateAccount: async (id, version, walletId) => {
      const path = `/v1/slip-accounts/${segment(id)}`;
      return transport.request('PUT', path, {
        body: { wallet_id: walletId },
        command: { id: await newId(), schemaVersion: V1_COMMAND_SCHEMA, ifMatch: version },
        validate: (value): value is SlipAccountDto => isSlipAccountDto(value) && value.id === id,
      });
    },
    recordRef: async (request) => {
      await transport.request('POST', '/v1/slips/refs', { body: request, validate: isNoContent });
    },
    bankAlbums: async () => (await transport.request('GET', '/v1/catalog/bank-albums', { validate: isBankAlbumsDto })).albums,
    registerDevice: async (registration) => {
      await transport.request('PUT', '/v1/devices', { body: registration, validate: isNoContent });
    },
  };
}
