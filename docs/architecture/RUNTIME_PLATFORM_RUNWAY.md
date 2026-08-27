# Runtime Platform Runway

## Status and purpose

This document defines the remaining Phase 01 path. P01-R06 telemetry, P01-R07 adapters and P01-R08 executable Identity composition are released. P01-R09 now implements the isolated PostgreSQL/Redis protocol, failure/recovery and Identity shutdown laboratory. Broker/S3 interoperability, Collector export, backends, profiles and the Docker-only service path remain P01-R09/P01-R10.

The runway preserves one principle: build the runtime contracts before composing a service, then prove those contracts against real local dependencies, and only then publish the final Docker-only demonstration path.

## Delivery dependency

```text
P01-R06 telemetry contract and runtime metrics
  -> P01-R07 dependency and platform adapters
    -> P01-R08 deadlines, readiness, and reference composition
      -> P01-R09 real dependency and service smoke tests
        -> P01-R10 profiles, troubleshooting, and clean-start closeout
```

This order prevents three expensive forms of rework:

- adapters do not invent metric names after their behavior exists;
- service readiness does not depend on unbounded third-party defaults;
- Docker and integration tests exercise a composed runtime instead of placeholder containers.

## Ownership and boundaries

- Shared runtime infrastructure owns telemetry, process lifecycle, clock, identifier, and dependency-client behavior.
- The Identity and Profiles context owns no product behavior in Phase 01. Its planned service skeleton is only the first composition root for the reusable runtime.
- PostgreSQL remains the durable authority. Phase 01 creates no product table or migration.
- Redis remains non-authoritative. Phase 01 creates no cache key family or durable Redis assumption.
- The broker carries no product event until an owning context creates a real outbox and contract.
- Object storage contains only bounded synthetic smoke objects until rights-aware media work begins.
- Domain and application layers import no Express, PostgreSQL, Redis, Kafka, S3, or OpenTelemetry SDK type.

## Planned repository paths

| Path | Owning item | Planned responsibility |
|---|---|---|
| `packages/telemetry/` | P01-R06 | Released repository-owned metrics API with OpenTelemetry infrastructure hidden behind it |
| `packages/runtime/src/clock.ts` | P01-R07 | Deterministic test clock contract and system-clock implementation |
| `packages/runtime/src/ids.ts` | P01-R07 | Deterministic test identifier contract and random UUID implementation |
| `packages/postgres/` | P01-R07 | PostgreSQL connection, probe, cancellation, telemetry, and close behavior without product repositories |
| `packages/redis/` | P01-R07 | Redis connection, bounded queue, probe, degraded-state, telemetry, and close behavior without cache policy |
| `packages/broker-kafka/` | P01-R07 | Kafka-compatible producer and consumer lifecycle with bounded concurrency and no product event definitions |
| `packages/object-storage-s3/` | P01-R07 | Streaming S3-compatible operations, probe, cancellation, telemetry, and close behavior without publication policy |
| `services/identity/` | P01-R08 | Reference composition root, health routes, and no account, profile, session, resolver, or schema behavior |
| `infra/compose/compose.yml` | P01-R09 | Reviewed optional dependency profiles, immutable image pins, health checks, resource bounds, and ownership labels |
| `infra/compose/observability/` | P01-R09 | Collector and backend configuration mounted read-only from the repository |
| `evidence/phase-01/` | P01-R06–R10 | Raw compatibility, failure, integration, clean-start, and resource evidence |

These are planned paths, not permission to scaffold every directory at once. Each work item creates only the paths required for its smallest complete slice.

## P01-R06 — Telemetry contract before adapters

### Runtime sources

The P01-R06 candidate exposes:

- Node.js event-loop time, utilization, delay percentiles, garbage-collection duration, heap-space use, and active resources;
- process CPU time and utilization;
- process resident memory;
- HTTP request duration and active requests;
- dependency operation duration, active operations, and stable outcomes;
- telemetry export failures and dropped observations.

