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
// stands on the stage. Copy stays out of the catalogs until E2 (the catalog
// guard skips `insights/` folders).
import { HISTORY_MAX_LIMIT } from '@gogospend/contracts';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ScrollView, Share, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCopy } from '@mobile/i18n/useCopy';
import { Bun } from '@mobile/mascot/Bun';
import { useBunIntensity } from '@mobile/mascot/BunIntensityProvider';
import { compareWindow, monthPhase, readMonthDays, recapView } from '@mobile/spend/v1/redesign/insights/recapModel';
import type { MonthDays, RecapData } from '@mobile/spend/v1/redesign/insights/recapModel';
import { useDiaryView } from '@mobile/spend/v1/SpendDiaryContext';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import { monthRange, todayInBangkok } from '@mobile/spend/v1/viewModels';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { BunText } from '@mobile/ui/BunText';
import { EmptyState } from '@mobile/ui/EmptyState';
import { BUN_SPACE } from '@mobile/ui/layout';
import { PillButton } from '@mobile/ui/PillButton';
import { StageHeader } from '@mobile/ui/StageHeader';
import { useLoad, useMoneyLocale } from '../../v1/parts';
import { LoadingBlock, Notice, useDateLocale, useGoBack } from '../HistoryParts';
import { CompareBars, RecapSlip } from './RecapParts';

const NOTHING_READ: MonthDays = { days: [], complete: true };

export function RecapScreen({ month, now }: { month: string; now?: Date }) {
  const resources = useSpendV1();
  const router = useRouter();
  const tc = useCopy();
  const locale = useMoneyLocale();
  const dateLocale = useDateLocale();
  const colors = useBunColors();
  const insets = useSafeAreaInsets();
  const { intensity } = useBunIntensity();
  const goBack = useGoBack();
  const diaryView = useDiaryView();
  const today = todayInBangkok(now ?? new Date());
  const [shareProblem, setShareProblem] = useState<string | null>(null);

  const loaded = useLoad<RecapData>(async () => {
    const months = compareWindow(month, today);
    // A month that has not started has nothing to read.
    const started = monthPhase(month, today) !== 'future';
    const [summary, categories, days, others] = await Promise.all([
      started ? resources.summary(month) : null,
      resources.categories(),
      started ? readMonthDays(month, (cursor) => resources.history({ ...monthRange(month), sort: 'date_desc' }, cursor, HISTORY_MAX_LIMIT)) : NOTHING_READ,
      // The month shown shares its own summary with its bar.
      Promise.all(months.filter((other) => other !== month).map(async (other) => [other, (await resources.summary(other)).expense_minor] as const)),
    ]);
    const spentIn = new Map(others);
    return {
      summary,
      categories,
      days,
      compare: months.map((shown) => ({ month: shown, expenseMinor: shown === month && summary ? summary.expense_minor : spentIn.get(shown) ?? '0' })),
    };
  }, [resources, month, today]);

  useEffect(() => setShareProblem(null), [month]);

  const view = recapView({ month, today, load: loaded, outbox: diaryView.outbox, tc, locale, dateLocale });
  const choose = (next: string) => router.replace({ pathname: '/spend/recap/[month]', params: { month: next } });

  async function share(message: string) {
    setShareProblem(null);
    try {
      await Share.share({ message });
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
