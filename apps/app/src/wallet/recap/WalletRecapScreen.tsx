// The Bun Wallet month recap (bw-recap, P2-T32; W20, D41, D42, R66, R73).
//
// - Its data and states are the Bun diary recap's: `useRecapData`, here with
//   every history page of the month for its records, and `recapView`'s
//   loading, load problem (Try again when a retry can help), empty month,
//   month not started, and the recap. The title is the screen's heading in
//   every state. Close goes back, or to Insights when there is nothing to go
//   back to.
// - The recap draws bw-recap's facts: the days logged; the month's money out
//   with the budget and what is left (`under`) or over (`over`); the biggest
//   day (`biggestDay`, with payday); the top three categories in
//   `topCategories`' order; A5's cashback count; and the share button.
// - Colour and type are the wallet kit's: `useWalletColors` tokens, WalletText
//   roles (Anuphan) and WalletAmount (DM Sans, for amounts only). Dates go
//   through dateStep (`monthLabel`, `dayLabel`).
// - The month's one celebration (W20): the first time this phone shows a
//   past month's recap, the `recap` moment plays, decided then from the
//   wallet's one reduced-motion answer (W6; pending reads as reduced, R66):
//   the confetti and the celebration haptic, or the haptic alone. Loading, a
//   load problem or an empty month spends nothing.
// - The cashback card is a count that opens nothing (D42, R73; P6B's X3 opens
//   it). It shows only while the bridge answers (a 404 means it is off, as on
//   Insights), tips are on and seven days are logged (`cashbackView`, A5).
// - A share that cannot open says so (`shareText` rejects). Private mode
//   drops every amount from the screen and from the share text (D41).
import type { CategoryDto, MonthSummary, TransactionDto } from '@gogospend/contracts';
import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';

import { useCopy } from '@mobile/i18n/useCopy';
import { playHaptic } from '@mobile/lib/hapticMoment';
import { useDateLocale, useGoBack } from '@mobile/screens/redesign/HistoryParts';
import { useCashbackCatalogue } from '@mobile/screens/redesign/insights/CashbackCard';
import { shareText, useRecapData } from '@mobile/screens/redesign/insights/recapData';
import { useMoneyLocale } from '@mobile/screens/v1/parts';
import { useAiCompanion } from '@mobile/spend/v1/ai/AiCompanionProvider';
import { cashbackView, countCashbackPurchases } from '@mobile/spend/v1/ai/cashbackModel';
import type { CashbackCount } from '@mobile/spend/v1/ai/cashbackModel';
import { recapView } from '@mobile/spend/v1/redesign/insights/recapModel';
import type { RecapBudget, RecapFacts } from '@mobile/spend/v1/redesign/insights/recapModel';
import { daysInMonth } from '@mobile/spend/v1/redesign/shared';
import { useDiaryView } from '@mobile/spend/v1/SpendDiaryContext';
import { todayInBangkok } from '@mobile/spend/v1/viewModels';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { DECORATIVE } from '@mobile/ui/a11y';
import { dayLabel, monthLabel } from '@mobile/ui/dateStep';
import { COMMON_COPY } from '../common/copy';
import { IconButton } from '../controls/IconButton';
import type { WalletT } from '../copy/draftText';
import { useDraftCopy } from '../copy/useDraftCopy';
import { BunFace } from '../looks/BunFace';
import { WalletCategoryIcon } from '../looks/WalletCategoryIcon';
import { WalletAmount } from '../money/WalletAmount';
import { useWalletReducedMotion } from '../motion/reducedMotion';
import { motionFor } from '../motion/walletMotion';
import { usePrivateMode } from '../privacy/PrivateModeProvider';
import { walletDeviceStore } from '../store/deviceWalletStore';
import { PrimaryButton } from '../tray/PrimaryButton';
import { WalletText } from '../WalletText';
import { biggestDay } from './biggestDay';
import { CONFETTI_NAME, Confetti } from './Confetti';
import { COPY } from './copy';
import { recapShareText } from './recapShare';

const RECAP_COPY = { ...COMMON_COPY, ...COPY };
/** bw-recap's top categories. */
const TOP_SHOWN = 3;
/** The shops the cashback card names, as many as Insights names. */
const SHOPS_NAMED = 3;
const NO_RECORDS: readonly TransactionDto[] = [];

