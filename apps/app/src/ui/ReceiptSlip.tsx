// The receipt slip (redesign R2a): paper with a dashed edge, label-and-value
// rows joined by a dotted rule, and a total under a solid ink rule in the
// receipt serif. Used by record detail, the day's records and the month recap.
// Thai text inside a receipt stays in Anuphan; only Latin headings and the
// amounts (digits and ฿) take the serif.
import type { Minor } from '@gogospend/contracts';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useCopy } from '@mobile/i18n/useCopy';
import { RECEIPT_SERIF } from '@mobile/theme/bunType';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { DECORATIVE } from './a11y';
import { Amount, useAmountWords } from './Amount';
import type { AmountState, AmountType } from './Amount';
import { BunText, useBunScript } from './BunText';
import { useLargeText } from './largeText';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE } from './layout';

export type ReceiptSlipProps = {
  /** A serif heading at the top, e.g. "Today" or "October". */
  title?: string;
  /** One quiet line at the bottom for the slip's state, e.g. "Saving · will sync". */
  footer?: string;
  children?: ReactNode;
  accessibilityLabel?: string;
};

export type ReceiptRowProps = {
  label: string;
  /** Plain words are read with the label as one item; a node (such as `Amount`) speaks for itself. */
  value: string | ReactNode;
  accessibilityLabel?: string;
};

export type ReceiptTotalProps = { label: string; minor: Minor; type?: AmountType; state?: AmountState };

export function ReceiptSlip({ title, footer, children, accessibilityLabel }: ReceiptSlipProps) {
  const colors = useBunColors();
  const script = useBunScript();
  return (
    <View
      testID="receipt-slip"
      accessibilityLabel={accessibilityLabel}
      style={{
        backgroundColor: colors.paper,
        borderWidth: BUN_OUTLINE.control,
        borderStyle: 'dashed',
        borderColor: colors.ink,
        borderRadius: BUN_RADIUS.chip,
        padding: BUN_SPACE.md,
        gap: BUN_SPACE.sm,
      }}
    >
      {title ? (
        <BunText
          variant="heading"
          role="heading"
          accessibilityRole="header"
          style={script === 'latin' ? { fontFamily: RECEIPT_SERIF } : undefined}
        >
          {title}
        </BunText>
      ) : null}
      {children}
      {footer ? <BunText variant="caption" tone="muted">{footer}</BunText> : null}
    </View>
  );
}

/** The dotted rule's weight (decorative; it never holds text). */
const RULE = 2;

export function ReceiptRow({ label, value, accessibilityLabel }: ReceiptRowProps) {
  const tc = useCopy();
  const colors = useBunColors();
  const words = typeof value === 'string';
  const spoken = accessibilityLabel ?? (words ? tc('{label}, {value}', { label, value }) : undefined);
  // At the accessibility text sizes the value goes under its label, with no dotted rule between.
  const large = useLargeText();
  if (large) {
    return (
      <View accessible={spoken !== undefined} accessibilityLabel={spoken} style={{ flexDirection: 'column', gap: BUN_SPACE.xxs }}>
        <BunText tone="muted">{label}</BunText>
        {words ? <BunText>{value}</BunText> : <View style={{ alignItems: 'flex-start' }}>{value}</View>}
      </View>
    );
  }
  return (
    <View
      accessible={spoken !== undefined}
      accessibilityLabel={spoken}
      style={{ flexDirection: 'row', alignItems: 'flex-end', gap: BUN_SPACE.xs }}
    >
      <BunText tone="muted" style={{ flexShrink: 1 }}>{label}</BunText>
      {/*
        * iOS draws a dotted border solid unless all four sides match, so the
        * rule is a fully dotted box clipped to its top edge.
        */}
      <View {...DECORATIVE} testID="receipt-rule" style={{ flexGrow: 1, minWidth: BUN_SPACE.sm, marginBottom: BUN_SPACE.xs, height: RULE, overflow: 'hidden' }}>
        <View testID="receipt-rule-dots" style={{ height: RULE * 4, borderWidth: RULE, borderStyle: 'dotted', borderColor: colors.rule, borderRadius: RULE }} />
      </View>
      {words ? <BunText style={{ flexShrink: 1, textAlign: 'right' }}>{value}</BunText> : <View style={{ flexShrink: 1, alignItems: 'flex-end' }}>{value}</View>}
    </View>
  );
}

export function ReceiptTotal({ label, minor, type, state }: ReceiptTotalProps) {
  const tc = useCopy();
  const colors = useBunColors();
  const words = useAmountWords()(minor, type, state);
  return (
    <View
      accessible
      accessibilityLabel={tc('{label}, {value}', { label, value: words.spoken })}
      style={{
        borderTopWidth: BUN_OUTLINE.card,
        borderStyle: 'solid',
        borderColor: colors.ink,
        paddingTop: BUN_SPACE.sm,
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: BUN_SPACE.xs,
      }}
    >
      <BunText variant="label" style={{ flexShrink: 1 }}>{label}</BunText>
      <Amount minor={minor} type={type} state={state} size="l" serif />
    </View>
  );
}
