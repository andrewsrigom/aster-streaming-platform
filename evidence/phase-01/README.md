# Phase 01 Evidence Index

- Phase status: `IN_PROGRESS`
- Environment: Windows host; WSL distribution registered as Ubuntu-20.04 with Ubuntu 24.04 userspace
- Evidence date: 2026-08-26
- Active Phase 01 work item: none; P01-R05 is blocked by the P00-R06 governance correction

## Work items

| Work item | Requirement | Acceptance | Artifact |
|---|---|---|---|
| First Docker-only PostgreSQL and Redis checkpoint | P01-R01 | VERIFIED | [`local-platform-checkpoint.txt`](local-platform-checkpoint.txt) |
| Explicit project-scoped destructive local reset | P01-R02 | VERIFIED | [`local-reset.txt`](local-reset.txt) |
| Process-start validation and secret classification | P01-R03 | VERIFIED | [`runtime-configuration.txt`](runtime-configuration.txt) |
| Structured logging, redaction, and trace correlation | P01-R04 | RELEASED | [`runtime-logging.txt`](runtime-logging.txt) |
| Express HTTP boundary and Apollo drain compatibility | P01-R11 | VERIFIED | [`http-adapter.txt`](http-adapter.txt) |

P01-R01 candidate commit `563d09f` passed the initial clean public-checkout repeat and protected run `32947483503`; corrected candidate `c246051` closed the project-name override found by review. P01-R02 implementation `3fa3994` passed reset, recovery, isolation, and public-checkout evidence; remediation `d5f857c` closed released-label compatibility and hidden-resource review. P01-R03 initial implementation `027539f`, self-review `e7cbaed`, and URL remediation `a6a12b6` passed compatibility, license, clean-checkout, redaction, and protected checks. Repeated automated review then hardened source enumeration, ownership, error provenance, tuple and issue bounds, unrelated-host filtering, and preflight ordering through final implementation `4ff4c3e`. Seven final remediation runs through `32962358373` passed, all nine discussions are resolved, and final review comment `5424539572` reports no major issue. P01-R04 implementation `fca410d`, public documentation candidate `6eedca0`, and protected candidate `34e3cb9` pass 14 focused tests plus compatibility, redaction, correlation, declaration, license, audit, isolated process observations, the complete local graph, an exact clean public-checkout repeat, protected run `32966113415`, and independent review `5424999783`; it is released through squash `e33f90b`. P01-R11 final candidate `487b403` passes eight focused real-socket/Apollo tests, the diagnostic, exact clean-checkout support, 31 of 31 forced local tasks, protected run `32981788859`, dependency/license review, audit, and nine resolved review discussions; release remains pending protected merge. Broker, object storage, OpenTelemetry SDK/backend, application runtime, lifecycle coordinator, and product schemas remain outside these checkpoints.

## Current limitations

- Measurements use one Docker Desktop and WSL host with warm image state after the first recorded pull.
- The selected image indexes contain amd64 and arm64 manifests, but runtime behavior is measured only on amd64.
- Native Windows, macOS, rootless Docker, Podman, and alternate Compose implementations are not verified.
- PostgreSQL persists local state; Redis is intentionally disposable and is not a recovery source.
- The destructive reset intentionally has no backup or seed recovery yet; deleted local PostgreSQL data is irreversible until the owning phases implement those capabilities.
- The current reset allowlists only the P01-R01 services and volume; later local dependencies must extend its ownership checks before becoming resettable.
- P01-R11 uses a synthetic Apollo schema and loopback-only diagnostic. It does not yet prove a deployable service, complete process shutdown, representative load, or comparative Express/Fastify performance.
