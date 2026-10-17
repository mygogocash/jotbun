import {
  type MouseEvent,
  Pressable,
  type PressableProps,
} from "react-native";
import { useState } from "react";

import { useReducedMotion } from "@mobile/hooks/useReducedMotion";
import { getInteractionTransformStyle, getPressedScaleStyle, motion } from "@mobile/theme/motion";

type MotionPressableProps = PressableProps & {
  hoverLift?: boolean;
  pressScale?: number;
  style?: PressableProps['style'];
};

const webInteractiveStyle = {
  cursor: "pointer" as const,
  transitionDuration: motion.cssTransition.duration,
  transitionProperty: motion.cssTransition.property,
  transitionTimingFunction: motion.cssTransition.timingFunction,
  willChange: "transform",
};

export function MotionPressable({
  disabled,
  hoverLift = true,
  onHoverIn,
  onHoverOut,
  pressScale = motion.scale.press,
  style,
  ...pressableProps
}: MotionPressableProps) {
  const [hovered, setHovered] = useState(false);
  const reducedMotion = useReducedMotion();
  const interactive = !disabled;
  const effectivePressScale = reducedMotion ? 1 : pressScale;
  const effectiveHoverLift = reducedMotion ? false : hoverLift;

  const handleHoverIn = (event: MouseEvent) => {
    if (interactive) {
      setHovered(true);
    }
    onHoverIn?.(event);
  };

  const handleHoverOut = (event: MouseEvent) => {
    setHovered(false);
    onHoverOut?.(event);
  };

  return (
    <Pressable
      disabled={disabled}
      onHoverIn={handleHoverIn}
      onHoverOut={handleHoverOut}
      {...pressableProps}
      style={(state) =>
        [
          webInteractiveStyle,
          typeof style === "function" ? style(state) : style,
          effectiveHoverLift
            ? getInteractionTransformStyle({
                hovered: interactive && hovered,
                hoverLift: effectiveHoverLift,
                pressed: state.pressed,
                pressScale: effectivePressScale,
              })
            : getPressedScaleStyle(state.pressed, effectivePressScale),
        ]
      }
    />
  );
}
