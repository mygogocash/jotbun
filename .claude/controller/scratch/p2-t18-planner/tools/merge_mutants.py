#!/usr/bin/env python3
"""Merges the mutant runner's batch outputs (each made by `mutants.py <tree> <log dir> <ids...>`, one batch per
line of batches.txt) into one file: one line per mutant in mutants.py's order, then a summary line over all of them.
Every mutant must appear exactly once. Usage: python3 -I merge_mutants.py <mutants.py> <batch folder> <merged file>
"""
import importlib.util
import os
import re
import sys

# Loading the runner must write nothing into the kit (no __pycache__ beside it).
sys.dont_write_bytecode = True
runner_path, folder, target = sys.argv[1], sys.argv[2], sys.argv[3]
spec = importlib.util.spec_from_file_location('mutants', runner_path)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
order = [ident for ident, *_ in runner.MUTANTS]
lines = {}
for name in sorted(os.listdir(folder)):
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
# As expected: a kill whose every failing case is an AssertionError, or a survivor its runner marks equivalent; and
# each file restored.
equivalent = {ident for ident, *rest in runner.MUTANTS if rest[4:] == ['equivalent']}


def clean(ident):
    line = lines[ident]
    if 'restored sha256 equal' not in line:
        return False
    if ident in equivalent:
        return ' SURVIVED (equivalent): ' in line
    if ' KILLED: ' not in line:
        return False
    kinds = re.search(r'; ([^;]*); restored', line).group(1)
    return bool(re.fullmatch(r'\d+ AssertionError', kinds))


unexpected = sum(1 for ident in order if not clean(ident))
with open(target, 'w', encoding='utf-8') as handle:
    handle.write('\n'.join(lines[ident] for ident in order) + '\n')
    handle.write(f'{killed} killed, {survived} survived ({len(equivalent)} equivalent), {unexpected} not as expected\n')
print(f'{len(order)} lines; {killed} killed, {survived} survived ({len(equivalent)} equivalent), {unexpected} not as expected')
sys.exit(1 if unexpected else 0)
