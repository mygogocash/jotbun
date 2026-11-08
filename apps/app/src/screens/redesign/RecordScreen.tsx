// The redesigned record detail (R3, /spend/record/[id]): one entry as a
// receipt slip, with Edit, Copy and Delete (with undo). The rules live in
// useRecordActions; this screen only renders them.
import type { Minor, TransactionDto } from '@gogospend/contracts';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { V1Error } from '@mobile/api/client';
import { useCopy } from '@mobile/i18n/useCopy';
import { formatMinor } from '@mobile/spend/v1/money';
import { recentlyDeletedModel } from '@mobile/spend/v1/redesign/historyModel';
import { classifyLoadProblem } from '@mobile/spend/v1/redesign/homeModel';
import { conflictModel, recordDetail } from '@mobile/spend/v1/redesign/recordModel';
import type { DetailContext, EditDraft, RecordDetail } from '@mobile/spend/v1/redesign/recordModel';
import { dateTagFor } from '@mobile/spend/v1/redesign/shared';
import type { Lookups, RowState } from '@mobile/spend/v1/redesign/shared';
import { useDiaryView } from '@mobile/spend/v1/SpendDiaryContext';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { POLITE_LIVE_REGION, useAnnouncement } from '@mobile/ui/a11y';
import type { AmountState } from '@mobile/ui/Amount';
import { BunText } from '@mobile/ui/BunText';
import { DateChip } from '@mobile/ui/DateChip';
import { fullDateLabel } from '@mobile/ui/dateStep';
import { Keypad } from '@mobile/ui/Keypad';
import { evaluateKeypad, keypadDisplay, keypadHasOperator } from '@mobile/ui/keypadExpression';
import type { KeypadState } from '@mobile/ui/keypadExpression';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE } from '@mobile/ui/layout';
import { NoteField } from '@mobile/ui/NoteField';
import { PillButton } from '@mobile/ui/PillButton';
import { ReceiptRow, ReceiptSlip, ReceiptTotal } from '@mobile/ui/ReceiptSlip';
import { UndoBar } from '@mobile/ui/UndoBar';
import { useMoneyLocale } from '../v1/parts';
import { StageHeader } from '@mobile/ui/StageHeader';
import { useLargeText } from '@mobile/ui/largeText';
import { ActionFooter, ActionRow, EntryPage } from './ActionFooter';
import { RecordReceipt } from './import/RecordReceipt';
import { LoadingBlock, Notice, copyHref, useDateLocale, useGoBack } from './HistoryParts';
import { KEYPAD_PROBLEM_TEXT, earliestDate, lookupsOf, useRecordActions } from './record/recordActions';
import type { RecordEditing } from './record/recordActions';

export type RecordScreenProps = {
  id: string;
  /** `edit` opens straight into the edit mode (History's Edit action). */
  mode?: 'view' | 'edit';
  now?: Date;
};

/** The amount's state word matches the Status row: a draft being checked says "checking", not "saving". */
const AMOUNT_STATE: Readonly<Record<RowState, AmountState>> = {
  confirmed: 'confirmed', saving: 'saving', checking: 'checking', update_to_send: 'saving', needs_look: 'conflict',
};

/** A problem said in words, in ink and bold: red is kept for over budget. */
function FieldProblem({ message }: { message: string }) {
  return <BunText accessibilityRole="alert" variant="caption" style={{ fontWeight: '700' }}>{message}</BunText>;
}

function Receipt({ detail, minor, date }: { detail: RecordDetail; minor: Minor; date: string }) {
  const dateLocale = useDateLocale();
  const amount = detail.rows.find((row) => row.key === 'amount');
  return (
    <ReceiptSlip title={detail.title}>
      {detail.rows.filter((row) => row.key !== 'amount').map((row) => (
        // The kit's date words read in all three languages (Thai Buddhist-era years, Vietnamese words).
        <ReceiptRow key={row.key} label={row.label} value={row.key === 'date' ? fullDateLabel(date, dateLocale) : row.value} />
      ))}
      {amount ? <ReceiptTotal label={amount.label} minor={minor} type={detail.type} state={AMOUNT_STATE[detail.state]} /> : null}
    </ReceiptSlip>
  );
}

