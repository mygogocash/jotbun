// The Bun Wallet's CategoryTray (P2-T29, wc-category-edit).
// Manages creating and editing categories:
// - Name field (with checkLabel)
// - Type switch (new only: Expense / Income)
// - 12 glyphs at 48 pt (CATEGORY_PICKER_GLYPHS)
// - 7 swatches at 44 pt (TRAY_SWATCHES) named by swatch.*
// - Monthly limit switch and amount input (with categories.limitsTotal and over-budget refusal)
// - Saves commands and stores icon only after Jotbun accepted the category
import type { BudgetDto, CategoryDto, CategoryType, Minor } from '@gogospend/contracts';
import { CATEGORY_COLORS } from '@gogospend/contracts';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import {
  checkLabel, checkLimits, editCategoryDraft, newCategoryDraft, planSave, readLimit, LIMIT_PROBLEM_TEXT,
} from '@mobile/spend/v1/redesign/planning/categoriesModel';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import { monthOf, todayInBangkok } from '@mobile/spend/v1/viewModels';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { tileTint } from '@mobile/theme/walletPalette';
import { useLoad, useMoneyLocale } from '@mobile/screens/v1/parts';
import { CategoryGlyph } from '../looks/WalletCategoryIcon';
import { CATEGORY_PICKER_GLYPHS } from '../looks/categoryGlyphs';
import type { GlyphKey } from '../looks/categoryGlyphs';
import { useCategoryIcons } from '../looks/WalletLooksProvider';
import { walletMoneyText } from '../money/walletMoney';
import { Tray } from '../tray/Tray';
import { PrimaryButton } from '../tray/PrimaryButton';
import { WalletText } from '../WalletText';
import { useDraftCopy } from '../copy/useDraftCopy';
import { COMMON_COPY } from '../common/copy';
import { COPY } from './copy';
import { useCategoryCommands } from '../../screens/redesign/planning/categoryCommands';

const ALL_COPY = { ...COMMON_COPY, ...COPY } as const;
const LIFT = '0px 1px 4px rgba(17, 16, 20, 0.14)';

export const TRAY_SWATCHES: readonly string[] = [0, 4, 5, 2, 3, 6, 8].map((i) => CATEGORY_COLORS[i]);

const SWATCH_KEYS = [
  'swatch.peach',
  'swatch.sky',
  'swatch.light_violet',
  'swatch.pink',
  'swatch.yellow',
  'swatch.steel_blue',
  'swatch.steel_violet',
] as const;

const GLYPH_NAMES: Record<string, { th: string; en: string }> = {
  food: { th: 'อาหาร', en: 'Food' },
  coffee: { th: 'กาแฟ', en: 'Coffee' },
  car: { th: 'รถ', en: 'Car' },
  bag: { th: 'ถุงช้อปปิ้ง', en: 'Shopping bag' },
  home: { th: 'บ้าน', en: 'Home' },
  receipt: { th: 'ใบเสร็จ', en: 'Receipt' },
  heart: { th: 'หัวใจ', en: 'Heart' },
  lotus: { th: 'ดอกบัว', en: 'Lotus' },
  gift: { th: 'ของขวัญ', en: 'Gift' },
  phone: { th: 'มือถือ', en: 'Phone' },
  paw: { th: 'รอยเท้าสัตว์', en: 'Pet paw' },
  book: { th: 'หนังสือ', en: 'Book' },
};

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `cat-${Date.now()}`;
}

export type CategoryTrayProps = {
  visible: boolean;
  onClose(): void;
  category: CategoryDto | null;
  type: CategoryType;
  now?: Date;
};

