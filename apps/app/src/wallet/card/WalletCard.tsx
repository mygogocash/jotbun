// The wallet card (bw-home, bw-wallet, rh-offline, ax-large-home,
// ax-voiceover). `stack` and `full` are 200 pt on the wallet's material:
// Bun's face and the name top left, the amount top right, in the material's
// text colours; `full` adds the kind line. `spine` is the row the largest text
// sizes use: a 12 pt material spine on the card colour, the name and the
// amount stacked, no face. Every variant shows the pending total while drafts
// are saving, and today's money out when the caller passes it (the stack's
// front card, P2-T12). A credit card at zero or below shows what was spent,
// after ใช้ไป (W25). With onPress the card is one button that says its words
// (ax-voiceover), and VoiceOver's double tap runs onPress itself
// (onAccessibilityTap), because iOS would otherwise tap the card's middle, which
// in the stack lies under the card in front (P2-T12's review, M1); private mode
// masks every amount and the card says only that it is hidden (W10). Nothing
// is clamped to a line, so the longest name and the largest amount wrap at
// every text size (Review Focus 3).
import type { Minor } from '@gogospend/contracts';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import type { ViewStyle } from 'react-native';

import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { materialPaint } from '@mobile/theme/walletPalette';
import { COMMON_COPY } from '../common/copy';
import type { WalletT } from '../copy/draftText';
import { useDraftCopy } from '../copy/useDraftCopy';
import { BunFace } from '../looks/BunFace';
import { MaterialFill } from '../looks/MaterialFill';
import type { WalletKind, WalletLook } from '../looks/walletLooks';
import { WalletAmount } from '../money/WalletAmount';
import { HIDDEN_AMOUNT, spokenMoney, walletMoneyText } from '../money/walletMoney';
import { usePrivateMode } from '../privacy/PrivateModeProvider';
import { WalletText } from '../WalletText';
import { COPY } from './copy';

/** The stack and full cards' height (bw-home). */
export const CARD_HEIGHT = 200;
const CARD_RADIUS = 22;

export type WalletCardModel = {
  id: string;
  name: string;
  /** The wallet's balance in satang: below zero for a credit card's spending. */
  balanceMinor: Minor;
  /** Today's money out; the stack passes it for its front card only. */
  todayOutMinor?: Minor | null;
  /** The total of the drafts still saving. */
  pendingMinor?: Minor | null;
};

export type WalletCardWords = {
  /** What the card's amount draws: a credit card's spending, else the balance. */
  amountMinor: Minor;
  /** ใช้ไป before a credit card's spending; otherwise null. */
  amountPrefix: string | null;
  /** The full card's kind line; null with no kind kept. */
  kindLine: string | null;
  pendingLine: string | null;
  todayLine: string | null;
  /** What a screen reader says for the card. */
  spoken: string;
};

const KIND_LINE: Readonly<Record<WalletKind, keyof typeof COPY>> = {
  cash: 'card.kindCash',
  bank: 'card.kindBank',
  credit_card: 'card.kindCard',
  transit: 'card.kindTransit',
};

const CARD_COPY = { ...COMMON_COPY, ...COPY };

/** The size of a canonical satang string. */
const size = (minor: Minor): Minor => (minor.startsWith('-') ? minor.slice(1) : minor);

/** A pending total or today's money out worth a line: none, null and zero draw nothing. */
const worthALine = (minor: Minor | null | undefined): Minor | null => (minor === undefined || minor === null || minor === '0' ? null : minor);

