#!/usr/bin/env python3
"""Prints the commit message exactly as the brief's Step 7.4 gives it: the first
fenced block after the line that starts "4. Write the message".

Usage: python3 -I commit_message.py <brief path>
"""
import sys


def main():
    lines = open(sys.argv[1], encoding='utf-8').read().split('\n')
    start = next(index for index, line in enumerate(lines) if line.startswith('4. Write the message'))
    opening = next(index for index in range(start, len(lines)) if lines[index] == '```')
    closing = next(index for index in range(opening + 1, len(lines)) if lines[index] == '```')
    sys.stdout.write('\n'.join(lines[opening + 1:closing]) + '\n')


if __name__ == '__main__':
    main()
