// The Bun Wallet's record (plan P2-T26; bw-record, rh-actions, rh-undo): one
// entry on the record's shared rules (useRecordActions, P2-T6), never a fork.
//
// - The page: the amount ghosted large behind (decorative), back and more,
//   the record's tile, its title (the merchant, else its category's name) and
//   its day as the board writes it, with no time (W12), and the amount exact at
//   44; a facts card (status from the row state, wallet, category and note; no
//   จดจาก row, W35); today's receipt section (W15); and three 52 pt buttons:
//   แก้ไข (startEditing(), which P2-T27's tray shows), ทำซ้ำวันนี้ (the add tray
//   copying this record) and ลบ (remove(record), then the undo bar). At the
//   largest text sizes the three stack.
// - More opens RecordActionsTray. An action that opens a tray (an edit, a
//   copy) runs from the tray's onClosed, once its Modal has gone (R69); a
//   delete runs at once. A tray opened again before it has gone forgets the
//   action it was leaving for.
// - The undo bar restores the version the delete returned, through restore. It
//   goes after its time, but never while its undo is on its way or unconfirmed
//   (the undo's Try again); once it has gone, the page says the entry was
//   deleted.
// - A draft still on the phone shows its state with Remove or Discard
//   (settleDraft), as today, and ทำซ้ำวันนี้; it cannot be edited or deleted.
//   `pending` freezes with Try again; `gone` and `notice` say today's words; a
//   deleted entry offers Restore while it can.
// - Private mode (W10, R114): every amount is ฿•••• (WalletAmount, the ghost)
//   and the undo bar names the entry without one; no free text that quotes the
//   person is drawn: the title is the category's name, never the merchant (Bun
//   may have filled it), and a note says it is hidden.
// - This screen sends no event (R61): they sit in useRecordActions.
import type { CategoryDto, Minor } from '@gogospend/contracts';
import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { V1Error } from '@mobile/api/client';
import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import { LoadingBlock, Notice, useGoBack } from '@mobile/screens/redesign/HistoryParts';
import { RecordReceipt } from '@mobile/screens/redesign/import/RecordReceipt';
import { lookupsOf, useRecordActions } from '@mobile/screens/redesign/record/recordActions';
import { useMoneyLocale } from '@mobile/screens/v1/parts';
import { recentlyDeletedModel } from '@mobile/spend/v1/redesign/historyModel';
import { classifyLoadProblem } from '@mobile/spend/v1/redesign/homeModel';
import { recordDetail } from '@mobile/spend/v1/redesign/recordModel';
import type { RecordDetail, ReceiptRowKey } from '@mobile/spend/v1/redesign/recordModel';
import { dateTagFor } from '@mobile/spend/v1/redesign/shared';
import type { Lookups } from '@mobile/spend/v1/redesign/shared';
import { useDiaryView } from '@mobile/spend/v1/SpendDiaryContext';
import { Text } from '@mobile/theme/AppText';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { LATIN_UI_FONT_FAMILY } from '@mobile/theme/uiFontFamily';
import { walletLineHeight } from '@mobile/theme/walletType';
import { DECORATIVE } from '@mobile/ui/a11y';
import { categoryInitial } from '@mobile/ui/categoryIcons';
import { dayLabel, shortDateWithYear } from '@mobile/ui/dateStep';
import { useLargeText } from '@mobile/ui/largeText';
import { useAddTray } from '../add/AddTrayHost';
import { COMMON_COPY } from '../common/copy';
import { IconButton } from '../controls/IconButton';
import type { WalletT } from '../copy/draftText';
import { useDraftCopy } from '../copy/useDraftCopy';
import { MaterialFill } from '../looks/MaterialFill';
import { CategoryGlyph, WalletCategoryIcon } from '../looks/WalletCategoryIcon';
import { useWalletLooks } from '../looks/WalletLooksProvider';
import { WalletAmount } from '../money/WalletAmount';
import { HIDDEN_AMOUNT, walletMoneyText } from '../money/walletMoney';
import type { MoneySign } from '../money/walletMoney';
import { usePrivateMode } from '../privacy/PrivateModeProvider';
import { PrimaryButton } from '../tray/PrimaryButton';
import { WalletText } from '../WalletText';
import { COPY } from './copy';
import { RecordActionsTray } from './RecordActionsTray';
import { WalletUndoBar } from './WalletUndoBar';

export type WalletRecordScreenProps = { id: string; mode?: 'view' | 'edit'; now?: Date };

/** The screen's lines and the shared ones, merged once, so `t` keeps one identity across renders. */
const RECORD_COPY = { ...COMMON_COPY, ...COPY };

