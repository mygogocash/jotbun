#!/usr/bin/env python3
"""Lists, for each mutant log in a folder, every failing case (the Node file's, then the render file's).

Usage: python3 -I killers.py <mutant-logs dir>
"""
import os
import re
import sys

NODE_FAILED = re.compile(r'^✖ (.+?) \([\d.]+ms\)$', re.M)
RENDER_FAILED = re.compile(r'^\s*×\s+\S+\s+>\s+(.+?)\s+\d+ms\s*$', re.M)
ORDER = ['H', 'B', 'O', 'R', 'K', 'X', 'D']


def order(name):
    match = re.match(r'([A-Z]+)(\d+)', name)
    return (ORDER.index(match.group(1)), int(match.group(2))) if match else (len(ORDER), 0)


def main():
    folder = sys.argv[1]
    for log in sorted(os.listdir(folder), key=lambda name: order(name[:-4])):
        with open(os.path.join(folder, log), encoding='utf-8') as handle:
            text = handle.read()
        print(log[:-4])
        for name in dict.fromkeys(NODE_FAILED.findall(text)):
            print(f'  trayGesture.test.ts: {name}')
        for name in dict.fromkeys(RENDER_FAILED.findall(text)):
            print(f'  Tray.render.test.tsx: {name}')


if __name__ == '__main__':
    main()
