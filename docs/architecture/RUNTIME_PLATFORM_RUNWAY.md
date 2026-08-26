# Runtime Platform Runway

## Status and purpose

This document defines the implementation path for the remaining Phase 01 work. P01-R06 is released with a repository-owned telemetry package; it does not claim that a Collector, dependency client, Identity service, broker, object storage, or observability backend exists. Exact adapter dependencies and container images remain pending until their owning work item records compatibility, license, security, resource, failure, and integration evidence.

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
| PostgreSQL | `pg` | connect, reserve/release, `SELECT 1` probe, statement/query bounds, abort recovery, pool telemetry, close | product schema, migrations, repositories, typed SQL selection |
| Redis | `@redis/client` | connect, `PING`, bounded offline behavior, abortable command, reconnect policy, telemetry, idempotent close | cache keys, Lua scripts, rate limits, leases |
| Broker | Confluent JavaScript client and KafkaJS compared at the item gate | connect, metadata, bounded producer send, one bounded consumer, stop, telemetry | product events, outbox relay, replay policy |
| Object storage | AWS SDK S3 client | bucket probe, streaming put/get, head, bounded deletion for fixtures, abort, telemetry, close | rights-aware source acquisition, HLS publication, CDN policy |
| Clock | Node.js built-ins | current instant and deterministic fake | domain-specific scheduling |
| IDs | `crypto.randomUUID` | UUID generation and deterministic fake | aggregate-specific identity rules |

The PostgreSQL client and typed SQL decision are intentionally separate. Phase 01 can prove connection and failure semantics with `pg`. A typed SQL library is selected in Phase 02 against the first real schema, transaction, query, migration, generated type, and removal path rather than against a synthetic table.

### Clock and identifier checkpoint

The local P01-R07 candidate now exposes a system clock, fixed deterministic clock, UUID generator, and finite deterministic unique-identifier sequence from `@aster/runtime`. Each returned object is frozen; fixed instants return fresh `Date` values; invalid epoch and identifier configuration produces bounded cause-free repository errors; sequence input is copied without invoking accessors; exhaustion is explicit. These primitives add no dependency, global clock mutation, product-specific identity rule, network behavior, or durable state. Focused package gates pass; the complete work-item and release gates remain pending.

### Kafka selection gate

The broker client remains unresolved. The maintained Confluent client has current releases and production `librdkafka` behavior, but adds a native install boundary and its KafkaJS-compatible disconnect currently uses a fixed five-second native close. KafkaJS is small and pure JavaScript but its latest registry release is from 2023. P01-R07 must compare:

- Node.js 24 and amd64/arm64 installation;
- broker protocol compatibility;
- startup and operation deadline behavior;
- cancellation and forced close;
- producer idempotence and retry controls;
- consumer stop and rebalance behavior;
- log redaction and endpoint disclosure;
- dependency size, license, maintenance, and exit path.

P01-R07 may select and implement one provisional client only after current registry, license, Node.js 24 installation, process-lifecycle, deadline, redaction, dependency-cost, and removal evidence. P01-R09 then confirms that candidate against a real broker; if bounded stop cannot fit the service lifecycle budget, the candidate must be replaced and the affected adapter gates repeated before Phase 01 closeout. This separates an implementable adapter checkpoint from the later real-platform proof without treating preflight metadata as verification.

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

### Readiness model

P01-R08 extends the current monotonic lifecycle with bounded readiness gates. Lifecycle phase and dependency readiness remain separate:

- `starting` stays not ready until all declared critical startup gates pass;
- a ready process becomes not ready when a critical gate is unavailable without moving the lifecycle phase backward;
- recovery can restore readiness while the process remains in the ready phase;
- draining, failed, and stopped phases always override dependency state;
- `tryBeginWork()` accepts no new lease while overall readiness is false.

The public health response contains only liveness, readiness, lifecycle phase, and a stable reason such as `dependency_unavailable`. Dependency names, endpoints, errors, credentials, retry counts, and topology stay in protected diagnostics, bounded logs, and metrics.

The planned Identity reference skeleton declares PostgreSQL and Redis as critical for its Phase 01 startup contract. Broker and object storage are exercised by targeted diagnostics but are not fake dependencies of that service. The Collector is optional and never blocks readiness.

A single bounded background monitor owns recovery probes. It allows one probe per dependency, applies jittered finite intervals, accepts cancellation, stops before dependency closure, and stores only the last stable state. Health routes read this snapshot and do not initiate network work per request.

### Reference service boundary

`services/identity` composes configuration, logger, telemetry, lifecycle, Express transport, PostgreSQL, Redis, clock, and IDs. It exposes stable `/health/live` and `/health/ready` routes. It contains no signup, login, account, viewer profile, session, GraphQL schema, resolver, migration, or durable write; those belong to Phase 02.

## P01-R09 — Real dependency proof

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
