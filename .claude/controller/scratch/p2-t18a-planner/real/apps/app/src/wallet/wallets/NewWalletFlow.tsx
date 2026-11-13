// A new wallet (P2-T21; wc-wallet-type, the fields, bw-adding), in three
// steps:
// 1. The kind (wc-wallet-type): §5.2's four, each with its line, never an
//    e-wallet (W25). A kind starts the wallet on the material its tile is
//    drawn in, with Bun smiling.
// 2. WalletFields: the name, the face, the material, the opening balance on
//    the tray's keypad and the live preview; เพิ่มกระเป๋า creates the wallet.
// 3. The ceremony (bw-adding): the card drops in (walletAddedEntering), the
//    walletAdded moment plays its haptic, and เสร็จ (or close) goes to
//    `returnTo`, else Home.
//
// - Creating is P2-T19's rule (useWalletCommand): one command at a time, held
//   by a ref, so two presses before React draws again send one create and one
//   wallet_added (P2-T19's review, m1). wallet_added carries the look. The
//   look is kept (setLook) after `done` only, so a refused or lost create
//   keeps nothing. One wallet id per flow: a resend names the same wallet,
//   under the same key.
// - An unconfirmed create offers Try again, which sends the same command; a
//   refusal says why, on its field when it names one; one that waits on an
//   update holds เพิ่มกระเป๋า.
// - Step 2's back is held only while a create is out. Once its answer is
//   unknown, a blocked resend's too, back leaves the flow, as step 1's does,
//   and keeps no look (R115): the list reads again on return, so it shows the
//   wallet if the create committed.
// - With no account open no look could be kept (W7): the face and material
//   are not offered, and the preview and the ceremony draw the look the
//   wallet will have, the one derived from its id.
import type { CreateWalletRequest } from '@gogospend/contracts';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { useCopy } from '@mobile/i18n/useCopy';
import { playHaptic } from '@mobile/lib/hapticMoment';
import { useWalletCommand } from '@mobile/screens/redesign/planning/walletCommands';
import type { WalletCommand, WalletTrack } from '@mobile/screens/redesign/planning/walletCommands';
import { newId } from '@mobile/screens/v1/parts';
import { buildCreateWallet, newWalletForm, walletPreview } from '@mobile/spend/v1/redesign/planning/walletsModel';
import type { WalletFieldErrors, WalletForm } from '@mobile/spend/v1/redesign/planning/walletsModel';
import { useDiaryView } from '@mobile/spend/v1/SpendDiaryContext';
import { todayInBangkok } from '@mobile/spend/v1/viewModels';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { materialPaint } from '@mobile/theme/walletPalette';
import type { WalletMaterial } from '@mobile/theme/walletPalette';
import { DECORATIVE, POLITE_LIVE_REGION } from '@mobile/ui/a11y';
import { Glyph } from '@mobile/ui/Glyph';
import { EMPTY_KEYPAD, evaluateKeypad } from '@mobile/ui/keypadExpression';
import type { KeypadState } from '@mobile/ui/keypadExpression';
import { COPY as CARD_COPY } from '../card/copy';
import { WalletCard, walletCardWords } from '../card/WalletCard';
import { COMMON_COPY } from '../common/copy';
import { useDraftCopy } from '../copy/useDraftCopy';
import { IconButton } from '../controls/IconButton';
import { MaterialFill } from '../looks/MaterialFill';
import { useWalletLooks } from '../looks/WalletLooksProvider';
import { derivedLook, WALLET_KINDS } from '../looks/walletLooks';
import type { WalletKind, WalletLook } from '../looks/walletLooks';
import { WalletAmount } from '../money/WalletAmount';
import { useWalletReducedMotion } from '../motion/reducedMotion';
import { walletAddedEntering } from '../motion/useWalletMotion';
import { motionFor } from '../motion/walletMotion';
import { usePrivateMode } from '../privacy/PrivateModeProvider';
import { PrimaryButton } from '../tray/PrimaryButton';
import { TextLink } from '../tray/TextLink';
import { WalletText } from '../WalletText';
import { COPY } from './copy';
import { Chevron } from './ReorderTray';
import { WalletFields } from './WalletFields';

