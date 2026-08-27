# Persistent Project Context

## Product

Aster is a video-on-demand platform for openly licensed films. Its initial value is a reliable browsing and playback experience backed by a rights-aware content pipeline.

## Current implementation state

The repository foundation and Phase 01 technical packages exist. The active P01-R08 candidate adds a local product-empty Identity entrypoint that composes those packages, with health and a controlled loopback diagnostic. No containerized product service, product schema/resolver/migration, broker/object-storage runtime, or observability backend exists yet. `.ai/CURRENT_STATE.md` distinguishes implemented candidates from released behavior.

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

P01-R05 lifecycle, P01-R06 telemetry, and P01-R07 platform adapters are released. P01-R08 composition is active from corrective released `main`; deadlines, readiness, monitoring, health, configuration, real factories, Identity entrypoint and controlled process diagnostic are implemented locally. Acceptance and protected release closeout remain next. P01-R09 real integration and P01-R10 resource-aware Docker-only closeout remain later work.
