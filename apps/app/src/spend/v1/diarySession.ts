// Which account's diary the device should open: the account the server
// names for the current binding (GET /v1/me). When the server can't be
// reached, the account it verified earlier for exactly this binding is used,
// so drafts can still be saved offline; a refusal recalls nothing, and a new
// binding (a new identity, even with the same email) never inherits another's
// account. A token refresh for the same identity asks nothing again, a late
// answer from an earlier refresh is ignored, and nothing reopens after unmount.
import { V1Error } from '../../api/client.ts';
import type { KnownAccount } from './knownAccount.ts';
import type { DiarySession } from './spendDiary.ts';

export type DiarySessionDeps = {
  snapshot(): { binding: string | null; epoch: number };
  fetchAccountId(): Promise<string>;
  known: KnownAccount;
  /** Tells the diary the session may have changed. */
  sessionChanged(): Promise<void>;
};

export interface DiarySessionResolver {
  current(): DiarySession;
  refresh(): Promise<void>;
  /** Unmount: nothing reopens afterwards. */
  dispose(): void;
}

// Outcomes that mean "the server could not answer", not "the server said no".
const UNREACHABLE = new Set(['network', 'unavailable', 'invalid_response', 'rate_limited']);

export function createDiarySessionResolver(deps: DiarySessionDeps): DiarySessionResolver {
  let session: DiarySession = { accountId: null, epoch: deps.snapshot().epoch };
  // The binding and epoch whose account the server itself confirmed.
  let verified: { binding: string; epoch: number } | null = null;
  let sequence = 0;
  let disposed = false;

  return {
    current: () => session,
    async refresh() {
      if (disposed) return;
      const mine = ++sequence;
      const { binding, epoch } = deps.snapshot();
      if (binding && verified?.binding === binding && verified.epoch === epoch) {
        await deps.sessionChanged();
        return;
      }
      let accountId: string | null = null;
      let confirmed = false;
      if (binding) {
        try {
          accountId = await deps.fetchAccountId();
          confirmed = true;
          await deps.known.remember(binding, accountId).catch(() => undefined);
        } catch (error) {
          accountId = error instanceof V1Error && UNREACHABLE.has(error.outcome) ? await deps.known.recall(binding).catch(() => null) : null;
        }
      }
      if (disposed || mine !== sequence || deps.snapshot().epoch !== epoch) return;
      session = { accountId, epoch };
      verified = binding && confirmed ? { binding, epoch } : null;
      await deps.sessionChanged();
    },
    dispose() {
      disposed = true;
    },
  };
}
