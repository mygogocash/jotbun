// Choosing wallets on the entry sheet (redesign R2b). One wallet for an
// expense or income; "From → To" for a move, with a swap button, a "move all"
// chip and a plain error when both sides are the same wallet. Each wallet
// shows its exact balance. Archived wallets are never offered.
import type { Minor, WalletDto } from '@gogospend/contracts';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useCopy } from '@mobile/i18n/useCopy';
import { formatMinor } from '@mobile/spend/v1/money';
import { useBunColors } from '@mobile/theme/ThemeProvider';

import { BunText } from './BunText';
import { Decorative, Glyph, KitError, MoneyText, useMoneyLocale } from './entryKitPrivate';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE, BUN_TOUCH } from './layout';

export type WalletChoice = Pick<WalletDto, 'id' | 'name' | 'balance_minor' | 'archived'>;

export type WalletPickerProps =
  | {
      readonly mode: 'single';
      readonly wallets: readonly WalletChoice[];
      readonly selectedId: string | null;
      readonly onSelect: (id: string) => void;
      readonly disabled?: boolean;
    }
  | {
      readonly mode: 'move';
      readonly wallets: readonly WalletChoice[];
      readonly fromId: string | null;
      readonly toId: string | null;
      readonly onChangeFrom: (id: string) => void;
      readonly onChangeTo: (id: string) => void;
      readonly onSwap: () => void;
      /** Offered with the From wallet's whole balance when it holds money. */
      readonly onMoveAll?: (balanceMinor: Minor) => void;
      /** Another problem to state, such as one from the server. */
      readonly error?: string | null;
      readonly disabled?: boolean;
    };

type Side = 'from' | 'to';

