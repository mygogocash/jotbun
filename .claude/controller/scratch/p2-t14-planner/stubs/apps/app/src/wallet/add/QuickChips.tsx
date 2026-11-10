// RED stub (P2-T14): the real types, and no chips.
import type { Minor } from '@gogospend/contracts';

export type QuickChip = { label: string; amountMinor: Minor; apply(): void };

export function QuickChips(_props: { chips: readonly QuickChip[] }) {
  return null;
}
