# Dependency Policy Registry

Status: implemented inventory for the current local system; entries marked
`planned P11` are not yet implemented. Last reviewed: 2026-08-29.

This registry is authoritative for dependency-operation policy ownership. It
separates a logical application attempt from connection recovery, durable outbox
redelivery and explicit user retry. Exact adapter values remain enforced in the
linked source/configuration; ranges below summarize owners that intentionally use
different bounds.

## Synchronous request policies

| ID | Dependency and operation | Role / safety | Overall and attempt timeout | Attempts and backoff | Breaker | Bulkhead / queue | Fallback | Telemetry | User outcome | Retry owner |
|---|---|---|---|---|---|---|---|---|---|---|
| `web.public-query` | Web → Router public query | critical browse read; safe | 4,000 ms Web; Router 3,000 ms | 1; none | none; planned P11 by Router operation | Web 16 sockets; Router 8 requests | SSR error or feature-owned partial result | HTTP + Router operation/fetch | explicit unavailable/partial UI | none |
| `web.protected-mutation` | Web → Router protected mutation | unsafe unless existing intent key protects it | 4,000 ms Web; Router 3,000 ms | 1 automatic; exact progress intent may retry once in its owner UI policy | none; no allow fallback | Web 16 sockets; Router 8 requests | none | HTTP + operation code | explicit save failure/indeterminate | feature intent only, never generic transport |
| `router.catalog-identity` | Router → Catalog/Identity query | critical owner read | 2,000 ms under 3,000 ms Router | 1; none | none; planned P11 per owner/operation | Router concurrency 8 | schema-defined partial only | Router subgraph fetch | GraphQL data/error | none |
| `router.playback-engagement` | Router → Playback/Engagement | critical mutation/control plane | 2,700 ms under 3,000 ms Router | 1; none | none; planned P11 per owner/operation | Router concurrency 8 | none for authorization/write | Router subgraph fetch | typed failure or GraphQL error | none |
| `router.discovery` | Router → Discovery | optional read | 1,700 ms under 3,000 ms Router | 1; none | none; planned P11 per operation | Router concurrency 8; Discovery search 2 active + 1 waiter/100 ms | public editorial/recent fallback where defined | Router fetch + Discovery rail/search | partial/stale/unavailable | none |
| `owner.playback-publication` | Playback → Catalog current publication | critical safe read | 1,500 ms overall; 650 ms attempt; 100 ms reserve | max 2; 13–25 ms equal jitter; only selected transient failures | none; planned P11 per Catalog/publication | 4 logical operations; no queue; retry holds permit | none; no session without current authority | `catalog`/`read` per attempt + finite executor outcomes | unavailable/not playable | Playback Catalog client |
| `owner.discovery-snapshot` | Discovery → Catalog current snapshot/export | optional safe read | 2,000 ms overall; 850 ms attempt; 100 ms reserve | max 2; 13–25 ms equal jitter; only selected transient failures | none; planned P11 per Catalog/snapshot | 1 logical operation; no queue; retry holds permit | retain valid active projection; public rails degrade explicitly | `catalog`/`read` per attempt + consumer/rebuild outcome | stale/unavailable without fabricated data | Discovery Catalog client |
| `owner.engagement-authority` | Engagement → Identity/Playback/Catalog authority | critical authorization/visibility read | 2,500 ms application; 2,000 ms adapter ceilings | 1; none | none; planned P11 only after operation-specific proof | purpose-separated finite client admission | none that allows access or writes | owner operation + GraphQL code | unauthenticated/unavailable | none |
| `postgres.read` | Owner PostgreSQL read/query | critical or optional by use case; safe statement | 0.9–3 s operation; 0.7–2 s statement in owner config | 1 application attempt; driver connection handling is not query retry | none; planned P11 per owner/read class | owner pools 1–5; request admission outside pool | only rights-safe Catalog cache or bounded Discovery stale paths | `postgresql`/`query` | typed unavailable/partial | none |
| `postgres.write` | Owner PostgreSQL transaction | critical durable effect; unknown commit is unsafe | 1–3 s operation; statement/lock bounds per migration/owner | 1; no blind retry; exact receipt may replay a new invocation | none; alert/owner recovery | bounded owner pool and transaction admission | none | `postgresql`/`query` + owner result | completed only after acknowledged commit; otherwise indeterminate | durable idempotency owner only |
| `redis.cache` | Catalog/Discovery cache read/write/lease | optional derivation | 250 ms production command; 1,000 ms connect | 1 application command; bounded reconnect does not replay ambiguous command | none; planned P11 per cache family | 32 commands; finite coalescing/lease wait | current source or bounded validated stale data | `redis`/`command` + finite cache outcomes | normal, stale or source result | none |
| `redis.admission` | Engagement token bucket/admission marker | optional distributed precision; atomic decision | 250 ms production command; 1,000 ms connect | 1 command; no application retry | none; planned P11 per limiter operation | 16 commands + 1,024 local partitions and finite same-key waiters | bounded local shield; never authorizes durable effect | `redis`/`command` + operation-limit outcome | allowed/limited/unavailable | none |

