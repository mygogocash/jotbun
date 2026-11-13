"""Writes real/AddTrayHost.tsx from orig/ by exact substitutions (each old text must occur once)."""
import sys

K = '/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p3-t13-planner'
REL = 'apps/app/src/wallet/add/AddTrayHost.tsx'
src = open(f'{K}/orig/{REL}', encoding='utf-8').read()

EDITS = [
    # The header: applyAiDraft and the save.
    ("""// - Saving is useEntrySave's save with the track (W27): Tell Bun's source while
//   any of its guesses stand, the category's analytics key and when the tray
//   opened. This file sends no record_saved (R61: 1D-T7's call in finish reads
//   the track). While a save is in flight nothing closes the tray (Review
""",
     """// - applyAiDraft (P3-T13; P3-T17's slip read and P3-T18's tell step call it):
//   an AI draft fills the entry as the sheet's does, its rows Bun's guesses,
//   and the record says the meta's source. Its review (P3-T5) is sent once:
//   kept, or edited with the fields changed, when the entry is saved; dropped
//   when the tray closes unsaved or a new draft takes its place (the sheet's
//   too). While a save is on its way or its outcome is unknown the entry takes
//   no draft, so a review is always of the draft that was saved. The sheet's
//   draft says tell_bun, with no review: the sheet does not say which model
//   read the sentence.
// - Saving is useEntrySave's save with the entry's origin (P3-T13, H9), the
//   record's source, and the track (W27): that source, the category's
//   analytics key, when the tray opened, and no photo until P3-T15 attaches
//   one. This file sends no record_saved (R61: 1D-T7's call in finish reads
//   the track). While a save is in flight nothing closes the tray (Review
"""),
    # Imports.
    ("""import { trackRecordStarted } from '@mobile/analytics/events';
""",
     """import { trackRecordStarted } from '@mobile/analytics/events';
import type { AiModelName } from '@mobile/analytics/events';
"""),
    ("""import { oftenLogged } from '@mobile/spend/v1/ai/oftenLogged';
import { applyDraft } from '@mobile/spend/v1/ai/tellBun';
""",
     """import { savedOutcome } from '@mobile/spend/v1/ai/draftReview';
import { oftenLogged } from '@mobile/spend/v1/ai/oftenLogged';
import { applyDraft } from '@mobile/spend/v1/ai/tellBun';
import { useDraftReview } from '@mobile/spend/v1/ai/useDraftReview';
"""),
    ("""import { EMPTY_KEYPAD } from '@mobile/ui/keypadExpression';
""",
     """import { EMPTY_KEYPAD, settleForSave } from '@mobile/ui/keypadExpression';
"""),
    ("""import { ConfirmStep, confirmTitle } from './ConfirmStep';
import { COPY } from './copy';
""",
     """import { ConfirmStep, confirmTitle } from './ConfirmStep';
import { COPY } from './copy';
import { draftFieldsOf, TYPED_ORIGIN } from './draftOrigin';
import type { DraftOrigin } from './draftOrigin';
"""),
    # The types.
    ("""export type AddRequest = { type?: AddType; walletId?: string; copyOf?: string };
export type SavedContext = { lookups: Lookups; offline: boolean };
export type AddTray = { open(request?: AddRequest): void; close(): void; isOpen: boolean; blocked: boolean; whenClosed(run: () => void): void };
""",
     """export type AddRequest = { type?: AddType; walletId?: string; copyOf?: string };
export type SavedContext = { lookups: Lookups; offline: boolean };
/** An AI draft's own word on itself (P3-T13): the source its record gets, the model whose draft it is, and whether Opus answered. */
export type AiDraftMeta = { source: 'tell_bun' | 'photo'; model: AiModelName; escalated: boolean };
export type AddTray = {
  open(request?: AddRequest): void;
  close(): void;
  isOpen: boolean;
  blocked: boolean;
  whenClosed(run: () => void): void;
  applyAiDraft(draft: AiDraft, meta: AiDraftMeta): void;
};
"""),
    ("""type Entry = { key: number; request: AddRequest; openedAt: number };
type Ready = Extract<EntryReferences, { state: 'ready' }>;
""",
     """type Entry = { key: number; request: AddRequest; openedAt: number };
type Ready = Extract<EntryReferences, { state: 'ready' }>;
type ApplyAi = (draft: AiDraft, meta: AiDraftMeta) => void;
"""),
    ("""const NO_CATEGORIES: readonly CategoryDto[] = [];
""",
     """const NO_CATEGORIES: readonly CategoryDto[] = [];
/** A draft from P2's Tell Bun sheet: tell_bun, and nothing to review. */
const SHEET_ORIGIN: DraftOrigin = { source: 'tell_bun', review: null };
"""),
    # Outside a host.
    ("""    whenClosed: (run) => run(),
  }), [router]);
""",
     """    whenClosed: (run) => run(),
    applyAiDraft: () => undefined,
  }), [router]);
"""),
    # The host.
    ("""  const queue = useRef<(() => void)[]>([]);
  const keys = useRef(0);
""",
     """  const queue = useRef<(() => void)[]>([]);
  const keys = useRef(0);
  // The open entry's applyAiDraft, as it last drew; null while no entry is mounted.
  const applier = useRef<ApplyAi | null>(null);
  const register = useCallback((apply: ApplyAi | null) => {
    applier.current = apply;
  }, []);
"""),
    ("""    return { open, close, whenClosed, isOpen: visible, blocked };
  }, [visible, blocked]);
""",
     """    const applyAiDraft = (draft: AiDraft, meta: AiDraftMeta) => applier.current?.(draft, meta);
    return { open, close, whenClosed, applyAiDraft, isOpen: visible, blocked };
  }, [visible, blocked]);
"""),
    ("""          onSaving={saving}
          onSaved={(saved, context) => {
""",
     """          onSaving={saving}
          onApplier={register}
          onSaved={(saved, context) => {
"""),
    # The entry.
    ("""  return Object.entries(filled).filter(([, value]) => Boolean(value)).map(([key]) => key);
}

function AddEntry({ entry, visible, onClose, onClosed, onSaving, onSaved }: {
  entry: Entry;
  visible: boolean;
  onClose(): void;
  onClosed(gone: Entry): void;
  onSaving(inFlight: boolean): void;
  onSaved(saved: SavedEntry, context: SavedContext): void;
}) {
""",
     """  return Object.entries(filled).filter(([, value]) => Boolean(value)).map(([key]) => key);
}

/** The amount a keypad holds as Save would settle it, or null while it holds none. */
function settledMinor(keypad: KeypadState): string | null {
  const settled = settleForSave(keypad);
  return settled.outcome.ok ? settled.outcome.minor : null;
}

function AddEntry({ entry, visible, onClose, onClosed, onSaving, onApplier, onSaved }: {
  entry: Entry;
  visible: boolean;
  onClose(): void;
  onClosed(gone: Entry): void;
  onSaving(inFlight: boolean): void;
  onApplier(apply: ApplyAi | null): void;
  onSaved(saved: SavedEntry, context: SavedContext): void;
}) {
"""),
    ("""  const [bunMerchant, setBunMerchant] = useState<string | null>(null);
""",
     """  const [bunMerchant, setBunMerchant] = useState<string | null>(null);
  // How the entry was made (P3-T13): its record's source, and an AI draft's review until the entry is saved or goes unsaved.
  const origin = useRef<DraftOrigin>(TYPED_ORIGIN);
  const review = useDraftReview();
"""),
    ("""  const entrySave = useEntrySave({
    today,
    savedHaptic: 'success',
    onSaved: (saved) => onSaved(saved, { lookups, offline: saved.via === 'device' && diaryView.outcome?.status !== 'synced' }),
  });
""",
     """  const entrySave = useEntrySave({
    today,
    savedHaptic: 'success',
    onSaved: (saved) => {
      // A saved AI draft is reviewed once, against the entry as the draft filled it: kept, or edited with its count.
      const pending = origin.current.review;
      if (pending !== null) {
        origin.current = { ...origin.current, review: null };
        review({ ...savedOutcome(pending.original, draftFieldsOf(saved.draft, saved.draft.amountMinor)), model: pending.model, escalated: pending.escalated });
      }
      onSaved(saved, { lookups, offline: saved.via === 'device' && diaryView.outcome?.status !== 'synced' });
    },
  });
"""),
    ("""  useEffect(() => {
    if (visible) return undefined;
    const timer = setTimeout(leave, CLOSED_BOUND_MS);
    return () => clearTimeout(timer);
  }, [visible, leave]);
""",
     """  useEffect(() => {
    if (visible) return undefined;
    const timer = setTimeout(leave, CLOSED_BOUND_MS);
    return () => clearTimeout(timer);
  }, [visible, leave]);
  /** An AI draft the entry lets go of unsaved (the tray closed, or a new draft took its place) is reviewed dropped, once. */
  const dropUnsaved = useCallback(() => {
    const pending = origin.current.review;
    if (pending === null) return;
    origin.current = { ...origin.current, review: null };
    review({ outcome: 'dropped', fieldsEdited: 0, model: pending.model, escalated: pending.escalated });
  }, [review]);
  // The tray closes (close, the backdrop, escape, a swipe or a conflict's Done): an AI draft still unsaved was dropped.
  // A landed save has reviewed its draft already, before the host hides the tray.
  useEffect(() => {
    if (!visible) dropUnsaved();
  }, [visible, dropUnsaved]);
"""),
    ("""  /** A draft laid over the entry (applyDraft): a quick chip's, or Bun's, whose rows become its guesses. The amount is a fill (R106). */
  const fill = (filled: AiDraft, bun: boolean) => {
    if (current === null) return;
    const applied = applyDraft(current, filled);
    edit({ ...current, ...applied.fields });
    if (bun) {
      setGuessed((now) => new Set([...now, ...guessedBy(filled)]));
      // A draft that names no place keeps the one Bun named before, as applyDraft does.
      setBunMerchant((was) => filled.merchant ?? was);
    }
    if (applied.amountMinor !== null) setKeypad(filledKeypad(applied.amountMinor));
  };
""",
     """  /**
   * A draft laid over the entry (applyDraft): a quick chip's, or Bun's, whose rows become its guesses. The amount is a
   * fill (R106). What the entry then shows comes back: its draft, and the amount Save would settle on.
   */
  const fill = (filled: AiDraft, bun: boolean): { draft: QuickAddDraft; amountMinor: string | null } | null => {
    if (current === null) return null;
    const applied = applyDraft(current, filled);
    const next = { ...current, ...applied.fields };
    edit(next);
    if (bun) {
      setGuessed((now) => new Set([...now, ...guessedBy(filled)]));
      // A draft that names no place keeps the one Bun named before, as applyDraft does.
      setBunMerchant((was) => filled.merchant ?? was);
    }
    if (applied.amountMinor !== null) setKeypad(filledKeypad(applied.amountMinor));
    return { draft: next, amountMinor: applied.amountMinor ?? settledMinor(keypad) };
  };
  /** P2's Tell Bun sheet: its draft fills the entry, and the record says tell_bun, with no review. */
  const fromSheet = (filled: AiDraft) => {
    dropUnsaved();
    fill(filled, true);
    origin.current = SHEET_ORIGIN;
  };
  /** applyAiDraft: an AI draft fills the entry and gives its origin; none while a save is on its way or its outcome unknown. */
  const applyAi: ApplyAi = (filled, meta) => {
    if (locked) return;
    dropUnsaved();
    const shown = fill(filled, true);
    if (shown === null) return;
    origin.current = { source: meta.source, review: { original: draftFieldsOf(shown.draft, shown.amountMinor), model: meta.model, escalated: meta.escalated } };
  };
"""),
    ("""  const save = () => {
    if (current === null) return;
    const categoryId = current.type === 'transfer' ? null : current.categoryByType[current.type];
    const category = categories.find((each) => each.id === categoryId) ?? null;
    void entrySave.save({
      draft: current,
      keypad,
      wallets,
      track: { source: guessed.size > 0 ? 'tell_bun' : 'typed', categoryKey: analyticsCategoryKey(category), openedAt: entry.openedAt },
    });
  };
""",
     """  const save = () => {
    if (current === null) return;
    const categoryId = current.type === 'transfer' ? null : current.categoryByType[current.type];
    const category = categories.find((each) => each.id === categoryId) ?? null;
    const { source } = origin.current;
    void entrySave.save({
      draft: current,
      keypad,
      wallets,
      source,
      track: { source, categoryKey: analyticsCategoryKey(category), openedAt: entry.openedAt, hasPhoto: false },
    });
  };
  // The host's applyAiDraft reaches this entry's rule as it last drew; an entry that has gone takes none.
  useEffect(() => {
    onApplier(applyAi);
    return () => onApplier(null);
  });
"""),
    ("""      onUse={(bunDraft) => fill(bunDraft, true)}
""",
     """      onUse={fromSheet}
"""),
]

for old, new in EDITS:
    count = src.count(old)
    if count != 1:
        sys.exit(f'{count} matches for {old[:80]!r}')
    src = src.replace(old, new)
open(f'{K}/real/{REL}', 'w', encoding='utf-8').write(src)
print('real AddTrayHost.tsx written')
