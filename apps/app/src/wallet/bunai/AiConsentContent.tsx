// Bun's AI consent as drawn (P3-T14, ai-consent; D15, B8): the body of the
// consent tray, and of any step that asks for consent inside another tray.
// Bun's face and the question, what Bun does, then three plain promises on a
// raised card: what is sent (B8: every kind of thing a prompt carries, wallet
// and merchant names, notes and a slip's printed names and digits included),
// who reads it (Claude by Anthropic, through Jotbun's server) and what is kept
// (nothing, but a receipt the person attaches). Then that Bun can be wrong,
// what Bun never does, and a link to Privacy and data. The main button turns
// Bun's help on; ไม่ใช่ตอนนี้ changes nothing. Read-only (สิ่งที่ AI เห็น)
// shows the same lines without the two answers.
//
// - The host does the work: onAgree turns AI on, and the host says a failure
//   through `problem`. While `busy`, the main button says so and ignores
//   presses, and ไม่ใช่ตอนนี้ and อ่านรายละเอียด do nothing either.
// - onDetails is the host's too: a host that is a tray closes first and opens
//   Privacy and data once it has gone (R69), so the tray never stays over it.
// - No colour literals (Bun's own face keeps its colours, BunFace.tsx). Every
//   control is 44 pt or more, and every line wraps at every text size.
import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { DECORATIVE } from '@mobile/ui/a11y';
import { BunFace } from '../looks/BunFace';
import { PrimaryButton } from '../tray/PrimaryButton';
import { TextLink } from '../tray/TextLink';
import { WalletText } from '../WalletText';
import { BUNAI_DRAFTS } from './drafts';
import { useBunAiCopy } from './useBunAiCopy';

export type AiConsentContentProps = {
  onAgree(): void;
  onNotNow(): void;
  /** Opens Privacy and data (`bunai.consentDetails`). */
  onDetails(): void;
  /** Turning on is waiting for the server. */
  busy: boolean;
  /** Why turning on did not work, or null. */
  problem: string | null;
  /** The same lines without the two answers. */
  readOnly?: boolean;
};

/** Bun's face with the AI sparkle (ai-consent). */
function BunWithSparkle() {
  const colors = useWalletColors();
  return (
    <View {...DECORATIVE} style={{ width: 62, height: 56 }}>
      <View style={{ position: 'absolute', left: 0, bottom: 0 }}>
        <BunFace face="smile" size={58} />
      </View>
      <View style={{ position: 'absolute', right: 0, top: 0 }}>
        <Svg width={20} height={20} viewBox="0 0 24 24">
          <Path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z" fill={colors.violet} />
        </Svg>
      </View>
    </View>
  );
}

type PromiseIcon = 'what' | 'who' | 'keep';

/** The promise's icon, in a 36 pt circle on the card colour. */
function Icon({ name }: { name: PromiseIcon }) {
  const colors = useWalletColors();
  const stroke = { fill: 'none', stroke: colors.ink, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <View {...DECORATIVE} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={18} height={18} viewBox="0 0 24 24">
        {name === 'what' ? <Path d="M7 3h7l4 4v14H7Z M14 3v4h4 M10 12h5 M10 16h5" {...stroke} /> : null}
        {name === 'who' ? (
          <>
            <Rect x={4} y={4} width={16} height={7} rx={2} {...stroke} />
            <Rect x={4} y={13} width={16} height={7} rx={2} {...stroke} />
            <Path d="M8 7.5h.01M8 16.5h.01" {...stroke} strokeWidth={2.6} />
          </>
        ) : null}
        {name === 'keep' ? (
          <>
            <Circle cx={12} cy={12} r={8} {...stroke} />
            <Path d="M12 8v4l3 2" {...stroke} />
          </>
        ) : null}
      </Svg>
    </View>
  );
}

/** One promise: its icon, its label, and its line. */
function PromiseRow({ icon, label, line, last = false, testID }: { icon: PromiseIcon; label: string; line: string; last?: boolean; testID: string }) {
  const colors = useWalletColors();
  return (
    <View testID={testID} style={{ flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.hairline }}>
      <Icon name={icon} />
      <View style={{ flex: 1, gap: 2 }}>
        <WalletText role="caption" tone="quiet">{label}</WalletText>
        <WalletText>{line}</WalletText>
      </View>
    </View>
  );
}

/** A check in a violet circle, beside the line that says Bun can be wrong. */
function CheckArt() {
  const colors = useWalletColors();
  return (
    <View {...DECORATIVE} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.violet, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={14} height={14} viewBox="0 0 24 24">
        <Path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke={colors.isDark ? colors.ground : colors.card} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

export function AiConsentContent({ onAgree, onNotNow, onDetails, busy, problem, readOnly = false }: AiConsentContentProps) {
  const colors = useWalletColors();
  const t = useBunAiCopy(BUNAI_DRAFTS);
  return (
    <View testID="ai-consent" style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <BunWithSparkle />
        <WalletText role="h2" accessibilityRole="header" style={{ flex: 1 }}>{t('bunai.consentQuestion')}</WalletText>
      </View>
      <WalletText tone="quiet">{t('bunai.consentLine')}</WalletText>
      <View style={{ borderRadius: 20, paddingHorizontal: 14, paddingVertical: 2, backgroundColor: colors.raised }}>
        <PromiseRow testID="ai-consent-what" icon="what" label={t('bunai.consentWhat')} line={t('bunai.consentWhatLine')} />
        <PromiseRow testID="ai-consent-who" icon="who" label={t('bunai.consentWho')} line={t('bunai.consentWhoLine')} />
        <PromiseRow testID="ai-consent-keep" icon="keep" label={t('bunai.consentKeep')} line={t('bunai.consentKeepLine')} last />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.raised }}>
        <CheckArt />
        <WalletText testID="ai-consent-wrong" style={{ flex: 1 }}>
          {t('bunai.consentWrong')} <WalletText style={{ fontWeight: '700' }}>{t('bunai.consentWrongLine')}</WalletText>
        </WalletText>
      </View>
      <View style={{ gap: 2, alignItems: 'flex-start' }}>
        <WalletText role="caption" tone="quiet">{t('bunai.consentFoot')}</WalletText>
        <TextLink
          label={t('bunai.consentDetails')}
          onPress={() => {
            if (!busy) onDetails();
          }}
        />
      </View>
      {readOnly ? null : (
        <View style={{ gap: 4 }}>
          {problem ? <WalletText testID="ai-consent-problem" role="label" accessibilityRole="alert">{problem}</WalletText> : null}
          <PrimaryButton testID="ai-consent-on" label={t('bunai.consentOn')} busy={busy} onPress={onAgree} />
          <TextLink
            label={t('bunai.consentNotNow')}
            tone="ink"
            onPress={() => {
              if (!busy) onNotNow();
            }}
          />
        </View>
      )}
    </View>
  );
}
