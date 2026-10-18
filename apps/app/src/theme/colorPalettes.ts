import type { ResolvedTheme } from "@mobile/theme/resolveTheme";

export type ThemeColors = {
  readonly isDark: boolean;
  readonly background: string;
  readonly border: string;
  readonly borderStrong: string;
  readonly card: string;
  // Interactive control surface (text inputs, dropdowns, link rows that sit ON a card).
  // Light = white; dark = a recessed surface so the control reads against the card.
  readonly field: string;
  // Subtle inset/neutral surface (was #FAFAFA-style fills nested inside cards).
  readonly fieldMuted: string;
  readonly ink: string;
  readonly muted: string;
  // Placeholder hint text inside a control, and nothing else. Split from `muted`
  // (owner call 2026-08-06) because `muted` also paints search icons, captions
  // and timestamps — fading the hint must not drag those with it.
  readonly placeholder: string;
  // Inline hyperlink / "Link your account here" affordance (was a hardcoded blue).
  readonly link: string;
  readonly primary: string;
  readonly primaryDark: string;
  /**
   * Label colour for anything sitting ON a `primaryDark` fill.
   *
   * White fails WCAG AA against primaryDark in BOTH palettes — 1.80:1 on the
   * dark #33D9AD and 2.97:1 on the light #00AA80 — so a white label on a green
   * button is unreadable in sunlight and can vanish entirely for a low-vision
   * reader. This near-black ink clears AA comfortably on both (9.25:1 / 5.6:1).
   */
  readonly onPrimaryDark: string;
  /**
   * The label and icon colour for anything sitting ON the brand-green button.
   *
   * Its own token rather than a reuse of `onPrimaryDark` so the founder can retune the
   * button's content without moving every other on-green surface with it — and so light and
   * dark can differ, which is the whole point of it being a token at all.
   *
   * Founder call 2026-08-14: white, on both grounds. White on #00CC99 measures 2.08:1, under
   * the 4.5:1 normal-text bar and the 3:1 large-text one; the founder was shown that figure
   * here and on the bottom nav (design D1) and chose white both times. Recorded so it reads
   * as a decision rather than an oversight — and so it is one line to revisit.
   */
  readonly onPrimary: string;
  /** Disabled action surface and its readable foreground (4.5:1 minimum). */
  readonly disabledAction: string;
  readonly onDisabledAction: string;
  readonly primarySoft: string;
  /** Raised surface for the GoGoSpend add panel — see the value comments. */
  readonly panelRaised: string;
  /**
   * Control outlines that sit ON that raised panel — see the value comments.
   *
   * Its own token because `border` and `borderStrong` are drawn against the
   * flat card, and the panel's wash is a different ground entirely.
   */
  readonly panelLine: string;
  /**
   * Resting outline of a control whose edge is the thing that identifies it
   * (text fields, search shells, dropdowns, checkbox and radio rings).
   *
   * Its own token because `border` / `borderStrong` are decorative card and
   * list hairlines (~1.25:1 on the card — under WCAG 1.4.11's 3:1), and
   * `panelLine` is the GoGoSpend wash-panel controls. Issue #2524
   * Option 3: lift only this edge, not every hairline in the app.
   */
  readonly controlLine: string;
  readonly accent: string;
  readonly accentSoft: string;
  readonly textSoft: string;
  /**
   * Foreground partner for `warningSoft`, which until now had none. Used where
   * something needs checking rather than fixing — `danger` would say the value
   * is wrong when it is only unconfirmed.
   */
  readonly warning: string;
  readonly warningSoft: string;
  readonly white: string;
  readonly danger: string;
};

