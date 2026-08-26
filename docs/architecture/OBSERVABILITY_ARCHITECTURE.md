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