The exact direct selection is `@opentelemetry/api@1.9.1`, `@opentelemetry/core@2.10.0`, `@opentelemetry/resources@2.10.0`, `@opentelemetry/sdk-metrics@2.10.0`, `@opentelemetry/exporter-metrics-otlp-http@0.221.0`, and `@opentelemetry/instrumentation-runtime-node@0.34.0`. All use Apache-2.0, support the pinned Node.js runtime through their published engine ranges, and remain internal to `@aster/telemetry`.

The deprecated host-metrics package and its broader replacement are not selected. Process CPU, resident memory, and uptime need only Node.js built-ins, while the host package would collect unrelated machine/network data and introduce an OS-command-sensitive dependency. The broad `@opentelemetry/sdk-node`, auto-instrumentation aggregator, and direct semantic-conventions package are also unnecessary for this metrics-only slice.

### Metric contract

Use OpenTelemetry semantic-convention instruments where an applicable stable or experimental runtime instrument already exists. Repository-owned boundary metrics use stable Aster names and these bounded dimensions:

| Dimension | Allowed shape |
|---|---|
| service | validated service name from process configuration |
| environment | `local`, `test`, `development`, `staging`, or `production` |
| dependency | `postgresql`, `redis`, `broker`, `object_storage`, or `telemetry` |
| operation | `connect`, `probe`, `query`, `command`, `publish`, `consume`, `read`, `write`, `delete`, `export`, or `flush` |
| outcome | `success`, `timeout`, `cancelled`, `unavailable`, `rejected`, or `error` |
| HTTP route | `/graphql`, `/health/live`, or `/health/ready` |
| HTTP method | `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`, or `OPTIONS` |
| HTTP status | validated `100` through `599`, emitted only as a bounded status class |

Metric attributes never contain account, profile, title, user, request, event, trace, span, topic, bucket, object key, URL, query text, GraphQL document, exception message, or credential values. The implementation configures an explicit cardinality ceiling and proves overflow aggregation with hostile inputs.

### Export lifecycle

- Instrument creation is synchronous and does not require a Collector.
- Periodic export uses a finite interval, finite queue, and exporter timeout.
- Export failure never fails a product request or readiness.
- `forceFlush` and shutdown participate in the existing lifecycle `flushTelemetry` stage.
- Concurrent flush and shutdown callers share provider work but retain caller-local cancellation; an aborted waiter cannot cancel or duplicate the shared operation.
- A missing or stalled Collector produces a stable failure and drop signal but cannot hold shutdown beyond the lifecycle deadline.
- Tests use a manual process-local metric reader first; the real Collector path belongs to P01-R09.

### P01-R06 exit

Protected squash `8dff9d8d57572b2eac944ae98406f3da2979682c` released the package after generated-declaration isolation, deterministic metric tests, bounded stalled and successful loopback exporter tests, finite dimensions, a Node.js `24.19.0` compatibility diagnostic, complete and clean-checkout gates, bounded review, protected CI, and post-merge run `33012664408` passed. It does not add Grafana dashboards or SLOs.

## P01-R07 — Narrow platform adapters

### Package rule

Create one package per operational dependency rather than one kitchen-sink adapter package. Each package owns connection state, timeouts, cancellation, bounded concurrency or queueing, stable error categories, telemetry, and idempotent close. It owns no domain entity, transaction policy, cache policy, event payload, or media publication rule.

| Adapter | Current candidate | First complete slice | Explicitly deferred |
|---|---|---|---|
| PostgreSQL | exact `pg@8.23.0` local candidate | connect, reserve/release, `SELECT 1` probe, statement/query bounds, abort recovery, bounded pool snapshot and operation telemetry, close | product schema, migrations, repositories, typed SQL selection, real-container proof |
| Redis | exact `@redis/client@6.2.1` local candidate | connect, `PING`, disabled offline queue, bounded command/reconnect policy, cancellation recovery, telemetry, idempotent close | generic commands, cache keys, Lua scripts, rate limits, leases, real-container proof |
| Broker | exact provisional `kafkajs@2.2.4` local candidate | connect, bounded topic metadata probe, keyed producer send, one sequential at-least-once consumer, stop, telemetry | product events, outbox relay, replay policy, real-broker proof |
| Object storage | exact AWS SDK `3.1118.0` plus Smithy Node HTTP handler `4.11.3` local candidate | bucket probe, streaming put/get, head, bounded deletion for fixtures, abort, telemetry, close | rights-aware source acquisition, HLS publication, CDN policy, real-container proof |
| Clock | Node.js built-ins | current instant and deterministic fake | domain-specific scheduling |
| IDs | `crypto.randomUUID` | UUID generation and deterministic fake | aggregate-specific identity rules |

