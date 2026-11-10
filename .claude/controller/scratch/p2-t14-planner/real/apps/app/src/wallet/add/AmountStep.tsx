// The add tray's amount step (P2-T14; W14, W15, W29; bw-tray-amount,
// rh-income, ax-large-tray). AmountStep is the step's middle: the amount at
// 58 pt from what the keypad holds; the wallet the money comes from (spending)
// or goes into (income), which opens the wallet step; บอกบัน when Bun can help
// (P2-T16 opens today's Tell Bun sheet from it); income's name and that income
// is not counted in the budget; and up to three quick chips. AmountFooter is
// its footer, which the host passes to the tray's pinned `footer`: the keypad,
// the keypad's problem in today's words, and Next, which waits for an amount
// the keypad can save. Both are controlled (StepProps), so the edit tray
// (P2-T27) reuses them.
//
// - What the person types is never masked: private mode hides stored amounts,
//   such as the chips', not the amount being typed (the controller's P2-T14
//   ruling).
// - At the largest text sizes (ax-large-tray) the tray is full height, the
//   keypad and Next stay pinned in its footer and only the middle scrolls; the
//   amount opens at the middle's top, grows to 64 pt and wraps; the wallet
//   chip and the chips become full-width rows.
// - Tell Bun is for spending and income, as Quick add offers it; a transfer's
//   amount stands alone, and its Next goes on to choose the two wallets.
// - No photo row (W15): the receipt stays the record's.
import { MERCHANT_MAX_CHARS } from '@gogospend/contracts';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { isRedesignEnabled } from '@mobile/config/featureFlags';
import { useAiCompanion } from '@mobile/spend/v1/ai/AiCompanionProvider';
import type { Lookups } from '@mobile/spend/v1/redesign/shared';
import { Text, TextInput } from '@mobile/theme/AppText';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { LATIN_UI_FONT_FAMILY, THAI_UI_FONT_FAMILY } from '@mobile/theme/uiFontFamily';
import { amountMaxScale, WALLET_TYPE, walletLineHeight } from '@mobile/theme/walletType';
import { DECORATIVE, POLITE_LIVE_REGION, useAnnouncement } from '@mobile/ui/a11y';
import { evaluateKeypad, keypadDisplay } from '@mobile/ui/keypadExpression';
import { useLargeText } from '@mobile/ui/largeText';
import { COMMON_COPY } from '../common/copy';
import { useDraftCopy } from '../copy/useDraftCopy';
import { MaterialFill } from '../looks/MaterialFill';
import { useWalletLooks } from '../looks/WalletLooksProvider';
import { spokenMoney } from '../money/walletMoney';
import { PrimaryButton } from '../tray/PrimaryButton';
import { WalletText } from '../WalletText';
import { stepAfterAmount } from './addFlow';
import type { AddType, StepProps } from './addFlow';
import { COPY } from './copy';
import { QuickChips } from './QuickChips';
import type { QuickChip } from './QuickChips';
import { WalletKeypad } from './WalletKeypad';

const LINES = { ...COMMON_COPY, ...COPY } as const;

/** The amount's size (bw-tray-amount); it grows to 64 pt and no more (W30, ax-large-tray). */
const AMOUNT = 58;

/** Whether the step offers บอกบัน: the companion area is on and Bun's AI help is on (P2-T16 passes it as `canTellBun`). */
export function useCanTellBun(): boolean {
  const { enabled } = useAiCompanion();
  return isRedesignEnabled('companion') && enabled;
}

export function AmountStep({ draft, keypad, onDraft, onStep, type, lookups, chips, canTellBun, onTellBun }: StepProps & {
  type: AddType;
  lookups: Lookups;
  chips: readonly QuickChip[];
  canTellBun: boolean;
  onTellBun(): void;
}) {
  const colors = useWalletColors();
  const t = useDraftCopy(LINES);
  const typed = evaluateKeypad(keypad, { allowZero: true });
  return (
    <View style={{ gap: 12 }}>
      <View style={{ alignItems: 'center', gap: 8 }}>
        {/* Each key's result is read out where live regions are (the keys say their own names). */}
        <View {...POLITE_LIVE_REGION} style={{ alignSelf: 'stretch' }}>
          <Text
            testID="add-amount"
            accessibilityLabel={spokenMoney(typed.ok ? typed.minor : '0', t)}
            maxFontSizeMultiplier={amountMaxScale(AMOUNT)}
            style={{
              fontFamily: LATIN_UI_FONT_FAMILY,
              fontWeight: '700',
              fontSize: AMOUNT,
              lineHeight: walletLineHeight(AMOUNT, 'latin'),
              letterSpacing: (AMOUNT * -2) / 100,
              color: colors.ink,
              textAlign: 'center',
            }}
          >
            {`฿${keypadDisplay(keypad)}`}
          </Text>
        </View>
        {type === 'transfer' ? null : <WalletChip type={type} walletId={draft.walletId} lookups={lookups} onPress={() => onStep('wallet')} />}
      </View>
      {canTellBun && type !== 'transfer' ? <TellBunRow onPress={onTellBun} /> : null}
      {type === 'income' ? <NameField value={draft.merchant} onChange={(merchant) => onDraft({ ...draft, merchant })} /> : null}
      <QuickChips chips={chips} />
    </View>
  );
}

