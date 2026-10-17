import { useMemo } from "react";

import type { ThemeColors } from "@mobile/theme/colorPalettes";
import { useTheme } from "@mobile/theme/ThemeProvider";
import { useUiFontFamilyVersion } from "@mobile/theme/uiFontFamily";

export function useThemedStyles<T>(factory: (colors: ThemeColors) => T): T {
  const { colors } = useTheme();
  const fontVersion = useUiFontFamilyVersion();
  return useMemo(() => factory(colors), [colors, fontVersion]);
}
