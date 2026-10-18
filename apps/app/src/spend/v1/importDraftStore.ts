// P3: a durable import review draft (`ImportDraftStore`) on the device's
// key-value storage, the same AsyncStorage pattern as the daily reminder
// (notifications/localReminders.ts). This module is pure: it only needs the
// storage port below, so node tests run it against an in-memory map and a
// "restart" is a second store over the same map. deviceImportDraftStore.ts
// binds it to AsyncStorage. `memoryDraftStore` (importReview.ts) stays the
// test double.
//
// Keying: one draft per account (`gogospend.import-draft.v1.<account id>`).
// The store port is single-slot and a journey exists before it has a job
// (`pendingUpload`), so the job id cannot be part of the key; the stored
// envelope records it instead, next to the account id, and a draft whose
// envelope names another account is never returned. Another account on the
// same device therefore never sees this draft.
//
// What is erased, and when:
//   - `clear()`: the journey finished (every outcome known) or the user
//     discarded it (`confirmBatches` and `discardImport` call it);
//   - `eraseImportDrafts(storage, accountId)`: the explicit sign-out erase
//     (spendDiary `eraseForSignOut`); an ordinary sign-out keeps the draft
//     with the account's diary drafts, like them;
//   - `eraseImportDrafts(storage)`: every account's draft (device reset).
//
// NOT ENCRYPTED: AsyncStorage is plain storage, unlike the SQLCipher diary.
// A draft holds the preview's rows (amounts, merchants, notes) and the user's
// corrections. Before the review screen is routed (E2), the owner must accept
// that, or S2's iOS backup exclusion (a native step; see docs) must cover the
// AsyncStorage directory, or the draft moves into the encrypted diary.
import { isUuid } from '@gogospend/contracts';

import type { ImportDraftStore, ImportJourney, ImportStage } from './importReview.ts';

/** The subset of AsyncStorage this module needs. */
export type DraftStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
  getAllKeys(): Promise<readonly string[]>;
};

export const IMPORT_DRAFT_KEY_PREFIX = 'gogospend.import-draft.v1.';
const ENVELOPE_VERSION = 1;

type Envelope = { version: typeof ENVELOPE_VERSION; account_id: string; job_id: string | null; journey: ImportJourney };

const STAGES = { idle: true, uploading: true, parsing: true, review: true, confirming: true, done: true, failed: true, expired: true } as const satisfies Record<ImportStage, true>;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isStringList = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');
const isPending = (value: unknown): boolean => value === null || (isRecord(value) && typeof value.key === 'string' && isRecord(value.body));

/** A structural check of what a draft needs to resume; a draft that fails it is unreadable, not repaired. */
function isStoredJourney(value: unknown): value is ImportJourney {
  if (!isRecord(value)) return false;
  const mapping = value.mapping;
  return (
    typeof value.stage === 'string' && Object.prototype.hasOwnProperty.call(STAGES, value.stage) &&
    (value.jobId === null || typeof value.jobId === 'string') &&
    isStringList(value.selected) && isStringList(value.committed) && isStringList(value.conflicted) && isStringList(value.remaining) &&
    isRecord(value.reviewed) && isRecord(value.edits) &&
    isRecord(mapping) && isRecord(mapping.wallets) && isRecord(mapping.categories) &&
    isPending(value.pendingUpload) && isPending(value.pendingPatch) && isPending(value.pendingFreeze) && isPending(value.pendingBatch) &&
    (value.selection === null || (isRecord(value.selection) && typeof value.selection.id === 'string')) &&
    typeof value.batchSize === 'number' && typeof value.keepReceipt === 'boolean'
  );
}

function assertAccount(accountId: string): void {
  if (!isUuid(accountId)) throw new RangeError('An import draft belongs to an account id.');
}

const keyFor = (accountId: string) => `${IMPORT_DRAFT_KEY_PREFIX}${accountId}`;

/** The account's draft on `storage`. Saves reject when the device cannot store; a read that cannot be trusted is no draft. */
export function createStorageDraftStore(storage: DraftStorage, accountId: string): ImportDraftStore {
  assertAccount(accountId);
  const key = keyFor(accountId);
  return {
    async load() {
      const raw = await storage.getItem(key);
      if (raw === null) return null;
      let envelope: unknown;
      try {
        envelope = JSON.parse(raw);
      } catch {
        await storage.removeItem(key);
        return null;
      }
      // A draft written by a newer app is left for it (a downgrade never deletes it).
      if (isRecord(envelope) && typeof envelope.version === 'number' && envelope.version > ENVELOPE_VERSION) return null;
      if (!isRecord(envelope) || envelope.version !== ENVELOPE_VERSION || envelope.account_id !== accountId || !isStoredJourney(envelope.journey)) {
        // Unreadable, or naming another account: never resumed as this account's review.
        await storage.removeItem(key);
        return null;
      }
      return envelope.journey;
    },
    async save(journey) {
      const envelope: Envelope = { version: ENVELOPE_VERSION, account_id: accountId, job_id: journey.jobId, journey };
      await storage.setItem(key, JSON.stringify(envelope));
    },
    clear: async () => {
      await storage.removeItem(key);
    },
  };
}

/** Removes the account's draft, or with no account every account's (sign-out erase, device reset). */
export async function eraseImportDrafts(storage: DraftStorage, accountId?: string): Promise<void> {
  if (accountId !== undefined) {
    assertAccount(accountId);
    await storage.removeItem(keyFor(accountId));
    return;
  }
  const keys = (await storage.getAllKeys()).filter((key) => key.startsWith(IMPORT_DRAFT_KEY_PREFIX));
  for (const key of keys) await storage.removeItem(key);
}
