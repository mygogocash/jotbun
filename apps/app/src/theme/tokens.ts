import { lightColors } from "@mobile/theme/colorPalettes";
import {
  getUiFontFamily,
  LATIN_UI_FONT_FAMILY,
  THAI_UI_FONT_FAMILY,
} from "@mobile/theme/uiFontFamily";

/** @deprecated Prefer `useThemeColors()` for theme-aware UI. Static light palette for legacy imports. */
export const colors = lightColors;

export const radii = {
  sm: 8,
  md: 16,
  lg: 24,
  xl: 24,
  /**
   * Fully rounded. Owner set the primary-button roundness as "360" on
   * 2026-08-05; any radius past half the control height renders identically,
   * so the pill reuses this token rather than adding a second one that would
   * split the mobile token set away from the shared web tokens.
   */
  chip: 999,
} as const;

export const spacing = {
  xs: 6,
  sm: 10,
  homeStackGap: 24,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

/**
 * Static scale tokens stay `as const` so RN `fontWeight` literals stay narrow.
 * `family` is a getter — LocaleProvider syncs Anuphan vs DM Sans via uiFontFamily.
 */
const typographyScale = {
  action: 17,
  actionLineHeight: 22,
  actionWeight: "700",
  body: 17,
  bodyLineHeight: 23,
  bodyWeight: "400",
  caption: 13,
  captionLineHeight: 18,
  captionWeight: "400",
  thaiFamily: THAI_UI_FONT_FAMILY,
  /** Stable Latin stack for tests / explicit Latin-only surfaces. */
  latinFamily: LATIN_UI_FONT_FAMILY,
  headline: 28,
  iconStrokeWidth: 1.75,
  label: 15,
  labelLineHeight: 20,
  labelWeight: "500",
  letterSpacing: 0,
  navLabelWeight: "400",
  pageTitle: 34,
  pageTitleLineHeight: 41,
  pageTitleWeight: "600",
  sectionTitle: 28,
  sectionTitleWeight: "800",
  title: 22,
  titleLineHeight: 28,
  titleWeight: "600",
  /*
   * Above the heading scale, for figures that must read as figures.
   *
   * `lineTh` is the Thai leading and is NOT optional. Anuphan carries marks
   * above and below the line that DM Sans has no equivalent for, so a box
   * measured against Latin clips them — the #2630 failure, one scale step
   * larger. happy-dom has no font metrics, so only a device can see it.
   */
  display: { size: 44, line: 52, lineTh: 58 },
  displayLg: { size: 56, line: 64, lineTh: 72 },
} as const;

export const typography = {
  ...typographyScale,
  get family(): string {
    return getUiFontFamily();
  },
};

export const shadows = {
  // Frosted pill: outer lift + the inset top highlight that gives glass its
  // rim. Without the inset the panel reads flat and the frost is lost.
  bottomNavCss:
    "0 8px 26px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.16)",
  bottomNav: {
    elevation: 12,
    shadowColor: "#102217",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.14,
    shadowRadius: 30,
  },
  cardCss: "0 4px 16px rgba(0, 0, 0, 0.05)",
  card: {
    elevation: 2,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
  },
} as const;
