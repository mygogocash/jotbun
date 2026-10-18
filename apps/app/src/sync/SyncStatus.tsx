// The sync banner for drafts saved on this device. Every state is written
// out in words (never colour alone) and announced politely to assistive
// technology (explicitly on iOS, where VoiceOver ignores live regions). A
// diary whose key is gone can start over from the synced diary, only after
// the user confirms; an unavailable key store is never a reason to discard.
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useCopy } from '@mobile/i18n/useCopy';
import { Button } from '@mobile/screens/v1/parts';
import type { DiaryView } from '@mobile/spend/v1/spendDiary';
import { Text } from '@mobile/theme/AppText';
import { useTheme } from '@mobile/theme/ThemeProvider';
import { radii, spacing } from '@mobile/theme/tokens';
import { announceStatus } from './announce';

type Line = { text: string; retry?: boolean; startOver?: boolean };

function linesFor(view: DiaryView, tc: ReturnType<typeof useCopy>): Line[] {
  if (view.phase === 'locked') {
    if (view.lockReason === 'key_missing' || view.lockReason === 'key_rejected' || view.lockReason === 'wrong_account') {
      return [{ text: tc("This device's diary can't be unlocked. Entries that weren't synced can't be read."), startOver: true }];
    }
    if (view.lockReason === 'key_unavailable') return [{ text: tc("This device's diary can't be opened right now. Try again later.") }];
    if (view.lockReason === 'schema_too_new') return [{ text: tc('Update Jotbun to open the entries saved on this device') }];
    return [{ text: tc('Sign in again to send the entries saved on this device') }];
  }
  if (view.phase !== 'ready') return [];
  const count = (...states: DiaryView['outbox'][number]['state'][]) => view.outbox.filter((command) => states.includes(command.state)).length;
  const waiting = count('unsent', 'sending', 'uncertain', 'paused_upgrade');
  const checking = count('uncertain', 'sending');
  const review = count('needs_review');
  const status = view.outcome?.status;
  const lines: Line[] = [];
  if (status === 'upgrade_required' || count('paused_upgrade') > 0) lines.push({ text: tc('Update Jotbun to send the entries saved on this device') });
  else if (status === 'policy_required' && waiting > 0) lines.push({ text: tc('Review and accept the updated terms to send the entries saved on this device') });
  else if (status === 'resync_pending') lines.push({ text: tc('Getting your full diary from Jotbun') });
  else if (view.progress && view.progress.total > 1) lines.push({ text: tc('Syncing {sent} of {total}', { sent: view.progress.sent, total: view.progress.total }) });
  else if ((status === 'paused' || status === 'waiting') && waiting > 0) {
    lines.push({ text: tc("Couldn't reach Jotbun. Your entries stay saved on this device."), retry: true });
    if (status === 'paused') lines.push({ text: tc('Sync is paused after repeated failures.') });
  } else if (checking === 1) lines.push({ text: tc('Checking 1 entry with Jotbun before sending it again') });
  else if (checking > 1) lines.push({ text: tc('Checking {count} entries with Jotbun before sending them again', { count: checking }) });
  else if (status === 'rate_limited' && view.outcome && view.outcome.progress.total > 0) lines.push({ text: tc('Syncing {sent} of {total}', { sent: view.outcome.progress.sent, total: view.outcome.progress.total }) });
  else if (count('unsent') > 0) lines.push({ text: tc('Saved on device · Waiting to sync ({count})', { count: count('unsent') }) });
  if (review > 0) lines.push({ text: tc('Entries that need your review: {count}', { count: review }) });
  return lines;
}

export function SyncStatus({ view, onRetry, onDiscard }: { view: DiaryView; onRetry: () => void; onDiscard?: () => void }) {
  const tc = useCopy();
  const { colors } = useTheme();
  const [confirming, setConfirming] = useState(false);
  const lines = linesFor(view, tc);
  const spoken = lines.map((line) => line.text).join(' ');
  useEffect(() => {
    if (spoken) announceStatus(spoken);
  }, [spoken]);
  if (lines.length === 0) return null;
  const startOver = onDiscard && lines.some((line) => line.startOver);
  return (
    <View role="status" accessibilityLiveRegion="polite" aria-live="polite" style={{ backgroundColor: colors.panelRaised, borderRadius: radii.md, padding: spacing.md, gap: spacing.sm }}>
      {lines.map((line) => <Text key={line.text} style={{ color: colors.ink }}>{line.text}</Text>)}
      {lines.some((line) => line.retry) ? <Button kind="secondary" label={tc('Retry')} onPress={onRetry} /> : null}
      {startOver && !confirming ? <Button kind="secondary" label={tc('Start over')} onPress={() => setConfirming(true)} /> : null}
      {startOver && confirming ? (
        <>
          <Text style={{ color: colors.ink }}>{tc('Starting over deletes the unreadable entries on this device. Everything already synced comes back from Jotbun.')}</Text>
          <Button label={tc('Delete and start over')} onPress={() => { setConfirming(false); onDiscard(); }} />
          <Button kind="secondary" label={tc('Keep it')} onPress={() => setConfirming(false)} />
        </>
      ) : null}
    </View>
  );
}
