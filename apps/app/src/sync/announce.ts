// Spoken status updates. iOS VoiceOver ignores live regions, so a changed
// sync status is announced explicitly there; Android and the web use the
// banner's polite live region. It is said through announcePolitely, so
// nothing is said while the Face ID lock's cover is up (P2-T33).
import { announcePolitely } from '@mobile/ui/a11y';

export function announceStatus(text: string): void {
  announcePolitely(text);
}
