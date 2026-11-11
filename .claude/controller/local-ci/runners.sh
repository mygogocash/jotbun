#!/bin/bash
# Self-hosted GitHub Actions runners for mygogocash/jotbun on this Mac, while GitHub-hosted runners are refused
# (billing). The workflow's jobs run where the repository variable CI_RUNNER says (`runs-on: ${{ vars.CI_RUNNER ||
# 'ubuntu-24.04' }}`); set it to `jotbun-local` to use these, delete it to go back to GitHub's runners.
#
# Each runner gets its own Docker daemon (docker:dind), reached over a private socket, and shares its network, so the database jobs' fixed
# container name and 127.0.0.1:55432 never collide between runners, nor with the Mac's own Docker.
#
# Usage: runners.sh up [count]   start count runners (default 2); needs Colima running and gh with repo admin
#        runners.sh down         stop and unregister them
#        runners.sh status
set -eu
REPO=mygogocash/jotbun
LABEL=jotbun-local
IMAGE=myoung34/github-runner:ubuntu-noble
DIND=docker:dind
cmd=${1:-status}
count=${2:-2}

case $cmd in
  up)
    colima status >/dev/null 2>&1 || { echo "Colima is not running: colima start --cpu 10 --memory 32 --disk 100"; exit 1; }
    for i in $(seq 1 "$count"); do
      name=jotbun-runner-$i
      if docker ps --format '{{.Names}}' | grep -qx "$name"; then echo "$name already running"; continue; fi
      docker rm -f "$name" "$name-dind" >/dev/null 2>&1 || true
      # The daemon listens only on a socket in a volume shared with its own runner: no TCP port at all.
      docker run -d --name "$name-dind" --privileged --restart unless-stopped \
        -v "$name-docker:/var/lib/docker" -v "$name-sock:/run/dind" \
        "$DIND" dockerd --host=unix:///run/dind/docker.sock >/dev/null
      # The token is short-lived and goes straight into the container's environment; it is never printed.
      token=$(gh api -X POST "repos/$REPO/actions/runners/registration-token" --jq .token)
      docker run -d --name "$name" --restart unless-stopped --network "container:$name-dind" \
        -e REPO_URL="https://github.com/$REPO" -e RUNNER_TOKEN="$token" -e RUNNER_NAME="$name" \
        -e LABELS="$LABEL" -e RUNNER_SCOPE=repo -e DISABLE_AUTO_UPDATE=true \
        -e DOCKER_HOST=unix:///run/dind/docker.sock -v "$name-sock:/run/dind" -v "$name-tools:/opt/hostedtoolcache" \
        "$IMAGE" >/dev/null
      echo "$name started"
    done
    ;;
  down)
    for c in $(docker ps -a --format '{{.Names}}' | grep -E '^jotbun-runner-[0-9]+$' || true); do
      token=$(gh api -X POST "repos/$REPO/actions/runners/remove-token" --jq .token)
      docker exec "$c" bash -c "cd /actions-runner && ./config.sh remove --token $token" >/dev/null 2>&1 || true
      docker rm -f "$c" "$c-dind" >/dev/null
      echo "$c removed"
    done
    ;;
  status)
    docker ps --filter name=jotbun-runner --format '{{.Names}}\t{{.Status}}'
    gh api "repos/$REPO/actions/runners" --jq '.runners[] | "\(.name)\t\(.status)\tbusy=\(.busy)\t\([.labels[].name] | join(","))"'
    ;;
  *) echo "usage: $0 up [count] | down | status"; exit 1 ;;
esac
