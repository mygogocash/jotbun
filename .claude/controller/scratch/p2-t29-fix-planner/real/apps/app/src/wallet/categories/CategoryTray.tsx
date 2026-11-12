// The Bun Wallet's category tray (P2-T29; wc-category-edit): a new category,
// or one to change, on P2-T13's Tray. The rules are today's, shared with the
// Bun diary's Categories screen (useCategoryCommands, categoriesModel):
//
// - The draft: a new one gets its id once, when the tray opens (newId, from
//   expo-crypto), so every resend is the same category. The name is the API's
//   one-line rule (checkLabel); a built-in left empty goes back to its own
//   name. The type is chosen for a new one only. The colour is one of the
//   seven swatches (TRAY_SWATCHES), each named in words. The limit belongs to
//   this month's budget (an expense, in a month that has one): setting it
//   replaces the budget at the version read, and a limit that would pass the
//   month's budget is refused in today's words as it is typed.
// - Saving sends planSave's commands through useCategoryCommands. While they
//   are sent the tray is locked (Review Focus 1). An answer that never came
//   freezes it with today's Try again, which resends the same commands under
//   the same keys; the tray can be closed, and opened again it is still
//   frozen until the outcome is known (B4). A refusal of a field says so
//   beside it; a conflict or a change made elsewhere says so, and Reload
//   closes the tray so the screen reads again. Every other opening starts
//   afresh.
// - The icon (W7): the picker is offered only while an account is open, since
//   nothing could be kept without one. The picked glyph is kept for the
//   account only once Jotbun has accepted the category, and only when it
//   differs from what the category already shows (a pack's or a built-in's
//   glyph needs no keeping).
// - เก็บถาวร asks first, as today's sheet does, as the tray's second step.
// - Private mode (W10, R106): the budget, the total and the refusal show
//   ฿••••, and a stored limit is masked in its field until a key is pressed.
// - Every control is at least 44 pt in its own box and named: the glyphs and
//   swatches by the board's names, the fields by their labels.
import type { BudgetDto, CategoryDto, CategoryType, Minor } from '@gogospend/contracts';
import { CATEGORY_COLORS } from '@gogospend/contracts';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useCopy } from '@mobile/i18n/useCopy';
import { useCategoryCommands } from '@mobile/screens/redesign/planning/categoryCommands';
import { newId, useMoneyLocale } from '@mobile/screens/v1/parts';
import {
  LABEL_PROBLEM_TEXT, LIMIT_PROBLEM_TEXT, archiveCommand, checkLabel, checkLimits, draftName, editCategoryDraft, hasLimitField, newCategoryDraft, planSave, readLimit,
} from '@mobile/spend/v1/redesign/planning/categoriesModel';
import type { CategoryDraft, FormErrors } from '@mobile/spend/v1/redesign/planning/categoriesModel';
import { useDiaryView } from '@mobile/spend/v1/SpendDiaryContext';
import { Text, TextInput } from '@mobile/theme/AppText';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { LATIN_UI_FONT_FAMILY, THAI_UI_FONT_FAMILY } from '@mobile/theme/uiFontFamily';
import { tileTint } from '@mobile/theme/walletPalette';
import { WALLET_TYPE, amountMaxScale, walletLineHeight } from '@mobile/theme/walletType';
import { DECORATIVE } from '@mobile/ui/a11y';
import { categoryInitial } from '@mobile/ui/categoryIcons';
import { BUN_TOUCH } from '@mobile/ui/layout';
import { useLargeText } from '@mobile/ui/largeText';
import { COMMON_COPY } from '../common/copy';
import { useDraftCopy } from '../copy/useDraftCopy';
import { CATEGORY_PICKER_GLYPHS } from '../looks/categoryGlyphs';
import type { GlyphKey } from '../looks/categoryGlyphs';
import { CategoryGlyph } from '../looks/WalletCategoryIcon';
import { useCategoryIcons } from '../looks/WalletLooksProvider';
import { HIDDEN_AMOUNT, walletMoneyText } from '../money/walletMoney';
import { usePrivateMode } from '../privacy/PrivateModeProvider';
import { PrimaryButton } from '../tray/PrimaryButton';
import { TextLink } from '../tray/TextLink';
import { Tray } from '../tray/Tray';
import { WalletText } from '../WalletText';
import { COPY } from './copy';

