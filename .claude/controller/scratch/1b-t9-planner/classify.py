#!/usr/bin/env python3
"""For each mutant log, the kinds of the failing cases' first error lines."""
import collections
import os
import re
import sys

logs = sys.argv[1]
for name in sorted(os.listdir(logs), key=lambda n: int(re.sub(r'\D', '', n) or 0)):
    text = open(os.path.join(logs, name)).read()
    kinds = collections.Counter()
    for line in text.splitlines():
        m = re.match(r'^\s+→ (.*)$', line)
        if not m:
            continue
        message = m.group(1)
        if message.startswith('Test timed out'):
            kinds['timeout'] += 1
        elif re.match(r'^(expected|Expected|promise|\[)', message) or 'to deeply equal' in message or 'to be ' in message or 'to match' in message or 'toBe' in message:
            kinds['assertion'] += 1
        else:
            kinds[f'other: {message[:70]}'] += 1
    print(name.replace('.log', ''), dict(kinds))
