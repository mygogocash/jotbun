// The bun's poses as plain geometry (redesign R1). PLACEHOLDER ART: simple
// shapes in the app icon's style (cream body, thick ink outline, dot eyes,
// pink cheeks, a blue receipt) until the final art arrives (decision D2).
//
// Everything a pose draws is data in BUN_POSES, so the final art can replace
// the poses one at a time: swap a pose's `shapes` (and `viewBox`) and keep its
// name. Shapes name a palette ROLE (`BunPaint`), never a colour; `bunPaints`
// maps roles to the "Bun diary" palette, so there is no hex in this file.
//
// Drawing units: every pose is 64 units wide, so at 64 pt one unit is one
// point and the 2.5-unit outline is 2.5 pt. Smaller and larger buns scale the
// outline with them.
import type { BunColors } from '../theme/bunPalette.ts';

/** A palette role. `line` is the bun's ink: the outline, the face and the props' edges. */
export type BunPaint = 'body' | 'line' | 'cheek' | 'receipt' | 'receiptLine' | 'glint' | 'none';

/** What a shape is, so tests and the final art can find each part of a pose. */
export type BunPart = 'body' | 'foot' | 'eye' | 'eyeClosed' | 'glint' | 'cheek' | 'mouth' | 'brow' | 'arm' | 'hand' | 'receipt' | 'prop' | 'detail';

type ShapePaint = {
  readonly part: BunPart;
  readonly fill: BunPaint;
  readonly stroke?: BunPaint;
  readonly strokeWidth?: number;
  readonly strokeLinecap?: 'round' | 'butt';
  readonly strokeLinejoin?: 'round' | 'miter';
};

/** One SVG primitive. Paths use absolute M, L, H, V, Q, C and Z commands only. */
export type BunShape =
  | (ShapePaint & { readonly kind: 'circle'; readonly cx: number; readonly cy: number; readonly r: number })
  | (ShapePaint & { readonly kind: 'ellipse'; readonly cx: number; readonly cy: number; readonly rx: number; readonly ry: number })
  | (ShapePaint & { readonly kind: 'rect'; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly rx?: number })
  | (ShapePaint & { readonly kind: 'path'; readonly d: string });

export type BunViewBox = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

/** A pose: the part of the drawing plane it shows, and its shapes from back to front. */
export type BunPoseArt = { readonly viewBox: BunViewBox; readonly shapes: readonly BunShape[] };

export const BUN_POSE_NAMES = [
  'hello',
  'holding-receipt',
  'peek',
  'cheer',
  'thinking',
  'sleepy',
  'oops-kind',
  'lock',
  'box',
  'magnifier',
  'wave-bye',
  'quiet',
] as const;
export type BunPoseName = (typeof BUN_POSE_NAMES)[number];
export const DEFAULT_BUN_POSE: BunPoseName = 'holding-receipt';

export type BunSize = 's' | 'm' | 'l' | 'xl';
/** Width in points. Height follows the pose's view box. */
export const BUN_SIZES: Readonly<Record<BunSize, number>> = { s: 32, m: 56, l: 96, xl: 160 };

export const BUN_ART_WIDTH = 64;
/** The body outline in drawing units: 2.5 pt on a 64 pt bun. */
export const BUN_OUTLINE_WIDTH = 2.5;
const DETAIL = 1.8;
const FINE = 1.5;
const PROP = 2;

const FULL: BunViewBox = { x: 0, y: 0, width: BUN_ART_WIDTH, height: 64 };

// ---- shared parts --------------------------------------------------------

const FEET: readonly BunShape[] = [
  { part: 'foot', kind: 'ellipse', cx: 23, cy: 57.5, rx: 5.5, ry: 3.5, fill: 'body', stroke: 'line', strokeWidth: BUN_OUTLINE_WIDTH },
  { part: 'foot', kind: 'ellipse', cx: 41, cy: 57.5, rx: 5.5, ry: 3.5, fill: 'body', stroke: 'line', strokeWidth: BUN_OUTLINE_WIDTH },
];

