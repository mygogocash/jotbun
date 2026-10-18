// The "Bun diary" palette (redesign R0): a lavender stage, cream cards, paper
// receipts and one deep ink. It lives beside the inherited green palette until
// R8 retires that one, so screens move over one at a time behind the
// `redesign` flag. Every text pair the kit uses is listed in BUN_TEXT_PAIRS
// and held to WCAG AA by bunPalette.test.ts.
import type { ResolvedTheme } from './resolveTheme.ts';

export type BunColors = {
  readonly isDark: boolean;
  /** Header band and celebration backgrounds. Only `ink` may sit on it. */
  readonly stage: string;
  readonly background: string;
  /** Cards and sheets. */
  readonly card: string;
  /** Receipt slips. */
  readonly paper: string;
  /** Text, outlines and the primary pill fill. */
  readonly ink: string;
  /** Label colour on an `ink` fill. */
  readonly onInk: string;
  readonly muted: string;
  /** Dotted receipt rules and list separators (decorative). */
  readonly rule: string;
  /** Links, selection, the quiet "saving" state. */
  readonly accent: string;
  /** The bun's receipt and receipt icons (decorative). */
  readonly paperBlue: string;
  /** Budget state only: red and green mean over and under budget, nothing else. */
  readonly under: string;
  readonly over: string;
  /** Bun cheeks and celebration confetti (decorative). */
  readonly cheek: string;
  /** The bun's body (decorative). */
  readonly bun: string;
};

export const bunLight: BunColors = {
  isDark: false,
  stage: '#B9A3F9',
  background: '#EDE6FF',
  card: '#FFF8EC',
  paper: '#FFFDF8',
  ink: '#231B3A',
  onInk: '#FFF8EC',
  muted: '#5B4F80',
  rule: '#CFC8E4',
  accent: '#6A4BD4',
  paperBlue: '#1F5BFF',
  under: '#1A6B43',
  over: '#A3324A',
  cheek: '#F6B6CE',
  bun: '#FFF6E6',
};

/** "Lavender night": the same roles on a deep aubergine ground. */
export const bunDark: BunColors = {
  isDark: true,
  stage: '#2A2240',
  background: '#17131F',
  card: '#221C30',
  paper: '#2A2338',
  ink: '#F4EEFF',
  onInk: '#17131F',
  muted: '#B3A7D6',
  rule: '#4A4066',
  accent: '#B9A3F9',
  paperBlue: '#6F95FF',
  under: '#6FD3A0',
  over: '#F08AA0',
  cheek: '#F6B6CE',
  bun: '#FFF6E6',
};

export function getBunColors(resolved: ResolvedTheme): BunColors {
  return resolved === 'dark' ? bunDark : bunLight;
}

type TextToken = 'ink' | 'muted' | 'accent' | 'under' | 'over' | 'onInk';
type Ground = 'stage' | 'background' | 'card' | 'paper' | 'ink';

/** Every foreground/background pair the kit draws text with. AA body text needs 4.5:1. */
export const BUN_TEXT_PAIRS: readonly (readonly [TextToken, Ground])[] = [
  ['ink', 'stage'],
  ['ink', 'background'], ['ink', 'card'], ['ink', 'paper'],
  ['muted', 'background'], ['muted', 'card'], ['muted', 'paper'],
  ['accent', 'background'], ['accent', 'card'], ['accent', 'paper'],
  ['under', 'background'], ['under', 'card'], ['under', 'paper'],
  ['over', 'background'], ['over', 'card'], ['over', 'paper'],
  ['onInk', 'ink'],
];
