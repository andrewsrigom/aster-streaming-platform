#!/usr/bin/env bash

set -Eeuo pipefail

export PATH=/home/andrews/.local/share/node-v24.19.0-linux-x64/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export ASTER_PLAYABLE_DEMO=true
export ASTER_ENGAGEMENT_DEMO=true

readonly repository=/tmp/aster-reference-reader-confirm-20260902
readonly project=aster-reference-confirm-20260902

cd "$repository"

playable_compose() {
  docker compose \
    --project-name "$project" \
    --file infra/compose/compose.yml \
    --file infra/compose/playable.yml \
    --profile runtime \
    "$@"
}

project_containers() {
  docker ps --all --quiet --filter "label=com.docker.compose.project=$project"
}

project_networks() {
  docker network ls --quiet --filter "label=com.docker.compose.project=$project"
}

project_volumes() {
  docker volume ls --quiet --filter "label=com.docker.compose.project=$project"
}

cleanup() {
  local status=$?
  trap - EXIT
  set +e

  echo "docker_owned_state_before_cleanup"
  playable_compose ps --all
  local ps_status=$?
  playable_compose logs --no-color --tail 20 playable-generate playable-seed
  local logs_status=$?
  playable_compose down --volumes --timeout 10
  local down_status=$?

  local containers networks volumes
  containers="$(project_containers)"
  local containers_status=$?
  networks="$(project_networks)"
  local networks_status=$?
  volumes="$(project_volumes)"
  local volumes_status=$?

  if ((
    ps_status != 0 ||
      logs_status != 0 ||
      down_status != 0 ||
      containers_status != 0 ||
      networks_status != 0 ||
      volumes_status != 0
  )); then
    echo "docker_cleanup_inspection_failed ps=$ps_status logs=$logs_status down=$down_status containers=$containers_status networks=$networks_status volumes=$volumes_status"
    status=1
  elif [[ -n "$containers" || -n "$networks" || -n "$volumes" ]]; then
    echo "docker_cleanup_residue containers=$containers networks=$networks volumes=$volumes"
    status=1
  else
    echo "docker_cleanup=ok project=$project containers=0 networks=0 volumes=0"
  fi

  exit "$status"
}

trap cleanup EXIT

node ./tools/verify-docker-context.mjs
docker info --format 'docker_server={{.ServerVersion}}'
docker compose version

for port in 3000 4000 9001; do
  if ss -H -ltn "sport = :$port" | grep -q .; then
    echo "port_in_use=$port"
    exit 1
  fi
done

test -z "$(project_containers)"
test -z "$(project_networks)"
test -z "$(project_volumes)"
echo "docker_preflight=ok project=$project ports=3000,4000,9001"

playable_compose up --build --wait --wait-timeout 180 web
pnpm --filter @aster/web exec playwright install chromium
pnpm --filter @aster/web exec playwright test demo.spec.ts

playable_compose up --no-build --wait --wait-timeout 90 web
playable_compose logs --no-color --tail 1 playable-seed | grep '"changed":false'
playable_compose logs --no-color --tail 1 playable-generate | grep 'generated_hls_reused'

echo "docker_browser_replay=ok project=$project"
