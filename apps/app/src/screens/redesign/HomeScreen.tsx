// The redesigned Home ("Bun diary", redesign R3), behind the `core` redesign
// flag. It is the current v1 Home's behaviour in the kit's clothes, built on
// the pure `homeModel()`:
//
// - a lavender stage with the month, the month's CONFIRMED spending (against
//   the budget when there is one) and the bun peeking up from the stage;
// - the month's pace as a ring, or one quiet line when there is no budget;
// - today's records as a receipt with the day's confirmed totals, then the
//   earlier days with their own totals, then the wallets;
// - drafts saved on this device inline with their state ("saving…",
//   "checking…", "needs a look", "Update Jotbun to send"), with Remove for a
//   draft never sent and Discard for one Jotbun refused, as today;
// - money waiting on the device and money being checked with Jotbun on lines
//   of their own, never added into confirmed money;
// - every state the current Home has: loading, the explicit first wallet,
//   each load problem, offline with the device's data, and a locked diary.
//
// The bun appears only at moments (first run, the stage peek, over budget)
// and follows the bun intensity: Quiet keeps it on the first-run empty state
// only, Off removes it everywhere.
import type { HistoryFilter, Minor } from '@gogospend/contracts';
import { HISTORY_MAX_LIMIT, TRACKING_START_MIN, validateTrackingStart } from '@gogospend/contracts';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';

import { V1Error } from '@mobile/api/client';
import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import { Bun } from '@mobile/mascot/Bun';
import { useBunIntensity } from '@mobile/mascot/BunIntensityProvider';
import { BunPeek } from '@mobile/mascot/BunPeek';
import { BUN_POSES, BUN_SIZES, bunHeight } from '@mobile/mascot/poses';
import type { BunPoseName } from '@mobile/mascot/poses';
import { AmountInputError, formatMinor, parseAmountInput } from '@mobile/spend/v1/money';
import type { BudgetPace as LogicPace } from '@mobile/spend/v1/redesign/budgetPace';
import { earlierWholeDays, homeModel, readWholeDay } from '@mobile/spend/v1/redesign/homeModel';
import type { HomeData, LoadProblem, LoadProblemKind } from '@mobile/spend/v1/redesign/homeModel';
import { addDays, moneyGroupOf } from '@mobile/spend/v1/redesign/shared';
import type { DayGroup, DiaryRow, MoneyPair, RowState } from '@mobile/spend/v1/redesign/shared';
import type { SpendV1Resources } from '@mobile/spend/v1/resources';
import type { DiaryView } from '@mobile/spend/v1/spendDiary';
import { useDiaryView, useSpendDiary } from '@mobile/spend/v1/SpendDiaryContext';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import { monthOf, todayInBangkok } from '@mobile/spend/v1/viewModels';
import type { OutboxCommand } from '@mobile/storage/types';
import { TextInput } from '@mobile/theme/AppText';
import { bunText } from '@mobile/theme/bunType';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { DECORATIVE, POLITE_LIVE_REGION, useAnnouncement } from '@mobile/ui/a11y';
import type { BudgetPace as KitPace } from '@mobile/ui/budgetWords';
import { toKitPace } from '@mobile/ui/paceAdapter';
import { BunText, useBunScript } from '@mobile/ui/BunText';
import { Card } from '@mobile/ui/Card';
import { categoryLook } from '@mobile/ui/categoryIcons';
import type { CategoryLook } from '@mobile/ui/categoryIcons';
import { DateChip } from '@mobile/ui/DateChip';
import { monthLabel } from '@mobile/ui/dateStep';
import { DayHeader } from '@mobile/ui/DayHeader';
import { EmptyState } from '@mobile/ui/EmptyState';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE, BUN_TOUCH } from '@mobile/ui/layout';
import { PaceRing } from '@mobile/ui/PaceRing';
import { PillButton } from '@mobile/ui/PillButton';
import { ReceiptSlip, ReceiptTotal } from '@mobile/ui/ReceiptSlip';
import { RecordRow } from '@mobile/ui/RecordRow';
import type { RecordRowState } from '@mobile/ui/RecordRow';
import { ConfirmSheet, Sheet } from '@mobile/ui/Sheet';
import { StageHeader } from '@mobile/ui/StageHeader';
import { SyncBanner, syncBannerLine } from '@mobile/ui/SyncBanner';
import type { SyncBannerProps } from '@mobile/ui/SyncBanner';
import { isOwnCreate, newId, refusedBeforeProcessing, saveProblem, useCommandKeys, useLoad, useMoneyLocale } from '../v1/parts';
import { recordHref } from './HistoryParts';

