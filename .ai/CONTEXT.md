# Persistent Project Context

## Product

Aster is a video-on-demand platform for openly licensed films. Its initial value is a reliable browsing and playback experience backed by a rights-aware content pipeline.

## Current implementation state

Phases 00–12 are released locally through protected and exact post-merge CI.
Guarded sessions/profiles, rights-aware Catalog, Apollo Router, public Next.js
SSR, accessible HLS playback, durable progress/resume, owned library and owner
event recovery, Discovery search/home, SSR/private enhancement and advanced
Redis/concurrency, bounded resilience and failure game days pass their recorded
acceptance. Traces, golden signals, executable SLIs/SLOs, alerts, Grafana and
three telemetry-led failure diagnoses also pass. Phase13 GraphQL performance
and security is active. Exact progress lives in
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

Active phase: **Phase 13 — GraphQL Performance and Security**. Phase12 final
source `b646e496d0946262a688f34a118a896f6c40ebda`, tree
`789007d5f48d4a16c0a1b47b8e2554e1ee0e294a`, passed protected run
`33346575787` attempt 2 and clean confirmation. PR51 squash main
`2b77a32f43a87fcdfc5032faf856f369de183998` retained that tree; exact-main run
`33348247619` passed every required job and releases Phase12. Item64 final head
`de50b3e` passed protected run `33410126892` and clean confirmation; PR52 squash
main `fb5cf014` retained candidate tree `a78f095`, and exact-main run
`33412728404` passed. Item65 is the sole active item on
`feat/p13-graphql-demand-controls`, rebased onto that release. Source `36b6af2`,
tree `e8fc58b`, owns parser, shape, list, cost and environment controls and
opened PR55. Initial run `33415238912` and review found a runtime-verifier status
mismatch and an encoded-request boundary gap. Corrected source `96dc6ea`, tree
`c708f9e`, passes Router19/19, verifier2/2 and the affected gate51/51. Corrected
run `33416680451` then exposed only the verifier's guessed introspection error
code/location; source `55875ce`, tree `9ac71a9`, now asserts pinned Router's
exact sanitized `UNAVAILABLE` response and passes the repeated gate51/51. Exact
head `0fd6c78` passed protected run `33417515807`; initial discussion
`3896477418` is resolved. Confirmation discussion `3896804794` found implicit
fallback could hide removed non-root entity field cost. Source `8395f79`, tree
`0a026a6a`, now requires direct cost on every selected field of a cost-owned
type; Router20/20 and gate51/51 with32 cached in88.328 seconds pass without
changing calibrated profiles. Exact head `9f23640` passed protected run
`33420810495` attempt2; both threads are resolved and confirmation comment
`5482516972` found no major issue. Release remains. No hosted deployment is
claimed; Phase14 still owns provider and deployment decisions.

Read `.ai/CURRENT_STATE.md` and `.ai/WORK_QUEUE.md` for the exact next action.

PR 21 squash `b6c99c4` and successful post-merge run `33104100966` close Phase 04. Initial CI/review findings and corrections remain recorded in its evidence. That historical phase did not approve a film; Phase 06 now has one approval, but no hosted release. Keep owner-side authorization and prevent local viewer identity from becoming an operator or hosted trust shortcut.
