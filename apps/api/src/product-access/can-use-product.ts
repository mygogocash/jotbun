export const PRODUCT_ACCESS_PRODUCTS = ['spend', 'compare'] as const;
export type ProductAccessProduct = (typeof PRODUCT_ACCESS_PRODUCTS)[number];

export const PRODUCT_ACCESS_MODES = ['off', 'allowlist', 'everyone'] as const;
export type ProductAccessMode = (typeof PRODUCT_ACCESS_MODES)[number];

const OBJECT_ID_HEX = /^[a-f0-9]{24}$/;

export type ProductAccessSnapshot = {
  mode: ProductAccessMode;
  grantIds: ReadonlySet<string>;
};

/** Missing or junk row is Off — never everyone. */
export function resolveProductAccessSnapshot(
  row: { mode?: unknown } | null | undefined,
  grantIds: Iterable<string> = [],
): ProductAccessSnapshot {
  const mode = PRODUCT_ACCESS_MODES.includes(row?.mode as ProductAccessMode)
    ? (row!.mode as ProductAccessMode)
    : 'off';
  const ids = new Set<string>();
  for (const raw of grantIds) {
    const id = raw.trim().toLowerCase();
    if (OBJECT_ID_HEX.test(id)) ids.add(id);
  }
  return { mode, grantIds: ids };
}

export function canUseProduct(
  snapshot: ProductAccessSnapshot,
  userId: string | null | undefined,
  options: { allowGuestWhenEveryone?: boolean } = {},
): boolean {
  if (snapshot.mode === 'off') return false;
  const id =
    typeof userId === 'string' && userId.trim()
      ? userId.trim().toLowerCase()
      : '';
  if (snapshot.mode === 'everyone') {
    if (id) return true;
    return options.allowGuestWhenEveryone === true;
  }
  if (!id) return false;
  return snapshot.grantIds.has(id);
}

export function isProductAccessProduct(
  value: string,
): value is ProductAccessProduct {
  return (PRODUCT_ACCESS_PRODUCTS as readonly string[]).includes(value);
}

export function isProductAccessMode(value: string): value is ProductAccessMode {
  return (PRODUCT_ACCESS_MODES as readonly string[]).includes(value);
}