const LINES = { ...COMMON_COPY, ...CARD_COPY, ...COPY } as const;

/** Where the ceremony's เสร็จ goes: the setup checklist (`?setup=1`, P2-T35) or the wallets list it was opened from (P2-T20's add tile); else Home. */
export type NewWalletReturn = '/spend/setup' | '/spend/wallets';

/** Each kind starts on the material its tile is drawn in (wc-wallet-type), with Bun smiling. */
export const KIND_MATERIAL: Readonly<Record<WalletKind, WalletMaterial>> = { cash: 'paper', bank: 'silk', credit_card: 'titanium', transit: 'sky' };

const KIND_WORDS: Readonly<Record<WalletKind, { name: keyof typeof COPY; line: keyof typeof COPY }>> = {
  cash: { name: 'wallets.kindCash', line: 'wallets.kindCashLine' },
  bank: { name: 'wallets.kindBank', line: 'wallets.kindBankLine' },
  credit_card: { name: 'wallets.kindCard', line: 'wallets.kindCardLine' },
  transit: { name: 'wallets.kindTransit', line: 'wallets.kindTransitLine' },
};

type CreateCommand = Extract<WalletCommand, { kind: 'create' }>;

/** A create whose outcome is not settled, or that says why it did not happen. */
type Sending =
  | { phase: 'idle' }
  | { phase: 'saving' }
  | { phase: 'unconfirmed'; command: CreateCommand; track: WalletTrack; message: string; blocked: boolean }
  | { phase: 'problem'; message: string; blocked: boolean };

