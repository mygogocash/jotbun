import { forwardRef, type ComponentRef } from "react";
import {
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  type TextInputProps,
  type TextProps,
} from "react-native";

import { applyIosFontToStyle } from "@mobile/theme/iosFontFace";

function remapStyle(style: TextProps["style"]): TextProps["style"] {
  if (style == null) return style;
  const flat = StyleSheet.flatten(style);
  if (!flat || typeof flat !== "object") return style;
  return applyIosFontToStyle(flat as Record<string, unknown>) as typeof flat;
}

export const Text = forwardRef<ComponentRef<typeof RNText>, TextProps>(
  function Text({ style, ...rest }, ref) {
    return <RNText ref={ref} {...rest} style={remapStyle(style)} />;
  },
);
Text.displayName = "Text";

export const TextInput = forwardRef<
  ComponentRef<typeof RNTextInput>,
  TextInputProps
>(function TextInput({ style, ...rest }, ref) {
  return <RNTextInput ref={ref} {...rest} style={remapStyle(style)} />;
});
TextInput.displayName = "TextInput";