type Tc = ReturnType<typeof useCopy>;

/** At most this many earlier days under today's receipt; History has the rest. */
const EARLIER_DAYS = 5;
/** Earlier records read for those days (one page, cut back to whole days). */
const EARLIER_RECORDS = 50;
/** Pages of today's records read (each up to HISTORY_MAX_LIMIT); a busier day is shown as partial, never as an error. */
const TODAY_PAGES = 20;

// ---------------------------------------------------------------------------
// Loading

/** Every record of today, page by page (`readWholeDay`): the receipt's day total is never a partial sum without saying so. */
function readToday(resources: SpendV1Resources, day: string) {
  const filter: HistoryFilter = { from: day, through: day, sort: 'date_desc' };
  return readWholeDay((cursor) => resources.history(filter, cursor, HISTORY_MAX_LIMIT), TODAY_PAGES);
}

/** Reloads confirmed money in place whenever a draft it was waiting on resolves (as the current Home does). */
function useRefreshOnResolve(outbox: readonly OutboxCommand[], refresh: () => void): void {
  const open = useRef(new Set<string>());
  useEffect(() => {
    const now = new Set(outbox.filter((command) => command.state !== 'acknowledged').map((command) => command.commandId));
    const resolved = [...open.current].some((id) => !now.has(id));
    open.current = now;
    if (resolved) refresh();
  }, [outbox, refresh]);
}

// ---------------------------------------------------------------------------
// Pace: the logic's shape to the kit's

/**
 * The view model's pace (`spend/v1/redesign/budgetPace.ts`) in the shape the
 * kit's ring takes (`ui/budgetWords.ts`). The ring shows the estimate (money
 * confirmed plus money waiting on this device), and the card says so.
 * Delegates to the shared adapter, `ui/paceAdapter.ts`.
 */
export function kitPace(pace: LogicPace): KitPace {
  return toKitPace(pace);
}

// ---------------------------------------------------------------------------
// Sync: what the banner says

type SyncPlan = {
  /** "Offline": the load could not reach Jotbun, or sync is backing off with entries waiting. */
  offline: boolean;
  /** Sync is backing off or paused with entries waiting: offer a manual retry. */
  retry: boolean;
  saving: number;
  checking: number;
  needsLook: number;
  upgrade: boolean;
  locked: { reason: string; startOver: boolean } | null;
  /** Sync news the kit banner has no state for, in the current SyncStatus's words. */
  notes: string[];
};

const NO_SYNC: SyncPlan = { offline: false, retry: false, saving: 0, checking: 0, needsLook: 0, upgrade: false, locked: null, notes: [] };

function lockFor(reason: DiaryView['lockReason'], tc: Tc): NonNullable<SyncPlan['locked']> {
  if (reason === 'key_missing' || reason === 'key_rejected' || reason === 'wrong_account') {
    return { reason: tc("This device's diary can't be unlocked. Entries that weren't synced can't be read."), startOver: true };
  }
  if (reason === 'key_unavailable') return { reason: tc("This device's diary can't be opened right now. Try again later."), startOver: false };
  if (reason === 'schema_too_new') return { reason: tc('Update Jotbun to open the entries saved on this device'), startOver: false };
  return { reason: tc('Sign in again to send the entries saved on this device'), startOver: false };
}

/**
 * The banner for the device diary. Only a diary that is open can be offline
 * with entries kept on the phone; without a diary (the web) nothing is kept,
 * so nothing claims to be.
 */
