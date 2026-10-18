// Spoken status updates. iOS VoiceOver ignores live regions, so a changed
// sync status is announced explicitly there; Android and the web use the
// banner's polite live region.
import { AccessibilityInfo, Platform } from 'react-native';

export function announceStatus(text: string): void {
  if (Platform.OS === 'ios' && text) AccessibilityInfo.announceForAccessibility(text);
}
