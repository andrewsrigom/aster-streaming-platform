# Resilience Architecture

## Goals

- Preserve critical browse and playback paths during optional dependency failure.
- Bound latency and resource usage during slowness.
- Avoid duplicate side effects under retry.
- Surface degraded behavior clearly through telemetry.
- Recover automatically when safe and operationally when not.

## Dependency classes

### Critical

Failure prevents the requested outcome.

Examples:

- Catalog durable read for an uncached title;
- publication check for playback;
- Engagement durable write for accepted progress;
- identity verification for protected mutations.

Critical does not mean “retry forever.” It means return a precise failure when the deadline cannot be met.

### Optional

Failure allows a fallback.

Examples:

- recommendations;
- trending computation;
- nonessential artwork variants;
- analytics export;
- optional personalization rails.

## Deadline propagation

Each inbound request receives an overall deadline. The router and subgraphs reserve time for response handling and pass a smaller remaining budget downstream.

An operation must not begin a retry if the remaining budget cannot support another attempt and response.

The implemented first Phase 11 policy uses the shared runtime safe-read executor
for Playback and Discovery's fixed private Catalog reads. [ADR-0040](../adr/0040-deadline-bound-safe-read-retries.md)
defines the exact budgets and finite transient classification. The complete
[dependency policy registry](DEPENDENCY_POLICY_REGISTRY.md) distinguishes current
controls from later Phase 11 breaker work.

## Policy matrix

| Dependency | Timeout | Retry | Breaker | Bulkhead | Fallback |
|---|---|---|---|---|---|
| PostgreSQL read | bounded query and request budget | only selected transient connection failures | generally pool/instance level alert, not business fallback | pool size and query concurrency | cache or error depending on path |
| PostgreSQL write | bounded | only when transaction outcome is known or idempotent | no blind retry loop | pool | error |
| Redis read | short | at most one transient reconnect-aware retry | per capability | client pool and call concurrency | source read or stale |
| Subgraph call | less than upstream budget | safe queries only | per dependency/operation | router traffic shaping | partial/fallback where schema allows |
| Object metadata | bounded | idempotent reads | per storage operation | concurrency limit | reject playback if publication cannot be trusted |
| Media download | long task deadline plus progress timeout | range-resumable and bounded | source-host scoped | worker queue | failed attempt |
| FFmpeg | recipe-specific hard deadline | only classified failures | not applicable | worker slots | failed attempt |
| Broker publish | asynchronous outbox retry | yes, bounded backoff | relay health | relay concurrency | retain outbox |
| Broker consume | retry then quarantine | yes | consumer pause | consumer concurrency | projection stale |

## Retry safety

Safe by default:

- GET-like reads;
- object existence checks;
- idempotent event publication by event ID;
- idempotent processing request by source checksum and recipe.

Requires key or durable guard:

- progress mutation;
- profile deletion;
- playback-session creation if it creates durable usage records;
- media publication;
- watchlist mutation.

Unsafe to retry blindly:

- unknown transaction outcome;
- non-idempotent external side effect;
- mutable operation without a key.

## Circuit breakers

Breakers are scoped so one failing operation does not block unrelated dependency use.

State changes emit:

- dependency;
- operation class;
- previous and new state;
- sampled failure category;
- open duration.

Metrics do not label by raw URL or identifier.

## Bulkheads

Protect:

- GraphQL request execution;
- expensive search;
- Redis refresh work;
- media downloads;
- FFmpeg slots;
- event consumers;
- database pool.

Queue capacity is finite. Overflow produces a controlled error or fallback.

## Degraded examples

- Discovery unavailable → editorial rails from Catalog.
- Redis unavailable → direct bounded reads and reduced rate-limit mode.
- Engagement unavailable → playback works, progress UI indicates delayed saving only when a durable buffering design exists; otherwise it reports save failure honestly.
- Telemetry backend unavailable → local bounded buffering and drop accounting; serving continues.
- Caption asset missing → title cannot pass publication validation when captions are required by metadata.

## Failure injection

Phase 11 adds controlled injection at adapters:

- fixed and variable latency;
- timeouts;
- connection reset;
- selected status or error;
- malformed response;
- partial stream;
- resource saturation;
- Redis miss/error;
- event duplicate and reorder.

Injection is disabled by default, unavailable in production public paths, and clearly visible in telemetry.
