// Pieces of the Wallets screen (R4 Planning, plan §6.2): the total on the
// stage, a wallet's card, the dashed Add tile, the Archived section's rows,
// the live card preview, the form's fields (name, opening balance on the
// keypad, tracking start), the correction's reason, the conflict panel and
// the load problems. Built from the kit, BunText and useBunColors() tokens
// only: ink on the stage, ink or muted on the page and cards, onInk on ink.
import type { Minor, WalletCorrectionReason, WalletDto } from '@gogospend/contracts';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import type { LoadProblem, LoadProblemKind } from '@mobile/spend/v1/redesign/homeModel';
import type { ConflictRow, WalletPreview } from '@mobile/spend/v1/redesign/planning/walletsModel';
import { formatMinor } from '@mobile/spend/v1/money';
import { TextInput } from '@mobile/theme/AppText';
import { BUN_MAX_FONT_SCALE, bunText } from '@mobile/theme/bunType';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { DECORATIVE, POLITE_LIVE_REGION } from '@mobile/ui/a11y';
import { AmountText, useAmountWords, useMoneyLocale } from '@mobile/ui/Amount';
import { BunText, useBunScript } from '@mobile/ui/BunText';
import { Card, OutlinedCard } from '@mobile/ui/Card';
import { fullDateLabel } from '@mobile/ui/dateStep';
import { FieldError } from '@mobile/ui/FieldError';
import { evaluateKeypad, keypadDisplay, keypadHasOperator } from '@mobile/ui/keypadExpression';
import type { KeypadState } from '@mobile/ui/keypadExpression';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE, BUN_TOUCH } from '@mobile/ui/layout';
import { PillButton } from '@mobile/ui/PillButton';

/** The tile's least height: a card-sized target, well past the 44 pt floor. */
const TILE_MIN = 72;
const FIGURES = { fontVariant: ['tabular-nums' as const] };

function SectionTitle({ children }: { children: string }) {
  return <BunText variant="label" role="heading" accessibilityRole="header" style={{ fontWeight: '700' }}>{children}</BunText>;
}

// ---------------------------------------------------------------------------
// The list

/** "Total balance" and the exact sum, on the stage (ink only), spoken as one: "Total balance ฿21,050.00". */
export function TotalOnStage({ totalMinor }: { totalMinor: Minor }) {
  const tc = useCopy();
  const words = useAmountWords()(totalMinor);
  return (
    <View testID="wallets-total" accessible accessibilityLabel={`${tc('Total balance')} ${words.spoken}`} style={{ gap: BUN_SPACE.xxs }}>
      <BunText variant="caption" tone="ink">{tc('Total balance')}</BunText>
      <AmountText variant="hero" tone="ink">{words.shown}</AmountText>
    </View>
  );
}

/** "Tracking from Tuesday 1 September 2026": the whole date, in the locale's own words. */
function TrackingLine({ date }: { date: string }) {
  const tc = useCopy();
  const locale = useActiveLocale();
  return <BunText variant="caption" tone="muted">{tc('Tracking from {date}', { date: fullDateLabel(date, locale) })}</BunText>;
}

/** The card's name and balance, as the card and the preview both draw them. */
function NameAndBalance({ name, nameTone = 'ink', amount }: { name: string; nameTone?: 'ink' | 'muted'; amount: string }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', columnGap: BUN_SPACE.sm }}>
      <BunText variant="heading" tone={nameTone} style={{ flexShrink: 1 }}>{name}</BunText>
      <AmountText variant="title" style={FIGURES}>{amount}</AmountText>
    </View>
  );
}

/** One wallet in use: its name and exact balance, spoken as "Cash, balance ฿2,350.00". It opens the wallet. */
export function WalletCard({ wallet, onPress }: { wallet: WalletDto; onPress: () => void }) {
  const colors = useBunColors();
  const tc = useCopy();
  const words = useAmountWords()(wallet.balance_minor);
  return (
    <Pressable
      testID="wallet-card"
      accessibilityRole="button"
      accessibilityLabel={tc('{name}, balance {amount}', { name: wallet.name, amount: words.spoken })}
      accessibilityHint={tc('Edit wallet')}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: BUN_TOUCH,
        padding: BUN_SPACE.md,
        gap: BUN_SPACE.xxs,
        borderRadius: BUN_RADIUS.card,
        borderWidth: BUN_OUTLINE.card,
        borderColor: colors.ink,
        backgroundColor: colors.card,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <NameAndBalance name={wallet.name} amount={words.shown} />
      <TrackingLine date={wallet.tracking_start} />
    </Pressable>
  );
}

