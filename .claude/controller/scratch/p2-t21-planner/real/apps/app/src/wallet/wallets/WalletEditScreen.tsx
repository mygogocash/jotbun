// Editing a wallet (P2-T21; wc-wallet-edit): back, แก้ไขกระเป๋า and บันทึก
// in the header, then WalletFields (the preview, the name, the face and
// material, the opening balance), and archiving.
//
// - Saving is P2-T19's rule (useWalletCommand), one command at a time, held by
//   a ref. Only what changed is sent, with the version that was read; nothing
//   changed goes back with nothing sent. A correction (a changed opening
//   balance) to a wallet with entries, or not yet known to have none
//   (correctionNeedsReason), opens the correction tray first, and the reason
//   it gives is sent with the correction; closing the tray sends nothing.
// - Looks are kept at once (setLook, a fresh object per press) and need no
//   command; with no account open they are not offered (WalletFields).
// - Archive only at exactly ฿0 (canArchive, the server's rule); otherwise the
//   screen says why, with both amounts (wallets.archiveLater, or its line for
//   a wallet below zero). Archived, the person is taken to the wallets list.
// - An unconfirmed save or archive offers Try again, which sends the same
//   command under the same key. A wallet changed on another device says so,
//   and the form starts over from the wallet as it is now, so nothing the
//   person did not change is sent back. An archive refused because the
//   balance moved says so, and the wallet is read again.
// - An archived or unknown wallet says it is gone (wallet.gone).
import { TRACKING_START_MIN } from '@gogospend/contracts';
import type { WalletCorrectionReason, WalletDto } from '@gogospend/contracts';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';

import { useCopy } from '@mobile/i18n/useCopy';
import type { WalletCommand } from '@mobile/screens/redesign/planning/walletCommands';
import { useWalletCommand } from '@mobile/screens/redesign/planning/walletCommands';
import { useLoad } from '@mobile/screens/v1/parts';
import { classifyLoadProblem } from '@mobile/spend/v1/redesign/homeModel';
import { archiveAdvice, buildWalletUpdate, correctionNeedsReason, walletFormOf, walletPreview } from '@mobile/spend/v1/redesign/planning/walletsModel';
import type { HasRecords, WalletFieldErrors, WalletForm } from '@mobile/spend/v1/redesign/planning/walletsModel';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import { todayInBangkok } from '@mobile/spend/v1/viewModels';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { DECORATIVE } from '@mobile/ui/a11y';
import { Glyph } from '@mobile/ui/Glyph';
import { evaluateKeypad } from '@mobile/ui/keypadExpression';
import type { KeypadState } from '@mobile/ui/keypadExpression';
import { filledKeypad } from '../add/addFlow';
import { COMMON_COPY } from '../common/copy';
import { useDraftCopy } from '../copy/useDraftCopy';
import { IconButton } from '../controls/IconButton';
import { useWalletLooks } from '../looks/WalletLooksProvider';
import { WalletAmount } from '../money/WalletAmount';
import { spokenMoney, walletMoneyText } from '../money/walletMoney';
import { usePrivateMode } from '../privacy/PrivateModeProvider';
import { TextLink } from '../tray/TextLink';
import { WalletText } from '../WalletText';
import { COPY } from './copy';
import { CorrectionTray } from './CorrectionTray';
import { WalletFields } from './WalletFields';

const LINES = { ...COMMON_COPY, ...COPY } as const;

/** A save or an archive whose outcome is not settled, or that says why it did not happen. */
type Sending =
  | { phase: 'idle' }
  | { phase: 'saving' }
  | { phase: 'unconfirmed'; command: WalletCommand; message: string; blocked: boolean }
  | { phase: 'problem'; message: string; blocked: boolean };

