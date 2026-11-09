// The person's text size, for layouts that stack at the accessibility sizes
// (see largeTextScale.ts for where that starts).
import { useWindowDimensions } from 'react-native';

import { isLargeText } from './largeTextScale';

export { LARGE_TEXT_SCALE, isLargeText } from './largeTextScale';

/** Whether the person's text size is one of the accessibility sizes; follows changes while open. */
export function useLargeText(): boolean {
  return isLargeText(useWindowDimensions().fontScale);
}