function WalletList({ label, wallets, selectedId, onSelect, disabled }: { label: string; wallets: readonly WalletChoice[]; selectedId: string | null; onSelect: (id: string) => void; disabled: boolean }) {
  const colors = useBunColors();
  const tc = useCopy();
  const locale = useMoneyLocale();
  return (
    <View role="radiogroup" accessibilityLabel={label} style={{ gap: BUN_SPACE.xs }}>
      {wallets.map((wallet) => {
        const checked = wallet.id === selectedId;
        const balance = formatMinor(wallet.balance_minor, locale);
        return (
          <Pressable
            key={wallet.id}
            accessibilityRole="radio"
            accessibilityLabel={tc('{name}, balance {amount}', { name: wallet.name, amount: balance })}
            aria-checked={checked}
            disabled={disabled}
            onPress={() => onSelect(wallet.id)}
            style={{
              minHeight: BUN_TOUCH,
              flexDirection: 'row',
              alignItems: 'center',
              gap: BUN_SPACE.sm,
              paddingHorizontal: BUN_SPACE.sm,
              paddingVertical: BUN_SPACE.xs,
              borderRadius: BUN_RADIUS.card,
              borderColor: colors.ink,
              borderWidth: checked ? BUN_OUTLINE.card : BUN_OUTLINE.control,
              backgroundColor: colors.card,
              opacity: disabled ? 0.5 : 1,
            }}
          >
            {/* A radio mark, so the choice never rests on colour or outline weight alone. */}
            <Decorative style={{ width: 20, height: 20, borderRadius: BUN_RADIUS.pill, borderWidth: BUN_OUTLINE.control, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
              {checked ? <View style={{ width: 10, height: 10, borderRadius: BUN_RADIUS.pill, backgroundColor: colors.ink }} /> : null}
            </Decorative>
            <BunText variant="label" style={{ flex: 1 }}>{wallet.name}</BunText>
            <MoneyText variant="label" tone="muted">{balance}</MoneyText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function WalletPicker(props: WalletPickerProps) {
  const tc = useCopy();
  const live = props.wallets.filter((wallet) => !wallet.archived);
  if (props.mode === 'single') {
    return <WalletList label={tc('Wallet')} wallets={live} selectedId={props.selectedId} onSelect={props.onSelect} disabled={props.disabled ?? false} />;
  }
  return <MovePicker {...props} wallets={live} />;
}

function MovePicker({ wallets, fromId, toId, onChangeFrom, onChangeTo, onSwap, onMoveAll, error, disabled = false }: Extract<WalletPickerProps, { mode: 'move' }>) {
  const colors = useBunColors();
  const tc = useCopy();
  const locale = useMoneyLocale();
  const [open, setOpen] = useState<Side | null>(null);
  const from = wallets.find((wallet) => wallet.id === fromId) ?? null;
  const to = wallets.find((wallet) => wallet.id === toId) ?? null;
  const same = fromId !== null && fromId === toId;
  const fromBalance = from ? BigInt(from.balance_minor) : 0n;

  const card = (side: Side, wallet: WalletChoice | null) => {
    const word = side === 'from' ? tc('From') : tc('To');
    const balance = wallet ? formatMinor(wallet.balance_minor, locale) : null;
    const label = wallet && balance
      ? side === 'from' ? tc('From {name}, balance {amount}', { name: wallet.name, amount: balance }) : tc('To {name}, balance {amount}', { name: wallet.name, amount: balance })
      : side === 'from' ? tc('From: choose a wallet') : tc('To: choose a wallet');
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        aria-expanded={open === side}
        disabled={disabled}
        onPress={() => setOpen((current) => (current === side ? null : side))}
        style={{
          flex: 1,
          minHeight: BUN_TOUCH,
          gap: BUN_SPACE.xxs,
          padding: BUN_SPACE.sm,
          borderRadius: BUN_RADIUS.card,
          borderColor: colors.ink,
          borderWidth: open === side ? BUN_OUTLINE.card : BUN_OUTLINE.control,
          backgroundColor: colors.card,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <BunText variant="caption" tone="muted">{word}</BunText>
        <BunText variant="label">{wallet ? wallet.name : tc('Choose a wallet')}</BunText>
        {balance ? <MoneyText variant="caption" tone="muted">{balance}</MoneyText> : null}
      </Pressable>
    );
  };

  const pill = { minHeight: BUN_TOUCH, flexDirection: 'row' as const, alignItems: 'center' as const, gap: BUN_SPACE.xs, paddingHorizontal: BUN_SPACE.sm, borderRadius: BUN_RADIUS.pill, borderWidth: BUN_OUTLINE.control, borderColor: colors.ink, backgroundColor: colors.background, opacity: disabled ? 0.5 : 1 };
  return (
    <View style={{ gap: BUN_SPACE.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: BUN_SPACE.xs }}>
        {card('from', from)}
        <Decorative><BunText variant="heading">→</BunText></Decorative>
        {card('to', to)}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: BUN_SPACE.xs }}>
        <Pressable accessibilityRole="button" accessibilityLabel={tc('Swap wallets')} disabled={disabled} onPress={onSwap} style={pill}>
          <Glyph name="swap" color={colors.ink} />
          <BunText variant="label">{tc('Swap')}</BunText>
        </Pressable>
        {onMoveAll && from && fromBalance > 0n ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tc('Move all {amount}', { amount: formatMinor(from.balance_minor, locale) })}
            disabled={disabled}
            onPress={() => onMoveAll(from.balance_minor)}
            style={pill}
          >
            <BunText variant="label">{tc('Move all')}</BunText>
            <MoneyText variant="label">{formatMinor(from.balance_minor, locale)}</MoneyText>
          </Pressable>
        ) : null}
      </View>
      {same ? <KitError message={tc('Choose two different wallets')} /> : null}
      {error ? <KitError message={error} /> : null}
      {open ? (
        <WalletList
          label={open === 'from' ? tc('From') : tc('To')}
          wallets={wallets}
          selectedId={open === 'from' ? fromId : toId}
          disabled={disabled}
          onSelect={(id) => {
            if (open === 'from') onChangeFrom(id);
            else onChangeTo(id);
            setOpen(null);
          }}
        />
      ) : null}
    </View>
  );
}