/** What the amount says it is: today's words for the kind. */
const KIND_WORDS = { expense: 'Expense', income: 'Income', transfer: 'Transfer' } as const;

/** WalletText's leading for a size no type role has (the board's 24 and 14 pt lines), in this language. */
const leadingFor = (size: number, locale: string) => walletLineHeight(size, locale === 'th' ? 'thai' : 'latin');

/** A receipt row's value, or null when the record has none. */
const valueOf = (detail: RecordDetail, key: ReceiptRowKey) => detail.rows.find((row) => row.key === key)?.value ?? null;

/**
 * The words of the undo bar: the entry and its amount, or in private mode the
 * entry alone (as records.restoredHidden, R109). The bar is a live region, so
 * no amount may reach it while amounts are hidden.
 */
export function deletedBarText(title: string, amountMinor: Minor, hidden: boolean, t: WalletT): string {
  return hidden ? t('records.deletedBarHidden', { title }) : t('records.deletedBar', { title, amount: walletMoneyText(amountMinor) });
}

/** What the page shows of one entry, confirmed or a draft. */
type Shown = {
  detail: RecordDetail;
  type: 'expense' | 'income' | 'transfer';
  amountMinor: Minor;
  occurredOn: string;
  walletId: string | null;
  category: CategoryDto | undefined;
};

function Glyph({ d, size, color, width = 2.4 }: { d: string; size: number; color: string; width?: number }) {
  return (
    <View {...DECORATIVE}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

function MoreDots({ color }: { color: string }) {
  return (
    <View {...DECORATIVE}>
      <Svg width={18} height={18} viewBox="0 0 24 24">
        <Circle cx="6" cy="12" r="1.8" fill={color} />
        <Circle cx="12" cy="12" r="1.8" fill={color} />
        <Circle cx="18" cy="12" r="1.8" fill={color} />
      </Svg>
    </View>
  );
}

/** The record's tile: its category's (WalletCategoryIcon), a move's arrows, or the initial on `raised`. Decorative. */
function RecordTile({ shown, size, testID }: { shown: Shown; size: number; testID: string }) {
  const colors = useWalletColors();
  const initial = Math.round((size * 15) / 36);
  return (
    <View {...DECORATIVE} testID={testID}>
      {shown.type !== 'transfer' && shown.category ? (
        <WalletCategoryIcon category={shown.category} name={shown.detail.title} size={size} />
      ) : (
        <View style={{ width: size, height: size, borderRadius: Math.round((size * 11) / 36), backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' }}>
          {shown.type === 'transfer' ? (
            <CategoryGlyph glyph="transfer" size={size / 2} color={colors.ink} />
          ) : (
            <WalletText role="label" allowFontScaling={false} style={{ fontSize: initial, lineHeight: walletLineHeight(initial, 'thai'), fontWeight: '700' }}>
              {categoryInitial(shown.detail.title)}
            </WalletText>
          )}
        </View>
      )}
    </View>
  );
}

/** One fact: its label, quiet, and its value, read as one (the label, then the value's words). */
function Fact({ label, spoken, children, first }: { label: string; spoken: string; children: ReactNode; first: boolean }) {
  const colors = useWalletColors();
  return (
    <View
      accessible
      accessibilityLabel={`${label} ${spoken}`}
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        paddingVertical: 13,
        paddingHorizontal: 16,
        borderTopWidth: first ? 0 : 1,
        borderColor: colors.hairline,
      }}
    >
      <WalletText role="label" tone="quiet" style={{ fontWeight: '400' }}>{label}</WalletText>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>{children}</View>
    </View>
  );
}

/** The wallet's material, as a 28 × 18 pt swatch beside its name (bw-record). */
function WalletSwatch({ walletId }: { walletId: string }) {
  const { lookOf } = useWalletLooks();
  return (
    <View {...DECORATIVE} testID="wallet-record-swatch" style={{ width: 28, height: 18, borderRadius: 4, overflow: 'hidden' }}>
      <MaterialFill material={lookOf(walletId).material} radius={4} />
    </View>
  );
}

/** One of the page's 52 pt buttons: the main one, a quiet one or an outlined one. */
function PageButton({ label, kind, onPress, disabled = false, grow, testID }: {
  label: string;
  kind: 'main' | 'quiet' | 'outline';
  onPress: () => void;
  disabled?: boolean;
  /** Share the row with its neighbours; at the largest text sizes the buttons stack instead. */
  grow: boolean;
  testID: string;
}) {
  const colors = useWalletColors();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: grow ? 1 : undefined,
        minHeight: 52,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 16,
        backgroundColor: kind === 'main' ? colors.primary : kind === 'quiet' ? colors.card : 'transparent',
        borderWidth: kind === 'outline' ? 1 : 0,
        borderColor: colors.hairline,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
      })}
    >
      <WalletText role="label" tone={kind === 'main' ? 'onPrimary' : 'ink'} style={{ fontWeight: kind === 'main' ? '700' : '500', textAlign: 'center' }}>
        {label}
      </WalletText>
    </Pressable>
  );
}

