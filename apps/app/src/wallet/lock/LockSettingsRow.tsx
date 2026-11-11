// Settings' lock row (P2-T33, W26): in today's Settings parts, one card after
// Haptics, headed ล็อกด้วย {method} with the phone's method, and a link row that
// says เปิด or ปิด and opens the lock's setup at /settings/lock. It renders
// nothing unless the `wallet` area is on.
import { useRouter } from 'expo-router';

import { isRedesignEnabled } from '@mobile/config/featureFlags';
import { LinkRow, Section } from '@mobile/screens/redesign/account/SettingsParts';
import { useDraftCopy } from '../copy/useDraftCopy';
import { COPY } from './copy';
import { useLockSetting } from './LockGate';
import { METHOD_KEYS, namedMethod } from './lockModel';

export function LockSettingsRow() {
  const router = useRouter();
  const t = useDraftCopy(COPY);
  const lock = useLockSetting();
  if (!isRedesignEnabled('wallet')) return null;
  const method = t(METHOD_KEYS[namedMethod(lock.availability)].name);
  return (
    <Section title={t('lock.row', { method })} testID="settings-lock">
      <LinkRow first label={t(lock.enabled ? 'lock.on' : 'lock.off')} onPress={() => router.push('/settings/lock')} />
    </Section>
  );
}
