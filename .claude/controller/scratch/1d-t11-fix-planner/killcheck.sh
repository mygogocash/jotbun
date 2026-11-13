#!/bin/zsh
# Checks that every failing case of every kill is an AssertionError, not only the first.
# Usage: killcheck.sh <mutant log folder>   (one <id>.log per mutant, as mutants.py writes them)
# Prints one line per log that is not clean, then "killcheck: ok (<n> logs)" or "killcheck: FAILED".
# A clean log: as many AssertionError lines as failing cases (lines with a cross), no other
# error class at the start of a line, and no unhandled error.
logs=$1
if [[ -z "$logs" || ! -d "$logs" ]]; then print "no log folder: $logs"; exit 1; fi
failed=0
count=0
for log in "$logs"/*.log; do
  count=$((count + 1))
  fails=$(grep -cE '^ +× ' "$log")
  asserts=$(grep -c '^AssertionError' "$log")
  others=$(grep -cE '^(TypeError|ReferenceError|SyntaxError|RangeError|Error):' "$log")
  unhandled=$(grep -c 'Unhandled' "$log")
  if [[ "$fails" -eq 0 || "$fails" -ne "$asserts" || "$others" -ne 0 || "$unhandled" -ne 0 ]]; then
    print "not clean: ${log:t} (failing cases $fails, assertions $asserts, other errors $others, unhandled $unhandled)"
    failed=1
  fi
done
(( failed )) && { print "killcheck: FAILED"; exit 1; }
print "killcheck: ok ($count logs)"
