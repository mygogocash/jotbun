"""Writes diffs/<path with / as _>.diff (orig/ to real/) for each modified file in files.txt.

Run from the kit folder: python3 -I tools/make_diffs.py
"""
import difflib
import pathlib

KIT = pathlib.Path(__file__).resolve().parent.parent
out = KIT / "diffs"
out.mkdir(exist_ok=True)
for line in (KIT / "files.txt").read_text().splitlines():
    kind, rel = line.split(" ", 1)
    if kind != "M":
        continue
    before = (KIT / "orig" / rel).read_text().splitlines(keepends=True)
    after = (KIT / "real" / rel).read_text().splitlines(keepends=True)
    diff = "".join(difflib.unified_diff(before, after, fromfile=f"a/{rel}", tofile=f"b/{rel}"))
    (out / (rel.replace("/", "_") + ".diff")).write_text(diff)
    print(f"diff {rel}: {sum(1 for d in diff.splitlines() if d.startswith('+') and not d.startswith('+++'))} added, {sum(1 for d in diff.splitlines() if d.startswith('-') and not d.startswith('---'))} removed")
