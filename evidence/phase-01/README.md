# Phase 01 Evidence Index

- Phase status: `IN_PROGRESS`
- Environment: Windows host; WSL distribution registered as Ubuntu-20.04 with Ubuntu 24.04 userspace
- Evidence date: 2026-08-26
- Next work item: P01-R02

## Work items

| Work item | Requirement | Acceptance | Artifact |
|---|---|---|---|
| First Docker-only PostgreSQL and Redis checkpoint | P01-R01 | VERIFIED | [`local-platform-checkpoint.txt`](local-platform-checkpoint.txt) |

Candidate commit `563d09f` passed the clean public-checkout repeat and protected pull-request run `32947483503`. Broker, object storage, telemetry, application runtime, HTTP adapter, product schemas, and destructive reset are not part of this checkpoint.

## Current limitations

- Measurements use one Docker Desktop and WSL host with warm image state after the first recorded pull.
- The selected image indexes contain amd64 and arm64 manifests, but runtime behavior is measured only on amd64.
- Native Windows, macOS, rootless Docker, Podman, and alternate Compose implementations are not verified.
- PostgreSQL persists local state; Redis is intentionally disposable and is not a recovery source.
- P01-R02 owns the supported destructive reset, so the public operator contract exposes only a data-preserving stop.
