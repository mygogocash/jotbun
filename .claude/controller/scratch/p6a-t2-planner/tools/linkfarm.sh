#!/bin/zsh
# Links a proof tree's node_modules to a worktree's fresh install, entry by entry,
# and points the three workspace links back at the proof tree itself, so the
# tests read the tree's own packages/contracts, apps/app and apps/api.
#   linkfarm.sh <tree> <source worktree>
# The source's package-lock.json must equal the tree's (checked here).
set -eu
tree="$1"
src="$2"
if ! cmp -s "$tree/package-lock.json" "$src/package-lock.json"; then
  echo "lockfiles differ: $tree $src" >&2
  exit 1
fi
farm() {
  local from="$1" to="$2"
  mkdir -p "$to"
  for entry in "$from"/*(DN) ; do
    local name="${entry:t}"
    case "$name" in
      .vite|.cache|@gogospend|gogospend-api|gogospend-app) continue ;;
    esac
    ln -s "$entry" "$to/$name"
  done
}
farm "$src/node_modules" "$tree/node_modules"
mkdir -p "$tree/node_modules/@gogospend"
ln -s ../../packages/contracts "$tree/node_modules/@gogospend/contracts"
ln -s ../apps/api "$tree/node_modules/gogospend-api"
ln -s ../apps/app "$tree/node_modules/gogospend-app"
farm "$src/apps/api/node_modules" "$tree/apps/api/node_modules"
farm "$src/apps/app/node_modules" "$tree/apps/app/node_modules"
echo "linked: root $(ls -A "$tree/node_modules" | wc -l | tr -d ' '), api $(ls -A "$tree/apps/api/node_modules" | wc -l | tr -d ' '), app $(ls -A "$tree/apps/app/node_modules" | wc -l | tr -d ' ')"
readlink "$tree/node_modules/@gogospend/contracts"
