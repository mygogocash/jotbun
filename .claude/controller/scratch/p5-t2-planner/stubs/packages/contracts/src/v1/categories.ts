/**
 * v1 categories. Each has a stable UUID and an immutable expense/income type.
 * Built-in categories carry a stable key (the app localizes the name) and may
 * be renamed with a custom label; custom categories always have a label.
 * Renaming or archiving never changes the id, so history keeps its references.
 * From phase 5 (P5-T2) a category also carries its icon and, when it was
 * added from the Thai pack, its pack key: both keys or neither.
 */
import { SPEND_CATEGORY_HUES } from "../spend.ts";

export const CATEGORY_TYPES = ["expense", "income"] as const;
export type CategoryType = (typeof CATEGORY_TYPES)[number];

/** Category chip colours (light pastels read with dark ink). */
export const CATEGORY_COLORS = SPEND_CATEGORY_HUES;

/**
 * Seeded once per account (POST /v1/categories/builtins). Keys and hues match
 * the app's existing category looks; cashback is a different ledger and is
 * deliberately absent.
 */
export const BUILTIN_CATEGORIES = [
  { key: "food", type: "expense", color: "#F0A868" },
  { key: "travel", type: "expense", color: "#6FB3F2" },
  { key: "household", type: "expense", color: "#B49BE8" },
  { key: "bills", type: "expense", color: "#F2857E" },
  { key: "shopping", type: "expense", color: "#F291C4" },
  { key: "fun", type: "expense", color: "#F2CE5C" },
  { key: "salary", type: "income", color: "#A8CC4A" },
  { key: "bonus", type: "income", color: "#F2CE5C" },
  { key: "side_job", type: "income", color: "#6FB3F2" },
  { key: "gift", type: "income", color: "#F291C4" },
] as const satisfies readonly { key: string; type: CategoryType; color: (typeof SPEND_CATEGORY_HUES)[number] }[];
export type BuiltinCategoryKey = (typeof BUILTIN_CATEGORIES)[number]["key"];

/** The icons a person picks for a category, in the picker's order. */
export const CATEGORY_PICKER_GLYPHS = [] as unknown as readonly ["food", "coffee", "car", "bag", "home", "receipt", "heart", "lotus", "gift", "phone", "paw", "book"];
export type PickerGlyph = (typeof CATEGORY_PICKER_GLYPHS)[number];

/** The Thai pack's categories, by key: a custom category added from the pack keeps its key. */
export const PACK_KEYS = [] as unknown as readonly ["family_out", "merit", "delivery", "motorbike_rail", "topup", "seven", "lottery", "pets", "family_in"];
export type PackKey = (typeof PACK_KEYS)[number];

/**
 * The persisted category (also the change-log snapshot). `icon` and
 * `pack_key` are optional in the type, as older snapshots lack them; the
 * vault sends both from phase 5 on.
 */
export type CategoryDto = {
  id: string;
  type: CategoryType;
  builtin_key: BuiltinCategoryKey | null;
  /** Custom name; null on a built-in means "use the localized default". */
  label: string | null;
  /** One of CATEGORY_COLORS, or null for a neutral chip. */
  color: string | null;
  archived: boolean;
  version: number;
  /** The icon the person picked, or null. */
  icon?: PickerGlyph | null;
  /** The Thai pack category it was added from, or null; never on a built-in. */
  pack_key?: PackKey | null;
};

/** POST /v1/categories (custom only); `id` is a client-generated UUID. */
export type CreateCategoryRequest = {
  id: string;
  type: CategoryType;
  label: string;
  color?: string | null;
  icon?: PickerGlyph | null;
  pack_key?: PackKey | null;
};

/** PATCH /v1/categories/:id with `If-Match`. The type can never change; a pack key is set only while it is null. */
export type UpdateCategoryRequest = {
  label?: string | null;
  color?: string | null;
  icon?: PickerGlyph | null;
  pack_key?: PackKey;
};

const CATEGORY_KEYS = ["archived", "builtin_key", "color", "id", "label", "type", "version"].join(",");
const BUILTIN_KEYS: readonly string[] = BUILTIN_CATEGORIES.map((builtin) => builtin.key);

/** True for exactly the persisted category shape. */
export function isCategorySnapshot(value: unknown): value is CategoryDto {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const category = value as Record<string, unknown>;
  return (
    Object.keys(category).sort().join(",") === CATEGORY_KEYS &&
    typeof category.id === "string" &&
    CATEGORY_TYPES.includes(category.type as CategoryType) &&
    (category.builtin_key === null || BUILTIN_KEYS.includes(category.builtin_key as string)) &&
    (category.label === null || typeof category.label === "string") &&
    (category.builtin_key !== null || category.label !== null) &&
    // Any stored #RRGGBB: the palette is enforced on input, so a later palette
    // change can never make an existing category's snapshot invalid.
    (category.color === null || (typeof category.color === "string" && /^#[0-9A-F]{6}$/.test(category.color))) &&
    typeof category.archived === "boolean" &&
    Number.isSafeInteger(category.version) && (category.version as number) >= 1
  );
}
