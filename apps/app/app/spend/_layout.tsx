import { Redirect, Slot } from 'expo-router';
import { useAuthGuardSession } from '@mobile/auth/useAuthGuardSession';

export default function SpendLayout() {
  const { isAuthed, ready } = useAuthGuardSession();
  if (!ready) return null;
  return isAuthed ? <Slot /> : <Redirect href="/login" />;
}
