// The record's actions tray (plan P2-T26, rh-actions): the record's tile, its
// title and detail (its wallet and day) and its amount in the header, then two
// groups of 66 pt rows: แก้ไข and ทำซ้ำ (with the amount it copies), then ลบ
// (restorable for 30 days). Each row is one button that says its title and
// line. The host decides what each does; an action that opens another tray (an
// edit, a copy) runs from onClosed, once this tray's Modal has gone (R69). In
// private mode the amounts are ฿•••• and say they are hidden.
import type { Minor } from '@gogospend/contracts';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useActiveLocale } from '@mobile/i18n/useCopy';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { walletLineHeight } from '@mobile/theme/walletType';
import { DECORATIVE } from '@mobile/ui/a11y';
import { COMMON_COPY } from '../common/copy';
import { useDraftCopy } from '../copy/useDraftCopy';
import { WalletAmount } from '../money/WalletAmount';
import { spokenMoney } from '../money/walletMoney';
import type { MoneySign } from '../money/walletMoney';
import { usePrivateMode } from '../privacy/PrivateModeProvider';
import { Tray } from '../tray/Tray';
import { WalletText } from '../WalletText';
import { COPY } from './copy';

export type RecordActionsTrayProps = {
  visible: boolean;
  onClose(): void;
  onClosed?(): void;
  /** Names the dialog; drawn in the header. */
  title: string;
  /** The wallet and the day, such as บัญชีหลัก · วันนี้. */
  detail: string;
  amountMinor: Minor;
  onEdit(): void;
  onCopy(): void;
  onDelete(): void;
  /** The record's tile, decorative, before the title as rh-actions draws it. */
  art?: ReactNode;
  /** The amounts' sign: income is violet with its plus (§2). */
  sign?: MoneySign;
};

/** The tray's lines and the shared ones, merged once, so `t` keeps one identity across renders. */
const ACTIONS_COPY = { ...COMMON_COPY, ...COPY };

type ActionGlyph = 'edit' | 'copy' | 'delete';

/** rh-actions' marks: a pencil, two sheets and a bin. */
const GLYPH_PATHS: Readonly<Record<ActionGlyph, string>> = {
  edit: 'M4 20h4L19 9l-4-4L4 16Z M13.5 6.5l4 4',
  copy: 'M9 9h10v11H9Z M15 9V4H5v11h4',
  delete: 'M4 7h16 M10 11v6M14 11v6 M6 7l1 13h10l1-13 M9 7V4h6v3',
};

/** WalletText's leading for a size no type role has (the board's 16 and 17 pt lines), in this language. */
const leadingFor = (size: number, locale: string) => walletLineHeight(size, locale === 'th' ? 'thai' : 'latin');

function ActionRow({ glyph, title, line, label, amount, first, onPress }: {
  glyph: ActionGlyph;
  title: string;
  line: string;
  /** What a screen reader says: the title and the line, with the amount spoken. */
  label: string;
  amount?: ReactNode;
  first: boolean;
  onPress: () => void;
}) {
  const colors = useWalletColors();
  const locale = useActiveLocale();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 66,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderTopWidth: first ? 0 : 1,
        borderColor: colors.hairline,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View {...DECORATIVE} style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.sheet, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={20} height={20} viewBox="0 0 24 24">
          <Path d={GLYPH_PATHS[glyph]} fill="none" stroke={colors.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <WalletText style={{ fontSize: 16, fontWeight: '700', lineHeight: leadingFor(16, locale) }}>{title}</WalletText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
          <WalletText role="caption" tone="quiet">{line}</WalletText>
          {amount}
        </View>
      </View>
      <View {...DECORATIVE}>
        <Svg width={12} height={12} viewBox="0 0 24 24">
          <Path d="M9 5l7 7-7 7" fill="none" stroke={colors.quiet} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </View>
    </Pressable>
  );
}

function ActionsHeader({ title, detail, amountMinor, art, sign }: { title: string; detail: string; amountMinor: Minor; art: ReactNode; sign: MoneySign }) {
  const locale = useActiveLocale();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {art}
      <View style={{ flex: 1, minWidth: 0 }}>
        {/* The tray's own unseen title names the dialog and is read first, so this one is not read again. */}
        <View {...DECORATIVE}>
          <WalletText role="h2" style={{ fontSize: 17, lineHeight: leadingFor(17, locale) }}>{title}</WalletText>
        </View>
        <WalletText role="caption" tone="quiet">{detail}</WalletText>
      </View>
      <WalletAmount minor={amountMinor} size={28} sign={sign} />
    </View>
  );
}

export function RecordActionsTray({ visible, onClose, onClosed, title, detail, amountMinor, onEdit, onCopy, onDelete, art = null, sign = 'none' }: RecordActionsTrayProps) {
  const colors = useWalletColors();
  const t = useDraftCopy(ACTIONS_COPY);
  const { hidden } = usePrivateMode();
  const spoken = hidden ? t('common.amountHidden') : spokenMoney(amountMinor, t);
  const group = { backgroundColor: colors.raised, borderRadius: 18, overflow: 'hidden' } as const;
  return (
    <Tray
      visible={visible}
      onClose={onClose}
      onClosed={onClosed}
      title={title}
      testID="record-actions"
      header={<ActionsHeader title={title} detail={detail} amountMinor={amountMinor} art={art} sign={sign} />}
    >
      <View style={group}>
        <ActionRow
          glyph="edit"
          title={t('records.edit')}
          line={t('records.actionEditLine')}
          label={`${t('records.edit')} ${t('records.actionEditLine')}`}
          first
          onPress={onEdit}
        />
        <ActionRow
          glyph="copy"
          title={t('records.actionCopy')}
          line={t('records.actionCopyLine')}
          label={`${t('records.actionCopy')} ${t('records.actionCopyLine')} ${spoken}`}
          amount={<WalletAmount minor={amountMinor} size={13} sign={sign} />}
          first={false}
          onPress={onCopy}
        />
      </View>
      <View style={group}>
        <ActionRow
          glyph="delete"
          title={t('records.delete')}
          line={t('records.actionDeleteLine')}
          label={`${t('records.delete')} ${t('records.actionDeleteLine')}`}
          first
          onPress={onDelete}
        />
      </View>
    </Tray>
  );
}
