// The Bun Wallet's Categories screen (P2-T29, wc-categories).
// Displays active built-in and custom categories in 104 pt tiles with this
// month's spending against limit (or 'ไม่จำกัด'). Offers type switch
// (expense / income), Thai everyday pack card, new category button and tile,
// and manages CategoryTray and ThaiPackTray.
import type { BudgetDto, CategoryDto, CategoryType, Minor } from '@gogospend/contracts';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import { groupCategories } from '@mobile/spend/v1/redesign/planning/categoriesModel';
import type { CategoryItem } from '@mobile/spend/v1/redesign/planning/categoriesModel';
import { missingPackItems } from '@mobile/spend/v1/redesign/planning/thaiPack';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import { categoryName, monthOf, todayInBangkok } from '@mobile/spend/v1/viewModels';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { tileTint } from '@mobile/theme/walletPalette';
import { walletLineHeight } from '@mobile/theme/walletType';
import { useLoad, useMoneyLocale } from '@mobile/screens/v1/parts';
import { WalletAmount } from '../money/WalletAmount';
import { walletMoneyText } from '../money/walletMoney';
import { usePrivateMode } from '../privacy/PrivateModeProvider';
import { WalletText } from '../WalletText';
import { CategoryGlyph } from '../looks/WalletCategoryIcon';
import { useCategoryIcons } from '../looks/WalletLooksProvider';
import { CategoryTray } from './CategoryTray';
import { ThaiPackTray } from './ThaiPackTray';
import { useDraftCopy } from '../copy/useDraftCopy';
import { COMMON_COPY } from '../common/copy';
import { COPY } from './copy';

const LIFT = '0px 1px 4px rgba(17, 16, 20, 0.14)';

export type WalletCategoriesScreenProps = {
  now?: Date;
  onBack?: () => void;
};

