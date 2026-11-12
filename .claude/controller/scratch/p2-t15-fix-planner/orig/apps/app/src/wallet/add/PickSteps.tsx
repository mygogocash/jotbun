// The add tray's pick steps (P2-T15; bw-tray-confirm's rows, rh-transfer's
// cards): the category, a wallet (the entry's, or a move's from or to), the
// day and the note. Each is controlled (StepProps), as every step is: a choice
// is written into the draft through onDraft, then the step goes back to the
// confirm step, whose rows open them. WalletPick alone opens from other steps
// too (the transfer step's cards, the amount step's wallet chip), so it goes
// back to its `back`. The tray's back leaves a pick with nothing changed; it
// is the host's, as is remembering which step opened the pick (isPickStep).
//
// - CategoryPick: the type's categories in use, in the ranking's order (most
//   used first, P2-T5's rank), with any the ranking does not hold after them,
//   as a grid of tiles (four across, two at the largest text sizes). One radio
//   group, named หมวด; a tap ticks once (chipPick), as today's grid does.
// - WalletPick: the wallets in use (archived ones are never offered), each on
//   its material with its balance when known (WalletAmount: masked in private
//   mode, and the row says only that it is hidden). For a move, picking the
//   wallet already on the other side swaps the two, as the swap button does, so
//   a pick never puts one wallet on both sides.
// - DatePick: one day back or forward (stepDay), never past today and never
//   before `earliest` (the wallet's tracking start): an arrow that cannot step
//   is disabled, and a draft dated before the start opens at the start. วันนี้
//   comes back to today, and เสร็จ keeps the day. Each day change ticks once
//   (dateStep), as today's date chip does. No time (W12).
// - NotePick: the note, at most 500 characters (NOTE_MAX_CHARS), and เสร็จ.
import { NOTE_MAX_CHARS } from '@gogospend/contracts';
import type { CategoryDto, Minor, WalletSnapshot } from '@gogospend/contracts';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import { playHaptic } from '@mobile/lib/hapticMoment';
import type { Ranking } from '@mobile/screens/redesign/entry/entryHelpers';
import type { QuickAddDraft } from '@mobile/spend/v1/redesign/quickAddModel';
import { categoryName } from '@mobile/spend/v1/viewModels';
import { TextInput } from '@mobile/theme/AppText';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { THAI_UI_FONT_FAMILY } from '@mobile/theme/uiFontFamily';
import { WALLET_TYPE } from '@mobile/theme/walletType';
import { DECORATIVE, POLITE_LIVE_REGION } from '@mobile/ui/a11y';
import { canStepBack, canStepForward, dayLabel, fullDateLabel, stepDay } from '@mobile/ui/dateStep';
import { Glyph } from '@mobile/ui/Glyph';
import type { GlyphName } from '@mobile/ui/Glyph';
import { useLargeText } from '@mobile/ui/largeText';
import { COMMON_COPY } from '../common/copy';
import { useDraftCopy } from '../copy/useDraftCopy';
import { MaterialFill } from '../looks/MaterialFill';
import { WalletCategoryIcon } from '../looks/WalletCategoryIcon';
import { useWalletLooks } from '../looks/WalletLooksProvider';
import { WalletAmount } from '../money/WalletAmount';
import { spokenMoney } from '../money/walletMoney';
import { usePrivateMode } from '../privacy/PrivateModeProvider';
import { PrimaryButton } from '../tray/PrimaryButton';
import { TextLink } from '../tray/TextLink';
import { WalletText } from '../WalletText';
import type { AddStep, StepProps } from './addFlow';
import { COPY } from './copy';

const LINES = { ...COMMON_COPY, ...COPY } as const;

/** A category's tile in the grid (bw-tray-confirm's 52). */
const TILE = 52;

const PICKS: ReadonlySet<AddStep> = new Set<AddStep>(['category', 'wallet', 'from', 'to', 'date', 'note']);

/** Whether a step is a pick: the tray's back leaves it for the step that opened it, which the host keeps (WalletPick's `back`). */
export function isPickStep(step: AddStep): boolean {
  return PICKS.has(step);
}

