#!/usr/bin/env python3
"""Planner tool: composes briefs/1B-T13.md from brief-skeleton.md and the brief-*.md fragments, then fills the
{{NAME}} values from brief-values.json. Prints any placeholder left unfilled. Usage: python3 -I assemble-brief.py"""
import json, pathlib, re
P = pathlib.Path('/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1b-t13-planner')
OUT = pathlib.Path('/Users/kunanonjarat/Developer/jotbun/.claude/controller/briefs/1B-T13.md')
s = (P / 'brief-skeleton.md').read_text(encoding='utf-8')
for name, frag in (('RULINGS', 'brief-rulings.md'), ('NOTES_TABLE', 'brief-notes.md'), ('STEPS', 'brief-steps.md')):
    s = s.replace('{{' + name + '}}', (P / frag).read_text(encoding='utf-8').rstrip('\n'))
s = s.replace('{{MUTANT_TABLE}}', (P / 'brief-mutants.md').read_text(encoding='utf-8').rstrip('\n'))
s = s.rstrip('\n') + '\n\n---\n\n' + (P / 'brief-appendix-a.md').read_text(encoding='utf-8').rstrip('\n') + '\n\n' + (P / 'brief-receipt.md').read_text(encoding='utf-8').rstrip('\n') + '\n'
if (P / 'brief-appendix-d.md').exists():
    s += '\n' + (P / 'brief-appendix-d.md').read_text(encoding='utf-8').rstrip('\n') + '\n'
values = json.loads((P / 'brief-values.json').read_text(encoding='utf-8')) if (P / 'brief-values.json').exists() else {}
for key, value in values.items():
    s = s.replace('{{' + key + '}}', str(value))
OUT.write_text(s, encoding='utf-8')
left = sorted(set(re.findall(r'\{\{([A-Z0-9_]+)\}\}', s)))
print(f'{OUT}: {len(s.splitlines())} lines; unfilled {left}')
