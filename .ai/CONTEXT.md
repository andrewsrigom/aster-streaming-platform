# Persistent Project Context

## Product

Aster is a video-on-demand platform for openly licensed films. Its initial value is a reliable browsing and playback experience backed by a rights-aware content pipeline.

## Current implementation state

Phases 00–11 are released locally through protected and exact post-merge CI.
Guarded sessions/profiles, rights-aware Catalog, Apollo Router, public Next.js
SSR, accessible HLS playback, durable progress/resume, owned library and owner
event recovery, Discovery search/home, SSR/private enhancement and advanced
Redis/concurrency, bounded resilience and failure game days pass their recorded
acceptance. Phase12 observability is active. Exact progress lives in
`.ai/CURRENT_STATE.md`.

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

Active phase: **Phase 12 — Observability, SLIs, and SLOs**. Phase11 is released
through PR44 main `834bf15`. P12 trace/privacy/export, backend signals, browser
QoE and executable SLI/SLO work are released through PR45–48. PR48 final head
`72d5656`, tree `2374279`, passed protected run `33313090638` attempt2, clean
confirmation and squash main `a99d3d5`; exact-main run `33314309449` passed.
P12-R12 is released through PR49 reviewed head `ba3de93`, tree `73ee596`,
protected run `33318672382`, clean confirmation, squash main `c297d32` and valid
exact-main run `33319514232`. P12-R07 is released through corrected source
`8185a81`, evidence head `4b6db71`, protected run `33324696622`, PR50 squash
main `633e819` and exact-main run `33325544350`. P12-R10 is now active on
`feat/p12-diagnostic-exercises` from that exact main. It owns the concrete
bounded trace-backend decision, three telemetry-led injected-failure exercises
and Phase12 closeout. ADR-0044, the bounded Tempo profile, runner, CI selection
and focused tests are implemented. Protected run `33331974187` passed Catalog
diagnosis, PostgreSQL recovery and exact cleanup, then exposed premature V1
trace retrieval before the dependency boundary was query-visible. Corrected run
`33332980729` proved the exact PostgreSQL TraceQL match plus recovery/cleanup,
but its subsequent V2 read remained incomplete; Redis still did not run. The
refined runner classifies the exact finite TraceQL span directly. Real
three-scenario acceptance remains pending. Phase13 has not started.

Read `.ai/CURRENT_STATE.md` and `.ai/WORK_QUEUE.md` for the exact next action.

PR 21 squash `b6c99c4` and successful post-merge run `33104100966` close Phase 04. Initial CI/review findings and corrections remain recorded in its evidence. That historical phase did not approve a film; Phase 06 now has one approval, but no hosted release. Keep owner-side authorization and prevent local viewer identity from becoming an operator or hosted trust shortcut.
