// No per-file stub here on purpose: react-native-svg loads through the shared
// alias in vitest.render.config.ts, and its real asset resolver runs.
import { cleanup, render } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import Svg, { Image } from 'react-native-svg';
import { afterEach, expect, test } from 'vitest';
// @ts-expect-error Metro's asset registry ships no types.
import { getAssetByID } from '@react-native/assets-registry/registry';

import { Bun } from '@mobile/mascot/Bun';
import { ThemeProvider } from '@mobile/theme/ThemeProvider';
import { Glyph } from '@mobile/ui/Glyph';

afterEach(() => cleanup());

test('the registry react-native-svg reads is the test stub', () => {
  expect((getAssetByID as (id: number) => unknown)(1)).toBeUndefined();
});

test('kit glyphs and the bun draw real SVG elements, hidden from screen readers', () => {
  const { container } = render(
    <IntlProvider locale="en">
      <ThemeProvider>
        <Glyph name="backspace" color="currentColor" />
        <Bun pose="hello" />
      </ThemeProvider>
    </IntlProvider>,
  );
  const drawings = container.querySelectorAll('svg');
  expect(drawings.length).toBe(2);
  for (const drawing of drawings) {
    expect(drawing.querySelectorAll('path, circle, ellipse, rect, line').length).toBeGreaterThan(0);
    expect(drawing.closest('[aria-hidden="true"]')).not.toBeNull();
  }
});

test('the real resolver runs: a link resolves, and a bundled asset id fails loudly', () => {
  const { container } = render(<Svg width={10} height={10}><Image href="https://example.invalid/receipt.png" width={10} height={10} /></Svg>);
  expect(container.querySelector('image')?.getAttribute('href')).toBe('https://example.invalid/receipt.png');
  cleanup();
  expect(() => render(<Svg width={10} height={10}><Image href={7} width={10} height={10} /></Svg>)).toThrow(/asset with ID "7" could not be found/);
});
