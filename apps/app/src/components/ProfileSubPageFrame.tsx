import { useState, type ComponentRef, type ReactNode, type RefObject } from 'react';
import { useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@mobile/theme/AppText';
import { useTheme } from '@mobile/theme/ThemeProvider';
import { useCopy } from '@mobile/i18n/useCopy';

export function ProfileSubPageFrame({ children, title, onBackPress, onRefresh, scrollRef, stickyHeader, overlay, contentStyle, keyboardAware = false }: {
  children: ReactNode; title: string; onBackPress?: () => void; onRefresh?: () => Promise<void> | void;
  scrollRef?: RefObject<ComponentRef<typeof ScrollView> | null>; stickyHeader?: ReactNode; overlay?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>; keyboardAware?: boolean;
}) {
  const { colors, preference, setPreference } = useTheme();
  const tc = useCopy();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const page = (
    <View style={[styles.page, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <Pressable accessibilityRole="button" accessibilityLabel={tc('Back')} onPress={onBackPress ?? (() => router.canGoBack() ? router.back() : router.replace('/'))} style={styles.back}>
          <Text style={{ color: colors.ink }}>← {title}</Text>
        </Pressable>
        <View accessibilityLabel={tc('Appearance')} style={styles.themes}>
          {(['system', 'light', 'dark'] as const).map(value => <Pressable key={value} accessibilityRole="button" accessibilityLabel={tc(value === 'system' ? 'System' : value === 'light' ? 'Light' : 'Dark')} accessibilityState={{ selected: preference === value }} onPress={() => setPreference(value)} style={[styles.themeButton, { borderColor: preference === value ? colors.accent : colors.border }]}><Text style={{ color: colors.ink }}>{tc(value === 'system' ? 'System' : value === 'light' ? 'Light' : 'Dark')}</Text></Pressable>)}
        </View>
      </View>
      <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.scrollContent} stickyHeaderIndices={stickyHeader ? [0] : undefined} refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); try { await onRefresh(); } finally { setRefreshing(false); } }} /> : undefined} keyboardShouldPersistTaps="handled">
        {stickyHeader ? <View style={[styles.sticky, { backgroundColor: colors.card }]}>{stickyHeader}</View> : null}
        <View style={[styles.content, { backgroundColor: colors.card }, contentStyle]}>{children}</View>
      </ScrollView>
      {overlay}
    </View>
  );
  return keyboardAware ? <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>{page}</KeyboardAvoidingView> : page;
}
const styles = StyleSheet.create({
  page: { flex: 1, minHeight: '100%' },
  bar: { width: '100%', maxWidth: 960, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, gap: 8, flexWrap: 'wrap' },
  back: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  themes: { flexDirection: 'row', gap: 4 },
  themeButton: { minHeight: 44, justifyContent: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 10 },
  scroll: { flex: 1 }, scrollContent: { flexGrow: 1, width: '100%', maxWidth: 960, alignSelf: 'center', paddingBottom: 24 },
  sticky: { padding: 16, zIndex: 1 },
  content: { flexGrow: 1, borderRadius: 28, padding: 16, paddingBottom: 56, gap: 24 },
});
