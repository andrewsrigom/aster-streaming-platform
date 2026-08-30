# Observability Architecture

## Stack

Local target:

- OpenTelemetry SDKs;
- OpenTelemetry Collector;
- Prometheus-compatible metrics store;
- Tempo-compatible trace store;
- Loki-compatible log store;
- Grafana dashboards.

The hosted implementation may use managed backends while preserving OpenTelemetry instrumentation and semantic conventions.

## Correlation

A user request should be traceable across:

```text
browser navigation
→ Next.js server
→ Apollo Router
→ subgraphs
→ PostgreSQL / Redis
→ outbox
→ broker
→ consumer
```

W3C trace context is propagated where supported. Event envelopes carry trace and causation context without making asynchronous work part of an indefinitely open request trace.

## Service telemetry

Every service reports:

- build/version;
- environment;
- uptime;
- request rate;
- error rate;
- duration distribution;
- active requests;
- event-loop delay;
- memory;
- process CPU;
- database pool utilization;
- Redis duration and outcomes;
- dependency duration and outcomes;
- graceful-shutdown status.

## GraphQL telemetry

Record:

- operation name or trusted-operation ID;
- operation type;
- result category;
- duration;
- cost score;
- rejected reason;
- subgraph fetch duration;
- error count by stable category.

Do not store raw documents for arbitrary public requests.

## Media telemetry

Record:

- acquisition bytes and duration;
- source host category;
- probe duration;
- transcode queue time;
- transcode stage duration;
- output bytes;
- validation failures;
- cleanup failures;
- playback-session success;
- manifest load success;
- first-frame latency;
- rebuffer ratio;
- fatal playback error.

## Cache telemetry

Per cache family:

- hit;
- miss;
- stale serve;
- source bypass;
- refresh start/success/failure;
- coalesced waiter count;
- lease contention;
- operation duration;
- payload size sample;
- Redis error.

## Logs

Pino-compatible structured logs are emitted to stdout and collected.

Required context:

- service;
- environment;
- version;
- trace ID;
- request/event ID;
- operation;
- outcome;
- stable error category.

Sensitive values are redacted at logger configuration and reviewed in tests.

### Current Phase 01 baseline

P01-R04 is released through `@aster/runtime`. It emits bounded Pino-backed JSON to standard output with fixed service, environment, and version context; reviewed sensitive-key redaction; sanitized error causes; and optional validated trace/span IDs supplied through a repository-owned active-context provider. Invalid per-call data produces a safe stable event, while an invalid or throwing trace provider is omitted without failing application work.

The P01-R06 candidate adds `@aster/telemetry` as the only package that imports OpenTelemetry metrics infrastructure. Repository-owned declarations expose finite HTTP, dependency, outcome, environment, collection, export-health, flush, and shutdown contracts without OpenTelemetry types. In process-local mode, a manual reader makes metrics inspectable without a Collector or network. Optional OTLP/HTTP export uses one periodic reader, one in-flight export, finite interval and timeout, a bounded batch size, and a cardinality ceiling.

The candidate collects the official Node.js runtime instrumentation for event-loop time, utilization and delay, V8 garbage collection, heap spaces, and active resources. It adds process CPU time, CPU utilization normalized by CPUs available to the process, resident memory, and uptime through Node.js built-ins. `process.cpu.time` is the canonical CPU measurement; `process.cpu.utilization` remains a derived convenience metric because the current OpenTelemetry convention classifies it as opt-in.

No Collector, scrape endpoint, log backend, trace SDK, retention policy, dashboard, alert, SLO, service composition, or hosted resource is implemented by P01-R06. The real Collector and Prometheus proof remains owned by P01-R09.

### Implemented metric contract

| Metric | Unit | Dimensions |
|---|---|---|
| `http.server.request.duration` | `s` | method, repository route, status class, outcome |
| `http.server.active_requests` | `{request}` | method, repository route |
| `aster.dependency.operation.duration` | `s` | dependency, operation, outcome |
| `aster.dependency.operation.active` | `{operation}` | dependency, operation |
| `aster.dependency.operation.outcomes` | `{operation}` | dependency, operation, outcome |
| `aster.telemetry.export.attempts` | `{attempt}` | export result |
| `aster.telemetry.dropped_observations` | `{observation}` | bounded drop reason |
| `aster.cache.operation.duration` | `s` | cache family, finite outcome, optional waiter bucket |
| `aster.cache.operation.outcomes` | `{operation}` | cache family, finite outcome, optional waiter bucket |
| `aster.cache.payload.size` | `By` | cache family, finite outcome |
| `aster.operation.limit.duration` | `s` | limiter kind, fixed operation, finite outcome, optional queue bucket |
| `aster.operation.limit.outcomes` | `{operation}` | limiter kind, fixed operation, finite outcome, optional queue bucket |
| `process.cpu.time` | `s` | CPU mode `user` or `system` |
| `process.cpu.utilization` | `1` | CPU mode `user` or `system` |
| `process.memory.usage` | `By` | none |
| `process.uptime` | `s` | none |

