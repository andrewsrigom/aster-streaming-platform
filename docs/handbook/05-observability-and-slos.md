# Observability and Service Objectives

## Purpose

Monitoring tells an operator that a known condition occurred. Observability is the system's ability to support questions that were not fully predicted, using the telemetry it emits.

Aster needs both: defined SLIs for critical journeys and correlated evidence for unexpected failure.

## 1. Logs, metrics, and traces

### Logs

Best for discrete events and detailed context:

- title publication rejected;
- breaker opened;
- processing attempt failed;
- progress update was stale;
- deployment version started.

Logs should be structured, sanitized, and correlated.

### Metrics

Best for aggregation and alerting:

- request rate;
- error ratio;
- p95;
- cache hit ratio;
- event-loop delay;
- worker queue age;
- playback first-frame success.

Metrics require bounded labels.

### Traces

Best for one operation's path and latency:

```text
HomeQuery
├─ Router plan
├─ Catalog fetch
│  ├─ Redis GET
│  └─ PostgreSQL query
├─ Engagement fetch
└─ Discovery fetch
   └─ fallback decision
```

A trace can explain why latency grew even when each service average looks normal.

## 2. Semantic context

Use stable attributes:

- service;
- environment;
- build version;
- GraphQL operation name or trusted ID;
- subgraph;
- dependency type;
- cache outcome;
- error category;
- media processing stage;
- publication state.

Do not put unbounded identity values in metrics. Trace and logs can carry carefully controlled high-cardinality correlation IDs, but not personal or secret data.

## 3. SLI design

An SLI is a ratio or distribution with an explicit population.

### Playback-session success

Population:

- valid `createPlaybackSession` attempts for published titles.

Good event:

- a usable session returned within the latency objective.

Exclude:

- deliberate client validation errors;
- unauthorized requests;
- controlled load-test traffic if separated.

Do not exclude dependency failures because they affect the viewer.

### First-frame success

Population:

- playback sessions where the player attempted media loading.

Good event:

- first frame observed within the objective before fatal error.

This requires client telemetry and careful sampling.

### Progress-write success

Population:

- valid current progress reports.

Good event:

- accepted or recognized duplicate within the objective.

Stale reports may be a valid domain outcome rather than service failure; define them separately.

## 4. SLOs

An SLO contains:

- SLI;
- target;
- rolling window;
- owner;
- alert strategy;
- user impact;
- exclusions;
- reporting source.

Illustrative targets are placeholders until Phase 12 calibration:

```text
Supergraph valid-operation availability:
99.9% over 30 days

Playback-session success:
99.9% over 30 days

Catalog title p95:
under 300 ms over 28 days

Progress valid-write success:
99.95% over 30 days
```

Do not adopt these values without baseline and product review.

## 5. Error budget

For a 99.9% availability objective, 0.1% of valid events may be bad in the window.

The budget supports decisions:

- continue release cadence;
- slow risky changes;
- prioritize reliability;
- investigate a dependency;
- adjust an unrealistic SLO with evidence.

It is not permission to ignore known defects.

## 6. Burn-rate alerts

A fast burn consumes the budget rapidly and needs urgent action. A slow burn may require investigation without paging immediately.

Multi-window alerts reduce noise by checking both recent and sustained burn.

Every alert states:

- affected SLO;
- current burn;
- likely user impact;
- dashboard;
- trace search;
- runbook;
- owner.

## 7. Node-specific telemetry

- event-loop delay histogram;
- event-loop utilization;
- RSS, heap, external, array buffers;
- CPU;
- active handles where diagnostically useful;
- in-flight requests;
- shutdown duration;
- dropped telemetry.

Correlate runtime pressure with operation load. A heap graph alone does not identify cause.

## 8. GraphQL telemetry

Track:

- operation rate and duration;
- cost;
- rejection reason;
- subgraph duration;
- fetch count;
- errors by stable category;
- resolver or entity batch size where useful.

Do not use raw GraphQL documents as metric labels or default logs.

## 9. Playback quality telemetry

Useful session dimensions with bounded values:

- browser family;
- device class;
- network class when available and privacy-reviewed;
- selected rendition class;
- error category;
- caption availability.

Useful indicators:

- startup time;
- first-frame success;
- rebuffer count and duration;
- fatal errors;
- rendition switches;
- completion.

Sampling and retention must be documented.

## 10. Diagnostic exercise

For each injected failure:

1. begin from the user SLI;
2. identify affected operation;
3. inspect trace boundary latency;
4. correlate dependency metrics;
5. inspect logs for stable error category;
6. confirm saturation or failure;
7. use runbook mitigation;
8. verify SLI recovery.

The exercise succeeds when diagnosis follows telemetry rather than private implementation knowledge.
