# Capacity and Evolution

## Baseline planning model

The initial hosted release uses an explicit planning model rather than a claim about actual traffic.

Illustrative validation target:

- 100,000 monthly active viewers;
- 10,000 daily active viewers;
- 2,000 concurrent viewers at peak;
- 100 playback starts per second during a burst;
- progress report every 15 seconds while playing;
- 300 GraphQL operations per second sustained with higher short bursts;
- a catalog of fewer than 1,000 titles;
- dozens of media-processing jobs per day.

These are load-test assumptions to be replaced with observed data.

## Derived control-plane load

At 2,000 concurrent viewers with progress every 15 seconds:

```text
2,000 / 15 ≈ 134 progress reports per second
```

Allowing retries and burst alignment, test a higher bounded rate.

Media segment traffic is not part of GraphQL capacity. It belongs to CDN and origin planning.

## Bandwidth model

For `C` concurrent viewers and average delivered bitrate `B`:

```text
egress bits per second = C × B
```

At 2,000 viewers and 3 Mbps average:

```text
≈ 6 Gbps edge delivery
```

The application API must not proxy this traffic.

## Storage model

For each source:

```text
total storage
= original
+ all video renditions
+ audio renditions
+ subtitles
+ images
+ processing evidence
```

HLS packaging may add modest overhead. Multiple codecs multiply storage and compute. Add a codec only with device, bandwidth, and cost evidence.

## Database pressure

Likely high-write paths:

- progress;
- playback sessions;
- audit records;
- outbox.

Likely high-read paths:

- title details;
- browse/search;
- continue-watching;
- home rails.

Mitigation order:

1. correct indexes and bounded queries;
2. batching;
3. cache derived reads;
4. remove unnecessary writes;
5. coalesce safe high-frequency updates;
6. partition only when observed pressure requires it.

## Evolution triggers

### Split PostgreSQL clusters

Trigger when context workloads or operational risk interfere despite query and pool optimization.

### Redis cluster or separate deployments

Trigger when memory, hot-key traffic, or failure isolation requires separation.

### Dedicated search engine

Trigger when PostgreSQL search cannot meet relevance, language, indexing, or latency requirements at observed scale.

### Multi-region read delivery

Trigger when user latency or resilience targets cannot be met by CDN plus a single control-plane region.

### Multi-region writes

Trigger only with explicit regional availability requirements and a per-domain conflict model.

### Additional video codecs

Trigger when bandwidth savings outweigh encode compute, storage, operational complexity, and device compatibility cost.

## Capacity evidence

Every phase-14 result records:

- hardware or hosted instance;
- service replica counts;
- dependency configuration;
- dataset size;
- cache state;
- operation mix;
- test duration;
- warmup;
- error rate;
- p50, p95, p99;
- saturation signals;
- raw output;
- known limitations.
