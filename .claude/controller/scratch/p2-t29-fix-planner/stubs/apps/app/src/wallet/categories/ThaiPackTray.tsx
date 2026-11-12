// RED stub (P2-T29 fix round): the real tray's exports and types, drawing nothing.
import type { CategoryDto } from '@gogospend/contracts';

export type ThaiPackTrayProps = {
  visible: boolean;
  onClose(): void;
  categories: readonly CategoryDto[];
};

export function ThaiPackTray(_props: ThaiPackTrayProps) {
  return null;
}
