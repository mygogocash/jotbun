"""Resolve cross-plan capability ids (for example P3:slip-read) into task ids.

Usage: python3 -I resolve_caps.py OUT_DIR PLAN.md [PLAN.md ...]

Each owning plan marks the task that delivers a capability with a line
"**Delivers:** P3:slip-read" under its "### Task P3-Tn: ..." heading.
The script maps every capability to its delivering task, checks that each
capability in the boundaries list is delivered exactly once, and rewrites
every other mention of a capability id as "P3-Tn (P3:slip-read)". Delivers
lines are left as they are. Patched copies go to OUT_DIR; a report is
printed. Nothing is edited in place.
"""
from __future__ import annotations

import os
import re
import sys

CAPABILITIES = [
    "P3:source", "P3:ai-results", "P3:ai-gate", "P3:slip-read", "P3:llm-analytics", "P3:slip-qr",
    "P4:catalog-db", "P4:push", "P4:slips-route", "P4:slip-drafts", "P4:inbox", "P4:scan-route",
    "P5:currency", "P5:trips",
    "P3:ai-area", "P4:slips-area", "P5:travel-area", "P6B:deletion-code", "P3:tray-photo", "P4:slip-client", "P3:qr-native", "P6A:native-ids",
    "P6C:environments", "P6C:association-files", "P6C:store-listings",
]
CAP_RE = re.compile(r"\b(P3|P4|P5|P6A|P6B|P6C):([a-z][a-z0-9-]*[a-z0-9])\b")
TASK_RE = re.compile(r"^### Task (P3|P4|P5|P6A|P6B|P6C)-(T\d+[a-z]?)\b")
DELIVERS_RE = re.compile(r"^\*\*Delivers:\*\*(.*)$")


def main() -> int:
    out_dir, plans = sys.argv[1], sys.argv[2:]
    os.makedirs(out_dir, exist_ok=True)
    delivered: dict[str, list[str]] = {}
    texts: dict[str, str] = {}
    for path in plans:
        text = open(path, encoding="utf-8").read()
        texts[path] = text
        current = None
        for line in text.splitlines():
            m = TASK_RE.match(line)
            if m:
                current = f"{m.group(1)}-{m.group(2)}"
                continue
            d = DELIVERS_RE.match(line.strip())
            if d and current:
                for cap in CAP_RE.finditer(d.group(1)):
                    delivered.setdefault(cap.group(0), []).append(current)
    problems = 0
    for cap in CAPABILITIES:
        owners = delivered.get(cap, [])
        if len(owners) != 1:
            problems += 1
            print(f"PROBLEM {cap}: delivered by {owners or 'no task'}")
        else:
            print(f"ok {cap} -> {owners[0]}")
    for cap in sorted(set(delivered) - set(CAPABILITIES)):
        print(f"NOTE {cap} is delivered but not in the boundaries list: {delivered[cap]}")
    for path, text in texts.items():
        unresolved = set()
        replaced = 0
        out_lines = []
        for line in text.splitlines(keepends=True):
            if DELIVERS_RE.match(line.strip()):
                out_lines.append(line)
                continue

            def swap(m: re.Match) -> str:
                nonlocal replaced
                cap = m.group(0)
                owners = delivered.get(cap, [])
                if len(owners) == 1:
                    # Already resolved ("P3-T5 (P3:slip-read)"): leave it, so a second run changes nothing.
                    if line[:m.start()].endswith((f"{owners[0]} (", f"{owners[0]}, ")):
                        return cap
                    replaced += 1
                    if line[:m.start()].endswith("(") and line[m.end():].startswith(")"):
                        return f"{owners[0]}, {cap}"
                    return f"{owners[0]} ({cap})"
                unresolved.add(cap)
                return cap

            out_lines.append(CAP_RE.sub(swap, line))
        target = os.path.join(out_dir, os.path.basename(path))
        open(target, "w", encoding="utf-8").write("".join(out_lines))
        print(f"{os.path.basename(path)}: {replaced} mentions resolved; unresolved: {sorted(unresolved) or 'none'}")
        problems += len(unresolved)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
