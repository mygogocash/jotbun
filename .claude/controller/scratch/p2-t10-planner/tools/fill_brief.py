#!/usr/bin/env python3
"""Fills the measured numbers into tools/brief.template.md, in place.

Usage: python3 -I fill_brief.py <kit> <web total> <mutant minutes>

The mutant lines come from logs/mutants.out, with each case named by its id
(U1 to U6, W1 to W5, V1 to V9, as Step 3 of the brief lists them).
"""
import re
import sys

CASES = {
    'the compact form drops .00 only when the satang are zero; the exact form keeps two decimals': 'U1',
    'an expense takes the true minus, income a plus, a balance a minus only below zero, and zero no sign': 'U2',
    'only a canonical satang string is money': 'U3',
    'the per-day hint is whole baht, rounded down': 'U4',
    'spoken money says baht, and satang only when there are some, inside minus below zero': 'U5',
    'a hidden amount is ฿ and four dots': 'U6',
    'income is violet with a plus, an expense in a list has no sign': 'W1',
    'a tone or the colour of a material decides the colour; the label comes first, then the amount in words': 'W2',
    'private mode draws ฿•••• and says the amount is hidden, with no digit anywhere': 'W3',
    "a hidden amount keeps the amount's size and line, so rows never change height": 'W4',
    'an amount is never clamped to a line, and grows to 64 pt at most and never more than body text': 'W5',
    'the eye hides every amount and the choice survives a restart': 'V1',
    'the eye says what it will do, at 44 pt': 'V2',
    'the tip shows the first time only': 'V3',
    'toggling sends one private_mode_toggled with no properties': 'V4',
    'each tap tells VoiceOver what changed (ax-voiceover)': 'V5',
    'until the setting is read, amounts stay hidden and the eye waits; a store that cannot answer shows them': 'V6',
    'outside the wallet root amounts show, and the eye changes nothing': 'V7',
    "the catalogue's private section pins its own preview and never touches the phone's setting": 'V8',
    'an icon button is 44 pt and named; a disabled one says so and does nothing': 'V9',
}


def main():
    kit, web_total, minutes = sys.argv[1], int(sys.argv[2]), sys.argv[3]
    with open(f'{kit}/logs/mutants.out', encoding='utf-8') as handle:
        out = handle.read().rstrip('\n').split('\n')
    lines = []
    for line in out:
        match = re.search(r'first failing: "(.+?)"', line)
        if match:
            name = match.group(1)
            if name not in CASES:
                raise SystemExit(f'unknown case: {name}')
            line = line.replace(match.group(0), f'first failing {CASES[name]}')
        lines.append('   ' + line)
    total = sum(1 for line in out if re.match(r'^[A-Z]+\d+ (KILLED|SURVIVED)', line))
    killed = sum(1 for line in out if re.match(r'^[A-Z]+\d+ KILLED', line))
    path = f'{kit}/tools/brief.template.md'
    with open(path, encoding='utf-8') as handle:
        text = handle.read()
    values = {
        '@@MUTANT_LINES@@': '\n'.join(lines),
        '@@MUTANT_TOTAL@@': str(total),
        '@@MUTANT_KILLED@@': str(killed),
        '@@MUTANT_MINUTES@@': minutes,
        '@@FOCUSED_N@@': '565',
        '@@WEB_TOTAL@@': str(web_total),
        '@@WEB_DELTA@@': str(web_total - 4785),
    }
    for key, value in values.items():
        if key not in text:
            raise SystemExit(f'{key} is not in the template')
        text = text.replace(key, value)
    if '@@' in re.sub(r'^@@ -\d.*$', '', text, flags=re.M):
        raise SystemExit('a placeholder is left')
    with open(path, 'w', encoding='utf-8') as handle:
        handle.write(text)
    print(f'filled: {total} mutants, {killed} killed, web {web_total}')


if __name__ == '__main__':
    main()
