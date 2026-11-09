#!/usr/bin/env python3
"""Builds the P4-T13 brief. Usage: python3 -I fill_brief.py <planner folder> <template> <out>.

Each line `@@FILE <path under the planner folder>@@` in the template becomes that file, byte for
byte, in a ```ts fence. It stops if a file holds a fence, lacks its final newline, or if any
placeholder is left; then it reads the brief back and checks every embedded block against its file.
"""
import re
import sys

PLACEHOLDER = re.compile(r'^@@FILE (\S+)@@$', re.M)


def main():
    folder, template, out = sys.argv[1:4]
    text = open(template, encoding='utf-8').read()
    embedded = []

    def fill(match):
        rel = match.group(1)
        body = open(f'{folder}/{rel}', encoding='utf-8').read()
        if '```' in body or not body.endswith('\n'):
            sys.exit(f'{rel}: holds a fence or lacks its final newline')
        embedded.append((rel, body))
        return f'```ts\n{body}```'

    brief = PLACEHOLDER.sub(fill, text)
    if '@@FILE' in brief:
        sys.exit('a placeholder is left')
    for bad in ('—', '–'):
        if bad in brief:
            sys.exit(f'the brief holds a dash: {bad!r}')
    with open(out, 'w', encoding='utf-8') as handle:
        handle.write(brief)
    written = open(out, encoding='utf-8').read()
    for rel, body in embedded:
        if f'```ts\n{body}```' not in written:
            sys.exit(f'{rel}: not embedded byte for byte')
    print(f'{out}: {len(embedded)} files embedded, {len(written.encode("utf-8"))} bytes')


if __name__ == '__main__':
    main()