export function syncPlan(view: DiaryView | null, unreachable: boolean, tc: Tc): SyncPlan {
  if (!view) return NO_SYNC;
  if (view.phase === 'locked') return { ...NO_SYNC, locked: lockFor(view.lockReason, tc) };
  if (view.phase !== 'ready') return NO_SYNC;
  const count = (...states: OutboxCommand['state'][]) => view.outbox.filter((command) => states.includes(command.state)).length;
  const waiting = count('unsent', 'sending', 'uncertain', 'paused_upgrade');
  const status = view.outcome?.status;
  const backingOff = (status === 'paused' || status === 'waiting') && waiting > 0;
  const notes: string[] = [];
  if (status === 'paused' && waiting > 0) notes.push(tc('Sync is paused after repeated failures.'));
  if (status === 'policy_required' && waiting > 0) notes.push(tc('Review and accept the updated terms to send the entries saved on this device'));
  if ((status === 'signed_out' || status === 'session_changed') && waiting > 0) notes.push(tc('Sign in again to send the entries saved on this device'));
  if (status === 'resync_pending') notes.push(tc('Getting your full diary from Jotbun'));
  if (view.progress && view.progress.total > 1) notes.push(tc('Syncing {sent} of {total}', { sent: view.progress.sent, total: view.progress.total }));
  return {
    offline: unreachable || backingOff,
    retry: backingOff,
    // Sending may already be committed, so it is checked, as v1's SyncStatus says and the money groups count it.
    saving: count('unsent'),
    checking: view.outbox.filter((command) => moneyGroupOf(command.state) === 'checking').length,
    needsLook: count('needs_review'),
    upgrade: count('paused_upgrade') > 0 || status === 'upgrade_required',
    locked: null,
    notes,
  };
}

// ---------------------------------------------------------------------------
// Pieces

function Page({ header, children }: { header: ReactNode; children: ReactNode }) {
  const colors = useBunColors();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ paddingBottom: BUN_SPACE.xl }} keyboardShouldPersistTaps="handled">
      {header}
      <View style={{ padding: BUN_SPACE.md, gap: BUN_SPACE.md }}>{children}</View>
    </ScrollView>
  );
}

/**
 * The bun peeking up from the bottom of the stage's content. The slot keeps
 * the bun's own box, so it never covers the words beside it; the peek slides
 * out from behind the slot's lower edge.
 */
function StageBun({ pose }: { pose: BunPoseName }) {
  const width = BUN_SIZES.m;
  return (
    <View style={{ width, height: bunHeight(BUN_POSES[pose], width) }}>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 0 }}>
        <BunPeek edge="top" align="center" pose={pose} size="m" testID={`home-bun-${pose}`} />
      </View>
    </View>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <BunText variant="label" role="heading" accessibilityRole="header" style={{ fontWeight: '700' }}>{children}</BunText>;
}

/** A problem in words, with a mark beside it: ink, never red (red only means over budget). */
function Problem({ message }: { message: string }) {
  const colors = useBunColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: BUN_SPACE.xs }}>
      <View {...DECORATIVE} style={{ minWidth: 18, minHeight: 18, marginTop: 1, borderRadius: BUN_RADIUS.pill, borderWidth: BUN_OUTLINE.control, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
        <BunText variant="micro" style={{ fontWeight: '700' }}>!</BunText>
      </View>
      <BunText accessibilityRole="alert" aria-live="polite" variant="caption" style={{ flex: 1, fontWeight: '700' }}>{message}</BunText>
    </View>
  );
}

const PROBLEM_TITLES: Readonly<Record<LoadProblemKind, string>> = {
  upgrade_required: 'Update Jotbun',
  terms_required: 'Updated terms',
  signed_out: 'Signed out',
  unsupported_platform: 'Use the Jotbun app',
  load_failed: 'Diary not loaded',
};

/** Each load problem names itself; only a plain failure offers Try again. */
function ProblemCard({ problem, onRetry }: { problem: LoadProblem; onRetry: () => void }) {
  const tc = useCopy();
  return (
    <Card testID={`home-problem-${problem.kind}`}>
      <BunText variant="heading" role="heading" accessibilityRole="header">{tc(PROBLEM_TITLES[problem.kind])}</BunText>
      <BunText accessibilityRole="alert">{problem.message}</BunText>
      {problem.retry ? <PillButton label={tc('Try again')} onPress={onRetry} /> : null}
    </Card>
  );
}

/** Every draft state has its own words in RecordRow, "Update Jotbun to send" included. */
const ROW_STATE: Readonly<Record<RowState, RecordRowState>> = {
  confirmed: 'confirmed',
  saving: 'saving',
  checking: 'checking',
  needs_look: 'needs_look',
  update_to_send: 'update_to_send',
};

type RowContext = { lookOf: (row: DiaryRow) => CategoryLook | null; onOpen: (row: DiaryRow) => void };

