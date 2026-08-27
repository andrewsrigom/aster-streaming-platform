# Work Item: Prove the Reference Runtime Against Real Local Dependencies

- Status: IN_PROGRESS
- Owner: Aster shared runtime infrastructure and Identity reference composition
- Phase: 01
- Requirement IDs: P01-R09
- Created: 2026-08-27
- Updated: 2026-08-27

## Outcome

Prove the released technical adapters and Identity lifecycle against isolated local PostgreSQL, Redis, Kafka-compatible broker, S3-compatible storage, and Collector/Prometheus containers. Produce runnable synthetic smoke tests and measured failure/recovery evidence without adding product data, GraphQL, media, dashboards, SLOs or hosted resources.

## Current behavior

P01-R08 is released through PR 16 squash `f174aa6a7ffb432136c7a757ec05983fe48195d6`. Protected exact-head run `33036056777` and exact post-merge run `33036182208` passed. Source `282ccb5` passed 49/49 affected tasks and 49/49 forced tasks in an exact frozen clone, the loopback diagnostic, audit and clean Git. This proves controlled recovery and real-client unavailable endpoints, not database/broker/storage interoperability.

P01-R09 checkpoints `0fb247c`, `0cd02ef` and `8ef472d` implement real core, broker/S3 and Collector/Prometheus proof. The only production correction owns PostgreSQL idle-pool errors so dependency stop cannot crash Node or expose the vendor client. Existing core Compose/default project and production Identity dependencies are unchanged.

The complete local matrix now passes all eight scenarios in one fresh six-service/four-volume fixture (135.621 s plus 5.004 s cleanup), including 70 ms all-adapter held-HTTP shutdown. Identity 33/33, eleven ownership guards, 49/49 affected tasks, 21 CI classification/policy tests, Compose validation and audit pass. Cold/forced acceptance and protected release remain pending.

## Proposed behavior

Implement PostgreSQL/Redis and Identity real-runtime smoke proof first using the already-pinned core images. Add only the isolated test connectivity and harness required to run bounded synthetic checks; do not change the default core exposure or begin the final P01-R10 evaluator profile. Then select/pin the remaining approved container candidates using current official maintenance, license, multi-architecture and runtime evidence. Prove broker, object-streaming and telemetry round trips in separate focused slices before one combined acceptance checkpoint.

## Boundaries

- Owning context: Shared infrastructure and the product-empty Identity composition root.
- Authoritative data: No product data. PostgreSQL owns only temporary synthetic fixtures; Redis remains non-authoritative.
- Affected areas: Existing adapter infrastructure/tests, Identity integration tests, scoped integration tooling/Compose configuration, operational evidence and repository memory.
- Trust boundaries: Docker context/endpoint and inspected labels, generated connection settings, process environment, network/protocol responses, timeouts/signals, payload streams, fixture cleanup and image provenance.
- External dependencies: Existing pinned PostgreSQL/Redis images first. Broker/storage/Collector/Prometheus candidates follow the accepted Runtime Platform Runway; no new hosted or paid resource.
- No new framework, database owner, public API, license or architecture boundary without the applicable ADR/owner decision.

## Invariants

- One unique test project owns every created container, network and fixture; validate exact labels/targets before teardown. Never prune global Docker resources or delete the default/user project.
- Keep normal core startup unchanged and unexposed. Any test-only connectivity is explicit, local, bounded and removed with its fixture.
- Real integration runs are explicit commands, not hidden additions to every unit-test or commit hook.
- One lifecycle/signal owner and the existing startup/shutdown bounds remain authoritative.
- Test success requires observed protocol behavior, not an open TCP port, image tag, fake client or shell health output alone.
- Fix only demonstrated adapter/composition blockers, preserving public contracts where possible.
- No product schema, repository, cache policy, event contract, account/profile/session, GraphQL resolver, media asset or CDN publication.

## Failure behavior

| Failure | Expected behavior | Evidence |
|---|---|---|
| Docker is unavailable or points at an unsafe/non-local endpoint | Fail before resource creation with a scoped diagnosis | Preflight result |
| A critical dependency stops or restarts | Identity becomes not ready, remains diagnosable, and recovers through its monitor | Real HTTP snapshots and finite dependency outcomes |
| A database/cache operation times out or is cancelled | Work returns within its budget, ambiguous resources are retired, later safe probes recover | Adapter result and socket/process cleanup |
| Broker or storage is unavailable or partially completes work | Preserve existing delivery/stream ambiguity semantics and bounded cancellation | Synthetic round trip, interruption and checksum evidence |
| Exporter/backend stops | Requests/readiness remain correct and flush/shutdown stays bounded | Collector/Prometheus and failure output |
| A test or process fails mid-fixture | Run finite cleanup only for verified test-owned resources; preserve evidence | Post-cleanup inventory |
| Candidate image has unresolved license or compatibility risk | Stop that selection or use the documented alternative with evidence | Decision and official references |

## Data and contracts

- Schema/migration: No product migration. Temporary synthetic fixtures are created and removed by the harness.
- GraphQL/events/cache: No product contracts or cache policy. Broker tests use a test-owned topic/key and bounded synthetic messages.
- Object storage: A test-owned bucket/prefix and bounded bytes only; no copyrighted media or publication rights claim.
- Public health: Preserve the released finite shape and no-topology rule.
- Compatibility: Exact repository Node/pnpm; exact image digests and architecture/license evidence before adoption. Native-Windows signal support remains unclaimed.

## Security and privacy

