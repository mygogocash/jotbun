// Choosing wallets on the entry sheet (redesign R2b). One wallet for an
// expense or income; "From → To" for a move, with a swap button, a "move all"
// chip and a plain error when both sides are the same wallet. Each wallet
// shows its exact balance when one is known. A wallet synced to this device
// has none (offline there is no server list), so it shows its name only, and
// "move all" is offered only for a From wallet whose balance is known: a
// guessed balance would be a wrong number on screen. Archived wallets are
// never offered.
import type { Minor, WalletDto } from '@gogospend/contracts';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useCopy } from '@mobile/i18n/useCopy';
import { useBunColors } from '@mobile/theme/ThemeProvider';

import { DECORATIVE } from './a11y';
import { AmountText, useAmountWords } from './Amount';
import { BunText } from './BunText';
import { FieldError } from './FieldError';
import { Glyph } from './Glyph';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE, BUN_TOUCH } from './layout';

export type WalletChoice = Pick<WalletDto, 'id' | 'name' | 'archived'> & {
  /** The exact balance; leave out (or null) when it is not known, as for a wallet synced to this device. */
  readonly balance_minor?: Minor | null;
};

const balanceOf = (wallet: WalletChoice): Minor | null => wallet.balance_minor ?? null;

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
  const amountWords = useAmountWords();
  return (
    <View role="radiogroup" accessibilityLabel={label} style={{ gap: BUN_SPACE.xs }}>
      {wallets.map((wallet) => {
        const checked = wallet.id === selectedId;
        const known = balanceOf(wallet);
        const balance = known === null ? null : amountWords(known).shown;
        return (
          <Pressable
            key={wallet.id}
            accessibilityRole="radio"
            accessibilityLabel={balance === null ? wallet.name : tc('{name}, balance {amount}', { name: wallet.name, amount: balance })}
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
            <View {...DECORATIVE} style={{ width: 20, height: 20, borderRadius: BUN_RADIUS.pill, borderWidth: BUN_OUTLINE.control, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
              {checked ? <View style={{ width: 10, height: 10, borderRadius: BUN_RADIUS.pill, backgroundColor: colors.ink }} /> : null}
            </View>
            <BunText variant="label" style={{ flex: 1 }}>{wallet.name}</BunText>
            {balance === null ? null : <AmountText variant="label" tone="muted">{balance}</AmountText>}
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
  const amountWords = useAmountWords();
  const [open, setOpen] = useState<Side | null>(null);
  const from = wallets.find((wallet) => wallet.id === fromId) ?? null;
  const to = wallets.find((wallet) => wallet.id === toId) ?? null;
  const same = fromId !== null && fromId === toId;
  // Move all needs the From wallet's own, known balance.
  const fromKnown = from ? balanceOf(from) : null;

  const card = (side: Side, wallet: WalletChoice | null) => {
    const word = side === 'from' ? tc('From') : tc('To');
    const known = wallet ? balanceOf(wallet) : null;
    const balance = known === null ? null : amountWords(known).shown;
    let label: string;
    if (!wallet) label = side === 'from' ? tc('From: choose a wallet') : tc('To: choose a wallet');
    else if (balance === null) label = side === 'from' ? tc('From {name}', { name: wallet.name }) : tc('To {name}', { name: wallet.name });
    else label = side === 'from' ? tc('From {name}, balance {amount}', { name: wallet.name, amount: balance }) : tc('To {name}, balance {amount}', { name: wallet.name, amount: balance });
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
        {balance ? <AmountText variant="caption" tone="muted">{balance}</AmountText> : null}
      </Pressable>
    );
  };

  const pill = { minHeight: BUN_TOUCH, flexDirection: 'row' as const, alignItems: 'center' as const, gap: BUN_SPACE.xs, paddingHorizontal: BUN_SPACE.sm, borderRadius: BUN_RADIUS.pill, borderWidth: BUN_OUTLINE.control, borderColor: colors.ink, backgroundColor: colors.background, opacity: disabled ? 0.5 : 1 };
  return (
    <View style={{ gap: BUN_SPACE.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: BUN_SPACE.xs }}>
        {card('from', from)}
        <View {...DECORATIVE}><BunText variant="heading">→</BunText></View>
        {card('to', to)}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: BUN_SPACE.xs }}>
        <Pressable accessibilityRole="button" accessibilityLabel={tc('Swap wallets')} disabled={disabled} onPress={onSwap} style={pill}>
          <Glyph name="swap" color={colors.ink} />
          <BunText variant="label">{tc('Swap')}</BunText>
        </Pressable>
        {onMoveAll && fromKnown !== null && BigInt(fromKnown) > 0n ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tc('Move all {amount}', { amount: amountWords(fromKnown).shown })}
            disabled={disabled}
            onPress={() => onMoveAll(fromKnown)}
            style={pill}
          >
            <BunText variant="label">{tc('Move all')}</BunText>
            <AmountText variant="label">{amountWords(fromKnown).shown}</AmountText>
          </Pressable>
        ) : null}
      </View>
      {same ? <FieldError message={tc('Choose two different wallets')} /> : null}
      {error ? <FieldError message={error} /> : null}
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
