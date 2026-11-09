// The wallet's one reduced-motion answer (W6). The root asks the phone once
// and keeps one listener; every wallet animation reads the answer and decides
// at mount. Until the phone answers, motion reads as reduced (R66), so nothing
// starts at full motion and then snaps. A phone that cannot answer reads as
// full motion, as src/hooks/useReducedMotion.ts does.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo } from 'react-native';

type MotionAnswer = { reduced: boolean; known: boolean };

const UNANSWERED: MotionAnswer = { reduced: true, known: false };

const WalletMotionContext = createContext<MotionAnswer | null>(null);

/** The phone's answer, asked once while `asking`, then kept live by one listener. */
function usePhoneMotionAnswer(asking: boolean): MotionAnswer {
  const [answer, setAnswer] = useState<MotionAnswer>(UNANSWERED);
  useEffect(() => {
    if (!asking) return undefined;
    // A run that has ended (unmounted, or React's development double run)
    // drops its late answer.
    let active = true;
    // A change heard before the first answer is newer than that answer.
    let heard = false;
    const settle = (reduced: boolean) => { if (active) setAnswer({ reduced, known: true }); };
    AccessibilityInfo.isReduceMotionEnabled().then(
      (reduced) => { if (!heard) settle(reduced); },
      () => { if (!heard) settle(false); },
    );
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (reduced: boolean) => {
      heard = true;
      settle(reduced);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [asking]);
  return answer;
}

export function WalletMotionProvider({ children }: { children: ReactNode }) {
  const answer = usePhoneMotionAnswer(true);
  return <WalletMotionContext.Provider value={answer}>{children}</WalletMotionContext.Provider>;
}

/** The root's answer; outside the root, the same rule with this component's own state. */
function useMotionAnswer(): MotionAnswer {
  const shared = useContext(WalletMotionContext);
  const own = usePhoneMotionAnswer(shared === null);
  return shared ?? own;
}

/** True until the phone answers (R66), then the phone's live answer. */
export function useWalletReducedMotion(): boolean {
  return useMotionAnswer().reduced;
}

/** False until the phone's first answer (or its first change). */
export function useReducedMotionKnown(): boolean {
  return useMotionAnswer().known;
}