- Confirm local Docker ownership before destructive test actions and use argument arrays for spawned commands.
- Do not read hosted credentials or personal data; generated endpoints and test-only credentials stay out of public health and recorded output.
- Bound payload sizes, fixture counts, operation concurrency, command/process deadlines and retries.
- Preserve isolation and resource limits. Do not weaken image/secret/architecture/CI policies to make a smoke test green.

## Implementation steps

1. [completed] Confirm P01-R08 protected release/post-merge success, start from clean main, and perform read-only Docker/core preflight.
2. [completed] Add one explicit PostgreSQL/Redis integration harness with isolated fixture ownership and safe cleanup. Prove successful probes and close before fault injection.
3. [completed] Prove real critical-dependency stop/recovery, operation cancellation/timeout and Identity signal/drain behavior; fix the demonstrated idle-pool error. Core candidate: 30/30 affected tasks, all four integration scenarios and executing-agent confirmation pass.
4. [completed] Pin/test Apache Kafka 4.3.1 and VersityGW 1.7.0; prove bounded synthetic delivery, offset replay, object streams/checksums, cancellation, restart and exact cleanup. The closed `core`/`storage`/`broker` test profiles reuse `services/identity/test/integration/integration.ts` and ownership/control guards. Administrative SDKs are test-only. Core was repeated once after the shared harness stabilized; no new production Identity dependency.
5. [completed] Pin core Collector 0.159.0 and Prometheus 3.14.0 (Apache-2.0, amd64/arm64 indexes). `pnpm integration:telemetry` combines real core databases with Collector/Prometheus and passes export/scrape, HTTP/dependency/runtime metrics, optional-backend interruption/recovery and bounded exporter-down shutdown. Exact read-only private config mounts support Docker Desktop translation only with matching distribution/device/inode. Final run: 29.755 s plus 5.744 s cleanup; 49/49 affected tasks and Identity 32/32 pass. No production adapter or composition change.
6. [completed] Add the fixed `all` profile from the four existing Compose files (six services/four volumes) and `pnpm integration`. Test-only `runtime-worker.ts` composes the shared lifecycle/HTTP adapter with real PG/Redis/Kafka/S3/OTLP owners, holds one request across SIGTERM, proves ordered closure and observes the final HTTP metric. All eight scenarios pass sequentially in that fresh fixture, ending with exporter-down telemetry. Production Identity dependencies are unchanged. The existing CI quality job selects the matrix once for applicable platform inputs, bounded to 15 minutes; 21 classification/policy tests pass.
7. [in progress] Exact candidate `cbc5255` passes frozen offline installation in a fresh no-local clone, 49/49 uncached tasks in 40.586 s, audit and clean Git. Executing-agent initial/confirmation reviews have no blocker. Publish one protected PR, complete hosted matrix/squash/post-merge verification before P01-R10 resource profiles and Docker-only evaluator closeout. Preserve the passing matrix/cold source for evidence-only changes; no independent approval is claimed.

## Tests

The broker slice uses the already-approved Apache Kafka KRaft alternative: upstream JVM image 4.3.1 (2026-06-25, Apache-2.0), index `sha256:77e3df9054047a88b520d0cc46e16696d3b22022e1d580aeccd2632df6532837` with amd64/arm64 manifests. Redpanda 26.2.2 still carries BSL 1.1 plus an additional-use grant; the Apache alternative avoids adding that conditional license to this runtime. This does not change the Kafka protocol or the accepted context boundary. Add the fixed `broker` fixture profile, `integration-broker.yml` and `broker-worker.ts`; KafkaJS inspection is test-only. Runtime/footprint proof still gates adoption.

- Unit/contract: Existing adapter/lifecycle/security contracts plus focused regressions for defects demonstrated by real integration.
- Integration: Real PostgreSQL/Redis protocol probes, pool/client disposal, failure/recovery; broker metadata/keyed produce-consume; object stream/checksum/missing/abort; OTLP/Prometheus; bounded service termination.
- Isolation: Unique resource labels, default/unrelated project preservation, cleanup after success/failure and no residual fixture handles.
- Browser/domain/media: Not applicable; no product behavior or UI.

## Evidence

- Raw artifact: `evidence/phase-01/real-integration.txt`.
- Iteration gate: Changed adapter/service tests and static checks plus only the relevant real dependency experiment.
- Candidate gate: `pnpm check:changed` and the combined explicit integration command after a coherent slice; no per-micro-edit full stack.
- Complete gate: One forced acceptance run and applicable integration matrix at stabilized source.
- Heavyweight repeat triggers: Image/digest, Compose ownership/network/resource policy, client version, bootstrap/entrypoint/command, signal/timeout/connection/stream behavior that can invalidate the measurement. Evidence-only prose does not repeat containers or cold install.
- Review stopping rule: One complete initial review and one confirmation; another round only for a changed or newly demonstrated requirement, security/data, availability or public-contract blocker.
- Every measurement records exact source, environment, command/workload, output and limitations. Preflight alone is not integration proof.

## Rollback or recovery

Stop and remove only validated test-owned resources, preserving unrelated/default Aster state and collected evidence. Revert the isolated harness/Compose additions if necessary. A failed client or image returns to its documented alternative with focused compatibility proof. No durable product migration needs reversal.

## Documentation updates

Record explicit integration commands, resource ownership/cleanup, selected image provenance, measured results and limitations. Keep the final Docker-only service profile and evaluator command with P01-R10. Update memory and evidence at coherent candidate/closeout checkpoints, not after each probe.

## Completion checklist

- [ ] Requirements satisfied
- [ ] Tests pass
- [ ] Evidence captured
- [ ] Documentation current
- [ ] `.ai/` state updated
- [ ] Remaining risks recorded
