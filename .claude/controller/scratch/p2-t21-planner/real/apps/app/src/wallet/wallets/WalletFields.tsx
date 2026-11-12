// The fields a wallet is made of (P2-T21; wc-wallet-edit, bw-adding): the
// live preview card, the name, Bun's face (the five, 48 pt) and the material
// (the five, 56 × 44 pt), and the opening balance on the tray's keypad (W29)
// with the day tracking starts, as walletsModel sets it. The new-wallet flow's
// second step and the edit screen both draw it; each holds the form, the look
// and the keypad, and this draws them.
//
// - The preview is the wallet card as it will read: one image that says
//   ตัวอย่างการ์ด, the name and the balance (wc-wallet-edit's role="img"); in
//   private mode, only that its amount is hidden.
// - With no account open nothing could be kept (W7), so the look's fields are
//   not drawn.
// - The opening balance shows what the person types as typed (R106). An amount
//   they did not type (an edit's opening balance) is masked in private mode
//   until a key is pressed, as the add tray's is.
// - While `locked` (a command out, or its answer unknown) nothing changes, so
//   Try again sends what the person saw.
// - Nothing is clamped to a line: at the largest text sizes the faces and the
//   materials wrap, and so does the amount.
import { Pressable, View } from 'react-native';

import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import type { WalletFieldErrors, WalletForm } from '@mobile/spend/v1/redesign/planning/walletsModel';
import { useDiaryView } from '@mobile/spend/v1/SpendDiaryContext';
import { Text, TextInput } from '@mobile/theme/AppText';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { LATIN_UI_FONT_FAMILY, THAI_UI_FONT_FAMILY } from '@mobile/theme/uiFontFamily';
import { WALLET_MATERIALS } from '@mobile/theme/walletPalette';
import type { WalletColors, WalletMaterial } from '@mobile/theme/walletPalette';
import { amountMaxScale, WALLET_TYPE, walletLineHeight } from '@mobile/theme/walletType';
import { DECORATIVE } from '@mobile/ui/a11y';
import { dayLabel } from '@mobile/ui/dateStep';
import { evaluateKeypad, keypadDisplay } from '@mobile/ui/keypadExpression';
import type { KeypadState } from '@mobile/ui/keypadExpression';
import { isFilled } from '../add/addFlow';
import { WalletKeypad } from '../add/WalletKeypad';
import { COPY as CARD_COPY } from '../card/copy';
import { WalletCard } from '../card/WalletCard';
import type { WalletCardModel } from '../card/WalletCard';
import { COMMON_COPY } from '../common/copy';
import { useDraftCopy } from '../copy/useDraftCopy';
import { BunFace } from '../looks/BunFace';
import { MaterialFill } from '../looks/MaterialFill';
import { BUN_FACES } from '../looks/walletLooks';
import type { BunFaceName, WalletLook } from '../looks/walletLooks';
import { HIDDEN_AMOUNT, spokenMoney } from '../money/walletMoney';
import { usePrivateMode } from '../privacy/PrivateModeProvider';
import { WalletText } from '../WalletText';
import { COPY } from './copy';

const LINES = { ...COMMON_COPY, ...CARD_COPY, ...COPY } as const;

export const FACE_NAMES: Readonly<Record<BunFaceName, keyof typeof COPY>> = {
  smile: 'wallets.faceSmile',
  wink: 'wallets.faceWink',
  calm: 'wallets.faceCalm',
  happy: 'wallets.faceHappy',
  wow: 'wallets.faceWow',
};

export const MATERIAL_NAMES: Readonly<Record<WalletMaterial, keyof typeof COPY>> = {
  silk: 'wallets.materialSilk',
  paper: 'wallets.materialPaper',
  titanium: 'wallets.materialTitanium',
  sky: 'wallets.materialSky',
  peach: 'wallets.materialPeach',
};

/** The opening balance's size (wc-wallet-edit). */
const OPENING = 22;

/** The keypad refuses a key past ฿999,999,999.99 (its one problem: an opening balance may be zero), in today's words. */
const TOO_LARGE = 'Amounts go up to ฿999,999,999.99';

/** The chosen face's or material's ring: a gap in the card's colour, then violet (wc-wallet-edit). */
export const chosenRing = (colors: WalletColors) => `0px 0px 0px 2px ${colors.card}, 0px 0px 0px 4px ${colors.violet}`;

export type WalletFieldsProps = {
  form: WalletForm;
  onForm(next: WalletForm): void;
  look: WalletLook;
  onLook(next: WalletLook): void;
  keypad: KeypadState;
  onKeypad(next: KeypadState): void;
  errors: WalletFieldErrors;
  preview: WalletCardModel;
  /** Bangkok's today, for the day tracking starts. */
  today: string;
  /** A command is out, or its answer is unknown: nothing changes. */
  locked?: boolean;
};

