// The tray's shape and its swipe (P2-T13, W3; bw-style: a tray floats 8 pt in
// from the edges, bw-tray-amount: radius 34). Pure, so the swipe's rule has a
// Node test: Tray.tsx follows the finger down its header row and asks
// shouldDismiss whether the pull, or the flick, closes the tray.

/** How far the tray floats in from the screen's left, right and bottom edges. */
export const TRAY_INSET = 8;

/** The tray's corner radius. */
export const TRAY_RADIUS = 34;

/** A pull past 120 pt closes the tray, and so does a quick flick past 60 pt (faster than 900 pt a second). A pull up never does. */
export function shouldDismiss(translationY: number, velocityY: number): boolean {
  return translationY > 120 || (translationY > 60 && velocityY > 900);
}
