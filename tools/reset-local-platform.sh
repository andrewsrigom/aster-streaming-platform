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
observability_file=$repository_root/infra/compose/observability.yml
demo_file=$repository_root/infra/compose/demo.yml
for repository_file in "$repository_root/AGENTS.md" "$repository_root/package.json" "$compose_file" "$observability_file" "$demo_file"; do
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
  docker_local compose --project-name "$PROJECT_NAME" --file "$compose_file" --file "$observability_file" --file "$demo_file" --profile '*' "$@"
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
expected_services='broker
catalog
catalog-init
collector
engagement
engagement-init
identity
identity-init
platform-init
platform-status
playback
playback-init
postgres
prometheus
redis
router
router-trust-init
storage
web'
[ "$configured_services" = "$expected_services" ] || fail 'the Compose service set is not the reviewed local platform slice'

if ! configured_volumes=$(compose_local config --volumes 2>/dev/null); then
  fail 'the Compose volume set cannot be read'
fi
configured_volumes=$(printf '%s\n' "$configured_volumes" | LC_ALL=C sort | tr -d '\r')
expected_volumes='broker-data
catalog-router-trust
engagement-catalog-trust
engagement-identity-trust
engagement-playback-trust
engagement-router-trust
identity-router-trust
playback-catalog-trust
playback-router-trust
postgres-data
prometheus-data
storage-data'
[ "$configured_volumes" = "$expected_volumes" ] || fail 'the Compose volume set is not the reviewed local platform slice'

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

if ! container_ids=$(docker_local container ls --all --quiet --no-trunc --filter "label=com.docker.compose.project=$PROJECT_NAME" 2>/dev/null); then
  fail 'Aster containers cannot be listed'
fi
container_count=0
seen_services='|'
legacy_volume_names=''
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
  case "$container_compose_file" in
    "$compose_file" | "$compose_file,$observability_file" | "$compose_file,$demo_file" | "$compose_file,$observability_file,$demo_file") ;;
    *) fail "container $container_name has an unexpected Compose-file label" ;;
  esac
  case "$container_environment|$container_scope" in
    'local|platform' | '|') ;;
    *) fail "container $container_name has an incomplete or unexpected environment and scope label pair" ;;
  esac
  case "$container_service" in
    identity | identity-init | catalog | catalog-init | playback | playback-init | engagement | engagement-init | broker | storage | collector | prometheus | router | router-trust-init | web)
      [ "$container_environment|$container_scope" = 'local|platform' ] || fail 'runtime and optional services require current ownership labels'
      ;;
    platform-init | platform-status | postgres | redis) ;;
    *) fail "container $container_name belongs to an unexpected service" ;;
  esac
  case "$seen_services" in
    *"|$container_service|"*) fail "duplicate $container_service container is prohibited" ;;
  esac
  seen_services="$seen_services$container_service|"
  if ! container_mounts=$(docker_local container inspect --format '{{range .Mounts}}{{.Type}}|{{.Name}}|{{.Destination}}{{"\n"}}{{end}}' "$container_id" 2>/dev/null); then
    fail "container $container_name mounts cannot be inspected"
  fi
  container_mounts=$(printf '%s\n' "$container_mounts" | LC_ALL=C sort)
  case "$container_service|$container_mounts" in
    'postgres|volume|aster_postgres-data|/var/lib/postgresql' | 'redis|' | 'identity|' | 'identity-init|' | 'catalog|' | 'catalog-init|' | 'platform-init|' | 'platform-status|' | 'platform-init|tmpfs||/tmp' | 'platform-status|tmpfs||/tmp') ;;
    'broker|volume|aster_broker-data|/var/lib/kafka/data' | 'storage|volume|aster_storage-data|/data' | 'prometheus|volume|aster_prometheus-data|/prometheus' | 'collector|') ;;
    'web|' | 'web|tmpfs||/app/apps/web/.next/cache') ;;
    'identity|volume|aster_identity-router-trust|/run/aster-router' | 'catalog|volume|aster_catalog-router-trust|/run/aster-router') ;;
    'playback-init|' | 'engagement-init|') ;;
    'identity|volume|aster_engagement-identity-trust|/run/aster-engagement-identity
volume|aster_identity-router-trust|/run/aster-router') ;;
    'playback|volume|aster_engagement-playback-trust|/run/aster-engagement-playback
volume|aster_playback-catalog-trust|/run/aster-playback-catalog
volume|aster_playback-router-trust|/run/aster-router') ;;
    'engagement|volume|aster_engagement-identity-trust|/run/aster-engagement-identity
volume|aster_engagement-playback-trust|/run/aster-engagement-playback
volume|aster_engagement-router-trust|/run/aster-router') ;;
    'engagement|volume|aster_engagement-catalog-trust|/run/aster-engagement-catalog
