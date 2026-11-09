#!/bin/bash
# Before dispatching an implementer: is the planner's kit intact, and does its base still hold at the head?
# Usage: bash check_kit.sh <kit-dir> [--head <ref>] [--rebase-out <dir>]
#   1. Checks the kit's own SHA256SUMS from the kit folder, without *.log lines (logs are gitignored,
#      so they are lost when a kit travels in a state commit).
#   2. If the kit has SHA256SUMS.base (paths relative to the worktree), checks it against the head.
#   3. Compares every file in the kit's orig/ or base/ folder with the head's copy. A path is tried as
#      repo-relative, then under apps/edge/, apps/app/ and apps/api/.
#   4. For a differing file with a per-file diff (diffs/<path with / as _>.diff), dry-runs it on the head's
#      copy. With --rebase-out, writes each patched file at its repo path there, plus a SHA256SUMS to check
#      from the worktree, so the implementer copies files instead of hand-applying hunks.
# Exit 0 when the kit is intact and every base file matches or patches cleanly.
set -u
kit=${1:?kit dir}; shift
ref=origin/claude/p1a-vault-core; out=""
while [ $# -gt 0 ]; do case $1 in --head) ref=$2; shift 2;; --rebase-out) out=$2; shift 2;; *) echo "unknown $1"; exit 2;; esac; done
ROOT=/Users/kunanonjarat/Developer/jotbun
G() { /usr/bin/git -C "$ROOT" "$@"; }
G fetch -q origin 2>/dev/null
echo "kit $(basename "$kit") against $ref ($(G rev-parse --short "$ref"))"
tmp=$(mktemp -d "$ROOT/.claude/controller/scratch/.check-kit.XXXX"); trap 'rm -rf "$tmp"' EXIT
bad=0

if [ -f "$kit/SHA256SUMS" ]; then
  logs=$(grep -c '\.log$' "$kit/SHA256SUMS")
  res=$(cd "$kit" && grep -v '\.log$' SHA256SUMS | shasum -a 256 -c - 2>&1)
  ok=$(printf '%s\n' "$res" | grep -c ': OK$'); nok=$(printf '%s\n' "$res" | grep -c ': FAILED')
  echo "kit sums: $ok OK, $nok not OK ($logs log lines skipped)"
  [ "$nok" = 0 ] || { printf '%s\n' "$res" | grep ': FAILED' | head -10; bad=1; }
else echo "kit sums: no SHA256SUMS"; bad=1; fi

if [ -f "$kit/SHA256SUMS.base" ]; then
  awk '{print $2}' "$kit/SHA256SUMS.base" | while read -r p; do mkdir -p "$tmp/head/$(dirname "$p")"; G show "$ref:$p" > "$tmp/head/$p" 2>/dev/null; done
  res=$(cd "$tmp/head" && shasum -a 256 -c "$kit/SHA256SUMS.base" 2>&1)
  echo "SHA256SUMS.base at head: $(printf '%s\n' "$res" | grep -c ': OK$') OK, $(printf '%s\n' "$res" | grep -c ': FAILED') differ"
  printf '%s\n' "$res" | grep ': FAILED' | sed 's/^/  /'
fi

# orig/ wins when a kit has both: some planners keep a whole proof tree (with dist/ and .wrangler/) in base/.
for b in orig base; do [ -d "$kit/$b" ] || continue; [ "$b" = base ] && [ -d "$kit/orig" ] && continue
  same=0; diff_list=""
  while read -r f; do
    p=""; for pre in "" apps/edge/ apps/app/ apps/api/; do G cat-file -e "$ref:$pre$f" 2>/dev/null && { p=$pre$f; break; }; done
    if [ -z "$p" ]; then echo "  NOT AT HEAD $f"; bad=1; continue; fi
    if G show "$ref:$p" | cmp -s - "$kit/$b/$f"; then same=$((same+1)); continue; fi
    d="$kit/diffs/$(echo "$f" | tr / _).diff"
    if [ ! -f "$d" ]; then echo "  DIFFERS $p (no per-file diff: the brief's fallback applies)"; bad=1; continue; fi
    G show "$ref:$p" > "$tmp/cur"
    if patch -s -o "$tmp/new" "$tmp/cur" < "$d" >/dev/null 2>&1 && [ ! -e "$tmp/new.rej" ]; then
      echo "  DIFFERS $p: its diff applies cleanly to the head's copy"
      if [ -n "$out" ]; then mkdir -p "$out/$(dirname "$p")"; cp "$tmp/new" "$out/$p"; diff_list="$diff_list $p"; fi
    else echo "  DIFFERS $p: its diff does NOT apply; send the brief back to its planner"; bad=1; fi
    rm -f "$tmp/new" "$tmp/new.rej" "$tmp/new.orig"
  done < <(cd "$kit/$b" && find . -type f | sed 's|^\./||' | sort)
  echo "$b/: $same files identical at the head"
  if [ -n "$out" ] && [ -n "$diff_list" ]; then (cd "$out" && shasum -a 256 $diff_list > SHA256SUMS); echo "rebased copies in $out (SHA256SUMS: check from the worktree)"; fi
done
exit $bad
