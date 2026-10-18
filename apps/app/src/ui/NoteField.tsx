// A one-line note or merchant field in the kit style (redesign R2b). It shows
// the limit as it fills (note 500, merchant 120, counted in characters the
// way the API counts them) and says in words when the text will not be
// accepted, using the same rules as the API (`normalizeNote`,
// `normalizeMerchant`). It never truncates what was typed or pasted.
import { MERCHANT_MAX_CHARS, NOTE_MAX_CHARS, normalizeMerchant, normalizeNote } from '@gogospend/contracts';
import { View } from 'react-native';

import { useCopy } from '@mobile/i18n/useCopy';
import { TextInput } from '@mobile/theme/AppText';
import { bunText } from '@mobile/theme/bunType';
import { useBunColors } from '@mobile/theme/ThemeProvider';

import { BunText, useBunScript } from './BunText';
import { FieldError } from './FieldError';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE, BUN_TOUCH } from './layout';

export type NoteFieldProps = {
  readonly kind: 'note' | 'merchant';
  readonly value: string;
  readonly onChangeText: (next: string) => void;
  /** A problem from elsewhere (the server, a save); shown after the field's own. */
  readonly error?: string | null;
  readonly editable?: boolean;
  /** Defaults to "Note" or "Merchant". */
  readonly label?: string;
  readonly placeholder?: string;
};

/** Characters as the API counts them: code points of the NFC, trimmed text. */
export function noteLength(value: string): number {
  return [...value.normalize('NFC').trim()].length;
}

export function NoteField({ kind, value, onChangeText, error, editable = true, label, placeholder }: NoteFieldProps) {
  const colors = useBunColors();
  const tc = useCopy();
  const script = useBunScript();
  const max = kind === 'note' ? NOTE_MAX_CHARS : MERCHANT_MAX_CHARS;
  const count = noteLength(value);
  let own: string | null = null;
  try {
    if (kind === 'note') normalizeNote(value);
    else normalizeMerchant(value);
  } catch {
    own = kind === 'note' ? tc('Notes are up to 500 characters.') : tc('Use one line of up to 120 characters.');
  }
  const problems = [own, error ?? null].filter((problem): problem is string => problem !== null && problem !== '');
  const name = label ?? (kind === 'note' ? tc('Note') : tc('Merchant'));
  const invalid = problems.length > 0;
  return (
    <View style={{ gap: BUN_SPACE.xxs }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: BUN_SPACE.xs }}>
        <BunText variant="caption" tone="muted" style={{ flexShrink: 1 }}>{name}</BunText>
        <BunText variant="caption" tone="muted" accessibilityLabel={tc('{count} of {max} characters', { count, max })} style={{ fontVariant: ['tabular-nums'] }}>
          {`${count} / ${max}`}
        </BunText>
      </View>
      <TextInput
        accessibilityLabel={name}
        aria-invalid={invalid}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        readOnly={!editable}
        multiline={false}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        returnKeyType="done"
        style={{
          ...bunText('body', script),
          color: colors.ink,
          minHeight: BUN_TOUCH,
          paddingHorizontal: BUN_SPACE.sm,
          paddingVertical: BUN_SPACE.xs,
          borderRadius: BUN_RADIUS.chip,
          borderColor: colors.ink,
          borderWidth: invalid ? BUN_OUTLINE.card : BUN_OUTLINE.control,
          // Locked text stays fully readable: ink on the page colour, not faded.
          backgroundColor: editable ? colors.card : colors.background,
        }}
      />
      {problems.map((problem) => <FieldError key={problem} message={problem} />)}
    </View>
  );
}
