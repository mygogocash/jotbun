import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { ProfileSubPageFrame } from '@mobile/components/ProfileSubPageFrame';
import { Text } from '@mobile/theme/AppText';
import { useTheme } from '@mobile/theme/ThemeProvider';
import { useCopy } from '@mobile/i18n/useCopy';

export default function Login() {
  const { colors } = useTheme();
  const tc = useCopy();
  const router = useRouter();
  return <ProfileSubPageFrame title={tc('Jotbun')}>
    <Text accessibilityRole="header" style={{ color: colors.ink, fontSize: 28, fontWeight: '700' }}>{tc('Your diary stays private')}</Text>
    <Text style={{ color: colors.muted, lineHeight: 24 }}>{tc('Sign-in is not configured for this local installation. A verified account session is required to view or change spending records.')}</Text>
    <Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={{ minHeight: 48, padding: 16, borderRadius: 16, backgroundColor: colors.primary }}><Text style={{ color: colors.white }}>{tc('Back to Jotbun')}</Text></Pressable>
  </ProfileSubPageFrame>;
}
