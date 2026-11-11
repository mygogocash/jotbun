#!/usr/bin/env python3
"""Fills the brief's mutant and pin lines from the planner's logs and writes it,
from its parts in tools/brief/.

Usage: python3 -I brief.py <kit> <brief path> <minutes>
"""
import os
import re
import sys

kit, target, minutes = sys.argv[1], sys.argv[2], sys.argv[3]


def lines(name):
    text = open(os.path.join(kit, 'logs', name), encoding='utf-8').read().splitlines()
    # The planner's logs end with the runner's exit code, which the fixer's command prints apart.
    return [line for line in text if line and not line.startswith('exit ')]


mutants = lines('mutants.out')
pins = lines('red-pins.out')
assert len(mutants) == 167 and mutants[-1] == '166 killed, 0 survived, 0 not as expected', mutants[-1]
assert len(pins) == 10 and pins[-1] == '9 killed, 0 survived, 0 not as expected', pins[-1]
parts = [open(os.path.join(kit, 'tools', 'brief', name), encoding='utf-8').read() for name in ('brief.head.md', 'brief.rulings.md', 'brief.steps.md', 'brief.appendix.md')]
text = ''.join(parts)
indent = lambda block: '\n'.join('   ' + line for line in block)
for key, value in (('{{MUTANTS}}', indent(mutants)), ('{{PINS}}', indent(pins)), ('{{MUTANT_MINUTES}}', minutes)):
    assert text.count(key) == 1, key
    text = text.replace(key, value)
assert re.search(r'\{\{[A-Z_]+\}\}', text) is None, 'a placeholder is left'
open(target, 'w', encoding='utf-8').write(text.rstrip('\n') + '\n')
print(target, len(text.splitlines()), 'lines')
