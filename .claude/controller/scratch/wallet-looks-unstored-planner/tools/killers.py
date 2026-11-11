#!/usr/bin/env python3
"""Lists, for each mutant log in a folder, every failing case (file, then case order).

Usage: python3 -I killers.py <mutant-logs dir>
"""
import os
import re
import sys

FILES = ['src/wallet/looks/WalletLooks.render.test.tsx', 'src/wallet/card/WalletCard.render.test.tsx', 'src/wallet/testing/walletHarness.render.test.tsx']
FAILED = re.compile(r'^\s*×\s+(\S+)\s+>\s+(.+?)\s+\d+ms\s*$', re.M)


def order(name):
    match = re.match(r'([A-Z]+)(\d+)', name)
    return (match.group(1), int(match.group(2))) if match else (name, 0)


def main():
    folder = sys.argv[1]
    for log in sorted(os.listdir(folder), key=lambda name: order(name[:-4])):
        with open(os.path.join(folder, log), encoding='utf-8') as handle:
            cases = FAILED.findall(handle.read())
        print(log[:-4])
        for file in FILES:
            for at, name in cases:
                if at == file:
                    print(f'  {os.path.basename(file)}: {name}')


if __name__ == '__main__':
    main()