export function NewWalletFlow({ returnTo, now }: { returnTo?: NewWalletReturn; now?: Date }) {
  const router = useRouter();
  const tc = useCopy();
  const t = useDraftCopy(LINES);
  const { accountId } = useDiaryView();
  const { setLook } = useWalletLooks();
  const commands = useWalletCommand();
  const today = todayInBangkok(now ?? new Date());
  // One wallet id per new wallet, fixed while the flow lives: a resend always names the same wallet.
  const [walletId] = useState(newId);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [look, setChosenLook] = useState<WalletLook>({ kind: null, material: 'silk', face: 'smile' });
  const [form, setForm] = useState<WalletForm>(() => newWalletForm(today));
  const [keypad, setKeypad] = useState<KeypadState>(EMPTY_KEYPAD);
  const [errors, setErrors] = useState<WalletFieldErrors>({});
  const [sending, setSending] = useState<Sending>({ phase: 'idle' });
  const [added, setAdded] = useState<CreateWalletRequest | null>(null);
  // One command at a time, held by a ref: two presses before React draws again send one (P2-T19's review, m1).
  const held = useRef(false);

  // With no account open nothing could be kept: the wallet will have the look derived from its id.
  const shown = accountId === null ? derivedLook(walletId) : look;
  const typed = evaluateKeypad(keypad, { allowZero: true });
  const current: WalletForm = { ...form, openingMinor: typed.ok ? typed.minor : '' };
  const preview = walletPreview(current);
  const locked = sending.phase === 'saving' || sending.phase === 'unconfirmed';
  // P2-T35 adds /spend/setup; until it lands, typed routes do not know it, so the destination is typed by hand here.
  const destination = (returnTo ?? '/spend') as Href;

  // The flow is left once: two quick presses on a back, before React draws again, pop one screen, as the editor's
  // leave() does (P2-T18a, P2-T21's confirming review m2).
  const left = useRef(false);
  const leave = () => {
    if (left.current) return;
    left.current = true;
    if (router.canGoBack()) router.back();
    else router.replace(destination);
  };
  const choose = (kind: WalletKind) => {
    setChosenLook({ kind, material: KIND_MATERIAL[kind], face: 'smile' });
    setStep(2);
  };
  const clear = (field: keyof WalletFieldErrors) => setErrors((previous) => {
    if (previous[field] === undefined) return previous;
    const next = { ...previous };
    delete next[field];
    return next;
  });

  async function send(command: CreateCommand, track: WalletTrack) {
    held.current = true;
    setErrors({});
    setSending({ phase: 'saving' });
    try {
      const outcome = await commands.send(command, track);
      if (outcome.kind === 'done') {
        // Kept only now the wallet is saved, as a fresh object (wallet-looks-unstored's review, n3).
        void setLook(command.input.id, { kind: look.kind, material: look.material, face: look.face });
        setSending({ phase: 'idle' });
        setAdded(command.input);
        setStep(3);
      } else if (outcome.kind === 'unconfirmed') {
        setSending({ phase: 'unconfirmed', command, track, message: outcome.message, blocked: outcome.blocked });
      } else if (outcome.kind === 'refused') {
        setErrors(outcome.fields);
        const named = Object.keys(outcome.fields).length > 0;
        setSending({ phase: 'problem', message: named ? tc('Check the highlighted fields.') : outcome.message ?? tc('This entry could not be saved.'), blocked: outcome.blocked });
      } else {
        // A create meets no other wallet's version; should Jotbun ever answer one, it was not saved.
        setSending({ phase: 'problem', message: tc('This entry could not be saved.'), blocked: false });
      }
    } finally {
      held.current = false;
    }
  }

  function add() {
    if (held.current) return;
    const built = buildCreateWallet(current, { id: walletId, today, tc });
    if (!built.ok) {
      setErrors(built.errors);
      return;
    }
    void send({ kind: 'create', slot: 'create', input: built.input }, { walletType: look.kind, material: shown.material, bunFace: shown.face });
  }

  // Try again: exactly the command whose outcome is unknown, so the same slot and payload go under the same key.
  function retry(pending: Extract<Sending, { phase: 'unconfirmed' }>) {
    if (held.current) return;
    void send(pending.command, pending.track);
  }

  if (step === 3 && added !== null) {
    return <Added input={added} look={shown} onDone={() => router.dismissTo(destination)} />;
  }
  if (step === 1) {
    return (
      <FlowPage back={{ label: t('common.back'), onPress: leave }} step={1}>
        <WalletText role="h1" accessibilityRole="header">{t('wallets.typeQuestion')}</WalletText>
        <WalletText role="body" tone="quietOnGround">{t('wallets.typeHint')}</WalletText>
        <KindList onKind={choose} />
      </FlowPage>
    );
  }
  const unconfirmed = sending.phase === 'unconfirmed' ? sending : null;
  const stuck = sending.phase === 'problem' && sending.blocked;
  const footer = (
    <View style={{ gap: 8 }}>
      {sending.phase === 'unconfirmed' || sending.phase === 'problem' ? (
        <View testID="new-wallet-problem" style={{ gap: 4, alignItems: 'flex-start' }}>
          <WalletText role="label" accessibilityRole="alert">{sending.message}</WalletText>
          {unconfirmed !== null && !unconfirmed.blocked ? (
            <TextLink label={t('common.tryAgain')} onPress={() => retry(unconfirmed)} />
          ) : null}
        </View>
      ) : null}
      <PrimaryButton testID="new-wallet-add" label={t('wallets.add')} busy={sending.phase === 'saving'} busyLabel={tc('Saving…')} disabled={locked || stuck} onPress={add} />
    </View>
  );
  // Back is held only while the create is out. With its answer unknown (Try again, or a blocked resend) it leaves the
  // flow, as step 1's does: back on the kinds could change the look under the pending command (R115, M1).
  const back = unconfirmed === null ? () => setStep(1) : leave;
  return (
    <FlowPage back={{ label: t('common.back'), onPress: back, disabled: sending.phase === 'saving' }} step={2} footer={footer}>
      <WalletText role="h1" accessibilityRole="header">{look.kind === null ? '' : t(KIND_WORDS[look.kind].name)}</WalletText>
      <WalletFields
        form={current}
        onForm={(next) => {
          setForm(next);
          clear('name');
        }}
        look={shown}
        onLook={setChosenLook}
        keypad={keypad}
        onKeypad={(next) => {
          setKeypad(next);
          clear('opening_minor');
        }}
        errors={errors}
        preview={{ id: walletId, name: preview.name ?? '', balanceMinor: preview.balanceMinor }}
        today={today}
        locked={locked}
      />
    </FlowPage>
  );
}