const LINES = { ...COMMON_COPY, ...COPY } as const;

/** wc-category-edit's seven swatches: สีส้มพีช, สีฟ้า, สีม่วงอ่อน, สีชมพู, สีเหลือง, สีเทาฟ้า, สีเทาม่วง. */
export const TRAY_SWATCHES: readonly string[] = [0, 4, 5, 2, 3, 6, 8].map((index) => CATEGORY_COLORS[index]);
const SWATCH_NAMES = [
  'categories.swatchPeach', 'categories.swatchBlue', 'categories.swatchLilac', 'categories.swatchPink', 'categories.swatchYellow', 'categories.swatchSky', 'categories.swatchSlate',
] as const;

/** The picker's twelve, by the board's names. */
const GLYPH_NAMES: Readonly<Record<string, string>> = {
  food: 'categories.glyphFood',
  coffee: 'categories.glyphCoffee',
  car: 'categories.glyphCar',
  bag: 'categories.glyphBag',
  home: 'categories.glyphHome',
  receipt: 'categories.glyphReceipt',
  heart: 'categories.glyphHeart',
  lotus: 'categories.glyphLotus',
  gift: 'categories.glyphGift',
  phone: 'categories.glyphPhone',
  paw: 'categories.glyphPaw',
  book: 'categories.glyphBook',
};

/** Today's over-total refusal (categoriesModel's overTotalText), with its amounts given here so private mode can mask them. */
const OVER_TOTAL = "Category limits would add up to {total}, more than this month's budget of {overall}.";

/** The swatch's size, and the circle drawn in it. */
const SWATCH = 44;
const SWATCH_FILL = 34;
const GLYPH_BUTTON = 48;
/** The tray's switch (wc-category-edit): 56 × 44 pt, a 51 × 31 track. */
const SWITCH = { width: 56, height: 44, track: { width: 51, height: 31 }, thumb: 27 } as const;

/**
 * A category's mark: its glyph, or else its name's first letter
 * (categoryInitial, which skips a leading Thai vowel), in ink, at the kit's
 * proportions (an initial is 5/6 of the glyph). Decorative.
 */
export function CategoryMark({ glyph, name, size }: { glyph: GlyphKey | null; name: string; size: number }) {
  const colors = useWalletColors();
  const initial = Math.round((size * 5) / 6);
  return (
    <View {...DECORATIVE}>
      {glyph === null ? (
        <WalletText role="label" allowFontScaling={false} style={{ fontSize: initial, lineHeight: walletLineHeight(initial, 'thai'), fontWeight: '700' }}>
          {categoryInitial(name)}
        </WalletText>
      ) : (
        <CategoryGlyph glyph={glyph} size={size} color={colors.ink} />
      )}
    </View>
  );
}

export type CategoryTrayProps = {
  visible: boolean;
  onClose(): void;
  /** The category to change, or null for a new one. */
  category: CategoryDto | null;
  /** A new category's type, the one the grid shows. */
  type: CategoryType;
  /** This month's budget as the screen read it; null when the month has none. */
  budget: BudgetDto | null;
};

/** One opening of the tray. */
type Session = {
  readonly draft: CategoryDraft;
  /** The glyph picked, and the one the category showed when the tray opened. */
  readonly glyph: GlyphKey | null;
  readonly shownGlyph: GlyphKey | null;
  readonly limitOn: boolean;
  /** A key was pressed in the limit field this opening, so a stored limit is no longer masked. */
  readonly limitTyped: boolean;
  readonly step: 'edit' | 'archive';
  readonly errors: FormErrors;
  /** It changed on another device and there is no copy of theirs: only Reload is offered. */
  readonly gone: boolean;
};

function startSession(category: CategoryDto | null, type: CategoryType, budget: BudgetDto | null, shownGlyph: GlyphKey | null): Session {
  const draft = category ? editCategoryDraft(category, budget) : newCategoryDraft({ id: newId(), type, color: TRAY_SWATCHES[0] });
  return { draft, glyph: shownGlyph, shownGlyph, limitOn: draft.limitText !== '', limitTyped: false, step: 'edit', errors: {}, gone: false };
}

