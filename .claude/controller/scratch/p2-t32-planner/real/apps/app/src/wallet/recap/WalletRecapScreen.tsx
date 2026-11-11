// The Bun Wallet month recap screen (bw-recap, P2-T32).
import { BUILTIN_CASHBACK_BRANDS, GOGOCASH_HOME } from '@gogospend/contracts';
import type { CategoryDto, Minor } from '@gogospend/contracts';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { AccessibilityInfo, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import { playHaptic } from '@mobile/lib/hapticMoment';
import { shareText, useRecapData } from '@mobile/screens/redesign/insights/recapData';
import { useAiCompanion } from '@mobile/spend/v1/ai/AiCompanionProvider';
import { countCashbackPurchases } from '@mobile/spend/v1/ai/cashbackModel';
import { monthPhase } from '@mobile/spend/v1/redesign/insights/recapModel';
import { categoryName, todayInBangkok } from '@mobile/spend/v1/viewModels';
import { Text } from '@mobile/theme/AppText';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { LATIN_UI_FONT_FAMILY } from '@mobile/theme/uiFontFamily';
import { monthLabel } from '@mobile/ui/dateStep';
import { useDraftCopy } from '../copy/useDraftCopy';
import { BunFace } from '../looks/BunFace';
import { WalletCategoryIcon } from '../looks/WalletCategoryIcon';
import { WalletAmount } from '../money/WalletAmount';
import { useReducedMotionKnown, useWalletReducedMotion } from '../motion/reducedMotion';
import { usePrivateMode } from '../privacy/PrivateModeProvider';
import { walletDeviceStore } from '../store/deviceWalletStore';
import { PrimaryButton } from '../tray/PrimaryButton';
import { biggestDay } from './biggestDay';
import { CONFETTI_NAME, Confetti } from './Confetti';
import { COPY } from './copy';
import { recapShareText } from './recapShare';

function daysInMonth(month: string): number {
  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr, 10);
  const m = parseInt(monthStr, 10);
  return new Date(Date.UTC(year, m, 0)).getUTCDate();
}

const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const EN_MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatShortDate(date: string, locale: string): string {
  const parts = date.split('-');
  if (parts.length < 3) return date;
  const day = parseInt(parts[2], 10);
  const monthIndex = parseInt(parts[1], 10) - 1;
  const months = locale === 'th' ? THAI_MONTHS_SHORT : EN_MONTHS_SHORT;
  return `${day} ${months[monthIndex] ?? ''}`;
}

