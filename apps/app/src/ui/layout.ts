// Spacing, corners, outlines and touch sizes for the "Bun diary" kit. The kit
// draws edges with outlines instead of shadows.
export const BUN_SPACE = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32 } as const;
export const BUN_RADIUS = { chip: 12, card: 16, sheet: 24, pill: 999 } as const;
export const BUN_OUTLINE = { card: 2, control: 1.5, rule: 1 } as const;
/** The smallest touch target, in points. */
export const BUN_TOUCH = 44;
