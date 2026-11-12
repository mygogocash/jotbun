#!/bin/zsh
# Places the 1D-T11 fix round's files into a tree, as files.txt lists them.
# Usage: place.sh red <tree>      real/ for the `real` lines; `base` and `later` lines untouched
#        place.sh green <tree>    real/ for every line but the receipts (`later`)
#        place.sh receipts <tree> real/ for the two receipts only
#        place.sh base <tree>     orig/ for every M line, and removes every A line (the planner's own reset; never in a worktree)
# Prints one line per file placed, then a count. Exits 1 on an unknown stage,
# a missing tree or a missing kit file. (zsh: never name a variable `path`.)
kit=${0:A:h}
stage=$1
tree=$2
if [[ -z "$tree" || ! -d "$tree" ]]; then print "no tree: $tree"; exit 1; fi
case $stage in red|green|receipts|base) ;; *) print "unknown stage: $stage"; exit 1 ;; esac
placed=0
while read -r kind atred file; do
  [[ -z "$kind" || "$kind" == \#* ]] && continue
  from=''
  case $stage in
    red) [[ "$atred" == real ]] && from=real ;;
    green) [[ "$atred" != later ]] && from=real ;;
    receipts) [[ "$atred" == later ]] && from=real ;;
    base)
      if [[ "$kind" == A ]]; then rm -f "$tree/$file" && print "base: removed $file"; placed=$((placed + 1)); continue; fi
      from=orig ;;
  esac
  [[ -z "$from" ]] && continue
  if [[ ! -f "$kit/$from/$file" ]]; then print "missing kit file: $from/$file"; exit 1; fi
  mkdir -p "$tree/${file:h}" && cp "$kit/$from/$file" "$tree/$file" || exit 1
  print "$stage: $from/$file"
  placed=$((placed + 1))
done < "$kit/files.txt"
print "$stage: $placed files placed"
