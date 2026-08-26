# Phase 01 Evidence Index

- Phase status: `IN_PROGRESS`
- Environment: Windows host; WSL distribution registered as Ubuntu-20.04 with Ubuntu 24.04 userspace
- Evidence date: 2026-08-26
- Active work item: P01-R01 review remediation

## Work items

| Work item | Requirement | Acceptance | Artifact |
|---|---|---|---|
| First Docker-only PostgreSQL and Redis checkpoint | P01-R01 | IMPLEMENTED | [`local-platform-checkpoint.txt`](local-platform-checkpoint.txt) |

Candidate commit `563d09f` passed the initial clean public-checkout repeat and protected pull-request run `32947483503`. Automated review then identified project-name override risk; the corrected local adverse path passes, while its clean public-checkout and protected hosted repeats remain pending. Broker, object storage, telemetry, application runtime, HTTP adapter, product schemas, and destructive reset are not part of this checkpoint.

## Current limitations

- Measurements use one Docker Desktop and WSL host with warm image state after the first recorded pull.
- The selected image indexes contain amd64 and arm64 manifests, but runtime behavior is measured only on amd64.
- Native Windows, macOS, rootless Docker, Podman, and alternate Compose implementations are not verified.
- PostgreSQL persists local state; Redis is intentionally disposable and is not a recovery source.
- P01-R02 owns the supported destructive reset, so the public operator contract exposes only a data-preserving stop.