export function RecordScreen({ id, mode = 'view', now }: RecordScreenProps) {
  const router = useRouter();
  const tc = useCopy();
  const locale = useMoneyLocale();
  const insets = useSafeAreaInsets();
  const diaryView = useDiaryView();
  const goBack = useGoBack();
  const {
    today, draftCommand, loaded, editing, deleted, pending, gone, notice, busy,
    load, startEditing, cancelEditing, changeEditing, pressKey, submitEdit, remove, restore, settleDraft,
  } = useRecordActions({ id, mode, now });

  const context = (lookups: Lookups): DetailContext => ({ lookups, tc, locale, dateTag: dateTagFor(locale) });
  const editHeading = editing && !editing.conflict;
  const showBack = !editing;

  let body: ReactNode;
  // While editing: the message and the actions, pinned under the scrolling form (ActionFooter.tsx).
  let footer: ReactNode = null;
  if (draftCommand) {
    const detail = recordDetail({ kind: 'draft', command: draftCommand }, context(lookupsOf(diaryView.wallets, diaryView.categories)));
    body = (
      <>
        <Receipt detail={detail} minor={draftCommand.payload.amount_minor} date={draftCommand.payload.occurred_on} />
        {notice ? <Notice tone="alert" message={notice} /> : null}
        <View style={{ gap: BUN_SPACE.sm }}>
          <PillButton kind="secondary" label={tc('Copy')} onPress={() => router.push(copyHref(detail.recordId))} />
          {detail.actions.undo ? <PillButton kind="secondary" label={tc('Remove')} onPress={() => void settleDraft(draftCommand.commandId, 'remove')} /> : null}
          {detail.actions.discard ? <PillButton kind="secondary" label={tc('Discard')} onPress={() => void settleDraft(draftCommand.commandId, 'discard')} /> : null}
        </View>
      </>
    );
  } else if (loaded.state === 'loading') {
    body = <LoadingBlock label={tc('Loading your diary')} />;
  } else if (loaded.state === 'error') {
    const missing = loaded.error instanceof V1Error && (loaded.error.outcome === 'not_found' || loaded.error.outcome === 'deleted');
    const problem = classifyLoadProblem(loaded.error, tc);
    body = missing
      ? <Notice tone="alert" message={gone ? tc('This entry was deleted on another device.') : tc("This entry isn't in your diary.")} />
      : <Notice tone="alert" message={problem.message} action={problem.retry ? { label: tc('Try again'), onPress: () => void load() } : undefined} />;
  } else {
    const { record, wallets, categories } = loaded;
    const lookups = lookupsOf(wallets, categories);
    const detail = recordDetail({ kind: 'confirmed', record }, context(lookups));
    const frozen = pending !== null;
    if (deleted) {
      // Deleted here: the receipt stays for reference and the undo bar restores it.
      body = (
        <>
          <Receipt detail={detail} minor={record.amount_minor} date={record.occurred_on} />
          {notice ? <Notice tone="alert" message={notice} /> : null}
        </>
      );
    } else if (record.deleted_at || gone) {
      const restorable = record.deleted_at
        ? recentlyDeletedModel({ records: [record], now: now ?? new Date(), lookups, tc, locale }).rows[0]
        : undefined;
      body = (
        <>
          <Notice tone="alert" message={gone ? tc('This entry was deleted on another device.') : tc('This entry was already deleted.')} />
          {notice ? <Notice tone="alert" message={notice} /> : null}
          {restorable ? (
            <View style={{ gap: BUN_SPACE.xs }}>
              <BunText tone="muted">{restorable.daysLeftText}</BunText>
              <PillButton label={pending === 'restore' ? tc('Try again') : tc('Restore')} busy={busy} onPress={() => void restore({ id: record.id, version: restorable.version })} />
            </View>
          ) : null}
        </>
      );
    } else if (editing?.conflict) {
      body = <ConflictPanel editing={editing} server={editing.conflict} context={context(lookups)} busy={busy}
        onApply={() => void submitEdit()}
        onReload={() => {
          cancelEditing();
          void load();
        }} />;
    } else if (editing) {
      const keypadProblem = editing.keypad.problem ? tc(KEYPAD_PROBLEM_TEXT[editing.keypad.problem]) : null;
      const amountProblem = keypadProblem ?? editing.errors.amount_minor ?? null;
      const locked = editing.unconfirmed;
      const setDraft = (patch: Partial<EditDraft>) => changeEditing((current) => ({ ...current, draft: { ...current.draft, ...patch }, errors: {} }));
      body = (
        <View style={{ gap: BUN_SPACE.md }}>
          <AmountLine keypad={editing.keypad} />
          {amountProblem ? <FieldProblem message={amountProblem} /> : null}
          <View style={{ gap: BUN_SPACE.xxs }}>
            <BunText variant="caption" tone="muted">{tc('Date')}</BunText>
            <DateChip value={editing.draft.occurredOn} today={today} earliest={earliestDate(record, wallets)} disabled={locked} onChange={(occurredOn) => setDraft({ occurredOn })} />
            {editing.errors.occurred_on ? <FieldProblem message={editing.errors.occurred_on} /> : null}
          </View>
          <NoteField kind="note" value={editing.draft.note} editable={!locked} error={editing.errors.note} onChangeText={(note) => setDraft({ note })} />
          <NoteField kind="merchant" value={editing.draft.merchant} editable={!locked} error={editing.errors.merchant} onChangeText={(merchant) => setDraft({ merchant })} />
          <Keypad onKey={pressKey} disabled={locked || busy} />
        </View>
      );
      footer = (
        <ActionFooter testID="record-edit-footer">
          {editing.message ? <Notice tone="alert" message={editing.message} /> : null}
          {locked ? (
            <PillButton label={tc('Try again')} busy={busy} onPress={() => void submitEdit()} />
          ) : (
            <ActionRow
              secondary={<PillButton kind="secondary" label={tc('Cancel')} disabled={busy} onPress={() => cancelEditing()} />}
              primary={<PillButton label={tc('Save changes')} busy={busy} onPress={() => void submitEdit()} />}
            />
          )}
        </ActionFooter>
      );
    } else {
      body = (
        <>
          <Receipt detail={detail} minor={record.amount_minor} date={record.occurred_on} />
          <RecordReceipt recordId={record.id} version={record.version} attachmentId={record.attachment_id ?? null} onChanged={() => void load()} />
          {notice ? (
            <Notice tone="alert" message={notice} action={pending === 'delete' ? { label: tc('Try again'), busy, onPress: () => void remove(record) } : undefined} />
          ) : null}
          {frozen ? null : (
            <View style={{ gap: BUN_SPACE.sm }}>
              <PillButton label={tc('Edit')} disabled={busy} onPress={() => startEditing()} />
              <PillButton kind="secondary" label={tc('Copy')} onPress={() => router.push(copyHref(record.id))} />
              <PillButton kind="secondary" label={tc('Delete')} busy={busy} onPress={() => void remove(record)} />
            </View>
          )}
        </>
      );
    }
  }

  return (
    <EntryPage testID="record-screen">
      <ScrollView testID="record-scroll" style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: footer ? BUN_SPACE.sm : BUN_SPACE.xl, gap: BUN_SPACE.md }} keyboardShouldPersistTaps="handled">
        {/* The stage names the screen; Back is its own 44 pt button there, left out while editing (Cancel leaves the edit). */}
        <StageHeader title={editHeading ? tc('Edit entry') : tc('Entry')} back={showBack ? { onPress: goBack } : undefined} />
        <View style={{ paddingHorizontal: BUN_SPACE.md, gap: BUN_SPACE.md }}>{body}</View>
      </ScrollView>
      {deleted ? (
        <View style={{ paddingHorizontal: BUN_SPACE.md, paddingBottom: insets.bottom + BUN_SPACE.md }}>
          <UndoBar message={tc('Entry deleted')} onUndo={() => void restore(deleted)} />
        </View>
      ) : null}
      {footer}
    </EntryPage>
  );
}

