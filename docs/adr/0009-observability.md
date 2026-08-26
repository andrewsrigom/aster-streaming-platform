# ADR-0009: Standardize Telemetry through OpenTelemetry

- Status: Accepted
- Date: 2026-08-25
- Related requirements: OPS-R03–R05

## Context

Aster needs correlation across browser rendering, router, subgraphs, databases, Redis, events, and media processing. Vendor-specific instrumentation would make local and hosted environments diverge.

## Decision

Instrument services with OpenTelemetry-compatible traces, metrics, and context propagation. Export through an OpenTelemetry Collector.

Use structured logs correlated with trace and span IDs. Local backends use Prometheus, Tempo, Loki, and Grafana-compatible components.

## Consequences

### Positive

- Consistent instrumentation and backend flexibility.
- Distributed traces across synchronous and asynchronous boundaries.
- Local operational environment resembles hosted concepts.
- SLI calculations can rely on stable telemetry.

### Negative

- Collector and semantic conventions require maintenance.
- Incorrect instrumentation can add cost and cardinality.
- Browser-to-backend correlation requires careful privacy design.

## Alternatives considered

### Direct vendor SDKs

Deferred to optional exporter adapters. Core instrumentation stays portable.

### Logs only

Rejected because tail latency and distributed dependency behavior need traces and metrics.

## Revisit triggers

Specific hosted capabilities may add vendor instrumentation, but core signals remain available through the standard path.
