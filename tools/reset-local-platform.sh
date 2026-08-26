#!/bin/sh

set -eu

PROJECT_NAME=aster
CONFIRMATION=DELETE-ASTER-LOCAL-DATA

fail() {
  printf 'aster local reset refused: %s\n' "$1" >&2
  exit 1
}

if [ "${ASTER_ENVIRONMENT:-}" != "local" ]; then
  fail 'set ASTER_ENVIRONMENT=local to identify the local-only target'
fi

if [ "$#" -ne 2 ] || [ "$1" != "--confirm" ] || [ "$2" != "$CONFIRMATION" ]; then
  fail "use exactly --confirm $CONFIRMATION; no target, URL, path, or extra flag is accepted"
fi

if [ -n "${CI:-}" ] || [ -n "${GITHUB_ACTIONS:-}" ] || [ -n "${GITLAB_CI:-}" ] ||
  [ -n "${BUILDKITE:-}" ] || [ -n "${CIRCLECI:-}" ] || [ -n "${TF_BUILD:-}" ] ||
  [ -n "${JENKINS_URL:-}" ]; then
  fail 'hosted or CI execution is prohibited'
fi

if [ -n "${DATABASE_URL:-}" ] || [ -n "${POSTGRES_URL:-}" ] ||
  [ -n "${POSTGRESQL_URL:-}" ] || [ -n "${REDIS_URL:-}" ] ||
  [ -n "${ASTER_DATABASE_URL:-}" ] || [ -n "${ASTER_REDIS_URL:-}" ]; then
  fail 'database and Redis connection URLs are prohibited'
fi

if [ -n "${DOCKER_HOST:-}" ] || [ -n "${DOCKER_CONTEXT:-}" ] ||
  [ -n "${DOCKER_TLS_VERIFY:-}" ] || [ -n "${DOCKER_CERT_PATH:-}" ] ||
  [ -n "${DOCKER_CONFIG:-}" ]; then
  fail 'Docker endpoint and configuration overrides are prohibited'
fi

command -v docker >/dev/null 2>&1 || fail 'docker is not available on PATH'

