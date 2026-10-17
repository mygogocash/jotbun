import { Redirect, Slot } from 'expo-router';
import { useAuthGuardSession } from '@mobile/auth/useAuthGuardSession';
import { isLegacySpendEnabled } from '@mobile/config/featureFlags';
import { DeviceDiaryProvider } from '@mobile/spend/v1/DeviceDiaryProvider';

export default function SpendLayout() {
  const { isAuthed, ready } = useAuthGuardSession();
  if (!ready) return null;
  if (!isAuthed) return <Redirect href="/login" />;
  return isLegacySpendEnabled() ? <Slot /> : <DeviceDiaryProvider><Slot /></DeviceDiaryProvider>;
}