export function CategoryPick({ draft, onDraft, onStep, categories, ranking }: StepProps & {
  categories: readonly CategoryDto[];
  ranking: Ranking;
}) {
  const colors = useWalletColors();
  const tc = useCopy();
  const t = useDraftCopy(COPY);
  const large = useLargeText();
  const type = draft.type;
  if (type === 'transfer') return null;
  const open = categories.filter((category) => category.type === type && !category.archived);
  const byId = new Map(open.map((category) => [category.id, category]));
  const ranked = [...ranking[type].top, ...ranking[type].rest].map((category) => category.id).filter((id) => byId.has(id));
  const placed = new Set(ranked);
  const offered = [...ranked.flatMap((id) => byId.get(id) ?? []), ...open.filter((category) => !placed.has(category.id))];
  const chosen = draft.categoryByType[type];
  return (
    <View testID="pick-category" role="radiogroup" accessibilityLabel={t('add.rowCategory')} style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 }}>
      {offered.map((category) => {
        const name = categoryName(category, tc);
        const checked = category.id === chosen;
        return (
          <Pressable
            key={category.id}
            accessibilityRole="radio"
            accessibilityLabel={name}
            accessibilityState={{ checked }}
            aria-checked={checked}
            onPress={() => {
              playHaptic('chipPick');
              onDraft({ ...draft, categoryByType: { ...draft.categoryByType, [type]: category.id } });
              onStep('confirm');
            }}
            style={({ pressed }) => ({
              width: large ? '50%' : '25%',
              minHeight: 44,
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 4,
              paddingVertical: 6,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            {/* The chosen tile is ringed in violet and its name is bold, so the choice never rests on colour alone. */}
            <View style={{ padding: 3, borderRadius: 20, borderWidth: 2, borderColor: checked ? colors.violet : 'transparent' }}>
              <WalletCategoryIcon category={category} name={name} size={TILE} />
            </View>
            <WalletText role="caption" style={{ textAlign: 'center', fontWeight: checked ? '700' : '400' }}>{name}</WalletText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function WalletPick({ draft, onDraft, onStep, wallets, balances, role, back = 'confirm' }: StepProps & {
  wallets: readonly WalletSnapshot[];
  /** Each wallet's available balance from the server; null offline. */
  balances: ReadonlyMap<string, Minor> | null;
  role: 'wallet' | 'from' | 'to';
  /** The step that opened it: confirm unless the host says otherwise (the transfer step's cards, the amount step's chip). */
  back?: AddStep;
}) {
  const colors = useWalletColors();
  const t = useDraftCopy(LINES);
  const large = useLargeText();
  const { hidden } = usePrivateMode();
  const { lookOf } = useWalletLooks();
  const chosen = role === 'wallet' ? draft.walletId : role === 'from' ? draft.fromWalletId : draft.toWalletId;
  /** The draft with this wallet chosen; for a move, the wallet on the other side swaps in. */
  const picked = (id: string): QuickAddDraft => {
    if (role === 'wallet') return { ...draft, walletId: id };
    if (role === 'from') return id === draft.toWalletId ? { ...draft, fromWalletId: id, toWalletId: draft.fromWalletId } : { ...draft, fromWalletId: id };
    return id === draft.fromWalletId ? { ...draft, toWalletId: id, fromWalletId: draft.toWalletId } : { ...draft, toWalletId: id };
  };
  const group = role === 'wallet' ? 'add.rowWallet' : role === 'from' ? 'add.rowFrom' : 'add.rowTo';
  return (
    <View testID="pick-wallet" role="radiogroup" accessibilityLabel={t(group)} style={{ gap: 8 }}>
      {wallets.filter((wallet) => !wallet.archived).map((wallet) => {
        const checked = wallet.id === chosen;
        const balance = balances === null ? null : balances.get(wallet.id) ?? null;
        const label = balance === null ? wallet.name : `${wallet.name} ${hidden ? t('common.amountHidden') : spokenMoney(balance, t)}`;
        return (
          <Pressable
            key={wallet.id}
            accessibilityRole="radio"
            accessibilityLabel={label}
            accessibilityState={{ checked }}
            aria-checked={checked}
            onPress={() => {
              onDraft(picked(wallet.id));
              onStep(back);
            }}
            style={({ pressed }) => ({
              minHeight: 56,
              flexDirection: large ? 'column' : 'row',
              alignItems: large ? 'flex-start' : 'center',
              gap: large ? 6 : 12,
              paddingVertical: 8,
              paddingHorizontal: 14,
              borderRadius: 16,
              borderWidth: 2,
              borderColor: checked ? colors.violet : 'transparent',
              backgroundColor: colors.raised,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1, flexGrow: 1 }}>
              {/* A radio mark, so the choice never rests on the ring's colour alone. */}
              <View {...DECORATIVE} style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
                {checked ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.ink }} /> : null}
              </View>
              <View {...DECORATIVE} style={{ width: 34, height: 22 }}>
                <MaterialFill material={lookOf(wallet.id).material} radius={5} />
              </View>
              <WalletText role="body" style={{ flexShrink: 1, fontWeight: '700' }}>{wallet.name}</WalletText>
            </View>
            {balance === null ? null : <WalletAmount minor={balance} sign="balance" size={17} />}
          </Pressable>
        );
      })}
    </View>
  );
}

export function DatePick({ draft, onDraft, onStep, today, earliest }: StepProps & {
  /** Today in Bangkok: nothing after it can be chosen. */
  today: string;
  /** The wallet's tracking start: nothing before it can be chosen. */
  earliest?: string;
}) {
  const tc = useCopy();
  const t = useDraftCopy(LINES);
  const locale = useActiveLocale();
  // A draft dated before the wallet's start (a copy, a start moved later) opens at the start.
  const [day, setDay] = useState(() => (earliest !== undefined && draft.occurredOn < earliest ? earliest : draft.occurredOn));
  const change = (next: string | null) => {
    if (next === null || next === day) return;
    playHaptic('dateStep');
    setDay(next);
  };
  return (
    <View testID="pick-date" style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ArrowButton label={tc('Previous day')} glyph="chevron-left" disabled={!canStepBack(day, earliest)} onPress={() => change(stepDay(day, -1, { today, earliest }))} />
        <View {...POLITE_LIVE_REGION} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
          <WalletText testID="pick-date-day" role="h2" style={{ textAlign: 'center' }}>{dayLabel(day, today, locale).text}</WalletText>
          <WalletText role="caption" tone="quiet" style={{ textAlign: 'center' }}>{fullDateLabel(day, locale)}</WalletText>
        </View>
        <ArrowButton label={tc('Next day')} glyph="chevron-right" disabled={!canStepForward(day, today)} onPress={() => change(stepDay(day, 1, { today, earliest }))} />
      </View>
      {day === today ? null : <TextLink label={t('add.today')} onPress={() => change(today)} />}
      <PrimaryButton
        testID="pick-date-done"
        label={t('common.done')}
        onPress={() => {
          onDraft({ ...draft, occurredOn: day });
          onStep('confirm');
        }}
      />
    </View>
  );
}

/** A day arrow: 44 pt in its own box (§4), on `raised`, dimmed and unavailable when it cannot step. */
function ArrowButton({ label, glyph, disabled, onPress }: { label: string; glyph: GlyphName; disabled: boolean; onPress(): void }) {
  const colors = useWalletColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}
    >
      <Glyph name={glyph} size={18} color={colors.ink} />
    </Pressable>
  );
}

export function NotePick({ draft, onDraft, onStep }: StepProps) {
  const colors = useWalletColors();
  const t = useDraftCopy(LINES);
  const [note, setNote] = useState(draft.note);
  return (
    <View testID="pick-note" style={{ gap: 12 }}>
      <TextInput
        accessibilityLabel={t('add.rowNote')}
        placeholder={t('add.addNote')}
        placeholderTextColor={colors.quiet}
        value={note}
        onChangeText={setNote}
        multiline
        maxLength={NOTE_MAX_CHARS}
        maxFontSizeMultiplier={WALLET_TYPE.body.maxScale}
        style={{
          fontFamily: THAI_UI_FONT_FAMILY,
          fontSize: WALLET_TYPE.body.size,
          color: colors.ink,
          minHeight: 96,
          padding: 14,
          borderRadius: 16,
          backgroundColor: colors.raised,
          textAlignVertical: 'top',
        }}
      />
      <PrimaryButton
        testID="pick-note-done"
        label={t('common.done')}
        onPress={() => {
          onDraft({ ...draft, note });
          onStep('confirm');
        }}
      />
    </View>
  );
}
