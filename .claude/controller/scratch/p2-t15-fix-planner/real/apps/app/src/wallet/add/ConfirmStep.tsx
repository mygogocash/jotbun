// The add tray's confirm step (P2-T15; W12, W14; bw-tray-confirm,
// dk-tray-confirm): what is about to be saved, checked before the host's Save
// (P2-T16's footer). The category's tile (or, for a move, the swap mark), the
// title, Bun's reading when Tell Bun filled the entry, and the amount at 44;
// then one row per ConfirmRow (P2-T14's confirmRows: category, wallet, date
// and note, or from, to, date and note), each at least 44 pt, each opening its
// pick step, which comes back here with the choice. A row Bun filled says
// บันเดา until the person changes it (the host's stillGuessed). Controlled
// (StepProps), as every step is; the tray's back to the amount is the host's.
//
// - The title is the host's (`title`); confirmTitle is its rule: the
//   merchant, else the note, else the category's name, else the tray's title.
// - A row with nothing chosen or written says what to add, in quiet ink:
//   today's "Choose a category", the tray's เลือกกระเป๋า, or the board's
//   เพิ่มโน้ต. A wallet row draws the wallet's material beside its name. No
//   time is shown (W12), and no photo row (W15).
// - Private mode (W10): the amount follows the amount step's rule (R106): what
//   the person typed shows, and a fill (Bun's reading, a chip, move all) is
//   ฿•••• and says only that it is hidden. Bun's sentence is the person's own
//   words, but it holds the amount Bun read, in any form Bun reads: digits,
//   Thai or English number words, scale words such as พัน or k. No mask keeps
//   up with every form, so in private mode none of it is drawn: the violet line
//   says only that Bun read it from what the person told it (R114; Review
//   Focus 2).
// - Income's amount is violet with a plus (§2); spending and a move are ink.
// - At the largest text sizes the summary and each row stack, and nothing is
//   clamped (Review Focus 3).
import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useCopy } from '@mobile/i18n/useCopy';
import type { QuickAddDraft } from '@mobile/spend/v1/redesign/quickAddModel';
import type { Lookups } from '@mobile/spend/v1/redesign/shared';
import { Text } from '@mobile/theme/AppText';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { LATIN_UI_FONT_FAMILY } from '@mobile/theme/uiFontFamily';
import { amountMaxScale, walletLineHeight } from '@mobile/theme/walletType';
import { DECORATIVE } from '@mobile/ui/a11y';
import { Glyph } from '@mobile/ui/Glyph';
import { evaluateKeypad } from '@mobile/ui/keypadExpression';
import { useLargeText } from '@mobile/ui/largeText';
import { COMMON_COPY } from '../common/copy';
import type { WalletT } from '../copy/draftText';
import { useDraftCopy } from '../copy/useDraftCopy';
import { MaterialFill } from '../looks/MaterialFill';
import { WalletCategoryIcon } from '../looks/WalletCategoryIcon';
import { useWalletLooks } from '../looks/WalletLooksProvider';
import { HIDDEN_AMOUNT, spokenMoney, walletMoneyText } from '../money/walletMoney';
import { usePrivateMode } from '../privacy/PrivateModeProvider';
import { WalletText } from '../WalletText';
import { isFilled, trayTitleKey } from './addFlow';
import type { AddType, ConfirmRow, StepProps } from './addFlow';
import { COPY } from './copy';

const LINES = { ...COMMON_COPY, ...COPY } as const;

/** The amount's size (the plan's; bw-tray-confirm draws 32). */
const AMOUNT = 44;
/** The summary's tile (bw-tray-confirm). */
const TILE = 52;

/**
 * The confirm step's title (bw-tray-confirm): the merchant, else the note,
 * else the category's name (its row's value), else the tray's title. `t` reads
 * the add tray's lines.
 */
export function confirmTitle(draft: QuickAddDraft, rows: readonly ConfirmRow[], t: WalletT): string {
  const category = rows.find((row) => row.key === 'category')?.value ?? '';
  return draft.merchant.trim() || draft.note.trim() || category || t(trayTitleKey(draft.type));
}

