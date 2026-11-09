#!/bin/bash
# Report each open PR into claude/p1a-vault-core once every check on its CURRENT head has finished.
# One line per (PR, head) result; a PR is reported again only after its head changes and finishes again.
SEEN=/Users/kunanonjarat/Developer/jotbun/.claude/controller/watch_prs.seen
touch "$SEEN"
while true; do
  data=$(gh pr list --repo mygogocash/jotbun --base claude/p1a-vault-core --state open --json number,headRefOid,mergeStateStatus,statusCheckRollup 2>/dev/null) || { sleep 60; continue; }
  echo "$data" | python3 -I -c "
import json,sys
seen=set(open('$SEEN').read().split())
out=[]
for p in json.load(sys.stdin):
    checks=p.get('statusCheckRollup') or []
    states=[(c.get('conclusion') or c.get('status') or 'PENDING') for c in checks]
    if not checks or any(s in ('PENDING','IN_PROGRESS','QUEUED','WAITING','EXPECTED') for s in states): continue
    key=f\"{p['number']}:{p['headRefOid']}\"
    if key in seen: continue
    parts=' '.join((c.get('name') or '')[:6]+':'+s for c,s in zip(checks,states))
    print(f\"#{p['number']} {p['headRefOid'][:7]} {p['mergeStateStatus']} {parts}\", flush=True)
    out.append(key)
open('$SEEN','a').write(''.join(k+'\n' for k in out))
"
  sleep 60
done
