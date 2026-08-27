# Phase 01 Evidence Index

- Phase status: `IN_PROGRESS`
- Environment: Windows host; WSL distribution registered as Ubuntu-20.04 with Ubuntu 24.04 userspace
- Evidence date: 2026-08-26
- Active Phase 01 work item: P01-R08 on corrective released `main` at `61226eb`

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
| Propagated deadlines, recoverable readiness, health routes, and Identity runtime composition | P01-R08 | IMPLEMENTED locally; acceptance/release closeout pending | [`runtime-composition.txt`](runtime-composition.txt) |
| Remaining runtime design preflight | P01-R06–R10 | PLANNED | [`runtime-runway-preflight.txt`](runtime-runway-preflight.txt) |

P01-R01 through P01-R07 and P01-R11 are released. P01-R07 passed pull request 14 exact-head run `33024975611`, corrective pull request 15 run `33026707150`, and exact corrective post-merge run `33026799005`; corrective squash `61226eb` is the P01-R08 base. P01-R08 is active locally. Real dependency containers and interoperability, Collector/backend, product schemas, and migrations remain unimplemented.

## Current limitations

- Measurements use one Docker Desktop and WSL host with warm image state after the first recorded pull.
- The selected image indexes contain amd64 and arm64 manifests, but runtime behavior is measured only on amd64.
- Native Windows, macOS, rootless Docker, Podman, and alternate Compose implementations are not verified.
- PostgreSQL persists local state; Redis is intentionally disposable and is not a recovery source.
- The destructive reset intentionally has no backup or seed recovery yet; deleted local PostgreSQL data is irreversible until the owning phases implement those capabilities.
- The current reset allowlists only the P01-R01 services and volume; later local dependencies must extend its ownership checks before becoming resettable.
- P01-R11 uses a synthetic Apollo schema and loopback-only diagnostic. P01-R05 proves reusable process shutdown separately, but no deployable service, representative load, or comparative Express/Fastify performance exists yet.
- The remaining-runtime preflight does not select the P01-R09/P01-R10 service images; upstream metadata and every affected compatibility result must be repeated by the owning work item.
