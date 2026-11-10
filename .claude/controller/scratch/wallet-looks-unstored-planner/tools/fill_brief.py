#!/usr/bin/env python3
"""Builds the brief from tools/brief.template.md: each @@FILE:<path>@@ line is
replaced by that kit file's text, byte for byte (paths under the planner's
folder). Then checks that every inserted file appears in the brief whole, and
that no inserted file holds a code fence that would end its block early.

Usage: python3 -I fill_brief.py <planner folder> <brief path>
"""
import re
import sys

MARK = re.compile(r'^@@FILE:(.+?)@@\n', re.M)


def main():
    folder, out = sys.argv[1], sys.argv[2]
    with open(f'{folder}/tools/brief.template.md', encoding='utf-8') as handle:
        template = handle.read()
    inserted = {}

    def fill(match):
        rel = match.group(1)
        with open(f'{folder}/{rel}', encoding='utf-8') as handle:
            text = handle.read()
        if not text.endswith('\n'):
            sys.exit(f'{rel} does not end with a newline')
        if '```' in text:
            sys.exit(f'{rel} holds a code fence')
        inserted[rel] = text
        return text

    brief = MARK.sub(fill, template)
    if '@@FILE:' in brief:
        sys.exit('a placeholder was left unfilled')
    for rel, text in inserted.items():
        if text not in brief:
            sys.exit(f'{rel} is not in the brief whole')
    with open(out, 'w', encoding='utf-8') as handle:
        handle.write(brief)
    print(f'wrote {out}: {len(inserted)} files inserted byte for byte ({", ".join(inserted)})')


if __name__ == '__main__':
    main()
