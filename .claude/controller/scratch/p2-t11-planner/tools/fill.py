#!/usr/bin/env python3
"""Fills the measured mutant numbers into tools/brief.template.md, in place.

Usage: python3 -I fill.py <kit> <exceptions text>

The total and the line count come from logs/mutants.out; the minutes and the
load from the "mutants: start" and "mutants exit=" lines of logs/summary.txt.
The exceptions text says which kills are not assertions in the case named.
"""
import re
import sys


def seconds(stamp):
    hours, minutes, secs = (int(part) for part in stamp.split(':'))
    return hours * 3600 + minutes * 60 + secs


def main():
    kit, exceptions = sys.argv[1], sys.argv[2]
    with open(f'{kit}/logs/mutants.out', encoding='utf-8') as handle:
        out = handle.read().rstrip('\n').split('\n')
    total = sum(1 for line in out if re.match(r'^[A-Z]+\d+ (KILLED|SURVIVED)', line))
    killed = sum(1 for line in out if re.match(r'^[A-Z]+\d+ KILLED', line))
    if killed != total or out[-1] != f'{total} killed, 0 survived, 0 not as expected':
        raise SystemExit(f'not every mutant was killed: {out[-1]}')
    with open(f'{kit}/logs/summary.txt', encoding='utf-8') as handle:
        summary = handle.read()
    start = re.findall(r'^\[(\d\d:\d\d:\d\d) load ([\d.]+)\] mutants: start$', summary, re.M)[-1]
    end = re.findall(r'^\[(\d\d:\d\d:\d\d) load ([\d.]+)\] mutants exit=0 ', summary, re.M)[-1]
    minutes = round((seconds(end[0]) - seconds(start[0])) / 60)
    load = round((float(start[1]) + float(end[1])) / 2)
    path = f'{kit}/tools/brief.template.md'
    with open(path, encoding='utf-8') as handle:
        text = handle.read()
    values = {
        '@@MUTANT_TOTAL@@': str(total),
        '@@MUTANT_MINUTES@@': f'about {minutes}' if minutes > 1 else 'about one',
        '@@MUTANT_LOAD@@': str(load),
        '@@MUTANT_LINE_COUNT@@': str(len(out)),
        '@@MUTANT_EXCEPTIONS@@': exceptions,
    }
    for key, value in values.items():
        if key not in text:
            raise SystemExit(f'{key} is not in the template')
        text = text.replace(key, value)
    with open(path, 'w', encoding='utf-8') as handle:
        handle.write(text)
    print(values)


if __name__ == '__main__':
    main()
