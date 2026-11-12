// The Bun Wallet's Categories screen (P2-T29; wc-categories, W1): back and
// new, the heading, the type segments, the Thai pack card, the built-in and
// custom grids of 104 pt tiles with this month's spending against each limit,
// the new tile, and the archived categories with นำกลับมาใช้.
//
// - One read, as today's screen reads: the categories (ensureBuiltinCategories),
//   this month's budget and this month's summary together. Loading says so;
//   a read that fails says why in today's words, with Try again when trying
//   again can help, and shows no grid, no tiles and no pack card in its place.
// - A tile is the category's glyph (the kept icon, the pack's or the
//   built-in's) or its initial, on its colour tinted for the mode (the kit's
//   tileTint), with its name, this month's money and, for spending, its limit:
//   งบ {amount}, ไม่จำกัด, or เกิน {amount} in `over` on a card chip (the over
//   colour reads 4.5:1 on the card, not on every tint). Spending equal to its
//   limit is not over. Income says what came in, never a limit. Each tile is
//   one button, labelled as the board labels it, with ฿ read as บาท.
// - The pack card shows while any of C3's nine is missing: the first three
//   missing names, then และอีก {n} หมวด. It opens ThaiPackTray.
// - The trays: a tile opens CategoryTray for it, new opens it for a new
//   category of the type shown, and the pack card opens ThaiPackTray. A tray
//   that closes may have changed something (saved, or sent a change whose
//   answer never came), so the screen reads again in place.
// - Back goes back, or to Budget when there is nothing to go back to, as
//   today's screen does.
// - Private mode (W10): every amount is ฿••••, and each tile says only that
//   its amount is hidden.
// - Nothing is clamped to a line: tiles grow with their words, and at the
//   largest text sizes each tile takes a row of its own.
import type { BudgetDto, CategoryDto, CategoryType, Minor, MonthSummary } from '@gogospend/contracts';
import { CATEGORY_COLORS } from '@gogospend/contracts';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import { useGoBack } from '@mobile/screens/redesign/HistoryParts';
import { useCategoryCommands } from '@mobile/screens/redesign/planning/categoryCommands';
import { useLoad } from '@mobile/screens/v1/parts';
import { classifyLoadProblem } from '@mobile/spend/v1/redesign/homeModel';
import { archiveCommand, groupCategories } from '@mobile/spend/v1/redesign/planning/categoriesModel';
import type { CategoryItem } from '@mobile/spend/v1/redesign/planning/categoriesModel';
import { THAI_EVERYDAY_PACK, missingPackItems } from '@mobile/spend/v1/redesign/planning/thaiPack';
import type { C3Item } from '@mobile/spend/v1/redesign/planning/thaiPack';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import { monthOf, todayInBangkok } from '@mobile/spend/v1/viewModels';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { tileTint } from '@mobile/theme/walletPalette';
import { DECORATIVE } from '@mobile/ui/a11y';
import { Glyph } from '@mobile/ui/Glyph';
import { useLargeText } from '@mobile/ui/largeText';
import { COMMON_COPY } from '../common/copy';
import { useDraftCopy } from '../copy/useDraftCopy';
import { IconButton } from '../controls/IconButton';
import { PACK_GLYPH } from '../looks/categoryIcons';
import { CategoryGlyph, WalletCategoryIcon } from '../looks/WalletCategoryIcon';
import { useCategoryIcons } from '../looks/WalletLooksProvider';
import { WalletAmount } from '../money/WalletAmount';
import { HIDDEN_AMOUNT, spokenMoney, walletMoneyText } from '../money/walletMoney';
import { usePrivateMode } from '../privacy/PrivateModeProvider';
import { TextLink } from '../tray/TextLink';
import { WalletText } from '../WalletText';
import { CategoryMark, CategoryTray } from './CategoryTray';
import { COPY } from './copy';
import { ThaiPackTray } from './ThaiPackTray';

const LINES = { ...COMMON_COPY, ...COPY } as const;

