import { Redirect, Slot } from 'expo-router';
import { useAuthGuardSession } from '@mobile/auth/useAuthGuardSession';
import { isLegacySpendEnabled, isRedesignEnabled } from '@mobile/config/featureFlags';
import { SpendTabShell } from '@mobile/screens/redesign/SpendTabShell';
import { DeviceDiaryProvider } from '@mobile/spend/v1/DeviceDiaryProvider';

export default function SpendLayout() {
  const { isAuthed, ready } = useAuthGuardSession();
  if (!ready) return null;
  if (!isAuthed) return <Redirect href="/login" />;
  if (isLegacySpendEnabled()) return <Slot />;
  const screens = <DeviceDiaryProvider><Slot /></DeviceDiaryProvider>;
  // The redesign (R3) draws its tab bar under the screens; with the flag off this is the layout as it was.
  return isRedesignEnabled('core') ? <SpendTabShell>{screens}</SpendTabShell> : screens;
}
