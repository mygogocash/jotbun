// Draft copy for Bun Wallet. Thai for `th`; English for `en` and `vi`.
// `{token}` values are filled in one pass, the same way formatCopyValues does,
// so a value that itself looks like a placeholder is inserted and left alone.

export type DraftLine = { readonly th: string; readonly en: string };

export type DraftTable = Readonly<Record<string, DraftLine>>;

export type CopyValues = Readonly<Record<string, string | number>>;

export type WalletT = (key: string, values?: CopyValues) => string;

/** One pass. An unsupplied token is left as `{name}`. */
function fill(text: string, values: CopyValues | undefined): string {
  if (!values) return text;
  return text.replace(/\{([a-zA-Z0-9_]+)\}/g, (token, name: string) => {
    const value = values[name];
    return value === undefined ? token : String(value);
  });
}

/** Thai for `th`, English for `en` and `vi`. An unknown key is returned as itself. */
export function draftText(table: DraftTable, key: string, locale: 'th' | 'en' | 'vi', values?: CopyValues): string {
  const line = table[key];
  const text = line === undefined ? key : locale === 'th' ? line.th : line.en;
  return fill(text, values);
}

/** A reader bound to one table and one locale. */
export function tableT(table: DraftTable, locale: 'th' | 'en' | 'vi'): WalletT {
  return (key, values) => draftText(table, key, locale, values);
}