The PostgreSQL client and typed SQL decision are intentionally separate. Phase 01 can prove connection and failure semantics with `pg`. A typed SQL library is selected in Phase 02 against the first real schema, transaction, query, migration, generated type, and removal path rather than against a synthetic table.

### Clock and identifier checkpoint

The local P01-R07 candidate now exposes a system clock, fixed deterministic clock, UUID generator, and finite deterministic unique-identifier sequence from `@aster/runtime`. Each returned object is frozen; fixed instants return fresh `Date` values; invalid epoch and identifier configuration produces bounded cause-free repository errors; sequence input is copied without invoking accessors; exhaustion is explicit. These primitives add no dependency, global clock mutation, product-specific identity rule, network behavior, or durable state. Focused package, complete uncached, exact clean-checkout, initial-remediation, and confirmation-review gates pass; protected release gates remain pending.

### PostgreSQL connectivity checkpoint

The local `@aster/postgres` candidate exact-pins `pg@8.23.0` after current registry, license, engine, install, audit, source, lifecycle, cancellation, and removal review. Its public contract is deliberately smaller than `pg`: bounded connect, a fixed `SELECT 1 AS aster_probe` probe, a bounded process-local pool snapshot, stable outcomes, one shared close, and lifecycle hooks. It exposes no generic query method because no context-owned schema or second concrete repository use case exists.

Node-postgres does not currently provide the adapter a reliable `AbortSignal` query-cancellation seam, and its client-side query timeout can finish before the server-side work. A caller abort, local timeout, query read timeout, SQLSTATE `57014`, or unknown probe failure therefore destroys the reserved connection instead of returning possibly busy protocol state to the pool. Adapter-owned reservations cap acquisitions before the vendor FIFO; timed-out acquisitions retain capacity until their eventual connection is destroyed or the acquisition fails. Connection, idle, server-statement, client-query, operation, and close budgets are finite.

Eleven focused tests and a refused-loopback diagnostic prove the repository boundary, hostile configuration handling, capacity, stable telemetry, cancellation, timeout, concurrent/idempotent shutdown, side-effect-free pre-aborted close, later completion of a timed-out drain, sanitized failures, and vendor-free declarations. These are controlled local proofs, not real PostgreSQL compatibility; P01-R09 owns container startup, authentication, protocol, failure/recovery, and handle-exit confirmation.

### Redis connectivity checkpoint

The local `@aster/redis` candidate exact-pins `@redis/client@6.2.1` after current registry, license, engine, dependency, install, audit, source, lifecycle, cancellation, and removal review. Its repository-owned contract exposes only bounded connect, fixed `PING`, an availability snapshot, stable outcomes, and lifecycle close. No raw command API is exposed because Phase 01 has no context-owned cache, lease, rate limit, or second concrete command use case.

Exact client source removes command abort and timeout listeners after a command moves onto the connection's waiting-for-reply queue, and connect itself accepts no `AbortSignal`. The adapter therefore applies outer deadlines, disables offline queueing, caps repository and vendor queue capacity, and destroys an ambiguous client generation after probe abort, timeout, malformed reply, or unknown failure. Explicit connect can create a fresh generation. Automatic reconnect uses a finite attempt count and bounded linear delay; vendor error and reconnect causes never enter public results or Aster telemetry.

