// The Bun Wallet's render-test harness (P2-T8). Test use only: nothing in the
// app imports it. `mountWallet` mounts an element inside the app's providers,
// nested as the app nests them (R58): the language, the theme in the mode
// asked for, the bun's intensity, a phone's safe area, the wallet root
// (Gesture Handler's root view and the one reduced-motion answer), then the v1
// resources, the device diary and Bun's AI help, each a fake unless the test
// passes its own. It also keeps the wallet's two stores in memory, sets the
// text size and gives the phone's reduced-motion answer, or holds it.
//
// Test files mock react-native-safe-area-context with
// src/dev/catalogue/safeAreaTestStub (the real package cannot load in
// vitest), call cleanup() and vi.restoreAllMocks() after each case, and drive
// failures with the fake resources' fail, loseResponse and hold. The phone's
// answer and Bun's AI preferences arrive after the first render, so settle
// them inside act before asserting. A part that decides at mount, and must
// see the answer, mounts after it through `rerender`, which keeps the
// providers and what they hold. It installs no analytics: a test that counts
// events awaits recordAnalytics() before mounting, so the companion's
// `ai_enabled` property is set at mount (1D-T6).
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { IntlProvider } from 'react-intl';
import { AccessibilityInfo, Dimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { vi } from 'vitest';

import { PHONE } from '@mobile/dev/catalogue/catalogueTestHarness';
import { LanguageProvider } from '@mobile/i18n/LanguageProvider';
import { BunIntensityProvider } from '@mobile/mascot/BunIntensityProvider';
import { AiCompanionProvider } from '@mobile/spend/v1/ai/AiCompanionProvider';
import type { AiResources } from '@mobile/spend/v1/ai/aiResources';
import { fakeAiResources } from '@mobile/spend/v1/ai/testing/fakeAiResources';
import type { SpendV1Resources } from '@mobile/spend/v1/resources';
import { SpendDiaryProvider } from '@mobile/spend/v1/SpendDiaryContext';
import type { SpendDiary } from '@mobile/spend/v1/spendDiary';
import { SpendV1Provider } from '@mobile/spend/v1/SpendV1Context';
import { createFakeDiary } from '@mobile/spend/v1/testing/fakeDiary';
import { createFakeResources } from '@mobile/spend/v1/testing/fakeResources';
import { ThemePreferenceOverride, ThemeProvider } from '@mobile/theme/ThemeProvider';
import { WalletRoot } from '../WalletRoot';
import { installStoreBackend } from '../store/deviceWalletStore';
import { ACCOUNT_PREFIX, DEVICE_PREFIX, type StoreBackend } from '../store/walletStore';

/** iOS's largest accessibility text size (AX5), as a font scale (W30). */
export const AX5 = 3.571;

/** The fake diary's account, which the `account` seeds belong to. */
export const TEST_ACCOUNT_ID = '00000000-0000-4000-8000-0000000000aa';

export type MountWalletOptions = {
  /** Default: `createFakeResources().resources`. */
  resources?: SpendV1Resources;
  /** Default: `createFakeDiary().diary`, open for TEST_ACCOUNT_ID. `null` mounts no diary (the web). */
  diary?: SpendDiary | null;
  /** Default: `fakeAiResources().resources`, with the companion off. */
  ai?: AiResources;
  /** Defaults: `th`, `light` and 1. */
  locale?: 'th' | 'en';
  mode?: 'light' | 'dark';
  fontScale?: number;
  /** Default: false. `'pending'` holds the phone's answer until `answerReducedMotion`. */
  reducedMotion?: boolean | 'pending';
  /** Seeds `jotbun.wallet.<name>`. */
  device?: Readonly<Record<string, string>>;
  /** Seeds `jotbun.account.<TEST_ACCOUNT_ID>.<name>`. */
  account?: Readonly<Record<string, string>>;
};

export type MountedWallet = RenderResult & {
  /** Everything in the wallet's two stores, by full key; writes show at once. */
  stored: Map<string, string>;
  /** Gives a `reducedMotion: 'pending'` mount its held answer, once (inside act); any other call throws. */
  answerReducedMotion(value: boolean): void;
};

// react-native-web's own Dimensions.get, taken before any test spies on it.
const realDimensionsGet = Dimensions.get.bind(Dimensions);

/** The wallet's stores in memory, keyed as AsyncStorage keys them. */
function memoryBackend(stored: Map<string, string>): StoreBackend {
  return {
    getItem: async (key) => stored.get(key) ?? null,
    setItem: async (key, value) => { stored.set(key, value); },
    removeItem: async (key) => { stored.delete(key); },
    getAllKeys: async () => [...stored.keys()],
    multiRemove: async (keys) => { for (const key of keys) stored.delete(key); },
  };
}

export function mountWallet(element: ReactElement, options: MountWalletOptions = {}): MountedWallet {
  const {
    resources = createFakeResources().resources,
    diary = createFakeDiary().diary,
    ai = fakeAiResources().resources,
    locale = 'th',
    mode = 'light',
    fontScale = 1,
    reducedMotion = false,
    device = {},
    account = {},
  } = options;

  const stored = new Map<string, string>();
  for (const [name, value] of Object.entries(device)) stored.set(`${DEVICE_PREFIX}${name}`, value);
  for (const [name, value] of Object.entries(account)) stored.set(`${ACCOUNT_PREFIX}${TEST_ACCOUNT_ID}.${name}`, value);
  installStoreBackend(memoryBackend(stored));

  vi.spyOn(Dimensions, 'get').mockImplementation((dimension) => ({ ...realDimensionsGet(dimension), fontScale }));

  // The phone's answer: given at once, or held until the test gives it.
  let release: ((value: boolean) => void) | null = null;
  const answer = reducedMotion === 'pending'
    ? new Promise<boolean>((resolve) => { release = resolve; })
    : Promise.resolve(reducedMotion);
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockReturnValue(answer);

  function Providers({ children }: { children: ReactNode }) {
    return (
      <LanguageProvider device={locale}>
        <IntlProvider locale={locale}>
          <ThemeProvider>
            <ThemePreferenceOverride preference={mode}>
              <BunIntensityProvider>
                <SafeAreaProvider initialMetrics={PHONE}>
                  <WalletRoot>
                    <SpendV1Provider resources={resources}>
                      <SpendDiaryProvider diary={diary}>
                        <AiCompanionProvider resources={ai}>
                          {children}
                        </AiCompanionProvider>
                      </SpendDiaryProvider>
                    </SpendV1Provider>
                  </WalletRoot>
                </SafeAreaProvider>
              </BunIntensityProvider>
            </ThemePreferenceOverride>
          </ThemeProvider>
        </IntlProvider>
      </LanguageProvider>
    );
  }

  const view = render(element, { wrapper: Providers });
  return {
    ...view,
    stored,
    answerReducedMotion(value) {
      const held = release;
      if (held === null) throw new Error("answerReducedMotion gives a reducedMotion: 'pending' mount its answer, once.");
      release = null;
      held(value);
    },
  };
}
