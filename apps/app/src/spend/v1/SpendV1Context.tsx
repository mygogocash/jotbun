import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import type { SpendV1Resources } from './resources';

const SpendV1Context = createContext<SpendV1Resources | null>(null);

/** Supplies the v1 resources to the money screens (the real API in the app, a fake in tests). */
export function SpendV1Provider({ resources, children }: { resources: SpendV1Resources; children: ReactNode }) {
  return <SpendV1Context.Provider value={resources}>{children}</SpendV1Context.Provider>;
}

export function useSpendV1(): SpendV1Resources {
  const resources = useContext(SpendV1Context);
  if (!resources) throw new Error('useSpendV1 needs a SpendV1Provider.');
  return resources;
}
