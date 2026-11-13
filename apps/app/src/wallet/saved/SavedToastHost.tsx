// The saved moment's toast and its host (P2-T17; bw-saved, dk-saved,
// rh-offline, W31, R61, R65, R114, Review Focus 2 and 4). WalletShell mounts the
// host once, around the add tray's host, and shows a notice from the tray's
// onSaved (P2-T18). onSaved runs before the tray closes (P2-T16), so show() only
// keeps the notice: it never throws, opens no Modal, and draws over the screen
// in the host's own box, which the shell lays over the whole window.
//
// - Each notice shows one toast, in place of any before it, and its chip drops
//   into the card (SaveFlight). Kept on this phone while the diary's last sync
//   did not end synced, the toast says rh-offline's words at once and reads
//   nothing. Otherwise it reads one page of today's expenses and appears when
//   the read lands or after TOTAL_WAIT_MS, whichever comes first: บันทึกแล้ว
//   while the total is unknown (still reading, a failed read, or a day with
//   more expenses than one page holds), then today's money out (todayOutMinor,
//   with the outbox as it was when the read landed, so a shown figure never
//   moves).
// - Private mode masks the amount and says it is hidden; the toast quotes
//   nothing the person typed (R65, R114).
// - The check is neutral (§5.3): an onToast circle with a toast-coloured tick.
// - Undo (TextLink in toastLink, 44 pt) shows while undoPlan allows it, from the
//   diary as it is now; a save kept on this phone offers none while no diary is
//   open, since its outbox is unknown then. It is the rule (R61): it removes the
//   draft, or deletes the record at version 1 under its own command key, then
//   says so and sends one undo_used. A delete Jotbun refuses as changed
//   elsewhere changes nothing and says so (saved.undoConflict); one already
//   gone says so; an unconfirmed one keeps its key and Undo, so a second tap
//   resends the same command; any other refusal says today's words. A removal
//   the diary refuses (the draft was sent meanwhile) says so, and Undo follows
//   the diary again.
// - It enters with toastEntering (the wallet's one answer, W6), is a polite
//   status that iOS also hears, and leaves TOAST_MS (motion.duration.toastLong)
//   after its words last changed, never while an Undo is on its way.
import { HISTORY_MAX_LIMIT } from '@gogospend/contracts';
import type { Minor } from '@gogospend/contracts';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { trackUndoUsed } from '@mobile/analytics/events';
import { V1Error } from '@mobile/api/client';
import { useCopy } from '@mobile/i18n/useCopy';
import { saveProblem, useCommandKeys } from '@mobile/screens/v1/parts';
import { useDiaryView, useSpendDiary } from '@mobile/spend/v1/SpendDiaryContext';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import { todayInBangkok } from '@mobile/spend/v1/viewModels';
import { Text } from '@mobile/theme/AppText';
import { motion } from '@mobile/theme/motion';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { LATIN_UI_FONT_FAMILY } from '@mobile/theme/uiFontFamily';
import { DECORATIVE, POLITE_LIVE_REGION, useAnnouncement } from '@mobile/ui/a11y';
import { COMMON_COPY } from '../common/copy';
import { useDraftCopy } from '../copy/useDraftCopy';
import { useWalletReducedMotion } from '../motion/reducedMotion';
import { toastEntering } from '../motion/useWalletMotion';
import { usePrivateMode } from '../privacy/PrivateModeProvider';
import { TextLink } from '../tray/TextLink';
import { WalletText } from '../WalletText';
import { COPY } from './copy';
import { SaveFlight } from './SaveFlight';
import { todayOutMinor, toastAmount, toastWords, undoPlan } from './savedMoment';
import type { SavedNotice, UndoPlan } from './savedMoment';

export type SavedToast = { show(notice: SavedNotice): void };

/** How long the toast waits for today's total before it appears without it. */
export const TOTAL_WAIT_MS = 600;
/** How long the toast stays after its words last changed. */
export const TOAST_MS = motion.duration.toastLong;

const LINES = { ...COMMON_COPY, ...COPY } as const;
const NONE: UndoPlan = { kind: 'none' };
const NOWHERE: SavedToast = { show: () => undefined };
/** bw-saved's lift; dk-saved draws none. */
const TOAST_SHADOW = '0 10px 24px rgba(17, 16, 20, 0.3)';

const SavedToastContext = createContext<SavedToast | null>(null);

/** The host's show; outside a host it does nothing. */
export function useSavedToast(): SavedToast {
  return useContext(SavedToastContext) ?? NOWHERE;
}

type Shown = { key: number; notice: SavedNotice };