export function CategoryTray({ visible, onClose, category, type, budget }: CategoryTrayProps) {
  const tc = useCopy();
  const t = useDraftCopy(LINES);
  const locale = useMoneyLocale();
  const colors = useWalletColors();
  const large = useLargeText();
  const { hidden } = usePrivateMode();
  const { accountId } = useDiaryView();
  const { iconOf, setIcon } = useCategoryIcons();
  const [session, setSession] = useState<Session>(() => startSession(category, type, budget, category ? iconOf(category) : null));
  const commands = useCategoryCommands({
    rebase: (draft) => setSession((now) => ({ ...now, draft })),
    stopped: () => setSession((now) => ({ ...now, step: 'edit' })),
    saved: () => {
      keepIcon();
      onClose();
    },
    changedElsewhere: () => setSession((now) => ({ ...now, gone: true, step: 'edit' })),
    fieldErrors: (errors) => setSession((now) => ({ ...now, errors })),
  });

  // Each opening starts afresh (no failure from the last one), unless its send is unconfirmed: that keeps
  // today's frozen Try again with the same draft until the outcome is known.
  const [opened, setOpened] = useState(visible);
  if (visible !== opened) {
    setOpened(visible);
    if (visible && commands.status !== 'unconfirmed') {
      setSession(startSession(category, type, budget, category ? iconOf(category) : null));
      commands.setMessage(null);
      commands.setConflict(null);
    }
  }

  const { draft, glyph, limitOn, limitTyped, step, errors, gone } = session;
  const builtin = draft.builtinKey !== null;
  /** Sending, or unconfirmed: nothing changes (today's rule). */
  const frozen = commands.status !== 'idle';
  const saving = commands.status === 'saving';
  const stale = gone || commands.conflict !== null;
  const name = draftName(draft, tc);
  const money = (minor: Minor) => (hidden ? HIDDEN_AMOUNT : walletMoneyText(minor));
  const showLimit = hasLimitField(draft, budget);

  // A name too long or not one line is said as it is typed; an empty one when saving.
  const live = checkLabel(draft.label, builtin);
  const labelError = errors.label ?? (!live.ok && live.problem !== 'empty' ? tc(LABEL_PROBLEM_TEXT[live.problem]) : null);
  // A limit over the month's budget is said as it is typed; a mistyped amount when saving.
  const read = readLimit(draft.limitText, locale);
  const fits = showLimit && read.ok ? checkLimits(budget, draft.id, read.minor) : null;
  const overTotal = fits && !fits.ok
    ? fits.problem === 'too_many' ? tc(LIMIT_PROBLEM_TEXT.too_many) : tc(OVER_TOTAL, { total: money(fits.total), overall: money(fits.overall) })
    : null;
  const limitError = errors.limit ?? overTotal;
  const total = showLimit && fits?.ok && read.ok && read.minor !== null ? t('categories.limitsTotal', { total: money(fits.total), budget: money(budget.overall_limit_minor) }) : null;
  const masked = hidden && !limitTyped && draft.limitText !== '';

  /** Keeps the picked glyph for the account, once the category exists, when it is not what the category already shows. */
  function keepIcon() {
    if (glyph !== null && glyph !== session.shownGlyph) void setIcon(draft.id, glyph);
  }

  /** Changes the draft (its fields are disabled while frozen); a field's old problem goes as it is edited (today's rule). */
  function edit(patch: Partial<CategoryDraft>, more: Partial<Session> = {}) {
    setSession((now) => ({
      ...now,
      ...more,
      draft: { ...now.draft, ...patch },
      errors: { label: 'label' in patch ? undefined : now.errors.label, limit: 'limitText' in patch || 'type' in patch ? undefined : now.errors.limit },
    }));
  }

  /** planSave's problems in words, with private mode's masked amounts. */
  function problems(): FormErrors {
    const label = checkLabel(draft.label, builtin);
    return {
      label: label.ok ? undefined : tc(LABEL_PROBLEM_TEXT[label.problem]),
      limit: !showLimit ? undefined : !read.ok ? tc(LIMIT_PROBLEM_TEXT[read.problem]) : overTotal ?? undefined,
    };
  }

  /** Save (offered only while nothing is sent or unconfirmed, and not while blocked; the hook sends one at a time). */
  function submit() {
    const plan = planSave(draft, { budget, tc, locale });
    if (!plan.ok) {
      setSession((now) => ({ ...now, errors: problems() }));
      return;
    }
    if (plan.commands.length === 0) {
      // Nothing for Jotbun: the category is already accepted, so a new icon is kept at once.
      keepIcon();
      onClose();
      return;
    }
    void commands.send(plan.commands, { success: tc('Saved.'), draft, seen: budget });
  }

  function archive() {
    const base = draft.base;
    if (base === null) return;
    void commands.send([archiveCommand(base, 'archive')], { success: tc('{name} is archived.', { name }), draft, seen: budget });
  }

  const title = step === 'archive' ? tc('Archive {name}?', { name }) : draft.base === null ? t('categories.new') : name;
  const notice = commands.conflict?.view.message ?? commands.message;
  const footer = (
    <>
      {notice ? <WalletText testID="category-tray-problem" role="label" accessibilityRole="alert">{notice}</WalletText> : null}
      {commands.status === 'unconfirmed' ? (
        <PrimaryButton testID="category-tray-retry" label={t('common.tryAgain')} disabled={commands.resendBlocked} onPress={commands.tryAgain} />
      ) : stale ? (
        <TextLink label={tc('Reload')} onPress={onClose} />
      ) : step === 'archive' ? (
        <PrimaryButton testID="category-tray-archive" label={tc('Archive')} busy={saving} busyLabel={tc('Saving…')} disabled={commands.blocked} onPress={archive} />
      ) : (
        <PrimaryButton
          testID="category-tray-save"
          label={draft.mode === 'create' ? tc('Add this category') : tc('Save changes')}
          busy={saving}
          busyLabel={tc('Saving…')}
          disabled={commands.blocked}
          onPress={submit}
        />
      )}
    </>
  );

  return (
    <Tray
      visible={visible}
      onClose={onClose}
      title={title}
      step={step}
      onBack={step === 'archive' && !frozen ? () => setSession((now) => ({ ...now, step: 'edit' })) : undefined}
      footer={footer}
      locked={saving}
      testID="category-tray"
    >
      {step === 'archive' ? (
        <WalletText testID="category-archive-words">
          {tc("{name} won't show in Quick add any more. Past entries keep it, and you can unarchive it here any time.", { name })}
        </WalletText>
      ) : (
        <View style={{ gap: 14 }}>
          <View style={{ flexDirection: large ? 'column' : 'row', alignItems: large ? 'flex-start' : 'center', gap: 12 }}>
            <View
              {...DECORATIVE}
              testID="category-preview"
              style={{ width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: draft.color === null ? colors.raised : tileTint(draft.color, colors.isDark) }}
            >
              <CategoryMark glyph={glyph} name={name} size={30} />
            </View>
            <View style={{ flex: large ? undefined : 1, alignSelf: 'stretch', minWidth: 0, paddingHorizontal: 14, paddingTop: 6, borderRadius: 12, backgroundColor: colors.raised, borderBottomWidth: 2, borderBottomColor: colors.ink }}>
              {/* The field says its own name, so screen readers skip the caption above it. */}
              <WalletText role="caption" tone="quiet" {...DECORATIVE}>{t('categories.name')}</WalletText>
              <TextInput
                testID="category-name"
                accessibilityLabel={t('categories.name')}
                value={draft.label}
                onChangeText={(label) => edit({ label })}
                editable={!frozen}
                placeholder={builtin ? draftName({ ...draft, label: '' }, tc) : undefined}
                placeholderTextColor={colors.quiet}
                maxFontSizeMultiplier={WALLET_TYPE.body.maxScale}
                style={{ fontFamily: THAI_UI_FONT_FAMILY, fontSize: WALLET_TYPE.body.size, color: colors.ink, minHeight: BUN_TOUCH, padding: 0 }}
              />
            </View>
          </View>
          {labelError ? <WalletText testID="category-name-problem" role="caption" accessibilityRole="alert">{labelError}</WalletText> : null}
          {draft.mode === 'create' ? (
            <TypeSegments type={draft.type} disabled={frozen} onType={(next) => edit({ type: next })} />
          ) : null}
          {accountId === null ? null : (
            <GlyphPicker glyph={glyph} disabled={frozen} onPick={(next) => edit({}, { glyph: next })} />
          )}
          <SwatchPicker color={draft.color} disabled={frozen} onPick={(color) => edit({ color })} />
          {showLimit ? (
            <View testID="category-limit-section" style={{ gap: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.hairline }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <WalletText role="label" {...DECORATIVE}>{t('categories.setLimit')}</WalletText>
                  <WalletText testID="category-limit-hint" role="caption" tone="quiet">{t('categories.limitHint', { budget: money(budget.overall_limit_minor) })}</WalletText>
                </View>
                <LimitSwitch
                  on={limitOn}
                  label={t('categories.setLimit')}
                  disabled={frozen}
                  onPress={() => edit({ limitText: limitOn ? '' : draft.limitText }, { limitOn: !limitOn, limitTyped: limitOn ? false : limitTyped })}
                />
              </View>
              {limitOn ? (
                <View style={{ gap: 6 }}>
                  <View style={{ paddingHorizontal: 14, paddingTop: 6, borderRadius: 12, backgroundColor: colors.raised, borderBottomWidth: 2, borderBottomColor: colors.hairline }}>
                    <WalletText role="caption" tone="quiet" {...DECORATIVE}>{t('categories.limitField')}</WalletText>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                      <Text {...DECORATIVE} maxFontSizeMultiplier={amountMaxScale(22)} style={{ fontFamily: LATIN_UI_FONT_FAMILY, fontWeight: '700', fontSize: 22, color: colors.ink }}>฿</Text>
                      <TextInput
                        testID="category-limit"
                        accessibilityLabel={t('categories.limitField')}
                        value={masked ? '' : draft.limitText}
                        onChangeText={(limitText) => edit({ limitText }, { limitTyped: true })}
                        editable={!frozen}
                        placeholder={masked ? '••••' : '0'}
                        placeholderTextColor={colors.quiet}
                        keyboardType="decimal-pad"
                        maxFontSizeMultiplier={amountMaxScale(22)}
                        style={{ flex: 1, fontFamily: LATIN_UI_FONT_FAMILY, fontWeight: '700', fontSize: 22, color: colors.ink, minHeight: BUN_TOUCH, padding: 0 }}
                      />
                    </View>
                  </View>
                  {limitError ? (
                    <WalletText testID="category-limit-problem" role="caption" accessibilityRole="alert">{limitError}</WalletText>
                  ) : total ? (
                    <WalletText testID="category-limit-total" role="caption" tone="quiet">{total}</WalletText>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : draft.type === 'expense' ? (
            <WalletText testID="category-no-budget" role="caption" tone="quiet">{tc("Category limits are part of a monthly budget. Set this month's budget first.")}</WalletText>
          ) : null}
          {draft.base !== null && !frozen && !stale ? (
            <View style={{ alignItems: 'flex-start' }}>
              <TextLink label={tc('Archive category')} tone="ink" onPress={() => setSession((now) => ({ ...now, step: 'archive' }))} />
            </View>
          ) : null}
        </View>
      )}
    </Tray>
  );
}

/** รายจ่าย and รายรับ for a new category (wc-category-edit): the chosen one in the main button's fill. */
function TypeSegments({ type, disabled, onType }: { type: CategoryType; disabled: boolean; onType(type: CategoryType): void }) {
  const colors = useWalletColors();
  const large = useLargeText();
  const t = useDraftCopy(LINES);
  return (
    <View
      testID="category-type"
      role="radiogroup"
      accessibilityLabel={t('categories.typeGroup')}
      style={{ flexDirection: large ? 'column' : 'row', gap: 2, padding: 4, borderRadius: 14, backgroundColor: colors.raised }}
    >
      {(['expense', 'income'] as const).map((each) => {
        const checked = each === type;
        const label = t(each === 'expense' ? 'categories.expense' : 'categories.income');
        return (
          <Pressable
            key={each}
            accessibilityRole="radio"
            accessibilityLabel={label}
            accessibilityState={{ checked, disabled }}
            aria-checked={checked}
            disabled={disabled}
            onPress={() => onType(each)}
            style={{
              flex: large ? undefined : 1,
              minHeight: BUN_TOUCH,
              borderRadius: 11,
              paddingHorizontal: 8,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: checked ? colors.primary : 'transparent',
              opacity: disabled ? 0.4 : 1,
            }}
          >
            <WalletText role="label" tone={checked ? 'onPrimary' : 'quiet'} style={{ fontWeight: checked ? '700' : '500', textAlign: 'center' }}>{label}</WalletText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The icon picker's twelve at 48 pt, six to a row (wc-category-edit): the chosen one in the main button's fill. */
function GlyphPicker({ glyph, disabled, onPick }: { glyph: GlyphKey | null; disabled: boolean; onPick(glyph: GlyphKey): void }) {
  const colors = useWalletColors();
  const t = useDraftCopy(LINES);
  const rows = [CATEGORY_PICKER_GLYPHS.slice(0, 6), CATEGORY_PICKER_GLYPHS.slice(6)];
  return (
    <View style={{ gap: 6 }}>
      <WalletText role="caption" tone="quiet" {...DECORATIVE}>{t('categories.icon')}</WalletText>
      <View testID="category-glyphs" role="radiogroup" accessibilityLabel={t('categories.icon')} style={{ gap: 8 }}>
        {rows.map((row, index) => (
          <View key={index} style={{ flexDirection: 'row', gap: 8 }}>
            {row.map((each) => {
              const checked = each === glyph;
              return (
                <Pressable
                  key={each}
                  testID={`category-glyph-${each}`}
                  accessibilityRole="radio"
                  accessibilityLabel={t(GLYPH_NAMES[each])}
                  accessibilityState={{ checked, disabled }}
                  aria-checked={checked}
                  disabled={disabled}
                  onPress={() => onPick(each)}
                  style={{ flex: 1, minHeight: GLYPH_BUTTON, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: checked ? colors.primary : colors.raised, opacity: disabled ? 0.4 : 1 }}
                >
                  <CategoryGlyph glyph={each} size={22} color={checked ? colors.onPrimary : colors.ink} />
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

/** The seven swatches, each a 44 pt radio named for its colour; the chosen one ringed in ink. */
function SwatchPicker({ color, disabled, onPick }: { color: string | null; disabled: boolean; onPick(color: string): void }) {
  const colors = useWalletColors();
  const t = useDraftCopy(LINES);
  return (
    <View style={{ gap: 4 }}>
      <WalletText role="caption" tone="quiet" {...DECORATIVE}>{t('categories.color')}</WalletText>
      <View testID="category-swatches" role="radiogroup" accessibilityLabel={t('categories.color')} style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 4 }}>
        {TRAY_SWATCHES.map((swatch, index) => {
          const checked = swatch === color;
          return (
            <Pressable
              key={swatch}
              testID={`category-swatch-${index}`}
              accessibilityRole="radio"
              accessibilityLabel={t(SWATCH_NAMES[index])}
              accessibilityState={{ checked, disabled }}
              aria-checked={checked}
              disabled={disabled}
              onPress={() => onPick(swatch)}
              style={{ width: SWATCH, height: SWATCH, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}
            >
              <View
                {...DECORATIVE}
                style={{
                  width: SWATCH_FILL + 8,
                  height: SWATCH_FILL + 8,
                  borderRadius: (SWATCH_FILL + 8) / 2,
                  borderWidth: 2,
                  borderColor: checked ? colors.ink : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <View
                  testID={`category-swatch-fill-${index}`}
                  style={{ width: SWATCH_FILL, height: SWATCH_FILL, borderRadius: SWATCH_FILL / 2, borderWidth: 1, borderColor: colors.hairline, backgroundColor: tileTint(swatch, colors.isDark) }}
                />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** ตั้งวงเงินต่อเดือน: a 56 × 44 pt switch; violet when on. */
function LimitSwitch({ on, label, disabled, onPress }: { on: boolean; label: string; disabled: boolean; onPress(): void }) {
  const colors = useWalletColors();
  return (
    <Pressable
      testID="category-limit-switch"
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: on, disabled }}
      aria-checked={on}
      disabled={disabled}
      onPress={onPress}
      style={{ width: SWITCH.width, height: SWITCH.height, alignItems: 'flex-end', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}
    >
      <View
        {...DECORATIVE}
        style={{
          width: SWITCH.track.width,
          height: SWITCH.track.height,
          borderRadius: SWITCH.track.height / 2,
          padding: 2,
          alignItems: on ? 'flex-end' : 'flex-start',
          backgroundColor: on ? colors.violet : colors.quiet,
        }}
      >
        <View style={{ width: SWITCH.thumb, height: SWITCH.thumb, borderRadius: SWITCH.thumb / 2, backgroundColor: colors.sheet }} />
      </View>
    </Pressable>
  );
}
