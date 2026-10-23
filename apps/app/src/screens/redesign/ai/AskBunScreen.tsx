// Ask Bun (premium plan A3): questions about the person's own spending,
// answered from their records. Claude reads totals through read-only server
// tools; every amount in an answer is one a tool read, or the plain figures
// are shown instead. Each answer lists the figures it used, so nothing is
// taken on trust. No advice about financial products, ever.
import type { AiAskResult, AiLocale } from '@gogospend/contracts';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';

import { V1Error } from '@mobile/api/client';
import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import { playHaptic } from '@mobile/lib/hapticMoment';
import { Bun } from '@mobile/mascot/Bun';
import { useAiCompanion } from '@mobile/spend/v1/ai/AiCompanionProvider';
import { formatMinor } from '@mobile/spend/v1/money';
import { todayInBangkok } from '@mobile/spend/v1/viewModels';
import { TextInput } from '@mobile/theme/AppText';
import { BUN_MAX_FONT_SCALE, bunText } from '@mobile/theme/bunType';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { BunText, useBunScript } from '@mobile/ui/BunText';
import { EmptyState } from '@mobile/ui/EmptyState';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE, BUN_TOUCH } from '@mobile/ui/layout';
import { PillButton } from '@mobile/ui/PillButton';
import { StageHeader } from '@mobile/ui/StageHeader';

import { useGoBack } from '../HistoryParts';
import { AiConsentSheet } from './AiConsentSheet';

type Turn = { id: number; question: string; answer: AiAskResult | null; problem: string | null };

/** Suggested questions: the things people ask a spending diary most. */
const SUGGESTIONS = [
  'How much did I spend on food this month?',
  'Where did I spend the most this month?',
  'How much of my budget is left?',
  'How much did I spend last week?',
];

export function AskBunScreen({ now }: { now?: Date }) {
  const tc = useCopy();
  const colors = useBunColors();
  const script = useBunScript();
  const locale = useActiveLocale() as AiLocale;
  const goBack = useGoBack('/spend/insights');
  const router = useRouter();
  const { resources, enabled, preferences, refresh } = useAiCompanion();
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [asking, setAsking] = useState(false);
  const [consenting, setConsenting] = useState(false);
  const next = useRef(1);
  const moneyLocale = locale === 'th' ? 'th' : 'en';

  async function ask(text: string) {
    const asked = text.trim();
    if (!asked || asking || !resources) return;
    const id = next.current++;
    setTurns((all) => [...all, { id, question: asked, answer: null, problem: null }]);
    setQuestion('');
    setAsking(true);
    try {
      const answer = await resources.ask({ question: asked, today: todayInBangkok(now ?? new Date()), locale });
      playHaptic('aiSuggestionReady');
      setTurns((all) => all.map((turn) => (turn.id === id ? { ...turn, answer } : turn)));
    } catch (error) {
      playHaptic('saveFailed');
      const code = error instanceof V1Error ? error.code : '';
      const problem = code === 'AI_LIMIT_REACHED'
        ? tc("You've asked all of today's questions. Bun can answer more tomorrow.")
        : code === 'AI_CONSENT_REQUIRED'
          ? tc("Bun's help is off. Turn it on to ask questions.")
          : tc("Bun can't answer right now. Try again in a little while.");
      if (code === 'AI_CONSENT_REQUIRED') refresh();
      setTurns((all) => all.map((turn) => (turn.id === id ? { ...turn, problem } : turn)));
    } finally {
      setAsking(false);
      refresh();
    }
  }

  const left = preferences?.remaining.ask;
  // After an answer, two of the suggestions not asked yet, so the next question is one tap away.
  const lastTurn = turns[turns.length - 1];
  const asked = new Set(turns.map((turn) => turn.question));
  const followUps = !asking && lastTurn?.answer && left !== 0 ? SUGGESTIONS.map((suggestion) => tc(suggestion)).filter((text) => !asked.has(text)).slice(0, 2) : [];

  return (
    <KeyboardAvoidingView testID="ask-bun-screen" style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: BUN_SPACE.lg, gap: BUN_SPACE.md }} keyboardShouldPersistTaps="handled">
        <StageHeader title={tc('Ask Bun')} subtitle={tc('About your own spending')} back={{ onPress: goBack }} />
        <View style={{ paddingHorizontal: BUN_SPACE.md, gap: BUN_SPACE.md }}>
          {!enabled ? (
            <EmptyState
              art={<Bun pose="thinking" size="l" />}
              title={tc('Ask about your spending')}
              body={tc("With Bun's help on, ask things like “How much did I spend on food this month?” Bun answers from your own diary.")}
              action={{ label: tc("Turn on Bun's help"), onPress: () => setConsenting(true) }}
            />
          ) : (
            <>
              {turns.length === 0 ? <Suggestions heading={tc('Try one of these:')} questions={SUGGESTIONS.map((suggestion) => tc(suggestion))} onAsk={(text) => void ask(text)} /> : null}
              {turns.map((turn) => <TurnView key={turn.id} turn={turn} moneyLocale={moneyLocale} />)}
              {followUps.length > 0 ? <Suggestions heading={tc('Ask another:')} questions={followUps} onAsk={(text) => void ask(text)} /> : null}
              {asking ? (
                <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: BUN_SPACE.sm }}>
                  <Bun pose="magnifier" size="s" />
                  <ActivityIndicator color={colors.ink} />
                  <BunText tone="muted">{tc('Bun is looking through your diary…')}</BunText>
                </View>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>
      {enabled ? (
        <View style={{ padding: BUN_SPACE.md, gap: BUN_SPACE.xs, borderTopWidth: BUN_OUTLINE.rule, borderTopColor: colors.rule, backgroundColor: colors.background }}>
          {left !== undefined ? <BunText variant="caption" tone="muted">{left === 1 ? tc('1 question left today') : tc('{count} questions left today', { count: left })}</BunText> : null}
          <View style={{ flexDirection: 'row', gap: BUN_SPACE.xs, alignItems: 'center' }}>
            <TextInput
              maxFontSizeMultiplier={BUN_MAX_FONT_SCALE.body}
              accessibilityLabel={tc('Your question')}
              value={question}
              onChangeText={setQuestion}
              onSubmitEditing={() => void ask(question)}
              placeholder={tc('Ask about your spending')}
              placeholderTextColor={colors.muted}
              returnKeyType="send"
              maxLength={300}
              editable={!asking}
              style={{ ...bunText('body', script), flex: 1, color: colors.ink, minHeight: BUN_TOUCH, paddingHorizontal: BUN_SPACE.sm, borderRadius: BUN_RADIUS.pill, borderWidth: BUN_OUTLINE.control, borderColor: colors.ink, backgroundColor: colors.card }}
            />
            <PillButton label={tc('Ask')} onPress={() => void ask(question)} disabled={asking || question.trim().length === 0 || left === 0} />
          </View>
          <BunText variant="caption" tone="muted">{tc('Bun can get things wrong. Each answer shows the figures from your diary that it used.')}</BunText>
          <Pressable accessibilityRole="link" onPress={() => router.push('/settings')} style={{ minHeight: BUN_TOUCH, justifyContent: 'center', alignSelf: 'flex-start' }}>
            <BunText variant="caption" style={{ textDecorationLine: 'underline' }}>{tc("Bun's AI help settings")}</BunText>
          </Pressable>
        </View>
      ) : null}
      <AiConsentSheet visible={consenting} onClose={() => setConsenting(false)} />
    </KeyboardAvoidingView>
  );
}

