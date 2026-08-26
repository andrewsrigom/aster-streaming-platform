# Work Item: Implement Narrow Runtime Platform Adapters

- Status: IN_PROGRESS
- Owner: Aster shared runtime and dependency-adapter infrastructure
- Phase: 01
- Requirement IDs: P01-R07
- Created: 2026-08-26
- Updated: 2026-08-26

## Outcome

Provide reusable, independently removable packages for system clock and identifiers plus PostgreSQL, Redis, Kafka-compatible broker, and S3-compatible object-storage clients. Every network adapter exposes repository-owned contracts, finite lifecycle and concurrency behavior, caller cancellation, stable sanitized failures, dependency telemetry, and idempotent close without adding product schemas, cache keys, events, media publication, or service composition.

## Current behavior

P01-R06 is released through protected squash `8dff9d8d57572b2eac944ae98406f3da2979682c`; exact post-merge run `33012664408` passed every applicable job. This branch starts from that clean released `main` head. Commit `2309f94` adds deterministic clock/ID contracts; commit `1ded757` adds the exact `pg@8.23.0` PostgreSQL connectivity adapter after 11 focused tests and 37 affected tasks pass. The local Redis checkpoint now selects exact `@redis/client@6.2.1` behind `@aster/redis` and implements bounded connect/probe, disabled offline queueing, finite capacity/reconnect, cancellation recovery, telemetry, availability state, and close with 13 focused tests passing. It creates no database, schema, migration, repository, transaction/cache policy, generic Redis command, broker/S3 client, event, object, or application service; real dependency interoperability remains P01-R09.

## Proposed behavior

Retain the implemented system/fixed clock and UUID/deterministic ID contracts in `@aster/runtime`. Add one package per operational dependency: `@aster/postgres`, `@aster/redis`, `@aster/broker-kafka`, and `@aster/object-storage-s3`. Each package keeps the vendor client private and implements only the first Phase 01 slice: bounded connection/probe/operation ownership, propagated `AbortSignal`, finite capacity or queue behavior, stable outcomes, telemetry leases, and close.

PostgreSQL covers pool reservation/release, `SELECT 1`, bounded query execution, cancellation recovery, pool saturation observation, and close. Redis covers connect, `PING`, disabled or bounded offline behavior, abortable commands, finite reconnect policy, availability state, and close. The broker covers metadata, bounded keyed send, one bounded consumer loop, stop, and close using a provisional client selected by current compatibility and process-lifecycle evidence; P01-R09 must confirm that candidate against a real broker and replace it before Phase 01 closeout if it cannot meet the lifecycle budget. Object storage covers bucket probe, streaming put/get, head, fixture-only deletion, cancellation, checksum-safe stream ownership, and close.

## Boundaries

- Owning context: Shared runtime and dependency-adapter infrastructure; no product bounded context changes.
- Affected services/packages: `@aster/runtime`, `@aster/telemetry` only if its existing finite seam needs a compatible extension, four new adapter packages, workspace/lockfile, tests, documentation, evidence, and repository memory. No service is composed in this item.
- Authoritative data: None created. PostgreSQL remains the future durable authority; Redis and adapter state are non-authoritative and process-local.
- Read models/caches: None. Redis keys and cache policy are deferred.
- Trust boundaries: Configuration URLs and credentials, vendor callbacks/errors/loggers, network responses, database result metadata, broker records and topic configuration, S3 buckets/keys/metadata/streams, caller `AbortSignal`, injected clocks/IDs, metric categories, and close races.
- External dependencies: Exact current `pg`, `@redis/client`, AWS S3 SDK, and one provisional Kafka-compatible client selected after registry, official documentation, license, engine, install, audit, architecture, shutdown, redaction, and removal evidence. Real service containers and public endpoints remain P01-R09.

## Invariants

