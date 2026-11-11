#!/bin/bash
# Planner proof: a dry run of apps/edge/scripts/dev.mjs with a stand-in npx that records what it is asked to run
# and exits, so no Worker starts and nothing listens. Prints the .dev.vars keys (the digest key masked), its
# length and the file's mode, then removes the .dev.vars it wrote. No lock: nothing starts workerd.
# Usage: run-devmjs.sh <repo root> <output folder>
TREE="$1"; OUT="$2"
mkdir -p "$OUT/bin"
cat > "$OUT/bin/npx" <<STUB
#!/bin/bash
echo "npx \$* (cwd \$(pwd))" >> "$OUT/npx-calls.out"
exit 0
STUB
chmod +x "$OUT/bin/npx"
rm -f "$OUT/npx-calls.out" "$TREE/apps/edge/.dev.vars"
(cd "$TREE" && env -u ANTHROPIC_API_KEY -u COMMAND_DIGEST_KEY -u GOGOCASH_BRIDGE_ENABLED -u MIN_CLIENT_VERSION_IOS -u MIN_CLIENT_VERSION_ANDROID PATH="$OUT/bin:$PATH" node apps/edge/scripts/dev.mjs)
echo "dev.mjs exit $?"
sed -E "s#$TREE#<tree>#" "$OUT/npx-calls.out"
sed -E 's/^(COMMAND_DIGEST_KEY=")[^"]+/\1<masked>/' "$TREE/apps/edge/.dev.vars"
echo "COMMAND_DIGEST_KEY length $(awk -F'"' '/^COMMAND_DIGEST_KEY=/ {print length($2)}' "$TREE/apps/edge/.dev.vars")"
echo "mode $(stat -f '%Sp' "$TREE/apps/edge/.dev.vars")"
rm -f "$TREE/apps/edge/.dev.vars"
