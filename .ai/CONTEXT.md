# Persistent Project Context

## Product

Aster is a video-on-demand platform for openly licensed films. Its initial value is a reliable browsing and playback experience backed by a rights-aware content pipeline.

## Current implementation state

Phases 00–10 are released locally through protected and exact post-merge CI.
Guarded sessions/profiles, rights-aware Catalog, Apollo Router, public Next.js
SSR, accessible HLS playback, durable progress/resume, owned library and owner
event recovery, Discovery search/home, SSR/private enhancement and advanced
Redis/concurrency pass their recorded acceptance. Phase11 closeout is externally
gated and Phase12 observability is active as its unpublished dependent. Exact
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

Active phase: **Phase 12 — Observability, SLIs, and SLOs**. Phase10 closed
through PR40 exact `6d74873`, protected run33281516077, resolved exact-head
review, squash main `eed8229` and exact-main run33282217705. P11-R01 is released
as `ebdcb18`; exact-main run33285339274 passed. P11-R05 is released as main
`59600ae`; exact-main run33290477608 passed. P11-R08/R09 is released through
evidence head `371ba55`, clean confirmation, protected run33291705269, PR43
squash main `bdbe2e0` and successful exact-main run33292389504. P11-R10 is
frozen `WAITING_EXTERNAL` on PR44 at corrected executable source `aac04c7`. Its
five game days, finite-capacity, fallback/no-amplification evidence and runbooks
are implemented; review's retry-guard findings are corrected and
protected confirmation/release remain. P12-R01 is active locally and cannot
publish before PR44 releases.

Read `.ai/CURRENT_STATE.md` and `.ai/WORK_QUEUE.md` for the exact next action.

PR 21 squash `b6c99c4` and successful post-merge run `33104100966` close Phase 04. Initial CI/review findings and corrections remain recorded in its evidence. That historical phase did not approve a film; Phase 06 now has one approval, but no hosted release. Keep owner-side authorization and prevent local viewer identity from becoming an operator or hosted trust shortcut.
