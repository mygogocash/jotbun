// Planner probe (P2-T14 fix round, ruling R106): the first review's height
// budget (scratch/p2-t14-review/ax5-budget.ts), run on the fixed layout. Pure
// arithmetic from the real type scale (walletType.ts in the scratch copy of
// 18876253, which this round does not change) and the constants in Tray.tsx
// (padding 18, gap 12, inset 8; unchanged), TypeSwitchHeader.tsx (segment 44,
// padding 4 / 4, gap 2, track padding 4), WalletKeypad.tsx (key 46, large key
// 56, row gap 4, digits capped at 34/24), AmountFooter (gap 12) and
// PrimaryButton.tsx (min 54, padding 12 + 12, body text). iOS scales a line's
// height by the same capped multiplier as its font (RCTAttributedTextUtils),
// so a line at AX5 is walletLineHeight * min(3.571, maxScale). Safe areas are
// iOS portrait values; keyboard heights are iOS portrait with the predictive
// bar (assumed, as the review did). Run: node <this file>
import { amountMaxScale, WALLET_TYPE, walletLineHeight } from '../work/apps/app/src/theme/walletType.ts';

const AX5 = 3.571;
const scaled = (role: keyof typeof WALLET_TYPE, script: 'thai' | 'latin', fontScale: number) =>
  walletLineHeight(WALLET_TYPE[role].size, script) * Math.min(fontScale, WALLET_TYPE[role].maxScale);
const pt = (value: number) => value.toFixed(1);

const PHONES = [
  ['iPhone SE 3 (375x667)', 667, 20, 0],
  ['iPhone 13 mini (375x812)', 812, 50, 34],
  ['ax-large-tray board / iPhone 14 (390x844)', 844, 47, 34],
  ['iPhone 15/16 (393x852)', 852, 59, 34],
  ['iPhone 16 Pro Max (440x956)', 956, 62, 34],
] as const;
const KEYBOARD: Readonly<Record<number, number>> = { 667: 260, 812: 336, 844: 336, 852: 336, 956: 346 };

const CHROME = 2 * 18 + 2 * 12; // the card's padding, and its gap above and below the scrolling middle
const AMOUNT_LINE = walletLineHeight(58, 'latin') * amountMaxScale(58);
const LARGE_KEYPAD = 4 * Math.max(56, walletLineHeight(24, 'latin') * (34 / 24)) + 3 * 4;
const KEYPAD = 4 * 46 + 3 * 4;

console.log(`the amount's line at AX5: ${pt(AMOUNT_LINE)} pt; large keypad ${pt(LARGE_KEYPAD)} pt; default keypad ${KEYPAD} pt`);

for (const script of ['thai', 'latin'] as const) {
  const label = scaled('label', script, AX5);
  const title = scaled('h2', script, AX5);
  const switchStack = 3 * Math.max(44, label + 4 + 4) + 2 * 2 + 2 * 4;
  const next = Math.max(54, scaled('body', script, AX5) + 24);
  const footer = LARGE_KEYPAD + 12 + next; // R106: the pinned footer is the keys and Next only
  console.log(`\nAX5, ${script}: title line ${pt(title)}, problem line ${pt(label)}, stacked switch ${pt(switchStack)}, Next ${pt(next)}, footer (keys + Next) ${pt(footer)}`);
  const titleLines = script === 'thai' ? [1] : [1, 2];
  for (const lines of titleLines) {
    const header = Math.max(44, lines * title);
    console.log(`  header: the tray's title in ${lines} line(s), ${pt(header)} pt (close is 44)`);
    for (const [name, height, top, bottom] of PHONES) {
      const card = height - top - (8 + bottom);
      const middle = card - CHROME - header - footer;
      // Next is pinned: it stays on screen whenever the pinned parts fit the card (middle >= 0), whatever the problem's length.
      const nextOk = middle >= 0;
      // R106 as written: the switch at the top of the middle, the amount under it (gap 12).
      const amountTopLiteral = switchStack + 12;
      const literalShown = Math.max(0, Math.min(AMOUNT_LINE, middle - amountTopLiteral));
      // The planner's P1: the amount first, its problem right under it, then the switch.
      const plannerShown = Math.max(0, Math.min(AMOUNT_LINE, middle));
      console.log(
        `    ${name}: card ${card}, middle ${pt(middle)}, Next on screen with any problem: ${nextOk ? 'yes' : 'NO'}` +
          ` | switch on top (R106 as written): amount at ${pt(amountTopLiteral)}, ${pt(literalShown)} of ${pt(AMOUNT_LINE)} pt in view when the tray opens` +
          ` | amount first (P1): ${pt(plannerShown)} of ${pt(AMOUNT_LINE)} pt in view, one problem line ${middle >= AMOUNT_LINE + 8 + label ? 'in view' : `${pt(AMOUNT_LINE + 8 + label - middle)} pt below the fold`}`,
      );
    }
  }
}

// The default text size, income, with the system keyboard up for the name
// field: the KeyboardAvoidingView pads by the keyboard; the switch row stays
// pinned in the header; R106 hides the keys, so the footer is Next alone.
// The name row holds the 17 pt line in a 44 pt field box (m1) under its
// caption, with 4 pt above and below (the round's NameField).
for (const script of ['thai', 'latin'] as const) {
  const header = 44 + 2 * 4;
  const next = Math.max(54, scaled('body', script, 1) + 24);
  const caption = scaled('caption', script, 1);
  const nameRow = Math.max(58, caption + 44 + 2 * 4);
  const amount = walletLineHeight(58, 'latin');
  const chip = 44;
  const tellBun = 50;
  console.log(`\ndefault size, ${script}, keyboard up: header ${header}, footer (Next alone) ${next}, before R106 (keys + Next) ${KEYPAD + 12 + next}; the name row ${pt(nameRow)} pt`);
  for (const [name, height, top, bottom] of PHONES) {
    const card = height - KEYBOARD[height] - top - (8 + bottom);
    const middle = card - CHROME - header - next;
    const before = card - CHROME - header - (KEYPAD + 12 + next);
    const withoutTellBun = amount + 8 + chip + 12;
    const withTellBun = withoutTellBun + tellBun + 12;
    const reach = (start: number) => (start + nameRow <= middle ? 'all in view' : `${pt(start + nameRow - middle)} pt below the fold until scrolled`);
    console.log(
      `  ${name}: card ${card}, middle ${pt(middle)} (before R106: ${pt(before)}); the name row fits: ${middle >= nameRow ? 'yes' : 'NO'};` +
        ` from the middle's top it starts at ${pt(withoutTellBun)} (${reach(withoutTellBun)}), or at ${pt(withTellBun)} with Tell Bun (${reach(withTellBun)})`,
    );
  }
}
