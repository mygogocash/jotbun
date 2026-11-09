// Ticked stages with counts (redesign R2a), for imports and other long work:
// "Read the file ✓ 1,234 of 1,234", "Check rows • 120 of 5,678". Each stage
// shows its state as a word beside its mark and is read as one item:
// "Check rows, In progress, 120 of 5,678". Rows are polite live regions, and
// on iOS (which skips live regions) the stage that matters now is announced
// when it changes: the failed one, else the active one, else the last done.
import { View } from 'react-native';

import { useCopy } from '@mobile/i18n/useCopy';
import { DECORATIVE, useAnnouncement } from './a11y';
import { BunText } from './BunText';
import type { BunTone } from './BunText';
import { BUN_SPACE } from './layout';

export type StageStatus = 'pending' | 'active' | 'done' | 'failed';
export type ProgressStage = {
  key: string;
  label: string;
  status: StageStatus;
  /** Items finished so far. */
  done?: number;
  /** Items in all, when known: shown as "done of total". */
  total?: number;
};
export type StagedProgressProps = { stages: readonly ProgressStage[]; title?: string };

const WORD: Readonly<Record<StageStatus, string>> = { pending: 'Waiting', active: 'In progress', done: 'Done', failed: 'Failed' };
const MARK: Readonly<Record<StageStatus, string>> = { pending: '○', active: '•', done: '✓', failed: '!' };
// Failure is not a budget state, so it is ink and a word, never red.
const TONE: Readonly<Record<StageStatus, BunTone>> = { pending: 'muted', active: 'accent', done: 'ink', failed: 'ink' };

const grouped = (value: number) => String(Math.max(0, Math.trunc(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

type Tc = ReturnType<typeof useCopy>;

function countText(stage: ProgressStage, tc: Tc): string | null {
  if (stage.total !== undefined) return tc('{done} of {total}', { done: grouped(stage.done ?? 0), total: grouped(stage.total) });
  return stage.done !== undefined ? grouped(stage.done) : null;
}

function spokenStage(stage: ProgressStage, tc: Tc): string {
  const status = tc(WORD[stage.status]);
  const count = countText(stage, tc);
  return count === null
    ? tc('{stage}, {status}', { stage: stage.label, status })
    : tc('{stage}, {status}, {count}', { stage: stage.label, status, count });
}

/** The stage a listener most needs to hear about now. */
function current(stages: readonly ProgressStage[]): ProgressStage | undefined {
  return stages.find((stage) => stage.status === 'failed')
    ?? stages.find((stage) => stage.status === 'active')
    ?? [...stages].reverse().find((stage) => stage.status === 'done');
}

export function StagedProgress({ stages, title }: StagedProgressProps) {
  const tc = useCopy();
  const now = current(stages);
  useAnnouncement(now ? spokenStage(now, tc) : null);
  return (
    <View style={{ gap: BUN_SPACE.sm }}>
      {title ? <BunText variant="heading" role="heading" accessibilityRole="header">{title}</BunText> : null}
      <View role="list" accessibilityRole="list" style={{ gap: BUN_SPACE.xs }}>
        {stages.map((stage) => {
          const tone = TONE[stage.status];
          const count = countText(stage, tc);
          return (
            <View
              key={stage.key}
              role="listitem"
              accessible
              accessibilityLabel={spokenStage(stage, tc)}
              accessibilityLiveRegion="polite"
              aria-live="polite"
              style={{ flexDirection: 'row', alignItems: 'flex-start', gap: BUN_SPACE.sm }}
            >
              <View {...DECORATIVE} style={{ minWidth: BUN_SPACE.lg, alignItems: 'center' }}>
                <BunText tone={tone} style={{ fontWeight: '700' }}>{MARK[stage.status]}</BunText>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <BunText>{stage.label}</BunText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: BUN_SPACE.xs }}>
                  <BunText variant="caption" tone={tone} style={stage.status === 'failed' ? { fontWeight: '700' } : undefined}>{tc(WORD[stage.status])}</BunText>
                  {count ? <BunText variant="caption" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>{count}</BunText> : null}
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