/** The step's footer, for the tray's pinned `footer`: the keypad, then the keypad's problem right above Next. */
export function AmountFooter({ keypad, onKeypad, onStep, type, problem }: StepProps & { type: AddType; problem: string | null }) {
  const t = useDraftCopy(COMMON_COPY);
  // iOS reads no live region, so a new problem is also said once.
  useAnnouncement(problem);
  return (
    <View style={{ gap: 12 }}>
      <WalletKeypad keypad={keypad} onKeypad={onKeypad} />
      <View style={{ gap: 8 }}>
        {problem === null ? null : (
          <WalletText testID="add-problem" role="label" accessibilityRole="alert" aria-live="polite" style={{ textAlign: 'center' }}>
            {problem}
          </WalletText>
        )}
        <PrimaryButton testID="add-next" label={t('common.next')} disabled={!evaluateKeypad(keypad).ok} onPress={() => onStep(stepAfterAmount(type))} />
      </View>
    </View>
  );
}

/** The chip under the amount: the wallet's material and its words, opening the wallet step. A full-width row at the largest text sizes. */
function WalletChip({ type, walletId, lookups, onPress }: { type: 'expense' | 'income'; walletId: string | null; lookups: Lookups; onPress(): void }) {
  const colors = useWalletColors();
  const t = useDraftCopy(COPY);
  const large = useLargeText();
  const { lookOf } = useWalletLooks();
  const wallet = walletId === null ? undefined : lookups.wallets.get(walletId);
  const words = wallet === undefined
    ? t('add.chooseWallet')
    : t(type === 'income' ? 'add.intoWallet' : 'add.fromWallet', { wallet: wallet.name });
  return (
    <Pressable
      testID="add-wallet"
      accessibilityRole="button"
      accessibilityLabel={words}
      onPress={onPress}
      style={({ pressed }) => ({
        alignSelf: large ? 'stretch' : 'center',
        maxWidth: '100%',
        minHeight: large ? 64 : 44,
        flexDirection: 'row',
        alignItems: 'center',
        gap: large ? 12 : 8,
        paddingLeft: large ? 14 : 8,
        paddingRight: 14,
        paddingVertical: large ? 10 : 4,
        borderRadius: large ? 18 : 22,
        backgroundColor: colors.raised,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {wallet === undefined ? null : (
        <View {...DECORATIVE} style={{ width: large ? 44 : 34, height: large ? 28 : 22 }}>
          <MaterialFill material={lookOf(wallet.id).material} radius={large ? 6 : 5} />
        </View>
      )}
      <WalletText role="label" style={{ flexShrink: 1 }}>{words}</WalletText>
      <View {...DECORATIVE}>
        <Svg width={large ? 22 : 12} height={large ? 22 : 12} viewBox="0 0 24 24">
          <Path d="M6 9l6 6 6-6" fill="none" stroke={colors.ink} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </View>
    </Pressable>
  );
}

/** บอกบัน: a row that opens Tell Bun (bw-tray-amount draws the sentence typed into it; here the sheet takes it). */
function TellBunRow({ onPress }: { onPress(): void }) {
  const colors = useWalletColors();
  const t = useDraftCopy(COPY);
  return (
    <Pressable
      testID="add-tell-bun"
      accessibilityRole="button"
      accessibilityLabel={t('add.tellBun')}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 50,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 16,
        backgroundColor: colors.raised,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View {...DECORATIVE}>
        <Svg width={18} height={18} viewBox="0 0 24 24">
          <Path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z" fill={colors.violet} />
        </Svg>
      </View>
      <WalletText role="body" tone="quiet" style={{ flexShrink: 1 }}>{t('add.tellBun')}</WalletText>
    </Pressable>
  );
}

/** Income's name (rh-income): one line of up to 120 characters, and the note that income is not counted in the budget. */
function NameField({ value, onChange }: { value: string; onChange(next: string): void }) {
  const colors = useWalletColors();
  const t = useDraftCopy(COPY);
  const large = useLargeText();
  return (
    <View
      testID="add-name"
      style={{
        minHeight: 58,
        flexDirection: large ? 'column' : 'row',
        alignItems: large ? 'stretch' : 'center',
        gap: large ? 4 : 12,
        paddingLeft: large ? 14 : 9,
        paddingRight: 14,
        paddingVertical: 8,
        borderRadius: 16,
        backgroundColor: colors.raised,
      }}
    >
      {large ? null : (
        <View {...DECORATIVE} style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={20} height={20} viewBox="0 0 24 24">
            <Path d="M3 7h18v10H3Z M6.5 10v4M17.5 10v4" fill="none" stroke={colors.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            <Circle cx={12} cy={12} r={2.6} fill="none" stroke={colors.ink} strokeWidth={1.8} />
          </Svg>
        </View>
      )}
      <View style={{ flex: large ? undefined : 1, minWidth: 0 }}>
        <WalletText role="caption" tone="quiet">{t('add.merchantLabel')}</WalletText>
        <TextInput
          accessibilityLabel={t('add.merchantLabel')}
          value={value}
          onChangeText={onChange}
          maxLength={MERCHANT_MAX_CHARS}
          maxFontSizeMultiplier={WALLET_TYPE.body.maxScale}
          style={{ fontFamily: THAI_UI_FONT_FAMILY, fontSize: WALLET_TYPE.body.size, fontWeight: '500', color: colors.ink, padding: 0 }}
        />
      </View>
      <WalletText role="caption" tone="quiet">{t('add.notInBudget')}</WalletText>
    </View>
  );
}