HTTP duration uses the OpenTelemetry recommended server boundaries from 5 milliseconds through 10 seconds. Dependency duration uses explicit boundaries from 1 millisecond through 10 seconds. The selected metric reader applies a configurable ceiling from 16 through 512 series per instrument; the default is 128 and the SDK's overflow series absorbs observations beyond it.

Allowed HTTP routes are `/graphql`, `/health/live`, and `/health/ready`. Dependency and operation values come from exported finite sets; changing either set is a reviewed public-contract change. Unknown, accessor-backed, excessive, or invalid observations fail closed and increment one bounded drop category. Completion leases are one-shot, so active metrics cannot decrement twice or become negative.

### Export and shutdown behavior

OTLP endpoints accept only bounded HTTP(S) URLs without embedded credentials. Export failures and timeouts update process-local health and drop counters without exposing endpoint text or exporter errors. A late exporter callback is ignored after the package-owned timeout, and the OpenTelemetry reader also owns a finite timeout and a single in-flight export.

`forceFlush` and `shutdown` return sanitized bounded results. Concurrent callers share one underlying operation while each caller retains its own cancellation path; canceling one waiter does not cancel or duplicate provider work. An exporter failure absorbed by the OpenTelemetry reader becomes a stable failed flush result. The `lifecycleHooks().flushTelemetry` adapter composes with the released P01-R05 lifecycle and never reflects an exporter error into product behavior or readiness. Runtime observers are disabled before provider shutdown, repeated shutdown is idempotent, and the lifecycle deadline remains authoritative if an exporter does not cooperate.

### Implemented Phase 12 trace candidate

P12-R01/R02/R08/R09 are implemented through `@aster/telemetry` on PR45; they
remain unverified until corrected protected CI and confirmation pass. The
package owns the OpenTelemetry trace SDK and exact-pinned OTLP/HTTP trace
exporter behind repository types. Application, domain and adapter public
contracts do not expose SDK types.

The fixed span vocabulary is:

| Span | Kind | Attributes |
| --- | --- | --- |
| `aster.http.server` | server | boundary, finite method, finite route, outcome |
| `aster.dependency.operation` | client | boundary, finite dependency, finite operation, outcome |

Every subgraph runs its real HTTP handler in an asynchronous server-span scope
and supplies that active context to the existing redacting logger. Owner HTTP
clients inject their child dependency context. PostgreSQL, Redis, broker and
object-storage adapters reuse the same finite dependency contract. Identity
events preserve the active validated producer `traceparent`; authenticated
Engagement consumption starts a local trace with one producer link and executes
its durable work and log inside that scope. Catalog represents the
network-isolated decoder handoff with one finite `media_worker/process` boundary
without passing credentials or arbitrary telemetry configuration into the
worker.

The default active/retained trace capacity is 128 and the accepted range is
1–512. Span values are capped at 64 characters, spans contain at most eight
attributes and one link, and span events are disabled. Export concurrency is
one per signal, trace batches contain at most 32 spans, and both SDK and
repository health wrappers use finite deadlines. Export health is diagnostic;
it does not affect readiness or product outcomes. Exact implementation evidence
and the protected-verification boundary are indexed in
[`evidence/phase-12/`](../../evidence/phase-12/README.md).

## SLIs

Initial critical SLIs:

- successful supergraph request ratio;
- catalog-title read latency and success;
- playback-session creation success;
- playback first-frame success;
- accepted progress write success;
- media publication success;
- continue-watching freshness.

Exact definitions are in `docs/operations/SLIS_SLOS_AND_ALERTS.md`.

## Dashboards

Dashboards answer operational questions:

1. Are viewers able to browse and start playback?
2. Which boundary is consuming latency?
3. Is failure isolated or systemic?
4. Is Redis helping or increasing instability?
5. Is the database saturated?
6. Are events delayed or failing?
7. Is media processing keeping up?
8. Is an SLO burning too quickly?

## Cardinality controls

Never use as metric labels:

- user ID;
- account ID;
- profile ID;
- title ID;
- request ID;
- trace ID;
- full URL;
- exception message;
- GraphQL document.

Use logs or sampled traces for high-cardinality investigation.

## Telemetry failure

Telemetry export has bounded queues and deadlines. Export failure increments dropped-item counters and cannot block critical request completion indefinitely.
