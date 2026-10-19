// One record in a list (redesign R2b): the category icon, a title, the wallet
// (or From → To), a signed exact amount and, while it is not settled, a quiet
// state line ("saving…", "checking…", "needs a look", "Update Jotbun to
// send"). The signs are Amount's: money out takes the minus sign (U+2212),
// money in "+", and a move between the user's own wallets is unsigned.
// Amounts are ink: red and green belong to budgets only.
//
// Long-press opens Edit / Copy / Delete (whichever the screen passes);
// native screen readers get the same actions as an accessibility actions
// menu, and the row reads as one sentence: "Coffee, Expense ฿65.00, saving,
// Cash". The web has no accessibility actions, so there a "More" button
// beside the row (named "Actions for Coffee") opens the same bar from the
// keyboard and moves focus into it.
import type { Minor, TransactionType } from '@gogospend/contracts';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import type { AccessibilityActionEvent, HostInstance } from 'react-native';

import { useCopy } from '@mobile/i18n/useCopy';
import { useBunColors } from '@mobile/theme/ThemeProvider';

import { moveAccessibilityFocus } from './a11y';
import { AmountText, useAmountWords } from './Amount';
import { BunText } from './BunText';
import { CategoryIcon } from './categoryIcons';
import type { CategoryLook } from './categoryIcons';
import { Glyph } from './Glyph';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE, BUN_TOUCH } from './layout';

/**
 * `update_to_send`: a draft saved on this device that can only be sent once
 * the app is updated. It is waiting on the person, not on the network, so it
 * never reads "saving".
 */
export type RecordRowState = 'confirmed' | 'saving' | 'checking' | 'needs_look' | 'update_to_send';

export type RecordRowProps = {
  readonly title: string;
  /** The wallet, or "Cash → Bank" for a move. */
  readonly detail: string;
  readonly type: TransactionType;
  readonly amountMinor: Minor;
  /** The category's look; a move draws its own icon. */
  readonly category?: CategoryLook | null;
  readonly state?: RecordRowState;
  readonly onPress?: () => void;
  readonly onEdit?: () => void;
  readonly onCopy?: () => void;
  readonly onDelete?: () => void;
};

export type RecordRowActionHandlers = Pick<RecordRowProps, 'onEdit' | 'onCopy' | 'onDelete'>;

/** The row's actions, in order, for the accessibility actions menu and the long-press bar. */
export function recordRowActions(handlers: RecordRowActionHandlers, tc: (english: string) => string): { name: string; label: string }[] {
  const actions: { name: string; label: string }[] = [];
  if (handlers.onEdit) actions.push({ name: 'edit', label: tc('Edit') });
  if (handlers.onCopy) actions.push({ name: 'copy', label: tc('Copy') });
  if (handlers.onDelete) actions.push({ name: 'delete', label: tc('Delete') });
  return actions;
}

export function runRecordRowAction(name: string, handlers: RecordRowActionHandlers): void {
  if (name === 'edit') handlers.onEdit?.();
  else if (name === 'copy') handlers.onCopy?.();
  else if (name === 'delete') handlers.onDelete?.();
}

