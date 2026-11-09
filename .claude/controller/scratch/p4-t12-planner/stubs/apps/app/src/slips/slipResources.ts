// RED stub (P4-T12): the plan's interface, with no behaviour yet.
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

import type { V1Transport } from '../api/client.ts';

export type SlipResources = {
  salt(): Promise<SlipSaltDto>;
  read(request: SlipBatchRequest): Promise<SlipBatchResult>;
  drafts(cursor?: string, limit?: number): Promise<SlipDraftsPage>;
  confirm(drafts: SlipConfirmRequest['drafts'], commandId: string): Promise<CommandAck>;
  dismiss(draftId: string, commandId: string): Promise<CommandAck>;
  accounts(): Promise<SlipAccountDto[]>;
  updateAccount(id: string, version: number, walletId: string | null): Promise<SlipAccountDto>;
  recordRef(request: SlipRefRequest): Promise<void>;
  bankAlbums(): Promise<BankAlbumDto[]>;
  registerDevice(registration: DeviceRegistration): Promise<void>;
};

const NO_ACK: CommandAck = { command_id: '', entity_id: '', version: 1, committed_revision: '0', outcome: 'accepted', entity_state: 'active' };
const NO_ACCOUNT: SlipAccountDto = { id: '', version: 1, bank: 'other', account_last4: '', wallet_id: null, open_drafts: 0 };

export function createSlipResources(_transport: V1Transport, _newId?: () => Promise<string>): SlipResources {
  return {
    salt: async () => ({ salt: '' }),
    read: async () => ({ results: [], uses_left: { live: 0, backfill: 0 }, retry_after_seconds: null }),
    drafts: async () => ({ drafts: [], total: 0, next_cursor: null }),
    confirm: async () => NO_ACK,
    dismiss: async () => NO_ACK,
    accounts: async () => [],
    updateAccount: async () => NO_ACCOUNT,
    recordRef: async () => undefined,
    bankAlbums: async () => [],
    registerDevice: async () => undefined,
  };
}
