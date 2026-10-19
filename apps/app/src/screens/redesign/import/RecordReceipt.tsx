// R7: a record's receipt (attach, view, replace, remove; plan §6.5), behind
// the `import` area until E2 checkpoint 5. With the area off it draws nothing,
// so the approved Record screen is unchanged. A placeholder until built.
import { isRedesignEnabled } from '@mobile/config/featureFlags';

export function RecordReceipt(_props: { recordId: string; version: number }) {
  if (!isRedesignEnabled('import')) return null;
  return null;
}
