# Current State

Last updated: 2026-09-02

## Active phase

**Phase 14 — Reference Quality, Capacity Validation, and Hosted Release**

Status: **IN_PROGRESS**. Phases00–13 are released. The credential-free
reference track P14-R13–R18 is active under ADR-0048. Hosted P14-R01–R12 remains
planned and requires explicit owner authorization for providers, credentials,
paid resources, and public endpoints.

Item69/P14-R14 is verified. Item70/P14-R15 is the sole `IN_PROGRESS` item on
`docs/readability-guardrails`, worktree `/tmp/aster-readability`, from exact
PR60 squash main `b3f409b`.

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

The authoritative Phase14 chronology is in
[`evidence/phase-14/README.md`](../evidence/phase-14/README.md). No hosted
deployment, production capacity, or broader media rights are claimed.

## Current work

Item70 defines repository-owned readability guardrails and a finite inventory
before product code changes. The draft standard separates executable formatting,
lint, type, unused-code, architecture, and test controls from reviewable rules
for domain names, control-flow phases, layout, comments, fixtures, and examples.

The inventory contains nine concrete findings across Catalog, Playback,
Identity, Engagement, Discovery, Router, Web, repository tooling, and reading
guidance. Every finding names its reader problem, owner, preserved requirements,
characterization proof, priority, and owning follow-up item. File size and
personal style are not acceptance criteria.

Focused documentation tests pass 37/37 and repository-memory tests pass 13/13.
Documentation validation covers 251 documents, 2,901 headings, 1,703 links,
four supported status claims, and all eleven capability rows. Changed-file
formatting and diff checks pass. Source checkpoint `66db1ce`, tree `754cc39`,
passes the affected-scope candidate gate 7/7 with zero cached tasks. Protected
PR workflow `33601388742` passed on published head `1e40ce3`. The initial review
found two repository-memory defects: an already-completed commit instruction and
a non-canonical maturity label. Both are corrected locally. Confirmation review
found one remaining status-grouping defect, now corrected locally. Final
correction source `6668421` passed protected workflow `33602708481`, and all
three discussions are resolved. Result-checkpoint publication, merge, and
exact-main acceptance remain.

No source, GraphQL, schema, persistence, event, cache, media, runtime, telemetry,
dependency, or deployment behavior changes in item70.

## Ordered reference-quality runway

1. item68 — P14-R13 reference-first runway: verified;
2. item69 — P14-R14 capability index: verified;
3. item70 — P14-R15 readability guardrails and inventory: active;
4. item71 — P14-R16 Catalog and Playback reading slices;
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

## Implemented, not verified

- P14-R15 is implemented: the readability standard and bounded inventory exist
  and their focused checks pass. Verification remains pending until the final
  protected and exact-main release gates pass.

## Not implemented

- P14-R16 representative source refactors have not started.
- P14-R17 journey examples and final rationale-comment alignment are planned.
- P14-R18 fresh-reference acceptance is planned.
- Hosted P14-R01–R12 remains planned and inactive.

## Runtime and recovery

Use WSL Git and Node.js24.19.0/pnpm11.24.0 from
`/mnt/c/Users/andre/.cache/aster-node-24.19.0`. Never use a branch beginning
with `codex/`.

Item70 is documentation-only. Existing PostgreSQL, Redis, broker, browser,
media, and Docker evidence remains applicable. Repeat heavyweight evidence only
after a later executable change can affect what it measured. Preserve retained
data, media, unrelated Docker projects, credentials, and host processes.

## Current risks

- Generic renames can accidentally hide or change authorization, rights,
  cancellation, idempotency, retry, or uncertain-commit behavior.
- A broad cleanup can invalidate useful evidence and make review harder.
- Formatting churn can obscure the actual naming or flow improvement.
- Reference-track status can be mistaken for hosted release status.

The guardrails require owner-scoped slices, characterization first, formatter-
owned whitespace, and explicit preserved behavior.

## Next outcome

Complete and verify item70/P14-R15: publish the confirmation-review correction,
merge, verify exact main, then activate item71 for the first behavior-preserving
Catalog and Playback slice.
