# Persistent Project Context

## Product

Aster is a video-on-demand platform for openly licensed films. Its initial value is a reliable browsing and playback experience backed by a rights-aware content pipeline.

## Current implementation state

Phases 00–02 are released. Guarded local Federation v2 sessions/profiles and transactional audit/outbox run in Docker with protected/post-merge acceptance. Phase 03 has Catalog rights/lifecycle rules and locally tested PostgreSQL rights/provenance history. Operator/public API, Router, UI and playable journeys remain planned. Compatible licensing decisions are authorized without another permission pause; ADR-0014 covers Apollo. Exact progress lives in `.ai/CURRENT_STATE.md`.

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

Active phase: **Phase 03 — Catalog and Content Rights**

Read `.ai/CURRENT_STATE.md` and `.ai/WORK_QUEUE.md` for the exact next action.

PR 19 squash `ec6386c` and post-merge run `33066827332` close Phase 02. Phase 03 continues locally on `feat/p03-catalog-rights`; no Catalog runtime or media approval is claimed. Keep owner-side authorization and prevent local viewer identity from becoming an operator or hosted trust shortcut.