Thirteen focused tests and a refused-loopback subprocess diagnostic prove hostile construction, finite client options, connect sharing, caller-local cancellation, capacity, destructive cancellation recovery, explicit generation recovery, bounded reconnect state, concurrent/idempotent close, close timeout, vendor-destroy failure, cause-free lifecycle errors, sanitized output, and vendor-free declarations. These are controlled local proofs, not real Redis compatibility; P01-R09 owns authentication, protocol, stop/recover transitions, reconnect timing, and process-handle confirmation against the selected container.

### S3-compatible object-storage checkpoint

The local `@aster/object-storage-s3` candidate exact-pins `@aws-sdk/client-s3@3.1118.0`, `@aws-sdk/lib-storage@3.1118.0`, and `@smithy/node-http-handler@4.11.3`. The newer SDK `3.1119.0` was less than 24 hours old at selection time and therefore failed the repository release-age policy. The selected packages support Node.js 24, use Apache-2.0, add no native install boundary, and remain isolated behind repository-owned declarations.

The adapter uses path-style addressing for local S3-compatible runtimes, disables SDK retries, applies finite connection/request/operation/close budgets, caps repository concurrency, and bounds multipart buffering through finite queue and part sizes. Writes validate the exact declared byte length and transfer ownership only after acceptance; reads enforce both declared and observed size bounds. Checksums are requested where supported, fixture deletion accepts only one exact non-root key under a configured prefix, and buckets, keys, endpoints, credentials, signed URLs, or vendor errors never enter stable telemetry or public failures.

Caller cancellation returns promptly while the retired SDK generation receives a bounded grace period to finish multipart-abort cleanup before forced destruction. Sixteen focused tests and a refused-loopback subprocess diagnostic prove hostile construction, client policy, probe/head, exact-length streaming writes, bounded reads, capacity, generation recovery, safe deletion, finite shutdown even when vendor work ignores cancellation, sanitized lifecycle failures, and vendor-free declarations. These are controlled local proofs; P01-R09 owns authentication, checksum interoperability, multipart abort/cleanup, backpressure, and handle-exit confirmation against the selected S3-compatible container.

### Kafka-compatible broker checkpoint

P01-R07 compares exact `@confluentinc/kafka-javascript@1.10.0` with `kafkajs@2.2.4`. The Confluent client is actively maintained, installed and loaded on Node.js 24, supports Linux x64/arm64 through `librdkafka`, and has a larger native dependency boundary. In the isolated unavailable-broker lifecycle spike, the caller reached its outer timeout after `1.255` seconds but disconnect completed only after `31.129` seconds, exceeding Aster's ten-second shutdown deadline. It is rejected for this checkpoint without making a broker-compatibility judgment.

KafkaJS is MIT, pure JavaScript, has no runtime dependency, and the equivalent unavailable-broker connect/disconnect spike completed in `127` milliseconds with natural process exit. Its last release is from February 2023, so it is selected only provisionally. P01-R09 must confirm it against the selected real broker and replace it before Phase 01 closeout if authentication, metadata, idempotent delivery, retry timing, rebalance, manual commit, stop, recovery, or process-exit evidence fails.

The local `@aster/broker-kafka` candidate copies bounded inputs only after accepting finite capacity, disables auto-topic creation and vendor logs, caps request concurrency and retry attempts, and uses keyed `acks=-1` idempotent sends without claiming exactly-once delivery. Before acceptance, cancellation returns the ordinary finite aborted result. After acceptance, timeout or cancellation returns the explicit `delivery_ambiguous` result with a finite cause, retires the generation, and never performs an external retry. The single consumer processes one partition callback at a time, exposes an adapter-owned cancellation signal, commits the next offset only after handler success, leaves failures uncommitted, disables automatic crash restart, and requires explicit recovery.

Twenty-one focused tests and a refused-loopback subprocess diagnostic prove hostile construction, finite configuration, metadata/publish telemetry, copied bytes, capacity, explicit pre-acceptance and delivery-ambiguous interruption results, generation recovery, consumer bounds, at-least-once failure behavior, crash retirement, caller-local stop/close, finite shutdown with stalled work, sanitized lifecycle failure, and vendor-free declarations. These are controlled local proofs; P01-R09 owns real protocol and lifecycle verification.

## P01-R08 — Deadlines and readiness composition

