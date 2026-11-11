// RED stub (P2-T29): the plan's interface, with no behaviour yet.
import type { CategoryDto, CategoryType } from '@gogospend/contracts';
import { CATEGORY_COLORS } from '@gogospend/contracts';

export const TRAY_SWATCHES: readonly string[] = [0, 4, 5, 2, 3, 6, 8].map((i) => CATEGORY_COLORS[i]);

export type CategoryTrayProps = {
  visible: boolean;
  onClose(): void;
  category: CategoryDto | null;
  type: CategoryType;
  now?: Date;
};

export function CategoryTray(_props: CategoryTrayProps) {
  return null;
}
