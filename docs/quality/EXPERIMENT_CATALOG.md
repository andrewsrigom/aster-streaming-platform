# Experiment Catalog

Experiments produce evidence for specific architecture and runtime claims. IDs remain stable.

| ID | Experiment | Phase | Primary evidence |
|---|---|---:|---|
| EXP-001 | Event-loop blocking and tail latency | 14 | delay, CPU, p95/p99, profile |
| EXP-002 | Worker-thread or background offload comparison | 14 | throughput, latency, transfer overhead |
| EXP-003 | Buffered versus streamed export | 14 | first byte, peak RSS, throughput |
| EXP-004 | Memory-retention diagnosis | 14 | heap snapshots, RSS/heap stabilization |
| EXP-005 | GraphQL N+1 before and after DataLoader | 08/13 | SQL query count, latency |
| EXP-006 | GraphQL depth and alias abuse | 13 | rejection stage, CPU, latency |
| EXP-007 | Operation-cost calibration | 13 | score versus actual work |
| EXP-008 | Trusted-operation rejection | 13 | unknown operation result and metrics |
| EXP-009 | Catalog cache-aside | 10 | hit ratio, source load, latency |
| EXP-010 | Cache stampede | 10 | source amplification, lease contention |
| EXP-011 | TTL jitter distribution | 10 | expiry histogram |
| EXP-012 | Redis outage | 10/11 | user SLI, DB load, degraded mode |
| EXP-013 | Rate-limiter atomicity | 10 | allowed count under concurrency |
| EXP-014 | Circuit-breaker transitions | 11 | states, calls rejected, recovery |
| EXP-015 | Retry amplification | 11 | attempt count across layers |
| EXP-016 | Discovery fallback | 11 | home response, degradation telemetry |
| EXP-017 | Progress reordering | 08 | final durable position, stale outcomes |
| EXP-018 | Duplicate event delivery | 08 | one durable effect |
| EXP-019 | Broker outage and outbox drain | 11/14 | outbox age, recovery load |
| EXP-020 | HLS publication atomicity | 06 | no missing references |
| EXP-021 | FFmpeg cancellation and cleanup | 06 | process exit, temp cleanup |
| EXP-022 | Playback first-frame under throttling | 07/14 | startup, rendition, rebuffer |
| EXP-023 | SSR hydration stability | 05 | zero mismatches, operation count |
| EXP-024 | SLO alert burn | 12 | alert timing and runbook |
| EXP-025 | Database saturation and load shedding | 11/14 | pool, latency, errors, recovery |

## Experiment rules

- Use `docs/templates/EXPERIMENT_TEMPLATE.md`.
- Run against a named commit.
- Store raw artifacts.
- Keep functional assertions active.
- Separate warm and cold cache.
- State hardware and dependency configuration.
- Avoid changing multiple variables in one comparison.
- Record failed experiments; they are evidence.
- Do not generalize beyond the tested range.