export function WalletRecordScreen({ id, mode = 'view', now }: WalletRecordScreenProps) {
  const colors = useWalletColors();
  const t = useDraftCopy(RECORD_COPY);
  const tc = useCopy();
  const locale = useActiveLocale();
  const moneyLocale = useMoneyLocale();
  const insets = useSafeAreaInsets();
  const large = useLargeText();
  const goBack = useGoBack();
  const addTray = useAddTray();
  const diaryView = useDiaryView();
  const { hidden } = usePrivateMode();
  const { today, draftCommand, loaded, deleted, pending, gone, notice, busy, load, startEditing, remove, restore, settleDraft } = useRecordActions({ id, mode, now });

  const [actionsOpen, setActionsOpen] = useState(false);
  /** What the actions tray was closed for: it runs once the tray's Modal has gone (R69). */
  const after = useRef<'edit' | 'copy' | null>(null);
  /** The delete the undo bar is for, by id and the version the delete returned: a new delete is a new bar. */
  const undoKey = deleted === null ? null : `${deleted.id}@${deleted.version}`;
  const [undoGone, setUndoGone] = useState<string | null>(null);
  // The bar goes after its time, but never while its undo is on its way or unconfirmed (the undo's Try again).
  const undoShown = undoKey !== null && (undoGone !== undoKey || busy || pending === 'restore');

  const detailOf = (lookups: Lookups) => ({ lookups, tc, locale: moneyLocale, dateTag: dateTagFor(moneyLocale) });

  let shown: Shown | null = null;
  if (draftCommand) {
    const lookups = lookupsOf(diaryView.wallets, diaryView.categories);
    const entry = draftCommand.payload;
    shown = {
      detail: recordDetail({ kind: 'draft', command: draftCommand }, detailOf(lookups)),
      type: entry.type,
      amountMinor: entry.amount_minor,
      occurredOn: entry.occurred_on,
      walletId: entry.type === 'transfer' ? null : entry.wallet_id,
      category: entry.type === 'transfer' ? undefined : lookups.categories.get(entry.category_id),
    };
  } else if (loaded.state === 'ready') {
    const { record } = loaded;
    const lookups = lookupsOf(loaded.wallets, loaded.categories);
    shown = {
      detail: recordDetail({ kind: 'confirmed', record }, detailOf(lookups)),
      type: record.type,
      amountMinor: record.amount_minor,
      occurredOn: record.occurred_on,
      walletId: record.type === 'transfer' ? null : record.wallet_id,
      category: record.type === 'transfer' ? undefined : lookups.categories.get(record.category_id),
    };
  }

  // In private mode the title is the category's name: a merchant may be Bun's words (R114).
  const title = shown ? (hidden ? shown.detail.title : valueOf(shown.detail, 'merchant') ?? shown.detail.title) : '';
  const sign: MoneySign = shown?.type === 'income' ? 'income' : 'none';
  const record = !draftCommand && loaded.state === 'ready' ? loaded.record : null;
  const deletedElsewhere = record !== null && deleted === null && (record.deleted_at !== null || gone);
  const frozen = pending !== null;
  /** The live record, with nothing that freezes it: the page's actions and the tray act on it. */
  const live = record !== null && deleted === null && !deletedElsewhere && !frozen ? record : null;

  // Each opening forgets the last action: a tray opened again before it has gone says nothing of that exit.
  const openActions = () => {
    after.current = null;
    setActionsOpen(true);
  };
  const closeFor = (action: 'edit' | 'copy') => {
    after.current = action;
    setActionsOpen(false);
  };
  const actionsClosed = () => {
    if (after.current === 'copy' && shown) addTray.open({ copyOf: shown.detail.recordId });
    else if (after.current === 'edit') startEditing();
  };

  let body: ReactNode = null;
  let footer: ReactNode = null;
  if (draftCommand && shown) {
    const { commandId } = draftCommand;
    body = notice ? <Notice tone="alert" message={notice} /> : null;
    const copyOf = shown.detail.recordId;
    footer = (
      <View testID="wallet-record-actions" style={{ flexDirection: large ? 'column' : 'row', gap: 8 }}>
        <PageButton testID="wallet-record-copy" kind="quiet" grow={!large} label={t('records.copyToday')} onPress={() => addTray.open({ copyOf })} />
        {shown.detail.actions.undo ? (
          <PageButton testID="wallet-record-remove" kind="outline" grow={!large} label={tc('Remove')} onPress={() => void settleDraft(commandId, 'remove')} />
        ) : null}
        {shown.detail.actions.discard ? (
          <PageButton testID="wallet-record-discard" kind="outline" grow={!large} label={tc('Discard')} onPress={() => void settleDraft(commandId, 'discard')} />
        ) : null}
      </View>
    );
  } else if (loaded.state === 'loading') {
    body = <LoadingBlock label={tc('Loading your diary')} />;
  } else if (loaded.state === 'error') {
    const missing = loaded.error instanceof V1Error && (loaded.error.outcome === 'not_found' || loaded.error.outcome === 'deleted');
    const problem = classifyLoadProblem(loaded.error, tc);
    body = missing ? (
      <Notice tone="alert" message={gone ? tc('This entry was deleted on another device.') : tc("This entry isn't in your diary.")} />
    ) : (
      <Notice tone="alert" message={problem.message} action={problem.retry ? { label: tc('Try again'), onPress: () => void load() } : undefined} />
    );
  } else if (record && shown) {
    if (deleted) {
      // Deleted here: the facts stay for reference, and the undo bar restores it.
      body = (
        <>
          {notice ? <Notice tone="alert" message={notice} /> : null}
          {undoShown ? null : <Notice message={tc('Entry deleted')} />}
        </>
      );
      if (undoShown) {
        footer = (
          <WalletUndoBar
            message={deletedBarText(title, shown.amountMinor, hidden, t)}
            onUndo={() => void restore(deleted)}
            onDismiss={() => setUndoGone(undoKey)}
          />
        );
      }
    } else if (deletedElsewhere) {
      const restorable = record.deleted_at
        ? recentlyDeletedModel({ records: [record], now: now ?? new Date(), lookups: lookupsOf(loaded.wallets, loaded.categories), tc, locale: moneyLocale }).rows[0]
        : undefined;
      body = (
        <>
          <Notice tone="alert" message={gone ? tc('This entry was deleted on another device.') : tc('This entry was already deleted.')} />
          {notice ? <Notice tone="alert" message={notice} /> : null}
          {restorable ? (
            <View style={{ gap: 8 }}>
              <WalletText tone="quietOnGround">{restorable.daysLeft === 1 ? t('records.lastDay') : t('records.daysLeft', { n: restorable.daysLeft })}</WalletText>
              <PrimaryButton
                testID="wallet-record-restore"
                label={pending === 'restore' ? tc('Try again') : tc('Restore')}
                busy={busy}
                onPress={() => void restore({ id: record.id, version: restorable.version })}
              />
            </View>
          ) : null}
        </>
      );
    } else if (frozen) {
      // A delete whose answer never came: frozen, and Try again resends the same command.
      body = (
        <Notice tone="alert" message={notice ?? ''} action={pending === 'delete' ? { label: tc('Try again'), busy, onPress: () => void remove(record) } : undefined} />
      );
    } else {
      body = (
        <>
          <RecordReceipt recordId={record.id} version={record.version} attachmentId={record.attachment_id ?? null} onChanged={() => void load()} />
          {notice ? <Notice tone="alert" message={notice} /> : null}
        </>
      );
      footer = (
        <View testID="wallet-record-actions" style={{ flexDirection: large ? 'column' : 'row', gap: 8 }}>
          <PageButton testID="wallet-record-edit" kind="main" grow={!large} label={t('records.edit')} disabled={busy} onPress={() => startEditing()} />
          <PageButton testID="wallet-record-copy" kind="quiet" grow={!large} label={t('records.copyToday')} onPress={() => addTray.open({ copyOf: record.id })} />
          <PageButton testID="wallet-record-delete" kind="outline" grow={!large} label={t('records.delete')} disabled={busy} onPress={() => void remove(record)} />
        </View>
      );
    }
  }

  // Every entry has a wallet, or a move's two.
  const walletText = shown ? valueOf(shown.detail, 'wallet') ?? valueOf(shown.detail, 'from_to') ?? '' : '';
  const categoryText = shown ? valueOf(shown.detail, 'category') : null;
  const noteText = shown ? valueOf(shown.detail, 'note') : null;
  // A note quotes the person: in private mode it says it is hidden (R114).
  const shownNote = noteText === null ? null : hidden ? t('records.noteHidden') : noteText;
  const confirmed = shown?.detail.state === 'confirmed';
  const statusText = shown ? shown.detail.stateText ?? tc('Saved') : '';

  return (
    <View testID="wallet-record-screen" style={{ flex: 1, backgroundColor: colors.ground, overflow: 'hidden' }}>
      {shown ? (
        // The amount ghosted large behind the page (bw-record): art, never read, masked in private mode.
        <View {...DECORATIVE} testID="wallet-record-ghost" style={{ position: 'absolute', top: Math.max(0, insets.top - 14), left: 0, right: 0, alignItems: 'center', pointerEvents: 'none' }}>
          <Text
            allowFontScaling={false}
            style={{ fontFamily: LATIN_UI_FONT_FAMILY, fontWeight: '700', fontSize: 110, lineHeight: 112, letterSpacing: -4.4, color: colors.ink, opacity: 0.05, textAlign: 'center' }}
          >
            {hidden ? HIDDEN_AMOUNT : walletMoneyText(shown.amountMinor, { exact: true })}
          </Text>
        </View>
      ) : null}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 24, gap: 12 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <IconButton label={t('common.back')} onPress={goBack}>
            <Glyph d="M15 5l-7 7 7 7" size={16} color={colors.ink} />
          </IconButton>
          {live ? (
            <IconButton label={t('records.more')} disabled={busy} onPress={openActions}>
              <MoreDots color={colors.ink} />
            </IconButton>
          ) : null}
        </View>

        {shown ? (
          <View style={{ alignItems: 'center', gap: 6, marginTop: 6 }}>
            <RecordTile shown={shown} size={64} testID="wallet-record-tile" />
            <WalletText role="h1" accessibilityRole="header" style={{ fontSize: 24, lineHeight: leadingFor(24, locale), textAlign: 'center' }}>
              {title}
            </WalletText>
            <WalletText tone="quietOnGround" style={{ fontSize: 14, lineHeight: leadingFor(14, locale), textAlign: 'center' }}>
              {shortDateWithYear(shown.occurredOn, locale)}
            </WalletText>
            <WalletAmount testID="wallet-record-amount" minor={shown.amountMinor} size={44} exact sign={sign} label={tc(KIND_WORDS[shown.type])} />
          </View>
        ) : null}

        {shown ? (
          <View testID="wallet-record-facts" style={{ backgroundColor: colors.card, borderRadius: 20, overflow: 'hidden' }}>
            <Fact label={t('records.status')} spoken={statusText} first>
              {/* The saved check is neutral (§5.3). */}
              {confirmed ? <Glyph d="M5 12.5l4.5 4.5L19 7.5" size={14} color={colors.ink} width={2.8} /> : null}
              <WalletText role="label" style={{ fontWeight: '400' }}>{statusText}</WalletText>
            </Fact>
            <Fact label={t('records.wallet')} spoken={walletText} first={false}>
              {shown.walletId === null ? null : <WalletSwatch walletId={shown.walletId} />}
              <WalletText role="label" style={{ fontWeight: '400', flexShrink: 1 }}>{walletText}</WalletText>
            </Fact>
            {categoryText === null ? null : (
              <Fact label={t('records.category')} spoken={categoryText} first={false}>
                <WalletText role="label" style={{ fontWeight: '400', flexShrink: 1 }}>{categoryText}</WalletText>
              </Fact>
            )}
            {shownNote === null ? null : (
              <Fact label={t('records.note')} spoken={shownNote} first={false}>
                <WalletText role="label" style={{ fontWeight: '400', flexShrink: 1 }}>{shownNote}</WalletText>
              </Fact>
            )}
          </View>
        ) : null}

        {body}
      </ScrollView>
      {footer ? <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 16 }}>{footer}</View> : null}
      {shown && live ? (
        // Mounted only while the record is live: a delete that lands takes it away with its page actions.
        <RecordActionsTray
          visible={actionsOpen}
          onClose={() => setActionsOpen(false)}
          onClosed={actionsClosed}
          title={title}
          detail={`${walletText} · ${dayLabel(shown.occurredOn, today, locale).text}`}
          amountMinor={shown.amountMinor}
          sign={sign}
          art={<RecordTile shown={shown} size={48} testID="record-actions-tile" />}
          onEdit={() => closeFor('edit')}
          onCopy={() => closeFor('copy')}
          onDelete={() => {
            setActionsOpen(false);
            void remove(live);
          }}
        />
      ) : null}
    </View>
  );
}