export const lightColors: ThemeColors = {
  isDark: false,
  // Owner call 2026-08-12 (previewed as "Option A · subtle"): one step darker
  // than the old #F6F6F6, which sat 1.08:1 from the white card surface — close
  // enough that a card's edge was hard to find. 1.13:1 lets cards read as
  // objects on a page without turning the page into a grey field.
  background: "#F1F1F1",
  border: "#E4E4E4",
  borderStrong: "#D8E2D9",
  card: "#FFFFFF",
  field: "#FFFFFF",
  fieldMuted: "#FAFAFA",
  ink: "#3B3B3B",
  muted: "#7F7F7F",
  placeholder: "rgba(0, 0, 0, 0.4)",
  link: "#0064D6",
  primary: "#00CC99",
  primaryDark: "#00AA80",
  // 5.6:1 on #00AA80 — white was 2.97:1 and failed AA.
  onPrimaryDark: "#04231B",
  onPrimary: "#FFFFFF",
  disabledAction: "#E4E4E4",
  onDisabledAction: "#5A5A5A",
  primarySoft: "#D8F8EF",
  /*
   * The GoGoSpend add panel only (owner call 2026-08-30, design "C · lit
   * panel"). One step off the page rather than the card grey, so the panel a
   * member types into reads as sitting ON the screen rather than in it. Tinted
   * toward the brand green without going as far as `primarySoft`, which the
   * bank offer card below it already uses — two blocks of the same green would
   * compete for the same attention.
   */
  panelRaised: "#EAF6F1",
  /*
   * The outlines of the controls standing on that wash (owner call 2026-09-07,
   * strength "B"). `border` #E4E4E4 measured 1.16:1 against the wash and
   * `borderStrong` 1.22:1 — the owner's words were that the lines looked
   * invisible, and they were right. This clears 3:1 on every band of the
   * gradient, the point at which an edge is reliably seen.
   *
   * It stops there on purpose. The next step up was shown alongside it and
   * rejected: at 4.5:1 the outlines start competing with the Save button, and
   * the panel stops reading as a soft lit surface.
   *
   * Faded 4% on the owner's call later the same day. They asked for 10%, which
   * dark took; on the white card 10% lands at 2.79:1 and 4% is as far as it
   * goes while still clearing 3:1 behind the highest of the four controls.
   * #2523 put the money in/out track on this same line.
   */
  panelLine: "#709189",
  /*
   * Independently tunable from `panelLine`. A step stronger than the Spend
   * wash line so a 1px field edge still clears 3:1 after anti-aliasing on
   * white card / field / fieldMuted (measures 3.76:1 on the card).
   */
  controlLine: "#6B8A82",
  accent: "#005D46",
  accentSoft: "#007D5E",
  textSoft: "#989898",
  warning: "#B26A00",
  warningSoft: "#FFF7E6",
  white: "#FFFFFF",
  danger: "#CD0D0D",
};

export const darkColors: ThemeColors = {
  isDark: true,
  background: "#0F1110",
  border: "#2A302E",
  borderStrong: "#3A4541",
  card: "#1A1F1D",
  field: "#121615",
  fieldMuted: "#161B19",
  ink: "#E8ECEA",
  muted: "#9AA3A0",
  placeholder: "rgba(255, 255, 255, 0.4)",
  link: "#5B9BFF",
  primary: "#00CC99",
  primaryDark: "#33D9AD",
  // 9.25:1 on #33D9AD — white was 1.80:1 and failed AA at every size.
  onPrimaryDark: "#04231B",
  onPrimary: "#FFFFFF",
  disabledAction: "#2A302E",
  onDisabledAction: "#AEB7B4",
  primarySoft: "#0D3D32",
  panelRaised: "#1C2A25",
  /*
   * Faded 10% on the owner's call 2026-09-07: the four outlines read louder
   * than the rest of the panel once they worked. Still 3.13:1 behind the
   * highest of them, where `borderStrong` managed 1.67:1. #2523 put the
   * money in/out track on this same line.
   */
  panelLine: "#647C75",
  /*
   * Same hex as `panelLine` today — both already clear 3:1 on dark card and
   * field. Kept as a separate key so a later retune of one ground does not
   * drag the other. The Personal Information "Set A" field edge (#46524E)
   * measured only 2.05:1 on the card; this replaces that local lift.
   */
  controlLine: "#647C75",
  accent: "#5EEAD4",
  accentSoft: "#2DD4AA",
  textSoft: "#6B7572",
  warning: "#E0A95C",
  warningSoft: "#3D3520",
  white: "#FFFFFF",
  danger: "#F87171",
};

export function getColorsForTheme(resolved: ResolvedTheme): ThemeColors {
  return resolved === "dark" ? darkColors : lightColors;
}

/**
 * Pick a light- or dark-mode value inside a `createXStyles(colors)` factory.
 *
 * Use this for brand / web-parity tints that must keep their exact light hex (some
 * source-parity tests assert the literal) while still adapting in dark mode, e.g.
 * `backgroundColor: pickThemed(colors, "#F3FCF9", colors.primarySoft)`.
 */
export function pickThemed<T>(colors: ThemeColors, light: T, dark: T): T {
  return colors.isDark ? dark : light;
}