/** wc-categories' tile, the chosen segment's lift by day, and the pack card's yellow (CATEGORY_COLORS' fourth, tinted). */
const TILE = 104;
const LIFT = '0px 2px 6px rgba(17, 16, 20, 0.08)';
const PACK_HUE = CATEGORY_COLORS[3];

type Loaded = { categories: CategoryDto[]; budget: BudgetDto | null; summary: MonthSummary };
/** The tray open: the category tray (a category, or null for a new one) or the pack tray. */
type Open = { tray: 'category'; category: CategoryDto | null } | { tray: 'pack' };

export type WalletCategoriesScreenProps = {
  /** The clock, for tests; this month is its Bangkok month. */
  now?: Date;
};

export function WalletCategoriesScreen({ now }: WalletCategoriesScreenProps = {}) {
  const resources = useSpendV1();
  const insets = useSafeAreaInsets();
  const colors = useWalletColors();
  const tc = useCopy();
  const t = useDraftCopy(LINES);
  const goBack = useGoBack('/spend/budget');
  const month = monthOf(todayInBangkok(now ?? new Date()));
  const loaded = useLoad(async (): Promise<Loaded> => {
    const [categories, budget, summary] = await Promise.all([resources.ensureBuiltinCategories(), resources.budget(month), resources.summary(month)]);
    return { categories, budget, summary };
  }, [resources, month]);
  const [type, setType] = useState<CategoryType>('expense');
  const [open, setOpen] = useState<Open | null>(null);
  const data = loaded.state === 'ready' ? loaded.data : null;
  // A tray that closes may have changed something: read again in place (the grid stays while it reads).
  const closeTray = () => {
    setOpen(null);
    loaded.refresh();
  };
  const plus = (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path d="M12 5v14M5 12h14" fill="none" stroke={colors.ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
  return (
    <View testID="categories-screen" style={{ flex: 1, backgroundColor: colors.ground }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 18, paddingBottom: insets.bottom + 24, gap: 12 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <IconButton label={t('common.back')} onPress={goBack}>
            <Glyph name="chevron-left" size={18} color={colors.ink} />
          </IconButton>
          {data === null ? null : (
            <IconButton label={t('categories.new')} onPress={() => setOpen({ tray: 'category', category: null })}>
              <View {...DECORATIVE}>{plus}</View>
            </IconButton>
          )}
        </View>
        <WalletText role="h1" accessibilityRole="header">{t('categories.title')}</WalletText>
        {loaded.state === 'loading' ? <WalletText testID="categories-loading" role="label" tone="quietOnGround">{tc('Loading your diary')}</WalletText> : null}
        {loaded.state === 'error' ? <LoadProblem error={loaded.error} onRetry={loaded.reload} /> : null}
        {data === null ? null : (
          <CategoriesBody data={data} type={type} onType={setType} onOpen={setOpen} onChanged={loaded.refresh} />
        )}
      </ScrollView>
      {data === null ? null : (
        <>
          <CategoryTray
            visible={open?.tray === 'category'}
            onClose={closeTray}
            category={open?.tray === 'category' ? open.category : null}
            type={type}
            budget={data.budget}
          />
          <ThaiPackTray visible={open?.tray === 'pack'} onClose={closeTray} categories={data.categories} />
        </>
      )}
    </View>
  );
}

function CategoriesBody({ data, type, onType, onOpen, onChanged }: {
  data: Loaded;
  type: CategoryType;
  onType(type: CategoryType): void;
  onOpen(open: Open): void;
  onChanged(): void;
}) {
  const tc = useCopy();
  const t = useDraftCopy(LINES);
  const groups = groupCategories(data.categories, type, { tc, budget: data.budget });
  const spent = new Map(data.summary.categories.map((total) => [total.category_id, total.total_minor]));
  const missingKeys = new Set(missingPackItems(data.categories).map((item) => item.key));
  const missing = THAI_EVERYDAY_PACK.filter((item) => missingKeys.has(item.key));
  const tile = (item: CategoryItem) => (
    <CategoryTile key={item.category.id} item={item} spentMinor={spent.get(item.category.id) ?? '0'} onPress={() => onOpen({ tray: 'category', category: item.category })} />
  );
  return (
    <>
      <TypeSwitch type={type} onType={onType} />
      {missing.length > 0 ? <PackCard missing={missing} onPress={() => onOpen({ tray: 'pack' })} /> : null}
      <View testID="categories-builtins" style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 8 }}>
          <WalletText role="h2" accessibilityRole="header">{t('categories.builtins')}</WalletText>
          <WalletText role="caption" tone="quietOnGround">{t('categories.thisMonth')}</WalletText>
        </View>
        <TileGrid>{groups.active.filter((item) => !item.custom).map(tile)}</TileGrid>
      </View>
      <View testID="categories-custom" style={{ gap: 10 }}>
        <WalletText role="h2" accessibilityRole="header">{t('categories.custom')}</WalletText>
        <TileGrid>
          {[...groups.active.filter((item) => item.custom).map(tile), <NewTile key="new" onPress={() => onOpen({ tray: 'category', category: null })} />]}
        </TileGrid>
      </View>
      {groups.archived.length > 0 ? <ArchivedCategories items={groups.archived} onChanged={onChanged} /> : null}
    </>
  );
}

/** Three tiles to a row, each the same width; at the largest text sizes one to a row. */
function TileGrid({ children }: { children: ReactNode[] }) {
  const large = useLargeText();
  const perRow = large ? 1 : 3;
  const rows: ReactNode[][] = [];
  for (let at = 0; at < children.length; at += perRow) rows.push(children.slice(at, at + perRow));
  return (
    <View style={{ gap: 10 }}>
      {rows.map((row, index) => (
        <View key={index} style={{ flexDirection: 'row', gap: 10 }}>
          {row}
          {/* A short last row keeps its tiles the width of the others. */}
          {Array.from({ length: perRow - row.length }, (_, gap) => <View key={`gap-${gap}`} style={{ flex: 1 }} />)}
        </View>
      ))}
    </View>
  );
}

/** รายจ่าย and รายรับ (wc-categories): the chosen one a card segment with bold ink words. */
function TypeSwitch({ type, onType }: { type: CategoryType; onType(type: CategoryType): void }) {
  const colors = useWalletColors();
  const large = useLargeText();
  const t = useDraftCopy(LINES);
  return (
    <View
      testID="categories-type"
      role="radiogroup"
      accessibilityLabel={t('categories.typeGroup')}
      style={{ flexDirection: large ? 'column' : 'row', gap: 2, padding: 4, borderRadius: 14, backgroundColor: colors.track }}
    >
      {(['expense', 'income'] as const).map((each) => {
        const checked = each === type;
        const label = t(each === 'expense' ? 'categories.expense' : 'categories.income');
        return (
          <Pressable
            key={each}
            accessibilityRole="radio"
            accessibilityLabel={label}
            accessibilityState={{ checked }}
            aria-checked={checked}
            onPress={() => onType(each)}
            style={{
              flex: large ? undefined : 1,
              minHeight: 44,
              borderRadius: 11,
              paddingHorizontal: 8,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: checked ? colors.card : 'transparent',
              boxShadow: checked && !colors.isDark ? LIFT : undefined,
            }}
          >
            <WalletText role="label" tone={checked ? 'ink' : 'quietOnGround'} style={{ fontWeight: checked ? '700' : '500', textAlign: 'center' }}>{label}</WalletText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The pack card (wc-categories): three of the missing items' glyphs, its name, and the first three missing names. */
function PackCard({ missing, onPress }: { missing: readonly C3Item[]; onPress(): void }) {
  const colors = useWalletColors();
  const locale = useActiveLocale();
  const t = useDraftCopy(LINES);
  const first = missing.slice(0, 3);
  const names = first.map((item) => (locale === 'th' ? item.th : item.en)).join(locale === 'th' ? ' ' : ', ');
  const more = missing.length - first.length;
  const line = more > 0 ? `${names} ${t('categories.packMore', { n: more })}` : names;
  return (
    <Pressable
      testID="categories-pack"
      accessibilityRole="button"
      accessibilityLabel={`${t('categories.packTitle')} ${t('categories.packName')} ${line}`}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 84,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 20,
        backgroundColor: tileTint(PACK_HUE, colors.isDark),
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View {...DECORATIVE} style={{ width: 64, height: 62 }}>
        {first.map((item, index) => (
          <View
            key={item.key}
            style={{
              position: 'absolute',
              left: [0, 33, 15][index],
              top: [2, 0, 31][index],
              width: 31,
              height: 31,
              borderRadius: 10,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: tileTint(item.color, colors.isDark),
              transform: [{ rotate: ['-8deg', '7deg', '-3deg'][index] }],
            }}
          >
            <CategoryGlyph glyph={PACK_GLYPH[item.key]} size={17} color={colors.ink} />
          </View>
        ))}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <WalletText role="label" style={{ fontWeight: '700' }}>{t('categories.packTitle')}</WalletText>
        <WalletText role="label" style={{ fontWeight: '700' }}>{t('categories.packName')}</WalletText>
        <WalletText testID="categories-pack-line" role="caption" tone="quietOnGround">{line}</WalletText>
      </View>
      <View {...DECORATIVE}>
        <Glyph name="chevron-right" size={12} color={colors.ink} />
      </View>
    </Pressable>
  );
}

/** A 104 pt tile (wc-categories), labelled as the board labels it. */
function CategoryTile({ item, spentMinor, onPress }: { item: CategoryItem; spentMinor: Minor; onPress(): void }) {
  const colors = useWalletColors();
  const t = useDraftCopy(LINES);
  const { hidden } = usePrivateMode();
  const { iconOf } = useCategoryIcons();
  const { category, name, limitMinor } = item;
  const income = category.type === 'income';
  // Spending equal to its limit is not over (budgetPace's rule). Limits are spending's only.
  const overMinor = limitMinor !== null && BigInt(spentMinor) > BigInt(limitMinor) ? (BigInt(spentMinor) - BigInt(limitMinor)).toString() : null;
  const shown = (minor: Minor) => (hidden ? HIDDEN_AMOUNT : walletMoneyText(minor));
  const spoken = (minor: Minor) => spokenMoney(minor, t);
  const label = hidden
    ? `${name} ${t('common.amountHidden')}`
    : income
      ? t('categories.tileIncome', { name, amount: spoken(spentMinor) })
      : overMinor !== null
        ? t('categories.tileOver', { name, spent: spoken(spentMinor), over: spoken(overMinor) })
        : limitMinor !== null
          ? t('categories.tileLabel', { name, spent: spoken(spentMinor), limit: spoken(limitMinor) })
          : t('categories.tileUnlimited', { name, spent: spoken(spentMinor) });
  return (
    <Pressable
      testID={`category-tile-${category.id}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minWidth: 0,
        minHeight: TILE,
        paddingVertical: 11,
        paddingHorizontal: 12,
        borderRadius: 18,
        justifyContent: 'space-between',
        gap: 4,
        backgroundColor: category.color === null ? colors.raised : tileTint(category.color, colors.isDark),
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <CategoryMark glyph={iconOf(category)} name={name} size={22} />
      <View>
        <WalletText role="label" style={{ fontWeight: '700' }}>{name}</WalletText>
        <WalletAmount minor={spentMinor} size={13} tone="ink" />
        {income ? null : overMinor !== null ? (
          <View testID={`category-over-${category.id}`} style={{ alignSelf: 'flex-start', paddingHorizontal: 6, borderRadius: 8, backgroundColor: colors.card }}>
            <WalletText role="caption" tone="over" style={{ fontWeight: '700' }}>{t('categories.over', { amount: shown(overMinor) })}</WalletText>
          </View>
        ) : (
          <WalletText testID={`category-limit-${category.id}`} role="caption" tone="quietOnGround">
            {limitMinor === null ? t('categories.unlimited') : t('categories.limit', { amount: shown(limitMinor) })}
          </WalletText>
        )}
      </View>
    </Pressable>
  );
}

/** หมวดใหม่ (wc-categories): a dashed tile with the ink + . */
function NewTile({ onPress }: { onPress(): void }) {
  const colors = useWalletColors();
  const t = useDraftCopy(LINES);
  return (
    <Pressable
      testID="categories-new-tile"
      accessibilityRole="button"
      accessibilityLabel={t('categories.new')}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minWidth: 0,
        minHeight: TILE,
        padding: 8,
        borderRadius: 18,
        borderWidth: 2,
        borderStyle: 'dashed',
        borderColor: colors.hairline,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View {...DECORATIVE} style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }}>
        <Svg width={16} height={16} viewBox="0 0 24 24">
          <Path d="M12 5v14M5 12h14" fill="none" stroke={colors.onPrimary} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </View>
      <WalletText role="label" style={{ fontWeight: '700', textAlign: 'center' }}>{t('categories.new')}</WalletText>
    </Pressable>
  );
}

/**
 * The archived categories of the type shown, each with นำกลับมาใช้ (today's
 * unarchive, through useCategoryCommands): one at a time; an unconfirmed one
 * offers Try again under the same key; a refusal or a change made elsewhere
 * says so, and the screen reads again.
 */
function ArchivedCategories({ items, onChanged }: { items: readonly CategoryItem[]; onChanged(): void }) {
  const colors = useWalletColors();
  const tc = useCopy();
  const t = useDraftCopy(LINES);
  const commands = useCategoryCommands({
    rebase: () => undefined,
    stopped: () => undefined,
    saved: () => onChanged(),
    changedElsewhere: () => onChanged(),
    fieldErrors: () => undefined,
  });
  const held = commands.status !== 'idle' || commands.blocked;
  const notice = commands.conflict?.view.message ?? commands.message;
  // Each button is disabled while one is out, unconfirmed or blocked; the hook sends one at a time.
  const unarchive = (item: CategoryItem) => {
    void commands.send([archiveCommand(item.category, 'unarchive')], { success: tc('{name} is back in Quick add.', { name: item.name }), draft: null, seen: null });
  };
  return (
    <View testID="categories-archived" style={{ gap: 10 }}>
      <WalletText role="h2" accessibilityRole="header">{tc('Archived')}</WalletText>
      {notice ? (
        <View testID="categories-unarchive-problem" style={{ gap: 4, alignItems: 'flex-start' }}>
          <WalletText role="label" accessibilityRole="alert">{notice}</WalletText>
          {commands.status === 'unconfirmed' && !commands.resendBlocked ? <TextLink label={t('common.tryAgain')} onPress={commands.tryAgain} /> : null}
          {commands.conflict ? (
            <TextLink
              label={tc('Reload')}
              onPress={() => {
                commands.setConflict(null);
                onChanged();
              }}
            />
          ) : null}
        </View>
      ) : null}
      {items.map((item) => (
        <View
          key={item.category.id}
          testID={`archived-category-${item.category.id}`}
          style={{ minHeight: 60, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 18, backgroundColor: colors.card }}
        >
          <WalletCategoryIcon category={item.category} name={item.name} />
          <WalletText role="label" style={{ flex: 1, minWidth: 120, fontWeight: '700' }}>{item.name}</WalletText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tc('Unarchive {name}', { name: item.name })}
            accessibilityState={{ disabled: held }}
            aria-disabled={held}
            disabled={held}
            onPress={() => unarchive(item)}
            style={({ pressed }) => ({
              minHeight: 44,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 16,
              borderRadius: 22,
              backgroundColor: colors.raised,
              opacity: held ? 0.4 : pressed ? 0.7 : 1,
            })}
          >
            <WalletText role="label">{tc('Unarchive')}</WalletText>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

/** A load problem in today's words, with Try again when trying again can help. */
function LoadProblem({ error, onRetry }: { error: unknown; onRetry(): void }) {
  const colors = useWalletColors();
  const tc = useCopy();
  const t = useDraftCopy(LINES);
  const problem = classifyLoadProblem(error, tc);
  return (
    <View testID="categories-problem" style={{ gap: 4, alignItems: 'flex-start', padding: 16, borderRadius: 22, backgroundColor: colors.card }}>
      <WalletText accessibilityRole="alert">{problem.message}</WalletText>
      {problem.retry ? <TextLink label={t('common.tryAgain')} onPress={onRetry} /> : null}
    </View>
  );
}
