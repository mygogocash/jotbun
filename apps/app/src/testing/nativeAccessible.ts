// Render tests run React Native on the web, which drops the `accessible` prop.
// On iOS that prop is what makes a view one VoiceOver element: its label and
// value are read together and its children are not read on their own. A view
// with a role and a label but without it is skipped, and VoiceOver reads its
// bare children instead (found by Apple's accessibility audit, R8).
//
// A render test that mocks 'react-native' with `withNativeAccessible` sees the
// prop as `data-native-accessible` on the view's element:
//
//   vi.mock('react-native', async (importOriginal) =>
//     (await import('@mobile/testing/nativeAccessible')).withNativeAccessible(await importOriginal()));
import { createElement, forwardRef } from 'react';
import type { ComponentType } from 'react';

type ViewProps = Record<string, unknown> & { accessible?: boolean; dataSet?: Record<string, string> };

export function withNativeAccessible<T extends object>(reactNative: T): T {
  const Base = (reactNative as unknown as { View: ComponentType<Record<string, unknown>> }).View;
  const View = forwardRef<unknown, ViewProps>(function NativeAccessibleView({ dataSet, ...props }, ref) {
    const marked = props.accessible === undefined ? dataSet : { ...(dataSet as Record<string, string> | undefined), nativeAccessible: String(props.accessible) };
    return createElement(Base, { ...props, ref, dataSet: marked });
  });
  return { ...reactNative, View };
}
