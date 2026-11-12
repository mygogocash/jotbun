// The add tray's transfer step (P2-T15; W14; rh-transfer): money moved between
// the person's own wallets. A transfer goes amount, transfer, confirm (P2-T14's
// stepAfterAmount). TransferStep is the step's middle: the from and to cards,
// each 84 pt on its wallet's material with the wallet's available balance and
// what it holds after the move (balancesAfter, exact in BigInt), the swap
// button between them, the amount being moved, and move all. TransferFooter is
// its footer, which the host passes to the tray's pinned `footer`: the note
// that a move is not spending, and Next, which waits for two different
// wallets in use. Both are controlled (StepProps), as every step is.
//
// - A card opens its wallet step (`from` or `to`), which comes back here
//   (WalletPick's `back`). Swap exchanges the two wallets in the draft, so
//   each card's name, balance and after line follow its own wallet.
// - Balances are the server's (the host's `balances`, less waiting drafts).
//   Offline there are none: the cards show names only, with no after line and
//   no move all, since a guessed balance would be a wrong number on screen
//   (today's WalletPicker). Archived wallets are never shown, as today: a
//   side whose wallet is archived or not listed asks for one, and Next waits
//   for it as for a side with none. The cards and Next read one rule
//   (`inUse`), so they never disagree (R114; the reviews' m1).
// - Move all fills the amount with the from wallet's whole balance, as a fill
//   (filledKeypad). It is offered only when that balance is known, above zero
//   (moveAllMinor) and within the amount cap: keypadFromMinor refuses more,
//   and a record cannot hold it. So a balance above ฿999,999,999.99 offers no
//   move all, and nothing ever says that a hidden balance is above the cap
//   (the P2-T14 review's note).
// - Private mode (W10): the balances, the after lines and move all's amount
//   are stored amounts, so WalletAmount masks them and each card says only
//   that its amount is hidden. The amount line follows the amount step's rule
//   (R106): what the person typed shows, and a fill (move all, Bun's reading)
//   is masked.
// - The swap sits on the seam between the cards, as rh-transfer draws it: the
//   cards are 22 pt apart, so the 44 pt button overlaps only their 11 pt
//   padding and never their words, however long a name runs. At the largest
//   text sizes it takes its own row; each card stacks its amounts under its
//   name, and nothing is clamped (Review Focus 3).
import { MINOR_AMOUNT_MAX } from '@gogospend/contracts';
import type { Minor, WalletSnapshot } from '@gogospend/contracts';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useCopy } from '@mobile/i18n/useCopy';
import { Text } from '@mobile/theme/AppText';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { LATIN_UI_FONT_FAMILY } from '@mobile/theme/uiFontFamily';
import { materialPaint } from '@mobile/theme/walletPalette';
import { amountMaxScale, walletLineHeight } from '@mobile/theme/walletType';
import { DECORATIVE, POLITE_LIVE_REGION, useAnnouncement } from '@mobile/ui/a11y';
import { Glyph } from '@mobile/ui/Glyph';
import { evaluateKeypad, keypadDisplay } from '@mobile/ui/keypadExpression';
import { useLargeText } from '@mobile/ui/largeText';
import { COMMON_COPY } from '../common/copy';
import { IconButton } from '../controls/IconButton';
import { useDraftCopy } from '../copy/useDraftCopy';
import { MaterialFill } from '../looks/MaterialFill';
import { useWalletLooks } from '../looks/WalletLooksProvider';
import { WalletAmount } from '../money/WalletAmount';
import { HIDDEN_AMOUNT, spokenMoney } from '../money/walletMoney';
import { usePrivateMode } from '../privacy/PrivateModeProvider';
import { PrimaryButton } from '../tray/PrimaryButton';
import { WalletText } from '../WalletText';
import { balancesAfter, filledKeypad, isFilled, moveAllMinor } from './addFlow';
import type { StepProps } from './addFlow';
import { COPY } from './copy';

const LINES = { ...COMMON_COPY, ...COPY } as const;

/** The amount being moved (rh-transfer); it grows to 64 pt and no more (W30). */
const AMOUNT = 52;
/** A card's height (rh-transfer); it grows with its words at the largest text sizes. */
const CARD = 84;
/** The cards' gap: the 44 pt swap overlaps each card by 11 pt, its padding (rh-transfer draws 8 and overlaps the words' edge). */
const SEAM = 22;

/** Move all: the from wallet's balance when it is known, above zero and within the amount cap; else null. */
function moveAllOffer(balances: ReadonlyMap<string, Minor> | null, fromId: string | null): Minor | null {
  const all = moveAllMinor(balances, fromId);
  return all !== null && BigInt(all) <= MINOR_AMOUNT_MAX ? all : null;
}

