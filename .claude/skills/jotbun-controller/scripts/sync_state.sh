#!/bin/bash
# Copy the live controller state into the integration branch and push it as a housekeeping commit,
# so another machine or session can take over from GitHub alone.
# Usage: sync_state.sh "<commit summary line>" [planner-kit ...]
#   planner-kit: a folder name under .claude/controller/scratch whose brief is not yet built,
#   e.g. 1b-t6-planner. Only the files its SHA256SUMS cover (plus its SHA256SUMS* and scripts) are kept.
# Live state: the main checkout's untracked .claude/controller and .claude/skills. Scratch proof trees stay out.
set -eu
msg=$1; shift
ROOT=/Users/kunanonjarat/Developer/jotbun
C=$ROOT/.claude/controller
I=$ROOT/.claude/worktrees/p1a-vault-core
# Check each kit at its source before copying anything: a kit still being written (a planner's rerun)
# would otherwise stop the script halfway and leave copies in the integration worktree.
for kit in "$@"; do
  src=$C/scratch/$kit
  [ -f "$src/SHA256SUMS" ] || { echo "no SHA256SUMS in $src"; exit 1; }
  # Lines inside a nested repository's .git are git's own files: git never tracks them, so they cannot travel (12 Nov).
  bad=$(cd "$src" && grep -v '/\.git/' SHA256SUMS | shasum -a 256 -c - 2>&1 | grep -vc ': OK$' || true)
  [ "$bad" = 0 ] || { echo "$kit: $bad not OK at the source; nothing copied"; exit 1; }
done
cd "$I"
[ -z "$(/usr/bin/git status --short --untracked-files=no)" ] || { echo "integration worktree has tracked changes; stopping"; exit 1; }
/usr/bin/git fetch -q origin claude/p1a-vault-core
/usr/bin/git merge -q --ff-only origin/claude/p1a-vault-core
# Agents' Markdown can end lines with two spaces (hard breaks; a Flash review, 12 Nov), which the whitespace check below
# stops on. Strip them at the source, so each sync copies clean files.
grep -lE '[[:space:]]+$' "$C"/reviews/*.md "$C"/briefs/*.md 2>/dev/null | while IFS= read -r f; do sed -i '' -E 's/[[:space:]]+$//' "$f"; done
rsync -a --exclude scratch --exclude watch_prs.seen --exclude 'backlog/plans' "$C/" "$I/.claude/controller/"
rsync -a --delete --exclude __pycache__ "$ROOT/.claude/skills/" "$I/.claude/skills/"
for kit in "$@"; do
  src=$C/scratch/$kit; dst=$I/.claude/controller/scratch/$kit
  [ -f "$src/SHA256SUMS" ] || { echo "no SHA256SUMS in $src"; exit 1; }
  mkdir -p "$dst"
  # top-level entries named in the checksums, every SHA256SUMS* and any runner script beside them
  for top in $(awk '{print $2}' "$src/SHA256SUMS" | cut -d/ -f1 | sort -u); do cp -R "$src/$top" "$dst/"; done
  # A planner's proof tree can hold its own git repository (P3-T2's applycheck, 12 Nov). Committed as is, it becomes a
  # gitlink with no .gitmodules: the files under it vanish from the kit and the checkout's submodule steps can trip.
  find "$dst" -mindepth 2 -name .git -prune -exec rm -rf {} +
  for f in "$src"/SHA256SUMS* "$src"/*.py "$src"/*.patch "$src"/*.diff "$src"/files-*.txt; do [ -e "$f" ] && cp "$f" "$dst/"; done
  (cd "$dst" && bad=$(grep -v '/\.git/' SHA256SUMS | shasum -a 256 -c - 2>&1 | grep -vc ': OK$' || true); echo "$kit: $bad not OK"; [ "$bad" = 0 ])
done
/usr/bin/git add -A .claude
# A kit's proof logs (*.log) are gitignored, so `add -A` skips them; force-add each kit so its SHA256SUMS still verifies elsewhere.
for kit in "$@"; do /usr/bin/git add -f ".claude/controller/scratch/$kit"; done
if /usr/bin/git diff --cached --quiet; then echo "nothing to sync"; exit 0; fi
# A planner kit can show a merge conflict on purpose (merge/*conflict*); its markers are not a whitespace error (11 Nov).
/usr/bin/git diff --cached --check -- . ":(exclude)*/merge/*conflict*"
/usr/bin/git commit -q -m "$msg" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
/usr/bin/git push -q origin claude/p1a-vault-core
echo "pushed $(/usr/bin/git log --oneline -1 | cat)"
