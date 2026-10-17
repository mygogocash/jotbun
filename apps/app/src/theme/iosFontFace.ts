/**
 * iOS static faces from Google Fonts register Medium/SemiBold/ExtraBold as
 * their own families (RIBBI). `fontFamily: "DM Sans"` plus weight 500 then
 * silently draws Regular. Map weight to the expo-font registration name.
 * Web and Android already resolve the full axis; leave them alone.
 */

export type UiFontOs = "ios" | "android" | "web" | string | undefined;

const DM_SANS_SPECIFIC: Record<number, string> = {
  500: "DMSans_500Medium",
  600: "DMSans_600SemiBold",
  800: "DMSans_800ExtraBold",
  900: "DMSans_900Black",
};

const ANUPHAN_SPECIFIC: Record<number, string> = {
  500: "Anuphan_500Medium",
  600: "Anuphan_600SemiBold",
};

export function numericFontWeight(weight: unknown): number {
  if (typeof weight === "number" && Number.isFinite(weight)) {
    return weight;
  }
  if (weight === "bold") return 700;
  if (weight === "normal" || weight == null || weight === "") return 400;
  const parsed = Number.parseInt(String(weight), 10);
  return Number.isFinite(parsed) ? parsed : 400;
}

function isAnuphanFamily(family: string): boolean {
  return family === "Anuphan" || family.startsWith("Anuphan");
}

function isDmSansFamily(family: string): boolean {
  return (
    family === "DM Sans" ||
    family.startsWith("DMSans") ||
    family.startsWith('"DM Sans"')
  );
}

export function resolveIosFontFace(
  family: string | undefined,
  weight: unknown,
): { fontFamily?: string; fontWeight?: string } {
  const numeric = numericFontWeight(weight);
  if (!family) {
    return { fontWeight: String(numeric) };
  }

  if (isAnuphanFamily(family)) {
    if (numeric >= 800) {
      return { fontFamily: "Anuphan", fontWeight: "700" };
    }
    const specific = ANUPHAN_SPECIFIC[numeric];
    if (specific) {
      return { fontFamily: specific };
    }
    const fontWeight = numeric >= 700 ? "700" : "400";
    return { fontFamily: "Anuphan", fontWeight };
  }

  if (isDmSansFamily(family)) {
    const specific = DM_SANS_SPECIFIC[numeric];
    if (specific) {
      return { fontFamily: specific };
    }
    const fontWeight = numeric >= 700 ? "700" : "400";
    return { fontFamily: "DM Sans", fontWeight };
  }

  return { fontFamily: family, fontWeight: String(numeric) };
}

export function currentFontOs(): UiFontOs {
  return process.env.EXPO_OS;
}

export function applyIosFontToStyle<T extends Record<string, unknown>>(
  style: T,
  os: UiFontOs = currentFontOs(),
): T {
  if (os !== "ios") {
    return style;
  }
  if (style.fontFamily == null && style.fontWeight == null) {
    return style;
  }
  const resolved = resolveIosFontFace(
    typeof style.fontFamily === "string" ? style.fontFamily : undefined,
    style.fontWeight,
  );
  const next: Record<string, unknown> = { ...style, ...resolved };
  if (!("fontWeight" in resolved)) {
    delete next.fontWeight;
  }
  return next as T;
}
