// RED stub (P4-T12): the plan's interface, with no behaviour yet.
import type { BankAlbumDto, CommandAck, SlipAccountDto, SlipBatchItem, SlipDraftDto, SlipResult, SlipSaltDto } from '@gogospend/contracts';

import type { SlipResources } from '../slipResources.ts';

export type FakeSlipCall = { method: keyof SlipResources; body?: unknown };

export const FAKE_SLIP_SALT: SlipSaltDto = { salt: '' };

const NO_ACK: CommandAck = { command_id: '', entity_id: '', version: 1, committed_revision: '0', outcome: 'accepted', entity_state: 'active' };
const NO_ACCOUNT: SlipAccountDto = { id: '', version: 1, bank: 'other', account_last4: '', wallet_id: null, open_drafts: 0 };

export function fakeSlipResources(_options: {
  read?: (item: SlipBatchItem, index: number) => SlipResult;
  drafts?: SlipDraftDto[];
  accounts?: SlipAccountDto[];
  albums?: BankAlbumDto[];
  slipImportOn?: boolean;
} = {}): SlipResources & { calls: FakeSlipCall[] } {
  return {
    calls: [],
    salt: async () => FAKE_SLIP_SALT,
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