- Domain and application packages import no web framework, database, Redis, broker, object-storage, or telemetry SDK type.
- One package owns each vendor dependency; generated public declarations contain only repository-owned or Node.js platform types.
- Every outbound operation accepts or derives a finite deadline and observes caller cancellation; no adapter performs an unbounded retry loop.
- Cancellation and timeout do not return a pooled or shared client to service until its protocol state is safe; unsafe connections are discarded.
- Retries are disabled in the generic adapter unless the operation is explicitly safe or made idempotent and the attempt budget fits the caller deadline.
- PostgreSQL is authoritative only for later context-owned schemas; Redis never becomes durable truth.
- Broker delivery remains at-least-once and product event envelopes, outbox behavior, replay, and topic ownership remain deferred.
- Object operations stream bytes with bounded buffering; application services never proxy media bytes and fixture deletion cannot target unbounded prefixes.
- Buckets, object keys, topics, endpoints, SQL text, Redis keys/values, payloads, credentials, errors, and record identifiers never enter logs or metric attributes.
- Dependency operations use the existing finite telemetry vocabulary and complete each telemetry lease exactly once.
- Connect, probe, operation, stop, and close paths are race-safe; close is idempotent and releases timers, sockets, consumers, and queued work.
- Clock and ID fakes are deterministic without global mutation; production IDs use `crypto.randomUUID`.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Invalid, accessor-backed, excessive, or credential-bearing public configuration | Fail before client construction with bounded cause-free issues; never echo an endpoint or credential | Sanitized initialization result only |
| Connection unavailable, refused, or handshake stalls | Stop at the configured deadline, release partial resources, and return `unavailable` or `timeout` | One bounded `connect` outcome |
| Caller aborts while queued, connecting, probing, or operating | Remove or ignore only that caller's work, cancel vendor work where supported, and return `cancelled` promptly | One bounded operation outcome |
| PostgreSQL query is cancelled or times out | Cancel safely; release the connection only if protocol recovery is proven, otherwise destroy it | `query` outcome and bounded pool state |
| PostgreSQL pool is exhausted | Reject at the adapter capacity/deadline instead of growing an unbounded wait queue | `rejected` or `timeout`, no caller label |
| Redis is offline or reconnecting | Bound or disable offline queueing, expose unavailable state, and cap reconnect attempts/delay | `command` or `connect` stable outcome |
| Broker send/consume fails or rebalance occurs | Preserve at-least-once semantics, bound in-flight records, stop intake on cancellation, and avoid claiming product-level deduplication | `publish` or `consume` stable outcome |
| Broker client cannot close within the lifecycle budget | Force-close if the selected client safely supports it; otherwise reject the candidate and use the documented alternative | Stable close failure in logs; no endpoint |
| S3 body exceeds bounds, stream fails, or checksum mismatches | Abort the transfer, destroy owned streams, return a stable error, and leave publication semantics untouched | `read` or `write` stable outcome |
| Fixture deletion receives an excessive or unsafe target | Reject before issuing network work; no broad prefix or bucket deletion | `delete` rejected |
| Telemetry is closed or at capacity | Preserve adapter correctness and finish the dependency operation without throwing from telemetry | Existing telemetry drop accounting |
| Close is concurrent or repeated | Share or serialize one close operation, give callers independent cancellation, and release resources once | No duplicate dependency operation |

## Data and contracts

- Schema/migration: None; no table, migration, repository, or typed SQL library.
- GraphQL: None.
- Events: No product event or outbox. The broker package accepts only bounded synthetic records through a repository-owned transport contract.
- Cache: No Redis key, TTL, invalidation, Lua script, lease, rate limit, or stale policy.
- Public adapter contracts: Immutable options; stable initialization and operation results/errors; clock and ID ports; PostgreSQL reservation/probe/query seam; Redis probe/command seam; broker producer/consumer lifecycle seam; S3 probe/head/streaming operation seam; idempotent close hooks.
- Compatibility: Pinned Node.js `24.19.0`; exact dependency engines, peer ranges, licenses, install scripts, native architecture implications, and generated declarations recorded before candidate publication.
- Retention/deletion: Adapter process state ends on close. Only explicitly named bounded synthetic fixture objects/records may be cleaned up; no product retention behavior exists.

## Security and privacy

- Authorization: No public endpoint or product operation exists. Future service and domain owners remain responsible for authorization before invoking these adapters.
- Input limits: Bound configuration entries and lengths, connect/operation deadlines, pool and queue capacity, Redis reconnects, broker record bytes and in-flight count, consumer concurrency, bucket/key/topic lengths, S3 metadata, stream size, and fixture deletion count.
- Sensitive data: Credentials remain inside validated configuration and vendor construction. Never expose URLs with user info, SQL, Redis commands/values, topic/bucket/key names, record bodies, signed URLs, error messages/stacks, or vendor diagnostics through public errors, logs, or metrics.
- Abuse cases: Pool starvation, offline-queue growth, reconnect storms, retry amplification, poison broker records, oversized records/objects, slow or infinite streams, cancellation races, accessor execution, log injection, endpoint disclosure, and broad fixture deletion.

## Implementation steps

