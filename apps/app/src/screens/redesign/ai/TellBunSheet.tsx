// "Tell Bun" (premium plan A3), opened from Quick add: type a sentence such as
// "ข้าวมันไก่ 50" or choose a bank slip, check what Bun read, then "Use this"
// fills Quick add. Nothing is saved here; the person saves in Quick add.
//
// - Typing works everywhere: with Bun's AI help on, Claude reads it; offline,
//   with AI off, paused or out of uses, the phone's own rules answer.
// - A slip needs AI help (an image is not something the rules can read);
//   without it the button offers to turn it on.
// - What Bun could not tell is listed in hedged words under the draft.
import type { AiDraft, AiLocale, CategoryDto } from '@gogospend/contracts';
import { AI_SLIP_MAX_BYTES } from '@gogospend/contracts';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Keyboard, Pressable, View } from 'react-native';

import { V1Error } from '@mobile/api/client';
import { useCopy } from '@mobile/i18n/useCopy';
import { playHaptic } from '@mobile/lib/hapticMoment';
import { Bun } from '@mobile/mascot/Bun';
import { useAiCompanion } from '@mobile/spend/v1/ai/AiCompanionProvider';
import { draftHints, localDrafts, moreDraftsLine } from '@mobile/spend/v1/ai/tellBun';
import type { TellBunContext } from '@mobile/spend/v1/ai/tellBun';
import type { OftenLogged } from '@mobile/spend/v1/ai/oftenLogged';
import { formatMinor } from '@mobile/spend/v1/money';
import { categoryName } from '@mobile/spend/v1/viewModels';
import { TextInput } from '@mobile/theme/AppText';
import { BUN_MAX_FONT_SCALE, bunText } from '@mobile/theme/bunType';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { BunText, useBunScript } from '@mobile/ui/BunText';
import { fullDateLabel } from '@mobile/ui/dateStep';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE, BUN_TOUCH } from '@mobile/ui/layout';
import { PillButton } from '@mobile/ui/PillButton';
import { Sheet } from '@mobile/ui/Sheet';

import { AiConsentSheet } from './AiConsentSheet';

export type SlipPick =
  | { kind: 'picked'; base64: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' }
  | { kind: 'cancelled' }
  | { kind: 'denied' }
  | { kind: 'unavailable' };

/** The photo library, loaded on demand, as a compact JPEG with its base64. Picking sends nothing. */
export async function pickSlipFromLibrary(): Promise<SlipPick> {
  let ImagePicker: typeof import('expo-image-picker');
  try {
    ImagePicker = await import('expo-image-picker');
  } catch {
    return { kind: 'unavailable' };
  }
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      allowsEditing: false,
      exif: false,
      base64: true,
      quality: 0.6,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    const asset = result.canceled ? undefined : result.assets?.[0];
    if (!asset?.base64) return { kind: 'cancelled' };
    const type = asset.mimeType === 'image/png' || asset.mimeType === 'image/webp' ? asset.mimeType : 'image/jpeg';
    return { kind: 'picked', base64: asset.base64.replace(/\s+/g, ''), mediaType: type };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return /permission/i.test(message) ? { kind: 'denied' } : { kind: 'unavailable' };
  }
}

export type TellBunSheetProps = {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly context: TellBunContext & { readonly categories: readonly CategoryDto[] };
  readonly locale: AiLocale;
  /** Fills Quick add with the draft. */
  readonly onUse: (draft: AiDraft) => void;
  /** The slip picker; the photo library unless given (tests). */
  readonly pickSlip?: () => Promise<SlipPick>;
  /** The person's own repeated entries, each one tap from a draft (no AI use). */
  readonly often?: readonly OftenLogged[];
};

type Phase =
  | { kind: 'idle' }
  | { kind: 'thinking'; about: 'text' | 'slip' }
  | { kind: 'result'; drafts: AiDraft[]; note: string | null; slipUri?: string }
  | { kind: 'problem'; message: string };

const decodedBytes = (base64: string) => Math.floor((base64.length * 3) / 4);

