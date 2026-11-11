#!/usr/bin/env python3
"""Probe for ruling P6: runs the hook's mutants against Home's own suite
(HomeScreen.render.test.tsx) instead of homeData.render.test.tsx, to show
which ones Home's suite alone would let through. Usage:
python3 -I probe_home_gap.py <worktree root> <log dir> [ids...]"""
import importlib.util
import os
import sys

here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('mutants', os.path.join(here, 'mutants.py'))
mutants = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mutants)
wanted = set(sys.argv[3:])
mutants.MUTANTS = [(i, d, f, mutants.HOME, e) for (i, d, f, c, e) in mutants.MUTANTS if c is mutants.HOOK and (not wanted or i in wanted)]
sys.argv = sys.argv[:3]
try:
    mutants.main()
except SystemExit:
    pass