function CloseGlyph({ color }: { color: string }) {
  return (
    <View {...DECORATIVE}>
      <Svg width={16} height={16} viewBox="0 0 24 24">
        <Path d="M6 6l12 12M18 6L6 18" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
      </Svg>
    </View>
  );
}

function CalendarGlyph({ color }: { color: string }) {
  return (
    <View {...DECORATIVE}>
      <Svg width={14} height={14} viewBox="0 0 24 24">
        <Rect x={4} y={5} width={16} height={15} rx={2} fill="none" stroke={color} strokeWidth={2} />
        <Path d="M4 9h16M9 3v4M15 3v4" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
      </Svg>
    </View>
  );
}

function SparkleGlyph({ color }: { color: string }) {
  return (
    <View {...DECORATIVE}>
      <Svg width={18} height={18} viewBox="0 0 24 24">
        <Path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z" fill={color} />
      </Svg>
    </View>
  );
}

/** "Agoda"; "Shopee และ Lazada"; "Shopee, Lazada และ Agoda". */
function shopNames(names: readonly string[], t: WalletT): string {
  if (names.length < 2) return names.join('');
  return t('recap.and', { first: names.slice(0, -1).join(', '), last: names[names.length - 1] });
}

/** What is left of the budget: the limit less the month's money out. */
function leftOf(budget: RecapBudget): string {
  return (BigInt(budget.limitMinor) - BigInt(budget.spentMinor)).toString();
}

/** A total whose category is no longer in the list: its name and an initial on `raised`. */
function unknownCategory(id: string): Pick<CategoryDto, 'id' | 'builtin_key' | 'color' | 'label' | 'type'> {
  return { id, builtin_key: null, color: null, label: null, type: 'expense' };
}

/**
 * A5's count for the card (D42: a count, never baht), or null. Null while the
 * catalogue is unread or the bridge is off (404), and unless `cashbackView`
 * says 'tips': tips on, seven days logged and a purchase matched.
 */
function useCashbackCount(records: readonly TransactionDto[], daysLogged: number): CashbackCount | null {
  const { preferences } = useAiCompanion();
  const catalogue = useCashbackCatalogue();
  return useMemo(() => {
    if (catalogue === null) return null;
    const counted = countCashbackPurchases(records, catalogue.brands);
    const view = cashbackView({ tipsOn: preferences ? preferences.cashback_tips : null, declined: false, daysLogged, count: counted.count });
    return view === 'tips' ? counted : null;
  }, [catalogue, preferences, records, daysLogged]);
}

/**
 * The month's one celebration (W20). It is decided once per month on this
 * mount, when `due` first holds, and plays only if this phone has not
 * celebrated that month (CONFETTI_NAME). What plays is decided then, from the
 * wallet's one answer (W6): `recap`'s confetti and haptic, or under Reduce
 * Motion, and before the phone answers (R66), the haptic alone. A mark the
 * store cannot read counts as unset, and one it cannot keep still celebrates
 * once. Returns the month whose confetti shows.
 */
function useCelebration(month: string, due: boolean): string | null {
  const reduced = useWalletReducedMotion();
  const [confetti, setConfetti] = useState<string | null>(null);
  const decided = useRef<string | null>(null);
  useEffect(() => {
    if (!due || decided.current === month) return;
    decided.current = month;
    const moment = motionFor('recap', reduced);
    const store = walletDeviceStore();
    void store.get(CONFETTI_NAME(month)).catch(() => null).then((seen) => {
      if (seen !== null) return;
      void store.set(CONFETTI_NAME(month), '1').catch(() => undefined);
      if (moment.haptic !== null) playHaptic(moment.haptic);
      if (moment.motion.kind === 'confetti') setConfetti(month);
    });
  }, [due, month, reduced]);
  return confetti;
}

/** A label, then its value; at large text sizes the value wraps below, never cut. */
function FactRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 12 }}>
      <WalletText role="label" tone="quiet">{label}</WalletText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', flexShrink: 1 }}>{children}</View>
    </View>
  );
}

