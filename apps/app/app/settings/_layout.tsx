import { Redirect, Slot } from 'expo-router';

import { useAuthGuardSession } from '@mobile/auth/useAuthGuardSession';
import { DeviceDiaryProvider } from '@mobile/spend/v1/DeviceDiaryProvider';

/** R6 Settings: signed-in only, with the device diary (sign-out erases it). */
export default function SettingsLayout() {
  const { isAuthed, ready } = useAuthGuardSession();
  if (!ready) return null;
  if (!isAuthed) return <Redirect href="/login" />;
  return <DeviceDiaryProvider><Slot /></DeviceDiaryProvider>;
}