/** A step's page: back and the three-step bar, the step line, the scrolling content and, for the fields, the pinned footer. */
function FlowPage({ back, step, footer, children }: { back: { label: string; onPress(): void; disabled?: boolean }; step: 1 | 2; footer?: ReactNode; children: ReactNode }) {
  const colors = useWalletColors();
  const insets = useSafeAreaInsets();
  const t = useDraftCopy(LINES);
  return (
    <KeyboardAvoidingView testID="new-wallet" behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.ground }}>
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: footer ? 16 : insets.bottom + 24, gap: 14 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <IconButton label={back.label} onPress={back.onPress} disabled={back.disabled}>
            <Glyph name="chevron-left" size={18} color={colors.ink} />
          </IconButton>
          <View {...DECORATIVE} testID="new-wallet-steps" style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
            {[1, 2, 3].map((each) => (
              <View key={each} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: each <= step ? colors.ink : colors.hairline }} />
            ))}
          </View>
        </View>
        <WalletText testID="new-wallet-step" role="label" tone="violet">{t('wallets.newStep', { n: step })}</WalletText>
        {children}
      </ScrollView>
      {footer ? <View style={{ paddingTop: 8, paddingHorizontal: 20, paddingBottom: insets.bottom + 16 }}>{footer}</View> : null}
    </KeyboardAvoidingView>
  );
}

