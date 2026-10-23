// "Tell Bun" on Quick add (premium plan A3): a sentence or a slip becomes a
// draft that fills the sheet exactly as if the person had typed it. Pure.
//
// - A draft never saves itself: it fills the fields, and the person checks
//   and presses Save, through the same commands and the same outbox.
// - Offline, or with Bun's AI help off, the phone's own rules answer
//   (draftFromQuickText, shared with the server).
// - Anything Bun could not tell stays as it was and is named in hedged words,
//   never guessed silently.
import { draftFromQuickText } from '@gogospend/contracts';
import type { AiDraft, AiDraftFlag, CategoryDto, QuickTextContext, WalletSnapshot } from '@gogospend/contracts';

import type { EntryFields } from '../redesign/quickAddModel.ts';
import type { Translate } from '../redesign/shared.ts';

export type TellBunContext = {
  today: string;
  wallets: readonly Pick<WalletSnapshot, 'id' | 'archived'>[];
  categories: readonly Pick<CategoryDto, 'id' | 'type' | 'builtin_key' | 'archived'>[];
};

/** The phone's own answer to a sentence: zero or one draft. */
export function localDrafts(text: string, ctx: TellBunContext): AiDraft[] {
  const draft = draftFromQuickText(text, ctx as QuickTextContext);
  return draft ? [draft] : [];
}

export type AppliedDraft = {
  fields: EntryFields;
  /** The amount for the keypad, or null to leave the keypad as it is. */
  amountMinor: string | null;
};

/**
 * The sheet's fields with a draft laid over them. A field the draft leaves
 * empty keeps what the person already had; the record and command ids are
 * the sheet's own and never change.
 */
export function applyDraft(fields: EntryFields, draft: AiDraft): AppliedDraft {
  const categoryByType = { ...fields.categoryByType };
  if (draft.category_id) categoryByType[draft.type] = draft.category_id;
  return {
    fields: {
      ...fields,
      type: draft.type,
      categoryByType,
      walletId: draft.wallet_id ?? fields.walletId,
      occurredOn: draft.occurred_on ?? fields.occurredOn,
      merchant: draft.merchant ?? fields.merchant,
      note: draft.note ?? fields.note,
    },
    amountMinor: draft.amount_minor,
  };
}

const HINTS: Readonly<Record<AiDraftFlag, string>> = {
  amount_unclear: "Bun couldn't read the amount. Type it in.",
  multiple_amounts: 'Bun saw more than one amount and used the last one.',
  date_guessed: 'Bun used today. Change the day if it was another one.',
  category_guessed: "Bun wasn't sure of the category. Pick one.",
  wallet_guessed: 'Choose which wallet paid.',
  not_money: "This doesn't look like money. Check the amount.",
};

/** What the person should check, in hedged words, most important first. */
export function draftHints(draft: AiDraft, tc: Translate): string[] {
  return draft.flags.map((flag) => tc(HINTS[flag]));
}

/** "Bun found 2 entries. The first one is ready; save it, then tell Bun the next." */
export function moreDraftsLine(count: number, tc: Translate): string | null {
  return count > 1 ? tc('Bun found {count} entries. The first one is ready; save it, then tell Bun the next.', { count }) : null;
}