/** Remove (never sent) and Discard (refused), as the current Home's device drafts. */
function DraftActions({ row }: { row: DiaryRow }) {
  const diary = useSpendDiary();
  const tc = useCopy();
  const locale = useMoneyLocale();
  const commandId = row.commandId;
  if (commandId === null || (!row.canUndo && !row.canDiscard)) return null;
  const entry = `${row.title} ${formatMinor(row.amountMinor, locale)}`;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: BUN_SPACE.xs, paddingBottom: BUN_SPACE.xs }}>
      {row.canUndo && diary ? (
        <PillButton kind="secondary" label={tc('Remove')} accessibilityLabel={tc('Remove {entry}', { entry })} onPress={() => void diary.removeDraft(commandId).catch(() => undefined)} />
      ) : null}
      {row.canDiscard && diary ? (
        <PillButton kind="secondary" label={tc('Discard')} accessibilityLabel={tc('Discard {entry}', { entry })} onPress={() => void diary.discardDraft(commandId).catch(() => undefined)} />
      ) : null}
    </View>
  );
}

/** A record opens its own screen; a draft is not a record yet, so it does not. */
function DiaryRowView({ row, context }: { row: DiaryRow; context: RowContext }) {
  const draft = row.commandId !== null;
  return (
    <View>
      <RecordRow
        title={row.title}
        detail={row.detail}
        type={row.type}
        amountMinor={row.amountMinor}
        category={context.lookOf(row)}
        state={ROW_STATE[row.state]}
        onPress={draft ? undefined : () => context.onOpen(row)}
      />
      {draft ? <DraftActions row={row} /> : null}
    </View>
  );
}

/** Draft money ("Waiting to sync: …", "Checking with Jotbun: …"), kept apart from confirmed money. */
function PendingLines({ lines, tone = 'muted' }: { lines: readonly string[]; tone?: 'muted' | 'ink' }) {
  return <>{lines.map((line) => <BunText key={line} variant="caption" tone={tone}>{line}</BunText>)}</>;
}

/** The day's confirmed money out, and money in when there is any. */
function DayTotals({ confirmed }: { confirmed: MoneyPair }) {
  const tc = useCopy();
  return (
    <>
      <ReceiptTotal label={tc('Money out')} minor={confirmed.outMinor} type={confirmed.outMinor === '0' ? undefined : 'expense'} />
      {confirmed.inMinor !== '0' ? <ReceiptTotal label={tc('Money in')} minor={confirmed.inMinor} type="income" /> : null}
    </>
  );
}

function TodayReceipt({ group, emptyText, footer, context, onAdd }: { group: DayGroup; emptyText: string | null; footer?: string; context: RowContext; onAdd: () => void }) {
  const tc = useCopy();
  const empty = group.rows.length === 0;
  return (
    <ReceiptSlip title={tc("Today's receipt")} footer={footer}>
      {empty && emptyText ? (
        <>
          <BunText tone="muted">{emptyText}</BunText>
          <PillButton kind="secondary" label={tc('Add an entry')} onPress={onAdd} />
        </>
      ) : null}
      {group.rows.map((row) => <DiaryRowView key={row.key} row={row} context={context} />)}
      {/* A day too busy to read whole on Home: no total that falls short, and a quiet word on where the rest is. */}
      {empty || group.partial ? null : <DayTotals confirmed={group.totals.confirmed} />}
      {group.partial ? <BunText variant="caption" tone="muted">{tc("Today has more entries than Home shows. History has them all.")}</BunText> : null}
      <PendingLines lines={group.pendingLines} />
    </ReceiptSlip>
  );
}

function EarlierDays({ groups, today, context }: { groups: readonly DayGroup[]; today: string; context: RowContext }) {
  const tc = useCopy();
  if (groups.length === 0) return null;
  return (
    <Card>
      <SectionTitle>{tc('Earlier days')}</SectionTitle>
      {groups.map((group) => (
        <View key={group.day} style={{ gap: BUN_SPACE.xxs }}>
          <DayHeader date={group.day} today={today} outMinor={group.totals.confirmed.outMinor} inMinor={group.totals.confirmed.inMinor} />
          <PendingLines lines={group.pendingLines} />
          {group.rows.map((row) => <DiaryRowView key={row.key} row={row} context={context} />)}
        </View>
      ))}
    </Card>
  );
}

type Balance = { totalText: string; wallets: { id: string; name: string; balanceText: string; archived: boolean }[] };