export function TellBunSheet({ visible, onClose, context, locale, onUse, pickSlip = pickSlipFromLibrary, often = [] }: TellBunSheetProps) {
  const tc = useCopy();
  const colors = useBunColors();
  const script = useBunScript();
  const companion = useAiCompanion();
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [consenting, setConsenting] = useState(false);
  const moneyLocale = locale === 'th' ? 'th' : 'en';

  // The field takes focus as the sheet opens, and a draft shows below it, where
  // a phone's keyboard would cover it. A draft is checked, not typed, so each
  // new draft closes the keyboard (a re-read stays a result, hence `phase`, not
  // `phase.kind`); a sentence Bun could not read keeps it up to retype.
  useEffect(() => {
    if (phase.kind === 'result') Keyboard.dismiss();
  }, [phase]);

  /** Why Bun answered from the phone instead of with AI, when that is worth saying. */
  function fallbackNote(error: unknown): string | null {
    if (error instanceof V1Error && error.code === 'AI_LIMIT_REACHED') return tc("Bun's AI help is resting until tomorrow, so the phone read this.");
    if (error instanceof V1Error && error.code === 'AI_CONSENT_REQUIRED') {
      companion.refresh();
      return null;
    }
    return tc('Bun read this on your phone.');
  }

  function show(drafts: AiDraft[], note: string | null, slipUri?: string) {
    if (drafts.length === 0) {
      setPhase({ kind: 'problem', message: tc("Bun couldn't find an entry in that. Try something like “ข้าวมันไก่ 50”.") });
      return;
    }
    playHaptic('aiSuggestionReady');
    setPhase({ kind: 'result', drafts, note, slipUri });
  }

  async function readText() {
    const sentence = text.trim();
    if (!sentence) return;
    const resources = companion.resources;
    if (!companion.enabled || !resources) {
      show(localDrafts(sentence, context), null);
      return;
    }
    setPhase({ kind: 'thinking', about: 'text' });
    try {
      const result = await resources.parse({ text: sentence, today: context.today, locale });
      show(result.drafts, null);
    } catch (error) {
      show(localDrafts(sentence, context), fallbackNote(error));
    }
  }

  async function readSlip() {
    const resources = companion.resources;
    if (!companion.enabled || !resources) {
      setConsenting(true);
      return;
    }
    const picked = await pickSlip();
    if (picked.kind === 'cancelled') return;
    if (picked.kind !== 'picked') {
      setPhase({ kind: 'problem', message: picked.kind === 'denied' ? tc('Jotbun needs access to your photos to read a slip. You can allow it in Settings.') : tc("Slips can't be chosen on this phone.") });
      return;
    }
    if (decodedBytes(picked.base64) > AI_SLIP_MAX_BYTES) {
      setPhase({ kind: 'problem', message: tc('That image is too large. Choose a screenshot of the slip.') });
      return;
    }
    setPhase({ kind: 'thinking', about: 'slip' });
    try {
      const result = await resources.slip({ image_base64: picked.base64, media_type: picked.mediaType, today: context.today, locale });
      // The slip stays beside what Bun read from it, so the two can be compared before Use this.
      show(result.drafts, result.bank ? tc('From a {bank} slip.', { bank: result.bank }) : null, `data:${picked.mediaType};base64,${picked.base64}`);
    } catch (error) {
      playHaptic('saveFailed');
      const limit = error instanceof V1Error && error.code === 'AI_LIMIT_REACHED';
      setPhase({ kind: 'problem', message: limit ? tc("You've read today's slips. Bun can read more tomorrow.") : tc("Bun couldn't read that slip right now. Try again, or type it instead.") });
    }
  }

  function use(draft: AiDraft) {
    playHaptic('aiAccepted');
    onUse(draft);
    setText('');
    setPhase({ kind: 'idle' });
    onClose();
  }

  const close = () => {
    setPhase({ kind: 'idle' });
    onClose();
  };

  return (
    <>
      <Sheet visible={visible && !consenting} onClose={close} title={tc('Tell Bun')}>
        <View style={{ gap: BUN_SPACE.md }}>
          <BunText tone="muted">{tc('Write it the way you would in a chat. Bun fills in the entry for you to check.')}</BunText>
          <TextInput
            maxFontSizeMultiplier={BUN_MAX_FONT_SCALE.body}
            accessibilityLabel={tc('What did you spend or receive?')}
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => void readText()}
            placeholder={tc('e.g. ข้าวมันไก่ 50, grab 120 yesterday')}
            placeholderTextColor={colors.muted}
            returnKeyType="send"
            maxLength={200}
            autoFocus
            style={{
              ...bunText('body', script),
              color: colors.ink,
              minHeight: BUN_TOUCH,
              paddingHorizontal: BUN_SPACE.sm,
              paddingVertical: BUN_SPACE.xs,
              borderRadius: BUN_RADIUS.chip,
              borderColor: colors.ink,
              borderWidth: BUN_OUTLINE.control,
              backgroundColor: colors.card,
            }}
          />
          <View style={{ flexDirection: 'row', gap: BUN_SPACE.xs }}>
            <View style={{ flex: 1 }}>
              <PillButton label={tc('Read it')} onPress={() => void readText()} disabled={text.trim().length === 0 || phase.kind === 'thinking'} />
            </View>
            <View style={{ flex: 1 }}>
              <PillButton kind="secondary" label={tc('Scan a slip')} onPress={() => void readSlip()} disabled={phase.kind === 'thinking'} />
            </View>
          </View>
          {!companion.enabled ? <BunText variant="caption" tone="muted">{tc("Reading slips needs Bun's AI help. Typing works on your phone.")}</BunText> : null}

          {often.length > 0 && (phase.kind === 'idle' || phase.kind === 'problem') ? (
            <View testID="tell-bun-often" style={{ gap: BUN_SPACE.xs }}>
              <BunText tone="muted">{tc('Often logged:')}</BunText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: BUN_SPACE.xs }}>
                {often.map((entry) => (
                  <Pressable
                    key={entry.key}
                    accessibilityRole="button"
                    accessibilityLabel={entry.label}
                    onPress={() => {
                      playHaptic('chipPick');
                      setPhase({ kind: 'result', drafts: [entry.draft], note: tc('From your own entries.') });
                    }}
                    style={({ pressed }) => ({ minHeight: BUN_TOUCH, justifyContent: 'center', paddingHorizontal: BUN_SPACE.sm, borderRadius: BUN_RADIUS.chip, borderWidth: BUN_OUTLINE.control, borderColor: colors.ink, backgroundColor: pressed ? colors.background : colors.card })}
                  >
                    <BunText>{entry.label}</BunText>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {phase.kind === 'thinking' ? (
            <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: BUN_SPACE.sm }}>
              <Bun pose="thinking" size="s" />
              <ActivityIndicator color={colors.ink} />
              <BunText tone="muted">{phase.about === 'slip' ? tc('Bun is reading your slip…') : tc('Bun is reading…')}</BunText>
            </View>
          ) : null}

          {phase.kind === 'problem' ? <BunText role="alert">{phase.message}</BunText> : null}

          {phase.kind === 'result' ? (
            <DraftCard
              draft={phase.drafts[0]}
              categories={context.categories}
              moneyLocale={moneyLocale}
              dateLocale={locale}
              note={[phase.note, moreDraftsLine(phase.drafts.length, tc)].filter((line): line is string => Boolean(line)).join(' ') || null}
              slipUri={phase.slipUri}
              onUse={() => use(phase.drafts[0])}
            />
          ) : null}
        </View>
      </Sheet>
      <AiConsentSheet visible={consenting} onClose={() => setConsenting(false)} />
    </>
  );
}

