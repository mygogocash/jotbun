// The sync banner for drafts saved on this device. Every state is written
// out in words (never colour alone) and announced politely to assistive
// technology. Undo of an unsent draft is local; transmitted ones resolve
// through the server before anything changes here.
import { View } from 'react-native';

import { useCopy } from '@mobile/i18n/useCopy';
import { Button } from '@mobile/screens/v1/parts';
import type { DiaryView } from '@mobile/spend/v1/spendDiary';
import { Text } from '@mobile/theme/AppText';
import { useTheme } from '@mobile/theme/ThemeProvider';
import { radii, spacing } from '@mobile/theme/tokens';

type Line = { text: string; retry?: boolean };

function linesFor(view: DiaryView, tc: ReturnType<typeof useCopy>): Line[] {
  if (view.phase === 'locked') {
    if (view.lockReason === 'key_missing' || view.lockReason === 'key_rejected' || view.lockReason === 'wrong_account') return [{ text: tc("This device's diary is locked. Recover it from Jotbun or discard it.") }];
    if (view.lockReason === 'key_unavailable') return [{ text: tc("This device's diary can't be opened right now. Try again later.") }];
    return [{ text: tc('Sign in again to send the entries saved on this device') }];
  }
  if (view.phase !== 'ready') return [];
  const count = (...states: DiaryView['outbox'][number]['state'][]) => view.outbox.filter((command) => states.includes(command.state)).length;
  const waiting = count('unsent', 'sending', 'uncertain', 'paused_upgrade');
  const review = count('needs_review');
  const status = view.outcome?.status;
  const lines: Line[] = [];
  if (status === 'upgrade_required' || count('paused_upgrade') > 0) lines.push({ text: tc('Update Jotbun to send the entries saved on this device') });
  else if (status === 'resync_pending') lines.push({ text: tc('Getting your full diary from Jotbun') });
  else if ((status === 'paused' || status === 'waiting') && waiting > 0) {
    lines.push({ text: tc("Couldn't reach Jotbun. Your entries stay saved on this device."), retry: true });
    if (status === 'paused') lines.push({ text: tc('Sync is paused after repeated failures.') });
  } else if (count('uncertain', 'sending') > 0) lines.push({ text: tc('Checking {count} entries with Jotbun before sending them again', { count: count('uncertain', 'sending') }) });
  else if (status === 'rate_limited' && view.outcome && view.outcome.progress.total > 0) lines.push({ text: tc('Syncing {sent} of {total}', { sent: view.outcome.progress.sent, total: view.outcome.progress.total }) });
  else if (count('unsent') > 0) lines.push({ text: tc('Saved on device · Waiting to sync ({count})', { count: count('unsent') }) });
  if (review > 0) lines.push({ text: tc('Entries that need your review: {count}', { count: review }) });
  return lines;
}

export function SyncStatus({ view, onRetry }: { view: DiaryView; onRetry: () => void }) {
  const tc = useCopy();
  const { colors } = useTheme();
  const lines = linesFor(view, tc);
  if (lines.length === 0) return null;
  return (
    <View role="status" accessibilityLiveRegion="polite" aria-live="polite" style={{ backgroundColor: colors.panelRaised, borderRadius: radii.md, padding: spacing.md, gap: spacing.sm }}>
      {lines.map((line) => <Text key={line.text} style={{ color: colors.ink }}>{line.text}</Text>)}
      {lines.some((line) => line.retry) ? <Button kind="secondary" label={tc('Retry')} onPress={onRetry} /> : null}
    </View>
  );
}