function Wallets({ balance }: { balance: Balance }) {
  const tc = useCopy();
  const line = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, justifyContent: 'space-between' as const, alignItems: 'baseline' as const, columnGap: BUN_SPACE.sm };
  const figures = { fontVariant: ['tabular-nums' as const] };
  return (
    <Card>
      <SectionTitle>{tc('Wallets')}</SectionTitle>
      <View accessible accessibilityLabel={`${tc('Total balance')} ${balance.totalText}`} style={line}>
        <BunText tone="muted">{tc('Total balance')}</BunText>
        <BunText variant="heading" style={figures}>{balance.totalText}</BunText>
      </View>
      {balance.wallets.map((wallet) => {
        const label = `${wallet.name} ${wallet.balanceText}`;
        return (
          <View key={wallet.id} accessible accessibilityLabel={wallet.archived ? `${label}, ${tc('Archived')}` : label} style={line}>
            <View style={{ flexShrink: 1 }}>
              <BunText>{wallet.name}</BunText>
              {wallet.archived ? <BunText variant="caption" tone="muted">{tc('Archived')}</BunText> : null}
            </View>
            <BunText style={figures}>{wallet.balanceText}</BunText>
          </View>
        );
      })}
    </Card>
  );
}

/**
 * The sync strip: one banner per state, the lock's reason, sync news in
 * words, and the review, waiting and start-over sheets. All of it is one
 * polite live region, announced once (on iOS) as one sentence, rather than
 * each banner reading itself out on arrival.
 *
 * The sheets list every draft on this device, not only the ones in the days
 * Home shows: Review opens every draft that needs a look (with Discard), and
 * when some waiting drafts are older than those days, "Show all" lists every
 * waiting draft (with Remove for one never sent).
 */
