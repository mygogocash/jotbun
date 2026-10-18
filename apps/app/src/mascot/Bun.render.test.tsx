import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { Pressable, Text } from 'react-native';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';

// react-native-svg's web build resolves image hrefs through React Native's
// asset registry, which only Metro provides. The bun draws no images, so that
// one resolver is stubbed and the real SVG elements still render.
vi.mock('../../../../node_modules/react-native-svg/lib/module/lib/resolveAssetUri.web.js', () => ({ resolveAssetUri: () => null }));

import { ThemeProvider } from '@mobile/theme/ThemeProvider';
import { Bun, bunAccessibilityProps } from './Bun';
import { type BunIntensityContextValue, useBunIntensity } from './BunIntensityProvider';
import { BUN_INTENSITY_STORAGE_KEY } from './bunIntensityStorage';
import { BunPeek } from './BunPeek';
import { hiddenFromScreenReaders, installBrowserStorage, mountMascot, paletteFor, THEMES } from './mascotTestHarness';
import { BUN_POSE_NAMES, BUN_POSES, BUN_SIZES, bunPaints, type BunSize } from './poses';
import { SpeechBubble } from './SpeechBubble';

const SIZES = Object.keys(BUN_SIZES) as BunSize[];

beforeAll(() => { installBrowserStorage(); });
afterEach(() => { cleanup(); window.localStorage.clear(); });

test.each(THEMES)('every pose renders at every size in %s, in palette colours only', (theme) => {
  const paints = bunPaints(paletteFor(theme));
  const allowed = new Set(Object.values(paints));
  for (const pose of BUN_POSE_NAMES) {
    for (const size of SIZES) {
      const { container, unmount } = mountMascot(<Bun pose={pose} size={size} />, { theme });
      const svg = container.querySelector('svg');
      expect(svg, `${pose} ${size}`).not.toBeNull();
      const { viewBox, shapes } = BUN_POSES[pose];
      const width = BUN_SIZES[size];
      expect(Number(svg!.getAttribute('width'))).toBe(width);
      expect(Number(svg!.getAttribute('height'))).toBeCloseTo((width * viewBox.height) / viewBox.width, 6);
      expect(svg!.getAttribute('viewBox')).toBe(`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
      const drawn = [...svg!.querySelectorAll('circle, ellipse, rect, path')];
      expect(drawn.map((node) => node.tagName.toLowerCase())).toEqual(shapes.map((shape) => shape.kind));
      for (const node of drawn) {
        for (const attribute of ['fill', 'stroke']) {
          const value = node.getAttribute(attribute);
          if (value !== null) expect(allowed.has(value), `${pose} ${attribute}=${value}`).toBe(true);
        }
      }
      expect(drawn[shapes.findIndex((shape) => shape.part === 'body')].getAttribute('fill')).toBe(paints.body);
      unmount();
    }
  }
});

test('the default bun holds the receipt at size m', () => {
  const { container } = mountMascot(<Bun />);
  const svg = container.querySelector('svg')!;
  expect(Number(svg.getAttribute('width'))).toBe(56);
  expect(svg.querySelectorAll('circle, ellipse, rect, path').length).toBe(BUN_POSES['holding-receipt'].shapes.length);
  expect([...svg.querySelectorAll('*')].some((node) => node.getAttribute('fill') === paletteFor('light').paperBlue)).toBe(true);
});

test('a decorative bun is hidden from screen readers on every platform', () => {
  expect(bunAccessibilityProps({})).toEqual({
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
    'aria-hidden': true,
  });
  const { container } = mountMascot(<Bun pose="cheer" testID="bun" />);
  expect(screen.getByTestId('bun').getAttribute('aria-hidden')).toBe('true');
  expect(hiddenFromScreenReaders(container.querySelector('svg'))).toBe(true);
  expect(screen.queryByRole('img')).toBeNull();
});

test('a labelled bun is exposed as one image with its label', () => {
  expect(bunAccessibilityProps({ decorative: false, accessibilityLabel: 'Bun cheering' })).toEqual({
    accessible: true,
    accessibilityRole: 'image',
    accessibilityLabel: 'Bun cheering',
  });
  mountMascot(<Bun pose="cheer" decorative={false} accessibilityLabel="Bun cheering" testID="bun" />);
  const image = screen.getByRole('img', { name: 'Bun cheering' });
  expect(image).toBe(screen.getByTestId('bun'));
  expect(hiddenFromScreenReaders(image)).toBe(false);
});

function Everything() {
  return (
    <>
      <Bun testID="bun" />
      <BunPeek edge="top" testID="peek" />
      <SpeechBubble fact="Lunch done at ฿60." highlight="฿60" testID="bubble" />
    </>
  );
}

test('full shows the bun, the peek and the bubble', async () => {
  mountMascot(<Everything />, { intensity: 'full' });
  expect(screen.queryByTestId('bun')).not.toBeNull();
  expect(screen.queryByTestId('peek')).not.toBeNull();
  expect(screen.queryByTestId('bubble')).not.toBeNull();
});

test('quiet keeps the bun and the peek for empty states but drops the bubble', () => {
  mountMascot(<Everything />, { intensity: 'quiet' });
  expect(screen.queryByTestId('bun')).not.toBeNull();
  expect(screen.queryByTestId('peek')).not.toBeNull();
  expect(screen.queryByTestId('bubble')).toBeNull();
});

test('off renders no bun, no peek and no bubble at all', () => {
  const { container } = mountMascot(<Everything />, { intensity: 'off' });
  expect(container.innerHTML).toBe('');
});

function IntensitySwitch() {
  const { intensity, setIntensity } = useBunIntensity();
  return (
    <>
      <Text testID="intensity">{intensity}</Text>
      <Pressable accessibilityRole="button" onPress={() => setIntensity('off')}><Text>Turn the bun off</Text></Pressable>
      <Bun testID="bun" />
    </>
  );
}

test('the intensity is read from storage, falls back to full, and a change is saved', () => {
  window.localStorage.setItem(BUN_INTENSITY_STORAGE_KEY, 'loud');
  mountMascot(<IntensitySwitch />);
  expect(screen.getByTestId('intensity').textContent).toBe('full');
  act(() => { fireEvent.click(screen.getByRole('button', { name: 'Turn the bun off' })); });
  expect(screen.getByTestId('intensity').textContent).toBe('off');
  expect(screen.queryByTestId('bun')).toBeNull();
  expect(window.localStorage.getItem(BUN_INTENSITY_STORAGE_KEY)).toBe('off');
  cleanup();
  mountMascot(<IntensitySwitch />);
  expect(screen.getByTestId('intensity').textContent).toBe('off');
});

test('outside a provider the bun reads full, and changing it is refused', () => {
  let seen: BunIntensityContextValue | null = null;
  function Reader() {
    seen = useBunIntensity();
    return <Bun testID="bun" />;
  }
  render(<IntlProvider locale="en"><ThemeProvider><Reader /></ThemeProvider></IntlProvider>);
  expect(seen!.intensity).toBe('full');
  expect(screen.queryByTestId('bun')).not.toBeNull();
  expect(() => seen!.setIntensity('off')).toThrow(/BunIntensityProvider/);
});
