// Gives the signed-in screens Bun's AI help when the companion area is on;
// with it off they render exactly as before.
import type { PropsWithChildren } from 'react';

import { getSharedAiResources } from '@mobile/api/sharedV1';
import { isRedesignEnabled } from '@mobile/config/featureFlags';

import { AiCompanionProvider } from './AiCompanionProvider';

export function CompanionBoundary({ children }: PropsWithChildren) {
  if (!isRedesignEnabled('companion')) return <>{children}</>;
  return <AiCompanionProvider resources={getSharedAiResources()}>{children}</AiCompanionProvider>;
}
