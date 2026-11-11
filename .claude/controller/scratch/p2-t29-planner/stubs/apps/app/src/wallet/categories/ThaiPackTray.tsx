// RED stub (P2-T29): the plan's interface, with no behaviour yet.
import type { CategoryDto } from '@gogospend/contracts';

export type ThaiPackTrayProps = {
  visible: boolean;
  onClose(): void;
  categories: readonly CategoryDto[];
};

export function ThaiPackTray(_props: ThaiPackTrayProps) {
  return null;
}
