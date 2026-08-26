# Architecture Evolution and Trade-offs

## Initial architecture

The initial release intentionally uses:

- one region;
- one PostgreSQL cluster with context-owned schemas or databases;
- one Redis deployment with namespaced owners;
- one Kafka-compatible broker;
- one S3-compatible origin;
- one CDN;
- five subgraphs;
- independent media workers;
- one supergraph.

This is enough to establish real boundaries and failure behavior without solving unobserved global-scale problems.

## Decision matrix

| Pressure | First response | Later response |
|---|---|---|
| Catalog read latency | indexes, batching, cache | read replicas or context cluster |
| Progress write volume | efficient transaction, lower safe frequency | partitioned ingest and compaction |
| Search relevance | PostgreSQL search tuning | dedicated search platform |
| Redis hot key | local cache/coalescing | sharding or edge precompute |
| Discovery CPU | precompute, bound work | dedicated ranking workers |
| Event lag | optimize consumer, partitions | separate broker capacity |
| Media queue | worker concurrency and recipe tuning | specialized compute fleet |
| Origin egress | CDN cache policy | regional origins or multi-CDN |
| API regional latency | edge and regional stateless reads | regional read models |
| Write-region outage | backup/restore and failover | context-specific multi-region plan |

## Trade-off: synchronous versus asynchronous progress

### Synchronous

- clear durable acknowledgement;
- simple read-your-write;
- database write per report;
- regional latency tied to write region.

### Asynchronous

- high ingest capacity;
- natural burst absorption;
- acknowledgement semantics become more complex;
- ordering, duplicate, loss, and read-your-write need explicit design.

Use synchronous first. Evolve only with measured pressure and a durable promise to the client.

## Trade-off: PostgreSQL search versus dedicated search

### PostgreSQL

- one operational system;
- transactional source projection;
- sufficient for a small catalog;
- limited advanced relevance and language features.

### Dedicated search

- richer indexing and relevance;
- independent scaling;
- eventual consistency;
- additional operation and cost.

Adopt when requirements exceed measured PostgreSQL capability.

## Trade-off: service count

More deployables can improve isolation and ownership but add:

- network latency;
- retries and timeouts;
- schema compatibility;
- deployment coordination;
- observability;
- local resource cost;
- incident boundaries.

Aster keeps contexts explicit, but a future context may share a deployment when independent operation has no value. That change still preserves module and data ownership.

## Trade-off: cache freshness versus availability

Serving stale can preserve availability, but it can violate rights or availability changes.

- editorial rail ordering may be stale for minutes;
- title synopsis may be stale within policy;
- rights dispute and retirement need immediate owner check or emergency invalidation for playback;
- authorization never uses stale allow decisions.

## Trade-off: codec efficiency versus complexity

A more efficient codec can reduce egress but adds:

- encode compute;
- storage;
- device testing;
- manifest complexity;
- player behavior;
- operational evidence.

Start with broad compatibility. Add another codec only from playback-hour economics.

## Multi-region

Do not apply one consistency strategy to every context.

- Catalog publication: single writer is simple and safe.
- Rights: strong authority.
- Engagement progress: can potentially reconcile per profile/title.
- Discovery: regional eventual projections are natural.
- Media: CDN is already global.
- Identity: depends on provider and session model.

A multi-region ADR must be context-specific.

## Revisit cadence

Review architecture at:

- each phase close;
- major SLO miss;
- sustained capacity threshold;
- provider cost step change;
- repeated incident pattern;
- ownership change.

Evidence can confirm the current architecture is still the right choice. Evolution is not automatically progress.