/** The dashed "Add a wallet" tile: the plus is decoration beside the words. */
export function AddWalletTile({ onPress }: { onPress: () => void }) {
  const colors = useBunColors();
  const tc = useCopy();
  return (
    <Pressable
      testID="wallets-add-tile"
      accessibilityRole="button"
      accessibilityLabel={tc('Add a wallet')}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: TILE_MIN,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: BUN_SPACE.xs,
        padding: BUN_SPACE.md,
        borderRadius: BUN_RADIUS.card,
        borderWidth: BUN_OUTLINE.card,
        borderStyle: 'dashed',
        borderColor: colors.ink,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View {...DECORATIVE}>
        <BunText variant="heading">+</BunText>
      </View>
      <BunText variant="label" style={{ fontWeight: '700' }}>{tc('Add a wallet')}</BunText>
    </Pressable>
  );
}

/** Opens and closes the Archived section; collapsed until asked. */
export function ArchivedToggle({ count, expanded, onPress }: { count: number; expanded: boolean; onPress: () => void }) {
  const tc = useCopy();
  const label = tc('Archived wallets ({count})', { count });
  return (
    <Pressable
      testID="wallets-archived-toggle"
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-expanded={expanded}
      onPress={onPress}
      style={{ minHeight: BUN_TOUCH, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: BUN_SPACE.sm }}
    >
      <BunText variant="label" style={{ fontWeight: '700', flexShrink: 1 }}>{label}</BunText>
      <View {...DECORATIVE}>
        <BunText variant="heading">{expanded ? '−' : '+'}</BunText>
      </View>
    </Pressable>
  );
}