export function WalletEditScreen({ walletId, now }: { walletId: string; now?: Date }) {
  const resources = useSpendV1();
  const router = useRouter();
  const colors = useWalletColors();
  const insets = useSafeAreaInsets();
  const tc = useCopy();
  const t = useDraftCopy(LINES);
  const today = todayInBangkok(now ?? new Date());
  const loaded = useLoad(() => resources.wallets(), [resources]);
  // Whether the wallet has entries, which decides whether a correction needs its reason; null while that is not known.
  const records = useLoad(async () => {
    const page = await resources.history({ from: TRACKING_START_MIN, through: today, wallet_id: walletId, sort: 'date_desc' }, undefined, 1);
    return page.summary.count > 0 || page.items.length > 0;
  }, [resources, walletId, today]);
  const hasRecords: HasRecords = records.state === 'ready' ? records.data : null;
  // "Changed on another device" outlives the form, which starts over from the wallet as it is now.
  const [notice, setNotice] = useState<string | null>(null);
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/spend/wallets');
  };
  const wallet = loaded.state === 'ready' ? (loaded.data.find((each) => each.id === walletId && !each.archived) ?? null) : undefined;
  if (wallet) {
    return (
      <EditForm
        key={`${wallet.id}:${wallet.version}`}
        wallet={wallet}
        hasRecords={hasRecords}
        today={today}
        notice={notice}
        onNotice={setNotice}
        onBack={goBack}
        onArchived={() => router.dismissTo('/spend/wallets')}
        onChanged={loaded.refresh}
      />
    );
  }
  return (
    <View testID="wallet-edit" style={{ flex: 1, backgroundColor: colors.ground }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 18, paddingBottom: insets.bottom + 24, gap: 14 }}>
        <EditHeader title={t('wallets.editTitle')} onBack={goBack} />
        {loaded.state === 'loading' ? <WalletText testID="wallet-edit-loading" role="label" tone="quietOnGround">{tc('Loading your wallets')}</WalletText> : null}
        {loaded.state === 'error' ? <LoadProblem error={loaded.error} onRetry={loaded.reload} /> : null}
        {wallet === null ? (
          <View testID="wallet-edit-gone" style={{ gap: 4, padding: 16, borderRadius: 22, backgroundColor: colors.card }}>
            {notice === null ? null : <WalletText role="label">{notice}</WalletText>}
            <WalletText accessibilityRole="alert">{t('wallet.gone')}</WalletText>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function EditForm({ wallet, hasRecords, today, notice, onNotice, onBack, onArchived, onChanged }: {
  wallet: WalletDto;
  hasRecords: HasRecords;
  today: string;
  notice: string | null;
  onNotice(notice: string | null): void;
  onBack(): void;
  onArchived(): void;
  onChanged(): void;
}) {
  const colors = useWalletColors();
  const insets = useSafeAreaInsets();
  const tc = useCopy();
  const t = useDraftCopy(LINES);
  const commands = useWalletCommand();
  const { lookOf, setLook } = useWalletLooks();
  const [form, setForm] = useState<WalletForm>(() => walletFormOf(wallet));
  // The opening balance as Jotbun holds it: masked in private mode until a key is pressed, and the first key starts it over (R106).
  const [keypad, setKeypad] = useState<KeypadState>(() => filledKeypad(wallet.opening_minor));
  const [errors, setErrors] = useState<WalletFieldErrors>({});
  const [sending, setSending] = useState<Sending>({ phase: 'idle' });
  const [asking, setAsking] = useState(false);
  const [archiveRefused, setArchiveRefused] = useState(false);
  // One command at a time, held by a ref: two presses before React draws again send one.
  const held = useRef(false);

  const typed = evaluateKeypad(keypad, { allowZero: true });
  const current: WalletForm = { ...form, openingMinor: typed.ok ? typed.minor : '' };
  const preview = walletPreview(current, wallet);
  const locked = sending.phase === 'saving' || sending.phase === 'unconfirmed';
  const stuck = sending.phase === 'problem' && sending.blocked;

  const clear = (field: keyof WalletFieldErrors) => setErrors((previous) => {
    if (previous[field] === undefined) return previous;
    const next = { ...previous };
    delete next[field];
    return next;
  });

  async function send(command: WalletCommand) {
    held.current = true;
    setSending({ phase: 'saving' });
    setArchiveRefused(false);
    onNotice(null);
    try {
      const outcome = await commands.send(command);
      if (outcome.kind === 'done') {
        setSending({ phase: 'idle' });
        if (command.kind === 'archive') onArchived();
        else onBack();
      } else if (outcome.kind === 'unconfirmed') {
        setSending({ phase: 'unconfirmed', command, message: outcome.message, blocked: outcome.blocked });
      } else if (outcome.kind === 'conflict') {
        // Changed on another device: say so, and read it again; a newer version starts the form over.
        setSending({ phase: 'idle' });
        onNotice(tc('This wallet changed on another device.'));
        onChanged();
      } else if (outcome.archiveRefused) {
        // The balance moved since it was read: say so, and read it again.
        setSending({ phase: 'idle' });
        setArchiveRefused(true);
        onChanged();
      } else if (outcome.needsReason) {
        // Jotbun wants the correction's reason: ask for it.
        setSending({ phase: 'idle' });
        setAsking(true);
      } else {
        setErrors(outcome.fields);
        const named = Object.keys(outcome.fields).length > 0;
        setSending({ phase: 'problem', message: named ? tc('Check the highlighted fields.') : outcome.message ?? tc('This entry could not be saved.'), blocked: outcome.blocked });
      }
    } finally {
      held.current = false;
    }
  }

  function save(reason: WalletCorrectionReason | null = form.reason) {
    if (held.current) return;
    const fields: WalletForm = { ...current, reason };
    // A correction to a wallet with entries (or not yet known to have none) asks why first; nothing is sent yet.
    if (reason === null && correctionNeedsReason(wallet, fields, hasRecords)) {
      setAsking(true);
      return;
    }
    const built = buildWalletUpdate(wallet, fields, { today, tc, hasRecords });
    if (!built.ok) {
      setErrors(built.errors);
      return;
    }
    if (built.unchanged) {
      onBack();
      return;
    }
    setErrors({});
    void send({ kind: 'update', slot: `edit:${built.id}`, id: built.id, version: built.version, changes: built.changes });
  }

  const answer = (reason: WalletCorrectionReason) => {
    setAsking(false);
    setForm((previous) => ({ ...previous, reason }));
    save(reason);
  };
  const archive = () => {
    if (held.current) return;
    void send({ kind: 'archive', slot: `archive:${wallet.id}`, id: wallet.id, version: wallet.version });
  };
  // Try again: exactly the command whose outcome is unknown, so it goes under the same key.
  const retry = (command: WalletCommand) => {
    if (held.current) return;
    void send(command);
  };

  return (
    <View testID="wallet-edit" style={{ flex: 1, backgroundColor: colors.ground }}>
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 18, paddingBottom: insets.bottom + 24, gap: 14 }}
      >
        <EditHeader
          title={t('wallets.editTitle')}
          onBack={onBack}
          action={<SaveButton label={t('common.save')} busy={sending.phase === 'saving'} busyLabel={tc('Saving…')} disabled={locked || stuck} onPress={() => save()} />}
        />
        {notice === null ? null : <WalletText testID="wallet-edit-notice" role="label" accessibilityRole="alert">{notice}</WalletText>}
        {sending.phase === 'unconfirmed' || sending.phase === 'problem' ? (
          <View testID="wallet-edit-problem" style={{ gap: 4, alignItems: 'flex-start' }}>
            <WalletText role="label" accessibilityRole="alert">{sending.message}</WalletText>
            {sending.phase === 'unconfirmed' && !sending.blocked ? <TextLink label={t('common.tryAgain')} onPress={() => retry(sending.command)} /> : null}
          </View>
        ) : null}
        <WalletFields
          form={current}
          onForm={(next) => {
            setForm(next);
            clear('name');
          }}
          look={lookOf(wallet.id)}
          onLook={(next) => void setLook(wallet.id, { kind: next.kind, material: next.material, face: next.face })}
          keypad={keypad}
          onKeypad={(next) => {
            setKeypad(next);
            clear('opening_minor');
          }}
          errors={errors}
          preview={{ id: wallet.id, name: preview.name ?? '', balanceMinor: preview.balanceMinor }}
          today={today}
          locked={locked}
        />
        {hasRecords === true ? <WalletText testID="wallet-has-records" role="caption" tone="quietOnGround">{t('wallets.hasRecords')}</WalletText> : null}
        <Archiving wallet={wallet} refused={archiveRefused} disabled={locked} onArchive={archive} />
      </ScrollView>
      <CorrectionTray visible={asking} onClose={() => setAsking(false)} onReason={answer} />
    </View>
  );
}

