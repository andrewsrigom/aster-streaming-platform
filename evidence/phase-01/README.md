# Phase 01 Evidence Index

- Phase status: `IN_PROGRESS`
- Environment: Windows host; WSL distribution registered as Ubuntu-20.04 with Ubuntu 24.04 userspace
- Evidence date: 2026-08-26
- Active Phase 01 work item: P01-R06 is active from released P01-R05 squash `4d24335`

## Work items

| Work item | Requirement | Acceptance | Artifact |
|---|---|---|---|
| First Docker-only PostgreSQL and Redis checkpoint | P01-R01 | RELEASED | [`local-platform-checkpoint.txt`](local-platform-checkpoint.txt) |
| Explicit project-scoped destructive local reset | P01-R02 | RELEASED | [`local-reset.txt`](local-reset.txt) |
| Process-start validation and secret classification | P01-R03 | RELEASED | [`runtime-configuration.txt`](runtime-configuration.txt) |
| Structured logging, redaction, and trace correlation | P01-R04 | RELEASED | [`runtime-logging.txt`](runtime-logging.txt) |
| Express HTTP boundary and Apollo drain compatibility | P01-R11 | RELEASED | [`http-adapter.txt`](http-adapter.txt) |
| Runtime lifecycle, health state, and bounded shutdown | P01-R05 | RELEASED | [`runtime-lifecycle.txt`](runtime-lifecycle.txt) |
| Bounded runtime, HTTP, dependency, and export metrics | P01-R06 | IMPLEMENTED; verification pending | [`runtime-telemetry.txt`](runtime-telemetry.txt) |
| Remaining runtime design preflight | P01-R06–R10 | PLANNED | [`runtime-runway-preflight.txt`](runtime-runway-preflight.txt) |

P01-R01 and P01-R02 are released on `main`. P01-R03 is released through protected squash `c5a707d`; P01-R04 through `e33f90b`; P01-R11 through `93147ac`; and P00-R06 through `92d3531`. P01-R05 is released through protected squash `4d24335`: closeout run `33004817099`, all review discussions, final review, and exact post-merge run `33004926766` pass. P01-R06 is active from that clean released head. Its local implementation, focused tests, compatibility diagnostic, changed-scope gate, audit, and first evidence are present; the forced complete graph, clean checkout, review, protected CI, and release gates remain pending. Broker, object storage, Collector/backend, Identity service composition, product schemas, and migrations remain unimplemented.

## Current limitations

- Measurements use one Docker Desktop and WSL host with warm image state after the first recorded pull.
- The selected image indexes contain amd64 and arm64 manifests, but runtime behavior is measured only on amd64.
- Native Windows, macOS, rootless Docker, Podman, and alternate Compose implementations are not verified.
- PostgreSQL persists local state; Redis is intentionally disposable and is not a recovery source.
- The destructive reset intentionally has no backup or seed recovery yet; deleted local PostgreSQL data is irreversible until the owning phases implement those capabilities.
- The current reset allowlists only the P01-R01 services and volume; later local dependencies must extend its ownership checks before becoming resettable.
- P01-R11 uses a synthetic Apollo schema and loopback-only diagnostic. P01-R05 proves reusable process shutdown separately, but no deployable service, representative load, or comparative Express/Fastify performance exists yet.
- The remaining-runtime preflight does not select a client or image; upstream metadata and every affected compatibility result must be repeated by the owning work item.
