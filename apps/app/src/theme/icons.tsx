import type { ComponentType } from "react";
import { createElement } from "react";
import { CalendarBlank as PhCalendarBlank, CaretDown as PhCaretDown, Download as PhDownload, Plus as PhPlus, X as PhX } from "phosphor-react-native";
import type { IconProps as PhosphorIconProps, IconWeight as PhosphorIconWeight } from "phosphor-react-native";

export type IconProps = Omit<PhosphorIconProps, "weight" | "size"> & {
  // Screens pass numeric sizes; keep this `number` so the adapter stays
  // assignable to local icon-component aliases that expect `size?: number`.
  readonly size?: number;
  readonly strokeWidth?: number;
  readonly fill?: string;
  readonly weight?: PhosphorIconWeight;
};

export type IconComponent = ComponentType<IconProps>;

// Translate lucide stroke/fill semantics into a phosphor weight.
function resolveWeight(props: IconProps): PhosphorIconWeight {
  if (props.weight) return props.weight;
  if (props.fill && (props.strokeWidth === undefined || props.strokeWidth === 0)) return "fill";
  if (typeof props.strokeWidth === "number") return props.strokeWidth >= 2.2 ? "bold" : "regular";
  return "regular";
}

function adapt(Glyph: ComponentType<PhosphorIconProps>, displayName: string): IconComponent {
  function Icon({ strokeWidth, fill, weight, color, ...rest }: IconProps) {
    const resolvedWeight = resolveWeight({ strokeWidth, fill, weight });
    const resolvedColor = resolvedWeight === "fill" && fill ? fill : color;
    return createElement(Glyph, { ...rest, color: resolvedColor, weight: resolvedWeight });
  }
  Icon.displayName = displayName;
  return Icon;
}


export const CalendarDays: IconComponent = adapt(PhCalendarBlank, "CalendarDays");
export const ChevronDown: IconComponent = adapt(PhCaretDown, "ChevronDown");
export const Download: IconComponent = adapt(PhDownload, "Download");
export const Plus: IconComponent = adapt(PhPlus, "Plus");
export const X: IconComponent = adapt(PhX, "X");
