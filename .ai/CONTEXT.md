# Persistent Project Context

## Product

Aster is a video-on-demand platform for openly licensed films. Its initial value is a reliable browsing and playback experience backed by a rights-aware content pipeline.

## Current implementation state

Phases 00–09 are released locally through protected and exact post-merge CI.
Guarded sessions/profiles, rights-aware Catalog, Apollo Router, public Next.js
SSR, accessible HLS playback, durable progress/resume, owned library and owner
event recovery, Discovery search/home and its SSR/private enhancement pass their
recorded acceptance. Phase10 advanced Redis and concurrency is active. Exact
progress lives in `.ai/CURRENT_STATE.md`.

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

Active phase: **Phase 10 — Advanced Redis and Concurrency**. Phase09 closed
through PR36, squash main `ffe8e24` and exact-main CI33254719311. The P10 Catalog
cache is released through PR37 head `cb86c37`, protected run33270889083, clean
confirmation, squash main `903f7b4` and exact-main run33272501078. Discovery
stale-while-revalidate passed PR39 exact `601cc95`, protected run33274397440 and
clean confirmation, then squash-merged as main `6a2fe3a`; exact-main run
33275183338 is pending. P10-R08 is the permitted dependent local item on
`feat/p10-operation-limiters` and may not publish until that predecessor passes.

Read `.ai/CURRENT_STATE.md` and `.ai/WORK_QUEUE.md` for the exact next action.

PR 21 squash `b6c99c4` and successful post-merge run `33104100966` close Phase 04. Initial CI/review findings and corrections remain recorded in its evidence. That historical phase did not approve a film; Phase 06 now has one approval, but no hosted release. Keep owner-side authorization and prevent local viewer identity from becoming an operator or hosted trust shortcut.
