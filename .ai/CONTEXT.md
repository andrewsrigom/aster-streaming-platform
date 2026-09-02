# Persistent Project Context

## Product

Aster is a video-on-demand platform for openly licensed films. Its initial value is a reliable browsing and playback experience backed by a rights-aware content pipeline.

## Current implementation state

Phases 00–13 are released locally through protected and exact post-merge CI.
Guarded sessions/profiles, rights-aware Catalog, Apollo Router, public Next.js
SSR, accessible HLS playback, durable progress/resume, owned library and owner
event recovery, Discovery search/home, SSR/private enhancement and advanced
Redis/concurrency, bounded resilience and failure game days pass their recorded
acceptance. Traces, golden signals, executable SLIs/SLOs, alerts, Grafana and
three telemetry-led failure diagnoses also pass. Phase13 GraphQL performance
and security is released. Phase14's local reference-quality track is active;
the hosted capacity/release track remains planned and deferred. Exact progress lives in
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

Active phase: **Phase 14 — Reference Quality, Capacity Validation, and Hosted
Release**, with only the credential-free P14-R13–R18 reference track active.
ADR-0048 keeps hosted P14-R01–R12 planned until explicit owner authorization.
Phase13 final candidate `db17bca`, tree `41650b4`, passed protected run
`33486901296` and a clean final review. PR57 squash main `83cb510` retained that
tree; exact-main run `33489232182` passed every required job and releases
Phase13. Item68 final result `7f1dd6c`, tree `b7398a9`, passed protected run
`33494938005` and clean review. PR58 squash main `e925504` retained that
tree; exact-main run `33495029876` passed and verifies P14-R13. Item69/P14-R14
passed protected PR acceptance and merged through PR60 as main `b3f409b` with
the reviewed tree; exact-main run `33598493566` passed on attempt 2. Item70/
P14-R15 is the active readability-guardrail and bounded-inventory work.

Phase12 final
source `b646e496d0946262a688f34a118a896f6c40ebda`, tree
`789007d5f48d4a16c0a1b47b8e2554e1ee0e294a`, passed protected run
`33346575787` attempt 2 and clean confirmation. PR51 squash main
`2b77a32f43a87fcdfc5032faf856f369de183998` retained that tree; exact-main run
`33348247619` passed every required job and releases Phase12. Item64 final head
`de50b3e` passed protected run `33410126892` and clean confirmation; PR52 squash
main `fb5cf014` retained candidate tree `a78f095`, and exact-main run
`33412728404` passed. Item65 final candidate head `94c17b9`, tree `d034c03`,
passed protected run `33424006919`; all review threads were resolved. PR55
squash main `8cd6c0b` retained that exact tree. Exact-main run `33425758870`
passed on attempt2 after attempt1's isolated TraceQL indexing timeout; every
source and product job was unchanged and cleanup was clean. Item65 is released.
Item66 is released through PR56. ADR-0047, exact runtime/cache classification,
authorized-account Identity admission and optional-Redis readiness are
implemented.
Initial source `a090285`, tree `98d3064`, passed gate54/54; PR56 head `59b7215`
failed protected run `33432579598` and initial review found a durable-retry
admission blocker. Corrected head `82ba630` passed protected run `33437257163`
and resolved that discussion; confirmation discussion `3898385895` found the
30-second marker could expire before the 86,400-second durable receipt. Second
corrected head `1e115fe` passed protected run `33442875698` and resolved that
discussion. Blocker-focused review found a fixed-count retained-union verifier
and missing expired-marker pruning. Third corrected source `af47c62`, tree
`bb2d476`, derives the exact bounded union and prunes before local capacity.
Identity163/163, Router verifier6/6 and gate57/57 with39 cached in66.529 seconds
pass. Third corrected evidence head `e6134ae` passed protected run
`33447062908`; both blocker discussions are resolved and final confirmation
`5485910820` found no major issue. PR56 squash main `98deb52` retained candidate
tree `897c44c`, and exact-main run `33448911764` passed every required job. No
hosted deployment is claimed; Phase14 P14-R01–R12 still own provider and
deployment decisions.

