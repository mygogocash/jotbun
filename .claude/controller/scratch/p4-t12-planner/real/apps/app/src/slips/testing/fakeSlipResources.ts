// A fake slip server for tests (P4-T12). It answers in the contract's shapes,
// keeps the drafts and slip accounts it is given and refuses as the vault
// does (P4-T3, P4-T7): confirm and dismiss take drafts out, a confirm naming
// a draft that is gone is 409 VERSION_CONFLICT with nothing taken out, a
// dismiss of one is 404, and an account update needs the account's version
// (409 with the account as it is) and a known id (404). It records each call
// with what it carried: the request for read,
// recordRef and registerDevice; `{ cursor, limit }` (null when not given) for
// drafts; `{ drafts, commandId }` for confirm; `{ draftId, commandId }` for
// dismiss; `{ id, version, walletId }` for updateAccount; nothing for the
// reads without arguments. With `slipImportOn: false` the calls behind
// SLIP_IMPORT_ENABLED are 404 NOT_FOUND, as the server answers until slip
// import opens (S13); the salt, slip refs, bank albums and devices still
// answer. A slip without a scripted read comes back `unreadable`.
// Pure, so Node and render tests both load it. Test use only.
import { SLIP_INBOX_ID, SLIP_LIMITS } from '@gogospend/contracts';
import type { BankAlbumDto, CommandAck, SlipAccountDto, SlipBatchItem, SlipDraftDto, SlipResult, SlipSaltDto } from '@gogospend/contracts';

import { V1Error } from '../../api/client.ts';
import type { SlipResources } from '../slipResources.ts';

export type FakeSlipCall = { method: keyof SlipResources; body?: unknown };

/** The fake's salt: the bytes 1 to 32, base64url without padding. */
export const FAKE_SLIP_SALT: SlipSaltDto = { salt: 'AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA' };

/** The calls the server answers 404 until slip import opens (S13). */
const RELEASED: ReadonlySet<keyof SlipResources> = new Set<keyof SlipResources>(['read', 'drafts', 'confirm', 'dismiss', 'accounts', 'updateAccount']);

/** The server's page when no limit is asked for (P4-T7). */
const DRAFTS_PAGE = 50;

export function fakeSlipResources(options: {
  read?: (item: SlipBatchItem, index: number) => SlipResult;
  drafts?: SlipDraftDto[];
  accounts?: SlipAccountDto[];
  albums?: BankAlbumDto[];
  slipImportOn?: boolean;
} = {}): SlipResources & { calls: FakeSlipCall[] } {
  const calls: FakeSlipCall[] = [];
  let drafts = [...(options.drafts ?? [])];
  let accounts = [...(options.accounts ?? [])];
  let revision = 0;
  const receive = (method: keyof SlipResources, body?: unknown) => {
    calls.push(body === undefined ? { method } : { method, body });
    if (options.slipImportOn === false && RELEASED.has(method)) throw new V1Error('not_found', 404, 'NOT_FOUND');
  };
  const inboxAck = (commandId: string, outcome: CommandAck['outcome']): CommandAck => {
    revision += 1;
    return { command_id: commandId, entity_id: SLIP_INBOX_ID, version: revision, committed_revision: String(revision), outcome, entity_state: 'active' };
  };
  return {
    calls,
    async salt() {
      receive('salt');
      return FAKE_SLIP_SALT;
    },
    async read(request) {
      receive('read', request);
      const results = request.slips.map((item, index): SlipResult => options.read?.(item, index) ?? { ref_hash: item.ref_hash, outcome: 'unreadable', draft: null });
      return { results, uses_left: { live: SLIP_LIMITS.liveDaily, backfill: SLIP_LIMITS.backfillUses }, retry_after_seconds: null };
    },
    async drafts(cursor, limit) {
      receive('drafts', { cursor: cursor ?? null, limit: limit ?? null });
      const start = cursor === undefined ? 0 : Number(cursor);
      const end = start + (limit ?? DRAFTS_PAGE);
      return { drafts: drafts.slice(start, end), total: drafts.length, next_cursor: end < drafts.length ? String(end) : null };
    },
    async confirm(items, commandId) {
      receive('confirm', { drafts: items, commandId });
      if (!items.every((item) => drafts.some((draft) => draft.id === item.draft_id))) throw new V1Error('conflict', 409, 'VERSION_CONFLICT');
      drafts = drafts.filter((draft) => !items.some((item) => item.draft_id === draft.id));
      return inboxAck(commandId, 'accepted');
    },
    async dismiss(draftId, commandId) {
      receive('dismiss', { draftId, commandId });
      if (!drafts.some((draft) => draft.id === draftId)) throw new V1Error('not_found', 404, 'NOT_FOUND');
      drafts = drafts.filter((draft) => draft.id !== draftId);
      return inboxAck(commandId, 'updated');
    },
    async accounts() {
      receive('accounts');
      return accounts.map((account) => ({ ...account }));
    },
    async updateAccount(id, version, walletId) {
      receive('updateAccount', { id, version, walletId });
      const current = accounts.find((account) => account.id === id);
      if (!current) throw new V1Error('not_found', 404, 'NOT_FOUND');
      if (current.version !== version) throw new V1Error('conflict', 409, 'VERSION_CONFLICT', { current: { ...current } });
      const updated = { ...current, version: version + 1, wallet_id: walletId };
      accounts = accounts.map((account) => (account.id === id ? updated : account));
      return { ...updated };
    },
    async recordRef(request) {
      receive('recordRef', request);
    },
    async bankAlbums() {
      receive('bankAlbums');
      return [...(options.albums ?? [])];
    },
    async registerDevice(registration) {
      receive('registerDevice', registration);
    },
  };
}