/** An archived wallet: its name, its balance, "Archived" in words, and its action (Unarchive). */
export function ArchivedRow({ wallet, action }: { wallet: WalletDto; action: ReactNode }) {
  const tc = useCopy();
  const words = useAmountWords()(wallet.balance_minor);
  return (
    <OutlinedCard padding="sm" style={{ gap: BUN_SPACE.xs }}>
      <View accessible accessibilityLabel={`${tc('{name}, balance {amount}', { name: wallet.name, amount: words.spoken })}, ${tc('Archived')}`} style={{ gap: BUN_SPACE.xxs }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', columnGap: BUN_SPACE.sm }}>
          <BunText variant="label" style={{ fontWeight: '700', flexShrink: 1 }}>{wallet.name}</BunText>
          <AmountText variant="label">{words.shown}</AmountText>
        </View>
        <BunText variant="caption" tone="muted">{tc('Archived')}</BunText>
      </View>
      {action}
    </OutlinedCard>
  );
}

// ---------------------------------------------------------------------------
// Load problems

const PROBLEM_TITLES: Readonly<Record<LoadProblemKind, string>> = {
  upgrade_required: 'Update Jotbun',
  terms_required: 'Updated terms',
  signed_out: 'Signed out',
  unsupported_platform: 'Use the Jotbun app',
  load_failed: 'Diary not loaded',
};

/** Each load problem names itself; only a plain failure offers Try again (as Home's). */
export function ProblemCard({ problem, onRetry }: { problem: LoadProblem; onRetry: () => void }) {
  const tc = useCopy();
  return (
    <Card testID={`wallets-problem-${problem.kind}`}>
      <BunText variant="heading" role="heading" accessibilityRole="header">{tc(PROBLEM_TITLES[problem.kind])}</BunText>
      <BunText accessibilityRole="alert">{problem.message}</BunText>
      {problem.retry ? <PillButton label={tc('Try again')} onPress={onRetry} /> : null}
    </Card>
  );
}

/** Offline: the wallets synced to this device, by name. No balance is guessed and nothing can be changed. */
export function DeviceWallets({ names }: { names: readonly string[] }) {
  const tc = useCopy();
  return (
    <Card testID="wallets-on-device">
      <SectionTitle>{tc('Saved on this device')}</SectionTitle>
      {names.map((name, index) => <BunText key={`${index}:${name}`}>{name}</BunText>)}
      <BunText variant="caption" tone="muted">{tc('Balances and changes need a connection to Jotbun.')}</BunText>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// The form

/**
 * The card as it will read, live. Its whole content is one element for a
 * screen reader: "Card preview: Piggy bank, balance ฿1,234.50".
 */
export function PreviewCard({ preview, amountText }: { preview: WalletPreview; amountText: string | null }) {
  const tc = useCopy();
  const words = useAmountWords()(preview.balanceMinor);
  const name = preview.name ?? tc('New wallet');
  const shown = amountText ?? words.shown;
  const spoken = amountText ?? words.spoken;
  return (
    <Card testID="wallet-preview" accessible accessibilityLabel={`${tc('Card preview')}: ${tc('{name}, balance {amount}', { name, amount: spoken })}`} style={{ gap: BUN_SPACE.xxs }}>
      <BunText variant="caption" tone="muted">{tc('Card preview')}</BunText>
      <NameAndBalance name={name} nameTone={preview.name ? 'ink' : 'muted'} amount={shown} />
      <TrackingLine date={preview.trackingStart} />
    </Card>
  );
}

/** A labelled one-line text field in NoteField's style (the kit has none for a name). */
export function NameField({ value, onChangeText, error, editable }: { value: string; onChangeText: (text: string) => void; error?: string; editable: boolean }) {
  const colors = useBunColors();
  const tc = useCopy();
  const script = useBunScript();
  const label = tc('Wallet name');
  return (
    <View testID="wallet-name-field" style={{ gap: BUN_SPACE.xxs }}>
      <BunText variant="caption" tone="muted">{label}</BunText>
      <TextInput
        maxFontSizeMultiplier={BUN_MAX_FONT_SCALE.body}
        accessibilityLabel={label}
        aria-invalid={error !== undefined}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        readOnly={!editable}
        returnKeyType="done"
        style={{
          ...bunText('body', script),
          color: colors.ink,
          minHeight: BUN_TOUCH,
          paddingHorizontal: BUN_SPACE.sm,
          paddingVertical: BUN_SPACE.xs,
          borderRadius: BUN_RADIUS.chip,
          borderColor: colors.ink,
          borderWidth: error ? BUN_OUTLINE.card : BUN_OUTLINE.control,
          // Locked text stays fully readable: ink on the page colour, not faded.
          backgroundColor: editable ? colors.card : colors.background,
        }}
      />
      {error ? <FieldError message={error} /> : null}
    </View>
  );
}

/**
 * The opening balance as the keypad holds it: exact, spoken as the exact
 * amount, or as the sum and its result while one is typed ("10 ÷ 3 = ฿3.33").
 * Nothing typed is ฿0.00. A polite live region, as Quick add's amount is.
 */
export function OpeningBalance({ keypad, problems }: { keypad: KeypadState; problems: readonly string[] }) {
  const tc = useCopy();
  const locale = useMoneyLocale();
  const display = keypadDisplay(keypad);
  const sum = keypadHasOperator(keypad);
  const outcome = evaluateKeypad(keypad, { allowZero: true });
  const result = outcome.ok ? formatMinor(outcome.minor, locale) : null;
  const value = sum ? (result ? `${display} = ${result}` : display) : (result ?? formatMinor('0', locale));
  const label = tc('Opening balance');
  return (
    <View testID="wallet-opening-field" style={{ gap: BUN_SPACE.xxs }}>
      <BunText variant="caption" tone="muted">{label}</BunText>
      <View testID="wallet-opening" {...POLITE_LIVE_REGION} accessible accessibilityLabel={tc('{label}, {value}', { label, value })} style={{ gap: BUN_SPACE.xxs }}>
        {sum || display.includes('.') ? <BunText variant="label" tone="muted" style={FIGURES}>{display}</BunText> : null}
        <BunText variant="hero" style={FIGURES}>{result ?? (sum ? display : formatMinor('0', locale))}</BunText>
      </View>
      {problems.map((problem) => <FieldError key={problem} message={problem} />)}
    </View>
  );
}

/** "Tracking starts" with the date chip under it, and its problem. */
export function StartField({ children, error }: { children: ReactNode; error?: string }) {
  const tc = useCopy();
  return (
    <View testID="wallet-start-field" style={{ gap: BUN_SPACE.xxs }}>
      <BunText variant="caption" tone="muted">{tc('Tracking starts')}</BunText>
      {children}
      {error ? <FieldError message={error} /> : null}
    </View>
  );
}

const REASONS: readonly { value: WalletCorrectionReason; label: string }[] = [
  { value: 'entry_error', label: 'A mistake when I set it up' },
  { value: 'balance_reconciliation', label: 'Match my real balance' },
];

/**
 * Why a wallet with entries is being corrected, asked before anything is
 * sent: a named radio group of two full-width choices. The chosen one is an
 * ink pill with bold words, so the choice never rests on colour alone.
 */
export function ReasonQuestion({ value, onChange, error, disabled }: { value: WalletCorrectionReason | null; onChange: (next: WalletCorrectionReason) => void; error?: string; disabled: boolean }) {
  const colors = useBunColors();
  const tc = useCopy();
  const question = tc('Why are you changing this?');
  return (
    <View testID="wallet-reason" role="radiogroup" accessibilityLabel={question} style={{ gap: BUN_SPACE.xs }}>
      <BunText variant="label" style={{ fontWeight: '700' }}>{question}</BunText>
      <BunText variant="caption" tone="muted">{tc('This wallet already has entries, so Jotbun keeps a note of why.')}</BunText>
      {REASONS.map((reason) => {
        const checked = reason.value === value;
        const label = tc(reason.label);
        return (
          <Pressable
            key={reason.value}
            accessibilityRole="radio"
            accessibilityLabel={label}
            aria-checked={checked}
            aria-disabled={disabled}
            disabled={disabled}
            onPress={() => onChange(reason.value)}
            style={{
              minHeight: BUN_TOUCH,
              justifyContent: 'center',
              paddingHorizontal: BUN_SPACE.md,
              paddingVertical: BUN_SPACE.xs,
              borderRadius: BUN_RADIUS.pill,
              borderWidth: BUN_OUTLINE.control,
              borderColor: colors.ink,
              backgroundColor: checked ? colors.ink : colors.card,
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <BunText variant="label" tone={checked ? 'onInk' : 'ink'} style={checked ? { fontWeight: '700' } : undefined}>{label}</BunText>
          </Pressable>
        );
      })}
      {error ? <FieldError message={error} /> : null}
    </View>
  );
}

/**
 * Changed elsewhere: Jotbun's copy field by field, beside yours when this was
 * an edit. A changed field is bold, in words as well as weight. A polite live
 * region. Reload is the way on: here when `onReload` is given (the list), or
 * in the form's pinned footer.
 */
export function ConflictPanel({ rows, onReload }: { rows: readonly ConflictRow[]; onReload?: () => void }) {
  const colors = useBunColors();
  const tc = useCopy();
  const yoursLabel = tc('Yours');
  const serverLabel = tc('On the server');
  const withYours = rows.some((row) => row.yours !== null);
  return (
    <View
      testID="wallet-conflict"
      {...POLITE_LIVE_REGION}
      style={{ gap: BUN_SPACE.sm, padding: BUN_SPACE.md, borderRadius: BUN_RADIUS.card, borderWidth: BUN_OUTLINE.card, borderColor: colors.ink, backgroundColor: colors.card }}
    >
      <BunText variant="heading" role="heading" accessibilityRole="header">{tc('This wallet changed on another device.')}</BunText>
      {rows.length > 0 ? (
        <View aria-hidden style={{ flexDirection: 'row', gap: BUN_SPACE.sm }}>
          {withYours ? <BunText variant="label" style={{ flex: 1, fontWeight: '700' }}>{yoursLabel}</BunText> : null}
          <BunText variant="label" style={{ flex: 1, fontWeight: '700' }}>{serverLabel}</BunText>
        </View>
      ) : null}
      {rows.map((row) => {
        const spoken = row.yours !== null
          ? tc('{label}. {yoursLabel}: {yours}. {serverLabel}: {server}.', { label: row.label, yoursLabel, yours: row.yours, serverLabel, server: row.theirs })
          : tc('{label}. {serverLabel}: {server}.', { label: row.label, serverLabel, server: row.theirs });
        const weight = row.differs ? { fontWeight: '700' as const } : undefined;
        return (
          <View key={row.key} accessible accessibilityLabel={spoken} style={{ gap: BUN_SPACE.xxs, paddingTop: BUN_SPACE.xs, borderTopWidth: BUN_OUTLINE.rule, borderColor: colors.rule }}>
            <BunText variant="caption" tone="muted">{row.label}</BunText>
            <View style={{ flexDirection: 'row', gap: BUN_SPACE.sm }}>
              {withYours ? <BunText style={[{ flex: 1 }, weight]}>{row.yours ?? ''}</BunText> : null}
              <BunText style={[{ flex: 1 }, weight]}>{row.theirs}</BunText>
            </View>
          </View>
        );
      })}
      {onReload ? <PillButton label={tc('Reload')} onPress={onReload} /> : null}
    </View>
  );
}
