// RED stub (P2-T12): cardFrames.tsx's names and types. Nothing is registered
// or measured: every frame is null and measure() does nothing.
import type { ReactNode } from 'react';
import type { HostInstance } from 'react-native';

export type CardFrame = { x: number; y: number; width: number; height: number };

export type CardFrames = {
  frameOf(walletId: string): CardFrame | null;
  measure(): void;
};

export function CardFramesProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useRegisterCardFrame(walletId: string): (view: HostInstance | null) => void {
  void walletId;
  return () => undefined;
}

export function useCardFrames(): CardFrames {
  return { frameOf: () => null, measure: () => undefined };
}
