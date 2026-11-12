// R5 Insights: a month's recap (plan §6.3), behind the `insights` area until
// E2 checkpoint 3. The route (/spend/recap/[month]) gives it a real YYYY-MM.
//
// - The stage: "Month recap", the month (so far, for this month) and the
//   money out as the hero, with the bun's `cheer` in its slot at Full (none at
//   Quiet or Off). Back is the stage's first control.
// - A printed ReceiptSlip: spent, the budget line, earned, the top
//   categories, the days logged and kept, every amount exact
//   (recapModel.ts). Confirmed money only: entries still on this device are
//   mentioned, never added in.
// - "Share as text" hands the recap in plain words to the system share sheet
//   (React Native's Share). An image waits for a capture package (D6).
// - Compare months: six months of money out that double as the month picker;
//   a tap replaces this recap with that month's.
// - States: loading, a load problem (offline says the records are safe), an
//   empty month (the `thinking` bun, which follows the empty-state rule) and
//   a month that has not started.
//
// Nothing here moves, so reduced motion has nothing to take away: the bun
// stands on the stage. Copy is in the catalogs, with Thai, approved at E2
// checkpoint 3.
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCopy } from '@mobile/i18n/useCopy';
import { Bun } from '@mobile/mascot/Bun';
import { useBunIntensity } from '@mobile/mascot/BunIntensityProvider';
import { recapView } from '@mobile/spend/v1/redesign/insights/recapModel';
import { useDiaryView } from '@mobile/spend/v1/SpendDiaryContext';
import { todayInBangkok } from '@mobile/spend/v1/viewModels';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { BunText } from '@mobile/ui/BunText';
import { EmptyState } from '@mobile/ui/EmptyState';
import { BUN_SPACE } from '@mobile/ui/layout';
import { PillButton } from '@mobile/ui/PillButton';
import { StageHeader } from '@mobile/ui/StageHeader';
import { useMoneyLocale } from '../../v1/parts';
import { LoadingBlock, Notice, useDateLocale, useGoBack } from '../HistoryParts';
import { CompareBars, RecapSlip } from './RecapParts';
import { shareText, useRecapData } from './recapData';

export function RecapScreen({ month, now }: { month: string; now?: Date }) {
  const router = useRouter();
  const tc = useCopy();
  const locale = useMoneyLocale();
  const dateLocale = useDateLocale();
  const colors = useBunColors();
  const insets = useSafeAreaInsets();
  const { intensity } = useBunIntensity();
  const goBack = useGoBack('/spend/insights');
  const diaryView = useDiaryView();
  const today = todayInBangkok(now ?? new Date());
  const [shareProblem, setShareProblem] = useState<string | null>(null);

  const loaded = useRecapData(month, now);

  useEffect(() => setShareProblem(null), [month]);

  const view = recapView({ month, today, load: loaded, outbox: diaryView.outbox, tc, locale, dateLocale });
  const choose = (next: string) => router.replace({ pathname: '/spend/recap/[month]', params: { month: next } });

  async function share(message: string) {
    setShareProblem(null);
    try {
      await shareText(message);
    } catch {
      setShareProblem(tc("Couldn't open sharing. Try again."));
    }
  }

  const waiting = (view.kind === 'recap' || view.kind === 'empty') && view.waiting
    ? <BunText testID="recap-waiting" variant="caption" tone="muted">{view.waiting}</BunText>
    : null;

  let body: ReactNode;
  switch (view.kind) {
    case 'loading':
      body = <LoadingBlock label={view.label} />;
      break;
    case 'problem':
      body = (
        <View testID="recap-problem" style={{ gap: BUN_SPACE.sm }}>
          <BunText variant="heading" role="heading" accessibilityRole="header">{view.problem.title}</BunText>
          <Notice tone="alert" message={view.problem.message} action={view.problem.retry ? { label: tc('Try again'), onPress: loaded.reload } : undefined} />
        </View>
      );
      break;
    case 'empty':
      body = (
        <>
          {waiting}
          <EmptyState
            // EmptyState leaves the art (and its space) out when the bun is off; Quiet keeps it.
            art={<Bun pose="thinking" size="l" testID="recap-bun-thinking" />}
            title={view.title}
            body={view.body}
            action={view.canAdd ? { label: tc('Add an entry'), onPress: () => router.push('/spend/add') } : undefined}
          />
          <CompareBars bars={view.bars} onChoose={choose} />
        </>
      );
      break;
    case 'recap': {
      const message = view.share;
      body = (
        <>
          {waiting}
          <RecapSlip facts={view.facts} />
          <PillButton label={tc('Share as text')} onPress={() => void share(message)} />
          {shareProblem ? <Notice tone="alert" message={shareProblem} /> : null}
          <CompareBars bars={view.bars} onChoose={choose} />
        </>
      );
      break;
    }
  }

  // The bun's moment: a recap at Full. Quiet keeps buns to empty states, and Off shows none.
  const cheer = view.kind === 'recap' && intensity === 'full';
  return (
    <View testID="recap-screen" style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView testID="recap-scroll" style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + BUN_SPACE.xl }}>
        <StageHeader
          back={{ onPress: goBack }}
          title={view.header.title}
          subtitle={view.header.subtitle}
          bun={cheer ? <Bun pose="cheer" size="m" testID="recap-bun-cheer" /> : undefined}
        >
          {view.header.hero ? (
            <BunText testID="recap-total" variant="heading" tone="ink" style={{ fontVariant: ['tabular-nums'] }}>{view.header.hero}</BunText>
          ) : null}
        </StageHeader>
        <View style={{ padding: BUN_SPACE.md, gap: BUN_SPACE.md }}>{body}</View>
      </ScrollView>
    </View>
  );
}
