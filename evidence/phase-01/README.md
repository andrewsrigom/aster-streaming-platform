# Phase 01 Evidence Index

- Phase status: `IN_PROGRESS`
- Environment: Windows host; WSL distribution registered as Ubuntu-20.04 with Ubuntu 24.04 userspace
- Evidence date: 2026-08-27
- Active Phase 01 work item: P01-R10 from released `main` at `a1f7281`

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
| Real core, Kafka, S3 and Collector/Prometheus protocol, recovery and shutdown | P01-R09 | RELEASED through PR 17; exact post-merge passed | [`real-integration.txt`](real-integration.txt) |
| Docker-only Identity image and final evaluator profiles | P01-R10 | VERIFIED at clean source 38801ce and protected heads d148bf7/d751109; final closeout pending | [`docker-demo.txt`](docker-demo.txt) |
| Historical runtime design preflight | P01-R06–R10 | Planning record; implementation evidence above supersedes it | [`runtime-runway-preflight.txt`](runtime-runway-preflight.txt) |

P01-R01 through P01-R09 and P01-R11 are released. PR 17 squash `a1f7281` passes protected run `33041524806` and exact post-merge run `33041787663`, including the complete matrix. P01-R10's non-root production runtime, real database/cache recovery, Windows localhost health, bounded stop and scoped reset pass locally; optional profiles and real metrics also pass locally. Exact clean Docker-only acceptance, occupied-port recovery, 49/49 uncached source tasks and audit pass at `38801ce`. Protected PR 18 runs `33046068184`/`33046678570` pass at `d148bf7`/`d751109`; documentation review remediation and final release remain pending. Product schemas and migrations remain later work.

## Current limitations

- Measurements use one Docker Desktop and WSL host with warm image state after the first recorded pull.
- The selected image indexes contain amd64 and arm64 manifests, but runtime behavior is measured only on amd64.
- Native Windows, macOS, rootless Docker, Podman, and alternate Compose implementations are not verified.
- PostgreSQL persists local state; Redis is intentionally disposable and is not a recovery source.
- The destructive reset intentionally has no backup or seed recovery yet; deleted local PostgreSQL, broker and S3 data and Prometheus history are irreversible until the owning phases implement those capabilities.
- The current reset allowlists nine services, two networks and four volumes; no alternate target or arbitrary overlay is accepted.
- P01-R11 uses a synthetic Apollo schema and loopback-only diagnostic. P01-R05 proves reusable process shutdown separately, and P01-R10 packages the reference service; no representative load or comparative Express/Fastify benchmark exists.
- The historical runtime preflight is planning; the later P01-R09/P01-R10 evidence contains the actual selected images and measured compatibility.