### Deadline hierarchy

```text
service startup deadline
  -> dependency connect deadline
    -> one probe or operation deadline

inbound request deadline
  -> adapter operation deadline
    -> one safe attempt

service shutdown deadline
  -> telemetry flush and adapter close opportunities
```

The initial test budgets are 15 seconds for total startup, 3 seconds for PostgreSQL connect, 1.5 seconds for Redis connect, 5 seconds for broker connect, 2 seconds for an S3 probe, and 1 second for an OTLP export attempt. These are test starting points, not production SLOs. The owning work item may adjust them only with exact failure evidence and must keep every nested budget below its parent.

Startup performs no retry loop. Later operation retries require a known-safe read or an idempotency mechanism and must fit inside the propagated overall deadline.

P01-R08 implements `createAsterDeadline()` in `@aster/runtime` with a 1 millisecond through 5 minute monotonic budget, optional parent signal, sanitized derived signal, non-increasing remaining budget and idempotent cleanup. Identity now uses the configured startup budget, existing PostgreSQL/Redis limits and one 10-second shutdown budget. [Runtime Lifecycle](../operations/RUNTIME_LIFECYCLE.md) records the exact composition, monitor and terminal policy. Controlled and real unavailable-endpoint tests are not a substitute for P01-R09 protocol interoperability.

### Readiness model

P01-R08 extends the current monotonic lifecycle with bounded readiness gates. Lifecycle phase and dependency readiness remain separate:

- `starting` stays not ready until all declared critical startup gates pass;
- a ready process becomes not ready when a critical gate is unavailable without moving the lifecycle phase backward;
- recovery can restore readiness while the process remains in the ready phase;
- draining, failed, and stopped phases always override dependency state;
- `tryBeginWork()` accepts no new lease while overall readiness is false.

The public health response contains only liveness, readiness, lifecycle phase, and a stable reason such as `dependency_unavailable`. Dependency names, endpoints, errors, credentials, retry counts, and topology stay in protected diagnostics, bounded logs, and metrics.

The Identity reference skeleton declares PostgreSQL and Redis as critical for its Phase 01 startup contract. Broker and object storage are exercised by targeted diagnostics but are not fake dependencies of that service. The Collector is optional and never blocks readiness.

A single bounded background monitor owns recovery probes. It allows one probe per dependency, applies jittered finite intervals, accepts cancellation, stops before dependency closure, and stores only the last stable state. Health routes read this snapshot and do not initiate network work per request.

### Reference service boundary

`services/identity` composes configuration, logger, telemetry, lifecycle, Express transport, PostgreSQL, Redis, clock, and IDs. It exposes stable `/health/live` and `/health/ready` routes. It contains no signup, login, account, viewer profile, session, GraphQL schema, resolver, migration, or durable write; those belong to Phase 02.

`pnpm identity:check` provides a controlled loopback diagnostic; `pnpm identity:start` executes the real factories. The real-client composition check exposed and corrected node-redis's mutation of frozen URL/socket options by copying those objects only at the vendor boundary. Internal immutable options, client versions, bounded reconnect and shutdown contracts are unchanged.

## P01-R09 — Real dependency proof

