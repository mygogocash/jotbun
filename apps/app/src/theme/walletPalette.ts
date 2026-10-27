// The Bun Wallet palette (§5.1). Text pairs are held to 4.5:1 and graphic
// pairs to 3:1 by walletPalette.test.ts. Screens read it from ThemeProvider.
import type { ResolvedTheme } from './resolveTheme.ts';

export type WalletColors = {
  readonly isDark: boolean;
  readonly ground: string;
  readonly card: string;
  readonly sheet: string;
  readonly raised: string;
  readonly ink: string;
  readonly quiet: string;
  readonly quietOnGround: string;
  readonly hairline: string;
  readonly violet: string;
  readonly under: string;
  readonly over: string;
  readonly primary: string;
  readonly onPrimary: string;
  readonly toast: string;
  readonly onToast: string;
  readonly toastLink: string;
  readonly track: string;
  readonly barPast: string;
  readonly barNow: string;
  readonly guideLine: string;
};

export const walletLight: WalletColors = {
  isDark: false,
  ground: '#F4F3F9',
  card: '#FFFFFF',
  sheet: '#FFFFFF',
  raised: '#F4F3F9',
  ink: '#111014',
  quiet: '#6B6878',
  quietOnGround: '#4A4756',
  hairline: '#E6E4EE',
  violet: '#6A4BD4',
  under: '#1A7F4B',
  over: '#B4364F',
  primary: '#111014',
  onPrimary: '#FFFFFF',
  toast: '#111014',
  onToast: '#FFFFFF',
  toastLink: '#B9A3F9',
  track: '#EEEDF4',
  barPast: '#8B76DA',
  barNow: '#111014',
  guideLine: '#8A879A',
};

export const walletDark: WalletColors = {
  isDark: true,
  ground: '#0E0D12',
  card: '#1A1920',
  sheet: '#24222B',
  raised: '#2C2A33',
  ink: '#F4F2FA',
  quiet: '#A9A6B6',
  quietOnGround: '#A9A6B6',
  hairline: '#2C2A33',
  violet: '#B9A3F9',
  under: '#4CC38A',
  over: '#F47C93',
  primary: '#F4F2FA',
  onPrimary: '#111014',
  toast: '#2C2A33',
  onToast: '#F4F2FA',
  toastLink: '#B9A3F9',
  track: '#2C2A33',
  barPast: '#6E5FB8',
  barNow: '#F4F2FA',
  guideLine: '#6E6B7A',
};

export function getWalletColors(resolved: ResolvedTheme): WalletColors {
  return resolved === 'dark' ? walletDark : walletLight;
}

export type WalletMaterial = 'silk' | 'paper' | 'titanium' | 'sky' | 'peach';
export const WALLET_MATERIALS: readonly WalletMaterial[] = ['silk', 'paper', 'titanium', 'sky', 'peach'];

export type MaterialPaint = {
  readonly stops: readonly { offset: number; color: string }[];
  readonly text: string;
  readonly quietText: string;
  readonly edge: string | null;
};

type Stop = MaterialPaint['stops'][number];

// Silk names its middle stop. A two-colour material runs from 0 to 1.
const LIGHT_STOPS: Readonly<Record<WalletMaterial, readonly Stop[]>> = {
  silk: [{ offset: 0, color: '#D9CCFF' }, { offset: 0.55, color: '#A891F7' }, { offset: 1, color: '#EFE9FF' }],
  paper: [{ offset: 0, color: '#FFF4DC' }, { offset: 1, color: '#F3E2BE' }],
  titanium: [{ offset: 0, color: '#3A3842' }, { offset: 1, color: '#121116' }],
  sky: [{ offset: 0, color: '#D6EEFF' }, { offset: 1, color: '#8CC8F5' }],
  peach: [{ offset: 0, color: '#FFE2CF' }, { offset: 1, color: '#FFAE85' }],
};

