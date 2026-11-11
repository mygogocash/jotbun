#!/bin/bash
# The fix-download-aborts `wrangler dev` proof. Copies the edge, the API source
# and the packages of <source root> into <out dir> (no node_modules, dist or
# .wrangler), links node_modules from <modules root>, adds the proof entry
# (wrangler/vault-proof.ts as src/roles/vault-proof.ts, named by
# wrangler.vault.jsonc's main) and the probe (wrangler/aborts.proof.test.ts),
# builds the copy, then runs the probe under the heavy lock. The files under
# test are the source's, unchanged. Nothing is written outside <out dir>
# except wrangler dev's own temporary store, which the harness removes.
#
# Usage: run-proof.sh <source root> <modules root> <out dir> <label>
#   <source root>   a repository root: a git archive of the commit under test, or the planner's tree
#   <modules root>  a repository root whose node_modules, apps/edge/node_modules and apps/api/node_modules are installed
#   <out dir>       a new folder for the copy and its logs
#   <label>         names the observations and logs: <out dir>/observations-<label>.txt, build-<label>.log, proof-<label>.log
set -u
pl="$(cd "$(dirname "$0")" && pwd)"
src="$1"; modules="$2"; out="$3"; label="$4"
if [ -e "$out/root" ]; then echo "$out/root exists: use a new out dir"; exit 2; fi
mkdir -p "$out/root/apps"
rsync -a --exclude node_modules --exclude dist --exclude .wrangler "$src/apps/edge" "$src/apps/api" "$out/root/apps/" || exit 2
rsync -a --exclude node_modules "$src/packages" "$out/root/" || exit 2
cp "$src/package.json" "$src/package-lock.json" "$out/root/" || exit 2
ln -s "$modules/node_modules" "$out/root/node_modules"
ln -s "$modules/apps/edge/node_modules" "$out/root/apps/edge/node_modules"
if [ -d "$modules/apps/api/node_modules" ]; then ln -s "$modules/apps/api/node_modules" "$out/root/apps/api/node_modules"; fi
edge="$out/root/apps/edge"
cp "$pl/wrangler/vault-proof.ts" "$edge/src/roles/vault-proof.ts" || exit 2
cp "$pl/wrangler/aborts.proof.test.ts" "$edge/test/aborts.proof.test.ts" || exit 2
python3 -I - "$edge/wrangler.vault.jsonc" <<'EOF' || exit 2
import sys
path = sys.argv[1]
text = open(path, encoding='utf-8').read()
old = '"main": "src/roles/vault.ts"'
if text.count(old) != 1:
    sys.exit(f'{path}: main not found once')
open(path, 'w', encoding='utf-8').write(text.replace(old, '"main": "src/roles/vault-proof.ts"'))
EOF
(cd "$edge" && npm run build > "$out/build-$label.log" 2>&1) || { echo "build failed: $out/build-$label.log"; exit 1; }
until mkdir /private/tmp/claude-501/jotbun-heavy.lock 2>/dev/null; do sleep 20; done
(cd "$edge" && PROOF_OUT="$out/observations-$label.txt" npx vitest run test/aborts.proof.test.ts > "$out/proof-$label.log" 2>&1)
rc=$?
rmdir /private/tmp/claude-501/jotbun-heavy.lock
echo "rc=$rc"
cat "$out/observations-$label.txt" 2>/dev/null | grep -E '^(ledger|export|snapshot|receipt|retain|upload|answers)'
exit $rc
