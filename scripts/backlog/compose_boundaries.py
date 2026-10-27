"""Compose the committed boundaries document from the planning files.

Usage: python3 -I compose_boundaries.py CTX_DIR OUT.md

It joins the controller's boundaries for phases 3 to 6, the plan-writer rules
(appendix A) and the controller rulings R1 to R82 (appendix B), and rewords
references to planning-session files that are not in the repository.
"""
from __future__ import annotations

import os
import re
import sys

ctx, out = sys.argv[1], sys.argv[2]
boundaries = open(os.path.join(ctx, "boundaries-p3-p6.md"), encoding="utf-8").read()
rules = open(os.path.join(ctx, "writer-rules-p3-p6.md"), encoding="utf-8").read()
rulings = open(os.path.join(ctx, "rulings.md"), encoding="utf-8").read()

boundaries = re.sub(
    r"^Read before writing, in this order:.*$",
    "The plan writers also read the phase maps (requirements, current code and gaps per phase), the handoff ledgers of plans 1A to 1D and P2, and the controller rulings (appendix B). The maps and ledgers were planning-session working files and are not in the repository.",
    boundaries, count=1, flags=re.M)
boundaries = boundaries.replace("| Plan | File (written first to the scratchpad `plans/` folder) | Title |", "| Plan | File in `docs/superpowers/plans/` | Title |")
boundaries = boundaries.replace("(`map-p5-travel.md` section 4)", "(the phase 5 map's candidate tasks)")
boundaries = boundaries.replace("# Phases 3 to 6: plan boundaries (controller's split, binding for the plan writers)",
                                "# Phases 3 to 6: plan boundaries and controller calls")
rules = rules.replace("# Rules for every phase 3 to 6 plan writer (controller's rules, binding)", "## Appendix A: rules for every phase 3 to 6 plan writer")
rules = re.sub(r"^## ", "### ", rules, flags=re.M).replace("### Appendix A:", "## Appendix A:")
rules = rules.replace("The controller's split of the work into plans is in `boundaries-p3-p6.md` beside this file; read it first.", "The controller's split of the work into plans is the body of this document.")
rules = re.sub(r"The handoff ledgers beside this file \([^)]*\) list them", "The handoff ledgers (planning-session files) listed them", rules)
rules = rules.replace("(`rulings.md` beside this file)", "(appendix B)")
rulings_lines = [l.replace("Ruling: ", "- ", 1).replace(" — ", "; ").replace("—", ", ") for l in rulings.splitlines() if l.startswith("Ruling: ")]
doc = boundaries.rstrip() + "\n\n" + rules.strip() + "\n\n## Appendix B: controller rulings R1 to R82\n\nRecorded in the phase 1 execution ledger as each was made; every plan cites them by number.\n\n" + "\n".join(rulings_lines) + "\n"
doc = re.sub(r"[ \t]+$", "", doc, flags=re.M)
assert "—" not in doc, "em dash in the composed document"
open(out, "w", encoding="utf-8").write(doc)
print(f"wrote {out}: {len(doc.encode())} bytes, {len(rulings_lines)} rulings")
