# Current State

Last updated: 2026-09-02

## Active phase

**Phase 14 — Reference Quality, Capacity Validation, and Hosted Release**

Status: **IN_PROGRESS**. Phases00–13 are released. The credential-free
reference track P14-R13–R18 is active under ADR-0048. Hosted P14-R01–R12 remains
planned and requires explicit owner authorization for providers, credentials,
paid resources, and public endpoints.

Items69/P14-R14,70/P14-R15, and71/P14-R16 are verified. Item72/P14-R16 is the
sole `IN_PROGRESS` item on `refactor/identity-engagement-discovery-readability`,
worktree `/tmp/aster-readability-identity-engagement-discovery`, from exact
PR62 squash main `34a32c4`.

## Verified

- Phases00–13 retain their linked protected and exact-main acceptance evidence.
- Item68/P14-R13 is verified through PR58 squash main `e925504` and exact-main
  run `33495029876`.
- Item69's reviewed tree `f57a2e5` passed protected PR run `33596017500` on
  attempt 3. Every PR60 discussion is resolved. PR60 squash main
  `b3f409b15ce9da2889850b693b033f69fbd312cd` retains that exact tree.
- Exact-main run `33598493566` passed on attempt 2. Attempt 1's unchanged
  Catalog TraceQL diagnostic search timed out and completed clean project-scoped
  cleanup; the failed-only rerun passed Local platform and the aggregate gate.
- Item70 final head `6de5a1d`, tree `448be36`, passed protected workflow
  `33602958653`; all three discussions are resolved. PR61 squash main `3858bcb`
  retains the exact tree, and exact-main workflow `33603027919` passed.
- Item71 final head `c03745d`, tree `07641d9`, passed protected workflow
  `33609186840` on attempt 2; all three discussions are resolved. PR62 squash
  main `34a32c4` retains the exact tree, and exact-main workflow `33612201728`
  passed every applicable job.

The authoritative Phase14 chronology is in
[`evidence/phase-14/README.md`](../evidence/phase-14/README.md). No hosted
deployment, production capacity, or broader media rights are claimed.

## Current work

Item72 closes only the three inventory findings owned by Identity and Profiles,
Engagement, and Discovery. The selected slices are the profile transaction,
progress write, and home-rail assembly. Identity now names its authorized
transaction, owned-profile lookup, mutation input, replay, capacity, state,
event, and receipt phases. Engagement names dependency-snapshot freshness,
late settlement, receipt replay, admission, Playback context, transaction
result, and the `progressWriteStarted` uncertain-commit boundary. Discovery
names each fixed/genre selection, rail assembly, recent-content fallback,
per-rail observation, usable-result count, and aggregate failure precedence;
numeric selection indexes are removed.

The work is behavior-preserving. Identity remains the owner of sessions and
profiles; Engagement remains the owner of progress, receipts, and its outbox;
Discovery remains the owner of its home projection and response assembly.
Public contracts, schemas, events, persistence, cache, media, telemetry,
dependencies, and deployment remain unchanged. Linked characterization runs
pass 47/47 before and after implementation. Complete Identity tests pass
163/163, Engagement passes 129/129, and Discovery passes 110/110. All three
affected builds and typechecks, changed-file lint, and architecture validation
pass. The affected-scope candidate gate passes 44/44 tasks with 12 cached tasks
in 1m4.03s. Exact source `6239362`, tree `217aaf6`, repeats it with 33 cached
tasks in 39.287 seconds. Evidence head `1e45071` passed protected workflow
`33616377473`. Initial review found one stale repository-memory resume action;
the correction changes documentation only. Corrected exact-head checks,
discussion resolution, confirmation, merge, and exact-main acceptance remain.

## Ordered reference-quality runway

1. item68 — P14-R13 reference-first runway: verified;
2. item69 — P14-R14 capability index: verified;
3. item70 — P14-R15 readability guardrails and inventory: verified;
4. item71 — P14-R16 Catalog and Playback reading slices: verified;
5. item72 — P14-R16 Identity, Engagement, and Discovery reading slices: active;
6. item73 — P14-R16 Router, Web, and tooling reading slices;
7. item74 — P14-R17 rationale comments, executable examples, and reading paths;
8. item75 — P14-R18 fresh-checkout and Docker reference acceptance.

The exact queue and activation states live in
[`WORK_QUEUE.md`](WORK_QUEUE.md).

## Verified local capabilities

The released local baseline includes:

- guarded sessions and profile ownership;
- rights-aware Catalog ingestion and publication;
- bounded federated GraphQL through Apollo Router;
- public server rendering and accessible HLS playback;
- durable progress, resume, watchlist, and viewing history;
- owner events, idempotent recovery, and explicit Redis degradation;
- search and independent home rails;
- structured telemetry, executable SLI/SLO rules, alerts, dashboards, and
  telemetry-led diagnosis;
- a Docker-only playable demonstration with project-scoped cleanup.

These are local repository claims backed by phase evidence, not hosted or
commercial-catalog claims.

## Not implemented

- P14-R16 is not verified until all owner and cross-cutting slices in items71–73
  pass their protected and exact-main gates.
- P14-R17 journey examples and final rationale-comment alignment are planned.
- P14-R18 fresh-reference acceptance is planned.
- Hosted P14-R01–R12 remains planned and inactive.

## Runtime and recovery

Use WSL Git and Node.js24.19.0/pnpm11.24.0 from
`/mnt/c/Users/andre/.cache/aster-node-24.19.0`. Never use a branch beginning
with `codex/`.

Item72 changes private application names and local control-flow structure only.
Existing PostgreSQL, Redis, broker, browser, media, and Docker evidence remains
applicable unless the refactor changes transaction order, dependency work,
deadlines, contracts, telemetry shape, fallback policy, or other behavior that
evidence measured. Preserve retained data, media, unrelated Docker projects,
credentials, and host processes.

## Current risks

- Generic renames can accidentally hide or change authorization, rights,
  cancellation, idempotency, retry, or uncertain-commit behavior.
- A broad cleanup can invalidate useful evidence and make review harder.
- Formatting churn can obscure the actual naming or flow improvement.
- Reference-track status can be mistaken for hosted release status.

The guardrails require owner-scoped slices, characterization first, formatter-
owned whitespace, and explicit preserved behavior.

## Next outcome

Complete item72/P14-R16: characterize and refactor the three selected owner
slices, pass focused and affected-scope gates, complete one review and one
confirmation, merge, and verify exact main.
