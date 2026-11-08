#!/usr/bin/env python3
"""Print the last N steps of a subagent transcript: its text, tool calls and (truncated) tool results.
Usage: python3 -I tail_transcript.py <agent-XXXX.jsonl> [N=60] [result_chars=600]"""
import json, sys
path = sys.argv[1]; n = int(sys.argv[2]) if len(sys.argv) > 2 else 60; rc = int(sys.argv[3]) if len(sys.argv) > 3 else 600
steps = []
for line in open(path):
    try: d = json.loads(line)
    except Exception: continue
    m = d.get('message') if isinstance(d.get('message'), dict) else {}
    c = m.get('content')
    if not isinstance(c, list): continue
    ts = d.get('timestamp', '')[11:19]
    for x in c:
        t = x.get('type')
        if t == 'text' and x['text'].strip(): steps.append(f"[{ts}] SAY: {x['text'].strip()}")
        elif t == 'tool_use': steps.append(f"[{ts}] CALL {x.get('name')}: {json.dumps(x.get('input'))[:1500]}")
        elif t == 'tool_result':
            r = x.get('content')
            if isinstance(r, list): r = ' '.join(y.get('text', '') for y in r if isinstance(y, dict))
            steps.append(f"[{ts}] RESULT: {str(r)[:rc]}")
for s in steps[-n:]: print(s); print('-' * 40)
