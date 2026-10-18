import type { ViewStyle } from "react-native";

import { pickThemed, type ThemeColors } from "@mobile/theme/colorPalettes";

/**
 * The four depths GoGoSpend's premium direction distinguishes. `ground` is
 * the page itself — no lift, no shadow. Everything above it should read as
 * progressively closer to the glass: a resting `card`, a `raised` block that
 * calls out one action, and a `floating` surface (sheets, the add panel)
 * that sits above everything else on screen.
 */
export type ElevationLevel = "ground" | "card" | "raised" | "floating";

/*
 * Relationship to `shadows` in theme/tokens.ts, so the two are never mistaken
 * for duplicates by accident: that token predates this module and is NOT
 * superseded by it. `shadows.card` / `shadows.cardCss` remain the app-wide
 * card shadow already used in ~20 files; this module is a separate,
 * GoGoSpend-only depth ladder (ground/card/raised/floating) for the premium
 * direction, and neither file's values change the other's. Whether GoGoSpend
 * screens should eventually draw from `elevationFor`/`elevationCss` INSTEAD
 * of `shadows.card` is a real question piece 2 or later can pick up once
 * there is a call site to look at — it was an omission here, not a decision,
 * and this comment exists so it is not silently rediscovered as one.
 */

/*
 * Deliberately narrower than `Pick<ViewStyle, ...>`: RN types these fields as
 * `AnimatableNumericValue` (`number | Animated.AnimatedNode`) so a shadow can
 * be driven by a native driver, but every value this module produces is a
 * plain static number. This is what `elevationFor` actually returns;
 * `satisfies ViewStyle` below still proves the shape is a valid RN style.
 */
type ShadowSpec = {
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
};

const GROUND_SHADOW: ShadowSpec = {
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0,
  shadowRadius: 0,
  elevation: 0,
};

/*
 * Light leans on soft spread: a bright page can afford a wide, faint shadow
 * and still read as a gentle lift. Radius grows level over level while
 * opacity stays low throughout.
 */
const LIGHT_SHADOWS: Record<Exclude<ElevationLevel, "ground">, ShadowSpec> = {
  card: {
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  raised: {
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  floating: {
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 8,
  },
};

/*
 * Dark leans on darker and tighter: a light-opacity shadow simply disappears
 * against the #0F1110 ground, so depth comes from higher opacity and a
 * closer, smaller-radius spread rather than a wide soft one.
 */
const DARK_SHADOWS: Record<Exclude<ElevationLevel, "ground">, ShadowSpec> = {
  card: {
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 2,
  },
  raised: {
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.38,
    shadowRadius: 7,
    elevation: 4,
  },
  floating: {
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.46,
    shadowRadius: 14,
    elevation: 8,
  },
};

/** Shared shadow hue for both themes — only opacity/spread/offset differ above. */
const SHADOW_COLOR = "#000000";

/*
 * No explicit `: ViewStyle` annotation here on purpose: an explicit
 * annotation widens the return type callers see to RN's own field types
 * (`AnimatableNumericValue`), which is exactly what `ShadowSpec` above
 * avoids. `satisfies ViewStyle` still checks that the concrete shape below
 * is assignable to `ViewStyle` — i.e. a valid RN style object — without
 * losing the precise, plain-`number` typing this module actually returns.
 */
export function elevationFor(colors: ThemeColors, level: ElevationLevel) {
  if (level === "ground") {
    return { shadowColor: SHADOW_COLOR, ...GROUND_SHADOW } satisfies ViewStyle;
  }
  const spec = pickThemed(colors, LIGHT_SHADOWS, DARK_SHADOWS)[level];
  return { shadowColor: SHADOW_COLOR, ...spec } satisfies ViewStyle;
}

/**
 * The `boxShadow` counterpart to `elevationFor`, for the same level and
 * theme. react-native-web 0.21 deprecates the per-prop `shadowOffset` /
 * `shadowOpacity` / `shadowRadius` form `elevationFor` returns and warns once
 * per prop (see web-style-deprecation-parity.test.ts); `shadows.cardCss` in
 * tokens.ts already ships this same pairing for the app-wide card shadow, so
 * this gives piece 2 the identical web-safe option for the GoGoSpend ladder.
 *
 * `ground` returns `"none"` rather than `""`: an explicit CSS keyword reads
 * correctly wherever a caller drops it straight into a `boxShadow` style,
 * where an empty string could be mistaken for "unset" and silently merged
 * with something else.
 */
export function elevationCss(
  colors: ThemeColors,
  level: ElevationLevel,
): string {
  if (level === "ground") return "none";
  const { shadowOffset, shadowOpacity, shadowRadius } = pickThemed(
    colors,
    LIGHT_SHADOWS,
    DARK_SHADOWS,
  )[level];
  return `${shadowOffset.width}px ${shadowOffset.height}px ${shadowRadius}px rgba(0, 0, 0, ${shadowOpacity})`;
}

/** `card` colours are `#RRGGBB` in both palettes — see colorPalettes.ts. */
function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.substring(0, 2), 16);
  const g = parseInt(normalized.substring(2, 4), 16);
  const b = parseInt(normalized.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Alpha for the opaque fallback when a BlurView can't render (see CustomerMobileBottomNav.tsx). */
const GLASS_FALLBACK_ALPHA = 0.7;

/**
 * Native `expo-blur` `BlurView` takes `intensity` on a 0-100 scale, matching
 * the bottom nav's own native BlurView — `intensity={90}`,
 * CustomerMobileBottomNav.tsx:465.
 */
const GLASS_BLUR_INTENSITY = 90;

/**
 * Web has no `intensity` prop: the bottom nav drives `backdrop-filter`
 * directly there instead, at `blur(18px)` — CustomerMobileBottomNav.tsx:925
 * (`bottomNavBlurWeb: { backdropFilter: "blur(18px) saturate(150%)", ... }`).
 * `intensity` and a CSS blur radius in px are different units measuring
 * different things, so these are two independent values pinned to two
 * different lines of that file, never one value read two ways.
 */
const GLASS_BLUR_CSS_PX = 18;

/**
 * The opaque colour a screen paints BEHIND a blur, or instead of it on a
 * platform/path where blur isn't available, plus both blur values a real
 * `BlurView` (native) or `backdrop-filter` (web) would need — piece 2 wires
 * an actual blur up to these three values, this task only produces the data.
 */
export function materialGlass(colors: ThemeColors): {
  backgroundColor: string;
  blurIntensity: number;
  blurCssPx: number;
} {
  return {
    backgroundColor: hexToRgba(colors.card, GLASS_FALLBACK_ALPHA),
    blurIntensity: GLASS_BLUR_INTENSITY,
    blurCssPx: GLASS_BLUR_CSS_PX,
  };
}
