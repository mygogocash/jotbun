"""Writes stubs/AddTrayHost.tsx from orig/: the plan's interface (AiDraftMeta, applyAiDraft on useAddTray) with the
plan's stub behaviour: applyAiDraft fills through applyDraft only (no guesses, no origin), and the save keeps P2's
source rule (tell_bun while a guess stands). Each old text must occur once."""
import sys

K = '/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p3-t13-planner'
REL = 'apps/app/src/wallet/add/AddTrayHost.tsx'
src = open(f'{K}/orig/{REL}', encoding='utf-8').read()

EDITS = [
    ("""import { trackRecordStarted } from '@mobile/analytics/events';
""",
     """import { trackRecordStarted } from '@mobile/analytics/events';
import type { AiModelName } from '@mobile/analytics/events';
"""),
    ("""export type AddTray = { open(request?: AddRequest): void; close(): void; isOpen: boolean; blocked: boolean; whenClosed(run: () => void): void };
""",
     """/** An AI draft's own word on itself (P3-T13): the source its record gets, the model whose draft it is, and whether Opus answered. */
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
    ("""type Ready = Extract<EntryReferences, { state: 'ready' }>;
""",
     """type Ready = Extract<EntryReferences, { state: 'ready' }>;
type ApplyAi = (draft: AiDraft, meta: AiDraftMeta) => void;
"""),
    ("""    whenClosed: (run) => run(),
  }), [router]);
""",
     """    whenClosed: (run) => run(),
    applyAiDraft: () => undefined,
  }), [router]);
"""),
    ("""  const queue = useRef<(() => void)[]>([]);
  const keys = useRef(0);
""",
     """  const queue = useRef<(() => void)[]>([]);
  const keys = useRef(0);
  const applier = useRef<ApplyAi | null>(null);
  const register = useCallback((apply: ApplyAi | null) => {
    applier.current = apply;
  }, []);
"""),
    ("""    return { open, close, whenClosed, isOpen: visible, blocked };
""",
     """    const applyAiDraft = (draft: AiDraft, meta: AiDraftMeta) => applier.current?.(draft, meta);
    return { open, close, whenClosed, applyAiDraft, isOpen: visible, blocked };
"""),
    ("""          onSaving={saving}
          onSaved={(saved, context) => {
""",
     """          onSaving={saving}
          onApplier={register}
          onSaved={(saved, context) => {
"""),
    ("""function AddEntry({ entry, visible, onClose, onClosed, onSaving, onSaved }: {
  entry: Entry;
  visible: boolean;
  onClose(): void;
  onClosed(gone: Entry): void;
  onSaving(inFlight: boolean): void;
  onSaved(saved: SavedEntry, context: SavedContext): void;
}) {
""",
     """function AddEntry({ entry, visible, onClose, onClosed, onSaving, onApplier, onSaved }: {
  entry: Entry;
  visible: boolean;
  onClose(): void;
  onClosed(gone: Entry): void;
  onSaving(inFlight: boolean): void;
  onApplier(apply: ApplyAi | null): void;
  onSaved(saved: SavedEntry, context: SavedContext): void;
}) {
"""),
    ("""      track: { source: guessed.size > 0 ? 'tell_bun' : 'typed', categoryKey: analyticsCategoryKey(category), openedAt: entry.openedAt },
    });
  };
""",
     """      track: { source: guessed.size > 0 ? 'tell_bun' : 'typed', categoryKey: analyticsCategoryKey(category), openedAt: entry.openedAt },
    });
  };
  // RED stub (P3-T13): applyAiDraft fills through applyDraft only, and the save keeps P2's source rule.
  const applyAi: ApplyAi = (filled) => fill(filled, false);
  useEffect(() => {
    onApplier(applyAi);
    return () => onApplier(null);
  });
"""),
]

for old, new in EDITS:
    count = src.count(old)
    if count != 1:
        sys.exit(f'{count} matches for {old[:80]!r}')
    src = src.replace(old, new)
open(f'{K}/stubs/{REL}', 'w', encoding='utf-8').write(src)
print('stub AddTrayHost.tsx written')
