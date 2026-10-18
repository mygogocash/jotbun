// A slim sync strip (redesign R2a). It sits in the page's flow, never over
// content, and never blocks the screen: offline, saving and checking all leave
// the diary usable. Every state is written out in words and is a polite live
// region (announced explicitly on iOS, where VoiceOver skips live regions).
// Nothing waiting means no banner.
//
// The checking, review and upgrade lines reuse the sync copy the current
// SyncStatus already ships, so they read in Thai without new catalog entries.
import { View } from 'react-native';

import { useCopy } from '@mobile/i18n/useCopy';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { POLITE_LIVE_REGION, useAnnouncement } from './a11y';
import { BunText } from './BunText';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE } from './layout';
import { PillButton } from './PillButton';

export type SyncBannerAction = { label: string; onPress: () => void };

export type SyncBannerProps =
  /** No connection; new entries are kept on the phone. */
  | { state: 'offline' }
  /** Entries on their way to Jotbun. */
  | { state: 'saving'; count: number }
  /** Sent, but the outcome is unknown, so Jotbun is asked before resending. */
  | { state: 'checking'; count: number }
  /** Entries Jotbun refused that the person needs to look at. */
  | { state: 'needs_review'; count: number; action: SyncBannerAction }
  /** Sending waits for an app update. */
  | { state: 'paused_upgrade'; action?: SyncBannerAction }
  /** The diary on this phone is locked (signed out, or its key is unavailable). */
  | { state: 'locked'; action?: SyncBannerAction };

type Tc = ReturnType<typeof useCopy>;

function lineFor(props: SyncBannerProps, tc: Tc): string | null {
  switch (props.state) {
    case 'offline': return tc('Offline. New entries are saved on this phone.');
    case 'saving':
      if (props.count <= 0) return null;
      return props.count === 1 ? tc('Saving 1 entry…') : tc('Saving {count} entries…', { count: props.count });
    case 'checking':
      if (props.count <= 0) return null;
      return props.count === 1
        ? tc('Checking 1 entry with Jotbun before sending it again')
        : tc('Checking {count} entries with Jotbun before sending them again', { count: props.count });
    case 'needs_review':
      return props.count <= 0 ? null : tc('Entries that need your review: {count}', { count: props.count });
    case 'paused_upgrade': return tc('Update Jotbun to send the entries saved on this device');
    case 'locked': return tc('Your diary is locked on this phone. Entries saved here are kept.');
  }
}

export function SyncBanner(props: SyncBannerProps) {
  const tc = useCopy();
  const colors = useBunColors();
  const line = lineFor(props, tc);
  useAnnouncement(line);
  if (!line) return null;
  const action = 'action' in props ? props.action : undefined;
  return (
    <View
      {...POLITE_LIVE_REGION}
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: BUN_SPACE.xs,
        paddingHorizontal: BUN_SPACE.sm,
        paddingVertical: BUN_SPACE.xs,
        borderRadius: BUN_RADIUS.chip,
        borderWidth: BUN_OUTLINE.control,
        borderColor: colors.ink,
        backgroundColor: colors.card,
      }}
    >
      <BunText variant="caption" style={{ flexGrow: 1, flexShrink: 1, flexBasis: 160 }}>{line}</BunText>
      {action ? <PillButton kind="secondary" label={action.label} onPress={action.onPress} /> : null}
    </View>
  );
}
