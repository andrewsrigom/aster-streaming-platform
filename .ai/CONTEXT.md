# Persistent Project Context

## Product

Aster is a video-on-demand platform for openly licensed films. Its initial value is a reliable browsing and playback experience backed by a rights-aware content pipeline.

## Current implementation state

Phases 00–07 are released locally through protected and exact post-merge CI. Guarded sessions/profiles, rights-aware Catalog, Apollo Router, public Next.js SSR and the accessible HLS player run in Docker. The one-command generated playable demo includes captioned media, initialization, readiness and safe replay. The old browse seed is non-delivery. Phase 08 has tested progress domain/application, PostgreSQL and real owner-authorized federated Docker saves. Backend release and player integration remain pending. Exact progress lives in `.ai/CURRENT_STATE.md`.

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

Active phase: **Phase 08 — Progress, History, Watchlist, and Continue-Watching**. P08-R01/R06/R07/R08 are DONE; PR29 squash d7fa03a and exact main push33199190529 pass. R09/R10/R12 is the sole active item on feat/p08-event-delivery. Strict/focused/real SQL checks, Kafka outage/recovery observations, 70/70 candidate tasks and exact-base composition pass. Corrected SIGTERM validation passes against captured owner states/logs; protected execution of the complete supervisor and review/release remain. Browser reports/resume follow. No unchanged CPU/media/browser experiment is required.

Read `.ai/CURRENT_STATE.md` and `.ai/WORK_QUEUE.md` for the exact next action.

PR 21 squash `b6c99c4` and successful post-merge run `33104100966` close Phase 04. Initial CI/review findings and corrections remain recorded in its evidence. That historical phase did not approve a film; Phase 06 now has one approval, but no hosted release. Keep owner-side authorization and prevent local viewer identity from becoming an operator or hosted trust shortcut.
