# Current State

Last updated: 2026-09-02

## Active phase

**Phase 14 — Reference Quality, Capacity Validation, and Hosted Release**

Status: **IN_PROGRESS**. Phases00–13 are released. The credential-free
reference track P14-R13–R18 is active under ADR-0048. Hosted P14-R01–R12 remains
planned and requires explicit owner authorization for providers, credentials,
paid resources, and public endpoints.

Items69/P14-R14 and70/P14-R15 are verified. Item71/P14-R16 is the sole
`IN_PROGRESS` item on `refactor/catalog-playback-readability`, worktree
`/tmp/aster-readability-catalog-playback`, from exact PR61 squash main
`3858bcb`.

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

The authoritative Phase14 chronology is in
[`evidence/phase-14/README.md`](../evidence/phase-14/README.md). No hosted
deployment, production capacity, or broader media rights are claimed.

## Current work

Item71 closes only the two P0 inventory findings owned by Catalog and Playback.
The Catalog slice now names command decisions, lifecycle conversion, transaction
execution, takedown-capacity predicates, and publication effects. Concrete
helpers separate draft content, rights withdrawal, rights review, and
publication changes; the transaction exposes validation, replay, capacity,
decision, durable-write, event, receipt, and publication-revalidation phases.
The Playback slice now names dependency settlement and the point after which a
failed session write is indeterminate, with explicit failure-result branches.

The work is behavior-preserving. Catalog remains the owner of titles, rights,
publication, audits, receipts, and outbox events. Playback remains the owner of
sessions and performs the same one bounded Catalog lookup before one durable
write. Public contracts, schemas, events, persistence, cache, media, telemetry,
dependencies, and deployment remain unchanged.

The pre-edit and post-edit linked characterization suite passes 15/15. The
complete Catalog package passes 249 tests, Playback passes 42 tests, both
affected builds and typechecks pass, changed-file lint passes, and architecture
validation reports zero violations. Source `ef9e866`, tree `2c48e62`, passes
the affected-scope candidate gate 43/43 with 10 cached tasks in 62.095 seconds.
Protected PR62 workflow `33605355037` passes every applicable job. Initial
review found two evidence defects, both corrected together: the planned-evidence
list no longer includes completed P14-R15, and exact commands plus raw output are
retained in `evidence/phase-14/p14-r16-readability.txt`. The remediation gate
passes 43/43 with 32 cached in 40 seconds. Confirmation found one stale handoff
instruction, which is corrected without changing product source. Final
exact-head checks, merge, and exact-main acceptance remain.

## Ordered reference-quality runway

1. item68 — P14-R13 reference-first runway: verified;
2. item69 — P14-R14 capability index: verified;
3. item70 — P14-R15 readability guardrails and inventory: verified;
4. item71 — P14-R16 Catalog and Playback reading slices: active;
5. item72 — P14-R16 Identity, Engagement, and Discovery reading slices;
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

Item71 changes private application names and local control-flow structure only.
Existing PostgreSQL, Redis, broker, browser, media, and Docker evidence remains
applicable unless the refactor changes transaction order, dependency work,
deadlines, contracts, or other behavior that evidence measured. Preserve
retained data, media, unrelated Docker projects, credentials, and host processes.

## Current risks

- Generic renames can accidentally hide or change authorization, rights,
  cancellation, idempotency, retry, or uncertain-commit behavior.
- A broad cleanup can invalidate useful evidence and make review harder.
- Formatting churn can obscure the actual naming or flow improvement.
- Reference-track status can be mistaken for hosted release status.

The guardrails require owner-scoped slices, characterization first, formatter-
owned whitespace, and explicit preserved behavior.

## Next outcome

Complete item71/P14-R16: publish the exact evidenced candidate, complete one
review and one confirmation, merge, and verify exact main.
