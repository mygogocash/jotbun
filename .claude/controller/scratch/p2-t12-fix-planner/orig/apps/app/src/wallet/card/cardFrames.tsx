// Where each wallet's card sits on screen (P2-T12), for the saved moment's
// flying chip (P2-T17: it "travels from the bottom centre to the card"). A
// card's view registers under its wallet's id through the ref that
// useRegisterCardFrame gives, and frameOf answers with where that view was
// last measured in the window (measureInWindow), or null while no card of
// that wallet is on screen, or before it has been measured. A view is
// measured when it registers, which is after layout, and again whenever
// measure() asks; CardStack asks after each of its own layouts, so a card is
// measured again where it now is when the stack moves within the page. Each
// answer replaces the last when it arrives (on the web a moment later, once
// the page has laid out).
//
// One view per wallet id: the last one registered. A view that leaves forgets
// its wallet's frame, never another view's, and a measurement that lands after
// its view has left is never given out. Outside a provider nothing is kept:
// every frame is null and measure() does nothing, so a card anywhere (the
// catalogue, a test) needs no provider. WalletShell mounts it (P2-T18).
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { HostInstance } from 'react-native';

export type CardFrame = { x: number; y: number; width: number; height: number };

export type CardFrames = {
  /** Where the wallet's card was last measured in the window; null while none is on screen, or before it is measured. */
  frameOf(walletId: string): CardFrame | null;
  /** Measures every registered card again; each new frame replaces the last when it arrives. */
  measure(): void;
};

type Registry = CardFrames & {
  register(walletId: string, view: HostInstance): void;
  forget(walletId: string, view: HostInstance): void;
};

function createRegistry(): Registry {
  const views = new Map<string, HostInstance>();
  // Keyed by the view, so a frame measured for a view that has left never answers for its wallet.
  const frames = new WeakMap<HostInstance, CardFrame>();
  const measureView = (view: HostInstance) => {
    view.measureInWindow((x, y, width, height) => {
      frames.set(view, { x, y, width, height });
    });
  };
  return {
    register(walletId, view) {
      views.set(walletId, view);
      measureView(view);
    },
    forget(walletId, view) {
      if (views.get(walletId) === view) views.delete(walletId);
    },
    frameOf(walletId) {
      const view = views.get(walletId);
      return view === undefined ? null : (frames.get(view) ?? null);
    },
    measure() {
      for (const view of views.values()) measureView(view);
    },
  };
}

const CardFramesContext = createContext<Registry | null>(null);

const NO_FRAMES: CardFrames = { frameOf: () => null, measure: () => undefined };

export function CardFramesProvider({ children }: { children: ReactNode }) {
  const [registry] = useState(createRegistry);
  return <CardFramesContext.Provider value={registry}>{children}</CardFramesContext.Provider>;
}

/** The ref for a wallet card's view: it registers the view under the wallet's id, and forgets it when the view leaves. */
export function useRegisterCardFrame(walletId: string): (view: HostInstance | null) => void {
  const registry = useContext(CardFramesContext);
  const registered = useRef<HostInstance | null>(null);
  return useCallback(
    (view: HostInstance | null) => {
      if (registry === null) return;
      if (registered.current !== null) registry.forget(walletId, registered.current);
      registered.current = view;
      if (view !== null) registry.register(walletId, view);
    },
    [registry, walletId],
  );
}

/** Where the wallet cards on screen are, and a way to measure them again. */
export function useCardFrames(): CardFrames {
  return useContext(CardFramesContext) ?? NO_FRAMES;
}
