# Performance and Capacity Validation

## Principles

- Define the user outcome first.
- Use representative data and operation mix.
- Assert correctness during load.
- Warm up deliberately.
- Record cache state.
- Observe saturation.
- Compare identical environments.
- Keep raw evidence.
- Avoid precision beyond assumptions.

## Performance budgets

Phase 05 defines initial web budgets. Phase 14 calibrates system budgets.

Candidate categories:

- server response;
- LCP, INP, CLS;
- JavaScript and image bytes;
- hydration;
- GraphQL operation count;
- router p95 and p99;
- subgraph latency;
- database query count;
- event-loop delay;
- memory;
- cache hit ratio;
- playback first frame;
- progress write;
- media queue and transcode duration.

## Workload model

A representative mixed test should include:

- public home;
- title detail;
- profile home;
- search;
- playback-session creation;
- progress reports;
- watchlist mutations at a lower rate;
- background outbox and projection work.

Media segments are tested against CDN/origin separately.

## Test types

### Baseline

Single user or low rate to validate operation and trace shape.

### Load

Expected sustained rate.

### Spike

Abrupt increase to validate queues, autoscaling, and load shedding.

### Stress

Increase until an SLO or saturation boundary is reached. The goal is to identify the limit, not pass.

### Soak

Sustained load to identify memory growth, connection leaks, cache churn, broker lag, and queue instability.

### Failure under load

Remove or slow a dependency while representative traffic continues.

## Node runtime experiments

### Event loop

Measure lightweight request p99 while a controlled CPU operation runs. Compare avoidance, algorithm change, worker, or background processing.

### Streams

Compare buffering and streaming for a large export or transfer:

- first byte;
- throughput;
- peak RSS;
- external memory;
- abort cleanup.

### Memory

Run stable load, observe growth and post-load stabilization, capture heap evidence, fix, and rerun.

## GraphQL experiments

- query count before/after DataLoader;
- cost score versus actual latency and backend work;
- alias/depth rejection stage;
- known operation versus arbitrary document overhead;
- request concurrency saturation;
- partial subgraph failure.

## Redis experiments

- cold cache;
- warm cache;
- synchronized expiry;
- request coalescing;
- cross-instance lease;
- stale serving;
- outage;
- hot key.

## Media capacity

Measure:

- source download throughput;
- transcode real-time factor;
- CPU and memory per rendition;
- temporary disk;
- output size;
- queue wait;
- failure cleanup;
- titles processed per compute-hour.

## Result format

Use `docs/templates/EXPERIMENT_TEMPLATE.md`.

A conclusion states whether the requirement passed, what bottleneck appeared, what changed, and when the result should be revisited.
