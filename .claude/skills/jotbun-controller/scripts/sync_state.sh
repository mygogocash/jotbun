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
cd "$I"
[ -z "$(/usr/bin/git status --short --untracked-files=no)" ] || { echo "integration worktree has tracked changes; stopping"; exit 1; }
/usr/bin/git fetch -q origin claude/p1a-vault-core
/usr/bin/git merge -q --ff-only origin/claude/p1a-vault-core
rsync -a --exclude scratch --exclude watch_prs.seen --exclude 'backlog/plans' "$C/" "$I/.claude/controller/"
rsync -a --delete "$ROOT/.claude/skills/" "$I/.claude/skills/"
for kit in "$@"; do
  src=$C/scratch/$kit; dst=$I/.claude/controller/scratch/$kit
  [ -f "$src/SHA256SUMS" ] || { echo "no SHA256SUMS in $src"; exit 1; }
  mkdir -p "$dst"
  # top-level entries named in the checksums, every SHA256SUMS* and any runner script beside them
  for top in $(awk '{print $2}' "$src/SHA256SUMS" | cut -d/ -f1 | sort -u); do cp -R "$src/$top" "$dst/"; done
  for f in "$src"/SHA256SUMS* "$src"/*.py "$src"/*.patch "$src"/*.diff "$src"/files-*.txt; do [ -e "$f" ] && cp "$f" "$dst/"; done
  (cd "$dst" && bad=$(shasum -a 256 -c SHA256SUMS 2>&1 | grep -vc ': OK$' || true); echo "$kit: $bad not OK"; [ "$bad" = 0 ])
done
/usr/bin/git add -A .claude
if /usr/bin/git diff --cached --quiet; then echo "nothing to sync"; exit 0; fi
/usr/bin/git diff --cached --check
/usr/bin/git commit -q -m "$msg" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
/usr/bin/git push -q origin claude/p1a-vault-core
echo "pushed $(/usr/bin/git log --oneline -1 | cat)"