volume|aster_engagement-identity-trust|/run/aster-engagement-identity
volume|aster_engagement-playback-trust|/run/aster-engagement-playback
volume|aster_engagement-router-trust|/run/aster-router') ;;
    'router|volume|aster_catalog-router-trust|/run/aster-router/catalog
volume|aster_engagement-router-trust|/run/aster-router/engagement
volume|aster_identity-router-trust|/run/aster-router/identity
volume|aster_playback-router-trust|/run/aster-router/playback') ;;
    'router-trust-init|volume|aster_catalog-router-trust|/run/aster-router/catalog
volume|aster_engagement-identity-trust|/run/aster-engagement-identity
volume|aster_engagement-playback-trust|/run/aster-engagement-playback
volume|aster_engagement-router-trust|/run/aster-router/engagement
volume|aster_identity-router-trust|/run/aster-router/identity
volume|aster_playback-catalog-trust|/run/aster-playback-catalog
volume|aster_playback-router-trust|/run/aster-router/playback') ;;
    'catalog|volume|aster_catalog-router-trust|/run/aster-router
volume|aster_playback-catalog-trust|/run/aster-playback-catalog') ;;
    'catalog|volume|aster_catalog-router-trust|/run/aster-router
volume|aster_engagement-catalog-trust|/run/aster-engagement-catalog
volume|aster_playback-catalog-trust|/run/aster-playback-catalog') ;;
    'router-trust-init|volume|aster_catalog-router-trust|/run/aster-router/catalog
volume|aster_engagement-catalog-trust|/run/aster-engagement-catalog
volume|aster_engagement-identity-trust|/run/aster-engagement-identity
volume|aster_engagement-playback-trust|/run/aster-engagement-playback
volume|aster_engagement-router-trust|/run/aster-router/engagement
volume|aster_identity-router-trust|/run/aster-router/identity
volume|aster_playback-catalog-trust|/run/aster-playback-catalog
volume|aster_playback-router-trust|/run/aster-router/playback') ;;
    'playback|volume|aster_playback-catalog-trust|/run/aster-playback-catalog
volume|aster_playback-router-trust|/run/aster-router') ;;
    'router|volume|aster_catalog-router-trust|/run/aster-router/catalog
volume|aster_identity-router-trust|/run/aster-router/identity
volume|aster_playback-router-trust|/run/aster-router/playback') ;;
    'router-trust-init|volume|aster_catalog-router-trust|/run/aster-router/catalog
volume|aster_identity-router-trust|/run/aster-router/identity
volume|aster_playback-catalog-trust|/run/aster-playback-catalog
volume|aster_playback-router-trust|/run/aster-router/playback') ;;
    'router|volume|aster_catalog-router-trust|/run/aster-router/catalog
volume|aster_identity-router-trust|/run/aster-router/identity' | 'router-trust-init|volume|aster_catalog-router-trust|/run/aster-router/catalog
volume|aster_identity-router-trust|/run/aster-router/identity') ;;
    platform-init\|volume\|*\|/var/lib/postgresql | platform-status\|volume\|*\|/var/lib/postgresql)
      legacy_volume=$(printf '%s\n' "$container_mounts" | cut -d '|' -f 2)
      [ "${#legacy_volume}" -eq 64 ] || fail 'legacy helper volume is not an anonymous identifier'
      case "$legacy_volume" in
        *[!0-9a-f]*) fail 'legacy helper volume is not an anonymous identifier' ;;
      esac
      legacy_volume_names="$legacy_volume_names $legacy_volume"
      ;;
    *) fail "container $container_name has unreviewed mounts" ;;
  esac
  if ! container_networks=$(docker_local container inspect --format '{{range $name, $network := .NetworkSettings.Networks}}{{$name}}{{"\n"}}{{end}}' "$container_id" 2>/dev/null); then
    fail "container $container_name networks cannot be inspected"
  fi
  case "$container_service|$container_networks" in
    'router-trust-init|none') ;;
    'web|aster_edge') ;;
    *\| | *\|aster_platform | 'router|aster_edge
aster_platform' | 'identity|aster_edge
aster_platform' | 'catalog|aster_edge
aster_platform' | 'prometheus|aster_edge
aster_platform') ;;
    *) fail "container $container_name has unreviewed network attachments" ;;
  esac
  container_count=$((container_count + 1))
done

require_owned_attachments() {
  for attached_id in $1; do
    attached_owned=false
    for owned_id in $container_ids; do
      if [ "$attached_id" = "$owned_id" ]; then
        attached_owned=true
        break
      fi
    done
    [ "$attached_owned" = true ] || fail 'a foreign container shares an Aster network or volume'
  done
}

