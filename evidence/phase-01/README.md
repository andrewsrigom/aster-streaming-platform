# Phase 01 Evidence Index

- Phase status: `IN_PROGRESS`
- Environment: Windows host; WSL distribution registered as Ubuntu-20.04 with Ubuntu 24.04 userspace
- Evidence date: 2026-08-27
- Active Phase 01 work item: P01-R09 on released `main` at `f174aa6`

## Work items

| Work item | Requirement | Acceptance | Artifact |
|---|---|---|---|
| First Docker-only PostgreSQL and Redis checkpoint | P01-R01 | RELEASED | [`local-platform-checkpoint.txt`](local-platform-checkpoint.txt) |
| Explicit project-scoped destructive local reset | P01-R02 | RELEASED | [`local-reset.txt`](local-reset.txt) |
| Process-start validation and secret classification | P01-R03 | RELEASED | [`runtime-configuration.txt`](runtime-configuration.txt) |
| Structured logging, redaction, and trace correlation | P01-R04 | RELEASED | [`runtime-logging.txt`](runtime-logging.txt) |
| Express HTTP boundary and Apollo drain compatibility | P01-R11 | RELEASED | [`http-adapter.txt`](http-adapter.txt) |
| Runtime lifecycle, health state, and bounded shutdown | P01-R05 | RELEASED | [`runtime-lifecycle.txt`](runtime-lifecycle.txt) |
| Bounded runtime, HTTP, dependency, and export metrics | P01-R06 | RELEASED | [`runtime-telemetry.txt`](runtime-telemetry.txt) |
| Narrow clock, ID, PostgreSQL, Redis, broker, and object-storage adapters | P01-R07 | RELEASED | [`platform-adapters.txt`](platform-adapters.txt) |
| Propagated deadlines, recoverable readiness, health routes, and Identity runtime composition | P01-R08 | RELEASED through PR 16; exact post-merge passed | [`runtime-composition.txt`](runtime-composition.txt) |
| Real core, Kafka, S3 and Collector/Prometheus protocol, recovery and shutdown | P01-R09 | IMPLEMENTED local slices; combined acceptance pending | [`real-integration.txt`](real-integration.txt) |
| Remaining runtime design preflight | P01-R06–R10 | PLANNED | [`runtime-runway-preflight.txt`](runtime-runway-preflight.txt) |

P01-R01 through P01-R08 and P01-R11 are released. P01-R08 merged through PR 16 squash `f174aa6` after exact-head run `33036056777`; exact post-merge run `33036182208` passed. P01-R09's real core, Kafka, S3 and Collector/Prometheus slices pass locally. Combined multi-adapter acceptance, protected release, product schemas and migrations remain pending.

## Current limitations

- Measurements use one Docker Desktop and WSL host with warm image state after the first recorded pull.
- The selected image indexes contain amd64 and arm64 manifests, but runtime behavior is measured only on amd64.
- Native Windows, macOS, rootless Docker, Podman, and alternate Compose implementations are not verified.
- PostgreSQL persists local state; Redis is intentionally disposable and is not a recovery source.
- The destructive reset intentionally has no backup or seed recovery yet; deleted local PostgreSQL data is irreversible until the owning phases implement those capabilities.
- The current reset allowlists only the P01-R01 services and volume; later local dependencies must extend its ownership checks before becoming resettable.
- P01-R11 uses a synthetic Apollo schema and loopback-only diagnostic. P01-R05 proves reusable process shutdown separately, but no deployable service, representative load, or comparative Express/Fastify performance exists yet.
- The remaining-runtime preflight does not select the P01-R09/P01-R10 service images; upstream metadata and every affected compatibility result must be repeated by the owning work item.
