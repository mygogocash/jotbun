#!/usr/bin/env python3
"""Fills the brief template from the planner's files. Usage: python3 -I fill_brief.py <template> <out>

Placeholders: {{SHA <path under PL>}} (sha256), {{LINES <path under PL>}} (line count),
{{MUTANT_LINES}} (each mutant's line from logs/mutants.out, cut before its counts),
{{MUTANT_SUMMARY}} (the runner's last line).
"""
import hashlib
import os
import re
import sys

PL = '/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t13-planner'


def sha(rel):
    with open(os.path.join(PL, rel), 'rb') as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def lines(rel):
    with open(os.path.join(PL, rel), 'rb') as handle:
        return str(handle.read().count(b'\n'))


def mutant_lines():
    with open(os.path.join(PL, 'logs/mutants.out'), encoding='utf-8') as handle:
        rows = [row.rstrip('\n') for row in handle if re.match(r'^[A-Z]+\d+ ', row)]
    # "R1 KILLED: description [file] -> Tests ...; first failing: "name"; ..." -> "R1 KILLED: description -> name"
    out = []
    for row in rows:
        head = row.split(' [', 1)[0]
        first = re.search(r'first failing: "(.+?)"', row)
        out.append(f'   {head} -> {first.group(1)}' if first else f'   {head}')
    return '\n'.join(out)


def mutant_summary():
    with open(os.path.join(PL, 'logs/mutants.out'), encoding='utf-8') as handle:
        rows = [row.rstrip('\n') for row in handle if 'not as expected' in row]
    return '   ' + rows[-1]


def main():
    template, out = sys.argv[1], sys.argv[2]
    with open(template, encoding='utf-8') as handle:
        text = handle.read()
    text = re.sub(r'\{\{SHA (\S+)\}\}', lambda match: sha(match.group(1)), text)
    text = re.sub(r'\{\{LINES (\S+)\}\}', lambda match: lines(match.group(1)), text)
    text = text.replace('{{MUTANT_LINES}}', mutant_lines()).replace('{{MUTANT_SUMMARY}}', mutant_summary())
    left = re.findall(r'\{\{[^}]*\}\}', text)
    if left:
        sys.exit(f'unfilled: {left}')
    with open(out, 'w', encoding='utf-8') as handle:
        handle.write(text)


if __name__ == '__main__':
    main()
