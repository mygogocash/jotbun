/**
 * The GoGoCash bridge (D16): which purchases were at brands where GoGoCash,
 * Jotbun's sister app, pays cashback. The phone matches its own records
 * against this public catalogue; nothing from the diary is sent anywhere.
 * The catalogue carries no rates, so the app shows a count of purchases and
 * a link, never a baht figure it would have to invent.
 */

export type CashbackBrand = {
  key: string;
  name: string;
  /** Lower-case words matched against a record's merchant and note. */
  patterns: string[];
  /** Where the member continues in GoGoCash (https on gogocash.co). */
  href: string;
};

/** GET /v1/bridge/gogocash/catalogue (public; 404 while the bridge is off). */
export type CashbackCatalogue = {
  source: "gogocash" | "builtin";
  updated_at: string | null;
  home_href: string;
  brands: CashbackBrand[];
};

export const GOGOCASH_HOME = "https://gogocash.co";

/**
 * Brands GoGoCash names on its own site and listings (Shopee, Lazada, Agoda,
 * TikTok Shop), used until the live catalogue is configured. Links go to the
 * GoGoCash home page rather than guessed deep links.
 */
export const BUILTIN_CASHBACK_BRANDS: readonly CashbackBrand[] = [
  { key: "shopee", name: "Shopee", patterns: ["shopee", "ช้อปปี้"], href: GOGOCASH_HOME },
  { key: "lazada", name: "Lazada", patterns: ["lazada", "ลาซาด้า"], href: GOGOCASH_HOME },
  { key: "agoda", name: "Agoda", patterns: ["agoda", "อโกด้า"], href: GOGOCASH_HOME },
  { key: "tiktok_shop", name: "TikTok Shop", patterns: ["tiktok shop", "tiktokshop", "ติ๊กต็อกช็อป"], href: GOGOCASH_HOME },
];

const KEY = /^[a-z0-9_]{1,40}$/;

function isGogocashHref(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 300) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "gogocash.co" || url.hostname.endsWith(".gogocash.co"));
  } catch {
    return false;
  }
}

export function isCashbackBrand(value: unknown): value is CashbackBrand {
  const b = value as Partial<CashbackBrand> | null;
  return (
    typeof b === "object" && b !== null &&
    typeof b.key === "string" && KEY.test(b.key) &&
    typeof b.name === "string" && b.name.trim().length > 0 && b.name.length <= 60 &&
    Array.isArray(b.patterns) && b.patterns.length > 0 && b.patterns.length <= 12 &&
    b.patterns.every((p) => typeof p === "string" && p.trim().length >= 3 && p.length <= 40 && p === p.toLowerCase()) &&
    isGogocashHref(b.href)
  );
}

export function isCashbackCatalogue(value: unknown): value is CashbackCatalogue {
  const c = value as Partial<CashbackCatalogue> | null;
  return (
    typeof c === "object" && c !== null &&
    (c.source === "gogocash" || c.source === "builtin") &&
    (c.updated_at === null || typeof c.updated_at === "string") &&
    isGogocashHref(c.home_href) &&
    Array.isArray(c.brands) && c.brands.length <= 500 && c.brands.every(isCashbackBrand)
  );
}

/** The brand a record's text names, if any (case-insensitive, whole words for Latin text). */
export function matchCashbackBrand(text: string | null | undefined, brands: readonly CashbackBrand[]): CashbackBrand | null {
  if (!text) return null;
  const haystack = text.normalize("NFC").toLowerCase();
  for (const brand of brands) {
    for (const pattern of brand.patterns) {
      const at = haystack.indexOf(pattern);
      if (at < 0) continue;
      const before = haystack[at - 1] ?? " ";
      const after = haystack[at + pattern.length] ?? " ";
      const latin = /[a-z0-9]/;
      if (latin.test(pattern[0]) && latin.test(before)) continue;
      if (latin.test(pattern[pattern.length - 1]) && latin.test(after)) continue;
      return brand;
    }
  }
  return null;
}
