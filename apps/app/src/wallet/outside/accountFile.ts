// The account file (P6A-T1, X5): `outside/account-v1.json` in the app group
// tells the widgets and extensions which account the app holds, by a marker
// that never names it (the first 16 hex characters of SHA-256 over
// `jotbun-outside-marker:<account id>`), with the language and private mode.
// Pure: the digest is injected (expo-crypto in the app, node:crypto in tests).
import { OUTSIDE_FILES } from './appGroup.ts';
import type { AppGroupPort } from './appGroup.ts';

/** Lower-case hex SHA-256. */
export type Digest = (text: string) => Promise<string>;

export type AccountFile = { v: 1; marker: string; locale: 'th' | 'en'; hidden: boolean };

const MARKER_LABEL = 'jotbun-outside-marker:';
const MARKER_LENGTH = 16;
const MARKER = /^[0-9a-f]{16}$/;
const KEYS = ['hidden', 'locale', 'marker', 'v'];

export async function accountMarker(accountId: string, digest: Digest): Promise<string> {
  return (await digest(MARKER_LABEL + accountId)).slice(0, MARKER_LENGTH);
}

/** Exactly v, marker, locale and hidden, with a 16-character lower-case hex marker; anything else is null. */
export function parseAccountFile(text: string | null): AccountFile | null {
  if (text === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const keys = Object.keys(value).sort();
  if (keys.length !== KEYS.length || keys.some((key, index) => key !== KEYS[index])) return null;
  const { v, marker, locale, hidden } = value as Record<string, unknown>;
  if (v !== 1 || typeof marker !== 'string' || !MARKER.test(marker)) return null;
  if ((locale !== 'th' && locale !== 'en') || typeof hidden !== 'boolean') return null;
  return { v: 1, marker, locale, hidden };
}

/**
 * Writes the four fields by name, so nothing else the object carries reaches
 * the file, and only a file parseAccountFile accepts: anything else (an
 * account id as the marker, `vi`) is refused with a TypeError before a write.
 */
export async function writeAccountFile(group: AppGroupPort, file: AccountFile): Promise<void> {
  const text = JSON.stringify({ v: 1, marker: file.marker, locale: file.locale, hidden: file.hidden });
  if (parseAccountFile(text) === null) throw new TypeError('Not an account file.');
  await group.writeText(OUTSIDE_FILES.account, text);
}

export async function readAccountFile(group: AppGroupPort): Promise<AccountFile | null> {
  return parseAccountFile(await group.readText(OUTSIDE_FILES.account));
}
