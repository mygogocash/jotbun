/**
 * Darkening a brand colour until it clears a contrast bar.
 *
 * Two callers, two different questions, one piece of arithmetic:
 *
 *   `spendCategoryLine` — a category chip's 1px border, which must read as a
 *     boundary against the card behind it (3:1).
 *   `brandMarkFill` — the tile behind a three-letter brand monogram, which must
 *     carry a white mark (4.5:1).
 *
 * They shipped on separate branches and each grew its own copy. Colour maths
 * duplicated across a codebase drifts — one gets a rounding fix the other does
 * not — so they share this the moment the branches met.
 *
 * WHY SCALING, NOT BLENDING. Every channel is multiplied by one factor rather
 * than mixed toward grey, so a darkened orange is still an orange. The brand is
 * the entire reason these surfaces are coloured; a hue that greys out on its way
 * to legibility has lost the thing it was for.
 *
 * WHY BISECTION, NOT A FORMULA. The sRGB transfer curve makes the relationship
 * between a channel scale and the resulting ratio non-linear. 24 steps land
 * within a rounding error of the byte emitted anyway.
 */

const HEX = /^#([0-9a-f]{6})$/i;

function channelLuminance(channel: number): number {
  return channel <= 0.03928
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of an 0-255 RGB triple. */
export function luminanceOf(rgb: readonly number[]): number {
  const [r, g, b] = rgb.map((channel) => channelLuminance(channel / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast of an RGB triple against a surface of known luminance. */
export function contrastAgainst(
  rgb: readonly number[],
  surfaceLuminance: number,
): number {
  const own = luminanceOf(rgb);
  const high = Math.max(own, surfaceLuminance);
  const low = Math.min(own, surfaceLuminance);
  return (high + 0.05) / (low + 0.05);
}

/** `#RRGGBB` to an 0-255 triple, or null when it is not a colour we can read. */
export function parseHex(hex: string): number[] | null {
  const match = HEX.exec(hex.trim());
  if (!match) return null;
  const value = match[1];
  return [0, 2, 4].map((at) => parseInt(value.slice(at, at + 2), 16));
}

/**
 * FLOORS each channel rather than rounding it.
 *
 * The search below converges on the contrast bar itself, and rounding a channel
 * up from there lands just under it — Money Lover's green came out at 4.493:1
 * against a 4.5 bar. Flooring can only darken, and darker can only raise
 * contrast against a light surface, so the emitted colour is always on the safe
 * side of its own arithmetic.
 */
export function toHex(rgb: readonly number[]): string {
  return `#${rgb
    .map((channel) =>
      Math.floor(Math.min(255, Math.max(0, channel)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`.toUpperCase();
}

/**
 * The least darkening of `rgb` for which `enough` holds.
 *
 * `enough` must hold for dark colours and fail for light ones — that is what
 * lets one search serve callers that want OPPOSITE things. Against white,
 * darkening RAISES contrast, so "enough" is `>= the floor`. Against a dark
 * card, darkening LOWERS it toward the card, so "enough" is `<= the ceiling`.
 * A single `>=` predicate converges the wrong way on one of them.
 */
export function leastDarkeningWhere(
  rgb: readonly number[],
  enough: (candidate: readonly number[]) => boolean,
): number[] {
  let low = 0;
  let high = 1;
  for (let step = 0; step < 24; step += 1) {
    const mid = (low + high) / 2;
    if (enough(rgb.map((channel) => channel * mid))) low = mid;
    else high = mid;
  }
  return rgb.map((channel) => channel * low);
}

/**
 * The least lightening of `rgb` for which `enough` holds. `leastDarkeningWhere`'s
 * counterpart: same bisection, same predicate-as-argument contract, same 24
 * steps — every channel scales toward 255 instead of toward 0.
 *
 * `enough` must hold for light colours and fail for dark ones — the mirror
 * image of `leastDarkeningWhere`'s contract, because this exists for the
 * caller `leastDarkeningWhere` cannot serve: text that must get LIGHTER, not
 * darker, to clear a bar on a dark surface.
 *
 * `mid` is parameterised the same way `leastDarkeningWhere` parameterises its
 * scale factor — 1 is untouched, 0 is the extreme (there, black; here, white)
 * — so `enough` keeps the exact same "true near 0, false near 1" shape in
 * both functions and this loop body is identical to its sibling's.
 *
 * toHex FLOORS. That is the safe side when darkening against a light surface
 * (floor only darkens further, which only raises contrast there) but the
 * UNSAFE side here: flooring a lightened channel pulls it slightly back
 * toward the original colour, which slightly LOWERS contrast against a dark
 * surface — the exact shape of bug that put Money Lover's green at 4.493
 * against a 4.5 bar. A caller targeting a bar with this function must check
 * `enough` against the floored candidate it will actually emit, not the
 * pre-floor value this function searches over.
 */
export function leastLighteningWhere(
  rgb: readonly number[],
  enough: (candidate: readonly number[]) => boolean,
): number[] {
  let low = 0;
  let high = 1;
  for (let step = 0; step < 24; step += 1) {
    const mid = (low + high) / 2;
    if (enough(rgb.map((channel) => 255 - (255 - channel) * mid))) low = mid;
    else high = mid;
  }
  return rgb.map((channel) => 255 - (255 - channel) * low);
}