/** The card's words. `t` reads COMMON_COPY and the card's COPY. */
export function walletCardWords(wallet: WalletCardModel, look: WalletLook, hidden: boolean, t: WalletT): WalletCardWords {
  // A credit card reads what was spent instead of a balance (W25, wc-wallet-type), from zero down.
  const spending = look.kind === 'credit_card' && (wallet.balanceMinor === '0' || wallet.balanceMinor.startsWith('-'));
  const amountMinor = spending ? size(wallet.balanceMinor) : wallet.balanceMinor;
  const pending = worthALine(wallet.pendingMinor);
  const today = worthALine(wallet.todayOutMinor);
  // Each line keeps its place in private mode, so nothing moves (W10); only its amount is masked.
  const pendingLine = pending === null ? null : t('card.pending', { amount: hidden ? HIDDEN_AMOUNT : walletMoneyText(pending) });
  const todayLine = today === null ? null : t('card.todayOut', { amount: hidden ? HIDDEN_AMOUNT : walletMoneyText(today, { sign: 'expense' }) });
  const said = hidden
    ? [wallet.name, t('common.amountHidden')]
    : [
        wallet.name,
        t(spending ? 'card.spokenSpent' : 'card.spokenLeft', { amount: spokenMoney(amountMinor, t) }),
        ...(pending === null ? [] : [t('card.spokenPending', { amount: spokenMoney(size(pending), t) })]),
        ...(today === null ? [] : [t('card.spokenToday', { amount: spokenMoney(size(today), t) })]),
      ];
  return {
    amountMinor,
    amountPrefix: spending ? t('card.spent') : null,
    kindLine: look.kind === null ? null : t(KIND_LINE[look.kind]),
    pendingLine,
    todayLine,
    spoken: said.join(', '),
  };
}

export function WalletCard({ wallet, look, variant, onPress }: {
  wallet: WalletCardModel;
  look: WalletLook;
  variant: 'stack' | 'full' | 'spine';
  onPress?: () => void;
}) {
  const colors = useWalletColors();
  const { hidden } = usePrivateMode();
  const t = useDraftCopy(CARD_COPY);
  const words = walletCardWords(wallet, look, hidden, t);
  const sign = words.amountPrefix === null ? 'balance' : 'none';
  let style: ViewStyle;
  let content: ReactNode;

  if (variant === 'spine') {
    style = { minHeight: 44, borderRadius: CARD_RADIUS, backgroundColor: colors.card, paddingTop: 14, paddingRight: 18, paddingBottom: 16, paddingLeft: 34, gap: 4 };
    content = (
      <>
        <View style={{ position: 'absolute', left: 10, top: 14, bottom: 14, width: 12 }}>
          <MaterialFill material={look.material} radius={6} />
        </View>
        <WalletText role="body" style={{ fontWeight: '700' }}>{wallet.name}</WalletText>
        {words.amountPrefix === null ? null : <WalletText role="caption" tone="quiet">{words.amountPrefix}</WalletText>}
        <WalletAmount minor={words.amountMinor} sign={sign} size={17} />
        {words.pendingLine === null ? null : <WalletText role="caption" tone="quiet">{words.pendingLine}</WalletText>}
        {words.todayLine === null ? null : <WalletText role="caption" tone="quiet">{words.todayLine}</WalletText>}
      </>
    );
  } else {
    const paint = materialPaint(look.material, colors.isDark);
    const full = variant === 'full';
    style = { minHeight: CARD_HEIGHT, borderRadius: CARD_RADIUS, paddingVertical: 16, paddingHorizontal: full ? 18 : 16, justifyContent: 'space-between', gap: 12 };
    content = (
      <>
        <MaterialFill material={look.material} radius={CARD_RADIUS} />
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <BunFace face={look.face} size={full ? 38 : 28} />
            <WalletText role="label" style={{ flex: 1, fontWeight: '700', color: paint.text }}>{wallet.name}</WalletText>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
            {words.amountPrefix === null ? null : <WalletText role="caption" style={{ color: paint.quietText }}>{words.amountPrefix}</WalletText>}
            <WalletAmount minor={words.amountMinor} sign={sign} size={full ? 22 : 16} color={paint.text} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            {full && words.kindLine !== null ? <WalletText role="caption" style={{ fontWeight: '500', color: paint.text }}>{words.kindLine}</WalletText> : null}
            {words.pendingLine === null ? null : <WalletText role="caption" style={{ color: paint.quietText }}>{words.pendingLine}</WalletText>}
          </View>
          {words.todayLine === null ? null : <WalletText role="caption" style={{ fontWeight: '500', color: paint.text }}>{words.todayLine}</WalletText>}
        </View>
      </>
    );
  }

  return onPress === undefined ? (
    <View accessible accessibilityLabel={words.spoken} style={style}>{content}</View>
  ) : (
    <Pressable accessibilityRole="button" accessibilityLabel={words.spoken} onPress={onPress} onAccessibilityTap={onPress} style={style}>{content}</Pressable>
  );
}