export function ConfirmStep({ draft, keypad, onStep, rows, title, bunSentence, type, lookups }: StepProps & {
  rows: readonly ConfirmRow[];
  /** confirmTitle's answer. */
  title: string;
  /** What the person told Bun, when Tell Bun filled the entry; otherwise null. */
  bunSentence: string | null;
  type: AddType;
  lookups: Lookups;
}) {
  const colors = useWalletColors();
  const t = useDraftCopy(LINES);
  const large = useLargeText();
  const { hidden } = usePrivateMode();
  const typed = evaluateKeypad(keypad, { allowZero: true });
  const minor = typed.ok ? typed.minor : '0';
  // A fill is masked as a stored amount is; what the person typed shows (R106).
  const masked = hidden && isFilled(keypad);
  const categoryId = type === 'transfer' ? null : draft.categoryByType[type];
  const category = categoryId === null ? undefined : lookups.categories.get(categoryId);
  const categoryName = rows.find((row) => row.key === 'category')?.value ?? '';
  const walletOf = (key: ConfirmRow['key']) => (key === 'wallet' ? draft.walletId : key === 'from' ? draft.fromWalletId : key === 'to' ? draft.toWalletId : null);
  return (
    <View testID="confirm-step" style={{ gap: 14 }}>
      <View testID="confirm-summary" style={{ flexDirection: large ? 'column' : 'row', alignItems: large ? 'flex-start' : 'center', gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flex: large ? undefined : 1, alignSelf: large ? 'stretch' : undefined }}>
          {category !== undefined ? (
            <WalletCategoryIcon category={category} name={categoryName} size={TILE} />
          ) : (
            <View {...DECORATIVE} testID="confirm-tile" style={{ width: TILE, height: TILE, borderRadius: 16, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' }}>
              {type === 'transfer' ? <Glyph name="swap" size={26} color={colors.ink} /> : null}
            </View>
          )}
          <View style={{ flex: 1, gap: 2 }}>
            <WalletText testID="confirm-title" role="h2">{title}</WalletText>
            {bunSentence === null ? null : (
              <WalletText testID="confirm-bun" role="caption" tone="violet">
                {hidden ? t('add.bunReadHidden') : t('add.bunReadFrom', { sentence: bunSentence })}
              </WalletText>
            )}
          </View>
        </View>
        <Text
          testID="confirm-amount"
          accessibilityLabel={masked ? t('common.amountHidden') : spokenMoney(minor, t)}
          maxFontSizeMultiplier={amountMaxScale(AMOUNT)}
          style={{
            fontFamily: LATIN_UI_FONT_FAMILY,
            fontWeight: '700',
            fontSize: AMOUNT,
            lineHeight: walletLineHeight(AMOUNT, 'latin'),
            letterSpacing: masked ? (AMOUNT * 12) / 100 : (AMOUNT * -2) / 100,
            color: type === 'income' ? colors.violet : colors.ink,
          }}
        >
          {masked ? HIDDEN_AMOUNT : walletMoneyText(minor, { sign: type === 'income' ? 'income' : 'none' })}
        </Text>
      </View>
      <View testID="confirm-rows" style={{ borderRadius: 18, overflow: 'hidden', backgroundColor: colors.raised }}>
        {rows.map((row, index) => (
          <RowButton key={row.key} row={row} first={index === 0} walletId={walletOf(row.key)} onPress={() => onStep(row.key)} />
        ))}
      </View>
    </View>
  );
}

/** One row (bw-tray-confirm): its name, Bun's mark, the wallet's material, the value or what to add, and a chevron. */
function RowButton({ row, first, walletId, onPress }: { row: ConfirmRow; first: boolean; walletId: string | null; onPress(): void }) {
  const colors = useWalletColors();
  const tc = useCopy();
  const t = useDraftCopy(LINES);
  const large = useLargeText();
  const { lookOf } = useWalletLooks();
  const empty = row.value === '';
  const value = !empty ? row.value : row.key === 'category' ? tc('Choose a category') : row.key === 'note' ? t('add.addNote') : t('add.chooseWallet');
  const label = [t(row.labelKey), value, row.guessed ? t('add.bunGuess') : null].filter((part): part is string => part !== null).join(' ');
  return (
    <Pressable
      testID={`confirm-row-${row.key}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 52,
        flexDirection: large ? 'column' : 'row',
        alignItems: large ? 'flex-start' : 'center',
        justifyContent: 'space-between',
        gap: large ? 4 : 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderTopWidth: first ? 0 : 1,
        borderColor: colors.hairline,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <WalletText role="body" tone="quiet">{t(row.labelKey)}</WalletText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: large ? 'flex-start' : 'flex-end', gap: 8, flexShrink: 1 }}>
        {row.guessed ? (
          <View testID={`confirm-guess-${row.key}`} style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: colors.violet }}>
            <WalletText role="caption" tone="violet">{t('add.bunGuess')}</WalletText>
          </View>
        ) : null}
        {walletId === null || empty ? null : (
          <View {...DECORATIVE} style={{ width: 30, height: 20 }}>
            <MaterialFill material={lookOf(walletId).material} radius={5} />
          </View>
        )}
        <WalletText role="body" tone={empty ? 'quiet' : 'ink'} style={{ flexShrink: 1 }}>{value}</WalletText>
        <View {...DECORATIVE}>
          <Svg width={12} height={12} viewBox="0 0 24 24">
            <Path d="M9 5l7 7-7 7" fill="none" stroke={colors.quiet} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </View>
      </View>
    </Pressable>
  );
}
