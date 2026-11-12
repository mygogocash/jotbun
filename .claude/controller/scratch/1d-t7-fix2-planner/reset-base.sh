#!/bin/zsh
# Planner only: puts the planner's scratch tree back at the base. Each modified
# file from orig/, each added file removed. Refuses any tree but the kit's own.
kit=${0:A:h}
tree=$1
if [[ "$tree" != "$kit/tree" ]]; then print "reset-base.sh only resets $kit/tree"; exit 1; fi
while read -r kind atred file; do
  [[ -z "$kind" || "$kind" == \#* ]] && continue
  if [[ "$kind" == M ]]; then cp "$kit/orig/$file" "$tree/$file" || exit 1; else rm -f "$tree/$file"; fi
done < "$kit/files.txt"
print "base: reset"