## Asynchronous, storage and process policies

| ID | Dependency and operation | Role / safety | Overall and attempt timeout | Attempts and backoff | Breaker | Bulkhead / queue | Fallback | Telemetry | User outcome | Retry owner |
|---|---|---|---|---|---|---|---|---|---|---|
| `broker.publish` | Owner outbox → Kafka publish | durable idempotent event ID/key | 2,000 ms adapter operation inside 7,000 ms relay step | max 2 transport attempts; failed relay cycles back off 1.25–5 s | relay readiness; planned P11 transition model | 1 in-flight publish per owner; durable bounded outbox | retain outbox | `broker`/`publish`, relay state/age | source write remains durable until outbox capacity | broker adapter within relay step |
| `broker.consume` | Kafka → owner projection consumer | idempotent version/event handling | 2–5 s handler deadline by consumer | broker redelivery; poison is bounded quarantine, not hot in-process retry | consumer pause/recovery; planned P11 transition model | configured consumer concurrency; one handler lane in current owners | retain prior projection/stale state | `broker`/`consume`, lag/quarantine | optional data stale; source truth unchanged | broker redelivery + owner idempotent consumer |
| `object.read` | S3 metadata/object stream | critical for validation/playback publication | 5–15 s operation by command; stream byte/deadline bounds | SDK max attempts 1 | none; planned P11 per storage/read | 1 operation in media/local tools; adapter finite configured capacity | fail publication/reuse | `object_storage`/`read` | media unavailable, never partially published | none |
| `object.write-delete` | S3 immutable upload/compensation | idempotent only by immutable key/checksum | 5–15 s operation | SDK max attempts 1; durable workflow may start a separately identified attempt | none; operator containment on ambiguity | 1 media operation; bounded multipart buffers | private partial prefix retained/cleaned explicitly | `object_storage` write/delete | no publication until verification | durable media workflow only |
| `media.source-download` | reviewed HTTPS source acquisition | durable attempt; range/resume not currently claimed | DNS 1 s/1 try; connect 5 s; headers/idle 10 s; worker extraction 60 s | 1 network attempt per durable acquisition; max 3 separately recorded attempts | none; planned P11 source-host scope | one global acquisition/processing owner slot | replace source or explicit later attempt | bounded attempt report | acquisition failed; no publish | Catalog acquisition workflow |
| `media.ffmpeg` | isolated decoder/transcode process | durable recipe/checksum-protected attempt | recipe command hard deadline; current integration ceiling 90 s | no in-process retry; max 3 separately recorded processing attempts | not applicable | one global processing slot; no implicit queue | reuse only checksum/recipe-identical verified candidate | process/attempt report | processing failed; no partial publish | Catalog processing workflow |
| `telemetry.export` | service → OTLP Collector | optional | 1,000 ms export timeout; 5 s interval | 1; SDK bounded batch behavior, no serving retry | none | bounded SDK queue/cardinality | drop accounting; serving continues | export health/drop count | no product impact | exporter only |

## Retry-layer rules

- A row has exactly one named synchronous retry owner or `none`.
- Router and generic Web transports do not retry owner operations.
- Driver reconnect, an explicit user action, durable outbox redelivery and a new
  durable media attempt are not hidden nested retries of one request.
- A timeout or unknown transaction outcome is not automatically transient.
- Authorization and rights checks never fall back to allow.
- Circuit-breaker entries say `planned P11` until state transitions and metrics
  are implemented and evidenced; the registry does not claim future behavior.

## Implementation references

- [ADR-0040](../adr/0040-deadline-bound-safe-read-retries.md)
- [Router configuration](../../infra/router/router.yaml)
- [Runtime safe-read executor](../../packages/runtime/src/safe-read.ts)
- [Playback Catalog client](../../services/playback/src/infrastructure/catalog-publication-client.ts)
- [Discovery Catalog client](../../services/discovery/src/infrastructure/catalog-snapshot-client.ts)
- [Owned event delivery](../adr/0034-owned-event-delivery.md)
- [Durable media processing](../adr/0024-durable-media-processing.md)
- [Failure modes](FAILURE_MODES.md)
