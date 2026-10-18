// WCAG 2.x relative luminance and contrast ratio for #RRGGBB colours.
// Used by the palette tests; pure, no React Native.

const HEX = /^#[0-9A-Fa-f]{6}$/;

function channel(value: number): number {
  const srgb = value / 255;
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance of `#RRGGBB` (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
  if (!HEX.test(hex)) throw new TypeError(`Expected #RRGGBB, got ${hex}`);
  const [red, green, blue] = [1, 3, 5].map((start) => channel(Number.parseInt(hex.slice(start, start + 2), 16)));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** Contrast ratio between two `#RRGGBB` colours, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}
