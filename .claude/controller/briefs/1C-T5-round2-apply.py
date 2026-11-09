#!/usr/bin/env python3
"""Apply the 1C-T5 round-2 edits of one or more stages to a tree.
  python3 -I 1C-T5-round2-apply.py <tree> <stage> [<stage> ...]     stages: red, green, receipt

The edits are the Find/Replace blocks of brief 1C-T5-round2.md, read from
1C-T5-round2-edits.py next to this file. Every edit of the stage is checked in
memory first: each Find must occur exactly once, an edit whose replacement is
already in the file is refused (a second run), and a file to create must not
exist. Nothing is written unless every check passes. Runs no git command.
"""
import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('edits', os.path.join(HERE, '1C-T5-round2-edits.py'))
edits = importlib.util.module_from_spec(spec)
spec.loader.exec_module(edits)

if len(sys.argv) < 3:
    sys.exit(__doc__)
tree, stages = sys.argv[1], sys.argv[2:]
unknown = [stage for stage in stages if stage not in ('red', 'green', 'receipt')]
if unknown:
    sys.exit(f'unknown stage: {unknown}')

contents = {}   # path -> text after the edits so far (in memory)
creates = {}    # path -> text of a file to create
done = []
for eid, stage, path, find, replace in edits.EDITS:
    if stage not in stages:
        continue
    full = os.path.join(tree, path)
    if find is None:
        if os.path.exists(full) or path in creates:
            sys.exit(f'NOT APPLIED: {eid}: {path} already exists (nothing was written)')
        creates[path] = replace
        done.append(f'{eid}: created {path}')
        continue
    if path not in contents:
        if not os.path.isfile(full):
            sys.exit(f'NOT APPLIED: {eid}: {path} is missing (nothing was written)')
        with open(full, encoding='utf-8') as handle:
            contents[path] = handle.read()
    source = contents[path]
    if replace in source:
        sys.exit(f'NOT APPLIED: {eid}: its replacement is already in {path}; was this stage run before? (nothing was written)')
    count = source.count(find)
    if count != 1:
        sys.exit(f'NOT APPLIED: {eid}: Find occurs {count} times in {path} (nothing was written)')
    contents[path] = source.replace(find, replace)
    done.append(f'{eid}: edited {path}')

for path, text in contents.items():
    with open(os.path.join(tree, path), 'w', encoding='utf-8') as handle:
        handle.write(text)
for path, text in creates.items():
    with open(os.path.join(tree, path), 'w', encoding='utf-8') as handle:
        handle.write(text)
print('\n'.join(done))