function DraftCard({ draft, categories, moneyLocale, dateLocale, note, slipUri, onUse }: {
  draft: AiDraft;
  categories: readonly CategoryDto[];
  moneyLocale: 'th' | 'en';
  dateLocale: AiLocale;
  note: string | null;
  /** The slip the draft was read from, shown beside it (kept on the phone only). */
  slipUri?: string;
  onUse: () => void;
}) {
  const tc = useCopy();
  const colors = useBunColors();
  const category = categories.find((c) => c.id === draft.category_id);
  const hints = draftHints(draft, tc);
  const amount = draft.amount_minor ? formatMinor(draft.amount_minor, moneyLocale) : tc('Amount to check');
  return (
    <View testID="tell-bun-draft" style={{ gap: BUN_SPACE.xs, padding: BUN_SPACE.md, borderRadius: BUN_RADIUS.card, borderWidth: BUN_OUTLINE.card, borderColor: colors.ink, backgroundColor: colors.card }}>
      <View style={{ flexDirection: 'row', gap: BUN_SPACE.sm }}>
        {slipUri ? (
          <Image
            testID="tell-bun-slip"
            source={{ uri: slipUri }}
            accessibilityLabel={tc('The slip you chose')}
            resizeMode="cover"
            style={{ width: 72, height: 128, borderRadius: BUN_RADIUS.chip, borderWidth: BUN_OUTLINE.control, borderColor: colors.rule }}
          />
        ) : null}
        <View style={{ flex: 1, gap: BUN_SPACE.xs }}>
          <BunText variant="caption" tone="muted">{draft.type === 'income' ? tc('Money in') : tc('Money out')}</BunText>
          <BunText variant="title" style={{ fontVariant: ['tabular-nums'] }}>{amount}</BunText>
          {draft.merchant ? <BunText>{draft.merchant}</BunText> : null}
          <BunText tone="muted">
            {[category ? categoryName(category, tc) : null, draft.occurred_on ? fullDateLabel(draft.occurred_on, dateLocale) : null].filter(Boolean).join(' · ')}
          </BunText>
        </View>
      </View>
      {note ? <BunText variant="caption" tone="muted">{note}</BunText> : null}
      {hints.map((hint) => <BunText key={hint} variant="caption">{hint}</BunText>)}
      <PillButton label={tc('Use this')} onPress={onUse} accessibilityHint={tc('Fills in Quick add. Nothing is saved until you press Save.')} />
    </View>
  );
}