export function WalletCategoriesScreen({ now: explicitNow, onBack }: WalletCategoriesScreenProps = {}) {
  const resources = useSpendV1();
  const tc = useCopy();
  const t = useDraftCopy(COPY);
  const commonT = useDraftCopy(COMMON_COPY);
  const locale = useMoneyLocale();
  const activeLocale = useActiveLocale();
  const colors = useWalletColors();
  const { hidden } = usePrivateMode();

  const now = explicitNow ?? new Date();
  const month = monthOf(todayInBangkok(now));

  const [selectedType, setSelectedType] = useState<CategoryType>('expense');
  const [editingCategory, setEditingCategory] = useState<CategoryDto | null>(null);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [packTrayVisible, setPackTrayVisible] = useState(false);

  // Load categories, budget, and summary
  const categoriesLoad = useLoad(async () => resources.categories(), [resources]);
  const budgetLoad = useLoad(async () => resources.budget(month), [resources, month]);
  const summaryLoad = useLoad(async () => resources.summary(month), [resources, month]);

  const categories: readonly CategoryDto[] = categoriesLoad.state === 'ready' ? categoriesLoad.data : [];
  const budget: BudgetDto | null = budgetLoad.state === 'ready' ? budgetLoad.data : null;
  const spentByCategory = useMemo(() => {
    const map = new Map<string, Minor>();
    if (summaryLoad.state === 'ready' && summaryLoad.data) {
      for (const row of summaryLoad.data.categories) {
        map.set(row.category_id, row.total_minor);
      }
    }
    return map;
  }, [summaryLoad]);

  const limitsByCategory = useMemo(() => {
    const map = new Map<string, Minor>();
    if (budget) {
      for (const limit of budget.category_limits) {
        map.set(limit.category_id, limit.limit_minor);
      }
    }
    return map;
  }, [budget]);

  const grouped = useMemo(
    () => groupCategories(categories, selectedType, { tc, budget }),
    [categories, selectedType, tc, budget]
  );
  const builtins = grouped.active.filter((item) => !item.custom);
  const custom = grouped.active.filter((item) => item.custom);

  // Missing Thai pack items
  const missingPack = useMemo(() => missingPackItems(categories), [categories]);
  const showPackCard = selectedType === 'expense' && missingPack.length > 0;

  const handleBack = () => {
    if (onBack) onBack();
  };

  const handleOpenNew = () => {
    setEditingCategory(null);
    setCreatingCategory(true);
  };

  const handleEdit = (category: CategoryDto) => {
    setEditingCategory(category);
    setCreatingCategory(false);
  };

  const handleCloseTray = () => {
    setEditingCategory(null);
    setCreatingCategory(false);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.ground }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Top header: Back, Title, New Category */}
        <View style={styles.topBar}>
          <Pressable
            role="button"
            aria-label={commonT('common.back')}
            onPress={handleBack}
            style={[styles.circleButton, { backgroundColor: colors.card, borderColor: colors.hairline }]}
          >
            <WalletText style={{ fontSize: 18, color: colors.ink }}>‹</WalletText>
          </Pressable>

          <WalletText role="h1" accessibilityRole="header" style={styles.title}>
            {t('categories.title')}
          </WalletText>

          <Pressable
            role="button"
            aria-label={t('categories.new')}
            onPress={handleOpenNew}
            style={[styles.circleButton, { backgroundColor: colors.card, borderColor: colors.hairline }]}
          >
            <WalletText style={{ fontSize: 20, color: colors.ink }}>+</WalletText>
          </Pressable>
        </View>

        {/* Type Switch Header: Expense / Income */}
        <View role="radiogroup" aria-label={t('categories.title')} style={[styles.typeSwitch, { backgroundColor: colors.raised }]}>
          <Pressable
            role="radio"
            aria-checked={selectedType === 'expense'}
            aria-label={t('categories.expense')}
            onPress={() => setSelectedType('expense')}
            style={[
              styles.typeSegment,
              { minHeight: 44 },
              selectedType === 'expense' && {
                backgroundColor: colors.card,
                boxShadow: !colors.isDark ? LIFT : undefined,
              },
            ]}
          >
            <WalletText
              role="label"
              style={[
                styles.typeLabel,
                selectedType === 'expense' ? { color: colors.ink, fontWeight: '700' } : { color: colors.quiet },
              ]}
            >
              {t('categories.expense')}
            </WalletText>
          </Pressable>

          <Pressable
            role="radio"
            aria-checked={selectedType === 'income'}
            aria-label={t('categories.income')}
            onPress={() => setSelectedType('income')}
            style={[
              styles.typeSegment,
              { minHeight: 44 },
              selectedType === 'income' && {
                backgroundColor: colors.card,
                boxShadow: !colors.isDark ? LIFT : undefined,
              },
            ]}
          >
            <WalletText
              role="label"
              style={[
                styles.typeLabel,
                selectedType === 'income' ? { color: colors.ink, fontWeight: '700' } : { color: colors.quiet },
              ]}
            >
              {t('categories.income')}
            </WalletText>
          </Pressable>
        </View>

        {/* Thai Everyday Pack Card (if any missing C3 items) */}
        {showPackCard && (
          <Pressable
            role="button"
            aria-label={`${t('categories.packTitle')} ${t('categories.packName')}`}
            onPress={() => setPackTrayVisible(true)}
            style={[styles.packCard, { backgroundColor: colors.card, borderColor: colors.hairline }]}
          >
            <View style={styles.packHeader}>
              <WalletText role="label" style={{ color: colors.violet, fontWeight: '700' }}>
                {t('categories.packTitle')}
              </WalletText>
              <WalletText role="h2" style={{ color: colors.ink }}>
                {t('categories.packName')}
              </WalletText>
            </View>
            <WalletText role="caption" style={[styles.packSummary, { color: colors.quiet }]}>
              {missingPack.slice(0, 3).map((item) => activeLocale === 'th' ? item.th : item.en).join(', ')}
              {missingPack.length > 3 ? ` ${t('categories.packMore', { n: missingPack.length - 3 })}` : ''}
            </WalletText>
          </Pressable>
        )}

        {/* Built-in Categories Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <WalletText role="label" style={[styles.sectionTitle, { color: colors.ink }]}>
              {t('categories.builtins')}
            </WalletText>
            <WalletText role="caption" style={{ color: colors.quiet }}>{t('categories.thisMonth')}</WalletText>
          </View>
          <View style={styles.grid}>
            {builtins.map((item) => (
              <CategoryTile
                key={item.category.id}
                category={item.category}
                spentMinor={spentByCategory.get(item.category.id) ?? '0'}
                limitMinor={limitsByCategory.get(item.category.id) ?? null}
                onPress={() => handleEdit(item.category)}
              />
            ))}
          </View>
        </View>

        {/* Custom Categories Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <WalletText role="label" style={[styles.sectionTitle, { color: colors.ink }]}>
              {t('categories.custom')}
            </WalletText>
            <WalletText role="caption" style={{ color: colors.quiet }}>{t('categories.thisMonth')}</WalletText>
          </View>
          <View style={styles.grid}>
            {custom.map((item) => (
              <CategoryTile
                key={item.category.id}
                category={item.category}
                spentMinor={spentByCategory.get(item.category.id) ?? '0'}
                limitMinor={limitsByCategory.get(item.category.id) ?? null}
                onPress={() => handleEdit(item.category)}
              />
            ))}
            {/* New Category Dashed Tile */}
            <Pressable
              role="button"
              aria-label={t('categories.new')}
              onPress={handleOpenNew}
              style={[styles.tile, styles.newTile, { borderColor: colors.hairline }]}
            >
              <View style={[styles.tileIcon, styles.newTileIcon, { backgroundColor: colors.raised }]}>
                <WalletText style={{ fontSize: 24, color: colors.ink }}>+</WalletText>
              </View>
              <WalletText role="label" style={[styles.newTileText, { color: colors.quiet }]}>
                {t('categories.new')}
              </WalletText>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {/* Trays */}
      <CategoryTray
        visible={editingCategory !== null || creatingCategory}
        onClose={handleCloseTray}
        category={editingCategory}
        type={selectedType}
        now={now}
      />

      <ThaiPackTray
        visible={packTrayVisible}
        onClose={() => setPackTrayVisible(false)}
        categories={categories}
      />
    </View>
  );
}