for legacy_volume in $legacy_volume_names; do
  if ! legacy_labels=$(docker_local volume inspect --format '{{json .Labels}}' "$legacy_volume" 2>/dev/null); then
    fail 'legacy helper volume labels cannot be inspected'
  fi
  case "$legacy_labels" in
    null | '{}' | '{"com.docker.volume.anonymous":""}') ;;
    *) fail 'legacy helper volume has unexpected labels' ;;
  esac
  if ! attached_ids=$(docker_local container ls --all --quiet --no-trunc --filter "volume=$legacy_volume" 2>/dev/null); then
    fail 'legacy helper volume attachments cannot be inspected'
  fi
  require_owned_attachments "$attached_ids"
done

if ! network_ids=$(docker_local network ls --quiet --filter "label=com.docker.compose.project=$PROJECT_NAME" 2>/dev/null); then
  fail 'Aster networks cannot be listed'
fi
network_count=0
seen_platform_network=0
seen_edge_network=0
for network_id in $network_ids; do
  if ! network_name=$(docker_local network inspect --format '{{.Name}}' "$network_id" 2>/dev/null); then
    fail 'an Aster network cannot be inspected'
  fi
  if ! network_labels=$(docker_local network inspect --format '{{ index .Labels "com.docker.compose.project" }}|{{ index .Labels "com.docker.compose.network" }}|{{ index .Labels "com.aster.environment" }}|{{ index .Labels "com.aster.scope" }}' "$network_id" 2>/dev/null); then
    fail "network $network_name labels cannot be inspected"
  fi
  case "$network_name|$network_labels" in
    'aster_platform|aster|platform|local|platform')
      [ "$seen_platform_network" -eq 0 ] || fail 'duplicate platform network'
      seen_platform_network=1
      ;;
    'aster_edge|aster|edge|local|platform')
      [ "$seen_edge_network" -eq 0 ] || fail 'duplicate edge network'
      seen_edge_network=1
      ;;
    *) fail "network $network_name has unexpected ownership" ;;
  esac
  if ! attached_ids=$(docker_local network inspect --format '{{range $id, $container := .Containers}}{{$id}}{{"\n"}}{{end}}' "$network_id" 2>/dev/null); then
    fail 'network attachments cannot be inspected'
  fi
  require_owned_attachments "$attached_ids"
  network_count=$((network_count + 1))
done

if ! volume_names=$(docker_local volume ls --quiet --filter "label=com.docker.compose.project=$PROJECT_NAME" 2>/dev/null); then
  fail 'Aster volumes cannot be listed'
fi
volume_count=0
for volume_name in $volume_names; do
  [ "$volume_count" -lt 12 ] || fail 'more than twelve Aster volumes are prohibited'
  if ! volume_labels=$(docker_local volume inspect --format '{{ index .Labels "com.docker.compose.project" }}|{{ index .Labels "com.docker.compose.volume" }}|{{ index .Labels "com.aster.authority" }}|{{ index .Labels "com.aster.environment" }}|{{ index .Labels "com.aster.owner" }}' "$volume_name" 2>/dev/null); then
    fail "volume $volume_name labels cannot be inspected"
  fi
  case "$volume_name|$volume_labels" in
    'aster_postgres-data|aster|postgres-data|durable-local|local|platform' | \
    'aster_broker-data|aster|broker-data|durable-local|local|platform' | \
    'aster_storage-data|aster|storage-data|durable-local|local|platform' | \
    'aster_identity-router-trust|aster|identity-router-trust|disposable-local|local|platform' | \
    'aster_catalog-router-trust|aster|catalog-router-trust|disposable-local|local|platform' | \
    'aster_playback-router-trust|aster|playback-router-trust|disposable-local|local|platform' | \
    'aster_playback-catalog-trust|aster|playback-catalog-trust|disposable-local|local|platform' | \
    'aster_engagement-router-trust|aster|engagement-router-trust|disposable-local|local|platform' | \
    'aster_engagement-identity-trust|aster|engagement-identity-trust|disposable-local|local|platform' | \
    'aster_engagement-playback-trust|aster|engagement-playback-trust|disposable-local|local|platform' | \
    'aster_engagement-catalog-trust|aster|engagement-catalog-trust|disposable-local|local|platform' | \
    'aster_prometheus-data|aster|prometheus-data|disposable-local|local|platform') ;;
    *) fail "volume $volume_name has unexpected project, volume, authority, environment, or owner labels" ;;
  esac
  if ! attached_ids=$(docker_local container ls --all --quiet --no-trunc --filter "volume=$volume_name" 2>/dev/null); then
    fail 'volume attachments cannot be inspected'
  fi
  require_owned_attachments "$attached_ids"
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
legacy_volume_count=0
for legacy_volume in $legacy_volume_names; do
  if docker_local volume inspect "$legacy_volume" >/dev/null 2>&1; then
    fail 'a legacy helper volume remains after teardown'
  fi
  legacy_volume_count=$((legacy_volume_count + 1))
done

printf 'aster local platform reset complete\n'
printf 'removed project resources: containers=%s networks=%s volumes=%s\n' "$container_count" "$network_count" "$volume_count"
printf 'removed legacy helper volumes=%s\n' "$legacy_volume_count"