Item67 ran on `feat/p13-n-plus-one-authorization` from released item66 main
`98deb52`. PR57 initial review found owner-local counts and self-asserted audit
semantics. Corrected source `e0f5e27`, tree `da9b02b`, derives semantics during
composition and measures exact persisted documents through Router and all
participating owners. Router26/26, query proof15/15, strict Engagement build and
the full Discovery/Engagement runtimes pass with cleanup0. Evidence is under
`evidence/phase-13/`. Published evidence head `aca2558` entered protected run
`33456003304`; attempts3 and4 repeated the same post-restart Router endpoint
failure. Recovery source `c5ae760`, tree `11b11c2`, uses one bounded 10-second
probe that retries only explicit `SUBREQUEST_HTTP_ERROR`. The repeated Discovery
runtime passed with one recovery attempt in129.793 ms and cleanup0; the final
affected gate passes73/73 with64 cached in52.555 seconds. Published head
`996798b` entered run `33460420680`; all earlier jobs and Local platform passed,
but the Discovery proof showed Compose endpoint replacement cannot be healed by
Router retries. Process-restart source `c5b0eca`, tree `5dadb0a`, preserves and
asserts the container identity/network endpoint. Its full runtime passes with
unchanged counts, exact generation, one recovery attempt in64.738 ms and
cleanup0; its affected gate passes73/73. Published head `be6b57d` entered run
`33462043470`; all earlier jobs and Local platform passed, while the runtime
proved Docker can reassign the same container's direct endpoint. Final source
`02d6739`, tree `6d9e27b`, renews Router DNS, re-resolves the loopback proof port
and retains the finite semantic deadline. Its full runtime passes with unchanged
counts, identities preserved, endpoint/port changes observed, exact generation,
one recovery attempt in269.302 ms and cleanup0; the final affected gate
passes73/73 with61 cached in84.672 seconds. Evidence head `7272f3f` passed
protected run `33463962414`, and both initial discussions are resolved.
Confirmation discussion `3900443731` found nondeterministic rediscovery of a
prior two-row profile. Source `f5fbe29`, tree `4f44b71`, carries the exact setup
profile into measurement without publishing its synthetic ID. Focused proof3/3,
strict Engagement build, the complete runtime and gate73/73 pass; the runtime
records ContinueWatching7 in104.127 ms and cleanup0. Evidence head `10bef1f`
passed protected run `33465978576` attempt2 and the discussion is resolved.
Confirmation discussion `3900633355` found Catalog's cold fence/load plus one
fence-change retry missing from its audited budget. Source `20b5f27`, tree
`700bdc4`, exports and proves the exact four-query owner plan. Published head
`65e5dc2` passed dependency review, documentation/security and Local platform
in run `33468676673`, but clean source quality exposed a build-order type gap.
Final source `1ec01c3`, tree `f27a9f8`, exposes a narrow typed query-plan
subpath. Fresh clean source passes63/63 with0 cached in159.682 seconds and the
affected gate passes73/73 with63 cached in54.731 seconds. Final exact-owner-set
source `a99b3af`, result checkpoint `db17bca`, final review, PR57 squash main
`83cb510` and exact-main run `33489232182` complete the protected, discussion,
confirmation and release gates. Item67 and Phase13 are released.

Read `.ai/CURRENT_STATE.md` and `.ai/WORK_QUEUE.md` for the exact next action.

PR 21 squash `b6c99c4` and successful post-merge run `33104100966` close Phase 04. Initial CI/review findings and corrections remain recorded in its evidence. That historical phase did not approve a film; Phase 06 now has one approval, but no hosted release. Keep owner-side authorization and prevent local viewer identity from becoming an operator or hosted trust shortcut.
