// C16's conflict choice (1D-T9, board rh-conflict): a record edit the server
// refused, kept on this phone, beside the record now on the server. Two radio
// cards, "Yours" chosen first, each at least 44 pt; every differing field is
// marked in words ("Differs") as well as weight, never in red or green; one
// black main button that follows the chosen card; "Decide later" as a text
// link only while this phone keeps the choice. At the accessibility text sizes
// the cards stack. 1D owns it; P2-T27 restyles it in place (R24). Draft copy
// until E2 (conflictCopy.draft.ts).
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import type { ConflictModel, ConflictRow } from '@mobile/spend/v1/redesign/recordModel';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { DECORATIVE, POLITE_LIVE_REGION, useAnnouncement } from '@mobile/ui/a11y';
import { BunText } from '@mobile/ui/BunText';
import { useLargeText } from '@mobile/ui/largeText';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE, BUN_TOUCH } from '@mobile/ui/layout';
import { PillButton } from '@mobile/ui/PillButton';
import { useConflictCopy } from './conflictCopy.draft';

export type ChoicePanelProps = {
  model: Extract<ConflictModel, { kind: 'changed' }>;
  /** "HH:MM" on Bangkok's clock, from the choice's editedAt; null leaves the line out. */
  yoursAt: string | null;
  busy: boolean;
  /** False offline: "Use yours" is disabled, with the offline line under it. */
  canSendYours: boolean;
  /** The cannot-keep line, when this phone cannot keep the choice; it takes the kept-here line's place. */
  note: string | null;
  onUseYours(): void;
  onUseServer(): void;
  /** Absent: no "Decide later" (a phone that cannot keep the choice; phase 2's own uses). */
  onDecideLater?: () => void;
};

type Side = 'yours' | 'server';

export function ChoicePanel({ model, yoursAt, busy, canSendYours, note, onUseYours, onUseServer, onDecideLater }: ChoicePanelProps) {
  const copy = useConflictCopy();
  const large = useLargeText();
  const [chosen, setChosen] = useState<Side>('yours');
  const heading = copy('heading');
  useAnnouncement(heading);
  const yoursChosen = chosen === 'yours';
  const blocked = yoursChosen && !canSendYours;
  return (
    <View testID="choice-panel" {...POLITE_LIVE_REGION} style={{ gap: BUN_SPACE.md }}>
      <View style={{ gap: BUN_SPACE.xs }}>
        <BunText variant="heading" role="heading" accessibilityRole="header">{heading}</BunText>
        <BunText tone="muted">{note ?? copy('keptHere')}</BunText>
      </View>
      <View accessibilityRole="radiogroup" accessibilityLabel={heading} style={{ flexDirection: large ? 'column' : 'row', gap: BUN_SPACE.sm }}>
        <ChoiceCard
          side="yours" title={copy('yours')} caption={yoursAt === null ? null : copy('yoursAt', { time: yoursAt })}
          rows={model.rows} chosen={yoursChosen} disabled={busy} onChoose={() => setChosen('yours')}
        />
        <ChoiceCard
          side="server" title={copy('server')} caption={copy('serverAt')}
          rows={model.rows} chosen={!yoursChosen} disabled={busy} onChoose={() => setChosen('server')}
        />
      </View>
      {model.rows.some((row) => row.differs) ? <BunText variant="caption">{copy('replaces')}</BunText> : null}
      <View style={{ gap: BUN_SPACE.xxs }}>
        <PillButton
          testID="choice-main"
          label={yoursChosen ? copy('useYours') : copy('useServer')}
          busy={busy}
          disabled={blocked}
          disabledReason={blocked ? copy('offline') : undefined}
          onPress={yoursChosen ? onUseYours : onUseServer}
        />
        {onDecideLater ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy('decideLater')}
            disabled={busy}
            onPress={onDecideLater}
            style={{ minHeight: BUN_TOUCH, alignItems: 'center', justifyContent: 'center' }}
          >
            <BunText variant="label" tone="accent">{copy('decideLater')}</BunText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** One version as a radio card: its name, where it came from, then every field, the differing ones marked. */
function ChoiceCard({ side, title, caption, rows, chosen, disabled, onChoose }: {
  side: Side; title: string; caption: string | null; rows: readonly ConflictRow[]; chosen: boolean; disabled: boolean; onChoose: () => void;
}) {
  const copy = useConflictCopy();
  const colors = useBunColors();
  const large = useLargeText();
  const differs = copy('differs');
  const value = (row: ConflictRow) => (side === 'yours' ? row.yours : row.server);
  const spoken = [title, caption, ...rows.map((row) => `${row.label}: ${value(row)}${row.differs ? `, ${differs}` : ''}`)]
    .filter((part): part is string => part !== null)
    .join('. ');
  return (
    <Pressable
      testID={`choice-${side}`}
      accessibilityRole="radio"
      accessibilityLabel={spoken}
      aria-checked={chosen}
      disabled={disabled}
      onPress={onChoose}
      style={{
        flex: large ? undefined : 1,
        minHeight: BUN_TOUCH,
        gap: BUN_SPACE.xs,
        padding: BUN_SPACE.sm,
        borderRadius: BUN_RADIUS.card,
        borderWidth: chosen ? BUN_OUTLINE.card : BUN_OUTLINE.control,
        borderColor: chosen ? colors.ink : colors.rule,
        backgroundColor: colors.card,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: BUN_SPACE.xs }}>
        <BunText variant="label" style={{ flexShrink: 1, fontWeight: '700' }}>{title}</BunText>
        <View {...DECORATIVE} style={{ width: 22, height: 22, borderRadius: 11, borderWidth: BUN_OUTLINE.card, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
          {chosen ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.ink }} /> : null}
        </View>
      </View>
      {caption ? <BunText variant="caption" tone="muted">{caption}</BunText> : null}
      {rows.map((row) => (
        <View key={row.key} style={{ gap: 2 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: BUN_SPACE.xs }}>
            <BunText variant="caption" tone="muted">{row.label}</BunText>
            {row.differs ? <BunText variant="caption" style={{ fontWeight: '700' }}>{differs}</BunText> : null}
          </View>
          <BunText style={{ fontWeight: row.differs ? '700' : '400' }}>{value(row)}</BunText>
        </View>
      ))}
    </Pressable>
  );
}