/** wc-wallet-type: the four kinds on one card, then the note. */
function KindList({ onKind }: { onKind(kind: WalletKind): void }) {
  const colors = useWalletColors();
  const t = useDraftCopy(LINES);
  return (
    <>
      <View style={{ borderRadius: 22, overflow: 'hidden', backgroundColor: colors.card }}>
        {WALLET_KINDS.map((kind, index) => {
          const material = KIND_MATERIAL[kind];
          // บัตรเดินทาง names its lines, as the board writes them (BTS / MRT).
          const name = kind === 'transit' ? `${t(KIND_WORDS[kind].name)} ${t('card.kindTransit')}` : t(KIND_WORDS[kind].name);
          const line = t(KIND_WORDS[kind].line);
          return (
            <Pressable
              key={kind}
              testID={`wallet-kind-${kind}`}
              accessibilityRole="button"
              accessibilityLabel={`${name} ${line}`}
              onPress={() => onKind(kind)}
              style={({ pressed }) => ({
                minHeight: 76,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                paddingVertical: 14,
                paddingHorizontal: 16,
                borderBottomWidth: index === WALLET_KINDS.length - 1 ? 0 : 1,
                borderBottomColor: colors.hairline,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <View {...DECORATIVE} style={{ width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}>
                <MaterialFill material={material} radius={14} />
                <KindIcon kind={kind} color={materialPaint(material, colors.isDark).text} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <WalletText role="body" style={{ fontWeight: '700' }}>{name}</WalletText>
                <WalletText role="label" tone="quiet">{line}</WalletText>
              </View>
              <Chevron direction="right" size={12} color={colors.quiet} />
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 2 }}>
        <View {...DECORATIVE} style={{ paddingTop: 2 }}>
          <Svg width={16} height={16} viewBox="0 0 24 24">
            <Circle cx={12} cy={12} r={9} fill="none" stroke={colors.quietOnGround} strokeWidth={1.8} />
            <Path d="M12 11v5.5" fill="none" stroke={colors.quietOnGround} strokeWidth={1.8} strokeLinecap="round" />
            <Circle cx={12} cy={7.8} r={1.2} fill={colors.quietOnGround} />
          </Svg>
        </View>
        <WalletText role="caption" tone="quietOnGround" style={{ flex: 1 }}>{t('wallets.typeNote')}</WalletText>
      </View>
    </>
  );
}

/** wc-wallet-type's kind drawings, 24 pt, in the material's text colour. Decorative: the row says its kind. */
function KindIcon({ kind, color }: { kind: WalletKind; color: string }) {
  const line = { fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      {kind === 'cash' ? (
        <>
          <Rect x={2.5} y={6} width={19} height={12} rx={2} {...line} />
          <Circle cx={12} cy={12} r={2.6} {...line} />
          <Circle cx={6} cy={9.5} r={1} fill={color} />
          <Circle cx={18} cy={14.5} r={1} fill={color} />
        </>
      ) : kind === 'bank' ? (
        <Path d="M3 9.5L12 4l9 5.5 M4.5 9.5h15 M6.5 12v5M10.2 12v5M13.8 12v5M17.5 12v5 M3.5 20h17" {...line} />
      ) : kind === 'credit_card' ? (
        <>
          <Rect x={2.5} y={5.5} width={19} height={13} rx={2.5} {...line} />
          <Path d="M2.5 10h19 M6 15h4" {...line} />
        </>
      ) : (
        <>
          <Path d="M7 3.5h10a3 3 0 0 1 3 3V15a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6.5a3 3 0 0 1 3-3Z M4 10.5h16 M8.5 18l-2 3M15.5 18l2 3" {...line} />
          <Circle cx={8} cy={14.5} r={1.2} fill={color} />
          <Circle cx={16} cy={14.5} r={1.2} fill={color} />
        </>
      )}
    </Svg>
  );
}

/** bw-adding: close, the new card dropping in, เพิ่มกระเป๋าแล้ว with the wallet's name, what it was made with, and เสร็จ. */
function Added({ input, look, onDone }: { input: CreateWalletRequest; look: WalletLook; onDone(): void }) {
  const colors = useWalletColors();
  const insets = useSafeAreaInsets();
  const t = useDraftCopy(LINES);
  const { hidden } = usePrivateMode();
  // The wallet's one reduced-motion answer, read at mount (W6), as every builder takes it.
  const reduced = useWalletReducedMotion();
  const [entering] = useState(() => walletAddedEntering(reduced));
  const card = { id: input.id, name: input.name, balanceMinor: input.opening_minor };
  useEffect(() => {
    // The moment's haptic, once, as the card drops in (ax-motion; the same under Reduce Motion).
    const { haptic } = motionFor('walletAdded', reduced);
    if (haptic !== null) playHaptic(haptic);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View testID="new-wallet" style={{ flex: 1, backgroundColor: colors.ground }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 16, gap: 16 }}>
        <IconButton label={t('common.close')} onPress={onDone}>
          <Glyph name="close" size={16} color={colors.ink} />
        </IconButton>
        {/* The drop's originY is in its parent's coordinates (Reanimated animates it to targetOriginY), so the card
            enters at the origin of a place of its own: it falls 200 pt, about one card's height, and the bouncy spring
            overshoots by about 44 pt (R115, n1). On a phone the place stays the card's parent only if it forms a
            stacking context: a test id alone is flattened away on Fabric, a nativeID is not (P2-T18a, P2-T21's
            confirming review m1). */}
        <View testID="new-wallet-card-place" nativeID="new-wallet-card-place">
          <Animated.View testID="new-wallet-card" entering={entering}>
            <View accessible accessibilityRole="image" accessibilityLabel={walletCardWords(card, look, hidden, t).spoken}>
              <WalletCard wallet={card} look={look} variant="full" />
            </View>
          </Animated.View>
        </View>
        <View testID="new-wallet-added" {...POLITE_LIVE_REGION} style={{ gap: 2 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <WalletText role="h1" accessibilityRole="header">{t('wallets.added')}</WalletText>
            <View {...DECORATIVE}>
              <Svg width={22} height={22} viewBox="0 0 24 24">
                <Path d="M4.5 12.5l5 5L19.5 7" fill="none" stroke={colors.violet} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </View>
          </View>
          <WalletText role="body" tone="quietOnGround">{t('wallets.ready', { name: input.name })}</WalletText>
        </View>
        <View testID="new-wallet-summary" style={{ borderRadius: 16, backgroundColor: colors.card }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
            <WalletText role="body" tone="quiet">{t('wallets.name')}</WalletText>
            <WalletText role="body" style={{ flexShrink: 1 }}>{input.name}</WalletText>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, paddingVertical: 14, paddingHorizontal: 16 }}>
            <WalletText role="body" tone="quiet">{t('wallets.opening')}</WalletText>
            <WalletAmount testID="new-wallet-opening" minor={input.opening_minor} size={17} />
          </View>
        </View>
      </ScrollView>
      <View style={{ paddingTop: 8, paddingHorizontal: 20, paddingBottom: insets.bottom + 16 }}>
        <PrimaryButton testID="new-wallet-done" label={t('common.done')} onPress={onDone} />
      </View>
    </View>
  );
}
