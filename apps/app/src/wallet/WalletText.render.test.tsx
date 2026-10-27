import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';

// The real safe-area package loads React Native itself, which vitest cannot run.
vi.mock('react-native-safe-area-context', () => import('../dev/catalogue/safeAreaTestStub'));

import { mountInApp, rgba } from '@mobile/dev/catalogue/catalogueTestHarness';
import { installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import { ThemePreferenceOverride } from '@mobile/theme/ThemeProvider';
import { THAI_UI_FONT_FAMILY } from '@mobile/theme/uiFontFamily';
import { WalletText } from './WalletText';

beforeAll(() => { installBrowserStorage(); });
afterEach(() => cleanup());

test('WalletText is Anuphan in Thai and in English, in the wallet ink of each mode', () => {
  const ink = { light: '#111014', dark: '#F4F2FA' } as const;
  for (const locale of ['th', 'en'] as const) {
    for (const mode of ['light', 'dark'] as const) {
      mountInApp(
        <ThemePreferenceOverride preference={mode}>
          <WalletText>Aa</WalletText>
        </ThemePreferenceOverride>,
        locale,
      );
      const node = screen.getByText('Aa');
      expect(node.style.fontFamily).toBe(THAI_UI_FONT_FAMILY);
      expect(node.style.color).toBe(rgba(ink[mode]));
      cleanup();
    }
  }
});
