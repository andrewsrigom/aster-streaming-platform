#!/usr/bin/env bash

set -Eeuo pipefail

export PATH=/home/andrews/.local/share/node-v24.19.0-linux-x64/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export ASTER_PLAYABLE_DEMO=true
export ASTER_ENGAGEMENT_DEMO=true

readonly repository=/tmp/aster-reference-reader-boundary-20260902
readonly project=aster-reference-pinned-20260902

cd "$repository"

fail() {
  echo "docker_acceptance_refused=$1" >&2
  exit 1
}

if [[ -n "${DOCKER_HOST:-}" || -n "${DOCKER_CONTEXT:-}" || -n "${DOCKER_TLS_VERIFY:-}" || -n "${DOCKER_CERT_PATH:-}" || -n "${DOCKER_CONFIG:-}" ]]; then
  fail docker_endpoint_override
fi

context_name="$(docker context show 2>/dev/null)" || fail docker_context_unreadable
[[ -n "$context_name" ]] || fail docker_context_empty

docker_endpoint="$(docker context inspect --format '{{ (index .Endpoints "docker").Host }}' "$context_name" 2>/dev/null)" || fail docker_endpoint_unreadable
case "$docker_endpoint" in
  unix://* | npipe://*) ;;
  *) fail docker_endpoint_not_local ;;
esac

docker_local() {
  docker --context "$context_name" "$@"
}

playable_compose() {
  docker_local compose \
    --project-name "$project" \
    --file infra/compose/compose.yml \
    --file infra/compose/playable.yml \
    --profile runtime \
    "$@"
}

project_containers() {
  docker_local ps --all --quiet --filter "label=com.docker.compose.project=$project"
}

project_networks() {
  docker_local network ls --quiet --filter "label=com.docker.compose.project=$project"
}

project_volumes() {
  docker_local volume ls --quiet --filter "label=com.docker.compose.project=$project"
}

prefixed_containers() {
  docker_local container ls --all --quiet --filter "name=^/${project}[-_]"
}

prefixed_networks() {
  docker_local network ls --quiet --filter "name=^${project}[-_]"
}

prefixed_volumes() {
  docker_local volume ls --quiet --filter "name=^${project}[-_]"
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

  local containers networks volumes prefixed_containers_after prefixed_networks_after prefixed_volumes_after
  containers="$(project_containers)"
  local containers_status=$?
  networks="$(project_networks)"
  local networks_status=$?
  volumes="$(project_volumes)"
  local volumes_status=$?
  prefixed_containers_after="$(prefixed_containers)"
  local prefixed_containers_status=$?
  prefixed_networks_after="$(prefixed_networks)"
  local prefixed_networks_status=$?
  prefixed_volumes_after="$(prefixed_volumes)"
  local prefixed_volumes_status=$?

  if ((
    ps_status != 0 ||
      logs_status != 0 ||
      down_status != 0 ||
      containers_status != 0 ||
      networks_status != 0 ||
      volumes_status != 0 ||
      prefixed_containers_status != 0 ||
      prefixed_networks_status != 0 ||
      prefixed_volumes_status != 0
  )); then
    echo "docker_cleanup_inspection_failed ps=$ps_status logs=$logs_status down=$down_status containers=$containers_status networks=$networks_status volumes=$volumes_status prefixed_containers=$prefixed_containers_status prefixed_networks=$prefixed_networks_status prefixed_volumes=$prefixed_volumes_status"
    status=1
  elif [[ -n "$containers" || -n "$networks" || -n "$volumes" || -n "$prefixed_containers_after" || -n "$prefixed_networks_after" || -n "$prefixed_volumes_after" ]]; then
    echo "docker_cleanup_residue containers=$containers networks=$networks volumes=$volumes prefixed_containers=$prefixed_containers_after prefixed_networks=$prefixed_networks_after prefixed_volumes=$prefixed_volumes_after"
    status=1
  else
    echo "docker_cleanup=ok project=$project containers=0 networks=0 volumes=0"
  fi

  exit "$status"
}

DOCKER_CONTEXT="$context_name" node ./tools/verify-docker-context.mjs
docker_os="$(docker_local info --format '{{.OSType}}' 2>/dev/null)" || fail docker_daemon_unavailable
[[ "$docker_os" == linux ]] || fail docker_daemon_not_linux
docker_local info --format 'docker_server={{.ServerVersion}}'
docker_local compose version
echo "docker_endpoint=local context=$context_name type=$docker_os"

for port in 3000 4000 9001; do
  if ss -H -ltn "sport = :$port" | grep -q .; then
    echo "port_in_use=$port"
    exit 1
  fi
done

set +e
preflight_containers="$(project_containers)"
preflight_containers_status=$?
preflight_networks="$(project_networks)"
preflight_networks_status=$?
preflight_volumes="$(project_volumes)"
preflight_volumes_status=$?
preflight_prefixed_containers="$(prefixed_containers)"
preflight_prefixed_containers_status=$?
preflight_prefixed_networks="$(prefixed_networks)"
preflight_prefixed_networks_status=$?
preflight_prefixed_volumes="$(prefixed_volumes)"
preflight_prefixed_volumes_status=$?
set -e

if ((
  preflight_containers_status != 0 ||
    preflight_networks_status != 0 ||
    preflight_volumes_status != 0 ||
    preflight_prefixed_containers_status != 0 ||
    preflight_prefixed_networks_status != 0 ||
    preflight_prefixed_volumes_status != 0
)); then
  echo "docker_preflight_inspection_failed containers=$preflight_containers_status networks=$preflight_networks_status volumes=$preflight_volumes_status prefixed_containers=$preflight_prefixed_containers_status prefixed_networks=$preflight_prefixed_networks_status prefixed_volumes=$preflight_prefixed_volumes_status"
  exit 1
fi

if [[ -n "$preflight_containers" || -n "$preflight_networks" || -n "$preflight_volumes" || -n "$preflight_prefixed_containers" || -n "$preflight_prefixed_networks" || -n "$preflight_prefixed_volumes" ]]; then
  echo "docker_preflight_occupied containers=$preflight_containers networks=$preflight_networks volumes=$preflight_volumes prefixed_containers=$preflight_prefixed_containers prefixed_networks=$preflight_prefixed_networks prefixed_volumes=$preflight_prefixed_volumes"
  exit 1
fi

echo "docker_preflight=ok project=$project ports=3000,4000,9001"
trap cleanup EXIT

playable_compose up --build --wait --wait-timeout 180 web
pnpm --filter @aster/web exec playwright install chromium
pnpm --filter @aster/web exec playwright test demo.spec.ts

playable_compose up --no-build --wait --wait-timeout 90 web
playable_compose logs --no-color --tail 1 playable-seed | grep '"changed":false'
playable_compose logs --no-color --tail 1 playable-generate | grep 'generated_hls_reused'

echo "docker_browser_replay=ok project=$project"