export function CategoryTray({ visible, onClose, category, type: initialType, now: explicitNow }: CategoryTrayProps) {
  const resources = useSpendV1();
  const tc = useCopy();
  const t = useDraftCopy(ALL_COPY);
  const locale = useMoneyLocale();
  const activeLocale = useActiveLocale();
  const colors = useWalletColors();
  const { iconOf, setIcon } = useCategoryIcons();

  const now = explicitNow ?? new Date();
  const month = monthOf(todayInBangkok(now));
  const budgetLoad = useLoad(async () => resources.budget(month), [resources, month]);
  const budget: BudgetDto | null = budgetLoad.state === 'ready' ? budgetLoad.data : null;

  const isNew = category === null;
  const isBuiltin = category?.builtin_key !== null && category?.builtin_key !== undefined;

  const [categoryType, setCategoryType] = useState<CategoryType>(category?.type ?? initialType);
  const [name, setName] = useState<string>('');
  const [pickedGlyph, setPickedGlyph] = useState<GlyphKey | null>(null);
  const [pickedColor, setPickedColor] = useState<string>(TRAY_SWATCHES[0]);
  const [hasLimit, setHasLimit] = useState(false);
  const [limitText, setLimitText] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const commands = useCategoryCommands();

  // Reset state when category or visible changes
  useEffect(() => {
    if (visible) {
      if (category) {
        setCategoryType(category.type);
        setName(category.label ?? '');
        setPickedColor(category.color ?? TRAY_SWATCHES[0]);
        setPickedGlyph(iconOf(category));
        const currentLimit = budget?.category_limits.find((l) => l.category_id === category.id)?.limit_minor;
        if (currentLimit !== undefined && currentLimit !== null) {
          setHasLimit(true);
          const satang = BigInt(currentLimit);
          const baht = satang / 100n;
          const remainder = satang % 100n;
          setLimitText(remainder === 0n ? baht.toString() : (Number(satang) / 100).toFixed(2));
        } else {
          setHasLimit(false);
          setLimitText('');
        }
      } else {
        setCategoryType(initialType);
        setName('');
        setPickedColor(TRAY_SWATCHES[0]);
        setPickedGlyph(CATEGORY_PICKER_GLYPHS[0]);
        setHasLimit(false);
        setLimitText('');
      }
      setErrorMsg(null);
      setSaving(false);
    }
  }, [visible, category, initialType, budget]);

  const limitCheck = useMemo(() => {
    if (!hasLimit || limitText.trim() === '' || !budget) return { ok: true as const, minor: null };
    const read = readLimit(limitText, locale);
    if (!read.ok) return { ok: false as const, problem: read.problem, message: read.problem };
    const catId = category?.id ?? 'temp-check';
    const check = checkLimits(budget, catId, read.minor);
    if (!check.ok) {
      if (check.problem === 'over_total') {
        const msg = t('categories.limitsTotal', {
          total: walletMoneyText(check.total),
          budget: walletMoneyText(check.overall),
        });
        return { ok: false as const, problem: 'over_total' as const, message: msg, total: check.total, overall: check.overall };
      }
      return { ok: false as const, problem: check.problem, message: tc(LIMIT_PROBLEM_TEXT.too_many) };
    }
    return { ok: true as const, minor: read.minor, total: check.total, overall: budget.overall_limit_minor };
  }, [hasLimit, limitText, budget, category, locale, t]);

  const nameCheck = checkLabel(name, isBuiltin);
  const canSave = !saving && (isBuiltin || nameCheck.ok) && limitCheck.ok;

  const title = isNew ? t('categories.new') : (category.label || name || (category.builtin_key ? tc(category.builtin_key) : t('categories.title')));

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const generatedId = isNew ? newId() : category.id;
      const effectiveLimit = hasLimit && limitCheck.ok && limitCheck.minor ? limitCheck.minor : null;
      const draft = isNew
        ? {
            ...newCategoryDraft({ id: generatedId, type: categoryType, color: pickedColor }),
            label: name,
            limitText: effectiveLimit ? limitText : '',
            baseLimit: null,
          }
        : {
            ...editCategoryDraft(category, budget),
            label: name,
            color: pickedColor,
            limitText: effectiveLimit ? limitText : '',
          };

      const plan = planSave(draft, { budget, tc, locale });
      if (!plan.ok) {
        setErrorMsg(plan.errors.label ?? plan.errors.limit ?? tc('Could not save that. Try again.'));
        setSaving(false);
        return;
      }

      const ok = await commands.send(plan.commands, {
        success: isNew ? tc('Created.') : tc('Saved.'),
        draft,
        seen: budget,
      });

      if (ok) {
        // The icon is kept for the account only after Jotbun accepted the category
        if (pickedGlyph) {
          try {
            await setIcon(generatedId, pickedGlyph);
          } catch {
            // Keep no failure outside account
          }
        }
        onClose();
      } else {
        setErrorMsg(commands.message ?? tc('Could not save that. Try again.'));
      }
    } catch {
      setErrorMsg(tc('Could not save that. Try again.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Tray visible={visible} onClose={onClose} title={title}>
      <View style={styles.container}>
        {/* Name input */}
        <View style={styles.nameRow}>
          <View style={[styles.previewIcon, { backgroundColor: pickedColor }]}>
            {pickedGlyph ? <CategoryGlyph glyph={pickedGlyph} size={28} color={colors.ink} /> : null}
          </View>
          <View style={styles.inputWrapper}>
            <WalletText role="label" style={styles.inputLabel}>{t('categories.name')}</WalletText>
            <TextInput
              testID="category-name-input"
              value={name}
              onChangeText={setName}
              placeholder={isBuiltin && category.builtin_key ? tc(category.builtin_key) : t('categories.name')}
              placeholderTextColor={colors.quiet}
              style={[styles.textInput, { color: colors.ink, borderColor: colors.hairline, backgroundColor: colors.card }]}
              autoCapitalize="sentences"
            />
          </View>
        </View>

        {/* Type switch (new category only) */}
        {isNew && (
          <View role="radiogroup" aria-label={t('categories.title')} style={[styles.typeSwitch, { backgroundColor: colors.raised }]}>
            <Pressable
              role="radio"
              aria-checked={categoryType === 'expense'}
              aria-label={t('categories.expense')}
              onPress={() => setCategoryType('expense')}
              style={[
                styles.typeSegment,
                { minHeight: 44 },
                categoryType === 'expense' && {
                  backgroundColor: colors.card,
                  boxShadow: !colors.isDark ? LIFT : undefined,
                },
              ]}
            >
              <WalletText role="label" style={{ color: categoryType === 'expense' ? colors.ink : colors.quiet, fontWeight: categoryType === 'expense' ? '700' : '400' }}>
                {t('categories.expense')}
              </WalletText>
            </Pressable>
            <Pressable
              role="radio"
              aria-checked={categoryType === 'income'}
              aria-label={t('categories.income')}
              onPress={() => setCategoryType('income')}
              style={[
                styles.typeSegment,
                { minHeight: 44 },
                categoryType === 'income' && {
                  backgroundColor: colors.card,
                  boxShadow: !colors.isDark ? LIFT : undefined,
                },
              ]}
            >
              <WalletText role="label" style={{ color: categoryType === 'income' ? colors.ink : colors.quiet, fontWeight: categoryType === 'income' ? '700' : '400' }}>
                {t('categories.income')}
              </WalletText>
            </Pressable>
          </View>
        )}

        {/* 12 Glyphs at 48 pt */}
        <View style={styles.section}>
          <WalletText role="label" style={styles.sectionLabel}>{t('categories.icon')}</WalletText>
          <View role="radiogroup" aria-label={t('categories.icon')} style={styles.glyphGrid}>
            {CATEGORY_PICKER_GLYPHS.map((glyphKey) => {
              const isSelected = pickedGlyph === glyphKey;
              const glyphName = activeLocale === 'th' ? GLYPH_NAMES[glyphKey]?.th ?? glyphKey : GLYPH_NAMES[glyphKey]?.en ?? glyphKey;
              return (
                <Pressable
                  key={glyphKey}
                  role="radio"
                  aria-checked={isSelected}
                  aria-label={glyphName}
                  onPress={() => setPickedGlyph(glyphKey)}
                  style={[
                    styles.glyphButton,
                    { minWidth: 48, minHeight: 48, backgroundColor: isSelected ? pickedColor : colors.raised },
                  ]}
                >
                  <CategoryGlyph glyph={glyphKey} size={24} color={isSelected ? colors.ink : colors.quiet} />
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* 7 Swatches at 44 pt */}
        <View style={styles.section}>
          <WalletText role="label" style={styles.sectionLabel}>{t('categories.color')}</WalletText>
          <View role="radiogroup" aria-label={t('categories.color')} style={styles.swatchRow}>
            {TRAY_SWATCHES.map((swatchColor, idx) => {
              const isSelected = pickedColor === swatchColor;
              const swatchName = t(SWATCH_KEYS[idx]);
              return (
                <Pressable
                  key={swatchColor}
                  role="radio"
                  aria-checked={isSelected}
                  aria-label={swatchName}
                  onPress={() => setPickedColor(swatchColor)}
                  style={[
                    styles.swatchButton,
                    { minWidth: 44, minHeight: 44, backgroundColor: swatchColor },
                    isSelected && { borderWidth: 3, borderColor: colors.ink },
                  ]}
                >
                  <View
                    style={[
                      styles.swatchInner,
                      isSelected && { backgroundColor: swatchColor },
                    ]}
                  />
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Monthly limit: only for expense */}
        {categoryType === 'expense' && budget ? (
          <View style={[styles.limitSection, { borderTopColor: colors.hairline }]}>
            <View style={styles.limitSwitchRow}>
              <View style={styles.limitSwitchText}>
                <WalletText role="body" style={styles.limitSwitchTitle}>{t('categories.setLimit')}</WalletText>
                <WalletText role="caption" style={styles.limitSwitchHint}>
                  {t('categories.limitHint', { budget: walletMoneyText(budget.overall_limit_minor) })}
                </WalletText>
              </View>
              <Pressable
                role="switch"
                aria-checked={hasLimit}
                aria-label={t('categories.setLimit')}
                onPress={() => setHasLimit(!hasLimit)}
                style={[styles.switchButton, { minWidth: 56, minHeight: 44 }]}
              >
                <View style={[styles.switchTrack, { backgroundColor: hasLimit ? colors.violet : colors.raised }]}>
                  <View
                    style={[
                      styles.switchThumb,
                      {
                        backgroundColor: colors.card,
                        boxShadow: !colors.isDark ? LIFT : undefined,
                      },
                      hasLimit && styles.switchThumbActive,
                    ]}
                  />
                </View>
              </Pressable>
            </View>

            {hasLimit ? (
              <View style={styles.limitInputContainer}>
                <TextInput
                  testID="category-limit-input"
                  value={limitText}
                  onChangeText={setLimitText}
                  placeholder="0.00"
                  placeholderTextColor={colors.quiet}
                  keyboardType="decimal-pad"
                  style={[styles.textInput, { color: colors.ink, borderColor: colors.hairline, backgroundColor: colors.card }]}
                />
                {!limitCheck.ok && limitCheck.message ? (
                  <WalletText role="caption" style={[styles.limitError, { color: colors.over }]}>
                    {limitCheck.message}
                  </WalletText>
                ) : limitCheck.ok && limitCheck.total ? (
                  <WalletText role="caption" style={styles.limitTotalText}>
                    {t('categories.limitsTotal', {
                      total: walletMoneyText(limitCheck.total),
                      budget: walletMoneyText(limitCheck.overall),
                    })}
                  </WalletText>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Error message */}
        {((commands.conflict ? commands.conflict.view.message : null) ?? commands.message ?? errorMsg) ? (
          <WalletText role="caption" style={[styles.errorMsg, { color: colors.over }]}>
            {(commands.conflict ? commands.conflict.view.message : null) ?? commands.message ?? errorMsg}
          </WalletText>
        ) : null}

        {/* Footer save button */}
        <View style={styles.footer}>
          <PrimaryButton
            label={t('common.save')}
            disabled={!canSave}
            busy={saving}
            onPress={handleSave}
          />
        </View>
      </View>
    </Tray>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 18,
    gap: 16,
  },
  nameRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  previewIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputWrapper: {
    flex: 1,
    gap: 4,
  },
  inputLabel: {
    fontSize: 13,
  },
  textInput: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 15,
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
  section: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 13,
  },
  glyphGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  glyphButton: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  swatchButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  limitSection: {
    borderTopWidth: 1,
    paddingTop: 12,
    gap: 12,
  },
  limitSwitchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  limitSwitchText: {
    flex: 1,
    gap: 2,
  },
  limitSwitchTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  limitSwitchHint: {
    fontSize: 12,
  },
  switchButton: {
    width: 56,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  switchTrack: {
    width: 48,
    height: 28,
    borderRadius: 14,
    padding: 2,
    justifyContent: 'center',
  },
  switchThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  switchThumbActive: {
    alignSelf: 'flex-end',
  },
  limitInputContainer: {
    gap: 6,
  },
  limitError: {
    fontSize: 12,
  },
  limitTotalText: {
    fontSize: 12,
  },
  errorMsg: {
    fontSize: 13,
    textAlign: 'center',
  },
  footer: {
    paddingTop: 8,
  },
});
