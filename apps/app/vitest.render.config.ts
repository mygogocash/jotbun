import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: {
    'react-native': 'react-native-web',
    'react-native-svg': fileURLToPath(new URL('../../node_modules/react-native-svg/lib/module/ReactNativeSVG.web.js', import.meta.url)),
    '@mobile': fileURLToPath(new URL('./src', import.meta.url)),
  }, extensions: ['.web.js', '.js', '.web.ts', '.ts', '.tsx', '.json'] },
  oxc: { jsx: { runtime: 'automatic' } },
  test: { environment: 'happy-dom', include: ['src/**/*.render.test.tsx'], maxWorkers: 2, server: { deps: { inline: ['react-native-svg'] } } },
});
