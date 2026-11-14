// The app's dynamic config (1C-T7, M18). Expo reads app.json first and passes
// it here as `config`; app.json itself does not change. This adds native
// sign-in on top of it, after app.json's own plugins, whatever app.json lists:
// - Apple (iOS only, K15): the Sign in with Apple capability and
//   expo-apple-authentication's config plugin.
// - Google: its config plugin, which adds the iOS URL scheme (the iOS client
//   id reversed), only once EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME is set. Until a
//   development build proves the package and the owner sets Google's ids, a
//   build carries none of Google's native settings (Q1).
function withNativeSignIn(config) {
  const iosUrlScheme = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME?.trim();
  const google = iosUrlScheme ? [['@react-native-google-signin/google-signin', { iosUrlScheme }]] : [];
  return {
    ...config,
    ios: { ...config.ios, usesAppleSignIn: true },
    plugins: [...config.plugins, 'expo-apple-authentication', ...google],
  };
}

module.exports = ({ config }) => withNativeSignIn(config);
