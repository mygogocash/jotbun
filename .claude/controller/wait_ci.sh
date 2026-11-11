#!/bin/bash
# Wait until every check on a PR has finished, then print each check's result.
pr=$1
sleep 60
until s=$(gh pr view "$pr" --repo mygogocash/jotbun --json statusCheckRollup --jq '[.statusCheckRollup[] | .conclusion // .status]' 2>/dev/null) && echo "$s" | python3 -I -c "import json,sys; v=json.load(sys.stdin); sys.exit(0 if v and all(x not in ('IN_PROGRESS','QUEUED','PENDING','WAITING','') for x in v) else 1)"; do sleep 45; done
gh pr view "$pr" --repo mygogocash/jotbun --json number,mergeable,statusCheckRollup --jq '"#\(.number) \(.mergeable)", (.statusCheckRollup[] | "\(.name): \(.conclusion // .status)")'
