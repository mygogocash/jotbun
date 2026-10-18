// Accessibility helpers shared by the "Bun diary" kit (redesign R2a).
import { useEffect } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import type { HostInstance } from 'react-native';

/**
 * Spread onto a wrapper around art (the bun, icons, glyphs) whose meaning is
 * already in words beside it, so no screen reader stops on it.
 */
export const DECORATIVE = {
  accessible: false,
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
  'aria-hidden': true,
} as const;

/**
 * A polite status region: Android and the web read its changes without moving
 * focus. iOS VoiceOver ignores live regions, so pair it with `useAnnouncement`.
 */
export const POLITE_LIVE_REGION = {
  role: 'status',
  accessibilityLiveRegion: 'polite',
  'aria-live': 'polite',
} as const;

/** Speaks `text` on iOS, where live regions are not read. Never moves focus. */
export function announcePolitely(text: string): void {
  if (Platform.OS === 'ios' && text) AccessibilityInfo.announceForAccessibility(text);
}

/** Announces `text` (iOS) each time it changes to something non-empty. */
export function useAnnouncement(text: string | null | undefined): void {
  useEffect(() => {
    if (text) announcePolitely(text);
  }, [text]);
}

/**
 * Moves the screen reader (and, on the web, keyboard) focus to `target`, for
 * example into a sheet that has just opened.
 */
export function moveAccessibilityFocus(target: HostInstance | null): void {
  if (!target) return;
  if (Platform.OS === 'web') {
    (target as unknown as { focus?: () => void }).focus?.();
    return;
  }
  AccessibilityInfo.sendAccessibilityEvent(target, 'focus');
}
