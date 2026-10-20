// Render tests run React Native on the web, which drops the accessibility
// props that only iOS and Android read:
// - `accessible`: on iOS, what makes a view one VoiceOver element, its label
//   and value read together and its children not read on their own. A view
//   with a role and a label but without it is skipped, and VoiceOver reads its
//   bare children instead (found by Apple's accessibility audit, R8).
// - `maxFontSizeMultiplier`: where text stops growing with the text size.
// - `accessibilityShowsLargeContentViewer` and `accessibilityLargeContentTitle`:
//   iOS's large content viewer, shown on a long press where text stays small.
//
// A render test that mocks 'react-native' with `withNativeAccessible` sees
// them on the element as `data-native-accessible`,
// `data-native-max-font-size-multiplier`,
// `data-native-accessibility-shows-large-content-viewer` and
// `data-native-accessibility-large-content-title`:
//
//   vi.mock('react-native', async (importOriginal) =>
//     (await import('@mobile/testing/nativeAccessible')).withNativeAccessible(await importOriginal()));
import { createElement, forwardRef } from 'react';
import type { ComponentType } from 'react';

type Props = Record<string, unknown> & { dataSet?: Record<string, string> };

const EXPOSED = {
  View: ['accessible'],
  Text: ['maxFontSizeMultiplier'],
  Pressable: ['accessible', 'accessibilityShowsLargeContentViewer', 'accessibilityLargeContentTitle'],
} as const;
type Exposed = keyof typeof EXPOSED;
type AnyComponent = ComponentType<Record<string, unknown>>;

const dataKey = (prop: string) => `native${prop[0].toUpperCase()}${prop.slice(1)}`;

function exposing(Base: AnyComponent, names: readonly string[], name: string) {
  const Wrapped = forwardRef<unknown, Props>(function NativeProps({ dataSet, ...props }, ref) {
    const shown = names.filter((prop) => props[prop] !== undefined);
    const marked = shown.length === 0 ? dataSet : {
      ...(dataSet as Record<string, string> | undefined),
      ...Object.fromEntries(shown.map((prop) => [dataKey(prop), String(props[prop])])),
    };
    return createElement(Base, { ...props, ref, dataSet: marked });
  });
  Wrapped.displayName = name;
  return Wrapped;
}

export function withNativeAccessible<T extends object>(reactNative: T): T {
  const original = reactNative as unknown as Record<Exposed, AnyComponent>;
  const names = Object.keys(EXPOSED) as Exposed[];
  const wrapped = Object.fromEntries(names.map((name) => [name, exposing(original[name], EXPOSED[name], name)]));
  return { ...reactNative, ...wrapped };
}