export function WalletFields({ form, onForm, look, onLook, keypad, onKeypad, errors, preview, today, locked = false }: WalletFieldsProps) {
  const colors = useWalletColors();
  const tc = useCopy();
  const t = useDraftCopy(LINES);
  const locale = useActiveLocale();
  const { hidden } = usePrivateMode();
  const { accountId } = useDiaryView();
  const said = hidden ? t('common.amountHidden') : spokenMoney(preview.balanceMinor, t);
  const previewLabel = t('wallets.preview', { name: preview.name, amount: said }).replace(/\s+/g, ' ').trim();
  const typed = evaluateKeypad(keypad, { allowZero: true });
  // An amount the person did not type is masked as a stored one is, until a key is pressed (R106).
  const masked = hidden && isFilled(keypad);
  const openingProblem = keypad.problem === 'too_large' ? tc(TOO_LARGE) : errors.opening_minor ?? null;
  return (
    <View style={{ gap: 14 }}>
      <View testID="wallet-preview" accessible accessibilityRole="image" accessibilityLabel={previewLabel}>
        <WalletCard wallet={preview} look={look} variant="full" />
      </View>
      <View style={{ gap: 4 }}>
        <View
          style={{
            gap: 2,
            paddingTop: 8,
            paddingHorizontal: 14,
            paddingBottom: 4,
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            borderBottomLeftRadius: 4,
            borderBottomRightRadius: 4,
            borderBottomWidth: 2,
            borderBottomColor: colors.ink,
            backgroundColor: colors.card,
          }}
        >
          {/* The field says its own name, so screen readers skip the caption above it. */}
          <WalletText role="caption" tone="quiet" {...DECORATIVE}>{t('wallets.name')}</WalletText>
          <TextInput
            testID="wallet-name"
            accessibilityLabel={t('wallets.name')}
            value={form.name}
            editable={!locked}
            onChangeText={(name) => onForm({ ...form, name })}
            maxFontSizeMultiplier={WALLET_TYPE.body.maxScale}
            style={{ minHeight: 44, padding: 0, fontFamily: THAI_UI_FONT_FAMILY, fontSize: WALLET_TYPE.body.size, color: colors.ink }}
          />
        </View>
        {errors.name ? <WalletText testID="wallet-name-problem" role="caption" accessibilityRole="alert">{errors.name}</WalletText> : null}
      </View>
      {accountId === null ? null : (
        <View testID="wallet-look" style={{ borderRadius: 20, backgroundColor: colors.card }}>
          <View style={{ gap: 8, paddingTop: 12, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
            <WalletText role="label" tone="quiet" {...DECORATIVE}>{t('wallets.face')}</WalletText>
            <View role="radiogroup" accessibilityLabel={t('wallets.face')} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {BUN_FACES.map((face) => {
                const checked = face === look.face;
                return (
                  <Pressable
                    key={face}
                    testID={`look-face-${face}`}
                    accessibilityRole="radio"
                    accessibilityLabel={t(FACE_NAMES[face])}
                    accessibilityState={{ checked, disabled: locked }}
                    aria-checked={checked}
                    aria-disabled={locked}
                    disabled={locked}
                    onPress={() => onLook({ ...look, face })}
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 24,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: colors.raised,
                      boxShadow: checked ? chosenRing(colors) : undefined,
                      opacity: locked ? 0.4 : 1,
                    }}
                  >
                    <BunFace face={face} size={32} />
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={{ gap: 8, paddingTop: 12, paddingHorizontal: 16, paddingBottom: 14 }}>
            <WalletText role="label" tone="quiet" {...DECORATIVE}>{t('wallets.material')}</WalletText>
            <View role="radiogroup" accessibilityLabel={t('wallets.material')} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {WALLET_MATERIALS.map((material) => {
                const checked = material === look.material;
                return (
                  <Pressable
                    key={material}
                    testID={`look-material-${material}`}
                    accessibilityRole="radio"
                    accessibilityLabel={t(MATERIAL_NAMES[material])}
                    accessibilityState={{ checked, disabled: locked }}
                    aria-checked={checked}
                    aria-disabled={locked}
                    disabled={locked}
                    onPress={() => onLook({ ...look, material })}
                    style={{ width: 56, height: 44, borderRadius: 11, boxShadow: checked ? chosenRing(colors) : undefined, opacity: locked ? 0.4 : 1 }}
                  >
                    <MaterialFill material={material} radius={11} />
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      )}
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 8 }}>
          <WalletText role="caption" tone="quietOnGround">{t('wallets.opening')}</WalletText>
          <WalletText testID="wallet-tracking" role="caption" tone="quietOnGround">
            {t('wallets.trackingFrom', { date: dayLabel(form.trackingStart, today, locale).text })}
          </WalletText>
        </View>
        <View style={{ paddingTop: 6, paddingHorizontal: 14, paddingBottom: 6, borderRadius: 12, borderBottomWidth: 2, borderBottomColor: colors.hairline, backgroundColor: colors.card }}>
          <Text
            testID="wallet-opening"
            accessibilityLabel={`${t('wallets.opening')} ${masked ? t('common.amountHidden') : spokenMoney(typed.ok ? typed.minor : '0', t)}`}
            maxFontSizeMultiplier={amountMaxScale(OPENING)}
            style={{
              fontFamily: LATIN_UI_FONT_FAMILY,
              fontWeight: '700',
              fontSize: OPENING,
              lineHeight: walletLineHeight(OPENING, 'latin'),
              // The mask is spaced 0.12 em, as WalletAmount spaces it (bw-private).
              letterSpacing: masked ? (OPENING * 12) / 100 : (OPENING * -1) / 100,
              color: colors.ink,
            }}
          >
            {masked ? HIDDEN_AMOUNT : `฿${keypadDisplay(keypad)}`}
          </Text>
        </View>
        {openingProblem === null ? null : <WalletText testID="wallet-opening-problem" role="caption" accessibilityRole="alert">{openingProblem}</WalletText>}
        {errors.tracking_start ? <WalletText role="caption" accessibilityRole="alert">{errors.tracking_start}</WalletText> : null}
      </View>
      <WalletKeypad keypad={keypad} onKeypad={onKeypad} disabled={locked} />
    </View>
  );
}
