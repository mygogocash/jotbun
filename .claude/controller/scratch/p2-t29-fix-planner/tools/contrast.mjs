// The fix round's tile contrast (WCAG 2 relative luminance), for the planner's P8:
// every text token on tileTint(hue, isDark), by day and at night, for all twelve
// CATEGORY_COLORS, plus the over chip's `over` on `card`. Usage: node contrast.mjs
const hues = ['#F0A868', '#F2857E', '#F291C4', '#F2CE5C', '#6FB3F2', '#B49BE8', '#9CD4F5', '#4E93D9', '#D3C2F2', '#9B7EDB', '#D6EE8A', '#A8CC4A'];
const modes = {
  light: { ink: '#111014', quiet: '#6B6878', quietOnGround: '#4A4756', over: '#B4364F', card: '#FFFFFF', raised: '#F4F3F9' },
  dark: { ink: '#F4F2FA', quiet: '#A9A6B6', quietOnGround: '#A9A6B6', over: '#F47C93', card: '#1A1920', raised: '#2C2A33' },
};
const ch = (hex, i) => parseInt(hex.slice(i, i + 2), 16);
function tileTint(hue, isDark) {
  const amount = isDark ? 0.18 : 0.28;
  const ground = isDark ? '#1A1920' : '#FFFFFF';
  const mixed = [1, 3, 5].map((s) => Math.round(ch(ground, s) * (1 - amount) + ch(hue, s) * amount));
  return `#${mixed.map((c) => c.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}
function lum(hex) {
  const [r, g, b] = [1, 3, 5].map((s) => {
    const c = ch(hex, s) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
for (const [mode, c] of Object.entries(modes)) {
  const worst = {};
  for (const hue of hues) {
    const tint = tileTint(hue, mode === 'dark');
    const row = { hue, tint };
    for (const token of ['ink', 'quiet', 'quietOnGround', 'over']) {
      const r = ratio(c[token], tint);
      row[token] = r.toFixed(2);
      worst[token] = Math.min(worst[token] ?? 99, r);
    }
    console.log(mode, JSON.stringify(row));
  }
  console.log(mode, 'worst on a tint', JSON.stringify(Object.fromEntries(Object.entries(worst).map(([k, v]) => [k, v.toFixed(2)]))));
  console.log(mode, 'over on card', ratio(c.over, c.card).toFixed(2), 'quietOnGround on raised (no colour)', ratio(c.quietOnGround, c.raised).toFixed(2), 'ink on raised', ratio(c.ink, c.raised).toFixed(2));
}
