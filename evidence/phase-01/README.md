# Phase 01 Evidence Index

- Phase status: `IN_PROGRESS`
- Environment: Windows host; WSL distribution registered as Ubuntu-20.04 with Ubuntu 24.04 userspace
- Evidence date: 2026-08-26
- Active work item: none; P01-R04 is the first `READY` item

## Work items

| Work item | Requirement | Acceptance | Artifact |
|---|---|---|---|
| First Docker-only PostgreSQL and Redis checkpoint | P01-R01 | VERIFIED | [`local-platform-checkpoint.txt`](local-platform-checkpoint.txt) |
| Explicit project-scoped destructive local reset | P01-R02 | VERIFIED | [`local-reset.txt`](local-reset.txt) |
| Process-start validation and secret classification | P01-R03 | VERIFIED | [`runtime-configuration.txt`](runtime-configuration.txt) |

P01-R01 candidate commit `563d09f` passed the initial clean public-checkout repeat and protected run `32947483503`; corrected candidate `c246051` closed the project-name override found by review. P01-R02 implementation `3fa3994` passed reset, recovery, isolation, and public-checkout evidence; remediation `d5f857c` closed released-label compatibility and hidden-resource review. P01-R03 initial implementation `027539f`, self-review `e7cbaed`, and URL remediation `a6a12b6` passed compatibility, license, clean-checkout, redaction, and protected checks. Repeated automated review then hardened source enumeration, ownership, error provenance, tuple and issue bounds, unrelated-host filtering, and preflight ordering through final implementation `4ff4c3e`. Seven final remediation runs through `32962358373` passed, all nine discussions are resolved, and final review comment `5424539572` reports no major issue. Broker, object storage, telemetry, application runtime, HTTP adapter, and product schemas remain outside these verified checkpoints.

## Current limitations

- Measurements use one Docker Desktop and WSL host with warm image state after the first recorded pull.
- The selected image indexes contain amd64 and arm64 manifests, but runtime behavior is measured only on amd64.
- Native Windows, macOS, rootless Docker, Podman, and alternate Compose implementations are not verified.
- PostgreSQL persists local state; Redis is intentionally disposable and is not a recovery source.
- The destructive reset intentionally has no backup or seed recovery yet; deleted local PostgreSQL data is irreversible until the owning phases implement those capabilities.
- The current reset allowlists only the P01-R01 services and volume; later local dependencies must extend its ownership checks before becoming resettable.