/** Questions one tap away: before the first question, and after each answer. */
function Suggestions({ heading, questions, onAsk }: { heading: string; questions: readonly string[]; onAsk: (text: string) => void }) {
  const colors = useBunColors();
  return (
    <View style={{ gap: BUN_SPACE.xs }}>
      <BunText tone="muted">{heading}</BunText>
      {questions.map((text) => (
        <Pressable
          key={text}
          accessibilityRole="button"
          accessibilityLabel={text}
          onPress={() => onAsk(text)}
          style={({ pressed }) => ({ minHeight: BUN_TOUCH, justifyContent: 'center', paddingHorizontal: BUN_SPACE.sm, borderRadius: BUN_RADIUS.chip, borderWidth: BUN_OUTLINE.control, borderColor: colors.ink, backgroundColor: pressed ? colors.background : colors.card })}
        >
          <BunText>{text}</BunText>
        </Pressable>
      ))}
    </View>
  );
}

function TurnView({ turn, moneyLocale }: { turn: Turn; moneyLocale: 'th' | 'en' }) {
  const tc = useCopy();
  const colors = useBunColors();
  return (
    <View style={{ gap: BUN_SPACE.xs }}>
      <View style={{ alignSelf: 'flex-end', maxWidth: '85%', padding: BUN_SPACE.sm, borderRadius: BUN_RADIUS.card, backgroundColor: colors.ink }}>
        <BunText tone="onInk">{turn.question}</BunText>
      </View>
      {turn.answer ? (
        <View testID="ask-bun-answer" style={{ maxWidth: '92%', padding: BUN_SPACE.sm, gap: BUN_SPACE.xs, borderRadius: BUN_RADIUS.card, borderWidth: BUN_OUTLINE.card, borderColor: colors.ink, backgroundColor: colors.card }}>
          <BunText>{turn.answer.answer}</BunText>
          {turn.answer.figures.length > 0 ? (
            <View style={{ gap: BUN_SPACE.xxs }}>
              <BunText variant="caption" tone="muted">{tc('From your diary')}</BunText>
              {turn.answer.figures.slice(0, 6).map((figure) => (
                <View key={`${figure.label}-${figure.amount_minor}`} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: BUN_SPACE.sm }}>
                  <BunText variant="caption" style={{ flexShrink: 1 }}>{figure.label}</BunText>
                  <BunText variant="caption" style={{ fontVariant: ['tabular-nums'] }}>{formatMinor(figure.amount_minor, moneyLocale)}</BunText>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
      {turn.problem ? <BunText role="alert">{turn.problem}</BunText> : null}
    </View>
  );
}