case "$0" in
  /*) script_path=$0 ;;
  *) script_path=$PWD/$0 ;;
esac
[ ! -L "$script_path" ] || fail 'the reset script must not be invoked through a symbolic link'

if ! script_directory=$(CDPATH= cd -- "$(dirname -- "$script_path")" && pwd -P); then
  fail 'the script directory cannot be resolved'
fi
if ! repository_root=$(CDPATH= cd -- "$script_directory/.." && pwd -P); then
  fail 'the repository root cannot be resolved'
fi

compose_file=$repository_root/infra/compose/compose.yml
for repository_file in "$repository_root/AGENTS.md" "$repository_root/package.json" "$compose_file"; do
  [ -f "$repository_file" ] || fail 'required regular repository files are missing'
  [ ! -L "$repository_file" ] || fail 'symbolic repository inputs are prohibited'
done

unset COMPOSE_FILE COMPOSE_PROJECT_NAME COMPOSE_PROFILES COMPOSE_ENV_FILES
unset COMPOSE_REMOVE_ORPHANS COMPOSE_IGNORE_ORPHANS

if ! context_name=$(docker context show 2>/dev/null); then
  fail 'the active Docker context cannot be read'
fi
[ -n "$context_name" ] || fail 'the active Docker context is empty'

if ! docker_endpoint=$(docker context inspect --format '{{ (index .Endpoints "docker").Host }}' "$context_name" 2>/dev/null); then
  fail 'the active Docker endpoint cannot be inspected'
fi
case "$docker_endpoint" in
  unix://* | npipe://*) ;;
  *) fail 'the active Docker endpoint is not a local socket' ;;
esac

docker_local() {
  docker --context "$context_name" "$@"
}

compose_local() {
  docker_local compose --project-name "$PROJECT_NAME" --file "$compose_file" "$@"
}

if ! docker_os=$(docker_local info --format '{{.OSType}}' 2>/dev/null); then
  fail 'the local Docker daemon is unavailable'
fi
[ "$docker_os" = "linux" ] || fail 'the local Docker daemon must use Linux containers'

compose_local config --quiet >/dev/null 2>&1 || fail 'the checked-in Compose model is invalid'
if ! configured_services=$(compose_local config --services 2>/dev/null); then
  fail 'the Compose service set cannot be read'
fi
configured_services=$(printf '%s\n' "$configured_services" | LC_ALL=C sort | tr -d '\r')
expected_services='platform-init
platform-status
postgres
redis'
[ "$configured_services" = "$expected_services" ] || fail 'the Compose service set is not the reviewed local platform slice'

if ! configured_volumes=$(compose_local config --volumes 2>/dev/null); then
  fail 'the Compose volume set cannot be read'
fi
configured_volumes=$(printf '%s\n' "$configured_volumes" | tr -d '\r')
[ "$configured_volumes" = "postgres-data" ] || fail 'the Compose volume set is not the reviewed local platform slice'

if ! prefixed_container_ids=$(docker_local container ls --all --quiet --filter "name=^/${PROJECT_NAME}[-_]" 2>/dev/null); then
  fail 'Aster-prefixed containers cannot be listed'
fi
for container_id in $prefixed_container_ids; do
  if ! container_name=$(docker_local container inspect --format '{{.Name}}' "$container_id" 2>/dev/null); then
    fail 'an Aster-prefixed container cannot be inspected'
  fi
  container_name=${container_name#/}
  if ! container_project=$(docker_local container inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$container_id" 2>/dev/null); then
    fail "container $container_name project ownership cannot be inspected"
  fi
  [ "$container_project" = "$PROJECT_NAME" ] ||
    fail "container $container_name uses the Aster name prefix without exact project ownership"
done

if ! prefixed_network_ids=$(docker_local network ls --quiet --filter "name=^${PROJECT_NAME}[-_]" 2>/dev/null); then
  fail 'Aster-prefixed networks cannot be listed'
fi
for network_id in $prefixed_network_ids; do
  if ! network_name=$(docker_local network inspect --format '{{.Name}}' "$network_id" 2>/dev/null); then
    fail 'an Aster-prefixed network cannot be inspected'
  fi
  if ! network_project=$(docker_local network inspect --format '{{ index .Labels "com.docker.compose.project" }}' "$network_id" 2>/dev/null); then
    fail "network $network_name project ownership cannot be inspected"
  fi
  [ "$network_project" = "$PROJECT_NAME" ] ||
    fail "network $network_name uses the Aster name prefix without exact project ownership"
done

if ! prefixed_volume_names=$(docker_local volume ls --quiet --filter "name=^${PROJECT_NAME}[-_]" 2>/dev/null); then
  fail 'Aster-prefixed volumes cannot be listed'
fi
for volume_name in $prefixed_volume_names; do
  if ! volume_project=$(docker_local volume inspect --format '{{ index .Labels "com.docker.compose.project" }}' "$volume_name" 2>/dev/null); then
    fail "volume $volume_name project ownership cannot be inspected"
  fi
  [ "$volume_project" = "$PROJECT_NAME" ] ||
    fail "volume $volume_name uses the Aster name prefix without exact project ownership"
done

if ! container_ids=$(docker_local container ls --all --quiet --filter "label=com.docker.compose.project=$PROJECT_NAME" 2>/dev/null); then
  fail 'Aster containers cannot be listed'
fi
container_count=0
seen_platform_init=0
seen_platform_status=0
seen_postgres=0
seen_redis=0
for container_id in $container_ids; do
  if ! container_name=$(docker_local container inspect --format '{{.Name}}' "$container_id" 2>/dev/null); then
    fail 'an Aster container cannot be inspected'
  fi
  container_name=${container_name#/}
  if ! container_labels=$(docker_local container inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}|{{ index .Config.Labels "com.docker.compose.service" }}|{{ index .Config.Labels "com.aster.environment" }}|{{ index .Config.Labels "com.aster.scope" }}|{{ index .Config.Labels "com.docker.compose.project.config_files" }}' "$container_id" 2>/dev/null); then
    fail "container $container_name labels cannot be inspected"
  fi
  container_project=$(printf '%s\n' "$container_labels" | cut -d '|' -f 1)
  container_service=$(printf '%s\n' "$container_labels" | cut -d '|' -f 2)
  container_environment=$(printf '%s\n' "$container_labels" | cut -d '|' -f 3)
  container_scope=$(printf '%s\n' "$container_labels" | cut -d '|' -f 4)
  container_compose_file=$(printf '%s\n' "$container_labels" | cut -d '|' -f 5)
  [ "$container_project" = "$PROJECT_NAME" ] || fail "container $container_name has unexpected project ownership"
  [ "$container_compose_file" = "$compose_file" ] || fail "container $container_name has an unexpected Compose-file label"
  case "$container_environment|$container_scope" in
    'local|platform' | '|') ;;
    *) fail "container $container_name has an incomplete or unexpected environment and scope label pair" ;;
  esac
  case "$container_service" in
    platform-init)
      [ "$seen_platform_init" -eq 0 ] || fail 'duplicate platform-init container is prohibited'
      seen_platform_init=1
      ;;
    platform-status)
      [ "$seen_platform_status" -eq 0 ] || fail 'duplicate platform-status container is prohibited'
      seen_platform_status=1
      ;;
    postgres)
      [ "$seen_postgres" -eq 0 ] || fail 'duplicate postgres container is prohibited'
      seen_postgres=1
      ;;
    redis)
      [ "$seen_redis" -eq 0 ] || fail 'duplicate redis container is prohibited'
      seen_redis=1
      ;;
    *) fail "container $container_name belongs to an unexpected service" ;;
  esac
  container_count=$((container_count + 1))
done

if ! network_ids=$(docker_local network ls --quiet --filter "label=com.docker.compose.project=$PROJECT_NAME" 2>/dev/null); then
  fail 'Aster networks cannot be listed'
fi
network_count=0
for network_id in $network_ids; do
  [ "$network_count" -eq 0 ] || fail 'more than one Aster network is prohibited'
  if ! network_name=$(docker_local network inspect --format '{{.Name}}' "$network_id" 2>/dev/null); then
    fail 'an Aster network cannot be inspected'
  fi
  if ! network_labels=$(docker_local network inspect --format '{{ index .Labels "com.docker.compose.project" }}|{{ index .Labels "com.docker.compose.network" }}|{{ index .Labels "com.aster.environment" }}|{{ index .Labels "com.aster.scope" }}' "$network_id" 2>/dev/null); then
    fail "network $network_name labels cannot be inspected"
  fi
  [ "$network_labels" = "$PROJECT_NAME|platform|local|platform" ] ||
    fail "network $network_name has unexpected project, network, environment, or scope labels"
  network_count=$((network_count + 1))
done

if ! volume_names=$(docker_local volume ls --quiet --filter "label=com.docker.compose.project=$PROJECT_NAME" 2>/dev/null); then
  fail 'Aster volumes cannot be listed'
fi
volume_count=0
for volume_name in $volume_names; do
  [ "$volume_count" -eq 0 ] || fail 'more than one Aster volume is prohibited'
  if ! volume_labels=$(docker_local volume inspect --format '{{ index .Labels "com.docker.compose.project" }}|{{ index .Labels "com.docker.compose.volume" }}|{{ index .Labels "com.aster.authority" }}|{{ index .Labels "com.aster.environment" }}|{{ index .Labels "com.aster.owner" }}' "$volume_name" 2>/dev/null); then
    fail "volume $volume_name labels cannot be inspected"
  fi
  [ "$volume_labels" = "$PROJECT_NAME|postgres-data|durable-local|local|platform" ] ||
    fail "volume $volume_name has unexpected project, volume, authority, environment, or owner labels"
  volume_count=$((volume_count + 1))
done

if [ "$container_count" -eq 0 ] && [ "$network_count" -eq 0 ] && [ "$volume_count" -eq 0 ]; then
  printf 'aster local platform is already reset\n'
  exit 0
fi

if ! compose_local down --volumes; then
  fail 'scoped Compose teardown failed; no broad fallback cleanup was attempted'
fi

if ! remaining_containers=$(docker_local container ls --all --quiet --filter "label=com.docker.compose.project=$PROJECT_NAME" 2>/dev/null); then
  fail 'post-reset container state cannot be read'
fi
if ! remaining_networks=$(docker_local network ls --quiet --filter "label=com.docker.compose.project=$PROJECT_NAME" 2>/dev/null); then
  fail 'post-reset network state cannot be read'
fi
if ! remaining_volumes=$(docker_local volume ls --quiet --filter "label=com.docker.compose.project=$PROJECT_NAME" 2>/dev/null); then
  fail 'post-reset volume state cannot be read'
fi

remaining_container_count=$(printf '%s\n' "$remaining_containers" | awk 'NF { count += 1 } END { print count + 0 }')
remaining_network_count=$(printf '%s\n' "$remaining_networks" | awk 'NF { count += 1 } END { print count + 0 }')
remaining_volume_count=$(printf '%s\n' "$remaining_volumes" | awk 'NF { count += 1 } END { print count + 0 }')
if [ "$remaining_container_count" -ne 0 ] || [ "$remaining_network_count" -ne 0 ] ||
  [ "$remaining_volume_count" -ne 0 ]; then
  fail "scoped teardown left containers=$remaining_container_count networks=$remaining_network_count volumes=$remaining_volume_count"
fi

printf 'aster local platform reset complete\n'
printf 'removed project resources: containers=%s networks=%s volumes=%s\n' "$container_count" "$network_count" "$volume_count"
