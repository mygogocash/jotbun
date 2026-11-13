#!/bin/zsh
# Places P3-T9's files into a tree, as files.txt lists them.
# Usage: place.sh red <tree>     column 2 says: stub = stubs/, real = real/, base = orig/ (the base's own text); `later` lines untouched
#        place.sh green <tree>   real/ for every line but the receipts
#        place.sh receipt <tree> real/ for the `later` line (this task's receipt)
# Prints one line per file placed, then a count. Exits 1 on an unknown stage,
# a missing tree or a missing kit file. (zsh: never name a variable `path`.)
kit=${0:A:h}
stage=$1
tree=$2
if [[ -z "$tree" || ! -d "$tree" ]]; then print "no tree: $tree"; exit 1; fi
case $stage in red|green|receipt) ;; *) print "unknown stage: $stage"; exit 1 ;; esac
placed=0
while read -r kind atred file; do
  [[ -z "$kind" || "$kind" == \#* ]] && continue
  from=''
  case $stage in
    red) [[ "$atred" == stub ]] && from=stubs; [[ "$atred" == real ]] && from=real; [[ "$atred" == base ]] && from=orig ;;
    green) [[ "$atred" != later ]] && from=real ;;
    receipt) [[ "$atred" == later ]] && from=real ;;
  esac
  [[ -z "$from" ]] && continue
  if [[ ! -f "$kit/$from/$file" ]]; then print "missing kit file: $from/$file"; exit 1; fi
  mkdir -p "$tree/${file:h}" && cp "$kit/$from/$file" "$tree/$file" || exit 1
  print "$stage: $from/$file"
  placed=$((placed + 1))
done < "$kit/files.txt"
print "$stage: $placed files placed"