const BODY: BunShape = { part: 'body', kind: 'ellipse', cx: 32, cy: 37, rx: 24.5, ry: 21, fill: 'body', stroke: 'line', strokeWidth: BUN_OUTLINE_WIDTH };

/** Dot eyes with a glint, like the icon. `dx` and `dy` move the gaze. */
function eyes(dx = 0, dy = 0): BunShape[] {
  const at = [25 + dx, 39 + dx];
  return [
    ...at.map((cx): BunShape => ({ part: 'eye', kind: 'circle', cx, cy: 34.5 + dy, r: 2.7, fill: 'line' })),
    ...at.map((cx): BunShape => ({ part: 'glint', kind: 'circle', cx: cx + 0.9, cy: 33.6 + dy, r: 0.9, fill: 'glint' })),
  ];
}

const CHEEKS: readonly BunShape[] = [
  { part: 'cheek', kind: 'ellipse', cx: 19.5, cy: 40, rx: 3.4, ry: 2, fill: 'cheek' },
  { part: 'cheek', kind: 'ellipse', cx: 44.5, cy: 40, rx: 3.4, ry: 2, fill: 'cheek' },
];

const stroked = (part: BunPart, d: string, strokeWidth = DETAIL): BunShape => ({
  part, kind: 'path', d, fill: 'none', stroke: 'line', strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round',
});

const SMILE = stroked('mouth', 'M29.5 39.5 Q32 42.5 34.5 39.5');

/** A stubby arm: an ink stroke with a cream core, ending in a round hand. Drawn behind the body. */
function arm(d: string, hand: { cx: number; cy: number }): BunShape[] {
  return [
    { part: 'arm', kind: 'path', d, fill: 'none', stroke: 'line', strokeWidth: 8, strokeLinecap: 'round' },
    { part: 'arm', kind: 'path', d, fill: 'none', stroke: 'body', strokeWidth: 3.5, strokeLinecap: 'round' },
    { part: 'hand', kind: 'circle', cx: hand.cx, cy: hand.cy, r: 3.6, fill: 'body', stroke: 'line', strokeWidth: DETAIL },
  ];
}

const hand = (cx: number, cy: number): BunShape => ({ part: 'hand', kind: 'circle', cx, cy, r: 3.4, fill: 'body', stroke: 'line', strokeWidth: DETAIL });

// ---- the poses -----------------------------------------------------------

