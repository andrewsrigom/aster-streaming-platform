# Persistent Project Context

## Product

Aster is a video-on-demand platform for openly licensed films. Its initial value is a reliable browsing and playback experience backed by a rights-aware content pipeline.

## Current implementation state

Phases 00–03 are released. Guarded local sessions/profiles and rights-aware Catalog run in Docker with protected/post-merge acceptance. Generated HLS proves Catalog publication, not playback. Phase 04 implements offline composition and a local Apollo Router with private authenticated owner transports; final phase acceptance is in progress. UI and playable film journeys remain planned. Compatible licensing decisions are authorized; ADR-0014 covers Apollo, ADR-0016 fixture tooling and ADR-0017 the local Router. Exact progress lives in `.ai/CURRENT_STATE.md`.

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

Active phase: **Phase 04 — Federated Supergraph**, schema delivery locally verified; Router runtime acceptance in progress.

Read `.ai/CURRENT_STATE.md` and `.ai/WORK_QUEUE.md` for the exact next action.

PR 20 squash `1354841` and post-merge run `33091716358` close Phase 03. `feat/p04-supergraph` is rebased onto released main and remains local. No actual film approval or hosted release is claimed. Keep owner-side authorization and prevent local viewer identity from becoming an operator or hosted trust shortcut.
