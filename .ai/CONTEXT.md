# Persistent Project Context

## Product

Aster is a video-on-demand platform for openly licensed films. Its initial value is a reliable browsing and playback experience backed by a rights-aware content pipeline.

## Current implementation state

The repository foundation and Phase 01 technical packages exist. Released P01-R09 proves the real PostgreSQL/Redis, Kafka, S3 and Collector/Prometheus matrix. P01-R10 implements a non-root production Identity image and Docker runtime profile with real PostgreSQL/Redis recovery, loopback health and safe scoped reset. Optional application integration/observability/full profiles and clean phase acceptance remain pending. No product schema/resolver/migration or playable journey exists yet.

## Fixed boundaries

Primary bounded contexts:

1. Identity and Profiles
2. Catalog
3. Playback
4. Engagement
5. Discovery

Media processing is an asynchronous worker capability that cooperates with Catalog and Playback but does not own editorial title state.

## Target technical baseline

- TypeScript monorepo managed with pnpm and Turborepo
- Next.js App Router web application
- Apollo Client and Redux Toolkit with separate state ownership
- Apollo Router and Federation v2 subgraphs
- Node.js services
- PostgreSQL for durable state
- Redis for cache, rate limiting, request coalescing, and bounded coordination
- Kafka-compatible event broker for domain-event distribution after the outbox phase
- FFmpeg media processing
- S3-compatible object storage and CDN delivery
- OpenTelemetry, Prometheus, Grafana, Tempo, and Loki
- Vitest, Playwright, integration containers, schema checks, and k6

Repository tool versions are selected and pinned in Phase 00. Application, container, and infrastructure dependency versions are selected in the phase that first owns them after current compatibility verification.

## Non-negotiable behavior

- Rights review precedes media publication.
- Application servers do not proxy video segments.
- Playback progress rejects stale and duplicate updates.
- Redis failure cannot corrupt durable product state.
- Optional discovery failure does not block catalog browsing or playback.
- Every public GraphQL operation has bounded cost and execution time.
- Cross-context events are versioned and idempotently consumed.
- Production claims require recorded evidence.

## Delivery state

Active phase: **Phase 01 — Local Platform and Runtime Skeleton**

Read `.ai/CURRENT_STATE.md` and `.ai/WORK_QUEUE.md` for the exact next action.

P01-R05 through P01-R09 are released. PR 17 squash `a1f7281` passes protected run `33041524806` and exact post-merge run `33041787663`, including the complete real eight-scenario matrix. P01-R10 is active from that clean merge: portable production Identity packaging, resource-aware profiles, exact reset and Docker-only evaluator acceptance. No playable product is implemented yet.
