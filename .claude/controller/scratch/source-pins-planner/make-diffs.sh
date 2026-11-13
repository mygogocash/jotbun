#!/bin/zsh
# The planner's: writes diffs/<path with / as _>.diff for each changed file, orig/<p> to real/<p>,
# with repo paths (a/<p>, b/<p>) and full blob ids. GIT_CEILING_DIRECTORIES keeps git from finding
# the repository this folder sits in; --no-index needs none.
kit=${0:A:h}
export GIT_CEILING_DIRECTORIES=${kit:h}
cd $kit || exit 1
mkdir -p diffs
for p in apps/edge/test/workers/transaction-source.test.ts apps/app/src/storage/diaryRepository.test.ts; do
  /usr/bin/git diff --no-index --full-index --no-color orig/$p real/$p | sed -e "s#a/orig/$p#a/$p#g" -e "s#b/real/$p#b/$p#g" > diffs/${p//\//_}.diff
  print "wrote diffs/${p//\//_}.diff"
done