export const BUN_POSES: Readonly<Record<BunPoseName, BunPoseArt>> = {
  hello: {
    viewBox: FULL,
    shapes: [
      ...arm('M50 31 Q55 25 57 17', { cx: 57, cy: 15 }),
      ...FEET, BODY, ...eyes(), ...CHEEKS,
      stroked('mouth', 'M28.5 39 Q32 44 35.5 39'),
      hand(9.5, 45),
      stroked('detail', 'M58.5 7 Q61.5 7.5 62.5 10.5', FINE),
      stroked('detail', 'M61.5 14 Q62.8 16 62.5 18.5', FINE),
    ],
  },
  'holding-receipt': {
    viewBox: FULL,
    shapes: [
      ...FEET, BODY, ...eyes(), ...CHEEKS, SMILE,
      { part: 'receipt', kind: 'path', d: 'M26 43.5 H35 L40 48.5 V57 Q40 59 38 59 H26 Q24 59 24 57 V45.5 Q24 43.5 26 43.5 Z', fill: 'receipt', stroke: 'line', strokeWidth: PROP, strokeLinejoin: 'round' },
      { part: 'receipt', kind: 'path', d: 'M35 43.5 V48.5 H40 Z', fill: 'receiptLine', stroke: 'line', strokeWidth: FINE, strokeLinejoin: 'round' },
      { part: 'receipt', kind: 'rect', x: 27, y: 50, width: 8, height: 2, rx: 1, fill: 'receiptLine' },
      { part: 'receipt', kind: 'rect', x: 27, y: 54, width: 8, height: 2, rx: 1, fill: 'receiptLine' },
      hand(23.5, 51.5),
      hand(40.5, 53),
    ],
  },
  // Only the top of the bun and its eyes: the edge it peeks over cuts it off.
  peek: {
    viewBox: { x: 0, y: 12, width: BUN_ART_WIDTH, height: 30 },
    shapes: [BODY, ...eyes()],
  },
  cheer: {
    viewBox: FULL,
    shapes: [
      ...arm('M17 27 Q10 20 8.5 11', { cx: 8.5, cy: 9 }),
      ...arm('M47 27 Q54 20 55.5 11', { cx: 55.5, cy: 9 }),
      ...FEET, BODY, ...eyes(), ...CHEEKS,
      { part: 'mouth', kind: 'path', d: 'M28 38.5 Q32 45 36 38.5 Z', fill: 'line', stroke: 'line', strokeWidth: DETAIL, strokeLinejoin: 'round' },
      { part: 'detail', kind: 'circle', cx: 22, cy: 6, r: 1.5, fill: 'cheek' },
      { part: 'detail', kind: 'circle', cx: 42, cy: 5, r: 1.5, fill: 'receipt' },
      { part: 'detail', kind: 'rect', x: 30.5, y: 2.5, width: 3, height: 3, rx: 0.6, fill: 'cheek' },
    ],
  },
  thinking: {
    viewBox: FULL,
    shapes: [
      ...FEET, BODY, ...eyes(-1, -1), ...CHEEKS,
      stroked('mouth', 'M30 41 H34'),
      hand(42, 47),
      { part: 'detail', kind: 'circle', cx: 50, cy: 13, r: 2, fill: 'glint', stroke: 'line', strokeWidth: FINE },
      { part: 'detail', kind: 'circle', cx: 55.5, cy: 6.5, r: 3, fill: 'glint', stroke: 'line', strokeWidth: FINE },
    ],
  },
  sleepy: {
    viewBox: FULL,
    shapes: [
      ...FEET, BODY,
      stroked('eyeClosed', 'M22.5 34.5 Q25 36.5 27.5 34.5'),
      stroked('eyeClosed', 'M36.5 34.5 Q39 36.5 41.5 34.5'),
      ...CHEEKS,
      { part: 'mouth', kind: 'ellipse', cx: 32, cy: 41.5, rx: 1.2, ry: 1.5, fill: 'line' },
      stroked('detail', 'M46 9 H51 L46 14 H51', FINE),
      stroked('detail', 'M53 3 H56.5 L53 6.5 H56.5', FINE),
    ],
  },
  // Over budget: a small, kind "oops". Worried brows and a wobbly mouth, never a frown or a tear.
  'oops-kind': {
    viewBox: FULL,
    shapes: [
      ...FEET, BODY, ...eyes(), ...CHEEKS,
      stroked('brow', 'M21.5 30 Q24 29.6 27 28.2', FINE),
      stroked('brow', 'M37 28.2 Q40 29.6 42.5 30', FINE),
      stroked('mouth', 'M29 41 Q30.5 39.8 32 41 Q33.5 42.2 35 41'),
      { part: 'detail', kind: 'path', d: 'M54 17 Q57 21.5 54 23.5 Q51 21.5 54 17 Z', fill: 'glint', stroke: 'line', strokeWidth: FINE, strokeLinejoin: 'round' },
    ],
  },
  lock: {
    viewBox: FULL,
    shapes: [
      ...FEET, BODY, ...eyes(), ...CHEEKS,
      stroked('mouth', 'M30 39 Q32 41 34 39'),
      stroked('prop', 'M28.5 48 V45.5 Q28.5 42.5 32 42.5 Q35.5 42.5 35.5 45.5 V48', PROP),
      { part: 'prop', kind: 'rect', x: 25, y: 47.5, width: 14, height: 10.5, rx: 2.5, fill: 'receipt', stroke: 'line', strokeWidth: PROP },
      { part: 'prop', kind: 'circle', cx: 32, cy: 51.8, r: 1.3, fill: 'receiptLine' },
      { part: 'prop', kind: 'rect', x: 31.4, y: 52.5, width: 1.2, height: 2.8, rx: 0.6, fill: 'receiptLine' },
      hand(24.5, 53),
      hand(39.5, 53),
    ],
  },
  box: {
    viewBox: FULL,
    shapes: [
      ...FEET, BODY, ...eyes(), ...CHEEKS, SMILE,
      { part: 'prop', kind: 'rect', x: 20, y: 46, width: 24, height: 12.5, rx: 1.5, fill: 'receipt', stroke: 'line', strokeWidth: PROP },
      { part: 'prop', kind: 'rect', x: 18.5, y: 43, width: 27, height: 4.5, rx: 1.5, fill: 'receipt', stroke: 'line', strokeWidth: PROP },
      { part: 'prop', kind: 'rect', x: 30.5, y: 43.8, width: 3, height: 8, rx: 0.5, fill: 'receiptLine' },
      hand(19.5, 52),
      hand(44.5, 52),
    ],
  },
  magnifier: {
    viewBox: FULL,
    shapes: [
      ...FEET, BODY, ...eyes(1, 0), ...CHEEKS,
      { part: 'mouth', kind: 'ellipse', cx: 32, cy: 41, rx: 1.3, ry: 1.6, fill: 'line' },
      stroked('prop', 'M51 52.5 L56.5 58', 3.2),
      { part: 'prop', kind: 'circle', cx: 46.5, cy: 48, r: 6, fill: 'none', stroke: 'line', strokeWidth: 2.2 },
      hand(55.5, 57),
    ],
  },
  'wave-bye': {
    viewBox: FULL,
    shapes: [
      ...arm('M14 31 Q9 25 7 17', { cx: 7, cy: 15 }),
      ...FEET, BODY,
      stroked('eyeClosed', 'M22.5 35.5 Q25 32.5 27.5 35.5'),
      stroked('eyeClosed', 'M36.5 35.5 Q39 32.5 41.5 35.5'),
      ...CHEEKS, SMILE,
      hand(54.5, 45),
      stroked('detail', 'M5.5 7 Q2.5 7.5 1.5 10.5', FINE),
      stroked('detail', 'M2.5 14 Q1.2 16 1.5 18.5', FINE),
    ],
  },
  // Destructive screens: a small, neutral face. No cheeks, no props, nothing to celebrate.
  quiet: {
    viewBox: FULL,
    shapes: [
      ...FEET, BODY,
      { part: 'eye', kind: 'circle', cx: 26, cy: 35, r: 2, fill: 'line' },
      { part: 'eye', kind: 'circle', cx: 38, cy: 35, r: 2, fill: 'line' },
      stroked('mouth', 'M30.5 41 H33.5', FINE),
    ],
  },
};

/**
 * Palette roles to colours. The bun stays cream at night, as the app icon
 * does, so its lines must stay dark in both themes: `ink` by day, and by night
 * the dark ground colour (`onInk`), since night `ink` is near white. On a dark
 * page the cream body is what separates the bun from the ground.
 */
export function bunPaints(colors: BunColors): Readonly<Record<BunPaint, string>> {
  return {
    body: colors.bun,
    line: colors.isDark ? colors.onInk : colors.ink,
    cheek: colors.cheek,
    receipt: colors.paperBlue,
    receiptLine: colors.bun,
    glint: colors.bun,
    none: 'none',
  };
}

/** Height in points of a pose drawn `width` points wide. */
export function bunHeight(art: BunPoseArt, width: number): number {
  return (width * art.viewBox.height) / art.viewBox.width;
}