export function RecordRow({ title, detail, type, amountMinor, category, state = 'confirmed', onPress, onEdit, onCopy, onDelete }: RecordRowProps) {
  const colors = useBunColors();
  const tc = useCopy();
  const amountWords = useAmountWords();
  const [menu, setMenu] = useState(false);
  /** The bar was opened from the More button, so focus follows it into the bar. */
  const fromMore = useRef(false);
  const firstAction = useRef<HostInstance>(null);
  const handlers = { onEdit, onCopy, onDelete };
  const actions = recordRowActions(handlers, tc);
  const keyboardPath = Platform.OS === 'web' && actions.length > 0;

  useEffect(() => {
    if (menu && fromMore.current) moveAccessibilityFocus(firstAction.current);
    fromMore.current = false;
  }, [menu]);

  // Spoken unsigned with its type ("Expense ฿65.00"); drawn with Amount's sign ("−฿65.00").
  const amount = amountWords(amountMinor).shown;
  const shown = amountWords(amountMinor, type).shown;
  const kind = type === 'expense' ? tc('Expense') : type === 'income' ? tc('Income') : tc('Transfer');
  const stateWords: Record<RecordRowState, { shown: string; spoken: string } | null> = {
    confirmed: null,
    saving: { shown: tc('saving…'), spoken: tc('saving') },
    checking: { shown: tc('checking…'), spoken: tc('checking') },
    needs_look: { shown: tc('needs a look'), spoken: tc('needs a look') },
    update_to_send: { shown: tc('Update Jotbun to send'), spoken: tc('Update Jotbun to send') },
  };
  const words = stateWords[state];
  // States that wait on the person are ink and bold; states that wait on Jotbun are the quiet accent.
  const asksThePerson = state === 'needs_look' || state === 'update_to_send';
  const spoken = [title, `${kind} ${amount}`, words?.spoken ?? null, detail].filter((part): part is string => part !== null && part !== '').join(', ');
  const look: CategoryLook = type === 'transfer' ? { builtinKey: 'transfer', name: title, color: null } : category ?? { builtinKey: null, name: title, color: null };
  const actionsLabel = tc('Actions for {title}', { title });

  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    const name = event.nativeEvent.actionName;
    if (name === 'activate') onPress?.();
    else if (name === 'longpress') setMenu((open) => !open);
    else runRecordRowAction(name, handlers);
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable
          accessibilityRole={onPress ? 'button' : undefined}
          accessibilityLabel={spoken}
          accessibilityActions={[...(onPress ? [{ name: 'activate' }] : []), ...actions]}
          onAccessibilityAction={onAccessibilityAction}
          onPress={onPress}
          onLongPress={actions.length > 0 ? () => setMenu((open) => !open) : undefined}
          style={({ pressed }) => ({
            flex: 1,
            minHeight: BUN_TOUCH,
            flexDirection: 'row',
            alignItems: 'center',
            gap: BUN_SPACE.sm,
            paddingVertical: BUN_SPACE.xs,
            opacity: pressed && onPress ? 0.7 : 1,
          })}
        >
          <CategoryIcon look={look} size={40} />
          <View style={{ flex: 1, gap: 2 }}>
            <BunText variant="body">{title}</BunText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: BUN_SPACE.xs }}>
              <BunText variant="caption" tone="muted">{detail}</BunText>
              {words ? (
                <BunText variant="caption" tone={asksThePerson ? 'ink' : 'accent'} style={asksThePerson ? { fontWeight: '700' } : undefined}>{words.shown}</BunText>
              ) : null}
            </View>
          </View>
          <AmountText variant="body">{shown}</AmountText>
        </Pressable>
        {keyboardPath ? (
          // A sibling of the row, never inside it: a button cannot hold another button.
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={actionsLabel}
            aria-expanded={menu}
            onPress={() => {
              fromMore.current = !menu;
              setMenu((open) => !open);
            }}
            style={{ minHeight: BUN_TOUCH, minWidth: BUN_TOUCH, alignItems: 'center', justifyContent: 'center', borderRadius: BUN_RADIUS.pill }}
          >
            <Glyph name="dots" color={colors.ink} />
          </Pressable>
        ) : null}
      </View>
      {menu && actions.length > 0 ? (
        <View role="toolbar" accessibilityLabel={actionsLabel} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: BUN_SPACE.xs, paddingBottom: BUN_SPACE.xs }}>
          {actions.map((action, index) => (
            <Pressable
              key={action.name}
              ref={index === 0 ? firstAction : undefined}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              onPress={() => {
                setMenu(false);
                runRecordRowAction(action.name, handlers);
              }}
              style={{ minHeight: BUN_TOUCH, justifyContent: 'center', paddingHorizontal: BUN_SPACE.md, borderRadius: BUN_RADIUS.pill, borderWidth: BUN_OUTLINE.control, borderColor: colors.ink, backgroundColor: colors.card }}
            >
              <BunText variant="label">{action.label}</BunText>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
