# Failure Modes

## Failure matrix

| Failure | User impact | System behavior | Evidence | Primary response |
|---|---|---|---|---|
| Catalog PostgreSQL unavailable | uncached title and browse fail | cache may serve bounded stale public data; writes fail | DB errors, cache serve mode, SLI | restore DB or fail over |
| Private Catalog owner read repeatedly fails | new playback fails closed; Discovery refresh/rebuild pauses | operation-scoped breaker opens after measured failures; Playback has no allow fallback; existing valid Discovery projection may remain | dependency outcomes and finite breaker events | restore Catalog/trust, then allow one half-open probe |
| Redis unavailable | higher latency, reduced personalization or rate-limit precision | bypass cache; preserve durable writes; activate local safety bounds | Redis error ratio, DB load | isolate Redis, protect DB |
| Discovery subgraph unavailable | personalized rails missing | return editorial fallback | router traces, degradation metric | open breaker, recover subgraph |
| Engagement unavailable | progress/watchlist unavailable | playback continues; UI reports save state honestly | mutation errors, SLI | recover service; do not fake save |
| Playback subgraph unavailable | new playback cannot start | existing CDN playback may continue until session policy expires | session SLI | restore or roll back |
| Identity unavailable | protected actions fail; public browse remains | existing verified session behavior follows policy | auth errors | restore identity dependency |
| Broker unavailable | projections become stale | outbox retains events; source writes continue within outbox capacity | outbox age, broker errors | restore broker, drain safely |
| Consumer poison event | one projection partition may stall | quarantine after bounded retries; continue according to ordering design | quarantine count, lag | inspect and replay |
| Media source stalls | ingest delayed | progress timeout cancels attempt; retry bounded | worker spans, attempt status | retry or replace source |
| FFmpeg hangs | processing slot consumed | hard deadline kills process tree; cleanup | worker duration, kill count | inspect source/recipe |
| Object upload partial | publication unavailable | immutable partial prefix remains private; cleanup | object validation | retry idempotently |
| Missing HLS segment | playback error | validation should block publication; if post-publish loss occurs, retire or restore objects | CDN 404, player error | restore immutable object |
| Cache stampede | DB latency and load spike | coalescing and lease reduce refreshes; stale fallback | miss burst, lease contention | extend stale, protect DB |
| GraphQL abusive query | resource pressure | reject by trusted-operation, parser, cost, depth, rate, or concurrency controls | rejected reason metrics | tune controls or block source |
| Event-loop blocking | broad request latency | instance readiness may degrade; autoscaling alone may not solve | event-loop delay, trace gaps | remove CPU work or offload |
| Memory growth | restart risk | alert, capture heap evidence, controlled restart if needed | RSS/heap trend | diagnose retention |
| Deployment incompatibility | errors after rollout | canary or smoke test fails; halt and roll back | release metrics | rollback/roll-forward |
| Telemetry backend unavailable | reduced diagnosis | bounded buffering and drop counting; serving continues | exporter failures | restore backend |

## Cascading-failure controls

- bounded database pools;
- request concurrency limits;
- short Redis timeouts;
- no retry loops at every layer;
- deadline propagation;
- operation-scoped breaker on implemented private Catalog reads and finite bulkheads;
- stale data only where semantically safe;
- separate worker and request compute;
- finite queues;
- backpressure;
- load shedding;
- SLO alerts before total failure.

## Failure semantics by context

### Identity

Fail closed for protected access. Public catalog browsing may remain.

### Catalog

Rights and publication writes fail closed. Public reads may use bounded stale cache only when rights expiry cannot be hidden beyond the accepted window.

### Playback

No new session is issued without trusted publication state. Existing segment delivery is independent of GraphQL after authorization.

### Engagement

Never acknowledge progress as durable before the authoritative transaction commits. Duplicate and stale reports return explicit accepted/current state.

### Discovery

Prefer partial useful results and stable fallback. Do not turn optional ranking failure into a supergraph-wide error.

### Media

Never publish partial output. Keep failure evidence and cleanup bounded.

## Game days

Phase 11 and Phase 14 exercise:

- Redis outage under browse traffic;
- Discovery latency and total outage;
- broker outage and recovery drain;
- stale and duplicate progress reports;
- FFmpeg timeout and disk pressure;
- missing media object detection;
- event-loop blocking;
- abusive GraphQL documents;
- deployment rollback.
