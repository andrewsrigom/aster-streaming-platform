# Work Item: Ship the Docker-only Phase 01 Demonstration

- Status: IN_PROGRESS
- Owner: Shared local platform and product-empty Identity runtime
- Phase: 01
- Requirement IDs: P01-R10
- Created: 2026-08-27
- Updated: 2026-08-27

## Outcome

An evaluator with Git and Docker/Compose can build/start the reference Identity service, observe health and metrics, stop it cleanly and explicitly reset only local Aster data. Named lightweight and optional profiles avoid requiring the full laboratory. Complete Phase 01 evidence without claiming a playable product.

## Current behavior

P01-R09 is released through PR 17 squash `a1f728196aa7a4d8a79181042f75a876610d2b11`. Protected run `33041524806` and exact post-merge run `33041787663` pass the real eight-scenario matrix and all applicable gates. Local cold source `cbc5255` passed 49/49 uncached tasks, audit and clean Git. Executing-agent initial/confirmation reviews have no blocker; no independent approval is claimed. See `evidence/phase-01/real-integration.txt`.

This branch starts from that clean merge. Image checkpoint `4837207` is followed by the locally passing runtime profile: packaged Identity with PostgreSQL/Redis, loopback 3100, optional classified database password, guarded five-service/two-network reset and helper tmpfs. Optional exporter/integration/observability/full profiles now pass local runtime checks; final clean/protected closeout remains.

## Proposed behavior

First prove portable production packaging and an immutable-base non-root Identity image. Then extend exact reset ownership and add the lightweight runtime profile. Reuse proven dependency images for optional integration/observability/full profiles; connect the existing OTLP exporter through validated optional configuration. Finish one clean Docker-only demonstration, resource/failure/reset evidence and protected release.

## Boundaries

- Owner/data: shared infrastructure, product-empty Identity, synthetic local data only; Redis/telemetry non-authoritative.
- Paths: `infra/docker/identity.Dockerfile`, `.dockerignore`, package file allowlists, Compose/configuration, reset/platform/CI tools and tests, config/Identity composition, docs/evidence.
- Trust boundaries: build context, package/image artifacts, process configuration, UID/capabilities/mounts/ports, health probes and destructive cleanup.
- External dependencies: already-pinned clients/images. Node candidate is official `24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df`; amd64/arm64 index and upstream MIT recipe verified, packaged runtime/footprint measured locally in the linked evidence.
- No new framework, product service, authoritative owner or hosted resource.

Optional-profile implementation: keep `compose.yml` as the core/runtime/integration model and use one explicit `observability.yml` overlay to enable Identity's OTLP input for observability/full commands only. Bake the two public telemetry configurations into minimal pinned Collector/Prometheus images, avoiding mutable host config mounts and reset path translation. Reset will inspect the fixed combined model and accept only the base or exact ordered base-plus-overlay provenance. The existing platform status helper will probe the real OTLP receiver and Prometheus in the overlay; telemetry failure must not affect Identity readiness. Broker/storage remain internal and are not Identity runtime dependencies.

## Invariants

- Evaluator requires no host Node, hosted credential or manual repair.
- Preserve cheap core startup; optional profiles have finite resources and explicit persistence/cleanup ownership.
- Extend reset guards before accepting new services/volumes; preserve unrelated resources and image caches.
- Application image runs non-root, read-only where compatible, with dropped capabilities and bounded shutdown. Expose only documented loopback ports.
- Exclude secrets, host dependency/build state and Git metadata from the Docker build context.
- Do not add production broker/S3 dependencies to Identity or implement auth, GraphQL, media, SLOs or dashboards.
- Collector/Prometheus serve existing metrics. Defer empty Tempo/Loki/Grafana until owned trace/log export or a concrete dashboard question requires them.

## Failure behavior

| Failure | Expected behavior | Evidence |
|---|---|---|
| Docker unavailable, unsupported platform or occupied port | Visible bounded diagnosis, no broad repair | Compose/health output |
| PostgreSQL/Redis unavailable | Live but not ready; recover through existing monitor | Finite dependency/readiness signals |
| Optional telemetry unavailable | Readiness preserved; flush/export remains finite and truthful | Export and lifecycle result |
| SIGTERM/container stop | Ordered drain within ten seconds, with orchestrator grace | Natural exit and lifecycle events |
| Foreign or partial reset state | Validate all exact owners before deletion; refuse foreign state | Adverse tests and unchanged inventory |
| Cold download failure | Fail visibly; retain caches, retry only the failed command | Actual build result |

## Data and contracts