The first local slice is `pnpm integration:core`: existing pinned PostgreSQL/Redis images, temporary loopback connectivity, exact fixture ownership and cleanup, real client probes, stop/recovery, pause/cancellation/capacity, Identity health transitions and held-HTTP shutdown. It exposed and corrected an unhandled idle-pool PostgreSQL error. [Local Development](../operations/LOCAL_DEVELOPMENT.md#real-postgresqlredis-integration) and [raw evidence](../../evidence/phase-01/real-integration.txt) record operation and limitations. This slice does not complete the remaining matrix or add final runtime profiles.

### Container candidate gate

P01-R09 selects and pins exact multi-platform images by digest only after license and runtime evidence. Current candidates are:

| Capability | Primary candidate | Alternative or concern |
|---|---|---|
| Kafka-compatible broker | Redpanda single-node runtime | Apache Kafka KRaft if license, compatibility, or lifecycle evidence is stronger |
| S3-compatible local storage | VersityGW with a POSIX backend | SeaweedFS single-node S3; the archived MinIO repository is not the default |
| Telemetry transport | OpenTelemetry Collector Contrib | Core Collector if every required receiver/exporter exists |
| Metrics | Prometheus | no alternative needed before evidence |
| Traces | Tempo | enabled only when trace work begins or required for the Phase 01 diagnostic |
| Logs | Loki | standard-output logging remains valid if the log backend profile is stopped |
| Diagnosis | Grafana | provisioned dashboards remain minimal and question-driven |

The final selection requires health behavior, startup and shutdown duration, idle CPU and memory, image and volume size, amd64 and arm64 manifests, license, current maintenance, local reset ownership, and protocol smoke evidence.

### Integration matrix

P01-R09 uses real containers for:

- PostgreSQL successful probe, startup failure, operation timeout, cancellation recovery, and pool close;
- Redis successful probe, unavailable behavior, command cancellation, queue bound, reconnect, and idempotent close;
- broker metadata, one keyed produce/consume round trip, consumer cancellation, duplicate-safe fixture cleanup, and bounded stop;
- S3 bucket probe, streaming object round trip, checksum, missing object, aborted transfer, and cleanup;
- OTLP export through the Collector and a Prometheus scrape containing the expected bounded series;
- Identity service readiness transitions when PostgreSQL and Redis stop and recover;
- termination during in-flight HTTP work with telemetry and every adapter closing inside the overall budget.

Fixtures use synthetic identifiers and bounded payloads. The tests create no product schema, public media title, or durable product event.

## P01-R10 — Resource-aware demonstration and closeout

### Planned profiles

| Profile | Contents | Use |
|---|---|---|
| core | PostgreSQL, Redis, initializer, status | cheapest platform and database/cache work |
| runtime | core plus Identity reference service | normal Phase 01 Docker-only demonstration |
| integration | broker and S3-compatible storage added to core | adapter and event/storage smoke tests |
| observability | Collector, Prometheus, Tempo, Loki, Grafana | telemetry investigation only |
| full | runtime, integration, and observability together | Phase 01 acceptance and recorded demonstration |

The default development path does not require the full profile. Every optional service receives exact labels, finite resources, health checks, a cleanup classification, and a measured reason to persist or remain disposable. The destructive reset must understand every reviewed partial profile before any new named volume is accepted.

### Evaluator path

The Phase 01 closeout will publish one copyable Docker-only command that builds and starts the runtime profile from an empty project-scoped state, waits for health, and exposes a loopback Identity readiness URL. A second documented command enables the full laboratory. Neither path requires a host Node.js installation, hosted credentials, personal data, or manual container repair.

The README command remains planned until a clean checkout proves it. The evidence records exact commit, host, Docker and Compose versions, command, start duration, image and volume footprint, idle resources, health output, stop behavior, reset behavior, and limitations.

## Cross-item failure and rollback rules

- A dependency package can be removed without changing a domain contract because no domain package imports it in Phase 01.
- A failed client selection returns to the documented alternative and repeats only the affected compatibility and integration evidence.
- Telemetry can degrade to bounded local no-op recording without changing request correctness; silent unbounded buffering is prohibited.
- Broker and object-storage state are synthetic in Phase 01 and may be reset only through the project-scoped confirmed reset.
- A change to public health shape, lifecycle phase semantics, architecture invariant, broker guarantee, or storage authority requires an ADR or explicit update to the owning accepted decision.

## Stop conditions

Stop the active item instead of bypassing it when:

- a client cannot provide a tested deadline and cancellation or force-close path;
- a container has unresolved license, architecture, or maintenance risk;
- the local full profile exceeds the measured machine budget without a lighter accepted profile;
- health output would need to disclose dependency topology or secrets;
- a smoke test requires a product schema, event, cache key, or media publication before its owning phase;
- the predecessor branch changes and invalidates the dependent candidate.

Current candidate research and its limitations are recorded in [Phase 01 runtime runway preflight](../../evidence/phase-01/runtime-runway-preflight.txt).