/**
 * The keypad's amount as it is typed, spoken as the exact amount whenever it
 * is one. A sum shows what was typed and, as Quick add does, its exact
 * result live ("100 ÷ 3" then "฿33.33"), so what Save sends is never a
 * surprise. It is a polite live region.
 */
function AmountLine({ keypad }: { keypad: KeypadState }) {
  const tc = useCopy();
  const locale = useMoneyLocale();
  const display = keypadDisplay(keypad);
  const sum = keypadHasOperator(keypad);
  const outcome = evaluateKeypad(keypad, { allowZero: sum });
  const result = outcome.ok ? formatMinor(outcome.minor, locale) : null;
  const value = sum ? (result ? `${display} = ${result}` : display) : (result ?? display);
  return (
    <View testID="edit-amount" {...POLITE_LIVE_REGION} accessible accessibilityLabel={tc('{label}, {value}', { label: tc('Amount'), value })} style={{ gap: BUN_SPACE.xxs }}>
      <BunText variant="caption" tone="muted">{tc('Amount')}</BunText>
      {sum || display.includes('.') ? <BunText variant="label" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>{display}</BunText> : null}
      <BunText variant="hero" style={{ fontVariant: ['tabular-nums'] }}>{result ?? (sum ? display : `฿${display}`)}</BunText>
    </View>
  );
}

