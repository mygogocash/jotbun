#!/usr/bin/env python3
"""Fills the brief's placeholders: the steps, the summaries and the appendices from PL/final.

Usage: python3 -I assemble_brief.py <brief.md> <summaries.json>
"""
import json
import re
import sys
from pathlib import Path

PL = Path('/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t6-planner')
brief_path = Path(sys.argv[1])
values = json.loads(Path(sys.argv[2]).read_text())

brief = brief_path.read_text()
steps = (PL / 'tools/steps.md').read_text()
brief = brief.replace('@@STEPS@@\n', steps)
for name in ['posthogOptions.ts', 'analyticsServer.ts', 'consentStorage.ts', 'posthogClient.ts', 'appAnalytics.ts', 'AnalyticsUpkeep.tsx']:
    code = (PL / 'final/apps/app/src/analytics' / name).read_text().rstrip('\n')
    brief = brief.replace(f'@@{name}@@', code)

controller = (PL / 'final/apps/app/src/analytics/controller.ts').read_text().split('\n')
def block(start_pattern, end_pattern):
    start = next(i for i, line in enumerate(controller) if re.search(start_pattern, line))
    end = next(i for i in range(start, len(controller)) if re.search(end_pattern, controller[i]))
    return '\n'.join(controller[start:end + 1])
excerpt = '\n// ...\n'.join([
    block(r'^export interface Analytics \{', r'answer\(answer: ConsentAnswer\)'),
    block(r'^/\*\* answer\(\'yes\'\) reached', r'^}$'),
    block(r"if \(choice === 'no'\) \{", r'^        return;$'),
    block(r'// Checked when the queue reaches this yes', r'AccountChangedError\(\);'),
])
brief = brief.replace('@@controller-excerpt@@', excerpt)
for key, value in values.items():
    brief = brief.replace(f'@@{key}@@', value)
left = re.findall(r'@@[A-Za-z_.-]+@@', brief)
if left:
    sys.exit(f'placeholders left: {left}')
brief_path.write_text(brief)
print(f'{brief_path}: {len(brief.splitlines())} lines')