function CategoryTile({
  category,
  spentMinor,
  limitMinor,
  onPress,
}: {
  category: CategoryDto;
  spentMinor: Minor;
  limitMinor: Minor | null;
  onPress(): void;
}) {
  const tc = useCopy();
  const t = useDraftCopy(COPY);
  const commonT = useDraftCopy(COMMON_COPY);
  const colors = useWalletColors();
  const { iconOf } = useCategoryIcons();
  const { hidden } = usePrivateMode();

  const name = categoryName(category, tc);
  const glyph = iconOf(category);
  const isOver = limitMinor !== null && BigInt(spentMinor) > BigInt(limitMinor);
  const overMinor = isOver ? (BigInt(spentMinor) - BigInt(limitMinor)).toString() : '0';

  let limitLabel = '';
  let tileAriaLabel = '';

  const spentFormatted = walletMoneyText(spentMinor);
  const limitFormatted = limitMinor !== null ? walletMoneyText(limitMinor) : '';
  const overFormatted = walletMoneyText(overMinor);

  if (hidden) {
    limitLabel = isOver ? t('categories.over', { amount: '••••' }) : limitMinor !== null ? t('categories.limit', { amount: '••••' }) : t('categories.unlimited');
    tileAriaLabel = `${name} ${commonT('common.amountHidden')}`;
  } else if (isOver) {
    limitLabel = t('categories.over', { amount: overFormatted });
    tileAriaLabel = t('categories.tileOver', { name, spent: spentFormatted, over: overFormatted });
  } else if (limitMinor !== null) {
    limitLabel = t('categories.limit', { amount: limitFormatted });
    tileAriaLabel = t('categories.tileLabel', { name, spent: spentFormatted, limit: limitFormatted });
  } else {
    limitLabel = t('categories.unlimited');
    tileAriaLabel = t('categories.tileUnlimited', { name, spent: spentFormatted });
  }

  const tileBg = category.color ? tileTint(category.color, false) : colors.card;

  return (
    <Pressable
      role="button"
      aria-label={tileAriaLabel}
      onPress={onPress}
      style={[styles.tile, { backgroundColor: tileBg }]}
    >
      <View style={styles.tileIcon}>
        {glyph ? (
          <CategoryGlyph glyph={glyph} size={24} color={colors.ink} />
        ) : (
          <WalletText style={[styles.initial, { color: colors.ink }]}>
            {name.charAt(0)}
          </WalletText>
        )}
      </View>

      <View style={styles.tileFooter}>
        <WalletText style={styles.tileName}>
          {name}
        </WalletText>
        <WalletAmount minor={spentMinor} size={13} tone="ink" />
        <WalletText
          role="caption"
          style={[styles.tileLimit, isOver ? { color: colors.over, fontWeight: '700' } : { color: colors.quiet }]}
        >
          {limitLabel}
        </WalletText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 52,
    paddingBottom: 36,
    gap: 16,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  circleButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  typeSwitch: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 3,
    minHeight: 50,
  },
  typeSegment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    minHeight: 44,
  },
  typeLabel: {
    fontSize: 15,
  },
  packCard: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
  },
  packHeader: {
    gap: 2,
  },
  packSummary: {
    fontSize: 13,
  },
  section: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  tile: {
    width: 104,
    height: 104,
    borderRadius: 20,
    padding: 10,
    justifyContent: 'space-between',
  },
  newTile: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  newTileIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newTileText: {
    fontSize: 13,
  },
  tileIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: walletLineHeight(18, 'thai'),
  },
  tileFooter: {
    gap: 1,
  },
  tileName: {
    fontSize: 13,
    fontWeight: '600',
  },
  tileLimit: {
    fontSize: 11,
  },
});