- Schema, GraphQL, events and cache policy: none.
- Configuration: optional exporter settings and an explicitly classified optional database-password field for Docker configuration; current seven-variable URI callers remain compatible. Construct the effective URL at the validated configuration boundary, reject conflicting password sources and do not weaken the credential-URL scanner or rely on hidden vendor environment variables.
- Packaging: production-only portable output and built-file allowlists; preserve dependency notices. No bundler or global workspace injection change.
- Retention/deletion: named volumes explicitly classified; existing local intent and exact destructive confirmation remain required.
- Compatibility: exact Node/pnpm; Docker 26.0.0/Compose 2.26.1 floor. Other OS/architectures remain unverified unless measured.

## Security and privacy

No auth/trust-model change. Frozen installation and reviewed image digests remain mandatory. Exporter settings must reject unsafe/credential-bearing URLs without reflecting values. Validate profile/service/volume ownership, mounts and network attachments before reset. No global prune, daemon reset or unrelated-state cleanup.

## Implementation steps

1. [completed] Pinned non-root Identity image builds inside Docker and passes package/controlled HTTP diagnostics. Seven workspace packages load; all 114 external installed versions match the lockfile; no dev/test/host tree ships. Image: 255269001 bytes, UID 1000. Missing configuration exits 1; all probe containers are removed. Platform/CI tests pass 21/21 each and affected graph passes 49/49 (52.272 s). See `evidence/phase-01/docker-demo.txt`.
2. [completed] Optional password/configuration, exact reset and runtime profile pass. Fixed internal-only port non-publication with an Identity-only edge bridge and inherited helper volumes with tmpfs. Real PostgreSQL/Redis loss keeps liveness 200 and changes readiness to 503; restart recovers automatically. Docker image/build-start 39.71 s with cached base/install layers; natural SIGTERM 561 ms; core-only start 7.38 s. Reset removes only synthetic owned resources, supports legacy helper volumes and preserves the complete unrelated inventory. Config 17/17, Identity 33/33, platform/reset 25/25, affected graph 49/49 (28 cached, 18.58 s).
3. [completed] Optional integration/observability/full profiles, classified OTLP configuration and real metric delivery pass. Collector loss preserves Identity readiness and recovers; shutdown with unavailable Collector exits 143 in 4223 ms with truthful degradation. Exact reset removes nine containers, two networks and four volumes while preserving unrelated inventory. Focused config/Identity/platform/CI checks: 20/34/29/22 passing.
4. [in progress] Prove clean Docker-only runtime/full commands, partial profiles, dependency recovery, stop/reset preservation; document ports, volumes, architecture, FFmpeg and resources. Measure startup, idle footprint and image/volume sizes.
5. [pending] Complete affected/full gates, applicable CI, one review plus confirmation and Phase 01 evidence index; check Phase 02 prerequisites, squash and verify post-merge before starting Phase 02.

## Tests

- Domain/browser/media: not applicable; no product behavior.
- Unit/contracts: packaging/configuration, health probe, exact reset and container/CI policy.
- Integration: packaged Identity with PostgreSQL/Redis, runtime/full health, OTLP/Prometheus, stop and reset.
- Failure: occupied port, stopped dependency/backend, foreign ownership and partial state.
- Performance: startup/idle observations only; no load/SLO/throughput claim.

## Evidence

- Commands: focused build/package/policy checks, `pnpm check:changed`, exact Docker-only commands and applicable integration; full `pnpm check --force` at the stabilized candidate.
- Artifact: `evidence/phase-01/docker-demo.txt`.
- Iteration gate: smallest changed package/policy test and affected packaging/profile experiment.
- Candidate gate: affected graph plus affected runtime/full smoke and exact cleanup.
- Complete gate: clean checkout with no host Node in the evaluator path, profile/failure/resource evidence, full source gate, audit, review and protected CI.
- Heavyweight repeat triggers: image/client/dependency, packaging/context, config/entrypoint, Compose ownership/network/resources, deadlines/shutdown or reset. Do not repeat builds/containers/cold checkout for prose-only changes.
- Review stopping rule: one initial complete review and one confirmation; further rounds only for demonstrated requirement/security/data/availability/public-contract blockers.

## Rollback or recovery

Revert phase-owned packaging/profiles while retaining verified core commands. Remove only validated experiment resources; default data requires explicit reset confirmation. No product migration exists. Keep evidence for any failed image or packaging candidate.

## Documentation updates

README commands, local development/troubleshooting, profile table, config/reset contracts, image/license sources, measured resource envelope, Phase 01 evidence index and concise repository memory. Distinguish diagnostic runtime from playable VOD.

## Completion checklist

- [ ] Requirements satisfied
- [ ] Tests pass
- [ ] Evidence captured
- [ ] Documentation current
- [ ] `.ai/` state updated
- [ ] Remaining risks recorded
