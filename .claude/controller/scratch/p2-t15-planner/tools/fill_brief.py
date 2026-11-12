#!/usr/bin/env python3
"""Builds the P2-T15 brief from tools/brief.template.md.

Usage: python3 -I fill_brief.py <planner folder> <brief path>

  {{CODE:<repo path>}}        the file in real/, fenced (stubs:<repo path> for stubs/)
  {{DIFF:<name>}}             the file in diffs/, fenced as a diff
  {{LINES:<repo path>}}       the line count of the file in real/ (orig:<repo path> for orig/)
  {{MUTANTS}}                 one line per mutant from logs/mutants.out, shortened
  {{MUTANT_TOTAL}}            the runner's last summary line
  {{RED_RENDER}}              the RED render failures, from logs/red-render.list

So every code block and mutant line in the brief is the verified file's, byte
for byte.
"""
import os
import re
import sys

LANG = {'.ts': 'ts', '.tsx': 'tsx', '.diff': 'diff'}


def read(path):
    with open(path, encoding='utf-8') as handle:
        return handle.read()


def where(planner, spec):
    folder, _, rel = spec.partition(':') if ':' in spec else ('real', '', spec)
    return os.path.join(planner, folder, rel)


def fenced(text, lang):
    body = text if text.endswith('\n') else text + '\n'
    return f'```{lang}\n{body}```'


def mutant_lines(planner):
    out = read(os.path.join(planner, 'logs', 'mutants.out')).splitlines()
    lines = []
    pattern = re.compile(r'^(\S+) (KILLED|SURVIVED(?: \(equivalent\))?): (.+?) \[([^\]]+)\] -> Tests (.+?)(?:; first failing: "(.+?)")?; AssertionError x\d+; (.+)$')
    for line in out:
        match = pattern.match(line)
        if not match:
            continue
        ident, verdict, description, _file, _summary, first, _restored = match.groups()
        lines.append(f'{ident} {verdict}: {description} -> {first or "(no case named)"}')
    return '\n'.join(lines)


def main():
    planner, target = sys.argv[1], sys.argv[2]
    template = read(os.path.join(planner, 'tools', 'brief.template.md'))
    total = read(os.path.join(planner, 'logs', 'mutants.out')).splitlines()
    values = {
        'MUTANTS': lambda _arg: mutant_lines(planner),
        'MUTANT_TOTAL': lambda _arg: next((line for line in reversed(total) if 'killed,' in line), '?'),
        'RED_RENDER': lambda _arg: read(os.path.join(planner, 'logs', 'red-render.list')).rstrip('\n'),
        'CODE': lambda arg: fenced(read(where(planner, arg)), LANG[os.path.splitext(arg)[1]]),
        'DIFF': lambda arg: fenced(read(os.path.join(planner, 'diffs', arg)), 'diff'),
        'LINES': lambda arg: str(read(where(planner, arg)).count('\n')),
    }
    marker = re.compile(r'\{\{(' + '|'.join(values) + r')(?::([^}]+))?\}\}')
    unknown = [name for name in re.findall(r'\{\{([A-Z_]+)', template) if name not in values]
    if unknown:
        sys.exit(f'unknown markers: {unknown}')
    # One pass over the template only, so nothing inside an inserted file is read as a marker.
    text = marker.sub(lambda match: values[match.group(1)](match.group(2)), template)
    with open(target, 'w', encoding='utf-8') as handle:
        handle.write(text)


if __name__ == '__main__':
    main()
