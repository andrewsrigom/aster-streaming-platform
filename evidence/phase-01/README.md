# Phase 01 Evidence Index

- Phase status: `IN_PROGRESS`
- Environment: Windows host; WSL distribution registered as Ubuntu-20.04 with Ubuntu 24.04 userspace
- Evidence date: 2026-08-26
- Active Phase 01 work item: P01-R07 post-merge cold-task correction from squash `0dd4dad`

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
| Narrow clock, ID, PostgreSQL, Redis, broker, and object-storage adapters | P01-R07 | IMPLEMENTED; post-merge task-order correction pending | [`platform-adapters.txt`](platform-adapters.txt) |
| Remaining runtime design preflight | P01-R06–R10 | PLANNED | [`runtime-runway-preflight.txt`](runtime-runway-preflight.txt) |

P01-R01 and P01-R02 are released on `main`. P01-R03 is released through protected squash `c5a707d`; P01-R04 through `e33f90b`; P01-R11 through `93147ac`; P00-R06 through `92d3531`; and P01-R05 through `4d24335`. P01-R06 is released through protected squash `8dff9d8`: exact source and clean-checkout gates, both review remediations, final review, protected closeout run `33012535152`, and post-merge run `33012664408` pass. P01-R07 adapter source passed focused, affected, forced, frozen-checkout, review, protected pull-request run `33024975611`, and merged as `0dd4dad`. Post-merge run `33026244011` exposed one cold typecheck/build ordering defect. Corrective candidate `f38485a` adds only the missing dependency-build edge and passes an exact frozen offline install plus 46/46 forced tasks without cache. Protected correction, merge, and successful post-merge confirmation remain pending. Real dependency containers and interoperability, Collector/backend, Identity service composition, product schemas, and migrations remain unimplemented.

## Current limitations

- Measurements use one Docker Desktop and WSL host with warm image state after the first recorded pull.
- The selected image indexes contain amd64 and arm64 manifests, but runtime behavior is measured only on amd64.
- Native Windows, macOS, rootless Docker, Podman, and alternate Compose implementations are not verified.
- PostgreSQL persists local state; Redis is intentionally disposable and is not a recovery source.
- The destructive reset intentionally has no backup or seed recovery yet; deleted local PostgreSQL data is irreversible until the owning phases implement those capabilities.
- The current reset allowlists only the P01-R01 services and volume; later local dependencies must extend its ownership checks before becoming resettable.
- P01-R11 uses a synthetic Apollo schema and loopback-only diagnostic. P01-R05 proves reusable process shutdown separately, but no deployable service, representative load, or comparative Express/Fastify performance exists yet.
- The remaining-runtime preflight does not select the P01-R09/P01-R10 service images; upstream metadata and every affected compatibility result must be repeated by the owning work item.