/** wc-wallet-edit's header: back, the title, and the screen's action (บันทึก) when there is one. */
function EditHeader({ title, onBack, action }: { title: string; onBack(): void; action?: ReactNode }) {
  const colors = useWalletColors();
  const t = useDraftCopy(LINES);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <IconButton label={t('common.back')} onPress={onBack}>
        <Glyph name="chevron-left" size={18} color={colors.ink} />
      </IconButton>
      <WalletText role="h2" accessibilityRole="header" style={{ flex: 1, textAlign: 'center' }}>{title}</WalletText>
      {action ?? <View style={{ width: 44 }} />}
    </View>
  );
}

/** บันทึก: a 44 pt pill in the main button's colours (wc-wallet-edit). Busy, it says its busy label and ignores presses. */
function SaveButton({ label, busy, busyLabel, disabled, onPress }: { label: string; busy: boolean; busyLabel: string; disabled: boolean; onPress(): void }) {
  const colors = useWalletColors();
  const words = busy ? busyLabel : label;
  return (
    <Pressable
      testID="wallet-edit-save"
      accessibilityRole="button"
      accessibilityLabel={words}
      accessibilityState={{ disabled, busy }}
      aria-disabled={disabled}
      aria-busy={busy}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 18,
        borderRadius: 22,
        backgroundColor: colors.primary,
        opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
      })}
    >
      <WalletText role="label" tone="onPrimary" style={{ fontWeight: '700' }}>{words}</WalletText>
    </Pressable>
  );
}

