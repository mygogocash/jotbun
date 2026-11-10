#!/bin/bash
# Writes diffs/<path with / as _>.diff for each changed file: orig/ (fc78376) to real/, as git writes it
# (a/ and b/ prefixes, the blobs' index line), so `patch -p1` or check_kit.sh applies it to fc78376's copy.
set -eu
K=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/tray-hardening-fix2-planner
cd "$K"
mkdir -p diffs
for rel in apps/app/src/wallet/tray/Tray.tsx apps/app/src/wallet/tray/Tray.render.test.tsx docs/implementation/receipts/tray-hardening.md; do
  out="diffs/$(echo "$rel" | tr / _).diff"
  # --no-index outside any repository: the ceiling keeps git from finding the main checkout above the kit.
  GIT_CEILING_DIRECTORIES="$K" /usr/bin/git diff --no-index --no-color "orig/$rel" "real/$rel" \
    | sed -e "s|a/orig/$rel|a/$rel|g" -e "s|b/real/$rel|b/$rel|g" > "$out" || true
  echo "$out: $(grep -c '^@@' "$out") hunks"
done