const DARK_STOPS: Readonly<Record<WalletMaterial, readonly Stop[]>> = {
  silk: [{ offset: 0, color: '#5E4CB8' }, { offset: 0.55, color: '#43349A' }, { offset: 1, color: '#6A5AC2' }],
  paper: [{ offset: 0, color: '#6B5A3B' }, { offset: 1, color: '#4A3E28' }],
  titanium: [{ offset: 0, color: '#34323C' }, { offset: 1, color: '#17161C' }],
  sky: [{ offset: 0, color: '#2A5F86' }, { offset: 1, color: '#1C4466' }],
  peach: [{ offset: 0, color: '#7A4B36' }, { offset: 1, color: '#57331F' }],
};

export function materialPaint(material: WalletMaterial, isDark: boolean): MaterialPaint {
  const stops = (isDark ? DARK_STOPS : LIGHT_STOPS)[material];
  if (isDark) {
    // Quiet text is the same colour as the text on every dark material.
    return { stops, text: '#F4F2FA', quietText: '#F4F2FA', edge: material === 'titanium' ? '#5C5968' : null };
  }
  if (material === 'titanium') return { stops, text: '#FFFFFF', quietText: '#C9C6D4', edge: null };
  return { stops, text: '#111014', quietText: '#2A2830', edge: null };
}

export type CalendarStep = 0 | 1 | 2 | 3 | 4 | 5;
export const CALENDAR_STEP_LIMITS_BAHT = [0, 200, 500, 1000, 2000] as const;

const CALENDAR_LIGHT_FILLS = ['#FFFFFF', '#EEE9FC', '#D5C9F7', '#AE97EE', '#6A4BD4', '#3B2790'] as const;
const CALENDAR_DARK_FILLS = ['#1A1920', '#2E2650', '#4A3F7A', '#6E5FB8', '#B9A3F9', '#E2D9FD'] as const;

export function calendarPaint(step: CalendarStep, isDark: boolean): { fill: string; text: string; border: string | null } {
  const fill = (isDark ? CALENDAR_DARK_FILLS : CALENDAR_LIGHT_FILLS)[step];
  const text = isDark ? (step <= 3 ? '#F4F2FA' : '#111014') : (step <= 3 ? '#111014' : '#FFFFFF');
  // Only an empty day draws a hairline. The ramp itself is the border.
  const border = step === 0 ? (isDark ? '#2C2A33' : '#E6E4EE') : null;
  return { fill, text, border };
}

function hexChannel(hex: string, start: number): number {
  return Number.parseInt(hex.slice(start, start + 2), 16);
}

/** 28% of `hue` over white, or 18% over the dark card, per channel. */
export function tileTint(hue: string, isDark: boolean): string {
  const amount = isDark ? 0.18 : 0.28;
  const ground = isDark ? '#1A1920' : '#FFFFFF';
  const mixed = [1, 3, 5].map((start) => Math.round(hexChannel(ground, start) * (1 - amount) + hexChannel(hue, start) * amount));
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

type TextToken = 'ink' | 'quiet' | 'quietOnGround' | 'violet' | 'under' | 'over' | 'onPrimary' | 'onToast' | 'toastLink';
type TextGround = 'card' | 'ground' | 'sheet' | 'raised' | 'primary' | 'toast';
type GraphicToken = 'barPast' | 'barNow' | 'guideLine' | 'ink' | 'over' | 'violet' | 'primary';
type GraphicGround = 'card' | 'track' | 'ground';

export const WALLET_TEXT_PAIRS: readonly (readonly [TextToken, TextGround])[] = [
  ['ink', 'card'], ['ink', 'ground'], ['ink', 'sheet'], ['ink', 'raised'],
  ['quiet', 'card'], ['quiet', 'sheet'], ['quiet', 'raised'],
  ['quietOnGround', 'ground'],
  ['violet', 'card'], ['violet', 'ground'], ['violet', 'sheet'], ['violet', 'raised'],
  ['under', 'card'], ['under', 'ground'],
  ['over', 'card'], ['over', 'ground'],
  ['onPrimary', 'primary'],
  ['onToast', 'toast'], ['toastLink', 'toast'],
];

export const WALLET_GRAPHIC_PAIRS: readonly (readonly [GraphicToken, GraphicGround])[] = [
  ['barPast', 'card'], ['barNow', 'card'], ['guideLine', 'card'],
  ['ink', 'track'], ['over', 'track'], ['violet', 'track'],
  ['primary', 'ground'],
];