/** "Yours" against "On the server", field by field, with Reload or an explicit "Apply my change". */
function ConflictPanel({ editing, server, context, busy, onApply, onReload }: {
  editing: RecordEditing; server: TransactionDto; context: DetailContext; busy: boolean; onApply: () => void; onReload: () => void;
}) {
  const tc = useCopy();
  const colors = useBunColors();
  const dateLocale = useDateLocale();
  const large = useLargeText();
  const model = conflictModel(editing.draft, server, context);
  useAnnouncement(model.message);
  if (model.kind === 'deleted') return <Notice tone="alert" message={model.message} />;
  const full = (date: string) => fullDateLabel(date, dateLocale);
  const rows = model.rows.map((row) => (row.key === 'date' ? { ...row, yours: full(row.youChanged ? editing.draft.occurredOn : server.occurred_on), server: full(server.occurred_on) } : row));
  const replaces = tc('Applying your change replaces this.');
  return (
    <View
      testID="conflict"
      {...POLITE_LIVE_REGION}
      style={{ gap: BUN_SPACE.sm, padding: BUN_SPACE.md, borderRadius: BUN_RADIUS.card, borderWidth: BUN_OUTLINE.card, borderColor: colors.ink, backgroundColor: colors.card }}
    >
      <BunText variant="heading" role="heading" accessibilityRole="header">{model.message}</BunText>
      {large ? null : (
        <View aria-hidden style={{ flexDirection: 'row', gap: BUN_SPACE.sm }}>
          <BunText variant="label" style={{ flex: 1, fontWeight: '700' }}>{model.yoursLabel}</BunText>
          <BunText variant="label" style={{ flex: 1, fontWeight: '700' }}>{model.serverLabel}</BunText>
        </View>
      )}
      {rows.map((row) => {
        const spoken = tc('{label}. {yoursLabel}: {yours}. {serverLabel}: {server}.', { label: row.label, yoursLabel: model.yoursLabel, yours: row.yours, serverLabel: model.serverLabel, server: row.server });
        return (
          <View key={row.key} accessible accessibilityLabel={row.differs ? `${spoken} ${replaces}` : spoken} style={{ gap: BUN_SPACE.xxs, paddingTop: BUN_SPACE.xs, borderTopWidth: BUN_OUTLINE.rule, borderColor: colors.rule }}>
            <BunText variant="caption" tone="muted">{row.label}</BunText>
            {large ? (
              // At the accessibility text sizes the two values stack, each named, so an amount stays whole.
              <View style={{ gap: BUN_SPACE.xxs }}>
                <BunText variant="label" style={{ fontWeight: '700' }}>{model.yoursLabel}</BunText>
                <BunText style={{ fontWeight: row.differs ? '700' : '400' }}>{row.yours}</BunText>
                <BunText variant="label" style={{ fontWeight: '700' }}>{model.serverLabel}</BunText>
                <BunText>{row.server}</BunText>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: BUN_SPACE.sm }}>
                <BunText style={{ flex: 1, fontWeight: row.differs ? '700' : '400' }}>{row.yours}</BunText>
                <BunText style={{ flex: 1 }}>{row.server}</BunText>
              </View>
            )}
            {row.differs ? <BunText variant="caption">{replaces}</BunText> : null}
          </View>
        );
      })}
      <View style={{ gap: BUN_SPACE.sm }}>
        <PillButton label={model.keepMine} busy={busy} onPress={onApply} />
        <PillButton kind="secondary" label={tc('Reload')} disabled={busy} onPress={onReload} />
      </View>
    </View>
  );
}
