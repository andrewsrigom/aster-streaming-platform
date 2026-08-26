# Work Item: Deliver the first Docker-only local platform checkpoint

- Status: IN_PROGRESS
- Owner: Local platform operations
- Phase: 01
- Requirement IDs: P01-R01
- Created: 2026-08-26
- Updated: 2026-08-26

## Outcome

One documented Docker Compose command starts the verified P01-R01 slice from empty project-scoped state using exact multi-architecture PostgreSQL and Redis images, bounded resources, an internal network, health-gated one-shot initialization, persistent PostgreSQL storage, and an ongoing status container. The command requires no host Node.js, package manager, database, Redis, hosted credential, or unpublished step, and protected CI plus clean-start evidence prove its behavior.

## Current behavior

Phase 00 is verified and released at `da7e6d0`. Docker Engine `26.0.0`, Compose `2.26.1`, FFmpeg, and FFprobe respond on the recorded WSL host, but the repository has no Compose file, local dependency stack, container command, Phase 01 evidence, application runtime, or selected local dependency image. Four stopped containers from unrelated projects exist and remain outside Aster's scope.

## Proposed behavior

Add a core Compose checkpoint containing PostgreSQL `18.6` and Redis `8.10.0`, pinned by exact official-image tags and multi-platform digests. Keep both dependencies off host ports on an internal network. Persist only PostgreSQL product-authority state, keep Redis explicitly non-authoritative, bound CPU, memory, PIDs, startup, and shutdown, and gate a one-shot protocol check before an ongoing platform-status service becomes healthy. Add deterministic configuration tests, an infrastructure-aware CI smoke job, public license notices, exact operator commands, and evidence from a unique clean Compose project.

## Boundaries

- Owning context: local platform operations; no product bounded context owns data in this slice.
- Affected services/packages: `infra/compose/`, repository platform-verification tooling, CI classification and workflow, root scripts and documentation, third-party notices, Phase 01 evidence, and repository memory.
- Authoritative data: the named PostgreSQL volume is durable local authority for later context-owned schemas; this slice creates only the synthetic local database and no product schema or record.
- Read models/caches: Redis is a bounded non-authoritative local cache and coordination dependency; its state is disposable and is not part of recovery.
- Trust boundaries: public Docker registry manifests and layers, Docker daemon and Compose CLI, container entrypoints, local synthetic configuration, internal Compose DNS/networking, health output, and the host filesystem containing the checkout.
- External dependencies: Docker Official Images for PostgreSQL and Redis and the public registry; no hosted application resource, account, secret, or paid service.

## Invariants

- PostgreSQL remains the future durable authority and Redis remains non-authoritative.
- No dependency or status port is published to the host in P01-R01.
- Image references include exact version tags and immutable multi-platform digests with amd64 and arm64 manifests.
- The supported floor is the measured Docker Engine `26.0.0` and Docker Compose `2.26.1`; newer compatible versions may run the same validated Compose contract.
- PostgreSQL 18 data mounts at `/var/lib/postgresql`, matching the official image's version-specific layout.
- Startup readiness depends on protocol checks and successful one-shot initialization, not container creation order alone.
- CPU, memory, PIDs, health retries, wait time, and shutdown grace are finite.
- Commands affect only the explicit Aster Compose project; unrelated containers, images, volumes, and networks are not changed.
- Broker, object storage, telemetry, Node runtime, HTTP adapter, migrations, product seed, destructive reset, and public application URL remain owned by later Phase 01 work.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Image tag or digest cannot resolve for the host architecture | startup fails before service readiness; no floating fallback | pull error and manifest verification output |
| PostgreSQL or Redis misses its health deadline | dependent initialization and status remain blocked; the command exits nonzero at its bounded wait | Compose health state, inspect output, and bounded service logs |
| Protocol check or one-shot initialization fails | initializer exits nonzero and status does not start | initializer exit code and redacted logs |
| A dependency fails after startup | its health becomes unhealthy and the status health check fails | `docker compose ps`, health output, and service logs |
| Existing PostgreSQL volume is incompatible with the pinned major | startup fails without mutating another project; operator inspects or uses the later authorized reset path | PostgreSQL logs and exact project/volume identity |
| Resource limit is exhausted | the affected container fails or becomes unhealthy without consuming unbounded host resources | container state, health output, and measured resource sample |
| CI smoke cleanup runs after failure | only the unique CI Compose project and its volumes are removed | final cleanup command and project resource query |

## Data and contracts

