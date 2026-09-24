const OBJECT_ID_HEX = /^[a-f0-9]{24}$/i;

export function parseSpendAllowlist(
  raw: string | undefined = process.env.SPEND_ALLOWLIST_USER_IDS,
): Set<string> {
  const ids = new Set<string>();
  for (const part of (raw ?? '').split(',')) {
    const id = part.trim();
    if (OBJECT_ID_HEX.test(id)) ids.add(id.toLowerCase());
  }
  return ids;
}

export function isSpendAllowlisted(userId: string): boolean {
  const allowlist = parseSpendAllowlist();
  // Empty/unset = everyone. A non-empty list is the dogfood brake.
  if (allowlist.size === 0) return true;
  return allowlist.has(userId.trim().toLowerCase());
}