/** A line's words on either side of its `{amount}`, so each language keeps its own order. */
function around(template: string): [string, string] {
  const at = template.indexOf('{amount}');
  if (at < 0) return [template.trim(), ''];
  return [template.slice(0, at).trim(), template.slice(at + '{amount}'.length).trim()];
}

/** A side's wallet while it is in use; null for none, an archived wallet or one not listed. The cards ask for a wallet, and Next waits, by this one rule. */
function inUse(wallets: readonly WalletSnapshot[], id: string | null): WalletSnapshot | null {
  return id === null ? null : wallets.find((wallet) => wallet.id === id && !wallet.archived) ?? null;
}

export function TransferStep({ draft, keypad, onDraft, onKeypad, onStep, wallets, balances }: StepProps & {
  wallets: readonly WalletSnapshot[];
  /** Each wallet's available balance from the server; null offline. */
  balances: ReadonlyMap<string, Minor> | null;
}) {
  const colors = useWalletColors();
  const t = useDraftCopy(LINES);
  const large = useLargeText();
  const { hidden } = usePrivateMode();
  const typed = evaluateKeypad(keypad, { allowZero: true });
  const after = balancesAfter(balances, draft.fromWalletId, draft.toWalletId, typed.ok ? typed.minor : '0');
  const from = inUse(wallets, draft.fromWalletId);
  const to = inUse(wallets, draft.toWalletId);
  const balanceOf = (wallet: WalletSnapshot | null) => (wallet === null || balances === null ? null : balances.get(wallet.id) ?? null);
  const moveAll = moveAllOffer(balances, from?.id ?? null);
  // A fill is masked as a stored amount is; what the person typed shows (R106).
  const masked = hidden && isFilled(keypad);
  const [beforeAll, afterAll] = around(t('add.moveAll'));
  return (
    <View testID="transfer-step" style={{ gap: 12 }}>
      <View>
        <TransferCard testID="transfer-from" role={t('add.rowFrom')} wallet={from} balance={balanceOf(from)} after={from === null ? null : after.from} onPress={() => onStep('from')} />
        {/* On the seam, over the cards' padding only; at the largest text sizes its own row. */}
        <View style={large ? { alignItems: 'center', paddingVertical: 8 } : { height: SEAM, alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
          <IconButton label={t('add.swap')} onPress={() => onDraft({ ...draft, fromWalletId: draft.toWalletId, toWalletId: draft.fromWalletId })}>
            <Glyph name="swap" size={22} color={colors.ink} />
          </IconButton>
        </View>
        <TransferCard testID="transfer-to" role={t('add.rowTo')} wallet={to} balance={balanceOf(to)} after={to === null ? null : after.to} onPress={() => onStep('to')} />
      </View>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <View {...POLITE_LIVE_REGION} style={{ alignSelf: 'stretch' }}>
          <Text
            testID="transfer-amount"
            accessibilityLabel={masked ? t('common.amountHidden') : spokenMoney(typed.ok ? typed.minor : '0', t)}
            maxFontSizeMultiplier={amountMaxScale(AMOUNT)}
            style={{
              fontFamily: LATIN_UI_FONT_FAMILY,
              fontWeight: '700',
              fontSize: AMOUNT,
              lineHeight: walletLineHeight(AMOUNT, 'latin'),
              letterSpacing: masked ? (AMOUNT * 12) / 100 : (AMOUNT * -2) / 100,
              color: colors.ink,
              textAlign: 'center',
            }}
          >
            {masked ? HIDDEN_AMOUNT : `฿${keypadDisplay(keypad)}`}
          </Text>
        </View>
        {moveAll === null ? null : (
          <Pressable
            testID="transfer-move-all"
            accessibilityRole="button"
            accessibilityLabel={t('add.moveAll', { amount: hidden ? t('common.amountHidden') : spokenMoney(moveAll, t) })}
            onPress={() => onKeypad(filledKeypad(moveAll))}
            style={({ pressed }) => ({
              minHeight: 44,
              maxWidth: '100%',
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'center',
              columnGap: 6,
              paddingHorizontal: 16,
              paddingVertical: 4,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: colors.hairline,
              backgroundColor: colors.card,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            {beforeAll === '' ? null : <WalletText role="label">{beforeAll}</WalletText>}
            <WalletAmount minor={moveAll} size={16} />
            {afterAll === '' ? null : <WalletText role="label">{afterAll}</WalletText>}
          </Pressable>
        )}
      </View>
    </View>
  );
}

/**
 * The step's footer, for the tray's pinned `footer`: the note that a move is
 * not spending, and Next. Next reads the sides by the cards' rule (`inUse`).
 * It does not read the amount: the amount is the amount step's, whose Next
 * waits for one the keypad can save, and this step has no keys to change it
 * (the second review's n2).
 */
export function TransferFooter({ draft, onStep, wallets }: StepProps & {
  /** TransferStep's wallets: a side whose wallet is not in use keeps Next waiting, as its card asks for one. */
  wallets: readonly WalletSnapshot[];
}) {
  const colors = useWalletColors();
  const tc = useCopy();
  const t = useDraftCopy(LINES);
  const [from, to] = [inUse(wallets, draft.fromWalletId), inUse(wallets, draft.toWalletId)];
  // One wallet in use on both sides cannot be a move: today's words say so (as WalletPicker does), and Next waits.
  const problem = from !== null && from === to ? tc('Choose two different wallets') : null;
  useAnnouncement(problem);
  return (
    <View style={{ gap: 8 }}>
      {problem === null ? null : (
        <WalletText testID="transfer-problem" role="label" accessibilityRole="alert" aria-live="polite" style={{ textAlign: 'center' }}>
          {problem}
        </WalletText>
      )}
      <View testID="transfer-note" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <View {...DECORATIVE}>
          <Svg width={14} height={14} viewBox="0 0 24 24">
            <Circle cx={12} cy={12} r={9} fill="none" stroke={colors.quiet} strokeWidth={1.9} />
            <Path d="M12 11v6" fill="none" stroke={colors.quiet} strokeWidth={2.2} strokeLinecap="round" />
            <Circle cx={12} cy={7.6} r={1.3} fill={colors.quiet} />
          </Svg>
        </View>
        <WalletText role="caption" tone="quiet" style={{ flexShrink: 1, textAlign: 'center' }}>{t('add.transferNote')}</WalletText>
      </View>
      <PrimaryButton testID="transfer-next" label={t('common.next')} disabled={from === null || to === null || from === to} onPress={() => onStep('confirm')} />
    </View>
  );
}

/** One side of the move: its wallet's material, the side's word, the name, and the balance with what it holds after. */
function TransferCard({ testID, role, wallet, balance, after, onPress }: {
  testID: string;
  role: string;
  wallet: WalletSnapshot | null;
  balance: Minor | null;
  after: Minor | null;
  onPress(): void;
}) {
  const colors = useWalletColors();
  const t = useDraftCopy(LINES);
  const large = useLargeText();
  const { hidden } = usePrivateMode();
  const { lookOf } = useWalletLooks();
  const material = wallet === null ? null : lookOf(wallet.id).material;
  const paint = material === null ? null : materialPaint(material, colors.isDark);
  const ink = paint === null ? colors.ink : paint.text;
  const quiet = paint === null ? colors.quiet : paint.quietText;
  const name = wallet === null ? t('add.chooseWallet') : wallet.name;
  const say = (minor: Minor) => (hidden ? t('common.amountHidden') : spokenMoney(minor, t));
  const label = [role, name, balance === null ? null : say(balance), after === null ? null : t('add.after', { amount: say(after) })]
    .filter((part): part is string => part !== null)
    .join(' ');
  const [beforeAfter, afterAfter] = around(t('add.after'));
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: CARD,
        flexDirection: large ? 'column' : 'row',
        justifyContent: 'space-between',
        gap: large ? 6 : 12,
        paddingVertical: 11,
        paddingHorizontal: 16,
        borderRadius: 18,
        backgroundColor: material === null ? colors.raised : undefined,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {material === null ? null : <MaterialFill material={material} radius={18} />}
      <View style={{ flexShrink: 1, justifyContent: 'space-between', gap: 4 }}>
        <WalletText role="caption" style={{ color: quiet }}>{role}</WalletText>
        <WalletText role="body" style={{ fontWeight: '700', color: ink }}>{name}</WalletText>
      </View>
      {balance === null ? null : (
        <View style={{ alignItems: large ? 'flex-start' : 'flex-end', justifyContent: 'space-between', gap: 4 }}>
          <WalletAmount testID={`${testID}-balance`} minor={balance} sign="balance" size={17} color={ink} />
          {after === null ? null : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 4 }}>
              {beforeAfter === '' ? null : <WalletText role="caption" style={{ color: quiet }}>{beforeAfter}</WalletText>}
              <WalletAmount testID={`${testID}-after`} minor={after} sign="balance" size={13} color={ink} />
              {afterAfter === '' ? null : <WalletText role="caption" style={{ color: quiet }}>{afterAfter}</WalletText>}
            </View>
          )}
        </View>
      )}
    </Pressable>
  );
}