/** Archive at exactly ฿0 (the server's rule); otherwise why not, with both amounts. */
function Archiving({ wallet, refused, disabled, onArchive }: { wallet: WalletDto; refused: boolean; disabled: boolean; onArchive(): void }) {
  const colors = useWalletColors();
  const tc = useCopy();
  const t = useDraftCopy(LINES);
  const advice = archiveAdvice(wallet);
  return (
    <View style={{ gap: 4, paddingTop: 4 }}>
      {refused ? (
        <WalletText testID="wallet-archive-refused" role="label" accessibilityRole="alert">
          {tc("{name} wasn't archived: its balance is no longer {zero}.", { name: wallet.name, zero: walletMoneyText('0') })}
        </WalletText>
      ) : null}
      {advice.kind === 'can_archive' ? (
        <Pressable
          testID="wallet-archive"
          accessibilityRole="button"
          accessibilityLabel={t('wallets.archive')}
          accessibilityState={{ disabled }}
          aria-disabled={disabled}
          disabled={disabled}
          onPress={onArchive}
          style={({ pressed }) => ({ minHeight: 44, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 8, paddingHorizontal: 4, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 })}
        >
          <View {...DECORATIVE}>
            <Svg width={18} height={18} viewBox="0 0 24 24">
              <Rect x={3} y={4} width={18} height={5} rx={1.5} fill="none" stroke={colors.ink} strokeWidth={1.8} />
              <Path d="M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9 M10 13h4" fill="none" stroke={colors.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </View>
          <WalletText role="body" style={{ fontWeight: '500' }}>{t('wallets.archive')}</WalletText>
        </Pressable>
      ) : advice.kind === 'holds_money' || advice.kind === 'below_zero' ? (
        <ArchiveLater balanceMinor={advice.balanceMinor} below={advice.kind === 'below_zero'} />
      ) : null}
    </View>
  );
}

/** เก็บได้เมื่อยอดเหลือ ฿0 ตอนนี้มี ฿24,860 ...: the sentence, with both amounts drawn as amounts, and its own spoken words. */
function ArchiveLater({ balanceMinor, below }: { balanceMinor: string; below: boolean }) {
  const colors = useWalletColors();
  const t = useDraftCopy(LINES);
  const { hidden } = usePrivateMode();
  const key = below ? 'wallets.archiveLaterBelow' : 'wallets.archiveLater';
  // Below zero the line says ติดลบ, so the amount is its size.
  const size = below ? balanceMinor.slice(1) : balanceMinor;
  const said = t(key, { zero: hidden ? t('common.amountHidden') : spokenMoney('0', t), amount: hidden ? t('common.amountHidden') : spokenMoney(size, t) });
  return (
    <WalletText testID="wallet-archive-later" role="caption" tone="quietOnGround" accessibilityLabel={said}>
      {t(key).split(/(\{zero\}|\{amount\})/).map((part, index) => {
        if (part === '{zero}') return <WalletAmount key={index} minor="0" size={13} color={colors.quietOnGround} />;
        if (part === '{amount}') return <WalletAmount key={index} minor={size} size={13} color={colors.quietOnGround} />;
        return part;
      })}
    </WalletText>
  );
}

/** A load problem in today's words, with Try again when trying again can help. */
function LoadProblem({ error, onRetry }: { error: unknown; onRetry(): void }) {
  const colors = useWalletColors();
  const tc = useCopy();
  const t = useDraftCopy(LINES);
  const problem = classifyLoadProblem(error, tc);
  return (
    <View testID="wallet-edit-problem" style={{ gap: 4, alignItems: 'flex-start', padding: 16, borderRadius: 22, backgroundColor: colors.card }}>
      <WalletText accessibilityRole="alert">{problem.message}</WalletText>
      {problem.retry ? <TextLink label={t('common.tryAgain')} onPress={onRetry} /> : null}
    </View>
  );
}