function SyncSection({ plan, drafts, shownKeys, context }: { plan: SyncPlan; drafts: readonly DiaryRow[]; shownKeys: ReadonlySet<string>; context: RowContext }) {
  const tc = useCopy();
  const diary = useSpendDiary();
  const [reviewing, setReviewing] = useState(false);
  const [listing, setListing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const needsLook = drafts.filter((row) => row.state === 'needs_look');
  const waiting = drafts.filter((row) => row.state === 'saving' || row.state === 'update_to_send');
  const someHidden = waiting.some((row) => !shownKeys.has(row.key));
  const lines = [plan.locked?.reason ?? null, ...plan.notes].filter((line): line is string => line !== null);
  const startOver = plan.locked?.startOver && diary;
  const banners: SyncBannerProps[] = [
    ...(plan.locked ? [{ state: 'locked' as const, action: startOver ? { label: tc('Start over'), onPress: () => setConfirming(true) } : undefined }] : []),
    ...(plan.offline ? [{ state: 'offline' as const }] : []),
    ...(plan.saving > 0 ? [{ state: 'saving' as const, count: plan.saving, action: someHidden ? { label: tc('Show all'), onPress: () => setListing(true) } : undefined }] : []),
    ...(plan.checking > 0 ? [{ state: 'checking' as const, count: plan.checking }] : []),
    ...(plan.needsLook > 0 ? [{ state: 'needs_review' as const, count: plan.needsLook, action: { label: tc('Review'), onPress: () => setReviewing(true) } }] : []),
    ...(plan.upgrade ? [{ state: 'paused_upgrade' as const }] : []),
  ];
  const spoken = [...banners.map((banner) => syncBannerLine(banner, tc)), ...lines].filter((line): line is string => Boolean(line)).join(' ');
  useAnnouncement(spoken);
  return (
    <>
      {spoken ? (
        <View {...POLITE_LIVE_REGION} style={{ gap: BUN_SPACE.xs }}>
          {banners.map((banner) => <SyncBanner key={banner.state} {...banner} live={false} />)}
          {lines.map((line) => <BunText key={line} variant="caption" tone="muted">{line}</BunText>)}
        </View>
      ) : null}
      {plan.retry && diary ? <PillButton kind="secondary" label={tc('Retry')} onPress={() => void diary.retry()} /> : null}
      <Sheet visible={reviewing && needsLook.length > 0} onClose={() => setReviewing(false)} title={tc('Needs a look')}>
        {needsLook.map((row) => <DiaryRowView key={row.key} row={row} context={context} />)}
      </Sheet>
      <Sheet visible={listing && waiting.length > 0} onClose={() => setListing(false)} title={tc('Waiting to sync')}>
        {waiting.map((row) => <DiaryRowView key={row.key} row={row} context={context} />)}
      </Sheet>
      <ConfirmSheet
        visible={confirming}
        title={tc('Start over?')}
        consequence={tc('Starting over deletes the unreadable entries on this device. Everything already synced comes back from Jotbun.')}
        confirmLabel={tc('Delete and start over')}
        cancelLabel={tc('Keep it')}
        destructive
        onConfirm={() => {
          setConfirming(false);
          void diary?.discardDiary();
        }}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// First run: an explicit first wallet

function Field({ label, value, onChangeText, error, editable, keyboardType, autoFocus = false }: {
  label: string; value: string; onChangeText: (text: string) => void; error?: string; editable: boolean; keyboardType?: 'default' | 'decimal-pad'; autoFocus?: boolean;
}) {
  const colors = useBunColors();
  const script = useBunScript();
  return (
    <View style={{ gap: BUN_SPACE.xxs }}>
      <BunText variant="caption" tone="muted">{label}</BunText>
      <TextInput
        accessibilityLabel={label}
        aria-invalid={error !== undefined}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        readOnly={!editable}
        keyboardType={keyboardType}
        autoFocus={autoFocus}
        returnKeyType="done"
        style={{
          ...bunText('body', script),
          color: colors.ink,
          minHeight: BUN_TOUCH,
          paddingHorizontal: BUN_SPACE.sm,
          paddingVertical: BUN_SPACE.xs,
          borderRadius: BUN_RADIUS.chip,
          borderColor: colors.ink,
          borderWidth: error ? BUN_OUTLINE.card : BUN_OUTLINE.control,
          // Locked text stays fully readable: ink on the page colour, not faded.
          backgroundColor: editable ? colors.card : colors.background,
        }}
      />
      {error ? <Problem message={error} /> : null}
    </View>
  );
}

/**
 * The first wallet: a name, an opening balance (zero is fine; it is never
 * income) and the day tracking starts. The same rules, command key and error
 * mapping as the current Home's form: a definite refusal settles the key, an
 * unconfirmed save freezes the form and resends the same command, and a
 * refusal because this wallet's id already exists means it was created.
 */
function FirstWalletForm({ today, onCreated }: { today: string; onCreated: () => void }) {
  const resources = useSpendV1();
  const tc = useCopy();
  const keys = useCommandKeys();
  const locale = useMoneyLocale();
  const [walletId] = useState(newId);
  const [name, setName] = useState('');
  const [opening, setOpening] = useState('0');
  const [start, setStart] = useState(today);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [frozen, setFrozen] = useState(false);
  // Frozen, and resending must wait (a changed session, an update): Try again is disabled.
  const [resendBlocked, setResendBlocked] = useState(false);
  const [busy, setBusy] = useState(false);

  async function create() {
    const next: Record<string, string> = {};
    const trimmed = name.trim();
    if (!trimmed) next.name = tc('Enter a wallet name');
    let openingMinor: Minor = '0';
    try {
      openingMinor = parseAmountInput(opening, locale);
    } catch (error) {
      next.opening = error instanceof AmountInputError && error.problem === 'too_precise' ? tc('Use at most two decimal places') : tc('Enter an amount like 65 or 65.50');
    }
    try {
      validateTrackingStart(start, today);
    } catch {
      next.start = tc('Enter a real date as YYYY-MM-DD');
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    const input = { id: walletId, name: trimmed, opening_minor: openingMinor, tracking_start: start };
    setBusy(true);
    try {
      await resources.createWallet(input, keys.keyFor('create', input));
      keys.settle('create');
      onCreated();
    } catch (error) {
      if (isOwnCreate(error, walletId)) {
        keys.settle('create');
        onCreated();
        return;
      }
      const problem = saveProblem(error, tc);
      // Once unconfirmed, a refusal before processing says nothing about the earlier attempt: stay frozen with the key.
      const stillUnknown = problem.unconfirmed || (frozen && refusedBeforeProcessing(error));
      if (!stillUnknown) keys.settle('create');
      setFrozen(stillUnknown);
      setResendBlocked(stillUnknown && problem.blocked);
      setMessage(problem.message);
      setErrors({ ...(problem.fields.name ? { name: problem.fields.name } : {}), ...(problem.fields.tracking_start ? { start: problem.fields.tracking_start } : {}) });
    } finally {
      setBusy(false);
    }
  }

  let preview: string | null = null;
  try {
    preview = formatMinor(parseAmountInput(opening, locale), locale);
  } catch {
    preview = null;
  }
  return (
    <Card>
      <Field label={tc('Wallet name')} value={name} onChangeText={setName} error={errors.name} editable={!frozen} />
      <Field label={tc('Opening balance')} value={opening} onChangeText={setOpening} error={errors.opening} editable={!frozen} keyboardType="decimal-pad" />
      {preview ? <BunText variant="caption" tone="muted" accessibilityLabel={`${tc('Opening balance')} ${preview}`} style={{ fontVariant: ['tabular-nums'] }}>{preview}</BunText> : null}
      <View style={{ gap: BUN_SPACE.xxs }}>
        <BunText variant="caption" tone="muted">{tc('Tracking starts')}</BunText>
        <DateChip value={start} today={today} onChange={setStart} disabled={frozen} />
        {errors.start ? <Problem message={errors.start} /> : null}
      </View>
      {message ? <Problem message={message} /> : null}
      <PillButton label={frozen ? tc('Try again') : tc('Create wallet')} onPress={() => void create()} busy={busy} disabled={resendBlocked} />
    </Card>
  );
}

/**
 * First run, in one step: the hello bun and the empty state name the space,
 * and the form follows at once. The empty state has no action of its own, so
 * Create wallet stays the view's one primary.
 */
function FirstRun({ headline, body, today, onCreated }: { headline: string; body: string; today: string; onCreated: () => void }) {
  return (
    <>
      <EmptyState art={<Bun pose="hello" size="l" testID="home-bun-hello" />} title={headline} body={body} />
      <FirstWalletForm today={today} onCreated={onCreated} />
    </>
  );
}

// ---------------------------------------------------------------------------
// The screen

export function HomeScreen({ now }: { now?: Date }) {
  const resources = useSpendV1();
  const router = useRouter();
  const tc = useCopy();
  const locale = useMoneyLocale();
  const activeLocale = useActiveLocale();
  const colors = useBunColors();
  const { intensity } = useBunIntensity();
  const today = todayInBangkok(now ?? new Date());
  const month = monthOf(today);
  const diary = useSpendDiary();
  const diaryView = useDiaryView();

  const loaded = useLoad<HomeData>(async () => {
    const [categories, wallets, summary, budget, todays, earlier] = await Promise.all([
      resources.ensureBuiltinCategories(),
      resources.wallets(),
      resources.summary(month),
      resources.budget(month),
      readToday(resources, today),
      resources.history({ from: TRACKING_START_MIN, through: addDays(today, -1), sort: 'date_desc' }, undefined, EARLIER_RECORDS),
    ]);
    // Earlier records cut back to whole days; the model keeps drafts on a cut day out too.
    const whole = earlierWholeDays(earlier);
    return {
      categories, wallets, summary, budget,
      records: [...todays.records, ...whole.records],
      oldestWholeDay: whole.oldestWholeDay,
      todayComplete: todays.complete,
    };
  }, [resources, month, today]);
  useRefreshOnResolve(diaryView.outbox, loaded.refresh);

  const view = diary ? diaryView : null;
  const model = homeModel({ today, tc, locale, load: loaded, diary: view, earlierDays: EARLIER_DAYS });

  const categories = loaded.state === 'ready' ? loaded.data.categories : diaryView.categories;
  const records = loaded.state === 'ready' ? loaded.data.records : [];
  const context = useMemo<RowContext>(() => {
    const byId = new Map(categories.map((category) => [category.id, category]));
    const categoryOf = new Map<string, string>();
    for (const record of records) if (record.type !== 'transfer') categoryOf.set(record.id, record.category_id);
    for (const command of diaryView.outbox) if (command.payload.type !== 'transfer') categoryOf.set(command.payload.id, command.payload.category_id);
    return {
      lookOf: (row) => {
        const category = byId.get(categoryOf.get(row.recordId) ?? '');
        return category ? categoryLook(category, row.title) : null;
      },
      onOpen: (row) => router.push(recordHref(row.recordId)),
    };
  }, [categories, records, diaryView.outbox, router]);

  const add = () => router.push('/spend/add');
  const unreachable = loaded.state === 'error' && loaded.error instanceof V1Error && loaded.error.outcome === 'network';
  const plan = syncPlan(view, unreachable, tc);
  const allRows = model.kind === 'ready' ? [model.today, ...model.earlier] : model.kind === 'problem' && model.offline ? [model.offline.today, ...model.offline.earlier] : [];
  const shownKeys = new Set(allRows.flatMap((group) => group.rows).map((row) => row.key));
  // Every draft on this device, older than the days shown or not (the model's `openDrafts`), for the review and waiting sheets.
  const drafts = model.kind === 'ready' ? model.openDrafts : model.kind === 'problem' && model.offline ? model.offline.openDrafts : [];
  const sync = <SyncSection plan={plan} drafts={drafts} shownKeys={shownKeys} context={context} />;
  const appHeader = <StageHeader title={tc('Jotbun')} />;

  if (model.kind === 'loading') {
    return (
      <Page header={appHeader}>
        <View style={{ alignItems: 'center', paddingVertical: BUN_SPACE.xl, gap: BUN_SPACE.sm }}>
          <ActivityIndicator accessibilityLabel={model.label} color={colors.ink} />
          <BunText tone="muted">{model.label}</BunText>
        </View>
      </Page>
    );
  }

  if (model.kind === 'problem') {
    const offline = model.offline;
    return (
      <Page header={appHeader}>
        {sync}
        <ProblemCard problem={model.problem} onRetry={loaded.reload} />
        {offline ? (
          <>
            <PendingLines lines={offline.waitingMoney} />
            {offline.canAdd ? <PillButton kind="secondary" label={tc('Add an entry')} onPress={add} /> : null}
            {offline.today.rows.length > 0 ? <TodayReceipt group={offline.today} emptyText={null} footer={tc('Saved on this device')} context={context} onAdd={add} /> : null}
            <EarlierDays groups={offline.earlier} today={today} context={context} />
          </>
        ) : null}
      </Page>
    );
  }

  if (model.kind === 'first_run') {
    return (
      <Page header={appHeader}>
        {sync}
        <FirstRun
          headline={model.headline}
          body={model.body}
          today={today}
          onCreated={() => {
            loaded.reload();
            // Bring the new wallet (and the built-in categories) to the device, so entries can be saved there.
            void diary?.retry();
          }}
        />
      </Page>
    );
  }

  const { pace } = model.budget;
  const confirmedSpent = formatMinor(pace.spent.confirmedMinor, locale);
  const monthSummary = loaded.state === 'ready' ? loaded.data.summary : null;
  const monthIn = formatMinor(monthSummary?.income_minor ?? '0', locale);
  const monthOut = formatMinor(monthSummary?.expense_minor ?? pace.spent.confirmedMinor, locale);
  const total = pace.limitMinor === null
    ? tc('{spent} spent this month', { spent: confirmedSpent })
    : tc('{spent} of {limit}', { spent: confirmedSpent, limit: formatMinor(pace.limitMinor, locale) });
  // Bun moments: the stage peek, which turns kind when over budget. Quiet and Off leave it out.
  const stageBun: BunPoseName | null = intensity === 'full' ? (pace.state === 'over' ? 'oops-kind' : 'peek') : null;
  const notes = [model.budget.pendingNote, model.budget.checkingNote].filter((note): note is string => note !== null);
  return (
    <Page
      header={(
        <StageHeader title={monthLabel(model.month, activeLocale)} bun={stageBun ? <StageBun pose={stageBun} /> : undefined}>
          <BunText testID="home-total" variant="heading" tone="ink" style={{ fontVariant: ['tabular-nums'] }}>{total}</BunText>
          {/* The month's confirmed money in and out, as the v1 Home showed them: quiet, and never with drafts added. */}
          <BunText variant="caption" tone="ink" accessibilityLabel={`${tc('Money in')} ${monthIn}, ${tc('Money out')} ${monthOut}`} style={{ fontVariant: ['tabular-nums'] }}>
            {`${tc('Money in')} ${monthIn} · ${tc('Money out')} ${monthOut}`}
          </BunText>
          <PendingLines lines={model.waitingMoney} tone="ink" />
        </StageHeader>
      )}
    >
      {sync}
      {pace.state === 'no_budget' ? (
        <BunText tone="muted">{model.budget.setBudget ?? model.budget.headline}</BunText>
      ) : (
        <Card>
          <SectionTitle>{tc('This month')}</SectionTitle>
          <PaceRing {...kitPace(pace)} />
          {notes.map((note) => <BunText key={note} variant="caption" tone="muted">{note}</BunText>)}
        </Card>
      )}
      <TodayReceipt group={model.today} emptyText={model.todayEmptyText} context={context} onAdd={add} />
      <EarlierDays groups={model.earlier} today={today} context={context} />
      <Wallets balance={model.balance} />
      <PillButton kind="secondary" label={tc('See all entries')} onPress={() => router.push('/spend/all')} />
    </Page>
  );
}