export function WalletRecapScreen({ month, now }: { month: string; now?: Date }): ReactElement {
  const router = useRouter();
  const colors = useWalletColors();
  const locale = useActiveLocale();
  const tc = useCopy();
  const t = useDraftCopy(COPY);
  const { hidden } = usePrivateMode();
  const reducedMotion = useWalletReducedMotion();
  const motionKnown = useReducedMotionKnown();
  const { preferences } = useAiCompanion();

  const [showConfetti, setShowConfetti] = useState(false);

  const today = todayInBangkok(now ?? new Date());
  const load = useRecapData(month, now);

  // Confetti rule (R66): first opening of a past month's recap on this phone plays Confetti and keeps CONFETTI_NAME(month).
  // Decided at mount: under reduced motion or before answer is known, only celebration haptic plays.
  useEffect(() => {
    const isPast = monthPhase(month, today) === 'past';
    if (!isPast) return;

    void walletDeviceStore().get(CONFETTI_NAME(month)).then(async (seen) => {
      if (!seen) {
        void walletDeviceStore().set(CONFETTI_NAME(month), '1');
        playHaptic('celebration');

        // R66: before the phone's answer is known, only the celebration haptic plays.
        const isReduced = await Promise.race([
          AccessibilityInfo.isReduceMotionEnabled(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 0)),
        ]);
        if (isReduced === false) {
          setShowConfetti(true);
        }
      }
    });
  }, [month, today]);

  const monthTitle = useMemo(() => monthLabel(month, locale === 'th' ? 'th' : 'en'), [month, locale]);

  if (load.state === 'loading') {
    return (
      <View testID="bw-recap-loading" style={[styles.container, { backgroundColor: colors.ground }]}>
        <Text style={{ color: colors.quiet }}>{tc('Loading…')}</Text>
      </View>
    );
  }

  if (load.state === 'error') {
    return (
      <View testID="bw-recap-error" style={[styles.container, { backgroundColor: colors.ground }]}>
        <Text style={{ color: colors.over }}>{tc('Something went wrong')}</Text>
      </View>
    );
  }

  const { data } = load;
  const summary = data.summary;
  const categories = data.categories;
  const records = data.records;
  const daysLoggedCount = data.days.days.length;
  const totalDays = daysInMonth(month);

  const spentMinor: Minor = summary?.expense_minor ?? '0';
  const budgetLimitMinor: Minor | null = summary?.budget?.overall_limit_minor ?? null;
  const spentBig = BigInt(spentMinor);
  const budgetBig = budgetLimitMinor !== null ? BigInt(budgetLimitMinor) : null;

  const isOver = budgetBig !== null && spentBig > budgetBig;
  const diffMinor: Minor = budgetBig !== null ? (isOver ? String(spentBig - budgetBig) as Minor : String(budgetBig - spentBig) as Minor) : '0';

  const biggest = biggestDay(records, month, categories);

  // Top 3 categories
  const byId = new Map<string, CategoryDto>(categories.map((c) => [c.id, c]));
  const topCategories = (summary?.categories ?? [])
    .filter((ct) => ct.type === 'expense' && BigInt(ct.total_minor) > 0n)
    .sort((a, b) => {
      const diff = BigInt(b.total_minor) - BigInt(a.total_minor);
      return diff > 0n ? 1 : diff < 0n ? -1 : 0;
    })
    .slice(0, 3)
    .map((ct) => {
      const cat = byId.get(ct.category_id);
      return {
        id: ct.category_id,
        category: cat,
        name: cat ? categoryName(cat, tc) : tc('Category'),
        minor: ct.total_minor,
      };
    });

  // Cashback
  const cashbackCount = preferences?.cashback_tips
    ? countCashbackPurchases(records, BUILTIN_CASHBACK_BRANDS).count
    : 0;

  const handleShare = async () => {
    const text = recapShareText(
      {
        monthLabel: monthTitle,
        daysLogged: t('recap.days', { n: daysLoggedCount, d: totalDays }),
        spentMinor,
        budgetMinor: budgetLimitMinor,
        top: topCategories.map((c) => ({ name: c.name, minor: c.minor })),
      },
      hidden,
      t,
    );
    await shareText(text);
  };

  return (
    <View testID="bw-recap-screen" style={[styles.container, { backgroundColor: colors.ground }]}>
      {showConfetti ? <Confetti testID="recap-confetti" /> : null}

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Top bar: close button + month pill */}
        <View style={styles.topBar}>
          <Pressable
            testID="bw-recap-close"
            accessibilityLabel={tc('Close')}
            accessibilityRole="button"
            onPress={() => router.back()}
            style={[styles.closeButton, { backgroundColor: colors.raised }]}
          >
            <Text style={{ fontSize: 18, color: colors.ink }}>✕</Text>
          </Pressable>

          <View style={[styles.monthChip, { backgroundColor: colors.raised }]}>
            <Text style={[styles.monthChipText, { color: colors.ink }]}>{monthTitle}</Text>
          </View>
        </View>

        {/* Hero: Bun Face + Title + Days */}
        <View style={styles.hero}>
          <BunFace face="happy" size={76} />
          <Text testID="recap-title" style={[styles.title, { color: colors.ink }]}>
            {t('recap.title', { month: monthTitle })}
          </Text>
          <Text testID="recap-days" style={[styles.days, { color: colors.quiet }]}>
            {t('recap.days', { n: daysLoggedCount, d: totalDays })}
          </Text>
        </View>

        {/* Spending Card */}
        <View testID="recap-card" style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.cardLabel, { color: colors.quiet }]}>{t('recap.spentLabel')}</Text>
          <View style={styles.spentAmountRow}>
            <WalletAmount minor={spentMinor} size={36} testID="recap-spent" />
          </View>

          <View style={[styles.cardDivider, { borderTopColor: colors.hairline }]} />

          {budgetLimitMinor !== null ? (
            <View style={styles.cardRow}>
              <Text style={{ color: colors.quiet }}>{t('recap.budget')}</Text>
              <WalletAmount minor={budgetLimitMinor} size={17} testID="recap-budget" />
            </View>
          ) : null}

          {budgetLimitMinor !== null ? (
            <View style={styles.cardRow}>
              <Text style={{ color: colors.quiet }}>{isOver ? t('recap.over') : t('recap.under')}</Text>
              <WalletAmount
                minor={diffMinor}
                size={17}
                tone={isOver ? 'over' : 'under'}
                color={isOver ? undefined : '#1A7F4B'}
                testID={isOver ? 'recap-over' : 'recap-under'}
              />
            </View>
          ) : null}

          {biggest !== null ? (
            <View style={styles.cardRow}>
              <Text style={{ color: colors.quiet }}>{t('recap.biggestDay')}</Text>
              <View style={styles.biggestDayRight}>
                <Text style={{ color: colors.ink }}>
                  {formatShortDate(biggest.date, locale)}
                  {biggest.payday ? ` · ${t('recap.payday')}` : ''}
                </Text>
                <Text style={{ color: colors.quiet }}> · </Text>
                <WalletAmount minor={biggest.outMinor} size={17} testID="recap-biggest-day-amount" />
              </View>
            </View>
          ) : null}
        </View>

        {/* Top Categories */}
        {topCategories.length > 0 ? (
          <View style={styles.categoriesSection}>
            <Text style={[styles.sectionHeading, { color: colors.ink }]}>{t('recap.topCategories')}</Text>
            <View style={[styles.categoriesCard, { backgroundColor: colors.card }]}>
              {topCategories.map((item, idx) => (
                <View
                  key={item.id}
                  style={[
                    styles.categoryRow,
                    idx < topCategories.length - 1 && [styles.categoryBorder, { borderBottomColor: colors.hairline }],
                  ]}
                >
                  {item.category ? (
                    <WalletCategoryIcon category={item.category} name={item.name} size={32} />
                  ) : (
                    <View style={styles.categoryPlaceholder} />
                  )}
                  <Text style={[styles.categoryName, { color: colors.ink }]}>{item.name}</Text>
                  <WalletAmount minor={item.minor} size={17} />
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Cashback Card (shown only when tips on and count > 0) */}
        {cashbackCount > 0 ? (
          <Pressable
            testID="recap-cashback-card"
            accessibilityRole="link"
            onPress={() => void Linking.openURL(GOGOCASH_HOME)}
            style={styles.cashbackCard}
          >
            <View style={styles.cashbackIconCircle}>
              <Text style={{ color: '#FFFFFF', fontSize: 16 }}>✦</Text>
            </View>
            <View style={styles.cashbackTextWrap}>
              <Text style={styles.cashbackTitle}>{t('recap.cashback', { n: cashbackCount })}</Text>
              <Text style={styles.cashbackDetail}>{t('recap.cashbackDetail')}</Text>
            </View>
            <Text style={{ color: '#C9C6D4', fontSize: 16 }}>›</Text>
          </Pressable>
        ) : null}

        {/* Share Button (PrimaryButton, label recap.share, never says การ์ด) */}
        <View style={styles.footer}>
          <PrimaryButton
            label={t('recap.share')}
            onPress={handleShare}
            testID="recap-share-button"
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 40,
    gap: 16,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthChip: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthChipText: {
    fontSize: 14,
    fontFamily: LATIN_UI_FONT_FAMILY,
  },
  hero: {
    alignItems: 'center',
    gap: 6,
    marginVertical: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  days: {
    fontSize: 15,
    textAlign: 'center',
  },
  card: {
    borderRadius: 22,
    padding: 16,
    gap: 8,
  },
  cardLabel: {
    fontSize: 13,
  },
  spentAmountRow: {
    marginVertical: 4,
  },
  cardDivider: {
    borderTopWidth: 1,
    marginVertical: 6,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  biggestDayRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoriesSection: {
    gap: 8,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '700',
  },
  categoriesCard: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  categoryBorder: {
    borderBottomWidth: 1,
  },
  categoryPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#FFE3CC',
  },
  categoryName: {
    flex: 1,
    fontSize: 15,
  },
  cashbackCard: {
    backgroundColor: '#111014',
    borderRadius: 20,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cashbackIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2A2830',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cashbackTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  cashbackTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  cashbackDetail: {
    color: '#C9C6D4',
    fontSize: 12,
  },
  footer: {
    marginTop: 16,
  },
});