export function SavedToastHost({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState<Shown | null>(null);
  const keys = useRef(0);
  const value = useMemo<SavedToast>(() => ({
    show: (notice) => {
      keys.current += 1;
      setShown({ key: keys.current, notice });
    },
  }), []);
  const gone = useCallback((key: number) => setShown((now) => (now?.key === key ? null : now)), []);
  return (
    <SavedToastContext.Provider value={value}>
      <View style={{ flex: 1 }}>
        {children}
        {shown === null ? null : <Toast key={`toast:${shown.key}`} id={shown.key} notice={shown.notice} onGone={gone} />}
        <SaveFlight key={`flight:${shown?.key ?? 0}`} notice={shown?.notice ?? null} />
      </View>
    </SavedToastContext.Provider>
  );
}

/** Undo's state: offered, on its way, or what it came to (and whether Undo may show again). */
type UndoState = { phase: 'ready' } | { phase: 'busy' } | { phase: 'said'; text: string; again: boolean };

function Toast({ id, notice, onGone }: { id: number; notice: SavedNotice; onGone(id: number): void }) {
  const colors = useWalletColors();
  const insets = useSafeAreaInsets();
  const reduced = useWalletReducedMotion();
  const tc = useCopy();
  const t = useDraftCopy(LINES);
  const { hidden } = usePrivateMode();
  const resources = useSpendV1();
  const diary = useSpendDiary();
  const view = useDiaryView();
  const keys = useCommandKeys();

  // The diary as the last commit left it, for the read that lands later.
  const latest = useRef(view);
  useEffect(() => {
    latest.current = view;
  });

  const [appeared, setAppeared] = useState(notice.offline);
  const [total, setTotal] = useState<Minor | null>(null);
  useEffect(() => {
    if (notice.offline) return undefined;
    let live = true;
    const today = todayInBangkok(new Date());
    const timer = setTimeout(() => setAppeared(true), TOTAL_WAIT_MS);
    resources.history({ from: today, through: today, type: 'expense', sort: 'date_desc' }, undefined, HISTORY_MAX_LIMIT).then(
      (page) => {
        if (!live) return;
        // A day with more expenses than one page could leave a counted draft's record unlisted.
        if (page.next_cursor === null) {
          const now = latest.current;
          setTotal(todayOutMinor({
            summaryExpenseMinor: page.summary.expense_minor,
            confirmedIds: new Set(page.items.map((item) => item.id)),
            outbox: now.phase === 'ready' ? now.outbox : [],
            today,
          }));
        }
        setAppeared(true);
      },
      () => {
        if (live) setAppeared(true);
      },
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [notice.offline, resources]);

  const [undo, setUndo] = useState<UndoState>({ phase: 'ready' });
  const busy = useRef(false);
  const plan = notice.via === 'device' && view.phase !== 'ready' ? NONE : undoPlan(notice, view.outbox);
  const words = toastWords(notice, total, hidden, t);
  const said = undo.phase === 'said' ? undo.text : null;
  const text = said ?? words.text;
  const spoken = said ?? words.spoken;
  const offered = plan.kind !== 'none' && (undo.phase === 'ready' || (undo.phase === 'said' && undo.again));

  /** Undo, the rule (R61): one at a time, from the plan this render shows. */
  const runUndo = async () => {
    if (busy.current || plan.kind === 'none') return;
    busy.current = true;
    setUndo({ phase: 'busy' });
    const slot = `undo:${notice.recordId}`;
    try {
      if (plan.kind === 'remove_draft') {
        // A draft to remove is only ever planned from an open diary's outbox.
        await diary?.removeDraft(plan.commandId);
      } else {
        await resources.deleteTransaction(plan.recordId, plan.version, keys.keyFor(slot, { version: plan.version }));
        keys.settle(slot);
      }
      trackUndoUsed({ kind: notice.kind });
      setUndo({ phase: 'said', text: t(plan.kind === 'remove_draft' ? 'saved.undone' : 'saved.undoneDeleted'), again: false });
    } catch (error) {
      if (plan.kind === 'remove_draft') {
        setUndo({ phase: 'said', text: tc("Couldn't change this device's copy. Try again."), again: true });
      } else {
        const problem = saveProblem(error, tc);
        if (!problem.unconfirmed) keys.settle(slot);
        const outcome = error instanceof V1Error ? error.outcome : undefined;
        const answer = outcome === 'conflict'
          ? t('saved.undoConflict')
          : outcome === 'deleted' || outcome === 'not_found' ? tc('This entry was already deleted.') : problem.message;
        setUndo({ phase: 'said', text: answer, again: problem.unconfirmed });
      }
    } finally {
      busy.current = false;
    }
  };

  // It stays TOAST_MS after its words last changed, and never leaves while an Undo is on its way.
  useEffect(() => {
    if (!appeared || undo.phase === 'busy') return undefined;
    const timer = setTimeout(() => onGone(id), TOAST_MS);
    return () => clearTimeout(timer);
  }, [appeared, undo.phase, text, id, onGone]);
  useAnnouncement(appeared ? spoken : null);

  if (!appeared) return null;
  // The amount in DM Sans 700 (§5.1, bw-saved), inside the line's own words.
  const amount = said === null && !notice.offline && total !== null ? toastAmount(total, hidden) : null;
  const at = amount === null ? -1 : text.indexOf(amount);
  return (
    <Animated.View
      testID="saved-toast"
      {...POLITE_LIVE_REGION}
      entering={toastEntering(reduced)}
      pointerEvents="box-none"
      style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, alignItems: 'center', zIndex: 10 }}
    >
      <View
        style={{
          maxWidth: '100%',
          minHeight: 46,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingLeft: 16,
          paddingRight: offered ? 4 : 16,
          borderRadius: 23,
          backgroundColor: colors.toast,
          boxShadow: colors.isDark ? undefined : TOAST_SHADOW,
        }}
      >
        <SavedCheck circle={colors.onToast} tick={colors.toast} />
        <WalletText testID={said === null ? 'saved-line' : 'saved-said'} role="label" tone="onToast" accessibilityLabel={spoken} style={{ flexShrink: 1, paddingVertical: 8 }}>
          {amount === null || at < 0 ? text : (
            <>
              {text.slice(0, at)}
              <Text style={{ fontFamily: LATIN_UI_FONT_FAMILY, fontWeight: '700' }}>{amount}</Text>
              {text.slice(at + amount.length)}
            </>
          )}
        </WalletText>
        {offered ? <TextLink tone="toastLink" label={t('common.undo')} onPress={() => void runUndo()} /> : null}
      </View>
    </Animated.View>
  );
}

/** The saved check (§5.3): neutral, never `under`. Decorative: the words say it. */
function SavedCheck({ circle, tick }: { circle: string; tick: string }) {
  return (
    <View {...DECORATIVE} testID="saved-check" style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: circle, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={12} height={12} viewBox="0 0 24 24">
        <Path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke={tick} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}
