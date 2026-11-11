#!/bin/bash
# Planner proof for n5 (a what-if, not a mutant): the 1B-T11 review's R4 turns pruneExports into a const function
# expression, which is not hoisted. With alarm-hardening's jobs.ts (each entry calls its function when it runs) the
# focused file still passes; with the base's jobs.ts (the arrays read the imports at load time) the prunes throw.
P=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/alarm-hardening-planner
E="$P/tree/apps/edge"
X=src/vault/files/exports.ts
cp "$E/$X" "$P/proof/exports.ts.keep"
python3 -I - "$E/$X" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
old = 'export function pruneExports(c: FileContext): void {\n'
assert s.count(old) == 1
open(p, 'w').write(s.replace(old, 'export const pruneExports = function (c: FileContext): void {\n'))
PY
"$P/run-focused.sh" "$P/proof/whatif-n5-real.log" test/workers/files-alarm.test.ts; echo "real jobs.ts exit $?"
cp "$P/orig/src/vault/files/jobs.ts" "$E/src/vault/files/jobs.ts"
"$P/run-focused.sh" "$P/proof/whatif-n5-base-jobs.log" test/workers/files-alarm.test.ts; echo "base jobs.ts exit $?"
cp "$P/real/src/vault/files/jobs.ts" "$E/src/vault/files/jobs.ts"
cp "$P/proof/exports.ts.keep" "$E/$X"
cmp "$E/$X" "$P/proof/exports.ts.keep" && cmp "$E/src/vault/files/jobs.ts" "$P/real/src/vault/files/jobs.ts" && echo "restored"
rm "$P/proof/exports.ts.keep"
