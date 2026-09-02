#!/usr/bin/env bash

set -Eeuo pipefail

export PATH=/home/andrews/.local/share/node-v24.19.0-linux-x64/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export ASTER_PLAYABLE_DEMO=true
export ASTER_ENGAGEMENT_DEMO=true

readonly repository=/tmp/aster-reference-reader-20260902
readonly project=aster-reference-final-20260902

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
  playable_compose logs --no-color --tail 20 playable-generate playable-seed
  playable_compose down --volumes --timeout 10

  local containers networks volumes
  containers="$(project_containers)"
  networks="$(project_networks)"
  volumes="$(project_volumes)"

  if [[ -n "$containers" || -n "$networks" || -n "$volumes" ]]; then
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
