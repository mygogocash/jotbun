#!/usr/bin/env python3
"""Joins the mutant runner's batch outputs (<batch folder>/batch-*.out, each made by
`mutants.py <tree> <log dir> <ids...>`) into one file: one line per mutant in
mutants.py's order, then the runner's own summary line over all of them. Every
mutant must appear exactly once. The planner ran the 94 in four batches
(logs/mutant-batches/batch-1.out to batch-4.out) so each stayed in the foreground;
a single run of mutants.py prints the same lines.

Usage: python3 -I merge_mutants.py <mutants.py> <batch folder> <out file>
"""
import importlib.util
import os
import re
import sys

runner_path, folder, out = sys.argv[1], sys.argv[2], sys.argv[3]
spec = importlib.util.spec_from_file_location('mutants', runner_path)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
order = [ident for ident, *_ in runner.MUTANTS]
lines = {}
for name in sorted(os.listdir(folder)):
    if not (name.startswith('batch-') and name.endswith('.out')):
        continue
    with open(os.path.join(folder, name), encoding='utf-8') as handle:
        for line in handle.read().splitlines():
            match = re.match(r'^(\S+) (KILLED|SURVIVED)', line)
            if not match:
                continue
            if match.group(1) in lines:
                raise SystemExit(f'{match.group(1)} appears twice')
            lines[match.group(1)] = line
missing = [ident for ident in order if ident not in lines]
extra = [ident for ident in lines if ident not in order]
if missing or extra:
    raise SystemExit(f'missing {missing}, unknown {extra}')
killed = sum(1 for ident in order if ' KILLED: ' in lines[ident])
survived = len(order) - killed
unexpected = sum(1 for ident in order if ' KILLED: ' not in lines[ident] or 'restored sha256 equal' not in lines[ident])
with open(out, 'w', encoding='utf-8') as handle:
    handle.write('\n'.join(lines[ident] for ident in order) + '\n')
    handle.write(f'{killed} killed, {survived} survived, {unexpected} not as expected\n')
print(f'{len(order)} lines; {killed} killed, {survived} survived, {unexpected} not as expected')
