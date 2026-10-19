// P3: a durable import review draft (`ImportDraftStore`). Since decision 7
// (19 October 2026) it lives inside the account's encrypted diary (SQLCipher,
// the `import_drafts` rows of migration 2): `spendDiary.importDraftStore()`
// hands out `createDiaryDraftStore` over the open diary. This module is pure:
// it only needs the key-value port below, so node tests run it against an
// in-memory map or a test diary. `memoryDraftStore` (importReview.ts) keeps a
// draft for one visit when no diary is open (web, locked, opening).
//
// Keying: one draft per account (`gogospend.import-draft.v1.<account id>`).
// The store port is single-slot and a journey exists before it has a job
// (`pendingUpload`), so the job id cannot be part of the key; the stored
// envelope records it instead, next to the account id, and a draft whose
// envelope names another account is never returned.
//
// What is erased, and when:
//   - `clear()`: the journey finished (every outcome known) or the user
//     discarded it (`confirmBatches` and `discardImport` call it);
//   - the diary's own erase (explicit sign-out, or a locked diary's discard)
//     deletes the diary file and the draft with it; an ordinary sign-out keeps
//     both;
//   - `eraseImportDrafts(storage, accountId)` / `eraseImportDrafts(storage)`:
//     one account's draft, or every account's, on any port.
//
// Builds before decision 7 kept the draft in plain AsyncStorage under the same
// key. deviceImportDraftStore.ts binds that storage only to erase such a
// leftover: before the diary draft's first use, and at the sign-out erase.
import { isUuid } from '@gogospend/contracts';

import type { DiaryStore } from '../../storage/diaryRepository.ts';
import type { ImportDraftStore, ImportJourney, ImportStage } from './importReview.ts';

/** A key-value store with AsyncStorage's shape: the diary's draft rows, or a test map. */
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
export async function eraseImportDrafts(storage: Pick<DraftStorage, 'removeItem' | 'getAllKeys'>, accountId?: string): Promise<void> {
  if (accountId !== undefined) {
    assertAccount(accountId);
    await storage.removeItem(keyFor(accountId));
    return;
  }
  const keys = (await storage.getAllKeys()).filter((key) => key.startsWith(IMPORT_DRAFT_KEY_PREFIX));
  for (const key of keys) await storage.removeItem(key);
}

/** What the diary store offers for drafts: its own account, and its draft rows. */
export type DiaryDraftRows = Pick<DiaryStore, 'accountId' | 'readImportDraft' | 'writeImportDraft' | 'removeImportDraft' | 'importDraftKeys'>;

/** The diary's draft rows as the storage port. A locked or superseded diary rejects, like its other reads and writes. */
export function diaryDraftStorage(diary: DiaryDraftRows): DraftStorage {
  return {
    getItem: (key) => diary.readImportDraft(key),
    setItem: (key, value) => diary.writeImportDraft(key, value),
    removeItem: (key) => diary.removeImportDraft(key),
    getAllKeys: () => diary.importDraftKeys(),
  };
}

/**
 * The diary account's draft, inside its open diary. Before its first use it
 * calls `eraseLegacy` for the account: a plain-text draft an older build left
 * in AsyncStorage is removed, not carried over. A removal that fails never
 * blocks the draft and is tried again on the next use.
 */
export function createDiaryDraftStore(diary: DiaryDraftRows, eraseLegacy?: (accountId: string) => Promise<void>): ImportDraftStore {
  const store = createStorageDraftStore(diaryDraftStorage(diary), diary.accountId);
  let legacyGone = false;
  const sweep = async () => {
    if (legacyGone || !eraseLegacy) return;
    try {
      await eraseLegacy(diary.accountId);
      legacyGone = true;
    } catch {
      // Tried again on the next use.
    }
  };
  return {
    load: async () => {
      await sweep();
      return store.load();
    },
    save: async (journey) => {
      await sweep();
      await store.save(journey);
    },
    clear: async () => {
      await sweep();
      await store.clear();
    },
  };
}
