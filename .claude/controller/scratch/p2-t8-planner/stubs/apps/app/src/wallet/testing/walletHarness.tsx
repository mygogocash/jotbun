// RED stub (P2-T8): the plan's interface, with no behaviour yet.
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';

import type { AiResources } from '@mobile/spend/v1/ai/aiResources';
import type { SpendV1Resources } from '@mobile/spend/v1/resources';
import type { SpendDiary } from '@mobile/spend/v1/spendDiary';

export const AX5 = 3.571;

export const TEST_ACCOUNT_ID = '00000000-0000-4000-8000-0000000000aa';

export type MountWalletOptions = {
  resources?: SpendV1Resources;
  diary?: SpendDiary | null;
  ai?: AiResources;
  locale?: 'th' | 'en';
  mode?: 'light' | 'dark';
  fontScale?: number;
  reducedMotion?: boolean | 'pending';
  device?: Readonly<Record<string, string>>;
  account?: Readonly<Record<string, string>>;
};

export type MountedWallet = RenderResult & {
  stored: Map<string, string>;
  answerReducedMotion(value: boolean): void;
};

export function mountWallet(element: ReactElement, _options: MountWalletOptions = {}): MountedWallet {
  return { ...render(element), stored: new Map(), answerReducedMotion: () => undefined };
}
