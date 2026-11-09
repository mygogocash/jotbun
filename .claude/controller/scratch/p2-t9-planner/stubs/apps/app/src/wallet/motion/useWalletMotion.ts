// RED stub (P2-T9): the plan's interface, with no behaviour yet: one
// placeholder animation, shared by every call.
import { FadeIn, FadeOut, type LinearTransition, type SlideInDown, type SlideInUp, type SlideOutDown } from 'react-native-reanimated';

export const TRAY_EXIT_MS = 0;

const PLACEHOLDER_IN = new FadeIn();
const PLACEHOLDER_OUT = new FadeOut();

export function trayEntering(_reduced: boolean): FadeIn | SlideInDown {
  return PLACEHOLDER_IN;
}

export function trayExiting(_reduced: boolean): FadeOut | SlideOutDown {
  return PLACEHOLDER_OUT;
}

export function toastEntering(_reduced: boolean): FadeIn | SlideInUp {
  return PLACEHOLDER_IN;
}

export function stepEntering(): FadeIn {
  return PLACEHOLDER_IN;
}

export function stepLayout(_reduced: boolean): LinearTransition | undefined {
  return undefined;
}

export function walletAddedEntering(_reduced: boolean): FadeIn | SlideInUp {
  return PLACEHOLDER_IN;
}
