#!/usr/bin/env python3
"""Builds the brief from brief.template.md: every `@@FILE <path>@@` line becomes that
kit file, byte for byte (without its final newline, inside the template's fence);
`@@LINES <path>@@` its line count; `@@REDLIST@@` the RED failures from
logs/red-render.list; `@@MUTANTS@@` one short line per mutant from logs/mutants.out
(id, outcome, description, then the first case that failed), and its summary line.

Usage: python3 -I fill_brief.py <planner folder> <brief path>
"""
import os
import re
import sys

planner, out = sys.argv[1], sys.argv[2]
template = open(os.path.join(planner, 'tools', 'brief.template.md'), encoding='utf-8').read()


def read(path):
    with open(os.path.join(planner, path), encoding='utf-8') as handle:
        return handle.read()


def file_block(match):
    text = read(match.group(1))
    return text[:-1] if text.endswith('\n') else text


def lines(match):
    return str(read(match.group(1)).count('\n'))


def red_list():
    rows = []
    for line in read('logs/red-render.list').splitlines():
        name, message = line.split(' ::: ', 1)
        rows.append(f'   - `{name}`: `{message.replace("AssertionError: ", "")}`')
    return '\n'.join(rows)


LINE = re.compile(r'^(\S+) (KILLED|SURVIVED): (.+?) \[[^\]]+\] -> Tests .*?(?:; first failing: "(.+?)")?; AssertionError x\d+; restored sha256 equal$')


def mutants():
    rows = []
    for line in read('logs/mutants.out').splitlines():
        if line.startswith('exit '):
            continue
        match = LINE.match(line)
        if match:
            ident, mark, description, case = match.groups()
            rows.append(f'{ident} {mark}: {description} -> {case}')
        elif re.match(r'^\d+ killed, \d+ survived, \d+ not as expected$', line):
            rows.append(line)
        else:
            raise SystemExit(f'unexpected mutant line: {line}')
    return '\n'.join(rows)


brief = re.sub(r'^@@FILE (\S+)@@$', file_block, template, flags=re.M)
brief = re.sub(r'@@LINES (\S+)@@', lines, brief)
brief = brief.replace('@@REDLIST@@', red_list())
brief = brief.replace('@@MUTANTS@@', mutants())
if re.search(r'@@(FILE|LINES|REDLIST|MUTANTS)', brief):
    raise SystemExit('a placeholder is left')
with open(out, 'w', encoding='utf-8') as handle:
    handle.write(brief)
print(out, brief.count('\n'), 'lines')
