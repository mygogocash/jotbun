// RED stub (P3-T14): the plan's interface, with no behaviour yet.
import type { WalletT } from '../copy/draftText';

export type BunAiLine = { readonly th: string; readonly en: string };

export type BunAiTable = Readonly<Record<string, BunAiLine>>;

export function bunAiText(_table: BunAiTable, key: string, _locale: 'th' | 'en' | 'vi', _values?: Readonly<Record<string, string | number>>): string {
  return key;
}

export function useBunAiCopy(_table: BunAiTable): WalletT {
  return (key: string) => key;
}