1. [completed] Record the P01-R06 release, activate P01-R07, reconcile the broker selection/confirmation boundary, and create the raw evidence ledger.
2. [completed] Implement repository-owned system/fake clock and UUID/deterministic ID contracts with focused deterministic tests and no new dependency.
3. [in progress] Repeat live registry and official compatibility research for `pg`, `@redis/client`, the AWS S3 client modules, and Kafka candidates; record exact versions, licenses, engines, scripts, dependency cost, known advisories, cancellation/deadline seams, redaction, and removal paths before installation. PostgreSQL and Redis evidence is complete; S3 and Kafka remain.
4. [completed checkpoint] Implement PostgreSQL as the first network adapter, including bounded pool acquisition, probe/query cancellation recovery, telemetry, close, hostile construction tests, and vendor-free public declarations.
5. [local candidate] Implement Redis with bounded offline/reconnect behavior, abortable probe execution, telemetry, availability state, close, and equivalent boundary tests. No generic command is exposed before a context-owned use case exists.
6. Implement S3-compatible storage with streaming put/get, head/probe, bounded fixture deletion, abort and owned-stream cleanup, telemetry, and equivalent boundary tests.
7. Compare the Kafka candidates with install and process-lifecycle diagnostics, select one provisional client, implement bounded producer/consumer lifecycle, and document the mandatory real-broker confirmation gate for P01-R09.
8. Consolidate dependency, failure, cancellation, handle-cleanup, declaration, audit, and package evidence; update architecture and operations documentation without claiming real-container interoperability.
9. Run the affected candidate gate, one stabilized complete gate, exact clean-checkout proof, initial review, batched blocking remediation, confirmation review, protected CI, merge, and post-merge verification.

## Tests

- Domain: None; no product domain behavior.
- Application: Deterministic clock/ID tests and pure state/capacity/result tests for every adapter.
- Integration: Vendor-client boundary tests using controlled fakes, protocol-safe loopback or client middleware where useful, and subprocess handle/exit diagnostics; real PostgreSQL, Redis, broker, and S3 containers remain P01-R09.
- Contract: Package exports, exact public error/result shapes, finite option bounds, telemetry vocabulary, vendor-free generated declarations, and architecture import direction.
- Browser: Not applicable.
- Performance/failure: Deadline and abort latency, queue/pool saturation, reconnect bound, consumer stop, concurrent/repeated close, stalled callbacks/sockets/streams, bounded memory/backpressure for S3 streams, no unhandled rejection, and no live owned handles after close.

## Evidence

- Commands: Focused package typecheck/build/test/check and targeted lint/format during each coherent package slice; `pnpm check:changed` at package candidates; `pnpm check --force` once the complete work item stabilizes; `pnpm audit --audit-level=high`; license/dependency/install-script inventories; exact runtime diagnostics; isolated frozen clean checkout; protected CI and review evidence.
- Raw artifact path: `evidence/phase-01/platform-adapters.txt`.
- Acceptance result: Pending.
- Iteration gate: Run only the affected package build/typecheck/tests plus targeted lint/format after a coherent contract or failure-path change. Clock/ID, PostgreSQL, Redis, S3, and broker are separate iteration checkpoints.
- Candidate gate: Run `pnpm check:changed` when each package forms a coherent candidate. Run one forced complete graph only after all four adapters, clock/ID, dependency graph, declarations, documentation, and evidence stabilize.
- Heavyweight repeat triggers: Repeat frozen isolated checkout for dependency, lockfile, workspace, package export, generated declaration, install-script, native module, or public-command changes. Repeat subprocess/handle diagnostics for client lifecycle, cancellation, retry, timer, consumer, stream, or close changes. Repeat stream memory/backpressure evidence for S3 body ownership changes. Real container interoperability is owned and repeated in P01-R09.
- Review stopping rule: Collect one complete initial review and batch related blocking remediation. Run one confirmation review. Start another round only if remediation changes or reveals a requirement, security/data invariant, availability behavior, lifecycle guarantee, or public adapter contract.

## Rollback or recovery

Each dependency package can be removed independently with its exact dependency and lockfile entries because no product context or service imports it in this phase. Clock and ID exports can be removed before service composition. If a client cannot meet cancellation, bounded shutdown, license, architecture, audit, or declaration-isolation requirements, remove it, record the failure, select the documented alternative, and repeat only affected install/lifecycle gates. Synthetic adapter state has no recovery promise and no broad deletion is permitted.

## Documentation updates

- Record P01-R06 release and P01-R07 activation in the evidence index, runtime runway, state, queue, session log, and handoff.
- Record exact client versions and selection evidence in the technology baseline, dependency documentation, runtime runway, raw evidence, and decisions ledger when decisions are made.
- Document repository-owned contracts, lifecycle/failure semantics, telemetry mapping, public-type isolation, limitations, rollback, and the P01-R09 real-dependency confirmation matrix.
- Keep Docker Compose, public evaluator commands, service readiness, product schemas, caches, events, media rights/publication, dashboards, and SLOs explicitly planned until their owning items verify them.

## Completion checklist

- [ ] Requirements satisfied
- [ ] Tests pass
- [ ] Evidence captured
- [ ] Documentation current
- [ ] `.ai/` state updated
- [ ] Remaining risks recorded
