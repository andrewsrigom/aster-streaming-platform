# Phase 01 Evidence Index

- Phase status: `IN_PROGRESS`
- Environment: Windows host; WSL distribution registered as Ubuntu-20.04 with Ubuntu 24.04 userspace
- Evidence date: 2026-08-26
- Next work item: P01-R03

## Work items

| Work item | Requirement | Acceptance | Artifact |
|---|---|---|---|
| First Docker-only PostgreSQL and Redis checkpoint | P01-R01 | VERIFIED | [`local-platform-checkpoint.txt`](local-platform-checkpoint.txt) |
| Explicit project-scoped destructive local reset | P01-R02 | VERIFIED | [`local-reset.txt`](local-reset.txt) |

P01-R01 candidate commit `563d09f` passed the initial clean public-checkout repeat and protected run `32947483503`. Automated review then identified project-name override risk; corrected candidate `c246051` passed the hostile-environment clean public-checkout, protected remediation run `32948639792`, exact cleanup, and resolved review. P01-R02 implementation commit `3fa3994` passed fixed-target refusals, populated and partial-state resets, clean restart, empty idempotence, unrelated-resource preservation, and a Docker-only public-checkout repeat. Broker, object storage, telemetry, application runtime, HTTP adapter, and product schemas remain outside these checkpoints.

## Current limitations

- Measurements use one Docker Desktop and WSL host with warm image state after the first recorded pull.
- The selected image indexes contain amd64 and arm64 manifests, but runtime behavior is measured only on amd64.
- Native Windows, macOS, rootless Docker, Podman, and alternate Compose implementations are not verified.
- PostgreSQL persists local state; Redis is intentionally disposable and is not a recovery source.
- The destructive reset intentionally has no backup or seed recovery yet; deleted local PostgreSQL data is irreversible until the owning phases implement those capabilities.
- The current reset allowlists only the P01-R01 services and volume; later local dependencies must extend its ownership checks before becoming resettable.