- Schema/migration: none; the official entrypoint creates only the configured empty local database and user.
- GraphQL: none.
- Events: none; no broker is introduced by this work item.
- Cache: Redis uses bounded memory and an eviction policy suitable for non-authoritative state; it has no durable recovery claim.
- Compatibility: PostgreSQL `18.6-alpine3.23` and Redis `8.10.0-alpine` official multi-platform manifests are pinned by digest; Compose syntax is validated on the supported floor and hosted runner.
- Retention/deletion: the normal stop preserves the named PostgreSQL volume; P01-R02 later owns the explicit destructive reset. Verification uses a unique project and deletes only that checked project after evidence capture.

## Security and privacy

- Authorization: local Docker daemon access is the only privilege; no hosted authorization or product identity exists.
- Input limits: fixed Compose file, exact image references, fixed service set, bounded resource values, internal network, and no user-controlled path or remote URL.
- Sensitive data: local synthetic credentials are documented as non-production and never logged as values; no token, personal data, signed URL, or hosted credential is used.
- Abuse cases: floating-image substitution, hostile registry content, exposed databases, unbounded container resources, shell interpolation, health-command injection, cross-project deletion, and misleading readiness are addressed through digests, no host ports, fixed commands, limits, exact project checks, and adverse tests.

## Implementation steps

1. Record current official support, image, Compose, and license evidence; resolve immutable multi-platform digests.
2. Add the smallest Compose topology for PostgreSQL, Redis, one-shot initialization, and ongoing status with internal networking, exact mounts, health checks, resource limits, and graceful stop behavior.
3. Add deterministic configuration validation and adverse tests without making the ordinary source gate require Docker.
4. Add infrastructure change classification and a protected CI job that validates, starts, inspects, and always cleans a unique Compose project.
5. Document the exact Docker-only startup, status, stop, persistence, diagnostics, limitations, licenses, and future reset boundary.
6. Start from a unique empty local project, verify dependency versions, health, initialization, ongoing failure detection, persistence, resource footprint, stop/restart, and exact cleanup; store raw evidence under `evidence/phase-01/`.
7. Run repository gates, publish one coherent protected pull request, address review, merge only after required checks pass, and verify post-merge `main`.

## Tests

- Domain: not applicable; no product rule exists.
- Application: not applicable; no application runtime exists.
- Integration: real Docker pull/config/start/wait/status/version/protocol/persistence/stop/restart/failure/cleanup checks against a unique project.
- Contract: exact images/digests, no host ports, internal network, PostgreSQL 18 mount, Redis non-authority settings, finite resource and health values, initializer dependency conditions, and CI aggregate behavior.
- Browser: not applicable; P01-R01 provides status output rather than a UI or application URL.
- Performance/failure: record clean pull/start duration, idle container CPU/memory/PIDs, volume and image footprint, unhealthy transition after dependency stop, and recovery; values remain host-specific observations.

## Evidence

- Commands: official-source lookup, `docker buildx imagetools inspect`, `docker compose config`, clean unique-project pull and startup, `ps`, protocol/version checks, resource sample, dependency stop/recovery, persistence check, exact cleanup, `pnpm check`, registry audit, and hosted workflow queries.
- Raw artifact path: `evidence/phase-01/local-platform-checkpoint.txt` plus an index at `evidence/phase-01/README.md`.
- Acceptance result: PASS_LOCAL for implementation, clean-start, persistence, failure, resource, and policy checks; clean public-checkout and protected hosted smoke remain pending.

## Rollback or recovery

Before merge, stop and remove only the unique test project after validating its exact Compose labels and project name; revert the Compose, verifier, CI, documentation, and evidence change as one slice. After merge, normal `docker compose down` preserves PostgreSQL data. Do not provide or run a public volume-deleting reset until P01-R02 defines local-only confirmation and adverse tests. A version rollback requires a fresh compatible volume or documented PostgreSQL migration; do not attach a PostgreSQL 18 volume to another major.

## Documentation updates

- `README.md`
- `LICENSES.md`
- `docs/architecture/TECHNOLOGY_BASELINE.md`
- `docs/operations/LOCAL_DEVELOPMENT.md`
- `.ai/DECISIONS_LEDGER.md`
- `.ai/CURRENT_STATE.md`
- `.ai/WORK_QUEUE.md`
- `.ai/SESSION_LOG.md`
- `.ai/HANDOFF.md`
- `evidence/phase-01/README.md`
- `evidence/phase-01/local-platform-checkpoint.txt`

## Completion checklist

- [ ] Requirements satisfied
- [x] Tests pass
- [x] Evidence captured
- [x] Documentation current
- [x] `.ai/` state updated
- [x] Remaining risks recorded
