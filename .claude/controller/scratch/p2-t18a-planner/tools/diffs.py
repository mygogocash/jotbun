#!/usr/bin/env python3
"""Writes diffs/: one diff per existing file the task changes (orig/ to real/), named <path with / as _>.diff, with repo
paths (a/<path>, b/<path>) and full blob ids so `git apply --3way` can merge them; and <name>.patch, the whole task
(those diffs and each new file from nothing), for reading. Then proves the patch turns orig/ into real/ byte for byte
in a check folder with no repository (logs/applycheck.log), removes the folder, and runs git diff --check over every
change (logs/diffcheck.log: no output means no whitespace error). GIT_CEILING_DIRECTORIES names the folder above the
one git runs in, so git never climbs into the main checkout (inside a repository, `git apply` would skip every path).

Usage: python3 -I diffs.py <kit folder> <patch name>
"""
import filecmp
import os
import shutil
import subprocess
import sys

kit, name = sys.argv[1], sys.argv[2]
with open(os.path.join(kit, 'tools', 'files.txt'), encoding='utf-8') as handle:
    files = [tuple(line.split(maxsplit=1)) for line in handle if line.strip()]
files = [(kind, path.strip()) for kind, path in files]


def git(args, cwd, ceiling):
    env = dict(os.environ, GIT_CEILING_DIRECTORIES=ceiling)
    return subprocess.run(['/usr/bin/git', *args], cwd=cwd, env=env, capture_output=True, text=True)


diffs = os.path.join(kit, 'diffs')
shutil.rmtree(diffs, ignore_errors=True)
os.makedirs(diffs)
parts = []
checks = []
for kind, path in files:
    before = f'orig/{path}' if kind == 'shared' else '/dev/null'
    out = git(['diff', '--no-index', '--full-index', before, f'real/{path}'], kit, os.path.dirname(kit)).stdout
    out = out.replace(f'a/orig/{path}', f'a/{path}').replace(f'b/real/{path}', f'b/{path}').replace(f'a/real/{path}', f'a/{path}')
    if kind == 'shared':
        with open(os.path.join(diffs, path.replace('/', '_') + '.diff'), 'w', encoding='utf-8') as handle:
            handle.write(out)
    parts.append(out)
    checks.append(git(['diff', '--no-index', '--check', before, f'real/{path}'], kit, os.path.dirname(kit)).stdout)
with open(os.path.join(diffs, f'{name}.patch'), 'w', encoding='utf-8') as handle:
    handle.write(''.join(parts))

check = os.path.join(kit, 'applycheck')
shutil.rmtree(check, ignore_errors=True)
os.makedirs(check)
for kind, path in files:
    if kind == 'shared':
        os.makedirs(os.path.dirname(os.path.join(check, path)), exist_ok=True)
        shutil.copyfile(os.path.join(kit, 'orig', path), os.path.join(check, path))
applied = git(['apply', '-p1', '--verbose', os.path.join(diffs, f'{name}.patch')], check, kit)
lines = [f'patch: diffs/{name}.patch ({len(files)} files)', (applied.stdout + applied.stderr).rstrip(), f'git apply exit {applied.returncode}']
differ = 0
for kind, path in files:
    target = os.path.join(check, path)
    real = os.path.join(kit, 'real', path)
    same = os.path.isfile(real) and os.path.isfile(target) and filecmp.cmp(target, real, shallow=False)
    differ += 0 if same else 1
    lines.append(f"{'same as real/' if same else 'DIFFERS from real/'}: {path}")
lines.append(f'applycheck: {len(files)} files, {differ} differ')
shutil.rmtree(check)
with open(os.path.join(kit, 'logs', 'applycheck.log'), 'w', encoding='utf-8') as handle:
    handle.write('\n'.join(lines) + '\n')
whitespace = ''.join(checks)
with open(os.path.join(kit, 'logs', 'diffcheck.log'), 'w', encoding='utf-8') as handle:
    handle.write(whitespace)
print(lines[-1])
print(f"diff --check: {'clean' if whitespace == '' else 'WHITESPACE ERRORS'}")
sys.exit(0 if differ == 0 and applied.returncode == 0 and whitespace == '' else 1)
