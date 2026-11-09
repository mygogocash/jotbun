import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeAll, expect, test } from 'vitest';

import { hiddenFromScreenReaders, installBrowserStorage, mountMascot, paletteFor, THEMES } from './mascotTestHarness';
import { SpeechBubble } from './SpeechBubble';

beforeAll(() => { installBrowserStorage(); });
afterEach(() => { cleanup(); window.localStorage.clear(); });

const FACT = 'Lunch done at ฿60. Food is at 58% with 13 days to go.';

/** `rgb(…)` channels of `#RRGGBB`, as the DOM reports an inline colour. */
const channels = (hex: string) => new RegExp([1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16)).join(', '));

/** The innermost element whose text is the whole fact. */
function factNode(container: HTMLElement, fact: string): HTMLElement {
  const holders = [...container.querySelectorAll<HTMLElement>('*')].filter((node) => node.textContent === fact);
  const innermost = holders.find((node) => ![...node.children].some((child) => child.textContent === fact));
  expect(innermost, 'the fact is rendered as one text').toBeDefined();
  return innermost!;
}

test.each(THEMES)('the fact is read by screen readers, with its highlight in accent (%s)', (theme) => {
  const colors = paletteFor(theme);
  const { container } = mountMascot(<SpeechBubble fact={FACT} highlight="฿60" testID="bubble" />, { theme });
  const text = factNode(container, FACT);
  expect(hiddenFromScreenReaders(text)).toBe(false);
  expect(text.style.color).toMatch(channels(colors.ink));

  const highlight = screen.getByText('฿60');
  expect(text.contains(highlight)).toBe(true);
  expect(highlight.style.color).toMatch(channels(colors.accent));

  // A cream (card) bubble with an ink outline, and a small decorative bun.
  const bubble = text.parentElement!;
  expect(bubble.style.backgroundColor).toMatch(channels(colors.card));
  expect(bubble.style.borderTopColor || bubble.style.borderColor).toMatch(channels(colors.ink));
  const svg = container.querySelector('svg')!;
  expect(Number(svg.getAttribute('width'))).toBe(32);
  expect(hiddenFromScreenReaders(svg)).toBe(true);
});

test('only the first match is highlighted, and a missing highlight leaves the fact plain', () => {
  const colors = paletteFor('light');
  const { container } = mountMascot(<SpeechBubble fact="฿60 for lunch, ฿60 for dinner." highlight="฿60" />);
  const accented = [...container.querySelectorAll<HTMLElement>('*')].filter((node) => channels(colors.accent).test(node.style.color));
  expect(accented.map((node) => node.textContent)).toEqual(['฿60']);
  expect(factNode(container, '฿60 for lunch, ฿60 for dinner.').firstChild).toBe(accented[0]);
  cleanup();

  const plain = mountMascot(<SpeechBubble fact={FACT} highlight="฿999" />);
  expect(factNode(plain.container, FACT).children.length).toBe(0);
  expect([...plain.container.querySelectorAll<HTMLElement>('*')].some((node) => channels(colors.accent).test(node.style.color))).toBe(false);
});

test('Thai facts keep their highlight', () => {
  const fact = 'มื้อกลางวัน ฿60 แล้วนะ';
  const { container } = mountMascot(<SpeechBubble fact={fact} highlight="฿60" />, { locale: 'th' });
  expect(factNode(container, fact)).toBeDefined();
  expect(screen.getByText('฿60').style.color).toMatch(channels(paletteFor('light').accent));
});
