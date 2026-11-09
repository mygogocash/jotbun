// Catalogue sections for the R1 mascot (redesign R2c, development only):
// every pose at `m` and at `l`, the speech bubble and the peek. The bun
// intensity control in the catalogue's header applies here as it does in the
// app: Quiet drops the bubbles, Off drops every bun.
import { View } from 'react-native';

import { Bun } from '@mobile/mascot/Bun';
import { BunPeek } from '@mobile/mascot/BunPeek';
import { BUN_POSE_NAMES, BUN_POSES, BUN_SIZES, bunHeight } from '@mobile/mascot/poses';
import type { BunPoseName, BunSize } from '@mobile/mascot/poses';
import { SpeechBubble } from '@mobile/mascot/SpeechBubble';
import { useCopy } from '@mobile/i18n/useCopy';
import { BunText } from '@mobile/ui/BunText';
import { Card } from '@mobile/ui/Card';
import { BUN_SPACE } from '@mobile/ui/layout';
import { IntensityNote, Specimen } from './parts';
import type { CatalogueSection } from './registry';
import { SAMPLE_MINOR, useSamples } from './samples';

function PoseGrid({ poses, size, columns }: { poses: readonly BunPoseName[]; size: BunSize; columns: number }) {
  // Every pose stands on one baseline: the box is as tall as the tallest pose.
  const box = Math.max(...poses.map((pose) => bunHeight(BUN_POSES[pose], BUN_SIZES[size])));
  return (
    <>
      <IntensityNote needs="bun" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: BUN_SPACE.md }}>
        {poses.map((pose) => (
          <View key={pose} style={{ width: `${100 / columns}%`, alignItems: 'center', gap: BUN_SPACE.xxs }}>
            <View style={{ height: box, justifyContent: 'flex-end' }}>
              <Bun pose={pose} size={size} />
            </View>
            <BunText variant="caption" tone="muted" style={{ textAlign: 'center' }}>{pose}</BunText>
          </View>
        ))}
      </View>
    </>
  );
}

const HALF = Math.ceil(BUN_POSE_NAMES.length / 2);

function SpeechBubbleSection() {
  const tc = useCopy();
  const samples = useSamples();
  const lunch = samples.money(SAMPLE_MINOR.lunch);
  const over = samples.money(SAMPLE_MINOR.overBy);
  const days = tc('{count} days', { count: 7 });
  return (
    <>
      <IntensityNote needs="bubble" />
      <Specimen label="Holding the receipt, amount highlighted">
        <SpeechBubble fact={tc('{entry} done at {amount}. Food is at 58% with 13 days to go.', { entry: samples.lunch, amount: lunch })} highlight={lunch} />
      </Specimen>
      <Specimen label="Cheer">
        <SpeechBubble pose="cheer" fact={tc('You logged {days} in a row.', { days })} highlight={days} />
      </Specimen>
      <Specimen label="Oops, kindly">
        <SpeechBubble pose="oops-kind" fact={tc('It happens. {amount} over, 9 days to go.', { amount: over })} highlight={over} />
      </Specimen>
      <Specimen label="No highlight">
        <SpeechBubble pose="sleepy" fact={tc('Nothing logged yet today.')} />
      </Specimen>
    </>
  );
}

function BunPeekSection() {
  const tc = useCopy();
  const samples = useSamples();
  const line = tc('{amount} a day left · on track', { amount: samples.money(SAMPLE_MINOR.dailyLeft) });
  return (
    <>
      <IntensityNote needs="bun" />
      <Specimen label="Top edge (the default peek pose)">
        <View style={{ marginTop: BUN_SPACE.xl }}>
          <Card>
            <BunPeek edge="top" />
            <BunText variant="label">{line}</BunText>
          </Card>
        </View>
      </Specimen>
      <Specimen label="Top edge, centred, waving">
        <View style={{ marginTop: BUN_SPACE.xl + BUN_SPACE.lg }}>
          <Card>
            <BunPeek edge="top" align="center" pose="hello" size="s" />
            <BunText>{samples.note}</BunText>
          </Card>
        </View>
      </Specimen>
      <Specimen label="Right edge">
        <View style={{ marginRight: BUN_SPACE.xl + BUN_SPACE.sm }}>
          <Card>
            <BunPeek edge="right" align="center" />
            <BunText>{samples.merchant}</BunText>
          </Card>
        </View>
      </Specimen>
      <Specimen label="Left edge">
        <View style={{ marginLeft: BUN_SPACE.xl + BUN_SPACE.sm }}>
          <Card>
            <BunPeek edge="left" align="start" />
            <BunText>{samples.cash}</BunText>
          </Card>
        </View>
      </Specimen>
    </>
  );
}

/** The mascot: poses at both screen sizes, the bubble and the peek. */
export const MASCOT_SECTIONS: readonly CatalogueSection[] = [
  { id: 'bun-m', title: 'Bun poses at m', group: 'Mascot', render: () => <PoseGrid poses={BUN_POSE_NAMES} size="m" columns={4} /> },
  { id: 'bun-l-1', title: 'Bun poses at l, 1/2', group: 'Mascot', render: () => <PoseGrid poses={BUN_POSE_NAMES.slice(0, HALF)} size="l" columns={3} /> },
  { id: 'bun-l-2', title: 'Bun poses at l, 2/2', group: 'Mascot', render: () => <PoseGrid poses={BUN_POSE_NAMES.slice(HALF)} size="l" columns={3} /> },
  { id: 'speech-bubble', title: 'Speech bubble', group: 'Mascot', render: () => <SpeechBubbleSection /> },
  { id: 'bun-peek', title: 'Bun peek', group: 'Mascot', render: () => <BunPeekSection /> },
];
