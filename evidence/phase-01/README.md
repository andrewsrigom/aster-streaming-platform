# Phase 01 Evidence Index

- Phase status: `IN_PROGRESS`
- Environment: Windows host; WSL distribution registered as Ubuntu-20.04 with Ubuntu 24.04 userspace
- Evidence date: 2026-08-26
- Active Phase 01 work item: P01-R05 is implemented locally on a branch rebased onto released `main`

## Work items

| Work item | Requirement | Acceptance | Artifact |
|---|---|---|---|
| First Docker-only PostgreSQL and Redis checkpoint | P01-R01 | RELEASED | [`local-platform-checkpoint.txt`](local-platform-checkpoint.txt) |
| Explicit project-scoped destructive local reset | P01-R02 | RELEASED | [`local-reset.txt`](local-reset.txt) |
| Process-start validation and secret classification | P01-R03 | RELEASED | [`runtime-configuration.txt`](runtime-configuration.txt) |
| Structured logging, redaction, and trace correlation | P01-R04 | RELEASED | [`runtime-logging.txt`](runtime-logging.txt) |
| Express HTTP boundary and Apollo drain compatibility | P01-R11 | RELEASED | [`http-adapter.txt`](http-adapter.txt) |
| Runtime lifecycle, health state, and bounded shutdown | P01-R05 | IMPLEMENTED | [`runtime-lifecycle.txt`](runtime-lifecycle.txt) |
| Remaining runtime design preflight | P01-R06–R10 | PLANNED | [`runtime-runway-preflight.txt`](runtime-runway-preflight.txt) |

P01-R01 and P01-R02 are released on `main`. P01-R03 is released through protected squash `c5a707d`; P01-R04 is released through `e33f90b`; P01-R11 is released through `93147ac` with post-merge run `32982613740` passing. P00-R06 is released through `92d3531` with post-merge run `32999467446` passing. P01-R05 implementation `60e9808` has been replayed onto that released base. Initial protected run `33000352054` passed, and review remediation `6b9acb2` force-closes resource-owning stage failures after eligible cleanup. Its exact focused 36-test gate, 15-task affected gate, audit, documentation, memory, and security checks pass. The prior exact isolated checkout remains supporting evidence for unchanged bootstrap and packaging behavior; exact remediation behavior has fresh local socket, process, and package evidence. The runway preflight records only candidate research for P01-R06 through P01-R10. Broker, object storage, OpenTelemetry SDK/backend, Identity service composition, product schemas, and migrations remain unimplemented.

## Current limitations

- Measurements use one Docker Desktop and WSL host with warm image state after the first recorded pull.
- The selected image indexes contain amd64 and arm64 manifests, but runtime behavior is measured only on amd64.
- Native Windows, macOS, rootless Docker, Podman, and alternate Compose implementations are not verified.
- PostgreSQL persists local state; Redis is intentionally disposable and is not a recovery source.
- The destructive reset intentionally has no backup or seed recovery yet; deleted local PostgreSQL data is irreversible until the owning phases implement those capabilities.
- The current reset allowlists only the P01-R01 services and volume; later local dependencies must extend its ownership checks before becoming resettable.
- P01-R11 uses a synthetic Apollo schema and loopback-only diagnostic. P01-R05 proves reusable process shutdown separately, but no deployable service, representative load, or comparative Express/Fastify performance exists yet.
- The remaining-runtime preflight does not select a client or image; upstream metadata and every affected compatibility result must be repeated by the owning work item.
