import { createContext, useContext, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

import type { DiaryView, SpendDiary } from './spendDiary';

const SpendDiaryContext = createContext<SpendDiary | null>(null);

const NO_DIARY: DiaryView = { phase: 'unavailable', lockReason: null, outcome: null, pending: [], outbox: [] };

/** Supplies the device diary (S2/S3) to the money screens; absent on web and in online-only tests. */
export function SpendDiaryProvider({ diary, children }: { diary: SpendDiary | null; children: ReactNode }) {
  return <SpendDiaryContext.Provider value={diary}>{children}</SpendDiaryContext.Provider>;
}

export function useSpendDiary(): SpendDiary | null {
  return useContext(SpendDiaryContext);
}

/** The diary's current view, re-rendering on every change. */
export function useDiaryView(): DiaryView {
  const diary = useSpendDiary();
  return useSyncExternalStore(
    (listener) => (diary ? diary.subscribe(listener) : () => undefined),
    () => (diary ? diary.getView() : NO_DIARY),
  );
}
