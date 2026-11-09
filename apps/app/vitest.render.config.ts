import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: {
    'react-native': 'react-native-web',
    'react-native-svg': fileURLToPath(new URL('../../node_modules/react-native-svg/lib/module/ReactNativeSVG.web.js', import.meta.url)),
    // react-native-svg's web build reads this registry, which only Metro provides.
    // Test runs only: see src/testing/svgAssetRegistryStub.ts.
    '@react-native/assets-registry/registry': fileURLToPath(new URL('./src/testing/svgAssetRegistryStub.ts', import.meta.url)),
    '@mobile': fileURLToPath(new URL('./src', import.meta.url)),
  }, extensions: ['.web.js', '.js', '.web.ts', '.ts', '.tsx', '.json'] },
  oxc: { jsx: { runtime: 'automatic' } },
  // A development build, as Metro's: Gesture Handler reads React Native's
  // __DEV__ when it loads (P2-T2). Vitest sets it on globalThis.
  define: { __DEV__: 'true' },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.render.test.tsx'],
    maxWorkers: 2,
    // Waits sized for a busy machine: see src/testing/renderSetup.ts.
    setupFiles: ['./src/testing/renderSetup.ts'],
    // Vite, not Node, loads these. Reanimated, Worklets and Gesture Handler
    // (P2-T2) ship ES modules whose imports name no file extension.
    server: { deps: { inline: ['react-native-svg', 'react-native-reanimated', 'react-native-worklets', 'react-native-gesture-handler'] } },
  },
});