type RecapBodyProps = {
  month: string;
  today: string;
  summary: MonthSummary;
  records: readonly TransactionDto[];
  categories: readonly CategoryDto[];
  facts: RecapFacts;
  cashback: CashbackCount | null;
  shareProblem: string | null;
  onShare: () => void;
};

function RecapBody({ month, today, summary, records, categories, facts, cashback, shareProblem, onShare }: RecapBodyProps) {
  const colors = useWalletColors();
  const t = useDraftCopy(RECAP_COPY);
  const dateLocale = useDateLocale();
  const biggest = biggestDay(records, month, categories);
  const budget = facts.budget;
  const top = facts.top.slice(0, TOP_SHOWN);
  const byId = new Map(categories.map((category) => [category.id, category]));
  return (
    <>
      <View testID="recap-card" style={{ backgroundColor: colors.card, borderRadius: 22, padding: 16, gap: 4 }}>
        <WalletText role="caption" tone="quiet">{t('recap.spentLabel')}</WalletText>
        <WalletAmount minor={summary.expense_minor} size={36} testID="recap-spent" />
        {budget !== null || biggest !== null ? (
          <View testID="recap-card-rows" style={{ borderTopWidth: 1, borderTopColor: colors.hairline, marginTop: 6, paddingTop: 8, gap: 6 }}>
            {budget !== null ? (
              <>
                <FactRow label={t('recap.budget')}>
                  <WalletAmount minor={budget.limitMinor} size={17} testID="recap-budget" />
                </FactRow>
                <FactRow label={t(budget.over ? 'recap.over' : 'recap.under')}>
                  <WalletAmount minor={budget.over ? budget.overMinor : leftOf(budget)} size={17} tone={budget.over ? 'over' : 'under'} testID={budget.over ? 'recap-over' : 'recap-under'} />
                </FactRow>
              </>
            ) : null}
            {biggest !== null ? (
              <FactRow label={t('recap.biggestDay')}>
                <WalletText role="label" testID="recap-biggest-day">
                  {`${dayLabel(biggest.date, today, dateLocale).text}${biggest.payday ? ` ${t('recap.payday')}` : ''} · `}
                </WalletText>
                <WalletAmount minor={biggest.outMinor} size={17} testID="recap-biggest-day-amount" />
              </FactRow>
            ) : null}
          </View>
        ) : null}
      </View>

      {top.length > 0 ? (
        <View style={{ gap: 8 }}>
          <WalletText role="h2" accessibilityRole="header">{t('recap.topCategories')}</WalletText>
          <View testID="recap-top" style={{ backgroundColor: colors.card, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 2 }}>
            {top.map((item, index) => (
              <View
                key={item.categoryId}
                testID="recap-top-row"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.hairline }}
              >
                <WalletCategoryIcon category={byId.get(item.categoryId) ?? unknownCategory(item.categoryId)} name={item.name} size={32} />
                <WalletText role="label" style={{ flex: 1, minWidth: 0 }}>{item.name}</WalletText>
                <WalletAmount minor={item.minor} size={17} />
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {cashback !== null ? (
        <View
          testID="recap-cashback"
          style={{ backgroundColor: colors.toast, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}
        >
          <SparkleGlyph color={colors.onToast} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <WalletText role="label" tone="onToast" style={{ fontWeight: '700' }}>{t('recap.cashback', { n: cashback.count })}</WalletText>
            <WalletText role="caption" tone="onToast">
              {t('recap.cashbackDetail', { shops: shopNames(cashback.brands.slice(0, SHOPS_NAMED).map((brand) => brand.name), t), sister: t('recap.sister') })}
            </WalletText>
          </View>
        </View>
      ) : null}

      <View style={{ marginTop: 4, gap: 8 }}>
        <PrimaryButton label={t('recap.share')} onPress={onShare} testID="recap-share" />
        {shareProblem !== null ? <WalletText role="label" accessibilityRole="alert" testID="recap-share-problem">{shareProblem}</WalletText> : null}
      </View>
    </>
  );
}

export function WalletRecapScreen({ month, now }: { month: string; now?: Date }): ReactElement {
  const colors = useWalletColors();
  const insets = useSafeAreaInsets();
  const tc = useCopy();
  const t = useDraftCopy(RECAP_COPY);
  const dateLocale = useDateLocale();
  const moneyLocale = useMoneyLocale();
  const goBack = useGoBack('/spend/insights');
  const { hidden } = usePrivateMode();
  const { outbox } = useDiaryView();
  const today = todayInBangkok(now ?? new Date());
  const load = useRecapData(month, now, { withRecords: true });
  const view = recapView({ month, today, load, outbox, tc, locale: moneyLocale, dateLocale });
  const data = load.state === 'ready' ? load.data : null;
  const monthText = monthLabel(month, dateLocale);
  const cashback = useCashbackCount(data?.records ?? NO_RECORDS, data?.days.days.length ?? 0);
  const confetti = useCelebration(month, view.kind === 'recap' && view.phase === 'past');
  const [shareProblem, setShareProblem] = useState<string | null>(null);

  useEffect(() => setShareProblem(null), [month]);

  async function share(message: string) {
    setShareProblem(null);
    try {
      await shareText(message);
    } catch {
      setShareProblem(tc("Couldn't open sharing. Try again."));
    }
  }

  let body: ReactNode = null;
  let days: string | null = null;
  if (view.kind === 'loading') {
    body = <WalletText role="body" tone="quietOnGround" testID="recap-loading">{view.label}</WalletText>;
  } else if (view.kind === 'problem') {
    body = (
      <View testID="recap-problem" style={{ gap: 12 }}>
        <WalletText role="h2" accessibilityRole="header">{view.problem.title}</WalletText>
        <WalletText role="body" tone="quietOnGround">{view.problem.message}</WalletText>
        {view.problem.retry ? <PrimaryButton label={t('common.tryAgain')} onPress={load.reload} /> : null}
      </View>
    );
  } else if (view.kind === 'empty') {
    body = (
      <View testID="recap-empty" style={{ alignItems: 'center', gap: 8, paddingTop: 24 }}>
        <BunFace face="calm" size={76} />
        <WalletText role="h2" accessibilityRole="header" style={{ textAlign: 'center' }}>{view.title}</WalletText>
        <WalletText role="body" tone="quietOnGround" style={{ textAlign: 'center' }}>{view.body}</WalletText>
      </View>
    );
  } else if (data !== null && data.summary !== null) {
    const { summary, records, categories } = data;
    const shownDays = t('recap.days', { n: data.days.days.length, d: daysInMonth(month) });
    const top = view.facts.top.slice(0, TOP_SHOWN);
    const message = () => recapShareText(
      { monthLabel: monthText, daysLogged: shownDays, spentMinor: summary.expense_minor, budgetMinor: view.facts.budget?.limitMinor ?? null, top: top.map(({ name, minor }) => ({ name, minor })) },
      hidden,
      t,
    );
    days = shownDays;
    body = (
      <RecapBody
        month={month}
        today={today}
        summary={summary}
        records={records}
        categories={categories}
        facts={view.facts}
        cashback={cashback}
        shareProblem={shareProblem}
        onShare={() => void share(message())}
      />
    );
  }

  return (
    <View testID="bw-recap-screen" style={{ flex: 1, backgroundColor: colors.ground }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 28, paddingHorizontal: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <IconButton label={t('common.close')} onPress={goBack}>
            <CloseGlyph color={colors.ink} />
          </IconButton>
          <View testID="recap-month" style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <CalendarGlyph color={colors.ink} />
            <WalletText role="label">{monthText}</WalletText>
          </View>
        </View>
        <View style={{ alignItems: 'center', gap: 4 }}>
          {days !== null ? <BunFace face="happy" size={76} /> : null}
          <WalletText role="h1" accessibilityRole="header" testID="recap-title" style={{ textAlign: 'center' }}>
            {t('recap.title', { month: monthText })}
          </WalletText>
          {days !== null ? <WalletText role="label" tone="quietOnGround" testID="recap-days" style={{ textAlign: 'center' }}>{days}</WalletText> : null}
        </View>
        {body}
      </ScrollView>
      {confetti === month ? <Confetti key={month} /> : null}
    </View>
  );
}
